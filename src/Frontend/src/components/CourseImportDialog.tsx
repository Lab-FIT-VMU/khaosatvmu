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
  downloadCourseFailedRows,
  downloadCourseImportTemplate,
  parseCourseImportFile,
  CourseImportFileError,
  type CourseImportFileErrorCode,
  type ImportCourseRow,
} from '../utils/courseImportExcel';
import { apiErrorMessage } from '../services/apiClient';
import { catalogErrorMessage, type CatalogImportResponse } from '../services/catalogApi';
import { buildDepartmentLookupRows } from '../utils/importLookupRows';
import type { Department, Faculty } from '../types';
import { courseImportReason } from '../utils/catalogImportRowReasons';
import type { ImportSheetChoice } from '../utils/importSheets';
import { ExportFailedRowsButton } from './ExportFailedRowsButton';
import { ImportSheetPicker } from './ImportSheetPicker';
import { Modal } from './Modal';
import { ImportConfirmation } from './ImportConfirmation';

interface CourseImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Dựng sheet tra cứu bộ môn trong tệp mẫu. */
  departments: Department[];
  faculties: Faculty[];
  /** Gửi danh sách lên API và trả về kết quả từng dòng. */
  onImport: (rows: ImportCourseRow[]) => Promise<CatalogImportResponse>;
}

const fileErrorMessages: Record<CourseImportFileErrorCode, string> = {
  FILE_TYPE: 'Chỉ chấp nhận tệp Excel có định dạng .xlsx.',
  FILE_SIZE: 'Tệp Excel không được lớn hơn 5 MB.',
  FILE_EMPTY: 'Tệp Excel không có dữ liệu.',
  CODE_HEADER_MISSING: 'Không tìm thấy cột "Mã học phần" trong hàng tiêu đề.',
  NAME_HEADER_MISSING: 'Không tìm thấy cột "Tên học phần" trong hàng tiêu đề.',
  NO_DATA_ROWS: 'Tệp Excel chưa có dòng học phần nào.',
  READ_FAILED: 'Không thể đọc tệp Excel. Hãy kiểm tra tệp không bị hỏng hoặc đặt mật khẩu.',
};

