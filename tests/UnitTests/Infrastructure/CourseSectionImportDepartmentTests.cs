namespace UnitTests.InfrastructureTests;

using Application;
using Application.Auth;
using Application.Catalog;
using Domain;
using FluentAssertions;
using global::Infrastructure.Catalog;
using global::Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>PostgreSQL coverage for course section import against the active catalog.</summary>
public class CourseSectionImportDepartmentTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(scope);
    }

    private static async Task RunInRollbackAsync(Func<AppDbContext, EfCatalogService, int, Task> body)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
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

        await using var transaction = await db.Database.BeginTransactionAsync();
        try
        {
            // Mã bộ môn do người dùng nhập (không tự tăng): dùng các mã thật 122, 175, 191.
            foreach (var (id, name) in new[] { (122, "Khai thác tàu biển"), (175, "Truyền thông và mạng MT"), (191, "Những NLCB của CNML") })
            {
                if (!await db.Departments.IgnoreQueryFilters().AnyAsync(x => x.DepartmentId == id))
                {
                    db.Departments.Add(new Department { DepartmentId = id, DepartmentName = name });
                }
            }
            var year = new AcademicYear
            {
                AcademicYearName = "2099-2100",
                StartDate = new DateOnly(2099, 7, 25),
                EndDate = new DateOnly(2100, 7, 24),
            };
            db.AcademicYears.Add(year);
            await db.SaveChangesAsync();
            var semester = new Semester { SemesterName = "Học kỳ 1", AcademicYearId = year.AcademicYearId };
            db.Semesters.Add(semester);
            await db.SaveChangesAsync();

            var service = new EfCatalogService(db, new FixedScopeResolver(UserScope.Unrestricted(RoleCodes.Admin)));
            await body(db, service, semester.SemesterId);
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }

    private static ImportCourseSectionRowCommand Row(int rowNumber, string courseCode, string? departmentCode, string? departmentName = null) =>
        new(rowNumber, courseCode, $"Học phần {courseCode}", "N01", "3", "40", departmentName, departmentCode, null, "Giảng viên A", null);

    private static async Task<int?> DepartmentOfCourseAsync(AppDbContext db, string courseCode) =>
        await db.Courses.Where(x => x.CourseCode == courseCode).Select(x => x.DepartmentId).SingleAsync();

    [Fact]
    public async Task ArchivedDepartmentCode_IsRejectedEvenWhenItsNameMatches()
    {
        await RunInRollbackAsync(async (db, service, semesterId) =>
        {
            var activeName = await db.Departments.Where(x => x.DepartmentId == 191)
                .Select(x => x.DepartmentName).SingleAsync();
            var archived = await db.Departments.IgnoreQueryFilters().SingleOrDefaultAsync(x => x.DepartmentId == 195);
            if (archived is null)
            {
                archived = new Department { DepartmentId = 195, DepartmentName = activeName };
                db.Departments.Add(archived);
            }
            archived.IsDeleted = true;
            await db.SaveChangesAsync();

            var result = await service.ImportCourseSectionsAsync(semesterId, [Row(1, "99501", "195", activeName)]);

            result.Value!.CreatedCount.Should().Be(0);
            result.Value.Items.Single().ErrorCode.Should().Be(CatalogErrorCodes.DepartmentNotFound);
            (await db.Courses.AnyAsync(x => x.CourseCode == "99501")).Should().BeFalse();
        });
    }

    [Fact]
    public async Task CourseCodePrefix_DoesNotOverrideActiveDepartmentCode()
    {
        await RunInRollbackAsync(async (db, service, semesterId) =>
        {
            var result = await service.ImportCourseSectionsAsync(semesterId, [Row(1, "12199", "175")]);

            result.Value!.CreatedCount.Should().Be(1);
            (await DepartmentOfCourseAsync(db, "12199")).Should().Be(175);
        });
    }

    [Theory]
    [InlineData("#N/A")]
    [InlineData("")]
    [InlineData(null)]
    public async Task MissingDepartmentCode_UsesCatalogNameInsteadOfCoursePrefix(string? departmentCode)
    {
        await RunInRollbackAsync(async (db, service, semesterId) =>
        {
            var name = await db.Departments.Where(x => x.DepartmentId == 191)
                .Select(x => x.DepartmentName).SingleAsync();
            var result = await service.ImportCourseSectionsAsync(semesterId, [Row(1, "17599", departmentCode, name)]);

            result.Value!.CreatedCount.Should().Be(1);
            (await DepartmentOfCourseAsync(db, "17599")).Should().Be(191);
        });
    }

    [Fact]
    public async Task ExistingCourse_RejectsConflictingDepartmentAndUsesCatalogWhenOmitted()
    {
        await RunInRollbackAsync(async (db, service, semesterId) =>
        {
            var firstImport = await service.ImportCourseSectionsAsync(semesterId, [Row(1, "17596", "175")]);
            firstImport.Value!.CreatedCount.Should().Be(1);

            var result = await service.ImportCourseSectionsAsync(semesterId,
                [Row(2, "17596", "191") with { SectionName = "N02" },
                 Row(3, "17596", null) with { SectionName = "N03" }]);

            result.Value!.CreatedCount.Should().Be(1);
            result.Value.Items[0].ErrorCode.Should().Be(CatalogErrorCodes.CourseSectionDepartmentMismatch);
            result.Value.UnidentifiedLecturers.Single().DepartmentId.Should().Be(175);
            (await DepartmentOfCourseAsync(db, "17596")).Should().Be(175);
        });
    }

    [Fact]
    public async Task FacultyCode_MustMatchTheDepartmentInCatalog()
    {
        await RunInRollbackAsync(async (db, service, semesterId) =>
        {
            var nextFacultyId = await db.Faculties.IgnoreQueryFilters().MaxAsync(x => (int?)x.FacultyId) ?? 0;
            var ownFacultyId = nextFacultyId + 1;
            var otherFacultyId = nextFacultyId + 2;
            db.Faculties.AddRange(
                new Faculty { FacultyId = ownFacultyId, FacultyName = "Import test faculty" },
                new Faculty { FacultyId = otherFacultyId, FacultyName = "Other import test faculty" });
            var department = await db.Departments.SingleAsync(x => x.DepartmentId == 175);
            department.FacultyId = ownFacultyId;
            await db.SaveChangesAsync();

            var result = await service.ImportCourseSectionsAsync(semesterId,
                [Row(1, "17595", "175") with { FacultyName = otherFacultyId.ToString() },
                 Row(2, "17595", "175") with { FacultyName = ownFacultyId.ToString() }]);

            result.Value!.CreatedCount.Should().Be(1);
            result.Value.Items[0].ErrorCode.Should().Be(CatalogErrorCodes.CourseSectionFacultyMismatch);
            (await db.Courses.SingleAsync(x => x.CourseCode == "17595")).FacultyId.Should().Be(ownFacultyId);
        });
    }

    [Fact]
    public async Task UnknownDepartmentCode_IsStillRejected()
    {
        await RunInRollbackAsync(async (_, service, semesterId) =>
        {
            var result = await service.ImportCourseSectionsAsync(semesterId, [Row(1, "17598", "998")]);

            result.Value!.CreatedCount.Should().Be(0);
            result.Value.Items.Single().ErrorCode.Should().Be(CatalogErrorCodes.DepartmentNotFound);
        });
    }

    [Fact]
    public async Task EthCharacter_InLecturerName_IsNormalized()
    {
        await RunInRollbackAsync(async (db, service, semesterId) =>
        {
            var row = Row(1, "17597", "175") with { LecturerFullName = "  Ðỗ   Văn  A " };
            await service.ImportCourseSectionsAsync(semesterId, [row]);

            var name = await db.CourseSections
                .Where(x => x.SemesterId == semesterId && x.SectionName == "N01")
                .Select(x => x.UnidentifiedLecturerName)
                .SingleAsync();
            name.Should().Be("Đỗ Văn A");
        });
    }
}
