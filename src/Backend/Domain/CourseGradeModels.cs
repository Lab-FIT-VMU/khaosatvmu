namespace Domain;

/*
  Phân tích điểm học phần (docs/plans/tich-hop-phan-tich-diem-hoc-phan.md).

  Ba nhóm bảng:
    1. Sinh viên và điểm: Students, GradeImportRevisions, StudentCourseGrades.
    2. Ngưỡng của bộ luật D, E: GradeAnalysisThresholds.
    3. Lượt tính và kết quả: GradeAnalysisRuns cùng bốn bảng kết quả.

  Bộ luật A, B (loại dòng, công thức X/Y/Z, gộp bộ môn) nằm trong code, không nằm ở đây.
*/

/// <summary>
/// Sinh viên của trường. Họ tên và mã để dạng thường như bảng Lecturers, được bảo vệ bằng
/// phân quyền; phần cần mã hóa là điểm, nằm ở <see cref="StudentCourseGrade"/>.
/// Không bao giờ nối bảng này với phiếu khảo sát: khảo sát cam kết ẩn danh.
/// </summary>
public sealed class Student : ISoftDeletable
{
    public long StudentId { get; set; }

    /// <summary>Mã sinh viên của trường (cột f_masv), lưu dạng chuỗi vì dài 5–7 chữ số.</summary>
    public string StudentCode { get; set; } = string.Empty;

    /// <summary>Cột f_tensv.</summary>
    public string FullName { get; set; } = string.Empty;

    /// <summary>
    /// Lớp hành chính = khóa ngành đào tạo (ĐKT66ĐH), khóa ngoại sang CohortMajors. Khóa, ngành, khoa
    /// không lưu ở đây mà tra qua khóa ngành. Lớp chưa có trong danh mục thì để trống và báo khi nạp.
    /// </summary>
    public int? CohortMajorId { get; set; }

