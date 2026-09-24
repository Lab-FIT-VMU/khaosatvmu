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
  downloadCourseSectionFailedRows,
  downloadCourseSectionImportTemplate,
  downloadUnidentifiedLecturerFile,
  parseCourseSectionImportFile,
  CourseSectionImportFileError,
  type CourseSectionImportFileErrorCode,
  type ImportCourseSectionRow,
} from '../utils/courseSectionImportExcel';
import { ApiError } from '../services/apiClient';
import { catalogErrorMessage, type CourseSectionImportResponse } from '../services/catalogApi';
import { buildLecturerLookupRows } from '../utils/importLookupRows';
import type { Department, Faculty, Lecturer } from '../types';
import { ExportFailedRowsButton } from './ExportFailedRowsButton';
import { Modal } from './Modal';

interface CourseSectionImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Học kỳ đang chọn, hiển thị để người dùng biết import vào đâu. */
  semesterLabel: string;
  /** Dựng sheet tra cứu giảng viên trong tệp mẫu. */
  lecturers: Lecturer[];
  departments: Department[];
  faculties: Faculty[];
  onImport: (rows: ImportCourseSectionRow[]) => Promise<CourseSectionImportResponse>;
}

const fileErrorMessages: Record<CourseSectionImportFileErrorCode, string> = {
  FILE_TYPE: 'Chỉ chấp nhận tệp Excel có định dạng .xlsx.',
  FILE_SIZE: 'Tệp Excel không được lớn hơn 5 MB.',
  FILE_EMPTY: 'Tệp Excel không có dữ liệu.',
  CODE_HEADER_MISSING: 'Không tìm thấy cột "Mã HP" trong hàng tiêu đề.',
  SECTION_HEADER_MISSING: 'Không tìm thấy cột "Nhóm" trong hàng tiêu đề.',
  NO_DATA_ROWS: 'Tệp Excel chưa có dòng lớp học phần nào.',
  READ_FAILED: 'Không thể đọc tệp Excel. Hãy kiểm tra tệp không bị hỏng hoặc đặt mật khẩu.',
};

