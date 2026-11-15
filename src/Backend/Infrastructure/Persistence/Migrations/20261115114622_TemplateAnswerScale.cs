using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Thang trả lời chuyển từ từng câu hỏi lên bộ câu hỏi: mỗi bộ đúng một thang, dùng
    /// chung cho mọi câu. Đồng thời bỏ hẳn loại thang tự nhập chữ ("ScaleKind" = 'Text').
    ///
    /// Chuyển dữ liệu:
    ///   1. Câu đang dùng thang tự nhập bị xoá mềm. Câu trả lời của chúng là chữ, để lại
    ///      thì phép tính điểm (ép "AnswerValue" sang số) hỏng; xoá mềm thì dòng và câu
    ///      trả lời vẫn nằm nguyên trong bảng.
    ///   2. Thang của bộ = thang có mức chọn được nhiều câu của bộ dùng nhất (ưu tiên câu
    ///      chưa xoá). Bộ không có câu nào dùng thang có mức chọn thì lấy thang có mức
    ///      chọn đầu tiên trong danh mục; danh mục không có thang nào thì tạo thang mặc
    ///      định "Mức độ hài lòng" 5 mức.
    ///   3. Thang tự nhập bị xoá khỏi danh mục, rồi mới bỏ cột "ScaleKind".
    /// </summary>
    public partial class TemplateAnswerScale : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AnswerScaleId",
                table: "SurveyTemplates",
                type: "integer",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "SurveyQuestions" AS q
                SET "IsDeleted" = TRUE, "DeletedAt" = now()
                FROM "AnswerScales" AS s
                WHERE s."AnswerScaleId" = q."AnswerScaleId"
                  AND s."ScaleKind" = 'Text'
                  AND NOT q."IsDeleted";

                UPDATE "SurveyTemplates" AS t
                SET "AnswerScaleId" = (
                    SELECT q."AnswerScaleId"
                    FROM "SurveyQuestions" AS q
                    JOIN "SurveyQuestionSections" AS sec ON sec."SectionId" = q."SectionId"
                    JOIN "AnswerScales" AS s ON s."AnswerScaleId" = q."AnswerScaleId"
                    WHERE sec."SurveyTemplateId" = t."SurveyTemplateId"
                      AND s."ScaleKind" = 'Options'
                    GROUP BY q."AnswerScaleId"
                    ORDER BY count(*) FILTER (WHERE NOT q."IsDeleted") DESC,
                             count(*) DESC,
                             q."AnswerScaleId"
                    LIMIT 1);

                DO $$
                DECLARE fallback integer;
                BEGIN
                    IF EXISTS (SELECT 1 FROM "SurveyTemplates" WHERE "AnswerScaleId" IS NULL) THEN
                        SELECT "AnswerScaleId" INTO fallback
                        FROM "AnswerScales"
                        WHERE "ScaleKind" = 'Options'
                        ORDER BY "IsDeleted", "AnswerScaleId"
                        LIMIT 1;

                        IF fallback IS NULL THEN
                            INSERT INTO "AnswerScales" ("AnswerScaleName", "ScaleKind", "IsDeleted")
                            VALUES ('Mức độ hài lòng', 'Options', FALSE)
                            RETURNING "AnswerScaleId" INTO fallback;

                            INSERT INTO "AnswerScaleOptions" ("AnswerScaleId", "Value", "DisplayText")
                            VALUES (fallback, 1, 'Rất không hài lòng'),
                                   (fallback, 2, 'Không hài lòng'),
                                   (fallback, 3, 'Bình thường'),
                                   (fallback, 4, 'Hài lòng'),
                                   (fallback, 5, 'Rất hài lòng');
                        END IF;

                        UPDATE "SurveyTemplates" SET "AnswerScaleId" = fallback
                        WHERE "AnswerScaleId" IS NULL;
                    END IF;
                END $$;
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_SurveyQuestions_AnswerScales_AnswerScaleId",
                table: "SurveyQuestions");

            migrationBuilder.DropIndex(
                name: "IX_SurveyQuestions_AnswerScaleId",
                table: "SurveyQuestions");

            migrationBuilder.DropColumn(
                name: "AnswerScaleId",
                table: "SurveyQuestions");

            // Không còn câu nào trỏ vào thang tự nhập, và bộ nào cũng đã nhận thang có
            // mức chọn ở trên, nên xoá được thẳng.
            migrationBuilder.Sql("""
                DELETE FROM "AnswerScales" WHERE "ScaleKind" = 'Text';
                """);

            migrationBuilder.DropCheckConstraint(
                name: "CK_AnswerScales_ScaleKind",
                table: "AnswerScales");

            migrationBuilder.DropColumn(
                name: "ScaleKind",
                table: "AnswerScales");

            migrationBuilder.AlterColumn<int>(
                name: "AnswerScaleId",
                table: "SurveyTemplates",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SurveyTemplates_AnswerScaleId",
                table: "SurveyTemplates",
                column: "AnswerScaleId");

            migrationBuilder.AddForeignKey(
                name: "FK_SurveyTemplates_AnswerScales_AnswerScaleId",
                table: "SurveyTemplates",
                column: "AnswerScaleId",
                principalTable: "AnswerScales",
                principalColumn: "AnswerScaleId",
                onDelete: ReferentialAction.Restrict);
        }

        /// <summary>
        /// Trả thang về từng câu (câu nhận thang của bộ chứa nó). Thang tự nhập và câu đã
        /// xoá mềm vì dùng nó không khôi phục được.
        /// </summary>
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ScaleKind",
                table: "AnswerScales",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Options");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AnswerScales_ScaleKind",
                table: "AnswerScales",
                sql: "\"ScaleKind\" IN ('Options', 'Text')");

            migrationBuilder.AddColumn<int>(
                name: "AnswerScaleId",
                table: "SurveyQuestions",
                type: "integer",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "SurveyQuestions" AS q
                SET "AnswerScaleId" = t."AnswerScaleId"
                FROM "SurveyQuestionSections" AS sec
                JOIN "SurveyTemplates" AS t ON t."SurveyTemplateId" = sec."SurveyTemplateId"
                WHERE sec."SectionId" = q."SectionId";
                """);

            migrationBuilder.AlterColumn<int>(
                name: "AnswerScaleId",
                table: "SurveyQuestions",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SurveyQuestions_AnswerScaleId",
                table: "SurveyQuestions",
                column: "AnswerScaleId");

            migrationBuilder.AddForeignKey(
                name: "FK_SurveyQuestions_AnswerScales_AnswerScaleId",
                table: "SurveyQuestions",
                column: "AnswerScaleId",
                principalTable: "AnswerScales",
                principalColumn: "AnswerScaleId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.DropForeignKey(
                name: "FK_SurveyTemplates_AnswerScales_AnswerScaleId",
                table: "SurveyTemplates");

            migrationBuilder.DropIndex(
                name: "IX_SurveyTemplates_AnswerScaleId",
                table: "SurveyTemplates");

            migrationBuilder.DropColumn(
                name: "AnswerScaleId",
                table: "SurveyTemplates");
        }
    }
}
