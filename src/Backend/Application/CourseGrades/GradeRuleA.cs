using System.Globalization;
using System.Text.RegularExpressions;
using Application.Catalog;

namespace Application.CourseGrades;

/// <summary>Một dòng của file điểm sau khi áp bộ luật A. Điểm là số thập phân chính xác.</summary>
public sealed record GradeRuleARow(
    int RowNumber,
    string StudentCode,
    string? StudentName,
    string? AdministrativeClassCode,
    string? TermCode,
    string CourseCode,
    string? CourseName,
    string? SectionName,
    string? AcademicYearText,
    string? TermText,
    string? ExamRound,
    string? NoteCode,
    decimal? Component1,
    decimal? Component2,
    decimal? Component3,
    decimal? ExamScore,
    decimal? OfficialTotal,
    decimal? X,
    decimal? Y,
    decimal? Z,
    /// <summary>L1–L8 hoặc T (trùng); null là dòng được dùng.</summary>
    string? ExclusionRule);

/// <summary>Kết quả áp bộ luật A lên cả file.</summary>
public sealed record GradeRuleAResult(
    IReadOnlyList<GradeRuleARow> Rows,
    int SourceRowCount,
    /// <summary>Số dòng bị loại theo từng luật, gồm cả "T" (trùng) và "E" (dòng không đọc được).</summary>
    IReadOnlyDictionary<string, int> ExcludedCounts,
    /// <summary>Số dòng không đọc được (thiếu mã SV / mã học phần, ô điểm không phải số). Không lưu.</summary>
    IReadOnlyList<int> UnreadableRowNumbers,
    /// <summary>Giá trị f_nhhk gặp nhiều nhất, để cảnh báo khi người dùng chọn nhầm kỳ.</summary>
    string? MostCommonTermCode)
{
    public int UsableRowCount => Rows.Count(x => x.ExclusionRule is null);
}

/// <summary>
/// Bộ luật A – xử lý file "Điểm học tập của SV theo kỳ", viết sẵn trong code.
/// Nguồn: Data/Bo luat/BO_LUAT_XU_LY_DIEM_HOC_TAP.md; bản tham chiếu: xu_ly/luat_a.py.
/// Trên 4 file thật (431.884 dòng) bản này phải ra đúng số dòng giữ / loại của bản Python
/// (xem docs/plans/tich-hop-phan-tich-diem-hoc-phan.md mục 8.1).
/// </summary>
public static partial class GradeRuleA
{
    /// <summary>Tăng khi đổi bất kỳ luật nào bên dưới; lưu vào từng lần nạp.</summary>
    public const short RuleVersion = 1;

    /// <summary>Luật 2: có điểm thành phần dưới ngưỡng này thì X = 0 (cấm thi).</summary>
    public const decimal ComponentThreshold = 4m;

    /// <summary>Luật 4: điểm thi dưới ngưỡng này thì Z = 0.</summary>
    public const decimal ExamPassThreshold = 4m;

    /// <summary>Mã dòng không đọc được. Không phải luật của bộ luật A; dòng này không được lưu.</summary>
    public const string UnreadableRule = "E";

    public const string DuplicateRule = "T";

    public static readonly IReadOnlyDictionary<string, string> RuleDescriptions = new Dictionary<string, string>
    {
        ["L1"] = "Môn giáo dục thể chất (điểm thi ghi −1)",
        ["L2"] = "Sinh viên được miễn học phần (ghi chú M)",
        ["L3"] = "Sinh viên bảo lưu điểm (ghi chú B)",
        ["L4"] = "Học phần quốc phòng – an ninh (mã 24…)",
        ["L5"] = "Giáo dục thể chất còn sót (mã 27…)",
        ["L6"] = "Học phần thực tập, tốt nghiệp",
        ["L7"] = "Không có điểm quá trình",
        ["L8"] = "Học phần thuộc bộ môn thực tập/đồ án tốt nghiệp (mã 179…)",
        [DuplicateRule] = "Dòng trùng sinh viên × học phần (giữ dòng có điểm thi cao nhất)",
        [UnreadableRule] = "Dòng không đọc được (thiếu mã sinh viên, mã học phần hoặc ô điểm không phải số)",
    };

    /// <summary>Cột bắt buộc (tên cột không phân biệt hoa/thường, luật N1).</summary>
    public static readonly IReadOnlyList<string> RequiredColumns =
    [
        "f_nhhk", "f_masv", "f_mamh", "f_tenmh", "f_diem1", "f_diem2", "f_diem3", "f_diemthi", "f_loptc",
    ];

