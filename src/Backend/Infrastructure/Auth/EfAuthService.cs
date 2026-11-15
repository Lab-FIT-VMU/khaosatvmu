using System.Security.Claims;
using System.Text.Json;
using Application.Auth;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Auth;

public sealed class EfAuthService(AppDbContext db) : IAuthService
{
    private (Guid UserId, Guid ProfileId)? cachedPrincipalKey;
    private Task<PrincipalState?>? cachedPrincipalState;
    private Guid? cachedPermissionRoleId;
    private Task<HashSet<string>>? cachedPermissionCodes;

    public async Task<AuthMeResponse> GetCurrentAsync(ClaimsPrincipal? principal)
    {
        var state = await ResolvePrincipalStateAsync(principal);
        return state is null
            ? new AuthMeResponse(false, null, null, [])
            : await BuildResponseAsync(state.User, state.Profile);
    }

    public async Task<AuthAccessResponse?> GetAccessAsync(ClaimsPrincipal? principal)
    {
        var state = await ResolvePrincipalStateAsync(principal);
        if (state is null)
        {
            return null;
        }

        var permissions = await ResolvePermissionCodesAsync(state.Profile.RoleId);
        return new AuthAccessResponse(
            state.Profile.Id,
            state.RoleCode,
            state.Profile.OrganizationUnitCode,
            permissions.OrderBy(x => x).ToList());
    }

    public async Task<GoogleSignInResult> GoogleSignInAsync(GoogleIdentity identity)
    {
        if (string.IsNullOrWhiteSpace(identity.Subject) || string.IsNullOrWhiteSpace(identity.Email))
        {
            return new GoogleSignInResult(false, AuthErrorCodes.InvalidGoogleIdentity, null, null, null);
        }

        if (!identity.EmailVerified)
        {
            return new GoogleSignInResult(false, AuthErrorCodes.EmailNotVerified, null, null, null);
        }

        var normalizedEmail = identity.Email.Trim().ToLowerInvariant();
        var userBySubject = await db.Users.SingleOrDefaultAsync(x => x.GoogleSubject == identity.Subject);
        var userByEmail = await db.Users.SingleOrDefaultAsync(x => x.Email.ToLower() == normalizedEmail);
        if (userBySubject is not null && userBySubject.Id != userByEmail?.Id)
        {
            return new GoogleSignInResult(false, AuthErrorCodes.AccountLinkConflict, null, null, null);
        }

        var user = userBySubject ?? userByEmail;
        if (user is null)
        {
            return new GoogleSignInResult(false, AuthErrorCodes.UserNotRegistered, null, null, null);
        }

        if (!string.IsNullOrWhiteSpace(user.GoogleSubject)
            && !string.Equals(user.GoogleSubject, identity.Subject, StringComparison.Ordinal))
        {
            return new GoogleSignInResult(false, AuthErrorCodes.AccountLinkConflict, null, null, null);
        }

        if (!user.IsActive)
        {
            return new GoogleSignInResult(false, AuthErrorCodes.AccountDisabled, null, null, null);
        }

        user.GoogleSubject ??= identity.Subject;
        user.DisplayName = identity.DisplayName ?? user.DisplayName;
        user.AvatarUrl = identity.AvatarUrl ?? user.AvatarUrl;
        user.UpdatedAt = DateTime.UtcNow;

        var profiles = await GetProfilesAsync(user.Id);
        if (profiles.Count == 0)
        {
            AddAudit(user, null, "GOOGLE_LOGIN_NO_PROFILE");
            await db.SaveChangesAsync();
            return new GoogleSignInResult(false, AuthErrorCodes.NoProfiles, null, null, null);
        }

        AddAudit(user, null, "GOOGLE_LOGIN_PROFILE_REQUIRED");
        await db.SaveChangesAsync();
        return new GoogleSignInResult(false, AuthErrorCodes.ProfileSelectionRequired, user.Id, null, profiles);
    }

