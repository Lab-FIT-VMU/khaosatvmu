# Kế hoạch tạo vai trò tùy chỉnh và chuẩn hóa phạm vi dữ liệu

Trạng thái: **Chờ duyệt**

Ngày lập: **18/09/2026**

Phạm vi: `Role`, `UserProfile`, phân quyền module, bộ phân giải phạm vi dữ liệu, quyền ghi, API quản trị vai trò, giao diện **Người dùng & phân quyền**, migration và kiểm thử bảo mật.

## 0. Kết luận kiến trúc cần chốt trước

### 0.1. Trả lời câu hỏi về bốn vai trò hiện tại

Không nên chỉ áp dụng `Phạm vi dữ liệu` và `Chế độ thao tác` cho vai trò tạo mới.

Hiện tại hai khái niệm này đã tồn tại trong code nhưng đang được suy ngầm từ mã của bốn vai trò:

| Vai trò hiện tại | Phạm vi đang được suy ngầm | Khả năng thao tác đang được suy ngầm |
|---|---|---|
| `ADMIN` | Toàn trường | Được chỉnh sửa |
| `SURVEY_ADMIN` | Toàn trường | Được chỉnh sửa trong các module được cấp |
| `DEPARTMENT_MANAGER` | Theo bộ môn của giảng viên gắn với tài khoản | Chỉnh sửa có giới hạn theo nghiệp vụ/module |
| `LECTURER` | Cá nhân, theo `LecturerId` | Chỉ xem |

Các điểm đang bị khóa cứng:

- `EfUserScopeResolver` kiểm tra trực tiếp `ADMIN`, `SURVEY_ADMIN` để cho xem toàn trường.
- `UserScope.SeesOnlyOwn` chỉ đúng khi mã vai trò là `LECTURER`.
- `UserScope.IsReadOnly` hiện cũng được suy từ `LECTURER`.
- Một số khả năng ghi như quản lý đợt khảo sát hoặc phân công giảng viên được suy từ `SeesEverything` hoặc `DEPARTMENT_MANAGER`.

Nếu thêm một mã vai trò mới vào schema hiện tại, vai trò đó không có quy tắc rõ ràng. Nó có thể rơi vào nhánh mặc định “theo bộ môn”, đồng thời không chắc được coi là chỉ xem hay được sửa. Đây là hành vi không an toàn.

### 0.2. Phương án được đề xuất

Áp dụng mô hình mới cho **tất cả vai trò**, nhưng migration gán sẵn giá trị tương đương cho bốn vai trò hệ thống và khóa không cho sửa/xóa cấu hình nền tảng của chúng.

- Bốn vai trò hệ thống tiếp tục hoạt động như hiện tại.
- Danh sách module của các vai trò hệ thống vẫn lấy từ `RolePermissions` như hiện tại.
- Vai trò tự tạo sử dụng cùng một bộ phân giải phạm vi và quyền ghi, không có nhánh xử lý riêng.
- Không thay đổi quyền người dùng chỉ vì migration được chạy.
- Migration đầu tiên chỉ bổ sung schema và dữ liệu mô tả; resolver cũ vẫn là nguồn quyết định cho bốn vai trò hệ thống cho đến khi kết quả đối chiếu cũ/mới đạt tuyệt đối.

Đây là cách tránh duy trì song song hai cơ chế: “vai trò cũ theo mã hard-code” và “vai trò mới theo cấu hình”.

## 1. Mục tiêu

1. Thêm nút `+` tại danh sách vai trò trong màn hình **Phân quyền Module**.
2. Cho phép tạo vai trò với đầy đủ:
   - Tên vai trò.
   - Mã vai trò duy nhất do hệ thống tự sinh.
   - Ký hiệu mã hồ sơ, ví dụ `BGH`.
   - Phạm vi dữ liệu: `Toàn trường`, `Theo khoa`, `Theo bộ môn`, `Cá nhân`.
   - Chế độ thao tác: `Chỉ xem`, `Được chỉnh sửa`.
   - Danh sách module được phép truy cập.
3. Cho phép sửa vai trò tự tạo; mã tự sinh không được đổi sau khi tạo.
4. Chỉ cho xóa vai trò tự tạo khi chưa từng được gán cho hồ sơ người dùng.
5. Khóa xóa bốn vai trò hệ thống.
6. Mọi quyết định truy cập phải đồng thời kiểm tra:
   - Quyền vào module.
   - Phạm vi dữ liệu.
   - Chế độ đọc/ghi.
   - Giới hạn nghiệp vụ của tài nguyên đang thao tác.
7. Mặc định từ chối nếu hệ thống không xác định được phạm vi hoặc module chưa hỗ trợ phạm vi đã chọn.

## 2. Hiện trạng đã đối soát

### 2.1. Mô hình hiện có

```text
User
  -> UserProfile đang hoạt động
  -> Role
  -> RolePermission
  -> Permission của module
```

Nền tảng phân quyền module đã có và đang hoạt động. `RolePermissionEditor` cho phép bật/tắt module của bốn vai trò hiện tại.

### 2.2. Phạm vi dữ liệu hiện có

`EfUserScopeResolver` hiện lấy:

```text
Claims
  -> UserId + ActiveProfileId
  -> Role.Code
  -> Users.LecturerId
  -> Lecturers.DepartmentId / FacultyId
```

