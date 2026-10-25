import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, GraduationCap, LoaderCircle, Palette, Presentation, Save } from 'lucide-react';
import { Modal } from './Modal';
import { SearchableSelect } from './SearchableSelect';
import { SurveyFormDesigner } from './SurveyFormDesigner';
import type { SurveyPreviewData } from './SurveyFormPreview';
import { ApiError } from '../services/apiClient';
import { catalogApi } from '../services/catalogApi';
import { cohortApi, type Cohort } from '../services/cohortApi';
import {
  surveyApi,
  surveyErrorMessage,
  surveyTypeLabels,
  type SurveyScopeType,
} from '../services/surveyApi';
import type {
  AnswerScale,
  Faculty,
  SemesterSurvey,
  SurveyFormConfig,
  SurveyTemplate,
  SurveyType,
} from '../types';
import { emptySurveyFormConfig, surveyFormTemplates } from '../utils/surveyFormTemplates';

/*
  Hộp thoại tạo đợt khảo sát, dùng chung cho cả ba loại. Bước đầu bắt buộc chọn loại:
  loại quyết định đơn vị được phát link (lớp học phần / khoá ngành / khoa) nên mọi trường
  phía dưới đều phụ thuộc nó, và chọn xong thì không đổi được nữa.
*/

interface ScheduleForm {
  startTime: string;
  endTime: string;
}

const defaultSchedule = (): ScheduleForm => {
  const now = new Date();
  const nextMonth = new Date();
  nextMonth.setMonth(now.getMonth() + 1);
  const format = (date: Date) => date.toISOString().slice(0, 16);
  return { startTime: format(now), endTime: format(nextMonth) };
};

const toIso = (localValue: string) => new Date(localValue).toISOString();

const typeOptions: { type: SurveyType; icon: React.ReactNode; description: string }[] = [
  {
    type: 'COURSE',
    icon: <BookOpen size={16} aria-hidden="true" />,
    description: 'Sinh viên đánh giá lớp học phần. Mỗi lớp một link, có sĩ số.',
  },
  {
    type: 'PROGRAM',
    icon: <GraduationCap size={16} aria-hidden="true" />,
    description: 'Đánh giá chương trình đào tạo. Mỗi khoá ngành một link, không có sĩ số.',
  },
  {
    type: 'LECTURER',
    icon: <Presentation size={16} aria-hidden="true" />,
    description: 'Giảng viên trả lời. Mỗi khoa một link, sĩ số là số giảng viên của khoa.',
  },
];

/** Phạm vi chọn được của từng loại. Học phần luôn phát cho cả kỳ như trước. */
const scopeOptionsOf: Record<SurveyType, { value: SurveyScopeType; label: string }[]> = {
  COURSE: [],
  PROGRAM: [
    { value: 'faculty', label: 'Khoá ngành thuộc một khoa' },
    { value: 'cohort', label: 'Mọi khoá ngành của một khoá học' },
  ],
  LECTURER: [
    { value: 'all', label: 'Mọi khoa / viện' },
    { value: 'faculty', label: 'Một khoa / viện' },
  ],
};

/** Đơn vị đếm trong dòng xem trước: "12 khoá ngành", "8 khoa". */
const unitNounOf: Record<SurveyType, string> = {
  COURSE: 'lớp học phần',
  PROGRAM: 'khoá ngành',
  LECTURER: 'khoa / viện',
};

const templateNameOf = (config: SurveyFormConfig | null | undefined): string =>
  surveyFormTemplates.find((template) => template.id === config?.templateId)?.name
    ?? 'Chưa chọn mẫu';

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

interface CreateSurveyDialogProps {
  isOpen: boolean;
  semesterId: number | null;
  templates: SurveyTemplate[];
  answerScales: AnswerScale[];
  onClose: () => void;
  /** Gọi sau khi tạo xong; trang mở hộp thoại tự nạp lại hoặc chuyển sang trang của loại khác. */
  onCreated: (survey: SemesterSurvey) => void | Promise<void>;
}

