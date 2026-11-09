# Kế hoạch tích hợp "Phân tích điểm học phần" vào khaosatvmu

- Ngày lập: 08/11/2026 · Nhánh: `feature/survey-types`
- Nguồn đối chiếu: module audit tại `E:\PRJ\project-audit\project-audit` (bộ luật A–E, mã `xu_ly/`, giao diện `web/`),
  dữ liệu thật tại `E:\PRJ\Du lieu thật` (4 kỳ: 2425_HK1, 2425_HK2, 2526_HK1, 2526_HK2), CSDL `dmp.sql`.
- Tài liệu này là kế hoạch, **chưa kèm mã**. Mọi con số ở mục 8 đo trên dữ liệu thật, chỉ ở dạng số đếm.

---

## Tiến độ (nhánh `hoang12345`)

| Giai đoạn | Trạng thái | Ghi chú |
|---|---|---|
| 0. Bảo mật | Xong một phần | Đã gỡ 11 dump khỏi git, bắt buộc `POSTGRES_PASSWORD`. Chưa: xóa dump khỏi lịch sử git, HTTPS |
| 1. Schema và quyền | Xong | 9 bảng, view `GradeAnalysisInputs`, 33 ngưỡng, 3 quyền |
| 2. Import lớp theo bộ luật B | Xong | Gộp bộ môn, `#N/A`, khoa suy từ bộ môn khi tên khoa trong file không khớp |
| 3. Nạp điểm | Xong | Bộ luật A khớp bản Python từng dòng trên 4 kỳ thật; mã hóa AES-GCM; API xem trước / xác nhận / gỡ kỳ |
| 4. Worker Python | Xong | `src/GradeAnalysisWorker`: kết quả trùng bộ tính gốc trên 4 kỳ thật (trừ 5 học phần X ≡ Y, xem README của worker), Windows và Linux cho cùng số; user CSDL `grade_worker` hạn quyền; systemd timer 5 phút |
| 5. API báo cáo | Xong | `/api/v1/course-grade-analysis`: tổng quan, học phần, lớp (kèm hồ sơ), giảng viên – học phần. Quản trị và Ban giám hiệu xem hết; quản lý khoa / bộ môn chỉ đơn vị mình (kiểm thử trên kết quả thật) |
| 6. Giao diện | Xong | Nhóm menu "Phân tích điểm học phần": Tải lên dữ liệu điểm, Ngưỡng phân tích (sửa / khôi phục mặc định, lưu thì xếp lượt tính lại), Báo cáo phân tích (toàn trường, khoa / bộ môn, lớp và hồ sơ lớp, diễn biến qua các kỳ). Bỏ link GitHub Pages. Đã chạy thử trên Edge với kết quả 4 kỳ thật |
| 7. Thí điểm | Đã chuẩn bị | Thêm tab Thuật ngữ, nút Tính lại; quy trình khóa mã hóa và các bước thí điểm ở [van-hanh-phan-tich-diem-hoc-phan.md](../van-hanh-phan-tich-diem-hoc-phan.md). Còn: triển khai máy chủ thật, nạp file lớp có email, trao đổi với bộ môn, chốt ngưỡng |

## 1. Hiện trạng

| | Module audit (bản đang dùng) | khaosatvmu |
|---|---|---|
| Trên sidebar | Mục "Phân tích điểm học phần" là `externalUrl` tới `minhvima.github.io/Publish-PT-Diem-HP` | — |
| Bản công khai | **Chỉ xem**: `index.html`, `assets/`, `data/*.json` đã tính sẵn | — |
| Nạp dữ liệu | Chỉ có khi chạy `python chay.py` trên một máy cá nhân (trang "Nạp & quản lý học kỳ", "Tham số ngưỡng") | Đã nạp được file lớp (`ImportCourseSectionsAsync`), chưa có sinh viên, chưa có điểm |
| Lưu trữ | File: `kho/ky/<kỳ>/lop.json`, `diem.csv.gz`, `ket_qua.json`; `web/data/*.json` | PostgreSQL 15 |
| Phân quyền | Không có. Quy tắc "Ban giám hiệu không thấy tên GV, mã lớp" chỉ là ẩn trên giao diện | RBAC + `UserScope`, có sẵn vai trò `BOARD_OF_DIRECTORS`, `FACULTY_MANAGER`, `DEPARTMENT_MANAGER` |
| Bộ tính | Python: `numpy`, `scipy`, `statsmodels` (mô hình hỗn hợp REML) | C# .NET 9 |

Vì vậy chức năng **nạp sinh viên, điểm và quản lý kỳ** là chức năng **xây mới** trong khaosatvmu, không phải chuyển từ bản công khai sang.

## 2. Các quyết định đã chốt

