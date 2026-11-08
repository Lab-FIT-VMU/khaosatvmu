"""Dựng đầu vào cho bộ tính từ CSDL, chạy bộ luật D, E và tách kết quả thành dòng của các bảng.

Giữ nguyên hợp đồng của xu_ly.chi_so.tinh_ky(lop, diem, ts):
  lop  : {(mã HP, nhóm): thông tin lớp}   — như luat_b.doc_file
  diem : [{masv, mamh, loptc, X, Y, Z}]   — như luat_b.ghep (chỉ dòng ghép được lớp)
Khác bản file ở ba chỗ, đều không đổi phép tính:
  - masv là StudentId (khóa nội bộ), không phải mã sinh viên.
  - giang_vien là LecturerId dạng chuỗi; lớp chưa xác định giảng viên hoặc "giảng viên" là
    đơn vị (Trung tâm…) để trống, nên tự rơi khỏi G1 và xu hướng giảng viên.
  - ma_bm / ma_khoa là DepartmentId / FacultyId của danh mục khaosatvmu.
"""
import math
import re
import unicodedata

import numpy as np

from xu_ly import chi_so, lien_ky, nhan_xet
from xu_ly.chuan_hoa import ma_goc

# Bộ luật B-L1–B-L4 (đồng bộ CourseSectionImportRules.AnalysisExclusionReason bên C#).
_PE_CODE = re.compile(r'^27\d{3}$')
# Ô "giảng viên" là tên đơn vị chứ không phải người (file lớp thật có "Trung tâm Ngoại ngữ").
_UNIT_NAME = re.compile(r'^\s*(trung tâm|khoa|bộ môn|phòng|viện|công ty)\b', re.IGNORECASE)


def _normalize(text):
    if text is None:
        return ''
    text = unicodedata.normalize('NFC', str(text)).replace('Ð', 'Đ')
    return re.sub(r'\s+', ' ', text).strip()


def analysis_exclusion(course_code, course_name):
    code = _normalize(course_code).upper()
    if code.startswith('24'):
        return 'B-L1'
    if _PE_CODE.match(code):
        return 'B-L2'
    lower = _normalize(course_name).lower()
    if 'thực tập' in lower or 'tốt nghiệp' in lower:
        return 'B-L3'
    if code.startswith('179'):
        return 'B-L4'
    return None


def is_organizational_unit(name):
    return bool(name) and bool(_UNIT_NAME.match(_normalize(name)))


def term_code(semester_name, academic_year_name):
    """('Học kỳ 1', '2025-2026') → '2526_HK1'; học kỳ phụ → '2526_HKP'."""
    years = re.search(r'(\d{4})\D+(\d{4})', academic_year_name or '')
    name = _normalize(semester_name).lower()
    if not years:
        raise ValueError(f'Không đọc được năm học "{academic_year_name}".')
    if 'phụ' in name:
        position = 'P'
    elif name.endswith('1'):
        position = '1'
    elif name.endswith('2'):
        position = '2'
    else:
        raise ValueError(f'Không đọc được loại học kỳ "{semester_name}".')
    return f'{years.group(1)[2:]}{years.group(2)[2:]}_HK{position}'


def build_term_input(sections, grades, decrypt):
    """sections: dòng lớp của kỳ; grades: dòng của view GradeAnalysisInputs; decrypt(row, cột) → float.

    Trả về (lop, diem, section_id_by_key).
    """
    # Thứ tự chuẩn (mã HP, nhóm) và (mã HP, nhóm, StudentId): kết quả không được phụ thuộc
    # thứ tự dòng trong CSDL. Bộ tính có hai chỗ nhạy với thứ tự: p-value Monte Carlo của H4
    # dùng chung một dãy số ngẫu nhiên lần lượt qua các học phần, và statsmodels.MixedLM dừng
    # ở điểm hơi khác khi thứ tự dòng khác. Sắp cố định thì nạp lại cùng dữ liệu cho cùng số.
    lop, section_by_id, section_id_by_key = {}, {}, {}
    for s in sorted(sections, key=lambda s: (_normalize(s['CourseCode']).upper(), _normalize(s['SectionName']))):
        if analysis_exclusion(s['CourseCode'], s['CourseName']):
            continue
        ma = _normalize(s['CourseCode']).upper()
        nhom = _normalize(s['SectionName'])
        key = (ma, nhom)
        lecturer = ''
        if s['LecturerId'] is not None and not is_organizational_unit(s['LecturerName']):
            lecturer = str(s['LecturerId'])
        lop[key] = {
            'ma_hp': ma, 'ma_goc': ma_goc(ma), 'ten_hp': _normalize(s['CourseName']), 'nhom': nhom,
            'tc': s['Credits'] or 0, 'si_so': s['ClassSize'] or 0,
            'giang_vien': lecturer, 'email': '',
            'ma_bm': '' if s['DepartmentId'] is None else str(s['DepartmentId']), 'ten_bm': '',
            'ma_khoa': '' if s['FacultyId'] is None else str(s['FacultyId']), 'ten_khoa': '',
            'he': 'CLC' if ma[-1:] in ('H', 'E') else 'DaiTra', 'co': [],
        }
        section_by_id[s['CourseSectionId']] = key
        section_id_by_key[key] = s['CourseSectionId']

    diem = []
    with_grades = set()
    for g in grades:
        key = section_by_id.get(g['CourseSectionId'])
        if key is None:
            continue
        with_grades.add(key)
        diem.append({
            'masv': str(g['StudentId']), 'mamh': key[0], 'loptc': key[1],
            'X': decrypt(g, 'XEnc'), 'Y': decrypt(g, 'YEnc'), 'Z': decrypt(g, 'ZEnc'),
        })
    for key, info in lop.items():
        if key not in with_grades:
            info['co'].append('CHUA_CO_DIEM')
    diem.sort(key=lambda d: (d['mamh'], d['loptc'], int(d['masv'])))
    return lop, diem, section_id_by_key


