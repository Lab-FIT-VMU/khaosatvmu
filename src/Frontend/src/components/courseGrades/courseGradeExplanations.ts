/*
  Khung "Biểu đồ / Bảng này cho biết gì?" của các trang báo cáo, chép từ tập câu mẫu của bản audit
  (Data/Bo luat/van_ban_giao_dien.json). **x** là chữ đậm; {tên} là chỗ trống điền lúc hiển thị.
*/

/** Điền {tên} trong câu mẫu; chỗ trống không có giá trị thì giữ nguyên. */
export function fillText(text: string, values: Record<string, string | number | null | undefined> = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === null || value === undefined ? match : String(value);
  });
}

export interface Explanation {
  /** Ý nghĩa */
  meaning?: string;
  /** Dùng để */
  use?: string;
  /** Cách đọc */
  read?: string;
}

export const EXPLAIN = {
  twoWay: {
    meaning: 'Bên trái là số học phần có từng loại điểm lưu ý; bên phải là số học phần đạt trạng thái ngược lại – ổn định, đồng đều. Trạng thái ổn định, đồng đều chỉ được ghi khi khoảng tin cậy nằm về phía ổn định của ngưỡng. Hệ thống chỉ mô tả số liệu, không khen và không chê.',
    use: 'Nhìn cân bằng cả hai chiều: bên cạnh những học phần cần xem lại là những học phần đang ổn định, đồng đều, có thể làm căn cứ để chia sẻ cách làm.',
    read: '“Chưa đủ căn cứ” là học phần so sánh được, chưa có điểm lưu ý, nhưng khoảng tin cậy chưa đủ hẹp để ghi trạng thái ổn định hoặc chỉ số nằm giữa hai ngưỡng (ví dụ mức khớp giữa {r_thap} và {r_cao}). Đây không phải là kết quả tốt hay chưa tốt. “Không thể so sánh” là học phần mà câu hỏi của dòng không áp dụng được, ví dụ có dưới 2 lớp đủ điều kiện hoặc không có kỳ trước, và không được tính vào tỷ lệ. Khi nhóm chưa đủ căn cứ còn lớn, không nên suy ra tỷ lệ chung của toàn trường từ bảng này.',
  },
  schoolTrend: {
    meaning: 'Bốn biểu đồ thể hiện diễn biến các chỉ số chính của toàn trường qua các học kỳ đã nạp. Riêng mức độ khớp được tính bằng trung vị của các lớp.',
    use: 'Theo dõi diễn biến sau khi ban hành quy chế hoặc chủ trương, ví dụ quy định mới về đánh giá quá trình hoặc chương trình hỗ trợ học tập.',
    read: 'Hướng đi lên hoặc đi xuống của đường cho biết xu hướng. Di chuột vào từng điểm để xem giá trị của học kỳ đó.',
  },
  schoolMap: {
    meaning: 'Mỗi học phần được đặt theo hai trục: trục ngang cho biết các lớp của học phần được chấm **điểm quá trình** chênh nhau bao nhiêu; trục dọc cho biết **điểm thi** của các lớp chênh nhau bao nhiêu (đã tính đến năng lực chung của sinh viên).',
    use: 'Định hướng biện pháp. Nếu nhiều học phần nằm lệch sang phải, cần xem xét thống nhất cách chấm điểm quá trình (ví dụ dùng rubric chung); nếu nhiều học phần nằm lệch lên trên, cần chú trọng phương pháp giảng dạy.',
  },
  flaggedRate: {
    meaning: 'Phần trăm học phần của mỗi khoa/viện đang có điểm lưu ý trong học kỳ.',
    use: 'Xác định nơi cần ưu tiên nguồn lực đảm bảo chất lượng, tập huấn hoặc kiểm tra chuyên đề.',
    read: 'Chữ bên phải thanh tách hai nhóm: **đủ ĐK** là học phần có từ 2 lớp được thống kê (so sánh được giữa các lớp); **chưa đủ** là học phần chỉ có 0–1 lớp được thống kê. Nhóm chưa đủ điều kiện **không thể** có điểm lưu ý về chênh lệch giữa các lớp (điểm quá trình, điểm thi, mất tư cách), nên khoa/viện có nhiều học phần nhỏ thường có tỷ lệ thấp hơn. Để so sánh các khoa/viện công bằng hơn, chọn phạm vi “Chỉ học phần đủ điều kiện so sánh”. Khoa/viện có ít học phần (dưới khoảng 10) thì tỷ lệ dễ dao động.',
  },
  spreadX: {
    meaning: 'Ở mỗi học phần, hệ thống ước lượng các lớp chênh nhau bao nhiêu về điểm quá trình sau khi đã tính đến điểm thi. Khi gộp lên khoa/viện hay toàn trường, hệ thống lấy **trung vị** vì nhiều học phần có độ tản bằng 0 và một số ít học phần rất tản; trung vị cho mức của một học phần điển hình, còn **tỷ lệ học phần có điểm lưu ý** cho biết có bao nhiêu học phần tản mát nhiều. **Ví dụ:** tỷ lệ phương sai 0,10 nghĩa là khoảng 10% mức dao động của điểm quá trình đến từ khác biệt giữa các lớp.',
    use: 'Theo dõi mức độ thống nhất chuẩn đánh giá giữa các lớp, làm căn cứ khi xem xét chủ trương dùng rubric chấm chung và hoạt động hiệu chuẩn. Đồng đều không đồng nghĩa với chất lượng cao, vì các lớp có thể cùng chấm rộng hoặc cùng chấm chặt.',
    read: 'Thanh càng ngắn, các lớp càng đồng đều. Chữ bên phải thanh ghi trung vị và tỷ lệ học phần có điểm lưu ý; di chuột vào thanh để xem số học phần.',
  },
  spreadY: {
    meaning: 'Ở mỗi học phần, hệ thống ước lượng các lớp chênh nhau bao nhiêu về điểm thi sau khi đã tính đến năng lực chung của sinh viên. Khi gộp lên khoa/viện hay toàn trường, hệ thống lấy **trung vị** vì nhiều học phần có độ tản bằng 0 và một số ít học phần rất tản; trung vị cho mức của một học phần điển hình, còn **tỷ lệ học phần có điểm lưu ý** cho biết có bao nhiêu học phần tản mát nhiều. **Ví dụ:** tỷ lệ phương sai 0,10 nghĩa là khoảng 10% mức dao động của điểm thi đến từ khác biệt giữa các lớp.',
    use: 'Theo dõi mức độ thống nhất chuẩn đánh giá giữa các lớp, làm căn cứ khi xem xét chủ trương dùng rubric chấm chung và hoạt động hiệu chuẩn. Đồng đều không đồng nghĩa với chất lượng cao, vì các lớp có thể cùng chấm rộng hoặc cùng chấm chặt.',
    read: 'Thanh càng ngắn, các lớp càng đồng đều. Chữ bên phải thanh ghi trung vị và tỷ lệ học phần có điểm lưu ý; di chuột vào thanh để xem số học phần.',
  },
  schoolRepeat: {
    use: 'Đánh giá mức độ phổ biến và loại đặc điểm lặp lại trong toàn trường, làm căn cứ cho chủ trương bồi dưỡng hoặc chia sẻ kinh nghiệm chung.',
    read: 'Mỗi thanh là một loại đặc điểm; con số là số trường hợp (cặp giảng viên – học phần) có đặc điểm đó lặp lại. Màu mòng két và tím chỉ chiều lệch lên hoặc xuống, không mang nghĩa tốt hay xấu.',
  },
  facultyDepartments: {
    meaning: 'Các chỉ số chính của từng bộ môn trong khoa ở học kỳ đang xem. Tỷ lệ mất tư cách và tỷ lệ trượt tính gộp trên các lớp được đưa vào thống kê; mức độ khớp là trung vị của các lớp; mức chênh lệch giữa các lớp là trung vị trên các học phần đủ điều kiện so sánh, kèm tỷ lệ học phần có điểm lưu ý.',
    use: 'Xác định bộ môn cần tổ chức sinh hoạt chuyên môn và báo cáo lại biện pháp điều chỉnh.',
  },
  facultyMap: {
    meaning: 'Vị trí của từng học phần theo mức chênh lệch điểm quá trình (trục ngang) và điểm thi (trục dọc) giữa các lớp của học phần đó.',
    use: 'Chọn học phần cần ưu tiên dự giờ, rà soát đề cương và bộ đề thi.',
    read: 'Học phần càng xa góc dưới bên trái thì các lớp càng chênh lệch nhau.',
  },
  facultyFlagged: {
    meaning: 'Các học phần đang có điểm lưu ý trong học kỳ, kèm số học kỳ đã từng có điểm lưu ý.',
    use: 'Lập kế hoạch kiểm tra chuyên đề; ưu tiên học phần có điểm lưu ý lặp lại qua nhiều học kỳ.',
  },
  facultyRepeat: {
    meaning: 'Trong {cua_so} học kỳ gần nhất tính đến kỳ đang xem, một giảng viên có cùng một đặc điểm ở cùng một học phần trong từ 2 học kỳ trở lên, và các kỳ đó chiếm từ một nửa số kỳ giảng viên dạy học phần trong khoảng này.',
    use: 'Phối hợp với bộ môn khi phân công giảng dạy học kỳ sau và khi lập kế hoạch bồi dưỡng giảng viên.',
    read: '“Đang tiếp diễn” là đặc điểm có xuất hiện ở kỳ đang xem. Một phần các trường hợp có thể do ngẫu nhiên, nhất là khi chỉ lặp lại ở 2 học kỳ.',
  },
  departmentClasses: {
    meaning: 'Số liệu của từng lớp: sĩ số, tỷ lệ mất tư cách dự thi, tỷ lệ trượt do điểm thi, điểm trung bình và mức chênh so với kỳ vọng.',
    use: 'Bộ môn trao đổi chuyên môn về cách đánh giá điểm quá trình giữa các giảng viên cùng dạy học phần.',
    read: 'Lớp ghi “Không đưa vào thống kê” là lớp có dưới {n} sinh viên đủ tư cách dự thi – **không phải** lớp bị hủy. Thanh nhỏ ở cột I7, I8 là khoảng tin cậy 95%; chấm được tô đặc khi khác biệt có ý nghĩa thống kê sau khi đã hiệu chỉnh cho nhiều phép thử cùng lúc.',
  },
  departmentDumbbell: {
    meaning: 'Mỗi dòng là một lớp. Hình tròn là điểm quá trình trung bình của lớp (do giảng viên chấm); hình vuông là điểm thi trung bình (đề chung, chấm tập trung). Đoạn nối giữa hai hình là khoảng chênh lệch giữa hai loại điểm.',
    use: 'Phát hiện lớp có điểm quá trình cao hoặc thấp hẳn trong khi điểm thi không khác các lớp khác, để bộ môn tìm hiểu thêm; nguyên nhân có thể là cách đánh giá, đặc thù lớp hoặc yếu tố chưa đo được.',
    read: 'Đoạn nối càng dài thì điểm quá trình và điểm thi của lớp càng chênh nhau. So sánh độ dài đoạn nối giữa các lớp, không so với một con số cố định.',
  },
  trendsCourses: {
    meaning: 'Mỗi dòng là một học phần, mỗi cột là một học kỳ; ô ghi các điểm lưu ý của học phần trong học kỳ đó.',
    use: 'Nhận diện học phần có điểm lưu ý kéo dài để ưu tiên rà soát, đồng thời kiểm tra hiệu quả của biện pháp đã thực hiện (điểm lưu ý còn xuất hiện ở học kỳ sau hay không).',
    read: 'Cột “Số học kỳ có điểm lưu ý” đếm học kỳ có **bất kỳ** điểm lưu ý nào; cột cuối cho biết **từng loại** điểm lưu ý lặp bao nhiêu kỳ. Bộ lọc “Mức độ lặp lại” tính theo loại điểm lưu ý đang chọn. Lưu ý: “đặc điểm lặp lại” (G1) là khái niệm riêng cho đặc điểm cấp lớp của giảng viên, không áp dụng cho điểm lưu ý của học phần.',
  },
  trendsLecturers: {
    meaning: 'Mức chênh điểm quá trình so với kỳ vọng của các lớp do mỗi giảng viên dạy ở mỗi học phần, qua từng học kỳ (trung bình nếu giảng viên dạy nhiều lớp).',
    use: 'Phân biệt đặc điểm chỉ xuất hiện ở một học kỳ (có thể do ngẫu nhiên) với đặc điểm lặp lại qua nhiều học kỳ.',
    read: 'Màu chỉ chiều chênh (cao hơn hay thấp hơn kỳ vọng), không mang nghĩa tốt hay xấu; màu càng đậm thì chênh càng nhiều, ô xám là gần 0. Cột “Xu hướng” là câu nhận xét do bộ luật E ghép sẵn. Ô trống là học kỳ giảng viên không dạy học phần đó.',
  },
  trendsExam: {
    use: 'Theo dõi độ ổn định của bộ đề thi, làm căn cứ hiệu chỉnh ngân hàng câu hỏi khi cần.',
    read: 'Số trong ngoặc là mức thay đổi điểm thi trung bình so với lần mở học phần liền trước (có thể cách 6 tháng, 12 tháng hoặc hơn). Điểm lưu ý H6 được gắn vào **học kỳ sau** khi mức thay đổi từ {ng} điểm trở lên và có ý nghĩa thống kê. Một lần thay đổi chưa cho thấy bộ đề không ổn định kéo dài.',
  },
} satisfies Record<string, Explanation>;

