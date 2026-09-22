using API.Auth;
using Application.GraduationAnalytics2;
using Microsoft.AspNetCore.Mvc;

namespace API.GraduationAnalytics2;

public static class GraduationAnalytics2Endpoints
{
    public static IEndpointRouteBuilder MapGraduationAnalytics2Endpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/graduation-analytics")
            .RequireAuthorization(AuthPolicies.GraduationAnalyticsAccess);

        group.MapGet("/academic-years", async (
            [FromServices] IGraduationAnalyticsV3Service service,
            CancellationToken ct) =>
            Results.Ok(await service.GetAcademicYearStartsAsync(ct)));

        group.MapGet("/managed-periods", async (
            int? academicYearStart,
            [FromServices] IGraduationAnalyticsV3Service service,
            CancellationToken ct) =>
            Results.Ok(await service.GetPeriodsAsync(academicYearStart, ct)));

        group.MapGet("/managed-periods/{periodId:long}/revisions", async (
            long periodId,
            [FromServices] IGraduationAnalyticsV3Service service,
            CancellationToken ct) =>
        {
            try { return Results.Ok(await service.GetRevisionsAsync(periodId, ct)); }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        });

        group.MapGet("/managed-periods/{periodId:long}/preview", async (
            long periodId,
            [FromServices] IGraduationAnalyticsV3Service service,
            CancellationToken ct) =>
        {
            try { return Results.Ok(await service.GetActivePreviewAsync(periodId, ct)); }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        });

        group.MapDelete("/managed-periods/{periodId:long}", async (
            long periodId,
            [FromBody] DeleteGraduationPeriodRequest request,
            [FromServices] IGraduationAnalyticsV3Service service,
            CancellationToken ct) =>
        {
            try
            {
                await service.DeletePeriodAsync(periodId, request.Reason ?? string.Empty, ct);
                return Results.NoContent();
            }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/imports/preview", async (
            HttpRequest request,
            [FromServices] IGraduationImportParser parser,
            [FromServices] IGraduationImportCatalogResolver catalogResolver,
            CancellationToken ct) =>
        {
            try
            {
                var file = await ReadWorkbookAsync(request, ct);
                await using var stream = file.OpenReadStream();
                var parsed = await parser.ParseAsync(stream, file.FileName, ct);
                return Results.Ok(await catalogResolver.ResolveAsync(parsed, ct));
            }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/imports/commit", async (
            HttpRequest request,
            [FromServices] IGraduationImportParser parser,
            [FromServices] IGraduationImportCatalogResolver catalogResolver,
            [FromServices] IGraduationAnalyticsV3Service service,
            CancellationToken ct) =>
        {
            try
            {
                var form = await request.ReadFormAsync(ct);
                var file = GetWorkbook(form);
                var academicYearStart = RequiredInt(form, "academicYearStart");
                var roundNumber = RequiredInt(form, "roundNumber");
                var reviewMonth = RequiredInt(form, "reviewMonth");
                var reviewYear = RequiredInt(form, "reviewYear");
                var expectedRevisionId = OptionalLong(form, "expectedActiveRevisionId");
                var replaceReason = form["replaceReason"].FirstOrDefault();
                var previewFileHash = RequiredText(form, "previewFileHash");
                await using var stream = file.OpenReadStream();
                var parsed = await catalogResolver.ResolveAsync(
                    await parser.ParseAsync(stream, file.FileName, ct), ct);
                if (!string.Equals(parsed.FileHash, previewFileHash, StringComparison.OrdinalIgnoreCase))
                {
                    throw new GraduationAnalyticsException(
                        GraduationAnalyticsErrorCodes.InvalidImport,
                        "File xác nhận không trùng với file đã preview. Hãy preview lại trước khi import.");
                }
                var result = await service.ImportAsync(new ImportGraduationRevisionCommand(
                    academicYearStart,
                    roundNumber,
                    reviewMonth,
                    reviewYear,
                    expectedRevisionId,
                    replaceReason,
                    parsed), ct);
                return Results.Ok(result);
            }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/explore/summary", async (
            GraduationExploreV3Request request,
            [FromServices] IGraduationAnalyticsV3Service service,
            CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await service.ExploreAsync(new GraduationExploreQuery(
                    request.Mode ?? string.Empty,
                    request.StartPeriodId,
                    request.CutoffPeriodId,
                    request.Cohorts ?? (string.IsNullOrWhiteSpace(request.Cohort) ? [] : [request.Cohort]),
                    request.FacultyKeys ?? (string.IsNullOrWhiteSpace(request.FacultyKey) ? [] : [request.FacultyKey]),
                    request.ProgramKeys ?? (string.IsNullOrWhiteSpace(request.ProgramKey) ? [] : [request.ProgramKey]),
                    request.MetricId ?? "graduated",
                    request.GroupBy ?? "period",
                    request.SeriesBy), ct));
            }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        return app;
    }

    private static IResult ToError(GraduationAnalyticsException exception)
    {
        var statusCode = exception.ErrorCode switch
        {
            GraduationAnalyticsV3ErrorCodes.PeriodNotFound => StatusCodes.Status404NotFound,
            GraduationAnalyticsV3ErrorCodes.ConcurrentReplace => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest,
        };
        return Results.Json(
            new
            {
                errorCode = exception.ErrorCode,
                message = exception.Message,
                sourceColumns = exception.SourceColumns,
                rowErrors = exception.RowErrors,
            },
            statusCode: statusCode);
    }

    private static async Task<IFormFile> ReadWorkbookAsync(
        HttpRequest request,
        CancellationToken cancellationToken) =>
        GetWorkbook(await request.ReadFormAsync(cancellationToken));

    private static IFormFile GetWorkbook(IFormCollection form)
    {
        var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
        if (file is null || file.Length == 0)
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Chưa chọn file Excel để import.");
        }
        if (!Path.GetExtension(file.FileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            throw new GraduationAnalyticsException(
                GraduationAnalyticsErrorCodes.InvalidImport,
                "Chỉ chấp nhận file Excel định dạng .xlsx.");
        }
        return file;
    }

    private static int RequiredInt(IFormCollection form, string key)
    {
        if (int.TryParse(form[key].FirstOrDefault(), out var value))
        {
            return value;
        }
        throw new GraduationAnalyticsException(
            GraduationAnalyticsErrorCodes.InvalidImport,
            $"Metadata '{key}' không hợp lệ.");
    }

    private static long? OptionalLong(IFormCollection form, string key)
    {
        var raw = form[key].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }
        if (long.TryParse(raw, out var value))
        {
            return value;
        }
        throw new GraduationAnalyticsException(
            GraduationAnalyticsErrorCodes.InvalidImport,
            $"Metadata '{key}' không hợp lệ.");
    }

    private static string RequiredText(IFormCollection form, string key)
    {
        var value = form[key].FirstOrDefault()?.Trim();
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value;
        }
        throw new GraduationAnalyticsException(
            GraduationAnalyticsErrorCodes.InvalidImport,
            $"Metadata '{key}' không hợp lệ.");
    }

    public sealed record GraduationExploreV3Request(
        string? Mode,
        long? StartPeriodId,
        long CutoffPeriodId,
        string? Cohort,
        string? FacultyKey,
        string? ProgramKey,
        string? MetricId,
        string? GroupBy,
        string? SeriesBy,
        IReadOnlyList<string>? Cohorts = null,
        IReadOnlyList<string>? FacultyKeys = null,
        IReadOnlyList<string>? ProgramKeys = null);

    public sealed record DeleteGraduationPeriodRequest(string? Reason);
}