| # | Quyết định |
|---|---|
| Q1 | Giữ bộ tính chỉ số bằng **Python** (bộ luật D, E), chạy thành **worker riêng** giống `sentiment-worker`. Nạp file, lưu trữ, API, phân quyền, giao diện làm bằng C#/React. Chuyển bộ tính sang C# để sau, khi phương pháp đã chốt sau thí điểm |
| Q2 | Dữ liệu chuyển hẳn vào PostgreSQL. Bỏ `kho/`, `web/data/`, `pickle` |
| Q3 | File lớp **yêu cầu có email** giảng viên. Lớp không có email xử lý **như code hiện tại** (`LecturerId = null`, tên vào `UnidentifiedLecturerName`, bổ sung qua luồng "giảng viên chưa xác định") |
| Q4 | Có **bảng sinh viên riêng** (`Students`) với tên, khóa, ngành, mã SV của trường; các trường khác để trống được |
| Q5 | Có **bảng điểm** (`StudentCourseGrades`), lưu **từng dòng như file Excel**, xử lý theo bộ luật A |
| Q6 | Điểm được **mã hóa** khi nạp (AES-256-GCM ở tầng ứng dụng) |
| Q7 | Bộ luật A, B (luật loại dòng, công thức X/Y/Z, gộp bộ môn) **cấu hình sẵn trong code** |
| Q8 | Ngưỡng của bộ luật D, E nằm trong **bảng thật** (`GradeAnalysisThresholds`), sửa được trên giao diện |
| Q9 | Không thêm bảng ánh xạ (alias bộ môn, alias giảng viên) |
| Q10 | **Có phân tích học kỳ phụ.** Thứ tự trong năm học theo CSDL hiện có: Học kỳ phụ → Học kỳ 1 → Học kỳ 2. `DefaultSemesterNames` và trang Năm học đều ghi thứ tự này, năm học bắt đầu ngày 25/07. Cách xử lý xem mục 4.5 |
| Q11 | Các phần còn lại **bám theo CSDL hiện có**: họ tên, mã SV để dạng thường giống `Lecturers` (bảo vệ bằng phân quyền; chỉ điểm được mã hóa); khóa và ngành gắn vào bảng `Cohorts` và `Majors` có sẵn; lịch sử nạp theo mẫu `GraduationImportRevision`; bảng kết quả theo mẫu snapshot bất biến của module tốt nghiệp |

## 3. Kiến trúc đích

```
Trình duyệt (React, trang mới trong khaosatvmu)
        │  HTTPS
        ▼
C# API ──────────────────────────────────────────────► PostgreSQL
  - nạp file lớp (đã có), nạp file điểm (mới)            Students, StudentCourseGrades (điểm mã hóa)
  - áp bộ luật A, B; mã hóa điểm                         GradeAnalysisThresholds
  - tạo lượt tính (GradeAnalysisRuns)                    GradeAnalysisRuns + các bảng kết quả (jsonb)
  - trả kết quả theo phạm vi; cấp BGH cắt tên GV, mã lớp
        ▲                                                   ▲
        │ đọc kết quả                                       │ đọc view đầu vào, ghi kết quả
        │                                                   │
        └────────────── grade-analysis-worker (Python) ─────┘
                        xu_ly/: chi_so.py, lien_ky.py, nhan_xet.py (giữ nguyên phần tính)
                        giải mã điểm trong bộ nhớ, không có quyền đọc Students
```

## 4. Mô hình dữ liệu

### 4.1 `Students`

| Cột | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `StudentId` | bigint PK identity | ✓ | Khóa nội bộ |
| `StudentCode` | varchar(16) UNIQUE | ✓ | Mã SV của trường (`f_masv`), dạng chuỗi; mã dài 5–7 chữ số |
| `FullName` | text | ✓ | `f_tensv` |
| `CohortId` | int FK → Cohorts | | Khóa |
| `MajorId` | int FK → Majors | | Ngành đào tạo |
| `AdministrativeClassCode` | varchar(32) | | `f_tenlop`, đã đổi `Ð` → `Đ` |
| `FacultyId` | int FK → Faculties | | |
| `Email`, `PhoneNumber`, `DateOfBirth`, `Gender`, `StudyStatus` | | | Để trống được |
| `CreatedAtUtc`, `UpdatedAtUtc`, `IsDeleted`, `DeletedAt` | | | Theo `ISoftDeletable` |

Khi nạp file điểm:
- **Mã SV mới:** tạo sinh viên.
- **Khóa, ngành:** lớp hành chính (`ĐKT66ĐH`) có cùng dạng với `CohortMajors.CohortMajorCode` (`KPM63ĐH`): mã ngành + số khóa + hệ.
  - Suy `CohortId` (theo `Cohorts.CohortCode`, ví dụ `66`) và `MajorId` (theo `Majors.MajorCode`) bằng bộ đọc mã lớp của module tốt nghiệp. Đọc không được thì để trống.
  - Không dùng thẳng `CohortMajors`: bảng này mới có các khóa đã xét tốt nghiệp. Trên dữ liệu thật, mỗi kỳ chỉ 48–205/293–322 lớp hành chính khớp được mã.
  - Không tự tạo dòng `CohortMajors`, vì bảng đó chứa số liệu tốt nghiệp.
- **Mã đã có nhưng khác họ tên:** không ghi đè, chỉ cảnh báo.
- **Mã lớp lạ:** có lớp hành chính `#N/A`, và mã chứa ký tự có dấu lạ (ví dụ `É`). Để trống khóa, ngành và đưa vào cảnh báo.

