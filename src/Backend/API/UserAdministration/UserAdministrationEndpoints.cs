using System.Security.Claims;
using API.Auth;
using Application.UserAdministration;

namespace API.UserAdministration;

public static class UserAdministrationEndpoints
{
    public static IEndpointRouteBuilder MapUserAdministrationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/admin")
            .RequireAuthorization(AuthPolicies.UserAdminAccess);

        group.MapGet("/users", async (
            string? search,
            bool? isActive,
            int page,
            int pageSize,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetUsersAsync(search, isActive, page, pageSize, cancellationToken)));

        group.MapPost("/users", async (
            CreateUserRequest request,
            ClaimsPrincipal principal,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
        {
            var actorUserId = GetRequiredGuidClaim(principal, ClaimTypes.NameIdentifier);
            var result = await service.CreateUserAsync(
                new CreateAdminUserCommand(request.Email, request.DisplayName),
                actorUserId,
                cancellationToken);
            return ToResult(result);
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/users/import", async (
            ImportUsersRequest request,
            ClaimsPrincipal principal,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
        {
            var commands = request.Users?
                .Select(x => new ImportAdminUserRowCommand(x.RowNumber, x.Email ?? string.Empty, x.DisplayName))
                .ToList() ?? [];
            var result = await service.ImportUsersAsync(
                commands,
                GetRequiredGuidClaim(principal, ClaimTypes.NameIdentifier),
                cancellationToken);
            return ToResult(result);
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        // Cấp hồ sơ Giảng viên cho mọi tài khoản chưa có hồ sơ nào, một cú bấm.
        group.MapPost("/users/profiles/bulk-lecturer", async (
            ClaimsPrincipal principal,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.BulkCreateLecturerProfilesAsync(
                GetRequiredGuidClaim(principal, ClaimTypes.NameIdentifier),
                cancellationToken);
            return ToResult(result);
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        // Cấp hồ sơ theo tệp Excel: mỗi dòng một email kèm tên vai trò.
        group.MapPost("/users/profiles/import", async (
            ImportProfilesRequest request,
            ClaimsPrincipal principal,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
        {
            var commands = request.Profiles?
                .Select(x => new ImportAdminProfileRowCommand(x.RowNumber, x.Email ?? string.Empty, x.RoleLabel))
                .ToList() ?? [];
            var result = await service.ImportProfilesAsync(
                commands,
                GetRequiredGuidClaim(principal, ClaimTypes.NameIdentifier),
                cancellationToken);
            return ToResult(result);
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPatch("/users/{userId:guid}/status", async (
            Guid userId,
            SetStatusRequest request,
            ClaimsPrincipal principal,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.SetUserStatusAsync(
                userId,
                request.IsActive,
                GetRequiredGuidClaim(principal, ClaimTypes.NameIdentifier),
                cancellationToken);
            return ToResult(result);
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPost("/users/{userId:guid}/profiles", async (
            Guid userId,
            SaveProfileRequest request,
            ClaimsPrincipal principal,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.CreateProfileAsync(
                userId,
                request.ToCommand(),
                GetRequiredGuidClaim(principal, ClaimTypes.NameIdentifier),
                cancellationToken);
            return ToResult(result);
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPut("/users/{userId:guid}/profiles/{profileId:guid}", async (
            Guid userId,
            Guid profileId,
            SaveProfileRequest request,
            ClaimsPrincipal principal,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.UpdateProfileAsync(
                userId,
                profileId,
                request.ToCommand(),
                GetRequiredGuidClaim(principal, ClaimTypes.NameIdentifier),
                GetRequiredGuidClaim(principal, AuthClaimTypes.ActiveProfileId),
                cancellationToken);
            return ToResult(result);
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapPatch("/users/{userId:guid}/profiles/{profileId:guid}/status", async (
            Guid userId,
            Guid profileId,
            SetStatusRequest request,
            ClaimsPrincipal principal,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.SetProfileStatusAsync(
                userId,
                profileId,
                request.IsActive,
                GetRequiredGuidClaim(principal, ClaimTypes.NameIdentifier),
                GetRequiredGuidClaim(principal, AuthClaimTypes.ActiveProfileId),
                cancellationToken);
            return ToResult(result);
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapGet("/roles", async (
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetRolesAsync(cancellationToken)));

        group.MapGet("/audit-logs", async (
            Guid? userId,
            int page,
            int pageSize,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetAuditLogsAsync(userId, page, pageSize, cancellationToken)));

        group.MapGet("/permissions", async (
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetPermissionsAsync(cancellationToken)));

        group.MapGet("/role-permissions", async (
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetRolePermissionMatrixAsync(cancellationToken)));

        group.MapGet("/roles/{roleId:guid}/permissions", async (
            Guid roleId,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.GetRolePermissionsAsync(roleId, cancellationToken);
            return result is null ? Results.NotFound() : Results.Ok(result);
        });

        group.MapPut("/roles/{roleId:guid}/permissions", async (
            Guid roleId,
            UpdateRolePermissionsRequest request,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
        {
            var grants = request.Grants?
                .Select(g => new Application.UserAdministration.RolePermissionGrantDto(g.PermissionId, g.IsGranted))
                .ToList() ?? [];
            var result = await service.UpdateRolePermissionsAsync(roleId, grants, cancellationToken);
            return result.Succeeded ? Results.NoContent() : ToResult(result);
        }).AddEndpointFilter<RequireAntiforgeryFilter>();

        group.MapGet("/change-audit-logs", async (
            string? tableName,
            string? recordId,
            int page,
            int pageSize,
            IUserAdministrationService service,
            CancellationToken cancellationToken) =>
            Results.Ok(await service.GetChangeAuditLogsAsync(tableName, recordId, page, pageSize, cancellationToken)));

        return endpoints;
    }

    private static IResult ToResult<T>(AdminOperationResult<T> result)
    {
        if (result.Succeeded && result.Value is not null)
        {
            return Results.Ok(result.Value);
        }

        var statusCode = result.ErrorCode switch
        {
            UserAdministrationErrorCodes.UserNotFound => StatusCodes.Status404NotFound,
            UserAdministrationErrorCodes.ProfileNotFound => StatusCodes.Status404NotFound,
            UserAdministrationErrorCodes.RoleNotFound => StatusCodes.Status404NotFound,
            UserAdministrationErrorCodes.UserEmailExists => StatusCodes.Status409Conflict,
            UserAdministrationErrorCodes.ProfileCodeExists => StatusCodes.Status409Conflict,
            UserAdministrationErrorCodes.ProfileAssignmentExists => StatusCodes.Status409Conflict,
            UserAdministrationErrorCodes.CannotDisableSelf => StatusCodes.Status409Conflict,
            UserAdministrationErrorCodes.CannotModifyActiveProfile => StatusCodes.Status409Conflict,
            UserAdministrationErrorCodes.CannotRevokeRequiredPermission => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };
        return Results.Json(new { errorCode = result.ErrorCode }, statusCode: statusCode);
    }

    private static Guid GetRequiredGuidClaim(ClaimsPrincipal principal, string claimType) =>
        Guid.TryParse(principal.FindFirst(claimType)?.Value, out var value)
            ? value
            : throw new InvalidOperationException($"Required claim '{claimType}' is missing.");

    public sealed record CreateUserRequest(string Email, string? DisplayName);

    public sealed record ImportUsersRequest(IReadOnlyList<ImportUserRowRequest>? Users);

    public sealed record ImportUserRowRequest(int RowNumber, string Email, string? DisplayName);

    public sealed record ImportProfilesRequest(IReadOnlyList<ImportProfileRowRequest>? Profiles);

    public sealed record ImportProfileRowRequest(int RowNumber, string Email, string? RoleLabel);

    public sealed record SetStatusRequest(bool IsActive);

    public sealed record SaveProfileRequest(
        string Name,
        Guid RoleId,
        string? OrganizationUnitCode,
        string? OrganizationUnitName,
        bool IsDefault)
    {
        public SaveAdminProfileCommand ToCommand() => new(
            Name,
            RoleId,
            OrganizationUnitCode,
            OrganizationUnitName,
            IsDefault);
    }

    public sealed record UpdateRolePermissionsRequest(IReadOnlyList<PermissionGrantRequest>? Grants);

    public sealed record PermissionGrantRequest(Guid PermissionId, bool IsGranted);
}
