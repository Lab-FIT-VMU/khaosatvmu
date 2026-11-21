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
        await Infrastructure.CourseGrades.GradeAnalysisThresholdSeeder.SeedAsync(db, cancellationToken);
        if (includeDevelopmentData)
        {
            await EnsureDevUserAsync(db, roles, cancellationToken);
        }
    }

    /// <summary>
    /// Sáu vai trò mặc định, chỉ tạo khi chưa từng có (cài mới). Sau đó người quản trị tự
    /// sửa tên, phạm vi, quyền ghi, hoặc xóa — trình khởi tạo không ghi đè và không tạo lại
    /// vai trò đã bị xóa.
    /// </summary>
    internal static readonly (string Code, string Name, string Description, string DataScope, bool CanWrite, string Suffix, bool IsSystem)[] DefaultRoles =
    [
        ("ADMIN", "Quản trị hệ thống", "Hồ sơ quản trị toàn hệ thống", RoleDataScopes.All, true, "AD", true),
        ("LECTURER", "Giảng viên", "Hồ sơ giảng viên, chỉ xem các lớp mình dạy", RoleDataScopes.Own, false, "GV", true),
        ("DEPARTMENT_MANAGER", "Quản lý bộ môn", "Hồ sơ quản lý bộ môn, cấp cho Trưởng bộ môn và Phó bộ môn", RoleDataScopes.Department, true, "BM", false),
        ("FACULTY_MANAGER", "Quản lý khoa", "Hồ sơ quản lý khoa/viện, cấp cho Trưởng khoa và Phó trưởng khoa, xem mọi bộ môn trong khoa", RoleDataScopes.Faculty, true, "KV", false),
        ("SURVEY_ADMIN", "Quản trị khảo sát", "Hồ sơ quản trị nghiệp vụ khảo sát", RoleDataScopes.All, true, "QT", false),
        ("BOARD_OF_DIRECTORS", "Ban Giám hiệu", "Hồ sơ xem toàn trường, chỉ đọc", RoleDataScopes.All, false, "GH", false),
    ];

    /// <summary>Trả về các vai trò mặc định CÒN DÙNG (chưa bị xóa), tra theo mã.</summary>
    private static async Task<Dictionary<string, Role>> EnsureRolesAsync(
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var roles = new Dictionary<string, Role>(StringComparer.OrdinalIgnoreCase);
        foreach (var definition in DefaultRoles)
        {
            // Nhìn cả dòng đã xóa mềm: vai trò người quản trị đã xóa thì để yên, không
            // tạo lại mỗi lần API khởi động.
            var role = await db.Roles.IgnoreQueryFilters()
                .SingleOrDefaultAsync(x => x.Code == definition.Code, cancellationToken);
            if (role is null)
            {
                role = new Role
                {
                    Id = Guid.NewGuid(),
                    Code = definition.Code,
                    Name = definition.Name,
                    Description = definition.Description,
                    DataScope = definition.DataScope,
                    CanWrite = definition.CanWrite,
                    ProfileCodeSuffix = definition.Suffix,
                    IsSystem = definition.IsSystem,
                };
                db.Roles.Add(role);
            }
            else if (definition.IsSystem)
            {
                // Hai vai trò không xóa được luôn còn; ADMIN luôn thấy và ghi toàn trường,
                // không thì không ai còn vào được trang phân quyền để sửa lại.
                role.IsSystem = true;
                role.IsDeleted = false;
                role.DeletedAt = null;
                if (definition.Code == RequiredRolePermissions.AdminRoleCode)
                {
                    role.DataScope = RoleDataScopes.All;
                    role.CanWrite = true;
                }
            }

            if (!role.IsDeleted)
            {
                roles[definition.Code] = role;
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        // Tên hồ sơ là tên vai trò và giao diện không cho sửa tự do. Đồng bộ cả dữ liệu cũ
        // (và hồ sơ của vai trò vừa đổi tên) để chi tiết tài khoản luôn khớp.
        await db.Database.ExecuteSqlRawAsync(
            """
            UPDATE "UserProfiles" AS p
            SET "ProfileName" = r."Name", "UpdatedAt" = now()
            FROM "Roles" AS r
            WHERE r."Id" = p."RoleId" AND p."ProfileName" <> r."Name"
            """,
            cancellationToken);

        return roles;
    }

    private static async Task<Dictionary<string, Permission>> EnsurePermissionsAsync(
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var moduleDefinitions = new[]
        {
            // Tên và nhóm phải trùng KHÍT với thanh điều hướng: trang phân quyền
            // là nơi người quản trị tích chọn từng module, đọc thấy tên khác tên
            // trên menu là không biết mình đang mở khoá cho trang nào.
            (Code: "DASHBOARD_ACCESS",            Name: "Bảng điều khiển",                   Description: "Truy cập module bảng điều khiển",                       Category: "Thống kê khảo sát học phần"),
            (Code: "SURVEY_DASHBOARD_ACCESS",     Name: "Tổng quan khảo sát",                Description: "Truy cập module tổng quan khảo sát",                    Category: "Thống kê khảo sát học phần"),
            (Code: "PROGRESS_ACCESS",             Name: "Tiến độ thu phiếu",                Description: "Truy cập module tiến độ thu phiếu",                    Category: "Thống kê khảo sát học phần"),
            (Code: "SURVEY_STATISTICS_ACCESS",    Name: "Bảng dữ liệu khảo sát",             Description: "Truy cập module bảng dữ liệu khảo sát",                 Category: "Thống kê khảo sát học phần"),
            (Code: "REPORTS_ACCESS",              Name: "Thống kê & Báo cáo",                Description: "Truy cập module thống kê và báo cáo",                  Category: "Thống kê khảo sát học phần"),
            (Code: "SURVEY_ANALYSIS_ACCESS",      Name: "Phân tích chuyên sâu",              Description: "Truy cập module phân tích chuyên sâu",                 Category: "Thống kê khảo sát học phần"),
            (Code: "GRADUATION_UPLOAD_ACCESS",    Name: "Tải lên dữ liệu",                  Description: "Tải lên và xoá đợt dữ liệu tốt nghiệp",                Category: "Thống kê tốt nghiệp"),
            (Code: "GRADUATION_ANALYTICS_ACCESS", Name: "Thống kê chi tiết",                 Description: "Xem thống kê sinh viên tốt nghiệp",                    Category: "Thống kê tốt nghiệp"),
            // Phân tích điểm học phần: tải lên và ngưỡng tách khỏi quyền xem như module tốt
            // nghiệp. Ai được sửa phương pháp (ngưỡng bộ luật D, E) do quyền thứ hai quyết định.
            (Code: "COURSE_GRADE_UPLOAD_ACCESS",     Name: "Tải lên dữ liệu điểm",        Description: "Tải lên, nạp lại và gỡ file điểm học phần theo học kỳ", Category: "Phân tích điểm học phần"),
            (Code: "COURSE_GRADE_THRESHOLDS_ACCESS", Name: "Ngưỡng phân tích",            Description: "Sửa và khôi phục ngưỡng phân tích điểm học phần",       Category: "Phân tích điểm học phần"),
            (Code: "COURSE_GRADE_ANALYSIS_ACCESS",   Name: "Báo cáo phân tích",           Description: "Xem báo cáo phân tích điểm học phần",                   Category: "Phân tích điểm học phần"),
            // Module audit chạy riêng trong container audit-grade: một mục trên thanh điều
            // hướng, một quyền. Mặc định chỉ cấp cho ADMIN (dữ liệu có tên giảng viên, không lọc
            // theo khoa / bộ môn).
            (Code: "AUDIT_GRADE_MODULE_ACCESS",      Name: "Phân tích điểm (bản audit)",  Description: "Mở module phân tích điểm học phần bản audit: xem báo cáo, nạp học kỳ, sửa tham số", Category: "Phân tích điểm (bản audit)"),
            (Code: "DESIGN_SYSTEM_ACCESS",       Name: "Design System",                    Description: "Truy cập và tùy chỉnh bộ màu chung trên trình duyệt",     Category: "Design System"),
            (Code: "ACADEMIC_YEARS_ACCESS",       Name: "Năm học & học kỳ",                  Description: "Truy cập module quản lý năm học và học kỳ",            Category: "Danh mục đào tạo"),
            (Code: "FACULTIES_ACCESS",            Name: "Khoa / Viện",                       Description: "Truy cập module quản lý khoa và viện",                  Category: "Danh mục đào tạo"),
            (Code: "DEPARTMENTS_ACCESS",          Name: "Bộ môn",                            Description: "Truy cập module quản lý bộ môn",                        Category: "Danh mục đào tạo"),
            (Code: "LECTURERS_ACCESS",            Name: "Giảng viên",                        Description: "Truy cập module quản lý giảng viên và chức vụ",         Category: "Danh mục đào tạo"),
            (Code: "MAJORS_ACCESS",               Name: "Ngành đào tạo",                     Description: "Truy cập module quản lý ngành đào tạo",                 Category: "Danh mục đào tạo"),
            (Code: "COHORT_MAJORS_ACCESS",        Name: "Khoá ngành đào tạo",                Description: "Truy cập module quản lý khoá học và khoá ngành đào tạo", Category: "Danh mục đào tạo"),
            (Code: "COURSES_ACCESS",              Name: "Học phần",                          Description: "Truy cập module quản lý học phần",                      Category: "Danh mục đào tạo"),
            (Code: "COURSE_SECTIONS_ACCESS",      Name: "Lớp học phần",                      Description: "Truy cập module quản lý lớp học phần",                  Category: "Danh mục đào tạo"),
            // Nhóm "Khảo sát" trên thanh điều hướng: một trang bộ câu hỏi và một trang đợt dùng
            // chung cho cả ba loại khảo sát (học phần, CTĐT, giảng viên).
            (Code: "COURSE_QUESTION_SETS_ACCESS", Name: "Danh sách bộ câu hỏi",              Description: "Truy cập module bộ câu hỏi khảo sát",                  Category: "Khảo sát"),
            (Code: "COURSE_CAMPAIGNS_ACCESS",     Name: "Danh sách bài khảo sát",            Description: "Truy cập module đợt khảo sát của cả ba loại khảo sát", Category: "Khảo sát"),
            (Code: "USER_ADMIN_ACCESS",           Name: "Người dùng & phân quyền",           Description: "Truy cập module quản trị người dùng và phân quyền",    Category: "Quản trị"),
            // Hai quyền dưới đây không mở thêm mục nào trên menu. Chúng khoá hai thao tác
            // ghi của tính năng phân loại cảm xúc: sửa nhãn model đã đoán, và chạy lại model.
            // Không cấp sẵn cho DEPARTMENT_MANAGER: xem được kết quả không có nghĩa là được sửa.
            (Code: "OPEN_COMMENT_SENTIMENT_REVIEW", Name: "Hiệu chỉnh cảm xúc ý kiến mở", Description: "Sửa nhãn cảm xúc do model dự đoán trên màn Phân tích ý kiến mở", Category: "Thống kê khảo sát học phần"),
            (Code: "OPEN_COMMENT_MODEL_ADMIN",    Name: "Quản trị model cảm xúc",           Description: "Xem trạng thái model và chạy lại phân tích cảm xúc",     Category: "Quản trị"),
        };

        // Thống kê CTĐT / giảng viên: các trang như học phần trừ Phân tích chuyên sâu, mỗi
        // trang một quyền riêng, nằm trong nhóm riêng giống thanh điều hướng.
        var definitions = moduleDefinitions
            .Concat(SurveyStatisticsPermissions.UnitGroups.SelectMany(group =>
                SurveyStatisticsPermissions.UnitPages.Select(page => (
                    Code: SurveyStatisticsPermissions.UnitCode(group, page),
                    page.Name,
                    Description: $"Truy cập module {page.Name.ToLowerInvariant()} của {group.Category.ToLowerInvariant()}",
                    group.Category))))
            .ToArray();

        // Quyền tab nằm cùng nhóm với module cha để trang phân quyền xếp ngay dưới nó.
        var categoryByCode = definitions.ToDictionary(x => x.Code, x => x.Category, StringComparer.OrdinalIgnoreCase);
        var allDefinitions = definitions
            .Select(x => (x.Code, x.Name, x.Description, x.Category, ParentCode: (string?)null))
            .ToList();
        foreach (var tab in ModuleTabPermissions.All)
        {
            var category = categoryByCode[tab.ParentCode];
            categoryByCode[tab.Code] = category;
            allDefinitions.Add((tab.Code, tab.Name, $"Xem tab {tab.Name}", category, tab.ParentCode));
        }

        // Trang đã bỏ thì xoá luôn quyền, không thì trang Phân quyền Module còn hiện mục bật
        // tắt không có tác dụng gì. Dòng RolePermissions đi theo nhờ khoá ngoại xoá dây chuyền.
        // STUDENTS_ACCESS: trang Danh mục sinh viên đã bỏ cùng bảng Students — hệ thống
        // không lưu sinh viên nữa.
        // Đợt khảo sát CTĐT / Tiêu chí CTĐT (và các quyền tab của chúng): hai trang cũ đã gộp
        // vào nhóm "Khảo sát" chung, không còn mục nào trên thanh điều hướng.
        string[] retiredModuleCodes =
        [
            "STUDENTS_ACCESS",
            "PROGRAM_CAMPAIGNS_ACCESS",
            "PROGRAM_CAMPAIGNS_TAB_COURSE",
            "PROGRAM_CAMPAIGNS_TAB_PROGRAM",
            "PROGRAM_CRITERIA_ACCESS",
            "PROGRAM_CRITERIA_TAB_COURSE",
            "PROGRAM_CRITERIA_TAB_PROGRAM",
        ];
        await db.Permissions
            .Where(x => SurveyStatisticsPermissions.RetiredUnitCodes.Contains(x.Code)
                || retiredModuleCodes.Contains(x.Code))
            .ExecuteDeleteAsync(cancellationToken);

        var permissions = new Dictionary<string, Permission>(StringComparer.OrdinalIgnoreCase);
        foreach (var definition in allDefinitions)
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
                    Category = definition.Category,
                    ParentCode = definition.ParentCode
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
                permission.ParentCode = definition.ParentCode;
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
            (RoleCode: "ADMIN", PermissionCode: "DASHBOARD_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "PROGRESS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "SURVEY_DASHBOARD_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "REPORTS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "SURVEY_STATISTICS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "SURVEY_ANALYSIS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "GRADUATION_UPLOAD_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "GRADUATION_ANALYTICS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSE_GRADE_UPLOAD_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSE_GRADE_THRESHOLDS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSE_GRADE_ANALYSIS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "AUDIT_GRADE_MODULE_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "DESIGN_SYSTEM_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "ACADEMIC_YEARS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "FACULTIES_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "DEPARTMENTS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "LECTURERS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "MAJORS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COHORT_MAJORS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSES_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSE_SECTIONS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSE_QUESTION_SETS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "COURSE_CAMPAIGNS_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "USER_ADMIN_ACCESS"),
            (RoleCode: "ADMIN", PermissionCode: "OPEN_COMMENT_SENTIMENT_REVIEW"),
            (RoleCode: "ADMIN", PermissionCode: "OPEN_COMMENT_MODEL_ADMIN"),

            // SURVEY_ADMIN: toàn bộ module nghiệp vụ, không có quản trị người dùng.
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "DASHBOARD_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "PROGRESS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "SURVEY_DASHBOARD_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "REPORTS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "SURVEY_STATISTICS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "SURVEY_ANALYSIS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "GRADUATION_UPLOAD_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "GRADUATION_ANALYTICS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSE_GRADE_UPLOAD_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSE_GRADE_THRESHOLDS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSE_GRADE_ANALYSIS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "ACADEMIC_YEARS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "FACULTIES_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "DEPARTMENTS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "LECTURERS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "MAJORS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COHORT_MAJORS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSES_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSE_SECTIONS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSE_QUESTION_SETS_ACCESS"),
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "COURSE_CAMPAIGNS_ACCESS"),
            // SURVEY_ADMIN sửa được nhãn nhưng không quản trị model: đổi model là thay đổi
            // kỹ thuật, phải để lại dấu vết ở tài khoản quản trị hệ thống.
            (RoleCode: "SURVEY_ADMIN", PermissionCode: "OPEN_COMMENT_SENTIMENT_REVIEW"),

            // BOARD_OF_DIRECTORS: mở đúng bằng SURVEY_ADMIN. Khác nhau ở chỗ vai trò này
            // chỉ ĐỌC — chặn ghi nằm ở UserScope.IsReadOnly chứ không ở danh sách module,
            // vì quyền module chỉ quyết định vào được trang nào.
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "DASHBOARD_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "PROGRESS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "SURVEY_DASHBOARD_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "REPORTS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "SURVEY_STATISTICS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "SURVEY_ANALYSIS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "GRADUATION_ANALYTICS_ACCESS"),
            // Ban giám hiệu xem được hết báo cáo phân tích điểm, như quản trị hệ thống (chốt 09/11/2026).
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "COURSE_GRADE_ANALYSIS_ACCESS"),
            // Ban Giám hiệu xem được danh sách năm học; thêm / sửa vẫn bị service chặn.
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "ACADEMIC_YEARS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "FACULTIES_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "DEPARTMENTS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "LECTURERS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "MAJORS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "COHORT_MAJORS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "COURSES_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "COURSE_SECTIONS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "COURSE_QUESTION_SETS_ACCESS"),
            (RoleCode: "BOARD_OF_DIRECTORS", PermissionCode: "COURSE_CAMPAIGNS_ACCESS"),

            // DEPARTMENT_MANAGER: chỉ tiến độ và báo cáo trong Phase 2.
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "PROGRESS_ACCESS"),
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "SURVEY_DASHBOARD_ACCESS"),
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "REPORTS_ACCESS"),
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "SURVEY_STATISTICS_ACCESS"),
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "SURVEY_ANALYSIS_ACCESS"),
            // Báo cáo cấp bộ môn, lọc theo UserScope.
            (RoleCode: "DEPARTMENT_MANAGER", PermissionCode: "COURSE_GRADE_ANALYSIS_ACCESS"),

            // FACULTY_MANAGER: cùng bộ module với trưởng bộ môn, khác ở phạm vi dữ liệu.
            (RoleCode: "FACULTY_MANAGER", PermissionCode: "PROGRESS_ACCESS"),
            (RoleCode: "FACULTY_MANAGER", PermissionCode: "SURVEY_DASHBOARD_ACCESS"),
            (RoleCode: "FACULTY_MANAGER", PermissionCode: "REPORTS_ACCESS"),
            (RoleCode: "FACULTY_MANAGER", PermissionCode: "SURVEY_STATISTICS_ACCESS"),
            (RoleCode: "FACULTY_MANAGER", PermissionCode: "SURVEY_ANALYSIS_ACCESS"),
            // Báo cáo cấp khoa, lọc theo UserScope.
            (RoleCode: "FACULTY_MANAGER", PermissionCode: "COURSE_GRADE_ANALYSIS_ACCESS"),
        }.ToList();

        // Thống kê CTĐT / giảng viên chỉ quản trị toàn trường xem được (service cũng chặn
        // các vai trò khác), nên chỉ cấp sẵn cho hai vai trò này.
        foreach (var roleCode in new[] { "ADMIN", "SURVEY_ADMIN" })
        {
            definitions.AddRange(SurveyStatisticsPermissions.AllUnitCodes
                .Select(code => (RoleCode: roleCode, PermissionCode: code)));
        }

        foreach (var definition in definitions)
        {
            // Vai trò mặc định đã bị người quản trị xóa thì thôi cấp quyền cho nó.
            if (!roles.TryGetValue(definition.RoleCode, out var role)) continue;
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
        await EnsureTabPermissionsAsync(db, roles, permissions, cancellationToken);
    }

    /// <summary>
    /// Cấp quyền tab cho mọi vai trò đang có quyền cha mà chưa có dòng nào cho tab đó —
    /// kể cả vai trò được người quản trị cấp quyền module bằng tay. Đã có dòng (bật hay
    /// tắt) thì để nguyên: đó là lựa chọn của người quản trị.
    /// </summary>
    private static async Task EnsureTabPermissionsAsync(
        AppDbContext db,
        IReadOnlyDictionary<string, Role> roles,
        IReadOnlyDictionary<string, Permission> permissions,
        CancellationToken cancellationToken)
    {
        var rows = await db.RolePermissions.ToListAsync(cancellationToken);
        var rowByPair = rows.ToDictionary(x => (x.RoleId, x.PermissionId));

        // Mọi vai trò còn dùng, kể cả vai trò người quản trị tự thêm.
        var allRoles = await db.Roles.ToListAsync(cancellationToken);
        foreach (var role in allRoles)
        {
            // Danh sách tab xếp tab cha trước tab con, nên tab con đọc được trạng thái
            // tab cha vừa thêm ở vòng trước.
            foreach (var tab in ModuleTabPermissions.All)
            {
                var tabPermission = permissions[tab.Code];
                if (rowByPair.ContainsKey((role.Id, tabPermission.Id))) continue;

                var parentPermission = permissions[tab.ParentCode];
                var parentGranted = rowByPair.TryGetValue((role.Id, parentPermission.Id), out var parentRow)
                    && parentRow.IsGranted;
                if (!parentGranted) continue;

                var row = new RolePermission
                {
                    Id = Guid.NewGuid(),
                    RoleId = role.Id,
                    PermissionId = tabPermission.Id,
                    IsGranted = ModuleTabPermissions.IsGrantedByDefault(role.DataScope, tab.Code),
                    CreatedAt = DateTime.UtcNow
                };
                db.RolePermissions.Add(row);
                rowByPair[(role.Id, tabPermission.Id)] = row;
            }

            foreach (var tab in ModuleTabPermissions.All)
            {
                if (!RequiredRolePermissions.IsRequired(role.Code, tab.Code)) continue;
                if (rowByPair.TryGetValue((role.Id, permissions[tab.Code].Id), out var requiredRow))
                {
                    requiredRow.IsGranted = true;
                }
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

        // Hồ sơ thử của môi trường phát triển; vai trò nào đã bị xóa thì bỏ qua.
        (string RoleCode, string ProfileCode, string? UnitCode, string? UnitName, bool IsDefault)[] devProfiles =
        [
            ("LECTURER", "LECTURER_MAIN", "CNTT", "Khoa CNTT", true),
            ("SURVEY_ADMIN", "SURVEY_ADMIN", "SURVEY", "Phong khao sat", false),
            ("ADMIN", "ADMIN_SYSTEM", null, null, false),
        ];
        foreach (var item in devProfiles)
        {
            if (!roles.TryGetValue(item.RoleCode, out var role)) continue;
            await EnsureProfileAsync(
                db,
                user,
                role,
                item.ProfileCode,
                role.Name,
                item.UnitCode,
                item.UnitName,
                item.IsDefault,
                cancellationToken);
        }
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
