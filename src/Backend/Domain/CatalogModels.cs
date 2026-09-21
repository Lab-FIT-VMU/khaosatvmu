namespace Domain;

/// <summary>Bảng "Faculties".</summary>
public sealed class Faculty : ISoftDeletable
{
    public int FacultyId { get; set; }
    public string FacultyName { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Bảng "Positions". Chức vụ của giảng viên, vd 'Giảng viên chính', 'Trưởng khoa'.</summary>
public sealed class Position : ISoftDeletable
{
    public int PositionId { get; set; }

    /// <summary>UNIQUE.</summary>
    public string PositionName { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Bảng "Departments".</summary>
public sealed class Department : ISoftDeletable
{
    /// <summary>Không tự tăng. Người dùng phải tự nhập mã bộ môn khi tạo mới.</summary>
    public int DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;

    /// <summary>Nullable: bộ môn có thể chưa gắn khoa viện (ON DELETE SET NULL).</summary>
    public int? FacultyId { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Bảng "Majors".</summary>
public sealed class Major : ISoftDeletable
{
    public int MajorId { get; set; }
    public string MajorCode { get; set; } = string.Empty;
    public string MajorName { get; set; } = string.Empty;

    /// <summary>NOT NULL: ngành học luôn thuộc một khoa viện (ON DELETE CASCADE).</summary>
    public int FacultyId { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Tên khác của khoa/viện thường xuất hiện trong các tệp nghiệp vụ.</summary>
public sealed class FacultyImportAlias
{
    public long FacultyImportAliasId { get; set; }
    public int FacultyId { get; set; }
    public string Alias { get; set; } = string.Empty;
    public string NormalizedAlias { get; set; } = string.Empty;
}

/// <summary>Tên khác của ngành đào tạo thường xuất hiện trong các tệp nghiệp vụ.</summary>
public sealed class MajorImportAlias
{
    public long MajorImportAliasId { get; set; }
    public int MajorId { get; set; }
    public string Alias { get; set; } = string.Empty;
    public string NormalizedAlias { get; set; } = string.Empty;
}

/// <summary>Bảng "AcademicYears".</summary>
public sealed class AcademicYear : ISoftDeletable
{
    public int AcademicYearId { get; set; }

    /// <summary>UNIQUE, vd '2025-2026'.</summary>
    public string AcademicYearName { get; set; } = string.Empty;

    /// <summary>Ngày 25/7 của năm đầu, suy ra từ <see cref="AcademicYearName"/>.</summary>
    public DateOnly StartDate { get; set; }

    /// <summary>Ngày 24/7 của năm sau, liền ngay trước năm học kế tiếp.</summary>
    public DateOnly EndDate { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Bảng "Semesters". UNIQUE theo (AcademicYearId, SemesterName).</summary>
public sealed class Semester : ISoftDeletable
{
    public int SemesterId { get; set; }
    public string SemesterName { get; set; } = string.Empty;

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int AcademicYearId { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Bảng "CourseSections". UNIQUE theo (CourseId, SemesterId, SectionName).</summary>
public sealed class CourseSection : ISoftDeletable
{
    public int CourseSectionId { get; set; }

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int CourseId { get; set; }

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int SemesterId { get; set; }

    /// <summary>
    /// Nullable, ON DELETE RESTRICT. NULL khi tệp import không có email để xác định
    /// giảng viên; khi đó tên đọc được ghi vào <see cref="UnidentifiedLecturerName"/>.
    /// </summary>
    public int? LecturerId { get; set; }

    /// <summary>
    /// Tên giảng viên đọc từ tệp import nhưng chưa gắn được vào bảng "Lecturers"
    /// vì thiếu email. Chỉ một trong hai cột này và <see cref="LecturerId"/> được điền;
    /// ràng buộc kiểm tra ở tầng service, không đặt CHECK dưới CSDL.
    /// </summary>
    public string? UnidentifiedLecturerName { get; set; }

    public string SectionName { get; set; } = string.Empty;
    public int ClassSize { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Bảng "Lecturers". Giảng viên đăng nhập bằng Gmail, không qua Accounts.</summary>
public sealed class Lecturer : ISoftDeletable
{
    public int LecturerId { get; set; }
    public string FullName { get; set; } = string.Empty;

    /// <summary>Nullable, ON DELETE RESTRICT.</summary>
    public int? DepartmentId { get; set; }

    /// <summary>Nullable, ON DELETE RESTRICT.</summary>
    public int? FacultyId { get; set; }

    /// <summary>NOT NULL, UNIQUE.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>Nullable, ON DELETE RESTRICT. Chức vụ trong bảng "Positions".</summary>
    public int? PositionId { get; set; }

    public string? PhoneNumber { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Bảng "Courses".</summary>
public sealed class Course : ISoftDeletable
{
    public int CourseId { get; set; }

    /// <summary>Mã học phần nhập tay, vd '19783'. UNIQUE.</summary>
    public string CourseCode { get; set; } = string.Empty;

    public string CourseName { get; set; } = string.Empty;
    public int Credits { get; set; }

    /// <summary>
    /// Required | Elective. Nullable: tệp import lớp học phần không có cột loại
    /// học phần, nên học phần tạo tự động để trống cho quản trị điền sau.
    /// </summary>
    public string? CourseType { get; set; }

    public int? DepartmentId { get; set; }
    public int? FacultyId { get; set; }

    /// <summary>Tự tham chiếu, tối đa một học phần tiên quyết (ON DELETE RESTRICT).</summary>
    public int? PrerequisiteCourseId { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}
