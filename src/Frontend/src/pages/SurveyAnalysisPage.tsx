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
import { ApiError } from '../services/apiClient';
import {
  courseDiagnosisLabels,
  normalizationVerdictLabels,
  surveyApi,
  surveyErrorMessage,
} from '../services/surveyApi';
import type {
  LecturerOption,
  LecturerReport,
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
  padding: 6px 10px; border: 1px solid #d7dee2; background: #fff; color: #20262c;
  font: inherit; font-size: 12px; text-align: left; cursor: pointer;
}
.campaign-select__trigger:disabled { background: #f4f6f8; color: #8c969f; cursor: not-allowed; }
.campaign-select__trigger:focus-visible { outline: 2px solid rgba(7,136,184,.25); border-color: #0788b8; }
.campaign-select__value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.campaign-select__caret { flex: 0 0 auto; width: 14px; height: 14px; color: #68737d; }
.campaign-select__list {
  position: fixed; z-index: 1000; margin: 0; padding: 4px 0; list-style: none;
  overflow-y: auto; border: 1px solid #d7dee2; background: #fff;
  box-shadow: 0 8px 24px rgba(15,30,45,.16);
}
.campaign-select__option {
  position: relative; overflow: hidden; container-type: inline-size;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 12px; font-size: 12px; color: #20262c; cursor: pointer;
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
.campaign-select__empty { padding: 10px 12px; color: #68737d; font-size: 12px; text-align: center; }
.campaign-select__hint {
  position: fixed; z-index: 1001; padding: 9px 12px; border: 1px solid #d7dee2;
  background: #fff; box-shadow: 0 8px 22px rgba(15,30,45,.2); color: #20262c;
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
 * - `unrestricted`: chỉ ADMIN / SURVEY_ADMIN. Mặt bằng toàn trường là bức tranh cả
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
    label: 'Mặt bằng toàn trường',
    hint: 'Điểm trung bình từng khoa/viện. Cột Z-Score so điểm TB khoa với trung bình toàn trường theo sai số chuẩn σ/√n, chia bậc 1σ · 2σ · 3σ.',
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

/** Bốn bậc của quy tắc 68-95-99.7, dùng chung cho mọi cột Nhận định. */
const zVerdictTiers = [
  { label: 'Rất bất thường', className: 'verdict verdict--severe', range: '|Z-Score| ≥ 3' },
  { label: 'Bất thường', className: 'verdict verdict--below', range: '|Z-Score| ≥ 2' },
  { label: 'Đáng chú ý', className: 'verdict verdict--watch', range: '|Z-Score| ≥ 1' },
  { label: 'Bình thường', className: 'verdict verdict--muted', range: '|Z-Score| < 1' },
];

/** Nhãn cho một giá trị Z bất kỳ. Xét từ bậc nặng nhất xuống. */
function zVerdict(value: number | null): { label: string; className: string } {
  if (value === null) return { label: '—', className: 'verdict verdict--muted' };

  const size = Math.abs(value);
  if (size >= zTiers.extreme) return zVerdictTiers[0];
  if (size >= zTiers.strong) return zVerdictTiers[1];
  if (size >= zTiers.notable) return zVerdictTiers[2];
  return zVerdictTiers[3];
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
 * trong cùng một hộp Chú thích, nên ở đây chỉ là phần ruột — không bọc nút.
 * Tab nào không có mục nào thì hộp chú thích chỉ còn dòng mô tả, vẫn có nút.
 */
const tabNotes: Partial<Record<TabId, React.ReactNode>> = {
  normalization: (
    <FormulaNotes
      notes={[
        'Độ lệch chuẩn = √( Tổng bình phương (Điểm từng lớp − Điểm TB khoa) ÷ (Số lớp − 1) )',
        'Z-Score = (Điểm TB khoa − Trung bình toàn trường)'
          + ' ÷ (Độ lệch chuẩn toàn trường ÷ √Số lớp)',
      ]}
    />
  ),
  normalizationSections: (
    <FormulaNotes
      notes={[
        'Z-Score toàn trường = (Điểm lớp − Trung bình toàn trường) ÷ Độ lệch chuẩn toàn trường',
        'Z-Score trong khoa = (Điểm lớp − Điểm TB khoa) ÷ Độ lệch chuẩn khoa',
        'Chênh lệch Z-Score = Z-Score trong khoa − Z-Score toàn trường',
      ]}
    />
  ),
  departments: (
    <FormulaNotes
      notes={[
        'Mỗi dòng gộp toàn bộ lớp của một bộ môn trong đợt khảo sát.',
        'Z-Score trong khoa = (Điểm TB bộ môn − Điểm TB khoa) ÷ Độ lệch chuẩn khoa.',
      ]}
    />
  ),
  courses: (
    <FormulaNotes
      notes={[
        'Bảng này so các lớp TRONG CÙNG một học phần với nhau.',
        'Chênh lệch giữa các lớp = Điểm lớp cao nhất − Điểm lớp thấp nhất.',
      ]}
    />
  ),
  lecturer: (
    <FormulaNotes
      notes={[
        'Z-Score = (Điểm lớp − Trung bình nhóm so) ÷ Độ lệch chuẩn nhóm so.'
          + ' Ba cột Z dùng ba nhóm: toàn trường, các lớp cùng khoa, các lớp cùng bộ môn.',
        'Chênh so học phần = Điểm lớp − Điểm TB học phần.'
          + ' Để trống khi học phần chỉ có đúng lớp này, không có ai để so.',
        'Cột Nhận xét xét theo Z-Score trong bộ môn — nhóm so sát nhất.',
      ]}
    />
  ),
};

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
    if (tab === 'normalization' || tab === 'normalizationSections') {
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
      if (tab === 'normalization' || tab === 'normalizationSections') {
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
  }, [semesterSurveyId, tab]);

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
  const tabNote = (
    <NoteModalButton title={`Chú thích · ${activeTab.label}`}>
      <div className="z-legend">
        <p className="z-legend__note">{activeTab.hint}</p>
        {tabNotes[tab]}
        {/* Ngưỡng quyết định lớp nào có mặt trong mọi con số của trang này, nên
            phải in ra chứ không để người xem đoán. Đổi ở trang Bảng dữ liệu. */}
        <p className="z-legend__note">
          Số liệu chỉ gộp lớp qua cả hai tiêu chí: tỷ lệ phản hồi ≥{' '}
          <strong>{thresholds.minimumResponseRate}%</strong> và tỷ lệ phiếu hợp lệ ≥{' '}
          <strong>{thresholds.minimumValidRate}%</strong>. Hai ngưỡng này đổi được ở
          trang Bảng dữ liệu khảo sát.
        </p>
      </div>
    </NoteModalButton>
  );

  const flipCount = useMemo(() => {
    if (!normalization) return 0;
    return normalization.sections.filter(
      (section) => section.verdict === 'CONCLUSION_FLIPS'
    ).length;
  }, [normalization]);

  const exportAnalysisOptions = useMemo(() => {
    const activeSurvey = semesterSurveys.find((s) => String(s.semesterSurveyId) === semesterSurveyId);
    const surveyTitle = activeSurvey?.surveyName || 'Khảo sát';

    if (tab === 'normalization' && normalization) {
      const anomalousSections = (normalization.sections || []).filter(
        (s) =>
          s.verdict === 'CONCLUSION_FLIPS' ||
          s.verdict === 'BELOW_FACULTY' ||
          Math.abs(s.zFaculty ?? 0) >= 2 ||
          Math.abs(s.zDifference ?? 0) >= 1.0
      );

      return {
        fileName: 'thong-ke-chi-tiet-mat-bang-toan-truong',
        metadata: {
          title: 'BÁO CÁO CHUẨN HÓA Z-SCORE THEO KHOA / VIỆN',
          subtitle: `Bộ câu hỏi: ${surveyTitle}`,
          subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
          info: {
            'Điểm trung bình toàn trường': normalization.schoolAverageScore.toFixed(2),
            'Độ lệch chuẩn toàn trường':
              normalization.schoolStandardDeviation !== null
                ? normalization.schoolStandardDeviation.toFixed(2)
                : '—',
            'Tổng số lớp khảo sát': normalization.schoolSectionCount,
            'Số lớp đổi kết luận sau chuẩn hóa': flipCount,
          },
          summaryNotes: [
            'Z-Score = (Điểm TB khoa - Điểm TB trường) / Sai số chuẩn.',
            'Mặt bằng khoa chuẩn hóa theo quy tắc thực nghiệm 68-95-99.7.',
          ],
        },
        sheets: [
          {
            sheetName: 'Mat bang Khoa - Vien',
            title: '1. MẶT BẰNG CHUẨN HÓA KHOA / VIỆN',
            columns: [
              { key: 'facultyName', header: 'Khoa / Viện', width: 28 },
              { key: 'sectionCount', header: 'Số lớp', width: 10, type: 'number' as const, align: 'right' as const },
              { key: 'averageScore', header: 'Điểm TB khoa', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'standardDeviation', header: 'Độ lệch chuẩn', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'meanZScore', header: 'Z-Score', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'verdict', header: 'Nhận định', width: 18, format: (_: any, item: any) => zVerdict(item.meanZScore).label },
            ],
            data: normalization.groups,
          },
          {
            sheetName: 'Lop doi ket luan',
            title: `2. DANH SÁCH LỚP ĐỔI KẾT LUẬN & BẤT THƯỜNG (${anomalousSections.length} LỚP)`,
            subtitle: 'Các lớp học phần có Z-Score lệch lớn hoặc bị đổi kết luận khi tính theo mặt bằng khoa',
            columns: [
              { key: 'sectionName', header: 'Lớp HP', width: 14, align: 'center' as const },
              { key: 'courseCode', header: 'Mã HP', width: 12, align: 'center' as const },
              { key: 'courseName', header: 'Tên học phần', width: 28 },
              { key: 'lecturerName', header: 'Giảng viên', width: 22 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
              { key: 'averageScore', header: 'Điểm TB', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'zSchool', header: 'Z Toàn trường', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'zFaculty', header: 'Z Khoa', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'zDifference', header: 'Chênh Z', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'verdict', header: 'Nhận định', width: 26, format: (v: any) => normalizationVerdictLabels[v] || String(v) },
            ],
            data: anomalousSections,
            summaryNotes: [
              'CONCLUSION_FLIPS: Điểm tuyệt đối đạt nhưng thấp hơn mặt bằng khoa, hoặc ngược lại.',
            ],
          },
          {
            sheetName: 'Toan bo lop chuan hoa',
            title: `3. TOÀN BỘ LỚP HỌC PHẦN ĐÃ CHUẨN HÓA (${normalization.sections.length} LỚP)`,
            columns: [
              { key: 'sectionName', header: 'Lớp HP', width: 14, align: 'center' as const },
              { key: 'courseCode', header: 'Mã HP', width: 12, align: 'center' as const },
              { key: 'courseName', header: 'Tên học phần', width: 28 },
              { key: 'lecturerName', header: 'Giảng viên', width: 22 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
              { key: 'averageScore', header: 'Điểm TB', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'zSchool', header: 'Z Toàn trường', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'zFaculty', header: 'Z Khoa', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'verdict', header: 'Nhận định', width: 26, format: (v: any) => normalizationVerdictLabels[v] || String(v) },
            ],
            data: normalization.sections,
          },
        ],
      };
    }

    if (tab === 'normalizationSections' && normalization) {
      const notableSections = (normalization.sections || []).filter(
        (s) =>
          (s.verdict !== 'NORMAL' && s.verdict !== 'FACULTY_TOO_SMALL') ||
          (s.zFaculty !== null && s.zFaculty <= -1.0) ||
          (s.averageScore !== null && s.averageScore < 3.5)
      );

      return {
        fileName: 'thong-ke-chi-tiet-phan-tich-theo-lop-hoc-phan',
        metadata: {
          title: 'BÁO CÁO PHÂN LOẠI & CHUẨN HÓA Z-SCORE LỚP HỌC PHẦN',
          subtitle: `Bộ câu hỏi: ${surveyTitle}`,
          subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
          info: {
            'Điểm trung bình toàn trường': normalization.schoolAverageScore.toFixed(2),
            'Độ lệch chuẩn toàn trường':
              normalization.schoolStandardDeviation !== null
                ? normalization.schoolStandardDeviation.toFixed(2)
                : '—',
            'Số lớp cần theo dõi': notableSections.length,
          },
        },
        sheets: [
          {
            sheetName: 'Lop can theo doi',
            title: `1. DANH SÁCH LỚP CẦN THEO DÕI & LƯU Ý (${notableSections.length} LỚP)`,
            subtitle: 'Các lớp có Z-Score lệch âm so với mặt bằng khoa hoặc điểm tuyệt đối dưới ngưỡng',
            columns: [
              { key: 'sectionName', header: 'Lớp HP', width: 14, align: 'center' as const },
              { key: 'courseCode', header: 'Mã HP', width: 12, align: 'center' as const },
              { key: 'courseName', header: 'Tên học phần', width: 28 },
              { key: 'lecturerName', header: 'Giảng viên', width: 22 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
              { key: 'averageScore', header: 'Điểm TB', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'zSchool', header: 'Z Toàn trường', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'zFaculty', header: 'Z Khoa', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'verdict', header: 'Nhận định', width: 26, format: (v: any) => normalizationVerdictLabels[v] || String(v) },
            ],
            data: notableSections,
          },
          {
            sheetName: 'Toan bo lop hoc phan',
            title: `2. TOÀN BỘ DANH SÁCH LỚP HỌC PHẦN (${normalization.sections.length} LỚP)`,
            columns: [
              { key: 'sectionName', header: 'Lớp HP', width: 14, align: 'center' as const },
              { key: 'courseCode', header: 'Mã HP', width: 12, align: 'center' as const },
              { key: 'courseName', header: 'Tên học phần', width: 28 },
              { key: 'lecturerName', header: 'Giảng viên', width: 22 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
              { key: 'averageScore', header: 'Điểm TB', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'zSchool', header: 'Z Toàn trường', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'zFaculty', header: 'Z Khoa', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'verdict', header: 'Nhận định', width: 26, format: (v: any) => normalizationVerdictLabels[v] || String(v) },
            ],
            data: normalization.sections,
          },
        ],
      };
    }

    if (tab === 'departments' && departments) {
      const allSections = normalization?.sections || [];
      const warningSections = allSections.filter(
        (s) =>
          s.verdict === 'BELOW_FACULTY' ||
          s.verdict === 'CONCLUSION_FLIPS' ||
          (s.zFaculty !== null && s.zFaculty <= -1.0) ||
          (s.averageScore !== null && s.averageScore < 3.5)
      );

      return {
        fileName: 'thong-ke-chi-tiet-tong-hop-theo-bo-mon',
        metadata: {
          title: 'BÁO CÁO TỔNG HỢP KẾT QUẢ KHẢO SÁT THEO BỘ MÔN',
          subtitle: `Bộ câu hỏi: ${surveyTitle}`,
          subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
          info: {
            'Tổng số bộ môn': departments.rows.length,
            'Tổng số lớp cảnh báo': warningSections.length,
          },
          summaryNotes: [
            'Lớp cảnh báo là các lớp có Z-score trong khoa ≤ -1.0 hoặc thuộc diện điểm thấp cần đơn vị rà soát.',
          ],
        },
        sheets: [
          {
            sheetName: 'Tong hop Bo mon',
            title: '1. TỔNG HỢP KẾT QUẢ THEO BỘ MÔN',
            columns: [
              { key: 'departmentName', header: 'Bộ môn', width: 24 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
              { key: 'sectionCount', header: 'Số lớp', width: 10, type: 'number' as const, align: 'right' as const },
              { key: 'lecturerCount', header: 'Số GV', width: 10, type: 'number' as const, align: 'right' as const },
              { key: 'totalClassSize', header: 'Tổng sĩ số', width: 12, type: 'number' as const, align: 'right' as const },
              { key: 'validResponseCount', header: 'Phiếu hợp lệ', width: 12, type: 'number' as const, align: 'right' as const },
              { key: 'validResponseRate', header: 'Tỷ lệ %', width: 10, type: 'string' as const, align: 'right' as const, format: (v: any) => `${Number(v).toFixed(1)}%` },
              { key: 'averageScore', header: 'Điểm TB', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'warningSectionCount', header: 'Lớp cảnh báo', width: 12, type: 'number' as const, align: 'right' as const },
            ],
            data: departments.rows,
          },
          {
            sheetName: 'Danh sach lop canh bao',
            title: `2. DANH SÁCH CHI TIẾT CÁC LỚP HỌC PHẦN CẢNH BÁO (${warningSections.length} LỚP)`,
            subtitle: 'Chi tiết từng lớp học phần cần lưu ý/giải trình (Z-score thấp hoặc đổi kết luận)',
            columns: [
              { key: 'sectionName', header: 'Lớp HP', width: 14, align: 'center' as const },
              { key: 'courseCode', header: 'Mã HP', width: 12, align: 'center' as const },
              { key: 'courseName', header: 'Tên học phần', width: 28 },
              { key: 'lecturerName', header: 'Giảng viên', width: 22 },
              { key: 'departmentName', header: 'Bộ môn', width: 20 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 20 },
              { key: 'averageScore', header: 'Điểm TB', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'zFaculty', header: 'Z Khoa', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'zSchool', header: 'Z Toàn trường', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'verdict', header: 'Lý do cảnh báo / Nhận định', width: 26, format: (v: any) => normalizationVerdictLabels[v] || String(v) },
            ],
            data: warningSections,
            summaryNotes: [
              'Đề nghị Ban chủ nhiệm Khoa và Bộ môn phối hợp với giảng viên phụ trách trao đổi, rà soát nguyên nhân.',
            ],
          },
          {
            sheetName: 'Toan bo lop hoc phan',
            title: `3. TOÀN BỘ LỚP HỌC PHẦN CỦA CÁC BỘ MÔN (${allSections.length} LỚP)`,
            columns: [
              { key: 'sectionName', header: 'Lớp HP', width: 14, align: 'center' as const },
              { key: 'courseCode', header: 'Mã HP', width: 12, align: 'center' as const },
              { key: 'courseName', header: 'Tên học phần', width: 28 },
              { key: 'lecturerName', header: 'Giảng viên', width: 22 },
              { key: 'departmentName', header: 'Bộ môn', width: 20 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 20 },
              { key: 'averageScore', header: 'Điểm TB', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'zFaculty', header: 'Z Khoa', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'verdict', header: 'Nhận định', width: 24, format: (v: any) => normalizationVerdictLabels[v] || String(v) },
            ],
            data: allSections,
          },
        ],
      };
    }

    if (tab === 'courses' && courses) {
      const issueCourses = (courses.rows || []).filter(
        (c) =>
          c.verdict === 'COURSE_ISSUE' ||
          c.verdict === 'LECTURER_VARIANCE' ||
          c.spread >= 0.8
      );
      const issueCourseCodes = new Set(issueCourses.map((c) => c.courseCode));
      const issueSections = (normalization?.sections || []).filter((s) =>
        issueCourseCodes.has(s.courseCode)
      );

      return {
        fileName: 'thong-ke-chi-tiet-chan-doan-hoc-phan',
        metadata: {
          title: 'BÁO CÁO CHẨN ĐOÁN CHẤT LƯỢNG HỌC PHẦN',
          subtitle: `Bộ câu hỏi: ${surveyTitle}`,
          subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
          info: {
            'Tổng số học phần': courses.rows.length,
            'Số học phần cần can thiệp': issueCourses.length,
          },
        },
        sheets: [
          {
            sheetName: 'Chan doan Hoc phan',
            title: '1. TỔNG HỢP CHẨN ĐOÁN CHẤT LƯỢNG HỌC PHẦN',
            columns: [
              { key: 'courseCode', header: 'Mã HP', width: 12, align: 'center' as const },
              { key: 'courseName', header: 'Tên học phần', width: 28 },
              { key: 'departmentName', header: 'Bộ môn', width: 20 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 20 },
              { key: 'sectionCount', header: 'Số lớp', width: 10, type: 'number' as const, align: 'right' as const },
              { key: 'lecturerCount', header: 'Số GV', width: 10, type: 'number' as const, align: 'right' as const },
              { key: 'averageScore', header: 'Điểm TB', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'minScore', header: 'Min', width: 10, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'maxScore', header: 'Max', width: 10, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'spread', header: 'Biên độ', width: 10, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'verdict', header: 'Chẩn đoán', width: 22, format: (v: any) => courseDiagnosisLabels[v as keyof typeof courseDiagnosisLabels] || String(v) },
            ],
            data: courses.rows,
          },
          {
            sheetName: 'Hoc phan can can thiep',
            title: `2. DANH SÁCH HỌC PHẦN CẦN CAN THIỆP (${issueCourses.length} HỌC PHẦN)`,
            subtitle: 'Các học phần có lỗi đề cương/tài liệu chung (COURSE_ISSUE) hoặc chênh lệch lớn giữa các GV (LECTURER_VARIANCE)',
            columns: [
              { key: 'courseCode', header: 'Mã HP', width: 12, align: 'center' as const },
              { key: 'courseName', header: 'Tên học phần', width: 28 },
              { key: 'departmentName', header: 'Bộ môn', width: 20 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 20 },
              { key: 'sectionCount', header: 'Số lớp', width: 10, type: 'number' as const, align: 'right' as const },
              { key: 'averageScore', header: 'Điểm TB', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'spread', header: 'Biên độ', width: 10, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'weakestQuestionText', header: 'Tiêu chí yếu nhất', width: 30, format: (_: any, item: any) => item.weakestQuestionText ? `${item.weakestQuestionText} (${item.weakestQuestionScore?.toFixed(2)})` : '—' },
              { key: 'verdict', header: 'Kết luận chẩn đoán', width: 22, format: (v: any) => courseDiagnosisLabels[v as keyof typeof courseDiagnosisLabels] || String(v) },
            ],
            data: issueCourses,
          },
          {
            sheetName: 'Chi tiet lop hoc phan',
            title: `3. CHI TIẾT CÁC LỚP THUỘC HỌC PHẦN CẦN CAN THIỆP (${issueSections.length} LỚP)`,
            columns: [
              { key: 'courseCode', header: 'Mã HP', width: 12, align: 'center' as const },
              { key: 'courseName', header: 'Tên học phần', width: 28 },
              { key: 'sectionName', header: 'Lớp HP', width: 14, align: 'center' as const },
              { key: 'lecturerName', header: 'Giảng viên', width: 22 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 20 },
              { key: 'averageScore', header: 'Điểm TB lớp', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'zFaculty', header: 'Z Khoa', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
              { key: 'verdict', header: 'Nhận định', width: 24, format: (v: any) => normalizationVerdictLabels[v] || String(v) },
            ],
            data: issueSections,
          },
        ],
      };
    }

    if (tab === 'lecturer' && lecturers.length > 0) {
      return {
        fileName: 'thong-ke-chi-tiet-danh-sach-giang-vien-khao-sat',
        metadata: {
          title: 'BÁO CÁO DANH SÁCH GIẢNG VIÊN ĐƯỢC KHẢO SÁT',
          subtitle: `Bộ câu hỏi: ${surveyTitle}`,
          subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
          info: {
            'Tổng số giảng viên': lecturers.length,
          },
        },
        sheets: [
          {
            sheetName: 'Danh sach Giang vien',
            title: '1. DANH SÁCH GIẢNG VIÊN TRONG ĐỢT KHẢO SÁT',
            columns: [
              { key: 'lecturerCode', header: 'Mã GV', width: 14, align: 'center' as const },
              { key: 'fullName', header: 'Họ và tên giảng viên', width: 26 },
              { key: 'departmentName', header: 'Bộ môn', width: 22 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
              { key: 'sectionCount', header: 'Số lớp dạy', width: 12, type: 'number' as const, align: 'right' as const },
            ],
            data: lecturers,
          },
          {
            sheetName: 'Toan bo lop hoc phan',
            title: `2. TOÀN BỘ DANH SÁCH LỚP HỌC PHẦN (${(normalization?.sections || []).length} LỚP)`,
            columns: [
              { key: 'sectionName', header: 'Lớp HP', width: 14, align: 'center' as const },
              { key: 'courseName', header: 'Tên học phần', width: 28 },
              { key: 'lecturerName', header: 'Giảng viên', width: 22 },
              { key: 'departmentName', header: 'Bộ môn', width: 20 },
              { key: 'facultyName', header: 'Khoa / Viện', width: 20 },
              { key: 'averageScore', header: 'Điểm TB', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
              { key: 'zFaculty', header: 'Z Khoa', width: 12, type: 'number' as const, align: 'right' as const, format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—') },
            ],
            data: normalization?.sections || [],
          },
        ],
      };
    }

    return null;
  }, [tab, normalization, departments, courses, lecturers, semesterSurveys, semesterSurveyId, flipCount]);

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
          {exportAnalysisOptions && (
            <ExportDropdown options={exportAnalysisOptions} buttonLabel="Xuất báo cáo phân tích" size="sm" />
          )}
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
        </div>
      </div>

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
          onOpenDetail={openScopeDetail}
        />
      ) : tab === 'normalizationSections' ? (
        <NormalizationSectionTab
          data={normalization}
          note={tabNote}
          onOpenSurvey={(courseSectionSurveyId) => {
            window.location.hash = `/reports/surveys/${courseSectionSurveyId}`
              + `?semester=${semesterId}&campaign=${semesterSurveyId}`;
          }}
        />
      ) : tab === 'departments' ? (
        <DepartmentTab
          data={departments}
          note={tabNote}
          onOpenDetail={openScopeDetail}
        />
      ) : tab === 'courses' ? (
        <CourseDiagnosisTab
          data={courses}
          note={tabNote}
          onOpenDetail={openScopeDetail}
        />
      ) : (
        <LecturerTab
          semesterSurveyId={semesterSurveyId ? Number(semesterSurveyId) : null}
          lecturers={lecturers}
          note={tabNote}
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
}> = ({ data, onOpenDetail, note }) => {
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
  ], []);
  const groupFilters = useColumnFilters(groups, groupColumns);
  const groupPagination = usePaginatedItems(groupFilters.visibleRows, analysisPageSize);

  if (!data || data.sections.length === 0) {
    return emptyWithNote(note, 'Đợt này chưa có lớp nào thu được phiếu hợp lệ.');
  }

  return (
    <>
      <NormalizationSummary data={data} note={note} />

      <div className="analysis-group-table">
        <table className="statistics-table">
          <thead>
            {/* Bảng này không có cột ghim nên bề rộng để theo phần trăm được. */}
            <tr>
              <th scope="col" style={{ width: '34%' }}>
                {groupFilters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th scope="col" style={{ width: '12%' }}>
                {groupFilters.filterHeader('sectionCount', 'Số lớp')}
              </th>
              <th scope="col" style={{ width: '18%' }}>
                {groupFilters.filterHeader('averageScore', 'Điểm TB khoa')}
              </th>
              <th scope="col" style={{ width: '18%' }}>
                {groupFilters.filterHeader('standardDeviation', 'Độ lệch chuẩn')}
              </th>
              <th
                scope="col"
                style={{ width: '18%' }}
                title="Điểm TB khoa lệch trung bình toàn trường bao nhiêu lần sai số chuẩn σ/√n"
              >
                {groupFilters.filterHeader('meanZScore', 'Z-Score so toàn trường')}
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
                  <td>
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

const NormalizationSectionTab: React.FC<{
  data: SemesterSurveyNormalization | null;
  onOpenSurvey: (courseSectionSurveyId: number) => void;
  note?: React.ReactNode;
}> = ({ data, onOpenSurvey, note }) => {
  const sections = useMemo(() => data?.sections ?? [], [data]);
  const sectionColumns = useMemo<FilterableColumn<(typeof sections)[number]>[]>(() => [
    { key: 'courseCode', value: (row) => row.courseCode },
    { key: 'sectionName', value: (row) => row.sectionName },
    { key: 'courseName', value: (row) => row.courseName },
    { key: 'lecturerName', value: (row) => row.lecturerName },
    { key: 'departmentName', value: (row) => row.departmentName },
    { key: 'facultyName', value: (row) => row.facultyName },
    { key: 'classSize', value: (row) => String(row.classSize), numeric: true },
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
    {
      key: 'zDifference',
      value: (row) => (row.zDifference === null ? '—' : row.zDifference.toFixed(2)),
      sortValue: (row) => row.zDifference,
    },
  ], []);
  const sectionFilters = useColumnFilters(sections, sectionColumns);
  const sectionPagination = usePaginatedItems(sectionFilters.visibleRows, analysisPageSize);

  if (!data || data.sections.length === 0) {
    return emptyWithNote(note, 'Đợt này chưa có lớp nào thu được phiếu hợp lệ.');
  }

  return (
    <>
      <NormalizationSummary data={data} showStandardDeviation note={note} />

      <div className="statistics-table-scroll" tabIndex={0} aria-label="Chi tiết chuẩn hoá từng lớp">
        <table className="statistics-table">
          <thead>
            <tr>
              <th className="col-left col-left-1" scope="col">
                {sectionFilters.filterHeader('courseCode', 'Mã HP')}
              </th>
              <th className="col-left col-left-2" scope="col">
                {sectionFilters.filterHeader('sectionName', 'Lớp')}
              </th>
              <th className="col-left col-left-3" scope="col">
                {sectionFilters.filterHeader('courseName', 'Học phần')}
              </th>
              {/* Ba cột đầu bị ghim nên bề rộng phải giữ pixel — giá trị `left` của
                  cột sau cộng dồn từ chúng. Các cột còn lại để theo phần trăm. */}
              <th scope="col" style={{ width: '13%' }}>
                {sectionFilters.filterHeader('lecturerName', 'Giảng viên')}
              </th>
              <th scope="col" style={{ width: '11%' }}>
                {sectionFilters.filterHeader('departmentName', 'Bộ môn')}
              </th>
              <th scope="col" style={{ width: '11%' }}>
                {sectionFilters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {sectionFilters.filterHeader('classSize', 'Sĩ số')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {sectionFilters.filterHeader('averageScore', 'Điểm')}
              </th>
              <th scope="col" style={{ width: '10%' }}>
                {sectionFilters.filterHeader('zSchool', 'Z-Score toàn trường')}
              </th>
              <th scope="col" style={{ width: '10%' }}>
                {sectionFilters.filterHeader('zFaculty', 'Z-Score trong khoa')}
              </th>
              <th scope="col" style={{ width: '9%' }}>
                {sectionFilters.filterHeader('zDifference', 'Chênh lệch Z-Score')}
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
                <td className="col-left col-left-1">
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
                <td className="col-left col-left-2">{section.sectionName}</td>
                <td className="col-left col-left-3" title={section.courseName}>
                  {section.courseName}
                </td>
                <td>{section.lecturerName}</td>
                <td>{section.departmentName}</td>
                <td>{section.facultyName}</td>
                <td className="num">{section.classSize}</td>
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
                <td className="num">
                  {section.zDifference === null
                    ? '—'
                    : `${section.zDifference > 0 ? '+' : ''}${section.zDifference.toFixed(2)}`}
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
}> = ({ data, onOpenDetail, note }) => {
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
      key: 'validResponseRate',
      value: (row) => `${row.validResponseRate.toFixed(1)}%`,
      sortValue: (row) => row.validResponseRate,
    },
    {
      key: 'averageScore',
      value: (row) => (row.averageScore === null ? '—' : row.averageScore.toFixed(2)),
      sortValue: (row) => row.averageScore,
    },
    { key: 'warningSectionCount', value: (row) => String(row.warningSectionCount), numeric: true },
  ], []);
  const filters = useColumnFilters(rows, columns);
  const pagination = usePaginatedItems(filters.visibleRows, analysisPageSize);

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
  // nên hai số này là của bộ môn đó, khác các số toàn trường ở trên.
  const totalClassSize = rows.reduce((sum, row) => sum + row.totalClassSize, 0);
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
        <table className="statistics-table statistics-table--fill">
          <thead>
            <tr>
              <th className="col-left col-dept-1" scope="col">
                {filters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th className="col-left col-dept-2" scope="col">
                {filters.filterHeader('departmentName', 'Bộ môn')}
              </th>
              <th scope="col">{filters.filterHeader('sectionCount', 'Số lớp')}</th>
              <th scope="col">{filters.filterHeader('lecturerCount', 'Số GV')}</th>
              <th scope="col">{filters.filterHeader('totalClassSize', 'Tổng sĩ số')}</th>
              <th scope="col">{filters.filterHeader('responseCount', 'Số phiếu thu về')}</th>
              <th scope="col">{filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}</th>
              <th scope="col" title="Số phiếu hợp lệ chia tổng sĩ số">
                {filters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ')}
              </th>
              <th scope="col">{filters.filterHeader('averageScore', 'Điểm trung bình')}</th>
              <th
                scope="col"
                title="Lớp có điểm thấp hơn trung bình toàn trường từ 1 độ lệch chuẩn trở lên"
              >
                {filters.filterHeader('warningSectionCount', 'Lớp cảnh báo')}
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
                <td className="col-left col-dept-1" title={row.facultyName}>
                  {row.facultyName}
                </td>
                <td className="col-left col-dept-2" title={row.departmentName}>
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
                <td className="num">{row.validResponseRate.toFixed(1)}%</td>
                <td className={scoreClass(row.averageScore)}>
                  {row.averageScore === null ? '—' : row.averageScore.toFixed(2)}
                </td>
                <td className={row.warningSectionCount > 0 ? 'num is-flagged' : 'num'}>
                  {row.warningSectionCount}
                </td>
              </tr>
            ))}
            {/* Ô đệm nuốt chỗ thừa để dòng tổng kết luôn nằm sát đáy khung. */}
            <tr className="table-spacer" aria-hidden="true">
              <td colSpan={10} />
            </tr>
          </tbody>

          <tfoot>
            <tr>
              <th className="col-left col-dept-1" scope="row">Toàn trường</th>
              <td className="col-left col-dept-2">{data.schoolDepartmentCount} bộ môn</td>
              <td className="num is-sum">{totalSections}</td>
              <td />
              <td className="num is-sum">{totalClassSize}</td>
              <td className="num is-sum">{totalResponses}</td>
              <td className="num is-sum">{totalValidResponses}</td>
              <td className="num is-mean">
                {totalClassSize === 0
                  ? '—'
                  : `${((totalValidResponses / totalClassSize) * 100).toFixed(1)}%`}
              </td>
              <td className="num is-mean is-total">
                {overallScore === null ? '—' : overallScore.toFixed(2)}
              </td>
              <td className="num is-sum">{totalWarnings}</td>
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
}> = ({ data, onOpenDetail, note }) => {
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo<FilterableColumn<(typeof rows)[number]>[]>(() => [
    { key: 'courseCode', value: (row) => row.courseCode },
    { key: 'courseName', value: (row) => row.courseName },
    { key: 'departmentName', value: (row) => row.departmentName },
    { key: 'facultyName', value: (row) => row.facultyName },
    { key: 'sectionCount', value: (row) => String(row.sectionCount), numeric: true },
    { key: 'lecturerCount', value: (row) => String(row.lecturerCount), numeric: true },
    { key: 'averageScore', value: (row) => row.averageScore.toFixed(2), numeric: true },
    { key: 'minScore', value: (row) => row.minScore.toFixed(2), numeric: true },
    { key: 'maxScore', value: (row) => row.maxScore.toFixed(2), numeric: true },
    { key: 'spread', value: (row) => row.spread.toFixed(2), numeric: true },
    {
      key: 'weakestQuestionOrder',
      value: (row) => (row.weakestQuestionOrder === null ? '—' : `C${row.weakestQuestionOrder}`),
      sortValue: (row) => row.weakestQuestionOrder,
    },
    {
      key: 'weakestQuestionScore',
      value: (row) => (row.weakestQuestionScore === null ? '—' : row.weakestQuestionScore.toFixed(2)),
      sortValue: (row) => row.weakestQuestionScore,
    },
  ], []);
  const filters = useColumnFilters(rows, columns);
  const pagination = usePaginatedItems(filters.visibleRows, analysisPageSize);

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
        <table className="statistics-table">
          <thead>
            <tr>
              <th className="col-left col-course-1" scope="col">
                {filters.filterHeader('courseCode', 'Mã HP')}
              </th>
              <th className="col-left col-course-2" scope="col">
                {filters.filterHeader('courseName', 'Học phần')}
              </th>
              {/* Hai cột đầu bị ghim nên giữ pixel; phần còn lại theo phần trăm. */}
              <th scope="col" style={{ width: '11%' }}>
                {filters.filterHeader('departmentName', 'Bộ môn')}
              </th>
              <th scope="col" style={{ width: '11%' }}>
                {filters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('sectionCount', 'Số lớp')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('lecturerCount', 'Số GV')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {filters.filterHeader('averageScore', 'Điểm TB')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {filters.filterHeader('minScore', 'Lớp thấp nhất')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {filters.filterHeader('maxScore', 'Lớp cao nhất')}
              </th>
              <th scope="col" style={{ width: '8%' }} title="Điểm lớp cao nhất trừ điểm lớp thấp nhất">
                {filters.filterHeader('spread', 'Chênh lệch giữa các lớp')}
              </th>
              <th scope="col" style={{ width: '8%' }}>
                {filters.filterHeader('weakestQuestionOrder', 'Câu hỏi yếu nhất')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {filters.filterHeader('weakestQuestionScore', 'Điểm câu yếu')}
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
                <td className="col-left col-course-1">
                  <span className="operations-code">{row.courseCode}</span>
                </td>
                <td className="col-left col-course-2" title={row.courseName}>
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
                <td>{row.departmentName}</td>
                <td>{row.facultyName}</td>
                <td className="num">{row.sectionCount}</td>
                <td className="num">{row.lecturerCount}</td>
                <td className={scoreClass(row.averageScore)}>{row.averageScore.toFixed(2)}</td>
                <td className={scoreClass(row.minScore)}>{row.minScore.toFixed(2)}</td>
                <td className={scoreClass(row.maxScore)}>{row.maxScore.toFixed(2)}</td>
                <td className={spreadClass(row.spread)}>{row.spread.toFixed(2)}</td>
                <td title={row.weakestQuestionText ?? undefined}>
                  {row.weakestQuestionOrder === null ? '—' : `C${row.weakestQuestionOrder}`}
                </td>
                <td className="num">
                  {row.weakestQuestionScore === null ? '—' : row.weakestQuestionScore.toFixed(2)}
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
}> = ({
  semesterSurveyId,
  lecturers,
  selectedLecturerId,
  onSelectLecturer,
  onOpenSurvey,
  note,
}) => {
  const [report, setReport] = useState<LecturerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    { key: 'warningSectionCount', value: (row) => String(row.warningSectionCount), numeric: true },
  ], []);

  const filters = useColumnFilters(lecturers, columns);
  const pagination = usePaginatedItems(filters.visibleRows, analysisPageSize);

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
          />
        ) : null}
      </div>
    );
  }

  return (
    <>
      <section className="statistics-summary">
        <span>
          <strong>{lecturers.length}</strong> giảng viên thu được phiếu · <strong>{totalSections}</strong> lớp giảng dạy
        </span>
        <span>
          Tổng sĩ số: <strong>{totalClassSize.toLocaleString('vi-VN')}</strong> ·{' '}
          Phiếu hợp lệ: <strong>{totalValidResponses.toLocaleString('vi-VN')}</strong> (
          {totalClassSize === 0 ? 0 : ((totalValidResponses / totalClassSize) * 100).toFixed(1)}%)
        </span>
        <span>
          Điểm trung bình chung:{' '}
          <strong>{overallAvgScore !== null ? overallAvgScore.toFixed(2) : '—'}</strong>
        </span>
        {lecturersWithWarning > 0 && (
          <span className="statistics-trap-note">
            <strong>{lecturersWithWarning} giảng viên</strong> có lớp thuộc diện cảnh báo ({totalWarnings} lớp Z-Score ≤ −1)
          </span>
        )}
        {note}
      </section>

      <div className="statistics-table-scroll" tabIndex={0} aria-label="Tổng hợp kết quả đánh giá theo giảng viên">
        <table className="statistics-table statistics-table--fill">
          <thead>
            <tr>
              <th className="col-left col-dept-1" scope="col">
                {filters.filterHeader('fullName', 'Giảng viên')}
              </th>
              <th scope="col">{filters.filterHeader('departmentName', 'Bộ môn')}</th>
              <th scope="col">{filters.filterHeader('facultyName', 'Khoa / Viện')}</th>
              <th scope="col">{filters.filterHeader('sectionCount', 'Số lớp')}</th>
              <th scope="col">{filters.filterHeader('totalClassSize', 'Tổng sĩ số')}</th>
              <th scope="col">{filters.filterHeader('responseCount', 'Số phiếu thu')}</th>
              <th scope="col">{filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}</th>
              <th scope="col" title="Số phiếu hợp lệ chia tổng sĩ số">
                {filters.filterHeader('validResponseRate', 'Tỷ lệ hợp lệ')}
              </th>
              <th scope="col">{filters.filterHeader('averageScore', 'Điểm TB')}</th>
              <th scope="col">{filters.filterHeader('minScore', 'Lớp thấp nhất')}</th>
              <th scope="col">{filters.filterHeader('maxScore', 'Lớp cao nhất')}</th>
              <th
                scope="col"
                title="Số lớp có điểm thấp hơn trung bình từ 1 độ lệch chuẩn trở lên (Z-Score ≤ -1)"
              >
                {filters.filterHeader('warningSectionCount', 'Lớp cảnh báo')}
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
                <td className="col-left col-dept-1" title={row.fullName}>
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
                <td title={row.departmentName}>{row.departmentName}</td>
                <td title={row.facultyName}>{row.facultyName}</td>
                <td className="num">{row.sectionCount}</td>
                <td className="num">{row.totalClassSize}</td>
                <td className="num">{row.responseCount}</td>
                <td className="num">{row.validResponseCount}</td>
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
                <td className={row.warningSectionCount > 0 ? 'num is-flagged' : 'num'}>
                  {row.warningSectionCount}
                </td>
              </tr>
            ))}
            <tr className="table-spacer" aria-hidden="true">
              <td colSpan={12} />
            </tr>
          </tbody>

          <tfoot>
            <tr>
              <th className="col-left col-dept-1" scope="row">Toàn trường</th>
              <td colSpan={2}>{lecturers.length} giảng viên</td>
              <td className="num is-sum">{totalSections}</td>
              <td className="num is-sum">{totalClassSize}</td>
              <td className="num is-sum">{totalResponses}</td>
              <td className="num is-sum">{totalValidResponses}</td>
              <td className="num is-mean">
                {totalClassSize === 0
                  ? '—'
                  : `${((totalValidResponses / totalClassSize) * 100).toFixed(1)}%`}
              </td>
              <td className="num is-mean is-total">
                {overallAvgScore === null ? '—' : overallAvgScore.toFixed(2)}
              </td>
              <td />
              <td />
              <td className="num is-sum">{totalWarnings}</td>
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
}> = ({ report, onBack, onOpenSurvey }) => {
  const columns = useMemo<FilterableColumn<LecturerReport['sections'][number]>[]>(() => [
    { key: 'courseCode', value: (row) => row.courseCode },
    { key: 'courseName', value: (row) => row.courseName },
    { key: 'sectionName', value: (row) => row.sectionName },
    { key: 'classSize', value: (row) => String(row.classSize), numeric: true },
    { key: 'responseCount', value: (row) => String(row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (row) => String(row.validResponseCount), numeric: true },
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
                <th scope="col">{filters.filterHeader('responseCount', 'Số phiếu thu về')}</th>
                <th scope="col">{filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}</th>
                <th scope="col" title="Số phiếu hợp lệ chia sĩ số">
                  {filters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ')}
                </th>
                <th scope="col">{filters.filterHeader('averageScore', 'Điểm')}</th>
                <th scope="col" title="Trung bình mọi lớp cùng học phần, kể cả lớp người khác dạy">
                  {filters.filterHeader('courseAverageScore', 'Điểm TB học phần')}
                </th>
                <th scope="col">{filters.filterHeader('differenceFromCourse', 'Chênh so học phần')}</th>
                <th scope="col">{filters.filterHeader('zSchool', 'Z-Score toàn trường')}</th>
                <th scope="col">{filters.filterHeader('zFaculty', 'Z-Score trong khoa')}</th>
                <th scope="col">{filters.filterHeader('zDepartment', 'Z-Score trong bộ môn')}</th>
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
