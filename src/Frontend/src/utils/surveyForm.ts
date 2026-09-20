import type React from 'react';
import type { SurveyFormConfig, SurveyTextStyle } from '../types';

/**
 * Hình thức phiếu khảo sát: những thứ cả phiếu thật (`PublicSurveyPage`) lẫn màn soạn
 * phiếu (`SurveyFormDesigner`) đều phải hiểu giống hệt nhau. Để ở đây một bản duy nhất
 * thì xem trước lúc soạn luôn khớp phiếu sinh viên thấy.
 */

/**
 * Phông cho phép. Chỉ dùng phông có sẵn trên máy: sinh viên mở phiếu bằng điện thoại
 * giữa giờ học, tải phông ngoài về là thêm một thứ có thể hỏng. Danh sách này phải
 * khớp `SurveyFormConfig.AllowedFonts` bên backend.
 */
export const surveyFormFonts: { value: string; label: string; stack: string }[] = [
  { value: 'default', label: 'Mặc định của hệ thống', stack: '' },
  { value: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { value: 'times', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { value: 'georgia', label: 'Georgia', stack: 'Georgia, serif' },
  { value: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { value: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
  { value: 'courier', label: 'Courier New', stack: "'Courier New', Courier, monospace" },
];

/** Khoảng cỡ chữ tiêu đề cho phép, phải khớp backend. */
export const minimumTitleFontSize = 14;
export const maximumTitleFontSize = 48;

/**
 * Những thông tin quản trị được bật/tắt ở MÀN MỞ ĐẦU. Tên đợt (tiêu đề) không có trong
 * danh sách: tắt hết thì sinh viên không biết đang làm phiếu gì. Mã phải khớp
 * `SurveyFormConfig.AllowedFields` bên backend.
 */
export const surveyInfoFields: { code: string; label: string }[] = [
  { code: 'templateName', label: 'Tên bộ câu hỏi' },
  { code: 'course', label: 'Mã và tên học phần' },
  { code: 'section', label: 'Lớp học phần' },
  { code: 'lecturer', label: 'Giảng viên' },
  { code: 'semester', label: 'Học kỳ và năm học' },
  { code: 'schedule', label: 'Thời gian mở phiếu' },
  { code: 'questionCount', label: 'Số câu hỏi' },
  { code: 'credits', label: 'Số tín chỉ' },
  { code: 'faculty', label: 'Khoa' },
  { code: 'department', label: 'Bộ môn' },
];

/**
 * Những khối bật/tắt được TRONG BÀI LÀM. Câu hỏi và thang trả lời không nằm ở đây:
 * chúng thuộc bộ câu hỏi, không phải hình thức phiếu.
 */
export const surveyQuizBlocks: { code: string; label: string; hint?: string }[] = [
  { code: 'quizNotice', label: 'Dải "Lưu ý trước khi làm bài"' },
  { code: 'questionReview', label: 'Thanh tiến độ và danh sách câu hỏi' },
  {
    code: 'commentBox',
    label: 'Ô "Ý kiến khác"',
    hint: 'Tắt thì sinh viên không góp ý tự do được nữa.',
  },
];

/** Thông tin có được hiện không. Không có cấu hình, hoặc không nằm trong danh sách ẩn, thì hiện. */
export const isFieldVisible = (
  config: SurveyFormConfig | null | undefined,
  code: string,
): boolean => !config?.hiddenFields?.includes(code);

/** Bật/tắt một thông tin, trả về danh sách ẩn mới. */
export const toggleHiddenField = (
  config: SurveyFormConfig,
  code: string,
  visible: boolean,
): string[] => {
  const hidden = new Set(config.hiddenFields ?? []);
  if (visible) {
    hidden.delete(code);
  } else {
    hidden.add(code);
  }
  return [...hidden];
};

/** Chữ do đợt đặt, bỏ qua giá trị rỗng; null nghĩa là đợt không đặt gì. */
export const customText = (value: string | null | undefined): string | null =>
  value && value.trim() ? value : null;

/** Chữ do đợt đặt; bỏ trống thì dùng câu mặc định. */
export const textOr = (custom: string | null | undefined, fallback: string): string =>
  customText(custom) ?? fallback;

/**
 * Màu của phiếu, đổ vào biến CSS ngay trên thẻ gốc. Đợt không chọn màu thì không đặt
 * biến nào, CSS tự rơi về màu mặc định ghi sẵn trong tệp kiểu dáng.
 */
export function themeStyleOf(config: SurveyFormConfig | null | undefined): React.CSSProperties {
  if (!config) return {};

  const style: Record<string, string> = {};
  if (config.primaryColor) style['--survey-primary'] = config.primaryColor;
  if (config.backgroundColor) style['--survey-bg'] = config.backgroundColor;
  if (config.submitButtonColor) style['--survey-submit'] = config.submitButtonColor;
  return style as React.CSSProperties;
}

/**
 * Vùng ảnh bìa được thấy trong khung. Khung cố định nên ảnh to hơn sẽ bị cắt; giá trị
 * này quyết định cắt phần nào. Bỏ trống thì canh giữa như mặc định của CSS.
 */
export function coverStyleOf(config: SurveyFormConfig | null | undefined): React.CSSProperties {
  return config?.coverPosition ? { objectPosition: config.coverPosition } : {};
}

/** Định dạng của một đoạn chữ bất kỳ (dòng đầu và nội dung dải lưu ý). */
export function textStyleOf(style: SurveyTextStyle | null | undefined): React.CSSProperties {
  if (!style) return {};

  const css: React.CSSProperties = {};
  if (style.bold != null) css.fontWeight = style.bold ? 700 : 400;
  if (style.italic) css.fontStyle = 'italic';
  if (style.underline) css.textDecoration = 'underline';
  if (style.fontSize) css.fontSize = `${style.fontSize}px`;
  if (style.align) css.textAlign = style.align as React.CSSProperties['textAlign'];
  return css;
}

/** Định dạng chữ của tiêu đề phiếu. Trường nào bỏ trống thì không ghi đè CSS mặc định. */
export function titleStyleOf(config: SurveyFormConfig | null | undefined): React.CSSProperties {
  if (!config) return {};

  const style: React.CSSProperties = {};
  const font = surveyFormFonts.find((item) => item.value === config.titleFont);
  if (font?.stack) style.fontFamily = font.stack;
  if (config.titleFontSize) style.fontSize = `${config.titleFontSize}px`;
  if (config.titleBold != null) style.fontWeight = config.titleBold ? 700 : 400;
  if (config.titleItalic) style.fontStyle = 'italic';
  if (config.titleUnderline) style.textDecoration = 'underline';
  if (config.titleAlign) style.textAlign = config.titleAlign as React.CSSProperties['textAlign'];
  return style;
}
