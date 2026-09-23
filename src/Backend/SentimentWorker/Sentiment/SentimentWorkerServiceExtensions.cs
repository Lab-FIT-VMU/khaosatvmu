using Application.Reports;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace SentimentWorker.Sentiment;

/// <summary>Đăng ký phần suy luận cảm xúc cho tiến trình worker.</summary>
public static class SentimentWorkerServiceExtensions
{
    public static IServiceCollection AddSentimentInference(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<OpenCommentSentimentOptions>(
            configuration.GetSection(OpenCommentSentimentOptions.SectionName));

        // Singleton: model hơn 500 MB, nạp một lần cho cả tiến trình và dùng lại cho mọi lô.
        services.AddSingleton<IOpenCommentClassifier, OnnxOpenCommentClassifier>();
        services.AddHostedService<OpenCommentAnalysisWorker>();

        return services;
    }
}
