# Phân quyền, luồng chạy và số liệu thực tế

- Ngày lập: 25/08/2026 · Nhánh: `hoang3`
- Số liệu code đọc từ [src/](src/), số liệu dữ liệu đọc trực tiếp từ database `khaosatvmu`
  (container `khaosatvmu_db`, cổng 5433) đúng ngày lập tài liệu.

---

## 1. Nói ngắn gọn thì hệ thống chặn ở ba lớp

Ai mới nhìn vào thường tưởng phân quyền là "ẩn menu đi cho gọn". Ở đây không phải vậy —
giao diện ẩn chỉ là lớp trang trí, còn ba lớp chặn thật nằm ở chỗ khác:

| Lớp | Trả lời câu hỏi gì | Chặn ở đâu | Hỏng thì trả về gì |
|---|---|---|---|
| 1. Danh tính & phiên | Có phải người của trường không, phiên còn sống không | Cookie `.khaosatvmu.auth` + bảng `AuthSessions` | `401` |
| 2. Quyền module & tab | Được vào màn hình nào, tab nào bên trong | `MapGroup(...).RequireAuthorization(policy)` | `403` |
| 3. Phạm vi dữ liệu | Thấy được dữ liệu của ai, sửa được của ai | `UserScope` trong tầng service | Danh sách rỗng hoặc `OUT_OF_SCOPE` |

Ba lớp này độc lập nhau. Một giảng viên có thể qua lớp 1 và 2 (đăng nhập được, vào được
màn hình Lớp học phần) nhưng đến lớp 3 vẫn chỉ thấy đúng lớp mình dạy.

---

## 2. Lớp 1 — Đăng nhập Google và phiên làm việc

Đặc thù của hệ thống: **một tài khoản có thể có nhiều hồ sơ (profile)**, mỗi hồ sơ một vai trò.
Đăng nhập xong chưa được vào ngay, phải chọn hồ sơ đã, vì bộ quyền đi theo hồ sơ chứ không đi
theo người.

```
   Mở trang → GET /api/auth/me → chưa đăng nhập
        |
        v
   GET /api/auth/login  →  Google (code + PKCE)  →  /signin-google
        |                                              (cookie Pending, sống 10 phút)
        v
   GET /api/auth/google-complete   tra Users theo GoogleSubject / Email
        |
        +-- không có tài khoản      → /login?error=AUTH_USER_NOT_REGISTERED
        +-- IsActive = false        → /login?error=AUTH_ACCOUNT_DISABLED
        +-- hợp lệ                  → /select-profile
                                          |
                          POST /api/auth/select-profile { profileId }
                                          |
                                          v
                          INSERT AuthSessions (8 giờ) + AuthAuditLogs
                          Set-Cookie .khaosatvmu.auth (HttpOnly, SameSite=Lax)
                                          |
                                          v
                          GET /api/auth/access → { roleCode, permissions[] }
                                          → menu và tab hiện theo đúng danh sách này
```

Vài con số của lớp này:

| Hạng mục | Giá trị |
|---|---|
| Thời hạn phiên (cookie + bảng `AuthSessions`) | 8 giờ |
| Cookie chờ chọn hồ sơ (`.khaosatvmu.pending-auth`) | 10 phút |
| Endpoint nhóm `/api/auth` | 13 (2 endpoint `dev/*` chỉ bật ở môi trường Development) |
| Bảo vệ ghi | Mọi `POST/PUT/PATCH/DELETE` đi qua `RequireAntiforgeryFilter`, header `X-CSRF-TOKEN` |
| Phiên đã tạo trong DB | 60 |
| Dòng nhật ký xác thực `AuthAuditLogs` | 106 |

Phiên là **có trạng thái phía server**: cookie chỉ mang `session_id`, mỗi request
`ApplicationCookieEvents.ValidatePrincipal()` đều đối chiếu lại bảng `AuthSessions`. Nên
đăng xuất, thu hồi phiên hay đổi hồ sơ đều có hiệu lực ngay, không phải chờ cookie hết hạn.

