# Phiếu khảo sát tuỳ biến được — kế hoạch

Trạng thái: **bản nháp, chưa code**. Chờ danh sách loại phiếu khảo sát thu từ người dùng.

Mục tiêu: biến mẫu phiếu đang viết cứng thành **các mẫu mặc định theo từng loại khảo sát**,
và cho quản trị chỉnh lại khi tạo đợt — màu sắc, ảnh, hiển thị trường nào, các đoạn chữ
lưu ý và cảnh báo.

---

## 1. Hiện trạng

### Đã cấu hình được

- Bộ câu hỏi: `SurveyTemplates` → mục (`SurveyQuestionSections`, tối đa 3) → câu hỏi
  (`SurveyQuestions`), thang trả lời dùng chung (`AnswerScales` + `AnswerScaleOptions`).
  Tạo tay hoặc nhập từ Excel.
- Câu bẫy: đánh dấu bằng `AttentionCheckValue`, không đánh số và không tính điểm.

### Đang viết cứng

1. **Trục dữ liệu là lớp học phần.** Mỗi phiếu treo vào một `CourseSectionSurveys` = một lớp
   trong một đợt, có `LinkToken` riêng. Không có loại khảo sát nào khác.
2. **Bố cục phiếu** (`src/Frontend/src/pages/StudentSurveyView.tsx`) gồm đúng ba khối cố định:
   khối định danh (mã học phần, tên học phần, nhóm lớp, giảng viên, học kỳ) → danh sách câu
   theo mục → **một** ô góp ý tự do. Ô góp ý là cột `AdditionalComments` của bảng phiếu chứ
   không phải một câu hỏi, nên không thêm/bớt/đổi nhãn được.
3. **Chỉ hai kiểu câu hỏi:** `Options` (thang mức, mới tính được điểm) và `Text`. Không có
   nhiều lựa chọn, không có xếp hạng, không có câu hỏi điều kiện.
4. **Người trả lời ẩn danh, không đăng nhập**; mẫu số kỳ vọng luôn là sĩ số lớp. Tỷ lệ phản
   hồi, hai vòng lọc và Z-Score đều quy về lớp học phần.
5. **Toàn bộ thống kê** (lớp → học phần → bộ môn → khoa → giảng viên) dựng trên trục đó.
   Thống kê tốt nghiệp là nhánh riêng, nhập từ danh sách sinh viên, không phải một loại phiếu.

---

## 2. Nguyên tắc xuyên suốt

- Chỉ **thêm** bảng và cột, không sửa không xoá — bản đang chạy thật vẫn đang thu phiếu.
- Cấu hình **null là dùng mặc định**: mọi đợt đã tạo hiển thị y như hiện nay, không phải chạy
  cập nhật dữ liệu nào.
- Tuỳ biến gắn theo **đợt khảo sát** (`SemesterSurveys`), không gắn theo bộ câu hỏi — cùng một
  bộ câu hỏi dùng cho nhiều đợt với hình thức khác nhau.
- Không đụng tới phiếu sinh viên đã nộp và điểm đã chốt.

---

## 3. Bốn quyết định kiến trúc chốt từ đầu

Ghim sẵn để lúc thêm loại phiếu mới không phải đập đi làm lại.

1. **Tách "mẫu mặc định" khỏi "cấu hình của đợt".**
   Bảng `SurveyFormPresets` (tên mẫu, loại đối tượng, cấu hình JSON, cờ mặc định). Đợt chỉ lưu
   *dùng mẫu nào* + *phần ghi đè của riêng nó*. Sửa mẫu thì mọi đợt chưa ghi đè đổi theo, đợt
   đã chỉnh tay giữ nguyên.

2. **Mẫu gắn với loại đối tượng** (`SubjectKind`). Thêm loại khảo sát mới về sau là thêm dòng
   trong bảng mẫu, không phải sửa mã nguồn.

3. **Danh sách trường định danh do loại đối tượng cung cấp**, backend trả về, frontend chỉ vẽ
   theo. Không viết cứng tên trường trong giao diện — đây là chỗ khiến phải sửa mã mỗi lần
   thêm loại.

4. **JSON cấu hình có khoá `version`.** Đổi cấu trúc cấu hình ở phiên bản sau vẫn đọc được đợt
   cũ, không vỡ phiếu đang mở trên máy sinh viên.

---

## 4. Giai đoạn 1 — Tuỳ biến hình thức phiếu

Không đụng trục dữ liệu. Làm được ngay.

**Lưu ở đâu:** thêm cột `FormConfigJson` (text, nullable) vào `SemesterSurveys`. Một cột JSON
thay vì mười mấy cột riêng, vì đây là dữ liệu chỉ đọc nguyên khối để vẽ phiếu, không bao giờ
phải lọc hay gộp theo nó.

**Tuỳ biến được:**

| Nhóm | Nội dung |
|---|---|
| Màu | màu chủ đạo, màu nền, màu nút gửi |
| Ảnh | logo đầu phiếu, ảnh bìa |
| Chữ | tiêu đề phiếu, lời dẫn mở đầu, ghi chú ẩn danh/bảo mật, nhãn nút gửi, màn cảm ơn |
| Cảnh báo | chưa tới giờ mở, đã hết hạn, đã nộp rồi, mất mạng |

