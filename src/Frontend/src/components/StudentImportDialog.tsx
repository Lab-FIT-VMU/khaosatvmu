import { useState } from 'react';
import { Download, Eye, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import { Modal } from './Modal';
import { ApiError } from '../services/apiClient';
import { studentsApi } from '../services/studentsApi';
import type { StudentImportPreview, StudentImportResult, StudentImportRow } from '../types/students';
import {
  downloadStudentImportTemplate,
  parseStudentImportFile,
  StudentImportFileError,
  studentImportFileErrorMessages,
  type StudentImportSheet,
} from '../utils/studentImportExcel';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: StudentImportResult) => void;
}

const numberFormat = new Intl.NumberFormat('vi-VN');
const n = (value: number) => numberFormat.format(value);

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof StudentImportFileError) return studentImportFileErrorMessages[error.code];
  if (error instanceof ApiError && typeof error.body.message === 'string' && error.body.message) return error.body.message;
  return fallback;
}

/**
 * Nạp danh sách sinh viên: chọn file → chọn sheet (mỗi sheet một khóa) → xem trước → xác nhận.
 * Dòng lỗi bị bỏ qua khi nạp; ô trống không xóa thông tin đang có.
 */
export function StudentImportDialog({ isOpen, onClose, onImported }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<StudentImportSheet[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [previewRows, setPreviewRows] = useState<StudentImportRow[]>([]);
  const [busy, setBusy] = useState<'read' | 'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFileName(null);
    setSheets([]);
    setSelected(new Set());
    setPreview(null);
    setPreviewRows([]);
    setError(null);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const chooseFile = async (file: File | null) => {
    reset();
    if (!file) return;
    setBusy('read');
    try {
      const parsed = await parseStudentImportFile(file);
      setFileName(file.name);
      setSheets(parsed);
      setSelected(new Set(parsed.map((s) => s.name)));
    } catch (readError) {
      setError(errorMessage(readError, 'Không đọc được file.'));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (name: string) => {
    setPreview(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectedRows = () => sheets.filter((s) => selected.has(s.name)).flatMap((s) => s.rows);

  const runPreview = async () => {
    const rows = selectedRows();
    if (rows.length === 0) return;
    setBusy('preview');
    setError(null);
    try {
      setPreview(await studentsApi.previewImport(rows));
      setPreviewRows(rows);
    } catch (previewError) {
      setError(errorMessage(previewError, 'Không xem trước được danh sách.'));
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy('commit');
    setError(null);
    try {
      const result = await studentsApi.commitImport(previewRows, preview.previewHash);
      reset();
      onImported(result);
    } catch (commitError) {
      setError(errorMessage(commitError, 'Không nạp được danh sách.'));
    } finally {
      setBusy(null);
    }
  };

  const selectedCount = sheets.filter((s) => selected.has(s.name)).reduce((sum, s) => sum + s.rows.length, 0);
  const issueLabel = (sheet: string | null, row: number, code: string | null) =>
    `${sheet ? `${sheet}, ` : ''}dòng ${row}${code ? ` (${code})` : ''}`;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Nạp danh sách sinh viên" size="import">
      <div className="student-import">
        <p className="student-import__hint">
          Mỗi sheet là một khóa (ví dụ “Khóa 66”). Bắt buộc: Mã sinh viên, Họ và tên, Khoá ngành đào tạo (lớp hành chính,
          phải có sẵn trong danh mục Khoá ngành đào tạo). Các cột khác có thể trống và không xóa thông tin đang có.
        </p>
        <div className="student-import__file">
          <label className="btn btn-secondary btn-sm">
            <FileSpreadsheet size={16} aria-hidden="true" />
            <span>{fileName ?? 'Chọn file .xlsx'}</span>
            <input
              type="file"
              accept=".xlsx"
              hidden
              onChange={(event) => { void chooseFile(event.target.files?.[0] ?? null); event.target.value = ''; }}
            />
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void downloadStudentImportTemplate()}>
            <Download size={16} aria-hidden="true" />
            <span>Tải file mẫu</span>
          </button>
          {busy === 'read' && <span className="student-import__muted"><LoaderCircle size={14} className="spin" /> Đang đọc file...</span>}
        </div>

        {error && <div className="student-import__error" role="alert">{error}</div>}

        {sheets.length > 0 && (
          <fieldset className="student-import__sheets">
            <legend>Chọn sheet (khóa) cần nạp</legend>
            {sheets.map((sheet) => (
              <label key={sheet.name}>
                <input type="checkbox" checked={selected.has(sheet.name)} onChange={() => toggle(sheet.name)} disabled={busy !== null} />
                <span>{sheet.name}</span>
                <small>{n(sheet.rows.length)} sinh viên</small>
              </label>
            ))}
            <div className="student-import__actions">
              <span className="student-import__muted">Đã chọn {n(selectedCount)} sinh viên</span>
              <button type="button" className="btn btn-primary btn-sm" disabled={selectedCount === 0 || busy !== null} onClick={() => void runPreview()}>
                {busy === 'preview' ? <LoaderCircle size={16} className="spin" /> : <Eye size={16} aria-hidden="true" />}
                <span>Xem trước</span>
              </button>
            </div>
          </fieldset>
        )}

        {preview && (
          <section className="student-import__preview" aria-label="Kết quả xem trước">
            <dl className="student-import__counts">
              <div><dt>Thêm mới</dt><dd>{n(preview.newCount)}</dd></div>
              <div><dt>Cập nhật</dt><dd>{n(preview.updatedCount)}</dd></div>
              <div><dt>Không đổi</dt><dd>{n(preview.unchangedCount)}</dd></div>
              <div><dt>Dòng lỗi (bỏ qua)</dt><dd>{n(preview.errorCount)}</dd></div>
            </dl>
            {preview.renamedCount > 0 && (
              <p className="student-import__muted">{n(preview.renamedCount)} sinh viên đã có sẽ được đổi họ tên theo file.</p>
            )}
            {preview.newCohortMajors.length > 0 && (
              <details className="student-import__new">
                <summary>
                  Sẽ tự thêm {n(preview.newCohortMajors.length)} khoá ngành đào tạo chưa có trong danh mục
                  (sĩ số đầu vào để 0, sửa sau ở trang Khoá ngành đào tạo)
                </summary>
                <table className="student-import__table">
                  <thead><tr><th>Khoá ngành</th><th>Khóa</th><th>Ngành</th><th>Sinh viên</th></tr></thead>
                  <tbody>
                    {preview.newCohortMajors.map((m) => (
                      <tr key={m.cohortMajorCode}><td>{m.cohortMajorCode}</td><td>{m.cohortName}</td><td>{m.majorName}</td><td>{n(m.studentCount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            {preview.missingCohortMajors.length > 0 && (
              <div className="student-import__missing" role="alert">
                <strong>
                  {n(preview.missingCohortMajors.length)} lớp không suy được khoá ngành
                  ({n(preview.missingCohortMajors.reduce((sum, m) => sum + m.studentCount, 0))} sinh viên sẽ bị bỏ qua).
                </strong>
                <span> Thêm ngành / khóa còn thiếu rồi nạp lại:</span>
                <ul>
                  {preview.missingCohortMajors.map((m) => (
                    <li key={m.cohortMajorCode}><strong>{m.cohortMajorCode}</strong> ({n(m.studentCount)} sinh viên): {m.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            <table className="student-import__table">
              <thead><tr><th>Khóa</th><th>Số sinh viên</th><th>Thêm mới</th><th>Cập nhật</th></tr></thead>
              <tbody>
                {preview.cohorts.map((c) => (
                  <tr key={c.cohortName}><td>{c.cohortName}</td><td>{n(c.rowCount)}</td><td>{n(c.newCount)}</td><td>{n(c.updatedCount)}</td></tr>
                ))}
              </tbody>
            </table>
            {preview.errors.length > 0 && (
              <details open>
                <summary>Dòng lỗi ({n(preview.errorCount)})</summary>
                <ul>{preview.errors.map((e) => <li key={`${e.sheetName}|${e.rowNumber}`}>{issueLabel(e.sheetName, e.rowNumber, e.studentCode)}: {e.message}</li>)}</ul>
              </details>
            )}
            {preview.warnings.length > 0 && (
              <details>
                <summary>Lưu ý ({n(preview.warnings.length)})</summary>
                <ul>{preview.warnings.map((w) => <li key={`${w.sheetName}|${w.rowNumber}`}>{issueLabel(w.sheetName, w.rowNumber, w.studentCode)}: {w.message}</li>)}</ul>
              </details>
            )}
            <div className="student-import__actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={close} disabled={busy !== null}>Hủy</button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy !== null || preview.newCount + preview.updatedCount === 0}
                onClick={() => void commit()}
              >
                {busy === 'commit' ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} aria-hidden="true" />}
                <span>Xác nhận nạp</span>
              </button>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
