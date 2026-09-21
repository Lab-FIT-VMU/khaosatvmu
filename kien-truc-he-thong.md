# Hệ thống Khảo sát VMU — Kiến trúc, nghiệp vụ và chức năng

Tài liệu mô tả hệ thống khảo sát chất lượng đào tạo của Trường Đại học Hàng hải Việt Nam
(`khaosatvmu`). Nội dung được dựng lại từ mã nguồn trong [src/](src/) và lược đồ dữ liệu
trong [dtb.md](dtb.md).

- Ngày lập: 14/08/2026
- Nhánh: `hoang`
- Phạm vi: toàn bộ backend .NET 9, frontend React 19 và PostgreSQL 15

---

## 1. Tổng quan hệ thống

| Thành phần | Công nghệ | Vị trí |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite 8, `lucide-react`, `sonner`, `qrcode`, `read-excel-file` / `write-excel-file` | [src/Frontend/](src/Frontend/) |
| Backend | ASP.NET Core 9 Minimal API, kiến trúc 4 lớp | [src/Backend/](src/Backend/) |
| ORM | Entity Framework Core 9 + Npgsql 9 | [src/Backend/Infrastructure/Persistence/](src/Backend/Infrastructure/Persistence/) |
| Database | PostgreSQL 15 (Docker), pgAdmin 4 | [docker-compose.yml](docker-compose.yml) |
| Xác thực | Google OpenID Connect (OIDC) + Cookie phía server | [src/Backend/API/Auth/](src/Backend/API/Auth/) |
| Bảo vệ ghi | Antiforgery token `X-CSRF-TOKEN` | [AuthSetup.cs](src/Backend/API/Auth/AuthSetup.cs) |

Ba nhóm người dùng:

1. **Quản trị hệ thống / Quản trị khảo sát** — đăng nhập bằng Google, quản lý danh mục đào tạo,
   bộ câu hỏi và đợt khảo sát.
2. **Giảng viên** — đăng nhập bằng Google với hồ sơ `LECTURER`.
3. **Sinh viên** — **không đăng nhập**, truy cập bằng link/QR riêng của từng lớp học phần,
   trả lời **ẩn danh**.

---

## 2. Kiến trúc hệ thống

### 2.1 Sơ đồ triển khai và thành phần

```
        Quản trị / Giảng viên                        Sinh viên
           (trình duyệt)                       (điện thoại · quét QR)
                  |                                     |
                  v                                     v
   +----------------------------+        +-----------------------------+
   |  App.tsx — Dashboard SPA   |        |  PublicSurveyPage           |
   |  Sidebar · Header · 18 page|        |  /survey/{LinkToken}        |
   |  (định tuyến theo          |        |  (đứng trước mọi bước       |
   |   window.location.pathname)|        |   kiểm tra đăng nhập)       |
   +-------------+--------------+        +--------------+--------------+
                 |                                      |
                 +-------------------+------------------+
                                     |
                                     v
             +-------------------------------------------------+
             |  services/                                      |
             |    apiClient · authApi · catalogApi              |
             |    surveyApi · adminApi                          |
             |    fetch(credentials:'include') + X-CSRF-TOKEN   |
             +------------------------+------------------------+
                                      |
                    Vite proxy   /api  ---->  localhost:5115
                                      |
                                      v
   +------------------------------------------------------------------+
   |             BACKEND — ASP.NET Core 9 Minimal API  :5115           |
   |                                                                  |
   |     +-------+        +-------------+        +----------------+   |
   |     |  API  |------->| Application |<-------| Infrastructure |   |
   |     +-------+        +-------------+        +-------+--------+   |
   |                                                     |            |
   |                                                     v            |
   |                                               +----------+       |
   |                                               |  Domain  |       |
   |                                               +----------+       |
   +--------------------+---------------------------+----------------+
                        |                           |
      OIDC code + PKCE  |                           |  EF Core / Npgsql
                        v                           v
       +---------------------------+   +--------------------------------+
       |  Google Identity          |   |  PostgreSQL 15 — khaosatvmu    |
       |  accounts.google.com      |   |  pgAdmin 4  :5050              |
       +---------------------------+   +--------------------------------+
```

### 2.2 Kiến trúc phân lớp backend

Bốn project độc lập, phụ thuộc một chiều: `API -> Application <- Infrastructure -> Domain`.

```
   +---------------------------------------------------------------+
   |  API  (Web · Minimal API)                                     |
   |    AuthEndpoints · CatalogEndpoints · SurveyEndpoints ·       |
   |    UserAdministrationEndpoints                                |
   |    AuthSetup · PermissionAuth · ApplicationCookieEvents ·     |
   |    RequireAntiforgeryFilter                                   |
   +----------------------------+----------------------------------+
                                |  gọi qua interface (DI: AddScoped)
                                v
   +---------------------------------------------------------------+
   |  Application  (Hợp đồng — không phụ thuộc EF Core)            |
   |    IAuthService · IAuthSessionService · ICatalogService ·     |
   |    ISurveyService · IUserAdministrationService                |
   |    DTO · Command · *ErrorCodes · *OperationResult<T>          |
   +----------------------------^----------------------------------+
                                |  hiện thực
   +----------------------------+----------------------------------+
   |  Infrastructure  (EF Core 9 + Npgsql)                         |
   |    EfAuthService · EfAuthSessionService · EfCatalogService ·  |
   |    EfSurveyService · EfUserAdministrationService              |
   |    AppDbContext · DatabaseSeeder · 11 Migrations              |
   +----------------------------+----------------------------------+
                                |
                                v
   +---------------------------------------------------------------+
   |  Domain  (POCO thuần, không thuộc tính điều hướng)            |
   |    AuthModels · CatalogModels · SurveyModels                  |
   +---------------------------------------------------------------+
```

