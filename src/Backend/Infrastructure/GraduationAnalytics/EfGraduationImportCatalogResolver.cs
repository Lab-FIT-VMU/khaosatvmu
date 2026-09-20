using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Application.GraduationAnalytics;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.GraduationAnalytics;

/// <summary>
/// Đối chiếu tên trong file tốt nghiệp với danh mục dùng chung. Không tự tạo hoặc sửa danh mục.
/// </summary>
public sealed partial class EfGraduationImportCatalogResolver(AppDbContext db)
    : IGraduationImportCatalogResolver
{
    private sealed record FacultyEntry(int Id, string Name);
    private sealed record MajorEntry(int Id, int FacultyId, string Code, string Name);

    public async Task<ParsedGraduationImport> ResolveAsync(
        ParsedGraduationImport parsedImport,
        CancellationToken cancellationToken)
    {
        var faculties = await db.Faculties.AsNoTracking()
            .Select(x => new FacultyEntry(x.FacultyId, x.FacultyName))
            .ToListAsync(cancellationToken);
        var majors = await db.Majors.AsNoTracking()
            .Select(x => new MajorEntry(x.MajorId, x.FacultyId, x.MajorCode, x.MajorName))
            .ToListAsync(cancellationToken);

        if (majors.Count == 0)
        {
            throw InvalidCatalog("Danh mục Ngành đào tạo chưa có dữ liệu. Hãy import danh mục ngành trước.");
        }

        var facultyById = faculties.ToDictionary(x => x.Id);
        var majorById = majors.ToDictionary(x => x.Id);
        var facultyLookup = new Dictionary<string, HashSet<int>>(StringComparer.Ordinal);
        var majorLookup = new Dictionary<(int FacultyId, string Key), HashSet<int>>();

        foreach (var faculty in faculties)
        {
            Add(facultyLookup, AliasKey(faculty.Name), faculty.Id);
        }
        foreach (var alias in await db.FacultyImportAliases.AsNoTracking().ToListAsync(cancellationToken))
        {
            Add(facultyLookup, AliasKey(alias.Alias), alias.FacultyId);
        }
        foreach (var major in majors)
        {
            Add(majorLookup, (major.FacultyId, AliasKey(major.Name)), major.Id);
        }
        foreach (var alias in await db.MajorImportAliases.AsNoTracking().ToListAsync(cancellationToken))
        {
            if (majorById.TryGetValue(alias.MajorId, out var major))
            {
                Add(majorLookup, (major.FacultyId, AliasKey(alias.Alias)), alias.MajorId);
            }
        }

        var unresolved = new List<string>();
        var resolved = new List<GraduationImportAggregate>(parsedImport.Aggregates.Count);
        foreach (var aggregate in parsedImport.Aggregates)
        {
            if (!TryGetUnique(facultyLookup, AliasKey(aggregate.FacultyNameRaw), out var facultyId) ||
                !facultyById.TryGetValue(facultyId, out var faculty))
            {
                unresolved.Add($"Khoa/viện: '{aggregate.FacultyNameRaw}'");
                continue;
            }

            if (!TryGetUnique(majorLookup, (facultyId, AliasKey(aggregate.ProgramNameRaw)), out var majorId) ||
                !majorById.TryGetValue(majorId, out var major))
            {
                unresolved.Add($"Ngành: '{aggregate.ProgramNameRaw}' ({faculty.Name})");
                continue;
            }

            if (!string.IsNullOrWhiteSpace(aggregate.DerivedProgramCode) &&
                CodeKey(aggregate.DerivedProgramCode) != CodeKey(major.Code))
            {
                unresolved.Add(
                    $"Mã lớp suy ra '{aggregate.DerivedProgramCode}' không khớp mã ngành '{major.Code}' của '{major.Name}'");
                continue;
            }

            resolved.Add(aggregate with
            {
                FacultyNameRaw = faculty.Name,
                FacultyKey = DisplayKey(faculty.Name),
                ProgramNameRaw = major.Name,
                ProgramKey = DisplayKey(major.Name),
                FacultyId = faculty.Id,
                MajorId = major.Id,
            });
        }

        if (unresolved.Count > 0)
        {
            var details = string.Join("; ", unresolved.Distinct(StringComparer.Ordinal).Take(5));
            var remaining = unresolved.Distinct(StringComparer.Ordinal).Skip(5).Count();
            throw InvalidCatalog(
                $"Không đối chiếu được file với danh mục hệ thống: {details}" +
                (remaining > 0 ? $"; và {remaining} mục khác." : ".") +
                " Hãy kiểm tra lại danh mục Ngành đào tạo hoặc quy tắc đối chiếu của hệ thống rồi thử lại.");
        }

        var merged = resolved
            .GroupBy(x => new
            {
                x.FacultyId,
                x.MajorId,
                x.CohortCode,
                x.GraduationRank,
                x.IsWorkStudy,
            })
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

    private static void Add<TKey>(Dictionary<TKey, HashSet<int>> lookup, TKey key, int id)
        where TKey : notnull
    {
        if (!lookup.TryGetValue(key, out var ids))
        {
            ids = [];
            lookup[key] = ids;
        }
        ids.Add(id);
    }

    private static bool TryGetUnique<TKey>(
        IReadOnlyDictionary<TKey, HashSet<int>> lookup,
        TKey key,
        out int id)
        where TKey : notnull
    {
        if (lookup.TryGetValue(key, out var ids) && ids.Count == 1)
        {
            id = ids.Single();
            return true;
        }
        id = 0;
        return false;
    }

    private static string AliasKey(string value) =>
        string.Concat(RemoveDiacritics(value).Where(char.IsLetterOrDigit)).ToUpperInvariant();

    private static string CodeKey(string value) => AliasKey(value.Replace('Ð', 'Đ'));

    private static string DisplayKey(string value) =>
        WhitespaceRegex().Replace(RemoveDiacritics(value).Trim(), " ").ToUpperInvariant();

    private static string RemoveDiacritics(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(character is 'đ' or 'Đ' ? 'D' : character);
            }
        }
        return builder.ToString().Normalize(NormalizationForm.FormC);
    }

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex WhitespaceRegex();
}
