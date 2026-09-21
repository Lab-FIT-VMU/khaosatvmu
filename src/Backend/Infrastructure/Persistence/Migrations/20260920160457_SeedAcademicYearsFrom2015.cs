using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SeedAcademicYearsFrom2015 : Migration
    {
        /// <summary>
        /// Nới dải năm học xuống 2015-2016. Migration
        /// <c>AddCohortsAndGraduationRounds</c> mới chỉ seed từ 2018-2019, nhưng vẫn
        /// có sinh viên khoá cũ hơn trong các đợt xét tốt nghiệp gần đây.
        /// </summary>
        private const int FirstYear = 2015;
        private const int LastYear = 2017;

        /// <summary>Năm học 2018-2019 ứng với khoá 59, lùi mỗi năm thì giảm một khoá.</summary>
        private const int ReferenceYear = 2018;
        private const int ReferenceCohort = 59;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Chỉ chèn dòng còn thiếu, chạy lại trên cơ sở dữ liệu đã có sẵn năm học
            // hoặc khoá thì không lỗi và không đụng vào dữ liệu cũ.
            for (var year = FirstYear; year <= LastYear; year++)
            {
                var yearName = $"{year}-{year + 1}";
                var cohort = ReferenceCohort + (year - ReferenceYear);

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
            // Chỉ gỡ khi năm học và khoá vẫn còn rỗng; có dữ liệu bám vào thì giữ lại.
            for (var year = LastYear; year >= FirstYear; year--)
            {
                var yearName = $"{year}-{year + 1}";
                var cohort = ReferenceCohort + (year - ReferenceYear);

                migrationBuilder.Sql($"""
                    DELETE FROM "Cohorts"
                    WHERE "CohortCode" = '{cohort}'
                      AND NOT EXISTS (
                        SELECT 1 FROM "CohortMajors"
                        WHERE "CohortMajors"."CohortId" = "Cohorts"."CohortId");
                    """);

                migrationBuilder.Sql($"""
                    DELETE FROM "AcademicYears"
                    WHERE "AcademicYearName" = '{yearName}'
                      AND NOT EXISTS (
                        SELECT 1 FROM "Cohorts"
                        WHERE "Cohorts"."AcademicYearId" = "AcademicYears"."AcademicYearId")
                      AND NOT EXISTS (
                        SELECT 1 FROM "Semesters"
                        WHERE "Semesters"."AcademicYearId" = "AcademicYears"."AcademicYearId")
                      AND NOT EXISTS (
                        SELECT 1 FROM "GraduationRounds"
                        WHERE "GraduationRounds"."AcademicYearId" = "AcademicYears"."AcademicYearId");
                    """);
            }
        }
    }
}
