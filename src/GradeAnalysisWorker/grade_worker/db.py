"""Đọc / ghi CSDL khaosatvmu cho worker phân tích điểm.

Worker chỉ đọc điểm qua view GradeAnalysisInputs (không có cột nào của bảng Students) và ghi
vào GradeAnalysisRuns cùng bốn bảng kết quả. Thông điệp lỗi ghi vào CSDL không chứa dữ liệu.
"""
import json

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

QUEUED, RUNNING, SUCCEEDED, FAILED = 1, 2, 3, 4
# Lượt "đang chạy" quá lâu là do worker chết giữa chừng: đánh lỗi để lượt sau chạy được.
STALE_RUNNING_INTERVAL = '3 hours'
# Giữ lại bao nhiêu lượt đã xong (kể cả lượt hiện hành); lượt cũ hơn bị xóa cùng kết quả.
KEEP_FINISHED_RUNS = 10


def connect(conninfo):
    # autocommit: lệnh đọc lẻ không giữ transaction ngầm, và mỗi khối conn.transaction()
    # là một transaction thật (không bị biến thành savepoint của transaction đang mở).
    return psycopg.connect(conninfo, row_factory=dict_row, autocommit=True)


def claim_next_run(conn):
    """Nhận lượt đang chờ cũ nhất (chuyển sang 'đang chạy'). Không có thì trả None."""
    with conn.transaction():
        conn.execute(
            f"""UPDATE "GradeAnalysisRuns"
                SET "Status" = {FAILED}, "FinishedAtUtc" = now(),
                    "ErrorMessage" = 'Worker dừng giữa chừng; lượt này được đánh lỗi để lượt sau chạy được.'
                WHERE "Status" = {RUNNING} AND "StartedAtUtc" < now() - interval '{STALE_RUNNING_INTERVAL}'""")
        running = conn.execute(f'SELECT 1 FROM "GradeAnalysisRuns" WHERE "Status" = {RUNNING}').fetchone()
        if running:
            return None
        row = conn.execute(
            f"""SELECT "RunId", "SemesterIds", "ThresholdSnapshotJson", "ThresholdVersion"
                FROM "GradeAnalysisRuns" WHERE "Status" = {QUEUED}
                ORDER BY "RequestedAtUtc", "RunId" LIMIT 1 FOR UPDATE SKIP LOCKED""").fetchone()
        if row is None:
            return None
        conn.execute(
            f'UPDATE "GradeAnalysisRuns" SET "Status" = {RUNNING}, "StartedAtUtc" = now() WHERE "RunId" = %s',
            (row['RunId'],))
    snapshot = row['ThresholdSnapshotJson']
    return {
        'run_id': row['RunId'],
        'semester_ids': list(row['SemesterIds'] or []),
        'thresholds': snapshot if isinstance(snapshot, dict) else json.loads(snapshot),
        'threshold_version': row['ThresholdVersion'],
    }


def load_semesters(conn, semester_ids):
    rows = conn.execute(
        """SELECT s."SemesterId", s."SemesterName", y."AcademicYearName"
           FROM "Semesters" s JOIN "AcademicYears" y ON y."AcademicYearId" = s."AcademicYearId"
           WHERE s."SemesterId" = ANY(%s)""", (semester_ids,)).fetchall()
    return {r['SemesterId']: r for r in rows}


def load_sections(conn, semester_id):
    return conn.execute(
        """SELECT cs."CourseSectionId", c."CourseCode", c."CourseName", c."Credits",
                  cs."SectionName", cs."ClassSize", cs."LecturerId", l."FullName" AS "LecturerName",
                  c."DepartmentId", COALESCE(d."FacultyId", c."FacultyId") AS "FacultyId"
           FROM "CourseSections" cs
           JOIN "Courses" c ON c."CourseId" = cs."CourseId"
           LEFT JOIN "Lecturers" l ON l."LecturerId" = cs."LecturerId"
           LEFT JOIN "Departments" d ON d."DepartmentId" = c."DepartmentId"
           WHERE cs."SemesterId" = %s AND NOT cs."IsDeleted"
           ORDER BY cs."CourseSectionId\"""", (semester_id,)).fetchall()


