# Thay đổi so với `Project/`

Bản này sao chép từ `../Project/` ngày 01/11/2026 và sửa theo phản biện. `Project/` không bị thay đổi. Không sao chép `.git`, `.github`, `Mockup`.

## Quyết định của người dùng

| Câu hỏi | Quyết định |
|---|---|
| Đề thi | Các lớp cùng học phần luôn thi cùng một đề trong kỳ. Giữ giả định, ghi rõ |
| CLC và đại trà | Giữ gộp, chỉ ghi chú |
| Vắng thi | Giữ nguyên Y = 0 trong mọi chỉ số |
| H5 | So với mức 30% và các kỳ trước của chính học phần; bỏ phễu theo khoa |
| Câu về giảng viên | Chỉ mô tả; nói xu hướng khi từ 3 kỳ và khoảng tin cậy không chứa 0 |
| "Đồng đều" | Tách "đồng đều" và "chưa đủ dữ liệu để kết luận" |
| Ngưỡng D1, D2 | 1,0 điểm |
| Phạm vi thêm | Cập nhật báo cáo docx. **Không làm:** lưu vết, khóa ngưỡng; Bộ luật C; đối soát với điểm chính thức |

## Thay đổi thống kê

| Nội dung | Trước | Nay | Tệp |
|---|---|---|---|
| Kiểm định chênh lệch giữa các lớp (H1, H2) | LRT chia đôi | F của hiệu ứng lớp, kèm cận trên ICC | `xu_ly/chi_so.py` |
| τ̂ = 0 | I7 là phần dư chưa co rút, vẫn kiểm định | I7 = 0, không kiểm định riêng từng lớp | `xu_ly/chi_so.py` |
| Không hội tụ | OLS, τ̂ = 0 | τ² theo mô men rồi co rút | `xu_ly/chi_so.py` |
| O1, O2 | Không có H1, H2 | Thêm cận trên ICC và chênh dưới ngưỡng | `xu_ly/lien_ky.py` |
| O3 | r ≥ 0,4 | Thêm cận dưới của r ≥ 0,3 | `xu_ly/lien_ky.py` |
| O4 | Không có H4 | Thêm cận trên của chênh I1 (Agresti–Caffo, Bonferroni) dưới ngưỡng | `xu_ly/lien_ky.py` |
| H3 | r < 0,3 | Cận trên của r < 0,3 | `xu_ly/chi_so.py` |
| D3 | r lớp < 0,2 | Thêm cận trên của r lớp < r học phần | `xu_ly/chi_so.py` |
| I1, H4, D5 | Lớp có n_P ≥ 15 | Lớp có n_diem ≥ 15 | `xu_ly/chi_so.py` |
| H5 | I2 ≥ 30% hoặc phễu theo khoa | Cận dưới Wilson ≥ 30%, hoặc tăng ≥ 10 điểm % so với các kỳ trước và Fisher có ý nghĩa sau FDR | `xu_ly/chi_so.py`, `xu_ly/lien_ky.py` |
| G1 | ≥ 2 kỳ | Thêm: chiếm ≥ 50% số kỳ dạy | `xu_ly/lien_ky.py`, `web/assets/app.js` |
| X3, X4, Q8 | Đếm dấu các kỳ | Từ 3 kỳ và khoảng tin cậy của trung bình các kỳ không chứa 0 | `xu_ly/nhan_xet.py` |
| Q5 | r lớp < 0,3 | Cận trên của r lớp < 0,3 | `Data/Bo luat/mau_nhan_xet.json` |

## Tham số

- Mới: `h5_chenh_lich_su` = 0,10; `g1_ty_le_ky` = 0,5. Hai giá trị này do người viết đề xuất, chưa chốt trên dữ liệu thật.
- Bỏ: `h5_phieu_z`.
- Giá trị đang chạy: `d1_d2_lech_x` từ 1,5 về 1,0.

## Câu chữ

- Bỏ mọi câu nói giảng viên chấm thế nào, kể cả mô tả D1, D2 và I7.
- Bỏ gợi ý đưa "tính đồng đều" vào đánh giá bộ môn.
- Q11 không còn gợi ý dùng lớp làm "lớp tham chiếu".
- "Điểm quá trình tương đương các lớp khác" đổi thành "Điểm quá trình gần mức kỳ vọng ở các kỳ đã dạy".
- Thêm ghi chú khi học phần có cả hai hệ, và ghi chú D4 chưa xét đến Y.

## Kiểm tra

- `python -X utf8 -m unittest discover tests`: 24 kiểm thử, đạt.
- `python -X utf8 tests/kiem_chung.py 150`: kiểm chứng biết trước đáp án, kết quả ở `tests/ket_qua_kiem_chung.json`.
- Chưa chạy trên dữ liệu thật.

## Báo cáo

