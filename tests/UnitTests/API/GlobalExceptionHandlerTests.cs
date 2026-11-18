namespace UnitTests.API;

using System.Text.Json;
using System.Diagnostics;
using Application.Common.Exceptions;
using global::API.Middleware;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;

public sealed class GlobalExceptionHandlerTests
{
    [Theory]
    [InlineData("IX_Faculties_FacultyName", "CATALOG_FACULTY_NAME_EXISTS")]
    [InlineData("IX_CohortMajors_CohortId_MajorId", "COHORT_MAJOR_EXISTS")]
    [InlineData("IX_CourseSections_CourseId_SemesterId_SectionName", "CATALOG_COURSE_SECTION_EXISTS")]
    [InlineData("unknown_constraint", "DATA_CONFLICT")]
    public async Task UniqueViolation_ReturnsAConflictWithMachineReadableCode(string constraint, string expected)
    {
        var postgres = new PostgresException("private database details", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation,
            constraintName: constraint);
        var (status, body) = await Handle(new DbUpdateException("private SQL", postgres));
        status.Should().Be(409);
        body.GetProperty("errorCode").GetString().Should().Be(expected);
        body.ToString().Should().NotContain("private").And.NotContain(constraint);
    }

    [Fact]
    public async Task MissingReference_ReturnsAConflict()
    {
        var postgres = new PostgresException("private database details", "ERROR", "ERROR", PostgresErrorCodes.ForeignKeyViolation);
        var (status, body) = await Handle(new DbUpdateException("private SQL", postgres));
        status.Should().Be(409);
        body.GetProperty("errorCode").GetString().Should().Be("DATA_REFERENCE_CONFLICT");
    }

    [Fact]
    public async Task UnexpectedException_ReturnsAServerErrorCodeWithoutPrivateDetails()
    {
        var (status, body) = await Handle(new Exception("private server details"));
        status.Should().Be(500);
        body.GetProperty("errorCode").GetString().Should().Be("API_SERVER_ERROR");
        body.ToString().Should().NotContain("private");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ErrorResponse_AndStructuredLog_ShareTheSameTraceId(bool withActivity)
    {
        using var activity = withActivity ? new Activity("error-regression").Start() : null;
        using var services = new ServiceCollection().AddLogging().AddOptions().BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = services, TraceIdentifier = "request-regression-id" };
        context.Request.Path = "/api/regression";
        await using var stream = new MemoryStream();
        context.Response.Body = stream;
        var original = new InvalidOperationException("private parser details");
        var exception = new GraduationImportProcessingException(original);
        var logger = new CapturingLogger();
        await new GlobalExceptionHandler(logger).TryHandleAsync(context, exception, default);

        stream.Position = 0;
        using var json = await JsonDocument.ParseAsync(stream);
        var expected = Activity.Current?.Id ?? context.TraceIdentifier;
        context.Response.StatusCode.Should().Be(500);
        json.RootElement.GetProperty("traceId").GetString().Should().Be(expected);
        context.Response.Headers["X-Trace-Id"].ToString().Should().Be(expected);
        logger.Properties["TraceId"].Should().Be(expected);
        logger.Properties["Path"]?.ToString().Should().Be("/api/regression");
        logger.Exception.Should().BeSameAs(exception);
        logger.Exception!.InnerException.Should().BeSameAs(original);
        json.RootElement.ToString().Should().NotContain("private");
    }

    private sealed class CapturingLogger : ILogger<GlobalExceptionHandler>
    {
        public Dictionary<string, object?> Properties { get; } = [];
        public Exception? Exception { get; private set; }
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            Exception = exception;
            foreach (var pair in (IEnumerable<KeyValuePair<string, object?>>)(object)state!) Properties[pair.Key] = pair.Value;
        }
    }

    private static async Task<(int, JsonElement)> Handle(Exception exception)
    {
        using var services = new ServiceCollection().AddLogging().AddOptions().BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = services };
        await using var stream = new MemoryStream();
        context.Response.Body = stream;
        var handler = new GlobalExceptionHandler(NullLogger<GlobalExceptionHandler>.Instance);
        (await handler.TryHandleAsync(context, exception, default)).Should().BeTrue();
        stream.Position = 0;
        using var document = await JsonDocument.ParseAsync(stream);
        return (context.Response.StatusCode, document.RootElement.Clone());
    }
}
