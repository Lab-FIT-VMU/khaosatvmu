# Hướng dẫn gán nhãn cảm xúc — phiên bản 1

Tài liệu dành cho người gán nhãn của tập local. Chốt theo mục 0.4 của `docs/plans/phan-loai-y-kien-mo-theo-cam-xuc.md`.

## 1. Bạn sẽ làm gì

Điền cột `Sentiment` trong file phiếu gán nhãn của mình. Mỗi dòng là một ý kiến mở của sinh viên đã được **ẩn danh** (che email, URL, số điện thoại).

- File của bạn: `annotator-a.csv` hoặc `annotator-b.csv`.
- Số dòng: 400.
- Thứ tự câu đã bị xáo trộn khác nhau giữa hai người, nên bạn không thể suy ra nhãn của người kia.
- **Hai người gán độc lập.** Không trao đổi, không xem file của nhau trong lúc gán.

## 2. Năm nhãn được phép

| Nhãn | Khi nào dùng |
|---|---|
| `Positive` | Nội dung chủ yếu là ghi nhận, khen ngợi, hoặc hài lòng rõ ràng |
| `Negative` | Nội dung chủ yếu phản ánh vấn đề, không hài lòng, hoặc yêu cầu khắc phục một thiếu sót rõ ràng |
| `Neutral` | Cung cấp thông tin hoặc đề xuất, nhưng **không** thể hiện rõ hài lòng hay không hài lòng |
| `Mixed` | Có ít nhất một mệnh đề tích cực và một mệnh đề tiêu cực, cả hai đều có ý nghĩa độc lập |
| `Uncertain` | Không đủ thông tin để kết luận: quá ngắn, mơ hồ, vô nghĩa, hoặc thiếu ngữ cảnh |

Ghi **đúng một** nhãn mỗi dòng, đúng chính tả như trong bảng trên (phân biệt chữ hoa chữ thường).

## 3. Quy tắc biên — chỗ hay gây bất đồng nhất

**`Neutral` khác `Uncertain`.**
- `Neutral` là một **kết luận**: câu này không mang sắc thái rõ rệt.
- `Uncertain` là **chưa đủ căn cứ kết luận**: câu quá ngắn, vô nghĩa, hoặc không hiểu được.
- “Không có ý kiến”, “không”, “ok”, ký tự thử nghiệm, nội dung vô nghĩa → `Uncertain`, **không** gán `Neutral`.

**Đề xuất không tự động là tiêu cực.**
- “Nên đăng tài liệu sớm hơn” → `Neutral`.
- “Tài liệu luôn đăng quá muộn làm sinh viên không chuẩn bị được” → `Negative`.

**Không phải thấy chữ “nhưng” là gán `Mixed`.**
- Chỉ gán `Mixed` khi **cả hai vế** đều có nội dung cảm xúc rõ ràng.
- “Cô rất nhiệt tình nhưng phòng học chật” → `Mixed`.
- “Thầy dạy dễ hiểu nhưng em chưa học bài” → vế sau không phải nhận xét về giảng viên/môn học, nên không phải `Mixed`.

**Châm biếm, phủ định kép, thiếu ngữ cảnh** → ưu tiên `Uncertain` và bật cờ `NeedsAdjudication`.

**Chỉ dựa vào nội dung câu.** Không suy đoán từ điểm phiếu, học phần, khoa, bộ môn hay giảng viên. Không suy diễn thêm ngữ cảnh mà câu không nói.

## 4. Ví dụ chuẩn

| Nội dung | Nhãn |
|---|---|
| “Giảng viên nhiệt tình, bài giảng dễ hiểu.” | `Positive` |
| “Nội dung quá nhanh và thầy ít giải đáp thắc mắc.” | `Negative` |
| “Nên bổ sung thêm một buổi thực hành.” | `Neutral` |
| “Cô hướng dẫn rất tận tâm nhưng lịch kiểm tra thay đổi quá nhiều.” | `Mixed` |
| “Không có ý kiến.” | `Uncertain` |
| “Thầy dạy không dễ hiểu chút nào.” | `Negative` |
| “Không phải là thầy dạy dở, chỉ là em chưa theo kịp.” | `Uncertain` |
| “sv k học đc j” | `Negative` |
| “Hay quá, bài tập nhiều không kịp thở :)))” | `Uncertain` |
| “!!!” · “asdfgh” | `Uncertain` |
| “Phòng học nóng và máy chiếu mờ.” | `Negative` |
| “Cần thêm ví dụ thực tế vì lý thuyết hơi nhiều.” | `Neutral` |
| “Nội dung ổn.” | `Uncertain` |
| “thầy dạy hay lắm lun á mà cho bài tập hơi nhìu” | `Mixed` |

## 5. Cách điền file

Mở `annotator-a.csv` (hoặc `annotator-b.csv`) bằng Excel / LibreOffice / Google Sheets. Giữ nguyên các cột có sẵn, chỉ điền thêm:

| Cột | Điền gì |
|---|---|
| `Sentiment` | Một trong năm nhãn ở mục 2. Bắt buộc. |
| `NeedsAdjudication` | `Y` nếu bạn thấy câu khó, châm biếm, viết tắt khó hiểu, thiếu ngữ cảnh, hoặc bạn phải cân nhắc giữa hai nhãn. Để trống nếu bình thường. |
| `AnnotatorNotes` | Tuỳ chọn. Ghi ngắn lý do khi bạn bật `NeedsAdjudication` hoặc khi thấy nội dung cần lưu ý. |

**Không sửa** cột `SampleId`, `Text`, `SourceGroup`, `LengthBucket`, không thêm cột, không xoá dòng, không đổi thứ tự.

Quy trình gợi ý: đọc **hết cả câu** trước khi chọn nhãn, đừng chọn theo vài từ đầu. Nếu một câu quá 2 phút vẫn lưỡng lự, chọn nhãn bạn nghiêng về nhiều nhất và bật `NeedsAdjudication`.

## 6. Sau khi gán xong

Lưu file, đặt đúng tên cũ. Nơi phụ trách gán nhãn sẽ chạy:

```powershell
.\.venv\Scripts\python.exe scripts/build_local_gold.py
```

Script kiểm tra tiến độ, báo lỗi nếu có nhãn sai, đo mức đồng thuận giữa hai người và tạo `adjudication.csv` chỉ gồm các câu bất đồng.

Yêu cầu chất lượng: **Cohen's Kappa tối thiểu `0,75`** giữa hai người gán trước khi khoá tập train. Nếu thấp hơn, hướng dẫn này phải được sửa và hai người gán lại các câu bất đồng — không được hạ chuẩn để cho qua.

## 7. Người gán **không được** biết gì

- Không xem `model-screening.csv` (chứa dự đoán của 6 mô hình) trước khi gán xong.
- Không xem `split-assignment.csv` (câu nào thuộc calibration hay tập test đóng băng).
- Không xem file của người gán kia.

Biết trước những thông tin này sẽ làm nhãn bị lệch và toàn bộ metric về sau mất giá trị.
