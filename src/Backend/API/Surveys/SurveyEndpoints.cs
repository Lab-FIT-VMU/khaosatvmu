using API.Auth;
using Application.Surveys;
using Domain;
using Microsoft.AspNetCore.Mvc;

namespace API.Surveys;

public static class SurveyEndpoints
{
    public static IEndpointRouteBuilder MapSurveyEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var questionSetGroup = endpoints
            .MapGroup("/api/surveys")
            .RequireAuthorization(AuthPolicies.CourseQuestionSetsAccess);
        var campaignGroup = endpoints
            .MapGroup("/api/surveys")
            .RequireAuthorization(AuthPolicies.CourseCampaignsAccess);
        var operationalReadGroup = endpoints
            .MapGroup("/api/surveys")
            .RequireAuthorization(AuthPolicies.SurveyOperationalRead);
        // Nhóm Báo cáo tách theo từng trang: mỗi trang một quyền riêng để quản trị
        // viên bật/tắt độc lập trong màn hình Phân quyền Module.
        var surveyDashboardGroup = endpoints
            .MapGroup("/api/surveys")
            .RequireAuthorization(AuthPolicies.SurveyDashboardAccess);
        // Trang bảng dữ liệu khảo sát và nút tính điểm theo mẻ.
        var surveyStatisticsGroup = endpoints
            .MapGroup("/api/surveys")
            .RequireAuthorization(AuthPolicies.SurveyStatisticsAccess);
        var surveyAnalysisGroup = endpoints
            .MapGroup("/api/surveys")
            .RequireAuthorization(AuthPolicies.SurveyAnalysisAccess);
        // Endpoint dùng chung cho bảng điều khiển, mở cho mọi quyền nhóm Báo cáo.
        var reportingReadGroup = endpoints
            .MapGroup("/api/surveys")
            .RequireAuthorization(AuthPolicies.ReportingRead);

        // --------------------------------------------------------- Answer scales

        questionSetGroup.MapGet("/answer-scales", async (
            ISurveyService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetAnswerScalesAsync(cancellationToken)));

