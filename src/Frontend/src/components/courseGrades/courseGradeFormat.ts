/* Hàm định dạng và bảng màu dùng chung của các trang phân tích điểm (không có component). */

/*
  Màu theo bộ luật D mục 9.2: không đỏ, cam, xanh lá; không màu nào gợi "tốt" hay "xấu".
  - Độ lớn: một tông xanh dương nhạt → đậm (M2).
  - Chiều lệch: xanh mòng két (cao hơn kỳ vọng, kể cả D6) và tím (thấp hơn), giữa là xám (M3).
  - Phân loại (khoa): bảng trung tính (M4).
  - Mã điểm lưu ý / đặc điểm thể hiện bằng chữ, không tô màu cả dòng (M5).
*/
export const COLORS = {
  scale: ['#DCE9F5', '#9DC3E6', '#4F8FC9', '#1F5C99', '#0B2F5B'],
  up: '#2A8C8C',
  down: '#7A6BB0',
  middle: '#E6E6E6',
  categories: ['#4C72B0', '#2A8C8C', '#7A6BB0', '#8C8C8C', '#937860', '#1F3B73'],
};

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
  const base = value > 0 ? '42, 140, 140' : '122, 107, 176';
  return `rgba(${base}, ${alpha.toFixed(2)})`;
}
