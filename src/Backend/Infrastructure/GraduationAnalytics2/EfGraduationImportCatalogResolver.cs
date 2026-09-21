using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Application.GraduationAnalytics2;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.GraduationAnalytics2;

/// <summary>
/// Đối chiếu mã lớp trong file với danh mục khoá ngành đào tạo. Mã lớp là khoá
/// duy nhất: một mã cho ra đúng một dòng "CohortMajors", từ đó suy ra khoá học,
/// ngành đào tạo và khoa viện. Không tự tạo hay sửa danh mục.
/// </summary>
public sealed partial class EfGraduationImportCatalogResolver(AppDbContext db)
    : IGraduationImportCatalogResolver
{
    private sealed record CohortMajorEntry(
        int CohortMajorId,
        string ClassKey,
        string CohortCode,
        int MajorId,
        string MajorName,
        int FacultyId,
        string FacultyName);

    public async Task<ParsedGraduationImport> ResolveAsync(
        ParsedGraduationImport parsedImport,
        CancellationToken cancellationToken)
    {
        var entries = await (
            from cohortMajor in db.CohortMajors.AsNoTracking()
            join cohort in db.Cohorts.AsNoTracking()
                on cohortMajor.CohortId equals cohort.CohortId
            join major in db.Majors.AsNoTracking()
                on cohortMajor.MajorId equals major.MajorId
            join faculty in db.Faculties.AsNoTracking()
                on major.FacultyId equals faculty.FacultyId
            select new CohortMajorEntry(
                cohortMajor.CohortMajorId,
                cohortMajor.CohortMajorCode,
                cohort.CohortCode,
                major.MajorId,
                major.MajorName,
                faculty.FacultyId,
                faculty.FacultyName))
            .ToListAsync(cancellationToken);

        if (entries.Count == 0)
        {
            throw InvalidCatalog(
                "Danh mục Khoá ngành đào tạo chưa có dữ liệu. Hãy nhập danh mục trước.");
        }

        // Tên khoá ngành chỉ duy nhất trong phạm vi một khoá, nên một mã trùng ở
        // hai khoá là không quyết được; báo lỗi thay vì đoán bừa.
        var byClassKey = new Dictionary<string, List<CohortMajorEntry>>(StringComparer.Ordinal);
        foreach (var entry in entries)
        {
            var key = NormalizeClassKey(entry.ClassKey);
            if (!byClassKey.TryGetValue(key, out var bucket))
            {
                bucket = [];
                byClassKey[key] = bucket;
            }
            bucket.Add(entry);
        }

        var reasonByClassKey = new Dictionary<string, string>(StringComparer.Ordinal);
        var resolved = new List<GraduationImportAggregate>(parsedImport.Aggregates.Count);

        foreach (var aggregate in parsedImport.Aggregates)
        {
            // Parser để mã lớp ở ProgramKey và tên lớp thô ở ProgramNameRaw.
            var classKey = NormalizeClassKey(aggregate.ProgramKey);
            if (!byClassKey.TryGetValue(classKey, out var candidates))
            {
                reasonByClassKey[classKey] =
                    $"Mã lớp '{aggregate.ProgramNameRaw}' chưa có trong danh mục Khoá ngành đào tạo";
                continue;
            }
            if (candidates.Count > 1)
            {
                reasonByClassKey[classKey] =
                    $"Mã lớp '{aggregate.ProgramNameRaw}' trùng ở nhiều khoá";
                continue;
            }

            var match = candidates[0];
            resolved.Add(aggregate with
            {
                FacultyNameRaw = match.FacultyName,
                FacultyKey = NormalizeKey(match.FacultyName),
                ProgramNameRaw = match.MajorName,
                ProgramKey = NormalizeKey(match.MajorName),
                DerivedProgramCode = match.ClassKey,
                CohortCode = match.CohortCode,
                FacultyId = match.FacultyId,
                MajorId = match.MajorId,
            });
        }

        if (reasonByClassKey.Count > 0)
        {
            // Trả về nguyên các dòng hỏng của tệp để người dùng dò thẳng trong file.
            var rowErrors = (parsedImport.SourceRows ?? [])
                .Where(row => reasonByClassKey.ContainsKey(row.ClassKey))
                .Select(row => new GraduationImportRowError(
                    row.RowNumber,
                    reasonByClassKey[row.ClassKey],
                    row.Values))
                .OrderBy(x => x.RowNumber)
                .ToList();

            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                $"Có {rowErrors.Count} dòng không đối chiếu được với danh mục Khoá ngành đào tạo.")
            {
                SourceColumns = parsedImport.SourceColumns ?? [],
                RowErrors = rowErrors,
            };
        }

        // Nhiều mã lớp có thể trỏ về cùng một khoá ngành, gộp lại thành một dòng.
        var merged = resolved
            .GroupBy(x => (x.FacultyKey, x.ProgramKey, x.CohortCode, x.GraduationRank, x.IsWorkStudy))
            .Select(group =>
            {
                var first = group.First();
                return first with { StudentCount = group.Sum(x => x.StudentCount) };
            })
            .OrderBy(x => x.FacultyKey, StringComparer.Ordinal)
            .ThenBy(x => x.ProgramKey, StringComparer.Ordinal)
            .ThenBy(x => x.CohortCode, StringComparer.Ordinal)
            .ThenBy(x => x.GraduationRank)
            .ThenBy(x => x.IsWorkStudy)
            .ToList();

        return parsedImport with { Aggregates = merged };
    }

    private static GraduationAnalyticsException InvalidCatalog(string message) =>
        new(GraduationAnalyticsErrorCodes.InvalidImport, message);

    /// <summary>
    /// Mã lớp trong file và trong danh mục dùng lẫn 'Đ' (U+0110) và 'Ð' (U+00D0),
    /// nên phải quy về cùng một ký tự trước khi so khớp.
    /// </summary>
    private static string NormalizeClassKey(string value) =>
        ClassSeparatorRegex().Replace(NormalizeKey(value), string.Empty);

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

    [GeneratedRegex(@"[\s\-_.\/]+", RegexOptions.CultureInvariant)]
    private static partial Regex ClassSeparatorRegex();
}
