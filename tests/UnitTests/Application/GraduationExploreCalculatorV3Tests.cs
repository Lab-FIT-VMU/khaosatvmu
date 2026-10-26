namespace UnitTests.ApplicationTests;

using Application.GraduationAnalytics2;
using Domain;
using FluentAssertions;
using Xunit;

public sealed class GraduationExploreCalculatorV3Tests
{
    [Theory]
    [InlineData("excellent", GraduationRank.Excellent)]
    [InlineData("veryGood", GraduationRank.VeryGood)]
    [InlineData("good", GraduationRank.Good)]
    [InlineData("average", GraduationRank.Average)]
    public void Calculate_RankRate_UsesAllGraduatesInSelectedScopeAsFixedDenominator(string metric, GraduationRank rank)
    {
        var otherRank = rank == GraduationRank.Excellent ? GraduationRank.Average : GraduationRank.Excellent;
        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.CohortCumulative, "62",
            [new GraduationExplorePeriod(1, 2024, 1, 8, 2024), new GraduationExplorePeriod(2, 2024, 2, 10, 2024)],
            [Cell(rank, false, 2, 1), Cell(otherRank, false, 8, 1),
             Cell(rank, false, 4, 2), Cell(otherRank, false, 6, 2)],
            [Population(100)], new GraduationExploreFacetsV3Dto([], [], []), metric, "period");

