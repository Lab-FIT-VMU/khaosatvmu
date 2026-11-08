"""Bộ luật E – ghép sẵn câu nhận xét "Hồ sơ một lớp" và "lớp liên quan đến điểm lưu ý".

Câu mẫu, điều kiện: Data/Bo luat/mau_nhan_xet.json. Ngưỡng: tham số (nhóm goi_y_ho_so + bộ luật D).
tao(theo_ky, ts) sửa trực tiếp dữ liệu từng kỳ: thêm hp['gp'], lop['gp_tag'], lop['hs'].
"""
import ast
import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy import stats

from .lien_ky import lap_lai
from .chuan_hoa import nhan_ky, nhan_ky_ngan

MAU = Path(__file__).resolve().parent.parent / 'rules' / 'mau_nhan_xet.json'
FLAGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']


def doc_mau():
    return json.loads(MAU.read_text(encoding='utf-8'))


# ---------------------------------------------------------------- biểu thức điều kiện (an toàn)
_CHO_PHEP = (ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.UnaryOp, ast.Not, ast.USub, ast.BinOp, ast.Add, ast.Sub,
             ast.Mult, ast.Div, ast.Compare, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq, ast.Name, ast.Load,
             ast.Constant, ast.Call)
_HAM = {'co': lambda x: x is not None, 'abs': lambda x: None if x is None else abs(x)}
_cache = {}


def dung(bieu_thuc, ctx):
    """Đánh giá điều kiện; thiếu dữ liệu (None) trong phép so sánh/tính toán -> False."""
    code = _cache.get(bieu_thuc)
    if code is None:
        cay = ast.parse(str(bieu_thuc), mode='eval')
        for n in ast.walk(cay):
            if not isinstance(n, _CHO_PHEP):
                raise ValueError(f'Biểu thức không hợp lệ: {bieu_thuc}')
            if isinstance(n, ast.Call) and not (isinstance(n.func, ast.Name) and n.func.id in _HAM):
                raise ValueError(f'Hàm không được phép: {bieu_thuc}')
        code = _cache[bieu_thuc] = compile(cay, '<dieu_kien>', 'eval')
    env = defaultdict(lambda: None, ctx)
    env.update(_HAM)
    try:
        return bool(eval(code, {'__builtins__': {}}, env))
    except TypeError:
        return False


# ---------------------------------------------------------------- điền chỗ trống
def _vi(v, d):
    s = f'{abs(v):,.{d}f}'.replace(',', ' ').replace('.', ',').replace(' ', '.')
    return ('-' if v < 0 else '') + s


def dinh_dang(v, kieu):
    if v is None:
        return '—'
    if isinstance(v, str):
        return v
    if kieu == 'so1':
        return _vi(v, 1)
    if kieu == 'so2':
        return _vi(v, 2)
    if kieu == 'abs2':
        return _vi(abs(v), 2)
    if kieu == 'dau2':
        return ('+' if v > 0 else '') + _vi(v, 2)
    if kieu == 'pct':
        return _vi(v * 100, 1)
    if kieu == 'pct0':
        return _vi(v * 100, 0)
    if kieu == 'nguyen':
        return _vi(v, 0)
    if isinstance(v, float):
        return _vi(v, 2)
    return str(v)


def dien(mau, ctx):
    def _thay(m):
        ten, _, kieu = m.group(1).partition('|')
        return dinh_dang(ctx.get(ten), kieu or None)
    return re.sub(r'\{([a-z_0-9|]+)\}', _thay, mau)


