# Bộ luật D – Chỉ số thống kê chất lượng lớp học phần và báo cáo 3 cấp

Áp dụng **sau** Bộ luật A (`BO_LUAT_XU_LY_DIEM_HOC_TAP.md`), Bộ luật B (`BO_LUAT_XU_LY_LOP_HOC_PHAN.md`) và Bộ luật C (`BO_LUAT_PHAN_LOAI_DIEM_Z.md`). Đầu vào là cặp dữ liệu chuẩn đã ghép: mỗi dòng điểm (ky, masv, mamh, loptc, X, Y, Z, ghichu) gắn với một lớp học phần (ky, ma_hp, nhom, giang_vien, ma_bm, ma_khoa, so_tin_chi, si_so).
Tham số mặc định: `tham_so_chi_so.json` (cùng thư mục). **Mọi ngưỡng trong bộ luật này là tham số, đọc từ file đó, không viết cứng trong mã.**

> **Phiên bản audit (01/11/2026).** Sửa theo phản biện và quyết định của người dùng: kiểm định F thay LRT chia đôi; O1–O6 đều cần khoảng tin cậy nằm về phía ổn định của ngưỡng, tách với "chưa đủ căn cứ để kết luận" và "không thể so sánh"; H3, D3 tính sai số; H5 so với chính học phần, bỏ phễu theo khoa; I1, H4, D5 xét theo số sinh viên có điểm; τ̂ = 0 thì mọi lớp có I7 = 0 và không kiểm định riêng; G1 thêm tỷ lệ số kỳ. Giữ nguyên theo quyết định của người dùng: mọi lớp cùng học phần thi cùng một đề trong kỳ; gộp CLC và đại trà, chỉ ghi chú; vắng thi là Y = 0.

## 0. Nguyên tắc (đã chốt với người dùng)

| # | Nguyên tắc |
|---|---|
| P1 | Bộ môn thống nhất đề cương và bộ đề thi chung từ đầu kỳ. GV dạy và chấm **X** của lớp mình. **Y** thi tập trung, chấm dọc phách hoặc máy chấm, GV không biết bài của SV nào → Y là **thước đo chung, khách quan**. Phần cần xem có lệch không là **X**. **Đã chốt (01/11/2026):** các lớp cùng học phần thi **cùng một đề** trong một kỳ. Đây là giả định của phương pháp, dữ liệu đầu vào không có cột ca thi hay mã đề để kiểm tra. |
| P2 | Thống kê **chỉ nêu hiện tượng**, gắn cờ "cần xem xét". Phần mềm **không** dùng để đánh giá, nhận xét, xếp hạng giảng viên. |
| P3 | X và Y **chỉ so sánh giữa các lớp trong cùng một học phần, cùng kỳ**. Không so X hay Y thô giữa các học phần, bộ môn, khoa khác nhau. |
| P4 | Không phân biệt hệ CLC và đại trà khi thống kê (X đã tính theo Bộ luật A). Không phân tầng theo ngành, khóa. Bỏ qua vấn đề xếp lớp (SV đăng ký tự do; năm nhất xếp ngẫu nhiên). **Đã chốt lại (01/11/2026):** vẫn gộp; học phần có cả hai hệ được **ghi chú**, vì lớp có nhiều điểm thành phần hơn dễ mất tư cách hơn và X ít phân tán hơn, ảnh hưởng đến I1, I10, H4, D4, D5. |
| P5 | Không dùng điểm thành phần, chỉ dùng **X tổng**. Không dùng trung vị cho X − Y. Không dùng ngưỡng X − Y > 4 / < −4 (thay bằng các chỉ số thống kê ở mục 4). |
| P6 | Cờ cấp **học phần**; dấu hiệu cấp lớp chỉ là đầu vào cho bộ môn. Với GV: chỉ chú ý khi **cùng một dấu hiệu lặp lại ở cùng học phần qua ≥ 2 kỳ**. |
| P7 | Ghi nhận cả hiện tượng **tích cực** (D6). |
| P8 | **Không phát hiện chênh lệch khác với khẳng định đồng đều.** Trạng thái đồng đều chỉ được ghi khi khoảng tin cậy cho thấy chênh lệch nằm dưới ngưỡng lưu ý. Đồng đều cũng không đồng nghĩa với chất lượng cao. |

