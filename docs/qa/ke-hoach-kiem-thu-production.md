# Kế hoạch kiểm thử trước khi phát hành Production

> Sản phẩm: Hệ thống Đánh giá & Khảo sát Chất lượng Dạy - Học VMU  
> Phiên bản/commit cần kiểm thử: `________________`  
> Môi trường staging: `________________`  
> Ngày phát hành dự kiến: `________________`  
> QA phụ trách: `________________`  
> Trạng thái hiện tại: **NO-GO** cho đến khi các điều kiện chặn phát hành được đóng.

## 1. Mục tiêu và nguyên tắc

Mục tiêu là chứng minh bản phát hành hoạt động đúng trên môi trường tương đương production, bảo vệ dữ liệu khảo sát, phân quyền đúng và có thể vận hành/khôi phục an toàn. “Build thành công” hoặc “không thấy lỗi giao diện” không đủ để kết luận có thể phát hành.

Nguyên tắc thực hiện:

- Kiểm thử trên staging có cấu hình HTTPS, reverse proxy, OAuth, DB, biến môi trường và dữ liệu gần production nhất có thể.
- Không dùng dữ liệu cá nhân thật trong môi trường test; nếu phải dùng bản sao production thì bắt buộc ẩn danh/mask dữ liệu trước.
- Mỗi lỗi phải có mức độ, bằng chứng tái hiện, phiên bản, môi trường, ảnh/log và kết quả retest.
- Không thay đổi dữ liệu production trong quá trình kiểm thử nếu chưa có phê duyệt bằng văn bản.
- Chỉ người được phân quyền mới được có tài khoản test tương ứng từng vai trò; không chia sẻ mật khẩu/secret trong ticket, ảnh chụp, log hay tài liệu này.

## 2. Phạm vi hệ thống

| Hạng mục | Công nghệ/đặc điểm | Mục tiêu QA |
| --- | --- | --- |
| Web frontend | React + TypeScript + Vite, phục vụ qua reverse proxy | Luồng người dùng, responsive, tương thích trình duyệt, lỗi hiển thị/API |
| Backend API | ASP.NET Core .NET 9, Clean Architecture | Nghiệp vụ, xác thực, phân quyền, xử lý lỗi, API contract |
| Database | PostgreSQL 15 + EF Core migrations | Migration, toàn vẹn dữ liệu, backup/restore, truy vấn/report |
| Xác thực | Google Workspace OAuth, session/profile | Callback HTTPS, đăng nhập/đăng xuất, lựa chọn profile, quyền |
| Khảo sát | Cây năm học → học kỳ → đợt; link công khai; gửi phiếu | Tính đúng đắn, chống gửi lặp, ranh giới thời gian, dữ liệu báo cáo |
| Báo cáo & quản trị | Dashboard, thống kê, import/export, danh mục, người dùng | Phân quyền theo scope, số liệu, lọc, xuất file, thao tác dữ liệu |
| Hạ tầng | Docker Compose, PostgreSQL, reverse proxy/TLS | Health check, secret, log, giám sát, rollback, khôi phục |

Ngoài phạm vi cho release này (ghi rõ nếu có): `________________`.

## 3. Vai trò, tài khoản và dữ liệu test

Tạo các tài khoản staging riêng, không dùng chung và không cấp quyền cao hơn cần thiết.

| Mã | Vai trò | Mục đích tối thiểu |
| --- | --- | --- |
| U0 | Anonymous | Mở link khảo sát công khai, thử truy cập API không đăng nhập |
| U1 | Giảng viên/đơn vị thường | Xem các dữ liệu thuộc phạm vi được cấp; xác nhận bị chặn với dữ liệu ngoài phạm vi |
| U2 | Quản lý đơn vị/khoa | Quản lý hoặc xem báo cáo trong scope đơn vị |
| U3 | Survey admin | Tạo/cấu hình/mở-đóng đợt khảo sát và xem báo cáo được phép |
| U4 | System admin | Quản lý người dùng, vai trò, danh mục hệ thống; dùng để test audit/giới hạn quyền |
| U5 | Sinh viên/đối tượng khảo sát | Bắt đầu và gửi phiếu khảo sát |

Chuẩn bị dữ liệu test có kiểm soát:

