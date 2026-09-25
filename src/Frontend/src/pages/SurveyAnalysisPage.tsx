import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
} from 'lucide-react';
import { useAuth } from '../auth/authContext';
import { canAccessTab, TAB_PERMISSION } from '../auth/modulePermissions';
import {
  formatDecimal,
  formatDecimalOrDash,
  formatPercent,
  formatSigned,
} from '../utils/formatNumber';
import { useSemester } from '../context/semesterContext';
import { useSetBreadcrumbTrail } from '../context/breadcrumbTrail';
import { TablePagination } from '../components/TablePagination';
import { usePaginatedItems } from '../hooks/usePaginatedItems';
import { useColumnFilters, type FilterableColumn } from '../hooks/useColumnFilters';
import { NoteModalButton } from '../components/NoteModalButton';
import { Formula, FormulaDefs, FormulaTable, TeX } from '../components/FormulaBlock';
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
import { useSemesterSurveys } from '../hooks/useSemesterSurveys';
import '../styles/survey-operations.css';
import '../styles/survey-statistics.css';
import '../styles/reports.css';
import '../styles/catalogs.css';
import {
  campaignPlaceholder,
  getActiveSemesterSurveyId,
  selectAvailableSemesterSurveyId,
  setActiveSemesterSurveyId,
} from '../utils/surveySelection';

