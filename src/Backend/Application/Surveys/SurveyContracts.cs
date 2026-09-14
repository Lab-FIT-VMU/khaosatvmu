using System.Globalization;
using System.Text;

namespace Application.Surveys;

public sealed record AnswerScaleOptionDto(
    int AnswerScaleOptionId,
    int AnswerScaleId,
    int Value,
    string DisplayText);

/// <summary><paramref name="ScaleKind"/> là 'Options' hoặc 'Text' (xem Domain.AnswerScaleKinds).</summary>
public sealed record AnswerScaleDto(
    int AnswerScaleId,
    string AnswerScaleName,
    string ScaleKind,
    IReadOnlyList<AnswerScaleOptionDto> Options);

/// <summary>Một mục chia nhóm câu hỏi của bộ, vd "Nội dung đánh giá học phần".</summary>
public sealed record SurveyQuestionSectionDto(int SectionId, string SectionName);

/// <summary>
/// Câu hỏi trong trình soạn bộ câu hỏi của quản trị.
/// <paramref name="AttentionCheckValue"/> khác null nghĩa là câu bẫy độ tập trung.
/// DTO này chỉ dùng cho màn quản trị, không phải màn sinh viên làm bài.
/// </summary>
public sealed record SurveyQuestionDto(
    int QuestionId,
    int SurveyTemplateId,
    /// <summary>Mục chứa câu này; mọi câu đều thuộc một mục, kể cả câu bẫy.</summary>
    int SectionId,
    string QuestionText,
    int AnswerScaleId,
    int? AttentionCheckValue);

public sealed record SurveyTemplateDto(
    int SurveyTemplateId,
    string TemplateName,
    DateTime CreatedAt,
    /// <summary>
    /// Xếp theo thứ tự hiển thị, tức theo vị trí câu đầu tiên của từng mục — mục
    /// không có cột thứ tự riêng.
    /// </summary>
    IReadOnlyList<SurveyQuestionSectionDto> Sections,
    IReadOnlyList<SurveyQuestionDto> Questions,
    /// <summary>
    /// Bộ đã có câu nào thu được phiếu trả lời chưa. Đã có thì chỉ sửa được chữ:
    /// thêm, bớt hay đổi chỗ câu hỏi làm nội dung dịch sang "QuestionId" khác
    /// trong khi phiếu cũ vẫn trỏ Id cũ. Backend chặn thật, cờ này chỉ để giao
    /// diện ẩn nút cho người dùng khỏi bấm vào chỗ chắc chắn lỗi.
    /// </summary>
    bool HasResponses = false);

public sealed record SaveAnswerScaleOptionCommand(int Value, string DisplayText);

/// <summary>Thang loại 'Text' không nhận mức nào; danh sách <paramref name="Options"/> phải rỗng.</summary>
public sealed record SaveAnswerScaleCommand(
    string AnswerScaleName,
    string ScaleKind,
    IReadOnlyList<SaveAnswerScaleOptionCommand> Options);

/// <summary>
/// Một mục gửi lên khi lưu bộ câu hỏi.
/// <paramref name="SectionId"/> null là mục mới; có giá trị thì phải là một mục
/// có thật của chính bộ đang lưu, và dòng đó được UPDATE tên tại chỗ. Nhận diện
/// mục bằng Id chứ không bằng vị trí trong danh sách: đảo thứ tự hai mục mà đoán
/// theo vị trí thì hai mục đổi danh tính cho nhau, báo cáo cũ đọc ra nhãn sai.
/// </summary>
public sealed record SaveSurveyQuestionSectionCommand(int? SectionId, string SectionName);

/// <summary>
/// Một câu hỏi kèm thang trả lời của riêng nó.
/// <paramref name="AttentionCheckValue"/> khác null biến câu này thành câu bẫy độ
/// tập trung: người trả lời phải chọn đúng mức đó thì phiếu mới hợp lệ. Chỉ đặt
/// được trên câu thuộc thang 'Options' và phải là một mức có thật của thang đó.
/// <paramref name="SectionIndex"/> là chỉ số mục trong danh sách
/// <see cref="SaveSurveyTemplateCommand.Sections"/> gửi kèm — dùng chỉ số chứ
/// không dùng Id vì mục mới chưa có Id lúc gửi lên.
/// </summary>
public sealed record SaveSurveyQuestionCommand(
    string QuestionText,
    int AnswerScaleId,
    int? AttentionCheckValue,
    int SectionIndex);

/// <summary>
/// Lưu cả bộ câu hỏi trong một lần: danh sách mục và danh sách câu hỏi đều được
/// ghi đè theo đúng thứ tự gửi lên. Mỗi câu mang thang trả lời riêng nên một bộ
/// trộn được nhiều loại thang.
///
/// Các câu cùng một mục phải nằm liền nhau trong <paramref name="Questions"/>:
/// tiêu đề mục hiện ra ngay trước câu đầu tiên của mục, nên mục bị cắt làm hai
/// khúc thì không biết đặt tiêu đề ở đâu.
/// </summary>
public sealed record SaveSurveyTemplateCommand(
    string TemplateName,
    IReadOnlyList<SaveSurveyQuestionSectionCommand> Sections,
    IReadOnlyList<SaveSurveyQuestionCommand> Questions);

/// <summary>Một đợt khảo sát của học kỳ, kèm số lớp và số phiếu đã thu.</summary>
public sealed record SemesterSurveyDto(
    int SemesterSurveyId,
    /// <summary>Tên đợt do quản trị đặt lúc tạo. Không trùng khái niệm với TemplateName.</summary>
    string SurveyName,
    int SemesterId,
    string SemesterName,
    string AcademicYearName,
    int SurveyTemplateId,
    string TemplateName,
    int QuestionCount,
    DateTime CreatedAt,
    DateTime StartTime,
    DateTime EndTime,
    int SectionSurveyCount,
    int ResponseCount,
    /// <summary>
    /// Số lớp còn thiếu SO VỚI PHẠM VI CỦA CHÍNH ĐỢT NÀY, không phải so với cả kỳ.
    /// Phạm vi được suy ra từ tập bộ môn mà các lớp đang có trong đợt thuộc về, nên
    /// một đợt cố ý chỉ phát cho một khoa sẽ không bị coi là thiếu hàng nghìn lớp
    /// của khoa khác. Khác 0 khi lớp mới của chính các bộ môn đó được nhập sau lúc
    /// tạo đợt; bù bằng <see cref="ISurveyService.AddSectionsToSemesterSurveyAsync"/>
    /// với đúng phạm vi của đợt.
    /// </summary>
    int MissingSectionCount);

// ------------------------------------------- Sheet 1: chuẩn hoá điểm (Z-score)

/// <summary>
/// Một nhóm tương đương trong bảng chuẩn hoá. Nhóm ở đây là khoa/viện.
/// <paramref name="StandardDeviation"/> null khi nhóm có ít hơn hai lớp.
/// </summary>
public sealed record NormalizationGroupDto(
    int? FacultyId,
    string FacultyName,
    int SectionCount,
    decimal AverageScore,
    decimal? StandardDeviation,
    /// <summary>Đủ số lớp tối thiểu để chuẩn hoá hay không.</summary>
    bool CanNormalize,
    /// <summary>
    /// Mặt bằng của khoa lệch mặt bằng toàn trường bao nhiêu lần SAI SỐ CHUẨN
    /// <c>σ/√n</c>, không phải bao nhiêu lần σ. Đây là trung bình của n lớp chứ
    /// không phải một lớp lẻ: trung bình dao động ít hơn √n lần, nên chia cho σ
    /// sẽ dồn mọi khoa về sát 0 và cột này thành vô dụng.
    /// Null khi độ lệch chuẩn toàn trường bằng 0 hoặc không xác định.
    /// </summary>
    decimal? MeanZScore);

