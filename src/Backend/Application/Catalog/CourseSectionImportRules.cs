using System.Text;
using System.Text.RegularExpressions;

namespace Application.Catalog;

/// <summary>
/// Các luật của bộ luật B (xử lý file "Danh sách các lớp học phần theo kỳ") áp lên import lớp
/// học phần, viết sẵn trong code. Nguồn: Data/Bo luat/BO_LUAT_XU_LY_LOP_HOC_PHAN.md của module
/// phân tích điểm, cài đặt tham chiếu xu_ly/luat_b.py (_bo_mon, GOP_BM).
/// </summary>
public static partial class CourseSectionImportRules
{
    /// <summary>
    /// Chuẩn hóa văn bản theo B-N4: Unicode NFC, thay Ð (U+00D0, chữ Eth của tiếng Iceland mà
    /// file xuất ra thay cho Đ) bằng Đ (U+0110), gộp khoảng trắng liên tiếp, cắt hai đầu.
    /// </summary>
    public static string? NormalizeText(string? value)
    {
        if (value is null)
        {
            return null;
        }

        var text = value.Normalize(NormalizationForm.FormC).Replace('Ð', 'Đ');
        return Whitespace().Replace(text, " ").Trim();
    }

    /// <summary>Giá trị lỗi công thức của Excel (#N/A, #REF!…): coi như ô trống.</summary>
    public static bool IsSpreadsheetError(string? value) =>
        value is not null && value.TrimStart().StartsWith('#');

    /// <summary>
    /// Luật loại lớp B-L1–B-L4 của bộ luật B, áp ở bước phân tích điểm chứ không ở bước import
    /// (khảo sát vẫn cần đủ mọi lớp). Đồng bộ với L4, L5, L6, L8 của bộ luật A.
    /// </summary>
    public static string? AnalysisExclusionReason(string courseCode, string? courseName)
    {
        var code = courseCode.Trim().ToUpperInvariant();
        if (code.StartsWith("24", StringComparison.Ordinal)) return "B-L1";
        if (PhysicalEducationCode().IsMatch(code)) return "B-L2";
        var lower = (NormalizeText(courseName) ?? string.Empty).ToLowerInvariant();
        if (lower.Contains("thực tập", StringComparison.Ordinal) || lower.Contains("tốt nghiệp", StringComparison.Ordinal)) return "B-L3";
        if (code.StartsWith("179", StringComparison.Ordinal)) return "B-L4";
        return null;
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    [GeneratedRegex(@"^27\d{3}$")]
    private static partial Regex PhysicalEducationCode();
}
