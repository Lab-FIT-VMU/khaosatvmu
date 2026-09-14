import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarRange,
  CircleAlert,
  GraduationCap,
  Info,
  Layers,
  LoaderCircle,
  Minus,
  RefreshCw,
  ShieldCheck,
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
import { DataTable, type Column } from './DataTable';
import { surveyApi } from '../services/surveyApi';
import type {
  FacultyComparisonItem,
  SurveyComparisonResponse,
} from '../services/surveyApi';
import type { AcademicYear, SemesterSurvey } from '../types';

type ComparisonScope = 'year' | 'semester' | 'survey';

interface SurveyComparisonViewProps {
  academicYears: AcademicYear[];
  allSemesterSurveys: SemesterSurvey[];
}

export const SurveyComparisonView: React.FC<SurveyComparisonViewProps> = ({
  academicYears,
  allSemesterSurveys,
}) => {
  const [scope, setScope] = useState<ComparisonScope>('year');
  const [baselineId, setBaselineId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SurveyComparisonResponse | null>(null);

  // Danh sách Năm học phẳng
  const yearOptions = useMemo(() => {
    return academicYears.map((y) => ({
      id: String(y.academicYearId),
      name: y.academicYearName,
    }));
  }, [academicYears]);

  // Danh sách Học kỳ phẳng kèm tên năm học
  const semesterOptions = useMemo(() => {
    return academicYears.flatMap((y) =>
      y.semesters.map((s) => ({
        id: String(s.semesterId),
        name: `${s.semesterName} · ${y.academicYearName}`,
        yearName: y.academicYearName,
      }))
    );
  }, [academicYears]);

  // Danh sách Đợt khảo sát gom nhóm theo [Năm học · Học kỳ]
  const surveyGroups = useMemo(() => {
    const groups = new Map<string, SemesterSurvey[]>();
    for (const s of allSemesterSurveys) {
      const yearLabel = s.academicYearName || 'Năm học';
      const semLabel = s.semesterName || 'Học kỳ';
      const groupKey = `${yearLabel} · ${semLabel}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(s);
    }
    return Array.from(groups.entries());
  }, [allSemesterSurveys]);

  // Khi chuyển cấp độ so sánh, tự động đặt mốc mặc định
  useEffect(() => {
    if (scope === 'year') {
      if (yearOptions.length >= 2) {
        setBaselineId(yearOptions[0].id);
        setTargetId(yearOptions[yearOptions.length - 1].id);
      } else if (yearOptions.length === 1) {
        setBaselineId(yearOptions[0].id);
        setTargetId(yearOptions[0].id);
      } else {
        setBaselineId('');
        setTargetId('');
      }
    } else if (scope === 'semester') {
      if (semesterOptions.length >= 2) {
        setBaselineId(semesterOptions[0].id);
        setTargetId(semesterOptions[semesterOptions.length - 1].id);
      } else if (semesterOptions.length === 1) {
        setBaselineId(semesterOptions[0].id);
        setTargetId(semesterOptions[0].id);
      } else {
        setBaselineId('');
        setTargetId('');
      }
    } else {
      // survey
      if (allSemesterSurveys.length >= 2) {
        setBaselineId(String(allSemesterSurveys[0].semesterSurveyId));
        setTargetId(String(allSemesterSurveys[allSemesterSurveys.length - 1].semesterSurveyId));
      } else if (allSemesterSurveys.length === 1) {
        setBaselineId(String(allSemesterSurveys[0].semesterSurveyId));
        setTargetId(String(allSemesterSurveys[0].semesterSurveyId));
      } else {
        setBaselineId('');
        setTargetId('');
      }
    }
  }, [scope, yearOptions, semesterOptions, allSemesterSurveys]);

  // Tải dữ liệu so sánh
  const loadComparison = useCallback(async () => {
    const bId = Number(baselineId);
    const tId = Number(targetId);

    if (!bId || !tId) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await surveyApi.compareSurveys({
        scope,
        baselineId: bId,
        targetId: tId,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu so sánh.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [scope, baselineId, targetId]);

  useEffect(() => {
    void loadComparison();
  }, [loadComparison]);

  const handleSwap = () => {
    const temp = baselineId;
    setBaselineId(targetId);
    setTargetId(temp);
  };

  const isSamePeriod = baselineId && targetId && baselineId === targetId;

  const chartData = useMemo(() => {
    if (!data?.periods) return [];
    return data.periods.map((p) => ({
      name: p.surveyName.length > 28 ? `${p.surveyName.slice(0, 26)}…` : p.surveyName,
      fullTitle: p.templateName ? `${p.surveyName} (${p.templateName})` : p.surveyName,
      overallScore: p.overallScore ?? 0,
      completionRate: p.completionRate,
      belowAvgSections: p.belowAverageSectionCount ?? 0,
    }));
  }, [data?.periods]);

  const baselineLabel = data?.periods[0]?.surveyName ?? 'Mốc A';
  const targetLabel = data?.periods[data.periods.length - 1]?.surveyName ?? 'Mốc B';

  // Định nghĩa các cột theo chuẩn DataTable có Sorting & Filtering
  const columns: Column<FacultyComparisonItem>[] = useMemo(() => [
    {
      key: 'facultyName',
      header: 'Khoa / Viện',
      sortValue: (item) => item.facultyName,
      render: (item) => <strong className="text-slate-800">{item.facultyName}</strong>,
    },
    {
      key: 'baselineScore',
      header: `Điểm ${baselineLabel}`,
      width: '140px',
      numeric: true,
      sortValue: (item) => item.baselineScore ?? -999,
      filterValue: (item) => item.baselineScore !== null ? item.baselineScore.toFixed(2) : 'Chưa có',
      render: (item) => (
        <span className="font-semibold text-slate-700">
          {item.baselineScore !== null ? item.baselineScore.toFixed(2) : '—'}
        </span>
      ),
    },
    {
      key: 'targetScore',
      header: `Điểm ${targetLabel}`,
      width: '140px',
      numeric: true,
      sortValue: (item) => item.targetScore ?? -999,
      filterValue: (item) => item.targetScore !== null ? item.targetScore.toFixed(2) : 'Chưa có',
      render: (item) => (
        <span className="font-semibold text-slate-900">
          {item.targetScore !== null ? item.targetScore.toFixed(2) : '—'}
        </span>
      ),
    },
    {
      key: 'deltaScore',
      header: 'Chênh lệch điểm (Δ)',
      width: '150px',
      numeric: true,
      sortValue: (item) => item.deltaScore ?? -999,
      render: (item) => <DeltaBadge delta={item.deltaScore} suffix="đ" />,
    },
    {
      key: 'baselineBelowAverageSections',
      header: `Lớp < ĐTB (${baselineLabel})`,
      width: '150px',
      numeric: true,
      sortValue: (item) => item.baselineBelowAverageSections,
      render: (item) => (
        <span className={item.baselineBelowAverageSections > 0 ? 'text-amber-700 font-medium' : 'text-slate-500'}>
          {item.baselineBelowAverageSections} lớp
        </span>
      ),
    },
    {
      key: 'targetBelowAverageSections',
      header: `Lớp < ĐTB (${targetLabel})`,
      width: '150px',
      numeric: true,
      sortValue: (item) => item.targetBelowAverageSections,
      render: (item) => (
        <span className={item.targetBelowAverageSections > 0 ? 'text-amber-700 font-medium' : 'text-slate-500'}>
          {item.targetBelowAverageSections} lớp
        </span>
      ),
    },
    {
      key: 'deltaBelowAverageSections',
      header: 'Biến động lớp < ĐTB',
      width: '160px',
      numeric: true,
      sortValue: (item) => item.deltaBelowAverageSections,
      render: (item) => <SectionBelowDeltaBadge delta={item.deltaBelowAverageSections} />,
    },
    {
      key: 'trendStatus',
      header: 'Đánh giá chung',
      width: '140px',
      sortValue: (item) => item.trendStatus,
      filterValue: (item) =>
        item.trendStatus === 'Improved'
          ? 'Tiến bộ'
          : item.trendStatus === 'Declined'
            ? 'Cần lưu ý'
            : item.trendStatus === 'Stable'
              ? 'Ổn định'
              : item.trendStatus === 'New'
                ? 'Mới'
                : 'Chưa có',
      quickFilters: [
        { label: 'Tiến bộ (tăng điểm)', match: (v) => v === 'Tiến bộ' },
        { label: 'Cần lưu ý (giảm điểm)', match: (v) => v === 'Cần lưu ý' },
        { label: 'Ổn định', match: (v) => v === 'Ổn định' },
      ],
      render: (item) => <StatusBadge status={item.trendStatus} />,
    },
  ], [baselineLabel, targetLabel]);

  const exportConfig = useMemo(() => {
    if (!data) return undefined;
    return {
      fileName: `so-sanh-khao-sat-${scope}`,
      title: `BÁO CÁO SO SÁNH KẾT QUẢ KHẢO SÁT ${scope === 'year' ? 'GIỮA CÁC NĂM HỌC' : scope === 'semester' ? 'GIỮA CÁC HỌC KỲ' : 'GIỮA CÁC ĐỢT'}`,
      subtitle: `Mốc A: ${data.periods[0]?.surveyName ?? '—'} ──> Mốc B: ${data.periods[data.periods.length - 1]?.surveyName ?? '—'}`,
      subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
      info: {
        'Cấp độ': scope === 'year' ? 'Theo Năm học' : scope === 'semester' ? 'Theo Học kỳ' : 'Theo Đợt',
        'Điểm TB Mốc A': data.overallBaselineScore !== null ? data.overallBaselineScore.toFixed(2) : '—',
        'Điểm TB Mốc B': data.overallTargetScore !== null ? data.overallTargetScore.toFixed(2) : '—',
        'Chênh lệch điểm': data.overallDeltaScore !== null ? `${data.overallDeltaScore > 0 ? '+' : ''}${data.overallDeltaScore.toFixed(2)}` : '—',
        'Số lớp dưới ĐTB Mốc A': data.baselineBelowAverageSectionCount,
        'Số lớp dưới ĐTB Mốc B': data.targetBelowAverageSectionCount,
        'Biến động lớp dưới ĐTB': `${data.belowAverageSectionDelta > 0 ? '+' : ''}${data.belowAverageSectionDelta} lớp`,
        'Số khoa tiến bộ': data.improvedFacultyCount,
        'Số khoa cần lưu ý': data.declinedFacultyCount,
      },
      summaryNotes: [
        'Lớp dưới ĐTB là lớp học phần có điểm đánh giá thấp hơn điểm trung bình chung toàn trường tại mốc khảo sát đó.',
        'Giảm số lượng lớp dưới ĐTB (Δ mang dấu âm -) là tín hiệu cải thiện chất lượng tích cực.',
      ],
      columns: [
        { key: 'facultyName' as const, header: 'Khoa / Viện', width: 28 },
        { key: 'baselineScore' as const, header: `Điểm ${baselineLabel}`, width: 16, type: 'number' as const, align: 'right' as const, format: (v: any) => v !== null ? Number(v).toFixed(2) : '—' },
        { key: 'targetScore' as const, header: `Điểm ${targetLabel}`, width: 16, type: 'number' as const, align: 'right' as const, format: (v: any) => v !== null ? Number(v).toFixed(2) : '—' },
        { key: 'deltaScore' as const, header: 'Chênh lệch điểm (Δ)', width: 16, type: 'number' as const, align: 'right' as const, format: (v: any) => v !== null ? `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}` : '—' },
        { key: 'baselineBelowAverageSections' as const, header: `Lớp < ĐTB (${baselineLabel})`, width: 18, type: 'number' as const, align: 'right' as const },
        { key: 'targetBelowAverageSections' as const, header: `Lớp < ĐTB (${targetLabel})`, width: 18, type: 'number' as const, align: 'right' as const },
        { key: 'deltaBelowAverageSections' as const, header: 'Biến động lớp < ĐTB', width: 18, type: 'number' as const, align: 'right' as const, format: (v: any) => `${v > 0 ? '+' : ''}${v} lớp` },
        { key: 'trendStatus' as const, header: 'Đánh giá chung', width: 20 },
      ],
    };
  }, [data, scope, baselineLabel, targetLabel]);

  return (
    <div className="survey-comparison-view">
      {/* Thanh chọn cấp độ so sánh */}
      <div className="comparison-scope-selector">
        <span className="scope-label">Cấp độ so sánh:</span>
        <div className="scope-tabs" role="radiogroup" aria-label="Cấp độ so sánh">
          <button
            type="button"
            role="radio"
            aria-checked={scope === 'year'}
            className={`scope-tab-btn ${scope === 'year' ? 'is-active' : ''}`}
            onClick={() => setScope('year')}
          >
            <CalendarRange size={15} />
            Theo Năm học
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scope === 'semester'}
            className={`scope-tab-btn ${scope === 'semester' ? 'is-active' : ''}`}
            onClick={() => setScope('semester')}
          >
            <GraduationCap size={15} />
            Theo Học kỳ
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scope === 'survey'}
            className={`scope-tab-btn ${scope === 'survey' ? 'is-active' : ''}`}
            onClick={() => setScope('survey')}
          >
            <Layers size={15} />
            Theo Đợt khảo sát
          </button>
        </div>
      </div>

      {/* Banner tóm tắt */}
      <div className="comparison-guidance-banner">
        <Info size={18} className="guidance-icon" aria-hidden="true" />
        <div className="guidance-text">
          {scope === 'year' && (
            <span>
              <strong>So sánh tổng quan giữa các Năm học:</strong> Hệ thống tự động gộp tất cả các đợt/lớp khảo sát trong từng năm để tính điểm bình quân toàn trường, số lớp dưới ĐTB và mức độ cải thiện của từng Khoa/Viện.
            </span>
          )}
          {scope === 'semester' && (
            <span>
              <strong>So sánh giữa các Học kỳ:</strong> Đối chiếu chất lượng giữa 2 học kỳ (cùng năm hoặc khác năm học) trên quy mô toàn trường và từng Khoa/Viện.
            </span>
          )}
          {scope === 'survey' && (
            <span>
              <strong>So sánh giữa 2 Đợt khảo sát cụ thể:</strong> Đối chiếu kết quả giữa 2 đợt khảo sát đã mở trong hệ thống.
            </span>
          )}
        </div>
      </div>

      {/* Thanh công cụ chọn 2 mốc */}
      <section className="statistics-toolbar survey-comparison-toolbar">
        <label className="form-group">
          <span>
            {scope === 'year'
              ? 'Mốc A (Năm học gốc)'
              : scope === 'semester'
                ? 'Mốc A (Học kỳ gốc)'
                : 'Mốc A (Đợt khảo sát gốc)'}
          </span>
          <select value={baselineId} onChange={(e) => setBaselineId(e.target.value)}>
            <option value="">-- Chọn mốc A --</option>
            {scope === 'year' &&
              yearOptions.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            {scope === 'semester' &&
              semesterOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            {scope === 'survey' &&
              surveyGroups.map(([groupName, surveys]) => (
                <optgroup key={groupName} label={`▼ ${groupName}`}>
                  {surveys.map((s) => (
                    <option key={s.semesterSurveyId} value={String(s.semesterSurveyId)}>
                      {s.surveyName || s.templateName} ({s.sectionSurveyCount} lớp)
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </label>

        <button
          type="button"
          className="btn btn-secondary btn-sm comparison-swap-btn"
          title="Đổi chiều Mốc A ⇄ Mốc B"
          onClick={handleSwap}
          disabled={!baselineId || !targetId}
        >
          <ArrowRightLeft size={16} />
          <span className="swap-text">Đổi chiều</span>
        </button>

        <label className="form-group">
          <span>
            {scope === 'year'
              ? 'Mốc B (Năm học so sánh)'
              : scope === 'semester'
                ? 'Mốc B (Học kỳ so sánh)'
                : 'Mốc B (Đợt khảo sát so sánh)'}
          </span>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">-- Chọn mốc B --</option>
            {scope === 'year' &&
              yearOptions.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            {scope === 'semester' &&
              semesterOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            {scope === 'survey' &&
              surveyGroups.map(([groupName, surveys]) => (
                <optgroup key={groupName} label={`▼ ${groupName}`}>
                  {surveys.map((s) => (
                    <option key={s.semesterSurveyId} value={String(s.semesterSurveyId)}>
                      {s.surveyName || s.templateName} ({s.sectionSurveyCount} lớp)
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </label>

        <div className="statistics-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void loadComparison()}
            disabled={loading || (!baselineId && !targetId)}
          >
            <RefreshCw aria-hidden="true" size={16} />
            Cập nhật
          </button>
        </div>
      </section>

      {/* Cảnh báo khi chọn trùng mốc */}
      {isSamePeriod && (
        <div className="comparison-warning-notice">
          <CircleAlert size={16} />
          <span>
            Bạn đang chọn cùng 1 mốc cho cả A và B (độ chênh lệch Δ = 0).
            Hãy chọn 2 mốc khác nhau để thấy sự thay đổi tăng/giảm chất lượng.
          </span>
        </div>
      )}

      {error && (
        <div className="admin-alert" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="operations-empty" role="status">
          <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          <strong>Đang tổng hợp số liệu so sánh...</strong>
        </div>
      ) : !data || data.periods.length === 0 ? (
        <div className="operations-empty">
          <strong>Vui lòng chọn 2 mốc để xem kết quả so sánh.</strong>
        </div>
      ) : (
        <div className="comparison-content">
          {/* Hàng 5 thẻ KPI so sánh chuyên sâu */}
          <section className="comparison-kpi-row">
            {/* KPI 1: Điểm TB toàn trường */}
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

            {/* KPI 2: Tỷ lệ hoàn thành */}
            <div className="comparison-kpi-card">
              <span className="comparison-kpi-label">Tỷ lệ hoàn thành phiếu</span>
              <div className="comparison-kpi-values">
                <span className="kpi-val">{data.periods[0]?.completionRate.toFixed(1)}%</span>
                <span className="kpi-separator">→</span>
                <span className="kpi-val is-target">{data.periods[data.periods.length - 1]?.completionRate.toFixed(1)}%</span>
              </div>
              <div className="comparison-kpi-badge">
                <DeltaBadge delta={data.completionRateDelta} suffix="%" />
              </div>
            </div>

            {/* KPI 3: Số lớp dưới ĐTB toàn trường */}
            <div className="comparison-kpi-card">
              <span className="comparison-kpi-label">Số lớp dưới ĐTB toàn trường</span>
              <div className="comparison-kpi-values">
                <span className="kpi-val">{data.baselineBelowAverageSectionCount}</span>
                <span className="kpi-separator">→</span>
                <span className="kpi-val is-target">{data.targetBelowAverageSectionCount}</span>
                <span className="text-xs text-slate-400 font-normal">lớp</span>
              </div>
              <div className="comparison-kpi-badge">
                <SectionBelowDeltaBadge delta={data.belowAverageSectionDelta} />
              </div>
            </div>

            {/* KPI 4: Phân hóa Khoa/Viện */}
            <div className="comparison-kpi-card">
              <span className="comparison-kpi-label">Biến động chất lượng Khoa</span>
              <div className="comparison-faculty-split">
                <span className="split-item is-positive" title="Số khoa tăng điểm">
                  <TrendingUp size={16} />
                  <strong>{data.improvedFacultyCount}</strong> tăng
                </span>
                <span className="split-divider">/</span>
                <span className="split-item is-negative" title="Số khoa giảm điểm">
                  <TrendingDown size={16} />
                  <strong>{data.declinedFacultyCount}</strong> giảm
                </span>
              </div>
              <span className="text-xs text-slate-500 mt-1">
                {data.faculties.length - data.improvedFacultyCount - data.declinedFacultyCount} khoa giữ ổn định
              </span>
            </div>

            {/* KPI 5: Độ tin cậy phiếu (Phiếu hợp lệ / lỗi) */}
            <div className="comparison-kpi-card">
              <span className="comparison-kpi-label">Phiếu hợp lệ / Phiếu loại bỏ</span>
              <div className="comparison-kpi-values">
                <span className="kpi-val text-sm">
                  {data.periods[0]?.validResponseCount.toLocaleString('vi-VN')}
                  <span className="text-xs text-slate-400 font-normal"> ({data.baselineInvalidResponseCount} lỗi)</span>
                </span>
                <span className="kpi-separator">→</span>
                <span className="kpi-val is-target text-sm">
                  {data.periods[data.periods.length - 1]?.validResponseCount.toLocaleString('vi-VN')}
                  <span className="text-xs text-slate-400 font-normal"> ({data.targetInvalidResponseCount} lỗi)</span>
                </span>
              </div>
              <div className="comparison-kpi-badge">
                <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                  <ShieldCheck size={14} /> Dữ liệu qua bộ lọc nhiễu
                </span>
              </div>
            </div>
          </section>

          {/* Biểu đồ xu hướng qua thời gian */}
          <section className="dashboard-report-block comparison-chart-block">
            <h3 className="dashboard-report-title">
              Biến động điểm trung bình toàn trường giữa 2 mốc
            </h3>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 32, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tick={{ fontSize: 13, fill: '#334155', fontWeight: 500 }}
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
                          <span style={{ color: '#0284c7', fontWeight: 600 }}>
                            Điểm TB: {Number(item.overallScore).toFixed(2)} / 5.0
                          </span>
                          <span>Tỷ lệ hoàn thành: {item.completionRate.toFixed(1)}%</span>
                          <span>Số lớp dưới ĐTB: {item.belowAvgSections} lớp</span>
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
                    dot={{ r: 7, fill: '#0284c7' }}
                    activeDot={{ r: 9 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Bảng so sánh theo Khoa/Viện dùng DataTable chuẩn với Sort & Filter */}
          <section className="dashboard-report-block comparison-full-block">
            <h3 className="dashboard-report-title" style={{ marginBottom: '12px' }}>
              Biến động điểm & Phân hóa lớp theo Khoa / Viện ({data.faculties.length} đơn vị)
            </h3>
            <DataTable
              columns={columns}
              data={data.faculties}
              keyExtractor={(item) => String(item.facultyId)}
              searchPlaceholder="Tìm kiếm khoa / viện..."
              showIndex={true}
              pageSize={50}
              sortKey="deltaScore"
              sortDirection="desc"
              enableExport={true}
              exportConfig={exportConfig}
              emptyMessage="Không tìm thấy đơn vị nào."
            />
          </section>
        </div>
      )}
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

/** Badge cho biến động số lớp dưới ĐTB: Giảm số lớp dưới ĐTB là TỐT (xanh), tăng là XẤU (đỏ) */
const SectionBelowDeltaBadge: React.FC<{ delta?: number }> = ({ delta = 0 }) => {
  if (delta < 0) {
    return (
      <span className="delta-badge is-positive" title="Giảm số lớp dưới ĐTB (tốt)">
        <TrendingDown size={14} /> {delta} lớp
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="delta-badge is-negative" title="Tăng số lớp dưới ĐTB (cần lưu ý)">
        <TrendingUp size={14} /> +{delta} lớp
      </span>
    );
  }
  return (
    <span className="delta-badge is-neutral">
      <Minus size={12} /> 0 lớp
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