**Một điểm dễ hiểu nhầm về số liệu:** database đang có **344 tài khoản** nhưng chỉ có
**5 hồ sơ**. Không phải thiếu dữ liệu — mỗi lần thêm giảng viên, `EnsureUserForLecturerAsync`
cố tình chỉ tạo `Users` và nối `Users.LecturerId`, **không tạo `UserProfiles`**
([EfCatalogService.cs:2016](src/Backend/Infrastructure/Catalog/EfCatalogService.cs#L2016)).
Không có hồ sơ thì đăng nhập vẫn bị từ chối, nghĩa là nhập danh sách giảng viên không vô tình
cấp quyền cho 343 người. Cấp quyền vẫn phải là thao tác tay của admin.

- 343/344 tài khoản đã nối với một giảng viên qua `Users.LecturerId`.
- 5 hồ sơ đang có: LECTURER 2, ADMIN 1, SURVEY_ADMIN 1, DEPARTMENT_MANAGER 1.

---

## 3. Lớp 2 — Quyền module và quyền tab

### 3.1 Bộ quyền hiện có: 27 mã, chia 6 nhóm

Trước đây quyền chỉ dừng ở mức module ("vào được trang nào"). Từ commit `844fb91` thì đi sâu
thêm một tầng: **từng tab bên trong một module cũng là một quyền riêng**, và backend chặn ngay
tại endpoint của tab đó chứ không trông vào việc giao diện đã ẩn nút.

| Nhóm (Category) | Số quyền | Trong đó là quyền tab |
|---|---:|---:|
| Báo cáo | 12 | 7 |
| Danh mục đào tạo | 6 | 0 |
| Quản trị hệ thống | 4 | 3 |
| Khảo sát học phần | 2 | 0 |
| Khảo sát chương trình | 2 | 0 |
| Tổng quan | 1 | 0 |
| **Tổng** | **27** | **10** |

Tức là 17 quyền cấp module + 10 quyền cấp tab. Ba module bị bẻ nhỏ ra tới từng tab:

| Module | Tab | Quyền tab |
|---|---|---|
| Thống kê & Báo cáo | Tổng quan | `REPORTS_OVERVIEW_ACCESS` |
| | Tra cứu chi tiết | `REPORTS_DETAILS_ACCESS` |
| | Tổng hợp đơn vị | `REPORTS_RANKINGS_ACCESS` |
| Phân tích chuyên sâu | Mặt bằng khoa/viện + Phân tích theo lớp | `SURVEY_ANALYSIS_NORMALIZATION_ACCESS` (chung 1 quyền) |
| | Tổng hợp theo bộ môn | `SURVEY_ANALYSIS_DEPARTMENTS_ACCESS` |
| | Đánh giá học phần | `SURVEY_ANALYSIS_COURSES_ACCESS` |
| | Báo cáo giảng viên | `SURVEY_ANALYSIS_LECTURER_ACCESS` |
| Người dùng & phân quyền | Tài khoản và hồ sơ | `USER_ADMIN_ACCOUNTS_ACCESS` |
| | Nhật ký hệ thống | `USER_ADMIN_AUDIT_ACCESS` |
| | Phân quyền Module | `USER_ADMIN_PERMISSIONS_ACCESS` |

Hai tab chuẩn hoá điểm dùng chung một quyền là cố ý: chúng đọc chung một endpoint, tách ra hai
quyền thì chỉ ẩn được nút chứ không chặn được dữ liệu — ghi rõ trong
[modulePermissions.ts:46](src/Frontend/src/auth/modulePermissions.ts#L46).

### 3.2 Đường đi của một cú click, từ menu tới database

```
   Sidebar hiện menu           canAccessModule(permissions, moduleId)      ẩn / hiện
        |                      MODULE_REQUIRED_PERMISSION  (17 mục)
        v
   Trang hiện tab              canAccessTab(permissions, module, tab)      ẩn / hiện
        |                      TAB_REQUIRED_PERMISSION      (10 mục)
        |                      firstAllowedTab(...)  → tự nhảy sang tab còn xem được
        v
   fetch /api/...              ---- đây mới là chỗ chặn thật ----
        |
        v
   MapGroup(...).RequireAuthorization(policy đúng của tab)
        |                      35 policy khai báo trong Program.cs
        v
   PermissionAuthorizationHandler / AnyPermissionAuthorizationHandler
        |                      EfAuthService.HasAnyPermissionAsync()
        v
   Roles → RolePermissions → Permissions            không khớp → 403
```

Điểm quan trọng của đợt làm vừa rồi nằm ở dòng "đây mới là chỗ chặn thật": gõ thẳng URL API
của một tab mà không có quyền tab đó thì vẫn ăn `403`, kể cả khi đã vào được module.

Ví dụ trong [UserAdministrationEndpoints.cs:14](src/Backend/API/UserAdministration/UserAdministrationEndpoints.cs#L14) —
ba tab là ba `MapGroup` riêng, mỗi nhóm đòi **hai** policy (quyền module + quyền tab), và không
còn nhóm dùng chung nào:

```csharp
var accountsGroup = endpoints.MapGroup("/api/admin")
    .RequireAuthorization(AuthPolicies.UserAdminAccess, AuthPolicies.UserAdminAccountsAccess);
```

### 3.3 Số liệu phía code

| Hạng mục | Số lượng |
|---|---:|
| Policy khai báo trong [Program.cs](src/Backend/API/Program.cs) | 35 |
| — policy 1 quyền (`PermissionRequirement`) | 26 |
| — policy "một trong nhiều quyền" (`AnyPermissionRequirement`) | 9 |
| Tổng endpoint đã map | 125 |
| — Catalog | 51 |
| — Surveys | 32 (trong đó 3 endpoint công khai cho sinh viên) |
| — UserAdministration | 14 |
| — Auth | 13 |
| — Reports | 9 |
| — GraduationAnalytics | 6 |
| Migration EF Core | 28 |
| Trang React | 25 |
| Component dùng chung | 27 |

Mấy policy dạng "một trong nhiều quyền" sinh ra vì nhiều màn hình đọc chung một nguồn dữ liệu.
Ví dụ `PERMISSION_LECTURERS_READ` nhận bất kỳ quyền nào trong
`DEPARTMENTS_ACCESS · LECTURERS_ACCESS · COURSE_SECTIONS_ACCESS · REPORTS_ACCESS`, vì bốn màn
hình đó đều cần đọc danh sách giảng viên để đổ vào ô chọn. Còn ghi thì vẫn đòi đúng quyền của
tài nguyên: `GET /api/catalog/lecturers` dùng `LecturersRead`, nhưng `POST` thì phải có
`LECTURERS_ACCESS`.

---

## 4. Ma trận vai trò × quyền: seed nói một đằng, DB đang một nẻo

Hệ thống có 4 vai trò, gán vào **hồ sơ** chứ không gán vào tài khoản. `DatabaseSeeder` chỉ tạo
bộ quyền ban đầu, sau đó admin sửa tay được qua tab "Phân quyền Module"
(`PUT /api/admin/roles/{roleId}/permissions`). Nên số liệu thật lệch với seed:

| Vai trò | Seed cấp | DB đang có | Chênh |
|---|---:|---:|---|
| `ADMIN` | 27 | **25** | bị tắt `PROGRAM_CAMPAIGNS_ACCESS`, `PROGRAM_CRITERIA_ACCESS` |
| `SURVEY_ADMIN` | 23 | **23** | đúng seed (không có 4 quyền nhóm quản trị người dùng) |
| `DEPARTMENT_MANAGER` | 12 | **14** | thêm 4, bớt 2 (xem dưới) |
| `LECTURER` | 0 | **4** | được bật thêm 4 quyền module |
| **Tổng dòng `RolePermissions` đang bật** | | **66** | |

Chi tiết hai vai trò bị sửa tay:

- `DEPARTMENT_MANAGER` (14): `PROGRESS_ACCESS`, `SURVEY_STATISTICS_ACCESS`,
  `SURVEY_ANALYSIS_ACCESS`, `LECTURERS_ACCESS`, `COURSES_ACCESS`, `COURSE_SECTIONS_ACCESS`,
  `COURSE_CAMPAIGNS_ACCESS`, 3 quyền tab Báo cáo, 4 quyền tab Phân tích.
  So với seed thì **mất `REPORTS_ACCESS` và `SURVEY_DASHBOARD_ACCESS`**.
- `LECTURER` (4): `PROGRESS_ACCESS`, `COURSES_ACCESS`, `COURSE_SECTIONS_ACCESS`,
  `COURSE_CAMPAIGNS_ACCESS`. Seed để trống hoàn toàn, 4 quyền này là bật tay.

---

## 5. Lớp 3 — Phạm vi dữ liệu (`UserScope`)

Đây là lớp mà quyền module không với tới được. Hai người cùng vai trò `LECTURER`, cùng bộ quyền
y hệt nhau, nhưng mở cùng một màn hình ra thì thấy hai tập dữ liệu khác nhau.

`UserScope` ([UserScope.cs](src/Backend/Application/Auth/UserScope.cs)) dựng từ vai trò của
**hồ sơ đang hoạt động**, rồi tra `Users.LecturerId → Lecturers` để lấy bộ môn và khoa:

| Mức | Vai trò | Thấy gì | Ghi được không |
|---|---|---|---|
| Toàn trường | `ADMIN`, `SURVEY_ADMIN` | Không lọc gì cả | Có |
| Bộ môn | `DEPARTMENT_MANAGER` | Dữ liệu thuộc `DepartmentId` của mình | Có, trong phạm vi bộ môn |
| Chính mình | `LECTURER` | Lớp mình dạy (`CourseSections.LecturerId`) và học phần liên quan | **Không** — `IsReadOnly` chặn mọi thao tác ghi |
| Rỗng | không tra ra hồ sơ giảng viên | Không thấy gì | Không |

Hai chi tiết đáng nhớ trong thiết kế này:

1. **Liên kết bằng khoá ngoại, không so email.** `EfUserScopeResolver` đi đường
   `claims → UserId + ProfileId → Users.LecturerId → Lecturers`. Đổi email không làm đứt phạm vi
   và không phải lo hoa thường hay khoảng trắng.
2. **`SeesNothing` phải trả rỗng, tuyệt đối không rơi vào nhánh không lọc.** Bị giới hạn phạm vi
   mà không biết giới hạn vào đâu (thiếu `DepartmentId`, hoặc thiếu `LecturerId` với giảng viên)
   thì trả danh sách rỗng. Đây đúng là kiểu lỗi phân quyền lọt lưới mà nhìn vẫn như chạy đúng.

Quy mô áp dụng: **33 chỗ** trong backend kiểm `SeesEverything` / `SeesNothing` / `SeesOnlyOwn` /
`IsReadOnly`, nằm ở [EfCatalogService.cs](src/Backend/Infrastructure/Catalog/EfCatalogService.cs)
và [EfSurveyService.cs](src/Backend/Infrastructure/Surveys/EfSurveyService.cs).

Phía frontend có [roles.ts](src/Frontend/src/auth/roles.ts) với `isUnrestrictedRole` và
`isReadOnlyRole`, nhưng comment trong file ghi rõ: hai hàm này **chỉ để ẩn nút cho gọn mắt**,
chặn thật vẫn nằm ở backend.

---

## 6. Luồng sinh viên làm phiếu, và bộ lọc phiếu làm ẩu

Sinh viên **không đăng nhập**, vào bằng link/QR riêng của từng lớp học phần, trả lời ẩn danh.
Ba endpoint công khai, đều nằm ngoài mọi lớp phân quyền ở trên:

```
   Quét QR → /survey/{LinkToken}
        |
        v
   GET  /api/public/surveys/{linkToken}          xem phiếu    (giới hạn 800 request đồng thời)
        |
        v
   POST /api/public/surveys/{linkToken}/start    lấy vé bắt đầu làm bài  (30 lần/phút/IP)
        |    vé có chữ ký, gắn với đúng linkToken và mốc thời gian
        v
   POST /api/public/surveys/{linkToken}/responses   nộp phiếu  (10 lần/phút/IP)
        |
        +--> ngoài khung giờ          → SURVEY_LINK_NOT_OPEN
        +--> thiếu/thừa câu trả lời   → SURVEY_ANSWERS_INCOMPLETE
        +--> mức không thuộc thang    → SURVEY_ANSWER_VALUE_INVALID
        |
        v
   ResponseFilter.Evaluate(câu hỏi, câu trả lời, số giây làm bài)
        |
        +--> hợp lệ    → IsValid = true,  tính vào điểm trung bình lớp
        +--> bị lọc    → IsValid = false, VẪN nhận phiếu, VẪN tính một lượt nộp,
                         chỉ không tham gia điểm trung bình
```

Ba luật lọc trong [ResponseFilter.cs](src/Backend/Application/Surveys/ResponseFilter.cs):

| Mã lý do | Luật | Ngưỡng |
|---|---|---|
| `TOO_FAST` | Làm nhanh hơn mức tối thiểu | 3 giây × tổng số câu (kể cả câu tự luận và câu bẫy) |
| `SINGLE_ANSWER` | Chọn cùng một mức cho mọi câu chấm điểm | Phải từ 2 câu chấm điểm trở lên mới xét |
| `ATTENTION_CHECK_FAILED` | Sai câu bẫy độ tập trung | Sai 1 câu là đủ bị lọc |

Vé bắt đầu làm bài (`SurveyStartTicket`) ký bằng khoá lấy từ cấu hình, không viết trong mã. Vé
thiếu, sai chữ ký, hay của lớp khác đều quy về 0 giây — để luật `TOO_FAST` tự bắt, chứ không mở
đường vòng nào.

---

## 7. Thống kê dữ liệu thật trong database

### 7.1 Phiếu khảo sát

| Chỉ số | Giá trị |
|---|---:|
| Tổng phiếu đã nộp | **66.698** |
| Phiếu hợp lệ (`IsValid = true`) | 59.911 — **89,8%** |
| Phiếu bị bộ lọc loại | 6.787 — **10,2%** |
| Dòng câu trả lời (`SurveyResponseAnswers`) | 2.000.940 |
| Điểm trung bình của phiếu hợp lệ | **3,69** / 5 |
| Khoảng thời gian nộp | 05/08/2026 → 24/08/2026 |
| Lớp có phiếu / tổng lớp trong đợt | 1.826 / 1.830 |
| Số phiếu mỗi lớp | trung bình 36,5 · ít nhất 1 · nhiều nhất 109 |

Bóc riêng 6.787 phiếu bị loại theo lý do (một phiếu có thể dính nhiều lý do cùng lúc):

| Lý do | Số phiếu | Tỉ lệ trong nhóm bị loại |
|---|---:|---:|
| `SINGLE_ANSWER` | 2.141 | 31,5% |
| `ATTENTION_CHECK_FAILED` | 1.821 | 26,8% |
| `TOO_FAST` + `SINGLE_ANSWER` | 1.297 | 19,1% |
| `TOO_FAST` + `ATTENTION_CHECK_FAILED` | 876 | 12,9% |
| `SINGLE_ANSWER` + `ATTENTION_CHECK_FAILED` | 517 | 7,6% |
| `TOO_FAST` một mình | 74 | 1,1% |
| Dính cả ba luật | 61 | 0,9% |

Đọc ngang bảng này thì: chọn một mức cho cả bài là kiểu làm ẩu phổ biến nhất (tổng cộng 4.016
phiếu dính `SINGLE_ANSWER`), còn `TOO_FAST` một mình chỉ 74 phiếu — nghĩa là gần như ai bấm cho
nhanh cũng đồng thời rơi vào một luật khác.

### 7.2 Danh mục và khảo sát

| Bảng | Số bản ghi |
|---|---:|
| Khoa / Viện | 15 |
| Bộ môn | 60 |
| Giảng viên | 343 |
| Học phần | 486 |
| Lớp học phần | 1.830 |
| Học kỳ | 6 |
| Đợt khảo sát học kỳ | 1 |
| Bài khảo sát theo lớp (`CourseSectionSurveys`) | 1.830 |
| Bộ câu hỏi | 2 |
| Câu hỏi | 60 |
| Tài khoản | 344 |
| Hồ sơ | 5 |
| Dòng `RolePermissions` đang bật | 66 |
| Nhật ký thay đổi dữ liệu (`ChangeAuditLogs`) | 5.080 |
| Nhật ký xác thực (`AuthAuditLogs`) | 106 |

---

## 8. Kiểm thử đang phủ tới đâu

Tổng **110 test** (`[Fact]` + `[Theory]`) trong [tests/UnitTests/](tests/UnitTests/). Riêng phần
phân quyền và phạm vi dữ liệu:

| File | Số test | Kiểm cái gì |
|---|---:|---|
| [EndpointAuthorizationTests.cs](tests/UnitTests/API/EndpointAuthorizationTests.cs) | 4 | Duyệt metadata endpoint thật, khẳng định từng route đòi đúng policy; và `AnyPermission` chỉ gọi DB một lần |
| [CatalogScopeFilterTests.cs](tests/UnitTests/Infrastructure/CatalogScopeFilterTests.cs) | 10 | Lọc danh mục theo phạm vi |
| [CatalogWriteGuardTests.cs](tests/UnitTests/Infrastructure/CatalogWriteGuardTests.cs) | 10 | Chặn ghi ngoài phạm vi |
| [UserScopeResolverTests.cs](tests/UnitTests/Infrastructure/UserScopeResolverTests.cs) | 6 | Dựng `UserScope` từ hồ sơ đang hoạt động |
| [ReportScopeTests.cs](tests/UnitTests/Infrastructure/ReportScopeTests.cs) | 5 | Thu hẹp số dòng nhưng vẫn giữ mặt bằng toàn trường ở phần so sánh |
| [ResponseFilterTests.cs](tests/UnitTests/Application/ResponseFilterTests.cs) | 15 | Từng luật lọc phiếu |
| [SurveyStartTicketTests.cs](tests/UnitTests/Application/SurveyStartTicketTests.cs) | 11 | Vé bắt đầu làm bài: chữ ký, sai lớp, hết hạn |
| [AuthRequestCacheTests.cs](tests/UnitTests/Infrastructure/AuthRequestCacheTests.cs) | 1 | Một request chỉ tra bộ quyền một lần |

Cách viết `EndpointAuthorizationTests` đáng chú ý: nó không mock authorization, mà dựng thật
`WebApplication`, map endpoint thật rồi đọc `IAuthorizeData` trong metadata. Thêm endpoint mới
mà quên gắn policy thì test đỏ ngay.

---

## 9. Hiện trạng — mấy chỗ code và dữ liệu đang lệch nhau

Ghi lại đúng những gì đọc được, không kèm khuyến nghị:

| Chỗ lệch | Hiện trạng |
|---|---|
| `DEPARTMENT_MANAGER` có 3 quyền tab Báo cáo nhưng không có `REPORTS_ACCESS` | Mọi endpoint `/api/v1/reports` đòi đồng thời `ReportsAccess` + quyền tab, nên vai trò này vẫn ăn `403` ở toàn bộ nhóm báo cáo; menu "Thống kê & Báo cáo" cũng bị `canAccessModule` ẩn đi |
| `ADMIN` bị tắt `PROGRAM_CAMPAIGNS_ACCESS` và `PROGRAM_CRITERIA_ACCESS` | Hai module Khảo sát chương trình đào tạo hiện chạy trên state cục bộ, chưa nối API |
| `LECTURER` có 4 quyền module trong DB, seed để trống | Sửa tay qua tab Phân quyền Module; chạy lại seeder không ghi đè vì seeder chỉ thêm dòng còn thiếu |
| `UpdateRolePermissionsAsync` không phân biệt vai trò hệ thống | `PUT /api/admin/roles/{roleId}/permissions` sửa được cả `ADMIN` dù `Roles.IsSystem = true` |
| 344 tài khoản / 5 hồ sơ | Đúng thiết kế: thêm giảng viên chỉ tạo `Users`, không tạo `UserProfiles` |
| `REPORTS_RANKINGS_ACCESS` không có policy một-quyền riêng | Nó nằm trong policy gộp `PERMISSION_REPORTS_RESULTS_READ` cùng `REPORTS_DETAILS_ACCESS`, vì hai tab đọc chung một tập kết quả |
