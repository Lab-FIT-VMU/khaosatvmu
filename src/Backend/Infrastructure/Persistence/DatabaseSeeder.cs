using Application.UserAdministration;
using Domain;
using Infrastructure.Catalog;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence;

public static class DatabaseSeeder
{
    public static async Task SeedAsync(
        AppDbContext db,
        bool includeDevelopmentData,
        CancellationToken cancellationToken = default)
    {
        var roles = await EnsureRolesAsync(db, cancellationToken);
        var permissions = await EnsurePermissionsAsync(db, cancellationToken);
        await EnsureRolePermissionsAsync(db, roles, permissions, cancellationToken);
        await CatalogImportAliasSeeder.SeedAsync(db, cancellationToken);
        if (includeDevelopmentData)
        {
            await EnsureDevUserAsync(db, roles, cancellationToken);
        }
    }

    private static async Task<Dictionary<string, Role>> EnsureRolesAsync(
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var definitions = new[]
        {
            (Code: "ADMIN", Name: "Quản trị hệ thống", Description: "Hồ sơ quản trị toàn hệ thống"),
            (Code: "LECTURER", Name: "Giảng viên", Description: "Hồ sơ giảng viên"),
            (Code: "DEPARTMENT_MANAGER", Name: "Trưởng bộ môn", Description: "Hồ sơ quản lý bộ môn"),
            (Code: "SURVEY_ADMIN", Name: "Quản trị khảo sát", Description: "Hồ sơ quản trị nghiệp vụ khảo sát")
        };

        var roles = new Dictionary<string, Role>(StringComparer.OrdinalIgnoreCase);
        foreach (var definition in definitions)
        {
            var role = await db.Roles.SingleOrDefaultAsync(x => x.Code == definition.Code, cancellationToken);
            if (role is null)
            {
                role = new Role
                {
                    Id = Guid.NewGuid(),
                    Code = definition.Code,
                    Name = definition.Name,
                    Description = definition.Description,
                    IsSystem = true
                };
                db.Roles.Add(role);
            }
            else
            {
                // Vai trò đã tồn tại từ các bản cài đặt cũ vẫn phải được Việt hoá;
                // nếu chỉ đổi dữ liệu khởi tạo thì CSDL đang chạy vẫn trả về tên cũ.
                role.Name = definition.Name;
                role.Description = definition.Description;
                role.IsSystem = true;
            }

            roles[definition.Code] = role;
        }

        await db.SaveChangesAsync(cancellationToken);

        // Tên hồ sơ do vai trò quyết định và giao diện không cho sửa tự do. Đồng bộ
        // cả dữ liệu cũ để không còn chỗ hiện "Admin hệ thống" trong chi tiết tài khoản.
        foreach (var (roleCode, role) in roles)
        {
            var profileName = ProfileNaming.ByRoleCode[roleCode].Name;
            await db.UserProfiles
                .Where(x => x.RoleId == role.Id && x.ProfileName != profileName)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(x => x.ProfileName, profileName)
                        .SetProperty(x => x.UpdatedAt, DateTime.UtcNow),
                    cancellationToken);
        }

