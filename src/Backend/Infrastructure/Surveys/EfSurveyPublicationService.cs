using Application;
using Application.Auth;
using Application.Surveys;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Surveys;

/// <summary>
/// Trạng thái phát hành đọc từ bảng nhật ký "SurveyScoringChangeLogs": dòng mới nhất
/// mang mã RESULTS_PUBLISHED / RESULTS_UNPUBLISHED của đợt nào là trạng thái của đợt đó.
///
/// Làm theo lối này vì bản đang chạy thật đã thu phiếu: không thêm bảng, không thêm cột,
/// không sửa dòng nào — chỉ ghi thêm nhật ký. Phiếu đã thu và điểm đã chốt không hề bị
/// đụng tới, phát hành chỉ quyết định AI được xem.
/// </summary>
public sealed class EfSurveyPublicationService(
    AppDbContext db,
    IUserScopeResolver userScope,
    ICurrentUserAccessor currentUser,
    IScoringThresholdProvider scoringThresholds) : ISurveyPublicationService
{
    public async Task<SurveyOperationResult<SurveyPublicationDto>> GetAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        var survey = await db.SemesterSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .Select(x => new { x.SemesterSurveyId, x.EndTime })
            .FirstOrDefaultAsync(cancellationToken);

        if (survey is null)
        {
            return new SurveyOperationResult<SurveyPublicationDto>(
                false, SurveyErrorCodes.SemesterSurveyNotFound, default);
        }

        var latest = await LatestAsync(semesterSurveyId, cancellationToken);

        return new SurveyOperationResult<SurveyPublicationDto>(true, null, new SurveyPublicationDto(
            semesterSurveyId,
            latest?.Kind == ScoringChangeKinds.ResultsPublished,
            latest?.ChangedAt,
            latest?.ChangedByName ?? string.Empty,
            survey.EndTime <= DateTime.UtcNow));
    }

    public async Task<SurveyOperationResult<SurveyPublicationDto>> SetAsync(
        int semesterSurveyId,
        bool publish,
        CancellationToken cancellationToken = default)
    {
        // Phát hành là mở dữ liệu cả đợt cho các vai trò khác, nên chỉ quản trị.
        // Ban Giám hiệu xem được cả đợt chưa phát hành nhưng không tự phát hành.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.ManagesEverything)
        {
            return new SurveyOperationResult<SurveyPublicationDto>(
                false, SurveyErrorCodes.OutOfScope, default);
        }

        var survey = await db.SemesterSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .Select(x => new { x.SemesterSurveyId, x.EndTime })
            .FirstOrDefaultAsync(cancellationToken);

        if (survey is null)
        {
            return new SurveyOperationResult<SurveyPublicationDto>(
                false, SurveyErrorCodes.SemesterSurveyNotFound, default);
        }

        var now = DateTime.UtcNow;

        // Đợt còn đang thu phiếu thì số liệu còn chạy từng ngày; phát hành lúc đó là
        // đem một con số dở dang cho cả trường xem.
        if (publish && survey.EndTime > now)
        {
            return new SurveyOperationResult<SurveyPublicationDto>(
                false, SurveyErrorCodes.SurveyNotEnded, default);
        }

        var latest = await LatestAsync(semesterSurveyId, cancellationToken);
        var isPublished = latest?.Kind == ScoringChangeKinds.ResultsPublished;

        // Bấm lại đúng trạng thái đang có thì không ghi thêm dòng nhật ký nào.
        if (isPublished != publish)
        {
            var thresholds = await scoringThresholds.GetAsync(cancellationToken);
            var userId = currentUser.UserId;
            var user = userId is null
                ? null
                : await db.Users.AsNoTracking()
                    .Where(x => x.Id == userId)
                    .Select(x => new { x.DisplayName, x.Email })
                    .FirstOrDefaultAsync(cancellationToken);

            db.SurveyScoringChangeLogs.Add(new SurveyScoringChangeLog
            {
                Kind = publish
                    ? ScoringChangeKinds.ResultsPublished
                    : ScoringChangeKinds.ResultsUnpublished,
                SemesterSurveyId = semesterSurveyId,
                MinimumResponseRate = thresholds.MinimumResponseRate,
                MinimumValidRate = thresholds.MinimumValidRate,
                RejectTooFast = thresholds.RejectTooFast,
                RejectSingleAnswer = thresholds.RejectSingleAnswer,
                RejectAttentionCheckFailed = thresholds.RejectAttentionCheckFailed,
                ChangedByUserId = userId,
                ChangedByName = !string.IsNullOrWhiteSpace(user?.DisplayName)
                    ? user!.DisplayName!
                    : user?.Email ?? currentUser.UserEmail ?? "Không xác định",
                ChangedAt = now,
            });

            await db.SaveChangesAsync(cancellationToken);
        }

        return await GetAsync(semesterSurveyId, cancellationToken);
    }

    public async Task<bool> CanSeeResultsAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (scope.SeesEverything) return true;

        var latest = await LatestAsync(semesterSurveyId, cancellationToken);
        return latest?.Kind == ScoringChangeKinds.ResultsPublished;
    }

    public async Task<IReadOnlySet<int>?> VisibleSurveyIdsAsync(
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (scope.SeesEverything) return null;

        // Lấy toàn bộ dòng phát hành / thu hồi rồi xét dòng mới nhất của từng đợt.
        // Bảng nhật ký nhỏ (mỗi lần bấm một dòng) nên đọc hết vẫn nhẹ hơn là chạy một
        // truy vấn nhóm có lồng cho mỗi lần gọi.
        var rows = await db.SurveyScoringChangeLogs.AsNoTracking()
            .Where(x => x.SemesterSurveyId != null
                && (x.Kind == ScoringChangeKinds.ResultsPublished
                    || x.Kind == ScoringChangeKinds.ResultsUnpublished))
            .OrderBy(x => x.SurveyScoringChangeLogId)
            .Select(x => new { SemesterSurveyId = x.SemesterSurveyId!.Value, x.Kind })
            .ToListAsync(cancellationToken);

        var published = new HashSet<int>();
        foreach (var row in rows)
        {
            if (row.Kind == ScoringChangeKinds.ResultsPublished) published.Add(row.SemesterSurveyId);
            else published.Remove(row.SemesterSurveyId);
        }

        return published;
    }

    /// <summary>Dòng phát hành / thu hồi mới nhất của một đợt; null khi chưa từng bấm.</summary>
    private Task<LatestPublication?> LatestAsync(int semesterSurveyId, CancellationToken cancellationToken) =>
        db.SurveyScoringChangeLogs.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId
                && (x.Kind == ScoringChangeKinds.ResultsPublished
                    || x.Kind == ScoringChangeKinds.ResultsUnpublished))
            .OrderByDescending(x => x.SurveyScoringChangeLogId)
            .Select(x => new LatestPublication(x.Kind, x.ChangedAt, x.ChangedByName))
            .FirstOrDefaultAsync(cancellationToken);

    private sealed record LatestPublication(string Kind, DateTime ChangedAt, string ChangedByName);
}