/*
  Ô chọn đợt khảo sát, viết riêng cho trang này.

  Không dùng <select> vì danh sách xổ xuống do trình duyệt vẽ, luôn giãn theo tên
  đợt dài nhất và tràn ra ngoài ô. Ở đây danh sách tự vẽ nên bám đúng bề rộng ô.

  Kiểu dáng nhúng thẳng trong tệp: trang được nạp lười, phụ thuộc vào tệp .css
  bên ngoài thì lần đầu vào trang ô chọn bung ra không còn hình hài gì.
*/
const campaignSelectCss = `
/* Co lại được: cố định 460px thì khi phóng to trình duyệt, thanh công cụ hết chỗ
   và nút Cập nhật điểm bị đẩy xuống dòng thứ hai. */
.campaign-select { position: relative; flex: 0 1 380px; min-width: 200px; }
.campaign-select__trigger {
  width: 100%; min-height: 34px; display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border: 1px solid var(--field-border); background: #fff; color: #000000;
  font: inherit; font-size: 13px; text-align: left; cursor: pointer;
}
.campaign-select__trigger:disabled { background: #f4f6f8; color: #8c969f; cursor: not-allowed; }
.campaign-select__trigger:focus-visible { outline: 2px solid rgba(7,136,184,.25); border-color: #0788b8; }
.campaign-select__value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.campaign-select__caret { flex: 0 0 auto; width: 14px; height: 14px; color: #000000; }
.campaign-select__list {
  position: fixed; z-index: 1000; margin: 0; padding: 4px 0; list-style: none;
  overflow-y: auto; border: 1px solid var(--field-border); background: #fff;
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
  position: fixed; z-index: 1001; padding: 9px 12px; border: 1px solid var(--field-border);
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
 * Tab nào hiện do quyền tab quyết định (trang Phân quyền Module, xem TAB_PERMISSION).
 * Mặc định vẫn như trước: Phân tích theo khoa/viện chỉ cho vai trò thấy toàn trường,
 * hai tab bộ môn / học phần từ trưởng bộ môn trở lên, hai tab cuối cho mọi vai trò.
 *
 * Ẩn nút không phải là khoá — backend từ chối hai endpoint của tab bộ môn / học phần
 * khi người gọi là giảng viên, dù quản trị có bật tab đó.
 */
const tabs: { id: TabId; label: string; hint: string }[] = [
  {
    id: 'normalization',
    label: 'Phân tích theo khoa/viện',
    hint: 'Điểm trung bình từng khoa/viện. Cột Z-Score so điểm trung bình khoa với trung bình toàn trường theo sai số chuẩn σ/√n, chia bậc 1σ · 2σ · 3σ.',
  },
  {
    id: 'departments',
    label: 'Phân tích theo bộ môn',
    hint: 'Phục vụ trưởng khoa: mỗi dòng là một bộ môn trong đợt khảo sát.',
  },
  {
    id: 'courses',
    label: 'Phân tích theo học phần',
    hint: 'So các lớp trong cùng một học phần để biết vấn đề nằm ở học phần hay ở giảng viên.',
  },
  {
    id: 'normalizationSections',
    label: 'Phân tích theo lớp học phần',
    hint: 'So điểm thô giữa các lớp khác khoa là so sai. Z-score đưa mọi lớp về cùng một thước.',
  },
  {
    id: 'lecturer',
    label: 'Báo cáo giảng viên',
    hint: 'Tổng hợp kết quả đánh giá theo từng giảng viên trong đợt khảo sát. Bấm vào giảng viên để xem chi tiết các lớp giảng dạy.',
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

/**
 * Giảng viên chỉ dạy MỘT lớp thì ba cột điểm cuối của bảng Báo cáo giảng viên không
 * so được với cái gì: điểm trung bình, lớp thấp nhất và lớp cao nhất đều là số của
 * đúng lớp đó. Trả null để cả ba cột in "—".
 */
function comparableScore(sectionCount: number, score: number | null | undefined): number | null {
  return sectionCount > 1 && typeof score === 'number' ? score : null;
}

/** Điểm in ra bảng: hai chữ số, không có số thì "—". */
function scoreText(score: number | null): string {
  return formatDecimalOrDash(score, 3);
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

/**
 * Một mục trong hộp Chú thích.
 *
 * `display` là bản dựng bằng JSX để công thức có phân số, dấu căn, chỉ số dưới; `plain`
 * là bản chữ một dòng in vào ghi chú của tệp xuất — tệp .xlsx/.docx/.pdf không xếp
 * được phân số nên phải có bản chữ, và cả hai cùng nằm một chỗ để sửa là sửa cả hai.
 */
interface FormulaNote {
  title?: string;
  display: ReactNode;
  plain: string[];
}

/**
 * Công thức và bốn bậc của cột Nhận định, đọc trong hộp thoại chú thích.
 *
 * Mỗi mục là một khối riêng: tiêu đề đánh số, công thức đứng giữa một dải nền, rồi
 * bảng ký hiệu. Trước đây ba phần này là anh em ruột trong một dải flex nằm ngang
 * nên chúng xếp cạnh nhau, đọc không ra đâu là công thức của mục nào.
 */
const FormulaNotes: React.FC<{ notes: FormulaNote[] }> = ({ notes }) => (
  <>
    {notes.map((note) => (
      <section className="formula-note" key={note.plain[0] ?? note.title}>
        {note.title && <h4 className="formula-note__title">{note.title}</h4>}
        {note.display}
      </section>
    ))}
  </>
);

/**
 * Công thức tính riêng của từng tab. Trang cha ghép chúng vào sau dòng mô tả tab
 * trong cùng một hộp Chú thích, và in bản chữ của chúng vào ghi chú của tệp xuất.
 */
const tabFormulaNotes: Partial<Record<TabId, FormulaNote[]>> = {
  normalization: [
    {
      title: '1. Độ lệch chuẩn',
      display: (
        <>
          <Formula tex={String.raw`\sigma = \sqrt{\dfrac{\displaystyle\sum_{i=1}^{n}\left(x_i - \bar{x}\right)^2}{n - 1}}`} />
          <FormulaDefs
            items={[
              { tex: String.raw`x_i`, meaning: 'Điểm trung bình của lớp thứ i.' },
              { tex: String.raw`\bar{x}`, meaning: 'Điểm trung bình của khoa/viện.' },
              { tex: String.raw`n`, meaning: 'Số lớp.' },
              { tex: String.raw`\sigma`, meaning: 'Độ lệch chuẩn của điểm trung bình các lớp.' },
            ]}
          />
        </>
      ),
      plain: [
        'Độ lệch chuẩn σ = √( Σ(xᵢ − x̄)² ÷ (n − 1) ).'
          + ' Trong đó xᵢ là điểm trung bình của lớp thứ i, x̄ là điểm trung bình của khoa/viện,'
          + ' n là số lớp, σ là độ lệch chuẩn của điểm trung bình các lớp.',
      ],
    },
    {
      title: '2. Z-Score',
      display: (
        <>
          <Formula tex={String.raw`Z = \dfrac{\bar{x}_{\text{khoa}} - \bar{x}_{\text{toàn trường}}}{\dfrac{\sigma_{\text{toàn trường}}}{\sqrt{n}}}`} />
          <FormulaDefs
            items={[
              { tex: String.raw`\bar{x}_{\text{khoa}}`, meaning: 'Điểm trung bình của khoa/viện.' },
              { tex: String.raw`\bar{x}_{\text{toàn trường}}`, meaning: 'Điểm trung bình của toàn trường.' },
              { tex: String.raw`\sigma_{\text{toàn trường}}`, meaning: 'Độ lệch chuẩn của toàn trường.' },
              { tex: String.raw`n`, meaning: 'Số lớp.' },
              { tex: String.raw`\dfrac{\sigma_{\text{toàn trường}}}{\sqrt{n}}`, meaning: 'Sai số chuẩn.' },
              {
                tex: String.raw`Z`,
                meaning: 'Mức chênh lệch giữa điểm trung bình của khoa/viện và toàn trường, tính theo đơn vị sai số chuẩn.',
              },
            ]}
          />
        </>
      ),
      plain: [
        'Z-Score = (Điểm trung bình khoa − Trung bình toàn trường)'
          + ' ÷ (Độ lệch chuẩn toàn trường ÷ √Số lớp).'
          + ' Trong đó x̄ khoa là điểm trung bình của khoa/viện, x̄ toàn trường là điểm trung bình của toàn trường,'
          + ' σ toàn trường là độ lệch chuẩn của toàn trường, n là số lớp,'
          + ' σ toàn trường ÷ √n là sai số chuẩn.',
      ],
    },
    {
      title: '3. Phân loại theo độ lệch chuẩn',
      display: (
        <FormulaTable
          headers={['|Z|', 'Phân loại']}
          rows={[
            [<TeX key="z1" tex={String.raw`\left|Z\right| \le 1`} />, 'Trong khoảng 1σ'],
            [<TeX key="z2" tex={String.raw`1 < \left|Z\right| \le 2`} />, 'Trong khoảng 2σ'],
            [<TeX key="z3" tex={String.raw`2 < \left|Z\right| \le 3`} />, 'Trong khoảng 3σ'],
          ]}
        />
      ),
      plain: [
        'Phân loại theo |Z|: |Z| ≤ 1 trong khoảng 1σ; 1 < |Z| ≤ 2 trong khoảng 2σ;'
          + ' 2 < |Z| ≤ 3 trong khoảng 3σ.',
      ],
    },
  ],
  normalizationSections: [
    {
      title: '1. Z-Score so với toàn trường',
      display: (
        <>
          <Formula tex={String.raw`Z = \dfrac{\text{Điểm lớp} - \bar{x}_{\text{toàn trường}}}{\sigma_{\text{toàn trường}}}`} />
          <FormulaDefs
            items={[
              { tex: String.raw`\text{Điểm lớp}`, meaning: 'Điểm trung bình của lớp đang xét.' },
              { tex: String.raw`\bar{x}_{\text{toàn trường}}`, meaning: 'Điểm trung bình của toàn trường.' },
              { tex: String.raw`\sigma_{\text{toàn trường}}`, meaning: 'Độ lệch chuẩn của toàn trường.' },
            ]}
          />
        </>
      ),
      plain: ['Z-Score so với toàn trường = (Điểm lớp − Trung bình toàn trường) ÷ Độ lệch chuẩn toàn trường.'],
    },
    {
      title: '2. Z-Score so với khoa',
      display: (
        <>
          <Formula tex={String.raw`Z = \dfrac{\text{Điểm lớp} - \bar{x}_{\text{khoa}}}{\sigma_{\text{khoa}}}`} />
          <FormulaDefs
            items={[
              { tex: String.raw`\bar{x}_{\text{khoa}}`, meaning: 'Điểm trung bình của khoa/viện chủ quản lớp.' },
              { tex: String.raw`\sigma_{\text{khoa}}`, meaning: 'Độ lệch chuẩn điểm các lớp trong khoa.' },
            ]}
          />
        </>
      ),
      plain: ['Z-Score so với khoa = (Điểm lớp − Điểm trung bình khoa) ÷ Độ lệch chuẩn khoa.'],
    },
  ],
  departments: [
    {
      title: '1. Độ lệch chuẩn của bộ môn',
      display: (
        <>
          <Formula tex={String.raw`\sigma = \sqrt{\dfrac{\displaystyle\sum_{i=1}^{n}\left(x_i - \bar{x}\right)^2}{n - 1}}`} />
          <FormulaDefs
            items={[
              { tex: String.raw`x_i`, meaning: 'Điểm trung bình của lớp thứ i trong bộ môn.' },
              { tex: String.raw`\bar{x}`, meaning: 'Điểm trung bình của bộ môn.' },
              { tex: String.raw`n`, meaning: 'Số lớp của bộ môn.' },
            ]}
          />
        </>
      ),
      plain: ['Độ lệch chuẩn = độ lệch chuẩn điểm các lớp của bộ môn (công thức như tab theo khoa/viện).'],
    },
    {
      title: '2. Z-Score so với toàn trường',
      display: (
        <>
          <Formula tex={String.raw`Z = \dfrac{\bar{x}_{\text{bộ môn}} - \bar{x}_{\text{toàn trường}}}{\dfrac{\sigma_{\text{toàn trường}}}{\sqrt{n}}}`} />
          <FormulaDefs
            items={[
              { tex: String.raw`\bar{x}_{\text{bộ môn}}`, meaning: 'Điểm trung bình của bộ môn.' },
              { tex: String.raw`\bar{x}_{\text{toàn trường}}`, meaning: 'Điểm trung bình của toàn trường.' },
              { tex: String.raw`n`, meaning: 'Số lớp của bộ môn.' },
            ]}
          />
        </>
      ),
      plain: ['Z-Score so với toàn trường = (Điểm trung bình bộ môn − Trung bình toàn trường) ÷ (Độ lệch chuẩn toàn trường ÷ √Số lớp).'],
    },
    {
      title: '3. Z-Score so với khoa',
      display: (
        <>
          <Formula tex={String.raw`Z = \dfrac{\bar{x}_{\text{bộ môn}} - \bar{x}_{\text{khoa}}}{\dfrac{\sigma_{\text{khoa}}}{\sqrt{n}}}`} />
          <FormulaDefs
            items={[
              { tex: String.raw`\bar{x}_{\text{khoa}}`, meaning: 'Điểm trung bình của khoa/viện chủ quản.' },
              { tex: String.raw`\sigma_{\text{khoa}}`, meaning: 'Độ lệch chuẩn điểm các lớp trong khoa.' },
            ]}
          />
        </>
      ),
      plain: [
        'Z-Score so với khoa = (Điểm trung bình bộ môn − Điểm trung bình khoa) ÷ (Độ lệch chuẩn khoa ÷ √Số lớp).'
          + ' Để trống khi khoa có dưới 2 lớp.',
      ],
    },
  ],
  courses: [
    {
      title: '1. Chênh lệch giữa các lớp',
      display: (
        <Formula tex={String.raw`\text{Chênh lệch} = \text{Điểm lớp cao nhất} - \text{Điểm lớp thấp nhất}`} />
      ),
      plain: ['Bảng này so các lớp TRONG CÙNG một học phần với nhau. Chênh lệch giữa các lớp = Điểm lớp cao nhất − Điểm lớp thấp nhất.'],
    },
    {
      title: '2. Z-Score so với toàn trường',
      display: (
        <>
          <Formula tex={String.raw`Z = \dfrac{\bar{x}_{\text{học phần}} - \bar{x}_{\text{toàn trường}}}{\dfrac{\sigma_{\text{toàn trường}}}{\sqrt{n}}}`} />
          <FormulaDefs
            items={[
              { tex: String.raw`\bar{x}_{\text{học phần}}`, meaning: 'Điểm trung bình của học phần.' },
              { tex: String.raw`n`, meaning: 'Số lớp của học phần.' },
            ]}
          />
        </>
      ),
      plain: ['Z-Score so với toàn trường = (Điểm trung bình học phần − Trung bình toàn trường) ÷ (Độ lệch chuẩn toàn trường ÷ √Số lớp).'],
    },
    {
      title: '3. Z-Score so với khoa',
      display: (
        <>
          <Formula tex={String.raw`Z = \dfrac{\bar{x}_{\text{học phần}} - \bar{x}_{\text{khoa}}}{\dfrac{\sigma_{\text{khoa}}}{\sqrt{n}}}`} />
          <FormulaDefs
            items={[
              { tex: String.raw`\bar{x}_{\text{khoa}}`, meaning: 'Điểm trung bình của khoa/viện chủ quản học phần.' },
            ]}
          />
        </>
      ),
      plain: [
        'Z-Score so với khoa = (Điểm trung bình học phần − Điểm trung bình khoa) ÷ (Độ lệch chuẩn khoa ÷ √Số lớp).'
          + ' Để trống khi khoa có dưới 2 lớp.',
      ],
    },
  ],
  lecturer: [
    {
      title: '1. Z-Score',
      display: (
        <>
          <Formula tex={String.raw`Z = \dfrac{\text{Điểm lớp} - \bar{x}_{\text{nhóm so}}}{\sigma_{\text{nhóm so}}}`} />
          <FormulaDefs
            items={[
              { tex: String.raw`\bar{x}_{\text{nhóm so}}`, meaning: 'Điểm trung bình của nhóm đem ra so.' },
              {
                tex: String.raw`\sigma_{\text{nhóm so}}`,
                meaning: 'Độ lệch chuẩn của nhóm so. Ba cột Z dùng ba nhóm: toàn trường, các lớp cùng khoa, các lớp cùng bộ môn.',
              },
            ]}
          />
        </>
      ),
      plain: [
        'Z-Score = (Điểm lớp − Trung bình nhóm so) ÷ Độ lệch chuẩn nhóm so.'
          + ' Ba cột Z dùng ba nhóm: toàn trường, các lớp cùng khoa, các lớp cùng bộ môn.',
      ],
    },
    {
      title: '2. Chênh so học phần',
      display: (
        <Formula tex={String.raw`\text{Chênh so học phần} = \text{Điểm lớp} - \bar{x}_{\text{học phần}}`} />
      ),
      plain: ['Chênh so học phần = Điểm lớp − Điểm trung bình học phần. Để trống khi học phần chỉ có đúng lớp này, không có ai để so.'],
    },
    {
      title: '3. Lớp cảnh báo',
      display: (
        <Formula tex={String.raw`\text{Lớp cảnh báo}: Z \le -1`} />
      ),
      plain: ['Lớp cảnh báo = số lớp có điểm thấp hơn trung bình từ 1 độ lệch chuẩn trở lên (Z-Score ≤ −1).'],
    },
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
  value === undefined ? undefined : value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(3)}`;
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
  header: `${header} (%)`,
  width,
  type: 'number',
  align: 'right',
  numberFormat: '0.000',
  format: (value: MaybeNumber) => fixedOrDash(value, 3),
});
const scoreColumn = (key: string, header: string, digits = 3, width = 12): ExportColumn => ({
  key,
  header,
  width,
  type: 'number',
  align: 'right',
  numberFormat: '0.000',
  format: (value: MaybeNumber) => fixedOrDash(value, digits),
});
const zColumn = (key: string, header: string, width = 14): ExportColumn => ({
  key,
  header,
  width,
  type: 'number',
  align: 'right',
  numberFormat: '+0.000;-0.000;0.000',
  format: signedOrDash,
});

