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
/// Lưu ngưỡng: tăng phiên bản, chỉ dòng đổi mới mang phiên bản mới, xếp lượt tính lại, ghi nhật ký;
/// vai trò chỉ đọc bị chặn; khôi phục mặc định đưa mọi ngưỡng về như cũ.
/// Ghi thật vào CSDL (service tự mở transaction), nên chỉ chạy với <c>COURSE_GRADE_E2E_CONNECTION</c>
/// trỏ tới database dùng một lần; test tự khôi phục mặc định ở cuối.
/// </summary>
public class GradeAnalysisThresholdServiceTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) => Task.FromResult(scope);
    }

    private sealed class TestUser : ICurrentUserAccessor
    {
        public Guid? UserId => null;
        public string? UserEmail => "threshold-test@example.invalid";
        public Guid? ProfileId => null;
    }

    private static async Task RunAsync(Func<AppDbContext, Func<UserScope, EfGradeAnalysisThresholdService>, Task> body)
    {
        var connectionString = Environment.GetEnvironmentVariable("COURSE_GRADE_E2E_CONNECTION");
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
        services.AddSingleton<ICurrentUserAccessor, TestUser>();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = connectionString })
            .Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddPersistence(configuration);
        await using var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await GradeAnalysisThresholdSeeder.SeedAsync(db);

        var admin = new EfGradeAnalysisThresholdService(db, new TestUser(), new FixedScopeResolver(UserScope.Unrestricted(RoleCodes.Admin)));
        await admin.ResetToDefaultsAsync();
        try
        {
            await body(db, userScope => new EfGradeAnalysisThresholdService(db, new TestUser(), new FixedScopeResolver(userScope)));
        }
        finally
        {
            await admin.ResetToDefaultsAsync();
        }
    }

    [Fact]
    public async Task Update_BumpsVersion_QueuesRun_AndIsIdempotent()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var service = serviceFor(UserScope.Unrestricted(RoleCodes.Admin));
            var before = await service.GetAsync();
            before.CanEdit.Should().BeTrue();

            var saved = await service.UpdateAsync([new GradeAnalysisThresholdUpdate("d1_d2_lech_x", 1.2m, null, null)]);
            saved.ChangedCount.Should().Be(1);
            saved.Version.Should().Be(before.Version + 1);
            saved.QueuedRun!.Trigger.Should().Be(GradeAnalysisRunTriggers.ThresholdChange);

            var after = await service.GetAsync();
            after.Thresholds.Single(x => x.Code == "d1_d2_lech_x").NumericValue.Should().Be(1.2m);
            after.Thresholds.Single(x => x.Code == "fdr_q").Version.Should().BeLessThan(saved.Version, "chỉ dòng đổi mới mang phiên bản mới");

            var snapshot = await db.GradeAnalysisRuns.AsNoTracking().SingleAsync(x => x.RunId == saved.QueuedRun.RunId);
            snapshot.ThresholdVersion.Should().Be(saved.Version);
            System.Text.Json.Nodes.JsonNode.Parse(snapshot.ThresholdSnapshotJson)!["d1_d2_lech_x"]!.GetValue<decimal>()
                .Should().Be(1.2m, "lượt tính mang bản chụp ngưỡng mới");

            (await db.ChangeAuditLogs.AnyAsync(x => x.TableName == nameof(GradeAnalysisThreshold) && x.RecordId == "d1_d2_lech_x"))
                .Should().BeTrue("lịch sử sửa ngưỡng nằm ở ChangeAuditLogs");

            var again = await service.UpdateAsync([new GradeAnalysisThresholdUpdate("d1_d2_lech_x", 1.2m, null, null)]);
            again.ChangedCount.Should().Be(0);
            again.QueuedRun.Should().BeNull("không đổi gì thì không tính lại");
        });
    }

    [Fact]
    public async Task InvalidCombination_IsRejected_AndNothingIsSaved()
    {
        await RunAsync(async (_, serviceFor) =>
        {
            var service = serviceFor(UserScope.Unrestricted(RoleCodes.Admin));
            var version = (await service.GetAsync()).Version;
            var act = () => service.UpdateAsync([new GradeAnalysisThresholdUpdate("so_sv_tin_cay_thap", 10m, null, null)]);
            (await act.Should().ThrowAsync<CourseGradeException>())
                .Which.Message.Should().Contain("phải lớn hơn số sinh viên tối thiểu");
            (await service.GetAsync()).Version.Should().Be(version);
        });
    }

    [Fact]
    public async Task ReadOnlyRoles_CannotEdit_EvenWithPermission()
    {
        await RunAsync(async (_, serviceFor) =>
        {
            var board = new UserScope(RoleCodes.BoardOfDirectors, null, null, null, SeesEverything: true);
            var service = serviceFor(board);
            (await service.GetAsync()).CanEdit.Should().BeFalse();
            var act = () => service.UpdateAsync([new GradeAnalysisThresholdUpdate("fdr_q", 0.1m, null, null)]);
            (await act.Should().ThrowAsync<CourseGradeException>())
                .Which.ErrorCode.Should().Be(CourseGradeErrorCodes.OutOfScope);
        });
    }

    [Fact]
    public async Task Reset_RestoresDefaults()
    {
        await RunAsync(async (_, serviceFor) =>
        {
            var service = serviceFor(UserScope.Unrestricted(RoleCodes.Admin));
            await service.UpdateAsync(
            [
                new GradeAnalysisThresholdUpdate("fdr_q", 0.1m, null, null),
                new GradeAnalysisThresholdUpdate("tu_khoa_loai_hp", null, null, ["  Giáo dục  ", "giáo dục"]),
            ]);
            var changed = await service.GetAsync();
            changed.Thresholds.Single(x => x.Code == "tu_khoa_loai_hp").TextListValue.Should().Equal("Giáo dục");

            var reset = await service.ResetToDefaultsAsync();
            reset.ChangedCount.Should().Be(2);
            var after = await service.GetAsync();
            after.Thresholds.Should().OnlyContain(x =>
                x.NumericValue == x.DefaultNumericValue && x.BooleanValue == x.DefaultBooleanValue);
            after.Thresholds.Single(x => x.Code == "tu_khoa_loai_hp").TextListValue.Should().BeEmpty();
        });
    }
}