/** Hai câu dùng cho phần "Cách đọc" của bản đồ học phần, theo thang đang chọn. */
export const MAP_READING = {
  icc: 'Hai đường đứt là ngưỡng lưu ý về tỷ lệ phương sai, lấy từ tham số; số học phần ở mỗi vùng ghi bên dưới biểu đồ. Vượt ngưỡng chưa đồng nghĩa với có điểm lưu ý: điểm lưu ý chỉ được ghi nhận khi khác biệt giữa các lớp đồng thời có ý nghĩa thống kê. Chấm rỗng là học phần không phát hiện chênh lệch giữa các lớp.',
  tau: 'Hai đường đứt là trung vị của các học phần (không tính nhóm có độ tản bằng 0), chia biểu đồ thành 4 vùng; số học phần của mỗi vùng ghi bên dưới biểu đồ. Chấm rỗng là học phần không phát hiện chênh lệch giữa các lớp.',
};

/** "Điểm lưu ý của học phần và đặc điểm của lớp khác nhau thế nào?" (trang Cấp bộ môn). */
export const FLAG_VS_MARKER: [string, string][] = [
  ['Điểm lưu ý của học phần', 'Xét **tất cả các lớp gộp lại**. Ví dụ “điểm quá trình chênh lệch giữa các lớp” được ghi nhận khi cả học phần tản mát rõ, dù từng lớp chỉ chênh một chút.'],
  ['Đặc điểm lớp', 'Xét **từng lớp riêng**, với ngưỡng riêng. Ví dụ lớp phải chênh so với kỳ vọng từ {d1} điểm trở lên và có ý nghĩa thống kê mới có đặc điểm “điểm quá trình cao/thấp hơn mức kỳ vọng”.'],
  ['Vì sao có điểm lưu ý mà không có đặc điểm?', 'Có ba trường hợp thường gặp: (1) nhiều lớp cùng chênh một ít, cộng lại thành tản mát rõ; (2) cả học phần có mức khớp X–Y thấp nên không lớp nào khác hẳn nhóm (đặc điểm lớp chỉ được ghi nhận khi lớp khớp kém trong khi cả học phần khớp tốt); (3) tỷ lệ trượt do điểm thi Y cao – loại này không có đặc điểm cấp lớp tương ứng.'],
  ['Lưu ý', '“Liên quan” chỉ để định hướng xem xét, **không phải** đặc điểm chính thức và không dùng để đánh giá giảng viên.'],
];
