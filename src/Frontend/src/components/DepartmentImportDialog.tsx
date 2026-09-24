import { useId, useRef, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Upload,
} from 'lucide-react';
import {
  downloadDepartmentFailedRows,
  downloadDepartmentImportTemplate,
  parseDepartmentImportFile,
  DepartmentImportFileError,
  type DepartmentImportFileErrorCode,
  type ImportDepartmentRow,
} from '../utils/departmentImportExcel';
import { ApiError } from '../services/apiClient';
import { catalogErrorMessage, type CatalogImportResponse } from '../services/catalogApi';
import type { Faculty } from '../types';
import { ExportFailedRowsButton } from './ExportFailedRowsButton';
import { Modal } from './Modal';

interface DepartmentImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Đưa vào sheet tra cứu của tệp mẫu để người điền chép đúng tên khoa/viện. */
  faculties: Faculty[];
  /** Gửi danh sách lên API và trả về kết quả từng dòng. */
  onImport: (rows: ImportDepartmentRow[]) => Promise<CatalogImportResponse>;
}

const fileErrorMessages: Record<DepartmentImportFileErrorCode, string> = {
  FILE_TYPE: 'Chỉ chấp nhận tệp Excel có định dạng .xlsx.',
  FILE_SIZE: 'Tệp Excel không được lớn hơn 5 MB.',
  FILE_EMPTY: 'Tệp Excel không có dữ liệu.',
  ID_HEADER_MISSING: 'Không tìm thấy cột "Mã bộ môn" trong hàng tiêu đề.',
  NAME_HEADER_MISSING: 'Không tìm thấy cột "Tên bộ môn" trong hàng tiêu đề.',
  FACULTY_HEADER_MISSING: 'Không tìm thấy cột "Tên khoa viện" trong hàng tiêu đề.',
  NO_DATA_ROWS: 'Tệp Excel chưa có dòng bộ môn nào.',
  READ_FAILED: 'Không thể đọc tệp Excel. Hãy kiểm tra tệp không bị hỏng hoặc đặt mật khẩu.',
};

