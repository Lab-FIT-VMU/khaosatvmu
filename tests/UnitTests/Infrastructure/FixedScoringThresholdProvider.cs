namespace UnitTests.InfrastructureTests;

using Application.Surveys;

/// <summary>
/// Ngưỡng tính điểm cố định cho test, khỏi phải dựng bảng cấu hình. Mặc định dùng
/// đúng cặp mặc định của hệ thống để test đọc ra cùng tập lớp với chạy thật.
/// </summary>
internal sealed class FixedScoringThresholdProvider(ScoringThresholds? thresholds = null)
    : IScoringThresholdProvider
{
    private readonly ScoringThresholds value = thresholds ?? ScoringThresholds.Default;

    public Task<ScoringThresholds> GetAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(value);

    public Task<SurveyOperationResult<ScoringThresholds>> UpdateAsync(
        ScoringThresholds newThresholds,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new SurveyOperationResult<ScoringThresholds>(true, null, newThresholds));

    public Task RecordRecalculationAsync(
        int semesterSurveyId,
        ScoringThresholds usedThresholds,
        DateTime calculatedAt,
        CancellationToken cancellationToken = default) =>
        Task.CompletedTask;

    public Task<ScoringChangeFeedDto> GetChangesAsync(
        long? afterId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new ScoringChangeFeedDto(0, []));
}
