"""Tạo file import danh sách sinh viên (Danh mục đào tạo → Sinh viên) từ file điểm theo kỳ.

Lọc sinh viên không trùng theo mã (f_masv, f_tensv, f_tenlop), mỗi khóa một sheet "Khóa NN".
Chạy: python scripts/tao_file_import_sinh_vien.py <file điểm .xlsx> <file đầu ra .xlsx>   (cần openpyxl)
"""
import re
import sys
import unicodedata
from collections import defaultdict

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill

SRC, OUT = sys.argv[1], sys.argv[2]
COLUMNS = ['Mã sinh viên', 'Họ và tên', 'Khoá ngành đào tạo', 'Ngày sinh', 'Giới tính', 'Email', 'Số điện thoại', 'Tình trạng học tập']
WIDTHS = [14, 30, 20, 12, 10, 30, 16, 20]
# Lớp hành chính chuẩn: chữ (mã ngành) + 2 số khóa + 2 chữ hệ (ĐH, CL...) + số thứ tự (ĐKT66ĐH, KTB64CL1).
CLASS = re.compile(r'^(\w*?[^\W\d_])(\d{2})[^\W\d_]{2}\d{0,2}$')


def text(value):
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    s = unicodedata.normalize('NFC', str(value)).replace('Ð', 'Đ')
    return re.sub(r'\s+', ' ', s).strip()


ws = openpyxl.load_workbook(SRC, read_only=True, data_only=True).worksheets[0]
rows = ws.iter_rows(values_only=True)
header = [text(h).lower() for h in next(rows)]
i_code, i_name, i_class = header.index('f_masv'), header.index('f_tensv'), header.index('f_tenlop')

students = {}
conflicts = 0
for r in rows:
    if r is None:
        continue
    code = text(r[i_code])
    if not code:
        continue
    record = (text(r[i_name]), text(r[i_class]).replace(' ', ''))
    if code in students and students[code] != record:
        conflicts += 1
        continue
    students.setdefault(code, record)

by_cohort = defaultdict(list)
for code, (name, klass) in students.items():
    m = CLASS.match(klass)
    by_cohort[m.group(2) if m else None].append((code, name, klass))

out = openpyxl.Workbook()
out.remove(out.active)
head_font, head_fill = Font(bold=True), PatternFill('solid', fgColor='FFE699')


def sort_key(code):
    return (len(code), code)


for cohort in sorted((c for c in by_cohort if c is not None), key=int) + ([None] if None in by_cohort else []):
    sheet = out.create_sheet(f'Khóa {cohort}' if cohort else 'Khác')
    sheet.append(COLUMNS)
    for cell in sheet[1]:
        cell.font, cell.fill = head_font, head_fill
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    for code, name, klass in sorted(by_cohort[cohort], key=lambda x: sort_key(x[0])):
        sheet.append([code, name, klass, None, None, None, None, None])
    for col, width in zip('ABCDEFGH', WIDTHS):
        sheet.column_dimensions[col].width = width
    for row in sheet.iter_rows(min_row=2, max_col=3):
        for cell in row:
            cell.number_format = '@'
    sheet.freeze_panes = 'A2'

guide = out.create_sheet('Huong dan')
for line in [
    'HƯỚNG DẪN NẠP DANH SÁCH SINH VIÊN',
    f'Tạo từ file điểm {SRC.replace(chr(92), "/").split("/")[-1]}: {len(students)} sinh viên, lọc không trùng theo mã sinh viên.',
    'Mỗi sheet là một khóa (theo 2 chữ số trong mã khoá ngành). Sheet "Khác": lớp không theo dạng chuẩn (ví dụ lớp liên kết IMET).',
    'Khoá ngành đào tạo (lớp hành chính) phải có sẵn ở trang Khoá ngành đào tạo; lớp chưa có sẽ bị bỏ qua và được liệt kê khi xem trước.',
    'Bắt buộc: Mã sinh viên, Họ và tên. Ngày sinh, giới tính, email, số điện thoại, tình trạng học tập: điền thêm nếu có; ô trống không xóa thông tin đang có.',
    'Nạp ở Danh mục đào tạo → Sinh viên → Nạp danh sách, chọn các sheet (khóa) cần nạp.',
]:
    guide.append([line])
guide.column_dimensions['A'].width = 120

out.save(OUT)
print('Sinh viên:', len(students), '| mâu thuẫn tên/lớp bỏ qua:', conflicts)
for cohort in sorted(by_cohort, key=lambda c: (c is None, int(c) if c else 0)):
    print(f'  {"Khóa " + cohort if cohort else "Khác"}: {len(by_cohort[cohort])}')
