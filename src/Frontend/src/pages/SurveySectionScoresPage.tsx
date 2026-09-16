import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronRight, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { useSemester } from '../context/semesterContext';
import { NoteModalButton } from '../components/NoteModalButton';
import { ExportDropdown } from '../components/ExportDropdown';
import { UpdateScoresButton } from '../components/UpdateScoresButton';
import { ScoringConfigNote } from '../components/ScoringConfigNote';
import { ApiError } from '../services/apiClient';
import type { ExportColumn, MultiSheetExportOptions } from '../services/exportDataService';
import { surveyApi, surveyErrorMessage } from '../services/surveyApi';
import type {
  QuestionSectionColumn,
  QuestionSectionScoreRow,
  SemesterSurveyQuestionSectionScores,
} from '../services/surveyApi';
import type { SemesterSurvey, SurveySectionKey } from '../types';
import { buildReportHash } from './reportRoute';
import '../styles/survey-operations.css';
import '../styles/survey-statistics.css';
import '../styles/catalogs.css';
import '../styles/survey-dashboard.css';

/*
  Trang "Thống kê theo mục". Lớp xử lý TẠM cho đợt khảo sát hiện tại: bộ đề gộp ba
  mục (học phần, giảng viên, cơ sở vật chất) vào một bài, nên điểm chung của lớp trộn
  lẫn ba chuyện khác nhau. Trang này tách điểm ra theo từng mục.

  Mỗi cấp là một trang riêng có đường dẫn riêng: khoa/viện → bộ môn → toàn bộ lớp học
  phần của bộ môn đó. Cả đợt chỉ tải một lần, chuyển trang không gọi lại API.

  Không sửa trang thống kê nào đang có; mọi con số chung ở đây khớp đúng các trang đó.
*/

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

// ------------------------------------------------------------------ Đường dẫn

type Level = 'faculty' | 'department' | 'section';

interface SectionScoresRoute {
  semesterId?: number;
  semesterSurveyId?: number;
  /** Mã khoa/viện, bộ môn trên đường dẫn; 'none' là nhóm chưa thuộc đơn vị nào. */
  facultyId?: string;
  departmentId?: string;
}

const routeRoot = 'survey-section-scores';
const idPattern = /^(\d+|none)$/;

/** Mã một cấp khi ghi lên đường dẫn: null ("Chưa thuộc khoa") ghi thành 'none'. */
const idSegment = (id: number | null) => (id === null ? 'none' : String(id));

function parseRoute(hash = window.location.hash): SectionScoresRoute {
  const [pathPart, queryPart = ''] = hash.replace(/^#\/?/, '').split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart);

  const positive = (value: string | null) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  };
  const segmentAfter = (name: string) => {
    const index = segments.indexOf(name);
    const value = index > 0 ? segments[index + 1] : undefined;
    return value && idPattern.test(value) ? value : undefined;
  };

  // Cấp dưới chỉ có nghĩa khi đủ các cấp trên.
  const facultyId = segmentAfter('faculty');
  const departmentId = facultyId ? segmentAfter('department') : undefined;

  return {
    semesterId: positive(query.get('semester')),
    semesterSurveyId: positive(query.get('campaign')),
    facultyId,
    departmentId,
  };
}

function buildHash(route: SectionScoresRoute): string {
  let path = `/${routeRoot}`;
  if (route.facultyId) {
    path += `/faculty/${route.facultyId}`;
    if (route.departmentId) path += `/department/${route.departmentId}`;
  }

  const query = new URLSearchParams();
  if (route.semesterId) query.set('semester', String(route.semesterId));
  if (route.semesterSurveyId) query.set('campaign', String(route.semesterSurveyId));
  const queryString = query.toString();
  return `#${path}${queryString ? `?${queryString}` : ''}`;
}

