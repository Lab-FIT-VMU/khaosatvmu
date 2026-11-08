"""So sánh qua các học kỳ: H5 theo lịch sử học phần, cờ H6 (điểm thi thay đổi so với kỳ trước), G1 (đặc điểm lặp lại), chiều ổn định O1–O6,
lịch sử cờ, xu hướng.

tinh(ket_qua_theo_ky, ts) nhận {ky: kết quả tinh_ky} đã sắp theo thời gian; sửa trực tiếp
danh sách cờ của học phần (thêm H6) và trả về dữ liệu liên kỳ.
"""
import math
from collections import defaultdict

import numpy as np
from scipy import stats

from .chi_so import bh
from .chuan_hoa import stt_ky


ON_DINH = ('O1', 'O2', 'O3', 'O4', 'O5', 'O6')


def _welch(m1, s1, n1, m2, s2, n2, tin_cay=0.95):
    """Trả về (p, cận trên của |chênh lệch trung bình| theo khoảng tin cậy), hoặc (None, None)."""
    if n1 < 2 or n2 < 2:
        return None, None
    v1, v2 = s1 * s1 / n1, s2 * s2 / n2
    if v1 + v2 == 0:
        return None, None
    se = math.sqrt(v1 + v2)
    t = (m1 - m2) / se
    df = (v1 + v2) ** 2 / ((v1 ** 2) / (n1 - 1) + (v2 ** 2) / (n2 - 1))
    return float(2 * stats.t.sf(abs(t), df)), abs(m1 - m2) + float(stats.t.ppf(1 - (1 - tin_cay) / 2, df)) * se


def _khoa_gv(l):
    return l.get('email') or (l.get('gv') or '').strip().lower()


def on_dinh(h, ts):
    """Chiều ổn định, đồng đều (bộ luật E mục 9). Mọi trạng thái đều cần khoảng tin cậy nằm về phía ổn định của ngưỡng."""
    co, od = h['co'], []
    if h.get('du_dk') and h.get('tau_x') is not None and 'H1' not in co and h.get('icc_tren_x') is not None \
            and h['icc_tren_x'] < ts['h1_icc_x'] and (h.get('chenh_x') or 0) < ts['h1_khoang_tan_x']:
        od.append('O1')
    if h.get('du_dk') and h.get('tau_y') is not None and 'H2' not in co and h.get('icc_tren_y') is not None \
            and h['icc_tren_y'] < ts['h2_icc_y'] and (h.get('chenh_y') or 0) < ts['h2_khoang_tan_y']:
        od.append('O2')
    if h.get('r') is not None and h['r'] >= ts['d3_r_hp'] and h.get('r_lo') is not None and h['r_lo'] >= ts['h3_r_hp'] and 'H3' not in co:
        od.append('O3')
    if h.get('du_dk_i1') and h.get('p_h4') is not None and 'H4' not in co and h.get('chenh_i1_tren') is not None \
            and h['chenh_i1_tren'] < ts['h4_chenh_mat_tu_cach']:
        od.append('O4')
    if (h.get('n_p') or 0) > 0 and h.get('i2') is not None and 'H5' not in co and h.get('i2_hi') is not None \
            and h['i2_hi'] < ts['h5_ty_le_f']:
        od.append('O5')
    if h.get('y_tb_truoc') is not None and 'H6' not in co and h.get('lech_y_tren') is not None \
            and h['lech_y_tren'] < ts['h6_lech_y_giua_ky']:
        od.append('O6')
    return od


def chua_du(h):
    """So sánh được, không có điểm lưu ý, nhưng chưa đủ căn cứ để ghi trạng thái ổn định."""
    co, od = h['co'], h['od']
    so_sanh_duoc = {
        'O1': h.get('du_dk') and h.get('tau_x') is not None,
        'O2': h.get('du_dk') and h.get('tau_y') is not None,
        'O3': h.get('r') is not None,
        'O4': h.get('du_dk_i1') and h.get('p_h4') is not None,
        'O5': (h.get('n_p') or 0) > 0 and h.get('i2') is not None,
        'O6': h.get('y_tb_truoc') is not None,
    }
    return [o for o in ON_DINH if so_sanh_duoc[o] and 'H' + o[1] not in co and o not in od]


