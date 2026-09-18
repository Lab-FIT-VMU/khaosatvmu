using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RewriteGraduationAnalyticsFromStudentLists : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GraduationAggregateRows",
                columns: table => new
                {
                    AggregateRowId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RevisionId = table.Column<long>(type: "bigint", nullable: false),
                    FacultyNameRaw = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FacultyKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ProgramNameRaw = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    ProgramKey = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    DerivedProgramCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CohortCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    GraduationRank = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IsWorkStudy = table.Column<bool>(type: "boolean", nullable: false),
                    StudentCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GraduationAggregateRows", x => x.AggregateRowId);
                    table.CheckConstraint("CK_GraduationAggregateRows_StudentCount", "\"StudentCount\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "GraduationImportRevisions",
                columns: table => new
                {
                    RevisionId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PeriodId = table.Column<long>(type: "bigint", nullable: false),
                    RevisionNumber = table.Column<int>(type: "integer", nullable: false),
                    ReviewMonth = table.Column<int>(type: "integer", nullable: false),
                    ReviewYear = table.Column<int>(type: "integer", nullable: false),
                    OriginalFileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    SourceSheetName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FileHash = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    AggregateHash = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    SourceRowCount = table.Column<int>(type: "integer", nullable: false),
                    ImportedRowCount = table.Column<int>(type: "integer", nullable: false),
                    SkippedRowCount = table.Column<int>(type: "integer", nullable: false),
                    SkippedSummaryJson = table.Column<string>(type: "jsonb", nullable: false),
                    ImportedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ImportedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ImportedByName = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    ReplaceReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ReplacedRevisionId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GraduationImportRevisions", x => x.RevisionId);
                    table.CheckConstraint("CK_GraduationImportRevisions_RevisionNumber", "\"RevisionNumber\" > 0");
                    table.CheckConstraint("CK_GraduationImportRevisions_RowCounts", "\"SourceRowCount\" = \"ImportedRowCount\" + \"SkippedRowCount\" AND \"ImportedRowCount\" > 0 AND \"SkippedRowCount\" >= 0");
                    table.ForeignKey(
                        name: "FK_GraduationImportRevisions_GraduationImportRevisions_Replace~",
                        column: x => x.ReplacedRevisionId,
                        principalTable: "GraduationImportRevisions",
                        principalColumn: "RevisionId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GraduationPeriods",
                columns: table => new
                {
                    PeriodId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AcademicYearStart = table.Column<int>(type: "integer", nullable: false),
                    RoundNumber = table.Column<int>(type: "integer", nullable: false),
                    ReviewMonth = table.Column<int>(type: "integer", nullable: false),
                    ReviewYear = table.Column<int>(type: "integer", nullable: false),
                    ActiveRevisionId = table.Column<long>(type: "bigint", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GraduationPeriods", x => x.PeriodId);
                    table.CheckConstraint("CK_GraduationPeriods_AcademicYearStart", "\"AcademicYearStart\" BETWEEN 1900 AND 2200");
                    table.CheckConstraint("CK_GraduationPeriods_ReviewMonth", "\"ReviewMonth\" BETWEEN 1 AND 12");
                    table.CheckConstraint("CK_GraduationPeriods_ReviewYear", "\"ReviewYear\" BETWEEN 1900 AND 2200");
                    table.CheckConstraint("CK_GraduationPeriods_RoundNumber", "\"RoundNumber\" > 0");
                    table.ForeignKey(
                        name: "FK_GraduationPeriods_GraduationImportRevisions_ActiveRevisionId",
                        column: x => x.ActiveRevisionId,
                        principalTable: "GraduationImportRevisions",
                        principalColumn: "RevisionId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GraduationAggregateRows_RevisionId_CohortCode",
                table: "GraduationAggregateRows",
                columns: new[] { "RevisionId", "CohortCode" });

            migrationBuilder.CreateIndex(
                name: "IX_GraduationAggregateRows_RevisionId_FacultyKey_ProgramKey_Co~",
                table: "GraduationAggregateRows",
                columns: new[] { "RevisionId", "FacultyKey", "ProgramKey", "CohortCode", "GraduationRank", "IsWorkStudy" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GraduationImportRevisions_FileHash",
                table: "GraduationImportRevisions",
                column: "FileHash");

            migrationBuilder.CreateIndex(
                name: "IX_GraduationImportRevisions_PeriodId_RevisionNumber",
                table: "GraduationImportRevisions",
                columns: new[] { "PeriodId", "RevisionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GraduationImportRevisions_ReplacedRevisionId",
                table: "GraduationImportRevisions",
                column: "ReplacedRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_GraduationPeriods_AcademicYearStart_ReviewYear_ReviewMonth",
                table: "GraduationPeriods",
                columns: new[] { "AcademicYearStart", "ReviewYear", "ReviewMonth" });

            migrationBuilder.CreateIndex(
                name: "IX_GraduationPeriods_AcademicYearStart_RoundNumber",
                table: "GraduationPeriods",
                columns: new[] { "AcademicYearStart", "RoundNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GraduationPeriods_ActiveRevisionId",
                table: "GraduationPeriods",
                column: "ActiveRevisionId");

            migrationBuilder.AddForeignKey(
                name: "FK_GraduationAggregateRows_GraduationImportRevisions_RevisionId",
                table: "GraduationAggregateRows",
                column: "RevisionId",
                principalTable: "GraduationImportRevisions",
                principalColumn: "RevisionId",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_GraduationImportRevisions_GraduationPeriods_PeriodId",
                table: "GraduationImportRevisions",
                column: "PeriodId",
                principalTable: "GraduationPeriods",
                principalColumn: "PeriodId",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GraduationPeriods_GraduationImportRevisions_ActiveRevisionId",
                table: "GraduationPeriods");

            migrationBuilder.DropTable(
                name: "GraduationAggregateRows");

            migrationBuilder.DropTable(
                name: "GraduationImportRevisions");

            migrationBuilder.DropTable(
                name: "GraduationPeriods");
        }
    }
}
