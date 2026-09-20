using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EnsureUniqueMajorCodes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE "Majors"
                SET "MajorCode" =
                    regexp_replace("MajorCode", '-(CLC|NC|C)$', '', 'i') ||
                    CASE
                        WHEN "MajorName" ~* '\(CLC\)\s*$' THEN '-CLC'
                        WHEN "MajorName" ~* '\(NC\)\s*$' THEN '-NC'
                        WHEN "MajorName" ~* '\(Chọn\)\s*$' THEN '-C'
                    END
                WHERE "MajorName" ~* '\((CLC|NC|Chọn)\)\s*$';
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Majors_MajorCode",
                table: "Majors",
                column: "MajorCode",
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Majors_MajorCode",
                table: "Majors");

            migrationBuilder.Sql(
                """
                UPDATE "Majors"
                SET "MajorCode" = regexp_replace("MajorCode", '-(CLC|NC|C)$', '', 'i')
                WHERE "MajorName" ~* '\((CLC|NC|Chọn)\)\s*$';
                """);
        }
    }
}
