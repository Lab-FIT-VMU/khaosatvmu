using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CohortMajorNameUniquePerCohort : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CohortMajors_CohortMajorCode",
                table: "CohortMajors");

            migrationBuilder.CreateIndex(
                name: "IX_CohortMajors_CohortId_CohortMajorCode",
                table: "CohortMajors",
                columns: new[] { "CohortId", "CohortMajorCode" },
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CohortMajors_CohortId_CohortMajorCode",
                table: "CohortMajors");

            migrationBuilder.CreateIndex(
                name: "IX_CohortMajors_CohortMajorCode",
                table: "CohortMajors",
                column: "CohortMajorCode",
                unique: true,
                filter: "\"IsDeleted\" = false");
        }
    }
}