### 4.1a `GradeImportRevisions`: lịch sử nạp, theo mẫu `GraduationImportRevision`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `RevisionId` | bigint PK | |
| `SemesterId` | int FK | |
| `RevisionNumber` | int | Lần nạp thứ mấy của kỳ |
| `IsActive` | boolean | UNIQUE (`SemesterId`) WHERE `IsActive`: mỗi kỳ chỉ một lần nạp đang dùng |
| `OriginalFileName`, `SourceSheetName`, `FileHash` | text | Không giữ file gốc |
| `SourceRowCount`, `ImportedRowCount`, `SkippedRowCount` | int | |
| `SkippedSummaryJson` | jsonb | Số dòng bị loại theo L1–L8 và trùng |
| `ReconciliationJson` | jsonb | Lớp chỉ có ở file điểm (B-G1), lớp chưa có điểm (B-G2): chỉ mã lớp và số đếm |
| `ImportedAtUtc`, `ImportedByUserId`, `ImportedByName` | | |
| `ReplaceReason`, `ReplacedRevisionId` | | |

Bảng `StudentCourseGrades` thêm cột `RevisionId` (FK). Nạp lại một kỳ thì tạo revision mới, chuyển `IsActive`, rồi **xóa hẳn** các dòng điểm của revision cũ. Riêng chỗ này không xóa mềm, vì là dữ liệu cá nhân.

### 4.2 `StudentCourseGrades`: mỗi dòng Excel một dòng, giữ cả dòng bị loại

| Cột | Kiểu | Nguồn | Ghi chú |
|---|---|---|---|
| `StudentCourseGradeId` | bigint PK | | |
| `SemesterId` | int FK | kỳ người dùng chọn trước khi nạp | Chọn kỳ rồi nạp, giống trang Lớp học phần (`useSemester()` → `selectedSemesterId` → `importCourseSections`). Không suy kỳ từ `f_nhhk` |
| `StudentId` | bigint FK | `f_masv` | |
| `CourseSectionId` | int FK, rỗng được | ghép (`f_mamh`, `f_loptc`) | Rỗng khi lớp không có trong file lớp (B-G1) |
| `SourceRowNumber` | int | | |
| `SourceTermCode` | varchar(6) | `f_nhhk` | Chỉ lưu nguyên như file, không dùng để xác định kỳ |
| `CourseCode`, `CourseName`, `SectionName` | | `f_mamh`, `f_tenmh`, `f_loptc` | Đã chuẩn hóa: in hoa, bỏ `.0`, NFC |
| `AcademicYearText`, `TermText`, `ExamRound` | text | `f_namhoc`, `f_hocky`, `f_dot` | Giữ nguyên |
| `NoteCode` | varchar(4) | `f_ghichu` | M, B, BS, K, V, P, PK |
| `Component1Enc`, `Component2Enc`, `Component3Enc` | bytea | `f_diem1`–`f_diem3` | Mã hóa |
| `ExamScoreEnc`, `OfficialTotalEnc` | bytea | `f_diemthi`, `f_tbcht` | Mã hóa; `f_tbcht` chỉ để đối chiếu |
| `XEnc`, `YEnc`, `ZEnc` | bytea | bộ luật A | Mã hóa; rỗng khi dòng bị loại |
| `ExclusionRule` | varchar(4) | bộ luật A | `L1`–`L8`, `T` (trùng); rỗng là dòng được dùng |
| `KeyVersion` | smallint | | |
| `ImportedAtUtc`, `ImportedByUserId` | | | |

- UNIQUE (`SemesterId`, `StudentId`, `CourseCode`) WHERE `ExclusionRule` IS NULL. Đây là luật chống trùng của bộ luật A mục 4.
- INDEX (`SemesterId`, `CourseSectionId`), INDEX (`SemesterId`, `StudentId`).
- Nạp lại một kỳ: ghi revision mới (mục 4.1a), rồi trong cùng một transaction xóa hẳn các dòng của revision cũ.

### 4.3 `GradeAnalysisThresholds`: 33 ngưỡng của bộ luật D, E

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `ThresholdCode` | varchar(64) PK | Giữ đúng tên trong `tham_so_chi_so.json` (ví dụ `so_sv_toi_thieu_lop`) |
| `GroupCode` | varchar(32) | `pham_vi`, `co_mau`, `nang_luc_nen`, `kiem_dinh`, `dau_hieu_lop`, `co_hoc_phan`, `co_giang_vien`, `goi_y_ho_so` |
| `DisplayName`, `Description`, `RuleReference`, `Unit`, `SortOrder` | | |
| `ValueType` | varchar(16) | `integer`, `decimal`, `boolean`, `text_list` |
| `NumericValue` / `BooleanValue` / `TextListValue` | | Giá trị đang dùng; CHECK: chỉ cột đúng loại có dữ liệu |
| `DefaultNumericValue` / `DefaultBooleanValue` / `DefaultTextListValue` | | Dùng cho "khôi phục mặc định" |
| `MinValue`, `MaxValue` | numeric | Để giao diện gợi ý |
| `Version` | int | Phiên bản chung ở lần sửa gần nhất của dòng. Phiên bản hiện hành = `MAX(Version)` |
| `UpdatedAtUtc`, `UpdatedByUserId` | | |