**Việc phải làm:**

- Backend: endpoint đọc/ghi cấu hình; `PublicSurveyDto` trả kèm cấu hình; endpoint tải ảnh lên
  và phục vụ tệp tĩnh (giới hạn định dạng, dung lượng, xoá ảnh khi xoá đợt).
- Frontend: tab "Tuỳ biến phiếu" trong màn tạo/sửa đợt, **xem trước bằng chính component phiếu
  thật** chứ không vẽ lại — vẽ lại thì xem trước một đằng, sinh viên thấy một nẻo.

---

## 5. Giai đoạn 2 — Khối định danh cấu hình được

Khối định danh đổi từ cứng thành một danh sách trường, mỗi trường có ba thuộc tính: **bật/tắt**,
**nhãn tự đặt**, **thứ tự**. Danh sách trường khả dụng do loại đối tượng quy định; với lớp học
phần gồm: mã học phần, tên học phần, nhóm lớp, giảng viên, bộ môn, khoa/viện, học kỳ, sĩ số.

Kèm theo: cho chèn **khối văn bản tự do** giữa các mục câu hỏi (ví dụ lời dẫn riêng cho mục
"Cơ sở vật chất").

**Điểm kỹ thuật:** `PublicSurveyDto` trả thêm mảng `identityFields` (nhãn + giá trị đã tính sẵn),
frontend render bằng vòng lặp. Giữ nguyên các trường cũ trong DTO một thời gian để phiếu đang mở
dở trên máy sinh viên không vỡ.

---

## 6. Giai đoạn 3 — Khảo sát không theo lớp học phần

Phần nặng nhất, kéo theo cả thống kê lẫn phân quyền.

**Vấn đề gốc:** mọi phiếu treo vào `CourseSectionSurveys`, mọi chỉ số quy về lớp — mẫu số là sĩ
số lớp, hai vòng lọc, Z-Score so khoa/bộ môn, xếp hạng giảng viên. Đổi đối tượng là đổi cả mẫu
số lẫn cách gộp.

**Hai đường đi:**

| | Cách A: bảng mới `SurveyTargets` | Cách B: tổng quát hoá bảng hiện có |
|---|---|---|
| Cách làm | Loại mới dùng bảng riêng (đợt, loại đối tượng, mã đối tượng, link token, số lượng kỳ vọng) | Thêm cột `SubjectKind` + `SubjectId` nullable vào `CourseSectionSurveys` |
| Rủi ro cho luồng đang chạy | Gần như không, luồng lớp học phần không đổi một dòng | Phải rà lại toàn bộ truy vấn thống kê hiện có |
| Giá phải trả | Hai đường dữ liệu song song, báo cáo phải gộp hai nguồn | Một đường duy nhất, sạch về lâu dài |

Đang thu phiếu thật nên **nghiêng về cách A**.

**Thống kê cho loại mới:** giai đoạn đầu chỉ làm mức "kết quả theo phiếu" — điểm trung bình từng
câu, phân bố lựa chọn, số phiếu, danh sách ý kiến. **Chưa** nhập vào Z-Score và các bảng xếp
hạng: Z-Score cần một tập đơn vị đồng hạng để so, loại mới chưa chắc có.

**Phân quyền:** phạm vi của trưởng bộ môn và giảng viên chỉ có nghĩa trên trục lớp học phần. Loại
mới cần quy tắc riêng — đơn giản nhất là chỉ quản trị xem, rồi mở dần.

---

## 7. Cần chốt trước khi viết kế hoạch chi tiết

1. Ảnh: tải lên server, hay chỉ chọn màu và dán đường dẫn ảnh có sẵn? Tải lên thì phải tính chỗ
   lưu, dọn rác và sao lưu.
2. Danh sách loại khảo sát cần có (chương trình đào tạo, cơ sở vật chất, cựu sinh viên, doanh
   nghiệp…) — **đang chờ thu thập từ người dùng**.
3. Với mỗi loại, **mẫu số kỳ vọng** lấy ở đâu để tính tỷ lệ phản hồi: số sinh viên của chương
   trình, hay nhập tay?
4. Loại mới có vào bảng xếp hạng và Z-Score chung không, hay có trang thống kê riêng?

---

## 8. Rủi ro đã thấy

- **Xem trước lệch thực tế** nếu dựng lại giao diện riêng cho phần xem trước.
- **Ảnh tải lên**: dung lượng, dọn rác khi xoá đợt, sao lưu, và đường dẫn tĩnh khi deploy.
- **Đợt đang mở mà đổi cấu hình**: sinh viên đang làm dở có thể thấy phiếu đổi hình thức giữa
  chừng. Cần quyết định: khoá tuỳ biến khi đợt đã mở, hay cho đổi tự do.
- **Hai đường dữ liệu** ở cách A: mọi báo cáo tổng phải nhớ gộp cả hai nguồn, quên một chỗ là số
  thiếu mà nhìn vẫn như đúng.
