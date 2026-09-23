using Application.Reports;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SentimentWorker.Sentiment;

/// <summary>Mã thoát của tiến trình worker, dùng làm tín hiệu "sức khoẻ" cho cron/CI.</summary>
internal static class SentimentWorkerExitCodes
{
    public const int Success = 0;

    /// <summary>Không nạp được model (thiếu tệp, sai định dạng, hết bộ nhớ).</summary>
    public const int ModelUnavailable = 2;

    /// <summary>Nạp được model nhưng có lô phân tích thất bại.</summary>
    public const int BatchFailed = 3;
}

/// <summary>Cách chạy của worker trong lần khởi động này.</summary>
/// <param name="Once">
/// True: quét cho hết hàng đợi rồi thoát, trả mã thoát theo kết quả. Đây là chế độ khuyến nghị —
/// máy chủ 1–2 vCPU không nên ôm model thường trực.
/// </param>
/// <param name="Interval">Khoảng nghỉ giữa hai vòng khi chạy ở chế độ theo dõi.</param>
public sealed record SentimentWorkerRunSettings(bool Once, TimeSpan Interval);

/// <summary>
/// Phân tích cảm xúc các ý kiến mở theo lô, chạy trong tiến trình RIÊNG với API.
///
/// Vì sao tách khỏi API: model chiếm khoảng 0,7 GB RAM và cần một nhân CPU khi suy luận. Trên máy
/// chủ 1–2 vCPU / 2–4 GB, nạp model vào tiến trình API là lấy mất một phần tư bộ nhớ và giành CPU
/// với chính request đang phục vụ — cho một tính năng phụ. Tách ra thì API không biết gì về ONNX,
/// còn phần suy luận chỉ chạy khi có người chủ động chạy nó.
///
/// Worker chỉ ghi nhãn và xác suất, KHÔNG bao giờ sửa nội dung ý kiến, và không ghi nội dung
/// ý kiến vào log.
/// </summary>
public sealed class OpenCommentAnalysisWorker(
    IServiceScopeFactory scopeFactory,
    IOpenCommentClassifier classifier,
    IOptions<OpenCommentSentimentOptions> options,
    SentimentWorkerRunSettings runSettings,
    IHostApplicationLifetime lifetime,
    ILogger<OpenCommentAnalysisWorker> logger) : BackgroundService
{
    /// <summary>
    /// Từ mức này trở xuống thì chế độ theo dõi liên tục đáng bị cảnh báo trong nhật ký. Hai nhân
    /// là ngưỡng của máy chủ triển khai thật: model lấy một nhân, API còn đúng một nhân.
    /// </summary>
    private const int WatchModeWarningCoreThreshold = 2;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var exitCode = SentimentWorkerExitCodes.Success;

        try
        {
            exitCode = runSettings.Once
                ? await DrainAsync(stoppingToken).ConfigureAwait(false)
                : await WatchAsync(stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Dừng theo yêu cầu (Ctrl+C, docker stop) không phải lỗi.
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Worker phân tích cảm xúc dừng vì lỗi không mong đợi");
            exitCode = SentimentWorkerExitCodes.BatchFailed;
        }
        finally
        {
            Environment.ExitCode = exitCode;
            if (runSettings.Once)
            {
                lifetime.StopApplication();
            }
        }
    }

    /// <summary>Quét cho tới khi hết hàng đợi rồi trả mã thoát.</summary>
    private async Task<int> DrainAsync(CancellationToken cancellationToken)
    {
        var scanLimit = Math.Max(1, options.Value.MaxCommentsPerScan);
        var inserted = 0;
        var updated = 0;

        while (!cancellationToken.IsCancellationRequested)
        {
            BatchOutcome outcome;
            try
            {
                outcome = await RunCycleAsync(scanLimit, cancellationToken).ConfigureAwait(false);
            }
            catch (InvalidOperationException exception)
            {
                // Nhánh này gần như luôn là "chưa nạp được model".
                logger.LogError("Không chạy được phân tích cảm xúc: {Reason}", exception.Message);
                return SentimentWorkerExitCodes.ModelUnavailable;
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogError(
                    exception,
                    "Một lô phân tích cảm xúc thất bại; trước đó đã thêm mới {Inserted} và cập nhật {Updated}",
                    inserted,
                    updated);
                return SentimentWorkerExitCodes.BatchFailed;
            }

            inserted += outcome.Inserted;
            updated += outcome.Updated;

            if (outcome.Processed == 0)
            {
                break;
            }
        }

        logger.LogInformation(
            "Phân tích cảm xúc kết thúc: thêm {Inserted}, cập nhật {Updated}, model {ModelVersion}",
            inserted,
            updated,
            classifier.ModelVersion);
        return SentimentWorkerExitCodes.Success;
    }

    /// <summary>Quét lặp vô hạn, dùng khi muốn phân tích ngay khi có phiếu mới.</summary>
    private async Task<int> WatchAsync(CancellationToken stoppingToken)
    {
        var scanLimit = Math.Max(1, options.Value.MaxCommentsPerScan);
        var idleUnloadSeconds = Math.Max(0, options.Value.IdleUnloadSeconds);

        logger.LogInformation(
            "Worker phân tích cảm xúc theo dõi liên tục: model {ModelVersion}, mỗi vòng tối đa {ScanLimit} ý kiến, nghỉ {Interval} giây, trả model sau {IdleSeconds} giây rảnh",
            classifier.ModelVersion,
            scanLimit,
            runSettings.Interval.TotalSeconds,
            idleUnloadSeconds);

        // Chế độ theo dõi giữ model thường trực trong bộ nhớ (~1,0 GB RSS) và không nhả nhân CPU
        // giữa các vòng. Trên máy 1–2 vCPU dùng chung với API, đó là lấy mất một nửa máy cho một
        // tính năng phụ. Không chặn — máy dev cần chế độ này — nhưng phải nói ra thành tiếng,
        // vì "chạy được" và "nên chạy" là hai chuyện khác nhau.
        if (Environment.ProcessorCount <= WatchModeWarningCoreThreshold)
        {
            logger.LogWarning(
                "Máy chủ chỉ có {CoreCount} nhân CPU: chạy theo dõi liên tục sẽ giữ model thường trực "
                    + "(khoảng 1,0 GB RAM) và chiếm một nhân suốt thời gian chạy, làm chậm tiến trình API "
                    + "dùng chung máy. Trên máy 1–2 vCPU nên chạy một lượt theo lịch (systemd timer trong "
                    + "deploy/systemd/) thay vì --watch.",
                Environment.ProcessorCount);
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCycleAsync(scanLimit, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (InvalidOperationException exception)
            {
                // Ghi cảnh báo không kèm stack để nhật ký không ngập một lỗi lặp lại mỗi vòng quét.
                logger.LogWarning("Bỏ qua một vòng phân tích cảm xúc: {Reason}", exception.Message);
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Một vòng phân tích cảm xúc thất bại, sẽ thử lại vòng sau");
            }

            // Chạy nền mà ôm model suốt ngày là mất 1 GB RAM trên máy chủ 4 GB. Nhả model khi đã
            // lâu không có việc, giữ lại tiến trình để vòng quét kế tiếp vẫn kịp bắt ý kiến mới.
            // Đây là điều kiện để "bấm là có ngay" không phải trả giá bằng RAM thường trực.
            if (idleUnloadSeconds > 0
                && classifier.IsReady
                && DateTime.UtcNow - classifier.LastUsedAtUtc >= TimeSpan.FromSeconds(idleUnloadSeconds))
            {
                classifier.Release();
            }

            try
            {
                await Task.Delay(runSettings.Interval, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        return SentimentWorkerExitCodes.Success;
    }

    private async Task<BatchOutcome> RunCycleAsync(int scanLimit, CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var modelVersion = classifier.ModelVersion;
        var ruleVersion = options.Value.EffectiveRuleVersion;

        // "Chưa phân tích" gồm hai nhóm: phiếu chưa có dòng kết quả, và phiếu có dòng kết quả do
        // model cũ HOẶC quy tắc cũ sinh ra. Phải xét cả hai phiên bản: nhãn không chỉ phụ thuộc
        // model mà còn phụ thuộc quy tắc suy ra Mixed/Uncertain và hai ngưỡng của nó. Chỉ so
        // ModelVersion như trước là bỏ lọt trường hợp đổi quy tắc, và kết quả cũ nằm im mãi.
        // Nội dung ý kiến không bao giờ bị sửa nên không cần so hash ở đây; trường hợp nội dung
        // đổi phải dùng chức năng chạy lại có ép buộc.
        var pending = await db.SurveyResponses.AsNoTracking()
            .Where(response => response.AdditionalComments != null
                && response.AdditionalComments.Trim() != ""
                && !db.OpenCommentAnalysisResults.Any(result =>
                    result.SurveyResponseId == response.ResponseId
                    && result.ModelVersion == modelVersion
                    && result.RuleVersion == ruleVersion))
            .OrderBy(response => response.ResponseId)
            .Take(scanLimit)
            .Select(response => new { response.ResponseId, response.AdditionalComments })
            .ToListAsync(cancellationToken);

        if (pending.Count == 0)
        {
            return new BatchOutcome(0, 0, 0);
        }

        var texts = pending
            .Select(x => x.AdditionalComments!.Trim())
            .ToList();

        var predictions = await classifier.ClassifyAsync(texts, cancellationToken).ConfigureAwait(false);
        if (predictions.Count != pending.Count)
        {
            throw new InvalidOperationException(
                $"Bộ phân loại trả về {predictions.Count} kết quả cho {pending.Count} ý kiến.");
        }

        var responseIds = pending.Select(x => x.ResponseId).ToList();
        var existing = await db.OpenCommentAnalysisResults
            .Where(x => responseIds.Contains(x.SurveyResponseId))
            .ToDictionaryAsync(x => x.SurveyResponseId, cancellationToken);

        var analyzedAt = DateTime.UtcNow;
        var inserted = 0;
        var updated = 0;

        for (var i = 0; i < pending.Count; i++)
        {
            var prediction = predictions[i];
            var contentHash = OpenCommentContentNormalizer.ComputeHash(texts[i]);

            if (existing.TryGetValue(pending[i].ResponseId, out var row))
            {
                row.Sentiment = prediction.Sentiment;
                row.Confidence = ToDecimal(prediction.Confidence);
                row.PositiveScore = ToDecimal(prediction.PositiveScore);
                row.NegativeScore = ToDecimal(prediction.NegativeScore);
                row.NeutralScore = ToDecimal(prediction.NeutralScore);
                row.ModelVersion = modelVersion;
                row.RuleVersion = ruleVersion;
                row.ContentHash = contentHash;
                row.AnalyzedAt = analyzedAt;
                updated++;
                continue;
            }

            db.OpenCommentAnalysisResults.Add(new OpenCommentAnalysisResult
            {
                SurveyResponseId = pending[i].ResponseId,
                Sentiment = prediction.Sentiment,
                Confidence = ToDecimal(prediction.Confidence),
                PositiveScore = ToDecimal(prediction.PositiveScore),
                NegativeScore = ToDecimal(prediction.NegativeScore),
                NeutralScore = ToDecimal(prediction.NeutralScore),
                ModelVersion = modelVersion,
                RuleVersion = ruleVersion,
                ContentHash = contentHash,
                AnalyzedAt = analyzedAt,
            });
            inserted++;
        }

        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Phân tích cảm xúc xong một lô: thêm {Inserted}, cập nhật {Updated}, model {ModelVersion}, quy tắc {RuleVersion}",
            inserted,
            updated,
            modelVersion,
            ruleVersion);

        return new BatchOutcome(pending.Count, inserted, updated);
    }

    private static decimal ToDecimal(double value) =>
        Math.Round((decimal)Math.Clamp(value, 0d, 1d), 5, MidpointRounding.AwayFromZero);

    private sealed record BatchOutcome(int Processed, int Inserted, int Updated);
}
