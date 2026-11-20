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
import { apiErrorMessage } from '../services/apiClient';
import { catalogApi, catalogErrorMessage, type CourseSectionImportPreviewResponse, type CourseSectionImportResponse } from '../services/catalogApi';
import { buildLecturerLookupRows } from '../utils/importLookupRows';
import { courseSectionFailureReason } from '../utils/courseSectionImportReasons';
import type { Department, Faculty, Lecturer } from '../types';
import { ExportFailedRowsButton } from './ExportFailedRowsButton';
import { ImportSheetPicker } from './ImportSheetPicker';
import { Modal } from './Modal';
import { ImportConfirmation } from './ImportConfirmation';

interface CourseSectionImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Học kỳ đang chọn, hiển thị để người dùng biết import vào đâu. */
  semesterLabel: string;
  semesterId: number | null;
  /** Dựng sheet tra cứu giảng viên trong tệp mẫu. */
  lecturers: Lecturer[];
  departments: Department[];
  faculties: Faculty[];
  onImport: (rows: ImportCourseSectionRow[], previewToken: string) => Promise<CourseSectionImportResponse>;
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
  semesterId,
  lecturers,
  departments,
  faculties,
  onImport,
}: CourseSectionImportDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  // Giữ tệp để đọc lại khi người dùng đổi sheet.
  const [file, setFile] = useState<File | null>(null);
  const [sheetInfo, setSheetInfo] = useState<{
    sheetName: string;
    sheetNames: string[];
    usableSheetNames: string[];
  } | null>(null);
  const [rows, setRows] = useState<ImportCourseSectionRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<CourseSectionImportResponse | null>(null);
  const [preview, setPreview] = useState<CourseSectionImportPreviewResponse | null>(null);
  const [checking, setChecking] = useState(false);
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
    setFile(null);
    setSheetInfo(null);
    setRows([]);
    setParseError(null);
    setRequestError(null);
    setResult(null);
    setPreview(null);
    setUnidentifiedError(null);
  };

  const handleClose = () => {
    if (parsing || checking || importing) return;
    reset();
    onClose();
  };

  /** Đọc tệp; `sheetName` bỏ trống thì tự chọn sheet có đủ cột Mã HP / Nhóm. */
  const readFile = async (source: File, sheetName?: string) => {
    setParsing(true);
    setParseError(null);
    setRows([]);
    setPreview(null);
    try {
      const parsed = await parseCourseSectionImportFile(source, sheetName);
      setRows(parsed.rows);
      setSheetInfo({
        sheetName: parsed.sheetName,
        sheetNames: parsed.sheetNames,
        usableSheetNames: parsed.usableSheetNames,
      });
    } catch (error) {
      setParseError(
        error instanceof CourseSectionImportFileError
          ? fileErrorMessages[error.code]
          : fileErrorMessages.READ_FAILED
      );
      // Sheet chọn tay không đọc được: vẫn giữ tên sheet để ô chọn hiện đúng.
      if (sheetName) {
        setSheetInfo((previous) => (previous ? { ...previous, sheetName } : previous));
      }
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

  const handlePreview = async () => {
    if (rows.length === 0 || semesterId === null) return false;
    setChecking(true);
    setPreview(null);
    setRequestError(null);
    try {
      setPreview(await catalogApi.previewCourseSections(semesterId, rows));
      return true;
    } catch (error) {
      setRequestError(apiErrorMessage(error, catalogErrorMessage));
      return false;
    } finally {
      setChecking(false);
    }
  };

  const handleImport = async () => {
    if (rows.length === 0 || !preview || preview.result.createdCount === 0) return;
    setImporting(true);
    setRequestError(null);
    try {
      setResult(await onImport(rows, preview.previewToken));
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
      await downloadCourseSectionImportTemplate(
        buildLecturerLookupRows(lecturers, departments, faculties),
        departments,
        faculties,
      );
    } catch {
      setTemplateError('Không thể tạo tệp mẫu. Hãy thử lại.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleDownloadUnidentified = async () => {
    if (!activeReport || activeReport.unidentifiedLecturers.length === 0) return;
    setDownloadingUnidentified(true);
    setUnidentifiedError(null);
    try {
      await downloadUnidentifiedLecturerFile(activeReport.unidentifiedLecturers);
    } catch {
      setUnidentifiedError('Không thể tạo tệp giảng viên thiếu email. Hãy thử lại.');
    } finally {
      setDownloadingUnidentified(false);
    }
  };

  const activeReport = result ?? preview?.result ?? null;
  const failedItems = activeReport?.items.filter((item) => !item.succeeded) ?? [];
  const failedByRow = new Map(failedItems.map(item => [item.rowNumber, item]));

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

  // Lý do cụ thể của từng dòng bị bỏ qua: nêu giá trị gây lỗi và gợi ý giá trị đúng.
  const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]));
  const reasonContext = { rows, departments, faculties };
  const reasonOf = (item: { rowNumber: number; errorCode?: string | null }) =>
    courseSectionFailureReason(item.errorCode, rowByNumber.get(item.rowNumber), reasonContext);

  const exportFailedItems = () =>
    downloadCourseSectionFailedRows(
      failedItems.map((item) => {
        const row = rowByNumber.get(item.rowNumber);
        return {
          rowNumber: item.rowNumber,
          values: row ? rowValues(row) : ['', '', '', '', '', '', '', '', '', ''],
          reason: reasonOf(item),
        };
      })
    );

  const unidentifiedLecturers = activeReport?.unidentifiedLecturers ?? [];
  const unidentifiedRowNumbers = new Set(unidentifiedLecturers.map(lecturer => lecturer.rowNumber));
  // Các dòng trong tệp xuất ra được xếp liền nhau theo bộ môn.
  const unidentifiedDepartmentCount = new Set(
    unidentifiedLecturers.map((lecturer) => lecturer.departmentName ?? 'Chưa rõ bộ môn')
  ).size;

  return (
    <Modal stepFlow isOpen={isOpen} onClose={handleClose} title="Import lớp học phần từ Excel">
      <div className="admin-import-dialog" aria-busy={parsing || checking || importing}>
        <div className="admin-form-intro">
          <FileSpreadsheet aria-hidden="true" />
          <p>
            Hàng đầu tiên cần có cột <strong>Mã HP</strong> và <strong>Nhóm</strong>. Học phần chưa
            có trong danh mục sẽ được <strong>tạo tự động</strong> từ cột Học phần và TCHT. Giảng
            viên tra theo <strong>Email</strong>: chưa có thì tạo mới với chức vụ Giảng viên, bỏ
            trống email thì lớp vẫn được tạo nhưng để trống mã giảng viên. Bộ môn tra theo{' '}
            <strong>Mã BM</strong> trong sheet Danh mục bộ môn của file mẫu. Nếu bỏ trống mã,
            dùng đúng tên bộ môn trong danh mục. Cột <strong>Khoa</strong> nhận mã hoặc tên
            khoa / viện trong file mẫu.
            {' '}Email của giảng viên đã xóa sẽ tự khôi phục hồ sơ và tài khoản cũ.
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
                disabled={parsing || checking || importing}
                onChange={(event) => void handleFileChange(event.target.files?.[0])}
              />
            </label>

            <ImportSheetPicker
              choice={sheetInfo}
              disabled={parsing || checking || importing}
              requiredColumnsLabel="Mã HP / Nhóm"
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
                  Đã tạo tự động {result.createdCourseCount} học phần; thêm hoặc khôi phục{' '}
                  {result.createdLecturerCount} giảng viên.
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
                disabled={parsing || checking || importing}
              >
                Hủy
              </button>
              <ImportConfirmation
                rows={rows}
                fileName={fileName}
                sheetName={sheetInfo?.sheetName}
                destination={semesterLabel}
                onPrepare={handlePreview}
                confirmDisabled={!preview || preview.result.createdCount === 0}
                confirmText={`Xác nhận lưu ${(preview?.result.createdCount ?? 0).toLocaleString('vi-VN')} dòng hợp lệ`}
                reviewSummary={preview && (
                  <section className="course-section-import-check" aria-label="Kết quả kiểm tra trước khi lưu">
                    <strong>Đã kiểm tra {preview.result.totalCount.toLocaleString('vi-VN')} dòng — chưa lưu dữ liệu.</strong>
                    <span>
                      {preview.result.createdCount - preview.result.updatedSectionCount} lớp sẽ thêm ·{' '}
                      {preview.result.updatedSectionCount} lớp sẽ bổ sung giảng viên ·{' '}
                      {preview.result.skippedCount} dòng bị từ chối.
                    </span>
                    {(preview.result.createdCourseCount > 0 || preview.result.createdLecturerCount > 0) && (
                      <span>Sẽ tạo {preview.result.createdCourseCount} học phần; tạo hoặc khôi phục {preview.result.createdLecturerCount} giảng viên.</span>
                    )}
                    {unidentifiedLecturers.length > 0 && (
                      <span className="admin-import-invalid">
                        {unidentifiedLecturers.length} dòng thiếu email, thuộc {unidentifiedDepartmentCount} bộ môn: nếu xác nhận, lớp vẫn được lưu nhưng chưa gắn giảng viên.
                      </span>
                    )}
                    {preview.result.createdCount === 0 && <span role="alert">Không có dòng hợp lệ để lưu. Hãy sửa file và kiểm tra lại.</span>}
                    <div className="course-section-import-check-actions">
                      <ExportFailedRowsButton count={failedItems.length} onExport={exportFailedItems} />
                      {unidentifiedLecturers.length > 0 && (
                        <button type="button" className="btn btn-secondary btn-sm" disabled={downloadingUnidentified}
                          onClick={() => void handleDownloadUnidentified()}>
                          <Download aria-hidden="true" />Tải file giảng viên thiếu email
                        </button>
                      )}
                      {unidentifiedError && <span role="alert">{unidentifiedError}</span>}
                    </div>
                  </section>
                )}
                rowFilters={[
                  { key: 'all', label: `Tất cả (${rows.length})`, matches: () => true },
                  { key: 'valid', label: `Hợp lệ (${preview?.result.createdCount ?? 0})`, matches: row => !failedByRow.has(row.rowNumber) },
                  { key: 'invalid', label: `Bị từ chối (${failedItems.length})`, matches: row => failedByRow.has(row.rowNumber) },
                  { key: 'missingEmail', label: `Thiếu email (${unidentifiedLecturers.length})`, matches: row => unidentifiedRowNumbers.has(row.rowNumber) },
                ]}
                rowStatus={row => {
                  const failed = failedByRow.get(row.rowNumber);
                  return failed ? <span className="admin-import-invalid">{reasonOf(failed)}</span>
                    : unidentifiedRowNumbers.has(row.rowNumber) ? 'Hợp lệ · chưa gắn giảng viên (thiếu email)' : 'Hợp lệ';
                }}
                description="Học phần chưa có sẽ được tạo mới. Email giảng viên chưa có sẽ tạo hồ sơ và tài khoản; email đã xóa sẽ khôi phục hồ sơ cũ. Lớp đã có nhưng chưa gắn giảng viên có thể được bổ sung giảng viên. Dòng thiếu email vẫn có thể tạo lớp với giảng viên chưa xác định."
                columns={[
                  { key: 'courseCode', label: 'Mã học phần' },
                  { key: 'courseName', label: 'Tên học phần' },
                  { key: 'sectionName', label: 'Nhóm' },
                  { key: 'credits', label: 'Tín chỉ' },
                  { key: 'classSize', label: 'Sĩ số' },
                  { key: 'departmentCode', label: 'Mã BM' },
                  { key: 'departmentName', label: 'Bộ môn' },
                  { key: 'facultyName', label: 'Khoa / viện' },
                  { key: 'lecturerFullName', label: 'Giảng viên' },
                  { key: 'lecturerEmail', label: 'Email' },
                ]}
                disabled={rows.length === 0 || semesterId === null || parsing || importing}
                onConfirm={handleImport}
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
