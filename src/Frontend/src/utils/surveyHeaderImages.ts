/**
 * Ảnh đầu phiếu do hệ thống cấp sẵn, nằm ở `src/Frontend/public/headerimg`.
 *
 * Thêm ảnh mới: bỏ tệp vào thư mục đó rồi thêm đúng TÊN TỆP vào `headerImageFiles`.
 * Màu gợi ý suy ra từ chính tên tệp (`pink.png` → hồng), nên đặt tên theo màu chủ đạo
 * của ảnh là đủ, không phải khai thêm gì.
 */

/** Tên tệp trong `public/headerimg`. */
const headerImageFiles = [
  'green.png',
  'blue.png',
  'purple.png',
  'pink.png',
  'red.png',
  'orange.png',
  'yellow.png',
];

/**
 * Màu gợi ý theo tên tệp. Tên không có trong bảng thì không gợi ý màu nào — ảnh vẫn
 * dùng được, chỉ là màu chủ đạo giữ nguyên.
 */
const colorByName: Record<string, { label: string; color: string }> = {
  red: { label: 'Đỏ', color: '#c0392b' },
  pink: { label: 'Hồng', color: '#d6336c' },
  orange: { label: 'Cam', color: '#c2410c' },
  yellow: { label: 'Vàng', color: '#b08900' },
  green: { label: 'Xanh lá', color: '#1f7a45' },
  teal: { label: 'Xanh ngọc', color: '#0f766e' },
  blue: { label: 'Xanh dương', color: '#0788b8' },
  navy: { label: 'Xanh than', color: '#123f57' },
  purple: { label: 'Tím', color: '#6b21a8' },
  brown: { label: 'Nâu', color: '#8a5a2b' },
  gray: { label: 'Xám', color: '#4b5563' },
  grey: { label: 'Xám', color: '#4b5563' },
  black: { label: 'Đen', color: '#1f2937' },
};

export interface SurveyHeaderImage {
  /** Đường dẫn công khai, đúng thứ lưu vào cấu hình. */
  url: string;
  /** Tên hiện dưới ảnh. */
  label: string;
  /** Màu chủ đạo gợi ý kèm ảnh; null là không gợi ý. */
  suggestedColor: string | null;
}

/** Tên tệp bỏ phần mở rộng, chữ thường — khoá để tra màu. */
const nameOf = (file: string): string => file.replace(/\.[^.]+$/, '').toLowerCase();

export const surveyHeaderImages: SurveyHeaderImage[] = headerImageFiles.map((file) => {
  const known = colorByName[nameOf(file)];
  return {
    url: `/headerimg/${file}`,
    label: known?.label ?? nameOf(file),
    suggestedColor: known?.color ?? null,
  };
});

/** Màu gợi ý của một ảnh hệ thống; ảnh tải lên hay ảnh lạ thì trả null. */
export const suggestedColorOf = (url: string | null | undefined): string | null =>
  surveyHeaderImages.find((image) => image.url === url)?.suggestedColor ?? null;
