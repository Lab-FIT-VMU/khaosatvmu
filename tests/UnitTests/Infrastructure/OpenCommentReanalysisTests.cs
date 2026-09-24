namespace UnitTests.InfrastructureTests;

using Application;
using Application.Reports;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Sentiment;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

/// <summary>
/// Chạy lại phân tích KHÔNG được xoá nhãn do người có quyền hiệu chỉnh tay.
///
/// Nhãn của người được lưu ở cột <c>ManualSentiment</c> trên CHÍNH dòng kết quả của model.
/// Bản cài đặt đầu tiên của chế độ ép buộc xoá cả dòng để worker phân tích lại, và như vậy
/// là xoá luôn công chấm tay mà không có đường lấy lại — người vận hành bấm một nút trong
/// màn quản trị là mất sạch hiệu chỉnh của cả học kỳ.
///
/// Test chạy trên cơ sở dữ liệu thật vì thứ cần kiểm là câu lệnh xoá của EF; provider giả
/// thì không kiểm được gì. Mọi thay đổi nằm trong một transaction rồi rollback. Không đặt
/// biến môi trường <c>ConnectionStrings__DefaultConnection</c> thì test tự bỏ qua.
/// </summary>
public class OpenCommentReanalysisTests
{
    private sealed class FakeCurrentUser(Guid userId) : ICurrentUserAccessor
    {
        public Guid? UserId { get; } = userId;

        public string? UserEmail => "kiem-thu@vimaru.edu.vn";

        public Guid? ProfileId => null;
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static EfOpenCommentAnalysisService BuildService(
        AppDbContext db,
        Guid actorId,
        OpenCommentSentimentOptions? settings = null) =>
        new(
            db,
            new PublishedSurveyPublicationService(),
            new FixedUserScopeResolver(),
            Options.Create(settings ?? new OpenCommentSentimentOptions { ModelVersion = "kiem-thu-v1" }),
            new FakeCurrentUser(actorId),
            NullLogger<EfOpenCommentAnalysisService>.Instance);

    private static async Task RunInRollbackAsync(
        Func<AppDbContext, EfOpenCommentAnalysisService, Guid, Task> body)
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

        // ChangeAuditLogs.ChangedBy có khoá ngoại tới Users, nên người thao tác phải là
        // một tài khoản có thật. Trong hệ thống thật thì người đang đăng nhập luôn có thật.
        var actorId = await db.Users.AsNoTracking()
            .OrderBy(x => x.Id)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync();
        if (actorId is null) return;

        await using var transaction = await db.Database.BeginTransactionAsync();
        try
        {
            await body(db, BuildService(db, actorId.Value), actorId.Value);
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }

    /// <summary>Hai ý kiến đã có kết quả phân tích, để một cái đem chấm tay còn một cái đối chứng.</summary>
    private static async Task<List<int>> PickAnalyzedResponseIdsAsync(AppDbContext db, int count)
    {
        return await db.OpenCommentAnalysisResults.AsNoTracking()
            .Where(x => db.SurveyResponses.Any(r =>
                r.ResponseId == x.SurveyResponseId
                && r.AdditionalComments != null
                && r.AdditionalComments.Trim() != ""))
            .OrderBy(x => x.SurveyResponseId)
            .Select(x => x.SurveyResponseId)
            .Take(count)
            .ToListAsync();
    }

