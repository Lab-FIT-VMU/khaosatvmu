import { useId, useRef, useState } from 'react';
import { CircleAlert, Download, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import {
  downloadSurveyTemplateFailedRows,
  downloadSurveyTemplateImportTemplate,
  parseSurveyTemplateImportFile,
  SurveyTemplateImportFileError,
  type ImportSurveyQuestionRow,
  type InvalidAttentionCheckRow,
  type InvalidScaleCodeRow,
  type InvalidSectionRow,
  type SurveyTemplateImportFileErrorCode,
} from '../utils/surveyTemplateImportExcel';
import type { SaveSurveyTemplatePayload } from '../services/surveyApi';
import { maximumSectionsPerTemplate } from '../types';
import type { AnswerScale } from '../types';
import { ExportFailedRowsButton } from './ExportFailedRowsButton';
import { Modal } from './Modal';
import '../styles/auth-admin.css';

interface SurveyTemplateImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  answerScales: AnswerScale[];
  /** Tạo bộ câu hỏi qua API. Trả về thông báo lỗi, null nếu thành công. */
  onImport: (draft: SaveSurveyTemplatePayload) => Promise<string | null>;
}

const fileErrorMessages: Record<SurveyTemplateImportFileErrorCode, string> = {
  FILE_TYPE: 'Chỉ chấp nhận tệp Excel có định dạng .xlsx.',
  FILE_SIZE: 'Tệp Excel không được lớn hơn 5 MB.',
  FILE_EMPTY: 'Tệp Excel không có dữ liệu.',
  SECTION_HEADER_MISSING: 'Không tìm thấy cột "Mục" trong hàng tiêu đề.',
  QUESTION_HEADER_MISSING: 'Không tìm thấy cột "Câu hỏi" trong hàng tiêu đề.',
  SCALE_HEADER_MISSING: 'Không tìm thấy cột "Mã thang trả lời" trong hàng tiêu đề.',
  NO_DATA_ROWS: 'Tệp Excel chưa có câu hỏi nào.',
  TOO_MANY_SECTIONS: `Mỗi bộ câu hỏi chỉ được tối đa ${maximumSectionsPerTemplate} mục.`,
  READ_FAILED: 'Không thể đọc tệp Excel. Hãy kiểm tra tệp không bị hỏng hoặc đặt mật khẩu.',
};

