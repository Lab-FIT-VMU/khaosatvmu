using System.Globalization;

namespace Application.Cohorts;

/// <summary>
/// Quy tắc mã khoá theo năm học nhập học: năm học 2018-2019 ứng với khoá 59, mỗi năm học
/// sau đó tăng một khoá. Dùng chung cho chỗ tự tạo khoá lúc thêm năm học và chỗ sửa khoá.
/// </summary>
public static class CohortCodeRules
{
    public const int BaseAcademicYearStart = 2018;
    public const int BaseCohortNumber = 59;

    /// <summary>'2018-2019' cho ra '59'. Trả về rỗng nếu tên năm học không đọc được.</summary>
    public static string FromAcademicYearName(string academicYearName)
    {
        var digits = new string(academicYearName.TakeWhile(char.IsDigit).ToArray());
        return int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var yearStart)
            ? (BaseCohortNumber + (yearStart - BaseAcademicYearStart)).ToString(CultureInfo.InvariantCulture)
            : string.Empty;
    }

    /// <summary>Tên hiển thị mặc định của khoá, vd 'Khoá 67'.</summary>
    public static string DefaultName(string cohortCode) => $"Khoá {cohortCode}";
}
