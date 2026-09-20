namespace Application.Catalog;

public sealed record FacultyDto(int FacultyId, string FacultyName);

public sealed record DepartmentDto(int DepartmentId, string DepartmentName, int? FacultyId);

public sealed record MajorDto(int MajorId, string MajorCode, string MajorName, int FacultyId);

/// <summary>Chức vụ của giảng viên. Bảng "Positions".</summary>
public sealed record PositionDto(int PositionId, string PositionName);

public sealed record AcademicYearDto(
    int AcademicYearId,
    string AcademicYearName,
    IReadOnlyList<SemesterDto> Semesters);

public sealed record SemesterDto(int SemesterId, string SemesterName, int AcademicYearId);

/// <summary>
/// LecturerId và UnidentifiedLecturerName loại trừ nhau: lớp nào chưa xác định được
/// giảng viên thì LecturerId null và tên đọc từ tệp nằm ở UnidentifiedLecturerName.
/// </summary>
public sealed record CourseSectionDto(
    int CourseSectionId,
    int CourseId,
    int SemesterId,
    int? LecturerId,
    string SectionName,
    int ClassSize,
    string? UnidentifiedLecturerName,
    /// <summary>
    /// Tên người dạy, gửi kèm ngay trên dòng lớp. Trước đây giao diện tự tra tên từ
    /// danh sách giảng viên đã bị lọc theo phạm vi, nên lớp do giảng viên bộ môn khác
    /// dạy hộ hiện ra dấu gạch — dù chính lớp đó vẫn nằm trong phạm vi người xem.
    /// </summary>
    string? LecturerName = null,
    string? LecturerEmail = null);

public sealed record SaveAcademicYearCommand(string AcademicYearName);

public sealed record SaveSemesterCommand(string SemesterName, int AcademicYearId);

public sealed record SaveCourseSectionCommand(
    int CourseId,
    int SemesterId,
    int? LecturerId,
    string SectionName,
    int ClassSize,
    string? UnidentifiedLecturerName);

/// <summary>
/// Một dòng lớp học phần trong tệp Excel gốc của đơn vị đào tạo. Các cột theo thứ tự:
/// Mã HP, Học phần, Nhóm, TCHT, Sĩ số, Bộ môn, Khoa, Giảng viên, Email, Mã BM.
/// Học phần chưa có thì được tạo mới; giảng viên có email mà chưa có cũng vậy.
/// </summary>
public sealed record ImportCourseSectionRowCommand(
    int RowNumber,
    /// <summary>Cột "Mã HP".</summary>
    string CourseCode,
    /// <summary>Cột "Học phần". Dùng khi phải tạo học phần mới.</summary>
    string? CourseName,
    /// <summary>Cột "Nhóm", chính là tên lớp học phần.</summary>
    string SectionName,
    /// <summary>Cột "TCHT", số tín chỉ. Dùng khi phải tạo học phần mới.</summary>
    string? Credits,
    /// <summary>Cột "Sĩ số".</summary>
    string? ClassSize,
    /// <summary>Cột "Bộ môn". Chỉ dùng khi cột "Mã BM" bỏ trống.</summary>
    string? DepartmentName,
    /// <summary>Cột "Mã BM". Được ưu tiên hơn tên bộ môn.</summary>
    string? DepartmentCode,
    /// <summary>Cột "Khoa".</summary>
    string? FacultyName,
    /// <summary>Cột "Giảng viên".</summary>
    string? LecturerFullName,
    /// <summary>Cột "Email". Bỏ trống thì lớp được tạo với giảng viên chưa xác định.</summary>
    string? LecturerEmail);

