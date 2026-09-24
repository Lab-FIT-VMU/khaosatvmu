import { useId, useRef, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { ApiError } from '../services/apiClient';
import type { AdminUserImportResult, ImportAdminUserRow } from '../types';
import {
  parseUserImportFile,
  UserImportFileError,
  type UserImportFileErrorCode,
} from '../utils/userImportExcel';
import { Modal } from './Modal';

interface UserImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: AdminUserImportResult) => void | Promise<void>;
}

const fileErrorMessages: Record<UserImportFileErrorCode, string> = {
  FILE_TYPE: 'Chỉ chấp nhận tệp Excel có định dạng .xlsx.',
  FILE_SIZE: 'Tệp Excel không được lớn hơn 5 MB.',
  FILE_EMPTY: 'Tệp Excel không có dữ liệu.',
  EMAIL_HEADER_MISSING: 'Không tìm thấy cột Email trong hàng tiêu đề.',
  NO_DATA_ROWS: 'Tệp Excel chưa có dòng người dùng nào.',
  READ_FAILED: 'Không thể đọc tệp Excel. Hãy kiểm tra tệp không bị hỏng hoặc đặt mật khẩu.',
};

const importErrorMessages: Record<string, string> = {
  ADMIN_INVALID_REQUEST: 'Danh sách import không hợp lệ.',
  ADMIN_IMPORT_EMAIL_REQUIRED: 'Thiếu email',
  ADMIN_IMPORT_EMAIL_INVALID: 'Email không hợp lệ',
  ADMIN_IMPORT_DISPLAY_NAME_INVALID: 'Họ và tên vượt quá 200 ký tự',
  ADMIN_IMPORT_DUPLICATE_EMAIL: 'Email bị lặp trong tệp',
  ADMIN_USER_EMAIL_EXISTS: 'Email đã có trong hệ thống',
  AUTH_CSRF_INVALID: 'Phiên bảo mật đã thay đổi. Vui lòng thử lại.',
};

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return importErrorMessages[error.errorCode] ?? 'Không thể import danh sách người dùng.';
  }
  return 'Không thể kết nối tới máy chủ.';
}

export function UserImportDialog({ isOpen, onClose, onImported }: UserImportDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportAdminUserRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminUserImportResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

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
      setRows(await parseUserImportFile(file));
    } catch (error) {
      setParseError(error instanceof UserImportFileError
        ? fileErrorMessages[error.code]
        : fileErrorMessages.READ_FAILED);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;

    setImporting(true);
    setRequestError(null);
    try {
      const response = await adminApi.importUsers(rows);
      setResult(response);
      await onImported(response);
    } catch (error) {
      setRequestError(requestErrorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  const failedItems = result?.items.filter((item) => !item.succeeded) ?? [];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import người dùng từ Excel">
      <div className="admin-import-dialog" aria-busy={parsing || importing}>
        <div className="admin-form-intro">
          <FileSpreadsheet aria-hidden="true" />
          <p>Hàng đầu tiên cần có cột <strong>Email</strong>; cột <strong>Họ và tên</strong> là tùy chọn.</p>
        </div>

        {!result && (
          <>
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

            {rows.length > 0 && (
              <section className="admin-import-preview" aria-label="Xem trước dữ liệu import">
                <header>
                  <strong>{rows.length} người dùng sẵn sàng import</strong>
                  <span>Hiển thị toàn bộ danh sách</span>
                </header>
                <div className="admin-import-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Dòng</th>
                        <th>Email</th>
                        <th>Họ và tên</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.rowNumber}>
                          <td style={{ textAlign: 'right' }}>{row.rowNumber}</td>
                          <td>{row.email || <span className="admin-import-invalid">Thiếu email</span>}</td>
                          <td>{row.displayName || 'Không cung cấp'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {requestError && (
              <div className="admin-alert" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{requestError}</span>
              </div>
            )}
          </>
        )}

        {result && (
          <section className="admin-import-result" aria-live="polite">
            <div className={`admin-import-summary ${result.skippedCount > 0 ? 'has-warnings' : ''}`}>
              {result.skippedCount > 0
                ? <CircleAlert aria-hidden="true" />
                : <CheckCircle2 aria-hidden="true" />}
              <div>
                <strong>Hoàn tất import {result.totalCount} dòng</strong>
                <span>{result.createdCount} đã tạo, {result.skippedCount} bị bỏ qua</span>
              </div>
            </div>

            {failedItems.length > 0 && (
              <div className="admin-import-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Dòng</th>
                      <th>Email</th>
                      <th>Lý do bỏ qua</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedItems.map((item) => (
                      <tr key={`${item.rowNumber}-${item.email}`}>
                        <td style={{ textAlign: 'right' }}>{item.rowNumber}</td>
                        <td>{item.email || 'Không có'}</td>
                        <td>{importErrorMessages[item.errorCode ?? ''] ?? 'Dữ liệu không hợp lệ'}</td>
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
              <button type="button" className="btn btn-primary" onClick={handleClose}>Đóng</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={parsing || importing}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={() => void handleImport()} disabled={rows.length === 0 || parsing || importing}>
                {importing ? <LoaderCircle className="auth-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
                {importing ? 'Đang import...' : `Import ${rows.length || ''} người dùng`}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
