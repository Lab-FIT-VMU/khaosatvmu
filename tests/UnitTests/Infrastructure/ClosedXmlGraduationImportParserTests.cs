namespace UnitTests.InfrastructureTests;

using Application.GraduationAnalytics;
using ClosedXML.Excel;
using Domain;
using FluentAssertions;
using Infrastructure.GraduationAnalytics;
using Xunit;

public sealed class ClosedXmlGraduationImportParserTests
{
    private readonly ClosedXmlGraduationImportParser _parser = new();

    [Fact]
    public async Task ParseAsync_AggregatesRowsAndReportsUnresolvedCohortWithoutPii()
    {
        using var stream = CreateWorkbook(workbook =>
        {
            AddSourceSheet(workbook, "TongHop",
                ["Xuất sắc", "KPM61ĐH", "Công nghệ thông tin", "Kỹ thuật phần mềm", ""],
                ["Xuất sắc", "KPM61ÐH", "Công nghệ thông tin", "Kỹ thuật phần mềm", ""],
                ["Khá", "CNT62CL", "Công nghệ thông tin", "Công nghệ thông tin", "X"],
                ["Trung bình", "IBL05", "Kinh tế", "Kinh doanh quốc tế", "X"]);
        });

        var result = await _parser.ParseAsync(stream, @"C:\upload\danh-sach.xlsx", CancellationToken.None);

        result.OriginalFileName.Should().Be("danh-sach.xlsx");
        result.SourceSheetName.Should().Be("TongHop");
        result.SourceRowCount.Should().Be(4);
        result.ImportedRowCount.Should().Be(3);
        result.SkippedRowCount.Should().Be(1);
        result.FileHash.Should().MatchRegex("^[0-9A-F]{64}$");

        result.Aggregates.Should().HaveCount(2);
        result.Aggregates.Should().ContainEquivalentOf(new GraduationImportAggregate(
            "Công nghệ thông tin",
            "CONG NGHE THONG TIN",
            "Kỹ thuật phần mềm",
            "KY THUAT PHAN MEM",
            "KPM",
            "K61",
            GraduationRank.Excellent,
            false,
            2));
        result.Aggregates.Should().ContainEquivalentOf(new GraduationImportAggregate(
            "Công nghệ thông tin",
            "CONG NGHE THONG TIN",
            "Công nghệ thông tin",
            "CONG NGHE THONG TIN",
            "CNT",
            "K62",
            GraduationRank.Good,
            true,
            1));

        var warning = result.Warnings.Should().ContainSingle().Subject;
        warning.Code.Should().Be(GraduationImportWarningCodes.CohortUnresolved);
        warning.ClassCode.Should().Be("IBL05");
        warning.SourceRowNumbers.Should().Equal(5);
        warning.Message.Should().NotContain("Kinh doanh quốc tế");
    }

    [Fact]
    public async Task ParseAsync_PrefersTongHopAndIgnoresSupplementalSheets()
    {
        using var stream = CreateWorkbook(workbook =>
        {
            AddSourceSheet(workbook, "TongHop",
                ["Giỏi", "KTB62ĐH", "Kinh tế", "Kế toán", ""]);
            AddSourceSheet(workbook, "THU KHOA",
                ["Xuất sắc", "KPM62ĐH", "Công nghệ thông tin", "Kỹ thuật phần mềm", ""]);
        });

        var result = await _parser.ParseAsync(stream, "source.xlsx", CancellationToken.None);

        result.SourceSheetName.Should().Be("TongHop");
        result.ImportedRowCount.Should().Be(1);
        result.Aggregates.Should().ContainSingle(x => x.CohortCode == "K62" && x.GraduationRank == GraduationRank.VeryGood);
    }

    [Fact]
    public async Task ParseAsync_RejectsUnknownWorkStudyValueWithSourceRow()
    {
        using var stream = CreateWorkbook(workbook =>
        {
            AddSourceSheet(workbook, "TongHop",
                ["Khá", "KPM62ĐH", "Công nghệ thông tin", "Kỹ thuật phần mềm", "không rõ"]);
        });

        var action = () => _parser.ParseAsync(stream, "source.xlsx", CancellationToken.None);

        var exception = await action.Should().ThrowAsync<GraduationAnalyticsException>();
        exception.Which.ErrorCode.Should().Be(GraduationAnalyticsErrorCodes.InvalidImport);
        exception.Which.Message.Should().Contain("Dòng 2").And.Contain("VLVH");
    }