**Nguyên tắc đang áp dụng trong mã nguồn:**

- Endpoint chỉ nhận request, gọi service qua interface, rồi ánh xạ `ErrorCode` sang HTTP status
  (hàm `ToResult<T>` trong mỗi file endpoint).
- Kết quả nghiệp vụ trả về dạng `CatalogOperationResult<T>` / `SurveyOperationResult<T>` /
  `AdminOperationResult<T>` chứa `Succeeded`, `Value`, `ErrorCode` — không ném exception cho lỗi nghiệp vụ.
- Frontend nhận `errorCode` và tự dịch sang tiếng Việt (`surveyErrorMessages`, `authMessages`, …).
- Mọi thao tác ghi (`POST/PUT/PATCH/DELETE`) đều đi qua `RequireAntiforgeryFilter`; client lấy token
  ở `GET /api/auth/csrf` rồi gửi header `X-CSRF-TOKEN` (hàm `csrfRequest` trong
  [apiClient.ts](src/Frontend/src/services/apiClient.ts)).

### 2.3 Cơ chế phiên đăng nhập

```
   Request kèm cookie  .khaosatvmu.auth   (HttpOnly · SameSite=Lax · 8 giờ)
                              |
                              v
              +----------------------------------+
              |  ApplicationCookieEvents         |
              |  ValidatePrincipal()             |
              +----------------+-----------------+
                               |
          ValidateAsync( session_id, userId, active_profile_id )
                               |
                               v
              +----------------------------------+
              |  Bảng  AuthSessions              |
              |  ExpiresAt · RevokedAt           |
              +-------+------------------+-------+
                      |                  |
              hợp lệ  |                  |  hết hạn / bị thu hồi / đã đổi hồ sơ
                      v                  v
           +-------------------+   +-----------------------------+
           |     Cho qua       |   |  RejectPrincipal + SignOut  |
           |                   |   |        --> HTTP 401         |
           +-------------------+   +-----------------------------+
```

Phiên **có trạng thái phía server**: cookie chỉ mang `session_id`, mỗi request đều đối chiếu lại
bảng `AuthSessions`, nên đăng xuất hoặc thu hồi phiên có hiệu lực tức thì.

### 2.4 Cấu trúc thư mục

```
   e:\CITAD
   |
   |-- docker-compose.yml          PostgreSQL 15 + pgAdmin 4
   |-- dtb.md                      Lược đồ SQL gốc (bản thiết kế)
   |-- .env / .env.example         Cổng · chuỗi kết nối · Google ClientId/Secret
   |-- implement-plan/             Kế hoạch Google Workspace OAuth
   |-- rules/
   |
   +-- src
       |
       |-- Backend
       |   |-- API/                Minimal API: Auth · Catalog · Surveys · UserAdministration
       |   |-- Application/        Interface + DTO + Command + ErrorCodes
       |   |-- Domain/             AuthModels · CatalogModels · SurveyModels
       |   +-- Infrastructure/     Ef*Service · AppDbContext · DatabaseSeeder · 11 migrations
       |
       +-- Frontend
           |-- src/auth/           AuthContext · authMessages
           |-- src/components/     Sidebar · Header · DataTable · Modal · QRCodeModal · *ImportDialog
           |-- src/pages/          18 trang chức năng
           |-- src/services/       apiClient · authApi · catalogApi · surveyApi · adminApi
           |-- src/utils/          8 bộ đọc/ghi Excel cho import
           +-- src/styles/
```

---

## 3. Mô hình dữ liệu

### 3.1 Sơ đồ quan hệ

**Khối A — Xác thực và phân quyền**

```
  +---------+ 1     n +---------------+ n     1 +---------+ 1   n +-----------------+ n   1 +-------------+
  |  Users  |---------| UserProfiles  |---------|  Roles  |-------| RolePermissions |-------| Permissions |
  +----+----+         +-------+-------+         +---------+       +-----------------+       +-------------+
       |                      |
       | 1                    | 1
       | n                    | n
  +----+-----------+    +-----+---------------------------------+
  | AuthAuditLogs  |    | AuthSessions                          |
  | (nhật ký)      |    | UserId + ActiveProfileId + ExpiresAt  |
  +----------------+    +---------------------------------------+
```

**Khối B — Danh mục đào tạo**

