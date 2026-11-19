# Kịch bản demo Hệ thống Khảo sát VMU

## 1. Mục tiêu và thời lượng

- Thời lượng đề xuất: **18–22 phút**.
- Tài khoản trình bày: tài khoản quản trị có đầy đủ quyền.
- Mạch demo: **chuẩn hóa dữ liệu đào tạo → triển khai khảo sát → theo dõi và phân tích kết quả → quản trị người dùng, phân quyền**.
- Tình huống xuyên suốt: triển khai khảo sát cho một học kỳ đã có khoa, bộ môn, giảng viên, học phần và lớp học phần.

## 2. Chuẩn bị trước khi demo

- Chọn sẵn một học kỳ có lớp học phần và dữ liệu phản hồi.
- Chuẩn bị một bộ câu hỏi khảo sát học phần hoàn chỉnh.
- Chuẩn bị ít nhất một đợt khảo sát học phần đang mở và một đợt khảo sát chương trình đào tạo.
- Chuẩn bị dữ liệu báo cáo có nhiều khoa, bộ môn, giảng viên và lớp để thể hiện bộ lọc, xếp hạng, phân tích.
- Chuẩn bị một tài khoản mẫu để minh họa việc gán hồ sơ, vai trò và phạm vi quản lý.
- Không thêm, sửa hoặc xóa dữ liệu quan trọng trong lúc demo; ưu tiên mở form, giải thích trường dữ liệu rồi đóng form nếu dữ liệu mẫu đã đầy đủ.

## 3. Mở đầu — 1 phút

**Thao tác:** Đăng nhập và mở màn hình chính.

**Lời dẫn:**

> Hệ thống Khảo sát VMU hỗ trợ toàn bộ quy trình từ quản lý dữ liệu đào tạo, phát phiếu khảo sát, theo dõi tiến độ, tổng hợp kết quả đến quản trị người dùng và phân quyền. Tôi sẽ trình bày theo đúng luồng vận hành thực tế của một kỳ khảo sát.

**Điểm chốt:** Dữ liệu chỉ nhập một lần ở danh mục và được sử dụng xuyên suốt trong khảo sát, báo cáo và phân quyền.

## 4. Danh mục đào tạo — 4 phút

### 4.1. Khoa/Viện và Bộ môn

**Thao tác:**

1. Mở **Khoa/Viện**, tìm một đơn vị và mở form thêm hoặc sửa.
2. Chuyển sang **Bộ môn**, lọc theo khoa và mở một bộ môn trực thuộc.
3. Giới thiệu thao tác thêm thủ công, sửa, xóa và import Excel.

**Lời dẫn:**

> Khoa/Viện là cấp đơn vị chính. Mỗi bộ môn được liên kết với một khoa hoặc viện, nhờ đó hệ thống có thể tổng hợp kết quả đúng theo cơ cấu tổ chức. Danh mục hỗ trợ nhập từng bản ghi hoặc import Excel khi cần cập nhật số lượng lớn.

### 4.2. Giảng viên và Ngành đào tạo

**Thao tác:**

1. Mở **Giảng viên**, tìm theo tên hoặc email; chỉ ra khoa, bộ môn và chức vụ của giảng viên.
2. Mở **Ngành đào tạo**, chọn một ngành và chỉ ra khoa quản lý.
3. Khi import Excel giảng viên, giải thích: email đã thuộc giảng viên bị xóa sẽ tự khôi phục giảng viên và tài khoản cũ, giữ lịch sử và cập nhật thông tin theo file.

**Lời dẫn:**

> Giảng viên được gắn với đơn vị chuyên môn và email để liên kết với tài khoản đăng nhập. Ngành đào tạo được gắn với khoa quản lý, là cơ sở để triển khai khảo sát chương trình đào tạo và tổng hợp số liệu theo ngành.

### 4.3. Học phần, Năm học/Học kỳ và Lớp học phần

**Thao tác:**

