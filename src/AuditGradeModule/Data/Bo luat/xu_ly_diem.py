"""Cài đặt tham chiếu của BO_LUAT_XU_LY_DIEM_HOC_TAP.md.

xu_ly_file(path) -> (rows, thong_ke). rows là list dict theo "Đầu ra chuẩn".
Dùng openpyxl; không phụ thuộc pandas.
"""
import re
import unicodedata
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP

import openpyxl

COT = ['f_nhhk', 'f_masv', 'f_tensv', 'f_tenlop', 'f_mamh', 'f_tenmh', 'f_diem1',
       'f_diem2', 'f_diem3', 'f_diemthi', 'f_tbcht', 'f_namhoc', 'f_hocky',
       'f_dot', 'f_ghichu', 'f_loptc']
NGUONG_TP = 4.0
RE_THE_CHAT = re.compile(r'27\d{3}$')


def so(x):
    """N2: ô rỗng -> None, chuỗi dấu phẩy -> float."""
    if x is None or (isinstance(x, str) and not x.strip()):
        return None
    return float(x.replace(',', '.')) if isinstance(x, str) else float(x)


def van_ban(s):
    """N4: NFC, Ð -> Đ, cắt khoảng trắng."""
    if s is None:
        return None
    return unicodedata.normalize('NFC', str(s)).replace('Ð', 'Đ').strip()


def lam_tron(v):
    """Half-up, 1 chữ số thập phân."""
    return float(Decimal(str(round(v, 6))).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))


def la_clc(ma, d2, d3):
    return ma[-1].upper() in ('H', 'E') or d2 is not None or d3 is not None


def tinh_x(d1, d2, d3):
    """Trung bình cộng các điểm thành phần đang có; None nếu không có điểm nào."""
    v = [d for d in (d1, d2, d3) if d is not None]
    return sum(v) / len(v) if v else None


def ly_do_loai(ma, ten, ghichu, y, d1, d2, d3):
    """Trả về mã luật loại dòng (L1..L7) hoặc None nếu giữ."""
    if y == -1:
        return 'L1 diem thi -1 (the chat)'
    if ghichu == 'M':
        return 'L2 ghi chu M (mien)'
    if ghichu == 'B':
        return 'L3 ghi chu B (bao luu)'
    if ma.startswith('24'):
        return 'L4 quan su - quoc phong'
    if RE_THE_CHAT.match(ma):
        return 'L5 the chat 27xxx'
    low = ten.lower()
    if 'thực tập' in low or 'tốt nghiệp' in low:
        return 'L6 thuc tap / tot nghiep'
    if d1 is None and d2 is None and d3 is None:
        return 'L7 khong co X'
    return None


def xu_ly_dong(r):
    """r: dict cột gốc (tên thường). Trả về (dict kết quả | None, lý do loại | None)."""
    ma = van_ban(r['f_mamh'])
    ten = van_ban(r['f_tenmh'])
    gc = van_ban(r['f_ghichu']) or None
    d1, d2, d3 = so(r['f_diem1']), so(r['f_diem2']), so(r['f_diem3'])
    y = so(r['f_diemthi'])
    ld = ly_do_loai(ma, ten, gc, y, d1, d2, d3)
    if ld:
        return None, ld
    x = tinh_x(d1, d2, d3)
    if any(d is not None and d < NGUONG_TP for d in (d1, d2, d3)):
        x = 0.0                       # luật 2 (K bị bỏ qua)
    if x == 0 or gc == 'V':
        y = 0.0                       # luật 3
    z = 0.0 if y < 4 else lam_tron(0.5 * x + 0.5 * y)   # luật 4
    return {
        'ky': str(r['f_nhhk']).strip(), 'masv': r['f_masv'], 'tensv': van_ban(r['f_tensv']),
        'lop': van_ban(r['f_tenlop']), 'mamh': ma, 'tenmh': ten,
        'he': 'CLC' if la_clc(ma, d2, d3) else 'DaiTra',
        'X': lam_tron(x), 'Y': y, 'Z': z, 'ghichu': gc,
        'loptc': van_ban(r['f_loptc']) or None,
        'diem1': d1, 'diem2': d2, 'diem3': d3, 'f_tbcht_goc': so(r['f_tbcht']),
    }, None


def xu_ly_file(path):
    ws = openpyxl.load_workbook(path, read_only=True).active
    it = ws.iter_rows(values_only=True)
    header = [str(h).strip().lower() for h in next(it)]   # N1
    thieu = set(COT) - set(header)
    if thieu:
        raise ValueError(f'Thieu cot: {sorted(thieu)}')
    tk = Counter()
    best = {}
    for row in it:
        tk['dong goc'] += 1
        r = dict(zip(header, row))
        kq, ld = xu_ly_dong(r)
        if ld:
            tk['loai ' + ld] += 1
            continue
        k = (kq['masv'], kq['mamh'])                       # luật 4: chống trùng
        if k in best:
            tk['trung bi bo'] += 1
            if kq['Y'] > best[k]['Y']:
                best[k] = kq
        else:
            best[k] = kq
    rows = list(best.values())
    tk['dong giu'] = len(rows)
    return rows, tk