    /// <summary>
    /// Áp bộ luật A lên các dòng của sheet đầu tiên. Mỗi dòng là ánh xạ tên cột (viết thường) →
    /// giá trị ô: <see cref="double"/> với ô số, <see cref="string"/> với ô chữ, null với ô trống.
    /// </summary>
    public static GradeRuleAResult Process(IEnumerable<(int RowNumber, IReadOnlyDictionary<string, object?> Cells)> rows)
    {
        var processed = new List<GradeRuleARow>();
        var excluded = new Dictionary<string, int>();
        var unreadable = new List<int>();
        var termCodes = new Dictionary<string, int>();
        // Luật chống trùng mục 4: khóa (mã SV, mã học phần) sau khi áp luật loại dòng.
        var bestIndexByKey = new Dictionary<(string Student, string Course), int>();
        var sourceRowCount = 0;

        foreach (var (rowNumber, cells) in rows)
        {
            sourceRowCount++;
            var termCode = TermCodeText(Cell(cells, "f_nhhk"));
            if (termCode is not null)
            {
                termCodes[termCode] = termCodes.GetValueOrDefault(termCode) + 1;
            }

            GradeRuleARow row;
            try
            {
                row = ProcessRow(rowNumber, cells, termCode);
            }
            catch (FormatException)
            {
                Count(excluded, UnreadableRule);
                unreadable.Add(rowNumber);
                continue;
            }

            if (row.StudentCode.Length == 0 || row.CourseCode.Length == 0)
            {
                Count(excluded, UnreadableRule);
                unreadable.Add(rowNumber);
                continue;
            }

            if (row.ExclusionRule is not null)
            {
                Count(excluded, row.ExclusionRule);
                processed.Add(row);
                continue;
            }

            var key = (row.StudentCode, row.CourseCode);
            if (bestIndexByKey.TryGetValue(key, out var bestIndex))
            {
                Count(excluded, DuplicateRule);
                var best = processed[bestIndex];
                if (row.Y > best.Y)
                {
                    processed[bestIndex] = best with { ExclusionRule = DuplicateRule };
                    bestIndexByKey[key] = processed.Count;
                    processed.Add(row);
                }
                else
                {
                    processed.Add(row with { ExclusionRule = DuplicateRule });
                }
                continue;
            }

            bestIndexByKey[key] = processed.Count;
            processed.Add(row);
        }

        var mostCommonTerm = termCodes.Count == 0 ? null : termCodes.MaxBy(x => x.Value).Key;
        return new GradeRuleAResult(processed, sourceRowCount, excluded, unreadable, mostCommonTerm);
    }

    private static GradeRuleARow ProcessRow(int rowNumber, IReadOnlyDictionary<string, object?> cells, string? termCode)
    {
        var courseCode = CourseCodeText(Cell(cells, "f_mamh")) ?? string.Empty;
        var courseName = CourseSectionImportRules.NormalizeText(Text(Cell(cells, "f_tenmh")));
        var note = CourseSectionImportRules.NormalizeText(Text(Cell(cells, "f_ghichu")))?.ToUpperInvariant();
        if (note?.Length == 0)
        {
            note = null;
        }

        var d1 = Number(Cell(cells, "f_diem1"));
        var d2 = Number(Cell(cells, "f_diem2"));
        var d3 = Number(Cell(cells, "f_diem3"));
        var exam = Number(Cell(cells, "f_diemthi"));

        var row = new GradeRuleARow(
            rowNumber,
            StudentCodeText(Cell(cells, "f_masv")),
            CourseSectionImportRules.NormalizeText(Text(Cell(cells, "f_tensv"))),
            CourseSectionImportRules.NormalizeText(Text(Cell(cells, "f_tenlop"))),
            termCode,
            courseCode,
            courseName,
            NullIfEmpty(CourseSectionImportRules.NormalizeText(Text(Cell(cells, "f_loptc")))),
            CourseSectionImportRules.NormalizeText(Text(Cell(cells, "f_namhoc"))),
            CourseSectionImportRules.NormalizeText(Text(Cell(cells, "f_hocky"))),
            CourseSectionImportRules.NormalizeText(Text(Cell(cells, "f_dot"))),
            note,
            d1, d2, d3, exam,
            Number(Cell(cells, "f_tbcht")),
            X: null, Y: null, Z: null,
            ExclusionRule: null);

        if (courseCode.Length == 0)
        {
            return row;
        }

        var rule = ExclusionReason(courseCode, courseName, note, exam, d1, d2, d3);
        if (rule is not null)
        {
            return row with { ExclusionRule = rule };
        }

        // Luật 1: X = trung bình các điểm thành phần đang có. Luật 2: có điểm < 4 thì X = 0.
        decimal?[] components = [d1, d2, d3];
        var present = components.Where(x => x.HasValue).Select(x => x!.Value).ToList();
        var x = present.Sum() / present.Count;
        if (present.Any(value => value < ComponentThreshold))
        {
            x = 0m;
        }

        // Luật 3: thiếu điểm thi, mất tư cách hoặc vắng thi (V) thì Y = 0.
        var y = exam ?? 0m;
        if (x == 0m || note == "V")
        {
            y = 0m;
        }

        // Luật 4: Y < 4 thì Z = 0; ngược lại Z = 0,5X + 0,5Y (X chưa làm tròn).
        var z = y < ExamPassThreshold ? 0m : RoundHalfUp(0.5m * x + 0.5m * y);
        return row with { X = RoundHalfUp(x), Y = y, Z = z };
    }

