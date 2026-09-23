import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onSubmit?: () => void;
  submitText?: string;
  size?: 'workspace' | 'compact' | 'import' | 'data-preview' | 'designer' | 'note';
}

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  recordName: string;
  confirmText?: string;
  /** Cảnh báo thêm, ví dụ các bản ghi bị xóa lây theo ON DELETE CASCADE. */
  warning?: React.ReactNode;
  /**
   * Câu mô tả việc sắp làm. Bỏ trống thì dùng câu xoá mặc định. Truyền vào khi
   * hộp thoại dùng cho việc khác, ví dụ xác nhận nộp bài.
   */
  message?: React.ReactNode;
  /** 'danger' cho việc xoá, 'primary' cho các việc không phá dữ liệu. */
  confirmVariant?: 'danger' | 'primary';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  onSubmit,
  submitText = 'Lưu thay đổi',
  size = 'workspace',
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    );
    window.requestAnimationFrame(() => (focusable ?? dialog)?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;
      const elements = Array.from(dialog.querySelectorAll<HTMLElement>(
        'input, select, textarea, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ));
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
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
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop catalog-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal-card catalog-modal-card catalog-modal-card--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="modal-header catalog-modal-header">
          <h3 id={titleId}>{title}</h3>
          <button
            type="button"
            className="modal-close-btn catalog-modal-close"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            title="Đóng"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="modal-body catalog-modal-body">{children}</div>

        {onSubmit && (
          <footer className="modal-footer catalog-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Hủy
            </button>
            <button type="button" className="btn btn-primary" onClick={onSubmit}>
              {submitText}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  recordName,
  confirmText = 'Xóa',
  warning,
  message,
  confirmVariant = 'danger',
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} size="compact">
    <div className="catalog-confirm">
      <AlertTriangle aria-hidden="true" size={20} />
      <div>
        <p>
          {message ?? (
            <>
              Bạn sắp xóa <strong>{recordName}</strong>. Thao tác này không thể hoàn tác.
            </>
          )}
        </p>
        {warning && <p className="catalog-confirm__warning">{warning}</p>}
      </div>
    </div>
    <div className="modal-footer catalog-form-actions">
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        Hủy
      </button>
      <button
        type="button"
        className={confirmVariant === 'danger' ? 'btn catalog-danger-button' : 'btn btn-primary'}
        onClick={onConfirm}
      >
        {confirmText}
      </button>
    </div>
  </Modal>
);