- Lịch sử sửa ghi vào `ChangeAuditLog`.
- Kiểm tra liên quan giữa các tham số (chuyển từ `tham_so.kiem_tra`) đặt trong C#, chạy khi lưu.
- Lưu ngưỡng mới thì **tính lại mọi kỳ**.
- Nhóm màu (`mau_sac`) không vào bảng; để trong code giao diện theo quy tắc M1–M5.

### 4.4 Lượt tính và kết quả

Theo mẫu của module tốt nghiệp (Q11): mỗi lượt tính là một snapshot bất biến, không sửa sau khi ghi, và có một con trỏ trỏ tới lượt đang dùng. Các lượt cũ được giữ làm lịch sử, giống các revision import.

| Bảng | Khóa | Nội dung |
|---|---|---|
| `GradeAnalysisRuns` | `RunId` | Trạng thái (chờ / đang chạy / xong / lỗi), `SemesterIds` theo thứ tự thời gian, `ThresholdVersion` + `ThresholdSnapshot` (jsonb), `WorkerVersion`, thời gian, lỗi, `IsCurrent` (UNIQUE WHERE `IsCurrent`), phần liên kỳ không gắn người (`co_hp`, `de_thi`, `de_thi_lech`, `g1_ngau_nhien`) dạng jsonb |
| `GradeAnalysisTermResults` | (`RunId`, `SemesterId`) | `tong`, `xu_huong` của kỳ (jsonb) |
| `GradeAnalysisCourseResults` | (`RunId`, `SemesterId`, `BaseCourseCode`) | `DepartmentId`, `FacultyId`, `Flags` (H1–H6), `StableStates` (O1–O6), `Data` (jsonb) |
| `GradeAnalysisSectionResults` | (`RunId`, `CourseSectionId`) | `LecturerId`, `DepartmentId`, `FacultyId`, `IncludedInStats`, `Markers` (D1–D7), `Data` (jsonb), `Profile` (hồ sơ lớp, jsonb) |
| `GradeAnalysisLecturerCourseResults` | (`RunId`, `LecturerId`, `BaseCourseCode`) | Chuỗi I7 theo kỳ, đặc điểm theo kỳ, G1, câu xu hướng (jsonb) |

- Kết quả **không chứa tên người**: chỉ có `LecturerId`, API điền tên tùy quyền người xem.
- Tính xong mới chuyển `IsCurrent`, nên người xem không thấy số liệu tính dở.

### 4.5 Học kỳ phụ

Bộ tính hiện coi mỗi năm có 2 kỳ cách nhau 6 tháng (`stt_ky`, `thu_tu_ky` trong `chuan_hoa.py`). Khi thêm học kỳ phụ cần sửa như sau, mọi quy tắc viết trong code:

| Nội dung | Hiện tại | Sửa thành |
|---|---|---|
| Thứ tự kỳ | Theo mã `2425_HK1` | Theo `AcademicYear.StartDate`, trong năm: phụ → HK1 → HK2 (Q10) |
| Số thứ tự kỳ (`stt_ky`) | năm × 2 + kỳ | năm × 3 + vị trí trong năm |
| H6: "cách bao nhiêu tháng" | Hiệu số kỳ × 6 | Bỏ số tháng; câu nhận xét chỉ ghi tên kỳ được so (`hp_ky_truoc`), bỏ đoạn "cách {hp_thang_truoc} tháng" trong `mau_nhan_xet.json` |
| G1: cửa sổ `g1_cua_so_ky` = 4 ("4 kỳ là 2 năm") | 4 kỳ gần nhất | Đếm theo **kỳ chính** (HK1, HK2): 4 kỳ = trọn 2 năm học, gồm cả học kỳ phụ đầu mỗi năm học đó |
| H5 (so với các kỳ trước) và H6 (so với lần mở gần nhất) | So với mọi kỳ trước | Giữ nguyên: so với mọi kỳ trước, kể cả học kỳ phụ, không tách theo loại kỳ |
| So sánh trong cùng một kỳ (I1–I10, H1–H4, D1–D7) | | Không đổi |
| Xác định kỳ của file | Đọc từ tên file và `f_nhhk` | **Chọn kỳ rồi nạp**, giống trang Lớp học phần. Không cần biết mã `f_nhhk` của học kỳ phụ |

Học kỳ phụ có nhiều lớp nhỏ, nên phần lớn lớp sẽ không đủ 15 SV để đưa vào thống kê (D-Đ1). Sinh viên cũng thường học ít học phần, nên nhiều SV không đủ 3 lớp để có năng lực nền (D-N1), và I8, H2 sẽ thưa. Hệ thống đã tự báo phần này qua Q1–Q3. Giao diện cần ghi rõ để người đọc không hiểu nhầm.

### 4.6 View và quyền ở cấp CSDL

- **View `GradeAnalysisInputs`:**
  - Gồm các dòng `StudentCourseGrades` có `ExclusionRule IS NULL` và `CourseSectionId IS NOT NULL`.
  - Chỉ trả `StudentId`, `SemesterId`, `CourseSectionId`, các cột điểm mã hóa, mã HP và nhóm.
