using Application.Surveys;
using Domain;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Surveys;

/// <summary>
/// Phát link cho hai loại đợt không đi theo lớp học phần: khảo sát chương trình đào tạo
/// (mỗi khoá ngành một link) và khảo sát giảng viên (mỗi khoa một link). Phiếu, câu trả
/// lời và bộ lọc nhiễu vẫn đi chung đường với khảo sát học phần; tách file chỉ vì cách
/// chọn đơn vị khác hẳn chuỗi quy lớp về khoa/bộ môn ở file chính.
///
/// Cả ba thao tác ở đây chỉ dành cho quản trị toàn trường, như tạo và xoá đợt: hai loại
/// này chưa có phạm vi theo khoa/bộ môn cho người xem.
/// </summary>
public sealed partial class EfSurveyService
{
    /// <summary>
    /// Một đơn vị có thể được phát link. <c>UnitId</c> là CohortMajorId hoặc FacultyId tuỳ
    /// loại; <c>CohortId</c> chỉ có với CTĐT; <c>TargetCount</c> chỉ có với khảo sát giảng viên.
    /// </summary>
    private sealed record UnitCandidate(int UnitId, int? FacultyId, int? CohortId, int? TargetCount);

    private async Task<List<UnitCandidate>> ResolveUnitCandidatesAsync(
        string surveyType,
        CancellationToken cancellationToken)
    {
        if (surveyType == SurveyTypes.Program)
        {
            // Khoá ngành của ngành đã xoá mềm thì không phát: inner join với Majors (đã có
            // query filter) loại luôn những dòng đó.
            return await (
                    from cohortMajor in db.CohortMajors.AsNoTracking()
                    join major in db.Majors.AsNoTracking()
                        on cohortMajor.MajorId equals major.MajorId
                    select new UnitCandidate(
                        cohortMajor.CohortMajorId,
                        major.FacultyId,
                        cohortMajor.CohortId,
                        null))
                .ToListAsync(cancellationToken);
        }

        // Giảng viên thuộc khoa theo cột FacultyId, thiếu thì theo khoa của bộ môn — cùng
        // quy tắc với danh mục giảng viên lọc theo khoa.
        var lecturerFaculties = await (
                from lecturer in db.Lecturers.AsNoTracking()
                join departmentRow in db.Departments.AsNoTracking()
                    on lecturer.DepartmentId equals (int?)departmentRow.DepartmentId into departmentRows
                from department in departmentRows.DefaultIfEmpty()
                select lecturer.FacultyId ?? (department == null ? null : department.FacultyId))
            .ToListAsync(cancellationToken);
        var lecturerCountByFaculty = lecturerFaculties
            .OfType<int>()
            .GroupBy(id => id)
            .ToDictionary(group => group.Key, group => group.Count());

        var facultyIds = await db.Faculties.AsNoTracking()
            .Select(x => x.FacultyId)
            .ToListAsync(cancellationToken);

        // Khoa chưa có giảng viên nào thì không phát link: sĩ số 0 là một link không ai
        // làm được và một tỷ lệ phản hồi chia cho 0.
        return facultyIds
            .Where(lecturerCountByFaculty.ContainsKey)
            .Select(id => new UnitCandidate(id, id, null, lecturerCountByFaculty[id]))
            .ToList();
    }

    private static List<UnitCandidate> CandidatesInScope(
        IEnumerable<UnitCandidate> candidates,
        string scopeType,
        int? scopeId) =>
        scopeType switch
        {
            SurveyScopeTypes.All => candidates.ToList(),
            SurveyScopeTypes.Faculty => candidates.Where(x => x.FacultyId == scopeId).ToList(),
            SurveyScopeTypes.Cohort => candidates.Where(x => x.CohortId == scopeId).ToList(),
            SurveyScopeTypes.CohortMajor => candidates.Where(x => x.UnitId == scopeId).ToList(),
            _ => [],
        };

    private static string? ValidateUnitScope(string surveyType, string scopeType, int? scopeId)
    {
        if (!SurveyScopeTypes.IsValidFor(surveyType, scopeType)) return SurveyErrorCodes.ScopeTypeUnsupported;
        if (SurveyScopeTypes.RequiresScopeId(scopeType) && scopeId is null)
        {
            return SurveyErrorCodes.ScopeIdRequired;
        }
        return null;
    }

    private static int? UnitIdOf(CourseSectionSurvey unit, string surveyType) =>
        surveyType == SurveyTypes.Program ? unit.CohortMajorId : unit.FacultyId;

    private static CourseSectionSurvey NewUnitSurvey(
        int semesterSurveyId,
        string surveyType,
        UnitCandidate candidate,
        DateTime startTime,
        DateTime endTime,
        DateTime now) =>
        new()
        {
            SemesterSurveyId = semesterSurveyId,
            CohortMajorId = surveyType == SurveyTypes.Program ? candidate.UnitId : null,
            FacultyId = surveyType == SurveyTypes.Lecturer ? candidate.UnitId : null,
            TargetCount = candidate.TargetCount,
            LinkToken = Guid.NewGuid().ToString("N"),
            StartTime = startTime,
            EndTime = endTime,
            CreatedAt = now,
        };

