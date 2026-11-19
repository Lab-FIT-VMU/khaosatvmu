import { commonApiErrorMessage } from './apiClient';

export const adminErrorMessages: Record<string, string> = {
  ADMIN_INVALID_REQUEST: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.',
  ADMIN_USER_NOT_FOUND: 'Tài khoản không còn tồn tại. Vui lòng tải lại danh sách.',
  ADMIN_USER_EMAIL_EXISTS: 'Email này đã có trong hệ thống.',
  ADMIN_IMPORT_EMAIL_REQUIRED: 'Thiếu email.',
  ADMIN_IMPORT_EMAIL_INVALID: 'Email không hợp lệ.',
  ADMIN_IMPORT_DISPLAY_NAME_INVALID: 'Họ và tên vượt quá 200 ký tự.',
  ADMIN_IMPORT_DUPLICATE_EMAIL: 'Email bị lặp trong tệp.',
  ADMIN_CANNOT_DISABLE_SELF: 'Bạn không thể vô hiệu chính tài khoản đang sử dụng.',
  ADMIN_PROFILE_NOT_FOUND: 'Hồ sơ làm việc không còn tồn tại. Vui lòng tải lại danh sách.',
  ADMIN_PROFILE_CODE_EXISTS: 'Mã hồ sơ đã tồn tại.',
  ADMIN_PROFILE_ASSIGNMENT_EXISTS: 'Người dùng đã có vai trò trong cùng phạm vi đơn vị.',
  ADMIN_ROLE_NOT_FOUND: 'Vai trò không còn tồn tại. Vui lòng tải lại danh sách.',
  ADMIN_IMPORT_ROLE_INVALID: 'Vai trò trong tệp không khớp với danh sách vai trò của hệ thống.',
  ADMIN_IMPORT_PROFILE_EXISTS: 'Tài khoản đã có hồ sơ với vai trò này.',
  ADMIN_NO_PROFILES_TO_CREATE: 'Tất cả tài khoản giảng viên phù hợp đã có hồ sơ.',
  ADMIN_CANNOT_MODIFY_ACTIVE_PROFILE: 'Không thể đổi vai trò hoặc vô hiệu hồ sơ đang sử dụng.',
  ADMIN_CANNOT_REVOKE_REQUIRED_PERMISSION: 'Không thể tắt quyền quản trị bắt buộc của Quản trị hệ thống.',
  AUTH_CSRF_INVALID: 'Phiên bảo mật đã thay đổi. Vui lòng thử lại.',
};

export const adminErrorMessage = (code: string | null | undefined): string =>
  adminErrorMessages[code ?? ''] ?? commonApiErrorMessage(code);
