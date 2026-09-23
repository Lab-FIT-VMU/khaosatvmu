using Domain;

namespace Application.Reports;

/// <summary>Kết quả phân loại của một ý kiến mở, đã áp quy tắc 5 nhãn.</summary>
/// <param name="Sentiment">Nhãn cuối cùng, thuộc <see cref="OpenCommentSentiments.All"/>.</param>
/// <param name="Confidence">Xác suất của nhãn cuối cùng.</param>
/// <param name="PositiveScore">Xác suất lớp Positive của model trên toàn ý kiến.</param>
/// <param name="NegativeScore">Xác suất lớp Negative của model trên toàn ý kiến.</param>
/// <param name="NeutralScore">Xác suất lớp Neutral của model trên toàn ý kiến.</param>
public sealed record OpenCommentPrediction(
    string Sentiment,
    double Confidence,
    double PositiveScore,
    double NegativeScore,
    double NeutralScore);

/// <summary>
/// Bộ phân loại cảm xúc cho ý kiến mở. Cài đặt thật chạy ONNX nội bộ trong hạ tầng;
/// tầng application chỉ biết hợp đồng này nên thay được bằng bản giả khi test.
/// </summary>
public interface IOpenCommentClassifier
{
    /// <summary>Phiên bản model đang nạp, ghi kèm mọi kết quả để biết khi nào cần phân tích lại.</summary>
    string ModelVersion { get; }

    /// <summary>Model đã nạp xong và sẵn sàng suy luận chưa.</summary>
    bool IsReady { get; }

    /// <summary>Lý do model chưa sẵn sàng, null khi mọi thứ bình thường.</summary>
    string? UnavailableReason { get; }

    /// <summary>
    /// Thời điểm suy luận gần nhất (UTC). Dùng cho chế độ chạy nền: sau bao lâu không có việc thì
    /// trả model lại cho hệ điều hành.
    /// </summary>
    DateTime LastUsedAtUtc { get; }

    /// <summary>
    /// Trả tài nguyên của model cho hệ điều hành nếu đang giữ; lần cần dùng sau sẽ nạp lại.
    ///
    /// Tiến trình chạy một lượt rồi thoát không cần gọi hàm này — thoát là đủ. Nó tồn tại cho
    /// chế độ chạy nền, nơi tiến trình ở lại để "bấm là có ngay" nhưng không được giữ 1 GB RAM
    /// suốt ngày trên máy chủ 4 GB.
    ///
    /// Chỉ gọi khi không còn lô suy luận nào đang chạy.
    /// </summary>
    void Release();

    /// <summary>Phân loại một lô ý kiến. Danh sách trả về cùng thứ tự với đầu vào.</summary>
    Task<IReadOnlyList<OpenCommentPrediction>> ClassifyAsync(
        IReadOnlyList<string> comments,
        CancellationToken cancellationToken = default);
}

/// <summary>Số lượng và tỷ lệ của một nhãn cảm xúc trong phạm vi người dùng đang xem.</summary>
/// <param name="Sentiment">Mã nhãn.</param>
/// <param name="Label">Nhãn tiếng Việt để hiển thị.</param>
/// <param name="Count">Số ý kiến mang nhãn này.</param>
/// <param name="Percentage">Tỷ lệ trên tổng số ý kiến ĐÃ phân tích, làm tròn 1 chữ số.</param>
public sealed record OpenCommentSentimentBreakdownDto(
    string Sentiment,
    string Label,
    int Count,
    decimal Percentage);

/// <summary>
/// Trạng thái phân tích cảm xúc, chỉ trả cho quản trị kỹ thuật.
///
/// Mọi con số ở đây đọc từ cơ sở dữ liệu, KHÔNG hỏi trực tiếp model: tiến trình API không nạp
/// model nên không thể biết nó đang sống hay chết. Sức khoẻ của model thuộc về tiến trình
/// SentimentWorker (mã thoát và nhật ký của nó), còn ở đây trả lời được câu hỏi vận hành thật
/// sự: còn bao nhiêu việc và kết quả hiện có thuộc phiên bản nào.
/// </summary>
/// <param name="ModelVersion">Phiên bản mà cấu hình đang nhắm tới; worker sẽ ghi phiên bản này.</param>
/// <param name="RuleVersion">
/// Phiên bản quy tắc hiệu lực mà cấu hình đang nhắm tới (tên quy tắc kèm ngưỡng). Cùng với
/// <paramref name="ModelVersion"/> nó tạo thành cặp quyết định một kết quả còn dùng được hay không.
/// </param>
/// <param name="LatestAnalyzedModelVersion">
/// Phiên bản đã sinh ra kết quả mới nhất trong cơ sở dữ liệu. Lệch với
/// <paramref name="ModelVersion"/> nghĩa là còn việc phải chạy.
/// </param>
/// <param name="LatestAnalyzedRuleVersion">
/// Quy tắc đã sinh ra kết quả mới nhất. Lệch với <paramref name="RuleVersion"/> nghĩa là kết quả
/// hiện có được sinh ra bởi một quy tắc hoặc ngưỡng khác.
/// </param>
public sealed record OpenCommentModelStatusDto(
    string ModelVersion,
    string RuleVersion,
    string? LatestAnalyzedModelVersion,
    string? LatestAnalyzedRuleVersion,
    int PendingRecordCount,
    int AnalyzedRecordCount,
    int ManuallyReviewedCount,
    decimal ConfidenceThreshold,
    decimal MixedThreshold,
    DateTime? LastAnalyzedAt);

