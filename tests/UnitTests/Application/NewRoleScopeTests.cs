namespace UnitTests.ApplicationTests;

using Application.Auth;
using Application.UserAdministration;
using FluentAssertions;
using Xunit;

/// <summary>
/// Hai vai trò thêm sau: Ban Giám hiệu (xem toàn trường, chỉ đọc) và Trưởng khoa/viện
/// (như trưởng bộ môn nhưng phạm vi là cả khoa).
/// </summary>
public class NewRoleScopeTests
{
    private static readonly UserScope BoardOfDirectors =
        UserScope.Unrestricted(RoleCodes.BoardOfDirectors);

    private static readonly UserScope FacultyManager =
        new(RoleCodes.FacultyManager, 10, 20, 30, SeesEverything: false);

    [Fact]
    public void BoardOfDirectors_SeesEverythingButWritesNothing()
    {
        BoardOfDirectors.SeesEverything.Should().BeTrue();
        BoardOfDirectors.SeesNothing.Should().BeFalse();
        BoardOfDirectors.SeesOnlyOwn.Should().BeFalse();

        BoardOfDirectors.IsReadOnly.Should().BeTrue();
        BoardOfDirectors.ManagesEverything.Should().BeFalse();
        BoardOfDirectors.CanManageSurveyCampaigns.Should().BeFalse();
        BoardOfDirectors.CanManageCourseSections.Should().BeFalse();
        BoardOfDirectors.CanAddSurveyScope.Should().BeFalse();
        BoardOfDirectors.CanResolveCourseSectionLecturer.Should().BeFalse();
    }

    [Fact]
    public void SurveyAdmin_StillManagesEverything()
    {
        var surveyAdmin = UserScope.Unrestricted(RoleCodes.SurveyAdmin);

        surveyAdmin.IsReadOnly.Should().BeFalse();
        surveyAdmin.ManagesEverything.Should().BeTrue();
        surveyAdmin.CanManageSurveyCampaigns.Should().BeTrue();
    }

    [Fact]
    public void FacultyManager_ScopesByFacultyAndKeepsUnitWriteActions()
    {
        FacultyManager.SeesEverything.Should().BeFalse();
        FacultyManager.SeesWholeFaculty.Should().BeTrue();
        FacultyManager.SeesOnlyOwn.Should().BeFalse();
        FacultyManager.IsReadOnly.Should().BeFalse();

        // Giống hệt trưởng bộ môn: không phát đợt, không quản lý lớp, nhưng thêm được
        // phạm vi và gắn được giảng viên cho lớp treo trong phạm vi của mình.
        FacultyManager.CanManageSurveyCampaigns.Should().BeFalse();
        FacultyManager.CanManageCourseSections.Should().BeFalse();
        FacultyManager.CanAddSurveyScope.Should().BeTrue();
        FacultyManager.CanResolveCourseSectionLecturer.Should().BeTrue();
    }

    [Fact]
    public void FacultyManager_WithoutFacultyIdSeesNothing()
    {
        // Thiếu khoa là phạm vi hỏng: phải trả rỗng chứ không được rơi vào nhánh
        // không lọc, kể cả khi vẫn có DepartmentId.
        var broken = FacultyManager with { FacultyId = null };

        broken.SeesNothing.Should().BeTrue();
        broken.CanAddSurveyScope.Should().BeFalse();
    }

    [Fact]
    public void DepartmentManager_ScopesByDepartment()
    {
        var departmentManager = new UserScope(
            RoleCodes.DepartmentManager, 10, 20, 30, SeesEverything: false);

        departmentManager.SeesWholeFaculty.Should().BeFalse();
        departmentManager.SeesNothing.Should().BeFalse();
        departmentManager.CanAddSurveyScope.Should().BeTrue();
        departmentManager.CanResolveCourseSectionLecturer.Should().BeTrue();
        (departmentManager with { DepartmentId = null }).SeesNothing.Should().BeTrue();
    }

