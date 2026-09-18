import { useEffect, useId, useRef } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  LoaderCircle,
  ShieldCheck,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { authMessage } from '../auth/authMessages';
import { roleDisplayName } from '../auth/roles';
import type { AuthProfile } from '../types';
import '../styles/auth-admin.css';

interface ProfileSelectionDialogProps {
  profiles: AuthProfile[];
  loading?: boolean;
  selectedId: string | null;
  errorCode?: string | null;
  currentProfileId?: string;
  dismissible?: boolean;
  title: string;
  description: string;
  onSelect: (profileId: string) => void;
  onClose?: () => void;
}

export function ProfileSelectionDialog({
  profiles,
  loading = false,
  selectedId,
  errorCode,
  currentProfileId,
  dismissible = false,
  title,
  description,
  onSelect,
  onClose,
}: ProfileSelectionDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    const firstProfile = dialog?.querySelector<HTMLButtonElement>('.profile-session-option:not(:disabled)');
    window.requestAnimationFrame(() => (firstProfile ?? dialog)?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible && onClose) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (dismissible) previousFocusRef.current?.focus();
    };
  }, [dismissible, onClose]);

  return (
    <div
      className="profile-session-backdrop"
      onMouseDown={(event) => {
        if (dismissible && onClose && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="profile-session-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-description`}
        tabIndex={-1}
      >
        <header className="profile-session-dialog__header">
          <div className="profile-session-dialog__heading">
            <span className="profile-session-dialog__mark" aria-hidden="true">
              <UserRoundCheck />
            </span>
            <div>
              <span className="profile-session-dialog__eyebrow">PHIÊN LÀM VIỆC</span>
              <h1 id={titleId}>{title}</h1>
              <p id={`${titleId}-description`}>{description}</p>
            </div>
          </div>
          {dismissible && onClose && (
            <button
              type="button"
              className="profile-session-dialog__close"
              onClick={onClose}
              aria-label="Đóng hộp thoại"
              title="Đóng"
            >
              <X aria-hidden="true" />
            </button>
          )}
        </header>

        <div className="profile-session-dialog__body">
          {errorCode && (
            <div className="auth-alert" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>
                {authMessage(errorCode)}{' '}
                {!dismissible && <a href="/login">Đăng nhập lại</a>}
              </span>
            </div>
          )}

          {loading ? (
            <div className="profile-session-state" role="status">
              <LoaderCircle className="auth-spin" aria-hidden="true" />
              <div>
                <strong>Đang tải hồ sơ</strong>
                <span>Vui lòng chờ trong giây lát.</span>
              </div>
            </div>
          ) : profiles.length > 0 ? (
            <div className="profile-session-list" aria-label="Danh sách phiên làm việc">
              {profiles.map((profile) => {
                const isCurrent = profile.id === currentProfileId;
                const isSelecting = profile.id === selectedId;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    className={`profile-session-option${isCurrent ? ' is-current' : ''}`}
                    onClick={() => onSelect(profile.id)}
                    disabled={selectedId !== null || isCurrent}
                    aria-current={isCurrent ? 'true' : undefined}
                  >
                    <span className="profile-session-option__icon" aria-hidden="true">
                      <ShieldCheck />
                    </span>
                    <span className="profile-session-option__content">
                      <span className="profile-session-option__title">
                        <strong>{profile.name}</strong>
                        {isCurrent && <span className="profile-session-option__tag current">Đang sử dụng</span>}
                        {!isCurrent && profile.isDefault && (
                          <span className="profile-session-option__tag">Mặc định</span>
                        )}
                      </span>
                      <span className="profile-session-option__role">
                        {roleDisplayName(profile.roleCode)}
                      </span>
                      <span className="profile-session-option__scope">
                        <Building2 aria-hidden="true" />
                        {profile.organizationUnitName ?? 'Phạm vi toàn hệ thống'}
                      </span>
                    </span>
                    <span className="profile-session-option__action" aria-hidden="true">
                      {isSelecting ? <LoaderCircle className="auth-spin" /> : isCurrent ? <Check /> : <ArrowRight />}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : !errorCode && (
            <div className="profile-session-state">
              <CircleAlert aria-hidden="true" />
              <div>
                <strong>Chưa có hồ sơ khả dụng</strong>
                <span>Liên hệ quản trị viên để được cấp hồ sơ làm việc.</span>
              </div>
            </div>
          )}
        </div>

        <footer className="profile-session-dialog__footer">
          <ShieldCheck aria-hidden="true" />
          Quyền truy cập được giới hạn theo phiên làm việc đã chọn
        </footer>
      </div>
    </div>
  );
}
