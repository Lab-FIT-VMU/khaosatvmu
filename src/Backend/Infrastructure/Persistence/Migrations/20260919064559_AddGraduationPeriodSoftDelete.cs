using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGraduationPeriodSoftDelete : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DeleteReason",
                table: "GraduationPeriods",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "GraduationPeriods",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedByName",
                table: "GraduationPeriods",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                table: "GraduationPeriods",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "GraduationPeriods",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeleteReason",
                table: "GraduationPeriods");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "GraduationPeriods");

            migrationBuilder.DropColumn(
                name: "DeletedByName",
                table: "GraduationPeriods");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                table: "GraduationPeriods");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "GraduationPeriods");
        }
    }
}
