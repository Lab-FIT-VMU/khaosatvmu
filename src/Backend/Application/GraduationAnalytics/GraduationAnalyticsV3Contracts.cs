namespace Application.GraduationAnalytics;

public static class GraduationAnalyticsV3ErrorCodes
{
    public const string PeriodNotFound = "GRADUATION_V3_PERIOD_NOT_FOUND";
    public const string ConcurrentReplace = "GRADUATION_V3_CONCURRENT_REPLACE";
    public const string DuplicateSourceFile = "GRADUATION_V3_DUPLICATE_SOURCE_FILE";
    public const string ReplaceReasonRequired = "GRADUATION_V3_REPLACE_REASON_REQUIRED";
}

public sealed record ImportGraduationRevisionCommand(
    int AcademicYearStart,
    int RoundNumber,
    int ReviewMonth,
    int ReviewYear,
    long? ExpectedActiveRevisionId,
    string? ReplaceReason,
    ParsedGraduationImport ParsedImport);

public sealed record GraduationRevisionDto(
    long RevisionId,
    int RevisionNumber,
    string OriginalFileName,
    string SourceSheetName,
    string FileHash,
    int SourceRowCount,
    int ImportedRowCount,
    int SkippedRowCount,
    IReadOnlyList<GraduationImportWarning> Warnings,
    DateTime ImportedAtUtc,
    string ImportedByName,
    string? ReplaceReason,
    long? ReplacedRevisionId);

public sealed record GraduationPeriodV3Dto(
    long PeriodId,
    int AcademicYearStart,
    string AcademicYearLabel,
    int RoundNumber,
    int ReviewMonth,
    int ReviewYear,
    long ActiveRevisionId,
    int ActiveRevisionNumber,
    string OriginalFileName,
    int StudentCount,
    int SkippedRowCount,
    DateTime ImportedAtUtc);

public sealed record GraduationImportCommitResultDto(
    GraduationPeriodV3Dto Period,
    GraduationRevisionDto Revision,
    bool Unchanged);

public interface IGraduationAnalyticsV3Service
{
    Task<IReadOnlyList<GraduationPeriodV3Dto>> GetPeriodsAsync(
        int? academicYearStart,
        CancellationToken cancellationToken);

    Task<GraduationImportCommitResultDto> ImportAsync(
        ImportGraduationRevisionCommand command,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<GraduationRevisionDto>> GetRevisionsAsync(
        long periodId,
        CancellationToken cancellationToken);
}
