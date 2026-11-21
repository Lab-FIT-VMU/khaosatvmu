namespace API.Middleware;

using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Diagnostics;

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var traceId = Activity.Current?.Id ?? httpContext.TraceIdentifier;
        _logger.LogError(exception,
            "Unhandled exception. TraceId: {TraceId}; Path: {Path}", traceId, httpContext.Request.Path);

        var problemDetails = exception switch
        {
            Exception conflict when IsConcurrentWriteConflict(conflict)
                => new ProblemDetails
                {
                    Status = StatusCodes.Status409Conflict,
                    Title = "Concurrent data change",
                    Detail = "The data was updated by another request. Refresh the data and try again.",
                    Extensions = { ["errorCode"] = "DATA_CONFLICT" },
                },
            DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg }
                => new ProblemDetails
                {
                    Status = StatusCodes.Status409Conflict,
                    Title = "Data conflict",
                    Detail = "The value is already in use. Refresh the data and try again.",
                    Extensions = { ["errorCode"] = UniqueConflictCode(pg.ConstraintName) },
                },
            DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation } }
                => new ProblemDetails
                {
                    Status = StatusCodes.Status409Conflict,
                    Title = "Related data conflict",
                    Detail = "Related data has changed or is still in use.",
                    Extensions = { ["errorCode"] = "DATA_REFERENCE_CONFLICT" },
                },
            KeyNotFoundException ex => new ProblemDetails
            {
                Status = StatusCodes.Status404NotFound,
                Title = "Resource Not Found",
                Detail = ex.Message
            },
            UnauthorizedAccessException ex => new ProblemDetails
            {
                Status = StatusCodes.Status401Unauthorized,
                Title = "Unauthorized Access",
                Detail = ex.Message
            },
            ArgumentException ex => new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Invalid Argument",
                Detail = ex.Message
            },
            InvalidOperationException ex => new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Invalid Operation",
                Detail = ex.Message
            },
            _ => new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "Internal Server Error",
                Detail = "An unexpected error occurred. Please try again later."
            }
        };

        problemDetails.Instance = httpContext.Request.Path;
        problemDetails.Extensions["traceId"] = traceId;
        httpContext.Response.Headers["X-Trace-Id"] = traceId;
        problemDetails.Extensions.TryAdd("errorCode", problemDetails.Status switch
        {
            400 => "API_INVALID_REQUEST",
            401 => "API_UNAUTHORIZED",
            404 => "API_NOT_FOUND",
            _ => "API_SERVER_ERROR",
        });

        httpContext.Response.StatusCode = problemDetails.Status ?? StatusCodes.Status500InternalServerError;
        await httpContext.Response.WriteAsJsonAsync(problemDetails, cancellationToken);

        return true;
    }

    private static bool IsConcurrentWriteConflict(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is DbUpdateConcurrencyException
                || current is PostgresException { SqlState: PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.DeadlockDetected })
            {
                return true;
            }
        }
        return false;
    }

    private static string UniqueConflictCode(string? constraint) => constraint switch
    {
        "IX_Faculties_FacultyName" => "CATALOG_FACULTY_NAME_EXISTS",
        "IX_Positions_PositionName" => "CATALOG_POSITION_NAME_EXISTS",
        "IX_AcademicYears_AcademicYearName" => "CATALOG_ACADEMIC_YEAR_NAME_EXISTS",
        "IX_Semesters_AcademicYearId_SemesterName" => "CATALOG_SEMESTER_NAME_EXISTS",
        "IX_CourseSections_CourseId_SemesterId_SectionName" => "CATALOG_COURSE_SECTION_EXISTS",
        "IX_Courses_CourseCode" => "CATALOG_COURSE_CODE_EXISTS",
        "IX_Lecturers_Email" => "CATALOG_LECTURER_EMAIL_EXISTS",
        "IX_Majors_MajorCode" => "CATALOG_MAJOR_CODE_EXISTS",
        "IX_CohortMajors_CohortId_MajorId" => "COHORT_MAJOR_EXISTS",
        "IX_CohortMajors_CohortId_CohortMajorCode" => "COHORT_MAJOR_CODE_EXISTS",
        _ => "DATA_CONFLICT",
    };
}
