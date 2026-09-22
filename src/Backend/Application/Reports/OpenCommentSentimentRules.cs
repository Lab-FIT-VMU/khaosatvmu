using System.Text.RegularExpressions;

namespace Application.Reports;

/// <summary>Kết quả cuối cùng sau khi áp quy tắc 5 nhãn lên xác suất của model.</summary>
/// <param name="Sentiment">Nhãn hiệu lực.</param>
/// <param name="Confidence">Xác suất tương ứng với nhãn hiệu lực.</param>
public sealed record OpenCommentResolvedSentiment(string Sentiment, double Confidence);

/// <summary>
/// Quy tắc suy ra hai nhãn <c>Mixed</c> và <c>Uncertain</c> từ ba xác suất của model.
///
/// Đây là bản port của <c>sentiment_baseline/inference_engine.py</c> — cùng ngưỡng, cùng thứ tự
/// xét nhánh. Giữ ở tầng application để test được bằng số liệu dựng sẵn, không cần nạp model
/// 500 MB mới kiểm tra được một nhánh if.
///
/// Bốn bước, đúng thứ tự của bản Python:
/// 1. Chỉ nhãn <c>Mixed</c> khi có ÍT NHẤT một mệnh đề đạt ngưỡng ở vế tích cực VÀ một mệnh đề
///    khác đạt ngưỡng ở vế tiêu cực. Xét theo KHỐI XÁC SUẤT của mệnh đề, không đòi nhãn cao nhất
///    của mệnh đề phải đúng cực đó — xem chú thích trong <see cref="Resolve"/>.
/// 2. Không đạt điều kiện trên mà xác suất lớn nhất của cả ý kiến thấp hơn
///    <c>confidenceThreshold</c> thì là <c>Uncertain</c>.
/// 3. Còn lại lấy nhãn có xác suất cao nhất.
/// 4. Ý kiến rỗng luôn là <c>Uncertain</c> với độ tin cậy 0.
/// </summary>
public static partial class OpenCommentSentimentRules
{
    /// <summary>Mệnh đề nối bằng dấu câu hoặc từ tương phản.</summary>
    private static readonly string[] ContrastConjunctions =
        ["nhưng", "tuy nhiên", "mặc dù vậy", "song", "dẫu vậy", "thế nhưng"];

