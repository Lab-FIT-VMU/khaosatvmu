# Z-Score trong báo cáo khảo sát: ngữ cảnh và công thức

## Ngữ cảnh sử dụng

Hệ thống dùng z-score để **chuẩn hoá điểm khảo sát giữa các lớp/khoa có quy mô khác
nhau**, thay vì so trực tiếp điểm trung bình thô. Mục đích: tách biệt hai câu hỏi hay
bị nhầm lẫn khi đọc báo cáo —

1. **Lớp này lệch nhiều hay ít so với các lớp khác?** → dùng z-score theo lớp lẻ.
2. **Khoa này lệch nhiều hay ít so với mặt bằng trường?** → dùng z-score theo trung
   bình nhóm (sai số chuẩn).

Đây là hai phép so sánh khác bản chất, nên dùng hai công thức khác nhau (chi tiết bên
dưới). Nhầm giữa hai công thức từng khiến toàn bộ 14 khoa gom vào ±0.25 và không khoa
nào vượt ngưỡng đáng chú ý — xem `docs/plans/phan-tich-chuyen-sau-cach-tinh-tung-cot.md`
để đọc lại sự cố gốc.

Code hiện thực nằm ở `src/Backend/Infrastructure/Surveys/EfSurveyService.cs`
(`ZScorerOver`, `SampleStandardDeviation`, và khối tính `meanZ` trong
`GetSemesterSurveyNormalizationAsync`). Các ngưỡng bậc lệch nằm ở
`src/Backend/Application/Surveys/ReportThresholds.cs`.

## Công thức 1 — Z-score của một lớp so với nhóm (khoa / trường)

$$z = \frac{x - \bar{x}}{s}$$

- **x**: điểm trung bình của lớp đang xét
- **x̄**: điểm trung bình của cả nhóm (khoa hoặc toàn trường)
- **s**: độ lệch chuẩn mẫu (sample standard deviation) của nhóm, mẫu số **n − 1**:

$$s = \sqrt{\frac{\sum (x_i - \bar{x})^2}{n - 1}}$$

Dùng khi so **một lớp lẻ** với mặt bằng chung — trả lời "lớp này cao/thấp bất thường
so với các lớp khác trong cùng nhóm không?".

Điều kiện áp dụng: nhóm phải có ít nhất **2 lớp** (`MinimumSectionsForNormalization`),
vì n = 1 thì s không tính được (chia cho 0). Nếu mọi lớp cùng điểm (s = 0) cũng trả về
null thay vì chia cho 0.

## Công thức 2 — Z-score của trung bình một nhóm so với nhóm lớn hơn

$$z = \frac{\bar{x}_{nhóm} - \bar{x}_{trường}}{\sigma_{trường} / \sqrt{n}}$$

- **x̄_nhóm**: điểm trung bình của khoa
- **x̄_trường**: điểm trung bình toàn trường
- **σ_trường**: độ lệch chuẩn mẫu của toàn trường (tính trên điểm từng lớp)
- **n**: số lớp trong khoa đó
- Mẫu số **σ/√n** là **sai số chuẩn của trung bình mẫu** (standard error), không phải
  độ lệch chuẩn thô

Dùng khi so **trung bình của một nhóm** (khoa) với **trung bình của nhóm lớn hơn**
(trường) — trả lời "khoa này nhìn chung cao/thấp hơn mặt bằng trường không?".

### Vì sao không dùng chung công thức 1 cho cả hai trường hợp

σ đo độ tản của **một lớp đơn lẻ**. Trung bình của n lớp ổn định hơn một lớp đơn lẻ
đúng **√n lần**, vì các lớp cao và lớp thấp trong khoa triệt tiêu bớt lẫn nhau khi lấy
trung bình. Nếu lấy trực tiếp σ làm mẫu số cho phép so trung bình nhóm, kết quả z sẽ bị
"nén" lại rất nhiều lần → mọi khoa đều trông giống nhau bất kể lệch thật sự bao nhiêu
(đây chính là sự cố đã xảy ra, xem phần Ngữ cảnh ở trên).

## Ba bậc diễn giải z-score (quy tắc thực nghiệm 68-95-99.7)

Áp dụng cho cả hai công thức trên, định nghĩa tại `ReportThresholds`:

| Bậc | Ngưỡng \|z\| | Tỷ lệ trường hợp rơi ra ngoài (phân phối chuẩn) | Ý nghĩa |
|---|---|---|---|
| 1 — Đáng chú ý (`NotableZScore`) | ≥ 1.00 | ~31.7% | Bắt đầu lệch, đưa vào danh sách theo dõi |
| 2 — Lệch rõ (`StrongZScore`) | ≥ 2.00 | ~4.6% | Cần xem lại |
| 3 — Lệch rất mạnh (`ExtremeZScore`) | ≥ 3.00 | ~0.3% | Bất thường, cần soi ngay |

