namespace Domain;

/// <summary>Bảng "Cohorts". Khoá học, vd khoá 61, gắn với năm học nhập học.</summary>
public sealed class Cohort : ISoftDeletable
{
    public int CohortId { get; set; }

    /// <summary>UNIQUE khi chưa xoá. Chỉ phần số, vd '61'.</summary>
    public string CohortCode { get; set; } = string.Empty;

    /// <summary>Tên hiển thị, vd 'Khoá 61'.</summary>
    public string CohortName { get; set; } = string.Empty;

    /// <summary>NOT NULL, ON DELETE RESTRICT. Năm học sinh viên khoá này nhập học.</summary>
    public int AcademicYearId { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>
/// Bảng "CohortMajors". Một ngành đào tạo của một khoá, vd 'CNT63CL'. Đây là đơn vị
/// nhỏ nhất mà thống kê tốt nghiệp đếm theo: mã lớp trong file danh sách sinh viên
/// quy về đúng một dòng ở bảng này.
/// </summary>
public sealed class CohortMajor : ISoftDeletable
{
    public int CohortMajorId { get; set; }

    /// <summary>UNIQUE khi chưa xoá. Mã lớp khoá - ngành, vd 'CNT63CL', 'KPM66ĐH'.</summary>
    public string CohortMajorCode { get; set; } = string.Empty;

    /// <summary>NOT NULL, ON DELETE RESTRICT.</summary>
    public int CohortId { get; set; }

    /// <summary>NOT NULL, ON DELETE RESTRICT.</summary>
    public int MajorId { get; set; }

    /// <summary>Sĩ số lúc nhập học. Nhập tay hoặc import ở màn Khoá ngành đào tạo.</summary>
    public int StudentCount { get; set; }

    /// <summary>Cộng dồn qua mọi đợt tốt nghiệp. Dẫn xuất từ "CohortMajorGraduations".</summary>
    public int GraduatedCount { get; set; }

    /// <summary>Dẫn xuất: <see cref="StudentCount"/> - <see cref="GraduatedCount"/>, không âm.</summary>
    public int NotGraduatedCount { get; set; }

    /// <summary>
    /// Tốt nghiệp đúng hạn, cộng dồn qua mọi đợt. Đúng hạn là tốt nghiệp trong
    /// năm học thứ tư kể từ khi nhập học: khoá 62 nhập năm học 2021-2022 thì đợt
    /// của năm học 2024-2025 mới tính là đúng hạn.
    /// </summary>
    public int OnTimeGraduatedCount { get; set; }

    public int ExcellentCount { get; set; }
    public int VeryGoodCount { get; set; }
    public int GoodCount { get; set; }
    public int AverageCount { get; set; }

    /// <summary>
    /// Hệ vừa học vừa làm. Đây là chiều cắt ngang, sinh viên VLVH vẫn được đếm vào
    /// xếp loại của mình, nên cột này KHÔNG cộng vào <see cref="GraduatedCount"/>.
    /// </summary>
    public int WorkStudyCount { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Bảng "GraduationRounds". Đợt xét tốt nghiệp trong một năm học.</summary>
public sealed class GraduationRound : ISoftDeletable
{
    public long GraduationRoundId { get; set; }

    /// <summary>Đợt thứ mấy trong năm học. UNIQUE theo (AcademicYearId, RoundNumber).</summary>
    public int RoundNumber { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Tháng xét tốt nghiệp, lưu riêng với thời điểm tạo bản ghi.</summary>
    public int? ReviewMonth { get; set; }

    /// <summary>Năm xét tốt nghiệp, lưu riêng với thời điểm tạo bản ghi.</summary>
    public int? ReviewYear { get; set; }

    /// <summary>NOT NULL, ON DELETE RESTRICT.</summary>
    public int AcademicYearId { get; set; }

    /// <summary>Revision đang được dùng để dựng số liệu hiện hành của đợt.</summary>
    public long? ActiveRevisionId { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedByUserId { get; set; }
    public string? DeletedByName { get; set; }
    public string? DeleteReason { get; set; }
}

/// <summary>Snapshot bất biến của một lần tải lên hoặc tải lên lại ở thống kê tốt nghiệp 2.</summary>
public sealed class GraduationRoundImportRevision
{
    public long RevisionId { get; set; }
    public long GraduationRoundId { get; set; }
    public int RevisionNumber { get; set; }
    public int ReviewMonth { get; set; }
    public int ReviewYear { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string SourceSheetName { get; set; } = string.Empty;
    public string FileHash { get; set; } = string.Empty;
    public string AggregateHash { get; set; } = string.Empty;
    public int SourceRowCount { get; set; }
    public int ImportedRowCount { get; set; }
    public int SkippedRowCount { get; set; }
    public string WarningsJson { get; set; } = "[]";
    public DateTime ImportedAtUtc { get; set; }
    public Guid ImportedByUserId { get; set; }
    public string ImportedByName { get; set; } = string.Empty;
    public string? ReplaceReason { get; set; }
    public long? ReplacedRevisionId { get; set; }
}

/// <summary>Dòng tổng hợp thuộc một revision; dùng để xem lại chính xác snapshot đã tải lên.</summary>
public sealed class GraduationRoundRevisionAggregate
{
    public long AggregateId { get; set; }
    public long RevisionId { get; set; }
    public int CohortMajorId { get; set; }
    public int? FacultyId { get; set; }
    public int? MajorId { get; set; }
    public string FacultyNameRaw { get; set; } = string.Empty;
    public string FacultyKey { get; set; } = string.Empty;
    public string ProgramNameRaw { get; set; } = string.Empty;
    public string ProgramKey { get; set; } = string.Empty;
    public string? DerivedProgramCode { get; set; }
    public string CohortCode { get; set; } = string.Empty;
    public GraduationRank GraduationRank { get; set; }
    public bool IsWorkStudy { get; set; }
    public int StudentCount { get; set; }
}

/// <summary>
/// Bảng "CohortMajorGraduations". Số sinh viên của một khoá ngành tốt nghiệp trong
/// một đợt. Đây là bảng chi tiết; các cột tổng ở "CohortMajors" tính lại từ đây.
/// </summary>
public sealed class CohortMajorGraduation : ISoftDeletable
{
    public long CohortMajorGraduationId { get; set; }

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public long GraduationRoundId { get; set; }

    /// <summary>NOT NULL, ON DELETE RESTRICT.</summary>
    public int CohortMajorId { get; set; }

    /// <summary>Bằng tổng bốn cột xếp loại bên dưới.</summary>
    public int GraduatedCount { get; set; }

    public int ExcellentCount { get; set; }
    public int VeryGoodCount { get; set; }
    public int GoodCount { get; set; }
    public int AverageCount { get; set; }

    /// <summary>Chiều cắt ngang, không cộng vào <see cref="GraduatedCount"/>.</summary>
    public int WorkStudyCount { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}