/// <summary>
/// Phạm vi chạy lại phân tích.
/// </summary>
/// <remarks>
/// Cố ý chỉ nhận phạm vi theo đợt/học kỳ. Lọc thêm theo khoa/bộ môn/giảng viên đòi hỏi phải lặp
/// lại đúng phép ghép lớp → khoa/bộ môn của màn báo cáo; chép lại phép ghép đó ở đây là cách
/// chắc chắn nhất để hai màn hình lọc lệch nhau. Chạy lại theo đợt là cách dùng thật khi lên
/// model mới.
/// </remarks>
public sealed record OpenCommentReanalysisRequest(
    int? SemesterId = null,
    int? SemesterSurveyId = null,
    /// <summary>True thì phân tích lại cả những bản ghi đã đúng phiên bản model hiện tại.</summary>
    bool Force = false);

/// <summary>Kết quả một lượt chạy lại phân tích.</summary>
/// <param name="ScannedCount">Số ý kiến nằm trong phạm vi vừa quét.</param>
/// <param name="QueuedCount">Số ý kiến thật sự được đưa lại vào hàng đợi phân tích.</param>
/// <param name="PreservedReviewedCount">
/// Số ý kiến đã được người có quyền hiệu chỉnh tay nên KHÔNG bị đụng tới. Nhãn của người nằm
/// cùng dòng với kết quả model, nên xoá dòng là xoá luôn công chấm tay; con số này để người
/// vận hành biết vì sao hàng đợi nhỏ hơn phạm vi quét chứ không tưởng là lỗi.
/// </param>
/// <param name="ModelVersion">Phiên bản model mà worker sẽ ghi cho các ý kiến vừa xếp hàng.</param>
public sealed record OpenCommentReanalysisResultDto(
    int ScannedCount,
    int QueuedCount,
    string ModelVersion,
    string RuleVersion,
    int PreservedReviewedCount = 0);

/// <summary>Yêu cầu hiệu chỉnh nhãn cảm xúc của một ý kiến.</summary>
public sealed record ReviewOpenCommentSentimentRequest(
    /// <summary>
    /// Nhãn đúng theo người đánh giá, thuộc <see cref="OpenCommentSentiments.All"/>.
    /// Chuỗi rỗng để bỏ hiệu chỉnh và quay về nhãn của model.
    /// </summary>
    string Sentiment);

/// <summary>Nhãn tiếng Việt dùng chung cho KPI, badge và file Excel.</summary>
public static class OpenCommentSentimentLabels
{
    public static string ToDisplay(string sentiment) => sentiment switch
    {
        OpenCommentSentiments.Positive => "Tích cực",
        OpenCommentSentiments.Negative => "Tiêu cực",
        OpenCommentSentiments.Neutral => "Trung tính",
        OpenCommentSentiments.Mixed => "Hỗn hợp",
        OpenCommentSentiments.Uncertain => "Chưa chắc chắn",
        _ => sentiment,
    };
}

/// <summary>
/// Nghiệp vụ quản trị kết quả phân loại: xem trạng thái model, chạy lại và hiệu chỉnh thủ công.
/// </summary>
public interface IOpenCommentAnalysisService
{
    /// <summary>Trạng thái model cùng số bản ghi chờ phân tích.</summary>
    Task<OpenCommentModelStatusDto> GetModelStatusAsync(CancellationToken cancellationToken = default);

    /// <summary>Đưa các ý kiến trong phạm vi chỉ định vào hàng đợi phân tích lại.</summary>
    Task<OpenCommentReanalysisResultDto> ReanalyzeAsync(
        OpenCommentReanalysisRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Đặt nhãn do người đánh giá cho một ý kiến, hoặc bỏ hiệu chỉnh bằng chuỗi rỗng.
    /// Trả false khi ý kiến không tồn tại, nằm ngoài phạm vi người dùng được xem, hoặc chưa
    /// được phân tích — chưa có kết quả thì chưa có gì để sửa.
    /// </summary>
    Task<bool> ReviewAsync(
        int responseId,
        ReviewOpenCommentSentimentRequest request,
        CancellationToken cancellationToken = default);
}
