namespace UnitTests.API;

using System.Net;
using System.Security.Claims;
using System.Text;
using Application.Auth;
using FluentAssertions;
using global::API.AuditGrades;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

/// <summary>
/// Cửa vào module phân tích điểm bản audit: chỉ ADMIN, yêu cầu ghi phải cùng nguồn, chuyển tiếp
/// đúng đường dẫn / truy vấn / thân, không chuyển cookie, container tắt thì báo 502.
/// </summary>
public class AuditGradeModuleEndpointsTests
{
    private static readonly UserScope Admin = new(RoleCodes.Admin, null, null, null, true, Domain.RoleDataScopes.All, CanWrite: true);
    private static readonly UserScope SurveyAdmin = new(RoleCodes.SurveyAdmin, null, null, null, true, Domain.RoleDataScopes.All, CanWrite: true);

    private sealed class FixedScope(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) => Task.FromResult(scope);
    }

    private sealed class RecordingHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            if (request.Content is not null)
            {
                Body = await request.Content.ReadAsStringAsync(cancellationToken);
            }
            return await respond(request);
        }
    }

    private sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false)
        {
            BaseAddress = new Uri("http://audit-grade:8770/"),
        };
    }

    private static RecordingHandler Ok(string body = "{\"ok\":1}", string contentType = "application/json") =>
        new(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body, Encoding.UTF8, contentType),
        }));

    private static DefaultHttpContext Context(string method, string path, string query = "")
    {
        var context = new DefaultHttpContext
        {
            RequestServices = new ServiceCollection().AddLogging().BuildServiceProvider(),
        };
        context.Request.Method = method;
        context.Request.Path = path;
        context.Request.QueryString = new QueryString(query);
        context.Request.Headers.Cookie = ".khaosatvmu.auth=secret";
        context.Response.Body = new MemoryStream();
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "x")], "test"));
        return context;
    }

    private static Task Send(DefaultHttpContext context, UserScope scope, HttpMessageHandler handler) =>
        AuditGradeModuleEndpoints.ForwardAsync(context, new FixedScope(scope), new Factory(handler), NullLoggerFactory.Instance);

    private static string ResponseText(DefaultHttpContext context)
    {
        context.Response.Body.Position = 0;
        return new StreamReader(context.Response.Body).ReadToEnd();
    }

    [Fact]
    public async Task NonAdmin_IsForbidden_AndNothingIsForwarded()
    {
        var handler = Ok();
        var context = Context("GET", "/api/audit-grades/data/danh_sach_ky.json");

        await Send(context, SurveyAdmin, handler);

        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
        handler.Request.Should().BeNull();
    }

    [Fact]
    public async Task Get_ForwardsPathAndQuery_CopiesResponse_WithoutCookie()
    {
        var handler = Ok("[1,2]");
        var context = Context("GET", "/api/audit-grades/data/ho_so/2425_HK1/111.json", "?v=2");

        await Send(context, Admin, handler);

        handler.Request!.RequestUri.Should().Be(new Uri("http://audit-grade:8770/data/ho_so/2425_HK1/111.json?v=2"));
        handler.Request.Headers.Contains("Cookie").Should().BeFalse();
        context.Response.StatusCode.Should().Be(StatusCodes.Status200OK);
        context.Response.ContentType.Should().StartWith("application/json");
        ResponseText(context).Should().Be("[1,2]");
    }

    [Fact]
    public async Task Root_WithoutTrailingSlash_RedirectsSoRelativeLinksResolve()
    {
        var handler = Ok();
        var context = Context("GET", "/api/audit-grades");

        await Send(context, Admin, handler);

        context.Response.StatusCode.Should().Be(StatusCodes.Status302Found);
        context.Response.Headers.Location.ToString().Should().Be("/api/audit-grades/");
        handler.Request.Should().BeNull();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("cross-site")]
    [InlineData("same-site")]
    public async Task Post_FromAnotherOrigin_IsForbidden(string? fetchSite)
    {
        var handler = Ok();
        var context = Context("POST", "/api/audit-grades/api/go-ky");
        if (fetchSite is not null)
        {
            context.Request.Headers["Sec-Fetch-Site"] = fetchSite;
        }

        await Send(context, Admin, handler);

        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
        handler.Request.Should().BeNull();
    }

    [Fact]
    public async Task Post_SameOrigin_ForwardsBodyAndContentType()
    {
        var handler = Ok("{\"id\":\"abc\"}");
        var context = Context("POST", "/api/audit-grades/api/go-ky");
        context.Request.Headers["Sec-Fetch-Site"] = "same-origin";
        var body = Encoding.UTF8.GetBytes("{\"ky\":\"2425_HK1\"}");
        context.Request.Body = new MemoryStream(body);
        context.Request.ContentType = "application/json";
        context.Request.ContentLength = body.Length;

        await Send(context, Admin, handler);

        handler.Request!.Method.Should().Be(HttpMethod.Post);
        handler.Request.RequestUri!.AbsolutePath.Should().Be("/api/go-ky");
        handler.Request.Content!.Headers.ContentType!.MediaType.Should().Be("application/json");
        handler.Body.Should().Be("{\"ky\":\"2425_HK1\"}");
        ResponseText(context).Should().Be("{\"id\":\"abc\"}");
    }

    [Fact]
    public async Task UpstreamStatus_IsPassedThrough()
    {
        var handler = new RecordingHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
        {
            Content = new StringContent("missing"),
        }));
        var context = Context("GET", "/api/audit-grades/data/khong-co.json");

        await Send(context, Admin, handler);

        context.Response.StatusCode.Should().Be(StatusCodes.Status404NotFound);
    }

    [Fact]
    public async Task ContainerDown_Returns502Page()
    {
        var handler = new RecordingHandler(_ => throw new HttpRequestException("connection refused"));
        var context = Context("GET", "/api/audit-grades/");

        await Send(context, Admin, handler);

        context.Response.StatusCode.Should().Be(StatusCodes.Status502BadGateway);
        ResponseText(context).Should().Contain("chưa chạy");
    }
}
