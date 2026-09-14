import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
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
import { useSemester } from '../context/semesterContext';
import { NoteModalButton } from '../components/NoteModalButton';
import { ExportDropdown } from '../components/ExportDropdown';
import { SurveyComparisonView } from '../components/SurveyComparisonView';
import { ApiError } from '../services/apiClient';
import { surveyApi, surveyErrorMessage } from '../services/surveyApi';
import type {
  DashboardFacultyScore,
  DashboardQuestionScore,
  SemesterSurveyDashboard,
} from '../services/surveyApi';
import type { SemesterSurvey } from '../types';
import '../styles/survey-operations.css';
import '../styles/survey-statistics.css';
import '../styles/survey-dashboard.css';

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

/** Mốc tô màu biểu đồ. Không phải mốc cảnh báo — mốc đó backend tính theo Z-Score. */
const lowScore = 3.2;

/** Thang màu cột biểu đồ, dùng chung ngưỡng với bảng để hai chỗ không nói ngược nhau. */
function barColor(score: number): string {
  if (score < lowScore) return '#d4544a';
  if (score < 3.5) return '#e0904a';
  if (score < 3.8) return '#d8b442';
  return '#3f9b5c';
}

/**
 * Trục điểm luôn để 0–5. Cắt trục cho "dễ nhìn chênh lệch" là cách nhanh nhất
 * biến chênh 0.2 điểm thành một biểu đồ trông như gấp đôi.
 */
const scoreAxis = { domain: [0, 5] as [number, number], ticks: [0, 1, 2, 3, 4, 5] };

const usageNotes = [
  'Khảo sát đo MỨC HÀI LÒNG của sinh viên, không đo trực tiếp chất lượng học thuật. Học phần khó thường bị chấm thấp hơn.',
  'Hệ thống không xuất bảng xếp hạng giảng viên. Chênh lệch dưới 1 độ lệch chuẩn không có ý nghĩa thống kê.',
  'Lớp có tỷ lệ phản hồi thấp thì số liệu không đại diện, phải đọc kèm cột tỷ lệ phản hồi.',
  'Cần kiểm định định kỳ tương quan giữa điểm sinh viên NHẬN và điểm sinh viên CHẤM. Tương quan dương mạnh là dấu hiệu động cơ ngược.',
  'Tỷ lệ phiếu trả lời một đáp án tăng qua các kỳ là tín hiệu sinh viên mất niềm tin — nên theo dõi như một chỉ số chính của hệ thống khảo sát.',
];

