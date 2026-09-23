# Giải thích cách phân loại cảm xúc ý kiến mở

> Tài liệu để **đọc và nói lại**, không phải tài liệu kỹ thuật. Không có câu lệnh, không có cấu hình.
> Muốn đi sâu vào cách triển khai thì đọc `docs/phan-loai-cam-xuc-y-kien-mo.md`.

> **Số liệu trong tài liệu này là số đo thật, không phải ví dụ minh hoạ.** Các con số ở mục 4–7 được
> in ra từ đúng model đang chạy trong hệ thống; các con số ở mục 8 là kết quả chấm tay ngày
> 20/09/2026. Nguồn chi tiết: `docs/plans/phan-loai-y-kien-mo-theo-cam-xuc.md` mục 5.3 và
> `ml/open_comment_sentiment/artifacts/phobert-local-evaluation.md`. Muốn xem tận mắt thì có sẵn
> `ml/open_comment_sentiment/scripts/explain_examples.py` — chạy thử bất kỳ câu nào và in ra cả ba
> con số lẫn kết luận, dùng được để demo tại chỗ.

## 1. Nói một câu cho dễ nhớ

Hệ thống **đọc từng ý kiến sinh viên viết tự do, rồi đoán xem người viết đang khen, đang chê, hay
đang chỉ góp ý trung tính** — và **tách riêng những câu vừa khen vừa chê** để không đọc sai chúng.

## 2. Vì sao không viết luật "nếu câu có chữ này thì là chê"

Cách đó nghe hợp lý nhưng không dùng được với tiếng Việt:

- "Giảng viên dạy **không** hay" và "Giảng viên dạy **không** chỉ hay mà còn tận tình" — cùng chữ
  "không", nghĩa ngược nhau.
- "Bài tập **vừa đủ** để luyện" là khen, "bài tập **quá nhiều**" là chê — nhưng chữ "bài tập" giống nhau.
- Sinh viên viết tắt, viết không dấu, viết sai chính tả, chèn emoji, châm biếm.
- Có bạn hỏi "sao không dạy thêm buổi thực hành?" — nên đọc là góp ý trung tính, không phải chê.

Liệt kê luật cho hết những trường hợp này là việc không bao giờ xong. Nên ta làm cách khác: **cho
máy xem thật nhiều ví dụ đã được con người dán nhãn, để nó tự rút ra kinh nghiệm.**

## 3. Nguyên lý: học từ ví dụ, giống dạy một người mới

Hãy tưởng tượng ta tuyển một trợ lý mới. Trợ lý này **chưa từng đọc ý kiến sinh viên** nhưng đã đọc
rất nhiều văn bản tiếng Việt nên biết tiếng Việt khá tốt. Sau đó ta đưa cho trợ lý **hơn 22.000 ý
kiến đã được dán nhãn sẵn** (khen / chê / trung tính) và bảo: "đọc hết chỗ này, rút kinh nghiệm". Đó
gọi là **huấn luyện**.

Kết quả là trợ lý không học thuộc câu nào cả, mà học **cách nhận ra dấu hiệu**: cách dùng từ, cách
đặt câu, những cụm từ hay đi với lời khen và lời chê. Sau khi học, đưa một câu mới chưa từng thấy,
trợ lý vẫn đoán được.

Ba điểm cần nói rõ khi giải thích:

1. **Máy không hiểu nghĩa như người.** Nó đoán theo kinh nghiệm đã học, giống như một người đọc
   nhiều thì đoán giỏi hơn, chứ không phải "hiểu" theo nghĩa triết học.
2. **Máy không tra từ điển và không tra Google.** Toàn bộ việc đoán diễn ra trên máy chủ của nhà
   trường.
3. **Máy không tự học thêm từ câu mới.** Nó chỉ biết đúng những gì đã được dạy cho tới lần huấn
   luyện gần nhất. Muốn nó giỏi lên thì phải có người chấm thêm và dạy lại — đó là lý do quy trình
   chấm tay quan trọng.