        return roles;
    }

    private static async Task<Dictionary<string, Permission>> EnsurePermissionsAsync(
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var definitions = new[]
        {
            // Tên và nhóm phải trùng KHÍT với thanh điều hướng: trang phân quyền
            // là nơi người quản trị tích chọn từng module, đọc thấy tên khác tên
            // trên menu là không biết mình đang mở khoá cho trang nào.
            (Code: "PROGRESS_ACCESS",             Name: "Tiến độ thu phiếu",                Description: "Truy cập module tiến độ thu phiếu",                    Category: "Tổng quan"),
            (Code: "SURVEY_DASHBOARD_ACCESS",     Name: "Tổng quan khảo sát",                Description: "Truy cập module tổng quan khảo sát",                    Category: "Tổng quan"),
            (Code: "REPORTS_ACCESS",              Name: "Thống kê & Báo cáo",                Description: "Truy cập module thống kê và báo cáo",                  Category: "Tổng quan"),
            (Code: "SURVEY_STATISTICS_ACCESS",    Name: "Bảng dữ liệu khảo sát",             Description: "Truy cập module bảng dữ liệu khảo sát",                 Category: "Tổng quan"),
            (Code: "SURVEY_ANALYSIS_ACCESS",      Name: "Thống kê chi tiết",                 Description: "Truy cập module thống kê chi tiết",                    Category: "Tổng quan"),
            (Code: "GRADUATION_ANALYTICS_ACCESS", Name: "Thống kê tốt nghiệp",               Description: "Truy cập module thống kê sinh viên tốt nghiệp đúng hạn", Category: "Tổng quan"),
            (Code: "GRADUATION_ANALYTICS_2_ACCESS", Name: "Thống kê tốt nghiệp 2",            Description: "Truy cập module thống kê tốt nghiệp bản dựng lại",      Category: "Tổng quan"),
            (Code: "FACULTIES_ACCESS",            Name: "Khoa / Viện",                       Description: "Truy cập module quản lý khoa và viện",                  Category: "Danh mục đào tạo"),
            (Code: "DEPARTMENTS_ACCESS",          Name: "Bộ môn",                            Description: "Truy cập module quản lý bộ môn",                        Category: "Danh mục đào tạo"),
            (Code: "LECTURERS_ACCESS",            Name: "Giảng viên",                        Description: "Truy cập module quản lý giảng viên và chức vụ",         Category: "Danh mục đào tạo"),
            (Code: "MAJORS_ACCESS",               Name: "Ngành đào tạo",                     Description: "Truy cập module quản lý ngành đào tạo",                 Category: "Danh mục đào tạo"),
            (Code: "COHORT_MAJORS_ACCESS",        Name: "Khoá ngành đào tạo",                Description: "Truy cập module quản lý khoá học và khoá ngành đào tạo", Category: "Danh mục đào tạo"),
            (Code: "COURSES_ACCESS",              Name: "Học phần",                          Description: "Truy cập module quản lý học phần",                      Category: "Danh mục đào tạo"),
            (Code: "COURSE_SECTIONS_ACCESS",      Name: "Lớp học phần",                      Description: "Truy cập module quản lý lớp học phần, năm học và học kỳ", Category: "Danh mục đào tạo"),
            (Code: "COURSE_QUESTION_SETS_ACCESS", Name: "Danh sách bộ khảo sát",             Description: "Truy cập module bộ câu hỏi khảo sát học phần",         Category: "Khảo sát học phần"),
            (Code: "COURSE_CAMPAIGNS_ACCESS",     Name: "Danh sách đợt khảo sát",            Description: "Truy cập module đợt khảo sát học phần",                Category: "Khảo sát học phần"),
            (Code: "PROGRAM_CAMPAIGNS_ACCESS",    Name: "Đợt khảo sát CTĐT",                 Description: "Truy cập module đợt khảo sát chương trình đào tạo",     Category: "Khảo sát chương trình"),
            (Code: "PROGRAM_CRITERIA_ACCESS",     Name: "Tiêu chí CTĐT",                     Description: "Truy cập module tiêu chí chương trình đào tạo",        Category: "Khảo sát chương trình"),
            (Code: "USER_ADMIN_ACCESS",           Name: "Người dùng & phân quyền",           Description: "Truy cập module quản trị người dùng và phân quyền",    Category: "Quản trị"),
        };

        var permissions = new Dictionary<string, Permission>(StringComparer.OrdinalIgnoreCase);
        foreach (var definition in definitions)
        {
            var permission = await db.Permissions.SingleOrDefaultAsync(x => x.Code == definition.Code, cancellationToken);
            if (permission is null)
            {
                permission = new Permission
                {
                    Id = Guid.NewGuid(),
                    Code = definition.Code,
                    Name = definition.Name,
                    Description = definition.Description,
                    Category = definition.Category
                };
                db.Permissions.Add(permission);
            }
            else
            {
                // Đổi tên module thì cập nhật luôn dòng đã có. Trước đây chỉ thêm
                // khi thiếu, nên đổi tên trong mã xong CSDL vẫn giữ tên cũ và trang
                // phân quyền hiện tên không còn khớp menu nữa.
                permission.Name = definition.Name;
                permission.Description = definition.Description;
                permission.Category = definition.Category;
            }

            permissions[definition.Code] = permission;
        }

        await db.SaveChangesAsync(cancellationToken);
        return permissions;
    }

    private static async Task EnsureRolePermissionsAsync(
        AppDbContext db,
        IReadOnlyDictionary<string, Role> roles,
        IReadOnlyDictionary<string, Permission> permissions,
        CancellationToken cancellationToken)
    {
        var definitions = new[]
        {
            // ADMIN: truy cập toàn bộ module.
            (RoleCode: "ADMIN", PermissionCode: "PROGRESS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "SURVEY_DASHBOARD_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "REPORTS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "SURVEY_STATISTICS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "SURVEY_ANALYSIS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "GRADUATION_ANALYTICS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "GRADUATION_ANALYTICS_2_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "FACULTIES_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "DEPARTMENTS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "LECTURERS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "MAJORS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COHORT_MAJORS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSES_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSE_SECTIONS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSE_QUESTION_SETS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSE_CAMPAIGNS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "PROGRAM_CAMPAIGNS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "PROGRAM_CRITERIA_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "USER_ADMIN_ACCESS"),

            // SURVEY_ADMIN: toàn bộ module nghiệp vụ, không có quản trị người dùng.
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "PROGRESS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "SURVEY_DASHBOARD_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "REPORTS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "SURVEY_STATISTICS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "SURVEY_ANALYSIS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "GRADUATION_ANALYTICS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "GRADUATION_ANALYTICS_2_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "FACULTIES_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "DEPARTMENTS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "LECTURERS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "MAJORS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COHORT_MAJORS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSES_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSE_SECTIONS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSE_QUESTION_SETS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSE_CAMPAIGNS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "PROGRAM_CAMPAIGNS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "PROGRAM_CRITERIA_ACCESS"),

            // DEPARTMENT_MANAGER: chỉ tiến độ và báo cáo trong Phase 2.
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "PROGRESS_ACCESS"),
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "SURVEY_DASHBOARD_ACCESS"),
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "REPORTS_ACCESS"),
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "SURVEY_STATISTICS_ACCESS"),
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "SURVEY_ANALYSIS_ACCESS"),
        };

        foreach (var definition in definitions)
        {
            var role = roles[definition.RoleCode];
            var permission = permissions[definition.PermissionCode];
            var existing = await db.RolePermissions.SingleOrDefaultAsync(x =>
                x.RoleId == role.Id && x.PermissionId == permission.Id,
                cancellationToken);

            if (existing is null)
            {
                db.RolePermissions.Add(new RolePermission
                {
                    Id = Guid.NewGuid(),
                    RoleId = role.Id,
                    PermissionId = permission.Id,
                    IsGranted = true,
                    CreatedAt = DateTime.UtcNow
                });
            }
            else if (RequiredRolePermissions.IsRequired(definition.RoleCode, definition.PermissionCode))
            {
                // Tự phục hồi dữ liệu đã bị tắt trước khi có ràng buộc này. Nếu không,
                // admin sẽ bị khóa ngoài màn hình duy nhất có thể cấp lại quyền.
                existing.IsGranted = true;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static async Task EnsureDevUserAsync(
        AppDbContext db,
        IReadOnlyDictionary<string, Role> roles,
        CancellationToken cancellationToken)
    {
        const string email = "abc@vmu.edu.vn";
        var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email, cancellationToken);
        if (user is null)
        {
            user = new User
            {
                Id = Guid.NewGuid(),
                GoogleSubject = "dev-sub-001",
                Email = email,
                DisplayName = "Nguyen Van A",
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.Users.Add(user);
            await db.SaveChangesAsync(cancellationToken);
        }

        await EnsureProfileAsync(
            db,
            user,
            roles["LECTURER"],
            "LECTURER_MAIN",
            ProfileNaming.ByRoleCode["LECTURER"].Name,
            "CNTT",
            "Khoa CNTT",
            isDefault: true,
            cancellationToken);

        await EnsureProfileAsync(
            db,
            user,
            roles["SURVEY_ADMIN"],
            "SURVEY_ADMIN",
            ProfileNaming.ByRoleCode["SURVEY_ADMIN"].Name,
            "SURVEY",
            "Phong khao sat",
            isDefault: false,
            cancellationToken);

        await EnsureProfileAsync(
            db,
            user,
            roles["ADMIN"],
            "ADMIN_SYSTEM",
            ProfileNaming.ByRoleCode["ADMIN"].Name,
            null,
            null,
            isDefault: false,
            cancellationToken);
    }

    private static async Task EnsureProfileAsync(
        AppDbContext db,
        User user,
        Role role,
        string profileCode,
        string profileName,
        string? organizationUnitCode,
        string? organizationUnitName,
        bool isDefault,
        CancellationToken cancellationToken)
    {
        var profile = await db.UserProfiles.SingleOrDefaultAsync(x => x.ProfileCode == profileCode, cancellationToken);
        if (profile is not null)
        {
            return;
        }

        db.UserProfiles.Add(new UserProfile
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            RoleId = role.Id,
            ProfileName = profileName,
            ProfileCode = profileCode,
            OrganizationUnitCode = organizationUnitCode,
            OrganizationUnitName = organizationUnitName,
            IsActive = true,
            IsDefault = isDefault,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });

        await db.SaveChangesAsync(cancellationToken);
    }
}
