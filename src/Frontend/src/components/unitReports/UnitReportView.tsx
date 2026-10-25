import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  GraduationCap,
  Info,
  LayoutDashboard,
  ListFilter,
  MessageSquareText,
} from 'lucide-react';
import { DataTable, type Column } from '../DataTable';
import { NoteModalButton } from '../NoteModalButton';
import { FacultyCompletionChart } from '../reports/FacultyCompletionChart';
import { FacultyScoreChart } from '../reports/FacultyScoreChart';
import { SchoolCriteriaChart } from '../reports/SchoolCriteriaChart';
import { WeakestQuestionsPanel } from '../reports/WeakestQuestionsPanel';
import { completionColor, scoreColor } from '../reports/theme';
import { surveyTypeLabels } from '../../services/surveyApi';
import type { UnitReportComment, UnitReportGroup, UnitReportRow, UnitSurveyReport } from '../../types';
import { formatDecimal, formatNumber, formatPercent } from '../../utils/formatNumber';
import { foldVietnamese } from '../../utils/vietnamese';
import { UnitReportBody, UnitReportToolbar, UnitScoringNote } from './UnitReportFrame';
import {
  respondentNounOf,
  scoredValidResponseCountOf,
  toFacultyCompletion,
  toFacultyOverviews,
  toQuestionRatings,
  unitNounOf,
  unitTitleOf,
  useUnitSurveyReport,
  type UnitSurveyType,
} from './unitReportModel';
import '../../styles/survey-operations.css';
import '../../styles/reports.css';
import '../../styles/survey-statistics.css';
import '../../styles/catalogs.css';

/*
  Thống kê & Báo cáo của CTĐT / giảng viên, dựng theo đúng module của tab học phần: thanh
  tab chế độ xem, tab Tổng quan với hai nhóm thẻ chỉ số và ba tab con dùng lại đúng các
  biểu đồ của học phần, các bảng xếp hạng theo đơn vị, ý kiến mở và tra cứu chi tiết.
*/

type Workspace = 'overview' | 'faculties' | 'majors' | 'cohorts' | 'comments' | 'details';
type AnalysisView = 'faculties' | 'quality' | 'criteria';

const rankedPageSize = 20;

const workspaceDefs: { id: Workspace; label: string; icon: React.ReactNode; program: boolean; lecturer: boolean }[] = [
  { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="operation-icon" aria-hidden="true" />, program: true, lecturer: true },
  { id: 'faculties', label: 'Theo Khoa/Viện', icon: <Building2 className="operation-icon" aria-hidden="true" />, program: true, lecturer: true },
  { id: 'majors', label: 'Theo Ngành', icon: <GraduationCap className="operation-icon" aria-hidden="true" />, program: true, lecturer: false },
  { id: 'cohorts', label: 'Theo Khoá', icon: <CalendarDays className="operation-icon" aria-hidden="true" />, program: true, lecturer: false },
  { id: 'comments', label: 'Phân tích ý kiến mở', icon: <MessageSquareText className="operation-icon" aria-hidden="true" />, program: true, lecturer: true },
  // Khảo sát giảng viên: mỗi đơn vị đã là một khoa, tra cứu chi tiết trùng với Theo Khoa/Viện.
  { id: 'details', label: 'Tra cứu chi tiết', icon: <ListFilter className="operation-icon" aria-hidden="true" />, program: true, lecturer: false },
];

const validRateOf = (valid: number, total: number) => (total === 0 ? 0 : (valid / total) * 100);