/// <summary>
/// Một giảng viên đọc được trong tệp nhưng thiếu email nên không gắn được vào
/// bảng "Lecturers". Frontend xuất lại thành tệp Excel ĐÚNG cấu trúc tệp import,
/// nên phải mang đủ mọi cột của tệp gốc chứ không chỉ mã học phần và tên lớp.
/// </summary>
public sealed record UnidentifiedLecturerDto(
    int RowNumber,
    string FullName,
    int? DepartmentId,
    string? DepartmentName,
    string? FacultyName,
    string CourseCode,
    string SectionName,
    /// <summary>Cột "Học phần" của tệp import.</summary>
    string CourseName,
    /// <summary>Cột "TCHT" của tệp import.</summary>
    int Credits,
    /// <summary>Cột "Sĩ số" của tệp import.</summary>
    int ClassSize);

/// <summary>Một lớp chưa gắn được giảng viên, dựng lại từ dữ liệu chứ không từ tệp import.</summary>
public sealed record UnidentifiedSectionDto(
    int CourseSectionId,
    /// <summary>Tên đọc từ tệp import, nằm ở cột UnidentifiedLecturerName.</summary>
    string LecturerName,
    string CourseCode,
    string CourseName,
    string SectionName,
    int ClassSize,
    int? DepartmentId,
    string? DepartmentName,
    string? FacultyName,
    /// <summary>Cột "TCHT" của tệp import, lấy theo học phần sở hữu lớp.</summary>
    int Credits);

/// <summary>
/// Gom các lớp trên theo tên giảng viên. Đây mới là danh sách cầm đi xin email:
/// một bộ môn có thể thiếu 36 lớp nhưng chỉ do 6 người dạy.
/// </summary>
public sealed record UnidentifiedLecturerGroupDto(
    string LecturerName,
    string? DepartmentName,
    int SectionCount,
    /// <summary>Nhãn lớp dạng "13150 / N01", để đối chiếu khi hỏi bộ môn.</summary>
    IReadOnlyList<string> SectionLabels);

/// <summary>
/// Toàn bộ số liệu cho băng cảnh báo ở trang Lớp học phần và dòng thông báo trên
/// bảng điều khiển của trưởng bộ môn. Đã lọc sẵn theo phạm vi người đang đăng nhập.
/// </summary>
public sealed record UnidentifiedLecturerReportDto(
    int SectionCount,
    int LecturerCount,
    IReadOnlyList<UnidentifiedSectionDto> Sections,
    IReadOnlyList<UnidentifiedLecturerGroupDto> Lecturers);

/// <summary>Kết quả import lớp học phần, rộng hơn <see cref="CatalogImportDto"/>.</summary>
public sealed record CourseSectionImportDto(
    int TotalCount,
    int CreatedCount,
    int SkippedCount,
    IReadOnlyList<CatalogImportItemDto> Items,
    /// <summary>Số học phần được tạo tự động vì chưa có trong danh mục.</summary>
    int CreatedCourseCount,
    /// <summary>Số giảng viên được tạo tự động từ email trong tệp.</summary>
    int CreatedLecturerCount,
    /// <summary>Số lớp đã có sẵn và được cập nhật lại mã giảng viên.</summary>
    int UpdatedSectionCount,
    IReadOnlyList<UnidentifiedLecturerDto> UnidentifiedLecturers);

/// <summary>
/// Bổ sung thông tin cho một giảng viên đang ở trạng thái "chưa xác định" của một
/// lớp học phần. Đúng những gì tệp import mang theo cho một dòng thiếu email:
/// tên, email, bộ môn, khoa viện.
/// </summary>
public sealed record ResolveUnidentifiedLecturerCommand(
    string FullName,
    string Email,
    int? DepartmentId,
    int? FacultyId);

/// <summary>Kết quả của thao tác trên. Chỉ đúng một lớp được gắn mã.</summary>
public sealed record ResolveUnidentifiedLecturerDto(
    LecturerDto Lecturer,
    /// <summary>Giảng viên vừa được tạo mới, hay đã có sẵn theo email.</summary>
    bool LecturerCreated);

public sealed record LecturerDto(
    int LecturerId,
    string FullName,
    int? DepartmentId,
    int? FacultyId,
    string? Email,
    string? PhoneNumber,
    int? PositionId);

