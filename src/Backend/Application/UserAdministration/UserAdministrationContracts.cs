namespace Application.UserAdministration;

public sealed record AdminProfileDto(
    Guid Id,
    string Name,
    string Code,
    Guid RoleId,
    string RoleCode,
    string RoleName,
    string? OrganizationUnitCode,
    string? OrganizationUnitName,
    bool IsActive,
    bool IsDefault,
    DateTime? LastSelectedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record AdminUserDto(
    Guid Id,
    string Email,
    string? DisplayName,
    bool IsActive,
    DateTime? FirstLoginAt,
    DateTime? LastLoginAt,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<AdminProfileDto> Profiles,
    /// <summary>
    /// Hồ sơ giảng viên gắn với tài khoản ("Users"."LecturerId"); null với tài khoản
    /// quản trị thuần. Màn cấp hồ sơ dùng nó để sinh mã hồ sơ 6 chữ số.
    /// </summary>
    int? LecturerId = null,
    /// <summary>
    /// Ba trường dưới đọc từ hồ sơ giảng viên gắn với tài khoản, để bảng tài khoản
    /// hiện được khoa/viện, bộ môn và tên giảng viên. Null với tài khoản quản trị
    /// thuần hoặc khi hồ sơ giảng viên chưa gắn đơn vị.
    /// </summary>
    string? LecturerFullName = null,
    string? DepartmentName = null,
    string? FacultyName = null);

public sealed record AdminRoleDto(Guid Id, string Code, string Name, string? Description);

/// <summary>Thông tin một permission trong hệ thống.</summary>
public sealed record PermissionDto(
    Guid Id,
    string Code,
    string Name,
    string? Description,
    string Category);

/// <summary>Trạng thái permission (được cấp hay không) của một role.</summary>
public sealed record RolePermissionStatusDto(
    Guid PermissionId,
    string PermissionCode,
    string PermissionName,
    string Category,
    bool IsGranted);

/// <summary>Toàn bộ permission matrix của một role.</summary>
public sealed record RolePermissionMatrixDto(
    Guid RoleId,
    string RoleCode,
    string RoleName,
    IReadOnlyList<RolePermissionStatusDto> Permissions);

/// <summary>Lệnh cập nhật permission của một role.</summary>
public sealed record UpdateRolePermissionsCommand(
    Guid RoleId,
    IReadOnlyList<RolePermissionGrantDto> Grants);

public sealed record RolePermissionGrantDto(Guid PermissionId, bool IsGranted);

/// <summary>Các quyền tối thiểu giúp vai trò hệ thống không tự khóa mất chức năng quản trị.</summary>
public static class RequiredRolePermissions
{
    public const string AdminRoleCode = "ADMIN";
    public const string UserAdminPermissionCode = "USER_ADMIN_ACCESS";

    public static bool IsRequired(string roleCode, string permissionCode) =>
        string.Equals(roleCode, AdminRoleCode, StringComparison.OrdinalIgnoreCase)
        && string.Equals(permissionCode, UserAdminPermissionCode, StringComparison.OrdinalIgnoreCase);
}


public sealed record AdminAuditLogDto(
    Guid Id,
    string Source,
    Guid? UserId,
    Guid? ProfileId,
    string? Email,
    string Event,
    string? EntityName,
    string? RecordId,
    string? Metadata,
    string? OldValues,
    string? NewValues,
    DateTime CreatedAt);

public sealed record AdminPage<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public sealed record CreateAdminUserCommand(string Email, string? DisplayName);

public sealed record ImportAdminUserRowCommand(int RowNumber, string Email, string? DisplayName);

/// <summary>
/// Quy ước đặt tên và mã hồ sơ. Nằm ở backend vì cả ba đường tạo hồ sơ — thủ công,
/// tạo hàng loạt và import Excel — đều phải cho ra cùng một kết quả.
/// <para>
/// Sáu chữ số đầu là số thứ tự tự tăng trên toàn hệ thống, hai ký tự cuối biểu thị
/// vai trò. Ví dụ hồ sơ thứ 36 của trưởng bộ môn có mã <c>000036BM</c>.
/// </para>
/// </summary>
public static class ProfileNaming
{
    public static readonly IReadOnlyDictionary<string, (string Name, string Suffix)> ByRoleCode =
        new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase)
        {
            ["ADMIN"] = ("Quản trị hệ thống", "AD"),
            ["BOARD_OF_DIRECTORS"] = ("Ban Giám hiệu", "GH"),
            ["DEPARTMENT_MANAGER"] = ("Trưởng bộ môn", "BM"),
            ["DEPUTY_DEPARTMENT_MANAGER"] = ("Phó trưởng bộ môn", "PB"),
            ["FACULTY_MANAGER"] = ("Trưởng khoa/viện", "KV"),
            ["LECTURER"] = ("Giảng viên", "GV"),
            ["SURVEY_ADMIN"] = ("Quản trị khảo sát", "QT"),
        };

    public static string CodeFor(long sequenceNumber, string suffix) =>
        $"{sequenceNumber:D6}{suffix}";

    /// <summary>
    /// Tra vai trò từ tên tiếng Việt trong tệp Excel, hoặc từ chính mã vai trò. Nhận
    /// cả hai để người điền tệp không phải nhớ mã hệ thống.
    /// </summary>
    public static string? RoleCodeFromLabel(string? value)
    {
        var text = (value ?? string.Empty).Trim();
        if (text.Length == 0) return null;

        foreach (var (roleCode, naming) in ByRoleCode)
        {
            if (string.Equals(text, roleCode, StringComparison.OrdinalIgnoreCase)
                || string.Equals(text, naming.Name, StringComparison.OrdinalIgnoreCase))
            {
                return roleCode;
            }
        }

        return null;
    }
}

