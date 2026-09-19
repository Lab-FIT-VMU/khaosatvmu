namespace UnitTests.InfrastructureTests;

using Application.Auth;
using Application.Catalog;
using FluentAssertions;
using global::Infrastructure.Catalog;
using global::Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

/// <summary>
/// Kiểm chứng thêm giảng viên thì sinh luôn tài khoản và hồ sơ Giảng viên. Người có
/// chức vụ Trưởng/Phó Trưởng bộ môn được sinh thêm hồ sơ Trưởng bộ môn.
///
/// Các test này chạy trên cơ sở dữ liệu thật vì phần cần kiểm nằm ở tầng EF và ở
/// interceptor xoá mềm — dùng provider giả thì không kiểm được gì. Mỗi test bọc trong
/// một transaction rồi rollback nên không để lại dấu vết. Không đặt biến môi trường
/// <c>ConnectionStrings__DefaultConnection</c> thì test tự bỏ qua.
/// </summary>
public class LecturerAccountProvisioningTests
{
    private sealed class UnrestrictedScopeResolver : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(UserScope.Unrestricted(RoleCodes.Admin));
    }

    private static string? ConnectionString =>
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

    private static ServiceProvider BuildProvider(string connectionString)
    {
        var services = new ServiceCollection();
        services.AddHttpContextAccessor();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = connectionString,
            })
            .Build());
        services.AddPersistence(services.BuildServiceProvider().GetRequiredService<IConfiguration>());
        return services.BuildServiceProvider();
    }

    private static async Task RunInRollbackAsync(Func<AppDbContext, EfCatalogService, Task> body)
    {
        var connectionString = ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        await using var provider = BuildProvider(connectionString);
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        // Các test ở đây chỉ quan tâm luồng tạo tài khoản chứ không quan tâm phạm vi
        // dữ liệu, nên đưa vào phạm vi quản trị cho gọn.
        var service = new EfCatalogService(db, new UnrestrictedScopeResolver());

        await using var transaction = await db.Database.BeginTransactionAsync();
        try
        {
            await body(db, service);
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }

    private static SaveLecturerCommand NewLecturer(string email) =>
        new($"Kiem Thu {Guid.NewGuid():N}"[..24], null, null, email, null, null);

    [Fact]
    public async Task CreateLecturer_ShouldCreateLinkedAccount_WithDefaultLecturerProfile()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            var email = $"kiemthu-{Guid.NewGuid():N}@vimaru.edu.vn";

            var result = await service.CreateLecturerAsync(NewLecturer(email));

            result.Succeeded.Should().BeTrue();
            var lecturerId = result.Value!.LecturerId;

            var user = await db.Users.SingleOrDefaultAsync(x => x.LecturerId == lecturerId);
            user.Should().NotBeNull("thêm giảng viên phải sinh kèm một tài khoản");
            user!.Email.Should().Be(email);
            user.IsActive.Should().BeTrue();
            user.GoogleSubject.Should().BeNull("tài khoản chưa đăng nhập lần nào");

            var profile = await (
                from item in db.UserProfiles
                join role in db.Roles on item.RoleId equals role.Id
                where item.UserId == user.Id
                select new { item.ProfileName, item.ProfileCode, item.IsActive, item.IsDefault, role.Code })
                .SingleAsync();
            profile.Code.Should().Be(RoleCodes.Lecturer);
            profile.ProfileName.Should().Be("Giảng viên");
            profile.ProfileCode.Should().EndWith("GV");
            profile.IsActive.Should().BeTrue();
            profile.IsDefault.Should().BeTrue();
        });
    }

    [Theory]
    [InlineData("Trưởng Bộ môn")]
    [InlineData("Phó Trưởng Bộ môn")]
    public async Task CreateLecturer_WithDepartmentLeadershipPosition_ShouldCreateManagerProfile(
        string positionName)
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            var positionId = await db.Positions
                .Where(x => x.PositionName == positionName)
                .Select(x => x.PositionId)
                .SingleAsync();
            var command = NewLecturer($"quanly-{Guid.NewGuid():N}@vimaru.edu.vn") with
            {
                PositionId = positionId,
            };

            var result = await service.CreateLecturerAsync(command);

            result.Succeeded.Should().BeTrue();
            var userId = await db.Users
                .Where(x => x.LecturerId == result.Value!.LecturerId)
                .Select(x => x.Id)
                .SingleAsync();
            var profiles = await (
                from profile in db.UserProfiles
                join role in db.Roles on profile.RoleId equals role.Id
                where profile.UserId == userId
                select new { role.Code, profile.IsDefault, profile.ProfileCode })
                .ToListAsync();

            profiles.Select(x => x.Code).Should().BeEquivalentTo(
                RoleCodes.Lecturer,
                RoleCodes.DepartmentManager);
            profiles.Single(x => x.Code == RoleCodes.Lecturer).IsDefault.Should().BeTrue();
            profiles.Single(x => x.Code == RoleCodes.DepartmentManager).IsDefault.Should().BeFalse();
            profiles.Single(x => x.Code == RoleCodes.DepartmentManager).ProfileCode.Should().EndWith("BM");
        });
    }

    [Fact]
    public async Task ImportLecturers_ShouldCreateProfilesForEveryImportedLecturer()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            var lecturerEmail = $"import-gv-{Guid.NewGuid():N}@vimaru.edu.vn";
            var managerEmail = $"import-bm-{Guid.NewGuid():N}@vimaru.edu.vn";
            var rows = new[]
            {
                new ImportLecturerRowCommand(2, "Giảng viên import", lecturerEmail, null, null, null, "Giảng viên"),
                new ImportLecturerRowCommand(3, "Quản lý import", managerEmail, null, null, null, "Phó Trưởng Bộ môn"),
            };

            var result = await service.ImportLecturersAsync(rows);

            result.Succeeded.Should().BeTrue();
            result.Value!.CreatedCount.Should().Be(2);
            var assignedRoles = await (
                from user in db.Users
                join profile in db.UserProfiles on user.Id equals profile.UserId
                join role in db.Roles on profile.RoleId equals role.Id
                where user.Email == lecturerEmail || user.Email == managerEmail
                select new { user.Email, role.Code, profile.IsDefault })
                .ToListAsync();

            assignedRoles.Where(x => x.Email == lecturerEmail)
                .Select(x => x.Code)
                .Should().Equal(RoleCodes.Lecturer);
            assignedRoles.Where(x => x.Email == managerEmail)
                .Select(x => x.Code)
                .Should().BeEquivalentTo(RoleCodes.Lecturer, RoleCodes.DepartmentManager);
            assignedRoles.Single(x => x.Email == managerEmail && x.Code == RoleCodes.Lecturer)
                .IsDefault.Should().BeTrue();
        });
    }

    [Fact]
    public async Task CreateLecturer_WithoutEmail_ShouldBeRejected()
    {
        await RunInRollbackAsync(async (_, service) =>
        {
            var result = await service.CreateLecturerAsync(NewLecturer(string.Empty));

            result.Succeeded.Should().BeFalse();
            result.ErrorCode.Should().Be(CatalogErrorCodes.LecturerEmailRequired);
        });
    }

    [Fact]
    public async Task UpdateLecturerEmail_ShouldFollowThrough_WhenAccountNeverSignedIn()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            var created = await service.CreateLecturerAsync(
                NewLecturer($"truoc-{Guid.NewGuid():N}@vimaru.edu.vn"));
            var lecturerId = created.Value!.LecturerId;
            var newEmail = $"sau-{Guid.NewGuid():N}@vimaru.edu.vn";

            var updated = await service.UpdateLecturerAsync(
                lecturerId,
                new SaveLecturerCommand(created.Value.FullName, null, null, newEmail, null, null));

            updated.Succeeded.Should().BeTrue();
            var user = await db.Users.SingleAsync(x => x.LecturerId == lecturerId);
            user.Email.Should().Be(newEmail, "chưa đăng nhập thì đổi email theo được");
        });
    }

    [Fact]
    public async Task UpdateLecturerEmail_ShouldNotTouchAccount_AfterFirstSignIn()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            var loginEmail = $"dadangnhap-{Guid.NewGuid():N}@vimaru.edu.vn";
            var created = await service.CreateLecturerAsync(NewLecturer(loginEmail));
            var lecturerId = created.Value!.LecturerId;

            // Giả lập người này đã đăng nhập một lần: Google đã gắn subject vào.
            var user = await db.Users.SingleAsync(x => x.LecturerId == lecturerId);
            user.GoogleSubject = $"google-{Guid.NewGuid():N}";
            await db.SaveChangesAsync();

            await service.UpdateLecturerAsync(
                lecturerId,
                new SaveLecturerCommand(
                    created.Value.FullName, null, null,
                    $"doi-{Guid.NewGuid():N}@vimaru.edu.vn", null, null));

            var after = await db.Users.SingleAsync(x => x.LecturerId == lecturerId);
            after.Email.Should().Be(loginEmail, "đã đăng nhập rồi thì email là danh tính, không sửa");
        });
    }

    [Fact]
    public async Task DeleteThenRestoreLecturer_ShouldLockThenUnlockAccount()
    {
        await RunInRollbackAsync(async (db, service) =>
        {
            var created = await service.CreateLecturerAsync(
                NewLecturer($"xoamem-{Guid.NewGuid():N}@vimaru.edu.vn"));
            var lecturerId = created.Value!.LecturerId;

            var deleted = await service.DeleteLecturerAsync(lecturerId);
            deleted.Succeeded.Should().BeTrue();

            db.ChangeTracker.Clear();
            var afterDelete = await db.Users.SingleAsync(x => x.LecturerId == lecturerId);
            afterDelete.IsActive.Should().BeFalse("xoá giảng viên thì khoá tài khoản");

            var restored = await service.RestoreLecturerAsync(lecturerId);
            restored.Succeeded.Should().BeTrue();

            db.ChangeTracker.Clear();
            var afterRestore = await db.Users.SingleAsync(x => x.LecturerId == lecturerId);
            afterRestore.IsActive.Should().BeTrue("khôi phục giảng viên thì mở lại tài khoản");
        });
    }
}
