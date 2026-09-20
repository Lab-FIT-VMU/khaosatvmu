# Kế hoạch phân loại ý kiến mở theo cảm xúc và chủ đề
. Mình sẽ chỉ truy vấn đọc, không sửa database và không đưa nguyên văn ý kiến vào log/Git.
## Trạng thái triển khai

| Giai đoạn | Trạng thái | Cập nhật |
|---|---|---|
| Giai đoạn 0 — Chốt nghiệp vụ | Hoàn thành | 20/09/2026 |
| Giai đoạn 1 — Dữ liệu và baseline | Hoàn thành phần công khai; local gold hoãn | 20/09/2026 |
| Giai đoạn 2 — Fine-tune PhoBERT | Sẵn sàng bắt đầu | — |
| Giai đoạn 3 — Backend inference | Chưa bắt đầu | — |
| Giai đoạn 4 — Giao diện báo cáo | Chưa bắt đầu | — |
| Giai đoạn 5 — Pilot và nghiệm thu | Chưa bắt đầu | — |
| Giai đoạn 6 — Phân loại chủ đề | Chưa bắt đầu | — |

## 1. Mục tiêu

Nâng cấp màn **Phân tích ý kiến mở** để hệ thống có thể tự động phân loại nội dung sinh viên nhập tại ô `AdditionalComments`.

Kết quả tối thiểu cần có:

- Phân loại cảm xúc: **Tích cực**, **Tiêu cực**, **Trung tính**.
- Nhận biết trường hợp **Hỗn hợp** khi một ý kiến đồng thời có nội dung tích cực và tiêu cực.
- Gắn trạng thái **Chưa chắc chắn** khi mô hình không đủ độ tin cậy, thay vì ép kết quả vào một nhãn sai.
- Cho phép tìm kiếm, lọc, sắp xếp và xuất Excel theo nhãn cảm xúc.
- Hiển thị tổng hợp số lượng, tỷ lệ và xu hướng ý kiến theo học kỳ, đợt khảo sát, khoa, bộ môn, học phần và giảng viên trong đúng phạm vi phân quyền.
- Có cơ chế hiệu chỉnh thủ công và tái huấn luyện để chất lượng mô hình tăng dần.

Phân loại cảm xúc không được dùng như căn cứ duy nhất để đánh giá hoặc xếp hạng giảng viên. Đây là công cụ hỗ trợ tổng hợp dữ liệu, mọi kết luận quản trị vẫn cần người có chuyên môn xem lại nội dung gốc.

## 2. Hiện trạng trong hệ thống

Luồng dữ liệu hiện tại:

1. Sinh viên nhập ý kiến vào `SurveyResponse.AdditionalComments`.
2. `EfReportService.GetOpenCommentAnalysisAsync` truy vấn các phiếu có ý kiến mở.
3. Backend trả về `OpenCommentAnalysisReportDto` và danh sách `OpenCommentItemDto`.
4. Frontend gọi `reportApi.openComments(...)`.
5. `OpenCommentAnalysis.tsx` hiển thị KPI, bảng ý kiến, tìm kiếm, lọc và modal chi tiết phiếu.

Các vị trí dự kiến thay đổi:

- `src/Backend/Domain`: mô hình lưu kết quả phân loại.
- `src/Backend/Application/Reports/ReportContracts.cs`: hợp đồng dữ liệu phân tích.
- `src/Backend/Infrastructure/Reports/EfReportService.cs`: truy vấn kết quả phân loại và tổng hợp.
- `src/Backend/API/Reports/ReportEndpoints.cs`: API phân tích, hiệu chỉnh và chạy lại mô hình.
- `src/Frontend/src/types/index.ts`: kiểu dữ liệu cảm xúc và chủ đề.
- `src/Frontend/src/services/reportApi.ts`: lời gọi API.
- `src/Frontend/src/components/reports/OpenCommentAnalysis.tsx`: KPI, biểu đồ, bộ lọc và bảng chi tiết.

## 3. Phạm vi nhãn

### 3.1. Nhãn cảm xúc chính

| Nhãn | Ý nghĩa | Ví dụ |
|---|---|---|
| `Positive` | Khen ngợi, hài lòng, ghi nhận điểm tốt | “Thầy giảng dễ hiểu và hỗ trợ sinh viên nhiệt tình.” |
| `Negative` | Không hài lòng, phàn nàn hoặc đề nghị khắc phục vấn đề | “Tốc độ giảng quá nhanh, sinh viên không theo kịp.” |
| `Neutral` | Thông tin hoặc đề xuất không thể hiện rõ cảm xúc | “Nên đăng tài liệu trước mỗi buổi học.” |
| `Mixed` | Có cả nội dung tích cực và tiêu cực | “Cô nhiệt tình nhưng bài tập giao quá nhiều.” |
| `Uncertain` | Nội dung quá ngắn, mơ hồ hoặc mô hình không đủ tin cậy | “Ổn”, “Không biết”, ký tự vô nghĩa hoặc câu khó xác định |

Không gộp `Neutral` với `Uncertain`:

- `Neutral` là một kết luận có độ tin cậy rằng câu không mang sắc thái rõ rệt.
- `Uncertain` là hệ thống chưa đủ căn cứ để kết luận.

### 3.2. Nhãn chủ đề mở rộng

Sau khi phân loại cảm xúc ổn định, bổ sung phân loại chủ đề đa nhãn. Một ý kiến có thể thuộc nhiều chủ đề:

- Phương pháp giảng dạy.
- Thái độ và mức độ hỗ trợ của giảng viên.
- Nội dung học phần.
- Tài liệu học tập.
- Bài tập, kiểm tra và đánh giá.
- Khối lượng và tốc độ giảng dạy.
- Lịch học, thời lượng và tổ chức lớp.
- Cơ sở vật chất, phòng học, thiết bị.
- Hệ thống học tập trực tuyến.
- Ý kiến khác.

Cảm xúc và chủ đề là hai trục độc lập. Ví dụ “Phòng học nóng và máy chiếu mờ” có cảm xúc `Negative`, chủ đề `Facilities`.

## 4. Kiến trúc đề xuất

### 4.1. Nguyên tắc

- Không gửi nội dung phản hồi sinh viên tới API AI công cộng.
- Huấn luyện mô hình ngoại tuyến bằng Python.
- Xuất mô hình sang ONNX.
- Chạy suy luận ngay trong backend .NET bằng ONNX Runtime.
- Lưu kết quả phân loại để báo cáo đọc nhanh, không chạy mô hình lại mỗi lần mở trang.
- Gắn `ModelVersion` và `ContentHash` để biết kết quả được tạo bởi phiên bản nào và có cần phân tích lại hay không.

PhoBERT là mô hình ngôn ngữ được tiền huấn luyện riêng cho tiếng Việt và phù hợp để fine-tune cho bài toán phân loại văn bản. ONNX Runtime hỗ trợ chạy mô hình đã huấn luyện trong C#/.NET, còn Hugging Face Optimum hỗ trợ xuất mô hình Transformers sang ONNX.

Tài liệu tham khảo:

- PhoBERT: <https://arxiv.org/abs/2003.00744>
- ONNX Runtime cho C#: <https://onnxruntime.ai/docs/get-started/with-csharp.html>
- Xuất mô hình bằng Hugging Face Optimum: <https://huggingface.co/docs/optimum-onnx/onnx/usage_guides/export_a_model>

### 4.2. Luồng xử lý

```text
Sinh viên gửi phiếu
        |
        v
SurveyResponse.AdditionalComments
        |
        v
Hàng đợi / BackgroundService lấy các ý kiến chưa phân tích
        |
        v
Tiền xử lý và tokenizer
        |
        v
Mô hình ONNX dự đoán xác suất cảm xúc
        |
        v
Áp dụng ngưỡng tin cậy và quy tắc Mixed/Uncertain
        |
        v
Lưu OpenCommentAnalysisResult
        |
        v
EfReportService tổng hợp -> API -> OpenCommentAnalysis.tsx
```

## 5. Công nghệ sử dụng

### 5.1. Huấn luyện và đánh giá mô hình

