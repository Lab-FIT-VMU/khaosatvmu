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
/// Đợt khảo sát chương trình đào tạo phát link theo khoá ngành và KHÔNG có sĩ số; đợt khảo
/// sát giảng viên phát link theo khoa với sĩ số là số giảng viên chốt lúc tạo. Cả hai đi
/// chung đường phiếu với khảo sát học phần nhưng không được lọt vào các màn của học phần.
///
/// Mọi test bọc transaction rồi rollback, tự dựng dữ liệu riêng. Không đặt biến môi trường
/// <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class SurveyTypeUnitTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(scope);
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static UserScope Admin => UserScope.Unrestricted(RoleCodes.Admin);

    private static UserScope ManagerOf(int departmentId) =>
        new(RoleCodes.DepartmentManager, 1, departmentId, null, SeesEverything: false);

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
            await body(db, userScope => new EfSurveyService(db, cache, new FixedScopeResolver(userScope), new FixedScoringThresholdProvider(), new PublishedSurveyPublicationService(), new SchoolOverviewCacheVersion()));
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }

    /// <summary>Dữ liệu riêng của một test: hai khoa, hai khoá ngành, ba giảng viên, một bộ câu hỏi.</summary>
    private sealed record Seed(
        int SemesterId,
        int TemplateId,
        int FacultyA,
        int FacultyB,
        int CohortId,
        int CohortMajorA,
        int CohortMajorB,
        int QuestionId);

    private static async Task<Seed> SeedAsync(AppDbContext db)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var semester = await db.Semesters.OrderBy(x => x.SemesterId).FirstAsync();

        var facultyA = new Faculty { FacultyName = $"Khoa A {suffix}" };
        var facultyB = new Faculty { FacultyName = $"Khoa B {suffix}" };
        db.Faculties.AddRange(facultyA, facultyB);
        await db.SaveChangesAsync();

        var departmentId = await db.Departments.IgnoreQueryFilters()
            .Select(x => (int?)x.DepartmentId).MaxAsync() ?? 0;
        var departmentB = new Department
        {
            DepartmentId = departmentId + 1,
            DepartmentName = $"Bộ môn B {suffix}",
            FacultyId = facultyB.FacultyId,
        };
        db.Departments.Add(departmentB);

        // Khoa A có hai giảng viên ghi thẳng khoa; khoa B có một giảng viên chỉ gắn bộ môn,
        // phải quy về khoa qua bộ môn.
        db.Lecturers.AddRange(
            new Lecturer { FullName = "GV 1", Email = $"gv1-{suffix}@test.invalid", FacultyId = facultyA.FacultyId },
            new Lecturer { FullName = "GV 2", Email = $"gv2-{suffix}@test.invalid", FacultyId = facultyA.FacultyId },
            new Lecturer { FullName = "GV 3", Email = $"gv3-{suffix}@test.invalid", DepartmentId = departmentB.DepartmentId });

        var majorA = new Major { MajorCode = $"MA{suffix}", MajorName = $"Ngành A {suffix}", FacultyId = facultyA.FacultyId };
        var majorB = new Major { MajorCode = $"MB{suffix}", MajorName = $"Ngành B {suffix}", FacultyId = facultyB.FacultyId };
        db.Majors.AddRange(majorA, majorB);

        var cohort = new Cohort
        {
            CohortCode = $"9{suffix[..3]}",
            CohortName = $"Khoá test {suffix}",
            AcademicYearId = (await db.AcademicYears.FirstAsync()).AcademicYearId,
        };
        db.Cohorts.Add(cohort);
        await db.SaveChangesAsync();

        var cohortMajorA = new CohortMajor
        {
            CohortMajorCode = $"CMA{suffix}",
            CohortId = cohort.CohortId,
            MajorId = majorA.MajorId,
            StudentCount = 40,
        };
        var cohortMajorB = new CohortMajor
        {
            CohortMajorCode = $"CMB{suffix}",
            CohortId = cohort.CohortId,
            MajorId = majorB.MajorId,
            StudentCount = 30,
        };
        db.CohortMajors.AddRange(cohortMajorA, cohortMajorB);

        var scale = new AnswerScale { AnswerScaleName = $"Thang {suffix}", ScaleKind = AnswerScaleKinds.Options };
        db.AnswerScales.Add(scale);
        var template = new SurveyTemplate { TemplateName = $"Bộ {suffix}", CreatedAt = DateTime.UtcNow };
        db.SurveyTemplates.Add(template);
        await db.SaveChangesAsync();

        db.AnswerScaleOptions.AddRange(Enumerable.Range(1, 5).Select(value => new AnswerScaleOption
        {
            AnswerScaleId = scale.AnswerScaleId,
            Value = value,
            DisplayText = $"Mức {value}",
        }));
        var section = new SurveyQuestionSection { SurveyTemplateId = template.SurveyTemplateId, SectionName = "Mục 1" };
        db.SurveyQuestionSections.Add(section);
        await db.SaveChangesAsync();

        var question = new SurveyQuestion
        {
            SectionId = section.SectionId,
            QuestionText = "Câu 1",
            AnswerScaleId = scale.AnswerScaleId,
        };
        db.SurveyQuestions.Add(question);
        await db.SaveChangesAsync();

        return new Seed(
            semester.SemesterId,
            template.SurveyTemplateId,
            facultyA.FacultyId,
            facultyB.FacultyId,
            cohort.CohortId,
            cohortMajorA.CohortMajorId,
            cohortMajorB.CohortMajorId,
            question.QuestionId);
    }

    private static CreateSemesterSurveyCommand Command(
        Seed seed,
        string surveyType,
        string scopeType,
        int? scopeId) =>
        new(
            $"Đợt {surveyType}",
            seed.SemesterId,
            seed.TemplateId,
            DateTime.UtcNow.AddMinutes(-5),
            DateTime.UtcNow.AddDays(7),
            scopeType,
            scopeId,
            null,
            surveyType);

    [Fact]
    public async Task CreateProgramSurvey_GivesOneLinkPerCohortMajor_WithoutTargetCount()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var service = serviceFor(Admin);

            var result = await service.CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Program, SurveyScopeTypes.Cohort, seed.CohortId));

            result.Succeeded.Should().BeTrue(result.ErrorCode);
            result.Value!.SurveyType.Should().Be(SurveyTypes.Program);
            result.Value.SectionSurveyCount.Should().Be(2);
            result.Value.MissingSectionCount.Should().Be(0);

            var units = await service.GetSurveyUnitsAsync(result.Value.SemesterSurveyId);
            units.Succeeded.Should().BeTrue();
            units.Value!.Select(x => x.UnitId)
                .Should().BeEquivalentTo([seed.CohortMajorA, seed.CohortMajorB]);
            units.Value.Should().OnlyContain(x => x.TargetCount == null);
            units.Value.Single(x => x.UnitId == seed.CohortMajorA).FacultyId.Should().Be(seed.FacultyA);
        });
    }

    [Fact]
    public async Task CreateLecturerSurvey_SnapshotsLecturerCountPerFaculty()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var service = serviceFor(Admin);

            var result = await service.CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Lecturer, SurveyScopeTypes.All, null));
            result.Succeeded.Should().BeTrue(result.ErrorCode);

            var units = (await service.GetSurveyUnitsAsync(result.Value!.SemesterSurveyId)).Value!;
            units.Single(x => x.UnitId == seed.FacultyA).TargetCount.Should().Be(2);
            // Giảng viên chỉ gắn bộ môn vẫn được quy về khoa của bộ môn.
            units.Single(x => x.UnitId == seed.FacultyB).TargetCount.Should().Be(1);

            // Thêm giảng viên sau khi phát link không làm trượt sĩ số đã chốt.
            db.Lecturers.Add(new Lecturer
            {
                FullName = "GV mới",
                Email = $"new-{Guid.NewGuid():N}@test.invalid",
                FacultyId = seed.FacultyA,
            });
            await db.SaveChangesAsync();
            (await service.GetSurveyUnitsAsync(result.Value.SemesterSurveyId)).Value!
                .Single(x => x.UnitId == seed.FacultyA).TargetCount.Should().Be(2);
        });
    }

    [Fact]
    public async Task ScopeTypes_AreCheckedAgainstSurveyType()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var service = serviceFor(Admin);

            (await service.CreateSemesterSurveyAsync(
                    Command(seed, SurveyTypes.Lecturer, SurveyScopeTypes.Cohort, seed.CohortId)))
                .ErrorCode.Should().Be(SurveyErrorCodes.ScopeTypeUnsupported);
            (await service.CreateSemesterSurveyAsync(
                    Command(seed, SurveyTypes.Program, SurveyScopeTypes.Department, 1)))
                .ErrorCode.Should().Be(SurveyErrorCodes.ScopeTypeUnsupported);
            (await service.CreateSemesterSurveyAsync(
                    Command(seed, "STUDENT", SurveyScopeTypes.All, null)))
                .ErrorCode.Should().Be(SurveyErrorCodes.SurveyTypeInvalid);
        });
    }

    [Fact]
    public async Task UnitSurveys_AreAdminOnly()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var created = await serviceFor(Admin).CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Program, SurveyScopeTypes.All, null));
            var manager = serviceFor(ManagerOf(1));

            (await manager.GetSurveyUnitsAsync(created.Value!.SemesterSurveyId))
                .ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope);
            (await manager.PreviewSectionScopeAsync(
                    seed.SemesterId, SurveyScopeTypes.All, null, null, SurveyTypes.Program))
                .ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope);
        });
    }

    [Fact]
    public async Task AddUnits_SkipsCoveredCohortMajors()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var service = serviceFor(Admin);
            var created = await service.CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Program, SurveyScopeTypes.CohortMajor, seed.CohortMajorA));
            var surveyId = created.Value!.SemesterSurveyId;

            var preview = await service.PreviewSectionScopeAsync(
                seed.SemesterId, SurveyScopeTypes.Cohort, seed.CohortId, surveyId);
            preview.Value!.ScopeSectionCount.Should().Be(2);
            preview.Value.NewSectionCount.Should().Be(1);

            var added = await service.AddSectionsToSemesterSurveyAsync(
                surveyId,
                new AddSectionsToSemesterSurveyCommand(
                    SurveyScopeTypes.Cohort,
                    seed.CohortId,
                    created.Value.StartTime,
                    created.Value.EndTime));
            added.Succeeded.Should().BeTrue(added.ErrorCode);
            added.Value!.CreatedSectionCount.Should().Be(1);
            added.Value.SkippedSectionCount.Should().Be(1);

            var again = await service.AddSectionsToSemesterSurveyAsync(
                surveyId,
                new AddSectionsToSemesterSurveyCommand(
                    SurveyScopeTypes.Cohort,
                    seed.CohortId,
                    created.Value.StartTime,
                    created.Value.EndTime));
            again.ErrorCode.Should().Be(SurveyErrorCodes.ScopeSectionsAlreadyAdded);
        });
    }

    [Fact]
    public async Task ProgramLink_ShowsCohortMajorOnForm_AndNeverFillsUp()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var service = serviceFor(Admin);
            var created = await service.CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Program, SurveyScopeTypes.CohortMajor, seed.CohortMajorA));
            var unit = (await service.GetSurveyUnitsAsync(created.Value!.SemesterSurveyId)).Value!.Single();

            var form = await service.GetPublicSurveyAsync(unit.LinkToken);
            form.Succeeded.Should().BeTrue(form.ErrorCode);
            form.Value!.SurveyType.Should().Be(SurveyTypes.Program);
            form.Value.CohortMajorCode.Should().Be(unit.UnitCode);
            form.Value.MajorName.Should().Be(unit.UnitName);
            form.Value.FacultyName.Should().Be(unit.FacultyName);
            form.Value.CourseCode.Should().BeEmpty();

            // Không có sĩ số: nộp bao nhiêu phiếu link vẫn mở.
            for (var i = 0; i < 3; i++)
            {
                var submitted = await service.SubmitSurveyResponseAsync(
                    unit.LinkToken,
                    new SubmitSurveyResponseCommand(
                        [new SubmitSurveyAnswerCommand(seed.QuestionId, "4")],
                        null,
                        120));
                submitted.Succeeded.Should().BeTrue(submitted.ErrorCode);
            }
            (await service.GetPublicSurveyAsync(unit.LinkToken)).Succeeded.Should().BeTrue();
            (await service.GetSurveyUnitsAsync(created.Value.SemesterSurveyId)).Value!
                .Single().ResponseCount.Should().Be(3);
        });
    }

    [Fact]
    public async Task LecturerLink_ClosesWhenFacultyLecturerCountIsReached()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var service = serviceFor(Admin);
            var created = await service.CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Lecturer, SurveyScopeTypes.Faculty, seed.FacultyB));
            var unit = (await service.GetSurveyUnitsAsync(created.Value!.SemesterSurveyId)).Value!.Single();
            unit.TargetCount.Should().Be(1);

            var submitted = await service.SubmitSurveyResponseAsync(
                unit.LinkToken,
                new SubmitSurveyResponseCommand(
                    [new SubmitSurveyAnswerCommand(seed.QuestionId, "5")],
                    null,
                    120));
            submitted.Succeeded.Should().BeTrue(submitted.ErrorCode);

            (await service.GetPublicSurveyAsync(unit.LinkToken))
                .ErrorCode.Should().Be(SurveyErrorCodes.ClassFull);
        });
    }

    private static Task<SurveyOperationResult<SubmitSurveyResponseDto>> SubmitAsync(
        EfSurveyService service,
        string linkToken,
        int questionId,
        string value,
        double elapsedSeconds = 120,
        string? comment = null) =>
        service.SubmitSurveyResponseAsync(
            linkToken,
            new SubmitSurveyResponseCommand(
                [new SubmitSurveyAnswerCommand(questionId, value)],
                comment,
                elapsedSeconds));

    [Fact]
    public async Task ProgramReport_HasNoTarget_AndScoresOnlyCountedResponses()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var service = serviceFor(Admin);
            var created = await service.CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Program, SurveyScopeTypes.Cohort, seed.CohortId));
            var surveyId = created.Value!.SemesterSurveyId;
            var units = (await service.GetSurveyUnitsAsync(surveyId)).Value!;
            var unitA = units.Single(x => x.UnitId == seed.CohortMajorA);

            // Bốn phiếu thật (4, 2, 4, 2) và một phiếu làm quá nhanh bị bộ lọc nhiễu loại:
            // 4/5 = 80% hợp lệ, vừa chạm ngưỡng mặc định nên khoá ngành được tính điểm.
            (await SubmitAsync(service, unitA.LinkToken, seed.QuestionId, "4", comment: "Tốt")).Succeeded.Should().BeTrue();
            foreach (var answer in new[] { "2", "4", "2" })
            {
                (await SubmitAsync(service, unitA.LinkToken, seed.QuestionId, answer)).Succeeded.Should().BeTrue();
            }
            (await SubmitAsync(service, unitA.LinkToken, seed.QuestionId, "5", elapsedSeconds: 1)).Succeeded.Should().BeTrue();

            var report = await service.GetUnitSurveyReportAsync(surveyId);
            report.Succeeded.Should().BeTrue(report.ErrorCode);
            var value = report.Value!;

            value.Summary.TargetCount.Should().BeNull();
            value.Summary.ResponseRate.Should().BeNull();
            value.Summary.UnitCount.Should().Be(2);
            value.Summary.ResponseCount.Should().Be(5);
            value.Summary.ValidResponseCount.Should().Be(4);
            value.Summary.AverageScore.Should().Be(3m);

            var rowA = value.Units.Single(x => x.UnitId == seed.CohortMajorA);
            rowA.ResponseRate.Should().BeNull();
            rowA.IsScored.Should().BeTrue();
            rowA.AverageScore.Should().Be(3m);
            rowA.QuestionScores.Single().AverageScore.Should().Be(3m);
            rowA.OpenCommentCount.Should().Be(1);
            value.Units.Single(x => x.UnitId == seed.CohortMajorB).IsScored.Should().BeFalse();

            value.Majors.Should().HaveCount(2);
            value.Cohorts.Should().ContainSingle();
            value.Comments.Should().ContainSingle(x => x.Comment == "Tốt" && x.UnitCode == unitA.UnitCode);

            // Phiếu bị lọc (chọn 5) không vào phân bố mức.
            var distribution = value.Questions.Single().Distribution;
            distribution.Should().HaveCount(5);
            distribution.Single(x => x.Value == 4).Count.Should().Be(2);
            distribution.Single(x => x.Value == 5).Count.Should().Be(0);
        });
    }

    [Fact]
    public async Task LecturerReport_UsesSnapshotTargetForResponseRate()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var service = serviceFor(Admin);
            var created = await service.CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Lecturer, SurveyScopeTypes.All, null));
            var surveyId = created.Value!.SemesterSurveyId;
            var unitA = (await service.GetSurveyUnitsAsync(surveyId)).Value!
                .Single(x => x.UnitId == seed.FacultyA);

            (await SubmitAsync(service, unitA.LinkToken, seed.QuestionId, "5")).Succeeded.Should().BeTrue();
            (await SubmitAsync(service, unitA.LinkToken, seed.QuestionId, "3")).Succeeded.Should().BeTrue();

            var value = (await service.GetUnitSurveyReportAsync(surveyId)).Value!;
            var rowA = value.Units.Single(x => x.UnitId == seed.FacultyA);
            rowA.TargetCount.Should().Be(2);
            rowA.ResponseRate.Should().Be(100m);
            rowA.IsScored.Should().BeTrue();
            rowA.AverageScore.Should().Be(4m);

            var rowB = value.Units.Single(x => x.UnitId == seed.FacultyB);
            rowB.ResponseRate.Should().Be(0m);
            rowB.IsScored.Should().BeFalse();

            // Điểm gộp chỉ lấy đơn vị được tính điểm.
            value.Faculties.Single(x => x.Key == seed.FacultyA.ToString()).AverageScore.Should().Be(4m);
            value.Majors.Should().BeEmpty();
            value.Questions.Single().AverageScore.Should().Be(4m);
        });
    }

    [Fact]
    public async Task UnitReport_RejectsCourseSurveysAndNonAdmins()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var created = await serviceFor(Admin).CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Program, SurveyScopeTypes.All, null));

            (await serviceFor(ManagerOf(1)).GetUnitSurveyReportAsync(created.Value!.SemesterSurveyId))
                .ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope);

            var courseSurvey = (await serviceFor(Admin).GetSemesterSurveysAsync(null, SurveyTypes.Course))
                .FirstOrDefault();
            if (courseSurvey is not null)
            {
                (await serviceFor(Admin).GetUnitSurveyReportAsync(courseSurvey.SemesterSurveyId))
                    .ErrorCode.Should().Be(SurveyErrorCodes.SurveyTypeMismatch);
            }
        });
    }

    [Fact]
    public async Task CourseStatistics_IgnoreUnitsOfOtherSurveyTypes()
    {
        // Trang học phần từng mở nhầm mã đợt CTĐT lưu trong ô nhớ dùng chung và hiện mỗi
        // khoá ngành thành một "lớp" trống. Mã đợt loại khác phải ra bảng rỗng và không
        // chốt điểm được.
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var service = serviceFor(Admin);
            var created = await service.CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Program, SurveyScopeTypes.Cohort, seed.CohortId));
            var surveyId = created.Value!.SemesterSurveyId;
            var unit = (await service.GetSurveyUnitsAsync(surveyId)).Value!.First();
            (await SubmitAsync(service, unit.LinkToken, seed.QuestionId, "4")).Succeeded.Should().BeTrue();

            var statistics = await service.GetSemesterSurveyStatisticsAsync(surveyId);
            if (statistics.Succeeded)
            {
                statistics.Value!.Rows.Should().BeEmpty();
            }

            (await service.RecalculateSemesterSurveyScoresAsync(surveyId))
                .ErrorCode.Should().Be(SurveyErrorCodes.SurveyTypeMismatch);
        });
    }

    [Fact]
    public async Task CourseScreens_DoNotSeeOtherSurveyTypes()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seed = await SeedAsync(db);
            var service = serviceFor(Admin);
            var created = await service.CreateSemesterSurveyAsync(
                Command(seed, SurveyTypes.Lecturer, SurveyScopeTypes.All, null));
            var surveyId = created.Value!.SemesterSurveyId;

            (await service.GetSemesterSurveysAsync(seed.SemesterId, SurveyTypes.Course))
                .Should().NotContain(x => x.SemesterSurveyId == surveyId);
            (await service.GetSemesterSurveysAsync(seed.SemesterId, SurveyTypes.Lecturer))
                .Should().Contain(x => x.SemesterSurveyId == surveyId);
            (await service.GetCourseSectionSurveysAsync(null, seed.SemesterId))
                .Should().NotContain(x => x.SemesterSurveyId == surveyId);
            (await service.GetSurveyUnitsAsync(
                    (await service.GetSemesterSurveysAsync(seed.SemesterId, SurveyTypes.Course))
                        .FirstOrDefault()?.SemesterSurveyId ?? -1))
                .Succeeded.Should().BeFalse();
        });
    }
}
