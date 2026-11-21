namespace UnitTests.InfrastructureTests;

using System.Data.Common;
using Application.Auth;
using Application.Catalog;
using Application.Surveys;
using Domain;
using FluentAssertions;
using global::Infrastructure.Catalog;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using global::Infrastructure.Surveys;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;
using Xunit;

[CollectionDefinition("Committed survey fixtures", DisableParallelization = true)]
public sealed class CommittedSurveyFixtureCollection { }

// Committed fixtures must not be selected and then deleted underneath other
// test classes that inspect global survey lists. Requests inside each test
// still run concurrently on independent PostgreSQL connections.
[Collection("Committed survey fixtures")]
public sealed class SurveySubmissionConcurrencyTests
{
    [CatalogDatabaseFact]
    public async Task OpenForm_UsesCurrentQuestionsAfterTemplateEdit()
    {
        await using var fixture = await Fixture.CreateAsync();
        using var readerCache = new MemoryCache(new MemoryCacheOptions());
        using var writerCache = new MemoryCache(new MemoryCacheOptions());
        await using var readerDb = fixture.Db();
        await using var writerDb = fixture.Db();
        var reader = fixture.Service(readerDb, readerCache);
        var writer = fixture.Service(writerDb, writerCache);

        (await reader.GetPublicSurveyAsync(fixture.Token)).Value!.Questions.Should().ContainSingle();
        var edit = await writer.UpdateSurveyTemplateAsync(fixture.TemplateId, new(
            "Regression", fixture.ScaleId, [new(fixture.GroupId, "Regression")],
            [new("Regression", null, 0), new("New question", null, 0)]));
        edit.Succeeded.Should().BeTrue(edit.ErrorCode);

        (await reader.GetPublicSurveyAsync(fixture.Token)).Value!.Questions.Should().HaveCount(2);
        (await reader.SubmitSurveyResponseAsync(fixture.Token, fixture.Answers)).ErrorCode
            .Should().Be(SurveyErrorCodes.AnswersIncomplete);
    }

