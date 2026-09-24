namespace UnitTests.InfrastructureTests;

using Application.Auth;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Thống kê &amp; Báo cáo thu mọi con số về phạm vi người xem: trưởng bộ môn chỉ thấy lớp
/// của bộ môn mình (kể cả dòng khoa và tab Tổng quan), trưởng khoa/viện thấy cả khoa.
///
/// Chạy trên cơ sở dữ liệu thật, chỉ đọc. Không đặt biến môi trường
/// <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class ReportServiceScopeTests
{
    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunAsync(Func<AppDbContext, Func<UserScope, EfReportService>, Task> body)
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
        // Mọi người xem dùng CHUNG một cache, đúng như khi chạy thật: chính là chỗ từng
        // để lọt bản của quản trị sang người xem khác.
        var cache = scope.ServiceProvider.GetRequiredService<IMemoryCache>();
        var cacheVersion = new SchoolOverviewCacheVersion();

        await body(db, userScope => new EfReportService(
            db,
            cache,
            cacheVersion,
            new FixedScoringThresholdProvider(),
            new PublishedSurveyPublicationService(),
            new FixedUserScopeResolver(userScope)));
    }

    private static UserScope Admin => UserScope.Unrestricted(RoleCodes.Admin);

    /// <summary>Học kỳ và bộ môn có nhiều lớp khảo sát nhất, để có dữ liệu mà so.</summary>
    private static async Task<(int SemesterId, int DepartmentId, int FacultyId)?> BusiestDepartmentAsync(AppDbContext db)
    {
        var row = await (
            from css in db.CourseSectionSurveys
            join survey in db.SemesterSurveys on css.SemesterSurveyId equals survey.SemesterSurveyId
            join section in db.CourseSections on css.CourseSectionId equals section.CourseSectionId
            join course in db.Courses on section.CourseId equals course.CourseId
            where course.DepartmentId != null && course.FacultyId != null
            group css by new { survey.SemesterId, course.DepartmentId, course.FacultyId } into grouped
            orderby grouped.Count() descending
            select new { grouped.Key.SemesterId, grouped.Key.DepartmentId, grouped.Key.FacultyId })
            .FirstOrDefaultAsync();
        return row is null ? null : (row.SemesterId, row.DepartmentId!.Value, row.FacultyId!.Value);
    }

    private static UserScope DepartmentManager(int departmentId, int facultyId) =>
        new(RoleCodes.DepartmentManager, LecturerId: null, departmentId, facultyId, SeesEverything: false);

    private static UserScope FacultyManager(int departmentId, int facultyId) =>
        new(RoleCodes.FacultyManager, LecturerId: null, departmentId, facultyId, SeesEverything: false);

    [Fact]
    public async Task Results_ShouldBeNarrowedToDepartmentOrFaculty()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            if (await BusiestDepartmentAsync(db) is not { } target) return;

            var admin = await serviceFor(Admin)
                .GetSurveyResultsAsync(target.SemesterId, null, null, null, null, null);
            var department = await serviceFor(DepartmentManager(target.DepartmentId, target.FacultyId))
                .GetSurveyResultsAsync(target.SemesterId, null, null, null, null, null);
            var faculty = await serviceFor(FacultyManager(target.DepartmentId, target.FacultyId))
                .GetSurveyResultsAsync(target.SemesterId, null, null, null, null, null);

            department.Should().NotBeEmpty();
            department.Should().OnlyContain(x => x.DepartmentId == target.DepartmentId);
            department.Should().HaveCount(admin.Count(x => x.DepartmentId == target.DepartmentId));

            faculty.Should().OnlyContain(x => x.FacultyId == target.FacultyId);
            faculty.Should().HaveCount(admin.Count(x => x.FacultyId == target.FacultyId));
        });
    }

    /// <summary>
    /// Tab Tổng quan thu về phạm vi, và một người xem không được đọc lại bản dựng sẵn của
    /// người xem khác qua cache.
    /// </summary>
    [Fact]
    public async Task SchoolOverview_ShouldBeNarrowed_AndNotShareCacheAcrossViewers()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            if (await BusiestDepartmentAsync(db) is not { } target) return;

            // Quản trị dựng trước để cache có sẵn bản toàn trường.
            var admin = await serviceFor(Admin).GetSchoolSurveyOverviewAsync(target.SemesterId);
            var department = await serviceFor(DepartmentManager(target.DepartmentId, target.FacultyId))
                .GetSchoolSurveyOverviewAsync(target.SemesterId);
            var faculty = await serviceFor(FacultyManager(target.DepartmentId, target.FacultyId))
                .GetSchoolSurveyOverviewAsync(target.SemesterId);

            admin.Should().NotBeNull();
            department!.TotalSections.Should().BeLessThan(admin!.TotalSections);
            department.Faculties.Should().OnlyContain(x => x.FacultyId == target.FacultyId);
            department.Departments.Should().OnlyContain(x => x.DepartmentId == target.DepartmentId);

            faculty!.TotalSections.Should().BeGreaterThanOrEqualTo(department.TotalSections);
            faculty.Faculties.Should().OnlyContain(x => x.FacultyId == target.FacultyId);
        });
    }

    [Fact]
    public async Task LecturerReports_ShouldOnlyListLecturersWithSectionsInScope()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            if (await BusiestDepartmentAsync(db) is not { } target) return;

            var department = await serviceFor(DepartmentManager(target.DepartmentId, target.FacultyId))
                .GetLecturerPerformanceReportsAsync(null, null, target.SemesterId);
            var visibleSections = await serviceFor(DepartmentManager(target.DepartmentId, target.FacultyId))
                .GetSurveyResultsAsync(target.SemesterId, null, null, null, null, null);
            var visibleLecturerIds = visibleSections.Select(x => x.LecturerId).Where(x => x > 0).ToHashSet();

            department.Should().OnlyContain(x => visibleLecturerIds.Contains(x.LecturerId));

            // Giảng viên không dạy lớp nào trong phạm vi thì mở thẳng cũng không thấy.
            var outsider = await db.Lecturers
                .Where(x => !visibleLecturerIds.Contains(x.LecturerId))
                .Select(x => x.LecturerId)
                .FirstOrDefaultAsync();
            if (outsider == 0) return;
            (await serviceFor(DepartmentManager(target.DepartmentId, target.FacultyId))
                .GetLecturerPerformanceReportAsync(outsider, target.SemesterId))
                .Should().BeNull();
        });
    }
}
