using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCohortMajorOnTimeGraduatedCount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_CohortMajors_Counts",
                table: "CohortMajors");

            migrationBuilder.AddColumn<int>(
                name: "OnTimeGraduatedCount",
                table: "CohortMajors",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddCheckConstraint(
                name: "CK_CohortMajors_Counts",
                table: "CohortMajors",
                sql: "\"StudentCount\" >= 0 AND \"GraduatedCount\" >= 0 AND \"NotGraduatedCount\" >= 0 AND \"ExcellentCount\" >= 0 AND \"VeryGoodCount\" >= 0 AND \"GoodCount\" >= 0 AND \"AverageCount\" >= 0 AND \"WorkStudyCount\" >= 0 AND \"OnTimeGraduatedCount\" >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_CohortMajors_Counts",
                table: "CohortMajors");

            migrationBuilder.DropColumn(
                name: "OnTimeGraduatedCount",
                table: "CohortMajors");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CohortMajors_Counts",
                table: "CohortMajors",
                sql: "\"StudentCount\" >= 0 AND \"GraduatedCount\" >= 0 AND \"NotGraduatedCount\" >= 0 AND \"ExcellentCount\" >= 0 AND \"VeryGoodCount\" >= 0 AND \"GoodCount\" >= 0 AND \"AverageCount\" >= 0 AND \"WorkStudyCount\" >= 0");
        }
    }
}