## 4. Máy trả lời cái gì: ba con số, không phải một kết luận

Với mỗi câu, máy không trả lời "câu này là chê" mà trả về **ba con số cộng lại bằng 100%** — gọi là
**độ tin** cho từng khả năng:

> "Thầy giảng dễ hiểu."
>
> → Tích cực **79,1%** · Trung tính **17,0%** · Tiêu cực **3,9%**

Con số đó quan trọng hơn nó có vẻ: nó cho biết **máy chắc đến đâu**. Câu rõ ràng thì một con số áp
đảo; câu mơ hồ thì đúng ra ba con số phải xấp xỉ nhau — và đó là lúc ta không nên tin máy. Nhưng mục
sau sẽ cho thấy **điều đó không phải lúc nào cũng xảy ra**: có những câu mơ hồ mà máy vẫn dám kết
luận, và nói ra chuyện đó trước sẽ đỡ bị bất ngờ về sau.

## 5. Từ ba nhãn thành năm nhãn: hai nhãn cuối do luật, không do máy

Máy chỉ được dạy để trả lời **ba** khả năng. Nhưng thực tế có hai tình huống mà ba khả năng không đủ:

### "Hỗn hợp" — câu vừa khen vừa chê

> "Cô nhiệt tình nhưng bài tập giao quá nhiều."

Hỏi máy **cả câu một lượt** thì được:

> Tích cực **82,9%** · Trung tính **13,6%** · Tiêu cực **3,5%** → kết luận "Tích cực".

**Kết luận đó sai**, vì một nửa câu này là chê. Lý do: hỏi cả câu thì máy buộc phải chọn một trong
ba khả năng, và nó chọn theo phần nổi trội. Nên ta làm khác — **cắt câu ra ở chữ "nhưng"** rồi hỏi
lại từng vế:

| Vế | Tích cực | Trung tính | Tiêu cực | Đọc ra |
| --- | ---: | ---: | ---: | --- |
| "Cô nhiệt tình" | **89,2%** | 8,1% | 2,7% | rõ ràng khen |
| "bài tập giao quá nhiều" | 7,0% | 59,5% | **33,6%** | có dấu hiệu chê |

Có một vế rõ khen **và** một vế có dấu hiệu chê → kết luận **Hỗn hợp**, độ tin **33,6%**.

Hai điều ở bảng này đáng nói ra, vì nó cho thấy hệ thống được làm cẩn thận chứ không phải đoán mò:

- **Vế thứ hai nhìn bề ngoài là "Trung tính"** (59,5%, con số cao nhất). Nếu máy chỉ lấy con số cao
  nhất thì nó *không thấy* dấu hiệu chê nào và sẽ **im lặng bỏ qua một lời phàn nàn**. Nên luật ở đây
  là: chỉ cần con số **tiêu cực** vượt một mức thấp (**20%**) thì vế đó **vẫn được tính là có ý chê**.
  Đây là một sửa đổi có đo lường: nó nâng số câu hai chiều nhận ra được từ **13/58 lên 34/58** trên
  tập kiểm thử, mà không làm hỏng các nhãn khác.
- **Độ tin cuối cùng lấy theo vế yếu hơn** (33,6%, không phải 89,2%). Kết luận chỉ chắc bằng chỗ mình
  chắc ít nhất; lấy vế mạnh để tự khen mình là vô nghĩa. Nói cách khác: máy nói "Hỗn hợp" nhưng
  **nói kèm rằng nó chỉ chắc 1/3** — người đọc biết ngay đây là kết luận yếu.

Dấu hiệu để cắt câu gồm: `nhưng`, `tuy nhiên`, `mặc dù vậy`, `song`, `dẫu vậy`, `thế nhưng`, dấu
chấm phẩy, chấm than, chấm hỏi, xuống dòng, và dấu chấm hết câu.

### "Chưa chắc chắn" — và sự thật là nhãn này gần như không xuất hiện

