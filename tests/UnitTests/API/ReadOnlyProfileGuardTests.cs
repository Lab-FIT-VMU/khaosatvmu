namespace UnitTests.API;

using System.Security.Claims;
using Application.Auth;
using FluentAssertions;
using global::API.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Hồ sơ chỉ xem không ghi được gì, chặn tập trung trước khi tới endpoint — kể cả những
/// service từng quên tự kiểm (bộ câu hỏi, thang trả lời).
/// </summary>
public class ReadOnlyProfileGuardTests
{
    private sealed class FixedScope(UserScope scope) : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) => Task.FromResult(scope);
    }

    private static readonly UserScope ReadOnlyCustom =
        new("ROLE_CUSTOM", 1, 2, 3, false, Domain.RoleDataScopes.Department, CanWrite: false);

    private static readonly UserScope WritableCustom =
        new("ROLE_CUSTOM", 1, 2, 3, false, Domain.RoleDataScopes.Department, CanWrite: true);

    private static async Task<(bool Reached, int Status)> SendAsync(UserScope scope, string method, string path, bool authenticated = true)
    {
        var reached = false;
        var guard = new ReadOnlyProfileGuard(_ =>
        {
            reached = true;
            return Task.CompletedTask;
        });

        var context = new DefaultHttpContext
        {
            RequestServices = new ServiceCollection().AddLogging().BuildServiceProvider(),
        };
        context.Request.Method = method;
        context.Request.Path = path;
        context.Response.Body = new MemoryStream();
        if (authenticated)
        {
            context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "x")], "test"));
        }

        await guard.InvokeAsync(context, new FixedScope(scope));
        return (reached, context.Response.StatusCode);
    }

    [Theory]
    [InlineData("POST", "/api/surveys/templates")]
    [InlineData("PUT", "/api/surveys/answer-scales/1")]
    [InlineData("DELETE", "/api/catalog/lecturers/5")]
    [InlineData("PATCH", "/api/admin/users/1/status")]
    public async Task ReadOnlyProfile_CannotWrite(string method, string path)
    {
        var (reached, status) = await SendAsync(ReadOnlyCustom, method, path);

        reached.Should().BeFalse();
        status.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Theory]
    [InlineData("GET", "/api/surveys/templates")]
    [InlineData("POST", "/api/auth/switch-profile")]
    [InlineData("POST", "/api/public/surveys/abc/responses")]
    public async Task ReadOnlyProfile_StillReadsSwitchesProfileAndFillsPublicSurveys(string method, string path)
    {
        (await SendAsync(ReadOnlyCustom, method, path)).Reached.Should().BeTrue();
    }

    [Fact]
    public async Task WritableProfile_AndAnonymousRequests_PassThrough()
    {
        (await SendAsync(WritableCustom, "POST", "/api/surveys/templates")).Reached.Should().BeTrue();
        (await SendAsync(ReadOnlyCustom, "POST", "/api/surveys/templates", authenticated: false)).Reached
            .Should().BeTrue("chưa đăng nhập thì để endpoint tự từ chối bằng xác thực");
    }

    [Fact]
    public async Task BoardOfDirectors_CannotEditQuestionSets()
    {
        // Lỗ hổng cũ: Ban Giám hiệu có quyền module bộ câu hỏi và service không kiểm "chỉ đọc".
        var board = new UserScope(RoleCodes.BoardOfDirectors, null, null, null, true, Domain.RoleDataScopes.All, false);

        (await SendAsync(board, "POST", "/api/surveys/templates")).Status.Should().Be(StatusCodes.Status403Forbidden);
    }
}
