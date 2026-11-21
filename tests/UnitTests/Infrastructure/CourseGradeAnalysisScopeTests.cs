namespace UnitTests.InfrastructureTests;

using Application;
using Application.Auth;
using Application.CourseGrades;
using Domain;
using FluentAssertions;
using global::Infrastructure.CourseGrades;
using global::Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Phạm vi của báo cáo phân tích điểm, đọc trên kết quả thật của lượt tính hiện hành:
/// quản trị hệ thống, quản trị khảo sát và Ban giám hiệu xem hết (chốt 09/11/2026); quản lý
/// khoa / bộ môn chỉ thấy đơn vị mình; giảng viên và phạm vi rỗng bị từ chối.
///
/// Chỉ đọc. Chạy khi đặt <c>COURSE_GRADE_E2E_CONNECTION</c> tới CSDL đã có lượt tính hiện hành
/// (sau kiểm thử nạp điểm và một lượt worker); không có thì tự bỏ qua.
/// </summary>
public class CourseGradeAnalysisScopeTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) => Task.FromResult(scope);
    }

    private sealed record Sample(long RunId, int SemesterId, int DepartmentId, int OtherDepartmentId, int FacultyId);

    private static async Task RunAsync(Func<AppDbContext, Sample, Func<UserScope, EfCourseGradeAnalysisService>, Task> body)
    {
        var connectionString = Environment.GetEnvironmentVariable("COURSE_GRADE_E2E_CONNECTION");
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = connectionString })
            .Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddPersistence(configuration);
        await using var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var run = await db.GradeAnalysisRuns.AsNoTracking().SingleOrDefaultAsync(x => x.IsCurrent);
        if (run is null || run.SemesterIds.Count == 0) return;
        var semesterId = run.SemesterIds[^1];
        // Hai bộ môn có nhiều học phần nhất trong kỳ, cùng khoa của bộ môn đầu.
        var departments = await db.GradeAnalysisCourseResults.AsNoTracking()
            .Where(x => x.RunId == run.RunId && x.SemesterId == semesterId && x.DepartmentId != null)
            .GroupBy(x => new { x.DepartmentId, x.FacultyId })
            .OrderByDescending(g => g.Count())
            .Select(g => new { g.Key.DepartmentId, g.Key.FacultyId })
            .Take(2)
            .ToListAsync();
        if (departments.Count < 2 || departments[0].FacultyId is null) return;

        var sample = new Sample(run.RunId, semesterId, departments[0].DepartmentId!.Value,
            departments[1].DepartmentId!.Value, departments[0].FacultyId!.Value);
        await body(db, sample, userScope => new EfCourseGradeAnalysisService(db, new FixedScopeResolver(userScope)));
    }

    private static UserScope DepartmentManager(int departmentId) =>
        new(RoleCodes.DepartmentManager, LecturerId: 1, DepartmentId: departmentId, FacultyId: null, SeesEverything: false);

    private static UserScope FacultyManager(int facultyId) =>
        new(RoleCodes.FacultyManager, LecturerId: 1, DepartmentId: null, FacultyId: facultyId, SeesEverything: false);

    private static readonly UserScope Board =
        new(RoleCodes.BoardOfDirectors, LecturerId: null, DepartmentId: null, FacultyId: null, SeesEverything: true);

    [Fact]
    public async Task Overview_RestrictsSchoolTotalsToFullScope_WithoutChangingStoredResults()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new AppDbContext(options);
        const string crossTermJson = """
            {
              "ky":["2526_HK1"], "semester_by_ky":{"2526_HK1":1},
              "xu_huong":{"2526_HK1":{"so_hp":99}},
              "g1_ngau_nhien":{"2526_HK1":0.25},
              "co_hp":{"12345":{"2526_HK1":["H1"]},"67890":{"2526_HK1":["H2"]}},
              "de_thi":{"12345":{"2526_HK1":7},"67890":{"2526_HK1":8}},
              "de_thi_lech":{"12345":{},"67890":{}}
            }
            """;
        db.AcademicYears.Add(new AcademicYear { AcademicYearId = 1, AcademicYearName = "2025-2026" });
        db.Semesters.Add(new Semester { SemesterId = 1, AcademicYearId = 1, SemesterName = "Học kỳ 1" });
        db.GradeAnalysisRuns.Add(new GradeAnalysisRun
        {
            RunId = 1, IsCurrent = true, SemesterIds = [1], CrossTermJson = crossTermJson,
        });
        db.GradeAnalysisTermResults.Add(new GradeAnalysisTermResult
        {
            RunId = 1, SemesterId = 1, DataJson = """{"tong":{"so_hp":99}}""",
        });
        db.GradeAnalysisCourseResults.AddRange(
            new GradeAnalysisCourseResult
            {
                RunId = 1, SemesterId = 1, BaseCourseCode = "12345", FacultyId = 10, DepartmentId = 100,
            },
            new GradeAnalysisCourseResult
            {
                RunId = 1, SemesterId = 1, BaseCourseCode = "67890", FacultyId = 20, DepartmentId = 200,
            });
        await db.SaveChangesAsync();

        foreach (var scope in new[] { DepartmentManager(100), FacultyManager(10) })
        {
            var overview = await new EfCourseGradeAnalysisService(db, new FixedScopeResolver(scope)).GetOverviewAsync();
            overview.Terms.Should().ContainSingle().Which.Summary.Should().BeNull();
            var crossTerm = overview.CrossTerm!.AsObject();
            crossTerm.ContainsKey("xu_huong").Should().BeFalse();
            crossTerm.ContainsKey("g1_ngau_nhien").Should().BeFalse();
            foreach (var key in new[] { "co_hp", "de_thi", "de_thi_lech" })
            {
                crossTerm[key]!.AsObject().Select(x => x.Key).Should().Equal("12345");
            }
            crossTerm["semester_by_ky"]!["2526_HK1"]!.GetValue<int>().Should().Be(1);
        }

        foreach (var scope in new[] { UserScope.Unrestricted(RoleCodes.Admin), Board })
        {
            var overview = await new EfCourseGradeAnalysisService(db, new FixedScopeResolver(scope)).GetOverviewAsync();
            overview.Terms.Should().ContainSingle().Which.Summary!["so_hp"]!.GetValue<int>().Should().Be(99);
            overview.CrossTerm!["xu_huong"]!["2526_HK1"]!["so_hp"]!.GetValue<int>().Should().Be(99);
            overview.CrossTerm["g1_ngau_nhien"]!["2526_HK1"]!.GetValue<double>().Should().Be(0.25);
            overview.CrossTerm["co_hp"]!.AsObject().Should().HaveCount(2);
        }
        (await db.GradeAnalysisRuns.AsNoTracking().SingleAsync()).CrossTermJson.Should().Be(crossTermJson);
    }

    [Fact]
    public async Task CourseStatistics_ExcludeOtherUnitsUsingTheSameBaseCourseCode()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new AppDbContext(options);
        db.GradeAnalysisRuns.Add(new GradeAnalysisRun { RunId = 1, IsCurrent = true });
        db.GradeAnalysisCourseResults.Add(new GradeAnalysisCourseResult
        {
            RunId = 1, SemesterId = 1, BaseCourseCode = "12345", FacultyId = 10, DepartmentId = 100,
        });
        db.GradeAnalysisSectionResults.AddRange(
            new GradeAnalysisSectionResult
            {
                CourseSectionId = 1, RunId = 1, SemesterId = 1, BaseCourseCode = "12345",
                FacultyId = 10, DepartmentId = 100, IncludedInStats = true,
                DataJson = """{"n_mat":2,"n_diem":30,"r":0.7}""",
            },
            new GradeAnalysisSectionResult
            {
                CourseSectionId = 2, RunId = 1, SemesterId = 1, BaseCourseCode = "12345",
                FacultyId = 10, DepartmentId = 200, IncludedInStats = true,
                DataJson = """{"n_mat":9,"n_diem":40,"r":0.1}""",
            },
            new GradeAnalysisSectionResult
            {
                CourseSectionId = 3, RunId = 1, SemesterId = 1, BaseCourseCode = "12345",
                FacultyId = 20, DepartmentId = 300, IncludedInStats = true,
                DataJson = """{"n_mat":8,"n_diem":50,"r":0.3}""",
            });
        await db.SaveChangesAsync();

        foreach (var scope in new[] { DepartmentManager(100), FacultyManager(10) })
        {
            var service = new EfCourseGradeAnalysisService(db, new FixedScopeResolver(scope));
            (await service.GetCoursesAsync(1, null, null)).Should().BeEmpty();
            (await service.GetSectionsAsync(1, 100, null)).Should().BeEmpty();
        }

        var boardService = new EfCourseGradeAnalysisService(db, new FixedScopeResolver(Board));
        var course = (await boardService.GetCoursesAsync(1, null, null)).Should().ContainSingle().Subject;
        var statistics = course.Data["lop_tk"]!;
        statistics["n_mat"]!.GetValue<int>().Should().Be(2);
        statistics["n_diem"]!.GetValue<int>().Should().Be(30);
        statistics["r"]!.AsArray().Select(r => r!.GetValue<double>()).Should().Equal(0.7);
    }

    [Fact]
    public async Task AdminAndBoard_SeeEverything_IncludingLecturerNames()
    {
        await RunAsync(async (db, s, serviceFor) =>
        {
            var total = await db.GradeAnalysisCourseResults.CountAsync(x => x.RunId == s.RunId && x.SemesterId == s.SemesterId);
            foreach (var scope in new[] { UserScope.Unrestricted(RoleCodes.Admin), Board })
            {
                var service = serviceFor(scope);
                var overview = await service.GetOverviewAsync();
                overview.ViewLevel.Should().Be(CourseGradeViewLevels.Full, scope.RoleCode);
                overview.Terms.Select(t => t.SemesterId).Should().Contain(s.SemesterId);
                overview.Repetition.Should().HaveCount(overview.Terms.Count);

                (await service.GetCoursesAsync(s.SemesterId, null, null)).Should().HaveCount(total);

                var sections = await service.GetSectionsAsync(s.SemesterId, s.DepartmentId, null);
                sections.Should().NotBeEmpty();
                sections.Where(x => x.LecturerId != null).Should().OnlyContain(x => x.LecturerName != null,
                    "Ban giám hiệu cũng xem được tên giảng viên");

                var lecturers = await service.GetLecturerCoursesAsync(null, null);
                lecturers.Should().OnlyContain(x => x.LecturerName != null);
            }
        });
    }

    [Fact]
    public async Task DepartmentManager_SeesOnlyOwnDepartment()
    {
        await RunAsync(async (db, s, serviceFor) =>
        {
            var service = serviceFor(DepartmentManager(s.DepartmentId));
            var overview = await service.GetOverviewAsync();
            overview.ViewLevel.Should().Be(CourseGradeViewLevels.Unit);
            overview.Departments.Should().OnlyContain(d => d.Id == s.DepartmentId);

            var expected = await db.GradeAnalysisCourseResults.CountAsync(x =>
                x.RunId == s.RunId && x.SemesterId == s.SemesterId && x.DepartmentId == s.DepartmentId);
            var courses = await service.GetCoursesAsync(s.SemesterId, null, null);
            courses.Should().HaveCount(expected).And.OnlyContain(c => c.DepartmentId == s.DepartmentId);

            // Hỏi thẳng bộ môn khác: không lộ gì.
            (await service.GetCoursesAsync(s.SemesterId, null, s.OtherDepartmentId)).Should().BeEmpty();
            (await service.GetSectionsAsync(s.SemesterId, s.OtherDepartmentId, null)).Should().BeEmpty();
            (await service.GetLecturerCoursesAsync(s.OtherDepartmentId, null)).Should().BeEmpty();
            (await service.GetLecturerCoursesAsync(null, null)).Should().OnlyContain(x => x.DepartmentId == s.DepartmentId);

            // Lịch sử theo học phần trong phần liên kỳ chỉ có học phần của bộ môn.
            var ownCodes = await db.GradeAnalysisCourseResults
                .Where(x => x.RunId == s.RunId && x.DepartmentId == s.DepartmentId)
                .Select(x => x.BaseCourseCode).Distinct().ToListAsync();
            var historyCodes = overview.CrossTerm!["de_thi"]!.AsObject().Select(x => x.Key);
            historyCodes.Should().OnlyContain(code => ownCodes.Contains(code));
        });
    }

    [Fact]
    public async Task FacultyManager_SeesWholeFaculty()
    {
        await RunAsync(async (db, s, serviceFor) =>
        {
            var service = serviceFor(FacultyManager(s.FacultyId));
            var expected = await db.GradeAnalysisCourseResults.CountAsync(x =>
                x.RunId == s.RunId && x.SemesterId == s.SemesterId && x.FacultyId == s.FacultyId);
            var courses = await service.GetCoursesAsync(s.SemesterId, null, null);
            courses.Should().HaveCount(expected).And.OnlyContain(c => c.FacultyId == s.FacultyId);
            (await service.GetOverviewAsync()).Faculties.Should().OnlyContain(f => f.Id == s.FacultyId);
        });
    }

    [Fact]
    public async Task LecturerAndEmptyScope_AreRejected()
    {
        await RunAsync(async (_, s, serviceFor) =>
        {
            var lecturer = new UserScope(RoleCodes.Lecturer, LecturerId: 5, DepartmentId: s.DepartmentId, FacultyId: null, SeesEverything: false);
            var noDepartment = DepartmentManager(0) with { DepartmentId = null };
            foreach (var scope in new[] { lecturer, noDepartment, UserScope.None })
            {
                var act = () => serviceFor(scope).GetCoursesAsync(s.SemesterId, null, null);
                (await act.Should().ThrowAsync<CourseGradeException>())
                    .Which.ErrorCode.Should().Be(CourseGradeErrorCodes.OutOfScope);
            }
        });
    }

    [Fact]
    public async Task Sections_RequireADepartmentOrCourseFilter()
    {
        await RunAsync(async (_, s, serviceFor) =>
        {
            var act = () => serviceFor(UserScope.Unrestricted(RoleCodes.Admin)).GetSectionsAsync(s.SemesterId, null, null);
            (await act.Should().ThrowAsync<CourseGradeException>())
                .Which.ErrorCode.Should().Be(CourseGradeErrorCodes.InvalidQuery);
        });
    }
}
