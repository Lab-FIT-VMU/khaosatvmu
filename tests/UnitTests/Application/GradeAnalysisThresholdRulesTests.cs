namespace UnitTests.ApplicationTests;

using Application.CourseGrades;
using FluentAssertions;
using Xunit;

public class GradeAnalysisThresholdRulesTests
{
    private static Dictionary<string, GradeAnalysisThresholdValue> Defaults() =>
        GradeAnalysisThresholdCatalog.All.ToDictionary(x => x.Code, x => x.DefaultValue);

    private static Dictionary<string, GradeAnalysisThresholdValue> With(string code, decimal value)
    {
        var values = Defaults();
        values[code] = new GradeAnalysisThresholdValue(value, null, null);
        return values;
    }

    [Fact]
    public void Defaults_AreValid() => GradeAnalysisThresholdRules.Validate(Defaults()).Should().BeEmpty();

    [Theory]
    [InlineData("so_sv_toi_thieu_lop", 2, "từ 3 trở lên")]
    [InlineData("so_sv_tin_cay_thap", 15, "phải lớn hơn số sinh viên tối thiểu")]
    [InlineData("nang_luc_nen_thang", 5, "chỉ nhận 4 hoặc 10")]
    [InlineData("muc_tin_cay", 1, "khoảng 0 đến 1")]
    [InlineData("fdr_q", 0, "khoảng 0 đến 1")]
    [InlineData("g1_cua_so_ky", 1, "không nhỏ hơn số học kỳ lặp lại")]
    [InlineData("he_so_ty_le_f", 0.9, "từ 1 trở lên")]
    [InlineData("d1_d2_lech_x", 0, "lớn hơn 0")]
    public void CrossThresholdRules_AreEnforced(string code, double value, string expectedFragment) =>
        GradeAnalysisThresholdRules.Validate(With(code, (decimal)value))
            .Should().Contain(error => error.Contains(expectedFragment));

    [Fact]
    public void IntegerThresholds_RejectFractions() =>
        GradeAnalysisThresholdRules.Validate(With("so_sv_toi_thieu_lop", 15.5m))
            .Should().ContainSingle(error => error.Contains("số nguyên"));

    [Fact]
    public void MissingThreshold_IsReported()
    {
        var values = Defaults();
        values.Remove("fdr_q");
        GradeAnalysisThresholdRules.Validate(values).Should().ContainSingle(error => error.StartsWith("Thiếu ngưỡng"));
    }
}
