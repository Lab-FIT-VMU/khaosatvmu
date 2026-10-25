import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  LoaderCircle,
  Palette,
  Pencil,
  Plus,
  QrCode,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/authContext';
import { isUnrestrictedRole } from '../auth/roles';
import { CreateSurveyDialog } from '../components/CreateSurveyDialog';
import { ConfirmDialog, Modal } from '../components/Modal';
import { QRCodeModal } from '../components/QRCodeModal';
import { SearchableSelect } from '../components/SearchableSelect';
import { SurveyFormDesigner } from '../components/SurveyFormDesigner';
import type { SurveyPreviewData } from '../components/SurveyFormPreview';
import { TablePagination } from '../components/TablePagination';
import { useSemester } from '../context/semesterContext';
import { ApiError } from '../services/apiClient';
import { catalogApi } from '../services/catalogApi';
import { cohortApi, type Cohort, type CohortMajor } from '../services/cohortApi';
import {
  surveyApi,
  surveyErrorMessage,
  surveyLinkOf,
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
  SurveyUnit,
} from '../types';
import { emptySurveyFormConfig } from '../utils/surveyFormTemplates';
import { foldVietnamese } from '../utils/vietnamese';
import '../styles/catalogs.css';
import '../styles/survey-operations.css';

/*
  Trang đợt khảo sát của hai loại không đi theo lớp học phần: chương trình đào tạo (mỗi
  khoá ngành một link) và giảng viên (mỗi khoa một link). Phiếu và hình thức phiếu dùng
  chung với khảo sát học phần; trang này chỉ khác ở đơn vị được phát link.
*/

type UnitSurveyType = Exclude<SurveyType, 'COURSE'>;

interface ScheduleForm {
  startTime: string;
  endTime: string;
}

const unitPageSize = 20;

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

const toIso = (localValue: string) => new Date(localValue).toISOString();

function formatRange(startTime: string, endTime: string): string {
  const formatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  return `${formatter.format(new Date(startTime))} → ${formatter.format(new Date(endTime))}`;
}

function formatDateRange(startTime: string, endTime: string): string {
  const formatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' });
  return `${formatter.format(new Date(startTime))} → ${formatter.format(new Date(endTime))}`;
}

/** Danh từ đơn vị của từng loại, dùng trong số đếm và thông báo. */
const unitNounOf: Record<UnitSurveyType, string> = {
  PROGRAM: 'khoá ngành',
  LECTURER: 'khoa / viện',
};

const scopeOptionsOf: Record<UnitSurveyType, { value: SurveyScopeType; label: string }[]> = {
  PROGRAM: [
    { value: 'all', label: 'Mọi khoá ngành' },
    { value: 'faculty', label: 'Khoá ngành thuộc một khoa' },
    { value: 'cohort', label: 'Mọi khoá ngành của một khoá học' },
    { value: 'cohort-major', label: 'Một khoá ngành' },
  ],
  LECTURER: [
    { value: 'all', label: 'Mọi khoa / viện' },
    { value: 'faculty', label: 'Một khoa / viện' },
  ],
};

interface UnitTableProps {
  surveyType: UnitSurveyType;
  survey: SemesterSurvey;
  units: SurveyUnit[] | undefined;
  onCopyLink: (linkToken: string) => void;
  onShowQr: (unit: SurveyUnit) => void;
}

