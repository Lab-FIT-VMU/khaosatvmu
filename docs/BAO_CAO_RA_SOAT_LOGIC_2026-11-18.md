# Rà soát lỗi logic — 18/11/2026

Nhánh: `fixkc`, nền `origin/master` tại `331d18c`, có bản sửa tên khoa/viện và migration đang nằm trong working tree.

## Cập nhật sau khi sửa nhóm tạo lại danh mục

Các phát hiện bên dưới giữ nguyên làm bằng chứng tại thời điểm rà soát. Sau đó đã sửa nhóm được yêu cầu trên `fixkc`:

- L04: thêm migration `20261118035402_AllowReusingDeletedCatalogKeys` cho chức vụ, năm học, học kỳ, lớp học phần và mã học phần. Email giảng viên giữ duy nhất xuyên lịch sử; tạo/sửa/import/gắn email vào lớp trả lỗi riêng nếu email thuộc giảng viên đã xóa. Hộp thoại thêm giảng viên có nút khôi phục hồ sơ và tài khoản cũ, backend chỉ cho quản trị thực hiện.
- L05: xóa năm học xử lý khóa học tạo kèm; tạo lại có thể xử lý khóa học rỗng còn sót từ phiên bản cũ. Khóa học còn khóa ngành hoạt động không bị tự xóa để lấy lại mã.
- L02: chặn xóa năm học/học kỳ khi còn khảo sát hoặc phụ thuộc nghiệp vụ hoạt động. Chưa tự sửa các khảo sát mồ côi đã tồn tại trước bản sửa.
- L06: khôi phục năm học/học kỳ phục hồi các con có cùng dấu thời gian xóa; dữ liệu đã xóa riêng từ trước được giữ nguyên. Những luồng khôi phục khác trong báo cáo vẫn cần xử lý tiếp.
- L07: kiểm tra xung đột tên/mã trước khi khôi phục khoa, ngành, năm học, học kỳ, lớp học phần và học phần; kiểm tra phụ thuộc còn hoạt động trước khi khôi phục.
- Kiểm chứng sau sửa: 106/106 test liên quan đạt trên PostgreSQL 16 tạm; backend build và frontend production build thành công; frontend lint không có lỗi. Migration đã chạy thành công trên database tạm. Chưa áp dụng lên database ứng dụng đang chạy.

Ở đợt sửa danh mục đầu tiên, chưa xử lý L01, L03, L08, L09 và cơ chế thông báo lỗi tổng quát L10.

## Cập nhật sau đợt sửa khảo sát và import

- L01: nhận phiếu trong transaction Read Committed, khóa SHARE trên đợt rồi UPDATE trên link trước khi đếm/lưu. Hai lượt vào cùng link phải chờ nhau; các link khác vẫn nhận phiếu song song. Xóa đợt cũng khóa đợt trước khi kiểm tra phiếu để không chen ngang một lượt nộp đang ghi.
- L03/L08: import khóa ngành chỉ nhận ngành và bí danh thuộc khoa/ngành đang hoạt động. Nhánh cập nhật kiểm tra trùng như nhánh tạo; các mã được giải phóng được ghi đúng thứ tự trước khi dòng sau sử dụng lại, trong cùng transaction.
- L06: khôi phục khoa/viện phục hồi các ngành xóa cùng lần; khôi phục lớp phục hồi các link xóa cùng lần; khôi phục đợt phục hồi các link xóa cùng lần. Kiểm tra dữ liệu cha và xung đột trước khi thay đổi trạng thái, giữ nguyên các con đã bị xóa riêng từ trước.
- L09: cache chỉ giữ nội dung phiếu; trạng thái link/đợt/học kỳ/năm học/học phần, lịch và số phiếu được đọc sống. Link đã xóa không mở được qua cache của instance khác; lịch bị đóng hoặc chưa mở cũng được áp dụng ngay.
- L10: lỗi unique/FK từ PostgreSQL trả HTTP 409 với mã lỗi đọc được bởi client. Client phân biệt lỗi mạng, máy chủ, quyền truy cập và xung đột dữ liệu ở các module danh mục/khóa ngành/khảo sát; thông báo không chứa SQL hoặc tên constraint.
- Kiểm chứng: 275/275 test backend liên quan đạt trên PostgreSQL 16 tạm, gồm test nhiều kết nối tranh suất cuối và test hai link khác nhau không chặn nhau; 10 kiểm tra API client đạt. Backend build, frontend build và lint thành công (còn các cảnh báo có sẵn đã ghi nhận trước đó).
- Chưa sửa dữ liệu lịch sử trên database đang chạy. File [kiểm tra dữ liệu mồ côi](sql/KIEM_TRA_DU_LIEU_MO_COI.sql) chỉ đọc, liệt kê link/khóa ngành mồ côi, khóa học giữ mã của năm đã xóa và số phiếu vượt sĩ số. Đã kiểm tra cú pháp bằng PostgreSQL tạm. Cần đối chiếu từng kết quả để chọn phục hồi hay lưu trữ, tránh suy đoán và làm mất lịch sử.
- Đợt này không thay đổi schema; sử dụng hai migration của đợt sửa danh mục trước đó.

