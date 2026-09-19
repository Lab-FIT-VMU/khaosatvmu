import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, RefreshCw, Save, Search, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { roleDisplayName } from '../auth/roles';
import { Modal } from './Modal';
import { adminApi } from '../services/adminApi';
import type { AdminRole, RolePermissionMatrix } from '../types';
import '../styles/auth-admin.css';

interface RolePermissionEditorProps {
  roles: AdminRole[];
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể tải danh sách quyền';
}

export function RolePermissionEditor({ roles }: RolePermissionEditorProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(roles[0]?.id ?? null);
  const [roleDataById, setRoleDataById] = useState<Record<string, RolePermissionMatrix>>({});
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
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
      setDirtyMap({});
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

  const isDirty = Object.keys(dirtyMap).length > 0;

  const handleToggle = (permissionId: string) => {
    if (!roleData || !selectedRoleId) return;
    setRoleDataById((current) => ({
      ...current,
      [selectedRoleId]: {
        ...roleData,
        permissions: roleData.permissions.map((p) =>
          p.permissionId === permissionId ? { ...p, isGranted: !p.isGranted } : p,
        ),
      },
    }));
    setDirtyMap((prev) => {
      const next = { ...prev };
      if (next[permissionId]) delete next[permissionId];
      else next[permissionId] = true;
      return next;
    });
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
      setDirtyMap({});
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
    setDirtyMap({});
    setSaveError(null);
    setPendingRoleId(null);
    setSelectedRoleId(nextRoleId);
  };

  const groupedPermissions = useMemo(() => {
    if (!roleData) return [];
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? roleData.permissions.filter(
          (p) =>
            p.permissionName.toLowerCase().includes(query) ||
            p.permissionCode.toLowerCase().includes(query),
        )
      : roleData.permissions;

    const groups: { category: string; items: typeof filtered }[] = [];
    for (const perm of filtered) {
      const group = groups.find((g) => g.category === perm.category);
      if (group) group.items.push(perm);
      else groups.push({ category: perm.category, items: [perm] });
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
              {group.items.map((perm) => {
                const inputId = `perm-toggle-${perm.permissionId}`;
                return (
                  <li key={perm.permissionId} className="perm-row">
                    <div className="perm-row__name">{perm.permissionName}</div>
                    <span className="perm-toggle">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={perm.isGranted}
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
