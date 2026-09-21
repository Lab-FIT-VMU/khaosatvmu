using Domain;

namespace Application.GraduationAnalytics2;

public static class GraduationImportWarningCodes
{
    public const string CohortUnresolved = "COHORT_UNRESOLVED";
}

public sealed record GraduationImportAggregate(
    string FacultyNameRaw,
    string FacultyKey,
    string ProgramNameRaw,
    string ProgramKey,
    string? DerivedProgramCode,
    string CohortCode,
    GraduationRank GraduationRank,
    bool IsWorkStudy,
    int StudentCount,
    int? FacultyId = null,
    int? MajorId = null);

public sealed record GraduationImportWarning(
    string Code,
    string Message,
    string SourceSheetName,
    string? ClassCode,
    IReadOnlyList<int> SourceRowNumbers);

/// <summary>Một dòng của sheet nguồn, giữ nguyên nội dung từng ô.</summary>
public sealed record GraduationImportSourceRow(
    int RowNumber,
    string ClassKey,
    IReadOnlyList<string> Values);

public sealed record ParsedGraduationImport(
    string OriginalFileName,
    string SourceSheetName,
    string FileHash,
    int SourceRowCount,
    int ImportedRowCount,
    int SkippedRowCount,
    IReadOnlyList<GraduationImportAggregate> Aggregates,
    IReadOnlyList<GraduationImportWarning> Warnings,
    /// <summary>Tiêu đề cột và dòng nguồn, chỉ dùng để dựng bảng lỗi khi import hỏng.</summary>
    IReadOnlyList<string>? SourceColumns = null,
    IReadOnlyList<GraduationImportSourceRow>? SourceRows = null);

public interface IGraduationImportParser
{
    Task<ParsedGraduationImport> ParseAsync(
        Stream workbookStream,
        string originalFileName,
        CancellationToken cancellationToken);
}

public interface IGraduationImportCatalogResolver
{
    Task<ParsedGraduationImport> ResolveAsync(
        ParsedGraduationImport parsedImport,
        CancellationToken cancellationToken);
}
