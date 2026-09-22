using Domain;

namespace Application.GraduationAnalytics2;

public static class GraduationExploreCalculator
{
    /// <summary>Năm học 2018-2019 ứng với khóa 59, mỗi năm sau tăng một khóa.</summary>
    private const int BaseAcademicYearStart = 2018;
    private const int BaseCohortNumber = 59;
    private const int StandardProgramYears = 4;

    /// <summary>
    /// Đúng hạn là tốt nghiệp trong năm học thứ tư kể từ khi nhập học. VLVH là
    /// một chiều cắt ngang độc lập và không quyết định sinh viên có đúng hạn hay không.
    /// </summary>
    private static bool IsOnTime(
        GraduationExploreCell cell,
        IReadOnlyDictionary<long, GraduationExplorePeriod> periodById)
    {
        if (!periodById.TryGetValue(cell.PeriodId, out var period)) return false;
        var digits = new string((cell.CohortCode ?? string.Empty).Where(char.IsDigit).ToArray());
        if (!int.TryParse(digits, System.Globalization.NumberStyles.Integer,
                System.Globalization.CultureInfo.InvariantCulture, out var cohortNumber))
        {
            return false;
        }
        var cohortAcademicYearStart = BaseAcademicYearStart + (cohortNumber - BaseCohortNumber);
        return period.AcademicYearStart - cohortAcademicYearStart == StandardProgramYears - 1;
    }

