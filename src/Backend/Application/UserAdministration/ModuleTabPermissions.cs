using Application.Auth;

namespace Application.UserAdministration;

/// <summary>
/// Quyền của từng tab bên trong một module. Quyền module quyết định mục trên thanh
/// điều hướng có hiện hay không; quyền tab quyết định trong trang đó hiện những tab nào.
/// Tab chỉ hiện khi quyền cha của nó cũng đang bật.
/// <para>
/// Danh sách viết đúng thứ tự tab trên màn hình, tab con đứng ngay sau tab cha: trang
/// Phân quyền Module đọc thứ tự này để xếp các dòng. Tên phải trùng nhãn tab.
/// </para>
/// </summary>
public static class ModuleTabPermissions
{
    public sealed record Definition(string Code, string Name, string ParentCode);

    public static readonly IReadOnlyList<Definition> All =
    [
        // Thống kê & Báo cáo
        new("REPORTS_TAB_OVERVIEW", "Tổng quan", "REPORTS_ACCESS"),
        new("REPORTS_TAB_OVERVIEW_FACULTIES", "So sánh theo Khoa", "REPORTS_TAB_OVERVIEW"),
        new("REPORTS_TAB_OVERVIEW_QUALITY", "Chất lượng phản hồi", "REPORTS_TAB_OVERVIEW"),
        new("REPORTS_TAB_OVERVIEW_CRITERIA", "Điểm theo tiêu chí", "REPORTS_TAB_OVERVIEW"),
        new("REPORTS_TAB_FACULTIES", "Theo Khoa/Viện", "REPORTS_ACCESS"),
        new("REPORTS_TAB_DEPARTMENTS", "Theo Bộ môn", "REPORTS_ACCESS"),
        new("REPORTS_TAB_COURSES", "Theo Học phần", "REPORTS_ACCESS"),
        new("REPORTS_TAB_OPEN_COMMENTS", "Phân tích ý kiến mở", "REPORTS_ACCESS"),
        new("REPORTS_TAB_DETAILS", "Tra cứu chi tiết", "REPORTS_ACCESS"),

        // Phân tích chuyên sâu
        new("SURVEY_ANALYSIS_TAB_FACULTIES", "Phân tích theo khoa/viện", "SURVEY_ANALYSIS_ACCESS"),
        new("SURVEY_ANALYSIS_TAB_DEPARTMENTS", "Phân tích theo bộ môn", "SURVEY_ANALYSIS_ACCESS"),
        new("SURVEY_ANALYSIS_TAB_COURSES", "Phân tích theo học phần", "SURVEY_ANALYSIS_ACCESS"),
        new("SURVEY_ANALYSIS_TAB_SECTIONS", "Phân tích theo lớp học phần", "SURVEY_ANALYSIS_ACCESS"),
        new("SURVEY_ANALYSIS_TAB_LECTURERS", "Báo cáo giảng viên", "SURVEY_ANALYSIS_ACCESS"),

        // Đợt khảo sát CTĐT
        new("PROGRAM_CAMPAIGNS_TAB_COURSE", "Học phần", "PROGRAM_CAMPAIGNS_ACCESS"),
        new("PROGRAM_CAMPAIGNS_TAB_PROGRAM", "Chương trình đào tạo", "PROGRAM_CAMPAIGNS_ACCESS"),

        // Tiêu chí CTĐT
        new("PROGRAM_CRITERIA_TAB_COURSE", "Học phần", "PROGRAM_CRITERIA_ACCESS"),
        new("PROGRAM_CRITERIA_TAB_PROGRAM", "Chương trình đào tạo", "PROGRAM_CRITERIA_ACCESS"),

        // Người dùng & phân quyền
        new("USER_ADMIN_TAB_ACCOUNTS", "Tài khoản và hồ sơ", "USER_ADMIN_ACCESS"),
        new("USER_ADMIN_TAB_AUDIT", "Nhật ký hệ thống", "USER_ADMIN_ACCESS"),
        new(RequiredRolePermissions.UserAdminPermissionsTabCode, "Phân quyền Module", "USER_ADMIN_ACCESS"),
    ];

    /// <summary>
    /// Mặc định lúc một vai trò vừa có quyền cha. Giữ đúng những tab từng hiện trước khi
    /// có quyền tab: Phân tích chuyên sâu trước đây tự lọc tab theo vai trò, các module
    /// khác hiện đủ mọi tab. Sau lần đầu, người quản trị bật tắt thế nào thì giữ thế đó.
    /// </summary>
    public static bool IsGrantedByDefault(string roleCode, string tabCode)
    {
        var seesAllData = roleCode is RoleCodes.Admin or RoleCodes.SurveyAdmin or RoleCodes.BoardOfDirectors;
        return tabCode switch
        {
            "SURVEY_ANALYSIS_TAB_FACULTIES" => seesAllData,
            "SURVEY_ANALYSIS_TAB_DEPARTMENTS" or "SURVEY_ANALYSIS_TAB_COURSES" => roleCode != RoleCodes.Lecturer,
            _ => true,
        };
    }
}
