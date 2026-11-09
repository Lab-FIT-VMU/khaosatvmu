using System.Text.RegularExpressions;
using Application.Catalog;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Students;

/// <summary>Kết quả tra một lớp hành chính ra khóa ngành đào tạo.</summary>
internal sealed record CohortMajorMatch(
    /// <summary>Mã lớp đã chuẩn hóa (BMM64ĐH).</summary>
    string Code,
    /// <summary>Khóa ngành đã có trong danh mục; null nếu cần tạo hoặc không suy được.</summary>
    int? CohortMajorId,
    /// <summary>Khóa, ngành để tự tạo khóa ngành khi danh mục chưa có lớp này.</summary>
    int? NewCohortId,
    int? NewMajorId,
    /// <summary>Lý do không suy được (khóa hoặc ngành chưa có trong danh mục); null nếu dùng được.</summary>
    string? Problem)
{
    public bool NeedsCreate => CohortMajorId is null && Problem is null;
}

/// <summary>
/// Tra lớp hành chính (ĐKT66ĐH) ra khóa ngành đào tạo (CohortMajors). Dùng chung cho nạp điểm và nạp
/// danh sách sinh viên. Lớp chưa có trong danh mục thì tự thêm khóa ngành khi suy được:
/// <list type="bullet">
/// <item>khóa: hai chữ số trong mã (BMM64ĐH → Khoá 64), khóa phải có trong danh mục Khóa;</item>
/// <item>ngành: cùng phần chữ + hệ ở các khóa đã có (BMM…ĐH; hệ NC là hệ CL đổi tên), không có thì theo
/// mã ngành (LKD; LKD-NC / LKD-CLC cho hệ NC, CL; ĐKT-C cho hệ CH).</item>
/// </list>
/// Khóa đã có khóa ngành cùng ngành thì dùng khóa ngành đó, không tạo trùng. Không suy được thì báo để
/// người dùng thêm ngành / khóa trước.
/// </summary>
internal sealed partial class CohortMajorLookup
{
    private readonly IReadOnlyDictionary<string, int> idByCode;
    private readonly IReadOnlyDictionary<(int CohortId, int MajorId), int> idByCohortMajor;
    private readonly IReadOnlyDictionary<string, int> majorByProgram;
    private readonly IReadOnlyDictionary<string, int> majorByCode;
    private readonly IReadOnlyDictionary<string, int> cohortByNumber;

    private CohortMajorLookup(
        IReadOnlyDictionary<string, int> idByCode,
        IReadOnlyDictionary<(int, int), int> idByCohortMajor,
        IReadOnlyDictionary<string, int> majorByProgram,
        IReadOnlyDictionary<string, int> majorByCode,
        IReadOnlyDictionary<string, int> cohortByNumber)
    {
        this.idByCode = idByCode;
        this.idByCohortMajor = idByCohortMajor;
        this.majorByProgram = majorByProgram;
        this.majorByCode = majorByCode;
        this.cohortByNumber = cohortByNumber;
    }

    public static async Task<CohortMajorLookup> LoadAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        var cohortMajors = await db.CohortMajors.AsNoTracking()
            .Select(x => new { x.CohortMajorId, x.CohortMajorCode, x.CohortId, x.MajorId })
            .ToListAsync(cancellationToken);
        var ids = cohortMajors
            .GroupBy(x => Key(x.CohortMajorCode), StringComparer.Ordinal)
            .Where(g => g.Key.Length > 0 && g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single().CohortMajorId, StringComparer.Ordinal);
        var byCohortMajor = cohortMajors
            .GroupBy(x => (x.CohortId, x.MajorId))
            .ToDictionary(g => g.Key, g => g.Min(x => x.CohortMajorId));
        var byProgram = cohortMajors
            .Select(x => (Program: ProgramKey(Key(x.CohortMajorCode)), x.MajorId))
            .Where(x => x.Program is not null)
            .GroupBy(x => x.Program!, StringComparer.Ordinal)
            .Where(g => g.Select(x => x.MajorId).Distinct().Count() == 1)
            .ToDictionary(g => g.Key, g => g.First().MajorId, StringComparer.Ordinal);

        var majors = await db.Majors.AsNoTracking().Select(x => new { x.MajorId, x.MajorCode }).ToListAsync(cancellationToken);
        var majorCodes = majors
            .GroupBy(x => Key(x.MajorCode), StringComparer.Ordinal)
            .Where(g => g.Key.Length > 0 && g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single().MajorId, StringComparer.Ordinal);

        var cohorts = await db.Cohorts.AsNoTracking().Select(x => new { x.CohortId, x.CohortCode }).ToListAsync(cancellationToken);
        var cohortNumbers = cohorts
            .Select(x => (Number: Digits().Match(x.CohortCode).Value, x.CohortId))
            .Where(x => x.Number.Length > 0)
            .GroupBy(x => x.Number, StringComparer.Ordinal)
            .Where(g => g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single().CohortId, StringComparer.Ordinal);

