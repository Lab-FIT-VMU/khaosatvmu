"""Kho dữ liệu dạng file: nạp kỳ, gỡ kỳ, tính lại, xuất JSON cho web.

Cấu trúc:
  kho/ky/<ky>/lop.json, diem.csv.gz, meta.json, ket_qua.json   (dữ liệu sạch + kết quả trong kỳ)
  kho/tham_so.json                                              (bộ tham số đang dùng)
  web/data/...                                                  (JSON web đọc; được đưa lên GitHub)

Dòng lệnh:
  python -m xu_ly.kho nap 2425_HK1 <file_lop.xlsx> <file_diem.xlsx>
  python -m xu_ly.kho go 2425_HK1
  python -m xu_ly.kho tinh-lai
"""
import csv
from collections import defaultdict
import gzip
import io
import json
import re
import secrets
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

from . import chi_so, lien_ky, luat_a, luat_b, nhan_xet, tham_so
from .chuan_hoa import kiem_tra_ma_ky, nhan_ky, nhan_ky_ngan, thu_tu_ky

GOC = Path(__file__).resolve().parent.parent
VAN_BAN = GOC / 'Data' / 'Bo luat' / 'van_ban_giao_dien.json'
KHO = GOC / 'kho'
WEB_DATA = GOC / 'web' / 'data'
TAM = KHO / '_tam'


def _ghi_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(path)


def _doc_json(path, mac_dinh=None):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else mac_dinh


# ------------------------------------------------------------------ tham số
def doc_tham_so():
    """{'phien_ban': n, 'ts': cấu trúc như tham_so_chi_so.json}."""
    tt = _doc_json(KHO / 'tham_so.json')
    md = tham_so.doc_mac_dinh()
    if tt is None:
        return {'phien_ban': 1, 'ts': md}
    for nhom, ds in md.items():                      # bổ sung nhóm/tham số mới có trong bản mặc định
        if nhom.startswith('_') or not isinstance(ds, dict):
            continue
        cur = tt['ts'].setdefault(nhom, {})
        for ten, v in ds.items():
            cur.setdefault(ten, v)
    return tt


def luu_tham_so(gia_tri_moi):
    """gia_tri_moi: {tên: giá trị}. Kiểm tra, lưu phiên bản mới, tính lại toàn bộ."""
    tt = doc_tham_so()
    ts = tt['ts']
    for nhom, ds in ts.items():
        if nhom.startswith('_') or nhom == 'mau_sac':
            continue
        for ten in ds:
            if ten in gia_tri_moi:
                cu = ds[ten]['gia_tri']
                v = gia_tri_moi[ten]
                ds[ten]['gia_tri'] = int(v) if isinstance(cu, int) and not isinstance(cu, bool) else (
                    float(v) if isinstance(cu, float) else v)
    loi = tham_so.kiem_tra(tham_so.phang(ts))
    if loi:
        raise ValueError(' '.join(loi))
    tt['phien_ban'] += 1
    _ghi_json(KHO / 'tham_so.json', tt)
    tinh_lai_tat_ca()
    return tt


def khoi_phuc_tham_so():
    tt = doc_tham_so()
    tt = {'phien_ban': tt['phien_ban'] + 1, 'ts': tham_so.doc_mac_dinh()}
    _ghi_json(KHO / 'tham_so.json', tt)
    tinh_lai_tat_ca()
    return tt


# ------------------------------------------------------------------ nạp kỳ
def danh_sach_ky():
    if not (KHO / 'ky').exists():
        return []
    kys = [p.name for p in (KHO / 'ky').iterdir() if (p / 'ket_qua.json').exists()]
    return sorted(kys, key=thu_tu_ky)


