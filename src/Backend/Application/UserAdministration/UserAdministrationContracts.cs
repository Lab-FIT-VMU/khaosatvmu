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

/// <summary>
/// Một vai trò kèm phạm vi dữ liệu, quyền ghi và số hồ sơ đang bật dùng nó.
/// <paramref name="IsSystem"/>: không xóa được (ADMIN, Giảng viên).
/// </summary>
public sealed record AdminRoleDto(
    Guid Id,
    string Code,
    string Name,
    string? Description,
    string DataScope = "DEPARTMENT",
    bool CanWrite = false,
    string ProfileCodeSuffix = "",
    bool IsSystem = false,
    int ActiveProfileCount = 0);

/// <summary>Thêm hoặc sửa vai trò. <paramref name="DataScope"/> là một trong Domain.RoleDataScopes.</summary>
public sealed record SaveRoleCommand(
    string Name,
    string? Description,
    string DataScope,
    bool CanWrite,
    string ProfileCodeSuffix);

/// <summary>Kết quả xóa vai trò: số hồ sơ bị vô hiệu hóa và số tài khoản không còn hồ sơ nào.</summary>
public sealed record RoleDeletionDto(int DisabledProfileCount, int UsersWithoutActiveProfile);

public static class RoleRules
{
    /// <summary>Số vai trò tối đa đang dùng cùng lúc (không tính vai trò đã xóa).</summary>
    public const int MaximumRoles = 8;
}

/// <summary>Thông tin một permission trong hệ thống.</summary>
public sealed record PermissionDto(
    Guid Id,
    string Code,
    string Name,
    string? Description,
    string Category,
    string? ParentCode);

/// <summary>Trạng thái permission (được cấp hay không) của một role.</summary>
/// <param name="ParentCode">Quyền cha khi đây là quyền của một tab trong module.</param>
public sealed record RolePermissionStatusDto(
    Guid PermissionId,
    string PermissionCode,
    string PermissionName,
    string Category,
    bool IsGranted,
    string? ParentCode);

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
    /// <summary>Tab Phân quyền Module: tắt đi thì admin mất màn hình duy nhất cấp lại quyền.</summary>
    public const string UserAdminPermissionsTabCode = "USER_ADMIN_TAB_PERMISSIONS";

    public static bool IsRequired(string roleCode, string permissionCode) =>
        string.Equals(roleCode, AdminRoleCode, StringComparison.OrdinalIgnoreCase)
        && (string.Equals(permissionCode, UserAdminPermissionCode, StringComparison.OrdinalIgnoreCase)
            || string.Equals(permissionCode, UserAdminPermissionsTabCode, StringComparison.OrdinalIgnoreCase));
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
/// Tên hồ sơ là tên vai trò. Mã hồ sơ: sáu chữ số đầu là số thứ tự tự tăng trên toàn hệ
/// thống, phần cuối là hậu tố của vai trò ("Roles"."ProfileCodeSuffix"). Ví dụ hồ sơ thứ
/// 36 của quản lý bộ môn có mã <c>000036BM</c>.
/// </para>
/// </summary>
public static class ProfileNaming
{
    public static string CodeFor(long sequenceNumber, string suffix) =>
        $"{sequenceNumber:D6}{suffix}";
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

    Task<AdminOperationResult<AdminRoleDto>> CreateRoleAsync(
        SaveRoleCommand command,
        CancellationToken cancellationToken = default);

    Task<AdminOperationResult<AdminRoleDto>> UpdateRoleAsync(
        Guid roleId,
        SaveRoleCommand command,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Xóa mềm vai trò; mọi hồ sơ đang mang vai trò đó bị vô hiệu hóa (tắt, đăng xuất các
    /// phiên đang dùng, chọn lại hồ sơ mặc định cho tài khoản).
    /// </summary>
    Task<AdminOperationResult<RoleDeletionDto>> DeleteRoleAsync(
        Guid roleId,
        Guid actorUserId,
        Guid actorProfileId,
        CancellationToken cancellationToken = default);

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

    /// <summary>Đã đủ <see cref="RoleRules.MaximumRoles"/> vai trò.</summary>
    public const string RoleLimitReached = "ADMIN_ROLE_LIMIT_REACHED";
    public const string RoleNameRequired = "ADMIN_ROLE_NAME_REQUIRED";
    public const string RoleNameExists = "ADMIN_ROLE_NAME_EXISTS";

    /// <summary>Hậu tố mã hồ sơ phải là 2–4 chữ in hoa hoặc chữ số.</summary>
    public const string RoleSuffixInvalid = "ADMIN_ROLE_SUFFIX_INVALID";
    public const string RoleSuffixExists = "ADMIN_ROLE_SUFFIX_EXISTS";
    public const string RoleScopeInvalid = "ADMIN_ROLE_SCOPE_INVALID";

    /// <summary>Phạm vi "chỉ lớp mình dạy" không bật được quyền ghi.</summary>
    public const string RoleOwnScopeCannotWrite = "ADMIN_ROLE_OWN_SCOPE_CANNOT_WRITE";

    /// <summary>Vai trò hệ thống (ADMIN, Giảng viên) không xóa được.</summary>
    public const string RoleSystemLocked = "ADMIN_ROLE_SYSTEM_LOCKED";

    /// <summary>ADMIN phải luôn thấy và ghi toàn trường.</summary>
    public const string AdminRoleScopeLocked = "ADMIN_ROLE_ADMIN_SCOPE_LOCKED";

    /// <summary>Không xóa được vai trò của chính hồ sơ đang đăng nhập.</summary>
    public const string CannotDeleteOwnRole = "ADMIN_CANNOT_DELETE_OWN_ROLE";
}