## Lỗi bổ sung xác nhận khi rà soát thang trả lời và câu bẫy

Ba lỗi dưới đây được tái hiện sau các bản sửa trên, bằng service thật trên PostgreSQL 16 tạm; từng tình huống nằm trong transaction rồi rollback. B01 và B02 sau đó đã được sửa theo yêu cầu; B03 vẫn chưa xử lý.

### B01 — P1: có thể xóa mức bắt buộc của câu bẫy khỏi thang

Vị trí: `src/Backend/Infrastructure/Surveys/EfSurveyService.cs:73`, `:125`.

Tạo câu kiểm tra độ tập trung yêu cầu chọn 5, dùng thang có mức 1 và 5. Sửa thang thành 1 và 2 được chấp nhận, trong khi `SurveyQuestions.AttentionCheckValue` vẫn là 5. Phiếu mới không còn đáp án nào vượt qua câu bẫy; mọi lựa chọn có trên giao diện đều sai.

Bằng chứng: `question update=True; scale update=True; required=5; choices=1,2; answerable=False`.

Hướng sửa: không cho xóa mức đang được câu bẫy tham chiếu; nếu thang đã có câu trả lời, cần chốt chính sách khóa hoặc tạo phiên bản mới cho các thay đổi giá trị/ý nghĩa của lựa chọn.

### B02 — P1: đổi câu đã có phiếu thành câu bẫy làm điểm tổng và điểm từng câu lệch quy tắc

Vị trí: `EfSurveyService.cs:310`, `:365`, `:2180`, `:2238`.

Guard của bộ đã thu phiếu kiểm tra thang và mục nhưng không kiểm tra thay đổi `AttentionCheckValue`. Có thể đổi một câu thường đã được trả lời 5 thành câu bẫy yêu cầu 1. Phiếu cũ vẫn lưu `Score=5` và không có lý do sai câu bẫy. Tính lại điểm lấy điểm tổng từ `SurveyResponses.Score` cũ, còn phần theo câu bỏ câu đang được đánh dấu bẫy.

Bằng chứng với bộ có một câu, tắt hai bộ lọc không liên quan để cô lập lỗi: `submitted=True; question changed after response=True; recalculated=True; response score=5.00; old reasons=none; class average=5.00; per-question scores=0`.

Hướng sửa: khi bộ đã có câu trả lời (kể cả phiếu đã xóa mềm), khóa thay đổi vai trò/đáp án câu bẫy. Nếu nghiệp vụ cần đổi thì tạo phiên bản bộ câu hỏi mới; không cập nhật ngầm ý nghĩa của dữ liệu lịch sử.

