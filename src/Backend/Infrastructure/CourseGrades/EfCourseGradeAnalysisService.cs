using System.Text.Json.Nodes;
using Application.Auth;
using Application.CourseGrades;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.CourseGrades;

/// <summary>
/// Đọc kết quả của lượt tính hiện hành theo phạm vi người xem.
///
/// Mức xem (chốt 09/11/2026): quản trị hệ thống, quản trị khảo sát và Ban giám hiệu xem được hết;
/// quản lý khoa thấy khoa mình, quản lý bộ môn thấy bộ môn mình (theo DepartmentId / FacultyId
/// worker ghi vào từng dòng kết quả, cùng quy tắc với AcademicScopeQuery). Giảng viên, hoặc người
/// dùng không xác định được phạm vi, bị từ chối. Tên giảng viên điền từ bảng Lecturers khi trả về,
/// vì kết quả lưu chỉ có LecturerId.
/// </summary>
public sealed class EfCourseGradeAnalysisService(AppDbContext db, IUserScopeResolver userScope)
    : ICourseGradeAnalysisService
{
    private sealed record View(string Level, int? FacultyId, int? DepartmentId);

    private async Task<View> ResolveViewAsync(CancellationToken cancellationToken)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (scope.SeesEverything)
        {
            return new View(CourseGradeViewLevels.Full, null, null);
        }
        if (scope.SeesNothing || scope.SeesOnlyOwn)
        {
            throw new CourseGradeException(
                CourseGradeErrorCodes.OutOfScope,
                "Vai trò của bạn không xem được báo cáo phân tích điểm học phần.");
        }
        return scope.SeesWholeFaculty
            ? new View(CourseGradeViewLevels.Unit, scope.FacultyId, null)
            : new View(CourseGradeViewLevels.Unit, null, scope.DepartmentId);
    }

    /// <summary>Lọc kết quả theo phạm vi ngay trong SQL.</summary>
    private static IQueryable<T> InScope<T>(IQueryable<T> query, View view, Func<IQueryable<T>, int, IQueryable<T>> byFaculty,
        Func<IQueryable<T>, int, IQueryable<T>> byDepartment) =>
        view.Level == CourseGradeViewLevels.Full ? query
        : view.FacultyId is { } faculty ? byFaculty(query, faculty)
        : byDepartment(query, view.DepartmentId!.Value);

    private Task<GradeAnalysisRun?> CurrentRunAsync(CancellationToken cancellationToken) =>
        db.GradeAnalysisRuns.AsNoTracking().SingleOrDefaultAsync(x => x.IsCurrent, cancellationToken);

    // ------------------------------------------------------------------ tổng quan

    public async Task<CourseGradeAnalysisOverviewDto> GetOverviewAsync(CancellationToken cancellationToken = default)
    {
        var view = await ResolveViewAsync(cancellationToken);
        var latest = await db.GradeAnalysisRuns.AsNoTracking()
            .OrderByDescending(x => x.RunId).FirstOrDefaultAsync(cancellationToken);
        var latestDto = latest is null ? null : GradeAnalysisRunMapping.ToDto(latest);
        var run = await CurrentRunAsync(cancellationToken);
        if (run is null)
        {
            return new CourseGradeAnalysisOverviewDto(
                view.Level, view.FacultyId, view.DepartmentId, null, null, null, null, [], [], [], null, [], latestDto, []);
        }

        var crossTerm = string.IsNullOrEmpty(run.CrossTermJson) ? null : JsonNode.Parse(run.CrossTermJson);
        var semesterByTerm = crossTerm?["semester_by_ky"]?.AsObject()
            .ToDictionary(x => x.Key, x => x.Value!.GetValue<int>()) ?? [];
        var termBySemester = semesterByTerm.ToDictionary(x => x.Value, x => x.Key);

        var termRows = await (
            from term in db.GradeAnalysisTermResults.AsNoTracking()
            join semester in db.Semesters.AsNoTracking() on term.SemesterId equals semester.SemesterId
            join year in db.AcademicYears.AsNoTracking() on semester.AcademicYearId equals year.AcademicYearId
            where term.RunId == run.RunId
            select new { term.SemesterId, term.DataJson, semester.SemesterName, year.AcademicYearName })
            .ToListAsync(cancellationToken);
        var order = run.SemesterIds.Select((id, index) => (id, index)).ToDictionary(x => x.id, x => x.index);
        var terms = termRows
            .OrderBy(x => order.GetValueOrDefault(x.SemesterId, int.MaxValue))
            .Select(x => new GradeAnalysisTermDto(
                x.SemesterId,
                termBySemester.GetValueOrDefault(x.SemesterId, string.Empty),
                $"{x.SemesterName} {x.AcademicYearName}",
                JsonNode.Parse(x.DataJson)?["tong"]))
            .ToList();

        // Đơn vị và học phần có trong kết quả, trong phạm vi người xem.
        var courseUnits = await InScope(
                db.GradeAnalysisCourseResults.AsNoTracking().Where(x => x.RunId == run.RunId), view,
                (q, f) => q.Where(x => x.FacultyId == f), (q, d) => q.Where(x => x.DepartmentId == d))
            .Select(x => new { x.BaseCourseCode, x.DepartmentId, x.FacultyId, x.SemesterId })
            .ToListAsync(cancellationToken);
        var facultyIds = courseUnits.Where(x => x.FacultyId != null).Select(x => x.FacultyId!.Value).ToHashSet();
        var departmentIds = courseUnits.Where(x => x.DepartmentId != null).Select(x => x.DepartmentId!.Value).ToHashSet();
        var faculties = await db.Faculties.AsNoTracking()
            .Where(x => facultyIds.Contains(x.FacultyId))
            .OrderBy(x => x.FacultyName)
            .Select(x => new GradeAnalysisUnitDto(x.FacultyId, x.FacultyName, null))
            .ToListAsync(cancellationToken);
        var departments = await db.Departments.AsNoTracking()
            .Where(x => departmentIds.Contains(x.DepartmentId))
            .OrderBy(x => x.DepartmentName)
            .Select(x => new GradeAnalysisUnitDto(x.DepartmentId, x.DepartmentName, x.FacultyId))
            .ToListAsync(cancellationToken);

        if (crossTerm is not null && view.Level == CourseGradeViewLevels.Unit)
        {
            // Lịch sử theo học phần chỉ giữ học phần trong đơn vị của người xem.
            var allowed = courseUnits.Select(x => x.BaseCourseCode).ToHashSet(StringComparer.Ordinal);
            foreach (var key in new[] { "co_hp", "de_thi", "de_thi_lech" })
            {
                if (crossTerm[key] is JsonObject byCourse)
                {
                    foreach (var code in byCourse.Select(x => x.Key).Where(code => !allowed.Contains(code)).ToList())
                    {
                        byCourse.Remove(code);
                    }
                }
            }
        }

        var repetition = await RepetitionAsync(run.RunId, view, semesterByTerm, cancellationToken);

        // Danh mục học phần qua các kỳ: đơn vị lấy theo kỳ gần nhất có mở; tên theo danh mục
        // Courses (mã gốc, nếu không có thì mã đuôi H/E).
        var latestUnit = courseUnits
            .GroupBy(x => x.BaseCourseCode, StringComparer.Ordinal)
            .Select(g => g.MaxBy(x => order.GetValueOrDefault(x.SemesterId, -1))!)
            .ToList();
        var codes = latestUnit.SelectMany(x => new[] { x.BaseCourseCode, x.BaseCourseCode + "H", x.BaseCourseCode + "E" }).ToList();
        var courseNames = (await db.Courses.AsNoTracking()
                .Where(x => codes.Contains(x.CourseCode))
                .Select(x => new { x.CourseCode, x.CourseName })
                .ToListAsync(cancellationToken))
            .GroupBy(x => x.CourseCode, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.First().CourseName, StringComparer.Ordinal);
        var catalog = latestUnit
            .Select(x => new GradeAnalysisCourseCatalogDto(
                x.BaseCourseCode,
                courseNames.GetValueOrDefault(x.BaseCourseCode)
                    ?? courseNames.GetValueOrDefault(x.BaseCourseCode + "H")
                    ?? courseNames.GetValueOrDefault(x.BaseCourseCode + "E")
                    ?? x.BaseCourseCode,
                x.DepartmentId,
                x.FacultyId))
            .OrderBy(x => x.BaseCourseCode, StringComparer.Ordinal)
            .ToList();

        return new CourseGradeAnalysisOverviewDto(
            view.Level,
            view.FacultyId,
            view.DepartmentId,
            run.RunId,
            run.FinishedAtUtc,
            run.ThresholdVersion,
            JsonNode.Parse(run.ThresholdSnapshotJson),
            terms,
            faculties,
            departments,
            crossTerm,
            repetition,
            latestDto,
            catalog);
    }

    /// <summary>Số lượt G1 theo kỳ, đếm từ chuỗi giảng viên – học phần (g1_ky) trong phạm vi.</summary>
    private async Task<List<GradeAnalysisRepetitionDto>> RepetitionAsync(
        long runId, View view, IReadOnlyDictionary<string, int> semesterByTerm, CancellationToken cancellationToken)
    {
        var rows = await InScope(
                db.GradeAnalysisLecturerCourseResults.AsNoTracking().Where(x => x.RunId == runId), view,
                (q, f) => q.Where(x => x.FacultyId == f), (q, d) => q.Where(x => x.DepartmentId == d))
            .Select(x => x.DataJson)
            .ToListAsync(cancellationToken);

        var pairs = new Dictionary<string, int>();
        var byMarker = new Dictionary<string, Dictionary<string, int>>();
        var ongoing = new Dictionary<string, Dictionary<string, int>>();
        foreach (var json in rows)
        {
            if (JsonNode.Parse(json)?["g1_ky"] is not JsonObject g1)
            {
                continue;
            }
            foreach (var (term, markers) in g1)
            {
                if (markers is not JsonObject markerSet || markerSet.Count == 0)
                {
                    continue;
                }
                pairs[term] = pairs.GetValueOrDefault(term) + 1;
                var counts = byMarker.TryGetValue(term, out var c) ? c : byMarker[term] = [];
                var current = ongoing.TryGetValue(term, out var o) ? o : ongoing[term] = [];
                foreach (var (marker, detail) in markerSet)
                {
                    counts[marker] = counts.GetValueOrDefault(marker) + 1;
                    if (detail?["dang"]?.GetValue<bool>() == true)
                    {
                        current[marker] = current.GetValueOrDefault(marker) + 1;
                    }
                }
            }
        }

        return semesterByTerm
            .Select(x => new GradeAnalysisRepetitionDto(
                x.Value,
                pairs.GetValueOrDefault(x.Key),
                byMarker.GetValueOrDefault(x.Key) ?? new Dictionary<string, int>(),
                ongoing.GetValueOrDefault(x.Key) ?? new Dictionary<string, int>()))
            .ToList();
    }

    // ------------------------------------------------------------------ học phần, lớp, giảng viên

    public async Task<IReadOnlyList<GradeAnalysisCourseDto>> GetCoursesAsync(
        int semesterId, int? facultyId, int? departmentId, CancellationToken cancellationToken = default)
    {
        var view = await ResolveViewAsync(cancellationToken);
        var run = await CurrentRunAsync(cancellationToken);
        if (run is null)
        {
            return [];
        }

        var query = InScope(
            db.GradeAnalysisCourseResults.AsNoTracking().Where(x => x.RunId == run.RunId && x.SemesterId == semesterId),
            view, (q, f) => q.Where(x => x.FacultyId == f), (q, d) => q.Where(x => x.DepartmentId == d));
        if (facultyId is { } f)
        {
            query = query.Where(x => x.FacultyId == f);
        }
        if (departmentId is { } d)
        {
            query = query.Where(x => x.DepartmentId == d);
        }
        var rows = await query.OrderBy(x => x.BaseCourseCode).ToListAsync(cancellationToken);

        var parsed = rows.Select(x => (Row: x, Data: JsonNode.Parse(x.DataJson)!)).ToList();
        // Danh sách lớp liên quan đến từng điểm lưu ý (gp) mang lecturer_id: điền tên giảng viên.
        var lecturerIds = parsed
            .SelectMany(x => (x.Data["gp"] as JsonObject)?.Select(g => g.Value?["ds"] as JsonArray) ?? [])
            .Where(ds => ds is not null)
            .SelectMany(ds => ds!)
            .Select(entry => LecturerIdOf(entry?["lecturer_id"]))
            .OfType<int>()
            .ToHashSet();
        var names = await LecturerNamesAsync(lecturerIds, cancellationToken);
        foreach (var (_, data) in parsed)
        {
            if (data["gp"] is not JsonObject groups) continue;
            foreach (var (_, group) in groups)
            {
                if (group?["ds"] is not JsonArray entries) continue;
                foreach (var entry in entries.OfType<JsonObject>())
                {
                    var id = LecturerIdOf(entry["lecturer_id"]);
                    entry["lecturer_name"] = id is { } value ? names.GetValueOrDefault(value) : null;
                }
            }
        }

        // Tổng các lớp đưa vào thống kê của từng học phần (bảng bộ môn ở cấp khoa, như bản audit:
        // tỷ lệ mất tư cách = Σ n_mat / Σ n_diem và trung vị r trên các lớp này).
        var codesInPage = parsed.Select(x => x.Row.BaseCourseCode).ToList();
        var statsSections = await db.GradeAnalysisSectionResults.AsNoTracking()
            .Where(x => x.RunId == run.RunId && x.SemesterId == semesterId && x.IncludedInStats
                && codesInPage.Contains(x.BaseCourseCode))
            .Select(x => new { x.BaseCourseCode, x.DataJson })
            .ToListAsync(cancellationToken);
        var statsByCourse = statsSections
            .GroupBy(x => x.BaseCourseCode, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Select(x => JsonNode.Parse(x.DataJson)!).ToList(), StringComparer.Ordinal);
        foreach (var (row, data) in parsed)
        {
            var sections = statsByCourse.GetValueOrDefault(row.BaseCourseCode) ?? [];
            data["lop_tk"] = new JsonObject
            {
                ["n_mat"] = sections.Sum(s => s["n_mat"]?.GetValue<int>() ?? 0),
                ["n_diem"] = sections.Sum(s => s["n_diem"]?.GetValue<int>() ?? 0),
                ["r"] = new JsonArray(sections
                    .Select(s => s["r"] is JsonValue r && r.TryGetValue<double>(out var value) ? value : (double?)null)
                    .OfType<double>()
                    .Select(value => (JsonNode)JsonValue.Create(value))
                    .ToArray()),
            };
        }

        return parsed.Select(x => new GradeAnalysisCourseDto(
                x.Row.BaseCourseCode, x.Row.DepartmentId, x.Row.FacultyId, x.Row.Flags, x.Row.StableStates, x.Data))
            .ToList();
    }

    public async Task<IReadOnlyList<GradeAnalysisSectionDto>> GetSectionsAsync(
        int semesterId, int? departmentId, string? courseCode, CancellationToken cancellationToken = default)
    {
        var view = await ResolveViewAsync(cancellationToken);
        if (departmentId is null && string.IsNullOrWhiteSpace(courseCode))
        {
            throw new CourseGradeException(
                CourseGradeErrorCodes.InvalidQuery,
                "Hãy chọn bộ môn hoặc học phần để xem danh sách lớp.");
        }
        var run = await CurrentRunAsync(cancellationToken);
        if (run is null)
        {
            return [];
        }

        var query = InScope(
            db.GradeAnalysisSectionResults.AsNoTracking().Where(x => x.RunId == run.RunId && x.SemesterId == semesterId),
            view, (q, f) => q.Where(x => x.FacultyId == f), (q, d) => q.Where(x => x.DepartmentId == d));
        if (departmentId is { } d)
        {
            query = query.Where(x => x.DepartmentId == d);
        }
        if (!string.IsNullOrWhiteSpace(courseCode))
        {
            var code = courseCode.Trim().ToUpperInvariant();
            query = query.Where(x => x.BaseCourseCode == code);
        }
        var rows = await query.OrderBy(x => x.BaseCourseCode).ThenBy(x => x.CourseSectionId).ToListAsync(cancellationToken);
        var names = await LecturerNamesAsync(rows.Select(x => x.LecturerId).OfType<int>().ToHashSet(), cancellationToken);

        return rows.Select(x => new GradeAnalysisSectionDto(
                x.CourseSectionId,
                x.BaseCourseCode,
                x.LecturerId,
                x.LecturerId is { } id ? names.GetValueOrDefault(id) : null,
                x.DepartmentId,
                x.FacultyId,
                x.IncludedInStats,
                x.Markers,
                JsonNode.Parse(x.DataJson)!,
                string.IsNullOrEmpty(x.ProfileJson) ? null : JsonNode.Parse(x.ProfileJson)))
            .ToList();
    }

    public async Task<IReadOnlyList<GradeAnalysisLecturerCourseDto>> GetLecturerCoursesAsync(
        int? departmentId, string? courseCode, CancellationToken cancellationToken = default)
    {
        var view = await ResolveViewAsync(cancellationToken);
        var run = await CurrentRunAsync(cancellationToken);
        if (run is null)
        {
            return [];
        }

        var query = InScope(
            db.GradeAnalysisLecturerCourseResults.AsNoTracking().Where(x => x.RunId == run.RunId),
            view, (q, f) => q.Where(x => x.FacultyId == f), (q, d) => q.Where(x => x.DepartmentId == d));
        if (departmentId is { } d)
        {
            query = query.Where(x => x.DepartmentId == d);
        }
        if (!string.IsNullOrWhiteSpace(courseCode))
        {
            var code = courseCode.Trim().ToUpperInvariant();
            query = query.Where(x => x.BaseCourseCode == code);
        }
        var rows = await query.OrderBy(x => x.BaseCourseCode).ThenBy(x => x.LecturerId).ToListAsync(cancellationToken);
        var names = await LecturerNamesAsync(rows.Select(x => x.LecturerId).ToHashSet(), cancellationToken);

        return rows.Select(x => new GradeAnalysisLecturerCourseDto(
                x.LecturerId,
                names.GetValueOrDefault(x.LecturerId),
                x.BaseCourseCode,
                x.DepartmentId,
                x.FacultyId,
                JsonNode.Parse(x.DataJson)!))
            .ToList();
    }

    private static int? LecturerIdOf(JsonNode? node) =>
        node is JsonValue value && value.TryGetValue<int>(out var id) ? id : null;

    private async Task<Dictionary<int, string>> LecturerNamesAsync(
        IReadOnlyCollection<int> lecturerIds, CancellationToken cancellationToken) =>
        lecturerIds.Count == 0
            ? []
            : await db.Lecturers.IgnoreQueryFilters().AsNoTracking()
                .Where(x => lecturerIds.Contains(x.LecturerId))
                .ToDictionaryAsync(x => x.LecturerId, x => x.FullName, cancellationToken);
}
