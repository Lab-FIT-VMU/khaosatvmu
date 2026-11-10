namespace Application.UserAdministration;

/// <summary>
/// Quyền của ba nhóm "Thống kê khảo sát ..." trên thanh điều hướng. Nhóm học phần có sáu
/// trang (Bảng điều khiển → Phân tích chuyên sâu), hai nhóm còn lại không có Phân tích
/// chuyên sâu; nhóm học phần dùng quyền gốc,
/// hai nhóm CTĐT và giảng viên có quyền riêng mang tiền tố loại khảo sát, ví dụ
/// <c>PROGRAM_PROGRESS_ACCESS</c>, để trang Phân quyền Module bật tắt được từng mục.
/// <para>
/// Mã quyền phía frontend ghép đúng theo quy tắc này (auth/modulePermissions.ts), đổi một
/// bên phải đổi cả bên kia.
/// </para>
/// </summary>
public static class SurveyStatisticsPermissions
{
    public sealed record Page(string CourseCode, string Name);

    public sealed record Group(string Prefix, string Category);

    /// <summary>Sáu trang theo đúng thứ tự trên thanh điều hướng.</summary>
    public static readonly IReadOnlyList<Page> Pages =
    [
        new("DASHBOARD_ACCESS", "Bảng điều khiển"),
        new("SURVEY_DASHBOARD_ACCESS", "Tổng quan khảo sát"),
        new("PROGRESS_ACCESS", "Tiến độ thu phiếu"),
        new("SURVEY_STATISTICS_ACCESS", "Bảng dữ liệu khảo sát"),
        new("REPORTS_ACCESS", "Thống kê & Báo cáo"),
        new("SURVEY_ANALYSIS_ACCESS", "Phân tích chuyên sâu"),
    ];

    public const string CourseCategory = "Thống kê khảo sát học phần";

    /// <summary>Hai loại khảo sát có quyền riêng, theo thứ tự nhóm trên thanh điều hướng.</summary>
    public static readonly IReadOnlyList<Group> UnitGroups =
    [
        new("PROGRAM", "Thống kê khảo sát chương trình đào tạo"),
        new("LECTURER", "Thống kê khảo sát giảng viên"),
    ];

    public static string UnitCode(Group group, Page page) => $"{group.Prefix}_{page.CourseCode}";

    /// <summary>
    /// Trang của nhóm CTĐT / giảng viên: không có Phân tích chuyên sâu. Quyền "Bảng điều
    /// khiển" của hai nhóm vẫn giữ — nó quyết định đợt của loại đó có hiện trong Bảng điều
    /// khiển chung ở đầu thanh điều hướng không.
    /// </summary>
    public static readonly IReadOnlyList<Page> UnitPages = Pages
        .Where(page => page.CourseCode != "SURVEY_ANALYSIS_ACCESS")
        .ToList();

    /// <summary>Mười quyền của hai nhóm CTĐT và giảng viên.</summary>
    public static readonly IReadOnlyList<string> AllUnitCodes = UnitGroups
        .SelectMany(group => UnitPages.Select(page => UnitCode(group, page)))
        .ToList();

    /// <summary>Quyền đã bỏ cùng trang Phân tích chuyên sâu của CTĐT / giảng viên; seeder xoá khỏi CSDL.</summary>
    public static readonly IReadOnlyList<string> RetiredUnitCodes = UnitGroups
        .Select(group => $"{group.Prefix}_SURVEY_ANALYSIS_ACCESS")
        .ToList();
}
