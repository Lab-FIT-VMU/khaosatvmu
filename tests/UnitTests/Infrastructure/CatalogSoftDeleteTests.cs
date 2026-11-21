namespace UnitTests.InfrastructureTests;

using Application.Auth;
using Application.Catalog;
using Application.Cohorts;
using Domain;
using FluentAssertions;
using global::Infrastructure.Catalog;
using global::Infrastructure.Cohorts;
using global::Infrastructure.Persistence;
using global::Infrastructure.Surveys;
using global::Infrastructure.Reports;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

// These regressions need real PostgreSQL unique indexes and the soft-delete interceptor.
public sealed class CatalogDatabaseFactAttribute : FactAttribute
{
    public CatalogDatabaseFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")))
            Skip = "Set ConnectionStrings__DefaultConnection to a migrated PostgreSQL test database.";
    }
}

public sealed class CatalogDatabaseTheoryAttribute : TheoryAttribute
{
    public CatalogDatabaseTheoryAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")))
            Skip = "Set ConnectionStrings__DefaultConnection to a migrated PostgreSQL test database.";
    }
}

public sealed class CatalogSoftDeleteTests
{
    private sealed class FixedScope(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) => Task.FromResult(scope);
    }

    private static async Task RunAsync(Func<AppDbContext, EfCatalogService, Task> test)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection"),
        }).Build();
        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
        services.AddPersistence(config);
        await using var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await using var tx = await db.Database.BeginTransactionAsync();
        try
        {
            await DatabaseSeeder.SeedAsync(db, false);
            await test(db, new EfCatalogService(db, new FixedScope(UserScope.Unrestricted(RoleCodes.Admin))));
        }
        finally { await tx.RollbackAsync(); }
    }

    private static async Task<AcademicYearDto> NewYear(EfCatalogService service)
    {
        var result = await service.CreateAcademicYearAsync(new("2180-2181", new DateOnly(2180, 7, 25)));
        result.Succeeded.Should().BeTrue(result.ErrorCode);
        return result.Value!;
    }

    private static SaveCourseCommand CourseCommand(string code) => new(code, "Regression course", 3, "Required", null, null, null);
    private static SaveLecturerCommand LecturerCommand(string email) => new("Regression lecturer", null, null, email, null, null);

    [CatalogDatabaseFact]
    public async Task FacultyWithActiveDepartment_CannotBeDeleted()
    {
        await RunAsync(async (db, service) =>
        {
            var faculty = await service.CreateFacultyAsync(new($"Protected faculty {Guid.NewGuid():N}"));
            var departmentId = (await db.Departments.IgnoreQueryFilters().MaxAsync(x => (int?)x.DepartmentId) ?? 0) + 100;
            var department = await service.CreateDepartmentAsync(new(departmentId, "Protected department", faculty.Value!.FacultyId));
            department.Succeeded.Should().BeTrue(department.ErrorCode);

            var deleted = await service.DeleteFacultyAsync(faculty.Value.FacultyId);
            deleted.ErrorCode.Should().Be(CatalogErrorCodes.FacultyInUse);
            (await db.Faculties.AnyAsync(x => x.FacultyId == faculty.Value.FacultyId)).Should().BeTrue();
            (await db.Departments.AnyAsync(x => x.DepartmentId == departmentId)).Should().BeTrue();
        });
    }

    [CatalogDatabaseFact]
    public async Task MajorAndFacultyWithActiveCohortMajor_CannotBeDeleted()
    {
        await RunAsync(async (db, catalog) =>
        {
            var seed = await SeedCohort(db, catalog);
            var cohorts = new EfCohortService(db);
            var created = await cohorts.CreateCohortMajorAsync(new(seed.CohortId, "Protected cohort major", seed.A.MajorId, 30));
            created.Succeeded.Should().BeTrue(created.ErrorCode);

            (await catalog.DeleteMajorAsync(seed.A.MajorId)).ErrorCode.Should().Be(CatalogErrorCodes.MajorInUse);
            (await catalog.DeleteFacultyAsync(seed.A.FacultyId)).ErrorCode.Should().Be(CatalogErrorCodes.FacultyInUse);
            (await cohorts.GetCohortMajorsAsync(seed.CohortId)).Should().Contain(x => x.CohortMajorId == created.Value!.CohortMajorId);
            (await db.Majors.AnyAsync(x => x.MajorId == seed.A.MajorId)).Should().BeTrue();

            // Once the dependent record is deleted, deleting the major is allowed.
            (await cohorts.DeleteCohortMajorAsync(created.Value!.CohortMajorId)).Succeeded.Should().BeTrue();
            (await catalog.DeleteMajorAsync(seed.A.MajorId)).Succeeded.Should().BeTrue();
        });
    }

    [CatalogDatabaseFact]
    public async Task DepartmentRestore_RequiresActiveParentFaculty()
    {
        await RunAsync(async (db, service) =>
        {
            var faculty = await service.CreateFacultyAsync(new($"Restore faculty {Guid.NewGuid():N}"));
            var departmentId = (await db.Departments.IgnoreQueryFilters().MaxAsync(x => (int?)x.DepartmentId) ?? 0) + 100;
            (await service.CreateDepartmentAsync(new(departmentId, "Restore department", faculty.Value!.FacultyId))).Succeeded.Should().BeTrue();
            (await service.DeleteDepartmentAsync(departmentId)).Succeeded.Should().BeTrue();
            (await service.DeleteFacultyAsync(faculty.Value.FacultyId)).Succeeded.Should().BeTrue();
            db.ChangeTracker.Clear();

            (await service.RestoreDepartmentAsync(departmentId)).ErrorCode.Should().Be(CatalogErrorCodes.FacultyNotFound);
            (await db.Departments.IgnoreQueryFilters().SingleAsync(x => x.DepartmentId == departmentId)).IsDeleted.Should().BeTrue();
            (await service.RestoreFacultyAsync(faculty.Value.FacultyId)).Succeeded.Should().BeTrue();
            (await service.RestoreDepartmentAsync(departmentId)).Succeeded.Should().BeTrue();
        });
    }

    [CatalogDatabaseFact]
    public async Task PositionInUse_CannotBeDeletedUntilLecturerChangesPosition()
    {
        await RunAsync(async (db, service) =>
        {
            var position = await service.CreatePositionAsync(new($"Protected position {Guid.NewGuid():N}"));
            var email = $"regression-{Guid.NewGuid():N}@example.com";
            var lecturer = await service.CreateLecturerAsync(LecturerCommand(email) with { PositionId = position.Value!.PositionId });
            lecturer.Succeeded.Should().BeTrue(lecturer.ErrorCode);

            (await service.DeletePositionAsync(position.Value.PositionId)).ErrorCode.Should().Be(CatalogErrorCodes.PositionInUse);
            (await db.Positions.AnyAsync(x => x.PositionId == position.Value.PositionId)).Should().BeTrue();
            (await service.UpdateLecturerAsync(lecturer.Value!.LecturerId, LecturerCommand(email))).Succeeded.Should().BeTrue();
            (await service.DeletePositionAsync(position.Value.PositionId)).Succeeded.Should().BeTrue();
        });
    }

    [CatalogDatabaseTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DeletedLecturerSessions_StayRevokedAfterRestore(bool alreadyInactive)
    {
        await RunAsync(async (db, service) =>
        {
            var email = $"sessions-{Guid.NewGuid():N}@example.com";
            var lecturer = await service.CreateLecturerAsync(LecturerCommand(email));
            var user = await db.Users.SingleAsync(x => x.LecturerId == lecturer.Value!.LecturerId);
            var userId = user.Id;
            var profileId = await db.UserProfiles.Where(x => x.UserId == userId && x.IsActive).Select(x => x.Id).FirstAsync();
            var sessions = new global::Infrastructure.Auth.EfAuthSessionService(db);
            var first = await sessions.CreateAsync(userId, profileId);
            var second = await sessions.CreateAsync(userId, profileId);
            if (alreadyInactive)
            {
                user.IsActive = false;
                await db.SaveChangesAsync();
            }
            db.ChangeTracker.Clear();

            (await service.DeleteLecturerAsync(lecturer.Value!.LecturerId)).Succeeded.Should().BeTrue();
            var revoked = await db.AuthSessions.AsNoTracking().Where(x => x.UserId == userId).ToListAsync();
            revoked.Should().HaveCount(2).And.OnlyContain(x => x.RevokedAt != null && x.RevokedReason == "LECTURER_DELETED");
            db.ChangeTracker.Clear();
            (await service.RestoreLecturerByEmailAsync(email)).Succeeded.Should().BeTrue();
            (await sessions.ValidateAsync(first.Id, userId, profileId)).Should().BeFalse();
            (await sessions.ValidateAsync(second.Id, userId, profileId)).Should().BeFalse();
            var fresh = await sessions.CreateAsync(userId, profileId);
            (await sessions.ValidateAsync(fresh.Id, userId, profileId)).Should().BeTrue();
        });
    }

    private sealed record Entry(int Id, bool Succeeded, string? Error);
    private static Entry EntryOf<T>(CatalogOperationResult<T> result, Func<T, int> id) =>
        new(result.Succeeded ? id(result.Value!) : 0, result.Succeeded, result.ErrorCode);

    [CatalogDatabaseTheory]
    [InlineData("position")]
    [InlineData("course")]
    [InlineData("year")]
    [InlineData("semester")]
    [InlineData("section")]
    public async Task DeletedKeys_CanBeReused_AndRestoringTheOldRecordReturnsConflict(string kind)
    {
        await RunAsync(async (db, service) =>
        {
            var key = $"regression-{Guid.NewGuid():N}";
            Func<Task<Entry>> create;
            Func<int, Task<CatalogOperationResult<bool>>> delete;
            Func<int, Task<Entry>>? restore = null;
            string conflict;
            if (kind == "position")
            {
                create = async () => EntryOf(await service.CreatePositionAsync(new(key)), x => x.PositionId);
                delete = id => service.DeletePositionAsync(id);
                conflict = CatalogErrorCodes.PositionNameExists;
            }
            else if (kind == "course")
            {
                create = async () => EntryOf(await service.CreateCourseAsync(CourseCommand(key)), x => x.CourseId);
                delete = id => service.DeleteCourseAsync(id);
                restore = async id => EntryOf(await service.RestoreCourseAsync(id), x => x.CourseId);
                conflict = CatalogErrorCodes.CourseCodeExists;
            }
            else if (kind == "year")
            {
                create = async () => EntryOf(await service.CreateAcademicYearAsync(new("2180-2181", new DateOnly(2180, 7, 25))), x => x.AcademicYearId);
                delete = id => service.DeleteAcademicYearAsync(id);
                restore = async id => EntryOf(await service.RestoreAcademicYearAsync(id), x => x.AcademicYearId);
                conflict = CatalogErrorCodes.AcademicYearNameExists;
            }
            else
            {
                var year = await NewYear(service);
                if (kind == "semester")
                {
                    create = async () => EntryOf(await service.CreateSemesterAsync(new(key, year.AcademicYearId)), x => x.SemesterId);
                    delete = id => service.DeleteSemesterAsync(id);
                    restore = async id => EntryOf(await service.RestoreSemesterAsync(id), x => x.SemesterId);
                    conflict = CatalogErrorCodes.SemesterNameExists;
                }
                else
                {
                    var course = await service.CreateCourseAsync(CourseCommand(key));
                    var command = new SaveCourseSectionCommand(course.Value!.CourseId, year.Semesters.First().SemesterId, null, key, 10, null);
                    create = async () => EntryOf(await service.CreateCourseSectionAsync(command), x => x.CourseSectionId);
                    delete = id => service.DeleteCourseSectionAsync(id);
                    restore = async id => EntryOf(await service.RestoreCourseSectionAsync(id), x => x.CourseSectionId);
                    conflict = CatalogErrorCodes.CourseSectionExists;
                }
            }

            var first = await create();
            first.Succeeded.Should().BeTrue(first.Error);
            var duplicate = await create();
            duplicate.Succeeded.Should().BeFalse();
            duplicate.Error.Should().Be(conflict);
            db.ChangeTracker.Clear();
            (await delete(first.Id)).Succeeded.Should().BeTrue();
            db.ChangeTracker.Clear();
            var replacement = await create();
            replacement.Succeeded.Should().BeTrue(replacement.Error);
            replacement.Id.Should().NotBe(first.Id);
            if (restore is not null)
            {
                db.ChangeTracker.Clear();
                var restored = await restore(first.Id);
                restored.Succeeded.Should().BeFalse();
                restored.Error.Should().Be(conflict);
            }
        });
    }

    [CatalogDatabaseFact]
    public async Task YearCreation_RetiresEmptyLegacyCohortOfDeletedYear()
    {
        await RunAsync(async (db, service) =>
        {
            var oldYear = new AcademicYear { AcademicYearName = "2180-2181", StartDate = new(2180, 7, 25), EndDate = new(2181, 7, 24), IsDeleted = true, DeletedAt = DateTime.UtcNow.AddDays(-1) };
            db.AcademicYears.Add(oldYear);
            await db.SaveChangesAsync();
            var oldCohort = new Cohort { AcademicYearId = oldYear.AcademicYearId, CohortCode = CohortCodeRules.FromAcademicYearName(oldYear.AcademicYearName), CohortName = "Legacy cohort" };
            db.Cohorts.Add(oldCohort);
            await db.SaveChangesAsync();
            db.ChangeTracker.Clear();
            var year = await NewYear(service);
            year.AcademicYearId.Should().NotBe(oldYear.AcademicYearId);
            (await db.Cohorts.IgnoreQueryFilters().SingleAsync(x => x.CohortId == oldCohort.CohortId)).IsDeleted.Should().BeTrue();
            (await db.Cohorts.SingleAsync(x => x.AcademicYearId == year.AcademicYearId)).CohortCode.Should().Be(oldCohort.CohortCode);
        });
    }

    [CatalogDatabaseFact]
    public async Task YearRestore_RestoresOnlyChildrenDeletedWithTheYear()
    {
        await RunAsync(async (db, service) =>
        {
            var year = await NewYear(service);
            var previous = await db.Semesters.SingleAsync(x => x.SemesterId == year.Semesters.First().SemesterId);
            previous.IsDeleted = true;
            previous.DeletedAt = DateTime.UtcNow.AddDays(-1);
            await db.SaveChangesAsync();
            var course = await service.CreateCourseAsync(CourseCommand($"regression-{Guid.NewGuid():N}"));
            var section = await service.CreateCourseSectionAsync(new(course.Value!.CourseId, year.Semesters.Last().SemesterId, null, "Restored section", 10, null));
            db.ChangeTracker.Clear();
            (await service.DeleteAcademicYearAsync(year.AcademicYearId)).Succeeded.Should().BeTrue();
            (await db.Cohorts.AnyAsync(x => x.AcademicYearId == year.AcademicYearId)).Should().BeFalse();
            db.ChangeTracker.Clear();
            var restored = await service.RestoreAcademicYearAsync(year.AcademicYearId);
            restored.Succeeded.Should().BeTrue(restored.ErrorCode);
            restored.Value!.Semesters.Should().HaveCount(2);
            (await db.Semesters.CountAsync(x => x.AcademicYearId == year.AcademicYearId)).Should().Be(2);
            (await db.Cohorts.CountAsync(x => x.AcademicYearId == year.AcademicYearId)).Should().Be(1);
            (await db.CourseSections.AnyAsync(x => x.CourseSectionId == section.Value!.CourseSectionId)).Should().BeTrue();
            (await db.Semesters.IgnoreQueryFilters().SingleAsync(x => x.SemesterId == previous.SemesterId)).IsDeleted.Should().BeTrue();
        });
    }

    [CatalogDatabaseFact]
    public async Task SemesterRestore_RestoresItsSections()
    {
        await RunAsync(async (db, service) =>
        {
            var year = await NewYear(service);
            var semester = year.Semesters.First();
            var course = await service.CreateCourseAsync(CourseCommand($"regression-{Guid.NewGuid():N}"));
            var section = await service.CreateCourseSectionAsync(new(course.Value!.CourseId, semester.SemesterId, null, "Section", 10, null));
            db.ChangeTracker.Clear();
            (await service.DeleteSemesterAsync(semester.SemesterId)).Succeeded.Should().BeTrue();
            db.ChangeTracker.Clear();
            (await service.RestoreSemesterAsync(semester.SemesterId)).Succeeded.Should().BeTrue();
            (await db.CourseSections.AnyAsync(x => x.CourseSectionId == section.Value!.CourseSectionId)).Should().BeTrue();
        });
    }

    [CatalogDatabaseTheory]
    [InlineData("survey")]
    [InlineData("cohortMajor")]
    [InlineData("graduation")]
    public async Task YearDelete_WithBusinessDependents_IsRejected(string kind)
    {
        await RunAsync(async (db, service) =>
        {
            var year = await NewYear(service);
            if (kind == "survey") await AddSurvey(db, year.Semesters.First().SemesterId);
            else if (kind == "graduation")
                db.GraduationRounds.Add(new() { AcademicYearId = year.AcademicYearId, RoundNumber = 1, CreatedAt = DateTime.UtcNow });
            else
            {
                var faculty = await service.CreateFacultyAsync(new($"Faculty {Guid.NewGuid():N}"));
                var major = await service.CreateMajorAsync(new($"{Guid.NewGuid():N}"[..10], "Regression major", faculty.Value!.FacultyId));
                var cohort = await db.Cohorts.SingleAsync(x => x.AcademicYearId == year.AcademicYearId);
                db.CohortMajors.Add(new() { CohortId = cohort.CohortId, MajorId = major.Value!.MajorId, CohortMajorCode = "Regression class" });
            }
            await db.SaveChangesAsync();
            db.ChangeTracker.Clear();
            var result = await service.DeleteAcademicYearAsync(year.AcademicYearId);
            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(CatalogErrorCodes.AcademicYearInUse);
            (await db.AcademicYears.AnyAsync(x => x.AcademicYearId == year.AcademicYearId)).Should().BeTrue();
            (await db.Semesters.CountAsync(x => x.AcademicYearId == year.AcademicYearId)).Should().Be(3);
        });
    }

    [CatalogDatabaseFact]
    public async Task SemesterDelete_WithSurvey_IsRejected()
    {
        await RunAsync(async (db, service) =>
        {
            var year = await NewYear(service);
            var semesterId = year.Semesters.First().SemesterId;
            await AddSurvey(db, semesterId);
            db.ChangeTracker.Clear();
            var result = await service.DeleteSemesterAsync(semesterId);
            result.ErrorCode.Should().Be(CatalogErrorCodes.SemesterInUse);
            (await db.Semesters.AnyAsync(x => x.SemesterId == semesterId)).Should().BeTrue();
        });
    }

    [CatalogDatabaseTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DeletedLecturerEmail_RestoresExplicitlyOrByImport_AndKeepsAccountAndProfiles(bool byImport)
    {
        await RunAsync(async (db, service) =>
        {
            var email = $"regression-{Guid.NewGuid():N}@example.com";
            var first = await service.CreateLecturerAsync(LecturerCommand(email));
            first.Succeeded.Should().BeTrue(first.ErrorCode);
            var lecturerId = first.Value!.LecturerId;
            var account = await db.Users.SingleAsync(x => x.LecturerId == lecturerId);
            var userId = account.Id;
            var profileIds = await db.UserProfiles.Where(x => x.UserId == userId).Select(x => x.Id).ToListAsync();
            profileIds.Should().NotBeEmpty();
            db.ChangeTracker.Clear();
            (await service.DeleteLecturerAsync(lecturerId)).Succeeded.Should().BeTrue();
            db.ChangeTracker.Clear();
            (await service.CreateLecturerAsync(LecturerCommand(email.ToUpperInvariant()))).ErrorCode
                .Should().Be(CatalogErrorCodes.LecturerEmailDeleted);
            (await db.Users.SingleAsync(x => x.Id == userId)).IsActive.Should().BeFalse();
            db.ChangeTracker.Clear();
            if (byImport)
            {
                var imported = await service.ImportLecturersAsync([
                    new(1, "Updated lecturer", email.ToUpperInvariant(), "0123456789", null, null, null),
                    new(2, "Duplicate", email, null, null, null, null)]);
                imported.Succeeded.Should().BeTrue(imported.ErrorCode);
                imported.Value!.CreatedCount.Should().Be(1);
                imported.Value.SkippedCount.Should().Be(1);
                imported.Value.Items.First().Succeeded.Should().BeTrue();
                imported.Value.Items.Last().ErrorCode.Should().Be(CatalogErrorCodes.LecturerEmailDuplicateInFile);
                var lecturer = await db.Lecturers.SingleAsync(x => x.LecturerId == lecturerId);
                lecturer.FullName.Should().Be("Updated lecturer");
                lecturer.PhoneNumber.Should().Be("0123456789");
                lecturer.DeletedAt.Should().BeNull();
                (await db.Lecturers.IgnoreQueryFilters().CountAsync(x => x.Email.ToLower() == email)).Should().Be(1);
            }
            else
            {
                var restored = await service.RestoreLecturerByEmailAsync(email.ToUpperInvariant());
                restored.Succeeded.Should().BeTrue(restored.ErrorCode);
                restored.Value!.LecturerId.Should().Be(lecturerId);
            }
            (await db.Users.SingleAsync(x => x.LecturerId == lecturerId)).Id.Should().Be(userId);
            (await db.Users.SingleAsync(x => x.Id == userId)).IsActive.Should().BeTrue();
            (await db.UserProfiles.Where(x => x.UserId == userId).Select(x => x.Id).ToListAsync()).Should().BeEquivalentTo(profileIds);
            (await service.CreateLecturerAsync(LecturerCommand(email))).ErrorCode.Should().Be(CatalogErrorCodes.LecturerEmailExists);
        });
    }

    [CatalogDatabaseFact]
    public async Task InvalidLecturerImport_DoesNotRestoreDeletedLecturerOrAccount()
    {
        await RunAsync(async (db, service) =>
        {
            var email = $"regression-{Guid.NewGuid():N}@example.com";
            var first = await service.CreateLecturerAsync(LecturerCommand(email));
            first.Succeeded.Should().BeTrue(first.ErrorCode);
            var lecturerId = first.Value!.LecturerId;
            db.ChangeTracker.Clear();
            (await service.DeleteLecturerAsync(lecturerId)).Succeeded.Should().BeTrue();
            db.ChangeTracker.Clear();

            var imported = await service.ImportLecturersAsync([
                new(1, "Updated lecturer", email, null, $"missing-{Guid.NewGuid():N}", null, null)]);
            imported.Value!.CreatedCount.Should().Be(0);
            imported.Value.Items.Single().ErrorCode.Should().Be(CatalogErrorCodes.FacultyNotFound);
            (await db.Lecturers.IgnoreQueryFilters().SingleAsync(x => x.LecturerId == lecturerId)).IsDeleted.Should().BeTrue();
            (await db.Users.SingleAsync(x => x.LecturerId == lecturerId)).IsActive.Should().BeFalse();
        });
    }

    [CatalogDatabaseFact]
    public async Task LecturerRestoreByEmail_IsAdminOnly()
    {
        await RunAsync(async (db, service) =>
        {
            var email = $"regression-{Guid.NewGuid():N}@example.com";
            var first = await service.CreateLecturerAsync(LecturerCommand(email));
            db.ChangeTracker.Clear();
            await service.DeleteLecturerAsync(first.Value!.LecturerId);
            var restricted = new EfCatalogService(db, new FixedScope(new(RoleCodes.DepartmentManager, 1, 1, null, false)));
            (await restricted.RestoreLecturerByEmailAsync(email)).ErrorCode.Should().Be(CatalogErrorCodes.OutOfScope);
            (await db.Lecturers.AnyAsync(x => x.LecturerId == first.Value.LecturerId)).Should().BeFalse();
        });
    }

    [CatalogDatabaseFact]
    public async Task SectionImport_RestoresArchivedEmail_AndResolutionReusesIt()
    {
        await RunAsync(async (db, service) =>
        {
            var year = await NewYear(service);
            var email = $"regression-{Guid.NewGuid():N}@example.com";
            var lecturer = await service.CreateLecturerAsync(LecturerCommand(email));
            var userId = (await db.Users.SingleAsync(x => x.LecturerId == lecturer.Value!.LecturerId)).Id;
            db.ChangeTracker.Clear();
            await service.DeleteLecturerAsync(lecturer.Value!.LecturerId);
            var newCode = $"regression-{Guid.NewGuid():N}";
            var imported = await service.ImportCourseSectionsAsync(year.Semesters.First().SemesterId,
                [new(1, newCode, "New course", "Section", "3", "10", null, null, null, "Regression", email)]);
            imported.Succeeded.Should().BeTrue(imported.ErrorCode);
            imported.Value!.Items.Single().Succeeded.Should().BeTrue();
            imported.Value.CreatedLecturerCount.Should().Be(1);
            (await db.Users.SingleAsync(x => x.Id == userId)).IsActive.Should().BeTrue();
            var normalizedCode = newCode.ToUpperInvariant();
            var importedCourse = await db.Courses.SingleAsync(x => x.CourseCode == normalizedCode);
            (await db.CourseSections.SingleAsync(x => x.CourseId == importedCourse.CourseId)).LecturerId
                .Should().Be(lecturer.Value!.LecturerId);

            var repeated = await service.ImportCourseSectionsAsync(year.Semesters.First().SemesterId,
                [new(1, newCode, "New course", "Section", "3", "10", null, null, null, "Regression", email)]);
            repeated.Value!.CreatedCount.Should().Be(0);
            repeated.Value.CreatedLecturerCount.Should().Be(0);

            var section = await service.CreateCourseSectionAsync(new(importedCourse.CourseId,
                year.Semesters.First().SemesterId, null, "Unidentified", 10, "Regression"));
            var resolved = await service.ResolveUnidentifiedLecturerAsync(section.Value!.CourseSectionId,
                new("Regression", email, null, null));
            resolved.Succeeded.Should().BeTrue(resolved.ErrorCode);
            (await db.CourseSections.SingleAsync(x => x.CourseSectionId == section.Value.CourseSectionId))
                .LecturerId.Should().Be(lecturer.Value.LecturerId);
        });
    }

    [CatalogDatabaseFact]
    public async Task SectionImport_SkippedRowsDoNotCreateCoursesOrLecturers()
    {
        await RunAsync(async (db, service) =>
        {
            var year = await NewYear(service);
            var rejectedCode = $"regression-{Guid.NewGuid():N}";
            var acceptedCode = $"regression-{Guid.NewGuid():N}";
            var email = $"regression-{Guid.NewGuid():N}@example.com";
            var duplicateEmail = $"regression-{Guid.NewGuid():N}@example.com";
            var result = await service.ImportCourseSectionsAsync(year.Semesters.First().SemesterId, [
                new(1, rejectedCode, "Rejected course", "A", "3", "10", null, null, null, "", email),
                new(2, acceptedCode, "Accepted course", "A", "3", "10", null, null, null, "Accepted", email),
                new(3, acceptedCode, "Accepted course", " a ", "3", "10", null, null, null, "Duplicate", duplicateEmail)]);
            result.Succeeded.Should().BeTrue(result.ErrorCode);
            result.Value!.CreatedCount.Should().Be(1);
            result.Value.CreatedCourseCount.Should().Be(1);
            result.Value.CreatedLecturerCount.Should().Be(1);
            result.Value.Items[0].ErrorCode.Should().Be(CatalogErrorCodes.LecturerNameRequired);
            result.Value.Items[2].ErrorCode.Should().Be(CatalogErrorCodes.CourseSectionDuplicateInFile);
            (await db.Courses.AnyAsync(x => x.CourseCode == rejectedCode)).Should().BeFalse();
            (await db.Lecturers.AnyAsync(x => x.Email == duplicateEmail)).Should().BeFalse();
            (await db.Users.AnyAsync(x => x.Email == duplicateEmail)).Should().BeFalse();

            var again = await service.ImportCourseSectionsAsync(year.Semesters.First().SemesterId,
                [new(1, acceptedCode, "Accepted course", "A", "3", "10", null, null, null, "Other", duplicateEmail)]);
            again.Value!.Items.Single().ErrorCode.Should().Be(CatalogErrorCodes.CourseSectionExists);
            (await db.Lecturers.AnyAsync(x => x.Email == duplicateEmail)).Should().BeFalse();
        });
    }

    [CatalogDatabaseFact]
    public async Task LecturerImport_InvalidFirstRowDoesNotBlockValidRowWithSameEmail()
    {
        await RunAsync(async (db, service) =>
        {
            var email = $"regression-{Guid.NewGuid():N}@example.com";
            var result = await service.ImportLecturersAsync([
                new(1, "Invalid", email, null, $"missing-{Guid.NewGuid():N}", null, null),
                new(2, "Accepted", email, null, null, null, null)]);
            result.Value!.CreatedCount.Should().Be(1);
            result.Value.Items[0].ErrorCode.Should().Be(CatalogErrorCodes.FacultyNotFound);
            result.Value.Items[1].Succeeded.Should().BeTrue();
        });
    }

    [CatalogDatabaseTheory]
    [InlineData("bad-email", "Regression", CatalogErrorCodes.LecturerEmailInvalid)]
    [InlineData("Display Name <somebody@example.com>", "Regression", CatalogErrorCodes.LecturerEmailInvalid)]
    [InlineData("", "Regression", CatalogErrorCodes.LecturerEmailRequired)]
    public async Task LecturerImport_RejectsInvalidEmails(string email, string name, string expected)
    {
        await RunAsync(async (db, service) =>
        {
            var result = await service.ImportLecturersAsync([new(1, name, email, null, null, null, null)]);
            result.Value!.CreatedCount.Should().Be(0);
            result.Value.Items.Single().ErrorCode.Should().Be(expected);
        });
    }

    [CatalogDatabaseFact]
    public async Task SectionImport_InvalidEmailOrLongNameDoesNotCreateAuxiliaryData()
    {
        await RunAsync(async (db, service) =>
        {
            var year = await NewYear(service);
            var code = $"regression-{Guid.NewGuid():N}";
            var result = await service.ImportCourseSectionsAsync(year.Semesters.First().SemesterId, [
                new(1, code, "Course", "A", "3", "10", null, null, null, "Lecturer", "bad-email"),
                new(2, code, "Course", "B", "3", "10", null, null, null, new string('x', 201), "valid@example.com")]);
            result.Value!.CreatedCount.Should().Be(0);
            result.Value.Items[0].ErrorCode.Should().Be(CatalogErrorCodes.LecturerEmailInvalid);
            result.Value.Items[1].ErrorCode.Should().Be(CatalogErrorCodes.LecturerNameTooLong);
            (await db.Courses.AnyAsync(x => x.CourseCode == code)).Should().BeFalse();
        });
    }

    [CatalogDatabaseFact]
    public async Task UpdatingLecturerToAnArchivedEmail_DoesNotChangeItsAccount()
    {
        await RunAsync(async (db, service) =>
        {
            var email = $"regression-{Guid.NewGuid():N}@example.com";
            var old = await service.CreateLecturerAsync(LecturerCommand(email));
            db.ChangeTracker.Clear();
            await service.DeleteLecturerAsync(old.Value!.LecturerId);
            var otherEmail = $"regression-{Guid.NewGuid():N}@example.com";
            var other = await service.CreateLecturerAsync(LecturerCommand(otherEmail));
            var updated = await service.UpdateLecturerAsync(other.Value!.LecturerId, LecturerCommand(email));
            updated.ErrorCode.Should().Be(CatalogErrorCodes.LecturerEmailDeleted);
            (await db.Users.SingleAsync(x => x.LecturerId == other.Value.LecturerId)).Email.Should().Be(otherEmail);
            (await db.Lecturers.SingleAsync(x => x.LecturerId == other.Value.LecturerId)).Email.Should().Be(otherEmail);
        });
    }

    [CatalogDatabaseFact]
    public async Task RestoringWithADeletedParent_IsRejected()
    {
        await RunAsync(async (db, service) =>
        {
            var year = await NewYear(service);
            var semesterId = year.Semesters.First().SemesterId;
            db.ChangeTracker.Clear();
            await service.DeleteAcademicYearAsync(year.AcademicYearId);
            (await service.RestoreSemesterAsync(semesterId)).ErrorCode.Should().Be(CatalogErrorCodes.AcademicYearNotFound);
            (await db.Semesters.AnyAsync(x => x.SemesterId == semesterId)).Should().BeFalse();
        });
    }

    [CatalogDatabaseTheory]
    [InlineData("faculty")]
    [InlineData("major")]
    public async Task RestoringReplacedFacultyOrMajor_ReturnsConflict(string kind)
    {
        await RunAsync(async (db, service) =>
        {
            var key = $"Regression {Guid.NewGuid():N}";
            var faculty = await service.CreateFacultyAsync(new(key));
            if (kind == "faculty")
            {
                db.ChangeTracker.Clear();
                await service.DeleteFacultyAsync(faculty.Value!.FacultyId);
                await service.CreateFacultyAsync(new(key));
                (await service.RestoreFacultyAsync(faculty.Value.FacultyId)).ErrorCode.Should().Be(CatalogErrorCodes.FacultyNameExists);
            }
            else
            {
                var code = Guid.NewGuid().ToString("N")[..10];
                var major = await service.CreateMajorAsync(new(code, key, faculty.Value!.FacultyId));
                db.ChangeTracker.Clear();
                await service.DeleteMajorAsync(major.Value!.MajorId);
                await service.CreateMajorAsync(new(code, key, faculty.Value.FacultyId));
                (await service.RestoreMajorAsync(major.Value.MajorId)).ErrorCode.Should().Be(CatalogErrorCodes.MajorCodeExists);
            }
        });
    }

    [CatalogDatabaseFact]
    public async Task Database_StillRejectsTwoActiveCourseCodes()
    {
        await RunAsync(async (db, service) =>
        {
            var code = $"regression-{Guid.NewGuid():N}";
            (await service.CreateCourseAsync(CourseCommand(code))).Succeeded.Should().BeTrue();
            db.Courses.Add(new() { CourseCode = code, CourseName = "Duplicate", Credits = 3, CourseType = "Required" });
            var save = () => db.SaveChangesAsync();
            await save.Should().ThrowAsync<DbUpdateException>();
        });
    }

    [CatalogDatabaseTheory]
    [InlineData("major")]
    [InlineData("faculty")]
    public async Task CohortImport_RejectsAliasesOfDeletedCatalogEntries(string deleted)
    {
        await RunAsync(async (db, catalog) =>
        {
            var seed = await SeedCohort(db, catalog);
            var alias = $"old-alias-{Guid.NewGuid():N}";
            db.MajorImportAliases.Add(new() { MajorId = seed.A.MajorId, Alias = alias, NormalizedAlias = alias });
            await db.SaveChangesAsync();
            db.ChangeTracker.Clear();
            if (deleted == "major") (await db.Majors.SingleAsync(x => x.MajorId == seed.A.MajorId)).IsDeleted = true;
            else (await db.Faculties.SingleAsync(x => x.FacultyId == seed.A.FacultyId)).IsDeleted = true;
            await db.SaveChangesAsync();
            var result = await new EfCohortService(db).ImportCohortMajorsAsync(seed.CohortId, [new(1, "Class A", alias, 10)]);
            result.Succeeded.Should().BeTrue();
            result.Value!.CreatedCount.Should().Be(0);
            result.Value.Items.Single().ErrorCode.Should().Be(CohortErrorCodes.MajorNotFound);
            (await db.CohortMajors.AnyAsync(x => x.CohortId == seed.CohortId)).Should().BeFalse();
        });
    }

    [CatalogDatabaseFact]
    public async Task CohortImport_DuplicateUpdateIsSkipped_WhileValidRowsAreSaved()
    {
        await RunAsync(async (db, catalog) =>
        {
            var seed = await SeedCohort(db, catalog);
            var service = new EfCohortService(db);
            await service.CreateCohortMajorAsync(new(seed.CohortId, "Class A", seed.A.MajorId, 10));
            await service.CreateCohortMajorAsync(new(seed.CohortId, "Class B", seed.B.MajorId, 20));
            var result = await service.ImportCohortMajorsAsync(seed.CohortId,
                [new(1, "Class A", seed.B.MajorName, 99), new(2, "Class C", seed.C.MajorName, 30)]);
            result.Value!.CreatedCount.Should().Be(1);
            result.Value.UpdatedCount.Should().Be(0);
            result.Value.Items.First().ErrorCode.Should().Be(CohortErrorCodes.CohortMajorExists);
            var original = await db.CohortMajors.SingleAsync(x => x.CohortId == seed.CohortId && x.CohortMajorCode == "Class A");
            original.MajorId.Should().Be(seed.A.MajorId);
            original.StudentCount.Should().Be(10);
            (await service.GetCohortMajorsAsync(seed.CohortId)).Should().HaveCount(3);
        });
    }

    [CatalogDatabaseFact]
    public async Task CohortImport_CanReuseKeysReleasedEarlierInTheBatch()
    {
        await RunAsync(async (db, catalog) =>
        {
            var seed = await SeedCohort(db, catalog);
            var service = new EfCohortService(db);
            await service.CreateCohortMajorAsync(new(seed.CohortId, "Class A", seed.A.MajorId, 10));
            await service.CreateCohortMajorAsync(new(seed.CohortId, "Class B", seed.B.MajorId, 20));
            db.ChangeTracker.Clear();
            var result = await service.ImportCohortMajorsAsync(seed.CohortId,
                [new(1, "Class A", seed.C.MajorName, 30), new(2, "Class B", seed.A.MajorName, 10), new(3, "Class C", seed.B.MajorName, 20)]);
            result.Value!.CreatedCount.Should().Be(1);
            result.Value.UpdatedCount.Should().Be(2);
            result.Value.SkippedCount.Should().Be(0);
            db.ChangeTracker.Clear();
            var rows = await db.CohortMajors.Where(x => x.CohortId == seed.CohortId).ToDictionaryAsync(x => x.CohortMajorCode);
            rows["Class A"].MajorId.Should().Be(seed.C.MajorId);
            rows["Class B"].MajorId.Should().Be(seed.A.MajorId);
            rows["Class C"].MajorId.Should().Be(seed.B.MajorId);
        });
    }

    [CatalogDatabaseFact]
    public async Task FacultyRestore_RestoresOnlyMajorsDeletedWithIt()
    {
        await RunAsync(async (db, catalog) =>
        {
            var seed = await SeedCohort(db, catalog);
            var old = await db.Majors.SingleAsync(x => x.MajorId == seed.A.MajorId);
            old.IsDeleted = true; old.DeletedAt = DateTime.UtcNow.AddDays(-1);
            await db.SaveChangesAsync(); db.ChangeTracker.Clear();
            (await catalog.DeleteFacultyAsync(seed.A.FacultyId)).Succeeded.Should().BeTrue();
            db.ChangeTracker.Clear();
            var result = await catalog.RestoreFacultyAsync(seed.A.FacultyId);
            result.Succeeded.Should().BeTrue(result.ErrorCode);
            (await db.Majors.CountAsync(x => x.FacultyId == seed.A.FacultyId)).Should().Be(2);
            (await db.Majors.IgnoreQueryFilters().SingleAsync(x => x.MajorId == seed.A.MajorId)).IsDeleted.Should().BeTrue();
        });
    }

    [CatalogDatabaseFact]
    public async Task FacultyRestore_WithConflictingChildCode_DoesNotPartiallyRestore()
    {
        await RunAsync(async (db, catalog) =>
        {
            var seed = await SeedCohort(db, catalog);
            db.ChangeTracker.Clear();
            await catalog.DeleteFacultyAsync(seed.A.FacultyId);
            var other = await catalog.CreateFacultyAsync(new($"Other {Guid.NewGuid():N}"));
            await catalog.CreateMajorAsync(new(seed.A.MajorCode, "Replacement", other.Value!.FacultyId));
            var result = await catalog.RestoreFacultyAsync(seed.A.FacultyId);
            result.ErrorCode.Should().Be(CatalogErrorCodes.MajorCodeExists);
            (await db.Faculties.AnyAsync(x => x.FacultyId == seed.A.FacultyId)).Should().BeFalse();
            (await db.Majors.AnyAsync(x => x.FacultyId == seed.A.FacultyId)).Should().BeFalse();
        });
    }

    [CatalogDatabaseFact]
    public async Task SectionRestore_RestoresOnlyLinksDeletedWithIt()
    {
        await RunAsync(async (db, catalog) =>
        {
            var year = await NewYear(catalog);
            var semesterId = year.Semesters.First().SemesterId;
            var course = await catalog.CreateCourseAsync(CourseCommand(Guid.NewGuid().ToString("N")));
            var section = await catalog.CreateCourseSectionAsync(new(course.Value!.CourseId, semesterId, null, "Restore", 10, null));
            await AddSurvey(db, semesterId); await AddSurvey(db, semesterId);
            var campaigns = await db.SemesterSurveys.Where(x => x.SemesterId == semesterId).ToListAsync();
            var links = campaigns.Select(x => new CourseSectionSurvey { SemesterSurveyId = x.SemesterSurveyId,
                CourseSectionId = section.Value!.CourseSectionId, LinkToken = Guid.NewGuid().ToString("N"), StartTime = x.StartTime, EndTime = x.EndTime, CreatedAt = DateTime.UtcNow }).ToList();
            links[0].IsDeleted = true; links[0].DeletedAt = DateTime.UtcNow.AddDays(-1);
            db.AddRange(links); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
            (await catalog.DeleteCourseSectionAsync(section.Value!.CourseSectionId)).Succeeded.Should().BeTrue();
            db.ChangeTracker.Clear();
            (await catalog.RestoreCourseSectionAsync(section.Value.CourseSectionId)).Succeeded.Should().BeTrue();
            (await db.CourseSectionSurveys.Where(x => x.CourseSectionId == section.Value.CourseSectionId).Select(x => x.CourseSectionSurveyId).ToListAsync())
                .Should().Equal(links[1].CourseSectionSurveyId);
        });
    }

    [CatalogDatabaseTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CampaignRestore_RestoresLinks_AndRejectsDeletedParents(bool deleteTemplate)
    {
        await RunAsync(async (db, catalog) =>
        {
            var year = await NewYear(catalog);
            var semesterId = year.Semesters.First().SemesterId;
            var course = await catalog.CreateCourseAsync(CourseCommand(Guid.NewGuid().ToString("N")));
            var section = await catalog.CreateCourseSectionAsync(new(course.Value!.CourseId, semesterId, null, "Restore", 10, null));
            await AddSurvey(db, semesterId);
            var campaign = await db.SemesterSurveys.SingleAsync(x => x.SemesterId == semesterId);
            var link = new CourseSectionSurvey { SemesterSurveyId = campaign.SemesterSurveyId,
                CourseSectionId = section.Value!.CourseSectionId, LinkToken = Guid.NewGuid().ToString("N"), StartTime = campaign.StartTime, EndTime = campaign.EndTime, CreatedAt = DateTime.UtcNow };
            db.Add(link); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
            using var cache = new MemoryCache(new MemoryCacheOptions());
            var service = new EfSurveyService(db, cache, new FixedScope(UserScope.Unrestricted(RoleCodes.Admin)),
                new FixedScoringThresholdProvider(), new PublishedSurveyPublicationService(), new SchoolOverviewCacheVersion());
            (await service.DeleteSemesterSurveyAsync(campaign.SemesterSurveyId)).Succeeded.Should().BeTrue();
            db.ChangeTracker.Clear();
            if (deleteTemplate)
            {
                (await db.SurveyTemplates.SingleAsync(x => x.SurveyTemplateId == campaign.SurveyTemplateId)).IsDeleted = true;
                await db.SaveChangesAsync();
            }
            var restored = await service.RestoreSemesterSurveyAsync(campaign.SemesterSurveyId);
            restored.Succeeded.Should().Be(!deleteTemplate);
            if (deleteTemplate) restored.ErrorCode.Should().Be(Application.Surveys.SurveyErrorCodes.TemplateNotFound);
            (await db.CourseSectionSurveys.AnyAsync(x => x.CourseSectionSurveyId == link.CourseSectionSurveyId)).Should().Be(!deleteTemplate);
        });
    }

    private static async Task<(int CohortId, MajorDto A, MajorDto B, MajorDto C)> SeedCohort(AppDbContext db, EfCatalogService catalog)
    {
        var year = await NewYear(catalog);
        var faculty = await catalog.CreateFacultyAsync(new($"Regression {Guid.NewGuid():N}"));
        async Task<MajorDto> Major(string name) => (await catalog.CreateMajorAsync(new(Guid.NewGuid().ToString("N")[..10],
            $"{name} {Guid.NewGuid():N}", faculty.Value!.FacultyId))).Value!;
        var a = await Major("Major A"); var b = await Major("Major B"); var c = await Major("Major C");
        var cohort = await db.Cohorts.SingleAsync(x => x.AcademicYearId == year.AcademicYearId);
        return (cohort.CohortId, a, b, c);
    }

    private static async Task AddSurvey(AppDbContext db, int semesterId)
    {
        var scale = new AnswerScale { AnswerScaleName = "Regression" };
        db.AnswerScales.Add(scale);
        await db.SaveChangesAsync();
        db.AnswerScaleOptions.AddRange(
            new AnswerScaleOption { AnswerScaleId = scale.AnswerScaleId, Value = 1, DisplayText = "Không đồng ý" },
            new AnswerScaleOption { AnswerScaleId = scale.AnswerScaleId, Value = 5, DisplayText = "Đồng ý" });
        var template = new SurveyTemplate
        {
            TemplateName = "Regression", AnswerScaleId = scale.AnswerScaleId, CreatedAt = DateTime.UtcNow,
        };
        db.SurveyTemplates.Add(template);
        await db.SaveChangesAsync();
        db.SemesterSurveys.Add(new() { SemesterId = semesterId, SurveyTemplateId = template.SurveyTemplateId, SurveyName = "Regression", StartTime = DateTime.UtcNow, EndTime = DateTime.UtcNow.AddDays(1), CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
    }
}