## 1. Phạm vi học phần

| # | Luật |
|---|---|
| D-L1 | **Đã chốt (2026-10-26):** hiện tại coi **mọi** học phần còn lại sau Bộ luật A, B đều thi kết thúc theo bộ đề chung, **không ngoại lệ** (đồng bộ với Bộ luật A, kể cả "Đồ án 1/2"). |
| D-L2 | Dự phòng cho sau này: tham số `tu_khoa_loai_hp` và `ds_ma_hp_loai_tru` (mặc định **rỗng**) cho phép loại học phần theo từ khóa tên hoặc theo mã. Để rỗng thì không loại gì. |
| D-L3 | **Đã chốt:** mã HP có đuôi H/E (chất lượng cao) và mã cùng số không đuôi là **cùng một học phần**, dùng chung bộ đề. Khóa học phần `ma_hp_goc` = mã HP bỏ đuôi `H`/`E` (VD `15216H` → `15216`). Mọi so sánh giữa các lớp, mô hình I7–I9, cờ H1–H6 và G1 đều theo `ma_hp_goc`; lớp vẫn giữ mã đầy đủ để hiển thị. Tham số `gop_ma_hp_hau_to = true`. |

## 2. Nhóm sinh viên trong một lớp học phần

| Ký hiệu | Định nghĩa |
|---|---|
| `n_diem` | Số SV có dòng điểm trong lớp (sau Bộ luật A, B). Là **mẫu số chung** của lớp. |
| **Mất TC** | X = 0 (theo Bộ luật A mục 3.2: có điểm thành phần < 4). Khi đó Y = 0, Z = 0. |
| **Đạt TC** – nhóm **P** | X ≥ 4. Đây là nhóm tính mọi chỉ số về X, Y, X − Y. |
| Vắng thi (`V`) | Y = 0, **nằm trong P**, tính như bình thường, không tách riêng (số rất ít). |
| **F do thi** | SV thuộc P có **Z < 4**. |
| F do mất TC | SV Mất TC (Z = 0). Là chỉ số riêng (I1), không gộp vào F do thi. |
| Đạt học phần | Z ≥ 4,0 (Z = 4,0 là **đạt**, điểm D). |

`n_P` = số SV thuộc P. Lý thuyết `n_diem = n_P + n_matTC`.

## 3. Điều kiện đưa vào thống kê

| # | Luật | Tham số |
|---|---|---|
| D-Đ1 | Lớp **đưa vào thống kê** nếu `n_P ≥ so_sv_toi_thieu_lop`. Lớp không đủ thì **không đưa vào các chỉ số về X, Y**, đếm vào Q1. **Riêng I1, H4, D5** xét mọi lớp có `n_diem ≥ so_sv_toi_thieu_lop` (D-Đ4). Đây là lớp **vẫn tổ chức dạy bình thường**, không phải lớp bị hủy; mọi báo cáo phải ghi rõ "lớp không đưa vào thống kê", không ghi "lớp bị loại/hủy". | 15 |
| D-Đ2 | Lớp đưa vào thống kê nhưng `n_P < so_sv_tin_cay_thap` → nhãn `TIN_CAY_THAP` (vẫn tính). | 30 |
| D-Đ3 | Học phần (ma_hp_goc × kỳ) **đủ điều kiện so sánh giữa lớp** nếu có ≥ `so_lop_toi_thieu_hp` lớp đưa vào thống kê. Không đủ → không tính I7–I10, H1, H2; đếm vào Q2. Vẫn tính I1–I6, H3, H5, H6. | 2 |
| D-Đ4 | Lớp **xét tỷ lệ mất tư cách** nếu `n_diem ≥ so_sv_toi_thieu_lop`. Lý do: điều kiện D-Đ1 tính trên nhóm P nên loại đúng các lớp mất tư cách nhiều. H4 cần ≥ `so_lop_toi_thieu_hp` lớp như vậy. I1 của học phần và toàn trường tính trên các lớp này. | 15 |

