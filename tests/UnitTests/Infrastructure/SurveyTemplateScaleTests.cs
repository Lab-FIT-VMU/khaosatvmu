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
/// Mỗi bộ câu hỏi dùng đúng một thang trả lời cho mọi câu: thang chọn ở cấp bộ, câu hỏi
/// không mang thang riêng, và không còn loại thang tự nhập chữ.
///
/// Mọi test bọc transaction rồi rollback, tự dựng dữ liệu riêng. Không đặt biến môi trường
/// <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class SurveyTemplateScaleTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(scope);
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunInRollbackAsync(Func<AppDbContext, EfSurveyService, Task> body)
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
            var service = new EfSurveyService(
                db,
                cache,
                new FixedScopeResolver(UserScope.Unrestricted(RoleCodes.Admin)),
                new FixedScoringThresholdProvider(),
                new PublishedSurveyPublicationService(),
                new SchoolOverviewCacheVersion());
            await body(db, service);
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }

    private static async Task<(int Likert, int YesNo)> SeedScalesAsync(EfSurveyService service)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var likert = await service.CreateAnswerScaleAsync(new SaveAnswerScaleCommand(
            $"Likert {suffix}",
            Enumerable.Range(1, 5).Select(value => new SaveAnswerScaleOptionCommand(value, $"Mức {value}")).ToList()));
        var yesNo = await service.CreateAnswerScaleAsync(new SaveAnswerScaleCommand(
            $"Có không {suffix}",
            [new(1, "Không"), new(5, "Có")]));

        likert.Succeeded.Should().BeTrue(likert.ErrorCode);
        yesNo.Succeeded.Should().BeTrue(yesNo.ErrorCode);
        return (likert.Value!.AnswerScaleId, yesNo.Value!.AnswerScaleId);
    }

    private static SaveSurveyTemplateCommand Template(int answerScaleId, int? trap = null) => new(
        $"Bộ {Guid.NewGuid():N}",
        answerScaleId,
        [new SaveSurveyQuestionSectionCommand(null, "Mục 1")],
        [
            new SaveSurveyQuestionCommand("Câu 1", null, 0),
            new SaveSurveyQuestionCommand("Câu 2", null, 0),
            new SaveSurveyQuestionCommand("Câu bẫy", trap, 0),
        ]);

    [Fact]
    public async Task TaoBo_LuuThangOCapBo()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            var (likert, _) = await SeedScalesAsync(service);

            var created = await service.CreateSurveyTemplateAsync(Template(likert, trap: 3));

            created.Succeeded.Should().BeTrue(created.ErrorCode);
            created.Value!.AnswerScaleId.Should().Be(likert);
            created.Value.Questions.Select(x => x.AttentionCheckValue).Should().Equal(null, null, 3);

            var stored = await db.SurveyTemplates.AsNoTracking()
                .SingleAsync(x => x.SurveyTemplateId == created.Value.SurveyTemplateId);
            stored.AnswerScaleId.Should().Be(likert);
        });
    }

    [Fact]
    public async Task TaoBo_ChuaChonThang_BiTuChoi()
    {
        await RunInRollbackAsync(async (_, service) =>
        {
            var created = await service.CreateSurveyTemplateAsync(Template(0));

            created.Succeeded.Should().BeFalse();
            created.ErrorCode.Should().Be(SurveyErrorCodes.TemplateScaleNotFound);
        });
    }

    [Fact]
    public async Task CauBay_PhaiLaMucCoThatCuaThangCuaBo()
    {
        await RunInRollbackAsync(async (_, service) =>
        {
            var (_, yesNo) = await SeedScalesAsync(service);

            // Thang Có/Không chỉ có mức 1 và 5.
            var invalid = await service.CreateSurveyTemplateAsync(Template(yesNo, trap: 3));
            var valid = await service.CreateSurveyTemplateAsync(Template(yesNo, trap: 5));

            invalid.ErrorCode.Should().Be(SurveyErrorCodes.AttentionCheckValueInvalid);
            valid.Succeeded.Should().BeTrue(valid.ErrorCode);
        });
    }

    [Fact]
    public async Task SuaBo_ChuaThuPhieu_DoiDuocThang()
    {
        await RunInRollbackAsync(async (_, service) =>
        {
            var (likert, yesNo) = await SeedScalesAsync(service);
            var created = (await service.CreateSurveyTemplateAsync(Template(likert))).Value!;

            var command = Template(yesNo) with
            {
                TemplateName = created.TemplateName,
                Sections = [new SaveSurveyQuestionSectionCommand(created.Sections[0].SectionId, "Mục 1")],
            };
            var updated = await service.UpdateSurveyTemplateAsync(created.SurveyTemplateId, command);

            updated.Succeeded.Should().BeTrue(updated.ErrorCode);
            updated.Value!.AnswerScaleId.Should().Be(yesNo);
        });
    }

    [Fact]
    public async Task XoaThang_DangCoBoDung_BiChan()
    {
        await RunInRollbackAsync(async (_, service) =>
        {
            var (likert, _) = await SeedScalesAsync(service);
            await service.CreateSurveyTemplateAsync(Template(likert));

            var deleted = await service.DeleteAnswerScaleAsync(likert);

            deleted.ErrorCode.Should().Be(SurveyErrorCodes.AnswerScaleInUse);
        });
    }

    [Fact]
    public async Task SuaBo_DaThuPhieu_KhongDoiDuocThang()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            // Lấy một bộ có thật đã thu phiếu; CSDL chưa có thì bỏ qua.
            var answeredTemplateId = await (
                from answer in db.SurveyResponseAnswers.IgnoreQueryFilters()
                join question in db.SurveyQuestions on answer.QuestionId equals question.QuestionId
                join section in db.SurveyQuestionSections on question.SectionId equals section.SectionId
                select (int?)section.SurveyTemplateId)
                .FirstOrDefaultAsync();
            if (answeredTemplateId is not { } templateId) return;

            var template = (await service.GetSurveyTemplatesAsync())
                .Single(x => x.SurveyTemplateId == templateId);
            var (otherScale, _) = await SeedScalesAsync(service);

            var command = new SaveSurveyTemplateCommand(
                template.TemplateName,
                otherScale,
                template.Sections.Select(x => new SaveSurveyQuestionSectionCommand(x.SectionId, x.SectionName)).ToList(),
                template.Questions
                    .Select(x => new SaveSurveyQuestionCommand(
                        x.QuestionText,
                        null,
                        template.Sections.ToList().FindIndex(s => s.SectionId == x.SectionId)))
                    .ToList());

            var updated = await service.UpdateSurveyTemplateAsync(templateId, command);

            template.HasResponses.Should().BeTrue();
            updated.ErrorCode.Should().Be(SurveyErrorCodes.TemplateInUse);
        });
    }

    [Fact]
    public async Task PhieuCongKhai_MotThangChoCaBo_NopDuocPhieu()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            // Một link có thật còn suất (hoặc không có sĩ số); mở khung giờ ra để nộp thử.
            var candidate = await db.CourseSectionSurveys
                .Where(x => x.TargetCount == null && x.CourseSectionId == null)
                .FirstOrDefaultAsync()
                ?? await db.CourseSectionSurveys
                    .Where(x => db.CourseSections.Any(section =>
                        section.CourseSectionId == x.CourseSectionId
                        && section.ClassSize > db.SurveyResponses.Count(r => r.CourseSectionSurveyId == x.CourseSectionSurveyId)))
                    .FirstOrDefaultAsync();
            if (candidate is null) return;

            candidate.StartTime = DateTime.UtcNow.AddHours(-1);
            candidate.EndTime = DateTime.UtcNow.AddHours(1);
            var semesterSurvey = await db.SemesterSurveys
                .SingleAsync(x => x.SemesterSurveyId == candidate.SemesterSurveyId);
            semesterSurvey.StartTime = candidate.StartTime;
            semesterSurvey.EndTime = candidate.EndTime;
            await db.SaveChangesAsync();

            var opened = await service.GetPublicSurveyAsync(candidate.LinkToken);
            opened.Succeeded.Should().BeTrue(opened.ErrorCode);
            var survey = opened.Value!;
            survey.AnswerScale.Should().NotBeNull();
            survey.AnswerScale!.Options.Should().NotBeEmpty();

            // Câu bẫy phải chọn đúng mức của nó, nên chọn mức thấp nhất rồi chấp nhận
            // phiếu có thể bị lọc — ở đây chỉ kiểm phiếu được nhận và lưu đủ câu.
            var value = survey.AnswerScale.Options.Min(x => x.Value).ToString();
            var submitted = await service.SubmitSurveyResponseAsync(
                candidate.LinkToken,
                new SubmitSurveyResponseCommand(
                    survey.Questions.Select(x => new SubmitSurveyAnswerCommand(x.QuestionId, value)).ToList(),
                    null,
                    600));

            submitted.Succeeded.Should().BeTrue(submitted.ErrorCode);
            (await db.SurveyResponseAnswers.CountAsync(x => x.ResponseId == submitted.Value!.ResponseId))
                .Should().Be(survey.Questions.Count);

            var invalid = await service.SubmitSurveyResponseAsync(
                candidate.LinkToken,
                new SubmitSurveyResponseCommand(
                    survey.Questions.Select(x => new SubmitSurveyAnswerCommand(x.QuestionId, "chữ tự do")).ToList(),
                    null,
                    600));
            invalid.ErrorCode.Should().Be(SurveyErrorCodes.AnswerValueInvalid);
        });
    }
}
