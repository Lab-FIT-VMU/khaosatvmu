using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace SentimentWorker.Sentiment;

/// <summary>
/// Chuẩn hoá nội dung ý kiến trước khi suy luận và trước khi băm.
///
/// LƯU Ý QUAN TRỌNG: chuỗi đưa vào model là nội dung ĐÃ CẮT khoảng trắng hai đầu nhưng giữ
/// nguyên phần thân, kể cả xuống dòng và khoảng trắng lặp. Tokenizer của PhoBERT bỏ qua mọi
/// khoảng trắng khi tách từ, nên giữ nguyên thân văn bản là cách duy nhất để chuỗi token
/// trùng khớp với lúc huấn luyện. Bản chuẩn hoá mạnh hơn chỉ dùng để băm nội dung, phục vụ
/// phát hiện ý kiến bị sửa — không dùng làm đầu vào model.
/// </summary>
public static partial class OpenCommentContentNormalizer
{
    /// <summary>Bản dùng để băm: NFC, gộp mọi khoảng trắng thành một dấu cách, cắt hai đầu.</summary>
    public static string NormalizeForHash(string comment)
    {
        if (string.IsNullOrEmpty(comment))
        {
            return string.Empty;
        }

        var normalized = comment.Normalize(NormalizationForm.FormC);
        var collapsed = WhitespacePattern().Replace(normalized, " ");
        return collapsed.Trim();
    }

    /// <summary>SHA-256 dạng hex thường của nội dung đã chuẩn hoá để băm.</summary>
    public static string ComputeHash(string comment)
    {
        var normalized = NormalizeForHash(comment);
        var bytes = Encoding.UTF8.GetBytes(normalized);
        return Convert.ToHexStringLower(SHA256.HashData(bytes));
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespacePattern();
}
