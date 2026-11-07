import React, { useEffect, useMemo, useState } from 'react';
import { ExportDropdown } from '../ExportDropdown';
import { NoteModalButton } from '../NoteModalButton';
import { TablePagination } from '../TablePagination';
import { useColumnFilters, type FilterableColumn } from '../../hooks/useColumnFilters';
import { usePaginatedItems } from '../../hooks/usePaginatedItems';
import type { UnitReportRow, UnitSurveyReport } from '../../types';
import { formatDecimal, formatDecimalOrDash, formatSigned } from '../../utils/formatNumber';
import { UnitReportBody, UnitReportToolbar, UnitScoringNote } from '../unitReports/UnitReportFrame';
import {
  mean,
  questionSectionsOf,
  sampleStandardDeviation,
  sectionScoreOf,
  useUnitSurveyReport,
  zScore,
  type QuestionSectionOption,
} from '../unitReports/unitReportModel';
import '../../styles/survey-operations.css';
import '../../styles/survey-statistics.css';
import '../../styles/reports.css';
import '../../styles/catalogs.css';

/*
  Phân tích chuyên sâu của khảo sát giảng viên, dựng theo đúng trang Phân tích chuyên sâu
  của học phần: bộ chọn mục để tính điểm và Z-Score, bảng tô theo bậc 68-95-99.7. Mỗi khoa
  là một đơn vị nên chỉ có một góc nhìn: so từng khoa với mặt bằng toàn trường.

  Tính ngay trên báo cáo sống, chỉ lấy khoa được tính điểm — cùng tập với điểm gộp.
*/

const analysisPageSize = 20;

/** Ba bậc của quy tắc 68-95-99.7, cùng mốc với trang học phần. */
const zTiers = { notable: 1, strong: 2, extreme: 3 };

function zTierClass(value: number | null): string {
  if (value === null) return 'num';
  if (value <= -zTiers.strong) return 'num score-band score-band--bad';
  if (value <= -zTiers.notable) return 'num score-band score-band--poor';
  if (value >= zTiers.notable) return 'num score-band score-band--good';
  return 'num';
}

const signedOrDash = (value: number | null) => (value === null ? '—' : formatSigned(value));

const validRateOf = (valid: number, total: number) => (total === 0 ? 0 : (valid / total) * 100);

const tab = {
  label: 'Phân tích theo khoa/viện',
  hint: 'Mỗi dòng là một khoa/viện. Z-Score cho biết khoa lệch mặt bằng toàn trường bao nhiêu độ lệch chuẩn.',
};

/** Một khoa đã có điểm theo phạm vi câu đang chọn, kèm Z-Score so với toàn trường. */
interface AnalysedUnit {
  row: UnitReportRow;
  score: number;
  zSchool: number | null;
}

interface Analysis {
  schoolAverage: number | null;
  schoolDeviation: number | null;
  units: AnalysedUnit[];
}

function analyse(report: UnitSurveyReport, section: QuestionSectionOption | null): Analysis {
  const scored = report.units
    .filter((row) => row.isScored)
    .map((row) => ({
      row,
      score: section ? sectionScoreOf(row, section.questionIds) : row.averageScore,
    }))
    .filter((item): item is { row: UnitReportRow; score: number } => item.score !== null);

  const scores = scored.map((item) => item.score);
  const schoolAverage = mean(scores);
  const schoolDeviation = sampleStandardDeviation(scores);

  return {
    schoolAverage,
    schoolDeviation,
    units: scored.map((item) => ({
      row: item.row,
      score: item.score,
      zSchool: zScore(item.score, schoolAverage, schoolDeviation),
    })),
  };
}

