import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Eye,
  ListChecks,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/Modal';
import { SurveyTemplateImportDialog } from '../components/SurveyTemplateImportDialog';
import { ApiError } from '../services/apiClient';
import {
  surveyApi,
  surveyErrorMessage,
  type SaveSurveyTemplatePayload,
} from '../services/surveyApi';
import { maximumAnswerScaleOptions, maximumSectionsPerTemplate } from '../types';
import type { AnswerScale, AnswerScaleKind, SurveyTemplate } from '../types';
import '../styles/survey-operations.css';
import { foldVietnamese } from '../utils/vietnamese';

/** Một dòng câu hỏi trong trình soạn: nội dung kèm thang trả lời của riêng nó. */
interface QuestionForm {
  questionText: string;
  answerScaleId: string;
  /** Mức bắt buộc của câu bẫy độ tập trung. Chuỗi rỗng nghĩa là câu bình thường. */
  attentionCheckValue: string;
}

/**
 * Một mục trong trình soạn. Câu hỏi nằm LỒNG trong mục chứ không phải danh sách
 * phẳng kèm ô chọn mục: mục nào cũng có nút "Thêm câu hỏi" của riêng nó nên câu
 * mới luôn thuộc một mục, và các câu cùng mục tự khắc nằm liền nhau — đúng hai
 * ràng buộc backend kiểm khi lưu.
 */
interface SectionForm {
  /** Mã mục đã có trong CSDL; null là mục mới chưa lưu lần nào. */
  sectionId: number | null;
  sectionName: string;
  questions: QuestionForm[];
  collapsed: boolean;
}

interface TemplateForm {
  surveyTemplateId: number | null;
  templateName: string;
  sections: SectionForm[];
  /** Bộ đã thu phiếu: chỉ cho sửa chữ, ẩn mọi nút làm dịch chỗ câu hỏi. */
  locked: boolean;
}

/** Một mức của thang; `value` cho nhập tay vì thang Có/Không dùng 1 và 5. */
interface ScaleOptionForm {
  value: string;
  displayText: string;
}

interface ScaleForm {
  answerScaleId: number | null;
  answerScaleName: string;
  scaleKind: AnswerScaleKind;
  options: ScaleOptionForm[];
}

const emptyTemplateForm: TemplateForm = {
  surveyTemplateId: null,
  templateName: '',
  sections: [],
  locked: false,
};

