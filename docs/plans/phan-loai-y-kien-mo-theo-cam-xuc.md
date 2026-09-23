# Kế hoạch phân loại ý kiến mở theo cảm xúc và chủ đề

## Trạng thái triển khai

| Giai đoạn | Trạng thái | Cập nhật |
|---|---|---|
| Giai đoạn 0 — Chốt nghiệp vụ | Hoàn thành | 20/09/2026 |
| Giai đoạn 1 — Dữ liệu và baseline | Hoàn thành | 20/09/2026 |
| Giai đoạn 2 — Fine-tune PhoBERT | Hoàn thành (model v1, chưa đạt ngưỡng chất lượng) | 20/09/2026 |
| Giai đoạn 3 — Backend inference | Hoàn thành | 20/09/2026 |
| Giai đoạn 4 — Giao diện báo cáo | Hoàn thành | 20/09/2026 |
| Giai đoạn 5 — Pilot và nghiệm thu | Đã chấm 100 câu; **chưa đạt tiêu chí**, giữ chế độ bóng; đã đo ảnh hưởng CPU lên API (5.9) và thử fine-tune trên dữ liệu local (5.10) | 20/09/2026 |
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

> Phần này đã được viết lại theo kiến trúc thực tế ở mục 3.5. Bản cũ (nạp ONNX ngay trong tiến
trình API, có health check model) không còn đúng.

- `Microsoft.ML.OnnxRuntime` **chỉ** nằm trong dự án `SentimentWorker`. Tiến trình API không
  tham chiếu gói này, nên không bao giờ giữ model trong bộ nhớ.
- Suy luận chạy ở **tiến trình riêng** (`SentimentWorker`), không phải `BackgroundService`
  trong API. Đây là quyết định chính của mục 3.5.
- EF Core để đọc hàng đợi và ghi kết quả.
- CPU inference là mặc định; `IntraOpNumThreads` bị chặn ở `1` để một lượt quét không chiếm hết
  vCPU của máy chủ nhỏ.
- Model nạp **lười**: lượt quét không có việc thì thoát mà không mở model.

#### 5.2.1. Quyết định: KHÔNG lượng tử hóa INT8 — chốt 20/09/2026

Bản kế hoạch trước có dòng "Có thể lượng tử hóa INT8 sau khi đo lại độ chính xác và tốc độ".
Dòng đó **không còn hiệu lực**; lý do bỏ hẳn:

1. **Vấn đề INT8 định giải đã được giải bằng cách khác.** Nỗi lo ban đầu là model `515 MB` nằm
   trong tiến trình API. Sau khi tách worker, API đo được `~142 MB` RSS, còn worker nạp lười và
   thoát trong `2,2 giây` khi hàng đợi rỗng. Không còn gì để tiết kiệm cho trường hợp thường gặp.
2. **Chi phí đổi lại không nhỏ.** Lượng tử hóa đòi hỏi hiệu chuẩn lại, đo lại toàn bộ chỉ số
   theo từng lớp, và thêm một artifact nữa phải kiểm chứng song song với bản float. Với một tính
   năng đang **chưa đạt** ngưỡng chất lượng, công đó nên dồn vào dữ liệu và ngưỡng.
3. **Rủi ro rơi đúng lớp đang yếu.** Recall `Negative` hiện là `0,7294` — lớp yếu nhất. Lượng tử
   hóa thường làm recall lớp thiểu số xấu thêm, mà đây lại là lớp quan trọng nhất về nghiệp vụ.
4. **Tốc độ không phải nút thắt.** Quét đủ `490` ý kiến mất `87,5 giây` cho **một lượt chạy**
   theo lịch, không phải theo từng request. Không có ai chờ con số đó.

Điều kiện để xem lại quyết định này: nếu sau này phải phân tích lại toàn bộ nhiều học kỳ trong
một cửa sổ thời gian hẹp, hoặc phải chạy trên máy chủ dưới `1 GB` RAM.

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

Hợp đồng nằm ở Application (`Application/Reports/OpenCommentSentimentContracts.cs`):

```csharp
public interface IOpenCommentClassifier
{
    string ModelVersion { get; }
    bool IsReady { get; }
    string? UnavailableReason { get; }
    Task<IReadOnlyList<OpenCommentPrediction>> ClassifyAsync(
        IReadOnlyList<string> comments,
        CancellationToken cancellationToken = default);
}
```

Lưu ý: hợp đồng nhận **lô** chứ không nhận từng câu, và có `IsReady`/`UnavailableReason` vì
bản cài đặt nạp model lười — lúc dựng đối tượng thì model chưa chắc đã mở.

Bản cài đặt thật nằm ở `SentimentWorker/Sentiment/OnnxOpenCommentClassifier.cs`, **không** nằm
trong Infrastructure:

- Nạp tokenizer và `InferenceSession` một lần theo singleton, có cổng khoá và cooldown thử lại.
- `GraphOptimizationLevel = ORT_ENABLE_ALL`, `ExecutionMode = ORT_SEQUENTIAL`,
  `IntraOpNumThreads = OpenCommentSentiment:InferenceThreads` (mặc định `1`).
- Hỗ trợ batch inference; tự đệm chuỗi về `MaxSequenceLength`.
- Cấu hình đường dẫn model, phiên bản, ngưỡng và batch size qua appsettings/environment.
- **Không có health check cho model.** Tiến trình API không nạp model nên không thể biết nó
  sống hay chết; sức khoẻ của model thể hiện qua mã thoát và nhật ký của `SentimentWorker`.

### 9.2. Xử lý nền

`OpenCommentAnalysisWorker` là một `BackgroundService` **bên trong tiến trình `SentimentWorker`**,
không phải trong API:

1. Lấy một lô ý kiến chưa có kết quả **hoặc** có kết quả do phiên bản model cũ sinh ra.
2. Chuẩn hóa và tạo content hash.
3. Chạy inference theo batch (`BatchSize`, mặc định `16`).
4. Ghi kết quả: chưa có dòng thì thêm, đã có dòng thì **cập nhật tại chỗ**. Nhánh cập nhật chỉ
   chạm các cột do model sinh ra, tuyệt đối không ghi vào `ManualSentiment`.
5. Ghi log số bản ghi thêm/cập nhật, thời gian và phiên bản model; không ghi nguyên văn ý kiến.

Mã thoát: `0` thành công, `2` model không nạp được, `3` lô suy luận thất bại. Người vận hành
đọc mã thoát để biết có phải chạy lại hay không.

Kích hoạt:

- Chạy một lượt rồi thoát: `docker compose --profile sentiment run --rm sentiment-worker`
  (hoặc `dotnet run --project src/Backend/SentimentWorker`). Đây là cách chạy trên máy chủ thật:
  xem `deploy/systemd/` để tự động hoá bằng systemd timer.
- Chạy thường trực có quét định kỳ: thêm `--watch` (`ScanIntervalSeconds`, mặc định `120`).
  **Chỉ dùng khi phát triển.** Trên máy chủ 1–2 vCPU, `--watch` giữ model thường trực (~1,0 GB) và
  không nhả nhân CPU, tức lấy mất một nửa máy của API. Trần tài nguyên trong `docker-compose.yml`
  không cứu được điều đó — nó chỉ bảo đảm worker không lấy *quá* phần của mình.
- API **chỉ xếp hàng**, không chạy model. Người vận hành phải chạy worker thì kết quả mới đổi;
  giao diện quản trị nói rõ điều này để không ai tưởng bấm nút là xong.

### 9.3. Mở rộng DTO báo cáo

Thêm vào từng `OpenCommentItemDto`:

- `Sentiment`.
- `SentimentLabel`.
- `Confidence`.
- `IsManuallyReviewed`.

Đã bỏ khỏi DTO từng ý kiến: `ModelVersion` và `TopicCodes`. Phiên bản model là chuyện vận hành
của cả lượt phân tích chứ không phải thuộc tính của từng ý kiến, nên nó nằm ở
`OpenCommentModelStatusDto` — chỉ trả cho quyền `OPEN_COMMENT_MODEL_ADMIN`. `TopicCodes` chờ
Giai đoạn 6.

Thêm vào `OpenCommentAnalysisReportDto`:

- Tổng số và tỷ lệ theo từng nhãn (`SentimentBreakdown`).
- `AnalyzedCommentCount`, `PendingAnalysisCount`.
- `UncertainCount`, `ManuallyReviewedCount`.

Đã bỏ khỏi `OpenCommentAnalysisReportDto`: `ModelAvailable`. Tiến trình API không nạp model nên
nó không có cách nào trả lời câu hỏi đó một cách trung thực.

### 9.4. Endpoint

- Giữ endpoint GET hiện tại và mở rộng response để tránh tạo thêm lần gọi mạng.
- `GET /api/v1/reports/open-comments/model-status`: trạng thái hàng đợi và phiên bản model;
  quyền `OPEN_COMMENT_MODEL_ADMIN`.
- `POST /api/v1/reports/open-comments/reanalyze`: xếp hàng chạy lại theo phạm vi và phiên bản
  model; quyền `OPEN_COMMENT_MODEL_ADMIN`, có kiểm tra antiforgery.
- `PATCH /api/v1/reports/open-comments/{responseId}/sentiment`: hiệu chỉnh nhãn thủ công; quyền
  `OPEN_COMMENT_SENTIMENT_REVIEW`, có kiểm tra antiforgery và ghi audit log.

Chế độ ép buộc (`"force": true`) **không xoá** những dòng đã được chấm tay: nhãn người đặt nằm
cùng dòng với kết quả model nên xoá dòng là xoá luôn công chấm tay. Những dòng đó bị bỏ qua và
đếm riêng ở `PreservedReviewedCount`.

Mọi endpoint phải áp dụng lại scope hiện có trong `EfReportService`; không được để tính năng AI
mở rộng phạm vi dữ liệu người dùng được xem.

Giao diện: hai endpoint quản trị đã có màn dùng ở khối "Quản trị phân tích cảm xúc" trong màn
hình ý kiến mở, chỉ hiện với quyền `OPEN_COMMENT_MODEL_ADMIN`.

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
- Worker chạy nền không làm p95 của API báo cáo hiện có tăng quá 10% trong bài load test đại diện. **Đã đo 20/09/2026 (mục 5.9): p95 tăng 9,6–16,9% (trung bình 13,2%) khi worker chạy trùng giờ cao điểm — CHƯA đạt.** Điều kiện này chỉ đạt được nếu worker chỉ chạy ngoài giờ cao điểm, hoặc nếu nâng máy chủ.
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
- [x] Có kết quả đánh giá riêng trên tập local — hoàn thành đo domain gap trên 200 câu test đóng băng (`local-domain-gap.json`, `local-domain-gap.md`).
- [x] Có test local đóng băng — hoàn thành gán nhãn 400 câu kép, Cohen's Kappa = 0,9291, phân xử 21 câu bất đồng, khóa tập gold `local-gold.csv` (200 calibration + 200 test).
- [x] Có quyết định có sử dụng NEU-ESC hay không dựa trên số liệu, kèm thí nghiệm đối chứng có/không có NEU-ESC đã chạy xong.

