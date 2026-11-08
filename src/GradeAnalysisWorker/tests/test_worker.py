"""Kiểm thử worker phân tích điểm.  Chạy:  python -m unittest discover -s tests  (trong src/GradeAnalysisWorker)."""
import base64
import json
import os
import random
import unittest
import warnings

import numpy as np
from cryptography.exceptions import InvalidTag

from grade_worker import config, pipeline
from grade_worker.crypto import GradeCipher, associated_data
from xu_ly import chuan_hoa

warnings.simplefilter('ignore')
KEY = bytes(range(32))


class CryptoTests(unittest.TestCase):
    def setUp(self):
        self.cipher = GradeCipher({1: KEY})
        self.args = ('ZEnc', 12, 345, '17540', 7)

    def test_round_trip(self):
        blob = self.cipher.encrypt('6.3', 1, *self.args, nonce=os.urandom(12))
        self.assertEqual(self.cipher.decrypt(blob, 1, *self.args), 6.3)

    def test_associated_data_matches_backend_format(self):
        # Khớp GradeCellContext.ToAssociatedData() bên C# (AesGcmGradeCipherTests).
        self.assertEqual(associated_data(*self.args), b'StudentCourseGrades|ZEnc|12|345|17540|7')

    def test_moving_cipher_text_to_another_cell_fails(self):
        blob = self.cipher.encrypt('9', 1, *self.args, nonce=os.urandom(12))
        with self.assertRaises(InvalidTag):
            self.cipher.decrypt(blob, 1, 'XEnc', 12, 345, '17540', 7)
        with self.assertRaises(InvalidTag):
            self.cipher.decrypt(blob, 1, 'ZEnc', 12, 345, '17540', 8)

    def test_unknown_key_version(self):
        blob = self.cipher.encrypt('1', 1, *self.args, nonce=os.urandom(12))
        with self.assertRaises(KeyError):
            self.cipher.decrypt(blob, 2, *self.args)


class ConfigTests(unittest.TestCase):
    def test_ado_connection_string_and_keys(self):
        env = {
            'ConnectionStrings__DefaultConnection': 'Host=db;Port=5432;Database=khaosatvmu;Username=postgres;Password=p;w',
            # Windows trả tên biến môi trường viết hoa.
            'COURSEGRADES__ENCRYPTIONKEYS__1': base64.b64encode(KEY).decode(),
        }
        cfg = config.load_config(env)
        self.assertIn("host='db'", cfg.conninfo)
        self.assertIn("dbname='khaosatvmu'", cfg.conninfo)
        self.assertEqual(cfg.keys, {1: KEY})

    def test_worker_database_overrides(self):
        env = {'GRADE_WORKER_DATABASE': 'Host=db;Database=k;Username=grade_worker;Password=x',
               'ConnectionStrings__DefaultConnection': 'Host=db;Database=k;Username=postgres;Password=y',
               'CourseGrades__EncryptionKeys__1': base64.b64encode(KEY).decode()}
        self.assertIn("user='grade_worker'", config.load_config(env).conninfo)

    def test_missing_key_is_a_configuration_error(self):
        with self.assertRaises(SystemExit):
            config.load_config({'ConnectionStrings__DefaultConnection': 'Host=db;Database=k'})

    def test_key_must_be_32_bytes(self):
        with self.assertRaises(ValueError):
            config.load_config({'ConnectionStrings__DefaultConnection': 'Host=db;Database=k',
                                'CourseGrades__EncryptionKeys__1': base64.b64encode(b'short').decode()})


