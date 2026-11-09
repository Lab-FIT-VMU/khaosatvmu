namespace UnitTests.ApplicationTests;

using Application.CourseGrades;
using FluentAssertions;
using Xunit;

/// <summary>Thứ tự học kỳ và mã f_nhhk mong đợi của file điểm (bộ luật A, N5).</summary>
public class SemesterOrderingTests
{
    [Theory]
    [InlineData("2024-2025", "Học kỳ 1", "242512")]
    [InlineData("2024-2025", "Học kỳ 2", "242521")]
    [InlineData("2025 - 2026", "Học kỳ 2", "252621")]
    public void ExpectedTermCode_MatchesFileConvention(string year, string semester, string expected) =>
        SemesterOrdering.ExpectedTermCode(year, semester).Should().Be(expected);

    [Theory]
    [InlineData("2025-2026", "Học kỳ phụ")]
    [InlineData("Năm thử", "Học kỳ 1")]
    public void ExpectedTermCode_IsUnknown_ForSummerTermOrOddYearName(string year, string semester) =>
        SemesterOrdering.ExpectedTermCode(year, semester).Should().BeNull();

    [Fact]
    public void SummerTerm_ComesFirstInTheYear()
    {
        SemesterOrdering.PositionInYear("Học kỳ phụ").Should().BeLessThan(SemesterOrdering.PositionInYear("Học kỳ 1"));
        SemesterOrdering.PositionInYear("Học kỳ 1").Should().BeLessThan(SemesterOrdering.PositionInYear("Học kỳ 2"));
    }
}
