"""Bộ luật A – xử lý file "Điểm học tập của SV theo kỳ".

Dựa trên cài đặt tham chiếu Bo luat/xu_ly_diem.py, bổ sung luật L8 (mã 179).
doc_file(path) -> (rows, dem_loai, canh_bao, nhhk).
"""
import re
from collections import Counter

import openpyxl

from .chuan_hoa import lam_tron, ma_hp, so, van_ban

COT = ['f_nhhk', 'f_masv', 'f_tensv', 'f_tenlop', 'f_mamh', 'f_tenmh', 'f_diem1',
       'f_diem2', 'f_diem3', 'f_diemthi', 'f_tbcht', 'f_namhoc', 'f_hocky',
       'f_dot', 'f_ghichu', 'f_loptc']
COT_BAT_BUOC = ['f_nhhk', 'f_masv', 'f_mamh', 'f_tenmh', 'f_diem1', 'f_diem2', 'f_diem3',
                'f_diemthi', 'f_loptc']
NGUONG_TP = 4.0
RE_THE_CHAT = re.compile(r'27\d{3}$')

LUAT = {
    'L1': 'Môn giáo dục thể chất (điểm thi ghi −1)',
    'L2': 'Sinh viên được miễn học phần (ghi chú M)',
    'L3': 'Sinh viên bảo lưu điểm (ghi chú B)',
    'L4': 'Học phần quốc phòng – an ninh (mã 24…)',
    'L5': 'Giáo dục thể chất còn sót (mã 27…)',
    'L6': 'Học phần thực tập, tốt nghiệp',
    'L7': 'Không có điểm quá trình',
    'L8': 'Học phần thuộc bộ môn thực tập/đồ án tốt nghiệp (mã 179…)',
    'T': 'Dòng trùng sinh viên × học phần (giữ dòng có điểm thi cao nhất)',
}


def ly_do_loai(ma, ten, ghichu, y, d1, d2, d3):
    if y == -1:
        return 'L1'
    if ghichu == 'M':
        return 'L2'
    if ghichu == 'B':
        return 'L3'
    if ma.startswith('24'):
        return 'L4'
    if RE_THE_CHAT.match(ma):
        return 'L5'
    low = (ten or '').lower()
    if 'thực tập' in low or 'tốt nghiệp' in low:
        return 'L6'
    if d1 is None and d2 is None and d3 is None:
        return 'L7'
    if ma.startswith('179'):
        return 'L8'
    return None


def xu_ly_dong(r):
    ma = ma_hp(r.get('f_mamh'))
    if not ma:
        return None, None
    ten = van_ban(r.get('f_tenmh'))
    gc = (van_ban(r.get('f_ghichu')) or '').upper() or None
    d1, d2, d3 = so(r.get('f_diem1')), so(r.get('f_diem2')), so(r.get('f_diem3'))
    y = so(r.get('f_diemthi'))
    ld = ly_do_loai(ma, ten, gc, y, d1, d2, d3)
    if ld:
        return None, ld
    v = [d for d in (d1, d2, d3) if d is not None]
    x = sum(v) / len(v)
    if any(d < NGUONG_TP for d in v):
        x = 0.0                                   # luật 2 (ghi chú K bỏ qua)
    if y is None:
        y = 0.0
    if x == 0 or gc == 'V':
        y = 0.0                                   # luật 3
    z = 0.0 if y < 4 else lam_tron(0.5 * x + 0.5 * y)   # luật 4
    masv = r.get('f_masv')
    if isinstance(masv, float) and masv.is_integer():
        masv = int(masv)
    return {
        'masv': str(masv).strip(), 'mamh': ma, 'tenmh': ten,
        'X': lam_tron(x), 'Y': y, 'Z': z, 'ghichu': gc,
        'loptc': van_ban(r.get('f_loptc')) or None,
    }, None


def doc_file(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    it = ws.iter_rows(values_only=True)
    header = [str(h).strip().lower() if h is not None else '' for h in next(it)]
    thieu = [c for c in COT_BAT_BUOC if c not in header]
    if thieu:
        raise ValueError('File điểm thiếu cột: ' + ', '.join(thieu))
    dem = Counter()
    nhhk = Counter()
    best = {}
    for row in it:
        if row is None or all(v is None for v in row):
            continue
        dem['goc'] += 1
        r = dict(zip(header, row))
        if r.get('f_nhhk') is not None:
            nhhk[str(r['f_nhhk']).strip().split('.')[0]] += 1
        kq, ld = xu_ly_dong(r)
        if ld:
            dem[ld] += 1
            continue
        if kq is None:
            continue
        k = (kq['masv'], kq['mamh'])              # luật chống trùng mục 4
        if k in best:
            dem['T'] += 1
            if kq['Y'] > best[k]['Y']:
                best[k] = kq
        else:
            best[k] = kq
    wb.close()
    rows = list(best.values())
    dem['giu'] = len(rows)
    return rows, dem, (nhhk.most_common(1)[0][0] if nhhk else None)
