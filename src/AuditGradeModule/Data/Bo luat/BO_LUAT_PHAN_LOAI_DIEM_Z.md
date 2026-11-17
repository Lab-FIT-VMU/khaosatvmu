# Bộ luật C – Quy đổi điểm Z (thang 10 → thang 4 → điểm chữ) và xếp loại

**Căn cứ:** Quy chế đào tạo trình độ đại học, ban hành kèm Quyết định số **1409/QĐ-ĐHHHVN ngày 03/6/2025** của Hiệu trưởng Trường ĐH Hàng hải Việt Nam (áp dụng cho các chương trình đào tạo trình độ đại học **từ khóa 62**, thay thế Quy chế ban hành kèm QĐ 16/QĐ-ĐHHHVN-ĐT ngày 04/01/2024). Điều khoản: Điều 14 (thang điểm), Điều 15–16 (tính điểm học phần), Điều 19 (điểm đặc biệt), Điều 24 (TBC), Điều 25 (xếp hạng học lực), Điều 35 (hạng tốt nghiệp).
Bản đã đọc: https://daotao.vimaru.edu.vn/sites/daotao.vimaru.edu.vn/files/vanbanbieumau/1409_03.6.2025_Quy%20ch%E1%BA%BF%20%C4%91%C3%A0o%20t%E1%BA%A1o%20tr%C3%ACnh%20%C4%91%E1%BB%99%20%C4%90H%202025.pdf

## 1. Quy đổi điểm học phần Z (Điều 14.1)

Z đã làm tròn 1 chữ số thập phân (đúng Bộ luật A), sau đó tra bảng:

| Z (thang 10) | Điểm chữ | Thang 4 | Kết quả |
|---|---|---|---|
| 9,0 ÷ 10,0 | A+ | 4,0 | Đạt |
| 8,5 ÷ 8,9 | A | 4,0 | Đạt |
| 8,0 ÷ 8,4 | B+ | 3,5 | Đạt |
| 7,0 ÷ 7,9 | B | 3,0 | Đạt |
| 6,5 ÷ 6,9 | C+ | 2,5 | Đạt |
| 5,5 ÷ 6,4 | C | 2,0 | Đạt |
| 5,0 ÷ 5,4 | D+ | 1,5 | Đạt |
| 4,0 ÷ 4,9 | D | 1,0 | Đạt |
| 0 ÷ 3,9 | F | 0 | Không đạt |

- Các mức biên dùng so sánh trên Z **đã làm tròn** (VD Z = 8,5 → A, không phải B+). Vì Z chỉ có 1 chữ số thập phân nên bảng không có khoảng hở.
- **Điểm ≥ D (Z ≥ 4,0) là đạt học phần.** Với dữ liệu hiện tại: Z ≠ 0 thì luôn ≥ 4,0 (cần X ≥ 4 và Y ≥ 4), nên mọi Z ≥ 4 đều có chữ D trở lên; Z = 0 (Mất TC, Y < 4, vắng thi) → **F**.
- Chương trình tiên tiến dùng thang 100 và bảng riêng có A-, B-, … (Điều 14.2); dữ liệu hiện tại là thang 10 nên **không áp dụng**.

## 2. Phân biệt cấp áp dụng (quan trọng)

| Cấp | Dùng gì | Ghi chú |
|---|---|---|
| **Một học phần / một lớp học phần** | Điểm chữ (A+…F) và điểm thang 4 | Quy chế **không** định nghĩa "xuất sắc/giỏi/khá" cho từng học phần. |
| **Sinh viên (TBCHK, TBCTL)** | Xếp hạng học lực theo bảng mục 3 | Tính theo thang 4, **có trọng số tín chỉ** (Điều 24). |

Nên thống kê một lớp học phần theo **phân bố điểm chữ** (A+, A, B+, B, C+, C, D+, D, F) và có thể gộp nhóm do người dùng quy ước (xem mục 5). Chỉ gọi "Xuất sắc/Giỏi/…" cho điểm trung bình của sinh viên.

## 3. Xếp hạng học lực của sinh viên (Điều 25.3) – theo điểm TBC tích lũy (thang 4)

| Xếp loại | Điểm TBC |
|---|---|
| Xuất sắc | 3,60 ÷ 4,00 |
| Giỏi | 3,20 ÷ 3,59 |
| Khá | 2,50 ÷ 3,19 |
| Trung bình | 2,00 ÷ 2,49 |
| Yếu | 1,00 ÷ 1,99 |
| Kém | < 1,00 |

Hạng tốt nghiệp (Điều 35): Xuất sắc 3,60–4,00; Giỏi 3,20–3,59; Khá 2,50–3,19; Trung bình 2,00–2,49 (hạng Xuất sắc/Giỏi có thể bị hạ một mức vì học lại > 5% tín chỉ hoặc bị kỷ luật; **ngoài phạm vi phân hệ thống kê điểm kỳ**).

## 4. Điểm trung bình chung học kỳ (TBCHK) – Điều 24

`TBCHK = Σ(Vi · ni) / Σ ni`, Vi = điểm thang 4 của học phần i, ni = số tín chỉ, làm tròn **2 chữ số thập phân**.
- TBCHK tính **cả học phần điểm F** và các điểm khác, kể cả học lại/cải thiện.
- TBCTL chỉ tính học phần từ D trở lên và không tính F (cần dữ liệu nhiều kỳ, chưa dùng trong thống kê một kỳ).
- Số tín chỉ ni lấy từ cột `TCHT` của file lớp (đây là lý do cần ghép hai file).
- Học phần GDTC, GDQP-AN chỉ đánh giá Đạt/Không đạt và không tính vào điểm tích lũy (khớp việc loại 24xxx, 27xxx).