    [Theory]
    [InlineData(RoleCodes.BoardOfDirectors, "Ban Giám hiệu", "GH")]
    [InlineData(RoleCodes.FacultyManager, "Quản lý khoa", "KV")]
    [InlineData(RoleCodes.DepartmentManager, "Quản lý bộ môn", "BM")]
    public void DefaultRoles_CoverEveryBuiltInRole(string roleCode, string name, string suffix)
    {
        // Tên và hậu tố mã hồ sơ của vai trò mặc định nay nằm trong bảng "Roles", tạo lúc cài.
        var role = Infrastructure.Persistence.DatabaseSeeder.DefaultRoles.Single(x => x.Code == roleCode);
        (role.Name, role.Suffix).Should().Be((name, suffix));
    }

    // ------------------------------------------------ Vai trò tùy biến: phạm vi × quyền ghi

    private static UserScope Custom(string dataScope, bool canWrite, bool seesEverything = false) =>
        new("ROLE_CUSTOM", 10, 20, 30, seesEverything, dataScope, canWrite);

    [Fact]
    public void CustomDepartmentReadOnly_SeesDepartmentButCannotWrite()
    {
        var scope = Custom(Domain.RoleDataScopes.Department, canWrite: false);

        scope.SeesWholeFaculty.Should().BeFalse();
        scope.SeesOnlyOwn.Should().BeFalse();
        scope.IsReadOnly.Should().BeTrue();
        scope.CanAddSurveyScope.Should().BeFalse("vai trò bộ môn chỉ xem không được thêm phạm vi khảo sát");
        scope.CanResolveCourseSectionLecturer.Should().BeFalse();
        scope.ManagesEverything.Should().BeFalse();
    }

    [Fact]
    public void CustomFacultyReadOnly_SeesWholeFacultyButCannotWrite()
    {
        var scope = Custom(Domain.RoleDataScopes.Faculty, canWrite: false);

        scope.SeesWholeFaculty.Should().BeTrue();
        scope.IsReadOnly.Should().BeTrue();
        scope.CanAddSurveyScope.Should().BeFalse();
    }

    [Fact]
    public void CustomFacultyWritable_ManagesOwnFaculty()
    {
        var scope = Custom(Domain.RoleDataScopes.Faculty, canWrite: true);

        scope.SeesWholeFaculty.Should().BeTrue();
        scope.IsReadOnly.Should().BeFalse();
        scope.CanAddSurveyScope.Should().BeTrue();
        scope.ManagesEverything.Should().BeFalse("phạm vi khoa không phải quản trị toàn trường");
    }

    [Fact]
    public void CustomWholeSchool_WriteFlagDecidesAdminActions()
    {
        UserScope.Unrestricted("ROLE_CUSTOM", canWrite: true).ManagesEverything.Should().BeTrue();
        UserScope.Unrestricted("ROLE_CUSTOM", canWrite: false).ManagesEverything.Should().BeFalse();
        UserScope.Unrestricted("ROLE_CUSTOM", canWrite: false).IsReadOnly.Should().BeTrue();
    }

    [Fact]
    public void CustomOwnScope_IsAlwaysReadOnly()
    {
        var scope = Custom(Domain.RoleDataScopes.Own, canWrite: true);

        scope.SeesOnlyOwn.Should().BeTrue();
        scope.IsReadOnly.Should().BeTrue("phạm vi lớp mình dạy không có thao tác ghi nào");
    }

    [Fact]
    public void RoleCode_NoLongerDecidesScope_WhenAttributesAreGiven()
    {
        // Mã LECTURER nhưng vai trò được sửa thành phạm vi bộ môn, được ghi.
        var scope = new UserScope(RoleCodes.Lecturer, 10, 20, 30, false, Domain.RoleDataScopes.Department, true);

        scope.SeesOnlyOwn.Should().BeFalse();
        scope.IsReadOnly.Should().BeFalse();
    }
}