Nguyên tắc thiết kế: nếu cả ba con số đều thấp (cao nhất **dưới 45%**), hệ thống **không ép ra một
nhãn** mà ghi **Chưa chắc chắn**. Thà nói "tôi không biết" còn hơn đoán bừa rồi để người đọc báo cáo
tin vào một con số sai.

Nhưng phải nói thẳng: **trong các lần đo, nhãn này gần như không bao giờ xuất hiện.** Trên 100 câu
chấm tay: không có câu nào. Trên 490 ý kiến đang có trong hệ thống: không có câu nào. Thử vài câu mà
ai cũng nghĩ là mơ hồ:

| Câu thử | Máy trả lời |
| --- | --- |
| "Ổn" | **Tích cực 57,1%** — dám kết luận |
| "Không có ý kiến" | Trung tính 78,4% |
| "adadadad" (vô nghĩa) | Trung tính 73,2% |
| "???" | Trung tính 69,8% |

Nghĩa là **cơ chế "tôi không biết" có trong thiết kế nhưng thực tế hiếm khi được dùng**, vì máy có
xu hướng dồn độ tin vào một nhãn — nhất là **Trung tính**. Hệ quả cần nói rõ với người nghe:

- **"Trung tính" không có nghĩa là "ổn thoả".** Đó cũng là chỗ máy đẩy những câu nó không hiểu. Đừng
  lấy tỷ lệ Trung tính cao làm bằng chứng là mọi việc đều tốt.
- **Câu ngắn, câu vô nghĩa thì phải xem lại bằng tay**, đừng tin nhãn máy.
- Đây là hạn chế **đã biết và đã ghi lại**, không phải sự cố. Muốn nó tự nhận "không biết" nhiều hơn
  thì phải dạy lại bằng dữ liệu có những câu như vậy — chỉnh ngưỡng không giải quyết được.

Cần phân biệt hai nhãn dễ lẫn:

| Nhãn | Nghĩa |
| --- | --- |
| **Trung tính** | Đã kết luận: câu này không mang sắc thái khen chê rõ rệt (ví dụ một lời góp ý) |
| **Chưa chắc chắn** | Về nguyên tắc là "máy dưới mức tin cậy nên không kết luận" — **nhưng thực tế gần như không xảy ra**, xem bảng ngay trên |

Hai nhãn này **không bao giờ được gộp** khi tính tỷ lệ. Lý do quan trọng hơn ta tưởng: vì "Chưa chắc
chắn" hiếm khi xuất hiện, chính nhãn **Trung tính** đang gánh luôn phần "câu khó" — nên gộp hai nhãn
lại là che mất chỗ yếu nhất của hệ thống.

## 6. Một câu đi qua hệ thống thì được xử lý thế nào

Ví dụ đầy đủ, dùng đúng câu ở mục 5:

1. **Đọc câu.** `Cô nhiệt tình nhưng bài tập giao quá nhiều.`
2. **Hỏi máy cả câu** → Tích cực 82,9%, Trung tính 13,6%, Tiêu cực 3,5%. Nếu dừng ở đây thì kết luận
   là "Tích cực" — **sai**.
3. **Thấy chữ "nhưng"** → cắt thành hai vế và hỏi máy từng vế.
4. Vế 1 "Cô nhiệt tình": Tích cực **89,2%**. Vế 2 "bài tập giao quá nhiều": con số cao nhất là Trung
   tính 59,5%, nhưng Tiêu cực **33,6%** — vượt mức 20% nên vế này **được tính là có ý chê**.
5. **Ghép lại bằng luật**: có vế khen rõ và vế chê rõ → nhãn **Hỗn hợp**, độ tin **33,6%** (lấy vế
   yếu hơn).
6. **Ghi kết quả** kèm phiên bản cách xử lý đã dùng, để sau này biết nhãn này do phiên bản nào sinh
   ra.

