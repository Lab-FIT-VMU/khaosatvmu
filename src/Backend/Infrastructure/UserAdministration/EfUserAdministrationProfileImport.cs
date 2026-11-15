using Application.UserAdministration;
using Domain;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.UserAdministration;

/// <summary>
/// Hai đường cấp hồ sơ hàng loạt: một cú bấm cho mức Giảng viên, và tệp Excel cho
/// các vai trò còn lại. Tách sang file riêng để phần quản trị tài khoản không phình
/// thêm; vẫn là cùng một lớp <see cref="EfUserAdministrationService"/>.
/// </summary>
public sealed partial class EfUserAdministrationService
{
    public async Task<AdminOperationResult<AdminProfileImportDto>> BulkCreateLecturerProfilesAsync(
        Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        var role = await db.Roles
            .SingleOrDefaultAsync(x => x.Code == Application.Auth.RoleCodes.Lecturer, cancellationToken);
        if (role is null)
        {
            return Failure<AdminProfileImportDto>(UserAdministrationErrorCodes.RoleNotFound);
        }

        // Chỉ tài khoản CHƯA có hồ sơ nào. Tài khoản đã có hồ sơ khác (trưởng bộ môn
        // chẳng hạn) thì không tự thêm thêm hồ sơ giảng viên cho họ — đó là quyết định
        // của quản trị, không phải việc của một nút bấm hàng loạt.
        var candidates = await db.Users
            .Where(x => x.LecturerId != null
                        && x.IsActive
                        && !db.UserProfiles.Any(profile => profile.UserId == x.Id))
            .OrderBy(x => x.Email)
            .ToListAsync(cancellationToken);

        if (candidates.Count == 0)
        {
            // Nút hàng loạt phải gọi lặp an toàn. Sau lần cấp đầu tiên, không còn ứng viên
            // là trạng thái bình thường chứ không phải lỗi nghiệp vụ.
            return Success(new AdminProfileImportDto(0, 0, 0, []));
        }

        var items = new List<AdminProfileImportItemDto>(candidates.Count);
        var created = 0;
        var now = DateTime.UtcNow;

        foreach (var user in candidates)
        {
            var code = await GenerateNextProfileCodeAsync(role.ProfileCodeSuffix, cancellationToken);

            AddProfile(user, role.Id, role.Name, code, isDefault: true, now, actorUserId);
            items.Add(new AdminProfileImportItemDto(0, user.Email, true, null));
            created++;
        }

        if (created > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return Success(new AdminProfileImportDto(
            candidates.Count,
            created,
            candidates.Count - created,
            items));
    }

    public async Task<AdminOperationResult<AdminProfileImportDto>> ImportProfilesAsync(
        IReadOnlyList<ImportAdminProfileRowCommand> commands,
        Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        if (commands.Count == 0)
        {
            return Failure<AdminProfileImportDto>(UserAdministrationErrorCodes.InvalidRequest);
        }

        // Tệp ghi vai trò bằng tên tiếng Việt hoặc mã; vai trò người quản trị tự thêm cũng
        // tra được vì đọc thẳng từ bảng.
        var roleList = await db.Roles.ToListAsync(cancellationToken);
        Role? RoleFromLabel(string? label)
        {
            var text = (label ?? string.Empty).Trim();
            return text.Length == 0
                ? null
                : roleList.FirstOrDefault(x =>
                    string.Equals(x.Name, text, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(x.Code, text, StringComparison.OrdinalIgnoreCase));
        }

        var emails = commands
            .Select(x => (x.Email ?? string.Empty).Trim().ToLowerInvariant())
            .Where(x => x.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var usersByEmail = (await db.Users
                .Where(x => emails.Contains(x.Email.ToLower()))
                .ToListAsync(cancellationToken))
            .ToDictionary(x => x.Email, x => x, StringComparer.OrdinalIgnoreCase);

        // Cặp (tài khoản, vai trò) đã có hồ sơ. Ràng buộc duy nhất của cơ sở dữ liệu
        // cũng theo cặp này, nên chặn trước ở đây để báo được đúng dòng nào trùng.
        var existingPairs = (await db.UserProfiles
                .Select(x => new { x.UserId, x.RoleId })
                .ToListAsync(cancellationToken))
            .Select(x => (x.UserId, x.RoleId))
            .ToHashSet();

        var items = new List<AdminProfileImportItemDto>(commands.Count);
        var created = 0;
        var now = DateTime.UtcNow;

        foreach (var command in commands.OrderBy(x => x.RowNumber))
        {
            var email = (command.Email ?? string.Empty).Trim().ToLowerInvariant();

            if (email.Length == 0)
            {
                items.Add(Reject(command, email, UserAdministrationErrorCodes.ImportEmailRequired));
                continue;
            }

            if (!usersByEmail.TryGetValue(email, out var user))
            {
                items.Add(Reject(command, email, UserAdministrationErrorCodes.UserNotFound));
                continue;
            }

            var role = RoleFromLabel(command.RoleLabel);
            if (role is null)
            {
                items.Add(Reject(command, email, UserAdministrationErrorCodes.ImportRoleInvalid));
                continue;
            }

            if (!existingPairs.Add((user.Id, role.Id)))
            {
                items.Add(Reject(command, email, UserAdministrationErrorCodes.ImportProfileExists));
                continue;
            }

            var code = await GenerateNextProfileCodeAsync(role.ProfileCodeSuffix, cancellationToken);

            // Hồ sơ đầu tiên của tài khoản mặc nhiên là hồ sơ mặc định, giống hệt
            // đường tạo thủ công — không có hồ sơ mặc định thì không đăng nhập được.
            var isFirst = !db.UserProfiles.Local.Any(x => x.UserId == user.Id)
                          && !await db.UserProfiles.AnyAsync(x => x.UserId == user.Id, cancellationToken);

            AddProfile(user, role.Id, role.Name, code, isFirst, now, actorUserId);
            items.Add(new AdminProfileImportItemDto(command.RowNumber, email, true, null));
            created++;
        }

        if (created > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return Success(new AdminProfileImportDto(
            commands.Count,
            created,
            commands.Count - created,
            items));
    }

    private static AdminProfileImportItemDto Reject(
        ImportAdminProfileRowCommand command,
        string email,
        string errorCode) =>
        new(command.RowNumber, email, false, errorCode);

    private void AddProfile(
        User user,
        Guid roleId,
        string name,
        string code,
        bool isDefault,
        DateTime now,
        Guid actorUserId)
    {
        var profile = new UserProfile
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            RoleId = roleId,
            ProfileName = name,
            ProfileCode = code,
            OrganizationUnitCode = null,
            OrganizationUnitName = null,
            IsActive = true,
            IsDefault = isDefault,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.UserProfiles.Add(profile);
        user.UpdatedAt = now;
        AddAudit(user, profile, "ADMIN_PROFILE_CREATED", actorUserId, ProfileMetadata(profile));
    }
}