- **User DB của worker:**
  - Chỉ được đọc view trên, các bảng danh mục và `GradeAnalysisThresholds`.
  - Được ghi các bảng kết quả.
  - Được sửa trạng thái của `GradeAnalysisRuns`.
  - **Không** có quyền với `Students`.

## 5. Các giai đoạn

Mỗi giai đoạn có tiêu chí nghiệm thu đối chiếu với bản Python hiện tại hoặc dữ liệu thật (mục 8).

### Giai đoạn 0. Chuẩn bị và bảo mật (làm trước khi có dữ liệu sinh viên trong CSDL)

- **Gỡ các file dump khỏi git:** 11 file `.sql` đang được theo dõi (ví dụ `dump.sql`, `hieu.sql`, `hhhh.sql`, `database/dump.sql`), chứa tới 3.120 địa chỉ `@vimaru.edu.vn`, đã đẩy lên `Lab-FIT-VMU/khaosatvmu`.
  - Chặn `*.sql` bằng `.gitignore`.
  - Nếu repo từng công khai, xóa khỏi lịch sử commit.
- **Mật khẩu:** bỏ mật khẩu mặc định trong `docker-compose.yml` (`POSTGRES_PASSWORD` mặc định `khaosatvmu@123`, pgAdmin `change-me`), bắt buộc đặt qua `.env`.
- **HTTPS:** `deploy/nginx/default.conf` chỉ `listen 80`. Cần xác nhận có tầng TLS phía trước, hoặc bật HTTPS.
- **Khóa mã hóa:**
  - Tạo khóa, cất trong Docker secret ngoài repo, quyền 600.
  - Có bản sao ngoại tuyến; mất khóa là mất toàn bộ điểm.
- **File "giả lập" của module audit** (`Data/Du lieu gia lap/`): **giữ mã SV thật** (17.652/17.652) và lớp hành chính thật, chỉ thay họ tên và điểm. Phải bảo vệ như dữ liệu thật, không đưa vào repo nào.
- **Chốt các việc ở mục 7.**

### Giai đoạn 1. Schema và quyền

- **Migration EF** cho các bảng ở mục 4, kèm view `GradeAnalysisInputs`.
- **Seed `GradeAnalysisThresholds`** từ `tham_so_chi_so.json` (33 dòng, giá trị mặc định = giá trị đang dùng).
- **Permission mới** theo mẫu module tốt nghiệp (`GRADUATION_ANALYTICS_ACCESS` / `GRADUATION_UPLOAD_ACCESS`):
  - `COURSE_GRADE_ANALYSIS_ACCESS`: xem báo cáo.
  - `COURSE_GRADE_UPLOAD_ACCESS`: nạp file điểm, gỡ kỳ.
  - `COURSE_GRADE_THRESHOLDS_ACCESS`: sửa ngưỡng. Ai được sửa phương pháp do **phân quyền** quyết định: cấp quyền này cho vai trò nào qua màn hình phân quyền vai trò sẵn có (`RolePermissionEditor`), không cố định trong code.
- **Ánh xạ vai trò → cấp báo cáo:**
  - `BOARD_OF_DIRECTORS` → cấp Ban giám hiệu.
  - `FACULTY_MANAGER` → cấp khoa, lọc theo `UserScope`.
  - `DEPARTMENT_MANAGER` → cấp bộ môn, lọc theo `UserScope`.
- **Tạo user DB riêng cho worker** với quyền ở mục 4.6.

**Nghiệm thu:** migration chạy lên và xuống được; user của worker bị từ chối khi `SELECT` trên `Students`.

### Giai đoạn 2. Nạp file lớp: bổ sung bộ luật B vào import hiện có

Giữ nguyên luồng email hiện tại (Q3). Chỉ bổ sung các luật viết trong code:
- **Gộp bộ môn trước khi tra `Departments`:** 194, 195 → 191; mã HP bắt đầu `121` → BM 122. File 2526_HK1 thật có **52 lớp mang mã BM 194/195**; import hiện tại báo `DepartmentNotFound` và bỏ các lớp này.
- **Mã BM là `#N/A` hoặc rỗng:** suy từ 3 số đầu mã HP thay vì bỏ dòng (B-T1). Import hiện tại báo `DepartmentCodeInvalid`.
- **Chuẩn hóa chuỗi theo B-N4:** NFC, đổi `Ð` → `Đ`, gộp khoảng trắng. Hiện chỉ có `Trim().ToLowerInvariant()`.
- **Lớp có GV là đơn vị** ("Trung tâm…"): nhận diện bằng quy tắc trong code để loại khỏi G1 và xu hướng GV ở giai đoạn 4. Mỗi kỳ có khoảng 25–34 lớp như vậy.
- Các luật loại lớp của bộ luật B (24xxx, 27xxx, 179xxx, thực tập) **không** áp ở bước import vì khảo sát vẫn cần đủ lớp. Bộ tính áp chúng khi đọc.

