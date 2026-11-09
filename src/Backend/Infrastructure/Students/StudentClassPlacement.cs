using System.Text.RegularExpressions;
using Application.Catalog;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Students;

/// <summary>Khóa, ngành, khoa của một sinh viên suy từ lớp hành chính.</summary>
internal sealed record StudentPlacement(int? CohortId, int? MajorId, int? FacultyId);

/// <summary>
/// Suy khóa, ngành, khoa từ lớp hành chính (ĐKT66ĐH). Dùng chung cho nạp điểm và nạp danh sách
/// sinh viên để hai luồng xếp sinh viên giống nhau.
/// </summary>
internal sealed partial class StudentClassPlacement
{
    private readonly IReadOnlyDictionary<string, StudentPlacement> byCohortMajorCode;
    private readonly IReadOnlyDictionary<string, int> cohortIdByCode;

    private StudentClassPlacement(
        IReadOnlyDictionary<string, StudentPlacement> byCohortMajorCode,
        IReadOnlyDictionary<string, int> cohortIdByCode)
    {
        this.byCohortMajorCode = byCohortMajorCode;
        this.cohortIdByCode = cohortIdByCode;
    }

    public static async Task<StudentClassPlacement> LoadAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        var cohortMajors = await (
            from cohortMajor in db.CohortMajors.AsNoTracking()
            join major in db.Majors.AsNoTracking() on cohortMajor.MajorId equals major.MajorId
            select new { cohortMajor.CohortMajorCode, cohortMajor.CohortId, cohortMajor.MajorId, major.FacultyId })
            .ToListAsync(cancellationToken);
        var byCode = new Dictionary<string, StudentPlacement>(StringComparer.Ordinal);
        foreach (var group in cohortMajors.GroupBy(x => ClassKey(x.CohortMajorCode)))
        {
            // Mã trùng ở nhiều khóa thì không đoán.
            if (group.Count() == 1)
            {
                var entry = group.Single();
                byCode[group.Key] = new StudentPlacement(entry.CohortId, entry.MajorId, entry.FacultyId);
            }
        }

        var cohorts = await db.Cohorts.AsNoTracking()
            .Select(x => new { x.CohortId, x.CohortCode })
            .ToListAsync(cancellationToken);
        var cohortIds = cohorts
            .GroupBy(x => CohortNumber(x.CohortCode))
            .Where(g => g.Key.Length > 0 && g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single().CohortId, StringComparer.Ordinal);

        return new StudentClassPlacement(byCode, cohortIds);
    }

    /// <summary>
    /// Lớp hành chính có cùng dạng với CohortMajors.CohortMajorCode: khớp thì lấy đủ khóa, ngành,
    /// khoa; không khớp thì chỉ suy khóa từ hai chữ số sau phần chữ (Cohorts.CohortCode).
    /// </summary>
    public StudentPlacement Resolve(string? classCode)
    {
        if (string.IsNullOrWhiteSpace(classCode) || CourseSectionImportRules.IsSpreadsheetError(classCode))
        {
            return new StudentPlacement(null, null, null);
        }

        var key = ClassKey(classCode);
        if (byCohortMajorCode.TryGetValue(key, out var placement))
        {
            return placement;
        }

        var match = ClassCodePattern().Match(key);
        return match.Success && cohortIdByCode.TryGetValue(match.Groups["cohort"].Value, out var cohortId)
            ? new StudentPlacement(cohortId, null, null)
            : new StudentPlacement(null, null, null);
    }

    /// <summary>Khóa theo số ("66", "K66", "Khóa 66"); không có trong danh mục thì null.</summary>
    public int? CohortIdFor(string? cohortText)
    {
        var number = CohortNumber(cohortText);
        return number.Length > 0 && cohortIdByCode.TryGetValue(number, out var id) ? id : null;
    }

    /// <summary>Phần số của mã khóa: "K66", "66", "Khóa 66" → "66".</summary>
    public static string CohortNumber(string? value)
    {
        var digits = Digits().Match(value ?? string.Empty);
        return digits.Success ? digits.Value.TrimStart('0') is { Length: > 0 } trimmed ? trimmed : "0" : string.Empty;
    }

    public static string ClassKey(string value) =>
        ClassSeparator().Replace(CourseSectionImportRules.NormalizeText(value) ?? string.Empty, string.Empty)
            .ToUpperInvariant();

    [GeneratedRegex(@"[\s\-_.\/]+")]
    private static partial Regex ClassSeparator();

    [GeneratedRegex(@"^(?<program>\p{L}{2,10})(?<cohort>\d{2})\p{L}{2}\d{0,2}$")]
    private static partial Regex ClassCodePattern();

    [GeneratedRegex(@"\d+")]
    private static partial Regex Digits();
}
