# Đề xuất: xem điểm khảo sát tách riêng phần Học phần và phần Giảng viên

Tài liệu này viết cho người đọc không chuyên về công nghệ thông tin. Bản chi tiết
dành cho người làm kỹ thuật nằm ở tệp `ke-hoach-thong-ke-theo-muc.md`.

Ngày lập: 11/09/2026

## 1. Chuyện đang xảy ra

Phiếu khảo sát sinh viên đang dùng cho đợt này gồm 26 câu, chia làm ba phần:

- Phần đánh giá **học phần** (môn học): 11 câu
- Phần đánh giá **giảng viên**: 12 câu
- Phần đánh giá **cơ sở vật chất**: 3 câu

Trong đó có 2 câu là câu kiểm tra xem sinh viên có đọc kỹ đề hay bấm bừa. Hai câu
này không được tính điểm, nên điểm thật chỉ lấy từ 24 câu còn lại.

Theo lẽ thường, mỗi phiếu khảo sát chỉ nên hỏi về một việc. Nhưng bản phiếu lần
này do phòng Khảo thí và Đảm bảo chất lượng ban hành đã gộp cả ba phần vào chung
một phiếu, và đến thời điểm này thì không còn kịp đề nghị tách ra nữa.

## 2. Vấn đề

Hiện tại hệ thống chỉ hiển thị **một điểm chung** cho mỗi lớp — là điểm trung bình
của cả 24 câu gộp lại, tức trộn lẫn cả ba phần với nhau.

Điều đó nghĩa là khi nhìn vào một con số, ta không biết được lớp đó bị thấp điểm
là do **chương trình môn học** có vấn đề, hay do **cách giảng dạy của giảng viên**,
hay do **phòng ốc, trang thiết bị**. Ba chuyện hoàn toàn khác nhau, và hướng xử lý
cũng khác nhau, nhưng lại đang bị nhập chung vào một con số.

## 3. Ràng buộc bắt buộc phải tôn trọng

**Đợt khảo sát đã bắt đầu chạy thật, sinh viên đang làm phiếu.**

Vì vậy mọi thay đổi động chạm đến cách hệ thống lưu trữ dữ liệu đều sẽ buộc phải
huỷ và làm lại toàn bộ đợt khảo sát — mất trắng số phiếu đã thu.

Đề xuất dưới đây được thiết kế để **không chạm vào phần lưu trữ**, không sửa,
không xoá bất kỳ dữ liệu nào đã có. Phiếu sinh viên đang làm cũng giữ y nguyên,
người đi làm khảo sát không thấy gì khác đi.

## 4. Đề xuất

Gồm hai việc.

### Việc thứ nhất — cố định lại danh sách phần của phiếu

Hiện nay người soạn phiếu có thể tự gõ tên phần tuỳ ý, muốn đặt tên gì cũng được.
Vì tên tự do như vậy, máy không có cách nào biết chắc phần nào là phần học phần,
phần nào là phần giảng viên, nên không tổng hợp riêng được.

Đề xuất đổi ô gõ tự do đó thành một danh sách chọn sẵn ba lựa chọn:

1. Nội dung đánh giá học phần
2. Nội dung đánh giá về giảng viên
3. Nội dung đánh giá về cơ sở vật chất, phục vụ học tập

Người soạn phiếu chỉ việc chọn, không gõ nữa. Ba tên này đúng bằng ba phần mà
phiếu hiện tại đang dùng, nên phiếu đang chạy không phải sửa gì cả.

### Việc thứ hai — thêm một màn hình theo dõi mới

Thêm **một mục mới trong thanh menu bên trái**, nằm ở nhóm "Tổng quan", tên là
**"Thống kê theo mục"**.

Mở màn hình này ra sẽ thấy:

- Điểm trung bình của **riêng phần Học phần** và **riêng phần Giảng viên**, tính
  cho toàn trường
- Cũng hai con số đó nhưng **tách theo từng khoa**, xem được khoa nào mạnh về
  chuyên môn môn học, khoa nào mạnh về giảng dạy
