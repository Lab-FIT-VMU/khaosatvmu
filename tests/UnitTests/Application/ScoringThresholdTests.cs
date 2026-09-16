namespace UnitTests.ApplicationTests;

using Application.Surveys;
using FluentAssertions;
using Xunit;

/// <summary>
/// Hai vòng lọc quyết định một lớp có được tính vào điểm hay không. Quy tắc này
/// quyết định lớp nào có mặt trong mọi con số tổng hợp, nên khoá lại bằng test
/// thay vì tin vào trí nhớ.
/// </summary>
public class ScoringThresholdTests
{
    /// <summary>Mặc định hệ thống: 50% phản hồi và 80% phiếu hợp lệ.</summary>
    private static readonly ScoringThresholds Default = ScoringThresholds.Default;

    [Theory]
    // Qua cả hai vòng.
    [InlineData(40, 20, 20, true)]   // phản hồi đúng 50%, hợp lệ 100%
    [InlineData(40, 25, 20, true)]   // phản hồi 62.5%, hợp lệ đúng 80%
    // Rớt vòng 1: quá ít người trả lời.
    [InlineData(40, 19, 19, false)]  // phản hồi 47.5%
    [InlineData(100, 49, 49, false)] // 49% không được làm tròn lên thành đạt
    // Rớt vòng 2: nộp đủ nhưng phần lớn phiếu bị bộ lọc đánh rớt.
    [InlineData(40, 30, 23, false)]  // phản hồi 75% nhưng hợp lệ mới 76.7%
    [InlineData(10, 10, 3, false)]   // cả lớp nộp mà chỉ 30% hợp lệ
    // Trường hợp biên.
    [InlineData(0, 5, 5, false)]     // sĩ số 0 thì không có mẫu số nào để chia
    [InlineData(30, 0, 0, false)]    // chưa ai làm
    public void HasEnoughResponsesToScore_ShouldNeedBothGates(
        int classSize,
        int totalResponseCount,
        int validResponseCount,
        bool expected)
    {
        Default
            .HasEnoughResponsesToScore(classSize, totalResponseCount, validResponseCount)
            .Should().Be(expected);
    }

    [Fact]
    public void Default_ShouldStayInSyncWithTheFrontend()
    {
        // Bản sao ở src/Frontend/src/utils/reportThresholds.ts phải cùng hai con số
        // này, vì giao diện hiển thị mặc định trước khi tải được cấu hình từ API.
        Default.MinimumResponseRate.Should().Be(50m);
        Default.MinimumValidRate.Should().Be(80m);
    }

    [Theory]
    [InlineData(-1, 80, false)]
    [InlineData(50, 101, false)]
    [InlineData(0, 0, true)]
    [InlineData(100, 100, true)]
    public void IsValid_ShouldRejectRatesOutsideZeroToOneHundred(
        decimal responseRate,
        decimal validRate,
        bool expected)
    {
        new ScoringThresholds(responseRate, validRate, true, true, true)
            .IsValid.Should().Be(expected);
    }

    [Fact]
    public void LooseningTheThresholds_ShouldLetMoreClassesIn()
    {
        // Lớp phản hồi 40%, hợp lệ 75%: rớt cả hai vòng ở mức mặc định.
        Default.HasEnoughResponsesToScore(100, 40, 30).Should().BeFalse();

        var loose = new ScoringThresholds(30m, 70m, true, true, true);
        loose.HasEnoughResponsesToScore(100, 40, 30).Should().BeTrue();
    }
}