export const UnitReportView: React.FC<{ surveyType: UnitSurveyType }> = ({ surveyType }) => {
  const state = useUnitSurveyReport(surveyType);
  const [workspace, setWorkspace] = useState<Workspace>('overview');
  const isProgram = surveyType === 'PROGRAM';
  const workspaces = workspaceDefs.filter((item) => (isProgram ? item.program : item.lecturer));

  return (
    <div className="survey-operations-page reports-module">
      <UnitReportToolbar surveyType={surveyType} state={state} idPrefix="unit-reports" />

      <div className="reports-header">
        <h1 className="reports-title">
          <BarChart3 className="operation-icon" aria-hidden="true" />
          Thống kê kết quả khảo sát {surveyTypeLabels[surveyType].toLowerCase()}
        </h1>
      </div>

      <UnitScoringNote report={state.report} surveyType={surveyType} />

      <UnitReportBody surveyType={surveyType} state={state} loadingLabel="Đang tải kết quả...">
        {(report) => (
          <div className="reports-overview">
            <nav className="reports-workspace-tabs" aria-label="Chế độ xem báo cáo" role="tablist">
              {workspaces.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={workspace === item.id}
                  className={`reports-workspace-tab${workspace === item.id ? ' is-active' : ''}`}
                  onClick={() => setWorkspace(item.id)}
                >
                  {item.icon}
                  <strong>{item.label}</strong>
                </button>
              ))}
            </nav>

            {workspace === 'overview' && <OverviewWorkspace report={report} surveyType={surveyType} />}

            {workspace === 'faculties' && (
              <div className="reports-aggregate-workspace" role="tabpanel">
                {isProgram ? (
                  <RankedGroupTable
                    title="Kết quả theo Khoa/Viện"
                    groupHeader="Khoa / Viện"
                    itemLabel="khoa/viện"
                    data={report.faculties}
                    surveyType={surveyType}
                    report={report}
                    exportTitle="BÁO CÁO XẾP HẠNG KẾT QUẢ THEO KHOA/VIỆN"
                    exportFileName="xep-hang-khoa-vien-ctdt"
                  />
                ) : (
                  <RankedUnitTable report={report} surveyType={surveyType} title="Kết quả theo Khoa/Viện" />
                )}
              </div>
            )}

            {workspace === 'majors' && (
              <div className="reports-aggregate-workspace" role="tabpanel">
                <RankedGroupTable
                  title="Kết quả theo Ngành"
                  groupHeader="Ngành"
                  itemLabel="ngành"
                  data={report.majors}
                  surveyType={surveyType}
                  report={report}
                  exportTitle="BÁO CÁO XẾP HẠNG KẾT QUẢ THEO NGÀNH"
                  exportFileName="xep-hang-nganh-ctdt"
                />
              </div>
            )}

            {workspace === 'cohorts' && (
              <div className="reports-aggregate-workspace" role="tabpanel">
                <RankedGroupTable
                  title="Kết quả theo Khoá"
                  groupHeader="Khoá"
                  itemLabel="khoá"
                  data={report.cohorts}
                  surveyType={surveyType}
                  report={report}
                  exportTitle="BÁO CÁO XẾP HẠNG KẾT QUẢ THEO KHOÁ"
                  exportFileName="xep-hang-khoa-ctdt"
                />
              </div>
            )}

            {workspace === 'comments' && <CommentsWorkspace report={report} surveyType={surveyType} />}

            {workspace === 'details' && <DetailsWorkspace report={report} surveyType={surveyType} />}
          </div>
        )}
      </UnitReportBody>
    </div>
  );
};

// ------------------------------------------------------------------ Tổng quan

