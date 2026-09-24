namespace UnitTests.InfrastructureTests;

using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Lớp chưa gắn được mã giảng viên vẫn có tên người dạy đọc từ tệp import. Các trang
/// của Thống kê &amp; Báo cáo phải hiện đúng tên đó chứ không ghi "Chưa phân công".
///
/// Chạy trên cơ sở dữ liệu thật, chỉ đọc. Không đặt biến môi trường
/// <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class ReportLecturerNameTests
{
    private sealed record UnidentifiedSection(
        int CourseSectionSurveyId,
        int SemesterSurveyId,
        int SemesterId,
        string LecturerName);

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunAsync(Func<AppDbContext, EfReportService, Task> body)
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

        await body(db, new EfReportService(
            db,
            cache,
            new SchoolOverviewCacheVersion(),
            new FixedScoringThresholdProvider(),
            new PublishedSurveyPublicationService(),
            new FixedUserScopeResolver()));
    }

    /// <summary>Một bài khảo sát của lớp chưa gắn mã giảng viên nhưng có tên từ tệp import.</summary>
    private static async Task<UnidentifiedSection?> UnidentifiedSectionAsync(AppDbContext db)
    {
        var row = await (
            from sectionSurvey in db.CourseSectionSurveys
            join section in db.CourseSections on sectionSurvey.CourseSectionId equals section.CourseSectionId
            join semesterSurvey in db.SemesterSurveys on sectionSurvey.SemesterSurveyId equals semesterSurvey.SemesterSurveyId
            where section.LecturerId == null
                && section.UnidentifiedLecturerName != null
                && section.UnidentifiedLecturerName != string.Empty
            orderby sectionSurvey.CourseSectionSurveyId
            select new
            {
                sectionSurvey.CourseSectionSurveyId,
                sectionSurvey.SemesterSurveyId,
                semesterSurvey.SemesterId,
                section.UnidentifiedLecturerName,
            })
            .FirstOrDefaultAsync();

        return row is null
            ? null
            : new UnidentifiedSection(
                row.CourseSectionSurveyId,
                row.SemesterSurveyId,
                row.SemesterId,
                row.UnidentifiedLecturerName!.Trim());
    }

    [Fact]
    public async Task BangTraCuuChiTiet_HienTenGiangVienChuaXacDinh()
    {
        await RunAsync(async (db, service) =>
        {
            var sample = await UnidentifiedSectionAsync(db);
            if (sample is null) return;

            var results = await service.GetSurveyResultsAsync(
                semesterId: null,
                facultyId: null,
                departmentId: null,
                lecturerId: null,
                semesterSurveyId: sample.SemesterSurveyId,
                search: null);

            var row = results.Single(x => x.CourseSectionSurveyId == sample.CourseSectionSurveyId);
            row.LecturerName.Should().Be(sample.LecturerName);
            // Không có mã giảng viên nên giao diện không mở báo cáo cá nhân.
            row.LecturerId.Should().Be(0);
        });
    }

    [Fact]
    public async Task TimTheoTenGiangVienChuaXacDinh_RaDungLop()
    {
        await RunAsync(async (db, service) =>
        {
            var sample = await UnidentifiedSectionAsync(db);
            if (sample is null) return;

            var results = await service.GetSurveyResultsAsync(
                semesterId: null,
                facultyId: null,
                departmentId: null,
                lecturerId: null,
                semesterSurveyId: sample.SemesterSurveyId,
                search: sample.LecturerName);

            results.Should().Contain(x => x.CourseSectionSurveyId == sample.CourseSectionSurveyId);
        });
    }

    [Fact]
    public async Task KetQuaMotLop_HienTenGiangVienChuaXacDinh()
    {
        await RunAsync(async (db, service) =>
        {
            var sample = await UnidentifiedSectionAsync(db);
            if (sample is null) return;

            var analysis = await service.GetSectionSurveyAnalysisAsync(sample.CourseSectionSurveyId);

            analysis.Should().NotBeNull();
            analysis!.LecturerName.Should().Be(sample.LecturerName);
        });
    }

    [Fact]
    public async Task TienDoThuPhieu_HienTenGiangVienChuaXacDinh()
    {
        await RunAsync(async (db, service) =>
        {
            var sample = await UnidentifiedSectionAsync(db);
            if (sample is null) return;

            var report = await service.GetOperationalProgressReportAsync(sample.SemesterId);

            report.Should().NotBeNull();
            report!.SectionDetails
                .Single(x => x.CourseSectionSurveyId == sample.CourseSectionSurveyId)
                .LecturerName.Should().Be(sample.LecturerName);
        });
    }

    [Fact]
    public async Task TrangGiangVienChuaXacDinh_KhopCacLopCungTenCungKhoaTrongBangTraCuu()
    {
        await RunAsync(async (db, service) =>
        {
            var sample = await UnidentifiedSectionAsync(db);
            if (sample is null) return;

            var results = await service.GetSurveyResultsAsync(
                semesterId: sample.SemesterId,
                facultyId: null,
                departmentId: null,
                lecturerId: null,
                semesterSurveyId: null,
                search: null);
            var row = results.Single(x => x.CourseSectionSurveyId == sample.CourseSectionSurveyId);
            row.UnidentifiedLecturerName.Should().Be(sample.LecturerName);

            var report = await service.GetUnidentifiedLecturerReportAsync(
                sample.LecturerName,
                row.FacultyId,
                sample.SemesterId);

            report.Should().NotBeNull();
            report!.LecturerId.Should().Be(0);
            report.FullName.Should().Be(sample.LecturerName);

            // Đúng tập lớp bảng Tra cứu chi tiết cho thấy: cùng tên, cùng khoa/viện — kể
            // cả lớp thuộc bộ môn khác trong khoa, không khoanh theo bộ môn.
            var expected = results
                .Where(x => x.FacultyId == row.FacultyId
                    && string.Equals(x.UnidentifiedLecturerName, sample.LecturerName, StringComparison.OrdinalIgnoreCase))
                .Select(x => x.CourseSectionSurveyId);
            report.Sections.Select(x => x.CourseSectionSurveyId).Should().BeEquivalentTo(expected);
        });
    }

    [Fact]
    public async Task TrangGiangVienChuaXacDinh_TenKhongCoLopNao_TraVeNull()
    {
        await RunAsync(async (_, service) =>
        {
            var report = await service.GetUnidentifiedLecturerReportAsync("Không có người này 0000", null, null);

            report.Should().BeNull();
        });
    }
}
