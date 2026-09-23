# Chạy phân tích cảm xúc trên máy chủ

Thư mục này có ba unit, chọn **một trong hai cách chạy** — đừng bật cả hai cùng lúc, vì hai tiến
trình worker cùng chạy là hai bản model trong RAM:

| Cách | Unit | Khi nào dùng |
| --- | --- | --- |
| **Theo lịch** | `khaosatvmu-sentiment.service` + `.timer` | Mặc định. Không ai cần số liệu trong ngày; máy chủ càng rảnh càng tốt |
| **Chạy nền** | `khaosatvmu-sentiment-daemon.service` | Khi cần *bấm là có ngay*: đang họp, vừa chốt đợt, vừa lên model/quy tắc mới |

## Hai cách khác nhau ở đâu

| | Theo lịch (timer) | Chạy nền (daemon) |
| --- | --- | --- |
| Độ trễ từ lúc nộp phiếu tới lúc số liệu đổi | tới mốc lịch kế tiếp (mặc định 02:00) | **≤ 15 giây**, cộng thời gian nạp model nếu vừa rảnh xong |
| RAM lúc rảnh | 0 (tiến trình đã thoát) | **~85 MB** (đo trên máy phát triển, model chưa nạp) |
| RAM khi đang suy luận | ~1,0 GB trong lúc chạy | ~1,0 GB, **chỉ trong lúc có việc** |
| Nhả model khi rảnh | không áp dụng | có, sau `OPEN_COMMENT_IDLE_UNLOAD_SECONDS` (mặc định 120 giây) |
| Chi phí mỗi lượt không có việc gì | 2,2 giây, không nạp model | một truy vấn đếm mỗi 15 giây |

Chạy nền **không** có nghĩa là giữ model thường trực: sau khi rảnh, worker giải phóng phiên ONNX và
trả lại khoảng 1 GB cho hệ điều hành; lần có việc sau sẽ nạp lại tệp 515 MB. Vì vậy đừng đặt
`OPEN_COMMENT_IDLE_UNLOAD_SECONDS` quá nhỏ — với vài ý kiến mới, công nạp model còn lớn hơn công
suy luận.

## Cài đặt cách chạy theo lịch

```bash
sudo cp deploy/systemd/khaosatvmu-sentiment.service /etc/systemd/system/
sudo cp deploy/systemd/khaosatvmu-sentiment.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now khaosatvmu-sentiment.timer
```

Không đặt repo ở `/home/khaosatvmu` thì dùng drop-in thay vì sửa thẳng unit đã cài:

```bash
sudo systemctl edit khaosatvmu-sentiment.service
# [Service]
# WorkingDirectory=/duong/dan/that
```

## Cài đặt cách chạy nền

```bash
sudo cp deploy/systemd/khaosatvmu-sentiment-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now khaosatvmu-sentiment-daemon.service
```

Không đặt repo ở `/home/khaosatvmu` thì dùng drop-in thay vì sửa thẳng unit đã cài:

```bash
sudo systemctl edit khaosatvmu-sentiment-daemon.service
# [Service]
# WorkingDirectory=/duong/dan/that
```

Muốn số liệu lên nhanh hơn 15 giây thì sửa `OPEN_COMMENT_SCAN_INTERVAL_SECONDS` trong unit — mỗi
vòng quét không có việc chỉ là một truy vấn đếm, nên hạ xuống 5 giây cũng không đáng kể.


## Vì sao chạy nền vẫn phải nhả model

Worker giữ model ONNX **~1,0 GB RAM** và **một nhân CPU** trong lúc suy luận. Máy chủ triển khai
chỉ có 2 vCPU / 4 GB RAM và còn phải phục vụ API, PostgreSQL và nginx. Nên chạy nền **không** có
nghĩa là được ôm model thường trực: tiến trình ở lại để bắt việc nhanh, còn model phải được trả lại
khi rảnh. Đo trên máy phát triển:

