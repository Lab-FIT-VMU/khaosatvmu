using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Bỏ bảng Students (và trang Danh mục sinh viên). Mã và họ tên sinh viên chuyển thẳng vào
    /// dòng điểm: StudentCourseGrades.StudentCode / StudentName, điền từ Students trước khi xóa.
    ///
    /// Cột StudentId đổi tên thành StudentNumber và giữ nguyên giá trị — con số nằm trong AAD
    /// của ô điểm mã hóa, đổi là không giải mã được. Lần nạp mới đánh số 1, 2, 3… theo file.
    ///
    /// Chặn trùng: trong một lần nạp, mỗi lớp học phần chỉ có một dòng được dùng của mỗi mã
    /// sinh viên (một mã sinh viên vẫn học được nhiều lớp).
    ///
    /// View GradeAnalysisInputs dựng lại để trả cột mới "StudentNumber"; view không đưa mã hay
    /// họ tên sinh viên cho worker.
    /// </summary>
    public partial class RemoveStudentsTable : Migration
    {
        private const string InputsView = """
            CREATE VIEW "GradeAnalysisInputs" AS
            SELECT g."StudentCourseGradeId",
                   g."RevisionId",
                   g."SemesterId",
                   g."{0}",
                   g."CourseSectionId",
                   g."CourseCode",
                   g."SectionName",
                   g."SourceRowNumber",
                   g."XEnc",
                   g."YEnc",
                   g."ZEnc",
                   g."KeyVersion"
            FROM "StudentCourseGrades" g
            JOIN "GradeImportRevisions" r
              ON r."RevisionId" = g."RevisionId" AND r."IsActive"
            WHERE g."ExclusionRule" IS NULL
              AND g."CourseSectionId" IS NOT NULL;
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""DROP VIEW IF EXISTS "GradeAnalysisInputs";""");

            migrationBuilder.AddColumn<string>(
                name: "StudentCode",
                table: "StudentCourseGrades",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StudentName",
                table: "StudentCourseGrades",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "StudentCourseGrades" AS g
                SET "StudentCode" = s."StudentCode",
                    "StudentName" = NULLIF(s."FullName", '')
                FROM "Students" AS s
                WHERE s."StudentId" = g."StudentId";
                """);

            migrationBuilder.AlterColumn<string>(
                name: "StudentCode",
                table: "StudentCourseGrades",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(16)",
                oldMaxLength: 16,
                oldNullable: true);

            migrationBuilder.DropForeignKey(
                name: "FK_StudentCourseGrades_Students_StudentId",
                table: "StudentCourseGrades");

            migrationBuilder.DropTable(
                name: "Students");

            migrationBuilder.DropIndex(
                name: "IX_StudentCourseGrades_SemesterId_StudentId",
                table: "StudentCourseGrades");

            migrationBuilder.DropIndex(
                name: "IX_StudentCourseGrades_StudentId",
                table: "StudentCourseGrades");

            migrationBuilder.RenameColumn(
                name: "StudentId",
                table: "StudentCourseGrades",
                newName: "StudentNumber");

            migrationBuilder.CreateIndex(
                name: "UX_StudentCourseGrades_Revision_Section_Student_Usable",
                table: "StudentCourseGrades",
                columns: new[] { "RevisionId", "CourseSectionId", "StudentCode" },
                unique: true,
                filter: "\"ExclusionRule\" IS NULL AND \"CourseSectionId\" IS NOT NULL");

            migrationBuilder.Sql(string.Format(InputsView, "StudentNumber"));
        }

        /// <summary>
        /// Dựng lại Students từ mã và họ tên trên dòng điểm (một dòng cho mỗi StudentId cũ).
        /// Các cột khác của Students (lớp hành chính, email…) không khôi phục được.
        /// </summary>
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""DROP VIEW IF EXISTS "GradeAnalysisInputs";""");

            migrationBuilder.DropIndex(
                name: "UX_StudentCourseGrades_Revision_Section_Student_Usable",
                table: "StudentCourseGrades");

            migrationBuilder.RenameColumn(
                name: "StudentNumber",
                table: "StudentCourseGrades",
                newName: "StudentId");

            migrationBuilder.CreateTable(
                name: "Students",
                columns: table => new
                {
                    StudentId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CohortMajorId = table.Column<int>(type: "integer", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DateOfBirth = table.Column<DateOnly>(type: "date", nullable: true),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    FullName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Gender = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    PhoneNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    StudentCode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    StudyStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Students", x => x.StudentId);
                    table.ForeignKey(
                        name: "FK_Students_CohortMajors_CohortMajorId",
                        column: x => x.CohortMajorId,
                        principalTable: "CohortMajors",
                        principalColumn: "CohortMajorId",
                        onDelete: ReferentialAction.Restrict);
                });

            // Số mới của các lần nạp sau migration (1, 2, 3…) có thể trùng giữa các kỳ với mã
            // khác nhau; khi đó lấy mã đầu tiên, StudentCode thêm hậu tố để giữ chỉ mục duy nhất.
            migrationBuilder.Sql("""
                INSERT INTO "Students" ("StudentId", "StudentCode", "FullName", "IsDeleted", "CreatedAtUtc", "UpdatedAtUtc")
                OVERRIDING SYSTEM VALUE
                SELECT ids."StudentId",
                       CASE WHEN count(*) OVER (PARTITION BY ids."StudentCode") = 1
                            THEN ids."StudentCode"
                            ELSE left(ids."StudentCode", 10) || '#' || ids."StudentId" END,
                       coalesce(ids."StudentName", ''), FALSE, now(), now()
                FROM (
                    SELECT DISTINCT ON (g."StudentId") g."StudentId", g."StudentCode", g."StudentName"
                    FROM "StudentCourseGrades" g
                    ORDER BY g."StudentId", g."StudentCourseGradeId"
                ) AS ids;

                SELECT setval(pg_get_serial_sequence('"Students"', 'StudentId'),
                              GREATEST((SELECT max("StudentId") FROM "Students"), 1));
                """);

            migrationBuilder.DropColumn(
                name: "StudentCode",
                table: "StudentCourseGrades");

            migrationBuilder.DropColumn(
                name: "StudentName",
                table: "StudentCourseGrades");

            migrationBuilder.CreateIndex(
                name: "IX_StudentCourseGrades_SemesterId_StudentId",
                table: "StudentCourseGrades",
                columns: new[] { "SemesterId", "StudentId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudentCourseGrades_StudentId",
                table: "StudentCourseGrades",
                column: "StudentId");

            migrationBuilder.CreateIndex(
                name: "IX_Students_CohortMajorId",
                table: "Students",
                column: "CohortMajorId");

            migrationBuilder.CreateIndex(
                name: "IX_Students_StudentCode",
                table: "Students",
                column: "StudentCode",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_StudentCourseGrades_Students_StudentId",
                table: "StudentCourseGrades",
                column: "StudentId",
                principalTable: "Students",
                principalColumn: "StudentId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.Sql(string.Format(InputsView, "StudentId"));
        }
    }
}