`UserProfile.OrganizationUnitCode` và `OrganizationUnitName` đang có trong schema nhưng không phải nguồn định danh có độ tin cậy để lọc dữ liệu; bộ phân giải phạm vi hiện tại không dùng hai trường này.

### 2.3. Rủi ro nếu chỉ thêm CRUD vai trò

- Vai trò tùy chỉnh không khớp `LECTURER` sẽ không được coi là phạm vi cá nhân.
- Vai trò tùy chỉnh không khớp hai vai trò quản trị sẽ không được coi là toàn trường.
- `IsReadOnly` không phản ánh lựa chọn `Chỉ xem` của vai trò tùy chỉnh.
- Một module có permission nhưng chưa lọc dữ liệu theo bộ môn/cá nhân có thể trả dữ liệu toàn trường.
- Ký hiệu mã hồ sơ và tên hồ sơ hiện được lấy từ dictionary chỉ có bốn mã vai trò; vai trò mới sẽ không tạo được hồ sơ theo luồng hiện tại.
- Import hồ sơ đang nhận diện vai trò bằng danh sách bốn vai trò cố định.

Vì vậy CRUD vai trò chỉ được triển khai sau khi lớp phạm vi dữ liệu và chế độ thao tác được tổng quát hóa.

## 3. Mô hình phân quyền đích

Một request chỉ được phép thực hiện khi thỏa cả bốn lớp:

```text
1. Active UserProfile hợp lệ
2. Role có Permission của module
3. Bản ghi nằm trong DataScope của Role + UserProfile
4. Hành động phù hợp AccessMode và policy của tài nguyên
```

Công thức quyết định:

```text
Allowed = HasModulePermission
       && IsResourceInsideScope
       && IsActionAllowedByAccessMode
       && IsOperationSupportedForScope
```

`Permission` chỉ trả lời “được vào module nào”. Nó không thay thế phạm vi dữ liệu và không tự động cho phép ghi.

## 4. Thiết kế dữ liệu

### 4.1. Bổ sung vào `Role`

| Trường | Kiểu đề xuất | Ý nghĩa |
|---|---|---|
| `ProfileCodeSuffix` | `varchar(10)` | Ký hiệu nối sau số thứ tự hồ sơ, ví dụ `BGH` |
| `DataScope` | string/enum | `SCHOOL`, `FACULTY`, `DEPARTMENT`, `SELF` |
| `AccessMode` | string/enum | `READ_ONLY`, `EDIT` |
| `ScopeBinding` | string/enum | `NONE`, `LINKED_LECTURER`, `PROFILE_FACULTY`, `PROFILE_DEPARTMENT` |

Các trường hiện có tiếp tục được dùng:

- `Code`: mã vai trò duy nhất do backend sinh; không đổi sau khi tạo.
- `Name`: tên tiếng Việt hiển thị.
- `Description`: mô tả tùy chọn.
- `IsSystem`: đánh dấu bốn vai trò do hệ thống quản lý.
- `IsDeleted`, `DeletedAt`: xóa mềm vai trò tùy chỉnh.

### 4.2. Bổ sung đích phạm vi vào `UserProfile`

Vai trò xác định **loại phạm vi** và **nguồn lấy đích phạm vi**. Với vai trò tùy chỉnh theo bộ môn, bộ môn cụ thể nằm ở hồ sơ người dùng vì cùng một vai trò có thể được gán cho nhiều bộ môn.

Đề xuất thêm:

| Trường | Kiểu | Quy tắc |
|---|---|---|
| `ScopeFacultyId` | `int?`, FK `Faculties` | Bắt buộc khi `Role.ScopeBinding = PROFILE_FACULTY`; null với các binding còn lại |
| `ScopeDepartmentId` | `int?`, FK `Departments` | Bắt buộc khi `Role.ScopeBinding = PROFILE_DEPARTMENT`; null với các binding còn lại |

Không dùng `OrganizationUnitCode` làm khóa phân quyền vì đây là chuỗi mô tả, có thể đổi hoặc nhập sai. Có thể giữ `OrganizationUnitCode/Name` để tương thích và hiển thị, nhưng quyết định bảo mật phải dùng khóa ngoại ổn định.

`ScopeBinding = LINKED_LECTURER` tiếp tục lấy dữ liệu động từ `Users.LecturerId -> Lecturers`. Nếu tài khoản chưa gắn giảng viên thì hồ sơ này không thấy dữ liệu và không được phép thao tác.

Không snapshot bộ môn của bốn vai trò hệ thống vào `UserProfile.ScopeDepartmentId`. Đặc biệt, `DEPARTMENT_MANAGER` phải tiếp tục đi theo bộ môn hiện tại của giảng viên; nếu giảng viên chuyển bộ môn thì phạm vi thay đổi giống hệt cơ chế đang chạy.

### 4.3. Ràng buộc dữ liệu

