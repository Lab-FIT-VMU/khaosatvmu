import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  FileClock,
  FileUp,
  Filter,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldPlus,
  UserCheck,
  UsersRound,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { roleDisplayName } from '../auth/roles';
import { Modal } from '../components/Modal';
import { ProfileImportDialog } from '../components/ProfileImportDialog';
import { useColumnFilters, type FilterableColumn } from '../hooks/useColumnFilters';
import type { ImportProfileRow } from '../utils/profileImportExcel';
import { RolePermissionEditor } from '../components/RolePermissionEditor';
import { UserImportDialog } from '../components/UserImportDialog';
import { adminApi } from '../services/adminApi';
import { ApiError } from '../services/apiClient';
import type {
  AdminAuditLog,
  AdminPage,
  AdminProfile,
  AdminRole,
  AdminUser,
  SaveAdminProfile,
} from '../types';
import '../styles/catalogs.css';
import '../styles/auth-admin.css';

type AdminView = 'users' | 'audit' | 'permissions';
type StatusConfirmation =
  | { type: 'user'; item: AdminUser }
  | { type: 'profile'; item: AdminProfile }
  | null;

/**
 * Tên hồ sơ và hai ký tự cuối của mã hồ sơ suy thẳng từ vai trò được cấp, không để
 * quản trị tự gõ: gõ tay thì mỗi người một kiểu và mã hồ sơ mất luôn tính tra cứu.
 *
 * Mã hồ sơ do backend cấp số tự tăng khi tạo và không xuất hiện trong biểu mẫu.
 */
const profileNamingByRole: Record<string, { name: string; suffix: string }> = {
  ADMIN: { name: 'Quản trị hệ thống', suffix: 'AD' },
  DEPARTMENT_MANAGER: { name: 'Trưởng bộ môn', suffix: 'BM' },
  LECTURER: { name: 'Giảng viên', suffix: 'GV' },
  SURVEY_ADMIN: { name: 'Quản trị khảo sát', suffix: 'QT' },
};

const emptyProfile: SaveAdminProfile = {
  name: '',
  roleId: '',
  organizationUnitCode: null,
  organizationUnitName: null,
  isDefault: false,
};

const eventNames: Record<string, string> = {
  ADMIN_USER_CREATED: 'Tạo tài khoản',
  ADMIN_USER_IMPORTED: 'Import tài khoản',
  ADMIN_USER_ENABLED: 'Kích hoạt tài khoản',
  ADMIN_USER_DISABLED: 'Vô hiệu tài khoản',
  ADMIN_PROFILE_CREATED: 'Tạo profile',
  ADMIN_PROFILE_UPDATED: 'Cập nhật profile',
  ADMIN_PROFILE_ENABLED: 'Kích hoạt profile',
  ADMIN_PROFILE_DISABLED: 'Vô hiệu profile',
  LOGIN_SUCCESS: 'Đăng nhập thành công',
  LOGOUT: 'Đăng xuất',
  PROFILE_SWITCHED: 'Chuyển profile',
  GOOGLE_LOGIN_PROFILE_REQUIRED: 'Yêu cầu chọn profile',
  GOOGLE_LOGIN_NO_PROFILE: 'Đăng nhập không có profile',
  CREATE: 'Tạo dữ liệu',
  UPDATE: 'Cập nhật dữ liệu',
  DELETE: 'Xóa dữ liệu',
  RESTORE: 'Khôi phục dữ liệu',
};

const auditFieldNames: Record<string, string> = {
  ProfileCode: 'Mã hồ sơ',
  ProfileName: 'Tên hồ sơ',
  actorUserId: 'Người thực hiện',
  details: 'Chi tiết',
};

interface AuditDetailItem {
  label: string;
  value: string;
}

function auditFieldName(key: string): string {
  return auditFieldNames[key]
    ?? key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}

function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function parseAuditDetails(json: string | null, parentLabel = ''): AuditDetailItem[] {
  if (!json) return [];

  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [{ label: parentLabel || 'Giá trị', value: auditValue(parsed) }];
    }

    return Object.entries(parsed as Record<string, unknown>).flatMap(([key, value]) => {
      const label = parentLabel
        ? `${parentLabel} · ${auditFieldName(key)}`
        : auditFieldName(key);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return parseAuditDetails(JSON.stringify(value), label);
      }
      return [{ label, value: auditValue(value) }];
    });
  } catch {
    return [{ label: parentLabel || 'Chi tiết', value: json }];
  }
}