export function DepartmentImportDialog({
  isOpen,
  onClose,
  faculties,
  onImport,
}: DepartmentImportDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportDepartmentRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<CatalogImportResponse | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const reset = () => {
    if (inputRef.current) inputRef.current.value = '';
    setFileName('');
    setRows([]);
    setParseError(null);
    setRequestError(null);
    setResult(null);
  };

  const handleClose = () => {
    if (parsing || importing) return;
    reset();
    onClose();
  };

  const handleFileChange = async (file?: File) => {
    reset();
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    try {
      setRows(await parseDepartmentImportFile(file));
    } catch (error) {
      setParseError(
        error instanceof DepartmentImportFileError
          ? fileErrorMessages[error.code]
          : fileErrorMessages.READ_FAILED
      );
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setRequestError(null);
    try {
      setResult(await onImport(rows));
    } catch (error) {
      setRequestError(
        error instanceof ApiError ? catalogErrorMessage(error.errorCode) : catalogErrorMessage(null)
      );
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    setTemplateError(null);
    try {
      await downloadDepartmentImportTemplate(faculties);
    } catch {
      setTemplateError('Không thể tạo tệp mẫu. Hãy thử lại.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const failedItems = result?.items.filter((item) => !item.succeeded) ?? [];

  // Dòng thiếu dữ liệu bắt buộc, phát hiện ngay khi đọc tệp nên chặn trước khi gửi.
  const invalidRows = rows.filter(
    (row) => row.departmentId <= 0 || row.departmentName.length === 0
  );

  const exportInvalidRows = () =>
    downloadDepartmentFailedRows(
      invalidRows.map((row) => ({
        rowNumber: row.rowNumber,
        values: [row.departmentId > 0 ? row.departmentId : '', row.departmentName, row.facultyName],
        reason:
          row.departmentId <= 0 && row.departmentName.length === 0
            ? 'Thiếu mã bộ môn và tên bộ môn'
            : row.departmentId <= 0
              ? 'Thiếu mã bộ môn, hoặc mã không phải số nguyên dương'
              : 'Thiếu tên bộ môn',
      }))
    );

  // Dòng bị API trả về lỗi. Dựng lại giá trị từ chính tệp vừa đọc theo số dòng,
  // vì phản hồi của API chỉ mang tên và mã lỗi chứ không đủ các cột.
  const exportFailedItems = () => {
    const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]));

    return downloadDepartmentFailedRows(
      failedItems.map((item) => {
        const row = rowByNumber.get(item.rowNumber);
        return {
          rowNumber: item.rowNumber,
          values: [
            row && row.departmentId > 0 ? row.departmentId : '',
            row?.departmentName ?? item.name ?? '',
            row?.facultyName ?? item.facultyName ?? '',
          ],
          reason: catalogErrorMessage(item.errorCode),
        };
      })
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import bộ môn từ Excel">
      <div className="admin-import-dialog" aria-busy={parsing}>
        <div className="admin-form-intro">
          <FileSpreadsheet aria-hidden="true" />
          <p>
            Hàng đầu tiên cần có cột <strong>Mã bộ môn</strong>, <strong>Tên bộ môn</strong> và cột{' '}
            <strong>Tên khoa viện</strong>. Mã bộ môn phải tự điền, là số nguyên dương và không được
            trùng. Tên khoa viện được tra ngược trong danh mục Khoa / Viện để lấy đúng{' '}
            <strong>FacultyId</strong>.
          </p>
        </div>

        {!result && (
          <>
            <div className="import-template-row">
              <span>
                Chưa có tệp đúng định dạng? Tải tệp mẫu rồi điền dữ liệu vào; sheet{' '}
                <strong>Danh sách khoa/viện</strong> có sẵn tên để chép cho đúng.
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void handleDownloadTemplate()}
                disabled={downloadingTemplate}
              >
                {downloadingTemplate ? (
                  <LoaderCircle className="auth-spin" aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                {downloadingTemplate ? 'Đang tạo tệp...' : 'Tải file mẫu'}
              </button>
            </div>

            {templateError && (
              <div className="admin-alert" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{templateError}</span>
              </div>
            )}

            <label className="admin-import-picker" htmlFor={inputId}>
              <Upload aria-hidden="true" />
              <span>
                <strong>{fileName || 'Chọn tệp Excel'}</strong>
                <small>Định dạng .xlsx, dung lượng tối đa 5 MB</small>
              </span>
              <span className="btn btn-secondary">Chọn file</span>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={parsing}
                onChange={(event) => void handleFileChange(event.target.files?.[0])}
              />
            </label>

            {parsing && (
              <div className="admin-import-state" role="status">
                <LoaderCircle className="auth-spin" aria-hidden="true" />
                Đang đọc tệp Excel...
              </div>
            )}

            {parseError && (
              <div className="admin-alert" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{parseError}</span>
              </div>
            )}

            {requestError && (
              <div className="admin-alert" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{requestError}</span>
              </div>
            )}

            {rows.length > 0 && (
              <section className="admin-import-preview" aria-label="Xem trước dữ liệu import">
                <header>
                  <strong>{rows.length} bộ môn sẵn sàng import</strong>
                  <span>
                    {invalidRows.length > 0
                      ? `${invalidRows.length} dòng thiếu dữ liệu bắt buộc`
                      : 'Hiển thị toàn bộ danh sách'}
                  </span>
                </header>
                <ExportFailedRowsButton count={invalidRows.length} onExport={exportInvalidRows} />
                <div className="admin-import-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Dòng</th>
                        <th>Mã bộ môn</th>
                        <th>Tên bộ môn</th>
                        <th>Tên khoa viện</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.rowNumber}>
                          <td style={{ textAlign: 'right' }}>{row.rowNumber}</td>
                          <td>
                            {row.departmentId > 0 ? (
                              row.departmentId
                            ) : (
                              <span className="admin-import-invalid">Thiếu mã bộ môn</span>
                            )}
                          </td>
                          <td>
                            {row.departmentName || (
                              <span className="admin-import-invalid">Thiếu tên bộ môn</span>
                            )}
                          </td>
                          <td>{row.facultyName || 'Không có'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {result && (
          <section className="admin-import-result" aria-live="polite">
            <div className={`admin-import-summary ${result.skippedCount > 0 ? 'has-warnings' : ''}`}>
              {result.skippedCount > 0 ? (
                <CircleAlert aria-hidden="true" />
              ) : (
                <CheckCircle2 aria-hidden="true" />
              )}
              <div>
                <strong>Hoàn tất import {result.totalCount} dòng</strong>
                <span>
                  {result.createdCount} đã thêm, {result.skippedCount} bị bỏ qua
                </span>
              </div>
            </div>

            <ExportFailedRowsButton count={failedItems.length} onExport={exportFailedItems} />

            {failedItems.length > 0 && (
              <div className="admin-import-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Dòng</th>
                      <th>Tên bộ môn</th>
                      <th>Tên khoa viện</th>
                      <th>Lý do bỏ qua</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedItems.map((item) => (
                      <tr key={`${item.rowNumber}-${item.name}`}>
                        <td style={{ textAlign: 'right' }}>{item.rowNumber}</td>
                        <td>{item.name || 'Không có'}</td>
                        <td>{item.facultyName || 'Không có'}</td>
                        <td>{catalogErrorMessage(item.errorCode)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <div className="modal-footer admin-inline-footer">
          {result ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={reset}>
                <RotateCcw aria-hidden="true" />
                Import file khác
              </button>
              <button type="button" className="btn btn-primary" onClick={handleClose}>
                Đóng
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={parsing || importing}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleImport()}
                disabled={rows.length === 0 || parsing || importing}
              >
                {importing ? (
                  <LoaderCircle className="auth-spin" aria-hidden="true" />
                ) : (
                  <Upload aria-hidden="true" />
                )}
                {importing ? 'Đang lưu...' : `Import ${rows.length || ''} bộ môn`}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