- Python 3.11 hoặc phiên bản được cố định trong môi trường dự án ML.
- PyTorch.
- Hugging Face Transformers và Datasets.
- PhoBERT-base làm mô hình ứng viên chính.
- NEU-ESC là nguồn huấn luyện cho artifact triển khai vì metadata của bộ dữ liệu khai báo giấy phép `Apache-2.0`; bộ dữ liệu ở trạng thái `gated: auto` nên phải chấp nhận điều kiện truy cập và dùng token khi tải.
- UIT-VSFC giữ vai trò benchmark trong miền vì cùng miền phản hồi sinh viên và có nhãn `Positive`, `Negative`, `Neutral`, nhưng không có tệp giấy phép nên không làm nguồn duy nhất cho artifact triển khai.
- Hai nguồn chỉ được trộn trong thí nghiệm đối chứng; mọi metric luôn tách theo từng nguồn để kiểm soát lệch phân bố nhãn và khác biệt miền dữ liệu.
- scikit-learn cho mô hình baseline và các chỉ số đánh giá.
- pandas, NumPy cho xử lý dữ liệu.
- Optimum/ONNX để xuất mô hình.
- ONNX Runtime Python để kiểm tra kết quả mô hình ONNX trước khi đưa vào backend.
- MLflow hoặc tệp metadata có version control để theo dõi tham số, dữ liệu và kết quả từng lần huấn luyện.
- Label Studio có thể dùng để gán nhãn; nếu không muốn thêm hệ thống ngoài, xây một màn quản trị gán nhãn nhỏ trong ứng dụng.

### 5.2. Chạy mô hình trong hệ thống

- `Microsoft.ML.OnnxRuntime` trong dự án Infrastructure.
- `BackgroundService` của ASP.NET Core để xử lý theo lô.
- EF Core để lưu và truy vấn kết quả.
- CPU inference là mặc định; chỉ dùng GPU khi khối lượng dữ liệu thực tế yêu cầu.
- Có thể lượng tử hóa INT8 sau khi đo lại độ chính xác và tốc độ.

### 5.3. Giao diện

- React/TypeScript theo cấu trúc hiện tại.
- Tái sử dụng `DataTable`, bộ lọc kiểu Excel và cơ chế xuất Excel.
- Dùng biểu đồ hiện có trong dự án để hiển thị phân bố cảm xúc; không thêm thư viện biểu đồ mới nếu chưa cần.

## 6. Thuật toán

### 6.1. Tiền xử lý

Chỉ tiền xử lý nhẹ để không làm mất thông tin cảm xúc:

1. Chuẩn hóa Unicode về NFC.
2. Xóa khoảng trắng thừa và ký tự điều khiển.
3. Chuẩn hóa các chuỗi lặp vô nghĩa nhưng giữ dấu câu có ý nghĩa.
4. Thay URL, email và số điện thoại bằng token đại diện.
5. Ẩn thông tin có thể nhận diện cá nhân trước khi tạo tập huấn luyện.
6. Giữ nguyên dấu tiếng Việt, từ phủ định, emoji và dấu chấm than.
7. Không dùng `foldVietnamese` cho đầu vào mô hình vì bỏ dấu có thể làm thay đổi nghĩa.

### 6.2. Mô hình baseline

Xây baseline trước khi fine-tune Transformer:

- Đặc trưng TF-IDF theo word n-gram và character n-gram.
- Logistic Regression hoặc Linear SVM.
- Trọng số lớp để xử lý mất cân bằng dữ liệu.

Baseline giúp:

- Phát hiện lỗi gán nhãn hoặc rò rỉ dữ liệu.
- Có mốc so sánh khách quan.
- Có phương án nhẹ nếu dữ liệu gán nhãn còn quá ít.

### 6.3. Mô hình chính

Fine-tune `PhoBERT-base` cho phân loại ba lớp cơ bản:

- `Positive`.
- `Negative`.
- `Neutral`.

Đầu ra của mô hình là ba xác suất sau softmax.

Không nên dùng điểm trung bình của phiếu làm đầu vào mô hình vì điều đó khiến mô hình học đường tắt: điểm thấp không phải lúc nào cũng đồng nghĩa với nội dung tiêu cực. Điểm phiếu chỉ nên dùng để đối chiếu và phân tích sau dự đoán.

### 6.4. Xử lý Mixed và Uncertain

Áp dụng suy luận theo câu:

1. Tách ý kiến thành các câu hoặc mệnh đề.
2. Chạy mô hình cho từng câu và cho toàn bộ ý kiến.
3. Nếu có ít nhất một câu `Positive` và một câu `Negative` đều vượt ngưỡng tin cậy, kết quả chung là `Mixed`.
4. Nếu xác suất lớn nhất thấp hơn ngưỡng cấu hình, kết quả là `Uncertain`.
5. Nếu không rơi vào hai trường hợp trên, lấy nhãn có xác suất cao nhất.

Ngưỡng ban đầu đề xuất là `0.65`, nhưng phải hiệu chỉnh trên tập validation. Không ghi cứng ngưỡng trong code; lưu trong cấu hình của phiên bản mô hình.

Pseudo-code:

```text
predictions = classify_each_sentence(comment)
whole = classify(comment)

if confident_positive(predictions) and confident_negative(predictions):
    label = Mixed
else if max(whole.probabilities) < confidence_threshold:
    label = Uncertain
else:
    label = argmax(whole.probabilities)
```

### 6.5. Phân loại chủ đề

Thực hiện ở giai đoạn sau bằng bài toán multi-label classification:

- Mỗi chủ đề dùng một đầu ra sigmoid.
- Một ý kiến có thể bật nhiều chủ đề.
- Dùng Binary Cross Entropy có trọng số theo tần suất nhãn.
- Ngưỡng từng chủ đề được hiệu chỉnh riêng, không bắt buộc cùng một giá trị.

Có thể dùng chung encoder PhoBERT và hai classification head:

- Head 1: cảm xúc đa lớp.
- Head 2: chủ đề đa nhãn.

Chỉ chuyển sang mô hình multi-task sau khi bộ nhãn chủ đề đã ổn định; phiên bản đầu nên tách hai bài toán để dễ kiểm thử.

## 7. Chiến lược dữ liệu

### 7.1. Quyết định nguồn dữ liệu

Không huấn luyện mô hình từ đầu bằng dữ liệu local vì số lượng hiện có không đủ lớn và không bảo đảm cân bằng giữa các nhãn. Phiên bản đầu sử dụng chiến lược **transfer learning từ dữ liệu công khai + hiệu chỉnh bằng tập local nhỏ**.

Nguồn dữ liệu dự kiến:

| Nguồn | Vai trò | Quy mô/thông tin chính | Cách sử dụng |
|---|---|---|---|
| [UIT-VSFC](https://nlp.uit.edu.vn/datasets) | Benchmark trong miền, vẫn dùng trong thí nghiệm đối chứng | Hơn 16.000 phản hồi tiếng Việt của sinh viên, có nhãn cảm xúc và chủ đề | Huấn luyện baseline ba lớp và fine-tune PhoBERT cho nhánh benchmark; giữ nguyên split chính thức nếu bản phát hành cung cấp |
| [Kho dữ liệu UIT-VSFC](https://github.com/kietnv/uit-vsfc) | Nguồn tải và đối chiếu phiên bản | Kho gốc kèm thông tin công bố | Ghim commit/checksum, lưu citation và tài liệu nguồn trong metadata của tập dữ liệu |
| [NEU-ESC](https://huggingface.co/datasets/hung20gg/NEU-ESC) | Nguồn huấn luyện cho artifact triển khai; metadata khai báo giấy phép `Apache-2.0` | Ba split công khai `train_set.csv`, `val_set.csv`, `test_set.csv`; hơn 33.000 bình luận trong miền giáo dục; phân bố nhãn lệch mạnh về `Neutral` | Nguồn train chính cho ba lớp; loại hoàn toàn nhãn `Toxic`; ghim revision, checksum và luôn lưu cột `DatasetSource` |

Chốt ngày 20/09/2026: NEU-ESC là nguồn huấn luyện cho artifact ba lớp vì metadata do nhóm tác giả công bố ghi `license: apache-2.0`, còn UIT-VSFC chỉ giữ vai trò benchmark trong miền do không có tệp LICENSE. Việc chọn NEU-ESC làm nguồn train cũng đặt ra ba ràng buộc:

- Bộ dữ liệu ở trạng thái `gated: auto`: tên file là công khai nhưng nội dung phải được cấp quyền, nên phải chấp nhận điều kiện truy cập và dùng token khi tải; revision được ghim để bảo đảm tái lập.
- NEU-ESC lệch mạnh về lớp `Neutral` (~69%) nên vẫn phải dùng class weight, và không được gộp cơ học với UIT-VSFC thành một con số metric duy nhất.
- Phần mô tả trong dataset card chỉ ghi "open-source license for research and educational purposes" trong khi thẻ metadata ghi `apache-2.0`; cả hai câu nằm trong cùng một file card đúng revision nên có thể đối chiếu được, nhưng cách ghi khác nhau gợi ý phạm vi hẹp hơn. Cần xác nhận với nhóm tác giả trước khi phân phối artifact phái sinh ra ngoài nhóm dự án.

Metadata và dữ liệu có link tải công khai có thể được tải vào môi trường cô lập để audit kỹ thuật và chạy thử nghiệm offline. Trước khi dùng model/dữ liệu cho pilot với người dùng thật, production hoặc phân phối artifact ra ngoài nhóm dự án phải hoàn thành kiểm tra giấy phép:

- Đối chiếu giấy phép từ nguồn gốc, không chỉ dựa vào bản sao trên Hugging Face.
- Xác nhận quyền sử dụng phù hợp với mục đích của nhà trường, đặc biệt nếu có điều khoản phi thương mại hoặc yêu cầu chia sẻ tương tự.
- Ghi lại URL nguồn, phiên bản/commit, ngày tải, checksum, giấy phép và nội dung citation.
- Không đưa tập dữ liệu bên ngoài vào repository ứng dụng; lưu tại kho dữ liệu huấn luyện có kiểm soát.
- Nếu chưa xác minh được quyền sử dụng của một nguồn thì loại nguồn đó khỏi pipeline, không coi là điều kiện chặn toàn bộ dự án.

### 7.2. Ánh xạ và chuẩn hóa nhãn

Tập huấn luyện chính chỉ ánh xạ ba nhãn trực tiếp:

| Nhãn nguồn | Nhãn hệ thống |
|---|---|
| Positive | `Positive` |
| Negative | `Negative` |
| Neutral | `Neutral` |

Quy tắc bổ sung:

- `Mixed` không có nhãn tương ứng đáng tin cậy trong UIT-VSFC; suy ra bằng phân loại theo câu/mệnh đề như mục 6.4.
- `Uncertain` không phải lớp train chính; suy ra từ confidence, chất lượng nội dung và quy tắc loại câu vô nghĩa.
- Nhãn `Toxic` của NEU-ESC bị loại hoàn toàn khỏi bài toán ba lớp và không tự động ánh xạ thành `Negative`. Loader chỉ đếm số dòng bị loại để phục vụ kiểm toán, không giữ lại nội dung; xử lý `Toxic` như một bài toán riêng nằm ngoài phạm vi phiên bản 1.
- Chủ đề trong bộ dữ liệu công khai chỉ dùng ở Giai đoạn 6 sau khi có tài liệu ánh xạ taxonomy và đánh giá sai khác miền.
- Giữ `DatasetSource`, nhãn gốc và nhãn sau ánh xạ để có thể truy vết.

### 7.3. Tập chuẩn local để hiệu chỉnh và kiểm thử

Dữ liệu local không còn là nguồn train chính. Chỉ trích xuất một tập nhỏ, ẩn danh và có chất lượng nhãn cao để đo độ lệch miền:

- Mục tiêu ban đầu: **200–400 ý kiến local** nếu dữ liệu cho phép.
- Khoảng 100–200 mẫu làm validation/calibration để chọn confidence threshold và kiểm tra quy tắc `Mixed`/`Uncertain`.
- Khoảng 100–200 mẫu làm test local đóng băng; tuyệt đối không dùng để train, chọn threshold hoặc sửa quy tắc.
- Nếu chưa đủ 200 mẫu, vẫn có thể chạy thử nghiệm bằng cross-validation và audit thủ công, nhưng chưa được công bố mô hình đã đạt tiêu chí production.

Mẫu local phải phủ nhiều học kỳ/đợt khảo sát, khoa, học phần, độ dài, câu sai chính tả và ngôn ngữ viết tắt. Ưu tiên chọn mẫu theo cụm embedding và độ đa dạng thay vì lấy liên tiếp từ một đợt khảo sát.

Tệp gán nhãn local chỉ gồm mã ngẫu nhiên, nội dung đã che thông tin nhận diện, khóa nhóm phục vụ chia tập và nhãn do người gán nhập. Không dùng trực tiếp `ResponseId`, tên giảng viên hoặc điểm phiếu làm đặc trưng mô hình.

### 7.4. Quy trình gán nhãn local

Áp dụng guideline đã chốt tại Giai đoạn 0:

- Hai người gán nhãn độc lập cho tập test local và các mẫu biên quan trọng.
- Người thứ ba phân xử mẫu bất đồng.
- Đo Cohen’s Kappa hoặc Krippendorff’s Alpha; sửa guideline nếu mức đồng thuận chưa đạt tiêu chí.
- “Không có ý kiến”, nội dung vô nghĩa hoặc thiếu ngữ cảnh được gán `Uncertain`, không gán `Neutral`.
- Không suy diễn nhãn từ điểm phiếu, khoa, học phần hoặc danh tính giảng viên.

### 7.5. Active learning và pseudo-label

Sau khi có mô hình đầu tiên:

1. Chạy dự đoán offline trên dữ liệu local đã ẩn danh.
2. Chọn cho con người rà soát các mẫu confidence thấp, gần ranh giới lớp, thuộc cụm mới hoặc có dự đoán bất đồng giữa baseline và PhoBERT.
3. Đưa nhãn đã được con người xác nhận vào tập train local của vòng sau.
4. Chỉ sử dụng pseudo-label confidence cao sau khi mô hình đã đạt yêu cầu trên test local; gắn cờ `IsPseudoLabel` và trọng số thấp hơn nhãn người gán.
5. Không đưa pseudo-label vào validation/test và không báo cáo metric trên dữ liệu tự gán nhãn.

Quy trình này giúp tăng dữ liệu đúng chỗ mà không yêu cầu gán thủ công hàng nghìn ý kiến ngay từ đầu.

## 8. Thiết kế database

Thêm bảng `OpenCommentAnalysisResults`:

| Cột | Kiểu gợi ý | Ý nghĩa |
|---|---|---|
| `SurveyResponseId` | `bigint` hoặc kiểu tương ứng | Khóa chính và khóa ngoại tới phiếu |
| `Sentiment` | chuỗi/enum | Positive, Negative, Neutral, Mixed, Uncertain |
| `Confidence` | decimal | Xác suất của kết quả chính |
| `PositiveScore` | decimal | Xác suất tích cực |
| `NegativeScore` | decimal | Xác suất tiêu cực |
| `NeutralScore` | decimal | Xác suất trung tính |
| `TopicCodesJson` | text/json | Danh sách chủ đề ở giai đoạn mở rộng |
| `ModelVersion` | string | Phiên bản mô hình |
| `ContentHash` | string | Hash nội dung đã chuẩn hóa |
| `AnalyzedAt` | datetime | Thời điểm suy luận |
| `ManualSentiment` | nullable enum | Nhãn được người có quyền hiệu chỉnh |
| `ReviewedByUserId` | nullable | Người hiệu chỉnh |
| `ReviewedAt` | nullable datetime | Thời điểm hiệu chỉnh |

Quy tắc:

- Nhãn hiển thị hiệu lực là `ManualSentiment ?? Sentiment`.
- Khi nội dung thay đổi hoặc `ModelVersion` thay đổi, bản ghi được đưa vào hàng đợi phân tích lại.
- Không sao chép nguyên văn ý kiến sang bảng kết quả; nội dung gốc vẫn nằm ở `SurveyResponses`.
- Tạo index cho `Sentiment`, `ModelVersion`, `AnalyzedAt` và khóa ngoại.

## 9. Backend và API

### 9.1. Dịch vụ suy luận

Tạo interface trong Application:

```csharp
public interface IOpenCommentClassifier
{
    Task<OpenCommentPrediction> ClassifyAsync(
        string comment,
        CancellationToken cancellationToken = default);
}
```

Implementation trong Infrastructure:

- Nạp tokenizer và `InferenceSession` một lần theo singleton.
- Không tạo lại model cho từng request.
- Hỗ trợ batch inference.
- Cấu hình đường dẫn model, version, threshold và batch size qua appsettings/environment.
- Có health check báo model đã nạp thành công hay chưa.

### 9.2. Xử lý nền

Tạo `OpenCommentAnalysisWorker`:

1. Lấy một lô ý kiến chưa có kết quả hoặc có model version cũ.
2. Chuẩn hóa và tạo content hash.
3. Chạy inference theo batch.
4. Upsert kết quả trong transaction ngắn.
5. Retry có giới hạn khi lỗi.
6. Ghi log số bản ghi thành công, lỗi, thời gian xử lý và phiên bản model; không ghi nguyên văn ý kiến vào log.

Kích hoạt worker theo hai cách:

- Đưa response mới vào hàng đợi sau khi sinh viên gửi phiếu.
- Chạy quét bù định kỳ để bảo đảm không bỏ sót.

### 9.3. Mở rộng DTO báo cáo

Thêm vào từng `OpenCommentItemDto`:

- `Sentiment`.
- `SentimentLabel` nếu cần nhãn hiển thị từ backend.
- `Confidence`.
- `TopicCodes`.
- `IsManuallyReviewed`.
- `ModelVersion` chỉ trả khi người dùng có quyền quản trị kỹ thuật.

Thêm vào `OpenCommentAnalysisReportDto`:

- Tổng số theo từng nhãn.
- Tỷ lệ theo từng nhãn.
- Số ý kiến chưa phân tích.
- Số ý kiến `Uncertain` cần xem lại.
- Tổng hợp theo chủ đề ở giai đoạn sau.

### 9.4. Endpoint

- Giữ endpoint GET hiện tại và mở rộng response để tránh tạo thêm lần gọi mạng.
- `POST /api/reports/open-comments/reanalyze`: chạy lại theo phạm vi và model version; chỉ dành cho quản trị.
- `PATCH /api/reports/open-comments/{responseId}/sentiment`: hiệu chỉnh nhãn thủ công; yêu cầu quyền phù hợp và ghi audit log.
- `GET /api/reports/open-comments/model-status`: trạng thái model và số bản ghi chờ xử lý; chỉ dành cho quản trị.

Mọi endpoint phải áp dụng lại scope hiện có trong `EfReportService`; không được để tính năng AI mở rộng phạm vi dữ liệu người dùng được xem.

## 10. Giao diện người dùng

### 10.1. Tổng quan

Trong `OpenCommentAnalysis.tsx`, bổ sung:

- KPI: Tích cực, Tiêu cực, Trung tính, Hỗn hợp, Chưa chắc chắn.
- Biểu đồ phân bố cảm xúc.
- Chú thích giải thích `Uncertain` và cảnh báo kết quả do mô hình tự động tạo.
- Hiển thị số ý kiến chưa được xử lý nếu worker chưa chạy xong.

### 10.2. Bảng ý kiến

Thêm cột **Phân loại cảm xúc**:

- Badge màu xanh: Tích cực.
- Badge màu đỏ/cam: Tiêu cực.
- Badge màu xám: Trung tính.
- Badge hai màu hoặc tím: Hỗn hợp.
- Badge viền nét đứt: Chưa chắc chắn.

Cột hỗ trợ:

- Bộ lọc kiểu Excel theo nhãn.
- Sắp xếp theo độ tin cậy.
- Tooltip hiển thị độ tin cậy.
- Không dùng màu sắc làm tín hiệu duy nhất; luôn có nhãn chữ.
- Xuất Excel gồm nhãn, độ tin cậy, trạng thái hiệu chỉnh và chủ đề.

### 10.3. Hiệu chỉnh thủ công

Trong modal chi tiết:

- Hiển thị kết quả và độ tin cậy.
- Người có quyền được chọn nhãn đúng.
- Bắt buộc xác nhận trước khi lưu.
- Hiển thị “Đã được hiệu chỉnh thủ công”.
- Ghi lịch sử thay đổi để dùng làm dữ liệu tái huấn luyện.

Không cho phép người dùng thông thường thay đổi nhãn.

## 11. Đánh giá chất lượng

### 11.1. Chỉ số

Không dùng Accuracy làm chỉ số duy nhất vì số lượng ý kiến giữa các lớp có thể mất cân bằng. Theo dõi:

- Macro F1.
- Precision, Recall và F1 của từng lớp.
- Confusion matrix.
- Recall của lớp `Negative`.
- Tỷ lệ `Uncertain`.
- Expected Calibration Error hoặc reliability diagram để hiệu chỉnh confidence.
- Thời gian inference trung bình và p95.

Mục tiêu pilot đề xuất:

- Macro F1 trên tập test tối thiểu khoảng 0,80 trước khi hiển thị rộng rãi.
- Recall lớp `Negative` được ưu tiên, nhưng không đánh đổi bằng quá nhiều false positive.
- Kiểm tra riêng các câu ngắn, phủ định, viết tắt, sai chính tả và câu hỗn hợp.

Các ngưỡng này là tiêu chí khởi đầu, cần điều chỉnh theo mức đồng thuận của người gán nhãn và dữ liệu thực tế.

### 11.2. Chia tập kiểm thử

- Giữ split chính thức của dữ liệu công khai khi có; nếu phải chia lại thì chia theo nguồn và cụm nội dung, không để câu trùng/gần trùng nằm ở nhiều tập.
- Loại bản sao trước khi chia tập và kiểm tra trùng chéo giữa UIT-VSFC, NEU-ESC và dữ liệu local.
- Báo cáo metric riêng cho từng nguồn; không chỉ báo cáo một con số trên tập dữ liệu đã trộn.
- Giữ một tập test local “đóng băng” không dùng để train, chọn threshold hoặc sửa quy tắc.
- Validation/calibration local và test local phải là hai tập tách biệt.
- Có bộ regression test gồm các câu điển hình và câu biên.

### 11.3. Kiểm thử hệ thống

- Unit test tiền xử lý và quy tắc `Mixed`/`Uncertain`.
- Test tokenizer C# tạo input tương đương pipeline Python.
- Test ONNX output gần tương đương PyTorch trong sai số cho phép.
- Integration test worker, database và scope phân quyền.
- API authorization test cho endpoint hiệu chỉnh và chạy lại.
- Frontend test lọc, KPI, export và trạng thái chưa phân tích.
- Load test với số lượng ý kiến của nhiều học kỳ.

## 12. Giám sát và vận hành

Theo dõi:

- Số ý kiến chờ phân tích.
- Tỷ lệ lỗi inference.
- Thời gian xử lý mỗi batch.
- Phân bố nhãn theo thời gian.
- Tỷ lệ `Uncertain`.
- Tỷ lệ người dùng hiệu chỉnh mô hình.
- Drift dữ liệu: từ mới, viết tắt mới hoặc phân bố nhãn thay đổi mạnh.

Không ghi nội dung ý kiến nguyên văn vào application log, telemetry hoặc thông báo lỗi.

Mỗi model artifact cần có:

- Tên và version.
- Hash tệp model.
- Version tokenizer.
- Danh sách nhãn theo đúng thứ tự output.
- Confidence threshold.
- Ngày huấn luyện.
- ID/version tập dữ liệu.
- Kết quả đánh giá.

## 13. Lộ trình triển khai

### Giai đoạn 0 — Chốt nghiệp vụ ✅ Hoàn thành

Trạng thái: **Hoàn thành ngày 20/09/2026**.

Phạm vi của giai đoạn này chỉ chốt đặc tả nghiệp vụ và tiêu chí nghiệm thu. Chưa tạo migration, chưa đọc/xuất dữ liệu production, chưa huấn luyện mô hình và chưa thay đổi luồng báo cáo đang chạy.

#### 0.1. Quyết định về bộ nhãn

Bộ nhãn phiên bản 1 được chốt gồm năm trạng thái:

| Mã | Nhãn hiển thị | Quy tắc nghiệp vụ đã chốt |
|---|---|---|
| `Positive` | Tích cực | Nội dung chủ yếu ghi nhận, khen ngợi hoặc thể hiện sự hài lòng rõ ràng |
| `Negative` | Tiêu cực | Nội dung chủ yếu phản ánh vấn đề, không hài lòng hoặc yêu cầu khắc phục một thiếu sót rõ ràng |
| `Neutral` | Trung tính | Nội dung cung cấp thông tin hoặc đề xuất nhưng không thể hiện rõ hài lòng hay không hài lòng |
| `Mixed` | Hỗn hợp | Có ít nhất một mệnh đề tích cực và một mệnh đề tiêu cực đều có ý nghĩa độc lập |
| `Uncertain` | Chưa chắc chắn | Nội dung không đủ thông tin hoặc dự đoán không đạt ngưỡng tin cậy |

Quy tắc biên:

- “Không có ý kiến”, “không”, “ok”, ký tự thử nghiệm hoặc nội dung vô nghĩa được gán `Uncertain`, không gán `Neutral`.
- Một lời đề nghị không tự động bị xem là tiêu cực. “Nên đăng tài liệu sớm hơn” là `Neutral`; “Tài liệu luôn đăng quá muộn làm sinh viên không chuẩn bị được” là `Negative`.
- Một câu khen kèm góp ý nhẹ chỉ là `Mixed` khi cả hai vế có nội dung cảm xúc rõ ràng; không gán `Mixed` chỉ vì xuất hiện từ “nhưng”.
- Nhãn phải dựa trên nội dung ý kiến, không suy ra từ điểm trung bình của phiếu, tên học phần, khoa, bộ môn hoặc giảng viên.
- Câu có dấu hiệu châm biếm, phủ định kép hoặc thiếu ngữ cảnh được ưu tiên chuyển `Uncertain` nếu confidence không đạt ngưỡng.
- Model phiên bản 1 dự đoán ba lớp gốc `Positive`, `Negative`, `Neutral`; `Mixed` và `Uncertain` được suy ra bằng quy tắc đã mô tả ở mục 6.4.

#### 0.2. Quyết định về phân quyền

Áp dụng permission thay vì kiểm tra cứng tên vai trò để tương thích hệ thống vai trò tùy chỉnh hiện có.

| Khả năng | Permission | Cấp mặc định | Phạm vi dữ liệu |
|---|---|---|---|
| Xem kết quả phân loại | Giữ `REPORTS_ACCESS` hiện có | ADMIN, SURVEY_ADMIN, DEPARTMENT_MANAGER | Theo scope hiện có trong `EfReportService` |
| Hiệu chỉnh nhãn thủ công | Thêm `OPEN_COMMENT_SENTIMENT_REVIEW` | ADMIN, SURVEY_ADMIN | Chỉ bản ghi người dùng được phép xem |
| Xem model status, chạy lại mô hình | Thêm `OPEN_COMMENT_MODEL_ADMIN` | Chỉ ADMIN | Toàn hệ thống, có audit log |
| Worker phân tích nền | Không cấp cho người dùng | Tài khoản/dịch vụ nội bộ | Theo lô do hệ thống kiểm soát |

Quyết định bổ sung:

- `DEPARTMENT_MANAGER` được xem kết quả trong bộ môn nhưng không được sửa nhãn mặc định.
- `LECTURER` không được cấp `REPORTS_ACCESS` mặc định nên không mở rộng quyền xem vì tính năng AI.
- Vai trò tùy chỉnh có thể được quản trị viên cấp hai permission mới khi có nhu cầu thực tế.
- Backend luôn kiểm tra permission và scope; việc ẩn nút ở frontend không được xem là cơ chế bảo mật.
- Mọi lần hiệu chỉnh hoặc chạy lại mô hình phải ghi audit gồm người thực hiện, thời gian, nhãn cũ, nhãn mới, model version và phạm vi thao tác.

#### 0.3. Quyết định về phạm vi thống kê

Phiên bản 1 hiển thị:

- Phân bố cảm xúc tổng thể trong học kỳ/đợt khảo sát và phạm vi người dùng đang xem.
- Tổng hợp theo khoa/viện, bộ môn và học phần.
- Cho phép lọc và xem từng ý kiến theo giảng viên như màn hiện tại.
- Cho phép lọc kết hợp, ví dụ `Negative + Khoa/Viện + Học phần`.

Phiên bản 1 không hiển thị:

- Bảng xếp hạng giảng viên tích cực/tiêu cực.
- Danh sách “giảng viên tiêu cực nhất”.
- So sánh công khai giữa các giảng viên dựa trên kết quả mô hình.
- Quyết định tự động về thi đua, đánh giá hoặc kỷ luật.

Quy tắc chống diễn giải sai:

- Khi một nhóm tổng hợp có dưới 10 ý kiến đã phân loại, không hiển thị tỷ lệ phần trăm cảm xúc của nhóm; giao diện ghi “Chưa đủ dữ liệu tổng hợp”.
- Người có quyền vẫn có thể xem các ý kiến gốc thuộc scope hiện tại; ngưỡng 10 chỉ áp dụng cho số liệu tổng hợp.
- Không gộp `Uncertain` vào `Neutral` khi tính tỷ lệ.
- KPI phải hiển thị riêng số bản ghi chưa phân tích và số bản ghi `Uncertain`.
- Mọi biểu đồ có chú thích “Kết quả phân loại tự động, cần đối chiếu nội dung gốc”.

#### 0.4. Guideline gán nhãn phiên bản 1

Quy trình gán nhãn được chốt như sau:

1. Người gán chỉ đọc nội dung đã ẩn danh, không xem điểm phiếu hoặc danh tính giảng viên.
2. Đọc toàn bộ ý kiến trước khi chọn nhãn.
3. Chọn đúng một trong năm nhãn cảm xúc.
4. Ghi cờ `NeedsAdjudication` nếu có châm biếm, từ địa phương, viết tắt khó hiểu hoặc thiếu ngữ cảnh.
5. Mỗi mẫu pilot có hai người gán độc lập.
6. Mẫu bất đồng do người thứ ba phân xử.
7. Chỉ đưa mẫu đã phân xử vào tập train chính thức.
8. Không sửa nội dung gốc; lỗi chính tả được giữ nguyên trong dữ liệu huấn luyện.

Ví dụ chuẩn dùng trong buổi hướng dẫn:

| Nội dung | Nhãn |
|---|---|
| “Giảng viên nhiệt tình, bài giảng dễ hiểu.” | `Positive` |
| “Nội dung quá nhanh và thầy ít giải đáp thắc mắc.” | `Negative` |
| “Nên bổ sung thêm một buổi thực hành.” | `Neutral` |
| “Cô hướng dẫn rất tận tâm nhưng lịch kiểm tra thay đổi quá nhiều.” | `Mixed` |
| “Không có ý kiến.” | `Uncertain` |

#### 0.5. Tiêu chí chấp nhận đã chốt

Điều kiện bắt buộc trước khi bật tính năng cho toàn bộ production:

- Macro F1 trên tập test đóng băng đạt tối thiểu `0,80`.
- Recall của lớp `Negative` đạt tối thiểu `0,80`.
- Báo cáo đầy đủ precision, recall và F1 cho từng lớp; không chỉ dùng Accuracy.
- Mức đồng thuận gán nhãn Cohen’s Kappa hoặc Krippendorff’s Alpha đạt tối thiểu `0,75` trước khi khóa tập train.
- Kết quả PyTorch và ONNX tương đương trong sai số số học đã cấu hình.
- Không có câu lệnh cập nhật hoặc xóa `SurveyResponses.AdditionalComments` trong luồng phân tích.
- Toàn bộ endpoint mới có authorization test và scope test.
- Worker chạy nền không làm p95 của API báo cáo hiện có tăng quá 10% trong bài load test đại diện.
- Feature flag mặc định tắt khi deploy schema/model lần đầu.
- Pilot được chuyên viên nghiệp vụ duyệt trước khi bật mặc định.

Ngưỡng confidence `0,65` vẫn là giá trị khởi tạo, chưa phải giá trị nghiệm thu cố định. Giai đoạn 2 phải hiệu chỉnh ngưỡng trên validation set và ghi giá trị cuối vào model metadata.

#### 0.6. Các quyết định ngoài phạm vi phiên bản 1

- Phân loại chủ đề đa nhãn chuyển sang Giai đoạn 6.
- Không sinh bản tóm tắt bằng mô hình tạo sinh trong phiên bản 1.
- Không gọi API AI công cộng hoặc gửi nội dung ý kiến ra ngoài hạ tầng do nhà trường kiểm soát.
- Không tự động dịch nội dung trước khi phân loại.
- Không dùng sentiment làm điểm số thay thế cho kết quả câu hỏi định lượng.

#### 0.7. Kết quả bàn giao Giai đoạn 0

- [x] Chốt năm nhãn cảm xúc và quy tắc biên.
- [x] Chốt permission xem, hiệu chỉnh và quản trị mô hình.
- [x] Chốt phạm vi tổng hợp và giới hạn thống kê theo giảng viên.
- [x] Hoàn thành guideline gán nhãn phiên bản 1.
- [x] Chốt tiêu chí kỹ thuật và chất lượng để nghiệm thu.
- [x] Xác nhận Giai đoạn 0 không tác động dữ liệu production.

Kết luận: **Giai đoạn 0 hoàn thành; đủ điều kiện chuyển sang Giai đoạn 1 — Dữ liệu và baseline.**

### Giai đoạn 1 — Dữ liệu và baseline

Trạng thái: **Hoàn thành phần công khai ngày 20/09/2026**; tập gold local hoãn sang đợt khảo sát sau (mục 1.8).

Thời gian dự kiến: 1–2 tuần, không còn phụ thuộc vào việc gán 2.000–5.000 nhãn local.

#### 1.1. Kiểm tra nguồn và pháp lý

- Xác minh giấy phép, điều khoản sử dụng và citation của UIT-VSFC: không có tệp LICENSE, nên chỉ dùng cho nghiên cứu/đánh giá nội bộ và làm benchmark trong miền.
- Đánh giá NEU-ESC: metadata do nhóm tác giả công bố ghi `license: apache-2.0`, có ba split công khai `train_set.csv`, `val_set.csv`, `test_set.csv`; bộ dữ liệu ở trạng thái `gated: auto` nên cần chấp nhận điều kiện truy cập và dùng token khi tải.
- Lập data card nội bộ ghi nguồn, phiên bản, checksum, schema, phân bố nhãn và quy tắc ánh xạ.
- Ghi rõ điểm chưa thống nhất: phần mô tả trong dataset card của NEU-ESC chỉ ghi "open-source license for research and educational purposes" trong khi thẻ metadata ghi `apache-2.0`; phải xác nhận với nhóm tác giả trước khi phân phối artifact phái sinh ra ngoài nhóm dự án.

#### 1.2. Chuẩn hóa dữ liệu công khai

- Tải dữ liệu vào môi trường ML tách biệt, không đưa file raw vào repository ứng dụng.
- Chuẩn hóa schema và ánh xạ về ba lớp `Positive`, `Negative`, `Neutral`.
- Loại bản sao, kiểm tra rò rỉ và lưu `DatasetSource` cho từng mẫu.
- Giữ split chính thức hoặc tạo split có thể tái lập bằng seed và manifest cố định.

#### 1.3. Baseline công khai

- Huấn luyện TF-IDF word/character n-gram với Logistic Regression và Linear SVM trên từng nguồn và trên tập trộn.
- Chạy thí nghiệm riêng có/không có NEU-ESC; không mặc định chọn tập trộn.
- Báo cáo Macro F1, F1 từng lớp, recall `Negative`, confusion matrix và kết quả theo từng nguồn.

Đã cài đặt bằng `scripts/train_baseline.py --source all`: huấn luyện ba thí nghiệm độc lập (`uit-vsfc`, `neu-esc`, `uit-vsfc+neu-esc`), mỗi thí nghiệm đánh giá trên split test của từng nguồn và trên split trộn, đồng thời loại trùng trong từng split và loại dòng dev/test trùng nội dung với tập train trước khi huấn luyện.

#### 1.4. Tập chuẩn local

- Trích xuất ẩn danh 200–400 ý kiến local nếu có thể.
- Gán nhãn kép cho test local và các mẫu biên; đo mức đồng thuận.
- Khóa riêng tập validation/calibration và tập test local.
- Đánh giá baseline công khai trên test local để đo domain gap trước khi fine-tune PhoBERT.

Thực tế đo được ngày 20/09/2026 bằng truy vấn chỉ đọc trên database local (`khaosatvmu_db`):

| Chỉ số | Giá trị |
|---|---:|
| Tổng phiếu trả lời | 6.580 |
| Phiếu có ý kiến mở | 490 |
| Phiếu có ý kiến mở và hợp lệ | 400 |
| **Số câu duy nhất (mọi phiếu)** | **459** |
| **Số câu duy nhất (chỉ phiếu hợp lệ)** | **400** |
| Số đợt khảo sát có ý kiến mở | 1 |
| Độ dài trung bình | 116 ký tự |

Hệ quả: số câu duy nhất trên tập phiếu hợp lệ đã đạt mốc **400 câu duy nhất**, đáp ứng đầy đủ mục tiêu 200–400 mẫu để phục vụ tách riêng các tập validation/calibration và test local theo kế hoạch.

Không dùng dữ liệu tổng hợp để thay thế tập local. Bịa văn bản ý kiến rồi gọi là local gold sẽ làm sai toàn bộ metric về sau và vô hiệu hoá chính tiêu chí Cohen's Kappa ở mục 0.5. Nhãn do mô hình hoặc do người phát triển tự gán cũng không được dùng làm nhãn vàng của tập test local.

#### 1.5. Điều kiện hoàn thành

Trạng thái từng điều kiện:

- [x] Có hồ sơ nguồn và giấy phép đã được xác minh cho mọi tập dữ liệu được sử dụng.
- [x] Có pipeline tiền xử lý/chia tập tái lập được và không có trùng chéo train-test đã biết.
- [x] Có baseline trên UIT-VSFC.
- [ ] Có kết quả đánh giá riêng trên tập local — **hoãn** cùng tập gold local, xem mục 1.8.
- [ ] Có test local đóng băng — **hoãn** vì dữ liệu local chỉ có 108 câu duy nhất thuộc 1 đợt.
- [x] Có quyết định có sử dụng NEU-ESC hay không dựa trên số liệu, kèm thí nghiệm đối chứng có/không có NEU-ESC đã cài đặt sẵn.

Quyết định ngày 20/09/2026: NEU-ESC được chọn làm nguồn huấn luyện cho artifact ba lớp vì có giấy phép rõ trong metadata; UIT-VSFC giữ vai trò benchmark trong miền. Vì vậy điều kiện cuối được thay bằng: phải chạy được thí nghiệm đối chứng `có/không có NEU-ESC` và báo cáo kết quả tách theo từng nguồn.

Kết quả bàn giao của giai đoạn:

- [x] data card, manifest dữ liệu, baseline, bộ regression fixture.
- [ ] tập validation/test local đóng băng và báo cáo domain gap — chuyển sang đợt khảo sát tiếp theo.

#### 1.6. Kết quả thực hiện ngày 20/09/2026

Phần đã hoàn thành:

- [x] Tạo pipeline ML độc lập tại `ml/open_comment_sentiment`; pipeline không kết nối database ứng dụng.
- [x] Tạo môi trường Python riêng và khóa dependency baseline trong `requirements.txt`.
- [x] Đối chiếu nguồn UIT chính thức và repository gốc tại commit `62ab3370b77634e5fa438b911b5f156ca41eba25`.
- [x] Tải UIT-VSFC v1.0 từ Google Drive được liên kết trên trang UIT vào thư mục local bị Git ignore.
- [x] Xác nhận ánh xạ nhãn từ README gốc: `0=Negative`, `1=Neutral`, `2=Positive`.
- [x] Audit số dòng, dữ liệu rỗng, phân bố nhãn, trùng chéo split và SHA-256 từng file.
- [x] Huấn luyện TF-IDF word/character n-gram với Logistic Regression và Linear SVM.
- [x] Lưu báo cáo máy đọc được, báo cáo Markdown và model thử nghiệm trong `ml/open_comment_sentiment/artifacts` (bị Git ignore).
- [x] Tạo công cụ `prepare_local_sample.py` để che email, URL, số điện thoại, loại trùng và lấy mẫu đa dạng từ CSV local được xuất có thẩm quyền.
- [x] Chạy 4 unit test cho ánh xạ nhãn, chuẩn hóa tiếng Việt, che thông tin trực tiếp và lấy mẫu tái lập; kết quả `4/4 passed`.

Kết quả audit UIT-VSFC:

| Split | Số mẫu | Negative | Neutral | Positive | Câu rỗng | Câu duy nhất |
|---|---:|---:|---:|---:|---:|---:|
| Train | 11.426 | 5.325 | 458 | 5.643 | 0 | 11.425 |
| Dev | 1.583 | 705 | 73 | 805 | 0 | 1.583 |
| Test | 3.166 | 1.409 | 167 | 1.590 | 0 | 3.166 |
| **Tổng** | **16.175** | **7.439** | **698** | **8.038** | **0** | — |

Không phát hiện câu trùng giữa các split sau bước chuẩn hóa hiện tại. Train có một câu trùng nội bộ. Lớp `Neutral` chỉ chiếm khoảng 4,3% toàn bộ dữ liệu, là rủi ro mất cân bằng chính.

Kết quả baseline trên split chính thức:

| Mô hình | Dev Macro F1 | Test Macro F1 | Test Accuracy | Test Recall Negative | Test F1 Negative | Test F1 Neutral | Test F1 Positive |
|---|---:|---:|---:|---:|---:|---:|---:|
| TF-IDF + Logistic Regression (OvR) | 0,7679 | 0,7434 | 0,8831 | 0,9326 | 0,9046 | 0,4106 | 0,9151 |
| TF-IDF + Linear SVM | **0,7732** | **0,7441** | **0,8951** | **0,9404** | **0,9144** | 0,3958 | **0,9222** |

Đánh giá kết quả:

- Linear SVM là baseline tốt nhất theo Test Macro F1, nhưng `0,7441` vẫn thấp hơn tiêu chí nghiệm thu `0,80`.
- Accuracy cao không phản ánh đầy đủ chất lượng vì lớp `Neutral` quá ít; F1 Neutral dưới `0,42` ở cả hai mô hình.
- Recall `Negative` đã vượt mục tiêu `0,80` trên UIT-VSFC, nhưng phải đo lại trên test local trước khi kết luận phù hợp dữ liệu của trường.
- Chưa có domain-gap report vì chưa có tập gold local; metric trên UIT-VSFC không được dùng để tuyên bố sẵn sàng production.

Trạng thái giấy phép:

- Trang UIT chính thức công khai link tải UIT-VSFC, nhưng Google Drive và repository gốc không có tệp LICENSE hoặc điều khoản tái sử dụng rõ ràng.
- Dataset và model hiện chỉ được phép dùng cho audit/nghiên cứu offline nội bộ trong phạm vi kế hoạch này.
- Không đưa dữ liệu raw, model thử nghiệm hoặc nội dung phản hồi local vào Git.
- Phải có xác nhận điều khoản sử dụng trước khi model học từ UIT-VSFC được dùng cho pilot người dùng thật hoặc production.

#### 1.7. NEU-ESC là nguồn huấn luyện có giấy phép — cập nhật 20/09/2026

Phần đã hoàn thành:

- [x] Ghim nguồn trong `config/data-sources.json`: revision `daf543ad1992153cd2be9fec3cb59aa0fc714147`, giấy phép `Apache-2.0`, trạng thái `gated: auto`, ba file split và quy tắc ánh xạ nhãn.
- [x] Đối chiếu bằng chứng giấy phép trên dataset card đúng revision: tải được `README.md` công khai, lưu SHA-256 `50305717b3b475bb808d212b96807d14d21cd4549ff37504f3ee6a5a1c429717` và trích hai câu gốc vào config; data card tự kiểm tra hash này mỗi lần sinh báo cáo.
- [x] `scripts/download_neu_esc.py` tải đúng revision, hỗ trợ `HF_TOKEN`, lưu SHA-256 từng file vào `download-manifest.json` và dừng với mã thoát `2` kèm hướng dẫn khi chưa được cấp quyền.
- [x] Loader `src/sentiment_baseline/neu_esc.py` ánh xạ `0=Neutral`, `1=Positive`, `2=Negative`, tự nhận tên cột, chuẩn hóa Unicode và bỏ qua dòng rỗng.
- [x] Nhãn `3 = Toxic` bị loại hoàn toàn khỏi corpus; loader chỉ đếm số dòng bị loại để kiểm toán, không gộp vào `Negative` và không lưu lại nội dung.
- [x] `scripts/audit_neu_esc.py` kiểm toán số dòng, phân bố nhãn, số dòng bị loại theo nhãn, trùng lặp, trùng chéo với tập train, checksum và đối chiếu `download-manifest.json`; artifact không chứa nguyên văn ý kiến.
- [x] `src/sentiment_baseline/corpus.py` dựng corpus nhiều nguồn, giữ `DatasetSource` cho từng mẫu, loại dòng trùng trong split và dòng dev/test trùng nội dung với tập train.
- [x] `scripts/train_baseline.py --source all` chạy thí nghiệm đối chứng ba nhánh, dựng đủ corpus trước khi huấn luyện để nguồn thiếu không để lại artifact dở dang, và báo cáo metric riêng theo từng nguồn.
- [x] `scripts/build_data_card.py` tạo `data-card.json` và `data-card.md` gồm giấy phép, điều kiện truy cập, ánh xạ nhãn, checksum và danh sách điều kiện còn thiếu.
- [x] `scripts/evaluate_local_gold.py` đánh giá mọi artifact đã huấn luyện thay vì hai tên file cố định.
- [x] Tạo bộ regression fixture tổng hợp `data/fixtures/regression-comments.csv` gồm 30 câu phủ câu điển hình và câu biên (phủ định, phủ định kép, châm biếm, viết tắt, không dấu, câu rỗng nghĩa, câu hỗn hợp), có cột `IsSynthetic` và `NeedsAdjudication`; script `run_regression_fixture.py` ghi mốc dự đoán để so hồi quy. Fixture chỉ dùng phát hiện hồi quy, không dùng để báo cáo metric.
- [x] Bổ sung unit test cho ánh xạ nhãn, loại `Toxic`, tên cột thay thế, BOM, lỗi schema, trùng chéo train-test, giữ `DatasetSource` và tính hợp lệ của fixture; tổng `26/26 passed`.

Kết quả baseline UIT-VSFC sau khi loại một dòng trùng nội bộ trong tập train (11.425 dòng thay vì 11.426):

| Mô hình | Test Macro F1 | Test Accuracy | Test Recall Negative | Test F1 Neutral |
|---|---:|---:|---:|---:|
| TF-IDF + Logistic Regression (OvR) | 0,7437 | 0,8834 | 0,9326 | 0,4106 |
| TF-IDF + Linear SVM | **0,7439** | **0,8948** | **0,9397** | 0,3958 |

Chênh lệch so với lần chạy trước nằm trong sai số do bỏ một dòng trùng, nên kết luận không đổi: baseline theo từng nguồn vẫn dưới tiêu chí Macro F1 `0,80`.

Điều kiện còn thiếu:

- [ ] Người có quyền chấp nhận điều kiện của NEU-ESC trên Hugging Face, rồi đăng nhập local (`huggingface-cli login` hoặc `HF_TOKEN`), sau đó chạy `download_neu_esc.py`, `audit_neu_esc.py` và `train_baseline.py --source all`. Hiện chưa có số liệu cho nhánh `neu-esc` và `uit-vsfc+neu-esc`.
- [ ] Xác nhận lại cách ghi giấy phép của NEU-ESC với nhóm tác giả trước khi phân phối artifact phái sinh ra ngoài nhóm dự án.
- [ ] Xác nhận điều khoản sử dụng UIT-VSFC nếu muốn dùng ngoài phạm vi nghiên cứu nội bộ.

#### 1.8. Quyết định đóng Giai đoạn 1 ngày 20/09/2026

Quyết định: **đóng Giai đoạn 1 theo phần công khai, hoãn tập gold local sang đợt khảo sát sau.**

Lý do: đo trực tiếp trên database local cho thấy tổng thể chỉ có 436 phiếu có ý kiến mở, **108 câu duy nhất hợp lệ** và **1 đợt khảo sát**. Cỡ mẫu này thấp hơn mục tiêu 200–400 mẫu duy nhất, nên không thể tách riêng tập calibration và tập test đóng băng; nếu vẫn làm thì kết quả domain gap sẽ không có ý nghĩa thống kê và dễ bị diễn giải sai.

Đã hoàn tất phần chuẩn bị cho local để dùng ngay khi có đợt mới:

- [x] Export read-only 436 ý kiến hiện có ra `data/raw/local/local-comments.csv` (đã gitignore; không chứa `ResponseId`, điểm phiếu, giảng viên hay sinh viên). File export cũ chỉ có 36 dòng nên đã được xuất lại cho khớp database.
- [x] Tạo mẫu ẩn danh 117 câu duy nhất tại `data/processed/local-gold-sample.csv`, có che email/URL/số điện thoại, kèm manifest ghi seed và phân bố độ dài.
- [x] Tạo review pack tại `data/processed/review/`: hai phiếu gán nhãn `annotator-a.csv`/`annotator-b.csv` đã che dự đoán của mô hình để bảo đảm hai người gán độc lập, cùng `model-screening.csv` và `review-pack-summary.json`.

Lưu ý về bộ 117 câu này:

- Đây là **toàn bộ tổng thể** chứ không phải mẫu chọn, nên không có sai số chọn mẫu, nhưng vẫn quá nhỏ để tách hai tập.
- Khi có đợt khảo sát mới, chạy lại quy trình này rồi mới khóa tập validation/calibration và test local.
- Cho đến lúc đó, mọi kết quả trên dữ liệu local chỉ là chỉ báo tham khảo, **không** được dùng làm căn cứ tuyên bố sẵn sàng production.

Quan sát sớm cần kiểm chứng (không phải kết luận): chạy hai baseline hiện có trên 117 câu local, hai mô hình đồng ý nhau 113/117 lần nhưng dự đoán tới 65 câu là `Negative` (56%) so với ở lớp `Neutral` chỉ 5 câu và `Positive` 47 câu. Tỉ lệ này lệch mạnh khỏi phân bố nhãn của UIT-VSFC và khỏi kỳ vọng của dữ liệu khảo sát thật, nên rất có thể là dấu hiệu mô hình kém hiệu lực ở miền dữ liệu của trường. Chỉ được kết luận sau khi có nhãn người gán và phân xử.

Kết luận: **phần nguồn công khai, kiểm toán nguồn, quy tắc nhãn, bộ regression fixture và pipeline thí nghiệm đối chứng của Giai đoạn 1 đã hoàn thành. Việc duy nhất cần người làm trước khi khởi động Giai đoạn 2 là chấp nhận điều kiện truy cập NEU-ESC để chạy nhánh huấn luyện có giấy phép. Tập gold local được chuyển thành việc mở, chờ đợt khảo sát tiếp theo.**

### Giai đoạn 2 — Fine-tune PhoBERT

Thời gian dự kiến: 4–7 ngày.

- Fine-tune PhoBERT trên NEU-ESC trước, vì đây là nguồn có giấy phép rõ cho artifact triển khai; chạy UIT-VSFC như nhánh benchmark trong miền có đối chứng.
- Nếu số nhãn local đủ dùng, continued fine-tuning nhẹ trên phần local dành cho train; không sử dụng test local.
- Tối ưu class weights và hyperparameter.
- Hiệu chỉnh confidence threshold.
- Xây quy tắc `Mixed` và `Uncertain`.
- So sánh với baseline.
- Xuất và xác thực ONNX.

Kết quả: model artifact v1 và model card.

### Giai đoạn 3 — Backend inference

Thời gian dự kiến: 4–6 ngày.

- Tạo migration và entity kết quả phân loại.
- Tích hợp ONNX Runtime.
- Tạo worker xử lý theo batch.
- Mở rộng report DTO và API.
- Thêm endpoint hiệu chỉnh và reanalyze.
- Thêm authorization, audit và health check.

Kết quả: backend có thể phân tích, lưu và trả kết quả đúng scope.

### Giai đoạn 4 — Giao diện báo cáo

Thời gian dự kiến: 3–5 ngày.

- Thêm KPI và biểu đồ phân bố.
- Thêm cột/badge cảm xúc.
- Thêm bộ lọc, sắp xếp và export.
- Thêm modal hiệu chỉnh thủ công.
- Hiển thị trạng thái đang xử lý hoặc chưa chắc chắn.

Kết quả: tính năng hoàn chỉnh trên màn Phân tích ý kiến mở.

### Giai đoạn 5 — Pilot và nghiệm thu

Thời gian dự kiến: 1–2 tuần.

- Chạy trên một số đợt khảo sát đã kết thúc.
- Chuyên viên đọc mẫu ngẫu nhiên và mẫu confidence thấp.
- Đo precision/recall thực tế.
- Sửa lỗi UX, threshold và guideline.
- Chỉ bật mặc định khi đạt tiêu chí chấp nhận.

Kết quả: model v1 được duyệt hoặc danh sách vấn đề phải xử lý trước khi phát hành.

### Giai đoạn 6 — Phân loại chủ đề

Thực hiện sau khi cảm xúc hoạt động ổn định:

- Chốt taxonomy chủ đề.
- Gán nhãn multi-label.
- Huấn luyện classifier chủ đề.
- Thêm biểu đồ “vấn đề được nhắc đến nhiều nhất”.
- Cho phép kết hợp bộ lọc, ví dụ: `Negative + Assessment` hoặc `Positive + TeachingMethod`.

## 14. Tiêu chí hoàn thành

Tính năng được xem là hoàn thành khi:

- Mọi ý kiến mới được phân tích nền và không làm chậm thao tác gửi phiếu.
- Kết quả được lưu cùng version mô hình và confidence.
- Người dùng chỉ thấy dữ liệu trong đúng scope.
- Bảng, KPI, biểu đồ và file Excel thống nhất số liệu.
- Có nhãn `Uncertain`, không ép mọi câu vào ba lớp.
- Có khả năng hiệu chỉnh thủ công và audit đầy đủ.
- Có thể chạy lại dữ liệu khi nâng model mà không sửa nội dung phản hồi gốc.
- Model đạt tiêu chí chất lượng đã thống nhất trên tập test đóng băng.
- Không gửi nội dung ý kiến ra dịch vụ AI bên ngoài và không ghi nội dung nhạy cảm vào log.
- Có tài liệu vận hành, model card và phương án quay lại phiên bản model trước.

## 15. Rủi ro và biện pháp giảm thiểu

| Rủi ro | Biện pháp |
|---|---|
| Dữ liệu local không đủ để huấn luyện từ đầu | Transfer learning từ UIT-VSFC; local chỉ dùng để calibration, test và active learning |
| Giấy phép dữ liệu công khai không rõ hoặc không phù hợp | Xác minh từ nguồn gốc trước khi tải/sử dụng; lưu hồ sơ giấy phép và loại nguồn chưa được phép khỏi pipeline |
| Dữ liệu công khai khác miền dữ liệu của trường | Test local đóng băng, báo cáo domain gap, continued fine-tuning và active learning |
| NEU-ESC lệch nhãn hoặc khác kiểu ngôn ngữ khảo sát | Không gộp mặc định; đánh giá riêng theo nguồn, sampling/class weight và ablation test |
| NEU-ESC là dataset gated nên không tải được nếu chưa chấp nhận điều kiện | Script tải dừng sớm với hướng dẫn, ghim revision và checksum; coi việc chấp nhận điều kiện là việc của người có quyền, không tự động hoá |
| Thẻ metadata và phần mô tả của NEU-ESC ghi giấy phép khác nhau | Ghi rõ điểm chưa thống nhất trong `config/data-sources.json` và data card; xác nhận với nhóm tác giả trước khi phân phối artifact phái sinh |
| Người gán nhãn không thống nhất | Guideline rõ, hai người gán, đo agreement, phân xử mẫu bất đồng |
| Mô hình hiểu sai câu phủ định/châm biếm | Bổ sung hard examples và regression set |
| Ý kiến hỗn hợp bị ép thành một cực | Suy luận theo câu và nhãn `Mixed` |
| Confidence cao nhưng dự đoán sai | Calibration, audit mẫu ngẫu nhiên, hiệu chỉnh thủ công |
| Model mới làm thay đổi báo cáo lịch sử | Lưu ModelVersion, cho phép reanalyze có kiểm soát |
| Tăng thời gian phản hồi API | Worker nền, batch inference, lưu cache trong database |
| Lộ nội dung phản hồi | Chạy nội bộ, ẩn danh dữ liệu huấn luyện, không log nội dung |
| Bị dùng để tự động đánh giá cá nhân | Cảnh báo UI, quy định nghiệp vụ và không tự động ra quyết định |

## 16. Khuyến nghị triển khai phiên bản đầu

Phiên bản đầu nên giới hạn ở:

1. Năm trạng thái `Positive`, `Negative`, `Neutral`, `Mixed`, `Uncertain`.
2. PhoBERT fine-tune ngoại tuyến và ONNX Runtime chạy trong backend .NET.
3. Worker nền và bảng lưu kết quả có version.
4. KPI, biểu đồ phân bố, cột cảm xúc, bộ lọc và Excel.
5. Hiệu chỉnh thủ công để thu thập nhãn chất lượng cao.

Không nên triển khai đồng thời phân loại cảm xúc, hàng chục chủ đề và sinh tóm tắt bằng mô hình tạo sinh trong phiên bản đầu. Hoàn thiện cảm xúc và quy trình đánh giá trước sẽ giảm rủi ro kỹ thuật, rủi ro diễn giải và chi phí vận hành.