class TermCodeTests(unittest.TestCase):
    def test_term_codes(self):
        self.assertEqual(pipeline.term_code('Học kỳ 1', '2025-2026'), '2526_HK1')
        self.assertEqual(pipeline.term_code('Học kỳ 2', '2024-2025'), '2425_HK2')
        self.assertEqual(pipeline.term_code('Học kỳ phụ', '2026-2027'), '2627_HKP')
        with self.assertRaises(ValueError):
            pipeline.term_code('Học kỳ 1', 'E2E abc')

    def test_summer_term_is_first_in_the_year(self):
        kys = ['2526_HK2', '2627_HKP', '2526_HK1', '2526_HKP', '2425_HK2']
        self.assertEqual(sorted(kys, key=chuan_hoa.thu_tu_ky),
                         ['2425_HK2', '2526_HKP', '2526_HK1', '2526_HK2', '2627_HKP'])

    def test_main_terms_keep_original_ordinals(self):
        # HK1, HK2 giữ đúng số thứ tự của bản gốc (năm × 2 + kỳ − 1).
        self.assertEqual(chuan_hoa.stt_ky('2526_HK1'), 50)
        self.assertEqual(chuan_hoa.stt_ky('2526_HK2'), 51)
        self.assertEqual(chuan_hoa.stt_ky('2526_HKP'), 49.5)

    def test_g1_window_still_means_two_academic_years(self):
        # Cửa sổ 4 kỳ chính tính đến HK2 2025–2026 = trọn hai năm học 2024–2025 và 2025–2026,
        # gồm cả học kỳ phụ đầu mỗi năm; HK2 2023–2024 nằm ngoài.
        cuoi = chuan_hoa.stt_ky('2526_HK2')
        inside = [k for k in ['2324_HK2', '2425_HKP', '2425_HK1', '2425_HK2', '2526_HKP', '2526_HK1', '2526_HK2']
                  if cuoi - chuan_hoa.stt_ky(k) < 4]
        self.assertEqual(inside, ['2425_HKP', '2425_HK1', '2425_HK2', '2526_HKP', '2526_HK1', '2526_HK2'])

    def test_labels(self):
        self.assertEqual(chuan_hoa.nhan_ky('2526_HKP'), 'HK phụ 2025–2026')
        self.assertEqual(chuan_hoa.nhan_ky_ngan('2526_HK1'), 'HK1 25–26')
        with self.assertRaises(ValueError):
            chuan_hoa.kiem_tra_ma_ky('2526_HKP')


def _section(section_id, code, name='Học phần', group='N01', lecturer_id=None, lecturer_name=None, department=175, faculty=2):
    return {'CourseSectionId': section_id, 'CourseCode': code, 'CourseName': name, 'Credits': 3,
            'SectionName': group, 'ClassSize': 40, 'LecturerId': lecturer_id, 'LecturerName': lecturer_name,
            'DepartmentId': department, 'FacultyId': faculty}


def _grade(section_id, student_id, x, y, z):
    return {'CourseSectionId': section_id, 'StudentId': student_id, 'X': x, 'Y': y, 'Z': z}


def _plain(row, column):
    return row[column[0]]


class BuildInputTests(unittest.TestCase):
    def test_rule_b_exclusions(self):
        self.assertEqual(pipeline.analysis_exclusion('24100', 'Quốc phòng'), 'B-L1')
        self.assertEqual(pipeline.analysis_exclusion('27203', 'Bóng chuyền'), 'B-L2')
        self.assertEqual(pipeline.analysis_exclusion('17540', 'Thực tập tốt nghiệp'), 'B-L3')
        self.assertEqual(pipeline.analysis_exclusion('17904H', 'Đồ án'), 'B-L4')
        self.assertIsNone(pipeline.analysis_exclusion('17540', 'An ninh mạng'))
        self.assertIsNone(pipeline.analysis_exclusion('27203100', 'Học phần dài mã'))

    def test_input_matches_chi_so_contract(self):
        sections = [
            _section(11, '17540', group='N02', lecturer_id=7, lecturer_name='Nguyễn Văn An'),
            _section(10, '17540', group='N01', lecturer_id=9, lecturer_name='Trung tâm Ngoại ngữ'),
            _section(12, '27203', name='Bóng chuyền'),
            _section(13, '15216H', group='N01'),
        ]
        grades = [_grade(11, 5, 7.0, 6.0, 6.5), _grade(10, 3, 8.0, 7.0, 7.5), _grade(12, 3, 9.0, 9.0, 9.0)]
        lop, diem, ids = pipeline.build_term_input(sections, grades, _plain)

        self.assertEqual(list(lop), [('15216H', 'N01'), ('17540', 'N01'), ('17540', 'N02')], 'thứ tự chuẩn, bỏ lớp 27xxx')
        self.assertEqual(lop[('17540', 'N02')]['giang_vien'], '7')
        self.assertEqual(lop[('17540', 'N01')]['giang_vien'], '', 'đơn vị không phải giảng viên')
        self.assertEqual(lop[('15216H', 'N01')]['ma_goc'], '15216')
        self.assertEqual(lop[('15216H', 'N01')]['he'], 'CLC')
        self.assertEqual(lop[('15216H', 'N01')]['co'], ['CHUA_CO_DIEM'])
        self.assertEqual(lop[('17540', 'N01')]['ma_bm'], '175')
        self.assertEqual([d['masv'] for d in diem], ['3', '5'], 'dòng của lớp bị loại không vào, sắp theo (mã HP, nhóm, SV)')
        self.assertEqual(diem[0], {'masv': '3', 'mamh': '17540', 'loptc': 'N01', 'X': 8.0, 'Y': 7.0, 'Z': 7.5})
        self.assertEqual(ids[('17540', 'N02')], 11)

    def test_order_of_database_rows_does_not_matter(self):
        sections = [_section(i, f'175{i:02d}', group=f'N0{i % 3}') for i in range(1, 9)]
        grades = [_grade(1 + i % 8, i, 5 + i % 4, 6.0, 5.5) for i in range(40)]
        first = pipeline.build_term_input(sections, grades, _plain)
        random.Random(1).shuffle(sections)
        random.Random(2).shuffle(grades)
        second = pipeline.build_term_input(sections, grades, _plain)
        self.assertEqual(list(first[0].items()), list(second[0].items()))
        self.assertEqual(first[1], second[1])

    def test_clean_converts_numpy_and_nan(self):
        self.assertEqual(pipeline.clean({'a': np.float64(1.5), 'b': float('nan'), 'c': (np.int64(2),)}),
                         {'a': 1.5, 'b': None, 'c': [2]})


