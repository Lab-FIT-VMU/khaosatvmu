using System.Security.Claims;
using Application.Auth;
using Microsoft.AspNetCore.Authorization;

namespace API.Auth;

public static class AuthPolicies
{
    public const string UserAdminAccess = "PERMISSION_USER_ADMIN_ACCESS";
    public const string FacultiesAccess = "PERMISSION_FACULTIES_ACCESS";
    public const string DepartmentsAccess = "PERMISSION_DEPARTMENTS_ACCESS";
    public const string LecturersAccess = "PERMISSION_LECTURERS_ACCESS";
    public const string MajorsAccess = "PERMISSION_MAJORS_ACCESS";
    public const string CoursesAccess = "PERMISSION_COURSES_ACCESS";
    public const string CourseSectionsAccess = "PERMISSION_COURSE_SECTIONS_ACCESS";
    public const string FacultiesRead = "PERMISSION_FACULTIES_READ";
    public const string DepartmentsRead = "PERMISSION_DEPARTMENTS_READ";
    public const string LecturersRead = "PERMISSION_LECTURERS_READ";
    public const string MajorsRead = "PERMISSION_MAJORS_READ";
    public const string CoursesRead = "PERMISSION_COURSES_READ";
    public const string CourseQuestionSetsAccess = "PERMISSION_COURSE_QUESTION_SETS_ACCESS";
    public const string CourseCampaignsAccess = "PERMISSION_COURSE_CAMPAIGNS_ACCESS";
    public const string ProgramCampaignsAccess = "PERMISSION_PROGRAM_CAMPAIGNS_ACCESS";
    public const string ProgramCriteriaAccess = "PERMISSION_PROGRAM_CRITERIA_ACCESS";
    public const string ProgressAccess = "PERMISSION_PROGRESS_ACCESS";
    public const string ReportsAccess = "PERMISSION_REPORTS_ACCESS";
    public const string SurveyDashboardAccess = "PERMISSION_SURVEY_DASHBOARD_ACCESS";
    public const string SurveyStatisticsAccess = "PERMISSION_SURVEY_STATISTICS_ACCESS";
    public const string SurveyAnalysisAccess = "PERMISSION_SURVEY_ANALYSIS_ACCESS";
    public const string GraduationAnalyticsAccess = "PERMISSION_GRADUATION_ANALYTICS_ACCESS";
    public const string GraduationAnalytics2Access = "PERMISSION_GRADUATION_ANALYTICS_2_ACCESS";
    public const string CohortMajorsAccess = "PERMISSION_COHORT_MAJORS_ACCESS";
    /// <summary>Bất kỳ quyền nào trong nhóm Báo cáo, cho các endpoint dùng chung.</summary>
    public const string ReportingRead = "PERMISSION_REPORTING_READ";
    public const string SurveyOperationalRead = "PERMISSION_SURVEY_OPERATIONAL_READ";
}

public sealed record PermissionRequirement(
    string PermissionCode,
    string? OrganizationUnitRouteValue = null) : IAuthorizationRequirement;

public sealed record AnyPermissionRequirement(params string[] PermissionCodes) : IAuthorizationRequirement;

public sealed class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    private readonly IAuthService _authService;

    public PermissionAuthorizationHandler(IAuthService authService)
    {
        _authService = authService;
    }

    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            return;
        }

        var organizationUnitCode = requirement.OrganizationUnitRouteValue is not null
            && context.Resource is HttpContext httpContext
            ? httpContext.Request.RouteValues[requirement.OrganizationUnitRouteValue]?.ToString()
            : null;
        var allowed = await _authService.HasPermissionAsync(
            context.User,
            requirement.PermissionCode,
            organizationUnitCode);
        if (allowed)
        {
            context.Succeed(requirement);
        }
    }
}

public sealed class AnyPermissionAuthorizationHandler : AuthorizationHandler<AnyPermissionRequirement>
{
    private readonly IAuthService _authService;

    public AnyPermissionAuthorizationHandler(IAuthService authService)
    {
        _authService = authService;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        AnyPermissionRequirement requirement)
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            return;
        }

        if (await _authService.HasAnyPermissionAsync(context.User, requirement.PermissionCodes))
        {
            context.Succeed(requirement);
        }
    }
}
