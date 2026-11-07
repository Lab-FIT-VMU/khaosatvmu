import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ExportDropdown } from '../ExportDropdown';
import { TablePagination } from '../TablePagination';
import { useColumnFilters, type FilterableColumn } from '../../hooks/useColumnFilters';
import type { UnitReportRow, UnitSurveyReport } from '../../types';
import { formatDecimal, formatDecimalOrDash } from '../../utils/formatNumber';
import { validRateOf } from '../../utils/reportThresholds';
import { foldVietnamese } from '../../utils/vietnamese';
import { UnitReportBody, UnitReportToolbar, UnitScoringNote } from '../unitReports/UnitReportFrame';
import {
  attentionCheckCountOf,
  scoredQuestionsOf,
  useUnitSurveyReport,
  type ScoredQuestion,
} from '../unitReports/unitReportModel';
import '../../styles/survey-operations.css';
import '../../styles/survey-statistics.css';
import '../../styles/catalogs.css';

/*
  Bảng dữ liệu khảo sát chương trình đào tạo, dựng theo đúng trang Bảng dữ liệu của học
  phần: một bảng chung, khoá ngành đủ điều kiện lên trước, cột đầu và ba cột cuối ghim lại
  khi cuộn ngang, một cột C cho mỗi câu có điểm. CTĐT không có sĩ số nên không có cột tỷ
  lệ phản hồi.
*/

const weakScoreThreshold = 3.5;
const statisticsPageSize = 20;
// Số cột không phải cột C, cho dòng đệm cuối bảng.
const fixedColumnCount = 11;

type EligibilityFilter = 'all' | 'eligible' | 'ineligible';

const invalidOf = (row: UnitReportRow) => row.responseCount - row.validResponseCount;

export const ProgramStatisticsView: React.FC = () => {
  const state = useUnitSurveyReport('PROGRAM');
  const survey = state.surveys.find((item) => String(item.semesterSurveyId) === state.selectedId);

  return (
    <div className="survey-operations-page survey-statistics-page">
      <StatisticsContent state={state} surveyName={survey?.surveyName ?? ''} />
    </div>
  );
};

