namespace UnitTests.InfrastructureTests;

using Application.Auth;
using Application;
using Application.Catalog;
using Domain;
using FluentAssertions;
using global::Infrastructure.Catalog;
using global::Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Moq;
using Xunit;

public sealed class CatalogImportAtomicityTests
{
    private sealed class AdminScope : IUserScopeResolver
    {
        public Task<UserScope> ResolveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(UserScope.Unrestricted(RoleCodes.Admin));
    }

    // Fail AFTER the final save has reached PostgreSQL, so a missing
    // encompassing transaction would leave the import committed.
    private sealed class FailAfterSave(int failAt) : SaveChangesInterceptor
    {
        private int saves;

        public override ValueTask<int> SavedChangesAsync(
            SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            if (++saves == failAt) throw new InvalidOperationException("Injected import failure");
            return ValueTask.FromResult(result);
        }
    }

    private static AppDbContext Db(params IInterceptor[] interceptors) => new(
        new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection"))
            .AddInterceptors(interceptors).Options);

    [CatalogDatabaseTheory]
    [InlineData(1)]
    [InlineData(2)]
    public async Task LecturerDeletionFailure_RestoresAccountSessionsAndLecturer(int failAt)
    {
        var email = $"delete-atomic-{Guid.NewGuid():N}@example.com";
        await using var setup = Db();
        await DatabaseSeeder.SeedAsync(setup, false);
        try
        {
            var created = await new EfCatalogService(setup, new AdminScope())
                .CreateLecturerAsync(new("Atomic deletion", null, null, email, null, null));
            created.Succeeded.Should().BeTrue(created.ErrorCode);
            var lecturerId = created.Value!.LecturerId;
            var userId = await setup.Users.Where(x => x.LecturerId == lecturerId).Select(x => x.Id).SingleAsync();
            var profileId = await setup.UserProfiles.Where(x => x.UserId == userId && x.IsActive).Select(x => x.Id).FirstAsync();
            var ticket = await new global::Infrastructure.Auth.EfAuthSessionService(setup).CreateAsync(userId, profileId);

            await using (var faulty = Db(new AuditInterceptor(Mock.Of<ICurrentUserAccessor>()), new FailAfterSave(failAt)))
            {
                var service = new EfCatalogService(faulty, new AdminScope());
                Func<Task> delete = async () => { await service.DeleteLecturerAsync(lecturerId); };
                await delete.Should().ThrowAsync<InvalidOperationException>().WithMessage("Injected import failure");
            }

            await using var verify = Db();
            (await verify.Lecturers.IgnoreQueryFilters().SingleAsync(x => x.LecturerId == lecturerId)).IsDeleted.Should().BeFalse();
            var user = await verify.Users.SingleAsync(x => x.Id == userId);
            user.IsActive.Should().BeTrue();
            user.LecturerId.Should().Be(lecturerId);
            (await verify.AuthSessions.SingleAsync(x => x.Id == ticket.Id)).RevokedAt.Should().BeNull();
            (await new global::Infrastructure.Auth.EfAuthSessionService(verify).ValidateAsync(ticket.Id, userId, profileId))
                .Should().BeTrue();
        }
        finally
        {
            await using var cleanup = Db();
            var users = cleanup.Users.Where(x => x.Email == email);
            await cleanup.AuthSessions.Where(x => users.Select(u => u.Id).Contains(x.UserId)).ExecuteDeleteAsync();
            await cleanup.UserProfiles.Where(x => users.Select(u => u.Id).Contains(x.UserId)).ExecuteDeleteAsync();
            await users.ExecuteDeleteAsync();
            await cleanup.Lecturers.IgnoreQueryFilters().Where(x => x.Email == email).ExecuteDeleteAsync();
        }
    }

