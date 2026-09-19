namespace UnitTests.InfrastructureTests;

using global::API.GraduationAnalytics;
using Application;
using Application.GraduationAnalytics;
using FluentAssertions;
using global::Infrastructure.GraduationAnalytics;
using global::Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

public sealed class GraduationAnalyticsServiceTests
{
    [Fact]
    public void Metadata_ContainsOnlySupportedDimensionsAndOutcomeMetrics()
    {
        using var db = CreateContext();
        var service = new EfGraduationAnalyticsService(db, Mock.Of<ICurrentUserAccessor>());

        var metadata = service.GetMetadata();

        metadata.Dimensions.Select(x => x.Id).Should().BeEquivalentTo(
            "faculty", "program", "cohort", "reviewYear");
        metadata.Metrics.Should().HaveCount(11);
        metadata.Metrics.Should().Contain(x =>
            x.Id == "excellentRate"
            && x.Unit == "percent"
            && x.Aggregation == "ratio-of-sums");
        metadata.Metrics.Select(x => x.Id).Should().NotContain(
            ["initialEnrollment", "eligible", "onTimeCount", "onTimeRate"]);
    }

    [Fact]
    public async Task Query_RejectsUsingTheSameDimensionForGroupAndSeries()
    {
        await using var db = CreateContext();
        var service = new EfGraduationAnalyticsService(db, Mock.Of<ICurrentUserAccessor>());
        var command = new GraduationAnalyticsQueryCommand(
            GraduationAnalysisScopes.Cumulative, null, "excellentRate", "faculty", "faculty",
            null, null, null);

        var action = () => service.QueryAsync(command, CancellationToken.None);

        var exception = await action.Should().ThrowAsync<GraduationAnalyticsException>();
        exception.Which.ErrorCode.Should().Be(GraduationAnalyticsErrorCodes.InvalidQuery);
    }

    [Fact]
    public async Task Query_RejectsAnUnknownScopeBeforeTouchingTheDatabase()
    {
        await using var db = CreateContext();
        var service = new EfGraduationAnalyticsService(db, Mock.Of<ICurrentUserAccessor>());
        var command = new GraduationAnalyticsQueryCommand(
            "arbitrary-datasets", null, "excellentCount", "faculty", null,
            null, null, null);

        var action = () => service.QueryAsync(command, CancellationToken.None);

        var exception = await action.Should().ThrowAsync<GraduationAnalyticsException>();
        exception.Which.ErrorCode.Should().Be(GraduationAnalyticsErrorCodes.InvalidQuery);
    }

    [Fact]
    public async Task Query_RejectsPeriodIdForCumulativeScopeBeforeTouchingTheDatabase()
    {
        await using var db = CreateContext();
        var service = new EfGraduationAnalyticsService(db, Mock.Of<ICurrentUserAccessor>());
        var command = new GraduationAnalyticsQueryCommand(
            GraduationAnalysisScopes.Cumulative, 7, "excellentCount", "faculty", null,
            null, null, null);

        var action = () => service.QueryAsync(command, CancellationToken.None);

        var exception = await action.Should().ThrowAsync<GraduationAnalyticsException>();
        exception.Which.ErrorCode.Should().Be(GraduationAnalyticsErrorCodes.InvalidQuery);
    }

    [Fact]
    public async Task Query_RequiresPeriodIdForPeriodScopeBeforeTouchingTheDatabase()
    {
        await using var db = CreateContext();
        var service = new EfGraduationAnalyticsService(db, Mock.Of<ICurrentUserAccessor>());
        var command = new GraduationAnalyticsQueryCommand(
            GraduationAnalysisScopes.Period, null, "excellentCount", "faculty", null,
            null, null, null);

        var action = () => service.QueryAsync(command, CancellationToken.None);

        var exception = await action.Should().ThrowAsync<GraduationAnalyticsException>();
        exception.Which.ErrorCode.Should().Be(GraduationAnalyticsErrorCodes.InvalidQuery);
    }

