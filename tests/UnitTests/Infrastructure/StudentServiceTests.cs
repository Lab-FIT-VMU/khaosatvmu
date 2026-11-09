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

    private static StudentImportRow Row(int n, string code, string? name, string? classCode = null, string? cohort = null,
        string? dob = null, string? gender = null, string? email = null) =>
        new("Khóa 66", n, code, name, classCode, cohort, dob, gender, email, null, null);

    [Fact]
    public async Task Preview_ThenCommit_CreatesUpdatesAndKeepsBlankFields()
    {
        await RunAsync(async (db, serviceFor, p) =>
        {
            var admin = serviceFor(UserScope.Unrestricted(RoleCodes.Admin));
            StudentImportRow[] first =
            [
                Row(2, $"{p}1", "Nguyễn Văn A", "ĐKT66ĐH", dob: "14/03/2007", gender: "nam", email: "A@Example.com"),
                Row(3, $"{p}2", "Trần Thị B", null, cohort: "66"),
                Row(4, $"{p}1", "Trùng mã"),
                Row(5, "", "Thiếu mã"),
                Row(6, $"{p}3", "Ngày sai", dob: "31/02/2007"),
                Row(7, $"{p}4", "Giới tính sai", gender: "x"),
            ];
            var preview = await admin.PreviewImportAsync(new StudentImportRequest(first, null));
            preview.NewCount.Should().Be(2);
            preview.ErrorCount.Should().Be(4);
            preview.Errors.Select(e => e.RowNumber).Should().BeEquivalentTo([4, 5, 6, 7]);

            var result = await admin.ImportAsync(new StudentImportRequest(first, preview.PreviewHash));
            result.CreatedCount.Should().Be(2);
            result.SkippedCount.Should().Be(4);

            var a = await db.Students.AsNoTracking().SingleAsync(x => x.StudentCode == $"{p}1");
            a.DateOfBirth.Should().Be(new DateOnly(2007, 3, 14));
            a.Gender.Should().Be("Nam");
            a.Email.Should().Be("a@example.com");
            a.CohortId.Should().NotBeNull("lớp ĐKT66ĐH cho khóa 66");
            var b = await db.Students.AsNoTracking().SingleAsync(x => x.StudentCode == $"{p}2");
            b.CohortId.Should().Be(a.CohortId, "không có lớp thì lấy cột Khóa");

            // Nạp lại: ô trống không xóa; đổi họ tên theo file.
            StudentImportRow[] second = [Row(2, $"{p}1", "Nguyễn Văn An", "ĐKT66ĐH"), Row(3, $"{p}2", "Trần Thị B", null, cohort: "66")];
            var again = await admin.PreviewImportAsync(new StudentImportRequest(second, null));
            again.UpdatedCount.Should().Be(1);
            again.UnchangedCount.Should().Be(1);
            again.RenamedCount.Should().Be(1);
            await admin.ImportAsync(new StudentImportRequest(second, again.PreviewHash));
            a = await db.Students.AsNoTracking().SingleAsync(x => x.StudentCode == $"{p}1");
            a.FullName.Should().Be("Nguyễn Văn An");
            a.DateOfBirth.Should().Be(new DateOnly(2007, 3, 14), "ô trống không xóa ngày sinh");
            a.Email.Should().Be("a@example.com");

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
            var act = () => board.PreviewImportAsync(new StudentImportRequest([Row(2, $"{p}9", "Ai đó")], null));
            (await act.Should().ThrowAsync<StudentException>()).Which.ErrorCode.Should().Be(StudentErrorCodes.OutOfScope);
            var list = await board.ListAsync(-1, false);
            list.CanImport.Should().BeFalse();
            list.Students.Should().BeEmpty();
        });
    }
}
