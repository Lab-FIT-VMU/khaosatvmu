namespace UnitTests.InfrastructureTests;

using Application.Auth;

/// <summary>
/// Phạm vi người xem cố định cho test. Mặc định là quản trị (không lọc gì), để các bài
/// test cũ vẫn kiểm đúng thứ chúng định kiểm. Test nào cần kiểm chính phạm vi thì truyền
/// phạm vi muốn thử.
/// </summary>
internal sealed class FixedUserScopeResolver(UserScope? scope = null) : IUserScopeResolver
{
    public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(scope ?? UserScope.Unrestricted(RoleCodes.Admin));
}
