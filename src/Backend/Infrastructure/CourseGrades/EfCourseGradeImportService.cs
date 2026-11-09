using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Application;
using Application.Auth;
using Application.Catalog;
using Application.CourseGrades;
using DocumentFormat.OpenXml.Packaging;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace Infrastructure.CourseGrades;

/// <summary>
/// Nạp file "Điểm học tập của SV theo kỳ" vào kỳ người dùng chọn, giống trang Lớp học phần.
///
/// Hai bước theo mẫu module tốt nghiệp: xem trước (chỉ đọc, trả số đếm) rồi xác nhận (gửi lại
/// đúng file đó, so mã băm). Không giữ file hay bản đọc tạm ở đâu cả. Điểm được mã hóa từng ô
/// trước khi ghi; mã lỗi và thông điệp không bao giờ chứa giá trị của dòng điểm nào.
/// </summary>
public sealed partial class EfCourseGradeImportService(
    AppDbContext db,
    IGradeCipher cipher,
    ICurrentUserAccessor currentUser,
    IUserScopeResolver userScope) : ICourseGradeImportService
{
    private const long MaxFileBytes = 50L * 1024 * 1024;
    private const int MaxListedItems = 200;

    // ------------------------------------------------------------------ đọc và đối soát

    private sealed record SectionInfo(int CourseSectionId, string CourseCode, string CourseName, string SectionName);

    private sealed record ImportAnalysis(
        int SemesterId,
        string SemesterLabel,
        string FileName,
        string SheetName,
        string FileHash,
        GradeRuleAResult Rules,
        IReadOnlyList<GradeRuleARow> StorableRows,
        IReadOnlyDictionary<int, int> SectionIdByRow,
        IReadOnlyDictionary<string, long> ExistingStudentIds,
        IReadOnlyList<CourseGradeMissingSectionDto> MissingSections,
        IReadOnlyList<string> SectionsWithoutGrades,
        IReadOnlyList<string> Warnings,
        int UnreadableRowCount);

    public async Task<CourseGradeImportPreviewDto> PreviewAsync(
        int semesterId, string fileName, Stream content, CancellationToken cancellationToken = default)
    {
        await EnsureCanWriteAsync(cancellationToken);
        var analysis = await AnalyzeAsync(semesterId, fileName, content, cancellationToken);
        var activeRevisionId = await db.GradeImportRevisions.AsNoTracking()
            .Where(x => x.SemesterId == semesterId && x.IsActive)
            .Select(x => (long?)x.RevisionId)
            .SingleOrDefaultAsync(cancellationToken);
        return ToPreview(analysis, activeRevisionId);
    }

    private async Task<ImportAnalysis> AnalyzeAsync(
        int semesterId, string fileName, Stream content, CancellationToken cancellationToken)
    {
        var semester = await (
            from s in db.Semesters.AsNoTracking()
            join y in db.AcademicYears.AsNoTracking() on s.AcademicYearId equals y.AcademicYearId
            where s.SemesterId == semesterId
            select new { s.SemesterName, y.AcademicYearName })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new CourseGradeException(CourseGradeErrorCodes.SemesterNotFound, "Không tìm thấy học kỳ đã chọn.");
        var semesterLabel = $"{semester.SemesterName} {semester.AcademicYearName}";

        var sections = await (
            from section in db.CourseSections.AsNoTracking()
            join course in db.Courses.AsNoTracking() on section.CourseId equals course.CourseId
            where section.SemesterId == semesterId
            select new SectionInfo(section.CourseSectionId, course.CourseCode, course.CourseName, section.SectionName))
            .ToListAsync(cancellationToken);
        if (sections.Count == 0)
        {
            throw new CourseGradeException(
                CourseGradeErrorCodes.SemesterHasNoSections,
                $"{semesterLabel} chưa có lớp học phần nào. Hãy nạp file danh sách lớp của kỳ này ở trang Lớp học phần trước, rồi mới nạp điểm.");
        }

        // File chỉ xử lý trong bộ nhớ: không ghi tệp tạm.
        await using var buffer = new MemoryStream();
        await CopyLimitedAsync(content, buffer, cancellationToken);
        var fileHash = Convert.ToHexString(SHA256.HashData(buffer.ToArray()));
        buffer.Position = 0;

        GradeRuleAResult rules;
        string sheetName;
        try
        {
            using var document = SpreadsheetDocument.Open(buffer, false);
            var sheet = GradeWorkbookReader.ReadFirstSheet(document);
            var missingColumns = GradeRuleA.RequiredColumns.Where(c => !sheet.Headers.Contains(c)).ToList();
            if (missingColumns.Count > 0)
            {
                throw new CourseGradeException(
                    CourseGradeErrorCodes.InvalidImport,
                    "File điểm thiếu cột: " + string.Join(", ", missingColumns) + ". Hãy dùng đúng file \"Điểm học tập của SV theo kỳ\".");
            }
            sheetName = sheet.SheetName;
            rules = GradeRuleA.Process(sheet.Rows);
        }
        catch (Exception exception) when (exception is OpenXmlPackageException or InvalidDataException or FileFormatException)
        {
            throw new CourseGradeException(CourseGradeErrorCodes.InvalidImport, "Không đọc được file Excel. Hãy kiểm tra file có đúng định dạng .xlsx và không đặt mật khẩu.");
        }

        // Dòng vượt độ dài cột của bảng (mã SV, mã HP) coi như không đọc được.
        var storable = rules.Rows
            .Where(r => r.StudentCode.Length <= 16 && r.CourseCode.Length <= 16)
            .ToList();
        var oversized = rules.Rows.Count - storable.Count;

        // Ghép (f_mamh, f_loptc) với (Mã HP, Nhóm) của kỳ (bộ luật B mục 5).
        var sectionByKey = new Dictionary<(string, string), SectionInfo>();
        foreach (var section in sections)
        {
            sectionByKey[(Key(section.CourseCode), Key(section.SectionName))] = section;
        }

        var sectionIdByRow = new Dictionary<int, int>();
        var matchedRows = new Dictionary<int, int>();
        var missing = new Dictionary<(string Code, string? Section), (string? Name, int Count)>();
        foreach (var row in storable)
        {
            if (row.SectionName is not null
                && sectionByKey.TryGetValue((Key(row.CourseCode), Key(row.SectionName)), out var section))
            {
                sectionIdByRow[row.RowNumber] = section.CourseSectionId;
                if (row.ExclusionRule is null)
                {
                    matchedRows[section.CourseSectionId] = matchedRows.GetValueOrDefault(section.CourseSectionId) + 1;
                }
            }
            else if (row.ExclusionRule is null)
            {
                // B-G1 (và B-G4 khi nhóm rỗng): lớp có điểm nhưng không có trong file lớp.
                var key = (row.CourseCode, row.SectionName);
                var current = missing.GetValueOrDefault(key);
                missing[key] = (current.Name ?? row.CourseName, current.Count + 1);
            }
        }

        var missingSections = missing
            .OrderByDescending(x => x.Value.Count)
            .Select(x => new CourseGradeMissingSectionDto(x.Key.Code, x.Key.Section, x.Value.Name, x.Value.Count))
            .ToList();

        // B-G2: lớp có trong file lớp nhưng chưa có dòng điểm nào. Chỉ xét lớp thuộc phạm vi
        // phân tích (bỏ B-L1–B-L4), giống bản Python.
        var sectionsWithoutGrades = sections
            .Where(s => CourseSectionImportRules.AnalysisExclusionReason(s.CourseCode, s.CourseName) is null)
            .Where(s => !matchedRows.ContainsKey(s.CourseSectionId))
            .OrderBy(s => s.CourseName).ThenBy(s => s.SectionName)
            .Select(s => $"{s.CourseName} – {s.SectionName}")
            .ToList();

        var codes = storable.Select(r => r.StudentCode).Distinct(StringComparer.Ordinal).ToList();
        var existing = await db.Students.IgnoreQueryFilters().AsNoTracking()
            .Where(s => codes.Contains(s.StudentCode))
            .Select(s => new { s.StudentCode, s.StudentId, s.FullName })
            .ToListAsync(cancellationToken);
        var existingIds = existing.ToDictionary(x => x.StudentCode, x => x.StudentId, StringComparer.Ordinal);

        var warnings = new List<string>();
        var unreadable = rules.UnreadableRowNumbers.Count + oversized;
        if (unreadable > 0)
        {
            warnings.Add($"{unreadable} dòng không đọc được (thiếu mã sinh viên, mã học phần hoặc ô điểm không phải số) và sẽ không được lưu.");
        }

        var nameByCode = storable
            .Where(r => r.StudentName is not null)
            .GroupBy(r => r.StudentCode, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.First().StudentName!, StringComparer.Ordinal);
        var renamed = existing.Count(x => nameByCode.TryGetValue(x.StudentCode, out var name)
            && !string.Equals(name, x.FullName, StringComparison.Ordinal));
        if (renamed > 0)
        {
            warnings.Add($"{renamed} sinh viên đã có trong hệ thống nhưng họ tên trong file khác. Họ tên đang lưu được giữ nguyên.");
        }

        return new ImportAnalysis(
            semesterId,
            semesterLabel,
            Path.GetFileName(fileName),
            sheetName,
            fileHash,
            rules,
            storable,
            sectionIdByRow,
            existingIds,
            missingSections,
            sectionsWithoutGrades,
            warnings,
            unreadable);
    }

    private static CourseGradeImportPreviewDto ToPreview(ImportAnalysis analysis, long? activeRevisionId)
    {
        var usable = analysis.StorableRows.Where(r => r.ExclusionRule is null).ToList();
        return new CourseGradeImportPreviewDto(
            analysis.SemesterId,
            analysis.SemesterLabel,
            analysis.FileName,
            analysis.SheetName,
            analysis.FileHash,
            analysis.Rules.SourceRowCount,
            usable.Count,
            usable.Count(r => analysis.SectionIdByRow.ContainsKey(r.RowNumber)),
            analysis.StorableRows.Select(r => r.StudentCode).Distinct(StringComparer.Ordinal).Count(),
            analysis.StorableRows.Select(r => r.StudentCode).Distinct(StringComparer.Ordinal)
                .Count(code => !analysis.ExistingStudentIds.ContainsKey(code)),
            ExcludedSummary(analysis),
            analysis.MissingSections.Count,
            analysis.MissingSections.Sum(x => x.RowCount),
            analysis.MissingSections.Take(MaxListedItems).ToList(),
            analysis.SectionsWithoutGrades.Count,
            analysis.SectionsWithoutGrades.Take(MaxListedItems).ToList(),
            analysis.Warnings,
            activeRevisionId);
    }

    private static List<CourseGradeRuleCountDto> ExcludedSummary(ImportAnalysis analysis)
    {
        var counts = new Dictionary<string, int>(analysis.Rules.ExcludedCounts);
        var oversized = analysis.UnreadableRowCount - analysis.Rules.UnreadableRowNumbers.Count;
        if (oversized > 0)
        {
            counts[GradeRuleA.UnreadableRule] = counts.GetValueOrDefault(GradeRuleA.UnreadableRule) + oversized;
        }
        return GradeRuleA.RuleDescriptions
            .Where(rule => counts.GetValueOrDefault(rule.Key) > 0)
            .Select(rule => new CourseGradeRuleCountDto(rule.Key, rule.Value, counts[rule.Key]))
            .ToList();
    }

    // ------------------------------------------------------------------ xác nhận nạp

    public async Task<CourseGradeImportResultDto> ImportAsync(
        CourseGradeImportCommand command, CancellationToken cancellationToken = default)
    {
        await EnsureCanWriteAsync(cancellationToken);
        var analysis = await AnalyzeAsync(command.SemesterId, command.FileName, command.Content, cancellationToken);
        if (!string.Equals(analysis.FileHash, command.PreviewFileHash, StringComparison.OrdinalIgnoreCase))
        {
            throw new CourseGradeException(
                CourseGradeErrorCodes.PreviewMismatch,
                "File xác nhận không trùng với file đã xem trước. Hãy xem trước lại rồi mới xác nhận.");
        }

        var (actorId, actorName) = Actor();
        var now = DateTime.UtcNow;

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var active = await db.GradeImportRevisions
            .SingleOrDefaultAsync(x => x.SemesterId == command.SemesterId && x.IsActive, cancellationToken);
        if (active?.RevisionId != command.ExpectedActiveRevisionId)
        {
            throw new CourseGradeException(
                CourseGradeErrorCodes.ConcurrentReplace,
                "Điểm của kỳ này vừa được người khác cập nhật. Hãy xem trước lại rồi mới xác nhận.");
        }
        if (active is not null && string.IsNullOrWhiteSpace(command.ReplaceReason))
        {
            throw new CourseGradeException(
                CourseGradeErrorCodes.ReplaceReasonRequired,
                "Kỳ này đã có điểm. Phải nhập lý do khi nạp lại.");
        }

        var studentIds = await UpsertStudentsAsync(analysis, now, cancellationToken);

        var revisionNumber = 1 + await db.GradeImportRevisions
            .Where(x => x.SemesterId == command.SemesterId)
            .MaxAsync(x => (int?)x.RevisionNumber, cancellationToken) ?? 1;
        var storableCount = analysis.StorableRows.Count(r => r.ExclusionRule is null);
        var revision = new GradeImportRevision
        {
            SemesterId = command.SemesterId,
            RevisionNumber = revisionNumber,
            IsActive = false,
            OriginalFileName = Truncate(analysis.FileName, 255)!,
            SourceSheetName = Truncate(analysis.SheetName, 100)!,
            FileHash = analysis.FileHash,
            SourceRowCount = analysis.Rules.SourceRowCount,
            ImportedRowCount = storableCount,
            SkippedRowCount = analysis.Rules.SourceRowCount - storableCount,
            SkippedSummaryJson = JsonSerializer.Serialize(
                ExcludedSummary(analysis).ToDictionary(x => x.Rule, x => x.Count)),
            ReconciliationJson = JsonSerializer.Serialize(new
            {
                missingSectionCount = analysis.MissingSections.Count,
                missingSectionRowCount = analysis.MissingSections.Sum(x => x.RowCount),
                missingSections = analysis.MissingSections.Take(MaxListedItems),
                sectionsWithoutGradesCount = analysis.SectionsWithoutGrades.Count,
                sectionsWithoutGrades = analysis.SectionsWithoutGrades.Take(MaxListedItems),
            }),
            WarningsJson = JsonSerializer.Serialize(analysis.Warnings),
            RuleVersion = GradeRuleA.RuleVersion,
            ImportedAtUtc = now,
            ImportedByUserId = actorId,
            ImportedByName = actorName,
            ReplaceReason = Truncate(command.ReplaceReason?.Trim(), 1000),
            ReplacedRevisionId = active?.RevisionId,
        };
        db.GradeImportRevisions.Add(revision);
        await db.SaveChangesAsync(cancellationToken);

        await CopyGradesAsync(analysis, revision.RevisionId, studentIds, cancellationToken);

        // Đổi lần nạp đang dùng: tắt lần cũ trước, vì chỉ mục duy nhất kiểm tra ngay từng lệnh.
        if (active is not null)
        {
            active.IsActive = false;
            await db.SaveChangesAsync(cancellationToken);
            // Điểm là dữ liệu cá nhân: xóa hẳn dòng của lần cũ, chỉ giữ lịch sử lần nạp.
            await db.StudentCourseGrades
                .Where(x => x.RevisionId == active.RevisionId)
                .ExecuteDeleteAsync(cancellationToken);
        }
        revision.IsActive = true;
        await db.SaveChangesAsync(cancellationToken);

        var run = await GradeAnalysisRunQueue.QueueAsync(db, GradeAnalysisRunTriggers.Import, actorId, now, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new CourseGradeImportResultDto(
            revision.RevisionId,
            revision.RevisionNumber,
            revision.SemesterId,
            revision.ImportedRowCount,
            revision.SkippedRowCount,
            analysis.StorableRows.Select(r => r.StudentCode).Distinct(StringComparer.Ordinal)
                .Count(code => !analysis.ExistingStudentIds.ContainsKey(code)),
            run.RunId);
    }

    private async Task<Dictionary<string, long>> UpsertStudentsAsync(
        ImportAnalysis analysis, DateTime now, CancellationToken cancellationToken)
    {
        var classes = await LoadClassLookupAsync(cancellationToken);
        var firstRowByCode = analysis.StorableRows
            .GroupBy(r => r.StudentCode, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);

        var codes = firstRowByCode.Keys.ToList();
        var tracked = await db.Students.IgnoreQueryFilters()
            .Where(s => codes.Contains(s.StudentCode))
            .ToDictionaryAsync(s => s.StudentCode, StringComparer.Ordinal, cancellationToken);

        foreach (var (code, row) in firstRowByCode)
        {
            var classCode = Truncate(row.AdministrativeClassCode, 32);
            var placement = classes.Resolve(classCode);
            if (!tracked.TryGetValue(code, out var student))
            {
                student = new Student
                {
                    StudentCode = code,
                    FullName = Truncate(row.StudentName, 200) ?? string.Empty,
                    CreatedAtUtc = now,
                };
                db.Students.Add(student);
                tracked[code] = student;
            }
            else if (string.Equals(student.AdministrativeClassCode, classCode, StringComparison.Ordinal))
            {
                continue;
            }

            // Họ tên đã lưu không bị ghi đè; lớp hành chính, khóa, ngành theo file mới nhất.
            student.AdministrativeClassCode = classCode;
            student.CohortId = placement.CohortId ?? student.CohortId;
            student.MajorId = placement.MajorId ?? student.MajorId;
            student.FacultyId = placement.FacultyId ?? student.FacultyId;
            student.UpdatedAtUtc = now;
        }

        await db.SaveChangesAsync(cancellationToken);
        return tracked.ToDictionary(x => x.Key, x => x.Value.StudentId, StringComparer.Ordinal);
    }

    private async Task CopyGradesAsync(
        ImportAnalysis analysis,
        long revisionId,
        IReadOnlyDictionary<string, long> studentIds,
        CancellationToken cancellationToken)
    {
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await using var importer = await connection.BeginBinaryImportAsync(
            """
            COPY "StudentCourseGrades" (
                "RevisionId", "SemesterId", "StudentId", "CourseSectionId", "SourceRowNumber",
                "SourceTermCode", "CourseCode", "CourseName", "SectionName",
                "AcademicYearText", "TermText", "ExamRound", "NoteCode",
                "Component1Enc", "Component2Enc", "Component3Enc", "ExamScoreEnc", "OfficialTotalEnc",
                "XEnc", "YEnc", "ZEnc", "ExclusionRule", "KeyVersion")
            FROM STDIN (FORMAT BINARY)
            """,
            cancellationToken);

        var keyVersion = cipher.ActiveKeyVersion;
        foreach (var row in analysis.StorableRows)
        {
            var studentId = studentIds[row.StudentCode];
            GradeCellContext Cell(string column) => new(revisionId, studentId, row.CourseCode, row.RowNumber, column);
            byte[]? Encrypt(decimal? value, string column) => value is { } v ? cipher.Encrypt(v, Cell(column)) : null;

            await importer.StartRowAsync(cancellationToken);
            await importer.WriteAsync(revisionId, NpgsqlDbType.Bigint, cancellationToken);
            await importer.WriteAsync(analysis.SemesterId, NpgsqlDbType.Integer, cancellationToken);
            await importer.WriteAsync(studentId, NpgsqlDbType.Bigint, cancellationToken);
            if (analysis.SectionIdByRow.TryGetValue(row.RowNumber, out var sectionId))
            {
                await importer.WriteAsync(sectionId, NpgsqlDbType.Integer, cancellationToken);
            }
            else
            {
                await importer.WriteNullAsync(cancellationToken);
            }
            await importer.WriteAsync(row.RowNumber, NpgsqlDbType.Integer, cancellationToken);
            await WriteNullableAsync(importer, Truncate(row.TermCode, 10), NpgsqlDbType.Varchar, cancellationToken);
            await importer.WriteAsync(row.CourseCode, NpgsqlDbType.Varchar, cancellationToken);
            await WriteNullableAsync(importer, Truncate(row.CourseName, 300), NpgsqlDbType.Varchar, cancellationToken);
            await WriteNullableAsync(importer, Truncate(row.SectionName, 32), NpgsqlDbType.Varchar, cancellationToken);
            await WriteNullableAsync(importer, Truncate(row.AcademicYearText, 20), NpgsqlDbType.Varchar, cancellationToken);
            await WriteNullableAsync(importer, Truncate(row.TermText, 20), NpgsqlDbType.Varchar, cancellationToken);
            await WriteNullableAsync(importer, Truncate(row.ExamRound, 20), NpgsqlDbType.Varchar, cancellationToken);
            await WriteNullableAsync(importer, Truncate(row.NoteCode, 4), NpgsqlDbType.Varchar, cancellationToken);
            await WriteNullableAsync(importer, Encrypt(row.Component1, GradeCellColumns.Component1), NpgsqlDbType.Bytea, cancellationToken);
            await WriteNullableAsync(importer, Encrypt(row.Component2, GradeCellColumns.Component2), NpgsqlDbType.Bytea, cancellationToken);
            await WriteNullableAsync(importer, Encrypt(row.Component3, GradeCellColumns.Component3), NpgsqlDbType.Bytea, cancellationToken);
            await WriteNullableAsync(importer, Encrypt(row.ExamScore, GradeCellColumns.ExamScore), NpgsqlDbType.Bytea, cancellationToken);
            await WriteNullableAsync(importer, Encrypt(row.OfficialTotal, GradeCellColumns.OfficialTotal), NpgsqlDbType.Bytea, cancellationToken);
            await WriteNullableAsync(importer, Encrypt(row.X, GradeCellColumns.X), NpgsqlDbType.Bytea, cancellationToken);
            await WriteNullableAsync(importer, Encrypt(row.Y, GradeCellColumns.Y), NpgsqlDbType.Bytea, cancellationToken);
            await WriteNullableAsync(importer, Encrypt(row.Z, GradeCellColumns.Z), NpgsqlDbType.Bytea, cancellationToken);
            await WriteNullableAsync(importer, row.ExclusionRule, NpgsqlDbType.Varchar, cancellationToken);
            await importer.WriteAsync(keyVersion, NpgsqlDbType.Smallint, cancellationToken);
        }

        await importer.CompleteAsync(cancellationToken);
    }

    private static async Task WriteNullableAsync<T>(
        NpgsqlBinaryImporter importer, T? value, NpgsqlDbType type, CancellationToken cancellationToken)
        where T : class
    {
        if (value is null)
        {
            await importer.WriteNullAsync(cancellationToken);
        }
        else
        {
            await importer.WriteAsync(value, type, cancellationToken);
        }
    }

    // ------------------------------------------------------------------ kỳ đã nạp, gỡ kỳ, lượt tính

    public async Task<IReadOnlyList<CourseGradeSemesterDto>> GetSemestersAsync(CancellationToken cancellationToken = default)
    {
        var rows = await (
            from revision in db.GradeImportRevisions.AsNoTracking()
            join semester in db.Semesters.AsNoTracking() on revision.SemesterId equals semester.SemesterId
            join year in db.AcademicYears.AsNoTracking() on semester.AcademicYearId equals year.AcademicYearId
            where revision.IsActive
            select new { revision, semester.SemesterName, year.AcademicYearName, year.StartDate })
            .ToListAsync(cancellationToken);

        return rows
            .OrderBy(x => x.StartDate)
            .ThenBy(x => SemesterOrdering.PositionInYear(x.SemesterName))
            .Select(x => new CourseGradeSemesterDto(
                x.revision.SemesterId,
                $"{x.SemesterName} {x.AcademicYearName}",
                x.revision.RevisionId,
                x.revision.RevisionNumber,
                x.revision.OriginalFileName,
                x.revision.SourceRowCount,
                x.revision.ImportedRowCount,
                x.revision.SkippedRowCount,
                x.revision.ImportedAtUtc,
                x.revision.ImportedByName))
            .ToList();
    }

    public async Task<GradeAnalysisRunDto> RemoveSemesterAsync(
        int semesterId, string? reason, CancellationToken cancellationToken = default)
    {
        await EnsureCanWriteAsync(cancellationToken);
        var (actorId, actorName) = Actor();
        var now = DateTime.UtcNow;

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var active = await db.GradeImportRevisions
            .SingleOrDefaultAsync(x => x.SemesterId == semesterId && x.IsActive, cancellationToken)
            ?? throw new CourseGradeException(CourseGradeErrorCodes.NothingToRemove, "Kỳ này chưa có điểm để gỡ.");

        active.IsActive = false;
        active.ReplaceReason = Truncate(
            $"Gỡ kỳ bởi {actorName} lúc {now:dd/MM/yyyy HH:mm} (UTC)" + (string.IsNullOrWhiteSpace(reason) ? "" : $": {reason.Trim()}"),
            1000);
        await db.SaveChangesAsync(cancellationToken);
        await db.StudentCourseGrades.Where(x => x.RevisionId == active.RevisionId).ExecuteDeleteAsync(cancellationToken);

        var run = await GradeAnalysisRunQueue.QueueAsync(db, GradeAnalysisRunTriggers.RemoveTerm, actorId, now, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return GradeAnalysisRunMapping.ToDto(run);
    }

    public async Task<GradeAnalysisRunDto> RecomputeAsync(CancellationToken cancellationToken = default)
    {
        await EnsureCanWriteAsync(cancellationToken);
        var (actorId, _) = Actor();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        if (!await db.GradeImportRevisions.AnyAsync(x => x.IsActive, cancellationToken))
        {
            throw new CourseGradeException(CourseGradeErrorCodes.NothingToAnalyze, "Chưa có kỳ nào được nạp điểm để tính.");
        }

        var run = await GradeAnalysisRunQueue.QueueAsync(
            db, GradeAnalysisRunTriggers.Recompute, actorId, DateTime.UtcNow, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return GradeAnalysisRunMapping.ToDto(run);
    }

    public async Task<GradeAnalysisRunDto?> GetLatestRunAsync(CancellationToken cancellationToken = default)
    {
        var run = await db.GradeAnalysisRuns.AsNoTracking()
            .OrderByDescending(x => x.RunId)
            .FirstOrDefaultAsync(cancellationToken);
        return run is null ? null : GradeAnalysisRunMapping.ToDto(run);
    }

    // ------------------------------------------------------------------ tiện ích

    private async Task EnsureCanWriteAsync(CancellationToken cancellationToken)
    {
        // Điểm là dữ liệu toàn trường: chỉ vai trò quản lý toàn trường được ghi, như module tốt nghiệp.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.ManagesEverything)
        {
            throw new CourseGradeException(
                CourseGradeErrorCodes.OutOfScope,
                "Vai trò của bạn không được nạp hay gỡ điểm học phần.");
        }
    }

    private (Guid Id, string Name) Actor() => (
        currentUser.UserId ?? Guid.Empty,
        !string.IsNullOrWhiteSpace(currentUser.UserEmail) ? currentUser.UserEmail.Trim() : "Không xác định");

    private static async Task CopyLimitedAsync(Stream source, Stream destination, CancellationToken cancellationToken)
    {
        var buffer = new byte[81920];
        long total = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
        {
            total += read;
            if (total > MaxFileBytes)
            {
                throw new CourseGradeException(CourseGradeErrorCodes.InvalidImport, "File điểm vượt quá 50 MB.");
            }
            await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
    }

    private static string Key(string value) =>
        (CourseSectionImportRules.NormalizeText(value) ?? string.Empty).ToUpperInvariant();

    private static string? Truncate(string? value, int maxLength) =>
        value is null || value.Length <= maxLength ? value : value[..maxLength];

    // ------------------------------------------------------------------ khóa, ngành từ lớp hành chính

    private sealed record ClassPlacement(int? CohortId, int? MajorId, int? FacultyId);

    private sealed class ClassLookup(
        IReadOnlyDictionary<string, ClassPlacement> byCohortMajorCode,
        IReadOnlyDictionary<string, int> cohortIdByCode)
    {
        /// <summary>
        /// Lớp hành chính (ĐKT66ĐH) có cùng dạng với CohortMajors.CohortMajorCode: khớp thì lấy
        /// đủ khóa, ngành, khoa; không khớp thì chỉ suy khóa từ hai chữ số (Cohorts.CohortCode).
        /// </summary>
        public ClassPlacement Resolve(string? classCode)
        {
            if (string.IsNullOrWhiteSpace(classCode) || CourseSectionImportRules.IsSpreadsheetError(classCode))
            {
                return new ClassPlacement(null, null, null);
            }

            var key = ClassKey(classCode);
            if (byCohortMajorCode.TryGetValue(key, out var placement))
            {
                return placement;
            }

            var match = ClassCodePattern().Match(key);
            return match.Success && cohortIdByCode.TryGetValue(match.Groups["cohort"].Value, out var cohortId)
                ? new ClassPlacement(cohortId, null, null)
                : new ClassPlacement(null, null, null);
        }
    }

    private async Task<ClassLookup> LoadClassLookupAsync(CancellationToken cancellationToken)
    {
        var cohortMajors = await (
            from cohortMajor in db.CohortMajors.AsNoTracking()
            join major in db.Majors.AsNoTracking() on cohortMajor.MajorId equals major.MajorId
            select new { cohortMajor.CohortMajorCode, cohortMajor.CohortId, cohortMajor.MajorId, major.FacultyId })
            .ToListAsync(cancellationToken);
        var byCode = new Dictionary<string, ClassPlacement>(StringComparer.Ordinal);
        foreach (var group in cohortMajors.GroupBy(x => ClassKey(x.CohortMajorCode)))
        {
            // Mã trùng ở nhiều khóa thì không đoán.
            if (group.Count() == 1)
            {
                var entry = group.Single();
                byCode[group.Key] = new ClassPlacement(entry.CohortId, entry.MajorId, entry.FacultyId);
            }
        }

        var cohorts = await db.Cohorts.AsNoTracking()
            .Select(x => new { x.CohortId, x.CohortCode })
            .ToListAsync(cancellationToken);
        var cohortIdByCode = cohorts
            .GroupBy(x => x.CohortCode.Trim().TrimStart('K', 'k'))
            .Where(g => g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single().CohortId, StringComparer.Ordinal);

        return new ClassLookup(byCode, cohortIdByCode);
    }

    private static string ClassKey(string value) =>
        ClassSeparator().Replace(CourseSectionImportRules.NormalizeText(value) ?? string.Empty, string.Empty)
            .ToUpperInvariant();

    [GeneratedRegex(@"[\s\-_.\/]+")]
    private static partial Regex ClassSeparator();

    [GeneratedRegex(@"^(?<program>\p{L}{2,10})(?<cohort>\d{2})\p{L}{2}\d{0,2}$")]
    private static partial Regex ClassCodePattern();
}