```
   Faculties  (Khoa / Viện)
       |
       |--1:n (SET NULL)---> Departments  (Bộ môn)
       |                          |
       |                          |--1:n (RESTRICT)--> Lecturers  (Giảng viên) ---+
       |                          |                                               |
       |                          +--1:n (RESTRICT)--> Courses    (Học phần) -----+
       |                                                   |                      |
       |--1:n (CASCADE)----> Majors  (Ngành đào tạo)       |                      |
       |                                                   |                      |
       |--1:n (RESTRICT)---> Lecturers, Courses     PrerequisiteCourseId          |
       |                     (gắn trực tiếp khoa)   (tự tham chiếu, RESTRICT)     |
       |                                                                          |
                                                                                  |
   AcademicYears  (Năm học)                                                       |
       |                                                                          |
       +--1:n (CASCADE)----> Semesters  (Học kỳ) ------------------------+        |
                                                                         |        |
                                                                         v        v
                                                       +----------------------------------+
                                                       |         CourseSections           |
                                                       |         Lớp học phần             |
                                                       |  Course + Semester + 1 Giảng viên|
                                                       |  UNIQUE(Course,Semester,Section) |
                                                       +----------------------------------+
```

**Khối C — Khảo sát**

```
   +-----------------+ 1      n +----------------------+
   |  AnswerScales   |----------|  AnswerScaleOptions  |   Value 1..5 + DisplayText
   |  Thang trả lời  |          |  (CASCADE)           |   UNIQUE(ScaleId, Value)
   +--------+--------+          +----------------------+
            | 1
            | n  (RESTRICT)
   +--------+---------+ 1     n +--------------------+
   | SurveyTemplates  |---------|  SurveyQuestions   |   tối đa 30 câu / bộ
   | Bộ câu hỏi       |         |  (CASCADE)         |
   +--------+---------+         +---------+----------+
            | 1                           | 1
            | n  (RESTRICT)               |
   +--------+---------+                   |
   | SemesterSurveys  | <---1:n--- Semesters  (đợt khảo sát của một học kỳ)
   | Đợt khảo sát     |                   |
   +--------+---------+                   |
            | 1                           |
            | n  (CASCADE)                |
   +--------+----------------------+      |
   |   CourseSectionSurveys        | <---1:n--- CourseSections
   |   LinkToken · Start · End     |      |     UNIQUE(SemesterSurveyId, CourseSectionId)
   +--------+----------------------+      |
            | 1                           |
            | n  (CASCADE)                | n  (RESTRICT)
   +--------+----------+ 1        n +-----+------------------------+
   |  SurveyResponses  |------------|  SurveyResponseAnswers       |
   |  Score · Comments |            |  PK(ResponseId, QuestionId)  |
   |  SubmittedAt      |            |  SelectedValue 1..5          |
   +-------------------+            +------------------------------+
```

### 3.2 Ràng buộc nghiệp vụ then chốt

| Ràng buộc | Nơi thực thi |
|---|---|
| Mỗi lớp học phần có đúng **một** giảng viên | FK `CourseSections.LecturerId` NOT NULL |
| `(CourseId, SemesterId, SectionName)` là duy nhất | Unique index |
| `(AcademicYearId, SemesterName)` là duy nhất | Unique index |
| Mỗi thang trả lời có mức giá trị 1..5, không trùng | `CK_AnswerScaleOptions_Value` + unique `(AnswerScaleId, Value)` |
| Mỗi bộ câu hỏi tối đa 30 câu | Kiểm tra ở `EfSurveyService` (thay cho trigger trong dtb.md) |
| Mỗi lớp học phần chỉ có **một** bài khảo sát trong một đợt | Unique `(SemesterSurveyId, CourseSectionId)` |
| `LinkToken` duy nhất toàn hệ thống | Unique index |
| `EndTime > StartTime` | `CK_CourseSectionSurveys_TimeRange` |
| Điểm trả lời 1..5 | `CK_SurveyResponseAnswers_SelectedValue` |
| Mỗi user chỉ có 1 hồ sơ mặc định đang hoạt động | Unique index có filter `IsActive = TRUE AND IsDefault = TRUE` |

### 3.3 Khác biệt giữa `dtb.md` và mã nguồn thực tế

| Trong `dtb.md` | Thực tế trong EF Core |
|---|---|
| `Accounts` + `Roles(int)` (đăng nhập user/password) | Thay bằng `Users` + `UserProfiles` + `Roles(uuid)` + `Permissions` + `RolePermissions`, đăng nhập Google OIDC |
| `Curricula`, `CurriculumCourses` (khung chương trình) | **Chưa hiện thực** — không có entity, không có bảng |
| Trigger `fn_limit_survey_questions` giới hạn 30 câu | Kiểm tra ở tầng service |
| — | Bổ sung `AuthSessions`, `AuthAuditLogs` |

---

## 4. Sơ đồ nghiệp vụ

### 4.1 Bức tranh nghiệp vụ tổng thể

