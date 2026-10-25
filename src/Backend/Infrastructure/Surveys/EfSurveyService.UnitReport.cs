using Application.Surveys;
using Domain;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Surveys;

/// <summary>
/// Thống kê đợt CTĐT và khảo sát giảng viên. Khác khảo sát học phần ở chỗ tính SỐNG từ
/// phiếu mỗi lần gọi thay vì đọc ảnh chụp của bước Cập nhật điểm: một đợt chỉ có vài
/// chục đơn vị, và hai loại này không có màn phân tích chuẩn hoá nào cần một mốc chốt
/// chung. Luật lọc phiếu và luật ngưỡng thì dùng đúng của khảo sát học phần.
/// </summary>
public sealed partial class EfSurveyService
{
    public async Task<SurveyOperationResult<UnitSurveyReportDto>> GetUnitSurveyReportAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        // Đi qua danh sách đơn vị để dùng chung phần kiểm quyền, kiểm loại đợt và tên đơn vị.
        var unitsResult = await GetSurveyUnitsAsync(semesterSurveyId, cancellationToken);
        if (!unitsResult.Succeeded || unitsResult.Value is not { } units)
        {
            return Failed<UnitSurveyReportDto>(unitsResult.ErrorCode ?? SurveyErrorCodes.SemesterSurveyNotFound);
        }

