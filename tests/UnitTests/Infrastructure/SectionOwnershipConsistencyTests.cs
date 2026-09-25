namespace UnitTests.InfrastructureTests;

using Application.Auth;
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
/// Một lớp thuộc khoa / bộ môn nào phải được quyết định theo MỘT quy tắc ở mọi nơi. Lỗi thật đã
/// gặp: học phần không ghi khoa (<c>Course.FacultyId = null</c>) nhưng bộ môn của nó thuộc khoa
/// — lớp hiện trong danh sách phân tích của quản lý khoa, mở chi tiết lại báo "không tìm thấy",
/// vì bộ lọc trong cơ sở dữ liệu chỉ nhìn cột của học phần.
///
/// Chạy trên cơ sở dữ liệu thật, mọi thay đổi nằm trong một transaction rồi rollback.
/// Không đặt biến môi trường <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class SectionOwnershipConsistencyTests
{
    private sealed record Target(
        int CourseSectionSurveyId,
        int SemesterSurveyId,
        int SemesterId,
        int CourseId,
        int DepartmentId,
        int FacultyId);

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunInRollbackAsync(
        Func<AppDbContext, IMemoryCache, Target, Task> body)
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

        // Một lớp đã chốt điểm (để có mặt trong danh sách phân tích), học phần có bộ môn và
        // bộ môn thuộc một khoa.
        var target = await (
            from css in db.CourseSectionSurveys
            join survey in db.SemesterSurveys on css.SemesterSurveyId equals survey.SemesterSurveyId
            join section in db.CourseSections on css.CourseSectionId equals section.CourseSectionId
            join course in db.Courses on section.CourseId equals course.CourseId
            join department in db.Departments on course.DepartmentId equals department.DepartmentId
            where css.AverageScore != null && css.ValidResponseCount > 0 && department.FacultyId != null
            select new Target(
                css.CourseSectionSurveyId,
                css.SemesterSurveyId,
                survey.SemesterId,
                course.CourseId,
                department.DepartmentId,
                department.FacultyId!.Value))
            .FirstOrDefaultAsync();
        if (target is null) return;

        await using var transaction = await db.Database.BeginTransactionAsync();
        try
        {
            // Đúng dữ liệu làm lộ lỗi: học phần không ghi khoa, chỉ ghi bộ môn.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""UPDATE "Courses" SET "FacultyId" = NULL WHERE "CourseId" = {target.CourseId}""");

            await body(db, cache, target);
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }

    private static EfSurveyService SurveyService(AppDbContext db, IMemoryCache cache, UserScope scope) =>
        new(
            db,
            cache,
            new FixedUserScopeResolver(scope),
            new FixedScoringThresholdProvider(),
            new PublishedSurveyPublicationService(),
            new SchoolOverviewCacheVersion());

    private static EfReportService ReportService(AppDbContext db, UserScope scope) =>
        new(
            db,
            new MemoryCache(new MemoryCacheOptions()),
            new SchoolOverviewCacheVersion(),
            new FixedScoringThresholdProvider(),
            new PublishedSurveyPublicationService(),
            new FixedUserScopeResolver(scope));

    public static TheoryData<string> ManagerRoles => new() { RoleCodes.FacultyManager, RoleCodes.DepartmentManager };

    [Theory]
    [MemberData(nameof(ManagerRoles))]
    public async Task ManagerSeesTheSameSection_InAnalysisList_SectionList_Detail_AndReports(string roleCode)
    {
        await RunInRollbackAsync(async (db, cache, target) =>
        {
            var scope = new UserScope(
                roleCode, LecturerId: null, target.DepartmentId, target.FacultyId, SeesEverything: false);
            var surveys = SurveyService(db, cache, scope);

            var analysis = await surveys.GetSemesterSurveyNormalizationAsync(target.SemesterSurveyId);
            analysis.Succeeded.Should().BeTrue(analysis.ErrorCode);
            analysis.Value!.Sections.Select(x => x.CourseSectionSurveyId)
                .Should().Contain(target.CourseSectionSurveyId, "danh sách phân tích có lớp này");

            var sections = await surveys.GetCourseSectionSurveysAsync(target.SemesterSurveyId);
            sections.Select(x => x.CourseSectionSurveyId)
                .Should().Contain(target.CourseSectionSurveyId, "danh sách lớp phải khớp danh sách phân tích");

            var detail = await surveys.GetSurveyResponsesAsync(target.CourseSectionSurveyId);
            detail.Succeeded.Should().BeTrue("mở chi tiết lớp đang hiện trong danh sách không được báo không tìm thấy");

            var results = await ReportService(db, scope)
                .GetSurveyResultsAsync(target.SemesterId, null, null, null, target.SemesterSurveyId, null);
            results.Select(x => x.CourseSectionSurveyId)
                .Should().Contain(target.CourseSectionSurveyId, "Thống kê & Báo cáo dùng cùng quy tắc");
        });
    }

    [Fact]
    public async Task OtherFacultyManager_StillCannotOpenTheSection()
    {
        await RunInRollbackAsync(async (db, cache, target) =>
        {
            var otherFacultyId = await db.Faculties
                .Where(x => x.FacultyId != target.FacultyId)
                .Select(x => x.FacultyId)
                .FirstOrDefaultAsync();
            if (otherFacultyId == 0) return;

            var scope = new UserScope(
                RoleCodes.FacultyManager, LecturerId: null, DepartmentId: null, otherFacultyId, SeesEverything: false);
            var surveys = SurveyService(db, cache, scope);

            (await surveys.GetSurveyResponsesAsync(target.CourseSectionSurveyId))
                .Succeeded.Should().BeFalse("lớp thuộc khoa khác");
        });
    }
}
