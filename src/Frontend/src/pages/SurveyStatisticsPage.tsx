import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { useSemester } from '../context/semesterContext';
import { TablePagination } from '../components/TablePagination';
import { ExportDropdown } from '../components/ExportDropdown';
import { ApiError } from '../services/apiClient';
import { surveyApi, surveyErrorMessage } from '../services/surveyApi';
import type { SemesterSurvey } from '../types';
import type { SectionStatisticsRow, SemesterSurveyStatistics } from '../services/surveyApi';
import { useColumnFilters, type FilterableColumn } from '../hooks/useColumnFilters';
import { buildReportHash } from './reportRoute';
import { UpdateScoresButton } from '../components/UpdateScoresButton';
import { ScoringConfigNote } from '../components/ScoringConfigNote';
import { useScoringThresholds } from '../hooks/useScoringThresholds';
import {
  hasEnoughResponsesToScore,
  responseRateOf,
  validRateOf,
} from '../utils/reportThresholds';
import '../styles/survey-operations.css';
import '../styles/survey-statistics.css';
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

  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>([]);
  const [semesterSurveyId, setSemesterSurveyId] = useState<string>('');
  const [statistics, setStatistics] = useState<SemesterSurveyStatistics | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Hai vòng lọc lớp được tính điểm. Đọc từ cấu hình chung để bảng này và các
  // trang báo cáo luôn nói cùng một con số.
  const thresholds = useScoringThresholds();
  const [tab, setTab] = useState<'eligible' | 'ineligible'>('eligible');

  // Đổi học kỳ thì nạp lại danh sách đợt khảo sát của kỳ đó.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!semesterId) {
        setSemesterSurveys([]);
        setSemesterSurveyId('');
        setStatistics(null);
        return;
      }
      try {
        const next = await surveyApi.semesterSurveys(Number(semesterId));
        if (cancelled) return;
        setSemesterSurveys(next);
        setSemesterSurveyId(next.length > 0 ? String(next[0].semesterSurveyId) : '');
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

  const questionTextById = useMemo(
    () => new Map(columns.map((column) => [column.questionId, column])),
    [columns]
  );

  /**
   * Hai nhóm của trang, chia theo ẢNH CHỤP của lần bấm "Tính lại điểm" gần nhất
   * chứ không tính sống.
   *
   * Mốc phân nhóm là `averageScore`: câu UPDATE của nút tính chỉ chốt điểm cho
   * lớp qua được hai vòng lọc, lớp rớt nhận NULL. Nên "có điểm đã chốt" đúng bằng
   * "được tính vào điểm ở lần chốt gần nhất" — không cần thêm cột cờ nào.
   *
   * Hệ quả cố ý: có phiếu mới về, hay quản trị vừa sửa ngưỡng, thì hai tab vẫn
   * đứng yên cho tới khi bấm tính lại. Đó là điều kiện để mọi con số trên trang
   * cùng thuộc về một lần chốt.
   */
  const groupedRows = useMemo(() => {
    const eligible: SectionStatisticsRow[] = [];
    const ineligible: SectionStatisticsRow[] = [];
    for (const row of rows) {
      const isEligibleNow = hasEnoughResponsesToScore(
        row.classSize,
        row.totalResponseCount,
        row.validResponseCount,
        thresholds
      );
      const isEligible = isEligibleNow || row.averageScore !== null;
      (isEligible ? eligible : ineligible).push(row);
    }
    return { eligible, ineligible };
  }, [rows, thresholds]);

  // Trong nhóm đủ điều kiện, lớp đã chốt điểm lên trên, lớp chưa có điểm xuống
  // dưới — phần lớn việc cần làm nằm ở nhóm trên. Sort của JS ổn định nên vẫn
  // giữ nguyên thứ tự mã học phần / tên lớp của backend.
  const orderedRows = useMemo(() => {
    const source = tab === 'eligible' ? groupedRows.eligible : groupedRows.ineligible;
    return [...source].sort(
      (left, right) =>
        Number(left.averageScore === null) - Number(right.averageScore === null)
    );
  }, [groupedRows, tab]);

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
        // Tỷ lệ phản hồi = số phiếu đã thu ÷ sĩ số. Cột completionRate của API tính
        // theo phiếu hợp lệ nên không dùng lại được, phải tự tính.
        key: 'responseRate',
        value: (row) => `${responseRateOf(row.totalResponseCount, row.classSize).toFixed(1)}%`,
        sortValue: (row) => responseRateOf(row.totalResponseCount, row.classSize),
      },
      {
        key: 'validRate',
        value: (row) =>
          `${validRateOf(row.validResponseCount, row.totalResponseCount).toFixed(1)}%`,
        sortValue: (row) => validRateOf(row.validResponseCount, row.totalResponseCount),
      },
      {
        key: 'averageScore',
        // Ô trống hiện "—" trong menu, và luôn bị đẩy xuống cuối khi sắp xếp.
        value: (row) => (row.averageScore === null ? '—' : row.averageScore.toFixed(2)),
        sortValue: (row) => row.averageScore,
      },
      {
        key: 'weakestQuestion',
        value: (row) => {
          const weakest = row.weakestQuestionId === null
            ? null
            : questionTextById.get(row.weakestQuestionId);
          return weakest ? `C${weakest.order}` : '—';
        },
        sortValue: (row) => {
          const weakest = row.weakestQuestionId === null
            ? null
            : questionTextById.get(row.weakestQuestionId);
          return weakest ? weakest.order : null;
        },
      },
      {
        key: 'weakestQuestionScore',
        value: (row) =>
          row.weakestQuestionScore === null ? '—' : row.weakestQuestionScore.toFixed(2),
        sortValue: (row) => row.weakestQuestionScore,
      },
      {
        key: 'invalidResponseCount',
        value: (row) => String(row.invalidResponseCount),
        numeric: true,
      },
      {
        key: 'openCommentCount',
        value: (row) => String(row.openCommentCount),
        numeric: true,
      },
    ],
    [questionTextById]
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
  }, [semesterSurveyId, tab]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  /**
   * Số tổng cho FILE XUẤT. Dòng Tổng kết ghim đáy bảng đã bỏ, nhưng báo cáo xuất
   * ra vẫn cần phần đầu trang, nên tính tại chỗ trên đúng tập dòng đang xuất —
   * tức là theo tab đang mở và bộ lọc đang áp, không phải toàn đợt.
   */
  const exportTotals = useMemo(() => {
    const mean = (values: number[]) =>
      values.length === 0 ? null : values.reduce((sum, x) => sum + x, 0) / values.length;

    const questionMeans = new Map<number, number | null>();
    for (const column of columns) {
      const scores = filteredRows
        .map((row) => row.questionScores.find((score) => score.questionId === column.questionId))
        .filter((score) => score !== undefined && score.answerCount > 0)
        .map((score) => score!.averageScore);
      questionMeans.set(column.questionId, mean(scores));
    }

    return {
      classSizeTotal: filteredRows.reduce((sum, row) => sum + row.classSize, 0),
      responseTotal: filteredRows.reduce((sum, row) => sum + row.totalResponseCount, 0),
      questionMeans,
      averageScoreMean: mean(
        filteredRows.filter((row) => row.averageScore !== null).map((row) => row.averageScore!)
      ),
    };
  }, [columns, filteredRows]);


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
            onChange={setSemesterSurveyId}
            disabled={semesterSurveys.length === 0}
            placeholder={semesterSurveys.length === 0 ? 'Chưa có đợt nào' : 'Chọn đợt khảo sát'}
            options={semesterSurveys.map((survey) => ({
              value: String(survey.semesterSurveyId),
              label: `${survey.surveyName} · ${survey.sectionSurveyCount} lớp`,
            }))}
          />
        </div>

        <div className="statistics-toolbar-actions">
          {statistics && rows.length > 0 && (
            <ExportDropdown
              buttonLabel="Xuất bảng điểm"
              size="sm"
              options={{
                fileName: `bao-cao-thong-ke-diem-dot-khao-sat-${
                  semesterSurveys.find((item) => String(item.semesterSurveyId) === semesterSurveyId)
                    ?.surveyName || 'hoc-phan'
                }`,
                metadata: {
                  title: 'BÁO CÁO THỐNG KÊ ĐIỂM SỐ ĐỢT KHẢO SÁT',
                  subtitle: `Bộ câu hỏi: ${statistics.templateName}`,
                  subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
                  info: {
                    'Bộ câu hỏi': statistics.templateName,
                    'Số lượng lớp học phần': filteredRows.length,
                    'Tổng sĩ số sinh viên': exportTotals.classSizeTotal,
                    'Tổng phiếu khảo sát đã thu': exportTotals.responseTotal,
                    'Điểm trung bình toàn đợt':
                      exportTotals.averageScoreMean !== null ? exportTotals.averageScoreMean.toFixed(2) : '—',
                  },
                  summaryNotes: [
                    'Điểm mỗi câu hỏi và điểm trung bình của lớp được tính trên thang điểm 5.0 từ phiếu hợp lệ.',
                    'Dữ liệu được cập nhật tại thời điểm chốt tính điểm.',
                    ...(filters.isFiltered
                      ? ['Tệp này chỉ chứa các lớp còn lại sau bộ lọc đang áp trên màn hình.']
                      : []),
                  ],
                },
                sheets: [
                  {
                    sheetName: 'Bang diem chi tiet',
                    title: filters.isFiltered
                      ? `1. BẢNG ĐIỂM CHI TIẾT THEO BỘ LỌC ĐANG ÁP (${filteredRows.length} LỚP)`
                      : `1. BẢNG ĐIỂM CHI TIẾT TẤT CẢ CÁC LỚP HỌC PHẦN (${filteredRows.length} LỚP)`,
                    columns: [
                      { key: 'courseCode', header: 'Mã học phần', width: 12, align: 'center' as const },
                      { key: 'sectionName', header: 'Lớp học phần', width: 14, align: 'center' as const },
                      { key: 'courseName', header: 'Tên học phần', width: 26 },
                      { key: 'departmentName', header: 'Bộ môn', width: 20 },
                      { key: 'lecturerName', header: 'Giảng viên', width: 34 },
                      { key: 'classSize', header: 'Sĩ số', width: 10, type: 'number' as const, align: 'right' as const },
                      { key: 'totalResponseCount', header: 'Số phiếu đã thu', width: 14, type: 'number' as const, align: 'right' as const },
                      { key: 'invalidResponseCount', header: 'Số phiếu không hợp lệ', width: 18, type: 'number' as const, align: 'right' as const },
                      { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 14, type: 'number' as const, align: 'right' as const },
                      {
                        // Xuất SỐ kèm mã định dạng, không xuất chuỗi "18.2%": ô chữ
                        // thì Excel sắp theo bảng chữ cái, "100.0%" rơi xuống dưới
                        // "18.2%" vì so ký tự thứ hai 0 < 8.
                        key: 'responseRate',
                        header: 'Tỷ lệ phản hồi',
                        width: 14,
                        type: 'number' as const,
                        align: 'right' as const,
                        numberFormat: '0.0"%"',
                        format: (_: any, row: any) =>
                          responseRateOf(row.totalResponseCount, row.classSize),
                      },
                      {
                        key: 'validRate',
                        header: 'Tỷ lệ phiếu hợp lệ',
                        width: 16,
                        type: 'number' as const,
                        align: 'right' as const,
                        numberFormat: '0.0"%"',
                        format: (_: any, row: any) =>
                          validRateOf(row.validResponseCount, row.totalResponseCount),
                      },
                      ...columns.map((c) => ({
                        key: `c_${c.questionId}`,
                        header: `C${c.order}`,
                        width: 8,
                        type: 'number' as const,
                        align: 'right' as const,
                        format: (_: any, row: any) => {
                          const score = row.questionScores?.find((s: any) => s.questionId === c.questionId);
                          return score?.answerCount ? score.averageScore.toFixed(2) : '—';
                        },
                      })),
                      {
                        key: 'averageScore',
                        header: 'Điểm trung bình',
                        width: 14,
                        type: 'number' as const,
                        align: 'right' as const,
                        format: (val: any) => (val !== null ? Number(val).toFixed(2) : '—'),
                      },
                      { key: 'openCommentCount', header: 'Ý kiến mở', width: 10, type: 'number' as const, align: 'right' as const },
                    ],
                    data: filteredRows,
                  },
                  {
                    sheetName: 'Lop diem thap & Luu y',
                    title: '2. DANH SÁCH LỚP CÓ ĐIỂM THẤP HOẶC CÓ TIÊU CHÍ CẦN CẢI THIỆN',
                    subtitle: 'Các lớp có Điểm trung bình < 3.50 hoặc có tiêu chí đơn lẻ bị đánh giá thấp',
                    columns: [
                      { key: 'courseCode', header: 'Mã HP', width: 12, align: 'center' as const },
                      { key: 'sectionName', header: 'Lớp HP', width: 14, align: 'center' as const },
                      { key: 'courseName', header: 'Tên học phần', width: 26 },
                      { key: 'lecturerName', header: 'Giảng viên', width: 22 },
                      { key: 'departmentName', header: 'Bộ môn', width: 20 },
                      { key: 'classSize', header: 'Sĩ số', width: 10, type: 'number' as const, align: 'right' as const },
                      { key: 'totalResponseCount', header: 'Phiếu thu', width: 10, type: 'number' as const, align: 'right' as const },
                      {
                        key: 'averageScore',
                        header: 'Điểm trung bình',
                        width: 14,
                        type: 'number' as const,
                        align: 'right' as const,
                        format: (v: any) => (v !== null ? Number(v).toFixed(2) : '—'),
                      },
                      {
                        key: 'weakestQuestionOrder',
                        header: 'Câu yếu nhất',
                        width: 14,
                        align: 'center' as const,
                        format: (v: any, item: any) => v ? `C${v} (${item.weakestQuestionScore?.toFixed(2)})` : '—',
                      },
                      {
                        key: 'weakestQuestionText',
                        header: 'Nội dung câu hỏi yếu nhất',
                        width: 36,
                        format: (_: any, item: any) => {
                          const q = item.weakestQuestionId ? questionTextById.get(item.weakestQuestionId) : null;
                          return q?.questionText || item.weakestQuestionText || '—';
                        },
                      },
                    ],
                    data: filteredRows.filter((r) => (r.averageScore !== null && r.averageScore < 3.5) || (r.weakestQuestionScore !== null && r.weakestQuestionScore < 3.0)),
                  },
                  {
                    sheetName: 'Thong ke theo Tieu chi',
                    title: '3. THỐNG KÊ ĐIỂM TRUNG BÌNH THEO TỪNG TIÊU CHÍ CÂU HỎI',
                    columns: [
                      { key: 'order', header: 'Mã câu', width: 10, align: 'center' as const, format: (v: any) => `C${v}` },
                      { key: 'questionText', header: 'Nội dung tiêu chí câu hỏi', width: 50 },
                      {
                        key: 'questionId',
                        header: 'Điểm TB toàn trường',
                        width: 18,
                        type: 'number' as const,
                        align: 'right' as const,
                        format: (qid: any) => {
                          const mean = exportTotals.questionMeans.get(Number(qid));
                          return mean !== null && mean !== undefined ? mean.toFixed(2) : '—';
                        },
                      },
                      {
                        key: 'questionId',
                        header: 'Số lớp < 3.5 điểm',
                        width: 16,
                        type: 'number' as const,
                        align: 'right' as const,
                        format: (qid: any) => {
                          const id = Number(qid);
                          return rows.filter((r) => {
                            const sc = r.questionScores?.find((s) => s.questionId === id);
                            return sc && sc.answerCount > 0 && sc.averageScore < 3.5;
                          }).length;
                        },
                      },
                    ],
                    data: columns,
                  },
                ],
              }}
            />
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void loadStatistics()}
            disabled={!semesterSurveyId || loading}
          >
            <RefreshCw aria-hidden="true" size={16} />
            Tải lại
          </button>
          <UpdateScoresButton semesterSurveyId={semesterSurveyId} onUpdated={loadStatistics} />
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
            Bộ câu hỏi: <strong>{statistics.templateName}</strong>
          </span>
          <span>
            {columns.length} câu chấm điểm · {rows.length} lớp ·{' '}
            <strong>{groupedRows.eligible.length}</strong> đủ điều kiện ·{' '}
            <strong>{groupedRows.ineligible.length}</strong> chưa đủ
            {/* Đang lọc thì nói rõ còn bao nhiêu dòng TRONG TAB, không thì người
                xem tưởng mất dữ liệu. */}
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
          </span>
          {/* Hai vòng lọc đang áp, in ra ngay cạnh số liệu để không ai phải đoán
              bảng đang bỏ lớp nào. Đổi cấu hình ở nút Cập nhật điểm. */}
          <span className="statistics-threshold-note">
            Tỷ lệ phản hồi ≥ <strong>{thresholds.minimumResponseRate}%</strong> · Tỷ lệ phiếu
            hợp lệ ≥ <strong>{thresholds.minimumValidRate}%</strong>
          </span>
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
            Đợt này chưa chốt điểm lần nào, nên các cột điểm (C1, C2…, Điểm trung bình, Câu yếu
            nhất) đang để trống. Bấm <strong>Cập nhật điểm</strong> để tính.
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
        {/* Hai nhóm chia theo đúng hai vòng lọc đang áp. Nút Cập nhật điểm nằm
            trên thanh công cụ phía trên, tức trên thanh tab này. */}
        <nav className="statistics-tabs" aria-label="Nhóm lớp theo điều kiện tính điểm">
          <button
            type="button"
            className={`statistics-tab${tab === 'eligible' ? ' is-active' : ''}`}
            aria-pressed={tab === 'eligible'}
            onClick={() => setTab('eligible')}
          >
            Lớp đủ điều kiện
            <span className="statistics-tab-count">{groupedRows.eligible.length}</span>
          </button>
          <button
            type="button"
            className={`statistics-tab${tab === 'ineligible' ? ' is-active' : ''}`}
            aria-pressed={tab === 'ineligible'}
            onClick={() => setTab('ineligible')}
          >
            Lớp chưa đủ điều kiện
            <span className="statistics-tab-count">{groupedRows.ineligible.length}</span>
          </button>
        </nav>

        {orderedRows.length === 0 ? (
          <div className="operations-empty">
            <strong>
              {tab === 'eligible'
                ? 'Hiện chưa có lớp nào đạt đủ ngưỡng số lượng phiếu.'
                : 'Hiện mọi lớp đều đã đạt đủ ngưỡng số lượng phiếu.'}
            </strong>
          </div>
        ) : (
        // Bảng rất rộng vì số cột C thay đổi theo bộ câu hỏi: cuộn ngang và ghim
        // các cột đầu để không lạc dòng.
        <div className="statistics-table-scroll" tabIndex={0} aria-label="Bảng dữ liệu, cuộn ngang">
          <table className="statistics-table statistics-table--fill">
            <thead>
              <tr>
                <th className="col-left col-left-1" scope="col">
                  {filters.filterHeader('courseCode', 'Mã học phần')}
                </th>
                <th className="col-left col-left-2" scope="col">
                  {filters.filterHeader('sectionName', 'Lớp học phần')}
                </th>
                <th className="col-left col-left-3" scope="col">
                  {filters.filterHeader('courseName', 'Tên học phần')}
                </th>
                <th className="col-meta" scope="col">
                  {filters.filterHeader('departmentName', 'Bộ môn')}
                </th>
                <th className="col-meta col-meta--lecturer" scope="col">
                  {filters.filterHeader('lecturerName', 'Giảng viên')}
                </th>
                <th className="col-metric" scope="col">
                  {filters.filterHeader('classSize', 'Sĩ số')}
                </th>
                <th className="col-metric" scope="col">
                  {filters.filterHeader('totalResponseCount', 'Số phiếu đã thu')}
                </th>
                <th className="col-metric" scope="col" title="Phiếu bị bộ lọc nhiễu loại">
                  {filters.filterHeader('invalidResponseCount', 'Số phiếu không hợp lệ')}
                </th>
                <th className="col-metric" scope="col" title="Số phiếu qua được bộ lọc nhiễu">
                  {filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}
                </th>
                <th
                  className="col-metric"
                  scope="col"
                  title={`Số phiếu đã thu chia sĩ số. Vòng 1: cần ≥ ${thresholds.minimumResponseRate}%`}
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
                <th className="col-right col-right-4" scope="col">
                  {filters.filterHeader('averageScore', 'Điểm trung bình')}
                </th>
                <th className="col-right col-right-3" scope="col">
                  {filters.filterHeader('weakestQuestion', 'Câu yếu nhất')}
                </th>
                <th className="col-right col-right-2" scope="col">
                  {filters.filterHeader('weakestQuestionScore', 'Điểm câu yếu')}
                </th>
                <th className="col-right col-right-1" scope="col">
                  {filters.filterHeader('openCommentCount', 'Số ý kiến mở')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const weakest = row.weakestQuestionId === null
                  ? null
                  : questionTextById.get(row.weakestQuestionId);
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
                    hoặc ngưỡng vừa đổi sau lần chốt — bấm tính lại là lớp sang tab
                    bên kia.
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
                    <td className="col-left col-left-1">
                      <span className="operations-code">{row.courseCode}</span>
                    </td>
                    <td className="col-left col-left-2">
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
                    <td className="col-left col-left-3" title={row.courseName}>
                      {row.courseName}
                    </td>
                    <td className="col-meta">{row.departmentName}</td>
                    <td className="col-meta col-meta--lecturer">{row.lecturerName}</td>
                    <td className="num col-metric">{row.classSize}</td>
                    <td className="num col-metric">{row.totalResponseCount}</td>
                    <td
                      className={
                        row.invalidResponseCount > 0
                          ? 'num is-flagged col-metric'
                          : 'num col-metric'
                      }
                    >
                      {row.invalidResponseCount}
                    </td>
                    <td className="num col-metric">{row.validResponseCount}</td>
                    <td className={`num col-metric${responseRate < thresholds.minimumResponseRate ? ' is-flagged' : ''}`}>
                      {responseRate.toFixed(1)}%
                    </td>
                    <td className={`num col-metric${validRate < thresholds.minimumValidRate ? ' is-flagged' : ''}`}>
                      {validRate.toFixed(1)}%
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
                          {value === null ? '—' : value.toFixed(2)}
                        </td>
                      );
                    })}
                    <td
                      className={
                        row.averageScore === null
                          ? 'num is-total col-right col-right-4'
                          : 'num is-total col-right col-right-4'
                      }
                      title={row.averageScore === null ? missingScoreReason : undefined}
                    >
                      {row.averageScore === null ? (
                        enoughNow ? (
                          <span
                            className="badge badge--warning"
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#fef3c7',
                              color: '#92400e',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                            title="Đã đủ số phiếu, bấm Cập nhật điểm để chốt điểm"
                          >
                            Chờ chốt điểm
                          </span>
                        ) : (
                          '—'
                        )
                      ) : (
                        row.averageScore.toFixed(2)
                      )}
                    </td>
                    <td className="col-right col-right-3" title={weakest?.questionText}>
                      {weakest === null || weakest === undefined ? '—' : `C${weakest.order}`}
                    </td>
                    <td className="num col-right col-right-2">
                      {row.weakestQuestionScore === null
                        ? '—'
                        : row.weakestQuestionScore.toFixed(2)}
                    </td>
                    <td className="num col-right col-right-1">{row.openCommentCount}</td>
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

