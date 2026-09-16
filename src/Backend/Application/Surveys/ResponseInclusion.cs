using System.Linq.Expressions;
using Domain;

namespace Application.Surveys;

/// <summary>
/// Một phiếu có được gộp vào thống kê hay không, XÉT THEO CẤU HÌNH ĐANG BẬT.
///
/// Khác với cột <see cref="SurveyResponse.IsValid"/> — đó là ảnh chụp lúc nộp, chấm
/// theo cả ba luật và không bao giờ đổi. Ở đây đọc lại <see cref="SurveyResponse.RejectionReasons"/>
/// (bằng chứng đã ghi sẵn từ lúc nộp) rồi bỏ qua những luật quản trị đã tắt.
///
/// Nhờ vậy tắt/bật một luật KHÔNG ghi lại một dòng phiếu nào: chọn lại là mọi con số
/// quay về đúng như cũ.
///
/// Gom vào một chỗ vì luật này bị dùng ở hơn mười truy vấn của hai service; mỗi nơi
/// tự viết một kiểu thì chỉ cần lệch một dấu là hai màn hình ra hai con số.
/// </summary>
public static class ResponseInclusion
{
    /// <summary>
    /// Điều kiện lọc dùng cho LINQ. Ba cờ là hằng tại thời điểm dựng truy vấn nên
    /// EF rút gọn được biểu thức trước khi dịch sang SQL.
    ///
    /// Phiếu chưa bị lọc lần nào (<c>RejectionReasons</c> null) thì luôn được tính,
    /// không phải dò chuỗi.
    /// </summary>
    public static Expression<Func<SurveyResponse, bool>> CountsTowardScore(
        this ScoringThresholds thresholds)
    {
        var rejectTooFast = thresholds.RejectTooFast;
        var rejectSingleAnswer = thresholds.RejectSingleAnswer;
        var rejectAttentionCheck = thresholds.RejectAttentionCheckFailed;

        return response =>
            response.RejectionReasons == null
            || ((!rejectTooFast
                    || !response.RejectionReasons.Contains(RejectionReasonCodes.TooFast))
                && (!rejectSingleAnswer
                    || !response.RejectionReasons.Contains(RejectionReasonCodes.SingleAnswer))
                && (!rejectAttentionCheck
                    || !response.RejectionReasons.Contains(RejectionReasonCodes.AttentionCheckFailed)));
    }

    /// <summary>
    /// Bản dành cho dữ liệu đã nạp sẵn trong bộ nhớ, dùng chung một luật với bản LINQ.
    /// </summary>
    public static bool CountsTowardScore(this ScoringThresholds thresholds, string? rejectionReasons)
    {
        if (rejectionReasons is null) return true;

        foreach (var code in thresholds.EnabledRejectionReasons)
        {
            if (rejectionReasons.Contains(code, StringComparison.Ordinal)) return false;
        }

        return true;
    }
}