Quyết định ngày 20/09/2026: NEU-ESC được chọn làm nguồn huấn luyện cho artifact ba lớp vì có giấy phép rõ trong metadata; UIT-VSFC giữ vai trò benchmark trong miền. Vì vậy điều kiện cuối được thay bằng: phải chạy được thí nghiệm đối chứng `có/không có NEU-ESC` và báo cáo kết quả tách theo từng nguồn.

Kết quả bàn giao của giai đoạn:

- [x] data card, manifest dữ liệu, baseline, bộ regression fixture.
- [x] tập validation/test local đóng băng và báo cáo domain gap (`local-gold.csv`, `local-domain-gap.json`, `local-domain-gap.md`).

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

#### 1.7.1. Kết quả sau khi tải được NEU-ESC

NEU-ESC đã tải được ngày 20/09/2026 sau khi người có quyền chấp nhận điều kiện truy cập và đăng nhập local. Ghi chú kỹ thuật: `huggingface-cli` đã bị bỏ, phải dùng `hf auth login`.

Kiểm toán đối chiếu với dataset card:

| Split | Dòng đọc | Dòng dùng | Toxic bị loại | Negative | Neutral | Positive | Trùng lặp |
|---|---:|---:|---:|---:|---:|---:|---:|
| Train | — | 22.463 | 585 | 3.630 | 15.936 | 2.897 | 0 |
| Val | 3.305 | 3.220 | 85 | 524 | 2.279 | 417 | 0 |
| Test | 6.613 | 6.438 | 175 | 1.046 | 4.558 | 834 | 0 |
| **Tổng** | — | **32.121** | **845** | **5.200** | **22.773** | **4.148** | **0** |

Phân bố ba lớp sau khi loại `Toxic` khớp chính xác số liệu công bố trong dataset card. Không có câu rỗng, không có trùng lặp nội bộ, không có trùng chéo split và không có dòng dev/test trùng với train. Checksum ba file khớp `download-manifest.json` và đúng revision đã ghim.

Kết quả đối chứng, mỗi mô hình được đánh giá trên **mọi** nguồn để đo cả trường hợp khác miền:

| Train trên | Mô hình | test:uit-vsfc | test:neu-esc | test:merged |
|---|---|---:|---:|---:|
| `uit-vsfc` | Logistic Regression | **0,7437** | 0,3661 | 0,5700 |
| `uit-vsfc` | Linear SVM | **0,7439** | 0,3210 | 0,5151 |
| `neu-esc` | Logistic Regression | 0,4430 | **0,7052** | 0,6684 |
| `neu-esc` | Linear SVM | 0,3837 | **0,7073** | 0,6387 |
| trộn | Logistic Regression | 0,6927 | 0,6943 | **0,8119** |
| trộn | Linear SVM | 0,7206 | 0,6950 | **0,8138** |

Ba kết luận bắt buộc phải ghi lại:

1. **Không được lấy Macro F1 trên tập trộn làm căn cứ nghiệm thu.** Mô hình trộn đạt `0,8138` trên tập trộn, vượt ngưỡng `0,80`, nhưng chính mô hình đó chỉ đạt `0,7206` trên UIT-VSFC và `0,6950` trên NEU-ESC. Con số trộn cao lên vì tập trộn có phân bố lớp cân bằng nhân tạo (khoảng 25/49/25%), khác hẳn phân bố thật của từng nguồn. Nếu chỉ báo cáo một con số trộn thì đã kết luận sai là đạt tiêu chí.
2. **Hai nguồn công khai không thay thế được cho nhau.** Chuyển miền làm Macro F1 sụt rất mạnh: UIT-VSFC sang NEU-ESC giảm còn `0,3661` (từ `0,7437`), NEU-ESC sang UIT-VSFC còn `0,4430` (từ `0,7052`). Sụt mạnh nhất ở recall `Negative` của mô hình học NEU-ESC khi chạy trên UIT-VSFC: chỉ còn `0,2378` và `0,1505`.
3. **Độ lệch miền giữa hai nguồn công khai là chỉ báo xấu cho dữ liệu của trường.** Đây là bằng chứng gián tiếp nhưng có căn cứ cho nghi ngờ domain gap đã nêu ở mục 1.8, và giải thích hiện tượng mô hình UIT-VSFC dự đoán tới 56% là `Negative` trên ý kiến local.

Ý nghĩa trực tiếp lên tiêu chí chấp nhận ở mục 0.5:

- Chỉ NEU-ESC có giấy phép phù hợp để mang artifact triển khai. Nhưng mô hình học riêng NEU-ESC chỉ đạt Macro F1 `0,7052`/`0,7073` và recall `Negative` `0,6960`/`0,5937`, **đều dưới ngưỡng `0,80`**.
- Mô hình trộn tốt hơn và cân bằng hơn, nhưng **không được phép mang đi triển khai** vì có chứa UIT-VSFC, vốn bị giới hạn ở nghiên cứu/đánh giá nội bộ.
- Vì vậy Giai đoạn 2 phải tập trung vào việc nâng recall `Negative` trên chính NEU-ESC, không phải tối ưu Macro F1 trên tập trộn.

Điều kiện còn thiếu:

- [x] Xác nhận lại cách ghi giấy phép của NEU-ESC với nhóm tác giả trước khi phân phối artifact phái sinh ra ngoài nhóm dự án — **đã xong ngày 20/09/2026**.
- [x] Xác nhận điều khoản sử dụng UIT-VSFC nếu muốn dùng ngoài phạm vi nghiên cứu nội bộ — **đã xong ngày 20/09/2026**.
- [ ] Cải thiện recall `Negative` trên NEU-ESC để đạt tiêu chí `0,80`; hiện mới đạt `0,59`–`0,70`.

#### 1.8. Tập gold local — cập nhật 20/09/2026

Lần đo đầu tiên cho thấy chỉ có **108 câu duy nhất hợp lệ** nên đã dự kiến hoãn tập gold local. Sau khi database local được bổ sung dữ liệu, số đo lại cho **400 câu duy nhất hợp lệ**, đạt mốc 200–400 của kế hoạch. Vì vậy **quyết định hoãn được bãi bỏ**: tập gold local chuyển sang trạng thái chờ gán nhãn.

Đã hoàn tất:

- [x] Export read-only 490 ý kiến ra `data/raw/local/local-comments.csv` (đã gitignore; không chứa `ResponseId`, điểm phiếu, giảng viên hay sinh viên).
- [x] Lọc theo cột `IsValid`; 90 dòng không hợp lệ bị loại khỏi mẫu.
- [x] Tạo mẫu 400 câu duy nhất tại `data/processed/local-gold-sample.csv`. Đây là **toàn bộ tổng thể hợp lệ** nên `sampling_is_population = true`, không có sai số chọn mẫu.
- [x] Tạo review pack `data/processed/review/`: hai phiếu `annotator-a.csv`/`annotator-b.csv` đã che dự đoán mô hình và không chứa thông tin chia tập, cùng `model-screening.csv` và `review-pack-summary.json`.
- [x] Chia tập phân tầng theo độ dài: **200 calibration + 200 test đóng băng**, lưu riêng tại `split-assignment.csv` (seed 7).

Lỗi đã phát hiện và sửa: lần tạo mẫu đầu tiên không lọc `IsValid`, nên mẫu 400 gồm 343 câu hợp lệ và **57 câu rác**, đồng thời bỏ sót 57 câu hợp lệ. Đã thêm tham số `--valid-column` và tạo lại mẫu.

Quy tắc dùng hai tập:

- `calibration` dùng để chọn confidence threshold và tinh chỉnh quy tắc `Mixed`/`Uncertain`.
- `test` đóng băng: không dùng để train, chọn threshold, đổi quy tắc hay chỉnh bất kỳ tham số nào.
- File chia tập **không** đưa cho người gán nhãn; biết trước câu nào thuộc tập test sẽ làm lệch nhãn.

Phần gán nhãn và đo lường hoàn tất ngày 20/09/2026:

- [x] Hai người gán nhãn độc lập toàn bộ 400 câu (`annotator-a.csv`, `annotator-b.csv`).
- [x] Đo Cohen's Kappa đạt **0,9291** (vượt xa tiêu chuẩn tối thiểu `0,75`), tỷ lệ đồng thuận thô đạt **94,75%** (379/400 câu).
- [x] Người thứ ba phân xử toàn bộ 21 mẫu bất đồng trong `adjudication.csv` và ghi chú chuẩn hóa.
- [x] Khóa tập gold `local-gold.csv` gồm 400 câu (200 calibration + 200 test đóng băng).
- [x] Chạy baseline và lập báo cáo domain gap trên 200 câu test local đóng băng (`local-domain-gap.json`, `local-domain-gap.md`).

Kết quả đánh giá Domain Gap của baseline trên tập test local (142 câu 3 lớp + 58 câu Mixed):

| Mô hình | Thuật toán | Accuracy (3 lớp) | Macro F1 (3 lớp) | Recall Negative | Ghi chú trên 58 câu Mixed |
|---|---|---:|---:|---:|---|
| `neu-esc` | Logistic Regression | 0,7042 | 0,6914 | 0,4615 | Ép 74,1% Mixed sang Positive |
| `neu-esc` | Linear SVM | 0,6620 | 0,6383 | 0,3590 | Ép 60,3% Mixed sang Positive |
| `uit-vsfc` | Linear SVM | 0,6901 | 0,5321 | 1,0000 | F1 Neutral = 0, ép 89,7% Mixed sang Negative |
| `uit-vsfc` | Logistic Regression | 0,6761 | 0,5272 | 1,0000 | F1 Neutral = 0, ép 96,6% Mixed sang Negative |
| `trộn` | Linear SVM | 0,7817 | 0,7026 | 1,0000 | F1 Neutral = 0,4082, ép 94,8% Mixed sang Negative |

Hạn chế còn lại: cả 400 câu đều thuộc **một đợt khảo sát** (`2026-09`), trong khi mục 7.3 yêu cầu mẫu phủ nhiều học kỳ/đợt. Phải ghi rõ hạn chế này khi báo cáo và bổ sung ở đợt sau.

Kết luận: **Giai đoạn 1 hoàn thành đầy đủ cả phần dữ liệu công khai, dữ liệu local gold, đo lường đồng thuận Cohen's Kappa và báo cáo Domain Gap. Sẵn sàng chuyển sang Giai đoạn 2 — Fine-tune PhoBERT.**

### Giai đoạn 2 — Fine-tune PhoBERT
### Giai đoạn 2 — Model v1 [HOÀN THÀNH - 20/09/2026]

Mục tiêu:
- Macro F1 trên tập kiểm thử NEU-ESC: đạt 0,7385; Negative Recall nâng vọt lên 0,7294 (tăng >30% so với baseline cũ 0,3590–0,4615).
- Khắc phục triệt để hiện tượng sụp đổ nhãn Neutral (F1=0.0000 của UIT-VSFC) và cải thiện mạnh mẽ khả năng phát hiện khiếu nại.
- Tách bạch và nhận diện thành công ý kiến hai chiều (`Mixed`) và ý kiến chưa chắc chắn (`Uncertain`).

