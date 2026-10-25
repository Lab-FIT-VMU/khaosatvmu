import React, { useEffect, useMemo, useState } from 'react';
import { ExportDropdown } from '../ExportDropdown';
import { NoteModalButton } from '../NoteModalButton';
import { TablePagination } from '../TablePagination';
import { useColumnFilters, type FilterableColumn } from '../../hooks/useColumnFilters';
import { usePaginatedItems } from '../../hooks/usePaginatedItems';
import { surveyTypeLabels } from '../../services/surveyApi';
import type { UnitReportRow, UnitSurveyReport } from '../../types';
import { formatDecimal, formatDecimalOrDash, formatSigned } from '../../utils/formatNumber';
import { UnitReportBody, UnitReportToolbar, UnitScoringNote } from './UnitReportFrame';
import {
  mean,
  questionSectionsOf,
  sampleStandardDeviation,
  sectionScoreOf,
  unitNounOf,
  useUnitSurveyReport,
  zScore,
  type QuestionSectionOption,
  type UnitSurveyType,
} from './unitReportModel';
import '../../styles/survey-operations.css';
import '../../styles/survey-statistics.css';
import '../../styles/reports.css';
import '../../styles/catalogs.css';

/*
  Phân tích chuyên sâu của CTĐT / giảng viên, dựng theo đúng trang Phân tích chuyên sâu
  của học phần: thanh tab góc nhìn, bộ chọn mục để tính điểm và Z-Score, bảng tô theo bậc
  68-95-99.7. Góc nhìn đổi theo đơn vị: CTĐT xét khoa, ngành và từng khoá ngành; khảo sát
  giảng viên chỉ có từng khoa nên chỉ có một góc nhìn.

  Tính ngay trên báo cáo sống, chỉ lấy đơn vị được tính điểm — cùng tập với điểm gộp.
*/

type TabId = 'faculties' | 'majors' | 'units';

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

/** Một đơn vị đã có điểm theo phạm vi câu đang chọn, kèm Z-Score. */
interface AnalysedUnit {
  row: UnitReportRow;
  score: number;
  zSchool: number | null;
  zFaculty: number | null;
}

/** Một nhóm (khoa hoặc ngành) gộp từ các đơn vị đã có điểm. */
interface AnalysedGroup {
  key: string;
  name: string;
  unitCount: number;
  targetCount: number;
  responseCount: number;
  validResponseCount: number;
  averageScore: number;
  standardDeviation: number | null;
  /** Mặt bằng nhóm so với toàn trường theo sai số chuẩn σ/√n. */
  meanZScore: number | null;
  /** Chênh giữa đơn vị cao nhất và thấp nhất của nhóm. */
  spread: number;
}

interface Analysis {
  schoolAverage: number | null;
  schoolDeviation: number | null;
  units: AnalysedUnit[];
  faculties: AnalysedGroup[];
  majors: AnalysedGroup[];
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

  const facultyStats = new Map<string, { average: number | null; deviation: number | null }>();
  for (const key of new Set(scored.map((item) => item.row.facultyName))) {
    const values = scored.filter((item) => item.row.facultyName === key).map((item) => item.score);
    facultyStats.set(key, { average: mean(values), deviation: sampleStandardDeviation(values) });
  }

  const units = scored.map((item) => {
    const faculty = facultyStats.get(item.row.facultyName);
    return {
      row: item.row,
      score: item.score,
      zSchool: zScore(item.score, schoolAverage, schoolDeviation),
      zFaculty: faculty ? zScore(item.score, faculty.average, faculty.deviation) : null,
    };
  });

