namespace Application.Students;

public static class StudentErrorCodes
{
    public const string InvalidImport = "STUDENT_INVALID_IMPORT";
    public const string OutOfScope = "STUDENT_OUT_OF_SCOPE";
    public const string PreviewMismatch = "STUDENT_PREVIEW_MISMATCH";
}

/// <summary>Lỗi nghiệp vụ của danh mục sinh viên.</summary>
public sealed class StudentException(string errorCode, string message) : Exception(message)
{
    public string ErrorCode { get; } = errorCode;
}

public sealed record StudentDto(
    long StudentId,
    string StudentCode,
    string FullName,
    string? AdministrativeClassCode,
    int? CohortId,
    string? CohortName,
    int? MajorId,
    string? MajorName,
    int? FacultyId,
    string? FacultyName,
    string? Email,
    string? PhoneNumber,
    DateOnly? DateOfBirth,
    string? Gender,
    string? StudyStatus);

/// <summary>Số sinh viên theo khóa, để chọn khóa trước khi tải danh sách.</summary>
public sealed record StudentCohortCountDto(int? CohortId, string CohortName, int StudentCount);

public sealed record StudentListDto(bool CanImport, IReadOnlyList<StudentCohortCountDto> Cohorts, IReadOnlyList<StudentDto> Students);

/// <summary>Một dòng của file danh sách sinh viên (trình duyệt đọc Excel rồi gửi lên).</summary>
public sealed record StudentImportRow(
    string? SheetName,
    int RowNumber,
    string? StudentCode,
    string? FullName,
    string? AdministrativeClassCode,
    /// <summary>Khóa ghi trong file ("66", "K66"); hoặc lấy từ tên sheet "Khóa 66".</summary>
    string? Cohort,
    string? DateOfBirth,
    string? Gender,
    string? Email,
    string? PhoneNumber,
    string? StudyStatus);

public sealed record StudentImportRequest(IReadOnlyList<StudentImportRow> Rows, string? PreviewHash);

public sealed record StudentImportIssueDto(string? SheetName, int RowNumber, string? StudentCode, string Message);

public sealed record StudentImportCohortDto(string CohortName, int RowCount, int NewCount, int UpdatedCount);

public sealed record StudentImportPreviewDto(
    int RowCount,
    int NewCount,
    int UpdatedCount,
    int UnchangedCount,
    int ErrorCount,
    /// <summary>Sinh viên đã có mà họ tên trong file khác: nạp sẽ đổi theo file.</summary>
    int RenamedCount,
    /// <summary>Lớp hành chính không suy được khóa từ danh mục Khóa.</summary>
    int WithoutCohortCount,
    IReadOnlyList<StudentImportCohortDto> Cohorts,
    IReadOnlyList<StudentImportIssueDto> Errors,
    IReadOnlyList<StudentImportIssueDto> Warnings,
    /// <summary>Mã băm của các dòng hợp lệ; gửi lại khi xác nhận để chắc là đúng dữ liệu đã xem.</summary>
    string PreviewHash);

public sealed record StudentImportResultDto(int CreatedCount, int UpdatedCount, int UnchangedCount, int SkippedCount);

public interface IStudentService
{
    /// <summary>cohortId null: mọi khóa; unassigned true: sinh viên chưa xác định khóa.</summary>
    Task<StudentListDto> ListAsync(int? cohortId, bool unassigned, CancellationToken cancellationToken = default);

    Task<StudentImportPreviewDto> PreviewImportAsync(StudentImportRequest request, CancellationToken cancellationToken = default);

    Task<StudentImportResultDto> ImportAsync(StudentImportRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Suy lại khóa, ngành, khoa của mọi sinh viên từ lớp hành chính theo danh mục hiện tại (sau khi bổ
    /// sung khóa ngành). Không suy được thì giữ giá trị đang có.
    /// </summary>
    Task<StudentPlacementRefreshDto> RefreshPlacementAsync(CancellationToken cancellationToken = default);
}

public sealed record StudentPlacementRefreshDto(int StudentCount, int UpdatedCount, int WithoutMajorCount);
