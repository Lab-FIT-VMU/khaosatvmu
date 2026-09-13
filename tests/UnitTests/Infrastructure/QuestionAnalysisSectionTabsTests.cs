namespace UnitTests.InfrastructureTests;

using Application.Surveys;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Tab Học phần / Giảng viên trong phần phân tích theo câu hỏi của trang giảng viên và
/// trang kết quả một lớp: mọi câu phải có mục, không có câu bẫy, và điểm từng mục phải
/// đúng bằng phép gộp thẳng từ ảnh chụp điểm từng câu.
///
/// Chạy trên cơ sở dữ liệu thật, chỉ đọc. Không đặt biến môi trường
/// <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class QuestionAnalysisSectionTabsTests
{
    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunAsync(Func<AppDbContext, EfReportService, Task> body)
    {
        var connectionString = ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
        services.AddMemoryCache();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = connectionString,
            })
            .Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddPersistence(configuration);

        await using var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cache = scope.ServiceProvider.GetRequiredService<IMemoryCache>();

        await body(db, new EfReportService(db, cache, new SchoolOverviewCacheVersion()));
    }

    /// <summary>Điểm từng mục tính thẳng từ ảnh chụp điểm từng câu của một tập lớp.</summary>
    private static async Task<Dictionary<string, (decimal Score, int Answers)>> ExpectedSectionScoresAsync(
        AppDbContext db,
        IReadOnlyCollection<int> sectionSurveyIds)
    {
        var rows = await (
            from score in db.CourseSectionSurveyQuestionScores
            join question in db.SurveyQuestions.IgnoreQueryFilters()
                on score.QuestionId equals question.QuestionId
            join questionSection in db.SurveyQuestionSections.IgnoreQueryFilters()
                on question.SectionId equals questionSection.SectionId
            where sectionSurveyIds.Contains(score.CourseSectionSurveyId)
            select new { questionSection.SectionName, score.AverageScore, score.AnswerCount })
            .ToListAsync();

        return rows
            .GroupBy(x => SurveySectionCatalog.Resolve(x.SectionName) ?? SurveySectionCatalog.Other)
            .ToDictionary(
                g => g.Key,
                g => (
                    Math.Round(g.Sum(x => x.AverageScore * x.AnswerCount) / g.Sum(x => x.AnswerCount), 2),
                    g.Sum(x => x.AnswerCount)));
    }

    private static async Task<HashSet<int>> TrapQuestionIdsAsync(AppDbContext db) =>
        (await db.SurveyQuestions.IgnoreQueryFilters()
            .Where(x => x.AttentionCheckValue != null)
            .Select(x => x.QuestionId)
            .ToListAsync())
        .ToHashSet();

    [Fact]
    public async Task KetQuaMotLop_MoiCauCoMuc_KhongCoCauBay_VaDiemMucKhopAnhChup()
    {
        await RunAsync(async (db, service) =>
        {
            var sectionSurveyId = await db.CourseSectionSurveys
                .Where(x => x.AverageScore != null)
                .OrderBy(x => x.CourseSectionSurveyId)
                .Select(x => (int?)x.CourseSectionSurveyId)
                .FirstOrDefaultAsync();
            if (sectionSurveyId is null) return;

            var analysis = (await service.GetSectionSurveyAnalysisAsync(sectionSurveyId.Value))!;

            analysis.IsScored.Should().BeTrue();
            analysis.Questions.Should().NotBeEmpty();
            analysis.Questions.Should().OnlyContain(x => x.SectionKey != null);
            var traps = await TrapQuestionIdsAsync(db);
            analysis.Questions.Should().NotContain(x => traps.Contains(x.QuestionId));

            var expected = await ExpectedSectionScoresAsync(db, [sectionSurveyId.Value]);
            analysis.SectionScores.Should().NotBeNull();
            analysis.SectionScores!.Select(x => x.SectionKey).Should().BeEquivalentTo(expected.Keys);
            foreach (var (key, value) in expected)
            {
                var actual = analysis.SectionScores!.Single(x => x.SectionKey == key);
                actual.AverageScore.Should().Be(value.Score, $"mục {key}");
                actual.AnswerCount.Should().Be(value.Answers, $"mục {key}");
            }
        });
    }

    [Fact]
    public async Task TrangGiangVien_MoiCauCoMuc_VaDiemMucKhopAnhChupCuaCacLopDaChot()
    {
        await RunAsync(async (db, service) =>
        {
            // Giảng viên có nhiều lớp đã chốt điểm nhất trong một học kỳ.
            var pick = await (
                from sectionSurvey in db.CourseSectionSurveys
                join section in db.CourseSections on sectionSurvey.CourseSectionId equals section.CourseSectionId
                where sectionSurvey.AverageScore != null && section.LecturerId != null
                group sectionSurvey by new { LecturerId = section.LecturerId!.Value, section.SemesterId } into g
                orderby g.Count() descending
                select new { g.Key.LecturerId, g.Key.SemesterId })
                .FirstOrDefaultAsync();
            if (pick is null) return;

            var report = (await service.GetLecturerPerformanceReportAsync(pick.LecturerId, pick.SemesterId))!;

            report.QuestionRatings.Should().NotBeEmpty();
            report.QuestionRatings.Should().OnlyContain(x => x.SectionKey != null);
            var traps = await TrapQuestionIdsAsync(db);
            report.QuestionRatings.Should().NotContain(x => traps.Contains(x.QuestionId));

            var scoredSectionSurveyIds = await (
                from sectionSurvey in db.CourseSectionSurveys
                join section in db.CourseSections on sectionSurvey.CourseSectionId equals section.CourseSectionId
                where sectionSurvey.AverageScore != null
                    && section.LecturerId == pick.LecturerId
                    && section.SemesterId == pick.SemesterId
                select sectionSurvey.CourseSectionSurveyId)
                .ToListAsync();
            var expected = await ExpectedSectionScoresAsync(db, scoredSectionSurveyIds);

            report.SectionScores.Should().NotBeNull();
            foreach (var (key, value) in expected)
            {
                var actual = report.SectionScores!.Single(x => x.SectionKey == key);
                actual.AverageScore.Should().Be(value.Score, $"mục {key}");
                actual.AnswerCount.Should().Be(value.Answers, $"mục {key}");
            }
        });
    }
}