## 4. Năng lực nền của sinh viên (dùng cho I8)

Không có GPA tích lũy; chỉ dùng điểm các học phần **khác** trong cùng kỳ.

| # | Luật |
|---|---|
| D-N1 | Với SV `s`, kỳ `k`, học phần đang xét `h`: chỉ tính nếu SV có ≥ `so_lop_hp_nang_luc_nen` lớp học phần trong kỳ (sau Bộ luật A, B), **tính cả học phần h**. Mặc định 3 → điểm nền lấy từ ≥ 2 học phần khác. |
| D-N2 | `NL(s,k,h) = Σ_{j≠h} Z_j · tc_j / Σ_{j≠h} tc_j` — Z thang 10 (đã làm tròn theo Bộ luật A), trọng số `tc_j` = `so_tin_chi` (TCHT) của lớp j. **Tính cả học phần F** (Z = 0), giống quy tắc TBCHK (Bộ luật C mục 4). Dùng thang 10 thay vì thang 4 để giữ độ phân giải; tham số `nang_luc_nen_thang` cho phép chọn `4`. |
| D-N3 | Các học phần khác dùng để tính NL là **mọi** học phần còn lại sau Bộ luật A, B (không áp D-L1, D-L2), vì chỉ cần phản ánh năng lực chung. |
| D-N4 | SV không đủ D-N1 → NL rỗng; SV đó **chỉ bị bỏ khỏi mô hình I8**, vẫn tính các chỉ số khác. Tỷ lệ này báo ở Q3. |
| D-N5 | **Đã chốt:** NL tính **theo từng học kỳ của từng năm học được nhập vào** (mỗi file điểm một kỳ). Không suy năm học/khóa của SV từ lớp hành chính hay mã SV; dùng chung một mô hình cho mọi SV trong kỳ. Bảng `doi_soat` ghi tương quan NL–Y của từng kỳ để theo dõi. |

## 5. Chỉ số cấp lớp học phần (I1–I10)

Mọi chỉ số tính cho lớp đưa vào thống kê. Độ lệch chuẩn dùng mẫu (chia n − 1). Mức tin cậy: `muc_tin_cay` (0,95).