def chuan_bi_nap(ky, file_lop, file_diem, ten_lop=None, ten_diem=None):
    """Bước 1–2: đọc, áp bộ luật A, B, ghép; trả về đối soát và mã phiên để xác nhận."""
    nhhk = kiem_tra_ma_ky(ky)
    t0 = time.time()
    lop, dem_b = luat_b.doc_file(file_lop)
    diem, dem_a, nhhk_file = luat_a.doc_file(file_diem)
    da_ghep, ds = luat_b.ghep(lop, diem)
    canh_bao = []
    if nhhk_file and nhhk_file != nhhk:
        canh_bao.append(f'Mã học kỳ trong file điểm là {nhhk_file}, khác với mã {nhhk} của học kỳ {ky} bạn nhập.')
    if not lop:
        canh_bao.append('File danh sách lớp không có lớp nào sau khi lọc.')
    so_dong_thieu = sum(t['so_dong'] for t in ds['thieu_trong_file_lop'])
    doi_soat = {
        'ky': ky, 'nhan': nhan_ky(ky), 'ky_da_co': ky in danh_sach_ky(), 'canh_bao': canh_bao,
        'file_lop': ten_lop or Path(file_lop).name, 'file_diem': ten_diem or Path(file_diem).name,
        'lop': {'goc': dem_b['goc'], 'giu': dem_b['giu'],
                'loai': [{'luat': k, 'mo_ta': v, 'so': dem_b[k]} for k, v in luat_b.LUAT.items() if dem_b[k]]},
        'diem': {'goc': dem_a['goc'], 'giu': dem_a['giu'],
                 'loai': [{'luat': k, 'mo_ta': v, 'so': dem_a[k]} for k, v in luat_a.LUAT.items() if dem_a[k]]},
        'ghep': {'so_dong': len(da_ghep), 'so_lop_thieu': len(ds['thieu_trong_file_lop']),
                 'so_dong_thieu': so_dong_thieu, 'ds_thieu': ds['thieu_trong_file_lop'][:200],
                 'so_lop_chua_co_diem': len(ds['chua_co_diem']), 'ds_chua_co_diem': ds['chua_co_diem'][:200]},
        'thoi_gian_doc': round(time.time() - t0, 1),
    }
    TAM.mkdir(parents=True, exist_ok=True)
    token = secrets.token_hex(8)
    _ghi_json(TAM / f'{token}.json', {
        'ky': ky, 'lop': list(lop.values()), 'diem': da_ghep, 'doi_soat': doi_soat,
    })
    doi_soat['token'] = token
    return doi_soat


def xac_nhan_nap(token):
    if not isinstance(token, str) or re.fullmatch(r'[0-9a-f]{16}', token) is None:
        raise ValueError('Mã xác nhận nạp không hợp lệ.')
    p = TAM / f'{token}.json'
    if not p.exists():
        raise ValueError('Phiên nạp đã hết hạn, hãy chọn lại file.')
    d = _doc_json(p)
    p.unlink()
    ky = d['ky']
    thu_muc = KHO / 'ky' / ky
    if thu_muc.exists():
        shutil.rmtree(thu_muc)
    thu_muc.mkdir(parents=True)
    _ghi_json(thu_muc / 'lop.json', d['lop'])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['masv', 'mamh', 'loptc', 'X', 'Y', 'Z'])
    for r in d['diem']:
        w.writerow([r['masv'], r['mamh'], r['loptc'], r['X'], r['Y'], r['Z']])
    with gzip.open(thu_muc / 'diem.csv.gz', 'wt', encoding='utf-8') as f:
        f.write(buf.getvalue())
    meta = {'ky': ky, 'ngay_nap': datetime.now().strftime('%d/%m/%Y %H:%M'), 'doi_soat': d['doi_soat']}
    _ghi_json(thu_muc / 'meta.json', meta)
    tinh_ky(ky)
    xuat()
    return {'ky': ky, 'ok': True}