- `Role.Code`: backend sinh bằng sequence riêng theo dạng `ROLE_000001`; unique và bất biến sau khi tạo. Bốn mã hệ thống hiện có được giữ nguyên.
- `Role.Name`: bắt buộc, tối đa 200 ký tự.
- `ProfileCodeSuffix`: bắt buộc, uppercase, mẫu `^[A-Z0-9]{2,10}$`.
- Không tái sử dụng mã của vai trò đã xóa để tránh nhầm lẫn audit và cấu hình cũ.
- `ScopeFacultyId`/`ScopeDepartmentId` phải trỏ tới đơn vị đang hoạt động khi tạo/cập nhật hồ sơ.
- API không tin giá trị phạm vi do frontend gửi; luôn đọc lại `Role` và kiểm tra điều kiện tương ứng.
- Thay unique index cũ dựa trên `OrganizationUnitCode` bằng ràng buộc theo khóa thật:
  - Với scope khoa: một user chỉ có một profile cho cùng `RoleId + ScopeFacultyId`.
  - Với scope bộ môn: một user chỉ có một profile cho cùng `RoleId + ScopeDepartmentId`.
  - Với scope toàn trường/cá nhân: một user chỉ có một profile cho cùng `RoleId`.
- Lỗi cạnh tranh khi hai request cùng tạo một mã role hoặc cùng gán một profile phải được map thành `409 Conflict`, không để lộ lỗi database.

## 5. Backfill bốn vai trò hệ thống

Migration phải gán trực tiếp các giá trị sau:

| Code | Ký hiệu | DataScope | ScopeBinding | AccessMode | Cho sửa cấu hình nền tảng | Cho xóa |
|---|---|---|---|---|---|---|
| `ADMIN` | `AD` | `SCHOOL` | `NONE` | `EDIT` | Không | Không |
| `SURVEY_ADMIN` | `QT` | `SCHOOL` | `NONE` | `EDIT` | Không | Không |
| `DEPARTMENT_MANAGER` | `BM` | `DEPARTMENT` | `LINKED_LECTURER` | `EDIT` | Không | Không |
| `LECTURER` | `GV` | `SELF` | `LINKED_LECTURER` | `READ_ONLY` | Không | Không |

“Khóa cấu hình nền tảng” gồm mã vai trò, ký hiệu hồ sơ, phạm vi và chế độ thao tác. Tên/mô tả chuẩn tiếp tục do seeder đồng bộ. Danh sách module được cấp vẫn quản lý bằng màn hình phân quyền hiện tại, trừ các permission bắt buộc để tránh tự khóa toàn bộ quản trị hệ thống.

Không backfill `ScopeDepartmentId` cho hồ sơ `DEPARTMENT_MANAGER` hiện có. Migration chỉ gán `ScopeBinding = LINKED_LECTURER` trên role để mô tả đúng nguồn phạm vi đang dùng. Hồ sơ không tìm được giảng viên/bộ môn tiếp tục fail-closed giống cơ chế hiện tại và phải xuất hiện trong báo cáo kiểm tra trước cutover.

Migration không thêm, xóa hoặc thay đổi bất kỳ dòng nào trong `RolePermissions`. Quyền module hiện có phải giữ nguyên từng bản ghi.

### 5.1. Cơ chế chống làm hỏng quyền hiện tại

Việc chuyển đổi phải theo mô hình **expand → verify → cutover**, không thay resolver ngay trong migration:

1. **Expand**: thêm các cột mới ở trạng thái nullable hoặc có giá trị an toàn; cập nhật đúng bốn dòng `Roles`. Không sửa `UserProfiles` hiện có và không sửa `RolePermissions`.
2. **Verify**: ứng dụng vẫn cấp quyền bằng resolver cũ, đồng thời resolver mới chỉ chạy để ghi nhận kết quả đối chiếu trong kiểm thử/UAT.
3. **Cutover**: chỉ bật resolver mới khi mọi profile hệ thống cho kết quả giống resolver cũ và các bài test truy cập chéo đều đạt.
4. **Observe**: giữ khả năng chuyển lại resolver cũ trong ít nhất một chu kỳ nghiệm thu/deploy; API luôn ưu tiên từ chối khi dữ liệu cấu hình không hợp lệ.
5. **Contract**: chỉ bỏ đường resolver cũ ở một migration/phát hành sau, khi đã xác nhận vận hành ổn định. Không xóa cột hoặc dữ liệu cũ trong cùng đợt tạo role tùy chỉnh.

Trước migration phải lưu các mốc đối chiếu:

- Số profile theo từng role và trạng thái active/default.
- Toàn bộ ma trận `RolePermissions`.
- Kết quả scope của từng profile hệ thống: role, lecturer, bộ môn, khoa và các cờ đọc/ghi.

Sau migration chạy lại cùng truy vấn; nếu có bất kỳ chênh lệch nào thì không cutover và không bật nút tạo role.

### 5.2. Hai lớp đối chiếu phải chạy song song

Việc kiểm thử gồm hai lớp khác nhau và cần thực hiện cả hai:

**Lớp 1 — Shadow resolver trên cùng profile**

- Một request của profile `ADMIN`, `SURVEY_ADMIN`, `DEPARTMENT_MANAGER` hoặc `LECTURER` được tính phạm vi bằng cả resolver cũ và resolver mới.
- Chỉ kết quả resolver cũ được dùng để cấp quyền trong giai đoạn này.
- Hệ thống so sánh scope, cờ đọc/ghi và lý do từ chối. Đây là cách phát hiện sai khác mà không đổi quyền thật.

**Lớp 2 — Vai trò đối chứng end-to-end trên môi trường test/UAT**

