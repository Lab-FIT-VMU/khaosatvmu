namespace UnitTests.ApplicationTests;

using Application.Surveys;
using FluentAssertions;
using Xunit;

public class SurveyComparisonTests
{
    [Theory]
    [InlineData(4.20, 4.35, 0.15, "Improved")]
    [InlineData(4.20, 4.10, -0.10, "Declined")]
    [InlineData(4.20, 4.25, 0.05, "Stable")]
    [InlineData(4.20, 4.15, -0.05, "Stable")]
    public void FacultyComparison_DeltaCalculation_And_TrendStatus(
        decimal baseline, decimal target, decimal expectedDelta, string expectedStatus)
    {
        var delta = Math.Round(target - baseline, 2);
        var status = delta >= 0.1m ? "Improved" : (delta <= -0.1m ? "Declined" : "Stable");

        delta.Should().Be(expectedDelta);
        status.Should().Be(expectedStatus);

        var dto = new SurveyFacultyComparisonDto(
            1,
            "Khoa Hàng hải",
            new Dictionary<int, decimal?> { [1] = baseline, [2] = target },
            baseline,
            target,
            delta,
            status);

        dto.BaselineScore.Should().Be(baseline);
        dto.TargetScore.Should().Be(target);
        dto.DeltaScore.Should().Be(expectedDelta);
        dto.TrendStatus.Should().Be(expectedStatus);
    }

    [Fact]
    public void SurveyComparisonResponseDto_CalculatesOverallAggregatesCorrectly()
    {
        var period1 = new SurveyComparisonPeriodDto(
            1, "Đợt 1", "Mẫu 1", "HK1", "2025-2026", 100, 3000, 2800, 75.0m, 4.10m);
        var period2 = new SurveyComparisonPeriodDto(
            2, "Đợt 2", "Mẫu 1", "HK2", "2025-2026", 105, 3200, 3100, 80.0m, 4.25m);

        var faculty1 = new SurveyFacultyComparisonDto(
            10, "Khoa CNTT", new Dictionary<int, decimal?> { [1] = 4.0m, [2] = 4.3m }, 4.0m, 4.3m, 0.3m, "Improved");
        var faculty2 = new SurveyFacultyComparisonDto(
            20, "Khoa Máy tàu", new Dictionary<int, decimal?> { [1] = 4.2m, [2] = 4.05m }, 4.2m, 4.05m, -0.15m, "Declined");

        var response = new SurveyComparisonResponseDto(
            [period1, period2],
            [faculty1, faculty2],
            [],
            period1.OverallScore,
            period2.OverallScore,
            Math.Round(period2.OverallScore!.Value - period1.OverallScore!.Value, 2),
            period2.CompletionRate - period1.CompletionRate,
            1,
            1);

        response.Periods.Should().HaveCount(2);
        response.Faculties.Should().HaveCount(2);
        response.OverallBaselineScore.Should().Be(4.10m);
        response.OverallTargetScore.Should().Be(4.25m);
        response.OverallDeltaScore.Should().Be(0.15m);
        response.CompletionRateDelta.Should().Be(5.0m);
        response.ImprovedFacultyCount.Should().Be(1);
        response.DeclinedFacultyCount.Should().Be(1);
    }

    [Fact]
    public void FacultyComparison_BelowAverageSections_CalculatesCorrectly()
    {
        var faculty = new SurveyFacultyComparisonDto(
            10, "Khoa CNTT", new Dictionary<int, decimal?> { [1] = 4.0m, [2] = 4.3m },
            4.0m, 4.3m, 0.3m, "Improved", 8, 3, -5);

        faculty.BaselineBelowAverageSections.Should().Be(8);
        faculty.TargetBelowAverageSections.Should().Be(3);
        faculty.DeltaBelowAverageSections.Should().Be(-5);
    }
}
