namespace UnitTests.InfrastructureTests;

using System.Diagnostics;
using Application;
using Application.Auth;
using Application.Catalog;
using Application.CourseGrades;
using ClosedXML.Excel;
using Domain;
using FluentAssertions;
using global::Infrastructure.Catalog;
using global::Infrastructure.CourseGrades;
using global::Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;
using Xunit.Abstractions;

/// <summary>
/// Nạp điểm đầu-cuối trên Postgres thật: đọc file, bộ luật A, ghép lớp, sinh viên, mã hóa, COPY,
/// đổi lần nạp, gỡ kỳ, xếp lượt tính.
///
/// Test GHI THẬT vào CSDL (nạp điểm tự mở transaction nên không bọc rollback được), vì vậy chỉ
/// chạy khi đặt <c>COURSE_GRADE_E2E_CONNECTION</c> trỏ tới một database dùng một lần — không
/// dùng chung biến ConnectionStrings__DefaultConnection để không bao giờ ghi nhầm vào CSDL dev.
/// Phần dữ liệu thật cần thêm <c>COURSE_GRADE_REAL_DATA_DIR</c> (thư mục "Du lieu thật").
/// </summary>
public class CourseGradeImportEndToEndTests(ITestOutputHelper output)
{
    private static readonly string TestKey = Convert.ToBase64String(Enumerable.Range(7, 32).Select(i => (byte)i).ToArray());

