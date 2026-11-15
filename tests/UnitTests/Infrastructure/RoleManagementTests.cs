namespace UnitTests.InfrastructureTests;

using Application.Auth;
using Application.UserAdministration;
using Domain;
using FluentAssertions;
using global::Infrastructure.Persistence;
using global::Infrastructure.UserAdministration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Vai trò tùy biến: thêm (tối đa 8), sửa phạm vi / quyền ghi, xóa thì vô hiệu hóa mọi hồ
/// sơ đang mang vai trò đó. Chạy trên CSDL thật, bọc transaction rồi rollback. Không đặt
/// <c>ConnectionStrings__DefaultConnection</c> thì tự bỏ qua.
/// </summary>
public class RoleManagementTests
{
    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static async Task RunInRollbackAsync(Func<AppDbContext, EfUserAdministrationService, Task> body)
    {
        var connectionString = ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = connectionString,
            })
            .Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddPersistence(configuration);

        await using var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await using var transaction = await db.Database.BeginTransactionAsync();
        try
        {
            await body(db, new EfUserAdministrationService(db));
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }

    private static SaveRoleCommand Command(string name, string scope = RoleDataScopes.Department, bool canWrite = false, string? suffix = null) =>
        new(name, null, scope, canWrite, suffix ?? ("T" + Random.Shared.Next(100, 999)));

    /// <summary>
    /// Đưa số vai trò đang dùng về đúng <paramref name="keep"/>: xóa bớt vai trò không hệ thống,
    /// hoặc thêm vai trò đệm.
    /// </summary>
    private static async Task TrimRolesAsync(AppDbContext db, int keep)
    {
        var removable = await db.Roles.Where(x => !x.IsSystem).OrderBy(x => x.Name).ToListAsync();
        var total = await db.Roles.CountAsync();
        foreach (var role in removable.Take(Math.Max(0, total - keep)))
        {
            db.Roles.Remove(role);
        }
        for (var index = total; index < keep; index++)
        {
            db.Roles.Add(new Role
            {
                Id = Guid.NewGuid(),
                Code = "ROLE_PAD_" + index,
                Name = "Vai trò đệm " + index,
                DataScope = RoleDataScopes.Department,
                ProfileCodeSuffix = "P" + index,
            });
        }
        await db.SaveChangesAsync();
    }

    private static async Task<(User User, UserProfile Profile)> AddUserWithProfileAsync(
        AppDbContext db, Guid roleId, bool isDefault)
    {
        var now = DateTime.UtcNow;
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = $"role-test-{Guid.NewGuid():N}@vimaru.edu.vn",
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Users.Add(user);
        var profile = await AddProfileAsync(db, user, roleId, isDefault);
        return (user, profile);
    }

    private static async Task<UserProfile> AddProfileAsync(AppDbContext db, User user, Guid roleId, bool isDefault)
    {
        var now = DateTime.UtcNow;
        var profile = new UserProfile
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            RoleId = roleId,
            ProfileName = "Thử",
            ProfileCode = "T" + Guid.NewGuid().ToString("N")[..20],
            IsActive = true,
            IsDefault = isDefault,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.UserProfiles.Add(profile);
        await db.SaveChangesAsync();
        return profile;
    }

    [Fact]
    public async Task CreateRole_StoresScopeAndWrite_AndListsIt()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            await TrimRolesAsync(db, RoleRules.MaximumRoles - 1);

            var created = await service.CreateRoleAsync(Command("Thanh tra khoa", RoleDataScopes.Faculty, canWrite: false, suffix: "TK"));

            created.Succeeded.Should().BeTrue(created.ErrorCode);
            created.Value!.DataScope.Should().Be(RoleDataScopes.Faculty);
            created.Value.CanWrite.Should().BeFalse();
            created.Value.IsSystem.Should().BeFalse();
            (await service.GetRolesAsync()).Should().Contain(x => x.Name == "Thanh tra khoa" && x.ProfileCodeSuffix == "TK");
        });
    }

    [Fact]
    public async Task CreateRole_BeyondEight_IsRejected()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            await TrimRolesAsync(db, RoleRules.MaximumRoles - 1);
            (await service.CreateRoleAsync(Command("Vai trò thứ tám", suffix: "V8"))).Succeeded.Should().BeTrue();

            var ninth = await service.CreateRoleAsync(Command("Vai trò thứ chín", suffix: "V9"));

            ninth.ErrorCode.Should().Be(UserAdministrationErrorCodes.RoleLimitReached);
        });
    }

    [Fact]
    public async Task CreateRole_RejectsDuplicateNameSuffixAndWritableOwnScope()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            await TrimRolesAsync(db, RoleRules.MaximumRoles - 1);

            (await service.CreateRoleAsync(Command("Giảng viên", suffix: "ZZ"))).ErrorCode
                .Should().Be(UserAdministrationErrorCodes.RoleNameExists);
            (await service.CreateRoleAsync(Command("Tên mới", suffix: "AD"))).ErrorCode
                .Should().Be(UserAdministrationErrorCodes.RoleSuffixExists);
            (await service.CreateRoleAsync(Command("Tên mới", suffix: "a"))).ErrorCode
                .Should().Be(UserAdministrationErrorCodes.RoleSuffixInvalid);
            (await service.CreateRoleAsync(Command("Tên mới", RoleDataScopes.Own, canWrite: true, suffix: "ZZ"))).ErrorCode
                .Should().Be(UserAdministrationErrorCodes.RoleOwnScopeCannotWrite);
        });
    }

    [Fact]
    public async Task UpdateRole_AdminScopeIsLocked_AndRenameFollowsProfiles()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            var admin = await db.Roles.SingleAsync(x => x.Code == RoleCodes.Admin);
            (await service.UpdateRoleAsync(admin.Id, new SaveRoleCommand(admin.Name, null, RoleDataScopes.All, false, admin.ProfileCodeSuffix)))
                .ErrorCode.Should().Be(UserAdministrationErrorCodes.AdminRoleScopeLocked);

            await TrimRolesAsync(db, RoleRules.MaximumRoles - 1);
            var role = (await service.CreateRoleAsync(Command("Trợ lý", suffix: "TL"))).Value!;
            var (_, profile) = await AddUserWithProfileAsync(db, role.Id, isDefault: true);

            var updated = await service.UpdateRoleAsync(role.Id, Command("Trợ lý khoa", RoleDataScopes.Faculty, canWrite: true, suffix: "TL"));

            updated.Succeeded.Should().BeTrue(updated.ErrorCode);
            updated.Value!.ActiveProfileCount.Should().Be(1);
            (await db.UserProfiles.AsNoTracking().SingleAsync(x => x.Id == profile.Id)).ProfileName.Should().Be("Trợ lý khoa");
        });
    }

    [Fact]
    public async Task DeleteRole_DisablesItsProfiles_AndPicksAnotherDefault()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            await TrimRolesAsync(db, RoleRules.MaximumRoles - 1);
            var role = (await service.CreateRoleAsync(Command("Sắp xóa", suffix: "SX"))).Value!;
            var lecturerRole = await db.Roles.SingleAsync(x => x.Code == RoleCodes.Lecturer);

            // Người thứ nhất: hồ sơ bị xóa đang là mặc định, còn hồ sơ Giảng viên.
            var (first, firstProfile) = await AddUserWithProfileAsync(db, role.Id, isDefault: true);
            var firstOther = await AddProfileAsync(db, first, lecturerRole.Id, isDefault: false);
            // Người thứ hai: chỉ có đúng hồ sơ bị xóa.
            var (_, secondProfile) = await AddUserWithProfileAsync(db, role.Id, isDefault: true);
            db.AuthSessions.Add(new AuthSession
            {
                Id = Guid.NewGuid(),
                UserId = first.Id,
                ActiveProfileId = firstProfile.Id,
                CreatedAt = DateTime.UtcNow,
                ExpiresAt = DateTime.UtcNow.AddHours(1),
            });
            await db.SaveChangesAsync();

            var deleted = await service.DeleteRoleAsync(role.Id, Guid.NewGuid(), Guid.NewGuid());

            deleted.Succeeded.Should().BeTrue(deleted.ErrorCode);
            deleted.Value.Should().Be(new RoleDeletionDto(2, 1));
            db.ChangeTracker.Clear();
            (await db.UserProfiles.SingleAsync(x => x.Id == firstProfile.Id)).IsActive.Should().BeFalse();
            (await db.UserProfiles.SingleAsync(x => x.Id == secondProfile.Id)).IsActive.Should().BeFalse();
            (await db.UserProfiles.SingleAsync(x => x.Id == firstOther.Id)).IsDefault.Should().BeTrue();
            (await db.AuthSessions.Where(x => x.ActiveProfileId == firstProfile.Id).Select(x => x.RevokedAt).SingleAsync())
                .Should().NotBeNull("phiên đang dùng hồ sơ bị vô hiệu hóa phải bị đăng xuất");
            (await db.Roles.AnyAsync(x => x.Id == role.Id)).Should().BeFalse();
            (await db.Roles.IgnoreQueryFilters().AnyAsync(x => x.Id == role.Id && x.IsDeleted)).Should().BeTrue();
        });
    }

    [Fact]
    public async Task DeleteRole_SystemRolesAndOwnRoleAreProtected()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            var admin = await db.Roles.SingleAsync(x => x.Code == RoleCodes.Admin);
            var lecturer = await db.Roles.SingleAsync(x => x.Code == RoleCodes.Lecturer);
            (await service.DeleteRoleAsync(admin.Id, Guid.NewGuid(), Guid.NewGuid())).ErrorCode
                .Should().Be(UserAdministrationErrorCodes.RoleSystemLocked);
            (await service.DeleteRoleAsync(lecturer.Id, Guid.NewGuid(), Guid.NewGuid())).ErrorCode
                .Should().Be(UserAdministrationErrorCodes.RoleSystemLocked);

            await TrimRolesAsync(db, RoleRules.MaximumRoles - 1);
            var role = (await service.CreateRoleAsync(Command("Của mình", suffix: "CM"))).Value!;
            var (user, profile) = await AddUserWithProfileAsync(db, role.Id, isDefault: true);
            (await service.DeleteRoleAsync(role.Id, user.Id, profile.Id)).ErrorCode
                .Should().Be(UserAdministrationErrorCodes.CannotDeleteOwnRole);
        });
    }
}
