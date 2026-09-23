using Application.Reports;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Infrastructure.Sentiment;

/// <summary>
/// Đăng ký phần <b>đọc và quản trị</b> kết quả cảm xúc cho tiến trình API.
///
/// Cố ý KHÔNG đăng ký gì liên quan tới model: không ONNX, không worker, không nạp trọng số.
/// Model nằm ở project SentimentWorker. Nhờ vậy RAM của API không phụ thuộc vào một model hơn
/// 500 MB, và không có đường nào để API nạp model ngoài ý muốn.
///
/// Hệ quả cần biết: API không biết model có nạp được hay không. Trạng thái trong
/// <see cref="OpenCommentModelStatusDto"/> vì thế suy ra từ cơ sở dữ liệu (đã phân tích bao
/// nhiêu, phiên bản nào, lần cuối khi nào) chứ không hỏi trực tiếp model.
/// </summary>
public static class OpenCommentSentimentServiceExtensions
{
    public static IServiceCollection AddOpenCommentSentimentReporting(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<OpenCommentSentimentOptions>(
            configuration.GetSection(OpenCommentSentimentOptions.SectionName));

        services.AddScoped<IOpenCommentAnalysisService, EfOpenCommentAnalysisService>();

        return services;
    }
}
