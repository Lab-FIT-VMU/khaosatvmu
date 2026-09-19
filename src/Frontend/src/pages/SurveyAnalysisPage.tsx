import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../auth/authContext';
import { isReadOnlyRole, isUnrestrictedRole } from '../auth/roles';
import { useSemester } from '../context/semesterContext';
import { TablePagination } from '../components/TablePagination';
import { usePaginatedItems } from '../hooks/usePaginatedItems';
import { useColumnFilters, type FilterableColumn } from '../hooks/useColumnFilters';
import { NoteModalButton } from '../components/NoteModalButton';
import { useScoringThresholds } from '../hooks/useScoringThresholds';
import { ExportDropdown } from '../components/ExportDropdown';
import type { ExportColumn } from '../services/exportDataService';
import { UpdateScoresButton } from '../components/UpdateScoresButton';
import { ScoringConfigNote } from '../components/ScoringConfigNote';
import { ApiError } from '../services/apiClient';
import { surveyApi, surveyErrorMessage } from '../services/surveyApi';
import type {
  LecturerOption,
  LecturerReport,
  NormalizationQuestionSection,
  SemesterSurveyCourseDiagnosis,
  SemesterSurveyDepartmentSummary,
  SemesterSurveyNormalization,
  SurveyAnalysisScopeType,
} from '../services/surveyApi';
import type { SemesterSurvey } from '../types';
import '../styles/survey-operations.css';
import '../styles/survey-statistics.css';
import '../styles/reports.css';
import '../styles/catalogs.css';

/*
  Ô chọn đợt khảo sát, viết riêng cho trang này.

  Không dùng <select> vì danh sách xổ xuống do trình duyệt vẽ, luôn giãn theo tên
  đợt dài nhất và tràn ra ngoài ô. Ở đây danh sách tự vẽ nên bám đúng bề rộng ô.

  Kiểu dáng nhúng thẳng trong tệp: trang được nạp lười, phụ thuộc vào tệp .css
  bên ngoài thì lần đầu vào trang ô chọn bung ra không còn hình hài gì.
*/
const campaignSelectCss = `
.campaign-select { position: relative; flex: 0 0 460px; min-width: 0; }
.campaign-select__trigger {
  width: 100%; min-height: 34px; display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border: 1px solid #d7dee2; background: #fff; color: #000000;
  font: inherit; font-size: 13px; text-align: left; cursor: pointer;
}
.campaign-select__trigger:disabled { background: #f4f6f8; color: #8c969f; cursor: not-allowed; }
.campaign-select__trigger:focus-visible { outline: 2px solid rgba(7,136,184,.25); border-color: #0788b8; }
.campaign-select__value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.campaign-select__caret { flex: 0 0 auto; width: 14px; height: 14px; color: #000000; }
.campaign-select__list {
  position: fixed; z-index: 1000; margin: 0; padding: 4px 0; list-style: none;
  overflow-y: auto; border: 1px solid #d7dee2; background: #fff;
  box-shadow: 0 8px 24px rgba(15,30,45,.16);
}
.campaign-select__option {
  position: relative; overflow: hidden; container-type: inline-size;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 12px; font-size: 13px; color: #000000; cursor: pointer;
}
.campaign-select__option.is-active { background: #eef7fb; }
.campaign-select__option > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Rê chuột: chữ chạy đúng phần bị thừa. 100% là bề rộng chữ, 100cqw là bề rộng
   dòng — chữ ngắn hơn dòng thì hiệu số dương, min() kẹp về 0 nên đứng yên. */
.campaign-select__option:hover > span {
  flex: 0 0 max-content; overflow: visible; text-overflow: clip;
  animation: campaign-select-scroll 6s linear infinite;
}
@keyframes campaign-select-scroll {
  0%, 12% { transform: translateX(0); }
  88%, 100% { transform: translateX(min(0px, calc(100cqw - 100% - 26px))); }
}
.campaign-select__empty { padding: 10px 12px; color: #000000; font-size: 13px; text-align: center; }
.campaign-select__hint {
  position: fixed; z-index: 1001; padding: 9px 12px; border: 1px solid #d7dee2;
  background: #fff; box-shadow: 0 8px 22px rgba(15,30,45,.2); color: #000000;
  font-size: 16px; line-height: 1.45; overflow-wrap: anywhere; pointer-events: none;
}
`;

interface CampaignOption {
  value: string;
  label: string;
}

function CampaignSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
}: {
  id: string;
  value: string;
  options: CampaignOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [listStyle, setListStyle] = useState<React.CSSProperties>({});
  const [hint, setHint] = useState<{ label: string; style: React.CSSProperties } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!isOpen) return;

    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      setListStyle({
        top: rect.bottom + 3,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(96, Math.min(264, below)),
      });
    };

    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setIsOpen(false);
      setHint(null);
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', closeOnOutside);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', closeOnOutside);
    };
  }, [isOpen]);

  // Ô ghi trọn tên bám theo con trỏ: góc trái trên của ô đặt đúng chỗ chuột đang
  // đứng, và chạy theo chuột chừng nào còn rê trong dòng đó. Kẹp lại trong màn
  // hình để ô không thò ra ngoài mép phải hoặc mép dưới.
  const showHintAt = (label: string, clientX: number, clientY: number) => {
    const width = Math.min(520, window.innerWidth * 0.6);
    setHint({
      label,
      style: {
        top: Math.min(clientY, window.innerHeight - 90),
        left: Math.min(clientX, window.innerWidth - width - 8),
        maxWidth: width,
      },
    });
  };

  return (
    <div className="campaign-select" ref={rootRef}>
      <style>{campaignSelectCss}</style>

      <button
        type="button"
        id={id}
        className="campaign-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="campaign-select__value">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="campaign-select__caret" aria-hidden="true" />
      </button>

      {isOpen && createPortal(
        <>
          <ul className="campaign-select__list" role="listbox" ref={listRef} style={listStyle}>
            {options.length === 0 ? (
              <li className="campaign-select__empty">{placeholder}</li>
            ) : (
              options.map((option) => (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  className={
                    option.value === value
                      ? 'campaign-select__option is-active'
                      : 'campaign-select__option'
                  }
                  onMouseEnter={(event) => showHintAt(option.label, event.clientX, event.clientY)}
                  onMouseMove={(event) => showHintAt(option.label, event.clientX, event.clientY)}
                  onMouseLeave={() => setHint(null)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(option.value);
                    setIsOpen(false);
                    setHint(null);
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check aria-hidden="true" size={14} />}
                </li>
              ))
            )}
          </ul>

          {hint && (
            <div className="campaign-select__hint" role="tooltip" style={hint.style}>
              {hint.label}
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  );
}


function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

/** Dưới mức này thì lớp bị coi là cần cảnh báo — khớp ReportThresholds.LowScore. */
const lowScore = 3.2;
const analysisPageSize = 20;

type TabId =
  | 'normalization'
  | 'normalizationSections'
  | 'departments'
  | 'courses'
  | 'lecturer';

/** Cấp bị bấm vào để mở trang chi tiết: một khoa/viện, một bộ môn hay một học phần. */
interface AnalysisScopeTarget {
  type: SurveyAnalysisScopeType;
  id: number;
}

interface AnalysisRouteState {
  tab: TabId;
  semesterId?: number;
  semesterSurveyId?: number;
  lecturerId?: number;
}

const tabIds: readonly TabId[] = [
  'normalization',
  'normalizationSections',
  'departments',
  'courses',
  'lecturer',
];

function parseAnalysisRoute(hash = window.location.hash): AnalysisRouteState {
  const [, queryPart = ''] = hash.replace(/^#\/?/, '').split('?');
  const query = new URLSearchParams(queryPart);
  const routeTab = query.get('tab');
  const semesterId = Number(query.get('semester'));
  const semesterSurveyId = Number(query.get('campaign'));
  const lecturerId = Number(query.get('lecturer'));

  return {
    tab: tabIds.includes(routeTab as TabId) ? routeTab as TabId : 'normalization',
    semesterId: Number.isInteger(semesterId) && semesterId > 0 ? semesterId : undefined,
    semesterSurveyId: Number.isInteger(semesterSurveyId) && semesterSurveyId > 0
      ? semesterSurveyId
      : undefined,
    lecturerId: Number.isInteger(lecturerId) && lecturerId > 0 ? lecturerId : undefined,
  };
}

/**
 * Trang này chỉ còn các tab tổng hợp; trang chi tiết theo phạm vi đã chuyển sang
 * module Thống kê & Báo cáo. Link cũ dạng `/survey-analysis/{cấp}/{id}` được
 * `App` đổi hướng trước khi chọn tab, nên ở đây không cần dựng lại đường dẫn đó.
 */
function buildAnalysisHash(route: AnalysisRouteState): string {
  const query = new URLSearchParams();
  if (route.semesterId) query.set('semester', String(route.semesterId));
  if (route.semesterSurveyId) query.set('campaign', String(route.semesterSurveyId));
  if (route.tab !== 'normalization') query.set('tab', route.tab);
  if (route.tab === 'lecturer' && route.lecturerId) query.set('lecturer', String(route.lecturerId));
  const queryString = query.toString();
  return `#/survey-analysis${queryString ? `?${queryString}` : ''}`;
}

/**
 * `minimumRole` cho biết tab mở tới đâu:
 * - `unrestricted`: chỉ ADMIN / SURVEY_ADMIN. Phân tích theo khoa/viện là bức tranh cả
 *   trường, không phải việc của trưởng bộ môn hay giảng viên.
 * - `manager`: từ trưởng bộ môn trở lên.
 * - `all`: mọi vai trò mở được trang này.
 *
 * Ẩn nút không phải là khoá — backend từ chối hai endpoint của tab `manager` khi
 * người gọi là giảng viên.
 */
const tabs: { id: TabId; label: string; hint: string; minimumRole: 'unrestricted' | 'manager' | 'all' }[] = [
  {
    id: 'normalization',
    label: 'Phân tích theo khoa/viện',
    hint: 'Điểm trung bình từng khoa/viện. Cột Z-Score so điểm trung bình khoa với trung bình toàn trường theo sai số chuẩn σ/√n, chia bậc 1σ · 2σ · 3σ.',
    minimumRole: 'unrestricted',
  },
  {
    id: 'departments',
    label: 'Phân tích theo bộ môn',
    hint: 'Phục vụ trưởng khoa: mỗi dòng là một bộ môn trong đợt khảo sát.',
    minimumRole: 'manager',
  },
  {
    id: 'courses',
    label: 'Phân tích theo học phần',
    hint: 'So các lớp trong cùng một học phần để biết vấn đề nằm ở học phần hay ở giảng viên.',
    minimumRole: 'manager',
  },
  {
    id: 'normalizationSections',
    label: 'Phân tích theo lớp học phần',
    hint: 'So điểm thô giữa các lớp khác khoa là so sai. Z-score đưa mọi lớp về cùng một thước.',
    minimumRole: 'all',
  },
  {
    id: 'lecturer',
    label: 'Báo cáo giảng viên',
    hint: 'Tổng hợp kết quả đánh giá theo từng giảng viên trong đợt khảo sát. Bấm vào giảng viên để xem chi tiết các lớp giảng dạy.',
    minimumRole: 'all',
  },
];

/** Tô điểm theo thang đỏ → cam → vàng → xanh như bản mô phỏng Excel. */
function scoreClass(score: number | null): string {
  if (score === null) return 'num';
  if (score < lowScore) return 'num score-band score-band--bad';
  if (score < 3.5) return 'num score-band score-band--poor';
  if (score < 3.8) return 'num score-band score-band--fair';
  return 'num score-band score-band--good';
}

/** Biên độ rộng thì tô đỏ — đó chính là tín hiệu để đọc bảng này. */
function spreadClass(spread: number): string {
  return spread >= 0.8 ? 'num is-flagged' : 'num';
}

/**
 * Ba bậc của quy tắc thực nghiệm 68-95-99.7 — khớp NotableZScore / StrongZScore /
 * ExtremeZScore trong ReportThresholds.
 */
const zTiers = { notable: 1, strong: 2, extreme: 3 };

/**
 * Tô theo bậc 68-95-99.7, KHÔNG dùng thang điểm tuyệt đối 3.20/3.50/3.80. Phía âm
 * tách hai mức vì đó là phía cần xử lý; phía dương chỉ một mức, bậc cụ thể đã nằm
 * ở cột Nhận định.
 */
function zTierClass(value: number | null): string {
  if (value === null) return 'num';
  if (value <= -zTiers.strong) return 'num score-band score-band--bad';
  if (value <= -zTiers.notable) return 'num score-band score-band--poor';
  if (value >= zTiers.notable) return 'num score-band score-band--good';
  return 'num';
}

/** Công thức và bốn bậc của cột Nhận định, đọc trong hộp thoại chú thích. */
const FormulaNotes: React.FC<{ notes: string[] }> = ({ notes }) => (
  <>
    {notes.map((note) => (
      <p className="z-legend__note" key={note}>
        {note}
      </p>
    ))}
  </>
);

/**
 * Công thức tính riêng của từng tab. Trang cha ghép chúng vào sau dòng mô tả tab
 * trong cùng một hộp Chú thích, và in lại vào phần ghi chú của tệp xuất — một nguồn
 * chữ cho cả hai để tệp xuất không lệch chú thích trên màn hình.
 */
const tabFormulaNotes: Partial<Record<TabId, string[]>> = {
  normalization: [
    'Độ lệch chuẩn = √( Tổng bình phương (Điểm từng lớp − Điểm trung bình khoa) ÷ (Số lớp − 1) )',
    'Z-Score = (Điểm trung bình khoa − Trung bình toàn trường)'
      + ' ÷ (Độ lệch chuẩn toàn trường ÷ √Số lớp)',
  ],
  normalizationSections: [
    'Z-Score so với toàn trường = (Điểm lớp − Trung bình toàn trường) ÷ Độ lệch chuẩn toàn trường',
    'Z-Score so với khoa = (Điểm lớp − Điểm trung bình khoa) ÷ Độ lệch chuẩn khoa',
  ],
  departments: [
    'Mỗi dòng gộp toàn bộ lớp của một bộ môn trong đợt khảo sát.',
    'Độ lệch chuẩn = độ lệch chuẩn điểm các lớp của bộ môn.',
    'Z-Score so với toàn trường = (Điểm trung bình bộ môn − Trung bình toàn trường)'
      + ' ÷ (Độ lệch chuẩn toàn trường ÷ √Số lớp)',
    'Z-Score so với khoa = (Điểm trung bình bộ môn − Điểm trung bình khoa) ÷ (Độ lệch chuẩn khoa ÷ √Số lớp).'
      + ' Để trống khi khoa có dưới 2 lớp.',
  ],
  courses: [
    'Bảng này so các lớp TRONG CÙNG một học phần với nhau.',
    'Chênh lệch giữa các lớp = Điểm lớp cao nhất − Điểm lớp thấp nhất.',
    'Z-Score so với toàn trường = (Điểm trung bình học phần − Trung bình toàn trường)'
      + ' ÷ (Độ lệch chuẩn toàn trường ÷ √Số lớp)',
    'Z-Score so với khoa = (Điểm trung bình học phần − Điểm trung bình khoa) ÷ (Độ lệch chuẩn khoa ÷ √Số lớp).'
      + ' Để trống khi khoa có dưới 2 lớp.',
  ],
  lecturer: [
    'Z-Score = (Điểm lớp − Trung bình nhóm so) ÷ Độ lệch chuẩn nhóm so.'
      + ' Ba cột Z dùng ba nhóm: toàn trường, các lớp cùng khoa, các lớp cùng bộ môn.',
    'Chênh so học phần = Điểm lớp − Điểm trung bình học phần.'
      + ' Để trống khi học phần chỉ có đúng lớp này, không có ai để so.',
    'Lớp cảnh báo = số lớp có điểm thấp hơn trung bình từ 1 độ lệch chuẩn trở lên (Z-Score ≤ −1).',
  ],
};

/** Các bảng báo dòng đang hiện lên trang cha: năm tab và bảng lớp của một giảng viên. */
type ExportRowsKey = TabId | 'lecturerSections';

type MaybeNumber = number | null | undefined;

/**
 * Giá trị ô của tệp xuất, viết đúng như trên bảng. `null` là không có số, in "—";
 * `undefined` là ô để trống của dòng tổng. Ô số xuất chuỗi số, bộ xuất Excel đổi
 * lại thành SỐ kèm mã định dạng nên vẫn sắp xếp được.
 */
const fixedOrDash = (value: MaybeNumber, digits: number) =>
  value === undefined ? undefined : value === null ? '—' : value.toFixed(digits);
const signedOrDash = (value: MaybeNumber) =>
  value === undefined ? undefined : value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
const percentOf = (part: number, whole: number) => (whole === 0 ? null : (part / whole) * 100);

const textColumn = (key: string, header: string, width: number): ExportColumn => ({ key, header, width });
const countColumn = (key: string, header: string, width = 10): ExportColumn => ({
  key,
  header,
  width,
  type: 'number',
  align: 'right',
});
const rateColumn = (key: string, header: string, width = 12): ExportColumn => ({
  key,
  header,
  width,
  type: 'number',
  align: 'right',
  numberFormat: '0.0"%"',
  format: (value: MaybeNumber) => fixedOrDash(value, 1),
});
const scoreColumn = (key: string, header: string, digits = 2, width = 12): ExportColumn => ({
  key,
  header,
  width,
  type: 'number',
  align: 'right',
  numberFormat: digits === 3 ? '0.000' : '0.00',
  format: (value: MaybeNumber) => fixedOrDash(value, digits),
});
const zColumn = (key: string, header: string, width = 14): ExportColumn => ({
  key,
  header,
  width,
  type: 'number',
  align: 'right',
  numberFormat: '+0.00;-0.00;0.00',
  format: signedOrDash,
});

export const SurveyAnalysisPage: React.FC = () => {
  const { activeProfile } = useAuth();
  const { academicYears, activeSemesterId } = useSemester();
  const [initialRoute] = useState(parseAnalysisRoute);

  const [tab, setTab] = useState<TabId>(initialRoute.tab);
  const [semesterId, setSemesterId] = useState<string>(
    initialRoute.semesterId
      ? String(initialRoute.semesterId)
      : activeSemesterId
        ? String(activeSemesterId)
        : '',
  );
  useEffect(() => {
    if (activeSemesterId && !parseAnalysisRoute().semesterId) {
      setSemesterId(String(activeSemesterId));
    }
  }, [activeSemesterId]);

  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>([]);
  const [semesterSurveyId, setSemesterSurveyId] = useState<string>(
    initialRoute.semesterSurveyId ? String(initialRoute.semesterSurveyId) : '',
  );

  const [normalization, setNormalization] = useState<SemesterSurveyNormalization | null>(null);
  // Tab Phân tích theo lớp học phần tính được theo riêng một mục câu hỏi. Lựa chọn
  // gắn với đợt đang xem: đổi đợt thì bộ đề khác, mục cũ không còn nghĩa nên tự quay
  // về toàn bộ bài khảo sát mà không phải dọn state.
  const [questionSectionSelection, setQuestionSectionSelection] = useState<
    { semesterSurveyId: string; sectionId: number } | null
  >(null);
  const questionSectionId =
    questionSectionSelection?.semesterSurveyId === semesterSurveyId
      ? questionSectionSelection.sectionId
      : null;
  const [sectionNormalization, setSectionNormalization] = useState<SemesterSurveyNormalization | null>(null);
  const [departments, setDepartments] = useState<SemesterSurveyDepartmentSummary | null>(null);
  const [courses, setCourses] = useState<SemesterSurveyCourseDiagnosis | null>(null);
  const [lecturers, setLecturers] = useState<LecturerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedLecturerId, setSelectedLecturerId] = useState<number | null>(initialRoute.lecturerId ?? null);

  const applyRoute = useCallback((route: AnalysisRouteState) => {
    setTab(route.tab);
    setSelectedLecturerId(route.lecturerId ?? null);
    if (route.semesterId) setSemesterId(String(route.semesterId));
    if (route.semesterId) {
      setSemesterSurveyId(route.semesterSurveyId ? String(route.semesterSurveyId) : '');
    }
  }, []);

  const navigateAnalysis = useCallback((route: AnalysisRouteState, replace = false) => {
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method](null, '', buildAnalysisHash(route));
    applyRoute(route);
  }, [applyRoute]);

  /**
   * Ba tab tổng hợp mở ra trang chi tiết của một khoa/viện, bộ môn hay học phần.
   * Trang đó giờ chỉ có MỘT bản, nằm trong module Thống kê & Báo cáo — trước đây
   * mỗi module dựng một bản riêng nên bộ cột lệch nhau. Đi từ đây sang đó là đổi
   * module thật, nên phải đặt hash của module đích chứ không điều hướng nội bộ.
   */
  const openScopeDetail = useCallback((target: AnalysisScopeTarget) => {
    if (!semesterSurveyId) return;
    window.location.hash = `/reports/scope/${target.type}/${target.id}`
      + `?semester=${semesterId}&campaign=${semesterSurveyId}`;
  }, [semesterId, semesterSurveyId]);

  useEffect(() => {
    const handleRouteChange = () => applyRoute(parseAnalysisRoute());
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, [applyRoute]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!semesterId) {
        setSemesterSurveys([]);
        setSemesterSurveyId('');
        return;
      }
      try {
        const next = await surveyApi.semesterSurveys(Number(semesterId));
        if (cancelled) return;
        setSemesterSurveys(next);
        setSemesterSurveyId((current) => {
          if (current && next.some((item) => String(item.semesterSurveyId) === current)) {
            return current;
          }
          return next.length > 0 ? String(next[0].semesterSurveyId) : '';
        });
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(messageFrom(error));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [semesterId]);

  const campaignCacheRef = useRef<Map<number, {
    normalization?: SemesterSurveyNormalization;
    /** Chuẩn hoá tính theo riêng một mục câu hỏi, khoá là SectionId. */
    sectionNormalizations?: Record<number, SemesterSurveyNormalization>;
    departments?: SemesterSurveyDepartmentSummary;
    courses?: SemesterSurveyCourseDiagnosis;
    lecturers?: LecturerOption[];
  }>>(new Map());
  const analysisGenRef = useRef(0);

  const loadAnalysis = useCallback(async (force = false) => {
    const generation = ++analysisGenRef.current;
    if (!semesterSurveyId) {
      setNormalization(null);
      setDepartments(null);
      setCourses(null);
      setLecturers([]);
      setLoading(false);
      return;
    }

    const campaignId = Number(semesterSurveyId);
    let cacheEntry = campaignCacheRef.current.get(campaignId);
    if (!cacheEntry || force) {
      if (force && cacheEntry) {
        campaignCacheRef.current.delete(campaignId);
      }
      cacheEntry = {};
      campaignCacheRef.current.set(campaignId, cacheEntry);
    }

    // Nếu tab đã có trong cache của campaign này, load ngay lập tức
    if (tab === 'normalizationSections' && questionSectionId !== null) {
      const cached = cacheEntry.sectionNormalizations?.[questionSectionId];
      if (cached) {
        setSectionNormalization(cached);
        setLoadError(null);
        setLoading(false);
        return;
      }
    } else if (tab === 'normalization' || tab === 'normalizationSections') {
      if (cacheEntry.normalization) {
        setNormalization(cacheEntry.normalization);
        setLoadError(null);
        setLoading(false);
        return;
      }
    } else if (tab === 'departments') {
      if (cacheEntry.departments) {
        setDepartments(cacheEntry.departments);
        setLoadError(null);
        setLoading(false);
        return;
      }
    } else if (tab === 'courses') {
      if (cacheEntry.courses) {
        setCourses(cacheEntry.courses);
        setLoadError(null);
        setLoading(false);
        return;
      }
    } else if (tab === 'lecturer') {
      if (cacheEntry.lecturers) {
        setLecturers(cacheEntry.lecturers);
        setLoadError(null);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      if (tab === 'normalizationSections' && questionSectionId !== null) {
        const sectionRes = await surveyApi.semesterSurveyNormalization(campaignId, questionSectionId);
        if (generation !== analysisGenRef.current) return;
        cacheEntry.sectionNormalizations = {
          ...cacheEntry.sectionNormalizations,
          [questionSectionId]: sectionRes,
        };
        setSectionNormalization(sectionRes);
      } else if (tab === 'normalization' || tab === 'normalizationSections') {
        const normRes = await surveyApi.semesterSurveyNormalization(campaignId);
        if (generation !== analysisGenRef.current) return;
        cacheEntry.normalization = normRes;
        setNormalization(normRes);
      } else if (tab === 'departments') {
        const deptRes = await surveyApi.semesterSurveyDepartmentSummary(campaignId);
        if (generation !== analysisGenRef.current) return;
        cacheEntry.departments = deptRes;
        setDepartments(deptRes);
      } else if (tab === 'courses') {
        const courseRes = await surveyApi.semesterSurveyCourseDiagnosis(campaignId);
        if (generation !== analysisGenRef.current) return;
        cacheEntry.courses = courseRes;
        setCourses(courseRes);
      } else if (tab === 'lecturer') {
        const lecRes = await surveyApi.semesterSurveyLecturers(campaignId);
        if (generation !== analysisGenRef.current) return;
        cacheEntry.lecturers = lecRes;
        setLecturers(lecRes);
      }
      if (generation !== analysisGenRef.current) return;
      setLoadError(null);
    } catch (error) {
      if (generation !== analysisGenRef.current) return;
      setLoadError(messageFrom(error));
    } finally {
      if (generation === analysisGenRef.current) {
        setLoading(false);
      }
    }
  }, [semesterSurveyId, tab, questionSectionId]);

  // Dữ liệu của tab Phân tích theo lớp học phần: toàn bài, hoặc bản tính theo mục đang
  // chọn. Bản theo mục chỉ dùng khi đúng là của mục đó, tránh lóe số của mục trước.
  const sectionTabData = questionSectionId === null
    ? normalization
    : sectionNormalization?.questionSectionId === questionSectionId
      ? sectionNormalization
      : null;
  const selectQuestionSection = useCallback((sectionId: number | null) => {
    setQuestionSectionSelection(
      sectionId === null ? null : { semesterSurveyId, sectionId },
    );
  }, [semesterSurveyId]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const semesterOptions = useMemo(
    () =>
      academicYears.flatMap((year) =>
        year.semesters.map((semester) => ({
          value: String(semester.semesterId),
          label: `${semester.semesterName} · ${year.academicYearName}`,
        }))
      ),
    [academicYears]
  );

  // Danh sách tab của riêng vai trò đang dùng. Đổi hồ sơ là App dựng lại cả cây
  // nên chỗ này tự tính lại, không cần theo dõi gì thêm.
  const visibleTabs = useMemo(() => {
    const roleCode = activeProfile?.roleCode;
    if (isUnrestrictedRole(roleCode)) return tabs;
    if (isReadOnlyRole(roleCode)) return tabs.filter((item) => item.minimumRole === 'all');
    return tabs.filter((item) => item.minimumRole !== 'unrestricted');
  }, [activeProfile?.roleCode]);

  const activeTab = useMemo(
    () => visibleTabs.find((item) => item.id === tab) ?? visibleTabs[0],
    [tab, visibleTabs]
  );

  // Đường dẫn có thể trỏ thẳng vào một tab mà vai trò này không mở được — người
  // dùng lưu dấu trang từ hồ sơ khác chẳng hạn. Đưa về tab đầu tiên hợp lệ.
  useEffect(() => {
    if (visibleTabs.some((item) => item.id === tab)) return;
    const fallback = visibleTabs[0];
    if (!fallback) return;
    navigateAnalysis({
      tab: fallback.id,
      semesterId: Number(semesterId) || undefined,
      semesterSurveyId: Number(semesterSurveyId) || undefined,
    }, true);
  }, [navigateAnalysis, semesterId, semesterSurveyId, tab, visibleTabs]);
  const thresholds = useScoringThresholds();

  // Nút chú thích của tab được truyền xuống để mỗi tab đặt nó vào cuối dòng tóm
  // tắt số liệu của mình — hai thứ nằm chung một hàng thay vì ăn hai dòng.
  const noteButton = (
    <NoteModalButton title={`Chú thích · ${activeTab.label}`}>
      <div className="z-legend">
        <p className="z-legend__note">{activeTab.hint}</p>
        <FormulaNotes notes={tabFormulaNotes[tab] ?? []} />
        {/* Ngưỡng quyết định lớp nào có mặt trong mọi con số của trang này, nên
            phải in ra chứ không để người xem đoán. Đổi ở trang Bảng dữ liệu. */}
        <p className="z-legend__note">
          Số liệu chỉ gộp lớp qua cả hai tiêu chí: tỷ lệ phản hồi ≥{' '}
          <strong>{thresholds.minimumResponseRate}%</strong> và tỷ lệ phiếu hợp lệ ≥{' '}
          <strong>{thresholds.minimumValidRate}%</strong>. Hai ngưỡng này đổi được ở
          nút Cập nhật điểm.
        </p>
        <p className="z-legend__note">
          <strong>Tỷ lệ phản hồi</strong> = Số phiếu đã thu ÷ Tổng sĩ số.
        </p>
        <p className="z-legend__note">
          <strong>Tỷ lệ phiếu hợp lệ</strong> = Số phiếu hợp lệ ÷ Số phiếu đã thu.
        </p>
        <p className="z-legend__note">
          Số liệu trang này lấy theo lần bấm Cập nhật điểm gần nhất: đổi ngưỡng xong cần
          bấm Cập nhật điểm.
        </p>
      </div>
    </NoteModalButton>
  );

  // Dòng từng bảng đang hiện (đã qua bộ lọc và sắp xếp cột), để tệp xuất đúng bằng
  // bảng trên màn hình. Mỗi bảng một hàm báo cố định để effect của bảng không chạy lại.
  const [visibleRows, setVisibleRows] = useState<Partial<Record<ExportRowsKey, readonly unknown[]>>>({});
  const reportVisibleRows = useMemo(() => {
    const reporter = (key: ExportRowsKey) => (rows: readonly unknown[]) =>
      setVisibleRows((prev) => (prev[key] === rows ? prev : { ...prev, [key]: rows }));
    return {
      normalization: reporter('normalization'),
      normalizationSections: reporter('normalizationSections'),
      departments: reporter('departments'),
      courses: reporter('courses'),
      lecturer: reporter('lecturer'),
      lecturerSections: reporter('lecturerSections'),
    };
  }, []);
  const [lecturerReport, setLecturerReport] = useState<LecturerReport | null>(null);

  // Tệp xuất đi đúng những gì tab đang hiện: cùng cột, cùng thứ tự, cùng các dòng sau
  // bộ lọc, kèm dòng tổng nếu bảng có, và phần ghi chú in lại nội dung Chú thích.
  const exportAnalysisOptions = useMemo(() => {
    const activeSurvey = semesterSurveys.find((s) => String(s.semesterSurveyId) === semesterSurveyId);
    const surveyName = activeSurvey?.surveyName ?? '';
    const fileSuffix = surveyName || 'dot-khao-sat';
    const subtitle = [
      surveyName,
      activeSurvey ? `${activeSurvey.semesterName} năm học ${activeSurvey.academicYearName}` : '',
    ].filter(Boolean).join(' · ');
    const baseInfo = {
      'Đợt khảo sát': surveyName || undefined,
      'Học kỳ': activeSurvey ? `${activeSurvey.semesterName} · ${activeSurvey.academicYearName}` : undefined,
      'Bộ câu hỏi': activeSurvey?.templateName,
      'Tiêu chí tính điểm':
        `Tỷ lệ phản hồi ≥ ${thresholds.minimumResponseRate}% · `
        + `Tỷ lệ phiếu hợp lệ ≥ ${thresholds.minimumValidRate}%`,
    };

    // Dòng đang hiện chỉ dùng khi đúng là của bộ số liệu đang có — bảng chưa kịp báo
    // lại sau khi tải lại thì xuất đủ cả bộ chứ không xuất dòng cũ.
    const shownRows = <T,>(key: ExportRowsKey, all: readonly T[]): T[] => {
      const rows = visibleRows[key];
      if (!rows) return [...all];
      const current = new Set<unknown>(all);
      return rows.every((row) => current.has(row)) ? (rows as T[]) : [...all];
    };

    const notesFor = (tabId: TabId, shown: number, total: number, extra: string[] = []) => [
      tabs.find((item) => item.id === tabId)?.hint ?? '',
      ...(tabFormulaNotes[tabId] ?? []),
      ...extra,
      `Số liệu chỉ gộp lớp qua cả hai tiêu chí: tỷ lệ phản hồi ≥ ${thresholds.minimumResponseRate}%`
        + ` và tỷ lệ phiếu hợp lệ ≥ ${thresholds.minimumValidRate}%.`,
      'Tỷ lệ phản hồi = Số phiếu đã thu ÷ Tổng sĩ số.',
      'Tỷ lệ phiếu hợp lệ = Số phiếu hợp lệ ÷ Số phiếu đã thu.',
      'Số liệu lấy theo lần bấm Cập nhật điểm gần nhất.',
      ...(shown < total
        ? [`Tệp chỉ chứa ${shown}/${total} dòng đang hiển thị theo bộ lọc cột trên màn hình.`]
        : []),
    ].filter(Boolean);

    const metadataOf = (title: string, info: Record<string, string | number | undefined>, summaryNotes: string[]) => ({
      title,
      subtitle,
      subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
      info: { ...baseInfo, ...info },
      summaryNotes,
    });

    if (tab === 'normalization' && normalization) {
      const data = normalization;
      const rows = shownRows('normalization', data.groups);
      const classSize = data.groups.reduce((sum, row) => sum + row.totalClassSize, 0);
      const responses = data.groups.reduce((sum, row) => sum + row.responseCount, 0);
      const validResponses = data.groups.reduce((sum, row) => sum + row.validResponseCount, 0);

      return {
        fileName: `phan-tich-theo-khoa-vien-${fileSuffix}`,
        metadata: metadataOf(
          'PHÂN TÍCH THEO KHOA/VIỆN',
          {
            'Trung bình toàn trường': data.schoolAverageScore.toFixed(3),
            'Số lớp có phiếu': data.schoolSectionCount,
            'Số khoa/viện': data.groups.length,
          },
          notesFor('normalization', rows.length, data.groups.length, [
            'Dòng TOÀN TRƯỜNG cộng từ tất cả các khoa/viện; Số giảng viên để trống vì giảng viên dạy lớp của nhiều khoa sẽ bị đếm trùng.',
          ]),
        ),
        sheets: [
          {
            sheetName: 'Theo khoa vien',
            title: `PHÂN TÍCH THEO KHOA/VIỆN (${rows.length} KHOA/VIỆN)`,
            columns: [
              textColumn('facultyName', 'Khoa / Viện', 32),
              countColumn('sectionCount', 'Số lớp', 8),
              countColumn('lecturerCount', 'Số giảng viên', 8),
              countColumn('totalClassSize', 'Tổng sĩ số'),
              countColumn('responseCount', 'Số phiếu đã thu', 12),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm trung bình khoa', 3),
              scoreColumn('standardDeviation', 'Độ lệch chuẩn', 3),
              zColumn('meanZScore', 'Z-Score so với toàn trường'),
            ],
            data: [
              ...rows,
              {
                facultyName: 'TOÀN TRƯỜNG',
                sectionCount: data.schoolSectionCount,
                totalClassSize: classSize,
                responseCount: responses,
                validResponseCount: validResponses,
                responseRate: percentOf(responses, classSize),
                validResponseRate: percentOf(validResponses, responses),
                averageScore: data.schoolAverageScore,
                standardDeviation: data.schoolStandardDeviation,
              },
            ],
          },
        ],
      };
    }

    if (tab === 'normalizationSections' && sectionTabData) {
      const data = sectionTabData;
      const rows = shownRows('normalizationSections', data.sections);
      const selectedSection = data.questionSections.find((item) => item.sectionId === data.questionSectionId);
      const totalQuestions = data.questionSections.reduce((sum, item) => sum + item.questionCount, 0);
      const scopeLabel = selectedSection
        ? `${selectedSection.sectionName} (${selectedSection.questionCount} câu)`
        : data.questionSections.length > 0
          ? `Toàn bộ bài khảo sát (${totalQuestions} câu)`
          : 'Toàn bộ bài khảo sát';

      return {
        fileName: `phan-tich-theo-lop-hoc-phan-${fileSuffix}`,
        metadata: metadataOf(
          'PHÂN TÍCH THEO LỚP HỌC PHẦN',
          {
            'Tính điểm và Z-Score theo': scopeLabel,
            'Trung bình toàn trường': data.schoolAverageScore.toFixed(3),
            'Độ lệch chuẩn':
              data.schoolStandardDeviation === null ? '—' : data.schoolStandardDeviation.toFixed(3),
            'Số lớp có phiếu': data.schoolSectionCount,
            'Số khoa/viện': data.groups.length,
          },
          notesFor(
            'normalizationSections',
            rows.length,
            data.sections.length,
            selectedSection
              ? [`Điểm và Z-Score chỉ tính từ các câu của mục "${selectedSection.sectionName}", không tính câu bẫy.`]
              : [],
          ),
        ),
        sheets: [
          {
            sheetName: 'Theo lop hoc phan',
            title: `PHÂN TÍCH THEO LỚP HỌC PHẦN (${rows.length} LỚP)`,
            columns: [
              textColumn('facultyName', 'Khoa / Viện', 22),
              textColumn('departmentName', 'Bộ môn', 22),
              textColumn('courseName', 'Học phần', 30),
              textColumn('courseCode', 'Mã học phần', 14),
              textColumn('sectionName', 'Lớp học phần', 12),
              textColumn('lecturerName', 'Giảng viên', 24),
              countColumn('classSize', 'Sĩ số', 8),
              countColumn('responseCount', 'Số phiếu đã thu', 12),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm', 2, 8),
              zColumn('zSchool', 'Z-Score so với toàn trường'),
              zColumn('zFaculty', 'Z-Score so với khoa'),
            ],
            data: rows,
          },
        ],
      };
    }

    if (tab === 'departments' && departments) {
      const data = departments;
      const rows = shownRows('departments', data.rows);
      const classSize = data.rows.reduce((sum, row) => sum + row.totalClassSize, 0);
      const rowResponses = data.rows.reduce((sum, row) => sum + row.responseCount, 0);
      const validResponses = data.rows.reduce((sum, row) => sum + row.validResponseCount, 0);
      const isScoped = data.rows.length < data.schoolDepartmentCount;

      return {
        fileName: `phan-tich-theo-bo-mon-${fileSuffix}`,
        metadata: metadataOf(
          'PHÂN TÍCH THEO BỘ MÔN',
          {
            'Số bộ môn': isScoped
              ? `${data.rows.length} bộ môn của bạn · toàn trường ${data.schoolDepartmentCount} bộ môn`
              : data.rows.length,
            'Số lớp có phiếu': data.schoolSectionCount,
            'Tổng phiếu toàn trường': data.schoolResponseCount,
            'Lớp Z-Score ≤ −1': data.schoolWarningCount > 0
              ? `${data.schoolWarningCount} lớp thấp hơn trung bình toàn trường từ 1 độ lệch chuẩn trở lên`
              : undefined,
          },
          notesFor(
            'departments',
            rows.length,
            data.rows.length,
            isScoped
              ? ['Dòng Toàn trường: Số lớp, Số phiếu đã thu và Điểm trung bình tính trên toàn trường; Tổng sĩ số, Số phiếu hợp lệ và hai tỷ lệ cộng từ các bộ môn trong bảng.']
              : [],
          ),
        ),
        sheets: [
          {
            sheetName: 'Theo bo mon',
            title: `PHÂN TÍCH THEO BỘ MÔN (${rows.length} BỘ MÔN)`,
            columns: [
              textColumn('facultyName', 'Khoa / Viện', 26),
              textColumn('departmentName', 'Bộ môn', 26),
              countColumn('sectionCount', 'Số lớp', 8),
              countColumn('lecturerCount', 'Số giảng viên', 8),
              countColumn('totalClassSize', 'Tổng sĩ số'),
              countColumn('responseCount', 'Số phiếu đã thu', 12),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm trung bình'),
              scoreColumn('standardDeviation', 'Độ lệch chuẩn', 3),
              zColumn('meanZScore', 'Z-Score so với toàn trường'),
              zColumn('facultyMeanZScore', 'Z-Score so với khoa'),
            ],
            data: [
              ...rows,
              {
                facultyName: 'Toàn trường',
                departmentName: `${data.schoolDepartmentCount} bộ môn`,
                sectionCount: data.schoolSectionCount,
                totalClassSize: classSize,
                responseCount: data.schoolResponseCount,
                validResponseCount: validResponses,
                responseRate: percentOf(rowResponses, classSize),
                validResponseRate: percentOf(validResponses, rowResponses),
                averageScore: data.schoolAverageScore,
              },
            ],
          },
        ],
      };
    }

    if (tab === 'courses' && courses) {
      const data = courses;
      const rows = shownRows('courses', data.rows);

      return {
        fileName: `phan-tich-theo-hoc-phan-${fileSuffix}`,
        metadata: metadataOf(
          'PHÂN TÍCH THEO HỌC PHẦN',
          {
            'Số học phần thu được phiếu': data.rows.length,
            'Học phần có từ 2 lớp trở lên': data.rows.filter((row) => row.sectionCount > 1).length,
          },
          notesFor('courses', rows.length, data.rows.length),
        ),
        sheets: [
          {
            sheetName: 'Theo hoc phan',
            title: `PHÂN TÍCH THEO HỌC PHẦN (${rows.length} HỌC PHẦN)`,
            columns: [
              textColumn('facultyName', 'Khoa / Viện', 22),
              textColumn('departmentName', 'Bộ môn', 22),
              textColumn('courseName', 'Học phần', 30),
              textColumn('courseCode', 'Mã học phần', 14),
              countColumn('sectionCount', 'Số lớp', 8),
              countColumn('lecturerCount', 'Số giảng viên', 8),
              countColumn('totalClassSize', 'Tổng sĩ số'),
              countColumn('responseCount', 'Số phiếu đã thu', 12),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm trung bình', 2, 8),
              scoreColumn('minScore', 'Lớp thấp nhất'),
              scoreColumn('maxScore', 'Lớp cao nhất'),
              scoreColumn('spread', 'Chênh lệch giữa các lớp', 2, 14),
              zColumn('meanZScore', 'Z-Score so với toàn trường'),
              zColumn('facultyMeanZScore', 'Z-Score so với khoa'),
            ],
            data: rows,
          },
        ],
      };
    }

    if (tab === 'lecturer' && selectedLecturerId !== null) {
      // Đang mở báo cáo một giảng viên thì xuất bảng các lớp của người đó.
      const report = lecturerReport?.lecturerId === selectedLecturerId ? lecturerReport : null;
      if (!report) return null;
      const rows = shownRows('lecturerSections', report.sections);
      const classSize = report.sections.reduce((sum, row) => sum + row.classSize, 0);
      const responseRate = classSize === 0 ? 0 : (report.totalResponseCount / classSize) * 100;

      return {
        fileName: `bao-cao-giang-vien-${report.fullName}-${fileSuffix}`,
        metadata: metadataOf(
          'BÁO CÁO GIẢNG VIÊN',
          {
            'Giảng viên': report.fullName,
            'Bộ môn': report.departmentName,
            'Khoa / Viện': report.facultyName,
            'Số lớp': `${report.sectionCount} lớp · tổng sĩ số ${classSize.toLocaleString('vi-VN')}`,
            'Điểm trung bình': report.averageScore.toFixed(2),
            'Phiếu thu': `${report.totalResponseCount.toLocaleString('vi-VN')} phiếu (${responseRate.toFixed(1)}%)`,
          },
          notesFor('lecturer', rows.length, report.sections.length, [
            'Điểm trung bình học phần = trung bình mọi lớp cùng học phần, kể cả lớp người khác dạy.',
          ]),
        ),
        sheets: [
          {
            sheetName: 'Cac lop giang day',
            title: `DANH SÁCH CÁC LỚP GIẢNG DẠY TRONG KỲ (${rows.length} LỚP)`,
            columns: [
              textColumn('courseCode', 'Mã HP', 12),
              textColumn('courseName', 'Học phần', 30),
              textColumn('sectionName', 'Lớp', 12),
              countColumn('classSize', 'Sĩ số', 8),
              countColumn('responseCount', 'Số phiếu đã thu', 12),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm', 2, 8),
              scoreColumn('courseAverageScore', 'Điểm trung bình học phần', 2, 14),
              zColumn('differenceFromCourse', 'Chênh so học phần'),
              zColumn('zSchool', 'Z-Score so với toàn trường'),
              zColumn('zFaculty', 'Z-Score so với khoa'),
              zColumn('zDepartment', 'Z-Score so với bộ môn'),
            ],
            data: rows,
          },
        ],
      };
    }

    if (tab === 'lecturer' && lecturers.length > 0) {
      const rows = shownRows('lecturer', lecturers);
      const totalSections = lecturers.reduce((sum, row) => sum + row.sectionCount, 0);
      const classSize = lecturers.reduce((sum, row) => sum + row.totalClassSize, 0);
      const responses = lecturers.reduce((sum, row) => sum + row.responseCount, 0);
      const validResponses = lecturers.reduce((sum, row) => sum + row.validResponseCount, 0);
      const totalWarnings = lecturers.reduce((sum, row) => sum + row.warningSectionCount, 0);
      const lecturersWithWarning = lecturers.filter((row) => row.warningSectionCount > 0).length;
      const scored = lecturers.filter((row) => row.averageScore !== null && row.validResponseCount > 0);
      const scoredResponses = scored.reduce((sum, row) => sum + row.validResponseCount, 0);
      const overallScore = scoredResponses === 0
        ? null
        : scored.reduce((sum, row) => sum + (row.averageScore ?? 0) * row.validResponseCount, 0) / scoredResponses;
      const responseRate = percentOf(responses, classSize);
      const validRate = percentOf(validResponses, responses);

      return {
        fileName: `bao-cao-giang-vien-${fileSuffix}`,
        metadata: metadataOf(
          'BÁO CÁO GIẢNG VIÊN',
          {
            'Số giảng viên thu được phiếu': lecturers.length,
            'Số lớp giảng dạy': totalSections,
            'Tổng sĩ số': classSize.toLocaleString('vi-VN'),
            'Phiếu thu về': `${responses.toLocaleString('vi-VN')} (${(responseRate ?? 0).toFixed(1)}%)`,
            'Phiếu hợp lệ': `${validResponses.toLocaleString('vi-VN')} (${(validRate ?? 0).toFixed(1)}%)`,
            'Điểm trung bình chung': overallScore === null ? '—' : overallScore.toFixed(2),
            'Giảng viên có lớp cảnh báo': lecturersWithWarning > 0
              ? `${lecturersWithWarning} giảng viên (${totalWarnings} lớp Z-Score ≤ −1)`
              : undefined,
          },
          notesFor('lecturer', rows.length, lecturers.length, [
            'Điểm trung bình chung = trung bình điểm các giảng viên, trọng số theo số phiếu hợp lệ.',
          ]),
        ),
        sheets: [
          {
            sheetName: 'Giang vien',
            title: `TỔNG HỢP KẾT QUẢ THEO GIẢNG VIÊN (${rows.length} GIẢNG VIÊN)`,
            columns: [
              textColumn('facultyName', 'Khoa / Viện', 22),
              textColumn('departmentName', 'Bộ môn', 22),
              textColumn('fullName', 'Giảng viên', 26),
              countColumn('sectionCount', 'Số lớp', 8),
              countColumn('totalClassSize', 'Tổng sĩ số'),
              countColumn('responseCount', 'Số phiếu thu', 10),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ hợp lệ'),
              scoreColumn('averageScore', 'Điểm trung bình', 2, 8),
              scoreColumn('minScore', 'Lớp thấp nhất'),
              scoreColumn('maxScore', 'Lớp cao nhất'),
            ],
            data: [
              ...rows,
              {
                facultyName: 'Toàn trường',
                fullName: `${lecturers.length} giảng viên`,
                sectionCount: totalSections,
                totalClassSize: classSize,
                responseCount: responses,
                validResponseCount: validResponses,
                responseRate,
                validResponseRate: validRate,
                averageScore: overallScore,
              },
            ],
          },
        ],
      };
    }

    return null;
  }, [
    tab,
    normalization,
    sectionTabData,
    departments,
    courses,
    lecturers,
    selectedLecturerId,
    lecturerReport,
    visibleRows,
    semesterSurveys,
    semesterSurveyId,
    thresholds,
  ]);

  // Nút Chú thích và nút xuất đi cùng nhau xuống dòng tóm tắt của tab: tệp xuất là
  // của đúng tab đang mở nên nút đứng cạnh bảng, không đứng trên thanh chọn đợt.
  const tabNote = (
    <>
      {noteButton}
      {exportAnalysisOptions && (
        <ExportDropdown
          options={exportAnalysisOptions}
          buttonLabel="Xuất báo cáo phân tích"
          size="sm"
        />
      )}
    </>
  );

  return (
    <div className="survey-operations-page survey-statistics-page survey-analysis-page">
      {/* Dùng đúng khối tiêu đề của các trang danh mục. Lớp .operations-header
          trước đây không có CSS nào nên thẻ h1 rơi về cỡ mặc định của trình duyệt,
          to gấp rưỡi tiêu đề mọi trang khác. Tên trang giờ nằm ở thanh trên cùng,
          giống hệt các trang còn lại. */}
      {/* Thanh chọn đứng TRƯỚC tiêu đề để bốn phần nằm ngay góc trái trên, giống
          hệt trang Tổng quan khảo sát. */}
      <div className="statistics-toolbar">
        <div className="form-group">
          <span>Học kỳ</span>
          <select
            className="input-select"
            value={semesterId}
            onChange={(e) => {
              const nextSemesterId = e.target.value;
              setSemesterId(nextSemesterId);
              navigateAnalysis({
                tab,
                semesterId: Number(nextSemesterId) || undefined,
                semesterSurveyId: undefined,
              });
            }}
          >
            {semesterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <span>Đợt khảo sát</span>
          <CampaignSelect
            id="analysis-campaign-select"
            value={semesterSurveyId}
            disabled={semesterSurveys.length === 0}
            placeholder={semesterSurveys.length === 0 ? 'Chưa có đợt nào' : 'Chọn đợt khảo sát'}
            onChange={(nextCampaignId) => {
              setSemesterSurveyId(nextCampaignId);
              navigateAnalysis({
                tab,
                semesterId: Number(semesterId) || undefined,
                semesterSurveyId: Number(nextCampaignId) || undefined,
              });
            }}
            options={semesterSurveys.map((survey) => ({
              value: String(survey.semesterSurveyId),
              label: survey.surveyName,
            }))}
          />
        </div>

        <div className="statistics-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadAnalysis(true)}
            disabled={loading || !semesterSurveyId}
            title="Tải lại toàn bộ số liệu phân tích"
          >
            <RefreshCw className={loading ? 'operation-icon auth-spin' : 'operation-icon'} />
            Tải lại
          </button>
          <UpdateScoresButton
            semesterSurveyId={semesterSurveyId}
            onUpdated={() => loadAnalysis(true)}
          />
        </div>
      </div>

      <ScoringConfigNote />

      <nav className="analysis-tabs" aria-label="Các góc nhìn phân tích">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`analysis-tab${item.id === tab ? ' is-active' : ''}`}
            onClick={() => {
              navigateAnalysis({
                tab: item.id,
                semesterId: Number(semesterId) || undefined,
                semesterSurveyId: Number(semesterSurveyId) || undefined,
              });
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loadError && (
        <div className="admin-alert" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="operations-empty" role="status">
          <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          <strong>Đang tính toán...</strong>
        </div>
      ) : tab === 'normalization' ? (
        <NormalizationGroupTab
          data={normalization}
          note={tabNote}
          onVisibleRowsChange={reportVisibleRows.normalization}
          onOpenDetail={openScopeDetail}
        />
      ) : tab === 'normalizationSections' ? (
        <NormalizationSectionTab
          data={sectionTabData}
          // Danh sách mục lấy cả từ bản toàn bài: bản theo mục lỗi hay rỗng thì vẫn còn
          // ô chọn để quay về.
          questionSections={(sectionTabData ?? normalization)?.questionSections ?? []}
          selectedQuestionSectionId={questionSectionId}
          onSelectQuestionSection={selectQuestionSection}
          note={tabNote}
          onVisibleRowsChange={reportVisibleRows.normalizationSections}
          onOpenSurvey={(courseSectionSurveyId) => {
            window.location.hash = `/reports/surveys/${courseSectionSurveyId}`
              + `?semester=${semesterId}&campaign=${semesterSurveyId}`;
          }}
        />
      ) : tab === 'departments' ? (
        <DepartmentTab
          data={departments}
          note={tabNote}
          onVisibleRowsChange={reportVisibleRows.departments}
          onOpenDetail={openScopeDetail}
        />
      ) : tab === 'courses' ? (
        <CourseDiagnosisTab
          data={courses}
          note={tabNote}
          onVisibleRowsChange={reportVisibleRows.courses}
          onOpenDetail={openScopeDetail}
        />
      ) : (
        <LecturerTab
          semesterSurveyId={semesterSurveyId ? Number(semesterSurveyId) : null}
          lecturers={lecturers}
          note={tabNote}
          onVisibleRowsChange={reportVisibleRows.lecturer}
          onSectionRowsChange={reportVisibleRows.lecturerSections}
          onReportChange={setLecturerReport}
          selectedLecturerId={selectedLecturerId}
          onSelectLecturer={(id) => {
            setSelectedLecturerId(id);
            navigateAnalysis({
              tab: 'lecturer',
              semesterId: Number(semesterId) || undefined,
              semesterSurveyId: Number(semesterSurveyId) || undefined,
              lecturerId: id ?? undefined,
            });
          }}
          onOpenSurvey={(courseSectionSurveyId) => {
            window.location.hash = `/reports/surveys/${courseSectionSurveyId}`
              + `?semester=${semesterId}&campaign=${semesterSurveyId}`;
          }}
        />
      )}
    </div>
  );
};

// ------------------------------------------------ Chuẩn hoá điểm
// Hai bảng tách làm hai tab: xếp chồng trong một tab thì bảng dưới bị đẩy khỏi
// tầm nhìn, phải cuộn qua hết bảng khoa mới thấy.

const NormalizationSummary: React.FC<{
  data: SemesterSurveyNormalization;
  showStandardDeviation?: boolean;
  note?: React.ReactNode;
}> = ({ data, showStandardDeviation = false, note }) => (
  <section className="statistics-summary">
    <span>
      Trung bình toàn trường: <strong>{data.schoolAverageScore.toFixed(3)}</strong>
    </span>
    {showStandardDeviation && (
      <span>
        Độ lệch chuẩn:{' '}
        <strong>
          {data.schoolStandardDeviation === null ? '—' : data.schoolStandardDeviation.toFixed(3)}
        </strong>
      </span>
    )}
    <span>
      {data.schoolSectionCount} lớp có phiếu · {data.groups.length} khoa/viện
    </span>
    {note}
  </section>
);

/**
 * Tab không có dữ liệu thì không có dòng tóm tắt để ghép nút chú thích vào, nên
 * nút đứng riêng một hàng — vẫn bấm được thay vì biến mất.
 */
const emptyWithNote = (note: React.ReactNode, message: string) => (
  <>
    <div className="analysis-hint-row">{note}</div>
    <div className="operations-empty">
      <strong>{message}</strong>
    </div>
  </>
);

// -------------------------------------------- Tab 1: mặt bằng từng khoa/viện

const NormalizationGroupTab: React.FC<{
  data: SemesterSurveyNormalization | null;
  onOpenDetail: (selection: AnalysisScopeTarget) => void;
  note?: React.ReactNode;
  /** Báo lên các dòng đang hiện (sau bộ lọc cột) để file xuất đúng bằng bảng. */
  onVisibleRowsChange?: (rows: readonly unknown[]) => void;
}> = ({ data, onOpenDetail, note, onVisibleRowsChange }) => {
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const groupColumns = useMemo<FilterableColumn<(typeof groups)[number]>[]>(() => [
    { key: 'facultyName', value: (row) => row.facultyName },
    { key: 'sectionCount', value: (row) => String(row.sectionCount), numeric: true },
    { key: 'averageScore', value: (row) => row.averageScore.toFixed(3), numeric: true },
    {
      key: 'standardDeviation',
      value: (row) => (row.standardDeviation === null ? '—' : row.standardDeviation.toFixed(3)),
      sortValue: (row) => row.standardDeviation,
    },
    {
      key: 'meanZScore',
      value: (row) => (row.meanZScore === null ? '—' : row.meanZScore.toFixed(2)),
      sortValue: (row) => row.meanZScore,
    },
    { key: 'lecturerCount', value: (row) => String(row.lecturerCount), numeric: true },
    { key: 'totalClassSize', value: (row) => String(row.totalClassSize), numeric: true },
    { key: 'responseCount', value: (row) => String(row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (row) => String(row.validResponseCount), numeric: true },
    {
      key: 'responseRate',
      value: (row) => `${row.responseRate.toFixed(1)}%`,
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => `${row.validResponseRate.toFixed(1)}%`,
      sortValue: (row) => row.validResponseRate,
    },
  ], []);
  const groupFilters = useColumnFilters(groups, groupColumns);
  const groupPagination = usePaginatedItems(groupFilters.visibleRows, analysisPageSize);
  useEffect(() => {
    onVisibleRowsChange?.(groupFilters.visibleRows);
  }, [groupFilters.visibleRows, onVisibleRowsChange]);

  // Dòng TOÀN TRƯỜNG cộng từ tất cả các khoa chứ không phải từ trang đang xem.
  // Riêng Số giảng viên để trống: một giảng viên dạy lớp của hai khoa sẽ bị đếm hai lần.
  const schoolClassSize = groups.reduce((sum, row) => sum + row.totalClassSize, 0);
  const schoolResponses = groups.reduce((sum, row) => sum + row.responseCount, 0);
  const schoolValidResponses = groups.reduce((sum, row) => sum + row.validResponseCount, 0);

  if (!data || data.sections.length === 0) {
    return emptyWithNote(note, 'Đợt này chưa có lớp nào thu được phiếu hợp lệ.');
  }

  return (
    <>
      <NormalizationSummary data={data} note={note} />

      <div className="analysis-group-table">
        <table className="statistics-table statistics-table--fixed">
          <thead>
            {/* Bảng này không có cột ghim nên bề rộng để theo phần trăm được. */}
            <tr>
              <th scope="col" style={{ width: '20%' }}>
                {groupFilters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th scope="col" style={{ width: '6%' }}>
                {groupFilters.filterHeader('sectionCount', 'Số lớp')}
              </th>
              <th scope="col" style={{ width: '6%' }}>
                {groupFilters.filterHeader('lecturerCount', 'Số giảng viên')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {groupFilters.filterHeader('totalClassSize', 'Tổng sĩ số')}
              </th>
              <th scope="col" style={{ width: '8%' }}>
                {groupFilters.filterHeader('responseCount', 'Số phiếu đã thu')}
              </th>
              <th scope="col" style={{ width: '8%' }}>
                {groupFilters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '9%' }} title="Số phiếu đã thu chia tổng sĩ số">
                {groupFilters.filterHeader('responseRate', 'Tỷ lệ phản hồi')}
              </th>
              <th scope="col" style={{ width: '9%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
                {groupFilters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '9%' }}>
                {groupFilters.filterHeader('averageScore', 'Điểm trung bình khoa')}
              </th>
              <th scope="col" style={{ width: '9%' }}>
                {groupFilters.filterHeader('standardDeviation', 'Độ lệch chuẩn')}
              </th>
              <th
                scope="col"
                style={{ width: '9%' }}
                title="Điểm trung bình khoa lệch trung bình toàn trường bao nhiêu lần sai số chuẩn σ/√n"
              >
                {groupFilters.filterHeader('meanZScore', 'Z-Score so với toàn trường')}
              </th>
            </tr>
          </thead>
          <tbody>
            {groupPagination.visibleItems.map((group) => {
              return (
                <tr
                  key={group.facultyName}
                  className={group.facultyId === null ? undefined : 'analysis-drill-row'}
                  onClick={group.facultyId === null ? undefined : () => onOpenDetail({
                    type: 'faculty',
                    id: group.facultyId!,
                  })}
                >
                  <td title={group.facultyName}>
                    {group.facultyId === null ? group.facultyName : (
                      <button
                        type="button"
                        className="analysis-drill-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenDetail({
                            type: 'faculty',
                            id: group.facultyId!,
                          });
                        }}
                      >
                        {group.facultyName}
                      </button>
                    )}
                  </td>
                  <td className="num">{group.sectionCount}</td>
                  <td className="num">{group.lecturerCount}</td>
                  <td className="num">{group.totalClassSize}</td>
                  <td className="num">{group.responseCount}</td>
                  <td className="num">{group.validResponseCount}</td>
                  <td className="num">{group.responseRate.toFixed(1)}%</td>
                  <td className="num">{group.validResponseRate.toFixed(1)}%</td>
                  {/* Tô theo bậc Z chứ không theo thang điểm tuyệt đối: cả bảng này
                      đọc bằng một thước duy nhất là 68-95-99.7. */}
                  <td className={zTierClass(group.meanZScore)}>{group.averageScore.toFixed(3)}</td>
                  <td className="num">
                    {group.standardDeviation === null ? '—' : group.standardDeviation.toFixed(3)}
                  </td>
                  <td className={zTierClass(group.meanZScore)}>
                    {group.meanZScore === null
                      ? '—'
                      : `${group.meanZScore > 0 ? '+' : ''}${group.meanZScore.toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
            <tr>
              <th scope="row">TOÀN TRƯỜNG</th>
              <td className="num is-sum">{data.schoolSectionCount}</td>
              {/* Số giảng viên để trống: cộng số của từng khoa sẽ đếm trùng người dạy liên khoa. */}
              <td />
              <td className="num is-sum">{schoolClassSize}</td>
              <td className="num is-sum">{schoolResponses}</td>
              <td className="num is-sum">{schoolValidResponses}</td>
              <td className="num is-mean">
                {schoolClassSize === 0
                  ? '—'
                  : `${((schoolResponses / schoolClassSize) * 100).toFixed(1)}%`}
              </td>
              <td className="num is-mean">
                {schoolResponses === 0
                  ? '—'
                  : `${((schoolValidResponses / schoolResponses) * 100).toFixed(1)}%`}
              </td>
              <td className="num is-mean">{data.schoolAverageScore.toFixed(3)}</td>
              <td className="num is-mean">
                {data.schoolStandardDeviation === null
                  ? '—'
                  : data.schoolStandardDeviation.toFixed(3)}
              </td>
              {/* Toàn trường là chính mốc so, nên Z của nó luôn bằng 0 — để trống. */}
              <td />
            </tr>
          </tbody>
        </table>
        <TablePagination
          page={groupPagination.page}
          pageSize={analysisPageSize}
          totalItems={groupFilters.visibleRows.length}
          itemLabel="khoa/viện"
          onPageChange={groupPagination.setPage}
        />
      </div>
    </>
  );
};

// ------------------------------------------- Tab 2: chuẩn hoá từng lớp

/**
 * Chọn phạm vi câu hỏi để tính điểm và Z-Score: toàn bộ bài khảo sát hoặc riêng một
 * mục của bộ câu hỏi (tối đa 3 mục). Chỉ chọn được một: bấm ô nào thì ô đó được chọn,
 * bấm lại ô đang chọn thì giữ nguyên.
 */
const QuestionSectionPicker: React.FC<{
  sections: NormalizationQuestionSection[];
  selectedId: number | null;
  onSelect: (sectionId: number | null) => void;
}> = ({ sections, selectedId, onSelect }) => {
  if (sections.length === 0) return null;

  // Số câu trong ngoặc là số câu được chấm điểm: không đếm câu bẫy và câu tự nhập.
  const totalQuestionCount = sections.reduce((sum, section) => sum + section.questionCount, 0);
  const options: { id: number | null; label: string }[] = [
    { id: null, label: `Toàn bộ bài khảo sát (${totalQuestionCount} câu)` },
    ...sections.map((section) => ({
      id: section.sectionId,
      label: `${section.sectionName} (${section.questionCount} câu)`,
    })),
  ];

  return (
    <div className="analysis-section-picker" role="group" aria-label="Tính điểm và Z-Score theo">
      <span className="analysis-section-picker__label">Tính điểm và Z-Score theo:</span>
      {options.map((option) => (
        <label key={option.id ?? 'all'} className="analysis-section-picker__option">
          <input
            type="checkbox"
            checked={option.id === selectedId}
            onChange={() => onSelect(option.id)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
};

const NormalizationSectionTab: React.FC<{
  data: SemesterSurveyNormalization | null;
  /** Các mục của bộ câu hỏi, để dựng ô chọn tính theo mục. */
  questionSections: NormalizationQuestionSection[];
  /** Null là toàn bộ bài khảo sát. */
  selectedQuestionSectionId: number | null;
  onSelectQuestionSection: (sectionId: number | null) => void;
  onOpenSurvey: (courseSectionSurveyId: number) => void;
  note?: React.ReactNode;
  /** Báo lên các dòng đang hiện (sau bộ lọc cột) để file xuất đúng bằng bảng. */
  onVisibleRowsChange?: (rows: readonly unknown[]) => void;
}> = ({
  data,
  questionSections,
  selectedQuestionSectionId,
  onSelectQuestionSection,
  onOpenSurvey,
  note,
  onVisibleRowsChange,
}) => {
  const sections = useMemo(() => data?.sections ?? [], [data]);
  const sectionColumns = useMemo<FilterableColumn<(typeof sections)[number]>[]>(() => [
    { key: 'courseCode', value: (row) => row.courseCode },
    { key: 'sectionName', value: (row) => row.sectionName },
    { key: 'courseName', value: (row) => row.courseName },
    { key: 'lecturerName', value: (row) => row.lecturerName },
    { key: 'departmentName', value: (row) => row.departmentName },
    { key: 'facultyName', value: (row) => row.facultyName },
    { key: 'classSize', value: (row) => String(row.classSize), numeric: true },
    { key: 'responseCount', value: (row) => String(row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (row) => String(row.validResponseCount), numeric: true },
    {
      key: 'responseRate',
      value: (row) => `${row.responseRate.toFixed(1)}%`,
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => `${row.validResponseRate.toFixed(1)}%`,
      sortValue: (row) => row.validResponseRate,
    },
    { key: 'averageScore', value: (row) => row.averageScore.toFixed(2), numeric: true },
    {
      key: 'zSchool',
      value: (row) => (row.zSchool === null ? '—' : row.zSchool.toFixed(2)),
      sortValue: (row) => row.zSchool,
    },
    {
      key: 'zFaculty',
      value: (row) => (row.zFaculty === null ? '—' : row.zFaculty.toFixed(2)),
      sortValue: (row) => row.zFaculty,
    },
  ], []);
  const sectionFilters = useColumnFilters(sections, sectionColumns);
  const sectionPagination = usePaginatedItems(sectionFilters.visibleRows, analysisPageSize);
  useEffect(() => {
    onVisibleRowsChange?.(sectionFilters.visibleRows);
  }, [sectionFilters.visibleRows, onVisibleRowsChange]);

  // Ô chọn luôn hiện, kể cả khi mục đang chọn chưa có số, để còn chọn lại được.
  const picker = (
    <QuestionSectionPicker
      sections={questionSections}
      selectedId={selectedQuestionSectionId}
      onSelect={onSelectQuestionSection}
    />
  );

  if (!data || data.sections.length === 0) {
    return (
      <>
        {picker}
        {emptyWithNote(
          note,
          selectedQuestionSectionId === null
            ? 'Đợt này chưa có lớp nào thu được phiếu hợp lệ.'
            : 'Chưa có lớp nào có điểm cho mục này.',
        )}
      </>
    );
  }

  return (
    <>
      {picker}
      <NormalizationSummary data={data} showStandardDeviation note={note} />

      <div className="statistics-table-scroll" tabIndex={0} aria-label="Chi tiết chuẩn hoá từng lớp">
        <table className="statistics-table statistics-table--fixed">
          <thead>
            <tr>
              <th scope="col" style={{ width: '12%' }}>
                {sectionFilters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th scope="col" style={{ width: '12%' }}>
                {sectionFilters.filterHeader('departmentName', 'Bộ môn')}
              </th>
              <th scope="col" style={{ width: '14%' }}>
                {sectionFilters.filterHeader('courseName', 'Học phần')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {sectionFilters.filterHeader('courseCode', 'Mã học phần')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {sectionFilters.filterHeader('sectionName', 'Lớp học phần')}
              </th>
              <th scope="col" style={{ width: '14%' }}>
                {sectionFilters.filterHeader('lecturerName', 'Giảng viên')}
              </th>
              <th scope="col" style={{ width: '3%' }}>
                {sectionFilters.filterHeader('classSize', 'Sĩ số')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {sectionFilters.filterHeader('responseCount', 'Số phiếu đã thu')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {sectionFilters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '5%' }} title="Số phiếu đã thu chia sĩ số lớp">
                {sectionFilters.filterHeader('responseRate', 'Tỷ lệ phản hồi')}
              </th>
              <th scope="col" style={{ width: '5%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
                {sectionFilters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {sectionFilters.filterHeader('averageScore', 'Điểm')}
              </th>
              <th scope="col" style={{ width: '6%' }}>
                {sectionFilters.filterHeader('zSchool', 'Z-Score so với toàn trường')}
              </th>
              <th scope="col" style={{ width: '6%' }}>
                {sectionFilters.filterHeader('zFaculty', 'Z-Score so với khoa')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sectionPagination.visibleItems.map((section) => (
              <tr
                key={section.courseSectionSurveyId}
                className="analysis-drill-row"
                onClick={() => onOpenSurvey(section.courseSectionSurveyId)}
              >
                <td title={section.facultyName}>{section.facultyName}</td>
                <td title={section.departmentName}>{section.departmentName}</td>
                <td title={section.courseName}>{section.courseName}</td>
                <td>
                  <button
                    type="button"
                    className="analysis-drill-link operations-code"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenSurvey(section.courseSectionSurveyId);
                    }}
                    title={`Xem kết quả lớp ${section.courseCode} - ${section.sectionName}`}
                  >
                    {section.courseCode}
                  </button>
                </td>
                <td>{section.sectionName}</td>
                <td title={section.lecturerName}>{section.lecturerName}</td>
                <td className="num">{section.classSize}</td>
                <td className="num">{section.responseCount}</td>
                <td className="num">{section.validResponseCount}</td>
                <td className="num">{section.responseRate.toFixed(1)}%</td>
                <td className="num">{section.validResponseRate.toFixed(1)}%</td>
                <td className={zTierClass(section.zFaculty)}>
                  {section.averageScore.toFixed(2)}
                </td>
                <td className={zTierClass(section.zSchool)}>
                  {section.zSchool === null
                    ? '—'
                    : `${section.zSchool > 0 ? '+' : ''}${section.zSchool.toFixed(2)}`}
                </td>
                <td className={zTierClass(section.zFaculty)}>
                  {section.zFaculty === null
                    ? '—'
                    : `${section.zFaculty > 0 ? '+' : ''}${section.zFaculty.toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination
          page={sectionPagination.page}
          pageSize={analysisPageSize}
          totalItems={sectionFilters.visibleRows.length}
          itemLabel="lớp"
          onPageChange={sectionPagination.setPage}
        />
      </div>
    </>
  );
};

// -------------------------------------------- Tab 3: tổng hợp theo bộ môn

const DepartmentTab: React.FC<{
  data: SemesterSurveyDepartmentSummary | null;
  onOpenDetail: (selection: AnalysisScopeTarget) => void;
  note?: React.ReactNode;
  /** Báo lên các dòng đang hiện (sau bộ lọc cột) để file xuất đúng bằng bảng. */
  onVisibleRowsChange?: (rows: readonly unknown[]) => void;
}> = ({ data, onOpenDetail, note, onVisibleRowsChange }) => {
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo<FilterableColumn<(typeof rows)[number]>[]>(() => [
    { key: 'facultyName', value: (row) => row.facultyName },
    { key: 'departmentName', value: (row) => row.departmentName },
    { key: 'sectionCount', value: (row) => String(row.sectionCount), numeric: true },
    { key: 'lecturerCount', value: (row) => String(row.lecturerCount), numeric: true },
    { key: 'totalClassSize', value: (row) => String(row.totalClassSize), numeric: true },
    { key: 'responseCount', value: (row) => String(row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (row) => String(row.validResponseCount), numeric: true },
    {
      key: 'responseRate',
      value: (row) => `${row.responseRate.toFixed(1)}%`,
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => `${row.validResponseRate.toFixed(1)}%`,
      sortValue: (row) => row.validResponseRate,
    },
    {
      key: 'averageScore',
      value: (row) => (row.averageScore === null ? '—' : row.averageScore.toFixed(2)),
      sortValue: (row) => row.averageScore,
    },
    {
      key: 'standardDeviation',
      value: (row) => (row.standardDeviation === null ? '—' : row.standardDeviation.toFixed(3)),
      sortValue: (row) => row.standardDeviation,
    },
    {
      key: 'meanZScore',
      value: (row) => (row.meanZScore === null ? '—' : row.meanZScore.toFixed(2)),
      sortValue: (row) => row.meanZScore,
    },
    {
      key: 'facultyMeanZScore',
      value: (row) => (row.facultyMeanZScore === null ? '—' : row.facultyMeanZScore.toFixed(2)),
      sortValue: (row) => row.facultyMeanZScore,
    },
  ], []);
  const filters = useColumnFilters(rows, columns);
  const pagination = usePaginatedItems(filters.visibleRows, analysisPageSize);
  useEffect(() => {
    onVisibleRowsChange?.(filters.visibleRows);
  }, [filters.visibleRows, onVisibleRowsChange]);

  if (!data || data.rows.length === 0) {
    return emptyWithNote(note, 'Đợt này chưa có bộ môn nào thu được phiếu hợp lệ.');
  }

  // Dòng tổng lấy thẳng số toàn trường từ backend chứ không cộng lại từ `rows`.
  // Trưởng bộ môn chỉ nhận đúng dòng bộ môn mình, cộng lại thì mất mặt bằng để so.
  const totalSections = data.schoolSectionCount;
  const totalResponses = data.schoolResponseCount;
  const totalWarnings = data.schoolWarningCount;
  const overallScore = data.schoolAverageScore;
  // Dòng tổng cộng từ các dòng đang hiện. Trưởng bộ môn chỉ thấy dòng của mình
  // nên các số này là của bộ môn đó, khác các số toàn trường ở trên.
  const totalClassSize = rows.reduce((sum, row) => sum + row.totalClassSize, 0);
  const totalRowResponses = rows.reduce((sum, row) => sum + row.responseCount, 0);
  const totalValidResponses = rows.reduce((sum, row) => sum + row.validResponseCount, 0);
  const isScoped = data.rows.length < data.schoolDepartmentCount;

  return (
    <>
      <section className="statistics-summary">
        <span>
          {isScoped
            ? `${data.rows.length} bộ môn của bạn · toàn trường ${data.schoolDepartmentCount} bộ môn`
            : `${data.rows.length} bộ môn`}
          {' · '}{totalSections} lớp có phiếu
        </span>
        <span>
          Tổng phiếu toàn trường: <strong>{totalResponses}</strong>
        </span>
        {totalWarnings > 0 && (
          <span className="statistics-trap-note">
            <strong>{totalWarnings} lớp</strong> thấp hơn trung bình toàn trường từ 1 độ lệch
            chuẩn trở lên (Z-Score ≤ −1)
          </span>
        )}
        {note}
      </section>

      <div className="statistics-table-scroll" tabIndex={0} aria-label="Phân tích theo bộ môn">
        <table className="statistics-table statistics-table--fixed statistics-table--fill">
          <thead>
            <tr>
              <th scope="col" style={{ width: '19%' }}>
                {filters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th scope="col" style={{ width: '18%' }}>
                {filters.filterHeader('departmentName', 'Bộ môn')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('sectionCount', 'Số lớp')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('lecturerCount', 'Số giảng viên')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('totalClassSize', 'Tổng sĩ số')}
              </th>
              <th scope="col" style={{ width: '6%' }}>
                {filters.filterHeader('responseCount', 'Số phiếu đã thu')}
              </th>
              <th scope="col" style={{ width: '6%' }}>
                {filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '6%' }} title="Số phiếu đã thu chia tổng sĩ số">
                {filters.filterHeader('responseRate', 'Tỷ lệ phản hồi')}
              </th>
              <th scope="col" style={{ width: '6%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
                {filters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('averageScore', 'Điểm trung bình')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('standardDeviation', 'Độ lệch chuẩn')}
              </th>
              <th
                scope="col"
                style={{ width: '7%' }}
                title="Điểm trung bình bộ môn lệch trung bình toàn trường bao nhiêu lần sai số chuẩn σ/√n"
              >
                {filters.filterHeader('meanZScore', 'Z-Score so với toàn trường')}
              </th>
              <th
                scope="col"
                style={{ width: '7%' }}
                title="Điểm trung bình bộ môn lệch trung bình khoa bao nhiêu lần sai số chuẩn σ/√n"
              >
                {filters.filterHeader('facultyMeanZScore', 'Z-Score so với khoa')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pagination.visibleItems.map((row) => (
              <tr
                key={`${row.facultyName}-${row.departmentName}`}
                className={row.departmentId === null ? undefined : 'analysis-drill-row'}
                onClick={row.departmentId === null ? undefined : () => onOpenDetail({
                  type: 'department',
                  id: row.departmentId!,
                })}
              >
                <td title={row.facultyName}>{row.facultyName}</td>
                <td title={row.departmentName}>
                  {row.departmentId === null ? row.departmentName : (
                    <button
                      type="button"
                      className="analysis-drill-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenDetail({
                          type: 'department',
                          id: row.departmentId!,
                        });
                      }}
                    >
                      {row.departmentName}
                    </button>
                  )}
                </td>
                <td className="num">{row.sectionCount}</td>
                <td className="num">{row.lecturerCount}</td>
                <td className="num">{row.totalClassSize}</td>
                <td className="num">{row.responseCount}</td>
                <td className="num">{row.validResponseCount}</td>
                <td className="num">{row.responseRate.toFixed(1)}%</td>
                <td className="num">{row.validResponseRate.toFixed(1)}%</td>
                <td className={scoreClass(row.averageScore)}>
                  {row.averageScore === null ? '—' : row.averageScore.toFixed(2)}
                </td>
                <td className="num">
                  {row.standardDeviation === null ? '—' : row.standardDeviation.toFixed(3)}
                </td>
                <td className={zTierClass(row.meanZScore)}>
                  {row.meanZScore === null
                    ? '—'
                    : `${row.meanZScore > 0 ? '+' : ''}${row.meanZScore.toFixed(2)}`}
                </td>
                <td className={zTierClass(row.facultyMeanZScore)}>
                  {row.facultyMeanZScore === null
                    ? '—'
                    : `${row.facultyMeanZScore > 0 ? '+' : ''}${row.facultyMeanZScore.toFixed(2)}`}
                </td>
              </tr>
            ))}
            {/* Ô đệm nuốt chỗ thừa để dòng tổng kết luôn nằm sát đáy khung. */}
            <tr className="table-spacer" aria-hidden="true">
              <td colSpan={13} />
            </tr>
          </tbody>

          <tfoot>
            <tr>
              <th scope="row">Toàn trường</th>
              <td>{data.schoolDepartmentCount} bộ môn</td>
              <td className="num is-sum">{totalSections}</td>
              <td />
              <td className="num is-sum">{totalClassSize}</td>
              <td className="num is-sum">{totalResponses}</td>
              <td className="num is-sum">{totalValidResponses}</td>
              <td className="num is-mean">
                {totalClassSize === 0
                  ? '—'
                  : `${((totalRowResponses / totalClassSize) * 100).toFixed(1)}%`}
              </td>
              <td className="num is-mean">
                {totalRowResponses === 0
                  ? '—'
                  : `${((totalValidResponses / totalRowResponses) * 100).toFixed(1)}%`}
              </td>
              <td className="num is-mean is-total">
                {overallScore === null ? '—' : overallScore.toFixed(2)}
              </td>
              {/* Độ lệch chuẩn và hai cột Z-Score của dòng tổng để trống: toàn trường
                  chính là mốc so, Z của nó luôn bằng 0; toàn trường không thuộc khoa nào. */}
              <td />
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
        <TablePagination
          page={pagination.page}
          pageSize={analysisPageSize}
          totalItems={filters.visibleRows.length}
          itemLabel="bộ môn"
          onPageChange={pagination.setPage}
        />
      </div>
    </>
  );
};

// ------------------------------------------- Tab 4: chẩn đoán học phần

const CourseDiagnosisTab: React.FC<{
  data: SemesterSurveyCourseDiagnosis | null;
  onOpenDetail: (selection: AnalysisScopeTarget) => void;
  note?: React.ReactNode;
  /** Báo lên các dòng đang hiện (sau bộ lọc cột) để file xuất đúng bằng bảng. */
  onVisibleRowsChange?: (rows: readonly unknown[]) => void;
}> = ({ data, onOpenDetail, note, onVisibleRowsChange }) => {
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo<FilterableColumn<(typeof rows)[number]>[]>(() => [
    { key: 'courseCode', value: (row) => row.courseCode },
    { key: 'courseName', value: (row) => row.courseName },
    { key: 'departmentName', value: (row) => row.departmentName },
    { key: 'facultyName', value: (row) => row.facultyName },
    { key: 'sectionCount', value: (row) => String(row.sectionCount), numeric: true },
    { key: 'lecturerCount', value: (row) => String(row.lecturerCount), numeric: true },
    { key: 'totalClassSize', value: (row) => String(row.totalClassSize), numeric: true },
    { key: 'responseCount', value: (row) => String(row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (row) => String(row.validResponseCount), numeric: true },
    {
      key: 'responseRate',
      value: (row) => `${row.responseRate.toFixed(1)}%`,
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => `${row.validResponseRate.toFixed(1)}%`,
      sortValue: (row) => row.validResponseRate,
    },
    { key: 'averageScore', value: (row) => row.averageScore.toFixed(2), numeric: true },
    { key: 'minScore', value: (row) => row.minScore.toFixed(2), numeric: true },
    { key: 'maxScore', value: (row) => row.maxScore.toFixed(2), numeric: true },
    { key: 'spread', value: (row) => row.spread.toFixed(2), numeric: true },
    {
      key: 'meanZScore',
      value: (row) => (row.meanZScore === null ? '—' : row.meanZScore.toFixed(2)),
      sortValue: (row) => row.meanZScore,
    },
    {
      key: 'facultyMeanZScore',
      value: (row) => (row.facultyMeanZScore === null ? '—' : row.facultyMeanZScore.toFixed(2)),
      sortValue: (row) => row.facultyMeanZScore,
    },
  ], []);
  const filters = useColumnFilters(rows, columns);
  const pagination = usePaginatedItems(filters.visibleRows, analysisPageSize);
  useEffect(() => {
    onVisibleRowsChange?.(filters.visibleRows);
  }, [filters.visibleRows, onVisibleRowsChange]);

  if (!data || data.rows.length === 0) {
    return emptyWithNote(note, 'Đợt này chưa có học phần nào thu được phiếu hợp lệ.');
  }

  const multiSection = data.rows.filter((row) => row.sectionCount > 1).length;

  return (
    <>
      {/* Các dòng đếm học phần theo kết luận (lỗi học phần / lỗi giảng viên / tốt
          đều) đã bỏ cùng với cột Kết luận. */}
      <section className="statistics-summary">
        <span>
          <strong>{data.rows.length}</strong> học phần thu được phiếu, trong đó{' '}
          <strong>{multiSection}</strong> học phần có từ 2 lớp trở lên nên mới so được các
          lớp với nhau
        </span>
        {note}
      </section>

      <div className="statistics-table-scroll" tabIndex={0} aria-label="Phân tích theo học phần">
        <table className="statistics-table statistics-table--fixed">
          <thead>
            <tr>
              <th scope="col" style={{ width: '11%' }}>
                {filters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th scope="col" style={{ width: '10%' }}>
                {filters.filterHeader('departmentName', 'Bộ môn')}
              </th>
              <th scope="col" style={{ width: '17%' }}>
                {filters.filterHeader('courseName', 'Học phần')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('courseCode', 'Mã học phần')}
              </th>
              <th scope="col" style={{ width: '3%' }}>
                {filters.filterHeader('sectionCount', 'Số lớp')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {filters.filterHeader('lecturerCount', 'Số giảng viên')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {filters.filterHeader('totalClassSize', 'Tổng sĩ số')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {filters.filterHeader('responseCount', 'Số phiếu đã thu')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '5%' }} title="Số phiếu đã thu chia tổng sĩ số">
                {filters.filterHeader('responseRate', 'Tỷ lệ phản hồi')}
              </th>
              <th scope="col" style={{ width: '5%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
                {filters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('averageScore', 'Điểm trung bình')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {filters.filterHeader('minScore', 'Lớp thấp nhất')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {filters.filterHeader('maxScore', 'Lớp cao nhất')}
              </th>
              <th scope="col" style={{ width: '5%' }} title="Điểm lớp cao nhất trừ điểm lớp thấp nhất">
                {filters.filterHeader('spread', 'Chênh lệch giữa các lớp')}
              </th>
              <th
                scope="col"
                style={{ width: '5%' }}
                title="Điểm trung bình học phần lệch trung bình toàn trường bao nhiêu lần sai số chuẩn σ/√n"
              >
                {filters.filterHeader('meanZScore', 'Z-Score so với toàn trường')}
              </th>
              <th
                scope="col"
                style={{ width: '5%' }}
                title="Điểm trung bình học phần lệch trung bình khoa bao nhiêu lần sai số chuẩn σ/√n"
              >
                {filters.filterHeader('facultyMeanZScore', 'Z-Score so với khoa')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pagination.visibleItems.map((row) => (
              <tr
                key={row.courseId}
                className="analysis-drill-row"
                onClick={() => onOpenDetail({
                  type: 'course',
                  id: row.courseId,
                })}
              >
                <td title={row.facultyName}>{row.facultyName}</td>
                <td title={row.departmentName}>{row.departmentName}</td>
                <td title={row.courseName}>
                  <button
                    type="button"
                    className="analysis-drill-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDetail({
                        type: 'course',
                        id: row.courseId,
                      });
                    }}
                  >
                    {row.courseName}
                  </button>
                </td>
                <td>
                  <span className="operations-code">{row.courseCode}</span>
                </td>
                <td className="num">{row.sectionCount}</td>
                <td className="num">{row.lecturerCount}</td>
                <td className="num">{row.totalClassSize}</td>
                <td className="num">{row.responseCount}</td>
                <td className="num">{row.validResponseCount}</td>
                <td className="num">{row.responseRate.toFixed(1)}%</td>
                <td className="num">{row.validResponseRate.toFixed(1)}%</td>
                <td className={scoreClass(row.averageScore)}>{row.averageScore.toFixed(2)}</td>
                <td className={scoreClass(row.minScore)}>{row.minScore.toFixed(2)}</td>
                <td className={scoreClass(row.maxScore)}>{row.maxScore.toFixed(2)}</td>
                <td className={spreadClass(row.spread)}>{row.spread.toFixed(2)}</td>
                <td className={zTierClass(row.meanZScore)}>
                  {row.meanZScore === null
                    ? '—'
                    : `${row.meanZScore > 0 ? '+' : ''}${row.meanZScore.toFixed(2)}`}
                </td>
                <td className={zTierClass(row.facultyMeanZScore)}>
                  {row.facultyMeanZScore === null
                    ? '—'
                    : `${row.facultyMeanZScore > 0 ? '+' : ''}${row.facultyMeanZScore.toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination
          page={pagination.page}
          pageSize={analysisPageSize}
          totalItems={filters.visibleRows.length}
          itemLabel="học phần"
          onPageChange={pagination.setPage}
        />
      </div>
    </>
  );
};

// ------------------------------------------ Tab 5: báo cáo cá nhân giảng viên

const LecturerTab: React.FC<{
  semesterSurveyId: number | null;
  lecturers: LecturerOption[];
  selectedLecturerId: number | null;
  onSelectLecturer: (lecturerId: number | null) => void;
  onOpenSurvey: (courseSectionSurveyId: number) => void;
  note?: React.ReactNode;
  /** Báo lên các dòng đang hiện (sau bộ lọc cột) để file xuất đúng bằng bảng. */
  onVisibleRowsChange?: (rows: readonly unknown[]) => void;
  onSectionRowsChange?: (rows: readonly unknown[]) => void;
  onReportChange?: (report: LecturerReport | null) => void;
}> = ({
  semesterSurveyId,
  lecturers,
  selectedLecturerId,
  onSelectLecturer,
  onOpenSurvey,
  note,
  onVisibleRowsChange,
  onSectionRowsChange,
  onReportChange,
}) => {
  const [report, setReport] = useState<LecturerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onReportChange?.(report);
  }, [report, onReportChange]);

  useEffect(() => {
    if (!selectedLecturerId || !semesterSurveyId) {
      setReport(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    surveyApi.lecturerReport(semesterSurveyId, selectedLecturerId)
      .then((res) => {
        if (!cancelled) {
          setReport(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(messageFrom(err));
          setReport(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLecturerId, semesterSurveyId]);

  const columns = useMemo<FilterableColumn<LecturerOption>[]>(() => [
    { key: 'fullName', value: (row) => row.fullName },
    { key: 'departmentName', value: (row) => row.departmentName },
    { key: 'facultyName', value: (row) => row.facultyName },
    { key: 'sectionCount', value: (row) => String(row.sectionCount), numeric: true },
    { key: 'totalClassSize', value: (row) => String(row.totalClassSize), numeric: true },
    { key: 'responseCount', value: (row) => String(row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (row) => String(row.validResponseCount), numeric: true },
    {
      key: 'responseRate',
      value: (row) => `${row.responseRate.toFixed(1)}%`,
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => `${row.validResponseRate.toFixed(1)}%`,
      sortValue: (row) => row.validResponseRate,
    },
    {
      key: 'averageScore',
      value: (row) => (row.averageScore === null ? '—' : row.averageScore.toFixed(2)),
      sortValue: (row) => row.averageScore,
    },
    {
      key: 'minScore',
      value: (row) => (typeof row.minScore === 'number' ? row.minScore.toFixed(2) : '—'),
      sortValue: (row) => row.minScore,
    },
    {
      key: 'maxScore',
      value: (row) => (typeof row.maxScore === 'number' ? row.maxScore.toFixed(2) : '—'),
      sortValue: (row) => row.maxScore,
    },
  ], []);

  const filters = useColumnFilters(lecturers, columns);
  const pagination = usePaginatedItems(filters.visibleRows, analysisPageSize);
  useEffect(() => {
    onVisibleRowsChange?.(filters.visibleRows);
  }, [filters.visibleRows, onVisibleRowsChange]);

  const totalSections = useMemo(() => lecturers.reduce((sum, r) => sum + r.sectionCount, 0), [lecturers]);
  const totalClassSize = useMemo(() => lecturers.reduce((sum, r) => sum + (r.totalClassSize ?? 0), 0), [lecturers]);
  const totalResponses = useMemo(() => lecturers.reduce((sum, r) => sum + (r.responseCount ?? 0), 0), [lecturers]);
  const totalValidResponses = useMemo(() => lecturers.reduce((sum, r) => sum + (r.validResponseCount ?? 0), 0), [lecturers]);
  const totalWarnings = useMemo(() => lecturers.reduce((sum, r) => sum + (r.warningSectionCount ?? 0), 0), [lecturers]);
  const lecturersWithWarning = useMemo(() => lecturers.filter((r) => r.warningSectionCount > 0).length, [lecturers]);
  const overallAvgScore = useMemo(() => {
    const scored = lecturers.filter(
      (row) => typeof row.averageScore === 'number' && (row.validResponseCount ?? 0) > 0,
    );
    const responseCount = scored.reduce((sum, row) => sum + (row.validResponseCount ?? 0), 0);
    if (responseCount === 0) return null;
    const totalScore = scored.reduce(
      (sum, row) => sum + (row.averageScore ?? 0) * (row.validResponseCount ?? 0),
      0,
    );
    return totalScore / responseCount;
  }, [lecturers]);

  if (lecturers.length === 0) {
    return emptyWithNote(note, 'Đợt này chưa có giảng viên nào thu được phiếu hợp lệ.');
  }

  if (selectedLecturerId) {
    return (
      <div className="analysis-scope-detail">
        <div className="analysis-hint-row">{note}</div>

        {error && (
          <div className="admin-alert" role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="operations-empty" role="status">
            <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
            <strong>Đang tải báo cáo giảng viên...</strong>
          </div>
        ) : report ? (
          <LecturerReportView
            report={report}
            onBack={() => onSelectLecturer(null)}
            onOpenSurvey={onOpenSurvey}
            onVisibleRowsChange={onSectionRowsChange}
          />
        ) : null}
      </div>
    );
  }

  return (
    <>
      <section className="statistics-summary">
        {/* Dòng này chỉ giữ vài số đầu bảng: sĩ số, phiếu thu và phiếu hợp lệ đã có ở
            dòng tổng cuối bảng, để cả ra đây thì nút Chú thích và nút xuất bị đẩy
            xuống dòng thứ hai. */}
        <span>
          <strong>{lecturers.length}</strong> giảng viên · <strong>{totalSections}</strong> lớp giảng dạy
        </span>
        <span>
          Điểm trung bình chung:{' '}
          <strong>{overallAvgScore !== null ? overallAvgScore.toFixed(2) : '—'}</strong>
        </span>
        {lecturersWithWarning > 0 && (
          <span className="statistics-trap-note">
            <strong>{lecturersWithWarning} giảng viên</strong> có lớp cảnh báo ({totalWarnings} lớp)
          </span>
        )}
        {note}
      </section>

      <div className="statistics-table-scroll" tabIndex={0} aria-label="Tổng hợp kết quả đánh giá theo giảng viên">
        <table className="statistics-table statistics-table--fixed statistics-table--fill">
          <thead>
            <tr>
              <th scope="col" style={{ width: '14%' }}>
                {filters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th scope="col" style={{ width: '14%' }}>
                {filters.filterHeader('departmentName', 'Bộ môn')}
              </th>
              <th scope="col" style={{ width: '16%' }}>
                {filters.filterHeader('fullName', 'Giảng viên')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('sectionCount', 'Số lớp')}
              </th>
              <th scope="col" style={{ width: '6%' }}>
                {filters.filterHeader('totalClassSize', 'Tổng sĩ số')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {filters.filterHeader('responseCount', 'Số phiếu thu')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '7%' }} title="Số phiếu đã thu chia tổng sĩ số">
                {filters.filterHeader('responseRate', 'Tỷ lệ phản hồi')}
              </th>
              <th scope="col" style={{ width: '7%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
                {filters.filterHeader('validResponseRate', 'Tỷ lệ hợp lệ')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {filters.filterHeader('averageScore', 'Điểm trung bình')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('minScore', 'Lớp thấp nhất')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('maxScore', 'Lớp cao nhất')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pagination.visibleItems.map((row) => (
              <tr
                key={row.lecturerId}
                className="analysis-drill-row"
                onClick={() => onSelectLecturer(row.lecturerId)}
              >
                <td title={row.facultyName}>{row.facultyName}</td>
                <td title={row.departmentName}>{row.departmentName}</td>
                <td title={row.fullName}>
                  <button
                    type="button"
                    className="analysis-drill-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectLecturer(row.lecturerId);
                    }}
                  >
                    {row.fullName}
                  </button>
                </td>
                <td className="num">{row.sectionCount}</td>
                <td className="num">{row.totalClassSize}</td>
                <td className="num">{row.responseCount}</td>
                <td className="num">{row.validResponseCount}</td>
                <td className="num">{(row.responseRate ?? 0).toFixed(1)}%</td>
                <td className="num">{(row.validResponseRate ?? 0).toFixed(1)}%</td>
                <td className={scoreClass(row.averageScore)}>
                  {typeof row.averageScore === 'number' ? row.averageScore.toFixed(2) : '—'}
                </td>
                <td className={scoreClass(row.minScore)}>
                  {typeof row.minScore === 'number' ? row.minScore.toFixed(2) : '—'}
                </td>
                <td className={scoreClass(row.maxScore)}>
                  {typeof row.maxScore === 'number' ? row.maxScore.toFixed(2) : '—'}
                </td>
              </tr>
            ))}
            <tr className="table-spacer" aria-hidden="true">
              <td colSpan={12} />
            </tr>
          </tbody>

          <tfoot>
            <tr>
              <th scope="row">Toàn trường</th>
              <td />
              <td>{lecturers.length} giảng viên</td>
              <td className="num is-sum">{totalSections}</td>
              <td className="num is-sum">{totalClassSize}</td>
              <td className="num is-sum">{totalResponses}</td>
              <td className="num is-sum">{totalValidResponses}</td>
              <td className="num is-mean">
                {totalClassSize === 0
                  ? '—'
                  : `${((totalResponses / totalClassSize) * 100).toFixed(1)}%`}
              </td>
              <td className="num is-mean">
                {totalResponses === 0
                  ? '—'
                  : `${((totalValidResponses / totalResponses) * 100).toFixed(1)}%`}
              </td>
              <td className="num is-mean is-total">
                {overallAvgScore === null ? '—' : overallAvgScore.toFixed(2)}
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
        <TablePagination
          page={pagination.page}
          pageSize={analysisPageSize}
          totalItems={filters.visibleRows.length}
          itemLabel="giảng viên"
          onPageChange={pagination.setPage}
        />
      </div>
    </>
  );
};

const LecturerReportView: React.FC<{
  report: LecturerReport;
  onBack?: () => void;
  onOpenSurvey?: (courseSectionSurveyId: number) => void;
  /** Báo lên các dòng đang hiện (sau bộ lọc cột) để file xuất đúng bằng bảng. */
  onVisibleRowsChange?: (rows: readonly unknown[]) => void;
}> = ({ report, onBack, onOpenSurvey, onVisibleRowsChange }) => {
  const columns = useMemo<FilterableColumn<LecturerReport['sections'][number]>[]>(() => [
    { key: 'courseCode', value: (row) => row.courseCode },
    { key: 'courseName', value: (row) => row.courseName },
    { key: 'sectionName', value: (row) => row.sectionName },
    { key: 'classSize', value: (row) => String(row.classSize), numeric: true },
    { key: 'responseCount', value: (row) => String(row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (row) => String(row.validResponseCount), numeric: true },
    {
      key: 'responseRate',
      value: (row) => `${row.responseRate.toFixed(1)}%`,
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => `${row.validResponseRate.toFixed(1)}%`,
      sortValue: (row) => row.validResponseRate,
    },
    { key: 'averageScore', value: (row) => row.averageScore.toFixed(2), numeric: true },
    {
      key: 'courseAverageScore',
      value: (row) => (row.courseAverageScore === null ? '—' : row.courseAverageScore.toFixed(2)),
      sortValue: (row) => row.courseAverageScore,
    },
    {
      key: 'differenceFromCourse',
      value: (row) => (row.differenceFromCourse === null ? '—' : row.differenceFromCourse.toFixed(2)),
      sortValue: (row) => row.differenceFromCourse,
    },
    {
      key: 'zSchool',
      value: (row) => (row.zSchool === null ? '—' : row.zSchool.toFixed(2)),
      sortValue: (row) => row.zSchool,
    },
    {
      key: 'zFaculty',
      value: (row) => (row.zFaculty === null ? '—' : row.zFaculty.toFixed(2)),
      sortValue: (row) => row.zFaculty,
    },
    {
      key: 'zDepartment',
      value: (row) => (row.zDepartment === null ? '—' : row.zDepartment.toFixed(2)),
      sortValue: (row) => row.zDepartment,
    },
  ], []);
  const filters = useColumnFilters(report.sections, columns);
  useEffect(() => {
    onVisibleRowsChange?.(filters.visibleRows);
  }, [filters.visibleRows, onVisibleRowsChange]);
  const totalClassSize = report.sections.reduce((sum, row) => sum + row.classSize, 0);
  const overallRate =
    totalClassSize === 0 ? 0 : (report.totalResponseCount / totalClassSize) * 100;

  return (
    <>
      <section className="section-responses-summary" aria-label="Thông tin giảng viên">
        <div className="section-responses-heading">
          {onBack && (
            <button
              type="button"
              className="btn btn-secondary btn-sm section-responses-back"
              onClick={onBack}
              title="Quay lại danh sách giảng viên"
              aria-label="Quay lại danh sách giảng viên"
            >
              <ArrowLeft className="operation-icon" aria-hidden="true" />
            </button>
          )}
          <h2>{report.fullName}</h2>
          <p>
            {report.departmentName} · {report.facultyName}
          </p>
        </div>
        <div className="section-responses-stats">
          <span>{report.sectionCount} lớp · tổng sĩ số {totalClassSize.toLocaleString('vi-VN')}</span>
          <span>Điểm trung bình {report.averageScore.toFixed(2)}</span>
          <span>
            {report.totalResponseCount.toLocaleString('vi-VN')} phiếu thu ({overallRate.toFixed(1)}%)
          </span>
        </div>
      </section>

      <div className="analysis-section analysis-section--grow">
        <h4 className="analysis-section-title">Danh sách các lớp giảng dạy trong kỳ ({report.sections.length} lớp)</h4>
        <div
          className="statistics-table-scroll"
          tabIndex={0}
          aria-label="Các lớp giảng dạy trong kỳ"
        >
          <table className="statistics-table">
            <thead>
              <tr>
                <th scope="col">{filters.filterHeader('courseCode', 'Mã HP')}</th>
                <th scope="col">{filters.filterHeader('courseName', 'Học phần')}</th>
                <th scope="col">{filters.filterHeader('sectionName', 'Lớp')}</th>
                <th scope="col">{filters.filterHeader('classSize', 'Sĩ số')}</th>
                <th scope="col">{filters.filterHeader('responseCount', 'Số phiếu đã thu')}</th>
                <th scope="col">{filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}</th>
                <th scope="col" title="Số phiếu đã thu chia sĩ số">
                  {filters.filterHeader('responseRate', 'Tỷ lệ phản hồi')}
                </th>
                <th scope="col" title="Số phiếu hợp lệ chia số phiếu đã thu">
                  {filters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ')}
                </th>
                <th scope="col">{filters.filterHeader('averageScore', 'Điểm')}</th>
                <th scope="col" title="Trung bình mọi lớp cùng học phần, kể cả lớp người khác dạy">
                  {filters.filterHeader('courseAverageScore', 'Điểm trung bình học phần')}
                </th>
                <th scope="col">{filters.filterHeader('differenceFromCourse', 'Chênh so học phần')}</th>
                <th scope="col">{filters.filterHeader('zSchool', 'Z-Score so với toàn trường')}</th>
                <th scope="col">{filters.filterHeader('zFaculty', 'Z-Score so với khoa')}</th>
                <th scope="col">{filters.filterHeader('zDepartment', 'Z-Score so với bộ môn')}</th>
              </tr>
            </thead>
            <tbody>
              {filters.visibleRows.map((section) => {
                return (
                  <tr
                    key={section.courseSectionSurveyId}
                    className={onOpenSurvey ? 'analysis-drill-row' : undefined}
                    onClick={onOpenSurvey ? () => onOpenSurvey(section.courseSectionSurveyId) : undefined}
                  >
                    <td>
                      {onOpenSurvey ? (
                        <button
                          type="button"
                          className="analysis-drill-link operations-code"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenSurvey(section.courseSectionSurveyId);
                          }}
                          title={`Xem kết quả lớp ${section.courseCode} - ${section.sectionName}`}
                        >
                          {section.courseCode}
                        </button>
                      ) : (
                        <span className="operations-code">{section.courseCode}</span>
                      )}
                    </td>
                    <td title={section.courseName}>{section.courseName}</td>
                    <td>{section.sectionName}</td>
                    <td className="num">{section.classSize}</td>
                    <td className="num">{section.responseCount}</td>
                    <td className="num">{section.validResponseCount}</td>
                    <td className="num">{section.responseRate.toFixed(1)}%</td>
                    <td className="num">{section.validResponseRate.toFixed(1)}%</td>
                    <td className={zTierClass(section.zDepartment)}>
                      {section.averageScore.toFixed(2)}
                    </td>
                    <td className="num">
                      {section.courseAverageScore === null
                        ? '—'
                        : section.courseAverageScore.toFixed(2)}
                    </td>
                    <td className="num">
                      {section.differenceFromCourse === null ? (
                        '—'
                      ) : (
                        <span
                          className={
                            section.differenceFromCourse < 0
                              ? 'delta--down'
                              : section.differenceFromCourse > 0
                                ? 'delta--up'
                                : undefined
                          }
                        >
                          {section.differenceFromCourse > 0 ? '+' : ''}
                          {section.differenceFromCourse.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className={zTierClass(section.zSchool)}>
                      {section.zSchool === null
                        ? '—'
                        : `${section.zSchool > 0 ? '+' : ''}${section.zSchool.toFixed(2)}`}
                    </td>
                    <td className={zTierClass(section.zFaculty)}>
                      {section.zFaculty === null
                        ? '—'
                        : `${section.zFaculty > 0 ? '+' : ''}${section.zFaculty.toFixed(2)}`}
                    </td>
                    <td className={zTierClass(section.zDepartment)}>
                      {section.zDepartment === null
                        ? '—'
                        : `${section.zDepartment > 0 ? '+' : ''}${section.zDepartment.toFixed(2)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
