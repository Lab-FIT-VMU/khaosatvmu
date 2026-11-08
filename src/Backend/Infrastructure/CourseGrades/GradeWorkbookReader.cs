using System.Globalization;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;

namespace Infrastructure.CourseGrades;

/// <summary>Sheet đầu tiên của file điểm, đọc theo kiểu luồng.</summary>
public sealed record GradeWorkbookSheet(
    string SheetName,
    IReadOnlyList<string> Headers,
    IEnumerable<(int RowNumber, IReadOnlyDictionary<string, object?> Cells)> Rows);

/// <summary>
/// Đọc file "Điểm học tập của SV theo kỳ" (khoảng 100–117 nghìn dòng mỗi kỳ) theo luồng bằng
/// OpenXmlReader thay vì nạp cả workbook như ClosedXML, để không vượt trần bộ nhớ của API.
///
/// Chỉ đọc sheet đầu tiên: tên sheet mỗi kỳ một kiểu ("tong hop diem1", "Diem HK2 2024-2025"…).
/// Ô số trả về <see cref="double"/>, ô chữ trả về <see cref="string"/>, ô trống không có trong
/// ánh xạ. Tên cột viết thường và cắt khoảng trắng (luật N1). Không ghi gì ra đĩa.
/// </summary>
public static class GradeWorkbookReader
{
    public static GradeWorkbookSheet ReadFirstSheet(SpreadsheetDocument document)
    {
        var workbookPart = document.WorkbookPart
            ?? throw new InvalidDataException("File không có workbook.");
        var sheet = workbookPart.Workbook.Sheets?.Elements<Sheet>().FirstOrDefault()
            ?? throw new InvalidDataException("File không có sheet nào.");
        var worksheetPart = (WorksheetPart)workbookPart.GetPartById(sheet.Id!.Value!);
        var sharedStrings = LoadSharedStrings(workbookPart);

        var rows = ReadRows(worksheetPart, sharedStrings).GetEnumerator();
        if (!rows.MoveNext())
        {
            rows.Dispose();
            return new GradeWorkbookSheet(sheet.Name?.Value ?? string.Empty, [], []);
        }

        var headerRow = rows.Current.Cells;
        var lastColumn = headerRow.Count == 0 ? -1 : headerRow.Keys.Max();
        var headers = Enumerable.Range(0, lastColumn + 1)
            .Select(index => headerRow.TryGetValue(index, out var value) && value is not null
                ? Convert.ToString(value, CultureInfo.InvariantCulture)!.Trim().ToLowerInvariant()
                : string.Empty)
            .ToList();

        return new GradeWorkbookSheet(sheet.Name?.Value ?? string.Empty, headers, MapRows(rows, headers));
    }

    private static IEnumerable<(int RowNumber, IReadOnlyDictionary<string, object?> Cells)> MapRows(
        IEnumerator<(int RowNumber, Dictionary<int, object?> Cells)> rows,
        IReadOnlyList<string> headers)
    {
        using (rows)
        {
            while (rows.MoveNext())
            {
                var (rowNumber, cells) = rows.Current;
                // Dòng trống hoàn toàn thì bỏ, như bản Python.
                if (cells.Values.All(value => value is null))
                {
                    continue;
                }

                var mapped = new Dictionary<string, object?>(headers.Count);
                foreach (var (column, value) in cells)
                {
                    if (column < headers.Count && headers[column].Length > 0)
                    {
                        mapped[headers[column]] = value;
                    }
                }
                yield return (rowNumber, mapped);
            }
        }
    }

    private static IEnumerable<(int RowNumber, Dictionary<int, object?> Cells)> ReadRows(
        WorksheetPart worksheetPart,
        IReadOnlyList<string> sharedStrings)
    {
        using var reader = OpenXmlReader.Create(worksheetPart);
        var fallbackRowNumber = 0;
        while (reader.Read())
        {
            if (reader.ElementType != typeof(Row) || !reader.IsStartElement)
            {
                continue;
            }

            var row = (Row)reader.LoadCurrentElement()!;
            fallbackRowNumber++;
            var rowNumber = row.RowIndex?.Value is { } index ? (int)index : fallbackRowNumber;
            fallbackRowNumber = rowNumber;
            var cells = new Dictionary<int, object?>();
            var nextColumn = 0;
            foreach (var cell in row.Elements<Cell>())
            {
                var column = cell.CellReference?.Value is { } reference ? ColumnIndex(reference) : nextColumn;
                nextColumn = column + 1;
                cells[column] = CellValue(cell, sharedStrings);
            }
            yield return (rowNumber, cells);
        }
    }

    private static object? CellValue(Cell cell, IReadOnlyList<string> sharedStrings)
    {
        var type = cell.DataType?.Value;
        if (type == CellValues.InlineString)
        {
            return cell.InlineString?.InnerText;
        }

        var raw = cell.CellValue?.Text;
        if (raw is null)
        {
            return null;
        }

        if (type == CellValues.SharedString)
        {
            return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var index)
                && index >= 0 && index < sharedStrings.Count
                    ? sharedStrings[index]
                    : null;
        }

        if (type == CellValues.String || type == CellValues.Error)
        {
            return raw;
        }

        if (type == CellValues.Boolean)
        {
            return raw == "1" ? 1d : 0d;
        }

        // Ô số (không ghi kiểu) hoặc ngày tháng: giữ số như openpyxl data_only.
        return double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var number)
            ? number
            : raw;
    }

    private static List<string> LoadSharedStrings(WorkbookPart workbookPart)
    {
        var part = workbookPart.SharedStringTablePart;
        var result = new List<string>();
        if (part is null)
        {
            return result;
        }

        using var reader = OpenXmlReader.Create(part);
        while (reader.Read())
        {
            if (reader.ElementType == typeof(SharedStringItem) && reader.IsStartElement)
            {
                result.Add(((SharedStringItem)reader.LoadCurrentElement()!).InnerText);
            }
        }
        return result;
    }

    /// <summary>"A1" → 0, "P12" → 15, "AA3" → 26.</summary>
    private static int ColumnIndex(string reference)
    {
        var index = 0;
        foreach (var ch in reference)
        {
            if (!char.IsAsciiLetter(ch))
            {
                break;
            }
            index = index * 26 + (char.ToUpperInvariant(ch) - 'A' + 1);
        }
        return index - 1;
    }
}
