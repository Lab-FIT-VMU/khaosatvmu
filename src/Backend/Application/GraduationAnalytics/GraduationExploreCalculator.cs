using Domain;

namespace Application.GraduationAnalytics;

public static class GraduationExploreCalculator
{
    public static GraduationExploreResultV3Dto Calculate(
        string mode,
        string? cohort,
        IReadOnlyList<GraduationExplorePeriod> periods,
        IReadOnlyList<GraduationExploreCell> cells,
        GraduationExploreFacetsV3Dto facets)
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
        var timeline = orderedPeriods.Select(period =>
        {
            var periodCells = cells.Where(x => x.PeriodId == period.PeriodId).ToList();
            var periodTotal = periodCells.Sum(x => x.StudentCount);
            var periodWorkStudy = periodCells.Where(x => x.IsWorkStudy).Sum(x => x.StudentCount);
            var periodOnTime = periodTotal - periodWorkStudy;
            cumulativeTotal += periodTotal;
            cumulativeOnTime += periodOnTime;
            cumulativeWorkStudy += periodWorkStudy;
            return new GraduationTimelinePointV3Dto(
                period.PeriodId,
                PeriodLabel(period),
                periodTotal,
                periodOnTime,
                periodWorkStudy,
                cumulativeTotal,
                cumulativeOnTime,
                cumulativeWorkStudy);
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
            facets);
    }

    private static int RankCount(IEnumerable<GraduationExploreCell> cells, GraduationRank rank) =>
        cells.Where(x => x.GraduationRank == rank).Sum(x => x.StudentCount);

    private static decimal Percentage(int count, int total) =>
        total == 0 ? 0 : Math.Round(count * 100m / total, 2, MidpointRounding.AwayFromZero);

    private static string PeriodLabel(GraduationExplorePeriod period) =>
        $"{period.AcademicYearStart}–{period.AcademicYearStart + 1} · Đợt {period.RoundNumber}";

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
}
