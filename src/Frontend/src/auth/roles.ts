/** Mã vai trò có thật trong bảng "Roles". Khớp với RoleCodes bên backend. */
export const ROLE_CODES = {
  admin: 'ADMIN',
  surveyAdmin: 'SURVEY_ADMIN',
  departmentManager: 'DEPARTMENT_MANAGER',
  lecturer: 'LECTURER',
} as const;

/** Tên hiển thị thống nhất; mã vai trò tiếng Anh chỉ dùng nội bộ. */
export const ROLE_NAMES: Readonly<Record<string, string>> = {
  [ROLE_CODES.admin]: 'Quản trị hệ thống',
  [ROLE_CODES.surveyAdmin]: 'Quản trị khảo sát',
  [ROLE_CODES.departmentManager]: 'Trưởng bộ môn',
  [ROLE_CODES.lecturer]: 'Giảng viên',
};

export function roleDisplayName(roleCode: string, fallback?: string): string {
  return ROLE_NAMES[roleCode] ?? fallback ?? roleCode;
}

/**
 * Vai trò cấp quản trị: không bị giới hạn phạm vi dữ liệu và được làm mọi thao tác
 * ghi. Các vai trò còn lại chỉ thấy và sửa được dữ liệu bộ môn của mình.
 *
 * Dùng để ẩn bớt nút cho gọn mắt. Việc chặn thật nằm ở backend — mỗi endpoint ghi tự
 * kiểm lại phạm vi chứ không tin vào chuyện nút đã bị ẩn.
 */
export function isUnrestrictedRole(roleCode: string | null | undefined): boolean {
  return roleCode === ROLE_CODES.admin || roleCode === ROLE_CODES.surveyAdmin;
}

/**
 * Vai trò chỉ đọc: xem được dữ liệu trong phạm vi của mình nhưng không ghi được gì.
 * Giảng viên chỉ có mỗi việc theo dõi lớp mình dạy và tiến độ thu phiếu.
 *
 * Cũng chỉ để ẩn nút. Backend tự từ chối mọi thao tác ghi của vai trò này, xem
 * congviec3.md mục H3.
 */
export function isReadOnlyRole(roleCode: string | null | undefined): boolean {
  return roleCode === ROLE_CODES.lecturer;
}

/**
 * Chỉ quản trị mới được THÊM hoặc XOÁ bản ghi trong Danh mục đào tạo. Trưởng bộ môn
 * và giảng viên chỉ xem, và sửa những gì thuộc phạm vi của mình — danh mục là dữ
 * liệu nền của cả trường, thêm bớt phải đi qua một đầu mối.
 *
 * Cũng chỉ để ẩn nút. Backend tự từ chối mọi thao tác ghi ngoài phạm vi.
 */
export function canCreateOrDeleteCatalog(roleCode: string | null | undefined): boolean {
  return isUnrestrictedRole(roleCode);
}

/**
 * Trang Bảng điều khiển TẠM ĐÓNG với giảng viên và trưởng bộ môn.
 *
 * Hai vai trò này có bản điều khiển riêng, nhưng nội dung chưa chốt nên tạm gỡ
 * khỏi thanh điều hướng. Mở lại chỉ cần cho hàm này trả về true.
 */
export function canAccessDashboard(roleCode: string | null | undefined): boolean {
  return roleCode !== ROLE_CODES.lecturer && roleCode !== ROLE_CODES.departmentManager;
}
