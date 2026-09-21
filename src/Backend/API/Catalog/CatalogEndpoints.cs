using API.Auth;
using Application.Catalog;

namespace API.Catalog;

public static class CatalogEndpoints
{
    public static IEndpointRouteBuilder MapCatalogEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/catalog");
        var faculties = group.MapGroup("/faculties")
            .RequireAuthorization(AuthPolicies.FacultiesRead);
        var departments = group.MapGroup("/departments")
            .RequireAuthorization(AuthPolicies.DepartmentsRead);
        var positions = group.MapGroup("/positions")
            .RequireAuthorization(AuthPolicies.LecturersRead);
        var majors = group.MapGroup("/majors")
            .RequireAuthorization(AuthPolicies.MajorsRead);
        // Năm học/học kỳ là dữ liệu tra cứu dùng chung trên header và các module nghiệp vụ.
        // Chỉ quyền Lớp học phần mới được thay đổi dữ liệu này (gắn ở từng endpoint ghi).
        var academicYears = group.MapGroup("/academic-years").RequireAuthorization();
        var semesters = group.MapGroup("/semesters").RequireAuthorization();
        var courseSections = group.MapGroup("/course-sections")
            .RequireAuthorization(AuthPolicies.CourseSectionsAccess);
        var lecturers = group.MapGroup("/lecturers")
            .RequireAuthorization(AuthPolicies.LecturersRead);
        var courses = group.MapGroup("/courses")
            .RequireAuthorization(AuthPolicies.CoursesRead);

        // ------------------------------------------------------------ Faculties

        faculties.MapGet("", async (
            ICatalogService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetFacultiesAsync(cancellationToken)));