    [CatalogDatabaseTheory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task ImportFailure_RollsBackAllSaves(bool sections, bool restore)
    {
        var key = $"atomic-{Guid.NewGuid():N}";
        var email = $"{key}@example.com";
        int? originalLecturerId = null;
        Guid? originalUserId = null;
        int? yearId = null;
        int semesterId = 0;
        await using var setup = Db();
        await DatabaseSeeder.SeedAsync(setup, false);
        try
        {
            if (restore)
            {
                var service = new EfCatalogService(setup, new AdminScope());
                var created = await service.CreateLecturerAsync(new("Original lecturer", null, null, email, null, null));
                created.Succeeded.Should().BeTrue(created.ErrorCode);
                originalLecturerId = created.Value!.LecturerId;
                var lecturer = await setup.Lecturers.SingleAsync(x => x.LecturerId == originalLecturerId);
                var user = await setup.Users.SingleAsync(x => x.LecturerId == originalLecturerId);
                originalUserId = user.Id;
                lecturer.IsDeleted = true;
                lecturer.DeletedAt = DateTime.UtcNow;
                user.IsActive = false;
                await setup.SaveChangesAsync();
            }
            if (sections)
            {
                var year = new AcademicYear
                {
                    AcademicYearName = key, StartDate = new(2190, 1, 1), EndDate = new(2191, 1, 1)
                };
                setup.AcademicYears.Add(year);
                await setup.SaveChangesAsync();
                yearId = year.AcademicYearId;
                var semester = new Semester { AcademicYearId = year.AcademicYearId, SemesterName = key };
                setup.Semesters.Add(semester);
                await setup.SaveChangesAsync();
                semesterId = semester.SemesterId;
            }

            await using (var faulty = Db(new FailAfterSave(sections ? 4 : 2)))
            {
                var service = new EfCatalogService(faulty, new AdminScope());
                Func<Task> import = sections
                    ? async () => { await service.ImportCourseSectionsAsync(semesterId,
                        [new(1, key, "Atomic course", "A", "3", "10", null, null, null, "Updated lecturer", email)]); }
                    : async () => { await service.ImportLecturersAsync(
                        [new(1, "Updated lecturer", email, null, null, null, null)]); };
                await import.Should().ThrowAsync<InvalidOperationException>().WithMessage("Injected import failure");
            }

            await using var verify = Db();
            (await verify.Courses.IgnoreQueryFilters().AnyAsync(x => x.CourseCode == key)).Should().BeFalse();
            (await verify.CourseSections.IgnoreQueryFilters().AnyAsync(x => x.SemesterId == semesterId)).Should().BeFalse();
            if (restore)
            {
                var lecturer = await verify.Lecturers.IgnoreQueryFilters().SingleAsync(x => x.Email == email);
                lecturer.LecturerId.Should().Be(originalLecturerId);
                lecturer.IsDeleted.Should().BeTrue();
                lecturer.FullName.Should().Be("Original lecturer");
                var user = await verify.Users.SingleAsync(x => x.Email == email);
                user.Id.Should().Be(originalUserId!.Value);
                user.IsActive.Should().BeFalse();
            }
            else
            {
                (await verify.Lecturers.IgnoreQueryFilters().AnyAsync(x => x.Email == email)).Should().BeFalse();
                (await verify.Users.AnyAsync(x => x.Email == email)).Should().BeFalse();
            }
        }
        finally
        {
            // Only remove fixtures bearing this test's generated key.
            await using var cleanup = Db();
            var courses = cleanup.Courses.IgnoreQueryFilters().Where(x => x.CourseCode == key);
            await cleanup.CourseSections.IgnoreQueryFilters().Where(x => courses.Select(c => c.CourseId).Contains(x.CourseId)).ExecuteDeleteAsync();
            await courses.ExecuteDeleteAsync();
            var users = cleanup.Users.Where(x => x.Email == email);
            await cleanup.UserProfiles.Where(x => users.Select(u => u.Id).Contains(x.UserId)).ExecuteDeleteAsync();
            await users.ExecuteDeleteAsync();
            await cleanup.Lecturers.IgnoreQueryFilters().Where(x => x.Email == email).ExecuteDeleteAsync();
            if (yearId is { } id)
            {
                await cleanup.Semesters.IgnoreQueryFilters().Where(x => x.AcademicYearId == id).ExecuteDeleteAsync();
                await cleanup.AcademicYears.IgnoreQueryFilters().Where(x => x.AcademicYearId == id).ExecuteDeleteAsync();
            }
        }
    }
}
