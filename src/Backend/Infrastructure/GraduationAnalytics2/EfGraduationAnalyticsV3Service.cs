using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Application;
using Application.GraduationAnalytics2;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.GraduationAnalytics2;

/// <summary>
/// Thống kê tốt nghiệp chạy trên danh mục khoá/ngành, đợt và projection hiện hành;
/// mỗi lần tải lên còn có revision cùng snapshot tổng hợp bất biến để truy vết.
/// </summary>
public sealed partial class EfGraduationAnalyticsV3Service(
    AppDbContext db,
    ICurrentUserAccessor currentUser) : IGraduationAnalyticsV3Service
{
    /// <summary>Năm học 2018-2019 ứng với khoá 59, mỗi năm sau tăng một khoá.</summary>
    private const int BaseAcademicYearStart = 2018;
    private const int BaseCohortNumber = 59;

    private sealed record RoundRow(
        long GraduationRoundId,
        int RoundNumber,
        int AcademicYearId,
        DateTime CreatedAt,
        int? ReviewMonth,
        int? ReviewYear);

    // -------------------------------------------------------- Danh sách năm học

    public async Task<IReadOnlyList<int>> GetAcademicYearStartsAsync(
        CancellationToken cancellationToken) =>
        (await LoadAcademicYearStartsAsync(cancellationToken))
            .Values
            .Distinct()
            .OrderByDescending(x => x)
            .ToList();

    // ----------------------------------------------------------- Danh sách đợt

    public async Task<IReadOnlyList<GraduationPeriodV3Dto>> GetPeriodsAsync(
        int? academicYearStart,
        CancellationToken cancellationToken)
    {
        var yearStartById = await LoadAcademicYearStartsAsync(cancellationToken);
        var rows = await (
            from round in db.GraduationRounds.AsNoTracking()
            join revision in db.GraduationRoundImportRevisions.AsNoTracking()
                on round.ActiveRevisionId equals revision.RevisionId
            select new { Round = round, Revision = revision })
            .ToListAsync(cancellationToken);

        return rows
            .Where(x => academicYearStart is not { } year
                || yearStartById.GetValueOrDefault(x.Round.AcademicYearId) == year)
            .OrderByDescending(x => yearStartById.GetValueOrDefault(x.Round.AcademicYearId))
            .ThenByDescending(x => x.Round.RoundNumber)
            .Select(x => ToPeriodDto(
                x.Round,
                x.Revision,
                yearStartById.GetValueOrDefault(x.Round.AcademicYearId)))
            .ToList();
    }

    // ------------------------------------------------------------------ Import

    public async Task<GraduationImportCommitResultDto> ImportAsync(
        ImportGraduationRevisionCommand command,
        CancellationToken cancellationToken)
    {
        ValidateMetadata(command);
        ValidateParsedImport(command.ParsedImport);

        var yearStartById = await LoadAcademicYearStartsAsync(cancellationToken);
        var academicYearId = yearStartById
            .Where(x => x.Value == command.AcademicYearStart)
            .Select(x => (int?)x.Key)
            .FirstOrDefault()
            ?? throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                $"Chưa có khoá học ứng với năm học {command.AcademicYearStart}–{command.AcademicYearStart + 1}. Hãy vào Danh mục đào tạo → Khoá ngành đào tạo, tạo khoá học tương ứng rồi tải lại tệp.");

        // Mỗi khoá ngành một dòng; bốn xếp loại cộng lại bằng tổng tốt nghiệp.
        var cohortMajorIdByKey = await (
            from cohortMajor in db.CohortMajors.AsNoTracking()
            join cohort in db.Cohorts.AsNoTracking()
                on cohortMajor.CohortId equals cohort.CohortId
            select new { cohortMajor.CohortMajorId, cohortMajor.MajorId, cohort.CohortCode })
            .ToListAsync(cancellationToken);
        var lookup = cohortMajorIdByKey
            .ToDictionary(x => (x.MajorId, x.CohortCode), x => x.CohortMajorId);

        var rows = new Dictionary<int, CohortMajorGraduation>();
        foreach (var aggregate in command.ParsedImport.Aggregates)
        {
            if (aggregate.MajorId is not { } majorId
                || !lookup.TryGetValue((majorId, aggregate.CohortCode), out var cohortMajorId))
            {
                throw new GraduationAnalyticsException(
                    GraduationAnalyticsErrorCodes.InvalidImport,
                    $"Không tìm thấy khoá ngành đào tạo cho '{aggregate.ProgramNameRaw}' khoá {aggregate.CohortCode}. Hãy vào Danh mục đào tạo → Khoá ngành đào tạo để bổ sung rồi tải lại tệp.");
            }

            if (!rows.TryGetValue(cohortMajorId, out var row))
            {
                row = new CohortMajorGraduation { CohortMajorId = cohortMajorId };
                rows[cohortMajorId] = row;
            }

            row.GraduatedCount += aggregate.StudentCount;
            switch (aggregate.GraduationRank)
            {
                case GraduationRank.Excellent: row.ExcellentCount += aggregate.StudentCount; break;
                case GraduationRank.VeryGood: row.VeryGoodCount += aggregate.StudentCount; break;
                case GraduationRank.Good: row.GoodCount += aggregate.StudentCount; break;
                default: row.AverageCount += aggregate.StudentCount; break;
            }
            if (aggregate.IsWorkStudy)
            {
                row.WorkStudyCount += aggregate.StudentCount;
            }
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var round = await db.GraduationRounds.IgnoreQueryFilters().SingleOrDefaultAsync(
            x => x.AcademicYearId == academicYearId && x.RoundNumber == command.RoundNumber,
            cancellationToken);
        GraduationRoundImportRevision? activeRevision = null;
        var isRestoring = round?.IsDeleted == true;
        var previousRevisionId = isRestoring ? round?.ActiveRevisionId : null;
        var aggregateHash = ComputeAggregateHash(command);

        if (round is not null && !isRestoring && round.ActiveRevisionId.HasValue)
        {
            activeRevision = await db.GraduationRoundImportRevisions
                .SingleAsync(x => x.RevisionId == round.ActiveRevisionId.Value, cancellationToken);
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
                    ToPeriodDto(round, activeRevision, command.AcademicYearStart),
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

        var orderValue = command.ReviewYear * 12 + command.ReviewMonth;
        var violatesRoundOrder = await db.GraduationRounds.AsNoTracking().AnyAsync(
            x => x.AcademicYearId == academicYearId
                && (round == null || x.GraduationRoundId != round.GraduationRoundId)
                && ((x.RoundNumber < command.RoundNumber
                        && x.ReviewYear * 12 + x.ReviewMonth > orderValue)
                    || (x.RoundNumber > command.RoundNumber
                        && x.ReviewYear * 12 + x.ReviewMonth < orderValue)),
            cancellationToken);
        if (violatesRoundOrder)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Tháng/năm xét không đúng thứ tự các đợt trong cùng năm học.");
        }

        var now = DateTime.UtcNow;
        var actor = await GetActorAsync(cancellationToken);
        if (round is null)
        {
            round = new GraduationRound
            {
                AcademicYearId = academicYearId,
                RoundNumber = command.RoundNumber,
                CreatedAt = now,
                ReviewMonth = command.ReviewMonth,
                ReviewYear = command.ReviewYear,
            };
            db.GraduationRounds.Add(round);
            await db.SaveChangesAsync(cancellationToken);
        }
        else if (isRestoring)
        {
            round.IsDeleted = false;
            round.DeletedAt = null;
            round.DeletedByUserId = null;
            round.DeletedByName = null;
            round.DeleteReason = null;
        }

        var revisionNumber = (await db.GraduationRoundImportRevisions
            .Where(x => x.GraduationRoundId == round.GraduationRoundId)
            .MaxAsync(x => (int?)x.RevisionNumber, cancellationToken) ?? 0) + 1;
        var revision = new GraduationRoundImportRevision
        {
            GraduationRoundId = round.GraduationRoundId,
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
            WarningsJson = JsonSerializer.Serialize(command.ParsedImport.Warnings),
            ImportedAtUtc = now,
            ImportedByUserId = actor.Id,
            ImportedByName = actor.Name,
            ReplaceReason = NormalizeOptional(command.ReplaceReason)
                ?? (isRestoring ? "Tải lên lại sau khi xóa dữ liệu đợt" : null),
            ReplacedRevisionId = activeRevision?.RevisionId ?? previousRevisionId,
        };
        db.GraduationRoundImportRevisions.Add(revision);
        await db.SaveChangesAsync(cancellationToken);

        db.GraduationRoundRevisionAggregates.AddRange(command.ParsedImport.Aggregates.Select(aggregate =>
            new GraduationRoundRevisionAggregate
            {
                RevisionId = revision.RevisionId,
                CohortMajorId = lookup[(aggregate.MajorId!.Value, aggregate.CohortCode)],
                FacultyId = aggregate.FacultyId,
                MajorId = aggregate.MajorId,
                FacultyNameRaw = aggregate.FacultyNameRaw,
                FacultyKey = aggregate.FacultyKey,
                ProgramNameRaw = aggregate.ProgramNameRaw,
                ProgramKey = aggregate.ProgramKey,
                DerivedProgramCode = aggregate.DerivedProgramCode,
                CohortCode = aggregate.CohortCode,
                GraduationRank = aggregate.GraduationRank,
                IsWorkStudy = aggregate.IsWorkStudy,
                StudentCount = aggregate.StudentCount,
            }));

        // Đây là projection đang hoạt động; các snapshot cũ vẫn được giữ trong revision.
        var existing = await db.CohortMajorGraduations
            .Where(x => x.GraduationRoundId == round.GraduationRoundId)
            .ToListAsync(cancellationToken);
        db.CohortMajorGraduations.RemoveRange(existing);
        await db.SaveChangesAsync(cancellationToken);

        foreach (var row in rows.Values)
        {
            row.GraduationRoundId = round.GraduationRoundId;
        }
        db.CohortMajorGraduations.AddRange(rows.Values);
        round.ReviewMonth = command.ReviewMonth;
        round.ReviewYear = command.ReviewYear;
        round.ActiveRevisionId = revision.RevisionId;
        await db.SaveChangesAsync(cancellationToken);

        await RecalculateCohortMajorTotalsAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new GraduationImportCommitResultDto(
            ToPeriodDto(round, revision, command.AcademicYearStart),
            ToRevisionDto(revision),
            false);
    }

    // ------------------------------------------------------------- Lịch sử đợt

    public async Task<IReadOnlyList<GraduationRevisionDto>> GetRevisionsAsync(
        long periodId,
        CancellationToken cancellationToken)
    {
        if (!await db.GraduationRounds.AsNoTracking()
            .AnyAsync(x => x.GraduationRoundId == periodId, cancellationToken))
        {
            throw PeriodNotFound();
        }

        var revisions = await db.GraduationRoundImportRevisions.AsNoTracking()
            .Where(x => x.GraduationRoundId == periodId)
            .OrderByDescending(x => x.RevisionNumber)
            .ToListAsync(cancellationToken);
        return revisions.Select(ToRevisionDto).ToList();
    }

    public async Task<ParsedGraduationImport> GetActivePreviewAsync(
        long periodId,
        CancellationToken cancellationToken)
    {
        var revision = await (
            from round in db.GraduationRounds.AsNoTracking()
            join activeRevision in db.GraduationRoundImportRevisions.AsNoTracking()
                on round.ActiveRevisionId equals activeRevision.RevisionId
            where round.GraduationRoundId == periodId
            select activeRevision)
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw PeriodNotFound();

        var aggregates = await db.GraduationRoundRevisionAggregates.AsNoTracking()
            .Where(x => x.RevisionId == revision.RevisionId)
            .OrderBy(x => x.FacultyKey)
            .ThenBy(x => x.ProgramKey)
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
                x.StudentCount,
                x.FacultyId,
                x.MajorId))
            .ToListAsync(cancellationToken);

        return new ParsedGraduationImport(
            revision.OriginalFileName,
            revision.SourceSheetName,
            revision.FileHash,
            revision.SourceRowCount,
            revision.ImportedRowCount,
            revision.SkippedRowCount,
            aggregates,
            DeserializeWarnings(revision.WarningsJson));
    }

    public async Task DeletePeriodAsync(
        long periodId,
        string reason,
        CancellationToken cancellationToken)
    {
        var normalizedReason = reason.Trim();
        if (normalizedReason.Length is < 3 or > 1000)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidQuery,
                "Lý do xóa phải có từ 3 đến 1000 ký tự.");
        }

        var round = await db.GraduationRounds
            .SingleOrDefaultAsync(x => x.GraduationRoundId == periodId, cancellationToken)
            ?? throw PeriodNotFound();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var actor = await GetActorAsync(cancellationToken);
        round.IsDeleted = true;
        round.DeletedAt = DateTime.UtcNow;
        round.DeletedByUserId = actor.Id;
        round.DeletedByName = actor.Name;
        round.DeleteReason = normalizedReason;
        await db.SaveChangesAsync(cancellationToken);
        await RecalculateCohortMajorTotalsAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    // ----------------------------------------------------------- Phân tích sâu

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

        var yearStartById = await LoadAcademicYearStartsAsync(cancellationToken);
        var rounds = await LoadRoundsAsync(cancellationToken);
        var roundsWithData = await db.GraduationRounds.AsNoTracking()
            .Where(x => x.ActiveRevisionId != null)
            .Select(x => x.GraduationRoundId)
            .Distinct()
            .ToListAsync(cancellationToken);
        var ordered = rounds
            .Where(x => roundsWithData.Contains(x.GraduationRoundId))
            .OrderBy(x => yearStartById.GetValueOrDefault(x.AcademicYearId))
            .ThenBy(x => x.RoundNumber)
            .ToList();

        var cutoffIndex = ordered.FindIndex(x => x.GraduationRoundId == query.CutoffPeriodId);
        if (cutoffIndex < 0)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsV3ErrorCodes.PeriodNotFound,
                "Không tìm thấy đợt kết thúc hoặc đợt chưa có dữ liệu.");
        }

        var startIndex = cutoffIndex;
        if (mode == GraduationExploreModes.CohortCumulative)
        {
            startIndex = 0;
            if (query.StartPeriodId is { } startPeriodId)
            {
                startIndex = ordered.FindIndex(x => x.GraduationRoundId == startPeriodId);
                if (startIndex < 0)
                {
                    throw new GraduationAnalyticsException(
                        GraduationAnalyticsV3ErrorCodes.PeriodNotFound,
                        "Không tìm thấy đợt bắt đầu hoặc đợt chưa có dữ liệu.");
                }
                if (startIndex > cutoffIndex)
                {
                    throw new GraduationAnalyticsException(
                        GraduationAnalyticsErrorCodes.InvalidQuery,
                        "Đợt bắt đầu phải nằm trước hoặc trùng đợt kết thúc.");
                }
            }
        }

        var scopedRounds = ordered.GetRange(startIndex, cutoffIndex - startIndex + 1);
        var scopedRoundIds = scopedRounds.Select(x => x.GraduationRoundId).ToList();
        // Snapshot của revision đang hoạt động giữ nguyên giao VLVH × xếp loại từ
        // file nguồn; không dựng lại giao này từ bảng projection tổng hợp.
        var cells = await LoadActiveRevisionCellsAsync(scopedRoundIds, cancellationToken);
        var population = await LoadPopulationAsync(
            cells.Select(x => x.CohortCode).Distinct(StringComparer.Ordinal).ToList(),
            cancellationToken);

        var facets = new GraduationExploreFacetsV3Dto(
            population.GroupBy(x => x.FacultyKey)
                .Select(x => new GraduationFacetOptionDto(x.Key, FirstLabel(x.Select(y => y.FacultyName))))
                .OrderBy(x => x.Label, StringComparer.CurrentCulture)
                .ToList(),
            population.GroupBy(x => new { x.ProgramKey, x.FacultyKey })
                .Select(x => new GraduationFacetOptionDto(
                    x.Key.ProgramKey,
                    FirstLabel(x.Select(y => y.ProgramName)),
                    x.Key.FacultyKey))
                .OrderBy(x => x.Label, StringComparer.CurrentCulture)
                .ToList(),
            population.Select(x => x.CohortCode).Distinct().Order(StringComparer.Ordinal).ToList());

        var selectedCohorts = Normalize(query.Cohorts);
        var selectedFacultyKeys = Normalize(query.FacultyKeys);
        var selectedProgramSelections = Normalize(query.ProgramKeys);
        const string programSelectionSeparator = "\u001f";
        var selectedProgramPairs = selectedProgramSelections
            .Where(x => x.Contains(programSelectionSeparator, StringComparison.Ordinal))
            .ToHashSet(StringComparer.Ordinal);
        var selectedLegacyProgramKeys = selectedProgramSelections
            .Where(x => !x.Contains(programSelectionSeparator, StringComparison.Ordinal))
            .ToHashSet(StringComparer.Ordinal);

        var filtered = cells
            .Where(x => selectedCohorts.Count == 0 || selectedCohorts.Contains(x.CohortCode))
            .Where(x => selectedFacultyKeys.Count == 0 || selectedFacultyKeys.Contains(x.FacultyKey))
            .Where(x => (selectedProgramPairs.Count == 0 && selectedLegacyProgramKeys.Count == 0)
                || selectedProgramPairs.Contains(x.FacultyKey + programSelectionSeparator + x.ProgramKey)
                || selectedLegacyProgramKeys.Contains(x.ProgramKey))
            .Select(x => new GraduationExploreCell(
                x.PeriodId,
                x.FacultyName,
                x.FacultyKey,
                x.ProgramName,
                x.ProgramKey,
                x.CohortCode,
                x.GraduationRank,
                x.IsWorkStudy,
                x.StudentCount))
            .ToList();
        var filteredPopulation = population
            .Where(x => selectedCohorts.Count == 0 || selectedCohorts.Contains(x.CohortCode))
            .Where(x => selectedFacultyKeys.Count == 0 || selectedFacultyKeys.Contains(x.FacultyKey))
            .Where(x => (selectedProgramPairs.Count == 0 && selectedLegacyProgramKeys.Count == 0)
                || selectedProgramPairs.Contains(x.FacultyKey + programSelectionSeparator + x.ProgramKey)
                || selectedLegacyProgramKeys.Contains(x.ProgramKey))
            .ToList();

        var periods = scopedRounds
            .Select(x => new GraduationExplorePeriod(
                x.GraduationRoundId,
                yearStartById.GetValueOrDefault(x.AcademicYearId),
                x.RoundNumber,
                x.ReviewMonth,
                x.ReviewYear))
            .ToList();

        return GraduationExploreCalculator.Calculate(
            mode,
            selectedCohorts.Count == 0 ? null : string.Join(", ", selectedCohorts),
            periods,
            filtered,
            filteredPopulation,
            facets,
            query.MetricId,
            query.GroupBy,
            query.SeriesBy,
            selectedCohorts);
    }

    // ------------------------------------------------------------------ Nội bộ

    private sealed record Cell(
        long PeriodId,
        string FacultyName,
        string FacultyKey,
        string ProgramName,
        string ProgramKey,
        string CohortCode,
        GraduationRank GraduationRank,
        bool IsWorkStudy,
        int StudentCount);

    private async Task<List<Cell>> LoadActiveRevisionCellsAsync(
        IReadOnlyList<long> roundIds,
        CancellationToken cancellationToken)
    {
        var rows = await (
            from round in db.GraduationRounds.AsNoTracking()
            where roundIds.Contains(round.GraduationRoundId) && round.ActiveRevisionId != null
            join aggregate in db.GraduationRoundRevisionAggregates.AsNoTracking()
                on round.ActiveRevisionId equals aggregate.RevisionId
            join cohortMajor in db.CohortMajors.AsNoTracking()
                on aggregate.CohortMajorId equals cohortMajor.CohortMajorId
            join cohort in db.Cohorts.AsNoTracking()
                on cohortMajor.CohortId equals cohort.CohortId
            join major in db.Majors.AsNoTracking()
                on cohortMajor.MajorId equals major.MajorId
            join faculty in db.Faculties.AsNoTracking()
                on major.FacultyId equals faculty.FacultyId
            select new
            {
                round.GraduationRoundId,
                faculty.FacultyName,
                major.MajorName,
                cohort.CohortCode,
                aggregate.GraduationRank,
                aggregate.IsWorkStudy,
                aggregate.StudentCount,
            })
            .ToListAsync(cancellationToken);
        return rows.Select(x => new Cell(
            x.GraduationRoundId,
            x.FacultyName,
            NormalizeKey(x.FacultyName),
            x.MajorName,
            NormalizeKey(x.MajorName),
            x.CohortCode,
            x.GraduationRank,
            x.IsWorkStudy,
            x.StudentCount)).ToList();
    }

    private async Task<List<GraduationPopulationCell>> LoadPopulationAsync(
        IReadOnlyList<string> cohortCodes,
        CancellationToken cancellationToken)
    {
        var rows = await (
            from cohortMajor in db.CohortMajors.AsNoTracking()
            join cohort in db.Cohorts.AsNoTracking()
                on cohortMajor.CohortId equals cohort.CohortId
            where cohortCodes.Contains(cohort.CohortCode)
            join major in db.Majors.AsNoTracking()
                on cohortMajor.MajorId equals major.MajorId
            join faculty in db.Faculties.AsNoTracking()
                on major.FacultyId equals faculty.FacultyId
            select new
            {
                faculty.FacultyName,
                major.MajorName,
                cohort.CohortCode,
                cohortMajor.StudentCount,
            })
            .ToListAsync(cancellationToken);
        return rows.Select(x => new GraduationPopulationCell(
            x.FacultyName,
            NormalizeKey(x.FacultyName),
            x.MajorName,
            NormalizeKey(x.MajorName),
            x.CohortCode,
            x.StudentCount)).ToList();
    }

    private async Task<List<RoundRow>> LoadRoundsAsync(CancellationToken cancellationToken) =>
        await db.GraduationRounds.AsNoTracking()
            .Select(x => new RoundRow(
                x.GraduationRoundId,
                x.RoundNumber,
                x.AcademicYearId,
                x.CreatedAt,
                x.ReviewMonth,
                x.ReviewYear))
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Năm học suy từ khoá học chứ không đọc bảng "AcademicYears": mỗi năm học có
    /// đúng một khoá, khoá 59 ứng với năm học 2018-2019.
    /// </summary>
    private async Task<Dictionary<int, int>> LoadAcademicYearStartsAsync(
        CancellationToken cancellationToken)
    {
        var cohorts = await db.Cohorts.AsNoTracking()
            .Select(x => new { x.AcademicYearId, x.CohortCode })
            .ToListAsync(cancellationToken);

        var map = new Dictionary<int, int>();
        foreach (var cohort in cohorts)
        {
            if (int.TryParse(cohort.CohortCode, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number))
            {
                map[cohort.AcademicYearId] = BaseAcademicYearStart + (number - BaseCohortNumber);
            }
        }
        return map;
    }

    /// <summary>Chương trình chuẩn kéo dài bốn năm học.</summary>
    private const int StandardProgramYears = 4;

    private static bool IsOnTimeRound(int roundAcademicYearStart, string cohortCode)
    {
        var digits = new string((cohortCode ?? string.Empty).Where(char.IsDigit).ToArray());
        if (!int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number))
        {
            return false;
        }
        var cohortYearStart = BaseAcademicYearStart + (number - BaseCohortNumber);
        return roundAcademicYearStart - cohortYearStart == StandardProgramYears - 1;
    }

    /// <summary>Cột tổng ở "CohortMajors" là số dẫn xuất, cộng lại từ mọi đợt.</summary>
    private async Task RecalculateCohortMajorTotalsAsync(CancellationToken cancellationToken)
    {
        var yearStartById = await LoadAcademicYearStartsAsync(cancellationToken);
        var roundYearStart = (await LoadRoundsAsync(cancellationToken))
            .ToDictionary(x => x.GraduationRoundId, x => yearStartById.GetValueOrDefault(x.AcademicYearId));

        var rows = await (
            from graduation in db.CohortMajorGraduations.AsNoTracking()
            join round in db.GraduationRounds.AsNoTracking()
                on graduation.GraduationRoundId equals round.GraduationRoundId
            join cohortMajor in db.CohortMajors.AsNoTracking()
                on graduation.CohortMajorId equals cohortMajor.CohortMajorId
            join cohort in db.Cohorts.AsNoTracking()
                on cohortMajor.CohortId equals cohort.CohortId
            select new
            {
                graduation.CohortMajorId,
                graduation.GraduationRoundId,
                cohort.CohortCode,
                graduation.GraduatedCount,
                graduation.ExcellentCount,
                graduation.VeryGoodCount,
                graduation.GoodCount,
                graduation.AverageCount,
                graduation.WorkStudyCount,
            })
            .ToListAsync(cancellationToken);

        var totals = rows
            .GroupBy(x => x.CohortMajorId)
            .ToDictionary(g => g.Key, g => new
            {
                Graduated = g.Sum(x => x.GraduatedCount),
                Excellent = g.Sum(x => x.ExcellentCount),
                VeryGood = g.Sum(x => x.VeryGoodCount),
                Good = g.Sum(x => x.GoodCount),
                Average = g.Sum(x => x.AverageCount),
                WorkStudy = g.Sum(x => x.WorkStudyCount),
                OnTime = g
                    .Where(x => IsOnTimeRound(
                        roundYearStart.GetValueOrDefault(x.GraduationRoundId), x.CohortCode))
                    .Sum(x => x.GraduatedCount),
            });

        foreach (var cohortMajor in await db.CohortMajors.ToListAsync(cancellationToken))
        {
            var total = totals.GetValueOrDefault(cohortMajor.CohortMajorId);
            cohortMajor.GraduatedCount = total?.Graduated ?? 0;
            cohortMajor.ExcellentCount = total?.Excellent ?? 0;
            cohortMajor.VeryGoodCount = total?.VeryGood ?? 0;
            cohortMajor.GoodCount = total?.Good ?? 0;
            cohortMajor.AverageCount = total?.Average ?? 0;
            cohortMajor.WorkStudyCount = total?.WorkStudy ?? 0;
            cohortMajor.OnTimeGraduatedCount = total?.OnTime ?? 0;
            cohortMajor.NotGraduatedCount =
                Math.Max(0, cohortMajor.StudentCount - cohortMajor.GraduatedCount);
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    private static GraduationAnalyticsException PeriodNotFound() =>
        new(GraduationAnalyticsV3ErrorCodes.PeriodNotFound, "Không tìm thấy đợt tốt nghiệp.");

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
        GraduationRound round,
        GraduationRoundImportRevision revision,
        int academicYearStart) => new(
            round.GraduationRoundId,
            academicYearStart,
            $"{academicYearStart}–{academicYearStart + 1}",
            round.RoundNumber,
            round.ReviewMonth,
            round.ReviewYear,
            revision.RevisionId,
            revision.RevisionNumber,
            revision.OriginalFileName,
            revision.ImportedRowCount,
            revision.SkippedRowCount,
            revision.ImportedAtUtc,
            revision.ImportedByName);

    private static GraduationRevisionDto ToRevisionDto(
        GraduationRoundImportRevision revision) => new(
            revision.RevisionId,
            revision.RevisionNumber,
            revision.OriginalFileName,
            revision.SourceSheetName,
            revision.FileHash,
            revision.SourceRowCount,
            revision.ImportedRowCount,
            revision.SkippedRowCount,
            DeserializeWarnings(revision.WarningsJson),
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

    private async Task<(Guid Id, string Name)> GetActorAsync(CancellationToken cancellationToken)
    {
        var actorId = currentUser.UserId ?? Guid.Empty;
        var actorName = !string.IsNullOrWhiteSpace(currentUser.UserEmail)
            ? currentUser.UserEmail.Trim()
            : "Không xác định";
        await Task.CompletedTask;
        return (actorId, actorName);
    }

    private static List<string> Normalize(IReadOnlyList<string> values) => values
        .Select(x => string.IsNullOrWhiteSpace(x) ? null : x.Trim())
        .OfType<string>()
        .Distinct(StringComparer.Ordinal)
        .ToList();

    private static string FirstLabel(IEnumerable<string> values) =>
        values.OrderBy(x => x, StringComparer.Ordinal).FirstOrDefault() ?? string.Empty;

    private static string NormalizeKey(string value)
    {
        var normalized = (value ?? string.Empty).Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(character is 'đ' or 'Đ' or 'ð' or 'Ð'
                    ? 'D'
                    : char.ToUpperInvariant(character));
            }
        }
        return WhitespaceRegex()
            .Replace(builder.ToString().Normalize(NormalizationForm.FormC).Trim(), " ");
    }

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex WhitespaceRegex();
}
