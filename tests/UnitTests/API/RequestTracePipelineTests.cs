namespace UnitTests.API;

using System.Net;
using System.Text.Json;
using global::API.Middleware;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

public sealed class RequestTracePipelineTests
{
    [Fact]
    public async Task TraceHeaderSurvivesDomainResponsesAndExceptionHandling()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Configuration["AllowedHosts"] = "*";
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
        builder.Services.AddProblemDetails();
        await using var app = builder.Build();
        app.UseExceptionHandler();
        app.UseMiddleware<RequestTraceMiddleware>();
        app.MapGet("/domain", () => Results.Json(new { errorCode = "GRADUATION_IMPORT_INVALID" }, statusCode: 400));
        app.MapGet("/unexpected", (Func<IResult>)(() => throw new Exception("private implementation details")));
        await app.StartAsync();
        try
        {
            var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
            using var client = new HttpClient { BaseAddress = new Uri(address) };
            using var domain = await client.GetAsync("/domain");
            domain.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            domain.Headers.GetValues("X-Trace-Id").Single().Should().NotBeNullOrEmpty();

            using var unexpected = await client.GetAsync("/unexpected");
            unexpected.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
            var json = await unexpected.Content.ReadAsStringAsync();
            using var body = JsonDocument.Parse(json);
            body.RootElement.GetProperty("traceId").GetString().Should().Be(unexpected.Headers.GetValues("X-Trace-Id").Single());
            json.Should().NotContain("private");
        }
        finally
        {
            await app.StopAsync();
        }
    }
}
