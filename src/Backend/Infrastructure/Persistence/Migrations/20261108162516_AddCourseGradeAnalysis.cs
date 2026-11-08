using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Phân tích điểm học phần: sinh viên, lần nạp và dòng điểm (điểm mã hóa), ngưỡng của bộ
    /// luật D/E, lượt tính và bốn bảng kết quả. Kèm view GradeAnalysisInputs: chỗ duy nhất
    /// worker Python đọc điểm, chỉ gồm dòng được dùng của lần nạp đang dùng, không có cột
    /// nào của bảng Students. Xem docs/plans/tich-hop-phan-tich-diem-hoc-phan.md.
    /// </summary>
    public partial class AddCourseGradeAnalysis : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GradeAnalysisRuns",
                columns: table => new
                {
                    RunId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Status = table.Column<short>(type: "smallint", nullable: false),
                    Trigger = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    SemesterIds = table.Column<List<int>>(type: "integer[]", nullable: false),
                    ThresholdVersion = table.Column<int>(type: "integer", nullable: false),
                    ThresholdSnapshotJson = table.Column<string>(type: "jsonb", nullable: false),
                    CrossTermJson = table.Column<string>(type: "jsonb", nullable: true),
                    WorkerVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RequestedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    RequestedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FinishedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ErrorMessage = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    IsCurrent = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GradeAnalysisRuns", x => x.RunId);
                    table.CheckConstraint("CK_GradeAnalysisRuns_CurrentSucceeded", "NOT \"IsCurrent\" OR \"Status\" = 3");
                    table.CheckConstraint("CK_GradeAnalysisRuns_Status", "\"Status\" BETWEEN 1 AND 4");
                    table.ForeignKey(
                        name: "FK_GradeAnalysisRuns_Users_RequestedByUserId",
                        column: x => x.RequestedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "GradeAnalysisThresholds",
                columns: table => new
                {
                    ThresholdCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    GroupCode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RuleReference = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ValueType = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    NumericValue = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: true),
                    BooleanValue = table.Column<bool>(type: "boolean", nullable: true),
                    TextListValue = table.Column<List<string>>(type: "text[]", nullable: true),
                    DefaultNumericValue = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: true),
                    DefaultBooleanValue = table.Column<bool>(type: "boolean", nullable: true),
                    DefaultTextListValue = table.Column<List<string>>(type: "text[]", nullable: true),
                    MinValue = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: true),
                    MaxValue = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: true),
                    Unit = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    SortOrder = table.Column<short>(type: "smallint", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GradeAnalysisThresholds", x => x.ThresholdCode);
                    table.CheckConstraint("CK_GradeAnalysisThresholds_ValueMatchesType", "(\"ValueType\" IN ('integer', 'decimal') AND \"NumericValue\" IS NOT NULL AND \"BooleanValue\" IS NULL AND \"TextListValue\" IS NULL) OR (\"ValueType\" = 'boolean' AND \"BooleanValue\" IS NOT NULL AND \"NumericValue\" IS NULL AND \"TextListValue\" IS NULL) OR (\"ValueType\" = 'text_list' AND \"TextListValue\" IS NOT NULL AND \"NumericValue\" IS NULL AND \"BooleanValue\" IS NULL)");
                    table.CheckConstraint("CK_GradeAnalysisThresholds_ValueType", "\"ValueType\" IN ('integer', 'decimal', 'boolean', 'text_list')");
                    table.CheckConstraint("CK_GradeAnalysisThresholds_Version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_GradeAnalysisThresholds_Users_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "GradeImportRevisions",
                columns: table => new
                {
                    RevisionId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SemesterId = table.Column<int>(type: "integer", nullable: false),
                    RevisionNumber = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    OriginalFileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    SourceSheetName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FileHash = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    SourceRowCount = table.Column<int>(type: "integer", nullable: false),
                    ImportedRowCount = table.Column<int>(type: "integer", nullable: false),
                    SkippedRowCount = table.Column<int>(type: "integer", nullable: false),
                    SkippedSummaryJson = table.Column<string>(type: "jsonb", nullable: false),
                    ReconciliationJson = table.Column<string>(type: "jsonb", nullable: false),
                    WarningsJson = table.Column<string>(type: "jsonb", nullable: false),
                    RuleVersion = table.Column<short>(type: "smallint", nullable: false),
                    ImportedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ImportedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ImportedByName = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    ReplaceReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ReplacedRevisionId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GradeImportRevisions", x => x.RevisionId);
                    table.CheckConstraint("CK_GradeImportRevisions_RevisionNumber", "\"RevisionNumber\" > 0");
                    table.CheckConstraint("CK_GradeImportRevisions_RowCounts", "\"SourceRowCount\" = \"ImportedRowCount\" + \"SkippedRowCount\" AND \"ImportedRowCount\" >= 0 AND \"SkippedRowCount\" >= 0");
                    table.ForeignKey(
                        name: "FK_GradeImportRevisions_GradeImportRevisions_ReplacedRevisionId",
                        column: x => x.ReplacedRevisionId,
                        principalTable: "GradeImportRevisions",
                        principalColumn: "RevisionId",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_GradeImportRevisions_Semesters_SemesterId",
                        column: x => x.SemesterId,
                        principalTable: "Semesters",
                        principalColumn: "SemesterId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Students",
                columns: table => new
                {
                    StudentId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    StudentCode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    FullName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CohortId = table.Column<int>(type: "integer", nullable: true),
                    MajorId = table.Column<int>(type: "integer", nullable: true),
                    FacultyId = table.Column<int>(type: "integer", nullable: true),
                    AdministrativeClassCode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    PhoneNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    DateOfBirth = table.Column<DateOnly>(type: "date", nullable: true),
                    Gender = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    StudyStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Students", x => x.StudentId);
                    table.ForeignKey(
                        name: "FK_Students_Cohorts_CohortId",
                        column: x => x.CohortId,
                        principalTable: "Cohorts",
                        principalColumn: "CohortId",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Students_Faculties_FacultyId",
                        column: x => x.FacultyId,
                        principalTable: "Faculties",
                        principalColumn: "FacultyId",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Students_Majors_MajorId",
                        column: x => x.MajorId,
                        principalTable: "Majors",
                        principalColumn: "MajorId",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "GradeAnalysisCourseResults",
                columns: table => new
                {
                    CourseResultId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RunId = table.Column<long>(type: "bigint", nullable: false),
                    SemesterId = table.Column<int>(type: "integer", nullable: false),
                    BaseCourseCode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DepartmentId = table.Column<int>(type: "integer", nullable: true),
                    FacultyId = table.Column<int>(type: "integer", nullable: true),
                    Flags = table.Column<List<string>>(type: "text[]", nullable: false),
                    StableStates = table.Column<List<string>>(type: "text[]", nullable: false),
                    DataJson = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GradeAnalysisCourseResults", x => x.CourseResultId);
                    table.ForeignKey(
                        name: "FK_GradeAnalysisCourseResults_GradeAnalysisRuns_RunId",
                        column: x => x.RunId,
                        principalTable: "GradeAnalysisRuns",
                        principalColumn: "RunId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GradeAnalysisCourseResults_Semesters_SemesterId",
                        column: x => x.SemesterId,
                        principalTable: "Semesters",
                        principalColumn: "SemesterId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GradeAnalysisLecturerCourseResults",
                columns: table => new
                {
                    LecturerCourseResultId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RunId = table.Column<long>(type: "bigint", nullable: false),
                    LecturerId = table.Column<int>(type: "integer", nullable: false),
                    BaseCourseCode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DepartmentId = table.Column<int>(type: "integer", nullable: true),
                    FacultyId = table.Column<int>(type: "integer", nullable: true),
                    DataJson = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GradeAnalysisLecturerCourseResults", x => x.LecturerCourseResultId);
                    table.ForeignKey(
                        name: "FK_GradeAnalysisLecturerCourseResults_GradeAnalysisRuns_RunId",
                        column: x => x.RunId,
                        principalTable: "GradeAnalysisRuns",
                        principalColumn: "RunId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GradeAnalysisSectionResults",
                columns: table => new
                {
                    SectionResultId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RunId = table.Column<long>(type: "bigint", nullable: false),
                    SemesterId = table.Column<int>(type: "integer", nullable: false),
                    CourseSectionId = table.Column<int>(type: "integer", nullable: false),
                    BaseCourseCode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    LecturerId = table.Column<int>(type: "integer", nullable: true),
                    DepartmentId = table.Column<int>(type: "integer", nullable: true),
                    FacultyId = table.Column<int>(type: "integer", nullable: true),
                    IncludedInStats = table.Column<bool>(type: "boolean", nullable: false),
                    Markers = table.Column<List<string>>(type: "text[]", nullable: false),
                    DataJson = table.Column<string>(type: "jsonb", nullable: false),
                    ProfileJson = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GradeAnalysisSectionResults", x => x.SectionResultId);
                    table.ForeignKey(
                        name: "FK_GradeAnalysisSectionResults_GradeAnalysisRuns_RunId",
                        column: x => x.RunId,
                        principalTable: "GradeAnalysisRuns",
                        principalColumn: "RunId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GradeAnalysisSectionResults_Semesters_SemesterId",
                        column: x => x.SemesterId,
                        principalTable: "Semesters",
                        principalColumn: "SemesterId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GradeAnalysisTermResults",
                columns: table => new
                {
                    RunId = table.Column<long>(type: "bigint", nullable: false),
                    SemesterId = table.Column<int>(type: "integer", nullable: false),
                    DataJson = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GradeAnalysisTermResults", x => new { x.RunId, x.SemesterId });
                    table.ForeignKey(
                        name: "FK_GradeAnalysisTermResults_GradeAnalysisRuns_RunId",
                        column: x => x.RunId,
                        principalTable: "GradeAnalysisRuns",
                        principalColumn: "RunId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GradeAnalysisTermResults_Semesters_SemesterId",
                        column: x => x.SemesterId,
                        principalTable: "Semesters",
                        principalColumn: "SemesterId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StudentCourseGrades",
                columns: table => new
                {
                    StudentCourseGradeId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RevisionId = table.Column<long>(type: "bigint", nullable: false),
                    SemesterId = table.Column<int>(type: "integer", nullable: false),
                    StudentId = table.Column<long>(type: "bigint", nullable: false),
                    CourseSectionId = table.Column<int>(type: "integer", nullable: true),
                    SourceRowNumber = table.Column<int>(type: "integer", nullable: false),
                    SourceTermCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    CourseCode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CourseName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    SectionName = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    AcademicYearText = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    TermText = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    ExamRound = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    NoteCode = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    Component1Enc = table.Column<byte[]>(type: "bytea", nullable: true),
                    Component2Enc = table.Column<byte[]>(type: "bytea", nullable: true),
                    Component3Enc = table.Column<byte[]>(type: "bytea", nullable: true),
                    ExamScoreEnc = table.Column<byte[]>(type: "bytea", nullable: true),
                    OfficialTotalEnc = table.Column<byte[]>(type: "bytea", nullable: true),
                    XEnc = table.Column<byte[]>(type: "bytea", nullable: true),
                    YEnc = table.Column<byte[]>(type: "bytea", nullable: true),
                    ZEnc = table.Column<byte[]>(type: "bytea", nullable: true),
                    ExclusionRule = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    KeyVersion = table.Column<short>(type: "smallint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudentCourseGrades", x => x.StudentCourseGradeId);
                    table.ForeignKey(
                        name: "FK_StudentCourseGrades_CourseSections_CourseSectionId",
                        column: x => x.CourseSectionId,
                        principalTable: "CourseSections",
                        principalColumn: "CourseSectionId",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_StudentCourseGrades_GradeImportRevisions_RevisionId",
                        column: x => x.RevisionId,
                        principalTable: "GradeImportRevisions",
                        principalColumn: "RevisionId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StudentCourseGrades_Semesters_SemesterId",
                        column: x => x.SemesterId,
                        principalTable: "Semesters",
                        principalColumn: "SemesterId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudentCourseGrades_Students_StudentId",
                        column: x => x.StudentId,
                        principalTable: "Students",
                        principalColumn: "StudentId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisCourseResults_RunId_SemesterId_BaseCourseCode",
                table: "GradeAnalysisCourseResults",
                columns: new[] { "RunId", "SemesterId", "BaseCourseCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisCourseResults_RunId_SemesterId_DepartmentId",
                table: "GradeAnalysisCourseResults",
                columns: new[] { "RunId", "SemesterId", "DepartmentId" });

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisCourseResults_RunId_SemesterId_FacultyId",
                table: "GradeAnalysisCourseResults",
                columns: new[] { "RunId", "SemesterId", "FacultyId" });

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisCourseResults_SemesterId",
                table: "GradeAnalysisCourseResults",
                column: "SemesterId");

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisLecturerCourseResults_RunId_DepartmentId",
                table: "GradeAnalysisLecturerCourseResults",
                columns: new[] { "RunId", "DepartmentId" });

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisLecturerCourseResults_RunId_FacultyId",
                table: "GradeAnalysisLecturerCourseResults",
                columns: new[] { "RunId", "FacultyId" });

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisLecturerCourseResults_RunId_LecturerId_BaseCou~",
                table: "GradeAnalysisLecturerCourseResults",
                columns: new[] { "RunId", "LecturerId", "BaseCourseCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisRuns_RequestedByUserId",
                table: "GradeAnalysisRuns",
                column: "RequestedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisRuns_Status_RequestedAtUtc",
                table: "GradeAnalysisRuns",
                columns: new[] { "Status", "RequestedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "UX_GradeAnalysisRuns_Current",
                table: "GradeAnalysisRuns",
                column: "IsCurrent",
                unique: true,
                filter: "\"IsCurrent\"");

            migrationBuilder.CreateIndex(
                name: "UX_GradeAnalysisRuns_SingleRunning",
                table: "GradeAnalysisRuns",
                column: "Status",
                unique: true,
                filter: "\"Status\" = 2");

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisSectionResults_RunId_CourseSectionId",
                table: "GradeAnalysisSectionResults",
                columns: new[] { "RunId", "CourseSectionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisSectionResults_RunId_LecturerId",
                table: "GradeAnalysisSectionResults",
                columns: new[] { "RunId", "LecturerId" });

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisSectionResults_RunId_SemesterId_BaseCourseCode",
                table: "GradeAnalysisSectionResults",
                columns: new[] { "RunId", "SemesterId", "BaseCourseCode" });

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisSectionResults_RunId_SemesterId_DepartmentId",
                table: "GradeAnalysisSectionResults",
                columns: new[] { "RunId", "SemesterId", "DepartmentId" });

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisSectionResults_SemesterId",
                table: "GradeAnalysisSectionResults",
                column: "SemesterId");

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisTermResults_SemesterId",
                table: "GradeAnalysisTermResults",
                column: "SemesterId");

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisThresholds_GroupCode_SortOrder",
                table: "GradeAnalysisThresholds",
                columns: new[] { "GroupCode", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_GradeAnalysisThresholds_UpdatedByUserId",
                table: "GradeAnalysisThresholds",
                column: "UpdatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_GradeImportRevisions_ReplacedRevisionId",
                table: "GradeImportRevisions",
                column: "ReplacedRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_GradeImportRevisions_SemesterId_RevisionNumber",
                table: "GradeImportRevisions",
                columns: new[] { "SemesterId", "RevisionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_GradeImportRevisions_SemesterId_Active",
                table: "GradeImportRevisions",
                column: "SemesterId",
                unique: true,
                filter: "\"IsActive\"");

            migrationBuilder.CreateIndex(
                name: "IX_StudentCourseGrades_CourseSectionId",
                table: "StudentCourseGrades",
                column: "CourseSectionId");

            migrationBuilder.CreateIndex(
                name: "IX_StudentCourseGrades_SemesterId_CourseSectionId",
                table: "StudentCourseGrades",
                columns: new[] { "SemesterId", "CourseSectionId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudentCourseGrades_SemesterId_StudentId",
                table: "StudentCourseGrades",
                columns: new[] { "SemesterId", "StudentId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudentCourseGrades_StudentId",
                table: "StudentCourseGrades",
                column: "StudentId");

            migrationBuilder.CreateIndex(
                name: "UX_StudentCourseGrades_Revision_Student_Course_Usable",
                table: "StudentCourseGrades",
                columns: new[] { "RevisionId", "StudentId", "CourseCode" },
                unique: true,
                filter: "\"ExclusionRule\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Students_CohortId",
                table: "Students",
                column: "CohortId");

            migrationBuilder.CreateIndex(
                name: "IX_Students_FacultyId",
                table: "Students",
                column: "FacultyId");

            migrationBuilder.CreateIndex(
                name: "IX_Students_MajorId",
                table: "Students",
                column: "MajorId");

            migrationBuilder.CreateIndex(
                name: "IX_Students_StudentCode",
                table: "Students",
                column: "StudentCode",
                unique: true);

            // Đầu vào của bộ tính: dòng qua bộ luật A, ghép được với lớp, thuộc lần nạp đang
            // dùng của kỳ. Các cột để giải mã (RevisionId, StudentId, CourseCode, SourceRowNumber)
            // là dữ liệu xác thực kèm theo (AAD) của từng ô mã hóa.
            migrationBuilder.Sql("""
                CREATE VIEW "GradeAnalysisInputs" AS
                SELECT g."StudentCourseGradeId",
                       g."RevisionId",
                       g."SemesterId",
                       g."StudentId",
                       g."CourseSectionId",
                       g."CourseCode",
                       g."SectionName",
                       g."SourceRowNumber",
                       g."XEnc",
                       g."YEnc",
                       g."ZEnc",
                       g."KeyVersion"
                FROM "StudentCourseGrades" g
                JOIN "GradeImportRevisions" r
                  ON r."RevisionId" = g."RevisionId" AND r."IsActive"
                WHERE g."ExclusionRule" IS NULL
                  AND g."CourseSectionId" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""DROP VIEW IF EXISTS "GradeAnalysisInputs";""");

            migrationBuilder.DropTable(
                name: "GradeAnalysisCourseResults");

            migrationBuilder.DropTable(
                name: "GradeAnalysisLecturerCourseResults");

            migrationBuilder.DropTable(
                name: "GradeAnalysisSectionResults");

            migrationBuilder.DropTable(
                name: "GradeAnalysisTermResults");

            migrationBuilder.DropTable(
                name: "GradeAnalysisThresholds");

            migrationBuilder.DropTable(
                name: "StudentCourseGrades");

            migrationBuilder.DropTable(
                name: "GradeAnalysisRuns");

            migrationBuilder.DropTable(
                name: "GradeImportRevisions");

            migrationBuilder.DropTable(
                name: "Students");
        }
    }
}
