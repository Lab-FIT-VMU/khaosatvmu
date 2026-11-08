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
    /// Bộ môn gộp (B-T1): mã 194, 195 thuộc bộ môn 191. File lớp thật HK1 2025–2026 có 52 lớp
    /// mang mã 194/195, mà hai mã này không có trong bảng Departments.
    /// </summary>
    public static readonly IReadOnlyDictionary<int, int> MergedDepartmentCodes = new Dictionary<int, int>
    {
        [194] = 191,
        [195] = 191,
    };

    /// <summary>B-T1 bước 1: học phần mã 121… luôn thuộc bộ môn 122, bỏ qua giá trị trong file.</summary>
    public const string ForcedDepartmentCoursePrefix = "121";
    public const int ForcedDepartmentId = 122;

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

    /// <summary>Áp luật gộp bộ môn lên một mã bộ môn.</summary>
    public static int ApplyDepartmentMerge(int departmentId) =>
        MergedDepartmentCodes.TryGetValue(departmentId, out var merged) ? merged : departmentId;

    /// <summary>
    /// Bộ môn bị ép theo mã học phần (121… → 122), hoặc null nếu học phần không thuộc luật này.
    /// </summary>
    public static int? ForcedDepartmentFor(string courseCode) =>
        courseCode.Trim().StartsWith(ForcedDepartmentCoursePrefix, StringComparison.Ordinal)
            ? ForcedDepartmentId
            : null;

    /// <summary>
    /// B-T1 bước 3: khi file bỏ trống Mã BM và Bộ môn (hoặc ghi #N/A), suy bộ môn từ 3 chữ số
    /// đầu của mã học phần rồi áp luật gộp. Trả null nếu mã học phần không bắt đầu bằng 3 chữ số.
    /// </summary>
    public static int? DeriveDepartmentFromCourseCode(string courseCode)
    {
        var code = courseCode.Trim();
        if (code.Length < 3 || !int.TryParse(code.AsSpan(0, 3), out var prefix) || !char.IsAsciiDigit(code[0]))
        {
            return null;
        }

        return ApplyDepartmentMerge(prefix);
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
