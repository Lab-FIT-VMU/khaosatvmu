using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Application.GraduationAnalytics;
using ClosedXML.Excel;
using Domain;

namespace Infrastructure.GraduationAnalytics;

public sealed partial class ClosedXmlGraduationImportParser : IGraduationImportParser
{
    private const int MaximumFileSize = 10 * 1024 * 1024;
    private const int MaximumRows = 10_000;
    private const int HeaderScanLimit = 30;

    private static readonly string[] RequiredHeaderKeys =
        ["graduationRank", "classCode", "faculty", "program", "workStudy"];

    private static readonly IReadOnlyDictionary<string, string[]> HeaderAliases =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["graduationRank"] = ["loai tn", "loai tot nghiep"],
            ["classCode"] = ["lop", "ma lop"],
            ["faculty"] = ["khoa", "ten khoa"],
            ["program"] = ["chuyen nganh", "nganh", "ten chuyen nganh"],
            ["workStudy"] = ["vlvh", "vua lam vua hoc"],
        };

    private sealed record SheetMatch(IXLWorksheet Sheet, int HeaderRow, IReadOnlyDictionary<string, int> Columns);

    private sealed record AggregateKey(
        string FacultyKey,
        string ProgramKey,
        string CohortCode,
        GraduationRank GraduationRank,
        bool IsWorkStudy);

    private sealed class AggregateAccumulator(
        string facultyNameRaw,
        string programNameRaw,
        string? derivedProgramCode)
    {
        public string FacultyNameRaw { get; set; } = facultyNameRaw;
        public string ProgramNameRaw { get; set; } = programNameRaw;
        public string? DerivedProgramCode { get; set; } = derivedProgramCode;
        public int Count { get; set; }
    }

    public async Task<ParsedGraduationImport> ParseAsync(
        Stream workbookStream,
        string originalFileName,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(workbookStream);

        var bytes = await ReadWithLimitAsync(workbookStream, cancellationToken);
        var fileHash = Convert.ToHexString(SHA256.HashData(bytes));

        try
        {
            using var memory = new MemoryStream(bytes, writable: false);
            using var workbook = new XLWorkbook(memory);
            var match = FindSourceSheet(workbook);
            return ParseSheet(match, SafeFileName(originalFileName), fileHash, cancellationToken);
        }
        catch (GraduationAnalyticsException)
        {
            throw;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Không thể đọc workbook Excel. Hãy kiểm tra file không bị hỏng hoặc đặt mật khẩu.");
        }
    }

    private static ParsedGraduationImport ParseSheet(
        SheetMatch match,
        string originalFileName,
        string fileHash,
        CancellationToken cancellationToken)
    {
        var counts = new Dictionary<AggregateKey, AggregateAccumulator>();
        var skippedByClass = new Dictionary<string, List<int>>(StringComparer.OrdinalIgnoreCase);
        var sourceRowCount = 0;
        var importedRowCount = 0;
        var lastRow = match.Sheet.LastRowUsed()?.RowNumber() ?? match.HeaderRow;

        for (var rowNumber = match.HeaderRow + 1; rowNumber <= lastRow; rowNumber++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var values = RequiredHeaderKeys.ToDictionary(
                key => key,
                key => CellText(match.Sheet.Cell(rowNumber, match.Columns[key])),
                StringComparer.Ordinal);

            if (values.Values.All(string.IsNullOrWhiteSpace))
            {
                continue;
            }

            sourceRowCount++;
            foreach (var required in RequiredHeaderKeys.Where(key => key != "workStudy"))
            {
                if (string.IsNullOrWhiteSpace(values[required]))
                {
                    throw InvalidRow(rowNumber, $"Thiếu giá trị bắt buộc ở cột '{HeaderAliases[required][0]}'.");
                }
            }

            var rank = ParseRank(values["graduationRank"], rowNumber);
            var isWorkStudy = ParseWorkStudy(values["workStudy"], rowNumber);
            var classCode = NormalizeDisplayText(values["classCode"]);
            if (!TryParseClassCode(classCode, out var programCode, out var cohortCode))
            {
                if (!skippedByClass.TryGetValue(classCode, out var rows))
                {
                    rows = [];
                    skippedByClass[classCode] = rows;
                }
                rows.Add(rowNumber);
                continue;
            }

            var faculty = NormalizeDisplayText(values["faculty"]);
            var program = NormalizeDisplayText(values["program"]);
            var key = new AggregateKey(
                NormalizeKey(faculty),
                NormalizeKey(program),
                cohortCode,
                rank,
                isWorkStudy);
            if (!counts.TryGetValue(key, out var aggregate))
            {
                aggregate = new AggregateAccumulator(faculty, program, programCode);
                counts[key] = aggregate;
            }
            else
            {
                aggregate.FacultyNameRaw = FirstOrdinal(aggregate.FacultyNameRaw, faculty);
                aggregate.ProgramNameRaw = FirstOrdinal(aggregate.ProgramNameRaw, program);
                if (!string.Equals(aggregate.DerivedProgramCode, programCode, StringComparison.Ordinal))
                {
                    aggregate.DerivedProgramCode = null;
                }
            }
            aggregate.Count++;
            importedRowCount++;
        }

        if (sourceRowCount == 0)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Sheet dữ liệu không có dòng sinh viên nào.");
        }
        if (sourceRowCount > MaximumRows)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.TooManyRows,
                $"Mỗi file chỉ được có tối đa {MaximumRows:N0} dòng sinh viên.");
        }
        if (importedRowCount == 0)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Không có dòng nào đủ điều kiện import sau khi kiểm tra mã lớp.");
        }

        var aggregates = counts
            .OrderBy(x => x.Key.FacultyKey, StringComparer.Ordinal)
            .ThenBy(x => x.Key.ProgramKey, StringComparer.Ordinal)
            .ThenBy(x => x.Key.CohortCode, StringComparer.Ordinal)
            .ThenBy(x => x.Key.GraduationRank)
            .ThenBy(x => x.Key.IsWorkStudy)
            .Select(x => new GraduationImportAggregate(
                x.Value.FacultyNameRaw,
                x.Key.FacultyKey,
                x.Value.ProgramNameRaw,
                x.Key.ProgramKey,
                x.Value.DerivedProgramCode,
                x.Key.CohortCode,
                x.Key.GraduationRank,
                x.Key.IsWorkStudy,
                x.Value.Count))
            .ToList();
        var warnings = skippedByClass
            .OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase)
            .Select(x => new GraduationImportWarning(
                GraduationImportWarningCodes.CohortUnresolved,
                $"Đã bỏ {x.Value.Count} dòng vì không tách được khóa từ mã lớp '{x.Key}'.",
                match.Sheet.Name,
                x.Key,
                x.Value.AsReadOnly()))
            .ToList();

        return new ParsedGraduationImport(
            originalFileName,
            match.Sheet.Name,
            fileHash,
            sourceRowCount,
            importedRowCount,
            sourceRowCount - importedRowCount,
            aggregates,
            warnings);
    }

    private static SheetMatch FindSourceSheet(XLWorkbook workbook)
    {
        var matches = workbook.Worksheets
            .Select(TryMatchSheet)
            .Where(x => x is not null)
            .Cast<SheetMatch>()
            .ToList();
        var preferred = matches
            .Where(x => NormalizeKey(x.Sheet.Name) == "TONGHOP")
            .ToList();

        if (preferred.Count == 1)
        {
            return preferred[0];
        }
        if (preferred.Count > 1 || matches.Count > 1)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Workbook có nhiều sheet phù hợp cấu trúc dữ liệu; không thể tự chọn sheet an toàn.");
        }
        if (matches.Count == 1)
        {
            return matches[0];
        }

        throw new GraduationAnalyticsException(
            GraduationAnalyticsErrorCodes.InvalidImport,
            "Không tìm thấy sheet có đủ các cột Loại TN, Lớp, Khoa, Chuyên ngành và VLVH.");
    }

    private static SheetMatch? TryMatchSheet(IXLWorksheet sheet)
    {
        var lastColumn = Math.Min(sheet.LastColumnUsed()?.ColumnNumber() ?? 0, 100);
        var lastRow = Math.Min(sheet.LastRowUsed()?.RowNumber() ?? 0, HeaderScanLimit);
        for (var row = 1; row <= lastRow; row++)
        {
            var columns = new Dictionary<string, int>(StringComparer.Ordinal);
            for (var column = 1; column <= lastColumn; column++)
            {
                var header = NormalizeKey(CellText(sheet.Cell(row, column)));
                foreach (var alias in HeaderAliases)
                {
                    if (!columns.ContainsKey(alias.Key) &&
                        alias.Value.Any(value => NormalizeKey(value) == header))
                    {
                        columns[alias.Key] = column;
                    }
                }
            }
            if (RequiredHeaderKeys.All(columns.ContainsKey))
            {
                return new SheetMatch(sheet, row, columns);
            }
        }
        return null;
    }

    private static GraduationRank ParseRank(string value, int rowNumber) => NormalizeKey(value) switch
    {
        "XUAT SAC" => GraduationRank.Excellent,
        "GIOI" => GraduationRank.VeryGood,
        "KHA" => GraduationRank.Good,
        "TRUNG BINH" => GraduationRank.Average,
        _ => throw InvalidRow(rowNumber, $"Loại tốt nghiệp '{NormalizeDisplayText(value)}' không hợp lệ."),
    };

    private static bool ParseWorkStudy(string value, int rowNumber)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return NormalizeKey(value) switch
        {
            "X" or "1" or "TRUE" or "CO" => true,
            _ => throw InvalidRow(rowNumber, $"Giá trị VLVH '{NormalizeDisplayText(value)}' không hợp lệ."),
        };
    }

    private static bool TryParseClassCode(string value, out string? programCode, out string cohortCode)
    {
        var compact = WhitespaceRegex().Replace(value.Normalize(NormalizationForm.FormKC), string.Empty)
            .Replace('Ð', 'Đ')
            .ToUpperInvariant();
        var match = ClassCodeRegex().Match(compact);
        if (!match.Success)
        {
            programCode = null;
            cohortCode = string.Empty;
            return false;
        }

        programCode = match.Groups["program"].Value;
        cohortCode = $"K{match.Groups["cohort"].Value}";
        return true;
    }

    private static string CellText(IXLCell cell) => NormalizeDisplayText(cell.GetFormattedString());

    private static string NormalizeDisplayText(string value) =>
        WhitespaceRegex().Replace(value.Normalize(NormalizationForm.FormKC).Trim(), " ");

    private static string FirstOrdinal(string left, string right) =>
        string.CompareOrdinal(left, right) <= 0 ? left : right;

    private static string NormalizeKey(string value)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(character is 'đ' or 'Đ' ? 'D' : char.ToUpperInvariant(character));
            }
        }
        return WhitespaceRegex().Replace(builder.ToString().Normalize(NormalizationForm.FormC).Trim(), " ");
    }

    private static string SafeFileName(string value)
    {
        var fileName = Path.GetFileName(value?.Trim() ?? string.Empty);
        return string.IsNullOrWhiteSpace(fileName) ? "graduation.xlsx" : fileName;
    }

    private static async Task<byte[]> ReadWithLimitAsync(Stream source, CancellationToken cancellationToken)
    {
        using var memory = new MemoryStream();
        var buffer = new byte[81920];
        while (true)
        {
            var read = await source.ReadAsync(buffer, cancellationToken);
            if (read == 0)
            {
                return memory.ToArray();
            }
            if (memory.Length + read > MaximumFileSize)
            {
                throw new GraduationAnalyticsException(
                    GraduationAnalyticsErrorCodes.InvalidImport,
                    "File Excel không được lớn hơn 10 MB.");
            }
            await memory.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
    }

    private static GraduationAnalyticsException InvalidRow(int rowNumber, string message) =>
        new(GraduationAnalyticsErrorCodes.InvalidImport, $"Dòng {rowNumber}: {message}");

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex WhitespaceRegex();

    [GeneratedRegex(@"^(?<program>[\p{L}]{2,10})(?<cohort>\d{2})(?:ĐH|DH|CL|CH)\d{0,2}$", RegexOptions.CultureInvariant)]
    private static partial Regex ClassCodeRegex();
}