### B03 — P2: cache nội dung thang cho phép nộp giá trị đã bị gỡ

Vị trí: `EfSurveyService.cs:73`, `:250`, `:1577`, `:1850`.

Mở phiếu để cache thang 1/5, sau đó sửa thang thành 1/2 bằng service với cache riêng. Nội dung cache của người đang làm vẫn chứa 5, và submit kiểm giá trị bằng chính danh sách thang đang cache. Nộp 5 vẫn thành công mặc dù database chỉ còn lựa chọn 1 và 2. Sau khi cache hết hạn, cùng giá trị sẽ bị từ chối.

Bằng chứng: `scale update=True; stored choices=1,2; submission of removed choice 5=True`.

Hướng sửa: submit phải kiểm tra câu hỏi/thang/lựa chọn hiện hành hoặc đúng phiên bản đã phát; cache nội dung cần có phiên bản hoặc cơ chế vô hiệu hóa khi bộ/thang thay đổi. Không chỉ làm mới trạng thái link và lịch.

Bản sửa B01/B02 trên `fixkc`:

- Sửa thang sẽ bị từ chối nếu bỏ giá trị mà câu bẫy đang yêu cầu, kể cả câu hỏi đã xóa mềm. Trả `SURVEY_ANSWER_SCALE_ATTENTION_VALUE_IN_USE` và HTTP 409 trước khi thay đổi dữ liệu.
- Khi câu hỏi đã có trả lời, chặn thêm/bỏ/đổi `AttentionCheckValue`, kể cả nếu phiếu đã bị xóa mềm. Trả `SURVEY_TEMPLATE_ATTENTION_CHECK_LOCKED` và HTTP 409; giao diện cũng khóa ô đáp án câu bẫy.
- Vẫn cho sửa chữ khi đáp án không đổi, đổi câu bẫy trước khi có phiếu, và sửa thang khi giữ nguyên các đáp án đang được tham chiếu.
- Khóa template trong transaction khi sửa và khi nhận phiếu; khóa các thang tham chiếu trước khi kiểm tra/lưu câu hỏi. Các test nhiều connection xác nhận sửa câu bẫy không thể chen ngang phiếu đầu tiên, và sửa câu bẫy đồng thời sửa thang không thể tạo câu hỏi không có đáp án đúng.
- 14 test mới cho hai lỗi này; tổng 289/289 test liên quan đạt trên PostgreSQL 16 tạm. Backend build, frontend build và lint thành công, còn các cảnh báo có sẵn. Nhóm fixture commit cho test nhiều connection được cách ly khỏi các test đọc danh sách toàn cục để tránh test khác đọc nhầm dữ liệu đang được dọn.
- Không cần migration mới và chưa thay đổi database ứng dụng đang chạy. Bản sửa ngăn phát sinh sai lệch mới; không tự suy đoán/sửa điểm lịch sử đã bị ảnh hưởng.

Tiếp theo có thể xử lý đồng bộ phiên bản/cache ở B03. Quan sát năm học–mã khóa ở phần sau vẫn cần xác nhận quy tắc nghiệp vụ.

## Phạm vi và cách kiểm tra ban đầu

- Đối chiếu mô hình EF Core, unique index, query filter và interceptor xóa mềm với các service tạo/sửa/xóa/khôi phục.
- Đọc các luồng danh mục, khóa ngành, phát/nộp khảo sát, chốt/phát hành điểm, import tốt nghiệp, truy vấn báo cáo và ánh xạ lỗi phía frontend; xem thêm các luồng tài khoản/hồ sơ liên quan đến giảng viên.
- Chạy 17 tình huống kiểm tra riêng trên PostgreSQL 16 tạm, áp dụng migration của dự án. Các probe thông thường chạy trong transaction rồi rollback; probe đồng thời dùng dữ liệu riêng đã commit để hai connection cùng đọc được.
- Xóa change tracker giữa các thao tác cần mô phỏng request riêng, tránh nhầm lỗi do giữ đối tượng EF từ request trước.
- Chạy toàn bộ project `tests/UnitTests` với database tạm, sau khi seed vai trò/quyền chuẩn.
- Không cập nhật database ứng dụng đang chạy. Đợt này bổ sung báo cáo; các bản sửa khoa/viện từ lượt trước vẫn được giữ nguyên.

