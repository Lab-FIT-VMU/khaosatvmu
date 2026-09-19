using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddScoringFilterToggles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "RejectAttentionCheckFailed",
                table: "SurveyScoringSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "RejectSingleAnswer",
                table: "SurveyScoringSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "RejectTooFast",
                table: "SurveyScoringSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RejectAttentionCheckFailed",
                table: "SurveyScoringSettings");

            migrationBuilder.DropColumn(
                name: "RejectSingleAnswer",
                table: "SurveyScoringSettings");

            migrationBuilder.DropColumn(
                name: "RejectTooFast",
                table: "SurveyScoringSettings");
        }
    }
}
