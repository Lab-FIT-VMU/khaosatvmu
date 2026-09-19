# Kế hoạch viết lại module Thống kê tốt nghiệp từ danh sách sinh viên theo đợt

Trạng thái: **Đang triển khai theo từng đợt độc lập**

Ngày khảo sát: **17/09/2026**

Phạm vi: frontend, API, nghiệp vụ tổng hợp, cơ sở dữ liệu, migration và kiểm thử của module `GraduationAnalytics`.

## 0. Chia đợt triển khai và điểm dừng an toàn

Mỗi đợt phải build/test độc lập trước khi chuyển tiếp; schema cũ được giữ nguyên cho tới khi UI mới và truy vấn mới hoàn tất để không làm gián đoạn module đang chạy.

| Đợt | Phạm vi | Trạng thái |
|---:|---|---|
| 1 | Parser backend, chuẩn hóa, bỏ dòng không tách được khóa, cảnh báo không chứa PII, regression 11 file | **Hoàn thành** |
| 2 | Ba bảng v3, migration, preview/commit multipart, revision và import lại | **Hoàn thành** |
| 3 | Query riêng đợt/tích lũy theo khóa, ba KPI và bốn xếp loại | **Hoàn thành** |
| 4 | Giao diện quản lý năm học–đợt–tháng–file, preview và import lại | **Hoàn thành** |
| 5 | Chuyển Khám phá chi tiết, chart/table/export sang dữ liệu v3 | **Hoàn thành** |
| 6 | UAT 11 file, feature flag, cutover và cleanup schema cũ sau nghiệm thu | **Đã xong parser 11 file, PostgreSQL migration smoke, HTTP E2E, build và unit test; còn UAT giao diện, chốt feature flag, backup/deploy/cutover trên môi trường đích và cleanup schema cũ sau nghiệm thu** |

## 1. Mục tiêu

Viết lại module để nhận trực tiếp danh sách sinh viên tốt nghiệp của từng đợt, tự bóc tách dữ liệu và cung cấp số liệu tích lũy theo thời điểm.

Kết quả cần đạt:

1. Import file danh sách sinh viên theo từng `năm học + đợt`.
2. Một đợt có thể được import lại nhiều lần để thay thế dữ liệu sai; chỉ bản mới nhất được dùng để thống kê.
3. Tự bóc tách khóa, khoa, ngành, xếp loại tốt nghiệp và cờ vừa làm vừa học từ workbook nguồn để đếm số lượng; không lưu thông tin cá nhân.
4. Tab **Khám phá chi tiết** tiếp tục có thống kê Xuất sắc, Giỏi, Khá, Trung bình và Hệ VLVH.
5. Tab **Khám phá chi tiết** bổ sung góc nhìn nhanh gồm: Đã tốt nghiệp, Tốt nghiệp đúng hạn và Hệ VLVH. Tạm thời không triển khai Tổng đầu vào/Còn lại.
6. Số liệu có thể xem riêng từng đợt hoặc tích lũy một khóa cụ thể qua các đợt đến mốc được chọn, đúng với cách tính tay trong ảnh.
7. Năm học được quy ước từ tháng 8 năm trước đến hết tháng 7 năm sau.

## 2. Kết quả khảo sát file thật

Đã đọc trực tiếp 11 workbook trong thư mục:

`C:\Users\hieuu\Downloads\2026.9.16 - Dữ liệu các đợt xét tốt nghiệp-20260917T145337Z-1-001\2026.9.16 - Dữ liệu các đợt xét tốt nghiệp`

### 2.1. Phạm vi mẫu

| Năm học | Các đợt có trong mẫu | Số sinh viên |
|---|---|---:|
| 2024–2025 | Đợt 1–5 | 3.267 |
| 2025–2026 | Đợt 1–5 | 3.233 |
| 2026–2027 | Đợt 1 | 198 |
| **Tổng** | **11 file** | **6.698** |

Đối chiếu toàn bộ mẫu:

- 6.698 dòng sinh viên; kết quả khảo sát kỹ thuật cho thấy chưa có dòng trùng mã trong hoặc giữa các file mẫu, nhưng mã sinh viên sẽ không được lưu trong thiết kế mới.
- 676 Xuất sắc, 1.509 Giỏi, 3.632 Khá và 881 Trung bình; tổng đúng 6.698 sinh viên.
- 452 dòng có đánh dấu `VLVH` trong nguồn.
- Không có dòng chính bị thiếu loại tốt nghiệp, lớp, khoa hoặc chuyên ngành.
- File lớn nhất có 2.046 sinh viên và dung lượng dưới 210 KB.

Các con số trên mô tả dữ liệu nguồn. Trong đó có 1 dòng lớp `IBL05` không tách được khóa (xếp loại Trung bình và có cờ VLVH), nên dòng này bị bỏ theo quy tắc mới; mốc số liệu active sau import là 6.697 dòng và được nêu riêng tại mục 14.4. Các con số này chỉ dùng để kiểm thử, không được hard-code vào ứng dụng.

### 2.2. Cấu trúc workbook thực tế

Sheet dữ liệu chính thường tên `TongHop`, tiêu đề thường ở dòng 1:

| Cột | Nội dung | Cách sử dụng |
|---:|---|---|
| A | TT | đối chiếu, không dùng làm định danh |
| B | Mã SV | bỏ qua, không lưu |
| C | Họ và tên | bỏ qua, không lưu |
| D | Họ và tên | bỏ qua, không lưu |
| E | Ngày sinh | bỏ qua, không lưu |
| F | Giới tính | bỏ qua, không lưu |
| G | Điểm TBTL | bỏ qua, không lưu |
| H | Điểm TBTL (Hệ 10) | bỏ qua, không lưu |
| I | Loại TN | Xuất sắc/Giỏi/Khá/Trung bình |
| J | Lớp | nguồn để tách mã chương trình và khóa |
| K | Khoa | chiều phân tích |
| L | Chuyên ngành | chiều phân tích |
| M | Dự lễ tốt nghiệp | bỏ qua, không lưu |
| N | VLVH | cờ Vừa làm vừa học |
| O trở đi | có thể có TK/Thủ khoa, điện thoại, ghi chú | không thuộc thống kê cốt lõi |