export function CourseImportDialog({
  isOpen,
  onClose,
  departments,
  faculties,
  onImport,
}: CourseImportDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  // Giữ tệp để đọc lại khi người dùng đổi sheet.
  const [file, setFile] = useState<File | null>(null);
  const [sheetChoice, setSheetChoice] = useState<ImportSheetChoice | null>(null);
  const [rows, setRows] = useState<ImportCourseRow[]>([]);
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
    setFile(null);
    setSheetChoice(null);
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

  /** Đọc tệp; `sheetName` bỏ trống thì tự chọn sheet đủ cột bắt buộc. */
  const readFile = async (source: File, sheetName?: string) => {
    setParsing(true);
    setParseError(null);
    setRows([]);
    try {
      const parsed = await parseCourseImportFile(source, sheetName);
      setRows(parsed.rows);
      setSheetChoice(parsed);
    } catch (error) {
      setParseError(
        error instanceof CourseImportFileError
          ? fileErrorMessages[error.code]
          : fileErrorMessages.READ_FAILED
      );
      if (sheetName) setSheetChoice((previous) => (previous ? { ...previous, sheetName } : previous));
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = async (selected?: File) => {
    reset();
    if (!selected) return;

    setFileName(selected.name);
    setFile(selected);
    await readFile(selected);
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setRequestError(null);
    try {
      setResult(await onImport(rows));
    } catch (error) {
      setRequestError(
        apiErrorMessage(error, catalogErrorMessage)
      );
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    setTemplateError(null);
    try {
      await downloadCourseImportTemplate(buildDepartmentLookupRows(departments, faculties));
    } catch {
      setTemplateError('Không thể tạo tệp mẫu. Hãy thử lại.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const failedItems = result?.items.filter((item) => !item.succeeded) ?? [];

  const rowValues = (row: ImportCourseRow) => [
    row.courseCode,
    row.courseName,
    row.credits,
    row.courseType,
    row.facultyName,
    row.departmentName,
    row.prerequisiteCourseCode,
  ];

  // Dòng thiếu dữ liệu bắt buộc, chặn ngay khi đọc tệp.
  const invalidRows = rows.filter(
    (row) => row.courseCode.length === 0 || row.courseName.length === 0
  );

  const exportInvalidRows = () =>
    downloadCourseFailedRows(
      invalidRows.map((row) => ({
        rowNumber: row.rowNumber,
        values: rowValues(row),
        reason:
          row.courseCode.length === 0 && row.courseName.length === 0
            ? 'Thiếu mã học phần và tên học phần'
            : row.courseCode.length === 0
              ? 'Thiếu mã học phần'
              : 'Thiếu tên học phần',
      }))
    );

  // Dòng bị API trả về lỗi; lấy lại đủ cột từ chính tệp vừa đọc theo số dòng.
  // Lý do cụ thể của từng dòng bị bỏ qua: nêu giá trị gây lỗi, gợi ý giá trị đúng, dòng trùng trước đó.
  const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]));
  const reasonOf = (item: { rowNumber: number; errorCode?: string | null }) =>
    courseImportReason(item.errorCode, rowByNumber.get(item.rowNumber), rows, faculties, departments);

  const exportFailedItems = () => {
    const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]));

    return downloadCourseFailedRows(
      failedItems.map((item) => {
        const row = rowByNumber.get(item.rowNumber);
        return {
          rowNumber: item.rowNumber,
          values: row ? rowValues(row) : ['', item.name ?? '', '', '', '', '', ''],
          reason: reasonOf(item),
        };
      })
    );
  };

  return (
    <Modal stepFlow isOpen={isOpen} onClose={handleClose} title="Import học phần từ Excel">
      <div className="admin-import-dialog" aria-busy={parsing}>
        <div className="admin-form-intro">
          <FileSpreadsheet aria-hidden="true" />
          <p>
            Hàng đầu tiên cần có cột <strong>Mã học phần</strong> và <strong>Tên học phần</strong>.
            Các cột Số tín chỉ, Loại học phần, Tên khoa viện, Tên bộ môn, Mã học phần tiên quyết là
            tùy chọn; tên khoa viện và bộ môn được tra ngược ra id.
          </p>
        </div>

        {!result && (
          <>
            <div className="import-template-row">
              <span>
                Chưa có tệp đúng định dạng? Tải tệp mẫu rồi điền dữ liệu vào; sheet{' '}
                <strong>Danh sách bộ môn</strong> có sẵn mã bộ môn, tên bộ môn và khoa/viện.
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
                disabled={parsing || importing}
                onChange={(event) => void handleFileChange(event.target.files?.[0])}
              />
            </label>

            <ImportSheetPicker
              choice={sheetChoice}
              disabled={parsing || importing}
              requiredColumnsLabel="Mã học phần / Tên học phần"
              onChange={(name) => file && void readFile(file, name)}
            />

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
                  <strong>{rows.length} học phần sẵn sàng import</strong>
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
                        <th>Mã</th>
                        <th>Tên học phần</th>
                        <th>Tín chỉ</th>
                        <th>Khoa viện</th>
                        <th>Bộ môn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.rowNumber}>
                          <td style={{ textAlign: 'right' }}>{row.rowNumber}</td>
                          <td>
                            {row.courseCode || (
                              <span className="admin-import-invalid">Thiếu mã</span>
                            )}
                          </td>
                          <td>
                            {row.courseName || (
                              <span className="admin-import-invalid">Thiếu tên</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>{row.credits || '—'}</td>
                          <td>{row.facultyName || '—'}</td>
                          <td>{row.departmentName || '—'}</td>
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
                      <th>Học phần</th>
                      <th>Khoa viện</th>
                      <th>Lý do bỏ qua</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedItems.map((item) => (
                      <tr key={`${item.rowNumber}-${item.name}`}>
                        <td style={{ textAlign: 'right' }}>{item.rowNumber}</td>
                        <td>{item.name || 'Không có'}</td>
                        <td>{item.facultyName || 'Không có'}</td>
                        <td>{reasonOf(item)}</td>
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
              <ImportConfirmation
                rows={rows}
                fileName={fileName}
                sheetName={sheetChoice?.sheetName}
                destination="Danh mục học phần"
                columns={[
                  { key: 'courseCode', label: 'Mã học phần' },
                  { key: 'courseName', label: 'Tên học phần' },
                  { key: 'credits', label: 'Tín chỉ' },
                  { key: 'courseType', label: 'Loại học phần' },
                  { key: 'facultyName', label: 'Khoa / viện' },
                  { key: 'departmentName', label: 'Bộ môn' },
                  { key: 'prerequisiteCourseCode', label: 'Học phần tiên quyết' },
                ]}
                disabled={rows.length === 0 || parsing || importing}
                onConfirm={handleImport}
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
