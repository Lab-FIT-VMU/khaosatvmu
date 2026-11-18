# Rà soát xử lý lỗi toàn ứng dụng — 18/11/2026

## Kết luận

**Chưa phân loại và truyền lỗi đúng, đầy đủ trên toàn dự án.** Working tree của nhánh `fixkc`, HEAD `331d18c`, đã cải thiện lỗi mạng/500/quyền/xung đột dữ liệu, nhưng còn lỗi về tính nguyên tử của import, phân loại exception, bảo toàn thông tin lỗi và cách giao diện báo kết quả.

Phần rà soát ban đầu không sửa mã ứng dụng. Mã và dữ liệu kiểm chứng được tạo trong môi trường tạm, không sử dụng cookie người dùng, không gọi server đang chạy và không thay đổi database ứng dụng.

## Cập nhật sau khi sửa theo yêu cầu

- ERR-07: các bảng thông báo admin/auth/survey dùng fallback lỗi chung; bổ sung thông báo nghiệp vụ còn thiếu, 413/429, giữ mã lỗi ở màn chọn/chuyển hồ sơ. Các formatter API của import/catalog/khảo sát dùng chung cách hiển thị và thêm mã tra cứu. Các hộp thoại tốt nghiệp không còn hướng người dùng sửa file khi nhận 500.
- ERR-08: handler trả `traceId` trong JSON và `X-Trace-Id` trong header, ghi cùng mã vào structured log. Middleware bổ sung header và log scope cho response nghiệp vụ; CORS cho phép frontend đọc header. Frontend giữ trace trong ApiError, hiện “Mã tra cứu” ở các formatter đã chuyển đổi, gồm cả thông báo đăng nhập/chọn hồ sơ.
- ERR-09: cả parser tốt nghiệp hiện tại và parser cũ chỉ chuyển các lỗi định dạng/package/XML đã nhận diện thành lỗi file, giữ inner exception và log lỗi định dạng. Lỗi xử lý/thư viện bất ngờ được bọc trong exception kỹ thuật có inner exception, đi qua handler thành 500 với mã tra cứu; cancellation được giữ nguyên. Kiểm tra metadata gói XLSX trước khi nạp để ZIP rỗng không gây NullReferenceException từ thư viện.
- Củng cố ERR-06 ở apiClient để body lỗi null/không phải object hoặc JSON phản hồi hỏng không rơi thành exception ngoài ApiError rồi bị UI báo nhầm lỗi kết nối. Không thêm tự động thử lại thao tác ghi.
- Không thay đổi tính nguyên tử/validation của import giảng viên, cách phân loại các exception kỹ thuật khác của handler, hay cơ chế ghi rồi tải lại danh sách. Các phát hiện tương ứng vẫn còn mở.
- Kiểm chứng: 71 kiểm tra backend liên quan, 20 kiểm tra frontend cho lỗi HTTP/mạng/protocol/thông báo/trace. Build backend/frontend thành công; lint không có lỗi mới. Có kiểm tra HTTP thật trên Kestrel tạm cho response 400 nghiệp vụ và 500, không dùng database ứng dụng.
- Không cần migration và chưa triển khai production. Phần mô tả phát hiện bên dưới giữ làm bằng chứng trước sửa.

Skills: `secure-code-review`, `api-security`. Phạm vi: C#/.NET 9, EF Core/Npgsql/PostgreSQL, React/TypeScript, HTTP JSON/multipart, cookie đăng nhập và CSRF. Ranh giới cần kiểm tra: dữ liệu Excel/JSON → API → service → database/tạo tài khoản; exception → handler/log → apiClient → thông báo trên UI. ASVS liên quan: V4, V5, V7, V11, V12, V13, V14.

## Phạm vi đã đối chiếu

