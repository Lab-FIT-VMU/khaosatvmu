using Application.Surveys;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Reports;

/// <summary>
/// Bảng lớp đã lọc theo trạng thái phát hành — nguồn duy nhất cho mọi truy vấn số liệu.
///
/// Quản trị thấy tất cả; trưởng bộ môn và giảng viên chỉ thấy lớp thuộc đợt đã phát hành, nên
/// đợt chưa phát hành không lọt vào bất kỳ con số gộp nào. Tính năng phân loại cảm xúc bắt buộc
/// phải đi qua đây giống hệt màn báo cáo hiện có: một tính năng mới không được tự mở rộng phạm
/// vi dữ liệu mà người dùng được xem.
/// </summary>
internal static class VisibleSurveyScope
{
    public static async Task<IQueryable<CourseSectionSurvey>> SectionSurveysAsync(
        AppDbContext db,
        ISurveyPublicationService publication,
        CancellationToken cancellationToken)
    {
        var query = db.CourseSectionSurveys.AsNoTracking();
        var visible = await publication.VisibleSurveyIdsAsync(cancellationToken);
        if (visible is null)
        {
            return query;
        }

        var ids = visible.ToList();
        return query.Where(x => ids.Contains(x.SemesterSurveyId));
    }
}