- Và **tách theo từng bộ môn**
- Xuất được ra tệp Excel để làm báo cáo

Phần cơ sở vật chất tạm thời không hiển thị vì chưa cần tới. Máy vẫn tính sẵn, khi
nào cần bật lên xem thì rất nhanh.

**Tất cả các màn hình, báo cáo đang có đều giữ nguyên không đổi một chữ.** Đây là
một màn hình mới hoàn toàn, đứng riêng bên cạnh, không thay thế và không sửa gì
của cái cũ.

## 5. Lấy số liệu ở đâu ra

Đây là điểm khiến đề xuất này làm được nhanh và an toàn.

Mỗi lần bấm nút "Tính lại điểm", hệ thống **vốn đã** ghi lại sẵn điểm của **từng
câu hỏi một, cho từng lớp một**. Bảng số liệu chi tiết đó đã nằm sẵn trong hệ
thống từ trước, chỉ là chưa có màn hình nào đem ra dùng theo cách này.

Muốn có điểm riêng của phần Giảng viên, chỉ cần lấy 11 câu thuộc phần đó cộng lại
rồi chia trung bình. Máy làm việc này ngay lúc người dùng mở màn hình, trong chớp
mắt.

Vì vậy:

- Không cần thêm chỗ lưu trữ mới
- Không cần bấm tính lại điểm cho đợt đang chạy
- Không có rủi ro làm hỏng số liệu đã thu
- Số trên màn hình mới luôn khớp thời điểm với số trên các báo cáo cũ, vì cả hai
  cùng đọc một lần chốt điểm

## 6. Ai được xem

Trước mắt **chỉ tài khoản quản trị** mới thấy và mở được màn hình này. Trưởng bộ
môn và giảng viên chưa được mở. Khi nào cần mở rộng thì điều chỉnh sau, không phải
làm lại gì.

## 7. Một điểm cần nhớ khi đọc số

**Điểm chung không bằng trung bình cộng của hai phần.**

Lý do: điểm chung được tính trên cả 24 câu, tức là có cả 3 câu về cơ sở vật chất ở
trong đó, lại tính theo số phiếu chứ không tính theo phần. Nên nếu ai đó lấy điểm
phần Học phần cộng điểm phần Giảng viên rồi chia đôi, sẽ ra một con số khác với
điểm chung đang hiển thị — **đó là bình thường, không phải máy tính sai**.

Màn hình mới sẽ ghi chú rõ điều này ngay trên đó.

Ngoài ra, lớp nào chưa đủ điều kiện chốt điểm thì để trống dấu gạch ngang, đúng
như cách các bảng hiện tại đang làm, chứ không tự bịa ra một con số.

## 8. Đây là giải pháp tạm

Cần nói rõ: đề xuất này là cách xử lý tạm cho đợt khảo sát hiện tại, để kịp có số
liệu tách phần mà không phải động vào đợt đang chạy.

Về lâu dài, hướng đúng vẫn là tách thành các phiếu riêng: một phiếu đánh giá học
phần, một phiếu đánh giá giảng viên. Khi nào phòng Khảo thí làm được việc đó thì
phần "cố định danh sách" ở mục 4 sẽ được gỡ bỏ, còn màn hình theo dõi vẫn dùng
tiếp bình thường, không phải làm lại.

## 9. Tóm tắt để duyệt

| Câu hỏi | Trả lời |
|---|---|
| Có phải sửa phiếu sinh viên đang làm không? | Không |
| Có phải huỷ hay làm lại đợt khảo sát không? | Không |
| Có mất hay sửa số liệu đã thu không? | Không |
| Các báo cáo đang dùng có thay đổi không? | Không, giữ nguyên hoàn toàn |
| Người dùng thấy gì mới? | Thêm một mục menu và một màn hình mới |
| Cách tính điểm chung có đổi không? | Không, vẫn là trung bình 24 câu |
| Ai xem được màn hình mới? | Chỉ quản trị |
