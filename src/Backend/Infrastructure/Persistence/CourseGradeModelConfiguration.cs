using Domain;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence;

/// <summary>
/// Cấu hình các bảng của phân tích điểm học phần (Domain/CourseGradeModels.cs).
/// Bảng kết quả theo mẫu snapshot của module tốt nghiệp: không nối khóa ngoại vào danh mục
/// (lớp, giảng viên, bộ môn) để giữ nguyên số liệu của lượt tính, chỉ nối vào lượt tính và kỳ.
/// </summary>
internal static class CourseGradeModelConfiguration
{
    public static void Configure(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Student>(entity =>
        {
            entity.ToTable("Students");
            entity.HasKey(x => x.StudentId);
            entity.Property(x => x.StudentCode).HasMaxLength(16).IsRequired();
            entity.Property(x => x.FullName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.AdministrativeClassCode).HasMaxLength(32);
            entity.Property(x => x.Email).HasMaxLength(320);
            entity.Property(x => x.PhoneNumber).HasMaxLength(30);
            entity.Property(x => x.Gender).HasMaxLength(10);
            entity.Property(x => x.StudyStatus).HasMaxLength(50);
            entity.HasIndex(x => x.StudentCode).IsUnique();
            entity.HasIndex(x => x.CohortId);
            entity.HasIndex(x => x.MajorId);
            entity.HasIndex(x => x.FacultyId);
            entity.HasOne<Cohort>().WithMany().HasForeignKey(x => x.CohortId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne<Major>().WithMany().HasForeignKey(x => x.MajorId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne<Faculty>().WithMany().HasForeignKey(x => x.FacultyId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<GradeImportRevision>(entity =>
        {
            entity.ToTable("GradeImportRevisions", table =>
            {
                table.HasCheckConstraint("CK_GradeImportRevisions_RevisionNumber", "\"RevisionNumber\" > 0");
                table.HasCheckConstraint(
                    "CK_GradeImportRevisions_RowCounts",
                    "\"SourceRowCount\" = \"ImportedRowCount\" + \"SkippedRowCount\" AND \"ImportedRowCount\" >= 0 AND \"SkippedRowCount\" >= 0");
            });
            entity.HasKey(x => x.RevisionId);
            entity.Property(x => x.OriginalFileName).HasMaxLength(255).IsRequired();
            entity.Property(x => x.SourceSheetName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.FileHash).HasMaxLength(64).IsFixedLength().IsRequired();
            entity.Property(x => x.SkippedSummaryJson).HasColumnType("jsonb").IsRequired();
            entity.Property(x => x.ReconciliationJson).HasColumnType("jsonb").IsRequired();
            entity.Property(x => x.WarningsJson).HasColumnType("jsonb").IsRequired();
            entity.Property(x => x.ImportedByName).HasMaxLength(320).IsRequired();
            entity.Property(x => x.ReplaceReason).HasMaxLength(1000);
            entity.HasIndex(x => new { x.SemesterId, x.RevisionNumber }).IsUnique();
            // Mỗi kỳ chỉ một lần nạp đang dùng.
            entity.HasIndex(x => x.SemesterId)
                .IsUnique()
                .HasFilter("\"IsActive\"")
                .HasDatabaseName("UX_GradeImportRevisions_SemesterId_Active");
            entity.HasOne<Semester>().WithMany().HasForeignKey(x => x.SemesterId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<GradeImportRevision>()
                .WithMany()
                .HasForeignKey(x => x.ReplacedRevisionId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<StudentCourseGrade>(entity =>
        {
            entity.ToTable("StudentCourseGrades");
            entity.HasKey(x => x.StudentCourseGradeId);
            entity.Property(x => x.SourceTermCode).HasMaxLength(10);
            entity.Property(x => x.CourseCode).HasMaxLength(16).IsRequired();
            entity.Property(x => x.CourseName).HasMaxLength(300);
            entity.Property(x => x.SectionName).HasMaxLength(32);
            entity.Property(x => x.AcademicYearText).HasMaxLength(20);
            entity.Property(x => x.TermText).HasMaxLength(20);
            entity.Property(x => x.ExamRound).HasMaxLength(20);
            entity.Property(x => x.NoteCode).HasMaxLength(4);
            entity.Property(x => x.ExclusionRule).HasMaxLength(4);
            // Bộ luật A mục 4: trong một lần nạp, mỗi cặp (sinh viên, mã học phần) chỉ giữ một
            // dòng được dùng; các dòng trùng còn lại mang ExclusionRule = 'T'.
            entity.HasIndex(x => new { x.RevisionId, x.StudentId, x.CourseCode })
                .IsUnique()
                .HasFilter("\"ExclusionRule\" IS NULL")
                .HasDatabaseName("UX_StudentCourseGrades_Revision_Student_Course_Usable");
            entity.HasIndex(x => new { x.SemesterId, x.CourseSectionId });
            entity.HasIndex(x => new { x.SemesterId, x.StudentId });
            entity.HasIndex(x => x.StudentId);
            entity.HasOne<GradeImportRevision>().WithMany().HasForeignKey(x => x.RevisionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Semester>().WithMany().HasForeignKey(x => x.SemesterId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Student>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<CourseSection>().WithMany().HasForeignKey(x => x.CourseSectionId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<GradeAnalysisThreshold>(entity =>
        {
            entity.ToTable("GradeAnalysisThresholds", table =>
            {
                table.HasCheckConstraint(
                    "CK_GradeAnalysisThresholds_ValueType",
                    "\"ValueType\" IN ('integer', 'decimal', 'boolean', 'text_list')");
                // Chỉ cột đúng loại có giá trị.
                table.HasCheckConstraint(
                    "CK_GradeAnalysisThresholds_ValueMatchesType",
                    "(\"ValueType\" IN ('integer', 'decimal') AND \"NumericValue\" IS NOT NULL AND \"BooleanValue\" IS NULL AND \"TextListValue\" IS NULL)"
                    + " OR (\"ValueType\" = 'boolean' AND \"BooleanValue\" IS NOT NULL AND \"NumericValue\" IS NULL AND \"TextListValue\" IS NULL)"
                    + " OR (\"ValueType\" = 'text_list' AND \"TextListValue\" IS NOT NULL AND \"NumericValue\" IS NULL AND \"BooleanValue\" IS NULL)");
                table.HasCheckConstraint("CK_GradeAnalysisThresholds_Version", "\"Version\" > 0");
            });
            entity.HasKey(x => x.ThresholdCode);
            entity.Property(x => x.ThresholdCode).HasMaxLength(64);
            entity.Property(x => x.GroupCode).HasMaxLength(32).IsRequired();
            entity.Property(x => x.DisplayName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.RuleReference).HasMaxLength(32);
            entity.Property(x => x.ValueType).HasMaxLength(16).IsRequired();
            entity.Property(x => x.NumericValue).HasPrecision(10, 4);
            entity.Property(x => x.DefaultNumericValue).HasPrecision(10, 4);
            entity.Property(x => x.MinValue).HasPrecision(10, 4);
            entity.Property(x => x.MaxValue).HasPrecision(10, 4);
            entity.Property(x => x.Unit).HasMaxLength(32);
            entity.HasIndex(x => new { x.GroupCode, x.SortOrder });
            entity.HasOne<User>().WithMany().HasForeignKey(x => x.UpdatedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<GradeAnalysisRun>(entity =>
        {
            entity.ToTable("GradeAnalysisRuns", table =>
            {
                table.HasCheckConstraint("CK_GradeAnalysisRuns_Status", "\"Status\" BETWEEN 1 AND 4");
                table.HasCheckConstraint("CK_GradeAnalysisRuns_CurrentSucceeded", "NOT \"IsCurrent\" OR \"Status\" = 3");
            });
            entity.HasKey(x => x.RunId);
            entity.Property(x => x.Status).HasConversion<short>();
            entity.Property(x => x.Trigger).HasMaxLength(24).IsRequired();
            entity.Property(x => x.ThresholdSnapshotJson).HasColumnType("jsonb").IsRequired();
            entity.Property(x => x.CrossTermJson).HasColumnType("jsonb");
            entity.Property(x => x.WorkerVersion).HasMaxLength(64);
            entity.Property(x => x.ErrorMessage).HasMaxLength(4000);
            // Một lượt hiện hành, và mỗi lúc chỉ một lượt đang chạy.
            entity.HasIndex(x => x.IsCurrent)
                .IsUnique()
                .HasFilter("\"IsCurrent\"")
                .HasDatabaseName("UX_GradeAnalysisRuns_Current");
            entity.HasIndex(x => x.Status)
                .IsUnique()
                .HasFilter("\"Status\" = 2")
                .HasDatabaseName("UX_GradeAnalysisRuns_SingleRunning");
            entity.HasIndex(x => new { x.Status, x.RequestedAtUtc });
            entity.HasOne<User>().WithMany().HasForeignKey(x => x.RequestedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<GradeAnalysisTermResult>(entity =>
        {
            entity.ToTable("GradeAnalysisTermResults");
            entity.HasKey(x => new { x.RunId, x.SemesterId });
            entity.Property(x => x.DataJson).HasColumnType("jsonb").IsRequired();
            entity.HasOne<GradeAnalysisRun>().WithMany().HasForeignKey(x => x.RunId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Semester>().WithMany().HasForeignKey(x => x.SemesterId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GradeAnalysisCourseResult>(entity =>
        {
            entity.ToTable("GradeAnalysisCourseResults");
            entity.HasKey(x => x.CourseResultId);
            entity.Property(x => x.BaseCourseCode).HasMaxLength(16).IsRequired();
            entity.Property(x => x.DataJson).HasColumnType("jsonb").IsRequired();
            entity.HasIndex(x => new { x.RunId, x.SemesterId, x.BaseCourseCode }).IsUnique();
            entity.HasIndex(x => new { x.RunId, x.SemesterId, x.FacultyId });
            entity.HasIndex(x => new { x.RunId, x.SemesterId, x.DepartmentId });
            entity.HasOne<GradeAnalysisRun>().WithMany().HasForeignKey(x => x.RunId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Semester>().WithMany().HasForeignKey(x => x.SemesterId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GradeAnalysisSectionResult>(entity =>
        {
            entity.ToTable("GradeAnalysisSectionResults");
            entity.HasKey(x => x.SectionResultId);
            entity.Property(x => x.BaseCourseCode).HasMaxLength(16).IsRequired();
            entity.Property(x => x.DataJson).HasColumnType("jsonb").IsRequired();
            entity.Property(x => x.ProfileJson).HasColumnType("jsonb");
            entity.HasIndex(x => new { x.RunId, x.CourseSectionId }).IsUnique();
            entity.HasIndex(x => new { x.RunId, x.SemesterId, x.BaseCourseCode });
            entity.HasIndex(x => new { x.RunId, x.SemesterId, x.DepartmentId });
            entity.HasIndex(x => new { x.RunId, x.LecturerId });
            entity.HasOne<GradeAnalysisRun>().WithMany().HasForeignKey(x => x.RunId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Semester>().WithMany().HasForeignKey(x => x.SemesterId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GradeAnalysisLecturerCourseResult>(entity =>
        {
            entity.ToTable("GradeAnalysisLecturerCourseResults");
            entity.HasKey(x => x.LecturerCourseResultId);
            entity.Property(x => x.BaseCourseCode).HasMaxLength(16).IsRequired();
            entity.Property(x => x.DataJson).HasColumnType("jsonb").IsRequired();
            entity.HasIndex(x => new { x.RunId, x.LecturerId, x.BaseCourseCode }).IsUnique();
            entity.HasIndex(x => new { x.RunId, x.DepartmentId });
            entity.HasIndex(x => new { x.RunId, x.FacultyId });
            entity.HasOne<GradeAnalysisRun>().WithMany().HasForeignKey(x => x.RunId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
