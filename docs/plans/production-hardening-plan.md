# Kế hoạch production hardening

## Mục tiêu

Đưa hệ thống khảo sát VMU tới trạng thái có thể triển khai production an toàn, có thể kiểm chứng và có khả năng rollback. Không xem build hoặc unit test xanh là đủ điều kiện phát hành.

## Nguyên tắc phát hành

- Mọi API thay đổi dữ liệu phải được backend kiểm tra permission và CSRF.
- Secret chỉ được inject qua environment/secret manager; cấu hình production thiếu secret phải fail fast.
- Frontend, API và OAuth chạy same-origin sau reverse proxy HTTPS.
- Migration được chạy bằng một deployment job duy nhất trước khi rollout API.
- Release chỉ được phép khi lint, build, unit test, integration test, E2E và dependency audit đều pass.

## P0 - Blocker trước production

- [x] Áp policy `SURVEY_MANAGE` cho API quản lý khảo sát và danh mục.
- [x] Thêm regression test kiểm tra metadata authorization của endpoint.
- [x] Sửa Docker build context của frontend.
- [x] Proxy callback `/signin-google` tới API.
- [x] Xử lý forwarded headers khi chạy sau reverse proxy.
- [x] Bỏ dependency `DotNetEnv` đang kéo package High; dùng environment/User Secrets và loader Development tối thiểu không có dependency.
- [x] Loại mật khẩu mặc định khỏi Compose và appsettings.
- [x] Không public trực tiếp API; chỉ truy cập qua frontend reverse proxy.
- [x] Chuyển pgAdmin thành profile công cụ và chỉ bind loopback.
- [x] Thêm rate limit theo IP cho việc gửi phiếu công khai.
- [ ] Chạy thử toàn bộ image bằng `docker compose up --build` với secret thử nghiệm.
- [ ] Kiểm tra Google OAuth thật trên domain HTTPS production.

## P1 - Test và toàn vẹn dữ liệu

- [ ] Dùng Testcontainers PostgreSQL để test migration, seed và constraint.
- [ ] Integration test: anonymous/401, lecturer/403, survey-admin/200, admin/200.
- [ ] Integration test CSRF cho mọi POST/PUT/PATCH/DELETE dùng cookie.
- [ ] E2E Playwright: login, chọn profile, tạo khảo sát, mở link, gửi phiếu, xem báo cáo, logout.
- [ ] Thiết kế cơ chế chống gửi phiếu lặp theo yêu cầu nghiệp vụ (mã một lần/enrollment token hoặc quota đã phê duyệt).
- [ ] Vô hiệu cache public survey ngay khi template/thang điểm thay đổi, kể cả khi chạy nhiều replica.
- [ ] Test đồng thời việc mở/đóng khảo sát và submit sát thời điểm biên.
- [ ] Kiểm tra phân trang hoặc giới hạn cho mọi danh sách/report có thể tăng không giới hạn.

## P1 - Vận hành và dữ liệu

- [ ] Tách migration khỏi startup API thành deployment job có khóa chống chạy đồng thời.
- [ ] Thiết lập backup PostgreSQL, retention, mã hóa và restore drill định kỳ.
- [ ] Viết rollback runbook cho application và database migration.
- [ ] Tách liveness khỏi readiness; readiness kiểm tra database và dependency bắt buộc.
- [ ] Bổ sung structured logging, correlation ID, metrics và cảnh báo 5xx/latency/DB pool.
- [ ] Pin image bằng version/digest và bật image/dependency scan trong CI.
- [x] Chạy container API và SentimentWorker bằng non-root user.
- [x] Khai trần CPU/RAM cho mọi service trong Compose theo ngân sách máy chủ 2 vCPU / 4 GB RAM (xem khối chú thích đầu `docker-compose.yml`).
- [ ] Kiểm chứng trần tài nguyên bằng số đo thật trên máy chủ: chạy worker một lượt và đọc lại RSS đỉnh, kiểm tra API không bị bóp CPU trong lúc đó.
- [ ] Filesystem read-only cho container nghiệp vụ và tách dung lượng ghi ra volume.

## P2 - Hiệu năng và bảo trì

- [ ] Load test k6 ở 1.000 virtual users bằng dữ liệu gần production; chốt p95/p99 và error budget.
- [ ] Điều chỉnh ThreadPool, Npgsql pool và PostgreSQL bằng số liệu, không dùng hằng số phỏng đoán.
- [ ] Dùng distributed cache nếu triển khai nhiều API replica.
- [ ] Tách các service/page lớn theo workflow sau khi có characterization test.
- [ ] Bổ sung CSP, HSTS tại TLS ingress và kiểm tra security headers tự động.

## Release gates

| Gate | Điều kiện đạt |
| --- | --- |
| Authorization | Ma trận anonymous/lecturer/manager/survey-admin/admin pass ở API integration test |
| Data | Migration lên database rỗng và database snapshot pass; restore backup đã được diễn tập |
| Application | Backend Release build/test và frontend lint/build/test pass |
| E2E | Luồng đăng nhập → thao tác → khảo sát công khai → báo cáo → logout pass trên HTTPS |
| Security | Không còn vulnerability High/Critical; không có secret trong Git/image |
| Performance | Đạt SLO đã thống nhất ở tải mục tiêu, không cạn DB connection pool |
| Operations | Dashboard, alert, backup, rollback và runbook đã được kiểm chứng |

## Trạng thái go/no-go

Hiện tại: **NO-GO**. Chỉ chuyển sang GO khi toàn bộ P0 và các release gate bắt buộc được xác nhận trên môi trường staging tương đương production.
