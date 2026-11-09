using Application.CourseGrades;
using Domain;

namespace Infrastructure.CourseGrades;

internal static class GradeAnalysisRunMapping
{
    public static GradeAnalysisRunDto ToDto(GradeAnalysisRun run) => new(
        run.RunId,
        run.Status.ToString(),
        run.Trigger,
        run.SemesterIds,
        run.ThresholdVersion,
        run.RequestedAtUtc,
        run.StartedAtUtc,
        run.FinishedAtUtc,
        run.ErrorMessage,
        run.IsCurrent);
}