/// <summary>Một lớp trong bảng chi tiết của sheet chuẩn hoá điểm.</summary>
public sealed record NormalizedSectionDto(
    int CourseSectionSurveyId,
    string CourseCode,
    string CourseName,
    string SectionName,
    string LecturerName,
    string DepartmentName,
    string FacultyName,
    int ClassSize,
    decimal AverageScore,
    /// <summary>So với mặt bằng toàn đợt.</summary>
    decimal? ZSchool,
    /// <summary>So với mặt bằng khoa; null khi khoa quá ít lớp.</summary>
    decimal? ZFaculty,
    /// <summary>Z trong khoa trừ Z toàn trường. Lệch nhiều nghĩa là chuẩn hoá đổi kết luận.</summary>
    decimal? ZDifference,
    /// <summary>Mã trong <see cref="NormalizationVerdicts"/>.</summary>
    string Verdict);

/// <summary>Toàn bộ sheet chuẩn hoá điểm của một đợt khảo sát.</summary>
public sealed record SemesterSurveyNormalizationDto(
    int SemesterSurveyId,
    string TemplateName,
    string SemesterName,
    string AcademicYearName,
    /// <summary>Số lớp đã có phiếu; lớp chưa ai làm không tham gia mặt bằng.</summary>
    int SchoolSectionCount,
    decimal SchoolAverageScore,
    decimal? SchoolStandardDeviation,
    IReadOnlyList<NormalizationGroupDto> Groups,
    IReadOnlyList<NormalizedSectionDto> Sections);

// --------------------------------------- Sheet 3: tổng hợp theo bộ môn

/// <summary>Một dòng của bảng tổng hợp theo bộ môn, phục vụ trưởng khoa.</summary>
public sealed record DepartmentSummaryRowDto(
    int? FacultyId,
    string FacultyName,
    int? DepartmentId,
    string DepartmentName,
    int SectionCount,
    int LecturerCount,
    /// <summary>Tổng sĩ số các lớp của bộ môn — mẫu số của tỷ lệ phiếu hợp lệ.</summary>
    int TotalClassSize,
    /// <summary>Tổng số phiếu thu về, kể cả phiếu bị bộ lọc nhiễu loại.</summary>
    int ResponseCount,
    /// <summary>Số phiếu qua được bộ lọc nhiễu.</summary>
    int ValidResponseCount,
    /// <summary>Phiếu hợp lệ chia tổng sĩ số, tính theo phần trăm.</summary>
    decimal ValidResponseRate,
    /// <summary>Điểm tổng hợp, chỉ gộp phiếu hợp lệ. Null khi chưa có phiếu nào.</summary>
    decimal? AverageScore,
    /// <summary>Số lớp có điểm ở mức cảnh báo: Z-Score ≤ −1 so với mặt bằng toàn đợt.</summary>
    int WarningSectionCount);

public sealed record SemesterSurveyDepartmentSummaryDto(
    int SemesterSurveyId,
    string TemplateName,
    string SemesterName,
    string AcademicYearName,
    /// <summary>Đã lọc theo phạm vi người xem; trưởng bộ môn chỉ còn đúng dòng bộ môn mình.</summary>
    IReadOnlyList<DepartmentSummaryRowDto> Rows,
    /// <summary>
    /// Dòng tổng ở chân bảng. LUÔN tính trên toàn trường kể cả khi Rows đã bị lọc, để
    /// trưởng bộ môn còn có cái mà so — xem congviec2.md mục D6.
    /// </summary>
    int SchoolDepartmentCount,
    int SchoolSectionCount,
    int SchoolResponseCount,
    decimal? SchoolAverageScore,
    int SchoolWarningCount);

// -------------------- Sheet 4: tách nguyên nhân học phần / giảng viên

/// <summary>Một học phần trong bảng chẩn đoán, gộp mọi lớp của học phần đó.</summary>
public sealed record CourseDiagnosisRowDto(
    int CourseId,
    string CourseCode,
    string CourseName,
    string DepartmentName,
    string FacultyName,
    int SectionCount,
    int LecturerCount,
    decimal AverageScore,
    decimal MinScore,
    decimal MaxScore,
    /// <summary>Cao nhất trừ thấp nhất. Học phần một lớp thì luôn bằng 0.</summary>
    decimal Spread,
    int? WeakestQuestionOrder,
    decimal? WeakestQuestionScore,
    string? WeakestQuestionText,
    /// <summary>Mã trong <see cref="CourseDiagnosisVerdicts"/>.</summary>
    string Verdict);

public sealed record SemesterSurveyCourseDiagnosisDto(
    int SemesterSurveyId,
    string TemplateName,
    string SemesterName,
    string AcademicYearName,
    IReadOnlyList<CourseDiagnosisRowDto> Rows);

public sealed record ScopeAnalysisOptionDto(
    int Value,
    string DisplayText,
    int Count,
    decimal Percentage);

/// <summary>Một câu hỏi trong bảng phân tích của một phạm vi.</summary>
public sealed record ScopeAnalysisQuestionDto(
    int QuestionId,
    int QuestionOrder,
    string QuestionText,
    decimal AverageScore,
    int TotalAnswers,
    IReadOnlyList<ScopeAnalysisOptionDto> OptionDistribution,
    string ScaleKind,
    string AnswerScaleName,
    IReadOnlyList<string>? TextAnswers,
    /// <summary>Khoá mục của câu trong <see cref="SurveySectionCatalog"/>, để giao diện tách theo mục.</summary>
    string SectionKey);

/// <summary>
/// Kết quả chi tiết theo từng câu hỏi cho một khoa/viện, bộ môn hoặc học phần
/// trong đúng một đợt khảo sát.
/// </summary>
public sealed record SurveyScopeAnalysisDto(
    int SemesterSurveyId,
    string ScopeType,
    int ScopeId,
    string ScopeName,
    string TemplateName,
    string SemesterName,
    string AcademicYearName,
    int SectionCount,
    int TotalClassSize,
    int ResponseCount,
    decimal AverageScore,
    IReadOnlyList<ScopeAnalysisQuestionDto> Questions,
    /// <summary>Điểm từng mục câu hỏi, cùng công thức với trang bài khảo sát của một lớp.</summary>
    IReadOnlyList<QuestionSectionScoreDto> SectionScores,
    IReadOnlyList<DepartmentSummaryRowDto>? Departments = null,
    IReadOnlyList<CourseDiagnosisRowDto>? Courses = null,
    IReadOnlyList<NormalizedSectionDto>? Sections = null);

// ------------------------------------------- Thống kê theo mục câu hỏi

/// <summary>
/// Một mục của trang Thống kê theo mục, tức một cột điểm. Luôn đủ ba mục của
/// <see cref="SurveySectionCatalog"/> theo đúng thứ tự trên phiếu, kể cả mục chưa có
/// số. Mục ngoài danh mục gộp chung vào <see cref="SurveySectionCatalog.Other"/> và
/// chỉ xuất hiện khi thật sự có.
/// </summary>
public sealed record QuestionSectionColumnDto(
    string SectionKey,
    string SectionName,
    /// <summary>Số câu được chấm điểm của mục: không tính câu bẫy và câu tự nhập.</summary>
    int QuestionCount);

/// <summary>Điểm một mục trong phạm vi một nhóm lớp.</summary>
public sealed record QuestionSectionScoreDto(
    string SectionKey,
    /// <summary>Null khi nhóm lớp chưa có lượt trả lời nào cho mục này.</summary>
    decimal? AverageScore,
    int AnswerCount);