1. Mở **Học phần**, chỉ ra mã học phần, tên học phần, số tín chỉ và đơn vị phụ trách.
2. Mở **Lớp học phần**, chọn năm học và học kỳ trên cây bên trái.
3. Mở một lớp để minh họa liên kết giữa học phần, giảng viên, nhóm lớp và sĩ số.
4. Giới thiệu import Excel và chức năng cập nhật giảng viên chưa xác định.
   Khi import lớp học phần, email thuộc giảng viên đã xóa sẽ tự khôi phục hồ sơ và tài khoản cũ. Dòng lỗi bị bỏ qua mà không tạo thêm học phần hay giảng viên; lỗi trong quá trình lưu sẽ hoàn tác toàn bộ lần import.

**Lời dẫn:**

> Lớp học phần là đối tượng trực tiếp được phát phiếu. Khi chọn học kỳ, hệ thống hiển thị toàn bộ lớp cùng học phần, giảng viên và sĩ số. Đây là dữ liệu đầu vào để tạo chỉ tiêu phiếu, đường dẫn riêng và báo cáo cho từng lớp.

**Câu chuyển:**

> Sau khi danh mục đã đầy đủ, bước tiếp theo là chuẩn bị nội dung và triển khai khảo sát.

## 5. Khảo sát học phần — 4 phút

### 5.1. Bộ câu hỏi khảo sát

**Thao tác:**

1. Mở **Bộ câu hỏi khảo sát** và xem một bộ câu hỏi đang dùng.
2. Chỉ ra tên bộ câu hỏi, nội dung từng câu, thang trả lời và câu bắt buộc.
3. Mở phần **Thang trả lời** để minh họa các mức điểm và nhãn trả lời.
4. Giới thiệu khả năng tạo mới hoặc import bộ câu hỏi.

**Lời dẫn:**

> Bộ câu hỏi được quản lý độc lập để tái sử dụng cho nhiều học kỳ. Mỗi câu có thể dùng thang trả lời phù hợp; hệ thống cũng hỗ trợ câu kiểm tra chú ý để nhận diện phiếu không bảo đảm chất lượng.

### 5.2. Tạo và vận hành khảo sát học phần

**Thao tác:**

1. Mở **Khảo sát học phần** và chọn học kỳ đã chuẩn bị.
2. Nhấn **Tạo bài khảo sát**, chọn bộ câu hỏi, thời gian bắt đầu và kết thúc; không lưu nếu đợt mẫu đã tồn tại.
3. Mở một đợt khảo sát để xem danh sách lớp.
4. Tại một lớp, chỉ ra đường dẫn riêng, mã QR, thời gian mở và số lượt trả lời.
5. Mở mã QR hoặc trang khảo sát công khai để minh họa giao diện sinh viên.
6. Chỉ ra chức năng sửa lịch, tạo bù cho lớp được bổ sung sau và nút **Kết quả**.

**Lời dẫn:**

> Khi tạo khảo sát, hệ thống phát cùng một bộ câu hỏi cho toàn bộ lớp của học kỳ, nhưng mỗi lớp có đường dẫn và mã QR riêng. Vì vậy phản hồi được ghi nhận đúng học phần, giảng viên và nhóm lớp. Người phụ trách có thể điều chỉnh lịch từng lớp, theo dõi lượt trả lời hoặc tạo bù nếu lớp được nhập bổ sung sau khi đợt đã khởi tạo.

## 6. Khảo sát chương trình đào tạo — 2 phút

### 6.1. Tiêu chí chương trình đào tạo

**Thao tác:** Mở **Tiêu chí CTĐT**, chọn tab chương trình đào tạo và giới thiệu mã tiêu chí, nội dung, nhóm tiêu chí.

**Lời dẫn:**

> Khảo sát chương trình đào tạo sử dụng bộ tiêu chí riêng, tách biệt với khảo sát học phần. Nội dung có thể được tổ chức theo nhóm để đánh giá cấu trúc, nội dung, chuẩn đầu ra và mức độ đáp ứng của chương trình.

### 6.2. Đợt khảo sát chương trình đào tạo

**Thao tác:**

