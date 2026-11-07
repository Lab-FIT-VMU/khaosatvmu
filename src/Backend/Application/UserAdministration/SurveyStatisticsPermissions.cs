namespace Application.UserAdministration;

/// <summary>
/// Quyền của ba nhóm "Thống kê khảo sát ..." trên thanh điều hướng. Mỗi nhóm có sáu trang
/// giống hệt nhau (Bảng điều khiển → Phân tích chuyên sâu); nhóm học phần dùng quyền gốc,
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

    /// <summary>Mười hai quyền của hai nhóm CTĐT và giảng viên.</summary>
    public static readonly IReadOnlyList<string> AllUnitCodes = UnitGroups
        .SelectMany(group => Pages.Select(page => UnitCode(group, page)))
        .ToList();
}
