namespace UnitTests.ApplicationTests;

using Application.GraduationAnalytics2;
using Domain;
using FluentAssertions;
using Xunit;

public sealed class GraduationExploreCalculatorV3Tests
{
    [Fact]
    public void Calculate_UsesInitialPopulationForKpisAndChartPercentages()
    {
        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.Period,
            "62",
            [new GraduationExplorePeriod(1, 2024, 1, 8, 2024)],
            [
                Cell(GraduationRank.Excellent, true, 2),
                Cell(GraduationRank.Good, false, 4),
            ],
            [Population(10)],
            new GraduationExploreFacetsV3Dto([], [], []),
            "graduated",
            "cohort");

        // Số nhập học vẫn là mẫu số của tỷ lệ Đã tốt nghiệp, chỉ không còn đứng thành
        // thẻ chỉ số riêng — bỏ cùng thẻ Chưa tốt nghiệp.
        result.Kpis.Should().NotContain(x => x.Id == "studentTotal" || x.Id == "notGraduated");
        result.Kpis.Single(x => x.Id == "graduated").Should().Match<GraduationKpiDto>(x => x.Count == 6 && x.Rate == 60m);
        result.Kpis.Single(x => x.Id == "onTime").Should().Match<GraduationKpiDto>(x => x.Count == 6 && x.Rate == 100m);
        result.Kpis.Single(x => x.Id == "workStudy").Should().Match<GraduationKpiDto>(x => x.Count == 2 && x.Rate == 33.333m);
        result.ChartPoints.Should().ContainSingle().Which.Should().Match<GraduationChartPointV3Dto>(
            x => x.Value == 60m && x.Count == 6 && x.Total == 10);
    }

    [Fact]
    public void Calculate_PreservesWorkStudyAndRankIntersectionFromSnapshotCells()
    {
        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.Period,
            "62",
            [new GraduationExplorePeriod(1, 2024, 1, 8, 2024)],
            [
                Cell(GraduationRank.Excellent, false, 3),
                Cell(GraduationRank.Good, true, 2),
            ],
            [Population(10)],
            new GraduationExploreFacetsV3Dto([], [], []),
            "good",
            "cohort");

        result.Ranks.Single(x => x.Rank == GraduationRank.Excellent).Count.Should().Be(3);
        result.Ranks.Single(x => x.Rank == GraduationRank.Good).Count.Should().Be(2);
        result.Ranks.Single(x => x.Rank == GraduationRank.Excellent).WorkStudyCount.Should().Be(0);
        result.Ranks.Single(x => x.Rank == GraduationRank.Good).WorkStudyCount.Should().Be(2);
        result.Kpis.Single(x => x.Id == "workStudy").Count.Should().Be(2);
        result.ChartPoints.Should().ContainSingle().Which.Count.Should().Be(2);
    }

    private static GraduationExploreCell Cell(GraduationRank rank, bool workStudy, int count) => new(
        1, "Khoa CNTT", "KHOA CNTT", "Công nghệ thông tin", "CONG NGHE THONG TIN",
        "62", rank, workStudy, count);

    private static GraduationPopulationCell Population(int count) => new(
        "Khoa CNTT", "KHOA CNTT", "Công nghệ thông tin", "CONG NGHE THONG TIN", "62", count);
}