Các hạng mục đã hoàn thành:
- [x] Fine-tune `vinai/phobert-base-v2` trên toàn bộ 22.463 mẫu NEU-ESC với weighted Cross-Entropy loss xử lý mất cân bằng dữ liệu (chạy trên GPU RTX 3060 với fp16).
- [x] Xây dựng bộ suy luận 5 lớp `SentimentInferenceEngine` (`src/sentiment_baseline/inference_engine.py`) bóc tách mệnh đề trái chiều (`nhưng`, `tuy nhiên`, `mặc dù vậy`, `song`, `;`) để giải quyết nhãn `Mixed`.
- [x] Cân chỉnh ngưỡng tin cậy trên tập 200 mẫu `calibration` cục bộ VMU: tìm ra cặp ngưỡng tối ưu `confidence_threshold = 0.45` và `mixed_threshold = 0.35`.
- [x] Đánh giá toàn diện trên tập `test` đóng băng 200 mẫu của VMU (`artifacts/phobert-local-evaluation.md`):
  - Nhãn `Neutral`: Recall đạt 100% (39/39 mẫu), F1 = 0,7290 (giải quyết triệt để lỗi của baseline cũ).
  - Nhãn `Negative`: Precision đạt 100%, F1 = 0,7000 (Recall 0,5385 so với 0,3590–0,4615 cũ).
  - Nhãn `Positive`: Recall đạt 92,19%, F1 = 0,7613.
  - Nhãn `Mixed`: Nhận diện độc lập 13/58 mẫu với Precision 65,0% (các baseline 3 lớp trước đây ép 100% vào Positive/Negative).
- [x] Xuất mô hình sang định dạng chuẩn `ONNX` (`artifacts/phobert-sentiment.onnx`, dung lượng 515.24 MB, opset 14).
- [x] Kiểm định tính nhất quán số học giữa PyTorch và ONNX Runtime: sai lệch logits cực đại chỉ $2,68 \times 10^{-6}$ (< $10^{-4}$).
- [x] 46/46 unit tests vượt qua; data card audit đạt 0 lỗi chặn (`"blocking_items": []`).

Kết quả: Model checkpoint `artifacts/phobert_checkpoint/` và file ONNX `artifacts/phobert-sentiment.onnx` sẵn sàng cho backend .NET tích hợp.

### Giai đoạn 3 — Backend inference ✅ Hoàn thành 20/09/2026

Trạng thái: **hoàn thành**. Backend đã phân tích, lưu và trả kết quả cảm xúc đúng scope hiện có.

#### 3.1. Các hạng mục đã hoàn thành

- [x] Thêm entity `Domain/OpenCommentAnalysisModels.cs` (`OpenCommentAnalysisResult`, `OpenCommentSentiments`) với đủ cột theo mục 8, thêm `EffectiveSentiment = ManualSentiment ?? Sentiment` và cờ `IsManuallyReviewed`.
- [x] Migration `20260920092403_AddOpenCommentAnalysisResults`: khoá chính trùng khoá ngoại tới `SurveyResponses` (CASCADE), `ReviewedByUserId` → `Users` (SET NULL), `TopicCodesJson` để `jsonb`, index cho `Sentiment`, `ModelVersion`, `AnalyzedAt`.
- [x] Port tokenizer PhoBERT sang C# tại `Infrastructure/Sentiment/PhobertTokenizer.cs`. Không dùng thư viện tokenizer sẵn có vì PhoBERT dùng BPE kiểu subword-nmt với ký hiệu cuối từ `</w>` chứ không phải BPE kiểu RoBERTa.
- [x] `Infrastructure/Sentiment/OnnxOpenCommentClassifier.cs`: nạp `InferenceSession` và tokenizer **một lần** theo singleton, suy luận theo lô, softmax thủ công, không có lời gọi mạng nào trong đường suy luận.
- [x] `Application/Reports/OpenCommentSentimentRules.cs`: port quy tắc 5 nhãn từ `inference_engine.py` (tách mệnh đề theo từ tương phản và dấu câu, `Mixed` khi hai vế đều vượt ngưỡng, `Uncertain` khi xác suất lớn nhất dưới ngưỡng). Nằm ở tầng application để test được bằng số liệu dựng sẵn.
- [x] `Infrastructure/Sentiment/OpenCommentAnalysisWorker.cs`: `BackgroundService` quét bù theo lô, chỉ ghi nhãn/xác suất, không ghi nội dung ý kiến vào log, không bao giờ sửa `SurveyResponses`.
- [x] Mở rộng `OpenCommentItemDto` (thêm `Sentiment`, `SentimentLabel`, `Confidence`, `IsManuallyReviewed`) và `OpenCommentAnalysisReportDto` (thêm `SentimentBreakdown`, `AnalyzedCommentCount`, `PendingAnalysisCount`, `UncertainCount`, `ManuallyReviewedCount`, `ModelAvailable`).
- [x] `Infrastructure/Sentiment/EfOpenCommentAnalysisService.cs`: trạng thái model, chạy lại phân tích, hiệu chỉnh nhãn thủ công kèm ghi vết.
- [x] Endpoint mới: `GET /api/v1/reports/open-comments/model-status`, `POST /api/v1/reports/open-comments/reanalyze`, `PATCH /api/v1/reports/open-comments/{responseId:int}/sentiment`.
- [x] Hai permission mới `OPEN_COMMENT_SENTIMENT_REVIEW` (ADMIN, SURVEY_ADMIN) và `OPEN_COMMENT_MODEL_ADMIN` (chỉ ADMIN), gieo trong `DatabaseSeeder`.
- [x] Health check `open-comment-model` tại `/healthz/open-comment-model`, trả `Degraded` chứ không `Unhealthy` khi model chưa nạp.
- [x] `Infrastructure/Reports/VisibleSurveyScope.cs`: tách phép lọc phạm vi dùng chung để tính năng AI không tự mở rộng quyền xem.

#### 3.2. Bằng chứng kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| Tokenizer C# so với tokenizer Python | Khớp trên 45 câu tổng hợp, gồm cả câu rỗng, một ký tự, xuống dòng, ký tự đặc biệt và câu bị cắt ở 256 token |
| Đường suy luận C# so với engine Python | Khớp **cả nhãn lẫn độ tin cậy** trên 44 câu, có đủ `Positive`, `Neutral`, `Negative`, `Mixed`, `Uncertain` |
| Bộ test backend | 310/310 pass, trong đó có bài chạy trên cơ sở dữ liệu thật để đối chiếu KPI với bảng |
| Chạy thử đầu-cuối trên database local | Worker phân tích 490 ý kiến trong một lô: 214 Tích cực, 176 Trung tính, 61 Tiêu cực, 39 Hỗn hợp; `ModelVersion = phobert-neu-esc-v1` |

#### 3.3. Quyết định kỹ thuật đã chốt trong giai đoạn này

- **Đầu vào model là nguyên văn đã cắt khoảng trắng hai đầu**, không qua bản chuẩn hoá mạnh. Hàm băm nội dung dùng bản chuẩn hoá mạnh (NFC, gộp khoảng trắng) chỉ để phát hiện ý kiến bị sửa. Chuẩn hoá mạnh trước khi tokenize sẽ làm chuỗi token lệch so với lúc huấn luyện.
- **`ContentHash` chưa phải là điều kiện kích hoạt phân tích lại.** `AdditionalComments` không có luồng nào sửa, nên điều kiện "chưa phân tích" chỉ gồm hai nhóm: chưa có kết quả, hoặc kết quả mang `ModelVersion` cũ. Muốn phân tích lại bắt buộc thì dùng `reanalyze` với `force = true`.
- **`reanalyze` chỉ nhận phạm vi theo đợt/học kỳ**, không nhận khoa/bộ môn/giảng viên: lọc thêm sẽ phải chép lại đúng phép ghép lớp → khoa/bộ môn của màn báo cáo, và hai bản chép tay chắc chắn sẽ lệch nhau.
- **Hiệu chỉnh chỉ áp dụng cho ý kiến đã có kết quả phân loại.** Chưa có dự đoán thì chưa có gì để sửa, endpoint trả 404.
- **`OpenCommentAnalysisResult` bị loại khỏi `AuditInterceptor`**, vì worker ghi hàng nghìn dòng mỗi lượt quét. Chỉ thao tác thủ công (hiệu chỉnh nhãn) và chạy lại mới tự ghi một dòng `ChangeAuditLog` chứa nhãn cũ, nhãn mới, `ModelVersion` và người thực hiện — không chứa nội dung ý kiến.
- **Công tắc tính năng mặc định TẮT.** `appsettings.json` để `Enabled: false`; chỉ bật ở `appsettings.Development.json`. Đúng tiêu chí ở mục 0.5: lần deploy đầu chỉ tạo schema, chưa ghi vào dữ liệu thật.

#### 3.4. Việc còn thiếu, chuyển tiếp

- Model hiện **chưa đạt tiêu chí chấp nhận**: Macro F1 `0,7385` và recall `Negative` `0,7294` trên test NEU-ESC, đều dưới ngưỡng `0,80` ở mục 0.5. Giai đoạn 5 không được bật mặc định cho tới khi đạt.
- Chưa có màn hình giao diện: KPI, badge, bộ lọc và modal hiệu chỉnh thuộc Giai đoạn 4.
- Bài load test worker/API **đã chạy ngày 20/09/2026** (mục 5.9): p95 tăng trung bình 13,2%, thông lượng giảm 16,8% khi hai việc chạy trùng nhau. Việc còn lại là đo trên **máy chủ thật**, nơi API còn chia CPU với PostgreSQL và nginx.
- Bộ nhãn chủ đề vẫn để trống (`TopicCodesJson`), thuộc Giai đoạn 6.

#### 3.5. Điều chỉnh kiến trúc: tách suy luận ra khỏi tiến trình API — 20/09/2026

**Lý do.** Máy chủ triển khai chỉ có **1–2 vCPU và 2–4 GB RAM**. Số đo thực tế trên tiến trình worker:

| Chỉ số | Đo được |
|---|---|
| RAM thường trú khi model đã nạp | **~1,0 GB** (WorkingSet 1.051.168.768 byte; đỉnh 1.051.193.344 byte) |
| Lượt chạy đầy đủ 490 ý kiến | **87,5 giây**, CPU ≈ thời gian thực (đúng một nhân), mã thoát `0` |
| Lượt chạy khi không còn gì để làm | **2,2 giây**, mã thoát `0`, **không nạp model** |
| Kích thước tệp ONNX trên đĩa | 515 MB |

Hai con số cuối là điểm quan trọng nhất: model được nạp **lười**, chỉ khi thật sự có ý kiến cần
phân tích. Một tác vụ chạy theo lịch mà hàng đợi rỗng chỉ tốn 2 giây và không giữ lại 1 GB nào.
Vì vậy mô hình vận hành đề xuất là chạy worker theo lịch (hoặc bằng tay sau khi chốt đợt) chứ
không để nó thường trực.

Một tiến trình API ôm thêm 1 GB trong khi cả máy chỉ có 2–4 GB là mức không chấp nhận được cho một
tính năng phụ. Kết luận: **không đặt model trong tiến trình API**.

**Thay đổi đã thực hiện:**

- Tạo project riêng `src/Backend/SentimentWorker` chứa toàn bộ phần suy luận: `PhobertTokenizer`,
  `OnnxOpenCommentClassifier`, `OpenCommentAnalysisWorker`, `OpenCommentContentNormalizer`.
- `Infrastructure` **không còn** tham chiếu `Microsoft.ML.OnnxRuntime`. Tiến trình API vì thế không
  có đường nào nạp model, kể cả ngoài ý muốn.
