# Bộ luật E – Gợi ý đọc hồ sơ một lớp (câu nhận xét tự động)

Áp dụng cho báo cáo **cấp bộ môn**. Từ các chỉ số đã tính theo Bộ luật D, hệ thống ghép sẵn các câu nhận xét cho **mỗi lớp được đưa vào thống kê**, theo 4 bước đọc. Câu nhận xét **không do AI viết khi xem**: mỗi câu là một **câu mẫu cố định** gắn với **một điều kiện** trên số liệu. Cùng số liệu luôn cho cùng câu; nạp thêm học kỳ hoặc đổi tham số thì câu tự cập nhật.

- Câu mẫu và điều kiện (máy đọc được): `mau_nhan_xet.json`.
- Ngưỡng: `tham_so_chi_so.json`, nhóm **`goi_y_ho_so`** (mới) và các nhóm của Bộ luật D.
- Cài đặt tham chiếu: `xu_ly/nhan_xet.py`; ví dụ kiểm tra: `tests/test_nhan_xet.py`.

## 0. Nguyên tắc

| # | Nguyên tắc |
|---|---|
| E-P1 | Nhận xét chỉ **mô tả hiện tượng** và **gợi ý câu hỏi trao đổi**; không kết luận, không đánh giá giảng viên (đồng bộ P2 của Bộ luật D). **Không có câu nào nói giảng viên chấm thế nào.** |
| E-P2 | Mọi điều kiện chỉ dùng chỉ số đã định nghĩa ở Bộ luật D (I1, I2, I5–I8, r, q-value sau FDR, G1) và tham số. Không thêm phép tính thống kê mới. |
| E-P3 | Nhận xét được tính **trong bộ xử lý** (Python) và lưu vào dữ liệu xuất; giao diện chỉ hiển thị. Ai xây lại giao diện vẫn có sẵn câu. |
| E-P4 | Thông tin qua các kỳ (bước 3) chỉ dùng các học kỳ **từ đầu kho đến học kỳ đang xem**, không dùng kỳ sau. |
| E-P5 | “Liên quan đến điểm lưu ý” (bước 1) chỉ để định hướng xem xét, **không phải** đặc điểm chính thức D1–D7. |
| E-P6 | Hệ thống thuần thống kê, trung tính: không khen, không chê. Dùng “điểm lưu ý” (của học phần), “đặc điểm” (của lớp), “điều chỉnh”, “diễn biến”; không dùng “cảnh báo”, “dấu hiệu”, “khắc phục”, “truy vết”, “bất thường”. Song song với điểm lưu ý luôn có chiều “ổn định, đồng đều” (mục 9). |

## 1. Tham số mới (nhóm `goi_y_ho_so`)

| Tham số | Mặc định | Dùng ở | Ý nghĩa |
|---|---|---|---|
| `vung_gan_0` | 0,05 | Bước 3 | Mức lệch điểm quá trình so với kỳ vọng trong khoảng ±0,05 điểm được coi là **gần 0** (không tính là dương hay âm). |
| `so_ky_cung_chieu` | 3 | Bước 3 (X3, X4), bước 4 (Q8) | Số học kỳ tối thiểu để nói về xu hướng, kèm điều kiện **khoảng tin cậy của trung bình các kỳ không chứa 0**. |
| `he_so_ty_le_f` | 1,3 | Bước 4 (Q7) | Tỷ lệ F do điểm thi của lớp cao hơn **1,3 lần** tỷ lệ của cả học phần… |
| `ty_le_f_toi_thieu` | 0,05 | Bước 4 (Q7) | …và đồng thời trên **5%**. |
| `ty_le_nguong_d5` | 0,5 | Bước 4 (Q6) | Gợi ý về mất tư cách khi tỷ lệ mất tư cách của lớp cao hơn các lớp khác ít nhất `ty_le_nguong_d5 × d5_chenh_mat_tu_cach` (mặc định 0,5 × 15 = 7,5 điểm %). |

