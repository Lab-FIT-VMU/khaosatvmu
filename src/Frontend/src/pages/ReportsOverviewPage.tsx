import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  MessageSquareText,
  Network,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/authContext';
import { canAccessTab, TAB_PERMISSION } from '../auth/modulePermissions';
import { useSemester } from '../context/semesterContext';
import { seesAllData } from '../auth/roles';
import { useSurveyPublication } from '../hooks/useSurveyPublication';
import { useSetBreadcrumbTrail } from '../context/breadcrumbTrail';
import { DataTable, type Column, type DataTableSortDirection } from '../components/DataTable';
import { QuestionAnalysisChart } from '../components/QuestionAnalysisChart';
import { SchoolSurveyOverview } from '../components/reports/SchoolSurveyOverview';
import { ScopeAnalysisDetail, type ScopeSelection } from '../components/reports/ScopeAnalysisDetail';
import { OpenCommentAnalysis } from '../components/reports/OpenCommentAnalysis';
import { UpdateScoresButton } from '../components/UpdateScoresButton';
import { ScoringConfigNote } from '../components/ScoringConfigNote';
import { SectionSurveyResponsesPage } from './SectionSurveyResponsesPage';
import { catalogApi } from '../services/catalogApi';
import type { ExportColumn, ExportSheet, ExportTable } from '../services/exportDataService';
import { generateQuestionChartImage, getScoreRatingText } from '../services/exportQuestionAnalysisService';
import { reportApi } from '../services/reportApi';
import { surveyApi, surveyErrorMessage } from '../services/surveyApi';
import {
  buildReportHash,
  parseReportRoute,
  type ReportAnalysisView,
  type ReportRouteState,
  type ReportResultSortKey,
  type ReportScopeType,
  type ReportWorkspace,
  type UnidentifiedLecturerRef,
} from './reportRoute';
import type {
  Department,
  Faculty,
  Course,
  Lecturer,
  LecturerPerformanceReport,
  OptionCount,
  QuestionRating,
  SemesterSurvey,
  SurveyResultDetail,
} from '../types';
import {
  getActiveSemesterSurveyId,
  selectAvailableSemesterSurveyId,
  setActiveSemesterSurveyId,
} from '../utils/surveySelection';
import { useScoringThresholds } from '../hooks/useScoringThresholds';
import {
  COMPLETED_COMPLETION_RATE,
  LAGGING_COMPLETION_RATE,
  hasEnoughResponsesToScore,
  responseRateOf,
  validRateOf,
} from '../utils/reportThresholds';
import { toVietnameseFileSlug } from '../utils/vietnamese';
import type { QuestionAnalysisExportMetadata } from '../services/exportQuestionAnalysisService';
import '../styles/survey-operations.css';
import '../styles/reports.css';
// Thanh chọn học kỳ / đợt dùng .statistics-toolbar nằm trong tệp này.
import '../styles/survey-statistics.css';
import '../styles/catalogs.css';
import { formatDecimal, formatPercent, formatSigned } from '../utils/formatNumber';

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

/** Một đơn vị (Khoa hoặc Bộ môn) gộp từ kết quả để xếp hạng. */
interface RankedUnit {
  id: number;
  name: string;
  /** Khoa chủ quản — với dòng Khoa thì trùng chính id, dùng để bảng Bộ môn bám theo. */
  facultyId: number;
  /** Tên khoa chủ quản, hiện ở cột Khoa / Viện của bảng Bộ môn và bảng Học phần. */
  facultyName: string;
  classSize: number;
  /** Mọi lượt nộp, kể cả phiếu bị bộ lọc nhiễu loại. */
  responseCount: number;
  validResponseCount: number;
  invalidResponseCount: number;
  /** Tỷ lệ phản hồi: số phiếu đã thu ÷ tổng số phiếu phải thu, giống bảng tra cứu chi tiết. */
  responseRate: number;
  /** Tỷ lệ phiếu hợp lệ: số phiếu hợp lệ ÷ số phiếu đã thu. */
  validRate: number;
  averageScore: number;
  sectionCount: number;
}

interface RankedCourse extends RankedUnit {
  code: string;
  departmentName: string;
}

const scoreColor = (score: number): string =>
  score >= 4.5 ? '#137b3b' : score >= 4.0 ? '#0788b8' : '#b86216';

const completionColor = (rate: number): string =>
  rate >= COMPLETED_COMPLETION_RATE
    ? '#137b3b'
    : rate >= LAGGING_COMPLETION_RATE
      ? '#0788b8'
      : '#b86216';

/**
 * Bảng xếp hạng đã mở ra một phạm vi — đích của nút Quay lại ở trang chi tiết.
 * Trang này vốn lùi bằng cách trỏ về màn hình cố định chứ không dựa vào lịch sử
 * trình duyệt, nên nút Quay lại cũng theo đúng lối đó.
 */
const scopeParentWorkspace = (type?: ReportScopeType): ReportWorkspace => {
  if (type === 'faculty') return 'faculties';
  if (type === 'department') return 'departments';
  return 'courses';
};

/** Số dòng mỗi trang của ba bảng xếp hạng — cùng một mức cho cả ba, không lệch nhau. */
const rankedPageSize = 20;

/*
  Đường dẫn điều hướng in ở dòng thứ hai của tệp xuất, đi từ gốc hệ thống xuống tới
  đúng chỗ có số liệu — cùng lối với thanh trên cùng của web.

  Khai thành hằng ở cấp module để giữ nguyên tham chiếu mảng: nhét thẳng vào deps của
  useMemo mà mỗi lần render lại tạo mảng mới thì bảng dựng lại cấu hình xuất vô ích.
*/
const reportRootBreadcrumb = ['Thống kê & Báo cáo'];
const facultyTabBreadcrumb = [...reportRootBreadcrumb, 'Theo Khoa/Viện'];
const departmentTabBreadcrumb = [...reportRootBreadcrumb, 'Theo Bộ môn'];
const courseTabBreadcrumb = [...reportRootBreadcrumb, 'Theo Học phần'];
const detailsTabBreadcrumb = [...reportRootBreadcrumb, 'Tra cứu chi tiết'];

/** Tên tab, dùng cho cả đường dẫn trên thanh trên cùng lẫn tệp xuất. */
const workspaceLabels: Record<ReportWorkspace, string> = {
  overview: 'Tổng quan',
  faculties: 'Theo Khoa/Viện',
  departments: 'Theo Bộ môn',
  courses: 'Theo Học phần',
  comments: 'Phân tích ý kiến mở',
  details: 'Tra cứu chi tiết',
};

/** Thứ tự tab trên thanh tab; tab đầu tiên được phép là nơi đáp khi tab đang mở bị khoá. */
const REPORT_WORKSPACE_ORDER: readonly ReportWorkspace[] = [
  'overview',
  'faculties',
  'departments',
  'courses',
  'comments',
  'details',
];

/** Ba tab con trong tab Tổng quan, cùng thứ tự trên màn hình. */
const REPORT_ANALYSIS_VIEW_ORDER: readonly ReportAnalysisView[] = ['faculties', 'quality', 'criteria'];

/*
  Ba bảng xếp hạng khai cột RIÊNG, không dùng chung một hàm sinh cột nữa.

  Trước đây cả ba đi qua `rankMetricColumns` nên đổi bề rộng một cột của bảng này
  là đụng luôn hai bảng kia, phải nghĩ qua một lớp "bộ bề rộng" trung gian mới sửa
  được. Cột của ba bảng gần giống nhau nhưng số cột định danh khác nhau (1, 2 và 4)
  nên chỗ cần chỉnh tay cũng khác nhau. Viết thẳng ra từng bảng: dài hơn, nhưng sửa
  một bảng thì chỉ bảng đó đổi.

  Bề rộng mỗi bảng cộng đúng 100%.
*/

/** Bảng Theo Khoa/Viện: 1 cột định danh + 8 cột số + Thao tác. */
const facultyRankColumns = (onOpenDetail?: (id: number) => void): Column<RankedUnit>[] => [
  {
    key: 'name',
    header: 'Khoa / Viện',
    width: '25%',
    sortValue: (item) => item.name,
    filterValue: (item) => item.name,
    render: (item) => <span className="catalog-cell-primary">{item.name}</span>,
  },
  {
    key: 'sectionCount',
    header: 'Số lớp',
    width: '6%',
    numeric: true,
    sortValue: (item) => item.sectionCount,
    filterValue: (item) => String(item.sectionCount),
    render: (item) => <span className="catalog-cell-number">{item.sectionCount}</span>,
  },
  {
    key: 'classSize',
    header: 'Tổng số phiếu phải thu',
    width: '6%',
    numeric: true,
    sortValue: (item) => item.classSize,
    filterValue: (item) => String(item.classSize),
    render: (item) => <span className="catalog-cell-number">{item.classSize}</span>,
  },
  {
    key: 'responseCount',
    header: 'Số phiếu đã thu',
    width: '9%',
    numeric: true,
    sortValue: (item) => item.responseCount,
    filterValue: (item) => String(item.responseCount),
    render: (item) => <span className="catalog-cell-number">{item.responseCount}</span>,
  },
  {
    key: 'validResponseCount',
    header: 'Số phiếu hợp lệ',
    width: '9%',
    numeric: true,
    sortValue: (item) => item.validResponseCount,
    filterValue: (item) => String(item.validResponseCount),
    render: (item) => <span className="catalog-cell-number">{item.validResponseCount}</span>,
  },
  {
    key: 'invalidResponseCount',
    header: 'Số phiếu không hợp lệ',
    width: '10%',
    numeric: true,
    sortValue: (item) => item.invalidResponseCount,
    filterValue: (item) => String(item.invalidResponseCount),
    render: (item) => (
      <span
        className={item.invalidResponseCount > 0
          ? 'catalog-cell-number reports-invalid-count'
          : 'catalog-cell-number'}
      >
        {item.invalidResponseCount}
      </span>
    ),
  },
  {
    key: 'responseRate',
    header: 'Tỷ lệ phản hồi (%)',
    width: '10%',
    numeric: true,
    sortValue: (item) => item.responseRate,
    filterValue: (item) => `${formatDecimal(item.responseRate, 3)}`,
    render: (item) => (
      <span
        className="catalog-cell-number"
        style={{ color: completionColor(item.responseRate), fontWeight: 700 }}
      >
        {formatDecimal(item.responseRate, 3)}
      </span>
    ),
  },
  {
    key: 'validRate',
    header: 'Tỷ lệ phiếu hợp lệ (%)',
    width: '10%',
    numeric: true,
    sortValue: (item) => item.validRate,
    filterValue: (item) => `${formatDecimal(item.validRate, 3)}`,
    render: (item) => <span className="catalog-cell-number">{formatDecimal(item.validRate, 3)}</span>,
  },
  {
    key: 'averageScore',
    header: 'Điểm trung bình',
    width: '8%',
    numeric: true,
    sortValue: (item) => item.averageScore,
    filterValue: (item) => formatDecimal(item.averageScore, 3),
    render: (item) => (
      <span className="reports-rank-score" style={{ color: scoreColor(item.averageScore) }}>
        {item.averageScore > 0 ? formatDecimal(item.averageScore, 3) : '—'}
      </span>
    ),
  },
  ...(onOpenDetail ? [{
    key: 'actions',
    header: 'Thao tác',
    align: 'center',
    width: '7%',
    render: (item: RankedUnit) => (
      <button
        type="button"
        className="btn btn-secondary btn-sm reports-row-action"
        onClick={() => onOpenDetail(item.id)}
      >
        <ClipboardList className="operation-icon" aria-hidden="true" />
        Xem KQ
      </button>
    ),
  }] : []),
];

/** Bảng xếp hạng đơn vị: cột tỷ lệ phần trăm dùng chung một cách định dạng. */
const percentExportColumn = (
  key: string,
  header: string,
  width: number,
): ExportColumn<RankedUnit> => ({
  key,
  header,
  width,
  type: 'string',
  align: 'right',
  // formatDecimal dùng dấu phẩy thập phân theo vi-VN, đúng như ô trên màn hình;
  // đơn vị % nằm ở tiêu đề cột.
  format: (val: any) => formatDecimal(Number(val), 3),
});

const facultyRankExportColumns: ExportColumn<RankedUnit>[] = [
  { key: 'name', header: 'Khoa / Viện', width: 28 },
  { key: 'sectionCount', header: 'Số lớp', width: 12, type: 'number', align: 'right' },
  { key: 'classSize', header: 'Tổng số phiếu phải thu', width: 10, type: 'number', align: 'right' },
  { key: 'responseCount', header: 'Số phiếu đã thu', width: 16, type: 'number', align: 'right' },
  { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 14, type: 'number', align: 'right' },
  { key: 'invalidResponseCount', header: 'Số phiếu không hợp lệ', width: 18, type: 'number', align: 'right' },
  percentExportColumn('responseRate', 'Tỷ lệ phản hồi (%)', 14),
  percentExportColumn('validRate', 'Tỷ lệ phiếu hợp lệ (%)', 16),
  {
    key: 'averageScore',
    header: 'Điểm trung bình',
    width: 14,
    type: 'number',
    align: 'right',
    format: (val: any) => (Number(val) > 0 ? Number(val).toFixed(3) : '—'),
  },
];