## 5. Quy ước thống kê đề xuất cho mỗi lớp học phần

1. Mỗi dòng điểm sau tiền xử lý (A + B) tính `diem_chu` và `diem_he4` theo bảng mục 1.
2. Đếm số SV theo từng điểm chữ; số SV Đạt (Z ≥ 4,0) và Không đạt (F), trong đó tách F do **Mất TC** (X = 0) và F do **thi < 4** (Y < 4, X ≥ 4).
3. Điểm trung bình lớp (thang 10 và thang 4) tính trên Z của các SV trong lớp; có thể kèm điểm TB chỉ trên SV Đạt.
4. Nhóm gộp "Giỏi/Khá…" cho một lớp là **quy ước của người dùng**, không phải quy chế. Đề xuất mặc định dùng cùng ngưỡng thang 4 của mục 3 áp lên điểm thang 4 của học phần: ≥ 3,6 Xuất sắc (A+, A); ≥ 3,2 Giỏi (B+); ≥ 2,5 Khá (B, C+); ≥ 2,0 Trung bình (C); ≥ 1,0 Yếu (D+, D); còn lại Kém (F). **Đã chốt (2026-10-25):** dùng ngưỡng này để thống kê nhóm Xuất sắc/Giỏi/Khá/Trung bình/Yếu/Kém cho mỗi lớp học phần, kèm phân bố điểm chữ. Ngưỡng so sánh trên điểm thang 4 của học phần (A+, A = 4,0; B+ = 3,5; B = 3,0; C+ = 2,5; C = 2,0; D+ = 1,5; D = 1,0; F = 0) nên thực tế: A+/A → Xuất sắc; B+ → Giỏi; B, C+ → Khá; C → Trung bình; D+, D → Yếu; F → Kém.
5. **TBCHK từng sinh viên** (đã chốt tính): theo mục 4, trên các lớp còn lại sau tiền xử lý A + B (mỗi dòng có điểm thang 4 và `TCHT` của lớp). Học phần của lớp thiếu trong file lớp bị bỏ theo B-G1 (hạn hữu, do lỗi xuất dữ liệu nên không xử lý bù); SV có học phần bị bỏ vẫn được tính TBCHK trên các học phần còn lại. Xếp hạng học lực theo TBCHK dùng bảng mục 3 (chỉ ghi nhận là xếp loại theo học kỳ, không phải theo TBCTL).

## 6. Điểm lưu ý khi đối chiếu với dữ liệu

- **Mất TC = điểm F.** Điều 19.1: X = 0 (không đủ điều kiện dự thi) là "Không đạt", nhận F và phải học lại.
- **Chương trình đại học nâng cao (mã đuôi H, Điều 16):** `Z = k1·Z1 + k2·Z2 + k3·Z3 + 0,5·Z4`, với k1 + k2 + k3 = 0,5 do bộ môn đề xuất từng học phần; Z4 là điểm cuối học phần. Điều này khác Bộ luật A (X = trung bình cộng các điểm thành phần). Người dùng đã chốt dùng cách tự tính X (trung bình cộng) cho thống kê, nên Z có thể lệch `f_tbcht` gốc ở lớp H (Bộ luật A mục 6 ghi nhận ~2,4% dòng lệch, chủ yếu CLC; chưa kiểm tra nguyên nhân từng dòng). Ngưỡng điểm chữ vẫn áp theo Z do ta tính.
- **Học phần loại II (Z = Y) và loại III (Z = X)** (Điều 3, 15): dữ liệu điểm không cho biết loại học phần; Bộ luật A coi mọi học phần có X là loại I (Z = 0,5X + 0,5Y). Học phần loại II (không có X) bị loại ở L7; học phần loại III (Z = X, không có Y) vẫn qua L7 nhưng Y = 0 sẽ làm Z sai theo Bộ luật A. Chưa kiểm tra xem dữ liệu có học phần loại III không.
- **Điểm ghi chú:** `M` (miễn thi, thưởng điểm – Điều 19.2) và `K` giữ như Bộ luật A (K bỏ qua, M bị loại ở L2).
- **Phạm vi hiệu lực:** quy chế 2025 áp dụng từ khóa 62; SV khóa cũ hơn có thể theo quy chế 2021/2024. Đã không kiểm tra văn bản 2021/2024; bảng 10→4 trên khớp với bảng đã thấy ở trang Công tác sinh viên của trường (A 8,5–8,9 = 4,0; B+ 8,0–8,4 = 3,5).

## 7. Điểm còn mở

- **E1 (đã chốt):** dùng ngưỡng thang 4 để nhóm theo lớp học phần (mục 5.4).
- **E2:** Cần Phòng đào tạo xác nhận SV khóa trước 62 trong dữ liệu 2024-25, 2025-26 (nếu có) vẫn dùng cùng bảng quy đổi.
- **E3 (đã chốt):** tính TBCHK từng sinh viên (mục 5.5); thiếu dữ liệu lớp là hạn hữu, không cần bù.
- **E4:** Xếp hạng học lực chính thức dùng TBCTL (toàn khóa), mà dữ liệu hiện chỉ có từng kỳ; vì vậy xếp loại theo TBCHK chỉ mang tính tham khảo theo kỳ.