- Ít nhất 2 năm học, 2 học kỳ/năm, 2 đơn vị/khoa, 2 lớp học phần và dữ liệu ở các scope khác nhau.
- Một đợt ở mỗi trạng thái: nháp, sắp mở, đang mở, đã đóng; có ít nhất một phiếu có câu bắt buộc và câu không bắt buộc.
- Đáp án biên: điểm thấp/cao nhất, text Unicode tiếng Việt dài, dữ liệu rỗng hợp lệ, ngày giờ sát thời điểm mở/đóng.
- Tối thiểu 20 phản hồi mẫu để đối chiếu lọc, tổng hợp và export; có một dữ liệu cố tình sai để xác nhận validation/import error.
- Ghi “baseline” số lượng bản ghi và các số liệu báo cáo trước khi chạy migration/deploy.

## 4. Mức độ lỗi và quy tắc quyết định

| Mức | Định nghĩa | Xử lý |
| --- | --- | --- |
| P0 – Blocker | Mất/rò dữ liệu, vượt quyền, không đăng nhập/gửi phiếu được, hệ thống không chạy, migration nguy hiểm | Dừng release; phải sửa và retest đầy đủ |
| P1 – Critical | Luồng nghiệp vụ chính sai, số liệu báo cáo sai, lỗi thường xuyên không có workaround chấp nhận được | Không phát hành nếu chưa có chấp thuận rủi ro bằng văn bản của Product Owner + kỹ thuật |
| P2 – Major | Chức năng phụ sai/có workaround; ảnh hưởng đáng kể một nhóm người dùng | Sửa trước release hoặc có kế hoạch khắc phục được phê duyệt |
| P3 – Minor | Hiển thị, chính tả, trải nghiệm nhỏ, không ảnh hưởng dữ liệu/nghiệp vụ | Ghi backlog, có thể phát hành |

**Quy tắc GO:** không còn P0/P1 mở; toàn bộ test bắt buộc pass; có bằng chứng backup/restore và rollback; người phụ trách nghiệp vụ ký UAT. Lỗi P2/P3 còn lại phải có owner, ETA và chấp nhận rủi ro.

## 5. Điều kiện vào/ra của từng vòng QA

### Điều kiện bắt đầu (Entry criteria)

- Có release candidate cố định: tag/image digest/commit SHA, changelog và danh sách migration.
- Staging truy cập qua domain HTTPS; API chỉ đi qua reverse proxy như production.
- Tất cả secret production được inject từ secret manager; QA chỉ xác nhận sự tồn tại/khả năng chạy, không ghi giá trị secret.
- Migration đã được review và có bản backup DB staging trước khi chạy.
- Có tài khoản/seed data theo mục 3; người liên hệ kỹ thuật và nghiệp vụ sẵn sàng xử lý lỗi.

### Điều kiện kết thúc (Exit criteria)

- Hoàn thành 100% test case P0/P1 và tối thiểu 95% toàn bộ test case đã lập; các case không chạy phải có lý do/phê duyệt.
- Regression sau khi sửa lỗi pass; không có lỗi mới do bản sửa tạo ra.
- Có báo cáo kết quả, danh sách lỗi còn lại, bằng chứng kiểm thử, chữ ký QA/PO/Tech Lead và quyết định GO/NO-GO.

## 6. Kế hoạch thực hiện theo giai đoạn

| Giai đoạn | Nội dung | Đầu ra | Owner |
| --- | --- | --- | --- |
| G0 – Chuẩn bị | Chốt phạm vi, RC, dữ liệu, tài khoản, môi trường, SLO | Test charter, danh sách case, baseline dữ liệu | QA + PO + DevOps |
| G1 – Smoke sau deploy | Kiểm tra truy cập, health/readiness, đăng nhập, link khảo sát, DB, log | Biên bản smoke ≤ 30 phút | QA + DevOps |
| G2 – Functional & regression | Chạy test case mục 7–10, retest lỗi | Test report và defect log | QA |
| G3 – Non-functional | Security, migration, backup/restore, tải, browser/device | Báo cáo rủi ro và số đo | QA + DevOps |
| G4 – UAT | Người dùng nghiệp vụ xác nhận dữ liệu, báo cáo và workflow | UAT sign-off | PO/đơn vị nghiệp vụ |
| G5 – Go-live | Backup, migration, canary/smoke production, monitor | Biên bản release | Release manager |
| G6 – Hypercare | Theo dõi cảnh báo và lỗi sau phát hành | Báo cáo D+1/D+7 | QA + vận hành |

## 7. Test cases bắt buộc: xác thực, session và phân quyền

Đánh dấu `Pass / Fail / Blocked / N/A`, kèm link bằng chứng cho từng case.

