namespace UnitTests.InfrastructureTests;

using Application;
using Application.Auth;
using Application.Surveys;
using Domain;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using global::Infrastructure.Surveys;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Huỷ toàn bộ phiếu của một lớp để lớp làm lại. Đây là thao tác bỏ dữ liệu đã
/// thu nên khoá kỹ ba thứ: phiếu chỉ XOÁ MỀM chứ không mất, mọi số dẫn xuất bị
/// dọn sạch, và người không đủ quyền thì không đụng được.
///
/// Bọc transaction rồi rollback. Không đặt biến môi trường
/// <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class ClearSectionResponsesTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(scope);
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static UserScope Admin => UserScope.Unrestricted(RoleCodes.Admin);

    private static UserScope Lecturer =>
        new(RoleCodes.Lecturer, 1, null, null, SeesEverything: false);

    private static async Task RunInRollbackAsync(
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

        await using var transaction = await db.Database.BeginTransactionAsync();
        try
        {
            await body(
                db,
                userScope => new EfSurveyService(
                    db,
                    cache,
                    new FixedScopeResolver(userScope),
                    new FixedScoringThresholdProvider(),
                    new PublishedSurveyPublicationService(),
                    new SchoolOverviewCacheVersion()));
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }

    /// <summary>Một lớp đang có phiếu thật, kèm điểm đã chốt để còn kiểm việc dọn.</summary>
    private static async Task<int?> FindSectionWithResponsesAsync(AppDbContext db)
    {
        var candidate = await db.SurveyResponses.AsNoTracking()
            .GroupBy(x => x.CourseSectionSurveyId)
            .Where(group => group.Count() >= 2)
            .Select(group => group.Key)
            .FirstOrDefaultAsync();
        return candidate == 0 ? null : candidate;
    }

    [Fact]
    public async Task Clear_ShouldSoftDeleteResponses_NotRemoveThem()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var id = await FindSectionWithResponsesAsync(db);
            if (id is null) return;

            var before = await db.SurveyResponses.AsNoTracking()
                .CountAsync(x => x.CourseSectionSurveyId == id.Value);

            var result = await serviceFor(Admin).ClearSectionSurveyResponsesAsync(id.Value);

            result.Succeeded.Should().BeTrue();
            result.Value!.ClearedResponseCount.Should().Be(before);

            // Bộ lọc toàn cục làm mọi truy vấn thường không còn thấy phiếu nữa...
            var visible = await db.SurveyResponses.AsNoTracking()
                .CountAsync(x => x.CourseSectionSurveyId == id.Value);
            visible.Should().Be(0, "mọi phép tính phải coi như lớp chưa ai làm");

            // ...nhưng dòng vẫn nằm nguyên trong bảng, đó mới là chỗ lưu vết.
            var stillStored = await db.SurveyResponses.IgnoreQueryFilters().AsNoTracking()
                .CountAsync(x => x.CourseSectionSurveyId == id.Value && x.IsDeleted);
            stillStored.Should().Be(before, "xoá mềm chứ không được mất dữ liệu");

            var withoutTimestamp = await db.SurveyResponses.IgnoreQueryFilters().AsNoTracking()
                .CountAsync(x => x.CourseSectionSurveyId == id.Value && x.DeletedAt == null);
            withoutTimestamp.Should().Be(0, "mỗi phiếu huỷ phải có mốc thời gian");
        });
    }

    [Fact]
    public async Task Clear_ShouldWipeEveryDerivedNumber()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var id = await FindSectionWithResponsesAsync(db);
            if (id is null) return;

            await serviceFor(Admin).ClearSectionSurveyResponsesAsync(id.Value);

            var survey = await db.CourseSectionSurveys.AsNoTracking()
                .FirstAsync(x => x.CourseSectionSurveyId == id.Value);

            survey.AverageScore.Should().BeNull("điểm tổng hợp của lớp phải trống");
            survey.TotalResponseCount.Should().Be(0);
            survey.ValidResponseCount.Should().Be(0);
            survey.InvalidResponseCount.Should().Be(0);
            survey.ScoreCalculatedAt.Should().BeNull("mốc chốt điểm cũng không còn nghĩa");

            // Điểm từng câu là các cột C1, C2… của bảng dữ liệu — chỗ dễ quên nhất.
            var questionScores = await db.CourseSectionSurveyQuestionScores.AsNoTracking()
                .CountAsync(x => x.CourseSectionSurveyId == id.Value);
            questionScores.Should().Be(0, "không được để lại điểm từng câu mồ côi");
        });
    }

    [Fact]
    public async Task Clear_ShouldHideAnswersOfDeletedResponsesFromNormalQueries()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var id = await FindSectionWithResponsesAsync(db);
            if (id is null) return;

            var responseIds = await db.SurveyResponses.AsNoTracking()
                .Where(x => x.CourseSectionSurveyId == id.Value)
                .Select(x => x.ResponseId)
                .ToListAsync();

            var answersBefore = await db.SurveyResponseAnswers.AsNoTracking()
                .CountAsync(x => responseIds.Contains(x.ResponseId));
            if (answersBefore == 0) return;

            await serviceFor(Admin).ClearSectionSurveyResponsesAsync(id.Value);

            // Câu trả lời không có cột IsDeleted riêng mà bám theo phiếu cha.
            var answersVisible = await db.SurveyResponseAnswers.AsNoTracking()
                .CountAsync(x => responseIds.Contains(x.ResponseId));
            answersVisible.Should().Be(0, "câu trả lời phải biến mất theo phiếu cha");

            var answersStored = await db.SurveyResponseAnswers.IgnoreQueryFilters().AsNoTracking()
                .CountAsync(x => responseIds.Contains(x.ResponseId));
            answersStored.Should().Be(answersBefore, "nhưng vẫn còn nguyên trong bảng");
        });
    }

    [Fact]
    public async Task Clear_Twice_ShouldBeRejectedTheSecondTime()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var id = await FindSectionWithResponsesAsync(db);
            if (id is null) return;

            (await serviceFor(Admin).ClearSectionSurveyResponsesAsync(id.Value))
                .Succeeded.Should().BeTrue();

            var again = await serviceFor(Admin).ClearSectionSurveyResponsesAsync(id.Value);
            again.Succeeded.Should().BeFalse();
            again.ErrorCode.Should().Be(SurveyErrorCodes.SectionSurveyHasNoResponses);
        });
    }

    /// <summary>
    /// Lỗi thật đã gặp: huỷ phiếu xong bấm "Tính lại điểm" thì điểm cũ sống lại.
    /// Ba câu lệnh tính điểm là SQL THÔ nên không hưởng query filter của EF; thiếu
    /// một mệnh đề NOT "IsDeleted" là đám phiếu vừa huỷ được đếm lại như chưa có
    /// chuyện gì. Test này khoá chặt đúng chỗ đó.
    /// </summary>
    [Fact]
    public async Task Recalculate_AfterClear_ShouldNotResurrectDeletedResponses()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var id = await FindSectionWithResponsesAsync(db);
            if (id is null) return;

            var service = serviceFor(Admin);
            var semesterSurveyId = await db.CourseSectionSurveys.AsNoTracking()
                .Where(x => x.CourseSectionSurveyId == id.Value)
                .Select(x => x.SemesterSurveyId)
                .FirstAsync();

            (await service.ClearSectionSurveyResponsesAsync(id.Value)).Succeeded.Should().BeTrue();

            // Đúng thao tác người dùng đã làm: huỷ xong bấm tính lại cả đợt.
            (await service.RecalculateSemesterSurveyScoresAsync(semesterSurveyId))
                .Succeeded.Should().BeTrue();

            var survey = await db.CourseSectionSurveys.AsNoTracking()
                .FirstAsync(x => x.CourseSectionSurveyId == id.Value);

            survey.TotalResponseCount.Should().Be(0, "phiếu đã huỷ không được đếm lại");
            survey.ValidResponseCount.Should().Be(0);
            survey.InvalidResponseCount.Should().Be(0);
            survey.AverageScore.Should().BeNull("lớp không còn phiếu nào thì không có điểm");

            var questionScores = await db.CourseSectionSurveyQuestionScores.AsNoTracking()
                .CountAsync(x => x.CourseSectionSurveyId == id.Value);
            questionScores.Should().Be(0, "điểm từng câu cũng không được dựng lại");
        });
    }

    [Fact]
    public async Task Clear_ByANonAdmin_ShouldBeRejected()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var id = await FindSectionWithResponsesAsync(db);
            if (id is null) return;

            var before = await db.SurveyResponses.AsNoTracking()
                .CountAsync(x => x.CourseSectionSurveyId == id.Value);

            var result = await serviceFor(Lecturer).ClearSectionSurveyResponsesAsync(id.Value);

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope);

            var after = await db.SurveyResponses.AsNoTracking()
                .CountAsync(x => x.CourseSectionSurveyId == id.Value);
            after.Should().Be(before, "không được huỷ phiếu nào");
        });
    }

    [Fact]
    public async Task Clear_ShouldNotTouchOtherSections()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var id = await FindSectionWithResponsesAsync(db);
            if (id is null) return;

            var otherBefore = await db.SurveyResponses.AsNoTracking()
                .CountAsync(x => x.CourseSectionSurveyId != id.Value);

            await serviceFor(Admin).ClearSectionSurveyResponsesAsync(id.Value);

            var otherAfter = await db.SurveyResponses.AsNoTracking()
                .CountAsync(x => x.CourseSectionSurveyId != id.Value);
            otherAfter.Should().Be(otherBefore, "chỉ đúng lớp được chọn bị ảnh hưởng");
        });
    }
}