| Phần | Cơ chế hiện tại | Kết quả chính |
|---|---|---|
| Auth | Result/errorCode, HTTP 401/403/409, CSRF filter | Backend có phân loại; một số màn hình làm mất mã lỗi |
| Catalog | Result/errorCode, ToResult, handler DbUpdateException | Unique/FK đã có 409; import tạo tài khoản chưa nguyên tử |
| Cohorts | Result/errorCode, ToResult | Có mã nghiệp vụ; exception ngoài các nhánh này vẫn theo handler chung |
| Surveys | Result/errorCode, ToResult, thao tác multipart | Có mã nghiệp vụ nhưng còn 8 mã không có thông báo riêng trên frontend |
| Reports/sentiment review | Scope-filtered service; ArgumentException cho nhãn không hợp lệ | Lỗi đọc dữ liệu ở một số màn hình bị chuyển thành danh sách rỗng |
| GraduationAnalytics2 đang được map | Domain exception + ToError, mã lỗi và lỗi theo dòng | Parser bắt quá rộng, làm mất exception gốc |
| GraduationAnalytics cũ | Đối chiếu cùng mẫu parser/exception | Không coi route cũ là route đang phục vụ; Program chỉ map module 2 |
| API dùng chung | GlobalExceptionHandler | Có log exception đầy đủ; phân loại theo exception tổng quát chưa đúng |
| Frontend dùng chung | apiRequest/csrfRequest | HTTP 500 khác lỗi mạng; response bất thường chưa được chuẩn hóa |
| SentimentWorker | Log, exit code và retry theo chu kỳ | Có xử lý shutdown và batch failure; InvalidOperationException vẫn bị gom về lỗi model |
| AgentMemory | Bắt lỗi và trả false/[] | Cơ chế giảm chức năng khi dịch vụ phụ lỗi; không dùng để kết luận import giảng viên |
| Deploy | Workflow checkout origin/master | Không tự triển khai working tree chưa commit của fixkc |

Đã quét khai báo route và đường throw/catch ở backend, service gọi HTTP và các nơi hiển thị lỗi ở frontend. Có 169 khai báo route trong source, gồm cả module cũ; không đồng nghĩa 169 route đang được map hoặc mọi tổ hợp đầu vào đã được kiểm thử.

## Phát hiện còn mở

### ERR-01 — P1: import có thể báo lỗi nhưng đã lưu một phần dữ liệu

- Vị trí: `src/Backend/Infrastructure/Catalog/EfCatalogService.cs:1978`, `:1986`.
- Import giảng viên gọi SaveChanges để lưu giảng viên, sau đó mới bảo đảm tài khoản/profile và gọi SaveChanges lần nữa. Không có transaction bao ngoài hai bước.
- Đã tái hiện trên PostgreSQL 16: sau lỗi tạo tài khoản, `lecturer=true`, `user=false` khi đọc bằng DbContext mới.
- Người dùng thử lại có thể gặp email đã tồn tại, trong khi tài khoản vẫn chưa được tạo. Lỗi không chỉ nằm ở thông báo.
- Hướng xử lý: transaction cho toàn bộ nghiệp vụ, kiểm tra điều kiện cần trước lần ghi đầu, có quy trình đối chiếu giảng viên chưa có tài khoản đã tồn tại từ trước. Không tự xóa hoặc gắn lại tài khoản lịch sử.
- Mapping: CWE-841; ASVS V11. Phân loại sửa: human-review-required vì tác động luồng tạo tài khoản và dữ liệu lịch sử; người yêu cầu hiện chỉ yêu cầu rà soát.

### ERR-02 — P2: validation giảng viên không khớp bảng Users được tạo kèm

- Vị trí: `EfCatalogService.cs:1871`, `:2550`, `:2911`; `src/Backend/Infrastructure/Persistence/AppDbContext.cs:98`.
- `Lecturers.FullName` không có trần 200 ký tự, nhưng được chép vào `Users.DisplayName` có trần 200. Email giảng viên cũng không được giới hạn theo `Users.Email` 320 ký tự tại service này.
- Đã tái hiện: tên 201 ký tự → giảng viên lưu thành công → tạo user phát sinh DbUpdateException/PostgreSQL 22001 → HTTP 500/API_SERVER_ERROR.
- Đây là đầu vào có thể kiểm tra trước, cần trả lỗi nghiệp vụ rõ ràng và lỗi từng dòng khi import, không để database phát hiện ở bước sau.
- Không khẳng định tên dài là nguyên nhân của file 13 dòng trên server thật; chưa có file/log để đối chiếu.
- Mapping: CWE-20; ASVS V5.1.1. Hướng sửa: assisted-fix; đồng bộ giới hạn trong DTO, service, Excel parser và UI.

### ERR-03 — P2: exception kỹ thuật bị coi là lỗi người dùng và có thể lộ thông tin nội bộ