def _doc_du_lieu_ky(ky):
    thu_muc = KHO / 'ky' / ky
    lop = {(v['ma_hp'], v['nhom']): v for v in _doc_json(thu_muc / 'lop.json')}
    diem = []
    with gzip.open(thu_muc / 'diem.csv.gz', 'rt', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            diem.append({'masv': r['masv'], 'mamh': r['mamh'], 'loptc': r['loptc'],
                         'X': float(r['X']), 'Y': float(r['Y']), 'Z': float(r['Z'])})
    return lop, diem


def tinh_ky(ky):
    tt = doc_tham_so()
    lop, diem = _doc_du_lieu_ky(ky)
    kq = chi_so.tinh_ky(lop, diem, tham_so.phang(tt['ts']))
    kq['phien_ban_ts'] = tt['phien_ban']
    _ghi_json(KHO / 'ky' / ky / 'ket_qua.json', kq)
    return kq


def go_ky(ky):
    kiem_tra_ma_ky(ky)
    thu_muc = KHO / 'ky' / ky
    if not thu_muc.exists():
        raise ValueError(f'Không có học kỳ {ky} trong kho.')
    shutil.rmtree(thu_muc)
    f = WEB_DATA / 'ky' / f'{ky}.json'
    if f.exists():
        f.unlink()
    xuat()


def tinh_lai_tat_ca():
    for ky in danh_sach_ky():
        tinh_ky(ky)
    xuat()


# ------------------------------------------------------------------ xuất web
def xuat():
    tt = doc_tham_so()
    ts = tham_so.phang(tt['ts'])
    kys = danh_sach_ky()
    theo_ky = {ky: _doc_json(KHO / 'ky' / ky / 'ket_qua.json') for ky in kys}
    shutil.rmtree(WEB_DATA / 'ho_so', ignore_errors=True)
    lk = lien_ky.tinh(theo_ky, ts)
    nhan_xet.tao(theo_ky, ts)                        # bộ luật E: câu nhận xét hồ sơ lớp
    nhan_xet.xu_huong_gv(lk, ts)                     # bộ luật E: câu xu hướng cho trang Diễn biến
    lk['ten_od'] = nhan_xet.doc_mau()['ten_on_dinh']   # tên chiều ổn định O1–O6
    lk['chua_du_du_lieu'] = nhan_xet.doc_mau()['chua_du_du_lieu']
    danh_muc = {'khoa': {}, 'bm': {}, 'hp': {}}
    ds = []
    for ky in kys:
        meta = _doc_json(KHO / 'ky' / ky / 'meta.json', {})
        for v in _doc_json(KHO / 'ky' / ky / 'lop.json'):
            danh_muc['khoa'][v['ma_khoa']] = v['ten_khoa'] or danh_muc['khoa'].get(v['ma_khoa'], '')
            danh_muc['bm'][v['ma_bm']] = {'ten': v['ten_bm'] or v['ma_bm'], 'khoa': v['ma_khoa']}
        for h in theo_ky[ky]['hp']:
            danh_muc['hp'][h['ma']] = {'ten': h['ten'], 'bm': h['bm'], 'khoa': h['khoa']}
        kq = theo_ky[ky]
        # Hồ sơ lớp (bộ luật E) tách theo bộ môn để trang chỉ tải phần cần xem.
        ho_so = defaultdict(dict)
        for l in kq['lop']:
            hs = l.pop('hs', None)
            if hs:
                chung = {'tieu_de': hs.pop('tieu_de'), 'luu_y': hs.pop('luu_y')}
                ho_so[l['bm']][f"{l['ma']}|{l['nhom']}"] = hs
        for bm, hs_bm in ho_so.items():
            _ghi_json(WEB_DATA / 'ho_so' / ky / f'{bm}.json', {**chung, 'lop': hs_bm})
        _ghi_json(WEB_DATA / 'ky' / f'{ky}.json', {'ky': ky, 'tong': kq['tong'], 'hp': kq['hp'], 'lop': kq['lop']})
        ds.append({'ky': ky, 'nhan': nhan_ky(ky), 'nhan_ngan': nhan_ky_ngan(ky), 'ngay_nap': meta.get('ngay_nap'),
                   'so_dong': meta.get('doi_soat', {}).get('ghep', {}).get('so_dong'),
                   'so_lop': kq['tong']['so_lop'], 'so_hp': kq['tong']['so_hp'], 'phien_ban_ts': kq.get('phien_ban_ts'),
                   'file_lop': meta.get('doi_soat', {}).get('file_lop'), 'file_diem': meta.get('doi_soat', {}).get('file_diem')})
    _ghi_json(WEB_DATA / 'danh_sach_ky.json', ds)
    _ghi_json(WEB_DATA / 'danh_muc.json', danh_muc)
    _ghi_json(WEB_DATA / 'lien_ky.json', lk)
    # tập câu mẫu của giao diện: trang web chỉ đọc câu từ đây (kiểm tra JSON hợp lệ trước khi xuất)
    _ghi_json(WEB_DATA / 'van_ban.json', json.loads(VAN_BAN.read_text(encoding='utf-8')))
    _ghi_json(WEB_DATA / 'tham_so.json', {'phien_ban': tt['phien_ban'], 'ts': tt['ts'], 'mac_dinh': tham_so.doc_mac_dinh()})


def main(argv):
    if not argv:
        print(__doc__)
        return
    lenh = argv[0]
    if lenh == 'nap':
        ky, fl, fd = argv[1:4]
        ds = chuan_bi_nap(ky, fl, fd)
        print(json.dumps({k: v for k, v in ds.items() if k not in ('token',)}, ensure_ascii=False, indent=1)[:3000])
        t = time.time()
        xac_nhan_nap(ds['token'])
        print(f'Đã nạp {ky} ({time.time() - t:.0f} giây tính chỉ số).')
    elif lenh == 'go':
        go_ky(argv[1])
    elif lenh == 'tinh-lai':
        tinh_lai_tat_ca()
    elif lenh == 'xuat':
        xuat()
    else:
        print(__doc__)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1:])
