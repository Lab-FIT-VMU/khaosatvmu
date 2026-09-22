namespace UnitTests.InfrastructureTests;

using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

public sealed class ReportQueryOptimizationTests
{
    [Fact]
    public async Task SchoolOverview_UsesThePrecalculatedWeakestQuestionRanking()
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = connectionString,
            })
            .Build();
        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
        services.AddMemoryCache();
        services.AddPersistence(configuration);

        await using var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var semesterId = await db.SemesterSurveys.AsNoTracking()
            .GroupBy(x => x.SemesterId)
            .OrderByDescending(group => group.Count())
            .Select(group => group.Key)
            .FirstOrDefaultAsync();
        if (semesterId == 0) return;

        var expectedQuestionIds = await (
            from score in db.CourseSectionSurveyQuestionScores.AsNoTracking()
            join sectionSurvey in db.CourseSectionSurveys.AsNoTracking()
                on score.CourseSectionSurveyId equals sectionSurvey.CourseSectionSurveyId
            join semesterSurvey in db.SemesterSurveys.AsNoTracking()
                on sectionSurvey.SemesterSurveyId equals semesterSurvey.SemesterSurveyId
            where semesterSurvey.SemesterId == semesterId
                // Đúng như bước xếp hạng đầu của service: chỉ lớp ĐÃ CHỐT ĐIỂM.
                && sectionSurvey.AverageScore != null
            group score by score.QuestionId into grouped
            select new
            {
                QuestionId = grouped.Key,
                TotalAnswers = grouped.Sum(x => x.AnswerCount),
                WeightedScore = grouped.Sum(x => (double)x.AverageScore * x.AnswerCount),
            })
            .Where(x => x.TotalAnswers >= 10)
            .OrderBy(x => x.WeightedScore / x.TotalAnswers)
            .ThenByDescending(x => x.TotalAnswers)
            .ThenBy(x => x.QuestionId)
            .Select(x => x.QuestionId)
            .Take(5)
            .ToListAsync();

        var service = new EfReportService(
            db,
            scope.ServiceProvider.GetRequiredService<IMemoryCache>(),
            new SchoolOverviewCacheVersion(),
            new FixedScoringThresholdProvider(),
            new PublishedSurveyPublicationService());
        var overview = await service.GetSchoolSurveyOverviewAsync(semesterId, semesterId);

        overview.Should().NotBeNull();
        // Thứ tự phải là thứ tự của bảng điểm ĐÃ CHỐT (bước xếp hạng đầu), không phải thứ tự
        // xếp lại theo điểm trung bình làm tròn của phiếu sống — xếp lại thì ba câu 114/115/116
        // bằng điểm nhau ở mức 2 chữ số và thứ tự tuỳ vào SQL.
        overview!.WeakestQuestions.Select(x => x.QuestionId)
            .Should().Equal(expectedQuestionIds);
    }
}