/** Liên kết sang trang khác của Thống kê theo mục. Ctrl/⌘ + bấm vẫn mở tab mới. */
function RouteLink({
  route,
  onNavigate,
  className,
  children,
}: {
  route: SectionScoresRoute;
  onNavigate: (route: SectionScoresRoute) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      className={className}
      href={buildHash(route)}
      onClick={(event) => {
        if (
          event.defaultPrevented
          || event.button !== 0
          || event.metaKey
          || event.ctrlKey
          || event.shiftKey
          || event.altKey
        ) {
          return;
        }
        event.preventDefault();
        onNavigate(route);
      }}
    >
      {children}
    </a>
  );
}

// ------------------------------------------------------------ Ô chọn đợt khảo sát

/*
  Ô chọn đợt khảo sát, viết riêng cho trang này — cùng kiểu với các trang thống kê
  khác. Kiểu dáng nhúng thẳng trong tệp: trang được nạp lười, phụ thuộc vào tệp .css
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

  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

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

// ------------------------------------------------------------ Hiển thị số liệu

const sectionScoresCss = `
.section-scores__crumbs {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  margin-bottom: 12px; font-size: 12px; color: #68737d;
}
.section-scores__crumbs a { color: #0788b8; text-decoration: none; }
.section-scores__crumbs a:hover { text-decoration: underline; }
.section-scores__crumbs strong { color: #20262c; }
.section-scores__link {
  display: inline-flex; align-items: center; gap: 4px;
  color: #0788b8; font-weight: 600; text-decoration: none;
}
.section-scores__link:hover { text-decoration: underline; }
.section-scores__total td { font-weight: 700; background: #f7f9fa; border-top: 1px solid #dfe4e8; }
`;

/**
 * Mục đang hiện trên trang. API vẫn tính sẵn cả mục cơ sở vật chất nhưng tạm chưa
 * cần xem; bật lại chỉ là thêm khoá vào đây.
 */
const visibleSectionKeys: readonly string[] = [
  'COURSE_CONTENT',
  'LECTURER',
] satisfies readonly SurveySectionKey[];

/** Cột chênh lệch chỉ có nghĩa khi đang hiện cả hai mục học phần và giảng viên. */
const showGap = visibleSectionKeys.includes('COURSE_CONTENT') && visibleSectionKeys.includes('LECTURER');

/** Nhãn ngắn cho tiêu đề cột; tên đầy đủ nằm ở chú thích khi rê chuột. */
const shortSectionLabels: Record<string, string> = {
  COURSE_CONTENT: 'Học phần',
  LECTURER: 'Giảng viên',
  FACILITIES: 'Cơ sở vật chất',
  OTHER: 'Mục khác',
};

const labelOf = (column: QuestionSectionColumn) =>
  shortSectionLabels[column.sectionKey] ?? column.sectionName;

const formatScore = (score: number | null | undefined) =>
  score === null || score === undefined ? '—' : score.toFixed(2);

const formatGap = (gap: number | null) =>
  gap === null ? '—' : `${gap > 0 ? '+' : ''}${gap.toFixed(2)}`;

const scoreOf = (row: QuestionSectionScoreRow, sectionKey: string) =>
  row.scores.find((item) => item.sectionKey === sectionKey)?.averageScore ?? null;

/**
 * Điểm mục giảng viên trừ điểm mục học phần của cùng một nhóm lớp. Dương nghĩa là
 * sinh viên đánh giá hoạt động giảng dạy cao hơn nội dung học phần.
 */
const gapOf = (row: QuestionSectionScoreRow): number | null => {
  const course = scoreOf(row, 'COURSE_CONTENT');
  const lecturer = scoreOf(row, 'LECTURER');
  return course === null || lecturer === null ? null : Math.round((lecturer - course) * 100) / 100;
};

const courseLabel = (row: QuestionSectionScoreRow) =>
  row.courseCode ? `${row.courseCode} — ${row.courseName}` : row.courseName;

