# Vận hành module Phân tích điểm học phần

Dành cho người triển khai và quản trị máy chủ. Kiến trúc, quyết định và số liệu nghiệm thu ở
[kế hoạch tích hợp](plans/tich-hop-phan-tich-diem-hoc-phan.md); cách chạy worker ở
[README của worker](../src/GradeAnalysisWorker/README.md).

## 1. Khóa mã hóa điểm

Mọi điểm (X, Y, Z) được mã hóa AES-256-GCM trước khi ghi vào CSDL. API dùng khóa để mã hóa khi nạp,
worker dùng **cùng khóa** để giải mã khi tính.

> **Mất khóa thì không đọc lại được điểm đã nạp.** Cách khôi phục duy nhất là đặt khóa mới rồi nạp lại
> từng kỳ từ file Excel gốc. Vì vậy phải giữ cả khóa lẫn các file điểm gốc.

### Tạo khóa (một lần)

```bash
openssl rand -base64 32
```

Đặt kết quả vào `.env` trên máy chủ, cạnh `docker-compose.yml`:

```bash
COURSE_GRADE_ENCRYPTION_KEY=<chuỗi base64 vừa tạo>
chmod 600 .env
```

`docker-compose.yml` đưa biến này vào cả `api` và `grade-analysis-worker`
(`CourseGrades__EncryptionKeys__1`). Thiếu khóa thì API từ chối nạp điểm (HTTP 503, mã
`COURSE_GRADE_ENCRYPTION_NOT_CONFIGURED`), còn worker thoát với mã 2.

Nếu muốn dùng Docker secret thay cho `.env`: gắn file chứa khóa vào container rồi đặt
`CourseGrades__EncryptionKeyFile=/run/secrets/<tên>` cho cả hai service.

### Sao lưu

- Giữ **hai bản ngoại tuyến** của khóa, ví dụ in giấy niêm phong và USB cất két, do hai người khác nhau giữ.
- Không gửi khóa qua email hay chat. Không commit `.env`.
- Bản sao lưu CSDL **không chứa khóa**. Khôi phục CSDL sang máy khác thì phải mang khóa theo.
- Lưu các file "Điểm học tập của SV theo kỳ" gốc ở nơi có kiểm soát quyền, tách khỏi máy chủ.

### Đổi khóa (khi nghi lộ hoặc theo định kỳ)

Mỗi ô điểm ghi kèm phiên bản khóa đã dùng để mã hóa. Vì vậy có thể thêm khóa mới mà vẫn đọc được dữ liệu cũ:

1. Tạo khóa mới như trên.
2. Thêm vào **cả** `api` và `grade-analysis-worker` trong `docker-compose.yml`:
   ```yaml
   CourseGrades__EncryptionKeys__1: ${COURSE_GRADE_ENCRYPTION_KEY:-}
   CourseGrades__EncryptionKeys__2: ${COURSE_GRADE_ENCRYPTION_KEY_2:-}
   CourseGrades__ActiveKeyVersion: "2"
   ```
   rồi đặt `COURSE_GRADE_ENCRYPTION_KEY_2` trong `.env` và khởi động lại `api`.
3. Từ đây lần nạp mới dùng khóa 2. Dữ liệu cũ vẫn ở khóa 1, nên **phải giữ khóa 1**.
4. Muốn bỏ hẳn khóa 1 (ví dụ khi khóa 1 bị lộ): nạp lại mọi kỳ, vì nạp lại sẽ xóa dòng cũ và mã hóa bằng khóa 2.
   Kiểm tra không còn dòng nào dùng khóa 1:
   ```sql
   SELECT count(*) FROM "StudentCourseGrades" WHERE "KeyVersion" = 1;
   ```
   Kết quả bằng 0 thì mới gỡ khóa 1.

## 2. Triển khai lần đầu

1. **Khóa:** làm như mục 1.
2. **CSDL:** khởi động `api`. API tự áp migration khi chạy, tạo 9 bảng, view `GradeAnalysisInputs` và 33 ngưỡng mặc định.
3. **User CSDL cho worker:** chạy [grade-analysis-worker-role.sql](../deploy/postgres/grade-analysis-worker-role.sql)
   theo hướng dẫn ở đầu file, rồi đặt `GRADE_WORKER_DATABASE` trong `.env`.
4. **Build worker:**
   ```bash
   docker compose --profile grade-analysis build grade-analysis-worker
   ```