        result.ChartPoints.Select(x => x.Total).Should().Equal(20, 20);
        result.ChartPoints.Select(x => x.Count).Should().Equal(2, 6);
        result.ChartPoints.Select(x => x.Value).Should().Equal(10m, 30m);
        result.Ranks.Single(x => x.Rank == rank).Rate.Should().Be(30m);
    }

    [Theory]
    [InlineData("workStudy", GraduationRank.Good)]
    [InlineData("excellent", GraduationRank.Excellent)]
    [InlineData("veryGood", GraduationRank.VeryGood)]
    [InlineData("good", GraduationRank.Good)]
    [InlineData("average", GraduationRank.Average)]
    public void Calculate_RankRatesUseGraduates_WhileWorkStudyUsesInput(string metric, GraduationRank rank)
    {
        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.CohortCumulative, "62",
            [new GraduationExplorePeriod(1, 2024, 1, 8, 2024), new GraduationExplorePeriod(2, 2024, 2, 10, 2024)],
            [Cell(rank, true, 2, 1), Cell(rank, true, 3, 2)],
            [Population(20)], new GraduationExploreFacetsV3Dto([], [], []), metric, "period");

        if (metric == "workStudy")
        {
            result.ChartPoints.Select(x => x.Total).Should().Equal(20, 20);
            result.ChartPoints.Select(x => x.Value).Should().Equal(10m, 25m);
        }
        else
        {
            result.ChartPoints.Select(x => x.Total).Should().Equal(5, 5);
            result.ChartPoints.Select(x => x.Value).Should().Equal(40m, 100m);
        }
        result.Kpis.Single(x => x.Id == "workStudy").Rate.Should().Be(25m);
        result.Ranks.Single(x => x.Rank == rank).Rate.Should().Be(100m);
    }

    [Fact]
    public void Calculate_OnTimeCumulativeRate_UsesFixedInitialPopulation()
    {
        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.CohortCumulative, "62",
            [new GraduationExplorePeriod(1, 2024, 1, 8, 2024), new GraduationExplorePeriod(2, 2024, 2, 10, 2024)],
            [Cell(GraduationRank.Good, false, 40, 1), Cell(GraduationRank.Good, false, 80, 2)],
            [Population(200)], new GraduationExploreFacetsV3Dto([], [], []),
            "onTime", "period");

        result.ChartPoints.Select(x => x.Total).Should().Equal(200, 200);
        result.ChartPoints.Select(x => x.Count).Should().Equal(40, 120);
        result.ChartPoints.Select(x => x.Value).Should().Equal(20m, 60m);
        result.Kpis.Single(x => x.Id == "onTime").Rate.Should().Be(60m);
    }

    [Fact]
    public void Calculate_OnTimeCumulativeRate_KeepsPopulationSeparateForEachCohort()
    {
        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.CohortCumulative, null,
            [new GraduationExplorePeriod(1, 2024, 1, 8, 2024), new GraduationExplorePeriod(2, 2024, 2, 10, 2024)],
            [Cell(GraduationRank.Good, false, 2, 1, "62"), Cell(GraduationRank.Good, false, 3, 2, "62"),
             Cell(GraduationRank.Good, false, 4, 1, "63"), Cell(GraduationRank.Good, false, 6, 2, "63")],
            [Population(10, "62"), Population(40, "63")], new GraduationExploreFacetsV3Dto([], [], []),
            "onTime", "period", "cohort");

        result.ChartPoints.Where(x => x.SeriesKey == "62").Select(x => x.Total).Should().Equal(10, 10);
        result.ChartPoints.Where(x => x.SeriesKey == "63").Select(x => x.Total).Should().Equal(40, 40);
        result.ChartPoints.Single(x => x.GroupKey == "2" && x.SeriesKey == "62").Value.Should().Be(50m);
        result.ChartPoints.Single(x => x.GroupKey == "2" && x.SeriesKey == "63").Value.Should().Be(25m);
    }

    [Theory]
    [InlineData(GraduationExploreModes.Period, 6, 19)]
    [InlineData(GraduationExploreModes.CohortCumulative, 9, 29)]
    public void Calculate_PeriodChartSplitByCohort_UsesEachCohortsPopulation(
        string mode, int expectedK60, int expectedK61)
    {
        var result = GraduationExploreCalculator.Calculate(
            mode,
            null,
            [new GraduationExplorePeriod(1, 2024, 1, 8, 2024), new GraduationExplorePeriod(2, 2024, 2, 10, 2024)],
            [Cell(GraduationRank.Good, false, 3, 1, "60"), Cell(GraduationRank.Good, false, 6, 2, "60"),
             Cell(GraduationRank.Good, false, 10, 1, "61"), Cell(GraduationRank.Good, false, 19, 2, "61")],
            [Population(9, "60"), Population(29, "61")],
            new GraduationExploreFacetsV3Dto([], [], []),
            "graduated", "period", "cohort");

        var k60 = result.ChartPoints.Single(x => x.GroupKey == "2" && x.SeriesKey == "60");
        var k61 = result.ChartPoints.Single(x => x.GroupKey == "2" && x.SeriesKey == "61");
        k60.Total.Should().Be(9);
        k61.Total.Should().Be(29);
        k60.Count.Should().Be(expectedK60);
        k61.Count.Should().Be(expectedK61);
        if (mode == GraduationExploreModes.CohortCumulative)
        {
            k60.Value.Should().Be(100m);
            k61.Value.Should().Be(100m);
        }
    }

    [Theory]
    [InlineData(GraduationExploreModes.Period, 6, 19)]
    [InlineData(GraduationExploreModes.CohortCumulative, 9, 29)]
    public void Calculate_RankChartSplitByCohort_UsesEachCohortsFixedGraduates(
        string mode, int expectedK60Count, int expectedK61Count)
    {
        var result = GraduationExploreCalculator.Calculate(
            mode, null,
            [new GraduationExplorePeriod(1, 2024, 1, 8, 2024), new GraduationExplorePeriod(2, 2024, 2, 10, 2024)],
            [Cell(GraduationRank.Good, false, 3, 1, "60"), Cell(GraduationRank.Good, false, 6, 2, "60"),
             Cell(GraduationRank.Good, false, 10, 1, "61"), Cell(GraduationRank.Good, false, 19, 2, "61")],
            [Population(9, "60"), Population(29, "61")],
            new GraduationExploreFacetsV3Dto([], [], []),
            "good", "period", "cohort");

        var k60 = result.ChartPoints.Single(x => x.GroupKey == "2" && x.SeriesKey == "60");
        var k61 = result.ChartPoints.Single(x => x.GroupKey == "2" && x.SeriesKey == "61");
        k60.Total.Should().Be(9);
        k61.Total.Should().Be(29);
        k60.Count.Should().Be(expectedK60Count);
        k61.Count.Should().Be(expectedK61Count);
        k60.Value.Should().Be(mode == GraduationExploreModes.Period ? 66.667m : 100m);
        k61.Value.Should().Be(mode == GraduationExploreModes.Period ? 65.517m : 100m);
    }

    [Theory]
    [InlineData("56", 2020)]
    [InlineData("57", 2021)]
    [InlineData("58", 2022)]
    [InlineData("59", 2023)]
    [InlineData("60", 2024)]
    [InlineData("61", 2025)]
    [InlineData("62", 2026)]
    [InlineData("63", 2027)]
    [InlineData("64", 2028)]
    [InlineData("65", 2029)]
    [InlineData("66", 2030)]
    [InlineData("67", 2031)]
    public void OnTimePolicy_AppliesTheSameJanuaryBoundaryToEveryCohort(
        string cohortCode,
        int deadlineYear)
    {
        GraduationOnTimePolicy.IsOnTime(cohortCode, deadlineYear - 2, 1, deadlineYear)
            .Should().BeTrue();
        GraduationOnTimePolicy.IsOnTime(cohortCode, deadlineYear - 2, 2, deadlineYear)
            .Should().BeFalse();
    }

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
        result.Kpis.Single(x => x.Id == "onTime").Should().Match<GraduationKpiDto>(x => x.Count == 6 && x.Rate == 60m);
        result.Kpis.Single(x => x.Id == "workStudy").Should().Match<GraduationKpiDto>(x => x.Count == 2 && x.Rate == 20m);
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

    [Fact]
    public void Calculate_CountsK63ThroughJanuary2027AsOnTime_ButNotFebruary2027()
    {
        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.Period,
            "63",
            [
                new GraduationExplorePeriod(1, 2025, 1, 12, 2025),
                new GraduationExplorePeriod(2, 2025, 2, 8, 2026),
                new GraduationExplorePeriod(3, 2026, 1, 1, 2027),
                new GraduationExplorePeriod(4, 2026, 2, 2, 2027),
            ],
            [
                Cell(GraduationRank.Good, false, 4, 1, "63"),
                Cell(GraduationRank.Good, false, 3, 2, "63"),
                Cell(GraduationRank.Good, false, 2, 3, "63"),
                Cell(GraduationRank.Good, false, 1, 4, "63"),
            ],
            [Population(10, "63")],
            new GraduationExploreFacetsV3Dto([], [], []),
            "onTime",
            "period");

        result.Kpis.Single(x => x.Id == "onTime").Should().Match<GraduationKpiDto>(
            x => x.Count == 9 && x.Rate == 90m);
        result.Timeline.Select(x => x.OnTime).Should().Equal(4, 3, 2, 0);
    }

    [Fact]
    public void Calculate_CumulativeMode_StopsAtFirstPeriodWherePopulationIsFullyGraduated()
    {
        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.CohortCumulative,
            "58",
            [
                new GraduationExplorePeriod(1, 2024, 1, 8, 2024),
                new GraduationExplorePeriod(2, 2024, 2, 10, 2024),
                new GraduationExplorePeriod(3, 2024, 3, 12, 2024),
            ],
            [
                Cell(GraduationRank.Good, false, 4, 1, "58"),
                Cell(GraduationRank.Good, false, 6, 2, "58"),
                Cell(GraduationRank.Good, false, 1, 3, "58"),
            ],
            [Population(10, "58")],
            new GraduationExploreFacetsV3Dto([], [], []),
            "graduated",
            "period");

        result.Scope.CutoffPeriodId.Should().Be(2);
        result.Scope.IncludedPeriodCount.Should().Be(2);
        result.Timeline.Select(x => x.PeriodId).Should().Equal(1, 2);
        result.ChartPoints.Select(x => x.GroupKey).Should().Equal("1", "2");
        result.ChartPoints[^1].Should().Match<GraduationChartPointV3Dto>(
            x => x.Value == 100m && x.Count == 10 && x.Total == 10);
    }

    private static GraduationExploreCell Cell(
        GraduationRank rank,
        bool workStudy,
        int count,
        long periodId = 1,
        string cohortCode = "62") => new(
        periodId, "Khoa CNTT", "KHOA CNTT", "Công nghệ thông tin", "CONG NGHE THONG TIN",
        cohortCode, rank, workStudy, count);

    private static GraduationPopulationCell Population(int count, string cohortCode = "62") => new(
        "Khoa CNTT", "KHOA CNTT", "Công nghệ thông tin", "CONG NGHE THONG TIN", cohortCode, count);
}
