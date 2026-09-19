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
/// Chốt chặn phát hành: đợt chưa phát hành thì trưởng bộ môn và giảng viên không đọc
/// được số liệu, còn quản trị vẫn đọc bình thường. Đây là lớp chặn thứ ba, độc lập với
/// quyền vào module và với phạm vi dữ liệu — tắt hay bật phân quyền module đều không
/// làm thủng nó.
///
/// Chỉ đọc, không ghi gì. Không đặt <c>ConnectionStrings__DefaultConnection</c>
/// thì tự bỏ qua.
/// </summary>
public class SurveyPublicationGateTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(scope);
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunAsync(
        Func<AppDbContext, Func<UserScope, bool, EfSurveyService>, Task> body)
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
            (userScope, published) => new EfSurveyService(
                db,
                cache,
                new FixedScopeResolver(userScope),
                new FixedScoringThresholdProvider(),
                new PublishedSurveyPublicationService(published),
                new SchoolOverviewCacheVersion()));
    }

    private static async Task<int> AnySemesterSurveyIdAsync(AppDbContext db) =>
        await db.CourseSectionSurveys.AsNoTracking()
            .GroupBy(x => x.SemesterSurveyId)
            .OrderByDescending(group => group.Count())
            .Select(group => group.Key)
            .FirstOrDefaultAsync();

    private static async Task<int?> AnyDepartmentIdAsync(AppDbContext db, int semesterSurveyId) =>
        await (
            from css in db.CourseSectionSurveys.AsNoTracking()
            join section in db.CourseSections.AsNoTracking()
                on css.CourseSectionId equals section.CourseSectionId
            join course in db.Courses.AsNoTracking()
                on section.CourseId equals course.CourseId
            where css.SemesterSurveyId == semesterSurveyId && course.DepartmentId != null
            select course.DepartmentId)
            .FirstOrDefaultAsync();

    [Fact]
    public async Task Truong_bo_mon_khong_doc_duoc_khi_dot_chua_phat_hanh()
    {
        await RunAsync(async (db, build) =>
        {
            var semesterSurveyId = await AnySemesterSurveyIdAsync(db);
            if (semesterSurveyId == 0) return;

            var departmentId = await AnyDepartmentIdAsync(db, semesterSurveyId);
            if (departmentId is null) return;

            var manager = new UserScope(
                RoleCodes.DepartmentManager,
                LecturerId: null,
                DepartmentId: departmentId,
                FacultyId: null,
                SeesEverything: false);

            var service = build(manager, false);

            var statistics = await service.GetSemesterSurveyStatisticsAsync(semesterSurveyId);
            statistics.Succeeded.Should().BeFalse();
            statistics.ErrorCode.Should().Be(SurveyErrorCodes.ResultsNotPublished);

            var normalization = await service.GetSemesterSurveyNormalizationAsync(semesterSurveyId);
            normalization.ErrorCode.Should().Be(SurveyErrorCodes.ResultsNotPublished);

            var departments = await service.GetSemesterSurveyDepartmentSummaryAsync(semesterSurveyId);
            departments.ErrorCode.Should().Be(SurveyErrorCodes.ResultsNotPublished);

            var lecturers = await service.GetSemesterSurveyLecturersAsync(semesterSurveyId);
            lecturers.ErrorCode.Should().Be(SurveyErrorCodes.ResultsNotPublished);
        });
    }

    [Fact]
    public async Task Phat_hanh_roi_thi_truong_bo_mon_doc_duoc()
    {
        await RunAsync(async (db, build) =>
        {
            var semesterSurveyId = await AnySemesterSurveyIdAsync(db);
            if (semesterSurveyId == 0) return;

            var departmentId = await AnyDepartmentIdAsync(db, semesterSurveyId);
            if (departmentId is null) return;

            var manager = new UserScope(
                RoleCodes.DepartmentManager,
                LecturerId: null,
                DepartmentId: departmentId,
                FacultyId: null,
                SeesEverything: false);

            var statistics = await build(manager, true).GetSemesterSurveyStatisticsAsync(semesterSurveyId);
            statistics.Succeeded.Should().BeTrue();
        });
    }

    [Fact]
    public async Task Quan_tri_doc_duoc_ca_khi_chua_phat_hanh()
    {
        await RunAsync(async (db, build) =>
        {
            var semesterSurveyId = await AnySemesterSurveyIdAsync(db);
            if (semesterSurveyId == 0) return;

            // Quản trị đi qua nhánh SeesEverything của dịch vụ phát hành thật, nên ở đây
            // dựng bản giả "chưa phát hành" mà vẫn phải đọc được.
            var statistics = await build(UserScope.Unrestricted(RoleCodes.Admin), true)
                .GetSemesterSurveyStatisticsAsync(semesterSurveyId);
            statistics.Succeeded.Should().BeTrue();
        });
    }
}
