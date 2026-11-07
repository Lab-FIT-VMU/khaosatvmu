using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Khảo sát giảng viên thôi xét sĩ số, như CTĐT: bỏ số giảng viên đã chốt ở các đợt cũ để
    /// link không còn tự đóng khi đủ số giảng viên và báo cáo không tính tỷ lệ phản hồi nữa.
    /// Không đổi cấu trúc bảng: cột TargetCount vẫn còn, chỉ không ghi cho loại nào nữa.
    /// </summary>
    public partial class ClearLecturerSurveyTargetCount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "CourseSectionSurveys" AS unit
                SET "TargetCount" = NULL
                FROM "SemesterSurveys" AS survey
                WHERE unit."SemesterSurveyId" = survey."SemesterSurveyId"
                  AND survey."SurveyType" = 'LECTURER'
                  AND unit."TargetCount" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Số giảng viên lúc phát link không lưu ở đâu khác nên không dựng lại được.
        }
    }
}
