using Application.Surveys;

namespace Application.Reports;

/// <summary>Chi tiết tiến độ thu phiếu của một lớp học phần.</summary>
public sealed record SectionProgressDetailDto(
    int CourseSectionSurveyId,
    string CourseCode,
    string CourseName,
    string SectionName,
    string LecturerName,
    int ClassSize,
    /// <summary>Số phiếu HỢP LỆ. Phiếu bị bộ lọc nhiễu loại không được tính.</summary>
    int ResponseCount,
    /// <summary>Phiếu hợp lệ chia sĩ số, theo phần trăm.</summary>
    decimal CompletionRate,
    string Status);

/// <summary>Báo cáo tiến độ vận hành thu phiếu theo học kỳ.</summary>
public sealed record OperationalProgressReportDto(
    int SemesterId,
    string SemesterName,
    string AcademicYearName,
    int TotalTargetResponses,
    /// <summary>Tổng phiếu HỢP LỆ đã thu, không đếm phiếu bị bộ lọc loại.</summary>
    int TotalActualResponses,
    decimal OverallCompletionRate,
    int CompletedSectionCount,
    int InProgressSectionCount,
    int LaggingSectionCount,
    IReadOnlyList<SectionProgressDetailDto> SectionDetails);

/// <summary>Thống kê số lượng và tỷ lệ % của một lựa chọn điểm 1..5.</summary>
public sealed record OptionCountDto(
    int Value,
    string DisplayText,
    int Count,
    decimal Percentage);

/// <summary>
/// Thống kê một câu hỏi cụ thể theo mẫu khảo sát.
/// Câu thuộc thang 'Options' có <paramref name="AverageScore"/> và
/// <paramref name="OptionDistribution"/>; câu thuộc thang 'Text' để cả hai rỗng
/// và đọc nội dung ở <paramref name="TextAnswers"/>.
/// </summary>
public sealed record QuestionRatingDto(
    int QuestionId,
    /// <summary>
    /// Số thứ tự câu trong bộ đề (C1, C2...). Đánh trên TOÀN BỘ câu của bộ, kể cả
    /// câu bẫy và câu tự nhập, để mã câu ở mọi màn hình trùng nhau — đánh lại theo
    /// vị trí trong danh sách đã lọc thì C16 ở màn này là C15 ở màn kia.
    /// </summary>
    int QuestionOrder,
    string QuestionText,
    decimal AverageScore,
    int TotalAnswers,
    IReadOnlyList<OptionCountDto> OptionDistribution,
    string ScaleKind = "Options",
    string AnswerScaleName = "",
    IReadOnlyList<string>? TextAnswers = null,
    /// <summary>
    /// Khoá mục của câu trong <see cref="SurveySectionCatalog"/>, để giao diện tách phần
    /// phân tích theo mục. Chỉ gắn ở trang giảng viên và trang kết quả một lớp.
    /// </summary>
    string? SectionKey = null);

/// <summary>Tóm tắt kết quả của một lớp học phần mà giảng viên đảm nhận.</summary>
public sealed record LecturerSectionSummaryDto(
    int CourseSectionSurveyId,
    string CourseCode,
    string CourseName,
    string SectionName,
    int ClassSize,
    /// <summary>Mọi lượt nộp, kể cả phiếu bị bộ lọc nhiễu loại.</summary>
    int ResponseCount,
    /// <summary>Phiếu qua được bộ lọc — mẫu số của mọi số liệu chất lượng.</summary>
    int ValidResponseCount,
    int InvalidResponseCount,
    /// <summary>Tính trên phiếu hợp lệ so với sĩ số.</summary>
    decimal CompletionRate,
    decimal AverageScore);