Biến thể đã thấy:

- Có file có 14 cột, có file 15–17 cột.
- Có workbook chứa sheet phụ như `Sheet1`, `Thủ khoa Chuyên ngành`, `Thủ khoa TP`, `THU KHOA`; các sheet này lặp lại dữ liệu và phải bị bỏ qua.
- Có sheet được format đến dòng 1.000 dù chỉ có khoảng 134/198 dòng thật; parser phải dừng theo dữ liệu chứ không dựa vào `rowCount` của Excel.
- Header `Họ và tên` bị lặp ở hai cột C/D; phải nhận diện theo chữ ký toàn bộ header và vị trí tương đối.
- Mã lớp có cả ký tự `ĐH` và `ÐH`, cần chuẩn hóa Unicode trước khi tách khóa.
- Có ngoại lệ như lớp `IBL05`, không đủ thông tin để tự khẳng định `05` là khóa; dòng này phải bị bỏ khỏi toàn bộ số liệu import và được liệt kê rõ trong cảnh báo cho người dùng.
- Tên file có lỗi chính tả (`đợt`/`đọt`) và cách viết năm khác nhau; chỉ dùng tên file để gợi ý, không dùng làm nguồn chuẩn.

### 2.3. Metadata không có trong file

Workbook không chứa đầy đủ:

- năm học;
- số đợt;
- tháng và năm xét tốt nghiệp;
- tổng số sinh viên đầu vào.

Do đó hệ thống phải yêu cầu người dùng xác nhận metadata đợt khi import. Tổng đầu vào và Còn lại được loại khỏi phạm vi phiên bản này. Quy tắc nghiệp vụ là thời hạn 6 năm (`4 năm chuẩn + tối đa 2 năm`), nhưng file đã đánh dấu trực tiếp sinh viên thuộc hệ VLVH nên hệ thống không cần tự tính lại thời hạn.

## 3. Những điểm nghiệp vụ cần duyệt

Kế hoạch đề xuất chốt các quy tắc sau. Đây là điều kiện trước khi bắt đầu code.

### 3.1. Định danh đợt

- Một đợt được định danh duy nhất bằng `(AcademicYearStart, RoundNumber)`.
- Ví dụ: `AcademicYearStart = 2024`, `RoundNumber = 1` hiển thị là `Năm học 2024–2025 · Đợt 1`.
- Không dùng `(tháng, năm)` làm khóa duy nhất vì đợt 3, 4 và 5 có thể cùng nằm trong tháng 5 như ảnh minh họa.
- Không giới hạn cố định số đợt. Màn hình bắt đầu với một dòng đợt và người dùng bấm `Thêm đợt` để sinh đợt kế tiếp; schema chỉ yêu cầu `RoundNumber > 0`.

### 3.2. Năm học và tháng xét

- Tháng 8–12 thuộc năm học bắt đầu trong chính năm dương lịch đó.
- Tháng 1–7 thuộc năm học bắt đầu từ năm dương lịch trước.
- Ví dụ tháng 4/2025 thuộc năm học 2024–2025; tháng 9/2025 thuộc năm học 2025–2026.
- Tháng và năm được người dùng chọn tại thời điểm import; file không cần chứa metadata này.
- Trong cùng năm học, tháng/năm của đợt sau không được sớm hơn đợt trước; nhiều đợt được phép cùng tháng.
- Thứ tự tích lũy dùng `AcademicYearStart + RoundNumber`; tháng/năm dùng để hiển thị và kiểm tra tính hợp lý.

### 3.3. Tốt nghiệp đúng hạn và hệ VLVH lấy trực tiếp từ file

Quy tắc nghiệp vụ 6 năm (`4+2`) đã được đơn vị lập file áp dụng khi đánh dấu cột `VLVH`. Module không tính lại từ khóa và thời điểm tốt nghiệp.

Quy tắc phân loại duy nhất:

- cột `VLVH` có dấu `X/x/1/true/có` → **Hệ VLVH**;
- cột `VLVH` trống → **Tốt nghiệp đúng hạn**.

Không tạo KPI “Trong hạn 6 năm” hoặc “Quá 6 năm”, không suy ra năm vào học, không lưu deadline và không cảnh báo so khớp thời gian. Parser chỉ cần chuẩn hóa cờ VLVH và đếm.

Nếu mã lớp không tách được khóa an toàn, parser bỏ dòng đó khỏi toàn bộ aggregate và KPI. Ví dụ `KPM61ĐH` tự tách được thành K61, còn `IBL05` không thể khẳng định `05` là khóa nên bị bỏ qua. Preview và kết quả import phải nêu rõ tổng số dòng bị bỏ, mã lớp, sheet, số dòng nguồn và lý do `COHORT_UNRESOLVED`; không hiển thị dữ liệu cá nhân. Đây là warning không chặn import và người dùng không phải tự ánh xạ khóa.

### 3.4. Hệ VLVH không phải một xếp loại

Trong file thật, một sinh viên thuộc hệ VLVH vẫn đồng thời có xếp loại Xuất sắc/Giỏi/Khá/Trung bình. Vì vậy:

- bốn nhóm xếp loại là loại trừ nhau và tổng của chúng bằng số đã tốt nghiệp;
- Hệ VLVH là trạng thái đào tạo, không cộng vào tổng tốt nghiệp như nhóm xếp loại thứ năm;
- tỷ lệ xếp loại = số của xếp loại / số đã tốt nghiệp;
- tỷ lệ VLVH = số VLVH / số đã tốt nghiệp.

Quy tắc này thay thế cách cộng năm nhóm của module hiện tại.

### 3.5. Tốt nghiệp đúng hạn, VLVH và tích lũy theo khóa

Với một khóa và một mốc `năm học + đợt`:

- `Đã tốt nghiệp riêng đợt`: tổng số lượng của đúng khóa đó trong đợt đang xét.
- `Đã tốt nghiệp tích lũy`: tổng số lượng của đúng khóa đó từ đợt đầu tiên có dữ liệu đến mốc được chọn.
- `Tốt nghiệp đúng hạn`: phần tích lũy có cột VLVH để trống.
- `Hệ VLVH`: phần tích lũy có cột VLVH được đánh dấu.
- `Tỷ lệ đúng hạn`: `Tốt nghiệp đúng hạn / Đã tốt nghiệp × 100`.
- `Tỷ lệ VLVH`: `Hệ VLVH / Đã tốt nghiệp × 100`.

Invariant sau khi import hợp lệ:

`Đã tốt nghiệp = Tốt nghiệp đúng hạn + Hệ VLVH`.

Ví dụ khi chọn K62 và mốc đợt 3 năm học 2025–2026, tích lũy chỉ lấy các dòng **K62** trong toàn bộ đợt của năm học 2024–2025 và đợt 1–3 của năm học 2025–2026. Không cộng K60, K61, K63 hoặc các khóa khác vào con số K62.

Các dòng không tách được khóa không được đưa vào revision active, vì vậy cũng không tham gia số Đã tốt nghiệp, bốn xếp loại, Tốt nghiệp đúng hạn, Hệ VLVH hoặc mọi phép tính tích lũy.

### 3.6. Chỉ lưu số lượng, không lưu thông tin cá nhân

- Parser dùng mỗi dòng hợp lệ như một đơn vị đếm.
- Không lưu mã sinh viên, họ tên, ngày sinh, giới tính, GPA hệ 4 hoặc GPA hệ 10.
- Không cung cấp tìm kiếm hoặc bảng chi tiết theo sinh viên.
- Dữ liệu lưu trữ chỉ gồm các chiều cần thống kê: đợt, khoa, chuyên ngành, khóa, xếp loại và VLVH.
- Do không lưu định danh sinh viên, hệ thống không thể tự phát hiện một người bị lặp giữa hai đợt. Phiên bản này chấp nhận giả định file quyết định tốt nghiệp là nguồn chuẩn và mỗi sinh viên chỉ xuất hiện ở đúng một đợt.

## 4. Thiết kế dữ liệu mới

Không tiếp tục dùng `GraduationAnalyticsRow` dạng dòng tổng hợp 16 cột. Tạo schema v3 chỉ lưu số lượng đã tổng hợp, không lưu dữ liệu cá nhân.

### 4.1. `GraduationPeriods`

Đại diện cho một đợt nghiệp vụ ổn định.

| Trường | Ý nghĩa |
|---|---|
| `PeriodId` | khóa chính |
| `AcademicYearStart` | 2024 tương ứng 2024–2025 |
| `RoundNumber` | số đợt |
| `ReviewMonth` | 1–12 |
| `ReviewYear` | năm dương lịch của tháng xét |
| `ActiveRevisionId` | bản import đang dùng để thống kê |
| `CreatedAtUtc`, `CreatedBy` | audit |

Ràng buộc:

- unique `(AcademicYearStart, RoundNumber)`;
- check tháng/năm thuộc đúng năm học;
- check `RoundNumber > 0`.

### 4.2. `GraduationImportRevisions`

Mỗi lần import hoặc import lại tạo một revision bất biến.

| Trường | Ý nghĩa |
|---|---|
| `RevisionId`, `PeriodId`, `RevisionNumber` | định danh phiên bản |
| `ReviewMonth`, `ReviewYear` | snapshot tháng/năm xét của revision |
| `OriginalFileName`, `SourceSheetName` | truy vết nguồn |
| `FileHash` | SHA-256 bytes file, dùng xác nhận file commit đúng file đã preview |
| `AggregateHash` | SHA-256 aggregate + metadata đợt chuẩn hóa, dùng phát hiện nội dung thống kê không đổi |
| `SourceRowCount` | tổng số dòng ứng viên đọc được từ sheet nguồn |
| `ImportedRowCount` | số dòng hợp lệ đã được đưa vào aggregate |
| `SkippedRowCount` | số dòng bị bỏ do không tách được khóa |
| `SkippedSummaryJson` | tóm tắt đã làm sạch gồm mã lớp, sheet, số dòng nguồn và lý do; tuyệt đối không chứa PII |
| `ImportedAtUtc`, `ImportedByUserId`, `ImportedByName` | audit |
| `ReplaceReason` | bắt buộc từ revision 2 trở đi |
| `ReplacedRevisionId` | liên kết bản trước |

Chỉ revision được `GraduationPeriods.ActiveRevisionId` trỏ tới mới tham gia báo cáo. Cách này đáp ứng “ghi đè đợt cũ” nhưng vẫn có lịch sử để truy vết/khôi phục, không làm cộng trùng dữ liệu.
Metadata tháng/năm trên `GraduationPeriods` luôn phản chiếu revision active; snapshot trên revision giữ lại giá trị của các lần import trước.

### 4.3. `GraduationAggregateRows`

Parser đọc từng dòng sinh viên trong bộ nhớ, sau đó group và chỉ lưu số lượng theo:

`Revision + Khoa + Chuyên ngành + Khóa + Xếp loại + IsWorkStudy`.

| Trường | Ý nghĩa |
|---|---|
| `AggregateRowId`, `RevisionId` | định danh |
| `FacultyNameRaw`, `FacultyKey` | khoa nguồn và khóa chuẩn hóa |
| `ProgramNameRaw`, `ProgramKey` | chuyên ngành nguồn và khóa chuẩn hóa |
| `DerivedProgramCode` | tiền tố tách từ lớp nếu đủ tin cậy |
| `CohortCode` | ví dụ K62 |
| `GraduationRank` | excellent/veryGood/good/average |
| `IsWorkStudy` | `true` khi cột VLVH nguồn được đánh dấu |
| `StudentCount` | số dòng thuộc tổ hợp |

Unique trên toàn bộ tổ hợp dimension trong một revision và check `StudentCount > 0`. Group theo key đã chuẩn hóa; giữ một nhãn nguồn đại diện để hiển thị và cảnh báo nếu nhiều cách viết khác nhau bị gom về cùng key. Index theo revision, cohort, faculty, program, rank và `IsWorkStudy`. Không lưu một row trên mỗi sinh viên.

