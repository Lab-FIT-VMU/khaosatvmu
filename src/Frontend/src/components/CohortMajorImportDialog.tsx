import { useEffect, useId, useRef, useState } from 'react';
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
  downloadCohortMajorFailedRows,
  downloadCohortMajorImportTemplate,
  parseCohortMajorImportFile,
  CohortMajorImportFileError,
  type CohortMajorImportFileErrorCode,
  type ImportCohortMajorRow,
} from '../utils/cohortMajorImportExcel';
import { ApiError } from '../services/apiClient';
import {
  cohortErrorMessage,
  type Cohort,
  type CohortImportResponse,
} from '../services/cohortApi';
import type { Major } from '../types';
import { ExportFailedRowsButton } from './ExportFailedRowsButton';
import { Modal } from './Modal';
import { SearchableSelect } from './SearchableSelect';

interface CohortMajorImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cohorts: Cohort[];
  /** Khoá đang chọn ở cột trái, dùng làm mặc định. */
  defaultCohortId: number | null;
  /** Đưa vào sheet tra cứu của tệp mẫu để người điền chép đúng tên ngành. */
  majors: Major[];
  onImport: (cohortId: number, rows: ImportCohortMajorRow[]) => Promise<CohortImportResponse>;
}

const fileErrorMessages: Record<CohortMajorImportFileErrorCode, string> = {
  FILE_TYPE: 'Chỉ chấp nhận tệp Excel có định dạng .xlsx.',
  FILE_SIZE: 'Tệp Excel không được lớn hơn 5 MB.',
  FILE_EMPTY: 'Tệp Excel không có dữ liệu.',
  CODE_HEADER_MISSING: 'Không tìm thấy cột "Khoá ngành đào tạo" trong hàng tiêu đề.',
  NAME_HEADER_MISSING: 'Không tìm thấy cột "Ngành đào tạo" trong hàng tiêu đề.',
  STUDENT_COUNT_HEADER_MISSING: 'Không tìm thấy cột "Số lượng sinh viên" trong hàng tiêu đề.',
  NO_DATA_ROWS: 'Tệp Excel chưa có dòng khoá ngành đào tạo nào.',
  READ_FAILED: 'Không thể đọc tệp Excel. Hãy kiểm tra tệp không bị hỏng hoặc đặt mật khẩu.',
};

export function CohortMajorImportDialog({
  isOpen,
  onClose,
  cohorts,
  defaultCohortId,
  majors,
  onImport,
}: CohortMajorImportDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportCohortMajorRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<CohortImportResponse | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [cohortId, setCohortId] = useState('');

  // Tệp không có cột khoá học, nên chọn một lần cho cả lần import.
  useEffect(() => {
    if (!isOpen) return;
    setCohortId(String(defaultCohortId ?? cohorts[0]?.cohortId ?? ''));
  }, [isOpen, defaultCohortId, cohorts]);

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
      setRows(await parseCohortMajorImportFile(file));
    } catch (error) {
      setParseError(
        error instanceof CohortMajorImportFileError
          ? fileErrorMessages[error.code]
          : fileErrorMessages.READ_FAILED
      );
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    if (!cohortId) {
      setRequestError('Vui lòng chọn khoá học để import vào.');
      return;
    }
    setImporting(true);
    setRequestError(null);
    try {
      setResult(await onImport(Number(cohortId), rows));
    } catch (error) {
      setRequestError(
        error instanceof ApiError ? cohortErrorMessage(error.errorCode) : cohortErrorMessage(null)
      );
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    setTemplateError(null);
    try {
      await downloadCohortMajorImportTemplate(majors);
    } catch {
      setTemplateError('Không thể tạo tệp mẫu. Hãy thử lại.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const failedItems = result?.items.filter((item) => !item.succeeded) ?? [];

  const exportFailedItems = () => {
    const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]));

    return downloadCohortMajorFailedRows(
      failedItems.map((item) => {
        const row = rowByNumber.get(item.rowNumber);
        return {
          rowNumber: item.rowNumber,
          values: [
            row?.cohortMajorCode ?? item.cohortMajorCode ?? '',
            row?.majorName ?? '',
            row?.studentCount === null || row?.studentCount === undefined
              ? ''
              : String(row.studentCount),
          ],
          reason: cohortErrorMessage(item.errorCode),
        };
      })
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import khoá ngành đào tạo từ Excel">
      <div className="admin-import-dialog" aria-busy={parsing}>
        <div className="admin-form-intro">
          <FileSpreadsheet aria-hidden="true" />
          <p>
            Hàng đầu tiên cần có các cột <strong>Khoá ngành đào tạo</strong>,{' '}
            <strong>Ngành đào tạo</strong> và <strong>Số lượng sinh viên</strong>. Tên khoá ngành
            đặt tự do; ngành đào tạo tra theo tên trong danh mục.
          </p>
        </div>

        {!result && (
          <>
            <div className="form-group">
              <label htmlFor={`${inputId}-cohort`}>Import vào khoá học</label>
              <SearchableSelect
                id={`${inputId}-cohort`}
                value={cohortId}
                onChange={setCohortId}
                required
                placeholder="Chọn khoá học"
                options={cohorts.map((cohort) => ({
                  value: String(cohort.cohortId),
                  label: `${cohort.cohortName} (${cohort.academicYearName})`,
                }))}
              />
            </div>

            <div className="import-template-row">
              <span>
                Chưa có tệp đúng định dạng? Tải tệp mẫu rồi điền dữ liệu vào; sheet{' '}
                <strong>Danh sách ngành</strong> có sẵn tên để chép cho đúng.
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
                  <strong>{rows.length} khoá ngành đào tạo sẵn sàng import</strong>
                  <span>Hiển thị toàn bộ danh sách</span>
                </header>
                <div className="admin-import-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Dòng</th>
                        <th>Khoá ngành đào tạo</th>
                        <th>Ngành đào tạo</th>
                        <th>Số lượng sinh viên</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.rowNumber}>
                          <td>{row.rowNumber}</td>
                          <td>
                            {row.cohortMajorCode || (
                              <span className="admin-import-invalid">Thiếu mã khoá ngành</span>
                            )}
                          </td>
                          <td>
                            {row.majorName || (
                              <span className="admin-import-invalid">Thiếu tên ngành</span>
                            )}
                          </td>
                          <td>
                            {row.studentCount === null ? (
                              <span className="admin-import-invalid">Thiếu số lượng</span>
                            ) : (
                              row.studentCount
                            )}
                          </td>
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
                  {result.createdCount} đã thêm, {result.updatedCount} đã cập nhật,{' '}
                  {result.skippedCount} bị bỏ qua
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
                      <th>Khoá ngành đào tạo</th>
                      <th>Lý do bỏ qua</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedItems.map((item) => (
                      <tr key={`${item.rowNumber}-${item.cohortMajorCode}`}>
                        <td>{item.rowNumber}</td>
                        <td>{item.cohortMajorCode || 'Không có'}</td>
                        <td>{cohortErrorMessage(item.errorCode)}</td>
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
                disabled={rows.length === 0 || parsing || importing || !cohortId}
              >
                {importing ? (
                  <LoaderCircle className="auth-spin" aria-hidden="true" />
                ) : (
                  <Upload aria-hidden="true" />
                )}
                {importing ? 'Đang lưu...' : `Import ${rows.length || ''} khoá ngành`}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
