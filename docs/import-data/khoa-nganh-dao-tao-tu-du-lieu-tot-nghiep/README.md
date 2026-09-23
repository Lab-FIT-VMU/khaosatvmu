# Bộ file import khóa ngành đào tạo

Bộ file này được sinh từ 11 file `TongHop` của các đợt xét tốt nghiệp 2024–2025 đến 2026–2027.

## Cách import

Màn hình hiện tại chọn một khóa học cho cả lần import, vì vậy mỗi khóa có một file riêng. Chọn đúng khóa ở trường **Import vào khóa học**, sau đó chọn file cùng mã khóa:

- `khoa-nganh-dao-tao-K50.xlsx`
- `khoa-nganh-dao-tao-K56.xlsx`
- `khoa-nganh-dao-tao-K57.xlsx`
- `khoa-nganh-dao-tao-K58.xlsx`
- `khoa-nganh-dao-tao-K59.xlsx`
- `khoa-nganh-dao-tao-K60.xlsx`
- `khoa-nganh-dao-tao-K61.xlsx`
- `khoa-nganh-dao-tao-K62.xlsx`
- `khoa-nganh-dao-tao-K63.xlsx`

Hệ thống chỉ đọc sheet đầu tiên **Khoa nganh dao tao**. Hai sheet còn lại dùng để kiểm tra nguồn và đọc hướng dẫn.

## Kết quả đối chiếu

| Khóa | Số mã lớp | Số sinh viên quan sát được |
|---|---:|---:|
| K50 | 2 | 2 |
| K56 | 2 | 4 |
| K57 | 6 | 9 |
| K58 | 19 | 66 |
| K59 | 38 | 279 |
| K60 | 43 | 621 |
| K61 | 45 | 1.385 |
| K62 | 47 | 2.679 |
| K63 | 39 | 1.653 |
| **Tổng** | **241** | **6.698** |

Bộ file hiện bao phủ **241/241 mã lớp (100%)** quan sát được trong 11 file nguồn, không có mã lớp trùng trong cùng file và không còn dòng chưa đối chiếu.

## Giới hạn dữ liệu nguồn

Các file tốt nghiệp chỉ chứa sinh viên đã tốt nghiệp, không chứa toàn bộ sinh viên nhập học. Vì vậy cột **Số lượng sinh viên** đang là số mã sinh viên duy nhất quan sát được trong 11 file nguồn, tức số tối thiểu đã biết, không phải sĩ số đầu khóa chính thức. Cần thay bằng sĩ số đầu khóa từ dữ liệu tuyển sinh/lớp khóa nếu có.

Có 13 mã lớp được các file nguồn gán lúc là CLC, lúc là NC. Các mã này đều có hậu tố `CL`, vì vậy bộ file hoàn chỉnh đối chiếu chúng vào chương trình `(CLC)` theo mã lớp và vẫn ghi lại toàn bộ tên nguồn trong sheet **Đối chiếu nguồn**. Nhờ đó cả 241 mã lớp quan sát được đều có mặt trong sheet import. Chi tiết và số lượng từng trường hợp nằm trong `bao-cao-doi-chieu.json`.

## Tái tạo bộ file

```powershell
node scripts/generate-cohort-major-imports.cjs `
  "<thư mục chứa các file tốt nghiệp>" `
  "docs\import-data\danh-sach-nganh-dao-tao-day-du.xlsx" `
  "docs\import-data\khoa-nganh-dao-tao-tu-du-lieu-tot-nghiep"
```
