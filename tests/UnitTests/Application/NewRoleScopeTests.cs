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

    [Theory]
    [InlineData(RoleCodes.DepartmentManager)]
    [InlineData(RoleCodes.DeputyDepartmentManager)]
    public void DepartmentLeadershipRoles_ScopeByDepartmentAndHaveTheSameActions(string roleCode)
    {
        var departmentManager = new UserScope(
            roleCode, 10, 20, 30, SeesEverything: false);

        departmentManager.SeesWholeFaculty.Should().BeFalse();
        departmentManager.SeesNothing.Should().BeFalse();
        departmentManager.CanAddSurveyScope.Should().BeTrue();
        departmentManager.CanResolveCourseSectionLecturer.Should().BeTrue();
        (departmentManager with { DepartmentId = null }).SeesNothing.Should().BeTrue();
    }

    [Theory]
    [InlineData(RoleCodes.BoardOfDirectors, "Ban Giám hiệu", "GH")]
    [InlineData(RoleCodes.FacultyManager, "Trưởng khoa/viện", "KV")]
    [InlineData(RoleCodes.DeputyDepartmentManager, "Phó trưởng bộ môn", "PB")]
    public void ProfileNaming_CoversNewRoles(string roleCode, string name, string suffix)
    {
        // Thiếu dòng nào ở đây là cấp hồ sơ cho vai trò đó ném KeyNotFoundException.
        ProfileNaming.ByRoleCode[roleCode].Should().Be((name, suffix));
        ProfileNaming.RoleCodeFromLabel(name).Should().Be(roleCode);
    }
}
