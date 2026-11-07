import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ExportDropdown } from '../ExportDropdown';
import { NoteModalButton } from '../NoteModalButton';
import type { UnitSurveyReport } from '../../types';
import { formatDecimal, formatDecimalOrDash, formatPercent } from '../../utils/formatNumber';
import { UnitReportBody, UnitReportToolbar, UnitScoringNote } from '../unitReports/UnitReportFrame';
import {
  questionWarningCounts,
  scoredQuestionsOf,
  useUnitSurveyReport,
} from '../unitReports/unitReportModel';
import '../../styles/survey-operations.css';
import '../../styles/survey-statistics.css';
import '../../styles/catalogs.css';
import '../../styles/survey-dashboard.css';

/*
  Tổng quan khảo sát chương trình đào tạo, dựng theo đúng trang Tổng quan khảo sát của
  học phần: chỉ số chính, biểu đồ điểm từng tiêu chí, bảng tiêu chí yếu nhất theo số khoá
  ngành cảnh báo, khối ngành cần rà soát và biểu đồ điểm theo khoa / viện. CTĐT không có
  sĩ số nên không có tỷ lệ phản hồi.
*/

/** Cùng thang màu với trang học phần. */
const lowScore = 3.2;
function barColor(score: number): string {
  if (score < lowScore) return '#d4544a';
  if (score < 3.5) return '#e0904a';
  if (score < 3.8) return '#d8b442';
  return '#3f9b5c';
}

const scoreAxis = { domain: [0, 5] as [number, number], ticks: [0, 1, 2, 3, 4, 5] };

/** Độ chênh điểm giữa các khoá của cùng một ngành được coi là lớn. */
const largeSpread = 0.8;

interface DashboardQuestion {
  questionOrder: number;
  questionText: string;
  averageScore: number;
  unitsBelowThreshold: number;
}

interface DashboardFaculty {
  facultyName: string;
  unitCount: number;
  averageScore: number;
}

interface DashboardData {
  questions: DashboardQuestion[];
  faculties: DashboardFaculty[];
  /** Hai chỉ số của khối "cần rà soát". */
  review: { label: string; value: number }[];
}

function buildDashboard(report: UnitSurveyReport): DashboardData {
  const warnings = questionWarningCounts(report);
  const questions = scoredQuestionsOf(report)
    .filter((question) => question.averageScore !== null)
    .map((question) => ({
      questionOrder: question.columnOrder,
      questionText: question.questionText,
      averageScore: question.averageScore ?? 0,
      unitsBelowThreshold: warnings.get(question.questionId) ?? 0,
    }));
  const faculties = report.faculties
    .filter((group) => group.averageScore !== null)
    .map((group) => ({
      facultyName: group.name,
      unitCount: group.scoredUnitCount,
      averageScore: group.averageScore ?? 0,
    }));

  const scored = report.units.filter((row) => row.isScored && row.averageScore !== null);
  // Như "học phần mọi lớp đều dưới ngưỡng" của học phần: ngành mà mọi khoá ngành được
  // tính điểm đều dưới mốc, nghĩa là vấn đề nằm ở chương trình chứ không ở một khoá.
  const byMajor = new Map<string, number[]>();
  for (const row of scored) {
    byMajor.set(row.majorName, [...(byMajor.get(row.majorName) ?? []), row.averageScore!]);
  }
  const majors = [...byMajor.values()];
  const review = [
    {
      label: 'Số ngành mọi khoá ngành đều dưới ngưỡng',
      value: majors.filter((scores) => scores.every((score) => score < lowScore)).length,
    },
    {
      label: 'Số ngành chênh lệch lớn giữa các khoá',
      value: majors.filter((scores) => scores.length > 1
        && Math.max(...scores) - Math.min(...scores) >= largeSpread).length,
    },
  ];

  return { questions, faculties, review };
}

const weakestRowsOf = (
  rows: DashboardQuestion[],
  threshold: number | null,
  direction: 'gte' | 'lte',
): DashboardQuestion[] => {
  if (threshold === null) {
    return [...rows].sort((left, right) => left.averageScore - right.averageScore).slice(0, 5);
  }
  return rows
    .filter((row) => (direction === 'gte'
      ? row.unitsBelowThreshold >= threshold
      : row.unitsBelowThreshold <= threshold))
    .sort((left, right) => (direction === 'gte'
      ? right.unitsBelowThreshold - left.unitsBelowThreshold || left.averageScore - right.averageScore
      : left.unitsBelowThreshold - right.unitsBelowThreshold || left.averageScore - right.averageScore));
};