Revision lưu thêm các tổng kiểm soát: tổng dòng nguồn, tổng dòng được import, tổng dòng bị bỏ, tổng bốn xếp loại và tổng VLVH. Các tổng này giúp audit và giải thích chênh lệch mà không cần lưu dữ liệu cá nhân.

### 4.4. Chuẩn hóa chiều phân tích

- Chuẩn hóa Unicode, khoảng trắng, chữ hoa/thường và ký tự `Ð/Đ`.
- Lưu cả giá trị gốc và key chuẩn hóa.
- Không tự gộp hai tên khác nhau về nghĩa chỉ vì gần giống.
- Preview liệt kê giá trị mới và các dòng không tách được khóa đã bị bỏ.
- Ngoại lệ như `IBL05` không được đoán khóa hoặc ánh xạ thủ công; hệ thống lưu bản tóm tắt cảnh báo đã làm sạch trong revision để audit.

## 5. Parser và validation file mới

### 5.1. Nhận diện sheet

1. Ưu tiên sheet có tên chuẩn hóa bằng `tonghop`.
2. Kiểm tra chữ ký header tối thiểu chỉ theo các cột cần thống kê: Loại TN, Lớp, Khoa, Chuyên ngành, VLVH.
3. Nếu `TongHop` không hợp lệ, quét các sheet và chỉ tự chọn khi đúng một sheet khớp chữ ký.
4. Nếu nhiều sheet cùng khớp, yêu cầu người dùng chọn; không tự cộng sheet thủ khoa.

### 5.2. Đọc dòng

- Sau header, dòng có ít nhất một giá trị trong Lớp/Loại TN/Khoa/Chuyên ngành được xem là dòng dữ liệu ứng viên.
- Chỉ bỏ dòng khi toàn bộ các ô nghiệp vụ đều rỗng; không dùng `rowCount` Excel để quyết định số dòng thật.
- Dòng ứng viên thiếu một trong Lớp, Loại TN, Khoa hoặc Chuyên ngành là lỗi chặn có số dòng; không được bỏ qua âm thầm.
- Các cột Mã SV, Họ tên, Ngày sinh, Giới tính, GPA và Dự lễ không được đưa vào DTO/database.
- Parser chỉ tăng bộ đếm cho tổ hợp Khoa + Chuyên ngành + Khóa + Xếp loại + cờ VLVH.
- Chuẩn hóa xếp loại về bốn enum; giá trị ngoài tập cho phép là lỗi chặn.
- Cờ `X/x/1/true/có` được hiểu là có; ô rỗng là không; giá trị không rỗng ngoài tập cho phép là lỗi chặn.
- Không đọc sheet phụ vào dữ liệu chính.

### 5.3. Tách khóa và mã chương trình

- Chuẩn hóa `ÐH` thành `ĐH` trước khi dùng biểu thức tách.
- Với mẫu như `KPM61ĐH`, tách tiền tố chương trình `KPM` và khóa `K61`.
- Với hậu tố `CL`, `CH` vẫn lấy hai chữ số khóa ở vị trí đã xác định.
- Không lấy hai chữ số bất kỳ trong lớp làm khóa nếu không khớp mẫu an toàn.
- Dòng không tách được khóa bị loại tự động khỏi lần import và được trả về trong danh sách warning gồm sheet, số dòng nguồn, mã lớp và lý do `COHORT_UNRESOLVED`.

### 5.4. Validation hai lớp

Frontend chỉ phục vụ trải nghiệm preview. Backend phải đọc và kiểm tra lại chính file được gửi lên, không tin payload row do trình duyệt tự dựng.

Các lỗi chặn:

- sai loại file/kích thước;
- không tìm thấy đúng sheet;
- thiếu cột bắt buộc;
- không có dòng dữ liệu;
- xếp loại không hợp lệ;
- giá trị VLVH không hợp lệ;
- đợt không thuộc năm học đã chọn;

Warning không chặn:

- khoa/ngành mới chưa có key chuẩn hóa trước đó;
- tên file không khớp metadata người dùng chọn;
- số lượng đọc được khác con số ghi trong tên file;
- cột phụ không được sử dụng.
- dòng bị bỏ do không tách được khóa; warning phải kèm số lượng và vị trí nguồn đã làm sạch.

Không đưa 11 file thật chứa dữ liệu cá nhân vào Git. Tạo workbook fixture đã ẩn danh nhưng giữ đủ các biến thể cấu trúc để test.

## 6. Luồng import và giao diện quản lý đợt

### 6.1. Màn hình ban đầu

Thay modal 16 cột hiện tại bằng màn hình quản lý theo mẫu trong ảnh:

1. Khi mở module, hiển thị màn hình import trước. Chọn năm học bằng combobox, mặc định năm học hiện tại theo quy tắc tháng 8–7; danh sách gồm 10 năm trước đến 10 năm sau năm học hiện tại.
2. Hiển thị bảng các đợt của năm học:

| Đợt | Tháng/năm xét | File hiện tại | Số SV | Phiên bản | Thao tác |
|---:|---|---|---:|---:|---|
| 1 | 04/2025 | tên file | 134 | 2 | Xem / Import lại |
| 2 | 05/2025 | Chưa có | — | — | Chọn file |

3. Không sinh sẵn 5 đợt và không đặt giới hạn tối đa; nút `Thêm đợt` tạo tuần tự Đợt 2, Đợt 3, ... khi người dùng cần.
4. Tháng và năm xét dùng combobox, chỉ cho chọn tổ hợp thuộc năm học đang quản lý. Tên file không được coi là nguồn metadata đợt.

### 6.2. Luồng import lần đầu

