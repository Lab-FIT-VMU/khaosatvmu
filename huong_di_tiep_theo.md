# Hướng đi tiếp theo: mỗi bài khảo sát chỉ đánh giá một đối tượng

Ngày lập: 14/09/2026 · Nhánh: `hoang4` · Tài liệu phân tích, chưa có code.

## 1. Bối cảnh

Bộ đề đợt khảo sát hiện tại do ban thanh tra / khảo thí ban hành đã gộp ba nội dung
vào chung một bài: đánh giá học phần, đánh giá giảng viên, đánh giá cơ sở vật chất.
Đợt đã chạy thật nên không được đổi cấu trúc CSDL, vì vậy đang xử lý tạm:

- Cố định danh mục 3 mục câu hỏi. Mục nhận ra bằng tên đã chuẩn hoá, mục cơ sở vật
  chất giữ đúng chính tả đang lưu ("cơ sơ vật chất").
- Tách điểm theo mục ở lúc đọc, từ bảng điểm từng câu đã chốt: trang "Thống kê theo
  mục", tab Học phần / Giảng viên trong phần phân tích theo câu hỏi.

Sau này mỗi bài chỉ tập trung vào một đối tượng, nên có thể thiết kế lại gọn gàng.

## 2. Gốc của vấn đề hiện tại

Hiện "đánh giá cái gì" đang nằm ở **mục** bên trong bộ đề, trong khi toàn hệ thống
lại tính theo **đợt / lớp**:

- **Điểm lớp:** chốt một con số trộn cả 3 đối tượng.
- **Báo cáo:** gộp theo lớp, nên muốn tách thì phải suy ngược từ tên mục.
- **Fix cứng 3 mục:** chỉ là cách đọc lại ý nghĩa từ tên mục, vì không được đổi schema
  giữa đợt.

Khi mỗi bài chỉ một đối tượng, ý nghĩa đó nên chuyển lên **bộ đề**. Mục trở lại chỉ là
cách chia nhóm câu cho dễ đọc.

## 3. Thiết kế đích

### 3.1. Thêm "đối tượng đánh giá" cho bộ đề

Thêm cột `SubjectType` trên `SurveyTemplates`, nhận một trong ba giá trị:

| Đối tượng | Phát phiếu theo | Gộp báo cáo theo |
|---|---|---|
| `COURSE`: Học phần | Lớp học phần (như hiện tại) | Học phần → bộ môn → khoa |
| `LECTURER`: Giảng viên | Lớp học phần | Giảng viên → bộ môn → khoa, có chuẩn hoá Z-score |
| `FACILITY`: Cơ sở vật chất | **Chưa chốt**: theo lớp, theo khoa, hay một link chung cho cả trường | Khoa / cơ sở / toàn trường |

### 3.2. Đợt khảo sát

- Lấy đối tượng từ bộ đề và **lưu cứng lại lúc tạo đợt**, để sửa bộ đề sau này không
  làm đổi nghĩa đợt đã chạy.
- Một học kỳ có thể chạy song song 3 đợt, mỗi đợt một đối tượng.

### 3.3. Mục câu hỏi

- Quay về nhập tự do. Bỏ phần chặn tên mục, không cần danh mục cố định nữa.
- Mục chỉ còn vai trò chia nhóm câu trên phiếu và trên báo cáo.

## 4. Lộ trình chuyển đổi

### Giai đoạn 1: trước đợt khảo sát kỳ sau

Được đổi schema vì chưa có đợt mới nào chạy.

- Migration thêm `SubjectType` cho bộ đề và đợt.
- Bộ đề hiện tại (3 mục trong 1 bài) gắn loại `LEGACY_MIXED` để phân biệt.
- Trình soạn: chọn đối tượng khi tạo bộ đề, gỡ phần khoá tên mục.

### Giai đoạn 2: phát phiếu

- `COURSE` và `LECTURER` vẫn dùng bảng lớp và mã QR như bây giờ.
- Nên có **một link / QR cho mỗi lớp**, mở ra trang liệt kê các bài đang mở của lớp đó.
  Sinh viên không phải quét 2–3 mã, giảng viên không phải phát nhiều mã.
- `FACILITY` tuỳ quyết định ở mục 6: nếu không theo lớp thì cần bảng đích phát phiếu
  riêng.

### Giai đoạn 3: báo cáo

- Mỗi trang báo cáo đọc đối tượng của đợt để hiện đúng số liệu: đợt `COURSE` không xếp
  giảng viên, đợt `LECTURER` không chẩn đoán học phần.
- Trang "Thống kê theo mục" đổi thành **"Tổng hợp theo đối tượng"**: giữ nguyên giao
  diện khoa → bộ môn → lớp, nhưng mỗi cột điểm lấy từ một đợt khác nhau trong cùng học
  kỳ, thay vì từ các mục trong cùng một bài.
- Tab Học phần / Giảng viên trong phần phân tích theo câu hỏi: với đợt mới thì không
  cần nữa, vì mỗi đợt đã chỉ có một đối tượng. Chỉ giữ cho đợt cũ `LEGACY_MIXED`.
- Đợt cũ `LEGACY_MIXED` vẫn tách điểm theo mục như đang làm, nên so sánh được điểm
  giảng viên kỳ này với kỳ sau.

### Giai đoạn 4: dọn phần xử lý tạm

Khi không còn cần đọc đợt cũ nữa:

- Bỏ danh mục mục cố định (`SurveySectionCatalog` bên backend, `surveySectionCatalog`
  bên frontend).
- Bỏ phần tách điểm theo mục ở trang giảng viên và trang kết quả lớp.
- Bỏ dòng lưu ý "không được sửa tên mục" trong file Excel mẫu.

## 5. Những chỗ phải tính lại khi bài ngắn đi

- **Câu bẫy:** mỗi bộ đề cần câu bẫy riêng.
- **Luật SINGLE_ANSWER:** cần ít nhất 2 câu chấm điểm, bài cơ sở vật chất quá ngắn thì
  luật này yếu hẳn.
- **Ngưỡng tính điểm:** hiện theo tỷ lệ phản hồi trên sĩ số lớp. Bài `FACILITY` không
  theo lớp thì không có sĩ số làm mẫu số.
- **Giới hạn "lớp đã đủ phiếu":** tính riêng cho từng đợt, nên một sinh viên làm được
  cả hai bài của cùng lớp.
- **Sinh viên phải làm nhiều bài hơn:** tỷ lệ phản hồi dễ giảm, nên càng cần một link
  chung cho mỗi lớp.
- **Giảng viên chưa xác định:** với đợt `LECTURER` thì phải gắn xong mã giảng viên trước
  khi phát hành, nếu không báo cáo cá nhân bị sót lớp.

## 6. Cần ban thanh tra / khảo thí chốt trước

1. Khảo sát cơ sở vật chất phát theo **đơn vị nào**: lớp, khoa hay toàn trường?
2. Học phần và giảng viên dùng **một mã QR chung** cho lớp, hay tách hai mã?
3. Có lớp **nhiều giảng viên cùng dạy** không? Nếu có thì đánh giá giảng viên phải theo
   từng cặp lớp–giảng viên, mà hiện mỗi lớp chỉ lưu một giảng viên.
4. Có cần **so sánh với đợt hiện tại** không? Nếu có thì phải giữ phần tách điểm theo
   mục cho dữ liệu cũ (giai đoạn 4 lùi lại).