```
   +------------------------------------------------------------------------+
   |  (1)  CHUẨN BỊ DANH MỤC                                                |
   |                                                                        |
   |       Khoa / Viện  ---->  Bộ môn  ---->  Giảng viên  -----+            |
   |       Khoa / Viện  ---->  Ngành đào tạo                    |            |
   |       Bộ môn       ---->  Học phần  ----------------------+            |
   |       Năm học      ---->  Học kỳ  ------------------------+            |
   |                                                            |           |
   |                                                            v           |
   |                                              +---------------------+   |
   |                                              |   LỚP HỌC PHẦN      |   |
   |                                              +---------------------+   |
   +-----------------------------------+------------------------------------+
                                       |
   +-----------------------------------+------------------------------------+
   |  (2)  SOẠN CÔNG CỤ ĐO                                                  |
   |                                                                        |
   |       Thang trả lời (1..5 + nhãn)  ---->  Bộ câu hỏi (tối đa 30 câu)   |
   +-----------------------------------+------------------------------------+
                                       |
                                       v
   +------------------------------------------------------------------------+
   |  (3)  PHÁT ĐỢT KHẢO SÁT                                                |
   |                                                                        |
   |       Chọn: Học kỳ + Bộ câu hỏi + Thời gian mở/đóng                    |
   |             |                                                          |
   |             +--> Đợt khảo sát học kỳ  (SemesterSurvey)                 |
   |                       |                                                |
   |                       +--> Tự sinh 1 bài cho MỖI lớp học phần          |
   |                             (CourseSectionSurvey + LinkToken riêng)    |
   |                                   |                                    |
   |                                   +--> Link + Mã QR riêng từng lớp     |
   +-----------------------------------+------------------------------------+
                                       |
                                       v
   +------------------------------------------------------------------------+
   |  (4)  THU PHIẾU                                                        |
   |                                                                        |
   |       Sinh viên quét QR  -->  trả lời ẩn danh  -->  SurveyResponse     |
   |                                                     + Score trung bình |
   +-----------------------------------+------------------------------------+
                                       |
                                       v
   +------------------------------------------------------------------------+
   |  (5)  KHAI THÁC KẾT QUẢ                                                |
   |                                                                        |
   |       Danh sách phiếu theo lớp  -->  Chi tiết từng phiếu + ý kiến      |
   |       Theo dõi tiến độ thu phiếu                                       |
   +------------------------------------------------------------------------+
```

### 4.2 Luồng đăng nhập Google và chọn hồ sơ làm việc

Điểm đặc thù: **một tài khoản có nhiều hồ sơ** (giảng viên / quản trị khảo sát / quản trị hệ thống),
đăng nhập xong **bắt buộc chọn hồ sơ** rồi mới tạo phiên làm việc.

```
   Người dùng mở trang
          |
          v
   +--------------------------------+
   |  SPA:  GET /api/auth/me        |
   +---------------+----------------+
                   |  { authenticated: false }
                   v
   +--------------------------------+
   |  LoginPage — "Đăng nhập Google"|
   +---------------+----------------+
                   |
                   v
   +--------------------------------+          +---------------------------+
   |  GET /api/auth/login           |--------->|  Google Identity          |
   |  Challenge (code + PKCE)       |          |  accounts.google.com      |
   +--------------------------------+          +-------------+-------------+
                                                             |
                                callback  /signin-google     |
                                (ghi cookie Pending, 10 phút)|
                                                             v
   +----------------------------------------------------------------------+
   |            GET /api/auth/google-complete                             |
   |            tra cứu Users theo GoogleSubject / Email                  |
   +------+-------------------+-------------------------+-----------------+
          |                   |                         |
    không tìm thấy      IsActive = false          hợp lệ, có hồ sơ
          |                   |                         |
          v                   v                         v
   +---------------+  +------------------+   +------------------------------+
   | /login?error= |  | /login?error=    |   |  Redirect  /select-profile   |
   | AUTH_USER_NOT_|  | AUTH_ACCOUNT_    |   |  (giữ cookie Pending)        |
   | REGISTERED    |  | DISABLED         |   +---------------+--------------+
   +---------------+  +------------------+                   |
                                                             v
                              +------------------------------------------------+
                              |  GET   /api/auth/pending-profiles              |
                              |  POST  /api/auth/select-profile { profileId }  |
                              |        + header X-CSRF-TOKEN                   |
                              +----------------------+-------------------------+
                                                     |
                                                     v
                              +------------------------------------------------+
                              |  INSERT AuthSessions (hết hạn sau 8 giờ)       |
                              |  Ghi AuthAuditLogs (LOGIN_SUCCESS)             |
                              |  Set-Cookie  .khaosatvmu.auth                  |
                              +----------------------+-------------------------+
                                                     |
                                                     v
                              +------------------------------------------------+
                              |  Dashboard —  GET /api/auth/access             |
                              |  { roleCode, organizationUnitCode,             |
                              |    permissions[] }  -->  menu hiện theo quyền  |
                              +------------------------------------------------+

   Đổi hồ sơ giữa chừng:  POST /api/auth/switch-profile
                          -->  AuthSessions.ActiveProfileId được cập nhật,
                               phiên cũ lập tức vô hiệu
```

### 4.3 Luồng phát đợt khảo sát học phần