    /// <summary>Thứ tự luật loại dòng (mục 2): dòng bị loại ở luật nào thì dừng ở luật đó.</summary>
    public static string? ExclusionReason(
        string courseCode, string? courseName, string? note, decimal? exam, decimal? d1, decimal? d2, decimal? d3)
    {
        if (exam == -1m) return "L1";
        if (note == "M") return "L2";
        if (note == "B") return "L3";
        if (courseCode.StartsWith("24", StringComparison.Ordinal)) return "L4";
        if (PhysicalEducationCode().IsMatch(courseCode)) return "L5";
        var lower = (courseName ?? string.Empty).ToLowerInvariant();
        if (lower.Contains("thực tập", StringComparison.Ordinal) || lower.Contains("tốt nghiệp", StringComparison.Ordinal)) return "L6";
        if (d1 is null && d2 is null && d3 is null) return "L7";
        if (courseCode.StartsWith("179", StringComparison.Ordinal)) return "L8";
        return null;
    }

    /// <summary>
    /// Làm tròn half-up 1 chữ số (mục 3.5), như lam_tron của bản Python: làm tròn 6 chữ số
    /// trước để khử sai số, rồi mới làm tròn 1 chữ số kiểu half-up (6,25 → 6,3).
    /// </summary>
    public static decimal RoundHalfUp(decimal value) =>
        Math.Round(Math.Round(value, 6, MidpointRounding.ToEven), 1, MidpointRounding.AwayFromZero);

    /// <summary>Ô điểm (luật N2): trống → null; chuỗi dấu phẩy "5,7" → 5,7. Không phải số thì báo lỗi dòng.</summary>
    public static decimal? Number(object? value)
    {
        switch (value)
        {
            case null:
                return null;
            case double d:
                return (decimal)d;
            case string s:
                var text = s.Trim();
                if (text.Length == 0) return null;
                return decimal.Parse(text.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture);
            default:
                return Convert.ToDecimal(value, CultureInfo.InvariantCulture);
        }
    }

    /// <summary>Mã học phần (N3): in hoa, bỏ ".0" khi Excel lưu dạng số.</summary>
    public static string? CourseCodeText(object? value)
    {
        var text = value switch
        {
            null => null,
            double d when d == Math.Floor(d) => ((long)d).ToString(CultureInfo.InvariantCulture),
            double d => d.ToString(CultureInfo.InvariantCulture),
            _ => Text(value),
        };
        return CourseSectionImportRules.NormalizeText(text)?.ToUpperInvariant();
    }

    /// <summary>Mã sinh viên (N3): số nguyên Excel → chuỗi không có ".0"; cắt khoảng trắng.</summary>
    public static string StudentCodeText(object? value) => value switch
    {
        null => string.Empty,
        double d when d == Math.Floor(d) => ((long)d).ToString(CultureInfo.InvariantCulture),
        double d => d.ToString(CultureInfo.InvariantCulture),
        _ => (Text(value) ?? string.Empty).Trim(),
    };

    private static string? TermCodeText(object? value) => value switch
    {
        null => null,
        double d => ((long)Math.Floor(d)).ToString(CultureInfo.InvariantCulture),
        _ => Text(value)?.Trim().Split('.')[0],
    };

    private static string? Text(object? value) => value switch
    {
        null => null,
        string s => s,
        double d => d.ToString(CultureInfo.InvariantCulture),
        _ => Convert.ToString(value, CultureInfo.InvariantCulture),
    };

    private static object? Cell(IReadOnlyDictionary<string, object?> cells, string column) =>
        cells.TryGetValue(column, out var value) ? value : null;

    private static string? NullIfEmpty(string? value) => string.IsNullOrEmpty(value) ? null : value;

    private static void Count(Dictionary<string, int> counts, string key) =>
        counts[key] = counts.GetValueOrDefault(key) + 1;

    /// <summary>Luật L5: mã dạng 27xxx (đúng 5 chữ số, bắt đầu 27), như RE_THE_CHAT = 27\d{3}$.</summary>
    [GeneratedRegex(@"^27\d{3}$")]
    private static partial Regex PhysicalEducationCode();
}