    public static GraduationExploreResultV3Dto Calculate(
        string mode,
        string? cohort,
        IReadOnlyList<GraduationExplorePeriod> periods,
        IReadOnlyList<GraduationExploreCell> cells,
        IReadOnlyList<GraduationPopulationCell> population,
        GraduationExploreFacetsV3Dto facets,
        string metricId = "graduated",
        string groupBy = "period",
        string? seriesBy = null,
        IReadOnlyList<string>? selectedCohorts = null)
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
        var periodByIdForOnTime = orderedPeriods.ToDictionary(x => x.PeriodId);
        var total = cells.Sum(x => x.StudentCount);
        var studentTotal = population.Sum(x => x.StudentCount);
        var notGraduated = Math.Max(0, studentTotal - total);
        var workStudy = cells.Where(x => x.IsWorkStudy).Sum(x => x.StudentCount);
        var onTime = cells.Where(x => IsOnTime(x, periodByIdForOnTime)).Sum(x => x.StudentCount);
        var kpis = new[]
        {
            new GraduationKpiDto("studentTotal", "Số sinh viên nhập học", studentTotal, Percentage(studentTotal, studentTotal)),
            new GraduationKpiDto("graduated", "Đã tốt nghiệp", total, Percentage(total, studentTotal)),
            new GraduationKpiDto("notGraduated", "Chưa tốt nghiệp", notGraduated, Percentage(notGraduated, studentTotal)),
            new GraduationKpiDto("onTime", "Tốt nghiệp đúng hạn", onTime, Percentage(onTime, total)),
            new GraduationKpiDto("workStudy", "Hệ VLVH", workStudy, Percentage(workStudy, total)),
        };
        var ranks = Enum.GetValues<GraduationRank>()
            .Select(rank =>
            {
                var count = cells.Where(x => x.GraduationRank == rank).Sum(x => x.StudentCount);
                var rankWorkStudy = cells
                    .Where(x => x.GraduationRank == rank && x.IsWorkStudy)
                    .Sum(x => x.StudentCount);
                return new GraduationRankSummaryV3Dto(
                    rank,
                    RankLabel(rank),
                    count,
                    Percentage(count, total),
                    rankWorkStudy,
                    Percentage(rankWorkStudy, total));
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
            var periodOnTime = periodCells
                .Where(x => IsOnTime(x, periodByIdForOnTime))
                .Sum(x => x.StudentCount);
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

        var graduatedByBreakdown = cells
            .GroupBy(x => new
            {
                x.FacultyKey,
                x.ProgramKey,
                x.CohortCode,
            })
            .ToDictionary(group => (group.Key.FacultyKey, group.Key.ProgramKey, group.Key.CohortCode));
        var breakdown = population
            .GroupBy(x => new
            {
                x.FacultyKey,
                x.ProgramKey,
                x.CohortCode,
            })
            .Select(populationGroup =>
            {
                graduatedByBreakdown.TryGetValue(
                    (populationGroup.Key.FacultyKey, populationGroup.Key.ProgramKey, populationGroup.Key.CohortCode),
                    out var graduationGroup);
                var graduationRows = graduationGroup?.ToList() ?? [];
                var initial = populationGroup.Sum(x => x.StudentCount);
                var graduated = graduationRows.Sum(x => x.StudentCount);
                var vlvh = graduationRows.Where(x => x.IsWorkStudy).Sum(x => x.StudentCount);
                var groupOnTime = graduationRows
                    .Where(x => IsOnTime(x, periodByIdForOnTime))
                    .Sum(x => x.StudentCount);
                return new GraduationBreakdownV3Dto(
                    FirstLabel(populationGroup.Select(x => x.FacultyName)),
                    populationGroup.Key.FacultyKey,
                    FirstLabel(populationGroup.Select(x => x.ProgramName)),
                    populationGroup.Key.ProgramKey,
                    populationGroup.Key.CohortCode,
                    initial,
                    graduated,
                    Math.Max(0, initial - graduated),
                    groupOnTime,
                    vlvh,
                    RankCount(graduationRows, GraduationRank.Excellent),
                    RankCount(graduationRows, GraduationRank.VeryGood),
                    RankCount(graduationRows, GraduationRank.Good),
                    RankCount(graduationRows, GraduationRank.Average));
            })
            .OrderBy(x => x.FacultyName, StringComparer.CurrentCulture)
            .ThenBy(x => x.ProgramName, StringComparer.CurrentCulture)
            .ThenBy(x => x.CohortCode, StringComparer.Ordinal)
            .ToList();
        var chartPoints = BuildChartPoints(
            cells,
            population,
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
                selectedCohorts ?? (cohort is null ? [] : [cohort]),
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
        IReadOnlyList<GraduationPopulationCell> population,
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
        var validMetrics = new[] { "studentTotal", "graduated", "notGraduated", "onTime", "workStudy", "excellent", "veryGood", "good", "average" };
        if (!validMetrics.Contains(metricId, StringComparer.Ordinal))
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidQuery,
                "Tiêu chí biểu đồ không hợp lệ.");
        }

        var periodById = periods.ToDictionary(x => x.PeriodId);
        var counts = cells
            .Select(cell => new
            {
                Group = DimensionValue(cell, groupBy, periodById),
                Series = seriesBy is null ? null : DimensionValue(cell, seriesBy, periodById),
                Value = MetricValue(cell, metricId, periodById),
            })
            .GroupBy(x => new
            {
                GroupKey = x.Group.Key,
                GroupLabel = x.Group.Label,
                SeriesKey = x.Series?.Key,
                SeriesLabel = x.Series?.Label,
            })
            .ToDictionary(
                group => (group.Key.GroupKey, group.Key.SeriesKey ?? string.Empty),
                group => group.Sum(x => x.Value));
        var graduatedByGroup = cells
            .GroupBy(cell => DimensionValue(cell, groupBy, periodById).Key)
            .ToDictionary(group => group.Key, group => group.Sum(cell => cell.StudentCount));
        var populationGroups = BuildPopulationGroups(population, periods, groupBy, seriesBy);
        var points = populationGroups
            .Select(group =>
            {
                var count = metricId == "studentTotal"
                    ? group.ComponentTotal
                    : counts.GetValueOrDefault((group.GroupKey, group.SeriesKey ?? string.Empty));
                if (metricId == "notGraduated")
                {
                    var graduated = cells
                        .Where(cell => DimensionValue(cell, groupBy, periodById).Key == group.GroupKey)
                        .Where(cell => seriesBy is null
                            || DimensionValue(cell, seriesBy, periodById).Key == group.SeriesKey)
                        .Sum(cell => cell.StudentCount);
                    count = Math.Max(0, group.ComponentTotal - graduated);
                }
                var denominator = UsesGraduatedDenominator(metricId)
                    ? graduatedByGroup.GetValueOrDefault(group.GroupKey)
                    : group.Total;
                return new GraduationChartPointV3Dto(
                    group.GroupKey,
                    group.GroupLabel,
                    group.SeriesKey,
                    group.SeriesLabel,
                    Percentage(count, denominator),
                    count,
                    denominator);
            })
            .OrderBy(x => x.GroupLabel, StringComparer.CurrentCulture)
            .ThenBy(x => x.SeriesLabel, StringComparer.CurrentCulture)
            .ToList();
        if (groupBy != "period")
        {
            return points;
        }

        var series = seriesBy is null
            ? new DimensionItem?[] { null }
            : population
                .Select(cell => PopulationDimensionValue(cell, seriesBy))
                .DistinctBy(x => x.Key)
                .OrderBy(x => x.Label, StringComparer.CurrentCulture)
                .Cast<DimensionItem?>()
                .ToArray();
        var pointByPeriodAndSeries = points.ToDictionary(
            x => (x.GroupKey, x.SeriesKey ?? string.Empty),
            x => x.Count);
        var runningBySeries = new Dictionary<string, int>(StringComparer.Ordinal);
        var runningGraduatedBySeries = new Dictionary<string, int>(StringComparer.Ordinal);
        var cumulativeGraduatedDenominator = 0;
        var completed = new List<GraduationChartPointV3Dto>();
        foreach (var period in periods)
        {
            var periodKey = period.PeriodId.ToString(System.Globalization.CultureInfo.InvariantCulture);
            var periodGraduatedDenominator = graduatedByGroup.GetValueOrDefault(periodKey);
            if (mode == GraduationExploreModes.CohortCumulative)
            {
                cumulativeGraduatedDenominator += periodGraduatedDenominator;
            }
            foreach (var seriesItem in series)
            {
                var seriesKey = seriesItem?.Key ?? string.Empty;
                var value = pointByPeriodAndSeries.GetValueOrDefault((periodKey, seriesKey));
                if (mode == GraduationExploreModes.CohortCumulative)
                {
                    if (metricId == "studentTotal")
                    {
                        // Quy mô ban đầu không cộng dồn theo thời gian.
                    }
                    else if (metricId == "notGraduated")
                    {
                        var componentTotal = PopulationComponentTotal(population, seriesBy, seriesItem?.Key);
                        var graduatedThisPeriod = Math.Max(0, componentTotal - value);
                        var cumulativeGraduated = runningGraduatedBySeries.GetValueOrDefault(seriesKey) + graduatedThisPeriod;
                        runningGraduatedBySeries[seriesKey] = cumulativeGraduated;
                        value = Math.Max(0, componentTotal - cumulativeGraduated);
                    }
                    else
                    {
                        value += runningBySeries.GetValueOrDefault(seriesKey);
                        runningBySeries[seriesKey] = value;
                    }
                }
                var total = UsesGraduatedDenominator(metricId)
                    ? mode == GraduationExploreModes.CohortCumulative
                        ? cumulativeGraduatedDenominator
                        : periodGraduatedDenominator
                    : points.FirstOrDefault(x => x.GroupKey == periodKey && (x.SeriesKey ?? string.Empty) == seriesKey)?.Total
                        ?? population.Sum(x => x.StudentCount);
                completed.Add(new GraduationChartPointV3Dto(
                    periodKey,
                    PeriodLabel(period),
                    seriesItem?.Key,
                    seriesItem?.Label,
                    Percentage(value, total),
                    value,
                    total));
            }
        }
        return completed;
    }