| Trạng thái | RAM thường trú |
| --- | ---: |
| Rảnh, model chưa nạp hoặc đã nhả | **85 MB** |
| Đang suy luận | **~1,0 GB** (1007 MB) |

Khi chạy `--watch` trên máy từ 2 nhân trở xuống, worker tự ghi một dòng cảnh báo — nhắc nhở, không chặn.

## Điều kiện trước khi cài

1. Máy chủ có `docker` và `docker compose` (v2) tại `/usr/bin/docker`.
2. Repo nằm ở `/home/khaosatvmu` (đổi lại trong unit nếu khác) và có tệp `.env` với secret thật,
   quyền `600`. Docker Compose đọc `.env` từ thư mục làm việc.
3. **`models/open-comment-sentiment/` phải có đủ tệp model.** Thư mục này bị `.gitignore`, nên nó
   không đi theo `git clone`: cần chép tay.
   - `phobert-sentiment.onnx` (~515 MiB)
   - `vocab.txt`, `bpe.codes`, `added_tokens.json`, `tokenizer_config.json`

   Thiếu model thì worker thoát với mã `2` và không phân tích gì cả.

## Chạy thử và kiểm tra

```bash
# Chạy ngay một lượt, không chờ tới 02:00
sudo systemctl start khaosatvmu-sentiment.service

# Xem kết quả
systemctl status khaosatvmu-sentiment.service
journalctl -u khaosatvmu-sentiment.service -n 60 --no-pager

# Xem lịch chạy kế tiếp
systemctl list-timers khaosatvmu-sentiment.timer
```

Nhật ký kết thúc bằng dòng `Phân tích cảm xúc kết thúc: thêm N, cập nhật M, model ...`.

Kiểm tra bộ nhớ đã được trả lại: sau khi lượt chạy xong, `docker stats --no-stream` không còn
container `khaosatvmu_sentiment_worker`, và `systemctl status` trả về `inactive (dead)`.

## Mã thoát

`Type=oneshot` nên mã thoát là tín hiệu sức khoẻ duy nhất; unit thất bại thì `systemctl --failed`
hiện lên.

| Mã | Nghĩa | Việc cần làm |
| --- | --- | --- |
| `0` | Xong việc | Không |
| `2` | Không nạp được model | Kiểm tra tệp trong `models/open-comment-sentiment/` |
| `3` | Có lô phân tích thất bại | Xem `journalctl`; thường là lỗi kết nối cơ sở dữ liệu |
| `137` | Bị giết vì vượt trần bộ nhớ | Nâng `SENTIMENT_MEM_LIMIT` **chỉ khi** máy chủ còn RAM thật |

## Đổi lịch hoặc tắt

```bash
sudo systemctl edit khaosatvmu-sentiment.timer
# [Timer]
# OnCalendar=*-*-* 2,14:00:00      # hai lượt mỗi ngày

sudo systemctl disable --now khaosatvmu-sentiment.timer
```

Lượt chạy theo lịch chỉ nhặt những ý kiến **chưa có kết quả đúng cả `ModelVersion` lẫn `RuleVersion`**.
Nghĩa là đổi model, đổi quy tắc, hoặc đổi `ConfidenceThreshold`/`MixedThreshold` đều làm kết quả cũ
tự thành "còn nợ" và lượt chạy kế tiếp phân tích lại — không cần ai nhớ làm gì thêm.

Chạy lại **cùng một phiên bản** cho những ý kiến đã có kết quả là việc khác: gọi
`POST /api/v1/reports/open-comments/reanalyze` với `force = true` (quyền `OPEN_COMMENT_MODEL_ADMIN`).
Endpoint đó chỉ **xếp hàng** và không xoá nhãn do người chấm tay; đến kỳ thì worker vẫn phải chạy.
Màn hình quản trị cho endpoint này **chưa có**, hiện phải gọi bằng tay qua API.