function AuditDetailList({ items }: { items: AuditDetailItem[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="admin-audit-detail-list">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AuditLogDetails({ log }: { log: AdminAuditLog }) {
  const metadata = parseAuditDetails(log.metadata);
  const oldValues = parseAuditDetails(log.oldValues);
  const newValues = parseAuditDetails(log.newValues);

  if (log.source === 'AUTH') {
    return metadata.length > 0 ? <AuditDetailList items={metadata} /> : <span>—</span>;
  }

  return (
    <div className="admin-audit-change-details">
      <div className="admin-audit-record">
        <span><strong>Đối tượng:</strong> {log.entityName ?? '—'}</span>
        <span><strong>Mã bản ghi:</strong> {log.recordId || '—'}</span>
      </div>
      {oldValues.length > 0 && (
        <details>
          <summary>Dữ liệu trước thay đổi</summary>
          <AuditDetailList items={oldValues} />
        </details>
      )}
      {newValues.length > 0 && (
        <details>
          <summary>Dữ liệu sau thay đổi</summary>
          <AuditDetailList items={newValues} />
        </details>
      )}
    </div>
  );
}

const errorMessages: Record<string, string> = {
  ADMIN_INVALID_REQUEST: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.',
  ADMIN_USER_EMAIL_EXISTS: 'Email này đã có trong hệ thống.',
  ADMIN_CANNOT_DISABLE_SELF: 'Bạn không thể vô hiệu chính tài khoản đang sử dụng.',
  ADMIN_PROFILE_CODE_EXISTS: 'Mã profile đã tồn tại.',
  ADMIN_PROFILE_ASSIGNMENT_EXISTS: 'Người dùng đã có role trong cùng phạm vi đơn vị.',
  ADMIN_NO_PROFILES_TO_CREATE: 'Tất cả tài khoản giảng viên phù hợp đã có hồ sơ.',
  ADMIN_CANNOT_MODIFY_ACTIVE_PROFILE: 'Không thể đổi role hoặc vô hiệu profile đang sử dụng.',
  AUTH_CSRF_INVALID: 'Phiên bảo mật đã thay đổi. Vui lòng thử lại.',
};

function formatDate(value: string | null): string {
  if (!value) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) {
    return errorMessages[error.errorCode] ?? 'Không thể hoàn tất thao tác quản trị.';
  }
  return 'Không thể kết nối tới máy chủ.';
}

export function UsersAdminPage() {
  const [view, setView] = useState<AdminView>('users');
  const [usersPage, setUsersPage] = useState<AdminPage<AdminUser> | null>(null);
  const [auditPage, setAuditPage] = useState<AdminPage<AdminAuditLog> | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [page, setPage] = useState(1);
  /** Số dòng mỗi trang, phân trang chạy ở phía giao diện. */
  const usersPageSize = 20;
  const [auditPageNumber, setAuditPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isImportUsersOpen, setIsImportUsersOpen] = useState(false);
  const [newUser, setNewUser] = useState({ displayName: '', email: '' });
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editingProfile, setEditingProfile] = useState<AdminProfile | null>(null);
  const [profileForm, setProfileForm] = useState<SaveAdminProfile>(emptyProfile);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [statusConfirmation, setStatusConfirmation] = useState<StatusConfirmation>(null);

  const activeFilter = statusFilter === 'all' ? null : statusFilter === 'active';

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Nạp TRỌN danh sách rồi mới lọc: bộ lọc theo cột chạy ở phía giao diện nên
      // thiếu dòng nào là lọc sót dòng đó. Máy chủ kẹp mỗi lần gọi ở 100 dòng
      // (MaximumPageSize) nên phải xin tiếp cho tới khi đủ, thay vì xin một lần thật
      // lớn rồi tưởng là đã có hết.
      const serverPageSize = 100;
      const first = await adminApi.users(search, activeFilter, 1, serverPageSize);
      const items = [...first.items];

      const pageCount = Math.ceil(first.totalCount / serverPageSize);
      for (let next = 2; next <= pageCount; next += 1) {
        const chunk = await adminApi.users(search, activeFilter, next, serverPageSize);
        items.push(...chunk.items);
      }

      setUsersPage({ ...first, items });
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setLoading(false);
    }
  }, [activeFilter, search]);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAuditPage(await adminApi.auditLogs(auditPageNumber));
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setLoading(false);
    }
  }, [auditPageNumber]);

  const loadRoles = useCallback(async () => {
    try {
      setRoles(await adminApi.roles());
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (view !== 'users') return;
    const timer = window.setTimeout(() => void loadUsers(), 250);
    return () => window.clearTimeout(timer);
  }, [loadUsers, view]);

  useEffect(() => {
    if (view === 'audit') void loadAudit();
  }, [loadAudit, view]);

  const auditTotalPages = useMemo(
    () => Math.max(1, Math.ceil((auditPage?.totalCount ?? 0) / (auditPage?.pageSize ?? 30))),
    [auditPage],
  );

  const replaceUser = (user: AdminUser) => {
    setUsersPage((current) => current
      ? { ...current, items: current.items.map((item) => item.id === user.id ? user : item) }
      : current);
    setSelectedUser((current) => current?.id === user.id ? user : current);
  };

  const replaceProfile = (profile: AdminProfile) => {
    const update = (user: AdminUser): AdminUser => ({
      ...user,
      profiles: user.profiles.some((item) => item.id === profile.id)
        ? user.profiles.map((item) => item.id === profile.id ? profile : item)
        : [...user.profiles, profile],
    });
    setUsersPage((current) => current
      ? { ...current, items: current.items.map((user) => user.id === selectedUser?.id ? update(user) : user) }
      : current);
    setSelectedUser((current) => current ? update(current) : current);
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.createUser(newUser.email, newUser.displayName);
      setNewUser({ displayName: '', email: '' });
      setIsAddUserOpen(false);
      setPage(1);
      await loadUsers();
      toast.success('Đã thêm người dùng', { description: newUser.email });
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy(false);
    }
  };

  const handleUserStatus = async (user: AdminUser) => {
    setBusy(true);
    setError(null);
    try {
      replaceUser(await adminApi.setUserStatus(user.id, !user.isActive));
      setStatusConfirmation(null);
      toast.success(user.isActive ? 'Đã vô hiệu tài khoản' : 'Đã kích hoạt tài khoản', {
        description: user.email,
      });
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy(false);
    }
  };

  // Hai đường cấp hồ sơ hàng loạt: một cú bấm cho mức Giảng viên, tệp Excel cho
  // các vai trò còn lại.
  const [isImportProfilesOpen, setIsImportProfilesOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const handleBulkLecturerProfiles = async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    setError(null);
    try {
      const result = await adminApi.bulkCreateLecturerProfiles();
      await loadUsers();
      if (result.createdCount === 0) {
        toast.info('Không có hồ sơ Giảng viên mới cần cấp', {
          description: 'Tất cả tài khoản giảng viên phù hợp đã có hồ sơ.',
        });
        return;
      }
      toast.success(`Đã cấp ${result.createdCount} hồ sơ Giảng viên`, {
        description: result.skippedCount > 0
          ? `${result.skippedCount} tài khoản bị bỏ qua`
          : undefined,
      });
    } catch (requestError) {
      // Tương thích với backend phiên bản cũ vẫn trả 400 khi thao tác đã hoàn tất từ trước.
      if (
        requestError instanceof ApiError
        && requestError.errorCode === 'ADMIN_NO_PROFILES_TO_CREATE'
      ) {
        setError(null);
        toast.info('Không có hồ sơ Giảng viên mới cần cấp', {
          description: errorMessages.ADMIN_NO_PROFILES_TO_CREATE,
        });
        return;
      }
      const message = messageFrom(requestError);
      setError(message);
      toast.error('Không cấp được hồ sơ', { description: message });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleImportProfiles = async (rows: ImportProfileRow[]): Promise<string | null> => {
    try {
      const result = await adminApi.importProfiles(rows.map((row) => ({
        rowNumber: row.rowNumber,
        email: row.email,
        roleLabel: row.roleLabel,
      })));
      await loadUsers();
      toast.success(`Đã cấp ${result.createdCount} hồ sơ`, {
        description: result.skippedCount > 0
          ? `${result.skippedCount} dòng bị bỏ qua`
          : undefined,
      });
      return null;
    } catch (requestError) {
      return messageFrom(requestError);
    }
  };

  const userRows = useMemo(() => usersPage?.items ?? [], [usersPage]);

  /**
   * Vai trò của một tài khoản. Trả về DANH SÁCH chứ không phải một chuỗi ghép: gộp
   * lại thì menu lọc liệt kê từng tổ hợp một ("ADMIN, LECTURER", "ADMIN,
   * DEPARTMENT_MANAGER, LECTURER"...) thay vì bốn vai trò, và lọc theo trưởng bộ môn
   * sẽ bỏ sót mọi tài khoản kiêm thêm vai trò khác.
   */
  const rolesOf = (user: AdminUser) =>
    [...new Set(user.profiles.map((profile) => roleDisplayName(profile.roleCode, profile.roleName)))].sort();

  const roleLabelOf = (user: AdminUser) =>
    user.profiles.length === 0 ? 'Chưa có hồ sơ' : rolesOf(user).join(', ');

  const userColumns = useMemo<FilterableColumn<AdminUser>[]>(() => [
    { key: 'displayName', value: (user) => user.displayName || 'Chưa cập nhật họ tên' },
    { key: 'email', value: (user) => user.email },
    { key: 'status', value: (user) => (user.isActive ? 'Hoạt động' : 'Vô hiệu') },
    {
      key: 'roles',
      value: roleLabelOf,
      values: rolesOf,
      // Bốn vai trò cố định của hệ thống, cộng mục cho tài khoản chưa được cấp hồ sơ.
      options: ['Quản trị hệ thống', 'Quản trị khảo sát', 'Trưởng bộ môn', 'Giảng viên', 'Chưa có hồ sơ'],
    },
    { key: 'lastLogin', value: (user) => formatDate(user.lastLoginAt) },
  ], []);

  const userFilters = useColumnFilters(userRows, userColumns);

  // Phân trang chạy trên kết quả ĐÃ lọc, nếu không thì lọc xong vẫn kẹt ở trang cũ.
  const userTotalPages = Math.max(1, Math.ceil(userFilters.visibleRows.length / usersPageSize));
  const visibleUsers = userFilters.visibleRows.slice(
    (page - 1) * usersPageSize,
    page * usersPageSize,
  );

  useEffect(() => {
    if (page > userTotalPages) setPage(1);
  }, [page, userTotalPages]);

  const openProfileForm = (profile?: AdminProfile) => {
    setEditingProfile(profile ?? null);
    setProfileForm(profile ? {
      name: profile.name,
      roleId: profile.roleId,
      organizationUnitCode: profile.organizationUnitCode,
      organizationUnitName: profile.organizationUnitName,
      isDefault: profile.isDefault,
    } : { ...emptyProfile, roleId: roles[0]?.id ?? '' });
    setShowProfileForm(true);
    setError(null);
  };

  // Vai trò đang chọn quyết định cả tên lẫn hậu tố mã, nên tính tại chỗ thay vì
  // giữ thêm state — state riêng thì đổi vai trò xong hai ô kia còn giá trị cũ.
  const selectedRoleCode = roles.find((role) => role.id === profileForm.roleId)?.code ?? '';
  const naming = profileNamingByRole[selectedRoleCode];
  const derivedProfileName = naming?.name ?? '';

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    setBusy(true);
    setError(null);
    try {
      const wasEditing = editingProfile !== null;
      // Mã đơn vị / phạm vi không còn ô nhập nào: giữ nguyên giá trị cũ khi sửa để
      // không xoá mất dữ liệu đã có trong cơ sở dữ liệu.
      const payload: SaveAdminProfile = {
        ...profileForm,
        name: derivedProfileName || profileForm.name,
      };
      const saved = editingProfile
        ? await adminApi.updateProfile(selectedUser.id, editingProfile.id, payload)
        : await adminApi.createProfile(selectedUser.id, payload);
      replaceProfile(saved);
      setShowProfileForm(false);
      setEditingProfile(null);
      toast.success(wasEditing ? 'Đã cập nhật hồ sơ' : 'Đã thêm hồ sơ', {
        description: saved.name,
      });
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy(false);
    }
  };

  const handleProfileStatus = async (profile: AdminProfile) => {
    if (!selectedUser) return;
    setBusy(true);
    setError(null);
    try {
      replaceProfile(await adminApi.setProfileStatus(selectedUser.id, profile.id, !profile.isActive));
      setStatusConfirmation(null);
      toast.success(profile.isActive ? 'Đã vô hiệu hồ sơ' : 'Đã kích hoạt hồ sơ', {
        description: profile.name,
      });
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy(false);
    }
  };

  const retryCurrentView = () => {
    if (roles.length === 0) void loadRoles();
    if (view === 'users') {
      void loadUsers();
    } else if (view === 'audit') {
      void loadAudit();
    }
  };

  const hasUserFilters = search.trim().length > 0 || statusFilter !== 'all';
  const confirmationItem = statusConfirmation?.item;
  const confirmationIsActive = confirmationItem?.isActive ?? false;

  return (
    <div className="admin-users-page">
      <div className="admin-view-tabs-bar">
        <div className="admin-view-tabs" role="tablist" aria-label="Chế độ quản trị người dùng">
          <button
            id="admin-users-tab"
            type="button"
            className={view === 'users' ? 'active' : ''}
            onClick={() => { setView('users'); setError(null); }}
            role="tab"
            aria-selected={view === 'users'}
            aria-controls="admin-users-panel"
          >
            <UsersRound aria-hidden="true" />
            Tài khoản và hồ sơ
          </button>
          <button
            id="admin-audit-tab"
            type="button"
            className={view === 'audit' ? 'active' : ''}
            onClick={() => { setView('audit'); setError(null); }}
            role="tab"
            aria-selected={view === 'audit'}
            aria-controls="admin-audit-panel"
          >
            <FileClock aria-hidden="true" />
            Nhật ký hệ thống
          </button>
          <button
            id="admin-permissions-tab"
            type="button"
            className={view === 'permissions' ? 'active' : ''}
            onClick={() => { setView('permissions'); setError(null); }}
            role="tab"
            aria-selected={view === 'permissions'}
            aria-controls="admin-permissions-panel"
          >
            <ShieldCheck aria-hidden="true" />
            Phân quyền Module
          </button>
        </div>

        {view === 'users' && (
          <div className="admin-view-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleBulkLecturerProfiles()}
              disabled={bulkBusy}
              title="Cấp hồ sơ Giảng viên cho mọi tài khoản chưa có hồ sơ nào"
            >
              {bulkBusy ? <LoaderCircle className="auth-spin" aria-hidden="true" /> : <UsersRound aria-hidden="true" />}
              {bulkBusy ? 'Đang cấp...' : 'Cấp hồ sơ giảng viên hàng loạt'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setError(null); setIsImportProfilesOpen(true); }}
            >
              <ShieldPlus aria-hidden="true" />
              Cấp hồ sơ từ Excel
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setError(null); setIsImportUsersOpen(true); }}
            >
              <FileUp aria-hidden="true" />
              Import Excel
            </button>
            <button
              type="button"
              className="btn btn-primary admin-primary-action"
              onClick={() => { setError(null); setIsAddUserOpen(true); }}
            >
              <Plus aria-hidden="true" />
              Thêm người dùng
            </button>
          </div>
        )}
      </div>

      {error && !isAddUserOpen && !selectedUser && !statusConfirmation && (
        <div className="admin-alert admin-alert-action" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={retryCurrentView} disabled={loading}>
            <RefreshCw aria-hidden="true" />
            Thử lại
          </button>
        </div>
      )}

      {view === 'users' ? (
        <section
          id="admin-users-panel"
          className="admin-table-section"
          role="tabpanel"
          aria-labelledby="admin-users-tab"
        >
          <div className="table-toolbar admin-table-toolbar">
            <label className="search-box admin-search-box">
              <Search aria-hidden="true" />
              <span className="admin-visually-hidden">Tìm người dùng</span>
              <input
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Tìm theo email hoặc họ tên"
              />
            </label>
            <div className="admin-toolbar-end">
              <span className="admin-result-count" aria-live="polite">
                {loading ? 'Đang cập nhật' : `${usersPage?.totalCount ?? 0} tài khoản`}
              </span>
              <label className="admin-filter-control">
                <Filter aria-hidden="true" />
                <span className="admin-visually-hidden">Lọc trạng thái tài khoản</span>
                <select
                  className="filter-select"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as typeof statusFilter);
                    setPage(1);
                  }}
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="active">Đang hoạt động</option>
                  <option value="disabled">Đã vô hiệu</option>
                </select>
              </label>
            </div>
          </div>

          <div className="catalog-table-scroll admin-table-container" tabIndex={0} aria-busy={loading}>
            <table className="catalog-table admin-users-table">
              <caption className="admin-visually-hidden">Danh sách tài khoản được phép truy cập hệ thống</caption>
              <thead>
                <tr>
                  <th scope="col">{userFilters.filterHeader('displayName', 'Người dùng')}</th>
                  <th scope="col">{userFilters.filterHeader('email', 'Email')}</th>
                  <th scope="col">{userFilters.filterHeader('status', 'Trạng thái')}</th>
                  <th scope="col">{userFilters.filterHeader('roles', 'Hồ sơ và vai trò')}</th>
                  <th scope="col">{userFilters.filterHeader('lastLogin', 'Đăng nhập gần nhất')}</th>
                  <th scope="col"><span className="admin-visually-hidden">Thao tác</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="admin-state-row">
                      <LoaderCircle className="auth-spin" aria-hidden="true" />
                      <strong>Đang tải danh sách người dùng</strong>
                    </td>
                  </tr>
                ) : visibleUsers.length ? visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.displayName || 'Chưa cập nhật họ tên'}</strong>
                    </td>
                    <td>
                      <span className="admin-cell-subtitle">{user.email}</span>
                    </td>
                    <td>
                      <span className={`admin-status ${user.isActive ? 'is-active' : 'is-disabled'}`}>
                        <span aria-hidden="true" />
                        {user.isActive ? 'Hoạt động' : 'Vô hiệu'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-profile-tags">
                        {user.profiles.length === 0
                          ? <span className="admin-cell-subtitle">Chưa có hồ sơ</span>
                          : user.profiles.map((profile) => (
                            <span
                              key={profile.id}
                              className={`admin-role-label ${profile.isActive ? '' : 'is-disabled'}`}
                              title={`${profile.name}${profile.isActive ? '' : ' - Đã vô hiệu'}`}
                            >
                              {roleDisplayName(profile.roleCode, profile.roleName)}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="admin-date-cell">{formatDate(user.lastLoginAt)}</td>
                    <td className="admin-action-cell">
                      <button
                        type="button"
                        className="admin-icon-button"
                        title={`Xem chi tiết ${user.email}`}
                        aria-label={`Xem chi tiết ${user.email}`}
                        onClick={() => {
                          setSelectedUser(user);
                          setShowProfileForm(false);
                          setError(null);
                        }}
                      >
                        <Eye aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="admin-state-row admin-empty-row">
                      <UsersRound aria-hidden="true" />
                      <strong>{hasUserFilters ? 'Không có kết quả phù hợp' : 'Chưa có người dùng'}</strong>
                      <span>
                        {hasUserFilters
                          ? 'Thử thay đổi từ khóa hoặc bộ lọc trạng thái.'
                          : 'Thêm tài khoản Google đầu tiên để cấp quyền truy cập.'}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination admin-pagination">
            <div>Trang <strong>{page}</strong> / {userTotalPages}</div>
            <div className="admin-pagination-actions">
              <button
                type="button"
                className="admin-icon-button"
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
                aria-label="Trang trước"
                title="Trang trước"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                className="admin-icon-button"
                disabled={page >= userTotalPages || loading}
                onClick={() => setPage(page + 1)}
                aria-label="Trang sau"
                title="Trang sau"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      ) : view === 'audit' ? (
        <section
          id="admin-audit-panel"
          className="admin-table-section"
          role="tabpanel"
          aria-labelledby="admin-audit-tab"
        >
          <div className="admin-audit-heading">
            <div>
              <h3>Nhật ký hệ thống</h3>
              <p>Sự kiện xác thực, quản trị và thay đổi dữ liệu mới nhất.</p>
            </div>
            <div className="admin-audit-actions">
              <span className="admin-result-count" aria-live="polite">
                {loading ? 'Đang cập nhật' : `${auditPage?.totalCount ?? 0} sự kiện`}
              </span>
              <button
                type="button"
                className="admin-icon-button"
                onClick={() => void loadAudit()}
                disabled={loading}
                aria-label="Làm mới nhật ký"
                title="Làm mới nhật ký"
              >
                <RefreshCw className={loading ? 'auth-spin' : ''} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="table-container admin-table-container" aria-busy={loading}>
            <table className="vmu-table admin-audit-table">
              <caption className="admin-visually-hidden">Nhật ký xác thực, quản trị và thay đổi dữ liệu</caption>
              <thead>
                <tr>
                  <th scope="col">Thời gian</th>
                  <th scope="col">Sự kiện</th>
                  <th scope="col">Tài khoản</th>
                  <th scope="col">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="admin-state-row">
                      <LoaderCircle className="auth-spin" aria-hidden="true" />
                      <strong>Đang tải nhật ký hệ thống</strong>
                    </td>
                  </tr>
                ) : auditPage?.items.length ? (
                  auditPage.items.map((log) => (
                    <tr key={log.id}>
                      <td className="admin-date-cell">{formatDate(log.createdAt)}</td>
                      <td>
                        <span className="badge badge-neutral">
                          {eventNames[log.event] ?? log.event}
                          {log.entityName ? ` · ${log.entityName}` : ''}
                        </span>
                      </td>
                      <td>{log.email ?? 'Hệ thống'}</td>
                      <td className="admin-audit-metadata"><AuditLogDetails log={log} /></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="admin-state-row admin-empty-row">
                      <FileClock aria-hidden="true" />
                      <strong>Chưa có sự kiện nhật ký</strong>
                      <span>Các hoạt động xác thực, quản trị và thay đổi dữ liệu sẽ xuất hiện tại đây.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination admin-pagination">
            <div>Trang <strong>{auditPageNumber}</strong> / {auditTotalPages}</div>
            <div className="admin-pagination-actions">
              <button
                type="button"
                className="admin-icon-button"
                disabled={auditPageNumber <= 1 || loading}
                onClick={() => setAuditPageNumber(auditPageNumber - 1)}
                aria-label="Trang trước"
                title="Trang trước"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                className="admin-icon-button"
                disabled={auditPageNumber >= auditTotalPages || loading}
                onClick={() => setAuditPageNumber(auditPageNumber + 1)}
                aria-label="Trang sau"
                title="Trang sau"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section
          id="admin-permissions-panel"
          className="admin-table-section"
          role="tabpanel"
          aria-labelledby="admin-permissions-tab"
        >
          <div className="admin-audit-heading">
            <div>
              <h3>Phân quyền Truy cập & Module Báo cáo</h3>
              <p>Quản trị viên có thể bật/tắt quyền hạn (Permissions) cho từng vai trò (Roles) trong hệ thống.</p>
            </div>
          </div>

          {roles.length === 0 ? (
            <p className="perm-empty">Chưa có vai trò nào trong hệ thống.</p>
          ) : (
            <RolePermissionEditor roles={roles} />
          )}
        </section>
      )}


      <Modal
        isOpen={isAddUserOpen}
        onClose={() => { setIsAddUserOpen(false); setError(null); }}
        title="Thêm người dùng vào danh sách truy cập"
      >
        <form className="admin-form" onSubmit={handleCreateUser} aria-busy={busy}>
          <div className="admin-form-intro">
            <ShieldPlus aria-hidden="true" />
            <p>Tài khoản chỉ có thể đăng nhập sau khi được tạo hồ sơ làm việc.</p>
          </div>
          <div className="form-group">
            <label htmlFor="admin-display-name">Họ và tên</label>
            <input
              id="admin-display-name"
              value={newUser.displayName}
              onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })}
              maxLength={200}
              autoComplete="name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="admin-email">Email tài khoản Google</label>
            <input
              id="admin-email"
              type="email"
              value={newUser.email}
              onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
              required
              maxLength={320}
              placeholder="user@gmail.com"
              autoComplete="email"
            />
          </div>
          {error && (
            <div className="admin-alert" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <div className="modal-footer admin-inline-footer">
            <button type="button" className="btn btn-secondary" onClick={() => { setIsAddUserOpen(false); setError(null); }}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <LoaderCircle className="auth-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {busy ? 'Đang lưu...' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      </Modal>

      <UserImportDialog
        isOpen={isImportUsersOpen}
        onClose={() => setIsImportUsersOpen(false)}
        onImported={() => {
          if (page === 1) void loadUsers();
          else setPage(1);
        }}
      />

      <ProfileImportDialog
        isOpen={isImportProfilesOpen}
        onClose={() => setIsImportProfilesOpen(false)}
        onImport={handleImportProfiles}
      />

      <Modal
        isOpen={selectedUser !== null}
        onClose={() => { setSelectedUser(null); setShowProfileForm(false); setError(null); }}
        title={showProfileForm ? (editingProfile ? 'Cập nhật hồ sơ' : 'Tạo hồ sơ mới') : 'Chi tiết tài khoản'}
      >
        {selectedUser && (showProfileForm ? (
          <form className="admin-form" onSubmit={handleSaveProfile} aria-busy={busy}>
            <button type="button" className="admin-back-button" onClick={() => { setShowProfileForm(false); setError(null); }}>
              <ArrowLeft aria-hidden="true" />
              Quay lại tài khoản
            </button>
            <div className="form-group">
              <label htmlFor="profile-role">Vai trò được cấp</label>
              <select id="profile-role" value={profileForm.roleId} onChange={(event) => setProfileForm({ ...profileForm, roleId: event.target.value })} required>
                <option value="">Chọn vai trò</option>
                {roles.map((role) => <option key={role.id} value={role.id}>{roleDisplayName(role.code, role.name)}</option>)}
              </select>
            </div>

            {/* Tên do vai trò quyết định; mã do backend tự cấp và không xuất hiện trong biểu mẫu. */}
            <div className="form-group">
              <label htmlFor="profile-name">Tên hồ sơ</label>
              <input
                id="profile-name"
                value={derivedProfileName}
                readOnly
                placeholder="Chọn vai trò để có tên hồ sơ"
              />
            </div>
            <label className="admin-checkbox-row">
              <input type="checkbox" checked={profileForm.isDefault} onChange={(event) => setProfileForm({ ...profileForm, isDefault: event.target.checked })} />
              Đặt làm hồ sơ mặc định
            </label>
            {error && (
              <div className="admin-alert" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            <div className="modal-footer admin-inline-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { setShowProfileForm(false); setError(null); }}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? <LoaderCircle className="auth-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                {busy ? 'Đang lưu...' : 'Lưu hồ sơ'}
              </button>
            </div>
          </form>
        ) : (
          <div className="admin-account-detail">
            <div className="admin-account-summary">
              <div className="admin-account-identity">
                <div className="admin-account-avatar" aria-hidden="true">
                  <UsersRound />
                </div>
                <div>
                  <strong>{selectedUser.displayName || 'Chưa cập nhật họ tên'}</strong>
                  <span>{selectedUser.email}</span>
                  <small>Đăng nhập gần nhất: {formatDate(selectedUser.lastLoginAt)}</small>
                </div>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${selectedUser.isActive ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => { setError(null); setStatusConfirmation({ type: 'user', item: selectedUser }); }}
                disabled={busy}
              >
                {selectedUser.isActive ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
                {selectedUser.isActive ? 'Vô hiệu tài khoản' : 'Kích hoạt tài khoản'}
              </button>
            </div>
            <div className="admin-profile-heading">
              <div>
                <h4>Hồ sơ làm việc</h4>
                <p>Mỗi hồ sơ có vai trò và phạm vi quyền độc lập.</p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openProfileForm()}>
                <Plus aria-hidden="true" />
                Tạo hồ sơ
              </button>
            </div>
            <div className="admin-profile-list">
              {selectedUser.profiles.length ? selectedUser.profiles.map((profile) => (
                <div className="admin-profile-row" key={profile.id}>
                  <div>
                    <div className="admin-profile-title">
                      <strong>{profile.name}</strong>
                      {profile.isDefault && <span className="admin-role-label is-default">Mặc định</span>}
                      <span className={`admin-status ${profile.isActive ? 'is-active' : 'is-disabled'}`}>
                        <span aria-hidden="true" />
                        {profile.isActive ? 'Hoạt động' : 'Vô hiệu'}
                      </span>
                    </div>
                    <span>{roleDisplayName(profile.roleCode, profile.roleName)} · {profile.code}</span>
                    <small>{profile.organizationUnitName || 'Toàn hệ thống'}{profile.organizationUnitCode ? ` (${profile.organizationUnitCode})` : ''}</small>
                  </div>
                  <div className="admin-row-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openProfileForm(profile)}>
                      <Pencil aria-hidden="true" />
                      Sửa
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${profile.isActive ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={() => { setError(null); setStatusConfirmation({ type: 'profile', item: profile }); }}
                      disabled={busy}
                    >
                      {profile.isActive ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
                      {profile.isActive ? 'Vô hiệu' : 'Kích hoạt'}
                    </button>
                  </div>
                </div>
              )) : (
                <div className="admin-empty-state">
                  <ShieldPlus aria-hidden="true" />
                  <strong>Chưa có hồ sơ làm việc</strong>
                  <span>Tài khoản chưa thể đăng nhập cho đến khi được cấp hồ sơ.</span>
                </div>
              )}
            </div>
            {error && (
              <div className="admin-alert" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
          </div>
        ))}
      </Modal>

      <Modal
        isOpen={statusConfirmation !== null}
        onClose={() => { if (!busy) { setStatusConfirmation(null); setError(null); } }}
        title={confirmationIsActive ? 'Xác nhận vô hiệu' : 'Xác nhận kích hoạt'}
      >
        {statusConfirmation && (
          <div className="admin-confirmation" aria-busy={busy}>
            <div className={`admin-confirmation-icon ${confirmationIsActive ? 'is-danger' : 'is-success'}`}>
              {confirmationIsActive ? <UserX aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            </div>
            <div>
              <p>
                {statusConfirmation.type === 'user'
                  ? `${confirmationIsActive ? 'Vô hiệu' : 'Kích hoạt'} tài khoản ${statusConfirmation.item.email}?`
                  : `${confirmationIsActive ? 'Vô hiệu' : 'Kích hoạt'} hồ sơ ${statusConfirmation.item.name}?`}
              </p>
              <span>
                {confirmationIsActive
                  ? 'Đối tượng này sẽ không thể được sử dụng cho các phiên đăng nhập mới.'
                  : 'Đối tượng này sẽ có thể được sử dụng lại theo quyền đã cấp.'}
              </span>
            </div>
            {error && (
              <div className="admin-alert" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            <div className="modal-footer admin-inline-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { setStatusConfirmation(null); setError(null); }} disabled={busy}>
                Hủy
              </button>
              <button
                type="button"
                className={`btn ${confirmationIsActive ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => {
                  if (statusConfirmation.type === 'user') {
                    void handleUserStatus(statusConfirmation.item);
                  } else {
                    void handleProfileStatus(statusConfirmation.item);
                  }
                }}
                disabled={busy}
              >
                {busy && <LoaderCircle className="auth-spin" aria-hidden="true" />}
                {busy ? 'Đang xử lý...' : (confirmationIsActive ? 'Xác nhận vô hiệu' : 'Xác nhận kích hoạt')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
