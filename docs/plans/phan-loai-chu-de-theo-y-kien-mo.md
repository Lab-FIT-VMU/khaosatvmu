# Phân loại chủ đề ý kiến mở — taxonomy và quy trình gán nhãn (Giai đoạn 6)

> **Trạng thái: BẢN NHÁP, chưa được duyệt.** Tài liệu này chốt *đề xuất* taxonomy để trường đọc và
> quyết. Giai đoạn 6 chỉ bắt đầu sau khi mục "Cần trường quyết" ở §7 được trả lời — taxonomy sai
> thì công gán nhãn đổ đi, vì nhãn chủ đề không sửa được bằng cách chỉnh ngưỡng như cảm xúc.

## 1. Mục đích

Giai đoạn 1–5 đã trả lời "ý kiến này khen hay chê". Giai đoạn 6 trả lời **"ý kiến này nói về
chuyện gì"**, để màn báo cáo trả lời được câu hỏi quản trị thật: *sinh viên phàn nàn nhiều nhất về
khối lượng học hay về cơ sở vật chất?*

Hai trục **độc lập**, không suy ra nhau:

| Trục | Số nhãn | Cách gán |
| --- | --- | --- |
| Cảm xúc (đã có) | 5 (`Positive`, `Negative`, `Neutral`, `Mixed`, `Uncertain`) | Model 3 lớp + quy tắc |
| Chủ đề (giai đoạn này) | 10 mã (§3) | Model đa nhãn, ngưỡng riêng từng chủ đề |

"Phòng học nóng và máy chiếu mờ" là `Negative` **và** `Facilities`. "Nên đăng tài liệu sớm hơn" là
`Neutral` và `Materials`. Không suy chủ đề từ nhãn cảm xúc, và không suy cảm xúc từ chủ đề.

## 2. Nguyên tắc

1. **Đa nhãn thật.** Một ý kiến được gán 0, 1 hoặc nhiều chủ đề. Không có "chủ đề chính".
2. **Không gán chủ đề cho câu vô nghĩa.** "Không có ý kiến", "ok", ký tự thử nghiệm → danh sách
   chủ đề **rỗng**, không phải `Other`. `Other` dành cho ý kiến có nghĩa nhưng nằm ngoài taxonomy.
3. **Câu càng ngắn càng ít chủ đề.** Thà thiếu một chủ đề phụ còn hơn gán bừa: báo cáo dùng số đếm
   theo chủ đề, nên một nhãn thừa làm sai cả một con số tổng hợp.
4. **Chủ đề mô tả nội dung, không mô tả mức độ.** "Bài tập quá nhiều" và "bài tập vừa phải" đều là
   `Assessment`; khác nhau ở cảm xúc.
5. **Không dùng chủ đề để thay thế cảm xúc.** `Facilities` không có nghĩa là tiêu cực.

## 3. Taxonomy phiên bản 1 (đề xuất)

| Mã | Nhãn hiển thị | Gán khi ý kiến nói về | Ví dụ |
| --- | --- | --- | --- |
| `TeachingMethod` | Phương pháp giảng dạy | Cách dạy, cách truyền đạt, tương tác trên lớp, ví dụ minh hoạ | "Thầy cho nhiều ví dụ thực tế nên dễ hiểu" |
| `LecturerSupport` | Thái độ và hỗ trợ của giảng viên | Thái độ, sự tận tâm, giải đáp thắc mắc, hỗ trợ ngoài giờ | "Cô trả lời email rất nhanh" |
| `CourseContent` | Nội dung học phần | Kiến thức, đề cương, mức độ cập nhật, độ sâu | "Nội dung còn cũ so với thực tế ngành" |
| `Materials` | Tài liệu học tập | Slide, giáo trình, bài đọc, thời điểm đăng tài liệu | "Slide không khớp với bài giảng" |
| `Assessment` | Bài tập, kiểm tra, đánh giá | Số lượng bài tập, cách chấm, đề kiểm tra, thang điểm | "Đề kiểm tra giữa kỳ khó hơn nhiều so với bài tập" |
| `Workload` | Khối lượng và tốc độ giảng dạy | Số chương trong một buổi, nhịp độ, thời gian dành cho mỗi phần | "Mỗi buổi đi quá nhanh, không kịp ghi bài" |
| `Schedule` | Lịch học và tổ chức lớp | Giờ học, đổi lịch, thời lượng buổi, thông báo của lớp | "Lịch kiểm tra thay đổi liên tục" |
| `Facilities` | Cơ sở vật chất, phòng học, thiết bị | Phòng học, máy chiếu, điều hoà, chỗ ngồi, âm thanh | "Phòng học nóng và máy chiếu mờ" |
| `Lms` | Hệ thống học tập trực tuyến | Trang môn học, nộp bài online, tài khoản, lỗi truy cập | "Nộp bài trên hệ thống cứ bị out" |
| `Other` | Ý kiến khác | Có nội dung nhưng không thuộc chín nhóm trên | "Mong nhà trường bố trí thêm chỗ gửi xe" |

