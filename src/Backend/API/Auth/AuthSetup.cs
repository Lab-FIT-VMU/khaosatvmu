using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace API.Auth;

public static class AuthSchemes
{
    public const string Application = "AppCookie";
    public const string Pending = "PendingAuthCookie";
    public const string Google = "GoogleOIDC";
}

public static class AuthClaimTypes
{
    public const string SessionId = "session_id";
    public const string ActiveProfileId = "active_profile_id";
}

public sealed record GoogleAuthConfiguration(
    bool IsConfigured,
    string FrontendBaseUrl);

public static class AuthSetup
{
    /// <summary>
    /// Đăng ký toàn bộ policy phân quyền. Tách khỏi Program.cs để bài kiểm thử đọc được ma
    /// trận quyền, vì lỗi ở đây rất khó thấy khi chạy: policy đọc thiếu một quyền thì màn hình
    /// tương ứng chỉ nhận 403 ở một lời gọi giữa trang, không phải ở lời gọi mở trang.
    /// </summary>
    public static IServiceCollection AddModuleAuthorizationPolicies(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
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
            AddPermissionPolicy(AuthPolicies.GraduationUploadAccess, "GRADUATION_UPLOAD_ACCESS");
            AddPermissionPolicy(AuthPolicies.CohortMajorsAccess, "COHORT_MAJORS_ACCESS");
            AddPermissionPolicy(AuthPolicies.OpenCommentSentimentReview, "OPEN_COMMENT_SENTIMENT_REVIEW");
            AddPermissionPolicy(AuthPolicies.OpenCommentModelAdmin, "OPEN_COMMENT_MODEL_ADMIN");
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

            // Nhóm "một trong nhiều quyền": nhiều màn hình đọc chung một danh mục để đổ vào ô
            // chọn, nên policy đọc phải nhận quyền mở của TẤT CẢ các màn hình đó — không thì
            // màn hình bị bỏ sót vẫn mở được nhưng lời gọi nạp danh mục trả 403. Ghi thì vẫn
            // đòi đúng quyền của tài nguyên, gắn ở từng endpoint POST/PUT/DELETE.
            AddAnyPermissionPolicy(AuthPolicies.FacultiesRead,
                "FACULTIES_ACCESS", "DEPARTMENTS_ACCESS", "LECTURERS_ACCESS", "MAJORS_ACCESS",
                "COURSES_ACCESS", "COURSE_SECTIONS_ACCESS", "REPORTS_ACCESS");
            AddAnyPermissionPolicy(AuthPolicies.DepartmentsRead,
                "FACULTIES_ACCESS", "DEPARTMENTS_ACCESS", "LECTURERS_ACCESS", "COURSES_ACCESS",
                "COURSE_SECTIONS_ACCESS", "REPORTS_ACCESS");
            AddAnyPermissionPolicy(AuthPolicies.LecturersRead,
                "DEPARTMENTS_ACCESS", "LECTURERS_ACCESS", "COURSE_SECTIONS_ACCESS", "REPORTS_ACCESS");
            AddAnyPermissionPolicy(AuthPolicies.MajorsRead,
                "FACULTIES_ACCESS", "MAJORS_ACCESS", "COHORT_MAJORS_ACCESS");
            AddAnyPermissionPolicy(AuthPolicies.CoursesRead,
                "DEPARTMENTS_ACCESS", "COURSES_ACCESS", "COURSE_SECTIONS_ACCESS", "REPORTS_ACCESS");

            void AddPermissionPolicy(string policyName, string permissionCode) =>
                options.AddPolicy(policyName, policy =>
                    policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement(permissionCode)));

            void AddAnyPermissionPolicy(string policyName, params string[] permissionCodes) =>
                options.AddPolicy(policyName, policy =>
                    policy.RequireAuthenticatedUser().AddRequirements(new AnyPermissionRequirement(permissionCodes)));
        });

        return services;
    }

    public static IServiceCollection AddApplicationAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        var clientId = configuration["Authentication:Google:ClientId"];
        var clientSecret = configuration["Authentication:Google:ClientSecret"];
        var frontendBaseUrl = configuration["Authentication:FrontendBaseUrl"] ?? "http://localhost:5173";
        var googleConfigured = !string.IsNullOrWhiteSpace(clientId)
            && !string.IsNullOrWhiteSpace(clientSecret);

        if (!environment.IsDevelopment() && !googleConfigured)
        {
            throw new InvalidOperationException(
                "Authentication:Google:ClientId and ClientSecret are required in production.");
        }

        if (!Uri.TryCreate(frontendBaseUrl, UriKind.Absolute, out var frontendUri)
            || (!environment.IsDevelopment()
                && frontendUri.Scheme != Uri.UriSchemeHttps
                && !frontendUri.IsLoopback))
        {
            throw new InvalidOperationException(
                "Authentication:FrontendBaseUrl must be an absolute HTTPS URL in production.");
        }

        services.AddSingleton(new GoogleAuthConfiguration(googleConfigured, frontendBaseUrl));

        var authentication = services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = AuthSchemes.Application;
                options.DefaultSignInScheme = AuthSchemes.Application;
                options.DefaultChallengeScheme = AuthSchemes.Application;
            })
            .AddCookie(AuthSchemes.Application, options =>
            {
                options.Cookie.Name = ".khaosatvmu.auth";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = environment.IsDevelopment()
                    ? CookieSecurePolicy.SameAsRequest
                    : CookieSecurePolicy.Always;
                options.SlidingExpiration = false;
                options.ExpireTimeSpan = TimeSpan.FromHours(8);
                options.LoginPath = "/api/auth/login";
                options.LogoutPath = "/api/auth/logout";
                options.EventsType = typeof(ApplicationCookieEvents);
            })
            .AddCookie(AuthSchemes.Pending, options =>
            {
                options.Cookie.Name = ".khaosatvmu.pending-auth";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = environment.IsDevelopment()
                    ? CookieSecurePolicy.SameAsRequest
                    : CookieSecurePolicy.Always;
                options.ExpireTimeSpan = TimeSpan.FromMinutes(10);
            });

        if (googleConfigured)
        {
            authentication.AddOpenIdConnect(AuthSchemes.Google, options =>
            {
                options.Authority = "https://accounts.google.com";
                options.ClientId = clientId!;
                options.ClientSecret = clientSecret!;
                options.SignInScheme = AuthSchemes.Pending;
                options.CallbackPath = "/signin-google";
                options.ResponseType = OpenIdConnectResponseType.Code;
                options.UsePkce = true;
                options.SaveTokens = false;
                options.GetClaimsFromUserInfoEndpoint = true;
                options.MapInboundClaims = false;
                options.Scope.Clear();
                options.Scope.Add("openid");
                options.Scope.Add("profile");
                options.Scope.Add("email");
                options.TokenValidationParameters.NameClaimType = "name";
                options.Events = new OpenIdConnectEvents
                {
                    OnRemoteFailure = context =>
                    {
                        context.HandleResponse();
                        context.Response.Redirect($"{frontendBaseUrl.TrimEnd('/')}/login?error=AUTH_GOOGLE_REMOTE_FAILURE");
                        return Task.CompletedTask;
                    }
                };
            });
        }

        return services;
    }
}
