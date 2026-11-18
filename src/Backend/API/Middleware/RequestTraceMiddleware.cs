using System.Diagnostics;

namespace API.Middleware;

/// <summary>Correlates normal/domain-error responses and application logs too.</summary>
public sealed class RequestTraceMiddleware(RequestDelegate next, ILogger<RequestTraceMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var traceId = Activity.Current?.Id ?? context.TraceIdentifier;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["X-Trace-Id"] = traceId;
            return Task.CompletedTask;
        });
        using (logger.BeginScope(new Dictionary<string, object> { ["TraceId"] = traceId }))
        {
            await next(context);
        }
    }
}