```
   Quản trị chọn:  Học kỳ  +  Bộ câu hỏi  +  Thời gian mở / đóng
                              |
                              v
        +----------------------------------------------------+
        |  POST /api/surveys/semester-surveys                 |
        +---------------------------+------------------------+
                                    |
                                    v
        +----------------------------------------------------+
        |  EfSurveyService.CreateSemesterSurveyAsync          |
        |    - EndTime > StartTime ?                          |
        |    - Học kỳ tồn tại ?   Bộ câu hỏi tồn tại ?        |
        |    - SELECT CourseSections WHERE SemesterId = @id   |
        +---------+---------------------------------+--------+
                  |                                 |
        học kỳ chưa có lớp nào                 có N lớp
                  |                                 |
                  v                                 v
   +-----------------------------+   +-------------------------------------+
   | SURVEY_SEMESTER_HAS_NO_     |   |  INSERT SemesterSurveys             |
   | SECTIONS                    |   |      |                              |
   +-----------------------------+   |      +--> lặp N lần:                |
                                     |           INSERT CourseSectionSurveys|
                                     |           LinkToken = Guid("N")      |
                                     +-----------------+-------------------+
                                                       |
                                                       v
                        +--------------------------------------------------+
                        |  GET /semester-surveys/{id}/sections              |
                        |    -> danh sách bài khảo sát của từng lớp         |
                        |    -> surveyLinkOf(token) = {origin}/survey/{tk}  |
                        |    -> Sao chép link · Hiện mã QR · Phân trang     |
                        +------------------------+-------------------------+
                                                 |
                      +--------------------------+--------------------------+
                      |                                                     |
                      v                                                     v
   +------------------------------------------+   +-------------------------------------+
   | PUT /course-section-surveys/{id}/schedule |   | DELETE /semester-surveys/{id}       |
   | dời lịch mở/đóng riêng cho MỘT lớp        |   | đã có phiếu -> HAS_RESPONSES (chặn) |
   +------------------------------------------+   +-------------------------------------+
```

### 4.4 Luồng sinh viên trả lời khảo sát (ẩn danh)

```
   Sinh viên quét QR / mở link   -->   /survey/{LinkToken}
              |
              |   màn hình này đứng TRƯỚC mọi bước kiểm tra đăng nhập
              v
   +---------------------------------------------------------+
   |  GET /api/public/surveys/{linkToken}                     |
   +----------------------------+----------------------------+
                                |
             +------------------+-------------------+
             |                                      |
     token không tồn tại                      token hợp lệ
             |                                      |
             v                                      v
   +------------------------+   +--------------------------------------------+
   | SURVEY_LINK_NOT_FOUND  |   |  PublicSurveyDto:                          |
   +------------------------+   |    bộ câu hỏi · thang trả lời              |
                                |    mã–tên học phần · lớp · giảng viên      |
                                |    học kỳ · năm học · khung thời gian      |
                                |    isOpen = now thuộc [StartTime, EndTime] |
                                +--------------------+-----------------------+
                                                     |
                 Sinh viên chọn mức 1..5 cho từng câu  +  "Ý kiến khác"
                                                     |
                                                     v
   +----------------------------------------------------------------------+
   |  POST /api/public/surveys/{linkToken}/responses                       |
   +------------------------------------+---------------------------------+
                                        |
                                        v
   +----------------------------------------------------------------------+
   |  Kiểm tra tuần tự:                                                    |
   |     ngoài khung giờ            -->  SURVEY_LINK_NOT_OPEN              |
   |     thiếu / thừa câu trả lời   -->  SURVEY_ANSWERS_INCOMPLETE         |
   |     mức không thuộc thang      -->  SURVEY_ANSWER_VALUE_INVALID       |
   |     ý kiến > 1000 ký tự        -->  SURVEY_COMMENTS_TOO_LONG          |
   +------------------------------------+---------------------------------+
                                        |  hợp lệ
                                        v
   +----------------------------------------------------------------------+
   |  Score = Round( AVG(SelectedValue), 2 )                               |
   |  INSERT SurveyResponses         (1 dòng)                              |
   |  INSERT SurveyResponseAnswers   (N dòng)                              |
   +------------------------------------+---------------------------------+
                                        |
                                        v
                        "Đã ghi nhận phiếu khảo sát"
```

**Tính ẩn danh:** bảng `SurveyResponses` không lưu mã sinh viên, IP hay bất kỳ định danh nào — chỉ
có `CourseSectionSurveyId`, điểm trung bình, ý kiến và thời điểm nộp.

### 4.5 Vòng đời một bài khảo sát của lớp học phần

```
   Tạo đợt khảo sát  (sinh LinkToken)
            |
            v
   +----------------+   now >= StartTime   +---------------+   now > EndTime   +--------------+
   |    CHƯA MỞ     |--------------------->|    ĐANG MỞ    |------------------>|   ĐÃ ĐÓNG    |
   +-------+--------+                      +-------+-------+                   +------+-------+
           |                                       |                                  |
           |                                       |                                  |
   PUT .../schedule                        Sinh viên nộp phiếu               Khai thác kết quả
   (dời lịch, quay lại                     INSERT SurveyResponses            (danh sách + chi tiết
    chính trạng thái này)                                                     từng phiếu)
           |                                       |
           v                                       v
   GET link vẫn xem được phiếu,           Không xóa được đợt nếu đã có phiếu:
   nhưng POST bị chặn:                    SURVEY_SEMESTER_SURVEY_HAS_RESPONSES
   SURVEY_LINK_NOT_OPEN
```

### 4.6 Luồng nhập liệu hàng loạt từ Excel

Áp dụng cho: Khoa/Viện, Bộ môn, Ngành, Học phần, Giảng viên, Lớp học phần, Người dùng, Bộ câu hỏi.