| ID | Case | Bước kiểm thử/tình huống | Kết quả mong đợi | Mức |
| --- | --- | --- | --- | --- |
| AUTH-01 | Đăng nhập Google Workspace | Đăng nhập bằng U1–U4 trên domain HTTPS | Quay lại đúng ứng dụng; không loop callback; session hợp lệ | P0 |
| AUTH-02 | Từ chối tài khoản ngoài Workspace | Dùng tài khoản không thuộc domain/chưa được cho phép | Bị từ chối rõ ràng, không tạo session/quyền | P0 |
| AUTH-03 | Callback/reverse proxy | Mở login, callback `/signin-google`, refresh sau callback | Không mixed-content/redirect sai host; cookie hoạt động qua HTTPS | P0 |
| AUTH-04 | Lựa chọn profile bắt buộc | Đăng nhập tài khoản có nhiều profile và thử truy cập URL trực tiếp | Không truy cập workspace/API trước khi chọn profile | P1 |
| AUTH-05 | Đổi profile | Chuyển profile rồi xem menu/dữ liệu | Quyền và dữ liệu đổi đúng; profile hiện tại rõ ràng | P1 |
| AUTH-06 | Đăng xuất & hết hạn | Logout; mở lại tab/back; mô phỏng session hết hạn | Session bị huỷ; không xem dữ liệu cache; điều hướng login hợp lý | P1 |
| AUTH-07 | Ma trận quyền UI | Với U0–U4, mở từng màn hình/nút hành động | UI chỉ hiển thị thao tác được phép; không coi UI là lớp bảo vệ duy nhất | P1 |
| AUTH-08 | Ma trận quyền API | Gọi trực tiếp GET/POST/PUT/PATCH/DELETE của tài nguyên ở scope khác | Anonymous nhận 401/403 đúng; vai trò thấp bị chặn; vai trò đúng được phép | P0 |
| AUTH-09 | CSRF | Dùng session cookie, gửi request thay đổi dữ liệu thiếu/sai CSRF token | Bị chặn; request hợp lệ có token thành công | P0 |
| AUTH-10 | IDOR/scope bypass | Sửa ID trên URL/payload sang dữ liệu khoa/đợt khác | Không đọc/sửa/xoá được dữ liệu ngoài scope | P0 |

## 8. Test cases bắt buộc: nghiệp vụ khảo sát và quản trị

| ID | Case | Bước kiểm thử/tình huống | Kết quả mong đợi | Mức |
| --- | --- | --- | --- | --- |
| SUR-01 | Cây danh mục | Tạo/sửa/xoá năm học, học kỳ, đợt hợp lệ và dữ liệu trùng/thiếu | Validation đúng; quan hệ cha-con và thứ tự hiển thị đúng | P1 |
| SUR-02 | Tạo/cập nhật đợt khảo sát | Nhập đủ/thiếu trường, thời gian không hợp lệ, ký tự tiếng Việt | Lưu đúng hoặc báo lỗi cụ thể; không mất dữ liệu form | P1 |
| SUR-03 | Mở/đóng đợt | Thử mở/đóng với quyền hợp lệ và không hợp lệ | Chỉ đúng vai trò thao tác; trạng thái phản ánh đúng | P0 |
| SUR-04 | Ranh giới thời gian | Mở link trước mở, đúng lúc mở, sát lúc đóng, sau đóng | Chỉ nhận phiếu trong cửa sổ hợp lệ; timezone nhất quán | P0 |
| SUR-05 | Link/QR công khai | Mở từ incognito, thiết bị khác, link sai/đã hết hạn | Link hợp lệ hoạt động; link sai/hết hạn không rò dữ liệu | P0 |
| SUR-06 | Bắt đầu làm bài | Bắt đầu, refresh/đổi tab/quay lại | Trạng thái/ticket hợp lệ theo yêu cầu; không cấp quyền vượt phạm vi | P1 |
| SUR-07 | Câu hỏi và validation | Bỏ câu bắt buộc, nhập text dài, chọn min/max, Unicode | Thông báo rõ; dữ liệu hợp lệ lưu chính xác | P1 |
| SUR-08 | Gửi phiếu | Submit một lần, double-click, gửi đồng thời 2 tab | Tối đa một phản hồi hợp lệ theo quy tắc; không nhân đôi dữ liệu | P0 |
| SUR-09 | Lỗi mạng khi submit | Ngắt mạng/timeout sau khi nhấn gửi rồi thử lại | Không mất hoặc nhân đôi phản hồi; thông báo có thể hành động | P1 |
| SUR-10 | Đóng khi đang làm | Bắt đầu trước giờ đóng, gửi sau giờ đóng | Xử lý đúng theo quy định nghiệp vụ được PO xác nhận | P1 |
| ADM-01 | Quản lý người dùng | Tạo/sửa/khoá/gán quyền và dữ liệu lỗi | Không tự nâng quyền; validation và scope đúng | P0 |
| ADM-02 | Import người dùng/dữ liệu | File chuẩn, trùng, thiếu cột, sai kiểu, file lớn | Preview/lỗi theo dòng; không import một phần ngoài ý muốn; có tổng kết | P1 |
| ADM-03 | Thao tác phá huỷ | Xoá/sửa dữ liệu có quan hệ | Có xác nhận, ràng buộc đúng, soft-delete/audit nếu thiết kế yêu cầu | P1 |