const weakestTitle = (threshold: number | null, direction: 'gte' | 'lte'): string =>
  threshold === null
    ? '5 tiêu chí yếu nhất toàn trường'
    : `Tiêu chí có số khoá ngành cảnh báo ${direction === 'gte' ? 'từ' : 'đến'} ${threshold}`;

export const ProgramSurveyDashboardView: React.FC = () => {
  const state = useUnitSurveyReport('PROGRAM');
  const report = state.report;
  const [warningCount, setWarningCount] = useState('');
  const [direction, setDirection] = useState<'gte' | 'lte'>('gte');
  const threshold = warningCount === '' ? null : Math.max(0, Number(warningCount) || 0);

  const data = useMemo(() => (report ? buildDashboard(report) : null), [report]);
  const weakestRows = useMemo(
    () => (data ? weakestRowsOf(data.questions, threshold, direction) : []),
    [data, threshold, direction],
  );
  const surveyName = state.surveys
    .find((item) => String(item.semesterSurveyId) === state.selectedId)?.surveyName ?? '';

  return (
    <div className="survey-operations-page survey-statistics-page">
      <UnitReportToolbar
        surveyType="PROGRAM"
        state={state}
        idPrefix="program-survey-dashboard"
        actions={report && data ? (
          <ExportDropdown
            buttonLabel="Xuất báo cáo"
            size="sm"
            options={{
              fileName: `bao-cao-tong-quan-dot-khao-sat-${surveyName || 'Chương trình đào tạo'}-${report.semesterName}-${report.academicYearName}`,
              metadata: {
                title: 'BÁO CÁO TỔNG QUAN ĐỢT KHẢO SÁT CHƯƠNG TRÌNH ĐÀO TẠO',
                subtitle: `${report.templateName} — ${report.semesterName} năm học ${report.academicYearName}`,
                breadcrumb: ['Tổng quan khảo sát', 'Chương trình đào tạo'],
                info: {
                  'Bộ câu hỏi': report.templateName,
                  'Học kỳ': `${report.semesterName} · ${report.academicYearName}`,
                  'Số khoá ngành': report.summary.unitCount,
                  'Số phiếu đã thu': report.summary.responseCount,
                  'Số phiếu hợp lệ': report.summary.validResponseCount,
                  'Điểm trung bình toàn trường': formatDecimalOrDash(report.summary.averageScore, 3),
                },
                summaryNotes: ['Số liệu tính toán từ kết quả các phiếu khảo sát hợp lệ qua bộ lọc.'],
              },
              sheets: [
                {
                  sheetName: 'Theo khoa vien',
                  title: 'ĐIỂM TRUNG BÌNH THEO KHOA / VIỆN',
                  columns: [
                    { key: 'facultyName', header: 'Khoa / Viện', width: 28 },
                    { key: 'unitCount', header: 'Số khoá ngành', width: 12, type: 'number' as const, align: 'right' as const },
                    { key: 'averageScore', header: 'Điểm TB', width: 14, type: 'number' as const, align: 'right' as const, numberFormat: '0.000' },
                  ],
                  data: data.faculties,
                },
                {
                  sheetName: 'Tieu chi',
                  title: weakestTitle(threshold, direction).toLocaleUpperCase('vi-VN'),
                  columns: [
                    { key: 'questionOrder', header: 'Câu', width: 8, align: 'left' as const, format: (value: unknown) => `C${value}` },
                    { key: 'questionText', header: 'Nội dung', width: 80 },
                    { key: 'averageScore', header: 'Điểm trung bình', width: 16, type: 'number' as const, align: 'right' as const, numberFormat: '0.000' },
                    { key: 'unitsBelowThreshold', header: 'Khoá ngành cảnh báo', width: 14, type: 'number' as const, align: 'right' as const },
                  ],
                  data: weakestRows,
                },
              ],
            }}
          />
        ) : undefined}
      />
      <UnitScoringNote report={report} surveyType="PROGRAM" />

      <UnitReportBody surveyType="PROGRAM" state={state} loadingLabel="Đang tổng hợp số liệu...">
        {(currentReport) => data && (
          <div className="dashboard-report" tabIndex={0} aria-label="Tổng quan đợt khảo sát">
            <section className="statistics-summary">
              <span className="summary-title">
                Tổng quan khảo sát chương trình đào tạo — {currentReport.semesterName} năm học{' '}
                {currentReport.academicYearName}
              </span>
              <span>{currentReport.templateName}</span>
              <NoteModalButton title="Lưu ý khi sử dụng số liệu">
                <ul className="dashboard-notes">
                  <li>
                    Khảo sát đo MỨC HÀI LÒNG của người học, không đo trực tiếp chất lượng chương
                    trình đào tạo.
                  </li>
                  <li>Chênh lệch dưới 1 độ lệch chuẩn giữa các đơn vị không có ý nghĩa thống kê.</li>
                  <li>Khảo sát CTĐT không có sĩ số: số phiếu ít thì điểm của khoá ngành đó kém đại diện.</li>
                </ul>
                <p className="dashboard-report-note">
                  Số khoá ngành và tổng phiếu đếm mọi lượt nộp. Điểm chỉ tính trên phiếu hợp lệ, hiện có{' '}
                  <strong>{currentReport.summary.scoredUnitCount}</strong> khoá ngành đủ
                  điều kiện tính điểm.
                </p>
              </NoteModalButton>
            </section>

            <div className="dashboard-report-grid">
              <section className="dashboard-report-block">
                <h3 className="dashboard-report-title">Chỉ số chính</h3>
                <dl className="dashboard-kpi-list">
                  <div className="dashboard-kpi">
                    <dt>Số khoá ngành được khảo sát</dt>
                    <dd>{currentReport.summary.unitCount.toLocaleString('vi-VN')}</dd>
                  </div>
                  <div className="dashboard-kpi">
                    <dt>Số phiếu đã thu</dt>
                    <dd>{currentReport.summary.responseCount.toLocaleString('vi-VN')}</dd>
                  </div>
                  <div className="dashboard-kpi">
                    <dt>Số phiếu hợp lệ</dt>
                    <dd>{currentReport.summary.validResponseCount.toLocaleString('vi-VN')}</dd>
                  </div>
                  <div className="dashboard-kpi">
                    <dt>Tỷ lệ phiếu hợp lệ</dt>
                    <dd>
                      {formatPercent(
                        currentReport.summary.responseCount === 0
                          ? 0
                          : (currentReport.summary.validResponseCount / currentReport.summary.responseCount) * 100,
                        3,
                      )}
                    </dd>
                  </div>
                  <div className="dashboard-kpi">
                    <dt>Điểm tổng hợp toàn trường</dt>
                    <dd>{formatDecimalOrDash(currentReport.summary.averageScore, 3)}</dd>
                  </div>
                </dl>
              </section>
              <QuestionChart questions={data.questions} overallScore={currentReport.summary.averageScore} />
            </div>

            <section className="dashboard-report-block">
              <div className="dashboard-report-heading">
                <h3 className="dashboard-report-title">{weakestTitle(threshold, direction)}</h3>
                <div className="dashboard-warning-filter" aria-label="Lọc theo số khoá ngành cảnh báo">
                  <label>
                    <span>Số khoá ngành cảnh báo</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="Để trống"
                      value={warningCount}
                      onChange={(event) => setWarningCount(event.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </label>
                  <label>
                    <span>Chiều lọc</span>
                    <select value={direction} onChange={(event) => setDirection(event.target.value as 'gte' | 'lte')}>
                      <option value="gte">Từ số lượng này trở lên</option>
                      <option value="lte">Từ số lượng này trở xuống</option>
                    </select>
                  </label>
                </div>
              </div>
              {weakestRows.length === 0 ? (
                <p className="dashboard-report-note">Chưa có phiếu hợp lệ nào để xếp hạng tiêu chí.</p>
              ) : (
                <div className="catalog-table-scroll" tabIndex={0} aria-label="Tiêu chí yếu nhất">
                  <table className="catalog-table dashboard-weakest-table">
                    <thead>
                      <tr>
                        <th scope="col" style={{ width: '8%' }}>Câu</th>
                        <th scope="col" style={{ width: '62%' }}>Nội dung</th>
                        <th scope="col" style={{ width: '15%' }}>Điểm trung bình</th>
                        <th
                          scope="col"
                          style={{ width: '15%' }}
                          title="Khoá ngành chấm câu này thấp hơn trung bình của chính câu đó từ 1 độ lệch chuẩn trở lên"
                        >
                          Khoá ngành cảnh báo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {weakestRows.map((row) => (
                        <tr key={row.questionOrder}>
                          <td className="catalog-table__index" style={{ textAlign: 'left' }}>C{row.questionOrder}</td>
                          <td>
                            <span className="catalog-cell-primary">{row.questionText}</span>
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>{formatDecimal(row.averageScore, 3)}</td>
                          <td className={row.unitsBelowThreshold > 0 ? 'num is-flagged' : 'num'} style={{ textAlign: 'right' }}>
                            {row.unitsBelowThreshold}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="dashboard-report-grid">
              <section className="dashboard-report-block">
                <h3 className="dashboard-report-title">
                  Ngành cần rà soát
                </h3>
                <dl className="dashboard-kpi-list dashboard-kpi-list--warning">
                  {data.review.map((item) => (
                    <div className="dashboard-kpi" key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <FacultyChart
                faculties={data.faculties}
                overallScore={currentReport.summary.averageScore}
              />
            </div>
          </div>
        )}
      </UnitReportBody>
    </div>
  );
};

interface QuestionTooltipProps {
  active?: boolean;
  payload?: { payload: DashboardQuestion }[];
}

const QuestionTooltip: React.FC<QuestionTooltipProps> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="dashboard-chart-tooltip">
      <strong>C{item.questionOrder}</strong>
      <span>{item.questionText}</span>
      <span style={{ color: barColor(item.averageScore) }}>
        Điểm TB: {formatDecimal(item.averageScore, 3)} / 5,0
      </span>
      <span>
        {item.unitsBelowThreshold} khoá ngành chấm câu này thấp hơn trung bình của chính câu đó từ 1 độ
        lệch chuẩn trở lên
      </span>
    </div>
  );
};

const QuestionChart: React.FC<{ questions: DashboardQuestion[]; overallScore: number | null }> = ({
  questions,
  overallScore,
}) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">
      Điểm trung bình {questions.length} tiêu chí — toàn trường
    </h3>
    {questions.length === 0 ? (
      <p className="dashboard-report-note">Chưa có phiếu hợp lệ nào để dựng biểu đồ.</p>
    ) : (
      <div className="dashboard-chart-frame">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={questions.map((item) => ({ ...item, label: `C${item.questionOrder}` }))}
            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              tick={{ fontSize: 13, fill: '#68737d' }}
              interval={0}
            />
            <YAxis
              domain={scoreAxis.domain}
              ticks={scoreAxis.ticks}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              tick={{ fontSize: 13, fill: '#68737d' }}
            />
            <Tooltip content={<QuestionTooltip />} cursor={{ fill: 'rgba(7,136,184,0.06)' }} />
            {overallScore !== null && (
              <ReferenceLine
                y={overallScore}
                stroke="#68737d"
                strokeDasharray="4 4"
                label={{
                  value: `Toàn trường ${formatDecimal(overallScore, 3)}`,
                  position: 'insideTopRight',
                  fill: '#68737d',
                  fontSize: 13,
                }}
              />
            )}
            <Bar dataKey="averageScore" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {questions.map((item) => (
                <Cell key={item.questionOrder} fill={barColor(item.averageScore)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )}
  </section>
);

interface FacultyTooltipProps {
  active?: boolean;
  payload?: { payload: DashboardFaculty }[];
}

const FacultyTooltip: React.FC<FacultyTooltipProps> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="dashboard-chart-tooltip">
      <strong>{item.facultyName}</strong>
      <span style={{ color: barColor(item.averageScore) }}>
        Điểm TB: {formatDecimal(item.averageScore, 3)} / 5,0
      </span>
      <span>{item.unitCount} khoá ngành có điểm</span>
    </div>
  );
};

const FacultyChart: React.FC<{
  faculties: DashboardFaculty[];
  overallScore: number | null;
}> = ({ faculties, overallScore }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">Điểm tổng hợp theo khoa / viện</h3>
    {faculties.length === 0 ? (
      <p className="dashboard-report-note">Chưa có khoa/viện nào có điểm.</p>
    ) : (
      <div className="dashboard-chart-frame">
        <ResponsiveContainer width="100%" height={Math.max(220, faculties.length * 34 + 40)}>
          <BarChart data={faculties} layout="vertical" margin={{ top: 8, right: 32, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
            <XAxis
              type="number"
              domain={scoreAxis.domain}
              ticks={scoreAxis.ticks}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              tick={{ fontSize: 13, fill: '#68737d' }}
            />
            <YAxis
              type="category"
              dataKey="facultyName"
              width={170}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 13, fill: '#40505a' }}
            />
            <Tooltip content={<FacultyTooltip />} cursor={{ fill: 'rgba(7,136,184,0.06)' }} />
            {overallScore !== null && (
              <ReferenceLine x={overallScore} stroke="#68737d" strokeDasharray="4 4" />
            )}
            <Bar dataKey="averageScore" isAnimationActive={false} radius={[0, 2, 2, 0]}>
              {faculties.map((item) => (
                <Cell key={item.facultyName} fill={barColor(item.averageScore)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )}
  </section>
);