    public async Task<SignInResult> DevSignInAsync(string email)
    {
        var user = await db.Users.SingleOrDefaultAsync(x => x.Email.ToLower() == email.ToLower());
        if (user is null)
        {
            return new SignInResult(false, AuthErrorCodes.UserNotRegistered, null, null);
        }

        if (!user.IsActive)
        {
            return new SignInResult(false, AuthErrorCodes.AccountDisabled, null, null);
        }

        var profiles = await GetProfilesAsync(user.Id);
        if (profiles.Count == 0)
        {
            return new SignInResult(false, AuthErrorCodes.NoProfiles, null, null);
        }

        return new SignInResult(
            false,
            AuthErrorCodes.ProfileSelectionRequired,
            null,
            profiles,
            user.Id);
    }

    public async Task<ProfileSelectionResult> SelectProfileAsync(ClaimsPrincipal? principal, Guid profileId)
    {
        var userId = GetGuidClaim(principal, ClaimTypes.NameIdentifier);
        if (userId is null)
        {
            return new ProfileSelectionResult(false, AuthErrorCodes.SessionExpired, null);
        }

        return await SelectProfileForUserAsync(userId.Value, profileId, "PROFILE_SWITCHED");
    }

    public Task<IReadOnlyList<AuthProfileDto>> GetAvailableProfilesAsync(Guid userId) =>
        GetProfilesAsReadOnlyAsync(userId);

    public Task<ProfileSelectionResult> SelectInitialProfileAsync(Guid userId, Guid profileId) =>
        SelectProfileForUserAsync(userId, profileId, "LOGIN_SUCCESS");

    private async Task<ProfileSelectionResult> SelectProfileForUserAsync(Guid userId, Guid profileId, string eventName)
    {
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == userId);
        var profile = await db.UserProfiles.SingleOrDefaultAsync(x => x.Id == profileId && x.UserId == userId);
        if (user is null || profile is null)
        {
            return new ProfileSelectionResult(false, AuthErrorCodes.ProfileNotFound, null);
        }

        if (!user.IsActive || !profile.IsActive)
        {
            return new ProfileSelectionResult(false, AuthErrorCodes.ProfileDisabled, null);
        }

