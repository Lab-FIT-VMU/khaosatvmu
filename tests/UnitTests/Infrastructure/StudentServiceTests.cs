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
            var missing = preview.MissingCohortMajors.Should().ContainSingle().Which;
            missing.CohortMajorCode.Should().Be("ZZZ99ĐH");
            missing.StudentCount.Should().Be(2);

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
    public async Task MissingCohortMajor_IsCreated_WhenCohortAndMajorAreKnown()
    {
        await RunAsync(async (db, serviceFor, p) =>
        {
            // Khóa chưa có khóa ngành nào của ngành mẫu, và ngành mẫu có mã lớp dạng chuẩn ở khóa khác.
            var sample = await (
                from cm in db.CohortMajors.AsNoTracking()
                join m in db.Majors.AsNoTracking() on cm.MajorId equals m.MajorId
                select new { cm.CohortMajorCode, cm.MajorId, cm.CohortId }).ToListAsync();
            var pattern = new System.Text.RegularExpressions.Regex(@"^(\p{L}{2,10})\d{2}(ĐH)$");
            var source = sample.FirstOrDefault(x => pattern.IsMatch(x.CohortMajorCode)
                && sample.Where(y => y.CohortMajorCode.StartsWith(pattern.Match(x.CohortMajorCode).Groups[1].Value)
                        && y.CohortMajorCode.EndsWith("ĐH"))
                    .Select(y => y.MajorId).Distinct().Count() == 1);
            if (source is null) return;
            var cohorts = await db.Cohorts.AsNoTracking().ToListAsync();
            var target = cohorts.FirstOrDefault(c => c.CohortCode.Length == 2 && !sample.Any(x => x.CohortId == c.CohortId && x.MajorId == source.MajorId));
            if (target is null) return;
            var newCode = pattern.Match(source.CohortMajorCode).Groups[1].Value + target.CohortCode + "ĐH";
            if (sample.Any(x => x.CohortMajorCode == newCode)) return;

            var admin = serviceFor(UserScope.Unrestricted(RoleCodes.Admin));
            StudentImportRow[] rows = [Row(2, $"{p}7", "Sinh viên khóa mới", newCode), Row(3, $"{p}8", "Sinh viên khóa mới 2", newCode)];
            try
            {
                var preview = await admin.PreviewImportAsync(new StudentImportRequest(rows, null));
                preview.NewCohortMajors.Should().ContainSingle(x => x.CohortMajorCode == newCode && x.StudentCount == 2);
                (await db.CohortMajors.AnyAsync(x => x.CohortMajorCode == newCode)).Should().BeFalse("xem trước không ghi");

                var result = await admin.ImportAsync(new StudentImportRequest(rows, preview.PreviewHash));
                result.CreatedCohortMajorCount.Should().Be(1);
                var created = await db.CohortMajors.AsNoTracking().SingleAsync(x => x.CohortMajorCode == newCode);
                created.CohortId.Should().Be(target.CohortId);
                created.MajorId.Should().Be(source.MajorId, "ngành theo cùng mã ngành ở khóa khác");
                (await db.Students.AsNoTracking().Where(x => x.StudentCode.StartsWith(p)).Select(x => x.CohortMajorId).ToListAsync())
                    .Should().OnlyContain(id => id == created.CohortMajorId);
            }
            finally
            {
                await db.Students.IgnoreQueryFilters().Where(x => x.StudentCode.StartsWith(p)).ExecuteDeleteAsync();
                await db.CohortMajors.IgnoreQueryFilters().Where(x => x.CohortMajorCode == newCode).ExecuteDeleteAsync();
            }
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
