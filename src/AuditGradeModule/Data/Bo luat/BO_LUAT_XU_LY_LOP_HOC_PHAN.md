# Bộ luật B – xử lý file "Danh sách các lớp học phần theo kỳ"

Áp dụng cho mỗi file nhập vào (1 file = 1 học kỳ), đi cặp với file điểm (xem `BO_LUAT_XU_LY_DIEM_HOC_TAP.md`, gọi là Bộ luật A).
Nguồn: `Du lieu/Danh sach cac lop hoc theo ky/HocKy{1,2}_{2425,2526}.xlsx`. Mỗi dòng gốc = 1 lớp học phần (1 mã HP × 1 nhóm).

## 0. Khái niệm

- **Lớp học phần** có khóa nội bộ **(mã HP, nhóm)**; nhãn hiển thị là **"Tên HP – Nhóm"** (VD "An ninh mạng – N01"). Hai mã khác nhau cùng tên + cùng nhóm (đại trà và đuôi H/E) thì thêm mã vào nhãn để không lẫn.
- **Sĩ số** = số SV đăng ký ban đầu. **Đạt TC** = số SV có X ≥ 4. **Mất TC** = số SV có X = 0. Lý thuyết: Đạt TC + Mất TC = sĩ số; thực tế có lớp vượt (xem mục 5).

## 1. Chuẩn hóa đầu vào

| # | Luật |
|---|---|
| B-N1 | Chỉ đọc sheet `Thongke` (sheet đầu); bỏ `Sheet2`, `Sheet`. Cột: `Mã HP, Học phần, Nhóm, TCHT, Sĩ số, Bộ môn, Khoa, Giảng viên, Email, Mã BM`. Tên cột không phân biệt hoa/thường. Bỏ dòng trống hoàn toàn. |
| B-N2 | Các cột `Bộ môn`, `Khoa`, `Mã BM` là công thức VLOOKUP nhưng Excel đã lưu sẵn kết quả: **đọc giá trị đã lưu** (SheetJS: trường `v`; openpyxl: `data_only=True`), không đọc công thức. Cột này là nguồn chính của bộ môn/khoa (xem B-T1). |
| B-N3 | `Mã HP`, `Nhóm`: ép về chuỗi, cắt khoảng trắng, mã viết hoa (`17540H`). `TCHT`, `Sĩ số`: ép số nguyên. |
| B-N4 | Văn bản (tên HP, giảng viên): Unicode NFC, thay `Ð` (U+00D0) bằng `Đ` (U+0110), cắt khoảng trắng đầu/cuối, gộp khoảng trắng liên tiếp. |
| B-N5 | Mã kỳ lấy từ tên file (`HocKy1_2425` → `242512`, `HocKy2_2425` → `242521`) để khớp `f_nhhk` của file điểm. |

## 2. Luật loại dòng (theo thứ tự)

| # | Loại bỏ nếu | Lý do |
|---|---|---|
| B-L1 | Mã HP bắt đầu `24` | Quân sự – quốc phòng (dữ liệu hiện tại: 0 dòng, giữ luật để dự phòng). |
| B-L2 | Mã HP dạng `27xxx` (5 chữ số) | Giáo dục thể chất. Hiện tại: 146 / 181 / 157 / 169 lớp (2425_HK1 / 2425_HK2 / 2526_HK1 / 2526_HK2). |
| B-L3 | Tên HP (không phân biệt hoa/thường) chứa `thực tập` hoặc `tốt nghiệp` | Giống L6 của Bộ luật A. Hiện tại: 0 dòng. |
| B-L4 | Mã HP bắt đầu `179` | Bộ môn thực tập/đồ án tốt nghiệp (đã chốt: loại theo mã, áp dụng cả Bộ luật A – luật L8). Hiện tại có ở 2425_HK1 (2 lớp: `17904H`, `17911H`) và 2425_HK2. |

Lưu số dòng bị loại theo từng luật để báo cáo. Luật loại phải **đồng bộ với Bộ luật A**: lớp bị loại ở file lớp thì dòng điểm cùng mã HP cũng phải bị loại (và ngược lại), nếu không sẽ phát sinh lớp "thiếu trong file lớp" giả.

## 3. Bổ sung thuộc tính (không loại dòng)

