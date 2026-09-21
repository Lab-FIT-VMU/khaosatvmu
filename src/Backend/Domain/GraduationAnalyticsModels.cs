namespace Domain;

public enum GraduationRank
{
    Excellent = 1,
    VeryGood = 2,
    Good = 3,
    Average = 4,
}

/// <summary>Một đợt xét tốt nghiệp ổn định, được định danh bằng năm học và số đợt.</summary>
public sealed class GraduationPeriod : ISoftDeletable
{
    public long PeriodId { get; set; }
    public int AcademicYearStart { get; set; }
    public int RoundNumber { get; set; }
    public int ReviewMonth { get; set; }
    public int ReviewYear { get; set; }
    public long? ActiveRevisionId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public Guid CreatedByUserId { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedByUserId { get; set; }
    public string? DeletedByName { get; set; }
    public string? DeleteReason { get; set; }
}

/// <summary>Snapshot bất biến của một lần import hoặc import lại.</summary>
public sealed class GraduationImportRevision
{
    public long RevisionId { get; set; }
    public long PeriodId { get; set; }
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
    public string SkippedSummaryJson { get; set; } = "[]";
    public DateTime ImportedAtUtc { get; set; }
    public Guid ImportedByUserId { get; set; }
    public string ImportedByName { get; set; } = string.Empty;
    public string? ReplaceReason { get; set; }
    public long? ReplacedRevisionId { get; set; }
}

/// <summary>Số lượng đã tổng hợp, không chứa một dòng trên mỗi sinh viên.</summary>
public sealed class GraduationAggregateRow
{
    public long AggregateRowId { get; set; }
    public long RevisionId { get; set; }
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