Với câu đơn giản như `Thầy giảng dễ hiểu.` thì bỏ qua bước 3–4: hỏi một lần, máy trả Tích cực 79,1%,
xong.

## 7. Vì sao nó vẫn sai, và sai ở đâu

**Bốn nhóm lỗi đã đo được**, không phải phỏng đoán:

1. **Câu hai chiều mà không có chữ báo hiệu.** Nếu sinh viên vừa khen vừa chê mà không dùng "nhưng"
   hay "tuy nhiên" thì máy không biết để cắt câu, và đọc cả câu sẽ nghiêng hẳn về một bên — đo được
   là **82,9% Tích cực** cho câu ở mục 5.
2. **Châm biếm.** "Dạy hay lắm, hay đến mức em phải tự học lại hết." → máy đọc ra **Trung tính
   80,7%**. Không đến mức gán nhãn khen (đỡ nguy hiểm hơn ta tưởng), nhưng **bỏ sót** một lời chê
   đúng.
3. **Câu quá ngắn.** "Ổn" → máy dám kết luận **Tích cực 57,1%** dù câu chỉ có hai chữ. Máy không tự
   biết là mình thiếu căn cứ.
4. **Câu vô nghĩa hoặc rác.** "adadadad" → **Trung tính 73,2%**, không được gắn nhãn "Chưa chắc
   chắn".

Ngược lại, phần máy làm **đúng** cũng đo được, để người nghe biết ranh giới thật:

- Phủ định: "Giảng viên dạy **không** hay" → **Tiêu cực 84,8%**.
- Lời chê rõ: "Phòng thực hành máy tính có nhiều máy lỗi phần mềm, mạng internet chập chờn lúc tức."
  → **Tiêu cực 88,0%**.
- Góp ý trung tính: "Nên đăng tài liệu sớm hơn" → **Trung tính 88,0%**.

Nói cách khác: **sai là chuyện bình thường ở một hệ thống như thế này, và đó là lý do thiết kế phải
chịu được việc đó** — nhãn của người luôn được ưu tiên, mọi con số đều đi kèm độ tin, và không ai
được lấy kết quả máy làm căn cứ ra quyết định.

## 8. Chất lượng thật: nói thẳng con số và cách đọc nó

Số đo trên **100 ý kiến đã được chấm tay**, người chấm **không nhìn thấy máy đoán gì**. Vì mẫu được
lấy chia đều cho các nhóm, các tỷ lệ dưới đây đã được **cân lại trọng số** cho khớp phân bố thật của
toàn bộ dữ liệu (không cân lại thì con số sẽ bị thổi lên — lỗi này đã bị phát hiện và sửa một lần
rồi).

- **Cứ 10 câu thì đoán đúng khoảng 6 câu.** Nghe chưa cao — và **đúng là chưa đạt** mức để dùng làm
  căn cứ.
- **Nhưng khi máy dám khẳng định "câu này là chê", nó đúng cả 50/50 câu** đã kiểm. Đây là con số
  quan trọng nhất, và là lý do tính năng này được phép chạy.
- **Đổi lại, nó bỏ sót khoảng 44% câu chê thật.** Riêng nhãn Hỗn hợp, lượt đo này cho thấy bỏ sót
  tới **8 trong 10 câu**: sau đó cách xét mệnh đề đã được sửa và đo lại trên tập 200 câu kiểm thử,
  bỏ sót còn khoảng **4 trong 10 câu**.
- Hình dung cho dễ: nó giống một người **chỉ dám nói khi chắc**, nên ít sai mà cũng ít nói. Vì vậy
  **không được đọc "không có câu nào bị gắn cờ" thành "không có vấn đề gì".**

**Bốn giới hạn phải nói kèm, nếu không con số sẽ bị hiểu sai:**

1. 100 câu này là văn bản **sinh theo mẫu câu** trong cơ sở dữ liệu phát triển, **chưa phải phản hồi
   thật của sinh viên** (490 ý kiến nhưng chỉ 12 kiểu đuôi câu, mỗi kiểu lặp 9–15 lần). Cùng văn
   phong, cùng chủ đề trường học, nhưng đây là tín hiệu đầu, **không phải nghiệm thu**.