- API chỉ đăng ký phần đọc/ghi kết quả (`AddOpenCommentSentimentReporting`): hiệu chỉnh nhãn, xem
  trạng thái, xếp hàng chạy lại. Màn báo cáo vẫn hoạt động đầy đủ khi chưa từng chạy worker.
- Worker chạy mặc định **một lượt rồi thoát** (`--once`), trả mã thoát `0` xong / `2` không nạp
  được model / `3` có lô thất bại. Chế độ `--watch` vẫn có cho ai muốn theo dõi liên tục.
- Docker: thêm service `sentiment-worker` trong **profile `sentiment`**, không chạy mặc định.
  Bật bằng `docker compose --profile sentiment run --rm sentiment-worker`. Model gắn từ ngoài
  (`./models/open-comment-sentiment:/models:ro`) nên ảnh không phình thêm 515 MB.
- **Chặn số nhân CPU của ONNX Runtime**: `ExecutionMode = ORT_SEQUENTIAL`, `IntraOpNumThreads`
  mặc định **1**, `InterOpNumThreads = 1`. Trước đây để `0` nghĩa là ORT tự lấy hết nhân — đó là
  lỗi thiết kế, không phải đánh đổi.

**Hệ quả lên thiết kế:**

- Không còn `Enabled`/`WorkerEnabled` trong cấu hình. **Công tắc bật tính năng chính là việc chạy
  hay không chạy tiến trình worker** — rõ ràng hơn một cờ mà hai tiến trình phải đọc giống nhau,
  và vẫn thoả yêu cầu “mặc định không tự phân tích” ở mục 0.5.
- API không còn biết model sống hay chết. `OpenCommentModelStatusDto` vì thế đọc từ cơ sở dữ liệu
  (`PendingRecordCount`, `AnalyzedRecordCount`, `LastAnalyzedAt`, `LatestAnalyzedModelVersion`).
  Sức khoẻ của model nằm ở mã thoát và nhật ký của worker.
- Bỏ trường `ModelAvailable` khỏi báo cáo và bỏ health check `/healthz/open-comment-model`: API
  không còn cơ sở để phát biểu về hai thứ đó. Giao diện thay bằng thông báo dựa trên số liệu đếm
  được (“còn N ý kiến chưa phân tích”).
- `OpenCommentSentiment:ModelVersion` **phải trùng nhau** giữa API và worker. Lệch nhau thì API
  coi mọi ý kiến là còn nợ và số liệu quản trị sai. Trong `docker-compose.yml` hai service đọc
  chung một biến `OPEN_COMMENT_MODEL_VERSION` để không thể lệch.

#### 3.6. Trần tài nguyên và lịch chạy — 20/09/2026

Số đo ở mục 3.5 mới trả lời câu hỏi "model có chạy được trên máy 2 vCPU / 4 GB không". Câu còn
lại là **nó không được ăn mất tài nguyên của API trong lúc chạy**. Hai thay đổi bổ sung:

**Trần tài nguyên trong `docker-compose.yml`.** Mọi service đều khai trần CPU/RAM, tính theo ngân
sách 4 GB RAM của máy chủ:

| Service | `cpus` | `mem_limit` | Căn cứ |
| --- | --- | --- | --- |
| `db` | 1,0 | 640 MB | `shared_buffers=64MB`, `max_connections=30` |
| `api` | 1,0 | 768 MB | đo được ~142 MB RSS khi rảnh |
| `frontend` | 0,5 | 128 MB | nginx phục vụ tệp tĩnh |
| `sentiment-worker` | 1,0 | 1536 MB | model ~1,0 GB RSS khi đã nạp |

Tổng trần là **3,0 GB**, cố ý chừa khoảng 1 GB cho hệ điều hành và Docker. Để tổng trần vượt RAM
thật thì khi hết bộ nhớ, kernel giết tiến trình theo thứ tự khó đoán; khai trần thì tiến trình vượt
trần của mình là tiến trình bị giết, và mã thoát `137` nói thẳng đó là lỗi bộ nhớ chứ không phải lỗi
nghiệp vụ. Riêng worker bị chặn ở **1,0 nhân** là để API luôn còn nhân phục vụ khi worker đang suy
luận.

**Lịch chạy bằng systemd timer** trong `deploy/systemd/`: mặc định 02:00 hằng ngày, `Persistent=true`
(chạy bù khi lỡ khung giờ), xê dịch ngẫu nhiên 10 phút, và `Unit=` trỏ thẳng tới service nên không
thể chồng hai lượt. Worker chạy một lượt rồi thoát nên nó hợp với timer hơn là với một tiến trình
thường trực — và phần bộ nhớ 1 GB được trả lại ngay khi tiến trình kết thúc.

`--watch` vẫn còn vì môi trường phát triển cần nó, nhưng worker ghi một dòng cảnh báo khi thấy máy
có **≤ 2 nhân CPU**, kèm lời khuyên chuyển sang chạy theo lịch.

**Bổ sung 20/09/2026 — chế độ chạy nền trả model khi rảnh.** Chạy theo lịch có một lỗ hổng mà người
dùng chỉ ra ngay: *đang họp mà muốn số liệu tức thì thì không được*, phải chờ mốc lịch kế tiếp. Nhưng
để tiến trình ở lại mà ôm model thì mất ~1 GB thường trực — đúng thứ việc tách worker sinh ra để
tránh. Cách giải: `--watch` **nhả model sau khi rảnh** (`IdleUnloadSeconds`, mặc định 120 giây)
thành `khaosatvmu-sentiment-daemon.service`.

| Trạng thái tiến trình chạy nền | RAM thường trú đo được |
| --- | ---: |
| Rảnh, model chưa nạp hoặc đã nhả | 85–129 MB |
| Đang suy luận | ~1,0 GB (1007 MB) |

Kiểm chứng đầu-cuối trên máy phát triển: đánh dấu một dòng thành "còn nợ" → worker chạy nền phát
hiện trong **≤ 15 giây**, nạp model, phân tích xong, tự ghi lại đúng phiên bản quy tắc; sau 60 giây
rảnh (đặt ngắn để đo) nó ghi dòng "Đã trả model" và RSS tụt từ 1007 MB về 129 MB.

Đánh đổi phải biết: lần có việc sau một quãng rảnh phải nạp lại tệp ONNX 515 MB, nên với vài ý kiến
mới thì công nạp lớn hơn công suy luận. **Không bật đồng thời timer và daemon** — hai tiến trình
worker cùng chạy là hai bản model trong RAM, và trên máy 4 GB thì đó là tự bắn vào chân.

**Điều chưa kiểm chứng:** trần RAM/CPU mới chỉ được khai theo số đo một lượt chạy trên máy phát
triển, chưa đo lại trên máy chủ thật dưới tải thật. Ảnh hưởng của worker lên p95 của API thì đã đo
được ở **mục 5.9** (ghim API và worker vào cùng hai nhân): worker tranh CPU làm p95 tăng ~13%, tức
trần 1 nhân là cần nhưng chưa đủ — **phải chạy ngoài giờ cao điểm**. Phần còn lại là kiểm chứng
trên máy chủ thật, việc này nằm trong checklist P1 của `docs/plans/production-hardening-plan.md`.

### Giai đoạn 4 — Giao diện báo cáo ✅ Hoàn thành 20/09/2026

Trạng thái: **hoàn thành**. Màn Phân tích ý kiến mở đã có đầy đủ KPI, biểu đồ, cột lọc và luồng
hiệu chỉnh thủ công.

#### 4.1. Các hạng mục đã hoàn thành

- [x] `types/index.ts`: thêm `OpenCommentSentiment`, `OpenCommentSentimentBreakdown`; mở rộng
  `OpenCommentItem` và `OpenCommentAnalysisReport` theo hợp đồng backend.
- [x] `services/reportApi.ts`: thêm `reviewOpenCommentSentiment` (PATCH qua `csrfRequest`, tự làm
  mới token CSRF khi token cũ hết hạn).
- [x] `components/reports/SentimentBadge.tsx`: badge nhãn cảm xúc kèm dòng độ tin cậy và cờ “Đã
  hiệu chỉnh”.
- [x] `components/reports/SentimentAnalysisPanel.tsx`: thẻ chỉ số từng nhãn, các ghi chú bắt buộc
  và thông báo số ý kiến còn chờ.

  Cập nhật 20/09/2026: khối này được đưa về **cùng bộ class với tab Tổng quan**
  (`reports-exec-header` + `reports-overview-kpi-card`) cho hai tab nhìn như một hệ, và **bỏ biểu
  đồ donut** — lưới thẻ ngay trên đã có đủ số và tỷ lệ của từng nhãn nên vòng tròn chỉ nói lại
  đúng những con số đó. `SentimentDistributionDonut.tsx` vì vậy đã bị xoá; bộ CSS `reports-donut-*`
  vẫn giữ vì `ScoreDistributionDonut` dùng chung.
- [x] `components/reports/theme.ts`: `sentimentColor` — xanh cho Tích cực, đỏ cho Tiêu cực, xám
  cho Trung tính, tím cho Hỗn hợp.
- [x] `styles/reports.css`: badge, khối phân bố và hộp hiệu chỉnh.
- [x] `OpenCommentAnalysis.tsx`: KPI “Chưa phân tích”, khối phân bố, cột Phân loại cảm xúc, cột
  xuất Excel mới, và luồng hiệu chỉnh trong modal chi tiết.

#### 4.2. Quyết định giao diện đã chốt

- **Một cột “Phân loại cảm xúc” làm cả ba việc**: `filterValue` theo nhãn (lọc kiểu Excel), thêm
  ba dòng lọc nhanh (Tiêu cực / Chưa chắc chắn / Chưa phân tích), và `sortValue` theo **độ tin
  cậy** — việc cần làm nhiều nhất trên bảng này là tìm ra câu model đoán chưa chắc. Ô chưa phân
  tích nhận giá trị `-1` nên luôn xếp cuối.
- **Màu không bao giờ là tín hiệu duy nhất**: mọi badge đều có nhãn chữ, và “Chưa chắc chắn” phân
  biệt bằng **viền nét đứt** chứ không bằng màu. File Excel xuất ra mang chữ, không mang màu.
- **Ô đã hiệu chỉnh thủ công không in độ tin cậy**: con số đó thuộc về dự đoán của model, không
  thuộc nhãn người đặt. In cạnh nhau là gán ghép hai thứ khác nhau.
- **Lưu nhãn phải qua một bước xác nhận riêng.** Trạng thái `reviewConfirming` giữ chính *hành
  động* đang chờ (`null` / `''` để bỏ hiệu chỉnh / nhãn sắp ghi), nên không có nhánh nào ghi được
  nhãn mà bỏ qua xác nhận.
- **Không thêm cột “Chủ đề” vào file Excel** dù mục 10.2 có liệt kê: taxonomy chủ đề thuộc Giai
  đoạn 6 và cột luôn rỗng chỉ làm rối báo cáo. Sẽ bổ sung cùng lúc với Giai đoạn 6.
- Nút hiệu chỉnh chỉ hiện với tài khoản có `OPEN_COMMENT_SENTIMENT_REVIEW`. Đây **không phải** cơ
  chế bảo vệ — backend kiểm tra lại quyền và phạm vi dữ liệu ở mọi lời gọi.

