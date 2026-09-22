using API.Auth;
using API.Catalog;
using API.Cohorts;
using API.Configuration;
using API.GraduationAnalytics2;
using API.Middleware;
using API.Reports;
using API.Surveys;
using API.UserAdministration;
using Application.Auth;
using Application.Catalog;
using Application.Cohorts;
using Application.Common.Interfaces;
using Application.Reports;
using Application.Surveys;
using Application.UserAdministration;
using Infrastructure.Auth;
using Infrastructure.Catalog;
using Infrastructure.Cohorts;
using Infrastructure.Persistence;
using Infrastructure.Reports;
using Infrastructure.Services;
using Infrastructure.Surveys;
using Infrastructure.UserAdministration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using System.Threading.RateLimiting;

DevelopmentEnvironment.LoadNearestEnvFile();

// High-Concurrency ThreadPool Warmup for 1,000+ Concurrent Requests
ThreadPool.SetMinThreads(300, 300);

var builder = WebApplication.CreateBuilder(args);

// Exception Handling & Problem Details
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddOpenApi();
builder.Services.AddMemoryCache();
builder.Services.AddHttpContextAccessor();
builder.Services.AddPersistence(builder.Configuration);

// Health Checks with Database Readiness
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>("database", HealthStatus.Unhealthy);

// CORS Policy for Frontend Integration
var frontendBaseUrl = builder.Configuration["Authentication:FrontendBaseUrl"] ?? "http://localhost:5173";
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy.WithOrigins(frontendBaseUrl, "http://localhost:5173", "http://127.0.0.1:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// High-Throughput Rate Limiter for 1000+ Concurrent Students
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddConcurrencyLimiter("PublicSurveyConcurrency", limiterOptions =>
    {
        limiterOptions.PermitLimit = 800;
        limiterOptions.QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst;
        limiterOptions.QueueLimit = 500;
    });
    options.AddPolicy("PublicSurveySubmission", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    // Phát vé bắt đầu làm bài. Nới tay hơn nộp bài vì bấm lại bao nhiêu lần cũng
    // được, nhưng vẫn chặn kiểu quay vòng xin vé hàng loạt.
    options.AddPolicy("PublicSurveyStart", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddApplicationAuthentication(builder.Configuration, builder.Environment);
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = ".khaosatvmu.csrf";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
});

builder.Services.AddAuthorization(options =>
{
    AddPermissionPolicy(AuthPolicies.UserAdminAccess, "USER_ADMIN_ACCESS");
    AddPermissionPolicy(AuthPolicies.FacultiesAccess, "FACULTIES_ACCESS");
    AddPermissionPolicy(AuthPolicies.DepartmentsAccess, "DEPARTMENTS_ACCESS");
    AddPermissionPolicy(AuthPolicies.LecturersAccess, "LECTURERS_ACCESS");
    AddPermissionPolicy(AuthPolicies.MajorsAccess, "MAJORS_ACCESS");
    AddPermissionPolicy(AuthPolicies.CoursesAccess, "COURSES_ACCESS");
    AddPermissionPolicy(AuthPolicies.CourseSectionsAccess, "COURSE_SECTIONS_ACCESS");
    AddPermissionPolicy(AuthPolicies.CourseQuestionSetsAccess, "COURSE_QUESTION_SETS_ACCESS");
    AddPermissionPolicy(AuthPolicies.CourseCampaignsAccess, "COURSE_CAMPAIGNS_ACCESS");
    AddPermissionPolicy(AuthPolicies.ProgramCampaignsAccess, "PROGRAM_CAMPAIGNS_ACCESS");
    AddPermissionPolicy(AuthPolicies.ProgramCriteriaAccess, "PROGRAM_CRITERIA_ACCESS");
    AddPermissionPolicy(AuthPolicies.ProgressAccess, "PROGRESS_ACCESS");
    AddPermissionPolicy(AuthPolicies.ReportsAccess, "REPORTS_ACCESS");
    AddPermissionPolicy(AuthPolicies.SurveyDashboardAccess, "SURVEY_DASHBOARD_ACCESS");
    AddPermissionPolicy(AuthPolicies.SurveyStatisticsAccess, "SURVEY_STATISTICS_ACCESS");
    AddPermissionPolicy(AuthPolicies.SurveyAnalysisAccess, "SURVEY_ANALYSIS_ACCESS");
    AddPermissionPolicy(AuthPolicies.GraduationAnalyticsAccess, "GRADUATION_ANALYTICS_ACCESS");
    AddPermissionPolicy(AuthPolicies.CohortMajorsAccess, "COHORT_MAJORS_ACCESS");
    AddAnyPermissionPolicy(AuthPolicies.ReportingRead,
        "REPORTS_ACCESS", "SURVEY_DASHBOARD_ACCESS", "SURVEY_STATISTICS_ACCESS",
        "SURVEY_ANALYSIS_ACCESS");
    options.AddPolicy(AuthPolicies.SurveyOperationalRead, policy =>
        policy.RequireAuthenticatedUser().AddRequirements(new AnyPermissionRequirement(
            "PROGRESS_ACCESS",
            "REPORTS_ACCESS",
            "SURVEY_DASHBOARD_ACCESS",
            "SURVEY_STATISTICS_ACCESS",
            "SURVEY_ANALYSIS_ACCESS",
            "COURSE_CAMPAIGNS_ACCESS")));
    AddAnyPermissionPolicy(AuthPolicies.FacultiesRead,
        "FACULTIES_ACCESS", "DEPARTMENTS_ACCESS", "LECTURERS_ACCESS", "MAJORS_ACCESS",
        "COURSES_ACCESS", "COURSE_SECTIONS_ACCESS", "REPORTS_ACCESS");
    AddAnyPermissionPolicy(AuthPolicies.DepartmentsRead,
        "FACULTIES_ACCESS", "DEPARTMENTS_ACCESS", "LECTURERS_ACCESS", "COURSES_ACCESS",
        "COURSE_SECTIONS_ACCESS", "REPORTS_ACCESS");
    AddAnyPermissionPolicy(AuthPolicies.LecturersRead,
        "DEPARTMENTS_ACCESS", "LECTURERS_ACCESS", "COURSE_SECTIONS_ACCESS", "REPORTS_ACCESS");
    AddAnyPermissionPolicy(AuthPolicies.MajorsRead,
        "FACULTIES_ACCESS", "MAJORS_ACCESS");
    AddAnyPermissionPolicy(AuthPolicies.CoursesRead,
        "DEPARTMENTS_ACCESS", "COURSES_ACCESS", "COURSE_SECTIONS_ACCESS");

    void AddPermissionPolicy(string policyName, string permissionCode) =>
        options.AddPolicy(policyName, policy =>
            policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement(permissionCode)));

    void AddAnyPermissionPolicy(string policyName, params string[] permissionCodes) =>
        options.AddPolicy(policyName, policy =>
            policy.RequireAuthenticatedUser().AddRequirements(new AnyPermissionRequirement(permissionCodes)));
});