Đây là rà soát theo luồng nghiệp vụ và mẫu lỗi xuyên suốt các module, không phải chứng nhận mọi dòng code đều đúng. Các lỗi dưới đây có tình huống cụ thể; không suy diễn lỗi sản phẩm từ những test thiếu dữ liệu mẫu.

## Kết quả ưu tiên

P1: ưu tiên sửa vì có thể nhận sai số lượng phiếu hoặc tạo dữ liệu không nhất quán. P2: thao tác nghiệp vụ thất bại, khôi phục thiếu hoặc thông báo sai.

| Mã | Mức | Lỗi đã xác nhận |
|---|---|---|
| L01 | P1 | Nộp đồng thời có thể vượt sĩ số |
| L02 | P1 | Xóa năm học/học kỳ bỏ sót khảo sát phụ thuộc |
| L03 | P1 | Import khóa ngành nhận bí danh của ngành đã xóa |
| L04 | P2 | Sáu ràng buộc duy nhất khác vẫn tính bản ghi đã xóa |
| L05 | P2 | Xóa năm học để lại khóa học, chặn tạo lại năm học |
| L06 | P2 | Khôi phục bản ghi cha bỏ sót các bản ghi con đã xóa theo |
| L07 | P2 | Khôi phục không kiểm tra xung đột với bản ghi mới |
| L08 | P2 | Import cập nhật khóa ngành bỏ qua kiểm tra ngành bị trùng |
| L09 | P2 | Link khảo sát đã xóa vẫn mở được từ cache |
| L10 | P2 | Lỗi máy chủ/ràng buộc dữ liệu bị hiển thị thành mất kết nối |

## L01 — Nộp đồng thời vượt sĩ số

Vị trí: `src/Backend/Infrastructure/Surveys/EfSurveyService.cs:1718`, `:1769`, `:1895`.

`GetPublicSurveyAsync` đếm số phiếu rồi `SubmitSurveyResponseAsync` lưu phiếu ở bước sau. Hai bước không có khóa/transaction bảo vệ suất còn lại.

Tái hiện: lớp có sĩ số 1, chưa có phiếu; cho hai request độc lập cùng đọc số đã nộp bằng 0 trước khi lưu. Kết quả: cả hai request thành công, database có 2 phiếu cho sĩ số 1. Probe dùng interceptor đồng bộ thời điểm hai truy vấn đếm đã thực thi, không sửa kết quả truy vấn.

Hướng sửa: khóa cùng bản ghi link khảo sát trong transaction, kiểm tra lại trạng thái/lịch/sĩ số và lưu phiếu trong transaction đó. Mọi đường nhận phiếu phải dùng cùng cơ chế; chỉ khóa ở màn đọc phiếu không giải quyết được.

## L02 — Xóa năm học/học kỳ không xử lý hết khảo sát liên quan

Vị trí: `src/Backend/Infrastructure/Catalog/EfCatalogService.cs:724`, `:814`; đối chiếu `DeleteCourseSectionAsync` tại `:984`.

Xóa năm học/học kỳ đánh dấu xóa học kỳ và lớp học phần nhưng bỏ qua `SemesterSurveys` và `CourseSectionSurveys`. Vì thao tác là UPDATE xóa mềm, các hành vi ON DELETE của database không chạy. Trong khi đó xóa riêng lớp học phần có xử lý các link khảo sát phụ thuộc.