## 9. Báo cáo, dashboard, export và toàn vẹn số liệu

| ID | Case | Cách xác nhận | Kết quả mong đợi | Mức |
| --- | --- | --- | --- | --- |
| REP-01 | Dashboard tổng quan | Đối chiếu từng KPI với truy vấn DB/baseline được phê duyệt | Số liệu, nhãn, đơn vị, tỷ lệ và thời điểm cập nhật đúng | P0 |
| REP-02 | Lọc theo scope/năm/học kỳ/đợt | Đổi từng bộ lọc, reset và dùng URL nếu có | Không lẫn dữ liệu ngoài scope; mọi widget dùng cùng phạm vi | P0 |
| REP-03 | Biểu đồ xu hướng/tốt nghiệp | Đối chiếu dataset nhỏ đã tính tay | Giá trị, trục, tooltip, nhóm “không đủ dữ liệu” đúng | P1 |
| REP-04 | Phân trang/tìm kiếm/sắp xếp | Dữ liệu vượt 1 trang, ký tự Việt, trang cuối | Không trùng/mất bản ghi; tổng số và thứ tự đúng | P1 |
| REP-05 | Export | Tải Excel/PDF/CSV nếu có và đối chiếu số dòng/cột/lọc | Nội dung đúng scope/filter, định dạng mở được, không rò dữ liệu | P0 |
| REP-06 | Cache sau thay đổi | Sửa template/thang điểm/mở-đóng rồi xem lại báo cáo | Cache được invalidation; không hiển thị số cũ | P1 |
| REP-07 | Dữ liệu xoá mềm | Xoá mềm phản hồi/section theo luồng được hỗ trợ | Báo cáo và đếm số phản hồi tuân thủ quy định nghiệp vụ | P1 |

## 10. UI/UX, tương thích và accessibility

- Chạy smoke UI trên Chrome và Edge bản ổn định mới nhất; Safari/iOS nếu người dùng mục tiêu có dùng; Firefox nếu được yêu cầu.
- Kiểm tra tối thiểu 1440×900, 1280×720, 768×1024 và 390×844: không có tràn ngang cấp trang, text/nút/modal không bị che, bảng rộng cuộn trong vùng bảng.
- Đi qua luồng chính bằng bàn phím: Tab/Shift+Tab, focus rõ ràng, Enter/Escape hợp lý, modal giữ focus và không thể thao tác nền khi mở.
- Xác nhận label của input, thông báo validation, contrast, trạng thái loading/empty/error, toast không che CTA quan trọng.
- Mở DevTools Console/Network trong các luồng chính: không có exception, request 4xx/5xx bất thường, asset không lỗi/mixed content.
- Kiểm tra tiếng Việt dấu, timezone/date format, copy/paste và tải file trên trình duyệt mục tiêu.

## 11. Kiểm thử database, migration, backup và khôi phục

1. Chụp baseline: phiên bản migration hiện tại, số lượng bản ghi theo bảng trọng yếu, dung lượng DB, dữ liệu mẫu đối chiếu.
2. Tạo backup staging bằng quy trình chính thức; ghi mã backup, thời điểm, checksum và người lưu giữ.
3. Chạy migration bằng **một deployment job duy nhất** (không để nhiều API replica tự chạy migration). Lưu log, thời gian chạy và migration ID.
4. Xác nhận migration history đúng; smoke API/luồng khảo sát và đối chiếu dữ liệu sau migration.
5. Restore backup vào một DB cô lập; khởi động ứng dụng trỏ tới DB đã restore và chạy smoke. Đo RTO/RPO thực tế.
6. Nếu migration có thay đổi phá vỡ tương thích, mô tả rõ chiến lược expand/contract, bản app tương thích ngược và điểm không thể rollback.

