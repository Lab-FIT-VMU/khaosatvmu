# Kế hoạch: fix cứng mục câu hỏi + màn "Thống kê theo mục"

Ngày lập: 11/09/2026 · Nhánh: `hoang4`

## 1. Bối cảnh

Đúng ra mỗi bài khảo sát chỉ nên đánh giá một mục. Nhưng bản khảo sát đợt này do
phòng Khảo thí & ĐBCL ban hành đã gộp cả ba mục vào một bài, không kịp yêu cầu
tách lại. Đợt khảo sát đã bắt đầu chạy trên hệ thống thật, nên **mọi thay đổi về
cấu trúc CSDL đều buộc phải làm lại cả đợt** — tuyệt đối không được đụng vào.

Vì vậy làm một lớp xử lý tạm: khoá danh mục mục lại thành 3 giá trị cố định, rồi
dựng thêm một màn theo dõi riêng tách điểm theo mục. Sau này khi Khảo thí tách bộ
đề ra thành các bài riêng thì chỉ cần bỏ phần khoá danh mục, màn thống kê vẫn
chạy đúng vì nó gộp theo mục chứ không gộp theo bài.

## 2. Phạm vi

**Sửa:** duy nhất chỗ nhập tên mục trong trình soạn bộ câu hỏi (đang để tự do).

**Thêm mới:** một màn "Thống kê theo mục" đứng riêng, endpoint riêng, DTO riêng.

**Không đụng tới:**

- Schema CSDL — không bảng mới, không cột mới, không migration
- Dữ liệu đang có — không UPDATE, không sửa tên mục sẵn có trong DB
- Mọi báo cáo / thống kê hiện tại: `SurveyAnalysisPage`, `ReportsOverviewPage`,
  `SurveyDashboardPage`, Bảng dữ liệu khảo sát, chuẩn hoá Z-score, báo cáo giảng viên
- Cách tính điểm tổng — vẫn là trung bình 24 câu như hiện tại
- Không cần bấm "Tính lại điểm" lại cho đợt đang chạy

## 3. Hiện trạng

Bộ đề duy nhất đang dùng (`SurveyTemplateId = 3`) có 3 mục, 26 câu, 2 câu bẫy:

| SectionId | Tên mục trong DB | Số câu | Câu bẫy |
|---|---|---|---|
| 3 | Nội dung đánh giá học phần | 11 | 1 |
| 4 | Nội dung đánh giá về giảng viên | 12 | 1 |
| 5 | Nội dung đánh giá về cơ sơ vật chất, phục vụ học tập | 3 | 0 |

Mục 5 trong DB đang gõ thiếu dấu ("cơ sơ"). **Không sửa dòng này** — phần ánh xạ
ở mục 4 dưới đây so bằng tên đã bỏ dấu nên vẫn khớp.