/// <summary>CourseType null nghĩa là chưa xác định bắt buộc hay tự chọn.</summary>
public sealed record CourseDto(
    int CourseId,
    string CourseCode,
    string CourseName,
    int Credits,
    string? CourseType,
    int? DepartmentId,
    int? FacultyId,
    int? PrerequisiteCourseId);

public sealed record SaveFacultyCommand(string FacultyName);

/// <summary>DepartmentId chỉ dùng khi tạo mới; khi cập nhật thì lấy theo id trên đường dẫn.</summary>
public sealed record SaveDepartmentCommand(int DepartmentId, string DepartmentName, int? FacultyId);

public sealed record SavePositionCommand(string PositionName);

public sealed record SaveMajorCommand(string MajorCode, string MajorName, int FacultyId);

public sealed record SaveLecturerCommand(
    string FullName,
    int? DepartmentId,
    int? FacultyId,
    string? Email,
    string? PhoneNumber,
    int? PositionId);

public sealed record SaveCourseCommand(
    string CourseCode,
    string CourseName,
    int Credits,
    string? CourseType,
    int? DepartmentId,
    int? FacultyId,
    int? PrerequisiteCourseId);

/// <summary>Một dòng của tệp Excel. Khoa viện đi vào theo TÊN, không phải theo id.</summary>
public sealed record ImportFacultyRowCommand(int RowNumber, string FacultyName);

/// <summary>Mã bộ môn do người dùng tự nhập trong tệp; "Departments"."DepartmentId" không tự tăng.</summary>
public sealed record ImportDepartmentRowCommand(int RowNumber, int DepartmentId, string DepartmentName, string? FacultyName);

public sealed record ImportMajorRowCommand(
    int RowNumber,
    string MajorCode,
    string MajorName,
    string? FacultyName);

/// <summary>
/// Một dòng giảng viên trong tệp Excel. Khoa viện, bộ môn và chức vụ đi vào theo TÊN.
/// PositionName bỏ trống thì dùng <see cref="CatalogDefaults.PositionName"/>.
/// </summary>
public sealed record ImportLecturerRowCommand(
    int RowNumber,
    string FullName,
    string? Email,
    string? PhoneNumber,
    string? FacultyName,
    string? DepartmentName,
    string? PositionName);

public static class CatalogDefaults
{
    /// <summary>Chức vụ mặc định khi tệp Excel bỏ trống cột chức vụ.</summary>
    public const string PositionName = "Giảng viên";
}

/// <summary>
/// Một dòng học phần trong tệp Excel. Khoa viện, bộ môn và học phần tiên quyết
/// đi vào theo TÊN / MÃ, được tra ngược ra id khi import.
/// </summary>
public sealed record ImportCourseRowCommand(
    int RowNumber,
    string CourseCode,
    string CourseName,
    string? Credits,
    string? CourseType,
    string? FacultyName,
    string? DepartmentName,
    string? PrerequisiteCourseCode);

public sealed record CatalogImportItemDto(int RowNumber, string Name, string? FacultyName, bool Succeeded, string? ErrorCode);

public sealed record CatalogImportDto(
    int TotalCount,
    int CreatedCount,
    int SkippedCount,
    IReadOnlyList<CatalogImportItemDto> Items);

public sealed record CatalogOperationResult<T>(bool Succeeded, string? ErrorCode, T? Value);

