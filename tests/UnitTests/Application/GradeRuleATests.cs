namespace UnitTests.ApplicationTests;

using Application.CourseGrades;
using FluentAssertions;
using Xunit;

/// <summary>
/// Bộ luật A (BO_LUAT_XU_LY_DIEM_HOC_TAP.md) trên dòng tự dựng. Mỗi ca ứng với một luật của
/// tài liệu; bản tham chiếu là xu_ly/luat_a.py của module phân tích điểm.
/// </summary>
public class GradeRuleATests
{
    private static (int, IReadOnlyDictionary<string, object?>) Row(
        int rowNumber,
        object? masv = null,
        object? mamh = null,
        string? tenmh = "Toán cao cấp",
        object? d1 = null,
        object? d2 = null,
        object? d3 = null,
        object? thi = null,
        string? ghichu = null,
        string? loptc = "N01")
    {
        var cells = new Dictionary<string, object?>
        {
            ["f_nhhk"] = 242512d,
            ["f_masv"] = masv ?? 999001d,
            ["f_mamh"] = mamh ?? 18201d,
            ["f_tenmh"] = tenmh,
            ["f_diem1"] = d1,
            ["f_diem2"] = d2,
            ["f_diem3"] = d3,
            ["f_diemthi"] = thi,
            ["f_ghichu"] = ghichu,
            ["f_loptc"] = loptc,
        };
        return (rowNumber, cells);
    }

    private static GradeRuleARow Single(params (int, IReadOnlyDictionary<string, object?>)[] rows) =>
        GradeRuleA.Process(rows).Rows.Single();

    [Theory]
    [InlineData(null, null, null, -1d, null, "L1")]
    [InlineData(7d, null, null, 6d, "M", "L2")]
    [InlineData(7d, null, null, 6d, "B", "L3")]
    [InlineData(null, null, null, 6d, null, "L7")]
    public void ExclusionRules_FollowDocumentOrder(object? d1, object? d2, object? d3, object? thi, string? ghichu, string expected) =>
        Single(Row(2, d1: d1, d2: d2, d3: d3, thi: thi, ghichu: ghichu)).ExclusionRule.Should().Be(expected);

    [Fact]
    public void BS_IsNotB_SoTheRowIsKept() =>
        Single(Row(2, d1: 7d, thi: 6d, ghichu: "BS")).ExclusionRule.Should().BeNull();

    [Theory]
    [InlineData(24100d, "L4")]
    [InlineData(27203d, "L5")]
    [InlineData("17904H", "L8")]
    [InlineData(27203100d, null)]
    public void CourseCodeRules(object mamh, string? expected) =>
        Single(Row(2, mamh: mamh, d1: 7d, thi: 6d)).ExclusionRule.Should().Be(expected);

    [Theory]
    [InlineData("Thực tập tốt nghiệp")]
    [InlineData("Đồ án TỐT NGHIỆP")]
    public void InternshipOrGraduationNames_AreL6(string name) =>
        Single(Row(2, tenmh: name, d1: 7d, thi: 6d)).ExclusionRule.Should().Be("L6");

    [Fact]
    public void X_IsMeanOfPresentComponents_RoundedHalfUp()
    {
        // (6,2 + 6,3) / 2 = 6,25 → 6,3 (half-up, không phải làm tròn kiểu ngân hàng).
        var row = Single(Row(2, d1: 6.2d, d2: 6.3d, thi: 7d));
        row.X.Should().Be(6.3m);
        row.Y.Should().Be(7m);
        // Z = 0,5 × 6,25 + 0,5 × 7 = 6,625 → 6,6; X chưa làm tròn khi tính Z.
        row.Z.Should().Be(6.6m);
    }

    [Fact]
    public void AnyComponentBelowFour_ZeroesX_AndY_AndZ()
    {
        var row = Single(Row(2, d1: 8d, d2: 3.5d, thi: 9d));
        row.X.Should().Be(0m);
        row.Y.Should().Be(0m);
        row.Z.Should().Be(0m);
    }

    [Fact]
    public void AbsentFromExam_V_ZeroesY()
    {
        var row = Single(Row(2, d1: 8d, thi: 9d, ghichu: "V"));
        row.X.Should().Be(8m);
        row.Y.Should().Be(0m);
        row.Z.Should().Be(0m);
    }

    [Fact]
    public void ExamBelowFour_ZeroesZ_ButKeepsY()
    {
        var row = Single(Row(2, d1: 8d, thi: 3.5d));
        row.Y.Should().Be(3.5m);
        row.Z.Should().Be(0m);
    }

    [Fact]
    public void CommaDecimalStrings_AreParsed()
    {
        // Luật N2: file 2425_HK1 lưu điểm dạng "5,7".
        var row = Single(Row(2, d1: "5,7", thi: "6,0"));
        row.Component1.Should().Be(5.7m);
        row.X.Should().Be(5.7m);
        row.Z.Should().Be(5.9m);
    }

    [Fact]
    public void Duplicates_KeepHighestExamScore_OthersMarkedT()
    {
        var result = GradeRuleA.Process(
        [
            Row(2, d1: 7d, thi: 5d, loptc: "N01"),
            Row(3, d1: 7d, thi: 8d, loptc: "N02"),
            Row(4, d1: 7d, thi: 8d, loptc: "N03"),
        ]);

        result.Rows.Single(x => x.ExclusionRule is null).RowNumber.Should().Be(3, "dòng có Y cao nhất, gặp trước");
        result.Rows.Count(x => x.ExclusionRule == "T").Should().Be(2);
        result.ExcludedCounts["T"].Should().Be(2);
    }

    [Fact]
    public void NumericStudentAndCourseCodes_LoseTrailingZeroes()
    {
        var row = Single(Row(2, masv: 999001d, mamh: 15216d, d1: 7d, thi: 6d));
        row.StudentCode.Should().Be("999001");
        row.CourseCode.Should().Be("15216");
    }

    [Fact]
    public void UnreadableRows_AreCountedButNotReturned()
    {
        var result = GradeRuleA.Process([Row(2, d1: "abc", thi: 6d), Row(3, d1: 7d, thi: 6d)]);

        result.SourceRowCount.Should().Be(2);
        result.Rows.Should().ContainSingle();
        result.UnreadableRowNumbers.Should().Equal(2);
        result.ExcludedCounts["E"].Should().Be(1);
    }
}
