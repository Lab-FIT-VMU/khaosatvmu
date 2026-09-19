import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  LoaderCircle,
  Pencil,
  Plus,
  Download,
  QrCode,
  Save,
  Trash2,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/authContext';
import { isUnrestrictedRole, ROLE_CODES } from '../auth/roles';
import { ConfirmDialog, Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';
import { SurveyScopePicker } from '../components/SurveyScopePicker';
import { QRCodeModal } from '../components/QRCodeModal';
import { TablePagination } from '../components/TablePagination';
import { useSemester } from '../context/semesterContext';
import { ApiError } from '../services/apiClient';
import {
  downloadCourseSurveyQrExcel,
  surveyApi,
  surveyErrorMessage,
  surveyLinkOf,
  type SurveyScopeType,
} from '../services/surveyApi';
import type {
  CourseSectionSurvey,
  SemesterSurvey,
  SurveyTemplate,
} from '../types';
import { toVietnameseFileSlug } from '../utils/vietnamese';
import '../styles/catalogs.css';
import '../styles/survey-operations.css';

interface ScheduleForm {
  startTime: string;
  endTime: string;
}

/** Một học kỳ có thể có hàng trăm lớp nên bảng lớp được phân trang. */
const sectionPageSize = 20;

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

/** Chuyển ISO 8601 sang giá trị của input datetime-local (giờ máy người dùng). */
function toLocalInput(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function toIso(localValue: string): string {
  return new Date(localValue).toISOString();
}

function formatRange(startTime: string, endTime: string): string {
  const formatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  return `${formatter.format(new Date(startTime))} → ${formatter.format(new Date(endTime))}`;
}

/**
 * Chỉ ngày, không giờ. Dùng cho cột Thời gian mở của bảng lớp: mọi lớp trong đợt
 * dùng chung một lịch nên giờ giấc lặp lại y hệt ở hàng trăm dòng, chỉ tổ chiếm
 * chỗ. Giờ cụ thể vẫn xem được ở dòng mô tả của đợt và trong mã QR.
 */
function formatDateRange(startTime: string, endTime: string): string {
  const formatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' });
  return `${formatter.format(new Date(startTime))} → ${formatter.format(new Date(endTime))}`;
}

const defaultSchedule = (): ScheduleForm => {
  const now = new Date();
  const nextMonth = new Date();
  nextMonth.setMonth(now.getMonth() + 1);

  const format = (date: Date) => date.toISOString().slice(0, 16);

  return {
    startTime: format(now),
    endTime: format(nextMonth),
  };
};

interface CourseSurveysPageProps {
  /** Chuyển sang màn Thống kê & Báo cáo để xem kết quả chi tiết của một bài khảo sát. */
  onOpenSurveyReport?: (courseSectionSurveyId: number) => void;
  /** Báo cho ứng dụng biết danh sách đợt khảo sát vừa thay đổi để cập nhật số liệu ngay lập tức. */
  onSurveysChanged?: () => void;
  /**
   * Mở trang Lớp học phần. Bỏ trống khi người dùng không có quyền vào trang đó —
   * khi ấy phần hướng dẫn chỉ còn chữ, không kèm nút bấm dẫn tới chỗ vào không được.
   */
  onOpenClasses?: () => void;
}

export const CourseSurveysPage: React.FC<CourseSurveysPageProps> = ({
  onOpenSurveyReport,
  onSurveysChanged,
  onOpenClasses,
}) => {
  const {
    academicYears,
    activeSemesterId,
  } = useSemester();
  const [semesterId, setSemesterId] = useState<string>(() =>
    activeSemesterId ? String(activeSemesterId) : ''
  );

  // Khi học kỳ làm việc toàn cục (Header) thay đổi, cập nhật trang khảo sát học phần
  useEffect(() => {
    if (activeSemesterId) {
      setSemesterId(String(activeSemesterId));
    }
  }, [activeSemesterId]);

  // Giảng viên chỉ theo dõi phiếu của lớp mình dạy: không tạo, không xoá, không sửa
  // lịch. Riêng link và mã QR thì giữ, vì chính họ là người đưa cho sinh viên.
  const { activeProfile } = useAuth();
  const roleCode = activeProfile?.roleCode;
  const canManageCampaign = isUnrestrictedRole(roleCode);
  // Thêm phạm vi chỉ còn dành cho quản trị. Trưởng bộ môn trước đây tự thêm được
  // bộ môn mình vào đợt, giờ tắt theo yêu cầu.
  const canAddScope = canManageCampaign;
  const canViewReports = canManageCampaign || roleCode === ROLE_CODES.departmentManager;
  const hideCampaignCounts =
    roleCode === ROLE_CODES.departmentManager || roleCode === ROLE_CODES.lecturer;

  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>([]);
  const [sectionSurveys, setSectionSurveys] = useState<Record<number, CourseSectionSurvey[]>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [sectionPages, setSectionPages] = useState<Record<number, number>>({});

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Số lớp học phần của kỳ đang chọn. Null nghĩa là chưa đếm được. */
  const [sectionCount, setSectionCount] = useState<number | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createSurveyName, setCreateSurveyName] = useState('');
  const [createTemplateId, setCreateTemplateId] = useState('');
  const [createScopeType, setCreateScopeType] = useState<SurveyScopeType>('all');
  const [createScopeId, setCreateScopeId] = useState('');
  const [createSchedule, setCreateSchedule] = useState<ScheduleForm>(defaultSchedule);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingSurvey, setEditingSurvey] = useState<SemesterSurvey | null>(null);
  const [editSurveyName, setEditSurveyName] = useState('');
  const [editSurveySchedule, setEditSurveySchedule] = useState<ScheduleForm>(defaultSchedule);
  const [editSurveyError, setEditSurveyError] = useState<string | null>(null);
  const [savingSurvey, setSavingSurvey] = useState(false);
  /**
   * Lịch mới kéo theo lịch các lớp: đếm sẵn để hỏi xác nhận ngay trong form trước khi
   * lưu. Null là chưa cần hỏi.
   */
  const [scheduleConfirm, setScheduleConfirm] = useState<{
    followingCount: number;
    narrowedCustomCount: number;
    closingEarlierCount: number;
  } | null>(null);

  const [deleting, setDeleting] = useState<SemesterSurvey | null>(null);
  const [qrTarget, setQrTarget] = useState<CourseSectionSurvey | null>(null);

  // Xuất Excel kèm ảnh QR. Server dựng tệp nên trình duyệt chỉ chờ tải; khoá nút
  // theo đúng đợt đang xuất để không bấm chồng.
  const [exportingId, setExportingId] = useState<number | null>(null);

  const handleExportQr = async (survey: SemesterSurvey) => {
    setExportingId(survey.semesterSurveyId);
    try {
      const { blob } = await downloadCourseSurveyQrExcel(survey.semesterSurveyId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${toVietnameseFileSlug(
        `danh sach ma qr lop hoc phan ${survey.surveyName}`
      )}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success('Đã xuất tệp Excel', { description: survey.surveyName });
    } catch (error) {
      toast.error('Không xuất được tệp Excel', { description: messageFrom(error) });
    } finally {
      setExportingId(null);
    }
  };

  // Bổ sung lớp vào đợt đã có: thêm khoa/bộ môn khác, hoặc bù lớp nhập thiếu.
  const [addTarget, setAddTarget] = useState<SemesterSurvey | null>(null);
  const [addScopeType, setAddScopeType] = useState<SurveyScopeType>('all');
  const [addScopeId, setAddScopeId] = useState('');
  const [addSchedule, setAddSchedule] = useState<ScheduleForm>(defaultSchedule);
  const [addError, setAddError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  // Nạp danh sách template khảo sát. Bộ câu hỏi thuộc quyền
  // COURSE_QUESTION_SETS_ACCESS mà vai trò chỉ đọc không có, nên gọi vào là 403 và
  // trang hiện một dải lỗi đỏ thừa. Template cũng chỉ dùng để tạo đợt, mà vai trò đó
  // không tạo được — bỏ hẳn lời gọi. Xem congviec3.md mục H6.
  useEffect(() => {
    if (!canManageCampaign) return;
    const load = async () => {
      try {
        const nextTemplates = await surveyApi.templates();
        setTemplates(nextTemplates);
      } catch (error) {
        setLoadError(messageFrom(error));
      }
    };
    void load();
  }, [canManageCampaign]);

  const loadSections = useCallback(async (semesterSurveyId: number) => {
    try {
      const sections = await surveyApi.courseSectionSurveys(semesterSurveyId);
      setSectionSurveys((prev) => ({ ...prev, [semesterSurveyId]: sections }));
    } catch (error) {
      toast.error('Không tải được danh sách lớp', { description: messageFrom(error) });
    }
  }, []);

  const loadSemesterSurveys = useCallback(
    async (selectedSemesterId: string, expandFirst = false) => {
      if (!selectedSemesterId) {
        setSemesterSurveys([]);
        return;
      }
      setLoading(true);
      try {
        const surveys = await surveyApi.semesterSurveys(Number(selectedSemesterId));
        setSemesterSurveys(surveys);
        setLoadError(null);
        // Mở sẵn đợt mới nhất để thấy ngay link và mã QR của từng lớp.
        if (expandFirst && surveys.length > 0) {
          const newest = surveys[0].semesterSurveyId;
          setExpanded((prev) => ({ ...prev, [newest]: true }));
          await loadSections(newest);
        }
      } catch (error) {
        setLoadError(messageFrom(error));
      } finally {
        setLoading(false);
      }
    },
    [loadSections]
  );

  useEffect(() => {
    setExpanded({});
    setSectionSurveys({});
    void loadSemesterSurveys(semesterId, true);
  }, [semesterId, loadSemesterSurveys]);

  // Bài khảo sát phát theo từng lớp học phần, nên kỳ không có lớp nào thì không
  // tạo được gì cả. Đếm trước để nói thẳng điều đó, thay vì để người dùng mở hộp
  // thoại, điền hết rồi mới nhận về một đợt trống. Dùng luôn endpoint đếm phạm vi
  // của hộp thoại tạo để hai nơi không ra hai con số khác nhau.
  //
  // Vai trò chỉ đọc không có COURSE_CAMPAIGNS_ACCESS nên gọi vào là 403; họ cũng
  // không có nút tạo để mà chặn, nên bỏ qua hẳn. Xem congviec3.md mục H6.
  useEffect(() => {
    if (!canManageCampaign || !semesterId) {
      setSectionCount(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const preview = await surveyApi.previewSectionScope({
          semesterId: Number(semesterId),
          scopeType: 'all',
          scopeId: null,
        });
        if (!cancelled) setSectionCount(preview.scopeSectionCount);
      } catch {
        // Đếm hụt thì để nút mở như cũ, còn hơn khoá nhầm một kỳ vẫn có lớp.
        if (!cancelled) setSectionCount(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [semesterId, canManageCampaign]);

  const hasNoSections = sectionCount === 0;

  const toggleExpanded = async (semesterSurveyId: number) => {
    const willExpand = !expanded[semesterSurveyId];
    setExpanded((prev) => ({ ...prev, [semesterSurveyId]: willExpand }));
    if (willExpand && !sectionSurveys[semesterSurveyId]) {
      await loadSections(semesterSurveyId);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!semesterId) {
      setCreateError('Vui lòng chọn học kỳ trước.');
      return;
    }
    if (!createSurveyName.trim()) {
      setCreateError('Vui lòng đặt tên cho bài khảo sát.');
      return;
    }
    if (!createTemplateId) {
      setCreateError('Vui lòng chọn bộ câu hỏi khảo sát.');
      return;
    }
    if (createScopeType !== 'all' && !createScopeId) {
      setCreateError('Vui lòng chọn đơn vị cho phạm vi đã chọn.');
      return;
    }
    if (new Date(createSchedule.endTime) <= new Date(createSchedule.startTime)) {
      setCreateError('Thời gian đóng phải sau thời gian mở.');
      return;
    }

    setCreating(true);
    try {
      const created = await surveyApi.createSemesterSurvey({
        surveyName: createSurveyName.trim(),
        scopeType: createScopeType,
        scopeId: createScopeType === 'all' ? null : Number(createScopeId),
        semesterId: Number(semesterId),
        surveyTemplateId: Number(createTemplateId),
        startTime: toIso(createSchedule.startTime),
        endTime: toIso(createSchedule.endTime),
      });
      await loadSemesterSurveys(semesterId);
      setExpanded((prev) => ({ ...prev, [created.semesterSurveyId]: true }));
      await loadSections(created.semesterSurveyId);
      onSurveysChanged?.();
      toast.success('Đã tạo bài khảo sát cho các lớp học phần', {
        description: `${created.surveyName} · ${created.sectionSurveyCount} lớp`,
      });
      setIsCreateOpen(false);
      setCreateError(null);
      setCreateSurveyName('');
    } catch (error) {
      setCreateError(messageFrom(error));
    } finally {
      setCreating(false);
    }
  };

  const openEditSurvey = (survey: SemesterSurvey) => {
    setEditingSurvey(survey);
    setEditSurveyName(survey.surveyName);
    setEditSurveySchedule({
      startTime: toLocalInput(survey.startTime),
      endTime: toLocalInput(survey.endTime),
    });
    setEditSurveyError(null);
  };

  const submitSurveyUpdate = async () => {
    if (!editingSurvey) return;
    setSavingSurvey(true);
    try {
      const editedSurveyId = editingSurvey.semesterSurveyId;
      const updated = await surveyApi.updateSemesterSurvey(editedSurveyId, {
        surveyName: editSurveyName.trim(),
        startTime: toIso(editSurveySchedule.startTime),
        endTime: toIso(editSurveySchedule.endTime),
      });
      await loadSemesterSurveys(semesterId);
      // Đổi lịch tổng kéo theo lịch các lớp, nên danh sách lớp đã tải của đợt này cũng
      // phải nạp lại — không thì các dòng lớp vẫn hiện giờ cũ tới khi tải lại trang.
      if (sectionSurveys[editedSurveyId]) {
        await loadSections(editedSurveyId);
      }
      onSurveysChanged?.();
      toast.success('Đã cập nhật đợt khảo sát', { description: updated.surveyName });
      setEditingSurvey(null);
      setEditSurveyError(null);
    } catch (error) {
      setEditSurveyError(messageFrom(error));
    } finally {
      setSavingSurvey(false);
    }
  };

  const handleSaveSurvey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingSurvey) return;
    if (!editSurveyName.trim()) {
      setEditSurveyError('Vui lòng nhập tên đợt khảo sát.');
      return;
    }

    const proposedStart = new Date(editSurveySchedule.startTime);
    const proposedEnd = new Date(editSurveySchedule.endTime);
    if (proposedEnd <= proposedStart) {
      setEditSurveyError('Thời gian đóng phải sau thời gian mở.');
      return;
    }

    setSavingSurvey(true);
    try {
      // Đổi lịch toàn đợt kéo theo lịch các lớp, cùng luật với backend: lớp đang dùng
      // lịch tổng nhận lịch mới, lớp có lịch riêng bị thu lại cho nằm trong lịch mới.
      // Đếm trước để hỏi xác nhận: bao nhiêu lớp đổi lịch, bao nhiêu lớp đóng sớm hơn.
      const sections = await surveyApi.courseSectionSurveys(editingSurvey.semesterSurveyId);
      const oldStart = new Date(editingSurvey.startTime).getTime();
      const oldEnd = new Date(editingSurvey.endTime).getTime();
      const newStart = proposedStart.getTime();
      const newEnd = proposedEnd.getTime();

      let followingCount = 0;
      let narrowedCustomCount = 0;
      let closingEarlierCount = 0;
      for (const section of sections) {
        const start = new Date(section.startTime).getTime();
        const end = new Date(section.endTime).getTime();
        const followsSurvey = start === oldStart && end === oldEnd;
        const changes = followsSurvey
          ? start !== newStart || end !== newEnd
          : start < newStart || end > newEnd;
        if (!changes) continue;

        if (followsSurvey) followingCount += 1;
        else narrowedCustomCount += 1;
        if (newEnd < end) closingEarlierCount += 1;
      }

      if (followingCount + narrowedCustomCount > 0) {
        setScheduleConfirm({ followingCount, narrowedCustomCount, closingEarlierCount });
        return;
      }
    } catch (error) {
      setEditSurveyError(messageFrom(error));
      return;
    } finally {
      setSavingSurvey(false);
    }

    await submitSurveyUpdate();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await surveyApi.deleteSemesterSurvey(deleting.semesterSurveyId);
      await loadSemesterSurveys(semesterId);
      onSurveysChanged?.();
      toast.success('Đã xóa đợt khảo sát', { description: deleting.surveyName });
    } catch (error) {
      toast.error('Không thể xóa đợt khảo sát', { description: messageFrom(error) });
    } finally {
      setDeleting(null);
    }
  };

  /** Mở hộp thoại bổ sung, điền sẵn khung giờ theo đợt để khỏi gõ lại. */
  const openAddSections = (survey: SemesterSurvey) => {
    setAddTarget(survey);
    setAddScopeType('all');
    setAddScopeId('');
    setAddSchedule({
      startTime: toLocalInput(survey.startTime),
      endTime: toLocalInput(survey.endTime),
    });
    setAddError(null);
  };

  const handleAddSections = async (event: React.FormEvent) => {
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
    if (
      new Date(addSchedule.startTime) < new Date(addTarget.startTime)
      || new Date(addSchedule.endTime) > new Date(addTarget.endTime)
    ) {
      setAddError('Thời gian của lớp phải nằm trọn trong thời gian mở và đóng của đợt khảo sát.');
      return;
    }

    const { semesterSurveyId } = addTarget;
    setAddingId(semesterSurveyId);
    try {
      const result = await surveyApi.addSectionsToSemesterSurvey(semesterSurveyId, {
        scopeType: addScopeType,
        scopeId: addScopeType === 'all' ? null : Number(addScopeId),
        startTime: toIso(addSchedule.startTime),
        endTime: toIso(addSchedule.endTime),
      });
      await loadSemesterSurveys(semesterId);
      // Bảng lớp đang mở phải nạp lại thì mới thấy link và mã QR của lớp vừa thêm.
      if (expanded[semesterSurveyId]) {
        await loadSections(semesterSurveyId);
      }
      onSurveysChanged?.();
      const skipped = result.skippedSectionCount > 0
        ? ` · bỏ qua ${result.skippedSectionCount} lớp đã có`
        : '';
      toast.success('Đã bổ sung bài khảo sát', {
        description: `${result.surveyName} · thêm ${result.createdSectionCount} lớp${skipped} · ${formatRange(
          result.startTime,
          result.endTime
        )}`,
      });
      setAddTarget(null);
      setAddError(null);
    } catch (error) {
      setAddError(messageFrom(error));
    } finally {
      setAddingId(null);
    }
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

  const openSurveyReport = (courseSectionSurveyId: number) => {
    if (onOpenSurveyReport) {
      onOpenSurveyReport(courseSectionSurveyId);
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
            id="course-survey-semester"
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
        {canManageCampaign && (
          <div className="operations-tab-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!semesterId || hasNoSections}
              title={
                hasNoSections
                  ? 'Học kỳ này chưa có lớp học phần nào để phát phiếu'
                  : undefined
              }
              onClick={() => {
                setCreateError(null);
                setCreateSurveyName('');
                setCreateScopeType('all');
                setCreateScopeId('');
                setCreateTemplateId(templates.length === 1 ? String(templates[0].surveyTemplateId) : '');
                setCreateSchedule(defaultSchedule());
                setIsCreateOpen(true);
              }}
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
          <strong>Chọn một học kỳ để xem hoặc tạo bài khảo sát</strong>
          <span>
            Khi tạo, mọi lớp học phần của học kỳ sẽ nhận cùng một bộ câu hỏi, mỗi lớp có link và mã
            QR riêng.
          </span>
        </div>
      )}

      {semesterId && loading && (
        <div className="operations-empty" role="status">
          <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          <strong>Đang tải đợt khảo sát...</strong>
        </div>
      )}

      {semesterId && !loading && hasNoSections && (
        <div className="operations-empty operations-empty--warning" role="status">
          <TriangleAlert className="operation-icon" aria-hidden="true" />
          <strong>Học kỳ này chưa có lớp học phần nào</strong>
          <span>
            Phiếu khảo sát được tạo theo từng lớp học phần, nên chưa có lớp thì chưa tạo
            được đợt khảo sát. Mở <strong>Danh mục đào tạo › Lớp học phần</strong>, chọn
            đúng học kỳ này rồi <strong>Thêm lớp học phần</strong>.
          </span>
          {onOpenClasses && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenClasses}>
              <UsersRound className="operation-icon" aria-hidden="true" />
              Mở trang Lớp học phần
            </button>
          )}
        </div>
      )}

      {semesterId && !loading && !hasNoSections && semesterSurveys.length === 0 && (
        <div className="operations-empty">
          <QrCode className="operation-icon" aria-hidden="true" />
          <strong>Học kỳ này chưa có bài khảo sát nào</strong>
          <span>Bấm "Tạo bài khảo sát" để phát phiếu cho toàn bộ lớp học phần của kỳ.</span>
        </div>
      )}

      {semesterId && !loading && semesterSurveys.map((survey) => {
        const sections = sectionSurveys[survey.semesterSurveyId] ?? [];
        const isExpanded = expanded[survey.semesterSurveyId] ?? false;
        const totalPages = Math.max(1, Math.ceil(sections.length / sectionPageSize));
        const page = Math.min(sectionPages[survey.semesterSurveyId] ?? 1, totalPages);
        const firstIndex = (page - 1) * sectionPageSize;
        const visibleSections = sections.slice(firstIndex, firstIndex + sectionPageSize);
        const changePage = (nextPage: number) =>
          setSectionPages((prev) => ({
            ...prev,
            [survey.semesterSurveyId]: Math.min(Math.max(1, nextPage), totalPages),
          }));

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
                {!hideCampaignCounts && (
                  <span className="operations-count">{survey.sectionSurveyCount} lớp</span>
                )}
              </button>

              <div className="semester-survey-meta">
                <span>
                  <CalendarDays className="operation-icon" aria-hidden="true" />
                  {formatRange(survey.startTime, survey.endTime)}
                </span>
                <span>{survey.templateName}</span>
                {/*
                  Lớp mới của chính các bộ môn đợt đang phủ thì chưa có bài. Không
                  đếm lớp của khoa khác: đợt cố ý giới hạn phạm vi mà đem so với cả
                  kỳ thì lúc nào cũng "thiếu" hàng nghìn lớp.
                */}
                {canManageCampaign && survey.missingSectionCount > 0 && (
                  <span className="semester-survey-missing">
                    <CircleAlert className="operation-icon" aria-hidden="true" />
                    {survey.missingSectionCount} lớp trong phạm vi chưa có bài khảo sát
                  </span>
                )}
              </div>

              {/* Nút tách khỏi khối mô tả: để chung một hàng thì chúng bị chữ đẩy đi,
                  lúc xuống dòng lúc không. Giờ mô tả chạy bên trái, cụm nút luôn nằm
                  gọn một hàng ở góc phải. */}
              <div className="semester-survey-actions">
                {canAddScope && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openAddSections(survey)}
                    disabled={addingId === survey.semesterSurveyId}
                  >
                    {addingId === survey.semesterSurveyId ? (
                      <>
                        <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
                        Đang thêm...
                      </>
                    ) : (
                      <>
                        <Plus className="operation-icon" aria-hidden="true" />
                        Thêm phạm vi
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handleExportQr(survey)}
                  disabled={exportingId === survey.semesterSurveyId}
                  title="Xuất Excel danh sách lớp kèm ảnh mã QR"
                >
                  {exportingId === survey.semesterSurveyId ? (
                    <>
                      <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
                      Đang xuất...
                    </>
                  ) : (
                    <>
                      <Download className="operation-icon" aria-hidden="true" />
                      Xuất Excel
                    </>
                  )}
                </button>
                {canManageCampaign && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEditSurvey(survey)}
                  >
                    <Pencil className="operation-icon" aria-hidden="true" />
                    Chỉnh sửa
                  </button>
                )}
                {canManageCampaign && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setDeleting(survey)}
                  >
                    <Trash2 className="operation-icon" aria-hidden="true" />
                    Xóa đợt
                  </button>
                )}
              </div>
            </header>

            {isExpanded && (
              <div className="campaign-table-scroll" id={`semester-survey-${survey.semesterSurveyId}`}>
                <table className="campaign-table">
                  <thead>
                    {/* Bề rộng theo phần trăm để tỷ lệ cột giữ nguyên ở mọi cỡ màn hình. */}
                    <tr>
                      <th style={{ width: '12%' }}>Khoa / Viện</th>
                      <th style={{ width: '11%' }}>Bộ môn</th>
                      <th style={{ width: '20%' }}>Lớp học phần</th>
                      <th style={{ width: '15%' }}>Giảng viên</th>
                      <th style={{ width: '4%' }}>Sĩ số</th>
                      <th style={{ width: '16%' }}>Đường dẫn riêng</th>
                      <th style={{ width: '10%' }}>Thời gian mở</th>
                      <th style={{ width: '6%' }}>Lượt trả lời</th>
                      <th style={{ width: '6%' }}>Ảnh QR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.length === 0 && (
                      <tr>
                        <td colSpan={9}>Đang tải danh sách lớp...</td>
                      </tr>
                    )}
                    {visibleSections.map((section) => (
                      <tr key={section.courseSectionSurveyId}>
                        <td title={section.facultyName}>{section.facultyName}</td>
                        <td title={section.departmentName}>{section.departmentName}</td>
                        {/* Một dòng "Tên học phần - Nhóm lớp": mã học phần đã có ở ô
                            đường dẫn và ở mã QR, nhắc lại ở đây chỉ tổ dài dòng. */}
                        <td
                          className="campaign-primary-cell"
                          title={`${section.courseName} - ${section.sectionName}`}
                        >
                          <div className="campaign-primary-value">
                            <span>{section.courseName} - {section.sectionName}</span>
                          </div>
                        </td>
                        <td>{section.lecturerName || 'Chưa phân công'}</td>
                        <td className="campaign-number-cell">{section.classSize}</td>
                        <td className="campaign-link-cell">
                          <div className="campaign-link-row">
                            <input
                              className="campaign-link-input"
                              aria-label={`Đường dẫn khảo sát lớp ${section.sectionName}`}
                              type="text"
                              readOnly
                              value={surveyLinkOf(section.linkToken)}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary operation-icon-button"
                              onClick={() => void handleCopyLink(section.linkToken)}
                              title="Sao chép đường dẫn"
                              aria-label={`Sao chép đường dẫn lớp ${section.sectionName}`}
                            >
                              <Copy className="operation-icon" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                        <td className="campaign-schedule-cell">
                          <div className="campaign-date">
                            <CalendarDays className="operation-icon" aria-hidden="true" />
                            <span>{formatDateRange(section.startTime, section.endTime)}</span>
                          </div>
                        </td>
                        <td className="campaign-number-cell">
                          {/* Số lượt trả lời là lối tắt sang trang Thống kê & Báo cáo,
                              mà vai trò chỉ đọc không có quyền vào đó — câu H-e chốt
                              giảng viên chỉ xem tiến độ, không xem kết quả. */}
                          {!canViewReports ? (
                            <span className="operations-count campaign-response-count">{section.responseCount}</span>
                          ) : (
                            <button
                              type="button"
                              className="section-response-link"
                              onClick={() => openSurveyReport(section.courseSectionSurveyId)}
                              title="Xem kết quả chi tiết trong Thống kê & Báo cáo"
                            >
                              <span className="operations-count campaign-response-count">{section.responseCount}</span>
                            </button>
                          )}
                        </td>
                        <td className="campaign-qr-cell">
                          <div className="campaign-row-actions">
                            {/* Mã QR và đường dẫn thì giữ cho mọi vai trò: giảng viên
                                chính là người đưa cho sinh viên, câu H-d. */}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setQrTarget(section)}
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
            )}

            {isExpanded && sections.length > 0 && (
              <div className="section-survey-pagination">
                <TablePagination
                  page={page}
                  pageSize={sectionPageSize}
                  totalItems={sections.length}
                  itemLabel="lớp học phần"
                  onPageChange={changePage}
                />
              </div>
            )}
          </section>
        );
      })}

      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          if (creating) return;
          setIsCreateOpen(false);
          setCreateError(null);
        }}
        title="Tạo bài khảo sát cho học kỳ"
      >
        <form className="catalog-form" onSubmit={(event) => void handleCreate(event)}>
          {createError && (
            <div className="catalog-validation-error" role="alert">{createError}</div>
          )}

          <div className="catalog-context-band">
            Mỗi lớp học phần trong phạm vi đã chọn sẽ được tạo một bài khảo sát riêng, dùng chung
            bộ câu hỏi bên dưới và có đường dẫn, mã QR riêng. Sau khi tạo vẫn thêm được phạm vi
            khác vào chính đợt này.
          </div>

          <div className="form-group">
            <label htmlFor="create-survey-name">Tên bài khảo sát</label>
            <input
              id="create-survey-name"
              type="text"
              value={createSurveyName}
              onChange={(event) => setCreateSurveyName(event.target.value)}
              placeholder="VD: Khảo sát giữa kỳ đợt 1"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="create-survey-template">Bộ câu hỏi khảo sát</label>
            <SearchableSelect
              id="create-survey-template"
              value={createTemplateId}
              onChange={setCreateTemplateId}
              required
              placeholder="Chọn bộ câu hỏi"
              options={templates.map((template) => ({
                value: String(template.surveyTemplateId),
                label: `${template.templateName} (${template.questions.length} câu)`,
              }))}
            />
          </div>

          <SurveyScopePicker
            semesterId={semesterId ? Number(semesterId) : null}
            scopeType={createScopeType}
            onScopeTypeChange={setCreateScopeType}
            scopeId={createScopeId}
            onScopeIdChange={setCreateScopeId}
            idPrefix="create-survey"
            disabled={creating}
          />

          <div className="catalog-form-grid catalog-form-grid--2">
            <div className="form-group">
              <label htmlFor="create-survey-start">Thời gian mở</label>
              <input
                id="create-survey-start"
                type="datetime-local"
                value={createSchedule.startTime}
                onChange={(event) =>
                  setCreateSchedule((prev) => ({ ...prev, startTime: event.target.value }))
                }
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="create-survey-end">Thời gian đóng</label>
              <input
                id="create-survey-end"
                type="datetime-local"
                value={createSchedule.endTime}
                onChange={(event) =>
                  setCreateSchedule((prev) => ({ ...prev, endTime: event.target.value }))
                }
                required
              />
            </div>
          </div>

          <div className="modal-footer catalog-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsCreateOpen(false)}
              disabled={creating}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating}>
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

      <Modal
        isOpen={editingSurvey !== null}
        onClose={() => {
          if (savingSurvey) return;
          setEditingSurvey(null);
          setEditSurveyError(null);
          setScheduleConfirm(null);
        }}
        title="Chỉnh sửa đợt khảo sát"
      >
        <form className="catalog-form" onSubmit={(event) => void handleSaveSurvey(event)}>
          {editSurveyError && (
            <div className="catalog-validation-error" role="alert">{editSurveyError}</div>
          )}

          <div className="form-group">
            <label htmlFor="edit-semester-survey-name">Tên đợt khảo sát</label>
            <input
              id="edit-semester-survey-name"
              type="text"
              value={editSurveyName}
              onChange={(event) => setEditSurveyName(event.target.value)}
              required
            />
          </div>

          <div className="catalog-context-band">
            Đổi lịch tổng thì lịch các lớp đổi theo: lớp đang dùng lịch tổng nhận lịch mới, lớp
            có lịch riêng bị thu lại cho nằm trong lịch mới. Phiếu đã thu không bị ảnh hưởng.
          </div>

          <div className="catalog-form-grid catalog-form-grid--2">
            <div className="form-group">
              <label htmlFor="edit-semester-survey-start">Thời gian mở</label>
              <input
                id="edit-semester-survey-start"
                type="datetime-local"
                value={editSurveySchedule.startTime}
                onChange={(event) => {
                  setScheduleConfirm(null);
                  setEditSurveySchedule((prev) => ({
                    ...prev,
                    startTime: event.target.value,
                  }));
                }}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-semester-survey-end">Thời gian đóng</label>
              <input
                id="edit-semester-survey-end"
                type="datetime-local"
                value={editSurveySchedule.endTime}
                onChange={(event) => {
                  setScheduleConfirm(null);
                  setEditSurveySchedule((prev) => ({
                    ...prev,
                    endTime: event.target.value,
                  }));
                }}
                required
              />
            </div>
          </div>

          {/* Xác nhận ngay trong form thay vì mở thêm hộp thoại chồng lên: hai hộp thoại
              cùng bắt phím Esc/Tab ở cấp document sẽ đóng nhầm form bên dưới. */}
          {scheduleConfirm && (
            <div className="catalog-context-band" role="alert">
              <strong>Xác nhận đổi lịch toàn đợt</strong> — lịch mới{' '}
              {formatRange(toIso(editSurveySchedule.startTime), toIso(editSurveySchedule.endTime))}:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {scheduleConfirm.followingCount > 0 && (
                  <li>{scheduleConfirm.followingCount} lớp đang dùng lịch tổng sẽ đổi sang lịch mới.</li>
                )}
                {scheduleConfirm.narrowedCustomCount > 0 && (
                  <li>
                    {scheduleConfirm.narrowedCustomCount} lớp có lịch riêng sẽ bị thu lại cho nằm
                    trong lịch mới.
                  </li>
                )}
                {scheduleConfirm.closingEarlierCount > 0 && (
                  <li>
                    <strong>{scheduleConfirm.closingEarlierCount} lớp sẽ đóng sớm hơn hiện tại</strong>:
                    sau thời điểm đóng mới sinh viên không nộp phiếu được nữa.
                  </li>
                )}
                <li>Phiếu đã thu giữ nguyên.</li>
              </ul>
            </div>
          )}

          <div className="modal-footer catalog-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (scheduleConfirm) {
                  setScheduleConfirm(null);
                } else {
                  setEditingSurvey(null);
                }
              }}
              disabled={savingSurvey}
            >
              {scheduleConfirm ? 'Quay lại sửa' : 'Hủy'}
            </button>
            <button
              type={scheduleConfirm ? 'button' : 'submit'}
              className="btn btn-primary"
              disabled={savingSurvey}
              onClick={scheduleConfirm
                ? () => {
                  setScheduleConfirm(null);
                  void submitSurveyUpdate();
                }
                : undefined}
            >
              {savingSurvey ? (
                <LoaderCircle className="auth-spin" aria-hidden="true" size={16} />
              ) : (
                <Save aria-hidden="true" size={16} />
              )}
              {scheduleConfirm ? 'Xác nhận lưu lịch mới' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </Modal>

      <QRCodeModal
        isOpen={qrTarget !== null}
        onClose={() => setQrTarget(null)}
        title={qrTarget ? `${qrTarget.courseCode} - ${qrTarget.courseName}` : ''}
        subtitle={
          qrTarget
            ? `Lớp ${qrTarget.sectionName} • GV: ${qrTarget.lecturerName || 'Chưa phân công'} • ${formatRange(
                qrTarget.startTime,
                qrTarget.endTime
              )}`
            : ''
        }
        surveyLink={qrTarget ? surveyLinkOf(qrTarget.linkToken) : ''}
        downloadFileName={
          qrTarget ? `ma qr khao sat lop ${qrTarget.sectionName}` : undefined
        }
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
        warning="Toàn bộ bài khảo sát của các lớp trong đợt sẽ bị xóa theo."
      />

      <Modal
        isOpen={addTarget !== null}
        onClose={() => setAddTarget(null)}
        title="Thêm phạm vi vào đợt khảo sát"
      >
        <form className="catalog-form" onSubmit={(event) => void handleAddSections(event)}>
          {addError && (
            <div className="catalog-validation-error" role="alert">{addError}</div>
          )}

          <div className="catalog-context-band">
            {addTarget ? `${addTarget.surveyName} — ${addTarget.semesterName}` : ''}
            <br />
            Lớp đã có bài trong đợt sẽ được bỏ qua, nên chọn chồng phạm vi lên nhau vẫn an toàn.
            Các bài khảo sát đã có không bị đụng tới.
            {addTarget && (
              <>
                <br />
                Lịch tổng: <strong>{formatRange(addTarget.startTime, addTarget.endTime)}</strong>.
                Lịch lớp mới phải nằm trọn trong khoảng này.
              </>
            )}
          </div>

          <SurveyScopePicker
            semesterId={addTarget?.semesterId ?? null}
            scopeType={addScopeType}
            onScopeTypeChange={setAddScopeType}
            scopeId={addScopeId}
            onScopeIdChange={setAddScopeId}
            semesterSurveyId={addTarget?.semesterSurveyId}
            idPrefix="add-sections"
            disabled={addingId !== null}
            departmentScoped={roleCode === ROLE_CODES.departmentManager}
          />

          <div className="catalog-form-grid catalog-form-grid--2">
            <div className="form-group">
              <label htmlFor="add-sections-start">Thời gian mở</label>
              <input
                id="add-sections-start"
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
              <label htmlFor="add-sections-end">Thời gian đóng</label>
              <input
                id="add-sections-end"
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
              disabled={addingId !== null}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={addingId !== null}>
              {addingId !== null ? 'Đang thêm...' : 'Thêm vào đợt'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
