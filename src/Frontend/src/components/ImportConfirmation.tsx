import { useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { ModalStepContext } from './modalStepContext';
import '../styles/import-confirmation.css';

interface ImportConfirmationProps<T extends { rowNumber: number }> {
  rows: readonly T[];
  columns: readonly { key: keyof T; label: string }[];
  fileName: string;
  sheetName?: string;
  destination: string;
  description?: ReactNode;
  disabled: boolean;
  onConfirm: () => Promise<void>;
  onPrepare?: () => Promise<boolean>;
  reviewSummary?: ReactNode;
  rowStatus?: (row: T) => ReactNode;
  rowFilters?: readonly { key: string; label: string; matches: (row: T) => boolean }[];
  confirmDisabled?: boolean;
  confirmText?: string;
}

const pageSize = 25;

/** Reviewing a file never calls the write API. Only the final confirmation does. */
export function ImportConfirmation<T extends { rowNumber: number }>({
  rows, columns, fileName, sheetName, destination, description, disabled, onConfirm,
  onPrepare, reviewSummary, rowStatus, rowFilters, confirmDisabled = false, confirmText,
}: ImportConfirmationProps<T>) {
  const titleId = useId();
  const modalStep = useContext(ModalStepContext);
  const headingRef = useRef<HTMLElement>(null);
  const [review, setReview] = useState<{
    rows: readonly T[]; fileName: string; sheetName?: string; destination: string;
  } | null>(null);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [filterKey, setFilterKey] = useState('all');
  const preparingRef = useRef(false);
  const submitting = useRef(false);
  const reviewing = review?.rows === rows && review.fileName === fileName
    && review.sheetName === sheetName && review.destination === destination;
  const busy = disabled || saving || preparing;
  const rowFilter = rowFilters?.find(filter => filter.key === filterKey);
  const filteredRows = rowFilter ? rows.filter(rowFilter.matches) : rows;
  const pageCount = Math.ceil(filteredRows.length / pageSize);

  const prepare = async () => {
    if (busy || preparingRef.current || rows.length === 0) return;
    preparingRef.current = true;
    setPreparing(true);
    try {
      if (onPrepare && !await onPrepare()) return;
      setPage(0);
      setFilterKey('all');
      setReview({ rows, fileName, sheetName, destination });
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  };

  useLayoutEffect(() => {
    if (!reviewing || !modalStep?.target) return;
    modalStep.setActive(true);
    const frame = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      modalStep.setActive(false);
    };
  }, [reviewing, modalStep]);

  const confirm = async () => {
    if (!reviewing || busy || confirmDisabled || submitting.current || rows.length === 0) return;
    submitting.current = true;
    setSaving(true);
    try {
      await onConfirm();
      // Parent handlers show the saved result or request errors in the first screen.
      setReview(null);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  if (!reviewing) {
    return (
      <button type="button" className="btn btn-primary" disabled={busy || rows.length === 0}
        onClick={() => void prepare()}>
        {preparing && <LoaderCircle className="auth-spin" aria-hidden="true" />}
        {preparing ? 'Đang kiểm tra dữ liệu...' : onPrepare ? 'Kiểm tra dữ liệu trước khi lưu' : 'Tiếp tục: xác nhận dữ liệu'}
      </button>
    );
  }

  const confirmation = (
    <section className={`import-confirmation admin-import-preview${columns.length > 6 ? ' import-confirmation--wide' : ''}`} aria-labelledby={titleId} aria-busy={saving}>
      <header>
        <strong id={titleId} ref={headingRef} tabIndex={-1}>Xác nhận dữ liệu trước khi lưu</strong>
        <span>Bước 2 / 2 · {rows.length.toLocaleString('vi-VN')} dòng</span>
      </header>
      <dl className="import-confirmation-details">
        <div><dt>Tệp</dt><dd>{fileName}</dd></div>
        {sheetName && <div><dt>Sheet</dt><dd>{sheetName}</dd></div>}
        <div><dt>Nơi lưu</dt><dd>{destination}</dd></div>
      </dl>
      {reviewSummary && <div className="import-confirmation-summary">{reviewSummary}</div>}
      <details className="import-confirmation-notes">
        <summary>Lưu ý khi lưu dữ liệu</summary>
        {description && <div className="import-confirmation-description">{description}</div>}
        <p>{onPrepare
          ? 'Dữ liệu đã được đối chiếu với danh mục. Chỉ các dòng hợp lệ trong kết quả kiểm tra mới được lưu sau khi bạn xác nhận.'
          : 'Kiểm tra danh sách trước khi xác nhận. Hệ thống sẽ kiểm tra dữ liệu khi lưu và báo các dòng bị từ chối.'}</p>
      </details>
      {rowFilters && (
        <div className="import-confirmation-filters" role="group" aria-label="Lọc kết quả kiểm tra">
          {rowFilters.map(filter => (
            <button key={filter.key} type="button" className="btn btn-secondary btn-sm"
              aria-pressed={filterKey === filter.key} disabled={busy}
              onClick={() => { setFilterKey(filter.key); setPage(0); }}>{filter.label}</button>
          ))}
        </div>
      )}
      <div className="admin-import-table-scroll">
        <table>
          <caption className="import-confirmation-caption">{onPrepare ? 'Kết quả kiểm tra' : 'Dữ liệu gửi lưu'} · dòng {filteredRows.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, filteredRows.length)} / {filteredRows.length}</caption>
          <thead><tr><th>Dòng</th>{rowStatus && <th>Kết quả kiểm tra</th>}{columns.map(column => <th key={String(column.key)}>{column.label}</th>)}</tr></thead>
          <tbody>
            {filteredRows.slice(page * pageSize, (page + 1) * pageSize).map(row => (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                {rowStatus && <td className="import-confirmation-row-status">{rowStatus(row)}</td>}
                {columns.map(column => <td key={String(column.key)}>{String(row[column.key] ?? '') || '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="import-confirmation-actions import-confirmation-footer">
        {pageCount > 1 && (
          <nav className="import-confirmation-actions" aria-label="Phân trang dữ liệu xác nhận">
            <button type="button" className="btn btn-secondary" disabled={saving || page === 0} onClick={() => setPage(value => value - 1)}>Trang trước</button>
            <span>Trang {page + 1} / {pageCount}</span>
            <button type="button" className="btn btn-secondary" disabled={saving || page + 1 >= pageCount} onClick={() => setPage(value => value + 1)}>Trang sau</button>
          </nav>
        )}
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setReview(null)}>Quay lại kiểm tra</button>
        <button type="button" className="btn btn-primary" disabled={busy || confirmDisabled} onClick={() => void confirm()}>
          {saving ? <LoaderCircle className="auth-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          {saving ? 'Đang lưu...' : confirmText ?? `Xác nhận và lưu ${rows.length.toLocaleString('vi-VN')} dòng`}
        </button>
      </div>
    </section>
  );
  return modalStep?.target ? createPortal(confirmation, modalStep.target) : confirmation;
}
