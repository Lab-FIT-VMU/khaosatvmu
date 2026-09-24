namespace UnitTests.ApplicationTests;

using Application.UserAdministration;
using FluentAssertions;
using Xunit;

public sealed class RequiredRolePermissionsTests
{
    [Theory]
    [InlineData("ADMIN", "USER_ADMIN_ACCESS", true)]
    [InlineData("admin", "user_admin_access", true)]
    [InlineData("ADMIN", "USER_ADMIN_TAB_PERMISSIONS", true)]
    [InlineData("ADMIN", "USER_ADMIN_TAB_AUDIT", false)]
    [InlineData("ADMIN", "REPORTS_ACCESS", false)]
    [InlineData("SURVEY_ADMIN", "USER_ADMIN_ACCESS", false)]
    [InlineData("SURVEY_ADMIN", "USER_ADMIN_TAB_PERMISSIONS", false)]
    public void IsRequired_OnlyProtectsUserAdministrationForAdmin(
        string roleCode,
        string permissionCode,
        bool expected)
    {
        RequiredRolePermissions.IsRequired(roleCode, permissionCode).Should().Be(expected);
    }
}
