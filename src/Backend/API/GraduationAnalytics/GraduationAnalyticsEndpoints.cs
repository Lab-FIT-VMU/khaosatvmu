using API.Auth;
using Application.GraduationAnalytics;
using Microsoft.AspNetCore.Mvc;

namespace API.GraduationAnalytics;

public static class GraduationAnalyticsEndpoints
{
    public static IEndpointRouteBuilder MapGraduationAnalyticsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/graduation-analytics")
            .RequireAuthorization(AuthPolicies.GraduationAnalyticsAccess);

        group.MapGet("/periods", async (IGraduationAnalyticsService service, CancellationToken ct) =>
            Results.Ok(await service.GetPeriodsAsync(ct)));

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

        group.MapPost("/imports/preview", async (
            HttpRequest request,
            [FromServices] IGraduationImportParser parser,
            CancellationToken ct) =>
        {
            try
            {
                var file = await ReadWorkbookAsync(request, ct);
                await using var stream = file.OpenReadStream();
                return Results.Ok(await parser.ParseAsync(stream, file.FileName, ct));
            }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/imports/commit", async (
            HttpRequest request,
            [FromServices] IGraduationImportParser parser,
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
                var parsed = await parser.ParseAsync(stream, file.FileName, ct);
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
                    request.CutoffPeriodId,
                    request.Cohort,
                    request.FacultyKey,
                    request.ProgramKey,
                    request.MetricId ?? "graduated",
                    request.GroupBy ?? "period",
                    request.SeriesBy), ct));
            }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapGet("/metadata", (IGraduationAnalyticsService service) =>
            Results.Ok(service.GetMetadata()));

        group.MapGet("/facets", async (
            string? scope,
            long? periodId,
            IGraduationAnalyticsService service,
            CancellationToken ct) =>
        {
            try { return Results.Ok(await service.GetFacetsAsync(scope ?? string.Empty, periodId, ct)); }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        });

        group.MapPost("/periods", async (
            ImportGraduationPeriodRequest request,
            IGraduationAnalyticsService service,
            CancellationToken ct) =>
        {
            try
            {
                var command = new ImportGraduationPeriodCommand(
                    request.OriginalFileName ?? string.Empty,
                    request.SourceSheetName ?? string.Empty,
                    request.Rows?.Select(x => x.ToCommand()).ToList() ?? []);
                return Results.Ok(await service.ImportPeriodAsync(command, ct));
            }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/query", async (
            GraduationAnalyticsQueryRequest request,
            IGraduationAnalyticsService service,
            CancellationToken ct) =>
        {
            try { return Results.Ok(await service.QueryAsync(request.ToCommand(), ct)); }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/overview", async (
            GraduationOverviewRequest request,
            IGraduationAnalyticsService service,
            CancellationToken ct) =>
        {
            try { return Results.Ok(await service.GetOverviewAsync(request.ToQuery(), ct)); }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapGet("/periods/{periodId:long}/rows", async (
            long periodId,
            string? search,
            string? faculty,
            string? program,
            string? cohort,
            int page,
            int pageSize,
            IGraduationAnalyticsService service,
            CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await service.GetRowsAsync(
                    new GraduationRowsQuery(periodId, search, faculty, program, cohort, page, pageSize),
                    ct));
            }
            catch (GraduationAnalyticsException exception) { return ToError(exception); }
        });

        return app;
    }

    private static IResult ToError(GraduationAnalyticsException exception)
    {
        var statusCode = exception.ErrorCode switch
        {
            GraduationAnalyticsErrorCodes.PeriodExists => StatusCodes.Status409Conflict,
            GraduationAnalyticsErrorCodes.PeriodNotFound => StatusCodes.Status404NotFound,
            GraduationAnalyticsV3ErrorCodes.PeriodNotFound => StatusCodes.Status404NotFound,
            GraduationAnalyticsV3ErrorCodes.ConcurrentReplace => StatusCodes.Status409Conflict,
            GraduationAnalyticsV3ErrorCodes.DuplicateSourceFile => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest,
        };
        return Results.Json(new { errorCode = exception.ErrorCode, message = exception.Message }, statusCode: statusCode);
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

    public sealed record ImportGraduationPeriodRequest(
        string? OriginalFileName,
        string? SourceSheetName,
        IReadOnlyList<GraduationImportRowRequest>? Rows);

    public sealed record GraduationExploreV3Request(
        string? Mode,
        long CutoffPeriodId,
        string? Cohort,
        string? FacultyKey,
        string? ProgramKey,
        string? MetricId,
        string? GroupBy,
        string? SeriesBy);

    public sealed record GraduationImportRowRequest(
        int SourceRowNumber,
        string? FacultyName,
        string? ProgramCode,
        string? ProgramName,
        string? Cohort,
        int? InitialEnrollmentCount,
        string? ReviewPeriodText,
        int? EligibleGraduateCount,
        int? OnTimeGraduateCount,
        decimal? OnTimeGraduateRate,
        int? ExcellentCount,
        decimal? ExcellentRate,
        int? VeryGoodCount,
        decimal? VeryGoodRate,
        int? GoodCount,
        decimal? GoodRate,
        int? AverageCount,
        decimal? AverageRate,
        int? WorkStudyTransferCount,
        decimal? WorkStudyTransferRate)
    {
        public GraduationImportRowCommand ToCommand()
        {
            if (EligibleGraduateCount.HasValue || OnTimeGraduateCount.HasValue || OnTimeGraduateRate.HasValue)
            {
                throw new GraduationAnalyticsException(
                    GraduationAnalyticsErrorCodes.LegacyStructureUnsupported,
                    "File còn cấu trúc 19 cột cũ (cột 7–9). Hãy dùng biểu mẫu mới 16 cột.");
            }

            return new(
                SourceRowNumber, FacultyName ?? string.Empty, ProgramCode, ProgramName ?? string.Empty,
                Cohort ?? string.Empty, InitialEnrollmentCount, ReviewPeriodText ?? string.Empty,
                ExcellentCount, ExcellentRate, VeryGoodCount, VeryGoodRate, GoodCount, GoodRate, AverageCount,
                AverageRate, WorkStudyTransferCount, WorkStudyTransferRate);
        }
    }

    public sealed record GraduationAnalyticsQueryRequest(
        string? Scope,
        long? PeriodId,
        string? MetricId,
        string? GroupBy,
        string? SeriesBy,
        string? Faculty,
        string? Program,
        string? Cohort)
    {
        public GraduationAnalyticsQueryCommand ToCommand() => new(
            Scope ?? string.Empty, PeriodId, MetricId ?? string.Empty, GroupBy ?? string.Empty,
            SeriesBy, Faculty, Program, Cohort);
    }

    public sealed record GraduationOverviewRequest(
        string? Faculty,
        string? Program,
        string? Cohort,
        int? FromYear,
        int? ToYear)
    {
        public GraduationOverviewQuery ToQuery() => new(Faculty, Program, Cohort, FromYear, ToYear);
    }
}