# ---------------------------------------------------------------- bước 1: lớp góp phần
def gop_phan(h, ls, ts, M, ls_i1=None):
    q0 = ts['fdr_q']
    ls_i1 = ls if ls_i1 is None else ls_i1
    kq = {}
    for c in h['co']:
        quy = M['gop_phan'].get(c)
        if not quy:
            continue
        loai, k = quy['loai'], quy.get('chi_so')
        ctx0 = {**ts, 'hp_y_tb': h.get('y_tb'), 'hp_y_tb_truoc': h.get('y_tb_truoc'), 'hp_i2': h.get('i2'),
                'hp_ky_truoc': nhan_ky(h['ky_truoc']) if h.get('ky_truoc') else '', 'hp_thang_truoc': h.get('thang_truoc')}
        ds, ghi = [], None

        def them(l, mau, **them_ctx):
            v = l.get(k)
            ctx = {**ctx0, **them_ctx, 'gia_tri': v,
                   'chieu': M['chieu']['duong' if (v or 0) > 0 else 'am'], 'ten_diem': quy.get('ten_diem', '')}
            ds.append({'ma': l['ma'], 'nhom': l['nhom'], 'gv': l['gv'], 'txt': dien(mau, ctx)})

        if loai == 'lech':
            co = [l for l in ls if l.get(k) is not None]
            sig = sorted([l for l in co if l.get(quy['q']) is not None and l[quy['q']] < q0], key=lambda l: -abs(l[k]))
            if sig:
                for l in sig:
                    them(l, quy['mau'])
            elif co:
                them(max(co, key=lambda l: abs(l[k])), quy['mau_lon_nhat'])
                ghi = quy['ghi_khong_co']
        elif loai == 'duoi_nguong':
            co = [l for l in ls if l.get(k) is not None]
            n = ts[quy['nguong']]
            duoi = sorted([l for l in co if l[k] < n], key=lambda l: l[k])
            if duoi:
                for l in duoi:
                    them(l, quy['mau'], nguong=n)
            elif co:
                them(min(co, key=lambda l: l[k]), quy['mau_lon_nhat'])
        elif loai == 'cao_hon_khac':
            co = [l for l in ls_i1 if l.get(k) is not None]        # I1 xét cả lớp đủ sinh viên có điểm
            ss = quy['so_sanh']
            sig = [l for l in co if l.get(quy['q']) is not None and l[quy['q']] < q0 and l[k] > (l.get(ss) if l.get(ss) is not None else 1)]
            if sig:
                for l in sorted(sig, key=lambda l: -l[k]):
                    them(l, quy['mau'], so_sanh=l.get(ss))
            elif co:
                t = max(co, key=lambda l: l[k])
                them(t, quy['mau_lon_nhat'], so_sanh=t.get(ss))
        elif loai == 'tren_muc_hp':
            muc = h.get('i2')
            for l in sorted([l for l in ls if l.get(k) is not None and muc is not None and l[k] > muc], key=lambda l: -l[k]):
                them(l, quy['mau'], muc_hp=muc)
        elif loai == 'ca_hoc_phan':
            ghi = dien(quy['ghi'] if h.get('y_tb_truoc') is not None else quy['ghi_khong_so'], ctx0)
        kq[c] = {'ds': ds, 'ghi': ghi}
    return kq


# ---------------------------------------------------------------- bước 3: giảng viên qua các kỳ
def _khoa_gv(l):
    return l.get('email') or (l.get('gv') or '').strip().lower()


def chuoi_gv(theo_ky, kys):
    """{(gv, goc): {'i7': {ky: tb}, 'dh': {D: [ky]}}} trên các kỳ cho trước."""
    out = defaultdict(lambda: {'i7': {}, 'dh': defaultdict(list), 'ky_day': set()})
    for ky in kys:
        tam = defaultdict(list)
        for l in theo_ky[ky]['lop']:
            if (not l['tk'] and not l.get('tk_i1')) or not _khoa_gv(l):
                continue
            key = (_khoa_gv(l), l['goc'])
            out[key]['ky_day'].add(ky)
            if l['tk'] and l.get('i7') is not None:
                tam[key].append(l['i7'])
            for d in l['dh']:
                if ky not in out[key]['dh'][d]:
                    out[key]['dh'][d].append(ky)
        for key, vs in tam.items():
            out[key]['i7'][ky] = round(sum(vs) / len(vs), 3)   # cùng cách làm tròn với lien_ky.gv_hp
    return out


def phan_loai_xu_huong(vals, ts):
    e = ts['vung_gan_0']
    duong = sum(v > e for v in vals)
    am = sum(v < -e for v in vals)
    ctx = {'so_ky': len(vals), 'so_ky_duong': duong, 'so_ky_am': am, 'so_ky_gan_0': len(vals) - duong - am,
           'vung_gan_0': e, 'cung_chieu': False}
    if len(vals) >= 2:
        n = len(vals)
        tb, sai = float(np.mean(vals)), float(np.std(vals, ddof=1)) / n ** 0.5
        t = float(stats.t.ppf(1 - (1 - ts['muc_tin_cay']) / 2, n - 1))
        ctx.update(ky_tb=tb, ky_lo=tb - t * sai, ky_hi=tb + t * sai)
        ctx['cung_chieu'] = n >= ts['so_ky_cung_chieu'] and (ctx['ky_lo'] > 0 or ctx['ky_hi'] < 0)
    return ctx


