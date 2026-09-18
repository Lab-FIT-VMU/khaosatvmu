namespace UnitTests.ApplicationTests;

using Application.GraduationAnalytics;
using Domain;
using FluentAssertions;
using Xunit;

public sealed class GraduationExploreCalculatorTests
{
    [Fact]
    public void Calculate_BuildsKpisRanksAndCumulativeTimelineFromTheSamePopulation()
    {
        var periods = new[]
        {
            Period(1, 2024, 4, 2025, 1),
            Period(2, 2024, 5, 2025, 2),
            Period(3, 2025, 9, 2025, 1),
        };
        var cells = new[]
        {
            Cell(1, GraduationRank.Excellent, false, 2),
            Cell(1, GraduationRank.Good, true, 1),
            Cell(2, GraduationRank.Average, false, 3),
        };

        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.CohortCumulative,
            "K62",
            periods,
            cells,
            EmptyFacets());

        result.Kpis.Single(x => x.Id == "graduated").Count.Should().Be(6);
        result.Kpis.Single(x => x.Id == "onTime").Count.Should().Be(5);
        result.Kpis.Single(x => x.Id == "workStudy").Count.Should().Be(1);
        result.Kpis.Single(x => x.Id == "workStudy").Rate.Should().Be(16.67m);
        result.Ranks.Single(x => x.Rank == GraduationRank.Excellent).Count.Should().Be(2);
        result.Ranks.Single(x => x.Rank == GraduationRank.VeryGood).Count.Should().Be(0);
        result.Ranks.Single(x => x.Rank == GraduationRank.Good).Count.Should().Be(1);
        result.Ranks.Single(x => x.Rank == GraduationRank.Average).Count.Should().Be(3);