    public string? Email { get; set; }
    public string? PhoneNumber { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? Gender { get; set; }
    public string? StudyStatus { get; set; }

    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>
/// Một lần nạp file điểm cho một học kỳ, theo mẫu <see cref="GraduationImportRevision"/>.
/// Mỗi kỳ chỉ có đúng một lần nạp đang dùng (<see cref="IsActive"/>). Nạp lại thì tạo lần
/// mới, rồi xóa hẳn các dòng điểm của lần cũ: điểm là dữ liệu cá nhân nên không xóa mềm.
/// </summary>
public sealed class GradeImportRevision
{
    public long RevisionId { get; set; }

    /// <summary>Kỳ người dùng chọn trước khi nạp, giống trang Lớp học phần.</summary>
    public int SemesterId { get; set; }

    public int RevisionNumber { get; set; }
    public bool IsActive { get; set; }

    public string OriginalFileName { get; set; } = string.Empty;
    public string SourceSheetName { get; set; } = string.Empty;

    /// <summary>SHA-256 của file. Không giữ file gốc.</summary>
    public string FileHash { get; set; } = string.Empty;

    public int SourceRowCount { get; set; }

    /// <summary>Số dòng qua bộ luật A.</summary>
    public int ImportedRowCount { get; set; }

    /// <summary>Số dòng bị loại theo L1–L8 hoặc trùng.</summary>
    public int SkippedRowCount { get; set; }

    /// <summary>Số dòng bị loại theo từng luật, ví dụ {"L1": 5983, "T": 48}.</summary>
    public string SkippedSummaryJson { get; set; } = "{}";

    /// <summary>Lớp chỉ có ở file điểm (B-G1) và lớp chưa có điểm (B-G2). Chỉ mã lớp và số đếm.</summary>
    public string ReconciliationJson { get; set; } = "{}";

    public string WarningsJson { get; set; } = "[]";

    /// <summary>Phiên bản bộ luật A trong code đã dùng để tính X, Y, Z và lý do loại.</summary>
    public short RuleVersion { get; set; }

    public DateTime ImportedAtUtc { get; set; }
    public Guid ImportedByUserId { get; set; }
    public string ImportedByName { get; set; } = string.Empty;
    public string? ReplaceReason { get; set; }
    public long? ReplacedRevisionId { get; set; }
}

/// <summary>
/// Một dòng của file "Điểm học tập của SV theo kỳ", giữ cả dòng bị loại để khi bộ luật A
/// đổi thì tính lại được mà không phải xin lại file. Các cột điểm được mã hóa AES-256-GCM;
/// cột thường chỉ là mã học phần, nhóm và ghi chú.
/// </summary>
public sealed class StudentCourseGrade
{
    public long StudentCourseGradeId { get; set; }
    public long RevisionId { get; set; }
    public int SemesterId { get; set; }
    public long StudentId { get; set; }

    /// <summary>Lớp ghép được theo (f_mamh, f_loptc). Rỗng khi lớp không có trong file lớp (B-G1).</summary>
    public int? CourseSectionId { get; set; }

    public int SourceRowNumber { get; set; }

    /// <summary>Cột f_nhhk, lưu nguyên như file; không dùng để xác định kỳ.</summary>
    public string? SourceTermCode { get; set; }

    /// <summary>Cột f_mamh: in hoa, bỏ ".0" khi Excel lưu dạng số.</summary>
    public string CourseCode { get; set; } = string.Empty;

    /// <summary>Cột f_tenmh.</summary>
    public string? CourseName { get; set; }

    /// <summary>Cột f_loptc.</summary>
    public string? SectionName { get; set; }

    /// <summary>Cột f_namhoc.</summary>
    public string? AcademicYearText { get; set; }

    /// <summary>Cột f_hocky.</summary>
    public string? TermText { get; set; }

    /// <summary>Cột f_dot.</summary>
    public string? ExamRound { get; set; }

    /// <summary>Cột f_ghichu: M, B, BS, K, V, P, PK.</summary>
    public string? NoteCode { get; set; }

    /// <summary>f_diem1, mã hóa. Rỗng khi ô trống.</summary>
    public byte[]? Component1Enc { get; set; }

    /// <summary>f_diem2, mã hóa.</summary>
    public byte[]? Component2Enc { get; set; }

    /// <summary>f_diem3, mã hóa.</summary>
    public byte[]? Component3Enc { get; set; }

    /// <summary>f_diemthi, mã hóa.</summary>
    public byte[]? ExamScoreEnc { get; set; }

    /// <summary>f_tbcht, mã hóa. Chỉ để đối chiếu, không dùng để tính.</summary>
    public byte[]? OfficialTotalEnc { get; set; }

    /// <summary>X theo bộ luật A, mã hóa. Rỗng khi dòng bị loại.</summary>
    public byte[]? XEnc { get; set; }

    /// <summary>Y theo bộ luật A, mã hóa.</summary>
    public byte[]? YEnc { get; set; }

    /// <summary>Z theo bộ luật A, mã hóa.</summary>
    public byte[]? ZEnc { get; set; }

    /// <summary>L1–L8 hoặc T (trùng); rỗng là dòng được dùng.</summary>
    public string? ExclusionRule { get; set; }

    public short KeyVersion { get; set; }
}

public static class GradeAnalysisThresholdValueTypes
{
    public const string Integer = "integer";
    public const string Decimal = "decimal";
    public const string Boolean = "boolean";
    public const string TextList = "text_list";

    public static readonly IReadOnlyList<string> All = [Integer, Decimal, Boolean, TextList];
}

/// <summary>
/// Một ngưỡng của bộ luật D, E (tham_so_chi_so.json). Mã giữ đúng tên trong JSON để bộ tính
/// Python vẫn đọc ts["..."] như cũ. Ai được sửa do quyền COURSE_GRADE_THRESHOLDS_ACCESS quyết định.
/// </summary>
public sealed class GradeAnalysisThreshold
{
    public string ThresholdCode { get; set; } = string.Empty;
    public string GroupCode { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? RuleReference { get; set; }
    public string ValueType { get; set; } = GradeAnalysisThresholdValueTypes.Decimal;

    public decimal? NumericValue { get; set; }
    public bool? BooleanValue { get; set; }
    public List<string>? TextListValue { get; set; }

    public decimal? DefaultNumericValue { get; set; }
    public bool? DefaultBooleanValue { get; set; }
    public List<string>? DefaultTextListValue { get; set; }

    public decimal? MinValue { get; set; }
    public decimal? MaxValue { get; set; }
    public string? Unit { get; set; }
    public short SortOrder { get; set; }

    /// <summary>Phiên bản chung ở lần sửa gần nhất của dòng. Phiên bản hiện hành = MAX(Version).</summary>
    public int Version { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
    public Guid? UpdatedByUserId { get; set; }
}

public enum GradeAnalysisRunStatus : short
{
    Queued = 1,
    Running = 2,
    Succeeded = 3,
    Failed = 4,
}

public static class GradeAnalysisRunTriggers
{
    public const string Import = "IMPORT";
    public const string Recompute = "RECOMPUTE";
    public const string ThresholdChange = "THRESHOLD_CHANGE";
    public const string RemoveTerm = "REMOVE_TERM";
}

/// <summary>
/// Một lượt tính của worker Python trên mọi kỳ đã nạp. Kết quả là snapshot bất biến; tính xong
/// mới chuyển <see cref="IsCurrent"/> nên người xem không bao giờ thấy số liệu tính dở.
/// </summary>
public sealed class GradeAnalysisRun
{
    public long RunId { get; set; }
    public GradeAnalysisRunStatus Status { get; set; }
    public string Trigger { get; set; } = GradeAnalysisRunTriggers.Recompute;

    /// <summary>Các kỳ được tính, theo thứ tự thời gian (học kỳ phụ → HK1 → HK2 trong một năm học).</summary>
    public List<int> SemesterIds { get; set; } = [];

    public int ThresholdVersion { get; set; }

    /// <summary>Toàn bộ ngưỡng lúc tính, dạng {mã: giá trị}.</summary>
    public string ThresholdSnapshotJson { get; set; } = "{}";

    /// <summary>Phần liên kỳ không gắn với người: co_hp, de_thi, de_thi_lech, g1_ngau_nhien.</summary>
    public string? CrossTermJson { get; set; }

    /// <summary>Commit của mã xu_ly đã chạy.</summary>
    public string? WorkerVersion { get; set; }

    public Guid? RequestedByUserId { get; set; }
    public DateTime RequestedAtUtc { get; set; }
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? FinishedAtUtc { get; set; }

    /// <summary>Không được chứa dữ liệu của dòng điểm nào.</summary>
    public string? ErrorMessage { get; set; }

    public bool IsCurrent { get; set; }
}

/// <summary>Số tổng toàn trường của một kỳ (tong, xu_huong).</summary>
public sealed class GradeAnalysisTermResult
{
    public long RunId { get; set; }
    public int SemesterId { get; set; }
    public string DataJson { get; set; } = "{}";
}

/// <summary>Kết quả một học phần (mã đã bỏ đuôi H/E) trong một kỳ.</summary>
public sealed class GradeAnalysisCourseResult
{
    public long CourseResultId { get; set; }
    public long RunId { get; set; }
    public int SemesterId { get; set; }
    public string BaseCourseCode { get; set; } = string.Empty;
    public int? DepartmentId { get; set; }
    public int? FacultyId { get; set; }

    /// <summary>Điểm lưu ý H1–H6.</summary>
    public List<string> Flags { get; set; } = [];

    /// <summary>Trạng thái ổn định O1–O6.</summary>
    public List<string> StableStates { get; set; } = [];

    public string DataJson { get; set; } = "{}";
}

/// <summary>
/// Kết quả một lớp học phần. Không chứa tên người: chỉ có <see cref="LecturerId"/>, API điền
/// tên tùy quyền người xem, và cấp Ban giám hiệu không bao giờ nhận cột này.
/// </summary>
public sealed class GradeAnalysisSectionResult
{
    public long SectionResultId { get; set; }
    public long RunId { get; set; }
    public int SemesterId { get; set; }
    public int CourseSectionId { get; set; }
    public string BaseCourseCode { get; set; } = string.Empty;
    public int? LecturerId { get; set; }
    public int? DepartmentId { get; set; }
    public int? FacultyId { get; set; }

    /// <summary>Lớp có đủ sinh viên để đưa vào thống kê (D-Đ1).</summary>
    public bool IncludedInStats { get; set; }

    /// <summary>Đặc điểm lớp D1–D7.</summary>
    public List<string> Markers { get; set; } = [];

    public string DataJson { get; set; } = "{}";

    /// <summary>Hồ sơ lớp theo bộ luật E.</summary>
    public string? ProfileJson { get; set; }
}

/// <summary>
/// Chuỗi các kỳ của một cặp giảng viên – học phần: I7 theo kỳ, đặc điểm theo kỳ, G1, câu xu hướng.
/// Đây là phần nhạy cảm nhất nên tách bảng riêng; cấp Ban giám hiệu chỉ nhận số lượng.
/// </summary>
public sealed class GradeAnalysisLecturerCourseResult
{
    public long LecturerCourseResultId { get; set; }
    public long RunId { get; set; }
    public int LecturerId { get; set; }
    public string BaseCourseCode { get; set; } = string.Empty;
    public int? DepartmentId { get; set; }
    public int? FacultyId { get; set; }
    public string DataJson { get; set; } = "{}";
}
