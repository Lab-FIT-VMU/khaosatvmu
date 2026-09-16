using Application;
using Application.Auth;
using Application.Surveys;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Surveys;

/// <summary>
/// Đọc cặp ngưỡng tính điểm từ bảng một dòng "SurveyScoringSettings". Bảng chưa
/// có dòng nào — cơ sở dữ liệu cũ chưa chạy seed — thì trả về mặc định của hệ
/// thống chứ không ném lỗi, để mọi báo cáo vẫn chạy được.
///
/// Kiêm luôn việc ghi và đọc lịch sử "SurveyScoringChangeLogs": mỗi lần đổi cấu hình
/// hoặc tính lại điểm, để báo cho người dùng khác biết số đang xem thuộc cấu hình nào.
/// </summary>
public sealed class EfScoringThresholdProvider(
    AppDbContext db,
    IUserScopeResolver userScope,
    ICurrentUserAccessor currentUser)
    : IScoringThresholdProvider
{
    /// <summary>Bảng cấu hình chỉ có đúng một dòng, khoá cố định.</summary>
    private const int SettingId = 1;

    /// <summary>Người vắng lâu quay lại chỉ cần mấy lần gần nhất, không dội cả lịch sử.</summary>
    private const int MaximumFeedItems = 10;

    public async Task<ScoringThresholds> GetAsync(CancellationToken cancellationToken = default)
    {
        var setting = await db.SurveyScoringSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.SurveyScoringSettingId == SettingId, cancellationToken);

        return setting is null
            ? ScoringThresholds.Default
            : new ScoringThresholds(
                setting.MinimumResponseRate,
                setting.MinimumValidRate,
                setting.RejectTooFast,
                setting.RejectSingleAnswer,
                setting.RejectAttentionCheckFailed);
    }

    public async Task<SurveyOperationResult<ScoringThresholds>> UpdateAsync(
        ScoringThresholds thresholds,
        CancellationToken cancellationToken = default)
    {
        // Đổi ngưỡng là đổi tập lớp được tính điểm của cả trường, nên chỉ quản trị.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.SeesEverything)
        {
            return new SurveyOperationResult<ScoringThresholds>(
                false, SurveyErrorCodes.OutOfScope, default);
        }

        if (!thresholds.IsValid)
        {
            return new SurveyOperationResult<ScoringThresholds>(
                false, SurveyErrorCodes.ScoringThresholdInvalid, default);
        }

        var previous = await GetAsync(cancellationToken);

        var setting = await db.SurveyScoringSettings
            .FirstOrDefaultAsync(x => x.SurveyScoringSettingId == SettingId, cancellationToken);

        if (setting is null)
        {
            setting = new SurveyScoringSetting { SurveyScoringSettingId = SettingId };
            db.SurveyScoringSettings.Add(setting);
        }

        var now = DateTime.UtcNow;
        setting.MinimumResponseRate = thresholds.MinimumResponseRate;
        setting.MinimumValidRate = thresholds.MinimumValidRate;
        setting.RejectTooFast = thresholds.RejectTooFast;
        setting.RejectSingleAnswer = thresholds.RejectSingleAnswer;
        setting.RejectAttentionCheckFailed = thresholds.RejectAttentionCheckFailed;
        setting.UpdatedAt = now;

        // Bấm lưu mà không đổi gì thì không báo ai: không có gì để nhầm lẫn.
        if (previous != thresholds)
        {
            db.SurveyScoringChangeLogs.Add(
                await NewLogAsync(ScoringChangeKinds.ConfigUpdated, null, thresholds, now, cancellationToken));
        }

        await db.SaveChangesAsync(cancellationToken);

        return new SurveyOperationResult<ScoringThresholds>(true, null, thresholds);
    }

    public async Task RecordRecalculationAsync(
        int semesterSurveyId,
        ScoringThresholds usedThresholds,
        DateTime calculatedAt,
        CancellationToken cancellationToken = default)
    {
        db.SurveyScoringChangeLogs.Add(await NewLogAsync(
            ScoringChangeKinds.ScoresRecalculated,
            semesterSurveyId,
            usedThresholds,
            calculatedAt,
            cancellationToken));
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<ScoringChangeFeedDto> GetChangesAsync(
        long? afterId,
        CancellationToken cancellationToken = default)
    {
        var latestId = await db.SurveyScoringChangeLogs.AsNoTracking()
            .MaxAsync(x => (long?)x.SurveyScoringChangeLogId, cancellationToken) ?? 0;

        if (afterId is null || afterId >= latestId)
        {
            return new ScoringChangeFeedDto(latestId, []);
        }

        // Người vừa thao tác đã biết mình làm gì, không báo lại cho chính họ.
        var callerId = currentUser.UserId;
        var logs = await db.SurveyScoringChangeLogs.AsNoTracking()
            .Where(x => x.SurveyScoringChangeLogId > afterId
                && (callerId == null || x.ChangedByUserId == null || x.ChangedByUserId != callerId))
            .OrderByDescending(x => x.SurveyScoringChangeLogId)
            .Take(MaximumFeedItems)
            .ToListAsync(cancellationToken);

        // Đợt đã bị xoá mềm vẫn phải ra được tên, nên bỏ qua bộ lọc xoá mềm.
        var surveyIds = logs
            .Where(x => x.SemesterSurveyId is not null)
            .Select(x => x.SemesterSurveyId!.Value)
            .Distinct()
            .ToList();
        var surveyNames = surveyIds.Count == 0
            ? new Dictionary<int, string>()
            : await db.SemesterSurveys.AsNoTracking()
                .IgnoreQueryFilters()
                .Where(x => surveyIds.Contains(x.SemesterSurveyId))
                .ToDictionaryAsync(x => x.SemesterSurveyId, x => x.SurveyName, cancellationToken);

        var items = logs
            .OrderBy(x => x.SurveyScoringChangeLogId)
            .Select(x => new ScoringChangeDto(
                x.SurveyScoringChangeLogId,
                x.Kind,
                x.SemesterSurveyId,
                x.SemesterSurveyId is { } id ? surveyNames.GetValueOrDefault(id) : null,
                x.MinimumResponseRate,
                x.MinimumValidRate,
                x.RejectTooFast,
                x.RejectSingleAnswer,
                x.RejectAttentionCheckFailed,
                x.ChangedByName,
                x.ChangedAt))
            .ToList();

        return new ScoringChangeFeedDto(latestId, items);
    }

    private async Task<SurveyScoringChangeLog> NewLogAsync(
        string kind,
        int? semesterSurveyId,
        ScoringThresholds thresholds,
        DateTime changedAt,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var user = userId is null
            ? null
            : await db.Users.AsNoTracking()
                .Where(x => x.Id == userId)
                .Select(x => new { x.DisplayName, x.Email })
                .FirstOrDefaultAsync(cancellationToken);

        var name = !string.IsNullOrWhiteSpace(user?.DisplayName)
            ? user.DisplayName!
            : user?.Email ?? currentUser.UserEmail ?? "Không xác định";

        return new SurveyScoringChangeLog
        {
            Kind = kind,
            SemesterSurveyId = semesterSurveyId,
            MinimumResponseRate = thresholds.MinimumResponseRate,
            MinimumValidRate = thresholds.MinimumValidRate,
            RejectTooFast = thresholds.RejectTooFast,
            RejectSingleAnswer = thresholds.RejectSingleAnswer,
            RejectAttentionCheckFailed = thresholds.RejectAttentionCheckFailed,
            ChangedByUserId = userId,
            ChangedByName = name.Length > 256 ? name[..256] : name,
            ChangedAt = changedAt,
        };
    }
}