/// <summary>
/// Một dòng ở một cấp: toàn trường, khoa/viện, bộ môn, học phần hoặc lớp học phần.
/// Mọi cấp dùng chung kiểu này và để trống các trường của cấp dưới, nên con của một
/// dòng lọc ra được chỉ bằng cách so các trường của cấp trên.
/// </summary>
public sealed record QuestionSectionScoreRowDto(
    int? FacultyId,
    string FacultyName,
    int? DepartmentId,
    string DepartmentName,
    int? CourseId,
    string CourseCode,
    string CourseName,
    /// <summary>Chỉ có ở dòng lớp học phần.</summary>
    int? CourseSectionSurveyId,
    string SectionName,
    string LecturerName,
    /// <summary>Số lớp đã chốt điểm của nhóm; chỉ những lớp này góp vào các con số của dòng.</summary>
    int SectionCount,
    int ValidResponseCount,
    /// <summary>
    /// Điểm tổng hợp của cả bộ câu hỏi, đúng con số ở các trang thống kê khác. KHÔNG
    /// bằng trung bình cộng các mục: gồm cả mục không hiển thị, và gộp theo phiếu chứ
    /// không theo mục.
    /// </summary>
    decimal? OverallAverageScore,
    IReadOnlyList<QuestionSectionScoreDto> Scores);

public sealed record SemesterSurveyQuestionSectionScoresDto(
    int SemesterSurveyId,
    string TemplateName,
    string SemesterName,
    string AcademicYearName,
    IReadOnlyList<QuestionSectionColumnDto> Columns,
    QuestionSectionScoreRowDto School,
    IReadOnlyList<QuestionSectionScoreRowDto> Faculties,
    IReadOnlyList<QuestionSectionScoreRowDto> Departments,
    /// <summary>Học phần gom trong từng bộ môn: học phần có lớp ở hai bộ môn thì thành hai dòng.</summary>
    IReadOnlyList<QuestionSectionScoreRowDto> Courses,
    /// <summary>Từng lớp học phần đã chốt điểm.</summary>
    IReadOnlyList<QuestionSectionScoreRowDto> CourseSections);

// ------------------------------ Sheet 5: báo cáo cá nhân giảng viên

/// <summary>Một giảng viên có dạy trong đợt, dùng cho ô chọn ở bộ lọc.</summary>
public sealed record LecturerOptionDto(
    int LecturerId,
    string FullName,
    string DepartmentName,
    string FacultyName,
    int SectionCount,
    int TotalClassSize,
    int ResponseCount,
    int ValidResponseCount,
    decimal ValidResponseRate,
    decimal? AverageScore,
    decimal? MinScore,
    decimal? MaxScore,
    int WarningSectionCount);

/// <summary>Một lớp trong bảng "các lớp giảng dạy trong kỳ".</summary>
public sealed record LecturerSectionDto(
    int CourseSectionSurveyId,
    string CourseCode,
    string CourseName,
    string SectionName,
    int ClassSize,
    /// <summary>Tổng phiếu thu về, kể cả phiếu bị bộ lọc nhiễu loại.</summary>
    int ResponseCount,
    /// <summary>Số phiếu qua được bộ lọc nhiễu.</summary>
    int ValidResponseCount,
    /// <summary>Phiếu hợp lệ chia sĩ số, theo phần trăm.</summary>
    decimal ValidResponseRate,
    decimal AverageScore,
    /// <summary>
    /// Điểm trung bình của MỌI lớp cùng học phần trong đợt, kể cả lớp của giảng
    /// viên khác. Null khi học phần chỉ có đúng lớp này.
    /// </summary>
    decimal? CourseAverageScore,
    /// <summary>Điểm lớp trừ điểm trung bình học phần.</summary>
    decimal? DifferenceFromCourse,
    /// <summary>Z so với mặt bằng toàn đợt.</summary>
    decimal? ZSchool,
    /// <summary>Z so với mặt bằng khoa; null khi khoa quá ít lớp để chuẩn hoá.</summary>
    decimal? ZFaculty,
    /// <summary>Z so với mặt bằng bộ môn; null khi bộ môn quá ít lớp để chuẩn hoá.</summary>
    decimal? ZDepartment);

public sealed record LecturerReportDto(
    int LecturerId,
    string FullName,
    string DepartmentName,
    string FacultyName,
    int SectionCount,
    int TotalResponseCount,
    decimal AverageScore,
    IReadOnlyList<LecturerSectionDto> Sections);

// ------------------------------ Sheet 6: tổng quan toàn trường của một đợt

/// <summary>Điểm trung bình toàn trường của một câu hỏi.</summary>
public sealed record DashboardQuestionScoreDto(
    int QuestionOrder,
    string QuestionText,
    decimal AverageScore,
    /// <summary>Số lớp có điểm câu này ở mức cảnh báo: Z-Score ≤ −1 so với chính câu đó trên toàn đợt.</summary>
    int SectionsBelowThreshold);

/// <summary>Một cột của biểu đồ điểm tổng hợp theo khoa/viện.</summary>
public sealed record DashboardFacultyScoreDto(
    int? FacultyId,
    string FacultyName,
    int SectionCount,
    decimal AverageScore);

/// <summary>
/// Số liệu của màn hình tổng quan. Số lớp và số phiếu thu được đếm mọi lượt nộp;
/// tỷ lệ hoàn thành, điểm và các bảng bên dưới chỉ tính trên phiếu hợp lệ.
/// </summary>
public sealed record SemesterSurveyDashboardDto(
    int SemesterSurveyId,
    string TemplateName,
    string SemesterName,
    string AcademicYearName,
    int SectionCount,
    /// <summary>Mọi lượt nộp, kể cả phiếu bị bộ lọc nhiễu loại.</summary>
    int TotalResponseCount,
    /// <summary>Phiếu qua được bộ lọc — mẫu số của tiến độ và của mọi số liệu chất lượng.</summary>
    int ValidResponseCount,
    /// <summary>Phiếu hợp lệ trên tổng sĩ số các lớp của đợt.</summary>
    decimal AverageCompletionRate,
    /// <summary>Null khi chưa lớp nào thu được phiếu hợp lệ.</summary>
    decimal? OverallScore,
    int ScoredSectionCount,
    IReadOnlyList<DashboardQuestionScoreDto> Questions,
    /// <summary>Năm câu điểm thấp nhất, sắp từ thấp lên.</summary>
    IReadOnlyList<DashboardQuestionScoreDto> WeakestQuestions,
    IReadOnlyList<DashboardFacultyScoreDto> Faculties,
    /// <summary>Số học phần mà mọi lớp đều dưới ngưỡng.</summary>
    int CourseIssueCount,
    /// <summary>Số học phần có biên độ điểm giữa các lớp quá rộng.</summary>
    int LecturerVarianceCount,
    /// <summary>Tổng sĩ số của mọi lớp trong đợt — mẫu số của tỷ lệ phản hồi.</summary>
    int TotalClassSize = 0,
    /// <summary>
    /// Số phiếu ĐÃ THU trên tổng sĩ số. Khác <paramref name="AverageCompletionRate"/>
    /// ở tử số: chỗ kia chỉ đếm phiếu hợp lệ. Đây là vế thứ nhất của ngưỡng tính điểm.
    /// </summary>
    decimal ResponseRate = 0m);

/// <summary>
/// Dải chỉ số gọn cho bảng điều khiển riêng của trưởng bộ môn. Mỗi con số của bộ môn
/// đi kèm một con số toàn trường để so — mặt bằng LUÔN tính trên toàn bộ dữ liệu chứ
/// không tính lại trong phạm vi bộ môn, xem congviec2.md mục D6.
/// </summary>
public sealed record DepartmentDashboardDto(
    int SemesterSurveyId,
    string TemplateName,
    string SemesterName,
    string AcademicYearName,
    /// <summary>Rỗng khi người xem là quản trị, lúc đó số bộ môn chính là số toàn trường.</summary>
    string? DepartmentName,
    int SectionCount,
    int SchoolSectionCount,
    decimal CompletionRate,
    decimal SchoolCompletionRate,
    /// <summary>Null khi chưa lớp nào của bộ môn thu được phiếu hợp lệ.</summary>
    decimal? AverageScore,
    decimal? SchoolAverageScore,
    /// <summary>Số lớp của bộ môn có điểm ở mức cảnh báo: Z-Score ≤ −1 so với mặt bằng toàn đợt.</summary>
    int WeakSectionCount,
    decimal WeakScoreThreshold);