/// <summary>Một dòng của tệp Excel cấp hồ sơ hàng loạt.</summary>
public sealed record ImportAdminProfileRowCommand(int RowNumber, string Email, string? RoleLabel);

public sealed record AdminProfileImportItemDto(
    int RowNumber,
    string Email,
    bool Succeeded,
    string? ErrorCode);

public sealed record AdminProfileImportDto(
    int TotalCount,
    int CreatedCount,
    int SkippedCount,
    IReadOnlyList<AdminProfileImportItemDto> Items);

public sealed record AdminUserImportItemDto(
    int RowNumber,
    string Email,
    bool Succeeded,
    string? ErrorCode);

public sealed record AdminUserImportDto(
    int TotalCount,
    int CreatedCount,
    int SkippedCount,
    IReadOnlyList<AdminUserImportItemDto> Items);

public sealed record SaveAdminProfileCommand(
    string Name,
    Guid RoleId,
    string? OrganizationUnitCode,
    string? OrganizationUnitName,
    bool IsDefault);

public sealed record AdminOperationResult<T>(bool Succeeded, string? ErrorCode, T? Value);

public sealed record ChangeAuditLogDto(
    Guid Id,
    string TableName,
    string RecordId,
    string Action,
    Guid? ChangedBy,
    string? ChangedByEmail,
    string? OldValues,
    string? NewValues,
    DateTime ChangedAt);

