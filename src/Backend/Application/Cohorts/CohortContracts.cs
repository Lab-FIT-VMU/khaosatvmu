namespace Application.Cohorts;

public static class CohortErrorCodes
{
    public const string AcademicYearRequired = "COHORT_ACADEMIC_YEAR_REQUIRED";
    public const string AcademicYearNotFound = "COHORT_ACADEMIC_YEAR_NOT_FOUND";
    public const string AcademicYearUsed = "COHORT_ACADEMIC_YEAR_USED";
    public const string CohortNotFound = "COHORT_NOT_FOUND";
    public const string CohortCodeRequired = "COHORT_CODE_REQUIRED";
    public const string CohortCodeExists = "COHORT_CODE_EXISTS";
    public const string CohortInUse = "COHORT_IN_USE";

    public const string CohortMajorNotFound = "COHORT_MAJOR_NOT_FOUND";
    public const string CohortMajorCodeRequired = "COHORT_MAJOR_CODE_REQUIRED";
    public const string CohortMajorCodeExists = "COHORT_MAJOR_CODE_EXISTS";
    public const string CohortMajorExists = "COHORT_MAJOR_EXISTS";
    public const string CohortMajorInUse = "COHORT_MAJOR_IN_USE";
    public const string MajorRequired = "COHORT_MAJOR_MAJOR_REQUIRED";
    public const string MajorNotFound = "COHORT_MAJOR_MAJOR_NOT_FOUND";
    public const string StudentCountInvalid = "COHORT_MAJOR_STUDENT_COUNT_INVALID";
    public const string ImportMultipleCohorts = "COHORT_MAJOR_IMPORT_MULTIPLE_COHORTS";
    public const string ImportCohortMismatch = "COHORT_MAJOR_IMPORT_COHORT_MISMATCH";
}

public sealed record CohortDto(
    int CohortId,
    string CohortCode,
    string CohortName,
    int AcademicYearId,
    string AcademicYearName,
    int CohortMajorCount);

public sealed record CohortMajorDto(
    int CohortMajorId,
    string CohortMajorCode,
    int CohortId,
    string CohortCode,
    int MajorId,
    string MajorCode,
    string MajorName,
    string FacultyName,
    int StudentCount,
    int GraduatedCount,
    int NotGraduatedCount,
    int OnTimeGraduatedCount,
    int ExcellentCount,
    int VeryGoodCount,
    int GoodCount,
    int AverageCount,
    int WorkStudyCount);

public sealed record SaveCohortCommand(int AcademicYearId, string? CohortCode, string? CohortName);

public sealed record SaveCohortMajorCommand(
    int CohortId,
    string CohortMajorCode,
    int MajorId,
    int StudentCount);

/// <summary>
/// Một dòng của tệp Excel khoá ngành đào tạo: tên khoá ngành, tên ngành, số sinh viên đầu vào.
/// Khoá học không nằm trong tệp mà chọn một lần cho cả lần import.
/// </summary>
public sealed record ImportCohortMajorRowCommand(
    int RowNumber,
    string CohortMajorCode,
    string? MajorName,
    int? StudentCount);

public sealed record CohortImportItemDto(
    int RowNumber,
    string CohortMajorCode,
    bool Succeeded,
    string? ErrorCode);

public sealed record CohortImportDto(
    int TotalCount,
    int CreatedCount,
    int UpdatedCount,
    int SkippedCount,
    IReadOnlyList<CohortImportItemDto> Items);

public sealed record CohortOperationResult<T>(bool Succeeded, string? ErrorCode, T? Value);

public interface ICohortService
{
    Task<IReadOnlyList<CohortDto>> GetCohortsAsync(CancellationToken cancellationToken = default);

    Task<CohortOperationResult<CohortDto>> CreateCohortAsync(
        SaveCohortCommand command,
        CancellationToken cancellationToken = default);

    Task<CohortOperationResult<CohortDto>> UpdateCohortAsync(
        int cohortId,
        SaveCohortCommand command,
        CancellationToken cancellationToken = default);

    Task<CohortOperationResult<bool>> DeleteCohortAsync(
        int cohortId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CohortMajorDto>> GetCohortMajorsAsync(
        int? cohortId,
        CancellationToken cancellationToken = default);

    Task<CohortOperationResult<CohortMajorDto>> CreateCohortMajorAsync(
        SaveCohortMajorCommand command,
        CancellationToken cancellationToken = default);

    Task<CohortOperationResult<CohortMajorDto>> UpdateCohortMajorAsync(
        int cohortMajorId,
        SaveCohortMajorCommand command,
        CancellationToken cancellationToken = default);

    Task<CohortOperationResult<bool>> DeleteCohortMajorAsync(
        int cohortMajorId,
        CancellationToken cancellationToken = default);

    Task<CohortOperationResult<CohortImportDto>> ImportCohortMajorsAsync(
        int cohortId,
        IReadOnlyList<ImportCohortMajorRowCommand> rows,
        CancellationToken cancellationToken = default);
}
