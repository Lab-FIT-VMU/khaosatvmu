using System.Security.Claims;

namespace Application.Auth;

/// <summary>
/// Một hồ sơ của người đăng nhập. <paramref name="DataScope"/> và <paramref name="CanWrite"/>
/// lấy từ vai trò, để giao diện chọn màn hình và ẩn nút ghi mà không phải đoán theo mã vai trò.
/// </summary>
public sealed record AuthProfileDto(
    Guid Id,
    string Name,
    string Code,
    string RoleCode,
    string? OrganizationUnitCode,
    string? OrganizationUnitName,
    bool IsDefault,
    string RoleName = "",
    string DataScope = "DEPARTMENT",
    bool CanWrite = false);

public sealed record AuthUserDto(
    Guid Id,
    string Email,
    string? DisplayName,
    string? AvatarUrl);

public sealed record AuthMeResponse(
    bool Authenticated,
    AuthUserDto? User,
    AuthProfileDto? ActiveProfile,
    IReadOnlyList<AuthProfileDto> AvailableProfiles);

public sealed record AuthAccessResponse(
    Guid ProfileId,
    string RoleCode,
    string? OrganizationUnitCode,
    IReadOnlyList<string> Permissions);

public sealed record SignInResult(
    bool Succeeded,
    string? ErrorCode,
    AuthMeResponse? Response,
    IReadOnlyList<AuthProfileDto>? AvailableProfiles,
    Guid? PendingUserId = null);

public sealed record ProfileSelectionResult(
    bool Succeeded,
    string? ErrorCode,
    AuthMeResponse? Response);

public sealed record SignOutResult(bool Succeeded);

public sealed record GoogleIdentity(
    string Subject,
    string Email,
    string? DisplayName,
    string? AvatarUrl,
    bool EmailVerified);

public sealed record GoogleSignInResult(
    bool Succeeded,
    string? ErrorCode,
    Guid? PendingUserId,
    AuthMeResponse? Response,
    IReadOnlyList<AuthProfileDto>? AvailableProfiles);

public interface IAuthService
{
    Task<AuthMeResponse> GetCurrentAsync(ClaimsPrincipal? principal);
    Task<AuthAccessResponse?> GetAccessAsync(ClaimsPrincipal? principal);
    Task<GoogleSignInResult> GoogleSignInAsync(GoogleIdentity identity);
    Task<SignInResult> DevSignInAsync(string email);
    Task<IReadOnlyList<AuthProfileDto>> GetAvailableProfilesAsync(Guid userId);
    Task<ProfileSelectionResult> SelectInitialProfileAsync(Guid userId, Guid profileId);
    Task<ProfileSelectionResult> SelectProfileAsync(ClaimsPrincipal? principal, Guid profileId);
    Task<SignOutResult> SignOutAsync(ClaimsPrincipal? principal);
    Task<bool> HasPermissionAsync(
        ClaimsPrincipal? principal,
        string permissionCode,
        string? resourceOrganizationUnitCode = null);
    Task<bool> HasAnyPermissionAsync(
        ClaimsPrincipal? principal,
        IReadOnlyCollection<string> permissionCodes,
        string? resourceOrganizationUnitCode = null);
}

public abstract record AuthErrorCodes
{
    public const string UserNotRegistered = "AUTH_USER_NOT_REGISTERED";
    public const string AccountDisabled = "AUTH_ACCOUNT_DISABLED";
    public const string EmailNotVerified = "AUTH_EMAIL_NOT_VERIFIED";
    public const string InvalidGoogleIdentity = "AUTH_INVALID_GOOGLE_IDENTITY";
    public const string NoProfiles = "AUTH_NO_PROFILE";
    public const string ProfileSelectionRequired = "AUTH_PROFILE_SELECTION_REQUIRED";
    public const string ProfileNotFound = "AUTH_PROFILE_NOT_FOUND";
    public const string ProfileDisabled = "AUTH_PROFILE_DISABLED";
    public const string AccountLinkConflict = "AUTH_ACCOUNT_LINK_CONFLICT";
    public const string SessionExpired = "AUTH_SESSION_EXPIRED";
}