export function SurveyTemplateImportDialog({
  isOpen,
  onClose,
  answerScales,
  onImport,
}: SurveyTemplateImportDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [templateName, setTemplateName] = useState('');
  const [fileName, setFileName] = useState('');
  const [sections, setSections] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportSurveyQuestionRow[]>([]);
  const [invalidSectionRows, setInvalidSectionRows] = useState<InvalidSectionRow[]>([]);
  const [invalidScaleRows, setInvalidScaleRows] = useState<InvalidScaleCodeRow[]>([]);
  const [invalidTrapRows, setInvalidTrapRows] = useState<InvalidAttentionCheckRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetFile = () => {
    if (inputRef.current) inputRef.current.value = '';
    setFileName('');
    setSections([]);
    setRows([]);
    setInvalidSectionRows([]);
    setInvalidScaleRows([]);
    setInvalidTrapRows([]);
    setParseError(null);
    setFormError(null);
  };

  const handleClose = () => {
    if (parsing || saving) return;
    resetFile();
    setTemplateName('');
    onClose();
  };

  const handleFileChange = async (file?: File) => {
    resetFile();
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    try {
      const result = await parseSurveyTemplateImportFile(file, answerScales);
      setSections(result.sections);
      setRows(result.rows);
      setInvalidSectionRows(result.invalidSectionRows);
      setInvalidScaleRows(result.invalidScaleRows);
      setInvalidTrapRows(result.invalidAttentionCheckRows);
      // Chưa đặt tên bộ thì lấy tạm tên tệp cho đỡ phải gõ lại.
      if (!templateName.trim()) setTemplateName(file.name.replace(/\.xlsx$/i, ''));
    } catch (error) {
      setParseError(
        error instanceof SurveyTemplateImportFileError
          ? fileErrorMessages[error.code]
          : fileErrorMessages.READ_FAILED
      );
    } finally {
      setParsing(false);
    }
  };

  /**
   * Ba loại lỗi của một tệp bộ câu hỏi gộp chung vào một tệp xuất ra: người sửa
   * chỉ cần mở đúng một tệp thay vì đối chiếu ba bảng trên màn hình.
   */
  const exportFailedRows = () =>
    downloadSurveyTemplateFailedRows([
      ...invalidSectionRows.map((row) => ({
        rowNumber: row.rowNumber,
        values: [row.sectionName, row.questionText, '', ''],
        reason:
          row.reason === 'MISSING'
            ? 'Chưa điền tên mục (nếu đang gộp ô cột Mục thì bỏ gộp và lặp lại tên mục ở từng dòng)'
            : 'Mục này đã kết thúc ở phía trên; gom các câu cùng mục lại liền nhau',
      })),
      ...invalidScaleRows.map((row) => ({
        rowNumber: row.rowNumber,
        values: ['', row.questionText, row.rawCode, ''],
        reason: 'Mã thang trả lời không có trong hệ thống',
      })),
      ...invalidTrapRows.map((row) => ({
        rowNumber: row.rowNumber,
        values: ['', row.questionText, '', row.rawValue],
        reason:
          row.reason === 'TEXT_SCALE'
            ? 'Câu này dùng thang tự nhập chữ, không có mức nào để chọn'
            : 'Mức này không có trong thang trả lời của câu',
      })),
    ].sort((left, right) => left.rowNumber - right.rowNumber));

  const failedRowCount =
    invalidSectionRows.length + invalidScaleRows.length + invalidTrapRows.length;

  const handleImport = async () => {
    if (rows.length === 0) return;
    if (!templateName.trim()) {
      setFormError('Vui lòng nhập tên bộ câu hỏi.');
      return;
    }
    // Bỏ qua một phần câu hỏi thì bộ sẽ thiếu, bắt sửa tệp rồi tải lại.
    if (invalidSectionRows.length > 0) {
      setFormError('Vui lòng sửa các dòng có vấn đề ở cột Mục rồi chọn lại tệp.');
      return;
    }
    if (invalidScaleRows.length > 0) {
      setFormError('Vui lòng sửa các dòng có mã thang trả lời sai rồi chọn lại tệp.');
      return;
    }
    if (invalidTrapRows.length > 0) {
      setFormError('Vui lòng sửa các dòng có mức bắt buộc của câu bẫy không hợp lệ rồi chọn lại tệp.');
      return;
    }

    setSaving(true);
    const message = await onImport({
      templateName: templateName.trim(),
      // Bộ mới hoàn toàn nên mọi mục đều chưa có mã.
      sections: sections.map((sectionName) => ({ sectionId: null, sectionName })),
      questions: rows.map((row) => ({
        questionText: row.questionText,
        answerScaleId: row.answerScaleId,
        attentionCheckValue: row.attentionCheckValue,
        sectionIndex: row.sectionIndex,
      })),
    });
    setSaving(false);

    if (message) {
      setFormError(message);
      return;
    }
    handleClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Tạo bộ câu hỏi từ Excel">
      <div className="admin-import-dialog" aria-busy={parsing || saving}>
        <div className="admin-form-intro">
          <FileSpreadsheet aria-hidden="true" />
          <p>
            Hàng đầu tiên cần có cột <strong>Mục</strong>, <strong>Câu hỏi</strong> và{' '}
            <strong>Mã thang trả lời</strong>; thêm cột{' '}
            <strong>Đáp án bắt buộc phải chọn</strong> nếu bộ có câu bẫy. Cột Mục phải điền ở{' '}
            <strong>mọi dòng, kể cả dòng câu bẫy</strong> — lặp lại tên mục chứ{' '}
            <strong>không gộp ô</strong>, vì ô gộp chỉ đọc ra được dòng trên cùng. Các câu cùng
            một mục phải nằm liền nhau. Tối đa {maximumSectionsPerTemplate} mục, số câu không
            giới hạn.
          </p>
        </div>

        <div className="import-template-row">
          <span>
            Tệp mẫu có sheet <strong>Danh sách thang trả lời</strong> liệt kê mã và các đáp án của
            từng thang đang dùng.
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={answerScales.length === 0}
            onClick={() => void downloadSurveyTemplateImportTemplate(answerScales)}
          >
            <Download aria-hidden="true" />
            Tải file mẫu
          </button>
        </div>

        {answerScales.length === 0 && (
          <div className="admin-alert" role="alert">
            <CircleAlert aria-hidden="true" />
            <span>Chưa có thang trả lời nào. Hãy tạo thang trả lời trước khi import.</span>
          </div>
        )}

        {answerScales.length > 0 && (
          <section className="admin-import-preview" aria-label="Mã thang trả lời của hệ thống">
            <header>
              <strong>Mã thang trả lời đang dùng</strong>
              <span>Điền đúng mã này vào cột "Mã thang trả lời"</span>
            </header>
            <div className="admin-import-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Thang trả lời</th>
                    <th>Loại</th>
                  </tr>
                </thead>
                <tbody>
                  {answerScales.map((scale) => (
                    <tr key={scale.answerScaleId}>
                      <td>{scale.answerScaleId}</td>
                      <td>{scale.answerScaleName}</td>
                      <td>
                        {scale.scaleKind === 'Text'
                          ? 'Tự nhập chữ'
                          : `${scale.options.length} mức chọn`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="survey-template-import-fields">
          <div className="form-group">
            <label htmlFor={`${inputId}-name`}>Tên bộ câu hỏi</label>
            <input
              id={`${inputId}-name`}
              type="text"
              placeholder="VD: Khảo sát học phần học kỳ I"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              required
            />
          </div>
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
            disabled={parsing || saving || answerScales.length === 0}
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

        <ExportFailedRowsButton count={failedRowCount} onExport={exportFailedRows} />

        {invalidSectionRows.length > 0 && (
          <section className="admin-import-preview" aria-label="Dòng có vấn đề ở cột Mục">
            <header>
              <strong>{invalidSectionRows.length} dòng có vấn đề ở cột Mục</strong>
              <span>Sửa lại tệp rồi chọn lại</span>
            </header>
            <div className="admin-import-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dòng</th>
                    <th>Nội dung câu hỏi</th>
                    <th>Mục đã điền</th>
                    <th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidSectionRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.questionText}</td>
                      <td>{row.sectionName || '(trống)'}</td>
                      <td>
                        {row.reason === 'MISSING'
                          ? 'Chưa điền tên mục. Nếu đang gộp ô ở cột Mục thì bỏ gộp và lặp lại tên mục ở từng dòng.'
                          : 'Mục này đã kết thúc ở phía trên rồi. Gom các câu cùng mục lại liền nhau.'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {invalidScaleRows.length > 0 && (
          <section className="admin-import-preview" aria-label="Dòng có mã thang trả lời sai">
            <header>
              <strong>{invalidScaleRows.length} dòng có mã thang trả lời sai</strong>
              <span>Sửa lại tệp rồi chọn lại</span>
            </header>
            <div className="admin-import-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dòng</th>
                    <th>Nội dung câu hỏi</th>
                    <th>Mã đã điền</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidScaleRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.questionText}</td>
                      <td>{row.rawCode || '(trống)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {invalidTrapRows.length > 0 && (
          <section className="admin-import-preview" aria-label="Dòng có câu bẫy không hợp lệ">
            <header>
              <strong>{invalidTrapRows.length} dòng có mức bắt buộc không hợp lệ</strong>
              <span>Sửa lại tệp rồi chọn lại</span>
            </header>
            <div className="admin-import-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dòng</th>
                    <th>Nội dung câu hỏi</th>
                    <th>Mức đã điền</th>
                    <th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidTrapRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.questionText}</td>
                      <td>{row.rawValue || '(trống)'}</td>
                      <td>
                        {row.reason === 'TEXT_SCALE'
                          ? 'Câu này dùng thang tự nhập chữ, không có mức nào để chọn'
                          : 'Mức này không có trong thang trả lời của câu'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {rows.length > 0 && (
          <section className="admin-import-preview" aria-label="Xem trước câu hỏi">
            <header>
              <strong>
                {rows.length} câu hỏi trong {sections.length} mục
              </strong>
              <span>Hiển thị toàn bộ danh sách</span>
            </header>
            <div className="admin-import-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dòng</th>
                    <th>Mục</th>
                    <th>Nội dung câu hỏi</th>
                    <th>Thang trả lời</th>
                    <th>Câu bẫy</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.sectionName}</td>
                      <td>{row.questionText}</td>
                      <td>{row.answerScaleName}</td>
                      <td>
                        {row.attentionCheckValue === null
                          ? '—'
                          : `Phải chọn mức ${row.attentionCheckValue}`}
                      </td>
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
            disabled={
              rows.length === 0
              || invalidSectionRows.length > 0
              || invalidScaleRows.length > 0
              || invalidTrapRows.length > 0
              || parsing
              || saving
            }
          >
            {saving ? (
              <LoaderCircle className="auth-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {saving ? 'Đang lưu...' : `Tạo bộ ${rows.length || ''} câu hỏi`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
