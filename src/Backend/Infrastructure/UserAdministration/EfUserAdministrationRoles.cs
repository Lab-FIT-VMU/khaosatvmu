using System.Text.RegularExpressions;
using Application.UserAdministration;
using Domain;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.UserAdministration;

/// <summary>
/// Thêm, sửa, xóa vai trò. Vai trò quyết định quyền module (RolePermissions), phạm vi dữ
/// liệu và quyền ghi; tối đa <see cref="RoleRules.MaximumRoles"/> vai trò cùng lúc.
/// </summary>
public sealed partial class EfUserAdministrationService
{
    public async Task<AdminOperationResult<AdminRoleDto>> CreateRoleAsync(
        SaveRoleCommand command,
        CancellationToken cancellationToken = default)
    {
        if (await db.Roles.CountAsync(cancellationToken) >= RoleRules.MaximumRoles)
        {
            return Failure<AdminRoleDto>(UserAdministrationErrorCodes.RoleLimitReached);
        }

        var validation = await ValidateRoleAsync(command, null, cancellationToken);
        if (validation.ErrorCode is not null)
        {
            return Failure<AdminRoleDto>(validation.ErrorCode);
        }

        var role = new Role
        {
            Id = Guid.NewGuid(),
            // Mã nội bộ không hiện cho người dùng; chỉ cần duy nhất kể cả với dòng đã xóa.
            Code = "ROLE_" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant(),
            Name = validation.Name,
            Description = validation.Description,
            DataScope = validation.DataScope,
            CanWrite = validation.CanWrite,
            ProfileCodeSuffix = validation.Suffix,
            IsSystem = false,
        };
        db.Roles.Add(role);
        await db.SaveChangesAsync(cancellationToken);

        return Success(ToRoleDto(role, 0));
    }

    public async Task<AdminOperationResult<AdminRoleDto>> UpdateRoleAsync(
        Guid roleId,
        SaveRoleCommand command,
        CancellationToken cancellationToken = default)
    {
        var role = await db.Roles.SingleOrDefaultAsync(x => x.Id == roleId, cancellationToken);
        if (role is null)
        {
            return Failure<AdminRoleDto>(UserAdministrationErrorCodes.RoleNotFound);
        }

        var validation = await ValidateRoleAsync(command, roleId, cancellationToken);
        if (validation.ErrorCode is not null)
        {
            return Failure<AdminRoleDto>(validation.ErrorCode);
        }

        // ADMIN luôn thấy và ghi toàn trường: thu hẹp nó là không còn ai vào được trang
        // phân quyền để sửa lại.
        if (string.Equals(role.Code, RequiredRolePermissions.AdminRoleCode, StringComparison.OrdinalIgnoreCase)
            && (validation.DataScope != RoleDataScopes.All || !validation.CanWrite))
        {
            return Failure<AdminRoleDto>(UserAdministrationErrorCodes.AdminRoleScopeLocked);
        }

        var renamed = role.Name != validation.Name;
        role.Name = validation.Name;
        role.Description = validation.Description;
        role.DataScope = validation.DataScope;
        role.CanWrite = validation.CanWrite;
        role.ProfileCodeSuffix = validation.Suffix;

        // Tên hồ sơ là tên vai trò. Mã hồ sơ đã cấp giữ nguyên: đổi hậu tố chỉ áp cho hồ sơ mới.
        if (renamed)
        {
            await db.UserProfiles
                .Where(x => x.RoleId == roleId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.ProfileName, validation.Name)
                    .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);

        var activeProfiles = await db.UserProfiles.CountAsync(x => x.RoleId == roleId && x.IsActive, cancellationToken);
        return Success(ToRoleDto(role, activeProfiles));
    }

