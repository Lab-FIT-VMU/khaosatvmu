using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations;

/// <summary>
/// Tách hồ sơ Phó trưởng bộ môn khỏi Trưởng bộ môn và sửa dữ liệu đã được cấp sai
/// theo chức vụ của giảng viên. Đây là data migration, không thay đổi cấu trúc bảng.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260924090000_AddDeputyDepartmentManagerRole")]
public partial class AddDeputyDepartmentManagerRole : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
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
            ON CONFLICT ("Code") DO UPDATE SET
                "Name" = EXCLUDED."Name",
                "Description" = EXCLUDED."Description",
                "IsSystem" = TRUE,
                "IsDeleted" = FALSE,
                "DeletedAt" = NULL;

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
            ON CONFLICT ("RoleId", "PermissionId") DO UPDATE SET
                "IsGranted" = EXCLUDED."IsGranted";

            WITH deputy_users AS (
                SELECT DISTINCT users."Id" AS "UserId"
                FROM "Users" users
                JOIN "Lecturers" lecturers ON lecturers."LecturerId" = users."LecturerId"
                JOIN "Positions" positions ON positions."PositionId" = lecturers."PositionId"
                WHERE NOT lecturers."IsDeleted"
                  AND NOT positions."IsDeleted"
                  AND regexp_replace(lower(trim(positions."PositionName")), '\s+', ' ', 'g')
                      IN ('phó trưởng bộ môn', 'phó bộ môn', 'pho truong bo mon', 'pho bo mon')
            ), role_ids AS (
                SELECT
                    (SELECT "Id" FROM "Roles" WHERE "Code" = 'DEPARTMENT_MANAGER') AS "ManagerRoleId",
                    (SELECT "Id" FROM "Roles" WHERE "Code" = 'DEPUTY_DEPARTMENT_MANAGER') AS "DeputyRoleId"
            )
            UPDATE "UserProfiles" profile
            SET "RoleId" = role_ids."DeputyRoleId",
                "ProfileName" = 'Phó trưởng bộ môn',
                "ProfileCode" = CASE
                    WHEN profile."ProfileCode" ~* '[a-z]{2}$'
                        THEN regexp_replace(profile."ProfileCode", '[a-z]{2}$', 'PB', 'i')
                    ELSE profile."ProfileCode" || 'PB'
                END,
                "UpdatedAt" = NOW()
            FROM deputy_users, role_ids
            WHERE profile."UserId" = deputy_users."UserId"
              AND profile."RoleId" = role_ids."ManagerRoleId"
              AND NOT EXISTS (
                  SELECT 1
                  FROM "UserProfiles" existing_deputy
                  WHERE existing_deputy."UserId" = profile."UserId"
                    AND existing_deputy."RoleId" = role_ids."DeputyRoleId");

            WITH deputy_users AS (
                SELECT DISTINCT users."Id" AS "UserId"
                FROM "Users" users
                JOIN "Lecturers" lecturers ON lecturers."LecturerId" = users."LecturerId"
                JOIN "Positions" positions ON positions."PositionId" = lecturers."PositionId"
                WHERE NOT lecturers."IsDeleted"
                  AND NOT positions."IsDeleted"
                  AND regexp_replace(lower(trim(positions."PositionName")), '\s+', ' ', 'g')
                      IN ('phó trưởng bộ môn', 'phó bộ môn', 'pho truong bo mon', 'pho bo mon')
            ), role_ids AS (
                SELECT
                    (SELECT "Id" FROM "Roles" WHERE "Code" = 'DEPARTMENT_MANAGER') AS "ManagerRoleId",
                    (SELECT "Id" FROM "Roles" WHERE "Code" = 'DEPUTY_DEPARTMENT_MANAGER') AS "DeputyRoleId"
            )
            UPDATE "UserProfiles" manager_profile
            SET "IsActive" = FALSE,
                "IsDefault" = FALSE,
                "UpdatedAt" = NOW()
            FROM deputy_users, role_ids
            WHERE manager_profile."UserId" = deputy_users."UserId"
              AND manager_profile."RoleId" = role_ids."ManagerRoleId"
              AND EXISTS (
                  SELECT 1
                  FROM "UserProfiles" existing_deputy
                  WHERE existing_deputy."UserId" = manager_profile."UserId"
                    AND existing_deputy."RoleId" = role_ids."DeputyRoleId");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            WITH role_ids AS (
                SELECT
                    (SELECT "Id" FROM "Roles" WHERE "Code" = 'DEPARTMENT_MANAGER') AS "ManagerRoleId",
                    (SELECT "Id" FROM "Roles" WHERE "Code" = 'DEPUTY_DEPARTMENT_MANAGER') AS "DeputyRoleId"
            )
            DELETE FROM "UserProfiles" deputy_profile
            USING role_ids
            WHERE deputy_profile."RoleId" = role_ids."DeputyRoleId"
              AND EXISTS (
                  SELECT 1
                  FROM "UserProfiles" manager_profile
                  WHERE manager_profile."UserId" = deputy_profile."UserId"
                    AND manager_profile."RoleId" = role_ids."ManagerRoleId");

            WITH role_ids AS (
                SELECT
                    (SELECT "Id" FROM "Roles" WHERE "Code" = 'DEPARTMENT_MANAGER') AS "ManagerRoleId",
                    (SELECT "Id" FROM "Roles" WHERE "Code" = 'DEPUTY_DEPARTMENT_MANAGER') AS "DeputyRoleId"
            )
            UPDATE "UserProfiles" profile
            SET "RoleId" = role_ids."ManagerRoleId",
                "ProfileName" = 'Trưởng bộ môn',
                "ProfileCode" = CASE
                    WHEN profile."ProfileCode" ~* '[a-z]{2}$'
                        THEN regexp_replace(profile."ProfileCode", '[a-z]{2}$', 'BM', 'i')
                    ELSE profile."ProfileCode" || 'BM'
                END,
                "UpdatedAt" = NOW()
            FROM role_ids
            WHERE profile."RoleId" = role_ids."DeputyRoleId";

            DELETE FROM "Roles" WHERE "Code" = 'DEPUTY_DEPARTMENT_MANAGER';
            """);
    }
}
