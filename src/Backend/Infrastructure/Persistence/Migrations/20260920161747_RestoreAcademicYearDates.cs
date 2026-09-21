using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RestoreAcademicYearDates : Migration
    {
        /// <summary>Năm học chạy 25/7 của năm đầu đến 24/7 năm sau.</summary>
        private const int StartMonth = 7;
        private const int StartDay = 25;
        private const int EndMonth = 7;
        private const int EndDay = 24;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "EndDate",
                table: "AcademicYears",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.AddColumn<DateOnly>(
                name: "StartDate",
                table: "AcademicYears",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            // Bốn chữ số đầu của tên năm học là năm bắt đầu. Không dùng lượng từ
            // {n} trong regex: chuỗi nội suy $""" coi mọi { } là chỗ chèn giá trị.
            migrationBuilder.Sql($"""
                UPDATE "AcademicYears"
                SET "StartDate" = make_date(
                        left("AcademicYearName", 4)::int, {StartMonth}, {StartDay}),
                    "EndDate" = make_date(
                        left("AcademicYearName", 4)::int + 1, {EndMonth}, {EndDay})
                WHERE left("AcademicYearName", 4) ~ '^[0-9]+$';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EndDate",
                table: "AcademicYears");

            migrationBuilder.DropColumn(
                name: "StartDate",
                table: "AcademicYears");
        }
    }
}
