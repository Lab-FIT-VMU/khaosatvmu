# Open-comment sentiment baseline

Pipeline ngoại tuyến cho Giai đoạn 1 của kế hoạch phân loại ý kiến mở. Pipeline không kết nối database và không sửa dữ liệu ứng dụng.

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
# 2. Đăng nhập máy local bằng một trong hai cách
huggingface-cli login                          # ghi token vào ~/.cache/huggingface/token
$env:HF_TOKEN = "<token cua ban>"              # hoặc đặt biến môi trường
# 3. Tải và kiểm toán
.\\.venv\\Scripts\\python.exe scripts/download_neu_esc.py
.\\.venv\\Scripts\\python.exe scripts/audit_neu_esc.py
```

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
.\.venv\Scripts\python.exe scripts/prepare_local_sample.py --input data/raw/local/local-comments.csv --group-column SurveyPeriod --sample-size 400
.\.venv\Scripts\python.exe scripts/create_local_review_pack.py
```

Sau khi hai người hoàn thành độc lập `annotator-a.csv` và `annotator-b.csv`, người phân xử tạo `local-gold.csv` theo cùng schema với cột `Sentiment`. Chạy đánh giá:

```powershell
.\.venv\Scripts\python.exe scripts/evaluate_local_gold.py --input data/processed/local-gold.csv
```

Script đánh giá mọi artifact `artifacts/*.joblib`, hoặc danh sách truyền qua `--models`.

## Kết quả trong `artifacts/`

- `dataset-audit.json`: kiểm toán UIT-VSFC (số lượng, phân bố nhãn, hash, trùng lặp).
- `neu-esc-audit.json`: kiểm toán NEU-ESC gồm số dòng bị loại theo nhãn `Toxic`, checksum và đối chiếu `download-manifest.json`.
- `data-card.json` / `data-card.md`: hồ sơ nguồn, giấy phép, điều kiện truy cập, ánh xạ nhãn và các điều kiện còn thiếu.
- `baseline-results.json`: metric đầy đủ của từng thí nghiệm và từng nguồn.
- `baseline-report.md`: báo cáo đọc nhanh kèm bảng đối chứng theo nguồn.
- `<nguon>__<model>.joblib`: pipeline đã huấn luyện, chỉ phục vụ thử nghiệm offline.
- `local-domain-gap.json`: kết quả baseline trên tập test local đóng băng.
- `regression-predictions.json`: dự đoán trên fixture tổng hợp, dùng để so sánh hồi quy giữa các lần chạy.

## Giới hạn hiện tại

- Dữ liệu local thực tế: 490 phiếu có ý kiến mở, trong đó **400 câu duy nhất hợp lệ** (trên tổng số 459 câu duy nhất toàn bộ), đáp ứng mục tiêu 200–400 mẫu duy nhất của kế hoạch để phục vụ tách riêng các tập thử nghiệm.
- Chưa có tập gold local đóng băng, nên chưa có báo cáo domain gap và chưa được coi là sẵn sàng production.
- NEU-ESC khai báo `Apache-2.0` trong metadata, nhưng phần mô tả trong dataset card chỉ ghi "open-source license for research and educational purposes". Cần xác nhận với nhóm tác giả trước khi phân phối artifact phái sinh ra ngoài nhóm dự án.
- UIT-VSFC không có tệp giấy phép nên chỉ dùng cho nghiên cứu/đánh giá nội bộ và làm benchmark.
- Không đưa dữ liệu raw, model thử nghiệm hoặc nội dung phản hồi local vào Git.

