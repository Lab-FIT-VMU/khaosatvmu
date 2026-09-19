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
/// Điểm trung bình toàn trường ở Tổng quan / Thống kê &amp; Báo cáo phải cùng một
/// công thức với bảng xếp hạng khoa/bộ môn NẰM TRONG CHÍNH TRANG ĐÓ: tổng điểm
/// chia tổng phiếu hợp lệ, và chỉ cộng lớp ĐÃ ĐƯỢC CHỐT ĐIỂM ở lần bấm "Tính lại
/// điểm" gần nhất — tức lớp có AverageScore khác null.
///
/// Mọi trang báo cáo đọc chung ảnh chụp đó, chỉ trang Tiến độ thu phiếu là đếm
/// sống. Nếu ở đây lỡ đếm sống lại từ bảng phiếu thì báo cáo sẽ nhỉnh hơn bảng dữ
/// liệu khảo sát mỗi khi có phiếu về sau lần chốt.
///
/// Chỉ đọc, không ghi gì. Không đặt <c>ConnectionStrings__DefaultConnection</c>
/// thì tự bỏ qua.
/// </summary>
public class SchoolOverviewScoreThresholdTests
{
    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static Task<(AppDbContext Db, EfReportService Service)?> SetupAsync()
    {
        var connectionString = ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString)) return Task.FromResult<(AppDbContext, EfReportService)?>(null);

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

        var provider = services.BuildServiceProvider();
        var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cache = scope.ServiceProvider.GetRequiredService<IMemoryCache>();
        return Task.FromResult<(AppDbContext, EfReportService)?>(
            (db, new EfReportService(
                db,
                cache,
                new SchoolOverviewCacheVersion(),
                new FixedScoringThresholdProvider(),
                new PublishedSurveyPublicationService())));
    }

    /// <summary>
    /// Tính lại điểm trung bình toàn trường TRỰC TIẾP từ dữ liệu, theo đúng quy tắc
    /// đã chốt: tổng điểm / tổng phiếu hợp lệ, chỉ của lớp đạt ngưỡng. Đây là "đáp án"
    /// độc lập để đối chiếu với con số EfReportService trả về — không gọi lại code
    /// đang kiểm thử.
    /// </summary>
    private static async Task<(decimal? Average, int ScoredSectionCount, int UnscoredSectionWithResponsesCount)>
        ComputeExpectedSchoolAverageAsync(AppDbContext db, int semesterId)
    {
        // Đọc thẳng ẢNH CHỤP của lần chốt gần nhất, không gộp lại từ "SurveyResponses":
        // dịch vụ báo cáo cũng đọc đúng nguồn này. Lớp được chốt điểm là lớp có
        // AverageScore khác null — không so lại ngưỡng, vì ngưỡng có thể đã đổi sau
        // lần chốt.
        var rows = await (
            from css in db.CourseSectionSurveys.AsNoTracking()
            join ssv in db.SemesterSurveys.AsNoTracking()
                on css.SemesterSurveyId equals ssv.SemesterSurveyId
            where ssv.SemesterId == semesterId
            select new
            {
                css.CourseSectionSurveyId,
                css.ValidResponseCount,
                css.AverageScore,
            }
        ).ToListAsync();

        int scoredCount = 0;
        int unscoredWithResponses = 0;
        int scoredResponses = 0;
        decimal scoredScoreSum = 0;
        foreach (var row in rows)
        {
            if (row.ValidResponseCount == 0) continue;

            var scored = row.AverageScore is not null;
            if (scored)
            {
                scoredCount++;
                scoredResponses += row.ValidResponseCount;
                scoredScoreSum += row.AverageScore!.Value * row.ValidResponseCount;
            }
            else
            {
                unscoredWithResponses++;
            }
        }

        decimal? average = scoredResponses == 0 ? null : Math.Round(scoredScoreSum / scoredResponses, 2);
        return (average, scoredCount, unscoredWithResponses);
    }

    [Fact]
    public async Task OverallAverageScore_ShouldMatchTheIndependentlyComputedThresholdFilteredAverage()
    {
        var setup = await SetupAsync();
        if (setup is null) return;
        var (db, service) = setup.Value;

        var semesterId = await db.SemesterSurveys.AsNoTracking()
            .GroupBy(x => x.SemesterId)
            .OrderByDescending(group => group.Count())
            .Select(group => group.Key)
            .FirstOrDefaultAsync();
        if (semesterId == 0) return;

        var expected = await ComputeExpectedSchoolAverageAsync(db, semesterId);
        if (expected.Average is null) return;

        var overview = await service.GetSchoolSurveyOverviewAsync(semesterId);

        overview.Should().NotBeNull();
        overview!.OverallAverageScore.Should().Be(
            expected.Average.Value,
            "điểm toàn trường chỉ được gộp lớp đã thu đủ phiếu, đúng bằng công thức đối chiếu");
        overview.SchoolAverageScore.Should().Be(
            overview.OverallAverageScore,
            "hai trường này phải luôn khớp nhau — cùng một con số, dùng ở hai chỗ hiển thị khác nhau");
    }

    [Fact]
    public async Task OverallAverageScore_ShouldActuallyExcludeSomeUnscoredSections()
    {
        var setup = await SetupAsync();
        if (setup is null) return;
        var (db, _) = setup.Value;

        var semesterId = await db.SemesterSurveys.AsNoTracking()
            .GroupBy(x => x.SemesterId)
            .OrderByDescending(group => group.Count())
            .Select(group => group.Key)
            .FirstOrDefaultAsync();
        if (semesterId == 0) return;

        var expected = await ComputeExpectedSchoolAverageAsync(db, semesterId);

        // Nếu con số này bằng 0 thì hoặc dữ liệu quá đẹp, hoặc phép lọc đã bị vô hiệu
        // hoá lúc nào không hay — phải nhìn lại chứ không nên lặng lẽ cho qua.
        expected.UnscoredSectionWithResponsesCount.Should().BeGreaterThan(
            0,
            "phải có ít nhất một lớp có phiếu nhưng chưa đạt ngưỡng thì phép lọc mới thực sự có tác dụng");
    }
}
