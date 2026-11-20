namespace UnitTests.InfrastructureTests;

using Application;
using Application.Auth;
using Application.Catalog;
using Domain;
using FluentAssertions;
using global::Infrastructure.Catalog;
using global::Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Xunit;

public sealed class CourseSectionImportPreviewTests
{
    private sealed class FixedScope(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) => Task.FromResult(scope);
    }

    private sealed class WriteGuard : SaveChangesInterceptor
    {
        public bool RejectWrites { get; set; }
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (RejectWrites) throw new InvalidOperationException("Validation must never save changes.");
            return ValueTask.FromResult(result);
        }
    }

    private static async Task<(AppDbContext Db, EfCatalogService Service, WriteGuard Guard)> SetupAsync()
    {
        var guard = new WriteGuard();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .AddInterceptors(guard).Options);
        db.Faculties.AddRange(new Faculty { FacultyId = 1, FacultyName = "Faculty A" }, new Faculty { FacultyId = 2, FacultyName = "Faculty B" });
        db.Departments.Add(new Department { DepartmentId = 111, DepartmentName = "Department A", FacultyId = 1 });
        db.Positions.Add(new Position { PositionId = 1, PositionName = "Giảng viên" });
        db.AcademicYears.Add(new AcademicYear { AcademicYearId = 1, AcademicYearName = "2026-2027" });
        db.Semesters.Add(new Semester { SemesterId = 1, SemesterName = "Semester 1", AcademicYearId = 1 });
        db.Courses.Add(new Course { CourseId = 1, CourseCode = "11101", CourseName = "Existing course", Credits = 3, DepartmentId = 111, FacultyId = 1 });
        db.Lecturers.AddRange(
            new Lecturer { LecturerId = 1, FullName = "Existing lecturer", Email = "existing@example.com", DepartmentId = 111, PositionId = 1 },
            new Lecturer { LecturerId = 2, FullName = "Archived lecturer", Email = "restore@example.com", DepartmentId = 111, PositionId = 1, IsDeleted = true });
        db.Users.Add(new User { Id = Guid.NewGuid(), Email = "restore@example.com", LecturerId = 2, IsActive = false });
        db.CourseSections.AddRange(
            new CourseSection { CourseSectionId = 1, CourseId = 1, SemesterId = 1, SectionName = "N01", LecturerId = 1 },
            new CourseSection { CourseSectionId = 2, CourseId = 1, SemesterId = 1, SectionName = "N02", UnidentifiedLecturerName = "Unassigned lecturer" });
        await db.SaveChangesAsync();
        guard.RejectWrites = true;
        return (db, new EfCatalogService(db, new FixedScope(UserScope.Unrestricted(RoleCodes.Admin))), guard);
    }

    private static ImportCourseSectionRowCommand Row(int number, string code, string section, string? email) =>
        new(number, code, "New course", section, "3", "40", null, "111", null, "Lecturer", email);

    private static List<ImportCourseSectionRowCommand> MixedRows() =>
    [
        Row(1, "11190", "N01", "new@example.com"),
        Row(2, "11190", "N02", null),
        Row(3, "11190", "N02", "rejected@example.com"),
        Row(4, "11191", "N01", null) with { DepartmentCode = "999" },
        Row(5, "11101", "N99", "restore@example.com"),
        Row(6, "11101", "N01", "existing@example.com"),
        Row(7, "11101", "N02", "new@example.com"),
        Row(8, "11192", "N01", null) with { FacultyName = "2" },
        Row(9, "11193", "N01", "bad-email"),
    ];

    [Fact]
    public async Task PreviewReportsRejectedAndUnidentifiedRowsWithoutCreatingOrRestoringAnything()
    {
        var (db, service, _) = await SetupAsync();
        await using var lifetime = db;
        var first = await service.PreviewCourseSectionsAsync(1, MixedRows());
        first.Succeeded.Should().BeTrue(first.ErrorCode);
        var report = first.Value!.Result;
        report.TotalCount.Should().Be(9);
        report.CreatedCount.Should().Be(4);
        report.SkippedCount.Should().Be(5);
        report.UpdatedSectionCount.Should().Be(1);
        report.CreatedCourseCount.Should().Be(1);
        report.CreatedLecturerCount.Should().Be(2);
        report.UnidentifiedLecturers.Should().ContainSingle().Which.RowNumber.Should().Be(2);
        report.Items.Single(item => item.RowNumber == 3).ErrorCode.Should().Be(CatalogErrorCodes.CourseSectionDuplicateInFile);
        report.Items.Single(item => item.RowNumber == 4).ErrorCode.Should().Be(CatalogErrorCodes.DepartmentNotFound);
        report.Items.Single(item => item.RowNumber == 8).ErrorCode.Should().Be(CatalogErrorCodes.CourseSectionFacultyMismatch);
        (await service.PreviewCourseSectionsAsync(1, MixedRows())).Value!.PreviewToken.Should().Be(first.Value.PreviewToken);
        (await db.Courses.CountAsync()).Should().Be(1);
        (await db.CourseSections.CountAsync()).Should().Be(2);
        (await db.Lecturers.IgnoreQueryFilters().CountAsync()).Should().Be(2);
        (await db.Lecturers.IgnoreQueryFilters().SingleAsync(lecturer => lecturer.LecturerId == 2)).IsDeleted.Should().BeTrue();
        (await db.Users.SingleAsync()).IsActive.Should().BeFalse();
        (await db.UserProfiles.CountAsync()).Should().Be(0);
        (await db.CourseSections.SingleAsync(section => section.CourseSectionId == 2)).LecturerId.Should().BeNull();
        db.ChangeTracker.DetectChanges();
        db.ChangeTracker.Entries().Should().OnlyContain(entry => entry.State == EntityState.Unchanged);
    }

    [Fact]
    public async Task ConfirmedImportMatchesTheReportAndOnlyThenCreatesAndRestoresData()
    {
        var (db, service, guard) = await SetupAsync();
        await using var lifetime = db;
        var rows = MixedRows();
        var preview = (await service.PreviewCourseSectionsAsync(1, rows)).Value!;
        guard.RejectWrites = false;
        var commit = await service.CommitCourseSectionsAsync(1, rows, preview.PreviewToken);
        commit.Succeeded.Should().BeTrue(commit.ErrorCode);
        commit.Value.Should().BeEquivalentTo(preview.Result);
        (await db.Courses.CountAsync()).Should().Be(2);
        (await db.CourseSections.CountAsync()).Should().Be(5);
        (await db.Lecturers.CountAsync()).Should().Be(3);
        (await db.Users.SingleAsync(user => user.Email == "restore@example.com")).IsActive.Should().BeTrue();
        (await db.Users.AnyAsync(user => user.Email == "new@example.com")).Should().BeTrue();
        (await db.Users.AnyAsync(user => user.Email == "rejected@example.com")).Should().BeFalse();
    }

    [Fact]
    public async Task ChangedRowsAreRejectedBeforeAnyWrite()
    {
        var (db, service, _) = await SetupAsync();
        await using var lifetime = db;
        var rows = MixedRows();
        var preview = (await service.PreviewCourseSectionsAsync(1, rows)).Value!;
        rows[0] = rows[0] with { ClassSize = "99" };
        var commit = await service.CommitCourseSectionsAsync(1, rows, preview.PreviewToken);
        commit.Succeeded.Should().BeFalse();
        commit.ErrorCode.Should().Be(CatalogErrorCodes.CourseSectionPreviewChanged);
        db.ChangeTracker.DetectChanges();
        db.ChangeTracker.Entries().Should().OnlyContain(entry => entry.State == EntityState.Unchanged);
    }

    [Fact]
    public async Task ChangedCatalogRequiresAnotherPreviewBeforeAnyWrite()
    {
        var (db, service, guard) = await SetupAsync();
        await using var lifetime = db;
        var rows = MixedRows();
        var preview = (await service.PreviewCourseSectionsAsync(1, rows)).Value!;
        guard.RejectWrites = false;
        db.CourseSections.Add(new CourseSection { CourseId = 1, SemesterId = 1, SectionName = "N99", LecturerId = 1 });
        await db.SaveChangesAsync();
        guard.RejectWrites = true;
        var commit = await service.CommitCourseSectionsAsync(1, rows, preview.PreviewToken);
        commit.ErrorCode.Should().Be(CatalogErrorCodes.CourseSectionPreviewChanged);
        (await db.Users.SingleAsync()).IsActive.Should().BeFalse();
        (await db.Courses.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task MissingTokenAndUnauthorizedPreviewCannotWrite()
    {
        var (db, service, _) = await SetupAsync();
        await using var lifetime = db;
        (await service.CommitCourseSectionsAsync(1, MixedRows(), "")).ErrorCode.Should().Be(CatalogErrorCodes.CourseSectionPreviewChanged);
        var restricted = new EfCatalogService(db, new FixedScope(new UserScope(RoleCodes.Lecturer, 1, 111, 1, SeesEverything: false)));
        (await restricted.PreviewCourseSectionsAsync(1, MixedRows())).ErrorCode.Should().Be(CatalogErrorCodes.OutOfScope);
    }

    [CatalogDatabaseFact]
    public async Task PostgreSqlPreviewSucceedsInsideAReadOnlyTransaction()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")).Options);
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY");
        var semesterId = await db.Semesters.Select(semester => semester.SemesterId).FirstAsync();
        var course = await (from item in db.Courses
                            join department in db.Departments on item.DepartmentId equals department.DepartmentId
                            select item).FirstAsync();
        var unique = Guid.NewGuid().ToString("N")[..8];
        var rows = new[]
        {
            Row(1, course.CourseCode, $"PREVIEW-{unique}", $"preview-{unique}@example.com") with { DepartmentCode = course.DepartmentId!.Value.ToString() },
            Row(2, course.CourseCode, $"MISSING-{unique}", null) with { DepartmentCode = course.DepartmentId.Value.ToString() },
            Row(3, course.CourseCode, $"INVALID-{unique}", "bad-email") with { DepartmentCode = course.DepartmentId.Value.ToString() },
        };
        var service = new EfCatalogService(db, new FixedScope(UserScope.Unrestricted(RoleCodes.Admin)));
        var report = await service.PreviewCourseSectionsAsync(semesterId, rows);
        report.Succeeded.Should().BeTrue(report.ErrorCode);
        report.Value!.Result.CreatedCount.Should().Be(2);
        report.Value.Result.SkippedCount.Should().Be(1);
        report.Value.Result.UnidentifiedLecturers.Should().ContainSingle();
        (await db.Users.AnyAsync(user => user.Email == $"preview-{unique}@example.com")).Should().BeFalse();
        (await db.CourseSections.AnyAsync(section => section.SectionName == $"PREVIEW-{unique}")).Should().BeFalse();
        db.ChangeTracker.DetectChanges();
        db.ChangeTracker.Entries().Should().OnlyContain(entry => entry.State == EntityState.Unchanged);
        await transaction.RollbackAsync();
    }
}