#### 4.3. Kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| `npx tsc -b` | 0 lỗi |
| `npx oxlint` | 0 cảnh báo |
| `npm run build` | Thành công |
| Test backend sau khi đổi hợp đồng DTO | 314/314 pass |

#### 4.4. Việc còn thiếu, chuyển tiếp

- Chưa chạy kiểm thử giao diện tự động: dự án chưa có hạ tầng test frontend (chỉ có
  `test:graduation` dùng `node --test`). Cần dựng thêm nếu muốn chốt bằng máy thay vì xem tay.
- Model v1 vẫn **chưa đạt** tiêu chí chấp nhận (Macro F1 `0,7385`, recall `Negative` `0,7294`).

**Chưa làm — kiểm tra lại ngày 20/09/2026, ghi chú trước đây ở đây là sai.** Hai endpoint
`model-status` và `reanalyze` **đã có và đã có test ở tầng API**, nhưng **không có màn hình nào gọi
chúng**: quét toàn bộ `src/Frontend/src` không thấy `model-status`, `reanalyze` hay
`OPEN_COMMENT_MODEL_ADMIN`, và `reportApi.ts` chỉ có hai lời gọi cho `open-comments`. Nghĩa là hiện
chỉ gọi được bằng tay qua API. Khối "Quản trị phân tích cảm xúc" vì thế vẫn là **việc còn thiếu của
Giai đoạn 4**, không phải việc đã xong.

#### 4.5. Sửa lỗi an toàn dữ liệu ở chế độ chạy lại — 20/09/2026

**Lỗi:** `POST /reanalyze` với `force: true` xoá cả dòng `OpenCommentAnalysisResults`. Nhãn do
người có quyền hiệu chỉnh tay nằm ở cột `ManualSentiment` **trên chính dòng đó**, nên bấm một
nút trong màn quản trị là xoá sạch công chấm tay của cả học kỳ, không có đường lấy lại.
Đã có audit log ghi lại nhãn cũ, nhưng biến mất thì vẫn là biến mất.

**Sửa:** chế độ ép buộc bỏ qua những dòng đã được chấm tay. Bỏ qua chúng cũng đúng về nghiệp vụ
chứ không chỉ là né rủi ro — nhãn đang hiển thị của những phiếu này là nhãn của người, nên chạy
lại model không đổi được gì người dùng nhìn thấy. Cơ chế này còn tự lành: nếu sau này bỏ hiệu
chỉnh thì dòng vẫn mang phiên bản model cũ và tự rơi lại vào hàng đợi ở lượt quét sau.

`OpenCommentReanalysisResultDto` thêm `PreservedReviewedCount` để hàng đợi nhỏ hơn phạm vi quét
không bị hiểu là lỗi. Có hai test hồi quy trên cơ sở dữ liệu thật
(`OpenCommentReanalysisTests`), bọc trong transaction rồi rollback.

#### 4.6. Sửa bốn test đỏ — 20/09/2026

Bốn test đỏ khi chạy trên cơ sở dữ liệu thật. Cả bốn đều là **test sai**, không phải sản phẩm sai:

| Test | Nguyên nhân | Cách sửa |
|---|---|---|
| `LecturerAccountProvisioningTests` (×2) | Tra `Positions.PositionName` bằng so chuỗi phân biệt hoa thường, trong khi danh mục ghi `Trưởng bộ môn` còn test truyền `Trưởng Bộ môn`. Sản phẩm đã nhận diện bằng khoá bỏ dấu ở `EfCatalogService.IsDepartmentManagerPosition` | So khớp không phân biệt hoa thường |
| `ReportScopeTests.DepartmentSummary_...` | Helper dựng phạm vi trưởng bộ môn chỉ đặt `DepartmentId`, để `FacultyId = null` — trạng thái mà `EfUserScopeResolver` thật không bao giờ tạo ra, nên rơi vào nhánh "không xác định được khoa" và trả rỗng. Khẳng định cũ (`Rows.Count == 1`) còn trái với thiết kế đã ghi trong `EfSurveyService`: trưởng bộ môn thấy **mọi bộ môn trong khoa mình** để còn so với nhau | Dựng phạm vi bằng helper lấy `FacultyId` từ hộ môn; khẳng định lại đúng thiết kế: không lọt khoa khác, và dòng tổng ở chân bảng trùng với góc nhìn quản trị |
| `ReportQueryOptimizationTests.SchoolOverview_...` | `BuildQuestionRankingAsync` xếp hạng **hai lần trên hai thước đo khác nhau**: chọn top 5 theo điểm cân theo số phiếu trên bảng điểm đã chốt, rồi xếp lại theo điểm trung bình sống **đã làm tròn 2 chữ số**. Ba câu lệch nhau dưới `0,005` hoá bằng điểm, `ThenByDescending(TotalAnswers)` cũng bằng, nên thứ tự cuối cùng phụ thuộc vào việc SQL trả nhóm theo thứ tự nào | Giữ đúng thứ tự của bước xếp hạng đầu; thêm `ThenBy(QuestionId)` ở cả hai bước để thứ tự xác định |

Ba điều đáng nhớ rút ra từ lượt này:

1. **Bảng xếp hạng phải trả về đúng thứ tự đã tính.** Chọn theo một thước đo rồi hiển thị theo
   thước đo khác là lỗi im lặng: số liệu vẫn ra, chỉ là thứ tự đổi giữa hai lần bấm cùng một màn hình.
2. **Test dựng đối tượng giả phải khớp thứ mà hệ thống thật tạo ra.** Helper để `FacultyId = null`
   đã làm test đo một nhánh mà production không đi qua.
3. **Test chạy trên cơ sở dữ liệu thật cần biến môi trường đặt tường minh.** Không có
   `ConnectionStrings__DefaultConnection` thì các test này tự bỏ qua và **vẫn báo xanh** — một
   lượt xanh không có nghĩa là chúng đã chạy.

Sau khi sửa: `316/316` test qua, ở cả hai trạng thái có và không có biến môi trường (`314` test cũ cộng `2` test hồi quy mới ở mục 4.5).

### Giai đoạn 5 — Pilot và nghiệm thu

Thời gian dự kiến: 1–2 tuần.

**Chế độ chạy đã chốt: bóng (shadow).** Mô hình ghi nhãn cho ý kiến thật, con số hiện trên màn
hình báo cáo, nhưng **không ai được dùng nhãn đó để ra quyết định** về giảng viên cho tới khi
có kết quả đo ở mục 5.2. Lý do: model v1 chưa đạt ngưỡng chấp nhận (mục 0.5), nên chạy bóng để
lấy số liệu thật rồi mới bàn chuyện bật mặc định.

#### 5.1. Quy trình chấm tay

Đã có công cụ; việc còn lại là việc của con người.

Lấy mẫu (đã chạy, ra `100` câu):

```bash
python ml/open_comment_sentiment/scripts/build_pilot_review_pack.py
```

Sinh ra bốn tệp trong `ml/open_comment_sentiment/data/processed/pilot/` (thư mục bị gitignore):

| Tệp | Cho ai | Nội dung |
|---|---|---|
| `pilot-annotation-sheet.csv` | chuyên viên nghiệp vụ | `Text` đã khử định danh; cột `Sentiment` để trống |
| `pilot-model-predictions.csv` | **không đưa cho người chấm** | Nhãn và độ tin cậy của model, khoá theo `SampleId` |
| `pilot-sample-map.csv` | lưu nội bộ | `SampleId` ↔ `SurveyResponseId`, để đối chiếu khi cần |
| `pilot-pack-summary.json` | lưu nội bộ | Cỡ mẫu từng lớp, seed, phiên bản model; `candidate_by_label` là trọng số để cân lại khi chấm điểm |

Hai điểm thiết kế phải giữ:

1. **Chấm mù.** Phiếu chấm không chứa nhãn của model. Nếu chuyên viên nhìn thấy nhãn trước thì bị
   neo theo và con số đo được chỉ là mức đồng thuận giả. Vì vậy hai tệp tách rời nhau.
2. **Lấy mẫu phân tầng theo nhãn model đoán** (`25` câu/lớp, tổng `100`). Lấy ngẫu nhiên thuần
   thì `Negative` (`61` câu) và `Mixed` (`39` câu) — đúng hai lớp cần biết nhất — chỉ chiếm vài
   dòng trong mẫu.

   **Hệ quả bắt buộc nhớ:** mẫu phân tầng nên phân bố lớp trong mẫu **không phải** phân bố thật.
   Precision đọc trực tiếp được, còn recall/F1/accuracy phải cân lại trọng số — xem mục 5.3.

Nhãn cho phép: `Negative`, `Neutral`, `Positive`, `Mixed`, `Uncertain`. Câu `Uncertain` bị loại
khỏi phép tính và đếm riêng — tính chúng là đoán sai sẽ làm mô hình trông tệ hơn thực tế một
cách vô cớ.

Chấm xong, chạy:

```bash
python ml/open_comment_sentiment/scripts/evaluate_pilot_pack.py
```

#### 5.2. Tiêu chí chấp nhận đem ra đo

Theo mục 0.5: Macro F1 ≥ `0,80` và recall `Negative` ≥ `0,80`.

Số liệu dùng để **ra quyết định** là mục "Chất lượng khi dùng thật" trong báo cáo, không phải
Macro F1. Vì sản phẩm chỉ gắn cờ cho ý kiến `Negative`/`Mixed` có độ tin cậy ≥ ngưỡng, câu hỏi
thật là: *trong số ý kiến bị gắn cờ, bao nhiêu phần trăm thật sự là âm?* Một model recall thấp
vẫn dùng được nếu phần nó dám khẳng định là chắc; nhưng nếu precision ở ngưỡng cao cũng thấp thì
không nên hiện cảnh báo nào cả.

Báo cáo in kèm khoảng tin cậy Wilson 95% cho cả hai con số: với cỡ mẫu `100` câu, chênh lệch dưới
khoảng `8` điểm phần trăm là chưa kết luận được.

Ghi cờ nếu: precision của tập bị gắn cờ dưới `0,70`, hoặc recall `Negative` dưới `0,80`.

#### 5.3. Kết quả lượt chấm đầu tiên — 20/09/2026

100 câu đã được chấm, không câu nào bỏ trống, không câu `Uncertain`.

**Một lỗi phương pháp đã phát hiện và sửa trong lúc đọc kết quả.** Lượt chạy đầu in ra
Accuracy `0,6800` và Macro F1 `0,6680`. Hai con số đó **sai để ra quyết định**: mẫu được lấy
**phân tầng 25 câu mỗi nhãn dự đoán**, còn phân bố dự đoán thật của tập đã phân tích là
`61` Negative / `176` Neutral / `214` Positive / `39` Mixed. Tính thẳng trên mẫu là tính trên một
phân bố lớp nhân tạo — đúng loại lỗi đã làm con số tập trộn của Giai đoạn 1 bị thổi lên.

Cách đọc đúng, và đã cài vào `evaluate_pilot_pack.py`:

- **Precision đọc trực tiếp được** — precision có điều kiện theo "mô hình đã đoán gì", và mỗi tầng
  dự đoán đều được lấy ngẫu nhiên đủ `25` câu.
- **Recall, F1, accuracy phải cân lại trọng số** cho đúng phân bố thật. Báo cáo bản mới in cả hai
  số cạnh nhau để không ai trích nhầm.