def _cua_so(kys, ts):
    """Các kỳ trong kys nằm trong g1_cua_so_ky kỳ gần nhất theo lịch, tính đến kỳ cuối của kys."""
    cuoi = stt_ky(kys[-1])
    return [k for k in kys if cuoi - stt_ky(k) < ts['g1_cua_so_ky']]


def lap_lai(c, kys, ts):
    """G1 của một cặp giảng viên – học phần, tính đến kỳ cuối của kys: {đặc điểm: [các kỳ trong cửa sổ]}."""
    cs = _cua_so(kys, ts)
    so_day = sum(k in c['ky_day'] for k in cs)
    kq = {}
    for d, s in c['dh'].items():
        ds = [k for k in cs if k in s]
        if len(ds) >= ts['g1_so_ky_lap'] and len(ds) / so_day >= ts['g1_ty_le_ky']:
            kq[d] = ds
    return kq


def _muc_ngau_nhien(cap, kys, ts, so_lan=300):
    """Số lượt G1 kỳ vọng nếu các đặc điểm rơi ngẫu nhiên vào các cặp giảng viên – học phần – kỳ (giữ tổng số lượt từng đặc điểm).

    Ước lượng thô: coi mọi ô có khả năng như nhau, trong khi cặp có nhiều lớp dễ có đặc điểm hơn, nên có thể thấp hơn thực tế.
    """
    cs = _cua_so(kys, ts)
    if len(cs) < 2:
        return None
    ds_cap = sorted(k for k, c in cap.items() if any(z in c['ky_day'] for z in cs))
    if not ds_cap:
        # Sửa so với bản gốc: chưa có cặp giảng viên – học phần nào (ví dụ mọi lớp chưa xác định
        # giảng viên vì file lớp thiếu email) thì không tính được, thay vì lỗi numpy.
        return None
    o = np.array([i for i, k in enumerate(ds_cap) for z in cs if z in cap[k]['ky_day']], dtype=np.int64)
    so_day = np.bincount(o, minlength=len(ds_cap))
    dem = defaultdict(int)
    for k in ds_cap:
        for d, s in cap[k]['dh'].items():
            dem[d] += sum(z in s for z in cs)
    rng = np.random.default_rng(20261101)
    tong = 0
    for d in sorted(dem):
        if not dem[d]:
            continue
        for _ in range(so_lan):
            x = np.bincount(o[rng.choice(len(o), dem[d], replace=False)], minlength=len(ds_cap))
            tong += int(((x >= ts['g1_so_ky_lap']) & (x / so_day >= ts['g1_ty_le_ky'])).sum())
    return round(tong / so_lan, 1)