export const LecturerAnalysisView: React.FC = () => {
  const state = useUnitSurveyReport('LECTURER');
  const [sectionId, setSectionId] = useState<number | null>(null);
  useEffect(() => {
    setSectionId(null);
  }, [state.selectedId]);

  const report = state.report;
  const sections = useMemo(() => (report ? questionSectionsOf(report) : []), [report]);
  const selectedSection = sections.find((section) => section.sectionId === sectionId) ?? null;
  const analysis = useMemo(
    () => (report ? analyse(report, selectedSection) : null),
    [report, selectedSection],
  );

  const exportOptions = useMemo(
    () => (report && analysis ? buildExport(report, analysis, selectedSection) : null),
    [report, analysis, selectedSection],
  );

  const tabNote = (
    <>
      <NoteModalButton title={`Chú thích · ${tab.label}`}>
        <p className="dashboard-report-note">{tab.hint}</p>
        <ul className="dashboard-notes">
          <li>Độ lệch chuẩn σ là độ lệch chuẩn mẫu (chia n − 1) của điểm các khoa / viện được tính điểm.</li>
          <li>Z-Score của một khoa / viện = (điểm khoa / viện − trung bình) ÷ σ.</li>
          <li>Bậc: |Z| ≥ 1 đáng chú ý, ≥ 2 rõ rệt, ≥ 3 rất bất thường.</li>
          <li>Chỉ tính các khoa / viện đủ điều kiện tính điểm; số liệu tính trực tiếp từ phiếu.</li>
        </ul>
      </NoteModalButton>
      {exportOptions && (
        <ExportDropdown options={exportOptions} buttonLabel="Xuất báo cáo phân tích" size="sm" />
      )}
    </>
  );

  return (
    <div className="survey-operations-page survey-statistics-page survey-analysis-page">
      <UnitReportToolbar surveyType="LECTURER" state={state} idPrefix="lecturer-analysis" />
      <UnitScoringNote report={report} surveyType="LECTURER" />

      <nav className="analysis-tabs" aria-label="Các góc nhìn phân tích">
        <button type="button" className="analysis-tab is-active">
          {tab.label}
        </button>
      </nav>

      {sections.length > 0 && (
        <div className="analysis-section-picker" role="radiogroup" aria-label="Tính điểm và Z-Score theo">
          <span className="analysis-section-picker__label">Tính điểm và Z-Score theo:</span>
          {[
            {
              id: null as number | null,
              label: `Toàn bộ bài khảo sát (${sections.reduce((sum, section) => sum + section.questionIds.length, 0)} câu)`,
            },
            ...sections.map((section) => ({
              id: section.sectionId as number | null,
              label: `${section.sectionName} (${section.questionIds.length} câu)`,
            })),
          ].map((option) => (
            <label key={option.id ?? 'all'} className="analysis-section-picker__option">
              <input
                type="radio"
                name="lecturer-analysis-question-section"
                checked={option.id === sectionId}
                onChange={() => setSectionId(option.id)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}

      <UnitReportBody surveyType="LECTURER" state={state} loadingLabel="Đang tính toán...">
        {() => analysis && (
          analysis.units.length === 0 ? (
            <>
              <div className="analysis-hint-row">{tabNote}</div>
              <div className="operations-empty">
                <strong>
                  {selectedSection === null
                    ? 'Đợt này chưa có khoa / viện nào đủ điều kiện tính điểm.'
                    : 'Chưa có khoa / viện nào có điểm cho mục này.'}
                </strong>
              </div>
            </>
          ) : (
            <>
              <section className="statistics-summary">
                <span>
                  Trung bình toàn trường: <strong>{formatDecimalOrDash(analysis.schoolAverage, 3)}</strong>
                </span>
                <span>
                  Độ lệch chuẩn: <strong>{formatDecimalOrDash(analysis.schoolDeviation, 3)}</strong>
                </span>
                <span>{analysis.units.length} khoa / viện có điểm</span>
                {tabNote}
              </section>

              <UnitTable units={analysis.units} />
            </>
          )
        )}
      </UnitReportBody>
    </div>
  );
};

const UnitTable: React.FC<{ units: AnalysedUnit[] }> = ({ units }) => {
  const columns = useMemo<FilterableColumn<AnalysedUnit>[]>(() => [
    { key: 'unitName', value: (item) => item.row.unitName },
    { key: 'responseCount', value: (item) => String(item.row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (item) => String(item.row.validResponseCount), numeric: true },
    {
      key: 'validRate',
      value: (item) => formatDecimal(validRateOf(item.row.validResponseCount, item.row.responseCount), 3),
      sortValue: (item) => validRateOf(item.row.validResponseCount, item.row.responseCount),
    },
    { key: 'score', value: (item) => formatDecimal(item.score, 3), numeric: true },
    { key: 'zSchool', value: (item) => formatDecimalOrDash(item.zSchool, 3), sortValue: (item) => item.zSchool },
  ], []);
  const filters = useColumnFilters(units, columns);
  const pagination = usePaginatedItems(filters.visibleRows, analysisPageSize);

  return (
    <div className="statistics-table-scroll" tabIndex={0} aria-label="Chi tiết chuẩn hoá từng khoa / viện">
      <table className="statistics-table statistics-table--fixed">
        <thead>
          <tr>
            <th scope="col" style={{ width: '34%' }}>{filters.filterHeader('unitName', 'Khoa / Viện')}</th>
            <th scope="col" style={{ width: '12%' }}>{filters.filterHeader('responseCount', 'Số phiếu đã thu')}</th>
            <th scope="col" style={{ width: '12%' }}>{filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}</th>
            <th scope="col" style={{ width: '14%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
              {filters.filterHeader('validRate', 'Tỷ lệ phiếu hợp lệ (%)')}
            </th>
            <th scope="col" style={{ width: '12%' }}>{filters.filterHeader('score', 'Điểm')}</th>
            <th scope="col" style={{ width: '16%' }}>{filters.filterHeader('zSchool', 'Z-Score so với toàn trường')}</th>
          </tr>
        </thead>
        <tbody>
          {pagination.visibleItems.map((item) => (
            <tr key={item.row.courseSectionSurveyId}>
              <td title={item.row.unitName}>{item.row.unitName}</td>
              <td className="num">{item.row.responseCount}</td>
              <td className="num">{item.row.validResponseCount}</td>
              <td className="num">{formatDecimal(validRateOf(item.row.validResponseCount, item.row.responseCount), 3)}</td>
              <td className={zTierClass(item.zSchool)}>{formatDecimal(item.score, 3)}</td>
              <td className={zTierClass(item.zSchool)}>{signedOrDash(item.zSchool)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TablePagination
        page={pagination.page}
        pageSize={analysisPageSize}
        totalItems={filters.visibleRows.length}
        itemLabel="khoa / viện"
        onPageChange={pagination.setPage}
      />
    </div>
  );
};

function buildExport(
  report: UnitSurveyReport,
  analysis: Analysis,
  section: QuestionSectionOption | null,
) {
  const scope = section ? section.sectionName : 'Toàn bộ bài khảo sát';
  return {
    fileName: 'phan-tich-giang-vien-units',
    metadata: {
      title: 'PHÂN TÍCH CHUYÊN SÂU KHẢO SÁT GIẢNG VIÊN',
      subtitle: `${tab.label} · ${report.surveyName}`,
      breadcrumb: ['Phân tích chuyên sâu', 'Giảng viên', tab.label],
      info: {
        'Học kỳ': `${report.semesterName} · ${report.academicYearName}`,
        'Tính điểm theo': scope,
        'Trung bình toàn trường': formatDecimalOrDash(analysis.schoolAverage, 3),
        'Độ lệch chuẩn': formatDecimalOrDash(analysis.schoolDeviation, 3),
      },
      summaryNotes: [
        'Chỉ tính các khoa / viện đủ điều kiện tính điểm.',
        'Z-Score của một khoa / viện = (điểm − trung bình) ÷ độ lệch chuẩn mẫu.',
      ],
    },
    sheets: [{
      sheetName: 'Phan tich',
      title: `${tab.label.toUpperCase()} (${analysis.units.length} KHOA / VIỆN)`,
      columns: [
        { key: 'unitName', header: 'Khoa / Viện', width: 26, format: (_: unknown, row: AnalysedUnit) => row.row.unitName },
        { key: 'score', header: 'Điểm', width: 10, align: 'right' as const, format: (_: unknown, row: AnalysedUnit) => formatDecimal(row.score, 3) },
        { key: 'zSchool', header: 'Z-Score so với toàn trường', width: 14, align: 'right' as const, format: (_: unknown, row: AnalysedUnit) => signedOrDash(row.zSchool) },
      ],
      data: analysis.units,
    }],
  };
}
