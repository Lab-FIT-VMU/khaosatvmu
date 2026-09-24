namespace UnitTests.InfrastructureTests;

using Application;
using Application.Surveys;

/// <summary>
/// Trạng thái phát hành cố định cho test: mặc định coi mọi đợt đã phát hành, để các
/// bài test cũ vẫn kiểm đúng thứ chúng định kiểm (phạm vi, điểm, truy vấn) chứ không
/// vướng chốt chặn phát hành. Test nào cần kiểm chính chốt chặn thì dựng với
/// <c>published: false</c>.
/// <para>
/// <paramref name="lockedForScoring"/> là trạng thái <see cref="GetAsync"/> đọc ra — thứ
/// quyết định có còn tính lại điểm được không. Mặc định là chưa phát hành, để các test
/// tính lại điểm không vướng chốt khoá sau phát hành.
/// </para>
/// </summary>
internal sealed class PublishedSurveyPublicationService(bool published = true, bool lockedForScoring = false)
    : ISurveyPublicationService
{
    public Task<SurveyOperationResult<SurveyPublicationDto>> GetAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new SurveyOperationResult<SurveyPublicationDto>(
            true,
            null,
            new SurveyPublicationDto(semesterSurveyId, lockedForScoring, null, string.Empty, true)));

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
