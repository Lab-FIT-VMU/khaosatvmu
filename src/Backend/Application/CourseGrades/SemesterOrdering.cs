namespace Application.CourseGrades;

/// <summary>
/// Thứ tự học kỳ cho phân tích nhiều kỳ. Trong một năm học: Học kỳ phụ → Học kỳ 1 → Học kỳ 2,
/// theo CSDL hiện có (DefaultSemesterNames và trang Năm học đều xếp như vậy, năm học bắt đầu
/// 25/07). Giữa các năm học: theo ngày bắt đầu năm học.
/// </summary>
public static class SemesterOrdering
{
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
