using System.Security.Claims;
using API.Auth;
using API.Catalog;
using API.GraduationAnalytics;
using API.Reports;
using API.Surveys;
using API.UserAdministration;
using Application.Auth;
using Application.Catalog;
using Application.GraduationAnalytics;
using Application.Reports;
using Application.Surveys;
using Application.UserAdministration;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Xunit;

namespace UnitTests.API;

public sealed class EndpointAuthorizationTests
{
    [Fact]
    public async Task AnyPermissionHandler_ChecksThePermissionSetOnce()
    {
        var authService = new Mock<IAuthService>();
        authService
            .Setup(x => x.HasAnyPermissionAsync(
                It.IsAny<ClaimsPrincipal>(),
                It.IsAny<IReadOnlyCollection<string>>(),
                null))
            .ReturnsAsync(true);
        var requirement = new AnyPermissionRequirement("REPORTS_ACCESS", "SURVEY_ANALYSIS_ACCESS");
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString())],
            "test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        var handler = new AnyPermissionAuthorizationHandler(authService.Object);

        await handler.HandleAsync(context);

        context.HasSucceeded.Should().BeTrue();
        authService.Verify(x => x.HasAnyPermissionAsync(
            principal,
            It.Is<IReadOnlyCollection<string>>(codes => codes.Count == 2),
            null), Times.Once);
        authService.Verify(x => x.HasPermissionAsync(
            It.IsAny<ClaimsPrincipal>(),
            It.IsAny<string>(),
            It.IsAny<string?>()), Times.Never);
    }

    [Theory]
    [InlineData("/api/admin", AuthPolicies.UserAdminAccess)]
    [InlineData("/api/v1/reports", AuthPolicies.ReportsAccess)]
    [InlineData("/api/v1/graduation-analytics", AuthPolicies.GraduationAnalyticsAccess)]
    public void ModuleEndpoints_RequireTheirModulePermission(string routePrefix, string expectedPolicy)
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddAuthorization();
        builder.Services.AddSingleton(Mock.Of<IUserAdministrationService>());
        builder.Services.AddSingleton(Mock.Of<IReportService>());
        // Endpoint tối thiểu suy ra tham số là dịch vụ hay body dựa vào DI lúc dựng route, nên
        // mọi dịch vụ mà nhóm endpoint tham chiếu đều phải đăng ký ở đây.
        builder.Services.AddSingleton(Mock.Of<IOpenCommentAnalysisService>());
        var app = builder.Build();
        app.MapUserAdministrationEndpoints();
        app.MapReportEndpoints();
        app.MapGraduationAnalyticsEndpoints();

        var endpoints = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Where(endpoint => endpoint.RoutePattern.RawText?.StartsWith(routePrefix) == true)
            .ToList();

        endpoints.Should().NotBeEmpty();
        endpoints.Should().OnlyContain(endpoint => endpoint.Metadata
            .GetOrderedMetadata<IAuthorizeData>()
            .Any(data => data.Policy == expectedPolicy));
    }

    [Theory]
    [InlineData("/api/v1/graduation-analytics/managed-periods", "GET")]
    [InlineData("/api/v1/graduation-analytics/managed-periods/{periodId:long}", "DELETE")]
    [InlineData("/api/v1/graduation-analytics/managed-periods/{periodId:long}/revisions", "GET")]
    [InlineData("/api/v1/graduation-analytics/imports/preview", "POST")]
    [InlineData("/api/v1/graduation-analytics/imports/commit", "POST")]
    [InlineData("/api/v1/graduation-analytics/explore/summary", "POST")]
    public void GraduationAnalyticsEndpoints_ExposeThePeriodBasedRouteSurface(
        string route,
        string method)
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.MapGraduationAnalyticsEndpoints();

        var endpoint = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(candidate => candidate.RoutePattern.RawText == route
                && candidate.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains(method) == true);

        endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>()
            .Should().Contain(data => data.Policy == AuthPolicies.GraduationAnalyticsAccess);
    }

    /// <summary>
    /// Policy đọc một danh mục dùng chung phải nhận quyền mở của MỌI màn hình đọc danh mục đó.
    /// Bài này ghim đúng lỗi đã gặp ở trang Thống kê &amp; Báo cáo: trưởng khoa chỉ có
    /// <c>REPORTS_ACCESS</c> nạp bộ lọc thì <c>/api/catalog/courses</c> trả 403 vì
    /// <c>CoursesRead</c> thiếu <c>REPORTS_ACCESS</c>, và cả bốn danh mục trắng trơn vì chúng
    /// nằm chung một <c>Promise.all</c> ở frontend.
    /// </summary>
    [Theory]
    [InlineData(AuthPolicies.FacultiesRead, "REPORTS_ACCESS")]
    [InlineData(AuthPolicies.DepartmentsRead, "REPORTS_ACCESS")]
    [InlineData(AuthPolicies.LecturersRead, "REPORTS_ACCESS")]
    [InlineData(AuthPolicies.CoursesRead, "REPORTS_ACCESS")]
    [InlineData(AuthPolicies.MajorsRead, "COHORT_MAJORS_ACCESS")]
    public async Task CatalogReadPolicies_AdmitThePermissionOfEveryScreenThatReadsTheList(
        string policyName,
        string requiredPermission)
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddModuleAuthorizationPolicies();
        var app = builder.Build();
        var policyProvider = app.Services.GetRequiredService<IAuthorizationPolicyProvider>();

        var policy = await policyProvider.GetPolicyAsync(policyName);

        policy.Should().NotBeNull();
        policy!.Requirements
            .OfType<AnyPermissionRequirement>()
            .SelectMany(requirement => requirement.PermissionCodes)
            .Should().Contain(requiredPermission);
    }

    [Theory]
    [InlineData("/api/catalog/faculties", "GET", AuthPolicies.FacultiesRead)]
    [InlineData("/api/catalog/faculties", "POST", AuthPolicies.FacultiesAccess)]
    [InlineData("/api/catalog/departments", "GET", AuthPolicies.DepartmentsRead)]
    [InlineData("/api/catalog/departments", "POST", AuthPolicies.DepartmentsAccess)]
    [InlineData("/api/catalog/positions", "GET", AuthPolicies.LecturersRead)]
    [InlineData("/api/catalog/positions", "POST", AuthPolicies.LecturersAccess)]
    [InlineData("/api/catalog/majors", "GET", AuthPolicies.MajorsRead)]
    [InlineData("/api/catalog/majors", "POST", AuthPolicies.MajorsAccess)]
    [InlineData("/api/catalog/courses", "GET", AuthPolicies.CoursesRead)]
    [InlineData("/api/catalog/courses", "POST", AuthPolicies.CoursesAccess)]
    [InlineData("/api/catalog/course-sections", "GET", AuthPolicies.CourseSectionsAccess)]
    [InlineData("/api/catalog/lecturers", "GET", AuthPolicies.LecturersRead)]
    [InlineData("/api/catalog/lecturers", "POST", AuthPolicies.LecturersAccess)]
    [InlineData("/api/catalog/academic-years", "POST", AuthPolicies.CourseSectionsAccess)]
    public void CatalogEndpoints_RequireResourcePermission(
        string route,
        string method,
        string expectedPolicy)
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddAuthorization();
        builder.Services.AddSingleton(Mock.Of<ICatalogService>());
        builder.Services.AddSingleton(Mock.Of<ISurveyService>());
        var app = builder.Build();
        app.MapCatalogEndpoints();
        app.MapSurveyEndpoints();

        var endpoint = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(candidate => candidate.RoutePattern.RawText?.TrimEnd('/') == route
                && candidate.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains(method) == true);

        endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>()
            .Should().Contain(data => data.Policy == expectedPolicy);
    }

    [Theory]
    [InlineData("/api/surveys/answer-scales", "GET", AuthPolicies.CourseQuestionSetsAccess)]
    [InlineData("/api/surveys/templates", "POST", AuthPolicies.CourseQuestionSetsAccess)]
    [InlineData("/api/surveys/semester-surveys", "GET", AuthPolicies.SurveyOperationalRead)]
    [InlineData("/api/surveys/semester-surveys", "POST", AuthPolicies.CourseCampaignsAccess)]
    [InlineData("/api/surveys/semester-surveys/{semesterSurveyId:int}/sections", "GET", AuthPolicies.SurveyOperationalRead)]
    public void SurveyEndpoints_RequireTheirModulePermission(
        string route,
        string method,
        string expectedPolicy)
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddAuthorization();
        builder.Services.AddSingleton(Mock.Of<ISurveyService>());
        var app = builder.Build();
        app.MapSurveyEndpoints();

        var endpoint = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(candidate => candidate.RoutePattern.RawText == route
                && candidate.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains(method) == true);

        endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>()
            .Should().Contain(data => data.Policy == expectedPolicy);
    }

    /// <summary>
    /// Hai thao tác ghi của tính năng phân loại cảm xúc phải có thêm quyền riêng, không chỉ
    /// dựa vào quyền xem báo cáo. Thiếu bài này thì một trưởng bộ môn chỉ có REPORTS_ACCESS
    /// vẫn sửa được nhãn model — đúng thứ kế hoạch cấm.
    /// </summary>
    [Theory]
    [InlineData("/api/v1/reports/open-comments/model-status", "GET", AuthPolicies.OpenCommentModelAdmin)]
    [InlineData("/api/v1/reports/open-comments/reanalyze", "POST", AuthPolicies.OpenCommentModelAdmin)]
    [InlineData(
        "/api/v1/reports/open-comments/{responseId:int}/sentiment",
        "PATCH",
        AuthPolicies.OpenCommentSentimentReview)]
    public void SentimentAdminEndpoints_RequireTheirOwnPermissionOnTopOfReportAccess(
        string route,
        string method,
        string expectedPolicy)
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddAuthorization();
        builder.Services.AddSingleton(Mock.Of<IReportService>());
        builder.Services.AddSingleton(Mock.Of<IOpenCommentAnalysisService>());
        var app = builder.Build();
        app.MapReportEndpoints();

        var endpoint = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(candidate => candidate.RoutePattern.RawText == route
                && candidate.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains(method) == true);

        var policies = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>()
            .Select(data => data.Policy)
            .ToList();

        policies.Should().Contain(expectedPolicy);
        // Quyền module của nhóm báo cáo vẫn phải còn, nếu không thì chỉ cần một quyền AI là
        // đọc được mọi số liệu khảo sát.
        policies.Should().Contain(AuthPolicies.ReportsAccess);
    }
}
