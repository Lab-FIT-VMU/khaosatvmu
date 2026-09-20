using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LinkGraduationImportsToCatalogs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MajorCode",
                table: "Majors",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "FacultyId",
                table: "GraduationAggregateRows",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MajorId",
                table: "GraduationAggregateRows",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "FacultyImportAliases",
                columns: table => new
                {
                    FacultyImportAliasId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FacultyId = table.Column<int>(type: "integer", nullable: false),
                    Alias = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    NormalizedAlias = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FacultyImportAliases", x => x.FacultyImportAliasId);
                    table.ForeignKey(
                        name: "FK_FacultyImportAliases_Faculties_FacultyId",
                        column: x => x.FacultyId,
                        principalTable: "Faculties",
                        principalColumn: "FacultyId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MajorImportAliases",
                columns: table => new
                {
                    MajorImportAliasId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MajorId = table.Column<int>(type: "integer", nullable: false),
                    Alias = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    NormalizedAlias = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MajorImportAliases", x => x.MajorImportAliasId);
                    table.ForeignKey(
                        name: "FK_MajorImportAliases_Majors_MajorId",
                        column: x => x.MajorId,
                        principalTable: "Majors",
                        principalColumn: "MajorId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GraduationAggregateRows_FacultyId",
                table: "GraduationAggregateRows",
                column: "FacultyId");

            migrationBuilder.CreateIndex(
                name: "IX_GraduationAggregateRows_MajorId",
                table: "GraduationAggregateRows",
                column: "MajorId");

            migrationBuilder.CreateIndex(
                name: "IX_FacultyImportAliases_FacultyId",
                table: "FacultyImportAliases",
                column: "FacultyId");

            migrationBuilder.CreateIndex(
                name: "IX_FacultyImportAliases_NormalizedAlias",
                table: "FacultyImportAliases",
                column: "NormalizedAlias",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MajorImportAliases_MajorId_NormalizedAlias",
                table: "MajorImportAliases",
                columns: new[] { "MajorId", "NormalizedAlias" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_GraduationAggregateRows_Faculties_FacultyId",
                table: "GraduationAggregateRows",
                column: "FacultyId",
                principalTable: "Faculties",
                principalColumn: "FacultyId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_GraduationAggregateRows_Majors_MajorId",
                table: "GraduationAggregateRows",
                column: "MajorId",
                principalTable: "Majors",
                principalColumn: "MajorId",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GraduationAggregateRows_Faculties_FacultyId",
                table: "GraduationAggregateRows");

            migrationBuilder.DropForeignKey(
                name: "FK_GraduationAggregateRows_Majors_MajorId",
                table: "GraduationAggregateRows");

            migrationBuilder.DropTable(
                name: "FacultyImportAliases");

            migrationBuilder.DropTable(
                name: "MajorImportAliases");

            migrationBuilder.DropIndex(
                name: "IX_GraduationAggregateRows_FacultyId",
                table: "GraduationAggregateRows");

            migrationBuilder.DropIndex(
                name: "IX_GraduationAggregateRows_MajorId",
                table: "GraduationAggregateRows");

            migrationBuilder.DropColumn(
                name: "MajorCode",
                table: "Majors");

            migrationBuilder.DropColumn(
                name: "FacultyId",
                table: "GraduationAggregateRows");

            migrationBuilder.DropColumn(
                name: "MajorId",
                table: "GraduationAggregateRows");
        }
    }
}
