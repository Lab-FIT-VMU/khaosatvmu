namespace UnitTests.InfrastructureTests;

using Application;
using Application.Auth;
using Application.Students;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Students;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Nạp danh sách sinh viên: kiểm tra dòng, đối chiếu thêm mới / cập nhật / không đổi, ô trống không xóa
/// dữ liệu, mã băm xem trước, vai trò chỉ đọc bị chặn. Ghi thật vào CSDL nên chỉ chạy với
/// <c>COURSE_GRADE_E2E_CONNECTION</c>; test tự xóa sinh viên đã tạo.
/// </summary>
public class StudentServiceTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) => Task.FromResult(scope);
    }

    private static async Task RunAsync(Func<AppDbContext, Func<UserScope, EfStudentService>, string, Task> body)
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
        var prefix = "T" + Random.Shared.Next(100_000, 999_999);
        try
        {
            await body(db, s => new EfStudentService(db, new FixedScopeResolver(s)), prefix);
        }
        finally
        {
            await db.Students.IgnoreQueryFilters().Where(x => x.StudentCode.StartsWith(prefix)).ExecuteDeleteAsync();
        }
    }

    private static StudentImportRow Row(int n, string code, string? name, string? cohortMajor = null,
        string? dob = null, string? gender = null, string? email = null) =>
        new("Khóa 66", n, code, name, cohortMajor, dob, gender, email, null, null);

    /// <summary>Một mã khóa ngành có sẵn trong danh mục.</summary>
    private static async Task<(int Id, string Code)?> AnyCohortMajorAsync(AppDbContext db)
    {
        var row = await db.CohortMajors.AsNoTracking().OrderBy(x => x.CohortMajorId).FirstOrDefaultAsync();
        return row is null ? null : (row.CohortMajorId, row.CohortMajorCode);
    }

    [Fact]
    public async Task Preview_ThenCommit_LinksCohortMajorAndKeepsBlankFields()
    {
        await RunAsync(async (db, serviceFor, p) =>
        {
            if (await AnyCohortMajorAsync(db) is not { } cohortMajor) return;
            var classText = " " + cohortMajor.Code.ToLowerInvariant() + " ";
            var admin = serviceFor(UserScope.Unrestricted(RoleCodes.Admin));
            StudentImportRow[] first =
            [
                Row(2, $"{p}1", "Nguyễn Văn A", classText, dob: "14/03/2007", gender: "nam", email: "A@Example.com"),
                Row(3, $"{p}2", "Trần Thị B", cohortMajor.Code),
                Row(4, $"{p}1", "Trùng mã", cohortMajor.Code),
                Row(5, "", "Thiếu mã", cohortMajor.Code),
                Row(6, $"{p}3", "Ngày sai", cohortMajor.Code, dob: "31/02/2007"),
                Row(7, $"{p}4", "Thiếu lớp"),
                Row(8, $"{p}5", "Lớp chưa có", "ZZZ99ĐH"),
                Row(9, $"{p}6", "Lớp chưa có", "zzz99đh"),
            ];
            var preview = await admin.PreviewImportAsync(new StudentImportRequest(first, null));
            preview.NewCount.Should().Be(2);
            preview.ErrorCount.Should().Be(6);
            preview.Errors.Select(e => e.RowNumber).Should().BeEquivalentTo([4, 5, 6, 7]);
            preview.MissingCohortMajors.Should().ContainSingle()
                .Which.Should().Be(new StudentMissingCohortMajorDto("ZZZ99ĐH", 2));

            var result = await admin.ImportAsync(new StudentImportRequest(first, preview.PreviewHash));
            result.CreatedCount.Should().Be(2);
            result.SkippedCount.Should().Be(6);

            var a = await db.Students.AsNoTracking().SingleAsync(x => x.StudentCode == $"{p}1");
            a.CohortMajorId.Should().Be(cohortMajor.Id, "khớp mã khóa ngành sau khi chuẩn hóa");
            a.DateOfBirth.Should().Be(new DateOnly(2007, 3, 14));
            a.Gender.Should().Be("Nam");
            a.Email.Should().Be("a@example.com");

            var list = await admin.ListAsync(null, false);
            var shown = list.Students.Single(x => x.StudentCode == $"{p}1");
            shown.CohortMajorCode.Should().Be(cohortMajor.Code);
            shown.MajorName.Should().NotBeNullOrEmpty("ngành tra qua khóa ngành");

            // Nạp lại: ô trống không xóa; đổi họ tên theo file.
            StudentImportRow[] second = [Row(2, $"{p}1", "Nguyễn Văn An", cohortMajor.Code), Row(3, $"{p}2", "Trần Thị B", cohortMajor.Code)];
            var again = await admin.PreviewImportAsync(new StudentImportRequest(second, null));
            again.UpdatedCount.Should().Be(1);
            again.UnchangedCount.Should().Be(1);
            again.RenamedCount.Should().Be(1);
            await admin.ImportAsync(new StudentImportRequest(second, again.PreviewHash));
            a = await db.Students.AsNoTracking().SingleAsync(x => x.StudentCode == $"{p}1");
            a.FullName.Should().Be("Nguyễn Văn An");
            a.DateOfBirth.Should().Be(new DateOnly(2007, 3, 14), "ô trống không xóa ngày sinh");

            // Mã băm khác bản xem trước thì từ chối.
            var stale = () => admin.ImportAsync(new StudentImportRequest(first, again.PreviewHash));
            (await stale.Should().ThrowAsync<StudentException>()).Which.ErrorCode.Should().Be(StudentErrorCodes.PreviewMismatch);
        });
    }

    [Fact]
    public async Task ReadOnlyRoles_CannotImport_ButCanList()
    {
        await RunAsync(async (_, serviceFor, p) =>
        {
            var board = serviceFor(new UserScope(RoleCodes.BoardOfDirectors, null, null, null, SeesEverything: true));
            var act = () => board.PreviewImportAsync(new StudentImportRequest([Row(2, $"{p}9", "Ai đó", "ABC59ĐH")], null));
            (await act.Should().ThrowAsync<StudentException>()).Which.ErrorCode.Should().Be(StudentErrorCodes.OutOfScope);
            var list = await board.ListAsync(-1, false);
            list.CanImport.Should().BeFalse();
            list.Students.Should().BeEmpty();
        });
    }
}