    [Fact]
    public async Task Force_ShouldKeepManuallyReviewedLabels_AndOnlyQueueTheRest()
    {
        await RunInRollbackAsync(async (db, service, _) =>
        {
            var responseIds = await PickAnalyzedResponseIdsAsync(db, 2);
            if (responseIds.Count < 2) return;

            var reviewedId = responseIds[0];
            var untouchedId = responseIds[1];

            var before = await db.OpenCommentAnalysisResults.AsNoTracking()
                .SingleAsync(x => x.SurveyResponseId == reviewedId);

            (await service.ReviewAsync(reviewedId, new ReviewOpenCommentSentimentRequest("Negative")))
                .Should().BeTrue("phiếu đã có kết quả phân tích thì phải hiệu chỉnh được");

            var result = await service.ReanalyzeAsync(
                new OpenCommentReanalysisRequest(Force: true));

            db.ChangeTracker.Clear();

            var reviewedAfter = await db.OpenCommentAnalysisResults.AsNoTracking()
                .SingleOrDefaultAsync(x => x.SurveyResponseId == reviewedId);

            reviewedAfter.Should().NotBeNull("xoá dòng kết quả là xoá luôn nhãn chấm tay");
            reviewedAfter!.ManualSentiment.Should().Be("Negative");
            reviewedAfter.Sentiment.Should().Be(before.Sentiment, "kết quả model cũ phải còn nguyên");
            reviewedAfter.ModelVersion.Should().Be(before.ModelVersion);

            (await db.OpenCommentAnalysisResults.AsNoTracking()
                .AnyAsync(x => x.SurveyResponseId == untouchedId))
                .Should().BeFalse("phiếu không được chấm tay thì phải bị đẩy lại vào hàng đợi");

            result.PreservedReviewedCount.Should().BeGreaterThanOrEqualTo(1);
            result.PreservedReviewedCount.Should().Be(
                result.ScannedCount - result.QueuedCount,
                "hàng đợi nhỏ hơn phạm vi quét đúng bằng phần đã được chấm tay");
        });
    }

    [Fact]
    public async Task Reanalyze_WithoutForce_ShouldNotTouchAnyResultRow()
    {
        await RunInRollbackAsync(async (db, service, _) =>
        {
            var responseIds = await PickAnalyzedResponseIdsAsync(db, 1);
            if (responseIds.Count == 0) return;

            var responseId = responseIds[0];
            var beforeCount = await db.OpenCommentAnalysisResults.CountAsync();

            var result = await service.ReanalyzeAsync(new OpenCommentReanalysisRequest());

            result.PreservedReviewedCount.Should().Be(0);
            (await db.OpenCommentAnalysisResults.CountAsync())
                .Should().Be(beforeCount, "không ép buộc thì chỉ đếm chứ không xoá gì");
            (await db.OpenCommentAnalysisResults.AsNoTracking()
                .AnyAsync(x => x.SurveyResponseId == responseId))
                .Should().BeTrue();
        });
    }

    /// <summary>
    /// Đổi QUY TẮC mà không đổi model thì kết quả cũ vẫn phải được coi là còn nợ.
    ///
    /// Đây là lỗ hổng đã ghi ở mục 5.8 của kế hoạch: bản sửa quy tắc Mixed (20/09/2026) đổi cách
    /// xét mệnh đề nhưng `ModelVersion` giữ nguyên `phobert-neu-esc-v1`, nên chế độ chạy lại KHÔNG
    /// ép buộc coi mọi dòng là "đã đúng phiên bản" và bỏ qua hết — nhãn cũ nằm im, giao diện không
    /// báo gì. Test này khoá lại hành vi đúng: cùng model, khác quy tắc thì vẫn còn nợ.
    /// </summary>
    [Fact]
    public async Task ChangingOnlyTheRuleVersion_ShouldPutEveryResultBackInTheQueue()
    {
        await RunInRollbackAsync(async (db, _, actorId) =>
        {
            var sampleModelVersion = await db.OpenCommentAnalysisResults.AsNoTracking()
                .OrderBy(x => x.SurveyResponseId)
                .Select(x => x.ModelVersion)
                .FirstOrDefaultAsync();
            if (sampleModelVersion is null) return;

            // Model thì trùng với dòng đang có trong cơ sở dữ liệu; quy tắc thì chưa từng chạy.
            var service = BuildService(db, actorId, new OpenCommentSentimentOptions
            {
                ModelVersion = sampleModelVersion,
                RuleVersion = "quy-tac-chua-tung-chay",
            });

            var result = await service.ReanalyzeAsync(new OpenCommentReanalysisRequest());
            if (result.ScannedCount == 0) return;

            result.QueuedCount.Should().Be(
                result.ScannedCount,
                "kết quả cũ được sinh bởi quy tắc khác nên phải còn nợ, dù model không đổi");
            result.RuleVersion.Should().StartWith(
                "quy-tac-chua-tung-chay",
                "kết quả trả về phải nói rõ quy tắc nào sẽ sinh ra nhãn mới");
        });
    }
}
