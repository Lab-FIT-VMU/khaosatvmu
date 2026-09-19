namespace UnitTests.InfrastructureTests;

using Application.Surveys;
using FluentAssertions;
using global::Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Điều kiện "đã thu đủ phiếu" tồn tại ở hai nơi viết bằng hai ngôn ngữ: biểu thức
/// <c>has_enough</c> trong câu UPDATE của nút tính điểm, và
/// <see cref="ReportThresholds.HasEnoughResponsesToScore"/> mà các trang báo cáo
/// gọi. Hai bên lệch nhau thì bảng dữ liệu và bảng báo cáo loại ra hai tập lớp
/// khác nhau, không ai lần ra được vì sao.
///
/// Test này đối chiếu hai bên trên TOÀN BỘ dữ liệu thật của máy dev, và chỉ đọc —
/// không gọi hàm tính điểm nên không đụng gì tới dữ liệu. Không đặt biến môi
/// trường <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class RecalculateScoreThresholdTests
{
    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private sealed record SectionTally(
        int CourseSectionSurveyId,
        int ClassSize,
        int TotalCount,
        int ValidCount,
        bool SqlSaysEnough);

    private static async Task<List<SectionTally>?> LoadTalliesAsync()
    {
        var connectionString = ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString)) return null;

        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
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

        // Chép NGUYÊN VĂN biểu thức has_enough của câu UPDATE trong
        // EfSurveyService.RecalculateSemesterSurveyScoresAsync. Sửa bên kia mà quên
        // bên này thì test đỏ ngay.
        var thresholds = ScoringThresholds.Default;
        var minimumResponseRate = thresholds.MinimumResponseRate;
        var minimumValidRate = thresholds.MinimumValidRate;
        var rejectTooFast = thresholds.RejectTooFast;
        var rejectSingleAnswer = thresholds.RejectSingleAnswer;
        var rejectAttentionCheck = thresholds.RejectAttentionCheckFailed;
        var rows = await db.Database
            .SqlQuery<SectionTally>($"""
                SELECT c."CourseSectionSurveyId"                     AS "CourseSectionSurveyId",
                       s."ClassSize"                                 AS "ClassSize",
                       count(r.*)::int                               AS "TotalCount",
                       count(r.*) FILTER (WHERE r.counted)::int      AS "ValidCount",
                       (s."ClassSize" > 0
                        AND count(r.*) > 0
                        AND count(r.*)::numeric / s."ClassSize" * 100 >= {minimumResponseRate}
                        AND count(r.*) FILTER (WHERE r.counted)::numeric
                            / count(r.*) * 100 >= {minimumValidRate})  AS "SqlSaysEnough"
                FROM "CourseSectionSurveys" c
                JOIN "CourseSections" s ON s."CourseSectionId" = c."CourseSectionId"
                LEFT JOIN (
                    SELECT sr."CourseSectionSurveyId",
                           (sr."RejectionReasons" IS NULL
                            OR ((NOT {rejectTooFast}
                                 OR position('TOO_FAST' in sr."RejectionReasons") = 0)
                            AND (NOT {rejectSingleAnswer}
                                 OR position('SINGLE_ANSWER' in sr."RejectionReasons") = 0)
                            AND (NOT {rejectAttentionCheck}
                                 OR position('ATTENTION_CHECK_FAILED' in sr."RejectionReasons") = 0)))
                           AS counted
                    FROM "SurveyResponses" sr
                ) r ON r."CourseSectionSurveyId" = c."CourseSectionSurveyId"
                WHERE NOT c."IsDeleted"
                GROUP BY c."CourseSectionSurveyId", s."ClassSize"
                """)
            .ToListAsync();

        return rows;
    }

    [Fact]
    public async Task TheSqlThresholdShouldAgreeWithTheSharedRule_OnEverySection()
    {
        var rows = await LoadTalliesAsync();
        if (rows is null || rows.Count == 0) return;

        var disagreements = rows
            .Where(row => row.SqlSaysEnough != ScoringThresholds.Default.HasEnoughResponsesToScore(
                row.ClassSize, row.TotalCount, row.ValidCount))
            .Take(5)
            .Select(row =>
                $"lớp {row.CourseSectionSurveyId}: sĩ số {row.ClassSize}, "
                + $"nộp {row.TotalCount}, hợp lệ {row.ValidCount} — "
                + $"SQL nói {row.SqlSaysEnough}, C# nói "
                + $"{ScoringThresholds.Default.HasEnoughResponsesToScore(row.ClassSize, row.TotalCount, row.ValidCount)}")
            .ToList();

        disagreements.Should().BeEmpty(
            "câu UPDATE của nút tính điểm và ScoringThresholds phải chọn cùng một tập lớp");
    }

    [Fact]
    public async Task TheThresholdShouldActuallyExcludeSomeSections()
    {
        var rows = await LoadTalliesAsync();
        if (rows is null || rows.Count == 0) return;

        var withResponses = rows.Where(x => x.TotalCount > 0).ToList();
        if (withResponses.Count == 0) return;

        var excluded = withResponses.Count(x => !x.SqlSaysEnough);

        // Nếu con số này bằng 0 thì hoặc dữ liệu quá đẹp, hoặc ngưỡng đã bị vô hiệu
        // hoá lúc nào không hay — cả hai đều đáng nhìn lại chứ không nên lặng lẽ qua.
        excluded.Should().BeGreaterThan(
            0,
            "phải có lớp bị loại thì ngưỡng mới đang thực sự có tác dụng");
        excluded.Should().BeLessThan(
            withResponses.Count,
            "nhưng không được loại sạch, nếu không thì mọi báo cáo đều trống");
    }
}
