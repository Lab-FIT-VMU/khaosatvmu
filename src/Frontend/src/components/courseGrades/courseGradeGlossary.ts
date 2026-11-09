/*
  Trang "Giải thích thuật ngữ" — sinh từ van_ban_giao_dien.json của module audit (khối thuat_ngu và tu_dien),
  để giữ nguyên lời giải thích đã duyệt. Trạng thái ổn định (O1–O6) lấy từ STABLE_LABELS.
  Chỗ {ten_nguong} được thay bằng giá trị ngưỡng hiện hành khi hiển thị.
*/

export interface GlossaryEntry {
  code?: string;
  name: string;
  description: string;
}

export const GLOSSARY = {
  "title": "Giải thích thuật ngữ",
  "intro": "Các khái niệm dùng trong báo cáo, diễn giải bằng ngôn ngữ thông thường. Mã trong ngoặc là mã kỹ thuật để đối chiếu với bộ quy tắc thống kê.",
  "basicTitle": "Khái niệm cơ bản",
  "basic": [
    {
      "name": "Điểm quá trình",
      "description": "Điểm do giảng viên đánh giá trong quá trình học: chuyên cần, kiểm tra, bài tập."
    },
    {
      "name": "Điểm thi",
      "description": "Điểm thi kết thúc học phần, thi tập trung theo bộ đề chung của bộ môn, nên là thước đo chung và khách quan giữa các lớp."
    },
    {
      "name": "Mất tư cách dự thi",
      "description": "Sinh viên có điểm quá trình bằng 0 (có điểm thành phần dưới 4) nên không được dự thi kết thúc học phần."
    },
    {
      "name": "Trượt do điểm thi",
      "description": "Sinh viên đủ tư cách dự thi nhưng có điểm học phần dưới 4 (điểm F)."
    },
    {
      "name": "Mức kỳ vọng",
      "description": "Giá trị dự đoán từ dữ liệu của các lớp khác cùng học phần, hoặc từ năng lực chung của sinh viên (điểm trung bình các học phần khác trong kỳ)."
    },
    {
      "name": "Có ý nghĩa thống kê",
      "description": "Khác biệt đủ lớn để khó giải thích bằng dao động ngẫu nhiên (mức tin cậy 95%, đã hiệu chỉnh cho nhiều phép thử cùng lúc)."
    },
    {
      "name": "Lớp không đưa vào thống kê",
      "description": "Lớp có ít hơn {n} sinh viên đủ tư cách dự thi. Lớp vẫn học bình thường; số sinh viên quá ít nên chỉ số tính ra không đủ tin cậy."
    },
    {
      "name": "Học phần gộp",
      "description": "Lớp chất lượng cao (mã có đuôi H hoặc E) được gộp với học phần cùng mã số vì dùng chung bộ đề thi."
    }
  ],
  "indicatorTitle": "Chỉ số",
  "indicators": [
    {
      "code": "I1",
      "name": "Tỷ lệ mất tư cách dự thi",
      "description": "Phần trăm sinh viên có điểm quá trình bằng 0 nên không đủ điều kiện dự thi kết thúc học phần."
    },
    {
      "code": "I2",
      "name": "Tỷ lệ trượt do điểm thi",
      "description": "Phần trăm sinh viên đủ tư cách dự thi nhưng có điểm học phần dưới 4 (điểm F) do điểm thi dưới 4."
    },
    {
      "code": "I3",
      "name": "Điểm quá trình trung bình",
      "description": "Trung bình điểm quá trình do giảng viên chấm, tính trên sinh viên đủ tư cách dự thi."
    },
    {
      "code": "I4",
      "name": "Điểm thi trung bình",
      "description": "Trung bình điểm thi kết thúc học phần. Các lớp thi tập trung theo bộ đề chung nên điểm thi so sánh được giữa các lớp."
    },
    {
      "code": "I5",
      "name": "Chênh lệch giữa điểm quá trình và điểm thi",
      "description": "Trung bình của (điểm quá trình − điểm thi). Giá trị dương nghĩa là điểm quá trình đang cao hơn điểm thi."
    },
    {
      "code": "I6",
      "name": "Mức độ khớp giữa điểm quá trình và điểm thi",
      "description": "Hệ số tương quan giữa điểm quá trình và điểm thi, thường nằm trong khoảng 0 đến 1. Giá trị càng gần 1, sinh viên có điểm quá trình cao càng có xu hướng đạt điểm thi cao."
    },
    {
      "code": "I7",
      "name": "Điểm quá trình so với mức kỳ vọng",
      "description": "Ở cùng mức điểm thi, sinh viên của lớp có điểm quá trình cao hơn (+) hay thấp hơn (−) bao nhiêu điểm so với sinh viên các lớp khác cùng học phần."
    },
    {
      "code": "I8",
      "name": "Điểm thi so với mức kỳ vọng",
      "description": "Điểm thi của lớp cao hơn (+) hay thấp hơn (−) bao nhiêu điểm so với mức dự đoán từ năng lực chung của sinh viên trong lớp."
    },
    {
      "code": "I9",
      "name": "Mức chênh lệch chấm điểm quá trình giữa các lớp",
      "description": "Độ tản (đơn vị điểm) của điểm quá trình giữa các lớp trong cùng một học phần. Giá trị lớn cho thấy các lớp có thể đang được chấm theo những chuẩn khác nhau. Mỗi học phần trong mỗi kỳ có một giá trị; khi gộp lên bộ môn, khoa hay toàn trường, hệ thống lấy trung vị trên các học phần đủ điều kiện so sánh, luôn kèm tỷ lệ học phần có điểm lưu ý."
    },
    {
      "code": "I10",
      "name": "Độ khác biệt phân phối điểm",
      "description": "Phân phối điểm của một lớp khác bao nhiêu so với gộp các lớp còn lại của cùng học phần (đơn vị điểm)."
    }
  ],
  "flagTitle": "Điểm lưu ý của học phần",
  "flagIntro": "Mang nghĩa “cần xem xét”, không phải kết luận.",
  "flags": [
    {
      "code": "H1",
      "name": "Điểm quá trình chênh lệch giữa các lớp",
      "description": "Điểm quá trình của các lớp trong cùng học phần khác nhau rõ rệt sau khi đã tính đến điểm thi."
    },
    {
      "code": "H2",
      "name": "Điểm thi chênh lệch giữa các lớp",
      "description": "Điểm thi của các lớp khác nhau rõ rệt sau khi đã tính đến năng lực chung của sinh viên."
    },
    {
      "code": "H3",
      "name": "Điểm quá trình ít phản ánh điểm thi",
      "description": "Trên toàn học phần, điểm quá trình và điểm thi có mức tương quan thấp, kể cả khi đã tính sai số. Điều này có thể do điểm quá trình đánh giá những năng lực mà đề thi không đo, nên chưa đủ để kết luận điểm quá trình có vấn đề."
    },
    {
      "code": "H4",
      "name": "Tỷ lệ mất tư cách không đồng đều giữa các lớp",
      "description": "Tỷ lệ sinh viên mất tư cách dự thi chênh nhau nhiều giữa các lớp của cùng học phần."
    },
    {
      "code": "H5",
      "name": "Tỷ lệ trượt do điểm thi cao",
      "description": "Tỷ lệ sinh viên trượt do điểm thi của học phần đạt mức lưu ý (tính cả sai số) hoặc cao hơn rõ so với các kỳ trước của chính học phần."
    },
    {
      "code": "H6",
      "name": "Điểm thi thay đổi so với lần mở gần nhất",
      "description": "Điểm thi trung bình thay đổi rõ so với học kỳ gần nhất có mở học phần này (có thể cách 6 tháng, 12 tháng hoặc hơn)."
    }
  ],
  "stableTitle": "Ổn định, đồng đều",
  "stableIntro": "Trạng thái ngược với từng điểm lưu ý, dùng đúng ngưỡng của điểm lưu ý đó.",
  "nearZero": {
    "name": "Điểm quá trình gần mức kỳ vọng ở các kỳ đã dạy",
    "description": "Mức điểm quá trình so với kỳ vọng của giảng viên nằm trong vùng gần 0 (±{vung} điểm) ở mọi học kỳ đã dạy học phần. Đây là mô tả số liệu; khi học phần có ít lớp, điều này chưa khẳng định các lớp tương đương nhau."
  },
  "markerTitle": "Đặc điểm của lớp",
  "markers": [
    {
      "code": "D1",
      "name": "Điểm quá trình cao hơn mức kỳ vọng",
      "description": "Ở cùng mức điểm thi, sinh viên của lớp có điểm quá trình cao hơn sinh viên các lớp khác."
    },
    {
      "code": "D2",
      "name": "Điểm quá trình thấp hơn mức kỳ vọng",
      "description": "Ở cùng mức điểm thi, sinh viên của lớp có điểm quá trình thấp hơn sinh viên các lớp khác."
    },
    {
      "code": "D3",
      "name": "Điểm quá trình ít phản ánh điểm thi",
      "description": "Trong lớp, điểm quá trình và điểm thi có tương quan rất thấp và thấp hơn rõ so với toàn học phần, kể cả khi đã tính sai số do số sinh viên có hạn."
    },
    {
      "code": "D4",
      "name": "Phân bố điểm quá trình khác các lớp còn lại",
      "description": "Hình dạng phân bố điểm quá trình của lớp khác hẳn các lớp còn lại của học phần. Đặc điểm này chưa xét đến điểm thi, nên cần đọc cùng mức điểm quá trình so với kỳ vọng."
    },
    {
      "code": "D5",
      "name": "Tỷ lệ mất tư cách cao hơn hẳn các lớp khác",
      "description": "Lớp có tỷ lệ mất tư cách dự thi cao hơn hẳn các lớp còn lại."
    },
    {
      "code": "D6",
      "name": "Điểm thi cao hơn mức kỳ vọng",
      "description": "Sinh viên của lớp đạt điểm thi cao hơn mức dự đoán từ năng lực chung. Cách tổ chức dạy học của lớp có thể là kinh nghiệm để chia sẻ."
    },
    {
      "code": "D7",
      "name": "Điểm thi thấp hơn mức kỳ vọng",
      "description": "Sinh viên của lớp đạt điểm thi thấp hơn mức dự đoán từ năng lực chung."
    }
  ],
  "repeat": {
    "code": "G1",
    "name": "Đặc điểm lặp lại qua nhiều học kỳ",
    "description": "Trong 4 học kỳ gần nhất tính đến kỳ đang xem, một giảng viên có cùng một đặc điểm ở cùng một học phần trong từ 2 học kỳ trở lên, và các kỳ đó chiếm từ một nửa số kỳ giảng viên dạy học phần trong khoảng này. “Đang tiếp diễn” là đặc điểm có xuất hiện ở kỳ đang xem; “đã ghi nhận trước đây” là đặc điểm chỉ xuất hiện ở các kỳ trước. Sự lặp lại cũng có thể xảy ra do ngẫu nhiên, nên đây là căn cứ để bộ môn và khoa trao đổi, tìm hiểu nguyên nhân, không phải kết luận."
  }
} as const;
