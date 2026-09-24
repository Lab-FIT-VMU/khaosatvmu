import React, { useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  LayoutTemplate,
  Monitor,
  Move,
  RotateCcw,
  Smartphone,
  Trash2,
  Underline,
  Upload,
} from 'lucide-react';
import type { SurveyFormConfig, SurveyTextStyle } from '../types';
import {
  maximumTitleFontSize,
  minimumTitleFontSize,
  surveyFormFonts,
  surveyInfoFields,
  surveyQuizBlocks,
  isFieldVisible,
  toggleHiddenField,
} from '../utils/surveyForm';
import {
  configFromTemplate,
  surveyFormTemplates,
  type SurveyFormTemplate,
} from '../utils/surveyFormTemplates';
import { ConfirmDialog, Modal } from './Modal';
import { SurveyImagePicker } from './SurveyImagePicker';
import {
  SurveyFormPreview,
  type SurveyFormRegion,
  type SurveyPreviewData,
  type SurveyPreviewScreen,
} from './SurveyFormPreview';

/** Hai màn soạn được; mỗi thẻ vừa xem trước vừa sửa đúng màn đó. */
const previewScreens: { value: SurveyPreviewScreen; label: string }[] = [
  { value: 'intro', label: 'Màn hình bắt đầu làm bài' },
  { value: 'quiz', label: 'Bài làm' },
];

/** Vị trí ảnh bìa dạng "50% 40%" tách thành hai số để kéo bằng thanh trượt. */
const coverPositionOf = (value: string | null | undefined): [number, number] => {
  const parts = (value ?? '50% 50%').match(/(\d{1,3})% (\d{1,3})%/);
  return parts ? [Number(parts[1]), Number(parts[2])] : [50, 50];
};

/**
 * Màn soạn hình thức phiếu, mở trong một hộp thoại phủ kín.
 *
 * Hai bước: chọn mẫu trong thư viện, rồi sửa trên mẫu đó. Mỗi thẻ mẫu là một bản thu
 * nhỏ của chính phiếu thật nên chọn bằng mắt chứ không phải đoán theo tên.
 *
 * Hộp thoại giữ một BẢN NHÁP riêng; bấm Huỷ là vứt nháp, cấu hình bên ngoài không đổi.
 */