        return new ProfileSelectionResult(true, null, await CompleteSignInAsync(user, profile, eventName));
    }

    public async Task<SignOutResult> SignOutAsync(ClaimsPrincipal? principal)
    {
        var state = await ResolvePrincipalStateAsync(principal);
        if (state is null)
        {
            return new SignOutResult(true);
        }

        AddAudit(state.User, state.Profile, "LOGOUT");
        await db.SaveChangesAsync();
        return new SignOutResult(true);
    }

    public async Task<bool> HasPermissionAsync(
        ClaimsPrincipal? principal,
        string permissionCode,
        string? resourceOrganizationUnitCode = null)
        => await HasAnyPermissionAsync(
            principal,
            [permissionCode],
            resourceOrganizationUnitCode);

    public async Task<bool> HasAnyPermissionAsync(
        ClaimsPrincipal? principal,
        IReadOnlyCollection<string> permissionCodes,
        string? resourceOrganizationUnitCode = null)
    {
        if (permissionCodes.Count == 0)
        {
            return false;
        }

        var state = await ResolvePrincipalStateAsync(principal);
        if (state is null)
        {
            return false;
        }

        var grantedPermissions = await ResolvePermissionCodesAsync(state.Profile.RoleId);
        var hasPermission = permissionCodes.Any(grantedPermissions.Contains);

        if (!hasPermission || string.IsNullOrWhiteSpace(resourceOrganizationUnitCode))
        {
            return hasPermission;
        }

        return string.IsNullOrWhiteSpace(state.Profile.OrganizationUnitCode)
            || string.Equals(
                state.Profile.OrganizationUnitCode,
                resourceOrganizationUnitCode,
                StringComparison.OrdinalIgnoreCase);
    }

    private Task<PrincipalState?> ResolvePrincipalStateAsync(ClaimsPrincipal? principal)
    {
        var userId = GetGuidClaim(principal, ClaimTypes.NameIdentifier);
        var profileId = GetGuidClaim(principal, "active_profile_id");
        if (userId is null || profileId is null)
        {
            return Task.FromResult<PrincipalState?>(null);
        }

        var key = (UserId: userId.Value, ProfileId: profileId.Value);
        if (cachedPrincipalKey != key || cachedPrincipalState is null)
        {
            cachedPrincipalKey = key;
            cachedPrincipalState = LoadPrincipalStateAsync(key.UserId, key.ProfileId);
        }

        return cachedPrincipalState;
    }

    private async Task<PrincipalState?> LoadPrincipalStateAsync(Guid userId, Guid profileId)
    {
        var state = await (
            from user in db.Users
            join profile in db.UserProfiles on user.Id equals profile.UserId
            join role in db.Roles on profile.RoleId equals role.Id
            where user.Id == userId
                  && user.IsActive
                  && profile.Id == profileId
                  && profile.IsActive
            select new { User = user, Profile = profile, RoleCode = role.Code })
            .SingleOrDefaultAsync();

        return state is null
            ? null
            : new PrincipalState(state.User, state.Profile, state.RoleCode);
    }

    private Task<HashSet<string>> ResolvePermissionCodesAsync(Guid roleId)
    {
        if (cachedPermissionRoleId != roleId || cachedPermissionCodes is null)
        {
            cachedPermissionRoleId = roleId;
            cachedPermissionCodes = LoadPermissionCodesAsync(roleId);
        }

        return cachedPermissionCodes;
    }

    private async Task<HashSet<string>> LoadPermissionCodesAsync(Guid roleId) =>
        (await GetPermissionCodesAsync(roleId)).ToHashSet(StringComparer.Ordinal);

    private async Task<AuthMeResponse> CompleteSignInAsync(User user, UserProfile profile, string eventName)
    {
        var now = DateTime.UtcNow;
        profile.LastSelectedAt = now;
        user.FirstLoginAt ??= now;
        user.LastLoginAt = now;
        user.UpdatedAt = now;
        AddAudit(user, profile, eventName);
        await db.SaveChangesAsync();
        return await BuildResponseAsync(user, profile);
    }

    private async Task<AuthMeResponse> BuildResponseAsync(User user, UserProfile activeProfile)
    {
        var profiles = await GetProfilesAsync(user.Id);
        var active = profiles.SingleOrDefault(x => x.Id == activeProfile.Id);
        return new AuthMeResponse(
            true,
            new AuthUserDto(user.Id, user.Email, user.DisplayName, user.AvatarUrl),
            active,
            profiles);
    }

    private Task<List<AuthProfileDto>> GetProfilesAsync(Guid userId) =>
        (from profile in db.UserProfiles
         join role in db.Roles on profile.RoleId equals role.Id
         where profile.UserId == userId && profile.IsActive
         orderby profile.IsDefault descending, profile.ProfileName
         select new AuthProfileDto(
             profile.Id,
             profile.ProfileName,
             profile.ProfileCode,
             role.Code,
             profile.OrganizationUnitCode,
             profile.OrganizationUnitName,
             profile.IsDefault,
             role.Name,
             role.DataScope,
             role.CanWrite)).ToListAsync();

    private Task<List<string>> GetPermissionCodesAsync(Guid roleId) =>
        (from rolePermission in db.RolePermissions
         join permission in db.Permissions on rolePermission.PermissionId equals permission.Id
         where rolePermission.RoleId == roleId && rolePermission.IsGranted
         orderby permission.Code
         select permission.Code).ToListAsync();

    private async Task<IReadOnlyList<AuthProfileDto>> GetProfilesAsReadOnlyAsync(Guid userId) =>
        await GetProfilesAsync(userId);

    private void AddAudit(User user, UserProfile? profile, string eventName)
    {
        db.AuthAuditLogs.Add(new AuthAuditLog
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            ProfileId = profile?.Id,
            Email = user.Email,
            Event = eventName,
            CreatedAt = DateTime.UtcNow,
            Metadata = profile is null
                ? null
                : JsonSerializer.Serialize(new { profile.ProfileCode, profile.ProfileName })
        });
    }

    private static Guid? GetGuidClaim(ClaimsPrincipal? principal, string claimType) =>
        Guid.TryParse(principal?.FindFirst(claimType)?.Value, out var value) ? value : null;

    private sealed record PrincipalState(User User, UserProfile Profile, string RoleCode);
}
