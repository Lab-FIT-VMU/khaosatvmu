using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StudentCohortMajor : Migration
    {
        /// <summary>
        /// Sinh viên gắn với khóa ngành đào tạo qua khóa ngoại CohortMajorId, thay cho lớp hành chính dạng
        /// chữ và ba cột khóa, ngành, khoa (nay tra qua khóa ngành). Liên kết điền từ lớp hành chính cũ, khớp
        /// đúng mã khóa ngành sau khi chuẩn hóa (Ð → Đ, bỏ khoảng trắng và dấu nối, viết hoa).
        /// </summary>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CohortMajorId",
                table: "Students",
                type: "integer",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "Students" AS s
                SET "CohortMajorId" = cm."CohortMajorId"
                FROM "CohortMajors" AS cm
                WHERE NOT cm."IsDeleted"
                  AND s."AdministrativeClassCode" IS NOT NULL
                  AND upper(regexp_replace(replace(cm."CohortMajorCode", 'Ð', 'Đ'), '[[:space:]_./-]+', '', 'g'))
                    = upper(regexp_replace(replace(s."AdministrativeClassCode", 'Ð', 'Đ'), '[[:space:]_./-]+', '', 'g'));
                """);

            migrationBuilder.DropForeignKey(name: "FK_Students_Cohorts_CohortId", table: "Students");
            migrationBuilder.DropForeignKey(name: "FK_Students_Faculties_FacultyId", table: "Students");
            migrationBuilder.DropForeignKey(name: "FK_Students_Majors_MajorId", table: "Students");
            migrationBuilder.DropIndex(name: "IX_Students_CohortId", table: "Students");
            migrationBuilder.DropIndex(name: "IX_Students_FacultyId", table: "Students");
            migrationBuilder.DropIndex(name: "IX_Students_MajorId", table: "Students");
            migrationBuilder.DropColumn(name: "AdministrativeClassCode", table: "Students");
            migrationBuilder.DropColumn(name: "CohortId", table: "Students");
            migrationBuilder.DropColumn(name: "FacultyId", table: "Students");
            migrationBuilder.DropColumn(name: "MajorId", table: "Students");

            migrationBuilder.CreateIndex(
                name: "IX_Students_CohortMajorId",
                table: "Students",
                column: "CohortMajorId");

            migrationBuilder.AddForeignKey(
                name: "FK_Students_CohortMajors_CohortMajorId",
                table: "Students",
                column: "CohortMajorId",
                principalTable: "CohortMajors",
                principalColumn: "CohortMajorId",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AdministrativeClassCode",
                table: "Students",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);
            migrationBuilder.AddColumn<int>(name: "CohortId", table: "Students", type: "integer", nullable: true);
            migrationBuilder.AddColumn<int>(name: "MajorId", table: "Students", type: "integer", nullable: true);
            migrationBuilder.AddColumn<int>(name: "FacultyId", table: "Students", type: "integer", nullable: true);

            migrationBuilder.Sql("""
                UPDATE "Students" AS s
                SET "AdministrativeClassCode" = cm."CohortMajorCode",
                    "CohortId" = cm."CohortId",
                    "MajorId" = cm."MajorId",
                    "FacultyId" = m."FacultyId"
                FROM "CohortMajors" AS cm
                JOIN "Majors" AS m ON m."MajorId" = cm."MajorId"
                WHERE cm."CohortMajorId" = s."CohortMajorId";
                """);

            migrationBuilder.DropForeignKey(name: "FK_Students_CohortMajors_CohortMajorId", table: "Students");
            migrationBuilder.DropIndex(name: "IX_Students_CohortMajorId", table: "Students");
            migrationBuilder.DropColumn(name: "CohortMajorId", table: "Students");

            migrationBuilder.CreateIndex(name: "IX_Students_CohortId", table: "Students", column: "CohortId");
            migrationBuilder.CreateIndex(name: "IX_Students_MajorId", table: "Students", column: "MajorId");
            migrationBuilder.CreateIndex(name: "IX_Students_FacultyId", table: "Students", column: "FacultyId");
            migrationBuilder.AddForeignKey(
                name: "FK_Students_Cohorts_CohortId", table: "Students", column: "CohortId",
                principalTable: "Cohorts", principalColumn: "CohortId", onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey(
                name: "FK_Students_Majors_MajorId", table: "Students", column: "MajorId",
                principalTable: "Majors", principalColumn: "MajorId", onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey(
                name: "FK_Students_Faculties_FacultyId", table: "Students", column: "FacultyId",
                principalTable: "Faculties", principalColumn: "FacultyId", onDelete: ReferentialAction.SetNull);
        }
    }
}