Tạo bốn role tùy chỉnh có tên dễ nhận biết như `Admin 2`, `Quản trị khảo sát 2`, `Trưởng bộ môn 2`, `Giảng viên 2`; mã kỹ thuật vẫn do hệ thống tự sinh. Cấp module và cấu hình tương ứng:

| Vai trò đối chứng | Scope | AccessMode | Module |
|---|---|---|---|
| Admin 2 | `SCHOOL` | `EDIT` | Giống `ADMIN` |
| Quản trị khảo sát 2 | `SCHOOL` | `EDIT` | Giống `SURVEY_ADMIN` |
| Trưởng bộ môn 2 | `DEPARTMENT` | `EDIT` | Giống `DEPARTMENT_MANAGER` |
| Giảng viên 2 | `SELF` | `READ_ONLY` | Giống `LECTURER` |

Gán role đối chứng cho cùng người dùng hoặc người dùng thử nghiệm có cùng liên kết giảng viên/đơn vị, sau đó so sánh:

- Menu và route nhìn thấy.
- API danh sách, chi tiết, tìm kiếm, bộ lọc và export.
- Khả năng tạo/sửa/xóa/import/thay đổi trạng thái.
- Truy cập trực tiếp URL/API khi không có quyền.
- Dữ liệu ở ngoài khoa, ngoài bộ môn và ngoài cá nhân.

Cách người dùng đề xuất là đúng cho lớp UAT này, nhưng không thay thế shadow test: hai profile khác nhau có thể vô tình che giấu dữ liệu biên hoặc cấu hình đơn vị bị thiếu. Các role đối chứng chỉ tạo ở database test/UAT, không cấp cho người dùng thật trên production.

## 6. Bộ phân giải phạm vi mới

Thay logic kiểm tra mã vai trò bằng dữ liệu cấu hình:

### 6.1. `SCHOOL`

- `SeesEverything = true`.
- Không yêu cầu `LecturerId`, `ScopeFacultyId` hoặc `ScopeDepartmentId`.

### 6.2. `DEPARTMENT`

- Nếu `ScopeBinding = LINKED_LECTURER`: lấy `DepartmentId` động từ giảng viên gắn với tài khoản. Đây là cách bốn vai trò cũ đang hoạt động.
- Nếu `ScopeBinding = PROFILE_DEPARTMENT`: lấy `DepartmentId` từ `UserProfile.ScopeDepartmentId`. Đây là cách mặc định cho vai trò tùy chỉnh theo bộ môn.
- Không tìm được đích phạm vi hoặc bộ môn đã ngừng hoạt động: trả phạm vi rỗng.
- Mọi truy vấn danh sách chỉ trả dữ liệu thuộc bộ môn đó.
- Mọi truy vấn chi tiết và mutation phải xác nhận tài nguyên thuộc đúng bộ môn.

### 6.3. `FACULTY`

- Dùng `ScopeBinding = PROFILE_FACULTY` và lấy `FacultyId` từ `UserProfile.ScopeFacultyId`.
- Không có `ScopeFacultyId` hoặc khoa đã ngừng hoạt động: trả phạm vi rỗng.
- Dữ liệu thuộc các bộ môn trong khoa cũng được coi là thuộc phạm vi khoa nếu quan hệ FK xác định được rõ ràng.
- Không suy khoa bằng tên hoặc chuỗi `OrganizationUnitCode`.

### 6.4. `SELF`

- Dùng `ScopeBinding = LINKED_LECTURER` và lấy `LecturerId` từ `Users.LecturerId`.
- Không có liên kết giảng viên: trả phạm vi rỗng.
- Chỉ trả dữ liệu gắn trực tiếp với giảng viên đó.

### 6.5. Thuộc tính tương thích trong `UserScope`

Các thuộc tính hiện có được đổi cách tính, không đổi ý nghĩa sử dụng:

- `SeesEverything` dựa trên `DataScope == SCHOOL`.
- `SeesOnlyOwn` dựa trên `DataScope == SELF`.
- `IsReadOnly` dựa trên `AccessMode == READ_ONLY`.
- `SeesNothing` đúng khi phạm vi yêu cầu một định danh nhưng không tìm được định danh đó.

Nhờ vậy các service hiện có có thể được chuyển dần mà không phải đổi toàn bộ trong một lần.

## 7. Ý nghĩa của “Chỉ xem” và “Được chỉnh sửa”

### 7.1. Chỉ xem

- Cho phép các request đọc nếu có permission module và dữ liệu nằm trong phạm vi.
- Từ chối toàn bộ `POST`, `PUT`, `PATCH`, `DELETE`, import, phát hành, đồng bộ và thao tác thay đổi trạng thái.
- Frontend ẩn hoặc disable nút ghi để giao diện rõ ràng, nhưng backend vẫn là lớp quyết định cuối cùng.

### 7.2. Được chỉnh sửa

Không có nghĩa là được sửa mọi dữ liệu trong module.

- `SCHOOL + EDIT`: được thao tác các chức năng toàn trường nếu có permission tương ứng.
- `FACULTY + EDIT`: chỉ sửa tài nguyên chứng minh được thuộc `FacultyId` của profile.
- `DEPARTMENT + EDIT`: chỉ sửa tài nguyên có thể xác định và kiểm tra `DepartmentId` trùng với hồ sơ đang dùng.
- `SELF + EDIT`: chỉ sửa tài nguyên của chính giảng viên khi nghiệp vụ cụ thể cho phép.
- Tài nguyên mang tính toàn cục, không có khóa để chứng minh thuộc khoa/bộ môn/cá nhân, phải từ chối với `FACULTY`, `DEPARTMENT` và `SELF` dù vai trò có `EDIT`.