1. Mở **Đợt khảo sát CTĐT**.
2. Lọc theo năm học, học kỳ hoặc từ khóa.
3. Mở luồng **Tạo đợt khảo sát**, chỉ ra chương trình/ngành, bộ tiêu chí và thời gian thực hiện.
4. Minh họa danh sách đợt theo cây năm học – học kỳ, thao tác xuất danh sách, mở QR và đổi lịch.

**Lời dẫn:**

> Quy trình khảo sát chương trình đào tạo được quản lý theo năm học và học kỳ. Mỗi đợt gắn với ngành, bộ tiêu chí và thời gian triển khai; hệ thống cung cấp liên kết, mã QR và danh sách để đơn vị thuận tiện phát phiếu và quản lý.

**Câu chuyển:**

> Khi phản hồi bắt đầu được ghi nhận, dữ liệu được tổng hợp thành các góc nhìn phục vụ vận hành và ra quyết định.

## 7. Thống kê và báo cáo — 5 đến 6 phút

### 7.1. Bảng điều khiển và Tổng quan khảo sát

**Thao tác:**

1. Mở **Bảng điều khiển**, chọn học kỳ và chỉ ra các KPI toàn trường, tiến độ theo khoa và cảnh báo đơn vị chậm.
2. Mở **Tổng quan khảo sát**, chọn học kỳ và đợt khảo sát.
3. Chỉ ra tỷ lệ hoàn thành, điểm hài lòng, phân bố điểm, tiêu chí yếu và học phần cần rà soát.

**Lời dẫn:**

> Bảng điều khiển cung cấp góc nhìn điều hành nhanh ở cấp toàn trường. Từ đây, lãnh đạo có thể nhận biết tiến độ, chất lượng chung và các đơn vị hoặc tiêu chí cần ưu tiên xem xét.

### 7.2. Tiến độ thu phiếu

**Thao tác:** Mở **Tiến độ thu phiếu**, chỉ ra tổng chỉ tiêu, phiếu hợp lệ, nhóm đạt từ 80%, nhóm dưới 20%; tìm một lớp và giới thiệu xuất báo cáo Excel.

**Lời dẫn:**

> Trang tiến độ phục vụ giai đoạn khảo sát đang mở. Dữ liệu được đối chiếu với sĩ số để xác định tỷ lệ hoàn thành và giúp đơn vị tập trung nhắc những lớp có mức phản hồi thấp.

### 7.3. Thống kê & Báo cáo

**Thao tác:**

1. Chọn học kỳ và bài khảo sát.
2. Ở tab **Tổng quan**, giới thiệu các chỉ số và xu hướng toàn trường.
3. Chuyển sang **Tra cứu chi tiết**, lọc một học phần hoặc giảng viên rồi mở kết quả của một lớp.
4. Chỉ ra số phiếu hợp lệ, điểm trung bình, kết quả từng câu và ý kiến mở.
5. Chuyển sang **Tổng hợp đơn vị** để xem kết quả theo Khoa/Viện và Bộ môn.

**Lời dẫn:**

> Báo cáo cho phép đi từ toàn trường xuống khoa, bộ môn, giảng viên và từng lớp học phần. Cùng một nguồn dữ liệu nhưng mỗi cấp quản lý chỉ nhìn thấy phần phù hợp với quyền và phạm vi được giao.

### 7.4. Bảng dữ liệu khảo sát và Phân tích chuyên sâu

**Thao tác:**

1. Mở **Bảng dữ liệu khảo sát**, chọn đợt và nhấn **Tính lại điểm** nếu có phiếu mới.
2. Chỉ ra điểm từng câu, điểm tổng hợp, câu yếu nhất, phiếu lỗi và số ý kiến mở.
3. Mở **Phân tích chuyên sâu**, lần lượt giới thiệu các góc nhìn chuẩn hóa, theo bộ môn, học phần và giảng viên.

**Lời dẫn:**

> Bảng dữ liệu cung cấp số liệu chi tiết để kiểm tra và đối soát. Phân tích chuyên sâu giúp so sánh có bối cảnh, phát hiện kết luận thay đổi sau chuẩn hóa và xác định vấn đề nằm ở lớp, học phần hay đơn vị.

