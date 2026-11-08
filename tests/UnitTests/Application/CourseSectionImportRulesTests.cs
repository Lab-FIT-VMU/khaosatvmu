namespace UnitTests.ApplicationTests;

using Application.Catalog;
using FluentAssertions;
using Xunit;

/// <summary>Luật của bộ luật B áp lên import lớp học phần (xu_ly/luat_b.py là bản tham chiếu).</summary>
public class CourseSectionImportRulesTests
{
    [Theory]
    // Chữ Eth (U+00D0) mà file xuất ra thay cho Đ (U+0110), như lớp hành chính "ÐKT66ÐH".
    [InlineData("ÐKT66ÐH", "ĐKT66ĐH")]
    [InlineData("  Nguyễn   Văn  An ", "Nguyễn Văn An")]
    [InlineData("An ninh\tmạng", "An ninh mạng")]
    public void NormalizeText_FollowsRuleBN4(string input, string expected) =>
        CourseSectionImportRules.NormalizeText(input).Should().Be(expected);

    [Fact]
    public void NormalizeText_ComposesDecomposedVietnamese()
    {
        // "ệ" viết dạng tổ hợp (e + dấu mũ + dấu nặng) phải về một ký tự NFC.
        var decomposed = "Việt";
        CourseSectionImportRules.NormalizeText(decomposed).Should().Be("Việt");
    }

    [Fact]
    public void NormalizeText_KeepsNull() => CourseSectionImportRules.NormalizeText(null).Should().BeNull();

    [Theory]
    [InlineData(194, 191)]
    [InlineData(195, 191)]
    [InlineData(191, 191)]
    [InlineData(175, 175)]
    public void ApplyDepartmentMerge_MergesKnownPairs(int input, int expected) =>
        CourseSectionImportRules.ApplyDepartmentMerge(input).Should().Be(expected);

    [Theory]
    [InlineData("12101", 122)]
    [InlineData("12160H", 122)]
    [InlineData("12201", null)]
    [InlineData("17540", null)]
    public void ForcedDepartmentFor_OnlyCoursesStartingWith121(string courseCode, int? expected) =>
        CourseSectionImportRules.ForcedDepartmentFor(courseCode).Should().Be(expected);

    [Theory]
    [InlineData("17540", 175)]
    [InlineData("19412", 191)]
    [InlineData("19501H", 191)]
    [InlineData("AB123", null)]
    [InlineData("12", null)]
    public void DeriveDepartmentFromCourseCode_UsesFirstThreeDigitsAndMerges(string courseCode, int? expected) =>
        CourseSectionImportRules.DeriveDepartmentFromCourseCode(courseCode).Should().Be(expected);

    [Theory]
    [InlineData("#N/A", true)]
    [InlineData(" #REF!", true)]
    [InlineData("175", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsSpreadsheetError_DetectsFormulaErrors(string? value, bool expected) =>
        CourseSectionImportRules.IsSpreadsheetError(value).Should().Be(expected);
}
