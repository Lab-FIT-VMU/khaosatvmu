namespace Application.GraduationAnalytics2;

using Domain;

public static class GraduationAnalyticsV3ErrorCodes
{
    public const string PeriodNotFound = "GRADUATION_V3_PERIOD_NOT_FOUND";
    public const string ConcurrentReplace = "GRADUATION_V3_CONCURRENT_REPLACE";
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
    int? ReviewMonth,
    int? ReviewYear,
    long ActiveRevisionId,
    int ActiveRevisionNumber,
    string OriginalFileName,
    int StudentCount,
    int SkippedRowCount,
    DateTime ImportedAtUtc,
    string ImportedByName);

public sealed record GraduationImportCommitResultDto(
    GraduationPeriodV3Dto Period,
    GraduationRevisionDto Revision,
    bool Unchanged);

public static class GraduationExploreModes
{
    public const string Period = "period";
    public const string CohortCumulative = "cohortCumulative";
}

public sealed record GraduationExploreQuery(
    string Mode,
    long? StartPeriodId,
    long CutoffPeriodId,
    IReadOnlyList<string> Cohorts,
    IReadOnlyList<string> FacultyKeys,
    IReadOnlyList<string> ProgramKeys,
    string MetricId,
    string GroupBy,
    string? SeriesBy);

public sealed record GraduationExplorePeriod(
    long PeriodId,
    int AcademicYearStart,
    int RoundNumber,
    int? ReviewMonth,
    int? ReviewYear);

public sealed record GraduationExploreCell(
    long PeriodId,
    string FacultyName,
    string FacultyKey,
    string ProgramName,
    string ProgramKey,
    string CohortCode,
    GraduationRank GraduationRank,
    bool IsWorkStudy,
    int StudentCount);

/// <summary>Quy mô nhập học ban đầu của một khóa ngành, dùng làm mẫu số thống kê.</summary>
public sealed record GraduationPopulationCell(
    string FacultyName,
    string FacultyKey,
    string ProgramName,
    string ProgramKey,
    string CohortCode,
    int StudentCount);

public sealed record GraduationKpiDto(
    string Id,
    string Label,
    int Count,
    decimal Rate);

public sealed record GraduationRankSummaryV3Dto(
    GraduationRank Rank,
    string Label,
    int Count,
    decimal Rate,
    int WorkStudyCount,
    decimal WorkStudyRate);

public sealed record GraduationTimelinePointV3Dto(
    long PeriodId,
    string PeriodLabel,
    int Graduated,
    int OnTime,
    int WorkStudy,
    int Excellent,
    int VeryGood,
    int Good,
    int Average,
    int CumulativeGraduated,
    int CumulativeOnTime,
    int CumulativeWorkStudy,
    int CumulativeExcellent,
    int CumulativeVeryGood,
    int CumulativeGood,
    int CumulativeAverage);

public sealed record GraduationBreakdownV3Dto(
    string FacultyName,
    string FacultyKey,
    string ProgramName,
    string ProgramKey,
    string CohortCode,
    int StudentCount,
    int Graduated,
    int NotGraduated,
    int OnTime,
    int WorkStudy,
    int Excellent,
    int VeryGood,
    int Good,
    int Average);

public sealed record GraduationChartPointV3Dto(
    string GroupKey,
    string GroupLabel,
    string? SeriesKey,
    string? SeriesLabel,
    decimal Value,
    int Count,
    int Total);

public sealed record GraduationFacetOptionDto(string Value, string Label, string? ParentValue = null);

public sealed record GraduationExploreFacetsV3Dto(
    IReadOnlyList<GraduationFacetOptionDto> Faculties,
    IReadOnlyList<GraduationFacetOptionDto> Programs,
    IReadOnlyList<string> Cohorts);

public sealed record GraduationExploreScopeDto(
    string Mode,
    string? Cohort,
    IReadOnlyList<string> Cohorts,
    long StartPeriodId,
    string StartPeriodLabel,
    long CutoffPeriodId,
    string CutoffPeriodLabel,
    int IncludedPeriodCount);

public sealed record GraduationExploreResultV3Dto(
    GraduationExploreScopeDto Scope,
    IReadOnlyList<GraduationKpiDto> Kpis,
    IReadOnlyList<GraduationRankSummaryV3Dto> Ranks,
    IReadOnlyList<GraduationTimelinePointV3Dto> Timeline,
    IReadOnlyList<GraduationBreakdownV3Dto> Breakdown,
    IReadOnlyList<GraduationChartPointV3Dto> ChartPoints,
    GraduationExploreFacetsV3Dto Facets);

public interface IGraduationAnalyticsV3Service
{
    /// <summary>Các năm học đã có khoá học, trả về năm bắt đầu, mới nhất trước.</summary>
    Task<IReadOnlyList<int>> GetAcademicYearStartsAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<GraduationPeriodV3Dto>> GetPeriodsAsync(
        int? academicYearStart,
        CancellationToken cancellationToken);

    Task<GraduationImportCommitResultDto> ImportAsync(
        ImportGraduationRevisionCommand command,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<GraduationRevisionDto>> GetRevisionsAsync(
        long periodId,
        CancellationToken cancellationToken);

    Task<ParsedGraduationImport> GetActivePreviewAsync(
        long periodId,
        CancellationToken cancellationToken);

    Task DeletePeriodAsync(
        long periodId,
        string reason,
        CancellationToken cancellationToken);

    Task<GraduationExploreResultV3Dto> ExploreAsync(
        GraduationExploreQuery query,
        CancellationToken cancellationToken);
}