**Nghiệm thu:** nạp 4 file lớp thật không còn dòng nào lỗi bộ môn. Sau khi bộ tính áp bộ luật B, số lớp đúng bằng 1.916 / 1.730 / 2.146 / 1.848.

### Giai đoạn 3. Nạp file điểm (C#, mới)

- **Đọc Excel bằng ClosedXML:**
  - Đọc **sheet đầu tiên**; tên sheet mỗi file một kiểu (`tong hop diem1`, `Diem HK2 2024-2025`, `tonghopdiem1`, `tong hop diem`).
  - Đổi điểm dạng chuỗi có dấu phẩy (luật A-N2): file 2425_HK1 có 53.199 ô như vậy.
  - Mã SV đọc dạng số nguyên, lưu thành chuỗi.
- **Áp bộ luật A theo đúng thứ tự L1–L8:**
  - X = trung bình các điểm thành phần đang có; X = 0 nếu có điểm thành phần < 4.
  - Y = 0 nếu X = 0 hoặc ghi chú `V`.
  - Z = 0 nếu Y < 4, ngược lại Z = 0,5X + 0,5Y.
  - Làm tròn **half-up** 1 chữ số (dùng `decimal`, không dùng `Math.Round` mặc định).
  - Chống trùng (mã SV, mã HP): giữ dòng có Y cao nhất.
- **Ghép với lớp:** ghép (`f_mamh`, `f_loptc`) với `CourseSection` của kỳ. Lớp không có trong file lớp vẫn lưu với `CourseSectionId` rỗng và đưa vào đối soát (B-G1).
- **Sinh viên:** tạo mới hoặc cập nhật `Students` theo mục 4.1.
- **Mã hóa và ghi:** mã hóa các cột điểm (AAD = định danh dòng), ghi bằng Npgsql `COPY` thay cho `AddRange` vì mỗi kỳ có khoảng 100 nghìn dòng.
- **Luồng hai bước:** "chuẩn bị" trả màn hình đối soát, "xác nhận" mới ghi. File chỉ xử lý trong bộ nhớ, không ghi file tạm, không giữ file gốc.
- **Log và thông báo lỗi** không được chứa giá trị của dòng. Không làm theo kiểu `RowValues(rowNumber)` của bộ đọc file tốt nghiệp.
- **Sau khi xác nhận,** tạo một `GradeAnalysisRuns` ở trạng thái chờ.

**Nghiệm thu:**
- Nạp 4 file điểm thật ra đúng các con số ở mục 8.1 (từng luật, từng kỳ) và mục 8.2 (ghép lớp).
- Kiểm thử chéo: C# mã hóa, Python giải mã ra đúng giá trị.

### Giai đoạn 4. Worker Python

- **Đóng gói** `xu_ly/` thành `grade-analysis-worker`: container riêng, profile riêng như `sentiment-worker`.
- **Lớp chuyển đổi** đọc view `GradeAnalysisInputs` và danh mục, dựng đúng cấu trúc `lop` / `diem` mà `chi_so.tinh_ky` đang nhận (khóa lớp vẫn là mã HP + nhóm, `masv` thay bằng `StudentId`). Ngưỡng đọc từ `GradeAnalysisThresholds` thành từ điển giống `tham_so.phang()`.
- **Giữ nguyên** phần tính trong `chi_so.py`, `lien_ky.py`.
- **Sửa nhỏ:**
  - `_khoa_gv` (trong `lien_ky.py` và `nhan_xet.py`) dùng `LecturerId`; bỏ qua lớp chưa xác định GV và lớp có GV là đơn vị.
  - Đầu ra lớp thay `gv`, `email` bằng `lecturer_id`.
  - Câu nhận xét trong `mau_nhan_xet.json` bỏ chỗ chèn tên GV (`{gv}`).
  - Thứ tự kỳ lấy từ `AcademicYear.StartDate` và tên kỳ, thay cho mã `2425_HK1` (`stt_ky`, `thu_tu_ky`).
  - Tắt `ProcessPoolExecutor` khi chỉ có 1 vCPU.
- **Viết lại `kho.py`:** đọc từ CSDL, ghi kết quả theo lượt tính, chuyển `IsCurrent`. Bỏ `chay.py`, `web/`, `pickle`.
- **Chế độ chạy:** quét bảng `GradeAnalysisRuns` lấy việc ở trạng thái chờ, mỗi lúc chỉ một lượt.
- **Tài nguyên:** cần đo RSS lúc cao điểm trước khi đặt `mem_limit`. Ngân sách hiện đã khai 3,0 GB trên máy 4 GB khi tính cả `sentiment-worker` (1,5 GB), nên không cho hai worker chạy cùng lúc.

**Nghiệm thu:**
- Chạy luồng file cũ và luồng CSDL trên cùng dữ liệu: **mọi trường kết quả trùng nhau**.
- 31 kiểm thử hiện có đều đạt.
- Thời gian mỗi kỳ ở mức đã đo (mục 8.4).

### Giai đoạn 5. API

