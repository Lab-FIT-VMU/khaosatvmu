import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import { Modal } from '../Modal';
import { ApiError } from '../../services/apiClient';
import { graduationAnalytics2Api } from '../../services/graduationAnalytics2Api';
import type {
  GraduationImportCommitResultV3,
  GraduationImportPreviewV3,
  GraduationManagedPeriod,
} from '../../types/graduationAnalytics2';

export interface GraduationImportTarget {
  academicYearStart: number;
  roundNumber: number;
  period?: GraduationManagedPeriod | null;
}

interface GraduationImportDialogProps {
  isOpen: boolean;
  target: GraduationImportTarget | null;
  onClose: () => void;
  onCommitted: (result: GraduationImportCommitResultV3) => void | Promise<void>;
}

interface ImportRowError {
  rowNumber: number;
  reason: string;
  values: string[];
}

/** Máy chủ trả kèm nguyên các dòng hỏng của tệp để dựng bảng đối chiếu. */
const rowErrorsOf = (error: unknown): { columns: string[]; rows: ImportRowError[] } => {
  if (!(error instanceof ApiError)) return { columns: [], rows: [] };
  const rows = Array.isArray(error.body?.rowErrors)
    ? (error.body.rowErrors as ImportRowError[])
    : [];
  const columns = Array.isArray(error.body?.sourceColumns)
    ? (error.body.sourceColumns as string[])
    : [];
  return { columns, rows };
};

const errorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return 'Không thể xử lý file. Vui lòng thử lại.';

  // Máy chủ đã nói rõ hỏng ở dòng nào, cột nào hoặc mã lớp nào. Ưu tiên hiện
  // nguyên câu đó, chỉ khi thiếu mới rơi về câu chung chung.
  const detail = typeof error.body?.message === 'string' ? error.body.message.trim() : '';
  if (detail.length > 0) return detail;

  const messages: Record<string, string> = {
    GRADUATION_IMPORT_INVALID: 'File hoặc metadata import không hợp lệ.',
    GRADUATION_IMPORT_TOO_LARGE: 'File có quá nhiều dòng dữ liệu.',
    GRADUATION_V3_CONCURRENT_REPLACE: 'Đợt đã được người khác cập nhật. Hãy đóng cửa sổ và tải lại.',
    GRADUATION_V3_REPLACE_REASON_REQUIRED: 'Phải nhập lý do khi import lại.',
  };
  return messages[error.errorCode] ?? 'Không thể xử lý file. Vui lòng kiểm tra lại dữ liệu.';
};

const BASE_ACADEMIC_YEAR_START = 2018;
const BASE_COHORT_NUMBER = 59;
const STANDARD_PROGRAM_YEARS = 4;

const isOnTime = (
  cohortCode: string,
  academicYearStart: number,
  month: number | null,
  year: number | null,
) => {
  const digits = (cohortCode ?? '').replace(/\D/g, '');
  if (!digits) return false;
  const cohortYearStart = BASE_ACADEMIC_YEAR_START + (Number(digits) - BASE_COHORT_NUMBER);
  if (month !== null && year !== null) {
    return year * 12 + month <= (cohortYearStart + STANDARD_PROGRAM_YEARS + 1) * 12 + 1;
  }
  return academicYearStart - cohortYearStart === STANDARD_PROGRAM_YEARS - 1;
};

const statusLabel = (
  cohortCode: string,
  academicYearStart: number,
  month: number | null,
  year: number | null,
  isWorkStudy: boolean,
) => `${isOnTime(cohortCode, academicYearStart, month, year) ? 'Đúng hạn' : 'Quá hạn'}${isWorkStudy ? ' · VLVH' : ''}`;

const defaultReview = (academicYearStart: number) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const currentStart = month >= 8 ? year : year - 1;
  return currentStart === academicYearStart
    ? { month, year }
    : { month: 4, year: academicYearStart + 1 };
};