const OverviewWorkspace: React.FC<{ report: UnitSurveyReport; surveyType: UnitSurveyType }> = ({
  report,
  surveyType,
}) => {
  const isProgram = surveyType === 'PROGRAM';
  const noun = unitNounOf[surveyType];
  const [analysisView, setAnalysisView] = useState<AnalysisView>('faculties');
  const [questionCount, setQuestionCount] = useState(5);
  const [questionInput, setQuestionInput] = useState('5');
  const [questionLowest, setQuestionLowest] = useState(true);

  const summary = report.summary;
  const scoredValid = scoredValidResponseCountOf(report);
  const faculties = useMemo(() => toFacultyOverviews(report), [report]);
  const completion = useMemo(() => toFacultyCompletion(report), [report]);
  const questions = useMemo(() => toQuestionRatings(report), [report]);
  const rankedQuestions = useMemo(
    () => [...questions]
      .sort((left, right) => (questionLowest
        ? left.averageScore - right.averageScore
        : right.averageScore - left.averageScore))
      .slice(0, questionCount),
    [questions, questionLowest, questionCount],
  );
  const schoolAverage = summary.averageScore ?? 0;

  const changeQuestionCount = (value: string) => {
    setQuestionInput(value);
    const next = Number(value);
    if (Number.isInteger(next) && next >= 1 && next <= Math.max(1, questions.length)) setQuestionCount(next);
  };

  return (
    <section className="reports-exec" aria-label="Bảng tổng quan kết quả khảo sát toàn trường">
      <header className="reports-exec-header">
        <div className="reports-exec-heading">
          <div>
            <h2>Bảng tổng quan kết quả khảo sát {surveyTypeLabels[surveyType].toLowerCase()}</h2>
          </div>
        </div>
      </header>

      {summary.responseCount === 0 ? (
        <div className="reports-exec-empty">
          <Info className="operation-icon" aria-hidden="true" />
          <strong>Đợt này chưa có phiếu trả lời</strong>
          <span>Số liệu sẽ có khi {respondentNounOf[surveyType]} bắt đầu nộp phiếu.</span>
        </div>
      ) : (
        <>
          <div className="reports-overview-sections">
            <div className="reports-overview-group">
              <div className="reports-overview-group-header">
                <span className="reports-overview-group-title">Tiến độ thu thập phiếu</span>
              </div>
              <div className="reports-overview-kpis" role="region" aria-label="Tiến độ thu thập phiếu">
                {isProgram ? (
                  <div className="reports-overview-kpi-card" title="Số khoá ngành được phát đường dẫn khảo sát">
                    <span className="reports-overview-kpi-label">Số khoá ngành khảo sát</span>
                    <div className="reports-overview-kpi-value">
                      <strong className="reports-overview-kpi-num">{formatNumber(summary.unitCount)}</strong>
                      <span className="reports-overview-kpi-unit">khoá ngành</span>
                    </div>
                    <span className="reports-overview-kpi-sub">Không có sĩ số, không có chỉ tiêu phiếu</span>
                  </div>
                ) : (
                  <div className="reports-overview-kpi-card" title="Tổng số giảng viên của các khoa được khảo sát">
                    <span className="reports-overview-kpi-label">Tổng số phiếu phải thu</span>
                    <div className="reports-overview-kpi-value">
                      <strong className="reports-overview-kpi-num">{formatNumber(summary.targetCount ?? 0)}</strong>
                      <span className="reports-overview-kpi-unit">phiếu</span>
                    </div>
                    <span className="reports-overview-kpi-sub">Số giảng viên cần khảo sát</span>
                  </div>
                )}

                <div className="reports-overview-kpi-card" title="Tổng số lượt đã hoàn thành và gửi phiếu khảo sát">
                  <span className="reports-overview-kpi-label">Số phiếu đã thu</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{formatNumber(summary.responseCount)}</strong>
                    <span className="reports-overview-kpi-unit">lượt</span>
                  </div>
                  <span className="reports-overview-kpi-sub">Tổng số lượt phiếu đã nộp</span>
                </div>

                <div
                  className="reports-overview-kpi-card"
                  title="Số phiếu hợp lệ sau khi loại bỏ phiếu trả lời ẩu, làm quá nhanh hoặc chọn đồng loạt"
                >
                  <span className="reports-overview-kpi-label">Số phiếu hợp lệ</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{formatNumber(summary.validResponseCount)}</strong>
                    <span className="reports-overview-kpi-unit">phiếu</span>
                    {summary.responseCount > 0 && (
                      <span className="reports-overview-kpi-badge">
                        {formatPercent((summary.validResponseCount / summary.responseCount) * 100)}
                      </span>
                    )}
                  </div>
                  <span className="reports-overview-kpi-sub">Vượt qua các bộ lọc chất lượng</span>
                </div>

                {isProgram ? (
                  <div className="reports-overview-kpi-card" title="Khoá ngành đã có ít nhất một phiếu">
                    <span className="reports-overview-kpi-label">Khoá ngành đã có phiếu</span>
                    <div className="reports-overview-kpi-value">
                      <strong className="reports-overview-kpi-num">
                        {formatNumber(summary.respondedUnitCount)}
                        <span className="reports-overview-kpi-denom"> / {formatNumber(summary.unitCount)}</span>
                      </strong>
                    </div>
                    <span className="reports-overview-kpi-sub">Khoá ngành có ít nhất một phiếu</span>
                  </div>
                ) : (
                  <div className="reports-overview-kpi-card" title="Phiếu đã thu chia tổng số phiếu phải thu">
                    <span className="reports-overview-kpi-label">Tỷ lệ phản hồi</span>
                    <div className="reports-overview-kpi-value">
                      <strong className="reports-overview-kpi-num">{formatPercent(summary.responseRate ?? 0)}</strong>
                    </div>
                    <span className="reports-overview-kpi-sub">Phiếu đã thu trên chỉ tiêu</span>
                  </div>
                )}
              </div>
            </div>

            <div className="reports-overview-group">
              <div className="reports-overview-group-header">
                <span className="reports-overview-group-title">Kết quả đánh giá & Lọc tính điểm</span>
              </div>
              <div className="reports-overview-kpis" role="region" aria-label="Kết quả đánh giá và tính điểm">
                <div className="reports-overview-kpi-card" title={`Điểm trung bình các ${noun} đủ điều kiện`}>
                  <span className="reports-overview-kpi-label">Điểm trung bình</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{formatDecimal(schoolAverage, 3)}</strong>
                    <span className="reports-overview-kpi-scale">/ 5,0</span>
                  </div>
                  <span className="reports-overview-kpi-sub">Chỉ tính các phiếu hợp lệ thuộc {noun} đủ điều kiện</span>
                </div>

                <div className="reports-overview-kpi-card" title={`${noun} qua tiêu chí tính điểm trên tổng số ${noun}`}>
                  <span className="reports-overview-kpi-label">{isProgram ? 'Khoá ngành' : 'Khoa / viện'} đủ điều kiện</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">
                      {formatNumber(summary.scoredUnitCount)}
                      <span className="reports-overview-kpi-denom"> / {formatNumber(summary.unitCount)}</span>
                    </strong>
                    {summary.unitCount > 0 && (
                      <span className="reports-overview-kpi-badge">
                        {formatPercent((summary.scoredUnitCount / summary.unitCount) * 100)}
                      </span>
                    )}
                  </div>
                  <span className="reports-overview-kpi-sub">
                    {isProgram ? 'Qua tiêu chí phiếu hợp lệ' : 'Qua cả 2 tiêu chí'}
                  </span>
                </div>

                <div className="reports-overview-kpi-card" title="Số phiếu hợp lệ thực sự được dùng để tính điểm">
                  <span className="reports-overview-kpi-label">Phiếu dùng để tính điểm</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{formatNumber(scoredValid)}</strong>
                    <span className="reports-overview-kpi-unit">phiếu</span>
                  </div>
                  <span className="reports-overview-kpi-sub">Phiếu hợp lệ của {noun} đủ điều kiện</span>
                </div>

                <div className="reports-overview-kpi-card" title={`Phiếu hợp lệ của những ${noun} không qua tiêu chí, không góp vào điểm`}>
                  <span className="reports-overview-kpi-label">Phiếu bị loại khỏi tính điểm</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">
                      {formatNumber(Math.max(0, summary.validResponseCount - scoredValid))}
                    </strong>
                    <span className="reports-overview-kpi-unit">phiếu</span>
                  </div>
                  <span className="reports-overview-kpi-sub">Phiếu hợp lệ của {noun} chưa đủ ĐK</span>
                </div>
              </div>
            </div>
          </div>

          <div className="reports-exec-note">
            <Info className="operation-icon" aria-hidden="true" />
            <div className="reports-exec-note-content">
              <span>
                <strong>Phiếu hợp lệ:</strong> Phiếu không bị lọc nhiễu (trả lời sai câu kiểm tra chú ý, chọn
                cùng một mức cho mọi câu, làm nhanh bất thường).
              </span>
              <span className="reports-exec-note-sep" aria-hidden="true">•</span>
              <span>
                <strong>{isProgram ? 'Khoá ngành' : 'Khoa / viện'} đủ điều kiện:</strong>{' '}
                {isProgram
                  ? `Khoá ngành có tỷ lệ phiếu hợp lệ ≥ ${report.minimumValidRate}%; chỉ những khoá ngành này mới được tính vào điểm trung bình.`
                  : 'Khoa qua cả hai ngưỡng tỷ lệ phản hồi và tỷ lệ phiếu hợp lệ; chỉ những khoa này mới được tính vào điểm trung bình.'}
              </span>
            </div>
          </div>

          <div className="reports-analysis-tabs" role="tablist" aria-label="Chọn nhóm phân tích">
            {([
              ['faculties', 'So sánh theo Khoa'],
              ['quality', 'Chất lượng phản hồi'],
              ['criteria', 'Điểm theo tiêu chí'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={analysisView === value}
                className={analysisView === value ? 'is-active' : ''}
                onClick={() => setAnalysisView(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {analysisView === 'faculties' && (
            isProgram ? (
              // CTĐT không có sĩ số nên không có biểu đồ tỷ lệ hoàn thành bên cạnh.
              <div className="reports-exec-card reports-analysis-panel" role="tabpanel">
                <header className="reports-exec-card-head">
                  <h3>Điểm TB theo Khoa / Viện</h3>
                  <span className="reports-exec-card-note">Đường nét đứt = điểm TB toàn trường</span>
                </header>
                <FacultyScoreChart faculties={faculties} schoolAverage={schoolAverage} />
              </div>
            ) : (
              <div className="reports-exec-grid reports-analysis-panel" role="tabpanel">
                <div className="reports-exec-card">
                  <header className="reports-exec-card-head">
                    <h3>Điểm TB theo Khoa / Viện</h3>
                    <span className="reports-exec-card-note">Đường nét đứt = điểm TB toàn trường</span>
                  </header>
                  <FacultyScoreChart faculties={faculties} schoolAverage={schoolAverage} />
                </div>
                <div className="reports-exec-card">
                  <header className="reports-exec-card-head">
                    <h3>Tỷ lệ hoàn thành theo Khoa / Viện</h3>
                  </header>
                  <FacultyCompletionChart faculties={completion} />
                </div>
              </div>
            )
          )}

          {analysisView === 'quality' && (
            <div className="reports-exec-card reports-analysis-panel reports-quality-card" role="tabpanel">
              <header className="reports-exec-card-head">
                <h3>{questionLowest ? 'Tiêu chí cần cải tiến' : 'Tiêu chí được đánh giá cao'}</h3>
                <div className="reports-question-controls">
                  <label htmlFor="unit-reports-question-count">Hiển thị</label>
                  <input
                    id="unit-reports-question-count"
                    type="number"
                    min={1}
                    max={Math.max(1, questions.length)}
                    value={questionInput}
                    onChange={(event) => changeQuestionCount(event.target.value)}
                    onBlur={() => setQuestionInput(String(questionCount))}
                  />
                  <label className="catalog-sr-only" htmlFor="unit-reports-question-order">
                    Đầu bảng điểm
                  </label>
                  <select
                    id="unit-reports-question-order"
                    value={questionLowest ? 'lowest' : 'highest'}
                    onChange={(event) => setQuestionLowest(event.target.value === 'lowest')}
                  >
                    <option value="lowest">tiêu chí điểm thấp nhất</option>
                    <option value="highest">tiêu chí điểm cao nhất</option>
                  </select>
                </div>
              </header>
              <div className="reports-question-body">
                <WeakestQuestionsPanel
                  questions={rankedQuestions}
                  validResponseCount={scoredValid}
                  lowestFirst={questionLowest}
                />
              </div>
            </div>
          )}

          {analysisView === 'criteria' && (
            <div className="reports-exec-card reports-analysis-panel" role="tabpanel">
              <header className="reports-exec-card-head">
                <div>
                  <h3>Điểm trung bình {questions.length} tiêu chí — toàn trường</h3>
                  <span className="reports-exec-card-note">
                    Đường nét đứt = điểm TB toàn trường ({formatDecimal(schoolAverage, 3)})
                  </span>
                </div>
                <div className="reports-exec-actions">
                  <NoteModalButton title="Lưu ý khi sử dụng số liệu">
                    <ul className="dashboard-notes" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                      <li>Trục hoành hiển thị các tiêu chí đánh giá từ C1 đến C{questions.length}.</li>
                      <li>Trục tung biểu thị điểm trung bình đánh giá theo thang điểm từ 0 đến 5.</li>
                      <li>Đường nét đứt ngang thể hiện điểm trung bình chung toàn trường ({formatDecimal(schoolAverage, 3)}).</li>
                      <li>Màu sắc cột: Xanh lá (≥ 3,8), Vàng (3,5 – 3,79), Cam (3,2 – 3,49), Đỏ (&lt; 3,2).</li>
                      <li>Số lượt đánh giá của từng tiêu chí là số phiếu hợp lệ của các {noun} đủ điều kiện.</li>
                    </ul>
                  </NoteModalButton>
                </div>
              </header>
              <SchoolCriteriaChart questions={questions} schoolAverage={schoolAverage} />
            </div>
          )}
        </>
      )}
    </section>
  );
};

// --------------------------------------------------------- Bảng xếp hạng nhóm

const countCell = (value: number) => <span className="catalog-cell-number">{value}</span>;

const rateCell = (value: number | null, colored: boolean) => (
  <span
    className="catalog-cell-number"
    style={colored && value !== null ? { color: completionColor(value), fontWeight: 700 } : undefined}
  >
    {value === null ? '—' : formatDecimal(value, 3)}
  </span>
);

const scoreCell = (value: number | null) => (
  <span className="reports-rank-score" style={value !== null ? { color: scoreColor(value) } : undefined}>
    {value !== null && value > 0 ? formatDecimal(value, 3) : '—'}
  </span>
);

const RankedGroupTable: React.FC<{
  title: string;
  groupHeader: string;
  itemLabel: string;
  data: UnitReportGroup[];
  surveyType: UnitSurveyType;
  report: UnitSurveyReport;
  exportTitle: string;
  exportFileName: string;
}> = ({ title, groupHeader, itemLabel, data, surveyType, report, exportTitle, exportFileName }) => {
  const withTarget = surveyType === 'LECTURER';
  const noun = unitNounOf[surveyType];
  const columns: Column<UnitReportGroup>[] = [
    {
      key: 'name',
      header: groupHeader,
      width: '22%',
      sortValue: (item) => item.name,
      filterValue: (item) => item.name,
      render: (item) => <span className="catalog-cell-primary">{item.name}</span>,
    },
    {
      key: 'unitCount',
      header: `Số ${noun}`,
      width: '8%',
      numeric: true,
      sortValue: (item) => item.unitCount,
      filterValue: (item) => String(item.unitCount),
      render: (item) => countCell(item.unitCount),
    },
    {
      key: 'scoredUnitCount',
      header: `${noun[0].toUpperCase()}${noun.slice(1)} đủ điều kiện`,
      width: '9%',
      numeric: true,
      sortValue: (item) => item.scoredUnitCount,
      filterValue: (item) => String(item.scoredUnitCount),
      render: (item) => countCell(item.scoredUnitCount),
    },
    ...(withTarget
      ? [{
        key: 'targetCount',
        header: 'Tổng số phiếu phải thu',
        width: '8%',
        numeric: true,
        sortValue: (item: UnitReportGroup) => item.targetCount ?? 0,
        filterValue: (item: UnitReportGroup) => String(item.targetCount ?? 0),
        render: (item: UnitReportGroup) => countCell(item.targetCount ?? 0),
      }]
      : []),
    {
      key: 'responseCount',
      header: 'Số phiếu đã thu',
      width: '9%',
      numeric: true,
      sortValue: (item) => item.responseCount,
      filterValue: (item) => String(item.responseCount),
      render: (item) => countCell(item.responseCount),
    },
    {
      key: 'validResponseCount',
      header: 'Số phiếu hợp lệ',
      width: '9%',
      numeric: true,
      sortValue: (item) => item.validResponseCount,
      filterValue: (item) => String(item.validResponseCount),
      render: (item) => countCell(item.validResponseCount),
    },
    {
      key: 'invalidResponseCount',
      header: 'Số phiếu không hợp lệ',
      width: '10%',
      numeric: true,
      sortValue: (item) => item.responseCount - item.validResponseCount,
      filterValue: (item) => String(item.responseCount - item.validResponseCount),
      render: (item) => {
        const invalid = item.responseCount - item.validResponseCount;
        return (
          <span className={invalid > 0 ? 'catalog-cell-number reports-invalid-count' : 'catalog-cell-number'}>
            {invalid}
          </span>
        );
      },
    },
    ...(withTarget
      ? [{
        key: 'responseRate',
        header: 'Tỷ lệ phản hồi (%)',
        width: '10%',
        numeric: true,
        sortValue: (item: UnitReportGroup) => item.responseRate ?? 0,
        filterValue: (item: UnitReportGroup) => formatDecimal(item.responseRate ?? 0, 3),
        render: (item: UnitReportGroup) => rateCell(item.responseRate, true),
      }]
      : []),
    {
      key: 'validRate',
      header: 'Tỷ lệ phiếu hợp lệ (%)',
      width: '10%',
      numeric: true,
      sortValue: (item) => validRateOf(item.validResponseCount, item.responseCount),
      filterValue: (item) => formatDecimal(validRateOf(item.validResponseCount, item.responseCount), 3),
      render: (item) => rateCell(validRateOf(item.validResponseCount, item.responseCount), false),
    },
    {
      key: 'averageScore',
      header: 'Điểm trung bình',
      width: '9%',
      numeric: true,
      sortValue: (item) => item.averageScore ?? -1,
      filterValue: (item) => formatDecimal(item.averageScore ?? 0, 3),
      render: (item) => scoreCell(item.averageScore),
    },
  ];

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
        keyExtractor={(item) => item.key || item.name}
        showIndex={false}
        pageSize={rankedPageSize}
        exportConfig={{
          title: exportTitle,
          fileName: exportFileName,
          subtitle: report.surveyName,
          breadcrumb: ['Thống kê & Báo cáo', surveyTypeLabels[surveyType], title],
          summaryNotes: [
            ...(withTarget ? ['Tỷ lệ phản hồi = Số phiếu đã thu ÷ Tổng số phiếu phải thu.'] : []),
            'Tỷ lệ phiếu hợp lệ = Số phiếu hợp lệ ÷ Số phiếu đã thu.',
            'Số phiếu không hợp lệ là phiếu bị bộ lọc nhiễu loại, không tham gia tính điểm.',
            `Điểm trung bình chỉ gộp các ${noun} đủ điều kiện tính điểm.`,
          ],
        }}
        emptyMessage="Chưa có dữ liệu tổng hợp."
      />
    </section>
  );
};

// ------------------------------------------------- Bảng đơn vị (khoa / khoá ngành)

function unitColumns(surveyType: UnitSurveyType): Column<UnitReportRow>[] {
  const isProgram = surveyType === 'PROGRAM';
  return [
    ...(isProgram
      ? [
        {
          key: 'facultyName',
          header: 'Khoa / Viện',
          width: '16%',
          sortValue: (item: UnitReportRow) => item.facultyName,
          filterValue: (item: UnitReportRow) => item.facultyName,
          render: (item: UnitReportRow) => <span className="catalog-cell-primary">{item.facultyName}</span>,
        },
        {
          key: 'unitName',
          header: 'Ngành',
          width: '18%',
          sortValue: (item: UnitReportRow) => item.unitName,
          filterValue: (item: UnitReportRow) => item.unitName,
          render: (item: UnitReportRow) => <span className="catalog-cell-primary">{item.unitName}</span>,
        },
        {
          key: 'unitCode',
          header: 'Khoá ngành',
          width: '9%',
          sortValue: (item: UnitReportRow) => item.unitCode,
          filterValue: (item: UnitReportRow) => item.unitCode,
          render: (item: UnitReportRow) => <span className="operations-code">{item.unitCode}</span>,
        },
        {
          key: 'cohortName',
          header: 'Khoá',
          width: '7%',
          sortValue: (item: UnitReportRow) => item.cohortName,
          filterValue: (item: UnitReportRow) => item.cohortName,
        },
      ]
      : [
        {
          key: 'unitName',
          header: 'Khoa / Viện',
          width: '24%',
          sortValue: (item: UnitReportRow) => item.unitName,
          filterValue: (item: UnitReportRow) => item.unitName,
          render: (item: UnitReportRow) => <span className="catalog-cell-primary">{item.unitName}</span>,
        },
        {
          key: 'targetCount',
          header: 'Tổng số phiếu phải thu',
          width: '9%',
          numeric: true,
          sortValue: (item: UnitReportRow) => item.targetCount ?? 0,
          filterValue: (item: UnitReportRow) => String(item.targetCount ?? 0),
          render: (item: UnitReportRow) => countCell(item.targetCount ?? 0),
        },
      ]),
    {
      key: 'responseCount',
      header: 'Số phiếu đã thu',
      width: '8%',
      numeric: true,
      sortValue: (item) => item.responseCount,
      filterValue: (item) => String(item.responseCount),
      render: (item) => countCell(item.responseCount),
    },
    {
      key: 'validResponseCount',
      header: 'Số phiếu hợp lệ',
      width: '8%',
      numeric: true,
      sortValue: (item) => item.validResponseCount,
      filterValue: (item) => String(item.validResponseCount),
      render: (item) => countCell(item.validResponseCount),
    },
    {
      key: 'invalidResponseCount',
      header: 'Số phiếu không hợp lệ',
      width: '9%',
      numeric: true,
      sortValue: (item) => item.responseCount - item.validResponseCount,
      filterValue: (item) => String(item.responseCount - item.validResponseCount),
      render: (item) => {
        const invalid = item.responseCount - item.validResponseCount;
        return (
          <span className={invalid > 0 ? 'catalog-cell-number reports-invalid-count' : 'catalog-cell-number'}>
            {invalid}
          </span>
        );
      },
    },
    ...(isProgram
      ? []
      : [{
        key: 'responseRate',
        header: 'Tỷ lệ phản hồi (%)',
        width: '10%',
        numeric: true,
        sortValue: (item: UnitReportRow) => item.responseRate ?? 0,
        filterValue: (item: UnitReportRow) => formatDecimal(item.responseRate ?? 0, 3),
        render: (item: UnitReportRow) => rateCell(item.responseRate, true),
      }]),
    {
      key: 'validRate',
      header: 'Tỷ lệ phiếu hợp lệ (%)',
      width: '9%',
      numeric: true,
      sortValue: (item) => validRateOf(item.validResponseCount, item.responseCount),
      filterValue: (item) => formatDecimal(validRateOf(item.validResponseCount, item.responseCount), 3),
      render: (item) => rateCell(validRateOf(item.validResponseCount, item.responseCount), false),
    },
    {
      key: 'averageScore',
      header: 'Điểm trung bình',
      width: '8%',
      numeric: true,
      sortValue: (item) => (item.isScored ? item.averageScore ?? -1 : -1),
      filterValue: (item) => (item.isScored ? formatDecimal(item.averageScore ?? 0, 3) : '—'),
      render: (item) => scoreCell(item.isScored ? item.averageScore : null),
    },
  ];
}

const unitExportColumns = (surveyType: UnitSurveyType) => [
  ...(surveyType === 'PROGRAM'
    ? [
      { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
      { key: 'unitName', header: 'Ngành', width: 26 },
      { key: 'unitCode', header: 'Khoá ngành', width: 12, align: 'left' as const },
      { key: 'cohortName', header: 'Khoá', width: 10 },
    ]
    : [
      { key: 'unitName', header: 'Khoa / Viện', width: 26 },
      { key: 'targetCount', header: 'Tổng số phiếu phải thu', width: 10, type: 'number' as const, align: 'right' as const },
    ]),
  { key: 'responseCount', header: 'Số phiếu đã thu', width: 12, type: 'number' as const, align: 'right' as const },
  { key: 'validResponseCount', header: 'Số phiếu hợp lệ', width: 12, type: 'number' as const, align: 'right' as const },
  {
    key: 'averageScore',
    header: 'Điểm trung bình',
    width: 12,
    align: 'right' as const,
    format: (_: unknown, row: UnitReportRow) =>
      row.isScored && row.averageScore !== null ? formatDecimal(row.averageScore, 3) : '—',
  },
];

/** Khảo sát giảng viên: bảng "Theo Khoa/Viện" chính là bảng từng đơn vị. */
const RankedUnitTable: React.FC<{ report: UnitSurveyReport; surveyType: UnitSurveyType; title: string }> = ({
  report,
  surveyType,
  title,
}) => (
  <section className="reports-rank" aria-label={title}>
    <header className="reports-rank-header">
      <span className="reports-rank-title">
        <h3>{title} ({report.units.length} {unitNounOf[surveyType]})</h3>
      </span>
    </header>
    <DataTable
      columns={unitColumns(surveyType)}
      data={report.units}
      keyExtractor={(item) => String(item.courseSectionSurveyId)}
      showIndex={false}
      pageSize={rankedPageSize}
      exportConfig={{
        title: 'BÁO CÁO XẾP HẠNG KẾT QUẢ THEO KHOA/VIỆN',
        fileName: 'xep-hang-khoa-vien-giang-vien',
        subtitle: report.surveyName,
        breadcrumb: ['Thống kê & Báo cáo', surveyTypeLabels[surveyType], title],
        summaryNotes: [
          'Tỷ lệ phản hồi = Số phiếu đã thu ÷ Tổng số phiếu phải thu (số giảng viên của khoa).',
          'Tỷ lệ phiếu hợp lệ = Số phiếu hợp lệ ÷ Số phiếu đã thu.',
          'Khoa chưa đủ điều kiện tính điểm không có điểm trung bình.',
        ],
      }}
      emptyMessage="Chưa có dữ liệu tổng hợp."
    />
  </section>
);

// ---------------------------------------------------------- Tra cứu chi tiết

const DetailsWorkspace: React.FC<{ report: UnitSurveyReport; surveyType: UnitSurveyType }> = ({
  report,
  surveyType,
}) => {
  const [search, setSearch] = useState('');
  const keyword = foldVietnamese(search);
  const rows = report.units.filter((row) =>
    foldVietnamese([row.facultyName, row.unitCode, row.unitName, row.cohortName].join(' ')).includes(keyword));
  const totalResponses = rows.reduce((sum, row) => sum + row.responseCount, 0);
  const totalValid = rows.reduce((sum, row) => sum + row.validResponseCount, 0);

  return (
    <>
      <div className="reports-kpi-band" aria-label="Tổng quan kết quả đang lọc">
        <span className="reports-kpi-item" title={`Số ${unitNounOf[surveyType]} trong bộ lọc`}>
          Số {unitNounOf[surveyType]} khảo sát
          <strong>{rows.length.toLocaleString('vi-VN')}</strong>
        </span>
        <span className="reports-kpi-item" title="Mọi lượt nộp, kể cả phiếu bị lọc nhiễu">
          Số phiếu đã thu
          <strong>{totalResponses.toLocaleString('vi-VN')}</strong>
        </span>
        <span className="reports-kpi-item" title="Phiếu qua được bộ lọc nhiễu">
          Số phiếu hợp lệ
          <strong>{totalValid.toLocaleString('vi-VN')}</strong>
        </span>
        <span className="reports-kpi-item" title="Phiếu bị bộ lọc nhiễu loại">
          Số phiếu không hợp lệ
          <strong>{(totalResponses - totalValid).toLocaleString('vi-VN')}</strong>
        </span>
        <span className="reports-kpi-item" title="Số phiếu hợp lệ / số phiếu đã thu">
          Tỷ lệ phiếu hợp lệ
          <strong>{formatPercent(validRateOf(totalValid, totalResponses), 3)}</strong>
        </span>
      </div>

      <section className="reports-table-section" aria-label="Bảng kết quả chi tiết">
        <DataTable
          columns={unitColumns(surveyType)}
          data={rows}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Khoa/viện, khoá ngành, ngành, khoá..."
          exportConfig={{
            title: `BÁO CÁO KẾT QUẢ KHẢO SÁT ${surveyTypeLabels[surveyType].toUpperCase()} CHI TIẾT`,
            fileName: `bao-cao-ket-qua-khao-sat-ctdt-chi-tiet-${report.semesterName}`,
            subtitle: report.surveyName,
            breadcrumb: ['Thống kê & Báo cáo', surveyTypeLabels[surveyType], 'Tra cứu chi tiết'],
            info: {
              'Học kỳ': `${report.semesterName} · ${report.academicYearName}`,
              [`Số ${unitNounOf[surveyType]}`]: rows.length,
              'Số phiếu đã thu': totalResponses,
              'Số phiếu hợp lệ': totalValid,
            },
            summaryNotes: [
              'Điểm trung bình được tính trên thang điểm 5.0 từ các phiếu đánh giá hợp lệ.',
              'Phiếu không hợp lệ là phiếu bị bộ lọc nhiễu loại và không tham gia tính điểm.',
            ],
            sheets: [{
              sheetName: 'Ket qua',
              title: `DANH SÁCH KẾT QUẢ KHẢO SÁT (${rows.length} ${unitNounOf[surveyType].toUpperCase()})`,
              columns: unitExportColumns(surveyType),
              data: rows,
            }],
          }}
          emptyMessage={`Không có ${unitNounOf[surveyType]} nào khớp với bộ lọc hiện tại.`}
          keyExtractor={(item) => String(item.courseSectionSurveyId)}
          showIndex={false}
          pageSize={20}
        />
      </section>
    </>
  );
};

// ------------------------------------------------------------- Ý kiến mở

const CommentsWorkspace: React.FC<{ report: UnitSurveyReport; surveyType: UnitSurveyType }> = ({
  report,
  surveyType,
}) => {
  const isProgram = surveyType === 'PROGRAM';
  const [search, setSearch] = useState('');
  const keyword = foldVietnamese(search);
  const rows = report.comments.filter((comment) =>
    foldVietnamese([comment.comment, comment.unitCode, comment.unitName, comment.facultyName].join(' '))
      .includes(keyword));

  const columns: Column<UnitReportComment>[] = [
    ...(isProgram
      ? [{
        key: 'facultyName',
        header: 'Khoa / Viện',
        width: '16%',
        filterValue: (item: UnitReportComment) => item.facultyName,
        render: (item: UnitReportComment) => <span className="catalog-cell-primary">{item.facultyName}</span>,
      }]
      : []),
    {
      key: 'unit',
      header: isProgram ? 'Khoá ngành' : 'Khoa / Viện',
      width: isProgram ? '20%' : '22%',
      filterValue: (item) => unitTitleOf(item, surveyType),
      render: (item) => <span className="catalog-cell-primary">{unitTitleOf(item, surveyType)}</span>,
    },
    {
      key: 'comment',
      header: 'Ý kiến khác',
      width: isProgram ? '44%' : '58%',
      render: (item) => <span style={{ whiteSpace: 'pre-wrap' }}>{item.comment}</span>,
    },
    {
      key: 'submittedAt',
      header: 'Thời điểm nộp',
      width: '11%',
      sortValue: (item) => new Date(item.submittedAt).getTime(),
      render: (item) => new Date(item.submittedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }),
    },
    {
      key: 'isValid',
      header: 'Phiếu',
      width: '9%',
      filterValue: (item) => (item.isValid ? 'Hợp lệ' : 'Bị lọc'),
      render: (item) => (
        <span className={`operations-status ${item.isValid ? 'operations-status--success' : 'operations-status--danger'}`}>
          {item.isValid ? 'Hợp lệ' : 'Bị lọc'}
        </span>
      ),
    },
  ];

  return (
    <section className="reports-rank" aria-label="Phân tích ý kiến mở">
      <header className="reports-rank-header">
        <span className="reports-rank-title">
          <h3>Ý kiến mở ({report.comments.length} ý kiến)</h3>
        </span>
      </header>
      <DataTable
        columns={columns}
        data={rows}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm nội dung ý kiến, khoa/viện, khoá ngành..."
        exportConfig={{
          title: `TỔNG HỢP Ý KIẾN MỞ KHẢO SÁT ${surveyTypeLabels[surveyType].toUpperCase()}`,
          fileName: `y-kien-mo-${isProgram ? 'ctdt' : 'giang-vien'}`,
          subtitle: report.surveyName,
          breadcrumb: ['Thống kê & Báo cáo', surveyTypeLabels[surveyType], 'Phân tích ý kiến mở'],
          summaryNotes: ['Ý kiến của phiếu bị bộ lọc nhiễu loại vẫn được giữ để tham khảo, có ghi rõ ở cột Phiếu.'],
        }}
        emptyMessage="Chưa có ý kiến mở nào."
        keyExtractor={(item) => String(item.responseId)}
        showIndex={false}
        pageSize={rankedPageSize}
      />
    </section>
  );
};