        faculties.MapPost("", async (
            SaveFacultyRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateFacultyAsync(
                new SaveFacultyCommand(request.FacultyName),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.FacultiesAccess);

        faculties.MapPut("/{facultyId:int}", async (
            int facultyId,
            SaveFacultyRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateFacultyAsync(
                facultyId,
                new SaveFacultyCommand(request.FacultyName),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.FacultiesAccess);

        faculties.MapDelete("/{facultyId:int}", async (
            int facultyId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteFacultyAsync(facultyId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.FacultiesAccess);

        faculties.MapPost("/import", async (
            ImportFacultiesRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
        {
            var rows = request.Rows?
                .Select(x => new ImportFacultyRowCommand(x.RowNumber, x.FacultyName ?? string.Empty))
                .ToList() ?? [];
            return ToResult(await service.ImportFacultiesAsync(rows, cancellationToken));
        }).AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.FacultiesAccess);

        // ---------------------------------------------------------- Departments

        departments.MapGet("", async (
            ICatalogService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetDepartmentsAsync(cancellationToken)));

        departments.MapPost("", async (
            SaveDepartmentRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateDepartmentAsync(
                new SaveDepartmentCommand(request.DepartmentId, request.DepartmentName, request.FacultyId),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.DepartmentsAccess);

        departments.MapPut("/{departmentId:int}", async (
            int departmentId,
            SaveDepartmentRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateDepartmentAsync(
                departmentId,
                new SaveDepartmentCommand(departmentId, request.DepartmentName, request.FacultyId),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.DepartmentsAccess);

        departments.MapDelete("/{departmentId:int}", async (
            int departmentId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteDepartmentAsync(departmentId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.DepartmentsAccess);

        departments.MapPost("/import", async (
            ImportDepartmentsRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
        {
            var rows = request.Rows?
                .Select(x => new ImportDepartmentRowCommand(
                    x.RowNumber,
                    x.DepartmentId,
                    x.DepartmentName ?? string.Empty,
                    x.FacultyName))
                .ToList() ?? [];
            return ToResult(await service.ImportDepartmentsAsync(rows, cancellationToken));
        }).AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.DepartmentsAccess);

        // ------------------------------------------------------------ Positions

        positions.MapGet("", async (
            ICatalogService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetPositionsAsync(cancellationToken)));

        positions.MapPost("", async (
            SavePositionRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreatePositionAsync(
                new SavePositionCommand(request.PositionName),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.LecturersAccess);

        positions.MapPut("/{positionId:int}", async (
            int positionId,
            SavePositionRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdatePositionAsync(
                positionId,
                new SavePositionCommand(request.PositionName),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.LecturersAccess);

        positions.MapDelete("/{positionId:int}", async (
            int positionId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeletePositionAsync(positionId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.LecturersAccess);

        // --------------------------------------------------------------- Majors

        majors.MapGet("", async (
            ICatalogService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetMajorsAsync(cancellationToken)));

        majors.MapPost("", async (
            SaveMajorRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateMajorAsync(
                new SaveMajorCommand(request.MajorCode, request.MajorName, request.FacultyId),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.MajorsAccess);

        majors.MapPut("/{majorId:int}", async (
            int majorId,
            SaveMajorRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateMajorAsync(
                majorId,
                new SaveMajorCommand(request.MajorCode, request.MajorName, request.FacultyId),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.MajorsAccess);

        majors.MapDelete("/{majorId:int}", async (
            int majorId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteMajorAsync(majorId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.MajorsAccess);

        majors.MapPost("/import", async (
            ImportMajorsRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
        {
            var rows = request.Rows?
                .Select(x => new ImportMajorRowCommand(
                    x.RowNumber,
                    x.MajorCode ?? string.Empty,
                    x.MajorName ?? string.Empty,
                    x.FacultyName))
                .ToList() ?? [];
            return ToResult(await service.ImportMajorsAsync(rows, cancellationToken));
        }).AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.MajorsAccess);

        // ------------------------------------------------- Năm học và học kỳ

        academicYears.MapGet("", async (
            ICatalogService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetAcademicYearsAsync(cancellationToken)));

        academicYears.MapPost("", async (
            SaveAcademicYearRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateAcademicYearAsync(request.ToCommand(), cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CourseSectionsAccess);

        academicYears.MapPut("/{academicYearId:int}", async (
            int academicYearId,
            SaveAcademicYearRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateAcademicYearAsync(
                academicYearId,
                request.ToCommand(),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CourseSectionsAccess);

        academicYears.MapDelete("/{academicYearId:int}", async (
            int academicYearId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteAcademicYearAsync(academicYearId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CourseSectionsAccess);

        semesters.MapPost("", async (
            SaveSemesterRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateSemesterAsync(
                new SaveSemesterCommand(request.SemesterName, request.AcademicYearId),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CourseSectionsAccess);

        semesters.MapPut("/{semesterId:int}", async (
            int semesterId,
            SaveSemesterRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateSemesterAsync(
                semesterId,
                new SaveSemesterCommand(request.SemesterName, request.AcademicYearId),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CourseSectionsAccess);

        semesters.MapDelete("/{semesterId:int}", async (
            int semesterId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteSemesterAsync(semesterId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CourseSectionsAccess);

        // ------------------------------------------------------- Lớp học phần

        courseSections.MapGet("", async (
            int? semesterId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetCourseSectionsAsync(semesterId, cancellationToken)));

        // Danh sách lớp chưa gắn được giảng viên, đã lọc sẵn theo phạm vi người đang
        // đăng nhập. Nuôi cả băng cảnh báo ở trang Lớp học phần lẫn dòng thông báo
        // trên bảng điều khiển của trưởng bộ môn.
        courseSections.MapGet("/unidentified-lecturers", async (
            int? semesterId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetUnidentifiedLecturersAsync(semesterId, cancellationToken)));

        courseSections.MapPost("", async (
            SaveCourseSectionRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateCourseSectionAsync(request.ToCommand(), cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        courseSections.MapPut("/{courseSectionId:int}", async (
            int courseSectionId,
            SaveCourseSectionRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateCourseSectionAsync(
                courseSectionId,
                request.ToCommand(),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        courseSections.MapDelete("/{courseSectionId:int}", async (
            int courseSectionId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteCourseSectionAsync(courseSectionId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        // Bổ sung email cho giảng viên chưa xác định của một lớp. Đòi thêm quyền
        // Giảng viên vì thao tác này tạo được bản ghi trong danh mục giảng viên.
        courseSections.MapPost("/{courseSectionId:int}/resolve-lecturer", async (
            int courseSectionId,
            ResolveUnidentifiedLecturerRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.ResolveUnidentifiedLecturerAsync(
                courseSectionId,
                request.ToCommand(),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.LecturersAccess);

        courseSections.MapPost("/import", async (
            ImportCourseSectionsRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
        {
            var rows = request.Rows?
                .Select(x => new ImportCourseSectionRowCommand(
                    x.RowNumber,
                    x.CourseCode ?? string.Empty,
                    x.CourseName,
                    x.SectionName ?? string.Empty,
                    x.Credits,
                    x.ClassSize,
                    x.DepartmentName,
                    x.DepartmentCode,
                    x.FacultyName,
                    x.LecturerFullName,
                    x.LecturerEmail))
                .ToList() ?? [];
            return ToResult(await service.ImportCourseSectionsAsync(
                request.SemesterId,
                rows,
                cancellationToken));
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        // ------------------------------------------------------------ Lecturers

        lecturers.MapGet("", async (
            ICatalogService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetLecturersAsync(cancellationToken)));

        lecturers.MapPost("", async (
            SaveLecturerRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateLecturerAsync(request.ToCommand(), cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.LecturersAccess);

        lecturers.MapPut("/{lecturerId:int}", async (
            int lecturerId,
            SaveLecturerRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateLecturerAsync(lecturerId, request.ToCommand(), cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.LecturersAccess);

        lecturers.MapDelete("/{lecturerId:int}", async (
            int lecturerId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteLecturerAsync(lecturerId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.LecturersAccess);

        lecturers.MapPost("/import", async (
            ImportLecturersRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
        {
            var rows = request.Rows?
                .Select(x => new ImportLecturerRowCommand(
                    x.RowNumber,
                    x.FullName ?? string.Empty,
                    x.Email,
                    x.PhoneNumber,
                    x.FacultyName,
                    x.DepartmentName,
                    x.PositionName))
                .ToList() ?? [];
            return ToResult(await service.ImportLecturersAsync(rows, cancellationToken));
        }).AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.LecturersAccess);

        // -------------------------------------------------------------- Courses

        courses.MapGet("", async (
            ICatalogService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetCoursesAsync(cancellationToken)));

        courses.MapPost("", async (
            SaveCourseRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateCourseAsync(request.ToCommand(), cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CoursesAccess);

        courses.MapPut("/{courseId:int}", async (
            int courseId,
            SaveCourseRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateCourseAsync(courseId, request.ToCommand(), cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CoursesAccess);

        courses.MapDelete("/{courseId:int}", async (
            int courseId,
            ICatalogService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteCourseAsync(courseId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CoursesAccess);

        courses.MapPost("/import", async (
            ImportCoursesRequest request,
            ICatalogService service,
            CancellationToken cancellationToken) =>
        {
            var rows = request.Rows?
                .Select(x => new ImportCourseRowCommand(
                    x.RowNumber,
                    x.CourseCode ?? string.Empty,
                    x.CourseName ?? string.Empty,
                    x.Credits,
                    x.CourseType,
                    x.FacultyName,
                    x.DepartmentName,
                    x.PrerequisiteCourseCode))
                .ToList() ?? [];
            return ToResult(await service.ImportCoursesAsync(rows, cancellationToken));
        }).AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CoursesAccess);

        // ------------------------------------------------------------ Restore

        faculties.MapPatch("/{facultyId:int}/restore", async (
            int facultyId, ICatalogService service, CancellationToken ct) =>
            ToResult(await service.RestoreFacultyAsync(facultyId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.FacultiesAccess);

        departments.MapPatch("/{departmentId:int}/restore", async (
            int departmentId, ICatalogService service, CancellationToken ct) =>
            ToResult(await service.RestoreDepartmentAsync(departmentId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.DepartmentsAccess);

        majors.MapPatch("/{majorId:int}/restore", async (
            int majorId, ICatalogService service, CancellationToken ct) =>
            ToResult(await service.RestoreMajorAsync(majorId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.MajorsAccess);

        academicYears.MapPatch("/{academicYearId:int}/restore", async (
            int academicYearId, ICatalogService service, CancellationToken ct) =>
            ToResult(await service.RestoreAcademicYearAsync(academicYearId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CourseSectionsAccess);

        semesters.MapPatch("/{semesterId:int}/restore", async (
            int semesterId, ICatalogService service, CancellationToken ct) =>
            ToResult(await service.RestoreSemesterAsync(semesterId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CourseSectionsAccess);

        courseSections.MapPatch("/{courseSectionId:int}/restore", async (
            int courseSectionId, ICatalogService service, CancellationToken ct) =>
            ToResult(await service.RestoreCourseSectionAsync(courseSectionId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        lecturers.MapPatch("/{lecturerId:int}/restore", async (
            int lecturerId, ICatalogService service, CancellationToken ct) =>
            ToResult(await service.RestoreLecturerAsync(lecturerId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.LecturersAccess);

        courses.MapPatch("/{courseId:int}/restore", async (
            int courseId, ICatalogService service, CancellationToken ct) =>
            ToResult(await service.RestoreCourseAsync(courseId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>()
            .RequireAuthorization(AuthPolicies.CoursesAccess);

        return endpoints;
    }

    private static IResult ToResult<T>(CatalogOperationResult<T> result)
    {
        if (result.Succeeded && result.Value is not null)
        {
            return Results.Ok(result.Value);
        }

        var statusCode = result.ErrorCode switch
        {
            CatalogErrorCodes.OutOfScope => StatusCodes.Status403Forbidden,
            CatalogErrorCodes.FacultyNotFound => StatusCodes.Status404NotFound,
            CatalogErrorCodes.DepartmentNotFound => StatusCodes.Status404NotFound,
            CatalogErrorCodes.MajorNotFound => StatusCodes.Status404NotFound,
            CatalogErrorCodes.PositionNotFound => StatusCodes.Status404NotFound,
            CatalogErrorCodes.PositionNameExists => StatusCodes.Status409Conflict,
            CatalogErrorCodes.DepartmentCodeInvalid => StatusCodes.Status400BadRequest,
            CatalogErrorCodes.CourseNameRequiredForAutoCreate => StatusCodes.Status400BadRequest,
            CatalogErrorCodes.CourseNotFound => StatusCodes.Status404NotFound,
            CatalogErrorCodes.LecturerNotFound => StatusCodes.Status404NotFound,
            CatalogErrorCodes.AcademicYearNotFound => StatusCodes.Status404NotFound,
            CatalogErrorCodes.SemesterNotFound => StatusCodes.Status404NotFound,
            CatalogErrorCodes.CourseSectionNotFound => StatusCodes.Status404NotFound,
            CatalogErrorCodes.AcademicYearNameExists => StatusCodes.Status409Conflict,
            CatalogErrorCodes.SemesterNameExists => StatusCodes.Status409Conflict,
            CatalogErrorCodes.CourseSectionExists => StatusCodes.Status409Conflict,
            CatalogErrorCodes.SectionLecturerAlreadySet => StatusCodes.Status409Conflict,
            CatalogErrorCodes.LecturerAmbiguous => StatusCodes.Status409Conflict,
            CatalogErrorCodes.PrerequisiteNotFound => StatusCodes.Status404NotFound,
            CatalogErrorCodes.FacultyNameExists => StatusCodes.Status409Conflict,
            CatalogErrorCodes.CourseCodeExists => StatusCodes.Status409Conflict,
            CatalogErrorCodes.LecturerEmailExists => StatusCodes.Status409Conflict,
            CatalogErrorCodes.LecturerInUse => StatusCodes.Status409Conflict,
            CatalogErrorCodes.FacultyInUse => StatusCodes.Status409Conflict,
            CatalogErrorCodes.DepartmentInUse => StatusCodes.Status409Conflict,
            CatalogErrorCodes.CourseInUse => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };
        return Results.Json(new { errorCode = result.ErrorCode }, statusCode: statusCode);
    }

    public sealed record SaveFacultyRequest(string FacultyName);

    public sealed record SaveDepartmentRequest(int DepartmentId, string DepartmentName, int? FacultyId);

    public sealed record SavePositionRequest(string PositionName);

    public sealed record SaveMajorRequest(string MajorCode, string MajorName, int FacultyId);

    public sealed record ImportFacultiesRequest(IReadOnlyList<ImportFacultyRowRequest>? Rows);

    public sealed record ImportFacultyRowRequest(int RowNumber, string FacultyName);

    public sealed record ImportDepartmentsRequest(IReadOnlyList<ImportDepartmentRowRequest>? Rows);

    public sealed record ImportDepartmentRowRequest(int RowNumber, int DepartmentId, string DepartmentName, string? FacultyName);

    public sealed record ImportMajorsRequest(IReadOnlyList<ImportMajorRowRequest>? Rows);

    public sealed record ImportMajorRowRequest(
        int RowNumber,
        string MajorCode,
        string MajorName,
        string? FacultyName);

    public sealed record SaveAcademicYearRequest(string AcademicYearName, DateOnly? StartDate)
    {
        public SaveAcademicYearCommand ToCommand() => new(AcademicYearName, StartDate);
    }

    public sealed record SaveSemesterRequest(string SemesterName, int AcademicYearId);

    public sealed record SaveCourseSectionRequest(
        int CourseId,
        int SemesterId,
        int? LecturerId,
        string SectionName,
        int ClassSize,
        string? UnidentifiedLecturerName)
    {
        public SaveCourseSectionCommand ToCommand() =>
            new(CourseId, SemesterId, LecturerId, SectionName, ClassSize, UnidentifiedLecturerName);
    }

    public sealed record ResolveUnidentifiedLecturerRequest(
        string? FullName,
        string? Email,
        int? DepartmentId,
        int? FacultyId)
    {
        public ResolveUnidentifiedLecturerCommand ToCommand() => new(
            FullName ?? string.Empty,
            Email ?? string.Empty,
            DepartmentId,
            FacultyId);
    }

    public sealed record ImportCourseSectionsRequest(
        int SemesterId,
        IReadOnlyList<ImportCourseSectionRowRequest>? Rows);

    /// <summary>Các trường tương ứng cột trong tệp Excel gốc của đơn vị đào tạo.</summary>
    public sealed record ImportCourseSectionRowRequest(
        int RowNumber,
        string CourseCode,
        string? CourseName,
        string SectionName,
        string? Credits,
        string? ClassSize,
        string? DepartmentName,
        string? DepartmentCode,
        string? FacultyName,
        string? LecturerFullName,
        string? LecturerEmail);

    public sealed record SaveLecturerRequest(
        string FullName,
        int? DepartmentId,
        int? FacultyId,
        string? Email,
        string? PhoneNumber,
        int? PositionId)
    {
        public SaveLecturerCommand ToCommand() => new(
            FullName,
            DepartmentId,
            FacultyId,
            Email,
            PhoneNumber,
            PositionId);
    }

    public sealed record ImportLecturersRequest(IReadOnlyList<ImportLecturerRowRequest>? Rows);

    public sealed record ImportLecturerRowRequest(
        int RowNumber,
        string FullName,
        string? Email,
        string? PhoneNumber,
        string? FacultyName,
        string? DepartmentName,
        string? PositionName);

    public sealed record SaveCourseRequest(
        string CourseCode,
        string CourseName,
        int Credits,
        string? CourseType,
        int? DepartmentId,
        int? FacultyId,
        int? PrerequisiteCourseId)
    {
        public SaveCourseCommand ToCommand() => new(
            CourseCode,
            CourseName,
            Credits,
            CourseType,
            DepartmentId,
            FacultyId,
            PrerequisiteCourseId);
    }

    public sealed record ImportCoursesRequest(IReadOnlyList<ImportCourseRowRequest>? Rows);

    public sealed record ImportCourseRowRequest(
        int RowNumber,
        string CourseCode,
        string CourseName,
        string? Credits,
        string? CourseType,
        string? FacultyName,
        string? DepartmentName,
        string? PrerequisiteCourseCode);
}
