using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Application;
using Application.GraduationAnalytics;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.GraduationAnalytics;

public sealed class EfGraduationAnalyticsV3Service(
    AppDbContext db,
    ICurrentUserAccessor currentUser) : IGraduationAnalyticsV3Service
{
    public async Task<IReadOnlyList<GraduationPeriodV3Dto>> GetPeriodsAsync(
        int? academicYearStart,
        CancellationToken cancellationToken)
    {
        var query = db.GraduationPeriods.AsNoTracking();
        if (academicYearStart.HasValue)
        {
            query = query.Where(x => x.AcademicYearStart == academicYearStart.Value);
        }

        var rows = await (
            from period in query
            join revision in db.GraduationImportRevisions.AsNoTracking()
                on period.ActiveRevisionId equals revision.RevisionId
            orderby period.AcademicYearStart descending, period.RoundNumber
            select new { Period = period, Revision = revision })
            .ToListAsync(cancellationToken);
        return rows.Select(x => ToPeriodDto(x.Period, x.Revision)).ToList();
    }

    public async Task<GraduationImportCommitResultDto> ImportAsync(
        ImportGraduationRevisionCommand command,
        CancellationToken cancellationToken)
    {
        ValidateMetadata(command);
        ValidateParsedImport(command.ParsedImport);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var period = await db.GraduationPeriods
            .SingleOrDefaultAsync(
                x => x.AcademicYearStart == command.AcademicYearStart &&
                     x.RoundNumber == command.RoundNumber,
                cancellationToken);

        GraduationImportRevision? activeRevision = null;
        var aggregateHash = ComputeAggregateHash(command);
        if (period is not null && period.ActiveRevisionId.HasValue)
        {
            activeRevision = await db.GraduationImportRevisions
                .SingleAsync(x => x.RevisionId == period.ActiveRevisionId.Value, cancellationToken);
            if (command.ExpectedActiveRevisionId != activeRevision.RevisionId)
            {
                throw new GraduationAnalyticsException(
                    GraduationAnalyticsV3ErrorCodes.ConcurrentReplace,
                    "Dữ liệu đợt đã được người khác cập nhật. Hãy tải lại preview trước khi import lại.");
            }
            if (activeRevision.AggregateHash == aggregateHash)
            {
                await transaction.RollbackAsync(cancellationToken);
                return new GraduationImportCommitResultDto(
                    ToPeriodDto(period, activeRevision),
                    ToRevisionDto(activeRevision),
                    true);
            }
            if (string.IsNullOrWhiteSpace(command.ReplaceReason))
            {
                throw new GraduationAnalyticsException(
                    GraduationAnalyticsV3ErrorCodes.ReplaceReasonRequired,
                    "Phải nhập lý do khi import lại một đợt đã có dữ liệu.");
            }
        }
        else if (command.ExpectedActiveRevisionId.HasValue)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsV3ErrorCodes.ConcurrentReplace,
                "Đợt chưa tồn tại hoặc đã thay đổi. Hãy tải lại trước khi import.");
        }

        var duplicateFile = await db.GraduationImportRevisions
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.FileHash == command.ParsedImport.FileHash &&
                     (period == null || x.PeriodId != period.PeriodId),
                cancellationToken);
        if (duplicateFile is not null)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsV3ErrorCodes.DuplicateSourceFile,
                "File này đã được dùng cho một đợt khác.");
        }

        var orderValue = command.ReviewYear * 12 + command.ReviewMonth;
        var violatesRoundOrder = await db.GraduationPeriods.AsNoTracking().AnyAsync(
            x => x.AcademicYearStart == command.AcademicYearStart &&
                 (period == null || x.PeriodId != period.PeriodId) &&
                 ((x.RoundNumber < command.RoundNumber && x.ReviewYear * 12 + x.ReviewMonth > orderValue) ||
                  (x.RoundNumber > command.RoundNumber && x.ReviewYear * 12 + x.ReviewMonth < orderValue)),
            cancellationToken);
        if (violatesRoundOrder)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Tháng/năm xét không đúng thứ tự các đợt trong cùng năm học.");
        }

        var now = DateTime.UtcNow;
        var actorId = currentUser.UserId ?? Guid.Empty;
        var actor = currentUser.UserId is null
            ? null
            : await db.Users.AsNoTracking()
                .Where(x => x.Id == currentUser.UserId.Value)
                .Select(x => new { x.DisplayName, x.Email })
                .FirstOrDefaultAsync(cancellationToken);
        var actorName = !string.IsNullOrWhiteSpace(actor?.Email)
            ? actor!.Email
            : !string.IsNullOrWhiteSpace(currentUser.UserEmail)
                ? currentUser.UserEmail.Trim()
                : actor?.DisplayName ?? "Không xác định";
        if (period is null)
        {
            period = new GraduationPeriod
            {
                AcademicYearStart = command.AcademicYearStart,
                RoundNumber = command.RoundNumber,
                ReviewMonth = command.ReviewMonth,
                ReviewYear = command.ReviewYear,
                CreatedAtUtc = now,
                CreatedByUserId = actorId,
            };
            db.GraduationPeriods.Add(period);
            await db.SaveChangesAsync(cancellationToken);
        }

        var revisionNumber = activeRevision is null ? 1 : activeRevision.RevisionNumber + 1;
        var revision = new GraduationImportRevision
        {
            PeriodId = period.PeriodId,
            RevisionNumber = revisionNumber,
            ReviewMonth = command.ReviewMonth,
            ReviewYear = command.ReviewYear,
            OriginalFileName = command.ParsedImport.OriginalFileName,
            SourceSheetName = command.ParsedImport.SourceSheetName,
            FileHash = command.ParsedImport.FileHash,
            AggregateHash = aggregateHash,
            SourceRowCount = command.ParsedImport.SourceRowCount,
            ImportedRowCount = command.ParsedImport.ImportedRowCount,
            SkippedRowCount = command.ParsedImport.SkippedRowCount,
            SkippedSummaryJson = JsonSerializer.Serialize(command.ParsedImport.Warnings),
            ImportedAtUtc = now,
            ImportedByUserId = actorId,
            ImportedByName = actorName,
            ReplaceReason = NormalizeOptional(command.ReplaceReason),
            ReplacedRevisionId = activeRevision?.RevisionId,
        };
        db.GraduationImportRevisions.Add(revision);
        await db.SaveChangesAsync(cancellationToken);

        db.GraduationAggregateRows.AddRange(command.ParsedImport.Aggregates.Select(x =>
            new GraduationAggregateRow
            {
                RevisionId = revision.RevisionId,
                FacultyNameRaw = x.FacultyNameRaw,
                FacultyKey = x.FacultyKey,
                ProgramNameRaw = x.ProgramNameRaw,
                ProgramKey = x.ProgramKey,
                DerivedProgramCode = x.DerivedProgramCode,
                CohortCode = x.CohortCode,
                GraduationRank = x.GraduationRank,
                IsWorkStudy = x.IsWorkStudy,
                StudentCount = x.StudentCount,
            }));
        period.ReviewMonth = command.ReviewMonth;
        period.ReviewYear = command.ReviewYear;
        period.ActiveRevisionId = revision.RevisionId;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new GraduationImportCommitResultDto(
            ToPeriodDto(period, revision),
            ToRevisionDto(revision),
            false);
    }

    public async Task<IReadOnlyList<GraduationRevisionDto>> GetRevisionsAsync(
        long periodId,
        CancellationToken cancellationToken)
    {
        var exists = await db.GraduationPeriods.AsNoTracking()
            .AnyAsync(x => x.PeriodId == periodId, cancellationToken);
        if (!exists)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsV3ErrorCodes.PeriodNotFound,
                "Không tìm thấy đợt tốt nghiệp.");
        }

        var revisions = await db.GraduationImportRevisions.AsNoTracking()
            .Where(x => x.PeriodId == periodId)
            .OrderByDescending(x => x.RevisionNumber)
            .ToListAsync(cancellationToken);
        return revisions.Select(ToRevisionDto).ToList();
    }

    public async Task<ParsedGraduationImport> GetActivePreviewAsync(
        long periodId,
        CancellationToken cancellationToken)
    {
        var revision = await (
            from period in db.GraduationPeriods.AsNoTracking()
            join activeRevision in db.GraduationImportRevisions.AsNoTracking()
                on period.ActiveRevisionId equals activeRevision.RevisionId
            where period.PeriodId == periodId
            select activeRevision)
            .SingleOrDefaultAsync(cancellationToken);
        if (revision is null)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsV3ErrorCodes.PeriodNotFound,
                "Không tìm thấy dữ liệu của đợt tốt nghiệp.");
        }

        var aggregates = await db.GraduationAggregateRows.AsNoTracking()
            .Where(x => x.RevisionId == revision.RevisionId)
            .OrderBy(x => x.FacultyNameRaw)
            .ThenBy(x => x.ProgramNameRaw)
            .ThenBy(x => x.CohortCode)
            .ThenBy(x => x.GraduationRank)
            .ThenBy(x => x.IsWorkStudy)
            .Select(x => new GraduationImportAggregate(
                x.FacultyNameRaw,
                x.FacultyKey,
                x.ProgramNameRaw,
                x.ProgramKey,
                x.DerivedProgramCode,
                x.CohortCode,
                x.GraduationRank,
                x.IsWorkStudy,
                x.StudentCount))
            .ToListAsync(cancellationToken);

        return new ParsedGraduationImport(
            revision.OriginalFileName,
            revision.SourceSheetName,
            revision.FileHash,
            revision.SourceRowCount,
            revision.ImportedRowCount,
            revision.SkippedRowCount,
            aggregates,
            DeserializeWarnings(revision.SkippedSummaryJson));
    }

    public async Task<GraduationExploreResultV3Dto> ExploreAsync(
        GraduationExploreQuery query,
        CancellationToken cancellationToken)
    {
        var mode = query.Mode?.Trim() ?? string.Empty;
        if (mode != GraduationExploreModes.Period && mode != GraduationExploreModes.CohortCumulative)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidQuery,
                "Chế độ phân tích phải là period hoặc cohortCumulative.");
        }

        var cohort = NormalizeFilter(query.Cohort);

        var cutoff = await db.GraduationPeriods.AsNoTracking()
            .SingleOrDefaultAsync(
                x => x.PeriodId == query.CutoffPeriodId && x.ActiveRevisionId.HasValue,
                cancellationToken);
        if (cutoff is null)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsV3ErrorCodes.PeriodNotFound,
                "Không tìm thấy đợt kết thúc hoặc đợt chưa có dữ liệu.");
        }

        GraduationPeriod? start = null;
        if (mode == GraduationExploreModes.CohortCumulative && query.StartPeriodId.HasValue)
        {
            start = await db.GraduationPeriods.AsNoTracking()
                .SingleOrDefaultAsync(
                    x => x.PeriodId == query.StartPeriodId.Value && x.ActiveRevisionId.HasValue,
                    cancellationToken);
            if (start is null)
            {
                throw new GraduationAnalyticsException(
                    GraduationAnalyticsV3ErrorCodes.PeriodNotFound,
                    "Không tìm thấy đợt bắt đầu hoặc đợt chưa có dữ liệu.");
            }
            if (start.AcademicYearStart > cutoff.AcademicYearStart
                || (start.AcademicYearStart == cutoff.AcademicYearStart
                    && start.RoundNumber > cutoff.RoundNumber))
            {
                throw new GraduationAnalyticsException(
                    GraduationAnalyticsErrorCodes.InvalidQuery,
                    "Đợt bắt đầu không được nằm sau đợt kết thúc.");
            }
        }

        var periodQuery = db.GraduationPeriods.AsNoTracking()
            .Where(x => x.ActiveRevisionId.HasValue);
        if (mode == GraduationExploreModes.Period)
        {
            periodQuery = periodQuery.Where(x => x.PeriodId == cutoff.PeriodId);
        }
        else
        {
            periodQuery = periodQuery.Where(x =>
                x.AcademicYearStart < cutoff.AcademicYearStart ||
                (x.AcademicYearStart == cutoff.AcademicYearStart && x.RoundNumber <= cutoff.RoundNumber));
            if (start is not null)
            {
                periodQuery = periodQuery.Where(x =>
                    x.AcademicYearStart > start.AcademicYearStart ||
                    (x.AcademicYearStart == start.AcademicYearStart && x.RoundNumber >= start.RoundNumber));
            }
        }
        var periodRows = await periodQuery
            .OrderBy(x => x.AcademicYearStart)
            .ThenBy(x => x.RoundNumber)
            .Select(x => new
            {
                x.PeriodId,
                x.AcademicYearStart,
                x.RoundNumber,
                x.ReviewMonth,
                x.ReviewYear,
                RevisionId = x.ActiveRevisionId!.Value,
            })
            .ToListAsync(cancellationToken);
        var revisionIds = periodRows.Select(x => x.RevisionId).ToList();

        var aggregateQuery = db.GraduationAggregateRows.AsNoTracking()
            .Where(x => revisionIds.Contains(x.RevisionId));
        var facultyRows = await aggregateQuery
            .Select(x => new { x.FacultyKey, x.FacultyNameRaw })
            .Distinct()
            .ToListAsync(cancellationToken);
        var programRows = await aggregateQuery
            .Select(x => new { x.ProgramKey, x.ProgramNameRaw, x.FacultyKey })
            .Distinct()
            .ToListAsync(cancellationToken);
        var cohorts = await aggregateQuery
            .Select(x => x.CohortCode)
            .Distinct()
            .OrderBy(x => x)
            .ToListAsync(cancellationToken);
        var facets = new GraduationExploreFacetsV3Dto(
            facultyRows
                .GroupBy(x => x.FacultyKey)
                .Select(x => new GraduationFacetOptionDto(x.Key, FirstLabel(x.Select(y => y.FacultyNameRaw))))
                .OrderBy(x => x.Label, StringComparer.CurrentCulture)
                .ToList(),
            programRows
                .GroupBy(x => new { x.ProgramKey, x.FacultyKey })
                .Select(x => new GraduationFacetOptionDto(
                    x.Key.ProgramKey,
                    FirstLabel(x.Select(y => y.ProgramNameRaw)),
                    x.Key.FacultyKey))
                .OrderBy(x => x.Label, StringComparer.CurrentCulture)
                .ToList(),
            cohorts);

        var facultyKey = NormalizeFilter(query.FacultyKey);
        var programKey = NormalizeFilter(query.ProgramKey);
        if (cohort is not null)
        {
            aggregateQuery = aggregateQuery.Where(x => x.CohortCode == cohort);
        }
        if (facultyKey is not null)
        {
            aggregateQuery = aggregateQuery.Where(x => x.FacultyKey == facultyKey);
        }
        if (programKey is not null)
        {
            aggregateQuery = aggregateQuery.Where(x => x.ProgramKey == programKey);
        }
        var filtered = await aggregateQuery
            .Select(x => new
            {
                x.RevisionId,
                x.FacultyNameRaw,
                x.FacultyKey,
                x.ProgramNameRaw,
                x.ProgramKey,
                x.CohortCode,
                x.GraduationRank,
                x.IsWorkStudy,
                x.StudentCount,
            })
            .ToListAsync(cancellationToken);
        var periodByRevision = periodRows.ToDictionary(x => x.RevisionId, x => x.PeriodId);
        var cells = filtered.Select(x => new GraduationExploreCell(
            periodByRevision[x.RevisionId],
            x.FacultyNameRaw,
            x.FacultyKey,
            x.ProgramNameRaw,
            x.ProgramKey,
            x.CohortCode,
            x.GraduationRank,
            x.IsWorkStudy,
            x.StudentCount)).ToList();
        var periods = periodRows.Select(x => new GraduationExplorePeriod(
            x.PeriodId,
            x.AcademicYearStart,
            x.RoundNumber,
            x.ReviewMonth,
            x.ReviewYear)).ToList();

        return GraduationExploreCalculator.Calculate(
            mode,
            cohort,
            periods,
            cells,
            facets,
            query.MetricId,
            query.GroupBy,
            query.SeriesBy);
    }

    private static void ValidateMetadata(ImportGraduationRevisionCommand command)
    {
        if (command.AcademicYearStart is < 1900 or > 2200 || command.RoundNumber <= 0)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Năm học hoặc số đợt không hợp lệ.");
        }
        if (command.ReviewMonth is < 1 or > 12 || command.ReviewYear is < 1900 or > 2200)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Tháng/năm xét tốt nghiệp không hợp lệ.");
        }
        var expectedAcademicYearStart = command.ReviewMonth >= 8
            ? command.ReviewYear
            : command.ReviewYear - 1;
        if (expectedAcademicYearStart != command.AcademicYearStart)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                $"Tháng {command.ReviewMonth}/{command.ReviewYear} không thuộc năm học " +
                $"{command.AcademicYearStart}–{command.AcademicYearStart + 1}.");
        }
    }

    private static void ValidateParsedImport(ParsedGraduationImport parsed)
    {
        if (parsed.SourceRowCount != parsed.ImportedRowCount + parsed.SkippedRowCount ||
            parsed.ImportedRowCount <= 0 ||
            parsed.Aggregates.Sum(x => x.StudentCount) != parsed.ImportedRowCount)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Kết quả parser không thỏa các tổng kiểm soát import.");
        }
    }

    private static string ComputeAggregateHash(ImportGraduationRevisionCommand command)
    {
        var builder = new StringBuilder()
            .Append(command.AcademicYearStart).Append('|')
            .Append(command.RoundNumber).Append('|')
            .Append(command.ReviewYear).Append('|')
            .Append(command.ReviewMonth).Append('|')
            .Append(command.ParsedImport.SourceRowCount).Append('|')
            .Append(command.ParsedImport.ImportedRowCount).Append('|')
            .Append(command.ParsedImport.SkippedRowCount).AppendLine();
        foreach (var row in command.ParsedImport.Aggregates)
        {
            builder.Append(row.FacultyKey).Append('|')
                .Append(row.ProgramKey).Append('|')
                .Append(row.DerivedProgramCode).Append('|')
                .Append(row.CohortCode).Append('|')
                .Append((int)row.GraduationRank).Append('|')
                .Append(row.IsWorkStudy ? '1' : '0').Append('|')
                .Append(row.StudentCount).AppendLine();
        }
        foreach (var warning in command.ParsedImport.Warnings
                     .OrderBy(x => x.Code, StringComparer.Ordinal)
                     .ThenBy(x => x.ClassCode, StringComparer.Ordinal))
        {
            builder.Append(warning.Code).Append('|')
                .Append(warning.SourceSheetName).Append('|')
                .Append(warning.ClassCode).Append('|')
                .AppendJoin(',', warning.SourceRowNumbers).AppendLine();
        }
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString())));
    }

    private static GraduationPeriodV3Dto ToPeriodDto(
        GraduationPeriod period,
        GraduationImportRevision revision) => new(
            period.PeriodId,
            period.AcademicYearStart,
            $"{period.AcademicYearStart}–{period.AcademicYearStart + 1}",
            period.RoundNumber,
            period.ReviewMonth,
            period.ReviewYear,
            revision.RevisionId,
            revision.RevisionNumber,
            revision.OriginalFileName,
            revision.ImportedRowCount,
            revision.SkippedRowCount,
            revision.ImportedAtUtc,
            revision.ImportedByName);

    private static GraduationRevisionDto ToRevisionDto(GraduationImportRevision revision) => new(
        revision.RevisionId,
        revision.RevisionNumber,
        revision.OriginalFileName,
        revision.SourceSheetName,
        revision.FileHash,
        revision.SourceRowCount,
        revision.ImportedRowCount,
        revision.SkippedRowCount,
        DeserializeWarnings(revision.SkippedSummaryJson),
        revision.ImportedAtUtc,
        revision.ImportedByName,
        revision.ReplaceReason,
        revision.ReplacedRevisionId);

    private static IReadOnlyList<GraduationImportWarning> DeserializeWarnings(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<GraduationImportWarning>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? NormalizeFilter(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToUpperInvariant();

    private static string FirstLabel(IEnumerable<string> values) =>
        values.OrderBy(x => x, StringComparer.Ordinal).First();
}
