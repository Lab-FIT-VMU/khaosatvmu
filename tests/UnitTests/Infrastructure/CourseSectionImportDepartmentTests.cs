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

/// <summary>
/// Bộ môn của lớp khi import file lớp, theo bộ luật B-T1: gộp 194/195 → 191, mã 121… → 122,
/// Mã BM "#N/A" hoặc trống thì suy từ mã học phần. Trước đây ba trường hợp này làm lớp bị bỏ
/// (DepartmentNotFound / DepartmentCodeInvalid) hoặc mất bộ môn.
///
/// Chạy trên Postgres trong một transaction rồi rollback; tự tạo bộ môn và học kỳ cần dùng.
/// Không đặt <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
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
    public async Task MergedDepartmentCodes_194And195_GoTo191()
    {
        await RunInRollbackAsync(async (db, service, semesterId) =>
        {
            var result = await service.ImportCourseSectionsAsync(semesterId,
            [
                Row(1, "99401", "194"),
                Row(2, "99501", "195"),
            ]);

            result.Succeeded.Should().BeTrue();
            result.Value!.CreatedCount.Should().Be(2);
            (await DepartmentOfCourseAsync(db, "99401")).Should().Be(191);
            (await DepartmentOfCourseAsync(db, "99501")).Should().Be(191);
        });
    }

    [Fact]
    public async Task CourseCode121_AlwaysGoesTo122_IgnoringFileValue()
    {
        await RunInRollbackAsync(async (db, service, semesterId) =>
        {
            var result = await service.ImportCourseSectionsAsync(semesterId, [Row(1, "12199", "123")]);

            result.Value!.CreatedCount.Should().Be(1);
            (await DepartmentOfCourseAsync(db, "12199")).Should().Be(122);
        });
    }

    [Theory]
    [InlineData("#N/A")]
    [InlineData("")]
    [InlineData(null)]
    public async Task MissingDepartmentCode_IsDerivedFromCourseCode(string? departmentCode)
    {
        await RunInRollbackAsync(async (db, service, semesterId) =>
        {
            var result = await service.ImportCourseSectionsAsync(semesterId, [Row(1, "17599", departmentCode)]);

            result.Value!.CreatedCount.Should().Be(1, "Mã BM #N/A hoặc trống không còn làm lớp bị bỏ");
            (await DepartmentOfCourseAsync(db, "17599")).Should().Be(175);
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
