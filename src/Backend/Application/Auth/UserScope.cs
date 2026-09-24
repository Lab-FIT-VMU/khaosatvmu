namespace Application.Auth;

/// <summary>Mã của các vai trò có thật trong bảng "Roles".</summary>
public static class RoleCodes
{
    public const string Admin = "ADMIN";
    public const string SurveyAdmin = "SURVEY_ADMIN";

    /// <summary>
    /// Ban Giám hiệu: thấy toàn bộ dữ liệu ngang quản trị khảo sát nhưng CHỈ ĐỌC —
    /// không phát đợt, không sửa danh mục, không cập nhật điểm.
    /// </summary>
    public const string BoardOfDirectors = "BOARD_OF_DIRECTORS";

    /// <summary>
    /// Trưởng khoa/viện: như trưởng bộ môn nhưng phạm vi là CẢ KHOA, tức mọi bộ môn
    /// thuộc khoa của mình.
    /// </summary>
    public const string FacultyManager = "FACULTY_MANAGER";

    public const string DepartmentManager = "DEPARTMENT_MANAGER";
    public const string DeputyDepartmentManager = "DEPUTY_DEPARTMENT_MANAGER";
    public const string Lecturer = "LECTURER";
}

/// <summary>
/// Phạm vi dữ liệu của người đang đăng nhập — lớp phân quyền thứ hai, tách hẳn với
/// lớp thứ nhất là quyền vào module. Xem congviec2.md mục D1.
/// <para>
/// Chỉ được dựng bởi <see cref="IUserScopeResolver"/>. Các service khác nhận sẵn bản
/// ghi này chứ không tự đi tra, để logic quy phạm vi nằm đúng một chỗ.
/// </para>
/// </summary>
/// <param name="RoleCode">Vai trò của profile ĐANG hoạt động, không phải của user.</param>
/// <param name="LecturerId">Hồ sơ giảng viên gắn với tài khoản; null nếu là tài khoản quản trị thuần.</param>
/// <param name="DepartmentId">Bộ môn của giảng viên đó.</param>
/// <param name="FacultyId">Khoa của giảng viên đó.</param>
/// <param name="SeesEverything">Không bị giới hạn phạm vi, thấy toàn bộ dữ liệu.</param>
public sealed record UserScope(
    string RoleCode,
    int? LecturerId,
    int? DepartmentId,
    int? FacultyId,
    bool SeesEverything)
{
    /// <summary>
    /// Phạm vi của quản trị viên: không lọc gì cả. Dùng cho <c>ADMIN</c> và
    /// <c>SURVEY_ADMIN</c> — hai vai trò cấp hệ thống, không gắn với bộ môn nào.
    /// </summary>
    public static UserScope Unrestricted(string roleCode) =>
        new(roleCode, null, null, null, SeesEverything: true);

    /// <summary>
    /// Phạm vi rỗng: chưa đăng nhập, hoặc tài khoản không tra ra được hồ sơ giảng
    /// viên nào. Không thấy gì cả.
    /// </summary>
    public static readonly UserScope None =
        new(string.Empty, null, null, null, SeesEverything: false);

    /// <summary>
    /// Mức phạm vi hẹp nhất: chỉ thấy dữ liệu gắn với CHÍNH MÌNH, không thấy cả bộ
    /// môn. Lớp học phần đi theo <c>CourseSections.LecturerId</c>, học phần đi theo
    /// các học phần có ít nhất một lớp mình dạy. Xem congviec3.md mục H2.
    /// </summary>
    public bool SeesOnlyOwn => RoleCode == RoleCodes.Lecturer;

    /// <summary>
    /// Phạm vi cả khoa: thấy mọi bộ môn thuộc khoa của mình, không chỉ bộ môn gắn với
    /// hồ sơ giảng viên. Dùng cho trưởng khoa/viện.
    /// <para>
    /// Mọi chỗ lọc "không phải SeesEverything thì lọc theo <c>DepartmentId</c>" đều
    /// phải hỏi cờ này TRƯỚC, nếu không trưởng khoa chỉ thấy đúng bộ môn mình đứng tên.
    /// </para>
    /// </summary>
    public bool SeesWholeFaculty => RoleCode == RoleCodes.FacultyManager;

    /// <summary>
    /// Không được ghi bất cứ thứ gì. Hai vai trò chỉ đọc: giảng viên (chỉ theo dõi lớp
    /// mình dạy) và Ban Giám hiệu (thấy toàn trường nhưng không can thiệp số liệu).
    /// Xem congviec3.md mục H3.
    /// </summary>
    public bool IsReadOnly => SeesOnlyOwn || RoleCode == RoleCodes.BoardOfDirectors;

    /// <summary>
    /// Thấy toàn bộ dữ liệu VÀ được ghi. Ban Giám hiệu thấy toàn trường nhưng chỉ đọc,
    /// nên mọi chỗ trước đây dùng <see cref="SeesEverything"/> để mở khoá thao tác
    /// quản trị phải chuyển sang cờ này.
    /// </summary>
    public bool ManagesEverything => SeesEverything && !IsReadOnly;

    public bool CanManageSurveyCampaigns => ManagesEverything;

    public bool CanAddSurveyScope =>
        ManagesEverything || (ManagesOwnUnit && !SeesNothing);

    public bool CanManageCourseSections => ManagesEverything;

    public bool CanResolveCourseSectionLecturer =>
        ManagesEverything || (ManagesOwnUnit && !SeesNothing);

    /// <summary>Hai vai trò quản lý cấp đơn vị: trưởng bộ môn và trưởng khoa/viện.</summary>
    private bool ManagesOwnUnit =>
        RoleCode is RoleCodes.DepartmentManager
            or RoleCodes.DeputyDepartmentManager
            or RoleCodes.FacultyManager;

    /// <summary>
    /// Bị giới hạn phạm vi nhưng lại không biết giới hạn vào đâu. Gặp trường hợp này
    /// thì phải trả về danh sách RỖNG, tuyệt đối không được rơi vào nhánh không lọc —
    /// đó là cách một lỗi phân quyền lọt qua mà nhìn vẫn như chạy đúng.
    /// <para>
    /// Mỗi mức phạm vi hỏng theo một kiểu: mức khoa thì thiếu <c>FacultyId</c>, mức bộ
    /// môn thì thiếu <c>DepartmentId</c>, mức chính mình thì thiếu <c>LecturerId</c>.
    /// </para>
    /// </summary>
    public bool SeesNothing => !SeesEverything
        && (SeesOnlyOwn
            ? LecturerId is null
            : SeesWholeFaculty
                ? FacultyId is null
                : DepartmentId is null);
}

/// <summary>Dựng <see cref="UserScope"/> cho request hiện tại.</summary>
public interface IUserScopeResolver
{
    Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default);
}