2. Con số 50/50 dựa trên đúng **50 câu**. Thêm một câu sai nữa là còn 49/50 — mạnh nhưng **mỏng**.
3. **Khoảng tin cậy còn rộng**, nên đừng đọc chính xác tới hai chữ số. Nói "khoảng 6 trên 10" thì
   đúng hơn là "60,49%".
4. Tiêu chí nghiệm thu của dự án gồm **đoán đúng trên 80% các lớp** và **bỏ sót dưới 20% câu chê** —
   **cả hai đều chưa đạt**, và khoảng tin cậy còn nằm dưới ngưỡng nên không phải do xui khi lấy mẫu.
   Vì vậy tính năng đang chạy ở **chế độ bóng**: máy vẫn phân tích và con số vẫn hiện trên màn báo
   cáo, nhưng **không ai được dùng nó để ra quyết định** về giảng viên. Muốn bật chính thức thì phải
   có thêm dữ liệu được con người chấm, và phải đo lại.

## 9. Vì sao luôn phải có người trong vòng lặp

- Người có quyền **sửa lại nhãn** khi máy sai, và **nhãn của người luôn được ưu tiên** khi hiển thị,
  thống kê và xuất Excel.
- **Máy không bao giờ ghi đè nhãn của người.** Khi phân tích lại, những câu đã được chấm tay sẽ bị
  bỏ qua.
- Câu đã sửa tay được đánh dấu rõ trên giao diện, và **không in độ tin của máy bên cạnh** — độ tin
  đó là của dự đoán, không phải của nhãn người đặt.
- Những câu đã được chấm tay chính là **nguyên liệu để dạy lại máy** cho lần sau.

## 10. Nó KHÔNG làm gì

Nói phần này cũng quan trọng như nói phần nó làm được, vì đây là chỗ dễ bị hiểu quá:

- **Không xếp hạng giảng viên**, không có danh sách "giảng viên tiêu cực nhất".
- **Không tự ra quyết định** về thi đua, đánh giá hay kỷ luật.
- **Không gửi nội dung ý kiến ra bên ngoài.** Không dùng ChatGPT hay bất kỳ dịch vụ AI công cộng
  nào; không có lời gọi mạng nào trong lúc phân tích.
- **Không lưu nội dung ý kiến vào bảng kết quả** — chỉ lưu nhãn, độ tin và một mã băm để biết câu có
  bị sửa hay không. Nội dung gốc vẫn nằm nguyên ở nơi sinh viên nộp.
- **Không ghi nội dung ý kiến vào nhật ký hệ thống**, kể cả khi có lỗi.
- **Không tự học từ câu mới.** Chỉ học khi ta chủ động huấn luyện lại.
- Nhóm tổng hợp có **dưới 10 ý kiến** thì không hiển thị tỷ lệ phần trăm — quá ít để nói lên điều gì.

## 11. Vài câu hỏi hay bị hỏi khi đi giải thích

**"Sao câu này rõ ràng là chê mà nó ghi Tích cực?"**
Vì nó đoán theo kinh nghiệm, không hiểu nghĩa. Điểm yếu đã biết, xếp theo mức hay gặp: câu hai vế mà
không có chữ "nhưng", câu quá ngắn, châm biếm, phủ định kép (mục 7). Ngược lại, phủ định thường —
kiểu "giảng viên dạy **không** hay" — thì máy làm đúng. Gặp câu bị đoán sai thì sửa lại nhãn, và đó
cũng là dữ liệu để dạy lại.

