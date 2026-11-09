using System.Text.Json.Nodes;

namespace Application.CourseGrades;

/// <summary>
/// Mức xem báo cáo phân tích điểm, suy ra từ phạm vi người dùng (UserScope):
/// <list type="bullet">
/// <item><c>full</c>: quản trị hệ thống, quản trị khảo sát và Ban giám hiệu — xem được hết, kể cả
/// tên giảng viên và dữ liệu cấp lớp. Đã chốt 09/11/2026, thay cho quy tắc R1 của bản audit
/// (Ban giám hiệu không thấy tên giảng viên).</item>
/// <item><c>unit</c>: quản lý khoa / bộ môn — học phần, lớp, giảng viên trong đơn vị của mình.</item>
/// </list>
/// </summary>
public static class CourseGradeViewLevels
{
    public const string Full = "full";
    public const string Unit = "unit";
}

public sealed record GradeAnalysisTermDto(int SemesterId, string TermCode, string Label, JsonNode? Summary);

public sealed record GradeAnalysisUnitDto(int Id, string Name, int? FacultyId);

/// <summary>Số lượt đặc điểm lặp lại (G1) của một kỳ, cho biểu đồ tổng hợp.</summary>
public sealed record GradeAnalysisRepetitionDto(
    int SemesterId,
    int PairCount,
    IReadOnlyDictionary<string, int> PairsByMarker,
    IReadOnlyDictionary<string, int> OngoingByMarker);

public sealed record CourseGradeAnalysisOverviewDto(
    string ViewLevel,
    int? ScopeFacultyId,
    int? ScopeDepartmentId,
    long? RunId,
    DateTime? FinishedAtUtc,
    int? ThresholdVersion,
    /// <summary>Bản chụp ngưỡng của lượt tính đang hiển thị, dạng {mã: giá trị}.</summary>
    JsonNode? Thresholds,
    IReadOnlyList<GradeAnalysisTermDto> Terms,
    IReadOnlyList<GradeAnalysisUnitDto> Faculties,
    IReadOnlyList<GradeAnalysisUnitDto> Departments,
    /// <summary>Phần liên kỳ: xu hướng toàn trường, lịch sử điểm lưu ý và điểm thi theo học phần
    /// (cấp unit chỉ có học phần trong đơn vị).</summary>
    JsonNode? CrossTerm,
    IReadOnlyList<GradeAnalysisRepetitionDto> Repetition,
    GradeAnalysisRunDto? LatestRun,
    /// <summary>Học phần có kết quả ở bất kỳ kỳ nào (trong phạm vi), để gọi tên ở bảng qua các kỳ.</summary>
    IReadOnlyList<GradeAnalysisCourseCatalogDto> Courses);

public sealed record GradeAnalysisCourseCatalogDto(string BaseCourseCode, string Name, int? DepartmentId, int? FacultyId);

/// <summary>Kết quả một học phần trong một kỳ.</summary>
public sealed record GradeAnalysisCourseDto(
    string BaseCourseCode,
    int? DepartmentId,
    int? FacultyId,
    IReadOnlyList<string> Flags,
    IReadOnlyList<string> StableStates,
    JsonNode Data);

public sealed record GradeAnalysisSectionDto(
    int CourseSectionId,
    string BaseCourseCode,
    int? LecturerId,
    string? LecturerName,
    int? DepartmentId,
    int? FacultyId,
    bool IncludedInStats,
    IReadOnlyList<string> Markers,
    JsonNode Data,
    JsonNode? Profile);

public sealed record GradeAnalysisLecturerCourseDto(
    int LecturerId,
    string? LecturerName,
    string BaseCourseCode,
    int? DepartmentId,
    int? FacultyId,
    JsonNode Data);

public interface ICourseGradeAnalysisService
{
    Task<CourseGradeAnalysisOverviewDto> GetOverviewAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<GradeAnalysisCourseDto>> GetCoursesAsync(
        int semesterId, int? facultyId, int? departmentId, CancellationToken cancellationToken = default);

    /// <summary>Phải lọc theo bộ môn hoặc học phần (danh sách cả trường kèm hồ sơ lớp quá lớn).</summary>
    Task<IReadOnlyList<GradeAnalysisSectionDto>> GetSectionsAsync(
        int semesterId, int? departmentId, string? courseCode, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<GradeAnalysisLecturerCourseDto>> GetLecturerCoursesAsync(
        int? departmentId, string? courseCode, CancellationToken cancellationToken = default);
}
