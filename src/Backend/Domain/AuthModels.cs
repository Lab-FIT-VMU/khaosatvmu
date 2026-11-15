namespace Domain;

public sealed class User
{
    public Guid Id { get; set; }
    public string? GoogleSubject { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string? AvatarUrl { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? FirstLoginAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// Nullable, UNIQUE khi có giá trị, ON DELETE RESTRICT. Tài khoản của một giảng
    /// viên thì trỏ về hồ sơ giảng viên đó; NULL là tài khoản quản trị thuần không
    /// gắn với ai. Đây là nguồn duy nhất để suy ra phạm vi dữ liệu của người đăng
    /// nhập, thay cho việc so email giữa hai bảng.
    /// </summary>
    public int? LecturerId { get; set; }

    public List<UserProfile> Profiles { get; set; } = [];
}

public sealed class UserProfile
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid RoleId { get; set; }
    public string ProfileName { get; set; } = string.Empty;
    public string ProfileCode { get; set; } = string.Empty;
    public string? OrganizationUnitCode { get; set; }
    public string? OrganizationUnitName { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsDefault { get; set; }
    public DateTime? LastSelectedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>Các giá trị hợp lệ của "Roles"."DataScope": vai trò thấy dữ liệu của ai.</summary>
public static class RoleDataScopes
{
    /// <summary>Toàn trường, không lọc.</summary>
    public const string All = "ALL";

    /// <summary>Mọi bộ môn thuộc khoa của hồ sơ giảng viên gắn với tài khoản.</summary>
    public const string Faculty = "FACULTY";

    /// <summary>Bộ môn của hồ sơ giảng viên gắn với tài khoản.</summary>
    public const string Department = "DEPARTMENT";

    /// <summary>Chỉ các lớp chính mình dạy. Phạm vi này luôn chỉ đọc.</summary>
    public const string Own = "OWN";

    public static bool IsValid(string? value) => value is All or Faculty or Department or Own;
}

/// <summary>
/// Vai trò của một hồ sơ. Quyết định ba thứ: được vào module nào ("RolePermissions"), thấy
/// dữ liệu của ai (<see cref="DataScope"/>) và được ghi hay chỉ xem (<see cref="CanWrite"/>).
/// Người quản trị thêm, sửa, xóa được vai trò; tối đa 8 vai trò.
/// </summary>
public sealed class Role : ISoftDeletable
{
    public Guid Id { get; set; }

    /// <summary>Mã nội bộ, UNIQUE kể cả dòng đã xóa. Vai trò tự tạo nhận mã sinh tự động.</summary>
    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>
    /// Vai trò không được xóa: ADMIN (luôn còn người vào được trang phân quyền) và LECTURER
    /// (hồ sơ cơ bản tự cấp cho mọi tài khoản giảng viên).
    /// </summary>
    public bool IsSystem { get; set; }

    /// <summary>Một trong <see cref="RoleDataScopes"/>.</summary>
    public string DataScope { get; set; } = RoleDataScopes.Department;

    /// <summary>
    /// Được ghi trong phạm vi của mình. False là chỉ xem. Phạm vi
    /// <see cref="RoleDataScopes.Own"/> luôn là false.
    /// </summary>
    public bool CanWrite { get; set; }

    /// <summary>Hai ký tự cuối của mã hồ sơ, vd "BM" trong 000036BM. UNIQUE.</summary>
    public string ProfileCodeSuffix { get; set; } = string.Empty;

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

public sealed class Permission
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>Nhóm module hiển thị trong màn phân quyền. Ví dụ: "Quản trị hệ thống", "Khảo sát", "Báo cáo".</summary>
    public string Category { get; set; } = string.Empty;
    /// <summary>
    /// Mã quyền cha khi đây là quyền của một tab bên trong module. Null là quyền của
    /// chính mục trên thanh điều hướng. Tab chỉ hiện khi cả quyền cha lẫn quyền tab đều bật.
    /// </summary>
    public string? ParentCode { get; set; }
}

public sealed class RolePermission
{
    public Guid Id { get; set; }
    public Guid RoleId { get; set; }
    public Guid PermissionId { get; set; }
    public bool IsGranted { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}

public sealed class AuthAuditLog
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public Guid? ProfileId { get; set; }
    public string? Email { get; set; }
    public string Event { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public string? Metadata { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class AuthSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ActiveProfileId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? RevokedReason { get; set; }
}