**"Sao câu vô nghĩa cũng thành Trung tính? Vậy con số Trung tính có đáng tin không?"**
Đáng tin như một mô tả "máy không thấy sắc thái khen chê rõ", không đáng tin như một lời khẳng định
"mọi việc đều ổn". Nhãn Trung tính vừa chứa các góp ý xây dựng thật, vừa chứa các câu máy không hiểu.
Muốn tách hai loại đó ra thì phải dạy lại bằng dữ liệu có cả những câu khó.

**"Sao cùng một câu mà lần trước nó ghi khác?"**
Vì ta đã đổi cách xử lý (ví dụ đổi cách xét mệnh đề, hoặc đổi ngưỡng). Hệ thống ghi lại **phiên bản**
đã sinh ra từng nhãn, nên đổi cách xử lý là các câu cũ **tự được tính lại** ở lượt phân tích kế tiếp
— không có chuyện nhãn cũ nằm im mà không ai biết.

**"Dữ liệu của sinh viên có bị đưa đi đâu không?"**
Không. Máy chạy trên hạ tầng của nhà trường, không gọi dịch vụ ngoài, và nội dung ý kiến không được
sao chép sang bảng kết quả cũng như không vào nhật ký.

**"Vậy có cần thêm người không?"**
Có. Muốn máy khá lên thì phải có người chấm thêm ý kiến thật (càng đa dạng học kỳ, khoa, cách viết
càng tốt). Không có dữ liệu chấm tay thì chất lượng giữ nguyên, chỉnh ngưỡng không cứu được.

**"Bao lâu nó phân tích một lần?"**
Máy phân tích khi được chạy, không phải tự động theo từng phiếu. Trên máy chủ có thể đặt chạy theo
lịch ngoài giờ, hoặc chạy nền để câu mới được phân tích trong khoảng 15 giây (đã đo). Điều này có lý
do: máy cần khoảng 1 GB bộ nhớ khi làm việc, nên không nên để nó thường trực tranh chỗ với hệ thống
khảo sát — cách chạy nền vì thế được đặt để **khi rảnh vài phút thì nó tự trả bộ nhớ lại**, chỉ còn
vài chục MB.

## 12. Từ vựng, nếu bị hỏi lại

| Từ | Nghĩa dễ hiểu |
| --- | --- |
| **Mô hình** | "Bộ kinh nghiệm" đã học từ ví dụ; là tệp dữ liệu, không phải chương trình viết tay |
| **Huấn luyện** | Cho mô hình xem nhiều ví dụ đã dán nhãn để nó rút kinh nghiệm |
| **Nhãn** | Kết luận gán cho một câu: Tích cực / Tiêu cực / Trung tính / Hỗn hợp / Chưa chắc chắn |
| **Độ tin** | Con số cho biết mô hình chắc đến đâu, tính theo phần trăm |
| **Ngưỡng** | Mức tối thiểu để dám kết luận; dưới mức đó **đúng ra** phải ghi "Chưa chắc chắn" — nhưng vì máy hay dồn độ tin vào một nhãn, cơ chế này hiếm khi được dùng |
| **Mệnh đề** | Một vế của câu, tách ra ở chỗ có "nhưng", dấu chấm phẩy… |
| **Chấm mù** | Người chấm nhãn mà không nhìn thấy máy đã đoán gì, để không bị máy dẫn dắt |
| **Chạy bóng** | Máy phân tích và hiện số liệu, nhưng chưa dùng để ra quyết định |

## 13. Nếu bị hỏi sâu hơn

- Cách làm chi tiết, ngưỡng, cấu hình: `docs/phan-loai-cam-xuc-y-kien-mo.md`.
- Kế hoạch, số đo chất lượng, các quyết định kèm lý do: `docs/plans/phan-loai-y-kien-mo-theo-cam-xuc.md`.
- Quy trình chấm nhãn cho người làm: `ml/open_comment_sentiment/docs/annotation-guideline-v1.md`.
- Giai đoạn sau (phân loại theo **chủ đề**, ví dụ "cơ sở vật chất", "bài tập"): bản nháp ở
  `docs/plans/phan-loai-chu-de-theo-y-kien-mo.md`.