Tái hiện: tạo năm học → lớp → đợt khảo sát → link; xóa năm học bằng service ở context không giữ các đối tượng đã tạo. Kết quả: 0 lớp hoạt động nhưng vẫn còn 1 đợt và 1 link hoạt động. Nộp phiếu vào link đó vẫn thành công. Khi không còn đọc được lớp, kiểm tra sĩ số cũng có thể rơi về 0 và không chặn theo sĩ số.

Hướng sửa: xác định chính sách chặn xóa khi có khảo sát/phiếu, hoặc xóa mềm toàn bộ phụ thuộc trong một transaction. Kiểm tra cha còn hoạt động khi mở và nhận phiếu. Phải xét cả khảo sát học phần, CTĐT và giảng viên gắn với học kỳ.

## L03 — Bí danh ngành đã xóa vẫn được import

Vị trí: `src/Backend/Infrastructure/Cohorts/EfCohortService.cs:306`, `:321`, `:378`.

Danh sách ngành chuẩn được query filter loại ngành đã xóa, nhưng vòng đọc `MajorImportAliases` nạp mọi alias và đưa `MajorId` vào lookup mà không đối chiếu tập ngành còn hoạt động. FK vẫn hợp lệ vì bản ghi ngành chỉ bị xóa mềm.

Tái hiện: tạo ngành có bí danh `OLDALIAS`, xóa ngành ở request riêng, import khóa ngành bằng bí danh đó. Kết quả import báo tạo thành công 1 dòng, bảng `CohortMajors` có 1 dòng hoạt động, nhưng danh sách khóa ngành trả về 0 dòng vì join sang ngành đã xóa.

Hướng sửa: chỉ nhận alias thuộc ngành và khoa đang hoạt động; kiểm tra lại chủ sở hữu alias trước khi ghi. Không chỉ thêm filter vào màn danh sách, vì như vậy dữ liệu lỗi vẫn được tạo.

## L04 — Xóa rồi tạo lại vẫn đụng unique index ở các danh mục khác

Vị trí: `src/Backend/Infrastructure/Persistence/AppDbContext.cs`:

| Danh mục | Ràng buộc | Dòng |
|---|---|---|
| Chức vụ | `PositionName` | 215 |
| Năm học | `AcademicYearName` | 470 |
| Học kỳ | `(AcademicYearId, SemesterName)` | 478 |
| Lớp học phần | `(CourseId, SemesterId, SectionName)` | 491 |
| Giảng viên | `Email` | 517 |
| Học phần | `CourseCode` | 543 |

Các entity đều xóa mềm, phần kiểm tra trùng của service nhìn dữ liệu chưa xóa, nhưng unique index không có điều kiện `IsDeleted = false`.

Đã tái hiện PostgreSQL `23505` trên cả sáu index. Với năm học phải xử lý thêm khóa học còn sót ở L05 mới đi tới lỗi unique index.

Hướng sửa: thống nhất chính sách tái sử dụng từng loại khóa. Nếu cho tạo bản ghi mới, dùng unique index có điều kiện và migration. Riêng email giảng viên cần xử lý đồng thời liên kết tài khoản/hồ sơ cũ; không nên chỉ đổi index email mà bỏ qua danh tính đăng nhập. Nếu yêu cầu khôi phục bản ghi cũ thay vì tạo mới, service cần trả mã lỗi nghiệp vụ rõ ràng.

Không tính mã bộ môn vào lỗi này: `CreateDepartmentAsync` chủ động kiểm tra cả bản ghi đã xóa bằng `IgnoreQueryFilters`, do mã là khóa chính nhập tay. Đây là chính sách khác với kiểm tra một đằng, database chặn một nẻo.

## L05 — Năm học bị xóa nhưng khóa học vẫn chiếm mã

Vị trí: `src/Backend/Infrastructure/Catalog/EfCatalogService.cs:635`, `:724`.

