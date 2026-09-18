namespace UnitTests.InfrastructureTests;

using Application;
using Application.Auth;
using Application.Surveys;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using global::Infrastructure.Surveys;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Cột "Z mặt bằng" của tab Mặt bằng khoa/viện so TRUNG BÌNH của một khoa với mặt
/// bằng trường, nên mẫu số phải là sai số chuẩn <c>σ/√n</c> chứ không phải <c>σ</c>.
/// Chia nhầm sang σ thì mọi khoa dồn về sát 0 và cột mất tác dụng — test này khoá
/// đúng chỗ dễ sai đó lại.
///
/// Chỉ đọc, không ghi. Không đặt biến môi trường
/// <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class NormalizationMeanZTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(scope);
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunAsync(Func<AppDbContext, EfSurveyService, Task> body)
    {
        var connectionString = ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
        services.AddMemoryCache();
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
        var cache = scope.ServiceProvider.GetRequiredService<IMemoryCache>();

        await body(db, new EfSurveyService(
            db,
            cache,
            new FixedScopeResolver(UserScope.Unrestricted(RoleCodes.Admin)),
            new FixedScoringThresholdProvider(),
            new PublishedSurveyPublicationService(),
            new SchoolOverviewCacheVersion()));
    }

    private static async Task<int?> SurveyWithResponsesAsync(AppDbContext db) =>
        await db.SemesterSurveys
            .Where(x => db.CourseSectionSurveys.Any(css =>
                css.SemesterSurveyId == x.SemesterSurveyId
                && db.SurveyResponses.Any(r =>
                    r.CourseSectionSurveyId == css.CourseSectionSurveyId && r.IsValid)))
            .Select(x => (int?)x.SemesterSurveyId)
            .FirstOrDefaultAsync();

    [Fact]
    public async Task MeanZScore_ShouldDivideByTheStandardError_NotByTheRawDeviation()
    {
        await RunAsync(async (db, service) =>
        {
            var semesterSurveyId = await SurveyWithResponsesAsync(db);
            if (semesterSurveyId is null) return;

            var result = await service.GetSemesterSurveyNormalizationAsync(semesterSurveyId.Value);
            result.Succeeded.Should().BeTrue();

            var data = result.Value!;
            if (data.SchoolStandardDeviation is not > 0) return;
            var sd = data.SchoolStandardDeviation.Value;

            data.Groups.Should().NotBeEmpty();
            foreach (var group in data.Groups)
            {
                var standardError = sd / (decimal)Math.Sqrt(group.SectionCount);
                var expected = Math.Round(
                    (group.AverageScore - data.SchoolAverageScore) / standardError, 2);

                // Điểm TB khoa đã làm tròn 3 số trước khi trả về nên cho phép lệch nhẹ.
                group.MeanZScore.Should().NotBeNull();
                group.MeanZScore!.Value.Should().BeApproximately(expected, 0.02m,
                    $"khoa {group.FacultyName} phải chia cho sai số chuẩn σ/√n");
            }
        });
    }

    [Fact]
    public async Task MeanZScore_ShouldSeparateFacultiesThatDividingByRawSigmaWouldFlatten()
    {
        await RunAsync(async (db, service) =>
        {
            var semesterSurveyId = await SurveyWithResponsesAsync(db);
            if (semesterSurveyId is null) return;

            var result = await service.GetSemesterSurveyNormalizationAsync(semesterSurveyId.Value);
            var data = result.Value!;
            if (data.SchoolStandardDeviation is not > 0 || data.Groups.Count < 2) return;
            var sd = data.SchoolStandardDeviation.Value;

            var notable = ReportThresholds.NotableZScore;

            // Chia thẳng cho σ: đây là phép SAI, giữ lại để chứng minh nó san phẳng.
            var flattened = data.Groups
                .Count(g => Math.Abs((g.AverageScore - data.SchoolAverageScore) / sd) >= notable);
            var correct = data.Groups
                .Count(g => g.MeanZScore is { } z && Math.Abs(z) >= notable);

            correct.Should().BeGreaterThan(flattened,
                "chia cho sai số chuẩn phải tách được nhiều khoa hơn là chia thẳng cho σ");
        });
    }
}