    [Fact]
    public async Task ParseAsync_DoesNotCountFormattedEmptyRows()
    {
        using var stream = CreateWorkbook(workbook =>
        {
            var sheet = AddSourceSheet(workbook, "TongHop",
                ["Trung bình", "MKT50ĐH3", "Kinh tế", "Marketing", "1"]);
            sheet.Cell(1000, 1).Style.Fill.BackgroundColor = XLColor.Yellow;
        });

        var result = await _parser.ParseAsync(stream, "source.xlsx", CancellationToken.None);

        result.SourceRowCount.Should().Be(1);
        result.ImportedRowCount.Should().Be(1);
        result.Aggregates.Should().ContainSingle(x =>
            x.DerivedProgramCode == "MKT" &&
            x.CohortCode == "K50" &&
            x.IsWorkStudy);
    }

    [Theory]
    [InlineData("CNT-63-CL")]
    [InlineData("CNT 63 CL")]
    [InlineData("CNT_63.CL")]
    public async Task ParseAsync_AcceptsCommonClassCodeSeparators(string classCode)
    {
        using var stream = CreateWorkbook(workbook =>
        {
            AddSourceSheet(workbook, "TongHop",
                ["Khá", classCode, "Viện Đào tạo chất lượng cao", "Công nghệ thông tin (NC)", ""]);
        });

        var result = await _parser.ParseAsync(stream, "source.xlsx", CancellationToken.None);

        result.Aggregates.Should().ContainSingle(x =>
            x.DerivedProgramCode == "CNT" && x.CohortCode == "K63");
    }

    [Fact]
    public async Task ParseAsync_RealSampleRegression_WhenSampleDirectoryIsProvided()
    {
        var sampleDirectory = Environment.GetEnvironmentVariable("GRADUATION_SAMPLE_DIR");
        if (string.IsNullOrWhiteSpace(sampleDirectory) || !Directory.Exists(sampleDirectory))
        {
            return;
        }

        var results = new List<ParsedGraduationImport>();
        foreach (var path in Directory.GetFiles(sampleDirectory, "*.xlsx")
                     .Where(path => !Path.GetFileName(path).StartsWith("~$", StringComparison.Ordinal))
                     .OrderBy(x => x))
        {
            await using var stream = new FileStream(
                path,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete);
            results.Add(await _parser.ParseAsync(stream, Path.GetFileName(path), CancellationToken.None));
        }

        results.Should().HaveCount(11);
        results.Sum(x => x.SourceRowCount).Should().Be(6_698);
        results.Sum(x => x.ImportedRowCount).Should().Be(6_697);
        results.Sum(x => x.SkippedRowCount).Should().Be(1);
        results.SelectMany(x => x.Warnings).Should().ContainSingle(x => x.ClassCode == "IBL05");

        var aggregates = results.SelectMany(x => x.Aggregates).ToList();
        Count(GraduationRank.Excellent).Should().Be(676);
        Count(GraduationRank.VeryGood).Should().Be(1_509);
        Count(GraduationRank.Good).Should().Be(3_632);
        Count(GraduationRank.Average).Should().Be(880);
        aggregates.Where(x => x.IsWorkStudy).Sum(x => x.StudentCount).Should().Be(451);

        int Count(GraduationRank rank) => aggregates
            .Where(x => x.GraduationRank == rank)
            .Sum(x => x.StudentCount);
    }

    private static MemoryStream CreateWorkbook(Action<XLWorkbook> configure)
    {
        using var workbook = new XLWorkbook();
        configure(workbook);
        var stream = new MemoryStream();
        workbook.SaveAs(stream);
        stream.Position = 0;
        return stream;
    }

    private static IXLWorksheet AddSourceSheet(
        XLWorkbook workbook,
        string name,
        params string[][] rows)
    {
        var sheet = workbook.Worksheets.Add(name);
        sheet.Cell(1, 1).Value = "Loại TN";
        sheet.Cell(1, 2).Value = "Lớp";
        sheet.Cell(1, 3).Value = "Khoa";
        sheet.Cell(1, 4).Value = "Chuyên ngành";
        sheet.Cell(1, 5).Value = "VLVH";

        for (var rowIndex = 0; rowIndex < rows.Length; rowIndex++)
        {
            for (var columnIndex = 0; columnIndex < rows[rowIndex].Length; columnIndex++)
            {
                sheet.Cell(rowIndex + 2, columnIndex + 1).Value = rows[rowIndex][columnIndex];
            }
        }
        return sheet;
    }
}