/** Bảng Theo Bộ môn: 2 cột định danh + 8 cột số + Thao tác. */
const departmentRankColumns = (onOpenDetail?: (id: number) => void): Column<RankedUnit>[] => [
  {
    key: 'facultyName',
    header: 'Khoa / Viện',
    width: '16%',
    sortValue: (item) => item.facultyName,
    filterValue: (item) => item.facultyName,
    render: (item) => <span className="catalog-cell-primary">{item.facultyName}</span>,
  },
  {
    key: 'name',
    header: 'Bộ môn',
    width: '18%',
    sortValue: (item) => item.name,
    filterValue: (item) => item.name,
    render: (item) => <span className="catalog-cell-primary">{item.name}</span>,
  },
  {
    key: 'sectionCount',
    header: 'Số lớp',
    width: '5%',
    numeric: true,
    sortValue: (item) => item.sectionCount,
    filterValue: (item) => String(item.sectionCount),
    render: (item) => <span className="catalog-cell-number">{item.sectionCount}</span>,
  },
  {
    key: 'classSize',
    header: 'Tổng số phiếu phải thu',
    width: '6%',
    numeric: true,
    sortValue: (item) => item.classSize,
    filterValue: (item) => String(item.classSize),
    render: (item) => <span className="catalog-cell-number">{item.classSize}</span>,
  },
  {
    key: 'responseCount',
    header: 'Số phiếu đã thu',
    width: '8%',
    numeric: true,
    sortValue: (item) => item.responseCount,
    filterValue: (item) => String(item.responseCount),
    render: (item) => <span className="catalog-cell-number">{item.responseCount}</span>,
  },
  {
    key: 'validResponseCount',
    header: 'Số phiếu hợp lệ',
    width: '8%',
    numeric: true,
    sortValue: (item) => item.validResponseCount,
    filterValue: (item) => String(item.validResponseCount),
    render: (item) => <span className="catalog-cell-number">{item.validResponseCount}</span>,
  },
  {
    key: 'invalidResponseCount',
    header: 'Số phiếu không hợp lệ',
    width: '8%',
    numeric: true,
    sortValue: (item) => item.invalidResponseCount,
    filterValue: (item) => String(item.invalidResponseCount),
    render: (item) => (
      <span
        className={item.invalidResponseCount > 0
          ? 'catalog-cell-number reports-invalid-count'
          : 'catalog-cell-number'}
      >
        {item.invalidResponseCount}
      </span>
    ),
  },
  {
    key: 'responseRate',
    header: 'Tỷ lệ phản hồi (%)',
    width: '8%',
    numeric: true,
    sortValue: (item) => item.responseRate,
    filterValue: (item) => `${formatDecimal(item.responseRate, 3)}`,
    render: (item) => (
      <span
        className="catalog-cell-number"
        style={{ color: completionColor(item.responseRate), fontWeight: 700 }}
      >
        {formatDecimal(item.responseRate, 3)}
      </span>
    ),
  },
  {
    key: 'validRate',
    header: 'Tỷ lệ phiếu hợp lệ (%)',
    width: '8%',
    numeric: true,
    sortValue: (item) => item.validRate,
    filterValue: (item) => `${formatDecimal(item.validRate, 3)}`,
    render: (item) => <span className="catalog-cell-number">{formatDecimal(item.validRate, 3)}</span>,
  },
  {
    key: 'averageScore',
    header: 'Điểm trung bình',
    width: '8%',
    numeric: true,
    sortValue: (item) => item.averageScore,
    filterValue: (item) => formatDecimal(item.averageScore, 3),
    render: (item) => (
      <span className="reports-rank-score" style={{ color: scoreColor(item.averageScore) }}>
        {item.averageScore > 0 ? formatDecimal(item.averageScore, 3) : '—'}
      </span>
    ),
  },
  ...(onOpenDetail ? [{
    key: 'actions',
    header: 'Thao tác',
    align: 'center',
    width: '7%',
    render: (item: RankedUnit) => (
      <button
        type="button"
        className="btn btn-secondary btn-sm reports-row-action"
        onClick={() => onOpenDetail(item.id)}
      >
        <ClipboardList className="operation-icon" aria-hidden="true" />
        Xem KQ
      </button>
    ),
  }] : []),
];

const departmentRankExportColumns: ExportColumn<RankedUnit>[] = [
  { key: 'facultyName', header: 'Khoa / Viện', width: 26 },
  { key: 'name', header: 'Bộ môn', width: 28 },
  { key: 'sectionCount', header: 'Số lớp', width: 12, type: 'number', align: 'right' },
  { key: 'classSize', header: 'Tổng số phiếu phải thu', width: 10, type: 'number', align: 'right' },
  { key: 'responseCount', header: 'Số phiếu đã thu', width: 16, type: 'number', align: 'right' },
  { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 14, type: 'number', align: 'right' },
  { key: 'invalidResponseCount', header: 'Số phiếu không hợp lệ', width: 18, type: 'number', align: 'right' },
  percentExportColumn('responseRate', 'Tỷ lệ phản hồi (%)', 14),
  percentExportColumn('validRate', 'Tỷ lệ phiếu hợp lệ (%)', 16),
  {
    key: 'averageScore',
    header: 'Điểm trung bình',
    width: 14,
    type: 'number',
    align: 'right',
    format: (val: any) => (Number(val) > 0 ? Number(val).toFixed(3) : '—'),
  },
];

interface RankedUnitTableProps {
  title: string;
  data: RankedUnit[];
  /** Danh từ đếm trong tiêu đề, ví dụ "khoa/viện". */
  itemLabel: string;
  columns: Column<RankedUnit>[];
  exportColumns: ExportColumn<RankedUnit>[];
  exportTitle: string;
  exportFileName: string;
  /** Tên sheet đầu tiên trong tệp xuất. */
  exportSheetName: string;
  /** Đường dẫn điều hướng in ở dòng thứ hai của tệp xuất. */
  breadcrumb: string[];
  /**
   * Dựng thêm các sheet sau sheet đầu — mỗi khoa/viện một sheet chẳng hạn. Hàm chỉ
   * chạy lúc bấm xuất vì phải lấy thêm số liệu chi tiết từ API, và nhận đúng những
   * dòng đang hiển thị trên bảng để tệp xuất không lệch với màn hình.
   */
  buildExtraSheets?: (rows: RankedUnit[]) => Promise<ExportSheet<any>[]>;
  onVisibleDataChange?: (rows: RankedUnit[]) => void;
}

/** Khung chung của hai bảng xếp hạng đơn vị; cột do trang truyền vào. */
const RankedUnitTable: React.FC<RankedUnitTableProps> = ({
  title,
  data,
  itemLabel,
  columns,
  exportColumns,
  exportTitle,
  exportFileName,
  exportSheetName,
  breadcrumb,
  buildExtraSheets,
  onVisibleDataChange,
}) => {
  // Bảng tự báo ra số dòng còn lại sau tìm kiếm và lọc cột; giữ lại để sheet đầu của
  // tệp xuất đúng bằng những gì đang nhìn thấy.
  const [visibleRows, setVisibleRows] = useState<RankedUnit[]>(data);
  const handleVisibleDataChange = useCallback((rows: RankedUnit[]) => {
    setVisibleRows(rows);
    onVisibleDataChange?.(rows);
  }, [onVisibleDataChange]);

  const exportConfig = useMemo(() => {
    const notes = [
      'Tỷ lệ phản hồi = Số phiếu đã thu ÷ Tổng số phiếu phải thu.',
      'Tỷ lệ phiếu hợp lệ = Số phiếu hợp lệ ÷ Số phiếu đã thu.',
      'Số phiếu không hợp lệ là phiếu bị bộ lọc nhiễu loại, không tham gia tính điểm.',
      'Chỉ gộp các lớp học phần đủ điều kiện tính điểm.',
    ];

    if (buildExtraSheets) {
      return {
        title: exportTitle,
        fileName: exportFileName,
        breadcrumb,
        summaryNotes: notes,
        // Sheet đầu vẫn là bảng xếp hạng như đang hiển thị; các sheet sau do trang
        // dựng thêm, mỗi đơn vị một sheet.
        sheets: async (): Promise<ExportSheet<any>[]> => {
          const summarySheet: ExportSheet<RankedUnit> = {
            sheetName: exportSheetName,
            title: exportTitle,
            breadcrumb,
            columns: exportColumns,
            data: visibleRows,
            summaryNotes: notes,
          };
          return [summarySheet, ...(await buildExtraSheets(visibleRows))];
        },
      };
    }

    return {
      title: exportTitle,
      fileName: exportFileName,
      breadcrumb,
      summaryNotes: notes,
      columns: exportColumns,
    };
  }, [
    breadcrumb,
    buildExtraSheets,
    exportColumns,
    exportFileName,
    exportSheetName,
    exportTitle,
    visibleRows,
  ]);

  return (
    <section className="reports-rank" aria-label={title}>
      <header className="reports-rank-header">
        <span className="reports-rank-title">
          <h3>{title} ({data.length} {itemLabel})</h3>
        </span>
      </header>
      <DataTable
        columns={columns}
        data={data}
        keyExtractor={(item) => String(item.id)}
        onVisibleDataChange={handleVisibleDataChange}
        showIndex={false}
        pageSize={rankedPageSize}
        exportConfig={exportConfig}
        emptyMessage="Chưa có dữ liệu tổng hợp."
      />
    </section>
  );
};