/** Bảng đơn vị của một đợt: tìm kiếm, phân trang, link và QR từng dòng. */
const UnitTable: React.FC<UnitTableProps> = ({ surveyType, survey, units, onCopyLink, onShowQr }) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const isProgram = surveyType === 'PROGRAM';
  const columnCount = isProgram ? 7 : 6;

  const filtered = useMemo(() => {
    const rows = units ?? [];
    const folded = foldVietnamese(search);
    return folded
      ? rows.filter((unit) => foldVietnamese(
        [unit.facultyName, unit.unitCode, unit.unitName, unit.cohortName].join(' '),
      ).includes(folded))
      : rows;
  }, [units, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / unitPageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * unitPageSize, currentPage * unitPageSize);

  return (
    <>
      {(units?.length ?? 0) > 0 && (
        <div className="campaign-section-toolbar">
          <label className="catalog-search campaign-section-search">
            <Search aria-hidden="true" size={16} />
            <input
              type="search"
              value={search}
              placeholder={isProgram ? 'Tìm khoa, khoá ngành, ngành...' : 'Tìm khoa / viện...'}
              aria-label={`Tìm kiếm đơn vị trong đợt ${survey.surveyName}`}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
      )}

      <div className="campaign-table-scroll" id={`semester-survey-${survey.semesterSurveyId}`}>
        <table className="campaign-table">
          <thead>
            <tr>
              <th style={{ width: isProgram ? '18%' : '30%' }}>Khoa / Viện</th>
              {isProgram && <th style={{ width: '22%' }}>Khoá ngành</th>}
              {!isProgram && <th style={{ width: '8%' }}>Sĩ số</th>}
              <th style={{ width: '22%' }}>Đường dẫn riêng</th>
              <th style={{ width: '12%' }}>Thời gian mở</th>
              <th style={{ width: '10%' }}>Lượt trả lời</th>
              {isProgram && <th style={{ width: '8%' }}>Ý kiến khác</th>}
              <th style={{ width: '8%' }}>Ảnh QR</th>
            </tr>
          </thead>
          <tbody>
            {units === undefined && (
              <tr>
                <td colSpan={columnCount}>Đang tải danh sách đơn vị...</td>
              </tr>
            )}
            {units !== undefined && filtered.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="campaign-filter-empty">
                  {units.length === 0
                    ? `Đợt này chưa có ${unitNounOf[surveyType]} nào.`
                    : 'Không có đơn vị nào phù hợp với tìm kiếm.'}
                </td>
              </tr>
            )}
            {visible.map((unit) => (
              <tr key={unit.courseSectionSurveyId}>
                <td title={unit.facultyName}>{unit.facultyName || 'Chưa gắn khoa'}</td>
                {isProgram && (
                  <td className="campaign-primary-cell" title={`${unit.unitCode} – ${unit.unitName}`}>
                    <div className="campaign-primary-value">
                      <span>
                        <strong>{unit.unitCode}</strong> – {unit.unitName}
                        {unit.cohortName && <> · {unit.cohortName}</>}
                      </span>
                    </div>
                  </td>
                )}
                {!isProgram && (
                  <td className="campaign-number-cell" style={{ textAlign: 'right' }}>
                    {unit.targetCount ?? '—'}
                  </td>
                )}
                <td className="campaign-link-cell">
                  <div className="campaign-link-row">
                    <input
                      className="campaign-link-input"
                      aria-label={`Đường dẫn khảo sát ${unit.unitCode}`}
                      type="text"
                      readOnly
                      value={surveyLinkOf(unit.linkToken)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary operation-icon-button"
                      onClick={() => onCopyLink(unit.linkToken)}
                      title="Sao chép đường dẫn"
                      aria-label={`Sao chép đường dẫn ${unit.unitCode}`}
                    >
                      <Copy className="operation-icon" aria-hidden="true" />
                    </button>
                  </div>
                </td>
                <td className="campaign-schedule-cell">
                  <div className="campaign-date">
                    <CalendarDays className="operation-icon" aria-hidden="true" />
                    <span>{formatDateRange(unit.startTime, unit.endTime)}</span>
                  </div>
                </td>
                <td className="campaign-number-cell" style={{ textAlign: 'right' }}>
                  {/* CTĐT không có sĩ số nên chỉ đếm phiếu, không có tỷ lệ. */}
                  <span className="operations-count campaign-response-count">
                    {unit.targetCount === null
                      ? unit.responseCount
                      : `${unit.responseCount}/${unit.targetCount}`}
                  </span>
                </td>
                {isProgram && (
                  <td className="campaign-number-cell" style={{ textAlign: 'right' }}>
                    {unit.openCommentCount}
                  </td>
                )}
                <td className="campaign-qr-cell">
                  <div className="campaign-row-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onShowQr(unit)}
                    >
                      <QrCode className="operation-icon" aria-hidden="true" />
                      QR
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="section-survey-pagination">
          <TablePagination
            page={currentPage}
            pageSize={unitPageSize}
            totalItems={filtered.length}
            itemLabel={unitNounOf[surveyType]}
            onPageChange={setPage}
          />
        </div>
      )}
    </>
  );
};

interface UnitSurveysPageProps {
  surveyType: UnitSurveyType;
  /** Chuyển sang trang đợt của loại khác khi hộp thoại tạo ra đợt loại đó. */
  onOpenSurveyType?: (surveyType: SurveyType) => void;
  onSurveysChanged?: () => void;
}

export const UnitSurveysPage: React.FC<UnitSurveysPageProps> = ({
  surveyType,
  onOpenSurveyType,
  onSurveysChanged,
}) => {
  const { academicYears, activeSemesterId } = useSemester();
  const [semesterId, setSemesterId] = useState<string>(() =>
    activeSemesterId ? String(activeSemesterId) : ''
  );
  useEffect(() => {
    if (activeSemesterId) setSemesterId(String(activeSemesterId));
  }, [activeSemesterId]);

  // Hai loại này chỉ quản trị toàn trường thao tác được — backend cũng chặn như vậy.
  const { activeProfile } = useAuth();
  const canManage = isUnrestrictedRole(activeProfile?.roleCode);

  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [answerScales, setAnswerScales] = useState<AnswerScale[]>([]);
  const [surveys, setSurveys] = useState<SemesterSurvey[]>([]);
  const [unitsBySurvey, setUnitsBySurvey] = useState<Record<number, SurveyUnit[]>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [qrTarget, setQrTarget] = useState<SurveyUnit | null>(null);
  const [deleting, setDeleting] = useState<SemesterSurvey | null>(null);

  const [editing, setEditing] = useState<SemesterSurvey | null>(null);
  const [editName, setEditName] = useState('');
  const [editSchedule, setEditSchedule] = useState<ScheduleForm>({ startTime: '', endTime: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [designerTarget, setDesignerTarget] = useState<SemesterSurvey | null>(null);
  const [savingFormConfig, setSavingFormConfig] = useState(false);

  const [addTarget, setAddTarget] = useState<SemesterSurvey | null>(null);
  const [addScopeType, setAddScopeType] = useState<SurveyScopeType>('all');
  const [addScopeId, setAddScopeId] = useState('');
  const [addSchedule, setAddSchedule] = useState<ScheduleForm>({ startTime: '', endTime: '' });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortMajors, setCohortMajors] = useState<CohortMajor[]>([]);

  const typeLabel = surveyTypeLabels[surveyType];

  useEffect(() => {
    if (!canManage) return;
    const load = async () => {
      try {
        const [nextTemplates, nextScales] = await Promise.all([
          surveyApi.templates(),
          surveyApi.answerScales(),
        ]);
        setTemplates(nextTemplates);
        setAnswerScales(nextScales);
      } catch (error) {
        setLoadError(messageFrom(error));
      }
    };
    void load();
  }, [canManage]);

  const loadUnits = useCallback(async (semesterSurveyId: number) => {
    try {
      const units = await surveyApi.surveyUnits(semesterSurveyId);
      setUnitsBySurvey((prev) => ({ ...prev, [semesterSurveyId]: units }));
    } catch (error) {
      toast.error('Không tải được danh sách đơn vị', { description: messageFrom(error) });
    }
  }, []);

  const loadSurveys = useCallback(async (selectedSemesterId: string, expandFirst = false) => {
    if (!selectedSemesterId) {
      setSurveys([]);
      return;
    }
    setLoading(true);
    try {
      const next = await surveyApi.semesterSurveys(Number(selectedSemesterId), undefined, surveyType);
      setSurveys(next);
      setLoadError(null);
      if (expandFirst && next.length > 0) {
        const newest = next[0].semesterSurveyId;
        setExpanded((prev) => ({ ...prev, [newest]: true }));
        await loadUnits(newest);
      }
    } catch (error) {
      setLoadError(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }, [surveyType, loadUnits]);

  useEffect(() => {
    setExpanded({});
    setUnitsBySurvey({});
    void loadSurveys(semesterId, true);
  }, [semesterId, loadSurveys]);

  const toggleExpanded = async (semesterSurveyId: number) => {
    const willExpand = !expanded[semesterSurveyId];
    setExpanded((prev) => ({ ...prev, [semesterSurveyId]: willExpand }));
    if (willExpand && !unitsBySurvey[semesterSurveyId]) {
      await loadUnits(semesterSurveyId);
    }
  };

  const handleCreated = async (created: SemesterSurvey) => {
    setIsCreateOpen(false);
    onSurveysChanged?.();
    toast.success(`Đã tạo bài khảo sát ${surveyTypeLabels[created.surveyType].toLowerCase()}`, {
      description: `${created.surveyName} · ${created.sectionSurveyCount} đơn vị`,
    });
    if (created.surveyType !== surveyType) {
      onOpenSurveyType?.(created.surveyType);
      return;
    }
    await loadSurveys(semesterId);
    setExpanded((prev) => ({ ...prev, [created.semesterSurveyId]: true }));
    await loadUnits(created.semesterSurveyId);
  };

  const handleCopyLink = async (linkToken: string) => {
    try {
      await navigator.clipboard.writeText(surveyLinkOf(linkToken));
      toast.success('Đã sao chép đường dẫn khảo sát');
    } catch {
      toast.error('Không thể sao chép tự động', {
        description: 'Hãy chọn và sao chép đường dẫn trong ô bên cạnh.',
      });
    }
  };

  const openEdit = (survey: SemesterSurvey) => {
    setEditing(survey);
    setEditName(survey.surveyName);
    setEditSchedule({
      startTime: toLocalInput(survey.startTime),
      endTime: toLocalInput(survey.endTime),
    });
    setEditError(null);
  };

  // Đổi lịch tổng thì lịch từng đơn vị đổi theo, cùng luật với khảo sát học phần: đơn vị
  // đang dùng lịch tổng nhận lịch mới, đơn vị có lịch riêng bị thu lại cho nằm trong.
  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (!editName.trim()) {
      setEditError('Vui lòng nhập tên đợt khảo sát.');
      return;
    }
    if (new Date(editSchedule.endTime) <= new Date(editSchedule.startTime)) {
      setEditError('Thời gian đóng phải sau thời gian mở.');
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await surveyApi.updateSemesterSurvey(editing.semesterSurveyId, {
        surveyName: editName.trim(),
        startTime: toIso(editSchedule.startTime),
        endTime: toIso(editSchedule.endTime),
      });
      await loadSurveys(semesterId);
      if (unitsBySurvey[editing.semesterSurveyId]) await loadUnits(editing.semesterSurveyId);
      onSurveysChanged?.();
      toast.success('Đã cập nhật đợt khảo sát', { description: updated.surveyName });
      setEditing(null);
    } catch (error) {
      setEditError(messageFrom(error));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await surveyApi.deleteSemesterSurvey(deleting.semesterSurveyId);
      await loadSurveys(semesterId);
      onSurveysChanged?.();
      toast.success('Đã xóa đợt khảo sát', { description: deleting.surveyName });
    } catch (error) {
      toast.error('Không thể xóa đợt khảo sát', { description: messageFrom(error) });
    } finally {
      setDeleting(null);
    }
  };

  const designerValue = useMemo(
    () => designerTarget?.formConfig ?? emptySurveyFormConfig(),
    [designerTarget],
  );
  const designerData = useMemo((): SurveyPreviewData | undefined => {
    if (!designerTarget) return undefined;
    const template = templates.find(
      (item) => item.surveyTemplateId === designerTarget.surveyTemplateId,
    );
    if (!template) return undefined;
    const scaleById = new Map(answerScales.map((scale) => [scale.answerScaleId, scale]));
    return {
      surveyName: designerTarget.surveyName,
      templateName: template.templateName,
      surveyType: designerTarget.surveyType,
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
  }, [designerTarget, templates, answerScales]);

  const saveFormConfig = async (survey: SemesterSurvey, config: SurveyFormConfig) => {
    setSavingFormConfig(true);
    try {
      await surveyApi.saveSemesterSurveyFormConfig(survey.semesterSurveyId, config);
      await loadSurveys(semesterId);
      setDesignerTarget(null);
      toast.success('Đã lưu hình thức phiếu', { description: survey.surveyName });
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSavingFormConfig(false);
    }
  };

  const openAdd = async (survey: SemesterSurvey) => {
    setAddTarget(survey);
    setAddScopeType('all');
    setAddScopeId('');
    setAddSchedule({
      startTime: toLocalInput(survey.startTime),
      endTime: toLocalInput(survey.endTime),
    });
    setAddError(null);
    try {
      const [nextFaculties, nextCohorts, nextCohortMajors] = await Promise.all([
        catalogApi.faculties(),
        surveyType === 'PROGRAM' ? cohortApi.cohorts() : Promise.resolve([]),
        surveyType === 'PROGRAM' ? cohortApi.cohortMajors() : Promise.resolve([]),
      ]);
      setFaculties(nextFaculties);
      setCohorts(nextCohorts);
      setCohortMajors(nextCohortMajors);
    } catch (error) {
      setAddError(messageFrom(error));
    }
  };

  const addScopeOptions = useMemo(() => {
    if (addScopeType === 'faculty') {
      return faculties.map((item) => ({ value: String(item.facultyId), label: item.facultyName }));
    }
    if (addScopeType === 'cohort') {
      return cohorts.map((item) => ({
        value: String(item.cohortId),
        label: `${item.cohortName} (${item.academicYearName})`,
      }));
    }
    if (addScopeType === 'cohort-major') {
      return cohortMajors.map((item) => ({
        value: String(item.cohortMajorId),
        label: `${item.cohortMajorCode} – ${item.majorName}`,
      }));
    }
    return [];
  }, [addScopeType, faculties, cohorts, cohortMajors]);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!addTarget) return;
    if (addScopeType !== 'all' && !addScopeId) {
      setAddError('Vui lòng chọn đơn vị cho phạm vi đã chọn.');
      return;
    }
    if (new Date(addSchedule.endTime) <= new Date(addSchedule.startTime)) {
      setAddError('Thời gian đóng phải sau thời gian mở.');
      return;
    }
    setAdding(true);
    try {
      const result = await surveyApi.addSectionsToSemesterSurvey(addTarget.semesterSurveyId, {
        scopeType: addScopeType,
        scopeId: addScopeType === 'all' ? null : Number(addScopeId),
        startTime: toIso(addSchedule.startTime),
        endTime: toIso(addSchedule.endTime),
      });
      await loadSurveys(semesterId);
      if (expanded[addTarget.semesterSurveyId]) await loadUnits(addTarget.semesterSurveyId);
      onSurveysChanged?.();
      const skipped = result.skippedSectionCount > 0
        ? ` · bỏ qua ${result.skippedSectionCount} đã có`
        : '';
      toast.success(`Đã thêm ${unitNounOf[surveyType]}`, {
        description: `${result.surveyName} · thêm ${result.createdSectionCount}${skipped}`,
      });
      setAddTarget(null);
    } catch (error) {
      setAddError(messageFrom(error));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="survey-operations-page course-surveys-page">
      <section className="operations-toolbar" aria-label="Chọn học kỳ">
        <div className="operations-filter-title">
          <CalendarDays className="operation-icon" aria-hidden="true" />
          <span>Chọn học kỳ cần khảo sát</span>
        </div>
        <div className="operations-field">
          <select
            id={`unit-survey-semester-${surveyType}`}
            value={semesterId}
            onChange={(event) => setSemesterId(event.target.value)}
          >
            <option value="">Chọn học kỳ</option>
            {academicYears.map((year) => (
              <optgroup key={year.academicYearId} label={year.academicYearName}>
                {year.semesters.map((semester) => (
                  <option key={semester.semesterId} value={String(semester.semesterId)}>
                    {semester.semesterName} ({year.academicYearName})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {canManage && (
          <div className="operations-tab-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!semesterId}
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="operation-icon" aria-hidden="true" />
              Tạo bài khảo sát
            </button>
          </div>
        )}
      </section>

      {loadError && (
        <div className="operations-feedback operations-feedback--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {!semesterId && (
        <div className="operations-empty">
          <CalendarDays className="operation-icon" aria-hidden="true" />
          <strong>Chọn một học kỳ để xem hoặc tạo bài khảo sát {typeLabel.toLowerCase()}</strong>
        </div>
      )}

      {semesterId && loading && (
        <div className="operations-empty" role="status">
          <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          <strong>Đang tải đợt khảo sát...</strong>
        </div>
      )}

      {semesterId && !loading && surveys.length === 0 && !loadError && (
        <div className="operations-empty">
          <QrCode className="operation-icon" aria-hidden="true" />
          <strong>Học kỳ này chưa có bài khảo sát {typeLabel.toLowerCase()} nào</strong>
          <span>
            {surveyType === 'PROGRAM'
              ? 'Bấm "Tạo bài khảo sát" và chọn loại Chương trình đào tạo: mỗi khoá ngành nhận một đường dẫn và mã QR riêng.'
              : 'Bấm "Tạo bài khảo sát" và chọn loại Giảng viên: mỗi khoa / viện nhận một đường dẫn và mã QR riêng.'}
          </span>
        </div>
      )}

      {semesterId && !loading && surveys.map((survey) => {
        const isExpanded = expanded[survey.semesterSurveyId] ?? false;
        return (
          <section className="semester-survey-card" key={survey.semesterSurveyId}>
            <header className="semester-survey-header">
              <button
                type="button"
                className="semester-survey-toggle"
                onClick={() => void toggleExpanded(survey.semesterSurveyId)}
                aria-expanded={isExpanded}
                aria-controls={`semester-survey-${survey.semesterSurveyId}`}
              >
                {isExpanded ? (
                  <ChevronUp className="operation-icon" aria-hidden="true" />
                ) : (
                  <ChevronDown className="operation-icon" aria-hidden="true" />
                )}
                <span className="semester-survey-title">{survey.surveyName}</span>
                <span className="operations-count">
                  {survey.sectionSurveyCount} {unitNounOf[surveyType]}
                </span>
              </button>

              <div className="semester-survey-meta">
                <span>
                  <CalendarDays className="operation-icon" aria-hidden="true" />
                  {formatRange(survey.startTime, survey.endTime)}
                </span>
                <span>{survey.templateName}</span>
                <span>{survey.responseCount} phiếu đã thu</span>
              </div>

              {canManage && (
                <div className="semester-survey-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void openAdd(survey)}
                  >
                    <Plus className="operation-icon" aria-hidden="true" />
                    Thêm {unitNounOf[surveyType]}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEdit(survey)}
                  >
                    <Pencil className="operation-icon" aria-hidden="true" />
                    Chỉnh sửa
                  </button>
                  {new Date(survey.startTime) > new Date() && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setDesignerTarget(survey)}
                    >
                      <Palette className="operation-icon" aria-hidden="true" />
                      Hình thức phiếu
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setDeleting(survey)}
                  >
                    <Trash2 className="operation-icon" aria-hidden="true" />
                    Xóa đợt
                  </button>
                </div>
              )}
            </header>

            {isExpanded && (
              <UnitTable
                surveyType={surveyType}
                survey={survey}
                units={unitsBySurvey[survey.semesterSurveyId]}
                onCopyLink={(linkToken) => void handleCopyLink(linkToken)}
                onShowQr={setQrTarget}
              />
            )}
          </section>
        );
      })}

      <CreateSurveyDialog
        isOpen={isCreateOpen}
        semesterId={semesterId ? Number(semesterId) : null}
        templates={templates}
        answerScales={answerScales}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleCreated}
      />

      <Modal
        isOpen={editing !== null}
        onClose={() => {
          if (!savingEdit) setEditing(null);
        }}
        title="Chỉnh sửa đợt khảo sát"
      >
        <form className="catalog-form" onSubmit={(event) => void handleSaveEdit(event)}>
          {editError && <div className="catalog-validation-error" role="alert">{editError}</div>}
          <div className="form-group">
            <label htmlFor="edit-unit-survey-name">Tên đợt khảo sát</label>
            <input
              id="edit-unit-survey-name"
              type="text"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              required
            />
          </div>
          <div className="catalog-context-band">
            Đổi lịch tổng thì lịch từng {unitNounOf[surveyType]} đổi theo. Phiếu đã thu không bị
            ảnh hưởng.
          </div>
          <div className="catalog-form-grid catalog-form-grid--2">
            <div className="form-group">
              <label htmlFor="edit-unit-survey-start">Thời gian mở</label>
              <input
                id="edit-unit-survey-start"
                type="datetime-local"
                value={editSchedule.startTime}
                onChange={(event) =>
                  setEditSchedule((prev) => ({ ...prev, startTime: event.target.value }))
                }
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-unit-survey-end">Thời gian đóng</label>
              <input
                id="edit-unit-survey-end"
                type="datetime-local"
                value={editSchedule.endTime}
                onChange={(event) =>
                  setEditSchedule((prev) => ({ ...prev, endTime: event.target.value }))
                }
                required
              />
            </div>
          </div>
          <div className="modal-footer catalog-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditing(null)}
              disabled={savingEdit}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? (
                <LoaderCircle className="auth-spin" aria-hidden="true" size={16} />
              ) : (
                <Save aria-hidden="true" size={16} />
              )}
              Lưu thay đổi
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={addTarget !== null}
        onClose={() => {
          if (!adding) setAddTarget(null);
        }}
        title={`Thêm ${unitNounOf[surveyType]} vào đợt khảo sát`}
      >
        <form className="catalog-form" onSubmit={(event) => void handleAdd(event)}>
          {addError && <div className="catalog-validation-error" role="alert">{addError}</div>}
          <div className="catalog-context-band">
            {addTarget ? `${addTarget.surveyName} — ${addTarget.semesterName}` : ''}
            <br />
            Đơn vị đã có đường dẫn trong đợt sẽ được bỏ qua, nên chọn chồng phạm vi vẫn an toàn.
            {addTarget && (
              <>
                <br />
                Lịch tổng: <strong>{formatRange(addTarget.startTime, addTarget.endTime)}</strong>.
              </>
            )}
          </div>
          <div className="catalog-form-grid catalog-form-grid--2">
            <div className="form-group">
              <label htmlFor="add-unit-scope">Phạm vi</label>
              <select
                id="add-unit-scope"
                value={addScopeType}
                onChange={(event) => {
                  setAddScopeType(event.target.value as SurveyScopeType);
                  setAddScopeId('');
                }}
              >
                {scopeOptionsOf[surveyType].map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            {addScopeType !== 'all' && (
              <div className="form-group">
                <label htmlFor="add-unit-scope-id">Đơn vị</label>
                <SearchableSelect
                  id="add-unit-scope-id"
                  value={addScopeId}
                  onChange={setAddScopeId}
                  required
                  placeholder="Chọn đơn vị"
                  options={addScopeOptions}
                />
              </div>
            )}
          </div>
          <div className="catalog-form-grid catalog-form-grid--2">
            <div className="form-group">
              <label htmlFor="add-unit-start">Thời gian mở</label>
              <input
                id="add-unit-start"
                type="datetime-local"
                value={addSchedule.startTime}
                min={addTarget ? toLocalInput(addTarget.startTime) : undefined}
                max={addTarget ? toLocalInput(addTarget.endTime) : undefined}
                onChange={(event) =>
                  setAddSchedule((prev) => ({ ...prev, startTime: event.target.value }))
                }
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="add-unit-end">Thời gian đóng</label>
              <input
                id="add-unit-end"
                type="datetime-local"
                value={addSchedule.endTime}
                min={addTarget ? toLocalInput(addTarget.startTime) : undefined}
                max={addTarget ? toLocalInput(addTarget.endTime) : undefined}
                onChange={(event) =>
                  setAddSchedule((prev) => ({ ...prev, endTime: event.target.value }))
                }
                required
              />
            </div>
          </div>
          <div className="modal-footer catalog-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAddTarget(null)}
              disabled={adding}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={adding}>
              {adding ? 'Đang thêm...' : 'Thêm vào đợt'}
            </button>
          </div>
        </form>
      </Modal>

      <SurveyFormDesigner
        isOpen={designerTarget !== null}
        value={designerValue}
        saving={savingFormConfig}
        data={designerData}
        onClose={() => setDesignerTarget(null)}
        onSave={(config) => {
          if (designerTarget) void saveFormConfig(designerTarget, config);
        }}
      />

      <QRCodeModal
        isOpen={qrTarget !== null}
        onClose={() => setQrTarget(null)}
        title={qrTarget
          ? (surveyType === 'PROGRAM' ? `${qrTarget.unitCode} – ${qrTarget.unitName}` : qrTarget.unitName)
          : ''}
        subtitle={qrTarget
          ? [qrTarget.cohortName, qrTarget.facultyName, formatRange(qrTarget.startTime, qrTarget.endTime)]
            .filter(Boolean)
            .join(' • ')
          : ''}
        surveyLink={qrTarget ? surveyLinkOf(qrTarget.linkToken) : ''}
        downloadFileName={qrTarget ? `ma qr khao sat ${qrTarget.unitCode}` : undefined}
        onOpenSurveySimulator={() => {
          if (qrTarget) window.open(surveyLinkOf(qrTarget.linkToken), '_blank', 'noreferrer');
        }}
      />

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        title="Xóa đợt khảo sát"
        recordName={deleting ? `${deleting.surveyName} - ${deleting.semesterName}` : ''}
        warning={`Toàn bộ đường dẫn của các ${unitNounOf[surveyType]} trong đợt sẽ bị xóa theo.`}
      />
    </div>
  );
};