    [CatalogDatabaseFact]
    public async Task ScaleEdit_RefreshesOpenForms_AndPreservesUsedValues()
    {
        await using var fixture = await Fixture.CreateAsync();
        using var readerCache = new MemoryCache(new MemoryCacheOptions());
        using var writerCache = new MemoryCache(new MemoryCacheOptions());
        await using var readerDb = fixture.Db();
        await using var writerDb = fixture.Db();
        var reader = fixture.Service(readerDb, readerCache);
        var writer = fixture.Service(writerDb, writerCache);

        (await reader.GetPublicSurveyAsync(fixture.Token)).Value!.AnswerScale!.Options
            .Should().Contain(x => x.Value == 5);
        (await writer.UpdateAnswerScaleAsync(fixture.ScaleId, ScaleWithoutFive())).Succeeded.Should().BeTrue();
        (await reader.GetPublicSurveyAsync(fixture.Token)).Value!.AnswerScale!.Options
            .Should().NotContain(x => x.Value == 5);
        (await reader.SubmitSurveyResponseAsync(fixture.Token, fixture.Answers)).ErrorCode
            .Should().Be(SurveyErrorCodes.AnswerValueInvalid);
        (await reader.SubmitSurveyResponseAsync(fixture.Token, new([new(fixture.QuestionId, "+02")], null, 60)))
            .Succeeded.Should().BeTrue();
        await readerDb.SurveyResponses.Where(x => x.CourseSectionSurveyId == fixture.LinkId)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.IsDeleted, true));

        var removeUsed = await writer.UpdateAnswerScaleAsync(fixture.ScaleId,
            new("Regression", [new(1, "One"), new(5, "Five")]));
        removeUsed.ErrorCode.Should().Be(SurveyErrorCodes.AnswerScaleResponseValueInUse);
    }

    [CatalogDatabaseFact]
    public async Task LinkedClass_CannotChangeSemester()
    {
        await using var fixture = await Fixture.CreateAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var db = fixture.Db();
        await using var transaction = await db.Database.BeginTransactionAsync();
        var nextSemester = new Semester { AcademicYearId = fixture.YearId, SemesterName = "Next semester" };
        db.Add(nextSemester);
        await db.SaveChangesAsync();
        var catalog = new EfCatalogService(db, new AdminScope());
        var update = await catalog.UpdateCourseSectionAsync(fixture.SectionId, new(
            fixture.CourseId, nextSemester.SemesterId, null, "Regression", 1, null));
        update.ErrorCode.Should().Be(CatalogErrorCodes.CourseSectionSemesterLocked);
        (await fixture.Service(db, cache).GetPublicSurveyAsync(fixture.Token)).Succeeded.Should().BeTrue();
    }

    private sealed class FixedScope(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) => Task.FromResult(scope);
    }

    [CatalogDatabaseFact]
    public async Task FormConfig_RejectsScopesThatCannotManageCampaigns()
    {
        await using var fixture = await Fixture.CreateAsync();
        await SetFutureScheduleAsync(fixture);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        foreach (var scope in new[]
        {
            new UserScope(RoleCodes.DepartmentManager, 1, 175, 10, false),
            new UserScope(RoleCodes.FacultyManager, 1, 175, 10, false),
            new UserScope(RoleCodes.Lecturer, 1, 175, 10, false),
            new UserScope(RoleCodes.BoardOfDirectors, null, null, null, true),
            new UserScope("CUSTOM_READ_ONLY", null, null, null, true, RoleDataScopes.All, false),
            UserScope.None,
        })
        {
            await using var db = fixture.Db();
            var service = new EfSurveyService(db, cache, new FixedScope(scope),
                new FixedScoringThresholdProvider(), new PublishedSurveyPublicationService(), new SchoolOverviewCacheVersion());
            var result = await service.SaveSemesterSurveyFormConfigAsync(fixture.CampaignId,
                new SurveyFormConfigDto(CommentHeading: "Unauthorized change"));
            result.Succeeded.Should().BeFalse(scope.RoleCode);
            result.ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope);
        }
        await using var verify = fixture.Db();
        (await verify.SemesterSurveys.SingleAsync(x => x.SemesterSurveyId == fixture.CampaignId)).FormConfigJson.Should().BeNull();
    }

    [CatalogDatabaseFact]
    public async Task FormConfig_PersistsCommentLabel_AndRefreshesCachedPublicPage()
    {
        await using var fixture = await Fixture.CreateAsync();
        await SetFutureScheduleAsync(fixture);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var db = fixture.Db();
        var service = fixture.Service(db, cache);
        (await service.GetPublicSurveyAsync(fixture.Token)).Value!.FormConfig.Should().BeNull();
        const string label = "Đề xuất của bạn về học phần";
        var config = new SurveyFormConfigDto(CommentHeading: label, CommentPlaceholder: "Nhập đề xuất...");
        var saved = await service.SaveSemesterSurveyFormConfigAsync(fixture.CampaignId, config);
        saved.Succeeded.Should().BeTrue(saved.ErrorCode);
        await using var verify = fixture.Db();
        var stored = await verify.SemesterSurveys.SingleAsync(x => x.SemesterSurveyId == fixture.CampaignId);
        SurveyFormConfig.Parse(stored.FormConfigJson)!.CommentHeading.Should().Be(label);
        var page = await service.GetPublicSurveyAsync(fixture.Token);
        page.ErrorCode.Should().Be(SurveyErrorCodes.LinkNotStarted);
        page.Value!.FormConfig!.CommentHeading.Should().Be(label);
        page.Value.Questions.Should().BeEmpty("a future survey must not reveal questions");
        var invalid = await service.SaveSemesterSurveyFormConfigAsync(fixture.CampaignId,
            config with { CommentHeading = new string('x', SurveyFormConfig.MaximumTextLength + 1) });
        invalid.ErrorCode.Should().Be(SurveyErrorCodes.FormConfigTextTooLong);
        var reset = await service.SaveSemesterSurveyFormConfigAsync(fixture.CampaignId, null);
        reset.Succeeded.Should().BeTrue(reset.ErrorCode);
        (await service.GetPublicSurveyAsync(fixture.Token)).Value!.FormConfig.Should().BeNull();
    }

    [CatalogDatabaseFact]
    public async Task FormConfig_LocksWhenAClassHasStarted_EvenIfCampaignStartsLater()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Db();
        var campaign = await db.SemesterSurveys.SingleAsync(x => x.SemesterSurveyId == fixture.CampaignId);
        campaign.StartTime = DateTime.UtcNow.AddMinutes(30);
        await db.SaveChangesAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var result = await fixture.Service(db, cache).SaveSemesterSurveyFormConfigAsync(fixture.CampaignId,
            new SurveyFormConfigDto(CommentHeading: "Changed after opening"));
        result.ErrorCode.Should().Be(SurveyErrorCodes.FormConfigLocked);
        campaign.FormConfigJson.Should().BeNull();
    }

    [CatalogDatabaseFact]
    public async Task FormConfig_SaveSerializesWithCampaignScheduleChanges()
    {
        await using var fixture = await Fixture.CreateAsync();
        await SetFutureScheduleAsync(fixture);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var pause = new PauseSave();
        var observer = new ObserveLock("SemesterSurveys");
        await using var firstDb = fixture.Db(pause);
        await using var secondDb = fixture.Db(observer);
        var first = fixture.Service(firstDb, cache).SaveSemesterSurveyFormConfigAsync(fixture.CampaignId,
            new SurveyFormConfigDto(CommentHeading: "Saved before opening"));
        Task<SurveyOperationResult<SemesterSurveyDto>>? second = null;
        var waitedForLock = false;
        try
        {
            await pause.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
            second = fixture.Service(secondDb, cache).UpdateSemesterSurveyAsync(fixture.CampaignId,
                new UpdateSemesterSurveyCommand("Opened survey", DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddHours(2)));
            var next = await Task.WhenAny(second, observer.Attempted.Task).WaitAsync(TimeSpan.FromSeconds(10));
            if (next == observer.Attempted.Task)
                waitedForLock = await fixture.WaitForLockAsync(await observer.Attempted.Task);
        }
        finally { pause.Release.TrySetResult(); }
        (await first.WaitAsync(TimeSpan.FromSeconds(10))).Succeeded.Should().BeTrue();
        try
        {
            (await second!.WaitAsync(TimeSpan.FromSeconds(10))).Succeeded.Should().BeTrue();
        }
        catch (Exception exception) when (exception.GetBaseException() is PostgresException { SqlState: PostgresErrorCodes.SerializationFailure })
        {
            // The serializable schedule transaction may reject its stale snapshot.
            // The API maps this to 409; a new request succeeds with the current data.
            secondDb.ChangeTracker.Clear();
            var retry = await fixture.Service(secondDb, cache).UpdateSemesterSurveyAsync(fixture.CampaignId,
                new UpdateSemesterSurveyCommand("Opened survey", DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddHours(2)));
            retry.Succeeded.Should().BeTrue(retry.ErrorCode);
        }
        waitedForLock.Should().BeTrue("the schedule cannot open while a form configuration change is uncommitted");
    }

    private static async Task SetFutureScheduleAsync(Fixture fixture)
    {
        await using var db = fixture.Db();
        var campaign = await db.SemesterSurveys.SingleAsync(x => x.SemesterSurveyId == fixture.CampaignId);
        var link = await db.CourseSectionSurveys.SingleAsync(x => x.CourseSectionSurveyId == fixture.LinkId);
        campaign.StartTime = link.StartTime = DateTime.UtcNow.AddHours(1);
        campaign.EndTime = link.EndTime = DateTime.UtcNow.AddHours(2);
        await db.SaveChangesAsync();
    }

    private sealed class AdminScope : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(UserScope.Unrestricted(RoleCodes.Admin));
    }

    private sealed class PauseSave : SaveChangesInterceptor
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            Started.TrySetResult();
            await Release.Task.WaitAsync(TimeSpan.FromSeconds(15), cancellationToken);
            return result;
        }
    }

    private sealed class ObserveLock(string table = "CourseSectionSurveys", string lockClause = "FOR UPDATE") : DbCommandInterceptor
    {
        public TaskCompletionSource<int> Attempted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            if (command.CommandText.Contains(table) && command.CommandText.Contains(lockClause))
                Attempted.TrySetResult(((NpgsqlConnection)command.Connection!).ProcessID);
            return ValueTask.FromResult(result);
        }
    }

    [CatalogDatabaseFact]
    public async Task TwoRequestsForTheLastSlot_CommitExactlyOneResponse()
    {
        await using var fixture = await Fixture.CreateAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var pause = new PauseSave();
        var observer = new ObserveLock();
        await using var firstDb = fixture.Db(pause);
        await using var secondDb = fixture.Db(observer);
        var first = fixture.Service(firstDb, cache).SubmitSurveyResponseAsync(fixture.Token, fixture.Answers);
        Task<SurveyOperationResult<SubmitSurveyResponseDto>>? second = null;
        var waitedForLock = false;
        try
        {
            await pause.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
            second = fixture.Service(secondDb, cache).SubmitSurveyResponseAsync(fixture.Token, fixture.Answers);
            var next = await Task.WhenAny(second, observer.Attempted.Task).WaitAsync(TimeSpan.FromSeconds(10));
            if (next == observer.Attempted.Task)
                waitedForLock = await fixture.WaitForLockAsync(await observer.Attempted.Task);
        }
        finally { pause.Release.TrySetResult(); }

        var results = await Task.WhenAll(first, second!).WaitAsync(TimeSpan.FromSeconds(10));
        waitedForLock.Should().BeTrue("the second request must wait while the first owns the last slot");
        results.Count(x => x.Succeeded).Should().Be(1);
        results.Single(x => !x.Succeeded).ErrorCode.Should().Be(SurveyErrorCodes.ClassFull);
        await using var verify = fixture.Db();
        (await verify.SurveyResponses.CountAsync(x => x.CourseSectionSurveyId == fixture.LinkId)).Should().Be(1);
        (await verify.SurveyResponseAnswers.CountAsync(x => x.SurveyResponse!.CourseSectionSurveyId == fixture.LinkId)).Should().Be(1);
    }

    [CatalogDatabaseFact]
    public async Task RequestsForDifferentLinks_DoNotBlockEachOther()
    {
        await using var fixture = await Fixture.CreateAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var otherToken = await fixture.AddLinkAsync();
        var pause = new PauseSave();
        await using var firstDb = fixture.Db(pause);
        await using var secondDb = fixture.Db();
        var first = fixture.Service(firstDb, cache).SubmitSurveyResponseAsync(fixture.Token, fixture.Answers);
        try
        {
            await pause.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
            var second = await fixture.Service(secondDb, cache)
                .SubmitSurveyResponseAsync(otherToken, fixture.Answers).WaitAsync(TimeSpan.FromSeconds(10));
            second.Succeeded.Should().BeTrue(second.ErrorCode);
        }
        finally { pause.Release.TrySetResult(); await first.WaitAsync(TimeSpan.FromSeconds(10)); }
        (await first).Succeeded.Should().BeTrue();
    }

    [CatalogDatabaseTheory]
    [InlineData("link", SurveyErrorCodes.LinkNotFound)]
    [InlineData("campaign", SurveyErrorCodes.LinkNotFound)]
    [InlineData("year", SurveyErrorCodes.LinkNotFound)]
    [InlineData("section", SurveyErrorCodes.LinkNotFound)]
    [InlineData("template", SurveyErrorCodes.LinkNotFound)]
    [InlineData("expired", SurveyErrorCodes.LinkExpired)]
    [InlineData("notStarted", SurveyErrorCodes.LinkNotStarted)]
    public async Task CachedForm_RespectsCurrentStateFromAnotherContext(string change, string expected)
    {
        await using var fixture = await Fixture.CreateAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var readDb = fixture.Db();
        var service = fixture.Service(readDb, cache);
        (await service.GetPublicSurveyAsync(fixture.Token)).Succeeded.Should().BeTrue();
        await using (var writeDb = fixture.Db())
        {
            if (change == "link") (await writeDb.CourseSectionSurveys.SingleAsync(x => x.CourseSectionSurveyId == fixture.LinkId)).IsDeleted = true;
            else if (change == "campaign") (await writeDb.SemesterSurveys.SingleAsync(x => x.SemesterSurveyId == fixture.CampaignId)).IsDeleted = true;
            else if (change == "year") (await writeDb.AcademicYears.SingleAsync(x => x.AcademicYearId == fixture.YearId)).IsDeleted = true;
            else if (change == "section") (await writeDb.CourseSections.SingleAsync(x => x.CourseSectionId == fixture.SectionId)).IsDeleted = true;
            else if (change == "template") (await writeDb.SurveyTemplates.SingleAsync(x => x.SurveyTemplateId == fixture.TemplateId)).IsDeleted = true;
            else
            {
                var campaign = await writeDb.SemesterSurveys.SingleAsync(x => x.SemesterSurveyId == fixture.CampaignId);
                if (change == "expired") campaign.EndTime = DateTime.UtcNow.AddMinutes(-1);
                else campaign.StartTime = DateTime.UtcNow.AddMinutes(1);
            }
            await writeDb.SaveChangesAsync();
        }
        var form = await service.GetPublicSurveyAsync(fixture.Token);
        form.Succeeded.Should().BeFalse();
        form.ErrorCode.Should().Be(expected);
        if (form.Value is not null) form.Value.Questions.Should().BeEmpty();
        var submitted = await service.SubmitSurveyResponseAsync(fixture.Token, fixture.Answers);
        submitted.Succeeded.Should().BeFalse();
        submitted.ErrorCode.Should().Be(expected);
        (await readDb.SurveyResponses.AnyAsync(x => x.CourseSectionSurveyId == fixture.LinkId)).Should().BeFalse();
    }

    [CatalogDatabaseFact]
    public async Task InvalidResponseUsesASlot_AndClearedResponseReleasesIt()
    {
        await using var fixture = await Fixture.CreateAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var db = fixture.Db();
        var response = new SurveyResponse { CourseSectionSurveyId = fixture.LinkId, IsValid = false, SubmittedAt = DateTime.UtcNow };
        db.SurveyResponses.Add(response);
        await db.SaveChangesAsync();
        var service = fixture.Service(db, cache);
        (await service.SubmitSurveyResponseAsync(fixture.Token, fixture.Answers)).ErrorCode.Should().Be(SurveyErrorCodes.ClassFull);
        response.IsDeleted = true;
        response.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        var result = await service.SubmitSurveyResponseAsync(fixture.Token, fixture.Answers);
        result.Succeeded.Should().BeTrue(result.ErrorCode);
        (await db.SurveyResponses.CountAsync(x => x.CourseSectionSurveyId == fixture.LinkId)).Should().Be(1);
    }

    [CatalogDatabaseFact]
    public async Task CampaignDeleteAndRestore_RefreshOtherCaches_WithoutRestoringPreviouslyDeletedLinks()
    {
        await using var fixture = await Fixture.CreateAsync();
        var secondToken = await fixture.AddLinkAsync();
        using var readerCache = new MemoryCache(new MemoryCacheOptions());
        using var adminCache = new MemoryCache(new MemoryCacheOptions());
        await using var readerDb = fixture.Db();
        var reader = fixture.Service(readerDb, readerCache);
        (await reader.GetPublicSurveyAsync(secondToken)).Succeeded.Should().BeTrue();
        await using var adminDb = fixture.Db();
        var previous = await adminDb.CourseSectionSurveys.SingleAsync(x => x.CourseSectionSurveyId == fixture.LinkId);
        previous.IsDeleted = true; previous.DeletedAt = DateTime.UtcNow.AddDays(-1);
        await adminDb.SaveChangesAsync(); adminDb.ChangeTracker.Clear();
        var admin = fixture.Service(adminDb, adminCache);
        (await admin.DeleteSemesterSurveyAsync(fixture.CampaignId)).Succeeded.Should().BeTrue();
        (await reader.GetPublicSurveyAsync(secondToken)).ErrorCode.Should().Be(SurveyErrorCodes.LinkNotFound);
        adminDb.ChangeTracker.Clear();
        (await admin.RestoreSemesterSurveyAsync(fixture.CampaignId)).Succeeded.Should().BeTrue();
        (await reader.GetPublicSurveyAsync(secondToken)).Succeeded.Should().BeTrue();
        (await reader.GetPublicSurveyAsync(fixture.Token)).ErrorCode.Should().Be(SurveyErrorCodes.LinkNotFound);
    }

    [CatalogDatabaseFact]
    public async Task InvalidAnswers_ReleaseTheSlotAndLocksForTheNextRequest()
    {
        await using var fixture = await Fixture.CreateAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var firstDb = fixture.Db();
        var first = await fixture.Service(firstDb, cache).SubmitSurveyResponseAsync(fixture.Token, new([], null, 60));
        first.ErrorCode.Should().Be(SurveyErrorCodes.AnswersIncomplete);
        await using var secondDb = fixture.Db();
        var second = await fixture.Service(secondDb, cache).SubmitSurveyResponseAsync(fixture.Token, fixture.Answers)
            .WaitAsync(TimeSpan.FromSeconds(10));
        second.Succeeded.Should().BeTrue(second.ErrorCode);
    }

    [CatalogDatabaseTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ScaleCannotRemoveAnAttentionValue_EvenForAnArchivedQuestion(bool archived)
    {
        await using var fixture = await Fixture.CreateAsync(optionsScale: true, attentionValue: 5);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var db = fixture.Db();
        if (archived)
        {
            (await db.SurveyQuestions.SingleAsync(x => x.QuestionId == fixture.QuestionId)).IsDeleted = true;
            await db.SaveChangesAsync();
        }
        var result = await fixture.Service(db, cache).UpdateAnswerScaleAsync(fixture.ScaleId, ScaleWithoutFive());
        result.Succeeded.Should().BeFalse();
        result.ErrorCode.Should().Be(SurveyErrorCodes.AnswerScaleAttentionValueInUse);
        db.ChangeTracker.Clear();
        (await db.AnswerScales.SingleAsync(x => x.AnswerScaleId == fixture.ScaleId)).AnswerScaleName.Should().Be("Regression");
        (await db.AnswerScaleOptions.Where(x => x.AnswerScaleId == fixture.ScaleId).Select(x => x.Value).ToListAsync())
            .Should().BeEquivalentTo([1, 2, 5]);
    }

    [CatalogDatabaseFact]
    public async Task ScaleCanRenameOptionsAndRemoveUnusedValues_WhenAttentionValueIsKept()
    {
        await using var fixture = await Fixture.CreateAsync(optionsScale: true, attentionValue: 5);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var db = fixture.Db();
        var result = await fixture.Service(db, cache).UpdateAnswerScaleAsync(fixture.ScaleId,
            new($"Updated {Guid.NewGuid():N}", [new(1, "Updated low"), new(5, "Updated high")]));
        result.Succeeded.Should().BeTrue(result.ErrorCode);
        result.Value!.Options.Select(x => x.Value).Should().BeEquivalentTo([1, 5]);
        result.Value.Options.Single(x => x.Value == 5).DisplayText.Should().Be("Updated high");
        (await db.SurveyQuestions.SingleAsync(x => x.QuestionId == fixture.QuestionId)).AttentionCheckValue.Should().Be(5);
    }

    [CatalogDatabaseTheory]
    [InlineData(null, 1, false)]
    [InlineData(null, 1, true)]
    [InlineData(1, null, false)]
    [InlineData(1, null, true)]
    [InlineData(1, 5, false)]
    [InlineData(1, 5, true)]
    public async Task AnsweredQuestion_CannotAddRemoveOrChangeAttentionCheck(int? original, int? changed, bool archivedResponse)
    {
        await using var fixture = await Fixture.CreateAsync(optionsScale: true, attentionValue: original);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var db = fixture.Db();
        var service = fixture.Service(db, cache);
        (await service.SubmitSurveyResponseAsync(fixture.Token, fixture.Answers)).Succeeded.Should().BeTrue();
        var response = await db.SurveyResponses.SingleAsync(x => x.CourseSectionSurveyId == fixture.LinkId);
        var originalScore = response.Score;
        var originalReasons = response.RejectionReasons;
        if (archivedResponse)
        {
            response.IsDeleted = true; response.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        var result = await service.UpdateSurveyTemplateAsync(fixture.TemplateId, TemplateCommand(fixture, changed));
        result.Succeeded.Should().BeFalse();
        result.ErrorCode.Should().Be(SurveyErrorCodes.TemplateAttentionCheckLocked);
        db.ChangeTracker.Clear();
        var question = await db.SurveyQuestions.SingleAsync(x => x.QuestionId == fixture.QuestionId);
        question.AttentionCheckValue.Should().Be(original);
        question.QuestionText.Should().Be("Regression");
        (await db.SurveyTemplates.SingleAsync(x => x.SurveyTemplateId == fixture.TemplateId)).TemplateName.Should().Be("Regression");
        var persisted = await db.SurveyResponses.IgnoreQueryFilters().SingleAsync(x => x.ResponseId == response.ResponseId);
        persisted.Score.Should().Be(originalScore);
        persisted.RejectionReasons.Should().Be(originalReasons);
    }

    [CatalogDatabaseFact]
    public async Task AnsweredQuestion_CanStillEditText_WhenAttentionValueDoesNotChange()
    {
        await using var fixture = await Fixture.CreateAsync(optionsScale: true, attentionValue: 5);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var db = fixture.Db();
        var service = fixture.Service(db, cache);
        await service.SubmitSurveyResponseAsync(fixture.Token, fixture.Answers);
        var result = await service.UpdateSurveyTemplateAsync(fixture.TemplateId, TemplateCommand(fixture, 5));
        result.Succeeded.Should().BeTrue(result.ErrorCode);
        result.Value!.Questions.Single().QuestionText.Should().Be("Updated question");
        result.Value.Questions.Single().AttentionCheckValue.Should().Be(5);
    }

    [CatalogDatabaseFact]
    public async Task UnansweredQuestion_CanStillChangeAttentionValue()
    {
        await using var fixture = await Fixture.CreateAsync(optionsScale: true);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var db = fixture.Db();
        var result = await fixture.Service(db, cache).UpdateSurveyTemplateAsync(fixture.TemplateId, TemplateCommand(fixture, 5));
        result.Succeeded.Should().BeTrue(result.ErrorCode);
        result.Value!.Questions.Single().AttentionCheckValue.Should().Be(5);
    }

    [CatalogDatabaseFact]
    public async Task EditingAttentionCheck_WaitsForFirstResponse_ThenRejectsTheChange()
    {
        await using var fixture = await Fixture.CreateAsync(optionsScale: true);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var pause = new PauseSave();
        var observer = new ObserveLock("SurveyTemplates");
        await using var firstDb = fixture.Db(pause);
        await using var secondDb = fixture.Db(observer);
        var first = fixture.Service(firstDb, cache).SubmitSurveyResponseAsync(fixture.Token, fixture.Answers);
        Task<SurveyOperationResult<SurveyTemplateDto>> second = null!;
        var waited = false;
        try
        {
            await pause.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
            second = fixture.Service(secondDb, cache).UpdateSurveyTemplateAsync(fixture.TemplateId, TemplateCommand(fixture, 1));
            var next = await Task.WhenAny(second, observer.Attempted.Task).WaitAsync(TimeSpan.FromSeconds(10));
            if (next == observer.Attempted.Task) waited = await fixture.WaitForLockAsync(await observer.Attempted.Task);
        }
        finally { pause.Release.TrySetResult(); }
        await Task.WhenAll(first, second).WaitAsync(TimeSpan.FromSeconds(10));
        waited.Should().BeTrue();
        (await first).Succeeded.Should().BeTrue();
        (await second).ErrorCode.Should().Be(SurveyErrorCodes.TemplateAttentionCheckLocked);
    }

    [CatalogDatabaseTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ConcurrentScaleAndAttentionEdits_CannotCreateAnImpossibleQuestion(bool templateFirst)
    {
        await using var fixture = await Fixture.CreateAsync(optionsScale: true);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var pause = new PauseSave();
        var observer = new ObserveLock("AnswerScales", templateFirst ? "FOR UPDATE" : "FOR SHARE");
        await using var firstDb = fixture.Db(pause);
        await using var secondDb = fixture.Db(observer);
        var firstService = fixture.Service(firstDb, cache);
        var secondService = fixture.Service(secondDb, cache);
        Task<SurveyOperationResult<SurveyTemplateDto>> templateTask = null!;
        Task<SurveyOperationResult<AnswerScaleDto>> scaleTask = null!;
        Task first = templateFirst
            ? templateTask = firstService.UpdateSurveyTemplateAsync(fixture.TemplateId, TemplateCommand(fixture, 5))
            : scaleTask = firstService.UpdateAnswerScaleAsync(fixture.ScaleId, ScaleWithoutFive());
        var waited = false;
        try
        {
            await pause.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Task second = templateFirst
                ? scaleTask = secondService.UpdateAnswerScaleAsync(fixture.ScaleId, ScaleWithoutFive())
                : templateTask = secondService.UpdateSurveyTemplateAsync(fixture.TemplateId, TemplateCommand(fixture, 5));
            var next = await Task.WhenAny(second, observer.Attempted.Task).WaitAsync(TimeSpan.FromSeconds(10));
            if (next == observer.Attempted.Task) waited = await fixture.WaitForLockAsync(await observer.Attempted.Task);
        }
        finally { pause.Release.TrySetResult(); }
        await Task.WhenAll(templateTask, scaleTask).WaitAsync(TimeSpan.FromSeconds(10));
        waited.Should().BeTrue();
        if (templateFirst)
        {
            (await templateTask).Succeeded.Should().BeTrue();
            (await scaleTask).ErrorCode.Should().Be(SurveyErrorCodes.AnswerScaleAttentionValueInUse);
        }
        else
        {
            (await scaleTask).Succeeded.Should().BeTrue();
            (await templateTask).ErrorCode.Should().Be(SurveyErrorCodes.AttentionCheckValueInvalid);
        }
        await using var verify = fixture.Db();
        var question = await verify.SurveyQuestions.SingleAsync(x => x.QuestionId == fixture.QuestionId);
        var values = await verify.AnswerScaleOptions.Where(x => x.AnswerScaleId == fixture.ScaleId).Select(x => x.Value).ToListAsync();
        if (question.AttentionCheckValue is { } required) values.Should().Contain(required);
    }

    private static SaveAnswerScaleCommand ScaleWithoutFive() =>
        new($"Updated {Guid.NewGuid():N}", [new(1, "One"), new(2, "Two")]);
    private static SaveSurveyTemplateCommand TemplateCommand(Fixture fixture, int? attention) =>
        new($"Updated {Guid.NewGuid():N}", fixture.ScaleId, [new(fixture.GroupId, "Regression")],
            [new("Updated question", attention, 0)]);

    // Fixtures are committed so independent requests observe the same rows;
    // cleanup removes only the IDs created by this fixture.
    private sealed class Fixture : IAsyncDisposable
    {
        private readonly string connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")!;
        public int YearId, SemesterId, CourseId, SectionId, TemplateId, ScaleId, GroupId, QuestionId, CampaignId, LinkId;
        public string Token { get; } = Guid.NewGuid().ToString("N");
        // Hệ thống chỉ còn thang có mức chọn sẵn, gắn với bộ câu hỏi; mọi câu trả lời là một mức.
        public SubmitSurveyResponseCommand Answers => new([new(QuestionId, "5")], null, 60);
        public AppDbContext Db(params IInterceptor[] interceptors) => new(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString).AddInterceptors(interceptors).Options);
        public EfSurveyService Service(AppDbContext db, IMemoryCache cache) => new(db, cache,
            new AdminScope(), new FixedScoringThresholdProvider(), new PublishedSurveyPublicationService(), new SchoolOverviewCacheVersion());

        public static async Task<Fixture> CreateAsync(bool optionsScale = false, int? attentionValue = null)
        {
            _ = optionsScale;
            var f = new Fixture();
            await using var db = f.Db();
            var year = new AcademicYear { AcademicYearName = $"Regression {Guid.NewGuid():N}", StartDate = new(2185, 7, 25), EndDate = new(2186, 7, 24) };
            var course = new Course { CourseCode = Guid.NewGuid().ToString("N"), CourseName = "Regression", CourseType = "Required", Credits = 3 };
            var scale = new AnswerScale { AnswerScaleName = "Regression" };
            db.AddRange(year, course, scale); await db.SaveChangesAsync();
            f.YearId = year.AcademicYearId; f.CourseId = course.CourseId; f.ScaleId = scale.AnswerScaleId;
            db.AnswerScaleOptions.AddRange(new[] { 1, 2, 5 }.Select(value =>
                new AnswerScaleOption { AnswerScaleId = f.ScaleId, Value = value, DisplayText = $"Choice {value}" }));
            var template = new SurveyTemplate { TemplateName = "Regression", AnswerScaleId = f.ScaleId, CreatedAt = DateTime.UtcNow };
            db.Add(template); await db.SaveChangesAsync();
            f.TemplateId = template.SurveyTemplateId;
            var semester = new Semester { AcademicYearId = f.YearId, SemesterName = "Regression" };
            var group = new SurveyQuestionSection { SurveyTemplateId = f.TemplateId, SectionName = "Regression" };
            db.AddRange(semester, group); await db.SaveChangesAsync(); f.SemesterId = semester.SemesterId; f.GroupId = group.SectionId;
            var section = new CourseSection { CourseId = f.CourseId, SemesterId = f.SemesterId, SectionName = "Regression", ClassSize = 1 };
            var question = new SurveyQuestion { SectionId = f.GroupId, QuestionText = "Regression", AttentionCheckValue = attentionValue };
            var campaign = new SemesterSurvey { SemesterId = f.SemesterId, SurveyTemplateId = f.TemplateId, SurveyName = "Regression", StartTime = DateTime.UtcNow.AddHours(-1), EndTime = DateTime.UtcNow.AddHours(1), CreatedAt = DateTime.UtcNow };
            db.AddRange(section, question, campaign); await db.SaveChangesAsync();
            f.SectionId = section.CourseSectionId; f.QuestionId = question.QuestionId; f.CampaignId = campaign.SemesterSurveyId;
            var link = new CourseSectionSurvey { CourseSectionId = f.SectionId, SemesterSurveyId = f.CampaignId, LinkToken = f.Token, StartTime = campaign.StartTime, EndTime = campaign.EndTime, CreatedAt = DateTime.UtcNow };
            db.Add(link); await db.SaveChangesAsync(); f.LinkId = link.CourseSectionSurveyId;
            return f;
        }

        public async Task<string> AddLinkAsync()
        {
            await using var db = Db();
            var section = new CourseSection { CourseId = CourseId, SemesterId = SemesterId, SectionName = "Second", ClassSize = 1 };
            db.Add(section); await db.SaveChangesAsync();
            var token = Guid.NewGuid().ToString("N");
            db.Add(new CourseSectionSurvey { CourseSectionId = section.CourseSectionId, SemesterSurveyId = CampaignId, LinkToken = token, StartTime = DateTime.UtcNow.AddHours(-1), EndTime = DateTime.UtcNow.AddHours(1), CreatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync(); return token;
        }

        public async Task<bool> WaitForLockAsync(int pid)
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();
            for (var attempt = 0; attempt < 100; attempt++)
            {
                await using var command = new NpgsqlCommand("SELECT wait_event_type FROM pg_stat_activity WHERE pid = @pid", connection);
                command.Parameters.AddWithValue("pid", pid);
                if (await command.ExecuteScalarAsync() is string value && value == "Lock") return true;
                await Task.Delay(25);
            }
            return false;
        }

        public async ValueTask DisposeAsync()
        {
            await using var db = Db();
            await using var transaction = await db.Database.BeginTransactionAsync();
            var links = await db.CourseSectionSurveys.IgnoreQueryFilters().Where(x => x.SemesterSurveyId == CampaignId).Select(x => x.CourseSectionSurveyId).ToListAsync();
            var responses = await db.SurveyResponses.IgnoreQueryFilters().Where(x => links.Contains(x.CourseSectionSurveyId)).Select(x => x.ResponseId).ToListAsync();
            await db.SurveyResponseAnswers.IgnoreQueryFilters().Where(x => responses.Contains(x.ResponseId)).ExecuteDeleteAsync();
            await db.SurveyResponses.IgnoreQueryFilters().Where(x => responses.Contains(x.ResponseId)).ExecuteDeleteAsync();
            await db.CourseSectionSurveys.IgnoreQueryFilters().Where(x => links.Contains(x.CourseSectionSurveyId)).ExecuteDeleteAsync();
            await db.SemesterSurveys.IgnoreQueryFilters().Where(x => x.SemesterSurveyId == CampaignId).ExecuteDeleteAsync();
            await db.SurveyQuestions.IgnoreQueryFilters().Where(x => x.SectionId == GroupId).ExecuteDeleteAsync();
            await db.SurveyQuestionSections.IgnoreQueryFilters().Where(x => x.SectionId == GroupId).ExecuteDeleteAsync();
            await db.SurveyTemplates.IgnoreQueryFilters().Where(x => x.SurveyTemplateId == TemplateId).ExecuteDeleteAsync();
            await db.AnswerScaleOptions.Where(x => x.AnswerScaleId == ScaleId).ExecuteDeleteAsync();
            await db.AnswerScales.IgnoreQueryFilters().Where(x => x.AnswerScaleId == ScaleId).ExecuteDeleteAsync();
            await db.CourseSections.IgnoreQueryFilters().Where(x => x.CourseId == CourseId).ExecuteDeleteAsync();
            await db.Courses.IgnoreQueryFilters().Where(x => x.CourseId == CourseId).ExecuteDeleteAsync();
            await db.Semesters.IgnoreQueryFilters().Where(x => x.SemesterId == SemesterId).ExecuteDeleteAsync();
            await db.AcademicYears.IgnoreQueryFilters().Where(x => x.AcademicYearId == YearId).ExecuteDeleteAsync();
            await transaction.CommitAsync();
        }
    }
}