public interface IUserAdministrationService
{
    Task<AdminPage<AdminUserDto>> GetUsersAsync(
        string? search,
        bool? isActive,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task<AdminOperationResult<AdminUserDto>> CreateUserAsync(
        CreateAdminUserCommand command,
        Guid actorUserId,
        CancellationToken cancellationToken = default);

    Task<AdminOperationResult<AdminUserImportDto>> ImportUsersAsync(
        IReadOnlyList<ImportAdminUserRowCommand> commands,
        Guid actorUserId,
        CancellationToken cancellationToken = default);

    Task<AdminOperationResult<AdminUserDto>> SetUserStatusAsync(
        Guid userId,
        bool isActive,
        Guid actorUserId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Cấp hồ sơ Giảng viên cho MỌI tài khoản đã gắn hồ sơ giảng viên mà chưa có hồ sơ
    /// nào. Chỉ làm đúng mức giảng viên; trưởng bộ môn và quản trị phải cấp bằng tệp
    /// Excel hoặc thủ công vì còn phải chọn đúng người.
    /// </summary>
    Task<AdminOperationResult<AdminProfileImportDto>> BulkCreateLecturerProfilesAsync(
        Guid actorUserId,
        CancellationToken cancellationToken = default);

    /// <summary>Cấp hồ sơ theo tệp Excel: mỗi dòng một email kèm tên vai trò.</summary>
    Task<AdminOperationResult<AdminProfileImportDto>> ImportProfilesAsync(
        IReadOnlyList<ImportAdminProfileRowCommand> commands,
        Guid actorUserId,
        CancellationToken cancellationToken = default);

    Task<AdminOperationResult<AdminProfileDto>> CreateProfileAsync(
        Guid userId,
        SaveAdminProfileCommand command,
        Guid actorUserId,
        CancellationToken cancellationToken = default);

    Task<AdminOperationResult<AdminProfileDto>> UpdateProfileAsync(
        Guid userId,
        Guid profileId,
        SaveAdminProfileCommand command,
        Guid actorUserId,
        Guid actorProfileId,
        CancellationToken cancellationToken = default);

    Task<AdminOperationResult<AdminProfileDto>> SetProfileStatusAsync(
        Guid userId,
        Guid profileId,
        bool isActive,
        Guid actorUserId,
        Guid actorProfileId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AdminRoleDto>> GetRolesAsync(CancellationToken cancellationToken = default);

    Task<AdminPage<AdminAuditLogDto>> GetAuditLogsAsync(
        Guid? userId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    /// <summary>Lấy toàn bộ danh sách permissions trong hệ thống.</summary>
    Task<IReadOnlyList<PermissionDto>> GetPermissionsAsync(CancellationToken cancellationToken = default);

    /// <summary>Lấy trạng thái permissions (granted/denied) của tất cả roles.</summary>
    Task<IReadOnlyList<RolePermissionMatrixDto>> GetRolePermissionMatrixAsync(CancellationToken cancellationToken = default);

    /// <summary>Lấy permissions của một role cụ thể. Trả về null nếu roleId không tồn tại.</summary>
    Task<RolePermissionMatrixDto?> GetRolePermissionsAsync(
        Guid roleId,
        CancellationToken cancellationToken = default);

    /// <summary>Cập nhật danh sách permissions của một role.</summary>
    Task<AdminOperationResult<bool>> UpdateRolePermissionsAsync(
        Guid roleId,
        IReadOnlyList<RolePermissionGrantDto> grants,
        CancellationToken cancellationToken = default);

    Task<AdminPage<ChangeAuditLogDto>> GetChangeAuditLogsAsync(
        string? tableName,
        string? recordId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);
}


public static class UserAdministrationErrorCodes
{
    public const string InvalidRequest = "ADMIN_INVALID_REQUEST";
    public const string UserNotFound = "ADMIN_USER_NOT_FOUND";
    public const string UserEmailExists = "ADMIN_USER_EMAIL_EXISTS";
    public const string ImportEmailRequired = "ADMIN_IMPORT_EMAIL_REQUIRED";
    public const string ImportEmailInvalid = "ADMIN_IMPORT_EMAIL_INVALID";
    public const string ImportDisplayNameInvalid = "ADMIN_IMPORT_DISPLAY_NAME_INVALID";
    public const string ImportDuplicateEmail = "ADMIN_IMPORT_DUPLICATE_EMAIL";
    public const string CannotDisableSelf = "ADMIN_CANNOT_DISABLE_SELF";
    public const string ProfileNotFound = "ADMIN_PROFILE_NOT_FOUND";
    public const string ProfileCodeExists = "ADMIN_PROFILE_CODE_EXISTS";
    public const string ProfileAssignmentExists = "ADMIN_PROFILE_ASSIGNMENT_EXISTS";
    public const string RoleNotFound = "ADMIN_ROLE_NOT_FOUND";

    /// <summary>Vai trò trong tệp Excel không khớp tên nào của hệ thống.</summary>
    public const string ImportRoleInvalid = "ADMIN_IMPORT_ROLE_INVALID";

    /// <summary>Tài khoản đã có sẵn hồ sơ với đúng vai trò này.</summary>
    public const string ImportProfileExists = "ADMIN_IMPORT_PROFILE_EXISTS";

    /// <summary>Không có tài khoản nào cần cấp hồ sơ.</summary>
    public const string NoProfilesToCreate = "ADMIN_NO_PROFILES_TO_CREATE";
    public const string CannotModifyActiveProfile = "ADMIN_CANNOT_MODIFY_ACTIVE_PROFILE";
    public const string CannotRevokeRequiredPermission = "ADMIN_CANNOT_REVOKE_REQUIRED_PERMISSION";
}
