-- User CSDL riêng cho worker phân tích điểm học phần (quyền tối thiểu).
--
-- Chạy MỘT LẦN bằng user quản trị CSDL, sau khi API đã áp migration AddCourseGradeAnalysis:
--   docker exec -i khaosatvmu_db psql -U postgres -d khaosatvmu \
--     -v worker_password="'<mật khẩu mạnh>'" < deploy/postgres/grade-analysis-worker-role.sql
-- rồi đặt trong .env:
--   GRADE_WORKER_DATABASE=Host=db;Port=5432;Database=khaosatvmu;Username=grade_worker;Password=<mật khẩu mạnh>
--
-- Worker đọc điểm CHỈ qua view GradeAnalysisInputs (view chạy bằng quyền của chủ view nên
-- grade_worker không cần và không có quyền trên StudentCourseGrades), không có quyền gì với
-- bảng Students, và chỉ đọc hai cột LecturerId, FullName của Lecturers (không thấy email).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grade_worker') THEN
        CREATE ROLE grade_worker LOGIN;
    END IF;
END
$$;
ALTER ROLE grade_worker WITH LOGIN PASSWORD :worker_password;

GRANT CONNECT ON DATABASE :"DBNAME" TO grade_worker;
GRANT USAGE ON SCHEMA public TO grade_worker;

-- Đầu vào
GRANT SELECT ON "GradeAnalysisInputs" TO grade_worker;
GRANT SELECT ON "Semesters", "AcademicYears", "CourseSections", "Courses", "Departments" TO grade_worker;
GRANT SELECT ("LecturerId", "FullName") ON "Lecturers" TO grade_worker;

-- Lượt tính và kết quả
GRANT SELECT, UPDATE, DELETE ON "GradeAnalysisRuns" TO grade_worker;
GRANT SELECT, INSERT, DELETE ON
    "GradeAnalysisTermResults",
    "GradeAnalysisCourseResults",
    "GradeAnalysisSectionResults",
    "GradeAnalysisLecturerCourseResults"
TO grade_worker;

-- Cột khóa tự tăng của các bảng kết quả.
DO $$
DECLARE
    seq text;
BEGIN
    FOREACH seq IN ARRAY ARRAY[
        pg_get_serial_sequence('"GradeAnalysisCourseResults"', 'CourseResultId'),
        pg_get_serial_sequence('"GradeAnalysisSectionResults"', 'SectionResultId'),
        pg_get_serial_sequence('"GradeAnalysisLecturerCourseResults"', 'LecturerCourseResultId')]
    LOOP
        EXECUTE format('GRANT USAGE ON SEQUENCE %s TO grade_worker', seq);
    END LOOP;
END
$$;