/// <summary>Báo cáo chi tiết đánh giá năng lực & hài lòng của Giảng viên.</summary>
public sealed record LecturerPerformanceReportDto(
    int LecturerId,
    string FullName,
    string DepartmentName,
    string FacultyName,
    decimal AverageScore,
    int TotalResponses,
    int CourseSectionCount,
    decimal DepartmentAverageScore,
    decimal FacultyAverageScore,
    IReadOnlyList<LecturerSectionSummaryDto> Sections,
    IReadOnlyList<QuestionRatingDto> QuestionRatings,
    /// <summary>
    /// Phần phiếu hợp lệ thực sự dựng nên <paramref name="AverageScore"/>: chỉ của
    /// những lớp đã chốt điểm. <paramref name="TotalResponses"/> đếm cả lớp chưa đủ
    /// điều kiện vì đó là tiến độ, không phải mẫu số của điểm.
    /// </summary>
    int ScoredValidResponseCount = 0,
    /// <summary>
    /// Điểm từng mục câu hỏi của các lớp đã chốt điểm, cùng công thức với trang Thống kê
    /// theo mục — cho tab Học phần / Giảng viên của phần phân tích theo câu hỏi.
    /// </summary>
    IReadOnlyList<QuestionSectionScoreDto>? SectionScores = null);

/// <summary>Báo cáo thống kê cấp Bộ môn.</summary>
public sealed record DepartmentSummaryDto(
    int DepartmentId,
    string DepartmentName,
    int LecturerCount,
    int SectionCount,
    int ResponseCount,
    decimal AverageSatisfactionScore);

/// <summary>Báo cáo thống kê cấp Khoa / Viện.</summary>
public sealed record FacultyDepartmentReportDto(
    int FacultyId,
    string FacultyName,
    int TotalDepartments,
    int TotalLecturers,
    int TotalSections,
    int TotalResponses,
    decimal AverageSatisfactionScore,
    IReadOnlyList<DepartmentSummaryDto> Departments);

/// <summary>Báo cáo phân tích tổng hợp theo tiêu chí / câu hỏi của đợt khảo sát.</summary>
public sealed record SurveyQuestionSummaryReportDto(
    int SemesterSurveyId,
    int SurveyTemplateId,
    string TemplateName,
    int TotalResponses,
    decimal OverallAverageScore,
    IReadOnlyList<QuestionRatingDto> Questions);

/// <summary>Báo cáo phân tích theo từng câu hỏi của một bài khảo sát lớp học phần.</summary>
public sealed record SectionSurveyAnalysisDto(
    int CourseSectionSurveyId,
    string CourseCode,
    string CourseName,
    string SectionName,
    string LecturerName,
    int ClassSize,
    int ResponseCount,
    decimal AverageScore,
    string TemplateName,
    IReadOnlyList<QuestionRatingDto> Questions,
    /// <summary>
    /// Lớp đã được chốt điểm ở lần bấm "Tính lại điểm" gần nhất chưa. Chưa chốt thì
    /// mọi con số phân tích đều rỗng — giống hệt ô điểm bỏ trống ở trang Bảng dữ
    /// liệu khảo sát, chứ không tự tính lấy một con số riêng.
    /// </summary>
    bool IsScored = true,
    /// <summary>
    /// Điểm từng mục câu hỏi của lớp, cùng công thức với trang Thống kê theo mục — cho tab
    /// Học phần / Giảng viên của phần phân tích theo câu hỏi. Null khi lớp chưa chốt điểm.
    /// </summary>
    IReadOnlyList<QuestionSectionScoreDto>? SectionScores = null);

/// <summary>Một dòng kết quả chi tiết của một bài khảo sát lớp học phần.</summary>
public sealed record SurveyResultDetailDto(
    int CourseSectionSurveyId,
    int SemesterSurveyId,
    string TemplateName,
    int LecturerId,
    string LecturerName,
    int DepartmentId,
    string DepartmentName,
    int FacultyId,
    string FacultyName,
    string CourseCode,
    string CourseName,
    string SectionName,
    int ClassSize,
    /// <summary>Mọi lượt nộp, kể cả phiếu bị bộ lọc nhiễu loại.</summary>
    int ResponseCount,
    /// <summary>Phiếu qua được bộ lọc — mẫu số của mọi số liệu chất lượng.</summary>
    int ValidResponseCount,
    int InvalidResponseCount,
    /// <summary>Tính trên phiếu hợp lệ so với sĩ số.</summary>
    decimal CompletionRate,
    decimal AverageScore,
    /// <summary>
    /// Tên đọc từ tệp import khi lớp chưa gắn được mã giảng viên (<paramref name="LecturerId"/>
    /// bằng 0). Có tên thì giao diện mở được trang giảng viên theo tên; null là lớp chưa
    /// có người dạy hoặc đã gắn mã.
    /// </summary>
    string? UnidentifiedLecturerName = null);

