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
/// Đợt khảo sát chỉ phát phiếu cho phạm vi được chọn — cả kỳ, một khoa/viện, một
/// bộ môn, hoặc đúng một lớp. Kiểm chứng ba thứ dễ lệch nhất: lọc theo phạm vi,
/// bỏ qua lớp đã có bài khi phạm vi chồng nhau, và cột "lớp còn thiếu" chỉ đếm
/// trong phạm vi của chính đợt chứ không đếm cả kỳ.
///
/// Mọi test ghi đều bọc transaction rồi rollback. Không đặt biến môi trường
/// <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class SurveySectionScopeTests
{
    private sealed class FixedScopeResolver(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(scope);
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private const string SeededSurveyName = "Khảo sát kiểm thử phạm vi";

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

    private static UserScope Admin => UserScope.Unrestricted(RoleCodes.Admin);

    private static UserScope Lecturer =>
        new(RoleCodes.Lecturer, 1, null, null, SeesEverything: false);

    private static UserScope ManagerOf(int departmentId) =>
        new(RoleCodes.DepartmentManager, 1, departmentId, null, SeesEverything: false);

    /// <summary>Một bộ môn có đủ lớp trong một học kỳ để dựng kịch bản phạm vi.</summary>
    private sealed record DepartmentSlice(
        int SemesterId,
        int DepartmentId,
        List<int> SectionIds);

    /// <summary>
    /// Quy lớp về bộ môn đúng theo thứ tự của service (học phần trước, giảng viên
    /// sau) rồi chọn ra một bộ môn có ít nhất <paramref name="minimumSections"/>
    /// lớp trong cùng một kỳ. Đọc hết về bộ nhớ cho dễ đọc — dữ liệu test chỉ vài
    /// nghìn dòng.
    /// </summary>
    private static async Task<DepartmentSlice?> FindDepartmentSliceAsync(
        AppDbContext db,
        int minimumSections)
    {
        var rows = await (
            from section in db.CourseSections
            join course in db.Courses on section.CourseId equals course.CourseId into courseJoin
            from course in courseJoin.DefaultIfEmpty()
            select new
            {
                section.CourseSectionId,
                section.SemesterId,
                section.LecturerId,
                CourseDepartmentId = (int?)course.DepartmentId,
            }).ToListAsync();
        if (rows.Count == 0) return null;

        var lecturerDepartmentId = await db.Lecturers
            .ToDictionaryAsync(x => x.LecturerId, x => x.DepartmentId);

        var slice = rows
            .Select(row => new
            {
                row.CourseSectionId,
                row.SemesterId,
                DepartmentId = row.CourseDepartmentId
                    ?? (row.LecturerId is { } id ? lecturerDepartmentId.GetValueOrDefault(id) : null),
            })
            .Where(row => row.DepartmentId is not null)
            .GroupBy(row => new { row.SemesterId, DepartmentId = row.DepartmentId!.Value })
            .Where(group => group.Count() >= minimumSections)
            .OrderByDescending(group => group.Count())
            .FirstOrDefault();

        return slice is null
            ? null
            : new DepartmentSlice(
                slice.Key.SemesterId,
                slice.Key.DepartmentId,
                slice.Select(row => row.CourseSectionId).OrderBy(id => id).ToList());
    }

    /// <summary>
    /// Dựng một đợt chỉ phủ MỘT bộ môn và cố tình bỏ lại <paramref name="missingCount"/>
    /// lớp của chính bộ môn đó. Nhờ vậy phạm vi suy ra được của đợt đúng bằng một
    /// bộ môn, và số lớp thiếu là một con số biết trước.
    /// </summary>
    private static async Task<(int SemesterSurveyId, DepartmentSlice Slice, int MissingCount)?>
        SeedDepartmentScopedSurveyAsync(AppDbContext db, int missingCount)
    {
        var templateId = await db.SurveyTemplates
            .Select(x => x.SurveyTemplateId)
            .FirstOrDefaultAsync();
        if (templateId == 0) return null;

        var slice = await FindDepartmentSliceAsync(db, missingCount + 1);
        if (slice is null) return null;

        var now = DateTime.UtcNow;
        var survey = new SemesterSurvey
        {
            SurveyName = SeededSurveyName,
            SemesterId = slice.SemesterId,
            SurveyTemplateId = templateId,
            StartTime = now.AddDays(-1),
            EndTime = now.AddDays(30),
            CreatedAt = now,
        };
        db.SemesterSurveys.Add(survey);
        await db.SaveChangesAsync();

        db.CourseSectionSurveys.AddRange(slice.SectionIds
            .Take(slice.SectionIds.Count - missingCount)
            .Select(sectionId => new CourseSectionSurvey
            {
                SemesterSurveyId = survey.SemesterSurveyId,
                CourseSectionId = sectionId,
                LinkToken = Guid.NewGuid().ToString("N"),
                StartTime = now.AddDays(-1),
                EndTime = now.AddDays(30),
                CreatedAt = now,
            }));
        await db.SaveChangesAsync();

        return (survey.SemesterSurveyId, slice, missingCount);
    }

    [Fact]
    public async Task MissingSectionCount_ShouldStayInsideTheSurveysOwnScope()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 3);
            if (seeded is null) return;

            var surveys = await serviceFor(Admin).GetSemesterSurveysAsync(null);
            var survey = surveys.Single(x => x.SemesterSurveyId == seeded.Value.SemesterSurveyId);

            var semesterSectionCount = await db.CourseSections
                .CountAsync(x => x.SemesterId == seeded.Value.Slice.SemesterId);

            survey.MissingSectionCount.Should().Be(
                3,
                "chỉ ba lớp của chính bộ môn mà đợt đang phủ là còn thiếu");
            survey.MissingSectionCount.Should().BeLessThan(
                semesterSectionCount - survey.SectionSurveyCount,
                "lớp của bộ môn khác không được tính là thiếu, nếu không đợt giới hạn "
                + "phạm vi sẽ luôn báo động cả nghìn lớp");
        });
    }

    [Fact]
    public async Task AddSections_WithDepartmentScope_ShouldCreateExactlyTheMissingOnes()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 3);
            if (seeded is null) return;
            var (semesterSurveyId, slice, _) = seeded.Value;

            var before = await db.CourseSectionSurveys
                .Where(x => x.SemesterSurveyId == semesterSurveyId)
                .Select(x => x.CourseSectionSurveyId)
                .ToListAsync();

            var startTime = DateTime.UtcNow.AddDays(1);
            var endTime = DateTime.UtcNow.AddDays(20);
            var result = await serviceFor(Admin).AddSectionsToSemesterSurveyAsync(
                semesterSurveyId,
                new AddSectionsToSemesterSurveyCommand(
                    SurveyScopeTypes.Department,
                    slice.DepartmentId,
                    startTime,
                    endTime));

            result.Succeeded.Should().BeTrue();
            result.Value!.CreatedSectionCount.Should().Be(3);
            result.Value.SkippedSectionCount.Should().Be(
                slice.SectionIds.Count - 3,
                "lớp đã có bài phải bị bỏ qua chứ không làm hỏng cả lệnh");
            result.Value.SurveyName.Should().Be(SeededSurveyName);

            var after = await db.CourseSectionSurveys
                .Where(x => x.SemesterSurveyId == semesterSurveyId)
                .ToListAsync();
            after.Should().HaveCount(before.Count + 3);
            after.Select(x => x.LinkToken).Should().OnlyHaveUniqueItems("mỗi lớp một đường dẫn riêng");

            // Khung giờ do người gọi đặt, nhưng vẫn phải nằm trong lịch tổng của đợt.
            var created = after.Where(x => !before.Contains(x.CourseSectionSurveyId)).ToList();
            created.Should().OnlyContain(
                x => x.StartTime == startTime && x.EndTime == endTime,
                "lớp thêm vào dùng đúng khung giờ vừa nhập");

            // Không còn lớp nào của bộ môn đó thiếu, và bấm lần nữa thì bị chặn.
            var surveys = await serviceFor(Admin).GetSemesterSurveysAsync(null);
            surveys.Single(x => x.SemesterSurveyId == semesterSurveyId)
                .MissingSectionCount.Should().Be(0);

            var again = await serviceFor(Admin).AddSectionsToSemesterSurveyAsync(
                semesterSurveyId,
                new AddSectionsToSemesterSurveyCommand(
                    SurveyScopeTypes.Department,
                    slice.DepartmentId,
                    startTime,
                    endTime));
            again.Succeeded.Should().BeFalse();
            again.ErrorCode.Should().Be(SurveyErrorCodes.ScopeSectionsAlreadyAdded);
        });
    }

    [Fact]
    public async Task AddSections_WithSectionScope_ShouldCreateExactlyOneSurvey()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 3);
            if (seeded is null) return;
            var (semesterSurveyId, slice, _) = seeded.Value;

            var targetSectionId = slice.SectionIds[^1];
            var result = await serviceFor(Admin).AddSectionsToSemesterSurveyAsync(
                semesterSurveyId,
                new AddSectionsToSemesterSurveyCommand(
                    SurveyScopeTypes.Section,
                    targetSectionId,
                    DateTime.UtcNow.AddDays(1),
                    DateTime.UtcNow.AddDays(20)));

            result.Succeeded.Should().BeTrue();
            result.Value!.CreatedSectionCount.Should().Be(1);
            result.Value.SkippedSectionCount.Should().Be(0);

            var exists = await db.CourseSectionSurveys.AnyAsync(x =>
                x.SemesterSurveyId == semesterSurveyId && x.CourseSectionId == targetSectionId);
            exists.Should().BeTrue();
        });
    }

    [Fact]
    public async Task PreviewScope_ShouldMatchWhatAddSectionsActuallyCreates()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 3);
            if (seeded is null) return;
            var (semesterSurveyId, slice, _) = seeded.Value;

            var preview = await serviceFor(Admin).PreviewSectionScopeAsync(
                slice.SemesterId,
                SurveyScopeTypes.Department,
                slice.DepartmentId,
                semesterSurveyId);

            preview.Succeeded.Should().BeTrue();
            preview.Value!.ScopeSectionCount.Should().Be(slice.SectionIds.Count);
            preview.Value.NewSectionCount.Should().Be(3);

            var result = await serviceFor(Admin).AddSectionsToSemesterSurveyAsync(
                semesterSurveyId,
                new AddSectionsToSemesterSurveyCommand(
                    SurveyScopeTypes.Department,
                    slice.DepartmentId,
                    DateTime.UtcNow.AddDays(1),
                    DateTime.UtcNow.AddDays(20)));

            result.Value!.CreatedSectionCount.Should().Be(
                preview.Value.NewSectionCount,
                "xem trước nói bao nhiêu thì tạo ra đúng bấy nhiêu, nếu không người "
                + "dùng bấm xác nhận trên một con số sai");
        });
    }

    [Fact]
    public async Task AddSections_WithAnUnknownScopeType_ShouldBeRejected()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 1);
            if (seeded is null) return;

            var result = await serviceFor(Admin).AddSectionsToSemesterSurveyAsync(
                seeded.Value.SemesterSurveyId,
                new AddSectionsToSemesterSurveyCommand(
                    "major",
                    1,
                    DateTime.UtcNow.AddDays(1),
                    DateTime.UtcNow.AddDays(20)));

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(SurveyErrorCodes.ScopeTypeUnsupported);
        });
    }

    [Fact]
    public async Task AddSections_WithoutAScopeId_ShouldBeRejected()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 1);
            if (seeded is null) return;

            var result = await serviceFor(Admin).AddSectionsToSemesterSurveyAsync(
                seeded.Value.SemesterSurveyId,
                new AddSectionsToSemesterSurveyCommand(
                    SurveyScopeTypes.Faculty,
                    null,
                    DateTime.UtcNow.AddDays(1),
                    DateTime.UtcNow.AddDays(20)));

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(SurveyErrorCodes.ScopeIdRequired);
        });
    }

    [Fact]
    public async Task AddSections_ByANonAdmin_ShouldBeRejected()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 2);
            if (seeded is null) return;
            var (semesterSurveyId, slice, _) = seeded.Value;

            var before = await db.CourseSectionSurveys
                .CountAsync(x => x.SemesterSurveyId == semesterSurveyId);

            var result = await serviceFor(Lecturer).AddSectionsToSemesterSurveyAsync(
                semesterSurveyId,
                new AddSectionsToSemesterSurveyCommand(
                    SurveyScopeTypes.Department,
                    slice.DepartmentId,
                    DateTime.UtcNow.AddDays(1),
                    DateTime.UtcNow.AddDays(20)));

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope);

            var after = await db.CourseSectionSurveys
                .CountAsync(x => x.SemesterSurveyId == semesterSurveyId);
            after.Should().Be(before, "không được tạo thêm bài nào");
        });
    }

    [Fact]
    public async Task AddSections_ByDepartmentManager_ShouldOnlyAddOwnDepartment()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 2);
            if (seeded is null) return;
            var (semesterSurveyId, slice, _) = seeded.Value;

            var result = await serviceFor(ManagerOf(slice.DepartmentId))
                .AddSectionsToSemesterSurveyAsync(
                    semesterSurveyId,
                    new AddSectionsToSemesterSurveyCommand(
                        SurveyScopeTypes.All,
                        null,
                        DateTime.UtcNow.AddDays(1),
                        DateTime.UtcNow.AddDays(20)));

            result.Succeeded.Should().BeTrue();
            var createdSectionIds = await db.CourseSectionSurveys
                .Where(x => x.SemesterSurveyId == semesterSurveyId)
                .Select(x => x.CourseSectionId)
                .ToListAsync();
            createdSectionIds.Should().OnlyContain(id => slice.SectionIds.Contains(id));
        });
    }

    [Fact]
    public async Task UpdateSemesterSurvey_WhenRangeNarrows_SectionsFollowingTheSurveyMoveWithIt()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 1);
            if (seeded is null) return;

            var survey = await db.SemesterSurveys.SingleAsync(
                x => x.SemesterSurveyId == seeded.Value.SemesterSurveyId);
            // Rút ngắn cả hai đầu: trước đây bị chặn vì mọi lớp đang dùng lịch tổng cũ.
            var newStart = survey.StartTime.AddMinutes(1);
            var newEnd = survey.EndTime.AddDays(-10);
            var result = await serviceFor(Admin).UpdateSemesterSurveyAsync(
                survey.SemesterSurveyId,
                new UpdateSemesterSurveyCommand("Đợt rút ngắn", newStart, newEnd));

            result.Succeeded.Should().BeTrue();
            var sections = await db.CourseSectionSurveys
                .Where(x => x.SemesterSurveyId == survey.SemesterSurveyId)
                .ToListAsync();
            sections.Should().NotBeEmpty();
            sections.Should().OnlyContain(
                x => x.StartTime == newStart && x.EndTime == newEnd,
                "lớp đang dùng lịch tổng phải đổi theo lịch tổng mới");
        });
    }

    [Fact]
    public async Task UpdateSemesterSurvey_CustomSectionSchedules_AreClampedIntoTheNewRange()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 1);
            if (seeded is null) return;

            var survey = await db.SemesterSurveys.SingleAsync(
                x => x.SemesterSurveyId == seeded.Value.SemesterSurveyId);
            var sections = await db.CourseSectionSurveys
                .Where(x => x.SemesterSurveyId == survey.SemesterSurveyId)
                .OrderBy(x => x.CourseSectionSurveyId)
                .ToListAsync();
            if (sections.Count < 3) return;

            var newStart = survey.StartTime.AddDays(2);
            var newEnd = survey.EndTime.AddDays(-5);

            // Lịch riêng thò qua đầu đóng mới: giữ đầu mở, chỉ thu đầu đóng lại.
            var overlapping = sections[0];
            overlapping.StartTime = survey.StartTime.AddDays(3);
            overlapping.EndTime = survey.EndTime.AddDays(-1);
            var keptStart = overlapping.StartTime;

            // Lịch riêng nằm hẳn sau đầu đóng mới: thu lại thì rỗng nên nhận trọn lịch mới.
            var outside = sections[1];
            outside.StartTime = survey.EndTime.AddDays(-2);
            outside.EndTime = survey.EndTime.AddDays(-1);
            await db.SaveChangesAsync();

            var result = await serviceFor(Admin).UpdateSemesterSurveyAsync(
                survey.SemesterSurveyId,
                new UpdateSemesterSurveyCommand(SeededSurveyName, newStart, newEnd));

            result.Succeeded.Should().BeTrue();
            overlapping.StartTime.Should().Be(keptStart);
            overlapping.EndTime.Should().Be(newEnd);
            outside.StartTime.Should().Be(newStart);
            outside.EndTime.Should().Be(newEnd);
            sections.Skip(2).Should().OnlyContain(x => x.StartTime == newStart && x.EndTime == newEnd);
            sections.Should().OnlyContain(
                x => x.StartTime >= newStart && x.EndTime <= newEnd,
                "mọi lớp phải nằm trọn trong lịch tổng mới");
        });
    }

    [Fact]
    public async Task UpdateSemesterSurvey_WhenRangeContainsEverySection_ShouldUpdateNameAndSchedule()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 1);
            if (seeded is null) return;

            var survey = await db.SemesterSurveys.SingleAsync(
                x => x.SemesterSurveyId == seeded.Value.SemesterSurveyId);
            var newStart = survey.StartTime.AddHours(-1);
            var newEnd = survey.EndTime.AddHours(1);
            var result = await serviceFor(Admin).UpdateSemesterSurveyAsync(
                survey.SemesterSurveyId,
                new UpdateSemesterSurveyCommand("Đợt đã chỉnh sửa", newStart, newEnd));

            result.Succeeded.Should().BeTrue();
            result.Value!.SurveyName.Should().Be("Đợt đã chỉnh sửa");
            result.Value.StartTime.Should().Be(newStart);
            result.Value.EndTime.Should().Be(newEnd);
        });
    }

    [Fact]
    public async Task UpdateSectionSchedule_WhenOutsideSemesterSurvey_ShouldBeRejected()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 1);
            if (seeded is null) return;

            var survey = await db.SemesterSurveys.SingleAsync(
                x => x.SemesterSurveyId == seeded.Value.SemesterSurveyId);
            var section = await db.CourseSectionSurveys.FirstAsync(
                x => x.SemesterSurveyId == survey.SemesterSurveyId);
            var result = await serviceFor(Admin).UpdateCourseSectionSurveyScheduleAsync(
                section.CourseSectionSurveyId,
                new SaveSurveyScheduleCommand(
                    survey.StartTime.AddMinutes(-1),
                    survey.EndTime));

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(
                SurveyErrorCodes.SectionScheduleOutsideSemesterSurvey);
        });
    }

    [Fact]
    public async Task UpdateSectionSchedule_ByDepartmentManager_ShouldBeRejected()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 1);
            if (seeded is null) return;
            var section = await db.CourseSectionSurveys.FirstAsync(
                x => x.SemesterSurveyId == seeded.Value.SemesterSurveyId);

            var result = await serviceFor(ManagerOf(seeded.Value.Slice.DepartmentId))
                .UpdateCourseSectionSurveyScheduleAsync(
                    section.CourseSectionSurveyId,
                    new SaveSurveyScheduleCommand(section.StartTime, section.EndTime));

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(SurveyErrorCodes.OutOfScope);
        });
    }

    [Fact]
    public async Task AddSections_WhenScheduleIsOutsideSemesterSurvey_ShouldBeRejected()
    {
        await RunInRollbackAsync(async (db, serviceFor) =>
        {
            var seeded = await SeedDepartmentScopedSurveyAsync(db, 1);
            if (seeded is null) return;
            var (semesterSurveyId, slice, _) = seeded.Value;
            var survey = await db.SemesterSurveys.SingleAsync(
                x => x.SemesterSurveyId == semesterSurveyId);

            var result = await serviceFor(Admin).AddSectionsToSemesterSurveyAsync(
                semesterSurveyId,
                new AddSectionsToSemesterSurveyCommand(
                    SurveyScopeTypes.Department,
                    slice.DepartmentId,
                    survey.StartTime,
                    survey.EndTime.AddMinutes(1)));

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(
                SurveyErrorCodes.SectionScheduleOutsideSemesterSurvey);
        });
    }
}