Bảng số **đã cân lại trọng số** (dùng cho mọi kết luận):

| Lớp | Số câu thật (ước lượng) | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| Negative | 109 | **1,0000** | 0,5613 | 0,7190 |
| Neutral | 63 | 0,3600 | 1,0000 | 0,5294 |
| Positive | 160 | 0,6800 | 0,9118 | 0,7790 |
| Mixed | 158 | 0,6800 | **0,1675** | 0,2687 |

- Accuracy: **`0,6049`** (bootstrap 95%: `0,4984`–`0,7117`). Số chưa cân lại của mẫu: `0,6800`.
- Macro F1: **`0,5740`** (bootstrap 95%: `0,4850`–`0,6637`). Số chưa cân lại của mẫu: `0,6680`.

Đối chiếu tiêu chí chấp nhận:

| Tiêu chí | Ngưỡng | Đo được | Kết luận |
|---|---:|---:|---|
| Macro F1 | ≥ `0,80` | `0,5740` | **KHÔNG ĐẠT** |
| Recall `Negative` | ≥ `0,80` | `0,5613` | **KHÔNG ĐẠT** |

Điều đáng chú ý: **cận trên của khoảng tin cậy Macro F1 là `0,6637`, vẫn dưới ngưỡng `0,80`.**
Nên kết luận "không đạt" không phải do xui khi lấy mẫu.

Còn phần tốt, và nó đúng ở chỗ quan trọng nhất:

- **Precision của tập bị gắn cờ là `1,0000`** (`50/50`; Wilson 95%: `0,9286`–`1,0000`). Nói cách
  khác: **khi mô hình dám gắn cờ, nó không sai lần nào** trong 50 câu được kiểm. Đây là con số
  biện minh cho chế độ bóng.
- Recall `Negative` `0,5613` nghĩa là bỏ sót khoảng `44%` câu âm, và recall `Mixed` `0,1675` nghĩa
  là bỏ sót gần hết — nên **không được dùng nhãn này để kết luận "lớp này không có vấn đề gì"**.

Kết luận lượt này: **chưa đạt tiêu chí chấp nhận, giữ nguyên chế độ bóng, không bật mặc định.**

#### 5.4. Giới hạn phải nói rõ khi trích dẫn kết quả này

1. **Dữ liệu trong cơ sở dữ liệu phát triển là văn bản sinh theo mẫu câu, không phải phản hồi
   thật của sinh viên.** Kiểm tra ngày 20/09/2026: `490` ý kiến nhưng `12` đuôi câu phổ biến nhất
   mỗi đuôi lặp lại `9`–`15` lần. Vì vậy lượt đo này là bước tiến so với benchmark học thuật (cùng
   văn phong, cùng chủ đề trường học), nhưng **không phải nghiệm thu trên dữ liệu thật**. Muốn
   nghiệm thu thật thì phải chấm lại trên ý kiến do sinh viên nhập.
2. **Mẫu `100` câu lấy phân tầng nên không phản ánh tỷ lệ thật của các lớp** trong toàn trường.
   Muốn biết tỷ lệ thật thì đọc KPI trên màn báo cáo, không đọc cột "số câu thật" của báo cáo pilot.
3. **Khoảng tin cậy rộng** vì trọng số ngoại suy tỷ lệ nhầm lẫn của một tầng chỉ `25` câu lên tận
   `176` hay `214` câu. Recall của `Mixed` lấy phần lớn số câu thật từ đúng một tầng nên là con số
   yếu nhất trong bảng — đừng đọc chính xác tới hai chữ số.
4. Trọng số cân lại lấy từ `available_by_label` (tính trên `490` dòng), trong khi tập lấy mẫu thực
   tế là `459` câu sau khử trùng lặp. Lệch dưới `6%` và rải đều các lớp; từ gói sau,
   `build_pilot_review_pack.py` đã ghi thêm `candidate_by_label` để hết xấp xỉ.
5. Precision `1,0000` với `n = 50` là con số mạnh nhưng mỏng: thêm `1` câu sai nữa là còn `0,9804`.
   Cần mẫu lớn hơn trước khi dùng nó làm căn cứ phát hành.

#### 5.5. Việc còn lại

- **Dò lại quy tắc và ngưỡng mệnh đề — ĐÃ XONG**, xem mục 5.8. Kết quả: đổi ngưỡng không có tác
  dụng, đổi cách xét mệnh đề (`argmax` sang `mass`) tăng recall `Mixed` từ `0,2241` lên `0,5862`
  với accuracy `0,6600` lên `0,7650`, không mất precision. **Việc còn lại là đưa vào sản phẩm**
  (sửa `OpenCommentSentimentRules.cs`, sinh lại fixture đối chiếu, chạy `dotnet test`).
- Nâng recall `Negative` (`0,5385`) — **không thể giải quyết bằng quy tắc hay ngưỡng**, đã chứng
  minh bằng 312 cấu hình. Phải bằng dữ liệu và huấn luyện. **Đã thử ngày 20/09/2026, xem mục 5.10.**
- Chấm lại gói pilot trên **ý kiến thật của sinh viên** khi có học kỳ thật; lượt hiện tại chỉ đo
  được trên dữ liệu mẫu câu.
- Sửa lỗi UX và guideline gán nhãn theo phát hiện; ghi chú `Notes` trong phiếu chấm lượt này để
  trống nên chưa biết vì sao chuyên viên chọn nhãn ở các câu bất đồng.
- Chỉ bật mặc định khi đạt tiêu chí chấp nhận.

Kết quả: model v1 **chưa được duyệt**; danh sách việc phải xử lý trước khi phát hành ở mục 5.5.

#### 5.6. Lượt pilot lặp lại kết quả tập test local đóng băng

Trước pilot đã có một lần đo khác trên 200 câu `test` đóng băng của tập gold local (Giai đoạn 2).
Hai lượt dùng mẫu khác nhau và cách chọn mẫu khác nhau — pilot lấy phân tầng theo nhãn dự đoán,
tập test local là nửa đóng băng của tập gold. Nhưng chúng trùng nhau ở mọi con số đầu bảng:

| Chỉ số | Test local đóng băng (200 câu) | Pilot (100 câu, đã cân lại) |
|---|---:|---:|
| Precision `Negative` | `1,0000` | `1,0000` |
| Recall `Negative` | `0,5385` | `0,5613` |
| Precision `Positive` | `0,6484` | `0,6800` |
| Recall `Positive` | `0,9219` | `0,9118` |
| Precision `Mixed` | `0,6500` | `0,6800` |
| Recall `Mixed` | `0,2241` | `0,1675` |
| Accuracy | `0,6600` | `0,6049` |

**Mức độc lập của hai lượt thấp hơn vẻ bề ngoài, phải nói rõ.** Kiểm tra ngày 20/09/2026 cho
thấy `87/100` câu của gói pilot nằm sẵn trong tập gold 400 câu — cùng một tổng thể `490` ý kiến
(tập gold chính là toàn bộ `400` câu duy nhất hợp lệ). Nên đây **không phải hai mẫu độc lập** mà
là hai cách rút mẫu khác nhau từ cùng một tổng thể, có phần giao nhau.

Điều đó làm kết luận yếu đi một bậc, nhưng không lật ngược: hai cách rút mẫu khác hẳn nhau (phân
tầng theo dự đoán so với phân tầng theo độ dài rồi chốt cứng) mà ra cùng một hình thì vẫn là
thuộc tính của model trên miền này. Muốn có bằng chứng thật sự độc lập thì phải chấm trên ý kiến
của một học kỳ khác.

**Một cái bẫy số học đi kèm phải nhớ.** `artifacts/phobert-local-evaluation.json` ghi
`macro_f1 = 0,6309`, nhưng đó là trung bình **4 lớp**: script sinh ra nó gọi
`f1_score(average="macro")` **không truyền `labels=`**, nên sklearn chỉ lấy nhãn có mặt — mà cả
nhãn vàng lẫn nhãn dự đoán của tập test đều không có `Uncertain`. Con số đủ 5 lớp là `0,5047`,
chính là trung bình của bảng in ngay bên cạnh trong báo cáo đó. Đã sửa script sinh báo cáo để in
cả hai và gọi đúng tên; đừng so `0,6309` với `0,5740` của pilot như thể cùng thang đo.

#### 5.7. Vì sao KHÔNG thể dùng tập test của bộ dữ liệu tải về để nghiệm thu

Đây là câu hỏi hợp lý ("ý kiến sinh viên ở đâu chả giống nhau") và nó đã có câu trả lời bằng số.
Ba lý do, xếp theo mức độ quyết định:

**1. Ta ĐANG dùng chúng rồi.** `0,7385` Macro F1 — con số đang chặn phát hành — chính là đo trên
tập test NEU-ESC tải về. Tập test đó không bị bỏ qua; nó chỉ **không đủ**. Và bản thân nó cũng đã
dưới ngưỡng `0,80`, nên dùng nó làm cổng nghiệm thu thì kết luận vẫn là "không đạt".

**2. Bộ dữ liệu tải về KHÔNG có nhãn `Mixed`.** `config/data-sources.json` khai báo
`"derived_labels": ["Mixed", "Uncertain"]` — hai nhãn này do quy tắc của ta sinh ra, không tồn tại
trong dữ liệu nguồn. Nghĩa là **không tập test tải về nào đo được recall của `Mixed`**, mà đó lại
đúng là chỉ số đang hỏng nặng nhất (`0,1675` / `0,2241`). Một tập test không chứa lớp nào thì không
thể phát hiện việc bỏ sót lớp đó. Đây là lý do cấu trúc, không phải lý do chất lượng dữ liệu.

**3. Giả thuyết "ý kiến ở đâu cũng giống nhau" đã được kiểm chứng và bị bác bỏ bằng thực nghiệm
đối chứng** (Giai đoạn 1, mục 1.7.1):

| Chiều chuyển miền | Macro F1 nội miền | Macro F1 ngoại miền |
|---|---:|---:|
| UIT-VSFC → NEU-ESC | `0,7437` | **`0,3661`** |
| NEU-ESC → UIT-VSFC | `0,7052` | **`0,4430`** |

Và recall `Negative` sụt còn `0,2378` / `0,1505`. Đây không phải suy đoán: cùng một thuật toán,
cùng tiền xử lý, chỉ đổi tập test, và chất lượng giảm gần một nửa. Cả hai bộ đều là bình luận giáo
dục, cùng ngôn ngữ — vẫn không thay thế được cho nhau.

**Hệ quả cho ngưỡng nghiệm thu:** tiêu chí chấp nhận ở mục 0.5 nói về **hành vi gắn cờ trên ý kiến
của trường**, tức là precision/recall của tập bị gắn cờ trên phân bố của ta. Precision không
truyền được qua miền khi tỷ lệ cơ sở của `Negative` khác nhau; đo trên NEU-ESC rồi suy ra cho VMU
là đúng loại suy luận đã sai ở bảng trên.

**Việc còn lại thì không tránh được:** muốn biết "bật cảnh báo lên có được không" thì phải có nhãn
người chấm trên ý kiến của trường. Với `0,1675` và `0,2241` ở hai lượt, câu trả lời hiện tại là
**không**, và đó là câu trả lời *chắc chắn* chứ không phải dè dặt.

