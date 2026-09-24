# Bộ file import khóa ngành đào tạo

Bộ file gồm 241 mã lớp/khóa-ngành được tổng hợp từ 11 file xét tốt nghiệp. Cột **Số lượng sinh viên đầu vào tạm tính** đã được thay số giả bằng **chỉ tiêu tuyển sinh công bố theo năm nhập học** ở những khóa có nguồn tra cứu được.

> Chỉ tiêu tuyển sinh không phải số sinh viên thực nhập. Đây là dữ liệu thay thế tạm thời; cần đổi sang số thực nhập khi Nhà trường cung cấp dữ liệu chính thức.

## Cách import

Mỗi khóa có một file riêng. Trên màn hình import, chọn đúng khóa ở trường **Import vào khóa học**, sau đó chọn file cùng mã khóa:

- `khoa-nganh-dao-tao-K50.xlsx`
- `khoa-nganh-dao-tao-K56.xlsx`
- `khoa-nganh-dao-tao-K57.xlsx`
- `khoa-nganh-dao-tao-K58.xlsx`
- `khoa-nganh-dao-tao-K59.xlsx`
- `khoa-nganh-dao-tao-K60.xlsx`
- `khoa-nganh-dao-tao-K61.xlsx`
- `khoa-nganh-dao-tao-K62.xlsx`
- `khoa-nganh-dao-tao-K63.xlsx`

Không ghép nhiều khóa vào cùng một file. Hệ thống chỉ đọc sheet đầu tiên **Khoa nganh dao tao**; các sheet còn lại dùng để đối chiếu và giải thích nguồn.

## Nguyên tắc xác định số đầu vào tạm tính

Với từng mã lớp:

1. Đối chiếu tiền tố mã lớp với mã chương trình tuyển sinh, ví dụ `CNT62ĐH → D114`, `CNT62CL → H114`.
2. Lấy chỉ tiêu của đúng chương trình trong năm tuyển sinh tương ứng với khóa.
3. Nếu số sinh viên tốt nghiệp duy nhất đã quan sát lớn hơn chỉ tiêu công bố, dùng số đã quan sát làm cận dưới. Công thức là `max(chỉ tiêu, số đã tốt nghiệp quan sát)` để không tạo tỷ lệ tốt nghiệp trên 100% hoặc số chưa tốt nghiệp âm.

Các trường hợp dùng cận dưới thay cho chỉ tiêu:

- K61: `TCH61ĐH` (47 thay vì chỉ tiêu 45).
- K62: `ĐKT62ĐH` (150/130), `KTB62CL` (131/90), `KTN62CL` (120/90), `KTN62ĐH` (151/150).
- K63: `QKC63ĐH` (45/30).

## Kết quả sau khi áp chỉ tiêu

| Khóa | Năm tuyển sinh | Số mã lớp | Tổng số đầu vào tạm tính | Mức phủ chỉ tiêu |
|---|---:|---:|---:|---:|
| K50 | 2009 | 2 | 2 | 0/2 |
| K56 | 2015 | 2 | 190 | 2/2 |
| K57 | 2016 | 6 | 425 | 6/6 |
| K58 | 2017 | 19 | 1.665 | 19/19 |
| K59 | 2018 | 38 | 3.005 | 38/38 |
| K60 | 2019 | 43 | 3.155 | 43/43 |
| K61 | 2020 | 45 | 3.172 | 45/45 |
| K62 | 2021 | 47 | 3.692 | 47/47 |
| K63 | 2022 | 39 | 3.240 | 39/39 |
| **Tổng** |  | **241** | **18.546** | **239/241** |

K50 chưa có nguồn chỉ tiêu chi tiết theo chương trình. Nguồn lịch sử chỉ cho biết tổng chỉ tiêu toàn trường năm 2009 là 2.800, nên hai dòng K50 vẫn giữ số sinh viên tốt nghiệp quan sát làm cận dưới và được đánh dấu trong file.

## Nguồn dữ liệu

- K56/2015: bảng chỉ tiêu 2015 được báo chí đăng lại.
- K57/2016: thông báo chỉ tiêu chi tiết của Trường.
- K58/2017: thông báo chỉ tiêu chi tiết của Trường.
- K59–K61/2018–2020: đề án tuyển sinh chính thức của Trường.
- K62/2021 và K63/2022: thông báo/đề án tuyển sinh chính thức của Trường.

URL cụ thể, loại nguồn và toàn bộ bảng chỉ tiêu nằm trong `chi-tieu-tuyen-sinh.json`. Mỗi workbook cũng có sheet **Nguồn chỉ tiêu** và các cột đối chiếu chi tiết trong sheet **Đối chiếu nguồn**.

## Tái tạo dữ liệu

Sinh lại danh sách mã lớp từ các file tốt nghiệp:

```powershell
node scripts/generate-cohort-major-imports.cjs `
  "<thư mục chứa các file tốt nghiệp>" `
  "docs\import-data\danh-sach-nganh-dao-tao-day-du.xlsx" `
  "docs\import-data\khoa-nganh-dao-tao-tu-du-lieu-tot-nghiep"
```

Sau đó áp chỉ tiêu tuyển sinh:

```powershell
node scripts/apply-admission-quotas-to-cohort-imports.cjs
```

Kết quả kiểm tra tự động được ghi tại `bao-cao-ap-dung-chi-tieu.json`.