    private sealed class FixedScopeResolver : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(UserScope.Unrestricted(RoleCodes.Admin));
    }

    private sealed class TestUser : ICurrentUserAccessor
    {
        public Guid? UserId => null;
        public string? UserEmail => "e2e-test@example.invalid";
        public Guid? ProfileId => null;
    }

    private sealed record Harness(AppDbContext Db, EfCourseGradeImportService Grades, EfCatalogService Catalog, AesGcmGradeCipher Cipher);

    private static async Task RunAsync(Func<Harness, Task> body)
    {
        var connectionString = Environment.GetEnvironmentVariable("COURSE_GRADE_E2E_CONNECTION");
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = connectionString })
            .Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddPersistence(configuration);
        await using var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.SetCommandTimeout(TimeSpan.FromMinutes(5));
        await GradeAnalysisThresholdSeeder.SeedAsync(db);

        var cipher = new AesGcmGradeCipher(Options.Create(new CourseGradeEncryptionOptions
        {
            EncryptionKeys = new Dictionary<string, string> { ["1"] = TestKey },
        }));
        var resolver = new FixedScopeResolver();
        await body(new Harness(
            db,
            new EfCourseGradeImportService(db, cipher, new TestUser(), resolver),
            new EfCatalogService(db, resolver),
            cipher));
    }

    // ------------------------------------------------------------------ file tự dựng

    private static MemoryStream GradeWorkbook(params object?[][] rows)
    {
        string[] columns =
        [
            "f_nhhk", "f_masv", "f_tensv", "f_tenlop", "f_mamh", "f_tenmh", "f_diem1", "f_diem2", "f_diem3",
            "f_diemthi", "f_tbcht", "f_namhoc", "f_hocky", "f_dot", "f_ghichu", "f_loptc",
        ];
        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet("tong hop diem");
        for (var c = 0; c < columns.Length; c++) sheet.Cell(1, c + 1).Value = columns[c].ToUpperInvariant();
        for (var r = 0; r < rows.Length; r++)
        {
            for (var c = 0; c < rows[r].Length; c++)
            {
                sheet.Cell(r + 2, c + 1).Value = rows[r][c] switch
                {
                    null => Blank.Value,
                    double d => d,
                    int i => i,
                    var other => other.ToString(),
                };
            }
        }
        var stream = new MemoryStream();
        workbook.SaveAs(stream);
        stream.Position = 0;
        return stream;
    }

    // f_nhhk, f_masv, f_tensv, f_tenlop, f_mamh, f_tenmh, d1, d2, d3, thi, tbcht, namhoc, hocky, dot, ghichu, loptc
    private static object?[] G(string masv, string mamh, double? d1, double? d2, double? thi, string loptc, string? ghichu = null) =>
        [209812, masv, "Sinh viên thử", "ÐKT98ÐH", mamh, "Học phần thử", d1, d2, null, thi, null, "2098-2099", 1, 1, ghichu, loptc];

    [Fact]
    public async Task SyntheticFile_PreviewCommitReplaceRemove()
    {
        await RunAsync(async h =>
        {
            var tag = Guid.NewGuid().ToString("N")[..6];
            var year = new AcademicYear { AcademicYearName = $"E2E {tag}", StartDate = new DateOnly(2098, 7, 25), EndDate = new DateOnly(2099, 7, 24) };
            h.Db.AcademicYears.Add(year);
            await h.Db.SaveChangesAsync();
            var semester = new Semester { SemesterName = "Học kỳ 1", AcademicYearId = year.AcademicYearId };
            h.Db.Semesters.Add(semester);
            await h.Db.SaveChangesAsync();

            var noSections = () => h.Grades.PreviewAsync(semester.SemesterId, "a.xlsx", GradeWorkbook(G("1", "17591", 7, null, 6, "N01")));
            (await noSections.Should().ThrowAsync<CourseGradeException>()).Which.ErrorCode.Should().Be(CourseGradeErrorCodes.SemesterHasNoSections);

            var code = $"9{tag[..4].Aggregate(0, (a, ch) => a * 7 + ch) % 9000 + 1000}";
            var pe = "27" + code[2..5];
            ImportCourseSectionRowCommand Section(int n, string course, string group) =>
                new(n, course, $"Học phần {course}", group, "3", "40", null, "175", null, null, null);
            var classImport = await h.Catalog.ImportCourseSectionsAsync(semester.SemesterId,
                [Section(1, code, "N01"), Section(2, code, "N02"), Section(3, pe, "N01")]);
            classImport.Value!.CreatedCount.Should().Be(3);

            var sv = Enumerable.Range(1, 3).Select(i => $"E{tag}{i}").ToArray();
            object?[][] rows =
            [
                G(sv[0], code, 6.2, 6.3, 7, "N01"),        // X 6,3 · Y 7 · Z 6,6
                G(sv[1], code, 8, null, 9, "N02"),
                G(sv[1], code, 8, null, 5, "N02"),         // trùng, Y thấp hơn → T
                G(sv[2], code + "9", 7, null, 6, "N01"),   // lớp không có trong file lớp (B-G1)
                G(sv[0], pe, null, null, -1, "N01"),       // L1
            ];

            // Dựng file một lần: ClosedXML ghi dấu thời gian nên mỗi lần lưu là một file khác.
            var fileBytes = GradeWorkbook(rows).ToArray();
            MemoryStream File() => new(fileBytes);

            var preview = await h.Grades.PreviewAsync(semester.SemesterId, "diem.xlsx", File());
            preview.SourceRowCount.Should().Be(5);
            preview.UsableRowCount.Should().Be(3);
            preview.MatchedRowCount.Should().Be(2);
            preview.MissingSectionCount.Should().Be(1);
            preview.MissingSectionRowCount.Should().Be(1);
            preview.SectionsWithoutGradesCount.Should().Be(0, "lớp 27xxx nằm ngoài phạm vi phân tích (B-L2)");
            preview.StudentCount.Should().Be(3);
            preview.NewStudentCount.Should().Be(3);
            preview.ExcludedRows.Select(x => $"{x.Rule}={x.Count}").Should().BeEquivalentTo("L1=1", "T=1");
            preview.ActiveRevisionId.Should().BeNull();

            var tampered = () => h.Grades.ImportAsync(new CourseGradeImportCommand(
                semester.SemesterId, "diem.xlsx", GradeWorkbook(rows[..4]), preview.FileHash, null, null));
            (await tampered.Should().ThrowAsync<CourseGradeException>()).Which.ErrorCode.Should().Be(CourseGradeErrorCodes.PreviewMismatch);

            var first = await h.Grades.ImportAsync(new CourseGradeImportCommand(
                semester.SemesterId, "diem.xlsx", File(), preview.FileHash, null, null));
            first.RevisionNumber.Should().Be(1);
            first.ImportedRowCount.Should().Be(3);
            first.SkippedRowCount.Should().Be(2);
            first.CreatedStudentCount.Should().Be(3);

            var stored = await h.Db.StudentCourseGrades.AsNoTracking().Where(x => x.RevisionId == first.RevisionId).ToListAsync();
            stored.Should().HaveCount(5, "lưu cả dòng bị loại để tính lại khi bộ luật A đổi");
            var inputs = await h.Db.Database
                .SqlQuery<long>($"SELECT \"StudentCourseGradeId\" AS \"Value\" FROM \"GradeAnalysisInputs\" WHERE \"RevisionId\" = {first.RevisionId}")
                .ToListAsync();
            inputs.Should().HaveCount(2, "view chỉ có dòng được dùng và ghép được lớp");

            var firstRow = stored.Single(x => x.SourceRowNumber == 2);
            var aad = new GradeCellContext(first.RevisionId, firstRow.StudentId, firstRow.CourseCode, firstRow.SourceRowNumber, GradeCellColumns.Z);
            h.Cipher.Decrypt(firstRow.ZEnc!, firstRow.KeyVersion, aad).Should().Be(6.6m);
            h.Cipher.Decrypt(firstRow.XEnc!, firstRow.KeyVersion, aad with { Column = GradeCellColumns.X }).Should().Be(6.3m);
            // Kiểm cả dãy byte "6.6" (không phải từng byte): điểm không nằm dạng rõ trong CSDL.
            Convert.ToHexString(firstRow.ZEnc!).Should().NotContain(Convert.ToHexString("6.6"u8.ToArray()));

            var student = await h.Db.Students.AsNoTracking().SingleAsync(x => x.StudentCode == sv[0]);
            student.AdministrativeClassCode.Should().Be("ĐKT98ĐH");

            var run = await h.Grades.GetLatestRunAsync();
            run!.Status.Should().Be("Queued");
            run.SemesterIds.Should().Contain(semester.SemesterId);

            // Nạp lại: phải có lý do, và phải đúng lần nạp đang dùng.
            var preview2 = await h.Grades.PreviewAsync(semester.SemesterId, "diem.xlsx", File());
            preview2.ActiveRevisionId.Should().Be(first.RevisionId);
            var noReason = () => h.Grades.ImportAsync(new CourseGradeImportCommand(
                semester.SemesterId, "diem.xlsx", File(), preview2.FileHash, first.RevisionId, null));
            (await noReason.Should().ThrowAsync<CourseGradeException>()).Which.ErrorCode.Should().Be(CourseGradeErrorCodes.ReplaceReasonRequired);
            var stale = () => h.Grades.ImportAsync(new CourseGradeImportCommand(
                semester.SemesterId, "diem.xlsx", File(), preview2.FileHash, null, "lý do"));
            (await stale.Should().ThrowAsync<CourseGradeException>()).Which.ErrorCode.Should().Be(CourseGradeErrorCodes.ConcurrentReplace);

            var second = await h.Grades.ImportAsync(new CourseGradeImportCommand(
                semester.SemesterId, "diem.xlsx", File(), preview2.FileHash, first.RevisionId, "Phòng Đào tạo gửi lại file"));
            second.RevisionNumber.Should().Be(2);
            second.CreatedStudentCount.Should().Be(0);
            (await h.Db.StudentCourseGrades.CountAsync(x => x.RevisionId == first.RevisionId)).Should().Be(0, "điểm của lần cũ bị xóa hẳn");
            (await h.Db.GradeImportRevisions.SingleAsync(x => x.RevisionId == second.RevisionId)).ReplacedRevisionId.Should().Be(first.RevisionId);

            var removed = await h.Grades.RemoveSemesterAsync(semester.SemesterId, "thử gỡ");
            removed.Trigger.Should().Be(GradeAnalysisRunTriggers.RemoveTerm);
            removed.SemesterIds.Should().NotContain(semester.SemesterId);
            (await h.Db.StudentCourseGrades.CountAsync(x => x.SemesterId == semester.SemesterId)).Should().Be(0);
            (await h.Grades.GetSemestersAsync()).Should().NotContain(x => x.SemesterId == semester.SemesterId);
        });
    }

    // ------------------------------------------------------------------ dữ liệu thật

    public static TheoryData<string, string, string, string, int, int, int, int> RealTerms => new()
    {
        // kỳ điểm, file lớp, năm học, học kỳ, dòng ghép được, lớp thiếu (B-G1), dòng của lớp thiếu, lớp chưa có điểm (B-G2)
        { "2425_HK1", "HocKy1_2425", "2024-2025", "Học kỳ 1", 80353, 16, 1206, 108 },
        { "2425_HK2", "HocKy2_2425", "2024-2025", "Học kỳ 2", 70853, 20, 1367, 44 },
        { "2526_HK1", "HocKy1_2526", "2025-2026", "Học kỳ 1", 88080, 23, 1544, 108 },
        { "2526_HK2", "HocKy2_2526", "2025-2026", "Học kỳ 2", 80535, 24, 2066, 45 },
    };

    [Theory]
    [MemberData(nameof(RealTerms))]
    public async Task RealFiles_ClassThenGrades_MatchPythonReconciliation(
        string term, string classFile, string yearName, string semesterName,
        int matchedRows, int missingSections, int missingRows, int sectionsWithoutGrades)
    {
        var directory = Environment.GetEnvironmentVariable("COURSE_GRADE_REAL_DATA_DIR");
        if (string.IsNullOrWhiteSpace(directory)) return;

        await RunAsync(async h =>
        {
            var semesterId = await (
                from s in h.Db.Semesters
                join y in h.Db.AcademicYears on s.AcademicYearId equals y.AcademicYearId
                where y.AcademicYearName == yearName && s.SemesterName == semesterName
                select s.SemesterId).SingleAsync();

            var watch = Stopwatch.StartNew();
            var classRows = ReadClassFile(Path.Combine(directory, "Danh sach cac lop hoc theo ky", classFile + ".xlsx"));
            var classImport = await h.Catalog.ImportCourseSectionsAsync(semesterId, classRows);
            // Mã BM 272 (Giáo dục thể chất) và 179 không có trong danh mục bộ môn: các lớp đó
            // vẫn bị từ chối như trước, nhưng vốn nằm ngoài phạm vi phân tích (B-L2, B-L4).
            var rowByNumber = classRows.ToDictionary(x => x.RowNumber);
            var departmentErrors = classImport.Value!.Items.Count(x =>
                x.ErrorCode is CatalogErrorCodes.DepartmentNotFound or CatalogErrorCodes.DepartmentCodeInvalid
                && CourseSectionImportRules.AnalysisExclusionReason(
                    rowByNumber[x.RowNumber].CourseCode, rowByNumber[x.RowNumber].CourseName) is null);
            var otherErrors = classImport.Value.Items
                .Where(x => x.ErrorCode is not null and not CatalogErrorCodes.CourseSectionExists)
                .GroupBy(x => x.ErrorCode).Select(g => $"{g.Key}={g.Count()}");
            output.WriteLine($"{term}: file lớp {classRows.Count} dòng, tạo {classImport.Value.CreatedCount}, lỗi khác: {string.Join(", ", otherErrors)} ({watch.Elapsed.TotalSeconds:F1}s)");
            departmentErrors.Should().Be(0, "bộ luật B-T1 phải xử lý được mọi mã bộ môn trong file lớp thật");

            var gradeFile = Path.Combine(directory, "Diem hoc tap cua SV theo ky", term + ".xlsx");
            watch.Restart();
            await using var previewStream = File.OpenRead(gradeFile);
            var preview = await h.Grades.PreviewAsync(semesterId, term + ".xlsx", previewStream);
            output.WriteLine($"{term}: xem trước {watch.Elapsed.TotalSeconds:F1}s");

            preview.MatchedRowCount.Should().Be(matchedRows);
            preview.MissingSectionCount.Should().Be(missingSections);
            preview.MissingSectionRowCount.Should().Be(missingRows);
            preview.SectionsWithoutGradesCount.Should().Be(sectionsWithoutGrades);

            watch.Restart();
            await using var commitStream = File.OpenRead(gradeFile);
            var result = await h.Grades.ImportAsync(new CourseGradeImportCommand(
                semesterId, term + ".xlsx", commitStream, preview.FileHash, preview.ActiveRevisionId,
                preview.ActiveRevisionId is null ? null : "Chạy lại kiểm thử đầu-cuối"));
            output.WriteLine($"{term}: xác nhận {watch.Elapsed.TotalSeconds:F1}s, {result.ImportedRowCount} dòng dùng được, {result.CreatedStudentCount} sinh viên mới");

            var inputCount = await h.Db.Database
                .SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM \"GradeAnalysisInputs\" WHERE \"SemesterId\" = {semesterId}")
                .SingleAsync();
            inputCount.Should().Be(matchedRows, "view đầu vào đúng bằng số dòng ghép được của bản Python");
        });
    }

    /// <summary>Đọc file lớp như trang Lớp học phần gửi lên: mỗi dòng của sheet Thongke thành một lệnh import.</summary>
    private static List<ImportCourseSectionRowCommand> ReadClassFile(string path)
    {
        using var workbook = new XLWorkbook(path);
        var sheet = workbook.Worksheets.TryGetWorksheet("Thongke", out var named) ? named : workbook.Worksheet(1);
        var header = sheet.Row(1).CellsUsed().ToDictionary(c => c.GetString().Trim().ToLowerInvariant(), c => c.Address.ColumnNumber);
        string? Value(IXLRow row, string column) =>
            header.TryGetValue(column, out var index) && !row.Cell(index).IsEmpty() ? row.Cell(index).GetFormattedString() : null;

        return sheet.RowsUsed().Skip(1)
            .Select(row => new ImportCourseSectionRowCommand(
                row.RowNumber(),
                Value(row, "mã hp") ?? string.Empty,
                Value(row, "học phần"),
                Value(row, "nhóm") ?? string.Empty,
                Value(row, "tcht"),
                Value(row, "sĩ số"),
                Value(row, "bộ môn"),
                Value(row, "mã bm"),
                Value(row, "khoa"),
                Value(row, "giảng viên"),
                Value(row, "email")))
            .Where(x => x.CourseCode.Length > 0)
            .ToList();
    }
}