def run_analysis(terms, ts):
    """terms: [(ky, lop, diem)] theo thứ tự thời gian. Trả về (theo_ky, lk) như kho.xuat()."""
    theo_ky = {ky: chi_so.tinh_ky(lop, diem, ts) for ky, lop, diem in terms}
    lk = lien_ky.tinh(theo_ky, ts)
    mau = nhan_xet.doc_mau()
    nhan_xet.tao(theo_ky, ts, mau)
    nhan_xet.xu_huong_gv(lk, ts, mau)
    lk['ten_od'] = mau['ten_on_dinh']
    lk['chua_du_du_lieu'] = mau['chua_du_du_lieu']
    return theo_ky, lk


def clean(value):
    """Đưa về kiểu JSON thuần: numpy → Python, NaN/vô cực → None, tuple → list."""
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [clean(v) for v in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def _int_or_none(text):
    return int(text) if text not in (None, '') else None


def _lecturer_fields(entry):
    """Thay trường gv/email (đang chứa LecturerId) bằng lecturer_id."""
    entry = dict(entry)
    lecturer = entry.pop('gv', None)
    entry.pop('email', None)
    entry['lecturer_id'] = _int_or_none(lecturer)
    return entry


def result_rows(theo_ky, lk, semester_by_ky, section_ids_by_ky):
    """Tách kết quả thành dòng của GradeAnalysisTermResults / CourseResults / SectionResults /
    LecturerCourseResults và phần liên kỳ không gắn người (CrossTermJson)."""
    term_rows, course_rows, section_rows = [], [], []
    for ky, kq in theo_ky.items():
        semester_id = semester_by_ky[ky]
        term_rows.append({'SemesterId': semester_id, 'DataJson': clean({'ky': ky, 'tong': kq['tong']})})
        for hp in kq['hp']:
            data = dict(hp)
            if 'gp' in data:
                data['gp'] = {
                    code: {**group, 'ds': [_lecturer_fields(x) for x in group.get('ds', [])]}
                    for code, group in data['gp'].items()
                }
            course_rows.append({
                'SemesterId': semester_id, 'BaseCourseCode': hp['ma'],
                'DepartmentId': _int_or_none(hp.get('bm')), 'FacultyId': _int_or_none(hp.get('khoa')),
                'Flags': list(hp.get('co') or []), 'StableStates': list(hp.get('od') or []),
                'DataJson': clean(data),
            })
        for lop in kq['lop']:
            data = _lecturer_fields(lop)
            profile = data.pop('hs', None)
            section_rows.append({
                'SemesterId': semester_id,
                'CourseSectionId': section_ids_by_ky[ky][(lop['ma'], lop['nhom'])],
                'BaseCourseCode': lop['goc'], 'LecturerId': data['lecturer_id'],
                'DepartmentId': _int_or_none(lop.get('bm')), 'FacultyId': _int_or_none(lop.get('khoa')),
                'IncludedInStats': bool(lop.get('tk')), 'Markers': list(lop.get('dh') or []),
                'DataJson': clean(data), 'ProfileJson': clean(profile) if profile else None,
            })

    lecturer_rows = []
    for rec in lk.get('gv_hp', []):
        lecturer_id = _int_or_none(rec.get('gv'))
        if lecturer_id is None:
            continue
        data = {k: v for k, v in rec.items() if k not in ('gv', 'email')}
        lecturer_rows.append({
            'LecturerId': lecturer_id, 'BaseCourseCode': rec['goc'],
            'DepartmentId': _int_or_none(rec.get('bm')), 'FacultyId': _int_or_none(rec.get('khoa')),
            'DataJson': clean(data),
        })

    cross_term = clean({
        'ky': lk.get('ky', []),
        'semester_by_ky': semester_by_ky,
        'xu_huong': lk.get('xu_huong', {}),
        'co_hp': lk.get('co_hp', {}),
        'de_thi': lk.get('de_thi', {}),
        'de_thi_lech': lk.get('de_thi_lech', {}),
        'g1_ngau_nhien': lk.get('g1_ngau_nhien', {}),
        'ten_od': lk.get('ten_od'),
        'chua_du_du_lieu': lk.get('chua_du_du_lieu'),
    })
    return term_rows, course_rows, section_rows, lecturer_rows, cross_term