def cau_xu_huong(vals, ts, M):
    ctx = phan_loai_xu_huong(vals, ts)
    phan = []
    if ctx['so_ky_duong']:
        phan.append(dien(M['buoc3']['ky_duong'], ctx))
    if ctx['so_ky_am']:
        phan.append(dien(M['buoc3']['ky_am'], ctx))
    if ctx['so_ky_gan_0']:
        phan.append(dien(M['buoc3']['ky_gan_0'], ctx))
    ctx['cac_ky'] = ', '.join(phan)
    for q in M['buoc3']['xu_huong']:
        if dung(q['dieu_kien'], ctx):
            return dien(q['mau'], ctx), ctx
    return '', ctx


def cung_chieu(ctx, ts):
    """Từ so_ky_cung_chieu kỳ trở lên và khoảng tin cậy của trung bình các kỳ không chứa 0."""
    return ctx['cung_chieu']


# ---------------------------------------------------------------- hồ sơ một lớp
def ho_so(l, h, ls, ky, kys_den, cgv, tag, ts, M):
    B3, B4 = M['buoc3'], M['buoc4']
    khac = [o for o in ls if (o['ma'], o['nhom']) != (l['ma'], l['nhom'])]
    hp_ctx = {'hp_i1': h.get('i1'), 'hp_i2': h.get('i2'), 'hp_r': h.get('r'), 'hp_x_tb': h.get('x_tb'), 'hp_y_tb': h.get('y_tb'),
              'hp_x_tru_y': (h['x_tb'] - h['y_tb']) if h.get('x_tb') is not None and h.get('y_tb') is not None else None}
    # Bước 1
    b1 = [dien(M['buoc1']['gop_phan'], {'ten_canh_bao': M['ten_canh_bao'][c], 'mo_ta': t}) for c, t in tag]
    b1 += [dien(M['buoc1']['dau_hieu'], {'ten_dau_hieu': M['ten_dau_hieu'][d][0], 'mo_ta_dau_hieu': M['ten_dau_hieu'][d][1]}) for d in l['dh']]
    if h.get('hai_he') and (any(c == 'H4' for c, _ in tag) or {'D4', 'D5'} & set(l['dh'])):
        b1.append(M['buoc1']['ghi_hai_he'])
    b1_trong = None if b1 else M['buoc1']['khong_co']
    # Bước 2
    b2 = []
    for cs in M['buoc2']['chi_so']:
        k, kieu, dv = cs['lop'], cs['dinh_dang'], cs.get('don_vi', '')
        v = l.get(k)
        vs = [o.get(k) for o in ls if o.get(k) is not None]
        lo, hi = (min(vs), max(vs)) if vs else (None, None)
        ctx = {**ts, **l, **hp_ctx, 'gia_tri': v, 'so_lop': len(ls),
               'la_cao_nhat': v is not None and hi is not None and v >= hi - 1e-9,
               'la_thap_nhat': v is not None and lo is not None and v <= lo + 1e-9}
        o_lop = (dinh_dang(v, kieu) + (dv if v is not None and dv else '')) + (dien(cs['kem_lop'], ctx) if cs.get('kem_lop') else '')
        o_hp = M['buoc2']['moc_0'] if cs['hp'] == 'MOC_0' else ('—' if not cs['hp'] or hp_ctx.get(cs['hp']) is None else dinh_dang(hp_ctx[cs['hp']], kieu) + dv)
        o_khoang = '—' if lo is None else f'{dinh_dang(lo, kieu)} – {dinh_dang(hi, kieu)}{dv.strip() and dv}'
        quy = cs['nhan_xet']
        quy = M['buoc2']['nhan_xet_chung'] if quy == 'chung' else [x for q in quy for x in (M['buoc2']['nhan_xet_chung'] if q == 'chung' else [q])]
        nx = next((dien(q['mau'], ctx) for q in quy if dung(q['dieu_kien'], ctx)), '')
        b2.append([cs['ten'], o_lop, o_hp, o_khoang, nx])
    # Bước 3
    key = (_khoa_gv(l), l['goc'])
    g = cgv.get(key)
    b3, chuoi, ctx_gv = [], None, None
    if g and g['i7']:
        ks = [k for k in kys_den if k in g['i7']]
        vals = [g['i7'][k] for k in ks]
        xu, ctx_gv = cau_xu_huong(vals, ts, M)
        b3.append(dien(B3['mo_dau'], {'gv': l['gv'], 'so_ky': len(ks), 'ky_hien_tai': nhan_ky(ky), 'xu_huong': xu}))
        chuoi = {'ky': ks, 'nhan': [nhan_ky_ngan(k) for k in ks], 'nhan_day_du': [nhan_ky(k) for k in ks], 'gt': [round(v, 3) for v in vals]}
        if g['dh']:
            ds = '; '.join(dien(B3['mot_dau_hieu'], {'ten_dau_hieu': M['ten_dau_hieu'][d][0], 'ds_ky': ', '.join(nhan_ky(k) for k in kk)})
                           for d, kk in g['dh'].items())
            dong = dien(B3['dau_hieu_da_co'], {'ds_dau_hieu': ds})
        else:
            dong = B3['khong_dau_hieu']
        lap = lap_lai(g, kys_den, ts)
        ds_lap = '; '.join(dien(B3['mot_lap_dang'] if ky in kk else B3['mot_lap_truoc'], {'ten_dau_hieu': M['ten_dau_hieu'][d][0]})
                           for d, kk in lap.items())
        b3.append(dong + ' ' + dien(B3['lap_lai'] if lap else B3['chua_lap_lai'], {**ts, 'ds_lap': ds_lap}))
    else:
        b3.append(B3['khong_du_lieu'])
    cung = [o for o in khac if _khoa_gv(o) == _khoa_gv(l)]
    if cung:
        ds = '; '.join(dien(B3['mot_lop'], {'nhom': o['nhom'], 'i7': o.get('i7'),
                                           'kem_y_nghia': B3['kem_y_nghia'] if o.get('i7_q') is not None and o['i7_q'] < ts['fdr_q'] else ''})
                       for o in cung)
        b3.append(dien(B3['lop_cung_gv'], {'so_lop': len(cung), 'ds_lop': ds}))
    # Bước 4
    ctx = {**ts, **l, **hp_ctx, 'gv_cung_chieu': bool(ctx_gv and cung_chieu(ctx_gv, ts))}
    cau = [q for q in B4['cau_hoi'] if dung(q['dieu_kien'], ctx)]
    cau.append(B4['cau_cuoi_co'] if cau else B4['cau_cuoi_khong'])
    return {'tieu_de': M['tieu_de_buoc'], 'b1': b1, 'b1_trong': b1_trong, 'b2': b2, 'b3': b3, 'b3_chuoi': chuoi,
            'b4': [dien(q['mau'], ctx) for q in cau], 'b4_ma': [q['ma'] for q in cau], 'luu_y': B4['luu_y']}