Tạo năm học tự tạo khóa học. Xóa năm học không đánh dấu xóa khóa học tương ứng. Khóa này vẫn hoạt động trong database nhưng biến mất khỏi danh sách `GetCohortsAsync` vì danh sách join với năm học còn hoạt động.

Tái hiện: tạo `2090-2091`, xóa năm học, tạo lại cùng năm. Kết quả service trả `CATALOG_ACADEMIC_YEAR_COHORT_CODE_EXISTS`, trong khi khóa gây trùng không còn hiện trong danh sách để người dùng xử lý. Nếu xóa khóa riêng trước thì lại gặp L04.

Hướng sửa: xử lý năm học–khóa học cùng chính sách xóa/khôi phục, kiểm tra phụ thuộc của khóa trước khi xóa năm và giao dịch nguyên tử cho toàn bộ thao tác.

## L06 — Khôi phục cha không khôi phục dữ liệu con

Vị trí: `src/Backend/Infrastructure/Catalog/EfCatalogService.cs:2988`, `:3027`, `:3054`, `:3073`; `src/Backend/Infrastructure/Surveys/EfSurveyService.cs:4529`.

Các hàm restore chủ yếu chỉ đặt lại cờ của bản ghi cha. Trong khi luồng delete đã xóa mềm các con, luồng restore không phục hồi tương ứng.

Đã tái hiện:

- Xóa rồi khôi phục năm học: response restore trả 3 học kỳ do dùng `IgnoreQueryFilters`, nhưng đọc lại danh sách thật có 0 học kỳ hoạt động.
- Xóa rồi khôi phục đợt khảo sát: còn 1 đợt hoạt động nhưng 0 link hoạt động.

Cùng mẫu code xuất hiện ở khôi phục khoa/viện và lớp học phần; cần thêm test phụ thuộc riêng cho từng loại trước khi sửa hàng loạt.

Hướng sửa: lưu vết nhóm thao tác xóa để khôi phục đúng các con bị xóa bởi lần đó, kiểm tra cha còn hợp lệ, kiểm tra xung đột trước rồi phục hồi trong transaction. Không khôi phục bừa mọi con đã xóa từ trước.

## L07 — Khôi phục xung đột với bản ghi mới

Vị trí: `src/Backend/Infrastructure/Catalog/EfCatalogService.cs:2988`, `:3014`.

Các hàm restore không gọi kiểm tra trùng tên/mã trước khi đặt `IsDeleted = false`.

Tái hiện:

- Ngành A → xóa → tạo ngành mới cùng mã A → khôi phục ngành cũ: lỗi `23505` ở `IX_Majors_MajorCode`.
- Khoa A → xóa → tạo khoa mới tên A → khôi phục khoa cũ: lỗi `23505` ở `IX_Faculties_FacultyName`.

Trường hợp khoa/viện trở nên thực hiện được sau bản sửa cho phép tái sử dụng tên ở lượt trước; đây là nhánh khôi phục cần sửa bổ sung. Trường hợp ngành đã có từ nền `master` do mã ngành dùng index có điều kiện sẵn.

Hướng sửa: restore cũng phải tuân theo validation và chính sách xung đột của create/update; trả lỗi nghiệp vụ để người dùng chọn đổi tên/mã hoặc xử lý bản ghi đang hoạt động.

## L08 — Import cập nhật khóa ngành bỏ qua kiểm tra ngành trùng

Vị trí: `src/Backend/Infrastructure/Cohorts/EfCohortService.cs:329`, `:358`, `:368`.

Nhánh tạo mới kiểm tra `takenMajors`; nhánh cập nhật theo mã khóa ngành thì đổi thẳng `current.MajorId` và `continue`, bỏ qua kiểm tra. Tập `takenMajors` cũng không cập nhật khi một dòng cũ đổi ngành.

