using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations;

/// <inheritdoc />
[DbContext(typeof(AppDbContext))]
[Migration("20260921100000_AddGraduationRoundReviewDate")]
public partial class AddGraduationRoundReviewDate : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "ReviewMonth",
            table: "GraduationRounds",
            type: "integer",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "ReviewYear",
            table: "GraduationRounds",
            type: "integer",
            nullable: true);

        migrationBuilder.AddCheckConstraint(
            name: "CK_GraduationRounds_ReviewDate",
            table: "GraduationRounds",
            sql: "(\"ReviewMonth\" IS NULL AND \"ReviewYear\" IS NULL) OR (\"ReviewMonth\" BETWEEN 1 AND 12 AND \"ReviewYear\" BETWEEN 1900 AND 2200)");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "CK_GraduationRounds_ReviewDate",
            table: "GraduationRounds");

        migrationBuilder.DropColumn(
            name: "ReviewMonth",
            table: "GraduationRounds");

        migrationBuilder.DropColumn(
            name: "ReviewYear",
            table: "GraduationRounds");
    }
}