- Vị trí: `src/Backend/API/Middleware/GlobalExceptionHandler.cs:42`, `:54`, `:60`; `EfCatalogService.cs:2591`.
- Mọi KeyNotFoundException thành 404, ArgumentException/InvalidOperationException thành 400 và trả nguyên Message.
- Đã tái hiện bằng import thực: thiếu role FACULTY_MANAGER → truy cập dictionary thất bại → 404/API_NOT_FOUND, dù lỗi là cấu hình hệ thống. Giảng viên vẫn đã được lưu ở bước trước.
- Đã kiểm chứng trực tiếp handler: InvalidOperationException mang thông tin implementation trả 400 cùng nguyên nội dung đó.
- Hướng xử lý: chỉ phân loại lỗi dự kiến thông qua Result hoặc exception nghiệp vụ có kiểu/mã rõ ràng. Exception kỹ thuật không nhận diện được giữ 500, detail an toàn; stack/inner exception chỉ nằm trong log.
- Mapping: CWE-209, CWE-755; ASVS V7.4.1. Hướng sửa: assisted-fix; cần kiểm tra các nơi đang dựa vào ArgumentException để báo lỗi hợp lệ, như nhãn cảm xúc.

### ERR-04 — P2: handler chưa bảo toàn trạng thái của BadHttpRequestException

- Vị trí: `GlobalExceptionHandler.cs:24`; các endpoint gọi ReadFormAsync như `src/Backend/API/Surveys/SurveyEndpoints.cs:447`.
- Kiểm chứng trực tiếp handler: BadHttpRequestException có status 400 hoặc 413 đều rơi vào nhánh 500.
- Đây là kiểm chứng handler, không phải kết luận mọi JSON binding error đều thành 500: framework có thể xử lý lỗi binding trước khi tới handler.
- Hướng xử lý: bảo toàn trạng thái 4xx hợp lệ của lỗi đọc request, xử lý riêng multipart hỏng/thiếu boundary, giới hạn kích thước; không chuyển mọi InvalidDataException toàn hệ thống thành lỗi client vì lỗi file/model nội bộ cũng có thể mang kiểu này.
- Mapping: CWE-755; ASVS V5, V7. Hướng sửa: assisted-fix.

### ERR-05 — P2: ghi thành công nhưng GET làm mới thất bại bị báo thành ghi thất bại

- Vị trí: `src/Frontend/src/App.tsx:387`, `:430`, `:473`, `:541`; các hàm save/delete trong cùng file cũng có mẫu tương tự.
- POST/PUT/DELETE và lần GET nạp lại danh sách cùng nằm trong một Promise/try-catch. Import dialog chỉ nhận kết quả sau khi GET thành công.
- Nếu POST import trả 200 nhưng GET lecturers trả 500, UI vẫn báo thao tác import thất bại và không hiện kết quả từng dòng đã nhận.
- Hướng xử lý: giữ kết quả ghi ngay khi POST thành công; lỗi GET là cảnh báo danh sách chưa được làm mới, có nút tải lại; không khuyến khích gửi lại thao tác ghi.
- Mapping: CWE-703; ASVS V11. Hướng sửa: assisted-fix.

### ERR-06 — P2: apiClient không chuẩn hóa response bất thường

- Vị trí: `src/Frontend/src/services/apiClient.ts:39`, `:55`; `src/Frontend/src/pages/UsersAdminPage.tsx:216`.
- Đã tái hiện bằng fetch giả lập: status 500 với body JSON `null` gây TypeError, thay vì ApiError giữ status 500. Status 200 với JSON hỏng gây SyntaxError. Lỗi đọc body sau khi nhận header cũng nằm ngoài catch fetch ban đầu.
- UI gặp exception ngoài ApiError có thể dùng thông báo sai, ví dụ UsersAdminPage hiển thị “Không thể kết nối tới máy chủ”.
- Hướng xử lý: kiểm tra body là object; phân biệt transport/HTTP/protocol/body-read errors, luôn giữ status đã biết; bảo toàn AbortError.
- Mapping: CWE-703; ASVS V7. Hướng sửa: assisted-fix.

### ERR-07 — P2: các màn hình chưa dùng thống nhất bảng thông báo lỗi

