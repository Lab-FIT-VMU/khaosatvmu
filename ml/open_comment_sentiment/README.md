# Open-comment sentiment baseline

Pipeline ngoại tuyến cho Giai đoạn 1 của kế hoạch phân loại ý kiến mở. Pipeline không kết nối database và không sửa dữ liệu ứng dụng.

Bản mô tả gọn toàn bộ thuật toán và quá trình huấn luyện (dữ liệu, tokenizer, hàm mất mát, siêu tham
số, cân chỉnh ngưỡng, xuất ONNX, mã giả quy tắc 5 nhãn, cách đo chất lượng và các bẫy) nằm ở
`docs/thuat-toan-va-huan-luyen-mo-hinh-cam-xuc.md`. README này là hướng dẫn thao tác trên từng script.

## Nguồn dữ liệu và vai trò

| Nguồn | Vai trò | Giấy phép | Truy cập | Phiên bản ghim |
|---|---|---|---|---|
| [NEU-ESC](https://huggingface.co/datasets/hung20gg/NEU-ESC) | Nguồn huấn luyện có giấy phép rõ cho artifact ba lớp | `Apache-2.0` (metadata do nhóm tác giả công bố) | **Gated** (`gated: auto`): phải đăng nhập, chấp nhận điều kiện và dùng token `HF_TOKEN` | `daf543ad1992153cd2be9fec3cb59aa0fc714147` |
| [UIT-VSFC v1.0](https://nlp.uit.edu.vn/datasets) | Benchmark trong miền, không phải nguồn duy nhất của artifact | Không có tệp LICENSE | Thư mục Google Drive công khai | commit `62ab3370b77634e5fa438b911b5f156ca41eba25` |

Quyết định của Giai đoạn 1 được ghi trong `config/data-sources.json`:

- Ba lớp huấn luyện: `Negative`, `Neutral`, `Positive`. `Mixed` và `Uncertain` là nhãn suy ra bằng quy tắc, không huấn luyện trực tiếp.
- Nhãn `3 = Toxic` của NEU-ESC **bị loại khỏi tập huấn luyện**, không gộp vào `Negative`. Loader chỉ đếm số dòng bị loại để kiểm toán, không giữ lại nội dung.
- Ánh xạ nhãn NEU-ESC: `0=Neutral`, `1=Positive`, `2=Negative`. Ánh xạ UIT-VSFC: `0=Negative`, `1=Neutral`, `2=Positive`.
- Mỗi mẫu luôn giữ `DatasetSource`; metric luôn được báo cáo riêng theo từng nguồn.

NEU-ESC lệch mạnh về lớp `Neutral` (~69%) còn UIT-VSFC lệch về `Positive`/`Negative`, nên mọi kết quả đều tách theo nguồn thay vì chỉ báo cáo một con số trộn.

Dữ liệu raw, môi trường Python và model artifact bị loại khỏi Git bằng `.gitignore`.

## Chạy lại

```powershell
cd ml/open_comment_sentiment
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/download_uit_vsfc.py
.\.venv\Scripts\python.exe scripts/audit_dataset.py
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

### NEU-ESC (dataset gated)

Tên file của NEU-ESC là công khai nhưng nội dung thì không: đây là dataset `gated: auto`.

```powershell
# 1. Mở https://huggingface.co/datasets/hung20gg/NEU-ESC, đăng nhập và chấp nhận điều kiện truy cập
# 2. Đăng nhập máy local bằng một trong hai cách. Lưu ý: `huggingface-cli` đã bị bỏ, phải dùng `hf`.
hf auth login                                  # ghi token vào ~/.cache/huggingface/token
$env:HF_TOKEN = "<token cua ban>"              # hoặc đặt biến môi trường
# 3. Tải và kiểm toán
.\\.venv\\Scripts\\python.exe scripts/download_neu_esc.py
.\\.venv\\Scripts\\python.exe scripts/audit_neu_esc.py
```

Kiểm tra đăng nhập bằng `hf auth whoami`. Nếu vẫn bị `401` sau khi đăng nhập thì gần như chắc chắn là chưa chấp nhận điều kiện dataset, hoặc token được tạo trước lúc chấp nhận.

`download_neu_esc.py` ghim đúng revision trong config, lưu SHA-256 từng file vào `data/raw/neu_esc/download-manifest.json`, và dừng với mã thoát `2` kèm hướng dẫn nếu chưa được cấp quyền. Script đọc token theo thứ tự `--token`, `HF_TOKEN`, `HUGGING_FACE_HUB_TOKEN`, `$HF_HOME/token`, `~/.cache/huggingface/token`; token không bao giờ được ghi ra đĩa hay vào Git.

Dataset card (`README.md`) là công khai nên tải được ngay cả khi chưa được cấp quyền CSV. Card đã ghim revision chứa `license: apache-2.0` ở frontmatter, còn mục `## License` trong phần thân chỉ ghi "an open-source license for research and educational purposes" — data card ghi lại cả hai và đối chiếu SHA-256 của card với revision đã ghim.

### Thí nghiệm đối chứng theo nguồn

```powershell
# Chạy đầy đủ: uit-vsfc, neu-esc và tập trộn
.\.venv\Scripts\python.exe scripts/train_baseline.py --source all

# Chỉ benchmark trong miền, không cần NEU-ESC
.\.venv\Scripts\python.exe scripts/train_baseline.py --source uit-vsfc
```

Trước khi huấn luyện, script dựng đủ corpus cho mọi thí nghiệm để một nguồn thiếu sẽ dừng sớm và không để lại artifact dở dang.

### Data card

```powershell
.\.venv\Scripts\python.exe scripts/build_data_card.py
```
### Bộ regression fixture (dữ liệu tổng hợp)

`data/fixtures/regression-comments.csv` gồm 30 câu tự đặt để phủ câu điển hình và câu biên: phủ định, phủ định kép, châm biếm kèm emoji, viết tắt, không dấu, câu rỗng nghĩa, câu hỗn hợp. Mọi dòng đều có `IsSynthetic=Y`.

```powershell
.\\.venv\\Scripts\\python.exe scripts/run_regression_fixture.py
```

Fixture này **chỉ để phát hiện hồi quy** khi sửa tiền xử lý/tokenizer/vectorizer. Cột `ReferenceSentiment` là nhãn tham chiếu do nhóm kỹ thuật đặt, không phải nhãn vàng đã phân xử. Kết quả từ fixture **không phải metric chất lượng mô hình** và không được dùng thay cho tập test local do người gán nhãn; test sẽ fail nếu có dòng bị đánh dấu không phải synthetic.
### Tập gán nhãn local

Chuẩn bị tập gán nhãn local từ một CSV đã được người có thẩm quyền xuất ra môi trường an toàn:

```powershell
.\.venv\Scripts\python.exe scripts/prepare_local_sample.py --input <duong-dan-csv> --text-column AdditionalComments --group-column SurveyPeriod --sample-size 400
```

Script không kết nối database, không ghi lại `ResponseId`, che email/URL/số điện thoại và tạo mã mẫu mới. File đầu ra vẫn chứa nội dung phản hồi nên nằm trong `data/processed/` đã bị loại khỏi Git và chỉ được chuyển cho người gán nhãn có quyền.

Với database local chạy trong Docker, có thể dùng luồng read-only sau. Script export chỉ lấy nội dung, tháng gửi và trạng thái hợp lệ; không lấy `ResponseId`, điểm phiếu, giảng viên hay sinh viên.

```powershell
.\.venv\Scripts\python.exe scripts/export_local_comments_from_docker.py
.\\.venv\\Scripts\\python.exe scripts/prepare_local_sample.py --input data/raw/local/local-comments.csv --group-column SurveyPeriod --valid-column IsValid --sample-size 400
.\\.venv\\Scripts\\python.exe scripts/create_local_review_pack.py
```

`--valid-column IsValid` chỉ giữ phiếu hợp lệ, nếu bỏ qua thì mẫu sẽ lẫn các bài gửi thử và nội dung rác. Với 400 câu hợp lệ duy nhất thì `sampling_is_population = true`, tức mẫu chính là tổng thể và không có sai số chọn mẫu.

`create_local_review_pack.py` tạo thêm `split-assignment.csv` chia 200 câu cho calibration và 200 câu cho test đóng băng, phân tầng theo độ dài. **Không đưa file này cho người gán nhãn**, vì biết trước câu nào thuộc tập test sẽ làm lệch nhãn.

Sau khi hai người hoàn thành độc lập `annotator-a.csv` và `annotator-b.csv`, chạy ba bước. Hướng dẫn gán nhãn nằm ở [`docs/annotation-guideline-v1.md`](docs/annotation-guideline-v1.md).

```powershell
# 1. Gop phieu, do Cohen's Kappa, tao file phan xu chi gom cau bat dong
.\\.venv\\Scripts\\python.exe scripts/build_local_gold.py

# 2. Nguoi thu ba dien cot Sentiment trong data/processed/review/adjudication.csv

# 3. Khoa tap gold
.\\.venv\\Scripts\\python.exe scripts/build_local_gold.py --adjudication data/processed/review/adjudication.csv

# 4. Danh gia tren tap test dong bang
.\\.venv\\Scripts\\python.exe scripts/evaluate_local_gold.py --input data/processed/local-gold.csv --split test
```

`build_local_gold.py` dừng lại nếu còn câu chưa gán, nếu có nhãn sai, hoặc nếu Kappa dưới `0,75`; script **không** ghi đè `adjudication.csv` đã có (dùng `--reset-adjudication` nếu muốn tạo lại). Script đánh giá mọi artifact `artifacts/*.joblib`, hoặc danh sách truyền qua `--models`.

## PhoBERT và bundle cho backend .NET

Giai đoạn 2 fine-tune `vinai/phobert-base-v2` trên NEU-ESC, hiệu chỉnh ngưỡng trên 200 mẫu `calibration` cục bộ rồi xuất ONNX. Giai đoạn 3 chạy model đó ngay trong backend .NET, không gọi API AI bên ngoài.

```powershell
# Fine-tune (cần GPU; xem scripts/train_phobert.py)
.\.venv\Scripts\python.exe scripts/train_phobert.py

# Hiệu chỉnh ngưỡng và đánh giá trên tập test local đóng băng
.\.venv\Scripts\python.exe scripts/calibrate_and_evaluate_local.py

# Xuất ONNX và kiểm tra khớp số học với PyTorch
.\.venv\Scripts\python.exe scripts/export_onnx.py

# Tạo bundle mà backend .NET nạp: model ONNX + tokenizer + model-card.json
.\.venv\Scripts\python.exe scripts/prepare_backend_model.py --force
```

`prepare_backend_model.py` ghi bundle vào `models/open-comment-sentiment/` ở gốc kho mã nguồn (bị Git bỏ qua vì riêng tệp ONNX đã hơn 500 MB). Backend đọc thư mục này qua khoá cấu hình `OpenCommentSentiment:ModelDirectory`.

Model card trong bundle **không tự nghĩ ra ngưỡng hay phiên bản**: script đọc chúng từ `src/Backend/SentimentWorker/appsettings.json`, đối chiếu với `appsettings.json` của API (và `OPEN_COMMENT_MODEL_VERSION` trong `.env` nếu có), rồi **từ chối đóng gói** khi có chỗ lệch. Vì vậy đổi ngưỡng hay đổi `RuleVersion` thì phải đổi ở **cả** `OpenCommentSentimentOptions.cs`, `appsettings.json` của API và của worker — test `tests/UnitTests/Infrastructure/OpenCommentConfigConsistencyTests.cs` canh việc này. Kiểm tra cấu hình chạy **trước khi** xoá bundle cũ, nên một tệp appsettings sai không phá mất bundle đang dùng được.

### Ai nạp model, và tốn bao nhiêu

Model **không** nằm trong tiến trình API. Phần suy luận là một tiến trình riêng ở
`src/Backend/SentimentWorker`, chạy một lượt rồi thoát:

```powershell
cd src\Backend\SentimentWorker
$env:DOTNET_ENVIRONMENT='Development'
dotnet run
```

Số đo trên máy dev:

| Tình huống | Thời gian | RAM đỉnh |
|---|---:|---:|
| Có 490 ý kiến cần phân tích | 87,5 giây | ~1,0 GB |
| Không còn gì để làm | 2,2 giây | không nạp model |

Model nạp **lười**: hàng đợi rỗng thì tiến trình thoát mà không mở tệp ONNX. Mã thoát `0` xong,
`2` không nạp được model, `3` có lô thất bại. Thêm `--watch` để theo dõi liên tục.

Lý do tách riêng: máy chủ triển khai chỉ có 1–2 vCPU và 2–4 GB RAM, để model thường trực trong
tiến trình API là chiếm mất khoảng một phần tư bộ nhớ máy cho một tính năng phụ.

### Gói pilot (chấm mù)

Giai đoạn 5 chạy ở **chế độ bóng**: model ghi nhãn cho ý kiến thật nhưng không ai dùng nhãn đó
để ra quyết định, cho tới khi có người chấm độc lập và đối chiếu.

```powershell
# 1. Lấy mẫu phân tầng theo nhãn model đã đoán, khử định danh, che nhãn model
.\.venv\Scripts\python.exe scripts/build_pilot_review_pack.py

# 2. Người chấm điền cột Sentiment trong pilot-annotation-sheet.csv

# 3. Đối chiếu và tính precision/recall/F1 từng lớp
.\.venv\Scripts\python.exe scripts/evaluate_pilot_pack.py
```

`build_pilot_review_pack.py` đọc thẳng từ PostgreSQL trong Docker (chỉ đọc,
`default_transaction_read_only=on`) và ghi vào `data/processed/pilot/` — thư mục bị Git bỏ qua,
vì cột `Text` là ý kiến gốc của sinh viên về giảng viên.

Bốn tệp sinh ra, **phải tách hai nhóm**:

| Tệp | Cho ai |
|---|---|
| `pilot-annotation-sheet.csv` | chuyên viên nghiệp vụ; cột `Sentiment` để trống |
| `pilot-model-predictions.csv` | **không đưa cho người chấm** — nhãn và độ tin cậy của model |
| `pilot-sample-map.csv`, `pilot-pack-summary.json` | lưu nội bộ để đối chiếu và truy vết |

Chấm mù là điều kiện để con số đo được có nghĩa: nhìn thấy nhãn của model trước thì người chấm
bị neo theo, và kết quả chỉ còn là mức đồng thuận giả. Mặc định lấy `25` câu mỗi lớp (tổng `100`)
vì lấy ngẫu nhiên thuần thì `Negative` (`61` câu) và `Mixed` (`39` câu) — hai lớp cần biết nhất —
chỉ chiếm vài dòng.

`evaluate_pilot_pack.py` báo ba phần:

1. **Precision từng lớp** — đọc trực tiếp được, không cần cân lại.
2. **Accuracy, recall, F1 đã cân lại trọng số về đúng phân bố thật**, kèm khoảng tin cậy bootstrap.
   Đừng đọc số chưa cân lại của mẫu cho ba chỉ số này: mẫu phân tầng `25/25/25/25` còn phân bố thật
   là `61/176/214/39`, nên tính thẳng trên mẫu là tính trên một phân bố lớp nhân tạo. Đây đúng là
   lỗi đã làm con số tập trộn của Giai đoạn 1 bị thổi lên (`0,6800` so với `0,6049` thật).
3. **Chất lượng khi dùng thật** — precision của tập bị gắn cờ (`Negative`/`Mixed` với độ tin cậy
   ≥ ngưỡng). Phần này mới là con số để ra quyết định. Cả ba đều kèm khoảng tin cậy Wilson 95%:
   với `100` câu, chênh lệch dưới khoảng `8` điểm phần trăm là chưa kết luận được. Câu nhãn
   `Uncertain` bị loại khỏi phép tính và đếm riêng.

### Dò lại quy tắc 5 nhãn (không cần gán nhãn thêm)

`Mixed` và `Uncertain` do quy tắc mệnh đề sinh ra chứ không phải do model. Nên khi hai nhãn này
kém, phải loại trừ khả năng "tại ngưỡng" trước khi nghĩ tới huấn luyện lại.

```powershell
# Lần đầu sẽ chạy model ONNX để dựng cache xác suất (cả ý kiến lẫn từng mệnh đề)
.\.venv\Scripts\python.exe scripts/tune_rule_thresholds.py

# Dùng lại cache, chạy lại rất nhanh
.\.venv\Scripts\python.exe scripts/tune_rule_thresholds.py

# Buộc chạy lại model để dựng cache mới
.\.venv\Scripts\python.exe scripts/tune_rule_thresholds.py --rebuild-cache
```

Script **tự kiểm trước khi dò**: ở cấu hình sản phẩm, replay phải tái hiện đúng
`artifacts/phobert-local-evaluation.json` (accuracy, macro F1 4 lớp, và ma trận nhầm lẫn). Không
khớp thì dừng — replay sai thì mọi kết luận dò tham số sau đó vô nghĩa.

Dò trên `calibration`, báo cáo trên `test` đóng băng. Mục tiêu là recall của tập bị gắn cờ với hai
ràng buộc: precision không xuống dưới `--precision-floor`, và recall `Negative` không thoái bộ
(ràng buộc này sinh ra từ chính lượt dò đầu tiên — xem chú thích trong script).

Kết quả lượt 20/09/2026: đổi ngưỡng **không có tác dụng gì** (312 cấu hình, chênh lệch bằng 0),
nhưng đổi cách xét mệnh đề từ `argmax` sang `mass` đưa recall `Mixed` từ `0,2241` lên `0,5862` và
accuracy từ `0,6600` lên `0,7650` trên tập test đóng băng, precision không đổi. Chi tiết và điều
kiện đưa vào sản phẩm ở `docs/plans/phan-loai-y-kien-mo-theo-cam-xuc.md` mục 5.8.

### Giải thích nguyên lý cho người không kỹ thuật

```powershell
# Chạy bộ ví dụ mặc định (đúng những câu dùng trong tài liệu giải thích)
.\.venv\Scripts\python.exe scripts/explain_examples.py

# Hoặc thử câu bất kỳ; truyền --text nhiều lần để thử nhiều câu
.\.venv\Scripts\python.exe scripts/explain_examples.py --text "Cô dạy hay nhưng chấm điểm khó"
```

Script dùng đúng tệp ONNX và đúng ngưỡng của bản chạy thật, in ra ba con số của cả câu, các mệnh đề
đã cắt kèm con số của từng mệnh đề, và nhãn cuối cùng kèm lý do. Dùng để demo tại chỗ khi trình bày,
và để **kiểm tra lại mọi con số** trong `docs/giai-thich-phan-loai-cam-xuc.md`.

Trên Windows, nếu tiếng Việt hiện sai dấu thì chạy `chcp 65001` hoặc đặt
`[Console]::OutputEncoding=[System.Text.Encoding]::UTF8` trong PowerShell trước khi chạy.

### Fixture đối chiếu giữa Python và C#

Backend port lại tokenizer và quy tắc 5 nhãn sang C#, nên cần hai fixture để phát hiện lệch âm thầm. Cả hai chỉ chứa **câu tổng hợp viết tay**, không chứa nội dung phản hồi của sinh viên:

```powershell
# 45 câu: so khớp token và input_ids của bản C# với tokenizer Python
.\.venv\Scripts\python.exe scripts/export_tokenizer_parity_fixture.py

# 44 câu: so khớp cả NHÃN lẫn ĐỘ TIN CẬY của toàn bộ đường suy luận C# với engine Python
.\.venv\Scripts\python.exe scripts/export_prediction_parity_fixture.py
```

Sinh lại hai fixture này mỗi khi đổi model, đổi ngưỡng hoặc đổi tokenizer, rồi chạy `dotnet test` ở `tests/UnitTests` để đối chiếu.

## Kết quả trong `artifacts/`

- `dataset-audit.json`: kiểm toán UIT-VSFC (số lượng, phân bố nhãn, hash, trùng lặp).
- `neu-esc-audit.json`: kiểm toán NEU-ESC gồm số dòng bị loại theo nhãn `Toxic`, checksum và đối chiếu `download-manifest.json`.
- `data-card.json` / `data-card.md`: hồ sơ nguồn, giấy phép, điều kiện truy cập, ánh xạ nhãn và các điều kiện còn thiếu.
- `baseline-results.json`: metric đầy đủ của từng thí nghiệm và từng nguồn.
- `baseline-report.md`: báo cáo đọc nhanh kèm bảng đối chứng theo nguồn.
- `<nguon>__<model>.joblib`: pipeline đã huấn luyện, chỉ phục vụ thử nghiệm offline.
- `local-domain-gap.json`: kết quả baseline trên tập test local đóng băng.
- `regression-predictions.json`: dự đoán trên fixture tổng hợp, dùng để so sánh hồi quy giữa các lần chạy.
- `phobert_checkpoint/`: checkpoint PhoBERT đã fine-tune kèm tokenizer (`vocab.txt`, `bpe.codes`, `added_tokens.json`).
- `phobert-sentiment.onnx`: model đã xuất ONNX (opset 14, batch và độ dài động).
- `phobert-training-summary.json`: tham số huấn luyện, trọng số lớp và metric trên test NEU-ESC.
- `phobert-local-evaluation.json` / `.md`: ngưỡng hiệu chỉnh, metric từng lớp và ma trận nhầm lẫn trên 200 câu test local đóng băng.
- `data/fixtures/tokenizer-parity.json`, `data/fixtures/phobert-prediction-parity.json`: fixture tổng hợp để đối chiếu bản C# với Python (được Git theo dõi vì chỉ chứa câu viết tay).
- `models/open-comment-sentiment/`: bundle backend .NET nạp, tạo bằng `scripts/prepare_backend_model.py` (bị Git bỏ qua).
- `data/processed/review/`: hai phiếu gán nhãn đã che dự đoán mô hình, `model-screening.csv`, `split-assignment.csv` (200 calibration + 200 test), `adjudication.csv` và `agreement-summary.json`.
- `data/processed/pilot/`: gói pilot chấm mù (`pilot-annotation-sheet.csv`, `pilot-model-predictions.csv`, `pilot-sample-map.csv`, `pilot-pack-summary.json`).
- `pilot-evaluation.json` / `pilot-evaluation.md`: kết quả đối chiếu nhãn người chấm với nhãn model (chỉ có sau khi chấm xong).
- `local-finetune-evaluation.json` / `.md`: kết quả thí nghiệm fine-tune tiếp trên 200 câu `calibration`, đo trên 200 câu `test` đóng băng (`scripts/finetune_local_calibration.py`). Đây là **thí nghiệm dò hướng**, không phải model để phát hành — xem mục 5.10 của kế hoạch.
- `phobert_local_finetune/`: checkpoint sinh ra bởi thí nghiệm trên, để xuất ONNX mà không phải huấn luyện lại.
- `docs/annotation-guideline-v1.md`: hướng dẫn gán nhãn cho người làm, gồm quy tắc biên và ví dụ chuẩn.

## Giới hạn hiện tại

- Dữ liệu local thực tế: 490 phiếu có ý kiến mở, trong đó **400 câu duy nhất hợp lệ** (trên tổng số 459 câu duy nhất toàn bộ), đáp ứng mục tiêu 200–400 mẫu duy nhất của kế hoạch để phục vụ tách riêng các tập thử nghiệm.
- **Gán nhãn local đã xong**: 400 câu được hai người gán độc lập, Cohen's Kappa `0,9291`, 21 câu bất đồng đã được phân xử, tập gold khoá tại `data/processed/local-gold.csv` (200 calibration + 200 test đóng băng).
- Model PhoBERT v1 **chưa đạt tiêu chí chấp nhận** của kế hoạch: Macro F1 `0,7385` và recall `Negative` `0,7294` trên test NEU-ESC, đều dưới ngưỡng `0,80`. Chưa được bật mặc định cho tới khi đạt.
- Số liệu chất lượng ở đây đều đo trên tập công khai. Lượt chấm pilot đầu tiên (100 câu, 20/09/2026) cho Macro F1 `0,5740` và recall `Negative` `0,5613` sau khi cân lại trọng số — **chưa đạt** ngưỡng `0,80`. Lượt này đo trên dữ liệu **sinh theo mẫu câu** trong cơ sở dữ liệu phát triển, không phải phản hồi thật, nên chỉ là tín hiệu đầu chứ không phải nghiệm thu. Chi tiết ở `docs/plans/phan-loai-y-kien-mo-theo-cam-xuc.md` mục 5.3.
- Cạnh đáng dùng: **precision của tập bị gắn cờ là `1,0000`** (`50/50`) — khi mô hình dám gắn cờ thì không sai lần nào trong mẫu này. Nhưng recall `Negative` `0,5613` và `Mixed` `0,1675` nghĩa là bỏ sót nhiều, nên không được đọc "không gắn cờ" thành "không có vấn đề".
- **Không lượng tử hóa INT8.** Vấn đề bộ nhớ đã được giải bằng cách tách worker sang tiến trình riêng, nên không phải đánh đổi độ chính xác của lớp `Negative` — lớp đang yếu nhất — để tiết kiệm thêm.
- **Fine-tune tiếp trên 200 câu `calibration` (20/09/2026) là hướng đi có tiến bộ thật nhưng chưa mở được cổng.** Trên tập `test` đóng băng: accuracy `0,7650` → `0,9000`, macro F1 (đủ 5 nhãn) `0,6024` → `0,7111`, recall `Mixed` `0,5862` → `0,9310`, và precision của nhóm bị gắn cờ tăng `0,8293` → `0,8953` trong khi nhóm đó gấp đôi (`41` → `86` câu). Nhưng recall `Negative` chỉ nhích `0,5385` → `0,5897`, nên **vẫn chưa đạt** ngưỡng `0,80`. Cảnh báo quan trọng: tập train và tập test cùng một đợt khảo sát và cùng loại văn bản sinh theo mẫu câu, nên phần lớn mức tăng có thể là thích nghi miền — phải chấm lại trên học kỳ khác mới biết. Chi tiết ở `docs/plans/phan-loai-y-kien-mo-theo-cam-xuc.md` mục 5.10.
- Cả 400 câu local đều thuộc một đợt khảo sát (`2026-09`), chưa đáp ứng yêu cầu phủ nhiều học kỳ/đợt ở mục 7.3 của kế hoạch.
- Sáu mô hình (3 thí nghiệm × 2 thuật toán) chỉ cùng cho một nhãn ở **29,25%** số câu local. Mô hình học UIT-VSFC gần như không bao giờ dự đoán `Neutral` trên dữ liệu thật của trường (1–3 trên 400 câu) và đoán tới 68–69% là `Negative` — dấu hiệu mất hiệu lực ngoài miền, cần nhãn người gán để kết luận.
- NEU-ESC khai báo `Apache-2.0` trong metadata, nhưng phần mô tả trong dataset card chỉ ghi "open-source license for research and educational purposes". Cần xác nhận với nhóm tác giả trước khi phân phối artifact phái sinh ra ngoài nhóm dự án.
- UIT-VSFC không có tệp giấy phép nên chỉ dùng cho nghiên cứu/đánh giá nội bộ và làm benchmark.
- Không đưa dữ liệu raw, model thử nghiệm hoặc nội dung phản hồi local vào Git.