export const SurveyFormDesigner: React.FC<{
  isOpen: boolean;
  value: SurveyFormConfig;
  /** Đang lưu lên server (chỉ dùng khi sửa đợt đã tạo). */
  saving?: boolean;
  /** Tên đợt và bộ câu hỏi thật, để xem trước đúng phiếu sinh viên sẽ nhận. */
  data?: SurveyPreviewData;
  onSave: (config: SurveyFormConfig) => void;
  onClose: () => void;
}> = ({ isOpen, value, saving = false, data, onSave, onClose }) => {
  const [draft, setDraft] = useState<SurveyFormConfig>(value);
  /** Chưa chọn mẫu bao giờ thì mở thẳng vào thư viện mẫu. */
  const [step, setStep] = useState<'gallery' | 'editor'>(value.templateId ? 'editor' : 'gallery');
  /** Thẻ đang xem: quyết định cả bản xem trước lẫn nhóm cấu hình bên phải. */
  const [screen, setScreen] = useState<SurveyPreviewScreen>('intro');
  /** Vùng đang chọn trên bản dựng; null là chưa chọn gì. */
  const [region, setRegion] = useState<SurveyFormRegion | null>(null);
  /** Mở bảng kéo vị trí ảnh bìa. */
  const [movingCover, setMovingCover] = useState(false);
  /** Xem trước theo khổ máy tính hay điện thoại. */
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  /** Hộp chọn ảnh đang mở cho ô nào; null là đóng. */
  const [pickingImage, setPickingImage] = useState<'logo' | 'cover' | null>(null);
  /** Hỏi lại trước khi về thư viện mẫu: chọn mẫu khác là bỏ hết chỉnh sửa đang có. */
  const [confirmingTemplateChange, setConfirmingTemplateChange] = useState(false);

  // Mỗi lần mở lại hộp thoại là một lần soạn mới: lấy đúng cấu hình đang lưu bên ngoài.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(value);
    setStep(value.templateId ? 'editor' : 'gallery');
    setScreen('intro');
    setRegion(null);
    setMovingCover(false);
    setPickingImage(null);
    setConfirmingTemplateChange(false);
    setDevice('desktop');
  }, [isOpen, value]);

  const set = (patch: Partial<SurveyFormConfig>) => setDraft((prev) => ({ ...prev, ...patch }));

  const chooseTemplate = (template: SurveyFormTemplate) => {
    // Giữ lại ảnh đã tải lên: đổi mẫu là đổi màu chữ, không phải vứt ảnh của đợt.
    setDraft({
      ...configFromTemplate(template),
      logoUrl: draft.logoUrl,
      coverImageUrl: draft.coverImageUrl,
    });
    setStep('editor');
  };

  // ----------------------------------------------------------------- Ô nhập

  const colorField = (
    id: string,
    label: string,
    current: string | null | undefined,
    fallback: string,
    apply: (next: string | null) => void,
  ) => (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div className="survey-designer__color">
        <input
          id={id}
          type="color"
          value={current || fallback}
          onChange={(event) => apply(event.target.value)}
        />
        <span>{current || `Mặc định ${fallback}`}</span>
        {current && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => apply(null)}>
            Bỏ chọn
          </button>
        )}
      </div>
    </div>
  );

  // ------------------------------------------------- Thanh lệnh của vùng đang chọn

  /** Mở hộp chọn ảnh: ảnh hệ thống hoặc ảnh tải lên. */
  const replaceImageButton = (kind: 'logo' | 'cover', label: string) => (
    <button
      type="button"
      className="survey-region__btn"
      onClick={() => setPickingImage(kind)}
    >
      <Upload className="operation-icon" aria-hidden="true" />
      {label}
    </button>
  );

  const [coverX, coverY] = coverPositionOf(draft.coverPosition);

  /**
   * Lệnh của từng vùng, gắn ngay dưới vùng đang chọn. Cố ý ít nút: mỗi vùng chỉ vài
   * việc hay làm nhất, phần còn lại vẫn nằm ở bảng bên phải.
   */
  const regionToolbar = () => {
    if (region === 'cover') {
      return (
        <>
          {replaceImageButton('cover', 'Thay ảnh')}
          <button
            type="button"
            className={`survey-region__btn${movingCover ? ' is-on' : ''}`}
            onClick={() => setMovingCover((prev) => !prev)}
          >
            <Move className="operation-icon" aria-hidden="true" />
            Đặt lại vị trí
          </button>
          {draft.coverImageUrl && (
            <button
              type="button"
              className="survey-region__btn"
              onClick={() => set({ coverImageUrl: null, coverPosition: null })}
            >
              <Trash2 className="operation-icon" aria-hidden="true" />
              Xoá ảnh
            </button>
          )}

          {movingCover && (
            <div className="survey-region__move">
              <p>Khung ảnh cố định. Kéo để chọn phần ảnh được thấy trong khung.</p>
              <label>
                Ngang
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={coverX}
                  onChange={(event) =>
                    set({ coverPosition: `${event.target.value}% ${coverY}%` })}
                />
              </label>
              <label>
                Dọc
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={coverY}
                  onChange={(event) =>
                    set({ coverPosition: `${coverX}% ${event.target.value}%` })}
                />
              </label>
              <button
                type="button"
                className="survey-region__btn"
                onClick={() => set({ coverPosition: null })}
              >
                <RotateCcw className="operation-icon" aria-hidden="true" />
                Căn giữa lại
              </button>
            </div>
          )}
        </>
      );
    }

    if (region === 'logo') {
      return (
        <>
          {replaceImageButton('logo', 'Thay logo')}
          <button
            type="button"
            className="survey-region__btn"
            onClick={() => set({ logoUrl: null })}
          >
            <Trash2 className="operation-icon" aria-hidden="true" />
            Xoá logo
          </button>
        </>
      );
    }

    if (region === 'title') {
      return (
        <>
          {/* Phông và cỡ chữ nằm luôn ở đây, cạnh chữ đang sửa — bảng bên phải không
              còn mục tiêu đề nữa. */}
          <select
            className="survey-region__select"
            aria-label="Phông chữ tiêu đề"
            value={draft.titleFont ?? 'default'}
            onChange={(event) => set({ titleFont: event.target.value })}
          >
            {surveyFormFonts.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
          <input
            className="survey-region__size"
            type="number"
            aria-label="Cỡ chữ tiêu đề"
            min={minimumTitleFontSize}
            max={maximumTitleFontSize}
            value={draft.titleFontSize ?? 30}
            onChange={(event) => {
              const size = Number(event.target.value);
              if (size >= minimumTitleFontSize && size <= maximumTitleFontSize) {
                set({ titleFontSize: size });
              }
            }}
          />
          <button
            type="button"
            className={`survey-region__btn${draft.titleBold ? ' is-on' : ''}`}
            aria-pressed={Boolean(draft.titleBold)}
            onClick={() => set({ titleBold: !draft.titleBold })}
          >
            <Bold className="operation-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`survey-region__btn${draft.titleItalic ? ' is-on' : ''}`}
            aria-pressed={Boolean(draft.titleItalic)}
            onClick={() => set({ titleItalic: !draft.titleItalic })}
          >
            <Italic className="operation-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`survey-region__btn${draft.titleUnderline ? ' is-on' : ''}`}
            aria-pressed={Boolean(draft.titleUnderline)}
            onClick={() => set({ titleUnderline: !draft.titleUnderline })}
          >
            <Underline className="operation-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`survey-region__btn${draft.titleAlign === 'left' ? ' is-on' : ''}`}
            onClick={() => set({ titleAlign: 'left' })}
          >
            Căn trái
          </button>
          <button
            type="button"
            className={`survey-region__btn${draft.titleAlign === 'center' ? ' is-on' : ''}`}
            onClick={() => set({ titleAlign: 'center' })}
          >
            Căn giữa
          </button>
          <button
            type="button"
            className={`survey-region__btn${draft.titleAlign === 'right' ? ' is-on' : ''}`}
            onClick={() => set({ titleAlign: 'right' })}
          >
            Căn phải
          </button>
        </>
      );
    }

    // Dải lưu ý: dòng đầu và nội dung là hai đoạn chữ riêng, mỗi đoạn một bộ định dạng.
    const isHeading = region === 'noticeHeading';
    const styleKey = isHeading ? 'noticeHeadingStyle' : 'noticeTextStyle';
    const textKey = isHeading ? 'introHeading' : 'intro';
    const style = (isHeading ? draft.noticeHeadingStyle : draft.noticeTextStyle) ?? {};
    const setStyle = (patch: Partial<SurveyTextStyle>) =>
      set({ [styleKey]: { ...style, ...patch } });

    return (
      <>
        <input
          className="survey-region__size"
          type="number"
          aria-label="Cỡ chữ"
          min={minimumTitleFontSize}
          max={maximumTitleFontSize}
          value={style.fontSize ?? (isHeading ? 13 : 13)}
          onChange={(event) => {
            const size = Number(event.target.value);
            if (size >= minimumTitleFontSize && size <= maximumTitleFontSize) {
              setStyle({ fontSize: size });
            }
          }}
        />
        <button
          type="button"
          className={`survey-region__btn${style.bold ? ' is-on' : ''}`}
          aria-pressed={Boolean(style.bold)}
          onClick={() => setStyle({ bold: !style.bold })}
        >
          <Bold className="operation-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`survey-region__btn${style.italic ? ' is-on' : ''}`}
          aria-pressed={Boolean(style.italic)}
          onClick={() => setStyle({ italic: !style.italic })}
        >
          <Italic className="operation-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`survey-region__btn${style.underline ? ' is-on' : ''}`}
          aria-pressed={Boolean(style.underline)}
          onClick={() => setStyle({ underline: !style.underline })}
        >
          <Underline className="operation-icon" aria-hidden="true" />
        </button>
        {(['left', 'center', 'right'] as const).map((align) => (
          <button
            type="button"
            key={align}
            className={`survey-region__btn${style.align === align ? ' is-on' : ''}`}
            onClick={() => setStyle({ align })}
          >
            {align === 'left' ? 'Căn trái' : align === 'center' ? 'Căn giữa' : 'Căn phải'}
          </button>
        ))}
        <button
          type="button"
          className="survey-region__btn"
          onClick={() => set({ [textKey]: null, [styleKey]: null })}
        >
          <RotateCcw className="operation-icon" aria-hidden="true" />
          Về mặc định
        </button>
      </>
    );
  };

  // ------------------------------------------------------------ Hai bước soạn

  const gallery = (
    <div className="survey-designer__gallery">
      <p className="survey-designer__note">
        Chọn một mẫu để bắt đầu. Mẫu chỉ là bộ màu và chữ dựng sẵn — chọn xong vẫn sửa được
        từng thứ ở bước sau.
      </p>

      <div className="survey-designer__cards">
        {surveyFormTemplates.map((template) => (
          <button
            type="button"
            key={template.id}
            className={`survey-designer__card${
              draft.templateId === template.id ? ' survey-designer__card--current' : ''
            }`}
            onClick={() => chooseTemplate(template)}
          >
            <span className="survey-designer__card-thumb" aria-hidden="true">
              <span className="survey-designer__card-scale">
                <SurveyFormPreview config={configFromTemplate(template)} data={data} compact />
              </span>
            </span>
            <span className="survey-designer__card-name">{template.name}</span>
            <span className="survey-designer__card-desc">{template.description}</span>
          </button>
        ))}
      </div>
    </div>
  );

  /**
   * Bảng điều khiển đổi theo thẻ đang xem: sửa cái gì thì thấy ngay cái đó. Màu và ảnh
   * dùng chung cho mọi màn nên luôn nằm cuối bảng, không nhét vào một thẻ riêng.
   */
  const panelOfScreen = () => {
    if (screen === 'intro') {
      // Tiêu đề, lời dẫn và cam kết ẩn danh sửa thẳng trên bản dựng, nên bảng bên phải
      // chỉ còn thứ không bấm vào phiếu mà chỉnh được: bật/tắt từng thông tin.
      return (
        <section>
          <h3>Thông tin hiển thị</h3>
          <p className="survey-designer__hint">
            Tắt thông tin nào thì phiếu của sinh viên không hiện thông tin đó.
          </p>
          <div className="survey-designer__fields">
            {surveyInfoFields.map((field) => (
              <label key={field.code} className="survey-designer__check">
                <input
                  type="checkbox"
                  checked={isFieldVisible(draft, field.code)}
                  onChange={(event) =>
                    set({ hiddenFields: toggleHiddenField(draft, field.code, event.target.checked) })}
                />
                <span>{field.label}</span>
              </label>
            ))}
          </div>
        </section>
      );
    }

    return (
      <>
        <section>
          <h3>Khối hiển thị trong bài làm</h3>
          <p className="survey-designer__hint">
            Câu hỏi và thang trả lời thuộc bộ câu hỏi, không sửa ở đây.
          </p>
          <div className="survey-designer__fields survey-designer__fields--one">
            {surveyQuizBlocks.map((block) => (
              <label key={block.code} className="survey-designer__check">
                <input
                  type="checkbox"
                  checked={isFieldVisible(draft, block.code)}
                  onChange={(event) =>
                    set({ hiddenFields: toggleHiddenField(draft, block.code, event.target.checked) })}
                />
                <span>
                  {block.label}
                  {block.hint && <em className="survey-designer__hint"> {block.hint}</em>}
                </span>
              </label>
            ))}
          </div>
        </section>

      </>
    );
  };

  const editor = (
    <div className="survey-designer__editor">
      <div className="survey-designer__preview">
        <div className="survey-designer__preview-head">
          <div className="survey-designer__tabs" role="tablist">
            {previewScreens.map((item) => (
              <button
                type="button"
                key={item.value}
                role="tab"
                aria-selected={screen === item.value}
                className={`survey-designer__tab${screen === item.value ? ' is-on' : ''}`}
                onClick={() => setScreen(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="survey-designer__head-actions">
            {/* Xem khổ điện thoại: chỉ bóp bề ngang khung, cách sửa vẫn y như cũ. */}
            <button
              type="button"
              className={`survey-designer__device${device === 'mobile' ? ' is-on' : ''}`}
              aria-pressed={device === 'mobile'}
              onClick={() => setDevice((prev) => (prev === 'mobile' ? 'desktop' : 'mobile'))}
            >
              {device === 'mobile' ? (
                <Smartphone className="operation-icon" aria-hidden="true" />
              ) : (
                <Monitor className="operation-icon" aria-hidden="true" />
              )}
              {device === 'mobile' ? 'Giao diện điện thoại' : 'Giao diện máy tính'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setConfirmingTemplateChange(true)}
            >
              <LayoutTemplate className="operation-icon" aria-hidden="true" />
              Đổi mẫu
            </button>
          </div>
        </div>
        <div
          className={`survey-designer__preview-frame${
            screen === 'intro' ? ' survey-designer__preview-frame--editable' : ''
          }`}
        >
          <div
            className={`public-survey-shell survey-designer__device-frame${
              device === 'mobile' ? ' is-mobile' : ''
            }`}
          >
          <SurveyFormPreview
            config={draft}
            screen={screen}
            data={data}
            // Chỉ màn hình bắt đầu làm bài sửa được tại chỗ; thẻ Bài làm vẫn chỉ để xem.
            editable={screen === 'intro'}
            selected={region}
            onSelect={(next) => {
              setRegion(next);
              if (next !== 'cover') setMovingCover(false);
            }}
            onTextChange={(field, next) => set({ [field]: next })}
            toolbar={region ? regionToolbar() : null}
          />
          </div>
        </div>
      </div>

      <div className="survey-designer__panel">
        {panelOfScreen()}

        {/* Một màu duy nhất cho cả phiếu: mọi sắc độ khác pha ra từ màu này. */}
        <section>
          <h3>Màu chủ đề</h3>
          {colorField('form-primary-color', 'Màu chủ đạo', draft.primaryColor, '#1f7a45',
            (next) => set({ primaryColor: next }))}
        </section>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 'gallery' ? 'Chọn mẫu phiếu khảo sát' : 'Cấu hình phiếu'}
      size="designer"
      // Đang soạn dở mà bấm trượt ra ngoài thì mất hết; chỉ đóng bằng nút X hoặc Hủy.
      closeOnBackdropClick={false}
      // Ở bước chọn mẫu chưa có gì để lưu, nên không hiện chân hộp thoại.
      onSubmit={step === 'editor' ? () => onSave(draft) : undefined}
      submitText={saving ? 'Đang lưu...' : 'Dùng hình thức này'}
    >
      {step === 'gallery' ? gallery : editor}

      <SurveyImagePicker
        isOpen={pickingImage !== null}
        title={pickingImage === 'logo' ? 'Chọn logo' : 'Chọn ảnh đầu phiếu'}
        current={pickingImage === 'logo' ? draft.logoUrl : draft.coverImageUrl}
        // Ảnh hệ thống là ảnh đầu phiếu, không phải logo của trường.
        allowSystemImages={pickingImage === 'cover'}
        onClose={() => setPickingImage(null)}
        onChoose={(url, suggestedColor) => {
          if (pickingImage === 'logo') {
            set({ logoUrl: url });
          } else {
            // Ảnh mới thì vùng cắt cũ không còn đúng; màu chỉ là GỢI Ý đi kèm ảnh,
            // quản trị đổi lại ở ô "Màu chủ đạo" lúc nào cũng được.
            set({
              coverImageUrl: url,
              coverPosition: null,
              ...(suggestedColor ? { primaryColor: suggestedColor } : {}),
            });
          }
          setPickingImage(null);
        }}
      />

      <ConfirmDialog
        isOpen={confirmingTemplateChange}
        onClose={() => setConfirmingTemplateChange(false)}
        onConfirm={() => {
          setConfirmingTemplateChange(false);
          setStep('gallery');
        }}
        title="Đổi mẫu phiếu"
        recordName=""
        message="Bạn có muốn đổi phiếu (Các chỉnh sửa vừa rồi sẽ không được lưu lại)?"
        confirmText="Đổi mẫu"
        confirmVariant="primary"
      />
    </Modal>
  );
};