/// <summary>Một nhóm điểm trong phân bố điểm toàn trường (theo điểm TB từng phiếu).</summary>
public sealed record ScoreBandDto(
    int Band,
    string Label,
    int Count,
    decimal Percentage);

/// <summary>Dữ liệu 1 Khoa cho biểu đồ tổng quan toàn trường.</summary>
public sealed record FacultyOverviewDto(
    int FacultyId,
    string FacultyName,
    int DepartmentCount,
    int SectionCount,
    int TargetResponses,
    int ResponseCount,
    decimal CompletionRate,
    decimal AverageScore);

/// <summary>Dữ liệu 1 Bộ môn cho bảng "chậm tiến độ" của tổng quan toàn trường.</summary>
public sealed record DepartmentOverviewDto(
    int DepartmentId,
    string DepartmentName,
    int FacultyId,
    string FacultyName,
    int SectionCount,
    int TargetResponses,
    int ResponseCount,
    decimal CompletionRate,
    decimal AverageScore);

/// <summary>So sánh học kỳ hiện tại với một học kỳ được chọn.</summary>
public sealed record SemesterComparisonDto(
    string ComparisonType,
    int ComparisonSemesterId,
    int? ComparisonSemesterSurveyId,
    string ComparisonSemesterName,
    string ComparisonAcademicYearName,
    string? ComparisonTemplateName,
    int ComparisonSectionCount,
    int ComparisonTargetResponses,
    int ComparisonResponseCount,
    decimal ComparisonCompletionRate,
    decimal ComparisonAverageScore,
    decimal CompletionRateDelta,
    decimal AverageScoreDelta);

/// <summary>Metadata nhẹ của một đợt, dùng để chọn mốc đối chiếu mà không tải thống kê chi tiết.</summary>
public sealed record SchoolOverviewComparisonOptionDto(
    int SemesterSurveyId,
    /// <summary>Tên đợt do quản trị đặt. Khác TemplateName là tên bộ câu hỏi.</summary>
    string SurveyName,
    int SemesterId,
    string SemesterName,
    string AcademicYearName,
    int SurveyTemplateId,
    string TemplateName,
    DateTime CreatedAt);

/// <summary>Bảng tổng quan toàn trường (executive summary) của một học kỳ.</summary>
public sealed record SchoolSurveyOverviewDto(
    int SemesterId,
    string SemesterName,
    string AcademicYearName,

    // Quy mô & tiến độ thu phiếu
    int TotalSections,
    int TotalTargetResponses,
    int TotalResponses,
    decimal CompletionRate,
    int CompletedSectionCount,
    int InProgressSectionCount,
    int LaggingSectionCount,

    // Chất lượng kết quả — chỉ gộp lớp qua được hai vòng lọc tính điểm
    decimal OverallAverageScore,
    /// <summary>Số lớp qua được hai vòng lọc, tức nhóm thật sự góp vào điểm.</summary>
    int ScoredSectionCount,
    /// <summary>Số phiếu hợp lệ của riêng nhóm lớp trên — mẫu số của điểm trung bình.</summary>
    int ScoredValidResponseCount,
    IReadOnlyList<ScoreBandDto> ScoreDistribution,

    // So sánh theo Khoa (SchoolAverageScore dùng làm đường tham chiếu cho biểu đồ)
    decimal SchoolAverageScore,
    IReadOnlyList<FacultyOverviewDto> Faculties,

    // Bộ môn để lọc "chậm tiến độ nhất"
    IReadOnlyList<DepartmentOverviewDto> Departments,

    // Tiêu chí yếu nhất toàn trường (gộp mọi phiếu trong kỳ)
    IReadOnlyList<QuestionRatingDto> WeakestQuestions,

    // Xu hướng so với học kỳ được chọn (mặc định là kỳ liền trước)
    SemesterComparisonDto? SemesterComparison,

    /// <summary>
    /// Mọi lượt nộp, kể cả phiếu bị bộ lọc nhiễu loại. <paramref name="TotalResponses"/>
    /// chỉ đếm phiếu hợp lệ, nên hai con số này không thay thế được cho nhau.
    /// </summary>
    int TotalSubmittedResponses = 0,
    /// <summary>Số phiếu ĐÃ THU trên chỉ tiêu — vế thứ nhất của ngưỡng tính điểm.</summary>
    decimal ResponseRate = 0m);