/// <summary>Kết quả một lần bấm tính lại điểm theo mẻ cho cả đợt khảo sát.</summary>
public sealed record RecalculateScoresDto(
    int SemesterSurveyId,
    /// <summary>Số lớp học phần đã được ghi lại điểm.</summary>
    int UpdatedSectionCount,
    DateTime CalculatedAt);

/// <summary>
/// Điểm trung bình của một câu hỏi trong phạm vi một lớp — chính là cột C1, C2…
/// của bảng thống kê.
/// </summary>
public sealed record SectionQuestionScoreDto(int QuestionId, decimal AverageScore, int AnswerCount);

/// <summary>
/// Một dòng của bảng thống kê: toàn bộ số liệu khảo sát của một lớp học phần.
/// Chỉ <paramref name="TotalResponseCount"/> đếm cả phiếu bị lọc — nó là số lượt
/// nộp. Mọi thứ còn lại, kể cả <paramref name="CompletionRate"/>, chỉ gộp phiếu
/// hợp lệ.
/// </summary>
public sealed record SectionStatisticsRowDto(
    int CourseSectionId,
    int CourseSectionSurveyId,
    string CourseCode,
    string CourseName,
    string SectionName,
    string DepartmentName,
    string LecturerName,
    int ClassSize,
    /// <summary>Đếm trực tiếp từ phiếu, đúng tại thời điểm xem.</summary>
    int TotalResponseCount,
    int ValidResponseCount,
    int InvalidResponseCount,
    /// <summary>Phiếu hợp lệ chia sĩ số, theo phần trăm.</summary>
    decimal CompletionRate,
    /// <summary>
    /// Ảnh chụp lần bấm tính gần nhất. Null có hai nghĩa, phân biệt bằng
    /// <see cref="ReportThresholds.HasEnoughResponsesToScore"/>: đợt chưa được bấm
    /// tính lần nào, hoặc lớp chưa thu đủ phiếu nên cố ý không chốt điểm.
    /// </summary>
    decimal? AverageScore,
    DateTime? ScoreCalculatedAt,
    /// <summary>Số phiếu có điền ô "Ý kiến khác" ở cuối bài.</summary>
    int OpenCommentCount,
    /// <summary>Câu có điểm thấp nhất của lớp; null khi lớp chưa được chốt điểm.</summary>
    int? WeakestQuestionId,
    decimal? WeakestQuestionScore,
    /// <summary>
    /// Điểm từng câu, theo đúng thứ tự cột C của bảng. Cũng là ảnh chụp của lần
    /// bấm tính gần nhất: câu chưa được chốt có <c>AnswerCount = 0</c>.
    /// </summary>
    IReadOnlyList<SectionQuestionScoreDto> QuestionScores);

/// <summary>Một cột C của bảng thống kê, sinh theo bộ câu hỏi của đợt.</summary>
public sealed record StatisticsQuestionColumnDto(int QuestionId, int Order, string QuestionText);

/// <summary>
/// Toàn bộ bảng thống kê của một đợt khảo sát. Số cột C thay đổi theo bộ câu hỏi
/// nên phải trả kèm danh sách cột, không cố định trong giao diện.
/// </summary>
public sealed record SemesterSurveyStatisticsDto(
    int SemesterSurveyId,
    string TemplateName,
    string SemesterName,
    string AcademicYearName,
    /// <summary>Thời điểm tính gần nhất trong các lớp; null là chưa lớp nào được tính.</summary>
    DateTime? LastCalculatedAt,
    /// <summary>Số phiếu về sau lần tính gần nhất, cảnh báo số đang xem đã cũ.</summary>
    int ResponsesSinceLastCalculation,
    IReadOnlyList<StatisticsQuestionColumnDto> QuestionColumns,
    /// <summary>
    /// Số câu bẫy của bộ. Câu bẫy không được đánh số nên bảng không nhảy cóc số
    /// câu nữa, nhưng vẫn phải nói ra để người xem biết bộ dài hơn số cột ở đây.
    /// </summary>
    int AttentionCheckCount,
    IReadOnlyList<SectionStatisticsRowDto> Rows);

/// <summary>Bài khảo sát của một lớp học phần: link, mã QR và số lượt trả lời.</summary>
public sealed record CourseSectionSurveyDto(
    int CourseSectionSurveyId,
    int SemesterSurveyId,
    int CourseSectionId,
    string LinkToken,
    DateTime StartTime,
    DateTime EndTime,
    string CourseCode,
    string CourseName,
    string SectionName,
    string LecturerName,
    /// <summary>Bộ môn của lớp: theo học phần, thiếu thì lấy của giảng viên.</summary>
    string DepartmentName,
    /// <summary>Khoa của lớp: theo học phần, rồi khoa của bộ môn, rồi của giảng viên.</summary>
    string FacultyName,
    int ClassSize,
    /// <summary>Mọi lượt nộp, kể cả phiếu bị bộ lọc nhiễu loại.</summary>
    int ResponseCount,
    /// <summary>Số phiếu qua được bộ lọc — phần duy nhất được tính vào tiến độ.</summary>
    int ValidResponseCount,
    /// <summary>Số phiếu bị bộ lọc loại. Bằng ResponseCount trừ ValidResponseCount.</summary>
    int InvalidResponseCount);

/// <summary>
/// Phạm vi lớp được phát phiếu. Dùng chung cho lúc tạo đợt và lúc bổ sung thêm
/// vào đợt đã có, để hai luồng không bao giờ hiểu "khoa X" theo hai kiểu.
/// </summary>
public static class SurveyScopeTypes
{
    /// <summary>Mọi lớp học phần của học kỳ. <c>ScopeId</c> bị bỏ qua.</summary>
    public const string All = "all";

    /// <summary>Lớp quy về một khoa/viện, theo chuỗi quy thuộc đơn vị của hệ thống.</summary>
    public const string Faculty = "faculty";

    /// <summary>Lớp quy về một bộ môn.</summary>
    public const string Department = "department";

    /// <summary>
    /// Đúng một lớp học phần. Lưu ý mịn hơn một bậc so với <c>course</c> của
    /// <see cref="ISurveyService.GetSurveyScopeAnalysisAsync"/> — API đó phân tích
    /// theo học phần, còn ở đây là chọn từng lớp để phát phiếu.
    /// </summary>
    public const string Section = "section";

    public static bool IsValid(string? scopeType) =>
        scopeType is All or Faculty or Department or Section;

    /// <summary>Chỉ <see cref="All"/> mới được thiếu <c>ScopeId</c>.</summary>
    public static bool RequiresScopeId(string scopeType) => scopeType != All;
}

public sealed record CreateSemesterSurveyCommand(
    string SurveyName,
    int SemesterId,
    int SurveyTemplateId,
    DateTime StartTime,
    DateTime EndTime,
    /// <summary>Một trong <see cref="SurveyScopeTypes"/>. Mặc định phát cho cả kỳ.</summary>
    string ScopeType = SurveyScopeTypes.All,
    /// <summary>Mã khoa / bộ môn / lớp học phần tuỳ theo <paramref name="ScopeType"/>.</summary>
    int? ScopeId = null);

/// <summary>Chỉnh sửa thông tin chung của đợt; không thay đổi học kỳ hoặc bộ câu hỏi.</summary>
public sealed record UpdateSemesterSurveyCommand(
    string SurveyName,
    DateTime StartTime,
    DateTime EndTime);