| Mã | Chỉ số | Cách tính |
|---|---|---|
| I1 | Tỷ lệ mất tư cách | `n_matTC / n_diem` |
| I2 | Tỷ lệ F do thi | `#(SV ∈ P, Z < 4) / n_P` |
| I3 | X trung bình, SD | Trên P |
| I4 | Y trung bình, SD | Trên P (vắng thi Y = 0 vẫn tính) |
| I5 | Trung bình X − Y và khoảng tin cậy | `d_i = X_i − Y_i` trên P. `d̄ ± t(1−α/2; n_P−1) · s_d / √n_P`. `s_d` = SD(X − Y) giữ làm chỉ số **phụ** (dùng cho khoảng tin cậy, không xếp hạng). Ý nghĩa: X trung bình cao hơn Y trung bình bao nhiêu điểm trên cùng nhóm SV; so với mặt bằng các lớp khác cùng học phần, **không so với 0**. |
| I6 | Tương quan X–Y | Pearson r trên P, khoảng tin cậy qua biến đổi Fisher z; kèm Spearman ρ. Nếu SD(X) = 0 hoặc SD(Y) = 0 → rỗng, ghi chú `KHONG_TINH_DUOC_R`. |
| I7 | **Độ lệch X so với kỳ vọng** (điểm) | Mô hình hỗn hợp cho mỗi học phần × kỳ đủ D-Đ3, trên P của mọi lớp đưa vào thống kê: `X_ij = β0 + β1·Y_ij + u_j + e_ij`, `u_j ~ N(0, τ_X²)` (j = lớp). I7 của lớp j = `û_j` (BLUP, đã co rút) kèm sai số chuẩn, khoảng tin cậy, `z = û_j / SE`, p hai phía. "Kỳ vọng" = mức X thường gặp ở SV có cùng Y trong học phần đó, tính từ mọi lớp. Dương: X cao hơn kỳ vọng. Khi học phần có ít lớp, `û_j` bị kéo về 0 và so với trung bình chung có cả chính lớp đó, nên một lớp lệch δ điểm so với các lớp khác có `û_j` nhỏ hơn δ (2 lớp: khoảng δ/2). |
| I8 | **Độ lệch Y so với kỳ vọng** (điểm) | Tương tự, trên P có NL: `Y_ij = γ0 + γ1·NL_i + v_j + e_ij`, `v_j ~ N(0, τ_Y²)`. I8 = `v̂_j`. Lớp có < `so_sv_toi_thieu_lop` SV có NL → I8 rỗng. Dương: Y cao hơn kỳ vọng so với năng lực nền. |
| I9 | Mức không hội tụ giữa các lớp (cấp học phần) | Từ hai mô hình trên: **khoảng tản** `τ̂_X`, `τ̂_Y` (điểm) và `ICC_X = τ̂_X² / (τ̂_X² + σ̂_X²)`, `ICC_Y` tương tự. Kèm chênh lớp cao nhất – thấp nhất của `û_j`, `v̂_j`. Kiểm định τ² = 0 bằng **kiểm định F của hiệu ứng lớp có kiểm soát biến kèm theo** (`F = MSB/MSW`, bậc tự do J − 1 và N − J − 1); LRT chia đôi không dùng nữa vì quá thận trọng khi học phần có ít lớp. Kèm **cận trên một phía của ICC** (`R = F/F_(1−mức tin cậy)(J−1, N−J−1)`, `ICC_trên = (R−1)/(R+n0−1)`, `n0 = (N − Σn_j²/N)/(J−1)`) để xét O1, O2. I9 là **tham số mô hình**, một giá trị cho mỗi học phần × kỳ, không phải trung bình hay trung vị. Gộp I9 lên khoa/trường theo R4. |
| I10 | Khoảng cách phân phối | Lớp j so với **gộp các lớp khác cùng học phần, cùng kỳ** (đối chiếu chính): Wasserstein-1 `W = ∫ |F_j(x) − F_khác(x)| dx` (đơn vị điểm) và Kolmogorov–Smirnov 2 mẫu (D, p). Tính cho X (dùng cho D4) và Y (thông tin). Đối chiếu phụ (chỉ hiển thị, không bật cờ): so với toàn trường cùng kỳ. **Không so với phân phối chuẩn.** |

**Cài đặt I7, I8:** Python `statsmodels.MixedLM` (REML). Nếu τ̂² = 0: mọi lớp có I7 = 0 và **không kiểm định riêng từng lớp**, vì mô hình đã không phát hiện chênh lệch; không dùng phần dư chưa co rút. Nếu không hội tụ: ước lượng τ² theo mô men từ kiểm định F, rồi co rút theo `λ_j = τ²/(τ² + σ²/n_j)`. Cả hai trường hợp ghi chú dự phòng.

## 6. Hiệu chỉnh kiểm định nhiều lần

Mọi p-value dùng để bật dấu hiệu hoặc cờ được hiệu chỉnh **Benjamini–Hochberg (FDR)** với ngưỡng `fdr_q` (0,05), **riêng cho từng loại dấu hiệu/cờ, trong từng kỳ, trên toàn trường**. Một dấu hiệu chỉ bật khi đủ cả ba: (1) đủ cỡ mẫu (mục 3), (2) có ý nghĩa sau FDR, hoặc khoảng tin cậy thỏa điều kiện đối với D3, H3 (mục 7, 8), (3) độ lớn vượt ngưỡng.

## 7. Dấu hiệu cấp lớp (D1–D7) – chỉ báo cáo bộ môn và khoa