### 7.5. Thống kê tốt nghiệp

**Thao tác:** Mở **Thống kê tốt nghiệp**, chọn bộ lọc khoa, ngành, khóa, năm rà soát; chuyển giữa **Tổng quan** và **Khám phá dữ liệu**.

**Lời dẫn:**

> Ngoài khảo sát, hệ thống còn hỗ trợ báo cáo sinh viên tốt nghiệp đúng hạn. Người dùng có thể lọc theo nhiều chiều, xem KPI, cơ cấu kết quả và tự chọn chỉ số, nhóm so sánh, loại biểu đồ để phục vụ báo cáo đào tạo.

## 8. Người dùng và phân quyền — 3 phút

### 8.1. Tài khoản và hồ sơ

**Thao tác:**

1. Mở **Người dùng & phân quyền** → **Tài khoản và hồ sơ**.
2. Tìm tài khoản mẫu, mở chi tiết và chỉ ra một người dùng có thể có nhiều hồ sơ/vai trò.
3. Mở form tạo hồ sơ, chỉ ra vai trò và phạm vi quản lý; không lưu nếu không cần.
4. Giới thiệu thêm người dùng, import Excel, kích hoạt và vô hiệu hóa tài khoản.

**Lời dẫn:**

> Tài khoản xác định người được phép đăng nhập; hồ sơ xác định người đó làm việc với vai trò nào và trong phạm vi nào. Một người có thể có nhiều hồ sơ, ví dụ vừa là giảng viên vừa phụ trách bộ môn, và có thể chuyển hồ sơ sau khi đăng nhập.

### 8.2. Phân quyền module

**Thao tác:**

1. Chuyển sang **Phân quyền Module**.
2. Chọn một vai trò, tìm một quyền và bật/tắt thử một quyền; chỉ lưu khi đã thống nhất dữ liệu demo.
3. Nêu ví dụ: giảng viên được xem tiến độ và lấy QR của lớp phụ trách nhưng không được xem báo cáo ngoài phạm vi.

**Lời dẫn:**

> Quyền được cấu hình theo vai trò và nhóm chức năng. Kết hợp quyền với phạm vi dữ liệu giúp hệ thống kiểm soát đồng thời hai vấn đề: người dùng được phép làm gì và được phép thao tác trên dữ liệu nào.

### 8.3. Nhật ký hệ thống

**Thao tác:** Chuyển sang **Nhật ký hệ thống**, chỉ ra thời gian, sự kiện, tài khoản thực hiện và chi tiết thay đổi.

**Lời dẫn:**

> Các hoạt động xác thực, quản trị và thay đổi dữ liệu được ghi nhận để hỗ trợ kiểm tra, truy vết và nâng cao trách nhiệm sử dụng hệ thống.

## 9. Kết thúc — 30 giây

**Lời kết:**

> Toàn bộ quy trình được vận hành trên một hệ thống thống nhất: danh mục đào tạo tạo ra dữ liệu chuẩn; khảo sát sử dụng dữ liệu đó để phát phiếu đúng đối tượng; báo cáo chuyển phản hồi thành thông tin quản trị; còn phân quyền bảo đảm mỗi người dùng chỉ truy cập đúng chức năng và phạm vi được giao.

## 10. Lưu ý khi trình bày

- Luôn chọn cùng một học kỳ và cùng một lớp mẫu để người xem dễ theo dõi mạch dữ liệu.
- Chỉ mở một bản ghi tiêu biểu ở mỗi danh mục; không đọc toàn bộ bảng hoặc toàn bộ trường dữ liệu.
- Không giải thích sâu công nghệ, API hay cơ sở dữ liệu nếu người nghe không hỏi.
- Khi số liệu thay đổi theo dữ liệu thực tế, nói về ý nghĩa chỉ số thay vì đọc thuộc một con số cố định.
- Nếu thời gian còn dưới 15 phút, rút gọn phần danh mục và chỉ giữ ba trang báo cáo: **Tổng quan khảo sát**, **Tiến độ thu phiếu**, **Thống kê & Báo cáo**.