    public async Task<AdminOperationResult<RoleDeletionDto>> DeleteRoleAsync(
        Guid roleId,
        Guid actorUserId,
        Guid actorProfileId,
        CancellationToken cancellationToken = default)
    {
        var role = await db.Roles.SingleOrDefaultAsync(x => x.Id == roleId, cancellationToken);
        if (role is null)
        {
            return Failure<RoleDeletionDto>(UserAdministrationErrorCodes.RoleNotFound);
        }

        if (role.IsSystem)
        {
            return Failure<RoleDeletionDto>(UserAdministrationErrorCodes.RoleSystemLocked);
        }

        // Xóa vai trò của chính hồ sơ đang dùng là tự đăng xuất mình giữa chừng thao tác.
        if (await db.UserProfiles.AnyAsync(x => x.Id == actorProfileId && x.RoleId == roleId, cancellationToken))
        {
            return Failure<RoleDeletionDto>(UserAdministrationErrorCodes.CannotDeleteOwnRole);
        }

        // Tắt hồ sơ, xóa vai trò và chọn lại hồ sơ mặc định phải cùng sống hoặc cùng chết.
        var ownTransaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        await using var transactionScope = ownTransaction;

        // Vô hiệu hóa mọi hồ sơ đang bật của vai trò này, giống hệt thao tác tắt từng hồ sơ
        // trên màn quản trị: tắt, bỏ mặc định, đăng xuất phiên đang dùng hồ sơ đó.
        var profiles = await db.UserProfiles
            .Where(x => x.RoleId == roleId && x.IsActive)
            .ToListAsync(cancellationToken);
        var userIds = profiles.Select(x => x.UserId).Distinct().ToList();
        var users = await db.Users
            .Where(x => userIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        var now = DateTime.UtcNow;

        foreach (var profile in profiles)
        {
            profile.IsActive = false;
            profile.IsDefault = false;
            profile.UpdatedAt = now;
            users[profile.UserId].UpdatedAt = now;
            AddAudit(users[profile.UserId], profile, "ADMIN_PROFILE_DISABLED", actorUserId, new
            {
                profile.IsActive,
                reason = "ROLE_DELETED",
                roleId,
                roleName = role.Name,
            });
            await RevokeProfileSessionsAsync(profile.Id, "ROLE_DELETED", cancellationToken);
        }

        // Xóa mềm: dòng vẫn còn để hồ sơ cũ và nhật ký vẫn đọc ra được tên vai trò. Gán
        // thẳng chứ không Remove(): hồ sơ đang được theo dõi trỏ vào vai trò bằng khóa ngoại
        // bắt buộc, Remove() làm EF tưởng phải cắt quan hệ đó.
        role.IsDeleted = true;
        role.DeletedAt = now;
        await db.SaveChangesAsync(cancellationToken);

        // Tài khoản vừa mất hồ sơ mặc định thì lấy hồ sơ đang bật khác làm mặc định.
        var usersWithoutProfile = 0;
        foreach (var userId in userIds)
        {
            var remaining = await db.UserProfiles
                .Where(x => x.UserId == userId && x.IsActive)
                .OrderByDescending(x => x.IsDefault)
                .ThenBy(x => x.CreatedAt)
                .ToListAsync(cancellationToken);
            if (remaining.Count == 0)
            {
                usersWithoutProfile++;
                continue;
            }

            if (!remaining[0].IsDefault)
            {
                remaining[0].IsDefault = true;
                remaining[0].UpdatedAt = now;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        if (ownTransaction is not null)
        {
            await ownTransaction.CommitAsync(cancellationToken);
        }

        return Success(new RoleDeletionDto(profiles.Count, usersWithoutProfile));
    }

    private sealed record RoleValidation(
        string? ErrorCode,
        string Name,
        string? Description,
        string DataScope,
        bool CanWrite,
        string Suffix);

    private async Task<RoleValidation> ValidateRoleAsync(
        SaveRoleCommand command,
        Guid? exceptRoleId,
        CancellationToken cancellationToken)
    {
        var name = (command.Name ?? string.Empty).Trim();
        var description = string.IsNullOrWhiteSpace(command.Description) ? null : command.Description.Trim();
        var scope = (command.DataScope ?? string.Empty).Trim().ToUpperInvariant();
        var suffix = (command.ProfileCodeSuffix ?? string.Empty).Trim().ToUpperInvariant();

        RoleValidation Invalid(string code) => new(code, name, description, scope, command.CanWrite, suffix);

        if (name.Length == 0 || name.Length > 200) return Invalid(UserAdministrationErrorCodes.RoleNameRequired);
        if (!RoleDataScopes.IsValid(scope)) return Invalid(UserAdministrationErrorCodes.RoleScopeInvalid);
        if (scope == RoleDataScopes.Own && command.CanWrite) return Invalid(UserAdministrationErrorCodes.RoleOwnScopeCannotWrite);
        if (!SuffixPattern().IsMatch(suffix)) return Invalid(UserAdministrationErrorCodes.RoleSuffixInvalid);

        var others = await db.Roles
            .Where(x => exceptRoleId == null || x.Id != exceptRoleId)
            .Select(x => new { x.Name, x.ProfileCodeSuffix })
            .ToListAsync(cancellationToken);
        if (others.Any(x => string.Equals(x.Name.Trim(), name, StringComparison.OrdinalIgnoreCase)))
        {
            return Invalid(UserAdministrationErrorCodes.RoleNameExists);
        }
        if (others.Any(x => string.Equals(x.ProfileCodeSuffix, suffix, StringComparison.OrdinalIgnoreCase)))
        {
            return Invalid(UserAdministrationErrorCodes.RoleSuffixExists);
        }

        return new RoleValidation(null, name, description, scope, command.CanWrite, suffix);
    }

    private static AdminRoleDto ToRoleDto(Role role, int activeProfileCount) => new(
        role.Id,
        role.Code,
        role.Name,
        role.Description,
        role.DataScope,
        role.CanWrite,
        role.ProfileCodeSuffix,
        role.IsSystem,
        activeProfileCount);

    [GeneratedRegex("^[A-Z0-9]{2,4}$")]
    private static partial Regex SuffixPattern();
}
