"""Bộ luật B – xử lý file "Danh sách các lớp học phần theo kỳ" và ghép với file điểm."""
import re
from collections import Counter, defaultdict

import openpyxl

from .chuan_hoa import ma_goc, ma_hp, so_nguyen, van_ban

RE_THE_CHAT = re.compile(r'27\d{3}$')
GOP_BM = {'194': '191', '195': '191', '121': '122'}
TEN_COT = {
    'mã hp': 'ma_hp', 'học phần': 'ten_hp', 'nhóm': 'nhom', 'tcht': 'tc', 'sĩ số': 'si_so',
    'bộ môn': 'ten_bm', 'khoa': 'ten_khoa', 'giảng viên': 'giang_vien', 'email': 'email',
    'mã bm': 'ma_bm',
}
# Thứ tự cột chuẩn của sheet Thongke, dùng khi tiêu đề bị đổi tên (vd file giả lập).
THU_TU = ['ma_hp', 'ten_hp', 'nhom', 'tc', 'si_so', 'ten_bm', 'ten_khoa', 'giang_vien', 'email', 'ma_bm']

LUAT = {
    'B-L1': 'Học phần quốc phòng – an ninh (mã 24…)',
    'B-L2': 'Giáo dục thể chất (mã 27…)',
    'B-L3': 'Học phần thực tập, tốt nghiệp',
    'B-L4': 'Bộ môn thực tập/đồ án tốt nghiệp (mã 179…)',
    'B-T': 'Lớp trùng mã học phần × nhóm (giữ lớp có sĩ số lớn hơn)',
}


def _map_cot(header):
    m = {}
    for i, h in enumerate(header):
        key = TEN_COT.get(van_ban(h or '').lower()) if h else None
        if key and key not in m.values():
            m[i] = key
    if len(m) < 6:                               # tiêu đề lạ -> dùng vị trí
        m = {i: k for i, k in enumerate(THU_TU) if i < len(header)}
    else:
        for i, k in enumerate(THU_TU):           # cột thiếu tên (vd Giảng viên) -> theo vị trí
            if k not in m.values() and i < len(header) and i not in m:
                m[i] = k
    return m


def ly_do_loai(ma, ten):
    if ma.startswith('24'):
        return 'B-L1'
    if RE_THE_CHAT.match(ma):
        return 'B-L2'
    low = (ten or '').lower()
    if 'thực tập' in low or 'tốt nghiệp' in low:
        return 'B-L3'
    if ma.startswith('179'):
        return 'B-L4'
    return None


def _bo_mon(ma, ma_bm_file):
    """B-T1: 121 -> 122; ưu tiên Mã BM của file; rỗng/#N/A -> suy từ mã HP."""
    if ma.startswith('121'):
        return '122', None
    v = van_ban(ma_bm_file) if ma_bm_file is not None else ''
    if isinstance(ma_bm_file, float) and ma_bm_file.is_integer():
        v = str(int(ma_bm_file))
    if v and not v.startswith('#') and v.isdigit():
        co = None
        if v != ma[:3] and GOP_BM.get(ma[:3]) != v:
            co = 'BM_LECH_MA_HP'
        return v, co
    bm = GOP_BM.get(ma[:3], ma[:3])
    return bm, 'BM_TU_MA_HP'


def doc_file(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb['Thongke'] if 'Thongke' in wb.sheetnames else wb.worksheets[0]
    it = ws.iter_rows(values_only=True)
    cot = _map_cot(list(next(it)))
    dem = Counter()
    lop = {}
    for row in it:
        if row is None or all(v is None for v in row):
            continue
        r = {k: row[i] for i, k in cot.items() if i < len(row)}
        ma = ma_hp(r.get('ma_hp'))
        if not ma:
            continue
        dem['goc'] += 1
        ten = van_ban(r.get('ten_hp'))
        ld = ly_do_loai(ma, ten)
        if ld:
            dem[ld] += 1
            continue
        nhom = van_ban(r.get('nhom'))
        bm, co_bm = _bo_mon(ma, r.get('ma_bm'))
        goc = ma_goc(ma)
        khoa = '15' if goc == '30101' or bm == '301' else bm[:2]
        rec = {
            'ma_hp': ma, 'ma_goc': goc, 'ten_hp': ten, 'nhom': nhom,
            'tc': so_nguyen(r.get('tc')) or 0, 'si_so': so_nguyen(r.get('si_so')) or 0,
            'giang_vien': van_ban(r.get('giang_vien')) or '', 'email': (van_ban(r.get('email')) or '').lower(),
            'ma_bm': bm, 'ten_bm': van_ban(r.get('ten_bm')) or '', 'ma_khoa': khoa,
            'ten_khoa': van_ban(r.get('ten_khoa')) or '', 'he': 'CLC' if ma[-1] in 'HE' else 'DaiTra',
            'co': [co_bm] if co_bm else [],
        }
        k = (ma, nhom)
        if k in lop:                                  # mục 4 chống trùng
            dem['B-T'] += 1
            if rec['si_so'] <= lop[k]['si_so']:
                continue
        lop[k] = rec
    wb.close()
    dem['giu'] = len(lop)
    return lop, dem


def ghep(lop, diem):
    """Mục 5: ghép (Mã HP, Nhóm) với (f_mamh, f_loptc). Trả về (dòng điểm đã ghép, đối soát)."""
    da_ghep, thieu = [], Counter()
    so_dong = defaultdict(int)
    for d in diem:
        k = (d['mamh'], d['loptc'])
        if d['loptc'] is None:
            thieu[('NHOM_RONG', d['mamh'], '')] += 1
            continue
        if k not in lop:
            thieu[(d['mamh'], d['loptc'], d['tenmh'])] += 1
            continue
        so_dong[k] += 1
        da_ghep.append(d)
    chua_co_diem = [f"{v['ten_hp']} – {v['nhom']}" for k, v in lop.items() if so_dong[k] == 0]
    for k, v in lop.items():
        if so_dong[k] == 0:
            v['co'].append('CHUA_CO_DIEM')
    ds_thieu = [{'ma_hp': a, 'nhom': b, 'ten_hp': c or '', 'so_dong': n}
                for (a, b, c), n in sorted(thieu.items(), key=lambda x: -x[1])]
    return da_ghep, {'thieu_trong_file_lop': ds_thieu, 'chua_co_diem': chua_co_diem}
