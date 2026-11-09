using System.Text.RegularExpressions;

namespace Application.CourseGrades;

/// <summary>
/// Thứ tự học kỳ cho phân tích nhiều kỳ. Trong một năm học: Học kỳ phụ → Học kỳ 1 → Học kỳ 2,
/// theo CSDL hiện có (DefaultSemesterNames và trang Năm học đều xếp như vậy, năm học bắt đầu
/// 25/07). Giữa các năm học: theo ngày bắt đầu năm học.
/// </summary>
public static partial class SemesterOrdering
{
    /// <summary>
    /// Mã f_nhhk mà file điểm của kỳ này phải có (bộ luật A, N5): năm học 2025–2026, HK1 → 252612;
    /// HK2 → 252621. Học kỳ phụ chưa có mã quy ước, tên năm học không đúng dạng → null (không kiểm tra).
    /// </summary>
    public static string? ExpectedTermCode(string academicYearName, string semesterName)
    {
        var years = YearPair().Match(academicYearName);
        if (!years.Success) return null;
        var suffix = PositionInYear(semesterName) switch { 1 => "12", 2 => "21", _ => null };
        return suffix is null ? null : $"{years.Groups[1].Value[2..]}{years.Groups[2].Value[2..]}{suffix}";
    }

    [GeneratedRegex(@"(\d{4})\D+(\d{4})")]
    private static partial Regex YearPair();

    /// <summary>Vị trí trong năm học: 0 = học kỳ phụ, 1 = HK1, 2 = HK2; tên lạ xếp sau cùng.</summary>
    public static int PositionInYear(string semesterName)
    {
        var name = semesterName.Trim().ToLowerInvariant();
        if (name.Contains("phụ", StringComparison.Ordinal)) return 0;
        if (name.EndsWith('1')) return 1;
        if (name.EndsWith('2')) return 2;
        return 9;
    }
}