  const groupBy = (keyOf: (row: UnitReportRow) => string): AnalysedGroup[] => {
    const groups = new Map<string, AnalysedUnit[]>();
    for (const unit of units) {
      const key = keyOf(unit.row);
      groups.set(key, [...(groups.get(key) ?? []), unit]);
    }
    return [...groups.entries()].map(([key, members]) => {
      const values = members.map((member) => member.score);
      const average = mean(values)!;
      return {
        key,
        name: key || 'Chưa gắn khoa',
        unitCount: members.length,
        targetCount: members.reduce((sum, member) => sum + (member.row.targetCount ?? 0), 0),
        responseCount: members.reduce((sum, member) => sum + member.row.responseCount, 0),
        validResponseCount: members.reduce((sum, member) => sum + member.row.validResponseCount, 0),
        averageScore: average,
        standardDeviation: sampleStandardDeviation(values),
        meanZScore: schoolAverage !== null && schoolDeviation !== null && schoolDeviation > 0
          ? (average - schoolAverage) / (schoolDeviation / Math.sqrt(members.length))
          : null,
        spread: Math.max(...values) - Math.min(...values),
      };
    }).sort((left, right) => left.name.localeCompare(right.name, 'vi'));
  };

  return {
    schoolAverage,
    schoolDeviation,
    units,
    faculties: groupBy((row) => row.facultyName),
    majors: report.surveyType === 'PROGRAM' ? groupBy((row) => row.majorName) : [],
  };
}

const tabsOf = (surveyType: UnitSurveyType): { id: TabId; label: string; hint: string }[] =>
  surveyType === 'PROGRAM'
    ? [
      {
        id: 'faculties',
        label: 'Phân tích theo khoa/viện',
        hint: 'Điểm trung bình các khoá ngành của từng khoa/viện. Cột Z-Score so điểm trung bình khoa với trung bình toàn trường theo sai số chuẩn σ/√n, chia bậc 1σ · 2σ · 3σ.',
      },
      {
        id: 'majors',
        label: 'Phân tích theo ngành',
        hint: 'So các khoá của cùng một ngành: biên độ rộng nghĩa là chất lượng chương trình không đều giữa các khoá.',
      },
      {
        id: 'units',
        label: 'Phân tích theo khoá ngành',
        hint: 'So điểm thô giữa các khoá ngành khác khoa là so sai. Z-score đưa mọi khoá ngành về cùng một thước.',
      },
    ]
    : [
      {
        id: 'units',
        label: 'Phân tích theo khoa/viện',
        hint: 'Mỗi dòng là một khoa/viện. Z-Score cho biết khoa lệch mặt bằng toàn trường bao nhiêu độ lệch chuẩn.',
      },
    ];