## 2. Bước 1 – Lớp liên quan thế nào đến điểm lưu ý của học phần

Với mỗi điểm lưu ý H1–H6 **của học phần**, xác định các lớp liên quan:

| Điểm lưu ý | Lớp liên quan | Nếu không lớp nào đạt |
|---|---|---|
| H1 | Lớp có I7 với q(I7) < `fdr_q` (lệch có ý nghĩa thống kê), xếp theo \|I7\| giảm dần | Lớp có \|I7\| lớn nhất, kèm ghi chú “độ tản mát đến từ nhiều lớp cộng lại” |
| H2 | Như H1 với I8 | Như H1 với I8 |
| H3 | Lớp có r < `h3_r_hp`, xếp tăng dần | Lớp có r thấp nhất |
| H4 | Lớp có q(Fisher) < `fdr_q` và I1 > I1 các lớp khác | Lớp có I1 cao nhất |
| H5 | Lớp có I2 > I2 của cả học phần, xếp giảm dần | (không có) |
| H6 | Không gắn với lớp; ghi điểm thi trung bình kỳ này và kỳ trước | — |

Câu của bước 1 gồm: mỗi điểm lưu ý mà lớp liên quan → một câu; mỗi đặc điểm D1–D7 của lớp → một câu. Không có gì → câu “khong_co”.

## 3. Bước 2 – Số liệu của lớp so với cả học phần

Bảng 9 chỉ số (số SV đủ tư cách, I1, I2, X, Y, X − Y, r, I7, I8). Mỗi dòng: giá trị của lớp, giá trị của cả học phần (I7, I8 ghi “0 (mốc)”), khoảng thấp nhất – cao nhất của các lớp được thống kê, và **nhận xét** theo thứ tự ưu tiên:

1. Quy tắc riêng của chỉ số (ví dụ r < `h3_r_hp` → “thấp”; I7, I8 → “có / chưa có ý nghĩa thống kê”; số SV → “Ít sinh viên – đọc thận trọng” khi lớp có nhãn TIN_CAY_THAP).
2. Quy tắc chung: học phần có từ 3 lớp, giá trị của lớp bằng mức cao nhất → “cao nhất học phần”; bằng mức thấp nhất → “thấp nhất học phần”.

## 4. Bước 3 – Giảng viên qua các học kỳ

Cặp (giảng viên, học phần gốc), giảng viên xác định theo email (không có email thì theo tên). Với mỗi học kỳ từ đầu kho đến kỳ đang xem: giá trị = trung bình I7 các lớp của giảng viên trong kỳ.

Phân loại từng kỳ: **dương** nếu > `vung_gan_0`; **âm** nếu < −`vung_gan_0`; còn lại **gần 0**. Từ 2 kỳ, tính trung bình các kỳ và khoảng tin cậy t với n − 1 bậc tự do. **Có xu hướng** khi số kỳ ≥ `so_ky_cung_chieu` và khoảng này không chứa 0. Câu xu hướng chọn quy tắc đầu tiên thỏa:

| # | Điều kiện | Câu |
|---|---|---|
| X1 | Mới có 1 kỳ | “mới có 1 học kỳ, chưa xác định được xu hướng” |
| X2 | Không kỳ dương, không kỳ âm | “gần 0 ở cả n học kỳ (trong khoảng ±e điểm)” |
| X3 | Có xu hướng, trung bình dương | “[các kỳ]; trung bình các kỳ +m điểm (khoảng tin cậy từ a đến b) – có xu hướng cao hơn mức kỳ vọng qua các kỳ” |
| X4 | Có xu hướng, trung bình âm | “[các kỳ]; trung bình các kỳ −m điểm (khoảng tin cậy từ a đến b) – có xu hướng thấp hơn mức kỳ vọng qua các kỳ” |
| X5 | Còn lại | “[các kỳ] – chưa đủ căn cứ để nói về xu hướng” |

