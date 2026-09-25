namespace UnitTests.InfrastructureTests;

using Application;
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
/// Không phát hành được khi bộ điểm đã chốt chưa gồm đủ phiếu: phát hành xong thì nút Cập nhật
/// điểm bị khoá, nên phiếu nào lọt ra ngoài lần tính cuối sẽ thiếu hẳn trong số đơn vị được xem.
///
/// Chạy trên cơ sở dữ liệu thật, mọi thay đổi nằm trong một transaction rồi rollback.
/// Không đặt biến môi trường <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class SurveyPublicationScoresTests
{
    private sealed class NoCurrentUser : ICurrentUserAccessor
    {
        public Guid? UserId => null;

        public string? UserEmail => null;

        public Guid? ProfileId => null;
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    /// <summary>
    /// Dựng một đợt đã kết thúc, chưa phát hành, và mọi lớp đã được tính điểm khớp đúng số phiếu
    /// hiện có — tức trạng thái phát hành được. Mỗi test sau đó làm lệch đúng một chỗ.
    /// </summary>
    private static async Task RunInRollbackAsync(
        Func<AppDbContext, EfSurveyPublicationService, int, Task> body)
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

        var semesterSurveyId = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => db.SurveyResponses.Any(r => r.CourseSectionSurveyId == x.CourseSectionSurveyId))
            .Select(x => x.SemesterSurveyId)
            .FirstOrDefaultAsync();
        if (semesterSurveyId == 0) return;

        await using var transaction = await db.Database.BeginTransactionAsync();
        try
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE "SemesterSurveys" SET "EndTime" = NOW() - INTERVAL '1 day'
                WHERE "SemesterSurveyId" = {semesterSurveyId};

                UPDATE "CourseSectionSurveys" css
                SET "ScoreCalculatedAt" = NOW(),
                    "TotalResponseCount" = (
                        SELECT count(*) FROM "SurveyResponses" r
                        WHERE r."CourseSectionSurveyId" = css."CourseSectionSurveyId"
                          AND NOT r."IsDeleted")
                WHERE css."SemesterSurveyId" = {semesterSurveyId};

                INSERT INTO "SurveyScoringChangeLogs"
                    ("Kind", "SemesterSurveyId", "MinimumResponseRate", "MinimumValidRate",
                     "RejectTooFast", "RejectSingleAnswer", "RejectAttentionCheckFailed",
                     "ChangedByName", "ChangedAt")
                VALUES ('RESULTS_UNPUBLISHED', {semesterSurveyId}, 50, 80, TRUE, TRUE, TRUE,
                        'kiem-thu', NOW());
                """);

            var service = new EfSurveyPublicationService(
                db,
                new FixedUserScopeResolver(UserScope.Unrestricted(RoleCodes.Admin)),
                new NoCurrentUser(),
                new FixedScoringThresholdProvider());

            await body(db, service, semesterSurveyId);
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }

    [Fact]
    public async Task Publish_WhenScoresCoverEveryResponse_Succeeds()
    {
        await RunInRollbackAsync(async (_, service, semesterSurveyId) =>
        {
            var result = await service.SetAsync(semesterSurveyId, publish: true);

            result.Succeeded.Should().BeTrue(result.ErrorCode);
            result.Value!.IsPublished.Should().BeTrue();
        });
    }

    [Fact]
    public async Task Publish_WhenResponsesArrivedAfterLatestScores_IsRejected()
    {
        await RunInRollbackAsync(async (db, service, semesterSurveyId) =>
        {
            // Số đã chụp lúc tính thiếu một phiếu so với hiện tại: đúng cảnh phiếu về sau lần tính.
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE "CourseSectionSurveys" SET "TotalResponseCount" = "TotalResponseCount" - 1
                WHERE "CourseSectionSurveyId" = (
                    SELECT css."CourseSectionSurveyId" FROM "CourseSectionSurveys" css
                    WHERE css."SemesterSurveyId" = {semesterSurveyId} AND css."TotalResponseCount" > 0
                    LIMIT 1);
                """);

            var result = await service.SetAsync(semesterSurveyId, publish: true);

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(SurveyErrorCodes.ScoresOutdated);
        });
    }

    [Fact]
    public async Task Publish_WhenSomeSectionWasNeverScored_IsRejected()
    {
        await RunInRollbackAsync(async (db, service, semesterSurveyId) =>
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE "CourseSectionSurveys" SET "ScoreCalculatedAt" = NULL
                WHERE "CourseSectionSurveyId" = (
                    SELECT "CourseSectionSurveyId" FROM "CourseSectionSurveys"
                    WHERE "SemesterSurveyId" = {semesterSurveyId}
                    LIMIT 1);
                """);

            var result = await service.SetAsync(semesterSurveyId, publish: true);

            result.ErrorCode.Should().Be(SurveyErrorCodes.ScoresOutdated);
        });
    }
}