Tiêu chí pass: không mất/biến dạng dữ liệu, constraint/index hoạt động, thời gian migration/restore trong giới hạn đã chốt, ứng dụng cũ/mới xử lý đúng theo chiến lược release.

## 12. Kiểm thử bảo mật và cấu hình production

| Hạng mục | Cách kiểm tra | Tiêu chí pass |
| --- | --- | --- |
| Secret | Quét Git/image/log/config; review deployment manifest | Không có secret thật trong repository/image/log; thiếu secret bắt buộc phải fail fast |
| Biến môi trường | Review `.env.example`, compose/manifests và production secret injection | Không có mật khẩu/khóa mặc định vận hành được; production không tải file `.env` cục bộ |
| TLS/headers | Kiểm tra HTTPS, redirect HTTP→HTTPS, HSTS, CSP, X-Content-Type-Options, frame policy theo thiết kế | Không mixed-content; header phù hợp; không nhúng trái phép |
| Network | Scan bề mặt public và kiểm tra port/container | Chỉ frontend/reverse proxy public; DB và công cụ quản trị không public |
| Dependency/image | Chạy audit npm/NuGet, scan image theo CI | Không còn High/Critical chưa được chấp thuận |
| Input/file upload | Fuzz input cơ bản, import file sai định dạng/kích thước | Validation server-side; lỗi không lộ stack trace/dữ liệu nhạy cảm |
| Logging | Gây lỗi có kiểm soát, đối chiếu log | Có correlation ID; không log token, cookie, mật khẩu hoặc dữ liệu nhạy cảm |
| Rate limiting | Gửi nhiều request vào endpoint công khai | Bị giới hạn có kiểm soát, không chặn nhầm người dùng bình thường |

**Phát hiện cần xác minh trước production:** cấu hình Compose hiện còn fallback mật khẩu DB trong biểu thức mặc định. Không được dựa vào fallback này ở production; DevOps cần loại bỏ/ghi đè bằng secret manager và QA xác nhận dịch vụ không thể khởi động khi thiếu secret bắt buộc.

## 13. Hiệu năng, độ tin cậy và quan sát vận hành

Chốt SLO với PO/DevOps trước khi chạy (mẫu đề xuất dưới đây; thay bằng số đã thống nhất):

| Chỉ số | Mục tiêu đề xuất | Cách đo |
| --- | --- | --- |
| Availability trong giờ khảo sát | ≥ 99.9% | Synthetic check/monitoring |
| API đọc p95 | ≤ 500 ms | APM/load test, không tính mạng client |
| Submit khảo sát p95 | ≤ 1.000 ms | k6/APM với payload thực tế |
| Tỷ lệ lỗi 5xx | < 0.5% | APM/log theo endpoint |
| Tỷ lệ submit thành công | ≥ 99.5% | Event/DB reconciliation |
| RPO/RTO | `____` / `____` | Restore drill |

Kịch bản tải tối thiểu:

- Tải nền: người dùng đăng nhập, xem dashboard, lọc danh sách/report.
- Tải cao điểm: đồng thời mở link và gửi phản hồi ở gần thời hạn đóng khảo sát.
- Tải hỗn hợp: 80% đọc, 15% gửi phiếu, 5% thao tác quản trị/report/export; dùng dữ liệu không nhạy cảm gần kích thước thực tế.
- Quan sát CPU/RAM, số DB connection, lock/deadlock, slow query, p95/p99, error rate, hàng đợi và khả năng phục hồi sau tăng tải.
- Không test tải vào production trừ khi có cửa sổ, giới hạn và phê duyệt chính thức.

Yêu cầu quan sát: dashboard sức khoẻ, liveness/readiness tách biệt, log tập trung có correlation ID, cảnh báo 5xx/latency/DB pool/disk/backup failure, danh sách người trực/on-call và kênh xử lý sự cố.

## 14. Runbook phát hành và rollback

### Trước cửa sổ phát hành

- [ ] Chốt RC bằng tag/commit/image digest; freeze thay đổi không thuộc bug fix release.
- [ ] Đọc changelog, danh sách migration, known issues và kế hoạch rollback.
- [ ] Xác minh dashboard/alert, phân quyền production, domain/certificate/OAuth redirect URI.
- [ ] Tạo và kiểm tra backup; xác nhận dung lượng đĩa và thời gian restore.
- [ ] Xác nhận secret manager, không gửi secret qua chat/ticket; dùng giá trị production riêng.
- [ ] Thông báo cửa sổ bảo trì, đầu mối quyết định, tiêu chí huỷ release.

