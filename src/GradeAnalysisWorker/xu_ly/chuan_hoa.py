"""Hàm chuẩn hóa dùng chung cho bộ luật A và B."""
import re
import unicodedata
from decimal import Decimal, ROUND_HALF_UP

# Học kỳ phụ mang mã P (khaosatvmu có Học kỳ phụ đứng đầu năm học, trước HK1).
RE_KY = re.compile(r'^(\d{2})(\d{2})_HK([12P])$')


def van_ban(s):
    """NFC, Ð -> Đ, cắt và gộp khoảng trắng (A-N4, B-N4)."""
    if s is None:
        return None
    s = unicodedata.normalize('NFC', str(s)).replace('Ð', 'Đ')
    return re.sub(r'\s+', ' ', s).strip()


def so(x):
    """Ô rỗng -> None; chuỗi dấu phẩy -> float (A-N2)."""
    if x is None:
        return None
    if isinstance(x, str):
        x = x.strip()
        if not x:
            return None
        return float(x.replace(',', '.'))
    return float(x)


def so_nguyen(x):
    v = so(x)
    return None if v is None else int(round(v))


def lam_tron(v):
    """Half-up 1 chữ số thập phân (A mục 3.5)."""
    return float(Decimal(str(round(v, 6))).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))


def ma_hp(x):
    """Mã HP về chuỗi in hoa, bỏ '.0' nếu Excel lưu dạng số."""
    if x is None:
        return None
    if isinstance(x, float) and x.is_integer():
        x = int(x)
    return van_ban(x).upper()


def ma_goc(ma):
    """D-L3: bỏ đuôi H/E để gộp lớp CLC với học phần gốc."""
    return ma[:-1] if ma and ma[-1] in 'HE' and len(ma) > 5 else ma


def kiem_tra_ma_ky(ky):
    """'2425_HK1' -> f_nhhk '242512'. Báo lỗi nếu sai dạng. Học kỳ phụ không có mã f_nhhk."""
    m = RE_KY.match(ky or '')
    if not m or m.group(3) == 'P':
        raise ValueError('Mã học kỳ phải có dạng NNNN_HKx, ví dụ 2425_HK1')
    return f'{m.group(1)}{m.group(2)}' + ('12' if m.group(3) == '1' else '21')


def _ten_hk(hk):
    return 'HK phụ' if hk == 'P' else f'HK{hk}'


def nhan_ky(ky):
    m = RE_KY.match(ky)
    return f'{_ten_hk(m.group(3))} 20{m.group(1)}–20{m.group(2)}'


def nhan_ky_ngan(ky):
    m = RE_KY.match(ky)
    return f'{_ten_hk(m.group(3))} {m.group(1)}–{m.group(2)}'


# Thứ tự trong năm học theo CSDL khaosatvmu: Học kỳ phụ → HK1 → HK2.
_VI_TRI_TRONG_NAM = {'P': 0, '1': 1, '2': 2}


def thu_tu_ky(ky):
    m = RE_KY.match(ky)
    return (int(m.group(1)), _VI_TRI_TRONG_NAM[m.group(3)])


def stt_ky(ky):
    """Số thứ tự của kỳ theo lịch, đếm theo kỳ chính: HK1 và HK2 liền nhau cách nhau 1.

    Học kỳ phụ nằm giữa HK2 năm trước và HK1 năm nó thuộc (cách mỗi bên 0,5), nên cửa sổ
    G1 "g1_cua_so_ky kỳ gần nhất" vẫn mang nghĩa số kỳ chính: 4 kỳ = trọn 2 năm học, gồm cả
    học kỳ phụ đầu mỗi năm học đó.
    """
    m = RE_KY.match(ky)
    nam, hk = int(m.group(1)), m.group(3)
    return nam * 2 + {'P': -0.5, '1': 0, '2': 1}[hk]
