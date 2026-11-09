/*
  Tên và mô tả các mã của bộ luật D, E — sinh từ src/GradeAnalysisWorker/rules/mau_nhan_xet.json
  (cùng nguồn với câu nhận xét do worker ghép), để giao diện và hồ sơ lớp gọi tên giống nhau.
  Đổi tên thì sửa file JSON đó rồi sinh lại file này.
*/

export interface CodeLabel {
  name: string;
  short?: string;
  description?: string;
}

/** Điểm lưu ý của học phần (H1–H6). */
export const FLAG_LABELS: Record<string, CodeLabel> = {
  "H1": {
    "name": "Điểm quá trình chênh lệch giữa các lớp",
    "short": "Chênh điểm quá trình"
  },
  "H2": {
    "name": "Điểm thi chênh lệch giữa các lớp",
    "short": "Chênh điểm thi"
  },
  "H3": {
    "name": "Điểm quá trình ít phản ánh điểm thi",
    "short": "Khớp X–Y thấp"
  },
  "H4": {
    "name": "Tỷ lệ mất tư cách không đồng đều giữa các lớp",
    "short": "Mất tư cách không đồng đều"
  },
  "H5": {
    "name": "Tỷ lệ trượt do điểm thi cao",
    "short": "Tỷ lệ F cao"
  },
  "H6": {
    "name": "Điểm thi thay đổi so với lần mở gần nhất",
    "short": "Điểm thi thay đổi so với lần mở gần nhất"
  }
};

/** Đặc điểm của lớp (D1–D7). */
export const MARKER_LABELS: Record<string, CodeLabel> = {
  "D1": {
    "name": "Điểm quá trình cao hơn mức kỳ vọng",
    "description": "Ở cùng mức điểm thi, sinh viên của lớp có điểm quá trình cao hơn sinh viên các lớp khác."
  },
  "D2": {
    "name": "Điểm quá trình thấp hơn mức kỳ vọng",
    "description": "Ở cùng mức điểm thi, sinh viên của lớp có điểm quá trình thấp hơn sinh viên các lớp khác."
  },
  "D3": {
    "name": "Điểm quá trình ít phản ánh điểm thi",
    "description": "Trong lớp, điểm quá trình và điểm thi có tương quan rất thấp, trong khi trên toàn học phần hai loại điểm này tương quan rõ."
  },
  "D4": {
    "name": "Phân bố điểm quá trình khác các lớp còn lại",
    "description": "Hình dạng phân bố điểm quá trình của lớp khác hẳn các lớp còn lại của học phần. Đặc điểm này chưa xét đến điểm thi nên cần đọc cùng mức điểm quá trình so với kỳ vọng."
  },
  "D5": {
    "name": "Tỷ lệ mất tư cách cao hơn hẳn các lớp khác",
    "description": "Lớp có tỷ lệ mất tư cách dự thi cao hơn hẳn các lớp còn lại."
  },
  "D6": {
    "name": "Điểm thi cao hơn mức kỳ vọng",
    "description": "Sinh viên của lớp đạt điểm thi cao hơn mức dự đoán từ năng lực chung. Cách tổ chức dạy học của lớp có thể là kinh nghiệm để chia sẻ."
  },
  "D7": {
    "name": "Điểm thi thấp hơn mức kỳ vọng",
    "description": "Sinh viên của lớp đạt điểm thi thấp hơn mức dự đoán từ năng lực chung."
  }
};

/** Trạng thái ổn định, đồng đều của học phần (O1–O6), ngược với H1–H6 cùng số. */
export const STABLE_LABELS: Record<string, CodeLabel> = {
  "O1": {
    "name": "Điểm quá trình đồng đều giữa các lớp",
    "description": "Khoảng tin cậy cho thấy mức chênh lệch điểm quá trình giữa các lớp nằm dưới ngưỡng lưu ý (ngược với “Điểm quá trình chênh lệch giữa các lớp”)."
  },
  "O2": {
    "name": "Điểm thi đồng đều giữa các lớp",
    "description": "Khoảng tin cậy cho thấy mức chênh lệch điểm thi giữa các lớp nằm dưới ngưỡng lưu ý (ngược với “Điểm thi chênh lệch giữa các lớp”)."
  },
  "O3": {
    "name": "Điểm quá trình khớp tốt với điểm thi",
    "description": "Hệ số tương quan giữa điểm quá trình và điểm thi của cả học phần từ {d3_r_hp} trở lên, cận dưới khoảng tin cậy không thấp hơn ngưỡng lưu ý (ngược với “Điểm quá trình ít phản ánh điểm thi”)."
  },
  "O4": {
    "name": "Tỷ lệ mất tư cách đồng đều giữa các lớp",
    "description": "Khoảng tin cậy cho thấy chênh lệch tỷ lệ mất tư cách giữa các lớp nằm dưới ngưỡng lưu ý."
  },
  "O5": {
    "name": "Tỷ lệ trượt do điểm thi ở mức thông thường",
    "description": "Khoảng tin cậy cho thấy tỷ lệ trượt do điểm thi của học phần nằm dưới ngưỡng lưu ý, và tỷ lệ này không cao hơn rõ so với các kỳ trước của chính học phần."
  },
  "O6": {
    "name": "Điểm thi ổn định so với lần mở gần nhất",
    "description": "Khoảng tin cậy cho thấy mức thay đổi điểm thi trung bình so với học kỳ gần nhất có mở học phần (có thể cách 6 tháng, 12 tháng hoặc hơn) nằm dưới ngưỡng lưu ý."
  }
};

export const FLAG_CODES = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'] as const;
export const MARKER_CODES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'] as const;