| # | Luật |
|---|---|
| B-T1 | **Bộ môn/khoa** (thứ tự ưu tiên):<br>1. Mã HP bắt đầu `121` → **luôn BM 122** (bỏ qua giá trị 123/126 trong file; không gắn cờ lệch vì thực tế phức tạp).<br>2. Ngược lại lấy `Mã BM`, `Bộ môn`, `Khoa` từ file (giá trị đã lưu).<br>3. File rỗng hoặc `#N/A` → suy từ mã HP: mã BM = 3 số trái, mã khoa = 2 số trái, gộp BM 194, 195 → 191, HP có BM 301 thuộc khoa Kinh tế VTB (mã 15); gắn cờ `BM_TU_MA_HP`. Tên BM/khoa tra từ `Ket qua/KhoaVien_BoMon_GiangVien.xlsx` (sheet `Bo_Mon`). Không tra được → cờ `BM_KHONG_XAC_DINH`.<br>Với các dòng còn lại, nếu Mã BM của file khác 3 số trái mã HP nhưng không thuộc cặp gộp đã biết (194/195→191, 121→122) thì gắn cờ `BM_LECH_MA_HP` để rà. |
| B-T2 | **Hệ**: CLC nếu mã HP kết thúc `H` hoặc `E` (đồng nhất Bộ luật A), ngược lại Đại trà. |
| B-T3 | **Tên HP chuẩn của mã** = tên ở file lớp (sau B-N4). Dùng để hiển thị; lớp chỉ có ở file điểm thì lấy `f_tenmh`. |

## 4. Chống trùng

Khóa: (mã HP, nhóm) trong cùng một kỳ. Dữ liệu hiện tại: 0 trùng ở cả 4 kỳ. Nếu gặp trùng: giữ dòng có sĩ số lớn hơn, ghi nhận số dòng bỏ và đưa vào báo cáo.

## 5. Ghép với file điểm (sau khi cả hai bên đã áp luật)

Khóa ghép: (`Mã HP`, `Nhóm`) ↔ (`f_mamh`, `f_loptc`). Với mỗi lớp tính từ file điểm sạch: số SV có điểm, **Đạt TC** (X ≥ 4), **Mất TC** (X = 0), số điểm Y/Z hợp lệ.

| # | Tình huống | Xử lý |
|---|---|---|
| B-G1 | Lớp có điểm nhưng không có trong file lớp (VD `25121`/`25122` Anh văn cơ bản 1/2, `28125 N01` ở 2425_HK1) | **Bỏ qua, không thống kê** (quyết định 2026-10-25, thay cho phương án giữ + gắn cờ): các dòng điểm này không vào cặp dữ liệu chuẩn. Chỉ ghi vào báo cáo đối soát: danh sách lớp (tên HP – nhóm) và số dòng điểm bị bỏ, cờ `THIEU_TRONG_FILE_LOP`. |
| B-G2 | Lớp trong file lớp nhưng không có dòng điểm nào (VD `12221 N01–N03`, `12221E N94`, `11216 N01–N02`) | **Giữ**, gắn cờ `CHUA_CO_DIEM`; số SV có điểm = 0. |
| B-G3 | Đạt TC + Mất TC > sĩ số | **Chỉ gắn cờ** `VUOT_SI_SO`, giữ nguyên sĩ số gốc, không sửa. Sơ bộ 2425_HK1: 40 / 1.810 lớp, thường hơn 1 SV. |
| B-G4 | Dòng điểm có nhóm rỗng | Đã bị loại ở Bộ luật A (toàn ghi chú `B`); nếu còn sót thì gắn cờ `NHOM_RONG`, không ghép. |

## 6. Đầu ra chuẩn mỗi lớp

`ky, ma_hp, ten_hp, nhom, nhan_hien_thi, he, so_tin_chi, si_so, giang_vien, email, ma_bm, ten_bm, ma_khoa, ten_khoa, so_sv_co_diem, dat_tc, mat_tc, co_bao_cao (danh sách cờ)`.

## 7. Kiểm tra sau xử lý

- Không còn mã `24xxx`, `27xxx`, `179xxx`, tên chứa thực tập/tốt nghiệp.
- Không còn cặp (mã HP, nhóm) trùng trong kỳ.
- Mọi lớp có mã BM tra được (hoặc cờ rõ ràng).
- Đối soát hai chiều với file điểm: số lớp THIEU_TRONG_FILE_LOP, CHUA_CO_DIEM, VUOT_SI_SO.
- Cảnh báo: sĩ số ≤ 0 hoặc bất thường (nhỏ nhất hiện có là 5–7), TCHT ngoài 1–5, giảng viên rỗng, tên HP cùng mã nhưng khác nhau giữa các nhóm.

## 8. Điểm còn mở

- **D1 (đã chốt):** loại mọi mã `179xxx` ở cả hai file (B-L4 và L8 của Bộ luật A), kể cả `17904H`, `17911H`.
- **D2:** Anh văn cơ bản 1/2 (`25121`, `25122`) không có trong file lớp 2425_HK1 dù file có 196 lớp mã 25xxx; cần hỏi Phòng đào tạo có file lớp bị thiếu không.
- **D3:** `TCHT` của lớp (số tín chỉ) chưa dùng để tính điểm trung bình tích lũy; chỉ lưu lại cho thống kê sau.