1. Người dùng chọn năm học, số đợt, tháng và năm xét.
2. Chọn file `.xlsx`.
3. Backend parse và trả preview.
4. Preview hiển thị:
   - sheet được chọn;
   - tổng số dòng ứng viên, số dòng được import và số dòng bị bỏ;
   - tổng theo bốn xếp loại;
   - số Tốt nghiệp đúng hạn và Hệ VLVH theo cờ nguồn;
   - số khoa/ngành/khóa;
   - lỗi và warning; với dòng bị bỏ phải nhóm theo mã lớp, hiển thị sheet, số dòng nguồn và lý do;
   - bảng số lượng tổng hợp theo khoa/ngành/khóa/xếp loại/trạng thái tốt nghiệp.
5. Nếu có dòng bị bỏ, UI hiển thị cảnh báo rõ ràng nhưng vẫn cho phép tiếp tục; không có bước chọn hoặc lưu ánh xạ khóa.
6. Khi xác nhận import, trình duyệt gửi lại cùng file, metadata và `previewFileHash`; backend parse lại và kiểm tra hash cùng kết quả bỏ dòng khớp preview.
7. Transaction tạo period, revision, aggregate rows và chuyển revision thành active; revision lưu số lượng cùng tóm tắt các dòng bị bỏ.

Preview không lưu file hoặc các dòng cá nhân ở database/cache bền vững. Backend chỉ trả số liệu tổng hợp, warning và mã hash; request/file được giải phóng sau khi xử lý.

### 6.3. Luồng import lại/ghi đè

1. Tại đợt đã có dữ liệu, nút chính đổi thành `Import lại`.
2. Parse file mới nhưng chưa thay dữ liệu đang hoạt động.
3. Hiển thị diff theo các ô tổng hợp Khoa + Chuyên ngành + Khóa + Xếp loại + Trạng thái tốt nghiệp:
   - tổ hợp mới;
   - tổ hợp bị loại;
   - mức tăng/giảm số lượng của từng tổ hợp;
   - chênh lệch tổng xếp loại, tốt nghiệp đúng hạn và hệ VLVH.
4. Yêu cầu nhập lý do thay thế.
5. Người dùng xác nhận rõ `Thay thế dữ liệu Đợt N`.
6. Trong một transaction: tạo revision mới, lưu aggregate rows mới, đổi `ActiveRevisionId`.
7. Nếu bất kỳ bước nào lỗi, revision cũ vẫn active.
8. Sau thành công, toàn bộ query và cache phải đọc revision mới; revision cũ chỉ dùng cho lịch sử.

Đồng thời dùng optimistic concurrency (`expectedActiveRevisionId`) để tránh hai người cùng thay một đợt và người sau ghi đè âm thầm.

Nếu `AggregateHash` (đã gồm metadata đợt) trùng revision active của cùng đợt, trả kết quả `không có thay đổi` thay vì tạo revision mới. Nếu cùng `FileHash` đã thuộc một đợt khác, chặn import để tránh gắn nhầm file vào sai đợt.

### 6.4. Tổng đầu vào để dành cho giai đoạn sau

Phiên bản này không tạo màn hình, bảng dữ liệu hoặc API cho Tổng đầu vào/Còn lại. Khi có nguồn dữ liệu đầu vào đáng tin cậy, triển khai thành một phase độc lập; không trộn số giả hoặc số nhập tay chưa kiểm chứng vào báo cáo hiện tại.

## 7. Tab Khám phá chi tiết sau khi sửa

### 7.1. Bộ lọc và mốc thời gian

Không dùng nhãn chung chung `Tích lũy tất cả các đợt`. Tách rõ hai chế độ:

**Riêng một đợt**

- chọn Năm học;
- chọn Đợt;
- Khóa là bộ lọc tùy chọn;
- kết quả chỉ lấy số phát sinh trong đúng đợt được chọn.

**Tích lũy theo khóa**

- bắt buộc chọn một Khóa trước, ví dụ K62;
- chọn mốc kết thúc gồm Năm học + Đợt;
- hệ thống lấy đúng khóa đó từ đợt đầu tiên có dữ liệu đến hết mốc được chọn;
- không giới hạn dữ liệu trong riêng năm học của mốc và không cộng các khóa khác;
- Khoa và Chuyên ngành/CTĐT là bộ lọc tùy chọn áp dụng xuyên suốt tất cả các đợt.

Ví dụ `K62 · đến NH 2025–2026, Đợt 3` gồm:

- K62 của toàn bộ đợt đã import trong các năm học trước;
- K62 của đợt 1, 2 và 3 năm học 2025–2026;
- không gồm đợt 4–5 năm học 2025–2026;
- không gồm K61 hoặc K63.

UI nên dùng nhãn `Tích lũy khóa K62 đến Đợt 3 · NH 2025–2026` để phạm vi luôn rõ ràng. Mọi card, biểu đồ và export trong tab dùng cùng chế độ, khóa, cutoff và bộ lọc.

UI đồng thời ghi `Dữ liệu tích lũy từ <đợt sớm nhất đang có>`. Nếu thiếu các đợt lịch sử trước đó thì hiển thị cảnh báo “Tích lũy trên dữ liệu hiện có”, không khiến người dùng hiểu đây là toàn bộ lịch sử của khóa.

### 7.2. Góc nhìn nhanh

Đặt phía trên phần cấu hình biểu đồ trong chính tab **Khám phá chi tiết**:

| KPI | Cách tính |
|---|---|
| Đã tốt nghiệp | tổng số lượng trong riêng đợt hoặc tích lũy theo khóa, tùy chế độ |
| Tốt nghiệp đúng hạn | số lượng có cột VLVH để trống |
| Hệ VLVH | số lượng có cột VLVH được đánh dấu |

Card Tốt nghiệp đúng hạn và Hệ VLVH hiển thị thêm tỷ lệ trên số đã tốt nghiệp. `Tốt nghiệp đúng hạn + Hệ VLVH` phải luôn bằng `Đã tốt nghiệp` trong cùng phạm vi.

### 7.3. Thống kê kết quả học tập

Giữ các chỉ tiêu:

- số/tỷ lệ Xuất sắc;
- số/tỷ lệ Giỏi;
- số/tỷ lệ Khá;
- số/tỷ lệ Trung bình;
- số/tỷ lệ Hệ VLVH.