| Nhóm | Đường dẫn (gợi ý) | Quyền |
|---|---|---|
| Nạp điểm | `POST /api/course-grades/import/prepare`, `POST .../import/confirm`, `DELETE /api/course-grades/semesters/{id}` | `COURSE_GRADE_UPLOAD_ACCESS` |
| Ngưỡng | `GET /api/course-grade-thresholds`, `PUT ...`, `POST .../reset` | `COURSE_GRADE_THRESHOLDS_ACCESS` |
| Lượt tính | `GET /api/course-grade-analysis/runs/{id}`, `POST .../runs` (tính lại) | upload / thresholds |
| Báo cáo | `GET .../board`, `.../faculties/{id}`, `.../departments/{id}`, `.../trends` | `COURSE_GRADE_ANALYSIS_ACCESS` + `UserScope` |

- **Mức xem (chốt 09/11/2026):** quản trị hệ thống, quản trị khảo sát và **Ban giám hiệu xem được hết**, kể cả tên giảng viên và dữ liệu cấp lớp (bỏ quy tắc R1 của bản audit). Quản lý khoa / bộ môn chỉ thấy đơn vị của mình (`UserScope`).
- **Không có đường dẫn nào trả dòng điểm của từng sinh viên.**

**Nghiệm thu:** kiểm thử phân quyền cho từng vai trò và từng phạm vi; quản lý bộ môn / khoa không nhận được dữ liệu ngoài đơn vị mình ở bất kỳ đường dẫn nào.

### Giai đoạn 6. Giao diện React

- **Sidebar:** đổi `course-grade-analysis` trong [sidebarMenu.ts](../../src/Frontend/src/components/sidebarMenu.ts) từ một mục `externalUrl` thành **nhóm sổ xuống**, cùng kiểu với nhóm "Thống kê tốt nghiệp" (`graduation-data-upload` + `graduation-statistics`):

  | Mục con | Mã tab (gợi ý) | Quyền | Ghi chú |
  |---|---|---|---|
  | Tải lên dữ liệu điểm | `course-grade-upload` | `COURSE_GRADE_UPLOAD_ACCESS` | Trang mới, làm như trang Lớp học phần: **chọn kỳ rồi nạp** file điểm vào kỳ đó; xem đối soát, xác nhận; danh sách kỳ đã nạp, gỡ kỳ, tính lại; tiến độ lượt tính. Kỳ chưa nạp file lớp thì không cho nạp điểm |
  | Ngưỡng phân tích | `course-grade-thresholds` | `COURSE_GRADE_THRESHOLDS_ACCESS` | Sửa `GradeAnalysisThresholds`, khôi phục mặc định |
  | Báo cáo phân tích | `course-grade-reports` | `COURSE_GRADE_ANALYSIS_ACCESS` | **Trong lúc chuyển tiếp** vẫn là `externalUrl` tới bản chỉ xem; khi các trang báo cáo nội bộ xong thì đổi thành trang trong hệ thống |

  Nhờ vậy mục **tải lên** có thể ra trước (giai đoạn 3), không phải chờ dựng lại toàn bộ trang báo cáo.
- **Các trang cần dựng,** tương ứng các hàm `S.*` trong `web/assets/app.js`:
  - Cấp Ban giám hiệu, Cấp khoa, Cấp bộ môn (có hồ sơ lớp), Diễn biến qua các học kỳ.
  - Nạp & quản lý học kỳ, Tham số ngưỡng, Giải thích thuật ngữ.
- **Biểu đồ:** chuyển các hàm trong `bieu_do.js` (`lineChart`, `scatter`, `barsH`, `dumbbell`, `forest`) thành component.
- **Màu:** giữ quy tắc màu bộ luật D mục 9.2 (không đỏ, cam, xanh lá).
- **Chữ giao diện:** lấy từ `van_ban_giao_dien.json`, chuyển sang frontend.

**Nghiệm thu:** từng trang hiển thị cùng số liệu với bản GitHub Pages hiện tại trên cùng dữ liệu.

### Giai đoạn 7. Thí điểm và chuyển đổi

- Nạp 4 kỳ thật. Đối chiếu kết quả với bản Python chạy theo luồng file.
- Trao đổi với 2–3 bộ môn về câu nhận xét, theo đề nghị trong báo cáo gửi Ban giám hiệu.
- Chốt ngưỡng một lần rồi giữ cố định.
- Gỡ mục link ngoài; ngừng cập nhật `Publish-PT-Diem-HP`.

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Bản C# của bộ luật A lệch bản Python (làm tròn, dấu phẩy, `B` khác `BS`, thứ tự luật) | Nghiệm thu bằng số đếm của 4 file thật (mục 8.1) |
| Lớp chuyển đổi làm đổi kết quả của bộ tính | Kiểm thử đối chiếu luồng file với luồng CSDL, so từng trường |
| Lộ tên GV ở cấp Ban giám hiệu | Cắt ở server; kết quả lưu chỉ có `LecturerId`; có kiểm thử riêng |
| Mất khóa mã hóa | Bản sao ngoại tuyến, quy trình khôi phục ghi thành văn bản |
| Hết RAM máy chủ khi worker chạy cùng `sentiment-worker` | Đo RSS, đặt `mem_limit`, xếp lịch không chồng nhau |
| Lớp không có email, nên G1 và xu hướng GV thiếu dữ liệu | Theo Q3, đếm trong đối soát; trưởng bộ môn bổ sung qua luồng sẵn có |
| Phương pháp còn đổi sau thí điểm | Giữ bộ tính ở Python (Q1); ngưỡng sửa trong bảng (Q8) |

