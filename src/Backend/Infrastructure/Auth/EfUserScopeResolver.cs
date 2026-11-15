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
        // có thể có nhiều profile với phạm vi khác nhau. Phạm vi và quyền ghi là thuộc
        // tính của vai trò (bảng "Roles"), không suy từ mã vai trò.
        var role = await (
            from profile in db.UserProfiles
            join item in db.Roles on profile.RoleId equals item.Id
            where profile.Id == profileId && profile.UserId == userId && profile.IsActive
            select new { item.Code, item.DataScope, item.CanWrite }).SingleOrDefaultAsync(cancellationToken);

        if (role is null)
        {
            return UserScope.None;
        }

        var roleCode = role.Code;

        // Phạm vi toàn trường: không lọc gì. Phần "chỉ xem" do UserScope.IsReadOnly quyết
        // định theo CanWrite chứ không phải do phạm vi.
        if (role.DataScope == Domain.RoleDataScopes.All)
        {
            return UserScope.Unrestricted(roleCode, role.CanWrite);
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
            ? UserScope.None with { RoleCode = roleCode, DataScope = role.DataScope, CanWrite = role.CanWrite }
            : new UserScope(
                roleCode,
                lecturer.LecturerId,
                lecturer.DepartmentId,
                lecturer.FacultyId,
                SeesEverything: false,
                role.DataScope,
                role.CanWrite);
    }
}
