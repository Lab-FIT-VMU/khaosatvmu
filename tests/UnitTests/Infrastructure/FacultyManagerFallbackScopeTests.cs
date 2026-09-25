namespace UnitTests.InfrastructureTests;

using Application.Auth;
using Domain;
using FluentAssertions;
using global::Infrastructure.Auth;
using global::Infrastructure.Catalog;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using global::Infrastructure.Surveys;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Xunit;

public sealed class FacultyManagerFallbackScopeTests
{
    [Fact]
    public void EffectiveScopeQuery_IsTranslatableByPostgreSqlProvider()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=translation_only;Username=test;Password=test")
            .Options;
        using var db = new AppDbContext(options);
        var scope = new UserScope(
            RoleCodes.FacultyManager,
            LecturerId: null,
            DepartmentId: 100,
            FacultyId: 10,
            SeesEverything: false);

        var sql = AcademicScopeQuery.SectionSurveysInScope(
                db,
                db.CourseSectionSurveys.AsNoTracking(),
                scope)
            .ToQueryString();

        sql.Should().Contain("CourseSections");
        sql.Should().Contain("Departments");
        sql.Should().Contain("Lecturers");

        AcademicScopeQuery.LecturersInScope(db, db.Lecturers.AsNoTracking(), scope)
            .ToQueryString()
            .Should().Contain("Departments");
    }

    [Fact]
    public async Task MissingCourseFaculty_UsesDepartmentAndLecturerConsistently()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"faculty-scope-{Guid.NewGuid()}")
            .Options;
        await using var db = new AppDbContext(options);

        db.Faculties.AddRange(
            new Faculty { FacultyId = 10, FacultyName = "Own faculty" },
            new Faculty { FacultyId = 20, FacultyName = "Other faculty" });
        db.Departments.Add(new Department
        {
            DepartmentId = 100,
            DepartmentName = "Own department",
            FacultyId = 10,
        });
        db.Lecturers.Add(new Lecturer
        {
            LecturerId = 1000,
            FullName = "Lecturer",
            Email = "lecturer@example.test",
            DepartmentId = 100,
        });
        db.Courses.AddRange(
            new Course { CourseId = 1, CourseCode = "D01", CourseName = "Via department", DepartmentId = 100 },
            new Course { CourseId = 2, CourseCode = "L01", CourseName = "Via lecturer" },
            new Course
            {
                CourseId = 3,
                CourseCode = "X01",
                CourseName = "Explicit other faculty",
                DepartmentId = 100,
                FacultyId = 20,
            });
        db.CourseSections.AddRange(
            new CourseSection { CourseSectionId = 11, CourseId = 1, SemesterId = 1, SectionName = "D01.1" },
            new CourseSection { CourseSectionId = 12, CourseId = 2, SemesterId = 1, SectionName = "L01.1", LecturerId = 1000 },
            new CourseSection { CourseSectionId = 13, CourseId = 3, SemesterId = 1, SectionName = "X01.1" });
        db.CourseSectionSurveys.AddRange(
            SectionSurvey(101, 11),
            SectionSurvey(102, 12),
            SectionSurvey(103, 13));
        await db.SaveChangesAsync();

        var ownFaculty = new UserScope(
            RoleCodes.FacultyManager,
            LecturerId: null,
            DepartmentId: 100,
            FacultyId: 10,
            SeesEverything: false);
        var resolver = new FixedUserScopeResolver(ownFaculty);
        var cache = new MemoryCache(new MemoryCacheOptions());
        var surveys = new EfSurveyService(
            db,
            cache,
            resolver,
            new FixedScoringThresholdProvider(),
            new PublishedSurveyPublicationService(),
            new SchoolOverviewCacheVersion());
        var catalog = new EfCatalogService(db, resolver);

        var list = await surveys.GetCourseSectionSurveysAsync(semesterSurveyId: 1);
        list.Select(x => x.CourseSectionSurveyId).Should().BeEquivalentTo([101, 102]);

        (await surveys.GetCourseSectionSurveyAsync(101)).Succeeded.Should().BeTrue();
        (await surveys.GetCourseSectionSurveyAsync(102)).Succeeded.Should().BeTrue();
        (await surveys.GetSurveyResponsesAsync(101)).Succeeded.Should().BeTrue();
        (await surveys.GetCourseSectionSurveyAsync(103)).Succeeded.Should().BeFalse(
            "an explicit course faculty must take precedence and prevent cross-faculty leakage");

        (await catalog.GetCoursesAsync()).Select(x => x.CourseId).Should().BeEquivalentTo([1, 2]);
        (await catalog.GetCourseSectionsAsync(1)).Select(x => x.CourseSectionId).Should().BeEquivalentTo([11, 12]);
        (await catalog.GetLecturersAsync()).Select(x => x.LecturerId).Should().Equal(1000);
    }

    private static CourseSectionSurvey SectionSurvey(int id, int sectionId) => new()
    {
        CourseSectionSurveyId = id,
        SemesterSurveyId = 1,
        CourseSectionId = sectionId,
        LinkToken = $"token-{id}",
        StartTime = DateTime.UtcNow.AddDays(-1),
        EndTime = DateTime.UtcNow.AddDays(1),
        CreatedAt = DateTime.UtcNow,
    };
}
