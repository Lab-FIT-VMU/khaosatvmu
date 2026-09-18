namespace UnitTests.InfrastructureTests;

using Application;
using Application.Auth;
using Application.Surveys;
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
/// Bảng dữ liệu khảo sát và danh sách phiếu phải bó theo phạm vi người xem. Trước
/// đây cả hai nhận thẳng mã từ URL rồi trả về mọi lớp của đợt, nên trưởng bộ môn
/// thấy cả trường còn giảng viên chỉ cần đổi số trên thanh địa chỉ là đọc được
/// nhận xét sinh viên viết về lớp của đồng nghiệp.
///
/// Chỉ đọc, không ghi gì. Không đặt <c>ConnectionStrings__DefaultConnection</c>
/// thì tự bỏ qua.
/// </summary>
public class StatisticsScopeTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(scope);
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static UserScope Admin => UserScope.Unrestricted(RoleCodes.Admin);

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

        await body(
            db,
            userScope => new EfSurveyService(
                db,
                cache,
                new FixedScopeResolver(userScope),
                new FixedScoringThresholdProvider(),
                new PublishedSurveyPublicationService(),
                new SchoolOverviewCacheVersion()));
    }

    private static async Task<int> LargestSemesterSurveyIdAsync(AppDbContext db) =>
        await db.CourseSectionSurveys.AsNoTracking()
            .GroupBy(x => x.SemesterSurveyId)
            .OrderByDescending(group => group.Count())
            .Select(group => group.Key)
            .FirstOrDefaultAsync();

    /// <summary>Một bộ môn có lớp thật trong đợt, kèm số lớp đúng của bộ môn đó.</summary>
    private static async Task<(int DepartmentId, int SectionCount)?> FindDepartmentAsync(
        AppDbContext db,
        int semesterSurveyId)
    {
        var rows = await (
            from css in db.CourseSectionSurveys.AsNoTracking()
            join section in db.CourseSections.AsNoTracking()
                on css.CourseSectionId equals section.CourseSectionId
            join course in db.Courses.AsNoTracking()
                on section.CourseId equals course.CourseId
            where css.SemesterSurveyId == semesterSurveyId && course.DepartmentId != null
            select course.DepartmentId!.Value).ToListAsync();

        var group = rows.GroupBy(x => x).OrderByDescending(g => g.Count()).FirstOrDefault();
        return group is null ? null : (group.Key, group.Count());
    }

    [Fact]
    public async Task Statistics_ForADepartmentHead_ShouldOnlyListThatDepartmentsSections()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await LargestSemesterSurveyIdAsync(db);
            if (semesterSurveyId == 0) return;

            var department = await FindDepartmentAsync(db, semesterSurveyId);
            if (department is null) return;

            var asAdmin = await serviceFor(Admin).GetSemesterSurveyStatisticsAsync(semesterSurveyId);
            asAdmin.Succeeded.Should().BeTrue();

            var headScope = new UserScope(
                RoleCodes.DepartmentManager,
                LecturerId: null,
                DepartmentId: department.Value.DepartmentId,
                FacultyId: null,
                SeesEverything: false);
            var asHead = await serviceFor(headScope).GetSemesterSurveyStatisticsAsync(semesterSurveyId);

            asHead.Succeeded.Should().BeTrue();
            asHead.Value!.Rows.Should().HaveCount(
                department.Value.SectionCount,
                "trưởng bộ môn chỉ được thấy lớp của bộ môn mình");
            asHead.Value.Rows.Count.Should().BeLessThan(
                asAdmin.Value!.Rows.Count,
                "và phải ít hơn hẳn số lớp mà quản trị thấy");
        });
    }

    [Fact]
    public async Task Statistics_ForALecturer_ShouldOnlyListTheirOwnSections()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await LargestSemesterSurveyIdAsync(db);
            if (semesterSurveyId == 0) return;

            var lecturerId = await (
                from css in db.CourseSectionSurveys.AsNoTracking()
                join section in db.CourseSections.AsNoTracking()
                    on css.CourseSectionId equals section.CourseSectionId
                where css.SemesterSurveyId == semesterSurveyId && section.LecturerId != null
                select section.LecturerId!.Value).FirstOrDefaultAsync();
            if (lecturerId == 0) return;

            var expected = await (
                from css in db.CourseSectionSurveys.AsNoTracking()
                join section in db.CourseSections.AsNoTracking()
                    on css.CourseSectionId equals section.CourseSectionId
                where css.SemesterSurveyId == semesterSurveyId && section.LecturerId == lecturerId
                select css.CourseSectionSurveyId).CountAsync();

            var lecturerScope = new UserScope(
                RoleCodes.Lecturer,
                LecturerId: lecturerId,
                DepartmentId: null,
                FacultyId: null,
                SeesEverything: false);
            var result = await serviceFor(lecturerScope)
                .GetSemesterSurveyStatisticsAsync(semesterSurveyId);

            result.Succeeded.Should().BeTrue();
            result.Value!.Rows.Should().HaveCount(
                expected,
                "giảng viên chỉ thấy đúng lớp mình dạy, không thấy cả bộ môn");
        });
    }

    [Fact]
    public async Task Responses_OfAnotherLecturersSection_ShouldNotBeReadable()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await LargestSemesterSurveyIdAsync(db);
            if (semesterSurveyId == 0) return;

            // Một lớp có giảng viên, và một giảng viên KHÁC trong cùng đợt.
            var owned = await (
                from css in db.CourseSectionSurveys.AsNoTracking()
                join section in db.CourseSections.AsNoTracking()
                    on css.CourseSectionId equals section.CourseSectionId
                where css.SemesterSurveyId == semesterSurveyId && section.LecturerId != null
                select new { css.CourseSectionSurveyId, LecturerId = section.LecturerId!.Value })
                .FirstOrDefaultAsync();
            if (owned is null) return;

            var otherLecturerId = await (
                from section in db.CourseSections.AsNoTracking()
                where section.LecturerId != null && section.LecturerId != owned.LecturerId
                select section.LecturerId!.Value).FirstOrDefaultAsync();
            if (otherLecturerId == 0) return;

            var intruder = new UserScope(
                RoleCodes.Lecturer,
                LecturerId: otherLecturerId,
                DepartmentId: null,
                FacultyId: null,
                SeesEverything: false);

            var result = await serviceFor(intruder)
                .GetSurveyResponsesAsync(owned.CourseSectionSurveyId);

            result.Succeeded.Should().BeFalse(
                "đổi mã lớp trên URL không được đọc ra phiếu của lớp người khác");
            result.ErrorCode.Should().Be(
                SurveyErrorCodes.SectionSurveyNotFound,
                "trả 'không tìm thấy' chứ không phải 'không có quyền', để không dò được lớp nào có thật");
        });
    }

    [Fact]
    public async Task Recalculate_ByADepartmentHead_ShouldBeRejected()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await LargestSemesterSurveyIdAsync(db);
            if (semesterSurveyId == 0) return;

            var department = await FindDepartmentAsync(db, semesterSurveyId);
            if (department is null) return;

            var head = new UserScope(
                RoleCodes.DepartmentManager,
                LecturerId: null,
                DepartmentId: department.Value.DepartmentId,
                FacultyId: null,
                SeesEverything: false);

            var result = await serviceFor(head).RecalculateSemesterSurveyScoresAsync(semesterSurveyId);

            result.Succeeded.Should().BeFalse(
                "chốt điểm ghi đè MỌI lớp của đợt, không cắt được theo bộ môn");
            result.ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope);
        });
    }

    [Fact]
    public async Task ScopeAnalysis_OfAnotherDepartment_ShouldBeRejected()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await LargestSemesterSurveyIdAsync(db);
            if (semesterSurveyId == 0) return;

            var mine = await FindDepartmentAsync(db, semesterSurveyId);
            if (mine is null) return;

            // Một bộ môn KHÁC cũng có lớp trong đợt.
            var otherDepartmentId = await (
                from css in db.CourseSectionSurveys.AsNoTracking()
                join section in db.CourseSections.AsNoTracking()
                    on css.CourseSectionId equals section.CourseSectionId
                join course in db.Courses.AsNoTracking()
                    on section.CourseId equals course.CourseId
                where css.SemesterSurveyId == semesterSurveyId
                    && course.DepartmentId != null
                    && course.DepartmentId != mine.Value.DepartmentId
                select course.DepartmentId!.Value).FirstOrDefaultAsync();
            if (otherDepartmentId == 0) return;

            var head = new UserScope(
                RoleCodes.DepartmentManager,
                LecturerId: null,
                DepartmentId: mine.Value.DepartmentId,
                FacultyId: null,
                SeesEverything: false);

            var result = await serviceFor(head).GetSurveyScopeAnalysisAsync(
                semesterSurveyId,
                SurveyScopeTypes.Department,
                otherDepartmentId);

            result.Succeeded.Should().BeFalse(
                "đổi scopeId trên URL không được đọc ra phân tích của bộ môn khác");
        });
    }

    [Fact]
    public async Task ScopeAnalysis_OfOwnDepartment_ShouldStillWork()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await LargestSemesterSurveyIdAsync(db);
            if (semesterSurveyId == 0) return;

            var mine = await FindDepartmentAsync(db, semesterSurveyId);
            if (mine is null) return;

            var asAdmin = await serviceFor(Admin).GetSurveyScopeAnalysisAsync(
                semesterSurveyId, SurveyScopeTypes.Department, mine.Value.DepartmentId);
            // Bộ môn không có lớp nào đủ phiếu thì cả admin cũng không xem được;
            // khi đó không có gì để so về phân quyền.
            if (!asAdmin.Succeeded) return;

            var head = new UserScope(
                RoleCodes.DepartmentManager,
                LecturerId: null,
                DepartmentId: mine.Value.DepartmentId,
                FacultyId: null,
                SeesEverything: false);

            var result = await serviceFor(head).GetSurveyScopeAnalysisAsync(
                semesterSurveyId, SurveyScopeTypes.Department, mine.Value.DepartmentId);

            result.Succeeded.Should().BeTrue("siết phạm vi không được chặn nhầm bộ môn của chính mình");
        });
    }

    [Fact]
    public async Task Responses_OfOwnSection_ShouldStillBeReadable()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await LargestSemesterSurveyIdAsync(db);
            if (semesterSurveyId == 0) return;

            var owned = await (
                from css in db.CourseSectionSurveys.AsNoTracking()
                join section in db.CourseSections.AsNoTracking()
                    on css.CourseSectionId equals section.CourseSectionId
                where css.SemesterSurveyId == semesterSurveyId && section.LecturerId != null
                select new { css.CourseSectionSurveyId, LecturerId = section.LecturerId!.Value })
                .FirstOrDefaultAsync();
            if (owned is null) return;

            var owner = new UserScope(
                RoleCodes.Lecturer,
                LecturerId: owned.LecturerId,
                DepartmentId: null,
                FacultyId: null,
                SeesEverything: false);

            var result = await serviceFor(owner).GetSurveyResponsesAsync(owned.CourseSectionSurveyId);

            result.Succeeded.Should().BeTrue("siết phạm vi không được chặn nhầm lớp của chính mình");
        });
    }
}
