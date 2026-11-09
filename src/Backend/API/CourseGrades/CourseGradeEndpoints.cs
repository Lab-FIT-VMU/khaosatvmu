using API.Auth;
using Application.CourseGrades;
using Microsoft.AspNetCore.Mvc;

namespace API.CourseGrades;

/// <summary>
/// Nạp điểm học phần theo kỳ (mục "Tải lên dữ liệu điểm"). Chọn kỳ rồi nạp, như trang Lớp học
/// phần. Hai bước như module tốt nghiệp: /imports/preview rồi /imports/commit với cùng file và
/// mã băm của bản xem trước. Không có đường dẫn nào trả về dòng điểm của từng sinh viên.
/// </summary>
public static class CourseGradeEndpoints
{
    public static IEndpointRouteBuilder MapCourseGradeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/course-grades")
            .RequireAuthorization(AuthPolicies.CourseGradeUploadAccess);

        group.MapGet("/semesters", async (
            [FromServices] ICourseGradeImportService service,
            CancellationToken ct) =>
            Results.Ok(await service.GetSemestersAsync(ct)));

        group.MapGet("/runs/latest", async (
            [FromServices] ICourseGradeImportService service,
            CancellationToken ct) =>
        {
            var run = await service.GetLatestRunAsync(ct);
            return run is null ? Results.NoContent() : Results.Ok(run);
        });

        group.MapPost("/runs", async (
            [FromServices] ICourseGradeImportService service,
            CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await service.RecomputeAsync(ct));
            }
            catch (CourseGradeException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/imports/preview", async (
            HttpRequest request,
            [FromServices] ICourseGradeImportService service,
            CancellationToken ct) =>
        {
            try
            {
                var form = await request.ReadFormAsync(ct);
                var file = GetWorkbook(form);
                await using var stream = file.OpenReadStream();
                return Results.Ok(await service.PreviewAsync(RequiredInt(form, "semesterId"), file.FileName, stream, ct));
            }
            catch (CourseGradeException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/imports/commit", async (
            HttpRequest request,
            [FromServices] ICourseGradeImportService service,
            CancellationToken ct) =>
        {
            try
            {
                var form = await request.ReadFormAsync(ct);
                var file = GetWorkbook(form);
                await using var stream = file.OpenReadStream();
                var result = await service.ImportAsync(new CourseGradeImportCommand(
                    RequiredInt(form, "semesterId"),
                    file.FileName,
                    stream,
                    form["previewFileHash"].FirstOrDefault(),
                    long.TryParse(form["expectedActiveRevisionId"].FirstOrDefault(), out var expected) ? expected : null,
                    form["replaceReason"].FirstOrDefault()), ct);
                return Results.Ok(result);
            }
            catch (CourseGradeException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapDelete("/semesters/{semesterId:int}", async (
            int semesterId,
            [FromBody] RemoveCourseGradeSemesterRequest? request,
            [FromServices] ICourseGradeImportService service,
            CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await service.RemoveSemesterAsync(semesterId, request?.Reason, ct));
            }
            catch (CourseGradeException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        return app;
    }

    public sealed record RemoveCourseGradeSemesterRequest(string? Reason);

    private static IResult ToError(CourseGradeException exception)
    {
        var statusCode = exception.ErrorCode switch
        {
            CourseGradeErrorCodes.OutOfScope => StatusCodes.Status403Forbidden,
            CourseGradeErrorCodes.SemesterNotFound or CourseGradeErrorCodes.NothingToRemove or CourseGradeErrorCodes.NothingToAnalyze => StatusCodes.Status404NotFound,
            CourseGradeErrorCodes.ConcurrentReplace => StatusCodes.Status409Conflict,
            CourseGradeErrorCodes.EncryptionNotConfigured => StatusCodes.Status503ServiceUnavailable,
            _ => StatusCodes.Status400BadRequest,
        };
        return Results.Json(new { errorCode = exception.ErrorCode, message = exception.Message }, statusCode: statusCode);
    }

    private static IFormFile GetWorkbook(IFormCollection form)
    {
        var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
        if (file is null || file.Length == 0)
        {
            throw new CourseGradeException(CourseGradeErrorCodes.InvalidImport, "Chưa chọn file điểm để nạp.");
        }
        if (!Path.GetExtension(file.FileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            throw new CourseGradeException(CourseGradeErrorCodes.InvalidImport, "Chỉ chấp nhận file Excel định dạng .xlsx.");
        }
        return file;
    }

    private static int RequiredInt(IFormCollection form, string key) =>
        int.TryParse(form[key].FirstOrDefault(), out var value)
            ? value
            : throw new CourseGradeException(CourseGradeErrorCodes.InvalidImport, "Chưa chọn học kỳ để nạp điểm.");
}
