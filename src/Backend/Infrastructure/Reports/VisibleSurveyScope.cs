using Application.Auth;
using Application.Surveys;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Reports;

/// <summary>
/// Bảng lớp đã lọc theo trạng thái phát hành VÀ phạm vi người xem — nguồn duy nhất cho
/// mọi truy vấn số liệu.
///
/// Quản trị thấy tất cả; các vai trò còn lại chỉ thấy lớp thuộc đợt đã phát hành, và chỉ
/// lớp trong phạm vi của mình: trưởng khoa cả khoa, trưởng bộ môn một bộ môn, giảng viên
/// lớp mình dạy. Tính năng phân loại cảm xúc bắt buộc phải đi qua đây giống hệt màn báo
/// cáo hiện có: một tính năng mới không được tự mở rộng phạm vi dữ liệu mà người dùng
/// được xem.
/// </summary>
internal static class VisibleSurveyScope
{
    public static async Task<IQueryable<CourseSectionSurvey>> SectionSurveysAsync(
        AppDbContext db,
        ISurveyPublicationService publication,
        IUserScopeResolver userScope,
        CancellationToken cancellationToken)
    {
        var query = db.CourseSectionSurveys.AsNoTracking();
        var visible = await publication.VisibleSurveyIdsAsync(cancellationToken);
        if (visible is not null)
        {
            var ids = visible.ToList();
            query = query.Where(x => ids.Contains(x.SemesterSurveyId));
        }

        var scope = await userScope.ResolveAsync(cancellationToken);
        return InScope(db, query, scope);
    }

    /// <summary>
    /// Thu một truy vấn bài khảo sát lớp về phạm vi người xem, theo <see cref="SectionIdsInScope"/>.
    /// </summary>
    public static IQueryable<CourseSectionSurvey> InScope(
        AppDbContext db,
        IQueryable<CourseSectionSurvey> query,
        UserScope scope)
    {
        if (scope.SeesEverything) return query;

        // Bị giới hạn mà không biết giới hạn vào đâu thì không thấy gì, tuyệt đối không
        // rơi về nhánh không lọc.
        if (scope.SeesNothing) return query.Where(_ => false);

        var sectionIds = SectionIdsInScope(db, scope);
        return query.Where(x => sectionIds.Contains(x.CourseSectionId));
    }

    /// <summary>Thu một truy vấn lớp học phần về phạm vi người xem, cùng quy tắc với <see cref="InScope"/>.</summary>
    public static IQueryable<CourseSection> SectionsInScope(
        AppDbContext db,
        IQueryable<CourseSection> query,
        UserScope scope)
    {
        if (scope.SeesEverything) return query;
        if (scope.SeesNothing) return query.Where(_ => false);

        var sectionIds = SectionIdsInScope(db, scope);
        return query.Where(x => sectionIds.Contains(x.CourseSectionId));
    }

    /// <summary>
    /// Mã các lớp học phần thuộc phạm vi của một người xem bị giới hạn. Đây là MỘT quy tắc
    /// cho cả hệ thống, trùng khít cách các tab phân tích quy lớp về đơn vị
    /// (<c>EfSurveyService.LoadAnalysedSectionsAsync</c>):
    /// <list type="bullet">
    /// <item>Bộ môn = bộ môn của học phần; học phần không ghi bộ môn thì lấy bộ môn của giảng viên.</item>
    /// <item>Khoa = khoa của học phần; không ghi thì lấy khoa của bộ môn trên; vẫn không có thì
    /// lấy khoa của giảng viên.</item>
    /// <item>Giảng viên chỉ thấy lớp mình dạy.</item>
    /// </list>
    /// Trước đây bộ lọc trong cơ sở dữ liệu chỉ nhìn cột của học phần, còn danh sách phân
    /// tích thì suy tiếp qua bộ môn: học phần thiếu khoa hiện trong danh sách của quản lý
    /// khoa nhưng mở chi tiết lại báo không tìm thấy.
    /// </summary>
    private static IQueryable<int> SectionIdsInScope(AppDbContext db, UserScope scope)
    {
        var owned =
            from section in db.CourseSections
            join course in db.Courses on section.CourseId equals course.CourseId into courseJoin
            from course in courseJoin.DefaultIfEmpty()
            join lecturer in db.Lecturers on section.LecturerId equals (int?)lecturer.LecturerId into lecturerJoin
            from lecturer in lecturerJoin.DefaultIfEmpty()
            let departmentId = course != null && course.DepartmentId != null
                ? course.DepartmentId
                : lecturer != null ? lecturer.DepartmentId : null
            join department in db.Departments on departmentId equals (int?)department.DepartmentId into departmentJoin
            from department in departmentJoin.DefaultIfEmpty()
            select new
            {
                section.CourseSectionId,
                section.LecturerId,
                DepartmentId = departmentId,
                FacultyId = course != null && course.FacultyId != null
                    ? course.FacultyId
                    : department != null && department.FacultyId != null
                        ? department.FacultyId
                        : lecturer != null ? lecturer.FacultyId : null,
            };

        if (scope.SeesOnlyOwn)
        {
            var lecturerId = scope.LecturerId;
            return owned.Where(x => x.LecturerId == lecturerId).Select(x => x.CourseSectionId);
        }

        if (scope.SeesWholeFaculty)
        {
            var facultyId = scope.FacultyId;
            return owned.Where(x => x.FacultyId == facultyId).Select(x => x.CourseSectionId);
        }

        var scopeDepartmentId = scope.DepartmentId;
        return owned.Where(x => x.DepartmentId == scopeDepartmentId).Select(x => x.CourseSectionId);
    }

    /// <summary>
    /// Nhãn phạm vi để ghép vào khoá cache: hai người khác phạm vi, hoặc khác tập đợt đã
    /// phát hành, không được đọc chung một bản đã dựng sẵn.
    /// </summary>
    public static async Task<string> CacheKeyAsync(
        ISurveyPublicationService publication,
        IUserScopeResolver userScope,
        CancellationToken cancellationToken)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (scope.SeesEverything) return "all";

        var visible = await publication.VisibleSurveyIdsAsync(cancellationToken);
        var published = visible is null ? "all" : string.Join(',', visible.Order());
        var unit = scope.SeesNothing
            ? "none"
            : scope.SeesOnlyOwn
                ? $"lecturer-{scope.LecturerId}"
                : scope.SeesWholeFaculty
                    ? $"faculty-{scope.FacultyId}"
                    : $"department-{scope.DepartmentId}";
        return $"{unit}:published-{published}";
    }
}