| Mã | Dấu hiệu | Điều kiện mặc định |
|---|---|---|
| D1 | X cao hơn kỳ vọng | `I7 ≥ +d1_d2_lech_x` (1,0) và p(I7) có ý nghĩa sau FDR |
| D2 | X thấp hơn kỳ vọng | `I7 ≤ −d1_d2_lech_x` và p(I7) có ý nghĩa sau FDR |
| D3 | X ít phản ánh Y | r lớp < `d3_r_lop` (0,2), r học phần ≥ `d3_r_hp` (0,4) **và cận trên khoảng tin cậy của r lớp < r học phần** |
| D4 | Phân phối X khác các lớp còn lại | `W_X ≥ d4_wasserstein` (1,0 điểm) và p(KS) có ý nghĩa sau FDR. Chưa xét đến Y; đọc cùng I7 |
| D5 | Tỷ lệ mất tư cách cao hơn hẳn | I1 lớp − I1 các lớp khác cùng HP ≥ `d5_chenh_mat_tu_cach` (15 điểm %) và Fisher exact (lớp vs các lớp khác) có ý nghĩa sau FDR. Xét mọi lớp đủ D-Đ4 |
| D6 | Y cao hơn kỳ vọng (**tích cực**) | `I8 ≥ +d6_d7_lech_y` (0,75) và p(I8) có ý nghĩa sau FDR |
| D7 | Y thấp hơn kỳ vọng | `I8 ≤ −d6_d7_lech_y` và p(I8) có ý nghĩa sau FDR |

## 8. Cờ

Mọi cờ mang nghĩa **"cần xem xét"**, không kết luận.

**Cờ cấp học phần (H1–H6)** – khoa và bộ môn thấy chi tiết; ban giám hiệu chỉ thấy số lượng, tỷ lệ.

| Mã | Cờ | Điều kiện mặc định |
|---|---|---|
| H1 | X không hội tụ giữa các lớp | Kiểm định F của hiệu ứng lớp có ý nghĩa sau FDR **và** (`ICC_X ≥ h1_icc_x` (0,10) **hoặc** chênh `û` cao nhất – thấp nhất ≥ `h1_khoang_tan_x` (1,5 điểm)) |
| H2 | Y khác nhau giữa các lớp sau điều chỉnh năng lực nền | Như H1 với `v̂`, `h2_icc_y` (0,10), `h2_khoang_tan_y` (1,0 điểm) |
| H3 | X tương quan yếu với Y | **Cận trên khoảng tin cậy** của r gộp toàn học phần (trên P) < `h3_r_hp` (0,3). X có thể đánh giá những năng lực đề thi không đo, nên đây không phải kết luận về X |
| H4 | Mất tư cách không đồng đều giữa các lớp | Trên các lớp đủ D-Đ4: chi bình phương (lớp × Mất TC/Đạt TC; tần số kỳ vọng < 5 thì dùng Monte Carlo) có ý nghĩa sau FDR và chênh I1 lớp cao nhất – thấp nhất ≥ `h4_chenh_mat_tu_cach` (15 điểm %) |
| H5 | Tỷ lệ F do thi cao | **Cận dưới Wilson** của I2 gộp ≥ `h5_ty_le_f` (30%) **hoặc** cao hơn các kỳ trước của **chính học phần**: Fisher một phía (kỳ này so với gộp các kỳ trước) có ý nghĩa sau FDR và I2 tăng ≥ `h5_chenh_lich_su` (10 điểm %). Không so với khoa, đồng bộ P3. Học kỳ đầu của học phần chỉ xét mức 30% |
| H6 | Độ khó đề thay đổi giữa các kỳ | So Y (trên P) của học phần ở kỳ này với **kỳ gần nhất trước đó có mở học phần**: Welch t có ý nghĩa sau FDR và \|ΔY trung bình\| ≥ `h6_lech_y_giua_ky` (1,0 điểm) |

**Cờ GV × học phần (G1)** – chỉ báo cáo bộ môn và khoa (có tên GV).

| Mã | Cờ | Điều kiện mặc định |
|---|---|---|
| G1 | Dấu hiệu lặp lại | Cùng GV, cùng **`ma_hp_goc`**, cùng một mã dấu hiệu D1–D7 (cùng chiều) xuất hiện ở ≥ `g1_so_ky_lap` (2) kỳ khác nhau **và chiếm ≥ `g1_ty_le_ky` (50%) số kỳ GV dạy học phần đó**, chỉ xét trong `g1_cua_so_ky` (4) kỳ gần nhất theo lịch tính đến kỳ đang xem; ghi rõ “đang tiếp diễn” hoặc “đã ghi nhận trước đây”. Mỗi lớp học phần có **đúng một** GV chịu trách nhiệm (đã chốt). Một kỳ GV có nhiều lớp cùng học phần: kỳ đó tính là có dấu hiệu nếu ≥ 1 lớp có dấu hiệu. |

