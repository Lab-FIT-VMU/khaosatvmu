using System.Text.Json;
using Application.CourseGrades;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.CourseGrades;

/// <summary>Xếp lượt tính lại cho worker; dùng chung cho nạp điểm, gỡ kỳ và sửa ngưỡng.</summary>
internal static class GradeAnalysisRunQueue
{
    /// <summary>
    /// Xếp một lượt tính trên mọi kỳ đang có điểm, theo thứ tự thời gian, kèm bản chụp ngưỡng.
    /// Lượt đang chờ trước đó (chưa chạy) bị thay bằng lượt này vì đều tính lại toàn bộ.
    /// </summary>
    public static async Task<GradeAnalysisRun> QueueAsync(
        AppDbContext db, string trigger, Guid actorId, DateTime now, CancellationToken cancellationToken)
    {
        await db.GradeAnalysisRuns
            .Where(x => x.Status == GradeAnalysisRunStatus.Queued)
            .ExecuteDeleteAsync(cancellationToken);

        var semesters = await (
            from revision in db.GradeImportRevisions.AsNoTracking()
            join semester in db.Semesters.AsNoTracking() on revision.SemesterId equals semester.SemesterId
            join year in db.AcademicYears.AsNoTracking() on semester.AcademicYearId equals year.AcademicYearId
            where revision.IsActive
            select new { semester.SemesterId, semester.SemesterName, year.StartDate })
            .ToListAsync(cancellationToken);

        var thresholds = await db.GradeAnalysisThresholds.AsNoTracking().ToListAsync(cancellationToken);
        var snapshot = thresholds.ToDictionary(
            x => x.ThresholdCode,
            x => x.ValueType switch
            {
                GradeAnalysisThresholdValueTypes.Boolean => (object?)x.BooleanValue,
                GradeAnalysisThresholdValueTypes.TextList => x.TextListValue,
                GradeAnalysisThresholdValueTypes.Integer => (object?)(x.NumericValue is { } n ? (long)n : null),
                _ => x.NumericValue,
            });

        var run = new GradeAnalysisRun
        {
            Status = GradeAnalysisRunStatus.Queued,
            Trigger = trigger,
            SemesterIds = semesters
                .OrderBy(x => x.StartDate)
                .ThenBy(x => SemesterOrdering.PositionInYear(x.SemesterName))
                .Select(x => x.SemesterId)
                .ToList(),
            ThresholdVersion = thresholds.Count == 0 ? 0 : thresholds.Max(x => x.Version),
            ThresholdSnapshotJson = JsonSerializer.Serialize(snapshot),
            RequestedByUserId = actorId == Guid.Empty ? null : actorId,
            RequestedAtUtc = now,
        };
        db.GradeAnalysisRuns.Add(run);
        await db.SaveChangesAsync(cancellationToken);
        return run;
    }
}