export const SurveyAnalysisPage: React.FC = () => {
  const { access } = useAuth();
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

  const {
    semesterSurveys,
    loading: campaignsLoading,
    error: campaignsError,
  } = useSemesterSurveys(semesterId);
  const [semesterSurveyId, setSemesterSurveyId] = useState<string>(
    initialRoute.semesterSurveyId
      ? String(initialRoute.semesterSurveyId)
      : getActiveSemesterSurveyId(),
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
      const nextSurveyId = route.semesterSurveyId ? String(route.semesterSurveyId) : '';
      setSemesterSurveyId(nextSurveyId);
      if (nextSurveyId) setActiveSemesterSurveyId(nextSurveyId);
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
      + `?semester=${semesterId}&campaign=${semesterSurveyId}`
      + `&from=survey-analysis&fromTab=${tab}`;
  }, [semesterId, semesterSurveyId, tab]);

  const openSurveyDetail = useCallback((courseSectionSurveyId: number) => {
    if (!semesterSurveyId) return;
    window.location.hash = `/reports/surveys/${courseSectionSurveyId}`
      + `?semester=${semesterId}&campaign=${semesterSurveyId}`
      + `&from=survey-analysis&fromTab=${tab}`;
  }, [semesterId, semesterSurveyId, tab]);

  useEffect(() => {
    const handleRouteChange = () => {
      if (!window.location.hash.replace(/^#\/?/, '').startsWith('survey-analysis')) return;
      applyRoute(parseAnalysisRoute());
    };
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, [applyRoute]);

  useEffect(() => {
    setSemesterSurveyId((current) => selectAvailableSemesterSurveyId(semesterSurveys, current));
  }, [semesterSurveys]);

  useEffect(() => {
    if (campaignsError) setLoadError(messageFrom(campaignsError));
  }, [campaignsError]);

  const campaignCacheRef = useRef<Map<number, {
    normalization?: SemesterSurveyNormalization;
    /** Chuẩn hoá tính theo riêng một mục câu hỏi, khoá là SectionId. */
    sectionNormalizations?: Record<number, SemesterSurveyNormalization>;
    /** Khoá là SectionId, 0 là toàn bộ bài khảo sát — mỗi mục một bản số liệu riêng. */
    departments?: Record<number, SemesterSurveyDepartmentSummary>;
    courses?: Record<number, SemesterSurveyCourseDiagnosis>;
    lecturers?: LecturerOption[];
  }>>(new Map());
  /** Khoá cache theo mục đang chọn; 0 dành cho toàn bộ bài khảo sát. */
  const sectionCacheKey = questionSectionId ?? 0;
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

    // Hai tab Khoa/viện và Lớp học phần đọc CÙNG một bản chuẩn hoá, chỉ hiện hai
    // phần khác nhau của nó, nên cùng đi theo mục đang chọn. Trước đây chỉ tab Lớp
    // học phần nạp bản theo mục, nên chọn mục ở tab Khoa/viện là bảng trống trơn.
    const usesNormalization = tab === 'normalization' || tab === 'normalizationSections';

    // Nếu tab đã có trong cache của campaign này, load ngay lập tức
    if (usesNormalization && questionSectionId !== null) {
      const cached = cacheEntry.sectionNormalizations?.[questionSectionId];
      if (cached) {
        setSectionNormalization(cached);
        setLoadError(null);
        setLoading(false);
        return;
      }
    } else if (usesNormalization) {
      if (cacheEntry.normalization) {
        setNormalization(cacheEntry.normalization);
        setLoadError(null);
        setLoading(false);
        return;
      }
    } else if (tab === 'departments') {
      const cached = cacheEntry.departments?.[sectionCacheKey];
      if (cached) {
        setDepartments(cached);
        setLoadError(null);
        setLoading(false);
        return;
      }
    } else if (tab === 'courses') {
      const cached = cacheEntry.courses?.[sectionCacheKey];
      if (cached) {
        setCourses(cached);
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
      if (usesNormalization && questionSectionId !== null) {
        const sectionRes = await surveyApi.semesterSurveyNormalization(campaignId, questionSectionId);
        if (generation !== analysisGenRef.current) return;
        cacheEntry.sectionNormalizations = {
          ...cacheEntry.sectionNormalizations,
          [questionSectionId]: sectionRes,
        };
        setSectionNormalization(sectionRes);
      } else if (usesNormalization) {
        const normRes = await surveyApi.semesterSurveyNormalization(campaignId);
        if (generation !== analysisGenRef.current) return;
        cacheEntry.normalization = normRes;
        setNormalization(normRes);
      } else if (tab === 'departments') {
        const deptRes = await surveyApi.semesterSurveyDepartmentSummary(campaignId, questionSectionId);
        if (generation !== analysisGenRef.current) return;
        cacheEntry.departments = { ...cacheEntry.departments, [sectionCacheKey]: deptRes };
        setDepartments(deptRes);
      } else if (tab === 'courses') {
        const courseRes = await surveyApi.semesterSurveyCourseDiagnosis(campaignId, questionSectionId);
        if (generation !== analysisGenRef.current) return;
        cacheEntry.courses = { ...cacheEntry.courses, [sectionCacheKey]: courseRes };
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
  }, [semesterSurveyId, tab, questionSectionId, sectionCacheKey]);

  // Dữ liệu của tab Phân tích theo lớp học phần: toàn bài, hoặc bản tính theo mục đang
  // chọn. Bản theo mục chỉ dùng khi đúng là của mục đó, tránh lóe số của mục trước.
  const sectionTabData = questionSectionId === null
    ? normalization
    : sectionNormalization?.questionSectionId === questionSectionId
      ? sectionNormalization
      : null;
  // Cùng lý do với `sectionTabData`: chỉ hiện số khi đúng là của mục đang chọn.
  const departmentTabData = departments?.questionSectionId === questionSectionId ? departments : null;
  const courseTabData = courses?.questionSectionId === questionSectionId ? courses : null;
  // Danh sách mục để dựng ô chọn: lấy từ bất kỳ bản số liệu nào đã tải của đợt, kể cả
  // bản của mục khác — mục nào cũng trả về cùng danh sách, nên ô chọn không bị mất.
  const questionSectionOptions = (sectionTabData ?? normalization)?.questionSections
    ?? sectionNormalization?.questionSections
    ?? departments?.questionSections
    ?? courses?.questionSections
    ?? [];
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
  const visibleTabs = useMemo(
    () => tabs.filter((item) => canAccessTab(access?.permissions, TAB_PERMISSION.surveyAnalysis[item.id])),
    [access?.permissions],
  );

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
    <NoteModalButton title={`Chú thích · ${activeTab?.label ?? ''}`}>
      <div className="z-legend">
        <p className="z-legend__note">{activeTab?.hint}</p>
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
          <strong>Tỷ lệ phản hồi</strong> = Số phiếu đã thu ÷ Tổng số phiếu phải thu.
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

  /*
    Đường dẫn điều hướng trên thanh trên cùng: mục đầu là tên tab đang mở, đi sâu vào
    báo cáo của một giảng viên thì nối thêm tên người đó.
  */
  const breadcrumbTrail = useMemo(() => {
    const segments = [tabs.find((item) => item.id === tab)?.label ?? 'Phân tích chuyên sâu'];
    if (tab === 'lecturer' && selectedLecturerId !== null
      && lecturerReport?.lecturerId === selectedLecturerId) {
      segments.push(lecturerReport.fullName);
    }
    return segments;
  }, [lecturerReport, selectedLecturerId, tab]);
  useSetBreadcrumbTrail(breadcrumbTrail);

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
      // Bản chữ một dòng của công thức: tệp xuất không xếp được phân số.
      ...(tabFormulaNotes[tabId] ?? []).flatMap((note) => note.plain),
      ...extra,
      `Số liệu chỉ gộp lớp qua cả hai tiêu chí: tỷ lệ phản hồi ≥ ${thresholds.minimumResponseRate}%`
        + ` và tỷ lệ phiếu hợp lệ ≥ ${thresholds.minimumValidRate}%.`,
      'Tỷ lệ phản hồi = Số phiếu đã thu ÷ Tổng số phiếu phải thu.',
      'Tỷ lệ phiếu hợp lệ = Số phiếu hợp lệ ÷ Số phiếu đã thu.',
      'Số liệu lấy theo lần bấm Cập nhật điểm gần nhất.',
      ...(shown < total
        ? [`Tệp chỉ chứa ${shown}/${total} dòng đang hiển thị theo bộ lọc cột trên màn hình.`]
        : []),
    ].filter(Boolean);

    const metadataOf = (title: string, info: Record<string, string | number | undefined>, summaryNotes: string[]) => ({
      title,
      subtitle,
      breadcrumb: ['Phân tích chuyên sâu'],
      info: { ...baseInfo, ...info },
      summaryNotes,
    });

    /**
     * Dòng "Tính điểm và Z-Score theo" cùng ghi chú đi kèm, dùng chung cho mọi tab có
     * ô chọn mục — tệp xuất phải nói rõ số đang tính trên mục nào, không thì mở ra
     * không biết bảng này là của toàn bài hay của một mục.
     */
    const scopeOf = (source: {
      questionSections: NormalizationQuestionSection[];
      questionSectionId: number | null;
    }) => {
      const selected = source.questionSections.find((item) => item.sectionId === source.questionSectionId);
      const totalQuestions = source.questionSections.reduce((sum, item) => sum + item.questionCount, 0);
      return {
        label: selected
          ? `${selected.sectionName} (${selected.questionCount} câu)`
          : source.questionSections.length > 0
            ? `Toàn bộ bài khảo sát (${totalQuestions} câu)`
            : 'Toàn bộ bài khảo sát',
        notes: selected
          ? [`Điểm và Z-Score chỉ tính từ các câu của mục "${selected.sectionName}", không tính câu bẫy.`]
          : [],
      };
    };

    if (tab === 'normalization' && sectionTabData) {
      const data = sectionTabData;
      const rows = shownRows('normalization', data.groups);
      const scope = scopeOf(data);

      return {
        fileName: `phan-tich-theo-khoa-vien-${fileSuffix}`,
        metadata: metadataOf(
          'PHÂN TÍCH THEO KHOA/VIỆN',
          {
            'Tính điểm và Z-Score theo': scope.label,
            'Trung bình toàn trường': formatDecimal(data.schoolAverageScore, 3),
            'Số lớp có phiếu': data.schoolSectionCount,
            'Số khoa/viện': data.groups.length,
          },
          notesFor('normalization', rows.length, data.groups.length, scope.notes),
        ),
        sheets: [
          {
            sheetName: 'Theo khoa vien',
            title: `PHÂN TÍCH THEO KHOA/VIỆN (${rows.length} KHOA/VIỆN)`,
            columns: [
              textColumn('facultyName', 'Khoa / Viện', 32),
              countColumn('sectionCount', 'Số lớp', 8),
              countColumn('lecturerCount', 'Số giảng viên', 8),
              countColumn('totalClassSize', 'Tổng số phiếu phải thu'),
              countColumn('responseCount', 'Số phiếu đã thu', 12),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm trung bình khoa', 3),
              scoreColumn('standardDeviation', 'Độ lệch chuẩn', 3),
              zColumn('meanZScore', 'Z-Score so với toàn trường'),
            ],
            data: rows,
          },
        ],
      };
    }

    if (tab === 'normalizationSections' && sectionTabData) {
      const data = sectionTabData;
      const rows = shownRows('normalizationSections', data.sections);
      const scope = scopeOf(data);

      return {
        fileName: `phan-tich-theo-lop-hoc-phan-${fileSuffix}`,
        metadata: metadataOf(
          'PHÂN TÍCH THEO LỚP HỌC PHẦN',
          {
            'Tính điểm và Z-Score theo': scope.label,
            'Trung bình toàn trường': formatDecimal(data.schoolAverageScore, 3),
            'Độ lệch chuẩn':
              formatDecimalOrDash(data.schoolStandardDeviation, 3),
            'Số lớp có phiếu': data.schoolSectionCount,
            'Số khoa/viện': data.groups.length,
          },
          notesFor('normalizationSections', rows.length, data.sections.length, scope.notes),
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
              countColumn('classSize', 'Tổng số phiếu phải thu', 8),
              countColumn('responseCount', 'Số phiếu đã thu', 12),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm', 3, 8),
              zColumn('zSchool', 'Z-Score so với toàn trường'),
              zColumn('zFaculty', 'Z-Score so với khoa'),
            ],
            data: rows,
          },
        ],
      };
    }

    if (tab === 'departments' && departmentTabData) {
      const data = departmentTabData;
      const rows = shownRows('departments', data.rows);
      const isScoped = data.rows.length < data.schoolDepartmentCount;
      const scope = scopeOf(data);

      return {
        fileName: `phan-tich-theo-bo-mon-${fileSuffix}`,
        metadata: metadataOf(
          'PHÂN TÍCH THEO BỘ MÔN',
          {
            'Tính điểm và Z-Score theo': scope.label,
            'Số bộ môn': isScoped
              ? `${data.rows.length} bộ môn của bạn · toàn trường ${data.schoolDepartmentCount} bộ môn`
              : data.rows.length,
            'Số lớp có phiếu': data.schoolSectionCount,
            'Tổng phiếu toàn trường': data.schoolResponseCount,
            'Lớp Z-Score ≤ −1': data.schoolWarningCount > 0
              ? `${data.schoolWarningCount} lớp thấp hơn trung bình toàn trường từ 1 độ lệch chuẩn trở lên`
              : undefined,
          },
          notesFor('departments', rows.length, data.rows.length, scope.notes),
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
              countColumn('totalClassSize', 'Tổng số phiếu phải thu'),
              countColumn('responseCount', 'Số phiếu đã thu', 12),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm trung bình'),
              scoreColumn('standardDeviation', 'Độ lệch chuẩn', 3),
              zColumn('meanZScore', 'Z-Score so với toàn trường'),
              zColumn('facultyMeanZScore', 'Z-Score so với khoa'),
            ],
            data: rows,
          },
        ],
      };
    }

    if (tab === 'courses' && courseTabData) {
      const data = courseTabData;
      // Tệp xuất phải giống hệt bảng: học phần một lớp cũng để trống bốn cột so sánh.
      const rows = shownRows('courses', data.rows).map((row) => ({
        ...row,
        averageScore: comparableScore(row.sectionCount, row.averageScore),
        minScore: comparableScore(row.sectionCount, row.minScore),
        maxScore: comparableScore(row.sectionCount, row.maxScore),
        spread: comparableScore(row.sectionCount, row.spread),
      }));
      const scope = scopeOf(data);

      return {
        fileName: `phan-tich-theo-hoc-phan-${fileSuffix}`,
        metadata: metadataOf(
          'PHÂN TÍCH THEO HỌC PHẦN',
          {
            'Tính điểm và Z-Score theo': scope.label,
            'Số học phần thu được phiếu': data.rows.length,
            'Học phần có từ 2 lớp trở lên': data.rows.filter((row) => row.sectionCount > 1).length,
          },
          notesFor('courses', rows.length, data.rows.length, scope.notes),
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
              countColumn('totalClassSize', 'Tổng số phiếu phải thu'),
              countColumn('responseCount', 'Số phiếu đã thu', 12),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm trung bình', 3, 8),
              scoreColumn('minScore', 'Lớp thấp nhất'),
              scoreColumn('maxScore', 'Lớp cao nhất'),
              scoreColumn('spread', 'Chênh lệch giữa các lớp', 3, 14),
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
            'Số lớp': `${report.sectionCount} lớp · tổng số phiếu phải thu ${classSize.toLocaleString('vi-VN')}`,
            'Điểm trung bình': formatDecimal(report.averageScore, 3),
            'Số phiếu đã thu': `${report.totalResponseCount.toLocaleString('vi-VN')} phiếu (${formatPercent(responseRate, 3)})`,
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
              countColumn('classSize', 'Tổng số phiếu phải thu', 8),
              countColumn('responseCount', 'Số phiếu đã thu', 12),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm', 3, 8),
              scoreColumn('courseAverageScore', 'Điểm trung bình học phần', 3, 14),
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
      // Tệp xuất phải giống hệt bảng: giảng viên một lớp cũng để trống ba cột điểm.
      const rows = shownRows('lecturer', lecturers).map((row) => ({
        ...row,
        averageScore: comparableScore(row.sectionCount, row.averageScore),
        minScore: comparableScore(row.sectionCount, row.minScore),
        maxScore: comparableScore(row.sectionCount, row.maxScore),
      }));
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
            'Tổng số phiếu phải thu': classSize.toLocaleString('vi-VN'),
            'Số phiếu đã thu': `${responses.toLocaleString('vi-VN')} (${formatPercent(responseRate ?? 0, 3)})`,
            'Số phiếu hợp lệ': `${validResponses.toLocaleString('vi-VN')} (${formatPercent(validRate ?? 0, 3)})`,
            'Điểm trung bình chung': formatDecimalOrDash(overallScore, 3),
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
              countColumn('totalClassSize', 'Tổng số phiếu phải thu'),
              countColumn('responseCount', 'Số phiếu đã thu', 10),
              countColumn('validResponseCount', 'Số phiếu hợp lệ', 12),
              rateColumn('responseRate', 'Tỷ lệ phản hồi'),
              rateColumn('validResponseRate', 'Tỷ lệ phiếu hợp lệ'),
              scoreColumn('averageScore', 'Điểm trung bình', 3, 8),
              scoreColumn('minScore', 'Lớp thấp nhất'),
              scoreColumn('maxScore', 'Lớp cao nhất'),
            ],
            data: rows,
          },
        ],
      };
    }

    return null;
  }, [
    tab,
    sectionTabData,
    departmentTabData,
    courseTabData,
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
            placeholder={campaignPlaceholder(campaignsLoading, semesterSurveys.length)}
            onChange={(nextCampaignId) => {
              setSemesterSurveyId(nextCampaignId);
              setActiveSemesterSurveyId(nextCampaignId);
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

      {/*
        Ô chọn mục dùng chung cho bốn tab tính điểm; Báo cáo giảng viên không có vì
        bảng đó gộp theo giảng viên chứ không theo mục. Đặt ngoài khối nội dung để
        đang tải vẫn thấy mục đang chọn và đổi lại được.
      */}
      {visibleTabs.length > 0 && tab !== 'lecturer' && (
        <QuestionSectionPicker
          sections={questionSectionOptions}
          selectedId={questionSectionId}
          onSelect={selectQuestionSection}
        />
      )}

      {visibleTabs.length === 0 ? (
        <div className="operations-empty" role="status">
          <strong>Vai trò này chưa được mở tab nào trong Phân tích chuyên sâu.</strong>
          <span>Liên hệ Quản trị viên để được cấp quyền.</span>
        </div>
      ) : loading ? (
        <div className="operations-empty" role="status">
          <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          <strong>Đang tính toán...</strong>
        </div>
      ) : tab === 'normalization' ? (
        <NormalizationGroupTab
          data={sectionTabData}
          selectedQuestionSectionId={questionSectionId}
          note={tabNote}
          onVisibleRowsChange={reportVisibleRows.normalization}
          onOpenDetail={openScopeDetail}
        />
      ) : tab === 'normalizationSections' ? (
        <NormalizationSectionTab
          data={sectionTabData}
          selectedQuestionSectionId={questionSectionId}
          note={tabNote}
          onVisibleRowsChange={reportVisibleRows.normalizationSections}
          onOpenSurvey={openSurveyDetail}
        />
      ) : tab === 'departments' ? (
        <DepartmentTab
          data={departmentTabData}
          note={tabNote}
          onVisibleRowsChange={reportVisibleRows.departments}
          onOpenDetail={openScopeDetail}
        />
      ) : tab === 'courses' ? (
        <CourseDiagnosisTab
          data={courseTabData}
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
          onOpenSurvey={openSurveyDetail}
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
      Trung bình toàn trường: <strong>{formatDecimal(data.schoolAverageScore, 3)}</strong>
    </span>
    {showStandardDeviation && (
      <span>
        Độ lệch chuẩn:{' '}
        <strong>
          {formatDecimalOrDash(data.schoolStandardDeviation, 3)}
        </strong>
      </span>
    )}
    <span>
      {data.schoolSectionCount} lớp có phiếu: {data.groups.length} khoa/viện
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
  /** Null là toàn bộ bài khảo sát; chỉ dùng để chọn câu chữ của dòng "chưa có số". */
  selectedQuestionSectionId: number | null;
  onOpenDetail: (selection: AnalysisScopeTarget) => void;
  note?: React.ReactNode;
  /** Báo lên các dòng đang hiện (sau bộ lọc cột) để file xuất đúng bằng bảng. */
  onVisibleRowsChange?: (rows: readonly unknown[]) => void;
}> = ({ data, selectedQuestionSectionId, onOpenDetail, note, onVisibleRowsChange }) => {
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const groupColumns = useMemo<FilterableColumn<(typeof groups)[number]>[]>(() => [
    { key: 'facultyName', value: (row) => row.facultyName },
    { key: 'sectionCount', value: (row) => String(row.sectionCount), numeric: true },
    { key: 'averageScore', value: (row) => formatDecimal(row.averageScore, 3), numeric: true },
    {
      key: 'standardDeviation',
      value: (row) => (formatDecimalOrDash(row.standardDeviation, 3)),
      sortValue: (row) => row.standardDeviation,
    },
    {
      key: 'meanZScore',
      value: (row) => (formatDecimalOrDash(row.meanZScore, 3)),
      sortValue: (row) => row.meanZScore,
    },
    { key: 'lecturerCount', value: (row) => String(row.lecturerCount), numeric: true },
    { key: 'totalClassSize', value: (row) => String(row.totalClassSize), numeric: true },
    { key: 'responseCount', value: (row) => String(row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (row) => String(row.validResponseCount), numeric: true },
    {
      key: 'responseRate',
      value: (row) => formatDecimal(row.responseRate, 3),
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => formatDecimal(row.validResponseRate, 3),
      sortValue: (row) => row.validResponseRate,
    },
  ], []);
  const groupFilters = useColumnFilters(groups, groupColumns);
  const groupPagination = usePaginatedItems(groupFilters.visibleRows, analysisPageSize);
  useEffect(() => {
    onVisibleRowsChange?.(groupFilters.visibleRows);
  }, [groupFilters.visibleRows, onVisibleRowsChange]);

  if (!data || data.sections.length === 0) {
    return emptyWithNote(
      note,
      selectedQuestionSectionId === null
        ? 'Đợt này chưa có lớp nào thu được phiếu hợp lệ.'
        : 'Chưa có lớp nào có điểm cho mục này.',
    );
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
                {groupFilters.filterHeader('totalClassSize', 'Tổng số phiếu phải thu')}
              </th>
              <th scope="col" style={{ width: '8%' }}>
                {groupFilters.filterHeader('responseCount', 'Số phiếu đã thu')}
              </th>
              <th scope="col" style={{ width: '8%' }}>
                {groupFilters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '9%' }} title="Số phiếu đã thu chia tổng số phiếu phải thu">
                {groupFilters.filterHeader('responseRate', 'Tỷ lệ phản hồi (%)')}
              </th>
              <th scope="col" style={{ width: '9%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
                {groupFilters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ (%)')}
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
                  <td className="num">{formatDecimal(group.responseRate, 3)}</td>
                  <td className="num">{formatDecimal(group.validResponseRate, 3)}</td>
                  {/* Tô theo bậc Z chứ không theo thang điểm tuyệt đối: cả bảng này
                      đọc bằng một thước duy nhất là 68-95-99.7. */}
                  <td className={zTierClass(group.meanZScore)}>{formatDecimal(group.averageScore, 3)}</td>
                  <td className="num">
                    {formatDecimalOrDash(group.standardDeviation, 3)}
                  </td>
                  <td className={zTierClass(group.meanZScore)}>
                    {group.meanZScore === null
                      ? '—'
                      : formatSigned(group.meanZScore)}
                  </td>
                </tr>
              );
            })}
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
    // Radio chứ không phải checkbox: mỗi lần chỉ tính theo ĐÚNG một phạm vi, ô vuông
    // làm người dùng tưởng chọn được nhiều mục cùng lúc.
    <div className="analysis-section-picker" role="radiogroup" aria-label="Tính điểm và Z-Score theo">
      <span className="analysis-section-picker__label">Tính điểm và Z-Score theo:</span>
      {options.map((option) => (
        <label key={option.id ?? 'all'} className="analysis-section-picker__option">
          <input
            type="radio"
            name="analysis-question-section"
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
  /** Null là toàn bộ bài khảo sát; chỉ dùng để chọn câu chữ của dòng "chưa có số". */
  selectedQuestionSectionId: number | null;
  onOpenSurvey: (courseSectionSurveyId: number) => void;
  note?: React.ReactNode;
  /** Báo lên các dòng đang hiện (sau bộ lọc cột) để file xuất đúng bằng bảng. */
  onVisibleRowsChange?: (rows: readonly unknown[]) => void;
}> = ({
  data,
  selectedQuestionSectionId,
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
      value: (row) => formatDecimal(row.responseRate, 3),
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => formatDecimal(row.validResponseRate, 3),
      sortValue: (row) => row.validResponseRate,
    },
    { key: 'averageScore', value: (row) => formatDecimal(row.averageScore, 3), numeric: true },
    {
      key: 'zSchool',
      value: (row) => (formatDecimalOrDash(row.zSchool, 3)),
      sortValue: (row) => row.zSchool,
    },
    {
      key: 'zFaculty',
      value: (row) => (formatDecimalOrDash(row.zFaculty, 3)),
      sortValue: (row) => row.zFaculty,
    },
  ], []);
  const sectionFilters = useColumnFilters(sections, sectionColumns);
  const sectionPagination = usePaginatedItems(sectionFilters.visibleRows, analysisPageSize);
  useEffect(() => {
    onVisibleRowsChange?.(sectionFilters.visibleRows);
  }, [sectionFilters.visibleRows, onVisibleRowsChange]);

  if (!data || data.sections.length === 0) {
    return emptyWithNote(
      note,
      selectedQuestionSectionId === null
        ? 'Đợt này chưa có lớp nào thu được phiếu hợp lệ.'
        : 'Chưa có lớp nào có điểm cho mục này.',
    );
  }

  return (
    <>
      <NormalizationSummary data={data} showStandardDeviation note={note} />

      <div className="statistics-table-scroll" tabIndex={0} aria-label="Chi tiết chuẩn hoá từng lớp">
        <table className="statistics-table statistics-table--fixed">
          <thead>
            <tr>
              <th scope="col" style={{ width: '11%' }}>
                {sectionFilters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th scope="col" style={{ width: '12%' }}>
                {sectionFilters.filterHeader('departmentName', 'Bộ môn')}
              </th>
              <th scope="col" style={{ width: '13%' }}>
                {sectionFilters.filterHeader('courseName', 'Học phần')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {sectionFilters.filterHeader('courseCode', 'Mã học phần')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {sectionFilters.filterHeader('sectionName', 'Lớp học phần')}
              </th>
              <th scope="col" style={{ width: '13%' }}>
                {sectionFilters.filterHeader('lecturerName', 'Giảng viên')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {sectionFilters.filterHeader('classSize', 'Tổng số phiếu phải thu')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {sectionFilters.filterHeader('responseCount', 'Số phiếu đã thu')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {sectionFilters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '6%' }} title="Số phiếu đã thu chia tổng số phiếu phải thu lớp">
                {sectionFilters.filterHeader('responseRate', 'Tỷ lệ phản hồi (%)')}
              </th>
              <th scope="col" style={{ width: '6%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
                {sectionFilters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ (%)')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
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
                <td className="num">{formatDecimal(section.responseRate, 3)}</td>
                <td className="num">{formatDecimal(section.validResponseRate, 3)}</td>
                <td className={zTierClass(section.zFaculty)}>
                  {formatDecimal(section.averageScore, 3)}
                </td>
                <td className={zTierClass(section.zSchool)}>
                  {section.zSchool === null
                    ? '—'
                    : formatSigned(section.zSchool)}
                </td>
                <td className={zTierClass(section.zFaculty)}>
                  {section.zFaculty === null
                    ? '—'
                    : formatSigned(section.zFaculty)}
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
      value: (row) => formatDecimal(row.responseRate, 3),
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => formatDecimal(row.validResponseRate, 3),
      sortValue: (row) => row.validResponseRate,
    },
    {
      key: 'averageScore',
      value: (row) => (formatDecimalOrDash(row.averageScore, 3)),
      sortValue: (row) => row.averageScore,
    },
    {
      key: 'standardDeviation',
      value: (row) => (formatDecimalOrDash(row.standardDeviation, 3)),
      sortValue: (row) => row.standardDeviation,
    },
    {
      key: 'meanZScore',
      value: (row) => (formatDecimalOrDash(row.meanZScore, 3)),
      sortValue: (row) => row.meanZScore,
    },
    {
      key: 'facultyMeanZScore',
      value: (row) => (formatDecimalOrDash(row.facultyMeanZScore, 3)),
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

  const totalSections = data.schoolSectionCount;
  const totalResponses = data.schoolResponseCount;
  const isScoped = data.rows.length < data.schoolDepartmentCount;

  return (
    <>
      <section className="statistics-summary">
        <span>
          {isScoped
            ? `${data.rows.length} bộ môn của bạn · toàn trường ${data.schoolDepartmentCount} bộ môn`
            : `${data.rows.length} bộ môn`}
          {': '}{totalSections} lớp có phiếu
        </span>
        <span>
          Tổng phiếu toàn trường: <strong>{totalResponses}</strong>
        </span>
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
                {filters.filterHeader('totalClassSize', 'Tổng số phiếu phải thu')}
              </th>
              <th scope="col" style={{ width: '6%' }}>
                {filters.filterHeader('responseCount', 'Số phiếu đã thu')}
              </th>
              <th scope="col" style={{ width: '6%' }}>
                {filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '6%' }} title="Số phiếu đã thu chia tổng số phiếu phải thu">
                {filters.filterHeader('responseRate', 'Tỷ lệ phản hồi (%)')}
              </th>
              <th scope="col" style={{ width: '6%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
                {filters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ (%)')}
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
                <td className="num">{formatDecimal(row.responseRate, 3)}</td>
                <td className="num">{formatDecimal(row.validResponseRate, 3)}</td>
                <td className={scoreClass(row.averageScore)}>
                  {formatDecimalOrDash(row.averageScore, 3)}
                </td>
                <td className="num">
                  {formatDecimalOrDash(row.standardDeviation, 3)}
                </td>
                <td className={zTierClass(row.meanZScore)}>
                  {row.meanZScore === null
                    ? '—'
                    : formatSigned(row.meanZScore)}
                </td>
                <td className={zTierClass(row.facultyMeanZScore)}>
                  {row.facultyMeanZScore === null
                    ? '—'
                    : formatSigned(row.facultyMeanZScore)}
                </td>
              </tr>
            ))}
          </tbody>

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
      value: (row) => formatDecimal(row.responseRate, 3),
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => formatDecimal(row.validResponseRate, 3),
      sortValue: (row) => row.validResponseRate,
    },
    // Học phần chỉ có MỘT lớp thì bốn cột này không so được với gì: điểm trung bình,
    // lớp thấp nhất, lớp cao nhất đều là số của đúng lớp đó và chênh lệch luôn bằng 0.
    {
      key: 'averageScore',
      value: (row) => scoreText(comparableScore(row.sectionCount, row.averageScore)),
      sortValue: (row) => comparableScore(row.sectionCount, row.averageScore),
    },
    {
      key: 'minScore',
      value: (row) => scoreText(comparableScore(row.sectionCount, row.minScore)),
      sortValue: (row) => comparableScore(row.sectionCount, row.minScore),
    },
    {
      key: 'maxScore',
      value: (row) => scoreText(comparableScore(row.sectionCount, row.maxScore)),
      sortValue: (row) => comparableScore(row.sectionCount, row.maxScore),
    },
    {
      key: 'spread',
      value: (row) => scoreText(comparableScore(row.sectionCount, row.spread)),
      sortValue: (row) => comparableScore(row.sectionCount, row.spread),
    },
    {
      key: 'meanZScore',
      value: (row) => (formatDecimalOrDash(row.meanZScore, 3)),
      sortValue: (row) => row.meanZScore,
    },
    {
      key: 'facultyMeanZScore',
      value: (row) => (formatDecimalOrDash(row.facultyMeanZScore, 3)),
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
              <th scope="col" style={{ width: '8%' }}>
                {filters.filterHeader('facultyName', 'Khoa / Viện')}
              </th>
              <th scope="col" style={{ width: '19%' }}>
                {filters.filterHeader('departmentName', 'Bộ môn')}
              </th>
              <th scope="col" style={{ width: '14%' }}>
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
                {filters.filterHeader('totalClassSize', 'Tổng số phiếu phải thu')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {filters.filterHeader('responseCount', 'Số phiếu đã thu')}
              </th>
              <th scope="col" style={{ width: '4%' }}>
                {filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '6%' }} title="Số phiếu đã thu chia tổng số phiếu phải thu">
                {filters.filterHeader('responseRate', 'Tỷ lệ phản hồi (%)')}
              </th>
              <th scope="col" style={{ width: '6%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
                {filters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ (%)')}
              </th>
              <th scope="col" style={{ width: '6%' }}>
                {filters.filterHeader('averageScore', 'Điểm trung bình')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('minScore', 'Lớp thấp nhất')}
              </th>
              <th scope="col" style={{ width: '5%' }}>
                {filters.filterHeader('maxScore', 'Lớp cao nhất')}
              </th>
              <th scope="col" style={{ width: '5%' }} title="Điểm lớp cao nhất trừ điểm lớp thấp nhất">
                {filters.filterHeader('spread', 'Chênh lệch giữa các lớp')}
              </th>
              <th
                scope="col"
                style={{ width: '6%' }}
                title="Điểm trung bình học phần lệch trung bình toàn trường bao nhiêu lần sai số chuẩn σ/√n"
              >
                {filters.filterHeader('meanZScore', 'Z-Score so với toàn trường')}
              </th>
              <th
                scope="col"
                style={{ width: '6%' }}
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
                <td className="num">{formatDecimal(row.responseRate, 3)}</td>
                <td className="num">{formatDecimal(row.validResponseRate, 3)}</td>
                <td className={scoreClass(comparableScore(row.sectionCount, row.averageScore))}>
                  {scoreText(comparableScore(row.sectionCount, row.averageScore))}
                </td>
                <td className={scoreClass(comparableScore(row.sectionCount, row.minScore))}>
                  {scoreText(comparableScore(row.sectionCount, row.minScore))}
                </td>
                <td className={scoreClass(comparableScore(row.sectionCount, row.maxScore))}>
                  {scoreText(comparableScore(row.sectionCount, row.maxScore))}
                </td>
                <td className={row.sectionCount > 1 ? spreadClass(row.spread) : 'num'}>
                  {scoreText(comparableScore(row.sectionCount, row.spread))}
                </td>
                <td className={zTierClass(row.meanZScore)}>
                  {row.meanZScore === null
                    ? '—'
                    : formatSigned(row.meanZScore)}
                </td>
                <td className={zTierClass(row.facultyMeanZScore)}>
                  {row.facultyMeanZScore === null
                    ? '—'
                    : formatSigned(row.facultyMeanZScore)}
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
      value: (row) => formatDecimal(row.responseRate, 3),
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => formatDecimal(row.validResponseRate, 3),
      sortValue: (row) => row.validResponseRate,
    },
    // Ba cột điểm đi qua comparableScore để giảng viên một lớp cũng lọc và sắp xếp
    // theo đúng cái đang hiện trên bảng, không phải theo con số đã bị giấu đi.
    {
      key: 'averageScore',
      value: (row) => scoreText(comparableScore(row.sectionCount, row.averageScore)),
      sortValue: (row) => comparableScore(row.sectionCount, row.averageScore),
    },
    {
      key: 'minScore',
      value: (row) => scoreText(comparableScore(row.sectionCount, row.minScore)),
      sortValue: (row) => comparableScore(row.sectionCount, row.minScore),
    },
    {
      key: 'maxScore',
      value: (row) => scoreText(comparableScore(row.sectionCount, row.maxScore)),
      sortValue: (row) => comparableScore(row.sectionCount, row.maxScore),
    },
  ], []);

  const filters = useColumnFilters(lecturers, columns);
  const pagination = usePaginatedItems(filters.visibleRows, analysisPageSize);
  useEffect(() => {
    onVisibleRowsChange?.(filters.visibleRows);
  }, [filters.visibleRows, onVisibleRowsChange]);

  const totalSections = useMemo(() => lecturers.reduce((sum, r) => sum + r.sectionCount, 0), [lecturers]);
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
        {/* Dòng này chỉ giữ vài số đầu bảng: tổng số phiếu phải thu, phiếu đã thu và phiếu hợp lệ đã có ở
            dòng tổng cuối bảng, để cả ra đây thì nút Chú thích và nút xuất bị đẩy
            xuống dòng thứ hai. */}
        <span>
          <strong>{lecturers.length}</strong> giảng viên: <strong>{totalSections}</strong> lớp giảng dạy
        </span>
        <span>
          Điểm trung bình chung:{' '}
          <strong>{formatDecimalOrDash(overallAvgScore, 3)}</strong>
        </span>
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
                {filters.filterHeader('totalClassSize', 'Tổng số phiếu phải thu')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {filters.filterHeader('responseCount', 'Số phiếu đã thu')}
              </th>
              <th scope="col" style={{ width: '7%' }}>
                {filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
              </th>
              <th scope="col" style={{ width: '7%' }} title="Số phiếu đã thu chia tổng số phiếu phải thu">
                {filters.filterHeader('responseRate', 'Tỷ lệ phản hồi (%)')}
              </th>
              <th scope="col" style={{ width: '7%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
                {filters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ (%)')}
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
                <td className="num">{formatDecimal(row.responseRate, 3)}</td>
                <td className="num">{formatDecimal(row.validResponseRate, 3)}</td>
                <td className={scoreClass(comparableScore(row.sectionCount, row.averageScore))}>
                  {scoreText(comparableScore(row.sectionCount, row.averageScore))}
                </td>
                <td className={scoreClass(comparableScore(row.sectionCount, row.minScore))}>
                  {scoreText(comparableScore(row.sectionCount, row.minScore))}
                </td>
                <td className={scoreClass(comparableScore(row.sectionCount, row.maxScore))}>
                  {scoreText(comparableScore(row.sectionCount, row.maxScore))}
                </td>
              </tr>
            ))}
          </tbody>

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
      value: (row) => formatDecimal(row.responseRate, 3),
      sortValue: (row) => row.responseRate,
    },
    {
      key: 'validResponseRate',
      value: (row) => formatDecimal(row.validResponseRate, 3),
      sortValue: (row) => row.validResponseRate,
    },
    { key: 'averageScore', value: (row) => formatDecimal(row.averageScore, 3), numeric: true },
    {
      key: 'courseAverageScore',
      value: (row) => (formatDecimalOrDash(row.courseAverageScore, 3)),
      sortValue: (row) => row.courseAverageScore,
    },
    {
      key: 'differenceFromCourse',
      value: (row) => (formatDecimalOrDash(row.differenceFromCourse, 3)),
      sortValue: (row) => row.differenceFromCourse,
    },
    {
      key: 'zSchool',
      value: (row) => (formatDecimalOrDash(row.zSchool, 3)),
      sortValue: (row) => row.zSchool,
    },
    {
      key: 'zFaculty',
      value: (row) => (formatDecimalOrDash(row.zFaculty, 3)),
      sortValue: (row) => row.zFaculty,
    },
    {
      key: 'zDepartment',
      value: (row) => (formatDecimalOrDash(row.zDepartment, 3)),
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
          <span>{report.sectionCount} lớp · tổng số phiếu phải thu {totalClassSize.toLocaleString('vi-VN')}</span>
          <span>Điểm trung bình {formatDecimal(report.averageScore, 3)}</span>
          <span>
            {report.totalResponseCount.toLocaleString('vi-VN')} phiếu đã thu ({formatPercent(overallRate, 3)})
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
                <th scope="col">{filters.filterHeader('classSize', 'Tổng số phiếu phải thu')}</th>
                <th scope="col">{filters.filterHeader('responseCount', 'Số phiếu đã thu')}</th>
                <th scope="col">{filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}</th>
                <th scope="col" title="Số phiếu đã thu chia tổng số phiếu phải thu">
                  {filters.filterHeader('responseRate', 'Tỷ lệ phản hồi (%)')}
                </th>
                <th scope="col" title="Số phiếu hợp lệ chia số phiếu đã thu">
                  {filters.filterHeader('validResponseRate', 'Tỷ lệ phiếu hợp lệ (%)')}
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
                    <td className="num">{formatDecimal(section.responseRate, 3)}</td>
                    <td className="num">{formatDecimal(section.validResponseRate, 3)}</td>
                    <td className={zTierClass(section.zDepartment)}>
                      {formatDecimal(section.averageScore, 3)}
                    </td>
                    <td className="num">
                      {section.courseAverageScore === null
                        ? '—'
                        : formatDecimal(section.courseAverageScore, 3)}
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
                          {formatDecimal(section.differenceFromCourse, 3)}
                        </span>
                      )}
                    </td>
                    <td className={zTierClass(section.zSchool)}>
                      {section.zSchool === null
                        ? '—'
                        : formatSigned(section.zSchool)}
                    </td>
                    <td className={zTierClass(section.zFaculty)}>
                      {section.zFaculty === null
                        ? '—'
                        : formatSigned(section.zFaculty)}
                    </td>
                    <td className={zTierClass(section.zDepartment)}>
                      {section.zDepartment === null
                        ? '—'
                        : formatSigned(section.zDepartment)}
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