        result.Timeline.Select(x => x.Graduated).Should().Equal(3, 3, 0);
        result.Timeline.Select(x => x.PeriodLabel).Should().Equal("04/2025", "05/2025", "09/2025");
        result.Timeline.Select(x => x.CumulativeGraduated).Should().Equal(3, 6, 6);
        result.Timeline.Select(x => x.CumulativeWorkStudy).Should().Equal(1, 1, 1);
        result.Timeline.Select(x => x.Excellent).Should().Equal(2, 0, 0);
        result.Timeline.Select(x => x.Good).Should().Equal(1, 0, 0);
        result.Timeline.Select(x => x.Average).Should().Equal(0, 3, 0);
        result.Timeline.Select(x => x.CumulativeExcellent).Should().Equal(2, 2, 2);
        result.Timeline.Select(x => x.CumulativeGood).Should().Equal(1, 1, 1);
        result.Timeline.Select(x => x.CumulativeAverage).Should().Equal(0, 3, 3);
        result.ChartPoints.Select(x => x.Value).Should().Equal(3, 6, 6);
        result.Scope.StartPeriodId.Should().Be(1);
        result.Scope.CutoffPeriodId.Should().Be(3);
        result.Scope.IncludedPeriodCount.Should().Be(3);
    }

    [Fact]
    public void Calculate_GroupsNormalizedDimensionsAndKeepsOneDisplayLabel()
    {
        var cells = new[]
        {
            Cell(1, GraduationRank.VeryGood, false, 4, "Khoa Kinh tế", "KHOA KINH TE"),
            Cell(1, GraduationRank.Good, true, 2, "KHOA KINH TẾ", "KHOA KINH TE"),
        };

        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.Period,
            null,
            [Period(1, 2025, 9, 2025, 1)],
            cells,
            EmptyFacets());

        var row = result.Breakdown.Should().ContainSingle().Subject;
        row.Graduated.Should().Be(6);
        row.OnTime.Should().Be(4);
        row.WorkStudy.Should().Be(2);
        row.VeryGood.Should().Be(4);
        row.Good.Should().Be(2);
    }

    [Fact]
    public void Calculate_UsesZeroRatesForAnEmptyFilteredPopulation()
    {
        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.Period,
            "K99",
            [Period(1, 2025, 9, 2025, 1)],
            [],
            EmptyFacets());

        result.Kpis.Should().OnlyContain(x => x.Count == 0 && x.Rate == 0);
        result.Ranks.Should().OnlyContain(x => x.Count == 0 && x.Rate == 0);
        result.Breakdown.Should().BeEmpty();
        result.Timeline.Should().ContainSingle(x => x.Graduated == 0 && x.CumulativeGraduated == 0);
        result.ChartPoints.Should().ContainSingle(x => x.Value == 0);
    }

    [Fact]
    public void Calculate_BuildsSelectedRankByGroupAndSeries()
    {
        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.Period,
            null,
            [Period(1, 2025, 9, 2025, 1)],
            [
                Cell(1, GraduationRank.Excellent, false, 2),
                Cell(1, GraduationRank.Good, false, 3),
            ],
            EmptyFacets(),
            "excellent",
            "cohort",
            "faculty");

        var point = result.ChartPoints.Should().ContainSingle().Subject;
        point.GroupLabel.Should().Be("K62");
        point.SeriesLabel.Should().Be("Khoa CNTT");
        point.Value.Should().Be(2);
    }

    [Fact]
    public void Calculate_CumulativeModeSupportsAnOverviewAcrossAllCohorts()
    {
        var periods = new[]
        {
            Period(1, 2024, 4, 2025, 1),
            Period(2, 2024, 5, 2025, 2),
        };
        var cells = new[]
        {
            Cell(1, GraduationRank.Excellent, false, 2, cohort: "K61"),
            Cell(2, GraduationRank.Good, false, 3, cohort: "K61"),
            Cell(1, GraduationRank.VeryGood, false, 4, cohort: "K62"),
        };

        var byCohort = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.CohortCumulative,
            null,
            periods,
            cells,
            EmptyFacets(),
            "graduated",
            "cohort",
            null);

        byCohort.Scope.Cohort.Should().BeNull();
        byCohort.ChartPoints.Should().ContainSingle(x => x.GroupLabel == "K61" && x.Value == 5);
        byCohort.ChartPoints.Should().ContainSingle(x => x.GroupLabel == "K62" && x.Value == 4);

        var timelineByCohort = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.CohortCumulative,
            null,
            periods,
            cells,
            EmptyFacets(),
            "graduated",
            "period",
            "cohort");

        timelineByCohort.ChartPoints
            .Where(x => x.SeriesLabel == "K61")
            .Select(x => x.Value)
            .Should().Equal(2, 5);
        timelineByCohort.ChartPoints
            .Where(x => x.SeriesLabel == "K62")
            .Select(x => x.Value)
            .Should().Equal(4, 4);
    }

    [Fact]
    public void Calculate_CumulativeRangeRestartsTotalsAtTheSelectedStartPeriod()
    {
        var selectedPeriods = new[]
        {
            Period(2, 2024, 10, 2024, 2),
            Period(3, 2024, 1, 2025, 3),
        };
        var selectedCells = new[]
        {
            Cell(2, GraduationRank.Excellent, false, 4, cohort: "K61"),
            Cell(3, GraduationRank.Good, true, 3, cohort: "K61"),
        };

        var result = GraduationExploreCalculator.Calculate(
            GraduationExploreModes.CohortCumulative,
            "K61",
            selectedPeriods,
            selectedCells,
            EmptyFacets(),
            "graduated",
            "period",
            null);

        result.Scope.StartPeriodId.Should().Be(2);
        result.Scope.CutoffPeriodId.Should().Be(3);
        result.Scope.IncludedPeriodCount.Should().Be(2);
        result.Kpis.Single(x => x.Id == "graduated").Count.Should().Be(7);
        result.Timeline.Select(x => x.Graduated).Should().Equal(4, 3);
        result.Timeline.Select(x => x.CumulativeGraduated).Should().Equal(4, 7);
        result.ChartPoints.Select(x => x.Value).Should().Equal(4, 7);
    }

    private static GraduationExplorePeriod Period(
        long id,
        int academicYearStart,
        int reviewMonth,
        int reviewYear,
        int round) => new(id, academicYearStart, round, reviewMonth, reviewYear);

    private static GraduationExploreCell Cell(
        long periodId,
        GraduationRank rank,
        bool workStudy,
        int count,
        string facultyName = "Khoa CNTT",
        string facultyKey = "KHOA CNTT",
        string cohort = "K62") => new(
            periodId,
            facultyName,
            facultyKey,
            "Kỹ thuật phần mềm",
            "KY THUAT PHAN MEM",
            cohort,
            rank,
            workStudy,
            count);

    private static GraduationExploreFacetsV3Dto EmptyFacets() => new([], [], []);
}
