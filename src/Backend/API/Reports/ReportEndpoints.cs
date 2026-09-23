using API.Auth;
using Application.Reports;

namespace API.Reports;

public static class ReportEndpoints
{
    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/reports")
            .RequireAuthorization(AuthPolicies.ReportsAccess);

        group.MapGet("/operational-progress", async (
            int semesterId,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var report = await reportService.GetOperationalProgressReportAsync(semesterId, cancellationToken);
            return report is null ? Results.NotFound() : Results.Ok(report);
        });

        group.MapGet("/lecturers", async (
            int? facultyId,
            int? departmentId,
            int? semesterId,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var reports = await reportService.GetLecturerPerformanceReportsAsync(facultyId, departmentId, semesterId, cancellationToken);
            return Results.Ok(reports);
        });

        // Giảng viên chưa gắn mã: tra theo tên đọc từ tệp import, khoanh trong một
        // khoa/viện. Ràng buộc :int của route bên dưới không bắt nhầm chữ "unidentified".
        group.MapGet("/lecturers/unidentified", async (
            string name,
            int? facultyId,
            int? semesterId,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var report = await reportService.GetUnidentifiedLecturerReportAsync(name, facultyId, semesterId, cancellationToken);
            return report is null ? Results.NotFound() : Results.Ok(report);
        });

        group.MapGet("/lecturers/{lecturerId:int}", async (
            int lecturerId,
            int? semesterId,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var report = await reportService.GetLecturerPerformanceReportAsync(lecturerId, semesterId, cancellationToken);
            return report is null ? Results.NotFound() : Results.Ok(report);
        });

        group.MapGet("/faculties", async (
            int? semesterId,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var reports = await reportService.GetFacultyDepartmentReportsAsync(semesterId, cancellationToken);
            return Results.Ok(reports);
        });

        group.MapGet("/question-analysis", async (
            int semesterSurveyId,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var report = await reportService.GetQuestionAnalysisReportAsync(semesterSurveyId, cancellationToken);
            return report is null ? Results.NotFound() : Results.Ok(report);
        });

        group.MapGet("/section-analysis", async (
            int courseSectionSurveyId,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var report = await reportService.GetSectionSurveyAnalysisAsync(courseSectionSurveyId, cancellationToken);
            return report is null ? Results.NotFound() : Results.Ok(report);
        });

        group.MapGet("/school-overview", async (
            int semesterId,
            int? comparisonSemesterId,
            int? semesterSurveyId,
            int? comparisonSemesterSurveyId,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var report = await reportService.GetSchoolSurveyOverviewAsync(
                semesterId,
                comparisonSemesterId,
                semesterSurveyId,
                comparisonSemesterSurveyId,
                cancellationToken);
            return report is null ? Results.NotFound() : Results.Ok(report);
        });

        group.MapGet("/school-overview/comparison-options", async (
            IReportService reportService,
            CancellationToken cancellationToken) =>
            Results.Ok(await reportService.GetSchoolOverviewComparisonOptionsAsync(cancellationToken)));

        group.MapGet("/question-ranking", async (
            int semesterId,
            int? semesterSurveyId,
            int? count,
            bool? lowest,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var questions = await reportService.GetQuestionRankingAsync(
                semesterId,
                semesterSurveyId,
                count ?? 5,
                lowest ?? true,
                cancellationToken);
            return Results.Ok(questions);
        });

        group.MapGet("/results", async (
            int? semesterId,
            int? facultyId,
            int? departmentId,
            int? lecturerId,
            int? semesterSurveyId,
            string? search,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var results = await reportService.GetSurveyResultsAsync(
                semesterId,
                facultyId,
                departmentId,
                lecturerId,
                semesterSurveyId,
                search,
                cancellationToken);
            return Results.Ok(results);
        });

        group.MapGet("/open-comments", async (
            int? semesterId,
            int? semesterSurveyId,
            int? facultyId,
            int? departmentId,
            int? lecturerId,
            string? search,
            bool? validOnly,
            IReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var analysis = await reportService.GetOpenCommentAnalysisAsync(
                semesterId,
                semesterSurveyId,
                facultyId,
                departmentId,
                lecturerId,
                search,
                validOnly,
                cancellationToken);
            return Results.Ok(analysis);
        });

        // Trạng thái model và hàng đợi phân tích. Chỉ quản trị kỹ thuật xem: thông tin ở đây
        // là chuyện vận hành model, không phải số liệu khảo sát.
        group.MapGet("/open-comments/model-status", async (
            IOpenCommentAnalysisService analysisService,
            CancellationToken cancellationToken) =>
            Results.Ok(await analysisService.GetModelStatusAsync(cancellationToken)))
            .RequireAuthorization(AuthPolicies.OpenCommentModelAdmin);

        group.MapPost("/open-comments/reanalyze", async (
            OpenCommentReanalysisRequest request,
            IOpenCommentAnalysisService analysisService,
            CancellationToken cancellationToken) =>
        {
            var result = await analysisService.ReanalyzeAsync(request, cancellationToken);
            return Results.Ok(result);
        })
            .RequireAuthorization(AuthPolicies.OpenCommentModelAdmin)
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPatch("/open-comments/{responseId:int}/sentiment", async (
            int responseId,
            ReviewOpenCommentSentimentRequest request,
            IOpenCommentAnalysisService analysisService,
            CancellationToken cancellationToken) =>
        {
            var reviewed = await analysisService.ReviewAsync(responseId, request, cancellationToken);
            // 404 cho cả trường hợp phiếu nằm ngoài phạm vi người gọi: không được để lộ rằng
            // phiếu đó có tồn tại hay không.
            return reviewed ? Results.NoContent() : Results.NotFound();
        })
            .RequireAuthorization(AuthPolicies.OpenCommentSentimentReview)
            .AddEndpointFilter<RequireAntiforgeryFilter>();

        return app;
    }
}
