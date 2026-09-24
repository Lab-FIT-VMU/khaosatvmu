using System.Globalization;
using System.Text.Json;
using Application;
using Application.Auth;
using Application.Reports;
using Application.Surveys;
using Domain;
using Infrastructure.Persistence;
using Infrastructure.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Infrastructure.Sentiment;

/// <summary>
/// Nghiệp vụ quản trị kết quả phân loại cảm xúc: xem trạng thái, chạy lại phân tích và hiệu
/// chỉnh nhãn.
///
/// Mọi truy vấn ở đây đi qua <see cref="VisibleSurveyScope"/> giống hệt màn báo cáo, nên một
/// endpoint quản trị của tính năng AI cũng không nhìn thấy lớp mà người gọi không được xem.
///
/// Service này KHÔNG phụ thuộc model. Nó chỉ đọc/ghi bảng kết quả; việc suy luận do tiến trình
/// SentimentWorker làm, nên API không phải trả RAM cho model và cũng không thể vô tình nạp nó.
/// </summary>
public sealed class EfOpenCommentAnalysisService(
    AppDbContext db,
    ISurveyPublicationService publication,
    IUserScopeResolver userScope,
    IOptions<OpenCommentSentimentOptions> options,
    ICurrentUserAccessor currentUser,
    ILogger<EfOpenCommentAnalysisService> logger) : IOpenCommentAnalysisService
{
    private static readonly JsonSerializerOptions AuditJson = new() { WriteIndented = false };

    /// <inheritdoc />
    public async Task<OpenCommentModelStatusDto> GetModelStatusAsync(
        CancellationToken cancellationToken = default)
    {
        var settings = options.Value;
        var sectionSurveyIds = await VisibleSectionSurveyIdsAsync(null, null, cancellationToken);

        var analyzedQuery = VisibleAnalyzedResults(sectionSurveyIds);
        var analyzedRecordCount = await analyzedQuery.CountAsync(cancellationToken);
        var manuallyReviewedCount = await analyzedQuery
            .CountAsync(x => x.ManualSentiment != null, cancellationToken);
        // "Còn dùng được" là phải đúng CẢ model lẫn quy tắc: hai thứ này độc lập với nhau, và
        // trước đây chỉ so model nên đổi quy tắc xong thì mọi dòng vẫn được coi là đã xong.
        var upToDateCount = await analyzedQuery
            .CountAsync(
                x => x.ModelVersion == settings.ModelVersion
                    && x.RuleVersion == settings.EffectiveRuleVersion,
                cancellationToken);

        DateTime? lastAnalyzedAt = null;
        string? latestAnalyzedModelVersion = null;
        string? latestAnalyzedRuleVersion = null;
        if (analyzedRecordCount > 0)
        {
            var latest = await analyzedQuery
                .OrderByDescending(x => x.AnalyzedAt)
                .Select(x => new { x.AnalyzedAt, x.ModelVersion, x.RuleVersion })
                .FirstAsync(cancellationToken);
            lastAnalyzedAt = latest.AnalyzedAt;
            latestAnalyzedModelVersion = latest.ModelVersion;
            latestAnalyzedRuleVersion = latest.RuleVersion;
        }

        var totalComments = await VisibleCommentsQuery(sectionSurveyIds).CountAsync(cancellationToken);

        return new OpenCommentModelStatusDto(
            settings.ModelVersion,
            settings.EffectiveRuleVersion,
            latestAnalyzedModelVersion,
            latestAnalyzedRuleVersion,
            Math.Max(0, totalComments - upToDateCount),
            analyzedRecordCount,
            manuallyReviewedCount,
            settings.ConfidenceThreshold,
            settings.MixedThreshold,
            lastAnalyzedAt);
    }

    /// <inheritdoc />
    public async Task<OpenCommentReanalysisResultDto> ReanalyzeAsync(
        OpenCommentReanalysisRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var settings = options.Value;
        var sectionSurveyIds = await VisibleSectionSurveyIdsAsync(
            request.SemesterId, request.SemesterSurveyId, cancellationToken);

        var commentsQuery = VisibleCommentsQuery(sectionSurveyIds);
        var scannedCount = await commentsQuery.CountAsync(cancellationToken);

        var queuedCount = 0;
        var preservedReviewedCount = 0;

        if (request.Force)
        {
            // KHÔNG xoá những dòng đã được người có quyền hiệu chỉnh tay: nhãn người đặt được
            // lưu CÙNG dòng với kết quả model (cột ManualSentiment), nên xoá dòng là xoá luôn
            // công chấm tay và không có cách nào lấy lại.
            //
            // Bỏ qua chúng cũng đúng về nghiệp vụ chứ không chỉ là né rủi ro: nhãn đang hiển
            // thị của những phiếu này là nhãn của người, nên chạy lại model không đổi được gì
            // người dùng nhìn thấy. Và nó tự lành: nếu sau này quyền hiệu chỉnh được bỏ đi thì
            // dòng vẫn mang phiên bản model cũ, tự rơi lại vào hàng đợi ở lượt quét sau.
            var deletableIds = await commentsQuery
                .Where(x => !db.OpenCommentAnalysisResults.Any(r =>
                    r.SurveyResponseId == x.ResponseId && r.ManualSentiment != null))
                .Select(x => x.ResponseId)
                .ToListAsync(cancellationToken);

            if (deletableIds.Count > 0)
            {
                await db.OpenCommentAnalysisResults
                    .Where(x => deletableIds.Contains(x.SurveyResponseId))
                    .ExecuteDeleteAsync(cancellationToken);
            }

            queuedCount = deletableIds.Count;
            preservedReviewedCount = scannedCount - deletableIds.Count;
        }
        else
        {
            // Không đụng tới nhãn của người ở nhánh này: biểu thức dưới đây chỉ đếm để báo cáo,
            // còn việc chọn phiếu nào cần phân tích là do worker tự quyết theo phiên bản model.
            // Phiếu đã hiệu chỉnh tay mà thiếu phiên bản hiện tại vẫn được đếm, và worker sẽ
            // cập nhật kết quả model của nó — nhánh cập nhật bên worker không ghi vào cột nhãn tay.
            queuedCount = await commentsQuery
                .Where(x => !db.OpenCommentAnalysisResults.Any(r =>
                    r.SurveyResponseId == x.ResponseId
                    && r.ModelVersion == settings.ModelVersion
                    && r.RuleVersion == settings.EffectiveRuleVersion))
                .CountAsync(cancellationToken);
        }

        // Đây chỉ là bước xếp hàng: API không chạy model. Việc phân tích thật do tiến trình
        // SentimentWorker làm, nên bước tiếp theo của người vận hành là chạy worker.
        logger.LogInformation(
            "Đã xếp hàng phân tích lại {QueuedCount}/{ScannedCount} ý kiến với model {ModelVersion} và quy tắc {RuleVersion} (force={Force}, giữ nguyên {PreservedReviewedCount} ý kiến đã hiệu chỉnh tay)",
            queuedCount,
            scannedCount,
            settings.ModelVersion,
            settings.EffectiveRuleVersion,
            request.Force,
            preservedReviewedCount);

        return new OpenCommentReanalysisResultDto(
            scannedCount,
            queuedCount,
            settings.ModelVersion,
            settings.EffectiveRuleVersion,
            preservedReviewedCount);
    }

    /// <inheritdoc />
    public async Task<bool> ReviewAsync(
        int responseId,
        ReviewOpenCommentSentimentRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var requested = (request.Sentiment ?? string.Empty).Trim();
        var clearing = requested.Length == 0;
        if (!clearing && !OpenCommentSentiments.IsValid(requested))
        {
            throw new ArgumentException(
                $"Nhãn '{requested}' không thuộc bộ nhãn cho phép.", nameof(request));
        }

        var sectionSurveyIds = await VisibleSectionSurveyIdsAsync(null, null, cancellationToken);
        var visible = await VisibleCommentsQuery(sectionSurveyIds)
            .AnyAsync(x => x.ResponseId == responseId, cancellationToken);
        if (!visible)
        {
            return false;
        }

        var result = await db.OpenCommentAnalysisResults
            .FirstOrDefaultAsync(x => x.SurveyResponseId == responseId, cancellationToken);
        if (result is null)
        {
            // Chưa phân tích thì chưa có dự đoán nào để sửa. Giao diện chỉ mở nút hiệu chỉnh
            // khi đã có nhãn, nên nhánh này là lời gọi sai chứ không phải lỗi hệ thống.
            return false;
        }

        var previous = result.ManualSentiment;
        var actorId = currentUser.UserId;
        var actorEmail = currentUser.UserEmail;
        var now = DateTime.UtcNow;

        result.ManualSentiment = clearing ? null : requested;
        result.ReviewedByUserId = clearing ? null : actorId;
        result.ReviewedAt = clearing ? null : now;

        // AuditInterceptor cố ý bỏ qua entity này (worker ghi hàng nghìn dòng mỗi lượt quét),
        // nên thao tác thủ công phải tự ghi vết. Vết chỉ chứa nhãn và phiên bản model, không
        // chứa nội dung ý kiến.
        db.ChangeAuditLogs.Add(new ChangeAuditLog
        {
            Id = Guid.NewGuid(),
            TableName = nameof(OpenCommentAnalysisResult),
            RecordId = responseId.ToString(CultureInfo.InvariantCulture),
            Action = clearing ? "REVIEW_CLEAR" : "REVIEW",
            ChangedBy = actorId,
            ChangedByEmail = actorEmail,
            OldValues = JsonSerializer.Serialize(new
            {
                ManualSentiment = previous,
                result.Sentiment,
                result.ModelVersion,
                result.RuleVersion,
            }, AuditJson),
            NewValues = JsonSerializer.Serialize(new
            {
                ManualSentiment = result.ManualSentiment,
                result.Sentiment,
                result.ModelVersion,
                result.RuleVersion,
            }, AuditJson),
            ChangedAt = now,
        });

        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Hiệu chỉnh nhãn cảm xúc cho phiếu {ResponseId}: {Action}",
            responseId,
            clearing ? "bỏ hiệu chỉnh" : "đặt nhãn thủ công");

        return true;
    }

    /// <summary>
    /// Danh sách lớp trong phạm vi người dùng được xem, khoanh tiếp theo học kỳ hoặc đợt nếu có.
    /// </summary>
    private async Task<List<int>> VisibleSectionSurveyIdsAsync(
        int? semesterId,
        int? semesterSurveyId,
        CancellationToken cancellationToken)
    {
        var query = await VisibleSurveyScope.SectionSurveysAsync(db, publication, userScope, cancellationToken);

        if (semesterSurveyId is { } surveyId)
        {
            query = query.Where(x => x.SemesterSurveyId == surveyId);
        }
        else if (semesterId is { } termId)
        {
            // CourseSectionSurvey không có navigation tới SemesterSurvey nên phải tra mã đợt trước.
            var allowed = await db.SemesterSurveys.AsNoTracking()
                .Where(x => x.SemesterId == termId)
                .Select(x => x.SemesterSurveyId)
                .ToListAsync(cancellationToken);
            query = query.Where(x => allowed.Contains(x.SemesterSurveyId));
        }

        return await query
            .Select(x => x.CourseSectionSurveyId)
            .ToListAsync(cancellationToken);
    }

    private IQueryable<SurveyResponse> VisibleCommentsQuery(IReadOnlyCollection<int> sectionSurveyIds) =>
        db.SurveyResponses.AsNoTracking()
            .Where(x => sectionSurveyIds.Contains(x.CourseSectionSurveyId)
                && x.AdditionalComments != null
                && x.AdditionalComments.Trim() != "");

    private IQueryable<OpenCommentAnalysisResult> VisibleAnalyzedResults(
        IReadOnlyCollection<int> sectionSurveyIds) =>
        from result in db.OpenCommentAnalysisResults.AsNoTracking()
        join response in db.SurveyResponses.AsNoTracking()
            on result.SurveyResponseId equals response.ResponseId
        where sectionSurveyIds.Contains(response.CourseSectionSurveyId)
        select result;
}
