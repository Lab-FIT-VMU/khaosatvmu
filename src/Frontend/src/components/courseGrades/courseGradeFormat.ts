/* Hàm định dạng và bảng màu dùng chung của các trang phân tích điểm (không có component). */

/*
  Màu theo bộ luật D mục 9.2: không đỏ, cam, xanh lá; không màu nào gợi "tốt" hay "xấu".
  - Độ lớn: một tông xanh dương nhạt → đậm (M2).
  - Chiều lệch: xanh mòng két (cao hơn kỳ vọng, kể cả D6) và tím (thấp hơn), giữa là xám (M3).
  - Phân loại (khoa): bảng trung tính (M4).
  - Mã điểm lưu ý / đặc điểm thể hiện bằng chữ, không tô màu cả dòng (M5).

  Đây là màu MẶC ĐỊNH. Người dùng đổi màu ở trang Design System chung (utils/designTokens.ts):
  bộ màu đó ghi đè thẳng vào object này, nên luôn đọc COLORS.x lúc vẽ, đừng chép giá trị ra
  hằng số riêng ở đầu tệp.
*/
export const COLORS = {
  scale: ['#DCE9F5', '#9DC3E6', '#4F8FC9', '#1F5C99', '#0B2F5B'],
  up: '#2A8C8C',
  down: '#7A6BB0',
  middle: '#E6E6E6',
  categories: ['#4C72B0', '#2A8C8C', '#7A6BB0', '#8C8C8C', '#937860', '#1F3B73'],
  /** Điểm quá trình / điểm thi trên biểu đồ quả tạ. */
  process: '#1D63D6',
  exam: '#1F2633',
  /** Đường ngưỡng / trung vị (màu đỏ duy nhất được dùng, M1). */
  threshold: '#D32F2F',
  /** Học phần không thuộc nhóm đang chọn trên bản đồ. */
  muted: '#B8C2D3',
  /** Màu nhấn của bốn biểu đồ xu hướng / thẻ số liệu. */
  accents: ['#1D63D6', '#6A55C2', '#138A8A', '#2E3F9E'],
};

/** "#2A8C8C" → "42, 140, 140" để ghép rgba. */
function rgbOf(hex: string): string {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '808080';
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16)).join(', ');
}

const numberFormats = new Map<number, Intl.NumberFormat>();
export function vi(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  let format = numberFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(digits, format);
  }
  return format.format(value);
}

export const viInt = (value: number | null | undefined) => vi(value, 0);
export const pct = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? '—' : `${vi(value * 100, digits)}%`;
export const signed = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${vi(value, digits)}`;

export function median(values: (number | null | undefined)[]): number | null {
  const list = values.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
  if (list.length === 0) return null;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
}

/** Màu ô cho mức lệch so với kỳ vọng: gần 0 thì xám, càng xa càng đậm theo chiều. */
export function deviationColor(value: number | null | undefined, nearZero: number, strong: number): string {
  if (value === null || value === undefined || Math.abs(value) <= nearZero) return COLORS.middle;
  const ratio = Math.min(1, (Math.abs(value) - nearZero) / Math.max(strong - nearZero, 0.01));
  const alpha = 0.25 + 0.75 * ratio;
  const base = rgbOf(value > 0 ? COLORS.up : COLORS.down);
  return `rgba(${base}, ${alpha.toFixed(2)})`;
}
