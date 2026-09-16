using Application.Reports;
using Application.Surveys;
using Domain;
using Infrastructure.Persistence;
using Infrastructure.Surveys;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Infrastructure.Reports;

public sealed class EfReportService(
    AppDbContext db,
    IMemoryCache cache,
    SchoolOverviewCacheVersion cacheVersion,
    IScoringThresholdProvider scoringThresholds) : IReportService
{
    /// <summary>Prefix key cache cho báo cáo tổng quan toàn trường (theo học kỳ).</summary>
    private const string SchoolOverviewCachePrefix = "school-overview:";

    /// <summary>TTL ngắn vì dữ liệu gộp chỉ tăng khi có phiếu mới, chấp nhận độ trễ nhỏ.</summary>
    private static readonly TimeSpan SchoolOverviewCacheTtl = TimeSpan.FromSeconds(90);

    /// <summary>Số phiếu trả lời tối thiểu để một câu hỏi được xếp vào danh sách "yếu nhất" (tránh nhiễu).</summary>
    private const int WeakQuestionMinAnswers = 10;

    /// <summary>Số câu hỏi yếu nhất hiển thị trong bảng tổng quan.</summary>
    private const int WeakQuestionCount = 5;

    /// <summary>Trần số tiêu chí trả về khi người dùng tự chọn số lượng, chặn truy vấn quá rộng.</summary>
    private const int MaxQuestionRankingCount = 50;

    /// <summary>Trần số câu trả lời tự nhập trả kèm mỗi câu hỏi, tránh payload quá lớn.</summary>
    private const int MaxTextAnswersPerQuestion = 200;

    /// <summary>
    /// Số phiếu của một lớp, tách làm hai nhóm theo quyết định C-e:
    /// <see cref="TotalCount"/> đếm hết mọi phiếu, dùng cho số liệu tiến độ thu
    /// phiếu (tỷ lệ hoàn thành so với sĩ số) — nộp ẩu thì vẫn là đã tham gia.
    /// <see cref="ValidCount"/> và <see cref="ValidTotalScore"/> chỉ gộp phiếu qua
    /// bộ lọc nhiễu, dùng cho mọi số liệu về chất lượng.
    /// </summary>
    /// <summary>
    /// Số liệu của một lớp ĐỌC TỪ ẢNH CHỤP lần bấm "Tính lại điểm" gần nhất, không
    /// đếm sống từ bảng phiếu.
    ///
    /// <paramref name="IsScored"/> chính là "lớp có được tính vào điểm ở lần chốt
    /// đó không" — lấy từ việc AverageScore có null hay không, chứ không so lại
    /// ngưỡng. So lại ngưỡng thì sửa ngưỡng xong mà chưa bấm tính là báo cáo lệch
    /// ngay với bảng dữ liệu.
    /// </summary>
    private sealed record ResponseTally(
        int TotalCount,
        int ValidCount,
        int SnapshotValidCount,
        decimal ValidTotalScore,
        bool IsScored)
    {
        public static readonly ResponseTally Empty = new(0, 0, 0, 0m, false);

        public decimal AverageScore =>
            SnapshotValidCount > 0 ? Math.Round(ValidTotalScore / SnapshotValidCount, 2) : 0m;
    }

    /// <summary>
    /// Gộp số phiếu theo lớp trong một lượt truy vấn: cả tổng lẫn phần hợp lệ.
    /// Số phiếu đếm sống để phản ánh tiến độ thực tế, điểm lấy từ ảnh chụp lúc chốt.
    /// </summary>
    private async Task<Dictionary<int, ResponseTally>> ResponseTalliesAsync(
        IReadOnlyCollection<int> courseSectionSurveyIds,
        CancellationToken cancellationToken)
    {
        if (courseSectionSurveyIds.Count == 0) return [];

        // Luật nào của bộ lọc nhiễu đang được áp là do quản trị bật tắt, nên phải
        // đọc lại "RejectionReasons" chứ không dùng cột "IsValid" đã chốt lúc nộp.
        // Viết thẳng ra đây thay vì gọi ResponseInclusion.CountsTowardScore() vì
        // EF không dịch được một Expression lồng trong Count(...) của GroupBy.
        var thresholds = await scoringThresholds.GetAsync(cancellationToken);
        var rejectTooFast = thresholds.RejectTooFast;
        var rejectSingleAnswer = thresholds.RejectSingleAnswer;
        var rejectAttentionCheck = thresholds.RejectAttentionCheckFailed;

        // Đếm sống số phiếu thực tế từ bảng SurveyResponses để phản ánh đúng tiến độ
        var liveCounts = await db.SurveyResponses.AsNoTracking()
            .Where(x => courseSectionSurveyIds.Contains(x.CourseSectionSurveyId) && !x.IsDeleted)
            .GroupBy(x => x.CourseSectionSurveyId)
            .Select(g => new
            {
                Id = g.Key,
                Total = g.Count(),
                Valid = g.Count(r =>
                    r.RejectionReasons == null
                    || ((!rejectTooFast
                            || !r.RejectionReasons.Contains(RejectionReasonCodes.TooFast))
                        && (!rejectSingleAnswer
                            || !r.RejectionReasons.Contains(RejectionReasonCodes.SingleAnswer))
                        && (!rejectAttentionCheck
                            || !r.RejectionReasons.Contains(RejectionReasonCodes.AttentionCheckFailed))))
            })
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        // Đọc ảnh chụp điểm chốt trên CourseSectionSurveys
        var snapshots = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => courseSectionSurveyIds.Contains(x.CourseSectionSurveyId))
            .Select(x => new
            {
                x.CourseSectionSurveyId,
                x.TotalResponseCount,
                x.ValidResponseCount,
                x.AverageScore,
            })
            .ToListAsync(cancellationToken);

        return snapshots.ToDictionary(
            x => x.CourseSectionSurveyId,
            x =>
            {
                var live = liveCounts.GetValueOrDefault(x.CourseSectionSurveyId);
                int total = live != null ? live.Total : x.TotalResponseCount;
                int valid = live != null ? live.Valid : x.ValidResponseCount;
                return new ResponseTally(
                    total,
                    valid,
                    x.ValidResponseCount,
                    (x.AverageScore ?? 0m) * x.ValidResponseCount,
                    x.AverageScore is not null);
            });
    }

    /// <summary>
    /// Lọc ra những lớp ĐÃ được chốt điểm ở lần bấm "Tính lại điểm" gần nhất.
    /// Mọi phân tích chất lượng chỉ được đứng trên tập lớp này, giống hệt tab
    /// "đủ điều kiện" của trang Bảng dữ liệu khảo sát.
    /// </summary>
    private async Task<List<int>> ScoredSectionSurveyIdsAsync(
        IReadOnlyCollection<int> courseSectionSurveyIds,
        CancellationToken cancellationToken)
    {
        if (courseSectionSurveyIds.Count == 0) return [];

        return await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => courseSectionSurveyIds.Contains(x.CourseSectionSurveyId) && x.AverageScore != null)
            .Select(x => x.CourseSectionSurveyId)
            .ToListAsync(cancellationToken);
    }

    /// <summary>Điểm và số lượt trả lời của từng câu theo ảnh chụp lần tính gần nhất.</summary>
    private readonly record struct QuestionScoreSnapshot(decimal AverageScore, int AnswerCount);

    /// <summary>
    /// Gộp bảng điểm từng câu đã chốt của các lớp. Trung bình có TRỌNG SỐ theo số
    /// lượt trả lời — lấy trung bình của trung bình thì lớp 5 phiếu nặng ngang lớp
    /// 50 phiếu và con số không còn khớp với điểm chung của phạm vi.
    /// </summary>
    private async Task<Dictionary<int, QuestionScoreSnapshot>> QuestionScoreSnapshotsAsync(
        IReadOnlyCollection<int> scoredSectionSurveyIds,
        CancellationToken cancellationToken)
    {
        if (scoredSectionSurveyIds.Count == 0) return [];

        var rows = await db.CourseSectionSurveyQuestionScores.AsNoTracking()
            .Where(x => scoredSectionSurveyIds.Contains(x.CourseSectionSurveyId))
            .GroupBy(x => x.QuestionId)
            .Select(g => new
            {
                QuestionId = g.Key,
                WeightedScore = g.Sum(x => x.AverageScore * x.AnswerCount),
                AnswerCount = g.Sum(x => x.AnswerCount),
            })
            .ToListAsync(cancellationToken);

        return rows
            .Where(x => x.AnswerCount > 0)
            .ToDictionary(
                x => x.QuestionId,
                x => new QuestionScoreSnapshot(
                    Math.Round(x.WeightedScore / x.AnswerCount, 2),
                    x.AnswerCount));
    }

    /// <summary>
    /// Thay điểm và số lượt trả lời của một câu bằng con số đã chốt. Phân bố lựa
    /// chọn vẫn dựng từ phiếu gốc vì không có bảng chốt nào lưu nó, nhưng phiếu gốc
    /// ấy đã được khoanh về đúng các lớp đã chốt điểm nên hai bên nói cùng một tập.
    /// </summary>
    private static QuestionRatingDto WithSnapshotScore(
        QuestionRatingDto rating,
        IReadOnlyDictionary<int, QuestionScoreSnapshot> snapshots)
    {
        // Câu tự nhập không có điểm nên không nằm trong bảng điểm từng câu.
        if (rating.ScaleKind == AnswerScaleKinds.Text) return rating;

        return snapshots.TryGetValue(rating.QuestionId, out var snapshot)
            ? rating with { AverageScore = snapshot.AverageScore, TotalAnswers = snapshot.AnswerCount }
            : rating with { AverageScore = 0, TotalAnswers = 0, OptionDistribution = [] };
    }

    /// <summary>
    /// Tên người dạy của một lớp. Lớp chưa gắn được mã giảng viên vẫn có tên đọc từ tệp
    /// import ở "UnidentifiedLecturerName" — bỏ qua nó thì một lớp thật ra có người dạy
    /// lại hiện "Chưa phân công". Cùng thứ tự với trang Thống kê chi tiết, để một lớp
    /// không mang hai tên ở hai màn hình.
    /// </summary>
    private static string LecturerNameOf(Lecturer? lecturer, CourseSection? section)
    {
        if (lecturer is not null) return lecturer.FullName;
        var unidentifiedName = section?.UnidentifiedLecturerName?.Trim();
        return string.IsNullOrEmpty(unidentifiedName) ? "Chưa phân công" : unidentifiedName;
    }

    public async Task<OperationalProgressReportDto?> GetOperationalProgressReportAsync(
        int semesterId,
        CancellationToken cancellationToken = default)
    {
        var semester = await db.Semesters
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.SemesterId == semesterId, cancellationToken);
        if (semester is null) return null;

        var academicYear = await db.AcademicYears
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.AcademicYearId == semester.AcademicYearId, cancellationToken);

        var semesterSurveyIds = await db.SemesterSurveys
            .AsNoTracking()
            .Where(x => x.SemesterId == semesterId)
            .Select(x => x.SemesterSurveyId)
            .ToListAsync(cancellationToken);

        var sectionSurveys = await db.CourseSectionSurveys
            .AsNoTracking()
            .Where(x => semesterSurveyIds.Contains(x.SemesterSurveyId))
            .ToListAsync(cancellationToken);

        var sectionSurveyIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();

        // Tiến độ tính trên PHIẾU HỢP LỆ, giống bảng tiến độ và tổng quan toàn
        // trường. Trước đây chỗ này cố ý đếm cả phiếu bị lọc với lý do "nộp ẩu vẫn
        // là đã tham gia"; lý do đó đã bị bỏ khi cả hệ thống chuyển sang đo bằng
        // phiếu hợp lệ, chỉ riêng đây bị sót vì không màn hình nào gọi tới.
        var countThresholds = await scoringThresholds.GetAsync(cancellationToken);
        var countRejectTooFast = countThresholds.RejectTooFast;
        var countRejectSingleAnswer = countThresholds.RejectSingleAnswer;
        var countRejectAttentionCheck = countThresholds.RejectAttentionCheckFailed;

        var responseCounts = await db.SurveyResponses
            .AsNoTracking()
            .Where(x => sectionSurveyIds.Contains(x.CourseSectionSurveyId))
            .GroupBy(x => x.CourseSectionSurveyId)
            .Select(g => new
            {
                CourseSectionSurveyId = g.Key,
                Count = g.Count(x =>
                    x.RejectionReasons == null
                    || ((!countRejectTooFast
                            || !x.RejectionReasons.Contains(RejectionReasonCodes.TooFast))
                        && (!countRejectSingleAnswer
                            || !x.RejectionReasons.Contains(RejectionReasonCodes.SingleAnswer))
                        && (!countRejectAttentionCheck
                            || !x.RejectionReasons.Contains(RejectionReasonCodes.AttentionCheckFailed)))),
            })
            .ToDictionaryAsync(x => x.CourseSectionSurveyId, x => x.Count, cancellationToken);

        var sectionIds = sectionSurveys.Select(x => x.CourseSectionId).Distinct().ToList();
        var sections = await db.CourseSections
            .AsNoTracking()
            .Where(x => sectionIds.Contains(x.CourseSectionId))
            .ToListAsync(cancellationToken);

        var courseIds = sections.Select(x => x.CourseId).Distinct().ToList();
        var courses = await db.Courses
            .AsNoTracking()
            .Where(x => courseIds.Contains(x.CourseId))
            .ToListAsync(cancellationToken);

        var lecturerIds = sections.Select(x => x.LecturerId).Distinct().ToList();
        var lecturers = await db.Lecturers
            .AsNoTracking()
            .Where(x => lecturerIds.Contains(x.LecturerId))
            .ToListAsync(cancellationToken);
        var sectionById = sections.ToDictionary(x => x.CourseSectionId);
        var courseById = courses.ToDictionary(x => x.CourseId);
        var lecturerById = lecturers.ToDictionary(x => x.LecturerId);

        var sectionDetails = new List<SectionProgressDetailDto>();
        int completedCount = 0;
        int inProgressCount = 0;
        int laggingCount = 0;

        foreach (var ss in sectionSurveys)
        {
            var sec = sectionById.GetValueOrDefault(ss.CourseSectionId);
            var crs = sec is null ? null : courseById.GetValueOrDefault(sec.CourseId);
            var lec = sec?.LecturerId is { } lecturerId
                ? lecturerById.GetValueOrDefault(lecturerId)
                : null;

            int classSize = sec?.ClassSize ?? 0;
            int responseCount = responseCounts.TryGetValue(ss.CourseSectionSurveyId, out var cnt) ? cnt : 0;
            decimal rate = classSize > 0 ? Math.Round((decimal)responseCount / classSize * 100, 2) : 0;

            string status;
            if (rate >= ReportThresholds.CompletedCompletionRate)
            {
                status = "Hoàn thành";
                completedCount++;
            }
            else if (rate >= ReportThresholds.LaggingCompletionRate)
            {
                status = "Đang thu";
                inProgressCount++;
            }
            else
            {
                status = "Chậm tiến độ";
                laggingCount++;
            }

            sectionDetails.Add(new SectionProgressDetailDto(
                ss.CourseSectionSurveyId,
                crs?.CourseCode ?? string.Empty,
                crs?.CourseName ?? string.Empty,
                sec?.SectionName ?? string.Empty,
                LecturerNameOf(lec, sec),
                classSize,
                responseCount,
                rate,
                status
            ));
        }

        int totalTarget = sectionDetails.Sum(x => x.ClassSize);
        int totalActual = sectionDetails.Sum(x => x.ResponseCount);
        decimal overallRate = totalTarget > 0 ? Math.Round((decimal)totalActual / totalTarget * 100, 2) : 0;

        return new OperationalProgressReportDto(
            semester.SemesterId,
            semester.SemesterName,
            academicYear?.AcademicYearName ?? string.Empty,
            totalTarget,
            totalActual,
            overallRate,
            completedCount,
            inProgressCount,
            laggingCount,
            sectionDetails.OrderBy(x => x.CourseCode).ThenBy(x => x.SectionName).ToList()
        );
    }

    public Task<IReadOnlyList<LecturerPerformanceReportDto>> GetLecturerPerformanceReportsAsync(
        int? facultyId,
        int? departmentId,
        int? semesterId,
        CancellationToken cancellationToken = default) =>
        GetLecturerPerformanceReportsCoreAsync(facultyId, departmentId, semesterId, null, cancellationToken);

    private async Task<IReadOnlyList<LecturerPerformanceReportDto>> GetLecturerPerformanceReportsCoreAsync(
        int? facultyId,
        int? departmentId,
        int? semesterId,
        int? specificLecturerId,
        CancellationToken cancellationToken)
    {
        var query = db.Lecturers.AsNoTracking().AsQueryable();
        if (specificLecturerId is { } lId)
        {
            query = query.Where(x => x.LecturerId == lId);
        }
        else
        {
            if (facultyId is { } fId) query = query.Where(x => x.FacultyId == fId);
            if (departmentId is { } dId) query = query.Where(x => x.DepartmentId == dId);
        }

        var lecturers = await query.ToListAsync(cancellationToken);
        if (lecturers.Count == 0) return [];

        var lecturerIds = lecturers.Select(x => x.LecturerId).ToList();

        var faculties = await db.Faculties.AsNoTracking().ToDictionaryAsync(x => x.FacultyId, x => x.FacultyName, cancellationToken);
        var departments = await db.Departments.AsNoTracking().ToDictionaryAsync(x => x.DepartmentId, x => x.DepartmentName, cancellationToken);

        // Lớp chưa xác định được giảng viên (LecturerId NULL) không vào báo cáo giảng viên.
        var sectionQuery = db.CourseSections.AsNoTracking()
            .Where(x => x.LecturerId != null && lecturerIds.Contains(x.LecturerId.Value));
        if (semesterId is { } semId)
        {
            sectionQuery = sectionQuery.Where(x => x.SemesterId == semId);
        }
        var sections = await sectionQuery.ToListAsync(cancellationToken);
        var sectionIds = sections.Select(x => x.CourseSectionId).ToList();

        var courseIds = sections.Select(x => x.CourseId).Distinct().ToList();
        var courses = await db.Courses.AsNoTracking()
            .Where(x => courseIds.Contains(x.CourseId))
            .ToDictionaryAsync(x => x.CourseId, x => x, cancellationToken);

        var sectionSurveys = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => sectionIds.Contains(x.CourseSectionId))
            .ToListAsync(cancellationToken);

        var cssIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();

        // Gộp ngay trong SQL thay vì kéo hết phiếu về bộ nhớ ứng dụng.
        var responseStats = await ResponseTalliesAsync(cssIds, cancellationToken);
        var sectionsByLecturerId = sections
            .Where(x => x.LecturerId.HasValue)
            .ToLookup(x => x.LecturerId!.Value);
        var sectionSurveysBySectionId = sectionSurveys.ToLookup(x => x.CourseSectionId);

        var reports = new List<LecturerPerformanceReportDto>();

        foreach (var lec in lecturers)
        {
            var lecSections = sectionsByLecturerId[lec.LecturerId].ToList();
            var summary = SummariseLecturerSections(lecSections, sectionSurveysBySectionId, courses, responseStats);

            reports.Add(new LecturerPerformanceReportDto(
                lec.LecturerId,
                lec.FullName,
                lec.DepartmentId.HasValue && departments.TryGetValue(lec.DepartmentId.Value, out var dName) ? dName : "Chưa thuộc bộ môn",
                lec.FacultyId.HasValue && faculties.TryGetValue(lec.FacultyId.Value, out var fName) ? fName : "Chưa thuộc khoa",
                summary.AverageScore,
                summary.ValidResponses,
                lecSections.Count,
                summary.AverageScore,
                summary.AverageScore,
                summary.Sections,
                [],
                summary.ScoredValidResponses
            ));
        }

        return reports.OrderByDescending(x => x.AverageScore).ToList();
    }

    private sealed record LecturerSectionsSummary(
        IReadOnlyList<LecturerSectionSummaryDto> Sections,
        int ValidResponses,
        int ScoredValidResponses,
        decimal AverageScore);

    /// <summary>
    /// Gộp số liệu các lớp của một giảng viên cho trang giảng viên. Dùng chung cho
    /// giảng viên đã gắn mã và giảng viên chưa gắn mã tra theo tên, để hai trang tính
    /// đúng một cách.
    /// </summary>
    private static LecturerSectionsSummary SummariseLecturerSections(
        IReadOnlyCollection<CourseSection> lecturerSections,
        ILookup<int, CourseSectionSurvey> sectionSurveysBySectionId,
        IReadOnlyDictionary<int, Course> courses,
        IReadOnlyDictionary<int, ResponseTally> responseStats)
    {
        var sectionById = lecturerSections.ToDictionary(x => x.CourseSectionId);
        var sectionSurveys = lecturerSections
            .SelectMany(section => sectionSurveysBySectionId[section.CourseSectionId])
            .ToList();

        // Mọi con số hiển thị đều tính trên phiếu hợp lệ; phiếu bị bộ lọc nhiễu
        // loại không dùng được vào kết quả nào nên cũng không tính là đã thu.
        int validResponses = 0;

        // Điểm trung bình gộp riêng, chỉ từ lớp đã thu đủ phiếu. Số ĐẾM phiếu ở
        // trên vẫn cộng mọi lớp — đó là tiến độ, lớp thiếu phiếu cũng phải hiện
        // ra thì giảng viên mới biết lớp nào cần nhắc sinh viên làm.
        int scoredValidResponses = 0;
        decimal scoredScoreSum = 0;

        var sectionSummaries = new List<LecturerSectionSummaryDto>();
        foreach (var css in sectionSurveys)
        {
            var sec = sectionById.GetValueOrDefault(css.CourseSectionId);
            var crs = sec != null && courses.TryGetValue(sec.CourseId, out var c) ? c : null;

            var tally = responseStats.GetValueOrDefault(css.CourseSectionSurveyId, ResponseTally.Empty);

            validResponses += tally.ValidCount;

            int classSize = sec?.ClassSize ?? 0;
            if (tally.IsScored)
            {
                scoredValidResponses += tally.ValidCount;
                scoredScoreSum += tally.ValidTotalScore;
            }

            sectionSummaries.Add(new LecturerSectionSummaryDto(
                css.CourseSectionSurveyId,
                crs?.CourseCode ?? string.Empty,
                crs?.CourseName ?? string.Empty,
                sec?.SectionName ?? string.Empty,
                classSize,
                tally.TotalCount,
                tally.ValidCount,
                tally.TotalCount - tally.ValidCount,
                classSize > 0 ? Math.Round((decimal)tally.ValidCount / classSize * 100, 1) : 0,
                tally.AverageScore
            ));
        }

        decimal avgScore = scoredValidResponses > 0
            ? Math.Round(scoredScoreSum / scoredValidResponses, 2)
            : 0;

        return new LecturerSectionsSummary(sectionSummaries, validResponses, scoredValidResponses, avgScore);
    }

    public async Task<LecturerPerformanceReportDto?> GetUnidentifiedLecturerReportAsync(
        string lecturerName,
        int? facultyId,
        int? semesterId,
        CancellationToken cancellationToken = default)
    {
        var name = lecturerName?.Trim() ?? string.Empty;
        if (name.Length == 0) return null;

        // 0 hay null đều là lớp chưa thuộc khoa/viện nào, khớp FacultyId = 0 của bảng
        // Tra cứu chi tiết.
        int? targetFacultyId = facultyId is > 0 ? facultyId : null;

        // Chỉ lớp CHƯA gắn mã giảng viên. Tên đọc từ tệp import không phải khoá duy nhất
        // — hai người trùng tên ở hai khoa là chuyện thường — nên khoanh thêm theo
        // khoa/viện. Không khoanh theo bộ môn: một người vẫn dạy học phần của nhiều bộ
        // môn trong cùng một khoa.
        var candidateQuery = db.CourseSections.AsNoTracking()
            .Where(x => x.LecturerId == null && x.UnidentifiedLecturerName != null);
        if (semesterId is { } semId)
        {
            candidateQuery = candidateQuery.Where(x => x.SemesterId == semId);
        }
        var namedSections = (await candidateQuery.ToListAsync(cancellationToken))
            .Where(x => string.Equals(x.UnidentifiedLecturerName!.Trim(), name, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (namedSections.Count == 0) return null;

        var courseIds = namedSections.Select(x => x.CourseId).Distinct().ToList();
        var courses = await db.Courses.AsNoTracking()
            .Where(x => courseIds.Contains(x.CourseId))
            .ToDictionaryAsync(x => x.CourseId, x => x, cancellationToken);
        var departments = await db.Departments.AsNoTracking()
            .ToDictionaryAsync(x => x.DepartmentId, x => x, cancellationToken);

        // Đơn vị của lớp theo đúng thứ tự của bảng Tra cứu chi tiết: đơn vị sở hữu học
        // phần, khoa suy từ bộ môn nếu học phần không ghi khoa. Lớp chưa gắn mã nên không
        // có nhánh giảng viên để lùi về.
        int? DepartmentOf(CourseSection section) =>
            courses.TryGetValue(section.CourseId, out var course) ? course.DepartmentId : null;

        int? FacultyOf(CourseSection section)
        {
            if (!courses.TryGetValue(section.CourseId, out var course)) return null;
            if (course.FacultyId is { } courseFacultyId) return courseFacultyId;
            return course.DepartmentId is { } departmentId
                && departments.TryGetValue(departmentId, out var department)
                    ? department.FacultyId
                    : null;
        }

        var sections = namedSections.Where(x => FacultyOf(x) == targetFacultyId).ToList();
        if (sections.Count == 0) return null;

        var sectionIds = sections.Select(x => x.CourseSectionId).ToList();
        var sectionSurveys = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => sectionIds.Contains(x.CourseSectionId))
            .ToListAsync(cancellationToken);
        var responseStats = await ResponseTalliesAsync(
            sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList(),
            cancellationToken);
        var summary = SummariseLecturerSections(
            sections,
            sectionSurveys.ToLookup(x => x.CourseSectionId),
            courses,
            responseStats);

        // Một người có thể dạy học phần của nhiều bộ môn trong khoa: ghi đủ các bộ môn.
        var departmentNames = sections
            .Select(DepartmentOf)
            .Distinct()
            .Select(id => id is { } departmentId && departments.TryGetValue(departmentId, out var department)
                ? department.DepartmentName
                : "Chưa thuộc bộ môn")
            .Distinct()
            .OrderBy(x => x)
            .ToList();
        var facultyName = targetFacultyId is { } targetId
            ? await db.Faculties.AsNoTracking()
                .Where(x => x.FacultyId == targetId)
                .Select(x => x.FacultyName)
                .FirstOrDefaultAsync(cancellationToken) ?? "Chưa thuộc khoa"
            : "Chưa thuộc khoa";

        var report = new LecturerPerformanceReportDto(
            0,
            sections[0].UnidentifiedLecturerName!.Trim(),
            string.Join(", ", departmentNames),
            facultyName,
            summary.AverageScore,
            summary.ValidResponses,
            sections.Count,
            summary.AverageScore,
            summary.AverageScore,
            summary.Sections,
            [],
            summary.ScoredValidResponses);

        return await WithQuestionRatingsAsync(report, sectionIds, cancellationToken);
    }

    public async Task<LecturerPerformanceReportDto?> GetLecturerPerformanceReportAsync(
        int lecturerId,
        int? semesterId,
        CancellationToken cancellationToken = default)
    {
        var reports = await GetLecturerPerformanceReportsCoreAsync(null, null, semesterId, lecturerId, cancellationToken);
        var report = reports.FirstOrDefault(x => x.LecturerId == lecturerId);
        if (report is null) return null;

        var sectionQuery = db.CourseSections.AsNoTracking()
            .Where(x => x.LecturerId == lecturerId);
        if (semesterId is { } semId)
        {
            sectionQuery = sectionQuery.Where(x => x.SemesterId == semId);
        }
        var sectionIds = await sectionQuery.Select(x => x.CourseSectionId).ToListAsync(cancellationToken);

        return await WithQuestionRatingsAsync(report, sectionIds, cancellationToken);
    }

    /// <summary>
    /// Bảng phân tích theo câu hỏi của trang giảng viên, dựng trên đúng tập lớp của trang.
    /// Dùng chung cho giảng viên đã gắn mã và giảng viên chưa gắn mã tra theo tên.
    /// </summary>
    private async Task<LecturerPerformanceReportDto> WithQuestionRatingsAsync(
        LecturerPerformanceReportDto report,
        IReadOnlyCollection<int> sectionIds,
        CancellationToken cancellationToken)
    {
        var sectionSurveys = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => sectionIds.Contains(x.CourseSectionId))
            .ToListAsync(cancellationToken);
        var cssIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();
        if (cssIds.Count == 0) return report;

        // Dải tóm tắt phía trên đã chỉ gộp lớp đã chốt điểm, nên bảng phân tích câu
        // hỏi ngay bên dưới cũng phải đứng trên đúng tập lớp ấy. Trước đây chỗ này
        // quét mọi lớp của giảng viên nên hai nửa của cùng một màn hình nói về hai
        // tập lớp khác nhau.
        var scoredCssIds = await ScoredSectionSurveyIdsAsync(cssIds, cancellationToken);
        if (scoredCssIds.Count == 0) return report with { QuestionRatings = [] };

        var questionSnapshots = await QuestionScoreSnapshotsAsync(scoredCssIds, cancellationToken);

        // Điểm từng câu của giảng viên là số liệu chất lượng: chỉ gộp phiếu qua được
        // những luật lọc nhiễu đang bật.
        var lecturerThresholds = await scoringThresholds.GetAsync(cancellationToken);
        var validResponseIds = db.SurveyResponses.AsNoTracking()
            .Where(x => scoredCssIds.Contains(x.CourseSectionSurveyId))
            .Where(lecturerThresholds.CountsTowardScore())
            .Select(x => x.ResponseId);

        var validAnswersQuery = db.SurveyResponseAnswers.AsNoTracking()
            .Where(x => validResponseIds.Contains(x.ResponseId));

        var questionIds = await validAnswersQuery
            .Select(x => x.QuestionId)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (questionIds.Count == 0) return report;

        // Câu bẫy ép chọn một mức cố định nên điểm của nó vô nghĩa: bỏ hẳn khỏi
        // phân tích theo câu hỏi, không chỉ khỏi phép trung bình.
        var questions = await db.SurveyQuestions.AsNoTracking()
            .Where(x => questionIds.Contains(x.QuestionId) && x.AttentionCheckValue == null)
            .ToListAsync(cancellationToken);
        var scaleByQuestion = await LoadScalesByQuestionAsync(questions, cancellationToken);
        var questionOrders = await QuestionOrdersAsync(questionIds, cancellationToken);

        var textQuestionIds = questions
            .Where(q => scaleByQuestion.TryGetValue(q.QuestionId, out var s) && s?.IsText == true)
            .Select(q => q.QuestionId)
            .ToList();

        var numericQuestionIds = questions
            .Where(q => !textQuestionIds.Contains(q.QuestionId))
            .Select(q => q.QuestionId)
            .ToList();

        // Tổng hợp phân bố điểm trực tiếp trong SQL, không tải toàn bộ câu trả lời thô vào RAM
        var numericAggregates = numericQuestionIds.Count == 0 ? [] : await validAnswersQuery
            .Where(x => numericQuestionIds.Contains(x.QuestionId))
            .GroupBy(x => new { x.QuestionId, x.AnswerValue })
            .Select(g => new { g.Key.QuestionId, g.Key.AnswerValue, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var numericLookup = numericAggregates
            .GroupBy(x => x.QuestionId)
            .ToDictionary(g => g.Key, g => g.Select(x => (x.AnswerValue, x.Count)).ToList());

        var textCounts = textQuestionIds.Count == 0 ? [] : await validAnswersQuery
            .Where(x => textQuestionIds.Contains(x.QuestionId) && x.AnswerValue != null && x.AnswerValue != "")
            .GroupBy(x => x.QuestionId)
            .Select(g => new { QuestionId = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var textCountLookup = textCounts.ToDictionary(x => x.QuestionId, x => x.Count);

        var textSamples = textQuestionIds.Count == 0
            ? []
            : await db.SurveyQuestions.AsNoTracking()
                .Where(q => textQuestionIds.Contains(q.QuestionId))
                .SelectMany(q => validAnswersQuery
                    .Where(x => x.QuestionId == q.QuestionId && x.AnswerValue != null && x.AnswerValue != "")
                    .OrderByDescending(x => x.ResponseId)
                    .Take(MaxTextAnswersPerQuestion)
                    .Select(x => new { q.QuestionId, x.AnswerValue }))
                .ToListAsync(cancellationToken);

        var textSamplesByQuestion = textSamples
            .GroupBy(x => x.QuestionId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.AnswerValue!).ToList());

        var questionRatings = questions
            .Select(q => WithSnapshotScore(
                BuildQuestionRatingFromAggregate(
                    q.QuestionId,
                    questionOrders.GetValueOrDefault(q.QuestionId),
                    q.QuestionText,
                    numericLookup.GetValueOrDefault(q.QuestionId) ?? [],
                    scaleByQuestion.GetValueOrDefault(q.QuestionId),
                    textSamplesByQuestion.GetValueOrDefault(q.QuestionId),
                    textCountLookup.GetValueOrDefault(q.QuestionId)),
                questionSnapshots))
            .ToList();

        // Gắn mục cho từng câu và điểm từng mục, để giao diện tách tab Học phần / Giảng viên.
        var sectionKeys = await QuestionSectionScores.KeysAsync(
            db,
            questionRatings.Select(x => x.QuestionId).ToList(),
            cancellationToken);
        var sectionScores = await QuestionSectionScores.ScoresAsync(db, scoredCssIds, cancellationToken);

        return report with
        {
            QuestionRatings = questionRatings
                .Select(x => x with { SectionKey = sectionKeys.GetValueOrDefault(x.QuestionId) })
                .OrderBy(x => x.QuestionOrder)
                .ToList(),
            SectionScores = sectionScores,
        };
    }

    public async Task<IReadOnlyList<FacultyDepartmentReportDto>> GetFacultyDepartmentReportsAsync(
        int? semesterId,
        CancellationToken cancellationToken = default)
    {
        var faculties = await db.Faculties.AsNoTracking().ToListAsync(cancellationToken);
        var departments = await db.Departments.AsNoTracking().ToListAsync(cancellationToken);
        var lecturers = await db.Lecturers.AsNoTracking().ToListAsync(cancellationToken);

        var sectionQuery = db.CourseSections.AsNoTracking().AsQueryable();
        if (semesterId is { } semId) sectionQuery = sectionQuery.Where(x => x.SemesterId == semId);
        var sections = await sectionQuery.ToListAsync(cancellationToken);

        var sectionSurveys = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => sections.Select(s => s.CourseSectionId).Contains(x.CourseSectionId))
            .ToListAsync(cancellationToken);

        var cssIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();
        
        var responseStats = await ResponseTalliesAsync(cssIds, cancellationToken);
        var departmentsByFacultyId = departments.ToLookup(x => x.FacultyId);
        var lecturersByFacultyId = lecturers.ToLookup(x => x.FacultyId);
        var sectionsByLecturerId = sections
            .Where(x => x.LecturerId.HasValue)
            .ToLookup(x => x.LecturerId!.Value);
        var sectionSurveysBySectionId = sectionSurveys.ToLookup(x => x.CourseSectionId);
        var classSizeBySectionId = sections.ToDictionary(x => x.CourseSectionId, x => x.ClassSize);

        // Lớp chưa qua hai vòng lọc vẫn được đếm vào tiến độ nhưng không góp vào điểm.
        bool CountsTowardScore(int courseSectionId, ResponseTally tally) => tally.IsScored;

        var facultyReports = new List<FacultyDepartmentReportDto>();

        foreach (var fac in faculties)
        {
            var facDepts = departmentsByFacultyId[fac.FacultyId].ToList();
            var facLecturers = lecturersByFacultyId[fac.FacultyId].ToList();
            var facLecturersByDepartmentId = facLecturers.ToLookup(x => x.DepartmentId);
            var facSections = facLecturers
                .SelectMany(lecturer => sectionsByLecturerId[lecturer.LecturerId])
                .ToList();
            var facCss = facSections
                .SelectMany(section => sectionSurveysBySectionId[section.CourseSectionId])
                .ToList();

            // Số lượt nộp đếm hết; điểm chỉ gộp phiếu hợp lệ.
            int facResponses = 0;
            int facValidResponses = 0;
            decimal facValidScoreSum = 0;

            int facScoredResponses = 0;
            foreach (var css in facCss)
            {
                var tally = responseStats.GetValueOrDefault(css.CourseSectionSurveyId, ResponseTally.Empty);
                facResponses += tally.TotalCount;
                facValidResponses += tally.ValidCount;
                if (CountsTowardScore(css.CourseSectionId, tally))
                {
                    facScoredResponses += tally.ValidCount;
                    facValidScoreSum += tally.ValidTotalScore;
                }
            }

            decimal facAvgScore = facScoredResponses > 0
                ? Math.Round(facValidScoreSum / facScoredResponses, 2)
                : 0;

            var deptSummaries = new List<DepartmentSummaryDto>();
            foreach (var dept in facDepts)
            {
                var deptLecs = facLecturersByDepartmentId[dept.DepartmentId].ToList();
                var deptSections = deptLecs
                    .SelectMany(lecturer => sectionsByLecturerId[lecturer.LecturerId])
                    .ToList();
                var deptCss = deptSections
                    .SelectMany(section => sectionSurveysBySectionId[section.CourseSectionId])
                    .ToList();

                int deptResponses = 0;
                int deptScoredResponses = 0;
                decimal deptValidScoreSum = 0;
                foreach (var css in deptCss)
                {
                    var tally = responseStats.GetValueOrDefault(css.CourseSectionSurveyId, ResponseTally.Empty);
                    deptResponses += tally.TotalCount;
                    if (CountsTowardScore(css.CourseSectionId, tally))
                    {
                        deptScoredResponses += tally.ValidCount;
                        deptValidScoreSum += tally.ValidTotalScore;
                    }
                }

                decimal deptAvg = deptScoredResponses > 0
                    ? Math.Round(deptValidScoreSum / deptScoredResponses, 2)
                    : 0;

                deptSummaries.Add(new DepartmentSummaryDto(
                    dept.DepartmentId,
                    dept.DepartmentName,
                    deptLecs.Count,
                    deptSections.Count,
                    deptResponses,
                    deptAvg
                ));
            }

            facultyReports.Add(new FacultyDepartmentReportDto(
                fac.FacultyId,
                fac.FacultyName,
                facDepts.Count,
                facLecturers.Count,
                facSections.Count,
                facResponses,
                facAvgScore,
                deptSummaries
            ));
        }

        return facultyReports;
    }

    public async Task<SurveyQuestionSummaryReportDto?> GetQuestionAnalysisReportAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        var semesterSurvey = await db.SemesterSurveys.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SemesterSurveyId == semesterSurveyId, cancellationToken);
        if (semesterSurvey is null) return null;

        var template = await db.SurveyTemplates.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SurveyTemplateId == semesterSurvey.SurveyTemplateId, cancellationToken);
        if (template is null) return null;

        // Bỏ câu bẫy: điểm của nó vô nghĩa vì mọi người đều bị ép chọn một mức.
        var questions = await QuestionsOfTemplate(template.SurveyTemplateId)
            .AsNoTracking()
            .Where(x => x.AttentionCheckValue == null)
            .OrderBy(x => x.QuestionId)
            .ToListAsync(cancellationToken);
        var questionOrders = await TemplateQuestionOrdersAsync(
            template.SurveyTemplateId,
            cancellationToken);

        var sectionSurveys = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .ToListAsync(cancellationToken);
        var cssIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();

        // Báo cáo chất lượng nên chỉ gộp phiếu qua được những luật lọc nhiễu đang bật.
        var summaryThresholds = await scoringThresholds.GetAsync(cancellationToken);
        var validResponsesQuery = db.SurveyResponses.AsNoTracking()
            .Where(x => cssIds.Contains(x.CourseSectionSurveyId))
            .Where(summaryThresholds.CountsTowardScore());

        var responsesCount = await validResponsesQuery.CountAsync(cancellationToken);
        if (responsesCount == 0)
        {
            return new SurveyQuestionSummaryReportDto(
                semesterSurveyId,
                template.SurveyTemplateId,
                template.TemplateName,
                0,
                0,
                questions
                    .Select(q => new QuestionRatingDto(
                        q.QuestionId,
                        questionOrders.GetValueOrDefault(q.QuestionId),
                        q.QuestionText,
                        0,
                        0,
                        []))
                    .ToList()
            );
        }

        var overallAvgScore = await validResponsesQuery.AverageAsync(x => x.Score, cancellationToken);

        var scaleByQuestion = await LoadScalesByQuestionAsync(questions, cancellationToken);
        var validResponseIds = validResponsesQuery.Select(x => x.ResponseId);
        var validAnswersQuery = db.SurveyResponseAnswers.AsNoTracking()
            .Where(x => validResponseIds.Contains(x.ResponseId));

        var textQuestionIds = questions
            .Where(q => scaleByQuestion.TryGetValue(q.QuestionId, out var s) && s?.IsText == true)
            .Select(q => q.QuestionId)
            .ToList();

        var numericQuestionIds = questions
            .Where(q => !textQuestionIds.Contains(q.QuestionId))
            .Select(q => q.QuestionId)
            .ToList();

        // Tổng hợp phân bố điểm trực tiếp trong SQL, không tải toàn bộ câu trả lời thô vào RAM
        var numericAggregates = numericQuestionIds.Count == 0 ? [] : await validAnswersQuery
            .Where(x => numericQuestionIds.Contains(x.QuestionId))
            .GroupBy(x => new { x.QuestionId, x.AnswerValue })
            .Select(g => new { g.Key.QuestionId, g.Key.AnswerValue, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var numericLookup = numericAggregates
            .GroupBy(x => x.QuestionId)
            .ToDictionary(g => g.Key, g => g.Select(x => (x.AnswerValue, x.Count)).ToList());

        var textCounts = textQuestionIds.Count == 0 ? [] : await validAnswersQuery
            .Where(x => textQuestionIds.Contains(x.QuestionId) && x.AnswerValue != null && x.AnswerValue != "")
            .GroupBy(x => x.QuestionId)
            .Select(g => new { QuestionId = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var textCountLookup = textCounts.ToDictionary(x => x.QuestionId, x => x.Count);

        var textSamples = textQuestionIds.Count == 0
            ? []
            : await db.SurveyQuestions.AsNoTracking()
                .Where(q => textQuestionIds.Contains(q.QuestionId))
                .SelectMany(q => validAnswersQuery
                    .Where(x => x.QuestionId == q.QuestionId && x.AnswerValue != null && x.AnswerValue != "")
                    .OrderByDescending(x => x.ResponseId)
                    .Take(MaxTextAnswersPerQuestion)
                    .Select(x => new { q.QuestionId, x.AnswerValue }))
                .ToListAsync(cancellationToken);

        var textSamplesByQuestion = textSamples
            .GroupBy(x => x.QuestionId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.AnswerValue!).ToList());

        var questionRatings = questions
            .Select(q => BuildQuestionRatingFromAggregate(
                q.QuestionId,
                questionOrders.GetValueOrDefault(q.QuestionId),
                q.QuestionText,
                numericLookup.GetValueOrDefault(q.QuestionId) ?? [],
                scaleByQuestion.GetValueOrDefault(q.QuestionId),
                textSamplesByQuestion.GetValueOrDefault(q.QuestionId),
                textCountLookup.GetValueOrDefault(q.QuestionId)))
            .ToList();

        return new SurveyQuestionSummaryReportDto(
            semesterSurveyId,
            template.SurveyTemplateId,
            template.TemplateName,
            responsesCount,
            Math.Round(overallAvgScore, 2),
            questionRatings
        );
    }

    public async Task<SectionSurveyAnalysisDto?> GetSectionSurveyAnalysisAsync(
        int courseSectionSurveyId,
        CancellationToken cancellationToken = default)
    {
        var sectionSurvey = await db.CourseSectionSurveys.AsNoTracking()
            .FirstOrDefaultAsync(x => x.CourseSectionSurveyId == courseSectionSurveyId, cancellationToken);
        if (sectionSurvey is null) return null;

        var semesterSurvey = await db.SemesterSurveys.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SemesterSurveyId == sectionSurvey.SemesterSurveyId, cancellationToken);
        var template = semesterSurvey is null
            ? null
            : await db.SurveyTemplates.AsNoTracking()
                .FirstOrDefaultAsync(x => x.SurveyTemplateId == semesterSurvey.SurveyTemplateId, cancellationToken);

        var questions = template is null
            ? []
            // Bỏ câu bẫy khỏi phân tích theo câu hỏi.
            : await QuestionsOfTemplate(template.SurveyTemplateId)
                .AsNoTracking()
                .Where(x => x.AttentionCheckValue == null)
                .OrderBy(x => x.QuestionId)
                .ToListAsync(cancellationToken);

        var section = await db.CourseSections.AsNoTracking()
            .FirstOrDefaultAsync(x => x.CourseSectionId == sectionSurvey.CourseSectionId, cancellationToken);
        var course = section is null
            ? null
            : await db.Courses.AsNoTracking()
                .FirstOrDefaultAsync(x => x.CourseId == section.CourseId, cancellationToken);
        var lecturer = section is null
            ? null
            : await db.Lecturers.AsNoTracking()
                .FirstOrDefaultAsync(x => x.LecturerId == section.LecturerId, cancellationToken);

        // Phân tích theo câu hỏi là số liệu chất lượng nên chỉ gộp phiếu qua được
        // những luật lọc nhiễu đang bật.
        var sectionThresholds = await scoringThresholds.GetAsync(cancellationToken);
        var responseIds = await db.SurveyResponses.AsNoTracking()
            .Where(x => x.CourseSectionSurveyId == courseSectionSurveyId)
            .Where(sectionThresholds.CountsTowardScore())
            .Select(x => x.ResponseId)
            .ToListAsync(cancellationToken);

        var questionOrders = template is null
            ? []
            : await TemplateQuestionOrdersAsync(template.SurveyTemplateId, cancellationToken);

        var questionRatings = new List<QuestionRatingDto>();

        if (responseIds.Count > 0 && questions.Count > 0)
        {
            var answers = await db.SurveyResponseAnswers.AsNoTracking()
                .Where(x => responseIds.Contains(x.ResponseId))
                .ToListAsync(cancellationToken);
            var scaleByQuestion = await LoadScalesByQuestionAsync(questions, cancellationToken);
            var answersByQuestionId = answers.ToLookup(x => x.QuestionId);

            questionRatings.AddRange(questions.Select(q => BuildQuestionRating(
                q.QuestionId,
                questionOrders.GetValueOrDefault(q.QuestionId),
                q.QuestionText,
                answersByQuestionId[q.QuestionId].ToList(),
                scaleByQuestion.GetValueOrDefault(q.QuestionId))));
        }
        else
        {
            questionRatings.AddRange(questions.Select(q => new QuestionRatingDto(
                q.QuestionId,
                questionOrders.GetValueOrDefault(q.QuestionId),
                q.QuestionText,
                0,
                0,
                [])));
        }

        // Điểm của lớp phải là con số đã chốt ở lần bấm "Tính lại điểm", đúng bằng
        // thứ trang Bảng dữ liệu khảo sát đang hiện. Trước đây chỗ này tự tính lại
        // từ bảng phiếu, nên một lớp CHƯA đủ điều kiện vẫn ra một con số điểm dù
        // Bảng dữ liệu khảo sát để trống, và phiếu nộp thêm sau lần chốt cũng làm
        // hai màn hình lệch nhau.
        bool isScored = sectionSurvey.AverageScore is not null;

        // Lớp chưa chốt điểm thì không dựng ra bất kỳ con số phân tích nào, đúng như
        // ô điểm bỏ trống ở trang Bảng dữ liệu khảo sát.
        if (!isScored)
        {
            return new SectionSurveyAnalysisDto(
                courseSectionSurveyId,
                course?.CourseCode ?? string.Empty,
                course?.CourseName ?? string.Empty,
                section?.SectionName ?? string.Empty,
                LecturerNameOf(lecturer, section),
                section?.ClassSize ?? 0,
                0,
                0m,
                template?.TemplateName ?? string.Empty,
                [],
                false);
        }

        var questionSnapshots = await QuestionScoreSnapshotsAsync(
            [courseSectionSurveyId],
            cancellationToken);

        // Gắn mục cho từng câu và điểm từng mục, để giao diện tách tab Học phần / Giảng viên.
        var sectionKeys = await QuestionSectionScores.KeysAsync(
            db,
            questionRatings.Select(x => x.QuestionId).ToList(),
            cancellationToken);
        questionRatings = questionRatings
            .Select(rating => WithSnapshotScore(rating, questionSnapshots) with
            {
                SectionKey = sectionKeys.GetValueOrDefault(rating.QuestionId),
            })
            .ToList();
        var sectionScores = await QuestionSectionScores.ScoresAsync(
            db,
            [courseSectionSurveyId],
            cancellationToken);

        return new SectionSurveyAnalysisDto(
            courseSectionSurveyId,
            course?.CourseCode ?? string.Empty,
            course?.CourseName ?? string.Empty,
            section?.SectionName ?? string.Empty,
            LecturerNameOf(lecturer, section),
            section?.ClassSize ?? 0,
            sectionSurvey.ValidResponseCount,
            sectionSurvey.AverageScore!.Value,
            template?.TemplateName ?? string.Empty,
            questionRatings,
            true,
            sectionScores
        );
    }

    public async Task<IReadOnlyList<SurveyResultDetailDto>> GetSurveyResultsAsync(
        int? semesterId,
        int? facultyId,
        int? departmentId,
        int? lecturerId,
        int? semesterSurveyId,
        string? search,
        CancellationToken cancellationToken = default)
    {
        var sectionSurveyQuery = db.CourseSectionSurveys.AsNoTracking().AsQueryable();

        if (semesterSurveyId is { } ssId)
        {
            sectionSurveyQuery = sectionSurveyQuery.Where(x => x.SemesterSurveyId == ssId);
        }
        else if (semesterId is { } semId)
        {
            var allowed = await db.SemesterSurveys.AsNoTracking()
                .Where(x => x.SemesterId == semId)
                .Select(x => x.SemesterSurveyId)
                .ToListAsync(cancellationToken);
            sectionSurveyQuery = sectionSurveyQuery.Where(x => allowed.Contains(x.SemesterSurveyId));
        }

        var sectionSurveys = await sectionSurveyQuery.ToListAsync(cancellationToken);
        if (sectionSurveys.Count == 0) return [];

        var semesterSurveyIds = sectionSurveys.Select(x => x.SemesterSurveyId).Distinct().ToList();
        var semesterSurveys = await db.SemesterSurveys.AsNoTracking()
            .Where(x => semesterSurveyIds.Contains(x.SemesterSurveyId))
            .ToDictionaryAsync(x => x.SemesterSurveyId, x => x, cancellationToken);
        var templateIds = semesterSurveys.Values.Select(x => x.SurveyTemplateId).Distinct().ToList();
        var templates = await db.SurveyTemplates.AsNoTracking()
            .Where(x => templateIds.Contains(x.SurveyTemplateId))
            .ToDictionaryAsync(x => x.SurveyTemplateId, x => x.TemplateName, cancellationToken);

        var sectionIds = sectionSurveys.Select(x => x.CourseSectionId).Distinct().ToList();
        var sections = await db.CourseSections.AsNoTracking()
            .Where(x => sectionIds.Contains(x.CourseSectionId))
            .ToListAsync(cancellationToken);

        var courseIds = sections.Select(x => x.CourseId).Distinct().ToList();
        var courses = await db.Courses.AsNoTracking()
            .Where(x => courseIds.Contains(x.CourseId))
            .ToDictionaryAsync(x => x.CourseId, x => x, cancellationToken);

        var lecturerIds = sections.Select(x => x.LecturerId).Distinct().ToList();
        var lecturers = await db.Lecturers.AsNoTracking()
            .Where(x => lecturerIds.Contains(x.LecturerId))
            .ToListAsync(cancellationToken);
        var sectionById = sections.ToDictionary(x => x.CourseSectionId);
        var lecturerById = lecturers.ToDictionary(x => x.LecturerId);

        var deptIds = lecturers.Where(x => x.DepartmentId.HasValue).Select(x => x.DepartmentId!.Value)
            .Concat(courses.Values.Where(x => x.DepartmentId.HasValue).Select(x => x.DepartmentId!.Value))
            .Distinct()
            .ToList();
        var departments = deptIds.Count == 0
            ? new Dictionary<int, Department>()
            : await db.Departments.AsNoTracking()
                .Where(x => deptIds.Contains(x.DepartmentId))
                .ToDictionaryAsync(x => x.DepartmentId, x => x, cancellationToken);
        var facIds = lecturers.Where(x => x.FacultyId.HasValue).Select(x => x.FacultyId!.Value)
            .Concat(courses.Values.Where(x => x.FacultyId.HasValue).Select(x => x.FacultyId!.Value))
            .Concat(departments.Values.Where(x => x.FacultyId.HasValue).Select(x => x.FacultyId!.Value))
            .Distinct()
            .ToList();
        var faculties = facIds.Count == 0
            ? new Dictionary<int, string>()
            : await db.Faculties.AsNoTracking()
                .Where(x => facIds.Contains(x.FacultyId))
                .ToDictionaryAsync(x => x.FacultyId, x => x.FacultyName, cancellationToken);

        var cssIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();
        var responseStats = await ResponseTalliesAsync(cssIds, cancellationToken);

        var term = search?.Trim().ToLowerInvariant();
        var results = new List<SurveyResultDetailDto>();

        foreach (var css in sectionSurveys)
        {
            var semesterSurvey = semesterSurveys.TryGetValue(css.SemesterSurveyId, out var ss) ? ss : null;
            var templateName = semesterSurvey != null && templates.TryGetValue(semesterSurvey.SurveyTemplateId, out var tn)
                ? tn
                : string.Empty;
            var sec = sectionById.GetValueOrDefault(css.CourseSectionId);
            var crs = sec != null && courses.TryGetValue(sec.CourseId, out var c) ? c : null;
            var lec = sec?.LecturerId is { } sectionLecturerId
                ? lecturerById.GetValueOrDefault(sectionLecturerId)
                : null;
            int? reportDepartmentId = crs?.DepartmentId ?? lec?.DepartmentId;
            int? reportFacultyId = crs?.FacultyId;
            if (reportFacultyId is null
                && reportDepartmentId is { } owningDepartmentId
                && departments.TryGetValue(owningDepartmentId, out var owningDepartment))
            {
                reportFacultyId = owningDepartment.FacultyId;
            }
            reportFacultyId ??= lec?.FacultyId;

            if (facultyId is { } fId && reportFacultyId != fId) continue;
            if (departmentId is { } dId && reportDepartmentId != dId) continue;
            if (lecturerId is { } lId && lec?.LecturerId != lId) continue;

            var courseCode = crs?.CourseCode ?? string.Empty;
            var courseName = crs?.CourseName ?? string.Empty;
            var sectionName = sec?.SectionName ?? string.Empty;
            var lecturerName = LecturerNameOf(lec, sec);

            if (!string.IsNullOrEmpty(term)
                && !courseCode.ToLowerInvariant().Contains(term)
                && !courseName.ToLowerInvariant().Contains(term)
                && !sectionName.ToLowerInvariant().Contains(term)
                && !lecturerName.ToLowerInvariant().Contains(term)
                && !templateName.ToLowerInvariant().Contains(term))
            {
                continue;
            }

            var tally = responseStats.GetValueOrDefault(css.CourseSectionSurveyId, ResponseTally.Empty);
            var cnt = tally.TotalCount;

            int classSize = sec?.ClassSize ?? 0;
            // Bảng tra cứu chi tiết đọc theo phiếu hợp lệ: phiếu bị lọc vẫn là một
            // lượt nộp nhưng không dùng được vào kết quả nào.
            decimal completionRate = classSize > 0
                ? Math.Round((decimal)tally.ValidCount / classSize * 100, 1)
                : 0;
            // Lớp chưa thu đủ phiếu thì không có điểm để đọc: trả 0 và bảng hiện
            // gạch ngang. Điểm của lớp hai người đánh giá đặt cạnh lớp ba mươi
            // người trong cùng một bảng xếp hạng là so hai thứ không so được.
            decimal averageScore = tally.IsScored ? tally.AverageScore : 0m;

            results.Add(new SurveyResultDetailDto(
                css.CourseSectionSurveyId,
                css.SemesterSurveyId,
                templateName,
                lec?.LecturerId ?? 0,
                lecturerName,
                reportDepartmentId ?? 0,
                reportDepartmentId is { } dd && departments.TryGetValue(dd, out var department)
                    ? department.DepartmentName
                    : "Chưa thuộc bộ môn",
                reportFacultyId ?? 0,
                reportFacultyId is { } ff && faculties.TryGetValue(ff, out var fn) ? fn : "Chưa thuộc khoa",
                courseCode,
                courseName,
                sectionName,
                classSize,
                cnt,
                tally.ValidCount,
                cnt - tally.ValidCount,
                completionRate,
                averageScore,
                UnidentifiedLecturerName: lec is null
                    && sec?.UnidentifiedLecturerName?.Trim() is { Length: > 0 } unidentifiedName
                        ? unidentifiedName
                        : null));
        }

        return results
            .OrderBy(x => x.FacultyName)
            .ThenBy(x => x.DepartmentName)
            .ThenBy(x => x.CourseCode)
            .ThenBy(x => x.SectionName)
            .ToList();
    }

    // -----------------------------------------------------------------------
    // BẢNG TỔNG QUAN TOÀN TRƯỜNG (EXECUTIVE SURVEY DASHBOARD)
    // -----------------------------------------------------------------------

    public async Task<IReadOnlyList<SchoolOverviewComparisonOptionDto>> GetSchoolOverviewComparisonOptionsAsync(
        CancellationToken cancellationToken = default) =>
        await (from survey in db.SemesterSurveys.AsNoTracking()
               join semester in db.Semesters.AsNoTracking()
                   on survey.SemesterId equals semester.SemesterId
               join year in db.AcademicYears.AsNoTracking()
                   on semester.AcademicYearId equals year.AcademicYearId
               join template in db.SurveyTemplates.AsNoTracking()
                   on survey.SurveyTemplateId equals template.SurveyTemplateId
               orderby survey.SemesterSurveyId descending
               select new SchoolOverviewComparisonOptionDto(
                   survey.SemesterSurveyId,
                   survey.SurveyName,
                   semester.SemesterId,
                   semester.SemesterName,
                   year.AcademicYearName,
                   template.SurveyTemplateId,
                   template.TemplateName,
                   survey.CreatedAt))
            .ToListAsync(cancellationToken);

    /// <summary>Bảng tổng quan toàn trường theo học kỳ, có cache TTL ngắn.</summary>
    public async Task<SchoolSurveyOverviewDto?> GetSchoolSurveyOverviewAsync(
        int semesterId,
        int? comparisonSemesterId = null,
        int? semesterSurveyId = null,
        int? comparisonSemesterSurveyId = null,
        CancellationToken cancellationToken = default)
    {
        // Số phiên bản nằm ngay đầu khoá: huỷ phiếu của một lớp là tăng số đó, mọi
        // khoá cũ lập tức thành không ai hỏi tới, khỏi phải dò xoá từng khoá.
        string cacheKey = $"{SchoolOverviewCachePrefix}v{cacheVersion.Current}:{semesterId}"
            + $":survey:{semesterSurveyId?.ToString() ?? "all"}"
            + $":compare-semester:{comparisonSemesterId?.ToString() ?? "auto"}"
            + $":compare-survey:{comparisonSemesterSurveyId?.ToString() ?? "auto"}";
        if (cache.TryGetValue(cacheKey, out SchoolSurveyOverviewDto? cached) && cached is not null)
        {
            return cached;
        }

        var overview = await BuildSchoolSurveyOverviewAsync(
            semesterId,
            comparisonSemesterId,
            semesterSurveyId,
            comparisonSemesterSurveyId,
            cancellationToken);
        if (overview is not null)
        {
            cache.Set(cacheKey, overview, SchoolOverviewCacheTtl);
        }

        return overview;
    }

    private async Task<SchoolSurveyOverviewDto?> BuildSchoolSurveyOverviewAsync(
        int semesterId,
        int? comparisonSemesterId,
        int? semesterSurveyId,
        int? comparisonSemesterSurveyId,
        CancellationToken cancellationToken)
    {
        var semester = await db.Semesters
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.SemesterId == semesterId, cancellationToken);
        if (semester is null) return null;

        var academicYear = await db.AcademicYears
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.AcademicYearId == semester.AcademicYearId, cancellationToken);

        var semesterSurveyIds = await SemesterSurveyIdsAsync(semesterId, semesterSurveyId, cancellationToken);

        // Kỳ chưa phát đợt khảo sát nào → trả bảng tổng quan rỗng để UI dựng được khung.
        if (semesterSurveyIds.Count == 0)
        {
            return new SchoolSurveyOverviewDto(
                semester.SemesterId,
                semester.SemesterName,
                academicYear?.AcademicYearName ?? string.Empty,
                0, 0, 0, 0m, 0, 0, 0, 0m, 0, 0, [], 0m, [], [], [], null);
        }

        var sectionSurveys = await db.CourseSectionSurveys
            .AsNoTracking()
            .Where(x => semesterSurveyIds.Contains(x.SemesterSurveyId))
            .ToListAsync(cancellationToken);

        var cssIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();
        var sectionIds = sectionSurveys.Select(x => x.CourseSectionId).Distinct().ToList();

        var sections = await db.CourseSections
            .AsNoTracking()
            .Where(x => sectionIds.Contains(x.CourseSectionId))
            .ToListAsync(cancellationToken);

        var courseIds = sections.Select(x => x.CourseId).Distinct().ToList();
        Dictionary<int, Course> courses = courseIds.Count == 0
            ? []
            : await db.Courses.AsNoTracking()
                .Where(x => courseIds.Contains(x.CourseId))
                .ToDictionaryAsync(x => x.CourseId, x => x, cancellationToken);

        var lecturerIds = sections.Select(x => x.LecturerId).Distinct().ToList();
        List<Lecturer> lecturers = lecturerIds.Count == 0
            ? []
            : await db.Lecturers.AsNoTracking()
                .Where(x => lecturerIds.Contains(x.LecturerId))
                .ToListAsync(cancellationToken);
        var sectionById = sections.ToDictionary(x => x.CourseSectionId);
        var lecturerById = lecturers.ToDictionary(x => x.LecturerId);

        var deptIds = lecturers.Where(x => x.DepartmentId.HasValue).Select(x => x.DepartmentId!.Value)
            .Concat(courses.Values.Where(x => x.DepartmentId.HasValue).Select(x => x.DepartmentId!.Value))
            .Distinct()
            .ToList();
        Dictionary<int, Department> departments = deptIds.Count == 0
            ? []
            : await db.Departments.AsNoTracking()
                .Where(x => deptIds.Contains(x.DepartmentId))
                .ToDictionaryAsync(x => x.DepartmentId, x => x, cancellationToken);

        var facultyIds = lecturers.Where(x => x.FacultyId.HasValue).Select(x => x.FacultyId!.Value)
            .Concat(courses.Values.Where(x => x.FacultyId.HasValue).Select(x => x.FacultyId!.Value))
            .Concat(departments.Values.Where(x => x.FacultyId.HasValue).Select(x => x.FacultyId!.Value))
            .Distinct()
            .ToList();
        Dictionary<int, Faculty> faculties = facultyIds.Count == 0
            ? []
            : await db.Faculties.AsNoTracking()
                .Where(x => facultyIds.Contains(x.FacultyId))
                .ToDictionaryAsync(x => x.FacultyId, x => x, cancellationToken);

        // Gộp phiếu theo lớp (1 query duy nhất).
        var responseStats = await ResponseTalliesAsync(cssIds, cancellationToken);

        // Phân bố điểm theo nhóm (band 2..5) gộp ngay trong SQL.
        // Là số liệu chất lượng nên chỉ gộp phiếu qua được những luật lọc nhiễu đang bật.
        var bandThresholds = await scoringThresholds.GetAsync(cancellationToken);
        var bandCounts = cssIds.Count == 0
            ? new List<BandCount>()
            : (await db.SurveyResponses.AsNoTracking()
                .Where(x => cssIds.Contains(x.CourseSectionSurveyId))
                .Where(bandThresholds.CountsTowardScore())
                .Select(x => new
                {
                    Band = x.Score >= 4.5m ? 5 : x.Score >= 4.0m ? 4 : x.Score >= 3.0m ? 3 : 2
                })
                .GroupBy(x => x.Band)
                .Select(g => new { g.Key, Count = g.Count() })
                .ToListAsync(cancellationToken))
                .Select(x => new BandCount(x.Key, x.Count))
                .ToList();

        // Duyệt từng lớp để gộp theo Khoa / Bộ môn và phân loại trạng thái thu phiếu.
        var facultyStats = new Dictionary<int, (int SectionCount, int Target, int Responses, int ScoredResponses, decimal ScoreSum)>();
        var deptStats = new Dictionary<int, (int SectionCount, int Target, int Responses, int ScoredResponses, decimal ScoreSum)>();
        int completedCount = 0;
        int inProgressCount = 0;
        int laggingCount = 0;

        // Mẫu số/tử số của điểm trung bình TOÀN TRƯỜNG. Cộng trực tiếp ở đây thay vì
        // suy ngược từ facultyStats/deptStats, vì lớp chưa ánh xạ được khoa/bộ môn nào
        // vẫn phải góp vào mặt bằng chung — cùng lý do totalTarget/totalResponses bên
        // dưới cũng cộng trực tiếp từ sectionSurveys.
        int schoolScoredResponses = 0;
        int schoolScoredSectionCount = 0;
        decimal schoolScoredScoreSum = 0;

        foreach (var ss in sectionSurveys)
        {
            var sec = sectionById.GetValueOrDefault(ss.CourseSectionId);
            var lec = sec?.LecturerId is { } sectionLecturerId
                ? lecturerById.GetValueOrDefault(sectionLecturerId)
                : null;
            var course = sec is not null && courses.TryGetValue(sec.CourseId, out var matchedCourse)
                ? matchedCourse
                : null;
            int? reportDepartmentId = course?.DepartmentId ?? lec?.DepartmentId;
            int? reportFacultyId = course?.FacultyId;
            if (reportFacultyId is null
                && reportDepartmentId is { } owningDepartmentId
                && departments.TryGetValue(owningDepartmentId, out var owningDepartment))
            {
                reportFacultyId = owningDepartment.FacultyId;
            }
            reportFacultyId ??= lec?.FacultyId;
            var tally = responseStats.GetValueOrDefault(ss.CourseSectionSurveyId, ResponseTally.Empty);
            var cnt = tally.ValidCount;
            int classSize = sec?.ClassSize ?? 0;
            // Tiến độ tính trên phiếu hợp lệ: phiếu bị bộ lọc nhiễu loại vẫn là một
            // lượt nộp nhưng không dùng được vào kết quả nào.
            decimal rate = classSize > 0 ? Math.Round((decimal)cnt / classSize * 100, 2) : 0;

            if (rate >= ReportThresholds.CompletedCompletionRate) completedCount++;
            else if (rate >= ReportThresholds.LaggingCompletionRate) inProgressCount++;
            else laggingCount++;

            // Lớp chưa thu đủ phiếu vẫn được đếm vào tiến độ (Target, Responses) —
            // đó chính là những lớp cần nhắc. Nhưng không góp vào điểm: mẫu số của
            // điểm chỉ cộng phiếu của lớp đã đủ.
            var scored = tally.IsScored;
            if (scored)
            {
                schoolScoredSectionCount++;
                schoolScoredResponses += tally.SnapshotValidCount;
                schoolScoredScoreSum += tally.ValidTotalScore;
            }

            if (reportFacultyId is { } fId)
            {
                var f = facultyStats.TryGetValue(fId, out var fs) ? fs : (SectionCount: 0, Target: 0, Responses: 0, ScoredResponses: 0, ScoreSum: 0m);
                f.SectionCount++;
                f.Target += classSize;
                f.Responses += cnt;
                if (scored)
                {
                    f.ScoredResponses += tally.SnapshotValidCount;
                    f.ScoreSum += tally.ValidTotalScore;
                }
                facultyStats[fId] = f;
            }

            if (reportDepartmentId is { } dId)
            {
                var d = deptStats.TryGetValue(dId, out var ds) ? ds : (SectionCount: 0, Target: 0, Responses: 0, ScoredResponses: 0, ScoreSum: 0m);
                d.SectionCount++;
                d.Target += classSize;
                d.Responses += cnt;
                if (scored)
                {
                    d.ScoredResponses += tally.SnapshotValidCount;
                    d.ScoreSum += tally.ValidTotalScore;
                }
                deptStats[dId] = d;
            }
        }

        // Danh sách Khoa cho biểu đồ xếp hạng.
        var facultyList = new List<FacultyOverviewDto>();
        foreach (var (fId, stats) in facultyStats)
        {
            var fac = faculties.TryGetValue(fId, out var f) ? f : null;
            int deptCount = departments.Values.Count(d => d.FacultyId == fId);
            int responses = stats.Responses;
            decimal avg = stats.ScoredResponses > 0
                ? Math.Round(stats.ScoreSum / stats.ScoredResponses, 2)
                : 0;
            decimal completion = stats.Target > 0 ? Math.Round((decimal)responses / stats.Target * 100, 2) : 0;
            facultyList.Add(new FacultyOverviewDto(
                fId,
                fac?.FacultyName ?? "Chưa thuộc khoa",
                deptCount,
                stats.SectionCount,
                stats.Target,
                responses,
                completion,
                avg));
        }

        // Danh sách Bộ môn cho bảng "chậm tiến độ nhất".
        var deptList = new List<DepartmentOverviewDto>();
        foreach (var (dId, stats) in deptStats)
        {
            var dept = departments.TryGetValue(dId, out var d) ? d : null;
            string facName = dept?.FacultyId is { } dfId && faculties.TryGetValue(dfId, out var ff)
                ? ff.FacultyName
                : "Chưa thuộc khoa";
            int responses = stats.Responses;
            decimal avg = stats.ScoredResponses > 0
                ? Math.Round(stats.ScoreSum / stats.ScoredResponses, 2)
                : 0;
            decimal completion = stats.Target > 0 ? Math.Round((decimal)responses / stats.Target * 100, 2) : 0;
            deptList.Add(new DepartmentOverviewDto(
                dId,
                dept?.DepartmentName ?? "Chưa thuộc bộ môn",
                dept?.FacultyId ?? 0,
                facName,
                stats.SectionCount,
                stats.Target,
                responses,
                completion,
                avg));
        }

        // Tổng hợp trực tiếp từ toàn bộ bài khảo sát lớp. Không cộng ngược từ Khoa vì các lớp
        // chưa ánh xạ đơn vị vẫn phải nằm trong mẫu số của tiến độ toàn trường.
        int totalTarget = sectionSurveys.Sum(x =>
            sectionById.TryGetValue(x.CourseSectionId, out var section) ? section.ClassSize : 0);
        // Tiến độ (mẫu số ở đây) đếm MỌI lớp, kể cả lớp chưa đủ ngưỡng — đó chính là
        // những lớp cần nhắc thu thêm phiếu.
        int totalResponses = sectionSurveys.Sum(x =>
            responseStats.GetValueOrDefault(x.CourseSectionSurveyId, ResponseTally.Empty).ValidCount);
        // Phiếu ĐÃ THU đếm cả phiếu bị lọc nhiễu — đó là tiến độ, khác hẳn phiếu hợp lệ.
        int totalSubmittedResponses = sectionSurveys.Sum(x =>
            responseStats.GetValueOrDefault(x.CourseSectionSurveyId, ResponseTally.Empty).TotalCount);
        decimal overallCompletion = totalTarget > 0 ? Math.Round((decimal)totalResponses / totalTarget * 100, 2) : 0;
        // Điểm thì ngược lại: chỉ gộp lớp đã thu đủ phiếu (schoolScoredResponses ở
        // vòng lặp trên), cùng ngưỡng và cùng công thức với facultyStats/deptStats —
        // trước đây chỗ này cộng thẳng từ mọi lớp nên lớp hai người đánh giá vẫn lọt
        // vào mặt bằng chung, kéo lệch con số so với chính bảng xếp hạng khoa ngay
        // bên trên nó.
        decimal overallAvg = schoolScoredResponses > 0
            ? Math.Round(schoolScoredScoreSum / schoolScoredResponses, 2)
            : 0;

        var scoreDistribution = new List<ScoreBandDto>();
        var bandCountByBand = bandCounts.ToDictionary(x => x.Band, x => x.Count);
        int bandTotal = bandCounts.Sum(x => x.Count);
        foreach (var band in new[] { 5, 4, 3, 2 })
        {
            int count = bandCountByBand.GetValueOrDefault(band);
            decimal pct = bandTotal > 0 ? Math.Round((decimal)count / bandTotal * 100, 1) : 0;
            scoreDistribution.Add(new ScoreBandDto(band, ScoreBandLabel(band), count, pct));
        }

        // Tiêu chí yếu nhất toàn trường.
        var weakestQuestions = await BuildQuestionRankingAsync(
            cssIds,
            WeakQuestionCount,
            lowestFirst: true,
            cancellationToken);

        // Khi khoanh vào một bài khảo sát thì kỳ đối chiếu cũng phải khoanh theo
        // đúng bộ câu hỏi đó, nếu không là đem một bài so với cả kỳ.
        int? comparisonTemplateId = semesterSurveyId is { } scopedSurveyId
            ? await db.SemesterSurveys.AsNoTracking()
                .Where(x => x.SemesterSurveyId == scopedSurveyId)
                .Select(x => (int?)x.SurveyTemplateId)
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        // Xu hướng so với học kỳ được chọn; nếu không chọn thì dùng học kỳ liền trước.
        var semesterComparison = await GetSemesterComparisonAsync(
            semesterId,
            comparisonSemesterId,
            semesterSurveyId,
            comparisonSemesterSurveyId,
            comparisonTemplateId,
            totalResponses,
            totalTarget,
            overallAvg,
            cancellationToken);

        return new SchoolSurveyOverviewDto(
            semester.SemesterId,
            semester.SemesterName,
            academicYear?.AcademicYearName ?? string.Empty,
            sectionSurveys.Count,
            totalTarget,
            totalResponses,
            overallCompletion,
            completedCount,
            inProgressCount,
            laggingCount,
            overallAvg,
            schoolScoredSectionCount,
            schoolScoredResponses,
            scoreDistribution,
            overallAvg,
            facultyList.OrderByDescending(x => x.AverageScore).ToList(),
            deptList.OrderBy(x => x.CompletionRate).ThenBy(x => x.DepartmentName).ToList(),
            weakestQuestions,
            semesterComparison,
            totalSubmittedResponses,
            totalTarget > 0
                ? Math.Round((decimal)totalSubmittedResponses / totalTarget * 100, 1)
                : 0m);
    }

    /// <summary>Danh sách bài khảo sát của kỳ, thu hẹp còn một bài khi người dùng chọn.</summary>
    private async Task<List<int>> SemesterSurveyIdsAsync(
        int semesterId,
        int? semesterSurveyId,
        CancellationToken cancellationToken) =>
        await db.SemesterSurveys
            .AsNoTracking()
            .Where(x => x.SemesterId == semesterId
                        && (semesterSurveyId == null || x.SemesterSurveyId == semesterSurveyId))
            .Select(x => x.SemesterSurveyId)
            .ToListAsync(cancellationToken);

    /// <summary>Xếp hạng tiêu chí theo điểm trung bình cho một học kỳ / bài khảo sát.</summary>
    public async Task<IReadOnlyList<QuestionRatingDto>> GetQuestionRankingAsync(
        int semesterId,
        int? semesterSurveyId,
        int count,
        bool lowestFirst,
        CancellationToken cancellationToken = default)
    {
        var semesterSurveyIds = await SemesterSurveyIdsAsync(semesterId, semesterSurveyId, cancellationToken);
        if (semesterSurveyIds.Count == 0) return [];

        var cssIds = await db.CourseSectionSurveys
            .AsNoTracking()
            .Where(x => semesterSurveyIds.Contains(x.SemesterSurveyId))
            .Select(x => x.CourseSectionSurveyId)
            .ToListAsync(cancellationToken);

        return await BuildQuestionRankingAsync(cssIds, count, lowestFirst, cancellationToken);
    }

    /// <summary>Gộp các câu hỏi ở hai đầu bảng điểm theo số lượt trả lời của kỳ.</summary>
    private async Task<IReadOnlyList<QuestionRatingDto>> BuildQuestionRankingAsync(
        List<int> cssIds,
        int count,
        bool lowestFirst,
        CancellationToken cancellationToken)
    {
        if (cssIds.Count == 0) return [];

        int take = Math.Clamp(count, 1, MaxQuestionRankingCount);

        // Bảng xếp hạng phải đứng trên đúng tập lớp đã dùng để tính điểm trung bình
        // toàn trường: lớp đã chốt điểm ở lần bấm "Tính lại điểm" gần nhất. Trước đây
        // phần đếm phiếu bên dưới quét mọi lớp trong phạm vi, nên cột "Phiếu hợp lệ"
        // gộp cả lớp chưa đủ điều kiện và lệch hẳn so với dải chỉ số ngay phía trên.
        var scoredIds = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => cssIds.Contains(x.CourseSectionSurveyId) && x.AverageScore != null)
            .Select(x => x.CourseSectionSurveyId)
            .ToListAsync(cancellationToken);

        if (scoredIds.Count == 0) return [];

        // Xếp hạng trước trên bảng điểm đã gộp theo lớp. Nhờ vậy truy vấn raw answers
        // bên dưới chỉ đụng tới đúng các câu sẽ hiển thị, thay vì quét mọi câu của kỳ.
        var ranked = db.CourseSectionSurveyQuestionScores.AsNoTracking()
            .Where(x => scoredIds.Contains(x.CourseSectionSurveyId))
            .GroupBy(x => x.QuestionId)
            .Select(group => new
            {
                QuestionId = group.Key,
                TotalAnswers = group.Sum(x => x.AnswerCount),
                WeightedScore = group.Sum(x => (double)x.AverageScore * x.AnswerCount)
            })
            .Where(x => x.TotalAnswers >= WeakQuestionMinAnswers);

        var candidates = await (lowestFirst
                ? ranked.OrderBy(x => x.WeightedScore / x.TotalAnswers)
                : ranked.OrderByDescending(x => x.WeightedScore / x.TotalAnswers))
            .ThenByDescending(x => x.TotalAnswers)
            .Take(take)
            .ToListAsync(cancellationToken);

        if (candidates.Count == 0) return [];

        var candidateQuestionIds = candidates.Select(x => x.QuestionId).ToList();

        // Phân bố lựa chọn vẫn cần dữ liệu gốc, nhưng chỉ cho tối đa WeakQuestionCount câu.
        // Chỉ gộp phiếu qua được những luật lọc nhiễu đang bật.
        var weakThresholds = await scoringThresholds.GetAsync(cancellationToken);
        var countedResponseIds = db.SurveyResponses.AsNoTracking()
            .Where(r => scoredIds.Contains(r.CourseSectionSurveyId))
            .Where(weakThresholds.CountsTowardScore())
            .Select(r => r.ResponseId);

        var valueCounts = await (from r in db.SurveyResponses.AsNoTracking()
                                 join a in db.SurveyResponseAnswers.AsNoTracking()
                                     on r.ResponseId equals a.ResponseId
                                 where scoredIds.Contains(r.CourseSectionSurveyId)
                                       && countedResponseIds.Contains(r.ResponseId)
                                       && candidateQuestionIds.Contains(a.QuestionId)
                                 group a by new { a.QuestionId, a.AnswerValue } into g
                                 select new { g.Key.QuestionId, g.Key.AnswerValue, Count = g.Count() })
            .ToListAsync(cancellationToken);

        if (valueCounts.Count == 0) return [];

        // Bỏ câu bẫy khỏi bảng xếp hạng câu hỏi yếu nhất.
        var questions = await db.SurveyQuestions.AsNoTracking()
            .Where(x => candidateQuestionIds.Contains(x.QuestionId) && x.AttentionCheckValue == null)
            .ToListAsync(cancellationToken);
        var scaleByQuestion = await LoadScalesByQuestionAsync(questions, cancellationToken);
        var textById = questions.ToDictionary(x => x.QuestionId, x => x.QuestionText);
        var questionOrders = await QuestionOrdersAsync(candidateQuestionIds, cancellationToken);

        var ratings = new List<QuestionRatingDto>();
        foreach (var group in valueCounts.GroupBy(x => x.QuestionId))
        {
            int qId = group.Key;

            // Câu tự nhập không có điểm nên không xếp hạng "yếu nhất" được.
            var scale = scaleByQuestion.GetValueOrDefault(qId);
            if (scale is null || scale.IsText) continue;

            int total = group.Sum(x => x.Count);
            if (total < WeakQuestionMinAnswers) continue;

            var counts = group
                .Select(x => (Value: int.TryParse(x.AnswerValue, out var v) ? v : (int?)null, x.Count))
                .Where(x => x.Value.HasValue)
                .ToList();

            int scored = counts.Sum(x => x.Count);
            if (scored == 0) continue;

            decimal sum = counts.Sum(x => (decimal)x.Value!.Value * x.Count);
            var options = scale.Options
                .OrderBy(option => option.Value)
                .Select(option =>
                {
                    int count = counts.Where(x => x.Value == option.Value).Sum(x => x.Count);
                    decimal pct = Math.Round((decimal)count / scored * 100, 1);
                    return new OptionCountDto(option.Value, option.DisplayText, count, pct);
                })
                .ToList();

            ratings.Add(new QuestionRatingDto(
                qId,
                questionOrders.GetValueOrDefault(qId),
                textById.TryGetValue(qId, out var txt) ? txt : $"Câu hỏi #{qId}",
                Math.Round(sum / scored, 2),
                total,
                options,
                AnswerScaleKinds.Options,
                scale.AnswerScaleName));
        }

        return (lowestFirst
                ? ratings.OrderBy(x => x.AverageScore) // yếu nhất trước
                : ratings.OrderByDescending(x => x.AverageScore))
            .ThenByDescending(x => x.TotalAnswers)
            .Take(take)
            .ToList();
    }

    /// <summary>So sánh phạm vi hiện tại với một đợt hoặc học kỳ; mặc định chọn mốc phù hợp gần nhất.</summary>
    private async Task<SemesterComparisonDto?> GetSemesterComparisonAsync(
        int semesterId,
        int? comparisonSemesterId,
        int? semesterSurveyId,
        int? comparisonSemesterSurveyId,
        int? comparisonTemplateId,
        int currentResponses,
        int currentTarget,
        decimal currentAvg,
        CancellationToken cancellationToken)
    {
        // Không công bố xu hướng khi kỳ hiện tại chưa có phản hồi: chênh lệch
        // điểm khi đó chỉ là phép trừ với 0 và không có ý nghĩa điều hành.
        if (currentResponses <= 0 || currentTarget <= 0
            || (comparisonSemesterId == semesterId && comparisonSemesterSurveyId is null)
            || comparisonSemesterSurveyId == semesterSurveyId)
        {
            return null;
        }

        int? resolvedSurveyId = comparisonSemesterSurveyId;
        if (resolvedSurveyId is null && comparisonSemesterId is null && semesterSurveyId is not null)
        {
            // Khi đang xem một đợt, mốc tự động là đợt trước dùng cùng bộ câu hỏi.
            resolvedSurveyId = await db.SemesterSurveys.AsNoTracking()
                .Where(x => x.SurveyTemplateId == comparisonTemplateId
                            && x.SemesterSurveyId < semesterSurveyId.Value)
                .OrderByDescending(x => x.SemesterSurveyId)
                .Select(x => (int?)x.SemesterSurveyId)
                .FirstOrDefaultAsync(cancellationToken);
            if (resolvedSurveyId is null)
            {
                return null;
            }
        }

        var comparisonSurvey = resolvedSurveyId is { } surveyId
            ? await db.SemesterSurveys.AsNoTracking()
                .FirstOrDefaultAsync(x => x.SemesterSurveyId == surveyId, cancellationToken)
            : null;
        if (comparisonSemesterSurveyId is not null && comparisonSurvey is null)
        {
            return null;
        }

        // Không cho so sánh hai đợt dùng bộ câu hỏi khác nhau vì thang đo có thể không tương đương.
        if (comparisonSurvey is not null
            && comparisonTemplateId is not null
            && comparisonSurvey.SurveyTemplateId != comparisonTemplateId)
        {
            return null;
        }

        var comparisonSemesterQuery = db.Semesters.AsNoTracking();
        var comparisonSemester = comparisonSurvey is not null
            ? await comparisonSemesterQuery.FirstOrDefaultAsync(
                x => x.SemesterId == comparisonSurvey.SemesterId,
                cancellationToken)
            : comparisonSemesterId.HasValue
                ? await comparisonSemesterQuery.FirstOrDefaultAsync(
                    x => x.SemesterId == comparisonSemesterId.Value,
                    cancellationToken)
                : await comparisonSemesterQuery
                    .Where(x => x.SemesterId < semesterId)
                    .OrderByDescending(x => x.SemesterId)
                    .FirstOrDefaultAsync(cancellationToken);
        if (comparisonSemester is null) return null;

        var comparisonYear = await db.AcademicYears.AsNoTracking()
            .FirstOrDefaultAsync(x => x.AcademicYearId == comparisonSemester.AcademicYearId, cancellationToken);

        int? resolvedTemplateId = comparisonSurvey?.SurveyTemplateId ?? comparisonTemplateId;
        var comparisonTemplateName = resolvedTemplateId is null
            ? null
            : await db.SurveyTemplates.AsNoTracking()
                .Where(x => x.SurveyTemplateId == resolvedTemplateId.Value)
                .Select(x => x.TemplateName)
                .FirstOrDefaultAsync(cancellationToken);

        var (comparisonSections, comparisonTarget, comparisonResponses, comparisonAvg) = await ComputeSemesterCoreStatsAsync(
            comparisonSemester.SemesterId,
            comparisonTemplateId,
            comparisonSurvey?.SemesterSurveyId,
            cancellationToken);
        // Một kỳ không có chỉ tiêu hoặc không có phiếu không phải đường cơ sở
        // hợp lệ. Trả null để UI không hiển thị biến động dương giả tạo.
        if (comparisonTarget <= 0 || comparisonResponses <= 0)
        {
            return null;
        }

        decimal comparisonCompletion = comparisonTarget > 0
            ? Math.Round((decimal)comparisonResponses / comparisonTarget * 100, 2)
            : 0;

        decimal currentCompletion = currentTarget > 0 ? Math.Round((decimal)currentResponses / currentTarget * 100, 2) : 0;

        return new SemesterComparisonDto(
            comparisonSurvey is null ? "semester" : "campaign",
            comparisonSemester.SemesterId,
            comparisonSurvey?.SemesterSurveyId,
            comparisonSemester.SemesterName,
            comparisonYear?.AcademicYearName ?? string.Empty,
            comparisonTemplateName,
            comparisonSections,
            comparisonTarget,
            comparisonResponses,
            comparisonCompletion,
            comparisonAvg,
            Math.Round(currentCompletion - comparisonCompletion, 2),
            Math.Round(currentAvg - comparisonAvg, 2));
    }

    /// <summary>Chỉ số lõi (chỉ tiêu / phiếu thu / điểm TB) của một học kỳ, dùng cho so sánh.</summary>
    private async Task<(int Sections, int Target, int Responses, decimal AverageScore)> ComputeSemesterCoreStatsAsync(
        int semesterId,
        int? templateId,
        int? semesterSurveyId,
        CancellationToken cancellationToken)
    {
        var ssIds = await db.SemesterSurveys.AsNoTracking()
            .Where(x => x.SemesterId == semesterId
                        && (templateId == null || x.SurveyTemplateId == templateId)
                        && (semesterSurveyId == null || x.SemesterSurveyId == semesterSurveyId))
            .Select(x => x.SemesterSurveyId)
            .ToListAsync(cancellationToken);
        if (ssIds.Count == 0) return (0, 0, 0, 0m);

        var sectionSurveys = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => ssIds.Contains(x.SemesterSurveyId))
            .Select(x => new { x.CourseSectionSurveyId, x.CourseSectionId })
            .ToListAsync(cancellationToken);
        if (sectionSurveys.Count == 0) return (0, 0, 0, 0m);

        var cssIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();
        var sectionIds = sectionSurveys.Select(x => x.CourseSectionId).Distinct().ToList();
        var classSizeBySectionId = await db.CourseSections.AsNoTracking()
            .Where(x => sectionIds.Contains(x.CourseSectionId))
            .ToDictionaryAsync(x => x.CourseSectionId, x => x.ClassSize, cancellationToken);

        int target = sectionSurveys.Sum(x => classSizeBySectionId.GetValueOrDefault(x.CourseSectionId));

        var tallies = await ResponseTalliesAsync(cssIds, cancellationToken);

        // Tiến độ đếm MỌI phiếu hợp lệ, giống hệt mẫu số toàn trường ở
        // BuildSchoolSurveyOverviewAsync — mốc "kỳ trước có phiếu hay không" phải
        // dùng đúng con số này chứ không phải con số đã lọc ngưỡng bên dưới.
        int responses = tallies.Values.Sum(x => x.ValidCount);


        // Điểm chỉ gộp lớp đã thu đủ phiếu — cùng ngưỡng và cùng công thức với mặt
        // bằng hiện tại (overallAvg), để so sánh hai kỳ không bị lệch mốc vì mỗi bên
        // tính theo một quy tắc khác nhau.
        int scoredResponses = 0;
        decimal scoredScoreSum = 0;
        foreach (var section in sectionSurveys)
        {
            if (!tallies.TryGetValue(section.CourseSectionSurveyId, out var tally)) continue;
            var classSize = classSizeBySectionId.GetValueOrDefault(section.CourseSectionId);
            if (!tally.IsScored)
            {
                continue;
            }
            scoredResponses += tally.ValidCount;
            scoredScoreSum += tally.ValidTotalScore;
        }

        decimal avg = scoredResponses == 0 ? 0m : Math.Round(scoredScoreSum / scoredResponses, 2);
        return (sectionSurveys.Count, target, responses, avg);
    }

    private static string ScoreBandLabel(int band) => band switch
    {
        5 => "Xuất sắc",
        4 => "Tốt",
        3 => "Trung bình",
        _ => "Cần cải thiện",
    };

    /// <summary>Bản ghi trung gian cho phép gộp phân bố điểm không cần anonymous type.</summary>
    private sealed record BandCount(int Band, int Count);

    // ------------------------------------------------- Thang trả lời theo câu hỏi

    /// <summary>Thang trả lời kèm các mức của nó, dùng để đọc "AnswerValue".</summary>
    private sealed record ScaleInfo(
        int AnswerScaleId,
        string AnswerScaleName,
        string ScaleKind,
        IReadOnlyList<AnswerScaleOption> Options)
    {
        public bool IsText => ScaleKind == AnswerScaleKinds.Text;
    }

    /// <summary>Nạp thang trả lời của một tập câu hỏi, tra theo "QuestionId".</summary>
    private async Task<Dictionary<int, ScaleInfo>> LoadScalesByQuestionAsync(
        IReadOnlyList<SurveyQuestion> questions,
        CancellationToken cancellationToken)
    {
        if (questions.Count == 0) return [];

        var scaleIds = questions.Select(x => x.AnswerScaleId).Distinct().ToList();
        var scales = await db.AnswerScales.AsNoTracking()
            .Where(x => scaleIds.Contains(x.AnswerScaleId))
            .ToListAsync(cancellationToken);
        var options = await db.AnswerScaleOptions.AsNoTracking()
            .Where(x => scaleIds.Contains(x.AnswerScaleId))
            .OrderBy(x => x.Value)
            .ToListAsync(cancellationToken);
        var optionsByScaleId = options.ToLookup(x => x.AnswerScaleId);

        var infoById = scales.ToDictionary(
            scale => scale.AnswerScaleId,
            scale => new ScaleInfo(
                scale.AnswerScaleId,
                scale.AnswerScaleName,
                scale.ScaleKind,
                optionsByScaleId[scale.AnswerScaleId].ToList()));

        return questions
            .Where(question => infoById.ContainsKey(question.AnswerScaleId))
            .ToDictionary(question => question.QuestionId, question => infoById[question.AnswerScaleId]);
    }

    /// <summary>
    /// Thống kê một câu hỏi. Câu thang 'Options' ra điểm trung bình và phân bố các
    /// mức của chính thang đó; câu thang 'Text' ra danh sách nội dung người học gõ.
    /// </summary>
    /// <summary>
    /// Các câu của một bộ đề. "SurveyQuestions" không còn khoá ngoại thẳng tới
    /// "SurveyTemplates" — bộ của một câu suy ra từ mục chứa nó.
    /// </summary>
    private IQueryable<SurveyQuestion> QuestionsOfTemplate(int surveyTemplateId) =>
        from question in db.SurveyQuestions
        join section in db.SurveyQuestionSections
            on question.SectionId equals section.SectionId
        where section.SurveyTemplateId == surveyTemplateId
        select question;

    /// <summary>
    /// Số thứ tự hiển thị (C1, C2...) của các câu trong một bộ đề. Câu bẫy KHÔNG
    /// được đánh số nên số chạy liền mạch; câu tự nhập vẫn giữ số như câu thường.
    /// Phải trùng khít cách đánh số của trang bảng dữ liệu khảo sát, lệch nhau thì
    /// C16 ở màn này là C15 ở màn kia.
    /// </summary>
    private async Task<Dictionary<int, int>> TemplateQuestionOrdersAsync(
        int surveyTemplateId,
        CancellationToken cancellationToken)
    {
        var questionIds = await QuestionsOfTemplate(surveyTemplateId)
            .AsNoTracking()
            .Where(x => x.AttentionCheckValue == null)
            .OrderBy(x => x.QuestionId)
            .Select(x => x.QuestionId)
            .ToListAsync(cancellationToken);

        return questionIds
            .Select((questionId, index) => (questionId, order: index + 1))
            .ToDictionary(x => x.questionId, x => x.order);
    }

    /// <summary>Như trên nhưng cho một nhúm câu có thể thuộc nhiều bộ đề khác nhau.</summary>
    private async Task<Dictionary<int, int>> QuestionOrdersAsync(
        IReadOnlyCollection<int> questionIds,
        CancellationToken cancellationToken)
    {
        if (questionIds.Count == 0) return [];

        var templateIds = await (
            from question in db.SurveyQuestions.AsNoTracking()
            join section in db.SurveyQuestionSections.AsNoTracking()
                on question.SectionId equals section.SectionId
            where questionIds.Contains(question.QuestionId)
            select section.SurveyTemplateId)
            .Distinct()
            .ToListAsync(cancellationToken);
        if (templateIds.Count == 0) return [];

        var all = await (
            from question in db.SurveyQuestions.AsNoTracking()
            join section in db.SurveyQuestionSections.AsNoTracking()
                on question.SectionId equals section.SectionId
            where templateIds.Contains(section.SurveyTemplateId)
                && question.AttentionCheckValue == null
            select new { question.QuestionId, section.SurveyTemplateId })
            .ToListAsync(cancellationToken);

        var orders = new Dictionary<int, int>();
        foreach (var group in all.GroupBy(x => x.SurveyTemplateId))
        {
            int order = 0;
            foreach (var question in group.OrderBy(x => x.QuestionId))
            {
                orders[question.QuestionId] = ++order;
            }
        }
        return orders;
    }

    private static QuestionRatingDto BuildQuestionRating(
        int questionId,
        int questionOrder,
        string questionText,
        IReadOnlyList<SurveyResponseAnswer> answers,
        ScaleInfo? scale)
    {
        int total = answers.Count;

        if (scale is null)
        {
            return new QuestionRatingDto(questionId, questionOrder, questionText, 0, total, []);
        }

        if (scale.IsText)
        {
            var texts = answers
                .Select(x => x.AnswerValue)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Take(MaxTextAnswersPerQuestion)
                .ToList();

            return new QuestionRatingDto(
                questionId,
                questionOrder,
                questionText,
                0,
                total,
                [],
                AnswerScaleKinds.Text,
                scale.AnswerScaleName,
                texts);
        }

        // Chỉ "AnswerValue" đọc được ra số mới vào điểm; dòng hỏng thì bỏ qua.
        var values = answers
            .Select(x => int.TryParse(x.AnswerValue, out var value) ? value : (int?)null)
            .Where(x => x.HasValue)
            .Select(x => x!.Value)
            .ToList();

        decimal average = values.Count > 0 ? Math.Round((decimal)values.Average(), 2) : 0;

        // Phân bố theo đúng các mức mà thang này có, không cứng 1..5.
        var distribution = scale.Options
            .OrderBy(option => option.Value)
            .Select(option =>
            {
                int count = values.Count(value => value == option.Value);
                decimal pct = values.Count > 0 ? Math.Round((decimal)count / values.Count * 100, 1) : 0;
                return new OptionCountDto(option.Value, option.DisplayText, count, pct);
            })
            .ToList();

        return new QuestionRatingDto(
            questionId,
            questionOrder,
            questionText,
            average,
            total,
            distribution,
            AnswerScaleKinds.Options,
            scale.AnswerScaleName);
    }

    private static QuestionRatingDto BuildQuestionRatingFromAggregate(
        int questionId,
        int questionOrder,
        string questionText,
        IEnumerable<(string Value, int Count)> valueCounts,
        ScaleInfo? scale,
        IReadOnlyList<string>? textSamples = null,
        int? textTotalCount = null)
    {
        var countList = valueCounts.ToList();
        int total = countList.Sum(x => x.Count);

        if (scale is null)
        {
            return new QuestionRatingDto(questionId, questionOrder, questionText, 0, total, []);
        }

        if (scale.IsText)
        {
            var texts = (textSamples ?? [])
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Take(MaxTextAnswersPerQuestion)
                .ToList();

            int textTotal = textTotalCount ?? (total > 0 ? total : texts.Count);

            return new QuestionRatingDto(
                questionId,
                questionOrder,
                questionText,
                0,
                textTotal,
                [],
                AnswerScaleKinds.Text,
                scale.AnswerScaleName,
                texts);
        }

        long sumScores = 0;
        int scoredCount = 0;
        var countByValue = new Dictionary<int, int>();

        foreach (var (val, count) in countList)
        {
            if (val is not null && int.TryParse(val, out var numericVal))
            {
                countByValue[numericVal] = countByValue.GetValueOrDefault(numericVal) + count;
                sumScores += (long)numericVal * count;
                scoredCount += count;
            }
        }

        decimal average = scoredCount > 0 ? Math.Round((decimal)sumScores / scoredCount, 2) : 0;

        var distribution = scale.Options
            .OrderBy(option => option.Value)
            .Select(option =>
            {
                int count = countByValue.GetValueOrDefault(option.Value);
                decimal pct = scoredCount > 0 ? Math.Round((decimal)count / scoredCount * 100, 1) : 0;
                return new OptionCountDto(option.Value, option.DisplayText, count, pct);
            })
            .ToList();

        return new QuestionRatingDto(
            questionId,
            questionOrder,
            questionText,
            average,
            total,
            distribution,
            AnswerScaleKinds.Options,
            scale.AnswerScaleName);
    }
}
