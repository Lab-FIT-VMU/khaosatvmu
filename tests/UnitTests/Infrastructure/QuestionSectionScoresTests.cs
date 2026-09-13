namespace UnitTests.InfrastructureTests;

using Application;
using Application.Auth;
using Application.Surveys;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using global::Infrastructure.Surveys;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using Row = Application.Surveys.QuestionSectionScoreRowDto;

/// <summary>
/// Trang Thống kê theo mục: điểm mục phải gộp đúng từ ảnh chụp điểm từng câu, các
/// cấp khoa → bộ môn → học phần → lớp phải cộng lại khớp nhau, và các con số chung
/// phải khớp đúng những trang đang có.
///
/// Chạy trên cơ sở dữ liệu thật, chỉ đọc. Không đặt biến môi trường
/// <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class QuestionSectionScoresTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(scope);
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunAsync(
        Func<AppDbContext, Func<UserScope, EfSurveyService>, Task> body)
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

        await body(db, userScope => new EfSurveyService(
            db,
            cache,
            new FixedScopeResolver(userScope),
            new FixedScoringThresholdProvider(),
            new SchoolOverviewCacheVersion()));
    }

    private static UserScope Admin => UserScope.Unrestricted(RoleCodes.Admin);

    private static UserScope ManagerOf(int departmentId) =>
        new(RoleCodes.DepartmentManager, 1, departmentId, null, SeesEverything: false);

    /// <summary>Đợt có nhiều lớp đã chốt điểm nhất; null khi chưa đợt nào được tính.</summary>
    private static Task<int?> ScoredSurveyAsync(AppDbContext db) =>
        db.CourseSectionSurveys
            .Where(x => x.AverageScore != null)
            .GroupBy(x => x.SemesterSurveyId)
            .OrderByDescending(g => g.Count())
            .Select(g => (int?)g.Key)
            .FirstOrDefaultAsync();

    private static bool SameFaculty(Row parent, Row child) =>
        parent.FacultyId == child.FacultyId && parent.FacultyName == child.FacultyName;

    private static bool SameDepartment(Row parent, Row child) =>
        SameFaculty(parent, child)
        && parent.DepartmentId == child.DepartmentId
        && parent.DepartmentName == child.DepartmentName;

    private static bool SameCourse(Row parent, Row child) =>
        SameDepartment(parent, child) && parent.CourseId == child.CourseId;

    /// <summary>
    /// Mỗi dòng con có đúng một dòng cha, và các dòng con của một cha cộng lại ra đúng
    /// số lớp, số phiếu và số lượt trả lời từng mục của cha đó.
    /// </summary>
    private static void ChildrenShouldSumToParent(
        IReadOnlyList<Row> parents,
        IReadOnlyList<Row> children,
        Func<Row, Row, bool> isChildOf)
    {
        foreach (var child in children)
        {
            parents.Count(parent => isChildOf(parent, child)).Should().Be(1);
        }

        foreach (var parent in parents)
        {
            var own = children.Where(child => isChildOf(parent, child)).ToList();

            own.Should().NotBeEmpty();
            own.Sum(x => x.SectionCount).Should().Be(parent.SectionCount);
            own.Sum(x => x.ValidResponseCount).Should().Be(parent.ValidResponseCount);
            foreach (var score in parent.Scores)
            {
                own.Sum(child => child.Scores.Single(x => x.SectionKey == score.SectionKey).AnswerCount)
                    .Should().Be(score.AnswerCount, $"mục {score.SectionKey}");
            }
        }
    }

    [Fact]
    public async Task KhongPhaiQuanTri_BiChan()
    {
        await RunAsync(async (_, serviceFor) =>
        {
            var result = await serviceFor(ManagerOf(1)).GetSemesterSurveyQuestionSectionScoresAsync(1);

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope);
        });
    }

    [Fact]
    public async Task Columns_LuonDuBaMucCuaDanhMuc_TheoThuTuTrenPhieu()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await ScoredSurveyAsync(db);
            if (semesterSurveyId is null) return;

            var data = (await serviceFor(Admin).GetSemesterSurveyQuestionSectionScoresAsync(semesterSurveyId.Value)).Value!;

            data.Columns.Take(3).Select(x => x.SectionKey).Should().Equal(
                SurveySectionCatalog.CourseContent,
                SurveySectionCatalog.Lecturer,
                SurveySectionCatalog.Facilities);
        });
    }

    [Fact]
    public async Task DiemMucToanTruong_KhopPhepGopTrucTiepTuAnhChupDiemTungCau()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await ScoredSurveyAsync(db);
            if (semesterSurveyId is null) return;

            var result = await serviceFor(Admin).GetSemesterSurveyQuestionSectionScoresAsync(semesterSurveyId.Value);
            result.Succeeded.Should().BeTrue();
            var data = result.Value!;

            // Tính lại độc lập: gộp thẳng bảng điểm từng câu của các lớp đã chốt.
            var snapshot = await (
                from score in db.CourseSectionSurveyQuestionScores
                join sectionSurvey in db.CourseSectionSurveys
                    on score.CourseSectionSurveyId equals sectionSurvey.CourseSectionSurveyId
                join question in db.SurveyQuestions.IgnoreQueryFilters()
                    on score.QuestionId equals question.QuestionId
                join questionSection in db.SurveyQuestionSections.IgnoreQueryFilters()
                    on question.SectionId equals questionSection.SectionId
                where sectionSurvey.SemesterSurveyId == semesterSurveyId.Value
                    && sectionSurvey.AverageScore != null
                select new { questionSection.SectionName, score.AverageScore, score.AnswerCount })
                .ToListAsync();

            snapshot.Should().NotBeEmpty();

            foreach (var group in snapshot.GroupBy(x =>
                         SurveySectionCatalog.Resolve(x.SectionName) ?? SurveySectionCatalog.Other))
            {
                var answerCount = group.Sum(x => x.AnswerCount);
                var expected = Math.Round(group.Sum(x => x.AverageScore * x.AnswerCount) / answerCount, 2);

                var actual = data.School.Scores.Single(x => x.SectionKey == group.Key);
                actual.AnswerCount.Should().Be(answerCount, $"mục {group.Key}");
                actual.AverageScore.Should().Be(expected, $"mục {group.Key}");
            }
        });
    }

    [Fact]
    public async Task DiemTongVaSoLop_KhopTrangTongQuanKhaoSat()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await ScoredSurveyAsync(db);
            if (semesterSurveyId is null) return;

            var service = serviceFor(Admin);
            var data = (await service.GetSemesterSurveyQuestionSectionScoresAsync(semesterSurveyId.Value)).Value!;
            var dashboard = (await service.GetSemesterSurveyDashboardAsync(semesterSurveyId.Value)).Value!;

            data.School.OverallAverageScore.Should().Be(dashboard.OverallScore);
            data.School.SectionCount.Should().Be(dashboard.ScoredSectionCount);
        });
    }

    [Fact]
    public async Task MoiCap_CongLaiRaDungDongCha()
    {
        await RunAsync(async (db, serviceFor) =>
        {
            var semesterSurveyId = await ScoredSurveyAsync(db);
            if (semesterSurveyId is null) return;

            var data = (await serviceFor(Admin).GetSemesterSurveyQuestionSectionScoresAsync(semesterSurveyId.Value)).Value!;

            ChildrenShouldSumToParent([data.School], data.Faculties, (_, _) => true);
            ChildrenShouldSumToParent(data.Faculties, data.Departments, SameFaculty);
            ChildrenShouldSumToParent(data.Departments, data.Courses, SameDepartment);
            ChildrenShouldSumToParent(data.Courses, data.CourseSections, SameCourse);

            data.CourseSections.Should().OnlyContain(x => x.CourseSectionSurveyId != null && x.SectionCount == 1);
            data.CourseSections.Select(x => x.CourseSectionSurveyId).Should().OnlyHaveUniqueItems();
        });
    }
}
