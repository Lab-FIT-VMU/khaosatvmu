# Module phân tích điểm học phần – bản audit

Bản nguyên của module audit (`E:\PRJ\project-audit\project-audit`), chạy **độc lập** với module
"Phân tích điểm học phần" của khaosatvmu: dữ liệu, cách nạp, tham số và giao diện riêng, không
đọc hay ghi CSDL khaosatvmu. Hai module có thể chứa dữ liệu khác nhau.

## Cách chạy trong khaosatvmu

```text
Trình duyệt ──(cookie đăng nhập)──> API khaosatvmu /api/audit-grades/…  ──>  container audit-grade:8770
                                    quyền AUDIT_GRADE_MODULE_ACCESS,             python chay.py (web/ + /api)
                                    chặn yêu cầu ghi khác nguồn
```

- Container `khaosatvmu_audit_grade` (dịch vụ `audit-grade` trong `docker-compose.yml`), `restart:
  unless-stopped` nên tự chạy cùng Docker như CSDL. Cổng 8770 chỉ mở trên `127.0.0.1`.
- Trên web: mục **Phân tích điểm (bản audit)** ở sidebar, cần quyền "Phân tích điểm (bản audit)"
  (`AUDIT_GRADE_MODULE_ACCESS`; mặc định chỉ ADMIN, bật cho vai trò khác ở Phân quyền Module). Trang nhúng
  nguyên giao diện audit (Ban giám hiệu, khoa/viện, bộ môn, truy vết, diễn biến, nạp & quản lý học
  kỳ, tham số, thuật ngữ).
- Dữ liệu nằm trong volume Docker `audit_grade_data` (`/data/kho`, `/data/web_data`), dạng file như
  bản gốc, **không mã hóa** (`diem.csv.gz` có mã sinh viên). Chỉ container này đọc volume.

Lần đầu tạo container (hoặc sau khi đổi mã trong thư mục này):

```bash
docker compose up -d --build audit-grade
```

## Khác bản gốc

Chỉ các chỗ sau, đều không đụng phép tính:

1. `chay.py`: địa chỉ và cổng lắng nghe đọc từ `AUDIT_HOST` / `AUDIT_PORT` (mặc định như cũ).
2. `chay.py`: sửa lỗi của bản gốc ở `log_message` — khi trả lỗi (vd 404) hàm này gặp `TypeError`
   nên kết nối bị cắt thay vì trả mã lỗi.
3. Thư mục `kho/` và `web/data/` là liên kết tới volume; múi giờ Asia/Ho_Chi_Minh (Dockerfile).
4. Giao diện: bỏ nhãn "Dữ liệu giả lập" ở đầu mỗi trang, dòng "dữ liệu giả lập, chỉ dùng để thử
   nghiệm" ở chân sidebar và chữ "(thử nghiệm)" ở đầu trang — module đã dùng số liệu thật.

Không chép: `kho/` và `web/data/` (dữ liệu), `Data/Du lieu gia lap/`, `tests/`, `Bao cao/`. Chạy kiểm
thử của bản gốc ở thư mục gốc của audit.

Thư viện cùng phiên bản với `src/GradeAnalysisWorker` (numpy 2.5.4, scipy 1.18.1, statsmodels 0.15.0).
Ngày 17/11/2026 chạy bộ tính này trên 4 kỳ dữ liệu thật: kết quả trùng worker ở 7.624/7.640 lớp; chỗ
khác đều đã biết (thứ tự lớp làm p-value H4 khác; học phần có X trùng hệt Y; câu không chèn tên giảng
viên; giảng viên không có email).
