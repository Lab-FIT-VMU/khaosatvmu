import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  Info,
  LayoutDashboard,
  MessageSquareText,
} from 'lucide-react';
import { DataTable, type Column } from '../DataTable';
import { NoteModalButton } from '../NoteModalButton';
import { FacultyScoreChart } from '../reports/FacultyScoreChart';
import { SchoolCriteriaChart } from '../reports/SchoolCriteriaChart';
import { WeakestQuestionsPanel } from '../reports/WeakestQuestionsPanel';
import { completionColor, scoreColor } from '../reports/theme';
import type { UnitReportComment, UnitReportRow, UnitSurveyReport } from '../../types';
import { formatDecimal, formatNumber, formatPercent } from '../../utils/formatNumber';
import { foldVietnamese } from '../../utils/vietnamese';
import { UnitReportBody, UnitReportToolbar, UnitScoringNote } from '../unitReports/UnitReportFrame';
import {
  scoredValidResponseCountOf,
  toFacultyOverviews,
  toQuestionRatings,
  useUnitSurveyReport,
} from '../unitReports/unitReportModel';
import '../../styles/survey-operations.css';
import '../../styles/reports.css';
import '../../styles/survey-statistics.css';
import '../../styles/catalogs.css';

/*
  Thống kê & Báo cáo của khảo sát giảng viên, dựng theo đúng module của học phần: thanh tab
  chế độ xem, tab Tổng quan với hai nhóm thẻ chỉ số và ba tab con dùng lại đúng các biểu đồ
  của học phần, bảng xếp hạng theo khoa / viện và ý kiến mở. Mỗi khoa là một đơn vị nên
  bảng "Theo Khoa/Viện" chính là bảng từng đơn vị, không cần thêm tab tra cứu chi tiết.
  Không xét sĩ số: khoa đủ điều kiện chỉ cần đạt tỷ lệ phiếu hợp lệ, như CTĐT.
*/

type Workspace = 'overview' | 'faculties' | 'comments';
type AnalysisView = 'faculties' | 'quality' | 'criteria';

const rankedPageSize = 20;

const workspaces: { id: Workspace; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="operation-icon" aria-hidden="true" /> },
  { id: 'faculties', label: 'Theo Khoa/Viện', icon: <Building2 className="operation-icon" aria-hidden="true" /> },
  { id: 'comments', label: 'Phân tích ý kiến mở', icon: <MessageSquareText className="operation-icon" aria-hidden="true" /> },
];

const validRateOf = (valid: number, total: number) => (total === 0 ? 0 : (valid / total) * 100);

export const LecturerReportView: React.FC = () => {
  const state = useUnitSurveyReport('LECTURER');
  const [workspace, setWorkspace] = useState<Workspace>('overview');

  return (
    <div className="survey-operations-page reports-module">
      <UnitReportToolbar surveyType="LECTURER" state={state} idPrefix="lecturer-reports" />

      <div className="reports-header">
        <h1 className="reports-title">
          <BarChart3 className="operation-icon" aria-hidden="true" />
          Thống kê kết quả khảo sát giảng viên
        </h1>
      </div>

      <UnitScoringNote report={state.report} surveyType="LECTURER" />

      <UnitReportBody surveyType="LECTURER" state={state} loadingLabel="Đang tải kết quả...">
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

            {workspace === 'overview' && <OverviewWorkspace report={report} />}

            {workspace === 'faculties' && (
              <div className="reports-aggregate-workspace" role="tabpanel">
                <RankedUnitTable report={report} title="Kết quả theo Khoa/Viện" />
              </div>
            )}

            {workspace === 'comments' && <CommentsWorkspace report={report} />}

          </div>
        )}
      </UnitReportBody>
    </div>
  );
};

// ------------------------------------------------------------------ Tổng quan

