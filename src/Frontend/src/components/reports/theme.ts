/**
 * Màu sắc dùng chung cho bảng tổng quan toàn trường.
 * Tái sử dụng token của module báo cáo (reports.css) và quy ước thang điểm hiện có.
 */
import {
  COMPLETED_COMPLETION_RATE,
  LAGGING_COMPLETION_RATE,
} from '../../utils/reportThresholds';
import type { OpenCommentSentiment } from '../../types';

/** Màu theo điểm trung bình (thang 5): ≥4.5 xanh lá, ≥4.0 xanh dương, còn lại cam. */
export const scoreColor = (score: number): string =>
  score >= 4.5 ? '#137b3b' : score >= 4.0 ? '#0788b8' : '#b86216';

/** Màu theo tỷ lệ hoàn thành: đạt ngưỡng thu đủ thì xanh lá, còn lại xanh dương / cam. */
export const completionColor = (rate: number): string =>
  rate >= COMPLETED_COMPLETION_RATE
    ? '#137b3b'
    : rate >= LAGGING_COMPLETION_RATE
      ? '#0788b8'
      : '#b86216';

/** Màu cho từng nhóm điểm trong phân bố (band 5..2). */
export const bandColor = (band: number): string => {
  switch (band) {
    case 5: return '#137b3b'; // Xuất sắc
    case 4: return '#0788b8'; // Tốt
    case 3: return '#b86216'; // Trung bình
    default: return '#b52d2d'; // Cần cải thiện
  }
};

/** Nhãn nhóm điểm (dự phòng khi API không gửi label). */
export const bandLabel = (band: number): string => {
  switch (band) {
    case 5: return 'Xuất sắc';
    case 4: return 'Tốt';
    case 3: return 'Trung bình';
    default: return 'Cần cải thiện';
  }
};

/** Định dạng số theo locale vi-VN. */
export const formatNumber = (value: number): string => value.toLocaleString('vi-VN');

/**
 * Màu cho từng nhãn cảm xúc của ý kiến mở.
 *
 * Quy ước lấy từ kế hoạch: xanh cho tích cực, đỏ cho tiêu cực, xám cho trung tính, tím cho
 * hỗn hợp, và nhãn Chưa chắc chắn không có màu riêng — nó là trạng thái thiếu căn cứ chứ
 * không phải một cực cảm xúc, nên dùng viền nét đứt thay vì tô màu.
 */
export const sentimentColor = (sentiment: OpenCommentSentiment): string => {
  switch (sentiment) {
    case 'Positive': return '#137b3b';
    case 'Negative': return '#b52d2d';
    case 'Neutral': return '#68737d';
    case 'Mixed': return '#7c3aed';
    default: return '#9aa4ad';
  }
};
