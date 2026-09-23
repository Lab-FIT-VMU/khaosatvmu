using System.Text.Json;
using System.Net.Mail;
using Application.UserAdministration;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.UserAdministration;

public sealed partial class EfUserAdministrationService(AppDbContext db) : IUserAdministrationService
{
    private const int MaximumPageSize = 100;

    public async Task<AdminPage<AdminUserDto>> GetUsersAsync(
        string? search,
        bool? isActive,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        (page, pageSize) = NormalizePaging(page, pageSize);
        var query = db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x =>
                x.Email.ToLower().Contains(term)
                || (x.DisplayName != null && x.DisplayName.ToLower().Contains(term)));
        }

        if (isActive is not null)
        {
            query = query.Where(x => x.IsActive == isActive.Value);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var users = await query
            .OrderByDescending(x => x.IsActive)
            .ThenBy(x => x.DisplayName)
            .ThenBy(x => x.Email)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        var items = await BuildUsersAsync(users, cancellationToken);
        return new AdminPage<AdminUserDto>(items, page, pageSize, totalCount);
    }

    public async Task<AdminOperationResult<AdminUserDto>> CreateUserAsync(
        CreateAdminUserCommand command,
        Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        var email = command.Email.Trim().ToLowerInvariant();
        if (!IsValidEmail(email)
            || !IsValidDisplayName(command.DisplayName))
        {
            return Failure<AdminUserDto>(UserAdministrationErrorCodes.InvalidRequest);
        }

        if (await db.Users.AnyAsync(x => x.Email.ToLower() == email, cancellationToken))
        {
            return Failure<AdminUserDto>(UserAdministrationErrorCodes.UserEmailExists);
        }

        var now = DateTime.UtcNow;
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            DisplayName = NormalizeOptional(command.DisplayName),
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Users.Add(user);
        AddAudit(user, null, "ADMIN_USER_CREATED", actorUserId, new { user.Email });
        await db.SaveChangesAsync(cancellationToken);
        return Success(await BuildUserAsync(user, cancellationToken));
    }

    public async Task<AdminOperationResult<AdminUserImportDto>> ImportUsersAsync(
        IReadOnlyList<ImportAdminUserRowCommand> commands,
        Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        if (commands.Count == 0)
        {
            return Failure<AdminUserImportDto>(UserAdministrationErrorCodes.InvalidRequest);
        }

        var normalizedEmails = commands
            .Select(x => (x.Email ?? string.Empty).Trim().ToLowerInvariant())
            .Where(IsValidEmail)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var existingEmails = normalizedEmails.Length == 0
            ? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            : (await db.Users
                .AsNoTracking()
                .Where(x => normalizedEmails.Contains(x.Email.ToLower()))
                .Select(x => x.Email)
                .ToListAsync(cancellationToken))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var seenEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var items = new List<AdminUserImportItemDto>(commands.Count);
        var createdCount = 0;
        foreach (var command in commands.OrderBy(x => x.RowNumber))
        {
            var email = (command.Email ?? string.Empty).Trim().ToLowerInvariant();
            var errorCode = ValidateImportRow(command, email, seenEmails, existingEmails);
            if (errorCode is not null)
            {
                items.Add(new AdminUserImportItemDto(command.RowNumber, email, false, errorCode));
                continue;
            }

            var now = DateTime.UtcNow;
            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = email,
                DisplayName = NormalizeOptional(command.DisplayName),
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            };
            db.Users.Add(user);
            AddAudit(user, null, "ADMIN_USER_IMPORTED", actorUserId, new { command.RowNumber, user.Email });
            items.Add(new AdminUserImportItemDto(command.RowNumber, email, true, null));
            createdCount++;
        }

        if (createdCount > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return Success(new AdminUserImportDto(
            commands.Count,
            createdCount,
            commands.Count - createdCount,
            items));
    }

    public async Task<AdminOperationResult<AdminUserDto>> SetUserStatusAsync(
        Guid userId,
        bool isActive,
        Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == userId, cancellationToken);
        if (user is null)
        {
            return Failure<AdminUserDto>(UserAdministrationErrorCodes.UserNotFound);
        }

        if (!isActive && userId == actorUserId)
        {
            return Failure<AdminUserDto>(UserAdministrationErrorCodes.CannotDisableSelf);
        }

        if (user.IsActive != isActive)
        {
            user.IsActive = isActive;
            user.UpdatedAt = DateTime.UtcNow;
            AddAudit(
                user,
                null,
                isActive ? "ADMIN_USER_ENABLED" : "ADMIN_USER_DISABLED",
                actorUserId,
                new { user.IsActive });
            if (!isActive)
            {
                await RevokeUserSessionsAsync(user.Id, "USER_DISABLED", cancellationToken);
            }

            await db.SaveChangesAsync(cancellationToken);
        }

        return Success(await BuildUserAsync(user, cancellationToken));
    }

    public async Task<AdminOperationResult<AdminProfileDto>> CreateProfileAsync(
        Guid userId,
        SaveAdminProfileCommand command,
        Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        var validationError = await ValidateProfileCommandAsync(userId, null, command, cancellationToken);
        if (validationError is not null)
        {
            return Failure<AdminProfileDto>(validationError);
        }

        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == userId, cancellationToken);
        if (user is null)
        {
            return Failure<AdminProfileDto>(UserAdministrationErrorCodes.UserNotFound);
        }

        var now = DateTime.UtcNow;
        var hasActiveProfile = await db.UserProfiles.AnyAsync(
            x => x.UserId == userId && x.IsActive,
            cancellationToken);
        var isDefault = command.IsDefault || !hasActiveProfile;
        var role = await db.Roles.SingleAsync(x => x.Id == command.RoleId, cancellationToken);
        var naming = ProfileNaming.ByRoleCode[role.Code];
        var profileCode = await GenerateNextProfileCodeAsync(naming.Suffix, cancellationToken);

        await using var transaction = isDefault
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        if (isDefault)
        {
            await ClearDefaultProfileAsync(userId, null, cancellationToken);
        }

        var profile = new UserProfile
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            RoleId = command.RoleId,
            ProfileName = naming.Name,
            ProfileCode = profileCode,
            OrganizationUnitCode = NormalizeCodeOptional(command.OrganizationUnitCode),
            OrganizationUnitName = NormalizeOptional(command.OrganizationUnitName),
            IsActive = true,
            IsDefault = isDefault,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.UserProfiles.Add(profile);
        user.UpdatedAt = now;
        AddAudit(user, profile, "ADMIN_PROFILE_CREATED", actorUserId, ProfileMetadata(profile));
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null)
        {
            await transaction.CommitAsync(cancellationToken);
        }
        return Success(await BuildProfileAsync(profile, cancellationToken));
    }

    public async Task<AdminOperationResult<AdminProfileDto>> UpdateProfileAsync(
        Guid userId,
        Guid profileId,
        SaveAdminProfileCommand command,
        Guid actorUserId,
        Guid actorProfileId,
        CancellationToken cancellationToken = default)
    {
        var profile = await db.UserProfiles.SingleOrDefaultAsync(
            x => x.Id == profileId && x.UserId == userId,
            cancellationToken);
        if (profile is null)
        {
            return Failure<AdminProfileDto>(UserAdministrationErrorCodes.ProfileNotFound);
        }

        if (profileId == actorProfileId && profile.RoleId != command.RoleId)
        {
            return Failure<AdminProfileDto>(UserAdministrationErrorCodes.CannotModifyActiveProfile);
        }

        var validationError = await ValidateProfileCommandAsync(userId, profileId, command, cancellationToken);
        if (validationError is not null)
        {
            return Failure<AdminProfileDto>(validationError);
        }

        var switchesDefault = command.IsDefault && profile.IsActive && !profile.IsDefault;
        await using var transaction = switchesDefault
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        if (switchesDefault)
        {
            await ClearDefaultProfileAsync(userId, profileId, cancellationToken);
        }

        var roleChanged = profile.RoleId != command.RoleId;
        var role = await db.Roles.SingleAsync(x => x.Id == command.RoleId, cancellationToken);
        profile.ProfileName = ProfileNaming.ByRoleCode[role.Code].Name;
        profile.RoleId = command.RoleId;
        profile.OrganizationUnitCode = NormalizeCodeOptional(command.OrganizationUnitCode);
        profile.OrganizationUnitName = NormalizeOptional(command.OrganizationUnitName);
        profile.IsDefault = command.IsDefault && profile.IsActive;
        profile.UpdatedAt = DateTime.UtcNow;
        var user = await db.Users.SingleAsync(x => x.Id == userId, cancellationToken);
        user.UpdatedAt = profile.UpdatedAt;
        AddAudit(user, profile, "ADMIN_PROFILE_UPDATED", actorUserId, ProfileMetadata(profile));
        if (roleChanged)
        {
            await RevokeProfileSessionsAsync(profile.Id, "PROFILE_ROLE_CHANGED", cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null)
        {
            await transaction.CommitAsync(cancellationToken);
        }
        return Success(await BuildProfileAsync(profile, cancellationToken));
    }

    public async Task<AdminOperationResult<AdminProfileDto>> SetProfileStatusAsync(
        Guid userId,
        Guid profileId,
        bool isActive,
        Guid actorUserId,
        Guid actorProfileId,
        CancellationToken cancellationToken = default)
    {
        var profile = await db.UserProfiles.SingleOrDefaultAsync(
            x => x.Id == profileId && x.UserId == userId,
            cancellationToken);
        if (profile is null)
        {
            return Failure<AdminProfileDto>(UserAdministrationErrorCodes.ProfileNotFound);
        }

        if (!isActive && profileId == actorProfileId)
        {
            return Failure<AdminProfileDto>(UserAdministrationErrorCodes.CannotModifyActiveProfile);
        }

        if (profile.IsActive != isActive)
        {
            profile.IsActive = isActive;
            profile.UpdatedAt = DateTime.UtcNow;
            if (!isActive)
            {
                profile.IsDefault = false;
                await RevokeProfileSessionsAsync(profile.Id, "PROFILE_DISABLED", cancellationToken);
                await EnsureDefaultProfileAsync(userId, profile.Id, cancellationToken);
            }
            else if (!await db.UserProfiles.AnyAsync(
                         x => x.UserId == userId && x.IsActive && x.IsDefault,
                         cancellationToken))
            {
                profile.IsDefault = true;
            }

            var user = await db.Users.SingleAsync(x => x.Id == userId, cancellationToken);
            user.UpdatedAt = profile.UpdatedAt;
            AddAudit(
                user,
                profile,
                isActive ? "ADMIN_PROFILE_ENABLED" : "ADMIN_PROFILE_DISABLED",
                actorUserId,
                new { profile.IsActive });
            await db.SaveChangesAsync(cancellationToken);
        }

        return Success(await BuildProfileAsync(profile, cancellationToken));
    }

    public async Task<IReadOnlyList<AdminRoleDto>> GetRolesAsync(CancellationToken cancellationToken = default) =>
        await db.Roles
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => new AdminRoleDto(x.Id, x.Code, x.Name, x.Description))
            .ToListAsync(cancellationToken);

    public async Task<AdminPage<AdminAuditLogDto>> GetAuditLogsAsync(
        Guid? userId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        (page, pageSize) = NormalizePaging(page, pageSize);
        var authQuery = db.AuthAuditLogs.AsNoTracking();
        var changeQuery = db.ChangeAuditLogs.AsNoTracking();
        if (userId is not null)
        {
            authQuery = authQuery.Where(x => x.UserId == userId);
            changeQuery = changeQuery.Where(x => x.ChangedBy == userId);
        }

        var authCount = await authQuery.CountAsync(cancellationToken);
        var changeCount = await changeQuery.CountAsync(cancellationToken);
        var totalCount = authCount + changeCount;
        var offset = (long)(page - 1) * pageSize;
        if (offset >= totalCount)
        {
            return new AdminPage<AdminAuditLogDto>([], page, pageSize, totalCount);
        }

        // Lấy đủ phần đầu của mỗi nguồn để hợp nhất chính xác tới trang cần trả.
        // Một bản ghi nằm ngoài giới hạn này ở từng nguồn không thể lọt vào trang hiện tại.
        var fetchCount = (int)Math.Min(totalCount, offset + pageSize);
        var authItems = await authQuery
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.Id)
            .Take(fetchCount)
            .Select(x => new AdminAuditLogDto(
                x.Id,
                "AUTH",
                x.UserId,
                x.ProfileId,
                x.Email,
                x.Event,
                null,
                null,
                x.Metadata,
                null,
                null,
                x.CreatedAt))
            .ToListAsync(cancellationToken);
        var changeItems = await changeQuery
            .OrderByDescending(x => x.ChangedAt)
            .ThenByDescending(x => x.Id)
            .Take(fetchCount)
            .Select(x => new AdminAuditLogDto(
                x.Id,
                "CHANGE",
                x.ChangedBy,
                null,
                x.ChangedByEmail,
                x.Action,
                x.TableName,
                x.RecordId,
                null,
                x.OldValues,
                x.NewValues,
                x.ChangedAt))
            .ToListAsync(cancellationToken);
        var items = authItems
            .Concat(changeItems)
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.Id)
            .Skip((int)offset)
            .Take(pageSize)
            .ToList();
        return new AdminPage<AdminAuditLogDto>(items, page, pageSize, totalCount);
    }

    /// <summary>
    /// Trang Phân quyền Module phải đọc y như thanh điều hướng bên trái: cùng thứ tự
    /// nhóm, cùng thứ tự mục trong nhóm. Hai bảng dưới giữ đúng thứ tự đó — sửa menu
    /// thì phải sửa cả ở đây, nếu không người phân quyền phải tự dò xem mục nào là mục nào.
    /// </summary>
    private static readonly Dictionary<string, int> CategoryOrderMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Tổng quan"] = 1,
        ["Thống kê tốt nghiệp"] = 2,
        ["Danh mục đào tạo"] = 3,
        ["Khảo sát học phần"] = 4,
        ["Khảo sát chương trình"] = 5,
        ["Quản trị"] = 6
    };

    private static int GetCategoryOrder(string category) =>
        CategoryOrderMap.TryGetValue(category, out var order) ? order : 99;

    private static readonly Dictionary<string, int> PermissionOrderMap = new(StringComparer.OrdinalIgnoreCase)
    {
        // Tổng quan
        ["DASHBOARD_ACCESS"] = 1,
        ["SURVEY_DASHBOARD_ACCESS"] = 2,
        ["PROGRESS_ACCESS"] = 3,
        ["SURVEY_STATISTICS_ACCESS"] = 4,
        ["REPORTS_ACCESS"] = 5,
        ["SURVEY_ANALYSIS_ACCESS"] = 6,
        // Thống kê tốt nghiệp
        ["GRADUATION_UPLOAD_ACCESS"] = 1,
        ["GRADUATION_ANALYTICS_ACCESS"] = 2,
        // Danh mục đào tạo
        ["FACULTIES_ACCESS"] = 1,
        ["DEPARTMENTS_ACCESS"] = 2,
        ["LECTURERS_ACCESS"] = 3,
        ["MAJORS_ACCESS"] = 4,
        ["COHORT_MAJORS_ACCESS"] = 5,
        ["COURSES_ACCESS"] = 6,
        ["COURSE_SECTIONS_ACCESS"] = 7,
        // Khảo sát học phần
        ["COURSE_QUESTION_SETS_ACCESS"] = 1,
        ["COURSE_CAMPAIGNS_ACCESS"] = 2,
        // Khảo sát chương trình
        ["PROGRAM_CAMPAIGNS_ACCESS"] = 1,
        ["PROGRAM_CRITERIA_ACCESS"] = 2,
        // Quản trị
        ["USER_ADMIN_ACCESS"] = 1
    };

    private static int GetPermissionOrder(string code) =>
        PermissionOrderMap.TryGetValue(code, out var order) ? order : 99;

    public async Task<IReadOnlyList<PermissionDto>> GetPermissionsAsync(CancellationToken cancellationToken = default) =>
        await db.Permissions
            .AsNoTracking()
            .OrderBy(x => x.Code)
            .Select(x => new PermissionDto(x.Id, x.Code, x.Name, x.Description, x.Category))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<RolePermissionMatrixDto>> GetRolePermissionMatrixAsync(CancellationToken cancellationToken = default)
    {
        var roles = await db.Roles
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);

        var allPermissions = (await db.Permissions
            .AsNoTracking()
            .ToListAsync(cancellationToken))
            .OrderBy(x => GetCategoryOrder(x.Category))
            .ThenBy(x => GetPermissionOrder(x.Code))
            .ThenBy(x => x.Name)
            .ToList();

        var grantedPairs = await db.RolePermissions
            .AsNoTracking()
            .Where(x => x.IsGranted)
            .Select(x => new { x.RoleId, x.PermissionId })
            .ToListAsync(cancellationToken);

        var grantedSet = grantedPairs
            .Select(x => (x.RoleId, x.PermissionId))
            .ToHashSet();

        return roles.Select(role => new RolePermissionMatrixDto(
            role.Id,
            role.Code,
            role.Name,
            allPermissions.Select(permission => new RolePermissionStatusDto(
                permission.Id,
                permission.Code,
                permission.Name,
                permission.Category,
                grantedSet.Contains((role.Id, permission.Id))
            )).ToList()
        )).ToList();
    }

    public async Task<RolePermissionMatrixDto?> GetRolePermissionsAsync(
        Guid roleId,
        CancellationToken cancellationToken = default)
    {
        var role = await db.Roles
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == roleId, cancellationToken);

        if (role is null) return null;

        var allPermissions = (await db.Permissions
            .AsNoTracking()
            .ToListAsync(cancellationToken))
            .OrderBy(x => GetCategoryOrder(x.Category))
            .ThenBy(x => GetPermissionOrder(x.Code))
            .ThenBy(x => x.Name)
            .ToList();

        var grantedIds = await db.RolePermissions
            .AsNoTracking()
            .Where(x => x.RoleId == roleId && x.IsGranted)
            .Select(x => x.PermissionId)
            .ToHashSetAsync(cancellationToken);

        return new RolePermissionMatrixDto(
            role.Id,
            role.Code,
            role.Name,
            allPermissions
                .Select(p => new RolePermissionStatusDto(
                    p.Id, p.Code, p.Name, p.Category,
                    grantedIds.Contains(p.Id)))
                .ToList()
        );
    }

    public async Task<AdminOperationResult<bool>> UpdateRolePermissionsAsync(
        Guid roleId,
        IReadOnlyList<RolePermissionGrantDto> grants,
        CancellationToken cancellationToken = default)
    {
        var roleCode = await db.Roles
            .AsNoTracking()
            .Where(x => x.Id == roleId)
            .Select(x => x.Code)
            .SingleOrDefaultAsync(cancellationToken);

        if (roleCode is null)
        {
            return Failure<bool>(UserAdministrationErrorCodes.RoleNotFound);
        }

        var deniedPermissionIds = grants
            .Where(x => !x.IsGranted)
            .Select(x => x.PermissionId)
            .ToHashSet();
        if (deniedPermissionIds.Count > 0)
        {
            var deniedPermissionCodes = await db.Permissions
                .AsNoTracking()
                .Where(x => deniedPermissionIds.Contains(x.Id))
                .Select(x => x.Code)
                .ToListAsync(cancellationToken);

            if (deniedPermissionCodes.Any(permissionCode =>
                    RequiredRolePermissions.IsRequired(roleCode, permissionCode)))
            {
                return Failure<bool>(UserAdministrationErrorCodes.CannotRevokeRequiredPermission);
            }
        }

        var existing = await db.RolePermissions
            .Where(x => x.RoleId == roleId)
            .ToListAsync(cancellationToken);

        foreach (var grant in grants)
        {
            var record = existing.FirstOrDefault(x => x.PermissionId == grant.PermissionId);
            if (record is null)
            {
                if (grant.IsGranted)
                {
                    db.RolePermissions.Add(new Domain.RolePermission
                    {
                        Id = Guid.NewGuid(),
                        RoleId = roleId,
                        PermissionId = grant.PermissionId,
                        IsGranted = true,
                        CreatedAt = DateTime.UtcNow
                    });
                }
            }
            else
            {
                record.IsGranted = grant.IsGranted;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        return Success(true);
    }

    public async Task<AdminPage<ChangeAuditLogDto>> GetChangeAuditLogsAsync(
        string? tableName,
        string? recordId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        (page, pageSize) = NormalizePaging(page, pageSize);
        var query = db.ChangeAuditLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(tableName))
            query = query.Where(x => x.TableName == tableName);
        if (!string.IsNullOrWhiteSpace(recordId))
            query = query.Where(x => x.RecordId == recordId);

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(x => x.ChangedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new ChangeAuditLogDto(
                x.Id, x.TableName, x.RecordId, x.Action,
                x.ChangedBy, x.ChangedByEmail, x.OldValues, x.NewValues, x.ChangedAt))
            .ToListAsync(cancellationToken);
        return new AdminPage<ChangeAuditLogDto>(items, page, pageSize, total);
    }

    private async Task<string?> ValidateProfileCommandAsync(
        Guid userId,
        Guid? profileId,
        SaveAdminProfileCommand command,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Name)
            || command.Name.Trim().Length > 200
            || command.OrganizationUnitCode?.Trim().Length > 100
            || command.OrganizationUnitName?.Trim().Length > 200)
        {
            return UserAdministrationErrorCodes.InvalidRequest;
        }

        if (!await db.Users.AnyAsync(x => x.Id == userId, cancellationToken))
        {
            return UserAdministrationErrorCodes.UserNotFound;
        }

        if (!await db.Roles.AnyAsync(x => x.Id == command.RoleId, cancellationToken))
        {
            return UserAdministrationErrorCodes.RoleNotFound;
        }

        var organizationCode = NormalizeCodeOptional(command.OrganizationUnitCode);
        if (await db.UserProfiles.AnyAsync(
                x => x.UserId == userId
                     && x.RoleId == command.RoleId
                     && x.OrganizationUnitCode == organizationCode
                     && x.Id != profileId,
                cancellationToken))
        {
            return UserAdministrationErrorCodes.ProfileAssignmentExists;
        }

        return null;
    }

    private async Task<IReadOnlyList<AdminUserDto>> BuildUsersAsync(
        IReadOnlyCollection<User> users,
        CancellationToken cancellationToken)
    {
        if (users.Count == 0)
        {
            return [];
        }

        var userIds = users.Select(x => x.Id).ToArray();
        var profiles = await BuildProfilesQuery()
            .Where(x => userIds.Contains(x.UserId))
            .OrderByDescending(x => x.IsDefault)
            .ThenBy(x => x.ProfileName)
            .ToListAsync(cancellationToken);
        var profilesByUser = profiles.ToLookup(x => x.UserId);
        var lecturerInfo = await LoadLecturerInfoAsync(
            users.Where(x => x.LecturerId != null).Select(x => x.LecturerId!.Value).Distinct().ToList(),
            cancellationToken);
        return users
            .Select(user => MapUser(user, profilesByUser[user.Id], LecturerInfoOf(lecturerInfo, user)))
            .ToList();
    }

    private async Task<AdminUserDto> BuildUserAsync(User user, CancellationToken cancellationToken)
    {
        var profiles = await BuildProfilesQuery()
            .Where(x => x.UserId == user.Id)
            .OrderByDescending(x => x.IsDefault)
            .ThenBy(x => x.ProfileName)
            .ToListAsync(cancellationToken);
        var lecturerInfo = await LoadLecturerInfoAsync(
            user.LecturerId is { } lecturerId ? [lecturerId] : [],
            cancellationToken);
        return MapUser(user, profiles, LecturerInfoOf(lecturerInfo, user));
    }

    /// <summary>Tên, bộ môn và khoa/viện của hồ sơ giảng viên gắn với một tài khoản.</summary>
    private sealed record LecturerInfo(string FullName, string? DepartmentName, string? FacultyName);

    private static LecturerInfo? LecturerInfoOf(
        IReadOnlyDictionary<int, LecturerInfo> lookup,
        User user) =>
        user.LecturerId is { } lecturerId && lookup.TryGetValue(lecturerId, out var info) ? info : null;

    /// <summary>
    /// Nạp một lần cho cả trang tài khoản thay vì tra từng dòng: bảng này mặc định
    /// 535 tài khoản, tra lẻ là 535 lượt truy vấn.
    /// </summary>
    private async Task<Dictionary<int, LecturerInfo>> LoadLecturerInfoAsync(
        IReadOnlyCollection<int> lecturerIds,
        CancellationToken cancellationToken)
    {
        if (lecturerIds.Count == 0) return [];

        // Bộ môn và khoa để trống thì vẫn phải trả về tên giảng viên, nên nối trái.
        var rows = await (
            from lecturer in db.Lecturers.AsNoTracking()
            where lecturerIds.Contains(lecturer.LecturerId)
            join department in db.Departments.AsNoTracking()
                on lecturer.DepartmentId equals department.DepartmentId into departmentMatches
            from department in departmentMatches.DefaultIfEmpty()
            join faculty in db.Faculties.AsNoTracking()
                on lecturer.FacultyId equals faculty.FacultyId into facultyMatches
            from faculty in facultyMatches.DefaultIfEmpty()
            select new
            {
                lecturer.LecturerId,
                lecturer.FullName,
                DepartmentName = department == null ? null : department.DepartmentName,
                FacultyName = faculty == null ? null : faculty.FacultyName,
            })
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(
            x => x.LecturerId,
            x => new LecturerInfo(x.FullName, x.DepartmentName, x.FacultyName));
    }

    private async Task<AdminProfileDto> BuildProfileAsync(
        UserProfile profile,
        CancellationToken cancellationToken) =>
        await BuildProfilesQuery()
            .Where(x => x.Id == profile.Id)
            .Select(x => new AdminProfileDto(
                x.Id,
                x.ProfileName,
                x.ProfileCode,
                x.RoleId,
                x.RoleCode,
                x.RoleName,
                x.OrganizationUnitCode,
                x.OrganizationUnitName,
                x.IsActive,
                x.IsDefault,
                x.LastSelectedAt,
                x.CreatedAt,
                x.UpdatedAt))
            .SingleAsync(cancellationToken);

    private IQueryable<ProfileProjection> BuildProfilesQuery() =>
        from profile in db.UserProfiles.AsNoTracking()
        join role in db.Roles.AsNoTracking() on profile.RoleId equals role.Id
        select new ProfileProjection
        {
            Id = profile.Id,
            UserId = profile.UserId,
            ProfileName = profile.ProfileName,
            ProfileCode = profile.ProfileCode,
            RoleId = profile.RoleId,
            RoleCode = role.Code,
            RoleName = role.Name,
            OrganizationUnitCode = profile.OrganizationUnitCode,
            OrganizationUnitName = profile.OrganizationUnitName,
            IsActive = profile.IsActive,
            IsDefault = profile.IsDefault,
            LastSelectedAt = profile.LastSelectedAt,
            CreatedAt = profile.CreatedAt,
            UpdatedAt = profile.UpdatedAt
        };

    private static AdminUserDto MapUser(
        User user,
        IEnumerable<ProfileProjection> profiles,
        LecturerInfo? lecturer) =>
        new(
            user.Id,
            user.Email,
            user.DisplayName,
            user.IsActive,
            user.FirstLoginAt,
            user.LastLoginAt,
            user.CreatedAt,
            user.UpdatedAt,
            profiles.Select(x => new AdminProfileDto(
                x.Id,
                x.ProfileName,
                x.ProfileCode,
                x.RoleId,
                x.RoleCode,
                x.RoleName,
                x.OrganizationUnitCode,
                x.OrganizationUnitName,
                x.IsActive,
                x.IsDefault,
                x.LastSelectedAt,
                x.CreatedAt,
                x.UpdatedAt)).ToList(),
            user.LecturerId,
            lecturer?.FullName,
            lecturer?.DepartmentName,
            lecturer?.FacultyName);

    private async Task ClearDefaultProfileAsync(
        Guid userId,
        Guid? excludedProfileId,
        CancellationToken cancellationToken)
    {
        await db.UserProfiles
            .Where(x => x.UserId == userId && x.IsDefault && x.Id != excludedProfileId)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.IsDefault, false)
                .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken);
    }

    private async Task<string> GenerateNextProfileCodeAsync(
        string suffix,
        CancellationToken cancellationToken)
    {
        var nextNumber = await db.Database
            .SqlQueryRaw<long>("SELECT nextval('\"UserProfileCodeSequence\"') AS \"Value\"")
            .SingleAsync(cancellationToken);
        return ProfileNaming.CodeFor(nextNumber, suffix);
    }

    private async Task EnsureDefaultProfileAsync(
        Guid userId,
        Guid excludedProfileId,
        CancellationToken cancellationToken)
    {
        if (await db.UserProfiles.AnyAsync(
                x => x.UserId == userId && x.IsActive && x.IsDefault && x.Id != excludedProfileId,
                cancellationToken))
        {
            return;
        }

        var replacement = await db.UserProfiles
            .Where(x => x.UserId == userId && x.IsActive && x.Id != excludedProfileId)
            .OrderBy(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (replacement is not null)
        {
            replacement.IsDefault = true;
            replacement.UpdatedAt = DateTime.UtcNow;
        }
    }

    private Task<int> RevokeUserSessionsAsync(
        Guid userId,
        string reason,
        CancellationToken cancellationToken) =>
        db.AuthSessions
            .Where(x => x.UserId == userId && x.RevokedAt == null)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.RevokedAt, DateTime.UtcNow)
                .SetProperty(x => x.RevokedReason, reason), cancellationToken);

    private Task<int> RevokeProfileSessionsAsync(
        Guid profileId,
        string reason,
        CancellationToken cancellationToken) =>
        db.AuthSessions
            .Where(x => x.ActiveProfileId == profileId && x.RevokedAt == null)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.RevokedAt, DateTime.UtcNow)
                .SetProperty(x => x.RevokedReason, reason), cancellationToken);

    private void AddAudit(
        User user,
        UserProfile? profile,
        string eventName,
        Guid actorUserId,
        object details)
    {
        db.AuthAuditLogs.Add(new AuthAuditLog
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            ProfileId = profile?.Id,
            Email = user.Email,
            Event = eventName,
            Metadata = JsonSerializer.Serialize(new { actorUserId, details }),
            CreatedAt = DateTime.UtcNow
        });
    }

    private static object ProfileMetadata(UserProfile profile) => new
    {
        profile.ProfileCode,
        profile.ProfileName,
        profile.RoleId,
        profile.OrganizationUnitCode,
        profile.OrganizationUnitName,
        profile.IsDefault
    };

    private static (int Page, int PageSize) NormalizePaging(int page, int pageSize) =>
        (Math.Max(1, page), Math.Clamp(pageSize, 1, MaximumPageSize));

    private static bool IsValidDisplayName(string? value) =>
        string.IsNullOrWhiteSpace(value) || value.Trim().Length <= 200;

    private static bool IsValidEmail(string value) =>
        !string.IsNullOrWhiteSpace(value)
        && value.Length <= 320
        && MailAddress.TryCreate(value, out var parsedEmail)
        && string.Equals(parsedEmail.Address, value, StringComparison.OrdinalIgnoreCase);

    private static string? ValidateImportRow(
        ImportAdminUserRowCommand command,
        string email,
        ISet<string> seenEmails,
        IReadOnlySet<string> existingEmails)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return UserAdministrationErrorCodes.ImportEmailRequired;
        }

        if (!IsValidEmail(email))
        {
            return UserAdministrationErrorCodes.ImportEmailInvalid;
        }

        if (!IsValidDisplayName(command.DisplayName))
        {
            return UserAdministrationErrorCodes.ImportDisplayNameInvalid;
        }

        if (!seenEmails.Add(email))
        {
            return UserAdministrationErrorCodes.ImportDuplicateEmail;
        }

        return existingEmails.Contains(email)
            ? UserAdministrationErrorCodes.UserEmailExists
            : null;
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string NormalizeCode(string value) => value.Trim().ToUpperInvariant();

    private static string? NormalizeCodeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : NormalizeCode(value);

    private static AdminOperationResult<T> Failure<T>(string errorCode) => new(false, errorCode, default);

    private static AdminOperationResult<T> Success<T>(T value) => new(true, null, value);

    private sealed class ProfileProjection
    {
        public Guid Id { get; init; }
        public Guid UserId { get; init; }
        public string ProfileName { get; init; } = string.Empty;
        public string ProfileCode { get; init; } = string.Empty;
        public Guid RoleId { get; init; }
        public string RoleCode { get; init; } = string.Empty;
        public string RoleName { get; init; } = string.Empty;
        public string? OrganizationUnitCode { get; init; }
        public string? OrganizationUnitName { get; init; }
        public bool IsActive { get; init; }
        public bool IsDefault { get; init; }
        public DateTime? LastSelectedAt { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime UpdatedAt { get; init; }
    }
}