const StatisticsContent: React.FC<{
  state: ReturnType<typeof useUnitSurveyReport>;
  surveyName: string;
}> = ({ state, surveyName }) => {
  const [searchText, setSearchText] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityFilter>('all');
  const [page, setPage] = useState(1);
  const report = state.report;

  const columns = useMemo(() => (report ? scoredQuestionsOf(report) : []), [report]);
  const rows = useMemo(() => report?.units ?? [], [report]);
  const eligibleCount = rows.filter((row) => row.isScored).length;

  // Khoá ngành đủ điều kiện lên trước; tìm kiếm và nhóm lọc trước khi vào bộ lọc cột để số
  // kết quả và phân trang tính trên đúng phần đang hiện.
  const orderedRows = useMemo(() => {
    const keyword = foldVietnamese(searchText).toLowerCase();
    return rows
      .filter((row) => {
        if (eligibilityFilter === 'eligible' && !row.isScored) return false;
        if (eligibilityFilter === 'ineligible' && row.isScored) return false;
        if (!keyword) return true;
        return foldVietnamese([row.unitCode, row.unitName, row.cohortName, row.facultyName].join(' '))
          .toLowerCase()
          .includes(keyword);
      })
      .sort((left, right) => Number(right.isScored) - Number(left.isScored));
  }, [rows, eligibilityFilter, searchText]);

  const filterColumns = useMemo<FilterableColumn<UnitReportRow>[]>(() => [
    { key: 'unitName', value: (row) => row.unitName },
    { key: 'unitCode', value: (row) => row.unitCode },
    { key: 'cohortName', value: (row) => row.cohortName },
    { key: 'facultyName', value: (row) => row.facultyName },
    { key: 'responseCount', value: (row) => String(row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (row) => String(row.validResponseCount), numeric: true },
    { key: 'invalidResponseCount', value: (row) => String(invalidOf(row)), numeric: true },
    {
      key: 'validRate',
      value: (row) => formatDecimal(validRateOf(row.validResponseCount, row.responseCount), 3),
      sortValue: (row) => validRateOf(row.validResponseCount, row.responseCount),
    },
    {
      key: 'averageScore',
      value: (row) => formatDecimalOrDash(row.isScored ? row.averageScore : null, 3),
      sortValue: (row) => (row.isScored ? row.averageScore : null),
    },
    { key: 'openCommentCount', value: (row) => String(row.openCommentCount), numeric: true },
    {
      key: 'eligibility',
      value: (row) => (row.isScored ? 'Đủ điều kiện' : 'Không đủ điều kiện'),
    },
  ], []);

  const filters = useColumnFilters(orderedRows, filterColumns);
  const filteredRows = filters.visibleRows;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / statisticsPageSize));
  const visibleRows = useMemo(
    () => filteredRows.slice((page - 1) * statisticsPageSize, page * statisticsPageSize),
    [page, filteredRows],
  );

  useEffect(() => {
    setPage(1);
  }, [state.selectedId, searchText, eligibilityFilter]);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const exportOptions = useMemo(
    () => (report ? buildExport(report, surveyName, columns, filteredRows, eligibilityFilter) : null),
    [report, surveyName, columns, filteredRows, eligibilityFilter],
  );

  const scoreOf = (row: UnitReportRow, question: ScoredQuestion) => {
    if (!row.isScored) return null;
    const score = row.questionScores.find((item) => item.questionId === question.questionId);
    return score?.answerCount ? score.averageScore : null;
  };

  return (
    <>
      <UnitReportToolbar surveyType="PROGRAM" state={state} idPrefix="program-statistics" />
      <UnitScoringNote report={report} surveyType="PROGRAM" />

      {report && (
        <section className="statistics-summary">
          <span>
            {columns.length} câu chấm điểm · {rows.length} khoá ngành ·{' '}
            <strong className="statistics-count--eligible">{eligibleCount}</strong> đủ điều kiện ·{' '}
            <strong className="statistics-count--ineligible">{rows.length - eligibleCount}</strong> không đủ điều kiện
            {filters.isFiltered && ` · đang lọc còn ${filteredRows.length} khoá ngành`}
          </span>
          {attentionCheckCountOf(report) > 0 && (
            <span className="statistics-trap-note">
              Bộ có <strong>{attentionCheckCountOf(report)} câu bẫy</strong>, không đánh số và
              không lên bảng
            </span>
          )}
          <span>Số liệu tính trực tiếp từ phiếu đã thu</span>
        </section>
      )}

      <UnitReportBody surveyType="PROGRAM" state={state} loadingLabel="Đang tải bảng dữ liệu...">
        {() => rows.length === 0 ? (
          <div className="operations-empty">
            <strong>Chưa có khoá ngành nào trong đợt khảo sát này.</strong>
          </div>
        ) : (
          <>
            <div className="statistics-filter-bar">
              <label className="catalog-search">
                <span className="catalog-sr-only">Tìm kiếm</span>
                <Search aria-hidden="true" size={16} />
                <input
                  type="search"
                  placeholder="Tìm khoá ngành, ngành, khoá hoặc khoa/viện"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
              </label>
              <span className="catalog-result-count" aria-live="polite">
                {filteredRows.length} kết quả
              </span>
              <div className="statistics-filter-options" role="radiogroup" aria-label="Nhóm khoá ngành">
                {([
                  ['all', 'Toàn bộ'],
                  ['eligible', 'Các khoá ngành đủ điều kiện'],
                  ['ineligible', 'Các khoá ngành không đủ điều kiện'],
                ] as const).map(([value, label]) => (
                  <label key={value} className="statistics-filter-option">
                    <input
                      type="radio"
                      name="program-statistics-eligibility-filter"
                      checked={eligibilityFilter === value}
                      onChange={() => setEligibilityFilter(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              {exportOptions && (
                <div style={{ marginLeft: 'auto' }}>
                  <ExportDropdown buttonLabel="Xuất bảng dữ liệu" size="sm" options={exportOptions} />
                </div>
              )}
            </div>

            {orderedRows.length === 0 ? (
              <div className="operations-empty">
                <strong>Không có khoá ngành nào khớp với tìm kiếm hoặc nhóm đang chọn.</strong>
              </div>
            ) : (
              <div className="statistics-table-scroll" tabIndex={0} aria-label="Bảng dữ liệu, cuộn ngang">
                <table className="statistics-table statistics-table--fill">
                  <thead>
                    <tr>
                      <th className="col-left col-left-1" scope="col">
                        {filters.filterHeader('unitName', 'Ngành')}
                      </th>
                      <th className="col-meta" scope="col">
                        {filters.filterHeader('unitCode', 'Khoá ngành')}
                      </th>
                      <th className="col-meta" scope="col">
                        {filters.filterHeader('cohortName', 'Khoá')}
                      </th>
                      <th className="col-meta" scope="col">
                        {filters.filterHeader('facultyName', 'Khoa / Viện')}
                      </th>
                      <th className="col-metric" scope="col">
                        {filters.filterHeader('responseCount', 'Số phiếu đã thu')}
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
                        title={`Số phiếu hợp lệ chia số phiếu đã thu. Cần ≥ ${report!.minimumValidRate}%`}
                      >
                        {filters.filterHeader('validRate', 'Tỷ lệ phiếu hợp lệ (%)')}
                      </th>
                      {columns.map((column) => (
                        <th
                          key={column.questionId}
                          className="col-question"
                          scope="col"
                          title={column.questionText}
                        >
                          C{column.columnOrder}
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
                      const validRate = validRateOf(row.validResponseCount, row.responseCount);
                      const missingReason = row.responseCount === 0
                        ? 'Khoá ngành chưa có phiếu nào.'
                        : `Không qua tiêu chí: cần tỷ lệ phiếu hợp lệ ≥ ${report!.minimumValidRate}%.`;
                      return (
                        <tr key={row.courseSectionSurveyId}>
                          <td className="col-left col-left-1" title={row.unitName}>{row.unitName}</td>
                          <td className="col-meta">
                            <span className="operations-code">{row.unitCode}</span>
                          </td>
                          <td className="col-meta" title={row.cohortName}>{row.cohortName}</td>
                          <td className="col-meta" title={row.facultyName}>{row.facultyName}</td>
                          <td className="num col-metric">{row.responseCount}</td>
                          <td className="num col-metric">{row.validResponseCount}</td>
                          <td className={invalidOf(row) > 0 ? 'num is-flagged col-metric' : 'num col-metric'}>
                            {invalidOf(row)}
                          </td>
                          <td className={`num col-metric${row.responseCount > 0 && validRate < report!.minimumValidRate ? ' is-flagged' : ''}`}>
                            {formatDecimal(validRate, 3)}
                          </td>
                          {columns.map((column) => {
                            const value = scoreOf(row, column);
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
                            title={row.isScored ? undefined : missingReason}
                          >
                            {row.isScored && row.averageScore !== null ? formatDecimal(row.averageScore, 3) : '—'}
                          </td>
                          <td className="num col-right col-right-2">{row.openCommentCount}</td>
                          <td
                            className="col-right col-right-1"
                            title={row.isScored ? 'Đủ điều kiện' : missingReason}
                          >
                            <span
                              className={
                                row.isScored
                                  ? 'statistics-eligibility statistics-eligibility--yes'
                                  : 'statistics-eligibility statistics-eligibility--no'
                              }
                            >
                              {row.isScored ? 'Đủ điều kiện' : 'Không đủ điều kiện'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="table-spacer" aria-hidden="true">
                      <td colSpan={fixedColumnCount + columns.length} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {orderedRows.length > 0 && (
              <TablePagination
                page={page}
                pageSize={statisticsPageSize}
                totalItems={filteredRows.length}
                itemLabel="khoá ngành"
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </UnitReportBody>
    </>
  );
};

/** Tệp xuất = đúng bảng đang hiển thị, kèm sheet nội dung câu hỏi của các cột C. */
function buildExport(
  report: UnitSurveyReport,
  surveyName: string,
  columns: ScoredQuestion[],
  rows: UnitReportRow[],
  eligibilityFilter: EligibilityFilter,
) {
  const groupLabel = eligibilityFilter === 'eligible'
    ? 'Các khoá ngành đủ điều kiện'
    : eligibilityFilter === 'ineligible'
      ? 'Các khoá ngành không đủ điều kiện'
      : 'Toàn bộ';

  return {
    fileName: `bang-du-lieu-khao-sat-${surveyName || 'ctdt'}`,
    metadata: {
      title: 'BẢNG DỮ LIỆU KHẢO SÁT CHƯƠNG TRÌNH ĐÀO TẠO',
      subtitle: `${surveyName || report.surveyName} · ${report.semesterName} năm học ${report.academicYearName}`,
      breadcrumb: ['Bảng dữ liệu khảo sát', 'Chương trình đào tạo'],
      info: {
        'Đợt khảo sát': surveyName || report.surveyName,
        'Học kỳ': `${report.semesterName} · ${report.academicYearName}`,
        'Bộ câu hỏi': report.templateName,
        'Tiêu chí tính điểm': `Tỷ lệ phiếu hợp lệ ≥ ${report.minimumValidRate}%`,
        'Nhóm khoá ngành': groupLabel,
        'Số khoá ngành trong tệp': rows.length,
      },
      summaryNotes: [
        'Tỷ lệ phiếu hợp lệ = Số phiếu hợp lệ ÷ Số phiếu đã thu.',
        'Số phiếu không hợp lệ là phiếu bị bộ lọc nhiễu loại, không tham gia tính điểm.',
        'C1, C2… là điểm trung bình từng câu hỏi (thang 5.0) từ phiếu hợp lệ; nội dung câu ở sheet "Danh sach cau hoi". Câu bẫy không đánh số và không có trong bảng.',
        'Mô tả: "Đủ điều kiện" là khoá ngành qua tiêu chí tính điểm; khoá ngành "Không đủ điều kiện" không được tính điểm.',
      ],
    },
    sheets: [
      {
        sheetName: 'Bang du lieu',
        title: `BẢNG DỮ LIỆU KHẢO SÁT (${rows.length} KHOÁ NGÀNH)`,
        columns: [
          { key: 'unitName', header: 'Ngành', width: 28 },
          { key: 'unitCode', header: 'Khoá ngành', width: 12, align: 'left' as const },
          { key: 'cohortName', header: 'Khoá', width: 12 },
          { key: 'facultyName', header: 'Khoa / Viện', width: 24 },
          { key: 'responseCount', header: 'Số phiếu đã thu', width: 12, type: 'number' as const, align: 'right' as const },
          { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 12, type: 'number' as const, align: 'right' as const },
          {
            key: 'invalidResponseCount',
            header: 'Số phiếu không hợp lệ',
            width: 14,
            type: 'number' as const,
            align: 'right' as const,
            format: (_: unknown, row: UnitReportRow) => invalidOf(row),
          },
          {
            key: 'validRate',
            header: 'Tỷ lệ phiếu hợp lệ (%)',
            width: 12,
            type: 'number' as const,
            align: 'right' as const,
            numberFormat: '0.000',
            format: (_: unknown, row: UnitReportRow) =>
              Number(validRateOf(row.validResponseCount, row.responseCount).toFixed(3)),
          },
          ...columns.map((column) => ({
            key: `c_${column.questionId}`,
            header: `C${column.columnOrder}`,
            width: 7,
            align: 'right' as const,
            format: (_: unknown, row: UnitReportRow) => {
              const score = row.questionScores.find((item) => item.questionId === column.questionId);
              return row.isScored && score?.answerCount ? formatDecimal(score.averageScore, 3) : '—';
            },
          })),
          {
            key: 'averageScore',
            header: 'Điểm trung bình',
            width: 12,
            align: 'right' as const,
            format: (_: unknown, row: UnitReportRow) =>
              row.isScored && row.averageScore !== null ? formatDecimal(row.averageScore, 3) : '—',
          },
          { key: 'openCommentCount', header: 'Số ý kiến mở', width: 10, type: 'number' as const, align: 'right' as const },
          {
            key: 'eligibility',
            header: 'Mô tả',
            width: 18,
            format: (_: unknown, row: UnitReportRow) => (row.isScored ? 'Đủ điều kiện' : 'Không đủ điều kiện'),
          },
        ],
        data: rows,
      },
      {
        sheetName: 'Danh sach cau hoi',
        title: 'DANH SÁCH CÂU HỎI ỨNG VỚI CÁC CỘT C',
        columns: [
          { key: 'columnOrder', header: 'Mã câu', width: 10, align: 'left' as const, format: (value: unknown) => `C${value}` },
          { key: 'questionText', header: 'Nội dung câu hỏi', width: 90 },
        ],
        data: columns,
      },
    ],
  };
}
