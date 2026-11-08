"""Worker phân tích điểm học phần.

    python -m grade_worker            chạy hết các lượt đang chờ rồi thoát (dùng với systemd timer / cron)
    python -m grade_worker --watch    chạy mãi, quét lượt mới mỗi --interval giây

Mã thoát: 0 = xong (hoặc không có việc), 1 = có lượt tính lỗi, 2 = cấu hình sai.
Log chỉ ghi số đếm và thời gian, không ghi dữ liệu điểm hay sinh viên.
"""
import argparse
import os
import sys
import time
import traceback
import warnings

from . import config as config_module
from . import db, pipeline
from .crypto import GradeCipher


def process_run(conn, run, cipher, log):
    started = time.time()
    semesters = db.load_semesters(conn, run['semester_ids'])
    terms, semester_by_ky, section_ids_by_ky = [], {}, {}
    for semester_id in run['semester_ids']:
        semester = semesters.get(semester_id)
        if semester is None:
            raise ValueError(f'Học kỳ {semester_id} của lượt tính không còn trong CSDL.')
        ky = pipeline.term_code(semester['SemesterName'], semester['AcademicYearName'])
        if ky in semester_by_ky:
            raise ValueError(f'Hai học kỳ cùng ra mã {ky}; kiểm tra tên học kỳ trong danh mục.')

        def decrypt(row, column):
            return cipher.decrypt(row[column], row['KeyVersion'], column, row['RevisionId'],
                                  row['StudentId'], row['CourseCode'], row['SourceRowNumber'])

        lop, diem, section_ids = pipeline.build_term_input(
            db.load_sections(conn, semester_id), db.load_grades(conn, semester_id), decrypt)
        terms.append((ky, lop, diem))
        semester_by_ky[ky] = semester_id
        section_ids_by_ky[ky] = section_ids
        log(f'  {ky}: {len(lop)} lớp, {len(diem)} dòng điểm')

    theo_ky, lk = pipeline.run_analysis(terms, run['thresholds'])
    rows = pipeline.result_rows(theo_ky, lk, semester_by_ky, section_ids_by_ky)
    db.save_results(conn, run['run_id'], *rows, os.environ.get('GRADE_WORKER_VERSION', 'dev'))
    log(f'  ghi {len(rows[1])} học phần, {len(rows[2])} lớp, {len(rows[3])} cặp giảng viên – học phần '
        f'({time.time() - started:.0f} giây)')


def run_pending(cfg, log):
    """Chạy hết các lượt đang chờ. Trả về True nếu mọi lượt thành công."""
    cipher = GradeCipher(cfg.keys)
    ok = True
    with db.connect(cfg.conninfo) as conn:
        while True:
            run = db.claim_next_run(conn)
            if run is None:
                return ok
            log(f'Lượt tính {run["run_id"]}: {len(run["semester_ids"])} học kỳ, ngưỡng phiên bản {run["threshold_version"]}')
            try:
                process_run(conn, run, cipher, log)
            except Exception as exc:  # noqa: BLE001 — mọi lỗi đều phải ghi vào lượt tính
                ok = False
                # Chỉ ghi loại lỗi và thông điệp; traceback chỉ ra log của container.
                traceback.print_exc()
                db.mark_failed(conn, run['run_id'], f'{type(exc).__name__}: {exc}')
                log(f'  lỗi: {type(exc).__name__}')


def main(argv=None):
    parser = argparse.ArgumentParser(prog='grade_worker', description=__doc__.splitlines()[0])
    parser.add_argument('--watch', action='store_true', help='chạy mãi, quét lượt mới định kỳ')
    parser.add_argument('--interval', type=int, default=30, help='số giây giữa hai lần quét (với --watch)')
    args = parser.parse_args(argv)

    try:
        cfg = config_module.load_config()
    except (SystemExit, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 2
    os.environ.setdefault('GRADE_WORKER_PROCESSES', str(cfg.processes))
    warnings.simplefilter('ignore')

    def log(message):
        print(message, flush=True)

    if not args.watch:
        return 0 if run_pending(cfg, log) else 1
    while True:
        run_pending(cfg, log)
        time.sleep(args.interval)


if __name__ == '__main__':
    sys.exit(main())