const levelTexts: Record<Level, { title: string; nameHeader: string; totalLabel: string; hint: string | null }> = {
  faculty: {
    title: 'Điểm theo mục của các khoa / viện',
    nameHeader: 'Khoa / Viện',
    totalLabel: 'Toàn trường',
    hint: 'Bấm vào tên một khoa / viện để sang trang các bộ môn.',
  },
  department: {
    title: 'Điểm theo mục của các bộ môn',
    nameHeader: 'Bộ môn',
    totalLabel: 'Cả khoa / viện',
    hint: 'Bấm vào tên một bộ môn để sang trang toàn bộ lớp học phần của bộ môn đó.',
  },
  section: {
    title: 'Điểm theo mục của các lớp học phần',
    nameHeader: 'Lớp học phần',
    totalLabel: 'Cả bộ môn',
    hint: 'Bấm vào tên một lớp để sang trang kết quả khảo sát của lớp đó.',
  },
};

const nameOf = (row: QuestionSectionScoreRow, level: Level) =>
  level === 'faculty'
    ? row.facultyName
    : level === 'department'
      ? row.departmentName
      : row.sectionName;

const overallScoreNote =
  'Điểm tổng hợp tính trên cả bộ câu hỏi, gồm cả mục cơ sở vật chất đang ẩn, và gộp theo phiếu. Vì vậy điểm tổng hợp KHÔNG bằng trung bình cộng điểm các mục — đó là bình thường, không phải tính sai.';

const usageNotes = [
  'Điểm mục gộp từ điểm từng câu đã chốt ở lần bấm "Cập nhật điểm" gần nhất: chỉ tính phiếu hợp lệ, không tính câu bẫy. Đây cùng một lần chốt với mọi trang thống kê khác.',
  'Chỉ lớp đủ điều kiện tính điểm mới góp vào số liệu. Lớp chưa đủ phiếu không có mặt ở bất kỳ con số nào trên trang này.',
  'Mỗi mục gộp có trọng số theo số lượt trả lời: lớp nhiều phiếu nặng hơn lớp ít phiếu.',
  overallScoreNote,
];

// ------------------------------------------------------------------ Trang

