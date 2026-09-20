using Domain;

namespace Application.GraduationAnalytics;

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

public sealed record ParsedGraduationImport(
    string OriginalFileName,
    string SourceSheetName,
    string FileHash,
    int SourceRowCount,
    int ImportedRowCount,
    int SkippedRowCount,
    IReadOnlyList<GraduationImportAggregate> Aggregates,
    IReadOnlyList<GraduationImportWarning> Warnings);

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
