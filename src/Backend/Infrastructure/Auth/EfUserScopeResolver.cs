using Application;
using Application.Auth;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Auth;

/// <summary>
/// Dựng phạm vi dữ liệu từ tài khoản và profile đang hoạt động.
/// <para>
/// Đường đi: <c>claims → UserId + ProfileId → Users.LecturerId → Lecturers</c>. Cố ý
/// KHÔNG so email giữa hai bảng: liên kết là khoá ngoại <c>Users.LecturerId</c> nên
/// đổi email không làm đứt phạm vi, và cũng không phải lo hoa thường hay khoảng
/// trắng. Xem congviec2.md mục G6.
/// </para>
/// </summary>
internal sealed class EfUserScopeResolver(
    AppDbContext db,
    ICurrentUserAccessor currentUser) : IUserScopeResolver
{
    public async Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default)
    {
        if (currentUser.UserId is not { } userId || currentUser.ProfileId is not { } profileId)
        {
            return UserScope.None;
        }

        // Vai trò lấy theo profile đang hoạt động chứ không theo user, vì một người
        // có thể có nhiều profile với phạm vi khác nhau.
        var roleCode = await (
            from profile in db.UserProfiles
            join role in db.Roles on profile.RoleId equals role.Id
            where profile.Id == profileId && profile.UserId == userId && profile.IsActive
            select role.Code).SingleOrDefaultAsync(cancellationToken);

        if (string.IsNullOrEmpty(roleCode))
        {
            return UserScope.None;
        }

        // Ban Giám hiệu thấy toàn bộ dữ liệu như hai vai trò quản trị; phần "chỉ đọc"
        // do UserScope.IsReadOnly quyết định chứ không phải do phạm vi.
        if (roleCode is RoleCodes.Admin or RoleCodes.SurveyAdmin or RoleCodes.BoardOfDirectors)
        {
            return UserScope.Unrestricted(roleCode);
        }

        // Các vai trò còn lại quy phạm vi qua hồ sơ giảng viên gắn với tài khoản.
        // Không tra ra được thì trả phạm vi rỗng — service sẽ trả danh sách trống chứ
        // không rơi vào nhánh không lọc.
        var lecturer = await (
            from user in db.Users
            join item in db.Lecturers on user.LecturerId equals item.LecturerId
            where user.Id == userId
            select new { item.LecturerId, item.DepartmentId, item.FacultyId })
            .SingleOrDefaultAsync(cancellationToken);

        return lecturer is null
            ? UserScope.None with { RoleCode = roleCode }
            : new UserScope(
                roleCode,
                lecturer.LecturerId,
                lecturer.DepartmentId,
                lecturer.FacultyId,
                SeesEverything: false);
    }
}
