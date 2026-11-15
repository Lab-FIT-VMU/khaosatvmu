import type {
  AdminAuditLog,
  AdminPage,
  AdminProfile,
  AdminRole,
  AdminUser,
  AdminUserImportResult,
  ImportAdminUserRow,
  PermissionDto,
  RolePermissionGrantDto,
  RolePermissionMatrix,
  SaveAdminProfile,
  SaveAdminRole,
  RoleDeletionResult,
  AdminProfileImportResult,
} from '../types';
import { apiRequest, csrfRequest } from './apiClient';

function queryString(values: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

export const adminApi = {
  users: (search: string, isActive: boolean | null, page: number, pageSize = 20) =>
    apiRequest<AdminPage<AdminUser>>(
      `/api/admin/users?${queryString({ search, isActive, page, pageSize })}`,
    ),
  createUser: (email: string, displayName: string) =>
    csrfRequest<AdminUser>('/api/admin/users', 'POST', { email, displayName }),
  importUsers: (users: ImportAdminUserRow[]) =>
    csrfRequest<AdminUserImportResult>('/api/admin/users/import', 'POST', { users }),
  /** Cấp hồ sơ Giảng viên cho mọi tài khoản chưa có hồ sơ nào. */
  bulkCreateLecturerProfiles: () =>
    csrfRequest<AdminProfileImportResult>('/api/admin/users/profiles/bulk-lecturer', 'POST'),
  importProfiles: (profiles: { rowNumber: number; email: string; roleLabel: string }[]) =>
    csrfRequest<AdminProfileImportResult>('/api/admin/users/profiles/import', 'POST', { profiles }),
  setUserStatus: (userId: string, isActive: boolean) =>
    csrfRequest<AdminUser>(`/api/admin/users/${userId}/status`, 'PATCH', { isActive }),
  roles: () => apiRequest<AdminRole[]>('/api/admin/roles'),
  createRole: (role: SaveAdminRole) => csrfRequest<AdminRole>('/api/admin/roles', 'POST', role),
  updateRole: (roleId: string, role: SaveAdminRole) =>
    csrfRequest<AdminRole>(`/api/admin/roles/${roleId}`, 'PUT', role),
  /** Xóa vai trò; mọi hồ sơ đang mang vai trò đó bị vô hiệu hóa. */
  deleteRole: (roleId: string) =>
    csrfRequest<RoleDeletionResult>(`/api/admin/roles/${roleId}`, 'DELETE'),
  createProfile: (userId: string, profile: SaveAdminProfile) =>
    csrfRequest<AdminProfile>(`/api/admin/users/${userId}/profiles`, 'POST', profile),
  updateProfile: (userId: string, profileId: string, profile: SaveAdminProfile) =>
    csrfRequest<AdminProfile>(
      `/api/admin/users/${userId}/profiles/${profileId}`,
      'PUT',
      profile,
    ),
  setProfileStatus: (userId: string, profileId: string, isActive: boolean) =>
    csrfRequest<AdminProfile>(
      `/api/admin/users/${userId}/profiles/${profileId}/status`,
      'PATCH',
      { isActive },
    ),
  auditLogs: (page: number, userId?: string, pageSize = 30) =>
    apiRequest<AdminPage<AdminAuditLog>>(
      `/api/admin/audit-logs?${queryString({ userId, page, pageSize })}`,
    ),
  permissions: () => apiRequest<PermissionDto[]>('/api/admin/permissions'),
  rolePermissions: () => apiRequest<RolePermissionMatrix[]>('/api/admin/role-permissions'),
  rolePermissionsByRoleId: (roleId: string) =>
    apiRequest<RolePermissionMatrix>(`/api/admin/roles/${roleId}/permissions`),
  updateRolePermissions: (roleId: string, grants: RolePermissionGrantDto[]) =>
    csrfRequest<void>(`/api/admin/roles/${roleId}/permissions`, 'PUT', { grants }),
};