        var survey = await db.SemesterSurveys.AsNoTracking()
            .FirstAsync(x => x.SemesterSurveyId == semesterSurveyId, cancellationToken);
        var templateName = await db.SurveyTemplates.AsNoTracking().IgnoreQueryFilters()
            .Where(x => x.SurveyTemplateId == survey.SurveyTemplateId)
            .Select(x => x.TemplateName)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;
        var semester = await db.Semesters.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SemesterId == survey.SemesterId, cancellationToken);
        var academicYearName = semester is null
            ? string.Empty
            : await db.AcademicYears.AsNoTracking()
                .Where(x => x.AcademicYearId == semester.AcademicYearId)
                .Select(x => x.AcademicYearName)
                .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;
        var thresholds = await scoringThresholds.GetAsync(cancellationToken);

        var unitIds = units.Select(x => x.CourseSectionSurveyId).ToList();
        var responses = await db.SurveyResponses.AsNoTracking()
            .Where(x => unitIds.Contains(x.CourseSectionSurveyId))
            .Select(x => new
            {
                x.ResponseId,
                x.CourseSectionSurveyId,
                x.Score,
                x.RejectionReasons,
                x.AdditionalComments,
                x.SubmittedAt,
            })
            .ToListAsync(cancellationToken);
        var countedIds = responses
            .Where(x => thresholds.CountsTowardScore(x.RejectionReasons))
            .Select(x => x.ResponseId)
            .ToHashSet();
        var unitOfResponse = responses.ToDictionary(x => x.ResponseId, x => x.CourseSectionSurveyId);

        // Câu có điểm: thang mức chọn và không phải câu bẫy — cùng luật với Score của phiếu.
        var questions = await (
                from question in db.SurveyQuestions.AsNoTracking()
                join section in db.SurveyQuestionSections.AsNoTracking()
                    on question.SectionId equals section.SectionId
                where section.SurveyTemplateId == survey.SurveyTemplateId
                orderby question.QuestionId
                select new
                {
                    question.QuestionId,
                    question.QuestionText,
                    question.AnswerScaleId,
                    question.AttentionCheckValue,
                    section.SectionId,
                    section.SectionName,
                })
            .ToListAsync(cancellationToken);
        var scales = (await ScalesOfTemplateAsync(survey.SurveyTemplateId, cancellationToken))
            .ToDictionary(x => x.AnswerScaleId);
        var scoredQuestionIds = questions
            .Where(x => x.AttentionCheckValue == null
                && scales.TryGetValue(x.AnswerScaleId, out var scale)
                && scale.ScaleKind == AnswerScaleKinds.Options)
            .Select(x => x.QuestionId)
            .ToList();

        var countedIdList = countedIds.ToList();
        var answers = countedIdList.Count == 0 || scoredQuestionIds.Count == 0
            ? []
            : (await db.SurveyResponseAnswers.AsNoTracking()
                    .Where(x => countedIdList.Contains(x.ResponseId) && scoredQuestionIds.Contains(x.QuestionId))
                    .Select(x => new { x.ResponseId, x.QuestionId, x.AnswerValue })
                    .ToListAsync(cancellationToken))
                .Select(x => new
                {
                    UnitId = unitOfResponse[x.ResponseId],
                    x.QuestionId,
                    Value = int.TryParse(x.AnswerValue, out var value) ? value : (int?)null,
                })
                .Where(x => x.Value is not null)
                .Select(x => (x.UnitId, x.QuestionId, Value: x.Value!.Value))
                .ToList();
        var answersByUnit = answers.ToLookup(x => x.UnitId);
        var responsesByUnit = responses.ToLookup(x => x.CourseSectionSurveyId);

        var rows = units
            .Select(unit =>
            {
                var unitResponses = responsesByUnit[unit.CourseSectionSurveyId].ToList();
                var counted = unitResponses.Where(x => countedIds.Contains(x.ResponseId)).ToList();
                var questionScores = answersByUnit[unit.CourseSectionSurveyId]
                    .GroupBy(x => x.QuestionId)
                    .Select(group => new UnitQuestionScoreDto(
                        group.Key,
                        Math.Round((decimal)group.Average(x => x.Value), 3),
                        group.Count()))
                    .ToList();

                return new UnitReportRowDto(
                    unit.CourseSectionSurveyId,
                    unit.UnitId,
                    unit.UnitCode,
                    unit.UnitName,
                    unit.CohortName,
                    survey.SurveyType == SurveyTypes.Program ? unit.UnitName : string.Empty,
                    unit.FacultyId,
                    unit.FacultyName,
                    unit.TargetCount,
                    unitResponses.Count,
                    counted.Count,
                    RateOf(unitResponses.Count, unit.TargetCount),
                    thresholds.HasEnoughResponsesToScore(unit.TargetCount, unitResponses.Count, counted.Count),
                    counted.Count == 0 ? null : Math.Round(counted.Average(x => x.Score), 3),
                    questionScores,
                    unitResponses.Count(x => !string.IsNullOrWhiteSpace(x.AdditionalComments)));
            })
            .ToList();

        // Điểm câu toàn đợt chỉ lấy đơn vị được tính điểm, giống điểm tổng.
        var scoredUnitIds = rows.Where(x => x.IsScored).Select(x => x.CourseSectionSurveyId).ToHashSet();
        var scoredAnswersByQuestion = answers
            .Where(x => scoredUnitIds.Contains(x.UnitId))
            .ToLookup(x => x.QuestionId);
        var questionDtos = questions
            .Select((question, index) =>
            {
                var isScored = scoredQuestionIds.Contains(question.QuestionId);
                var values = scoredAnswersByQuestion[question.QuestionId].Select(x => x.Value).ToList();
                var options = scales.TryGetValue(question.AnswerScaleId, out var scale)
                    ? scale.Options
                    : [];
                return new UnitReportQuestionDto(
                    question.QuestionId,
                    index + 1,
                    question.QuestionText,
                    question.SectionId,
                    question.SectionName,
                    isScored,
                    values.Count == 0 ? null : Math.Round((decimal)values.Average(), 3),
                    values.Count,
                    isScored
                        ? options
                            .OrderBy(x => x.Value)
                            .Select(option => new UnitReportValueCountDto(
                                option.Value,
                                option.DisplayText,
                                values.Count(value => value == option.Value)))
                            .ToList()
                        : []);
            })
            .ToList();

        var summary = new UnitReportSummaryDto(
            rows.Count,
            rows.Count(x => x.ResponseCount > 0),
            rows.Count(x => x.IsScored),
            survey.SurveyType == SurveyTypes.Program ? null : rows.Sum(x => x.TargetCount ?? 0),
            rows.Sum(x => x.ResponseCount),
            rows.Sum(x => x.ValidResponseCount),
            survey.SurveyType == SurveyTypes.Program
                ? null
                : RateOf(rows.Sum(x => x.ResponseCount), rows.Sum(x => x.TargetCount ?? 0)),
            MeanOfScored(rows));

        var comments = responses
            .Where(x => !string.IsNullOrWhiteSpace(x.AdditionalComments))
            .OrderByDescending(x => x.SubmittedAt)
            .Select(x =>
            {
                var unit = units.First(u => u.CourseSectionSurveyId == x.CourseSectionSurveyId);
                return new UnitReportCommentDto(
                    x.ResponseId,
                    unit.UnitCode,
                    unit.UnitName,
                    unit.FacultyName,
                    x.AdditionalComments!.Trim(),
                    countedIds.Contains(x.ResponseId),
                    x.SubmittedAt);
            })
            .ToList();

        var isProgram = survey.SurveyType == SurveyTypes.Program;
        return Succeeded(new UnitSurveyReportDto(
            survey.SemesterSurveyId,
            survey.SurveyName,
            survey.SurveyType,
            templateName,
            semester?.SemesterName ?? string.Empty,
            academicYearName,
            survey.StartTime,
            survey.EndTime,
            thresholds.MinimumResponseRate,
            thresholds.MinimumValidRate,
            summary,
            questionDtos,
            rows.OrderBy(x => x.FacultyName).ThenBy(x => x.UnitCode).ToList(),
            GroupRows(rows, x => x.FacultyId?.ToString() ?? string.Empty,
                x => x.FacultyName.Length == 0 ? "Chưa gắn khoa" : x.FacultyName, isProgram),
            isProgram ? GroupRows(rows, x => x.MajorName, x => x.MajorName, isProgram) : [],
            isProgram ? GroupRows(rows, x => x.CohortName, x => x.CohortName, isProgram) : [],
            comments));
    }

    /// <summary>Phần trăm phiếu đã thu trên sĩ số, một chữ số thập phân; null khi không có sĩ số.</summary>
    private static decimal? RateOf(int responseCount, int? targetCount) =>
        targetCount is > 0 ? Math.Round((decimal)responseCount / targetCount.Value * 100, 1) : null;

    /// <summary>Trung bình cộng điểm các đơn vị được tính điểm, mỗi đơn vị nặng như nhau.</summary>
    private static decimal? MeanOfScored(IEnumerable<UnitReportRowDto> rows)
    {
        var scores = rows
            .Where(x => x.IsScored && x.AverageScore is not null)
            .Select(x => x.AverageScore!.Value)
            .ToList();
        return scores.Count == 0 ? null : Math.Round(scores.Average(), 3);
    }

    private static List<UnitReportGroupDto> GroupRows(
        IEnumerable<UnitReportRowDto> rows,
        Func<UnitReportRowDto, string> keyOf,
        Func<UnitReportRowDto, string> nameOf,
        bool withoutTarget) =>
        rows
            .GroupBy(keyOf)
            .Select(group =>
            {
                var target = withoutTarget ? (int?)null : group.Sum(x => x.TargetCount ?? 0);
                var responseCount = group.Sum(x => x.ResponseCount);
                return new UnitReportGroupDto(
                    group.Key,
                    nameOf(group.First()),
                    group.Count(),
                    group.Count(x => x.IsScored),
                    target,
                    responseCount,
                    group.Sum(x => x.ValidResponseCount),
                    RateOf(responseCount, target),
                    MeanOfScored(group));
            })
            .OrderBy(x => x.Name)
            .ToList();
}