class DegenerateDataTests(unittest.TestCase):
    def test_f_test_is_not_run_when_x_equals_y(self):
        # Học phần 22729 (dữ liệu thật) có X trùng hệt Y: phần dư chỉ còn nhiễu ~1e-29 và bản gốc
        # cho p = 0 trên Windows, p = 1 trên Linux. Phải trả None (không kiểm định được).
        from xu_ly import chi_so
        rng = np.random.default_rng(3)
        y = np.round(rng.normal(6.5, 0.5, 63), 1)
        groups = np.array(['A'] * 30 + ['B'] * 33)
        self.assertIsNone(chi_so._f_lop(y.copy(), y, groups, 0.95))
        noisy = y + rng.normal(0, 0.3, 63)
        self.assertIsNotNone(chi_so._f_lop(noisy, y, groups, 0.95), 'dữ liệu thường vẫn được kiểm định')


class EndToEndTests(unittest.TestCase):
    """Chạy bộ tính trên một học phần tự dựng: kết quả ghi ra không còn tên hay email giảng viên."""

    def test_results_carry_lecturer_ids_only(self):
        rng = np.random.default_rng(7)
        sections = [_section(100 + j, '17540', group=f'N0{j + 1}', lecturer_id=40 + j, lecturer_name=f'GV {j}')
                    for j in range(3)]
        grades = []
        for j in range(3):
            for i in range(30):
                y = float(np.clip(round(rng.normal(6.5, 1.2), 1), 0, 10))
                x = float(np.clip(round(5.5 + 0.3 * y + rng.normal(0.4 * j, 0.6), 1), 4, 10))
                grades.append(_grade(100 + j, 1000 + j * 100 + i, x, y, round(0.5 * x + 0.5 * y, 1) if y >= 4 else 0.0))
        lop, diem, ids = pipeline.build_term_input(sections, grades, _plain)
        ts = json.load(open(os.path.join(os.path.dirname(__file__), 'thresholds.json'), encoding='utf-8'))

        theo_ky, lk = pipeline.run_analysis([('2526_HK1', lop, diem)], ts)
        terms, courses, section_rows, lecturers, cross = pipeline.result_rows(
            theo_ky, lk, {'2526_HK1': 3}, {'2526_HK1': ids})

        self.assertEqual(len(courses), 1)
        self.assertEqual(sorted(r['CourseSectionId'] for r in section_rows), [100, 101, 102])
        self.assertEqual(sorted(r['LecturerId'] for r in section_rows), [40, 41, 42])
        dumped = json.dumps([courses, section_rows, lecturers, cross], ensure_ascii=False)
        self.assertNotIn('"gv"', dumped)
        self.assertNotIn('"email"', dumped)
        self.assertNotIn('GV 0', dumped, 'tên giảng viên không được nằm trong kết quả')
        self.assertTrue(all(r['ProfileJson'] for r in section_rows if r['IncludedInStats']))
        self.assertEqual(cross['semester_by_ky'], {'2526_HK1': 3})
        json.dumps(pipeline.clean(terms), allow_nan=False)


if __name__ == '__main__':
    unittest.main()
