namespace Application.Surveys;

/// <summary>
/// Hai vòng loại quyết định một lớp có được tính vào điểm hay không. Khác với
/// <see cref="ReportThresholds"/> viết cứng trong mã, cặp ngưỡng này do quản trị
/// đặt trên giao diện và lưu trong bảng "SurveyScoringSettings", vì mỗi đợt khảo
/// sát có thể cần siết hay nới khác nhau.
///
/// Đổi ngưỡng là đổi tập lớp được tính, nên sau khi đổi phải bấm "Tính lại điểm"
/// thì các bảng đọc từ điểm đã chốt mới khớp với các bảng tính sống.
/// </summary>
public readonly record struct ScoringThresholds(
    /// <summary>Vòng 1 — Số phiếu đã thu ÷ Sĩ số, tính theo phần trăm.</summary>
    decimal MinimumResponseRate,
    /// <summary>Vòng 2 — Số phiếu hợp lệ ÷ Số phiếu đã thu, tính theo phần trăm.</summary>
    decimal MinimumValidRate,
    /// <summary>Luật "làm bài quá nhanh" có đang được áp không.</summary>
    bool RejectTooFast,
    /// <summary>Luật "chọn cùng một mức cho mọi câu" có đang được áp không.</summary>
    bool RejectSingleAnswer,
    /// <summary>Luật "sai câu kiểm tra độ tập trung" có đang được áp không.</summary>
    bool RejectAttentionCheckFailed)
{
    /// <summary>Mặc định của hệ thống khi bảng cấu hình chưa có dòng nào.</summary>
    public static readonly ScoringThresholds Default = new(50m, 80m, true, true, true);

    /// <summary>Ngưỡng nằm ngoài 0–100 là vô nghĩa, chặn ngay ở tầng ứng dụng.</summary>
    public bool IsValid =>
        MinimumResponseRate is >= 0m and <= 100m
        && MinimumValidRate is >= 0m and <= 100m;

    /// <summary>
    /// Các mã lý do ĐANG được áp. Phiếu dính bất kỳ mã nào trong đây thì bị loại
    /// khỏi thống kê; phiếu chỉ dính mã đã tắt thì được tính bình thường.
    /// </summary>
    public IReadOnlyList<string> EnabledRejectionReasons
    {
        get
        {
            var codes = new List<string>(3);
            if (RejectTooFast) codes.Add(RejectionReasonCodes.TooFast);
            if (RejectSingleAnswer) codes.Add(RejectionReasonCodes.SingleAnswer);
            if (RejectAttentionCheckFailed) codes.Add(RejectionReasonCodes.AttentionCheckFailed);
            return codes;
        }
    }

    /// <summary>
    /// Lớp phải qua CẢ HAI vòng mới được gộp vào điểm.
    ///
    /// Vòng 1 loại lớp quá ít người trả lời: điểm của lớp hai người đánh giá không
    /// so được với lớp ba mươi người, gộp vào là kéo lệch mọi con số phía trên.
    /// Vòng 2 loại lớp nộp nhiều nhưng phần lớn phiếu bị bộ lọc nhiễu đánh rớt —
    /// đủ số lượng mà không đủ chất lượng thì cũng không tin được.
    /// </summary>
    public bool HasEnoughResponsesToScore(
        int classSize,
        int totalResponseCount,
        int validResponseCount)
    {
        if (classSize <= 0 || totalResponseCount <= 0) return false;

        var responseRate = (decimal)totalResponseCount / classSize * 100;
        if (responseRate < MinimumResponseRate) return false;

        var validRate = (decimal)validResponseCount / totalResponseCount * 100;
        return validRate >= MinimumValidRate;
    }
}

/// <summary>Đọc và ghi cặp ngưỡng tính điểm đang áp dụng cho toàn hệ thống.</summary>
public interface IScoringThresholdProvider
{
    Task<ScoringThresholds> GetAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Chỉ quản trị mới đổi được; trả về giá trị sau khi ghi. Giá trị thật sự khác
    /// trước thì ghi thêm một dòng lịch sử để báo cho người dùng khác.
    /// </summary>
    Task<SurveyOperationResult<ScoringThresholds>> UpdateAsync(
        ScoringThresholds thresholds,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Ghi lại một lần tính lại điểm cùng bộ cấu hình đã dùng. Gọi TRONG transaction
    /// của lần tính, để có điểm mới là chắc chắn có dòng lịch sử đi kèm.
    /// </summary>
    Task RecordRecalculationAsync(
        int semesterSurveyId,
        ScoringThresholds usedThresholds,
        DateTime calculatedAt,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Các lần đổi cấu hình / tính lại điểm sau mốc <paramref name="afterId"/>, bỏ
    /// những lần do chính người đang gọi thực hiện. <paramref name="afterId"/> null
    /// thì chỉ trả mốc mới nhất để giao diện bắt đầu theo dõi từ đó.
    /// </summary>
    Task<ScoringChangeFeedDto> GetChangesAsync(
        long? afterId,
        CancellationToken cancellationToken = default);
}

/// <summary>Một lần đổi cấu hình hoặc tính lại điểm, kèm nguyên bộ cấu hình lúc đó.</summary>
public sealed record ScoringChangeDto(
    long Id,
    /// <summary>Mã trong <c>Domain.ScoringChangeKinds</c>.</summary>
    string Kind,
    int? SemesterSurveyId,
    /// <summary>Tên đợt được tính lại; null với sự kiện đổi cấu hình.</summary>
    string? SemesterSurveyName,
    decimal MinimumResponseRate,
    decimal MinimumValidRate,
    bool RejectTooFast,
    bool RejectSingleAnswer,
    bool RejectAttentionCheckFailed,
    string ChangedByName,
    DateTime ChangedAt);

public sealed record ScoringChangeFeedDto(
    /// <summary>Mốc mới nhất trong bảng, kể cả sự kiện của chính người gọi.</summary>
    long LatestId,
    /// <summary>Sắp theo thứ tự xảy ra, cũ trước mới sau.</summary>
    IReadOnlyList<ScoringChangeDto> Items);
