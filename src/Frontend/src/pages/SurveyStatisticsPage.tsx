import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { useSemester } from '../context/semesterContext';
import { TablePagination } from '../components/TablePagination';
import { ExportDropdown } from '../components/ExportDropdown';
import { ApiError } from '../services/apiClient';
import { surveyApi, surveyErrorMessage } from '../services/surveyApi';
import type { SectionStatisticsRow, SemesterSurveyStatistics } from '../services/surveyApi';
import { useSemesterSurveys } from '../hooks/useSemesterSurveys';
import { useColumnFilters, type FilterableColumn } from '../hooks/useColumnFilters';
import { buildReportHash } from './reportRoute';
import { UpdateScoresButton } from '../components/UpdateScoresButton';
import { PublishResultsButton } from '../components/PublishResultsButton';
import { ScoringConfigNote } from '../components/ScoringConfigNote';
import { useScoringThresholds } from '../hooks/useScoringThresholds';
import {
  hasEnoughResponsesToScore,
  responseRateOf,
  validRateOf,
} from '../utils/reportThresholds';
import { foldVietnamese } from '../utils/vietnamese';
import '../styles/survey-operations.css';
import '../styles/survey-statistics.css';
import '../styles/catalogs.css';
import { formatDecimal, formatDecimalOrDash, formatPercent } from '../utils/formatNumber';
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

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
    .format(new Date(value));
}

/** Điểm dưới ngưỡng này thì tô đậm để dễ nhặt ra lớp cần để ý. */
const weakScoreThreshold = 3.5;
const statisticsPageSize = 20;

