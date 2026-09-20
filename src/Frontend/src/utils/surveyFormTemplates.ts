import type { SurveyFormConfig } from '../types';

/**
 * Thư viện mẫu phiếu khảo sát.
 *
 * Mẫu chỉ là một bộ giá trị dựng sẵn cho `SurveyFormConfig`: chọn mẫu xong là mọi thứ
 * sửa tiếp được trong màn soạn phiếu, và phiếu vẽ ra hoàn toàn từ cấu hình chứ không
 * tra ngược lại mẫu. Vì vậy mẫu nằm trong mã nguồn, không cần bảng cơ sở dữ liệu —
 * thêm mẫu mới là thêm một phần tử vào danh sách này.
 *
 * `templateId` lưu trong cấu hình chỉ để màn soạn biết đang sửa trên mẫu nào.
 */
export interface SurveyFormTemplate {
  id: string;
  name: string;
  description: string;
  /** Giá trị dựng sẵn; những trường không nhắc tới giữ nguyên mặc định của hệ thống. */
  config: Omit<SurveyFormConfig, 'version'>;
}

/** Phiên bản cấu trúc cấu hình mà giao diện đang sinh ra; phải khớp backend. */
export const surveyFormConfigVersion = 2;

export const surveyFormTemplates: SurveyFormTemplate[] = [
  {
    id: 'blank',
    name: 'Phiếu trống',
    description: 'Giữ nguyên màu và chữ mặc định của hệ thống.',
    config: { templateId: 'blank' },
  },
  {
    id: 'course-survey',
    name: 'Khảo sát học phần',
    description: 'Xanh của trường, gọn thông tin: chỉ giữ lớp, giảng viên, học kỳ và lịch mở.',
    config: {
      templateId: 'course-survey',
      primaryColor: '#1f7a45',
      titleFont: 'default',
      titleFontSize: 30,
      titleBold: true,
      titleAlign: 'left',
      // Ba thông tin này với sinh viên không cần thiết; quản trị bật lại lúc nào cũng được.
      hiddenFields: ['templateName', 'questionCount', 'credits'],
      intro: 'Vui lòng đọc kỹ từng câu hỏi và trả lời dựa trên trải nghiệm thực tế của bạn.'
        + ' Phiếu này không ghi tên, mã sinh viên hay bất kỳ thông tin nào nhận ra bạn.\n'
        + 'Giảng viên chỉ nhận được kết quả tổng hợp của cả lớp, không xem được từng phiếu riêng lẻ.',
    },
  },
];

/** Cấu hình rỗng: mọi trường bỏ trống nghĩa là dùng mẫu mặc định của hệ thống. */
export const emptySurveyFormConfig = (): SurveyFormConfig => ({
  version: surveyFormConfigVersion,
});

/** Cấu hình dựng từ một mẫu. */
export const configFromTemplate = (template: SurveyFormTemplate): SurveyFormConfig => ({
  version: surveyFormConfigVersion,
  ...template.config,
});