/// <summary>
/// Bổ sung lớp vào một đợt đã có, theo cùng bộ phạm vi lúc tạo. Lớp đã có bài
/// trong đợt thì bỏ qua chứ không báo lỗi, nên chồng phạm vi lên nhau vẫn an toàn.
/// </summary>
public sealed record AddSectionsToSemesterSurveyCommand(
    string ScopeType,
    int? ScopeId,
    DateTime StartTime,
    DateTime EndTime);

/// <summary>
/// Số lớp rơi vào một phạm vi, để màn hình xem trước trước khi bấm tạo. Tính ở
/// server chứ không đếm ở client: quy lớp về khoa/bộ môn là chuỗi fallback, chép
/// sang TypeScript là chắc chắn có ngày hai bên ra hai con số khác nhau.
/// </summary>
public sealed record SurveyScopePreviewDto(
    string ScopeType,
    int? ScopeId,
    /// <summary>Số lớp của học kỳ thuộc phạm vi này.</summary>
    int ScopeSectionCount,
    /// <summary>
    /// Trong đó bao nhiêu lớp chưa có bài trong đợt đang xét. Bằng
    /// <paramref name="ScopeSectionCount"/> khi không truyền đợt nào.
    /// </summary>
    int NewSectionCount);

/// <summary>
/// Kết quả huỷ toàn bộ phiếu của một lớp để lớp làm lại. Phiếu chỉ bị xoá MỀM:
/// dòng vẫn nằm trong bảng, nhưng mọi phép tính đều bỏ qua từ đây.
/// </summary>
public sealed record ClearSectionSurveyResponsesDto(
    int CourseSectionSurveyId,
    string CourseCode,
    string CourseName,
    string SectionName,
    /// <summary>Số phiếu vừa bị huỷ, tính cả phiếu đã bị bộ lọc nhiễu loại.</summary>
    int ClearedResponseCount,
    /// <summary>Số dòng điểm từng câu bị xoá theo.</summary>
    int ClearedQuestionScoreCount,
    DateTime ClearedAt);

/// <summary>Kết quả một lần bổ sung phạm vi vào đợt đã có.</summary>
public sealed record AddSectionsToSemesterSurveyDto(
    int SemesterSurveyId,
    string SurveyName,
    /// <summary>Số lớp vừa được tạo bài khảo sát.</summary>
    int CreatedSectionCount,
    /// <summary>Số lớp thuộc phạm vi nhưng đã có bài từ trước nên bỏ qua.</summary>
    int SkippedSectionCount,
    DateTime StartTime,
    DateTime EndTime);

public sealed record SaveSurveyScheduleCommand(DateTime StartTime, DateTime EndTime);

/// <summary>
/// Một câu trên phiếu của sinh viên. CỐ Ý không có "AttentionCheckValue": gửi mức
/// bắt buộc của câu bẫy xuống trình duyệt là đưa luôn đáp án cho người muốn gian.
/// </summary>
public sealed record PublicSurveyQuestionDto(
    int QuestionId,
    string QuestionText,
    int AnswerScaleId,
    /// <summary>Mục chứa câu này, để phiếu hiện tiêu đề mục trước câu đầu tiên của mục.</summary>
    int SectionId);

/// <summary>Một mục trên phiếu của sinh viên.</summary>
public sealed record PublicSurveySectionDto(int SectionId, string SectionName);

/// <summary>
/// Dữ liệu phiếu khảo sát mà sinh viên thấy khi mở link hoặc quét QR.
/// <paramref name="AnswerScales"/> là các thang mà bộ câu hỏi đang dùng; mỗi câu
/// trong <paramref name="Questions"/> trỏ tới một thang qua "AnswerScaleId".
/// </summary>
public sealed record PublicSurveyDto(
    string LinkToken,
    /// <summary>Tên BỘ CÂU HỎI. Không dùng làm tiêu đề phiếu — xem <paramref name="SurveyName"/>.</summary>
    string TemplateName,
    string CourseCode,
    string CourseName,
    string SectionName,
    string LecturerName,
    string SemesterName,
    string AcademicYearName,
    DateTime StartTime,
    DateTime EndTime,
    bool IsOpen,
    IReadOnlyList<AnswerScaleDto> AnswerScales,
    IReadOnlyList<PublicSurveySectionDto> Sections,
    IReadOnlyList<PublicSurveyQuestionDto> Questions,
    /// <summary>
    /// Tên ĐỢT khảo sát do quản trị đặt lúc tạo ("SemesterSurveys"."SurveyName").
    /// Đây mới là tiêu đề sinh viên thấy; tên bộ câu hỏi là chuyện nội bộ.
    /// </summary>
    string SurveyName = "");

/// <summary>
/// <paramref name="AnswerValue"/> là số mức đã chọn ("1".."5") với câu thang
/// 'Options', hoặc nội dung tự nhập với câu thang 'Text'.
/// </summary>
public sealed record SubmitSurveyAnswerCommand(int QuestionId, string AnswerValue);

/// <summary>
/// <paramref name="ElapsedSeconds"/> là số giây từ lúc phát vé bắt đầu tới lúc
/// nhận được request. Vé không đọc được thì tầng API truyền 0, để bộ lọc bắt.
/// </summary>
public sealed record SubmitSurveyResponseCommand(
    IReadOnlyList<SubmitSurveyAnswerCommand> Answers,
    string? AdditionalComments,
    double ElapsedSeconds);

public sealed record SubmitSurveyResponseDto(int ResponseId, decimal Score, DateTime SubmittedAt);

/// <summary>Số câu đã chọn ở một mức trả lời trong cùng một phiếu (chỉ câu thang 'Options').</summary>
public sealed record SurveyResponseValueCountDto(int Value, string DisplayText, int Count);

/// <summary>
/// Một phiếu trả lời trong danh sách của bài khảo sát một lớp học phần.
/// <paramref name="IsValid"/> và <paramref name="RejectionReasons"/> là kết quả
/// lọc nhiễu; chỉ màn quản trị mới thấy, sinh viên không được báo gì.
/// </summary>
public sealed record SurveyResponseSummaryDto(
    int ResponseId,
    int CourseSectionSurveyId,
    DateTime SubmittedAt,
    decimal Score,
    string? AdditionalComments,
    int AnswerCount,
    IReadOnlyList<SurveyResponseValueCountDto> ValueCounts,
    bool IsValid,
    string? RejectionReasons);

/// <summary>
/// Một câu trong phiếu đã nộp. <paramref name="SelectedValue"/> chỉ có giá trị khi
/// câu thuộc thang 'Options'; câu thang 'Text' để null và đọc ở
/// <paramref name="AnswerValue"/>.
/// </summary>
public sealed record SurveyResponseAnswerDto(
    int QuestionId,
    string QuestionText,
    int AnswerScaleId,
    string ScaleKind,
    string AnswerValue,
    int? SelectedValue,
    string SelectedText);

/// <summary>Toàn bộ nội dung một phiếu trả lời, dùng cho modal chỉ xem.</summary>
public sealed record SurveyResponseDetailDto(
    int ResponseId,
    int CourseSectionSurveyId,
    DateTime SubmittedAt,
    decimal Score,
    string? AdditionalComments,
    string TemplateName,
    string CourseCode,
    string CourseName,
    string SectionName,
    string LecturerName,
    IReadOnlyList<AnswerScaleDto> AnswerScales,
    IReadOnlyList<SurveyResponseAnswerDto> Answers);

public sealed record SurveyOperationResult<T>(bool Succeeded, string? ErrorCode, T? Value);

public static class SurveyRules
{
    /// <summary>
    /// Số mục tối đa của một bộ câu hỏi. Số câu thì không giới hạn — bộ dài bao
    /// nhiêu là việc của người soạn phiếu.
    /// </summary>
    public const int MaximumSectionsPerTemplate = 10;

