import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, RefreshCw, Save, Search, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { roleDisplayName } from '../auth/roles';
import { Modal } from './Modal';
import { adminApi } from '../services/adminApi';
import { ApiError } from '../services/apiClient';
import type { AdminRole, RolePermissionMatrix } from '../types';
import '../styles/auth-admin.css';

interface RolePermissionEditorProps {
  roles: AdminRole[];
}

function messageFromError(error: unknown): string {
  if (error instanceof ApiError && error.errorCode === 'ADMIN_CANNOT_REVOKE_REQUIRED_PERMISSION') {
    return 'Quyền Người dùng & phân quyền và tab Phân quyền Module là bắt buộc đối với Quản trị hệ thống, không thể tắt.';
  }
  return error instanceof Error ? error.message : 'Không thể tải danh sách quyền';
}

/** Tắt đi thì Quản trị hệ thống mất màn hình duy nhất cấp lại quyền. */
const ADMIN_REQUIRED_PERMISSIONS = new Set(['USER_ADMIN_ACCESS', 'USER_ADMIN_TAB_PERMISSIONS']);

const isRequiredPermission = (roleCode: string | undefined, permissionCode: string | undefined) =>
  roleCode === 'ADMIN' && permissionCode !== undefined && ADMIN_REQUIRED_PERMISSIONS.has(permissionCode);

type PermissionItem = RolePermissionMatrix['permissions'][number];

/** Mọi tab con, cháu của một quyền. */
function descendantsOf(permissions: PermissionItem[], code: string): PermissionItem[] {
  const children = permissions.filter((item) => item.parentCode === code);
  return children.flatMap((child) => [child, ...descendantsOf(permissions, child.permissionCode)]);
}

/** Các quyền cha, ông của một quyền, từ gần đến xa. */
function ancestorsOf(permissions: PermissionItem[], item: PermissionItem): PermissionItem[] {
  const result: PermissionItem[] = [];
  let parentCode = item.parentCode;
  while (parentCode) {
    const parent = permissions.find((candidate) => candidate.permissionCode === parentCode);
    if (!parent) break;
    result.push(parent);
    parentCode = parent.parentCode;
  }
  return result;
}

