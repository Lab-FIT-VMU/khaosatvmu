using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGraduationRoundImportHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Hợp nhất quyền của module thử nghiệm vào quyền thống kê tốt nghiệp chính thức.
            // Vai trò tùy chỉnh chỉ có quyền bản 2 vẫn giữ nguyên khả năng truy cập.
            migrationBuilder.Sql(
                """
                UPDATE "RolePermissions" target
                SET "IsGranted" = target."IsGranted" OR source."IsGranted"
                FROM "RolePermissions" source,
                     "Permissions" old_permission,
                     "Permissions" canonical_permission
                WHERE source."PermissionId" = old_permission."Id"
                  AND old_permission."Code" = 'GRADUATION_ANALYTICS_2_ACCESS'
                  AND canonical_permission."Code" = 'GRADUATION_ANALYTICS_ACCESS'
                  AND target."RoleId" = source."RoleId"
                  AND target."PermissionId" = canonical_permission."Id";

                INSERT INTO "RolePermissions" ("Id", "RoleId", "PermissionId", "IsGranted", "CreatedAt")
                SELECT gen_random_uuid(), source."RoleId", canonical_permission."Id",
                       source."IsGranted", source."CreatedAt"
                FROM "RolePermissions" source
                JOIN "Permissions" old_permission
                  ON old_permission."Id" = source."PermissionId"
                 AND old_permission."Code" = 'GRADUATION_ANALYTICS_2_ACCESS'
                CROSS JOIN "Permissions" canonical_permission
                WHERE canonical_permission."Code" = 'GRADUATION_ANALYTICS_ACCESS'
                  AND NOT EXISTS (
                      SELECT 1 FROM "RolePermissions" existing
                      WHERE existing."RoleId" = source."RoleId"
                        AND existing."PermissionId" = canonical_permission."Id");

                DELETE FROM "Permissions" WHERE "Code" = 'GRADUATION_ANALYTICS_2_ACCESS';
                """);

            migrationBuilder.AddColumn<long>(
                name: "ActiveRevisionId",
                table: "GraduationRounds",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeleteReason",
                table: "GraduationRounds",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "GraduationRounds",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedByName",
                table: "GraduationRounds",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                table: "GraduationRounds",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "GraduationRounds",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "GraduationRoundImportRevisions",
                columns: table => new
                {
                    RevisionId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    GraduationRoundId = table.Column<long>(type: "bigint", nullable: false),
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
                    WarningsJson = table.Column<string>(type: "jsonb", nullable: false),
                    ImportedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ImportedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ImportedByName = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    ReplaceReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ReplacedRevisionId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GraduationRoundImportRevisions", x => x.RevisionId);
                    table.CheckConstraint("CK_GraduationRoundImportRevisions_RevisionNumber", "\"RevisionNumber\" > 0");
                    table.CheckConstraint("CK_GraduationRoundImportRevisions_RowCounts", "\"SourceRowCount\" = \"ImportedRowCount\" + \"SkippedRowCount\" AND \"ImportedRowCount\" > 0 AND \"SkippedRowCount\" >= 0");
                    table.ForeignKey(
                        name: "FK_GraduationRoundImportRevisions_GraduationRoundImportRevisio~",
                        column: x => x.ReplacedRevisionId,
                        principalTable: "GraduationRoundImportRevisions",
                        principalColumn: "RevisionId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GraduationRoundImportRevisions_GraduationRounds_GraduationR~",
                        column: x => x.GraduationRoundId,
                        principalTable: "GraduationRounds",
                        principalColumn: "GraduationRoundId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GraduationRoundRevisionAggregates",
                columns: table => new
                {
                    AggregateId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RevisionId = table.Column<long>(type: "bigint", nullable: false),
                    CohortMajorId = table.Column<int>(type: "integer", nullable: false),
                    FacultyId = table.Column<int>(type: "integer", nullable: true),
                    MajorId = table.Column<int>(type: "integer", nullable: true),
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
                    table.PrimaryKey("PK_GraduationRoundRevisionAggregates", x => x.AggregateId);
                    table.CheckConstraint("CK_GraduationRoundRevisionAggregates_StudentCount", "\"StudentCount\" > 0");
                    table.ForeignKey(
                        name: "FK_GraduationRoundRevisionAggregates_CohortMajors_CohortMajorId",
                        column: x => x.CohortMajorId,
                        principalTable: "CohortMajors",
                        principalColumn: "CohortMajorId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GraduationRoundRevisionAggregates_Faculties_FacultyId",
                        column: x => x.FacultyId,
                        principalTable: "Faculties",
                        principalColumn: "FacultyId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GraduationRoundRevisionAggregates_GraduationRoundImportRevi~",
                        column: x => x.RevisionId,
                        principalTable: "GraduationRoundImportRevisions",
                        principalColumn: "RevisionId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GraduationRoundRevisionAggregates_Majors_MajorId",
                        column: x => x.MajorId,
                        principalTable: "Majors",
                        principalColumn: "MajorId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GraduationRounds_ActiveRevisionId",
                table: "GraduationRounds",
                column: "ActiveRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_GraduationRoundImportRevisions_FileHash",
                table: "GraduationRoundImportRevisions",
                column: "FileHash");

            migrationBuilder.CreateIndex(
                name: "IX_GraduationRoundImportRevisions_GraduationRoundId_RevisionNu~",
                table: "GraduationRoundImportRevisions",
                columns: new[] { "GraduationRoundId", "RevisionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GraduationRoundImportRevisions_ReplacedRevisionId",
                table: "GraduationRoundImportRevisions",
                column: "ReplacedRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_GraduationRoundRevisionAggregates_CohortMajorId",
                table: "GraduationRoundRevisionAggregates",
                column: "CohortMajorId");

            migrationBuilder.CreateIndex(
                name: "IX_GraduationRoundRevisionAggregates_FacultyId",
                table: "GraduationRoundRevisionAggregates",
                column: "FacultyId");

            migrationBuilder.CreateIndex(
                name: "IX_GraduationRoundRevisionAggregates_MajorId",
                table: "GraduationRoundRevisionAggregates",
                column: "MajorId");

            migrationBuilder.CreateIndex(
                name: "IX_GraduationRoundRevisionAggregates_RevisionId_CohortCode",
                table: "GraduationRoundRevisionAggregates",
                columns: new[] { "RevisionId", "CohortCode" });

            migrationBuilder.CreateIndex(
                name: "IX_GraduationRoundRevisionAggregates_RevisionId_FacultyKey_Pro~",
                table: "GraduationRoundRevisionAggregates",
                columns: new[] { "RevisionId", "FacultyKey", "ProgramKey", "CohortCode", "GraduationRank", "IsWorkStudy" },
                unique: true);

            // Các đợt đã có trước migration không thể khôi phục tên file/người tải thật.
            // Gắn nhãn kế thừa rõ ràng và chụp lại đúng số liệu hiện hành để không làm
            // biến mất dữ liệu khi màn hình chuyển sang đọc revision bền vững.
            migrationBuilder.Sql(
                """
                INSERT INTO "GraduationRoundImportRevisions" (
                    "GraduationRoundId", "RevisionNumber", "ReviewMonth", "ReviewYear",
                    "OriginalFileName", "SourceSheetName", "FileHash", "AggregateHash",
                    "SourceRowCount", "ImportedRowCount", "SkippedRowCount", "WarningsJson",
                    "ImportedAtUtc", "ImportedByUserId", "ImportedByName")
                SELECT
                    round."GraduationRoundId", 1,
                    COALESCE(round."ReviewMonth", EXTRACT(MONTH FROM round."CreatedAt")::integer),
                    COALESCE(round."ReviewYear", EXTRACT(YEAR FROM round."CreatedAt")::integer),
                    'Dữ liệu kế thừa trước lịch sử tải lên', 'Không xác định',
                    md5('legacy-file-' || round."GraduationRoundId") || md5('legacy-file-' || round."GraduationRoundId"),
                    md5('legacy-data-' || round."GraduationRoundId") || md5('legacy-data-' || round."GraduationRoundId"),
                    totals."StudentCount", totals."StudentCount", 0, '[]'::jsonb,
                    round."CreatedAt", '00000000-0000-0000-0000-000000000000'::uuid,
                    'Không xác định (dữ liệu kế thừa)'
                FROM "GraduationRounds" round
                JOIN (
                    SELECT "GraduationRoundId", SUM("GraduatedCount")::integer AS "StudentCount"
                    FROM "CohortMajorGraduations"
                    WHERE NOT "IsDeleted"
                    GROUP BY "GraduationRoundId"
                    HAVING SUM("GraduatedCount") > 0
                ) totals ON totals."GraduationRoundId" = round."GraduationRoundId";

                INSERT INTO "GraduationRoundRevisionAggregates" (
                    "RevisionId", "CohortMajorId", "FacultyId", "MajorId",
                    "FacultyNameRaw", "FacultyKey", "ProgramNameRaw", "ProgramKey",
                    "DerivedProgramCode", "CohortCode", "GraduationRank", "IsWorkStudy", "StudentCount")
                SELECT
                    revision."RevisionId", graduation."CohortMajorId", faculty."FacultyId", major."MajorId",
                    faculty."FacultyName", upper(faculty."FacultyName"),
                    major."MajorName", upper(major."MajorName"), major."MajorCode", cohort."CohortCode",
                    rank_data."Rank", split."IsWorkStudy", split."StudentCount"
                FROM "GraduationRoundImportRevisions" revision
                JOIN "CohortMajorGraduations" graduation
                    ON graduation."GraduationRoundId" = revision."GraduationRoundId" AND NOT graduation."IsDeleted"
                JOIN "CohortMajors" cohort_major ON cohort_major."CohortMajorId" = graduation."CohortMajorId"
                JOIN "Cohorts" cohort ON cohort."CohortId" = cohort_major."CohortId"
                JOIN "Majors" major ON major."MajorId" = cohort_major."MajorId"
                JOIN "Faculties" faculty ON faculty."FacultyId" = major."FacultyId"
                CROSS JOIN LATERAL (VALUES
                    ('Excellent', graduation."ExcellentCount", LEAST(graduation."WorkStudyCount", graduation."ExcellentCount")),
                    ('VeryGood', graduation."VeryGoodCount", LEAST(GREATEST(graduation."WorkStudyCount" - graduation."ExcellentCount", 0), graduation."VeryGoodCount")),
                    ('Good', graduation."GoodCount", LEAST(GREATEST(graduation."WorkStudyCount" - graduation."ExcellentCount" - graduation."VeryGoodCount", 0), graduation."GoodCount")),
                    ('Average', graduation."AverageCount", LEAST(GREATEST(graduation."WorkStudyCount" - graduation."ExcellentCount" - graduation."VeryGoodCount" - graduation."GoodCount", 0), graduation."AverageCount"))
                ) rank_data("Rank", "RankCount", "WorkStudyCount")
                CROSS JOIN LATERAL (VALUES
                    (true, rank_data."WorkStudyCount"),
                    (false, rank_data."RankCount" - rank_data."WorkStudyCount")
                ) split("IsWorkStudy", "StudentCount")
                WHERE split."StudentCount" > 0;

                UPDATE "GraduationRounds" round
                SET "ActiveRevisionId" = revision."RevisionId",
                    "ReviewMonth" = revision."ReviewMonth",
                    "ReviewYear" = revision."ReviewYear"
                FROM "GraduationRoundImportRevisions" revision
                WHERE revision."GraduationRoundId" = round."GraduationRoundId";
                """);

            migrationBuilder.AddForeignKey(
                name: "FK_GraduationRounds_GraduationRoundImportRevisions_ActiveRevis~",
                table: "GraduationRounds",
                column: "ActiveRevisionId",
                principalTable: "GraduationRoundImportRevisions",
                principalColumn: "RevisionId",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                INSERT INTO "Permissions" ("Id", "Code", "Name", "Description", "Category")
                SELECT gen_random_uuid(), 'GRADUATION_ANALYTICS_2_ACCESS',
                       'Thống kê tốt nghiệp 2', 'Truy cập module thống kê tốt nghiệp bản dựng lại', 'Tổng quan'
                WHERE NOT EXISTS (
                    SELECT 1 FROM "Permissions" WHERE "Code" = 'GRADUATION_ANALYTICS_2_ACCESS');
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_GraduationRounds_GraduationRoundImportRevisions_ActiveRevis~",
                table: "GraduationRounds");

            migrationBuilder.DropTable(
                name: "GraduationRoundRevisionAggregates");

            migrationBuilder.DropTable(
                name: "GraduationRoundImportRevisions");

            migrationBuilder.DropIndex(
                name: "IX_GraduationRounds_ActiveRevisionId",
                table: "GraduationRounds");

            migrationBuilder.DropColumn(
                name: "ActiveRevisionId",
                table: "GraduationRounds");

            migrationBuilder.DropColumn(
                name: "DeleteReason",
                table: "GraduationRounds");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "GraduationRounds");

            migrationBuilder.DropColumn(
                name: "DeletedByName",
                table: "GraduationRounds");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                table: "GraduationRounds");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "GraduationRounds");
        }
    }
}
