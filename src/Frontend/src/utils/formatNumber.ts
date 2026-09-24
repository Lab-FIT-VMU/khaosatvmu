/**
 * Định dạng số cho MÀN HÌNH và cho phần chữ của tệp xuất, theo locale vi-VN.
 *
 * Luật duy nhất của cả hệ thống: dấu CHẤM chỉ dùng để phân nhóm nghìn, dấu PHẨY chỉ
 * dùng cho phần thập phân. Trộn hai nghĩa vào một dấu thì "12.966 phiếu" đứng cạnh
 * "3.834 điểm" là không đọc được.
 *
 * KHÔNG dùng cho ô số của tệp Excel: ở đó `exportDataService` gọi `Number(giá trị)`
 * nên chuỗi có dấu phẩy thành NaN và ô rơi về kiểu chữ, mất sắp xếp. Ô số truyền
 * thẳng số, để mã định dạng của Excel lo phần hiển thị.
 */

/** Số nguyên có phân nhóm nghìn bằng dấu chấm: 12966 → "12.966". */
export const formatNumber = (value: number): string => value.toLocaleString('vi-VN');

/**
 * Số thập phân, phần lẻ ngăn bằng dấu phẩy: 3.834 → "3,834".
 *
 * Ba chữ số là mặc định của cả hệ thống cho điểm trung bình, Z-Score và tỷ lệ — ba
 * họ số này phải cùng độ chính xác thì đặt cạnh nhau mới so được.
 */
export const formatDecimal = (value: number, digits = 3): string =>
  value.toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Tỷ lệ phần trăm: 77.5 → "77,500%". */
export const formatPercent = (value: number, digits = 3): string =>
  `${formatDecimal(value, digits)}%`;

/**
 * Điểm hoặc tỷ lệ có thể không có số. Null / undefined / NaN in "—" thay vì "NaN".
 */
export const formatDecimalOrDash = (value: number | null | undefined, digits = 3): string =>
  typeof value === 'number' && Number.isFinite(value) ? formatDecimal(value, digits) : '—';

export const formatPercentOrDash = (value: number | null | undefined, digits = 3): string =>
  typeof value === 'number' && Number.isFinite(value) ? formatPercent(value, digits) : '—';

/**
 * Z-Score và các số so lệch: luôn kèm dấu, phía dương có dấu cộng để đọc nhanh lệch
 * lên hay lệch xuống. Không có số thì "—".
 */
export const formatSigned = (value: number | null | undefined, digits = 3): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${formatDecimal(value, digits)}`;
};
