/**
 * Màu sắc dùng chung cho bảng tổng quan toàn trường.
 * Tái sử dụng token của module báo cáo (reports.css) và quy ước thang điểm hiện có.
 */
import {
  COMPLETED_COMPLETION_RATE,
  LAGGING_COMPLETION_RATE,
} from '../../utils/reportThresholds';

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

/**
 * Định dạng số dùng chung cả hệ thống, giữ lại ở đây để các module báo cáo không
 * phải sửa đường import. Bản gốc nằm ở `utils/formatNumber`.
 */
export {
  formatNumber,
  formatDecimal,
  formatDecimalOrDash,
  formatPercent,
  formatPercentOrDash,
  formatSigned,
} from '../../utils/formatNumber';
