using System.Text.RegularExpressions;
using Application.Catalog;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Students;

/// <summary>
/// Tra lớp hành chính (ĐKT66ĐH) ra khóa ngành đào tạo (CohortMajors), khớp đúng mã sau khi chuẩn hóa:
/// Ð → Đ, bỏ khoảng trắng và dấu nối, viết hoa. Dùng chung cho nạp điểm và nạp danh sách sinh viên.
/// Lớp chưa có trong danh mục thì không tự tạo: người dùng thêm ở trang Khoá ngành đào tạo.
/// </summary>
internal sealed partial class CohortMajorLookup
{
    private readonly IReadOnlyDictionary<string, int> idByCode;

    private CohortMajorLookup(IReadOnlyDictionary<string, int> idByCode) => this.idByCode = idByCode;

    public static async Task<CohortMajorLookup> LoadAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        var rows = await db.CohortMajors.AsNoTracking()
            .Select(x => new { x.CohortMajorId, x.CohortMajorCode })
            .ToListAsync(cancellationToken);
        var ids = rows
            .GroupBy(x => Key(x.CohortMajorCode), StringComparer.Ordinal)
            .Where(g => g.Key.Length > 0 && g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single().CohortMajorId, StringComparer.Ordinal);
        return new CohortMajorLookup(ids);
    }

    /// <summary>Mã khóa ngành của lớp, hoặc null nếu lớp trống hay chưa có trong danh mục.</summary>
    public int? Find(string? classCode)
    {
        if (string.IsNullOrWhiteSpace(classCode) || CourseSectionImportRules.IsSpreadsheetError(classCode)) return null;
        return idByCode.TryGetValue(Key(classCode), out var id) ? id : null;
    }

    /// <summary>Dạng hiển thị chuẩn của mã lớp: Ð → Đ, bỏ khoảng trắng và dấu nối, viết hoa.</summary>
    public static string Key(string value) =>
        Separator().Replace(CourseSectionImportRules.NormalizeText(value) ?? string.Empty, string.Empty).ToUpperInvariant();

    [GeneratedRegex(@"[\s\-_.\/]+")]
    private static partial Regex Separator();
}
