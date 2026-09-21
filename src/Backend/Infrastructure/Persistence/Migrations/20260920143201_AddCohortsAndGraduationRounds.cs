using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCohortsAndGraduationRounds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Cohorts",
                columns: table => new
                {
                    CohortId = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CohortCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    CohortName = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AcademicYearId = table.Column<int>(type: "integer", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cohorts", x => x.CohortId);
                    table.ForeignKey(
                        name: "FK_Cohorts_AcademicYears_AcademicYearId",
                        column: x => x.AcademicYearId,
                        principalTable: "AcademicYears",
                        principalColumn: "AcademicYearId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GraduationRounds",
                columns: table => new
                {
                    GraduationRoundId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RoundNumber = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AcademicYearId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GraduationRounds", x => x.GraduationRoundId);
                    table.CheckConstraint("CK_GraduationRounds_RoundNumber", "\"RoundNumber\" > 0");
                    table.ForeignKey(
                        name: "FK_GraduationRounds_AcademicYears_AcademicYearId",
                        column: x => x.AcademicYearId,
                        principalTable: "AcademicYears",
                        principalColumn: "AcademicYearId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CohortMajors",
                columns: table => new
                {
                    CohortMajorId = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CohortMajorCode = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    CohortId = table.Column<int>(type: "integer", nullable: false),
                    MajorId = table.Column<int>(type: "integer", nullable: false),
                    StudentCount = table.Column<int>(type: "integer", nullable: false),
                    GraduatedCount = table.Column<int>(type: "integer", nullable: false),
                    NotGraduatedCount = table.Column<int>(type: "integer", nullable: false),
                    ExcellentCount = table.Column<int>(type: "integer", nullable: false),
                    VeryGoodCount = table.Column<int>(type: "integer", nullable: false),
                    GoodCount = table.Column<int>(type: "integer", nullable: false),
                    AverageCount = table.Column<int>(type: "integer", nullable: false),
                    WorkStudyCount = table.Column<int>(type: "integer", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CohortMajors", x => x.CohortMajorId);
                    table.CheckConstraint("CK_CohortMajors_Counts", "\"StudentCount\" >= 0 AND \"GraduatedCount\" >= 0 AND \"NotGraduatedCount\" >= 0 AND \"ExcellentCount\" >= 0 AND \"VeryGoodCount\" >= 0 AND \"GoodCount\" >= 0 AND \"AverageCount\" >= 0 AND \"WorkStudyCount\" >= 0");
                    table.ForeignKey(
                        name: "FK_CohortMajors_Cohorts_CohortId",
                        column: x => x.CohortId,
                        principalTable: "Cohorts",
                        principalColumn: "CohortId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CohortMajors_Majors_MajorId",
                        column: x => x.MajorId,
                        principalTable: "Majors",
                        principalColumn: "MajorId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CohortMajorGraduations",
                columns: table => new
                {
                    CohortMajorGraduationId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    GraduationRoundId = table.Column<long>(type: "bigint", nullable: false),
                    CohortMajorId = table.Column<int>(type: "integer", nullable: false),
                    GraduatedCount = table.Column<int>(type: "integer", nullable: false),
                    ExcellentCount = table.Column<int>(type: "integer", nullable: false),
                    VeryGoodCount = table.Column<int>(type: "integer", nullable: false),
                    GoodCount = table.Column<int>(type: "integer", nullable: false),
                    AverageCount = table.Column<int>(type: "integer", nullable: false),
                    WorkStudyCount = table.Column<int>(type: "integer", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CohortMajorGraduations", x => x.CohortMajorGraduationId);
                    table.CheckConstraint("CK_CohortMajorGraduations_Counts", "\"GraduatedCount\" >= 0 AND \"ExcellentCount\" >= 0 AND \"VeryGoodCount\" >= 0 AND \"GoodCount\" >= 0 AND \"AverageCount\" >= 0 AND \"WorkStudyCount\" >= 0");
                    table.CheckConstraint("CK_CohortMajorGraduations_RankSum", "\"GraduatedCount\" = \"ExcellentCount\" + \"VeryGoodCount\" + \"GoodCount\" + \"AverageCount\"");
                    table.ForeignKey(
                        name: "FK_CohortMajorGraduations_CohortMajors_CohortMajorId",
                        column: x => x.CohortMajorId,
                        principalTable: "CohortMajors",
                        principalColumn: "CohortMajorId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CohortMajorGraduations_GraduationRounds_GraduationRoundId",
                        column: x => x.GraduationRoundId,
                        principalTable: "GraduationRounds",
                        principalColumn: "GraduationRoundId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CohortMajorGraduations_CohortMajorId",
                table: "CohortMajorGraduations",
                column: "CohortMajorId");

            migrationBuilder.CreateIndex(
                name: "IX_CohortMajorGraduations_GraduationRoundId_CohortMajorId",
                table: "CohortMajorGraduations",
                columns: new[] { "GraduationRoundId", "CohortMajorId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_CohortMajors_CohortId",
                table: "CohortMajors",
                column: "CohortId");

            migrationBuilder.CreateIndex(
                name: "IX_CohortMajors_CohortId_MajorId",
                table: "CohortMajors",
                columns: new[] { "CohortId", "MajorId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_CohortMajors_CohortMajorCode",
                table: "CohortMajors",
                column: "CohortMajorCode",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_CohortMajors_MajorId",
                table: "CohortMajors",
                column: "MajorId");

            migrationBuilder.CreateIndex(
                name: "IX_Cohorts_AcademicYearId",
                table: "Cohorts",
                column: "AcademicYearId");

            migrationBuilder.CreateIndex(
                name: "IX_Cohorts_CohortCode",
                table: "Cohorts",
                column: "CohortCode",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_GraduationRounds_AcademicYearId_RoundNumber",
                table: "GraduationRounds",
                columns: new[] { "AcademicYearId", "RoundNumber" },
                unique: true);

            SeedAcademicYearsAndCohorts(migrationBuilder);
        }

        // Năm học 2018-2019 đến 2026-2027 và khoá tương ứng. Khoá 59 nhập học năm
        // 2018-2019, mỗi năm học sau đó tăng một khoá. Chỉ chèn dòng còn thiếu để
        // chạy lại migration trên cơ sở dữ liệu đã có sẵn vài năm học không bị lỗi.
        private static void SeedAcademicYearsAndCohorts(MigrationBuilder migrationBuilder)
        {
            const int firstYear = 2018;
            const int lastYear = 2026;
            const int firstCohort = 59;

            for (var year = firstYear; year <= lastYear; year++)
            {
                var yearName = $"{year}-{year + 1}";
                var cohort = firstCohort + (year - firstYear);

                migrationBuilder.Sql($"""
                    INSERT INTO "AcademicYears" ("AcademicYearName", "IsDeleted")
                    SELECT '{yearName}', false
                    WHERE NOT EXISTS (
                        SELECT 1 FROM "AcademicYears" WHERE "AcademicYearName" = '{yearName}');
                    """);

                migrationBuilder.Sql($"""
                    INSERT INTO "Cohorts" ("CohortCode", "CohortName", "AcademicYearId", "IsDeleted")
                    SELECT '{cohort}', 'Khoá {cohort}', "AcademicYearId", false
                    FROM "AcademicYears"
                    WHERE "AcademicYearName" = '{yearName}'
                      AND NOT EXISTS (
                        SELECT 1 FROM "Cohorts" WHERE "CohortCode" = '{cohort}' AND "IsDeleted" = false);
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CohortMajorGraduations");

            migrationBuilder.DropTable(
                name: "CohortMajors");

            migrationBuilder.DropTable(
                name: "GraduationRounds");

            migrationBuilder.DropTable(
                name: "Cohorts");
        }
    }
}
