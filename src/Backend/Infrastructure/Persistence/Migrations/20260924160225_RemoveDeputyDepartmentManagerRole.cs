using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Bỏ vai trò Phó trưởng bộ môn: Trưởng bộ môn và Phó bộ môn giờ cùng nhận một hồ sơ
    /// Quản lý bộ môn. Chỉ chuyển dữ liệu, không đổi cấu trúc bảng.
    /// <list type="number">
    /// <item>Người có cả hồ sơ phó lẫn hồ sơ quản lý: dồn về hồ sơ quản lý. Phiên đăng nhập
    /// đang đứng ở hồ sơ phó chuyển sang hồ sơ quản lý để khỏi bị đăng xuất, và hồ sơ quản
    /// lý được bật lại nếu hồ sơ phó đang dùng.</item>
    /// <item>Người chỉ có hồ sơ phó: đổi thẳng hồ sơ đó sang Quản lý bộ môn, đuôi mã BM.</item>
    /// <item>Xoá vai trò; quyền của vai trò xoá theo khoá ngoại.</item>
    /// </list>
    /// </summary>
    public partial class RemoveDeputyDepartmentManagerRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                CREATE TEMP TABLE deputy_merge AS
                SELECT
                    deputy."Id" AS "DeputyProfileId",
                    manager."Id" AS "ManagerProfileId",
                    deputy."IsActive" AS "DeputyActive",
                    deputy."IsDefault" AS "DeputyDefault"
                FROM "UserProfiles" deputy
                JOIN "Roles" deputy_role
                    ON deputy_role."Id" = deputy."RoleId"
                   AND deputy_role."Code" = 'DEPUTY_DEPARTMENT_MANAGER'
                JOIN "Roles" manager_role ON manager_role."Code" = 'DEPARTMENT_MANAGER'
                JOIN LATERAL (
                    SELECT m."Id"
                    FROM "UserProfiles" m
                    WHERE m."UserId" = deputy."UserId"
                      AND m."RoleId" = manager_role."Id"
                    ORDER BY m."IsActive" DESC, m."CreatedAt"
                    LIMIT 1
                ) manager ON TRUE;

                UPDATE "AuthSessions" session
                SET "ActiveProfileId" = merge."ManagerProfileId"
                FROM deputy_merge merge
                WHERE session."ActiveProfileId" = merge."DeputyProfileId";

                DELETE FROM "UserProfiles" profile
                USING deputy_merge merge
                WHERE profile."Id" = merge."DeputyProfileId";

                UPDATE "UserProfiles" profile
                SET "IsActive" = profile."IsActive" OR merge."DeputyActive",
                    "IsDefault" = CASE
                        WHEN merge."DeputyActive" AND merge."DeputyDefault" THEN TRUE
                        ELSE profile."IsDefault" AND profile."IsActive"
                    END,
                    "UpdatedAt" = NOW()
                FROM deputy_merge merge
                WHERE profile."Id" = merge."ManagerProfileId";

                DROP TABLE deputy_merge;

                UPDATE "UserProfiles" profile
                SET "RoleId" = (SELECT "Id" FROM "Roles" WHERE "Code" = 'DEPARTMENT_MANAGER'),
                    "ProfileName" = 'Quản lý bộ môn',
                    "ProfileCode" = CASE
                        WHEN profile."ProfileCode" ~* '[a-z]{2}$'
                            THEN regexp_replace(profile."ProfileCode", '[a-z]{2}$', 'BM', 'i')
                        ELSE profile."ProfileCode" || 'BM'
                    END,
                    "UpdatedAt" = NOW()
                WHERE profile."RoleId" = (SELECT "Id" FROM "Roles" WHERE "Code" = 'DEPUTY_DEPARTMENT_MANAGER');

                DELETE FROM "Roles" WHERE "Code" = 'DEPUTY_DEPARTMENT_MANAGER';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Chỉ dựng lại vai trò và bộ quyền của nó; hồ sơ đã dồn về Quản lý bộ môn thì
            // giữ nguyên, không tách ngược được.
            migrationBuilder.Sql(
                """
                INSERT INTO "Roles" ("Id", "Code", "Name", "Description", "IsSystem", "IsDeleted", "DeletedAt")
                VALUES (
                    '4d5bbacf-2016-4f75-bae6-0cf7637557bb',
                    'DEPUTY_DEPARTMENT_MANAGER',
                    'Phó trưởng bộ môn',
                    'Hồ sơ phó quản lý bộ môn, có cùng quyền hạn với trưởng bộ môn',
                    TRUE,
                    FALSE,
                    NULL)
                ON CONFLICT ("Code") DO NOTHING;

                INSERT INTO "RolePermissions" ("Id", "RoleId", "PermissionId", "IsGranted", "CreatedAt")
                SELECT
                    md5(deputy."Id"::text || ':' || manager_permission."PermissionId"::text)::uuid,
                    deputy."Id",
                    manager_permission."PermissionId",
                    manager_permission."IsGranted",
                    NOW()
                FROM "Roles" deputy
                JOIN "Roles" manager ON manager."Code" = 'DEPARTMENT_MANAGER'
                JOIN "RolePermissions" manager_permission ON manager_permission."RoleId" = manager."Id"
                WHERE deputy."Code" = 'DEPUTY_DEPARTMENT_MANAGER'
                ON CONFLICT ("RoleId", "PermissionId") DO NOTHING;
                """);
        }
    }
}
