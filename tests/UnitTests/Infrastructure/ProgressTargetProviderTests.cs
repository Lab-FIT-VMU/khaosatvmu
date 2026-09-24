namespace UnitTests.InfrastructureTests;

using Application.Auth;
using Application.Surveys;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Surveys;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Chỉ tiêu của trang Tiến độ thu phiếu: chỉ quản trị hệ thống và quản trị khảo sát được
/// đổi, và đổi nó không được chạm vào hai ngưỡng tính điểm nằm cùng dòng cấu hình.
///
/// Chạy trên cơ sở dữ liệu thật, mọi thay đổi nằm trong một transaction rồi rollback.
/// Không đặt biến môi trường <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class ProgressTargetProviderTests
{
    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunInRollbackAsync(
        Func<AppDbContext, Func<UserScope, EfProgressTargetProvider>, Task> body)
    {
        var connectionString = ConnectionString;
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
            await body(db, userScope => new EfProgressTargetProvider(db, new FixedUserScopeResolver(userScope)));
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }

    private static readonly UserScope DepartmentManager =
        new(RoleCodes.DepartmentManager, LecturerId: 1, DepartmentId: 1, FacultyId: 1, SeesEverything: false);

    [Fact]
    public async Task Admin_CanChangeTarget_WithoutTouchingScoringThresholds()
    {
        await RunInRollbackAsync(async (db, providerFor) =>
        {
            var thresholdsBefore = await db.SurveyScoringSettings.AsNoTracking()
                .Select(x => new { x.MinimumResponseRate, x.MinimumValidRate })
                .FirstOrDefaultAsync();
            var logsBefore = await db.SurveyScoringChangeLogs.CountAsync();

            var result = await providerFor(UserScope.Unrestricted(RoleCodes.SurveyAdmin)).UpdateAsync(65m);

            result.Succeeded.Should().BeTrue(result.ErrorCode);
            (await providerFor(DepartmentManager).GetAsync()).ResponseRate.Should().Be(65m);

            var thresholdsAfter = await db.SurveyScoringSettings.AsNoTracking()
                .Select(x => new { x.MinimumResponseRate, x.MinimumValidRate })
                .FirstOrDefaultAsync();
            if (thresholdsBefore is not null)
            {
                thresholdsAfter.Should().Be(thresholdsBefore, "ngưỡng tính điểm không được đổi theo");
            }
            (await db.SurveyScoringChangeLogs.CountAsync()).Should().Be(logsBefore, "không ghi nhật ký cấu hình tính điểm");
        });
    }

    [Theory]
    [InlineData(RoleCodes.DepartmentManager)]
    [InlineData(RoleCodes.FacultyManager)]
    [InlineData(RoleCodes.Lecturer)]
    public async Task OtherRoles_CannotChangeTarget(string roleCode)
    {
        await RunInRollbackAsync(async (_, providerFor) =>
        {
            var before = await providerFor(DepartmentManager).GetAsync();

            var result = await providerFor(DepartmentManager with { RoleCode = roleCode }).UpdateAsync(80m);

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope);
            (await providerFor(DepartmentManager).GetAsync()).Should().Be(before);
        });
    }

    [Fact]
    public async Task BoardOfDirectors_CannotChangeTarget()
    {
        await RunInRollbackAsync(async (_, providerFor) =>
        {
            var result = await providerFor(UserScope.Unrestricted(RoleCodes.BoardOfDirectors)).UpdateAsync(80m);

            result.ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope, "Ban Giám hiệu chỉ đọc");
        });
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(101)]
    public async Task OutOfRangeTarget_IsRejected(int rate)
    {
        await RunInRollbackAsync(async (_, providerFor) =>
        {
            var result = await providerFor(UserScope.Unrestricted(RoleCodes.Admin)).UpdateAsync(rate);

            result.ErrorCode.Should().Be(SurveyErrorCodes.InvalidRequest);
        });
    }
}
