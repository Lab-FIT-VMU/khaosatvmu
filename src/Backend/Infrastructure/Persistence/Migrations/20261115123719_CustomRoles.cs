using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Vai trò tùy biến: thêm phạm vi dữ liệu, quyền ghi và hậu tố mã hồ sơ vào "Roles";
    /// chỉ ADMIN và LECTURER còn là vai trò hệ thống (không xóa được).
    /// </summary>
    public partial class CustomRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "CanWrite",
                table: "Roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "DataScope",
                table: "Roles",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ProfileCodeSuffix",
                table: "Roles",
                type: "character varying(4)",
                maxLength: 4,
                nullable: false,
                defaultValue: "");

            // Sáu vai trò mặc định nhận đúng hành vi đang có (trước đây suy cứng theo mã).
            // Vai trò lạ (nếu có) giữ phạm vi bộ môn, chỉ xem, hậu tố R1, R2…
            migrationBuilder.Sql("""
                UPDATE "Roles" SET
                    "DataScope" = CASE "Code"
                        WHEN 'ADMIN' THEN 'ALL'
                        WHEN 'SURVEY_ADMIN' THEN 'ALL'
                        WHEN 'BOARD_OF_DIRECTORS' THEN 'ALL'
                        WHEN 'FACULTY_MANAGER' THEN 'FACULTY'
                        WHEN 'LECTURER' THEN 'OWN'
                        ELSE 'DEPARTMENT' END,
                    "CanWrite" = "Code" IN ('ADMIN', 'SURVEY_ADMIN', 'FACULTY_MANAGER', 'DEPARTMENT_MANAGER'),
                    "ProfileCodeSuffix" = CASE "Code"
                        WHEN 'ADMIN' THEN 'AD'
                        WHEN 'SURVEY_ADMIN' THEN 'QT'
                        WHEN 'BOARD_OF_DIRECTORS' THEN 'GH'
                        WHEN 'FACULTY_MANAGER' THEN 'KV'
                        WHEN 'DEPARTMENT_MANAGER' THEN 'BM'
                        WHEN 'LECTURER' THEN 'GV'
                        ELSE 'R' || substr(md5("Id"::text), 1, 3) END,
                    -- Chỉ hai vai trò không xóa được.
                    "IsSystem" = "Code" IN ('ADMIN', 'LECTURER');
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Roles_Name",
                table: "Roles",
                column: "Name",
                unique: true,
                filter: "NOT \"IsDeleted\"");

            migrationBuilder.CreateIndex(
                name: "IX_Roles_ProfileCodeSuffix",
                table: "Roles",
                column: "ProfileCodeSuffix",
                unique: true,
                filter: "NOT \"IsDeleted\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Roles_DataScope",
                table: "Roles",
                sql: "\"DataScope\" IN ('ALL', 'FACULTY', 'DEPARTMENT', 'OWN')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Roles_OwnScopeReadOnly",
                table: "Roles",
                sql: "\"DataScope\" <> 'OWN' OR NOT \"CanWrite\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Roles_Name",
                table: "Roles");

            migrationBuilder.DropIndex(
                name: "IX_Roles_ProfileCodeSuffix",
                table: "Roles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Roles_DataScope",
                table: "Roles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Roles_OwnScopeReadOnly",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanWrite",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "DataScope",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "ProfileCodeSuffix",
                table: "Roles");
        }
    }
}