**Cờ độ phủ dữ liệu (Q1–Q3)** – mọi cấp.

| Mã | Nội dung |
|---|---|
| Q1 | Số lớp **không đưa vào thống kê** (n_P < `so_sv_toi_thieu_lop`), kèm tỷ lệ trên tổng số lớp. |
| Q2 | Số học phần chỉ có < `so_lop_toi_thieu_hp` lớp đưa vào thống kê → không so sánh giữa lớp được. |
| Q3 | Tỷ lệ SV thuộc P không có NL (D-N4), theo học phần và toàn trường. |

## 9. Báo cáo 3 cấp

### 9.1 Quy tắc hiển thị

| # | Quy tắc |
|---|---|
| R1 | **Tên giảng viên** chỉ hiển thị ở báo cáo **bộ môn** và **khoa**. Báo cáo **ban giám hiệu không có tên GV**, không có mã lớp; G1 chỉ ghi số lượng. |
| R2 | Ở cấp ban giám hiệu và khoa, chỉ so sánh giữa đơn vị bằng các chỉ số **rút ra từ bên trong học phần** (I9, tỷ lệ học phần có cờ). I1, I2 gộp chỉ để **mô tả**, ghi rõ "không dùng xếp hạng chất lượng". |
| R3 | Mỗi chỉ số kèm số kỳ trước để so (mức thay đổi). |
| R4 | **Gộp I9 qua nhiều học phần** (bộ môn, khoa, trường) — đã chốt 2026-10-26: dùng **trung vị** của `τ̂_X`, `ICC_X`, `τ̂_Y`, `ICC_Y` trên các học phần đủ D-Đ3, **luôn kèm tỷ lệ học phần có cờ H1** (và H2 cho Y). Lý do: phân phối I9 giữa các học phần bị chặn ở 0 (nhiều HP có τ̂ = 0) và lệch phải (vài HP rất tản); trung vị cho mức của một học phần điển hình, tỷ lệ H1 cho biết số học phần tản bất thường. Ba tầng không lẫn nhau: I3–I5 là trung bình trên SV trong lớp; I9 là tham số mô hình của học phần; trung vị chỉ dùng ở bước gộp I9. |

### 9.2 Màu sắc (bắt buộc)

| # | Quy tắc |
|---|---|
| M1 | **Không dùng đỏ, cam, xanh lá** và không dùng kiểu đèn giao thông; không đặt màu đỏ đối lập đen/trắng trong danh sách lớp. Không màu nào được gợi ý "tốt" hay "xấu". |
| M2 | **Độ lớn** (mức tản, tỷ lệ, khoảng cách): một tông xanh dương nhạt → đậm, ví dụ `#DCE9F5` `#9DC3E6` `#4F8FC9` `#1F5C99` `#0B2F5B`. |
| M3 | **Chiều lệch** (trên / dưới kỳ vọng): hai màu ngang hàng, không mang nghĩa giá trị: xanh mòng két `#2A8C8C` (trên) và tím `#7A6BB0` (dưới), điểm giữa xám nhạt `#E6E6E6`. D6 (tích cực) dùng cùng màu "trên", **không** dùng xanh lá. |
| M4 | **Phân loại** (khoa, bộ môn): bảng màu trung tính không có đỏ/cam/xanh lá, ví dụ `#4C72B0` `#2A8C8C` `#7A6BB0` `#8C8C8C` `#937860` `#1F3B73`. Nhiều hơn 6 nhóm thì chia khung (small multiples) hoặc chỉ tô nhóm đang chọn, nhóm còn lại xám. |
| M5 | **Cờ** thể hiện bằng **mã chữ** (H1, D3…) và ký hiệu trung tính (ví dụ ◆), **không tô màu cả dòng**. |

### 9.3 Cấp 1 – Ban giám hiệu (chính sách, quy định)

