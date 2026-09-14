using Application.Surveys;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Surveys;

/// <summary>
/// Đọc khoá mục và điểm từng mục của một tập câu hỏi.
///
/// Hai trang phân tích cùng cần hai phép đọc này: bài khảo sát của một lớp và trang
/// chi tiết theo phạm vi (khoa/viện, bộ môn, học phần). Để chung một chỗ thì hai
/// trang không thể lệch công thức, và cùng một tập lớp luôn ra cùng một con số.
/// </summary>
internal static class QuestionSectionScores
{
    /// <summary>
    /// Khoá mục (<see cref="SurveySectionCatalog"/>) của từng câu, để giao diện tách
    /// phần phân tích theo mục. Bỏ bộ lọc xoá mềm: câu đã nằm trong ảnh chụp điểm thì
    /// vẫn phải biết nó thuộc mục nào.
    /// </summary>
    public static async Task<Dictionary<int, string>> KeysAsync(
        AppDbContext db,
        IReadOnlyCollection<int> questionIds,
        CancellationToken cancellationToken)
    {
        if (questionIds.Count == 0) return [];

        var rows = await (
            from question in db.SurveyQuestions.IgnoreQueryFilters().AsNoTracking()
            join questionSection in db.SurveyQuestionSections.IgnoreQueryFilters().AsNoTracking()
                on question.SectionId equals questionSection.SectionId
            where questionIds.Contains(question.QuestionId)
            select new { question.QuestionId, questionSection.SectionName })
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(
            x => x.QuestionId,
            x => SurveySectionCatalog.Resolve(x.SectionName) ?? SurveySectionCatalog.Other);
    }

    /// <summary>
    /// Điểm từng mục của một tập lớp ĐÃ CHỐT, gộp có trọng số từ ảnh chụp điểm từng câu —
    /// đúng công thức của trang Thống kê theo mục, nên cùng một tập lớp ra cùng một con số.
    /// </summary>
    public static async Task<IReadOnlyList<QuestionSectionScoreDto>> ScoresAsync(
        AppDbContext db,
        IReadOnlyCollection<int> scoredSectionSurveyIds,
        CancellationToken cancellationToken)
    {
        if (scoredSectionSurveyIds.Count == 0) return [];

        var rows = await (
            from score in db.CourseSectionSurveyQuestionScores.AsNoTracking()
            join question in db.SurveyQuestions.IgnoreQueryFilters().AsNoTracking()
                on score.QuestionId equals question.QuestionId
            join questionSection in db.SurveyQuestionSections.IgnoreQueryFilters().AsNoTracking()
                on question.SectionId equals questionSection.SectionId
            where scoredSectionSurveyIds.Contains(score.CourseSectionSurveyId)
            group score by questionSection.SectionName into g
            select new
            {
                SectionName = g.Key,
                WeightedScore = g.Sum(x => x.AverageScore * x.AnswerCount),
                AnswerCount = g.Sum(x => x.AnswerCount),
            })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(x => SurveySectionCatalog.Resolve(x.SectionName) ?? SurveySectionCatalog.Other)
            .Select(g =>
            {
                var answerCount = g.Sum(x => x.AnswerCount);
                return new QuestionSectionScoreDto(
                    g.Key,
                    answerCount > 0 ? (decimal?)Math.Round(g.Sum(x => x.WeightedScore) / answerCount, 2) : null,
                    answerCount);
            })
            .ToList();
    }
}
