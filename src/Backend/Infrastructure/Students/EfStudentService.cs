using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Application.Auth;
using Application.Catalog;
using Application.Students;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Students;

/// <summary>
/// Danh mục sinh viên (Danh mục đào tạo → Sinh viên). Sinh viên gắn với khóa ngành đào tạo (lớp hành
/// chính) qua khóa ngoại; khóa, ngành, khoa tra qua khóa ngành. Đọc: mọi vai trò có quyền xem. Nạp danh
/// sách: chỉ vai trò quản lý toàn trường. Nạp hai bước: xem trước rồi xác nhận với mã băm của bản xem
/// trước. Lớp chưa có trong danh mục không tự tạo: dòng bị bỏ qua và báo để người dùng thêm khóa ngành.
/// </summary>
public sealed partial class EfStudentService(AppDbContext db, IUserScopeResolver userScope) : IStudentService
{
    public const int MaxImportRows = 40_000;
    private const int MaxIssues = 300;
    private const string NoCohort = "Chưa có khóa ngành";

    public async Task<StudentListDto> ListAsync(int? cohortId, bool unassigned, CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (scope.SeesNothing)
        {
            throw new StudentException(StudentErrorCodes.OutOfScope, "Vai trò của bạn không được xem danh sách sinh viên.");
        }

        // Số sinh viên theo khóa (qua khóa ngành); khóa mới nhất lên trước.
        var counts = await (
            from student in db.Students.AsNoTracking()
            join cm in db.CohortMajors.IgnoreQueryFilters().AsNoTracking() on student.CohortMajorId equals cm.CohortMajorId into cmJoin
            from cm in cmJoin.DefaultIfEmpty()
            group student by cm != null ? (int?)cm.CohortId : null into g
            select new { CohortId = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var cohortInfo = await db.Cohorts.IgnoreQueryFilters().AsNoTracking()
            .ToDictionaryAsync(x => x.CohortId, x => new { x.CohortName, x.CohortCode }, cancellationToken);
        var cohorts = counts
            .OrderByDescending(x => x.CohortId.HasValue)
            .ThenByDescending(x => x.CohortId is { } id && cohortInfo.TryGetValue(id, out var c) ? CohortNumber(c.CohortCode) : 0)
            .Select(x => new StudentCohortCountDto(
                x.CohortId,
                x.CohortId is { } id ? cohortInfo.GetValueOrDefault(id)?.CohortName ?? $"Khóa #{id}" : NoCohort,
                x.Count))
            .ToList();

        var students = await (
            from student in db.Students.AsNoTracking()
            join cm in db.CohortMajors.IgnoreQueryFilters().AsNoTracking() on student.CohortMajorId equals cm.CohortMajorId into cmJoin
            from cm in cmJoin.DefaultIfEmpty()
            join cohort in db.Cohorts.IgnoreQueryFilters().AsNoTracking() on cm.CohortId equals cohort.CohortId into cohortJoin
            from cohort in cohortJoin.DefaultIfEmpty()
            join major in db.Majors.IgnoreQueryFilters().AsNoTracking() on cm.MajorId equals major.MajorId into majorJoin
            from major in majorJoin.DefaultIfEmpty()
            join faculty in db.Faculties.IgnoreQueryFilters().AsNoTracking() on major.FacultyId equals faculty.FacultyId into facultyJoin
            from faculty in facultyJoin.DefaultIfEmpty()
            where unassigned ? student.CohortMajorId == null : cohortId == null || (cm != null && cm.CohortId == cohortId)
            orderby student.StudentCode
            select new StudentDto(
                student.StudentId,
                student.StudentCode,
                student.FullName,
                student.CohortMajorId,
                cm != null ? cm.CohortMajorCode : null,
                cm != null ? cm.CohortId : null,
                cohort != null ? cohort.CohortName : null,
                major != null ? major.MajorName : null,
                faculty != null ? faculty.FacultyName : null,
                student.Email,
                student.PhoneNumber,
                student.DateOfBirth,
                student.Gender,
                student.StudyStatus))
            .ToListAsync(cancellationToken);

        return new StudentListDto(scope.ManagesEverything, cohorts, students);
    }

    public async Task<StudentImportPreviewDto> PreviewImportAsync(StudentImportRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureCanWriteAsync(cancellationToken);
        var plan = await PlanAsync(request, cancellationToken);
        return plan.Preview;
    }

    public async Task<StudentImportResultDto> ImportAsync(StudentImportRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureCanWriteAsync(cancellationToken);
        var plan = await PlanAsync(request, cancellationToken);
        if (!string.IsNullOrEmpty(request.PreviewHash) && !string.Equals(request.PreviewHash, plan.Preview.PreviewHash, StringComparison.Ordinal))
        {
            throw new StudentException(StudentErrorCodes.PreviewMismatch,
                "Dữ liệu khác với bản đã xem trước (file hoặc danh mục vừa thay đổi). Hãy xem trước lại.");
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var codes = plan.Rows.Select(r => r.Code).ToList();
        var tracked = await db.Students.IgnoreQueryFilters()
            .Where(s => codes.Contains(s.StudentCode))
            .ToDictionaryAsync(s => s.StudentCode, StringComparer.Ordinal, cancellationToken);

        int created = 0, updated = 0, unchanged = 0;
        foreach (var row in plan.Rows)
        {
            if (!tracked.TryGetValue(row.Code, out var student))
            {
                student = new Student { StudentCode = row.Code, CreatedAtUtc = now };
                Apply(student, row);
                student.UpdatedAtUtc = now;
                db.Students.Add(student);
                created++;
                continue;
            }

            if (Apply(student, row))
            {
                student.UpdatedAtUtc = now;
                updated++;
            }
            else
            {
                unchanged++;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new StudentImportResultDto(created, updated, unchanged, plan.Preview.ErrorCount);
    }

    // ------------------------------------------------------------------ kiểm tra và đối chiếu

    private sealed record PlannedRow(
        string? SheetName,
        int RowNumber,
        string Code,
        string FullName,
        int CohortMajorId,
        DateOnly? DateOfBirth,
        string? Gender,
        string? Email,
        string? PhoneNumber,
        string? StudyStatus);

    private sealed record Plan(IReadOnlyList<PlannedRow> Rows, StudentImportPreviewDto Preview);

    private async Task<Plan> PlanAsync(StudentImportRequest request, CancellationToken cancellationToken)
    {
        var rows = request.Rows ?? [];
        if (rows.Count == 0)
        {
            throw new StudentException(StudentErrorCodes.InvalidImport, "File không có dòng sinh viên nào.");
        }
        if (rows.Count > MaxImportRows)
        {
            throw new StudentException(StudentErrorCodes.InvalidImport,
                $"Mỗi lần nạp tối đa {MaxImportRows:N0} sinh viên; hãy chọn bớt sheet (khóa).");
        }

        var cohortMajors = await CohortMajorLookup.LoadAsync(db, cancellationToken);
        var cohortNameByCohortMajor = await (
            from cm in db.CohortMajors.AsNoTracking()
            join cohort in db.Cohorts.IgnoreQueryFilters().AsNoTracking() on cm.CohortId equals cohort.CohortId
            select new { cm.CohortMajorId, cohort.CohortName })
            .ToDictionaryAsync(x => x.CohortMajorId, x => x.CohortName, cancellationToken);

        var errors = new List<StudentImportIssueDto>();
        var warnings = new List<StudentImportIssueDto>();
        var missing = new Dictionary<string, int>(StringComparer.Ordinal);
        var errorCount = 0;
        void Error(StudentImportRow r, string? code, string message)
        {
            errorCount++;
            if (errors.Count < MaxIssues) errors.Add(new StudentImportIssueDto(r.SheetName, r.RowNumber, code, message));
        }

        var planned = new List<PlannedRow>();
        var seen = new Dictionary<string, StudentImportRow>(StringComparer.Ordinal);
        foreach (var r in rows)
        {
            var code = (r.StudentCode ?? string.Empty).Trim();
            if (code.EndsWith(".0", StringComparison.Ordinal)) code = code[..^2];
            if (code.Length == 0)
            {
                Error(r, null, "Thiếu mã sinh viên.");
                continue;
            }
            if (!StudentCodePattern().IsMatch(code))
            {
                Error(r, code, "Mã sinh viên chỉ gồm chữ và số, tối đa 16 ký tự.");
                continue;
            }
            if (seen.TryGetValue(code, out var first))
            {
                Error(r, code, $"Mã sinh viên trùng với dòng {first.RowNumber}{(first.SheetName is null ? string.Empty : $" (sheet {first.SheetName})")}.");
                continue;
            }
            seen[code] = r;

            var name = CourseSectionImportRules.NormalizeText(r.FullName);
            if (string.IsNullOrEmpty(name))
            {
                Error(r, code, "Thiếu họ và tên.");
                continue;
            }
            if (name.Length > 200)
            {
                Error(r, code, "Họ và tên dài quá 200 ký tự.");
                continue;
            }

            // Khóa ngành đào tạo (lớp hành chính): bắt buộc, phải có trong danh mục.
            var classText = CourseSectionImportRules.NormalizeText(r.CohortMajorCode);
            if (string.IsNullOrEmpty(classText) || CourseSectionImportRules.IsSpreadsheetError(classText))
            {
                Error(r, code, "Thiếu mã khóa ngành đào tạo (lớp hành chính).");
                continue;
            }
            if (cohortMajors.Find(classText) is not { } cohortMajorId)
            {
                // Không liệt kê từng dòng: gom theo lớp để người dùng thêm khóa ngành một lần.
                errorCount++;
                var key = CohortMajorLookup.Key(classText);
                missing[key] = missing.GetValueOrDefault(key) + 1;
                continue;
            }

            if (!TryParseDate(r.DateOfBirth, out var dateOfBirth))
            {
                Error(r, code, $"Ngày sinh \"{r.DateOfBirth}\" không đúng dạng ngày/tháng/năm.");
                continue;
            }
            if (!TryParseGender(r.Gender, out var gender))
            {
                Error(r, code, $"Giới tính \"{r.Gender}\" chỉ nhận Nam, Nữ hoặc Khác.");
                continue;
            }
            var email = Blank(r.Email?.Trim().ToLowerInvariant());
            if (email is not null && (email.Length > 320 || !EmailPattern().IsMatch(email)))
            {
                Error(r, code, $"Email \"{r.Email}\" không hợp lệ.");
                continue;
            }
            var phone = Blank(r.PhoneNumber?.Trim());
            if (phone is not null && (phone.Length > 30 || !PhonePattern().IsMatch(phone)))
            {
                Error(r, code, $"Số điện thoại \"{r.PhoneNumber}\" không hợp lệ.");
                continue;
            }
            var status = Blank(CourseSectionImportRules.NormalizeText(r.StudyStatus));
            if (status?.Length > 50)
            {
                Error(r, code, "Tình trạng học tập dài quá 50 ký tự.");
                continue;
            }

            planned.Add(new PlannedRow(r.SheetName, r.RowNumber, code, name, cohortMajorId, dateOfBirth, gender, email, phone, status));
        }

        // Đối chiếu với sinh viên đang có (kể cả đã xóa mềm: nạp lại thì khôi phục).
        var codes = planned.Select(r => r.Code).ToList();
        var existing = await db.Students.IgnoreQueryFilters().AsNoTracking()
            .Where(s => codes.Contains(s.StudentCode))
            .ToDictionaryAsync(s => s.StudentCode, StringComparer.Ordinal, cancellationToken);

        int created = 0, changed = 0, same = 0, renamed = 0;
        var byCohort = new Dictionary<string, (int Rows, int New, int Updated)>(StringComparer.Ordinal);
        foreach (var row in planned)
        {
            var cohortLabel = cohortNameByCohortMajor.GetValueOrDefault(row.CohortMajorId) ?? NoCohort;
            var current = byCohort.GetValueOrDefault(cohortLabel);
            if (!existing.TryGetValue(row.Code, out var student))
            {
                created++;
                byCohort[cohortLabel] = (current.Rows + 1, current.New + 1, current.Updated);
                continue;
            }

            if (Apply(Clone(student), row))
            {
                changed++;
                if (!string.Equals(student.FullName, row.FullName, StringComparison.Ordinal)) renamed++;
                byCohort[cohortLabel] = (current.Rows + 1, current.New, current.Updated + 1);
            }
            else
            {
                same++;
                byCohort[cohortLabel] = (current.Rows + 1, current.New, current.Updated);
            }
        }

        var hash = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(planned)));
        var preview = new StudentImportPreviewDto(
            rows.Count, created, changed, same, errorCount, renamed,
            byCohort.OrderBy(x => x.Key, StringComparer.Ordinal)
                .Select(x => new StudentImportCohortDto(x.Key, x.Value.Rows, x.Value.New, x.Value.Updated)).ToList(),
            missing.OrderBy(x => x.Key, StringComparer.Ordinal)
                .Select(x => new StudentMissingCohortMajorDto(x.Key, x.Value)).ToList(),
            errors, warnings, hash);
        return new Plan(planned, preview);
    }

    /// <summary>Ghi dòng vào sinh viên; trả true nếu có thay đổi. Ô trống không xóa giá trị đang có.</summary>
    private static bool Apply(Student student, PlannedRow row)
    {
        var changed = false;
        void Set<T>(T current, T next, Action<T> assign)
        {
            if (!EqualityComparer<T>.Default.Equals(current, next))
            {
                assign(next);
                changed = true;
            }
        }

        Set(student.FullName, row.FullName, v => student.FullName = v);
        Set(student.CohortMajorId, row.CohortMajorId, v => student.CohortMajorId = v);
        if (row.DateOfBirth is not null) Set(student.DateOfBirth, row.DateOfBirth, v => student.DateOfBirth = v);
        if (row.Gender is not null) Set(student.Gender, row.Gender, v => student.Gender = v);
        if (row.Email is not null) Set(student.Email, row.Email, v => student.Email = v);
        if (row.PhoneNumber is not null) Set(student.PhoneNumber, row.PhoneNumber, v => student.PhoneNumber = v);
        if (row.StudyStatus is not null) Set(student.StudyStatus, row.StudyStatus, v => student.StudyStatus = v);
        if (student.IsDeleted)
        {
            student.IsDeleted = false;
            student.DeletedAt = null;
            changed = true;
        }
        return changed;
    }

    private static Student Clone(Student s) => new()
    {
        StudentCode = s.StudentCode,
        FullName = s.FullName,
        CohortMajorId = s.CohortMajorId,
        DateOfBirth = s.DateOfBirth,
        Gender = s.Gender,
        Email = s.Email,
        PhoneNumber = s.PhoneNumber,
        StudyStatus = s.StudyStatus,
        IsDeleted = s.IsDeleted,
    };

    /// <summary>Phần số của mã khóa ("K66", "66") để xếp khóa mới nhất lên trước.</summary>
    private static int CohortNumber(string? code)
    {
        var digits = Digits().Match(code ?? string.Empty);
        return digits.Success && int.TryParse(digits.Value, out var n) ? n : 0;
    }

    private static readonly string[] DateFormats = ["yyyy-MM-dd", "d/M/yyyy", "dd/MM/yyyy", "d-M-yyyy", "d.M.yyyy"];

    private static bool TryParseDate(string? text, out DateOnly? value)
    {
        value = null;
        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return true;
        // Ô ngày của Excel có thể đến dạng ISO đầy đủ (2005-03-14T00:00:00.000Z).
        if (trimmed.Length > 10 && trimmed[4] == '-' && trimmed[10] == 'T') trimmed = trimmed[..10];
        if (DateOnly.TryParseExact(trimmed, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            && date.Year is >= 1900 and <= 2100)
        {
            value = date;
            return true;
        }
        return false;
    }

    private static bool TryParseGender(string? text, out string? value)
    {
        value = null;
        var trimmed = CourseSectionImportRules.NormalizeText(text);
        if (string.IsNullOrEmpty(trimmed)) return true;
        value = trimmed.ToLowerInvariant() switch
        {
            "nam" or "male" or "m" => "Nam",
            "nữ" or "nu" or "female" or "f" => "Nữ",
            "khác" or "khac" or "other" => "Khác",
            _ => null,
        };
        return value is not null;
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private async Task EnsureCanWriteAsync(CancellationToken cancellationToken)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.ManagesEverything)
        {
            throw new StudentException(StudentErrorCodes.OutOfScope, "Vai trò của bạn không được nạp danh sách sinh viên.");
        }
    }

    [GeneratedRegex(@"^[A-Za-z0-9]{1,16}$")]
    private static partial Regex StudentCodePattern();

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();

    [GeneratedRegex(@"^[0-9+()\s.\-]{6,30}$")]
    private static partial Regex PhonePattern();

    [GeneratedRegex(@"\d+")]
    private static partial Regex Digits();
}