def xu_huong_gv(lk, ts, M=None):
    """Câu xu hướng (bước 3) cho bảng giảng viên của trang Diễn biến.

    Tính riêng đến từng kỳ có dữ liệu (E-P4): rec['theo_ky'][ky] chỉ dùng các kỳ đến ky, không dùng kỳ sau.
    """
    M = M or doc_mau()
    for rec in lk['gv_hp']:
        vals, rec['theo_ky'] = [], {}
        for ky in lk['ky']:
            if ky not in rec['i7']:
                continue
            vals.append(rec['i7'][ky])
            cau, ctx = cau_xu_huong(vals, ts, M)
            rec['theo_ky'][ky] = {'xu_huong': cau[:1].upper() + cau[1:], 'cung_chieu': cung_chieu(ctx, ts),
                                  # cấp giảng viên: từ 2 kỳ, mọi kỳ nằm trong vùng gần 0 (chỉ mô tả, không kết luận tương đương)
                                  'tuong_duong': len(vals) >= 2 and all(abs(v) <= ts['vung_gan_0'] for v in vals)}
    return lk


def tao(theo_ky, ts, M=None):
    M = M or doc_mau()
    kys = list(theo_ky)
    for i, ky in enumerate(kys):
        kq = theo_ky[ky]
        cgv = chuoi_gv(theo_ky, kys[:i + 1])                # E-P4: chỉ các kỳ đến kỳ đang xem
        theo_hp, theo_hp_i1 = defaultdict(list), defaultdict(list)
        for l in kq['lop']:
            l.pop('hs', None)
            l['gp_tag'] = []
            if l['tk']:
                theo_hp[l['goc']].append(l)
            if l['tk'] or l.get('tk_i1'):
                theo_hp_i1[l['goc']].append(l)
        for h in kq['hp']:
            ls = sorted(theo_hp.get(h['ma'], []), key=lambda l: (l['nhom'], l['ma']))
            ls_i1 = sorted(theo_hp_i1.get(h['ma'], []), key=lambda l: (l['nhom'], l['ma']))
            h['gp'] = gop_phan(h, ls, ts, M, ls_i1)
            for c, g in h['gp'].items():
                for x in g['ds']:
                    for l in ls_i1:
                        if l['ma'] == x['ma'] and l['nhom'] == x['nhom']:
                            l['gp_tag'].append([c, x['txt']])
            for l in ls:
                l['hs'] = ho_so(l, h, ls, ky, kys[:i + 1], cgv, l['gp_tag'], ts, M)
    return theo_ky