```
   +-------------+     +--------------------------+     +--------------------------+
   |  File .xlsx |---->|  read-excel-file         |---->|  Kiểm tra sơ bộ tại      |
   |             |     |  utils/*ImportExcel.ts   |     |  trình duyệt:            |
   +-------------+     +--------------------------+     |  cột bắt buộc · kiểu dữ  |
                                                        |  liệu                    |
                                                        +------------+-------------+
                                                                     |
                                                                     v
                                            +------------------------------------------+
                                            |  *ImportDialog                           |
                                            |  xem trước + đánh số dòng (rowNumber)    |
                                            +--------------------+---------------------+
                                                                 |
                                                                 v
   +-----------------------------------------------------------------------------------+
   |  POST /api/catalog/{tài-nguyên}/import                                            |
   |  body:  { rows: [ { rowNumber, ... } ] }                                          |
   +----------------------------------------+------------------------------------------+
                                            |
                                            v
   +-----------------------------------------------------------------------------------+
   |  Ef*Service:  tra cứu theo TÊN (FacultyName, DepartmentName, CourseCode, ...)     |
   |               bỏ qua dòng đã tồn tại · gom lỗi theo rowNumber                     |
   +----------------------------------------+------------------------------------------+
                                            |
                                            v
   +-----------------------------------------------------------------------------------+
   |  CatalogImportDto  { imported, skipped, errors[] }                                |
   |     -->  hiện kết quả từng dòng  +  nạp lại danh sách từ server                   |
   +-----------------------------------------------------------------------------------+
```

---

## 5. Phân quyền

```
   VAI TRÒ (seed sẵn)            QUYỀN                POLICY (Program.cs)              ÁP DỤNG
   ------------------            -----                -------------------              -------

   +--------------------+
   |  ADMIN             |---+
   +--------------------+   |
                            |    +----------------+     +--------------------------+
                            +--->|  ADMIN_ACCESS  |---->| PERMISSION_ADMIN_ACCESS  |---> /api/admin/*
                            |    +----------------+     +--------------------------+
                            |
                            |    +----------------+     +--------------------------+
                            +--->|  SURVEY_MANAGE |--+->| PERMISSION_SURVEY_MANAGE |
   +--------------------+   |    +----------------+  |  +--------------------------+
   |  SURVEY_ADMIN      |---+                        |
   +--------------------+                            |  +-----------------------------------+
                                                     +->| PERMISSION_SURVEY_MANAGE_IN_      |
   +--------------------+                               | ORGANIZATION                      |
   | DEPARTMENT_MANAGER |  (chưa gán quyền nào)          | so khớp thêm OrganizationUnitCode |
   +--------------------+                               +-----------------------------------+

   +--------------------+
   |  LECTURER          |  (chưa gán quyền nào)
   +--------------------+
```

- Vai trò gán vào **hồ sơ** (`UserProfiles.RoleId`), không gán trực tiếp vào tài khoản — đổi hồ sơ
  là đổi bộ quyền.
- `DEPARTMENT_MANAGER` và `LECTURER` hiện **chưa được cấp quyền nào** trong `DatabaseSeeder`, nên
  chỉ vào được các API chỉ yêu cầu đăng nhập (`/api/catalog/*`, `/api/surveys/*`).
- Policy `..._IN_ORGANIZATION` giới hạn theo đơn vị: hồ sơ có `OrganizationUnitCode` chỉ tác động lên
  tài nguyên cùng mã đơn vị; hồ sơ để trống mã đơn vị được xem là phạm vi toàn trường.

---

## 6. Các chức năng đã có

### 6.1 Xác thực và phiên làm việc

| Chức năng | Endpoint | Giao diện |
|---|---|---|
| Kiểm tra cấu hình Google | `GET /api/auth/config` | LoginPage |
| Đăng nhập Google OIDC | `GET /api/auth/login` → `GET /api/auth/google-complete` | LoginPage |
| Lấy thông tin phiên hiện tại | `GET /api/auth/me` | AuthContext |
| Lấy quyền của hồ sơ đang dùng | `GET /api/auth/access` | AuthContext, Sidebar |
| Lấy CSRF token | `GET /api/auth/csrf` | apiClient |
| Danh sách hồ sơ chờ chọn | `GET /api/auth/pending-profiles` | ProfileSelectionPage |
| Chọn hồ sơ lần đầu | `POST /api/auth/select-profile` | ProfileSelectionPage |
| Đổi hồ sơ khi đang làm việc | `POST /api/auth/switch-profile` | ProfileSelectionDialog, UserAccountMenu |
| Đăng xuất (thu hồi phiên) | `POST /api/auth/logout` | UserAccountMenu |
| Đăng nhập nhanh khi phát triển | `GET /api/auth/dev/login?email=` | chỉ môi trường Development |
| Nhật ký xác thực | ghi tự động vào `AuthAuditLogs` | UsersAdminPage |

### 6.2 Quản trị người dùng và phân quyền *(cần quyền `ADMIN_ACCESS`)*

