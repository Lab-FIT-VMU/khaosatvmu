namespace UnitTests.InfrastructureTests;

using Application;
using Application.Surveys;

/// <summary>
/// Trạng thái phát hành cố định cho test: mặc định coi mọi đợt đã phát hành, để các
/// bài test cũ vẫn kiểm đúng thứ chúng định kiểm (phạm vi, điểm, truy vấn) chứ không
/// vướng chốt chặn phát hành. Test nào cần kiểm chính chốt chặn thì dựng với
/// <c>published: false</c>.
/// </summary>
internal sealed class PublishedSurveyPublicationService(bool published = true)
    : ISurveyPublicationService
{
    public Task<SurveyOperationResult<SurveyPublicationDto>> GetAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new SurveyOperationResult<SurveyPublicationDto>(
            true,
            null,
            new SurveyPublicationDto(semesterSurveyId, published, null, string.Empty, true)));

    public Task<SurveyOperationResult<SurveyPublicationDto>> SetAsync(
        int semesterSurveyId,
        bool publish,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new SurveyOperationResult<SurveyPublicationDto>(
            true,
            null,
            new SurveyPublicationDto(semesterSurveyId, publish, null, string.Empty, true)));

    public Task<bool> CanSeeResultsAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(published);

    public Task<IReadOnlySet<int>?> VisibleSurveyIdsAsync(CancellationToken cancellationToken = default) =>
        // null = không lọc gì, đúng như khi người gọi là quản trị.
        Task.FromResult<IReadOnlySet<int>?>(published ? null : new HashSet<int>());
}
