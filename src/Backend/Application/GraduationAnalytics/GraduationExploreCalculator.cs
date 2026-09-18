using Domain;

namespace Application.GraduationAnalytics;

public static class GraduationExploreCalculator
{
    public static GraduationExploreResultV3Dto Calculate(
        string mode,
        string? cohort,
        IReadOnlyList<GraduationExplorePeriod> periods,
        IReadOnlyList<GraduationExploreCell> cells,
        GraduationExploreFacetsV3Dto facets,
        string metricId = "graduated",
        string groupBy = "period",
        string? seriesBy = null)
    {
        if (periods.Count == 0)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsV3ErrorCodes.PeriodNotFound,
                "Không tìm thấy phạm vi đợt tốt nghiệp.");
        }

        var orderedPeriods = periods
            .OrderBy(x => x.AcademicYearStart)
            .ThenBy(x => x.RoundNumber)
            .ToList();
        var total = cells.Sum(x => x.StudentCount);
        var workStudy = cells.Where(x => x.IsWorkStudy).Sum(x => x.StudentCount);
        var onTime = total - workStudy;
        var kpis = new[]
        {
            new GraduationKpiDto("graduated", "Đã tốt nghiệp", total, Percentage(total, total)),
            new GraduationKpiDto("onTime", "Tốt nghiệp đúng hạn", onTime, Percentage(onTime, total)),
            new GraduationKpiDto("workStudy", "Hệ VLVH", workStudy, Percentage(workStudy, total)),
        };
        var ranks = Enum.GetValues<GraduationRank>()
            .Select(rank =>
            {
                var count = cells.Where(x => x.GraduationRank == rank).Sum(x => x.StudentCount);
                return new GraduationRankSummaryV3Dto(rank, RankLabel(rank), count, Percentage(count, total));
            })
            .ToList();

        var cumulativeTotal = 0;
        var cumulativeOnTime = 0;
        var cumulativeWorkStudy = 0;
        var cumulativeExcellent = 0;
        var cumulativeVeryGood = 0;
        var cumulativeGood = 0;
        var cumulativeAverage = 0;
        var timeline = orderedPeriods.Select(period =>
        {
            var periodCells = cells.Where(x => x.PeriodId == period.PeriodId).ToList();
            var periodTotal = periodCells.Sum(x => x.StudentCount);
            var periodWorkStudy = periodCells.Where(x => x.IsWorkStudy).Sum(x => x.StudentCount);
            var periodOnTime = periodTotal - periodWorkStudy;
            var periodExcellent = RankCount(periodCells, GraduationRank.Excellent);
            var periodVeryGood = RankCount(periodCells, GraduationRank.VeryGood);
            var periodGood = RankCount(periodCells, GraduationRank.Good);
            var periodAverage = RankCount(periodCells, GraduationRank.Average);
            cumulativeTotal += periodTotal;
            cumulativeOnTime += periodOnTime;
            cumulativeWorkStudy += periodWorkStudy;
            cumulativeExcellent += periodExcellent;
            cumulativeVeryGood += periodVeryGood;
            cumulativeGood += periodGood;
            cumulativeAverage += periodAverage;
            return new GraduationTimelinePointV3Dto(
                period.PeriodId,
                PeriodLabel(period),
                periodTotal,
                periodOnTime,
                periodWorkStudy,
                periodExcellent,
                periodVeryGood,
                periodGood,
                periodAverage,
                cumulativeTotal,
                cumulativeOnTime,
                cumulativeWorkStudy,
                cumulativeExcellent,
                cumulativeVeryGood,
                cumulativeGood,
                cumulativeAverage);
        }).ToList();

        var breakdown = cells
            .GroupBy(x => new
            {
                x.FacultyKey,
                x.ProgramKey,
                x.CohortCode,
            })
            .Select(group =>
            {
                var graduated = group.Sum(x => x.StudentCount);
                var vlvh = group.Where(x => x.IsWorkStudy).Sum(x => x.StudentCount);
                return new GraduationBreakdownV3Dto(
                    FirstLabel(group.Select(x => x.FacultyName)),
                    group.Key.FacultyKey,
                    FirstLabel(group.Select(x => x.ProgramName)),
                    group.Key.ProgramKey,
                    group.Key.CohortCode,
                    graduated,
                    graduated - vlvh,
                    vlvh,
                    RankCount(group, GraduationRank.Excellent),
                    RankCount(group, GraduationRank.VeryGood),
                    RankCount(group, GraduationRank.Good),
                    RankCount(group, GraduationRank.Average));
            })
            .OrderBy(x => x.FacultyName, StringComparer.CurrentCulture)
            .ThenBy(x => x.ProgramName, StringComparer.CurrentCulture)
            .ThenBy(x => x.CohortCode, StringComparer.Ordinal)
            .ToList();
        var chartPoints = BuildChartPoints(
            cells,
            orderedPeriods,
            mode,
            metricId,
            groupBy,
            string.IsNullOrWhiteSpace(seriesBy) ? null : seriesBy);

        var first = orderedPeriods[0];
        var last = orderedPeriods[^1];
        return new GraduationExploreResultV3Dto(
            new GraduationExploreScopeDto(
                mode,
                cohort,
                first.PeriodId,
                PeriodLabel(first),
                last.PeriodId,
                PeriodLabel(last),
                orderedPeriods.Count),
            kpis,
            ranks,
            timeline,
            breakdown,
            chartPoints,
            facets);
    }

    private static IReadOnlyList<GraduationChartPointV3Dto> BuildChartPoints(
        IReadOnlyList<GraduationExploreCell> cells,
        IReadOnlyList<GraduationExplorePeriod> periods,
        string mode,
        string metricId,
        string groupBy,
        string? seriesBy)
    {
        var validDimensions = new[] { "period", "faculty", "program", "cohort" };
        if (!validDimensions.Contains(groupBy, StringComparer.Ordinal) ||
            seriesBy is not null && (!validDimensions.Contains(seriesBy, StringComparer.Ordinal) || seriesBy == groupBy))
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidQuery,
                "Chiều so sánh hoặc phân chuỗi không hợp lệ.");
        }
        var validMetrics = new[] { "graduated", "onTime", "workStudy", "excellent", "veryGood", "good", "average" };
        if (!validMetrics.Contains(metricId, StringComparer.Ordinal))
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidQuery,
                "Tiêu chí biểu đồ không hợp lệ.");
        }

        var periodById = periods.ToDictionary(x => x.PeriodId);
        var points = cells
            .Select(cell => new
            {
                Group = DimensionValue(cell, groupBy, periodById),
                Series = seriesBy is null ? null : DimensionValue(cell, seriesBy, periodById),
                Value = MetricValue(cell, metricId),
            })
            .GroupBy(x => new
            {
                GroupKey = x.Group.Key,
                GroupLabel = x.Group.Label,
                SeriesKey = x.Series?.Key,
                SeriesLabel = x.Series?.Label,
            })
            .Select(group => new GraduationChartPointV3Dto(
                group.Key.GroupKey,
                group.Key.GroupLabel,
                group.Key.SeriesKey,
                group.Key.SeriesLabel,
                group.Sum(x => x.Value)))
            .OrderBy(x => x.GroupLabel, StringComparer.CurrentCulture)
            .ThenBy(x => x.SeriesLabel, StringComparer.CurrentCulture)
            .ToList();
        if (groupBy != "period")
        {
            return points;
        }

        var series = seriesBy is null
            ? new DimensionItem?[] { null }
            : cells
                .Select(cell => DimensionValue(cell, seriesBy, periodById))
                .DistinctBy(x => x.Key)
                .OrderBy(x => x.Label, StringComparer.CurrentCulture)
                .Cast<DimensionItem?>()
                .ToArray();
        var pointByPeriodAndSeries = points.ToDictionary(
            x => (x.GroupKey, x.SeriesKey ?? string.Empty),
            x => x.Value);
        var runningBySeries = new Dictionary<string, int>(StringComparer.Ordinal);
        var completed = new List<GraduationChartPointV3Dto>();
        foreach (var period in periods)
        {
            var periodKey = period.PeriodId.ToString(System.Globalization.CultureInfo.InvariantCulture);
            foreach (var seriesItem in series)
            {
                var seriesKey = seriesItem?.Key ?? string.Empty;
                var value = pointByPeriodAndSeries.GetValueOrDefault((periodKey, seriesKey));
                if (mode == GraduationExploreModes.CohortCumulative)
                {
                    value += runningBySeries.GetValueOrDefault(seriesKey);
                    runningBySeries[seriesKey] = value;
                }
                completed.Add(new GraduationChartPointV3Dto(
                    periodKey,
                    PeriodLabel(period),
                    seriesItem?.Key,
                    seriesItem?.Label,
                    value));
            }
        }
        return completed;
    }

    private static DimensionItem DimensionValue(
        GraduationExploreCell cell,
        string dimension,
        IReadOnlyDictionary<long, GraduationExplorePeriod> periodById) => dimension switch
    {
        "period" => new(
            cell.PeriodId.ToString(System.Globalization.CultureInfo.InvariantCulture),
            PeriodLabel(periodById[cell.PeriodId])),
        "faculty" => new(cell.FacultyKey, cell.FacultyName),
        "program" => new($"{cell.FacultyKey}|{cell.ProgramKey}", cell.ProgramName),
        "cohort" => new(cell.CohortCode, cell.CohortCode),
        _ => throw new InvalidOperationException($"Unsupported graduation dimension '{dimension}'."),
    };

    private static int MetricValue(GraduationExploreCell cell, string metricId) => metricId switch
    {
        "graduated" => cell.StudentCount,
        "onTime" => cell.IsWorkStudy ? 0 : cell.StudentCount,
        "workStudy" => cell.IsWorkStudy ? cell.StudentCount : 0,
        "excellent" => cell.GraduationRank == GraduationRank.Excellent ? cell.StudentCount : 0,
        "veryGood" => cell.GraduationRank == GraduationRank.VeryGood ? cell.StudentCount : 0,
        "good" => cell.GraduationRank == GraduationRank.Good ? cell.StudentCount : 0,
        "average" => cell.GraduationRank == GraduationRank.Average ? cell.StudentCount : 0,
        _ => 0,
    };

    private static int RankCount(IEnumerable<GraduationExploreCell> cells, GraduationRank rank) =>
        cells.Where(x => x.GraduationRank == rank).Sum(x => x.StudentCount);

    private static decimal Percentage(int count, int total) =>
        total == 0 ? 0 : Math.Round(count * 100m / total, 2, MidpointRounding.AwayFromZero);

    private static string PeriodLabel(GraduationExplorePeriod period) =>
        $"{period.ReviewMonth:00}/{period.ReviewYear}";

    private static string RankLabel(GraduationRank rank) => rank switch
    {
        GraduationRank.Excellent => "Xuất sắc",
        GraduationRank.VeryGood => "Giỏi",
        GraduationRank.Good => "Khá",
        GraduationRank.Average => "Trung bình",
        _ => rank.ToString(),
    };

    private static string FirstLabel(IEnumerable<string> values) =>
        values.OrderBy(x => x, StringComparer.Ordinal).First();

    private sealed record DimensionItem(string Key, string Label);
}