        questionSetGroup.MapPost("/answer-scales", async (
            SaveAnswerScaleRequest request,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateAnswerScaleAsync(request.ToCommand(), cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        questionSetGroup.MapPut("/answer-scales/{answerScaleId:int}", async (
            int answerScaleId,
            SaveAnswerScaleRequest request,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateAnswerScaleAsync(
                answerScaleId,
                request.ToCommand(),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        questionSetGroup.MapDelete("/answer-scales/{answerScaleId:int}", async (
            int answerScaleId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteAnswerScaleAsync(answerScaleId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        // ------------------------------------------------------ Survey templates

        questionSetGroup.MapGet("/templates", async (
            ISurveyService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetSurveyTemplatesAsync(cancellationToken)));

        questionSetGroup.MapPost("/templates", async (
            SaveSurveyTemplateRequest request,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateSurveyTemplateAsync(request.ToCommand(), cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        questionSetGroup.MapPut("/templates/{surveyTemplateId:int}", async (
            int surveyTemplateId,
            SaveSurveyTemplateRequest request,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateSurveyTemplateAsync(
                surveyTemplateId,
                request.ToCommand(),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        questionSetGroup.MapDelete("/templates/{surveyTemplateId:int}", async (
            int surveyTemplateId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteSurveyTemplateAsync(surveyTemplateId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        // ------------------------------------------- Đợt khảo sát theo học kỳ

        operationalReadGroup.MapGet("/semester-surveys", async (
            int? semesterId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetSemesterSurveysAsync(semesterId, cancellationToken)));

        campaignGroup.MapPost("/semester-surveys", async (
            CreateSemesterSurveyRequest request,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.CreateSemesterSurveyAsync(request.ToCommand(), cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        campaignGroup.MapPut("/semester-surveys/{semesterSurveyId:int}", async (
            int semesterSurveyId,
            UpdateSemesterSurveyRequest request,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.UpdateSemesterSurveyAsync(
                semesterSurveyId,
                request.ToCommand(),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        campaignGroup.MapDelete("/semester-surveys/{semesterSurveyId:int}", async (
            int semesterSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.DeleteSemesterSurveyAsync(semesterSurveyId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        // Xuất Excel danh sách lớp kèm ảnh mã QR. Dựng ở server vì một đợt có thể
        // tới vài nghìn lớp; để trình duyệt sinh chừng ấy ảnh QR rồi nén workbook
        // là treo tab. Nằm ở nhóm chỉ-đọc vì giảng viên cũng cần lấy QR lớp mình.
        operationalReadGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/qr-export", async (
            int semesterSurveyId,
            [FromServices] ICourseSurveyQrExporter exporter,
            CancellationToken cancellationToken) =>
        {
            var result = await exporter.ExportAsync(semesterSurveyId, cancellationToken);
            if (!result.Succeeded || result.Value is null)
            {
                return ToResult(result);
            }

            return Results.File(
                result.Value.Content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                result.Value.FileName);
        });

        // Cặp ngưỡng lọc lớp được tính điểm. Đọc mở cho mọi vai trò đọc số liệu —
        // các trang báo cáo cần in ra "đang tính theo x%/y%"; ghi thì provider tự
        // chặn về quản trị.
        operationalReadGroup.MapGet("/scoring-thresholds", async (
            [FromServices] IScoringThresholdProvider provider,
            CancellationToken cancellationToken) =>
            Results.Ok(await provider.GetAsync(cancellationToken)));

        // Các trang thống kê hỏi định kỳ để báo khi người khác đổi cấu hình hoặc tính
        // lại điểm. Không truyền afterId thì chỉ nhận mốc mới nhất.
        operationalReadGroup.MapGet("/scoring-changes", async (
            long? afterId,
            [FromServices] IScoringThresholdProvider provider,
            CancellationToken cancellationToken) =>
            Results.Ok(await provider.GetChangesAsync(afterId, cancellationToken)));

        campaignGroup.MapPut("/scoring-thresholds", async (
            SaveScoringThresholdsRequest request,
            [FromServices] IScoringThresholdProvider provider,
            CancellationToken cancellationToken) =>
            ToResult(await provider.UpdateAsync(
                // Không còn chọn bẫy lỗi: luôn áp cả ba luật của bộ lọc nhiễu.
                new ScoringThresholds(
                    request.MinimumResponseRate,
                    request.MinimumValidRate,
                    RejectTooFast: true,
                    RejectSingleAnswer: true,
                    RejectAttentionCheckFailed: true),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        // Đếm trước số lớp của một phạm vi, để hộp thoại nói rõ sẽ tạo bao nhiêu bài
        // trước khi người dùng bấm xác nhận.
        campaignGroup.MapGet("/section-scope-preview", async (
            int semesterId,
            string scopeType,
            int? scopeId,
            int? semesterSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.PreviewSectionScopeAsync(
                semesterId,
                scopeType,
                scopeId,
                semesterSurveyId,
                cancellationToken)));

        // Bổ sung lớp vào đợt đã có theo phạm vi tự chọn: cả kỳ, một khoa/viện, một
        // bộ môn, hoặc đúng một lớp học phần.
        campaignGroup.MapPost("/semester-surveys/{semesterSurveyId:int}/add-sections", async (
            int semesterSurveyId,
            AddSectionsToSemesterSurveyRequest request,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.AddSectionsToSemesterSurveyAsync(
                semesterSurveyId,
                request.ToCommand(),
                cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        operationalReadGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/sections", async (
            int semesterSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetCourseSectionSurveysAsync(semesterSurveyId, null, cancellationToken)));

        operationalReadGroup.MapGet("/course-section-surveys", async (
            int? semesterSurveyId,
            int? semesterId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetCourseSectionSurveysAsync(semesterSurveyId, semesterId, cancellationToken)));

        operationalReadGroup.MapGet("/course-section-surveys/{courseSectionSurveyId:int}", async (
            int courseSectionSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetCourseSectionSurveyAsync(courseSectionSurveyId, cancellationToken)));

        operationalReadGroup.MapGet("/course-section-surveys/{courseSectionSurveyId:int}/responses", async (
            int courseSectionSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetSurveyResponsesAsync(courseSectionSurveyId, cancellationToken)));

        // Huỷ toàn bộ phiếu của một lớp để lớp làm lại. Nằm ở campaignGroup chứ
        // không phải nhóm chỉ đọc: đây là thao tác bỏ dữ liệu đã thu.
        campaignGroup.MapPost("/course-section-surveys/{courseSectionSurveyId:int}/clear-responses", async (
            int courseSectionSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.ClearSectionSurveyResponsesAsync(courseSectionSurveyId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        operationalReadGroup.MapGet("/responses/{responseId:int}", async (
            int responseId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetSurveyResponseAsync(responseId, cancellationToken)));

        // ------------------------------------------------------- Thống kê điểm

        surveyStatisticsGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/statistics", async (
            int semesterSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetSemesterSurveyStatisticsAsync(semesterSurveyId, cancellationToken)));

        // questionSectionId: tính điểm và Z-Score chỉ trên các câu của một mục; bỏ trống
        // là toàn bộ bài khảo sát.
        surveyAnalysisGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/normalization", async (
            int semesterSurveyId,
            int? questionSectionId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetSemesterSurveyNormalizationAsync(
                semesterSurveyId,
                cancellationToken,
                questionSectionId)));

        surveyAnalysisGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/department-summary", async (
            int semesterSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetSemesterSurveyDepartmentSummaryAsync(semesterSurveyId, cancellationToken)));

        // Dải chỉ số gọn cho bảng điều khiển riêng của trưởng bộ môn. Số của bộ môn
        // kèm số toàn trường để so; mặt bằng vẫn tính trên toàn bộ dữ liệu.
        reportingReadGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/department-dashboard", async (
            int semesterSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetDepartmentDashboardAsync(semesterSurveyId, cancellationToken)));

        surveyDashboardGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/dashboard", async (
            int semesterSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetSemesterSurveyDashboardAsync(semesterSurveyId, cancellationToken)));

        surveyAnalysisGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/course-diagnosis", async (
            int semesterSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetSemesterSurveyCourseDiagnosisAsync(semesterSurveyId, cancellationToken)));

        // Trang chi tiết theo phạm vi giờ nằm trong module Thống kê & Báo cáo, nên
        // endpoint phải mở cho mọi quyền của nhóm Báo cáo. Nhóm này là hợp của bốn
        // quyền báo cáo (gồm cả SURVEY_ANALYSIS_ACCESS), nên ai đang xem được ở
        // trang Thống kê chi tiết vẫn mở được y như trước.
        reportingReadGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/scope-analysis", async (
            int semesterSurveyId,
            string scopeType,
            int scopeId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetSurveyScopeAnalysisAsync(
                semesterSurveyId,
                scopeType,
                scopeId,
                cancellationToken)));

        surveyAnalysisGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/lecturers", async (
            int semesterSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetSemesterSurveyLecturersAsync(semesterSurveyId, cancellationToken)));

        surveyAnalysisGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/lecturers/{lecturerId:int}", async (
            int semesterSurveyId,
            int lecturerId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetLecturerSurveyReportAsync(semesterSurveyId, lecturerId, cancellationToken)));

        // Tính lại theo mẻ, chỉ chạy khi quản trị bấm nút.
        surveyStatisticsGroup.MapPost("/semester-surveys/{semesterSurveyId:int}/recalculate-scores", async (
            int semesterSurveyId,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.RecalculateSemesterSurveyScoresAsync(semesterSurveyId, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        // Trạng thái phát hành kết quả của một đợt. Ai cũng đọc được để giao diện biết
        // vì sao trống, nhưng chỉ quản trị mới đổi được (service tự chặn).
        surveyStatisticsGroup.MapGet("/semester-surveys/{semesterSurveyId:int}/publication", async (
            int semesterSurveyId,
            [FromServices] ISurveyPublicationService publication,
            CancellationToken cancellationToken) =>
            ToResult(await publication.GetAsync(semesterSurveyId, cancellationToken)));

        surveyStatisticsGroup.MapPut("/semester-surveys/{semesterSurveyId:int}/publication", async (
            int semesterSurveyId,
            SetSurveyPublicationRequest request,
            [FromServices] ISurveyPublicationService publication,
            CancellationToken cancellationToken) =>
            ToResult(await publication.SetAsync(semesterSurveyId, request.Publish, cancellationToken)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        // Phiếu của sinh viên: mở bằng link hoặc mã QR nên không yêu cầu đăng nhập.
        var publicGroup = endpoints.MapGroup("/api/public/surveys")
            .AllowAnonymous();

        publicGroup.MapGet("/{linkToken}", async (
            string linkToken,
            ISurveyService service,
            CancellationToken cancellationToken) =>
            ToResult(await service.GetPublicSurveyAsync(linkToken, cancellationToken)))
            .RequireRateLimiting("PublicSurveyConcurrency");

        // Cú bấm "Bắt đầu làm bài" là mốc tính thời gian làm bài. Không cache
        // được vì mỗi sinh viên phải nhận một vé riêng, và cũng không lưu gì.
        publicGroup.MapPost("/{linkToken}/start", async (
            string linkToken,
            ISurveyService service,
            [FromServices] SurveyStartTicket ticket,
            CancellationToken cancellationToken) =>
        {
            // Vẫn phải kiểm link có thật và còn mở, tránh phát vé cho link rác.
            var survey = await service.GetPublicSurveyAsync(linkToken, cancellationToken);
            if (!survey.Succeeded || survey.Value is not { } value)
            {
                return ToResult(survey);
            }
            if (!value.IsOpen)
            {
                return Results.Json(
                    new { errorCode = SurveyErrorCodes.LinkNotOpen },
                    statusCode: StatusCodes.Status409Conflict);
            }

            return Results.Ok(new StartSurveyResponse(ticket.Issue(linkToken, DateTime.UtcNow)));
        }).RequireRateLimiting("PublicSurveyStart");

        publicGroup.MapPost("/{linkToken}/responses", async (
            string linkToken,
            SubmitSurveyResponseRequest request,
            ISurveyService service,
            [FromServices] SurveyStartTicket ticket,
            CancellationToken cancellationToken) =>
            ToResult(await service.SubmitSurveyResponseAsync(
                linkToken,
                request.ToCommand(
                    // Vé thiếu, sai chữ ký hay của lớp khác đều quy về 0 giây,
                    // để luật TOO_FAST của bộ lọc tự bắt.
                    ticket.ElapsedSeconds(request.StartTicket, linkToken, DateTime.UtcNow)),
                cancellationToken)))
            .RequireRateLimiting("PublicSurveySubmission");

        // ------------------------------------------------------------ Restore

        questionSetGroup.MapPatch("/answer-scales/{answerScaleId:int}/restore", async (
            int answerScaleId, ISurveyService service, CancellationToken ct) =>
            ToResult(await service.RestoreAnswerScaleAsync(answerScaleId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        questionSetGroup.MapPatch("/survey-templates/{surveyTemplateId:int}/restore", async (
            int surveyTemplateId, ISurveyService service, CancellationToken ct) =>
            ToResult(await service.RestoreSurveyTemplateAsync(surveyTemplateId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        campaignGroup.MapPatch("/semester-surveys/{semesterSurveyId:int}/restore", async (
            int semesterSurveyId, ISurveyService service, CancellationToken ct) =>
            ToResult(await service.RestoreSemesterSurveyAsync(semesterSurveyId, ct)))
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        return endpoints;
    }

    private static IResult ToResult<T>(SurveyOperationResult<T> result)
    {
        if (result.Succeeded && result.Value is not null)
        {
            return Results.Ok(result.Value);
        }

        var statusCode = result.ErrorCode switch
        {
            SurveyErrorCodes.OutOfScope => StatusCodes.Status403Forbidden,
            SurveyErrorCodes.ResultsNotPublished => StatusCodes.Status403Forbidden,
            SurveyErrorCodes.SurveyNotEnded => StatusCodes.Status409Conflict,
            SurveyErrorCodes.AnswerScaleNotFound => StatusCodes.Status404NotFound,
            SurveyErrorCodes.TemplateNotFound => StatusCodes.Status404NotFound,
            SurveyErrorCodes.SemesterNotFound => StatusCodes.Status404NotFound,
            SurveyErrorCodes.SemesterSurveyNotFound => StatusCodes.Status404NotFound,
            SurveyErrorCodes.SectionSurveyNotFound => StatusCodes.Status404NotFound,
            SurveyErrorCodes.LecturerHasNoSections => StatusCodes.Status404NotFound,
            SurveyErrorCodes.ResponseNotFound => StatusCodes.Status404NotFound,
            SurveyErrorCodes.LinkNotFound => StatusCodes.Status404NotFound,
            SurveyErrorCodes.QuestionScaleNotFound => StatusCodes.Status404NotFound,
            SurveyErrorCodes.AnswerScaleNameExists => StatusCodes.Status409Conflict,
            SurveyErrorCodes.TemplateNameExists => StatusCodes.Status409Conflict,
            SurveyErrorCodes.AnswerScaleInUse => StatusCodes.Status409Conflict,
            SurveyErrorCodes.AnswerScaleKindLocked => StatusCodes.Status409Conflict,
            SurveyErrorCodes.TemplateInUse => StatusCodes.Status409Conflict,
            SurveyErrorCodes.SemesterSurveyHasResponses => StatusCodes.Status409Conflict,
            SurveyErrorCodes.ScopeSectionsAlreadyAdded => StatusCodes.Status409Conflict,
            SurveyErrorCodes.SectionSurveyHasNoResponses => StatusCodes.Status409Conflict,
            SurveyErrorCodes.SemesterSurveyHasNoSections => StatusCodes.Status409Conflict,
            SurveyErrorCodes.LinkNotOpen => StatusCodes.Status409Conflict,
            SurveyErrorCodes.ScoringThresholdInvalid => StatusCodes.Status400BadRequest,
            _ => StatusCodes.Status400BadRequest
        };
        return Results.Json(new { errorCode = result.ErrorCode }, statusCode: statusCode);
    }

    /// <summary>Phát hành hoặc thu hồi kết quả của một đợt.</summary>
    public sealed record SetSurveyPublicationRequest(bool Publish);

    /// <summary>Hai vòng lọc lớp được tính điểm, đơn vị phần trăm.</summary>
    public sealed record SaveScoringThresholdsRequest(
        decimal MinimumResponseRate,
        decimal MinimumValidRate);

    public sealed record SaveAnswerScaleOptionRequest(int Value, string? DisplayText);

    public sealed record SaveAnswerScaleRequest(
        string AnswerScaleName,
        string? ScaleKind,
        IReadOnlyList<SaveAnswerScaleOptionRequest>? Options)
    {
        public SaveAnswerScaleCommand ToCommand() => new(
            AnswerScaleName,
            // Bỏ trống thì hiểu là thang có mức chọn, giữ tương thích với client cũ.
            string.IsNullOrWhiteSpace(ScaleKind) ? AnswerScaleKinds.Options : ScaleKind,
            Options?
                .Select(x => new SaveAnswerScaleOptionCommand(x.Value, x.DisplayText ?? string.Empty))
                .ToList() ?? []);
    }

    /// <summary>
    /// Một mục của bộ câu hỏi. <paramref name="SectionId"/> để trống là mục mới;
    /// có giá trị thì phải là mục có thật của chính bộ đang sửa.
    /// </summary>
    public sealed record SaveSurveyQuestionSectionRequest(
        int? SectionId,
        string? SectionName);

    /// <summary>
    /// <paramref name="AttentionCheckValue"/> để trống là câu hỏi bình thường;
    /// điền một mức thì câu đó thành câu bẫy độ tập trung.
    /// <paramref name="SectionIndex"/> là vị trí mục trong danh sách gửi kèm.
    /// </summary>
    public sealed record SaveSurveyQuestionRequest(
        string? QuestionText,
        int AnswerScaleId,
        int? AttentionCheckValue,
        int SectionIndex);

    public sealed record SaveSurveyTemplateRequest(
        string TemplateName,
        IReadOnlyList<SaveSurveyQuestionSectionRequest>? Sections,
        IReadOnlyList<SaveSurveyQuestionRequest>? Questions)
    {
        public SaveSurveyTemplateCommand ToCommand() => new(
            TemplateName,
            Sections?
                .Select(x => new SaveSurveyQuestionSectionCommand(
                    x.SectionId,
                    x.SectionName ?? string.Empty))
                .ToList() ?? [],
            Questions?
                .Select(x => new SaveSurveyQuestionCommand(
                    x.QuestionText ?? string.Empty,
                    x.AnswerScaleId,
                    x.AttentionCheckValue,
                    x.SectionIndex))
                .ToList() ?? []);
    }

    public sealed record CreateSemesterSurveyRequest(
        string SurveyName,
        int SemesterId,
        int SurveyTemplateId,
        DateTime StartTime,
        DateTime EndTime,
        string? ScopeType,
        int? ScopeId)
    {
        public CreateSemesterSurveyCommand ToCommand() =>
            new(
                SurveyName,
                SemesterId,
                SurveyTemplateId,
                StartTime,
                EndTime,
                // Client cũ không gửi phạm vi thì giữ nguyên hành vi cũ: phát cả kỳ.
                ScopeType ?? SurveyScopeTypes.All,
                ScopeId);
    }

    public sealed record UpdateSemesterSurveyRequest(
        string SurveyName,
        DateTime StartTime,
        DateTime EndTime)
    {
        public UpdateSemesterSurveyCommand ToCommand() =>
            new(SurveyName, StartTime, EndTime);
    }

    public sealed record AddSectionsToSemesterSurveyRequest(
        string ScopeType,
        int? ScopeId,
        DateTime StartTime,
        DateTime EndTime)
    {
        public AddSectionsToSemesterSurveyCommand ToCommand() =>
            new(ScopeType, ScopeId, StartTime, EndTime);
    }

    public sealed record SaveSurveyScheduleRequest(DateTime StartTime, DateTime EndTime);

    public sealed record SubmitSurveyAnswerRequest(int QuestionId, string? AnswerValue);

    /// <summary>Vé nhận được khi bấm "Bắt đầu làm bài".</summary>
    public sealed record StartSurveyResponse(string StartTicket);

    public sealed record SubmitSurveyResponseRequest(
        IReadOnlyList<SubmitSurveyAnswerRequest>? Answers,
        string? AdditionalComments,
        /// <summary>Vé lấy từ endpoint /start. Thiếu cũng nhận, phiếu sẽ bị lọc.</summary>
        string? StartTicket)
    {
        public SubmitSurveyResponseCommand ToCommand(double elapsedSeconds) => new(
            Answers?
                .Select(x => new SubmitSurveyAnswerCommand(x.QuestionId, x.AnswerValue ?? string.Empty))
                .ToList() ?? [],
            AdditionalComments,
            elapsedSeconds);
    }
}
