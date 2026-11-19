using System.Net;
using API.Auth;

namespace API.AuditGrades;

/// <summary>Cấu hình mục "AuditGradeModule".</summary>
public sealed class AuditGradeModuleOptions
{
    public const string SectionName = "AuditGradeModule";

    /// <summary>Địa chỉ container audit-grade (python chay.py). Không mở ra ngoài; chỉ API này gọi vào.</summary>
    public string BaseUrl { get; set; } = "http://localhost:8770";
}

/// <summary>
/// Module phân tích điểm học phần bản audit (src/AuditGradeModule): chạy nguyên bản trong container
/// riêng, ĐỘC LẬP với module phân tích điểm của khaosatvmu (dữ liệu, tham số, giao diện riêng).
/// API chỉ làm cửa vào: chuyển tiếp mọi yêu cầu dưới /api/audit-grades/ tới container, sau khi kiểm
/// <list type="bullet">
/// <item>người gọi đã đăng nhập và vai trò đang dùng có quyền AUDIT_GRADE_MODULE_ACCESS (mặc định
/// chỉ ADMIN) — module không lọc dữ liệu theo khoa / bộ môn và hiện tên giảng viên;</item>
/// <item>yêu cầu ghi (POST) xuất phát từ chính trang này (Sec-Fetch-Site: same-origin). Giao diện
/// audit không gửi mã chống giả mạo của khaosatvmu, nên chặn nguồn khác ở đây.</item>
/// </list>
/// Không chuyển cookie hay thông tin người dùng sang container.
/// </summary>
public static class AuditGradeModuleEndpoints
{
    public const string BasePath = "/api/audit-grades";
    public const string HttpClientName = "AuditGradeModule";

    private static readonly string[] ForwardedMethods = [HttpMethods.Get, HttpMethods.Head, HttpMethods.Post];
    private static readonly string[] ForwardedResponseHeaders = ["Cache-Control", "Last-Modified"];

    public static IServiceCollection AddAuditGradeModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AuditGradeModuleOptions>(configuration.GetSection(AuditGradeModuleOptions.SectionName));
        services.AddHttpClient(HttpClientName, (sp, client) =>
        {
            var options = configuration.GetSection(AuditGradeModuleOptions.SectionName).Get<AuditGradeModuleOptions>()
                ?? new AuditGradeModuleOptions();
            client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
            // Nạp kỳ và tính lại chạy nền bên audit (trả mã công việc ngay), nên yêu cầu nào cũng ngắn.
            client.Timeout = TimeSpan.FromMinutes(5);
        });
        return services;
    }

    public static IEndpointRouteBuilder MapAuditGradeModuleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapMethods(BasePath + "/{**path}", ForwardedMethods, ForwardAsync)
            .RequireAuthorization(AuthPolicies.AuditGradeModuleAccess)
            .ExcludeFromDescription();

        return app;
    }

    public static async Task ForwardAsync(
        HttpContext context,
        IHttpClientFactory httpClientFactory,
        ILoggerFactory loggerFactory)
    {
        // Ai được vào do quyền AUDIT_GRADE_MODULE_ACCESS quyết định (RequireAuthorization ở trên).
        var cancellationToken = context.RequestAborted;
        var request = context.Request;
        // Giao diện audit dùng đường dẫn tương đối (data/…, api/…, assets/…): trang phải mở ở địa
        // chỉ có "/" cuối thì các đường dẫn đó mới nằm dưới /api/audit-grades/. (Route khớp cả hai
        // dạng vì định tuyến bỏ qua "/" cuối, nên phân biệt ở đây.)
        if (string.Equals(request.Path.Value, BasePath, StringComparison.OrdinalIgnoreCase))
        {
            context.Response.Redirect(BasePath + "/" + request.QueryString);
            return;
        }

        if (HttpMethods.IsPost(request.Method)
            && !string.Equals(request.Headers["Sec-Fetch-Site"].ToString(), "same-origin", StringComparison.OrdinalIgnoreCase))
        {
            await Results.Json(new { errorCode = "AUDIT_GRADE_CROSS_SITE" }, statusCode: StatusCodes.Status403Forbidden)
                .ExecuteAsync(context);
            return;
        }

        var client = httpClientFactory.CreateClient(HttpClientName);
        var target = new UriBuilder(client.BaseAddress!)
        {
            Path = "/" + request.Path.Value![BasePath.Length..].TrimStart('/'),
            Query = request.QueryString.HasValue ? request.QueryString.Value![1..] : string.Empty,
        }.Uri;

        using var upstreamRequest = new HttpRequestMessage(new HttpMethod(request.Method), target);
        if (HttpMethods.IsPost(request.Method))
        {
            upstreamRequest.Content = new StreamContent(request.Body);
            if (!string.IsNullOrEmpty(request.ContentType))
            {
                upstreamRequest.Content.Headers.TryAddWithoutValidation("Content-Type", request.ContentType);
            }
            if (request.ContentLength is long length)
            {
                upstreamRequest.Content.Headers.ContentLength = length;
            }
        }

        HttpResponseMessage upstreamResponse;
        try
        {
            upstreamResponse = await client.SendAsync(upstreamRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException
            || (exception is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            loggerFactory.CreateLogger(typeof(AuditGradeModuleEndpoints))
                .LogWarning(exception, "Không gọi được module phân tích điểm bản audit ở {BaseUrl}.", client.BaseAddress);
            context.Response.StatusCode = StatusCodes.Status502BadGateway;
            context.Response.ContentType = "text/html; charset=utf-8";
            await context.Response.WriteAsync(UnavailablePage, cancellationToken);
            return;
        }

        using (upstreamResponse)
        {
            var response = context.Response;
            response.StatusCode = (int)upstreamResponse.StatusCode;
            var content = upstreamResponse.Content.Headers;
            if (content.ContentType is not null)
            {
                response.ContentType = content.ContentType.ToString();
            }
            if (content.ContentLength is long contentLength)
            {
                response.ContentLength = contentLength;
            }
            foreach (var name in ForwardedResponseHeaders)
            {
                if (upstreamResponse.Headers.TryGetValues(name, out var values)
                    || upstreamResponse.Content.Headers.TryGetValues(name, out values))
                {
                    response.Headers[name] = values.ToArray();
                }
            }
            response.Headers["X-Content-Type-Options"] = "nosniff";
            if (upstreamResponse.StatusCode != HttpStatusCode.NotModified && !HttpMethods.IsHead(request.Method))
            {
                await upstreamResponse.Content.CopyToAsync(response.Body, cancellationToken);
            }
        }
    }

    private const string UnavailablePage = """
        <!doctype html>
        <html lang="vi"><head><meta charset="utf-8"><title>Module chưa chạy</title>
        <style>body{font-family:system-ui,sans-serif;margin:3rem;color:#1f2937}code{background:#f3f4f6;padding:.1rem .3rem}</style>
        </head><body>
        <h1>Module phân tích điểm (bản audit) chưa chạy</h1>
        <p>Không kết nối được container <code>khaosatvmu_audit_grade</code>. Mở Docker rồi tải lại trang.
        Lần đầu cần tạo container: <code>docker compose up -d --build audit-grade</code>.</p>
        </body></html>
        """;
}