export const SurveyStatisticsPage: React.FC = () => {
  const { academicYears, activeSemesterId } = useSemester();

  const [semesterId, setSemesterId] = useState<string>(() =>
    activeSemesterId ? String(activeSemesterId) : ''
  );
  useEffect(() => {
    if (activeSemesterId) setSemesterId(String(activeSemesterId));
  }, [activeSemesterId]);

  const {
    semesterSurveys,
    loading: campaignsLoading,
    error: campaignsError,
  } = useSemesterSurveys(semesterId);
  const [semesterSurveyId, setSemesterSurveyId] = useState<string>(getActiveSemesterSurveyId);
  const [statistics, setStatistics] = useState<SemesterSurveyStatistics | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Hai vòng lọc lớp được tính điểm. Đọc từ cấu hình chung để bảng này và các
  // trang báo cáo luôn nói cùng một con số.
  const thresholds = useScoringThresholds();

  // Danh sách đợt do useSemesterSurveys lo; ở đây chỉ chọn lại đợt cho khớp danh sách.
  useEffect(() => {
    if (!semesterId) {
      setSemesterSurveyId('');
      setStatistics(null);
      return;
    }
    setSemesterSurveyId((current) => selectAvailableSemesterSurveyId(semesterSurveys, current));
  }, [semesterId, semesterSurveys]);

  useEffect(() => {
    if (campaignsError) setLoadError(messageFrom(campaignsError));
  }, [campaignsError]);

  const loadStatistics = useCallback(async () => {
    if (!semesterSurveyId) {
      setStatistics(null);
      return;
    }
    setLoading(true);
    try {
      setStatistics(await surveyApi.semesterSurveyStatistics(Number(semesterSurveyId)));
      setLoadError(null);
    } catch (error) {
      setLoadError(messageFrom(error));
      setStatistics(null);
    } finally {
      setLoading(false);
    }
  }, [semesterSurveyId]);

  useEffect(() => {
    void loadStatistics();
  }, [loadStatistics]);

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

  // Bám vào chính statistics chứ không vào mảng dẫn xuất, vì mảng dẫn xuất tạo
  // tham chiếu mới mỗi lần render nên useMemo sẽ chạy lại vô ích.
  const columns = useMemo(() => statistics?.questionColumns ?? [], [statistics]);
  const rows = useMemo(() => statistics?.rows ?? [], [statistics]);
  const lastCalculatedAt = statistics?.lastCalculatedAt ?? null;

  /**
   * Lớp nào đủ điều kiện tính điểm. Một lớp đủ điều kiện khi đã có điểm chốt ở lần
   * bấm Cập nhật điểm gần nhất (câu UPDATE chỉ chốt điểm cho lớp qua hai vòng lọc),
   * hoặc số phiếu hiện tại đã qua hai vòng lọc nhưng chưa được chốt. Lớp không đủ
   * điều kiện vẫn không có điểm như trước.
   */
  const eligibleIds = useMemo(() => {
    const ids = new Set<number>();
    for (const row of rows) {
      const isEligibleNow = hasEnoughResponsesToScore(
        row.classSize,
        row.totalResponseCount,
        row.validResponseCount,
        thresholds
      );
      if (isEligibleNow || row.averageScore !== null) ids.add(row.courseSectionSurveyId);
    }
    return ids;
  }, [rows, thresholds]);
  const eligibleCount = eligibleIds.size;
  const ineligibleCount = rows.length - eligibleCount;

  // Ô tìm kiếm và ba ô chọn nhóm lớp phía trên bảng. Chỉ chọn được một nhóm.
  const [searchText, setSearchText] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState<'all' | 'eligible' | 'ineligible'>('all');

  // Một bảng chung: lớp đủ điều kiện lên trước (trong đó lớp đã chốt điểm lên trên
  // lớp đang chờ chốt), lớp không đủ điều kiện xuống dưới. Sort của JS ổn định nên
  // trong từng nhóm vẫn giữ thứ tự mã học phần / tên lớp của backend.
  //
  // Lọc theo nhóm và theo ô tìm kiếm TRƯỚC khi đưa vào bộ lọc cột, để số kết quả và
  // phân trang tính trên đúng phần đang hiện. Tìm không phân biệt dấu, theo mã / tên
  // học phần, giảng viên, bộ môn và khoa/viện.
  const orderedRows = useMemo(() => {
    const keyword = foldVietnamese(searchText).toLowerCase();
    const rank = (row: SectionStatisticsRow) =>
      !eligibleIds.has(row.courseSectionSurveyId) ? 2 : row.averageScore === null ? 1 : 0;
    return rows
      .filter((row) => {
        const isEligible = eligibleIds.has(row.courseSectionSurveyId);
        if (eligibilityFilter === 'eligible' && !isEligible) return false;
        if (eligibilityFilter === 'ineligible' && isEligible) return false;
        if (!keyword) return true;
        return foldVietnamese(
          [row.courseCode, row.courseName, row.lecturerName, row.departmentName, row.facultyName]
            .join(' '),
        )
          .toLowerCase()
          .includes(keyword);
      })
      .sort((left, right) => rank(left) - rank(right));
  }, [rows, eligibleIds, eligibilityFilter, searchText]);

  /**
   * Cột lọc được. CỐ Ý bỏ qua 30 cột điểm từng câu: lọc theo một điểm lẻ như
   * "4.33" không giúp được gì, mà mỗi menu lại phải quét lại toàn bộ gần 2000
   * dòng để dựng danh sách giá trị — thêm 30 menu là mỗi lần vẽ lại tốn gấp mười.
   */
  const filterColumns = useMemo<FilterableColumn<SectionStatisticsRow>[]>(
    () => [
      { key: 'courseCode', value: (row) => row.courseCode },
      { key: 'sectionName', value: (row) => row.sectionName },
      { key: 'courseName', value: (row) => row.courseName },
      { key: 'facultyName', value: (row) => row.facultyName },
      { key: 'departmentName', value: (row) => row.departmentName },
      { key: 'lecturerName', value: (row) => row.lecturerName },
      { key: 'classSize', value: (row) => String(row.classSize), numeric: true },
      {
        key: 'totalResponseCount',
        value: (row) => String(row.totalResponseCount),
        numeric: true,
      },
      {
        key: 'validResponseCount',
        value: (row) => String(row.validResponseCount),
        numeric: true,
      },
      {
        // Tỷ lệ phản hồi = số phiếu đã thu ÷ tổng số phiếu phải thu. Cột completionRate của API tính
        // theo phiếu hợp lệ nên không dùng lại được, phải tự tính.
        key: 'responseRate',
        value: (row) => `${formatPercent(responseRateOf(row.totalResponseCount, row.classSize), 3)}`,
        sortValue: (row) => responseRateOf(row.totalResponseCount, row.classSize),
      },
      {
        key: 'validRate',
        value: (row) =>
          `${formatPercent(validRateOf(row.validResponseCount, row.totalResponseCount), 3)}`,
        sortValue: (row) => validRateOf(row.validResponseCount, row.totalResponseCount),
      },
      {
        key: 'averageScore',
        // Ô trống hiện "—" trong menu, và luôn bị đẩy xuống cuối khi sắp xếp.
        value: (row) => (formatDecimalOrDash(row.averageScore, 3)),
        sortValue: (row) => row.averageScore,
      },
      {
        key: 'invalidResponseCount',
        value: (row) => String(row.invalidResponseCount),
        numeric: true,
      },
      {
        key: 'openCommentCount',
        value: (row) => String(row.openCommentCount ?? 0),
        numeric: true,
      },
      {
        key: 'eligibility',
        value: (row) =>
          eligibleIds.has(row.courseSectionSurveyId) ? 'Đủ điều kiện' : 'Không đủ điều kiện',
      },
    ],
    [eligibleIds]
  );

  const filters = useColumnFilters(orderedRows, filterColumns);
  const filteredRows = filters.visibleRows;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / statisticsPageSize));
  const visibleRows = useMemo(
    () => filteredRows.slice((page - 1) * statisticsPageSize, page * statisticsPageSize),
    [page, filteredRows]
  );

  useEffect(() => {
    setPage(1);
  }, [semesterSurveyId, searchText, eligibilityFilter]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  /**
   * Tệp xuất = đúng bảng đang hiển thị: cùng bộ cột, cùng thứ tự, cùng các dòng còn
   * lại sau ô tìm kiếm, ô chọn nhóm lớp và bộ lọc cột, kèm phần mô tả cách đọc từng
   * cột và danh sách nội dung câu hỏi của các cột C.
   */
  const exportOptions = useMemo(() => {
    if (!statistics) return null;

    const surveyName = semesterSurveys
      .find((item) => String(item.semesterSurveyId) === semesterSurveyId)?.surveyName ?? '';
    const groupLabel = eligibilityFilter === 'eligible'
      ? 'Các lớp học phần đủ điều kiện'
      : eligibilityFilter === 'ineligible'
        ? 'Các lớp học phần không đủ điều kiện'
        : 'Toàn bộ';
    const exportedEligible = filteredRows.filter((row) => eligibleIds.has(row.courseSectionSurveyId)).length;
    const isNarrowed = eligibilityFilter !== 'all' || searchText.trim() !== '' || filters.isFiltered;

    return {
      fileName: `bang-du-lieu-khao-sat-${surveyName || 'dot-khao-sat'}`,
      metadata: {
        title: 'BẢNG DỮ LIỆU KHẢO SÁT',
        subtitle: surveyName
          ? `${surveyName} · ${statistics.semesterName} năm học ${statistics.academicYearName}`
          : `${statistics.semesterName} năm học ${statistics.academicYearName}`,
        breadcrumb: ['Bảng dữ liệu khảo sát'],
        info: {
          'Đợt khảo sát': surveyName || undefined,
          'Học kỳ': `${statistics.semesterName} · ${statistics.academicYearName}`,
          'Bộ câu hỏi': statistics.templateName,
          'Tính điểm lần cuối': formatDateTime(statistics.lastCalculatedAt),
          'Tiêu chí tính điểm':
            `Tỷ lệ phản hồi ≥ ${thresholds.minimumResponseRate}% · `
            + `Tỷ lệ phiếu hợp lệ ≥ ${thresholds.minimumValidRate}%`,
          'Nhóm lớp': groupLabel,
          'Từ khoá tìm kiếm': searchText.trim() || undefined,
          'Số lớp trong tệp':
            `${filteredRows.length} lớp (${exportedEligible} đủ điều kiện · `
            + `${filteredRows.length - exportedEligible} không đủ điều kiện)`,
        },
        summaryNotes: [
          'Tỷ lệ phản hồi = Số phiếu đã thu ÷ Tổng số phiếu phải thu.',
          'Tỷ lệ phiếu hợp lệ = Số phiếu hợp lệ ÷ Số phiếu đã thu.',
          'Số phiếu không hợp lệ là phiếu bị bộ lọc nhiễu loại, không tham gia tính điểm.',
          'C1, C2… là điểm trung bình từng câu hỏi (thang 5.0) từ phiếu hợp lệ; nội dung câu ở sheet "Danh sach cau hoi". Câu bẫy không đánh số và không có trong bảng.',
          'Điểm trung bình và điểm từng câu lấy theo lần bấm Cập nhật điểm gần nhất.',
          'Mô tả: "Đủ điều kiện" là lớp qua cả hai tiêu chí tính điểm; lớp "Không đủ điều kiện" không được tính điểm. "Chờ chốt điểm" là lớp đã đủ điều kiện nhưng chưa được cập nhật điểm.',
          ...(isNarrowed
            ? ['Tệp chỉ chứa các lớp đang hiển thị theo tìm kiếm, nhóm lớp và bộ lọc đang áp trên màn hình.']
            : []),
        ],
      },
      sheets: [
        {
          sheetName: 'Bang du lieu',
          title: `BẢNG DỮ LIỆU KHẢO SÁT (${filteredRows.length} LỚP)`,
          columns: [
            { key: 'courseName', header: 'Học phần', width: 28 },
            { key: 'courseCode', header: 'Mã học phần', width: 12, align: 'center' as const },
            { key: 'sectionName', header: 'Lớp học phần', width: 12, align: 'center' as const },
            { key: 'facultyName', header: 'Khoa / Viện', width: 24 },
            { key: 'departmentName', header: 'Bộ môn', width: 22 },
            { key: 'lecturerName', header: 'Giảng viên', width: 26 },
            { key: 'classSize', header: 'Tổng số phiếu phải thu', width: 8, type: 'number' as const, align: 'right' as const },
            { key: 'totalResponseCount', header: 'Số phiếu đã thu', width: 12, type: 'number' as const, align: 'right' as const },
            { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 12, type: 'number' as const, align: 'right' as const },
            { key: 'invalidResponseCount', header: 'Số phiếu không hợp lệ', width: 14, type: 'number' as const, align: 'right' as const },
            {
              // Xuất SỐ kèm mã định dạng, không xuất chuỗi "18.2%": ô chữ thì Excel
              // sắp theo bảng chữ cái, "100.0%" rơi xuống dưới "18.2%".
              key: 'responseRate',
              header: 'Tỷ lệ phản hồi',
              width: 12,
              type: 'number' as const,
              align: 'right' as const,
              numberFormat: '0.000"%"',
              format: (_: unknown, row: SectionStatisticsRow) =>
                Number(responseRateOf(row.totalResponseCount, row.classSize).toFixed(3)),
            },
            {
              key: 'validRate',
              header: 'Tỷ lệ phiếu hợp lệ',
              width: 12,
              type: 'number' as const,
              align: 'right' as const,
              numberFormat: '0.000"%"',
              format: (_: unknown, row: SectionStatisticsRow) =>
                Number(validRateOf(row.validResponseCount, row.totalResponseCount).toFixed(3)),
            },
            ...columns.map((column) => ({
              key: `c_${column.questionId}`,
              header: `C${column.order}`,
              width: 7,
              align: 'right' as const,
              format: (_: unknown, row: SectionStatisticsRow) => {
                const score = row.questionScores.find((item) => item.questionId === column.questionId);
                return score?.answerCount ? formatDecimal(score.averageScore, 3) : '—';
              },
            })),
            {
              key: 'averageScore',
              header: 'Điểm trung bình',
              width: 12,
              align: 'right' as const,
              format: (_: unknown, row: SectionStatisticsRow) => {
                if (row.averageScore !== null) return formatDecimal(row.averageScore, 3);
                return hasEnoughResponsesToScore(
                  row.classSize,
                  row.totalResponseCount,
                  row.validResponseCount,
                  thresholds,
                )
                  ? 'Chờ chốt điểm'
                  : '—';
              },
            },
            { key: 'openCommentCount', header: 'Số ý kiến mở', width: 10, type: 'number' as const, align: 'right' as const },
            {
              key: 'eligibility',
              header: 'Mô tả',
              width: 18,
              format: (_: unknown, row: SectionStatisticsRow) =>
                eligibleIds.has(row.courseSectionSurveyId) ? 'Đủ điều kiện' : 'Không đủ điều kiện',
            },
          ],
          data: filteredRows,
        },
        {
          sheetName: 'Danh sach cau hoi',
          title: 'DANH SÁCH CÂU HỎI ỨNG VỚI CÁC CỘT C',
          columns: [
            { key: 'order', header: 'Mã câu', width: 10, align: 'center' as const, format: (value: unknown) => `C${value}` },
            { key: 'questionText', header: 'Nội dung câu hỏi', width: 90 },
          ],
          data: columns,
        },
      ],
    };
  }, [
    statistics,
    semesterSurveys,
    semesterSurveyId,
    eligibilityFilter,
    searchText,
    filters.isFiltered,
    filteredRows,
    eligibleIds,
    thresholds,
    columns,
  ]);


  return (
    <div className="survey-operations-page survey-statistics-page">
      <section className="statistics-toolbar">
        <label className="form-group">
          <span>Học kỳ</span>
          <select value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
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
            id="statistics-campaign-select"
            value={semesterSurveyId}
            onChange={(value) => {
              setSemesterSurveyId(value);
              setActiveSemesterSurveyId(value);
            }}
            disabled={semesterSurveys.length === 0}
            placeholder={campaignPlaceholder(campaignsLoading, semesterSurveys.length)}
            options={semesterSurveys.map((survey) => ({
              value: String(survey.semesterSurveyId),
              label: `${survey.surveyName} · ${survey.sectionSurveyCount} lớp`,
            }))}
          />
        </div>

        <div className="statistics-toolbar-actions">
          {exportOptions && rows.length > 0 && (
            <ExportDropdown
              buttonLabel="Xuất bảng dữ liệu"
              size="sm"
              options={exportOptions}
            />
          )}
          <UpdateScoresButton semesterSurveyId={semesterSurveyId} onUpdated={loadStatistics} />
          {/* Phát hành nằm ở đúng trang này vì đây là chỗ quản trị chốt số liệu cuối
              đợt: xem bảng, bấm Cập nhật điểm, rồi mới mở cho đơn vị xem. */}
          <PublishResultsButton semesterSurveyId={semesterSurveyId} onChanged={loadStatistics} />
        </div>
      </section>

      <ScoringConfigNote />

      {loadError && (
        <div className="admin-alert" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {statistics && (
        <section className="statistics-summary">
          <span>
            {columns.length} câu chấm điểm · {rows.length} lớp ·{' '}
            <strong className="statistics-count--eligible">{eligibleCount}</strong> đủ điều kiện ·{' '}
            <strong className="statistics-count--ineligible">{ineligibleCount}</strong> không đủ điều kiện
            {/* Đang lọc thì nói rõ còn bao nhiêu dòng, không thì người xem tưởng mất
                dữ liệu. */}
            {filters.isFiltered && ` · đang lọc còn ${filteredRows.length} lớp`}
          </span>
          {/* Câu bẫy không được đánh số nên bảng không nhảy cóc số câu, nhưng bộ
              vẫn dài hơn số cột ở đây — nói rõ để khỏi bị hiểu là thiếu dữ liệu. */}
          {statistics.attentionCheckCount > 0 && (
            <span className="statistics-trap-note">
              Bộ có <strong>{statistics.attentionCheckCount} câu bẫy</strong>, không đánh số và
              không lên bảng
            </span>
          )}
          <span>
            Tính điểm lần cuối: <strong>{formatDateTime(statistics.lastCalculatedAt)}</strong>
            {statistics.lastCalculatedByEmail && (
              <> · bởi <strong>{statistics.lastCalculatedByEmail}</strong></>
            )}
          </span>
          {/* Hai vòng lọc đang áp, in ra ngay cạnh số liệu để không ai phải đoán
              bảng đang bỏ lớp nào. Đổi cấu hình ở nút Cập nhật điểm. */}
        </section>
      )}

      {/* Số đang xem là ảnh chụp lúc bấm nút, không tự cập nhật khi có phiếu mới. */}
      {statistics && statistics.responsesSinceLastCalculation > 0 && (
        <div className="admin-alert admin-alert--warning" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>
            Có <strong>{statistics.responsesSinceLastCalculation} phiếu</strong> về sau lần tính gần
            nhất. Bấm <strong>Cập nhật điểm</strong> để cập nhật.
          </span>
        </div>
      )}

      {/* Các cột đếm phiếu luôn có số; riêng cột điểm phải bấm nút mới tính, nên
          nói rõ để khỏi bị hiểu là bảng lỗi. */}
      {statistics && statistics.lastCalculatedAt === null && (
        <div className="admin-alert" role="status">
          <CircleAlert aria-hidden="true" />
          <span>
            Đợt này chưa chốt điểm lần nào, nên các cột điểm (C1, C2…, Điểm trung bình) đang
            để trống. Bấm <strong>Cập nhật điểm</strong> để tính.
          </span>
        </div>
      )}

      {loading ? (
        <div className="operations-empty" role="status">
          <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          <strong>Đang tải bảng dữ liệu...</strong>
        </div>
      ) : rows.length === 0 ? (
        <div className="operations-empty">
          <strong>Chưa có lớp học phần nào trong đợt khảo sát này.</strong>
        </div>
      ) : (
        <>
        {/* Ô tìm kiếm bên trái, ba ô chọn nhóm lớp bên phải ô tìm kiếm. */}
        <div className="statistics-filter-bar">
          <label className="catalog-search">
            <span className="catalog-sr-only">Tìm kiếm</span>
            <Search aria-hidden="true" size={16} />
            <input
              type="search"
              placeholder="Tìm học phần, giảng viên, bộ môn hoặc khoa/viện"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>
          <span className="catalog-result-count" aria-live="polite">
            {filteredRows.length} kết quả
          </span>
          {/* Radio chứ không phải checkbox: mỗi lần chỉ xem ĐÚNG một nhóm lớp. */}
          <div className="statistics-filter-options" role="radiogroup" aria-label="Nhóm lớp học phần">
            {([
              ['all', 'Toàn bộ'],
              ['eligible', 'Các lớp học phần đủ điều kiện'],
              ['ineligible', 'Các lớp học phần không đủ điều kiện'],
            ] as const).map(([value, label]) => (
              <label key={value} className="statistics-filter-option">
                <input
                  type="radio"
                  name="statistics-eligibility-filter"
                  checked={eligibilityFilter === value}
                  onChange={() => setEligibilityFilter(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {orderedRows.length === 0 ? (
          <div className="operations-empty">
            <strong>Không có lớp học phần nào khớp với tìm kiếm hoặc nhóm đang chọn.</strong>
          </div>
        ) : (
        // Một bảng chung cho mọi lớp: lớp đủ điều kiện ở trên, không đủ ở dưới, cột Mô
        // tả nói rõ từng lớp. Bảng rất rộng vì số cột C thay đổi theo bộ câu hỏi: cuộn
        // ngang và ghim các cột đầu, cuối để không lạc dòng.
        <div className="statistics-table-scroll" tabIndex={0} aria-label="Bảng dữ liệu, cuộn ngang">
          <table className="statistics-table statistics-table--fill">
            <thead>
              <tr>
                <th className="col-left col-left-1" scope="col">
                  {filters.filterHeader('courseName', 'Học phần')}
                </th>
                <th className="col-left col-left-2" scope="col">
                  {filters.filterHeader('courseCode', 'Mã học phần')}
                </th>
                <th className="col-left col-left-3" scope="col">
                  {filters.filterHeader('sectionName', 'Lớp học phần')}
                </th>
                <th className="col-meta" scope="col">
                  {filters.filterHeader('facultyName', 'Khoa / Viện')}
                </th>
                <th className="col-meta" scope="col">
                  {filters.filterHeader('departmentName', 'Bộ môn')}
                </th>
                <th className="col-meta col-meta--lecturer" scope="col">
                  {filters.filterHeader('lecturerName', 'Giảng viên')}
                </th>
                <th className="col-metric" scope="col">
                  {filters.filterHeader('classSize', 'Tổng số phiếu phải thu')}
                </th>
                <th className="col-metric" scope="col">
                  {filters.filterHeader('totalResponseCount', 'Số phiếu đã thu')}
                </th>
                <th className="col-metric" scope="col" title="Số phiếu qua được bộ lọc nhiễu">
                  {filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
                </th>
                <th className="col-metric" scope="col" title="Phiếu bị bộ lọc nhiễu loại">
                  {filters.filterHeader('invalidResponseCount', 'Số phiếu không hợp lệ')}
                </th>
                <th
                  className="col-metric"
                  scope="col"
                  title={`Số phiếu đã thu chia tổng số phiếu phải thu. Vòng 1: cần ≥ ${thresholds.minimumResponseRate}%`}
                >
                  {filters.filterHeader('responseRate', 'Tỷ lệ phản hồi')}
                </th>
                <th
                  className="col-metric"
                  scope="col"
                  title={`Số phiếu hợp lệ chia số phiếu đã thu. Vòng 2: cần ≥ ${thresholds.minimumValidRate}%`}
                >
                  {filters.filterHeader('validRate', 'Tỷ lệ phiếu hợp lệ')}
                </th>
                {columns.map((column) => (
                  <th
                    key={column.questionId}
                    className="col-question"
                    scope="col"
                    title={column.questionText}
                  >
                    C{column.order}
                  </th>
                ))}
                <th className="col-right col-right-3" scope="col">
                  {filters.filterHeader('averageScore', 'Điểm trung bình')}
                </th>
                <th className="col-right col-right-2" scope="col">
                  {filters.filterHeader('openCommentCount', 'Số ý kiến mở')}
                </th>
                <th className="col-right col-right-1" scope="col">
                  {filters.filterHeader('eligibility', 'Mô tả')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const isEligible = eligibleIds.has(row.courseSectionSurveyId);
                const scoreByQuestion = new Map(
                  row.questionScores.map((score) => [score.questionId, score])
                );
                const responseRate = responseRateOf(row.totalResponseCount, row.classSize);
                const validRate = validRateOf(row.validResponseCount, row.totalResponseCount);

                /*
                  Ô điểm trống có ba lý do khác hẳn nhau, nói rõ chứ đừng để người
                  xem đoán:
                  - cả đợt chưa ai bấm tính;
                  - lớp rớt vòng lọc ở lần chốt gần nhất;
                  - lớp rớt lúc đó nhưng SỐ HIỆN TẠI đã đủ, tức là số phiếu về thêm
                    hoặc ngưỡng vừa đổi sau lần chốt — bấm Cập nhật điểm là lớp có điểm.
                */
                const enoughNow = hasEnoughResponsesToScore(
                  row.classSize,
                  row.totalResponseCount,
                  row.validResponseCount,
                  thresholds
                );
                const missingScoreReason = lastCalculatedAt === null
                  ? 'Đợt chưa được bấm tính điểm.'
                  : enoughNow
                    ? 'Số phiếu hiện tại đã đủ hai vòng lọc nhưng lần chốt gần nhất thì chưa.'
                      + ' Bấm "Cập nhật điểm" để cập nhật.'
                    : 'Lớp không qua vòng lọc: cần tỷ lệ phản hồi ≥ '
                      + `${thresholds.minimumResponseRate}% và tỷ lệ phiếu hợp lệ ≥ `
                      + `${thresholds.minimumValidRate}%.`;

                return (
                  <tr key={row.courseSectionSurveyId}>
                    <td className="col-left col-left-1" title={row.courseName}>
                      {row.courseName}
                    </td>
                    <td className="col-left col-left-2">
                      <span className="operations-code">{row.courseCode}</span>
                    </td>
                    <td className="col-left col-left-3">
                      {/* Mở trang kết quả của lớp ở Thống kê & Báo cáo, kèm học kỳ và đợt
                          đang xem. Liên kết thật nên Back và Ctrl + bấm vẫn dùng được. */}
                      <a
                        className="statistics-section-link"
                        href={buildReportHash({
                          screen: 'survey',
                          surveyId: row.courseSectionSurveyId,
                          semesterId: Number(semesterId) || undefined,
                          semesterSurveyId: Number(semesterSurveyId) || undefined,
                        })}
                        title={`Xem kết quả ${row.courseCode} - ${row.courseName} (${row.sectionName})`}
                      >
                        {row.sectionName}
                      </a>
                    </td>
                    <td className="col-meta" title={row.facultyName}>{row.facultyName}</td>
                    <td className="col-meta" title={row.departmentName}>{row.departmentName}</td>
                    <td className="col-meta col-meta--lecturer" title={row.lecturerName}>
                      {row.lecturerName}
                    </td>
                    <td className="num col-metric">{row.classSize}</td>
                    <td className="num col-metric">{row.totalResponseCount}</td>
                    <td className="num col-metric">{row.validResponseCount}</td>
                    <td
                      className={
                        row.invalidResponseCount > 0
                          ? 'num is-flagged col-metric'
                          : 'num col-metric'
                      }
                    >
                      {row.invalidResponseCount}
                    </td>
                    <td className={`num col-metric${responseRate < thresholds.minimumResponseRate ? ' is-flagged' : ''}`}>
                      {formatPercent(responseRate, 3)}
                    </td>
                    <td className={`num col-metric${validRate < thresholds.minimumValidRate ? ' is-flagged' : ''}`}>
                      {formatPercent(validRate, 3)}
                    </td>
                    {columns.map((column) => {
                      const score = scoreByQuestion.get(column.questionId);
                      const value = score?.answerCount ? score.averageScore : null;
                      return (
                        <td
                          key={column.questionId}
                          className={
                            value !== null && value < weakScoreThreshold
                              ? 'num col-question is-weak'
                              : 'num col-question'
                          }
                        >
                          {formatDecimalOrDash(value, 3)}
                        </td>
                      );
                    })}
                    <td
                      className="num is-total col-right col-right-3"
                      title={row.averageScore === null ? missingScoreReason : undefined}
                    >
                      {row.averageScore === null ? (
                        enoughNow ? (
                          <span
                            className="badge badge--warning"
                            style={{
                              display: 'inline-block',
                              fontSize: '13px',
                              lineHeight: 1.25,
                              padding: '2px 4px',
                              borderRadius: '4px',
                              background: '#fef3c7',
                              color: '#92400e',
                              fontWeight: 600,
                            }}
                            title="Đã đủ số phiếu, bấm Cập nhật điểm để chốt điểm"
                          >
                            Chờ chốt điểm
                          </span>
                        ) : (
                          '—'
                        )
                      ) : (
                        formatDecimal(row.averageScore, 3)
                      )}
                    </td>
                    <td className="num col-right col-right-2">{row.openCommentCount ?? 0}</td>
                    <td
                      className="col-right col-right-1"
                      title={isEligible ? 'Đủ điều kiện' : 'Không đủ điều kiện'}
                    >
                      <span
                        className={
                          isEligible
                            ? 'statistics-eligibility statistics-eligibility--yes'
                            : 'statistics-eligibility statistics-eligibility--no'
                        }
                      >
                        {isEligible ? 'Đủ điều kiện' : 'Không đủ điều kiện'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* Ô đệm nuốt chỗ thừa để dòng tổng kết luôn nằm sát đáy khung. */}
              <tr className="table-spacer" aria-hidden="true">
                <td colSpan={14 + columns.length} />
              </tr>
            </tbody>

          </table>
        </div>
        )}
        </>
      )}

      {/* Phân trang nằm NGOÀI khung cuộn: để bên trong thì kéo ngang bảng là nó
          trôi theo, mất hút khỏi màn hình. */}
      {!loading && orderedRows.length > 0 && (
        <TablePagination
          page={page}
          pageSize={statisticsPageSize}
          totalItems={filteredRows.length}
          itemLabel="lớp"
          onPageChange={setPage}
        />
      )}
    </div>
  );
};