def tinh(theo_ky, ts):
    kys = list(theo_ky)
    # --- H6: so với kỳ gần nhất trước đó có mở học phần
    lan_cuoi = {}
    lich_su = defaultdict(lambda: [0, 0])                # {học phần: [số trượt, số nhóm P]} của các kỳ trước
    for ky in kys:
        hps = [h for h in theo_ky[ky]['hp'] if h.get('y_tb') is not None]
        ps = []
        # H5: tỷ lệ trượt cao hơn các kỳ trước của chính học phần
        ps5 = []
        for h in hps:
            f0, n0 = lich_su[h['ma']]
            p5 = None
            if n0 and h.get('n_p'):
                h['i2_lich_su'] = f0 / n0
                p5 = float(stats.fisher_exact([[h['n_f'], h['n_p'] - h['n_f']], [f0, n0 - f0]], alternative='greater')[1])
            ps5.append(p5)
        for h, q in zip(hps, bh(ps5)):
            if q is not None and q < ts['fdr_q'] and h['i2'] - h['i2_lich_su'] >= ts['h5_chenh_lich_su'] and 'H5' not in h['co']:
                h['co'].append('H5')
                h['h5_ly_do'] = 'lich_su'
        for h in hps:
            if h.get('n_p'):
                lich_su[h['ma']][0] += h['n_f']; lich_su[h['ma']][1] += h['n_p']
        for h in hps:
            truoc = lan_cuoi.get(h['ma'])
            p = None
            if truoc:
                kt, ht = truoc
                h['ky_truoc'], h['y_tb_truoc'] = kt, ht['y_tb']
                h['thang_truoc'] = (stt_ky(ky) - stt_ky(kt)) * 6
                p, h['lech_y_tren'] = _welch(h['y_tb'], h['y_sd'] or 0, h['n_p'], ht['y_tb'], ht['y_sd'] or 0, ht['n_p'], ts['muc_tin_cay'])
                h['p_h6'] = p
            ps.append(p)
        for h, q in zip(hps, bh(ps)):
            if q is not None and q < ts['fdr_q'] and abs(h['y_tb'] - h['y_tb_truoc']) >= ts['h6_lech_y_giua_ky']:
                if 'H6' not in h['co']:
                    h['co'].append('H6')
        for h in hps:
            lan_cuoi[h['ma']] = (ky, h)
        for h in theo_ky[ky]['hp']:
            h['od'] = on_dinh(h, ts)
            h['cdl'] = chua_du(h)

    # --- lịch sử cờ, đề thi, xu hướng
    co_hp, de_thi, de_thi_lech, xu_huong = defaultdict(dict), defaultdict(dict), defaultdict(dict), {}
    for ky in kys:
        xu_huong[ky] = theo_ky[ky]['tong']
        for h in theo_ky[ky]['hp']:
            if h['co']:
                co_hp[h['ma']][ky] = h['co']
            if h.get('y_tb') is not None:
                de_thi[h['ma']][ky] = round(h['y_tb'], 2)
                if h.get('y_tb_truoc') is not None:      # mức thay đổi chính xác so với kỳ gần nhất trước đó (H6)
                    de_thi_lech[h['ma']][ky] = {'lech': round(h['y_tb'] - h['y_tb_truoc'], 3), 'ky_truoc': h['ky_truoc'],
                                                'thang': h['thang_truoc'], 'h6': 'H6' in h['co']}
        xu_huong[ky]['so_hp_co'] = sum(1 for h in theo_ky[ky]['hp'] if h['co'])
        xu_huong[ky]['so_hp_od'] = {o: sum(1 for h in theo_ky[ky]['hp'] if o in h['od']) for o in ON_DINH}

    # --- G1 và bảng GV × học phần × kỳ
    cap = defaultdict(lambda: {'i7': {}, 'dh': defaultdict(set), 'ky_day': set(), 'gv': '', 'email': '', 'bm': '', 'khoa': '', 'ten': ''})
    for ky in kys:
        tam = defaultdict(list)
        for l in theo_ky[ky]['lop']:
            if not l['tk'] and not l.get('tk_i1'):
                continue
            key = (_khoa_gv(l), l['goc'])
            if not key[0]:
                continue
            c = cap[key]
            c['ky_day'].add(ky)
            c['gv'], c['email'], c['bm'], c['khoa'], c['ten'] = l['gv'], l['email'], l['bm'], l['khoa'], l['ten']
            if l['tk'] and l.get('i7') is not None:
                tam[key].append(l['i7'])
            for d in l['dh']:
                c['dh'][d].add(ky)                       # một kỳ có >=1 lớp có dấu hiệu là đủ
        for key, vs in tam.items():
            cap[key]['i7'][ky] = round(sum(vs) / len(vs), 3)
    gv_hp = []
    for (k, goc), c in cap.items():
        g1_ky = {}                                       # đặc điểm lặp lại tính đến từng kỳ, không dùng kỳ sau
        for i, ky in enumerate(kys):
            den = lap_lai(c, kys[:i + 1], ts)
            if den:                                      # dang: đặc điểm có xuất hiện ở chính kỳ đó
                g1_ky[ky] = {d: {'ky': ds, 'dang': ky in ds} for d, ds in sorted(den.items())}
        rec = {'gv': c['gv'], 'email': c['email'], 'goc': goc, 'ten': c['ten'], 'bm': c['bm'], 'khoa': c['khoa'],
               'ky_day': sorted(c['ky_day'], key=kys.index),
               'i7': c['i7'], 'dh': {d: sorted(s, key=kys.index) for d, s in c['dh'].items()}, 'g1_ky': g1_ky}
        if c['i7'] or c['dh']:
            gv_hp.append(rec)
    return {'ky': kys, 'xu_huong': xu_huong, 'co_hp': co_hp, 'de_thi': de_thi, 'de_thi_lech': de_thi_lech, 'gv_hp': gv_hp,
            'g1_ngau_nhien': {ky: _muc_ngau_nhien(cap, kys[:i + 1], ts) for i, ky in enumerate(kys)}}