## 7. Việc cần chốt

Đã chốt (08/11/2026): học kỳ phụ có phân tích (Q10); các phần còn lại bám theo CSDL hiện có (Q11). Còn lại:

- **Người giữ phương pháp:** đã chốt, thuộc phân quyền. Ngưỡng của bộ luật D, E do vai trò được cấp `COURSE_GRADE_THRESHOLDS_ACCESS` sửa; bộ luật A, B nằm trong code.
- **Để sau:** thời hạn giữ dữ liệu điểm thô. Mỗi lần đổi ngưỡng phải tính lại mọi kỳ, nên điểm phải còn. Khi xử lý thì hỏi bộ phận pháp chế theo Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân.

## 8. Số liệu nghiệm thu (đo trên dữ liệu thật, 08/11/2026)

### 8.1 Bộ luật A trên 4 file điểm

| Kỳ | Dòng gốc | Giữ lại | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | Trùng |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2425_HK1 | 98.473 | 81.559 | 5.983 | 418 | 5.088 | 207 | 2 | 751 | 4.371 | 46 | 48 |
| 2425_HK2 | 104.192 | 72.220 | 8.146 | 0 | 1.622 | 16.114 | 0 | 4.662 | 1.353 | 74 | 1 |
| 2526_HK1 | 112.024 | 89.624 | 7.154 | 417 | 7.455 | 1.868 | 31 | 1.056 | 4.393 | 0 | 26 |
| 2526_HK2 | 117.195 | 82.601 | 7.785 | 1 | 984 | 19.488 | 9 | 4.774 | 1.522 | 0 | 31 |
| **Tổng** | **431.884** | **326.004** | 29.068 | 836 | 15.149 | 37.677 | 42 | 11.243 | 11.639 | 120 | 106 |

Tổng này khớp bảng tham chiếu ở bộ luật A mục 7. Chênh 120 dòng giữ lại (326.124 → 326.004) đúng bằng luật L8, được thêm sau khi chốt số liệu của mục 7.

### 8.2 Ghép điểm với lớp (bộ luật B)

| Kỳ | Lớp sau bộ luật B | Dòng ghép được | Lớp chỉ có ở file điểm (B-G1) | Lớp chưa có điểm (B-G2) |
|---|---|---|---|---|
| 2425_HK1 | 1.916 | 80.353 / 81.559 | 16 (1.206 dòng) | 108 |
| 2425_HK2 | 1.730 | 70.853 / 72.220 | 20 (1.367 dòng) | 44 |
| 2526_HK1 | 2.146 | 88.080 / 89.624 | 23 (1.544 dòng) | 108 |
| 2526_HK2 | 1.848 | 80.535 / 82.601 | 24 (2.066 dòng) | 45 |

### 8.3 Giảng viên trong file lớp thật

- Cột Email **trống ở cả 7.640 lớp** của 4 file hiện có. Theo Q3, file lớp nạp chính thức phải bổ sung email.
- Có 538 tên GV cá nhân và 2 tên đơn vị.

### 8.4 Thời gian tính một kỳ (máy phát triển)

| Cách chạy | Thời gian mỗi kỳ |
|---|---|
| Python, đa tiến trình | 20–25 s |
| Python, một luồng, `statsmodels` | 39–44 s (khoảng 78% thời gian nằm ở mô hình hỗn hợp) |
| Python, một luồng, REML tự viết (thử nghiệm) | 9–11 s; cờ học phần lệch 3/1.850, đặc điểm lớp lệch 5/7.640 so với `statsmodels` |

## 9. Ánh xạ mã module audit → việc cần làm

| Mã hiện tại | Số phận |
|---|---|
| `xu_ly/luat_a.py`, `luat_b.py` | Dịch sang C# (giai đoạn 2, 3); bản Python giữ làm tham chiếu và đáp án |
| `xu_ly/chuan_hoa.py` | Giữ phần chuẩn hóa chuỗi và nhãn kỳ; bỏ phần sắp kỳ theo mã chuỗi |
| `xu_ly/tham_so.py` | Đọc từ `GradeAnalysisThresholds`; phần kiểm tra chuyển sang C# |
| `xu_ly/chi_so.py`, `lien_ky.py` | Giữ phần tính; sửa khóa giảng viên và đầu ra |
| `xu_ly/nhan_xet.py`, `Data/Bo luat/mau_nhan_xet.json` | Giữ; bỏ chèn tên GV vào câu |
| `xu_ly/kho.py` | Viết lại theo CSDL |
| `chay.py`, `web/`, `kho/` | Bỏ |
| `Data/Bo luat/van_ban_giao_dien.json` | Chuyển sang frontend |
| `Data/Bo luat/tham_so_chi_so.json` | Dữ liệu seed cho `GradeAnalysisThresholds` |
| `tests/` | Giữ; thêm kiểm thử đối chiếu luồng file với luồng CSDL |
