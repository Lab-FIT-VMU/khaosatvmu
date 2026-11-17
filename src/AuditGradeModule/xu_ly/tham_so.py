"""Tham số của bộ luật D: mặc định đọc từ Data/Bo luat/tham_so_chi_so.json, bản đang dùng ở kho/tham_so.json."""
import json
from pathlib import Path

GOC = Path(__file__).resolve().parent.parent
MAC_DINH = GOC / 'Data' / 'Bo luat' / 'tham_so_chi_so.json'


def doc_mac_dinh():
    return json.loads(MAC_DINH.read_text(encoding='utf-8'))


def phang(cau_truc):
    """{nhóm: {tên: {gia_tri, mo_ta}}} -> {tên: giá trị} (bỏ nhóm màu sắc và ghi chú)."""
    kq = {}
    for nhom, ds in cau_truc.items():
        if nhom.startswith('_') or nhom == 'mau_sac':
            continue
        for ten, v in ds.items():
            kq[ten] = v['gia_tri']
    return kq


def kiem_tra(ts):
    """Trả về danh sách lỗi (chuỗi tiếng Việt) nếu bộ tham số không hợp lệ."""
    loi = []
    if ts['so_sv_toi_thieu_lop'] < 3:
        loi.append('Số sinh viên tối thiểu để đưa lớp vào thống kê phải từ 3 trở lên.')
    if ts['so_sv_tin_cay_thap'] <= ts['so_sv_toi_thieu_lop']:
        loi.append('Ngưỡng độ tin cậy thấp phải lớn hơn số sinh viên tối thiểu để đưa vào thống kê.')
    if ts['so_lop_toi_thieu_hp'] < 2:
        loi.append('Số lớp tối thiểu để so sánh trong học phần phải từ 2 trở lên.')
    if ts['nang_luc_nen_thang'] not in (4, 10):
        loi.append('Thang điểm tính năng lực nền chỉ nhận 4 hoặc 10.')
    for k in ('muc_tin_cay', 'fdr_q', 'h1_icc_x', 'h2_icc_y', 'h3_r_hp', 'h5_ty_le_f', 'd3_r_lop', 'd3_r_hp'):
        if not 0 < ts[k] < 1:
            loi.append(f'Tham số {k} phải nằm trong khoảng 0 đến 1.')
    if not 0 <= ts.get('vung_gan_0', 0.05) < 1:
        loi.append('Vùng gần 0 phải từ 0 đến dưới 1 điểm.')
    if ts.get('so_ky_cung_chieu', 3) < 2:
        loi.append('Số học kỳ cùng chiều tối thiểu phải từ 2 trở lên.')
    if ts.get('he_so_ty_le_f', 1.3) < 1:
        loi.append('Hệ số tỷ lệ F phải từ 1 trở lên.')
    if not 0 <= ts.get('h5_chenh_lich_su', 0.1) < 1:
        loi.append('Mức tăng tỷ lệ trượt so với các kỳ trước phải từ 0 đến dưới 1.')
    if not 0 < ts.get('g1_ty_le_ky', 0.5) <= 1:
        loi.append('Tỷ lệ số kỳ có đặc điểm phải trong khoảng trên 0 đến 1.')
    if ts.get('g1_cua_so_ky', 4) < ts['g1_so_ky_lap']:
        loi.append('Số học kỳ gần nhất được xét phải không nhỏ hơn số học kỳ lặp lại tối thiểu.')
    if ts['g1_so_ky_lap'] < 2:
        loi.append('Số học kỳ lặp lại tối thiểu phải từ 2 trở lên.')
    return loi