    /// <summary>Nhánh tạo đợt của CTĐT và khảo sát giảng viên; đã kiểm tên, lịch, học kỳ, bộ câu hỏi.</summary>
    private async Task<SurveyOperationResult<SemesterSurveyDto>> CreateUnitSurveyAsync(
        CreateSemesterSurveyCommand command,
        string surveyType,
        string surveyName,
        string scopeType,
        DateTime startTime,
        DateTime endTime,
        CancellationToken cancellationToken)
    {
        var candidates = CandidatesInScope(
            await ResolveUnitCandidatesAsync(surveyType, cancellationToken),
            scopeType,
            command.ScopeId);
        if (candidates.Count == 0)
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.ScopeHasNoSections);
        }

        var now = DateTime.UtcNow;
        var survey = new SemesterSurvey
        {
            SurveyName = surveyName,
            SemesterId = command.SemesterId,
            SurveyTemplateId = command.SurveyTemplateId,
            SurveyType = surveyType,
            StartTime = startTime,
            EndTime = endTime,
            FormConfigJson = SurveyFormConfig.Serialize(command.FormConfig),
            CreatedAt = now,
        };
        db.SemesterSurveys.Add(survey);
        await db.SaveChangesAsync(cancellationToken);

        db.CourseSectionSurveys.AddRange(candidates.Select(candidate =>
            NewUnitSurvey(survey.SemesterSurveyId, surveyType, candidate, startTime, endTime, now)));
        await db.SaveChangesAsync(cancellationToken);

        var created = (await GetSemesterSurveysAsync(command.SemesterId, null, cancellationToken))
            .FirstOrDefault(x => x.SemesterSurveyId == survey.SemesterSurveyId);
        return created is null
            ? Failed<SemesterSurveyDto>(SurveyErrorCodes.SemesterSurveyNotFound)
            : Succeeded(created);
    }

    private async Task<SurveyOperationResult<SurveyScopePreviewDto>> PreviewUnitScopeAsync(
        string surveyType,
        string scopeType,
        int? scopeId,
        int? semesterSurveyId,
        CancellationToken cancellationToken)
    {
        if (ValidateUnitScope(surveyType, scopeType, scopeId) is { } scopeError)
        {
            return Failed<SurveyScopePreviewDto>(scopeError);
        }

        var candidates = CandidatesInScope(
            await ResolveUnitCandidatesAsync(surveyType, cancellationToken),
            scopeType,
            scopeId);

        var newCount = candidates.Count;
        if (semesterSurveyId is { } surveyId)
        {
            var covered = await CoveredUnitIdsAsync(surveyId, surveyType, cancellationToken);
            newCount = candidates.Count(x => !covered.Contains(x.UnitId));
        }

        return Succeeded(new SurveyScopePreviewDto(scopeType, scopeId, candidates.Count, newCount));
    }

    private async Task<HashSet<int>> CoveredUnitIdsAsync(
        int semesterSurveyId,
        string surveyType,
        CancellationToken cancellationToken)
    {
        var units = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .ToListAsync(cancellationToken);
        return units.Select(x => UnitIdOf(x, surveyType)).OfType<int>().ToHashSet();
    }

    /// <summary>
    /// Bổ sung đơn vị vào đợt CTĐT / giảng viên đã có. Gọi trong transaction và sau khi đã
    /// khoá dòng đợt của luồng chung; lịch đã được kiểm nằm trong lịch tổng.
    /// </summary>
    private async Task<SurveyOperationResult<AddSectionsToSemesterSurveyDto>> AddUnitsToSurveyAsync(
        SemesterSurvey survey,
        string scopeType,
        int? scopeId,
        DateTime startTime,
        DateTime endTime,
        CancellationToken cancellationToken)
    {
        if (ValidateUnitScope(survey.SurveyType, scopeType, scopeId) is { } scopeError)
        {
            return Failed<AddSectionsToSemesterSurveyDto>(scopeError);
        }

        var candidates = CandidatesInScope(
            await ResolveUnitCandidatesAsync(survey.SurveyType, cancellationToken),
            scopeType,
            scopeId);
        if (candidates.Count == 0)
        {
            return Failed<AddSectionsToSemesterSurveyDto>(SurveyErrorCodes.ScopeHasNoSections);
        }

        var covered = await CoveredUnitIdsAsync(survey.SemesterSurveyId, survey.SurveyType, cancellationToken);
        var fresh = candidates.Where(x => !covered.Contains(x.UnitId)).ToList();
        if (fresh.Count == 0)
        {
            return Failed<AddSectionsToSemesterSurveyDto>(SurveyErrorCodes.ScopeSectionsAlreadyAdded);
        }

        var now = DateTime.UtcNow;
        db.CourseSectionSurveys.AddRange(fresh.Select(candidate =>
            NewUnitSurvey(survey.SemesterSurveyId, survey.SurveyType, candidate, startTime, endTime, now)));
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(new AddSectionsToSemesterSurveyDto(
            survey.SemesterSurveyId,
            survey.SurveyName,
            fresh.Count,
            candidates.Count - fresh.Count,
            startTime,
            endTime));
    }

    public async Task<SurveyOperationResult<IReadOnlyList<SurveyUnitDto>>> GetSurveyUnitsAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.ManagesEverything)
        {
            return Failed<IReadOnlyList<SurveyUnitDto>>(SurveyErrorCodes.OutOfScope);
        }

        var survey = await db.SemesterSurveys.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SemesterSurveyId == semesterSurveyId, cancellationToken);
        if (survey is null)
        {
            return Failed<IReadOnlyList<SurveyUnitDto>>(SurveyErrorCodes.SemesterSurveyNotFound);
        }
        if (survey.SurveyType == SurveyTypes.Course)
        {
            return Failed<IReadOnlyList<SurveyUnitDto>>(SurveyErrorCodes.SurveyTypeMismatch);
        }

        var units = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .ToListAsync(cancellationToken);
        if (units.Count == 0)
        {
            return Succeeded<IReadOnlyList<SurveyUnitDto>>([]);
        }

        var unitIds = units.Select(x => x.CourseSectionSurveyId).ToList();
        var responseCounts = await ResponseValidityCountsAsync(unitIds, cancellationToken);
        var openCommentCounts = await db.SurveyResponses.AsNoTracking()
            .Where(x => unitIds.Contains(x.CourseSectionSurveyId)
                && x.AdditionalComments != null
                && x.AdditionalComments != "")
            .GroupBy(x => x.CourseSectionSurveyId)
            .Select(group => new { CourseSectionSurveyId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(x => x.CourseSectionSurveyId, x => x.Count, cancellationToken);

        // Đọc cả dòng đã xoá mềm: khoá ngành hay khoa bị xoá sau khi phát link thì link và
        // phiếu vẫn còn, danh sách vẫn phải gọi được tên chúng.
        var faculties = await db.Faculties.AsNoTracking().IgnoreQueryFilters()
            .ToDictionaryAsync(x => x.FacultyId, x => x.FacultyName, cancellationToken);
        var cohortMajors = new Dictionary<int, (string Code, string MajorName, string CohortName, int? FacultyId)>();
        if (survey.SurveyType == SurveyTypes.Program)
        {
            var cohortMajorIds = units.Select(x => x.CohortMajorId).OfType<int>().ToList();
            var rows = await (
                    from cohortMajor in db.CohortMajors.AsNoTracking().IgnoreQueryFilters()
                    join major in db.Majors.AsNoTracking().IgnoreQueryFilters()
                        on cohortMajor.MajorId equals major.MajorId
                    join cohort in db.Cohorts.AsNoTracking().IgnoreQueryFilters()
                        on cohortMajor.CohortId equals cohort.CohortId
                    where cohortMajorIds.Contains(cohortMajor.CohortMajorId)
                    select new
                    {
                        cohortMajor.CohortMajorId,
                        cohortMajor.CohortMajorCode,
                        major.MajorName,
                        cohort.CohortName,
                        major.FacultyId,
                    })
                .ToListAsync(cancellationToken);
            cohortMajors = rows.ToDictionary(
                x => x.CohortMajorId,
                x => (x.CohortMajorCode, x.MajorName, x.CohortName, (int?)x.FacultyId));
        }

        var result = units
            .Select(unit =>
            {
                var counts = responseCounts.GetValueOrDefault(unit.CourseSectionSurveyId);
                int unitId;
                string code, name, cohortName;
                int? facultyId;
                if (survey.SurveyType == SurveyTypes.Program)
                {
                    unitId = unit.CohortMajorId ?? 0;
                    var info = cohortMajors.GetValueOrDefault(unitId);
                    code = info.Code ?? string.Empty;
                    name = info.MajorName ?? string.Empty;
                    cohortName = info.CohortName ?? string.Empty;
                    facultyId = info.FacultyId;
                }
                else
                {
                    unitId = unit.FacultyId ?? 0;
                    code = unitId.ToString();
                    name = faculties.GetValueOrDefault(unitId) ?? string.Empty;
                    cohortName = string.Empty;
                    facultyId = unit.FacultyId;
                }

                return new SurveyUnitDto(
                    unit.CourseSectionSurveyId,
                    unit.SemesterSurveyId,
                    survey.SurveyType,
                    unit.LinkToken,
                    unit.StartTime,
                    unit.EndTime,
                    unitId,
                    code,
                    name,
                    cohortName,
                    facultyId,
                    facultyId is { } id ? faculties.GetValueOrDefault(id) ?? string.Empty : string.Empty,
                    unit.TargetCount,
                    counts.Total,
                    counts.Valid,
                    counts.Total - counts.Valid,
                    openCommentCounts.GetValueOrDefault(unit.CourseSectionSurveyId));
            })
            .OrderBy(x => x.FacultyName)
            .ThenBy(x => x.UnitCode)
            .ToList();

        return Succeeded<IReadOnlyList<SurveyUnitDto>>(result);
    }
}
