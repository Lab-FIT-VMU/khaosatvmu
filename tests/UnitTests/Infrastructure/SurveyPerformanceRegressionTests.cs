namespace UnitTests.InfrastructureTests;

using System.Data.Common;
using Application.Reports;
using Application.Surveys;
using Domain;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using global::Infrastructure.Surveys;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Caching.Memory;
using Xunit;

public sealed class SurveyPerformanceRegressionTests
{
    [Fact]
    public void VietnameseSqlFolding_MatchesClientFoldingForEveryVietnameseLetter()
    {
        ReportSearchText.Accented.Length.Should().Be(ReportSearchText.To.Length);
        foreach (var character in ReportSearchText.Accented)
        {
            var text = character.ToString();
            ReportSearchText.Translate(text, ReportSearchText.From, ReportSearchText.To)
                .Should().Be(ReportSearchText.Fold(text));
        }
    }
    private sealed class Queries : DbCommandInterceptor
    {
        public List<string> Sql { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Sql.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }
    }

    [Fact]
    public async Task InvalidPublicTokens_DoNotQueryOrCache()
    {
        var queries = new Queries();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=unused;Username=unused")
            .AddInterceptors(queries).Options);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = SurveyService(db, cache);
        foreach (var token in new[] { "", "invalid", new string('a', 10000), Guid.NewGuid().ToString("D"), new string('z', 32) })
            (await service.GetPublicSurveyAsync(token)).ErrorCode.Should().Be(SurveyErrorCodes.LinkNotFound);
        queries.Sql.Should().BeEmpty();
        cache.Count.Should().Be(0);
    }

    [CatalogDatabaseFact]
    public async Task MissingPublicTokens_DoNotAccumulateNegativeCacheEntries()
    {
        await using var db = Db();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = SurveyService(db, cache);
        for (var i = 0; i < 100; i++)
            (await service.GetPublicSurveyAsync(Guid.NewGuid().ToString("N"))).ErrorCode.Should().Be(SurveyErrorCodes.LinkNotFound);
        cache.Count.Should().Be(0);
    }

    [CatalogDatabaseFact]
    public async Task PublicCache_HasItsOwnBudget_AndRechecksLiveState()
    {
        await using var db = Db();
        await using var transaction = await db.Database.BeginTransactionAsync();
        var fixture = await SeedAsync(db);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        using var publicCache = new PublicSurveyContentCache();
        var service = SurveyService(db, cache, publicCache);
        var token = fixture.Links[0].LinkToken;
        var opened = await service.GetPublicSurveyAsync(token);
        opened.Succeeded.Should().BeTrue();
        publicCache.TryGetValue($"survey:public:{token}", out var content).Should().BeTrue();
        cache.Count.Should().Be(0);

        using var tinyCache = new PublicSurveyContentCache(1);
        tinyCache.Set("too-large", content!);
        tinyCache.TryGetValue("too-large", out _).Should().BeFalse();

        fixture.Links[0].IsDeleted = true;
        await db.SaveChangesAsync();
        (await service.GetPublicSurveyAsync(token)).ErrorCode.Should().Be(SurveyErrorCodes.LinkNotFound);
        publicCache.TryGetValue($"survey:public:{token}", out _).Should().BeFalse();
    }

    [CatalogDatabaseFact]
    public async Task ResponseSummaries_KeepEachResponsesAnswersAndDistributions()
    {
        await using var db = Db();
        await using var transaction = await db.Database.BeginTransactionAsync();
        var fixture = await SeedAsync(db);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var result = await SurveyService(db, cache).GetSurveyResponsesAsync(fixture.Links[0].CourseSectionSurveyId);
        result.Succeeded.Should().BeTrue();
        result.Value.Should().HaveCount(4);
        foreach (var summary in result.Value!)
        {
            summary.AnswerCount.Should().Be(1);
            summary.ValueCounts.Sum(x => x.Count).Should().Be(1);
            summary.ValueCounts.Single(x => x.Count == 1).Value.Should().Be(
                (int)fixture.Responses.Single(x => x.ResponseId == summary.ResponseId).Score);
        }
    }

    [CatalogDatabaseFact]
    public async Task OpenComments_PagesInSql_AndKeepsGlobalKpisSearchFiltersAndSorting()
    {
        var queries = new Queries();
        await using var db = Db(queries);
        await using var transaction = await db.Database.BeginTransactionAsync();
        var fixture = await SeedAsync(db);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new EfReportService(db, cache, new SchoolOverviewCacheVersion(),
            new FixedScoringThresholdProvider(), new PublishedSurveyPublicationService(), new FixedUserScopeResolver());
        Task<OpenCommentAnalysisReportDto> Report(string? search = null, OpenCommentQueryOptions? options = null) =>
            service.GetOpenCommentAnalysisAsync(null, fixture.CampaignId, null, null, null, search, null,
                options: options ?? new OpenCommentQueryOptions(PageSize: 2));

        var first = await Report();
        first.TotalComments.Should().Be(7);
        first.TotalResponses.Should().Be(8);
        first.Comments.Should().HaveCount(2);
        first.AnalyzedCommentCount.Should().Be(2);
        first.PendingAnalysisCount.Should().Be(5);
        first.ManuallyReviewedCount.Should().Be(1);
        first.SentimentBreakdown.Sum(x => x.Count).Should().Be(2);
        first.FilterValues!["sentiment"].Should().Contain("Tiêu cực").And.Contain("Chưa phân tích");

        var second = await Report(options: new(Page: 2, PageSize: 2));
        second.TotalComments.Should().Be(first.TotalComments);
        second.Comments.Select(x => x.ResponseId).Should().NotIntersectWith(first.Comments.Select(x => x.ResponseId));
        (await Report(options: new(Page: int.MaxValue, PageSize: 2))).Page.Should().Be(4);
        (await Report(options: new(PageSize: int.MaxValue))).PageSize.Should().Be(200);
        (await Report("giang day tot")).TotalComments.Should().Be(1);
        (await Report("phong hoc")).TotalComments.Should().Be(1, "decomposed Vietnamese must match too");
        (await Report("a%_b")).TotalComments.Should().Be(1, "wildcards in user input must remain literal");
        (await Report("not found anywhere")).TotalComments.Should().Be(0);
        (await Report(fixture.CourseName)).TotalComments.Should().Be(7);

        var negative = await Report(options: new(ColumnFilters: new Dictionary<string, string[]> { ["sentiment"] = ["Tiêu cực"] }));
        negative.TotalComments.Should().Be(1);
        negative.Comments.Single().IsManuallyReviewed.Should().BeTrue();
        var none = await Report(options: new(ColumnFilters: new Dictionary<string, string[]> { ["courseName"] = [] }));
        none.TotalComments.Should().Be(0);
        none.FilterValues!["courseName"].Should().Contain(fixture.CourseName);

        foreach (var key in new[] { "facultyName", "departmentName", "courseCode", "courseName", "sectionName", "lecturerName", "sentiment", "submittedAt" })
        {
            foreach (var descending in new[] { true, false })
            {
                var sorted = await Report(options: new(PageSize: 2, SortKey: key, Descending: descending));
                sorted.Comments.Should().HaveCount(2);
                sorted.TotalComments.Should().Be(7);
                if (key == "sectionName")
                    sorted.Comments.Should().OnlyContain(x => x.SectionName.StartsWith(descending ? "B" : "A"));
                if (key == "submittedAt")
                {
                    var dates = sorted.Comments.Select(x => x.SubmittedAt);
                    if (descending) dates.Should().BeInDescendingOrder();
                    else dates.Should().BeInAscendingOrder();
                }
            }
        }
        queries.Sql.Should().Contain(sql => sql.Contains("LIMIT") && sql.Contains("OFFSET"));
        queries.Sql.Should().Contain(sql => sql.Contains("translate("));
    }

    private static AppDbContext Db(params IInterceptor[] interceptors) => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection"))
        .AddInterceptors(interceptors).Options);

    private static EfSurveyService SurveyService(AppDbContext db, IMemoryCache cache, PublicSurveyContentCache? publicCache = null) =>
        new(db, cache, new FixedUserScopeResolver(), new FixedScoringThresholdProvider(),
            new PublishedSurveyPublicationService(), new SchoolOverviewCacheVersion(), publicCache);

    private sealed record Fixture(int CampaignId, string CourseName, CourseSectionSurvey[] Links, SurveyResponse[] Responses);

    private static async Task<Fixture> SeedAsync(AppDbContext db)
    {
        var key = Guid.NewGuid().ToString("N");
        var year = new AcademicYear { AcademicYearName = key, StartDate = new(2190, 1, 1), EndDate = new(2191, 1, 1) };
        var course = new Course { CourseCode = key, CourseName = "Regression course " + key, CourseType = "Required", Credits = 3 };
        var scale = new AnswerScale { AnswerScaleName = key };
        db.AddRange(year, course, scale);
        await db.SaveChangesAsync();
        db.AnswerScaleOptions.AddRange(Enumerable.Range(1, 5).Select(value => new AnswerScaleOption
            { AnswerScaleId = scale.AnswerScaleId, Value = value, DisplayText = value.ToString() }));
        // Thang gắn với bộ câu hỏi (NOT NULL) nên bộ phải tạo sau thang.
        var template = new SurveyTemplate { TemplateName = key, AnswerScaleId = scale.AnswerScaleId, CreatedAt = DateTime.UtcNow };
        db.Add(template);
        await db.SaveChangesAsync();
        var semester = new Semester { AcademicYearId = year.AcademicYearId, SemesterName = key };
        var group = new SurveyQuestionSection { SurveyTemplateId = template.SurveyTemplateId, SectionName = key };
        db.AddRange(semester, group);
        await db.SaveChangesAsync();
        var campaign = new SemesterSurvey { SemesterId = semester.SemesterId, SurveyTemplateId = template.SurveyTemplateId,
            SurveyName = key, StartTime = DateTime.UtcNow.AddHours(-1), EndTime = DateTime.UtcNow.AddHours(1), CreatedAt = DateTime.UtcNow };
        var question = new SurveyQuestion { SectionId = group.SectionId, QuestionText = key };
        var sections = new[] { "B", "A" }.Select(name => new CourseSection
            { CourseId = course.CourseId, SemesterId = semester.SemesterId, SectionName = name + key, ClassSize = 100 }).ToArray();
        db.AddRange(sections); db.AddRange(campaign, question);
        await db.SaveChangesAsync();
        var links = sections.Select(section => new CourseSectionSurvey { CourseSectionId = section.CourseSectionId,
            SemesterSurveyId = campaign.SemesterSurveyId, LinkToken = Guid.NewGuid().ToString("N"),
            StartTime = campaign.StartTime, EndTime = campaign.EndTime, CreatedAt = DateTime.UtcNow }).ToArray();
        db.AddRange(links);
        await db.SaveChangesAsync();
        var comments = new[] { "Giảng dạy tốt", "Nội dung chưa rõ", "", "CO SO VAT CHAT", "Giảng viên nhiệt tình", "Tài liệu a%_b", "Tương tác", "phòng học" };
        var responses = comments.Select((comment, index) => new SurveyResponse { CourseSectionSurveyId = links[index % 2].CourseSectionSurveyId,
            AdditionalComments = comment, Score = index % 5 + 1, IsValid = true, SubmittedAt = DateTime.UtcNow.AddMinutes(-index) }).ToArray();
        db.AddRange(responses);
        await db.SaveChangesAsync();
        db.SurveyResponseAnswers.AddRange(responses.Select(response => new SurveyResponseAnswer
            { ResponseId = response.ResponseId, QuestionId = question.QuestionId, AnswerValue = ((int)response.Score).ToString() }));
        db.OpenCommentAnalysisResults.AddRange(new OpenCommentAnalysisResult { SurveyResponseId = responses[0].ResponseId,
            Sentiment = "Positive", Confidence = 0.9m, ModelVersion = "test", AnalyzedAt = DateTime.UtcNow },
            new OpenCommentAnalysisResult { SurveyResponseId = responses[1].ResponseId, Sentiment = "Positive", ManualSentiment = "Negative",
                Confidence = 0.8m, ModelVersion = "test", AnalyzedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        return new(campaign.SemesterSurveyId, course.CourseName, links, responses);
    }
}
