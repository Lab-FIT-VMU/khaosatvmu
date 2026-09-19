using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSurveyScoringChangeLogs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SurveyScoringChangeLogs",
                columns: table => new
                {
                    SurveyScoringChangeLogId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    SemesterSurveyId = table.Column<int>(type: "integer", nullable: true),
                    MinimumResponseRate = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    MinimumValidRate = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    RejectTooFast = table.Column<bool>(type: "boolean", nullable: false),
                    RejectSingleAnswer = table.Column<bool>(type: "boolean", nullable: false),
                    RejectAttentionCheckFailed = table.Column<bool>(type: "boolean", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ChangedByName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SurveyScoringChangeLogs", x => x.SurveyScoringChangeLogId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SurveyScoringChangeLogs_SemesterSurveyId",
                table: "SurveyScoringChangeLogs",
                column: "SemesterSurveyId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SurveyScoringChangeLogs");
        }
    }
}