    /// <summary>
    /// Cùng biểu thức với bản Python. Nhóm không bắt giữ nên <see cref="Regex.Split(string)"/>
    /// không chèn dấu phân cách vào kết quả, giống <c>re.split</c>.
    /// </summary>
    [GeneratedRegex(
        @"(?:\s*(?:nhưng|tuy nhiên|mặc dù vậy|song|dẫu vậy|thế nhưng)\s*|[;!?\n]+|(?<=[^\d])\.\s+)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ContrastPattern { get; }

    /// <summary>Ký tự bao quanh mệnh đề bị cắt bỏ trước khi kiểm tra độ dài.</summary>
    private static readonly char[] ClauseTrimChars = [' ', ',', '.', '-', ';', ':', '!', '?', '\t', '\n'];

    /// <summary>
    /// Vị trí của hai cực trong dải xác suất <c>[Negative, Neutral, Positive]</c>. Tra từ
    /// <see cref="Domain.OpenCommentSentiments.BaseLabels"/> thay vì viết thẳng 0 và 2, để đổi thứ tự
    /// logits ở một nơi thì không âm thầm lệch ở nơi khác.
    /// </summary>
    private static readonly int NegativeProbabilityIndex =
        BaseLabelIndex(Domain.OpenCommentSentiments.Negative);
    private static readonly int PositiveProbabilityIndex =
        BaseLabelIndex(Domain.OpenCommentSentiments.Positive);

    private static int BaseLabelIndex(string label)
    {
        for (var index = 0; index < Domain.OpenCommentSentiments.BaseLabels.Count; index++)
        {
            if (string.Equals(
                Domain.OpenCommentSentiments.BaseLabels[index], label, StringComparison.Ordinal))
            {
                return index;
            }
        }

        throw new InvalidOperationException(
            $"Nhãn gốc '{label}' không có trong BaseLabels.");
    }

    /// <summary>
    /// Tách ý kiến thành các mệnh đề theo từ tương phản và dấu câu. Giữ lại mệnh đề có ít nhất
    /// hai từ và ba ký tự; nếu không mệnh đề nào hợp lệ thì trả về nguyên văn bản đã cắt khoảng trắng.
    /// </summary>
    public static IReadOnlyList<string> SplitClauses(string text)
    {
        var cleaned = (text ?? string.Empty).Trim();
        if (cleaned.Length == 0)
        {
            return [];
        }

        var clauses = new List<string>();
        foreach (var raw in ContrastPattern.Split(cleaned))
        {
            var stripped = raw.Trim(ClauseTrimChars);
            var tokenCount = stripped.Split(
                (char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length;
            if (tokenCount >= 2 && stripped.Length >= 3)
            {
                clauses.Add(stripped);
            }
        }

        return clauses.Count == 0 ? [cleaned] : clauses;
    }

    /// <summary>
    /// Ý kiến có dấu hiệu hai chiều hay không. Chỉ là dấu hiệu, chưa phải kết luận <c>Mixed</c>:
    /// còn phải xem model có thực sự thấy cả hai cực trong từng mệnh đề không.
    /// </summary>
    public static bool ContainsContrastMarker(string text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return false;
        }

        if (text.Contains(';', StringComparison.Ordinal))
        {
            return true;
        }

        var folded = $" {text.ToLowerInvariant()} ";
        foreach (var marker in ContrastConjunctions)
        {
            if (folded.Contains($" {marker} ", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Vị trí xác suất lớn nhất. Khi bằng nhau lấy vị trí đầu tiên, đúng như <c>numpy.argmax</c>.
    /// </summary>
    public static int ArgMax(IReadOnlyList<double> probabilities)
    {
        if (probabilities.Count == 0)
        {
            throw new ArgumentException("Cần ít nhất một xác suất.", nameof(probabilities));
        }

        var best = 0;
        for (var i = 1; i < probabilities.Count; i++)
        {
            if (probabilities[i] > probabilities[best])
            {
                best = i;
            }
        }

        return best;
    }

    /// <summary>
    /// Áp quy tắc 5 nhãn. Thứ tự xác suất là [Negative, Neutral, Positive] — đúng thứ tự logits
    /// của model, không phải thứ tự hiển thị.
    /// </summary>
    /// <param name="baseProbabilities">Xác suất ba lớp của model trên toàn bộ ý kiến.</param>
    /// <param name="clauseProbabilities">
    /// Xác suất ba lớp cho từng mệnh đề. Khi chỉ có một mệnh đề và không có dấu hiệu tương phản,
    /// truyền vào chính <paramref name="baseProbabilities"/> để giống nhánh dự phòng của bản Python.
    /// </param>
    /// <param name="confidenceThreshold">Ngưỡng dưới đó kết quả chuyển thành <c>Uncertain</c>.</param>
    /// <param name="mixedClauseMinConfidence">Ngưỡng tối thiểu để một mệnh đề được tính là rõ cực.</param>
    public static OpenCommentResolvedSentiment Resolve(
        IReadOnlyList<double> baseProbabilities,
        IReadOnlyList<IReadOnlyList<double>> clauseProbabilities,
        double confidenceThreshold,
        double mixedClauseMinConfidence)
    {
        if (baseProbabilities.Count != 3)
        {
            throw new ArgumentException(
                $"Cần đúng ba xác suất [Negative, Neutral, Positive] nhưng nhận {baseProbabilities.Count}.",
                nameof(baseProbabilities));
        }

        var baseIndex = ArgMax(baseProbabilities);
        var baseLabel = Domain.OpenCommentSentiments.BaseLabels[baseIndex];
        var baseConfidence = baseProbabilities[baseIndex];

        double? bestPositive = null;
        double? bestNegative = null;

        foreach (var clause in clauseProbabilities)
        {
            if (clause.Count != 3)
            {
                throw new ArgumentException(
                    $"Cần đúng ba xác suất cho mỗi mệnh đề nhưng nhận {clause.Count}.",
                    nameof(clauseProbabilities));
            }

            // Xét KHỐI XÁC SUẤT của mệnh đề, không đòi argmax của mệnh đề phải đúng cực đó.
            // Bản cũ đòi argmax nên một vế phàn nàn mà model gọi là Neutral dù cho
            // p(Negative) = 0,45 đã bị bỏ qua hoàn toàn — đó là lý do 30/58 câu hai chiều của
            // tập gold bị ghi thành Tích cực. Đo trên tập test đóng băng 200 câu:
            // recall Mixed 0,2241 -> 0,5862, accuracy 0,6600 -> 0,7650, precision của tập bị
            // gắn cờ giữ nguyên 1,0000.
            var positiveMass = clause[PositiveProbabilityIndex];
            var negativeMass = clause[NegativeProbabilityIndex];

            if (positiveMass >= mixedClauseMinConfidence)
            {
                bestPositive = bestPositive is null
                    ? positiveMass
                    : Math.Max(bestPositive.Value, positiveMass);
            }
            else if (negativeMass >= mixedClauseMinConfidence)
            {
                bestNegative = bestNegative is null
                    ? negativeMass
                    : Math.Max(bestNegative.Value, negativeMass);
            }
        }

        var isMixed = bestPositive is not null && bestNegative is not null;

        if (isMixed)
        {
            // Độ tin cậy của Mixed là mức thấp hơn trong hai cực: kết luận chỉ chắc bằng
            // vế yếu nhất, lấy vế mạnh là tự khen mình.
            return new OpenCommentResolvedSentiment(
                Domain.OpenCommentSentiments.Mixed,
                Math.Min(bestPositive!.Value, bestNegative!.Value));
        }

        if (baseConfidence < confidenceThreshold)
        {
            return new OpenCommentResolvedSentiment(
                Domain.OpenCommentSentiments.Uncertain, baseConfidence);
        }

        return new OpenCommentResolvedSentiment(baseLabel, baseConfidence);
    }

    /// <summary>Kết quả cho ý kiến rỗng: luôn <c>Uncertain</c>, không gọi model.</summary>
    public static OpenCommentResolvedSentiment EmptyResult() =>
        new(Domain.OpenCommentSentiments.Uncertain, 0d);
}
