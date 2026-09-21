namespace UnitTests.ApplicationTests;

using Application.Catalog;
using FluentAssertions;
using Xunit;

public class CatalogValidationTests
{
    [Fact]
    public void SaveFacultyCommand_WithValidName_ShouldRetainName()
    {
        var command = new SaveFacultyCommand("Khoa Công nghệ thông tin");
        command.FacultyName.Should().Be("Khoa Công nghệ thông tin");
    }

    [Fact]
    public void SaveDepartmentCommand_WithFacultyId_ShouldLinkCorrectly()
    {
        var command = new SaveDepartmentCommand(102, "Bộ môn Hệ thống thông tin", 5);
        command.DepartmentId.Should().Be(102);
        command.DepartmentName.Should().Be("Bộ môn Hệ thống thông tin");
        command.FacultyId.Should().Be(5);
    }

    [Fact]
    public void SaveCourseCommand_CreditsValidation_ShouldRetainValidValues()
    {
        var command = new SaveCourseCommand("19783", "Kỹ thuật lập trình", 3, "Required", 1, 1, null);
        command.CourseCode.Should().Be("19783");
        command.Credits.Should().Be(3);
        command.CourseType.Should().Be("Required");
    }

    [Fact]
    public void SaveLecturerCommand_WithValidEmail_ShouldHoldProperties()
    {
        var command = new SaveLecturerCommand(
            "TS. Lê Hoàng C",
            1,
            1,
            "lehoangc@vimaru.edu.vn",
            "0901234567",
            2
        );
        command.PositionId.Should().Be(2);
        command.FullName.Should().Be("TS. Lê Hoàng C");
        command.Email.Should().Be("lehoangc@vimaru.edu.vn");
        command.PhoneNumber.Should().Be("0901234567");
        command.FacultyId.Should().Be(1);
        command.DepartmentId.Should().Be(1);
    }

    [Fact]
    public void SaveAcademicYearCommand_ShouldCarryTheNameAndStartDate()
    {
        var command = new SaveAcademicYearCommand("2025-2026", new DateOnly(2025, 9, 1));

        command.AcademicYearName.Should().Be("2025-2026");
        command.StartDate.Should().Be(new DateOnly(2025, 9, 1));
    }
}
