using Application.Auth;
using Application.Surveys;
using Domain;
using Infrastructure.Auth;
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
    /// Thu một truy vấn lớp về phạm vi người xem. Cùng quy tắc với trang Bảng dữ liệu
    /// khảo sát: lớp thuộc khoa / bộ môn nào là theo học phần của lớp.
    /// </summary>
    public static IQueryable<CourseSectionSurvey> InScope(
        AppDbContext db,
        IQueryable<CourseSectionSurvey> query,
        UserScope scope) =>
        AcademicScopeQuery.SectionSurveysInScope(db, query, scope);

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
