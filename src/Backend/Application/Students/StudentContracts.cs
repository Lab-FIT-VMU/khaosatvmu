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

/// <summary>
/// Sinh viên. Bảng chỉ lưu khóa ngoại sang khóa ngành đào tạo; mã khóa ngành, khóa, ngành, khoa ở đây
/// được tra qua CohortMajors → Cohorts / Majors → Faculties để hiển thị.
/// </summary>
public sealed record StudentDto(
    long StudentId,
    string StudentCode,
    string FullName,
    int? CohortMajorId,
    string? CohortMajorCode,
    int? CohortId,
    string? CohortName,
    string? MajorName,
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
    /// <summary>Mã khóa ngành đào tạo (lớp hành chính), ví dụ ĐKT66ĐH; phải có trong danh mục.</summary>
    string? CohortMajorCode,
    string? DateOfBirth,
    string? Gender,
    string? Email,
    string? PhoneNumber,
    string? StudyStatus);

public sealed record StudentImportRequest(IReadOnlyList<StudentImportRow> Rows, string? PreviewHash);

public sealed record StudentImportIssueDto(string? SheetName, int RowNumber, string? StudentCode, string Message);

public sealed record StudentImportCohortDto(string CohortName, int RowCount, int NewCount, int UpdatedCount);

/// <summary>Mã khóa ngành có trong file nhưng chưa có trong danh mục, kèm số sinh viên.</summary>
public sealed record StudentMissingCohortMajorDto(string CohortMajorCode, int StudentCount);

public sealed record StudentImportPreviewDto(
    int RowCount,
    int NewCount,
    int UpdatedCount,
    int UnchangedCount,
    int ErrorCount,
    /// <summary>Sinh viên đã có mà họ tên trong file khác: nạp sẽ đổi theo file.</summary>
    int RenamedCount,
    IReadOnlyList<StudentImportCohortDto> Cohorts,
    /// <summary>Khóa ngành cần thêm ở trang Khoá ngành đào tạo (dòng của các lớp này bị bỏ qua).</summary>
    IReadOnlyList<StudentMissingCohortMajorDto> MissingCohortMajors,
    IReadOnlyList<StudentImportIssueDto> Errors,
    IReadOnlyList<StudentImportIssueDto> Warnings,
    /// <summary>Mã băm của các dòng hợp lệ; gửi lại khi xác nhận để chắc là đúng dữ liệu đã xem.</summary>
    string PreviewHash);

public sealed record StudentImportResultDto(int CreatedCount, int UpdatedCount, int UnchangedCount, int SkippedCount);

public interface IStudentService
{
    /// <summary>cohortId null: mọi khóa; unassigned true: sinh viên chưa có khóa ngành.</summary>
    Task<StudentListDto> ListAsync(int? cohortId, bool unassigned, CancellationToken cancellationToken = default);

    Task<StudentImportPreviewDto> PreviewImportAsync(StudentImportRequest request, CancellationToken cancellationToken = default);

    Task<StudentImportResultDto> ImportAsync(StudentImportRequest request, CancellationToken cancellationToken = default);
}