| Nội dung | Ý nghĩa / quyết định có thể dẫn đến |
|---|---|
| Thẻ chỉ số mỗi kỳ: số HP, số lớp, số lượt SV, Q1 (lớp không đưa vào thống kê) | Quy mô và độ phủ của báo cáo |
| Xu hướng 4 kỳ: I1, I2, I5, I6 toàn trường | Quy chế xét tư cách; chương trình hỗ trợ học tập; quy định đánh giá quá trình |
| **Mức không hội tụ giữa các lớp** (I9 gộp theo R4: trung vị `τ̂_X`, `ICC_X` kèm tỷ lệ HP có H1), theo kỳ và theo khoa | Các lớp cùng học phần có được đánh giá theo cùng một chuẩn không → xem xét rubric chấm X chung và hoạt động hiệu chuẩn. Không dùng "tính đồng đều" làm tiêu chí đánh giá bộ môn, vì các lớp có thể đồng đều bằng cách cùng chấm rộng và tiêu chí này tạo động cơ chấm theo nhau |
| **Biểu đồ phân tán học phần, mức tổng thể**: mỗi điểm = 1 HP; trục ngang `τ̂_X` (hoặc ICC_X), trục dọc `τ̂_Y` (hoặc ICC_Y); tô theo khoa; **không nhãn mã HP, không tên GV**; ghi số HP ở mỗi góc phần tư | Chọn hướng can thiệp: tản theo X → quy định đánh giá quá trình; tản theo Y → giảng dạy, bồi dưỡng phương pháp |
| Cột theo khoa: tỷ lệ HP có cờ, tách theo loại cờ; bản đồ nhiệt khoa × kỳ | Ưu tiên nguồn lực đảm bảo chất lượng, tập huấn, kiểm tra chuyên đề |
| Số cặp GV × HP có G1 (chỉ số lượng) | Mức độ hiện tượng lặp lại trong toàn trường |

### 9.4 Cấp 2 – Khoa (điều phối, ưu tiên)

| Nội dung | Ý nghĩa / quyết định có thể dẫn đến |
|---|---|
| Bảng bộ môn × chỉ số: số HP, số lớp, số HP đủ D-Đ3, tỷ lệ HP có cờ theo loại, I1, I2, I6, trung vị I9 kèm tỷ lệ HP có H1/H2 (R4) | Bộ môn nào cần sinh hoạt chuyên môn và báo cáo lại |
| Xu hướng 4 kỳ theo bộ môn (small multiples) | Đánh giá hiệu quả biện pháp kỳ trước |
| Biểu đồ phân tán học phần (bản chi tiết, có nhãn mã HP) | Chọn HP ưu tiên dự giờ, rà soát đề cương, bộ đề |
| Danh sách HP có cờ H1–H6, sắp theo bộ môn, ghi số kỳ lặp | Kế hoạch kiểm tra chuyên đề |
| Danh sách G1 (có tên GV) | Phối hợp bộ môn khi phân công kỳ sau, bồi dưỡng GV |

### 9.5 Cấp 3 – Bộ môn (chuyên môn trong từng học phần)

Mỗi học phần một trang:

| Nội dung | Ý nghĩa / quyết định có thể dẫn đến |
|---|---|
| Bảng lớp: GV, sĩ số, n_diem, n_P, I1–I10, nhãn TIN_CAY_THAP, mã dấu hiệu D1–D7 | Tổng quan từng lớp |
| Biểu đồ hộp X và Y đặt cạnh nhau theo lớp | Lớp nào X lệch trong khi Y không lệch → thống nhất cách đánh giá X |
| Biểu đồ phân tán X theo Y toàn học phần, tô theo lớp, đường kỳ vọng chung | Ở cùng mức Y, các lớp có được chấm X tương đương không → rubric, chấm chéo mẫu |
| Biểu đồ rừng I7 và I8 theo lớp (có khoảng tin cậy) | Chỉ đưa ra trao đổi khác biệt có ý nghĩa thống kê |
| ECDF lớp so với các lớp khác (minh họa I10) | Hình dạng phân phối X khác ở đâu |
| Bản đồ nhiệt GV × kỳ của I7 trong học phần, cờ G1 | Dấu hiệu là ngẫu nhiên một kỳ hay lặp lại |
| Xu hướng Y trung bình của học phần qua các kỳ (H6) | Độ khó bộ đề có ổn định không → hiệu chỉnh ngân hàng câu hỏi |
| D6 | Mời GV chia sẻ cách làm, nhân rộng phương pháp tốt |