Trong đó [các kỳ] liệt kê “dương ở a/n học kỳ, âm ở b/n học kỳ, gần 0 ở g/n học kỳ”, bỏ phần bằng 0.

Trang **Truy vết** (bảng giảng viên qua các học kỳ) dùng **cùng quy tắc X1–X5 và cùng mẫu câu**, và cũng chỉ xét **đến học kỳ đang chọn** (E-P4); ô màu dùng cùng ngưỡng `vung_gan_0` (xám) và đậm dần đến `d1_d2_lech_x`.

Kèm: các đặc điểm D1–D7 đã xuất hiện (theo kỳ); trạng thái G1 (cùng đặc điểm ở ≥ `g1_so_ky_lap` kỳ trong `g1_cua_so_ky` kỳ gần nhất tính đến kỳ đang xem; ghi “đang tiếp diễn” nếu đặc điểm có xuất hiện ở kỳ đang xem, “đã ghi nhận trước đây” nếu không); các lớp khác của giảng viên ở cùng học phần trong kỳ.

## 5. Bước 4 – Câu hỏi gợi ý

Thêm câu khi điều kiện đúng, theo thứ tự:

| Mã | Điều kiện | Nội dung gợi ý |
|---|---|---|
| Q1 | I7 > 0 và q(I7) < `fdr_q` | Tiêu chí chấm điểm quá trình có rộng hơn chuẩn chung… |
| Q2 | I7 < 0 và q(I7) < `fdr_q` | Tiêu chí chấm có chặt hơn chuẩn chung… |
| Q3 | I8 < 0 và q(I8) < `fdr_q` | Vì sao sinh viên thi thấp hơn mức dự đoán… |
| Q4 | I8 > 0 và q(I8) < `fdr_q` | Lớp có cách dạy nào có thể chia sẻ… |
| Q5 | Cận trên khoảng tin cậy của r lớp < `h3_r_hp` | Điểm quá trình đang phản ánh điều gì… |
| Q6 | I1 − I1 các lớp khác ≥ `ty_le_nguong_d5` × `d5_chenh_mat_tu_cach` | Nguyên nhân mất tư cách… |
| Q7 | I2 > `he_so_ty_le_f` × I2 học phần và I2 > `ty_le_f_toi_thieu` | Sinh viên trượt tập trung ở nội dung nào… |
| Q8 | Giảng viên có xu hướng theo định nghĩa ở bước 3 (X3 hoặc X4) | Bộ môn có cần trao đổi lại rubric… |
| Q9 | Lớp có nhãn ít sinh viên – đọc thận trọng | Nên xem thêm các kỳ khác… |
| Q10 | Có ít nhất một câu Q1–Q9 | Lớp có đặc thù nào giải thích được… |
| Q11 | Không có câu Q1–Q9 | Chưa thấy khác biệt nổi bật; điều này chưa khẳng định lớp có cùng chuẩn đánh giá… |

Cuối bước 4 luôn có câu lưu ý (E-P1).

## 6. Dữ liệu xuất

Mỗi lớp được thống kê có thêm trường `hs` (hồ sơ): `b1` (danh sách câu), `b2` (các dòng bảng), `b3` (đoạn văn và chuỗi số liệu cho biểu đồ), `b4` (câu hỏi), `b4_ma` (mã câu hỏi), `luu_y`; và `gp_tag` (các điểm lưu ý mà lớp liên quan). Mỗi học phần có thêm `gp` (lớp liên quan theo từng điểm lưu ý).

## 7. Ví dụ kiểm tra (dữ liệu giả lập, tham số mặc định)