Tái hiện: trong cùng khóa có lớp A thuộc ngành A và lớp B thuộc ngành B. Import dòng cập nhật lớp A sang ngành B. Kết quả cả mẻ lưu đụng `IX_CohortMajors_CohortId_MajorId`, PostgreSQL `23505`, thay vì trả lỗi cho dòng không hợp lệ. Sửa thủ công bằng `UpdateCohortMajorAsync` có kiểm tra này, nên hai đường vào đang không nhất quán.

Hướng sửa: lập trạng thái đích cho toàn bộ mẻ, kiểm tra cả tên và ngành cho nhánh cập nhật/tạo mới, đồng bộ tập mã đã dùng, trả kết quả theo dòng trước khi ghi.

## L09 — Link đã xóa vẫn mở từ cache

Vị trí: `src/Backend/Infrastructure/Surveys/EfSurveyService.cs:801`, `:1570`, `:1742`.

Phiếu công khai được cache 15 phút. Xóa đợt không xóa cache. Truy vấn kiểm tra sức chứa sau khi đọc cache có thể trả null khi link đã xóa, nhưng code vẫn trả DTO cũ với `IsOpen = true`.

Tái hiện: mở link đang hoạt động để làm nóng cache → xóa đợt chưa có câu trả lời → mở lại bằng cùng cache. Kết quả `Succeeded=true`, `IsOpen=true`, dù database không còn link hoạt động.

Giới hạn tác động đã kiểm tra trong code: đường submit có đọc lại link nên link đã xóa sẽ bị từ chối khi gửi. Lỗi xác nhận ở đây là vẫn hiển thị phiếu đang mở rồi mới thất bại khi nộp, không khẳng định đã lưu được phiếu cho link đã xóa.

Hướng sửa: xóa cache khi xóa/khôi phục và bắt buộc kiểm tra link/cha còn hoạt động trước khi trả phiếu từ cache. Nếu triển khai nhiều instance, cần cơ chế vô hiệu cache dùng chung hoặc luôn kiểm tra trạng thái sống.

## L10 — Thông báo mất kết nối che lỗi nghiệp vụ/máy chủ

Vị trí: `src/Backend/API/Middleware/GlobalExceptionHandler.cs:22`; `src/Frontend/src/services/apiClient.ts:40`; `catalogApi.ts:331`, `cohortApi.ts:128`, `surveyApi.ts:1059`.

Global handler trả `ProblemDetails` cho exception database, không có `errorCode`. API client đổi thành `API_REQUEST_FAILED`. Các hàm thông báo của danh mục/khóa ngành/khảo sát dùng cùng thông báo dự phòng “Không thể kết nối tới máy chủ” cho mọi mã chưa biết.

Kết quả: máy chủ có trả HTTP 500 vì lỗi dữ liệu nhưng giao diện lại chỉ dẫn người dùng theo hướng lỗi mạng. Đây là nguyên nhân ảnh chụp ban đầu không cho biết lỗi trùng dữ liệu.

Hướng sửa: thống nhất cấu trúc lỗi; ánh xạ xung đột đã biết sang lỗi nghiệp vụ/HTTP 409; phía client phân biệt lỗi fetch, lỗi 4xx và 5xx. Thông báo cho người dùng không cần lộ tên constraint hoặc SQL.

## Quan sát cần xác nhận thêm quy tắc nghiệp vụ

`UpdateAcademicYearAsync` tại `EfCatalogService.cs:682` cho đổi tên năm nhưng không đồng bộ mã khóa đã tạo tự động. Probe đổi `2090-2091` thành `2092-2093`: năm hiển thị mới, mã khóa vẫn 131 thay vì 133 theo công thức tạo mới. Module tốt nghiệp 2 tại `EfGraduationAnalyticsV3Service.cs:635` suy năm từ mã khóa, nên có thể vẫn quy dữ liệu về năm cũ.

