import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  Info,
  LoaderCircle,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSemester } from '../context/semesterContext';
import { ExportDropdown } from '../components/ExportDropdown';
import { surveyApi } from '../services/surveyApi';
import type {
  FacultyComparisonItem,
  SurveyComparisonResponse,
} from '../services/surveyApi';
import type { SemesterSurvey } from '../types';
import '../styles/survey-operations.css';
import '../styles/survey-statistics.css';
import '../styles/survey-dashboard.css';

export const SurveyComparisonPage: React.FC = () => {
  const { academicYears, activeSemesterId } = useSemester();

  // Danh sách các học kỳ cho dropdown
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

  // Mốc A (Gốc)
  const [semesterAId, setSemesterAId] = useState<string>(() =>
    activeSemesterId ? String(activeSemesterId) : ''
  );
  const [surveysA, setSurveysA] = useState<SemesterSurvey[]>([]);
  const [surveyAId, setSurveyAId] = useState<string>('');

  // Mốc B (So sánh)
  const [semesterBId, setSemesterBId] = useState<string>(() =>
    activeSemesterId ? String(activeSemesterId) : ''
  );
  const [surveysB, setSurveysB] = useState<SemesterSurvey[]>([]);
  const [surveyBId, setSurveyBId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SurveyComparisonResponse | null>(null);
  const [facultySearch, setFacultySearch] = useState('');

  // Load danh sách đợt khảo sát cho Mốc A
  useEffect(() => {
    let cancelled = false;
    const loadSurveysA = async () => {
      if (!semesterAId) {
        setSurveysA([]);
        setSurveyAId('');
        return;
      }
      try {
        const next = await surveyApi.semesterSurveys(Number(semesterAId));
        if (cancelled) return;
        setSurveysA(next);
        if (next.length > 0) {
          setSurveyAId(String(next[0].semesterSurveyId));
        } else {
          setSurveyAId('');
        }
      } catch {
        if (!cancelled) setSurveysA([]);
      }
    };
    void loadSurveysA();
    return () => {
      cancelled = true;
    };
  }, [semesterAId]);

  // Load danh sách đợt khảo sát cho Mốc B
  useEffect(() => {
    let cancelled = false;
    const loadSurveysB = async () => {
      if (!semesterBId) {
        setSurveysB([]);
        setSurveyBId('');
        return;
      }
      try {
        const next = await surveyApi.semesterSurveys(Number(semesterBId));
        if (cancelled) return;
        setSurveysB(next);
        if (next.length > 0) {
          // Nếu cùng kỳ với A và có nhiều hơn 1 đợt, chọn đợt thứ 2 cho B
          if (semesterAId === semesterBId && next.length > 1) {
            setSurveyBId(String(next[1].semesterSurveyId));
          } else {
            setSurveyBId(String(next[0].semesterSurveyId));
          }
        } else {
          setSurveyBId('');
        }
      } catch {
        if (!cancelled) setSurveysB([]);
      }
    };
    void loadSurveysB();
    return () => {
      cancelled = true;
    };
  }, [semesterBId, semesterAId]);

  // Thực hiện gọi API so sánh khi có mốc A & B
  const handleCompare = useCallback(async () => {
    const aId = Number(surveyAId);
    const bId = Number(surveyBId);

    if (!aId && !bId) {
      setData(null);
      return;
    }

    const ids = aId === bId ? [aId] : [aId, bId].filter((id) => id > 0);

    setLoading(true);
    setError(null);
    try {
      const res = await surveyApi.compareSurveys(ids);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể so sánh kết quả khảo sát.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [surveyAId, surveyBId]);

  useEffect(() => {
    if (surveyAId && surveyBId) {
      void handleCompare();
    }
  }, [surveyAId, surveyBId, handleCompare]);

  const filteredFaculties = useMemo(() => {
    if (!data?.faculties) return [];
    if (!facultySearch.trim()) return data.faculties;
    const q = facultySearch.toLowerCase();
    return data.faculties.filter((f) => f.facultyName.toLowerCase().includes(q));
  }, [data?.faculties, facultySearch]);

  const chartData = useMemo(() => {
    if (!data?.periods) return [];
    return data.periods.map((p) => ({
      name: p.surveyName.length > 25 ? `${p.surveyName.slice(0, 23)}…` : p.surveyName,
      fullTitle: `${p.surveyName} (${p.semesterName} · ${p.academicYearName})`,
      overallScore: p.overallScore ?? 0,
      completionRate: p.completionRate,
    }));
  }, [data?.periods]);

  const isSameSurvey = surveyAId && surveyBId && surveyAId === surveyBId;

  return (
    <div className="survey-operations-page survey-statistics-page survey-comparison-page">
      {/* Tab Navigation giữa Tổng quan và So sánh */}
      <div className="dashboard-tab-bar" role="tablist" aria-label="Chế độ xem bảng điều khiển">
        <a
          href="#survey-dashboard"
          role="tab"
          aria-selected={false}
          className="dashboard-nav-tab"
        >
          Tổng quan một đợt
        </a>
        <a
          href="#survey-comparison"
          role="tab"
          aria-selected={true}
          className="dashboard-nav-tab is-active"
        >
          So sánh & Xu hướng giữa các đợt
        </a>
      </div>

      {/* Toolbar chọn Mốc A & Mốc B chuẩn Production */}
      <section className="statistics-toolbar survey-comparison-toolbar">
        {/* Nhóm chọn Mốc A */}
        <div className="comparison-slot">
          <span className="comparison-slot-title">Mốc A (Gốc)</span>
          <div className="comparison-slot-inputs">
            <label className="form-group">
              <span>Học kỳ</span>
              <select value={semesterAId} onChange={(e) => setSemesterAId(e.target.value)}>
                <option value="">Chọn học kỳ</option>
                {semesterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span>Đợt khảo sát</span>
              <select
                value={surveyAId}
                onChange={(e) => setSurveyAId(e.target.value)}
                disabled={surveysA.length === 0}
              >
                {surveysA.length === 0 && <option value="">Chưa có đợt nào</option>}
                {surveysA.map((s) => (
                  <option key={s.semesterSurveyId} value={String(s.semesterSurveyId)}>
                    {s.surveyName || s.templateName} ({s.sectionSurveyCount} lớp)
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Mũi tên so sánh */}
        <div className="comparison-arrow" aria-hidden="true">
          <ArrowRight size={24} />
        </div>

        {/* Nhóm chọn Mốc B */}
        <div className="comparison-slot">
          <span className="comparison-slot-title">Mốc B (So sánh)</span>
          <div className="comparison-slot-inputs">
            <label className="form-group">
              <span>Học kỳ</span>
              <select value={semesterBId} onChange={(e) => setSemesterBId(e.target.value)}>
                <option value="">Chọn học kỳ</option>
                {semesterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span>Đợt khảo sát</span>
              <select
                value={surveyBId}
                onChange={(e) => setSurveyBId(e.target.value)}
                disabled={surveysB.length === 0}
              >
                {surveysB.length === 0 && <option value="">Chưa có đợt nào</option>}
                {surveysB.map((s) => (
                  <option key={s.semesterSurveyId} value={String(s.semesterSurveyId)}>
                    {s.surveyName || s.templateName} ({s.sectionSurveyCount} lớp)
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Nút hành động */}
        <div className="statistics-toolbar-actions comparison-actions">
          {data && data.faculties.length > 0 && (
            <ExportDropdown
              buttonLabel="Xuất so sánh"
              size="sm"
              options={{
                fileName: 'so-sanh-ket-qua-khao-sat',
                metadata: {
                  title: 'BÁO CÁO SO SÁNH KẾT QUẢ KHẢO SÁT GIỮA CÁC ĐỢT',
                  subtitle: `Mốc A: ${data.periods[0]?.surveyName ?? '—'} ──> Mốc B: ${data.periods[data.periods.length - 1]?.surveyName ?? '—'}`,
                  subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
                  info: {
                    'Điểm TB Mốc A': data.overallBaselineScore !== null ? data.overallBaselineScore.toFixed(2) : '—',
                    'Điểm TB Mốc B': data.overallTargetScore !== null ? data.overallTargetScore.toFixed(2) : '—',
                    'Chênh lệch điểm': data.overallDeltaScore !== null ? `${data.overallDeltaScore > 0 ? '+' : ''}${data.overallDeltaScore.toFixed(2)}` : '—',
                    'Số khoa tiến bộ': data.improvedFacultyCount,
                    'Số khoa cần lưu ý': data.declinedFacultyCount,
                  },
                  summaryNotes: [
                    'Chênh lệch dương (+) biểu thị điểm số tăng trưởng tích cực giữa 2 mốc khảo sát.',
                  ],
                },
                columns: [
                  { key: 'facultyName', header: 'Khoa / Viện', width: 28 },
                  { key: 'baselineScore', header: 'Điểm Mốc A', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => v !== null ? Number(v).toFixed(2) : '—' },
                  { key: 'targetScore', header: 'Điểm Mốc B', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => v !== null ? Number(v).toFixed(2) : '—' },
                  { key: 'deltaScore', header: 'Chênh lệch (Δ)', width: 16, type: 'number' as const, align: 'right' as const, format: (v: any) => v !== null ? `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}` : '—' },
                  { key: 'trendStatus', header: 'Đánh giá xu hướng', width: 20 },
                ],
                data: data.faculties,
              }}
            />
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void handleCompare()}
            disabled={loading || !surveyAId || !surveyBId}
          >
            <RefreshCw aria-hidden="true" size={16} />
            So sánh
          </button>
        </div>
      </section>

      {/* Cảnh báo khi chọn 2 mốc giống hệt nhau */}
      {isSameSurvey && (
        <div className="comparison-hint-banner" role="status">
          <Info size={18} aria-hidden="true" />
          <span>
            Bạn đang chọn cùng một đợt khảo sát cho cả Mốc A và Mốc B. Hãy chọn 2 đợt hoặc 2 học kỳ khác nhau để đối chiếu biến động điểm số và tiến độ.
          </span>
        </div>
      )}

      {error && (
        <div className="admin-alert" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Vùng nội dung cuộn được (Fix lỗi không kéo lên kéo xuống được) */}
      <div className="survey-comparison-body">
        {loading ? (
          <div className="operations-empty" role="status">
            <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
            <strong>Đang so sánh và tổng hợp chỉ số biến động...</strong>
          </div>
        ) : !data || data.periods.length === 0 ? (
          <div className="operations-empty">
            <strong>Vui lòng chọn đợt khảo sát cho cả 2 mốc để xem kết quả so sánh.</strong>
          </div>
        ) : (
          <div className="comparison-content">
            {/* 4 Thẻ KPI biến động */}
            <section className="comparison-kpi-row">
              <div className="comparison-kpi-card">
                <span className="comparison-kpi-label">Điểm trung bình toàn trường</span>
                <div className="comparison-kpi-values">
                  <span className="kpi-val">{data.overallBaselineScore?.toFixed(2) ?? '—'}</span>
                  <span className="kpi-separator">→</span>
                  <span className="kpi-val is-target">{data.overallTargetScore?.toFixed(2) ?? '—'}</span>
                </div>
                <div className="comparison-kpi-badge">
                  <DeltaBadge delta={data.overallDeltaScore} suffix="đ" />
                </div>
              </div>

              <div className="comparison-kpi-card">
                <span className="comparison-kpi-label">Tỷ lệ hoàn thành</span>
                <div className="comparison-kpi-values">
                  <span className="kpi-val">{data.periods[0]?.completionRate.toFixed(1)}%</span>
                  <span className="kpi-separator">→</span>
                  <span className="kpi-val is-target">{data.periods[data.periods.length - 1]?.completionRate.toFixed(1)}%</span>
                </div>
                <div className="comparison-kpi-badge">
                  <DeltaBadge delta={data.completionRateDelta} suffix="%" />
                </div>
              </div>

              <div className="comparison-kpi-card">
                <span className="comparison-kpi-label">Khoa / Viện cải thiện</span>
                <div className="comparison-kpi-count is-positive">
                  <TrendingUp size={22} />
                  <strong>{data.improvedFacultyCount}</strong>
                  <span>đơn vị tăng điểm</span>
                </div>
              </div>

              <div className="comparison-kpi-card">
                <span className="comparison-kpi-label">Khoa / Viện cần lưu ý</span>
                <div className="comparison-kpi-count is-negative">
                  <TrendingDown size={22} />
                  <strong>{data.declinedFacultyCount}</strong>
                  <span>đơn vị giảm điểm</span>
                </div>
              </div>
            </section>

            {/* Biểu đồ xu hướng */}
            <section className="dashboard-report-block comparison-chart-block">
              <h3 className="dashboard-report-title">
                Xu hướng điểm trung bình qua các mốc khảo sát
              </h3>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 12, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tick={{ fontSize: 12, fill: '#475569' }}
                    />
                    <YAxis
                      domain={[3, 5]}
                      ticks={[3, 3.5, 4, 4.5, 5]}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tick={{ fontSize: 12, fill: '#475569' }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const item = payload[0].payload;
                        return (
                          <div className="dashboard-chart-tooltip">
                            <strong>{item.fullTitle}</strong>
                            <span style={{ color: '#0284c7' }}>
                              Điểm TB: {Number(item.overallScore).toFixed(2)} / 5.0
                            </span>
                            <span>Tỷ lệ hoàn thành: {item.completionRate.toFixed(1)}%</span>
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      name="Điểm TB toàn trường"
                      dataKey="overallScore"
                      stroke="#0284c7"
                      strokeWidth={3}
                      dot={{ r: 6, fill: '#0284c7' }}
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Hai bảng đối chiếu: Khoa/Viện & Tiêu chí */}
            <div className="dashboard-report-grid comparison-grid">
              {/* Bảng so sánh theo Khoa/Viện */}
              <section className="dashboard-report-block">
                <div className="block-header-flex">
                  <h3 className="dashboard-report-title">
                    Biến động điểm theo Khoa / Viện ({data.faculties.length})
                  </h3>
                  <input
                    type="search"
                    className="form-control form-control-sm comparison-search"
                    placeholder="Lọc khoa..."
                    value={facultySearch}
                    onChange={(e) => setFacultySearch(e.target.value)}
                  />
                </div>
                <div className="dashboard-table-frame">
                  <table className="statistics-table">
                    <thead>
                      <tr>
                        <th scope="col">Khoa / Viện</th>
                        <th scope="col" className="text-right">Mốc A</th>
                        <th scope="col" className="text-right">Mốc B</th>
                        <th scope="col" className="text-right">Chênh lệch (Δ)</th>
                        <th scope="col" className="text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFaculties.map((fac) => (
                        <tr key={fac.facultyId}>
                          <td>
                            <strong>{fac.facultyName}</strong>
                          </td>
                          <td className="num">{fac.baselineScore?.toFixed(2) ?? '—'}</td>
                          <td className="num">{fac.targetScore?.toFixed(2) ?? '—'}</td>
                          <td className="num">
                            <DeltaBadge delta={fac.deltaScore} />
                          </td>
                          <td className="text-center">
                            <StatusBadge status={fac.trendStatus} />
                          </td>
                        </tr>
                      ))}
                      {filteredFaculties.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-3 text-muted">
                            Không tìm thấy đơn vị phù hợp.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Bảng so sánh theo Tiêu chí / Câu hỏi */}
              <section className="dashboard-report-block">
                <h3 className="dashboard-report-title">
                  Biến động điểm theo Tiêu chí ({data.questions.length} câu)
                </h3>
                <div className="dashboard-table-frame">
                  <table className="statistics-table">
                    <thead>
                      <tr>
                        <th scope="col">Câu</th>
                        <th scope="col">Nội dung tiêu chí</th>
                        <th scope="col" className="text-right">Mốc A</th>
                        <th scope="col" className="text-right">Mốc B</th>
                        <th scope="col" className="text-right">Chênh lệch (Δ)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.questions.map((q) => (
                        <tr key={q.questionOrder}>
                          <td>
                            <strong>C{q.questionOrder}</strong>
                          </td>
                          <td className="dashboard-question-text">{q.questionText}</td>
                          <td className="num">{q.baselineScore?.toFixed(2) ?? '—'}</td>
                          <td className="num">{q.targetScore?.toFixed(2) ?? '—'}</td>
                          <td className="num">
                            <DeltaBadge delta={q.deltaScore} />
                          </td>
                        </tr>
                      ))}
                      {data.questions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-3 text-muted">
                            Hai đợt khảo sát dùng bộ câu hỏi khác nhau hoặc chưa có điểm chi tiết.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------- Helper Badges

const DeltaBadge: React.FC<{ delta?: number | null; suffix?: string }> = ({ delta, suffix = '' }) => {
  if (delta === null || delta === undefined) {
    return <span className="delta-badge is-neutral"><Minus size={12} /> —</span>;
  }
  if (delta > 0) {
    return (
      <span className="delta-badge is-positive">
        <ArrowUpRight size={14} /> +{delta.toFixed(2)}{suffix}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="delta-badge is-negative">
        <ArrowDownRight size={14} /> {delta.toFixed(2)}{suffix}
      </span>
    );
  }
  return (
    <span className="delta-badge is-neutral">
      <Minus size={12} /> 0.00{suffix}
    </span>
  );
};

const StatusBadge: React.FC<{ status: FacultyComparisonItem['trendStatus'] }> = ({ status }) => {
  switch (status) {
    case 'Improved':
      return <span className="status-pill is-improved">▲ Tiến bộ</span>;
    case 'Declined':
      return <span className="status-pill is-declined">▼ Cần lưu ý</span>;
    case 'Stable':
      return <span className="status-pill is-stable">━ Ổn định</span>;
    case 'New':
      return <span className="status-pill is-new">Mới</span>;
    default:
      return <span className="status-pill is-nodata">—</span>;
  }
};