Các capability đang hard-code được chuyển sang quy tắc tổng quát. Ví dụ:

- Quản lý cấu hình/đợt toàn trường: cần `SCHOOL + EDIT`.
- Thao tác tài nguyên cấp khoa: cho phép `SCHOOL + EDIT` hoặc `FACULTY + EDIT` nếu đúng khoa và module hỗ trợ.
- Thêm phạm vi khảo sát hoặc phân công trong bộ môn: cho phép `SCHOOL + EDIT` hoặc `DEPARTMENT + EDIT` nếu đúng bộ môn.
- Ghi dữ liệu cá nhân: cần `SELF + EDIT` và đúng `LecturerId`.

Cách này giữ đúng hành vi cũ của bốn vai trò nhưng cho vai trò mới một quy tắc rõ ràng.

## 8. Ma trận hỗ trợ phạm vi theo module

Đây là bước bắt buộc trước khi cho phép bật module cho vai trò tùy chỉnh.

Mỗi permission module phải khai báo các scope backend đã hỗ trợ an toàn. Nguyên tắc:

- Mặc định chỉ hỗ trợ `SCHOOL`.
- Chỉ bật `FACULTY`, `DEPARTMENT` hoặc `SELF` sau khi toàn bộ endpoint đọc/ghi của module đã dùng `IUserScopeResolver` và có kiểm thử chéo phạm vi.
- API là nguồn quyết định; frontend chỉ hiển thị trạng thái tương thích từ API.

Các trường hợp cần lưu ý ngay:

- `USER_ADMIN_ACCESS`: chỉ `SCHOOL + EDIT` được quản trị vai trò/người dùng.
- `GRADUATION_ANALYTICS_ACCESS`: dữ liệu hiện tại tổng hợp theo khoa/chuyên ngành/khóa, không có `DepartmentId` đáng tin cậy; tạm thời chỉ cho `SCHOOL` cho đến khi có ánh xạ nghiệp vụ được duyệt.
- Các module danh mục, khảo sát và báo cáo đang có nhiều đoạn lọc qua `UserScope`, nhưng vẫn phải rà soát toàn bộ endpoint trước khi tuyên bố hỗ trợ `FACULTY`, `DEPARTMENT` hoặc `SELF`.

Đề xuất tạo một `ModuleScopePolicy` tập trung ở backend, trả thêm `supportedDataScopes` và `supportedAccessModes` trong DTO permission. Không lưu lặp ma trận này trong frontend.

Nếu quản trị viên chọn module không tương thích với phạm vi vai trò:

- Giao diện disable toggle và giải thích lý do.
- Backend vẫn từ chối nếu request bị giả mạo.
- Không tự nâng phạm vi lên `Toàn trường`.

## 9. API quản trị vai trò

### 9.1. Mở rộng DTO vai trò

`AdminRoleDto` cần trả thêm:

- `profileCodeSuffix`.
- `dataScope` và nhãn tiếng Việt.
- `accessMode` và nhãn tiếng Việt.
- `isSystem`.
- `assignedProfileCount`.
- `canEditDefinition`, `canDelete` và lý do không thể xóa.

### 9.2. Tạo vai trò

Thêm endpoint riêng:

```http
POST /api/admin/roles
```

Payload không nhận `Code`; chỉ gồm tên, ký hiệu hồ sơ, phạm vi, chế độ, mô tả và danh sách `permissionIds`. Backend lấy sequence `RoleCodeSequence` để sinh `ROLE_000001`, sau đó tạo `Role` và `RolePermissions` trong cùng transaction để không xuất hiện vai trò tạo dở hoặc mã trùng do request đồng thời. Response trả mã đã sinh để giao diện hiển thị dạng chỉ đọc.

### 9.3. Sửa vai trò

```http
PUT /api/admin/roles/{roleId}
```

- Vai trò hệ thống: từ chối thay đổi mã, ký hiệu, phạm vi, chế độ và từ chối xóa.
- Vai trò tùy chỉnh: cho sửa tên, mô tả, ký hiệu, phạm vi, chế độ và module.
- `Code` bất biến sau khi tạo.
- Nếu vai trò đã được sử dụng, thay đổi phạm vi phải kiểm tra tất cả hồ sơ đang gán có đủ đích phạm vi mới; nếu không thì từ chối và trả danh sách số lượng hồ sơ cần xử lý.
- Thay đổi permission và định nghĩa vai trò nên được lưu nguyên tử trong cùng transaction.

### 9.4. Xóa vai trò

```http
DELETE /api/admin/roles/{roleId}
```

Quy tắc “chưa được sử dụng” được định nghĩa là không tồn tại bất kỳ `UserProfile` nào tham chiếu tới vai trò, kể cả hồ sơ đang inactive.

- `IsSystem = true`: luôn từ chối.
- Có `UserProfile`: từ chối và trả số hồ sơ đang dùng.
- Chưa dùng: xóa mềm `Role`, dọn `RolePermissions` trong transaction và ghi audit.

### 9.5. Bảo vệ quản trị