    /// <summary>Số mức tối đa của một thang: "AnswerScaleOptions"."Value" CHECK 1..5.</summary>
    public const int MaximumAnswerScaleOptions = 5;

    /// <summary>Độ dài tối đa của câu trả lời tự nhập ("SurveyResponseAnswers"."AnswerValue").</summary>
    public const int MaximumTextAnswerLength = 2000;
}

/// <summary>Một mục trong <see cref="SurveySectionCatalog"/>.</summary>
public sealed record SurveySectionCatalogEntry(string Key, string Name);

/// <summary>
/// Danh mục mục câu hỏi CỐ ĐỊNH. Đây là lớp xử lý TẠM cho đợt khảo sát hiện tại: bộ
/// đề do phòng Khảo thí &amp; ĐBCL ban hành đã gộp ba mục vào chung một bài và không
/// còn kịp tách, nên phải khoá tên mục lại thì mới gộp được điểm theo từng mục.
///
/// Không có cột nào trong CSDL lưu khoá — thêm cột là đổi schema, buộc làm lại cả
/// đợt. Mục trong DB nhận ra khoá bằng TÊN đã chuẩn hoá, nên tên gõ lệch dấu kiểu
/// "cơ sơ" vẫn quy đúng về "cơ sở" mà không phải sửa dòng dữ liệu nào.
///
/// Khi bộ đề được tách thành các bài riêng thì chỉ cần gỡ phần chặn tên mục lúc lưu
/// bộ câu hỏi; trang Thống kê theo mục vẫn dùng tiếp vì nó gộp theo mục.
/// </summary>
public static class SurveySectionCatalog
{
    public const string CourseContent = "COURSE_CONTENT";
    public const string Lecturer = "LECTURER";
    public const string Facilities = "FACILITIES";

    /// <summary>
    /// Khoá gom mọi mục KHÔNG thuộc danh mục, chỉ gặp ở bộ đề soạn trước khi khoá.
    /// Không bao giờ lưu mới được mục loại này.
    /// </summary>
    public const string Other = "OTHER";
    public const string OtherName = "Mục khác";

    /// <summary>Theo đúng thứ tự mục trên phiếu.</summary>
    public static readonly IReadOnlyList<SurveySectionCatalogEntry> Entries =
    [
        new(CourseContent, "Nội dung đánh giá học phần"),
        new(Lecturer, "Nội dung đánh giá về giảng viên"),
        // Giữ nguyên chính tả đang lưu trên hệ thống thật ("cơ sơ"): lưu mới hay xuất tệp mẫu
        // đều ra đúng tên các đợt đã chạy đang đọc. Gõ "cơ sở" vẫn quy về mục này.
        new(Facilities, "Nội dung đánh giá về cơ sơ vật chất, phục vụ học tập"),
    ];

    private static readonly Dictionary<string, string> KeyByMatchKey =
        Entries.ToDictionary(x => MatchKey(x.Name), x => x.Key);

    /// <summary>Khoá của một tên mục; null khi tên không thuộc danh mục.</summary>
    public static string? Resolve(string? sectionName) =>
        string.IsNullOrWhiteSpace(sectionName)
            ? null
            : KeyByMatchKey.GetValueOrDefault(MatchKey(sectionName));

    public static string NameOf(string key) => Entries.First(x => x.Key == key).Name;

    /// <summary>
    /// Kiểm tên các mục của một bộ câu hỏi: mọi tên phải thuộc danh mục và không hai
    /// tên nào quy về cùng một khoá. Trả mã lỗi, hoặc null nếu hợp lệ.
    /// </summary>
    public static string? Validate(IReadOnlyList<string> sectionNames)
    {
        var keys = sectionNames.Select(Resolve).ToList();
        if (keys.Any(x => x is null)) return SurveyErrorCodes.SectionNameNotAllowed;
        return keys.Distinct().Count() == keys.Count ? null : SurveyErrorCodes.SectionNameExists;
    }

    /// <summary>
    /// Khoá so tên: bỏ dấu thanh, đ thành d, hạ chữ thường, mọi chuỗi ký tự không phải
    /// chữ/số gộp thành một dấu cách. Bản sao phía giao diện nằm ở
    /// src/Frontend/src/utils/surveySectionCatalog.ts — hai nơi phải cho ra cùng kết quả.
    /// </summary>
    private static string MatchKey(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        var pendingSpace = false;

        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            var folded = character is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(character);
            if (!char.IsLetterOrDigit(folded))
            {
                pendingSpace = builder.Length > 0;
                continue;
            }

            if (pendingSpace) builder.Append(' ');
            pendingSpace = false;
            builder.Append(folded);
        }

        return builder.ToString();
    }
}