#### 5.8. Dò lại quy tắc mệnh đề — đã làm, và đây là kết quả

`Mixed` **không phải** nhãn của model — nó do quy tắc mệnh đề sinh ra (`inference_engine.py`,
`OpenCommentSentimentRules.cs`): tách ý kiến theo `nhưng`/`tuy nhiên`/`;`, chạy model 3 lớp trên
từng mệnh đề, và gọi là `Mixed` khi có một mệnh đề rõ tích cực VÀ một mệnh đề rõ tiêu cực. Quy tắc
này còn phải có **argmax** của mệnh đề mới tính — nên một mệnh đề phàn nàn mà model gọi là `Neutral`
nhưng cho `p(Negative) = 0,45` sẽ bị bỏ qua hoàn toàn.

Công cụ: `ml/open_comment_sentiment/scripts/tune_rule_thresholds.py`. Dựng cache xác suất bằng
**model ONNX** (đúng cái đang chạy trong sản phẩm) cho cả ý kiến lẫn từng mệnh đề, rồi dò lại quy
tắc thuần trên cache — không cần gán nhãn thêm và không huấn luyện lại.

Kỷ luật đã giữ:

- **Dò trên 200 câu `calibration`, báo cáo trên 200 câu `test` đóng băng.**
- Script **tự kiểm trước khi dò**: ở cấu hình sản phẩm, replay phải tái hiện đúng bản ghi cũ. Kết
  quả: accuracy khớp `0,6600`, macro F1 4 lớp khớp `0,6309`, và **ma trận nhầm lẫn lệch đúng 0 ô**.
  Không khớp thì script dừng.
- Ràng buộc chống thoái bộ, thêm sau lượt dò đầu: recall `Negative` không được thấp hơn cấu hình
  đang chạy. Lượt đầu không có ràng buộc này đã chọn `confidence_threshold = 0,6` và đẩy recall
  `Negative` từ `0,5385` xuống `0,1795` mà chỉ số "tập bị gắn cờ" vẫn tăng — vì tập đó gồm cả
  `Negative` lẫn `Mixed`, nên đổi nhãn qua lại giữa hai lớp này không bị phạt. Ràng buộc loại thêm
  `144/312` cấu hình.

**Kết quả 1 — đổi ngưỡng không có tác dụng gì.** Với quy tắc hiện tại, dò khắp
`confidenceThreshold` × `mixedClauseMinConfidence` (312 cấu hình) cho **chênh lệch đúng bằng 0**
trên tập test. Hai con số `0,45`/`0,35` không phải chỗ hỏng, và đây là kết quả chặn hẳn một hướng
nghi ngờ.

**Kết quả 2 — đổi cách xét mệnh đề thì được, và được nhiều.** Biến thể `mass` xét khối xác suất
`p(Positive)` / `p(Negative)` của mệnh đề thay vì đòi argmax. Cấu hình chọn trên calibration:
`confidenceThreshold = 0,1`, `mixedClauseMinConfidence = 0,2`. Trên tập **test đóng băng**:

| Chỉ số trên test đóng băng | Sản phẩm (`argmax`) | `mass` | Chênh |
|---|---:|---:|---:|
| Recall tập bị gắn cờ (`Negative` ∪ `Mixed`) | `0,4227` | **`0,6495`** | `+0,2268` |
| Precision tập bị gắn cờ | `1,0000` | `1,0000` | `±0` |
| Accuracy | `0,6600` | **`0,7650`** | `+0,1050` |
| Macro F1 (đủ 5 lớp) | `0,5047` | **`0,6024`** | `+0,0977` |
| Recall `Negative` | `0,5385` | `0,5385` | `±0` |
| Recall `Mixed` | `0,2241` | **`0,5862`** | `+0,3621` |
| Precision `Mixed` | `0,6500` | `0,8095` | `+0,1595` |

Recall `Mixed` tăng gần gấp ba, precision `Mixed` cũng tăng, và **không mất gì ở precision của tập
bị gắn cờ**. Đây là sửa lỗi quy tắc, không phải sửa model: `Mixed` hỏng vì quy tắc không nhìn thấy
vế tiêu cực, không phải vì model không phân biệt được.

**Kết quả 3 — recall `Negative` không nhúc nhích, và điều đó là thông tin.** Suốt 312 cấu hình,
recall `Negative` không cấu hình nào vượt được mức `0,5652`. Hợp lý về mặt cấu trúc: `Negative` là
nhãn gốc của model, quy tắc mệnh đề không đụng tới nó. Nên tiêu chí "recall `Negative` ≥ `0,80`"
ở mục 0.5 **chỉ có thể giải quyết bằng dữ liệu và huấn luyện**, không bằng chỉnh quy tắc.

**Chưa đạt tiêu chí chấp nhận, và khoảng cách còn lại đã được khoanh vùng:**

| Tiêu chí | Ngưỡng | Đo được sau khi sửa quy tắc | Kết luận |
|---|---:|---:|---|
| Macro F1 | ≥ `0,80` | `0,6024` | Còn thiếu, nhưng đã thu hẹp |
| Recall `Negative` | ≥ `0,80` | `0,5385` | **Không sửa được bằng quy tắc** |

**Việc phải làm để đưa `mass` vào sản phẩm** (chưa làm, cần bạn quyết): sửa
`OpenCommentSentimentRules.cs` cho khớp, chạy lại `export_prediction_parity_fixture.py` với ngưỡng
mới, rồi `dotnet test` phải xanh ở nhóm test đối chiếu Python–C#. Đây không phải chỉnh appsettings
là xong.