export function CourseSectionImportDialog({
  isOpen,
  onClose,
  semesterLabel,
  lecturers,
  departments,
  faculties,
  onImport,
}: CourseSectionImportDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportCourseSectionRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<CourseSectionImportResponse | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [downloadingUnidentified, setDownloadingUnidentified] = useState(false);
  const [unidentifiedError, setUnidentifiedError] = useState<string | null>(null);

  const reset = () => {
    if (inputRef.current) inputRef.current.value = '';
    setFileName('');
    setRows([]);
    setParseError(null);
    setRequestError(null);
    setResult(null);
    setUnidentifiedError(null);
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
      setRows(await parseCourseSectionImportFile(file));
    } catch (error) {
      setParseError(
        error instanceof CourseSectionImportFileError
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
      await downloadCourseSectionImportTemplate(
        buildLecturerLookupRows(lecturers, departments, faculties)
      );
    } catch {
      setTemplateError('Không thể tạo tệp mẫu. Hãy thử lại.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleDownloadUnidentified = async () => {
    if (!result || result.unidentifiedLecturers.length === 0) return;
    setDownloadingUnidentified(true);
    setUnidentifiedError(null);
    try {
      await downloadUnidentifiedLecturerFile(result.unidentifiedLecturers);
    } catch {
      setUnidentifiedError('Không thể tạo tệp giảng viên thiếu email. Hãy thử lại.');
    } finally {
      setDownloadingUnidentified(false);
    }
  };

  const failedItems = result?.items.filter((item) => !item.succeeded) ?? [];

  // Mười cột đúng thứ tự tệp gốc, để tệp dòng lỗi nạp lại được thẳng vào đây.
  const rowValues = (row: ImportCourseSectionRow) => [
    row.courseCode,
    row.courseName,
    row.sectionName,
    row.credits,
    row.classSize,
    row.departmentName,
    row.facultyName,
    row.lecturerFullName,
    row.lecturerEmail,
    row.departmentCode,
  ];

  const invalidRows = rows.filter(
    (row) => row.courseCode.length === 0 || row.sectionName.length === 0
  );

  const exportInvalidRows = () =>
    downloadCourseSectionFailedRows(
      invalidRows.map((row) => ({
        rowNumber: row.rowNumber,
        values: rowValues(row),
        reason:
          row.courseCode.length === 0 && row.sectionName.length === 0
            ? 'Thiếu Mã HP và Nhóm'
            : row.courseCode.length === 0
              ? 'Thiếu Mã HP'
              : 'Thiếu Nhóm',
      }))
    );

  const exportFailedItems = () => {
    const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]));

    return downloadCourseSectionFailedRows(
      failedItems.map((item) => {
        const row = rowByNumber.get(item.rowNumber);
        return {
          rowNumber: item.rowNumber,
          values: row ? rowValues(row) : ['', '', '', '', '', '', '', '', '', ''],
          reason: catalogErrorMessage(item.errorCode),
        };
      })
    );
  };

  const unidentifiedLecturers = result?.unidentifiedLecturers ?? [];
  // Các dòng trong tệp xuất ra được xếp liền nhau theo bộ môn.
  const unidentifiedDepartmentCount = new Set(
    unidentifiedLecturers.map((lecturer) => lecturer.departmentName ?? 'Chưa rõ bộ môn')
  ).size;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import lớp học phần từ Excel">
      <div className="admin-import-dialog" aria-busy={parsing}>
        <div className="admin-form-intro">
          <FileSpreadsheet aria-hidden="true" />
          <p>
            Hàng đầu tiên cần có cột <strong>Mã HP</strong> và <strong>Nhóm</strong>. Học phần chưa
            có trong danh mục sẽ được <strong>tạo tự động</strong> từ cột Học phần và TCHT. Giảng
            viên tra theo <strong>Email</strong>: chưa có thì tạo mới với chức vụ Giảng viên, bỏ
            trống email thì lớp vẫn được tạo nhưng để trống mã giảng viên. Bộ môn tra theo{' '}
            <strong>Mã BM</strong>, trống mới tra theo tên.
          </p>
        </div>

        <div className="catalog-context-band">
          Import vào học kỳ: <strong>{semesterLabel}</strong>
        </div>

        {!result && (
          <>
            <div className="import-template-row">
              <span>
                Chưa có tệp đúng định dạng? Tải tệp mẫu rồi điền dữ liệu vào; sheet{' '}
                <strong>Danh sách giảng viên</strong> có sẵn họ tên, bộ môn, khoa/viện và email.
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
                  <strong>{rows.length} lớp học phần sẵn sàng import</strong>
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
                        <th>Mã HP</th>
                        <th>Học phần</th>
                        <th>Nhóm</th>
                        <th>Sĩ số</th>
                        <th>Bộ môn</th>
                        <th>Giảng viên</th>
                        <th>Email</th>
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
                          <td>{row.courseName || '—'}</td>
                          <td>
                            {row.sectionName || (
                              <span className="admin-import-invalid">Thiếu nhóm</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>{row.classSize || '0'}</td>
                          <td>{row.departmentCode || row.departmentName || '—'}</td>
                          <td>{row.lecturerFullName || '—'}</td>
                          <td>
                            {row.lecturerEmail || (
                              <span className="admin-import-default">Chưa xác định</span>
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
                  {result.createdCount} đã thêm, {result.skippedCount} bị bỏ qua
                  {result.updatedSectionCount > 0 &&
                    `, ${result.updatedSectionCount} lớp được cập nhật giảng viên`}
                </span>
              </div>
            </div>

            {(result.createdCourseCount > 0 || result.createdLecturerCount > 0) && (
              <div className="admin-alert" role="status">
                <CircleAlert aria-hidden="true" />
                <span>
                  Đã tạo tự động {result.createdCourseCount} học phần và{' '}
                  {result.createdLecturerCount} giảng viên chưa có trong danh mục.
                </span>
              </div>
            )}

            {unidentifiedLecturers.length > 0 && (
              <section className="admin-import-unidentified">
                <div className="admin-alert admin-alert--warning" role="status">
                  <CircleAlert aria-hidden="true" />
                  <span>
                    <strong>{unidentifiedLecturers.length} giảng viên thiếu email</strong> nên chưa
                    gắn được vào hệ thống, thuộc {unidentifiedDepartmentCount} bộ môn. Lớp học phần
                    vẫn được tạo nhưng để trống mã giảng viên. Tải tệp dưới đây rồi gửi cho trưởng
                    bộ môn bổ sung email, sau đó import lại tệp lớp học phần.
                  </span>
                </div>

                <div className="import-template-row">
                  <span>
                    Tệp có đúng 10 cột của tệp import, xếp theo {unidentifiedDepartmentCount} bộ
                    môn. Điền cột Email rồi nộp lại thẳng vào chức năng Import này.
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void handleDownloadUnidentified()}
                    disabled={downloadingUnidentified}
                  >
                    {downloadingUnidentified ? (
                      <LoaderCircle className="auth-spin" aria-hidden="true" />
                    ) : (
                      <Download aria-hidden="true" />
                    )}
                    {downloadingUnidentified
                      ? 'Đang tạo tệp...'
                      : 'Tải file giảng viên thiếu email'}
                  </button>
                </div>

                {unidentifiedError && (
                  <div className="admin-alert" role="alert">
                    <CircleAlert aria-hidden="true" />
                    <span>{unidentifiedError}</span>
                  </div>
                )}

                <div className="admin-import-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Dòng</th>
                        <th>Họ và tên</th>
                        <th>Bộ môn</th>
                        <th>Khoa</th>
                        <th>Mã HP</th>
                        <th>Nhóm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unidentifiedLecturers.map((lecturer) => (
                        <tr key={`${lecturer.rowNumber}-${lecturer.fullName}`}>
                          <td style={{ textAlign: 'right' }}>{lecturer.rowNumber}</td>
                          <td>{lecturer.fullName}</td>
                          <td>{lecturer.departmentName || '—'}</td>
                          <td>{lecturer.facultyName || '—'}</td>
                          <td>{lecturer.courseCode}</td>
                          <td>{lecturer.sectionName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <ExportFailedRowsButton count={failedItems.length} onExport={exportFailedItems} />

            {failedItems.length > 0 && (
              <div className="admin-import-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Dòng</th>
                      <th>Tên lớp</th>
                      <th>Mã học phần</th>
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
                {importing ? 'Đang lưu...' : `Import ${rows.length || ''} lớp học phần`}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