    private static IReadOnlyList<PopulationGroup> BuildPopulationGroups(
        IReadOnlyList<GraduationPopulationCell> population,
        IReadOnlyList<GraduationExplorePeriod> periods,
        string groupBy,
        string? seriesBy)
    {
        if (groupBy == "period")
        {
            var seriesGroups = seriesBy is null
                ? new[] { new PopulationGroup(string.Empty, string.Empty, null, null, population.Sum(x => x.StudentCount), population.Sum(x => x.StudentCount)) }
                : population
                    .GroupBy(x => PopulationDimensionValue(x, seriesBy))
                    .Select(x => new PopulationGroup(string.Empty, string.Empty, x.Key.Key, x.Key.Label, x.Sum(y => y.StudentCount), population.Sum(y => y.StudentCount)))
                    .ToArray();
            return periods.SelectMany(period => seriesGroups.Select(series => series with
            {
                GroupKey = period.PeriodId.ToString(System.Globalization.CultureInfo.InvariantCulture),
                GroupLabel = PeriodLabel(period),
            })).ToList();
        }

        var groupTotals = population
            .GroupBy(cell => PopulationDimensionValue(cell, groupBy).Key)
            .ToDictionary(group => group.Key, group => group.Sum(cell => cell.StudentCount));
        return population
            .Select(cell => new
            {
                Group = PopulationDimensionValue(cell, groupBy),
                Series = seriesBy is null ? null : PopulationDimensionValue(cell, seriesBy),
                cell.StudentCount,
            })
            .GroupBy(x => new { x.Group.Key, x.Group.Label, SeriesKey = x.Series == null ? null : x.Series.Key, SeriesLabel = x.Series == null ? null : x.Series.Label })
            .Select(x => new PopulationGroup(
                x.Key.Key,
                x.Key.Label,
                x.Key.SeriesKey,
                x.Key.SeriesLabel,
                x.Sum(y => y.StudentCount),
                groupTotals.GetValueOrDefault(x.Key.Key)))
            .ToList();
    }

