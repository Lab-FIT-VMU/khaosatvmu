import { useEffect, useState } from 'react';
import { LoaderCircle, Save } from 'lucide-react';
import { Modal } from './Modal';
import { ROLE_DATA_SCOPE_LABELS, type RoleDataScope } from '../auth/roles';
import type { AdminRole, SaveAdminRole } from '../types';

interface RoleFormDialogProps {
  isOpen: boolean;
  /** Null là thêm vai trò mới. */
  role: AdminRole | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (value: SaveAdminRole) => void;
}

const SCOPE_HINTS: Readonly<Record<RoleDataScope, string>> = {
  ALL: 'Thấy dữ liệu của cả trường.',
  FACULTY: 'Thấy mọi bộ môn thuộc khoa của giảng viên gắn với tài khoản.',
  DEPARTMENT: 'Thấy bộ môn của giảng viên gắn với tài khoản.',
  OWN: 'Chỉ thấy các lớp chính mình dạy. Phạm vi này luôn chỉ xem.',
};

const emptyRole: SaveAdminRole = {
  name: '',
  description: null,
  dataScope: 'DEPARTMENT',
  canWrite: false,
  profileCodeSuffix: '',
};

/** Thêm hoặc sửa vai trò: tên, mô tả, phạm vi dữ liệu, quyền ghi và hậu tố mã hồ sơ. */
export function RoleFormDialog({ isOpen, role, saving, error, onClose, onSubmit }: RoleFormDialogProps) {
  const [form, setForm] = useState<SaveAdminRole>(emptyRole);

  useEffect(() => {
    if (!isOpen) return;
    setForm(role
      ? {
          name: role.name,
          description: role.description,
          dataScope: role.dataScope,
          canWrite: role.canWrite,
          profileCodeSuffix: role.profileCodeSuffix,
        }
      : emptyRole);
  }, [isOpen, role]);

  // ADMIN luôn thấy và ghi toàn trường, không thì không ai còn vào được trang này.
  const scopeLocked = role?.code === 'ADMIN';
  const ownScope = form.dataScope === 'OWN';

  return (
    <Modal isOpen={isOpen} onClose={() => !saving && onClose()} title={role ? 'Sửa vai trò' : 'Thêm vai trò'}>
      <form
        className="catalog-form role-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            ...form,
            name: form.name.trim(),
            description: form.description?.trim() || null,
            profileCodeSuffix: form.profileCodeSuffix.trim().toUpperCase(),
            canWrite: ownScope ? false : form.canWrite,
          });
        }}
      >
        {error && <div className="catalog-validation-error" role="alert">{error}</div>}

        <div className="role-form__row">
          <div className="form-group">
            <label htmlFor="role-name">Tên vai trò</label>
            <input
              id="role-name"
              type="text"
              maxLength={200}
              placeholder="VD: Thanh tra khoa"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="role-suffix">Hậu tố mã hồ sơ</label>
            <input
              id="role-suffix"
              type="text"
              maxLength={4}
              placeholder="VD: TK"
              value={form.profileCodeSuffix}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, profileCodeSuffix: event.target.value.toUpperCase() }))}
              pattern="[A-Za-z0-9]{2,4}"
              title="2–4 chữ cái hoặc chữ số"
              required
            />
            <small>Mã hồ sơ mới của vai trò này có dạng 000123{form.profileCodeSuffix || 'XX'}.</small>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="role-description">Mô tả</label>
          <input
            id="role-description"
            type="text"
            maxLength={1000}
            value={form.description ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </div>

        <fieldset className="role-form__scope" disabled={scopeLocked}>
          <legend>Phạm vi dữ liệu</legend>
          {(Object.keys(ROLE_DATA_SCOPE_LABELS) as RoleDataScope[]).map((scope) => (
            <label key={scope} className="role-form__option">
              <input
                type="radio"
                name="role-scope"
                value={scope}
                checked={form.dataScope === scope}
                onChange={() => setForm((prev) => ({
                  ...prev,
                  dataScope: scope,
                  canWrite: scope === 'OWN' ? false : prev.canWrite,
                }))}
              />
              <span>
                <strong>{ROLE_DATA_SCOPE_LABELS[scope]}</strong>
                <small>{SCOPE_HINTS[scope]}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="role-form__scope" disabled={scopeLocked || ownScope}>
          <legend>Quyền ghi</legend>
          <label className="role-form__option">
            <input
              type="radio"
              name="role-write"
              checked={form.canWrite && !ownScope}
              onChange={() => setForm((prev) => ({ ...prev, canWrite: true }))}
            />
            <span>
              <strong>Được ghi</strong>
              <small>Được thêm, sửa dữ liệu trong phạm vi trên (giới hạn tiếp theo quyền module).</small>
            </span>
          </label>
          <label className="role-form__option">
            <input
              type="radio"
              name="role-write"
              checked={!form.canWrite || ownScope}
              onChange={() => setForm((prev) => ({ ...prev, canWrite: false }))}
            />
            <span>
              <strong>Chỉ xem</strong>
              <small>Mọi thao tác ghi đều bị chặn.</small>
            </span>
          </label>
        </fieldset>
        {scopeLocked && (
          <p className="role-form__note">Quản trị hệ thống luôn thấy và ghi toàn trường, không đổi được.</p>
        )}
        {role && role.activeProfileCount > 0 && (
          <p className="role-form__note">
            {role.activeProfileCount} hồ sơ đang dùng vai trò này. Đổi phạm vi hoặc quyền ghi có hiệu lực
            ngay với tất cả các hồ sơ đó.
          </p>
        )}

        <div className="modal-footer catalog-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <LoaderCircle className="auth-spin" size={16} /> : <Save size={16} />}
            {role ? 'Lưu vai trò' : 'Thêm vai trò'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