public interface ISurveyService
{
    Task<IReadOnlyList<AnswerScaleDto>> GetAnswerScalesAsync(CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<AnswerScaleDto>> CreateAnswerScaleAsync(
        SaveAnswerScaleCommand command,
        CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<AnswerScaleDto>> UpdateAnswerScaleAsync(
        int answerScaleId,
        SaveAnswerScaleCommand command,
        CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<bool>> DeleteAnswerScaleAsync(
        int answerScaleId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SurveyTemplateDto>> GetSurveyTemplatesAsync(CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<SurveyTemplateDto>> CreateSurveyTemplateAsync(
        SaveSurveyTemplateCommand command,
        CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<SurveyTemplateDto>> UpdateSurveyTemplateAsync(
        int surveyTemplateId,
        SaveSurveyTemplateCommand command,
        CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<bool>> DeleteSurveyTemplateAsync(
        int surveyTemplateId,
        CancellationToken cancellationToken = default);

    /// <summary>Bỏ trống semesterId để lấy toàn bộ đợt khảo sát.</summary>
    Task<IReadOnlyList<SemesterSurveyDto>> GetSemesterSurveysAsync(
        int? semesterId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Tạo đợt khảo sát cho một học kỳ: mỗi lớp học phần của kỳ được sinh một
    /// bài khảo sát riêng với LinkToken riêng, dùng chung bộ câu hỏi đã chọn.
    /// </summary>
    Task<SurveyOperationResult<SemesterSurveyDto>> CreateSemesterSurveyAsync(
        CreateSemesterSurveyCommand command,
        CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<SemesterSurveyDto>> UpdateSemesterSurveyAsync(
        int semesterSurveyId,
        UpdateSemesterSurveyCommand command,
        CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<bool>> DeleteSemesterSurveyAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Bổ sung lớp vào đợt đã có theo một phạm vi tự chọn (cả kỳ / khoa / bộ môn /
    /// một lớp). Lớp đã có bài thì bỏ qua, nên gọi chồng phạm vi vẫn an toàn. Mỗi
    /// lớp thêm vào vẫn có LinkToken riêng.
    ///
    /// Thay luôn cơ chế "tạo bù" cũ: bù lớp nhập thiếu giờ chỉ là gọi lại đúng phạm
    /// vi của đợt, có thêm quyền đặt khung giờ riêng cho đám lớp mới.
    /// </summary>
    Task<SurveyOperationResult<AddSectionsToSemesterSurveyDto>> AddSectionsToSemesterSurveyAsync(
        int semesterSurveyId,
        AddSectionsToSemesterSurveyCommand command,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Đếm trước số lớp của một phạm vi. Truyền <paramref name="semesterSurveyId"/>
    /// để biết thêm bao nhiêu lớp trong đó chưa có bài trong đợt.
    /// </summary>
    Task<SurveyOperationResult<SurveyScopePreviewDto>> PreviewSectionScopeAsync(
        int semesterId,
        string scopeType,
        int? scopeId,
        int? semesterSurveyId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CourseSectionSurveyDto>> GetCourseSectionSurveysAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CourseSectionSurveyDto>> GetCourseSectionSurveysAsync(
        int? semesterSurveyId = null,
        int? semesterId = null,
        CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<CourseSectionSurveyDto>> GetCourseSectionSurveyAsync(
        int courseSectionSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>Danh sách phiếu trả lời đã thu của một lớp học phần.</summary>
    Task<SurveyOperationResult<IReadOnlyList<SurveyResponseSummaryDto>>> GetSurveyResponsesAsync(
        int courseSectionSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Huỷ toàn bộ phiếu đã thu của một lớp để yêu cầu lớp làm lại — dùng khi số
    /// liệu không tin được, vd cả lớp nộp nhưng bộ lọc nhiễu loại sạch.
    ///
    /// Xoá MỀM: phiếu và câu trả lời vẫn nằm trong bảng để lần lại được. Mọi số
    /// dẫn xuất bị dọn ngay trong cùng một transaction — điểm lớp, ba cột đếm
    /// phiếu, mốc chốt điểm, và điểm từng câu. Link cùng khung giờ giữ nguyên nên
    /// lớp làm lại được ngay bằng đúng mã QR cũ.
    /// </summary>
    Task<SurveyOperationResult<ClearSectionSurveyResponsesDto>> ClearSectionSurveyResponsesAsync(
        int courseSectionSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Tính lại điểm trung bình cho mọi lớp của một đợt khảo sát. Chạy theo mẻ khi
    /// quản trị bấm nút, không tự chạy sau mỗi phiếu mới về.
    /// </summary>
    Task<SurveyOperationResult<RecalculateScoresDto>> RecalculateSemesterSurveyScoresAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>Bảng thống kê đầy đủ của một đợt khảo sát, dùng cho trang thống kê.</summary>
    Task<SurveyOperationResult<SemesterSurveyStatisticsDto>> GetSemesterSurveyStatisticsAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Chuẩn hoá điểm các lớp bằng Z-score, hai tầng: so toàn đợt và so trong
    /// khoa/viện. Tự tính từ phiếu hợp lệ chứ không đọc cột đã lưu.
    /// </summary>
    Task<SurveyOperationResult<SemesterSurveyNormalizationDto>> GetSemesterSurveyNormalizationAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>Tổng hợp theo bộ môn của một đợt khảo sát, phục vụ trưởng khoa.</summary>
    Task<SurveyOperationResult<SemesterSurveyDepartmentSummaryDto>> GetSemesterSurveyDepartmentSummaryAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// So các lớp trong cùng một học phần để tách nguyên nhân: vấn đề thuộc học
    /// phần hay thuộc giảng viên.
    /// </summary>
    Task<SurveyOperationResult<SemesterSurveyCourseDiagnosisDto>> GetSemesterSurveyCourseDiagnosisAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>Chi tiết điểm theo từng câu hỏi của một khoa, bộ môn hoặc học phần.</summary>
    Task<SurveyOperationResult<SurveyScopeAnalysisDto>> GetSurveyScopeAnalysisAsync(
        int semesterSurveyId,
        string scopeType,
        int scopeId,
        CancellationToken cancellationToken = default);

    /// <summary>Danh sách giảng viên có dạy trong đợt, dùng cho bộ lọc.</summary>
    Task<SurveyOperationResult<IReadOnlyList<LecturerOptionDto>>> GetSemesterSurveyLecturersAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>Báo cáo cá nhân của một giảng viên trong một đợt khảo sát.</summary>
    Task<SurveyOperationResult<LecturerReportDto>> GetLecturerSurveyReportAsync(
        int semesterSurveyId,
        int lecturerId,
        CancellationToken cancellationToken = default);

    /// <summary>Tổng quan một đợt khảo sát ở phạm vi toàn trường.</summary>
    Task<SurveyOperationResult<SemesterSurveyDashboardDto>> GetSemesterSurveyDashboardAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Điểm tách theo mục câu hỏi (học phần / giảng viên / cơ sở vật chất) ở cấp toàn
    /// trường, khoa/viện và bộ môn, gộp từ ảnh chụp điểm từng câu. Chỉ dành cho quản trị.
    /// </summary>
    Task<SurveyOperationResult<SemesterSurveyQuestionSectionScoresDto>> GetSemesterSurveyQuestionSectionScoresAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Dải chỉ số gọn cho bảng điều khiển của trưởng bộ môn: số của bộ môn kèm số
    /// toàn trường để so.
    /// </summary>
    Task<SurveyOperationResult<DepartmentDashboardDto>> GetDepartmentDashboardAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<SurveyResponseDetailDto>> GetSurveyResponseAsync(
        int responseId,
        CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<CourseSectionSurveyDto>> UpdateCourseSectionSurveyScheduleAsync(
        int courseSectionSurveyId,
        SaveSurveyScheduleCommand command,
        CancellationToken cancellationToken = default);

    /// <summary>Đọc phiếu khảo sát theo LinkToken, không cần đăng nhập.</summary>
    Task<SurveyOperationResult<PublicSurveyDto>> GetPublicSurveyAsync(
        string linkToken,
        CancellationToken cancellationToken = default);

    /// <summary>Nhận bài làm ẩn danh của sinh viên và tính điểm trung bình.</summary>
    Task<SurveyOperationResult<SubmitSurveyResponseDto>> SubmitSurveyResponseAsync(
        string linkToken,
        SubmitSurveyResponseCommand command,
        CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<bool>> RestoreAnswerScaleAsync(int answerScaleId, CancellationToken cancellationToken = default);
    Task<SurveyOperationResult<bool>> RestoreSurveyTemplateAsync(int surveyTemplateId, CancellationToken cancellationToken = default);
    Task<SurveyOperationResult<bool>> RestoreSemesterSurveyAsync(int semesterSurveyId, CancellationToken cancellationToken = default);
}

public static class SurveyErrorCodes
{
    public const string InvalidRequest = "SURVEY_INVALID_REQUEST";

    /// <summary>Ngưỡng lọc lớp tính điểm nằm ngoài khoảng 0–100.</summary>
    public const string ScoringThresholdInvalid = "SURVEY_SCORING_THRESHOLD_INVALID";

    /// <summary>
    /// Bản ghi đích nằm ngoài phạm vi của người đang đăng nhập, hoặc hành động này
    /// không dành cho vai trò đó. Endpoint trả 403. Song song với
    /// <see cref="Application.Catalog.CatalogErrorCodes.OutOfScope"/>.
    /// </summary>
    public const string OutOfScope = "SURVEY_OUT_OF_SCOPE";

    public const string AnswerScaleNotFound = "SURVEY_ANSWER_SCALE_NOT_FOUND";
    public const string AnswerScaleNameRequired = "SURVEY_ANSWER_SCALE_NAME_REQUIRED";
    public const string AnswerScaleNameExists = "SURVEY_ANSWER_SCALE_NAME_EXISTS";
    public const string AnswerScaleOptionsInvalid = "SURVEY_ANSWER_SCALE_OPTIONS_INVALID";
    public const string AnswerScaleOptionTextRequired = "SURVEY_ANSWER_SCALE_OPTION_TEXT_REQUIRED";
    public const string AnswerScaleInUse = "SURVEY_ANSWER_SCALE_IN_USE";
    public const string AnswerScaleKindInvalid = "SURVEY_ANSWER_SCALE_KIND_INVALID";

    /// <summary>Thang loại 'Text' không được có mức trả lời nào.</summary>
    public const string AnswerScaleTextHasOptions = "SURVEY_ANSWER_SCALE_TEXT_HAS_OPTIONS";

    /// <summary>Không cho đổi loại thang khi đã có câu hỏi dùng nó.</summary>
    public const string AnswerScaleKindLocked = "SURVEY_ANSWER_SCALE_KIND_LOCKED";

    public const string TemplateNotFound = "SURVEY_TEMPLATE_NOT_FOUND";
    public const string TemplateNameRequired = "SURVEY_TEMPLATE_NAME_REQUIRED";
    public const string TemplateNameExists = "SURVEY_TEMPLATE_NAME_EXISTS";
    public const string TemplateQuestionsRequired = "SURVEY_TEMPLATE_QUESTIONS_REQUIRED";
    public const string TemplateInUse = "SURVEY_TEMPLATE_IN_USE";

    /// <summary>Bộ câu hỏi phải có ít nhất một mục.</summary>
    public const string TemplateSectionsRequired = "SURVEY_TEMPLATE_SECTIONS_REQUIRED";

    /// <summary>Vượt <see cref="SurveyRules.MaximumSectionsPerTemplate"/>.</summary>
    public const string TemplateTooManySections = "SURVEY_TEMPLATE_TOO_MANY_SECTIONS";

    /// <summary>Tên mục để trống hoặc chỉ có khoảng trắng.</summary>
    public const string SectionNameRequired = "SURVEY_SECTION_NAME_REQUIRED";

    /// <summary>Hai mục trong cùng một bộ quy về cùng một mục của <see cref="SurveySectionCatalog"/>.</summary>
    public const string SectionNameExists = "SURVEY_SECTION_NAME_EXISTS";

    /// <summary>Tên mục không thuộc danh mục mục cố định <see cref="SurveySectionCatalog"/>.</summary>
    public const string SectionNameNotAllowed = "SURVEY_SECTION_NAME_NOT_ALLOWED";

    /// <summary>"SectionId" gửi lên không phải mục của chính bộ đang lưu.</summary>
    public const string SectionNotFound = "SURVEY_SECTION_NOT_FOUND";

    /// <summary>Mục không có câu hỏi nào; mục rỗng không có vị trí để đứng.</summary>
    public const string SectionEmpty = "SURVEY_SECTION_EMPTY";

    /// <summary>Câu hỏi trỏ tới một mục không có trong danh sách gửi kèm.</summary>
    public const string QuestionSectionInvalid = "SURVEY_QUESTION_SECTION_INVALID";

    /// <summary>Các câu cùng một mục không nằm liền nhau nên mục bị cắt làm nhiều khúc.</summary>
    public const string SectionQuestionsNotContiguous = "SURVEY_SECTION_QUESTIONS_NOT_CONTIGUOUS";

    /// <summary>Câu hỏi trỏ tới một "AnswerScaleId" không tồn tại.</summary>
    public const string QuestionScaleNotFound = "SURVEY_QUESTION_SCALE_NOT_FOUND";

    /// <summary>Đặt câu bẫy trên câu dùng thang tự nhập chữ, không có mức nào để chọn.</summary>
    public const string AttentionCheckOnTextScale = "SURVEY_ATTENTION_CHECK_ON_TEXT_SCALE";

    /// <summary>Mức bắt buộc của câu bẫy không phải là một mức có thật của thang đó.</summary>
    public const string AttentionCheckValueInvalid = "SURVEY_ATTENTION_CHECK_VALUE_INVALID";

    public const string SemesterNotFound = "SURVEY_SEMESTER_NOT_FOUND";
    public const string SemesterHasNoSections = "SURVEY_SEMESTER_HAS_NO_SECTIONS";
    public const string ScheduleInvalid = "SURVEY_SCHEDULE_INVALID";
    public const string SemesterSurveyNotFound = "SURVEY_SEMESTER_SURVEY_NOT_FOUND";

    /// <summary>Đợt không có lớp nào trong phạm vi người dùng, không có gì để xuất.</summary>
    public const string SemesterSurveyHasNoSections = "SURVEY_SEMESTER_SURVEY_HAS_NO_SECTIONS";
    /// <summary>Tên đợt để trống hoặc chỉ có khoảng trắng.</summary>
    public const string SemesterSurveyNameRequired = "SURVEY_SEMESTER_SURVEY_NAME_REQUIRED";
    /// <summary>Kiểu phạm vi không nằm trong <see cref="SurveyScopeTypes"/>.</summary>
    public const string ScopeTypeUnsupported = "SURVEY_SCOPE_TYPE_UNSUPPORTED";
    /// <summary>Kiểu phạm vi cần mã đơn vị nhưng không truyền lên.</summary>
    public const string ScopeIdRequired = "SURVEY_SCOPE_ID_REQUIRED";
    /// <summary>Phạm vi hợp lệ nhưng không có lớp nào của kỳ rơi vào.</summary>
    public const string ScopeHasNoSections = "SURVEY_SCOPE_HAS_NO_SECTIONS";
    /// <summary>Mọi lớp của phạm vi đều đã có bài khảo sát trong đợt.</summary>
    public const string ScopeSectionsAlreadyAdded = "SURVEY_SCOPE_SECTIONS_ALREADY_ADDED";
    public const string SemesterSurveyHasResponses = "SURVEY_SEMESTER_SURVEY_HAS_RESPONSES";
    /// <summary>Lịch tổng mới không bao trọn lịch của tất cả lớp đã có trong đợt.</summary>
    public const string SemesterSurveyScheduleExcludesSections =
        "SURVEY_SEMESTER_SURVEY_SCHEDULE_EXCLUDES_SECTIONS";
    /// <summary>Lịch lớp phải nằm trọn trong lịch tổng của đợt khảo sát.</summary>
    public const string SectionScheduleOutsideSemesterSurvey =
        "SURVEY_SECTION_SCHEDULE_OUTSIDE_SEMESTER_SURVEY";

    public const string SectionSurveyNotFound = "SURVEY_SECTION_SURVEY_NOT_FOUND";

    /// <summary>Lớp chưa có phiếu nào nên không có gì để huỷ.</summary>
    public const string SectionSurveyHasNoResponses = "SURVEY_SECTION_SURVEY_HAS_NO_RESPONSES";

    /// <summary>Giảng viên không có lớp nào trong đợt nên không dựng được báo cáo cá nhân.</summary>
    public const string LecturerHasNoSections = "SURVEY_LECTURER_HAS_NO_SECTIONS";

    public const string ResponseNotFound = "SURVEY_RESPONSE_NOT_FOUND";

    public const string LinkNotFound = "SURVEY_LINK_NOT_FOUND";

    /// <summary>Ngoài khung giờ, không rõ trước hay sau. Giữ cho các chỗ gọi cũ.</summary>
    public const string LinkNotOpen = "SURVEY_LINK_NOT_OPEN";

    /// <summary>Chưa tới giờ mở phiếu.</summary>
    public const string LinkNotStarted = "SURVEY_LINK_NOT_STARTED";

    /// <summary>Đã quá hạn nộp phiếu.</summary>
    public const string LinkExpired = "SURVEY_LINK_EXPIRED";

    /// <summary>
    /// Số phiếu đã nộp đạt sĩ số của lớp. Đếm mọi lượt nộp chưa bị huỷ, kể cả phiếu
    /// bị bộ lọc nhiễu loại — một người đã nộp là đã dùng một suất.
    /// </summary>
    public const string ClassFull = "SURVEY_CLASS_FULL";
    public const string AnswersIncomplete = "SURVEY_ANSWERS_INCOMPLETE";
    public const string AnswerValueInvalid = "SURVEY_ANSWER_VALUE_INVALID";

    /// <summary>Câu trả lời tự nhập vượt <see cref="SurveyRules.MaximumTextAnswerLength"/> ký tự.</summary>
    public const string AnswerTextTooLong = "SURVEY_ANSWER_TEXT_TOO_LONG";

    public const string ScopeTypeInvalid = "SURVEY_SCOPE_TYPE_INVALID";
    public const string ScopeNotFound = "SURVEY_SCOPE_NOT_FOUND";

    public const string CommentsTooLong = "SURVEY_COMMENTS_TOO_LONG";
}