/** Bảng Theo Học phần: 4 cột định danh + 8 cột số + Thao tác. */
const RankedCourseTable: React.FC<{
  data: RankedCourse[];
  breadcrumb: string[];
  onOpenDetail: (id: number) => void;
}> = ({ data, breadcrumb, onOpenDetail }) => {
  const columns: Column<RankedCourse>[] = [
    {
      key: 'facultyName',
      header: 'Khoa / Viện',
      width: '14%',
      sortValue: (item) => item.facultyName,
      filterValue: (item) => item.facultyName,
      render: (item) => <span className="catalog-cell-primary">{item.facultyName}</span>,
    },
    {
      key: 'departmentName',
      header: 'Bộ môn',
      width: '15%',
      sortValue: (item) => item.departmentName,
      filterValue: (item) => item.departmentName,
      render: (item) => <span className="catalog-cell-primary">{item.departmentName}</span>,
    },
    {
      key: 'name',
      header: 'Học phần',
      width: '15%',
      sortValue: (item) => item.name,
      filterValue: (item) => item.name,
      render: (item) => <span className="catalog-cell-primary">{item.name}</span>,
    },
    {
      key: 'code',
      header: 'Mã học phần',
      width: '5%',
      sortValue: (item) => item.code,
      filterValue: (item) => item.code,
      render: (item) => <span className="catalog-cell-primary">{item.code}</span>,
    },
    {
      key: 'sectionCount',
      header: 'Số lớp',
      width: '4%',
      numeric: true,
      sortValue: (item) => item.sectionCount,
      filterValue: (item) => String(item.sectionCount),
      render: (item) => <span className="catalog-cell-number">{item.sectionCount}</span>,
    },
    {
      key: 'classSize',
      header: 'Tổng số phiếu phải thu',
      width: '4%',
      numeric: true,
      sortValue: (item) => item.classSize,
      filterValue: (item) => String(item.classSize),
      render: (item) => <span className="catalog-cell-number">{item.classSize}</span>,
    },
    {
      key: 'responseCount',
      header: 'Số phiếu đã thu',
      width: '6%',
      numeric: true,
      sortValue: (item) => item.responseCount,
      filterValue: (item) => String(item.responseCount),
      render: (item) => <span className="catalog-cell-number">{item.responseCount}</span>,
    },
    {
      key: 'validResponseCount',
      header: 'Số phiếu hợp lệ',
      width: '6%',
      numeric: true,
      sortValue: (item) => item.validResponseCount,
      filterValue: (item) => String(item.validResponseCount),
      render: (item) => <span className="catalog-cell-number">{item.validResponseCount}</span>,
    },
    {
      key: 'invalidResponseCount',
      header: 'Số phiếu không hợp lệ',
      width: '6%',
      numeric: true,
      sortValue: (item) => item.invalidResponseCount,
      filterValue: (item) => String(item.invalidResponseCount),
      render: (item) => (
        <span
          className={item.invalidResponseCount > 0
            ? 'catalog-cell-number reports-invalid-count'
            : 'catalog-cell-number'}
        >
          {item.invalidResponseCount}
        </span>
      ),
    },
    {
      key: 'responseRate',
      header: 'Tỷ lệ phản hồi (%)',
      width: '6%',
      numeric: true,
      sortValue: (item) => item.responseRate,
      filterValue: (item) => `${formatDecimal(item.responseRate, 3)}`,
      render: (item) => (
        <span
          className="catalog-cell-number"
          style={{ color: completionColor(item.responseRate), fontWeight: 700 }}
        >
          {formatDecimal(item.responseRate, 3)}
        </span>
      ),
    },
    {
      key: 'validRate',
      header: 'Tỷ lệ phiếu hợp lệ (%)',
      width: '6%',
      numeric: true,
      sortValue: (item) => item.validRate,
      filterValue: (item) => `${formatDecimal(item.validRate, 3)}`,
      render: (item) => <span className="catalog-cell-number">{formatDecimal(item.validRate, 3)}</span>,
    },
    {
      key: 'averageScore',
      header: 'Điểm trung bình',
      width: '6%',
      numeric: true,
      sortValue: (item) => item.averageScore,
      filterValue: (item) => formatDecimal(item.averageScore, 3),
      render: (item) => (
        <span className="reports-rank-score" style={{ color: scoreColor(item.averageScore) }}>
          {item.averageScore > 0 ? formatDecimal(item.averageScore, 3) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'center',
      width: '7 %',
      render: (item) => (
        <button
          type="button"
          className="btn btn-secondary btn-sm reports-row-action"
          onClick={() => onOpenDetail(item.id)}
        >
          <ClipboardList className="operation-icon" aria-hidden="true" />
          Xem KQ
        </button>
      ),
    },
  ];

  const exportConfig = useMemo(() => ({
    title: 'BÁO CÁO XẾP HẠNG KẾT QUẢ THEO HỌC PHẦN',
    fileName: 'xep-hang-hoc-phan',
    breadcrumb,
    summaryNotes: [
      'Tỷ lệ phản hồi = Số phiếu đã thu ÷ Tổng số phiếu phải thu.',
      'Tỷ lệ phiếu hợp lệ = Số phiếu hợp lệ ÷ Số phiếu đã thu.',
      'Số phiếu không hợp lệ là phiếu bị bộ lọc nhiễu loại, không tham gia tính điểm.',
      'Chỉ gộp các lớp học phần đủ điều kiện tính điểm.',
    ],
    columns: [
      { key: 'facultyName', header: 'Khoa / Viện', width: 24 },
      { key: 'departmentName', header: 'Bộ môn', width: 24 },
      { key: 'name', header: 'Học phần', width: 32 },
      { key: 'code', header: 'Mã học phần', width: 14 },
      { key: 'sectionCount', header: 'Số lớp', width: 12, type: 'number' as const, align: 'right' as const },
      { key: 'classSize', header: 'Tổng số phiếu phải thu', width: 10, type: 'number' as const, align: 'right' as const },
      { key: 'responseCount', header: 'Số phiếu đã thu', width: 16, type: 'number' as const, align: 'right' as const },
      { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 14, type: 'number' as const, align: 'right' as const },
      { key: 'invalidResponseCount', header: 'Số phiếu không hợp lệ', width: 18, type: 'number' as const, align: 'right' as const },
      {
        key: 'responseRate',
        header: 'Tỷ lệ phản hồi (%)',
        width: 14,
        type: 'string' as const,
        align: 'right' as const,
        format: (val: any) => formatDecimal(Number(val), 3),
      },
      {
        key: 'validRate',
        header: 'Tỷ lệ phiếu hợp lệ (%)',
        width: 16,
        type: 'string' as const,
        align: 'right' as const,
        format: (val: any) => formatDecimal(Number(val), 3),
      },
      {
        key: 'averageScore',
        header: 'Điểm trung bình',
        width: 14,
        type: 'number' as const,
        align: 'right' as const,
        format: (val: any) => (Number(val) > 0 ? Number(val).toFixed(3) : '—'),
      },
    ],
  }), [breadcrumb]);

  return (
    <section className="reports-rank" aria-label="Kết quả theo Học phần">
      <header className="reports-rank-header">
        <span className="reports-rank-title"><h3>Kết quả theo Học phần ({data.length} học phần)</h3></span>
      </header>
      <DataTable
        columns={columns}
        data={data}
        keyExtractor={(item) => String(item.id)}
        showIndex={false}
        pageSize={rankedPageSize}
        exportConfig={exportConfig}
        emptyMessage="Chưa có học phần nào đủ điều kiện tính điểm."
      />
    </section>
  );
};
export const ReportsOverviewPage: React.FC = () => {
  const initialRoute = useMemo(() => parseReportRoute(), []);
  const thresholds = useScoringThresholds();
  const { access, activeProfile } = useAuth();
  const {
    academicYears,
    activeSemesterId,
  } = useSemester();
  const [selectedSemesterId, setSelectedSemesterId] = useState<number | undefined>(
    () => initialRoute.semesterId ?? activeSemesterId ?? undefined
  );
  const previousActiveSemesterId = useRef(activeSemesterId);
  const preserveInitialRouteSemester = useRef(initialRoute.semesterId !== undefined);

  // Khi học kỳ làm việc toàn cục (Header) thay đổi, cập nhật bộ lọc trang theo
  useEffect(() => {
    if (preserveInitialRouteSemester.current) {
      previousActiveSemesterId.current = activeSemesterId;
      if (activeSemesterId !== null && activeSemesterId !== undefined) {
        preserveInitialRouteSemester.current = false;
      }
      return;
    }
    const activeSemesterChanged = previousActiveSemesterId.current !== activeSemesterId;
    previousActiveSemesterId.current = activeSemesterId;
    if (activeSemesterChanged && activeSemesterId !== null && activeSemesterId !== undefined) {
      setSelectedSemesterId(activeSemesterId);
    }
  }, [activeSemesterId]);

  const canViewReports = access?.permissions.includes('REPORTS_ACCESS') === true;
  const canLoadCatalog = canViewReports;

  // Trưởng khoa, trưởng bộ môn, giảng viên chỉ thấy số của đợt đã phát hành. API báo cáo
  // lặng lẽ bỏ đợt chưa phát hành nên bảng chỉ trống trơn; phải tự hỏi trạng thái để
  // nói rõ lý do, giống dòng báo đỏ của trang Bảng dữ liệu khảo sát.
  const waitsForPublication = !seesAllData(activeProfile?.roleCode);

  // Tab nào hiện do quản trị bật tắt ở trang Phân quyền Module, theo vai trò đang dùng.
  const allowedWorkspaces = useMemo(
    () => REPORT_WORKSPACE_ORDER.filter((item) =>
      canAccessTab(access?.permissions, TAB_PERMISSION.reports[item])),
    [access?.permissions],
  );
  const allowedAnalysisViews = useMemo(
    () => REPORT_ANALYSIS_VIEW_ORDER.filter((item) =>
      canAccessTab(access?.permissions, TAB_PERMISSION.reportsOverview[item])),
    [access?.permissions],
  );

  // Danh sách lựa chọn bộ lọc.
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [catalogCourses, setCatalogCourses] = useState<Course[]>([]);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>([]);

  // Bộ lọc.
  const [facultyId, setFacultyId] = useState<number | undefined>(initialRoute.facultyId);
  const [departmentId, setDepartmentId] = useState<number | undefined>(initialRoute.departmentId);
  const [lecturerId, setLecturerId] = useState<number | undefined>(initialRoute.lecturerFilterId);
  const [semesterSurveyId, setSemesterSurveyId] = useState<number | undefined>(
    initialRoute.semesterSurveyId ?? (Number(getActiveSemesterSurveyId()) || undefined),
  );
  const publication = useSurveyPublication(waitsForPublication ? semesterSurveyId ?? null : null);
  const resultsNotPublished = publication !== null && !publication.isPublished;
  // Tăng lên sau mỗi lần Cập nhật điểm: các khối số liệu của trang theo dõi số này
  // để nạp lại, các khối con dùng nó làm key để dựng lại từ đầu.
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState(initialRoute.search ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [workspace, setWorkspace] = useState<ReportWorkspace>(
    initialRoute.screen === 'overview'
      || initialRoute.screen === 'details'
      || initialRoute.screen === 'faculties'
      || initialRoute.screen === 'departments'
      || initialRoute.screen === 'courses'
      || initialRoute.screen === 'comments'
      ? initialRoute.screen
      : 'details',
  );
  const [analysisView, setAnalysisView] = useState<ReportAnalysisView>(
    initialRoute.analysisView ?? 'faculties',
  );
  const [comparisonSemesterId, setComparisonSemesterId] = useState<number | undefined>(
    initialRoute.comparisonSemesterId,
  );
  const [resultSortKey, setResultSortKey] = useState<ReportResultSortKey | undefined>(
    initialRoute.resultSortKey,
  );
  const [resultSortDirection, setResultSortDirection] = useState<DataTableSortDirection>(
    initialRoute.resultSortDirection ?? 'asc',
  );

  // Kết quả.
  const [results, setResults] = useState<SurveyResultDetail[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Drill-down: giảng viên → bài khảo sát.
  // Giảng viên chưa gắn mã (lecturerId 0) không có mã để tra, nên nhận diện bằng tên
  // đọc từ tệp import kèm khoa/viện của lớp đã bấm.
  const [unidentifiedLecturer, setUnidentifiedLecturer] = useState<UnidentifiedLecturerRef | null>(
    initialRoute.unidentifiedLecturer ?? null,
  );
  const [lecturer, setLecturer] = useState<LecturerPerformanceReport | null>(() => {
    const routeLecturerId = initialRoute.lecturerId ?? initialRoute.parentLecturerId;
    if (routeLecturerId) {
      return { lecturerId: routeLecturerId, fullName: 'Chi tiết giảng viên' } as LecturerPerformanceReport;
    }
    return initialRoute.unidentifiedLecturer
      ? ({ lecturerId: 0, fullName: initialRoute.unidentifiedLecturer.name } as LecturerPerformanceReport)
      : null;
  });
  const [lecturerDetail, setLecturerDetail] = useState<LecturerPerformanceReport | null>(null);
  const [lecDetailLoading, setLecDetailLoading] = useState(false);
  const [surveyId, setSurveyId] = useState<number | null>(initialRoute.surveyId ?? null);
  const [surveyTitle, setSurveyTitle] = useState<string | null>(
    initialRoute.surveyId ? 'Chi tiết bài khảo sát' : null,
  );
  // Trang chi tiết theo phạm vi, mở từ nút "Xem KQ" của ba bảng xếp hạng.
  const [scope, setScope] = useState<ScopeSelection | null>(
    initialRoute.screen === 'scope' && initialRoute.scopeType && initialRoute.scopeId
      ? { type: initialRoute.scopeType, id: initialRoute.scopeId }
      : null,
  );

  const routeFromState = useCallback(
    (screen: ReportRouteState['screen'], overrides: Partial<ReportRouteState> = {}): ReportRouteState => ({
      screen,
      semesterId: selectedSemesterId,
      facultyId,
      departmentId,
      lecturerFilterId: lecturerId,
      semesterSurveyId,
      search: search.trim() || undefined,
      analysisView,
      comparisonSemesterId,
      resultSortKey,
      resultSortDirection,
      // Chỉ được ghi lên đường dẫn ở trang giảng viên và bài khảo sát, xem buildReportHash.
      unidentifiedLecturer: unidentifiedLecturer ?? undefined,
      ...overrides,
    }),
    [
      analysisView,
      comparisonSemesterId,
      departmentId,
      facultyId,
      lecturerId,
      search,
      resultSortDirection,
      resultSortKey,
      selectedSemesterId,
      semesterSurveyId,
      unidentifiedLecturer,
    ],
  );

  const navigateToRoute = useCallback((route: ReportRouteState) => {
    const nextHash = buildReportHash(route);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, []);

  const navigateToWorkspace = useCallback(
    (nextWorkspace: ReportWorkspace) => {
      setWorkspace(nextWorkspace);
      setSurveyId(null);
      setSurveyTitle(null);
      setUnidentifiedLecturer(null);
      setLecturer(null);
      setLecturerDetail(null);
      setScope(null);
      // Đổi tab là rời khỏi chuỗi đi xuống của tab cũ.
      setScopeParents([]);
      navigateToRoute(routeFromState(nextWorkspace, nextWorkspace === 'details' ? {} : {
        facultyId: undefined,
        departmentId: undefined,
        lecturerFilterId: undefined,
        search: undefined,
        resultSortKey: undefined,
        resultSortDirection: undefined,
      }));
    },
    [navigateToRoute, routeFromState],
  );

  const openSurvey = useCallback(
    (nextSurveyId: number, title?: string, parentLecturerId?: number) => {
      setSurveyTitle(title ?? 'Chi tiết bài khảo sát');
      navigateToRoute(routeFromState('survey', {
        surveyId: nextSurveyId,
        parentLecturerId,
      }));
    },
    [navigateToRoute, routeFromState],
  );

  const backToOverview = useCallback(() => {
    navigateToWorkspace('details');
  }, [navigateToWorkspace]);

  const backToLecturer = useCallback(() => {
    if (lecturer?.lecturerId) {
      navigateToRoute(routeFromState('lecturer', {
        lecturerId: lecturer.lecturerId,
        unidentifiedLecturer: undefined,
      }));
    } else if (unidentifiedLecturer) {
      navigateToRoute(routeFromState('lecturer', { lecturerId: undefined }));
    } else {
      navigateToWorkspace('details');
    }
  }, [lecturer?.lecturerId, navigateToRoute, navigateToWorkspace, routeFromState, unidentifiedLecturer]);

  const changeSemester = useCallback(
    (nextSemesterId: number) => {
      if (surveyId) {
        navigateToRoute({
          screen: 'survey',
          semesterId: nextSemesterId,
          surveyId,
          parentLecturerId: lecturer?.lecturerId || undefined,
          unidentifiedLecturer: unidentifiedLecturer ?? undefined,
        });
        return;
      }
      if (lecturer?.lecturerId) {
        navigateToRoute({
          screen: 'lecturer',
          semesterId: nextSemesterId,
          lecturerId: lecturer.lecturerId,
        });
        return;
      }
      if (unidentifiedLecturer) {
        navigateToRoute({
          screen: 'lecturer',
          semesterId: nextSemesterId,
          unidentifiedLecturer,
        });
        return;
      }
      navigateToRoute({
        screen: workspace,
        semesterId: nextSemesterId,
        analysisView: workspace === 'overview' ? analysisView : undefined,
      });
    },
    [analysisView, lecturer?.lecturerId, navigateToRoute, surveyId, unidentifiedLecturer, workspace],
  );

  const changeAnalysisView = useCallback(
    (nextView: ReportAnalysisView) => {
      navigateToRoute(routeFromState('overview', { analysisView: nextView }));
    },
    [navigateToRoute, routeFromState],
  );

  // Bài khảo sát là bộ lọc chung của cả trang nên giữ nguyên màn hình đang xem.
  const changeSemesterSurvey = useCallback(
    (nextSemesterSurveyId?: number) => {
      setActiveSemesterSurveyId(nextSemesterSurveyId);
      navigateToRoute(routeFromState(workspace, { semesterSurveyId: nextSemesterSurveyId }));
    },
    [navigateToRoute, routeFromState, workspace],
  );

  const changeResultSort = useCallback(
    (key?: string, direction?: DataTableSortDirection) => {
      navigateToRoute(routeFromState('details', {
        resultSortKey: key as ReportResultSortKey | undefined,
        resultSortDirection: direction,
      }));
    },
    [navigateToRoute, routeFromState],
  );

  useEffect(() => {
    const applyHashRoute = () => {
      if (!window.location.hash.replace(/^#\/?/, '').startsWith('reports')) return;
      const route = parseReportRoute();
      if (route.semesterId) setSelectedSemesterId(route.semesterId);
      setFacultyId(route.facultyId);
      setDepartmentId(route.departmentId);
      setLecturerId(route.lecturerFilterId);
      setSemesterSurveyId(route.semesterSurveyId);
      if (route.semesterSurveyId) setActiveSemesterSurveyId(route.semesterSurveyId);
      setSearch(route.search ?? '');
      setAnalysisView(route.analysisView ?? 'faculties');
      setComparisonSemesterId(route.comparisonSemesterId);
      setResultSortKey(route.resultSortKey);
      setResultSortDirection(route.resultSortDirection ?? 'asc');
      // Trang chi tiết theo phạm vi không nằm trong thanh tab, nên tách hẳn ra
      // khỏi `workspace`: đóng nó lại là quay về đúng bảng xếp hạng đã mở nó.
      setScope(route.screen === 'scope' && route.scopeType && route.scopeId
        ? { type: route.scopeType, id: route.scopeId }
        : null);
      // Đi bằng link/back của trình duyệt thì chuỗi cấp trên không còn suy ra được,
      // nên bỏ đi thay vì để lại đường dẫn của lần đi trước.
      setScopeParents([]);

      if (route.screen === 'survey' && route.surveyId) {
        setWorkspace('details');
        setSurveyId(route.surveyId);
        setSurveyTitle('Chi tiết bài khảo sát');
        const parentId = route.parentLecturerId;
        const parentUnidentified = parentId ? null : route.unidentifiedLecturer ?? null;
        setUnidentifiedLecturer(parentUnidentified);
        setLecturer(parentId
          ? ({ lecturerId: parentId, fullName: 'Chi tiết giảng viên' } as LecturerPerformanceReport)
          : parentUnidentified
            ? ({ lecturerId: 0, fullName: parentUnidentified.name } as LecturerPerformanceReport)
            : null);
      } else if (route.screen === 'lecturer' && route.lecturerId) {
        setWorkspace('details');
        setSurveyId(null);
        setSurveyTitle(null);
        setUnidentifiedLecturer(null);
        setLecturer({
          lecturerId: route.lecturerId,
          fullName: 'Chi tiết giảng viên',
        } as LecturerPerformanceReport);
      } else if (route.screen === 'lecturer' && route.unidentifiedLecturer) {
        const named = route.unidentifiedLecturer;
        setWorkspace('details');
        setSurveyId(null);
        setSurveyTitle(null);
        // Giữ nguyên object cũ nếu vẫn là người đó, để không nạp lại trang vô ích.
        setUnidentifiedLecturer((current) =>
          current && current.name === named.name && current.facultyId === named.facultyId
            ? current
            : named);
        setLecturer({ lecturerId: 0, fullName: named.name } as LecturerPerformanceReport);
      } else if (route.screen === 'overview' || route.screen === 'details'
        || route.screen === 'faculties' || route.screen === 'departments'
        || route.screen === 'courses' || route.screen === 'comments') {
        setWorkspace(route.screen);
        setSurveyId(null);
        setSurveyTitle(null);
        setUnidentifiedLecturer(null);
        setLecturer(null);
        setLecturerDetail(null);
      } else {
        setWorkspace('details');
      }
    };

    window.addEventListener('hashchange', applyHashRoute);
    return () => window.removeEventListener('hashchange', applyHashRoute);
  }, []);

  useEffect(() => {
    const screen: ReportRouteState['screen'] = surveyId
      ? 'survey'
      : lecturer
        ? 'lecturer'
        : scope
          ? 'scope'
          : workspace;
    const canonicalRoute = routeFromState(screen, {
      surveyId: surveyId ?? undefined,
      lecturerId: !surveyId ? lecturer?.lecturerId : undefined,
      parentLecturerId: surveyId ? lecturer?.lecturerId : undefined,
      scopeType: scope?.type,
      scopeId: scope?.id,
    });
    const canonicalHash = buildReportHash(canonicalRoute);
    if (window.location.hash !== canonicalHash) {
      window.history.replaceState(null, '', canonicalHash);
    }
  }, [lecturer, routeFromState, scope, surveyId, workspace]);

  // Đường dẫn cũ hay nút quay lại có thể trỏ vào một tab vai trò này bị khoá: đưa về
  // tab đầu tiên được mở. Trang chi tiết lớp, giảng viên, phạm vi không nằm trên thanh
  // tab nên để nguyên — chúng mượn `workspace` chỉ để biết khi đóng thì về đâu.
  useEffect(() => {
    if (surveyId !== null || lecturer !== null || scope !== null) return;
    if (allowedWorkspaces.length === 0 || allowedWorkspaces.includes(workspace)) return;
    setWorkspace(allowedWorkspaces[0]);
  }, [allowedWorkspaces, lecturer, scope, surveyId, workspace]);

  useEffect(() => {
    if (allowedAnalysisViews.length === 0 || allowedAnalysisViews.includes(analysisView)) return;
    setAnalysisView(allowedAnalysisViews[0]);
  }, [allowedAnalysisViews, analysisView]);

  // Nạp danh mục để dựng bộ lọc.
  useEffect(() => {
    if (!canLoadCatalog) {
      setFaculties([]);
      setDepartments([]);
      setCatalogCourses([]);
      setLecturers([]);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const [nextFaculties, nextDepartments, nextCourses, nextLecturers] = await Promise.all([
          catalogApi.faculties(),
          catalogApi.departments(),
          catalogApi.courses(),
          catalogApi.lecturers(),
        ]);
        if (cancelled) return;
        setFaculties(nextFaculties);
        setDepartments(nextDepartments);
        setCatalogCourses(nextCourses);
        setLecturers(nextLecturers);
      } catch {
        if (!cancelled) setLoadError('Không tải được danh mục để lọc báo cáo.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [canLoadCatalog]);

  // Nạp danh sách đợt khảo sát theo học kỳ (bộ lọc "đợt khảo sát").
  useEffect(() => {
    if (!selectedSemesterId) {
      setSemesterSurveys([]);
      return;
    }
    let cancelled = false;
    surveyApi
      .semesterSurveys(selectedSemesterId)
      .then((surveys) => {
        if (!cancelled) setSemesterSurveys(surveys);
      })
      .catch(() => {
        if (!cancelled) setSemesterSurveys([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSemesterId]);

  // Trang luôn phân tích đúng một bài khảo sát, nên khi đổi kỳ (hoặc vào từ link
  // trỏ tới bài không còn thuộc kỳ) thì rơi về bài đầu tiên của kỳ.
  useEffect(() => {
    if (semesterSurveys.length === 0) return;
    const selected = selectAvailableSemesterSurveyId(semesterSurveys, semesterSurveyId);
    if (Number(selected) !== semesterSurveyId) setSemesterSurveyId(Number(selected) || undefined);
  }, [semesterSurveys, semesterSurveyId]);

  // Debounce ô tìm kiếm.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Lấy kết quả theo bộ lọc.
  useEffect(() => {
    if (!selectedSemesterId) return;
    let cancelled = false;
    setResultsLoading(true);
    reportApi
      .results({
        semesterId: selectedSemesterId,
        facultyId,
        departmentId,
        lecturerId,
        semesterSurveyId,
        search: debouncedSearch || undefined,
      })
      .then((data) => {
        if (!cancelled) {
          setResults(data);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError('Không thể tải kết quả khảo sát.');
      })
      .finally(() => {
        if (!cancelled) setResultsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSemesterId, facultyId, departmentId, lecturerId, semesterSurveyId, debouncedSearch, reloadToken]);

  useEffect(() => {
    if (!lecturer?.lecturerId || !selectedSemesterId) return;
    let cancelled = false;
    setLecturerDetail(null);
    setLecDetailLoading(true);
    reportApi
      .lecturerDetail(lecturer.lecturerId, selectedSemesterId)
      .then((detail) => {
        if (cancelled) return;
        setLecturerDetail(detail);
        setLecturer(detail);
        setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Không thể tải chi tiết đánh giá giảng viên.');
      })
      .finally(() => {
        if (!cancelled) setLecDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lecturer?.lecturerId, selectedSemesterId, reloadToken]);

  // Giảng viên chưa gắn mã: tra theo tên, khoanh trong khoa/viện của lớp đã bấm.
  const unidentifiedName = unidentifiedLecturer?.name;
  const unidentifiedFacultyId = unidentifiedLecturer?.facultyId;
  useEffect(() => {
    if (unidentifiedName === undefined || unidentifiedFacultyId === undefined || !selectedSemesterId) return;
    let cancelled = false;
    setLecturerDetail(null);
    setLecDetailLoading(true);
    reportApi
      .unidentifiedLecturerDetail(unidentifiedName, unidentifiedFacultyId, selectedSemesterId)
      .then((detail) => {
        if (cancelled) return;
        setLecturerDetail(detail);
        setLecturer(detail);
        setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Không thể tải chi tiết đánh giá giảng viên.');
      })
      .finally(() => {
        if (!cancelled) setLecDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unidentifiedName, unidentifiedFacultyId, selectedSemesterId, reloadToken]);

  const openLecturer = useCallback(
    (nextLecturerId: number, lecturerName: string) => {
      setUnidentifiedLecturer(null);
      setLecturer({ lecturerId: nextLecturerId, fullName: lecturerName } as LecturerPerformanceReport);
      navigateToRoute(routeFromState('lecturer', {
        lecturerId: nextLecturerId,
        unidentifiedLecturer: undefined,
      }));
    },
    [navigateToRoute, routeFromState],
  );

  const openUnidentifiedLecturer = useCallback(
    (lecturerName: string, lecturerFacultyId: number) => {
      const next: UnidentifiedLecturerRef = { name: lecturerName, facultyId: lecturerFacultyId };
      setUnidentifiedLecturer(next);
      setLecturer({ lecturerId: 0, fullName: lecturerName } as LecturerPerformanceReport);
      navigateToRoute(routeFromState('lecturer', { lecturerId: undefined, unidentifiedLecturer: next }));
    },
    [navigateToRoute, routeFromState],
  );

  // Drill-down từ bảng tổng quan toàn trường → gán bộ lọc và cuộn tới bảng kết quả.
  const handleOverviewDrillDown = useCallback(
    (filter: { facultyId?: number; departmentId?: number }) => {
      navigateToRoute(routeFromState('details', {
        facultyId: filter.facultyId,
        departmentId: filter.departmentId,
        lecturerFilterId: undefined,
      }));
      window.setTimeout(() => {
        document.getElementById('reports-detail-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    },
    [navigateToRoute, routeFromState],
  );

  // Bảng lọc ngay trên tiêu đề cột, nhưng drill-down từ tab Tổng quan vẫn khoanh
  // vùng dữ liệu từ phía API. Hiện thành chip gọn để người dùng biết mình đang
  // xem phạm vi nào và bỏ được ngay.
  const scopeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    const clear = (override: Partial<ReportRouteState>) =>
      navigateToRoute(routeFromState('details', override));

    if (facultyId) {
      const name = faculties.find((item) => item.facultyId === facultyId)?.facultyName;
      chips.push({
        key: 'faculty',
        label: `Khoa: ${name ?? `#${facultyId}`}`,
        onClear: () => clear({ facultyId: undefined }),
      });
    }
    if (departmentId) {
      const name = departments.find((item) => item.departmentId === departmentId)?.departmentName;
      chips.push({
        key: 'department',
        label: `Bộ môn: ${name ?? `#${departmentId}`}`,
        onClear: () => clear({ departmentId: undefined }),
      });
    }
    if (lecturerId) {
      const name = lecturers.find((item) => item.lecturerId === lecturerId)?.fullName;
      chips.push({
        key: 'lecturer',
        label: `Giảng viên: ${name ?? `#${lecturerId}`}`,
        onClear: () => clear({ lecturerFilterId: undefined }),
      });
    }
    return chips;
  }, [
    departmentId,
    departments,
    faculties,
    facultyId,
    lecturerId,
    lecturers,
    navigateToRoute,
    routeFromState,
  ]);

  // KPI gộp từ kết quả đang lọc — cùng cách tính với cột "Hoàn thành": chỉ phiếu hợp lệ.
  // Dải số liệu đứng ngay trên bảng nên phải nói đúng những cột của bảng: tổng số phiếu phải thu,
  // phiếu đã thu, phiếu hợp lệ, phiếu không hợp lệ và tỷ lệ phản hồi.
  const kpi = useMemo(() => {
    const totalTarget = results.reduce((sum, item) => sum + item.classSize, 0);
    const totalResponses = results.reduce((sum, item) => sum + item.responseCount, 0);
    const totalCollected = results.reduce((sum, item) => sum + item.validResponseCount, 0);
    const totalInvalid = results.reduce((sum, item) => sum + item.invalidResponseCount, 0);
    const responseRate = totalTarget > 0 ? (totalResponses / totalTarget) * 100 : 0;
    const completionRate = totalTarget > 0 ? (totalCollected / totalTarget) * 100 : 0;
    return {
      totalTarget,
      totalResponses,
      totalCollected,
      totalInvalid,
      responseRate,
      completionRate,
      classCount: results.length,
    };
  }, [results]);

  /*
    Dòng đang nhìn thấy của bảng Tra cứu chi tiết, sau ô tìm kiếm và menu lọc cột.
    Tệp xuất phải chứa đúng tập dòng đó: xuất cả danh sách trong khi màn hình đang
    lọc theo một khoa thì người nhận tệp không đối chiếu được với ai.
  */
  const [visibleResultRows, setVisibleResultRows] = useState<SurveyResultDetail[]>(results);
  const handleVisibleResultRows = useCallback(
    (rows: SurveyResultDetail[]) => setVisibleResultRows(rows),
    [],
  );
  // Bảng tính tỷ lệ phản hồi ngay lúc vẽ, còn tệp xuất cần một trường thật để đổ
  // vào cột, nên gắn sẵn vào bản sao dùng riêng cho phần xuất.
  const exportVisibleResults = useMemo(
    () => visibleResultRows.map((item) => ({
      ...item,
      responseRate: responseRateOf(item.responseCount, item.classSize),
      validRate: validRateOf(item.validResponseCount, item.responseCount),
    })),
    [visibleResultRows],
  );

  // Xếp hạng Khoa / Bộ môn / Học phần từ kết quả.
  const buildRanking = useCallback(
    (key: 'faculty' | 'department'): RankedUnit[] => {
      const groups = new Map<number, RankedUnit>();
      // Điểm TB phải gộp theo tổng điểm chứ không lấy trung bình của trung bình,
      // nên cộng dồn riêng tử số rồi mới chia ở cuối.
      const scoreSums = new Map<number, number>();
      // Mẫu số của điểm chỉ đếm phiếu của lớp ĐÃ THU ĐỦ. Lớp chưa đủ về đây với
      // averageScore = 0; cộng phiếu của nó vào mẫu số mà tử số bằng 0 thì cả khoa
      // bị kéo tụt xuống bởi đúng những lớp lẽ ra không được tính.
      const scoredResponseCounts = new Map<number, number>();

      for (const item of results) {
        const id = key === 'faculty' ? item.facultyId : item.departmentId;
        const name = key === 'faculty' ? item.facultyName : item.departmentName;
        if (id === 0 || !name || name === 'Chưa thuộc khoa' || name === 'Chưa thuộc bộ môn') continue;

        // Bảng này chỉ gộp lớp qua được hai vòng lọc — đúng nhóm "đủ điều kiện" ở
        // trang Bảng dữ liệu khảo sát. Trước đây số lớp và số phiếu cộng cả lớp
        // không đủ, trong khi cột điểm lại chỉ tính lớp đủ, nên ba cột của cùng
        // một dòng nói về hai tập lớp khác nhau.
        if (!hasEnoughResponsesToScore(
          item.classSize,
          item.responseCount,
          item.validResponseCount,
          thresholds,
        )) {
          continue;
        }

        const group = groups.get(id);
        if (!group) {
          groups.set(id, {
            id,
            name,
            facultyId: item.facultyId,
            facultyName: item.facultyName,
            classSize: item.classSize,
            responseCount: item.responseCount,
            validResponseCount: item.validResponseCount,
            invalidResponseCount: item.invalidResponseCount,
            responseRate: 0,
            validRate: 0,
            averageScore: 0,
            sectionCount: 1,
          });
        } else {
          group.classSize += item.classSize;
          group.responseCount += item.responseCount;
          group.validResponseCount += item.validResponseCount;
          group.invalidResponseCount += item.invalidResponseCount;
          group.sectionCount += 1;
        }
        if (item.averageScore > 0) {
          scoreSums.set(id, (scoreSums.get(id) ?? 0) + item.averageScore * item.validResponseCount);
          scoredResponseCounts.set(
            id,
            (scoredResponseCounts.get(id) ?? 0) + item.validResponseCount,
          );
        }
      }

      const ranked: RankedUnit[] = [];
      for (const group of groups.values()) {
        // Chỉ phiếu hợp lệ, và chỉ của lớp đã thu đủ phiếu.
        const scoredResponses = scoredResponseCounts.get(group.id) ?? 0;
        group.averageScore = scoredResponses > 0
          ? (scoreSums.get(group.id) ?? 0) / scoredResponses
          : 0;
        group.responseRate = responseRateOf(group.responseCount, group.classSize);
        group.validRate = validRateOf(group.validResponseCount, group.responseCount);
        ranked.push(group);
      }
      return ranked.sort((left, right) => left.name.localeCompare(right.name, 'vi'));
    },
    [results, thresholds],
  );

  const facultyRankings = useMemo(() => buildRanking('faculty'), [buildRanking]);
  const departmentRankings = useMemo(() => buildRanking('department'), [buildRanking]);

  /*
    Tên của phạm vi đang mở, tra từ chính các bảng xếp hạng đã gộp sẵn — mở trang chi
    tiết bằng link trực tiếp thì tên đơn vị cũng có ngay khi số liệu về.

    Cấp trên của chuỗi đi xuống (khoa → bộ môn → học phần) phải nhớ riêng, vì mỗi lần
    đi xuống là một lần đổi phạm vi và cấp cũ bị thay chỗ.
  */
  const [scopeParents, setScopeParents] = useState<string[]>([]);

  const courseRankings = useMemo<RankedCourse[]>(() => {
    const groups = new Map<number, RankedCourse>();
    const scoreSums = new Map<number, number>();
    const scoreCounts = new Map<number, number>();
    const courseIdByCode = new Map(catalogCourses.map((course) => [course.courseCode, course.courseId]));

    for (const item of results) {
      const courseId = courseIdByCode.get(item.courseCode);
      if (!courseId || !hasEnoughResponsesToScore(
        item.classSize,
        item.responseCount,
        item.validResponseCount,
        thresholds,
      )) continue;

      const current = groups.get(courseId);
      if (!current) {
        groups.set(courseId, {
          id: courseId,
          code: item.courseCode,
          name: item.courseName,
          facultyId: item.facultyId,
          facultyName: item.facultyName,
          departmentName: item.departmentName,
          classSize: item.classSize,
          responseCount: item.responseCount,
          validResponseCount: item.validResponseCount,
          invalidResponseCount: item.invalidResponseCount,
          responseRate: 0,
          validRate: 0,
          averageScore: 0,
          sectionCount: 1,
        });
      } else {
        current.classSize += item.classSize;
        current.responseCount += item.responseCount;
        current.validResponseCount += item.validResponseCount;
        current.invalidResponseCount += item.invalidResponseCount;
        current.sectionCount += 1;
      }
      if (item.averageScore > 0) {
        scoreSums.set(courseId, (scoreSums.get(courseId) ?? 0)
          + item.averageScore * item.validResponseCount);
        scoreCounts.set(courseId, (scoreCounts.get(courseId) ?? 0)
          + item.validResponseCount);
      }
    }

    return Array.from(groups.values()).map((group) => {
      const scoreCount = scoreCounts.get(group.id) ?? 0;
      group.averageScore = scoreCount > 0 ? (scoreSums.get(group.id) ?? 0) / scoreCount : 0;
      group.responseRate = responseRateOf(group.responseCount, group.classSize);
      group.validRate = validRateOf(group.validResponseCount, group.responseCount);
      return group;
    }).sort((left, right) => left.code.localeCompare(right.code, 'vi'));
  }, [catalogCourses, results, thresholds]);

  // Nhãn học kỳ hiện ở tiêu đề tệp xuất và trong phần tóm tắt, nên phải có trước
  // phần dựng sheet chi tiết.
  const semesterLabel = useMemo(() => {
    for (const year of academicYears) {
      const found = year.semesters.find((s) => s.semesterId === selectedSemesterId);
      if (found) return `${year.academicYearName} · ${found.semesterName}`;
    }
    return 'Học kỳ';
  }, [academicYears, selectedSemesterId]);

  /**
   * Cột của bảng điểm chi tiết theo câu hỏi, dựng theo đúng bảng đang hiển thị ở
   * trang "Xem KQ": mỗi mức của thang là một cột in "số lượng (tỷ lệ)", y như ô trên
   * màn hình, chứ không tách thành hai cột số lượng và tỷ lệ.
   */
  const questionDetailExportColumns = (questions: QuestionRating[]): ExportColumn<any>[] => {
    const levels = questions.find((question) => question.scaleKind !== 'Text')?.optionDistribution ?? [];
    return [
      {
        key: 'code',
        header: 'Mã',
        width: 8,
        align: 'left',
        format: (_value: any, row: QuestionRating) => `C${row.questionOrder}`,
      },
      { key: 'questionText', header: 'Nội dung câu hỏi khảo sát', width: 60 },
      ...levels.map((level) => ({
        key: `level-${level.value}`,
        header: `Số lượng lựa chọn ${level.value}`,
        width: 16,
        align: 'right' as const,
        format: (_value: any, row: QuestionRating) => {
          const cell = row.optionDistribution?.find(
            (option: OptionCount) => option.value === level.value,
          );
          return `${cell?.count ?? 0} (${formatPercent(cell?.percentage ?? 0, 3)})`;
        },
      })),
      {
        key: 'averageScore',
        header: 'Điểm TB',
        width: 12,
        align: 'right',
        format: (value: any) => (Number(value) > 0 ? formatDecimal(Number(value), 3) : '—'),
      },
      {
        key: 'rating',
        header: 'Đánh giá',
        width: 16,
        format: (_value: any, row: QuestionRating) => getScoreRatingText(row.averageScore),
      },
    ];
  };

  /**
   * Sheet cho từng khoa/viện ở tab Theo Khoa/Viện: gom đủ các phần của trang "Xem KQ"
   * — dòng tóm tắt, bảng điểm chi tiết theo câu hỏi, danh sách bộ môn và danh sách
   * lớp học phần. Số liệu chi tiết theo câu hỏi chỉ có ở API phạm vi nên mỗi khoa
   * phải gọi một lượt, vì vậy hàm này chạy lúc bấm xuất chứ không dựng sẵn.
   */
  const buildFacultySheets = useCallback(
    async (facultiesToExport: RankedUnit[]): Promise<ExportSheet<any>[]> => {
      if (!semesterSurveyId || facultiesToExport.length === 0) return [];

      const analyses = await Promise.all(facultiesToExport.map((faculty) =>
        surveyApi
          .semesterSurveyScopeAnalysis(semesterSurveyId, 'faculty', faculty.id)
          .catch(() => null)));

      /*
        Biểu đồ cột điểm từng câu của mỗi khoa, vẽ trước thành ảnh PNG.

        Hàm vẽ chạy bất đồng bộ nên phải gom ra một lượt riêng; phần ráp sheet bên
        dưới viết theo lối đồng bộ nên đọc mạch lạc hơn. Khoa nào vẽ lỗi thì vẫn có
        sheet với bảng số liệu, chỉ thiếu ảnh.
      */
      const charts = await Promise.all(analyses.map(async (analysis) => {
        const questions = analysis?.questions.filter((question) => question.scaleKind !== 'Text') ?? [];
        if (!analysis || questions.length === 0) return undefined;
        try {
          const { dataUrl, width, height } = await generateQuestionChartImage({
            questions,
            overallAverageScore: analysis.averageScore,
            responseCount: analysis.responseCount,
            title: `Điểm trung bình theo câu hỏi · ${analysis.scopeName}`,
          });
          return { dataUrl, width, height };
        } catch {
          return undefined;
        }
      }));

      return facultiesToExport.map((faculty, index) => {
        const analysis = analyses[index];
        const classRows = results.filter((item) => item.facultyId === faculty.id);
        const tables: ExportTable<any>[] = [];

        if (analysis) {
          const questions = analysis.questions.filter((question) => question.scaleKind !== 'Text');
          if (questions.length > 0) {
            tables.push({
              title: '1. Bảng điểm chi tiết & tỷ lệ phân bố theo câu hỏi',
              columns: questionDetailExportColumns(questions),
              data: questions,
            });
          }
          if (analysis.departments && analysis.departments.length > 0) {
            tables.push({
              title: '2. Danh sách các bộ môn',
              columns: [
                { key: 'departmentName', header: 'Bộ môn', width: 30 },
                { key: 'sectionCount', header: 'Số lớp', width: 10, type: 'number', align: 'right' },
                { key: 'lecturerCount', header: 'Số giảng viên', width: 12, type: 'number', align: 'right' },
                { key: 'totalClassSize', header: 'Tổng số phiếu phải thu', width: 14, type: 'number', align: 'right' },
                { key: 'responseCount', header: 'Số phiếu đã thu', width: 14, type: 'number', align: 'right' },
                { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 14, type: 'number', align: 'right' },
                {
                  key: 'validResponseRate',
                  header: 'Tỷ lệ phiếu hợp lệ (%)',
                  width: 14,
                  align: 'right',
                  format: (value: any) => formatDecimal(Number(value), 3),
                },
                {
                  key: 'averageScore',
                  header: 'Điểm trung bình',
                  width: 14,
                  align: 'right',
                  format: (value: any) => (value === null || value === undefined
                    ? '—'
                    : formatDecimal(Number(value), 3)),
                },
                {
                  key: 'delta',
                  header: 'Chênh lệch so với trung bình Khoa / Viện',
                  width: 18,
                  align: 'right',
                  format: (_value: any, row: any) => (row.averageScore === null || row.averageScore === undefined
                    ? '—'
                    : formatSigned(Number(row.averageScore) - analysis.averageScore)),
                },
              ],
              data: analysis.departments,
            });
          }
        } else {
          tables.push({
            title: '1. Bảng điểm chi tiết & tỷ lệ phân bố theo câu hỏi',
            columns: questionDetailExportColumns([]),
            data: [],
            summaryNotes: ['Không tải được số liệu chi tiết theo câu hỏi của khoa/viện này.'],
          });
        }

        // Danh sách lớp lấy từ chính bảng tra cứu chi tiết, nên cột và con số khớp
        // với những gì đang xem ở tab Tra cứu chi tiết khi lọc theo khoa này.
        tables.push({
          title: `${tables.length + 1}. Danh sách lớp học phần (${classRows.length} lớp)`,
          columns: [
            { key: 'departmentName', header: 'Bộ môn', width: 24 },
            { key: 'courseName', header: 'Học phần', width: 30 },
            { key: 'courseCode', header: 'Mã học phần', width: 14, align: 'left' },
            { key: 'sectionName', header: 'Lớp học phần', width: 14, align: 'left' },
            { key: 'lecturerName', header: 'Giảng viên', width: 24 },
            { key: 'classSize', header: 'Tổng số phiếu phải thu', width: 12, type: 'number', align: 'right' },
            { key: 'responseCount', header: 'Số phiếu đã thu', width: 14, type: 'number', align: 'right' },
            { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 14, type: 'number', align: 'right' },
            { key: 'invalidResponseCount', header: 'Số phiếu không hợp lệ', width: 16, type: 'number', align: 'right' },
            {
              key: 'responseRate',
              header: 'Tỷ lệ phản hồi (%)',
              width: 14,
              align: 'right',
              format: (_value: any, row: SurveyResultDetail) =>
                formatDecimal(responseRateOf(row.responseCount, row.classSize), 3),
            },
            {
              key: 'validRate',
              header: 'Tỷ lệ phiếu hợp lệ (%)',
              width: 14,
              align: 'right',
              format: (_value: any, row: SurveyResultDetail) =>
                formatDecimal(validRateOf(row.validResponseCount, row.responseCount), 3),
            },
            {
              key: 'averageScore',
              header: 'Điểm trung bình',
              width: 14,
              align: 'right',
              format: (value: any) => (Number(value) > 0 ? formatDecimal(Number(value), 3) : '—'),
            },
          ],
          data: classRows,
        });

        return {
          // Tên tab Excel tối đa 31 ký tự nên cắt bớt tên khoa; tên nào trùng nhau
          // sau khi cắt thì bộ xuất tự thêm hậu tố để không mất tab.
          sheetName: faculty.name.slice(0, 28),
          title: `${faculty.name.toUpperCase()} · ${semesterLabel}`,
          // Đường dẫn đi tới đúng khoa này, nối tiếp đường dẫn của cả tab.
          breadcrumb: [...facultyTabBreadcrumb, faculty.name],
          // Biểu đồ cột điểm theo câu hỏi, đứng trên bảng điểm chi tiết — trên màn
          // hình cũng theo thứ tự đó.
          chart: charts[index],
          info: {
            'Số lớp': faculty.sectionCount,
            'Tổng số phiếu phải thu': faculty.classSize,
            'Số phiếu đã thu': faculty.responseCount,
            'Số phiếu hợp lệ': faculty.validResponseCount,
            'Số phiếu không hợp lệ': faculty.invalidResponseCount,
            'Tỷ lệ phản hồi': formatPercent(faculty.responseRate, 3),
            'Tỷ lệ phiếu hợp lệ': formatPercent(faculty.validRate, 3),
            'Điểm trung bình': faculty.averageScore > 0
              ? `${formatDecimal(faculty.averageScore, 3)} / 5,0`
              : '—',
          },
          tables,
        } satisfies ExportSheet<any>;
      });
    },
    [results, semesterLabel, semesterSurveyId],
  );

  /**
   * Tên của một phạm vi, tra từ chính các bảng xếp hạng đã gộp sẵn — mở trang chi tiết
   * bằng link trực tiếp thì tên đơn vị cũng có ngay khi số liệu về.
   */
  const scopeDisplayName = useCallback((selection: ScopeSelection): string => {
    const source: RankedUnit[] = selection.type === 'faculty'
      ? facultyRankings
      : selection.type === 'department'
        ? departmentRankings
        : courseRankings;
    return source.find((row) => row.id === selection.id)?.name ?? `#${selection.id}`;
  }, [courseRankings, departmentRankings, facultyRankings]);

  /**
   * Mở trang chi tiết của một khoa/viện, bộ môn hay học phần. Trang này ở lại
   * trong chính module Thống kê & Báo cáo: trước đây nút "Xem KQ" đẩy người dùng
   * sang module Thống kê chi tiết nên thanh điều hướng nhảy sang mục khác giữa
   * chừng, và người chỉ có quyền xem báo cáo thì bị đá ngược về trang đầu.
   */
  const openAnalysisDetail = useCallback((type: ReportScopeType, id: number) => {
    if (!selectedSemesterId || !semesterSurveyId) return;
    // Mở một phạm vi mới từ bảng xếp hạng thì bắt đầu lại từ cấp đầu.
    setScopeParents([]);
    navigateToRoute({
      screen: 'scope',
      semesterId: selectedSemesterId,
      semesterSurveyId,
      scopeType: type,
      scopeId: id,
    });
  }, [navigateToRoute, selectedSemesterId, semesterSurveyId]);

  /** Đi xuống một cấp trong trang chi tiết: khoa/viện → bộ môn → học phần → lớp. */
  const drillDownScope = useCallback((selection: ScopeSelection) => {
    if (!semesterSurveyId) return;
    // Cấp đang xem trở thành cấp trên của cấp sắp mở, để thanh trên cùng in đủ đường đi.
    setScopeParents((previous) => (scope
      ? [...previous, scopeDisplayName(scope)]
      : previous));
    navigateToRoute({
      screen: 'scope',
      semesterId: selectedSemesterId,
      semesterSurveyId,
      scopeType: selection.type,
      scopeId: selection.id,
    });
  }, [navigateToRoute, scope, scopeDisplayName, selectedSemesterId, semesterSurveyId]);

  const backFromScope = useCallback(() => {
    navigateToWorkspace(scopeParentWorkspace(scope?.type));
  }, [navigateToWorkspace, scope?.type]);

  /*
    Đường dẫn điều hướng in ở thanh trên cùng: mục trên thanh điều hướng do thanh tự
    biết, phần còn lại do trang này khai — đang ở tab nào, đang mở khoa/viện nào, đi
    xuống bộ môn/học phần nào, hoặc đang xem giảng viên / bài khảo sát nào.
  */
  const breadcrumbTrail = useMemo(() => {
    const segments: Array<string | undefined> = [workspaceLabels[workspace]];
    if (scope) segments.push(...scopeParents, scopeDisplayName(scope));
    if (lecturer) segments.push(lecturer.fullName);
    if (surveyTitle) segments.push(surveyTitle);
    return segments;
  }, [lecturer, scope, scopeDisplayName, scopeParents, surveyTitle, workspace]);
  useSetBreadcrumbTrail(breadcrumbTrail);

  /** Đường dẫn của bài khảo sát đang mở, in vào tệp xuất của chính bài đó. */
  const surveyBreadcrumb = useMemo(() => [
    ...reportRootBreadcrumb,
    ...(lecturer ? ['Giảng viên', lecturer.fullName] : []),
    surveyTitle ?? 'Bài khảo sát',
  ], [lecturer, surveyTitle]);

  if (!canViewReports) {
    return (
      <div className="survey-operations-page" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', background: '#fff', padding: '32px', border: '1px solid #dfe4e8', borderRadius: '4px' }}>
          <ShieldAlert style={{ width: '48px', height: '48px', color: '#b52d2d', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px', color: '#000000' }}>Không có quyền truy cập</h2>
          <p style={{ color: '#000000', fontSize: '14px', lineHeight: '1.5' }}>
            Tài khoản của bạn chưa được cấp quyền <code>REPORTS_ACCESS</code> để xem báo cáo thống kê. Vui lòng liên hệ Quản trị viên hệ thống để được phân quyền.
          </p>
        </div>
      </div>
    );
  }

  const isSurveyMode = surveyId !== null;
  const isLecturerMode = !isSurveyMode && lecturer !== null;
  // Trang chi tiết theo phạm vi đứng riêng một cấp, không nằm trong thanh tab.
  const isScopeMode = !isSurveyMode && !isLecturerMode && scope !== null;
  // Tab đang mở mà bị khoá thì chưa vẽ gì, chờ hiệu ứng ở trên chuyển sang tab được mở.
  const activeWorkspace = allowedWorkspaces.includes(workspace) ? workspace : null;

  const renderQuestionAnalysis = (questions: LecturerPerformanceReport['questionRatings']) => {
    const lecturerExportMetadata: QuestionAnalysisExportMetadata = {
      title: `BÁO CÁO PHÂN TÍCH KẾT QUẢ CÂU HỎI KHẢO SÁT · GIẢNG VIÊN ${lecturerDetail?.fullName.toUpperCase() ?? ''}`.trim(),
      subtitle: lecturerDetail
        ? `${lecturerDetail.departmentName} · ${lecturerDetail.facultyName} · ${semesterLabel}`
        : semesterLabel,
      fileName: `bao-cao-cau-hoi-giang-vien-${toVietnameseFileSlug(lecturerDetail?.fullName || 'gv')}-${toVietnameseFileSlug(semesterLabel)}`,
      breadcrumb: [
        ...reportRootBreadcrumb,
        'Giảng viên',
        lecturerDetail?.fullName ?? 'Chi tiết giảng viên',
      ],
      info: {
        'Giảng viên': lecturerDetail?.fullName,
        'Đơn vị': lecturerDetail ? `${lecturerDetail.departmentName} · ${lecturerDetail.facultyName}` : undefined,
        'Học kỳ': semesterLabel,
        'Điểm trung bình': lecturerDetail ? `${formatDecimal(lecturerDetail.averageScore, 3)} / 5,0` : undefined,
        'Phiếu dùng tính điểm': lecturerDetail?.scoredValidResponseCount.toLocaleString('vi-VN'),
        'Số lớp học phần': lecturerDetail?.courseSectionCount,
      },
    };

    return (
      <QuestionAnalysisChart
        questions={questions}
        overallAverageScore={lecturerDetail?.averageScore}
        // Mẫu số phải là phiếu của lớp đã chốt điểm, đúng bằng tập lớp dựng nên
        // averageScore ngay bên trên — chứ không phải mọi phiếu hợp lệ của giảng viên.
        responseCount={lecturerDetail?.scoredValidResponseCount}
        title="Phân tích kết quả theo câu hỏi"
        showDistributionTable={true}
        emptyMessage="Chưa có lớp nào của giảng viên này đủ điều kiện tính điểm trong học kỳ đã chọn."
        exportMetadata={lecturerExportMetadata}
      />
    );
  };

  // Mọi cột đều khai báo filterValue để dùng menu lọc kiểu Excel ngay trên tiêu đề,
  // thay cho thanh lọc cũ chiếm nguyên một băng phía trên bảng.
  // Thứ tự cột: Khoa / Viện, Bộ môn, Học phần, Mã học phần, Nhóm lớp, Giảng viên, rồi
  // tới các cột số — cùng thứ tự đi từ đơn vị lớn xuống lớp với bảng Học phần.
  const resultColumns: Column<SurveyResultDetail>[] = [
    {
      key: 'facultyName',
      header: 'Khoa / Viện',
      width: '11%',
      sortValue: (item) => item.facultyName,
      filterValue: (item) => item.facultyName,
      render: (item) => <span className="catalog-cell-primary">{item.facultyName}</span>,
    },
    {
      key: 'departmentName',
      header: 'Bộ môn',
      width: '12%',
      sortValue: (item) => item.departmentName,
      filterValue: (item) => item.departmentName,
      render: (item) => <span className="catalog-cell-primary">{item.departmentName}</span>,
    },
    {
      key: 'courseName',
      header: 'Học phần',
      width: '13%',
      sortValue: (item) => item.courseName,
      filterValue: (item) => item.courseName,
      render: (item) => <span className="catalog-cell-primary">{item.courseName}</span>,
    },
    {
      key: 'courseCode',
      header: 'Mã học phần',
      width: '5%',
      sortValue: (item) => item.courseCode,
      filterValue: (item) => item.courseCode,
      render: (item) => <span className="catalog-cell-primary">{item.courseCode}</span>,
    },
    {
      key: 'sectionName',
      header: 'Lớp học phần',
      width: '4%',
      sortValue: (item) => item.sectionName,
      filterValue: (item) => item.sectionName,
      render: (item) => <span className="operations-code">{item.sectionName}</span>,
    },
    {
      key: 'lecturerName',
      header: 'Giảng viên',
      width: '14%',
      sortValue: (item) => item.lecturerName,
      filterValue: (item) => item.lecturerName,
      // Lớp chưa gắn được mã giảng viên (mã 0) mở trang giảng viên theo tên đọc từ tệp
      // import, khoanh trong khoa/viện của chính lớp này. Lớp chưa có người dạy thì
      // không có gì để mở nên hiện chữ thường.
      render: (item) => {
        const unidentifiedName = item.lecturerId > 0 ? null : item.unidentifiedLecturerName;
        if (item.lecturerId <= 0 && !unidentifiedName) {
          return <span className="catalog-cell-primary">{item.lecturerName}</span>;
        }
        return (
          <button
            type="button"
            className="report-lecturer-link"
            onClick={() => {
              if (unidentifiedName) {
                openUnidentifiedLecturer(unidentifiedName, item.facultyId);
              } else {
                void openLecturer(item.lecturerId, item.lecturerName);
              }
            }}
            title={`Xem chi tiết ${item.lecturerName}`}
          >
            {item.lecturerName}
          </button>
        );
      },
    },
    {
      key: 'classSize',
      header: 'Tổng số phiếu phải thu',
      sortValue: (item) => item.classSize,
      filterValue: (item) => String(item.classSize),
      numeric: true,
      width: '4%',
      render: (item) => <span className="catalog-cell-number">{item.classSize}</span>,
    },
    {
      key: 'responseCount',
      header: 'Số phiếu đã thu',
      sortValue: (item) => item.responseCount,
      filterValue: (item) => String(item.responseCount),
      numeric: true,
      width: '5%',
      render: (item) => <span className="catalog-cell-number">{item.responseCount}</span>,
    },
    {
      key: 'validResponseCount',
      header: 'Số phiếu hợp lệ',
      sortValue: (item) => item.validResponseCount,
      filterValue: (item) => String(item.validResponseCount),
      numeric: true,
      width: '5%',
      render: (item) => <span className="catalog-cell-number">{item.validResponseCount}</span>,
    },
    {
      key: 'invalidResponseCount',
      header: 'Số phiếu không hợp lệ',
      sortValue: (item) => item.invalidResponseCount,
      filterValue: (item) => String(item.invalidResponseCount),
      numeric: true,
      width: '5%',
      render: (item) => (
        <span
          className={item.invalidResponseCount > 0
            ? 'catalog-cell-number reports-invalid-count'
            : 'catalog-cell-number'}
        >
          {item.invalidResponseCount}
        </span>
      ),
    },
    {
      /*
        Tỷ lệ phản hồi = số phiếu đã thu / tổng số phiếu phải thu, đúng vế thứ nhất của ngưỡng tính
        điểm. Trước đây cột này lấy phiếu hợp lệ / tổng số phiếu phải thu nhưng vẫn gọi là "Hoàn
        thành", nên đọc ra không khớp với ngưỡng đang cấu hình ở phần cài đặt.
        Dòng phụ "x/y hợp lệ" bỏ đi vì đã có cột Số phiếu hợp lệ riêng.
      */
      key: 'responseRate',
      header: 'Tỷ lệ phản hồi (%)',
      sortValue: (item) => responseRateOf(item.responseCount, item.classSize),
      filterValue: (item) => String(Math.round(responseRateOf(item.responseCount, item.classSize))),
      numeric: true,
      width: '5%',
      render: (item) => {
        const rate = responseRateOf(item.responseCount, item.classSize);
        return (
          <span
            className="catalog-cell-number"
            style={{ color: completionColor(rate), fontWeight: 700 }}
          >
            {formatDecimal(rate, 3)}
          </span>
        );
      },
    },
    {
      key: 'validRate',
      header: 'Tỷ lệ phiếu hợp lệ (%)',
      sortValue: (item) => validRateOf(item.validResponseCount, item.responseCount),
      filterValue: (item) => `${formatDecimal(validRateOf(item.validResponseCount, item.responseCount), 3)}`,
      numeric: true,
      width: '5%',
      render: (item) => (
        <span className="catalog-cell-number">
          {formatDecimal(validRateOf(item.validResponseCount, item.responseCount), 3)}
        </span>
      ),
    },
    {
      key: 'averageScore',
      header: 'Điểm trung bình',
      sortValue: (item) => item.averageScore,
      filterValue: (item) => formatDecimal(item.averageScore, 3),
      numeric: true,
      width: '5%',
      render: (item) => (
        <span className="catalog-score" style={{ color: scoreColor(item.averageScore) }}>
          {item.averageScore > 0 ? formatDecimal(item.averageScore, 3) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'center',
      width: '7%',
      render: (item) => (
        <button
          type="button"
          className="btn btn-secondary btn-sm reports-row-action"
          title={`Xem kết quả ${item.courseCode} - ${item.sectionName}`}
          onClick={() => {
            openSurvey(
              item.courseSectionSurveyId,
              `${item.courseCode} - ${item.courseName} (${item.sectionName})`,
            );
          }}
        >
          <ClipboardList className="operation-icon" aria-hidden="true" />
          Xem KQ
        </button>
      ),
    },
  ];

  // Cùng bộ cột, cùng cách tính và cùng bộ lọc với bảng tra cứu chi tiết.
  const sectionColumns: Column<LecturerPerformanceReport['sections'][number]>[] = [
    {
      key: 'courseCode',
      header: 'Mã Học phần',
      width: '10%',
      sortValue: (item) => item.courseCode,
      filterValue: (item) => item.courseCode,
      render: (item) => <span className="catalog-cell-primary">{item.courseCode}</span>,
    },
    {
      key: 'courseName',
      header: 'Tên học phần',
      width: '22%',
      sortValue: (item) => item.courseName,
      filterValue: (item) => item.courseName,
      render: (item) => <span className="catalog-cell-primary">{item.courseName}</span>,
    },
    {
      key: 'sectionName',
      header: 'Nhóm lớp',
      width: '9%',
      sortValue: (item) => item.sectionName,
      filterValue: (item) => item.sectionName,
      render: (item) => <span className="operations-code">{item.sectionName}</span>,
    },
    {
      key: 'classSize',
      header: 'Tổng số phiếu phải thu',
      width: '6%',
      numeric: true,
      sortValue: (item) => item.classSize,
      filterValue: (item) => String(item.classSize),
      render: (item) => <span className="catalog-cell-number">{item.classSize}</span>,
    },
    {
      key: 'responseCount',
      header: 'Số phiếu đã thu',
      width: '9%',
      numeric: true,
      sortValue: (item) => item.responseCount,
      filterValue: (item) => String(item.responseCount),
      render: (item) => <span className="catalog-cell-number">{item.responseCount}</span>,
    },
    {
      key: 'invalidResponseCount',
      header: 'Phiếu lỗi',
      width: '9%',
      numeric: true,
      sortValue: (item) => item.invalidResponseCount,
      filterValue: (item) => String(item.invalidResponseCount),
      render: (item) => (
        <span
          className={item.invalidResponseCount > 0
            ? 'catalog-cell-number reports-invalid-count'
            : 'catalog-cell-number'}
        >
          {item.invalidResponseCount}
        </span>
      ),
    },
    {
      key: 'completionRate',
      header: 'Hoàn thành (%)',
      width: '15%',
      numeric: true,
      sortValue: (item) => item.completionRate,
      filterValue: (item) => String(Math.round(item.completionRate)),
      render: (item) => (
        <>
          <span className="reports-progress-cell">
            <span className="reports-progress">
              <span style={{ width: `${Math.min(100, item.completionRate)}%`, background: completionColor(item.completionRate) }} />
            </span>
            <span style={{ color: completionColor(item.completionRate), fontWeight: 700, fontSize: 13 }}>
              {formatDecimal(item.completionRate, 3)}
            </span>
          </span>
          <span className="catalog-secondary-value reports-progress-sub">
            {item.validResponseCount}/{item.classSize} hợp lệ
          </span>
        </>
      ),
    },
    {
      key: 'averageScore',
      header: 'Điểm TB',
      width: '9%',
      numeric: true,
      sortValue: (item) => item.averageScore,
      filterValue: (item) => formatDecimal(item.averageScore, 3),
      render: (item) => (
        <span className="catalog-score" style={{ color: scoreColor(item.averageScore) }}>
          {item.averageScore > 0 ? formatDecimal(item.averageScore, 3) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'center',
      width: '11%',
      render: (item) => (
        <button
          type="button"
          className="btn btn-secondary btn-sm reports-row-action"
          title={`Xem kết quả ${item.courseCode} - ${item.sectionName}`}
          onClick={() => openSurvey(
            item.courseSectionSurveyId,
            `${item.courseCode} - ${item.courseName} (${item.sectionName})`,
            lecturer?.lecturerId,
          )}
        >
          <ClipboardList className="operation-icon" aria-hidden="true" />
          Xem KQ
        </button>
      ),
    },
  ];

  return (
    <div className="survey-operations-page reports-module">
      {/* Thanh tiêu đề + chọn học kỳ */}
      {/* Bốn phần nằm ngang một hàng ở góc trái trên, đứng trước tiêu đề — giống
          hệt trang Tổng quan khảo sát. */}
      <section className="statistics-toolbar">
        <label className="form-group">
          <span>Học kỳ</span>
          <select
            id="reports-semester"
            value={selectedSemesterId ?? ''}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isNaN(next)) return;
              changeSemester(next);
            }}
          >
            {academicYears.flatMap((year) =>
              year.semesters.map((semester) => (
                <option key={semester.semesterId} value={semester.semesterId}>
                  {semester.semesterName} · {year.academicYearName}
                </option>
              )),
            )}
          </select>
        </label>

        {/* Đợt khảo sát áp cho cả trang: tổng quan, tra cứu và tổng hợp đơn vị. */}
        <div className="form-group">
          <span>Đợt khảo sát</span>
          <CampaignSelect
            id="reports-campaign"
            value={semesterSurveyId ? String(semesterSurveyId) : ''}
            disabled={semesterSurveys.length === 0}
            placeholder={
              semesterSurveys.length === 0 ? 'Kỳ này chưa có đợt khảo sát' : 'Chọn đợt khảo sát'
            }
            onChange={(next) => changeSemesterSurvey(next ? Number(next) : undefined)}
            options={semesterSurveys.map((survey) => ({
              value: String(survey.semesterSurveyId),
              label: survey.surveyName,
            }))}
          />
        </div>

        <div className="statistics-toolbar-actions">
          <UpdateScoresButton
            semesterSurveyId={semesterSurveyId}
            onUpdated={() => setReloadToken((value) => value + 1)}
          />
        </div>
      </section>

      <div className="reports-header">
        <h1 className="reports-title">
          <BarChart3 className="operation-icon" aria-hidden="true" />
          Thống kê kết quả khảo sát học phần
        </h1>
      </div>

      {/* Ngưỡng quyết định lớp nào được gộp vào mọi con số của trang này, nên in
          thẳng ra thay vì để người xem đoán vì sao thiếu lớp. */}
      <ScoringConfigNote />

      {resultsNotPublished && (
        <div className="operations-feedback operations-feedback--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{surveyErrorMessage('SURVEY_RESULTS_NOT_PUBLISHED')}</span>
        </div>
      )}

      {/* Breadcrumb chỉ có việc khi đã đi sâu vào giảng viên / bài khảo sát; ở mức
          danh sách nó chỉ lặp lại đúng những gì thanh tab và ô chọn kỳ đã nói. */}
      {(lecturer || surveyTitle) && (
        <nav className="reports-breadcrumb" aria-label="Đường dẫn thống kê">
          <button type="button" className="reports-crumb reports-crumb--link" onClick={backToOverview}>
            Kết quả khảo sát
          </button>
          {lecturer && (
            <>
              <ChevronRight className="operation-icon reports-crumb-sep" aria-hidden="true" />
              <button type="button" className="reports-crumb reports-crumb--link" onClick={backToLecturer}>
                {lecturer.fullName}
              </button>
            </>
          )}
          {surveyTitle && (
            <>
              <ChevronRight className="operation-icon reports-crumb-sep" aria-hidden="true" />
              <span className="reports-crumb reports-crumb--current">{surveyTitle}</span>
            </>
          )}
          <span className="reports-breadcrumb-semester">{semesterLabel}</span>
        </nav>
      )}

      {loadError && (
        <div className="operations-feedback operations-feedback--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {/* CẤP CHI TIẾT BÀI KHẢO SÁT */}
      {isSurveyMode && surveyId !== null && (
        <SectionSurveyResponsesPage
          key={reloadToken}
          courseSectionSurveyId={surveyId}
          onBack={backToLecturer}
          backLabel={lecturer ? `Quay lại đánh giá ${lecturer.fullName}` : 'Quay lại kết quả khảo sát'}
          breadcrumb={surveyBreadcrumb}
          showAnalysis
        />
      )}

      {/* CẤP CHI TIẾT GIẢNG VIÊN */}
      {isLecturerMode && lecturer && (
        <div className="reports-drill-grid">
          {lecDetailLoading ? (
            <div className="operations-empty" role="status">
              <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
              <strong>Đang tải chi tiết đánh giá giảng viên...</strong>
            </div>
          ) : lecturerDetail ? (
            <>
              {/* Cùng kiểu dải mỏng với trang chi tiết bài khảo sát. */}
              <section className="reports-summary-band" aria-label="Tóm tắt đánh giá giảng viên">
                <div className="reports-summary-main">
                  <GraduationCap className="operation-icon" aria-hidden="true" />
                  <h2>{lecturerDetail.fullName}</h2>
                  <p>
                    {lecturerDetail.departmentName} · {lecturerDetail.facultyName}
                  </p>
                </div>
                {/* Ba ô này và bảng phân tích bên dưới phải cùng một tập lớp: lớp đã
                    chốt điểm ở lần bấm "Tính lại điểm" gần nhất. */}
                <div className="reports-summary-metrics">
                  <span className="reports-exec-stat" title="Chỉ gộp phiếu hợp lệ của lớp đủ điều kiện">
                    Điểm trung bình
                    <strong style={{ color: scoreColor(lecturerDetail.averageScore) }}>
                      {lecturerDetail.averageScore > 0
                        ? formatDecimal(lecturerDetail.averageScore, 3)
                        : '—'}
                    </strong>
                    <small>/ 5,0</small>
                  </span>
                  <span className="reports-exec-stat" title="Phiếu hợp lệ của lớp đủ điều kiện, dùng để tính điểm">
                    Phiếu dùng để tính điểm
                    <strong>{lecturerDetail.scoredValidResponseCount.toLocaleString('vi-VN')}</strong>
                    <small>
                      / {lecturerDetail.totalResponses.toLocaleString('vi-VN')} phiếu hợp lệ
                    </small>
                  </span>
                  <span className="reports-exec-stat" title="Số lớp học phần đã phát phiếu">
                    Số lớp học phần
                    <strong>{lecturerDetail.courseSectionCount}</strong>
                  </span>
                </div>
              </section>

              {renderQuestionAnalysis(lecturerDetail.questionRatings)}

              <DataTable
                columns={sectionColumns}
                data={lecturerDetail.sections ?? []}
                exportConfig={{
                  title: `BÁO CÁO KẾT QUẢ ĐÁNH GIÁ GIẢNG VIÊN ${lecturerDetail.fullName.toUpperCase()}`,
                  fileName: `bao-cao-danh-gia-giang-vien-${lecturerDetail.fullName}-${semesterLabel}`,
                  subtitle: `${lecturerDetail.departmentName} · ${lecturerDetail.facultyName}`,
                  // Đi từ mô-đun xuống tận giảng viên đang xem.
                  breadcrumb: [...reportRootBreadcrumb, 'Giảng viên', lecturerDetail.fullName],
                  info: {
                    'Giảng viên': lecturerDetail.fullName,
                    'Đơn vị': `${lecturerDetail.departmentName} · ${lecturerDetail.facultyName}`,
                    'Điểm trung bình': `${formatDecimal(lecturerDetail.averageScore, 3)} / 5,0`,
                    'Tổng phiếu hợp lệ': lecturerDetail.totalResponses.toLocaleString('vi-VN'),
                    'Số lớp học phần': lecturerDetail.courseSectionCount,
                  },
                  // Đúng thứ tự và đúng tiêu đề của bảng trên màn hình, chỉ bỏ cột
                  // "Hoàn thành" dạng thanh tiến độ và cột Thao tác (là nút bấm): cột
                  // số của thanh đó vẫn xuất kèm con số tỷ lệ y như đang hiển thị.
                  columns: [
                    { key: 'courseCode', header: 'Mã Học phần', width: 12, align: 'left' as const },
                    { key: 'courseName', header: 'Tên học phần', width: 30 },
                    { key: 'sectionName', header: 'Nhóm lớp', width: 12, align: 'left' as const },
                    { key: 'classSize', header: 'Tổng số phiếu phải thu', width: 12, type: 'number' as const, align: 'right' as const },
                    { key: 'responseCount', header: 'Số phiếu đã thu', width: 12, type: 'number' as const, align: 'right' as const },
                    { key: 'invalidResponseCount', header: 'Phiếu lỗi', width: 10, type: 'number' as const, align: 'right' as const },
                    {
                      key: 'completionRate',
                      header: 'Hoàn thành (%)',
                      width: 14,
                      type: 'string' as const,
                      align: 'right' as const,
                      // Lấy thẳng con số backend trả về, không tự tính lại: màn hình
                      // cũng in đúng con số đó với 3 chữ số thập phân.
                      format: (val: any) => formatDecimal(Number(val ?? 0), 3),
                    },
                    {
                      key: 'averageScore',
                      header: 'Điểm TB',
                      width: 12,
                      type: 'number' as const,
                      align: 'right' as const,
                      format: (val: any) => (Number(val) > 0 ? Number(val).toFixed(3) : '—'),
                    },
                  ],
                }}
                emptyMessage="Giảng viên này chưa có lớp học phần nào trong học kỳ."
                keyExtractor={(item) => String(item.courseSectionSurveyId)}
                showIndex={false}
                pageSize={20}
              />
            </>
          ) : null}
        </div>
      )}

      {/* CẤP CHI TIẾT THEO PHẠM VI: khoa/viện → bộ môn → học phần → lớp học phần */}
      {isScopeMode && scope && semesterSurveyId !== undefined && (
        <ScopeAnalysisDetail
          key={`${scope.type}-${scope.id}-${reloadToken}`}
          semesterSurveyId={semesterSurveyId}
          selection={scope}
          onBack={backFromScope}
          onDrillDown={drillDownScope}
          onOpenSurvey={(courseSectionSurveyId) => openSurvey(courseSectionSurveyId)}
        />
      )}

      {/* CẤP TỔNG HỢP: tổng quan toàn trường + bộ lọc + KPI + xếp hạng + bảng kết quả */}
      {!isLecturerMode && !isSurveyMode && !isScopeMode && (
        <div className="reports-overview">
          <nav className="reports-workspace-tabs" aria-label="Chế độ xem báo cáo" role="tablist">
            {allowedWorkspaces.includes('overview') && (
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'overview'}
                className={`reports-workspace-tab${workspace === 'overview' ? ' is-active' : ''}`}
                title="Chỉ số và xu hướng toàn trường"
                onClick={() => navigateToWorkspace('overview')}
              >
                <LayoutDashboard className="operation-icon" aria-hidden="true" />
                <strong>Tổng quan</strong>
              </button>
            )}
            {allowedWorkspaces.includes('faculties') && (
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'faculties'}
                className={`reports-workspace-tab${workspace === 'faculties' ? ' is-active' : ''}`}
                onClick={() => navigateToWorkspace('faculties')}
              >
                <Building2 className="operation-icon" aria-hidden="true" />
                <strong>Theo Khoa/Viện</strong>
              </button>
            )}
            {allowedWorkspaces.includes('departments') && (
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'departments'}
                className={`reports-workspace-tab${workspace === 'departments' ? ' is-active' : ''}`}
                onClick={() => navigateToWorkspace('departments')}
              >
                <Network className="operation-icon" aria-hidden="true" />
                <strong>Theo Bộ môn</strong>
              </button>
            )}
            {allowedWorkspaces.includes('courses') && (
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'courses'}
                className={`reports-workspace-tab${workspace === 'courses' ? ' is-active' : ''}`}
                onClick={() => navigateToWorkspace('courses')}
              >
                <BookOpen className="operation-icon" aria-hidden="true" />
                <strong>Theo Học phần</strong>
              </button>
            )}
            {allowedWorkspaces.includes('comments') && (
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'comments'}
                className={`reports-workspace-tab${workspace === 'comments' ? ' is-active' : ''}`}
                title="Phân tích và tổng hợp ý kiến mở do sinh viên đóng góp"
                onClick={() => navigateToWorkspace('comments')}
              >
                <MessageSquareText className="operation-icon" aria-hidden="true" />
                <strong>Phân tích ý kiến mở</strong>
              </button>
            )}
            {/* Ba tab trên là ba cách gộp số liệu; tab này là bảng từng dòng lớp để
                lọc và mở chi tiết nên đứng cuối cùng. */}
            {allowedWorkspaces.includes('details') && (
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'details'}
                className={`reports-workspace-tab${workspace === 'details' ? ' is-active' : ''}`}
                title="Lọc và mở kết quả từng lớp"
                onClick={() => navigateToWorkspace('details')}
              >
                <ListFilter className="operation-icon" aria-hidden="true" />
                <strong>Tra cứu chi tiết</strong>
              </button>
            )}
          </nav>

          {allowedWorkspaces.length === 0 && (
            <div className="reports-chart-empty" role="status" style={{ padding: '32px 16px', textAlign: 'center', color: '#68737d' }}>
              Vai trò này chưa được mở tab nào trong Thống kê &amp; Báo cáo. Liên hệ Quản trị viên để được cấp quyền.
            </div>
          )}

          {/* Bảng tổng quan toàn trường (executive dashboard) */}
          {activeWorkspace === 'overview' && selectedSemesterId !== undefined && (
            <SchoolSurveyOverview
              key={`${selectedSemesterId}-${reloadToken}`}
              semesterId={selectedSemesterId}
              semesterSurveyId={semesterSurveyId}
              analysisView={analysisView}
              onAnalysisViewChange={changeAnalysisView}
              allowedAnalysisViews={allowedAnalysisViews}
              onDrillDown={handleOverviewDrillDown}
            />
          )}

          {activeWorkspace === 'faculties' && (
            <div className="reports-aggregate-workspace" role="tabpanel">
              <RankedUnitTable
                title="Kết quả theo Khoa/Viện"
                data={facultyRankings}
                itemLabel="khoa/viện"
                columns={facultyRankColumns((id) => openAnalysisDetail('faculty', id))}
                exportColumns={facultyRankExportColumns}
                exportTitle="BÁO CÁO XẾP HẠNG KẾT QUẢ THEO KHOA/VIỆN"
                exportFileName="xep-hang-khoa-vien"
                exportSheetName="Xep hang khoa vien"
                breadcrumb={facultyTabBreadcrumb}
                buildExtraSheets={buildFacultySheets}
              />
            </div>
          )}

          {activeWorkspace === 'departments' && (
            <div className="reports-aggregate-workspace" role="tabpanel">
              <RankedUnitTable
                title="Kết quả theo Bộ môn"
                data={departmentRankings}
                itemLabel="bộ môn"
                columns={departmentRankColumns((id) => openAnalysisDetail('department', id))}
                exportColumns={departmentRankExportColumns}
                exportTitle="BÁO CÁO XẾP HẠNG KẾT QUẢ THEO BỘ MÔN"
                exportFileName="xep-hang-bo-mon"
                exportSheetName="Xep hang bo mon"
                breadcrumb={departmentTabBreadcrumb}
              />
            </div>
          )}

          {activeWorkspace === 'courses' && (
            <div className="reports-aggregate-workspace" role="tabpanel">
              <RankedCourseTable
                data={courseRankings}
                breadcrumb={courseTabBreadcrumb}
                onOpenDetail={(id) => openAnalysisDetail('course', id)}
              />
            </div>
          )}

          {activeWorkspace === 'comments' && (
            selectedSemesterId !== undefined ? (
              <OpenCommentAnalysis
                key={`${selectedSemesterId}-${semesterSurveyId}-${reloadToken}`}
                semesterId={selectedSemesterId}
                semesterSurveyId={semesterSurveyId}
                semesterLabel={semesterLabel}
                surveyName={semesterSurveys.find((s) => s.semesterSurveyId === semesterSurveyId)?.surveyName}
                faculties={faculties}
                departments={departments}
                lecturers={lecturers}
                onOpenSurvey={openSurvey}
                onOpenLecturer={(lecId, lecName) => {
                  const lec = lecturers.find((l) => l.lecturerId === lecId);
                  openLecturer(lecId, lecName || lec?.fullName || '');
                }}
                onOpenUnidentifiedLecturer={openUnidentifiedLecturer}
              />
            ) : (
              <div className="operations-empty" role="status">
                <strong>Vui lòng chọn học kỳ để xem phân tích ý kiến mở.</strong>
              </div>
            )
          )}

          {/*
            Dải số liệu là phần tổng của chính bảng bên dưới, nên từng ô ứng đúng
            một cột của bảng và dùng đúng tên cột đó. Trước đây "Chỉ tiêu phiếu" và
            "Đã thu nộp" không có cột nào cùng tên, mà "Đã thu nộp" lại đang cộng
            phiếu hợp lệ chứ không phải phiếu đã thu.
          */}
          {activeWorkspace === 'details' && (
          <div id="reports-detail-workspace" className="reports-kpi-band" aria-label="Tổng quan kết quả đang lọc">
            <span className="reports-kpi-item" title="Số lớp học phần trong bộ lọc">
              Số lớp khảo sát
              <strong>{kpi.classCount.toLocaleString('vi-VN')}</strong>
            </span>
            <span className="reports-kpi-item" title="Tổng số phiếu phải thu của các lớp đang lọc">
              Tổng số phiếu phải thu
              <strong>{kpi.totalTarget.toLocaleString('vi-VN')}</strong>
            </span>
            <span className="reports-kpi-item" title="Mọi lượt nộp, kể cả phiếu bị lọc nhiễu">
              Số phiếu đã thu
              <strong>{kpi.totalResponses.toLocaleString('vi-VN')}</strong>
            </span>
            <span className="reports-kpi-item" title="Phiếu qua được bộ lọc nhiễu">
              Số phiếu hợp lệ
              <strong>{kpi.totalCollected.toLocaleString('vi-VN')}</strong>
            </span>
            <span className="reports-kpi-item" title="Phiếu bị bộ lọc nhiễu loại">
              Số phiếu không hợp lệ
              <strong>{kpi.totalInvalid.toLocaleString('vi-VN')}</strong>
            </span>
            <span className="reports-kpi-item" title="Số phiếu đã thu / tổng số phiếu phải thu">
              Tỷ lệ phản hồi
              <strong>{formatPercent(kpi.responseRate, 3)}</strong>
            </span>
          </div>
          )}

          {/* Tổng hợp kết quả theo Khoa / Viện và Bộ môn */}
          {/* Bảng kết quả chi tiết */}
          {activeWorkspace === 'details' && (
          <section
            className="reports-table-section"
            id="reports-results"
            aria-label="Bảng kết quả chi tiết"
          >
            <DataTable
              columns={resultColumns}
              data={results}
              searchValue={search}
              onSearchChange={setSearch}
              onVisibleDataChange={handleVisibleResultRows}
              searchPlaceholder="Mã HP, tên HP, nhóm lớp, giảng viên..."
              exportConfig={{
                title: 'BÁO CÁO KẾT QUẢ KHẢO SÁT HỌC PHẦN CHI TIẾT',
                fileName: `bao-cao-ket-qua-khao-sat-hoc-phan-chi-tiet-${semesterLabel}`,
                subtitle: semesterLabel,
                breadcrumb: detailsTabBreadcrumb,
                info: {
                  'Học kỳ': semesterLabel,
                  'Số lớp khảo sát': kpi.classCount,
                  'Tổng số phiếu phải thu': kpi.totalTarget,
                  'Số phiếu đã thu': `${kpi.totalResponses} (đạt ${formatPercent(kpi.responseRate, 3)})`,
                  'Số phiếu hợp lệ': kpi.totalCollected,
                  'Số phiếu không hợp lệ': kpi.totalInvalid,
                },
                summaryNotes: [
                  'Điểm trung bình học phần được tính trên thang điểm 5.0 từ các phiếu đánh giá hợp lệ.',
                  'Tỷ lệ phản hồi = Số phiếu đã thu / Tổng số phiếu phải thu.',
                  'Phiếu không hợp lệ là phiếu bị bộ lọc nhiễu loại và không tham gia tính điểm.',
                ],
                sheets: [
                  {
                    sheetName: 'Ket qua Lop HP',
                    title: `1. DANH SÁCH KẾT QUẢ KHẢO SÁT LỚP HỌC PHẦN (${results.length} LỚP)`,
                    columns: [
                      { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
                      { key: 'departmentName', header: 'Bộ môn', width: 20 },
                      { key: 'courseName', header: 'Học phần', width: 28 },
                      { key: 'courseCode', header: 'Mã học phần', width: 14, align: 'left' as const },
                      { key: 'sectionName', header: 'Lớp học phần', width: 10, align: 'left' as const },
                      { key: 'lecturerName', header: 'Giảng viên', width: 22 },
                      { key: 'classSize', header: 'Tổng số phiếu phải thu', width: 10, type: 'number' as const, align: 'right' as const },
                      { key: 'responseCount', header: 'Số phiếu đã thu', width: 14, type: 'number' as const, align: 'right' as const },
                      { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 14, type: 'number' as const, align: 'right' as const },
                      { key: 'invalidResponseCount', header: 'Số phiếu không hợp lệ', width: 18, type: 'number' as const, align: 'right' as const },
                      {
                        key: 'responseRate',
                        header: 'Tỷ lệ phản hồi (%)',
                        width: 14,
                        type: 'string' as const,
                        align: 'right' as const,
                        format: (val: any) => formatDecimal(Number(val), 3),
                      },
                      {
                        key: 'validRate',
                        header: 'Tỷ lệ phiếu hợp lệ (%)',
                        width: 16,
                        type: 'string' as const,
                        align: 'right' as const,
                        format: (val: any) => formatDecimal(Number(val), 3),
                      },
                      {
                        key: 'averageScore',
                        header: 'Điểm trung bình',
                        width: 14,
                        type: 'number' as const,
                        align: 'right' as const,
                        format: (val: any) => (Number(val) > 0 ? Number(val).toFixed(3) : '—'),
                      },
                    ],
                    data: exportVisibleResults,
                  },
                  {
                    sheetName: 'Lop diem thap (<3.50)',
                    title: '2. DANH SÁCH LỚP CÓ ĐIỂM TRUNG BÌNH THẤP (< 3,50)',
                    subtitle: 'Các lớp cần ban chủ nhiệm khoa và bộ môn phối hợp rà soát',
                    columns: [
                      { key: 'sectionCode', header: 'Mã lớp HP', width: 14, align: 'left' as const },
                      { key: 'courseName', header: 'Tên học phần', width: 28 },
                      { key: 'lecturerName', header: 'Giảng viên', width: 22 },
                      { key: 'departmentName', header: 'Bộ môn', width: 20 },
                      { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
                      { key: 'classSize', header: 'Tổng số phiếu phải thu', width: 10, type: 'number' as const, align: 'right' as const },
                      { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 12, type: 'number' as const, align: 'right' as const },
                      {
                        key: 'averageScore',
                        header: 'Điểm TB',
                        width: 12,
                        type: 'number' as const,
                        align: 'right' as const,
                        format: (val: any) => (Number(val) > 0 ? Number(val).toFixed(3) : '—'),
                      },
                    ],
                    data: results.filter((r) => (r.averageScore ?? 0) > 0 && (r.averageScore ?? 0) < 3.5),
                  },
                ],
              }}
              toolbarActions={scopeChips.length > 0 ? (
                <div className="reports-scope-chips">
                  {scopeChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      className="reports-scope-chip"
                      onClick={chip.onClear}
                      title={`Bỏ lọc ${chip.label}`}
                    >
                      {chip.label}
                      <X aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : undefined}
              emptyMessage={
                resultsLoading
                  ? 'Đang tải kết quả...'
                  : 'Không có lớp học phần nào khớp với bộ lọc hiện tại.'
              }
              keyExtractor={(item) => String(item.courseSectionSurveyId)}
              showIndex={false}
              pageSize={20}
              sortKey={resultSortKey}
              sortDirection={resultSortDirection}
              onSortChange={changeResultSort}
            />
          </section>
          )}
        </div>
      )}
    </div>
  );
};