export const SurveyDashboardPage: React.FC = () => {
  const { academicYears, activeSemesterId } = useSemester();

  const [semesterId, setSemesterId] = useState<string>(() =>
    activeSemesterId ? String(activeSemesterId) : ''
  );
  useEffect(() => {
    if (activeSemesterId) setSemesterId(String(activeSemesterId));
  }, [activeSemesterId]);

  const parseActiveTabFromHash = (): 'single' | 'comparison' => {
    if (typeof window === 'undefined') return 'single';
    const hash = window.location.hash.toLowerCase();
    if (hash.includes('tab=comparison') || hash.includes('/comparison') || hash.startsWith('#survey-comparison')) {
      return 'comparison';
    }
    return 'single';
  };

  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>([]);
  const [semesterSurveyId, setSemesterSurveyId] = useState<string>('');
  const [allSurveys, setAllSurveys] = useState<SemesterSurvey[]>([]);
  const [activeTab, setActiveTab] = useState<'single' | 'comparison'>(parseActiveTabFromHash);
  const [data, setData] = useState<SemesterSurveyDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const onHashChange = () => {
      setActiveTab(parseActiveTabFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleSelectTab = (tab: 'single' | 'comparison') => {
    setActiveTab(tab);
    if (tab === 'comparison') {
      window.location.hash = '#survey-dashboard?tab=comparison';
    } else {
      window.location.hash = '#survey-dashboard';
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchAllSurveys = async () => {
      const allSemesterEntries = academicYears.flatMap((y) =>
        y.semesters.map((s) => ({
          semesterId: s.semesterId,
          semesterName: s.semesterName,
          academicYearName: y.academicYearName,
        }))
      );
      if (allSemesterEntries.length === 0) return;
      try {
        const results = await Promise.all(
          allSemesterEntries.map(async (entry) => {
            try {
              const list = await surveyApi.semesterSurveys(entry.semesterId);
              return list.map((s) => ({
                ...s,
                semesterName: s.semesterName || entry.semesterName,
                academicYearName: s.academicYearName || entry.academicYearName,
              }));
            } catch {
              return [];
            }
          })
        );
        if (!cancelled) {
          setAllSurveys(results.flat());
        }
      } catch {
        // ignore
      }
    };
    void fetchAllSurveys();
    return () => {
      cancelled = true;
    };
  }, [academicYears]);

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

  const loadData = useCallback(async () => {
    if (!semesterSurveyId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      setData(await surveyApi.semesterSurveyDashboard(Number(semesterSurveyId)));
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

  return (
    <div className="survey-operations-page survey-statistics-page">
      <div className="dashboard-tab-bar" role="tablist" aria-label="Chế độ xem bảng điều khiển">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'single'}
          className={`dashboard-nav-tab ${activeTab === 'single' ? 'is-active' : ''}`}
          onClick={() => handleSelectTab('single')}
        >
          Tổng quan một đợt
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'comparison'}
          className={`dashboard-nav-tab ${activeTab === 'comparison' ? 'is-active' : ''}`}
          onClick={() => handleSelectTab('comparison')}
        >
          So sánh & Xu hướng giữa các đợt
        </button>
      </div>

      {activeTab === 'comparison' ? (
        <SurveyComparisonView
          academicYears={academicYears}
          allSemesterSurveys={allSurveys.length > 0 ? allSurveys : semesterSurveys}
        />
      ) : (
        <>
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

            <label className="form-group">
              <span>Đợt khảo sát</span>
              <select
                value={semesterSurveyId}
                onChange={(event) => setSemesterSurveyId(event.target.value)}
                disabled={semesterSurveys.length === 0}
              >
                {semesterSurveys.length === 0 && <option value="">Chưa có đợt nào</option>}
                {semesterSurveys.map((survey) => (
                  <option key={survey.semesterSurveyId} value={String(survey.semesterSurveyId)}>
                    {survey.templateName} · {survey.sectionSurveyCount} lớp
                  </option>
                ))}
              </select>
            </label>

            <div className="statistics-toolbar-actions">
              {data && (
                <ExportDropdown
                  buttonLabel="Xuất báo cáo"
                  size="sm"
                  options={{
                    fileName: 'tong-quan-dot-khao-sat',
                    metadata: {
                      title: 'BÁO CÁO TỔNG QUAN ĐỢT KHẢO SÁT HỌC PHẦN',
                      subtitle: `${data.templateName} — ${data.semesterName} năm học ${data.academicYearName}`,
                      subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
                      info: {
                        'Bộ câu hỏi': data.templateName,
                        'Học kỳ': `${data.semesterName} · ${data.academicYearName}`,
                        'Số lớp học phần': data.sectionCount,
                        'Tổng số phiếu thu': data.totalResponseCount,
                        'Số phiếu hợp lệ': data.validResponseCount,
                        'Tỷ lệ hoàn thành': `${data.averageCompletionRate.toFixed(1)}%`,
                        'Điểm trung bình toàn trường': data.overallScore !== null ? data.overallScore.toFixed(2) : '—',
                      },
                      summaryNotes: [
                        'Số liệu tính toán từ kết quả các phiếu khảo sát hợp lệ qua bộ lọc.',
                      ],
                    },
                    columns: [
                      { key: 'facultyName', header: 'Khoa / Viện', width: 28 },
                      { key: 'averageScore', header: 'Điểm TB', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
                      { key: 'sectionsBelowThreshold', header: 'Số lớp dưới ngưỡng', width: 18, type: 'number' as const, align: 'right' as const },
                    ],
                    data: data.faculties,
                  }}
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
            </div>
          </section>

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
              <strong>Chọn học kỳ và đợt khảo sát để xem tổng quan.</strong>
            </div>
          ) : data === null ? (
            <div className="operations-empty">
              <strong>Đợt này chưa có số liệu.</strong>
            </div>
          ) : (
            <DashboardReport data={data} />
          )}
        </>
      )}
    </div>
  );
};

const DashboardReport: React.FC<{ data: SemesterSurveyDashboard }> = ({ data }) => (
  <div className="dashboard-report" tabIndex={0} aria-label="Tổng quan đợt khảo sát">
    <section className="statistics-summary">
      <span className="summary-title">
        Tổng quan khảo sát — {data.semesterName} năm học {data.academicYearName}
      </span>
      <span>{data.templateName}</span>
      <NoteModalButton title="Lưu ý khi sử dụng số liệu">
        <ul className="dashboard-notes">
          {usageNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="dashboard-report-note">
          Số lớp và tổng phiếu đếm mọi lượt nộp. Tỷ lệ hoàn thành và điểm chỉ tính trên phiếu
          hợp lệ, hiện có <strong>{data.scoredSectionCount}</strong> lớp đủ điều kiện tính điểm.
        </p>
        <p className="dashboard-report-note">
          Học phần cần rà soát: mọi lớp đều thấp thì nguyên nhân thuộc giáo trình / đề cương,
          không thuộc giảng viên.
        </p>
      </NoteModalButton>
    </section>

    <div className="dashboard-report-grid">
      <MainIndicators data={data} />
      <QuestionChart questions={data.questions} overallScore={data.overallScore} />
    </div>

    <WeakestQuestions rows={data.weakestQuestions} />

    <div className="dashboard-report-grid">
      <CourseReview data={data} />
      <FacultyChart faculties={data.faculties} overallScore={data.overallScore} />
    </div>
  </div>
);

// -------------------------------------------------------- Khối chỉ số chính

const MainIndicators: React.FC<{ data: SemesterSurveyDashboard }> = ({ data }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">Chỉ số chính</h3>
    <dl className="dashboard-kpi-list">
      <div className="dashboard-kpi">
        <dt>Số lớp học phần được khảo sát</dt>
        <dd>{data.sectionCount.toLocaleString('vi-VN')}</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Tổng số phiếu thu được</dt>
        <dd>{data.totalResponseCount.toLocaleString('vi-VN')}</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Số phiếu hợp lệ</dt>
        <dd>{data.validResponseCount.toLocaleString('vi-VN')}</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Tỷ lệ hoàn thành</dt>
        <dd>{data.averageCompletionRate.toFixed(1)}%</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Điểm tổng hợp toàn trường</dt>
        <dd>{data.overallScore === null ? '—' : data.overallScore.toFixed(2)}</dd>
      </div>
    </dl>
  </section>
);

// --------------------------------------------- Biểu đồ điểm từng tiêu chí

interface ChartTooltipItem {
  payload: DashboardQuestionScore;
}

const QuestionTooltip: React.FC<{ active?: boolean; payload?: ChartTooltipItem[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="dashboard-chart-tooltip">
      <strong>C{item.questionOrder}</strong>
      <span>{item.questionText}</span>
      <span style={{ color: barColor(item.averageScore) }}>
        Điểm TB: {item.averageScore.toFixed(2)} / 5.0
      </span>
      <span>
        {item.sectionsBelowThreshold} lớp chấm câu này thấp hơn trung bình của chính câu đó từ 1
        độ lệch chuẩn trở lên
      </span>
    </div>
  );
};

const QuestionChart: React.FC<{
  questions: DashboardQuestionScore[];
  overallScore: number | null;
}> = ({ questions, overallScore }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">
      Điểm trung bình {questions.length} tiêu chí — toàn trường
    </h3>
    {questions.length === 0 ? (
      <p className="dashboard-report-note">Chưa có phiếu hợp lệ nào để dựng biểu đồ.</p>
    ) : (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={questions.map((x) => ({ ...x, label: `C${x.questionOrder}` }))}
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tick={{ fontSize: 11, fill: '#68737d' }}
            interval={0}
          />
          <YAxis
            domain={scoreAxis.domain}
            ticks={scoreAxis.ticks}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tick={{ fontSize: 11, fill: '#68737d' }}
          />
          <Tooltip content={<QuestionTooltip />} cursor={{ fill: 'rgba(7,136,184,0.06)' }} />
          {overallScore !== null && (
            <ReferenceLine
              y={overallScore}
              stroke="#68737d"
              strokeDasharray="4 4"
              label={{
                value: `Toàn trường ${overallScore.toFixed(2)}`,
                position: 'insideTopRight',
                fill: '#68737d',
                fontSize: 11,
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
    )}
  </section>
);

// ------------------------------------------------ Năm tiêu chí yếu nhất

const WeakestQuestions: React.FC<{ rows: DashboardQuestionScore[] }> = ({ rows }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">5 tiêu chí yếu nhất toàn trường</h3>
    {rows.length === 0 ? (
      <p className="dashboard-report-note">Chưa có phiếu hợp lệ nào để xếp hạng tiêu chí.</p>
    ) : (
      <div className="dashboard-table-frame">
        <table className="statistics-table statistics-table--alert">
          <thead>
            <tr>
              <th scope="col">Câu</th>
              <th scope="col">Nội dung</th>
              <th scope="col">Điểm TB</th>
              <th
                scope="col"
                title="Lớp chấm câu này thấp hơn trung bình của chính câu đó từ 1 độ lệch chuẩn trở lên"
              >
                Lớp cảnh báo
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.questionOrder}>
                <th scope="row">C{row.questionOrder}</th>
                <td className="dashboard-question-text">{row.questionText}</td>
                <td className="num">{row.averageScore.toFixed(2)}</td>
                <td className={row.sectionsBelowThreshold > 0 ? 'num is-flagged' : 'num'}>
                  {row.sectionsBelowThreshold}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

// -------------------------------------- Học phần cần rà soát ở cấp học phần

const CourseReview: React.FC<{ data: SemesterSurveyDashboard }> = ({ data }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">Học phần cần rà soát ở cấp học phần</h3>
    <dl className="dashboard-kpi-list dashboard-kpi-list--warning">
      <div className="dashboard-kpi">
        <dt>Số học phần mọi lớp đều dưới ngưỡng</dt>
        <dd>{data.courseIssueCount}</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Số học phần chênh lệch lớn giữa các lớp</dt>
        <dd>{data.lecturerVarianceCount}</dd>
      </div>
    </dl>
  </section>
);

// ------------------------------------------- Biểu đồ điểm theo khoa/viện

interface FacultyTooltipItem {
  payload: DashboardFacultyScore;
}

const FacultyTooltip: React.FC<{ active?: boolean; payload?: FacultyTooltipItem[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="dashboard-chart-tooltip">
      <strong>{item.facultyName}</strong>
      <span style={{ color: barColor(item.averageScore) }}>
        Điểm TB: {item.averageScore.toFixed(2)} / 5.0
      </span>
      <span>{item.sectionCount} lớp có phiếu hợp lệ</span>
    </div>
  );
};

const FacultyChart: React.FC<{
  faculties: DashboardFacultyScore[];
  overallScore: number | null;
}> = ({ faculties, overallScore }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">Điểm tổng hợp theo khoa / viện</h3>
    {faculties.length === 0 ? (
      <p className="dashboard-report-note">Chưa có khoa/viện nào thu được phiếu hợp lệ.</p>
    ) : (
      <ResponsiveContainer width="100%" height={Math.max(220, faculties.length * 34 + 40)}>
        <BarChart
          data={faculties}
          layout="vertical"
          margin={{ top: 8, right: 32, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
          <XAxis
            type="number"
            domain={scoreAxis.domain}
            ticks={scoreAxis.ticks}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tick={{ fontSize: 11, fill: '#68737d' }}
          />
          <YAxis
            type="category"
            dataKey="facultyName"
            width={170}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#40505a' }}
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
    )}
  </section>
);
