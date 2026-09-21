using System.Globalization;
using System.Text;
using Application.Cohorts;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Cohorts;

/// <summary>
/// Danh mục khoá học và khoá ngành đào tạo. Tên khoá ngành là nhãn tự do, không
/// theo quy tắc nào; khoá học và ngành đào tạo đều đi vào bằng khoá ngoại tường
/// minh, riêng luồng import tra ngành theo tên và bí danh trong danh mục.
/// </summary>
public sealed class EfCohortService(AppDbContext db) : ICohortService
{
    /// <summary>Năm học 2018-2019 ứng với khoá 59; mỗi năm học sau đó tăng một khoá.</summary>
    private const int BaseAcademicYearStart = 2018;
    private const int BaseCohortNumber = 59;

    public async Task<IReadOnlyList<CohortDto>> GetCohortsAsync(
        CancellationToken cancellationToken = default)
    {
        var counts = await db.CohortMajors.AsNoTracking()
            .GroupBy(x => x.CohortId)
            .Select(g => new { CohortId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CohortId, x => x.Count, cancellationToken);

        var cohorts = await (
            from cohort in db.Cohorts.AsNoTracking()
            join year in db.AcademicYears.AsNoTracking()
                on cohort.AcademicYearId equals year.AcademicYearId
            orderby cohort.CohortCode descending
            select new { cohort, year.AcademicYearName })
            .ToListAsync(cancellationToken);

        return cohorts
            .Select(x => new CohortDto(
                x.cohort.CohortId,
                x.cohort.CohortCode,
                x.cohort.CohortName,
                x.cohort.AcademicYearId,
                x.AcademicYearName,
                counts.GetValueOrDefault(x.cohort.CohortId)))
            .ToList();
    }

    public async Task<CohortOperationResult<CohortDto>> CreateCohortAsync(
        SaveCohortCommand command,
        CancellationToken cancellationToken = default)
    {
        if (command.AcademicYearId <= 0)
        {
            return Failed<CohortDto>(CohortErrorCodes.AcademicYearRequired);
        }

        var year = await db.AcademicYears.AsNoTracking()
            .FirstOrDefaultAsync(x => x.AcademicYearId == command.AcademicYearId, cancellationToken);
        if (year is null)
        {
            return Failed<CohortDto>(CohortErrorCodes.AcademicYearNotFound);
        }

        if (await db.Cohorts.AnyAsync(x => x.AcademicYearId == command.AcademicYearId, cancellationToken))
        {
            return Failed<CohortDto>(CohortErrorCodes.AcademicYearUsed);
        }

        var code = NormalizeCode(command.CohortCode) is { Length: > 0 } explicitCode
            ? explicitCode
            : DeriveCohortCode(year.AcademicYearName);
        if (code.Length == 0)
        {
            return Failed<CohortDto>(CohortErrorCodes.CohortCodeRequired);
        }
        if (await db.Cohorts.AnyAsync(x => x.CohortCode == code, cancellationToken))
        {
            return Failed<CohortDto>(CohortErrorCodes.CohortCodeExists);
        }

        var cohort = new Cohort
        {
            CohortCode = code,
            CohortName = NormalizeName(command.CohortName) is { Length: > 0 } name ? name : $"Khoá {code}",
            AcademicYearId = command.AcademicYearId,
        };
        db.Cohorts.Add(cohort);
        await db.SaveChangesAsync(cancellationToken);

        return Ok(new CohortDto(
            cohort.CohortId, cohort.CohortCode, cohort.CohortName,
            cohort.AcademicYearId, year.AcademicYearName, 0));
    }

    public async Task<CohortOperationResult<CohortDto>> UpdateCohortAsync(
        int cohortId,
        SaveCohortCommand command,
        CancellationToken cancellationToken = default)
    {
        var cohort = await db.Cohorts.FirstOrDefaultAsync(x => x.CohortId == cohortId, cancellationToken);
        if (cohort is null)
        {
            return Failed<CohortDto>(CohortErrorCodes.CohortNotFound);
        }

        var year = await db.AcademicYears.AsNoTracking()
            .FirstOrDefaultAsync(x => x.AcademicYearId == command.AcademicYearId, cancellationToken);
        if (year is null)
        {
            return Failed<CohortDto>(CohortErrorCodes.AcademicYearNotFound);
        }
        if (await db.Cohorts.AnyAsync(
            x => x.AcademicYearId == command.AcademicYearId && x.CohortId != cohortId,
            cancellationToken))
        {
            return Failed<CohortDto>(CohortErrorCodes.AcademicYearUsed);
        }

        var code = NormalizeCode(command.CohortCode);
        if (code.Length == 0)
        {
            return Failed<CohortDto>(CohortErrorCodes.CohortCodeRequired);
        }
        if (await db.Cohorts.AnyAsync(x => x.CohortCode == code && x.CohortId != cohortId, cancellationToken))
        {
            return Failed<CohortDto>(CohortErrorCodes.CohortCodeExists);
        }

        cohort.CohortCode = code;
        cohort.CohortName = NormalizeName(command.CohortName) is { Length: > 0 } name ? name : $"Khoá {code}";
        cohort.AcademicYearId = command.AcademicYearId;
        await db.SaveChangesAsync(cancellationToken);

        var majorCount = await db.CohortMajors.CountAsync(x => x.CohortId == cohortId, cancellationToken);
        return Ok(new CohortDto(
            cohort.CohortId, cohort.CohortCode, cohort.CohortName,
            cohort.AcademicYearId, year.AcademicYearName, majorCount));
    }

    public async Task<CohortOperationResult<bool>> DeleteCohortAsync(
        int cohortId,
        CancellationToken cancellationToken = default)
    {
        var cohort = await db.Cohorts.FirstOrDefaultAsync(x => x.CohortId == cohortId, cancellationToken);
        if (cohort is null)
        {
            return Failed<bool>(CohortErrorCodes.CohortNotFound);
        }
        if (await db.CohortMajors.AnyAsync(x => x.CohortId == cohortId, cancellationToken))
        {
            return Failed<bool>(CohortErrorCodes.CohortInUse);
        }

        cohort.IsDeleted = true;
        cohort.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(true);
    }

    public async Task<IReadOnlyList<CohortMajorDto>> GetCohortMajorsAsync(
        int? cohortId,
        CancellationToken cancellationToken = default)
    {
        var query =
            from cohortMajor in db.CohortMajors.AsNoTracking()
            join cohort in db.Cohorts.AsNoTracking()
                on cohortMajor.CohortId equals cohort.CohortId
            join major in db.Majors.AsNoTracking()
                on cohortMajor.MajorId equals major.MajorId
            join faculty in db.Faculties.AsNoTracking()
                on major.FacultyId equals faculty.FacultyId
            select new { cohortMajor, cohort.CohortCode, major, faculty.FacultyName };

        if (cohortId is > 0)
        {
            query = query.Where(x => x.cohortMajor.CohortId == cohortId.Value);
        }

        var rows = await query
            .OrderBy(x => x.cohortMajor.CohortMajorCode)
            .ToListAsync(cancellationToken);

        return rows
            .Select(x => ToDto(x.cohortMajor, x.CohortCode, x.major.MajorCode, x.major.MajorName, x.FacultyName))
            .ToList();
    }

    public async Task<CohortOperationResult<CohortMajorDto>> CreateCohortMajorAsync(
        SaveCohortMajorCommand command,
        CancellationToken cancellationToken = default)
    {
        var name = NormalizeName(command.CohortMajorCode);
        if (name.Length == 0)
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.CohortMajorCodeRequired);
        }
        if (command.StudentCount < 0)
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.StudentCountInvalid);
        }

        var cohort = await db.Cohorts.AsNoTracking()
            .FirstOrDefaultAsync(x => x.CohortId == command.CohortId, cancellationToken);
        if (cohort is null)
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.CohortNotFound);
        }

        var major = await db.Majors.AsNoTracking()
            .FirstOrDefaultAsync(x => x.MajorId == command.MajorId, cancellationToken);
        if (major is null)
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.MajorNotFound);
        }

        // Tên tự do nên chỉ cần duy nhất trong phạm vi một khoá.
        if (await db.CohortMajors.AnyAsync(
            x => x.CohortId == command.CohortId && x.CohortMajorCode == name,
            cancellationToken))
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.CohortMajorCodeExists);
        }
        if (await db.CohortMajors.AnyAsync(
            x => x.CohortId == command.CohortId && x.MajorId == command.MajorId,
            cancellationToken))
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.CohortMajorExists);
        }

        var entity = new CohortMajor
        {
            CohortMajorCode = name,
            CohortId = command.CohortId,
            MajorId = command.MajorId,
            StudentCount = command.StudentCount,
            NotGraduatedCount = command.StudentCount,
        };
        db.CohortMajors.Add(entity);
        await db.SaveChangesAsync(cancellationToken);

        var facultyName = await GetFacultyNameAsync(major.FacultyId, cancellationToken);
        return Ok(ToDto(entity, cohort.CohortCode, major.MajorCode, major.MajorName, facultyName));
    }

    public async Task<CohortOperationResult<CohortMajorDto>> UpdateCohortMajorAsync(
        int cohortMajorId,
        SaveCohortMajorCommand command,
        CancellationToken cancellationToken = default)
    {
        var entity = await db.CohortMajors
            .FirstOrDefaultAsync(x => x.CohortMajorId == cohortMajorId, cancellationToken);
        if (entity is null)
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.CohortMajorNotFound);
        }

        var name = NormalizeName(command.CohortMajorCode);
        if (name.Length == 0)
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.CohortMajorCodeRequired);
        }
        if (command.StudentCount < 0)
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.StudentCountInvalid);
        }

        var cohort = await db.Cohorts.AsNoTracking()
            .FirstOrDefaultAsync(x => x.CohortId == command.CohortId, cancellationToken);
        if (cohort is null)
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.CohortNotFound);
        }
        var major = await db.Majors.AsNoTracking()
            .FirstOrDefaultAsync(x => x.MajorId == command.MajorId, cancellationToken);
        if (major is null)
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.MajorNotFound);
        }

        if (await db.CohortMajors.AnyAsync(
            x => x.CohortId == command.CohortId
                && x.CohortMajorCode == name
                && x.CohortMajorId != cohortMajorId,
            cancellationToken))
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.CohortMajorCodeExists);
        }
        if (await db.CohortMajors.AnyAsync(
            x => x.CohortId == command.CohortId
                && x.MajorId == command.MajorId
                && x.CohortMajorId != cohortMajorId,
            cancellationToken))
        {
            return Failed<CohortMajorDto>(CohortErrorCodes.CohortMajorExists);
        }

        entity.CohortMajorCode = name;
        entity.CohortId = command.CohortId;
        entity.MajorId = command.MajorId;
        entity.StudentCount = command.StudentCount;
        entity.NotGraduatedCount = Math.Max(0, entity.StudentCount - entity.GraduatedCount);
        await db.SaveChangesAsync(cancellationToken);

        var facultyName = await GetFacultyNameAsync(major.FacultyId, cancellationToken);
        return Ok(ToDto(entity, cohort.CohortCode, major.MajorCode, major.MajorName, facultyName));
    }

    public async Task<CohortOperationResult<bool>> DeleteCohortMajorAsync(
        int cohortMajorId,
        CancellationToken cancellationToken = default)
    {
        var entity = await db.CohortMajors
            .FirstOrDefaultAsync(x => x.CohortMajorId == cohortMajorId, cancellationToken);
        if (entity is null)
        {
            return Failed<bool>(CohortErrorCodes.CohortMajorNotFound);
        }
        if (await db.CohortMajorGraduations.AnyAsync(x => x.CohortMajorId == cohortMajorId, cancellationToken))
        {
            return Failed<bool>(CohortErrorCodes.CohortMajorInUse);
        }

        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(true);
    }

    public async Task<CohortOperationResult<CohortImportDto>> ImportCohortMajorsAsync(
        int cohortId,
        IReadOnlyList<ImportCohortMajorRowCommand> rows,
        CancellationToken cancellationToken = default)
    {
        if (!await db.Cohorts.AnyAsync(x => x.CohortId == cohortId, cancellationToken))
        {
            return Failed<CohortImportDto>(CohortErrorCodes.CohortNotFound);
        }

        var majors = await db.Majors.AsNoTracking()
            .Select(x => new { x.MajorId, x.MajorCode, x.MajorName })
            .ToListAsync(cancellationToken);
        var majorIdsByName = new Dictionary<string, HashSet<int>>(StringComparer.Ordinal);
        foreach (var major in majors)
        {
            AddName(majorIdsByName, MatchKey(major.MajorName), major.MajorId);
            AddName(majorIdsByName, MatchKey(major.MajorCode), major.MajorId);
        }
        foreach (var alias in await db.MajorImportAliases.AsNoTracking().ToListAsync(cancellationToken))
        {
            AddName(majorIdsByName, MatchKey(alias.Alias), alias.MajorId);
        }

        var existing = await db.CohortMajors
            .Where(x => x.CohortId == cohortId)
            .ToDictionaryAsync(x => x.CohortMajorCode, StringComparer.Ordinal, cancellationToken);
        var takenMajors = existing.Values.Select(x => x.MajorId).ToHashSet();

        var items = new List<CohortImportItemDto>(rows.Count);
        var created = 0;
        var updated = 0;

        foreach (var row in rows)
        {
            var name = NormalizeName(row.CohortMajorCode);
            if (name.Length == 0)
            {
                items.Add(new(row.RowNumber, name, false, CohortErrorCodes.CohortMajorCodeRequired));
                continue;
            }

            var studentCount = row.StudentCount ?? 0;
            if (studentCount < 0)
            {
                items.Add(new(row.RowNumber, name, false, CohortErrorCodes.StudentCountInvalid));
                continue;
            }

            // Tên khoá ngành là nhãn tự do, nên ngành chỉ tra được từ cột tên ngành.
            if (!TryResolveByName(majorIdsByName, row.MajorName, out var majorId))
            {
                items.Add(new(row.RowNumber, name, false, CohortErrorCodes.MajorNotFound));
                continue;
            }

            if (existing.TryGetValue(name, out var current))
            {
                current.MajorId = majorId;
                current.StudentCount = studentCount;
                current.NotGraduatedCount = Math.Max(0, studentCount - current.GraduatedCount);
                updated++;
                items.Add(new(row.RowNumber, name, true, null));
                continue;
            }

            if (!takenMajors.Add(majorId))
            {
                items.Add(new(row.RowNumber, name, false, CohortErrorCodes.CohortMajorExists));
                continue;
            }

            var entity = new CohortMajor
            {
                CohortMajorCode = name,
                CohortId = cohortId,
                MajorId = majorId,
                StudentCount = studentCount,
                NotGraduatedCount = studentCount,
            };
            db.CohortMajors.Add(entity);
            existing[name] = entity;
            created++;
            items.Add(new(row.RowNumber, name, true, null));
        }

        if (created > 0 || updated > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return Ok(new CohortImportDto(
            rows.Count, created, updated, rows.Count - created - updated, items));
    }

    private async Task<string> GetFacultyNameAsync(int facultyId, CancellationToken cancellationToken) =>
        await db.Faculties.AsNoTracking()
            .Where(x => x.FacultyId == facultyId)
            .Select(x => x.FacultyName)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;

    private static CohortMajorDto ToDto(
        CohortMajor entity,
        string cohortCode,
        string majorCode,
        string majorName,
        string facultyName) => new(
            entity.CohortMajorId,
            entity.CohortMajorCode,
            entity.CohortId,
            cohortCode,
            entity.MajorId,
            majorCode,
            majorName,
            facultyName,
            entity.StudentCount,
            entity.GraduatedCount,
            entity.NotGraduatedCount,
            entity.OnTimeGraduatedCount,
            entity.ExcellentCount,
            entity.VeryGoodCount,
            entity.GoodCount,
            entity.AverageCount,
            entity.WorkStudyCount);

    private static bool TryResolveByName(
        IReadOnlyDictionary<string, HashSet<int>> lookup,
        string? majorName,
        out int majorId)
    {
        majorId = 0;
        if (string.IsNullOrWhiteSpace(majorName))
        {
            return false;
        }
        if (!lookup.TryGetValue(MatchKey(majorName), out var ids) || ids.Count != 1)
        {
            return false;
        }
        majorId = ids.Single();
        return true;
    }

    private static void AddName(Dictionary<string, HashSet<int>> lookup, string key, int majorId)
    {
        if (!lookup.TryGetValue(key, out var ids))
        {
            ids = [];
            lookup[key] = ids;
        }
        ids.Add(majorId);
    }

    /// <summary>Khoá so khớp bỏ dấu, bỏ ký tự phân cách, để 'ĐTĐ-CLC' và 'DTD CLC' bằng nhau.</summary>
    private static string MatchKey(string value) =>
        string.Concat(RemoveDiacritics(value).Where(char.IsLetterOrDigit)).ToUpperInvariant();

    private static string RemoveDiacritics(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(character is 'đ' or 'Đ' or 'ð' or 'Ð' ? 'D' : character);
            }
        }
        return builder.ToString().Normalize(NormalizationForm.FormC);
    }

    /// <summary>'2018-2019' cho ra '59'. Trả về rỗng nếu tên năm học không đọc được.</summary>
    private static string DeriveCohortCode(string academicYearName)
    {
        var digits = new string(academicYearName.TakeWhile(char.IsDigit).ToArray());
        return int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var yearStart)
            ? (BaseCohortNumber + (yearStart - BaseAcademicYearStart)).ToString(CultureInfo.InvariantCulture)
            : string.Empty;
    }

    private static string NormalizeCode(string? value) => (value ?? string.Empty).Trim();

    private static string NormalizeName(string? value) => (value ?? string.Empty).Trim();

    private static CohortOperationResult<T> Ok<T>(T value) => new(true, null, value);

    private static CohortOperationResult<T> Failed<T>(string errorCode) => new(false, errorCode, default);
}