| Chức năng | Endpoint |
|---|---|
| Danh sách người dùng (tìm kiếm, lọc trạng thái, phân trang) | `GET /api/admin/users?search&isActive&page&pageSize` |
| Thêm người dùng vào danh sách được phép truy cập | `POST /api/admin/users` |
| Nhập người dùng hàng loạt từ Excel | `POST /api/admin/users/import` |
| Bật / khóa tài khoản (chặn tự khóa chính mình) | `PATCH /api/admin/users/{userId}/status` |
| Tạo hồ sơ cho người dùng (vai trò + đơn vị) | `POST /api/admin/users/{userId}/profiles` |
| Sửa hồ sơ | `PUT /api/admin/users/{userId}/profiles/{profileId}` |
| Bật / tắt hồ sơ (chặn sửa hồ sơ đang đăng nhập) | `PATCH /api/admin/users/{userId}/profiles/{profileId}/status` |
| Danh sách vai trò | `GET /api/admin/roles` |
| Nhật ký xác thực & quản trị (phân trang) | `GET /api/admin/audit-logs?userId&page&pageSize` |

Giao diện: [UsersAdminPage.tsx](src/Frontend/src/pages/UsersAdminPage.tsx), [UserImportDialog.tsx](src/Frontend/src/components/UserImportDialog.tsx).

### 6.3 Danh mục đào tạo *(yêu cầu đăng nhập)*

Tất cả tài nguyên dưới đây đều có đủ **Xem / Thêm / Sửa / Xóa**, phần lớn có thêm **Nhập từ Excel**:

| Tài nguyên | Endpoint gốc | Nhập Excel | Trang |
|---|---|:---:|---|
| Khoa / Viện | `/api/catalog/faculties` | ✅ | FacultiesPage |
| Bộ môn | `/api/catalog/departments` | ✅ | DepartmentsPage |
| Ngành đào tạo | `/api/catalog/majors` | ✅ | MajorsPage |
| Giảng viên | `/api/catalog/lecturers` | ✅ | LecturersPage |
| Học phần (kèm học phần tiên quyết) | `/api/catalog/courses` | ✅ | CoursesPage |
| Năm học | `/api/catalog/academic-years` | — | ClassesPage |
| Học kỳ | `/api/catalog/semesters` | — | ClassesPage |
| Lớp học phần | `/api/catalog/course-sections` | ✅ | ClassesPage |

Đặc điểm đã hiện thực:

- **Xóa an toàn**: API trả mã lỗi khi bản ghi đang được tham chiếu — `CATALOG_FACULTY_IN_USE`,
  `CATALOG_DEPARTMENT_IN_USE`, `CATALOG_COURSE_IN_USE`, `CATALOG_LECTURER_IN_USE`.
- **Chống trùng**: `CATALOG_FACULTY_NAME_EXISTS`, `CATALOG_COURSE_CODE_EXISTS`,
  `CATALOG_LECTURER_EMAIL_EXISTS`, `CATALOG_ACADEMIC_YEAR_NAME_EXISTS`, `CATALOG_SEMESTER_NAME_EXISTS`,
  `CATALOG_COURSE_SECTION_EXISTS`.
- **Import lớp học phần** tự tra cứu giảng viên theo email hoặc họ tên; tên trùng nhiều người trả
  `CATALOG_LECTURER_AMBIGUOUS`.
- Sau mỗi thao tác ghi, frontend **nạp lại danh sách từ server** để id do DB sinh luôn khớp giao diện.

### 6.4 Bộ câu hỏi khảo sát *(yêu cầu đăng nhập)*

| Chức năng | Endpoint |
|---|---|
| Danh sách thang trả lời (kèm các mức) | `GET /api/surveys/answer-scales` |
| Tạo / sửa / xóa thang trả lời (2–5 mức, giá trị 1..5) | `POST` · `PUT /{id}` · `DELETE /{id}` |
| Danh sách bộ câu hỏi (kèm số câu) | `GET /api/surveys/templates` |
| Tạo / sửa / xóa bộ câu hỏi (tối đa 30 câu) | `POST` · `PUT /{id}` · `DELETE /{id}` |
| Nhập bộ câu hỏi từ Excel | `SurveyTemplateImportDialog` → `POST /api/surveys/templates` |

Chặn xóa khi đang được dùng: `SURVEY_ANSWER_SCALE_IN_USE`, `SURVEY_TEMPLATE_IN_USE`.
Giao diện: [SurveyTemplatesPage.tsx](src/Frontend/src/pages/SurveyTemplatesPage.tsx).

### 6.5 Đợt khảo sát học phần *(yêu cầu đăng nhập)*

| Chức năng | Endpoint |
|---|---|
| Danh sách đợt khảo sát (lọc theo học kỳ) | `GET /api/surveys/semester-surveys?semesterId=` |
| Tạo đợt — **tự sinh 1 bài + 1 LinkToken cho mỗi lớp học phần của học kỳ** | `POST /api/surveys/semester-surveys` |
| Xóa đợt (chặn nếu đã có phiếu) | `DELETE /api/surveys/semester-surveys/{id}` |
| Danh sách bài khảo sát theo từng lớp | `GET /api/surveys/semester-surveys/{id}/sections` |
| Xem một bài khảo sát của lớp | `GET /api/surveys/course-section-surveys/{id}` |
| Dời lịch mở/đóng riêng cho một lớp | `PUT /api/surveys/course-section-surveys/{id}/schedule` |
| Danh sách phiếu đã thu của một lớp | `GET /api/surveys/course-section-surveys/{id}/responses` |
| Chi tiết một phiếu (từng câu + ý kiến) | `GET /api/surveys/responses/{responseId}` |

