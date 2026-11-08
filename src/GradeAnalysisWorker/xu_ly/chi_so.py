"""Bộ luật D – chỉ số trong một học kỳ: I1–I10, dấu hiệu D1–D7, cờ H1–H5, độ phủ Q1–Q3.

tinh_ky(lop, diem, ts) -> dict kết quả của kỳ (chưa có H6, sẽ bổ sung ở lien_ky).
lop: {(ma_hp, nhom): thông tin lớp} (bộ luật B); diem: dòng điểm đã ghép (bộ luật A + B).
ts: tham số phẳng {tên: giá trị} (xem tham_so.py).
"""
import math
import os
import warnings
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy import stats

HE4 = [(8.5, 4.0), (8.0, 3.5), (7.0, 3.0), (6.5, 2.5), (5.5, 2.0), (5.0, 1.5), (4.0, 1.0)]


def he4(z):
    """Bộ luật C mục 1: thang 10 -> thang 4."""
    for nguong, v in HE4:
        if z >= nguong:
            return v
    return 0.0


def bh(pvals):
    """Benjamini–Hochberg: trả về q-value theo thứ tự đầu vào (None giữ nguyên)."""
    idx = [i for i, p in enumerate(pvals) if p is not None and not math.isnan(p)]
    q = [None] * len(pvals)
    if not idx:
        return q
    ps = np.array([pvals[i] for i in idx])
    order = np.argsort(ps)
    m = len(ps)
    ranked = ps[order] * m / (np.arange(m) + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    for k, o in enumerate(order):
        q[idx[o]] = float(min(1.0, ranked[k]))
    return q


def _r(v, d=3):
    if v is None:
        return None
    if isinstance(v, (float, np.floating)):
        if math.isnan(v) or math.isinf(v):
            return None
        return round(float(v), d)
    return v


# ---------------------------------------------------------------- mô hình hỗn hợp
def _f_lop(resp, cov, nhom, tin_cay):
    """Kiểm định F của hiệu ứng lớp khi đã kiểm soát biến kèm theo, kèm cận trên một phía của ICC.

    Trả về (p, ICC_tren, tau2_mo_men, s2) hoặc None khi không đủ bậc tự do.
    """
    nhan, idx = np.unique(nhom, return_inverse=True)
    N, J = len(resp), len(nhan)
    a, b = J - 1, N - J - 1
    if a < 1 or b < 1:
        return None
    gop = np.column_stack([np.ones_like(cov), cov])
    rieng = np.column_stack([cov, np.eye(J)[idx]])
    r0 = resp - gop @ np.linalg.lstsq(gop, resp, rcond=None)[0]
    r1 = resp - rieng @ np.linalg.lstsq(rieng, resp, rcond=None)[0]
    ss0, ss1 = float(r0 @ r0), float(r1 @ r1)
    # Sửa so với bản gốc (chỉ kiểm tra ss1 <= 0): phần dư "gần như bằng 0" so với tổng biến
    # thiên (ví dụ học phần có X trùng hệt Y) chỉ còn nhiễu số học ~1e-29, F thành phép chia
    # cho số gần 0 và ra p = 0 hay p = 1 tùy nền tảng. Coi như không kiểm định được.
    if ss1 <= 1e-10 * float(((resp - resp.mean()) @ (resp - resp.mean()))):
        return None
    msb, msw = max(ss0 - ss1, 0.0) / a, ss1 / b
    F = msb / msw
    n = np.bincount(idx).astype(float)
    n0 = (N - float((n * n).sum()) / N) / a
    R = F / stats.f.ppf(1 - tin_cay, a, b)
    icc_tren = 0.0 if R <= 1 else min(1.0, (R - 1) / (R + n0 - 1))
    return float(stats.f.sf(F, a, b)), icc_tren, max(0.0, (msb - msw) / n0), msw


def mo_hinh(args):
    """Mô hình intercept ngẫu nhiên: resp = b0 + b1*cov + u_lop + e (REML, statsmodels).

    Trả về {tau, sigma, icc, icc_tren, p_f, du_phong, u: {lop: (u, se)}}.
    Kiểm định chênh lệch giữa các lớp bằng F, vì LRT chia đôi quá thận trọng khi học phần có ít lớp.
    tau = 0 thì mọi lớp có u = 0, se = 0 và không được kiểm định riêng từng lớp.
    """
    resp, cov, nhom, *khac = args
    tin_cay = khac[0] if khac else 0.95
    import statsmodels.api as sm
    resp, cov = np.asarray(resp, float), np.asarray(cov, float)
    nhom = np.asarray(nhom)
    exog = np.column_stack([np.ones_like(cov), cov])
    f = _f_lop(resp, cov, nhom, tin_cay)
    p_f, icc_tren = (f[0], f[1]) if f else (None, None)
    kq = None
    tau2_dp = None
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        try:
            m = sm.MixedLM(resp, exog, groups=nhom).fit(reml=True)
            tau2 = float(np.asarray(m.cov_re)[0, 0])
            if m.converged and tau2 > 1e-8:
                s2 = float(m.scale)
                u = {}
                for g, val in m.random_effects.items():
                    se = math.sqrt(float(np.asarray(m.random_effects_cov[g])[0, 0]))
                    u[g] = (float(np.asarray(val)[0]), se)
                kq = {'tau': math.sqrt(tau2), 'sigma': math.sqrt(s2), 'icc': tau2 / (tau2 + s2),
                      'icc_tren': icc_tren, 'p_f': p_f, 'du_phong': False, 'u': u}
            elif m.converged:
                tau2_dp = 0.0
        except Exception:
            kq = None
    if kq is None:                                   # tau = 0, hoặc không hội tụ thì ước lượng theo mô men (mục 5)
        b = np.linalg.lstsq(exog, resp, rcond=None)[0]
        res = resp - exog @ b
        tau2 = tau2_dp if tau2_dp is not None else (f[2] if f else 0.0)
        s2 = f[3] if f else float(np.var(res, ddof=2))
        u = {}
        for g in np.unique(nhom):
            rg = res[nhom == g]
            if tau2 > 1e-8:
                lam = tau2 / (tau2 + s2 / len(rg))
                u[g] = (float(lam * rg.mean()), math.sqrt(tau2 * (1 - lam)))
            else:
                u[g] = (0.0, 0.0)
        kq = {'tau': math.sqrt(tau2), 'sigma': math.sqrt(s2), 'icc': tau2 / (tau2 + s2) if tau2 + s2 > 0 else 0.0,
              'icc_tren': icc_tren, 'p_f': p_f, 'du_phong': True, 'u': u}
    return kq


def _chay_mo_hinh(tasks):
    if not tasks:
        return []
    # GRADE_WORKER_PROCESSES=1 chạy tuần tự (máy chủ 1–2 vCPU, xem docker-compose.yml).
    n = int(os.environ.get('GRADE_WORKER_PROCESSES') or max(1, min(8, (os.cpu_count() or 2) - 1)))
    if len(tasks) < 40 or n <= 1:
        return [mo_hinh(t) for t in tasks]
    with ProcessPoolExecutor(max_workers=n) as ex:
        return list(ex.map(mo_hinh, tasks, chunksize=8))


# ---------------------------------------------------------------- kiểm định phụ
def _chi2_lop(mat, dat, rng):
    """H4: lớp × (mất TC / đạt TC). Monte Carlo khi tần số kỳ vọng < 5."""
    tab = np.array([mat, dat], float).T
    tab = tab[tab.sum(1) > 0]
    if tab.shape[0] < 2 or (tab.sum(0) == 0).any():
        return None
    exp = tab.sum(1, keepdims=True) * tab.sum(0, keepdims=True) / tab.sum()
    stat = float(((tab - exp) ** 2 / exp).sum())
    if (exp >= 5).all():
        return float(stats.chi2.sf(stat, tab.shape[0] - 1))
    nhan = np.repeat(np.arange(tab.shape[0]), tab.sum(1).astype(int))
    kq = np.concatenate([np.ones(int(tab[:, 0].sum())), np.zeros(int(tab[:, 1].sum()))])
    ge = 0
    for _ in range(999):
        rng.shuffle(kq)
        m = np.bincount(nhan, weights=kq, minlength=tab.shape[0])
        t = np.column_stack([m, tab.sum(1) - m])
        ge += ((t - exp) ** 2 / exp).sum() >= stat - 1e-9
    return (ge + 1) / 1000


def _tq(x, y):
    if len(x) < 3 or np.std(x) == 0 or np.std(y) == 0:
        return None, None, None, None
    r = float(np.corrcoef(x, y)[0, 1])
    rho = float(stats.spearmanr(x, y).statistic)
    z, se = math.atanh(max(min(r, 0.999999), -0.999999)), 1 / math.sqrt(len(x) - 3) if len(x) > 3 else float('inf')
    return r, rho, math.tanh(z - 1.96 * se), math.tanh(z + 1.96 * se)


def wilson_duoi(k, n, z):
    """Cận dưới Wilson của một tỷ lệ."""
    if not n:
        return None
    p = k / n
    t = z * z / n
    return max(0.0, (p + t / 2 - z * math.sqrt(p * (1 - p) / n + t / (4 * n))) / (1 + t))


def wilson_tren(k, n, z):
    """Cận trên Wilson của một tỷ lệ."""
    if not n:
        return None
    p = k / n
    t = z * z / n
    return min(1.0, (p + t / 2 + z * math.sqrt(p * (1 - p) / n + t / (4 * n))) / (1 + t))


def _chenh_i1_tren(mat, n_diem, tin_cay):
    """Cận trên một phía của chênh tỷ lệ mất tư cách giữa hai lớp bất kỳ (Agresti–Caffo, Bonferroni theo số cặp)."""
    J = len(mat)
    if J < 2:
        return None
    z = stats.norm.ppf(1 - (1 - tin_cay) / (J * (J - 1) / 2))
    ti = [(m + 1) / (n + 2) for m, n in zip(mat, n_diem)]
    va = [t * (1 - t) / (n + 2) for t, n in zip(ti, n_diem)]
    return max(abs(ti[i] - ti[j]) + z * math.sqrt(va[i] + va[j]) for i in range(J) for j in range(i + 1, J))


def gop_i9(hps):
    """R4: gộp I9 qua nhiều học phần = trung vị τ̂, ICC trên HP đủ D-Đ3, kèm tỷ lệ HP có H1 (X) / H2 (Y)."""
    dk = [h for h in hps if h['du_dk']]
    kq = {'so_hp': len(dk)}
    for pre, co in (('x', 'H1'), ('y', 'H2')):
        co_mh = [h for h in dk if h.get('tau_' + pre) is not None]
        kq['so_hp_' + pre] = len(co_mh)
        for f in ('tau_', 'icc_'):
            v = [h[f + pre] for h in co_mh]
            kq[f + pre] = _r(float(np.median(v))) if v else None
        kq['ty_le_' + co.lower()] = _r(sum(co in h['co'] for h in co_mh) / len(co_mh)) if co_mh else None
    return kq


# ---------------------------------------------------------------- tính kỳ
def tinh_ky(lop, diem, ts):
    rng = np.random.default_rng(20261026)
    alpha = 1 - ts['muc_tin_cay']
    zc = stats.norm.ppf(1 - alpha / 2)
    gop = ts['gop_ma_hp_hau_to']
    tu_khoa = [t.lower() for t in ts['tu_khoa_loai_hp']]
    loai_ma = set(ts['ds_ma_hp_loai_tru'])

    # --- năng lực nền (D-N1..N4): dùng mọi dòng điểm đã ghép
    tc = {k: v['tc'] or 1 for k, v in lop.items()}
    theo_sv = defaultdict(list)
    for d in diem:
        z = d['Z'] if ts['nang_luc_nen_thang'] == 10 else he4(d['Z'])
        theo_sv[d['masv']].append((d['mamh'], z, tc[(d['mamh'], d['loptc'])]))
    tong_sv = {s: (len(v), sum(z * t for _, z, t in v), sum(t for _, _, t in v)) for s, v in theo_sv.items()}

    def nang_luc(sv, ma, z, t):
        n, sz, st = tong_sv[sv]
        if n < ts['so_lop_hp_nang_luc_nen'] or st - t <= 0:
            return None
        if ts['nang_luc_nen_thang'] != 10:
            z = he4(z)
        return (sz - z * t) / (st - t)

    # --- gom điểm theo lớp
    theo_lop = defaultdict(list)
    for d in diem:
        theo_lop[(d['mamh'], d['loptc'])].append(d)

    L = {}
    for k, info in lop.items():
        ten_low = (info['ten_hp'] or '').lower()
        if any(t in ten_low for t in tu_khoa) or info['ma_hp'] in loai_ma or info['ma_goc'] in loai_ma:
            continue                                     # D-L2 (mặc định rỗng)
        ds = theo_lop.get(k, [])
        X = np.array([d['X'] for d in ds]); Y = np.array([d['Y'] for d in ds]); Z = np.array([d['Z'] for d in ds])
        P = X >= 4
        NL = np.array([np.nan if (v := nang_luc(d['masv'], d['mamh'], d['Z'], tc[k])) is None else v for d in ds])
        n_diem, n_p = len(ds), int(P.sum())
        L[k] = {'info': info, 'goc': info['ma_goc'] if gop else info['ma_hp'],
                'X': X[P], 'Y': Y[P], 'Z': Z[P], 'NL': NL[P],
                'n_diem': n_diem, 'n_p': n_p, 'n_mat': int((X == 0).sum()), 'n_f': int((Z[P] < 4).sum()),
                'tk': n_p >= ts['so_sv_toi_thieu_lop'], 'tct': n_p < ts['so_sv_tin_cay_thap'],
                'tk_i1': n_diem >= ts['so_sv_toi_thieu_lop']}

    # --- chỉ số mô tả cấp lớp I1–I6
    for v in L.values():
        v['i1'] = v['n_mat'] / v['n_diem'] if v['n_diem'] else None
        if not v['tk']:
            continue
        x, y = v['X'], v['Y']
        n = len(x)
        v['i2'] = v['n_f'] / n
        d = x - y
        sd = float(np.std(d, ddof=1))
        t = stats.t.ppf(1 - alpha / 2, n - 1)
        v['i5'], v['i5_sd'] = float(d.mean()), sd
        v['i5_lo'], v['i5_hi'] = v['i5'] - t * sd / math.sqrt(n), v['i5'] + t * sd / math.sqrt(n)
        v['r'], v['rho'], v['r_lo'], v['r_hi'] = _tq(x, y)

    # --- gom theo học phần
    HP = defaultdict(list)
    for k, v in L.items():
        HP[v['goc']].append(k)

    tasks_x, tasks_y, ref_x, ref_y = [], [], [], []
    hp_kq = {}
    for goc, ks in HP.items():
        tk = [k for k in ks if L[k]['tk']]
        du_dk = len(tk) >= ts['so_lop_toi_thieu_hp']
        tk_i1 = [k for k in ks if L[k]['tk_i1']]          # I1 xét theo số sinh viên có điểm, không theo nhóm P
        hp_kq[goc] = {'ks': ks, 'tk': tk, 'du_dk': du_dk, 'tk_i1': tk_i1,
                      'du_dk_i1': len(tk_i1) >= ts['so_lop_toi_thieu_hp']}
        if not du_dk:
            continue
        g = np.concatenate([[f'{k[0]}|{k[1]}'] * L[k]['n_p'] for k in tk])
        tasks_x.append((np.concatenate([L[k]['X'] for k in tk]), np.concatenate([L[k]['Y'] for k in tk]), g, ts['muc_tin_cay']))
        ref_x.append(goc)
        # I8: chỉ SV có NL; lớp cần >= so_sv_toi_thieu_lop SV có NL
        tk_y = [k for k in tk if np.isfinite(L[k]['NL']).sum() >= ts['so_sv_toi_thieu_lop']]
        if len(tk_y) >= ts['so_lop_toi_thieu_hp']:
            yy, nn, gg = [], [], []
            for k in tk_y:
                m = np.isfinite(L[k]['NL'])
                yy.append(L[k]['Y'][m]); nn.append(L[k]['NL'][m]); gg.append([f'{k[0]}|{k[1]}'] * int(m.sum()))
            tasks_y.append((np.concatenate(yy), np.concatenate(nn), np.concatenate(gg), ts['muc_tin_cay']))
            ref_y.append(goc)

    for goc, kq in zip(ref_x, _chay_mo_hinh(tasks_x)):
        hp_kq[goc]['mx'] = kq
    for goc, kq in zip(ref_y, _chay_mo_hinh(tasks_y)):
        hp_kq[goc]['my'] = kq

    # --- I7, I8, I10 cấp lớp
    for goc, h in hp_kq.items():
        for nhan, key in (('mx', 'i7'), ('my', 'i8')):
            m = h.get(nhan)
            if not m:
                continue
            for k in h['tk']:
                uu = m['u'].get(f'{k[0]}|{k[1]}')
                if uu is None:
                    continue
                u, se = uu
                v = L[k]
                v[key], v[key + '_se'] = u, se
                if se and se > 0 and not math.isnan(se):
                    v[key + '_lo'], v[key + '_hi'] = u - zc * se, u + zc * se
                    v[key + '_p'] = float(2 * stats.norm.sf(abs(u / se)))
                elif u == 0:
                    v[key + '_lo'], v[key + '_hi'] = 0.0, 0.0
                v[key + '_dp'] = m['du_phong']
        if h['du_dk_i1']:
            for k in h['tk_i1']:                         # D5: tỷ lệ mất TC lớp so với các lớp khác (Fisher exact)
                v = L[k]
                khac = [L[j] for j in h['tk_i1'] if j != k]
                mo = sum(o['n_mat'] for o in khac); no = sum(o['n_diem'] for o in khac)
                v['i1_khac'] = mo / no if no else None
                v['p_fisher'] = float(stats.fisher_exact([[v['n_mat'], v['n_diem'] - v['n_mat']], [mo, no - mo]])[1])
        if not h['du_dk']:
            continue
        for k in h['tk']:
            v = L[k]
            khac = [L[j] for j in h['tk'] if j != k]
            xo = np.concatenate([o['X'] for o in khac]); yo = np.concatenate([o['Y'] for o in khac])
            v['wx'] = float(stats.wasserstein_distance(v['X'], xo))
            v['ksx_d'], v['ksx_p'] = [float(a) for a in stats.ks_2samp(v['X'], xo)]
            v['wy'] = float(stats.wasserstein_distance(v['Y'], yo))
            v['ksy_d'], v['ksy_p'] = [float(a) for a in stats.ks_2samp(v['Y'], yo)]

    # --- dấu hiệu D1–D7 (FDR theo từng loại, toàn trường trong kỳ)
    ds_lop = list(L.values())
    for key, tenq in (('i7_p', 'i7_q'), ('ksx_p', 'ksx_q'), ('p_fisher', 'fisher_q'), ('i8_p', 'i8_q')):
        qs = bh([v.get(key) for v in ds_lop])
        for v, q in zip(ds_lop, qs):
            v[tenq] = q
    q0 = ts['fdr_q']
    r_hp = {}
    for goc, h in hp_kq.items():
        if h['tk']:
            x = np.concatenate([L[k]['X'] for k in h['tk']]); y = np.concatenate([L[k]['Y'] for k in h['tk']])
            r_hp[goc] = _tq(x, y)
    for v in ds_lop:
        dh = []
        sig = lambda q: q is not None and q < q0
        if v['tk']:
            if v.get('i7') is not None and sig(v.get('i7_q')):
                if v['i7'] >= ts['d1_d2_lech_x']:
                    dh.append('D1')
                elif v['i7'] <= -ts['d1_d2_lech_x']:
                    dh.append('D2')
            rh = r_hp.get(v['goc'], (None,))[0]
            if v.get('r') is not None and rh is not None and v['r'] < ts['d3_r_lop'] and rh >= ts['d3_r_hp'] and v['r_hi'] < rh:
                dh.append('D3')
            if v.get('wx') is not None and v['wx'] >= ts['d4_wasserstein'] and sig(v.get('ksx_q')):
                dh.append('D4')
            if v.get('i8') is not None and sig(v.get('i8_q')):
                if v['i8'] >= ts['d6_d7_lech_y']:
                    dh.append('D6')
                elif v['i8'] <= -ts['d6_d7_lech_y']:
                    dh.append('D7')
        if v.get('i1_khac') is not None and v['i1'] - v['i1_khac'] >= ts['d5_chenh_mat_tu_cach'] and sig(v.get('fisher_q')):
            dh.insert(sum(d < 'D5' for d in dh), 'D5')
        v['dh'] = dh

    # --- cấp học phần: I9, H1–H5
    hp_out = []
    for goc, h in hp_kq.items():
        tk = h['tk']
        info0 = max((L[k]['info'] for k in h['ks']), key=lambda i: (i['ma_hp'] == goc, i['si_so']))
        rec = {'ma': goc, 'ten': info0['ten_hp'], 'bm': info0['ma_bm'], 'khoa': info0['ma_khoa'],
               'ds_ma': sorted({L[k]['info']['ma_hp'] for k in h['ks']}),
               'so_lop': len(h['ks']), 'so_lop_tk': len(tk), 'du_dk': h['du_dk'],
               'n_diem': sum(L[k]['n_diem'] for k in h['ks']), 'n_p': sum(L[k]['n_p'] for k in tk),
               'hai_he': len({L[k]['info']['he'] for k in h['ks']}) > 1, 'du_dk_i1': h['du_dk_i1']}
        if h['tk_i1']:
            rec['i1'] = sum(L[k]['n_mat'] for k in h['tk_i1']) / sum(L[k]['n_diem'] for k in h['tk_i1'])
        if tk:
            yy = np.concatenate([L[k]['Y'] for k in tk])
            rec['n_f'] = sum(L[k]['n_f'] for k in tk)
            rec['i2'] = rec['n_f'] / max(1, rec['n_p'])
            rec['r'] = r_hp[goc][0]
            rec['r_lo'], rec['r_hi'] = r_hp[goc][2:]
            rec['i2_lo'] = wilson_duoi(rec['n_f'], rec['n_p'], zc)
            rec['i2_hi'] = wilson_tren(rec['n_f'], rec['n_p'], zc)
            rec['y_tb'], rec['y_sd'] = float(yy.mean()), float(np.std(yy, ddof=1)) if len(yy) > 1 else 0.0
            rec['x_tb'] = float(np.concatenate([L[k]['X'] for k in tk]).mean())
            nl = np.concatenate([L[k]['NL'] for k in tk])
            rec['ty_le_khong_nl'] = float(np.isnan(nl).mean())
        for nhan, pre in (('mx', 'x'), ('my', 'y')):
            m = h.get(nhan)
            if m:
                us = [u for u, _ in m['u'].values()]
                rec['tau_' + pre], rec['icc_' + pre], rec['p_' + pre] = m['tau'], m['icc'], m['p_f']
                rec['icc_tren_' + pre] = m['icc_tren']
                rec['chenh_' + pre] = max(us) - min(us) if us else None
                rec['dp_' + pre] = m['du_phong']
        if h['du_dk_i1']:
            ti1 = h['tk_i1']
            rec['p_h4'] = _chi2_lop([L[k]['n_mat'] for k in ti1], [L[k]['n_p'] for k in ti1], rng)
            i1s = [L[k]['i1'] for k in ti1]
            rec['chenh_i1'] = max(i1s) - min(i1s)
            rec['chenh_i1_tren'] = _chenh_i1_tren([L[k]['n_mat'] for k in ti1], [L[k]['n_diem'] for k in ti1], ts['muc_tin_cay'])
        hp_out.append(rec)

    for key, tenq in (('p_x', 'q_x'), ('p_y', 'q_y'), ('p_h4', 'q_h4')):
        for rec, q in zip(hp_out, bh([r.get(key) for r in hp_out])):
            rec[tenq] = q
    for rec in hp_out:
        co = []
        sig = lambda q: q is not None and q < q0
        if sig(rec.get('q_x')) and (rec.get('icc_x', 0) >= ts['h1_icc_x'] or (rec.get('chenh_x') or 0) >= ts['h1_khoang_tan_x']):
            co.append('H1')
        if sig(rec.get('q_y')) and (rec.get('icc_y', 0) >= ts['h2_icc_y'] or (rec.get('chenh_y') or 0) >= ts['h2_khoang_tan_y']):
            co.append('H2')
        if rec.get('r') is not None and rec.get('r_hi') is not None and rec['r_hi'] < ts['h3_r_hp']:
            co.append('H3')
        if sig(rec.get('q_h4')) and rec.get('chenh_i1', 0) >= ts['h4_chenh_mat_tu_cach']:
            co.append('H4')
        if rec.get('n_p') and rec['i2_lo'] >= ts['h5_ty_le_f']:   # so với kỳ trước của chính học phần: xem lien_ky
            co.append('H5')
            rec['h5_ly_do'] = 'muc'
        rec['co'] = co

    # --- xuất cấp lớp
    lop_out = []
    for (ma, nhom), v in L.items():
        info = v['info']
        o = {'ma': ma, 'goc': v['goc'], 'nhom': nhom, 'ten': info['ten_hp'], 'gv': info['giang_vien'],
             'email': info['email'], 'bm': info['ma_bm'], 'khoa': info['ma_khoa'], 'tc': info['tc'],
             'si_so': info['si_so'], 'n_diem': v['n_diem'], 'n_p': v['n_p'], 'n_mat': v['n_mat'],
             'tk': v['tk'], 'tct': v['tk'] and v['tct'], 'tk_i1': v['tk_i1'], 'he': info['he'], 'i1': v['i1'], 'dh': v['dh'], 'co': info['co']}
        if v['tk']:
            o['x_tb'], o['y_tb'] = float(v['X'].mean()), float(v['Y'].mean())
            o['x_sd'], o['y_sd'] = float(np.std(v['X'], ddof=1)), float(np.std(v['Y'], ddof=1))
        for f in ('i2', 'i5', 'i5_lo', 'i5_hi', 'i5_sd', 'r', 'rho', 'r_lo', 'r_hi',
                  'i7', 'i7_se', 'i7_lo', 'i7_hi', 'i7_p', 'i7_q', 'i7_dp',
                  'i8', 'i8_se', 'i8_lo', 'i8_hi', 'i8_p', 'i8_q', 'i8_dp',
                  'wx', 'ksx_d', 'ksx_p', 'ksx_q', 'wy', 'ksy_d', 'ksy_p', 'i1_khac', 'p_fisher', 'fisher_q'):
            if f in v:
                o[f] = v[f]
        lop_out.append({k: _r(val) for k, val in o.items()})
    hp_out = [{k: _r(val) for k, val in r.items()} for r in hp_out]

    # --- tổng hợp toàn trường và độ phủ
    tk_all = [v for v in L.values() if v['tk']]
    p_all = sum(v['n_p'] for v in tk_all)
    d_all = np.concatenate([v['X'] - v['Y'] for v in tk_all]) if tk_all else np.array([])
    rs = [v['r'] for v in tk_all if v.get('r') is not None]
    nl_all = np.concatenate([v['NL'] for v in tk_all]) if tk_all else np.array([])
    tong = {
        'so_hp': len(hp_out), 'so_lop': len(L), 'so_lop_tk': len(tk_all),
        'luot_sv': sum(v['n_diem'] for v in L.values()),
        'q1': len(L) - len(tk_all), 'q2': sum(1 for r in hp_out if not r['du_dk']),
        'q3': _r(float(np.isnan(nl_all).mean())) if len(nl_all) else None,
        'q1_mat_tc': sum(1 for v in L.values() if v['tk_i1'] and not v['tk']),
        'i1': _r(sum(v['n_mat'] for v in L.values() if v['tk_i1']) / max(1, sum(v['n_diem'] for v in L.values() if v['tk_i1']))),
        'i2': _r(sum(v['n_f'] for v in tk_all) / max(1, p_all)),
        'i5': _r(float(d_all.mean())) if len(d_all) else None,
        'i6': _r(float(np.median(rs))) if rs else None,
        'so_hp_co': sum(1 for r in hp_out if r['co']),
        'du_phong_ols': sum(1 for r in hp_out if r.get('dp_x')),
        'i9': gop_i9(hp_out),
    }
    # tương quan NL–Y của kỳ (D-N5)
    yv = np.concatenate([v['Y'] for v in tk_all]) if tk_all else np.array([])
    m = np.isfinite(nl_all)
    tong['r_nl_y'] = _r(float(np.corrcoef(nl_all[m], yv[m])[0, 1])) if m.sum() > 3 else None
    return {'tong': tong, 'hp': hp_out, 'lop': lop_out}