Ràng buộc hiện có: tối đa 10 mục/bộ, tên mục bắt buộc, không trùng trong cùng bộ,
mục thuộc riêng một bộ đề. Bộ đã thu phiếu thì chỉ sửa được chữ, không đổi được
mục của câu ([EfSurveyService.cs:310](src/Backend/Infrastructure/Surveys/EfSurveyService.cs#L310)).

## 4. Phần A — Fix cứng 3 mục

### A1. Danh mục cứng (backend)

Thêm vào [SurveyContracts.cs](src/Backend/Application/Surveys/SurveyContracts.cs)
một lớp `SurveySectionCatalog` cạnh `SurveyRules`:

| Khoá | Tên chuẩn |
|---|---|
| `COURSE_CONTENT` | Nội dung đánh giá học phần |
| `LECTURER` | Nội dung đánh giá về giảng viên |
| `FACILITIES` | Nội dung đánh giá về cơ sở vật chất, phục vụ học tập |

Kèm hàm `Resolve(string sectionName) → string?` trả về khoá, so bằng tên đã
**chuẩn hoá**: bỏ dấu tiếng Việt, hạ chữ thường, gộp khoảng trắng, bỏ dấu câu.
Nhờ đó "cơ sơ" trong DB khớp "cơ sở" trong danh mục mà không phải sửa dữ liệu.

`MaximumSectionsPerTemplate` giữ nguyên là 10
([SurveyContracts.cs:731](src/Backend/Application/Surveys/SurveyContracts.cs#L731))
— trần thật lúc này là 3 vì danh mục chỉ có 3 khoá và đã chặn trùng khoá.

### A2. Chặn ở lúc lưu (backend)

Trong luồng lưu bộ câu hỏi
([EfSurveyService.cs:224](src/Backend/Infrastructure/Surveys/EfSurveyService.cs#L224)
tạo mới, [:332](src/Backend/Infrastructure/Surveys/EfSurveyService.cs#L332) cập nhật):

- Tên mục không thuộc danh mục → lỗi mới `SURVEY_SECTION_NAME_NOT_ALLOWED`
- Hai mục cùng quy về một khoá → dùng lại lỗi `SURVEY_SECTION_NAME_EXISTS` sẵn có
- Ghi vào DB là **tên chuẩn** của khoá, không phải chuỗi người dùng gửi lên

Mục cũ không khớp danh mục vẫn **đọc và hiển thị bình thường**, chỉ không lưu mới
được — để bộ đề của các đợt đã chốt không bị khoá cứng không sửa nổi.

### A3. Trình soạn bộ câu hỏi (frontend)

- [types/index.ts](src/Frontend/src/types/index.ts): thêm hằng `surveySectionCatalog`
  (bản sao của danh mục BE — khoá + tên chuẩn)
- [SurveyTemplatesPage.tsx:759](src/Frontend/src/pages/SurveyTemplatesPage.tsx#L759):
  đổi ô `<input>` tên mục thành `<select>` 3 lựa chọn; khoá đã dùng ở mục khác thì
  ẩn khỏi danh sách chọn
- Nút "Thêm mục" tắt khi đã dùng đủ 3 khoá, đổi phần đếm `x/10 mục` thành `x/3 mục`
- [surveyTemplateImportExcel.ts](src/Frontend/src/utils/surveyTemplateImportExcel.ts):
  file mẫu tải về ghi sẵn 3 tên chuẩn; lúc đọc file, mục ngoài danh mục báo lỗi
  dòng với lý do mới `NOT_IN_CATALOG` (cùng chỗ với `MISSING` / `NOT_CONTIGUOUS`)
- Thêm bản dịch tiếng Việt cho mã lỗi mới

### A4. Kiểm thử phần A

Bổ sung vào [SurveyServiceTests.cs](tests/UnitTests/Application/SurveyServiceTests.cs):

- `Resolve` khớp tên đúng dấu, sai dấu, khác hoa/thường, thừa khoảng trắng
- `Resolve` trả null với tên ngoài danh mục
- Lưu bộ đề với mục ngoài danh mục → `SURVEY_SECTION_NAME_NOT_ALLOWED`
- Lưu hai mục quy về cùng khoá → `SURVEY_SECTION_NAME_EXISTS`
- Ba mục hiện có trong DB (kể cả mục 5 thiếu dấu) đều resolve ra đủ 3 khoá

## 5. Phần B — Màn "Thống kê theo mục"

### B1. Nguồn số liệu — đã có sẵn

Bảng `CourseSectionSurveyQuestionScores` lưu điểm + số lượt trả lời của **từng câu
× từng lớp**, ghi ở lần bấm "Tính lại điểm"
([EfSurveyService.cs:1965](src/Backend/Infrastructure/Surveys/EfSurveyService.cs#L1965)).
Bảng này đã loại sẵn câu bẫy và câu tự nhập, và chỉ có dòng cho lớp qua được hai
vòng lọc — tức **cùng một ảnh chụp** với điểm tổng và với mọi báo cáo khác, nên hai
con số không bao giờ lệch nhau về thời điểm.

Không cần bảng mới, không cần cột mới, không cần tính lại đợt.

### B2. Thuật toán

1. Lấy các lớp đã chốt điểm của đợt — dùng lại
   [`ScoredSectionSurveyIdsAsync`](src/Backend/Infrastructure/Reports/EfReportService.cs#L102)
2. Một query gộp trong Postgres: join `CourseSectionSurveyQuestionScores` ×
   `SurveyQuestions` × `SurveyQuestionSections`, `GROUP BY (CourseSectionSurveyId, SectionId)`,
   lấy `sum(AverageScore × AnswerCount)` và `sum(AnswerCount)`
3. Quy `SectionId` → khoá cứng bằng `SurveySectionCatalog.Resolve(SectionName)`
4. Quy lớp → bộ môn → khoa **theo đúng đường của**
   [`GetFacultyDepartmentReportsAsync`](src/Backend/Infrastructure/Reports/EfReportService.cs#L566)
   (qua giảng viên của lớp), để màn mới và báo cáo bộ môn/khoa nói cùng một con số
5. Gộp có trọng số theo từng phạm vi (toàn trường / khoa / bộ môn), làm tròn 2 chữ
   số **ở bước cuối cùng** — đúng công thức
   [`QuestionScoreSnapshotsAsync`](src/Backend/Infrastructure/Reports/EfReportService.cs#L122)
   đang dùng, chỉ đổi trục gộp từ câu sang mục

Khối lượng: số dòng đọc về = số lớp × 3 (~2000 lớp → ~6000 dòng). Chưa cần cache.

> **Lưu ý về đường quy lớp về đơn vị.** Trong mã đang có hai đường: theo giảng viên
> (báo cáo bộ môn/khoa) và theo học phần rồi mới tới giảng viên
> ([EfSurveyService.cs:748](src/Backend/Infrastructure/Surveys/EfSurveyService.cs#L748)).
> Chọn đường thứ nhất để khớp với bảng tổng hợp bộ môn/khoa mà người dùng sẽ mở
> cạnh màn mới. Cần chốt trước khi code.

### B3. Backend

[ReportContracts.cs](src/Backend/Application/Reports/ReportContracts.cs) — DTO mới,
không sửa DTO nào đang có:

```csharp
SurveySectionScoreDto(string SectionKey, string SectionName,
                      decimal? AverageScore, int AnswerCount, int QuestionCount)

SurveySectionScoreGroupDto(int? Id, string Name, int SectionCount,
                           IReadOnlyList<SurveySectionScoreDto> Sections)

SurveySectionScoreReportDto(int SemesterSurveyId, string SurveyName,
                            string SemesterName, string TemplateName,
                            int ScoredSectionCount,
                            decimal? OverallAverageScore,
                            IReadOnlyList<SurveySectionScoreDto> School,
                            IReadOnlyList<SurveySectionScoreGroupDto> Faculties,
                            IReadOnlyList<SurveySectionScoreGroupDto> Departments)
```

Trả về dạng **danh sách mục** chứ không phải hai trường cứng — sau này bật mục Cơ
sở vật chất hoặc Khảo thí đổi danh mục thì chỉ sửa FE, không đụng BE.

- `IReportService` + `EfReportService`: thêm `GetSurveySectionScoreReportAsync(int semesterSurveyId, ct)`
- [ReportEndpoints.cs](src/Backend/API/Reports/ReportEndpoints.cs): thêm
  `MapGet("/section-scores")` vào nhóm sẵn có (`REPORTS_ACCESS`)

### Quyền truy cập — chỉ quản trị

Màn này **chỉ mở cho quản trị** (`ADMIN` và `SURVEY_ADMIN`), đúng bằng
`UserScope.SeesEverything` ([EfUserScopeResolver.cs:41](src/Backend/Infrastructure/Auth/EfUserScopeResolver.cs#L41)).

**Không thêm quyền mới** — thêm quyền là thêm dòng vào `Permissions` và
`RolePermissions`, tức đụng dữ liệu đang chạy.

Chặn ngay trong hàm xử lý endpoint: nhận thêm `IUserScopeResolver`, gọi
`ResolveAsync`, không `SeesEverything` thì `Results.Forbid()`. Cùng ý với
`CheckAdminOnly` bên danh mục
([EfCatalogService.cs:2168](src/Backend/Infrastructure/Catalog/EfCatalogService.cs#L2168)).

Chặn ở endpoint chứ **không** thêm tham số vào constructor của `EfReportService`:
hai test đang tự dựng service bằng `new EfReportService(db, cache, cacheVersion)`
([SchoolOverviewScoreThresholdTests.cs:53](tests/UnitTests/Infrastructure/SchoolOverviewScoreThresholdTests.cs#L53),
[ReportQueryOptimizationTests.cs:62](tests/UnitTests/Infrastructure/ReportQueryOptimizationTests.cs#L62)),
đổi constructor là vỡ cả hai.

### B4. Frontend

Trang mới `src/Frontend/src/pages/SurveySectionScoresPage.tsx`, tab id
`survey-section-scores`:

- [Sidebar.tsx:94](src/Frontend/src/components/Sidebar.tsx#L94): thêm mục **"Thống
  kê theo mục"** vào nhóm `TỔNG QUAN`, ngay dưới "Thống kê chi tiết" — mục to đứng
  riêng, sau này muốn hạ xuống làm mục con của mục khác chỉ là đổi chỗ một dòng.
  Chỉ hiện với quản trị: lọc thêm bằng `isUnrestrictedRole(activeProfile?.roleCode)`
  ([roles.ts:16](src/Frontend/src/auth/roles.ts#L16)), giống cách "Bảng điều khiển"
  đang bị đóng bằng `canAccessDashboard` tại
  [Sidebar.tsx:142](src/Frontend/src/components/Sidebar.tsx#L142)
- [modulePermissions.ts:6](src/Frontend/src/auth/modulePermissions.ts#L6):
  `'survey-section-scores': 'REPORTS_ACCESS'` — ẩn menu chỉ để cho gọn mắt, chặn
  thật nằm ở endpoint
- [Header.tsx:25](src/Frontend/src/components/Header.tsx#L25): tiêu đề trang
- [App.tsx:107](src/Frontend/src/App.tsx#L107): thêm id vào `canLoadSurveyOperations`;
  [:629](src/Frontend/src/App.tsx#L629) thêm nhánh render
- `services/surveyApi.ts`: hàm gọi endpoint mới

Nội dung màn:

1. Ô chọn đợt khảo sát, dựng theo đúng cách các trang thống kê khác đang làm (theo
   commit `cf50e2d`)
2. Hai thẻ KPI lớn: **Điểm mục Học phần** và **Điểm mục Giảng viên**, kèm điểm tổng
   24 câu để đối chiếu
3. Bảng theo khoa: Khoa | Số lớp | Điểm HP | Điểm GV | Chênh lệch
4. Bảng theo bộ môn, lọc được theo khoa
5. Xuất Excel bằng `ExportDropdown` có sẵn
6. Mục Cơ sở vật chất: API trả về cả 3 mục, FE ẩn bằng một hằng `visibleSectionKeys`
   — bật lại là sửa một dòng

### B5. Kiểm thử phần B

- Unit test phép gộp trọng số: hai lớp cùng mục, số phiếu lệch nhau → điểm mục phải
  nghiêng về lớp nhiều phiếu, không phải trung bình cộng
- Lớp chưa chốt điểm không được góp vào bất kỳ con số nào
- Mục ngoài danh mục không làm vỡ báo cáo
- Trưởng bộ môn và giảng viên gọi thẳng endpoint → 403, không phải chỉ ẩn menu
- Đối chiếu tay trên DB thật bằng SQL:

```sql
SELECT s."SectionName",
       round(sum(q."AverageScore" * q."AnswerCount") / sum(q."AnswerCount"), 2) AS diem_muc,
       sum(q."AnswerCount") AS luot_tra_loi
FROM "CourseSectionSurveyQuestionScores" q
JOIN "SurveyQuestions" sq ON sq."QuestionId" = q."QuestionId"
JOIN "SurveyQuestionSections" s ON s."SectionId" = sq."SectionId"
JOIN "CourseSectionSurveys" c ON c."CourseSectionSurveyId" = q."CourseSectionSurveyId"
WHERE c."SemesterSurveyId" = :dot AND c."AverageScore" IS NOT NULL
GROUP BY s."SectionName";
```

## 6. Ba điểm phải nhớ

1. **Điểm tổng không bằng trung bình cộng 2 mục.** Điểm tổng là 24 câu, gồm cả 3
   câu Cơ sở vật chất, lại là trung bình theo phiếu chứ không phải theo mục. Hai
   con số đứng cạnh nhau sẽ không cộng lại khớp — phải ghi chú ngay trên màn hình,
   không thì sẽ bị báo là tính sai.
2. **Lớp chưa chốt điểm không có điểm mục**, hiện dấu "—" giống ô điểm trống ở Bảng
   dữ liệu khảo sát, chứ không tự tính lấy một con số riêng.
3. **Đây là lớp xử lý tạm.** Khi Khảo thí tách bộ đề thành các bài riêng: bỏ phần
   A (khoá danh mục), giữ nguyên phần B.

## 7. Thứ tự làm

| # | Việc | Đụng tới |
|---|---|---|
| 1 | Danh mục cứng + chặn lúc lưu + unit test | `SurveyContracts.cs`, `EfSurveyService.cs`, `SurveyServiceTests.cs` |
| 2 | Dropdown trong trình soạn + import Excel | `SurveyTemplatesPage.tsx`, `types/index.ts`, `surveyTemplateImportExcel.ts` |
| 3 | DTO + service tính điểm mục + unit test | `ReportContracts.cs`, `EfReportService.cs` |
| 4 | Endpoint | `ReportEndpoints.cs` |
| 5 | Màn mới + menu + quyền | `SurveySectionScoresPage.tsx`, `Sidebar.tsx`, `App.tsx`, `Header.tsx`, `modulePermissions.ts`, `surveyApi.ts` |
| 6 | Đối chiếu số liệu với SQL ở B5 | — |

Bước 1–2 và bước 3–5 độc lập nhau, làm song song được.