- Chỉ profile có `USER_ADMIN_ACCESS`, `SCHOOL` và `EDIT` mới gọi được CRUD vai trò.
- Không cho xóa hoặc tước cấu hình bắt buộc làm hệ thống không còn bất kỳ hồ sơ quản trị toàn trường nào có thể quản lý phân quyền.
- Ghi audit trước/sau cho tạo, sửa, đổi module và xóa vai trò.

## 10. Sinh mã hồ sơ và gán vai trò

### 10.1. Sinh mã hồ sơ

Thay dictionary bốn vai trò trong `ProfileNaming` bằng dữ liệu đọc từ `Role`:

```text
{UserProfileCodeSequence dạng 6 chữ số}{Role.ProfileCodeSuffix}
```

Ví dụ vai trò có ký hiệu `BGH`:

```text
000127BGH
```

Bốn vai trò hệ thống tiếp tục sinh `AD`, `QT`, `BM`, `GV` như hiện tại.

### 10.2. Form tạo/cập nhật hồ sơ người dùng

- Chọn vai trò `SCHOOL`: không hiện trường bộ môn.
- Chọn vai trò `FACULTY`: bắt buộc chọn một khoa/viện đang hoạt động.
- Chọn vai trò `DEPARTMENT`: bắt buộc chọn một bộ môn đang hoạt động.
- Chọn vai trò `SELF`: tài khoản phải có `Users.LecturerId`; hiển thị giảng viên tương ứng và không cho nhập tay.
- Backend kiểm tra lại mọi điều kiện.

### 10.3. Import hồ sơ

- Không dùng dictionary bốn vai trò để nhận diện nữa.
- Tra role từ database theo `Code`; có thể hỗ trợ tên vai trò khi tên khớp duy nhất.
- Với role `FACULTY`, file import phải có mã khoa/viện; với role `DEPARTMENT`, file phải có mã bộ môn. Thiếu đích phạm vi thì từ chối rõ từng dòng.
- Luồng tự tạo hồ sơ giảng viên/trưởng bộ môn hiện tại tiếp tục dùng role hệ thống theo `Code`, không bị ảnh hưởng bởi vai trò tùy chỉnh.

## 11. Thiết kế giao diện

### 11.1. Danh sách vai trò

- Đặt nút icon `+` cạnh tiêu đề/danh sách vai trò, có tooltip và `aria-label`.
- Vai trò hệ thống có nhãn “Vai trò hệ thống”.
- Vai trò tùy chỉnh có menu sửa/xóa.
- Nút xóa bị disable kèm lý do khi vai trò đã được gán.

### 11.2. Form tạo vai trò

Chia thành ba phần rõ ràng trong cùng modal hoặc panel:

1. **Thông tin vai trò**: tên, ký hiệu mã hồ sơ, mô tả. Mã vai trò không phải trường nhập; chỉ hiển thị dạng chỉ đọc sau khi tạo.
2. **Giới hạn sử dụng**: phạm vi dữ liệu, chế độ thao tác và phần giải thích ngắn.
3. **Module được truy cập**: tái sử dụng danh sách permission đang có trong `RolePermissionEditor`.

Nút **Tạo vai trò** chỉ enabled khi form hợp lệ. Lỗi trùng mã, ký hiệu sai định dạng hoặc module không tương thích phải hiển thị sát trường liên quan.

### 11.3. Sửa và xóa

- Sửa vai trò tùy chỉnh trên cùng cấu trúc form.
- Hiển thị cảnh báo nếu thay đổi phạm vi/chế độ sẽ ảnh hưởng các hồ sơ đang sử dụng.
- Xóa cần hộp xác nhận nêu đúng tên vai trò.
- Sau mutation, giữ nguyên role đang chọn nếu còn tồn tại; không reload toàn trang.

Giao diện phải tuân thủ `.rulesforai`: bố cục dữ liệu gọn, border mỏng, không card trang trí, responsive ở desktop và mobile, đầy đủ loading/error/retry/focus/keyboard.

### 11.4. Nhóm tệp dự kiến thay đổi

- Domain: `AuthModels.cs`.
- Application: `UserScope.cs`, `UserAdministrationContracts.cs` và error codes liên quan.
- Infrastructure: `AppDbContext.cs`, EF migration mới, `DatabaseSeeder.cs`, `EfUserScopeResolver.cs`, `EfUserAdministrationService.cs`, các service danh mục/khảo sát/báo cáo cần chuẩn hóa scope.
- API: `UserAdministrationEndpoints.cs`, policy/guard ghi dùng chung và mapping mã lỗi HTTP.
- Frontend: `RolePermissionEditor.tsx`, `UsersAdminPage.tsx`, `adminApi.ts`, `types/index.ts`, `auth-admin.css` và component modal/form hiện có.
- Tests: authorization, resolver, catalog/survey scope, CRUD role, migration/backfill và frontend behavior.

Không gom thay đổi này vào một endpoint hoặc một component lớn; mỗi workflow tạo/sửa/xóa role và cập nhật permission phải có contract rõ ràng, nhưng dùng chung validation/policy thực sự trùng lặp.

## 12. Các đợt triển khai

### Đợt 1 — Schema và backfill tương thích