export function RolePermissionEditor({ roles }: RolePermissionEditorProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(roles[0]?.id ?? null);
  const [roleDataById, setRoleDataById] = useState<Record<string, RolePermissionMatrix>>({});
  const [loadingRole, setLoadingRole] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const requestIdRef = useRef(0);
  const savedRoleDataByIdRef = useRef<Record<string, RolePermissionMatrix>>({});
  const roleData = selectedRoleId ? roleDataById[selectedRoleId] ?? null : null;

  const fetchRolePermissions = useCallback(async () => {
    const currentReqId = ++requestIdRef.current;
    setLoadingRole(true);
    setFetchError(null);
    try {
      const matrices = await adminApi.rolePermissions();
      if (currentReqId !== requestIdRef.current) return;
      const nextRoleDataById = Object.fromEntries(
        matrices.map((matrix) => [matrix.roleId, matrix]),
      );
      savedRoleDataByIdRef.current = nextRoleDataById;
      setRoleDataById(nextRoleDataById);
    } catch (err: unknown) {
      if (currentReqId !== requestIdRef.current) return;
      setFetchError(messageFromError(err));
    } finally {
      if (currentReqId === requestIdRef.current) setLoadingRole(false);
    }
  }, []);

  useEffect(() => {
    if (roles[0] && (!selectedRoleId || !roles.some((role) => role.id === selectedRoleId))) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  useEffect(() => {
    void fetchRolePermissions();
    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchRolePermissions]);

  // Bật một quyền rồi tắt lại là trở về như cũ, nên so với bản đã lưu thay vì đếm
  // số lần bấm — nhất là khi bật module còn tự bật kèm các tab của nó.
  // Tính lại mỗi lần vẽ: bản đã lưu nằm trong ref nên useMemo không biết khi nào nó đổi.
  const savedRoleData = roleData ? savedRoleDataByIdRef.current[roleData.roleId] : undefined;
  const savedGrantById = new Map(savedRoleData?.permissions.map((p) => [p.permissionId, p.isGranted]));
  const isDirty = Boolean(
    roleData && savedRoleData
      && roleData.permissions.some((p) => savedGrantById.get(p.permissionId) !== p.isGranted),
  );

  const handleToggle = (permissionId: string) => {
    if (!roleData || !selectedRoleId) return;
    const permission = roleData.permissions.find((item) => item.permissionId === permissionId);
    if (!permission) return;
    if (isRequiredPermission(roleData.roleCode, permission.permissionCode)) {
      toast.warning('Không thể tắt quyền bắt buộc', {
        description: 'Quản trị hệ thống luôn phải có quyền Người dùng & phân quyền và tab Phân quyền Module.',
      });
      return;
    }

    const turningOn = !permission.isGranted;
    const descendants = descendantsOf(roleData.permissions, permission.permissionCode);
    // Vừa mở module mà chưa tab nào bật thì trang mở ra trống trơn. Bật kèm mọi tab;
    // đã có tab nào đang bật tức là người quản trị từng chọn riêng, giữ nguyên lựa chọn đó.
    const enableDescendants = turningOn
      && descendants.length > 0
      && descendants.every((item) => !item.isGranted);
    const descendantIds = new Set(descendants.map((item) => item.permissionId));

    setRoleDataById((current) => ({
      ...current,
      [selectedRoleId]: {
        ...roleData,
        permissions: roleData.permissions.map((p) => {
          if (p.permissionId === permissionId) return { ...p, isGranted: turningOn };
          if (enableDescendants && descendantIds.has(p.permissionId)) return { ...p, isGranted: true };
          return p;
        }),
      },
    }));
  };

  const persistCurrentRole = async (): Promise<boolean> => {
    if (!roleData) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const grants = roleData.permissions.map((p) => ({
        permissionId: p.permissionId,
        isGranted: p.isGranted,
      }));
      await adminApi.updateRolePermissions(roleData.roleId, grants);
      savedRoleDataByIdRef.current = {
        ...savedRoleDataByIdRef.current,
        [roleData.roleId]: roleData,
      };
      toast.success('Đã cập nhật phân quyền', { description: `Vai trò: ${roleDisplayName(roleData.roleCode, roleData.roleName)}` });
      return true;
    } catch (err: unknown) {
      setSaveError(messageFromError(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const selectRole = (roleId: string) => {
    if (roleId === selectedRoleId) return;
    if (isDirty) {
      setPendingRoleId(roleId);
      return;
    }
    setSelectedRoleId(roleId);
  };

  const handleSaveAndSwitch = async () => {
    const ok = await persistCurrentRole();
    if (ok && pendingRoleId) {
      const nextRoleId = pendingRoleId;
      setPendingRoleId(null);
      setSelectedRoleId(nextRoleId);
    }
  };

  const handleDiscardAndSwitch = () => {
    if (!pendingRoleId) return;
    const nextRoleId = pendingRoleId;
    if (selectedRoleId) {
      const savedRoleData = savedRoleDataByIdRef.current[selectedRoleId];
      if (savedRoleData) {
        setRoleDataById((current) => ({
          ...current,
          [selectedRoleId]: savedRoleData,
        }));
      }
    }
    setSaveError(null);
    setPendingRoleId(null);
    setSelectedRoleId(nextRoleId);
  };

  const groupedPermissions = useMemo(() => {
    if (!roleData) return [];
    const query = searchQuery.trim().toLowerCase();
    const permissions = roleData.permissions;
    // Tìm ra một tab thì hiện kèm module cha của nó: nhiều module có tab trùng tên
    // ("Học phần"), đứng một mình không biết là tab của trang nào.
    const visibleIds = new Set<string>();
    for (const p of permissions) {
      const matches = !query
        || p.permissionName.toLowerCase().includes(query)
        || p.permissionCode.toLowerCase().includes(query);
      if (!matches) continue;
      visibleIds.add(p.permissionId);
      for (const ancestor of ancestorsOf(permissions, p)) visibleIds.add(ancestor.permissionId);
    }

    // Backend trả sẵn theo thứ tự cây: module, rồi các tab của nó ngay bên dưới.
    const groups: { category: string; items: { perm: PermissionItem; depth: number; parentOff: boolean }[] }[] = [];
    for (const perm of permissions) {
      if (!visibleIds.has(perm.permissionId)) continue;
      const ancestors = ancestorsOf(permissions, perm);
      const item = {
        perm,
        depth: ancestors.length,
        parentOff: ancestors.some((ancestor) => !ancestor.isGranted),
      };
      const group = groups.find((g) => g.category === perm.category);
      if (group) group.items.push(item);
      else groups.push({ category: perm.category, items: [item] });
    }
    return groups;
  }, [roleData, searchQuery]);

  return (
    <div className="perm-editor">
      <div className="perm-sidebar">
        <label className="perm-sidebar-select-label" htmlFor="perm-role-select">
          Chọn vai trò
        </label>
        <select
          id="perm-role-select"
          className="perm-role-select"
          value={selectedRoleId ?? ''}
          onChange={(event) => selectRole(event.target.value)}
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {roleDisplayName(role.code, role.name)}
            </option>
          ))}
        </select>
        <ul className="perm-role-list" role="listbox" aria-label="Danh sách vai trò">
          {roles.map((role) => (
            <li key={role.id}>
              <button
                type="button"
                className={`perm-role-item${role.id === selectedRoleId ? ' perm-role-item--active' : ''}`}
                onClick={() => selectRole(role.id)}
                role="option"
                aria-selected={role.id === selectedRoleId}
              >
                <div className="perm-role-item__name">{roleDisplayName(role.code, role.name)}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="perm-content">
        <div className="perm-content__toolbar">
          <div className="perm-search">
            <Search aria-hidden="true" size={16} />
            <input
              type="text"
              placeholder="Tìm quyền theo tên hoặc mã..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isDirty || saving || !roleData}
            onClick={() => void persistCurrentRole()}
          >
            {saving ? (
              <RefreshCw className="auth-spin" size={14} />
            ) : (
              <Save size={14} />
            )}
            Lưu thay đổi
          </button>
        </div>

        {saveError && (
          <div className="perm-inline-error">
            <AlertCircle aria-hidden="true" size={16} />
            <span>{saveError}</span>
            <button type="button" className="btn btn-secondary" onClick={() => void persistCurrentRole()}>
              Thử lại
            </button>
          </div>
        )}

        {loadingRole && !roleData && (
          <div className="perm-skeleton" aria-hidden="true">
            <div className="perm-skeleton-row" />
            <div className="perm-skeleton-row" />
            <div className="perm-skeleton-row" />
          </div>
        )}

        {!loadingRole && fetchError && !roleData && (
          <div className="perm-inline-error">
            <AlertCircle aria-hidden="true" size={16} />
            <span>{fetchError}</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void fetchRolePermissions()}
            >
              Thử lại
            </button>
          </div>
        )}

        {!fetchError && roleData && groupedPermissions.length === 0 && (
          <p className="perm-empty">Không tìm thấy quyền phù hợp.</p>
        )}

        {!fetchError && groupedPermissions.map((group) => (
          <div key={group.category} className="perm-group">
            <h4 className="perm-group__title">{group.category}</h4>
            <ul className="perm-group__list">
              {group.items.map(({ perm, depth, parentOff }) => {
                const inputId = `perm-toggle-${perm.permissionId}`;
                const isRequired = isRequiredPermission(roleData?.roleCode, perm.permissionCode);
                const rowClass = [
                  'perm-row',
                  depth > 0 ? 'perm-row--child' : '',
                  parentOff ? 'perm-row--inactive' : '',
                ].filter(Boolean).join(' ');
                return (
                  <li
                    key={perm.permissionId}
                    className={rowClass}
                    // Mỗi cấp tab thụt thêm một nấc để thấy tab nào thuộc module nào.
                    style={depth > 0 ? { paddingLeft: 12 + depth * 28 } : undefined}
                  >
                    <div className="perm-row__name">
                      {perm.permissionName}{isRequired ? ' (Bắt buộc)' : ''}
                      {depth > 0 && <small>Tab</small>}
                    </div>
                    <span className="perm-toggle">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={perm.isGranted}
                        // Module cha đang tắt thì tab không có tác dụng gì: khoá lại
                        // cho khỏi tưởng bật tab là mở được trang.
                        disabled={parentOff}
                        aria-disabled={isRequired || parentOff}
                        title={isRequired
                          ? 'Quản trị hệ thống luôn phải có quyền này.'
                          : parentOff
                            ? 'Bật quyền của mục cha trước.'
                            : undefined}
                        onChange={() => handleToggle(perm.permissionId)}
                      />
                      <label htmlFor={inputId} aria-label={perm.permissionName}>
                        <span className="perm-toggle-track" />
                      </label>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <Modal
        isOpen={pendingRoleId !== null}
        onClose={() => setPendingRoleId(null)}
        title="Có thay đổi chưa lưu"
      >
        <div className="catalog-confirm">
          <ShieldAlert aria-hidden="true" size={20} />
          <p>Bạn có thay đổi phân quyền chưa lưu cho vai trò hiện tại. Bạn muốn làm gì?</p>
        </div>
        <div className="modal-footer catalog-form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setPendingRoleId(null)}>
            Hủy
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleDiscardAndSwitch}>
            Bỏ qua thay đổi
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void handleSaveAndSwitch()}>
            {saving ? 'Đang lưu...' : 'Lưu & chuyển'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
