import { useId, useRef, useState } from 'react';
import { CircleAlert, Download, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import {
  downloadProfileFailedRows,
  downloadProfileImportTemplate,
  parseProfileImportFile,
  ProfileImportFileError,
  type ImportProfileRow,
  type InvalidRoleRow,
  type ProfileImportFileErrorCode,
} from '../utils/profileImportExcel';
import { ExportFailedRowsButton } from './ExportFailedRowsButton';
import { Modal } from './Modal';
import '../styles/auth-admin.css';

interface ProfileImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Gửi các dòng lên API. Trả về thông báo lỗi, null nếu thành công. */
  onImport: (rows: ImportProfileRow[]) => Promise<string | null>;
}

const fileErrorMessages: Record<ProfileImportFileErrorCode, string> = {
  FILE_TYPE: 'Chỉ chấp nhận tệp Excel có định dạng .xlsx.',
  FILE_SIZE: 'Tệp Excel không được lớn hơn 5 MB.',
  FILE_EMPTY: 'Tệp Excel không có dữ liệu.',
  EMAIL_HEADER_MISSING: 'Không tìm thấy cột "Email giảng viên" trong hàng tiêu đề.',
  ROLE_HEADER_MISSING: 'Không tìm thấy cột "Vai trò" trong hàng tiêu đề.',
  NO_DATA_ROWS: 'Tệp Excel chưa có dòng nào có email.',
  READ_FAILED: 'Không thể đọc tệp Excel. Hãy kiểm tra tệp không bị hỏng hoặc đặt mật khẩu.',
};

export function ProfileImportDialog({ isOpen, onClose, onImport }: ProfileImportDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportProfileRow[]>([]);
  const [invalidRoleRows, setInvalidRoleRows] = useState<InvalidRoleRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetFile = () => {
    if (inputRef.current) inputRef.current.value = '';
    setFileName('');
    setRows([]);
    setInvalidRoleRows([]);
    setParseError(null);
    setFormError(null);
  };

  const exportInvalidRoleRows = () =>
    downloadProfileFailedRows(
      invalidRoleRows.map((row) => ({
        rowNumber: row.rowNumber,
        // Tệp đọc lên không giữ họ tên của dòng sai vai trò, nên để trống cột đó.
        values: ['', row.email, row.rawRole],
        reason: row.rawRole
          ? 'Vai trò không nằm trong danh sách vai trò điền được'
          : 'Chưa điền vai trò',
      }))
    );

  const handleClose = () => {
    if (parsing || saving) return;
    resetFile();
    onClose();
  };

  const handleFileChange = async (file?: File) => {
    resetFile();
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    try {
      const result = await parseProfileImportFile(file);
      setRows(result.rows);
      setInvalidRoleRows(result.invalidRoleRows);
    } catch (error) {
      setParseError(
        error instanceof ProfileImportFileError
          ? fileErrorMessages[error.code]
          : fileErrorMessages.READ_FAILED
      );
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    // Bỏ qua dòng sai thì cấp thiếu người mà không ai biết; bắt sửa tệp rồi tải lại.
    if (invalidRoleRows.length > 0) {
      setFormError('Vui lòng sửa các dòng có vai trò không hợp lệ rồi chọn lại tệp.');
      return;
    }

    setSaving(true);
    const message = await onImport(rows);
    setSaving(false);

    if (message) {
      setFormError(message);
      return;
    }
    handleClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Cấp hồ sơ từ Excel">
      <div className="admin-import-dialog" aria-busy={parsing || saving}>
        <div className="admin-form-intro">
          <FileSpreadsheet aria-hidden="true" />
          <p>
            Hàng đầu tiên cần có cột <strong>Email giảng viên</strong> và cột{' '}
            <strong>Vai trò</strong>. Hệ thống khớp tài khoản bằng email, cột Họ tên chỉ để
            đối chiếu cho khỏi nhầm người. Tên và mã hồ sơ do vai trò quyết định nên không
            cần điền.
          </p>
        </div>

        <div className="import-template-row">
          <span>Tệp mẫu có sẵn bảng tra tên vai trò cần điền.</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void downloadProfileImportTemplate()}
          >
            <Download aria-hidden="true" />
            Tải file mẫu
          </button>
        </div>

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
            disabled={parsing || saving}
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

        {formError && (
          <div className="admin-alert" role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}

        {invalidRoleRows.length > 0 && (
          <section className="admin-import-preview" aria-label="Dòng có vai trò sai">
            <header>
              <strong>{invalidRoleRows.length} dòng có vai trò không hợp lệ</strong>
              <span>Sửa lại tệp rồi chọn lại</span>
            </header>
            <ExportFailedRowsButton count={invalidRoleRows.length} onExport={exportInvalidRoleRows} />
            <div className="admin-import-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dòng</th>
                    <th>Email</th>
                    <th>Vai trò đã điền</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidRoleRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td style={{ textAlign: 'right' }}>{row.rowNumber}</td>
                      <td>{row.email}</td>
                      <td>{row.rawRole || '(trống)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {rows.length > 0 && (
          <section className="admin-import-preview" aria-label="Xem trước hồ sơ">
            <header>
              <strong>{rows.length} hồ sơ sẵn sàng</strong>
              <span>Hiển thị toàn bộ danh sách</span>
            </header>
            <div className="admin-import-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dòng</th>
                    <th>Họ tên</th>
                    <th>Email</th>
                    <th>Vai trò</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td style={{ textAlign: 'right' }}>{row.rowNumber}</td>
                      <td>{row.fullName || '—'}</td>
                      <td>{row.email}</td>
                      <td>{row.roleLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="modal-footer admin-inline-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            disabled={parsing || saving}
          >
            Hủy
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleImport()}
            disabled={rows.length === 0 || invalidRoleRows.length > 0 || parsing || saving}
          >
            {saving ? (
              <LoaderCircle className="auth-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {saving ? 'Đang cấp hồ sơ...' : `Cấp ${rows.length || ''} hồ sơ`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