export const SurveySectionScoresPage: React.FC = () => {
  const { academicYears, activeSemesterId } = useSemester();
  const [initialRoute] = useState(parseRoute);
  const [route, setRoute] = useState<SectionScoresRoute>(initialRoute);

  const [semesterId, setSemesterId] = useState<string>(
    initialRoute.semesterId
      ? String(initialRoute.semesterId)
      : activeSemesterId
        ? String(activeSemesterId)
        : ''
  );
  useEffect(() => {
    if (activeSemesterId && !parseRoute().semesterId) setSemesterId(String(activeSemesterId));
  }, [activeSemesterId]);

  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>([]);
  const [semesterSurveyId, setSemesterSurveyId] = useState<string>(
    initialRoute.semesterSurveyId ? String(initialRoute.semesterSurveyId) : ''
  );
  const [data, setData] = useState<SemesterSurveyQuestionSectionScores | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const applyRoute = useCallback((next: SectionScoresRoute) => {
    setRoute(next);
    if (next.semesterId) setSemesterId(String(next.semesterId));
    if (next.semesterSurveyId) setSemesterSurveyId(String(next.semesterSurveyId));
  }, []);

  const navigate = useCallback((next: SectionScoresRoute) => {
    window.history.pushState(null, '', buildHash(next));
    applyRoute(next);
  }, [applyRoute]);

  // Nút Back / Forward của trình duyệt và đường dẫn dán thẳng vào thanh địa chỉ.
  useEffect(() => {
    const handleRouteChange = () => applyRoute(parseRoute());
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
        // Giữ đợt đang xem nếu vẫn thuộc học kỳ, để đường dẫn mở lại đúng đợt.
        setSemesterSurveyId((current) =>
          current && next.some((item) => String(item.semesterSurveyId) === current)
            ? current
            : next.length > 0
              ? String(next[0].semesterSurveyId)
              : ''
        );
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

  const loadData = useCallback(async () => {
    if (!semesterSurveyId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      setData(await surveyApi.semesterSurveyQuestionSectionScores(Number(semesterSurveyId)));
      setLoadError(null);
    } catch (error) {
      setLoadError(messageFrom(error));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [semesterSurveyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  const visibleColumns = useMemo(
    () => (data?.columns ?? []).filter((column) => visibleSectionKeys.includes(column.sectionKey)),
    [data]
  );

  /** Học kỳ và đợt đang xem, gắn vào mọi đường dẫn sang trang khác. */
  const baseRoute: SectionScoresRoute = {
    semesterId: Number(semesterId) || undefined,
    semesterSurveyId: Number(semesterSurveyId) || undefined,
  };

  const surveyName =
    semesterSurveys.find((item) => String(item.semesterSurveyId) === semesterSurveyId)?.surveyName
    ?? 'hoc-phan';

  const buildExportOptions = (report: SemesterSurveyQuestionSectionScores): MultiSheetExportOptions => {
    type ExportLevel = 'school' | 'faculty' | 'department' | 'course' | 'section';

    const column = (value: ExportColumn<QuestionSectionScoreRow>) => value;
    const scoreColumn = (
      key: string,
      header: string,
      value: (row: QuestionSectionScoreRow) => number | null
    ) =>
      column({
        key,
        header,
        width: 14,
        type: 'number',
        align: 'right',
        numberFormat: '0.00',
        format: (_value, row) => value(row),
      });

    const facultyColumn = column({ key: 'facultyName', header: 'Khoa / Viện', width: 30 });
    const departmentColumn = column({ key: 'departmentName', header: 'Bộ môn', width: 30 });
    const courseColumns = [
      column({ key: 'courseCode', header: 'Mã học phần', width: 14 }),
      column({ key: 'courseName', header: 'Tên học phần', width: 34 }),
    ];
    const identityColumns: Record<ExportLevel, ExportColumn<QuestionSectionScoreRow>[]> = {
      school: [column({ key: 'facultyName', header: 'Phạm vi', width: 20 })],
      faculty: [facultyColumn],
      department: [facultyColumn, departmentColumn],
      course: [facultyColumn, departmentColumn, ...courseColumns],
      section: [
        facultyColumn,
        departmentColumn,
        ...courseColumns,
        column({ key: 'sectionName', header: 'Lớp học phần', width: 16 }),
        column({ key: 'lecturerName', header: 'Giảng viên', width: 28 }),
      ],
    };

    const columnsFor = (level: ExportLevel): ExportColumn<QuestionSectionScoreRow>[] => [
      ...identityColumns[level],
      ...(level === 'section'
        ? []
        : [column({ key: 'sectionCount', header: 'Số lớp', width: 10, type: 'number', align: 'right' })]),
      column({ key: 'validResponseCount', header: 'Phiếu hợp lệ', width: 13, type: 'number', align: 'right' }),
      ...visibleColumns.map((item) =>
        scoreColumn(`score-${item.sectionKey}`, `Điểm ${labelOf(item)}`, (row) =>
          scoreOf(row, item.sectionKey)
        )
      ),
      ...(showGap ? [scoreColumn('gap', 'Chênh lệch GV − HP', gapOf)] : []),
      scoreColumn('overallAverageScore', 'Điểm tổng hợp', (row) => row.overallAverageScore),
    ];

    return {
      fileName: `thong-ke-theo-muc-${surveyName}-${report.semesterName}-${report.academicYearName}`,
      metadata: {
        title: 'BÁO CÁO THỐNG KÊ THEO MỤC CÂU HỎI',
        subtitle: `${report.templateName} — ${report.semesterName} năm học ${report.academicYearName}`,
        subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
        info: {
          'Bộ câu hỏi': report.templateName,
          'Học kỳ': `${report.semesterName} · ${report.academicYearName}`,
          'Số lớp đã chốt điểm': report.school.sectionCount,
          'Số phiếu hợp lệ': report.school.validResponseCount,
        },
        summaryNotes: usageNotes,
      },
      sheets: [
        { sheetName: 'Toan truong', title: 'TOÀN TRƯỜNG', columns: columnsFor('school'), data: [report.school] },
        { sheetName: 'Theo khoa', title: 'THEO KHOA / VIỆN', columns: columnsFor('faculty'), data: report.faculties },
        { sheetName: 'Theo bo mon', title: 'THEO BỘ MÔN', columns: columnsFor('department'), data: report.departments },
        { sheetName: 'Theo hoc phan', title: 'THEO HỌC PHẦN', columns: columnsFor('course'), data: report.courses },
        {
          sheetName: 'Theo lop hoc phan',
          title: 'THEO LỚP HỌC PHẦN',
          columns: columnsFor('section'),
          data: report.courseSections,
        },
      ],
    };
  };

  return (
    <div className="survey-operations-page survey-statistics-page">
      <style>{sectionScoresCss}</style>

      <section className="statistics-toolbar">
        <label className="form-group">
          <span>Học kỳ</span>
          <select
            value={semesterId}
            onChange={(event) => {
              // Đổi học kỳ thì quay về trang khoa/viện của đợt đầu tiên trong kỳ.
              setSemesterSurveyId('');
              navigate({ semesterId: Number(event.target.value) || undefined });
              setSemesterId(event.target.value);
            }}
          >
            <option value="">Chọn học kỳ</option>
            {semesterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="form-group">
          <span>Đợt khảo sát</span>
          <CampaignSelect
            id="section-scores-campaign-select"
            value={semesterSurveyId}
            onChange={(value) =>
              // Đổi đợt thì quay về trang khoa/viện: khoa đang xem chưa chắc có trong đợt kia.
              navigate({ semesterId: Number(semesterId) || undefined, semesterSurveyId: Number(value) })
            }
            disabled={semesterSurveys.length === 0}
            placeholder={semesterSurveys.length === 0 ? 'Chưa có đợt nào' : 'Chọn đợt khảo sát'}
            options={semesterSurveys.map((survey) => ({
              value: String(survey.semesterSurveyId),
              label: `${survey.surveyName} · ${survey.sectionSurveyCount} lớp`,
            }))}
          />
        </div>

        <div className="statistics-toolbar-actions">
          {data && (
            <ExportDropdown
              buttonLabel="Xuất báo cáo"
              size="sm"
              options={() => buildExportOptions(data)}
            />
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void loadData()}
            disabled={!semesterSurveyId || loading}
          >
            <RefreshCw aria-hidden="true" size={16} />
            Tải lại
          </button>
          <UpdateScoresButton semesterSurveyId={semesterSurveyId} onUpdated={loadData} />
        </div>
      </section>

      <ScoringConfigNote />

      {loadError && (
        <div className="admin-alert" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="operations-empty" role="status">
          <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          <strong>Đang tổng hợp số liệu...</strong>
        </div>
      ) : !semesterSurveyId ? (
        <div className="operations-empty">
          <strong>Chọn học kỳ và đợt khảo sát để xem thống kê theo mục.</strong>
        </div>
      ) : data === null ? (
        <div className="operations-empty">
          <strong>Đợt này chưa có số liệu.</strong>
        </div>
      ) : data.school.sectionCount === 0 ? (
        <div className="operations-empty">
          <strong>Đợt này chưa có lớp nào được chốt điểm. Bấm "Cập nhật điểm" trước.</strong>
        </div>
      ) : (
        <SectionScoresLevel
          // Mỗi trang dựng lại từ đầu để vùng cuộn quay về đầu bảng.
          key={buildHash(route)}
          data={data}
          columns={visibleColumns}
          route={route}
          baseRoute={baseRoute}
          onNavigate={navigate}
        />
      )}
    </div>
  );
};

const SectionScoresLevel: React.FC<{
  data: SemesterSurveyQuestionSectionScores;
  columns: QuestionSectionColumn[];
  route: SectionScoresRoute;
  baseRoute: SectionScoresRoute;
  onNavigate: (route: SectionScoresRoute) => void;
}> = ({ data, columns, route, baseRoute, onNavigate }) => {
  const inFaculty = (row: QuestionSectionScoreRow) => idSegment(row.facultyId) === route.facultyId;
  const inDepartment = (row: QuestionSectionScoreRow) =>
    inFaculty(row) && idSegment(row.departmentId) === route.departmentId;

  const faculty = route.facultyId ? data.faculties.find(inFaculty) ?? null : null;
  const department = faculty && route.departmentId ? data.departments.find(inDepartment) ?? null : null;

  const facultyRoute: SectionScoresRoute = { ...baseRoute, facultyId: route.facultyId };
  const departmentRoute: SectionScoresRoute = { ...facultyRoute, departmentId: route.departmentId };

  // Đường dẫn trỏ tới một đơn vị không có trong đợt đang xem: dán link của đợt khác,
  // hoặc đơn vị chưa có lớp nào được chốt điểm.
  const notFound =
    (route.facultyId !== undefined && faculty === null)
    || (route.departmentId !== undefined && department === null);

  if (notFound) {
    return (
      <div className="operations-empty">
        <strong>Không có số liệu của đơn vị này trong đợt đang xem.</strong>
        <RouteLink route={baseRoute} onNavigate={onNavigate} className="section-scores__link">
          Về trang các khoa / viện
        </RouteLink>
      </div>
    );
  }

  const level: Level = department ? 'section' : faculty ? 'department' : 'faculty';
  const texts = levelTexts[level];

  // Bộ môn mở thẳng ra toàn bộ lớp học phần của bộ môn, không qua cấp học phần.
  const rows = department
    ? data.courseSections.filter(inDepartment)
    : faculty
      ? data.departments.filter(inFaculty)
      : data.faculties;

  const parent = department ?? faculty ?? data.school;

  const childRoute = (row: QuestionSectionScoreRow): SectionScoresRoute | null =>
    level === 'faculty'
      ? { ...baseRoute, facultyId: idSegment(row.facultyId) }
      : level === 'department'
        ? { ...facultyRoute, departmentId: idSegment(row.departmentId) }
        : null;

  const crumbs = [
    { label: 'Toàn trường', route: baseRoute },
    ...(faculty ? [{ label: faculty.facultyName, route: facultyRoute }] : []),
    ...(department ? [{ label: department.departmentName, route: departmentRoute }] : []),
  ];

  return (
    <div className="dashboard-report" tabIndex={0} aria-label={texts.title}>
      <section className="statistics-summary">
        <span className="summary-title">
          Thống kê theo mục — {data.semesterName} năm học {data.academicYearName}
        </span>
        <span>{data.templateName}</span>
        <NoteModalButton title="Cách đọc số liệu">
          <ul className="dashboard-notes">
            {usageNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </NoteModalButton>
      </section>

      <nav className="section-scores__crumbs" aria-label="Đường dẫn">
        {crumbs.map((crumb, index) => (
          <React.Fragment key={buildHash(crumb.route)}>
            {index > 0 && <ChevronRight aria-hidden="true" size={12} />}
            {index === crumbs.length - 1 ? (
              <strong aria-current="page">{crumb.label}</strong>
            ) : (
              <RouteLink route={crumb.route} onNavigate={onNavigate}>
                {crumb.label}
              </RouteLink>
            )}
          </React.Fragment>
        ))}
      </nav>

      <section className="dashboard-report-block">
        <h3 className="dashboard-report-title">{texts.title}</h3>
        {texts.hint && <p className="dashboard-report-note">{texts.hint}</p>}

        <div className="catalog-table-scroll" tabIndex={0} aria-label={texts.title}>
          <table className="catalog-table">
            <thead>
              <tr>
                <th scope="col">{texts.nameHeader}</th>
                {level === 'section' ? (
                  <>
                    <th scope="col">Học phần</th>
                    <th scope="col">Giảng viên</th>
                  </>
                ) : (
                  <th scope="col" className="num">Số lớp</th>
                )}
                <th scope="col" className="num">Phiếu hợp lệ</th>
                {columns.map((column) => (
                  <th
                    key={column.sectionKey}
                    scope="col"
                    className="num"
                    title={`${column.sectionName} · ${column.questionCount} câu`}
                  >
                    Điểm {labelOf(column)}
                  </th>
                ))}
                {showGap && (
                  <th scope="col" className="num" title="Điểm mục giảng viên trừ điểm mục học phần">
                    GV − HP
                  </th>
                )}
                <th scope="col" className="num" title="Cả bộ câu hỏi, gộp theo phiếu">
                  Điểm tổng hợp
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const target = childRoute(row);
                return (
                  <tr key={target ? buildHash(target) : `section-${row.courseSectionSurveyId}`}>
                    <td>
                      {target ? (
                        <RouteLink route={target} onNavigate={onNavigate} className="section-scores__link">
                          {nameOf(row, level)}
                          <ChevronRight aria-hidden="true" size={14} />
                        </RouteLink>
                      ) : row.courseSectionSurveyId ? (
                        // Lớp học phần mở trang kết quả của lớp ở Thống kê & Báo cáo, kèm
                        // học kỳ và đợt đang xem. Liên kết thật nên Back và Ctrl + bấm
                        // vẫn dùng được.
                        <a
                          className="section-scores__link"
                          href={buildReportHash({
                            screen: 'survey',
                            surveyId: row.courseSectionSurveyId,
                            semesterId: baseRoute.semesterId,
                            semesterSurveyId: baseRoute.semesterSurveyId,
                          })}
                          title={`Xem kết quả ${courseLabel(row)} (${row.sectionName})`}
                        >
                          {nameOf(row, level)}
                          <ChevronRight aria-hidden="true" size={14} />
                        </a>
                      ) : (
                        <span className="catalog-cell-primary">{nameOf(row, level)}</span>
                      )}
                    </td>
                    {level === 'section' ? (
                      <>
                        <td>{courseLabel(row)}</td>
                        <td>{row.lecturerName}</td>
                      </>
                    ) : (
                      <td className="num">{row.sectionCount.toLocaleString('vi-VN')}</td>
                    )}
                    <td className="num">{row.validResponseCount.toLocaleString('vi-VN')}</td>
                    {columns.map((column) => (
                      <td key={column.sectionKey} className="num">
                        {formatScore(scoreOf(row, column.sectionKey))}
                      </td>
                    ))}
                    {showGap && <td className="num">{formatGap(gapOf(row))}</td>}
                    <td className="num">{formatScore(row.overallAverageScore)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="section-scores__total">
                {level === 'section' ? (
                  <td colSpan={3}>
                    {texts.totalLabel} · {parent.sectionCount.toLocaleString('vi-VN')} lớp
                  </td>
                ) : (
                  <>
                    <td>{texts.totalLabel}</td>
                    <td className="num">{parent.sectionCount.toLocaleString('vi-VN')}</td>
                  </>
                )}
                <td className="num">{parent.validResponseCount.toLocaleString('vi-VN')}</td>
                {columns.map((column) => (
                  <td key={column.sectionKey} className="num">
                    {formatScore(scoreOf(parent, column.sectionKey))}
                  </td>
                ))}
                {showGap && <td className="num">{formatGap(gapOf(parent))}</td>}
                <td className="num">{formatScore(parent.overallAverageScore)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="dashboard-report-note">{overallScoreNote}</p>
      </section>
    </div>
  );
};