- Bổ sung trường vào `Role` và `UserProfile`.
- Tạo EF migration và check constraint/index/FK.
- Backfill bốn vai trò hệ thống.
- Chỉ backfill metadata role; không snapshot bộ môn vào profile.
- Không chỉnh sửa `RolePermissions`.
- Cập nhật seeder theo hướng idempotent.
- Chưa bật nút tạo vai trò.

Điểm dừng an toàn: resolver cũ vẫn quyết định phạm vi, nên migration không thể tự làm đổi dữ liệu người dùng nhìn thấy.

### Đợt 2 — Tổng quát hóa `UserScope`

- Viết resolver cấu hình mới song song, chưa dùng kết quả của nó để cấp quyền.
- Với mỗi profile hệ thống trong bộ dữ liệu kiểm thử/UAT, tính cả kết quả resolver cũ và mới rồi đối chiếu `LecturerId`, `DepartmentId`, `FacultyId`, `SeesEverything`, `SeesOnlyOwn`, `IsReadOnly` và `SeesNothing`.
- Chỉ đổi nguồn quyết định từ `RoleCode` sang `Role.DataScope`, `ScopeBinding` và `Role.AccessMode` sau khi không còn chênh lệch.
- Chuyển các capability hard-code sang điều kiện scope/access mode.
- Bổ sung fail-closed khi thiếu lecturer/bộ môn.
- Viết regression test cho bốn vai trò hệ thống.

Điểm dừng an toàn: có cờ cấu hình tạm thời để quay lại resolver cũ nếu phát hiện chênh lệch sau deploy. Chưa có vai trò tùy chỉnh nên rollback không làm mất chức năng mới của người dùng.

### Đợt 3 — Rà soát module và quyền ghi

- Lập ma trận permission × scope.
- Kiểm tra toàn bộ GET/list/detail/export.
- Kiểm tra toàn bộ create/update/delete/import/publish/status change.
- Thêm guard dùng chung và test chống truy cập chéo bộ môn/cá nhân.
- Những module chưa hoàn tất được đánh dấu chỉ hỗ trợ `SCHOOL`.

Điểm dừng an toàn: không module nào được quảng cáo hỗ trợ scope hẹp nếu backend chưa lọc đầy đủ.

### Đợt 4 — CRUD role backend

- Bổ sung contracts, service và endpoints tạo/sửa/xóa role.
- Lưu role + permissions bằng transaction.
- Kiểm tra role hệ thống, role đang dùng, mã trùng, cấu hình không tương thích.
- Audit mọi thay đổi.

### Đợt 5 — Giao diện quản trị vai trò

- Thêm nút `+` và form tạo vai trò.
- Tái sử dụng permission editor.
- Thêm sửa/xóa, trạng thái khóa và cảnh báo ảnh hưởng.
- Không reload toàn trang khi thao tác.

### Đợt 6 — Gán hồ sơ và import

- Cập nhật form hồ sơ theo loại scope.
- Sinh mã hồ sơ từ suffix trong DB.
- Cập nhật import để hỗ trợ vai trò tùy chỉnh và bộ môn.
- Giữ nguyên tự động tạo hồ sơ giảng viên/trưởng bộ môn.

### Đợt 7 — UAT và phát hành

- Chạy migration trên bản sao dữ liệu thật.
- Kiểm tra số lượng profile theo từng role trước/sau.
- Chụp snapshot `RolePermissions` trước migration và so sánh từng cặp `RoleId + PermissionId + IsGranted` sau migration.
- Chạy báo cáo so sánh resolver cũ/mới trên toàn bộ profile của bốn role hệ thống; yêu cầu số chênh lệch bằng 0.
- UAT ma trận vai trò/phạm vi/module/chế độ.
- Chỉ bật chức năng tạo vai trò sau khi toàn bộ regression bảo mật đạt.

## 13. Kế hoạch kiểm thử

### 13.1. Regression bốn vai trò hệ thống

- `ADMIN`: dữ liệu toàn trường, quyền ghi như trước.
- `SURVEY_ADMIN`: dữ liệu toàn trường, chỉ vào module được cấp như trước.
- `DEPARTMENT_MANAGER`: chỉ dữ liệu đúng bộ môn, không lọt bộ môn khác.
- `LECTURER`: chỉ dữ liệu của mình và mọi mutation bị từ chối.
- So sánh menu, API list, API detail, export và mutation trước/sau migration.
- Chuyển một giảng viên thử nghiệm sang bộ môn khác và xác nhận profile `DEPARTMENT_MANAGER` đi theo bộ môn mới như cơ chế cũ, không giữ bộ môn snapshot.
- So sánh nguyên trạng toàn bộ `RolePermissions`; migration không được làm tăng hoặc giảm permission của bất kỳ role hệ thống nào.

### 13.2. Vai trò tùy chỉnh

Kiểm thử đủ tổ hợp:

```text
4 DataScope × 2 AccessMode × các module được hỗ trợ
```

Các ca bắt buộc:

