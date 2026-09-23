namespace UnitTests.InfrastructureTests;

using Domain;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Kiểm chứng phần ghép kết quả phân loại vào báo cáo ý kiến mở, chạy trên cơ sở dữ liệu thật
/// (chỉ đọc). Bỏ qua khi không tìm thấy chuỗi kết nối, giống các bài test DB khác.
///
/// Bài này bắt đúng loại lỗi mà unit test thuần không thấy: quên ghép kết quả phân loại, hoặc
/// đếm tổng bằng một công thức khác với danh sách trả về, khiến KPI lệch so với bảng.
/// </summary>
public sealed class OpenCommentAnalysisReportTests
{
    [Fact]
    public async Task OpenCommentReport_SentimentCountsMatchTheReturnedComments()
    {
        var connectionString = ResolveConnectionString();
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

        var service = new EfReportService(
            db,
            scope.ServiceProvider.GetRequiredService<IMemoryCache>(),
            new SchoolOverviewCacheVersion(),
            new FixedScoringThresholdProvider(),
            new PublishedSurveyPublicationService());

        var report = await service.GetOpenCommentAnalysisAsync(
            null, null, null, null, null, null, null);

        report.TotalComments.Should().Be(report.Comments.Count);
        report.Comments.Should().NotBeEmpty("cơ sở dữ liệu đang có ý kiến mở để kiểm tra");

        // Đã phân tích + chưa phân tích phải phủ đúng tổng số ý kiến, không thừa không thiếu.
        (report.AnalyzedCommentCount + report.PendingAnalysisCount)
            .Should().Be(report.TotalComments);

        report.UncertainCount.Should().Be(
            report.Comments.Count(x => x.Sentiment == OpenCommentSentiments.Uncertain));
        report.ManuallyReviewedCount.Should().Be(
            report.Comments.Count(x => x.IsManuallyReviewed));

        foreach (var item in report.Comments)
        {
            if (item.Sentiment is null)
            {
                item.SentimentLabel.Should().BeNull();
                continue;
            }

            OpenCommentSentiments.IsValid(item.Sentiment).Should().BeTrue(
                $"nhãn '{item.Sentiment}' phải thuộc bộ nhãn của phiên bản 1");
            item.SentimentLabel.Should().NotBeNullOrWhiteSpace();
            item.Confidence.Should().NotBeNull();
            item.Confidence!.Value.Should().BeInRange(0m, 1m);
        }

        report.SentimentBreakdown.Sum(x => x.Count).Should().Be(report.AnalyzedCommentCount);

        foreach (var bucket in report.SentimentBreakdown)
        {
            OpenCommentSentiments.IsValid(bucket.Sentiment).Should().BeTrue();
            bucket.Count.Should().BeGreaterThan(0, "nhãn không có ý kiến nào thì không xuất hiện");

            var expected = Math.Round(
                (decimal)bucket.Count / report.AnalyzedCommentCount * 100m, 1);
            bucket.Percentage.Should().Be(expected);
        }
    }

    /// <summary>
    /// Lấy chuỗi kết nối từ biến môi trường, nếu không có thì đọc tệp .env ở gốc kho mã nguồn.
    /// Tệp .env bị Git bỏ qua nên trên máy khác bài test sẽ tự bỏ qua thay vì báo lỗi đỏ.
    /// </summary>
    private static string? ResolveConnectionString()
    {
        var fromEnvironment = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
        if (!string.IsNullOrWhiteSpace(fromEnvironment)) return fromEnvironment;

        if (TestPaths.Root is null) return null;
        var envFile = Path.Combine(TestPaths.Root, ".env");
        if (!File.Exists(envFile)) return null;

        foreach (var line in File.ReadLines(envFile))
        {
            var trimmed = line.Trim();
            const string prefix = "ConnectionStrings__DefaultConnection=";
            if (trimmed.StartsWith(prefix, StringComparison.Ordinal))
            {
                return trimmed[prefix.Length..].Trim();
            }
        }

        return null;
    }
}