export const CreateSurveyDialog: React.FC<CreateSurveyDialogProps> = ({
  isOpen,
  semesterId,
  templates,
  answerScales,
  onClose,
  onCreated,
}) => {
  const [surveyType, setSurveyType] = useState<SurveyType | null>(null);
  const [surveyName, setSurveyName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [schedule, setSchedule] = useState<ScheduleForm>(defaultSchedule);
  const [scopeType, setScopeType] = useState<SurveyScopeType>('all');
  const [scopeId, setScopeId] = useState('');
  const [formConfig, setFormConfig] = useState<SurveyFormConfig>(emptySurveyFormConfig);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  /** Số đơn vị sẽ được phát link; null là đang đếm hoặc đếm hụt. */
  const [unitCount, setUnitCount] = useState<number | null>(null);

  // Mỗi lần mở là một lần tạo mới: xoá sạch lựa chọn cũ, kể cả loại.
  useEffect(() => {
    if (!isOpen) return;
    setSurveyType(null);
    setSurveyName('');
    setTemplateId(templates.length === 1 ? String(templates[0].surveyTemplateId) : '');
    setSchedule(defaultSchedule());
    setScopeType('all');
    setScopeId('');
    setFormConfig(emptySurveyFormConfig());
    setError(null);
  }, [isOpen, templates]);

  // Danh mục cho phần phạm vi chỉ cần khi chọn loại có phạm vi; nạp một lần mỗi lần mở.
  useEffect(() => {
    if (!isOpen || surveyType === null || surveyType === 'COURSE') return;
    let cancelled = false;
    const load = async () => {
      try {
        const [nextFaculties, nextCohorts] = await Promise.all([
          catalogApi.faculties(),
          surveyType === 'PROGRAM' ? cohortApi.cohorts() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setFaculties(nextFaculties);
        setCohorts(nextCohorts);
      } catch (loadError) {
        if (!cancelled) setError(messageFrom(loadError));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, surveyType]);

  // Đếm số đơn vị ở server để khớp đúng lúc tạo thật.
  const scopeReady = scopeType === 'all' || scopeId !== '';
  useEffect(() => {
    if (!isOpen || surveyType === null || semesterId === null || !scopeReady) {
      setUnitCount(null);
      return;
    }
    let cancelled = false;
    setUnitCount(null);
    surveyApi.previewSectionScope({
      semesterId,
      surveyType,
      scopeType: surveyType === 'COURSE' ? 'all' : scopeType,
      scopeId: surveyType === 'COURSE' || scopeType === 'all' ? null : Number(scopeId),
    })
      .then((preview) => {
        if (!cancelled) setUnitCount(preview.scopeSectionCount);
      })
      .catch(() => {
        if (!cancelled) setUnitCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, surveyType, semesterId, scopeType, scopeId, scopeReady]);

  const scopeUnitOptions = useMemo(() => {
    if (scopeType === 'faculty') {
      return faculties.map((faculty) => ({
        value: String(faculty.facultyId),
        label: faculty.facultyName,
      }));
    }
    if (scopeType === 'cohort') {
      return cohorts.map((cohort) => ({
        value: String(cohort.cohortId),
        label: `${cohort.cohortName} (${cohort.academicYearName})`,
      }));
    }
    return [];
  }, [scopeType, faculties, cohorts]);

  const scopeUnitLabel = scopeType === 'cohort' ? 'Khoá học' : 'Khoa / Viện';

  /** Bộ câu hỏi thật đưa vào màn soạn, để xem trước đúng phiếu sẽ phát. */
  const designerData = useMemo((): SurveyPreviewData | undefined => {
    const template = templates.find((item) => item.surveyTemplateId === Number(templateId));
    if (!template) return undefined;
    const scaleById = new Map(answerScales.map((scale) => [scale.answerScaleId, scale]));
    return {
      surveyName,
      templateName: template.templateName,
      surveyType: surveyType ?? undefined,
      sections: template.sections
        .map((section) => ({
          sectionName: section.sectionName,
          questions: template.questions
            .filter((question) => question.sectionId === section.sectionId)
            .map((question) => ({
              questionText: question.questionText,
              options: (scaleById.get(question.answerScaleId)?.options ?? [])
                .map((option) => ({ value: option.value, displayText: option.displayText })),
            })),
        }))
        .filter((section) => section.questions.length > 0),
      questionCount: template.questions.length,
    };
  }, [templates, templateId, answerScales, surveyName, surveyType]);

  const canDesignForm = surveyName.trim().length > 0 && templateId !== '';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (surveyType === null) {
      setError('Vui lòng chọn loại bài khảo sát.');
      return;
    }
    if (semesterId === null) {
      setError('Vui lòng chọn học kỳ trước.');
      return;
    }
    if (!surveyName.trim()) {
      setError('Vui lòng đặt tên cho bài khảo sát.');
      return;
    }
    if (!templateId) {
      setError('Vui lòng chọn bộ câu hỏi khảo sát.');
      return;
    }
    if (surveyType !== 'COURSE' && !scopeReady) {
      setError(`Vui lòng chọn ${scopeUnitLabel.toLowerCase()} cho phạm vi đã chọn.`);
      return;
    }
    if (new Date(schedule.endTime) <= new Date(schedule.startTime)) {
      setError('Thời gian đóng phải sau thời gian mở.');
      return;
    }

    setCreating(true);
    try {
      const created = await surveyApi.createSemesterSurvey({
        surveyName: surveyName.trim(),
        surveyType,
        semesterId,
        surveyTemplateId: Number(templateId),
        startTime: toIso(schedule.startTime),
        endTime: toIso(schedule.endTime),
        formConfig,
        ...(surveyType === 'COURSE'
          ? {}
          : {
            scopeType,
            scopeId: scopeType === 'all' ? null : Number(scopeId),
          }),
      });
      await onCreated(created);
    } catch (submitError) {
      setError(messageFrom(submitError));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => {
          if (!creating) onClose();
        }}
        title="Tạo bài khảo sát"
      >
        <form className="catalog-form" onSubmit={(event) => void handleSubmit(event)}>
          {error && <div className="catalog-validation-error" role="alert">{error}</div>}

          <div className="form-group">
            <label id="create-survey-type-label">Loại bài khảo sát</label>
            <div
              className="survey-type-picker"
              role="radiogroup"
              aria-labelledby="create-survey-type-label"
            >
              {typeOptions.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  role="radio"
                  aria-checked={surveyType === option.type}
                  className={`survey-type-option${surveyType === option.type ? ' is-selected' : ''}`}
                  onClick={() => {
                    setSurveyType(option.type);
                    // Phạm vi mặc định là lựa chọn đầu của loại; CTĐT không có "toàn trường".
                    setScopeType(scopeOptionsOf[option.type][0]?.value ?? 'all');
                    setScopeId('');
                    setError(null);
                  }}
                >
                  <strong>
                    {option.icon}
                    {surveyTypeLabels[option.type]}
                  </strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          {surveyType !== null && (
            <>
              <div className="catalog-context-band">
                {surveyType === 'COURSE' && (
                  <>
                    Mỗi lớp học phần của học kỳ được tạo một bài khảo sát riêng, dùng chung bộ câu
                    hỏi bên dưới và có đường dẫn, mã QR riêng.
                  </>
                )}
                {surveyType === 'PROGRAM' && (
                  <>
                    Mỗi khoá ngành trong phạm vi được tạo một đường dẫn và mã QR riêng. Khảo sát
                    chương trình đào tạo <strong>không có sĩ số</strong>: không giới hạn số phiếu và
                    không tính tỷ lệ phản hồi.
                  </>
                )}
                {surveyType === 'LECTURER' && (
                  <>
                    Mỗi khoa / viện trong phạm vi được tạo một đường dẫn và mã QR riêng. Sĩ số là số
                    giảng viên của khoa trong danh mục, chốt tại lúc tạo đợt.
                  </>
                )}
                {unitCount !== null && (
                  <>
                    {' '}Sẽ tạo <strong>{unitCount} {unitNounOf[surveyType]}</strong>.
                  </>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="create-survey-name">Tên bài khảo sát</label>
                <input
                  id="create-survey-name"
                  type="text"
                  value={surveyName}
                  onChange={(event) => setSurveyName(event.target.value)}
                  placeholder="VD: Khảo sát giữa kỳ đợt 1"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="create-survey-template">Bộ câu hỏi khảo sát</label>
                <SearchableSelect
                  id="create-survey-template"
                  value={templateId}
                  onChange={setTemplateId}
                  required
                  placeholder="Chọn bộ câu hỏi"
                  options={templates.map((template) => ({
                    value: String(template.surveyTemplateId),
                    label: `${template.templateName} (${template.questions.length} câu)`,
                  }))}
                />
              </div>

              {surveyType !== 'COURSE' && (
                <div className="catalog-form-grid catalog-form-grid--2">
                  <div className="form-group">
                    <label htmlFor="create-survey-scope">Phạm vi phát phiếu</label>
                    <select
                      id="create-survey-scope"
                      value={scopeType}
                      onChange={(event) => {
                        setScopeType(event.target.value as SurveyScopeType);
                        setScopeId('');
                      }}
                    >
                      {scopeOptionsOf[surveyType].map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  {scopeType !== 'all' && (
                    <div className="form-group">
                      <label htmlFor="create-survey-scope-id">{scopeUnitLabel}</label>
                      <SearchableSelect
                        id="create-survey-scope-id"
                        value={scopeId}
                        onChange={setScopeId}
                        required
                        placeholder={`Chọn ${scopeUnitLabel.toLowerCase()}`}
                        options={scopeUnitOptions}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="survey-form-picker">
                <div>
                  <strong>Mẫu phiếu: {templateNameOf(formConfig)}</strong>
                  <br />
                  <span>
                    {canDesignForm
                      ? 'Bỏ qua thì phiếu dùng mẫu mặc định của hệ thống.'
                      : 'Đặt tên bài khảo sát và chọn bộ câu hỏi trước, để xem trước đúng phiếu thật.'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={creating || !canDesignForm}
                  title={canDesignForm ? undefined : 'Đặt tên bài khảo sát và chọn bộ câu hỏi trước'}
                  onClick={() => setDesignerOpen(true)}
                >
                  <Palette className="operation-icon" aria-hidden="true" />
                  {formConfig.templateId ? 'Sửa hình thức phiếu' : 'Chọn mẫu phiếu'}
                </button>
              </div>

              <div className="catalog-form-grid catalog-form-grid--2">
                <div className="form-group">
                  <label htmlFor="create-survey-start">Thời gian mở</label>
                  <input
                    id="create-survey-start"
                    type="datetime-local"
                    value={schedule.startTime}
                    onChange={(event) =>
                      setSchedule((prev) => ({ ...prev, startTime: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="create-survey-end">Thời gian đóng</label>
                  <input
                    id="create-survey-end"
                    type="datetime-local"
                    value={schedule.endTime}
                    onChange={(event) =>
                      setSchedule((prev) => ({ ...prev, endTime: event.target.value }))
                    }
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="modal-footer catalog-form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={creating}>
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creating || surveyType === null || unitCount === 0}
              title={unitCount === 0 ? 'Phạm vi này không có đơn vị nào để phát phiếu' : undefined}
            >
              {creating ? (
                <LoaderCircle className="auth-spin" aria-hidden="true" size={16} />
              ) : (
                <Save aria-hidden="true" size={16} />
              )}
              Tạo bài khảo sát
            </button>
          </div>
        </form>
      </Modal>

      <SurveyFormDesigner
        isOpen={designerOpen}
        value={formConfig}
        data={designerData}
        onClose={() => setDesignerOpen(false)}
        onSave={(config) => {
          // Đợt chưa tồn tại nên chỉ giữ trong biểu mẫu, gửi kèm lúc bấm Tạo.
          setFormConfig(config);
          setDesignerOpen(false);
        }}
      />
    </>
  );
};