builder.Services.AddHttpClient<IAgentMemoryService, AgentMemoryService>();
builder.Services.AddScoped<IAuthService, EfAuthService>();
builder.Services.AddScoped<IAuthSessionService, EfAuthSessionService>();
builder.Services.AddScoped<IUserAdministrationService, EfUserAdministrationService>();
builder.Services.AddScoped<ICatalogService, EfCatalogService>();
builder.Services.AddScoped<ICohortService, EfCohortService>();
builder.Services.AddScoped<ISurveyService, EfSurveyService>();
builder.Services.AddScoped<ICourseSurveyQrExporter, ClosedXmlCourseSurveyQrExporter>();
builder.Services.AddScoped<IScoringThresholdProvider, EfScoringThresholdProvider>();
builder.Services.AddScoped<ISurveyPublicationService, EfSurveyPublicationService>();
// Kho ảnh của phiếu khảo sát; không giữ trạng thái nên dùng chung một thể hiện.
builder.Services.AddSingleton<SurveyFormAssetStore>();
// Vé bắt đầu làm bài. Khóa ký khác nhau giữa máy dev và máy chạy thật, lấy từ
// cấu hình chứ không viết trong mã. Đổi khóa thì mọi vé đang phát mất hiệu lực.
builder.Services.AddSingleton(_ =>
{
    var signingKey = builder.Configuration["SurveyTicket:SigningKey"];
    if (string.IsNullOrWhiteSpace(signingKey))
    {
        throw new InvalidOperationException(
            "SurveyTicket:SigningKey is required. Set it via environment variable SurveyTicket__SigningKey.");
    }
    return new SurveyStartTicket(signingKey);
});
// Singleton: số phiên bản cache tổng quan phải dùng chung cho cả tiến trình, một
// request huỷ phiếu tăng nó là mọi request khác đọc ngay số mới.
builder.Services.AddSingleton<SchoolOverviewCacheVersion>();
builder.Services.AddScoped<IReportService, EfReportService>();
// Module thống kê tốt nghiệp chính thức dùng dữ liệu danh mục khoá/ngành.
builder.Services.AddScoped<
    Application.GraduationAnalytics2.IGraduationImportParser,
    Infrastructure.GraduationAnalytics2.ClosedXmlGraduationImportParser>();
builder.Services.AddScoped<
    Application.GraduationAnalytics2.IGraduationImportCatalogResolver,
    Infrastructure.GraduationAnalytics2.EfGraduationImportCatalogResolver>();
builder.Services.AddScoped<
    Application.GraduationAnalytics2.IGraduationAnalyticsV3Service,
    Infrastructure.GraduationAnalytics2.EfGraduationAnalyticsV3Service>();
builder.Services.AddScoped<ApplicationCookieEvents>();
builder.Services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();
builder.Services.AddScoped<IAuthorizationHandler, AnyPermissionAuthorizationHandler>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseForwardedHeaders();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    await DatabaseSeeder.SeedAsync(db, app.Environment.IsDevelopment());
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors("FrontendPolicy");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => Results.Ok(new
{
    service = "khaosatvmu-api",
    status = "ok"
}));

app.MapAuthEndpoints();
app.MapUserAdministrationEndpoints();
app.MapCatalogEndpoints();
app.MapCohortEndpoints();
app.MapSurveyEndpoints();
app.MapReportEndpoints();
app.MapGraduationAnalytics2Endpoints();

app.MapHealthChecks("/healthz");
app.MapHealthChecks("/api/health");

app.Run();
