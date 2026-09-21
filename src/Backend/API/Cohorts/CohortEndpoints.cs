using API.Auth;
using Application.Cohorts;

namespace API.Cohorts;

public static class CohortEndpoints
{
    public static IEndpointRouteBuilder MapCohortEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/catalog")
            .RequireAuthorization(AuthPolicies.CohortMajorsAccess);

        var cohorts = group.MapGroup("/cohorts");
        var cohortMajors = group.MapGroup("/cohort-majors");

        // ------------------------------------------------------------- Khoá học

        cohorts.MapGet("", async (ICohortService service, CancellationToken ct) =>
            Results.Ok(await service.GetCohortsAsync(ct)));

        cohorts.MapPost("", async (
            SaveCohortRequest request,
            ICohortService service,
            CancellationToken ct) =>
            ToResult(await service.CreateCohortAsync(
                new SaveCohortCommand(request.AcademicYearId, request.CohortCode, request.CohortName), ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        cohorts.MapPut("/{cohortId:int}", async (
            int cohortId,
            SaveCohortRequest request,
            ICohortService service,
            CancellationToken ct) =>
            ToResult(await service.UpdateCohortAsync(
                cohortId,
                new SaveCohortCommand(request.AcademicYearId, request.CohortCode, request.CohortName), ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        cohorts.MapDelete("/{cohortId:int}", async (
            int cohortId,
            ICohortService service,
            CancellationToken ct) =>
            ToResult(await service.DeleteCohortAsync(cohortId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        // --------------------------------------------- Khoá ngành đào tạo

        cohortMajors.MapGet("", async (
            int? cohortId,
            ICohortService service,
            CancellationToken ct) =>
            Results.Ok(await service.GetCohortMajorsAsync(cohortId, ct)));

        cohortMajors.MapPost("", async (
            SaveCohortMajorRequest request,
            ICohortService service,
            CancellationToken ct) =>
            ToResult(await service.CreateCohortMajorAsync(
                new SaveCohortMajorCommand(
                    request.CohortId,
                    request.CohortMajorCode ?? string.Empty,
                    request.MajorId,
                    request.StudentCount), ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        cohortMajors.MapPut("/{cohortMajorId:int}", async (
            int cohortMajorId,
            SaveCohortMajorRequest request,
            ICohortService service,
            CancellationToken ct) =>
            ToResult(await service.UpdateCohortMajorAsync(
                cohortMajorId,
                new SaveCohortMajorCommand(
                    request.CohortId,
                    request.CohortMajorCode ?? string.Empty,
                    request.MajorId,
                    request.StudentCount), ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        cohortMajors.MapDelete("/{cohortMajorId:int}", async (
            int cohortMajorId,
            ICohortService service,
            CancellationToken ct) =>
            ToResult(await service.DeleteCohortMajorAsync(cohortMajorId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        cohortMajors.MapPost("/import", async (
            ImportCohortMajorsRequest request,
            ICohortService service,
            CancellationToken ct) =>
        {
            var rows = (request.Rows ?? [])
                .Select(x => new ImportCohortMajorRowCommand(
                    x.RowNumber,
                    x.CohortMajorCode ?? string.Empty,
                    x.MajorName,
                    x.StudentCount))
                .ToList();
            return ToResult(await service.ImportCohortMajorsAsync(request.CohortId, rows, ct));
        })
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        return endpoints;
    }

    private static IResult ToResult<T>(CohortOperationResult<T> result)
    {
        if (result.Succeeded && result.Value is not null)
        {
            return Results.Ok(result.Value);
        }

        var statusCode = result.ErrorCode switch
        {
            CohortErrorCodes.CohortNotFound => StatusCodes.Status404NotFound,
            CohortErrorCodes.CohortMajorNotFound => StatusCodes.Status404NotFound,
            CohortErrorCodes.AcademicYearNotFound => StatusCodes.Status404NotFound,
            CohortErrorCodes.MajorNotFound => StatusCodes.Status404NotFound,
            CohortErrorCodes.CohortCodeExists => StatusCodes.Status409Conflict,
            CohortErrorCodes.CohortMajorCodeExists => StatusCodes.Status409Conflict,
            CohortErrorCodes.CohortMajorExists => StatusCodes.Status409Conflict,
            CohortErrorCodes.AcademicYearUsed => StatusCodes.Status409Conflict,
            CohortErrorCodes.CohortInUse => StatusCodes.Status409Conflict,
            CohortErrorCodes.CohortMajorInUse => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest,
        };
        return Results.Json(new { errorCode = result.ErrorCode }, statusCode: statusCode);
    }

    public sealed record SaveCohortRequest(int AcademicYearId, string? CohortCode, string? CohortName);

    public sealed record SaveCohortMajorRequest(
        int CohortId,
        string? CohortMajorCode,
        int MajorId,
        int StudentCount);

    public sealed record ImportCohortMajorsRequest(
        int CohortId,
        IReadOnlyList<ImportCohortMajorRowRequest>? Rows);

    public sealed record ImportCohortMajorRowRequest(
        int RowNumber,
        string? CohortMajorCode,
        string? MajorName,
        int? StudentCount);
}
