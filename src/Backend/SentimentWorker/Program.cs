using Application.Reports;
using Infrastructure.Configuration;
using Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SentimentWorker.Sentiment;

// Nạp .env khi chạy ở máy dev, giống tiến trình API. Ở môi trường thật thì biến môi trường
// do nền tảng triển khai cấp nên bước này không làm gì.
LocalEnvironmentFile.LoadNearest();

var watch = args.Contains("--watch", StringComparer.OrdinalIgnoreCase);

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddHttpContextAccessor();
builder.Services.AddPersistence(builder.Configuration);

// Chế độ mặc định là chạy một lượt rồi thoát: máy chủ chỉ có 1–2 vCPU nên model không được
// nằm thường trực trong bộ nhớ. Truyền --watch khi muốn nó theo dõi liên tục.
builder.Services.AddSingleton(new SentimentWorkerRunSettings(
    Once: !watch,
    Interval: ResolveInterval(builder.Configuration)));

builder.Services.AddSentimentInference(builder.Configuration);

using var host = builder.Build();
await host.RunAsync();

// Mã thoát là tín hiệu sức khoẻ cho cron/người vận hành: 0 xong xuôi, 2 không nạp được model,
// 3 có lô thất bại. Không cần mở cổng HTTP cho một tiến trình chạy theo lô.
return Environment.ExitCode;

static TimeSpan ResolveInterval(IConfiguration configuration)
{
    var configured = configuration.GetValue<int?>(
        $"{OpenCommentSentimentOptions.SectionName}:ScanIntervalSeconds");
    return TimeSpan.FromSeconds(Math.Max(15, configured ?? 120));
}