export const UnitAnalysisView: React.FC<{ surveyType: UnitSurveyType }> = ({ surveyType }) => {
  const state = useUnitSurveyReport(surveyType);
  const tabs = tabsOf(surveyType);
  const [tab, setTab] = useState<TabId>(tabs[0].id);
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
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];
  const noun = unitNounOf[surveyType];

  const exportOptions = useMemo(
    () => (report && analysis ? buildExport(report, surveyType, analysis, activeTab, selectedSection) : null),
    [report, surveyType, analysis, activeTab, selectedSection],
  );

  const tabNote = (
    <>
      <NoteModalButton title={`Chú thích · ${activeTab.label}`}>
        <p className="dashboard-report-note">{activeTab.hint}</p>
        <ul className="dashboard-notes">
          <li>Độ lệch chuẩn σ là độ lệch chuẩn mẫu (chia n − 1) của điểm các {noun} được tính điểm.</li>
          <li>Z-Score của một {noun} = (điểm {noun} − trung bình) ÷ σ.</li>
          <li>Z-Score của một nhóm = (điểm trung bình nhóm − trung bình toàn trường) ÷ (σ ÷ √n), n là số {noun} của nhóm.</li>
          <li>Bậc: |Z| ≥ 1 đáng chú ý, ≥ 2 rõ rệt, ≥ 3 rất bất thường.</li>
          <li>Chỉ tính các {noun} đủ điều kiện tính điểm; số liệu tính trực tiếp từ phiếu.</li>
        </ul>
      </NoteModalButton>
      {exportOptions && (
        <ExportDropdown options={exportOptions} buttonLabel="Xuất báo cáo phân tích" size="sm" />
      )}
    </>
  );

  return (
    <div className="survey-operations-page survey-statistics-page survey-analysis-page">
      <UnitReportToolbar surveyType={surveyType} state={state} idPrefix="unit-analysis" />
      <UnitScoringNote report={report} surveyType={surveyType} />

      <nav className="analysis-tabs" aria-label="Các góc nhìn phân tích">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`analysis-tab${item.id === activeTab.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
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
                name="unit-analysis-question-section"
                checked={option.id === sectionId}
                onChange={() => setSectionId(option.id)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}

      <UnitReportBody surveyType={surveyType} state={state} loadingLabel="Đang tính toán...">
        {(currentReport) => analysis && (
          analysis.units.length === 0 ? (
            <>
              <div className="analysis-hint-row">{tabNote}</div>
              <div className="operations-empty">
                <strong>
                  {selectedSection === null
                    ? `Đợt này chưa có ${noun} nào đủ điều kiện tính điểm.`
                    : `Chưa có ${noun} nào có điểm cho mục này.`}
                </strong>
              </div>
            </>
          ) : (
            <>
              <section className="statistics-summary">
                <span>
                  Trung bình toàn trường: <strong>{formatDecimalOrDash(analysis.schoolAverage, 3)}</strong>
                </span>
                {activeTab.id === 'units' && (
                  <span>
                    Độ lệch chuẩn: <strong>{formatDecimalOrDash(analysis.schoolDeviation, 3)}</strong>
                  </span>
                )}
                <span>
                  {analysis.units.length} {noun} có điểm
                  {surveyType === 'PROGRAM' && `: ${analysis.faculties.length} khoa/viện`}
                </span>
                {tabNote}
              </section>

              {activeTab.id === 'faculties' && (
                <GroupTable groups={analysis.faculties} groupHeader="Khoa / Viện" itemLabel="khoa/viện" surveyType={surveyType} />
              )}
              {activeTab.id === 'majors' && (
                <GroupTable groups={analysis.majors} groupHeader="Ngành" itemLabel="ngành" surveyType={surveyType} showSpread />
              )}
              {activeTab.id === 'units' && (
                <UnitTable units={analysis.units} surveyType={surveyType} report={currentReport} />
              )}
            </>
          )
        )}
      </UnitReportBody>
    </div>
  );
};

const GroupTable: React.FC<{
  groups: AnalysedGroup[];
  groupHeader: string;
  itemLabel: string;
  surveyType: UnitSurveyType;
  showSpread?: boolean;
}> = ({ groups, groupHeader, itemLabel, surveyType, showSpread = false }) => {
  const noun = unitNounOf[surveyType];
  const columns = useMemo<FilterableColumn<AnalysedGroup>[]>(() => [
    { key: 'name', value: (row) => row.name },
    { key: 'unitCount', value: (row) => String(row.unitCount), numeric: true },
    { key: 'responseCount', value: (row) => String(row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (row) => String(row.validResponseCount), numeric: true },
    {
      key: 'validRate',
      value: (row) => formatDecimal(validRateOf(row.validResponseCount, row.responseCount), 3),
      sortValue: (row) => validRateOf(row.validResponseCount, row.responseCount),
    },
    { key: 'averageScore', value: (row) => formatDecimal(row.averageScore, 3), numeric: true },
    {
      key: 'standardDeviation',
      value: (row) => formatDecimalOrDash(row.standardDeviation, 3),
      sortValue: (row) => row.standardDeviation,
    },
    { key: 'spread', value: (row) => formatDecimal(row.spread, 3), sortValue: (row) => row.spread },
    {
      key: 'meanZScore',
      value: (row) => formatDecimalOrDash(row.meanZScore, 3),
      sortValue: (row) => row.meanZScore,
    },
  ], []);
  const filters = useColumnFilters(groups, columns);
  const pagination = usePaginatedItems(filters.visibleRows, analysisPageSize);

  return (
    <div className="analysis-group-table">
      <table className="statistics-table statistics-table--fixed">
        <thead>
          <tr>
            <th scope="col" style={{ width: showSpread ? '22%' : '26%' }}>{filters.filterHeader('name', groupHeader)}</th>
            <th scope="col" style={{ width: '8%' }}>{filters.filterHeader('unitCount', `Số ${noun}`)}</th>
            <th scope="col" style={{ width: '9%' }}>{filters.filterHeader('responseCount', 'Số phiếu đã thu')}</th>
            <th scope="col" style={{ width: '9%' }}>{filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}</th>
            <th scope="col" style={{ width: '10%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
              {filters.filterHeader('validRate', 'Tỷ lệ phiếu hợp lệ (%)')}
            </th>
            <th scope="col" style={{ width: '10%' }}>{filters.filterHeader('averageScore', 'Điểm trung bình')}</th>
            <th scope="col" style={{ width: '9%' }}>{filters.filterHeader('standardDeviation', 'Độ lệch chuẩn')}</th>
            {showSpread && (
              <th scope="col" style={{ width: '9%' }} title={`Chênh giữa ${noun} cao nhất và thấp nhất`}>
                {filters.filterHeader('spread', 'Biên độ')}
              </th>
            )}
            <th
              scope="col"
              style={{ width: '10%' }}
              title="Điểm trung bình nhóm lệch trung bình toàn trường bao nhiêu lần sai số chuẩn σ/√n"
            >
              {filters.filterHeader('meanZScore', 'Z-Score so với toàn trường')}
            </th>
          </tr>
        </thead>
        <tbody>
          {pagination.visibleItems.map((group) => (
            <tr key={group.key}>
              <td title={group.name}>{group.name}</td>
              <td className="num">{group.unitCount}</td>
              <td className="num">{group.responseCount}</td>
              <td className="num">{group.validResponseCount}</td>
              <td className="num">{formatDecimal(validRateOf(group.validResponseCount, group.responseCount), 3)}</td>
              <td className={zTierClass(group.meanZScore)}>{formatDecimal(group.averageScore, 3)}</td>
              <td className="num">{formatDecimalOrDash(group.standardDeviation, 3)}</td>
              {showSpread && (
                <td className={group.spread >= 0.8 ? 'num is-flagged' : 'num'}>{formatDecimal(group.spread, 3)}</td>
              )}
              <td className={zTierClass(group.meanZScore)}>{signedOrDash(group.meanZScore)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TablePagination
        page={pagination.page}
        pageSize={analysisPageSize}
        totalItems={filters.visibleRows.length}
        itemLabel={itemLabel}
        onPageChange={pagination.setPage}
      />
    </div>
  );
};

const UnitTable: React.FC<{
  units: AnalysedUnit[];
  surveyType: UnitSurveyType;
  report: UnitSurveyReport;
}> = ({ units, surveyType }) => {
  const isProgram = surveyType === 'PROGRAM';
  const columns = useMemo<FilterableColumn<AnalysedUnit>[]>(() => [
    { key: 'facultyName', value: (item) => item.row.facultyName },
    { key: 'unitName', value: (item) => item.row.unitName },
    { key: 'unitCode', value: (item) => item.row.unitCode },
    { key: 'cohortName', value: (item) => item.row.cohortName },
    { key: 'targetCount', value: (item) => String(item.row.targetCount ?? 0), numeric: true },
    { key: 'responseCount', value: (item) => String(item.row.responseCount), numeric: true },
    { key: 'validResponseCount', value: (item) => String(item.row.validResponseCount), numeric: true },
    {
      key: 'responseRate',
      value: (item) => formatDecimal(item.row.responseRate ?? 0, 3),
      sortValue: (item) => item.row.responseRate ?? 0,
    },
    {
      key: 'validRate',
      value: (item) => formatDecimal(validRateOf(item.row.validResponseCount, item.row.responseCount), 3),
      sortValue: (item) => validRateOf(item.row.validResponseCount, item.row.responseCount),
    },
    { key: 'score', value: (item) => formatDecimal(item.score, 3), numeric: true },
    { key: 'zSchool', value: (item) => formatDecimalOrDash(item.zSchool, 3), sortValue: (item) => item.zSchool },
    { key: 'zFaculty', value: (item) => formatDecimalOrDash(item.zFaculty, 3), sortValue: (item) => item.zFaculty },
  ], []);
  const filters = useColumnFilters(units, columns);
  const pagination = usePaginatedItems(filters.visibleRows, analysisPageSize);

  return (
    <div className="statistics-table-scroll" tabIndex={0} aria-label={`Chi tiết chuẩn hoá từng ${unitNounOf[surveyType]}`}>
      <table className="statistics-table statistics-table--fixed">
        <thead>
          <tr>
            {isProgram ? (
              <>
                <th scope="col" style={{ width: '16%' }}>{filters.filterHeader('facultyName', 'Khoa / Viện')}</th>
                <th scope="col" style={{ width: '18%' }}>{filters.filterHeader('unitName', 'Ngành')}</th>
                <th scope="col" style={{ width: '8%' }}>{filters.filterHeader('unitCode', 'Khoá ngành')}</th>
                <th scope="col" style={{ width: '6%' }}>{filters.filterHeader('cohortName', 'Khoá')}</th>
              </>
            ) : (
              <>
                <th scope="col" style={{ width: '26%' }}>{filters.filterHeader('unitName', 'Khoa / Viện')}</th>
                <th scope="col" style={{ width: '8%' }}>{filters.filterHeader('targetCount', 'Tổng số phiếu phải thu')}</th>
              </>
            )}
            <th scope="col" style={{ width: '7%' }}>{filters.filterHeader('responseCount', 'Số phiếu đã thu')}</th>
            <th scope="col" style={{ width: '7%' }}>{filters.filterHeader('validResponseCount', 'Số phiếu hợp lệ')}</th>
            {!isProgram && (
              <th scope="col" style={{ width: '9%' }} title="Số phiếu đã thu chia tổng số phiếu phải thu">
                {filters.filterHeader('responseRate', 'Tỷ lệ phản hồi (%)')}
              </th>
            )}
            <th scope="col" style={{ width: '8%' }} title="Số phiếu hợp lệ chia số phiếu đã thu">
              {filters.filterHeader('validRate', 'Tỷ lệ phiếu hợp lệ (%)')}
            </th>
            <th scope="col" style={{ width: '7%' }}>{filters.filterHeader('score', 'Điểm')}</th>
            <th scope="col" style={{ width: '9%' }}>{filters.filterHeader('zSchool', 'Z-Score so với toàn trường')}</th>
            {isProgram && (
              <th scope="col" style={{ width: '9%' }}>{filters.filterHeader('zFaculty', 'Z-Score so với khoa')}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {pagination.visibleItems.map((item) => (
            <tr key={item.row.courseSectionSurveyId}>
              {isProgram ? (
                <>
                  <td title={item.row.facultyName}>{item.row.facultyName}</td>
                  <td title={item.row.unitName}>{item.row.unitName}</td>
                  <td><span className="operations-code">{item.row.unitCode}</span></td>
                  <td>{item.row.cohortName}</td>
                </>
              ) : (
                <>
                  <td title={item.row.unitName}>{item.row.unitName}</td>
                  <td className="num">{item.row.targetCount ?? 0}</td>
                </>
              )}
              <td className="num">{item.row.responseCount}</td>
              <td className="num">{item.row.validResponseCount}</td>
              {!isProgram && <td className="num">{formatDecimal(item.row.responseRate ?? 0, 3)}</td>}
              <td className="num">{formatDecimal(validRateOf(item.row.validResponseCount, item.row.responseCount), 3)}</td>
              <td className={zTierClass(isProgram ? item.zFaculty : item.zSchool)}>{formatDecimal(item.score, 3)}</td>
              <td className={zTierClass(item.zSchool)}>{signedOrDash(item.zSchool)}</td>
              {isProgram && <td className={zTierClass(item.zFaculty)}>{signedOrDash(item.zFaculty)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <TablePagination
        page={pagination.page}
        pageSize={analysisPageSize}
        totalItems={filters.visibleRows.length}
        itemLabel={unitNounOf[surveyType]}
        onPageChange={pagination.setPage}
      />
    </div>
  );
};

function buildExport(
  report: UnitSurveyReport,
  surveyType: UnitSurveyType,
  analysis: Analysis,
  tab: { id: TabId; label: string },
  section: QuestionSectionOption | null,
) {
  const typeLabel = surveyTypeLabels[surveyType];
  const noun = unitNounOf[surveyType];
  const scope = section ? section.sectionName : 'Toàn bộ bài khảo sát';
  const base = {
    fileName: `phan-tich-${surveyType === 'PROGRAM' ? 'ctdt' : 'giang-vien'}-${tab.id}`,
    metadata: {
      title: `PHÂN TÍCH CHUYÊN SÂU KHẢO SÁT ${typeLabel.toUpperCase()}`,
      subtitle: `${tab.label} · ${report.surveyName}`,
      breadcrumb: ['Phân tích chuyên sâu', typeLabel, tab.label],
      info: {
        'Học kỳ': `${report.semesterName} · ${report.academicYearName}`,
        'Tính điểm theo': scope,
        'Trung bình toàn trường': formatDecimalOrDash(analysis.schoolAverage, 3),
        'Độ lệch chuẩn': formatDecimalOrDash(analysis.schoolDeviation, 3),
      },
      summaryNotes: [
        `Chỉ tính các ${noun} đủ điều kiện tính điểm.`,
        `Z-Score của một ${noun} = (điểm − trung bình) ÷ độ lệch chuẩn mẫu.`,
        'Z-Score của một nhóm = (điểm trung bình nhóm − trung bình toàn trường) ÷ (σ ÷ √n).',
      ],
    },
  };

  if (tab.id === 'units') {
    return {
      ...base,
      sheets: [{
        sheetName: 'Phan tich',
        title: `${tab.label.toUpperCase()} (${analysis.units.length} ${noun.toUpperCase()})`,
        columns: [
          ...(surveyType === 'PROGRAM'
            ? [
              { key: 'facultyName', header: 'Khoa / Viện', width: 22, format: (_: unknown, row: AnalysedUnit) => row.row.facultyName },
              { key: 'unitName', header: 'Ngành', width: 26, format: (_: unknown, row: AnalysedUnit) => row.row.unitName },
              { key: 'unitCode', header: 'Khoá ngành', width: 12, format: (_: unknown, row: AnalysedUnit) => row.row.unitCode },
            ]
            : [{ key: 'unitName', header: 'Khoa / Viện', width: 26, format: (_: unknown, row: AnalysedUnit) => row.row.unitName }]),
          { key: 'score', header: 'Điểm', width: 10, align: 'right' as const, format: (_: unknown, row: AnalysedUnit) => formatDecimal(row.score, 3) },
          { key: 'zSchool', header: 'Z-Score so với toàn trường', width: 14, align: 'right' as const, format: (_: unknown, row: AnalysedUnit) => signedOrDash(row.zSchool) },
          ...(surveyType === 'PROGRAM'
            ? [{ key: 'zFaculty', header: 'Z-Score so với khoa', width: 14, align: 'right' as const, format: (_: unknown, row: AnalysedUnit) => signedOrDash(row.zFaculty) }]
            : []),
        ],
        data: analysis.units,
      }],
    };
  }

  const groups = tab.id === 'majors' ? analysis.majors : analysis.faculties;
  return {
    ...base,
    sheets: [{
      sheetName: 'Phan tich',
      title: tab.label.toUpperCase(),
      columns: [
        { key: 'name', header: tab.id === 'majors' ? 'Ngành' : 'Khoa / Viện', width: 28 },
        { key: 'unitCount', header: `Số ${noun}`, width: 10, type: 'number' as const, align: 'right' as const },
        { key: 'averageScore', header: 'Điểm trung bình', width: 12, align: 'right' as const, format: (value: unknown) => formatDecimal(Number(value), 3) },
        { key: 'standardDeviation', header: 'Độ lệch chuẩn', width: 12, align: 'right' as const, format: (value: unknown) => formatDecimalOrDash(value as number | null, 3) },
        { key: 'meanZScore', header: 'Z-Score so với toàn trường', width: 14, align: 'right' as const, format: (value: unknown) => signedOrDash(value as number | null) },
      ],
      data: groups,
    }],
  };
}