## Ngưỡng cảnh báo điểm (WarningScoreCutoff)

Ngoài z-score, hệ thống còn tính **ngưỡng điểm cảnh báo** theo chiều ngược lại — từ z
suy ra điểm:

$$\text{ngưỡng} = \bar{x} - z_{\text{notable}} \times s$$

tức điểm mà tại đó một lớp bắt đầu rơi vào bậc 1 (lệch âm). Dùng để hiển thị "điểm dưới
X thì coi là đáng chú ý" thay vì bắt người đọc tự quy đổi z-score.

## Tóm tắt khi nào dùng công thức nào

| Câu hỏi | Công thức | Mẫu số |
|---|---|---|
| Lớp này so với các lớp khác trong khoa/trường thế nào? | Công thức 1 | s (độ lệch chuẩn) |
| Khoa này so với mặt bằng trường thế nào? | Công thức 2 | σ/√n (sai số chuẩn) |

## Áp dụng ở đâu trong hệ thống

### Công thức 1 — `ZScorerOver` / `WarningScoreCutoff`

Hàm `ZScorerOver` (z trực tiếp trên từng lớp) và `WarningScoreCutoff` (suy ngược
`x̄ − z·s` để ra mốc điểm cảnh báo) đều dựng trên cùng `SampleStandardDeviation`, nên
gộp chung một nhóm:

| Nơi dùng | Backend | Endpoint | Frontend |
|---|---|---|---|
| Tab **"Phân tích theo lớp"** — cột `zSchool` (so toàn trường), `zFaculty` (so trong khoa) | `GetLecturerSurveyReportAsync` gọi `ZScorerOver` 3 lần (toàn trường / khoa / bộ môn) → `schoolZ`, `facultyZ`, `departmentZ` | `GET /semester-surveys/{id}/normalization` | `SurveyAnalysisPage.tsx` → `NormalizationSectionTab` |
| Tab **"Báo cáo giảng viên"** — cùng cột `zSchool`, `zFaculty` cho các lớp của một giảng viên | `GetLecturerSurveyReportAsync` (cùng khối `ZScorerOver` ở trên, tái dùng cho `LecturerSectionDto`) | `GET /semester-surveys/{id}/lecturers/{lecturerId}` | `SurveyAnalysisPage.tsx` (khối báo cáo giảng viên cuối file) |
| Tab **"Đánh giá học phần"** (chẩn đoán học phần) — dùng mốc cảnh báo để so lớp cao nhất/thấp nhất trong cùng học phần | `GetSemesterSurveyCourseDiagnosisAsync` → `BuildCourseDiagnosisAsync` nhận `WarningScoreCutoff` tính trên toàn bộ lớp của đợt | `GET /semester-surveys/{id}/course-diagnosis` | `SurveyAnalysisPage.tsx` (khối chẩn đoán học phần) |
| Tab **"Tổng hợp theo bộ môn"** — mốc cảnh báo cho từng bộ môn | `GetSemesterSurveyDepartmentSummaryAsync` (dòng `warningCutoff = WarningScoreCutoff(...)`) | `GET /semester-surveys/{id}/department-summary` | trang tổng hợp bộ môn |
| Dashboard khoa/viện và dashboard đợt khảo sát | `GetDepartmentDashboardAsync`, `GetSemesterSurveyDashboardAsync` (đều gọi `WarningScoreCutoff`) | `GET /semester-surveys/{id}/department-dashboard`, `GET /semester-surveys/{id}/dashboard` | `DepartmentDashboardPage.tsx`, `SurveyDashboardPage.tsx` |

### Công thức 2 — `meanZ` (sai số chuẩn σ/√n)

Chỉ dùng ở đúng **một chỗ**: so **trung bình một khoa** với **trung bình toàn trường**.

| Nơi dùng | Backend | Endpoint | Frontend |
|---|---|---|---|
| Tab **"Mặt bằng khoa/viện"** — cột `meanZScore` ("Z-Score so toàn trường") | `GetSemesterSurveyNormalizationAsync`, khối tính `meanZ` trong vòng `GroupBy(FacultyId)` | `GET /semester-surveys/{id}/normalization` | `SurveyAnalysisPage.tsx` → `NormalizationGroupTab` |

Lưu ý: **cùng một endpoint** `/normalization` trả về cả hai loại z trong hai phần dữ liệu
khác nhau của response — phần `groups` (theo khoa) dùng công thức 2, phần `sections`
(theo từng lớp) dùng công thức 1. Frontend tách chúng ra hai tab riêng
(`normalization` và `normalizationSections`) để người đọc không nhầm hai loại z với
nhau dù cùng nằm trên một trang.
