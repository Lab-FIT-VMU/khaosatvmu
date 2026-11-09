using API.Auth;
using Application.Students;
using Microsoft.AspNetCore.Mvc;

namespace API.Students;

/// <summary>
/// Danh mục sinh viên (Danh mục đào tạo → Sinh viên): xem theo khóa, nạp danh sách hai bước
/// (/import/preview rồi /import/commit với mã băm của bản xem trước). Không trả điểm của sinh viên.
/// </summary>
public static class StudentEndpoints
{
    public static IEndpointRouteBuilder MapStudentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/students")
            .RequireAuthorization(AuthPolicies.StudentsAccess);

        group.MapGet("/", async (
            [FromQuery] int? cohortId,
            [FromQuery] bool? unassigned,
            [FromServices] IStudentService service,
            CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await service.ListAsync(cohortId, unassigned ?? false, ct));
            }
            catch (StudentException exception) { return ToError(exception); }
        });

        group.MapPost("/import/preview", async (
            [FromBody] StudentImportRequest request,
            [FromServices] IStudentService service,
            CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await service.PreviewImportAsync(request, ct));
            }
            catch (StudentException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/import/commit", async (
            [FromBody] StudentImportRequest request,
            [FromServices] IStudentService service,
            CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await service.ImportAsync(request, ct));
            }
            catch (StudentException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        return app;
    }

    private static IResult ToError(StudentException exception) => Results.Json(
        new { errorCode = exception.ErrorCode, message = exception.Message },
        statusCode: exception.ErrorCode switch
        {
            StudentErrorCodes.OutOfScope => StatusCodes.Status403Forbidden,
            StudentErrorCodes.PreviewMismatch => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest,
        });
}
