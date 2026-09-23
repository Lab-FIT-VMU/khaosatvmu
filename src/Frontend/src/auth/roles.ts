/** Mã vai trò có thật trong bảng "Roles". Khớp với RoleCodes bên backend. */
export const ROLE_CODES = {
  admin: 'ADMIN',
  surveyAdmin: 'SURVEY_ADMIN',
  boardOfDirectors: 'BOARD_OF_DIRECTORS',
  facultyManager: 'FACULTY_MANAGER',
  departmentManager: 'DEPARTMENT_MANAGER',
  lecturer: 'LECTURER',
} as const;

/** Tên hiển thị thống nhất; mã vai trò tiếng Anh chỉ dùng nội bộ. */
export const ROLE_NAMES: Readonly<Record<string, string>> = {
  [ROLE_CODES.admin]: 'Quản trị hệ thống',
  [ROLE_CODES.surveyAdmin]: 'Quản trị khảo sát',
  [ROLE_CODES.boardOfDirectors]: 'Ban Giám hiệu',
  [ROLE_CODES.facultyManager]: 'Trưởng khoa/viện',
  [ROLE_CODES.departmentManager]: 'Trưởng bộ môn',
  [ROLE_CODES.lecturer]: 'Giảng viên',
};

export function roleDisplayName(roleCode: string, fallback?: string): string {
  return ROLE_NAMES[roleCode] ?? fallback ?? roleCode;
}

/**
 * Vai trò cấp quản trị: không bị giới hạn phạm vi dữ liệu VÀ được làm mọi thao tác
 * ghi. Ban Giám hiệu tuy cũng thấy toàn trường nhưng chỉ đọc nên KHÔNG nằm ở đây —
 * dùng {@link seesAllData} cho những chỗ chỉ hỏi "thấy được bao nhiêu dữ liệu".
 *
 * Dùng để ẩn bớt nút cho gọn mắt. Việc chặn thật nằm ở backend — mỗi endpoint ghi tự
 * kiểm lại phạm vi chứ không tin vào chuyện nút đã bị ẩn.
 */
export function isUnrestrictedRole(roleCode: string | null | undefined): boolean {
  return roleCode === ROLE_CODES.admin || roleCode === ROLE_CODES.surveyAdmin;
}

/**
 * Thấy dữ liệu của toàn trường, không bị bó vào khoa hay bộ môn nào. Khác
 * {@link isUnrestrictedRole} ở chỗ có thêm Ban Giám hiệu — vai trò xem ngang quản trị
 * khảo sát nhưng không ghi được gì.
 */
export function seesAllData(roleCode: string | null | undefined): boolean {
  return isUnrestrictedRole(roleCode) || roleCode === ROLE_CODES.boardOfDirectors;
}

/**
 * Vai trò chỉ đọc: xem được dữ liệu trong phạm vi của mình nhưng không ghi được gì.
 * Giảng viên chỉ theo dõi lớp mình dạy; Ban Giám hiệu xem toàn trường nhưng không
 * phát đợt, không sửa danh mục, không cập nhật điểm.
 *
 * Cũng chỉ để ẩn nút. Backend tự từ chối mọi thao tác ghi của hai vai trò này, xem
 * congviec3.md mục H3.
 */
export function isReadOnlyRole(roleCode: string | null | undefined): boolean {
  return roleCode === ROLE_CODES.lecturer || roleCode === ROLE_CODES.boardOfDirectors;
}

/**
 * Chỉ xem được đúng lớp mình dạy. Tách khỏi {@link isReadOnlyRole} vì Ban Giám hiệu
 * cũng chỉ đọc nhưng lại thấy toàn trường — chỗ nào đang hỏi "có phải giảng viên
 * không" thì phải dùng hàm này.
 */
export function seesOnlyOwnSections(roleCode: string | null | undefined): boolean {
  return roleCode === ROLE_CODES.lecturer;
}

/**
 * Trưởng đơn vị: trưởng bộ môn xem bộ môn mình, trưởng khoa/viện xem cả khoa mình.
 * Hai vai trò này dùng chung bộ module và chung các nút thao tác trong phạm vi.
 */
export function isUnitManagerRole(roleCode: string | null | undefined): boolean {
  return roleCode === ROLE_CODES.departmentManager || roleCode === ROLE_CODES.facultyManager;
}

/**
 * Chỉ quản trị mới được THÊM hoặc XOÁ bản ghi trong Danh mục đào tạo. Trưởng đơn vị
 * và giảng viên chỉ xem, và sửa những gì thuộc phạm vi của mình — danh mục là dữ
 * liệu nền của cả trường, thêm bớt phải đi qua một đầu mối.
 *
 * Cũng chỉ để ẩn nút. Backend tự từ chối mọi thao tác ghi ngoài phạm vi.
 */
export function canCreateOrDeleteCatalog(roleCode: string | null | undefined): boolean {
  return isUnrestrictedRole(roleCode);
}

/**
 * Trang Bảng điều khiển TẠM ĐÓNG với giảng viên và các trưởng đơn vị.
 *
 * Các vai trò này có bản điều khiển riêng, nhưng nội dung chưa chốt nên tạm gỡ
 * khỏi thanh điều hướng. Mở lại chỉ cần cho hàm này trả về true.
 */
export function canAccessDashboard(roleCode: string | null | undefined): boolean {
  return roleCode !== ROLE_CODES.lecturer && !isUnitManagerRole(roleCode);
}