    [Fact]
    public async Task Overview_RejectsInvertedYearRangeBeforeTouchingTheDatabase()
    {
        await using var db = CreateContext();
        var service = new EfGraduationAnalyticsService(db, Mock.Of<ICurrentUserAccessor>());
        var query = new GraduationOverviewQuery(null, null, null, 2027, 2026);

        var action = () => service.GetOverviewAsync(query, CancellationToken.None);

        var exception = await action.Should().ThrowAsync<GraduationAnalyticsException>();
        exception.Which.ErrorCode.Should().Be(GraduationAnalyticsErrorCodes.InvalidQuery);
    }

    [Fact]
    public async Task Import_RejectsEmptyPeriodBeforeTouchingTheDatabase()
    {
        await using var db = CreateContext();
        var service = new EfGraduationAnalyticsService(db, Mock.Of<ICurrentUserAccessor>());
        var command = new ImportGraduationPeriodCommand("file.xlsx", "Sheet1", []);

        var action = () => service.ImportPeriodAsync(command, CancellationToken.None);

        var exception = await action.Should().ThrowAsync<GraduationAnalyticsException>();
        exception.Which.ErrorCode.Should().Be(GraduationAnalyticsErrorCodes.InvalidImport);
    }

    [Fact]
    public async Task Import_RejectsRowsFromMultipleReviewPeriodsBeforeTouchingTheDatabase()
    {
        await using var db = CreateContext();
        var service = new EfGraduationAnalyticsService(db, Mock.Of<ICurrentUserAccessor>());
        var command = new ImportGraduationPeriodCommand(
            "file.xlsx",
            "Sheet1",
            [Row(7, "T7 - 2026"), Row(8, "T11/2026")]);

        var action = () => service.ImportPeriodAsync(command, CancellationToken.None);

        var exception = await action.Should().ThrowAsync<GraduationAnalyticsException>();
        exception.Which.ErrorCode.Should().Be(GraduationAnalyticsErrorCodes.MultipleReviewPeriods);
        exception.Which.Message.Should().Contain("T7 - 2026").And.Contain("T11 - 2026");
    }

    [Fact]
    public async Task DeletePeriod_RequiresAnExplicitReasonBeforeTouchingTheDatabase()
    {
        await using var db = CreateContext();
        var service = new EfGraduationAnalyticsV3Service(db, Mock.Of<ICurrentUserAccessor>());

        var action = () => service.DeletePeriodAsync(1, " ", CancellationToken.None);

        var exception = await action.Should().ThrowAsync<GraduationAnalyticsException>();
        exception.Which.ErrorCode.Should().Be(GraduationAnalyticsErrorCodes.InvalidQuery);
        exception.Which.Message.Should().Contain("3 đến 1000 ký tự");
    }

    [Fact]
    public void ApiRequest_RejectsLegacyColumnsBeforeCreatingTheApplicationCommand()
    {
        var request = new GraduationAnalyticsEndpoints.GraduationImportRowRequest(
            SourceRowNumber: 7,
            FacultyName: "Khoa A",
            ProgramCode: "A01",
            ProgramName: "Ngành A",
            Cohort: "K62",
            InitialEnrollmentCount: 100,
            ReviewPeriodText: "T7 - 2026",
            EligibleGraduateCount: 50,
            OnTimeGraduateCount: 40,
            OnTimeGraduateRate: 80,
            ExcellentCount: 1,
            ExcellentRate: 10,
            VeryGoodCount: 2,
            VeryGoodRate: 20,
            GoodCount: 3,
            GoodRate: 30,
            AverageCount: 4,
            AverageRate: 40,
            WorkStudyTransferCount: 0,
            WorkStudyTransferRate: 0);

        Action action = () => request.ToCommand();

        var exception = action.Should().Throw<GraduationAnalyticsException>();
        exception.Which.ErrorCode.Should().Be(GraduationAnalyticsErrorCodes.LegacyStructureUnsupported);
    }

    private static GraduationImportRowCommand Row(int rowNumber, string period) => new(
        rowNumber, "Khoa A", "A01", "Ngành A", "K62", 100, period,
        1, 10, 2, 20, 3, 30, 4, 40, 0, 0);

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=unused;Username=unused;Password=unused")
            .Options;
        return new AppDbContext(options);
    }
}
