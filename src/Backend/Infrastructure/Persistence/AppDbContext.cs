using Domain;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<AuthAuditLog> AuthAuditLogs => Set<AuthAuditLog>();
    public DbSet<AuthSession> AuthSessions => Set<AuthSession>();
    public DbSet<Faculty> Faculties => Set<Faculty>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Major> Majors => Set<Major>();
    public DbSet<Position> Positions => Set<Position>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<Lecturer> Lecturers => Set<Lecturer>();
    public DbSet<AcademicYear> AcademicYears => Set<AcademicYear>();
    public DbSet<Semester> Semesters => Set<Semester>();
    public DbSet<CourseSection> CourseSections => Set<CourseSection>();
    public DbSet<AnswerScale> AnswerScales => Set<AnswerScale>();
    public DbSet<AnswerScaleOption> AnswerScaleOptions => Set<AnswerScaleOption>();
    public DbSet<SurveyTemplate> SurveyTemplates => Set<SurveyTemplate>();
    public DbSet<SurveyQuestionSection> SurveyQuestionSections => Set<SurveyQuestionSection>();
    public DbSet<SurveyQuestion> SurveyQuestions => Set<SurveyQuestion>();
    public DbSet<SemesterSurvey> SemesterSurveys => Set<SemesterSurvey>();
    public DbSet<CourseSectionSurvey> CourseSectionSurveys => Set<CourseSectionSurvey>();
    public DbSet<CourseSectionSurveyQuestionScore> CourseSectionSurveyQuestionScores =>
        Set<CourseSectionSurveyQuestionScore>();
    public DbSet<SurveyResponse> SurveyResponses => Set<SurveyResponse>();
    public DbSet<SurveyResponseAnswer> SurveyResponseAnswers => Set<SurveyResponseAnswer>();
    public DbSet<SurveyScoringSetting> SurveyScoringSettings => Set<SurveyScoringSetting>();
    public DbSet<SurveyScoringChangeLog> SurveyScoringChangeLogs => Set<SurveyScoringChangeLog>();
    public DbSet<GraduationAnalyticsDataset> GraduationAnalyticsDatasets =>
        Set<GraduationAnalyticsDataset>();
    public DbSet<GraduationAnalyticsRow> GraduationAnalyticsRows => Set<GraduationAnalyticsRow>();
    public DbSet<GraduationPeriod> GraduationPeriods => Set<GraduationPeriod>();
    public DbSet<GraduationImportRevision> GraduationImportRevisions => Set<GraduationImportRevision>();
    public DbSet<GraduationAggregateRow> GraduationAggregateRows => Set<GraduationAggregateRow>();
    public DbSet<ChangeAuditLog> ChangeAuditLogs => Set<ChangeAuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasSequence<long>("UserProfileCodeSequence");

        // Global soft-delete filters — excluded from queries unless .IgnoreQueryFilters() is used
        modelBuilder.Entity<Role>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Faculty>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Department>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Major>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Position>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<AcademicYear>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Semester>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<CourseSection>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Lecturer>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Course>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<AnswerScale>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<SurveyTemplate>().HasQueryFilter(e => !e.IsDeleted);
        // Xoá mục thì mọi câu thuộc mục cũng được gán IsDeleted trong cùng lần lưu,
        // nên hai bộ lọc dưới đây độc lập với nhau là đủ, không phải lọc bắc cầu.
        modelBuilder.Entity<SurveyQuestionSection>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<SurveyQuestion>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<SemesterSurvey>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<CourseSectionSurvey>().HasQueryFilter(e => !e.IsDeleted);
        // Phiếu bị thanh tra huỷ để lớp làm lại. Lọc ở đây thì mọi phép tính sống
        // — điểm lớp, Z-score, tổng quan toàn trường — tự bỏ qua, không phải sửa
        // hai chục chỗ truy vấn.
        modelBuilder.Entity<SurveyResponse>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<GraduationPeriod>().HasQueryFilter(e => !e.IsDeleted);
        // Câu trả lời không có cột IsDeleted riêng mà bám theo phiếu cha. Bắt buộc
        // phải khai bộ lọc khớp: answer là đầu BẮT BUỘC của quan hệ, thiếu bộ lọc
        // thì EF cảnh báo đọc ra answer mà navigation phiếu cha lại null.
        // Chỗ nào cần nhìn cả phiếu đã huỷ thì gọi IgnoreQueryFilters() cho rõ ý.
        // Navigation khai nullable cho khớp EF, nhưng quan hệ là bắt buộc nên không
        // bao giờ null thật; dấu ! ở đây chỉ để tắt cảnh báo, không phải giả định ẩu.
        modelBuilder.Entity<SurveyResponseAnswer>()
            .HasQueryFilter(e => !e.SurveyResponse!.IsDeleted);

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Email).HasMaxLength(320).IsRequired();
            entity.Property(x => x.GoogleSubject).HasMaxLength(255);
            entity.Property(x => x.DisplayName).HasMaxLength(200);
            entity.Property(x => x.AvatarUrl).HasMaxLength(2048);
            entity.HasIndex(x => x.Email).IsUnique();
            entity.HasIndex(x => x.GoogleSubject).IsUnique();
            // Một giảng viên chỉ được gắn với đúng một tài khoản. PostgreSQL cho
            // phép nhiều NULL trong UNIQUE index nên các tài khoản quản trị thuần
            // vẫn cùng tồn tại được.
            entity.HasIndex(x => x.LecturerId).IsUnique();
            entity.HasOne<Lecturer>()
                .WithMany()
                .HasForeignKey(x => x.LecturerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<UserProfile>(entity =>
        {
            entity.ToTable("UserProfiles");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.ProfileName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.ProfileCode).HasMaxLength(100).IsRequired();
            entity.Property(x => x.OrganizationUnitCode).HasMaxLength(100);
            entity.Property(x => x.OrganizationUnitName).HasMaxLength(200);
            entity.HasIndex(x => x.ProfileCode).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.IsActive });
            entity.HasIndex(x => x.UserId)
                .HasDatabaseName("UX_UserProfiles_UserId_ActiveDefault")
                .IsUnique()
                .HasFilter("\"IsActive\" = TRUE AND \"IsDefault\" = TRUE");
            entity.HasIndex(x => new { x.UserId, x.RoleId, x.OrganizationUnitCode }).IsUnique();
            entity.HasOne<User>().WithMany(x => x.Profiles).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Role>().WithMany().HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.ToTable("Roles");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Code).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Name).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<Permission>(entity =>
        {
            entity.ToTable("Permissions");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Code).HasMaxLength(150).IsRequired();
            entity.Property(x => x.Name).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.Category).HasMaxLength(100).IsRequired();
            entity.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<RolePermission>(entity =>
        {
            entity.ToTable("RolePermissions");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.RoleId, x.PermissionId }).IsUnique();
            entity.HasOne<Role>().WithMany().HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Permission>().WithMany().HasForeignKey(x => x.PermissionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuthAuditLog>(entity =>
        {
            entity.ToTable("AuthAuditLogs");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Email).HasMaxLength(320);
            entity.Property(x => x.Event).HasMaxLength(100).IsRequired();
            entity.Property(x => x.IpAddress).HasMaxLength(64);
            entity.Property(x => x.UserAgent).HasMaxLength(1000);
            entity.HasIndex(x => new { x.UserId, x.CreatedAt });
            entity.HasIndex(x => new { x.Event, x.CreatedAt });
            entity.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne<UserProfile>().WithMany().HasForeignKey(x => x.ProfileId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<AuthSession>(entity =>
        {
            entity.ToTable("AuthSessions");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.RevokedReason).HasMaxLength(200);
            entity.HasIndex(x => new { x.UserId, x.RevokedAt, x.ExpiresAt });
            entity.HasIndex(x => new { x.ActiveProfileId, x.RevokedAt });
            entity.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<UserProfile>().WithMany().HasForeignKey(x => x.ActiveProfileId).OnDelete(DeleteBehavior.Cascade);
        });

        // Danh mục đào tạo. Tên bảng, tên cột và ràng buộc khớp dtb.md.
        modelBuilder.Entity<Faculty>(entity =>
        {
            entity.ToTable("Faculties");
            entity.HasKey(x => x.FacultyId);
            entity.Property(x => x.FacultyName).IsRequired();
            entity.HasIndex(x => x.FacultyName).IsUnique();
        });

        modelBuilder.Entity<Department>(entity =>
        {
            entity.ToTable("Departments");
            entity.HasKey(x => x.DepartmentId);
            entity.Property(x => x.DepartmentId).ValueGeneratedNever();
            entity.Property(x => x.DepartmentName).IsRequired();
            entity.HasIndex(x => x.FacultyId);
            entity.HasOne<Faculty>()
                .WithMany()
                .HasForeignKey(x => x.FacultyId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Position>(entity =>
        {
            entity.ToTable("Positions");
            entity.HasKey(x => x.PositionId);
            entity.Property(x => x.PositionName).IsRequired();
            entity.HasIndex(x => x.PositionName).IsUnique();
        });

        modelBuilder.Entity<Major>(entity =>
        {
            entity.ToTable("Majors");
            entity.HasKey(x => x.MajorId);
            entity.Property(x => x.MajorName).IsRequired();
            entity.HasIndex(x => x.FacultyId);
            entity.HasOne<Faculty>()
                .WithMany()
                .HasForeignKey(x => x.FacultyId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Bảng cấu hình một dòng: cặp ngưỡng lọc lớp được tính điểm, và ba cờ bật
        // tắt từng luật của bộ lọc nhiễu.
        modelBuilder.Entity<SurveyScoringSetting>(entity =>
        {
            entity.ToTable("SurveyScoringSettings");
            entity.HasKey(x => x.SurveyScoringSettingId);
            entity.Property(x => x.MinimumResponseRate).HasColumnType("numeric(5,2)");
            entity.Property(x => x.MinimumValidRate).HasColumnType("numeric(5,2)");
            // Mặc định true để dòng cấu hình đang có sẵn trên máy chủ giữ nguyên
            // hành vi cũ: cả ba luật đều áp, y như trước khi có ba cờ này.
            entity.Property(x => x.RejectTooFast).HasDefaultValue(true);
            entity.Property(x => x.RejectSingleAnswer).HasDefaultValue(true);
            entity.Property(x => x.RejectAttentionCheckFailed).HasDefaultValue(true);
        });

        // Lịch sử đổi cấu hình và tính lại điểm, chỉ thêm dòng. Không gắn khoá ngoại
        // sang "SemesterSurveys": đợt bị xoá thì dòng lịch sử vẫn phải còn nguyên.
        modelBuilder.Entity<SurveyScoringChangeLog>(entity =>
        {
            entity.ToTable("SurveyScoringChangeLogs");
            entity.HasKey(x => x.SurveyScoringChangeLogId);
            entity.Property(x => x.Kind).HasMaxLength(32).IsRequired();
            entity.Property(x => x.MinimumResponseRate).HasColumnType("numeric(5,2)");
            entity.Property(x => x.MinimumValidRate).HasColumnType("numeric(5,2)");
            entity.Property(x => x.ChangedByName).HasMaxLength(256).IsRequired();
            entity.HasIndex(x => x.SemesterSurveyId);
        });

        modelBuilder.Entity<AcademicYear>(entity =>
        {
            entity.ToTable("AcademicYears");
            entity.HasKey(x => x.AcademicYearId);
            entity.Property(x => x.AcademicYearName).IsRequired();
            entity.HasIndex(x => x.AcademicYearName).IsUnique();
        });

        modelBuilder.Entity<Semester>(entity =>
        {
            entity.ToTable("Semesters");
            entity.HasKey(x => x.SemesterId);
            entity.Property(x => x.SemesterName).IsRequired();
            entity.HasIndex(x => new { x.AcademicYearId, x.SemesterName }).IsUnique();
            entity.HasOne<AcademicYear>()
                .WithMany()
                .HasForeignKey(x => x.AcademicYearId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CourseSection>(entity =>
        {
            entity.ToTable("CourseSections");
            entity.HasKey(x => x.CourseSectionId);
            entity.Property(x => x.SectionName).IsRequired();
            entity.Property(x => x.UnidentifiedLecturerName).HasMaxLength(200);
            entity.HasIndex(x => new { x.CourseId, x.SemesterId, x.SectionName }).IsUnique();
            entity.HasIndex(x => x.SemesterId);
            entity.HasIndex(x => x.LecturerId);
            // Lọc nhanh các lớp còn chờ bổ sung email giảng viên.
            entity.HasIndex(x => x.UnidentifiedLecturerName)
                .HasFilter("\"UnidentifiedLecturerName\" IS NOT NULL");
            entity.HasOne<Course>()
                .WithMany()
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Semester>()
                .WithMany()
                .HasForeignKey(x => x.SemesterId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Lecturer>()
                .WithMany()
                .HasForeignKey(x => x.LecturerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Lecturer>(entity =>
        {
            entity.ToTable("Lecturers");
            entity.HasKey(x => x.LecturerId);
            entity.Property(x => x.FullName).IsRequired();
            entity.Property(x => x.Email).IsRequired();
            entity.HasIndex(x => x.Email).IsUnique();
            entity.HasIndex(x => x.DepartmentId);
            entity.HasIndex(x => x.FacultyId);
            entity.HasIndex(x => x.PositionId);
            entity.HasOne<Department>()
                .WithMany()
                .HasForeignKey(x => x.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Faculty>()
                .WithMany()
                .HasForeignKey(x => x.FacultyId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Position>()
                .WithMany()
                .HasForeignKey(x => x.PositionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Course>(entity =>
        {
            entity.ToTable("Courses");
            entity.HasKey(x => x.CourseId);
            entity.Property(x => x.CourseCode).IsRequired();
            entity.Property(x => x.CourseName).IsRequired();
            // Nullable: học phần tạo tự động khi import lớp học phần chưa biết loại.
            entity.Property(x => x.CourseType).HasMaxLength(20);
            entity.HasIndex(x => x.CourseCode).IsUnique();
            entity.HasIndex(x => x.DepartmentId);
            entity.HasIndex(x => x.FacultyId);
            entity.HasIndex(x => x.PrerequisiteCourseId);
            entity.HasOne<Department>()
                .WithMany()
                .HasForeignKey(x => x.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Faculty>()
                .WithMany()
                .HasForeignKey(x => x.FacultyId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Course>()
                .WithMany()
                .HasForeignKey(x => x.PrerequisiteCourseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Bộ câu hỏi khảo sát. Giới hạn 30 câu mỗi bộ được kiểm tra ở tầng
        // service (dtb.md cho phép bỏ trigger và validate trong backend).
        modelBuilder.Entity<AnswerScale>(entity =>
        {
            entity.ToTable("AnswerScales", table =>
                table.HasCheckConstraint(
                    "CK_AnswerScales_ScaleKind",
                    "\"ScaleKind\" IN ('Options', 'Text')"));
            entity.HasKey(x => x.AnswerScaleId);
            entity.Property(x => x.AnswerScaleName).IsRequired();
            entity.Property(x => x.ScaleKind).HasMaxLength(20).IsRequired();
        });

        modelBuilder.Entity<AnswerScaleOption>(entity =>
        {
            entity.ToTable("AnswerScaleOptions", table =>
                table.HasCheckConstraint("CK_AnswerScaleOptions_Value", "\"Value\" BETWEEN 1 AND 5"));
            entity.HasKey(x => x.AnswerScaleOptionId);
            entity.Property(x => x.DisplayText).IsRequired();
            entity.HasIndex(x => new { x.AnswerScaleId, x.Value }).IsUnique();
            entity.HasOne<AnswerScale>()
                .WithMany()
                .HasForeignKey(x => x.AnswerScaleId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SurveyTemplate>(entity =>
        {
            entity.ToTable("SurveyTemplates");
            entity.HasKey(x => x.SurveyTemplateId);
            entity.Property(x => x.TemplateName).IsRequired();
        });

        // Mục chia nhóm câu hỏi, thuộc sở hữu của đúng một bộ câu hỏi.
        modelBuilder.Entity<SurveyQuestionSection>(entity =>
        {
            entity.ToTable("SurveyQuestionSections");
            entity.HasKey(x => x.SectionId);
            entity.Property(x => x.SectionName).IsRequired();
            // UNIQUE có điều kiện: xoá mục rồi tạo lại đúng tên cũ là thao tác rất
            // tự nhiên, thiếu mệnh đề WHERE thì lần tạo lại đụng khoá.
            entity.HasIndex(x => new { x.SurveyTemplateId, x.SectionName })
                .IsUnique()
                .HasFilter("NOT \"IsDeleted\"");
            entity.HasOne<SurveyTemplate>()
                .WithMany()
                .HasForeignKey(x => x.SurveyTemplateId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Thang trả lời gắn ở từng câu hỏi nên một bộ trộn được nhiều loại thang.
        // Bộ câu hỏi của một câu suy ra từ mục, không có khoá ngoại thẳng tới bộ.
        modelBuilder.Entity<SurveyQuestion>(entity =>
        {
            entity.ToTable("SurveyQuestions");
            entity.HasKey(x => x.QuestionId);
            entity.Property(x => x.QuestionText).IsRequired();
            // Ràng buộc "chỉ đặt bẫy trên thang Options và mức phải có thật" cần
            // tra sang bảng khác nên kiểm ở tầng service, không đặt CHECK ở đây.
            entity.HasIndex(x => x.SectionId);
            entity.HasIndex(x => x.AnswerScaleId);
            // RESTRICT chứ không CASCADE: mục bị bỏ đi là xoá mềm, câu trong mục
            // cũng xoá mềm theo, nên không bao giờ có DELETE thật để mà đổ dây.
            entity.HasOne<SurveyQuestionSection>()
                .WithMany()
                .HasForeignKey(x => x.SectionId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<AnswerScale>()
                .WithMany()
                .HasForeignKey(x => x.AnswerScaleId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Đợt khảo sát theo học kỳ và bài khảo sát riêng của từng lớp học phần.
        modelBuilder.Entity<SemesterSurvey>(entity =>
        {
            entity.ToTable("SemesterSurveys", table =>
                table.HasCheckConstraint(
                    "CK_SemesterSurveys_TimeRange",
                    "\"EndTime\" > \"StartTime\""));
            entity.HasKey(x => x.SemesterSurveyId);
            entity.Property(x => x.SurveyName).IsRequired();
            entity.HasIndex(x => x.SemesterId);
            entity.HasIndex(x => x.SurveyTemplateId);
            entity.HasOne<Semester>()
                .WithMany()
                .HasForeignKey(x => x.SemesterId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<SurveyTemplate>()
                .WithMany()
                .HasForeignKey(x => x.SurveyTemplateId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CourseSectionSurvey>(entity =>
        {
            entity.ToTable("CourseSectionSurveys", table =>
                table.HasCheckConstraint(
                    "CK_CourseSectionSurveys_TimeRange",
                    "\"EndTime\" > \"StartTime\""));
            entity.HasKey(x => x.CourseSectionSurveyId);
            entity.Property(x => x.LinkToken).IsRequired();
            // Ảnh chụp điểm của lần bấm tính gần nhất, không tự cập nhật.
            entity.Property(x => x.AverageScore).HasColumnType("numeric(4,2)");
            entity.Property(x => x.TotalResponseCount).HasDefaultValue(0);
            entity.Property(x => x.ValidResponseCount).HasDefaultValue(0);
            entity.Property(x => x.InvalidResponseCount).HasDefaultValue(0);
            entity.HasIndex(x => x.LinkToken).IsUnique();
            entity.HasIndex(x => new { x.SemesterSurveyId, x.CourseSectionId }).IsUnique();
            entity.HasIndex(x => x.CourseSectionId);
            entity.HasOne<SemesterSurvey>()
                .WithMany()
                .HasForeignKey(x => x.SemesterSurveyId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<CourseSection>()
                .WithMany()
                .HasForeignKey(x => x.CourseSectionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Điểm từng câu đã gộp sẵn của mỗi lớp. Ghi lại trọn vẹn mỗi lần bấm tính
        // điểm; giữa hai lần bấm thì không ai đụng vào.
        modelBuilder.Entity<CourseSectionSurveyQuestionScore>(entity =>
        {
            entity.ToTable("CourseSectionSurveyQuestionScores");
            entity.HasKey(x => new { x.CourseSectionSurveyId, x.QuestionId });
            entity.Property(x => x.AverageScore).HasColumnType("numeric(4,2)");
            entity.HasOne<CourseSectionSurvey>()
                .WithMany()
                .HasForeignKey(x => x.CourseSectionSurveyId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<SurveyQuestion>()
                .WithMany()
                .HasForeignKey(x => x.QuestionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SurveyResponse>(entity =>
        {
            entity.ToTable("SurveyResponses");
            entity.HasKey(x => x.ResponseId);
            entity.Property(x => x.Score).HasColumnType("numeric(4,2)");
            entity.Property(x => x.IsValid).HasDefaultValue(true);
            entity.Property(x => x.RejectionReasons).HasMaxLength(200);
            entity.HasIndex(x => x.CourseSectionSurveyId);
            // Tính điểm trung bình lớp luôn lọc theo IsValid nên đánh chỉ mục ghép.
            entity.HasIndex(x => new { x.CourseSectionSurveyId, x.IsValid });
            // Query filter thêm "NOT IsDeleted" vào MỌI truy vấn phiếu, nên cột này
            // phải nằm trong chỉ mục, nếu không cả bảng vài trăm nghìn dòng bị quét.
            entity.HasIndex(x => new { x.CourseSectionSurveyId, x.IsDeleted });
            entity.HasOne<CourseSectionSurvey>()
                .WithMany()
                .HasForeignKey(x => x.CourseSectionSurveyId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // "AnswerValue" lưu dạng chữ cho cả hai loại thang: câu thang Options lưu
        // số mức ("1".."5"), câu thang Text lưu nội dung người học gõ.
        modelBuilder.Entity<SurveyResponseAnswer>(entity =>
        {
            entity.ToTable("SurveyResponseAnswers");
            entity.HasKey(x => new { x.ResponseId, x.QuestionId });
            entity.Property(x => x.AnswerValue).HasMaxLength(2000).IsRequired();
            entity.HasIndex(x => x.QuestionId);
            entity.HasOne(x => x.SurveyResponse)
                .WithMany()
                .HasForeignKey(x => x.ResponseId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<SurveyQuestion>()
                .WithMany()
                .HasForeignKey(x => x.QuestionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Module thống kê tốt nghiệp độc lập: chỉ liên hệ giữa hai bảng mới, không nối FK vào
        // danh mục/khảo sát hiện tại để giữ nguyên snapshot của file nguồn.
        modelBuilder.Entity<GraduationAnalyticsDataset>(entity =>
        {
            entity.ToTable("GraduationAnalyticsDatasets", table =>
            {
                table.HasCheckConstraint(
                    "CK_GraduationAnalyticsDatasets_ReviewMonth",
                    "\"ReviewMonth\" BETWEEN 1 AND 12");
                table.HasCheckConstraint(
                    "CK_GraduationAnalyticsDatasets_ReviewYear",
                    "\"ReviewYear\" BETWEEN 1900 AND 2200");
            });
            entity.HasKey(x => x.DatasetId);
            entity.Property(x => x.DatasetName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.ReviewPeriodText).HasMaxLength(100).IsRequired();
            entity.Property(x => x.OriginalFileName).HasMaxLength(255).IsRequired();
            entity.Property(x => x.ContentHash).HasMaxLength(64).IsFixedLength().IsRequired();
            entity.Property(x => x.ImportedByName).HasMaxLength(320).IsRequired();
            entity.HasIndex(x => x.ContentHash).IsUnique();
            entity.HasIndex(x => x.ImportedAtUtc);
            entity.HasIndex(x => new { x.ReviewYear, x.ReviewMonth })
                .IsUnique()
                .IsDescending();
        });

        modelBuilder.Entity<GraduationAnalyticsRow>(entity =>
        {
            entity.ToTable("GraduationAnalyticsRows");
            entity.HasKey(x => x.RowId);
            entity.Property(x => x.SourceSheetName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.FacultyName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.ProgramCode).HasMaxLength(100);
            entity.Property(x => x.ProgramName).HasMaxLength(300).IsRequired();
            entity.Property(x => x.Cohort).HasMaxLength(50).IsRequired();
            entity.Property(x => x.ReviewPeriodText).HasMaxLength(100).IsRequired();
            entity.Property(x => x.OnTimeGraduateRate).HasColumnType("numeric(9,4)");
            entity.Property(x => x.ExcellentRate).HasColumnType("numeric(9,4)");
            entity.Property(x => x.VeryGoodRate).HasColumnType("numeric(9,4)");
            entity.Property(x => x.GoodRate).HasColumnType("numeric(9,4)");
            entity.Property(x => x.AverageRate).HasColumnType("numeric(9,4)");
            entity.Property(x => x.WorkStudyTransferRate).HasColumnType("numeric(9,4)");
            entity.HasIndex(x => new { x.DatasetId, x.SourceSheetName, x.SourceRowNumber }).IsUnique();
            entity.HasIndex(x => new { x.DatasetId, x.FacultyName });
            entity.HasIndex(x => new { x.DatasetId, x.ProgramCode, x.ProgramName });
            entity.HasIndex(x => new { x.DatasetId, x.Cohort });
            entity.HasIndex(x => new { x.DatasetId, x.ReviewYear, x.ReviewMonth });
            entity.HasOne<GraduationAnalyticsDataset>()
                .WithMany()
                .HasForeignKey(x => x.DatasetId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GraduationPeriod>(entity =>
        {
            entity.ToTable("GraduationPeriods", table =>
            {
                table.HasCheckConstraint("CK_GraduationPeriods_AcademicYearStart", "\"AcademicYearStart\" BETWEEN 1900 AND 2200");
                table.HasCheckConstraint("CK_GraduationPeriods_RoundNumber", "\"RoundNumber\" > 0");
                table.HasCheckConstraint("CK_GraduationPeriods_ReviewMonth", "\"ReviewMonth\" BETWEEN 1 AND 12");
                table.HasCheckConstraint("CK_GraduationPeriods_ReviewYear", "\"ReviewYear\" BETWEEN 1900 AND 2200");
            });
            entity.HasKey(x => x.PeriodId);
            entity.Property(x => x.DeletedByName).HasMaxLength(320);
            entity.Property(x => x.DeleteReason).HasMaxLength(1000);
            entity.HasIndex(x => new { x.AcademicYearStart, x.RoundNumber }).IsUnique();
            entity.HasIndex(x => new { x.AcademicYearStart, x.ReviewYear, x.ReviewMonth });
        });

        modelBuilder.Entity<GraduationImportRevision>(entity =>
        {
            entity.ToTable("GraduationImportRevisions", table =>
            {
                table.HasCheckConstraint("CK_GraduationImportRevisions_RevisionNumber", "\"RevisionNumber\" > 0");
                table.HasCheckConstraint("CK_GraduationImportRevisions_RowCounts", "\"SourceRowCount\" = \"ImportedRowCount\" + \"SkippedRowCount\" AND \"ImportedRowCount\" > 0 AND \"SkippedRowCount\" >= 0");
            });
            entity.HasKey(x => x.RevisionId);
            entity.Property(x => x.OriginalFileName).HasMaxLength(255).IsRequired();
            entity.Property(x => x.SourceSheetName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.FileHash).HasMaxLength(64).IsFixedLength().IsRequired();
            entity.Property(x => x.AggregateHash).HasMaxLength(64).IsFixedLength().IsRequired();
            entity.Property(x => x.SkippedSummaryJson).HasColumnType("jsonb").IsRequired();
            entity.Property(x => x.ImportedByName).HasMaxLength(320).IsRequired();
            entity.Property(x => x.ReplaceReason).HasMaxLength(1000);
            entity.HasIndex(x => new { x.PeriodId, x.RevisionNumber }).IsUnique();
            entity.HasIndex(x => x.FileHash);
            entity.HasOne<GraduationPeriod>()
                .WithMany()
                .HasForeignKey(x => x.PeriodId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<GraduationImportRevision>()
                .WithMany()
                .HasForeignKey(x => x.ReplacedRevisionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GraduationAggregateRow>(entity =>
        {
            entity.ToTable("GraduationAggregateRows", table =>
                table.HasCheckConstraint("CK_GraduationAggregateRows_StudentCount", "\"StudentCount\" > 0"));
            entity.HasKey(x => x.AggregateRowId);
            entity.Property(x => x.FacultyNameRaw).HasMaxLength(200).IsRequired();
            entity.Property(x => x.FacultyKey).HasMaxLength(200).IsRequired();
            entity.Property(x => x.ProgramNameRaw).HasMaxLength(300).IsRequired();
            entity.Property(x => x.ProgramKey).HasMaxLength(300).IsRequired();
            entity.Property(x => x.DerivedProgramCode).HasMaxLength(50);
            entity.Property(x => x.CohortCode).HasMaxLength(20).IsRequired();
            entity.Property(x => x.GraduationRank).HasConversion<string>().HasMaxLength(20).IsRequired();
            entity.HasIndex(x => new
            {
                x.RevisionId,
                x.FacultyKey,
                x.ProgramKey,
                x.CohortCode,
                x.GraduationRank,
                x.IsWorkStudy,
            }).IsUnique();
            entity.HasIndex(x => new { x.RevisionId, x.CohortCode });
            entity.HasOne<GraduationImportRevision>()
                .WithMany()
                .HasForeignKey(x => x.RevisionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GraduationPeriod>()
            .HasOne<GraduationImportRevision>()
            .WithMany()
            .HasForeignKey(x => x.ActiveRevisionId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ChangeAuditLog>(entity =>
        {
            entity.ToTable("ChangeAuditLogs");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TableName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.RecordId).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Action).HasMaxLength(20).IsRequired();
            entity.Property(x => x.ChangedByEmail).HasMaxLength(320);
            entity.HasIndex(x => new { x.TableName, x.RecordId });
            entity.HasIndex(x => new { x.ChangedBy, x.ChangedAt });
            entity.HasIndex(x => x.ChangedAt);
            entity.HasOne<User>().WithMany().HasForeignKey(x => x.ChangedBy).OnDelete(DeleteBehavior.SetNull);
        });
    }
}