def load_grades(conn, semester_id):
    return conn.execute(
        """SELECT "RevisionId", "StudentId", "CourseSectionId", "CourseCode", "SourceRowNumber",
                  "XEnc", "YEnc", "ZEnc", "KeyVersion"
           FROM "GradeAnalysisInputs" WHERE "SemesterId" = %s""", (semester_id,)).fetchall()


def save_results(conn, run_id, term_rows, course_rows, section_rows, lecturer_rows, cross_term, worker_version):
    """Ghi toàn bộ kết quả rồi chuyển lượt hiện hành, trong một transaction."""
    with conn.transaction():
        with conn.cursor() as cur:
            cur.executemany(
                'INSERT INTO "GradeAnalysisTermResults" ("RunId", "SemesterId", "DataJson") VALUES (%s, %s, %s)',
                [(run_id, r['SemesterId'], Jsonb(r['DataJson'])) for r in term_rows])
            cur.executemany(
                """INSERT INTO "GradeAnalysisCourseResults"
                   ("RunId", "SemesterId", "BaseCourseCode", "DepartmentId", "FacultyId", "Flags", "StableStates", "DataJson")
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                [(run_id, r['SemesterId'], r['BaseCourseCode'], r['DepartmentId'], r['FacultyId'],
                  r['Flags'], r['StableStates'], Jsonb(r['DataJson'])) for r in course_rows])
            cur.executemany(
                """INSERT INTO "GradeAnalysisSectionResults"
                   ("RunId", "SemesterId", "CourseSectionId", "BaseCourseCode", "LecturerId", "DepartmentId",
                    "FacultyId", "IncludedInStats", "Markers", "DataJson", "ProfileJson")
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [(run_id, r['SemesterId'], r['CourseSectionId'], r['BaseCourseCode'], r['LecturerId'],
                  r['DepartmentId'], r['FacultyId'], r['IncludedInStats'], r['Markers'], Jsonb(r['DataJson']),
                  Jsonb(r['ProfileJson']) if r['ProfileJson'] is not None else None) for r in section_rows])
            cur.executemany(
                """INSERT INTO "GradeAnalysisLecturerCourseResults"
                   ("RunId", "LecturerId", "BaseCourseCode", "DepartmentId", "FacultyId", "DataJson")
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                [(run_id, r['LecturerId'], r['BaseCourseCode'], r['DepartmentId'], r['FacultyId'],
                  Jsonb(r['DataJson'])) for r in lecturer_rows])
        # Tắt lượt hiện hành cũ trước: chỉ mục duy nhất kiểm tra ngay từng lệnh.
        conn.execute('UPDATE "GradeAnalysisRuns" SET "IsCurrent" = false WHERE "IsCurrent"')
        conn.execute(
            f"""UPDATE "GradeAnalysisRuns"
                SET "Status" = {SUCCEEDED}, "FinishedAtUtc" = now(), "IsCurrent" = true,
                    "CrossTermJson" = %s, "WorkerVersion" = %s, "ErrorMessage" = NULL
                WHERE "RunId" = %s""", (Jsonb(cross_term), worker_version, run_id))
        conn.execute(
            f"""DELETE FROM "GradeAnalysisRuns"
                WHERE "Status" IN ({SUCCEEDED}, {FAILED}) AND NOT "IsCurrent"
                  AND "RunId" NOT IN (SELECT "RunId" FROM "GradeAnalysisRuns"
                                      WHERE "Status" IN ({SUCCEEDED}, {FAILED})
                                      ORDER BY "RunId" DESC LIMIT {KEEP_FINISHED_RUNS})""")


def mark_failed(conn, run_id, message):
    with conn.transaction():
        conn.execute(
            f"""UPDATE "GradeAnalysisRuns" SET "Status" = {FAILED}, "FinishedAtUtc" = now(), "ErrorMessage" = %s
                WHERE "RunId" = %s""", (message[:4000], run_id))