public interface ICatalogService
{
    Task<IReadOnlyList<FacultyDto>> GetFacultiesAsync(CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<FacultyDto>> CreateFacultyAsync(
        SaveFacultyCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<FacultyDto>> UpdateFacultyAsync(
        int facultyId,
        SaveFacultyCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<bool>> DeleteFacultyAsync(
        int facultyId,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<CatalogImportDto>> ImportFacultiesAsync(
        IReadOnlyList<ImportFacultyRowCommand> rows,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DepartmentDto>> GetDepartmentsAsync(CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<DepartmentDto>> CreateDepartmentAsync(
        SaveDepartmentCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<DepartmentDto>> UpdateDepartmentAsync(
        int departmentId,
        SaveDepartmentCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<bool>> DeleteDepartmentAsync(
        int departmentId,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<CatalogImportDto>> ImportDepartmentsAsync(
        IReadOnlyList<ImportDepartmentRowCommand> rows,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PositionDto>> GetPositionsAsync(CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<PositionDto>> CreatePositionAsync(
        SavePositionCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<PositionDto>> UpdatePositionAsync(
        int positionId,
        SavePositionCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<bool>> DeletePositionAsync(
        int positionId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<MajorDto>> GetMajorsAsync(CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<MajorDto>> CreateMajorAsync(
        SaveMajorCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<MajorDto>> UpdateMajorAsync(
        int majorId,
        SaveMajorCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<bool>> DeleteMajorAsync(
        int majorId,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<CatalogImportDto>> ImportMajorsAsync(
        IReadOnlyList<ImportMajorRowCommand> rows,
        CancellationToken cancellationToken = default);

    /// <summary>Danh sách năm học kèm học kỳ, dùng cho cây bên trái màn hình lớp học phần.</summary>
    Task<IReadOnlyList<AcademicYearDto>> GetAcademicYearsAsync(CancellationToken cancellationToken = default);

    /// <summary>Tạo năm học và tự sinh ba học kỳ mặc định.</summary>
    Task<CatalogOperationResult<AcademicYearDto>> CreateAcademicYearAsync(
        SaveAcademicYearCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<AcademicYearDto>> UpdateAcademicYearAsync(
        int academicYearId,
        SaveAcademicYearCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<bool>> DeleteAcademicYearAsync(
        int academicYearId,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<SemesterDto>> CreateSemesterAsync(
        SaveSemesterCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<SemesterDto>> UpdateSemesterAsync(
        int semesterId,
        SaveSemesterCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<bool>> DeleteSemesterAsync(
        int semesterId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CourseSectionDto>> GetCourseSectionsAsync(
        int? semesterId,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<CourseSectionDto>> CreateCourseSectionAsync(
        SaveCourseSectionCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<CourseSectionDto>> UpdateCourseSectionAsync(
        int courseSectionId,
        SaveCourseSectionCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<bool>> DeleteCourseSectionAsync(
        int courseSectionId,
        CancellationToken cancellationToken = default);

    /// <summary>Import lớp học phần vào một học kỳ đã chọn.</summary>
    Task<CatalogOperationResult<CourseSectionImportDto>> ImportCourseSectionsAsync(
        int semesterId,
        IReadOnlyList<ImportCourseSectionRowCommand> rows,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LecturerDto>> GetLecturersAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Các lớp chưa gắn được giảng viên, đã lọc theo phạm vi người đang đăng nhập.
    /// Trưởng bộ môn gọi thì ra bộ môn mình, quản trị gọi thì ra tất cả.
    /// </summary>
    /// <param name="semesterId">Bỏ trống thì lấy mọi học kỳ.</param>
    Task<UnidentifiedLecturerReportDto> GetUnidentifiedLecturersAsync(
        int? semesterId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Bổ sung email cho giảng viên chưa xác định của MỘT lớp, chạy đúng nhánh mà
    /// <see cref="ImportCourseSectionsAsync"/> chạy cho một dòng có email: tra giảng
    /// viên theo email, chưa có thì tạo mới kèm tài khoản đăng nhập, rồi gắn mã và
    /// xoá cột tên chưa xác định.
    /// <para>
    /// Cố ý KHÔNG đụng tới các lớp khác cùng tên. Đây là sửa tay cho một lớp, mà hai
    /// lớp treo cùng một tên vẫn có thể là hai người khác nhau — gắn hộ cả loạt là
    /// gán nhầm email của người này cho lớp của người kia.
    /// </para>
    /// </summary>
    Task<CatalogOperationResult<ResolveUnidentifiedLecturerDto>> ResolveUnidentifiedLecturerAsync(
        int courseSectionId,
        ResolveUnidentifiedLecturerCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<LecturerDto>> CreateLecturerAsync(
        SaveLecturerCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<LecturerDto>> UpdateLecturerAsync(
        int lecturerId,
        SaveLecturerCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<bool>> DeleteLecturerAsync(
        int lecturerId,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<CatalogImportDto>> ImportLecturersAsync(
        IReadOnlyList<ImportLecturerRowCommand> rows,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CourseDto>> GetCoursesAsync(CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<CourseDto>> CreateCourseAsync(
        SaveCourseCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<CourseDto>> UpdateCourseAsync(
        int courseId,
        SaveCourseCommand command,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<bool>> DeleteCourseAsync(
        int courseId,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<CatalogImportDto>> ImportCoursesAsync(
        IReadOnlyList<ImportCourseRowCommand> rows,
        CancellationToken cancellationToken = default);

    Task<CatalogOperationResult<FacultyDto>> RestoreFacultyAsync(int facultyId, CancellationToken cancellationToken = default);
    Task<CatalogOperationResult<DepartmentDto>> RestoreDepartmentAsync(int departmentId, CancellationToken cancellationToken = default);
    Task<CatalogOperationResult<MajorDto>> RestoreMajorAsync(int majorId, CancellationToken cancellationToken = default);
    Task<CatalogOperationResult<AcademicYearDto>> RestoreAcademicYearAsync(int academicYearId, CancellationToken cancellationToken = default);
    Task<CatalogOperationResult<SemesterDto>> RestoreSemesterAsync(int semesterId, CancellationToken cancellationToken = default);
    Task<CatalogOperationResult<CourseSectionDto>> RestoreCourseSectionAsync(int courseSectionId, CancellationToken cancellationToken = default);
    Task<CatalogOperationResult<LecturerDto>> RestoreLecturerAsync(int lecturerId, CancellationToken cancellationToken = default);
    Task<CatalogOperationResult<CourseDto>> RestoreCourseAsync(int courseId, CancellationToken cancellationToken = default);
}

public static class CatalogErrorCodes
{
    public const string InvalidRequest = "CATALOG_INVALID_REQUEST";

    public const string FacultyNotFound = "CATALOG_FACULTY_NOT_FOUND";
    public const string FacultyNameRequired = "CATALOG_FACULTY_NAME_REQUIRED";
    public const string FacultyNameExists = "CATALOG_FACULTY_NAME_EXISTS";
    public const string FacultyDuplicateInFile = "CATALOG_FACULTY_DUPLICATE_IN_FILE";
    public const string FacultyInUse = "CATALOG_FACULTY_IN_USE";

    public const string DepartmentNotFound = "CATALOG_DEPARTMENT_NOT_FOUND";
    public const string DepartmentNameRequired = "CATALOG_DEPARTMENT_NAME_REQUIRED";
    public const string DepartmentIdRequired = "CATALOG_DEPARTMENT_ID_REQUIRED";
    public const string DepartmentIdExists = "CATALOG_DEPARTMENT_ID_EXISTS";
    public const string DepartmentIdDuplicateInFile = "CATALOG_DEPARTMENT_ID_DUPLICATE_IN_FILE";
    public const string DepartmentInUse = "CATALOG_DEPARTMENT_IN_USE";

    /// <summary>Tệp import phải có tên học phần thì mới tạo mới được học phần chưa có.</summary>
    public const string CourseNameRequiredForAutoCreate = "CATALOG_COURSE_NAME_REQUIRED_FOR_AUTO_CREATE";

    /// <summary>Cột "Mã BM" không phải số nguyên dương.</summary>
    public const string DepartmentCodeInvalid = "CATALOG_DEPARTMENT_CODE_INVALID";

    public const string PositionNotFound = "CATALOG_POSITION_NOT_FOUND";
    public const string PositionNameRequired = "CATALOG_POSITION_NAME_REQUIRED";
    public const string PositionNameExists = "CATALOG_POSITION_NAME_EXISTS";

    public const string MajorNotFound = "CATALOG_MAJOR_NOT_FOUND";
    public const string MajorCodeRequired = "CATALOG_MAJOR_CODE_REQUIRED";
    public const string MajorNameRequired = "CATALOG_MAJOR_NAME_REQUIRED";
    public const string MajorFacultyRequired = "CATALOG_MAJOR_FACULTY_REQUIRED";
    public const string MajorExists = "CATALOG_MAJOR_EXISTS";

    public const string AcademicYearNotFound = "CATALOG_ACADEMIC_YEAR_NOT_FOUND";
    public const string AcademicYearNameRequired = "CATALOG_ACADEMIC_YEAR_NAME_REQUIRED";
    public const string AcademicYearNameExists = "CATALOG_ACADEMIC_YEAR_NAME_EXISTS";
    public const string AcademicYearNameInvalid = "CATALOG_ACADEMIC_YEAR_NAME_INVALID";

    public const string SemesterNotFound = "CATALOG_SEMESTER_NOT_FOUND";
    public const string SemesterNameRequired = "CATALOG_SEMESTER_NAME_REQUIRED";
    public const string SemesterNameExists = "CATALOG_SEMESTER_NAME_EXISTS";

    public const string CourseSectionNotFound = "CATALOG_COURSE_SECTION_NOT_FOUND";
    public const string CourseSectionNameRequired = "CATALOG_COURSE_SECTION_NAME_REQUIRED";
    public const string CourseSectionExists = "CATALOG_COURSE_SECTION_EXISTS";
    public const string CourseSectionSizeInvalid = "CATALOG_COURSE_SECTION_SIZE_INVALID";
    public const string CourseSectionDuplicateInFile = "CATALOG_COURSE_SECTION_DUPLICATE_IN_FILE";
    public const string SectionLecturerRequired = "CATALOG_SECTION_LECTURER_REQUIRED";

    /// <summary>Lớp đã có mã giảng viên nên không còn gì để bổ sung email.</summary>
    public const string SectionLecturerAlreadySet = "CATALOG_SECTION_LECTURER_ALREADY_SET";

    public const string LecturerAmbiguous = "CATALOG_LECTURER_AMBIGUOUS";

    public const string LecturerNotFound = "CATALOG_LECTURER_NOT_FOUND";
    /// <summary>
    /// Bản ghi đích nằm ngoài phạm vi của người đang đăng nhập, hoặc hành động này
    /// không dành cho vai trò đó. Endpoint trả 403.
    /// </summary>
    public const string OutOfScope = "CATALOG_OUT_OF_SCOPE";

    public const string LecturerNameRequired = "CATALOG_LECTURER_NAME_REQUIRED";
    public const string LecturerEmailRequired = "CATALOG_LECTURER_EMAIL_REQUIRED";
    public const string LecturerEmailExists = "CATALOG_LECTURER_EMAIL_EXISTS";
    public const string LecturerEmailDuplicateInFile = "CATALOG_LECTURER_EMAIL_DUPLICATE_IN_FILE";
    public const string LecturerInUse = "CATALOG_LECTURER_IN_USE";

    public const string CourseNotFound = "CATALOG_COURSE_NOT_FOUND";
    public const string CourseCodeRequired = "CATALOG_COURSE_CODE_REQUIRED";
    public const string CourseNameRequired = "CATALOG_COURSE_NAME_REQUIRED";
    public const string CourseCodeExists = "CATALOG_COURSE_CODE_EXISTS";
    public const string CourseDuplicateInFile = "CATALOG_COURSE_DUPLICATE_IN_FILE";
    public const string CourseCreditsInvalid = "CATALOG_COURSE_CREDITS_INVALID";
    public const string CourseTypeInvalid = "CATALOG_COURSE_TYPE_INVALID";
    public const string PrerequisiteNotFound = "CATALOG_PREREQUISITE_NOT_FOUND";
    public const string CourseInUse = "CATALOG_COURSE_IN_USE";
}