/// <summary>Dịch vụ truy vấn và tổng hợp các báo cáo thống kê.</summary>
public interface IReportService
{
    /// <summary>Lấy báo cáo tiến độ vận hành đợt thu phiếu theo học kỳ.</summary>
    Task<OperationalProgressReportDto?> GetOperationalProgressReportAsync(
        int semesterId,
        CancellationToken cancellationToken = default);

    /// <summary>Lấy danh sách báo cáo đánh giá giảng viên (có lọc theo Khoa/Bộ môn/Kỳ).</summary>
    Task<IReadOnlyList<LecturerPerformanceReportDto>> GetLecturerPerformanceReportsAsync(
        int? facultyId,
        int? departmentId,
        int? semesterId,
        CancellationToken cancellationToken = default);

    /// <summary>Lấy báo cáo đánh giá chi tiết cho 1 giảng viên.</summary>
    Task<LecturerPerformanceReportDto?> GetLecturerPerformanceReportAsync(
        int lecturerId,
        int? semesterId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Trang giảng viên của người chưa gắn được mã: tra theo tên đọc từ tệp import, chỉ
    /// lấy lớp thuộc khoa/viện <paramref name="facultyId"/> (null hoặc 0 là lớp chưa thuộc
    /// khoa nào). Null khi không có lớp nào khớp.
    /// </summary>
    Task<LecturerPerformanceReportDto?> GetUnidentifiedLecturerReportAsync(
        string lecturerName,
        int? facultyId,
        int? semesterId,
        CancellationToken cancellationToken = default);

    /// <summary>Lấy báo cáo thống kê so sánh cấp Khoa / Viện và Bộ môn.</summary>
    Task<IReadOnlyList<FacultyDepartmentReportDto>> GetFacultyDepartmentReportsAsync(
        int? semesterId,
        CancellationToken cancellationToken = default);

    /// <summary>Lấy báo cáo phân tích theo từng câu hỏi / tiêu chí khảo sát.</summary>
    Task<SurveyQuestionSummaryReportDto?> GetQuestionAnalysisReportAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>Lấy báo cáo phân tích từng câu hỏi của một bài khảo sát lớp học phần.</summary>
    Task<SectionSurveyAnalysisDto?> GetSectionSurveyAnalysisAsync(
        int courseSectionSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>Lấy kết quả chi tiết từng bài khảo sát lớp, có lọc theo đơn vị / giảng viên / đợt / tên.</summary>
    Task<IReadOnlyList<SurveyResultDetailDto>> GetSurveyResultsAsync(
        int? semesterId,
        int? facultyId,
        int? departmentId,
        int? lecturerId,
        int? semesterSurveyId,
        string? search,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Lấy bảng tổng quan toàn trường và so sánh với kỳ được chọn (mặc định là kỳ trước).
    /// Truyền <paramref name="semesterSurveyId"/> để chỉ phân tích một bài khảo sát của kỳ.
    /// </summary>
    Task<SchoolSurveyOverviewDto?> GetSchoolSurveyOverviewAsync(
        int semesterId,
        int? comparisonSemesterId = null,
        int? semesterSurveyId = null,
        int? comparisonSemesterSurveyId = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SchoolOverviewComparisonOptionDto>> GetSchoolOverviewComparisonOptionsAsync(
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Xếp hạng tiêu chí (câu hỏi) của một học kỳ / bài khảo sát theo điểm trung bình.
    /// <paramref name="lowestFirst"/> = true lấy nhóm điểm thấp nhất, false lấy nhóm cao nhất.
    /// </summary>
    Task<IReadOnlyList<QuestionRatingDto>> GetQuestionRankingAsync(
        int semesterId,
        int? semesterSurveyId,
        int count,
        bool lowestFirst,
        CancellationToken cancellationToken = default);
}