### 9.6 Vòng cải tiến

Ban giám hiệu ra chủ trương → khoa chọn học phần ưu tiên → bộ môn thực hiện → kỳ sau đo lại bằng cùng bộ chỉ số (`τ̂_X` giảm, r tăng) → báo cáo ngược lên. Khi đo hiệu quả biện pháp cần: giữ nguyên ngưỡng trong thời gian đánh giá; có nhóm đối chứng (ví dụ triển khai lệch pha theo khoa), vì học phần có điểm lưu ý có thể tự giảm ở kỳ sau do hồi quy về trung bình; đọc `τ̂_X` giảm cùng mức X, vì τ̂_X giảm không có nghĩa là chất lượng tăng.

## 10. Bảng đầu ra

| Bảng | Khóa | Cột chính |
|---|---|---|
| `chi_so_lop` | ky, ma_hp, nhom | ma_hp_goc, giang_vien, ma_bm, ma_khoa, si_so, n_diem, n_P, n_matTC, dua_vao_thong_ke, tin_cay_thap, I1–I6 (kèm CI), I7, I7_se, I7_p, I7_p_fdr, I8 (tương tự), W_X, KS_X_D, KS_X_p, W_Y, KS_Y_D, KS_Y_p, W_X_toan_truong, dau_hieu (danh sách D), ghi_chu |
| `chi_so_hp` | ky, ma_hp_goc | ds_ma_hp (các mã gốc + H/E đã gộp), ten_hp, ma_bm, ma_khoa, so_lop, so_lop_thong_ke, du_dk_so_sanh, n_P, I1, I2, I3–I6 gộp, tau_X, ICC_X, tau_Y, ICC_Y, chenh_u, chenh_v, p_LRT_X, p_LRT_Y, ty_le_khong_NL, co (danh sách H, Q) |
| `co_gv_hp` | giang_vien, ma_hp_goc, ma_dau_hieu | so_ky, ds_ky |
| `tong_hop_bo_mon`, `tong_hop_khoa`, `tong_hop_truong` | ky + đơn vị | Các chỉ số mục 9 theo cấp |
| `tham_so_da_dung` | — | Bản sao tham số của lần chạy (để đối chiếu khi đổi ngưỡng) |
| `doi_soat` | — | Số dòng/lớp/HP bị loại theo D-L1–D-L3, Q1–Q3; số dấu hiệu, cờ bật theo mã (dùng hiệu chỉnh ngưỡng) |

## 11. Điểm còn mở

| # | Nội dung |
|---|---|
Tất cả đã chốt ngày 2026-10-26:

| # | Nội dung |
|---|---|
| O1 (chốt) | Mọi học phần đều thi theo bộ đề chung, không ngoại lệ (D-L1). |
| O2 (chốt) | Mã đuôi H/E (CLC) và mã cùng số không đuôi là cùng một học phần, chung bộ đề (D-L3). |
| O3 (chốt) | Năng lực nền nhập và tính theo từng học kỳ của từng năm; không suy năm học SV từ lớp hành chính hay mã SV (D-N5). |
| O4 (chốt) | Mỗi lớp học phần chỉ có đúng một GV chịu trách nhiệm giảng dạy (G1). |
| O5 (chốt) | Ngưỡng mặc định là giá trị khởi điểm. Lần chạy đầu: báo số dấu hiệu/cờ bật ở mỗi mã (bảng `doi_soat`) để người dùng chỉnh, định hướng khoảng 5–10% học phần có cờ. Định hướng này chỉ dùng cho lần hiệu chỉnh đầu; sau đó giữ cố định, nếu không tỷ lệ này không còn đo được sự thay đổi. |
| O6 (chốt) | Mẫu số I1 là `n_diem` (số SV có điểm), không phải `si_so` đăng ký ban đầu. |