| # | Đầu vào | Kết quả mong đợi |
|---|---|---|
| T1 | Chuỗi I7 của giảng viên: −0,30; −0,25; −0,15; +0,01 | Khoảng tin cậy chứa 0: “âm ở 3/4 học kỳ, gần 0 ở 1/4 học kỳ – chưa đủ căn cứ để nói về xu hướng” |
| T2 | +0,22; +0,57; +0,68; +0,42 | “dương ở 4/4 học kỳ; trung bình các kỳ +0,47 điểm (khoảng tin cậy từ +0,16 đến +0,79) – có xu hướng cao hơn mức kỳ vọng qua các kỳ”; Q8 bật |
| T3 | Mọi chuỗi 2 kỳ | Không bao giờ có xu hướng: “… – chưa đủ căn cứ để nói về xu hướng” |
| T4 | Lớp N02, học phần 19201, HK1 2025–2026 | Bước 4 gồm Q1, Q3, Q7, Q10 |
| T5 | Lớp N01, học phần 11107, HK1 2025–2026 | Bước 1 là câu “khong_co”; bước 4 chỉ có Q11 |
| T6 | Lớp N06, học phần 19201, HK1 2025–2026 (giảng viên: +0,25; +0,32; +0,05 ở 3 kỳ) | Khoảng tin cậy chứa 0 nên không có Q8; bước 4 chỉ có Q11 |
| T7 | Mọi cặp giảng viên – học phần ở trang Diễn biến | Cùng mẫu câu với bước 3 |

## 8. Điểm còn mở

- Các câu gợi ý (bước 4) chưa phân biệt theo loại học phần (lý thuyết / thực hành); có thể bổ sung khi bộ luật D phân loại học phần.

## 9. Chiều “ổn định, đồng đều” (song song với điểm lưu ý)

Mỗi học phần, bên cạnh danh sách “Cần lưu ý”, có danh sách “Ổn định, đồng đều”. Mọi trạng thái đều cần **khoảng tin cậy nằm về phía ổn định của ngưỡng**. Học phần so sánh được, chưa có điểm lưu ý nhưng chưa đạt điều kiện được ghi **“chưa đủ căn cứ để kết luận”**. Học phần mà câu hỏi của dòng không áp dụng được thuộc nhóm **“không thể so sánh”** và không tính vào mẫu số của tỷ lệ:

| Mã | Tên | Điều kiện | Ngược với |
|---|---|---|---|
| O1 | Điểm quá trình đồng đều giữa các lớp | đủ điều kiện so sánh, không có H1, cận trên ICC_X < `h1_icc_x`, chênh û < `h1_khoang_tan_x` | H1 |
| O2 | Điểm thi đồng đều giữa các lớp | đủ điều kiện so sánh, không có H2, cận trên ICC_Y < `h2_icc_y`, chênh v̂ < `h2_khoang_tan_y` | H2 |
| O3 | Điểm quá trình khớp tốt với điểm thi | r của học phần ≥ `d3_r_hp`, cận dưới khoảng tin cậy của r ≥ `h3_r_hp` | H3 |
| O4 | Tỷ lệ mất tư cách đồng đều giữa các lớp | ≥ 2 lớp đủ D-Đ4, không có H4, cận trên của chênh I1 giữa hai lớp bất kỳ (Agresti–Caffo, hiệu chỉnh Bonferroni) < `h4_chenh_mat_tu_cach` | H4 |
| O5 | Tỷ lệ trượt do điểm thi ở mức thông thường | có sinh viên đủ tư cách, không có H5, cận trên Wilson của tỷ lệ trượt < `h5_ty_le_f` | H5 |
| O6 | Điểm thi ổn định so với lần mở gần nhất | có lần mở trước để so, không có H6, chênh Y tuyệt đối cộng biên khoảng tin cậy Welch < `h6_lech_y_giua_ky` | H6 |

Cấp giảng viên (trang Diễn biến): “Điểm quá trình gần mức kỳ vọng ở các kỳ đã dạy” khi chuỗi I7 có từ 2 kỳ và mọi kỳ nằm trong vùng gần 0 (±`vung_gan_0`). Đây là mô tả số liệu, không kết luận tương đương. Cấp lớp: D6 (điểm thi cao hơn kỳ vọng) được hiển thị nổi bật như đặc điểm đáng chia sẻ.