Biểu đồ cơ cấu xếp loại chỉ gồm bốn xếp loại. VLVH hiển thị bằng card/series riêng hoặc bộ lọc, không đặt thành lát thứ năm của biểu đồ 100%.

Giữ khả năng chọn chiều phân tích theo Khoa, Chuyên ngành, Khóa, Năm học và Đợt. Thêm metric Đã tốt nghiệp, Tốt nghiệp đúng hạn, Hệ VLVH, Tỷ lệ đúng hạn và Tỷ lệ VLVH.

### 7.4. Biểu đồ tích lũy

Bổ sung biểu đồ theo thứ tự đợt:

- cột: số tốt nghiệp riêng của từng đợt;
- đường 1: số đã tốt nghiệp tích lũy;
- đường 2: số tốt nghiệp đúng hạn tích lũy;
- đường 3: số hệ VLVH tích lũy.

Trục X là chuỗi các đợt theo thời gian của khóa đang chọn, không phải danh sách khóa. Tooltip phải ghi rõ `Khóa – Năm học – Đợt – tháng xét`, số riêng đợt và số tích lũy. Đây là cách biểu diễn trực tiếp phép cộng K62 đợt 1 + đợt 2 + ... trong ảnh.

## 8. Tab Bảng dữ liệu

Đổi từ bảng tổng hợp C–R sang bảng số lượng tổng hợp của revision đang hoạt động:

- lọc theo năm học, đợt, khoa, ngành, khóa, xếp loại và trạng thái Tốt nghiệp đúng hạn/Hệ VLVH;
- hiển thị số lượng của từng tổ hợp và nguồn file/sheet;
- export đúng phạm vi đang lọc;
- có nút xem lịch sử revision và diff của lần import lại;
- không có mã SV, tên, ngày sinh, giới tính hoặc điểm trong bảng/API/export.

## 9. API đề xuất

### 9.1. Đợt và import

- `GET /api/v1/graduation-analytics/managed-periods?academicYearStart=2024`
- `POST /api/v1/graduation-analytics/imports/preview` – multipart gồm file; metadata đợt được kiểm tra lại ở bước commit.
- `POST /api/v1/graduation-analytics/imports/commit` – tạo revision đầu tiên hoặc import lại; multipart gồm file, metadata, hash preview, expected revision và reason khi thay thế.
- `GET /api/v1/graduation-analytics/managed-periods/{periodId}/revisions`

Response preview và kết quả import phải trả `sourceRowCount`, `importedRowCount`, `skippedRowCount` cùng danh sách cảnh báo dòng bị bỏ đã làm sạch. Dòng bị bỏ là warning không chặn commit.

### 9.2. Phân tích

- `POST /api/v1/graduation-analytics/explore/summary`
- Request dùng `mode = period|cohortCumulative`, `periodId` hoặc `cutoffPeriodId`, `cohort`, faculty/program filters. `cohort` là bắt buộc khi dùng `cohortCumulative`.
- Response trả cả giá trị, mẫu số và cảnh báo chất lượng dữ liệu.

API cũ giữ tạm trong giai đoạn chuyển đổi nếu cần, nhưng UI mới chỉ gọi các endpoint/contract mới sau khi cutover. “v3” trong tài liệu là phiên bản schema nội bộ, không phải đổi prefix HTTP `/api/v1`.

## 10. Backend và hiệu năng

- Parse Excel trong backend bằng một parser riêng có unit test; frontend không còn là nơi xác nhận dữ liệu cuối cùng.
- Tắt ghi raw multipart body vào log, không lưu file upload vào thư mục bền vững và không trả các cột cá nhân trong response lỗi/preview.
- Query chỉ join period → active revision → aggregate rows; revision cũ không bao giờ lọt vào thống kê.
- Cộng `StudentCount` trực tiếp tại database theo dimension; không tải row cá nhân và không `COUNT DISTINCT`.
- Không tải toàn bộ aggregate rows về RAM để group.
- Index theo active revision, period order và các dimension key.
- Cache metadata/facets theo active revision; invalidation ngay sau import lại.
- Giới hạn file và dòng ở backend; mức đề xuất ban đầu là 10 MB và 10.000 sinh viên/file.

### 10.1. Phạm vi file/code dự kiến

Backend:

- thay mô hình trong `src/Backend/Domain/GraduationAnalyticsModels.cs`;
- viết lại contract trong `src/Backend/Application/GraduationAnalytics/GraduationAnalyticsContracts.cs`;
- viết parser mới `Infrastructure/GraduationAnalytics/ClosedXmlGraduationImportParser.cs`, tái sử dụng `ClosedXML` đã có trong project;
- viết lại phần import/query trong `Infrastructure/GraduationAnalytics/EfGraduationAnalyticsService.cs`;
- cập nhật endpoint multipart trong `API/GraduationAnalytics/GraduationAnalyticsEndpoints.cs`;
- cập nhật EF mapping trong `Infrastructure/Persistence/AppDbContext.cs` và tạo migration mới, không sửa migration lịch sử.

Frontend:

- viết lại `GraduationImportDialog.tsx` thành màn hình preview/replace dựa trên API;
- thay parser 16 cột trong `graduationImportExcel.ts` bằng helper gửi file/hiển thị lỗi, hoặc xóa riêng parser này sau khi không còn consumer; không gỡ package `read-excel-file` vì các module import khác vẫn dùng;
- cập nhật `graduationAnalytics.ts`, `graduationAnalyticsApi.ts`, `GraduationAnalyticsPage.tsx` và `graduation-analytics.css`;
- cập nhật các component chart để hỗ trợ chuỗi đợt tích lũy theo khóa.

Kiểm thử:

- thay fixture/test 16 cột hiện tại bằng fixture workbook danh sách đã ẩn danh;
- viết lại `GraduationAnalyticsServiceTests` và `GraduationAnalyticsDatabaseIntegrationTests` cho revision, aggregate, cơ chế bỏ dòng có cảnh báo và cumulative cutoff;
- cập nhật endpoint authorization test cho API mới và quyền quản lý.

## 11. Phân quyền và audit

Khuyến nghị tách:

- `GRADUATION_ANALYTICS_ACCESS`: xem báo cáo/bảng.
- `GRADUATION_ANALYTICS_MANAGE`: import, import lại và xem lịch sử revision/cảnh báo dòng bị bỏ.

Mọi lần import lại lưu người thực hiện, thời gian, file/hash cũ–mới, lý do và diff tổng quan. Không ghi dữ liệu cá nhân chi tiết vào log ứng dụng.

## 12. Migration và chuyển đổi dữ liệu

Dữ liệu hiện tại là các dòng tổng hợp 16 cột theo mô hình khác; không thể suy ra chính xác quan hệ chồng lấp giữa xếp loại và VLVH. Không tự chuyển đổi thành số liệu mới sai nghĩa.

Triển khai theo pha:

1. Chạy preflight read-only trên hai bảng cũ: số dataset, đợt và tổng hiện có.
2. Tạo ba bảng v3 song song (`Periods`, `ImportRevisions`, `AggregateRows`), không drop bảng cũ.
3. Không backfill dòng tổng hợp cũ vì mô hình cũ coi VLVH là nhóm riêng và không giữ được quan hệ chồng lấp với xếp loại.
4. Import lại 11 file gốc vào schema mới theo đúng năm học/đợt/tháng được duyệt.
5. Đối chiếu tổng từng file, từng xếp loại, VLVH và các dòng bị bỏ do không tách được khóa.
6. Chuyển UI sang schema/API contract mới bằng feature flag.
7. Giữ bảng cũ read-only ít nhất một chu kỳ nghiệm thu/backup.
8. Chỉ viết migration cleanup/drop sau khi người phụ trách dữ liệu ký nghiệm thu.

Metadata tháng/năm không có trong file và được người dùng chọn khi import. Không có bảng ánh xạ lớp; ngoại lệ không tách được khóa sẽ bị bỏ và được thông báo.

## 13. Kế hoạch triển khai theo giai đoạn

### Giai đoạn 0 – Chốt quy tắc import

- Duyệt sáu quy tắc tại mục 3.
- Chốt định dạng cảnh báo khi có dòng không tách được khóa bị bỏ.

### Giai đoạn 1 – Parser và fixture ẩn danh

- Xây parser backend cho `TongHop`.
- Tạo fixture cho 14/15/17 cột, sheet phụ, header lặp, Unicode `Ð/Đ`, dòng format rỗng và lớp ngoại lệ.
- Trả preview, lỗi và warning có số dòng nguồn.

### Giai đoạn 2 – Schema v3 và import có revision

- Thêm entity/configuration/migration.
- Tạo import lần đầu, replace, bỏ dòng có cảnh báo, transaction, concurrency và audit.
- Tạo preflight cho dữ liệu legacy và cơ chế reimport.

### Giai đoạn 3 – Query tích lũy

- Cài công thức KPI và query theo cutoff.
- Cài bốn xếp loại loại trừ nhau và VLVH chồng lấp.
- Cài invariant/anomaly reporting.

### Giai đoạn 4 – UI quản lý đợt

- Làm giao diện năm học–đợt–tháng–file theo ảnh.
- Làm preview, diff và xác nhận import lại.

### Giai đoạn 5 – Khám phá chi tiết và bảng dữ liệu

- Thêm ba KPI nhanh.
- Cập nhật metric/chart/filter/export.
- Thêm biểu đồ riêng đợt và tích lũy.
- Đổi bảng nguồn sang bảng số lượng tổng hợp.

### Giai đoạn 6 – Đối chiếu và rollout

- Import bộ 11 file vào môi trường kiểm thử.
- Đối chiếu 6.698 dòng nguồn, trong đó 1 dòng `IBL05` bị bỏ, nên tổng active kỳ vọng là 6.697.
- UAT bằng các phép tính tay theo khóa/đợt trong ảnh.
- Backup, feature flag, deploy, giám sát rồi mới cleanup legacy.

Kết quả tự động ngày 18/09/2026: script `scripts/test-graduation-analytics-e2e.ps1` đã chạy toàn bộ luồng HTTP trên PostgreSQL tạm, gồm đăng nhập/phân quyền/CSRF, preview và commit 11 file, import không đổi, hai lần thay revision, lịch sử revision, truy vấn riêng đợt và tích lũy theo khóa. Kết quả đạt 6.698 dòng nguồn, 6.697 dòng active, bỏ đúng 1 dòng; tổng xếp loại 676 / 1.509 / 3.632 / 880 và VLVH 451. Tháng/năm dùng trong test là metadata giả lập theo thứ tự đợt; khi triển khai thật vẫn phải nhập tháng/năm đã được đơn vị nghiệp vụ duyệt.

## 14. Ma trận kiểm thử bắt buộc

### 14.1. Parser

- Đọc đúng từng biến thể file thật bằng fixture ẩn danh.
- Chỉ chọn `TongHop`, không nhân đôi từ sheet thủ khoa.
- Chỉ đếm dòng có đủ các cột thống kê bắt buộc, không đọc hàng trống đã format.
- Không đưa mã SV, họ tên, ngày sinh, giới tính hoặc GPA vào output parser.
- Chuẩn hóa xếp loại, VLVH, `ĐH/ÐH`.
- Bỏ `IBL05` hoặc lớp không tách được khóa khỏi mọi aggregate/KPI và trả warning có mã lớp, sheet, số dòng nguồn, lý do.
- Phát hiện header thiếu, dòng nghiệp vụ thiếu trường, xếp loại lạ, cờ VLVH lạ và file không hợp lệ.

### 14.2. Import/replace

- Import mới thành công.
- Cùng năm học nhưng nhiều đợt cùng tháng vẫn hợp lệ.
- Cùng `năm học + đợt` chuyển sang replace, không tạo đợt thứ hai.
- Replace lỗi không làm mất revision đang active.
- Replace thành công chỉ dùng revision mới trong thống kê.
- Hai người replace đồng thời: người dùng revision cũ nhận conflict.
- Xác nhận import parse lại đúng file/hash đã preview.
- Upload lại đúng nội dung của revision active không tạo revision mới.
- Cùng file/hash không thể gắn vào hai đợt khác nhau.
- Khi có dòng bị bỏ, commit vẫn thành công và revision lưu đúng số dòng nguồn, được import, bị bỏ cùng tóm tắt cảnh báo.
- Luôn thỏa `SourceRowCount = ImportedRowCount + SkippedRowCount` đối với file không có lỗi chặn.
- Dòng bị bỏ không xuất hiện trong bất kỳ aggregate, KPI, biểu đồ hay export nào.