- `UsersAdminPage.tsx:216` bỏ qua commonApiErrorMessage cho API_SERVER_ERROR/API_NETWORK_ERROR/401/403/409.
- `src/Frontend/src/auth/authMessages.ts:16` không có fallback chung cho các mã API_* mới. `ProfileSelectionPage.tsx:17` gán mọi lỗi tải profile thành AUTH_SESSION_EXPIRED, kể cả lỗi máy chủ hoặc mạng.
- Quét literal trong source cho thấy 8 mã khảo sát chưa xuất hiện ở frontend: SURVEY_ATTENTION_CHECK_ON_TEXT_SCALE, SURVEY_ATTENTION_CHECK_VALUE_INVALID, SURVEY_LECTURER_HAS_NO_SECTIONS, SURVEY_OUT_OF_SCOPE, SURVEY_SCOPE_NOT_FOUND, SURVEY_SCOPE_TYPE_INVALID, SURVEY_SCORING_THRESHOLD_INVALID, SURVEY_SEMESTER_SURVEY_HAS_NO_SECTIONS.
- 60 mã catalog và 17 mã cohort đã có literal tương ứng trong frontend; không suy ra mọi nhánh UI đều hiển thị đúng chỉ từ phép quét này.
- apiClient cũng chưa có fallback riêng cho 413 và 429. Hai trạng thái này đều thành API_REQUEST_FAILED khi response không có errorCode.
- Hướng xử lý: mỗi module chỉ định nghĩa mã nghiệp vụ riêng, fallback qua bảng lỗi chung; giữ nguyên mã gốc và thông tin thời gian thử lại nếu có.
- Mapping: CWE-703; ASVS V7. Hướng sửa: assisted-fix.

### ERR-08 — P2: response lỗi không có mã đối chiếu với log

- Vị trí: `GlobalExceptionHandler.cs:22`, `:84`.
- Handler đã LogError kèm exception, nên không phải backend hoàn toàn nuốt exception. Nhưng response do handler tự ghi không có traceId/requestId; cả các probe handler đều xác nhận `hasTraceId=false`.
- AddProblemDetails không tự bổ sung traceId vào đối tượng được handler tự WriteAsJsonAsync theo cách hiện tại.
- Hướng xử lý: ghi cùng traceId vào response an toàn và log có cấu trúc, kèm route và giai đoạn thao tác; không ghi cookie/CSRF/request body nhạy cảm và không trả SQL/stack trace cho trình duyệt.
- Mapping: ASVS V7. Hướng sửa: auto-fix nếu chỉ thêm metadata/log theo quy ước hiện có; cần test sự trùng khớp hai đầu.

### ERR-09 — P2: parser tốt nghiệp làm mất nguyên nhân kỹ thuật

- Vị trí: `src/Backend/Infrastructure/GraduationAnalytics2/ClosedXmlGraduationImportParser.cs:62`; `src/Backend/Application/GraduationAnalytics2/GraduationAnalyticsContracts.cs:20`. Parser module cũ có cùng mẫu.
- Bắt mọi exception trừ cancellation rồi tạo GraduationAnalyticsException mới với câu “file hỏng hoặc đặt mật khẩu”, không lưu inner exception và không log exception gốc.
- Endpoint bắt domain exception và trả 400. Vì vậy một lỗi code/thư viện trong parser có thể bị gán cho file người dùng; global handler không nhận được lỗi gốc để log.
- Hướng xử lý: chỉ bắt các lỗi định dạng dự kiến; bảo toàn inner exception hoặc log có trace trước khi chuyển đổi. Không trả nguyên stack trace về UI.
- Mapping: CWE-755; ASVS V7. Hướng sửa: assisted-fix.

### ERR-10 — P2: lỗi nạp báo cáo bị chuyển thành trạng thái không có dữ liệu

- Vị trí ví dụ: `src/Frontend/src/pages/ReportsOverviewPage.tsx:1471`.
- Lỗi lấy danh sách đợt khảo sát bị catch rồi setSemesterSurveys([]), không có thông báo lỗi riêng cho lần lấy đó. Lỗi kết nối/500 và học kỳ thật sự không có đợt trở nên khó phân biệt trên UI.
- Đây là vấn đề ở thao tác đọc; không đánh đồng mọi catch trả [] là lỗi. Ví dụ dịch vụ phụ AgentMemory có thể chủ động giảm chức năng khi không hoạt động.
- Hướng xử lý: duy trì trạng thái loading/error/empty riêng, giữ dữ liệu cũ nếu có và cho thử lại.
- Mapping: CWE-703; ASVS V7. Hướng sửa: assisted-fix.