const emptyScaleForm: ScaleForm = {
  answerScaleId: null,
  answerScaleName: '',
  scaleKind: 'Options',
  options: [1, 2, 3, 4, 5].map((value) => ({ value: String(value), displayText: '' })),
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(new Date(value));

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

export const SurveyTemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [answerScales, setAnswerScales] = useState<AnswerScale[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [form, setForm] = useState<TemplateForm>(emptyTemplateForm);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isScalesOpen, setIsScalesOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<SurveyTemplate | null>(null);
  const [deleting, setDeleting] = useState<SurveyTemplate | null>(null);

  const [scaleForm, setScaleForm] = useState<ScaleForm>(emptyScaleForm);
  const [scaleError, setScaleError] = useState<string | null>(null);
  const [scaleSaving, setScaleSaving] = useState(false);
  const [deletingScaleId, setDeletingScaleId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextTemplates, nextScales] = await Promise.all([
        surveyApi.templates(),
        surveyApi.answerScales(),
      ]);
      setTemplates(nextTemplates);
      setAnswerScales(nextScales);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const scaleNameOf = (answerScaleId: number) =>
    answerScales.find((scale) => scale.answerScaleId === answerScaleId)?.answerScaleName ?? '—';

  /** Tên các thang mà một bộ đang dùng, không lặp, theo thứ tự câu hỏi. */
  const scaleNamesOf = (template: SurveyTemplate) =>
    [...new Set(template.questions.map((question) => question.answerScaleId))]
      .map(scaleNameOf)
      .join(' · ');

  const normalized = foldVietnamese(search);
  const filtered = templates.filter(
    (item) => !normalized || foldVietnamese(item.templateName).includes(normalized)
  );

  /**
   * Số thứ tự của từng câu trong hộp xem trước. Cùng cách đánh với trình soạn và
   * với các cột C1, C2… của báo cáo: bỏ câu bẫy ra rồi mới đánh số.
   */
  const previewOrders = useMemo(() => {
    const orders = new Map<number, number>();
    let order = 0;

    viewing?.questions.forEach((question) => {
      if (question.attentionCheckValue !== null) return;
      orders.set(question.questionId, (order += 1));
    });

    return orders;
  }, [viewing]);

  // ------------------------------------------------------------- Bộ câu hỏi

  // Chỉ có đúng một thang thì chọn sẵn cho đỡ phải bấm.
  const defaultScaleId = answerScales.length === 1 ? String(answerScales[0].answerScaleId) : '';

  const questionCount = form.sections.reduce(
    (total, section) => total + section.questions.length,
    0
  );

  /**
   * Số thứ tự hiện cạnh mỗi câu trong trình soạn, khoá là "mục:câu".
   *
   * Câu bẫy nhận null và hiện chữ "Bẫy" thay cho số: số chạy liền mạch trên các
   * câu còn lại, khớp với các cột C1, C2… của bảng dữ liệu và báo cáo. Phiếu của
   * sinh viên thì ngược lại — ở đó mọi câu đều có số, kể cả câu bẫy, để khớp thanh
   * tiến độ và lưới điều hướng.
   */
  const displayOrders = useMemo(() => {
    const orders = new Map<string, number | null>();
    let order = 0;

    form.sections.forEach((section, sectionIndex) => {
      section.questions.forEach((question, questionIndex) => {
        const isTrap = question.attentionCheckValue !== '';
        orders.set(`${sectionIndex}:${questionIndex}`, isTrap ? null : (order += 1));
      });
    });

    return orders;
  }, [form.sections]);

  const openEdit = (template: SurveyTemplate) => {
    setValidationError(null);
    setForm({
      surveyTemplateId: template.surveyTemplateId,
      templateName: template.templateName,
      locked: template.hasResponses,
      // API đã trả mục theo đúng thứ tự hiển thị và câu theo đúng thứ tự trong bộ,
      // nên chỉ cần gom câu về mục của nó là ra đúng bố cục phiếu.
      sections: template.sections.map((section) => ({
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        collapsed: false,
        questions: template.questions
          .filter((question) => question.sectionId === section.sectionId)
          .map((question) => ({
            questionText: question.questionText,
            answerScaleId: String(question.answerScaleId),
            attentionCheckValue:
              question.attentionCheckValue === null ? '' : String(question.attentionCheckValue),
          })),
      })),
    });
    setIsEditorOpen(true);
  };

  const updateSection = (sectionIndex: number, patch: Partial<SectionForm>) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section, position) =>
        position === sectionIndex ? { ...section, ...patch } : section
      ),
    }));
  };

  const updateQuestion = (
    sectionIndex: number,
    questionIndex: number,
    patch: Partial<QuestionForm>
  ) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section, position) =>
        position !== sectionIndex
          ? section
          : {
              ...section,
              questions: section.questions.map((question, index) =>
                index === questionIndex ? { ...question, ...patch } : question
              ),
            }
      ),
    }));
  };

  const addSection = () => {
    if (form.sections.length >= maximumSectionsPerTemplate) {
      setValidationError(`Mỗi bộ câu hỏi chỉ được tối đa ${maximumSectionsPerTemplate} mục.`);
      return;
    }
    setValidationError(null);
    setForm((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          sectionId: null,
          sectionName: '',
          collapsed: false,
          questions: [{ questionText: '', answerScaleId: defaultScaleId, attentionCheckValue: '' }],
        },
      ],
    }));
  };

  const removeSection = (sectionIndex: number) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, position) => position !== sectionIndex),
    }));
  };

  const addQuestion = (sectionIndex: number) => {
    setValidationError(null);
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section, position) =>
        position !== sectionIndex
          ? section
          : {
              ...section,
              // Câu mới thường cùng thang với câu ngay trên nó.
              questions: [
                ...section.questions,
                {
                  questionText: '',
                  answerScaleId: section.questions.at(-1)?.answerScaleId ?? defaultScaleId,
                  attentionCheckValue: '',
                },
              ],
            }
      ),
    }));
  };

  const removeQuestion = (sectionIndex: number, questionIndex: number) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section, position) =>
        position !== sectionIndex
          ? section
          : {
              ...section,
              questions: section.questions.filter((_, index) => index !== questionIndex),
            }
      ),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const templateName = form.templateName.trim();
    if (!templateName) {
      setValidationError('Vui lòng nhập tên bộ câu hỏi.');
      return;
    }

    // Bỏ câu để trống nội dung, rồi bỏ luôn mục không còn câu nào — backend từ
    // chối mục rỗng, mà mục rỗng ở đây thường chỉ là dòng người dùng thêm hụt.
    const filledSections = form.sections
      .map((section) => ({
        ...section,
        sectionName: section.sectionName.trim(),
        questions: section.questions
          .map((question) => ({ ...question, questionText: question.questionText.trim() }))
          .filter((question) => question.questionText.length > 0),
      }))
      .filter((section) => section.questions.length > 0);

    if (filledSections.length === 0) {
      setValidationError('Bộ câu hỏi cần ít nhất một mục có câu hỏi.');
      return;
    }
    if (filledSections.some((section) => section.sectionName.length === 0)) {
      setValidationError('Vui lòng đặt tên cho từng mục.');
      return;
    }
    const sectionKeys = filledSections.map((section) => foldVietnamese(section.sectionName));
    if (new Set(sectionKeys).size !== sectionKeys.length) {
      setValidationError('Hai mục trong cùng một bộ không được trùng tên.');
      return;
    }
    if (
      filledSections.some((section) =>
        section.questions.some((question) => !question.answerScaleId)
      )
    ) {
      setValidationError('Vui lòng chọn thang trả lời cho từng câu hỏi.');
      return;
    }

    const payload: SaveSurveyTemplatePayload = {
      templateName,
      sections: filledSections.map((section) => ({
        sectionId: section.sectionId,
        sectionName: section.sectionName,
      })),
      // Duỗi phẳng theo đúng thứ tự mục, nên các câu cùng mục tự khắc liền nhau.
      questions: filledSections.flatMap((section, sectionIndex) =>
        section.questions.map((question) => ({
          questionText: question.questionText,
          answerScaleId: Number(question.answerScaleId),
          // Để trống là câu bình thường; backend còn kiểm mức có thật của thang.
          attentionCheckValue: question.attentionCheckValue
            ? Number(question.attentionCheckValue)
            : null,
          sectionIndex,
        }))
      ),
    };

    setSaving(true);
    try {
      // Trang này không tạo bộ mới nữa — bộ mới chỉ vào qua import Excel — nhưng
      // vẫn giữ nhánh tạo để hộp thoại import dùng chung đường lưu.
      if (form.surveyTemplateId === null) {
        await surveyApi.createTemplate(payload);
      } else {
        await surveyApi.updateTemplate(form.surveyTemplateId, payload);
      }
      setTemplates(await surveyApi.templates());
      toast.success(form.surveyTemplateId === null ? 'Đã tạo bộ câu hỏi' : 'Đã cập nhật bộ câu hỏi', {
        description: `${templateName} · ${payload.questions.length} câu hỏi · ${payload.sections.length} mục`,
      });
      setIsEditorOpen(false);
      setForm(emptyTemplateForm);
      setValidationError(null);
    } catch (error) {
      setValidationError(messageFrom(error));
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (draft: SaveSurveyTemplatePayload): Promise<string | null> => {
    try {
      await surveyApi.createTemplate(draft);
      setTemplates(await surveyApi.templates());
      toast.success('Đã tạo bộ câu hỏi từ Excel', {
        description: `${draft.templateName} · ${draft.questions.length} câu hỏi`,
      });
      return null;
    } catch (error) {
      return messageFrom(error);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await surveyApi.deleteTemplate(deleting.surveyTemplateId);
      setTemplates(await surveyApi.templates());
      toast.success('Đã xóa bộ câu hỏi', { description: deleting.templateName });
    } catch (error) {
      toast.error('Không thể xóa bộ câu hỏi', { description: messageFrom(error) });
    } finally {
      setDeleting(null);
    }
  };

  // --------------------------------------------------------- Thang trả lời

  const openScaleCreate = () => {
    setScaleError(null);
    setDeletingScaleId(null);
    setScaleForm(emptyScaleForm);
  };

  const openScaleEdit = (scale: AnswerScale) => {
    setScaleError(null);
    setDeletingScaleId(null);
    setScaleForm({
      answerScaleId: scale.answerScaleId,
      answerScaleName: scale.answerScaleName,
      scaleKind: scale.scaleKind,
      options: scale.options
        .slice()
        .sort((left, right) => left.value - right.value)
        .map((option) => ({ value: String(option.value), displayText: option.displayText })),
    });
  };

  const handleSaveScale = async (event: React.FormEvent) => {
    event.preventDefault();

    const answerScaleName = scaleForm.answerScaleName.trim();
    if (!answerScaleName) {
      setScaleError('Vui lòng nhập tên thang trả lời.');
      return;
    }

    // Thang tự nhập chữ không có mức nào để nhập.
    if (scaleForm.scaleKind === 'Text') {
      await saveScale({ answerScaleName, scaleKind: 'Text', options: [] });
      return;
    }

    if (scaleForm.options.some((option) => !option.displayText.trim())) {
      setScaleError('Vui lòng nhập nhãn cho tất cả các mức.');
      return;
    }

    const values = scaleForm.options.map((option) => Number(option.value));
    if (values.some((value) => !Number.isInteger(value) || value < 1 || value > maximumAnswerScaleOptions)) {
      setScaleError(`Giá trị của mỗi mức phải là số nguyên từ 1 đến ${maximumAnswerScaleOptions}.`);
      return;
    }
    if (new Set(values).size !== values.length) {
      setScaleError('Hai mức không được trùng giá trị.');
      return;
    }

    await saveScale({
      answerScaleName,
      scaleKind: 'Options',
      options: scaleForm.options.map((option) => ({
        value: Number(option.value),
        displayText: option.displayText.trim(),
      })),
    });
  };

  const saveScale = async (payload: {
    answerScaleName: string;
    scaleKind: AnswerScaleKind;
    options: { value: number; displayText: string }[];
  }) => {
    const answerScaleName = payload.answerScaleName;

    setScaleSaving(true);
    try {
      if (scaleForm.answerScaleId === null) {
        await surveyApi.createAnswerScale(payload);
      } else {
        await surveyApi.updateAnswerScale(scaleForm.answerScaleId, payload);
      }
      setAnswerScales(await surveyApi.answerScales());
      toast.success(
        scaleForm.answerScaleId === null ? 'Đã tạo thang trả lời' : 'Đã cập nhật thang trả lời',
        { description: answerScaleName }
      );
      setScaleForm(emptyScaleForm);
      setScaleError(null);
    } catch (error) {
      setScaleError(messageFrom(error));
    } finally {
      setScaleSaving(false);
    }
  };

  const handleDeleteScale = async (answerScaleId: number) => {
    try {
      await surveyApi.deleteAnswerScale(answerScaleId);
      setAnswerScales(await surveyApi.answerScales());
      toast.success('Đã xóa thang trả lời');
      if (scaleForm.answerScaleId === answerScaleId) setScaleForm(emptyScaleForm);
    } catch (error) {
      setScaleError(messageFrom(error));
    } finally {
      setDeletingScaleId(null);
    }
  };

  /** Thang đã đủ mức thì không thêm được nữa và điểm chốt cứng 1 → 5. */
  const scaleIsFull = scaleForm.options.length >= maximumAnswerScaleOptions;

  /**
   * Hai đáp án không được cùng điểm, nên ô chọn của mỗi dòng chỉ mời những mức
   * chưa ai dùng, cộng mức của chính nó. Muốn đổi đáp án 2 điểm thành 3 điểm thì
   * phải nhả 3 ra trước — nhờ vậy không bao giờ tạo được hai đáp án trùng điểm,
   * thay vì để người dùng bấm Lưu rồi mới nhận thông báo lỗi.
   */
  const usedScaleValues = new Set(scaleForm.options.map((option) => Number(option.value)));
  const scaleValueChoices = (ownValue: number) =>
    Array.from({ length: maximumAnswerScaleOptions }, (_, offset) => offset + 1).filter(
      (value) => value === ownValue || !usedScaleValues.has(value)
    );

  const columns: Column<SurveyTemplate>[] = [
    {
      key: 'surveyTemplateId',
      header: 'Mã bộ',
      width: '8%',
      filterValue: (item) => String(item.surveyTemplateId),
      numeric: true,
      render: (item) => <span className="catalog-code">{item.surveyTemplateId}</span>,
    },
    {
      key: 'templateName',
      header: 'Tên bộ câu hỏi',
      width: '28%',
      filterValue: (item) => item.templateName,
      render: (item) => <span className="catalog-cell-primary">{item.templateName}</span>,
    },
    {
      key: 'answerScales',
      header: 'Thang trả lời',
      width: '28%',
      filterValue: scaleNamesOf,
      render: (item) => <span className="catalog-cell-primary">{scaleNamesOf(item) || '—'}</span>,
    },
    {
      key: 'questions',
      header: 'Câu hỏi / mục',
      width: '11%',
      filterValue: (item) => String(item.questions.length),
      numeric: true,
      render: (item) => (
        <span className="catalog-cell-primary">
          {item.questions.length} câu · {item.sections.length} mục
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Ngày tạo',
      width: '12%',
      filterValue: (item) => formatDate(item.createdAt),
      render: (item) => <span className="catalog-cell-primary">{formatDate(item.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      width: '13%',
      render: (item) => (
        <div className="catalog-actions">
          <button
            type="button"
            className="catalog-icon-button"
            onClick={() => setViewing(item)}
            aria-label={`Xem bộ câu hỏi ${item.templateName}`}
            title="Xem câu hỏi"
          >
            <Eye aria-hidden="true" size={15} />
          </button>
          <button
            type="button"
            className="catalog-icon-button"
            onClick={() => openEdit(item)}
            aria-label={`Sửa bộ câu hỏi ${item.templateName}`}
            title="Sửa"
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
          <button
            type="button"
            className="catalog-icon-button catalog-icon-button--danger"
            onClick={() => setDeleting(item)}
            aria-label={`Xóa bộ câu hỏi ${item.templateName}`}
            title="Xóa"
          >
            <Trash2 aria-hidden="true" size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="catalog-page catalog-page--wide survey-templates-page">
      <header className="catalog-page-header">
        <div>
          <h2>Bộ câu hỏi khảo sát</h2>
          <p>
            Bảng "SurveyTemplates", "SurveyQuestionSections" và "SurveyQuestions". Câu hỏi chia
            theo mục, mỗi câu có thang trả lời riêng nên một bộ trộn được nhiều loại thang. Bộ
            mới tạo từ nút Thêm bộ khảo sát mới; ở đây chỉ sửa lại bộ đã có.
          </p>
        </div>
      </header>

      {loadError && (
        <div className="admin-alert" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {!loadError && !loading && answerScales.length === 0 && (
        <div className="admin-alert" role="status">
          <CircleAlert aria-hidden="true" />
          <span>
            Chưa có thang trả lời nào. Hãy tạo thang trả lời trước khi tạo bộ câu hỏi.
          </span>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm tên bộ câu hỏi..."
        exportConfig={{
          title: 'DANH SÁCH BỘ CÂU HỎI KHẢO SÁT',
          fileName: 'danh-sach-bo-cau-hoi-khao-sat',
          subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
        }}
        onAddNew={() => setIsImportOpen(true)}
        addNewLabel="Thêm bộ khảo sát mới"
        toolbarActions={(
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm catalog-add-button"
              onClick={() => {
                openScaleCreate();
                setIsScalesOpen(true);
              }}
            >
              <ListChecks aria-hidden="true" size={16} />
              <span>Thang trả lời</span>
            </button>
          </>
        )}
        emptyMessage={loading ? 'Đang tải bộ câu hỏi...' : 'Chưa có bộ câu hỏi khảo sát nào.'}
        keyExtractor={(item) => String(item.surveyTemplateId)}
        pageSize={20}
      />

      <Modal
        isOpen={isEditorOpen}
        onClose={() => {
          if (saving) return;
          setIsEditorOpen(false);
          setValidationError(null);
        }}
        title={form.surveyTemplateId === null ? 'Tạo bộ câu hỏi khảo sát' : 'Sửa bộ câu hỏi khảo sát'}
      >
        <form className="catalog-form" onSubmit={(event) => void handleSubmit(event)}>
          {validationError && (
            <div className="catalog-validation-error" role="alert">{validationError}</div>
          )}

          <div className="form-group">
            <label htmlFor="survey-template-name">Tên bộ câu hỏi</label>
            <input
              id="survey-template-name"
              type="text"
              placeholder="VD: Khảo sát học phần học kỳ I"
              value={form.templateName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, templateName: event.target.value }))
              }
              required
            />
          </div>

          <section className="survey-question-editor" aria-label="Danh sách câu hỏi">
            <header className="survey-question-editor-header">
              <strong>Danh sách câu hỏi</strong>
              <span className="survey-question-counter">
                {questionCount} câu · {form.sections.length}/{maximumSectionsPerTemplate} mục
              </span>
            </header>

            {form.locked && (
              <p className="survey-question-locked-note">
                Bộ này đã thu phiếu nên chỉ sửa được nội dung chữ. Thêm, bớt hay đổi chỗ câu hỏi
                sẽ làm nội dung dịch sang câu khác, trong khi các phiếu đã nộp vẫn trỏ câu cũ.
              </p>
            )}

            <div className="survey-section-list">
              {form.sections.map((section, sectionIndex) => (
                // Mục chỉ thêm/bớt ở cuối nên dùng vị trí làm key là đủ.
                <fieldset className="survey-section-block" key={sectionIndex}>
                  <legend className="survey-section-head">
                    <button
                      type="button"
                      className="catalog-icon-button"
                      onClick={() => updateSection(sectionIndex, { collapsed: !section.collapsed })}
                      aria-expanded={!section.collapsed}
                      aria-label={section.collapsed ? 'Mở mục' : 'Thu gọn mục'}
                      title={section.collapsed ? 'Mở mục' : 'Thu gọn mục'}
                    >
                      {section.collapsed ? (
                        <ChevronRight aria-hidden="true" size={15} />
                      ) : (
                        <ChevronDown aria-hidden="true" size={15} />
                      )}
                    </button>
                    {/* Tên mục đặt tuỳ ý, tối đa maximumSectionsPerTemplate mục. */}
                    <input
                      type="text"
                      className="survey-section-name"
                      placeholder="Tên mục, VD: Nội dung đánh giá học phần"
                      aria-label={`Tên mục ${sectionIndex + 1}`}
                      value={section.sectionName}
                      onChange={(event) =>
                        updateSection(sectionIndex, { sectionName: event.target.value })
                      }
                    />
                    <span className="survey-section-count">{section.questions.length} câu</span>
                    {!form.locked && (
                      <button
                        type="button"
                        className="catalog-icon-button catalog-icon-button--danger"
                        onClick={() => removeSection(sectionIndex)}
                        aria-label={`Xóa mục ${section.sectionName || sectionIndex + 1}`}
                        title="Xóa mục cùng toàn bộ câu hỏi trong mục"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                      </button>
                    )}
                  </legend>

                  {!section.collapsed && (
                    <>
                      <div className="survey-question-rows">
                        {section.questions.map((question, questionIndex) => {
                          // Câu bẫy không được đánh số, đúng như trên bảng dữ liệu và
                          // báo cáo. Trên phiếu sinh viên thì mọi câu vẫn có số.
                          const order = displayOrders.get(`${sectionIndex}:${questionIndex}`);

                          return (
                            <div className="survey-question-row" key={questionIndex}>
                              <span
                                className={
                                  order === null
                                    ? 'survey-question-row-index survey-question-row-index--trap'
                                    : 'survey-question-row-index'
                                }
                              >
                                {order === null ? 'Bẫy' : order}
                              </span>
                              <div className="survey-question-row-fields">
                                <textarea
                                  rows={2}
                                  placeholder="Nội dung câu hỏi"
                                  aria-label={`Nội dung câu hỏi ${questionIndex + 1} của mục ${sectionIndex + 1}`}
                                  value={question.questionText}
                                  onChange={(event) =>
                                    updateQuestion(sectionIndex, questionIndex, {
                                      questionText: event.target.value,
                                    })
                                  }
                                />
                                <select
                                  aria-label={`Thang trả lời của câu hỏi ${questionIndex + 1} mục ${sectionIndex + 1}`}
                                  value={question.answerScaleId}
                                  disabled={form.locked}
                                  title={
                                    form.locked
                                      ? 'Bộ đã thu phiếu nên không đổi được thang trả lời'
                                      : undefined
                                  }
                                  onChange={(event) =>
                                    updateQuestion(sectionIndex, questionIndex, {
                                      answerScaleId: event.target.value,
                                    })
                                  }
                                >
                                  <option value="">Chọn thang trả lời</option>
                                  {answerScales.map((scale) => (
                                    <option
                                      key={scale.answerScaleId}
                                      value={String(scale.answerScaleId)}
                                    >
                                      {scale.answerScaleName}
                                      {scale.scaleKind === 'Text' ? ' (tự nhập)' : ''}
                                    </option>
                                  ))}
                                </select>
                                {(() => {
                                  // Câu bẫy chỉ đặt được trên thang có mức chọn sẵn:
                                  // thang tự nhập chữ không có mức nào để bắt chọn.
                                  const scale = answerScales.find(
                                    (item) => String(item.answerScaleId) === question.answerScaleId
                                  );
                                  const canTrap = scale?.scaleKind === 'Options';

                                  return (
                                    <label className="survey-question-trap">
                                      <span>Câu bẫy — mức bắt buộc</span>
                                      <select
                                        aria-label={`Mức bắt buộc của câu bẫy cho câu hỏi ${questionIndex + 1} mục ${sectionIndex + 1}`}
                                        value={canTrap ? question.attentionCheckValue : ''}
                                        disabled={!canTrap}
                                        title={
                                          canTrap
                                            ? undefined
                                            : 'Chỉ đặt được câu bẫy trên thang có mức chọn sẵn'
                                        }
                                        onChange={(event) =>
                                          updateQuestion(sectionIndex, questionIndex, {
                                            attentionCheckValue: event.target.value,
                                          })
                                        }
                                      >
                                        <option value="">Không phải câu bẫy</option>
                                        {(scale?.options ?? []).map((option) => (
                                          <option
                                            key={option.answerScaleOptionId}
                                            value={String(option.value)}
                                          >
                                            Mức {option.value} — {option.displayText}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  );
                                })()}
                              </div>
                              {!form.locked && (
                                <button
                                  type="button"
                                  className="catalog-icon-button catalog-icon-button--danger"
                                  onClick={() => removeQuestion(sectionIndex, questionIndex)}
                                  aria-label={`Xóa câu hỏi ${questionIndex + 1} của mục ${sectionIndex + 1}`}
                                  title="Xóa câu hỏi"
                                >
                                  <Trash2 aria-hidden="true" size={15} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {!form.locked && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm survey-section-add-question"
                          onClick={() => addQuestion(sectionIndex)}
                        >
                          <Plus aria-hidden="true" size={16} />
                          Thêm câu hỏi
                        </button>
                      )}
                    </>
                  )}
                </fieldset>
              ))}
            </div>

            {!form.locked && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addSection}
                disabled={form.sections.length >= maximumSectionsPerTemplate}
              >
                <Plus aria-hidden="true" size={16} />
                Thêm mục
              </button>
            )}
          </section>

          <div className="modal-footer catalog-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsEditorOpen(false)}
              disabled={saving}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (
                <LoaderCircle className="auth-spin" aria-hidden="true" size={16} />
              ) : (
                <Save aria-hidden="true" size={16} />
              )}
              {form.surveyTemplateId === null ? 'Tạo bộ câu hỏi' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isScalesOpen}
        onClose={() => {
          if (scaleSaving) return;
          setIsScalesOpen(false);
          setScaleError(null);
        }}
        title="Thang trả lời"
      >
        <div className="answer-scale-manager">
          {scaleError && (
            <div className="catalog-validation-error" role="alert">{scaleError}</div>
          )}

          <section className="answer-scale-list" aria-label="Danh sách thang trả lời">
            {answerScales.length === 0 && (
              <p className="answer-scale-empty">Chưa có thang trả lời nào.</p>
            )}
            {answerScales.map((scale) => (
              <div className="answer-scale-row" key={scale.answerScaleId}>
                <div className="answer-scale-row-body">
                  {/* Không in mã thang: "#4 Mức độ hài lòng" bị đọc nhầm thành thang
                      có bốn mức. Mã chỉ dùng nội bộ, người tạo phiếu không cần biết. */}
                  <strong>{scale.answerScaleName}</strong>
                  <span>
                    {scale.scaleKind === 'Text'
                      ? 'Người trả lời tự nhập chữ'
                      : scale.options
                          .slice()
                          .sort((left, right) => left.value - right.value)
                          .map((option) => `${option.value}. ${option.displayText}`)
                          .join(' · ')}
                  </span>
                </div>
                {deletingScaleId === scale.answerScaleId ? (
                  <div className="answer-scale-confirm">
                    <span>Xóa thang này?</span>
                    <button
                      type="button"
                      className="btn catalog-danger-button btn-sm"
                      onClick={() => void handleDeleteScale(scale.answerScaleId)}
                    >
                      Xóa
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setDeletingScaleId(null)}
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <div className="catalog-actions">
                    <button
                      type="button"
                      className="catalog-icon-button"
                      onClick={() => openScaleEdit(scale)}
                      aria-label={`Sửa thang ${scale.answerScaleName}`}
                      title="Sửa"
                    >
                      <Pencil aria-hidden="true" size={15} />
                    </button>
                    <button
                      type="button"
                      className="catalog-icon-button catalog-icon-button--danger"
                      onClick={() => setDeletingScaleId(scale.answerScaleId)}
                      aria-label={`Xóa thang ${scale.answerScaleName}`}
                      title="Xóa"
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>

          <form className="catalog-form" onSubmit={(event) => void handleSaveScale(event)}>
            <div className="catalog-form-grid catalog-form-grid--2">
              <div className="form-group">
                <label htmlFor="answer-scale-name">
                  {scaleForm.answerScaleId === null ? 'Tên thang mới' : 'Tên thang'}
                </label>
                <input
                  id="answer-scale-name"
                  type="text"
                  placeholder="VD: Mức độ hài lòng"
                  value={scaleForm.answerScaleName}
                  onChange={(event) =>
                    setScaleForm((prev) => ({ ...prev, answerScaleName: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="answer-scale-kind">Loại thang</label>
                <select
                  id="answer-scale-kind"
                  value={scaleForm.scaleKind}
                  onChange={(event) =>
                    setScaleForm((prev) => ({
                      ...prev,
                      scaleKind: event.target.value as AnswerScaleKind,
                    }))
                  }
                >
                  <option value="Options">Chọn đáp án có sẵn</option>
                  <option value="Text">Nhập chữ</option>
                </select>
              </div>
            </div>

            {scaleForm.scaleKind === 'Text' ? (
              <p className="answer-scale-empty">
                Thang tự nhập không có mức nào. Câu hỏi dùng thang này không tính vào điểm
                trung bình của phiếu.
              </p>
            ) : (
              <>
                <div className="answer-scale-options">
                  <div className="answer-scale-options-head" aria-hidden="true">
                    <span className="answer-scale-options-head-value">Mức điểm</span>
                    <span>Nội dung đáp án</span>
                  </div>
                  {scaleForm.options.map((option, index) => (
                    // Số mức chỉ thay đổi ở cuối danh sách nên dùng vị trí làm key.
                    <div className="answer-scale-option-row" key={index}>
                      <select
                        className="answer-scale-option-value"
                        aria-label={`Mức điểm của đáp án thứ ${index + 1}`}
                        value={option.value}
                        disabled={scaleIsFull}
                        title={
                          scaleIsFull
                            ? `Thang đủ ${maximumAnswerScaleOptions} đáp án nên điểm cố định 1 → ${maximumAnswerScaleOptions}.`
                            : undefined
                        }
                        onChange={(event) =>
                          setScaleForm((prev) => ({
                            ...prev,
                            options: prev.options.map((current, position) =>
                              position === index
                                ? { ...current, value: event.target.value }
                                : current
                            ),
                          }))
                        }
                      >
                        {scaleValueChoices(Number(option.value)).map((value) => (
                          <option key={value} value={String(value)}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder={`Nội dung đáp án thứ ${index + 1}`}
                        aria-label={`Nội dung đáp án thứ ${index + 1}`}
                        value={option.displayText}
                        onChange={(event) =>
                          setScaleForm((prev) => ({
                            ...prev,
                            options: prev.options.map((current, position) =>
                              position === index
                                ? { ...current, displayText: event.target.value }
                                : current
                            ),
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>

                <p className="answer-scale-hint">
                  {scaleIsFull ? (
                    <>
                      Thang đã đủ {maximumAnswerScaleOptions} đáp án — mức cao nhất — nên điểm
                      cố định 1 → {maximumAnswerScaleOptions} theo thứ tự trên. Bấm "Bớt đáp
                      án" nếu muốn đổi lại điểm.
                    </>
                  ) : (
                    <>
                      Mức điểm là điểm mà đáp án đó được tính. Hai đáp án không được cùng điểm,
                      nên ô chọn chỉ hiện những mức còn trống — muốn đổi một đáp án sang điểm
                      đang có đáp án khác giữ thì phải đổi đáp án kia trước. Thang ít đáp án như
                      "Có/Không" nên dùng 1 và {maximumAnswerScaleOptions} để cùng dải điểm với
                      thang mức độ hài lòng.
                    </>
                  )}
                </p>

                <div className="answer-scale-option-actions">
                  {/* Đủ mức thì bỏ hẳn nút, không để nút xám nằm đó cho người dùng
                      bấm thử rồi tự hỏi vì sao không ăn. */}
                  {!scaleIsFull && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        setScaleForm((prev) => {
                          // Gợi ý giá trị chưa dùng nhỏ nhất để đỡ phải sửa tay.
                          const used = new Set(prev.options.map((option) => Number(option.value)));
                          const next =
                            Array.from(
                              { length: maximumAnswerScaleOptions },
                              (_, offset) => offset + 1
                            ).find((value) => !used.has(value)) ?? 1;
                          const options = [
                            ...prev.options,
                            { value: String(next), displayText: '' },
                          ];

                          // Đủ mức thì cả 1..5 đều đã có chủ, nên xếp lại theo điểm
                          // tăng dần: thứ tự dòng khớp thứ tự điểm, không còn cảnh
                          // dòng 1 điểm nằm dưới dòng 5 điểm.
                          return {
                            ...prev,
                            options:
                              options.length === maximumAnswerScaleOptions
                                ? options
                                    .slice()
                                    .sort((left, right) => Number(left.value) - Number(right.value))
                                : options,
                          };
                        })
                      }
                    >
                      <Plus aria-hidden="true" size={16} />
                      Thêm đáp án
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setScaleForm((prev) => ({
                        ...prev,
                        options: prev.options.slice(0, -1),
                      }))
                    }
                    disabled={scaleForm.options.length <= 2}
                  >
                    Bớt đáp án
                  </button>
                </div>
              </>
            )}

            <div className="modal-footer catalog-form-actions">
              {scaleForm.answerScaleId !== null && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={openScaleCreate}
                  disabled={scaleSaving}
                >
                  Thêm thang mới
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={scaleSaving}>
                {scaleSaving ? (
                  <LoaderCircle className="auth-spin" aria-hidden="true" size={16} />
                ) : (
                  <Save aria-hidden="true" size={16} />
                )}
                {scaleForm.answerScaleId === null ? 'Tạo thang trả lời' : 'Lưu thang trả lời'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal
        isOpen={viewing !== null}
        onClose={() => setViewing(null)}
        title={
          viewing
            ? `${viewing.templateName} (${viewing.questions.length} câu · ${viewing.sections.length} mục)`
            : ''
        }
      >
        <div className="survey-question-preview">
          {viewing && (
            <p className="survey-question-preview-scale">
              Thang trả lời đang dùng: <strong>{scaleNamesOf(viewing) || '—'}</strong>
            </p>
          )}
          {viewing?.sections.map((section) => (
            <section className="survey-question-preview-section" key={section.sectionId}>
              <h4>{section.sectionName}</h4>
              <ul>
                {viewing.questions
                  .filter((question) => question.sectionId === section.sectionId)
                  .map((question) => (
                    <li key={question.questionId}>
                      {/* Câu bẫy không có số ở mọi màn quản trị, chỉ hiện nhãn. */}
                      <span className="survey-question-preview-order">
                        {question.attentionCheckValue === null
                          ? `${previewOrders.get(question.questionId)}.`
                          : 'Bẫy'}
                      </span>
                      {question.questionText}
                      <span className="survey-question-preview-badge">
                        {scaleNameOf(question.answerScaleId)}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="modal-footer catalog-form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setViewing(null)}>
            Đóng
          </button>
        </div>
      </Modal>

      <SurveyTemplateImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        answerScales={answerScales}
        onImport={handleImport}
      />

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        title="Xóa bộ câu hỏi khảo sát"
        recordName={deleting?.templateName ?? ''}
        warning={'Các câu hỏi trong bộ bị xóa theo (ON DELETE CASCADE).'}
      />
    </div>
  );
};
