namespace UnitTests.InfrastructureTests;

using System.IO.Compression;
using System.Text;
using Application.Common.Exceptions;
using ClosedXML.Excel;
using FluentAssertions;
using Xunit;
using CurrentParser = global::Infrastructure.GraduationAnalytics2.ClosedXmlGraduationImportParser;
using LegacyParser = global::Infrastructure.GraduationAnalytics.ClosedXmlGraduationImportParser;
using CurrentError = Application.GraduationAnalytics2.GraduationAnalyticsException;
using LegacyError = Application.GraduationAnalytics.GraduationAnalyticsException;

public sealed class GraduationParserErrorTests
{
    [Theory]
    [InlineData(false, 0)]
    [InlineData(false, 1)]
    [InlineData(false, 2)]
    [InlineData(true, 0)]
    [InlineData(true, 1)]
    [InlineData(true, 2)]
    public async Task InvalidPackage_ReturnsDomainErrorWithOriginalCause(bool legacy, int kind)
    {
        using var stream = kind switch
        {
            0 => new MemoryStream(),
            1 => new MemoryStream(Encoding.UTF8.GetBytes("not an Excel file")),
            _ => EmptyZip(),
        };
        Func<Task> action = async () =>
        {
            if (legacy) await new LegacyParser().ParseAsync(stream, "invalid.xlsx", default);
            else await new CurrentParser().ParseAsync(stream, "invalid.xlsx", default);
        };
        var error = (await action.Should().ThrowAsync<Exception>()).Which;
        if (legacy) error.Should().BeOfType<LegacyError>().Which.ErrorCode.Should().Be("GRADUATION_IMPORT_INVALID");
        else error.Should().BeOfType<CurrentError>().Which.ErrorCode.Should().Be("GRADUATION_IMPORT_INVALID");
        error.InnerException.Should().BeOfType<InvalidDataException>();
        error.Message.Should().NotContain("package metadata");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task LibraryFailure_IsTechnicalErrorAndPreservesTheOriginalException(bool legacy)
    {
        using var stream = ValidWorkbook();
        var original = new InvalidOperationException("private library implementation details");
        Func<Task> action = async () =>
        {
            if (legacy)
                await new LegacyParser { OpenWorkbook = _ => throw original }.ParseAsync(stream, "valid.xlsx", default);
            else
                await new CurrentParser { OpenWorkbook = _ => throw original }.ParseAsync(stream, "valid.xlsx", default);
        };
        var error = (await action.Should().ThrowAsync<GraduationImportProcessingException>()).Which;
        error.InnerException.Should().BeSameAs(original);
        error.Message.Should().NotContain("private").And.NotContain("file hỏng");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Cancellation_IsNotReclassifiedAsWorkbookFailure(bool legacy)
    {
        using var stream = ValidWorkbook();
        var original = new OperationCanceledException();
        Func<Task> action = async () =>
        {
            if (legacy)
                await new LegacyParser { OpenWorkbook = _ => throw original }.ParseAsync(stream, "valid.xlsx", default);
            else
                await new CurrentParser { OpenWorkbook = _ => throw original }.ParseAsync(stream, "valid.xlsx", default);
        };
        (await action.Should().ThrowAsync<OperationCanceledException>()).Which.Should().BeSameAs(original);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task BusinessValidation_RemainsADomainError(bool legacy)
    {
        using var stream = ValidWorkbook();
        Func<Task> action = async () =>
        {
            // This workbook opens correctly but does not contain the required headers.
            if (legacy) await new LegacyParser().ParseAsync(stream, "missing-headers.xlsx", default);
            else await new CurrentParser().ParseAsync(stream, "missing-headers.xlsx", default);
        };
        var error = (await action.Should().ThrowAsync<Exception>()).Which;
        if (legacy) error.Should().BeOfType<LegacyError>();
        else error.Should().BeOfType<CurrentError>();
        error.InnerException.Should().BeNull();
    }

    private static MemoryStream ValidWorkbook()
    {
        using var workbook = new XLWorkbook();
        workbook.AddWorksheet("TongHop").Cell(1, 1).Value = "unrelated header";
        var stream = new MemoryStream();
        workbook.SaveAs(stream);
        stream.Position = 0;
        return stream;
    }

    private static MemoryStream EmptyZip()
    {
        var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true)) { }
        stream.Position = 0;
        return stream;
    }
}