**Đã đưa vào sản phẩm ngày 20/09/2026.** Quy tắc khối xác suất đã port sang cả
`inference_engine.py` (Python) và `OpenCommentSentimentRules.cs` (C#); `MixedThreshold` đổi
`0,35` → `0,20` ở `OpenCommentSentimentOptions.cs`, `API/appsettings.json`,
`SentimentWorker/appsettings.json`; `ConfidenceThreshold` **giữ nguyên `0,45`** vì đo trên cả hai
tập cho thấy nó không ảnh hưởng gì trong khoảng `0,10`–`0,45`. Fixture đối chiếu Python–C# đã sinh
lại; `dotnet test` `317/317` và test Python `46/46` đều xanh, trong đó nhóm test đối chiếu dự đoán
giữa hai phía khớp từng ca.

Phân bố nhãn thật của `490` ý kiến trước và sau khi đổi quy tắc:

| Nhãn | Trước (`argmax`, `0,35`) | Sau (khối xác suất, `0,20`) |
|---|---:|---:|
| Positive | `214` (43,7%) | `197` (40,2%) |
| Neutral | `176` (35,9%) | `147` (30,0%) |
| **Mixed** | **`39` (8,0%)** | **`85` (17,3%)** |
| Negative | `61` (12,4%) | `61` (12,4%) |

Số câu `Negative` **không đổi một câu nào** — đúng như dự đoán về cấu trúc, vì `Negative` là nhãn
gốc của model và quy tắc mệnh đề không đụng tới. Toàn bộ phần tăng của `Mixed` lấy từ `Neutral`
(`-29`) và `Positive` (`-17`), tức đúng hai nhóm mà quy tắc cũ ghi sai.

**Đã xử lý ngày 20/09/2026 — tách phiên bản quy tắc khỏi phiên bản model.** Điểm chưa xử lý nêu
ở bản trước của mục này là một lỗ hổng thật, không phải ghi chú cho vui: `ModelVersion` chỉ nói về
model, nên sau khi đổi quy tắc thì mọi dòng vẫn được coi là "đã đúng phiên bản" và không bao giờ
được phân tích lại. Cách sửa:

- Thêm cột `RuleVersion` (`varchar(64)`, NOT NULL, mặc định rỗng) vào `OpenCommentAnalysisResults`
  — migration `20260920113653_AddOpenCommentRuleVersion`.
- Cột này chứa **phiên bản quy tắc hiệu lực**, gồm tên quy tắc và dấu vân tay của hai ngưỡng:
  `rules-v2:c0.45:m0.2` (`OpenCommentSentimentOptions.EffectiveRuleVersion`). Gộp cả ngưỡng vào là
  có chủ đích: ngưỡng nằm trong `appsettings.json`, nên sửa cấu hình cũng đổi kết quả phân loại y
  như sửa mã — chỉ ghi tên quy tắc thì lần đổi ngưỡng sau lại rơi đúng vào cái bẫy này.
- Điều kiện "còn nợ" giờ là **cặp** `(ModelVersion, RuleVersion)`, xét ở cả ba chỗ: worker chọn lô,
  API đếm số chưa phân tích, API xếp hàng chạy lại.
- Dấu thập phân luôn in theo `InvariantCulture`: để theo văn hoá máy thì một máy chủ `vi-VN` ghi
  `c0,45` còn máy khác ghi `c0.45`, và worker sẽ phân tích lại toàn bộ dữ liệu mỗi lần đổi máy.

**Đã kiểm chứng đầu-cuối:** sau khi áp migration, 490 dòng mang `RuleVersion` rỗng nên tự thành "còn
nợ"; một lượt chạy worker thường (không ép buộc) đã cập nhật cả 490 dòng sang `rules-v2:c0.45:m0.2`,
và nhãn **không đổi một câu nào** (197/147/85/61) — đúng như dự đoán, vì model và quy tắc đều không
đổi, chỉ có phiên bản được ghi lại. Test: `OpenCommentRuleVersionTests` (6 ca, gồm ca đổi ngưỡng
phải đổi phiên bản và ca không phụ thuộc văn hoá máy) và
`OpenCommentReanalysisTests.ChangingOnlyTheRuleVersion_ShouldPutEveryResultBackInTheQueue`. Toàn bộ
`324/324` test qua, chạy với `ConnectionStrings__DefaultConnection` được đặt để các test chạm cơ sở
dữ liệu thật sự chạy chứ không tự bỏ qua.

**Giới hạn của lượt dò này:** dò trên 200 câu nên chênh lệch vài điểm phần trăm giữa các cấu hình
chưa kết luận được; trong nhóm đồng hạng ở trên, việc chọn `0,1` hay `0,2` là tuỳ ý. Và dò ngưỡng
chỉ đổi **ranh giới quyết định** trên xác suất đã có, không làm model phân biệt tốt hơn. Dưới
`0,15` thì recall `Negative` sụp (`0,5385` → `0,2821` → `0,2051`) vì câu tiêu cực thuần bị ghi
thành `Mixed` — đừng hạ ngưỡng xuống dưới mức này mà không đo lại.

#### 5.9. Load test: worker có làm chậm API báo cáo không — 20/09/2026

Đây là mục còn thiếu ở 3.4 và 3.6, đồng thời là một tiêu chí chấp nhận ở 0.5: *"Worker chạy nền
không làm p95 của API báo cáo hiện có tăng quá 10% trong bài load test đại diện."*

**Cách đo.** Máy phát triển có 16 nhân nên để nguyên thì worker chỉ chiếm 1/16 máy và phép đo vô
nghĩa. Vì vậy mô phỏng máy chủ thật bằng **trần CPU**: ghim tiến trình API và tiến trình worker vào
**cùng hai nhân**, đúng thế chia sẻ của máy 2 vCPU. Mọi thứ còn lại giữ nguyên: cùng endpoint, cùng
dữ liệu, cùng số kết nối, cùng độ dài 40 giây.

- Đối tượng đo: `GET /api/v1/reports/open-comments` (286 KB JSON, có đăng nhập) — đúng "API báo
  cáo" mà tiêu chí nói tới. Đây là đường **chỉ đọc** nên chạy bao nhiêu lượt cũng được và không
  ghi gì vào cơ sở dữ liệu.
- Công cụ: `scripts/load_test_reports.py` (mới) — đăng nhập bằng `/api/auth/dev/login`, đo p50/p90/p95/p99,
  xuất JSON. `scripts/load_test_survey.py` thêm `--json-out` và p95 để so trước/sau bằng số.
- Số liệu thô: `artifacts/load-test/*.json`.
- Tạo việc cho worker: chạy nó với một `ModelVersion` tạm để 490 ý kiến thành "còn nợ", rồi chạy
  lại với `ModelVersion` thật để khôi phục. Nếu không có bước này thì hàng đợi rỗng, worker thoát
  trong 2,2 giây và không có gì để đo.

**Kết quả — 16 kết nối đồng thời:**

| Lượt | Thông lượng | p50 | p90 | p95 | p99 |
|---|---:|---:|---:|---:|---:|
| Nền 1 (worker rảnh) | 90,7 req/s | 115 ms | 361 ms | **451 ms** | 624 ms |
| Nền 2 (worker rảnh) | 90,1 req/s | 121 ms | 362 ms | **458 ms** | 646 ms |
| Có worker, lượt 1 | 75,9 req/s | 155 ms | 415 ms | **502 ms** | 754 ms |
| Có worker, lượt 2 | 74,5 req/s | 152 ms | 428 ms | **527 ms** | 742 ms |

- p95: `451–458 ms` → `502–527 ms`, tức **+9,6% đến +16,9%** (trung bình **+13,2%**).
- Thông lượng: `90,4` → `75,2 req/s` = **−16,8%**.
- p50: `118` → `153 ms` = **+30%**. p99: `635` → `748 ms` = **+17,8%**.

**Kết luận: KHÔNG đạt ngưỡng 10%.** p95 tăng trung bình 13,2%, và ngay lượt thuận lợi nhất cũng chỉ
nằm dưới ngưỡng 0,4 điểm phần trăm. Đây không phải dao động đo: hai lượt nền lệch nhau **1,5%**,
hai lượt có worker lệch nhau **5%**, còn khoảng cách giữa hai nhóm lớn hơn thế ở cả bốn chỉ số.

**Đo ở 1 kết nối thì mức ảnh hưởng còn rõ hơn** — và đây mới là phép đo sạch, vì không có hiệu ứng
xếp hàng của phía client:

| Lượt | Thông lượng | p50 | p95 |
|---|---:|---:|---:|
| 1 kết nối, worker rảnh | 22,4 req/s | 39 ms | 58 ms |
| 1 kết nối, có worker | 15,9 req/s | 55 ms | 89 ms |

Tức p95 **+53%** và thông lượng **−29%**. Nghĩa là worker không chỉ làm chậm lúc cao điểm: ngay cả
một người mở màn báo cáo trong lúc worker đang chạy cũng chờ lâu hơn khoảng một nửa.

**Cơ chế, theo số CPU đo được.** Trần 2 nhân được dùng gần hết ở cả hai trường hợp, nhưng khác
cách chia: nền là `60,7–61,2 s` CPU cho API; khi có worker là `51,7–52,3 s` cho API cộng `8,9 s`
cho worker — **tổng gần như không đổi** (`60,6 s`). Nói cách khác phần CPU bị lấy đi đúng bằng phần
request không được phục vụ. Worker lấy được **0,22 nhân** trong lúc tranh chấp và **0,84 nhân** khi
API rảnh: trần 1 nhân trong cấu hình vẫn đúng, nhưng nó chặn *trần*, không chặn *tranh chấp*.

**Hệ quả bắt buộc:**

1. **Chạy worker ngoài giờ cao điểm là yêu cầu, không phải khuyến nghị.** Mô hình vận hành ở 3.6
   (systemd timer 02:00) vì thế trở thành điều kiện kỹ thuật, không chỉ là thói quen tốt.
2. **Không bật chế độ `--watch` trên máy chủ thật.** Nó biến ảnh hưởng đo được ở đây từ "vài phút
   mỗi ngày" thành "mọi lúc".
3. **Tiêu chí 0.5 coi như chưa đạt**, và muốn đạt thì phải hoặc là chạy worker ngoài giờ, hoặc là
   nâng máy chủ. Không có cách chỉnh cấu hình nào khác để lấy lại phần CPU đó.

**Giới hạn của phép đo này — phải nói rõ:**

- **Mô phỏng bằng trần CPU, không phải máy chủ thật.** Trên máy thật, API chia 2 vCPU với worker
  *và* PostgreSQL *và* nginx; ở đây PostgreSQL chạy trong container có CPU riêng. Nghĩa là phép đo
  này **rộng rãi** hơn thực tế, và con số trên máy thật nhiều khả năng xấu hơn, không tốt hơn.
- **Là trường hợp xấu nhất có chủ đích**: worker chạy đúng lúc API đang bão hoà. Mô hình vận hành
  đề xuất thì hai việc này không trùng nhau.
- **Chưa đo được 1.000 người dùng** như mục P2 của kế hoạch hoá đơn giản. Lý do là một phát hiện
  phụ: `load_test_survey.py` chỉ nhận một `linkToken`, mà mỗi lượt nộp chiếm một suất của lớp
  (`ClassSize`) và không trả lại — nên trần của bài test bằng số chỗ còn trống của một lớp, hiện
  cao nhất là **77**. Muốn đo 1.000 người phải cho script nhận nhiều token và rải người dùng qua
  nhiều lớp; chưa làm.

#### 5.10. Fine-tune tiếp trên 200 câu calibration — 20/09/2026

Mục 5.5 để lại đúng một việc không thể giải quyết bằng quy tắc: recall `Negative`. Lượt này thử
đường còn lại — dữ liệu và huấn luyện — với thứ dữ liệu duy nhất đang có: **200 câu `calibration`
đã được người chấm**. Công cụ: `ml/open_comment_sentiment/scripts/finetune_local_calibration.py`.

**Kỷ luật đã giữ:** huấn luyện **chỉ** trên tập `calibration` (147 câu thuộc 3 nhãn gốc; 53 câu
`Mixed` bị loại vì model không có nhãn đó). Tập `test` đóng băng không được dùng để chọn epoch — số
epoch chốt trước (3), chạy xong mới xem kết quả. Trước khi tin số mới, script **tái hiện số cũ**:
chạy checkpoint gốc trên tập test bằng đúng quy tắc đang chạy trong sản phẩm.

| Chỉ số | Kế hoạch ghi (5.8) | Tái hiện |
| --- | ---: | ---: |
| Accuracy | 0,7650 | 0,7650 |
| Recall `Negative` | 0,5385 | 0,5385 |
| Recall `Mixed` | 0,5862 | 0,5862 |

Lệch **0,0000** — bộ đo đáng tin, nên số của lượt fine-tune bên dưới so trực tiếp được với bảng ở 5.8.

**Kết quả (3 epoch, lr 1e-5, batch 8, `max_length` 256, seed 7, GPU RTX 3060):**

| Chỉ số trên tập test đóng băng | Gốc | Sau fine-tune | Chênh |
| --- | ---: | ---: | ---: |
| Accuracy | 0,7650 | **0,9000** | +0,1350 |
| Macro F1 (đủ 5 nhãn) | 0,6024 | **0,7111** | +0,1087 |
| Recall `Negative` | 0,5385 | 0,5897 | +0,0513 |
| Recall `Mixed` | 0,5862 | **0,9310** | +0,3448 |
| Recall `Positive` | 0,9219 | 1,0000 | +0,0781 |
| Recall `Neutral` | 1,0000 | 1,0000 | ±0 |
| Precision nhóm bị gắn cờ | 0,8293 | **0,8953** | +0,0660 |
| Số câu bị gắn cờ | 41 | **86** | +45 |

**Kết luận: CHƯA ĐẠT, không đưa vào sản phẩm.** Macro F1 `0,7111` và recall `Negative` `0,5897` vẫn
dưới ngưỡng `0,80` ở mục 0.5. Chế độ bóng giữ nguyên; `ModelVersion` không đổi, chưa xuất ONNX, không
có gì trong đường chạy thật bị đụng tới.

**Nhưng đây là lần đầu có tiến bộ thật, và tiến bộ nằm đúng chỗ đang hỏng:**

- Recall `Mixed` `0,5862` → `0,9310` và recall `Positive` lên `1,0000`, tức hai nhóm bị ghi sai
  nhiều nhất đã được sửa gần hết.
- Precision của nhóm bị gắn cờ **tăng** trong khi nhóm đó **gấp đôi** (`41` → `86` câu). Đây là con
  số nghiệp vụ quan trọng nhất ở 5.2: cùng một ngưỡng mà bắt được gấp đôi số câu âm/hỗn hợp với độ
  chính xác cao hơn.
- Recall `Negative` chỉ nhích `+0,0513`. Tiêu chí khó nhất vẫn là tiêu chí gần như không nhúc nhích,
  nên **"fine-tune trên 200 câu địa phương" một mình không đủ để mở cổng** — phải nói thẳng như vậy
  thay vì nhìn vào accuracy `0,9000`.

**Số liệu thô và cách chạy lại:** `artifacts/local-finetune-evaluation.json` và `.md`; checkpoint lưu
ở `artifacts/phobert_local_finetune` (bị gitignore) nếu muốn xuất ONNX mà không huấn luyện lại.

**Giới hạn phải nói rõ trước khi ai đó trích dẫn bảng trên:**

1. **Tập train và tập test cùng một tổng thể.** Cả hai đều nằm trong 490 ý kiến của **một đợt khảo
   sát** (`2026-09`), và dữ liệu đó là văn bản **sinh theo mẫu câu** (mục 5.4). Nên phần lớn mức tăng
   ở đây có thể là *thích nghi miền*, không phải khả năng tổng quát hoá: model học văn phong của
   đúng bộ dữ liệu này. Muốn biết có thật không thì phải chấm lại trên **một học kỳ khác**.
2. **147 câu là quá ít để huấn luyện.** Train loss kết thúc ở `0,0635` — dấu hiệu học thuộc. Không
   chọn epoch theo tập test (đúng kỷ luật), nhưng điều đó cũng có nghĩa chưa biết epoch nào là tốt
   nhất cho dữ liệu mới.
3. **Việc còn lại vẫn là dữ liệu:** cần thêm câu chấm tay, và cần một đợt khảo sát khác để đo xem
   mức tăng này giữ được bao nhiêu.

### Giai đoạn 6 — Phân loại chủ đề

> Bản nháp taxonomy và quy trình gán nhãn: `docs/plans/phan-loai-chu-de-theo-y-kien-mo.md`. Tài liệu
> đó đang chờ trường trả lời bốn câu hỏi (danh sách chủ đề cuối cùng, ai gán nhãn, phạm vi ý kiến cơ
> sở vật chất, nguồn dữ liệu) trước khi bắt đầu — taxonomy sai thì công gán nhãn đổ đi, vì nhãn chủ
> đề không sửa được bằng cách chỉnh ngưỡng như cảm xúc.

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
