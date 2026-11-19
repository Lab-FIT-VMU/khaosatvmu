using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AllowReusingDeletedCatalogKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Semesters_AcademicYearId_SemesterName",
                table: "Semesters");

            migrationBuilder.DropIndex(
                name: "IX_Positions_PositionName",
                table: "Positions");

            migrationBuilder.DropIndex(
                name: "IX_CourseSections_CourseId_SemesterId_SectionName",
                table: "CourseSections");

            migrationBuilder.DropIndex(
                name: "IX_Courses_CourseCode",
                table: "Courses");

            migrationBuilder.DropIndex(
                name: "IX_AcademicYears_AcademicYearName",
                table: "AcademicYears");

            migrationBuilder.CreateIndex(
                name: "IX_Semesters_AcademicYearId_SemesterName",
                table: "Semesters",
                columns: new[] { "AcademicYearId", "SemesterName" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Positions_PositionName",
                table: "Positions",
                column: "PositionName",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_CourseSections_CourseId_SemesterId_SectionName",
                table: "CourseSections",
                columns: new[] { "CourseId", "SemesterId", "SectionName" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Courses_CourseCode",
                table: "Courses",
                column: "CourseCode",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_AcademicYears_AcademicYearName",
                table: "AcademicYears",
                column: "AcademicYearName",
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Semesters_AcademicYearId_SemesterName",
                table: "Semesters");

            migrationBuilder.DropIndex(
                name: "IX_Positions_PositionName",
                table: "Positions");

            migrationBuilder.DropIndex(
                name: "IX_CourseSections_CourseId_SemesterId_SectionName",
                table: "CourseSections");

            migrationBuilder.DropIndex(
                name: "IX_Courses_CourseCode",
                table: "Courses");

            migrationBuilder.DropIndex(
                name: "IX_AcademicYears_AcademicYearName",
                table: "AcademicYears");

            migrationBuilder.CreateIndex(
                name: "IX_Semesters_AcademicYearId_SemesterName",
                table: "Semesters",
                columns: new[] { "AcademicYearId", "SemesterName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Positions_PositionName",
                table: "Positions",
                column: "PositionName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CourseSections_CourseId_SemesterId_SectionName",
                table: "CourseSections",
                columns: new[] { "CourseId", "SemesterId", "SectionName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Courses_CourseCode",
                table: "Courses",
                column: "CourseCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AcademicYears_AcademicYearName",
                table: "AcademicYears",
                column: "AcademicYearName",
                unique: true);
        }
    }
}
