namespace Application.CourseGrades;

public static class CourseGradeErrorCodes
{
    public const string InvalidImport = "COURSE_GRADE_INVALID_IMPORT";
    public const string SemesterNotFound = "COURSE_GRADE_SEMESTER_NOT_FOUND";
    public const string SemesterHasNoSections = "COURSE_GRADE_SEMESTER_HAS_NO_SECTIONS";
    public const string PreviewMismatch = "COURSE_GRADE_PREVIEW_MISMATCH";
    public const string ConcurrentReplace = "COURSE_GRADE_CONCURRENT_REPLACE";
    public const string ReplaceReasonRequired = "COURSE_GRADE_REPLACE_REASON_REQUIRED";
    public const string NothingToRemove = "COURSE_GRADE_NOTHING_TO_REMOVE";
    public const string OutOfScope = "COURSE_GRADE_OUT_OF_SCOPE";
    public const string EncryptionNotConfigured = "COURSE_GRADE_ENCRYPTION_NOT_CONFIGURED";
}

/// <summary>Lỗi nghiệp vụ của nạp điểm. Thông điệp không bao giờ chứa giá trị của dòng điểm nào.</summary>
public sealed class CourseGradeException(string errorCode, string message) : Exception(message)
{
    public string ErrorCode { get; } = errorCode;
}

/// <summary>
/// Mã hóa từng ô điểm (AES-256-GCM). Dữ liệu xác thực kèm theo (AAD) gắn ô với đúng dòng và
/// đúng cột, nên không chép được khối mã của dòng này sang dòng khác hay của X sang Y.
/// </summary>
public interface IGradeCipher
{
    /// <summary>Phiên bản khóa đang dùng để mã hóa; lưu ở cột KeyVersion của từng dòng.</summary>
    short ActiveKeyVersion { get; }

    byte[] Encrypt(decimal value, GradeCellContext context);

    decimal Decrypt(byte[] cipherText, short keyVersion, GradeCellContext context);
}

/// <summary>
/// Định danh một ô điểm, dùng làm AAD. Worker Python phải dựng đúng chuỗi này
/// (<see cref="ToAssociatedData"/>) mới giải mã được.
/// </summary>
public readonly record struct GradeCellContext(
    long RevisionId,
    long StudentId,
    string CourseCode,
    int SourceRowNumber,
    string Column)
{
    public string ToAssociatedData() =>
        $"StudentCourseGrades|{Column}|{RevisionId}|{StudentId}|{CourseCode}|{SourceRowNumber}";
}

/// <summary>Tên cột của các ô mã hóa, dùng trong AAD.</summary>
public static class GradeCellColumns
{
    public const string Component1 = "Component1Enc";
    public const string Component2 = "Component2Enc";
    public const string Component3 = "Component3Enc";
    public const string ExamScore = "ExamScoreEnc";
    public const string OfficialTotal = "OfficialTotalEnc";
    public const string X = "XEnc";
    public const string Y = "YEnc";
    public const string Z = "ZEnc";
}

public sealed record CourseGradeRuleCountDto(string Rule, string Description, int Count);

/// <summary>Một lớp chỉ có ở file điểm (B-G1): mã HP, nhóm, số dòng. Không có dữ liệu sinh viên.</summary>
public sealed record CourseGradeMissingSectionDto(string CourseCode, string? SectionName, string? CourseName, int RowCount);

/// <summary>Bản đối soát, giống màn "xem trước" của module tốt nghiệp. Chỉ có số đếm và mã lớp.</summary>
public sealed record CourseGradeImportPreviewDto(
    int SemesterId,
    string SemesterLabel,
    string FileName,
    string SheetName,
    string FileHash,
    int SourceRowCount,
    int UsableRowCount,
    int MatchedRowCount,
    int StudentCount,
    int NewStudentCount,
    IReadOnlyList<CourseGradeRuleCountDto> ExcludedRows,
    int MissingSectionCount,
    int MissingSectionRowCount,
    IReadOnlyList<CourseGradeMissingSectionDto> MissingSections,
    int SectionsWithoutGradesCount,
    IReadOnlyList<string> SectionsWithoutGrades,
    IReadOnlyList<string> Warnings,
    /// <summary>Lần nạp đang dùng của kỳ (nếu có): gửi lại khi xác nhận để chặn hai người ghi đè nhau.</summary>
    long? ActiveRevisionId);

public sealed record CourseGradeImportCommand(
    int SemesterId,
    string FileName,
    Stream Content,
    string? PreviewFileHash,
    long? ExpectedActiveRevisionId,
    string? ReplaceReason);

public sealed record CourseGradeImportResultDto(
    long RevisionId,
    int RevisionNumber,
    int SemesterId,
    int ImportedRowCount,
    int SkippedRowCount,
    int CreatedStudentCount,
    long AnalysisRunId);

/// <summary>Một kỳ đã nạp điểm.</summary>
public sealed record CourseGradeSemesterDto(
    int SemesterId,
    string SemesterLabel,
    long RevisionId,
    int RevisionNumber,
    string OriginalFileName,
    int SourceRowCount,
    int ImportedRowCount,
    int SkippedRowCount,
    DateTime ImportedAtUtc,
    string ImportedByName);

public sealed record GradeAnalysisRunDto(
    long RunId,
    string Status,
    string Trigger,
    IReadOnlyList<int> SemesterIds,
    int ThresholdVersion,
    DateTime RequestedAtUtc,
    DateTime? StartedAtUtc,
    DateTime? FinishedAtUtc,
    string? ErrorMessage,
    bool IsCurrent);

public interface ICourseGradeImportService
{
    Task<CourseGradeImportPreviewDto> PreviewAsync(
        int semesterId, string fileName, Stream content, CancellationToken cancellationToken = default);

    Task<CourseGradeImportResultDto> ImportAsync(
        CourseGradeImportCommand command, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CourseGradeSemesterDto>> GetSemestersAsync(CancellationToken cancellationToken = default);

    /// <summary>Gỡ điểm của một kỳ: xóa hẳn các dòng điểm, giữ lịch sử lần nạp, rồi xếp lượt tính lại.</summary>
    Task<GradeAnalysisRunDto> RemoveSemesterAsync(
        int semesterId, string? reason, CancellationToken cancellationToken = default);

    Task<GradeAnalysisRunDto?> GetLatestRunAsync(CancellationToken cancellationToken = default);
}