const OverviewWorkspace: React.FC<{ report: UnitSurveyReport }> = ({ report }) => {
  const noun = 'khoa / viện';
  const [analysisView, setAnalysisView] = useState<AnalysisView>('faculties');
  const [questionCount, setQuestionCount] = useState(5);
  const [questionInput, setQuestionInput] = useState('5');
  const [questionLowest, setQuestionLowest] = useState(true);

  const summary = report.summary;
  const scoredValid = scoredValidResponseCountOf(report);
  const faculties = useMemo(() => toFacultyOverviews(report), [report]);
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
            <h2>Bảng tổng quan kết quả khảo sát giảng viên</h2>
          </div>
        </div>
      </header>

      {summary.responseCount === 0 ? (
        <div className="reports-exec-empty">
          <Info className="operation-icon" aria-hidden="true" />
          <strong>Đợt này chưa có phiếu trả lời</strong>
          <span>Số liệu sẽ có khi giảng viên bắt đầu nộp phiếu.</span>
        </div>
      ) : (
        <>
          <div className="reports-overview-sections">
            <div className="reports-overview-group">
              <div className="reports-overview-group-header">
                <span className="reports-overview-group-title">Tiến độ thu thập phiếu</span>
              </div>
              <div className="reports-overview-kpis" role="region" aria-label="Tiến độ thu thập phiếu">
                <div className="reports-overview-kpi-card" title="Số khoa / viện được phát đường dẫn khảo sát">
                  <span className="reports-overview-kpi-label">Số khoa / viện khảo sát</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{formatNumber(summary.unitCount)}</strong>
                    <span className="reports-overview-kpi-unit">khoa / viện</span>
                  </div>
                  <span className="reports-overview-kpi-sub">Không có sĩ số, không có chỉ tiêu phiếu</span>
                </div>

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

                <div className="reports-overview-kpi-card" title="Khoa / viện đã có ít nhất một phiếu">
                  <span className="reports-overview-kpi-label">Khoa / viện đã có phiếu</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">
                      {formatNumber(summary.respondedUnitCount)}
                      <span className="reports-overview-kpi-denom"> / {formatNumber(summary.unitCount)}</span>
                    </strong>
                  </div>
                  <span className="reports-overview-kpi-sub">Khoa / viện có ít nhất một phiếu</span>
                </div>
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
                  <span className="reports-overview-kpi-label">Khoa / viện đủ điều kiện</span>
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
                  <span className="reports-overview-kpi-sub">Qua tiêu chí phiếu hợp lệ</span>
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
                <strong>Khoa / viện đủ điều kiện:</strong>{' '}
                {`Khoa / viện có tỷ lệ phiếu hợp lệ ≥ ${report.minimumValidRate}%; chỉ những khoa / viện này mới được tính vào điểm trung bình.`}
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
            // Không có sĩ số nên không có biểu đồ tỷ lệ hoàn thành bên cạnh.
            <div className="reports-exec-card reports-analysis-panel" role="tabpanel">
              <header className="reports-exec-card-head">
                <h3>Điểm TB theo Khoa / Viện</h3>
                <span className="reports-exec-card-note">Đường nét đứt = điểm TB toàn trường</span>
              </header>
              <FacultyScoreChart faculties={faculties} schoolAverage={schoolAverage} />
            </div>
          )}

          {analysisView === 'quality' && (
            <div className="reports-exec-card reports-analysis-panel reports-quality-card" role="tabpanel">
              <header className="reports-exec-card-head">
                <h3>{questionLowest ? 'Tiêu chí cần cải tiến' : 'Tiêu chí được đánh giá cao'}</h3>
                <div className="reports-question-controls">
                  <label htmlFor="lecturer-reports-question-count">Hiển thị</label>
                  <input
                    id="lecturer-reports-question-count"
                    type="number"
                    min={1}
                    max={Math.max(1, questions.length)}
                    value={questionInput}
                    onChange={(event) => changeQuestionCount(event.target.value)}
                    onBlur={() => setQuestionInput(String(questionCount))}
                  />
                  <label className="catalog-sr-only" htmlFor="lecturer-reports-question-order">
                    Đầu bảng điểm
                  </label>
                  <select
                    id="lecturer-reports-question-order"
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

// --------------------------------------------------------- Bảng từng khoa / viện

const unitColumns: Column<UnitReportRow>[] = [
  {
    key: 'unitName',
    header: 'Khoa / Viện',
    width: '30%',
    sortValue: (item) => item.unitName,
    filterValue: (item) => item.unitName,
    render: (item) => <span className="catalog-cell-primary">{item.unitName}</span>,
  },
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

/** Bảng "Theo Khoa/Viện" chính là bảng từng đơn vị. */
const RankedUnitTable: React.FC<{ report: UnitSurveyReport; title: string }> = ({ report, title }) => (
  <section className="reports-rank" aria-label={title}>
    <header className="reports-rank-header">
      <span className="reports-rank-title">
        <h3>{title} ({report.units.length} khoa / viện)</h3>
      </span>
    </header>
    <DataTable
      columns={unitColumns}
      data={report.units}
      keyExtractor={(item) => String(item.courseSectionSurveyId)}
      showIndex={false}
      pageSize={rankedPageSize}
      exportConfig={{
        title: 'BÁO CÁO XẾP HẠNG KẾT QUẢ THEO KHOA/VIỆN',
        fileName: 'xep-hang-khoa-vien-giang-vien',
        subtitle: report.surveyName,
        breadcrumb: ['Thống kê & Báo cáo', 'Giảng viên', title],
        summaryNotes: [
          'Tỷ lệ phiếu hợp lệ = Số phiếu hợp lệ ÷ Số phiếu đã thu.',
          'Số phiếu không hợp lệ là phiếu bị bộ lọc nhiễu loại, không tham gia tính điểm.',
          'Khoa chưa đủ điều kiện tính điểm không có điểm trung bình.',
        ],
      }}
      emptyMessage="Chưa có dữ liệu tổng hợp."
    />
  </section>
);

// ------------------------------------------------------------- Ý kiến mở

const CommentsWorkspace: React.FC<{ report: UnitSurveyReport }> = ({ report }) => {
  const [search, setSearch] = useState('');
  const keyword = foldVietnamese(search);
  const rows = report.comments.filter((comment) =>
    foldVietnamese([comment.comment, comment.unitName].join(' '))
      .includes(keyword));

  const columns: Column<UnitReportComment>[] = [
    {
      key: 'unit',
      header: 'Khoa / Viện',
      width: '22%',
      filterValue: (item) => item.unitName,
      render: (item) => <span className="catalog-cell-primary">{item.unitName}</span>,
    },
    {
      key: 'comment',
      header: 'Ý kiến khác',
      width: '58%',
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
        searchPlaceholder="Tìm nội dung ý kiến, khoa/viện..."
        exportConfig={{
          title: 'TỔNG HỢP Ý KIẾN MỞ KHẢO SÁT GIẢNG VIÊN',
          fileName: 'y-kien-mo-giang-vien',
          subtitle: report.surveyName,
          breadcrumb: ['Thống kê & Báo cáo', 'Giảng viên', 'Phân tích ý kiến mở'],
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