const monthLabel = (month: number) => `Tháng ${String(month).padStart(2, '0')}`;
const reviewMonths = Array.from({ length: 12 }, (_, index) => index + 1);

export function GraduationImportDialog({
  isOpen,
  target,
  onClose,
  onCommitted,
}: GraduationImportDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<GraduationImportPreviewV3 | null>(null);
  const [reviewMonth, setReviewMonth] = useState(4);
  const [reviewYear, setReviewYear] = useState(new Date().getFullYear());
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [academicYearConfirmed, setAcademicYearConfirmed] = useState(false);
  const [replaceReason, setReplaceReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRows, setErrorRows] = useState<{ columns: string[]; rows: ImportRowError[] }>(
    { columns: [], rows: [] });

  const setErrorDetail = (caught: unknown) => {
    setError(errorMessage(caught));
    setErrorRows(rowErrorsOf(caught));
  };

  const needsCohortMajorCatalog = error?.includes('Danh mục đào tạo → Khoá ngành đào tạo') === true;
  const openCohortMajorCatalog = () => {
    onClose();
    window.location.hash = 'cohort-majors';
  };

  useEffect(() => {
    if (!isOpen || !target) return;
    const fallback = defaultReview(target.academicYearStart);
    setReviewMonth(target.period?.reviewMonth ?? fallback.month);
    setReviewYear(target.period?.reviewYear ?? fallback.year);
    setFile(null);
    setPreview(null);
    setConfirmationVisible(false);
    setAcademicYearConfirmed(false);
    setReplaceReason('');
    setError(null);
    setErrorRows({ columns: [], rows: [] });
    if (inputRef.current) inputRef.current.value = '';
  }, [isOpen, target]);

  const close = () => {
    if (busy) return;
    if (confirmationVisible) {
      setConfirmationVisible(false);
      setAcademicYearConfirmed(false);
      return;
    }
    onClose();
  };

  const closeConfirmation = () => {
    if (busy) return;
    setConfirmationVisible(false);
    setAcademicYearConfirmed(false);
    setError(null);
    setErrorRows({ columns: [], rows: [] });
  };

  const chooseFile = async (next?: File) => {
    setFile(next ?? null);
    setPreview(null);
    setConfirmationVisible(false);
    setAcademicYearConfirmed(false);
    setError(null);
    setErrorRows({ columns: [], rows: [] });
    if (!next) return;
    setBusy(true);
    try {
      setPreview(await graduationAnalytics2Api.previewImport(next));
    } catch (caught) {
      setErrorDetail(caught);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!target || !file || !preview) return;
    if (target.period && !replaceReason.trim()) {
      setError('Phải nhập lý do khi import lại một đợt đã có dữ liệu.');
      return;
    }
    if (!academicYearConfirmed) {
      setError(`Bạn cần xác nhận file thuộc năm học ${target.academicYearStart}–${target.academicYearStart + 1}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setErrorRows({ columns: [], rows: [] });
    try {
      const result = await graduationAnalytics2Api.commitImport({
        file,
        academicYearStart: target.academicYearStart,
        roundNumber: target.roundNumber,
        reviewMonth,
        reviewYear,
        previewFileHash: preview.fileHash,
        expectedActiveRevisionId: target.period?.activeRevisionId,
        replaceReason,
      });
      await onCommitted(result);
      onClose();
    } catch (caught) {
      setErrorDetail(caught);
    } finally {
      setBusy(false);
    }
  };

  const requestConfirmation = () => {
    if (!target || !file || !preview) return;
    if (target.period && !replaceReason.trim()) {
      setError('Phải nhập lý do khi import lại một đợt đã có dữ liệu.');
      return;
    }
    setError(null);
    setErrorRows({ columns: [], rows: [] });
    setAcademicYearConfirmed(false);
    setConfirmationVisible(true);
  };

  if (!target) return null;
  const isReplace = Boolean(target.period);
  const reviewYears = [target.academicYearStart, target.academicYearStart + 1];

  const changeReviewYear = (year: number) => {
    setReviewYear(year);
    setConfirmationVisible(false);
    setAcademicYearConfirmed(false);
  };

  const changeReviewMonth = (month: number) => {
    setReviewMonth(month);
    setConfirmationVisible(false);
    setAcademicYearConfirmed(false);
  };

  return <>
    <Modal
      isOpen={isOpen && !confirmationVisible}
      onClose={close}
      title={`${isReplace ? 'Tải lên lại' : 'Tải lên'} đợt ${target.roundNumber} · ${target.academicYearStart}–${target.academicYearStart + 1}`}
      size={preview ? 'data-preview' : 'import'}
    >
      <div className="graduation-import" aria-busy={busy}>
      <div className="graduation-import__metadata">
        <label>Năm xét<select value={reviewYear} onChange={(event) => changeReviewYear(Number(event.target.value))} disabled={busy}>{reviewYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <label>Tháng xét<select value={reviewMonth} onChange={(event) => changeReviewMonth(Number(event.target.value))} disabled={busy}>{reviewMonths.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
        {!confirmationVisible && <button type="button" className="btn btn-primary graduation-import__submit" onClick={requestConfirmation} disabled={!preview || busy}>
          <Upload size={17} />
          {isReplace ? 'Tải lên lại đợt' : 'Tải lên đợt'}
        </button>}
      </div>

      <div className={`graduation-import__picker${file ? ' has-file' : ''}`}>
        <div className="graduation-import__file-icon"><FileSpreadsheet size={24} /></div>
        <div className="graduation-import__file-copy"><strong>{file?.name ?? 'Chọn danh sách sinh viên tốt nghiệp'}</strong><span>Excel .xlsx · hệ thống chỉ lưu số lượng tổng hợp</span></div>
        <label htmlFor={inputId} className="btn btn-secondary">{file ? 'Chọn file khác' : 'Chọn file Excel'}</label>
        <input ref={inputRef} id={inputId} type="file" accept=".xlsx" disabled={busy} onChange={(event) => void chooseFile(event.target.files?.[0])} />
      </div>

      {isReplace && <label className="graduation-import__reason">Lý do import lại <span aria-hidden="true">*</span><input value={replaceReason} maxLength={1000} onChange={(event) => setReplaceReason(event.target.value)} placeholder="Ví dụ: sửa danh sách bị thiếu sinh viên" disabled={busy} /></label>}

      {busy && !preview && <div className="graduation-state"><LoaderCircle className="spin" /> Đang bóc tách dữ liệu...</div>}
      {error && <div className="graduation-alert" role="alert">{error}</div>}
      {needsCohortMajorCatalog && <button type="button" className="btn btn-secondary" onClick={openCohortMajorCatalog}>Mở danh mục Khoá ngành đào tạo</button>}
      {errorRows.rows.length > 0 && (
        <div className="graduation-import__errors">
          <table>
            <thead>
              <tr>
                <th>Dòng</th>
                {errorRows.columns.map((column, index) => (
                  <th key={`${column}-${index}`}>{column || `Cột ${index + 1}`}</th>
                ))}
                <th>Lý do</th>
              </tr>
            </thead>
            <tbody>
              {errorRows.rows.map((row) => (
                <tr key={row.rowNumber}>
                  <td><strong>{row.rowNumber}</strong></td>
                  {errorRows.columns.map((column, index) => (
                    <td key={`${column}-${index}`}>{row.values[index] ?? ''}</td>
                  ))}
                  <td className="graduation-import__errors-reason">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && <>
        <div className="graduation-import__summary">
          <div><strong>{preview.sourceRowCount.toLocaleString('vi-VN')}</strong><span>dòng nguồn</span></div>
          <div><strong>{preview.importedRowCount.toLocaleString('vi-VN')}</strong><span>dòng được tính</span></div>
          <div><strong>{preview.skippedRowCount.toLocaleString('vi-VN')}</strong><span>dòng bị bỏ</span></div>
          <div><strong>{preview.sourceSheetName}</strong><span>sheet được đọc</span></div>
        </div>
        {preview.warnings.map((warning) => <div className="graduation-warning" role="status" key={`${warning.code}-${warning.classCode}`}>
          <AlertTriangle size={17} /><div><strong>{warning.message}</strong><span>Sheet {warning.sourceSheetName}, dòng {warning.sourceRowNumbers.join(', ')}. Dòng này không tham gia bất kỳ KPI nào.</span></div>
        </div>)}
        <div className="graduation-preview"><table><thead><tr><th>Khoa</th><th>Chuyên ngành</th><th>Khóa</th><th>Trạng thái</th><th>Số lượng</th></tr></thead><tbody>{preview.aggregates.slice(0, 150).map((row, index) => <tr key={`${row.facultyKey}-${row.programKey}-${row.cohortCode}-${row.graduationRank}-${row.isWorkStudy}-${index}`}><td>{row.facultyNameRaw}</td><td>{row.programNameRaw}</td><td>{row.cohortCode}</td><td>{statusLabel(row.cohortCode, target.academicYearStart, reviewMonth, reviewYear, row.isWorkStudy)}</td><td>{row.studentCount}</td></tr>)}</tbody></table></div>
        {preview.aggregates.length > 150 && <p className="graduation-note">Hiển thị 150/{preview.aggregates.length} tổ hợp tổng hợp.</p>}
      </>}

      </div>
    </Modal>

    <Modal
      isOpen={isOpen && confirmationVisible}
      onClose={closeConfirmation}
      title="Xác nhận tải lên dữ liệu"
      size="compact"
    >
      <div className="graduation-import-confirmation" aria-busy={busy}>
        <div className="graduation-import-confirmation__summary">
          <AlertTriangle aria-hidden="true" size={20} />
          <div>
            <strong>{target.academicYearStart}–{target.academicYearStart + 1} · Đợt {target.roundNumber}</strong>
            <span>{file?.name}</span>
            <small>Tháng xét {String(reviewMonth).padStart(2, '0')}/{reviewYear}</small>
          </div>
        </div>
        <label className="graduation-import__year-confirmation">
          <input
            type="checkbox"
            checked={academicYearConfirmed}
            onChange={(event) => setAcademicYearConfirmed(event.target.checked)}
            disabled={busy}
            autoFocus
          />
          <span>Tôi xác nhận file này thuộc năm học <strong>{target.academicYearStart}–{target.academicYearStart + 1}</strong>.</span>
        </label>
        {error && <div className="graduation-alert" role="alert">{error}</div>}
        {needsCohortMajorCatalog && <button type="button" className="btn btn-secondary" onClick={openCohortMajorCatalog}>Mở danh mục Khoá ngành đào tạo</button>}
      {errorRows.rows.length > 0 && (
        <div className="graduation-import__errors">
          <table>
            <thead>
              <tr>
                <th>Dòng</th>
                {errorRows.columns.map((column, index) => (
                  <th key={`${column}-${index}`}>{column || `Cột ${index + 1}`}</th>
                ))}
                <th>Lý do</th>
              </tr>
            </thead>
            <tbody>
              {errorRows.rows.map((row) => (
                <tr key={row.rowNumber}>
                  <td><strong>{row.rowNumber}</strong></td>
                  {errorRows.columns.map((column, index) => (
                    <td key={`${column}-${index}`}>{row.values[index] ?? ''}</td>
                  ))}
                  <td className="graduation-import__errors-reason">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        <div className="graduation-import-confirmation__actions">
          <button type="button" className="btn btn-secondary" onClick={closeConfirmation} disabled={busy}>Quay lại</button>
          <button type="button" className="btn btn-primary" onClick={() => void commit()} disabled={!academicYearConfirmed || busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}
            {busy ? 'Đang lưu...' : 'Xác nhận tải lên'}
          </button>
        </div>
      </div>
    </Modal>
  </>;
}