### 14.3. Công thức

- Tổng bốn xếp loại bằng Đã tốt nghiệp.
- VLVH không làm tăng tổng tốt nghiệp.
- Tích lũy K62 đến đợt 3 chỉ lấy K62 của các đợt trước và đợt 3, không lấy khóa khác.
- Import lại đợt cũ làm số tích lũy cập nhật đúng, không cộng bản cũ.
- Dòng không đánh dấu VLVH được tính Tốt nghiệp đúng hạn.
- Dòng đánh dấu VLVH được tính Hệ VLVH.
- Tốt nghiệp đúng hạn + Hệ VLVH = Đã tốt nghiệp.
- Bộ lọc khoa/ngành/khóa áp dụng đồng nhất cho mọi KPI và biểu đồ.
- Tích lũy bắt đầu ở đợt sớm nhất hiện có và trả metadata để UI cảnh báo khi lịch sử chưa đầy đủ.

### 14.4. Mốc regression bộ mẫu

- 11 file → 11 đợt; 6.698 dòng nguồn, bỏ 1 dòng `IBL05`, tổng số lượng active là 6.697.
- Tổng xếp loại sau khi bỏ dòng: 676 / 1.509 / 3.632 / 880.
- Hệ VLVH theo cờ nguồn sau khi bỏ dòng: 451; Tốt nghiệp đúng hạn: 6.246; hai nhóm cộng đúng 6.697.
- Theo năm học sau khi bỏ dòng: 3.266 / 3.233 / 198.
- Không có trường thông tin cá nhân trong bảng v3 hoặc response API.

### 14.5. UI/E2E

- Mở module vào thẳng màn hình import; combobox năm học có đủ khoảng ±10 năm quanh năm học hiện tại.
- Có thể thêm tuần tự số đợt không giới hạn cố định; tháng/năm xét chỉ chọn được trong năm học tương ứng.
- Preview/diff rõ trên desktop và màn hình nhỏ.
- Sau replace, card/chart/table/export cùng cập nhật một revision.
- URL giữ được năm học, cutoff, mode và filter hợp lệ.
- Trạng thái loading/error/empty/dòng bị bỏ trong preview có thông báo riêng; sau import vẫn xem được cảnh báo của revision.
- Nhãn phạm vi luôn nêu rõ khóa, cutoff và đợt bắt đầu của dữ liệu tích lũy.

## 15. Tiêu chí nghiệm thu

Module được coi là hoàn thành khi:

1. 11 file mẫu được import không cần sửa cấu trúc file.
2. Không đọc trùng sheet phụ hoặc dòng format rỗng.
3. Có thể import lại một đợt, xem diff và số liệu chỉ phản ánh bản mới.
4. Nhiều đợt cùng tháng không xung đột.
5. Kết quả bốn xếp loại, Tốt nghiệp đúng hạn và Hệ VLVH khớp toàn bộ mốc regression.
6. Ba KPI nhanh trong Khám phá chi tiết khớp phép tính tay của cùng một khóa, cutoff và bộ lọc.
7. VLVH không bị cộng hai lần vào số đã tốt nghiệp.
8. Tốt nghiệp đúng hạn/Hệ VLVH được phân loại đúng theo cờ nguồn; dòng không tách được khóa bị bỏ khỏi mọi số liệu và được thông báo rõ mà không chặn import.
9. Có audit đầy đủ cho import lại.
10. Build frontend, unit test parser/service, integration test database và E2E import/replace đều đạt.

## 16. Rủi ro và biện pháp

| Rủi ro | Biện pháp |
|---|---|
| Không có tổng đầu vào trong file | loại Tổng đầu vào/Còn lại khỏi scope hiện tại |
| Mã lớp không đồng nhất | chỉ tách theo mẫu an toàn; dòng không xác định được khóa bị bỏ và liệt kê trong preview/kết quả import |
| Tên khoa/ngành thay đổi | lưu raw + normalized key, cảnh báo giá trị mới |
| Sheet phụ làm nhân đôi | chữ ký sheet + chỉ một sheet chính |
| Import lại gây mất dữ liệu | immutable revisions + atomic active switch |
| Hai người ghi đè đồng thời | optimistic concurrency |
| PII lọt vào database/repo/log | parser chỉ trả aggregate, fixture ẩn danh, không commit file thật |
| Không phát hiện được một người lặp giữa các đợt | chấp nhận nguồn quyết định là chuẩn; đối chiếu ngoài hệ thống khi cần |
| Migration mô hình cũ → mới không chính xác | schema song song và reimport file gốc |

## 17. Các xác nhận cần có khi duyệt kế hoạch

Các nội dung đã được chốt:

1. Cột VLVH trong file là nguồn chuẩn: có đánh dấu là Hệ VLVH, để trống là Tốt nghiệp đúng hạn; module không tự tính lại mốc 6 năm.
2. Tạm thời không triển khai Tổng đầu vào và Còn lại.
3. Không lưu mã SV, tên, ngày sinh, giới tính hoặc điểm; chỉ lưu số lượng tổng hợp.
4. Hệ VLVH là trạng thái đào tạo chồng lấp với xếp loại, không phải nhóm xếp loại thứ năm.
5. Khi import lại, hệ thống thay bản active nhưng vẫn giữ revision cũ cho audit/khôi phục.

Tháng/năm của từng đợt được chọn trực tiếp khi import. Khi gặp lớp ngoại lệ không tách được khóa, hệ thống bỏ dòng đó khỏi toàn bộ số liệu và thông báo rõ mã lớp, vị trí, lý do cùng số lượng bị bỏ để người import biết.