        return new CohortMajorLookup(ids, byCohortMajor, byProgram, majorCodes, cohortNumbers);
    }

    /// <summary>Mã khóa ngành đã có của lớp, hoặc null.</summary>
    public int? Find(string? classCode) => Match(classCode) is { CohortMajorId: { } id } ? id : null;

    /// <summary>Tra lớp: khóa ngành đã có, khóa ngành cần tạo, hoặc lý do không suy được. Lớp trống → null.</summary>
    public CohortMajorMatch? Match(string? classCode)
    {
        if (string.IsNullOrWhiteSpace(classCode) || CourseSectionImportRules.IsSpreadsheetError(classCode)) return null;
        var key = Key(classCode);
        if (key.Length == 0) return null;
        if (idByCode.TryGetValue(key, out var existing)) return new CohortMajorMatch(key, existing, null, null, null);

        var match = ClassPattern().Match(key);
        if (!match.Success)
        {
            return new CohortMajorMatch(key, null, null, null, "Mã lớp không theo dạng mã ngành + khóa + hệ (ví dụ ĐKT66ĐH).");
        }
        var cohortNumber = match.Groups["cohort"].Value;
        if (!cohortByNumber.TryGetValue(cohortNumber.TrimStart('0') is { Length: > 0 } n ? n : cohortNumber, out var cohortId)
            && !cohortByNumber.TryGetValue(cohortNumber, out cohortId))
        {
            return new CohortMajorMatch(key, null, null, null, $"Khóa {cohortNumber} chưa có trong danh mục Khóa.");
        }

        var program = match.Groups["program"].Value;
        var system = match.Groups["system"].Value;
        if (FindMajor(program, system) is not { } majorId)
        {
            return new CohortMajorMatch(key, null, null, null, $"Ngành {program} (hệ {system}) chưa có trong danh mục Ngành đào tạo.");
        }

        // Khóa đã có khóa ngành cùng ngành (mã khác) thì dùng luôn, không tạo trùng.
        return idByCohortMajor.TryGetValue((cohortId, majorId), out var sameMajor)
            ? new CohortMajorMatch(key, sameMajor, null, null, null)
            : new CohortMajorMatch(key, null, cohortId, majorId, null);
    }

    private int? FindMajor(string program, string system)
    {
        var normalizedSystem = system == "NC" ? "CL" : system;
        if (majorByProgram.TryGetValue($"{program}|{normalizedSystem}", out var fromCatalog)) return fromCatalog;

        string[] candidates = normalizedSystem switch
        {
            "CL" => [$"{program}NC", $"{program}CLC", $"{program}CL"],
            "CH" => [$"{program}C", program],
            _ => [program],
        };
        foreach (var code in candidates)
        {
            if (majorByCode.TryGetValue(code, out var id)) return id;
        }
        return null;
    }

    /// <summary>
    /// Tạo các khóa ngành còn thiếu (sĩ số đầu vào 0, sửa sau ở trang Khoá ngành đào tạo); trả mã lớp →
    /// mã khóa ngành vừa tạo. Gọi trong transaction của lần nạp.
    /// </summary>
    public static async Task<Dictionary<string, int>> CreateMissingAsync(
        AppDbContext db, IEnumerable<CohortMajorMatch> matches, CancellationToken cancellationToken)
    {
        var created = new Dictionary<string, CohortMajor>(StringComparer.Ordinal);
        var byPair = new Dictionary<(int, int), CohortMajor>();
        foreach (var m in matches.Where(x => x.NeedsCreate))
        {
            if (created.ContainsKey(m.Code)) continue;
            var pair = (m.NewCohortId!.Value, m.NewMajorId!.Value);
            if (byPair.TryGetValue(pair, out var same))
            {
                created[m.Code] = same;
                continue;
            }
            var entity = new CohortMajor { CohortMajorCode = m.Code, CohortId = pair.Item1, MajorId = pair.Item2 };
            db.CohortMajors.Add(entity);
            created[m.Code] = entity;
            byPair[pair] = entity;
        }
        if (created.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        return created.ToDictionary(x => x.Key, x => x.Value.CohortMajorId, StringComparer.Ordinal);
    }

    /// <summary>Dạng chuẩn của mã lớp: Ð → Đ, bỏ khoảng trắng và dấu nối, viết hoa.</summary>
    public static string Key(string value) =>
        Separator().Replace(CourseSectionImportRules.NormalizeText(value) ?? string.Empty, string.Empty).ToUpperInvariant();

    private static string? ProgramKey(string classKey)
    {
        var match = ClassPattern().Match(classKey);
        if (!match.Success) return null;
        var system = match.Groups["system"].Value;
        return $"{match.Groups["program"].Value}|{(system == "NC" ? "CL" : system)}";
    }

    [GeneratedRegex(@"[\s\-_.\/]+")]
    private static partial Regex Separator();

    [GeneratedRegex(@"^(?<program>\p{L}{2,10})(?<cohort>\d{2})(?<system>\p{L}{2})\d{0,2}$")]
    private static partial Regex ClassPattern();

    [GeneratedRegex(@"\d+")]
    private static partial Regex Digits();
}