## Các điểm đã đúng

- Global handler có mã cho unique/FK từ DbUpdateException: HTTP 409 và mã nghiệp vụ hoặc DATA_CONFLICT/DATA_REFERENCE_CONFLICT; không trả SQL/constraint cho client ở các nhánh đó.
- Unknown exception trả 500 với detail chung là đúng hướng bảo mật. Cần thêm mã đối chiếu log, không nên sửa bằng cách trả mọi exception.Message.
- Lỗi business trong Catalog/Surveys/Cohorts/Admin phần lớn dùng Result + errorCode. GraduationAnalytics2 có domain exception và lỗi theo dòng trong response.
- csrfRequest làm mới CSRF rồi chỉ thử lại khi mã AUTH_CSRF_INVALID được trả về, không tự retry thao tác ghi với mọi 500.
- Worker có log cho batch failure, exit code riêng và coi shutdown cancellation là bình thường. Lưu ý nhánh bắt InvalidOperationException rộng vẫn có thể gán nhầm lỗi DB/query thành lỗi model, cần kiểm tra thêm nếu phát sinh ở vận hành.

## Đối chiếu lỗi trên server người dùng

Response người dùng cung cấp có title/status/detail/instance, không có errorCode. Working tree hiện tại luôn thêm errorCode ở đường GlobalExceptionHandler.

Đã đưa chính cấu trúc response đó qua apiClient hiện tại: kết quả là ApiError(500, API_SERVER_ERROR), hiển thị “Máy chủ gặp lỗi khi xử lý yêu cầu. Vui lòng thử lại sau.”; lỗi fetch thật mới thành API_NETWORK_ERROR.

Do đó thông báo “Không thể kết nối tới máy chủ” trong ảnh không khớp đường xử lý import của frontend hiện tại. Có thể bản triển khai cũ hoặc đường sinh response khác; chưa kiểm tra được binary/commit production. Workflow hiện fetch/reset origin/master, trong khi nhánh đang duyệt là fixkc và nhiều bản sửa vẫn chưa commit. Không khẳng định bản sửa ở workspace đã có trên máy chủ.

Không có log production/file Excel gốc nên các tình huống tái hiện ở đây không chứng minh nguyên nhân cụ thể của lần 500 tại 12:19:39 ngày 18/11/2026.

## Kiểm chứng đã thực hiện

- 6/6 GlobalExceptionHandlerTests hiện có đạt. Các test này kiểm unique/FK và unknown exception, chưa bao phủ các lỗi mới phát hiện.
- 7 tình huống exception được đưa qua handler thật bằng chương trình kiểm chứng tạm; trong đó 2 tình huống import dùng service thật trên PostgreSQL 16 đã migrate/seed, đọc trạng thái sau lỗi bằng DbContext khác.
- 9 tình huống apiClient chạy từ TypeScript hiện tại với fetch giả lập: response 500 giống server, network failure, 401, 403, 409, 413, 429, JSON thành công bị hỏng, body lỗi null.
- Không kiểm thử trực tiếp endpoint production. Probe BadHttpRequestException là kiểm thử handler, không phải integration test của toàn pipeline binding/multipart.

## Thứ tự khắc phục đề nghị

1. Làm import giảng viên/tài khoản nguyên tử; đồng bộ validation và thông báo lỗi từng dòng.
2. Tách lỗi nghiệp vụ dự kiến khỏi exception kỹ thuật trong handler; thêm traceId an toàn.
3. Sửa frontend để lỗi làm mới không biến thành lỗi ghi, chuẩn hóa response bất thường và fallback thông báo chung.
4. Giữ nguyên nhân gốc ở parser, tách error/empty ở màn báo cáo.
5. Xác nhận commit frontend/backend chạy trên máy chủ và chạy regression trên database tạm trước khi triển khai.

Đợt rà soát không tạo patch ứng dụng nên không cần rollback code. Nếu sửa tiếp, phải giữ nguyên các thay đổi đang có trong working tree; không reset cả file về HEAD. Việc xử lý dữ liệu giảng viên/tài khoản đã lưu dở cần kế hoạch và đối chiếu riêng, không được xem rollback code là rollback dữ liệu.