    private static int PopulationComponentTotal(
        IReadOnlyList<GraduationPopulationCell> population,
        string? seriesBy,
        string? seriesKey) => seriesBy is null
        ? population.Sum(x => x.StudentCount)
        : population.Where(x => PopulationDimensionValue(x, seriesBy).Key == seriesKey).Sum(x => x.StudentCount);

    private static DimensionItem PopulationDimensionValue(GraduationPopulationCell cell, string dimension) => dimension switch
    {
        "faculty" => new(cell.FacultyKey, cell.FacultyName),
        "program" => new($"{cell.FacultyKey}|{cell.ProgramKey}", cell.ProgramName),
        "cohort" => new(cell.CohortCode, cell.CohortCode),
        _ => throw new InvalidOperationException($"Unsupported graduation population dimension '{dimension}'."),
    };

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

    private static int MetricValue(
        GraduationExploreCell cell,
        string metricId,
        IReadOnlyDictionary<long, GraduationExplorePeriod> periodById) => metricId switch
    {
        "graduated" => cell.StudentCount,
        "onTime" => IsOnTime(cell, periodById) ? cell.StudentCount : 0,
        "workStudy" => cell.IsWorkStudy ? cell.StudentCount : 0,
        "excellent" => cell.GraduationRank == GraduationRank.Excellent ? cell.StudentCount : 0,
        "veryGood" => cell.GraduationRank == GraduationRank.VeryGood ? cell.StudentCount : 0,
        "good" => cell.GraduationRank == GraduationRank.Good ? cell.StudentCount : 0,
        "average" => cell.GraduationRank == GraduationRank.Average ? cell.StudentCount : 0,
        _ => 0,
    };

    private static bool UsesGraduatedDenominator(string metricId) => metricId is
        "onTime" or "workStudy" or "excellent" or "veryGood" or "good" or "average";

    private static int RankCount(IEnumerable<GraduationExploreCell> cells, GraduationRank rank) =>
        cells.Where(x => x.GraduationRank == rank).Sum(x => x.StudentCount);

    private static decimal Percentage(int count, int total) =>
        total == 0 ? 0 : Math.Round(count * 100m / total, 2, MidpointRounding.AwayFromZero);

    private static string PeriodLabel(GraduationExplorePeriod period) =>
        period.ReviewMonth is { } month && period.ReviewYear is { } year
            ? $"Đợt {period.RoundNumber} · {month:00}/{year}"
            : $"Đợt {period.RoundNumber} · Chưa có tháng/năm xét";

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
    private sealed record PopulationGroup(
        string GroupKey,
        string GroupLabel,
        string? SeriesKey,
        string? SeriesLabel,
        int ComponentTotal,
        int Total);
}
