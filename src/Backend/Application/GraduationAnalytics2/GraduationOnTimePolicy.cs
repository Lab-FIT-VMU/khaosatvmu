using System.Globalization;

namespace Application.GraduationAnalytics2;

/// <summary>
/// Quy tắc tốt nghiệp đúng hạn dùng chung cho KPI, biểu đồ và số tổng ở danh mục.
/// Khoá 59 nhập học năm 2018-2019; sinh viên hoàn thành bốn năm vào năm dương lịch
/// thứ năm kể từ năm bắt đầu. Hạn chuẩn là hết tháng 01 kế tiếp (ví dụ khoá 63:
/// các đợt trong năm 2026 đến hết 01/2027 vẫn đúng hạn).
/// </summary>
public static class GraduationOnTimePolicy
{
    private const int BaseAcademicYearStart = 2018;
    private const int BaseCohortNumber = 59;
    private const int StandardProgramYears = 4;
    private const int GraceMonth = 1;

    public static bool IsOnTime(
        string? cohortCode,
        int roundAcademicYearStart,
        int? reviewMonth,
        int? reviewYear)
    {
        var digits = new string((cohortCode ?? string.Empty).Where(char.IsDigit).ToArray());
        if (!int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var cohortNumber))
        {
            return false;
        }

        var cohortAcademicYearStart = BaseAcademicYearStart + (cohortNumber - BaseCohortNumber);
        if (reviewMonth is >= 1 and <= 12 && reviewYear is >= 1900)
        {
            var reviewOrder = reviewYear.Value * 12 + reviewMonth.Value;
            var deadlineYear = cohortAcademicYearStart + StandardProgramYears + 1;
            var deadlineOrder = deadlineYear * 12 + GraceMonth;
            return reviewOrder <= deadlineOrder;
        }

        // Dữ liệu cũ chưa có tháng/năm xét: giữ cách suy luận theo năm học thứ tư.
        return roundAcademicYearStart - cohortAcademicYearStart == StandardProgramYears - 1;
    }
}
