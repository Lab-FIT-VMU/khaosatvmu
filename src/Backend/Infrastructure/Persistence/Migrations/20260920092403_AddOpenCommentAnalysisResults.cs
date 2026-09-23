using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOpenCommentAnalysisResults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OpenCommentAnalysisResults",
                columns: table => new
                {
                    SurveyResponseId = table.Column<int>(type: "integer", nullable: false),
                    Sentiment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Confidence = table.Column<decimal>(type: "numeric(6,5)", nullable: false),
                    PositiveScore = table.Column<decimal>(type: "numeric(6,5)", nullable: false),
                    NegativeScore = table.Column<decimal>(type: "numeric(6,5)", nullable: false),
                    NeutralScore = table.Column<decimal>(type: "numeric(6,5)", nullable: false),
                    TopicCodesJson = table.Column<string>(type: "jsonb", nullable: true),
                    ModelVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ContentHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    AnalyzedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ManualSentiment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    ReviewedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OpenCommentAnalysisResults", x => x.SurveyResponseId);
                    table.ForeignKey(
                        name: "FK_OpenCommentAnalysisResults_SurveyResponses_SurveyResponseId",
                        column: x => x.SurveyResponseId,
                        principalTable: "SurveyResponses",
                        principalColumn: "ResponseId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OpenCommentAnalysisResults_Users_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OpenCommentAnalysisResults_AnalyzedAt",
                table: "OpenCommentAnalysisResults",
                column: "AnalyzedAt");

            migrationBuilder.CreateIndex(
                name: "IX_OpenCommentAnalysisResults_ModelVersion",
                table: "OpenCommentAnalysisResults",
                column: "ModelVersion");

            migrationBuilder.CreateIndex(
                name: "IX_OpenCommentAnalysisResults_ReviewedByUserId",
                table: "OpenCommentAnalysisResults",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OpenCommentAnalysisResults_Sentiment",
                table: "OpenCommentAnalysisResults",
                column: "Sentiment");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OpenCommentAnalysisResults");
        }
    }
}
