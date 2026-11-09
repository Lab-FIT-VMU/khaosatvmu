using API.Auth;
using Application.CourseGrades;
using Microsoft.AspNetCore.Mvc;

namespace API.CourseGrades;

/// <summary>
/// Báo cáo phân tích điểm học phần (kết quả của lượt tính hiện hành). Chỉ đọc. Phạm vi theo người
/// xem: quản trị hệ thống, quản trị khảo sát, Ban giám hiệu xem hết; quản lý khoa / bộ môn xem
/// đơn vị mình. Không có đường dẫn nào trả về dòng điểm của từng sinh viên.
/// </summary>
public static class CourseGradeAnalysisEndpoints
{
    public static IEndpointRouteBuilder MapCourseGradeAnalysisEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/course-grade-analysis")
            .RequireAuthorization(AuthPolicies.CourseGradeAnalysisAccess);

        group.MapGet("/overview", (
            [FromServices] ICourseGradeAnalysisService service,
            CancellationToken ct) => Handle(() => service.GetOverviewAsync(ct)));

        group.MapGet("/terms/{semesterId:int}/courses", (
            int semesterId,
            [FromQuery] int? facultyId,
            [FromQuery] int? departmentId,
            [FromServices] ICourseGradeAnalysisService service,
            CancellationToken ct) => Handle(() => service.GetCoursesAsync(semesterId, facultyId, departmentId, ct)));

        group.MapGet("/terms/{semesterId:int}/sections", (
            int semesterId,
            [FromQuery] int? departmentId,
            [FromQuery] string? courseCode,
            [FromServices] ICourseGradeAnalysisService service,
            CancellationToken ct) => Handle(() => service.GetSectionsAsync(semesterId, departmentId, courseCode, ct)));

        group.MapGet("/lecturer-courses", (
            [FromQuery] int? departmentId,
            [FromQuery] string? courseCode,
            [FromServices] ICourseGradeAnalysisService service,
            CancellationToken ct) => Handle(() => service.GetLecturerCoursesAsync(departmentId, courseCode, ct)));

        return app;
    }

    private static async Task<IResult> Handle<T>(Func<Task<T>> action)
    {
        try
        {
            return Results.Ok(await action());
        }
        catch (CourseGradeException exception)
        {
            var statusCode = exception.ErrorCode switch
            {
                CourseGradeErrorCodes.OutOfScope => StatusCodes.Status403Forbidden,
                _ => StatusCodes.Status400BadRequest,
            };
            return Results.Json(new { errorCode = exception.ErrorCode, message = exception.Message }, statusCode: statusCode);
        }
    }
}
