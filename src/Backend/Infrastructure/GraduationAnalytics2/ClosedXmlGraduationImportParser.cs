using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Application.GraduationAnalytics2;
using ClosedXML.Excel;
using Domain;

namespace Infrastructure.GraduationAnalytics2;

public sealed partial class ClosedXmlGraduationImportParser : IGraduationImportParser
{
    private const int HeaderScanLimit = 30;

    private static readonly string[] RequiredHeaderKeys = ["graduationRank", "classCode"];

    /// <summary>VLVH là chiều cắt ngang, thiếu cột thì coi như không có ai.</summary>
    private const string WorkStudyKey = "workStudy";

    private static readonly IReadOnlyDictionary<string, string[]> HeaderAliases =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["graduationRank"] = ["loai tn", "loai tot nghiep"],
            ["classCode"] = ["lop", "ma lop"],
            ["workStudy"] = ["vlvh", "vua lam vua hoc", "vhvl"],
        };

    private sealed record SheetMatch(IXLWorksheet Sheet, int HeaderRow, IReadOnlyDictionary<string, int> Columns);

    private sealed record AggregateKey(
        string ClassKey,
        GraduationRank GraduationRank,
        bool IsWorkStudy);

    private sealed class AggregateAccumulator(string classCodeRaw)
    {
        public string ClassCodeRaw { get; } = classCodeRaw;
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
        // Gom hết lỗi rồi mới báo một lần, để người dùng sửa cả file trong một lượt
        // thay vì nạp lại từng dòng một.
        var rowErrors = new List<GraduationImportRowError>();
        var sourceRows = new List<GraduationImportSourceRow>();
        var lastColumnUsed = match.Sheet.LastColumnUsed()?.ColumnNumber() ?? 1;
        var sourceColumns = Enumerable.Range(1, lastColumnUsed)
            .Select(column => CellText(match.Sheet.Cell(match.HeaderRow, column)))
            .ToList();
        List<string> RowValues(int rowNumber) => Enumerable.Range(1, lastColumnUsed)
            .Select(column => CellText(match.Sheet.Cell(rowNumber, column)))
            .ToList();
        var sourceRowCount = 0;
        var importedRowCount = 0;
        var lastRow = match.Sheet.LastRowUsed()?.RowNumber() ?? match.HeaderRow;

        for (var rowNumber = match.HeaderRow + 1; rowNumber <= lastRow; rowNumber++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var classCode = NormalizeDisplayText(
                CellText(match.Sheet.Cell(rowNumber, match.Columns["classCode"])));
            var rankText = CellText(match.Sheet.Cell(rowNumber, match.Columns["graduationRank"]));
            var workStudyText = match.Columns.TryGetValue(WorkStudyKey, out var workStudyColumn)
                ? CellText(match.Sheet.Cell(rowNumber, workStudyColumn))
                : string.Empty;

            if (string.IsNullOrWhiteSpace(classCode)
                && string.IsNullOrWhiteSpace(rankText)
                && string.IsNullOrWhiteSpace(workStudyText))
            {
                continue;
            }

            sourceRowCount++;
            if (string.IsNullOrWhiteSpace(classCode))
            {
                rowErrors.Add(new(rowNumber, "Thiếu giá trị ở cột Lớp", RowValues(rowNumber)));
                continue;
            }
            if (string.IsNullOrWhiteSpace(rankText))
            {
                rowErrors.Add(new(rowNumber, "Thiếu giá trị ở cột Loại TN", RowValues(rowNumber)));
                continue;
            }
            if (!TryParseRank(rankText, out var rank))
            {
                rowErrors.Add(new(rowNumber, $"Loại TN '{rankText}' không đọc được", RowValues(rowNumber)));
                continue;
            }
            if (!TryParseWorkStudy(workStudyText, out var isWorkStudy))
            {
                rowErrors.Add(new(rowNumber, $"VLVH '{workStudyText}' không đọc được", RowValues(rowNumber)));
                continue;
            }

            // Mã lớp là khoá duy nhất để gộp; khoa và ngành lấy từ danh mục khi
            // đối chiếu, không đọc từ file nữa.
            var classKey = NormalizeClassKey(classCode);
            if (classKey.Length == 0)
            {
                if (!skippedByClass.TryGetValue(classCode, out var rows))
                {
                    rows = [];
                    skippedByClass[classCode] = rows;
                }
                rows.Add(rowNumber);
                rowErrors.Add(new(rowNumber, "Mã lớp không đọc được", RowValues(rowNumber)));
                continue;
            }

            sourceRows.Add(new(rowNumber, classKey, RowValues(rowNumber)));

            var key = new AggregateKey(classKey, rank, isWorkStudy);
            if (!counts.TryGetValue(key, out var aggregate))
            {
                aggregate = new AggregateAccumulator(classCode);
                counts[key] = aggregate;
            }
            aggregate.Count++;
            importedRowCount++;
        }

        if (rowErrors.Count > 0)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                $"Sheet '{match.Sheet.Name}' có {rowErrors.Count} dòng lỗi.")
            {
                SourceColumns = sourceColumns,
                RowErrors = rowErrors,
            };
        }

        if (sourceRowCount == 0)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Sheet dữ liệu không có dòng sinh viên nào.");
        }
        if (importedRowCount == 0)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Không có dòng nào đủ điều kiện import sau khi kiểm tra mã lớp.");
        }

        var aggregates = counts
            .OrderBy(x => x.Key.ClassKey, StringComparer.Ordinal)
            .ThenBy(x => x.Key.GraduationRank)
            .ThenBy(x => x.Key.IsWorkStudy)
            .Select(x => new GraduationImportAggregate(
                string.Empty,
                string.Empty,
                x.Value.ClassCodeRaw,
                x.Key.ClassKey,
                null,
                string.Empty,
                x.Key.GraduationRank,
                x.Key.IsWorkStudy,
                x.Value.Count))
            .ToList();
        var warnings = skippedByClass
            .OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase)
            .Select(x => new GraduationImportWarning(
                GraduationImportWarningCodes.CohortUnresolved,
                $"Đã bỏ {x.Value.Count} dòng vì mã lớp '{x.Key}' không đọc được.",
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
            warnings,
            sourceColumns,
            sourceRows);
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
            "Không tìm thấy sheet có đủ hai cột Loại TN và Lớp.");
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

    private static bool TryParseRank(string value, out GraduationRank rank)
    {
        switch (NormalizeKey(value))
        {
            case "XUAT SAC": rank = GraduationRank.Excellent; return true;
            case "GIOI": rank = GraduationRank.VeryGood; return true;
            case "KHA": rank = GraduationRank.Good; return true;
            case "TRUNG BINH": rank = GraduationRank.Average; return true;
            default: rank = GraduationRank.Average; return false;
        }
    }

    private static bool TryParseWorkStudy(string value, out bool isWorkStudy)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            isWorkStudy = false;
            return true;
        }

        switch (NormalizeKey(value))
        {
            case "X" or "1" or "TRUE" or "CO": isWorkStudy = true; return true;
            case "0" or "FALSE" or "KHONG": isWorkStudy = false; return true;
            default: isWorkStudy = false; return false;
        }
    }

    private static bool TryParseClassCode(string value, out string? programCode, out string cohortCode)
    {
        var compact = ClassSeparatorRegex().Replace(value.Normalize(NormalizationForm.FormKC), string.Empty)
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

    /// <summary>
    /// Khoá so khớp mã lớp. File dùng lẫn 'Đ' (U+0110) và 'Ð' (U+00D0) nên phải
    /// quy cả hai về cùng một ký tự, nếu không cùng một lớp sẽ bị tách đôi.
    /// </summary>
    private static string NormalizeClassKey(string value) =>
        ClassSeparatorRegex().Replace(NormalizeKey(value), string.Empty);

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
        await source.CopyToAsync(memory, cancellationToken);
        return memory.ToArray();
    }

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex WhitespaceRegex();

    [GeneratedRegex(@"[\s\-_.\/]+", RegexOptions.CultureInvariant)]
    private static partial Regex ClassSeparatorRegex();

    [GeneratedRegex(@"^(?<program>[\p{L}]{2,10})(?<cohort>\d{2})(?:ĐH|DH|CL|CH)\d{0,2}$", RegexOptions.CultureInvariant)]
    private static partial Regex ClassCodeRegex();
}
