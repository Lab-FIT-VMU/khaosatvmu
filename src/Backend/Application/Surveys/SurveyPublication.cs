namespace Application.Surveys;

/// <summary>
/// Trạng thái phát hành kết quả của một đợt khảo sát.
///
/// Trước khi phát hành, chỉ quản trị hệ thống và quản trị khảo sát xem được số liệu;
/// trưởng bộ môn và giảng viên không xem được kể cả khi đã mở quyền vào module. Phát
/// hành rồi thì hai vai trò kia xem được đúng phạm vi của mình như cũ, và mỗi lần
/// quản trị bấm Cập nhật điểm là họ thấy ngay số mới.
/// </summary>
/// <param name="ChangedAt">Lần đổi trạng thái gần nhất; null khi đợt chưa từng phát hành.</param>
/// <param name="ChangedByName">Người bấm lần gần nhất, để khỏi phải tra lại lịch sử.</param>
/// <param name="HasEnded">Đã qua thời gian thu phiếu — điều kiện để bấm phát hành.</param>
public sealed record SurveyPublicationDto(
    int SemesterSurveyId,
    bool IsPublished,
    DateTime? ChangedAt,
    string ChangedByName,
    bool HasEnded);

/// <summary>
/// Đọc và đổi trạng thái phát hành.
///
/// Trạng thái không có cột riêng trong cơ sở dữ liệu: mỗi lần bấm chỉ THÊM một dòng
/// vào bảng nhật ký "SurveyScoringChangeLogs" với mã <see cref="Domain.ScoringChangeKinds.ResultsPublished"/>
/// hoặc <see cref="Domain.ScoringChangeKinds.ResultsUnpublished"/>; trạng thái hiện tại
/// là dòng mới nhất của đợt đó. Nhờ vậy không phải đổi cấu trúc bảng nào, và phiếu đã
/// thu lẫn điểm đã chốt không bị đụng tới.
/// </summary>
public interface ISurveyPublicationService
{
    Task<SurveyOperationResult<SurveyPublicationDto>> GetAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>Chỉ quản trị mới bấm được; phát hành đòi đợt đã kết thúc.</summary>
    Task<SurveyOperationResult<SurveyPublicationDto>> SetAsync(
        int semesterSurveyId,
        bool publish,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Người đang đăng nhập có được xem kết quả của đợt này không: quản trị luôn được,
    /// các vai trò còn lại phải đợi phát hành.
    /// </summary>
    Task<bool> CanSeeResultsAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Tập đợt mà người đang đăng nhập được xem kết quả, dùng để lọc các báo cáo gộp
    /// nhiều đợt. Trả null nghĩa là KHÔNG phải lọc gì — người gọi là quản trị.
    /// </summary>
    Task<IReadOnlySet<int>?> VisibleSurveyIdsAsync(CancellationToken cancellationToken = default);
}