5. **Chạy nền:** cài [systemd service](../deploy/systemd/khaosatvmu-grade-analysis.service), worker quét lượt chờ
   mỗi 10 giây nên điểm nạp xong là được tính ngay:
   ```bash
   sudo cp deploy/systemd/khaosatvmu-grade-analysis.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now khaosatvmu-grade-analysis.service
   ```
   Máy cũ đã cài timer thì gỡ đi: `sudo systemctl disable --now khaosatvmu-grade-analysis.timer`.
   Mỗi lượt dùng tối đa 1 CPU và 768 MB, tính 4 kỳ mất khoảng 3 phút.

   Khi API chạy thẳng trên máy có Python hay Docker (máy phát triển, `dotnet run`), API tự chạy worker ngay
   sau khi nạp, không cần service này: bật mục `CourseGrades:AnalysisWorker` (xem `appsettings.Development.json`).
6. **Quyền:** seeder tạo 3 quyền trong nhóm "Phân tích điểm học phần":

   | Quyền | Mở | Cấp sẵn cho |
   |---|---|---|
   | `COURSE_GRADE_UPLOAD_ACCESS` | Tải lên dữ liệu điểm | Quản trị hệ thống, quản trị khảo sát |
   | `COURSE_GRADE_THRESHOLDS_ACCESS` | Ngưỡng phân tích | Quản trị hệ thống, quản trị khảo sát |
   | `COURSE_GRADE_ANALYSIS_ACCESS` | Báo cáo phân tích | Như trên, thêm Ban giám hiệu, quản lý khoa, quản lý bộ môn |

   Quản trị hệ thống và Ban giám hiệu xem toàn trường. Quản lý khoa / bộ môn chỉ xem đơn vị mình.

## 3. Nạp dữ liệu mỗi kỳ

1. **Lớp học phần** (Danh mục đào tạo → Lớp học phần): chọn kỳ, nạp file lớp **có cột email giảng viên**.
   Lớp không có email vẫn được nạp, nhưng không gắn được giảng viên, nên thiếu phần diễn biến giảng viên (G1, xu hướng).
2. **Điểm** (Phân tích điểm học phần → Tải lên dữ liệu điểm): chọn đúng kỳ đó, chọn file, bấm **Xem trước**.
   Trên màn đối soát, kiểm tra:
   - số dòng dùng được và các dòng bị loại theo luật L1–L8;
   - lớp có trong file điểm nhưng không có trong file lớp (B-G1);
   - lớp có trong file lớp nhưng không có điểm (B-G2).
3. Bấm **Xác nhận nạp**. Nạp lại một kỳ đã có điểm thì phải ghi lý do; lần nạp mới thay hẳn lần cũ.
4. Theo dõi ô "Phân tích" ở đầu trang: **Đang chờ tính** → **Đang tính** → **Đã tính xong**.
   Báo cáo hiển thị kết quả của lượt tính xong gần nhất.

Mỗi lần nạp, gỡ kỳ hoặc sửa ngưỡng đều tính lại **mọi kỳ**. Nút **Tính lại** dùng khi đã sửa danh sách
lớp học phần, hoặc khi lượt trước bị lỗi.

## 4. Khi có sự cố

| Hiện tượng | Xử lý |
|---|---|
| "Phân tích: Tính lỗi" | Xem `ErrorMessage` của lượt cuối trong `GradeAnalysisRuns` và log `journalctl -u khaosatvmu-grade-analysis`. Sửa nguyên nhân rồi bấm **Tính lại** |
| Đứng ở "Đang chờ tính" quá 1 phút | Kiểm tra service: `systemctl status khaosatvmu-grade-analysis`. Chạy tay `docker compose --profile grade-analysis run --rm grade-analysis-worker` |
| Worker thoát mã 2 | Sai cấu hình: thiếu khóa, khóa không phải 32 byte base64, hoặc sai chuỗi kết nối |
| Lượt tính lỗi khi giải mã | API và worker đang dùng khóa khác nhau. So khóa của hai service |
| Nạp điểm báo "… chưa có lớp học phần nào" | Nạp file lớp cho kỳ đó trước, ở trang Lớp học phần |

## 5. Thí điểm (giai đoạn 7)

- [ ] Triển khai trên máy chủ thật theo mục 2. Sao lưu khóa xong mới nạp điểm.
- [ ] Nạp lại 4 kỳ thật (2024–2025, 2025–2026) bằng file lớp có email giảng viên.
- [ ] Đối chiếu số liệu với [mục 8 của kế hoạch](plans/tich-hop-phan-tich-diem-hoc-phan.md):
  - số dòng ghép được;
  - số lớp thiếu (B-G1);
  - số lớp chưa có điểm (B-G2).
- [ ] Trao đổi với 2–3 bộ môn về hồ sơ lớp và câu nhận xét.
- [ ] Chốt ngưỡng một lần, rồi giữ cố định để tỷ lệ học phần có điểm lưu ý còn so được giữa các kỳ.
- [ ] Ngừng cập nhật bản GitHub Pages (`Publish-PT-Diem-HP`).
- [ ] Chốt thời hạn giữ điểm thô với bộ phận pháp chế (Nghị định 13/2023/NĐ-CP).
