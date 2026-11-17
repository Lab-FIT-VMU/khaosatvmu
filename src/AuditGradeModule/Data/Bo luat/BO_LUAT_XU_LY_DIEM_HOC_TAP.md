# Bộ luật xử lý file "Điểm học tập của SV theo kỳ"

Áp dụng cho mỗi file nhập vào (1 file = 1 học kỳ). Nguồn: `Du lieu/Diem hoc tap cua SV theo ky/{2425_HK1,2425_HK2,2526_HK1,2526_HK2}.xlsx`.
Mỗi dòng gốc = 1 SV × 1 môn × 1 lớp tín chỉ. Cài đặt tham chiếu: `xu_ly_diem.py` (cùng thư mục).

## 1. Chuẩn hóa đầu vào (làm trước mọi luật khác)

| # | Luật |
|---|---|
| N1 | Tên cột không phân biệt hoa/thường (`F_MASV` = `f_masv`). Cột gốc: `f_nhhk, f_masv, f_tensv, f_tenlop, f_mamh, f_tenmh, f_diem1, f_diem2, f_diem3, f_diemthi, f_tbcht, f_namhoc, f_hocky, f_dot, f_ghichu, f_loptc`. |
| N2 | Điểm có thể lưu dạng chuỗi dấu phẩy (`'5,7'`, gặp ở 2425_HK1) → đổi `,` thành `.` rồi ép sang số. Ô rỗng = không có điểm (None). |
| N3 | `f_mamh`, `f_masv`: ép về chuỗi/số nhất quán (mã có thể là số `27203` hoặc chuỗi `15216H`). |
| N4 | Văn bản: Unicode NFC, thay `Ð` (U+00D0) bằng `Đ` (U+0110), cắt khoảng trắng đầu/cuối (tên môn, tên lớp, ghi chú, lớp TC). |
| N5 | `f_nhhk`: đuôi `12` = HK1, đuôi `21` = HK2 (VD 242512 = 2024-25 HK1). Dùng tên file/`f_nhhk` làm mã kỳ. |

## 2. Luật loại dòng (theo thứ tự, dòng bị loại ở luật nào thì dừng)

| # | Loại bỏ nếu | Lý do |
|---|---|---|
| L1 | `f_diemthi = -1` | Môn thể chất, không xét. |
| L2 | `f_ghichu = M` | Miễn. |
| L3 | `f_ghichu = B` | Bảo lưu (có điểm Z mà không có X, Y). **Chú ý:** `B` = bảo lưu, khác `BS` = bổ sung. |
| L4 | Mã môn bắt đầu `24` (24100, 24102, 24103, 24203, 24204…) | Quân sự – quốc phòng. |
| L5 | Mã môn dạng `27xxx` (5 chữ số, bắt đầu 27) | Thể chất còn sót (không có -1). |
| L6 | Tên môn (không phân biệt hoa/thường) chứa `thực tập` hoặc `tốt nghiệp` | Thực tập, khóa luận/đồ án tốt nghiệp. (Đồ án khác không chứa "tốt nghiệp" thì giữ nếu có X.) |
| L7 | Cả `f_diem1`, `f_diem2`, `f_diem3` đều rỗng | Môn không có điểm quá trình (không có X). |
| L8 | Mã môn bắt đầu `179` (kể cả đuôi H/E) | Bộ môn thực tập/đồ án tốt nghiệp; đồng bộ với Bộ luật B (B-L4). Thêm sau khi chốt ngày 2026-10-25, chưa chạy lại số liệu mục 7. |

Các môn bị loại bởi L1–L8 không dùng cho thống kê. Nên lưu số lượng dòng bị loại theo từng luật để báo cáo/đối soát.

## 3. Tính điểm

Hệ môn: **CLC** nếu mã môn kết thúc bằng `H` hoặc `E`, hoặc dòng có `f_diem2`/`f_diem3`; ngược lại **Đại trà**. (Trong dữ liệu hiện tại hai cách xác định cho cùng kết quả.)

1. **X (điểm quá trình)** = trung bình cộng của các điểm thành phần *đang có* trong (`diem1`, `diem2`, `diem3`). Hệ đại trà chỉ có `diem1` nên X = `diem1`. Thiếu điểm thành phần thì không tính là 0, chỉ lấy trung bình trên các điểm có.
2. **Cấm thi theo điểm:** nếu *bất kỳ* điểm thành phần nào (có giá trị) **< 4** → **X = 0** (không phải 4). Áp dụng cho cả hai hệ:
   - CLC: chỉ cần 1 trong `diem1/2/3` < 4.
   - Đại trà: chỉ có `diem1`, X = `diem1` nếu `diem1 ≥ 4`; nếu `diem1 < 4` thì X = 0.
