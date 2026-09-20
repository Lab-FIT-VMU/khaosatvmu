using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Catalog;

/// <summary>
/// Các tên viết tắt/cách viết cũ do hệ thống quản lý. Người dùng chỉ import danh mục chuẩn,
/// không phải biết hoặc tự duy trì quy tắc đối chiếu của các tệp nghiệp vụ.
/// </summary>
public static class CatalogImportAliasSeeder
{
    private static readonly (string FacultyName, string[] Aliases)[] FacultyDefinitions =
    [
        ("Khoa Công nghệ thông tin", ["Khoa CNTT", "CNTT"]),
        ("Khoa Điện - Điện tử", ["Khoa Điện Điện tử"]),
        ("Viện Đào tạo chất lượng cao", ["Viện CLC"]),
    ];

    private static readonly (string FacultyName, string MajorName, string[] Aliases)[] MajorDefinitions =
    [
        ("Khoa Công nghệ thông tin", "Công nghệ thông tin", ["CNTT"]),
    ];

    public static async Task SeedAsync(AppDbContext db, CancellationToken cancellationToken = default)
    {
        var faculties = await db.Faculties
            .Select(x => new { x.FacultyId, x.FacultyName })
            .ToListAsync(cancellationToken);
        var facultyByName = faculties
            .GroupBy(x => Key(x.FacultyName), StringComparer.Ordinal)
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        var facultyAliases = await db.FacultyImportAliases.ToListAsync(cancellationToken);
        foreach (var definition in FacultyDefinitions)
        {
            if (!facultyByName.TryGetValue(Key(definition.FacultyName), out var faculty))
            {
                continue;
            }

            foreach (var aliasValue in definition.Aliases)
            {
                var aliasKey = Key(aliasValue);
                var alias = facultyAliases.FirstOrDefault(x => x.NormalizedAlias == aliasKey);
                if (alias is null)
                {
                    alias = new FacultyImportAlias
                    {
                        FacultyId = faculty.FacultyId,
                        Alias = aliasValue,
                        NormalizedAlias = aliasKey,
                    };
                    db.FacultyImportAliases.Add(alias);
                    facultyAliases.Add(alias);
                }
                else
                {
                    alias.FacultyId = faculty.FacultyId;
                    alias.Alias = aliasValue;
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        var majors = await db.Majors
            .Select(x => new { x.MajorId, x.MajorName, x.FacultyId })
            .ToListAsync(cancellationToken);
        var majorById = majors.ToDictionary(x => x.MajorId);
        var majorAliases = await db.MajorImportAliases.ToListAsync(cancellationToken);
        foreach (var definition in MajorDefinitions)
        {
            if (!facultyByName.TryGetValue(Key(definition.FacultyName), out var faculty))
            {
                continue;
            }

            var major = majors.FirstOrDefault(x =>
                x.FacultyId == faculty.FacultyId && Key(x.MajorName) == Key(definition.MajorName));
            if (major is null)
            {
                continue;
            }

            foreach (var aliasValue in definition.Aliases)
            {
                var aliasKey = Key(aliasValue);
                var conflicting = majorAliases.Where(x =>
                        x.NormalizedAlias == aliasKey &&
                        x.MajorId != major.MajorId &&
                        majorById.TryGetValue(x.MajorId, out var owner) &&
                        owner.FacultyId == faculty.FacultyId)
                    .ToList();
                if (conflicting.Count > 0)
                {
                    db.MajorImportAliases.RemoveRange(conflicting);
                    foreach (var item in conflicting)
                    {
                        majorAliases.Remove(item);
                    }
                }

                var alias = majorAliases.FirstOrDefault(x =>
                    x.MajorId == major.MajorId && x.NormalizedAlias == aliasKey);
                if (alias is null)
                {
                    alias = new MajorImportAlias
                    {
                        MajorId = major.MajorId,
                        Alias = aliasValue,
                        NormalizedAlias = aliasKey,
                    };
                    db.MajorImportAliases.Add(alias);
                    majorAliases.Add(alias);
                }
                else
                {
                    alias.Alias = aliasValue;
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static string Key(string value) => EfCatalogService.NormalizeImportAlias(value);
}
