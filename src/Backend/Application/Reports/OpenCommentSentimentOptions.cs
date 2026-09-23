namespace Application.Reports;

/// <summary>
/// Cấu hình cho tính năng phân loại cảm xúc ý kiến mở.
///
/// Ngưỡng tin cậy và ngưỡng Mixed nằm ở đây chứ KHÔNG viết cứng trong mã: chúng được hiệu chỉnh
/// lại mỗi khi có model mới, và một lần đổi ngưỡng không nên kéo theo một lần sửa mã nguồn.
/// Giá trị mặc định dưới đây là kết quả hiệu chỉnh trên 200 mẫu calibration của VMU.
///
/// KHÔNG có công tắc bật/tắt trong lớp này. Việc bật tính năng nằm ở chỗ khác và có chủ đích:
/// tiến trình API không hề nạp model, chỉ tiến trình SentimentWorker mới nạp. Muốn chạy phân
/// tích thì chạy worker, muốn dừng thì đừng chạy nó — đó là công tắc, và nó rõ ràng hơn một
/// cờ cấu hình mà hai tiến trình phải đọc giống nhau.
/// </summary>
public sealed class OpenCommentSentimentOptions
{
    public const string SectionName = "OpenCommentSentiment";

    /// <summary>Thư mục chứa model ONNX và tokenizer. Tính tương đối theo thư mục chạy ứng dụng.</summary>
    public string ModelDirectory { get; set; } = "models/open-comment-sentiment";

    public string ModelFileName { get; set; } = "phobert-sentiment.onnx";

    public string VocabularyFileName { get; set; } = "vocab.txt";

    public string MergeCodesFileName { get; set; } = "bpe.codes";

    public string AddedTokensFileName { get; set; } = "added_tokens.json";

    /// <summary>Phiên bản model, ghi vào từng bản ghi kết quả.</summary>
    public string ModelVersion { get; set; } = "phobert-neu-esc-v1";

    /// <summary>
    /// Tên phiên bản của QUY TẮC suy ra <c>Mixed</c>/<c>Uncertain</c> — không phải của model.
    ///
    /// Vì sao phải có: nhãn trong cơ sở dữ liệu sinh ra từ hai thứ khác nhau, model và quy tắc.
    /// Trước đây chỉ có <see cref="ModelVersion"/>, nên sau khi sửa quy tắc (20/09/2026: xét khối
    /// xác suất của mệnh đề thay vì đòi argmax) mà không chạy lại có ép buộc thì chế độ chạy lại
    /// thường coi mọi dòng là "đã đúng phiên bản" và bỏ qua hết — nhãn cũ nằm im, không cảnh báo.
    ///
    /// Lịch sử: <c>rules-v1</c> = đòi argmax của từng mệnh đề; <c>rules-v2</c> = xét khối xác suất
    /// (đang dùng). Đổi cách xét mệnh đề thì TĂNG giá trị này.
    /// </summary>
    public string RuleVersion { get; set; } = "rules-v2";

    /// <summary>
    /// Phiên bản quy tắc HIỆU LỰC: tên quy tắc kèm dấu vân tay của hai ngưỡng ảnh hưởng tới nhãn.
    ///
    /// Vì sao gộp cả ngưỡng: ngưỡng nằm trong cấu hình, nên sửa <c>appsettings.json</c> là đổi kết
    /// quả phân loại mà không phải sửa một dòng mã nào. Nếu chỉ ghi tên quy tắc thì lần đổi ngưỡng
    /// đó lại rơi đúng vào cái bẫy im lặng mà cột này sinh ra để chặn. Gộp vào đây thì đổi ngưỡng
    /// là mọi kết quả cũ tự thành "còn nợ", và worker phân tích lại ở lượt quét sau.
    ///
    /// Giá trị này ghi thẳng vào cột <c>RuleVersion</c> (tối đa 64 ký tự) nên đặt tên ngắn.
    /// Ví dụ: <c>rules-v2:c0.45:m0.2</c>.
    /// </summary>
    public string EffectiveRuleVersion => FormattableString.Invariant(
        $"{RuleVersion}:c{ConfidenceThreshold:0.####}:m{MixedThreshold:0.####}");

    /// <summary>Độ dài chuỗi tối đa khi suy luận. Phải khớp lúc huấn luyện.</summary>
    public int MaxSequenceLength { get; set; } = 256;

    /// <summary>Số ý kiến mỗi lượt suy luận.</summary>
    public int BatchSize { get; set; } = 16;

    /// <summary>Dưới ngưỡng này kết quả chuyển thành Chưa chắc chắn.</summary>
    public decimal ConfidenceThreshold { get; set; } = 0.45m;

    /// <summary>Ngưỡng tối thiểu để một mệnh đề được tính là rõ cực khi xét nhãn Hỗn hợp.</summary>
    public decimal MixedThreshold { get; set; } = 0.20m;

    /// <summary>Trần số ý kiến xử lý trong một vòng quét của worker.</summary>
    public int MaxCommentsPerScan { get; set; } = 500;

    /// <summary>Khoảng nghỉ giữa hai vòng quét khi chạy ở chế độ theo dõi.</summary>
    public int ScanIntervalSeconds { get; set; } = 120;

    /// <summary>
    /// Số luồng suy luận. Mặc định 1 vì máy chủ nhiều khả năng chỉ có 1–2 vCPU: ONNX Runtime mà
    /// lấy hết nhân thì API chết đói ngay lúc worker đang chạy. Phân tích cảm xúc là việc chạy
    /// nền, chậm hơn vài phút không sao; API phản hồi chậm mới là sự cố.
    /// </summary>
    public int InferenceThreads { get; set; } = 1;

    /// <summary>
    /// Chế độ chạy nền: sau bao nhiêu giây không có việc thì trả model cho hệ điều hành.
    /// <c>0</c> = không bao giờ nhả (giữ model thường trực).
    ///
    /// Vì sao cần: chạy theo lịch thì không thể "bấm là có ngay", còn để tiến trình ở lại mà ôm
    /// model thì mất 1 GB RAM thường trực trên máy chủ 4 GB — đúng thứ mà việc tách worker khỏi
    /// API sinh ra để tránh. Nhả model khi rảnh cho cả hai: tiến trình ở lại (độ trễ chỉ còn bằng
    /// khoảng quét), nhưng RAM chỉ bị giữ trong lúc thật sự suy luận.
    ///
    /// Đổi lại: lần có việc sau một thời gian rảnh phải nạp lại tệp ONNX 515 MB. Với vài ý kiến
    /// mới, chi phí nạp lớn hơn chi phí suy luận — nên đừng đặt ngưỡng này quá nhỏ.
    /// </summary>
    public int IdleUnloadSeconds { get; set; } = 120;
}
