using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Application;
using Application.GraduationAnalytics2;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.GraduationAnalytics2;

/// <summary>
/// Thống kê tốt nghiệp chạy trên bốn bảng mới: "Cohorts", "CohortMajors",
/// "GraduationRounds" và "CohortMajorGraduations"; chỉ đọc thêm "Majors" và
/// "Faculties" để lấy tên. Hợp đồng DTO giữ nguyên như bản cũ nên giao diện
/// không phải sửa gì.
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

    private sealed record FactRow(
        long GraduationRoundId,
        int CohortMajorId,
        string CohortCode,
        string MajorName,
        string FacultyName,
        int GraduatedCount,
        int ExcellentCount,
        int VeryGoodCount,
        int GoodCount,
        int AverageCount,
        int WorkStudyCount);

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
        var rounds = await LoadRoundsAsync(cancellationToken);
        var totals = await db.CohortMajorGraduations.AsNoTracking()
            .GroupBy(x => x.GraduationRoundId)
            .Select(g => new { GraduationRoundId = g.Key, StudentCount = g.Sum(x => x.GraduatedCount) })
            .ToDictionaryAsync(x => x.GraduationRoundId, x => x.StudentCount, cancellationToken);

        return rounds
            // Đợt chưa import thì chưa phải là một "đợt có dữ liệu".
            .Where(round => totals.ContainsKey(round.GraduationRoundId))
            .Where(round => academicYearStart is not { } year
                || yearStartById.GetValueOrDefault(round.AcademicYearId) == year)
            .OrderByDescending(round => yearStartById.GetValueOrDefault(round.AcademicYearId))
            .ThenByDescending(round => round.RoundNumber)
            .Select(round => ToPeriodDto(
                round,
                yearStartById.GetValueOrDefault(round.AcademicYearId),
                totals[round.GraduationRoundId]))
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
                $"Chưa có khoá học nào ứng với năm học {command.AcademicYearStart}–{command.AcademicYearStart + 1}.");

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
                    $"Không tìm thấy khoá ngành đào tạo cho '{aggregate.ProgramNameRaw}' khoá {aggregate.CohortCode}.");
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

        var round = await db.GraduationRounds.SingleOrDefaultAsync(
            x => x.AcademicYearId == academicYearId && x.RoundNumber == command.RoundNumber,
            cancellationToken);
        if (round is null)
        {
            round = new GraduationRound
            {
                AcademicYearId = academicYearId,
                RoundNumber = command.RoundNumber,
                CreatedAt = DateTime.UtcNow,
                ReviewMonth = command.ReviewMonth,
                ReviewYear = command.ReviewYear,
            };
            db.GraduationRounds.Add(round);
            await db.SaveChangesAsync(cancellationToken);
        }
        else
        {
            // Import lại có thể đồng thời sửa mốc tháng/năm xét của đợt.
            round.ReviewMonth = command.ReviewMonth;
            round.ReviewYear = command.ReviewYear;
        }

        // Import lại một đợt là thay toàn bộ, không cộng dồn vào số cũ.
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
        await db.SaveChangesAsync(cancellationToken);

        await RecalculateCohortMajorTotalsAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var studentCount = rows.Values.Sum(x => x.GraduatedCount);
        var actor = await GetActorAsync(cancellationToken);
        var period = ToPeriodDto(
            new RoundRow(round.GraduationRoundId, round.RoundNumber, round.AcademicYearId, round.CreatedAt, round.ReviewMonth, round.ReviewYear),
            command.AcademicYearStart,
            studentCount);
        var revision = ToRevisionDto(round, command.ParsedImport, studentCount, actor.Name);

        return new GraduationImportCommitResultDto(period, revision, false);
    }

    // ------------------------------------------------------------- Lịch sử đợt

    public async Task<IReadOnlyList<GraduationRevisionDto>> GetRevisionsAsync(
        long periodId,
        CancellationToken cancellationToken)
    {
        var round = await db.GraduationRounds.AsNoTracking()
            .SingleOrDefaultAsync(x => x.GraduationRoundId == periodId, cancellationToken)
            ?? throw PeriodNotFound();

        var studentCount = await db.CohortMajorGraduations.AsNoTracking()
            .Where(x => x.GraduationRoundId == periodId)
            .SumAsync(x => x.GraduatedCount, cancellationToken);
        var actor = await GetActorAsync(cancellationToken);

        // Bảng mới không lưu lịch sử từng lần tải lên, nên mỗi đợt chỉ có một bản.
        return [ToRevisionDto(round, parsedImport: null, studentCount, actor.Name)];
    }

    public async Task<ParsedGraduationImport> GetActivePreviewAsync(
        long periodId,
        CancellationToken cancellationToken)
    {
        if (!await db.GraduationRounds.AsNoTracking()
            .AnyAsync(x => x.GraduationRoundId == periodId, cancellationToken))
        {
            throw PeriodNotFound();
        }

        var facts = await LoadFactsAsync([periodId], cancellationToken);
        var aggregates = facts
            .SelectMany(ToCells)
            .Select(cell => new GraduationImportAggregate(
                cell.FacultyName,
                cell.FacultyKey,
                cell.ProgramName,
                cell.ProgramKey,
                null,
                cell.CohortCode,
                cell.GraduationRank,
                cell.IsWorkStudy,
                cell.StudentCount))
            .OrderBy(x => x.FacultyKey, StringComparer.Ordinal)
            .ThenBy(x => x.ProgramKey, StringComparer.Ordinal)
            .ThenBy(x => x.CohortCode, StringComparer.Ordinal)
            .ThenBy(x => x.GraduationRank)
            .ThenBy(x => x.IsWorkStudy)
            .ToList();
        var studentCount = aggregates.Sum(x => x.StudentCount);

        return new ParsedGraduationImport(
            string.Empty,
            string.Empty,
            string.Empty,
            studentCount,
            studentCount,
            0,
            aggregates,
            []);
    }

    public async Task DeletePeriodAsync(
        long periodId,
        CancellationToken cancellationToken)
    {
        var round = await db.GraduationRounds
            .SingleOrDefaultAsync(x => x.GraduationRoundId == periodId, cancellationToken)
            ?? throw PeriodNotFound();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var rows = await db.CohortMajorGraduations
            .Where(x => x.GraduationRoundId == periodId)
            .ToListAsync(cancellationToken);
        db.CohortMajorGraduations.RemoveRange(rows);
        db.GraduationRounds.Remove(round);
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
        var roundsWithData = await db.CohortMajorGraduations.AsNoTracking()
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
        var cells = (await LoadFactsAsync(scopedRoundIds, cancellationToken))
            .SelectMany(ToCells)
            .ToList();

        var facets = new GraduationExploreFacetsV3Dto(
            cells.GroupBy(x => x.FacultyKey)
                .Select(x => new GraduationFacetOptionDto(x.Key, FirstLabel(x.Select(y => y.FacultyName))))
                .OrderBy(x => x.Label, StringComparer.CurrentCulture)
                .ToList(),
            cells.GroupBy(x => new { x.ProgramKey, x.FacultyKey })
                .Select(x => new GraduationFacetOptionDto(
                    x.Key.ProgramKey,
                    FirstLabel(x.Select(y => y.ProgramName)),
                    x.Key.FacultyKey))
                .OrderBy(x => x.Label, StringComparer.CurrentCulture)
                .ToList(),
            cells.Select(x => x.CohortCode).Distinct().Order(StringComparer.Ordinal).ToList());

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

    /// <summary>
    /// Bảng mới lưu số VLVH tách rời bốn xếp loại, không lưu chéo giữa hai chiều.
    /// Bộ tính toán lại cần mỗi sinh viên nằm đúng một ô (xếp loại × VLVH), nên ở
    /// đây rải số VLVH lần lượt từ Xuất sắc xuống Trung bình. Cách rải là cố định
    /// nên kết quả không đổi giữa các lần chạy, và mọi con số giao diện hiển thị
    /// — tổng từng xếp loại và tổng VLVH — đều giữ nguyên.
    /// </summary>
    private static IEnumerable<Cell> ToCells(FactRow fact)
    {
        var facultyKey = NormalizeKey(fact.FacultyName);
        var programKey = NormalizeKey(fact.MajorName);
        var remainingWorkStudy = fact.WorkStudyCount;

        var ranks = new (GraduationRank Rank, int Count)[]
        {
            (GraduationRank.Excellent, fact.ExcellentCount),
            (GraduationRank.VeryGood, fact.VeryGoodCount),
            (GraduationRank.Good, fact.GoodCount),
            (GraduationRank.Average, fact.AverageCount),
        };

        foreach (var (rank, count) in ranks)
        {
            if (count <= 0)
            {
                continue;
            }
            var workStudy = Math.Min(remainingWorkStudy, count);
            remainingWorkStudy -= workStudy;

            if (workStudy > 0)
            {
                yield return new Cell(
                    fact.GraduationRoundId, fact.FacultyName, facultyKey, fact.MajorName,
                    programKey, fact.CohortCode, rank, true, workStudy);
            }
            if (count - workStudy > 0)
            {
                yield return new Cell(
                    fact.GraduationRoundId, fact.FacultyName, facultyKey, fact.MajorName,
                    programKey, fact.CohortCode, rank, false, count - workStudy);
            }
        }
    }

    private async Task<List<FactRow>> LoadFactsAsync(
        IReadOnlyList<long> roundIds,
        CancellationToken cancellationToken) => await (
            from graduation in db.CohortMajorGraduations.AsNoTracking()
            where roundIds.Contains(graduation.GraduationRoundId)
            join cohortMajor in db.CohortMajors.AsNoTracking()
                on graduation.CohortMajorId equals cohortMajor.CohortMajorId
            join cohort in db.Cohorts.AsNoTracking()
                on cohortMajor.CohortId equals cohort.CohortId
            join major in db.Majors.AsNoTracking()
                on cohortMajor.MajorId equals major.MajorId
            join faculty in db.Faculties.AsNoTracking()
                on major.FacultyId equals faculty.FacultyId
            select new FactRow(
                graduation.GraduationRoundId,
                cohortMajor.CohortMajorId,
                cohort.CohortCode,
                major.MajorName,
                faculty.FacultyName,
                graduation.GraduatedCount,
                graduation.ExcellentCount,
                graduation.VeryGoodCount,
                graduation.GoodCount,
                graduation.AverageCount,
                graduation.WorkStudyCount))
            .ToListAsync(cancellationToken);

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

    /// <summary>Chương trình chuẩn 4 năm, xem <see cref="IsOnTimeRound"/>.</summary>
    private const int StandardProgramYears = 4;

    /// <summary>
    /// Đúng hạn là tốt nghiệp trong năm học thứ tư kể từ khi nhập học: khoá 62
    /// nhập năm học 2021-2022 thì chỉ đợt của năm học 2024-2025 mới tính đúng hạn.
    /// </summary>
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

    private static GraduationPeriodV3Dto ToPeriodDto(
        RoundRow round,
        int academicYearStart,
        int studentCount) => new(
            round.GraduationRoundId,
            academicYearStart,
            $"{academicYearStart}–{academicYearStart + 1}",
            round.RoundNumber,
            round.ReviewMonth,
            round.ReviewYear,
            round.GraduationRoundId,
            1,
            string.Empty,
            studentCount,
            0,
            round.CreatedAt,
            string.Empty);

    private static GraduationRevisionDto ToRevisionDto(
        GraduationRound round,
        ParsedGraduationImport? parsedImport,
        int studentCount,
        string importedByName) => new(
            round.GraduationRoundId,
            1,
            parsedImport?.OriginalFileName ?? string.Empty,
            parsedImport?.SourceSheetName ?? string.Empty,
            parsedImport?.FileHash ?? string.Empty,
            parsedImport?.SourceRowCount ?? studentCount,
            parsedImport?.ImportedRowCount ?? studentCount,
            parsedImport?.SkippedRowCount ?? 0,
            parsedImport?.Warnings ?? [],
            round.CreatedAt,
            importedByName);

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