3. **Y (điểm thi)** = `f_diemthi`.
   - `X = 0` → **Y = 0**.
   - `f_ghichu = V` (vắng thi) → **Y = 0**.
4. **Z (điểm học phần)** = `0.5·X + 0.5·Y`; nếu **Y < 4** thì **Z = 0**.
5. **Làm tròn:** X và Z làm tròn 1 chữ số thập phân, kiểu half-up (6.25 → 6.3). Không dùng làm tròn banker của Python `round`.
6. **Không dùng `f_tbcht`** để tính. Chỉ giữ làm cột đối chiếu.
7. **Ghi chú `K` được bỏ qua** (không ép X, Y). Việc X = 0 chỉ do luật 2. `K` có thể xuất hiện cả khi mọi điểm thành phần ≥ 4 (lý do ngoài điểm), khi đó X giữ nguyên giá trị thật.

Các mã ghi chú còn lại (xử lý như dòng thường): `PK` = phúc khảo (`f_diemthi` đã là điểm sau PK), `BS` = bổ sung (phải có X và Y), `P` = vắng thi có phép, thi sau (vẫn có X).

## 4. Chống trùng

Khóa: (`f_masv`, `f_mamh`) **trong cùng một kỳ**, xét sau khi áp luật loại dòng và tính Y. Nếu có nhiều dòng, **giữ dòng có Y cao nhất**. (Không dùng `f_loptc` trong khóa.) Ghi nhận số dòng trùng bị bỏ.

## 5. Đầu ra chuẩn mỗi dòng

`ky, masv, tensv, lop, mamh, tenmh, he (CLC/DaiTra), X, Y, Z, ghichu, loptc, diem1, diem2, diem3, f_tbcht_goc`.

## 6. Kiểm tra sau xử lý (đã đúng với dữ liệu 4 kỳ, nên chạy lại với kỳ mới)

- Mọi dòng có điểm thành phần < 4 phải có Y = 0 và Z = 0 (dữ liệu gốc: 21.766/21.767 dòng thỏa; 1 ngoại lệ là SV 109199 môn 18201, 2425_HK1, vẫn được luật xử lý đúng).
- Không còn dòng nào có `f_diemthi = -1`, ghi chú M/B, mã 24xxx/27xxx.
- Không còn cặp (masv, mamh) trùng trong một kỳ.
- Z tính ra lệch `f_tbcht` gốc (>0.1) ở khoảng 2.4% dòng (chủ yếu CLC): chấp nhận, không sửa.
- Cảnh báo: dòng có `diem2/diem3` mà mã môn không có H/E; `f_tbcht` > 10 (6 dòng ở 2526_HK1, nghi nhập sai).

## 7. Kết quả tham chiếu (4 kỳ)

Dòng gốc 431.884 → còn 326.124 (2425_HK1: 81.605; 2425_HK2: 72.294; 2526_HK1: 89.624; 2526_HK2: 82.601). Bị loại: điểm -1: 29.068; M/B: 15.985; quân sự: 37.677; thể chất 27xxx: 42; thực tập/tốt nghiệp: 11.243; không có X: 11.639; trùng: 106.

## 8. Điểm còn mở

- **Đã chốt (2026-10-25):** X của lớp CLC dùng công thức tự tính (trung bình cộng) cho thống kê; ghi chú `K` bỏ qua; dòng điểm của lớp không có trong file lớp thì không đưa vào thống kê (xem B-G1 ở Bộ luật B). Phân loại Z (thang 10 → thang 4 → điểm chữ → xếp loại) chưa xây dựng, sẽ làm sau.
- (Ghi chú cũ) Công thức X của lớp CLC: dữ liệu `f_tbcht` gốc gợi ý có thể là trung bình có trọng số (VD 0.2·d1 + 0.8·d2 khi có 2 điểm), nhưng người dùng chỉ đạo dùng trung bình cộng. Nếu sau này có công thức chính thức, chỉ cần sửa hàm `tinh_x`.
- 6.651 dòng có điểm thành phần < 4 nhưng không ghi chú K, và 10 dòng K mà mọi điểm thành phần ≥ 4: chỉ ghi nhận, không xử lý riêng.
