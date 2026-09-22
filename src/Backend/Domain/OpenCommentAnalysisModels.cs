namespace Domain;

/// <summary>
/// Năm nhãn cảm xúc của phiên bản 1. Model PhoBERT chỉ dự đoán ba lớp gốc
/// <see cref="Positive"/>, <see cref="Negative"/>, <see cref="Neutral"/>;
/// <see cref="Mixed"/> và <see cref="Uncertain"/> do tầng application suy ra bằng quy tắc.
/// </summary>
public static class OpenCommentSentiments
{
    public const string Positive = "Positive";
    public const string Negative = "Negative";
    public const string Neutral = "Neutral";
    public const string Mixed = "Mixed";
    public const string Uncertain = "Uncertain";

    /// <summary>Ba nhãn gốc mà model thực sự dự đoán, đúng thứ tự logits.</summary>
    public static readonly IReadOnlyList<string> BaseLabels = [Negative, Neutral, Positive];

    /// <summary>Toàn bộ nhãn hiển thị và lọc trên giao diện.</summary>
    public static readonly IReadOnlyList<string> All = [Positive, Negative, Neutral, Mixed, Uncertain];

    public static bool IsValid(string? value) =>
        value is not null && All.Contains(value, StringComparer.Ordinal);
}

/// <summary>
/// Bảng "OpenCommentAnalysisResults". Kết quả phân loại cảm xúc của một ý kiến mở, khoá chính
/// trùng khoá ngoại tới phiếu nên mỗi phiếu chỉ có đúng một kết quả.
///
/// KHÔNG sao chép nội dung ý kiến sang bảng này. Nội dung gốc vẫn nằm ở
/// <see cref="SurveyResponse.AdditionalComments"/>; ở đây chỉ có nhãn, xác suất và hash nội dung
/// để biết kết quả còn khớp với nội dung hiện tại hay không.
/// </summary>
public sealed class OpenCommentAnalysisResult
{
    /// <summary>Khoá chính, đồng thời là khoá ngoại tới "SurveyResponses".</summary>
    public int SurveyResponseId { get; set; }

    /// <summary>Nhãn do model trả về, một trong <see cref="OpenCommentSentiments.All"/>.</summary>
    public string Sentiment { get; set; } = OpenCommentSentiments.Uncertain;

    /// <summary>Xác suất của nhãn cuối cùng sau khi áp quy tắc.</summary>
    public decimal Confidence { get; set; }

    public decimal PositiveScore { get; set; }

    public decimal NegativeScore { get; set; }

    public decimal NeutralScore { get; set; }

    /// <summary>
    /// Danh sách mã chủ đề, lưu dạng JSON. Chỉ dùng ở Giai đoạn 6 nên hiện để trống.
    /// Để 'jsonb' ngay từ đầu cho Postgres kiểm tra cú pháp, tránh phải sửa kiểu cột sau.
    /// </summary>
    public string? TopicCodesJson { get; set; }

    /// <summary>Phiên bản model đã tạo ra kết quả. Đổi version thì worker phân tích lại.</summary>
    public string ModelVersion { get; set; } = string.Empty;

    /// <summary>
    /// Phiên bản QUY TẮC đã sinh ra nhãn — tên quy tắc kèm ngưỡng, xem
    /// <c>OpenCommentSentimentOptions.EffectiveRuleVersion</c>.
    ///
    /// Tách khỏi <see cref="ModelVersion"/> vì cùng một model cho nhãn khác nhau khi quy tắc hoặc
    /// ngưỡng đổi, và trước đây chuyện đó xảy ra trong im lặng: kết quả cũ vẫn được coi là "đã
    /// đúng phiên bản" nên không bao giờ được phân tích lại.
    ///
    /// Dòng có từ trước khi thêm cột này mang giá trị rỗng, nên chúng tự rơi lại vào hàng đợi.
    /// </summary>
    public string RuleVersion { get; set; } = string.Empty;

    /// <summary>SHA-256 của nội dung đã chuẩn hoá, dùng phát hiện ý kiến bị sửa.</summary>
    public string ContentHash { get; set; } = string.Empty;

    public DateTime AnalyzedAt { get; set; }

    /// <summary>
    /// Nhãn do người có quyền hiệu chỉnh. NULL nghĩa là chưa ai đụng vào kết quả của model.
    /// </summary>
    public string? ManualSentiment { get; set; }

    /// <summary>FK → Users.Id, NULL khi chưa hiệu chỉnh hoặc tài khoản đã bị xoá.</summary>
    public Guid? ReviewedByUserId { get; set; }

    public DateTime? ReviewedAt { get; set; }

    /// <summary>Nhãn dùng để hiển thị, thống kê và lọc: ưu tiên nhãn người sửa.</summary>
    public string EffectiveSentiment => ManualSentiment ?? Sentiment;

    public bool IsManuallyReviewed => ManualSentiment is not null;
}