## 4. Quy tắc biên

Những cặp dưới đây là chỗ hai người gán nhãn hay lệch nhau nhất, nên phải chốt trước khi gán:

| Tình huống | Quyết định |
| --- | --- |
| "Bài tập quá nhiều" | `Assessment` + `Workload` — vừa nói về bài tập, vừa nói về khối lượng |
| "Giảng nhanh quá, không hiểu bài" | `Workload` + `TeachingMethod` |
| "Tài liệu đăng muộn" | `Materials`; thêm `Lms` chỉ khi muốn nói tới *hệ thống* đăng tài liệu |
| "Slide khó đọc" | `Materials` (không phải `TeachingMethod`: nói về tài liệu, không về cách dạy) |
| "Máy chiếu hỏng" | `Facilities`; thêm `TeachingMethod` chỉ khi ý kiến nói việc đó ảnh hưởng tới cách dạy |
| "Điểm danh muộn giờ" | `Schedule` (tổ chức lớp), không phải `Assessment` |
| Câu khen chung chung, không nói về gì cụ thể | Không gán chủ đề nào, để rỗng |
| "Không có ý kiến" / "ok" | Rỗng, không phải `Other` |
| Ý kiến chỉ nói về hành chính, học phí, ký túc xá | `Other` (và ghi vào mục "Cần trường quyết" nếu lặp nhiều) |

## 5. Quy trình gán nhãn

Dùng lại đúng công cụ và kỷ luật của Giai đoạn 5, không dựng thêm hệ thống:

1. Sinh gói chấm từ `ml/open_comment_sentiment/scripts/build_pilot_review_pack.py` (đã có), thêm
   cột chủ đề: mỗi chủ đề một cột `0/1`, **không** dùng một cột văn bản.
2. **Hai người gán độc lập**, chấm mù như Giai đoạn 5: phiếu không chứa dự đoán của model.
3. Đo **Cohen's Kappa theo từng chủ đề**, không đo gộp: một chủ đề hiếm có Kappa thấp sẽ bị tổng
   hợp che mất, mà nó lại đúng là chủ đề cần sửa guideline nhất.
4. Người thứ ba phân xử mọi mẫu bất đồng; ghi lý do vào cột `Notes` (lượt pilot trước để trống nên
   không biết vì sao chuyên viên chọn nhãn ở các câu bất đồng — lần này không lặp lại).
5. Khoá tập gold; chia calibration/test như Giai đoạn 1 (tỉ lệ hiện dùng: 50/50).
6. Chỉ khi Kappa từng chủ đề ≥ 0,75 mới đưa vào tập train.

**Chi phí phải nói trước:** mỗi câu là 10 quyết định thay vì 1. Với 400 câu gold hiện có, đó là
4.000 quyết định cho **mỗi** người gán. Cần hai người, tức 8.000 quyết định — lớn hơn nhiều so với
lượt cảm xúc. Nếu trường chỉ có một người làm được, thì phải hạ tham vọng: chốt taxonomy ít chủ đề
hơn (xem §7) chứ không hạ tiêu chuẩn đo.

## 6. Tiêu chí chấp nhận (đề xuất, khác gate của cảm xúc)

Gate cảm xúc ở mục 0.5 (macro F1 ≥ 0,80) **không** áp cho chủ đề, vì:

- chủ đề là bài toán **đa nhãn** nên macro F1 bị chi phối bởi các chủ đề hiếm;
- 400 câu hiện có chỉ cho vài dương tính ở những chủ đề như `Lms` hay `Facilities`, mà đo recall
  trên 5 dương tính là đo nhiễu.

Đề xuất:

| Chỉ tiêu | Ngưỡng | Điều kiện áp dụng |
| --- | --- | --- |
| Precision từng chủ đề | ≥ 0,70 | Chủ đề có ≥ 15 mẫu dương trong tập test |
| Recall từng chủ đề | ≥ 0,60 | Chủ đề có ≥ 30 mẫu dương trong tập test |
| F1 từng chủ đề | ≥ 0,50 | Điều kiện phát hành: chủ đề dưới ngưỡng này thì **không hiện** trên giao diện |
| Tỷ lệ `Other` | ≤ 10% số ý kiến đã gán | Vượt thì taxonomy thiếu nhóm, phải bổ sung chứ không phải siết ngưỡng |

Chủ đề không đủ mẫu để đo thì báo cáo rõ là **chưa đo được**, không suy ra từ chủ đề khác.

## 7. Việc cần trường quyết trước khi bắt đầu

1. **Danh sách chủ đề cuối cùng.** Mười mã ở §3 là đề xuất; quan trọng nhất là hai câu hỏi: có tách
   `Workload` khỏi `TeachingMethod` không, và có cần nhóm riêng cho hành chính/học phí/ký túc xá
   (hiện đang nằm trong `Other`) không.
2. **Ai gán nhãn và gán được bao nhiêu.** Xem chi phí ở §5.
3. **Ý kiến về cơ sở vật chất có thuộc phạm vi màn "ý kiến mở" không.** Hiện màn này gắn với giảng
   viên và học phần, nên một phàn nàn về điều hoà không thuộc về ai cả; nếu vẫn gán `Facilities` thì
   phải nói rõ trên giao diện đây là thống kê toàn trường, không phải đánh giá giảng viên.
4. **Có dùng được nguồn công khai nào cho chủ đề không.** UIT-VSFC có nhãn chủ đề nhưng **không có
   tệp LICENSE** (xem §1.7 của kế hoạch) nên không dùng được cho artifact triển khai; NEU-ESC chỉ có
   ba lớp cảm xúc, không có chủ đề. Nghĩa là tập train chủ đề gần như chắc chắn phải là dữ liệu của
   trường tự gán.

## 8. Việc kỹ thuật phải làm (sau khi §7 được trả lời)

- [ ] Dạy model đa nhãn (sigmoid từng chủ đề, BCE có trọng số theo tần suất), ngưỡng riêng từng chủ
      đề hiệu chỉnh trên tập calibration.
- [ ] **Thêm cột phiên bản cho model chủ đề** trước khi ghi nhãn chủ đề vào cơ sở dữ liệu. Đây là
      bài học đã trả giá ở mục 5.8: kết quả cảm xúc từng không có phiên bản cho quy tắc, nên đổi
      quy tắc xong thì nhãn cũ nằm im mà không ai biết. Chủ đề là **model thứ hai**, nên cần phiên
      bản riêng (`TopicModelVersion`), không dùng chung `ModelVersion` với cảm xúc.
- [ ] Ghi kết quả vào `TopicCodesJson` (cột `jsonb` đã có sẵn từ migration `20260920092403`).
- [ ] Thêm vào DTO từng ý kiến (`TopicCodes`) và vào báo cáo tổng hợp theo chủ đề.
- [ ] Bộ lọc kết hợp ở giao diện (`Negative + Assessment`) và cột chủ đề trong file Excel — cả hai
      đã bị hoãn có chủ đích ở mục 4.2 cho tới khi có taxonomy.
- [ ] Unit test cho ánh xạ mã ↔ nhãn hiển thị, và fixture chẵn lẻ với bản Python như đã làm cho
      tokenizer và dự đoán cảm xúc.

## 9. Rủi ro

| Rủi ro | Biện pháp |
| --- | --- |
| Chủ đề hiếm không đủ mẫu để đo | Báo cáo "chưa đo được"; không phát hành chủ đề đó lên giao diện |
| `Other` phình to | Theo dõi tỷ lệ; vượt 10% thì sửa taxonomy, không siết ngưỡng |
| Hai người gán lệch nhau ở câu nhiều chủ đề | Quy tắc biên ở §4 chốt trước; đo Kappa từng chủ đề |
| Nhãn chủ đề bị dùng để "chấm điểm" giảng viên theo chủ đề | Cùng biện pháp đã áp cho cảm xúc: ghi chú trên giao diện, không có bảng xếp hạng |
| Lặp lại lỗi 5.8 (đổi model/quy tắc mà kết quả cũ nằm im) | Cột phiên bản riêng cho model chủ đề, ngay từ migration đầu tiên |