### Khi phát hành

1. Bật maintenance mode nếu workflow cần thiết và thông báo cho người dùng.
2. Tạo backup cuối trước migration; ghi timestamp và checksum.
3. Chạy migration job đơn lẻ, lưu toàn bộ output; dừng nếu lỗi/khác baseline bất thường.
4. Deploy API/frontend theo chiến lược đã chọn (canary/rolling/blue-green); xác nhận image digest đúng RC.
5. Chạy smoke production: HTTPS `/healthz`, login, chọn profile, một thao tác chỉ đọc cho từng scope, mở link khảo sát và kiểm tra report read-only.
6. Theo dõi error rate, latency, DB connection/lock, log và cảnh báo liên tục ít nhất 30–60 phút hoặc hết peak đầu tiên.
7. Ghi quyết định GO/rollback và thông báo hoàn tất.

### Kích hoạt rollback

Rollback ngay khi có P0, error rate/latency vượt SLO kéo dài, lỗi migration, lỗi đăng nhập diện rộng, báo cáo sai dữ liệu hoặc dấu hiệu truy cập trái phép. Người có quyền quyết định: `________________`.

Thứ tự rollback:

1. Dừng rollout/canary và đưa traffic về bản ứng dụng ổn định.
2. Đánh giá migration: chỉ rollback DB khi runbook đã kiểm chứng; nếu migration không đảo ngược an toàn, giữ schema mới và rollback application tương thích hoặc khôi phục DB từ backup theo quyết định incident lead.
3. Xác nhận health, login, submit, dữ liệu baseline và alert sau rollback.
4. Lưu log/snapshot, thông báo sự cố, lập RCA và chỉ lên lịch phát hành lại sau khi QA retest.

## 15. UAT và biểu mẫu tổng kết

### Kịch bản UAT tối thiểu cho nghiệp vụ

1. Quản trị viên tạo/cấu hình một đợt khảo sát trong đúng năm học/học kỳ.
2. Đơn vị có thẩm quyền mở đợt và phát hành link/QR.
3. Đối tượng khảo sát mở link, trả lời, gửi thành công và không thể gửi trùng.
4. Quản lý xem dashboard/report đã lọc đúng phạm vi; xuất báo cáo và đối chiếu số mẫu.
5. Quản trị viên đóng đợt; người dùng xác nhận không còn gửi được; số liệu cuối cùng khớp truy vấn đối chiếu.

### Bảng theo dõi test execution

| Nhóm | Tổng case | Pass | Fail | Blocked | N/A | Link bằng chứng | Người xác nhận |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Smoke |  |  |  |  |  |  |  |
| Auth & phân quyền |  |  |  |  |  |  |  |
| Khảo sát |  |  |  |  |  |  |  |
| Quản trị/import |  |  |  |  |  |  |  |
| Báo cáo/export |  |  |  |  |  |  |  |
| UI/accessibility |  |  |  |  |  |  |  |
| Security |  |  |  |  |  |  |  |
| Performance/operations |  |  |  |  |  |  |  |

### Biểu mẫu quyết định release

| Mục | Kết quả |
| --- | --- |
| Release candidate / commit / image digest |  |
| Môi trường, thời gian test |  |
| Số P0/P1/P2/P3 mở |  |
| Migration + backup/restore drill | Pass / Fail – bằng chứng:  |
| Security/dependency scan | Pass / Fail – bằng chứng:  |
| Load/SLO | Pass / Fail – số liệu:  |
| UAT nghiệp vụ | Pass / Fail – người ký:  |
| Known risks và chấp nhận rủi ro |  |
| Khuyến nghị QA | GO / NO-GO |
| QA ký xác nhận | Tên / thời gian:  |
| Tech Lead/DevOps xác nhận | Tên / thời gian:  |
| Product Owner xác nhận | Tên / thời gian:  |

## 16. Thứ tự ưu tiên thực tế nếu thời gian gấp

Không bỏ qua mục P0. Nếu phải phân bổ thời gian, thực hiện theo thứ tự: (1) backup + migration + restore, (2) login/OAuth + ma trận quyền/API/CSRF, (3) mở-gửi-đóng khảo sát và chống gửi lặp, (4) báo cáo/export đối chiếu số liệu, (5) smoke production/monitoring/rollback, (6) regression UI và tải. Bất kỳ case P0 nào chưa chạy hoặc bị Blocked đều là **NO-GO**.
