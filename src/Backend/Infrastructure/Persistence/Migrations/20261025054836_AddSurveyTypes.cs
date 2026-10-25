using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSurveyTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SurveyType",
                table: "SemesterSurveys",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "COURSE");

            migrationBuilder.AlterColumn<int>(
                name: "CourseSectionId",
                table: "CourseSectionSurveys",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<int>(
                name: "CohortMajorId",
                table: "CourseSectionSurveys",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FacultyId",
                table: "CourseSectionSurveys",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetCount",
                table: "CourseSectionSurveys",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SemesterSurveys_SemesterId_SurveyType",
                table: "SemesterSurveys",
                columns: new[] { "SemesterId", "SurveyType" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_SemesterSurveys_SurveyType",
                table: "SemesterSurveys",
                sql: "\"SurveyType\" IN ('COURSE', 'PROGRAM', 'LECTURER')");

            migrationBuilder.CreateIndex(
                name: "IX_CourseSectionSurveys_CohortMajorId",
                table: "CourseSectionSurveys",
                column: "CohortMajorId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseSectionSurveys_FacultyId",
                table: "CourseSectionSurveys",
                column: "FacultyId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseSectionSurveys_SemesterSurveyId_CohortMajorId",
                table: "CourseSectionSurveys",
                columns: new[] { "SemesterSurveyId", "CohortMajorId" },
                unique: true,
                filter: "\"CohortMajorId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CourseSectionSurveys_SemesterSurveyId_FacultyId",
                table: "CourseSectionSurveys",
                columns: new[] { "SemesterSurveyId", "FacultyId" },
                unique: true,
                filter: "\"FacultyId\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CourseSectionSurveys_SingleUnit",
                table: "CourseSectionSurveys",
                sql: "num_nonnulls(\"CourseSectionId\", \"CohortMajorId\", \"FacultyId\") = 1");

            migrationBuilder.AddForeignKey(
                name: "FK_CourseSectionSurveys_CohortMajors_CohortMajorId",
                table: "CourseSectionSurveys",
                column: "CohortMajorId",
                principalTable: "CohortMajors",
                principalColumn: "CohortMajorId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CourseSectionSurveys_Faculties_FacultyId",
                table: "CourseSectionSurveys",
                column: "FacultyId",
                principalTable: "Faculties",
                principalColumn: "FacultyId",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CourseSectionSurveys_CohortMajors_CohortMajorId",
                table: "CourseSectionSurveys");

            migrationBuilder.DropForeignKey(
                name: "FK_CourseSectionSurveys_Faculties_FacultyId",
                table: "CourseSectionSurveys");

            migrationBuilder.DropIndex(
                name: "IX_SemesterSurveys_SemesterId_SurveyType",
                table: "SemesterSurveys");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SemesterSurveys_SurveyType",
                table: "SemesterSurveys");

            migrationBuilder.DropIndex(
                name: "IX_CourseSectionSurveys_CohortMajorId",
                table: "CourseSectionSurveys");

            migrationBuilder.DropIndex(
                name: "IX_CourseSectionSurveys_FacultyId",
                table: "CourseSectionSurveys");

            migrationBuilder.DropIndex(
                name: "IX_CourseSectionSurveys_SemesterSurveyId_CohortMajorId",
                table: "CourseSectionSurveys");

            migrationBuilder.DropIndex(
                name: "IX_CourseSectionSurveys_SemesterSurveyId_FacultyId",
                table: "CourseSectionSurveys");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CourseSectionSurveys_SingleUnit",
                table: "CourseSectionSurveys");

            migrationBuilder.DropColumn(
                name: "SurveyType",
                table: "SemesterSurveys");

            migrationBuilder.DropColumn(
                name: "CohortMajorId",
                table: "CourseSectionSurveys");

            migrationBuilder.DropColumn(
                name: "FacultyId",
                table: "CourseSectionSurveys");

            migrationBuilder.DropColumn(
                name: "TargetCount",
                table: "CourseSectionSurveys");

            migrationBuilder.AlterColumn<int>(
                name: "CourseSectionId",
                table: "CourseSectionSurveys",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);
        }
    }
}