- Vai trò `SCHOOL + READ_ONLY` xem toàn trường nhưng không ghi được.
- Vai trò `FACULTY + EDIT` chỉ xem/sửa đúng khoa và các bộ môn trực thuộc, không lọt khoa khác.
- Vai trò `DEPARTMENT + EDIT` xem/sửa đúng bộ môn và không đọc/sửa bộ môn khác.
- Vai trò `SELF + READ_ONLY` chỉ xem dữ liệu chính mình.
- Thiếu `ScopeFacultyId`, `ScopeDepartmentId` hoặc `LecturerId` trả phạm vi rỗng theo scope tương ứng.
- Giả mạo payload chứa `FacultyId`/`DepartmentId` khác bị từ chối.
- Có permission module nhưng scope không được module hỗ trợ vẫn bị từ chối.
- Hai request tạo role đồng thời vẫn sinh hai mã khác nhau; suffix sai và module ID không tồn tại bị từ chối.
- Không xóa được role hệ thống hoặc role đã có profile.
- Xóa được role tùy chỉnh chưa sử dụng và không còn xuất hiện trong danh sách.
- Đổi cấu hình role đang dùng không tạo profile mất phạm vi.

### 13.3. Frontend

- Loading, empty, validation error, network error và retry.
- Giữ trạng thái khi tạo/sửa role.
- Keyboard, focus, tooltip, xác nhận xóa.
- Desktop khoảng `1440×900` và mobile khoảng `390×844`.
- Không hiển thị toggle module không tương thích như thể có thể sử dụng được.

### 13.4. Kiểm tra kỹ thuật bắt buộc

- Backend build và toàn bộ unit/integration test.
- Frontend lint, build và test.
- Migration up/down trên database thử nghiệm.
- Kiểm tra audit log.
- Kiểm tra trực tiếp API bằng hai tài khoản khác bộ môn để phát hiện lọt dữ liệu.

## 14. Tiêu chí nghiệm thu

1. Quản trị viên tạo được vai trò tùy chỉnh và chọn module trong một luồng hoàn chỉnh.
2. Mã vai trò được backend tự sinh, duy nhất và bất biến; mã hồ sơ sinh đúng ký hiệu đã cấu hình.
3. Cùng một role `FACULTY`/`DEPARTMENT` có thể gán cho người dùng ở các đơn vị khác nhau và mỗi người chỉ thấy đúng đơn vị của profile đang dùng.
4. `READ_ONLY` được cưỡng chế ở backend cho mọi mutation, không chỉ ẩn nút frontend.
5. Không có module nào trả dữ liệu toàn trường khi role có scope `FACULTY`, `DEPARTMENT` hoặc `SELF` mà module chưa hỗ trợ scope đó.
6. Bốn vai trò hệ thống giữ nguyên phạm vi, khả năng thao tác và module đang được cấp trước khi nâng cấp.
7. Bốn vai trò hệ thống không thể bị xóa; vai trò tùy chỉnh chỉ xóa được khi chưa có `UserProfile` tham chiếu.
8. Tạo/sửa/xóa role và thay đổi permission đều có audit.
9. Không còn logic xác định phạm vi hoặc chỉ-đọc dựa trực tiếp vào mã role ở các service nghiệp vụ.
10. Báo cáo đối chiếu resolver cũ/mới trên toàn bộ profile hệ thống có số chênh lệch bằng 0 trước khi bật resolver mới.
11. Bốn vai trò đối chứng trên UAT cho kết quả dữ liệu và thao tác tương đương bốn vai trò hệ thống tương ứng.

## 15. Những nội dung chưa triển khai trong kế hoạch này

- Không tạo permission CRUD riêng cho từng nút; `AccessMode` là lớp đọc/ghi toàn role, còn module permission tiếp tục là quyền truy cập module.
- Không cho một role đồng thời có nhiều loại phạm vi.
- Không cho một profile thuộc nhiều bộ môn; nếu một người cần nhiều bộ môn thì tạo các profile riêng hoặc mở rộng ở giai đoạn sau.
- Không cho tự tạo permission/module mới từ giao diện; chỉ tạo role từ danh sách permission do hệ thống cung cấp.

## 16. Quyết định đề xuất để duyệt

1. **Áp dụng schema scope/access cho tất cả role**, không chỉ role mới.
2. **Khóa scope/access của bốn role hệ thống** và backfill đúng hành vi hiện tại.
3. **Giữ phạm vi động qua giảng viên cho `DEPARTMENT_MANAGER` và `LECTURER`; chỉ dùng `UserProfile.ScopeDepartmentId` cho role tùy chỉnh có `ScopeBinding = PROFILE_DEPARTMENT`**.
4. **Bổ sung scope `FACULTY`; khoa cụ thể lưu bằng `UserProfile.ScopeFacultyId` với `ScopeBinding = PROFILE_FACULTY`**.
5. **Role code do backend tự sinh bằng sequence, bất biến và không tái sử dụng sau khi xóa**.
6. **Module chưa hỗ trợ scope hẹp phải fail-closed**, không tự cho xem toàn trường.
7. **Tạo role và cấp module trong một transaction**.
8. **Role đã từng được gán profile không được xóa**, kể cả profile đó đang inactive.
9. **Migration không chạm `RolePermissions`; resolver mới chỉ được cutover sau khi đối chiếu cũ/mới bằng 0 chênh lệch và có đường quay lại resolver cũ trong giai đoạn phát hành**.
10. **UAT dùng bốn role tùy chỉnh đối chứng tương ứng bốn role hệ thống, bên cạnh shadow comparison trên chính profile cũ**.

Nếu mười quyết định trên được duyệt, có thể triển khai tuần tự theo bảy đợt mà không làm thay đổi quyền hiện tại ngay từ đợt đầu.
