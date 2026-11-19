using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AllowReusingDeletedFacultyNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Faculties_FacultyName",
                table: "Faculties");

            migrationBuilder.CreateIndex(
                name: "IX_Faculties_FacultyName",
                table: "Faculties",
                column: "FacultyName",
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Faculties_FacultyName",
                table: "Faculties");

            migrationBuilder.CreateIndex(
                name: "IX_Faculties_FacultyName",
                table: "Faculties",
                column: "FacultyName",
                unique: true);
        }
    }
}
