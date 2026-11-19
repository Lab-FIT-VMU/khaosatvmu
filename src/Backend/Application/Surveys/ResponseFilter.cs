namespace Application.Surveys;

/// <summary>Mã lý do một phiếu bị lọc, lưu vào "SurveyResponses"."RejectionReasons".</summary>
public static class RejectionReasonCodes
{
    /// <summary>Làm bài nhanh hơn ngưỡng tối thiểu.</summary>
    public const string TooFast = "TOO_FAST";

    /// <summary>Chọn cùng một mức cho mọi câu chấm điểm.</summary>
    public const string SingleAnswer = "SINGLE_ANSWER";

    /// <summary>Trả lời sai ít nhất một câu bẫy độ tập trung.</summary>
    public const string AttentionCheckFailed = "ATTENTION_CHECK_FAILED";
}

/// <summary>Một câu hỏi rút gọn, đủ để bộ lọc làm việc mà không cần chạm cơ sở dữ liệu.</summary>
/// <param name="QuestionId">Khóa của câu hỏi.</param>
/// <param name="AttentionCheckValue">Mức bắt buộc của câu bẫy; null là câu bình thường.</param>
public sealed record FilterQuestion(int QuestionId, int? AttentionCheckValue);

/// <summary>Một câu trả lời thô, giá trị luôn ở dạng chữ giống lúc lưu xuống.</summary>
public sealed record FilterAnswer(int QuestionId, string AnswerValue);

/// <summary>Kết quả lọc của một phiếu.</summary>
/// <param name="IsValid">Phiếu có được tính vào điểm trung bình lớp không.</param>
/// <param name="RejectionReasons">Các mã lý do ngăn cách dấu phẩy; null khi hợp lệ.</param>
public sealed record ResponseFilterResult(bool IsValid, string? RejectionReasons);

/// <summary>
/// Lọc phiếu làm ẩu. Phiếu bị lọc vẫn được nhận và vẫn tính là một lượt nộp,
/// chỉ không tham gia vào điểm trung bình của lớp.
///
/// Lớp này cố ý không phụ thuộc cơ sở dữ liệu để viết unit test cho từng luật
/// mà không phải dựng cả ngữ cảnh EF lên.
/// </summary>
public static class ResponseFilter
{
    /// <summary>
    /// Số giây tối thiểu cho mỗi câu hỏi. Viết cứng theo quyết định A-c, không
    /// đọc từ cấu hình và không cho sửa qua giao diện.
    ///
    /// Là số thực chứ không phải số nguyên: ngưỡng 0.75 giây/câu cho ra tổng lẻ
    /// với bộ đề có số câu không chia hết cho 4, làm tròn xuống int sẽ nới ngưỡng ra.
    /// </summary>
    public const double SecondsPerQuestion = 0.75;

    /// <summary>
    /// Ngưỡng thời gian tối thiểu của cả bài: tính trên TỔNG số câu, kể cả câu
    /// bẫy (quyết định A-d).
    /// </summary>
    public static double MinimumSeconds(int questionCount) => questionCount * SecondsPerQuestion;

    /// <summary>
    /// Chấm một phiếu. <paramref name="elapsedSeconds"/> là số giây từ lúc phát vé
    /// bắt đầu tới lúc nhận được request nộp bài; vé không đọc được thì bên gọi
    /// truyền 0 để luật <see cref="RejectionReasonCodes.TooFast"/> tự bắt.
    /// </summary>
    public static ResponseFilterResult Evaluate(
        IReadOnlyList<FilterQuestion> questions,
        IReadOnlyList<FilterAnswer> answers,
        double elapsedSeconds)
    {
        var reasons = new List<string>(3);

        if (elapsedSeconds < MinimumSeconds(questions.Count))
        {
            reasons.Add(RejectionReasonCodes.TooFast);
        }

        var answerByQuestion = new Dictionary<int, string>(answers.Count);
        foreach (var answer in answers)
        {
            answerByQuestion[answer.QuestionId] = answer.AnswerValue;
        }

        // Chỉ xét câu chấm điểm và KHÔNG phải câu bẫy. Câu bẫy ép chọn một mức
        // cố định nên nếu tính vào đây thì người chọn tất cả mức 5 mà làm đúng
        // câu bẫy mức 3 sẽ có hai giá trị khác nhau và lọt lưới.
        var scoredValues = new List<string>();
        var hasAttentionCheck = false;
        var failedAttentionCheck = false;

        foreach (var question in questions)
        {
            if (!answerByQuestion.TryGetValue(question.QuestionId, out var value)) continue;

            if (question.AttentionCheckValue is { } required)
            {
                hasAttentionCheck = true;
                if (!int.TryParse(value, out var selected) || selected != required)
                {
                    // Sai một câu bẫy là đủ để lọc (quyết định A-f).
                    failedAttentionCheck = true;
                }
                continue;
            }

            scoredValues.Add(value);
        }

        // Một câu duy nhất thì không nói lên điều gì, phải từ hai câu trở lên.
        // Làm đúng mọi câu bẫy là bằng chứng người trả lời có đọc câu hỏi, nên chọn
        // cùng một mức cho mọi câu khi đó vẫn được tính. Bộ không có câu bẫy, hoặc sai
        // câu bẫy, thì luật một đáp án áp như thường.
        var passedAttentionCheck = hasAttentionCheck && !failedAttentionCheck;
        if (!passedAttentionCheck && scoredValues.Count >= 2 && scoredValues.Distinct().Count() == 1)
        {
            reasons.Add(RejectionReasonCodes.SingleAnswer);
        }

        if (failedAttentionCheck)
        {
            reasons.Add(RejectionReasonCodes.AttentionCheckFailed);
        }

        return reasons.Count == 0
            ? new ResponseFilterResult(true, null)
            : new ResponseFilterResult(false, string.Join(',', reasons));
    }
}