Thư mục `Bao cao/`: báo cáo đầy đủ, bản ngắn cho Ban giám hiệu, mã nguồn và hình. Dựng lại:

```bash
python -X utf8 "Bao cao/tao_hinh_bao_cao.py"
python -X utf8 "Bao cao/tao_bao_cao_bgh.py"
python -X utf8 "Bao cao/tao_bao_cao_bgh.py" bao_cao_ngan.md "Bao cao ngan trinh Ban giam hieu.docx"
```

## Sửa sau khi bàn giao

| Nội dung | Trước | Nay | Tệp |
|---|---|---|---|
| Vạch trục biểu đồ đường | Ba vạch không phải số tròn, ghi làm tròn nên nhãn lệch với vị trí | Vạch là số tròn, bước không nhỏ hơn đơn vị của nhãn | `web/assets/bieu_do.js` |
| Nhãn giá trị biểu đồ đường | Số chữ số lẻ cố định, giá trị khác nhau có thể ghi giống nhau | Thêm tối đa 2 chữ số lẻ khi cần phân biệt | `web/assets/bieu_do.js`, `web/assets/app.js` |
| Vạch trục biểu đồ phân tán | Bước 0,25 hoặc 0,025 bị làm tròn khi ghi | Đủ chữ số lẻ theo bước | `web/assets/bieu_do.js` |
| Trạng thái O5 | Không có H5 là đủ | Thêm cận trên Wilson của tỷ lệ trượt dưới `h5_ty_le_f` | `xu_ly/chi_so.py`, `xu_ly/lien_ky.py` |
| Trạng thái O6 | Không có H6 là đủ | Thêm cận trên của mức thay đổi Y dưới `h6_lech_y_giua_ky` | `xu_ly/lien_ky.py` |
| "Chưa đủ căn cứ" | Chỉ có O1, O2, O4 | Có cả sáu dòng, O3 gồm cả vùng giữa hai ngưỡng | `xu_ly/lien_ky.py`, `Data/Bo luat/mau_nhan_xet.json` |
| Bảng hai chiều | Một cột "Chưa xếp", tỷ lệ trên mọi học phần | Tách "Chưa đủ căn cứ" và "Không thể so sánh", tỷ lệ trên học phần so sánh được | `web/assets/app.js`, `Data/Bo luat/van_ban_giao_dien.json` |
| Trang Diễn biến | Hiện mọi kỳ đã nạp; câu xu hướng, cột Lặp lại, nhãn gần 0 tính trên mọi kỳ | Chỉ hiện và tính đến kỳ đang chọn | `xu_ly/lien_ky.py`, `xu_ly/nhan_xet.py`, `web/assets/app.js` |
| Kiểm thử thời gian | Chưa có | Chạy lại đến từng kỳ, kết quả phải trùng với khi đã nạp đủ các kỳ | `tests/test_thoi_gian.py` |
| G1: cửa sổ | Tính mọi kỳ đã qua | Chỉ xét `g1_cua_so_ky` (4) kỳ gần nhất theo lịch | `xu_ly/lien_ky.py`, `xu_ly/nhan_xet.py`, `Data/Bo luat/tham_so_chi_so.json` |
| G1: trạng thái | Không phân biệt | Tách "đang tiếp diễn" và "đã ghi nhận trước đây" | `xu_ly/lien_ky.py`, `web/assets/app.js` |
| G1: mức ngẫu nhiên | Không có | Ước lượng thô số lượt kỳ vọng nếu ngẫu nhiên, ghi ở trang Ban giám hiệu | `xu_ly/lien_ky.py` |
| H6, O6 | Gọi chung "so với kỳ trước" | Gọi "so với lần mở gần nhất", ghi rõ kỳ được so sánh và số tháng | `xu_ly/lien_ky.py`, `Data/Bo luat/*.json`, `web/assets/app.js` |

## Quyết định về gộp kỳ

Không gộp các kỳ để ghi nhãn cho học phần (người dùng chọn ngày 01/11/2026). Trên dữ liệu giả lập, gộp các kỳ đã qua chỉ giải quyết thêm khoảng 40 trong 311 học phần ở dòng điểm quá trình, và trong mô phỏng làm tăng tỷ lệ ghi đồng đều sai khi chênh lệch do cùng các giảng viên qua nhiều kỳ, hoặc khi chênh lệch mới xuất hiện ở kỳ đang xem.

## Bổ sung báo cáo (05/11/2026)

Thêm Mục 3.7 "Luồng xử lý chi tiết" gồm 4 hình (`Bao cao/luong_xu_ly.html`, chụp bằng `node chup_luong.mjs Hinh <thư mục hồ sơ Chrome>`). Hình tổng quan `h_luong` vẽ Bộ luật C bằng nét đứt vì chưa được dùng.