Đã xác nhận trạng thái lệch; cần chốt yêu cầu mã khóa có được độc lập với tên năm học hay không trước khi quyết định cách sửa. Không tính quan sát này vào 10 nhóm lỗi đã xác nhận ở trên.

## Kiểm tra và giới hạn

- Backend build thành công trong quá trình chạy bộ test.
- Toàn bộ `UnitTests`: 407 test, 403 đạt, 4 fail trên database tạm đã seed vai trò/quyền. Không báo bộ test đã xanh hoàn toàn.
- Bốn test fail đòi hỏi dữ liệu mẫu mà fixture audit chưa dựng đủ: lớp có điểm/đủ cơ cấu bộ môn để phân tích, ý kiến mở, và cả lớp đạt lẫn không đạt ngưỡng. Đã đọc assertion để phân biệt điều kiện dữ liệu với kết luận lỗi sản phẩm.
- Các test này là `ReportScopeTests.ScopeAnalysis_ShouldAggregateInDatabaseAndLimitTextSamples`, `ReportScopeTests.ScopeWithoutDepartment_ShouldSeeNoRows_ButStillGetSchoolBaseline`, `OpenCommentAnalysisReportTests.OpenCommentReport_SentimentCountsMatchTheReturnedComments`, `RecalculateScoreThresholdTests.TheThresholdShouldActuallyExcludeSomeSections`.
- Một số test hiện có tự `return` nếu thiếu dữ liệu hoặc biến connection string; số test pass không tự chứng minh mọi luồng đã được kiểm tra. Các probe độc lập ở trên dựng dữ liệu cụ thể để xác nhận phát hiện.
- Chưa chạy kiểm tra tương tác trên trình duyệt, kiểm tra đa instance hoặc tải thực tế; không truy cập dữ liệu production.
- Các luồng tốt nghiệp đã có cơ chế tìm bản ghi đã xóa bằng `IgnoreQueryFilters` để phục hồi khi import lại; không liệt kê chúng như lỗi unique index chỉ vì có xóa mềm.

## Thứ tự sửa đề xuất

1. L01–L03: bảo đảm số lượng phiếu và tính hợp lệ của dữ liệu phụ thuộc.
2. L04–L08: thống nhất chính sách tạo lại/khôi phục, sửa xóa dây chuyền và validation import; thêm migration và regression test theo từng luồng.
3. L09–L10: đồng bộ cache và phản hồi lỗi rõ ràng.
4. Dựng fixture độc lập cho bốn test phụ thuộc dữ liệu có sẵn, rồi kiểm tra lại toàn bộ suite.

## Bằng chứng probe

```text
position reuse: PostgreSQL 23505; IX_Positions_PositionName
course code reuse: PostgreSQL 23505; IX_Courses_CourseCode
lecturer email reuse: PostgreSQL 23505; IX_Lecturers_Email
academic year reuse: succeeded=False; CATALOG_ACADEMIC_YEAR_COHORT_CODE_EXISTS
academic year reuse after deleting cohort: PostgreSQL 23505; IX_AcademicYears_AcademicYearName
semester reuse: PostgreSQL 23505; IX_Semesters_AcademicYearId_SemesterName
section reuse: PostgreSQL 23505; IX_CourseSections_CourseId_SemesterId_SectionName
faculty restore collision: PostgreSQL 23505; IX_Faculties_FacultyName
major restore collision: PostgreSQL 23505; IX_Majors_MajorCode
year rename: year=2092-2093; cohort code=131; derived code=133
year restore children: restore DTO semesters=3; visible semesters=0
cohort import duplicate major: PostgreSQL 23505; IX_CohortMajors_CohortId_MajorId
cohort import deleted alias: created=1; visible rows=0; stored active rows=1
delete year: active campaigns=1; active links=1; active sections=0; submission accepted=True
restore campaign: active campaigns=1; active links=0
deleted cached link: succeeded=True; open=True; visible links=0
concurrent last-slot submission: accepted=2; responses=2; capacity=1
```