Kèm theo ở giao diện ([CourseSurveysPage.tsx](src/Frontend/src/pages/CourseSurveysPage.tsx),
[SectionSurveyResponsesPage.tsx](src/Frontend/src/pages/SectionSurveyResponsesPage.tsx)):

- Sao chép đường dẫn khảo sát của từng lớp.
- Sinh và hiển thị **mã QR** ngay tại trình duyệt (thư viện `qrcode`, [QRCodeModal.tsx](src/Frontend/src/components/QRCodeModal.tsx)).
- Tìm kiếm, lọc và phân trang danh sách lớp trong đợt.

### 6.6 Phiếu khảo sát của sinh viên *(không cần đăng nhập)*

| Chức năng | Endpoint |
|---|---|
| Mở phiếu bằng link/QR: `/survey/{LinkToken}` | `GET /api/public/surveys/{linkToken}` |
| Nộp phiếu ẩn danh | `POST /api/public/surveys/{linkToken}/responses` |

Phiếu hiển thị đủ ngữ cảnh: tên bộ câu hỏi, mã–tên học phần, tên lớp, giảng viên, học kỳ, năm học,
khung thời gian mở, các mức trả lời và toàn bộ câu hỏi.
Backend tự tính `Score` = trung bình các lựa chọn, làm tròn 2 chữ số.

### 6.7 Tổng quan và theo dõi

| Trang | Trạng thái |
|---|---|
| [DashboardOverview.tsx](src/Frontend/src/pages/DashboardOverview.tsx) — thẻ số liệu, lối tắt vào các danh mục | Số liệu danh mục lấy từ API; “Phiếu đã nộp”, “Điểm hài lòng”, “Lượt quét QR” còn là bộ đếm cục bộ |
| [SurveyProgressPage.tsx](src/Frontend/src/pages/SurveyProgressPage.tsx) — bảng tiến độ thu phiếu theo lớp | Danh sách lớp lấy từ API; số phiếu thực nộp đang cố định 0 (chưa có API tổng hợp) |

### 6.8 Hạ tầng và tiện ích dùng chung

- `DataTable` (tìm kiếm, sắp xếp, phân trang), `Modal`, `InlineTreeWizard`, `AppToaster`,
  `Header`, `Sidebar` (menu theo quyền), `UserAccountMenu`, `AuthLoading`.
- 8 bộ đọc/ghi Excel trong [src/Frontend/src/utils/](src/Frontend/src/utils/) — có cả xuất file mẫu.
- `DatabaseSeeder` tự tạo vai trò, quyền, gán quyền cho vai trò khi khởi động; ở môi trường
  Development tạo thêm tài khoản mẫu `abc@vmu.edu.vn` với 3 hồ sơ.
- `GET /api/health`, `GET /` — kiểm tra dịch vụ sống; `/openapi` bật ở Development.
- 11 migration EF Core, từ `InitialAuthSchema` đến `AddSurveyRunEntities`.

---

## 7. Phần chưa hoàn thiện

Ghi lại đúng hiện trạng mã nguồn để tiện lập kế hoạch tiếp theo:

| Hạng mục | Hiện trạng |
|---|---|
| Khung chương trình (`Curricula`, `CurriculumCourses`) | Có trong `dtb.md`, chưa có entity/bảng/API; `App.tsx` để mảng rỗng |
| Khảo sát **chương trình đào tạo** — [CampaignsPage.tsx](src/Frontend/src/pages/CampaignsPage.tsx), [CriteriaPage.tsx](src/Frontend/src/pages/CriteriaPage.tsx) | Chỉ chạy trên state cục bộ, chưa có API, tải lại trang là mất dữ liệu |
| [StudentSurveyView.tsx](src/Frontend/src/pages/StudentSurveyView.tsx) | Màn hình mô phỏng phiếu cho quản trị xem thử, không gọi API |
| Thống kê / báo cáo tổng hợp điểm theo giảng viên, học phần, khoa | Chưa có endpoint |
| Xuất báo cáo kết quả khảo sát | Chưa có (mới có xuất Excel cho mẫu nhập liệu) |
| Số liệu tiến độ thu phiếu và điểm hài lòng trên Dashboard | Chưa nối API |
| Quyền cho `LECTURER`, `DEPARTMENT_MANAGER` | Chưa gán quyền nào trong `DatabaseSeeder` |
| Định tuyến frontend | Đọc trực tiếp `window.location.pathname`, chưa dùng router |

---

## 8. Chạy hệ thống

```bash
# 1. Database (PostgreSQL 15 + pgAdmin)
docker compose up -d

# 2. Backend — http://localhost:5115
dotnet run --project src/Backend/API

# 3. Frontend — http://localhost:5173 (proxy /api → :5115)
cd src/Frontend && npm install && npm run dev
```

Cấu hình bắt buộc trong `.env`: `ConnectionStrings__DefaultConnection`,
`Authentication__Google__ClientId`, `Authentication__Google__ClientSecret`,
`Authentication__FrontendBaseUrl`. Khi chưa cấu hình Google, `GET /api/auth/config` trả
`googleConfigured: false` và có thể dùng `GET /api/auth/dev/login?email=abc@vmu.edu.vn` để thử.
