# Worker phân tích điểm học phần

Tính bộ luật D (chỉ số I1–I10, đặc điểm D1–D7, điểm lưu ý H1–H6, ổn định O1–O6, lặp lại G1) và bộ luật E
(câu nhận xét hồ sơ lớp) từ điểm đã nạp, rồi ghi kết quả vào CSDL. Bộ luật A, B (đọc file, loại dòng,
ghép lớp) nằm ở backend C#. Kế hoạch tổng: [docs/plans/tich-hop-phan-tich-diem-hoc-phan.md](../../docs/plans/tich-hop-phan-tich-diem-hoc-phan.md).

## Luồng

```
API nạp / gỡ điểm, sửa ngưỡng  ──►  GradeAnalysisRuns (Status = chờ, kèm bản chụp ngưỡng)
                                          │
worker:  nhận lượt cũ nhất  ──►  đọc view GradeAnalysisInputs, giải mã X/Y/Z (AES-GCM)
         ──►  xu_ly.chi_so → lien_ky → nhan_xet (như kho.xuat() của module audit)
         ──►  ghi 4 bảng kết quả + chuyển lượt hiện hành, trong một transaction
```

## Thư mục

| Đường dẫn | Nội dung |
|---|---|
| `xu_ly/` | Bộ tính chép từ module audit (`project-audit/xu_ly`). Các chỗ sửa ghi ở `xu_ly/__init__.py` |
| `rules/mau_nhan_xet.json` | Mẫu câu của bộ luật E (đã bỏ chèn tên giảng viên) |
| `grade_worker/` | Phần nối CSDL: cấu hình, giải mã, đọc/ghi, dựng đầu vào |
| `tests/` | `python -m unittest discover -s tests` |

## Chạy

```bash
# Một lượt (hết việc thì thoát) — dùng với systemd timer mỗi 5 phút (deploy/systemd/)
docker compose --profile grade-analysis run --rm grade-analysis-worker

# Trên máy phát triển
cd src/GradeAnalysisWorker
pip install -r requirements.txt
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=khaosatvmu;Username=postgres;Password=..." \
CourseGrades__EncryptionKeys__1="<cùng khóa với API>" python -m grade_worker
```

| Biến môi trường | Ý nghĩa |
|---|---|
| `ConnectionStrings__DefaultConnection` | Chuỗi kết nối kiểu .NET, dùng chung với API |
| `GRADE_WORKER_DATABASE` | Ghi đè chuỗi kết nối, nên trỏ tới user `grade_worker` (`deploy/postgres/grade-analysis-worker-role.sql`) |
| `CourseGrades__EncryptionKeys__<n>` | Khóa AES-256 base64, **phải trùng khóa của API** |
| `GRADE_WORKER_PROCESSES` | Số tiến trình chạy mô hình hỗn hợp; mặc định 1 |

Mã thoát: 0 = xong hoặc không có việc, 1 = có lượt tính lỗi (lỗi ghi vào `GradeAnalysisRuns.ErrorMessage`,
không kèm dữ liệu điểm), 2 = cấu hình sai.

## Số đo (4 kỳ thật, 319.821 dòng điểm, container 1 CPU / 768 MB)

- Khoảng 3 phút mỗi lượt, bộ nhớ cao nhất khoảng 435 MB.
- Kết quả trùng bộ tính gốc chạy trên file ở mọi chỉ số của 7.640 lớp và 1.850 học phần, trừ 5 học phần
  có điểm quá trình trùng hệt điểm thi (xem dưới).
- Chạy trên Windows và trong container Linux cho cùng kết quả.

## Khác với bản gốc (có chủ ý)

1. **Thứ tự cố định.** Bộ tính nhạy với thứ tự dòng (p-value Monte Carlo của H4, điểm dừng của
   `statsmodels.MixedLM`). Worker sắp lớp theo (mã HP, nhóm) và dòng theo (mã HP, nhóm, StudentId), nên
   cùng dữ liệu luôn cho cùng số, kể cả sau khi nạp lại.
2. **Kiểm định F khi X trùng hệt Y.** Bản gốc chỉ bỏ qua khi phần dư bằng đúng 0; phần dư ~1e-29 do nhiễu
   số học cho p = 0 hay p = 1 tùy nền tảng, và đã bật cờ H1 sai cho học phần 22729 (HK1 2024–2025) và
   22728 (HK2 2025–2026). Nay coi phần dư nhỏ hơn 1e-10 lần tổng biến thiên là không kiểm định được.
3. **G1 khi chưa có cặp giảng viên – học phần nào** (mọi lớp chưa xác định giảng viên) trả `None` thay vì lỗi.
4. **Học kỳ phụ**: mã kỳ `NNNN_HKP`, đứng đầu năm học; cửa sổ G1 4 kỳ chính = trọn 2 năm học, gồm cả học kỳ phụ.
5. **Giảng viên** nhận diện bằng `LecturerId`; lớp chưa có email giảng viên hoặc "giảng viên" là đơn vị
   (Trung tâm…) không vào G1 và xu hướng giảng viên. Kết quả chỉ chứa `lecturer_id`, không có tên hay email.
