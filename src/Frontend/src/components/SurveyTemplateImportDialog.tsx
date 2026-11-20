import { useId, useMemo, useRef, useState } from 'react';
import { CircleAlert, Download, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import {
  attentionCheckOf,
  downloadSurveyTemplateFailedRows,
  downloadSurveyTemplateImportTemplate,
  parseSurveyTemplateImportFile,
  SurveyTemplateImportFileError,
  type ImportSurveyQuestionRow,
  type InvalidAttentionCheckRow,
  type InvalidSectionRow,
  type SurveyTemplateImportFileErrorCode,
} from '../utils/surveyTemplateImportExcel';
import type { SaveSurveyTemplatePayload } from '../services/surveyApi';
import { maximumSectionsPerTemplate } from '../types';
import type { AnswerScale } from '../types';
import { ExportFailedRowsButton } from './ExportFailedRowsButton';
import { Modal } from './Modal';
import { ImportConfirmation } from './ImportConfirmation';
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
  /** Thang của cả bộ. Chuỗi rỗng là chưa chọn; hệ thống chỉ có một thang thì lấy luôn. */
  const [chosenScaleId, setChosenScaleId] = useState('');
  const [fileName, setFileName] = useState('');
  const [sections, setSections] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportSurveyQuestionRow[]>([]);
  const [invalidSectionRows, setInvalidSectionRows] = useState<InvalidSectionRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const answerScaleId =
    chosenScaleId || (answerScales.length === 1 ? String(answerScales[0].answerScaleId) : '');
  const scale = answerScales.find((item) => String(item.answerScaleId) === answerScaleId);

  // Đối chiếu lại mỗi khi đổi thang: cùng một tệp, đổi sang thang Có/Không là câu bẫy
  // "chọn mức 3" thành sai ngay.
  const invalidTrapRows = useMemo<InvalidAttentionCheckRow[]>(
    () =>
      rows
        .filter((row) => attentionCheckOf(row, scale) === undefined)
        .map((row) => ({
          rowNumber: row.rowNumber,
          questionText: row.questionText,
          rawValue: row.rawAttention,
        })),
    [rows, scale]
  );

  const resetFile = () => {
    if (inputRef.current) inputRef.current.value = '';
    setFileName('');
    setSections([]);
    setRows([]);
    setInvalidSectionRows([]);
    setParseError(null);
    setFormError(null);
  };

  const handleClose = () => {
    if (parsing || saving) return;
    resetFile();
    setTemplateName('');
    setChosenScaleId('');
    onClose();
  };

  const handleFileChange = async (file?: File) => {
    resetFile();
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    try {
      const result = await parseSurveyTemplateImportFile(file);
      setSections(result.sections);
      setRows(result.rows);
      setInvalidSectionRows(result.invalidSectionRows);
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
   * Hai loại lỗi của một tệp bộ câu hỏi gộp chung vào một tệp xuất ra: người sửa
   * chỉ cần mở đúng một tệp thay vì đối chiếu hai bảng trên màn hình.
   */
  const exportFailedRows = () =>
    downloadSurveyTemplateFailedRows([
      ...invalidSectionRows.map((row) => ({
        rowNumber: row.rowNumber,
        values: [row.sectionName, row.questionText, ''],
        reason:
          row.reason === 'MISSING'
            ? 'Chưa điền tên mục (nếu đang gộp ô cột Mục thì bỏ gộp và lặp lại tên mục ở từng dòng)'
            : 'Mục này đã kết thúc ở phía trên; gom các câu cùng mục lại liền nhau',
      })),
      ...invalidTrapRows.map((row) => ({
        rowNumber: row.rowNumber,
        values: ['', row.questionText, row.rawValue],
        reason: `Mức này không có trong thang "${scale?.answerScaleName ?? ''}" của bộ`,
      })),
    ].sort((left, right) => left.rowNumber - right.rowNumber));

  const failedRowCount = invalidSectionRows.length + invalidTrapRows.length;

  const handleImport = async () => {
    if (rows.length === 0) return;
    if (!templateName.trim()) {
      setFormError('Vui lòng nhập tên bộ câu hỏi.');
      return;
    }
    if (!scale) {
      setFormError('Vui lòng chọn thang trả lời cho bộ câu hỏi.');
      return;
    }
    // Bỏ qua một phần câu hỏi thì bộ sẽ thiếu, bắt sửa tệp rồi tải lại.
    if (invalidSectionRows.length > 0) {
      setFormError('Vui lòng sửa các dòng có vấn đề ở cột Mục rồi chọn lại tệp.');
      return;
    }
    if (invalidTrapRows.length > 0) {
      setFormError(
        'Mức bắt buộc của một số câu bẫy không có trong thang đã chọn: đổi thang, hoặc sửa tệp rồi chọn lại.'
      );
      return;
    }

    setSaving(true);
    const message = await onImport({
      templateName: templateName.trim(),
      answerScaleId: scale.answerScaleId,
      // Bộ mới hoàn toàn nên mọi mục đều chưa có mã.
      sections: sections.map((sectionName) => ({ sectionId: null, sectionName })),
      questions: rows.map((row) => ({
        questionText: row.questionText,
        attentionCheckValue: attentionCheckOf(row, scale) ?? null,
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
    <Modal stepFlow isOpen={isOpen} onClose={handleClose} title="Tạo bộ câu hỏi từ Excel">
      <div className="admin-import-dialog" aria-busy={parsing || saving}>
        <div className="admin-form-intro">
          <FileSpreadsheet aria-hidden="true" />
          <p>
            Hàng đầu tiên cần có cột <strong>Mục</strong> và <strong>Câu hỏi</strong>; thêm cột{' '}
            <strong>Đáp án bắt buộc phải chọn</strong> nếu bộ có câu bẫy. Thang trả lời chọn một
            lần cho cả bộ ở ô bên dưới, tệp không cần cột thang. Cột Mục phải điền ở{' '}
            <strong>mọi dòng, kể cả dòng câu bẫy</strong> — lặp lại tên mục chứ{' '}
            <strong>không gộp ô</strong>, vì ô gộp chỉ đọc ra được dòng trên cùng. Các câu cùng
            một mục phải nằm liền nhau. Tối đa {maximumSectionsPerTemplate} mục, số câu không
            giới hạn.
          </p>
        </div>

        <div className="import-template-row">
          <span>
            Tệp mẫu có sheet <strong>Danh sách thang trả lời</strong> liệt kê các đáp án của từng
            thang, để biết điền mức nào cho câu bẫy.
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={answerScales.length === 0}
            onClick={() => void downloadSurveyTemplateImportTemplate(answerScales, scale)}
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
          <div className="form-group">
            <label htmlFor={`${inputId}-scale`}>Thang trả lời</label>
            <select
              id={`${inputId}-scale`}
              value={answerScaleId}
              onChange={(event) => {
                setChosenScaleId(event.target.value);
                setFormError(null);
              }}
              disabled={answerScales.length === 0 || saving}
              required
            >
              <option value="">Chọn thang trả lời</option>
              {answerScales.map((item) => (
                <option key={item.answerScaleId} value={String(item.answerScaleId)}>
                  {item.answerScaleName}
                </option>
              ))}
            </select>
            {scale && (
              <small className="survey-template-import-scale-levels">
                {scale.options
                  .slice()
                  .sort((left, right) => left.value - right.value)
                  .map((option) => `${option.value}. ${option.displayText}`)
                  .join(' · ')}
              </small>
            )}
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
                      <td style={{ textAlign: 'right' }}>{row.rowNumber}</td>
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

        {invalidTrapRows.length > 0 && (
          <section className="admin-import-preview" aria-label="Dòng có câu bẫy không hợp lệ">
            <header>
              <strong>{invalidTrapRows.length} dòng có mức bắt buộc không hợp lệ</strong>
              <span>
                {scale
                  ? `Mức không có trong thang "${scale.answerScaleName}" — đổi thang hoặc sửa tệp`
                  : 'Chọn thang trả lời cho bộ để kiểm mức câu bẫy'}
              </span>
            </header>
            <div className="admin-import-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dòng</th>
                    <th>Nội dung câu hỏi</th>
                    <th>Mức đã điền</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidTrapRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td style={{ textAlign: 'right' }}>{row.rowNumber}</td>
                      <td>{row.questionText}</td>
                      <td>{row.rawValue || '(trống)'}</td>
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
                    <th>Câu bẫy</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td style={{ textAlign: 'right' }}>{row.rowNumber}</td>
                      <td>{row.sectionName}</td>
                      <td>{row.questionText}</td>
                      <td>{row.rawAttention ? `Phải chọn mức ${row.rawAttention}` : '—'}</td>
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
          <ImportConfirmation
            rows={rows}
            fileName={fileName}
            destination={`Bộ câu hỏi: ${templateName.trim()} · Thang: ${scale?.answerScaleName ?? "Chưa chọn"}`}
            key={`${templateName}|${answerScaleId}`}
            description="Tạo bộ câu hỏi mới theo thứ tự các mục và câu hỏi trong tệp. Ô đáp án bắt buộc để trống là câu hỏi bình thường."
            columns={[
              { key: 'sectionName', label: 'Mục' },
              { key: 'questionText', label: 'Nội dung câu hỏi' },
              { key: 'rawAttention', label: 'Đáp án bắt buộc' },
            ]}
            disabled={
              rows.length === 0
              || !templateName.trim()
              || !scale
              || invalidSectionRows.length > 0
              || invalidTrapRows.length > 0
              || parsing
              || saving
            }
            onConfirm={handleImport}
          />
        </div>
      </div>
    </Modal>
  );
}
