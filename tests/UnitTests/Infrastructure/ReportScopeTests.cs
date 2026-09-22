namespace UnitTests.InfrastructureTests;

using Application;
using Application.Auth;
using Domain;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using global::Infrastructure.Surveys;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Kiểm chứng mục D6 — chỗ dễ làm sai nhất của cả đợt.
///
/// Yêu cầu: trưởng bộ môn chỉ thấy các dòng của bộ môn mình, NHƯNG mọi con số dùng để
/// so sánh vẫn phải tính trên toàn trường. Lọc sớm thì z-score và độ lệch chuẩn bị
/// tính lại trên vài chục lớp của một bộ môn, ra con số hoàn toàn khác và mất hết ý
/// nghĩa — lớp yếu của một bộ môn yếu sẽ hoá thành "đạt mặt bằng".
///
/// Chạy trên cơ sở dữ liệu thật, chỉ đọc.
/// </summary>
public class ReportScopeTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(scope);
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunAsync(
        Func<AppDbContext, Func<UserScope, EfSurveyService>, Task> body)
    {
        var connectionString = ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
        services.AddMemoryCache();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = connectionString,
            })
            .Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddPersistence(configuration);

        await using var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cache = scope.ServiceProvider.GetRequiredService<IMemoryCache>();

        await body(db, userScope => new EfSurveyService(db, cache, new FixedScopeResolver(userScope), new FixedScoringThresholdProvider(), new PublishedSurveyPublicationService(), new SchoolOverviewCacheVersion()));
    }

    private static UserScope Admin => UserScope.Unrestricted(RoleCodes.Admin);

    /// <summary>
    /// Phạm vi của trưởng bộ môn, dựng GIỐNG <c>EfUserScopeResolver</c>: có cả
    /// <c>DepartmentId</c> lẫn <c>FacultyId</c> lấy từ hồ sơ giảng viên.
    /// <para>
    /// Trước đây helper này chỉ đặt <c>DepartmentId</c> và để <c>FacultyId = null</c>. Đó là
    /// trạng thái mà resolver thật không bao giờ tạo ra, và nó rơi vào nhánh “không xác định
    /// được khoa” của service nên trả danh sách rỗng — test đo một hành vi không tồn tại.
    /// </para>
    /// </summary>
    private static async Task<UserScope> ManagerScopeAsync(AppDbContext db, int departmentId)
    {
        var facultyId = await db.Departments.AsNoTracking()
            .Where(x => x.DepartmentId == departmentId)
            .Select(x => x.FacultyId)
            .FirstOrDefaultAsync();

        return new UserScope(
            RoleCodes.DepartmentManager,
            LecturerId: null,
            departmentId,
            facultyId,
            SeesEverything: false);
    }

    /// <summary>Đợt khảo sát có nhiều lớp thu được phiếu nhất, để có dữ liệu mà so.</summary>
    private static Task<int> BusiestSurveyAsync(AppDbContext db) =>
        db.CourseSectionSurveys
            .GroupBy(x => x.SemesterSurveyId)
            .OrderByDescending(x => x.Count())
            .Select(x => x.Key)
            .FirstOrDefaultAsync();

    /// <summary>Bộ môn có nhiều lớp nhất trong đợt đó.</summary>
    private static Task<int?> BusiestDepartmentAsync(AppDbContext db, int semesterSurveyId) =>
        (from css in db.CourseSectionSurveys
         join section in db.CourseSections on css.CourseSectionId equals section.CourseSectionId
         join course in db.Courses on section.CourseId equals course.CourseId
         where css.SemesterSurveyId == semesterSurveyId && course.DepartmentId != null
         group css by course.DepartmentId into grouped
         orderby grouped.Count() descending
         select grouped.Key).FirstOrDefaultAsync();

    [Fact]
    public async Task Normalization_ShouldNarrowRows_ButKeepSchoolBaselineIdentical()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await BusiestSurveyAsync(db);
            if (semesterSurveyId == 0) return;
            var departmentId = await BusiestDepartmentAsync(db, semesterSurveyId);
            if (departmentId is null) return;

            var asAdmin = await serviceFor(Admin)
                .GetSemesterSurveyNormalizationAsync(semesterSurveyId);
            var managerScope = await ManagerScopeAsync(db, departmentId.Value);
            var asManager = await serviceFor(managerScope)
                .GetSemesterSurveyNormalizationAsync(semesterSurveyId);
            if (!asAdmin.Succeeded || asAdmin.Value!.Sections.Count == 0) return;

            var admin = asAdmin.Value!;
            var manager = asManager.Value!;

            manager.Sections.Count.Should().BeLessThan(admin.Sections.Count, "bảng chi tiết bị lọc");
            manager.Sections.Should().NotBeEmpty();

            // Đây là phần quan trọng nhất của cả bài test.
            manager.SchoolSectionCount.Should().Be(admin.SchoolSectionCount);
            manager.SchoolAverageScore.Should().Be(admin.SchoolAverageScore);
            manager.SchoolStandardDeviation.Should().Be(admin.SchoolStandardDeviation);
            manager.Groups.Count.Should().Be(admin.Groups.Count, "bảng nhóm theo khoa giữ nguyên");

            // Z-score của cùng một lớp phải giống hệt nhau ở hai góc nhìn.
            var sample = manager.Sections[0];
            var same = admin.Sections.Single(x => x.CourseSectionSurveyId == sample.CourseSectionSurveyId);
            sample.ZSchool.Should().Be(same.ZSchool, "z-score không được tính lại theo bộ môn");
            sample.ZFaculty.Should().Be(same.ZFaculty);
        });
    }

    /// <summary>
    /// Trưởng bộ môn thấy MỌI bộ môn trong khoa của mình, không phải chỉ bộ môn mình: bảng này
    /// sinh ra để so bộ môn với bộ môn, còn đúng một dòng thì không so được với ai. Điều bắt buộc
    /// là không lọt bộ môn của khoa khác, và dòng tổng ở chân bảng vẫn phải là mặt bằng toàn
    /// trường để còn mốc mà đối chiếu.
    /// </summary>
    [Fact]
    public async Task DepartmentSummary_ShowsOwnFacultyOnly_ButKeepsSchoolTotalsInTheFooter()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await BusiestSurveyAsync(db);
            if (semesterSurveyId == 0) return;
            var departmentId = await BusiestDepartmentAsync(db, semesterSurveyId);
            if (departmentId is null) return;

            var managerScope = await ManagerScopeAsync(db, departmentId.Value);
            if (managerScope.FacultyId is null) return;

            var asAdmin = await serviceFor(Admin)
                .GetSemesterSurveyDepartmentSummaryAsync(semesterSurveyId);
            var asManager = await serviceFor(managerScope)
                .GetSemesterSurveyDepartmentSummaryAsync(semesterSurveyId);
            if (!asAdmin.Succeeded || asAdmin.Value!.Rows.Count == 0) return;

            var admin = asAdmin.Value!;
            var manager = asManager.Value!;

            var expected = admin.Rows
                .Where(x => x.FacultyId == managerScope.FacultyId)
                .Select(x => x.DepartmentId)
                .ToList();
            if (expected.Count == 0) return;

            // Không lọt bộ môn của khoa khác — đây là tính chất bảo mật của phạm vi.
            manager.Rows.Should().OnlyContain(x => x.FacultyId == managerScope.FacultyId);
            manager.Rows.Select(x => x.DepartmentId).Should().Equal(expected);

            // Chân bảng tính TRƯỚC khi lọc nên hai góc nhìn phải giống hệt nhau.
            manager.SchoolDepartmentCount.Should().Be(admin.SchoolDepartmentCount);
            manager.SchoolSectionCount.Should().Be(admin.SchoolSectionCount);
            manager.SchoolResponseCount.Should().Be(admin.SchoolResponseCount);
            manager.SchoolAverageScore.Should().Be(admin.SchoolAverageScore);
            manager.SchoolWarningCount.Should().Be(admin.SchoolWarningCount);
        });
    }

    [Fact]
    public async Task CourseDiagnosisAndLecturerOptions_ShouldBeNarrowed()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await BusiestSurveyAsync(db);
            if (semesterSurveyId == 0) return;
            var departmentId = await BusiestDepartmentAsync(db, semesterSurveyId);
            if (departmentId is null) return;

            var adminService = serviceFor(Admin);
            var managerService = serviceFor(await ManagerScopeAsync(db, departmentId.Value));

            var adminCourses = await adminService.GetSemesterSurveyCourseDiagnosisAsync(semesterSurveyId);
            var managerCourses = await managerService.GetSemesterSurveyCourseDiagnosisAsync(semesterSurveyId);
            var adminLecturers = await adminService.GetSemesterSurveyLecturersAsync(semesterSurveyId);
            var managerLecturers = await managerService.GetSemesterSurveyLecturersAsync(semesterSurveyId);
            if (!adminCourses.Succeeded || adminCourses.Value!.Rows.Count == 0) return;

            managerCourses.Value!.Rows.Count
                .Should().BeLessThan(adminCourses.Value!.Rows.Count);
            managerLecturers.Value!.Count
                .Should().BeLessThanOrEqualTo(adminLecturers.Value!.Count);
        });
    }

    [Fact]
    public async Task DepartmentDashboard_ShouldCompareAgainstSchoolBaseline()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await BusiestSurveyAsync(db);
            if (semesterSurveyId == 0) return;
            var departmentId = await BusiestDepartmentAsync(db, semesterSurveyId);
            if (departmentId is null) return;

            var asAdmin = await serviceFor(Admin).GetDepartmentDashboardAsync(semesterSurveyId);
            var asManager = await serviceFor(await ManagerScopeAsync(db, departmentId.Value))
                .GetDepartmentDashboardAsync(semesterSurveyId);
            if (!asAdmin.Succeeded || asAdmin.Value!.SchoolSectionCount == 0) return;

            var admin = asAdmin.Value!;
            var manager = asManager.Value!;

            manager.SectionCount.Should().BeLessThan(manager.SchoolSectionCount);
            manager.SchoolSectionCount.Should().Be(admin.SchoolSectionCount);
            manager.SchoolAverageScore.Should().Be(admin.SchoolAverageScore);
            manager.SchoolCompletionRate.Should().Be(admin.SchoolCompletionRate);
            manager.DepartmentName.Should().NotBeNullOrEmpty();

            // Quản trị thì số bộ môn chính là số toàn trường.
            admin.SectionCount.Should().Be(admin.SchoolSectionCount);
            admin.DepartmentName.Should().BeNull();
        });
    }

    [Fact]
    public async Task ScopeWithoutDepartment_ShouldSeeNoRows_ButStillGetSchoolBaseline()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await BusiestSurveyAsync(db);
            if (semesterSurveyId == 0) return;

            var service = serviceFor(UserScope.None with { RoleCode = RoleCodes.DepartmentManager });
            var normalization = await service.GetSemesterSurveyNormalizationAsync(semesterSurveyId);
            var summary = await service.GetSemesterSurveyDepartmentSummaryAsync(semesterSurveyId);
            if (!normalization.Succeeded) return;

            normalization.Value!.Sections.Should().BeEmpty("không tra ra bộ môn thì không thấy dòng nào");
            summary.Value!.Rows.Should().BeEmpty();

            // Nhưng mặt bằng vẫn đúng, không bị kéo về 0 — đó là số của cả trường.
            normalization.Value!.SchoolSectionCount.Should().BeGreaterThan(0);
        });
    }

    [Fact]
    public async Task ScopeAnalysis_ShouldAggregateInDatabaseAndLimitTextSamples()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var candidate = await (
                from sectionSurvey in db.CourseSectionSurveys
                join section in db.CourseSections
                    on sectionSurvey.CourseSectionId equals section.CourseSectionId
                where db.SurveyResponses.Any(response =>
                    response.CourseSectionSurveyId == sectionSurvey.CourseSectionSurveyId
                    && response.IsValid)
                select new { sectionSurvey.SemesterSurveyId, section.CourseId })
                .FirstOrDefaultAsync();
            if (candidate is null) return;

            var result = await serviceFor(Admin).GetSurveyScopeAnalysisAsync(
                candidate.SemesterSurveyId,
                "course",
                candidate.CourseId);

            result.Succeeded.Should().BeTrue(result.ErrorCode);
            var analysis = result.Value!;
            analysis.ResponseCount.Should().BeGreaterThan(0);
            analysis.Questions.Should().NotBeEmpty();
            analysis.Questions
                .Where(question => question.ScaleKind == AnswerScaleKinds.Text)
                .All(question => question.TextAnswers != null && question.TextAnswers.Count <= 200)
                .Should().BeTrue();
            analysis.Questions
                .Where(question => question.ScaleKind == AnswerScaleKinds.Options)
                .All(question =>
                    question.OptionDistribution.Sum(option => option.Count) <= question.TotalAnswers)
                .Should().BeTrue();
        });
    }
}
