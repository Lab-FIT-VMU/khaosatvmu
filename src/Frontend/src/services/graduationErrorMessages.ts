import { ApiError, apiErrorMessage, commonApiErrorMessage } from './apiClient';

const messages: Record<string, string> = {
  GRADUATION_IMPORT_INVALID: 'File hoặc thông tin import không hợp lệ.',
  GRADUATION_IMPORT_TOO_LARGE: 'File vượt quá giới hạn dữ liệu cho phép.',
  GRADUATION_QUERY_INVALID: 'Thông tin yêu cầu không hợp lệ. Vui lòng kiểm tra lại.',
  GRADUATION_OUT_OF_SCOPE: 'Bạn không có quyền thao tác với dữ liệu tốt nghiệp này.',
  GRADUATION_V3_PERIOD_NOT_FOUND: 'Đợt này không còn tồn tại hoặc đã được người khác xóa.',
  GRADUATION_V3_CONCURRENT_REPLACE: 'Đợt đã được người khác cập nhật. Vui lòng tải lại dữ liệu.',
  GRADUATION_V3_REPLACE_REASON_REQUIRED: 'Vui lòng nhập lý do khi import lại.',
  LEGACY_STRUCTURE_UNSUPPORTED: 'Cấu trúc file cũ không được hỗ trợ. Vui lòng sử dụng file theo mẫu hiện tại.',
};

export function graduationErrorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  return apiErrorMessage(error, code => {
    // Only domain errors may provide a user-facing explanation about the file.
    if (error instanceof ApiError && error.status < 500 && code?.startsWith('GRADUATION_')) {
      const detail = typeof error.body.message === 'string' ? error.body.message.trim() : '';
      if (detail) return detail;
    }
    return overrides[code ?? ''] ?? messages[code ?? ''] ?? commonApiErrorMessage(code);
  });
}
