using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SeedSemestersForAllAcademicYears : Migration
    {
        /// <summary>
        /// Ba học kỳ chuẩn của một năm học, đặt tên theo đúng các năm đã nhập tay
        /// trước đó (2025-2026, 2026-2027).
        /// </summary>
        private static readonly string[] _semesterNames = ["Học kỳ 1", "Học kỳ 2", "Học kỳ phụ"];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Bù học kỳ cho mọi năm học còn thiếu, kể cả năm học thêm sau này bằng
            // tay. Chỉ chèn dòng còn thiếu nên chạy lại không nhân đôi dữ liệu.
            foreach (var semesterName in _semesterNames)
            {
                migrationBuilder.Sql($"""
                    INSERT INTO "Semesters" ("SemesterName", "AcademicYearId", "IsDeleted")
                    SELECT '{semesterName}', year."AcademicYearId", false
                    FROM "AcademicYears" year
                    WHERE year."IsDeleted" = false
                      AND NOT EXISTS (
                        SELECT 1 FROM "Semesters" semester
                        WHERE semester."AcademicYearId" = year."AcademicYearId"
                          AND semester."SemesterName" = '{semesterName}');
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Chỉ gỡ học kỳ rỗng: còn lớp học phần hoặc đợt khảo sát bám vào thì giữ.
            foreach (var semesterName in _semesterNames)
            {
                migrationBuilder.Sql($"""
                    DELETE FROM "Semesters" semester
                    WHERE semester."SemesterName" = '{semesterName}'
                      AND NOT EXISTS (
                        SELECT 1 FROM "CourseSections"
                        WHERE "CourseSections"."SemesterId" = semester."SemesterId")
                      AND NOT EXISTS (
                        SELECT 1 FROM "SemesterSurveys"
                        WHERE "SemesterSurveys"."SemesterId" = semester."SemesterId");
                    """);
            }
        }
    }
}
