/**
 * Mã các vai trò mặc định trong bảng "Roles". Vai trò người quản trị tự thêm có mã sinh tự
 * động; mọi quyết định dưới đây đi theo PHẠM VI và QUYỀN GHI của vai trò, không theo mã.
 */
export const ROLE_CODES = {
  admin: 'ADMIN',
  surveyAdmin: 'SURVEY_ADMIN',
  boardOfDirectors: 'BOARD_OF_DIRECTORS',
  facultyManager: 'FACULTY_MANAGER',
  departmentManager: 'DEPARTMENT_MANAGER',
  lecturer: 'LECTURER',
} as const;

/** "Roles"."DataScope": vai trò thấy dữ liệu của ai. */
export type RoleDataScope = 'ALL' | 'FACULTY' | 'DEPARTMENT' | 'OWN';

export const ROLE_DATA_SCOPE_LABELS: Readonly<Record<RoleDataScope, string>> = {
  ALL: 'Toàn trường',
  FACULTY: 'Cả khoa',
  DEPARTMENT: 'Bộ môn',
  OWN: 'Chỉ lớp mình dạy',
};

interface RoleCapabilities {
  name: string;
  dataScope: RoleDataScope;
  canWrite: boolean;
}

/**
 * Thuộc tính của sáu vai trò mặc định, chỉ dùng khi chưa nhận được thuộc tính thật từ máy
 * chủ (vd màn chọn hồ sơ trước khi đăng nhập xong).
 */
const DEFAULT_CAPABILITIES: Readonly<Record<string, RoleCapabilities>> = {
  [ROLE_CODES.admin]: { name: 'Quản trị hệ thống', dataScope: 'ALL', canWrite: true },
  [ROLE_CODES.surveyAdmin]: { name: 'Quản trị khảo sát', dataScope: 'ALL', canWrite: true },
  [ROLE_CODES.boardOfDirectors]: { name: 'Ban Giám hiệu', dataScope: 'ALL', canWrite: false },
  [ROLE_CODES.facultyManager]: { name: 'Quản lý khoa', dataScope: 'FACULTY', canWrite: true },
  [ROLE_CODES.departmentManager]: { name: 'Quản lý bộ môn', dataScope: 'DEPARTMENT', canWrite: true },
  [ROLE_CODES.lecturer]: { name: 'Giảng viên', dataScope: 'OWN', canWrite: false },
};

/** Thuộc tính vai trò của các hồ sơ người đang đăng nhập có, nhận từ /api/auth/me. */
const registered = new Map<string, RoleCapabilities>();

/**
 * Ghi nhận phạm vi và quyền ghi của các vai trò mà người đăng nhập có. Gọi mỗi lần nhận
 * phiên đăng nhập, để các hàm dưới đây trả đúng cho cả vai trò người quản trị tự thêm.
 */
export function registerRoleCapabilities(
  profiles: ReadonlyArray<{ roleCode: string; roleName?: string; dataScope?: string; canWrite?: boolean }>,
): void {
  registered.clear();
  for (const profile of profiles) {
    if (!profile.dataScope) continue;
    registered.set(profile.roleCode, {
      name: profile.roleName || DEFAULT_CAPABILITIES[profile.roleCode]?.name || profile.roleCode,
      dataScope: profile.dataScope as RoleDataScope,
      canWrite: Boolean(profile.canWrite),
    });
  }
}

function capabilitiesOf(roleCode: string | null | undefined): RoleCapabilities | null {
  if (!roleCode) return null;
  return registered.get(roleCode) ?? DEFAULT_CAPABILITIES[roleCode] ?? null;
}

/** Tên hiển thị của vai trò; mã vai trò chỉ dùng nội bộ. */
export function roleDisplayName(roleCode: string, fallback?: string): string {
  return capabilitiesOf(roleCode)?.name ?? fallback ?? roleCode;
}

/**
 * Thấy toàn trường VÀ được ghi: được làm mọi thao tác quản trị (phát đợt, phát hành kết
 * quả, thêm/xóa danh mục…), giới hạn tiếp theo quyền module.
 *
 * Chỉ để ẩn bớt nút cho gọn mắt. Việc chặn thật nằm ở backend.
 */
export function isUnrestrictedRole(roleCode: string | null | undefined): boolean {
  const role = capabilitiesOf(roleCode);
  return role?.dataScope === 'ALL' && role.canWrite;
}

/** Thấy dữ liệu toàn trường, có thể chỉ xem (như Ban Giám hiệu). */
export function seesAllData(roleCode: string | null | undefined): boolean {
  return capabilitiesOf(roleCode)?.dataScope === 'ALL';
}

/**
 * Vai trò chỉ xem: không ghi được gì trong phạm vi của mình. Phạm vi "chỉ lớp mình dạy"
 * luôn chỉ xem. Backend chặn mọi yêu cầu ghi của hồ sơ chỉ xem ở một chỗ.
 */
export function isReadOnlyRole(roleCode: string | null | undefined): boolean {
  const role = capabilitiesOf(roleCode);
  return !role || !role.canWrite || role.dataScope === 'OWN';
}

/** Chỉ xem được đúng lớp mình dạy (màn hình riêng của giảng viên). */
export function seesOnlyOwnSections(roleCode: string | null | undefined): boolean {
  return capabilitiesOf(roleCode)?.dataScope === 'OWN';
}

/** Phạm vi một khoa hoặc một bộ môn, được ghi hay chỉ xem đều tính. */
export function isUnitScopedRole(roleCode: string | null | undefined): boolean {
  const scope = capabilitiesOf(roleCode)?.dataScope;
  return scope === 'FACULTY' || scope === 'DEPARTMENT';
}

/** Quản lý đơn vị: phạm vi khoa hoặc bộ môn VÀ được ghi trong đơn vị mình. */
export function isUnitManagerRole(roleCode: string | null | undefined): boolean {
  return isUnitScopedRole(roleCode) && !isReadOnlyRole(roleCode);
}

/**
 * Chỉ quản trị toàn trường mới được THÊM hoặc XOÁ bản ghi trong Danh mục đào tạo — danh
 * mục là dữ liệu nền của cả trường, thêm bớt phải đi qua một đầu mối.
 */
export function canCreateOrDeleteCatalog(roleCode: string | null | undefined): boolean {
  return isUnrestrictedRole(roleCode);
}

/**
 * Trang Bảng điều khiển hiện chỉ mở cho vai trò thấy toàn trường. Vai trò phạm vi khoa,
 * bộ môn hay lớp mình dạy có bản điều khiển riêng nhưng nội dung chưa chốt nên tạm đóng.
 */
export function canAccessDashboard(roleCode: string | null | undefined): boolean {
  return seesAllData(roleCode);
}
