using Application.Auth;

namespace API.Auth;

/// <summary>
/// Đánh dấu một endpoint dùng POST nhưng chỉ ĐỌC dữ liệu (vd truy vấn có thân dài), để
/// <see cref="ReadOnlyProfileGuard"/> cho hồ sơ chỉ xem đi qua.
/// </summary>
public sealed class AllowReadOnlyProfileAttribute : Attribute
{
    public static readonly AllowReadOnlyProfileAttribute Instance = new();
}

/// <summary>
/// Chặn mọi yêu cầu ghi (POST, PUT, PATCH, DELETE) của hồ sơ chỉ xem, ở MỘT chỗ.
/// <para>
/// Vai trò do người quản trị tự tạo và tự bật "chỉ xem", nên không thể trông vào từng
/// service tự nhớ kiểm <see cref="UserScope.IsReadOnly"/> — trước đây bộ câu hỏi và thang
/// trả lời đã quên, Ban Giám hiệu gọi thẳng API là sửa được. Service vẫn tự kiểm như cũ;
/// lớp này là chốt chặn cuối.
/// </para>
/// Không chặn: đăng nhập / đổi hồ sơ / đăng xuất (/api/auth), phiếu khảo sát công khai
/// (/api/public — người đang đăng nhập vẫn làm phiếu được), và endpoint gắn
/// <see cref="AllowReadOnlyProfileAttribute"/>.
/// </summary>
public sealed class ReadOnlyProfileGuard(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IUserScopeResolver userScope)
    {
        if (IsWrite(context.Request.Method)
            && context.User.Identity?.IsAuthenticated == true
            && !IsExempt(context))
        {
            var scope = await userScope.ResolveAsync(context.RequestAborted);
            if (scope.IsReadOnly)
            {
                await Results.Json(new { errorCode = "PROFILE_READ_ONLY" }, statusCode: StatusCodes.Status403Forbidden)
                    .ExecuteAsync(context);
                return;
            }
        }

        await next(context);
    }

    private static bool IsWrite(string method) =>
        HttpMethods.IsPost(method) || HttpMethods.IsPut(method)
        || HttpMethods.IsPatch(method) || HttpMethods.IsDelete(method);

    private static bool IsExempt(HttpContext context)
    {
        var path = context.Request.Path;
        return path.StartsWithSegments("/api/auth")
            || path.StartsWithSegments("/api/public")
            || context.GetEndpoint()?.Metadata.GetMetadata<AllowReadOnlyProfileAttribute>() is not null;
    }
}
