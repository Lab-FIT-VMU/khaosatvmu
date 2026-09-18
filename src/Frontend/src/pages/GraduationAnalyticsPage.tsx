import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, History, LoaderCircle, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { ExportDropdown } from '../components/ExportDropdown';
import { GraduationEChart } from '../components/graduation/GraduationEChart';
import {
  GraduationImportDialog,
  type GraduationImportTarget,
} from '../components/graduation/GraduationImportDialog';
import { graduationAnalyticsApi } from '../services/graduationAnalyticsApi';
import type {
  GraduationExploreModeV3,
  GraduationExploreResultV3,
  GraduationImportCommitResultV3,
  GraduationManagedPeriod,
  GraduationRevisionV3,
} from '../types/graduationAnalytics';
import '../styles/graduation-analytics.css';

type View = 'explore' | 'manage';

const currentAcademicYearStart = () => {
  const now = new Date();
  return now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
};

const formatNumber = (value: number) => value.toLocaleString('vi-VN');
const formatRate = (value: number) => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
const periodLabel = (period: GraduationManagedPeriod) =>
  `${period.academicYearLabel} · Đợt ${period.roundNumber} · ${String(period.reviewMonth).padStart(2, '0')}/${period.reviewYear}`;

export function GraduationAnalyticsPage() {
  const [view, setView] = useState<View>('explore');
  const [periods, setPeriods] = useState<GraduationManagedPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cutoffPeriodId, setCutoffPeriodId] = useState<number | null>(null);
  const [mode, setMode] = useState<GraduationExploreModeV3>('period');
  const [cohort, setCohort] = useState('');
  const [facultyKey, setFacultyKey] = useState('');
  const [programKey, setProgramKey] = useState('');
  const [explore, setExplore] = useState<GraduationExploreResultV3 | null>(null);
  const [facets, setFacets] = useState<GraduationExploreResultV3['facets'] | null>(null);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [academicYearStart, setAcademicYearStart] = useState(currentAcademicYearStart());
  const [importTarget, setImportTarget] = useState<GraduationImportTarget | null>(null);
  const [historyPeriodId, setHistoryPeriodId] = useState<number | null>(null);
  const [revisions, setRevisions] = useState<GraduationRevisionV3[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadPeriods = useCallback(async (preferredPeriodId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const next = await graduationAnalyticsApi.managedPeriods();
      setPeriods(next);
      const latest = [...next].sort((a, b) =>
        b.academicYearStart - a.academicYearStart || b.roundNumber - a.roundNumber)[0];
      setCutoffPeriodId((current) => preferredPeriodId
        ?? (current && next.some((period) => period.periodId === current) ? current : latest?.periodId ?? null));
      if (latest && !next.some((period) => period.academicYearStart === academicYearStart)) {
        setAcademicYearStart(latest.academicYearStart);
      }
    } catch {
      setError('Không tải được dữ liệu thống kê tốt nghiệp.');
    } finally {
      setLoading(false);
    }
  }, [academicYearStart]);

  useEffect(() => { void loadPeriods(); }, [loadPeriods]);

  useEffect(() => {
    if (!cutoffPeriodId) {
      setExplore(null);
      return;
    }
    let cancelled = false;
    setExploreLoading(true);
    setExploreError(null);
    const effectiveMode = mode === 'cohortCumulative' && !cohort ? 'period' : mode;
    graduationAnalyticsApi.exploreV3({
      mode: effectiveMode,
      cutoffPeriodId,
      cohort: effectiveMode === 'cohortCumulative' ? cohort : cohort || null,
      facultyKey: facultyKey || null,
      programKey: programKey || null,
    }).then((result) => {
      if (cancelled) return;
      setFacets(result.facets);
      setExplore(mode === 'cohortCumulative' && !cohort ? null : result);
    }).catch(() => {
      if (!cancelled) setExploreError('Không tải được số liệu với phạm vi đang chọn.');
    }).finally(() => {
      if (!cancelled) setExploreLoading(false);
    });
    return () => { cancelled = true; };
  }, [cohort, cutoffPeriodId, facultyKey, mode, programKey]);

  const academicYears = useMemo(() => {
    const values = new Set(periods.map((period) => period.academicYearStart));
    values.add(currentAcademicYearStart());
    return [...values].sort((a, b) => b - a);
  }, [periods]);
  const managedPeriods = useMemo(() => periods
    .filter((period) => period.academicYearStart === academicYearStart)
    .sort((a, b) => a.roundNumber - b.roundNumber), [academicYearStart, periods]);
  const managedByRound = useMemo(() => new Map(managedPeriods.map((period) =>
    [period.roundNumber, period])), [managedPeriods]);
  const rounds = useMemo(() => Array.from(
    { length: Math.max(5, ...managedPeriods.map((period) => period.roundNumber), 0) },
    (_, index) => index + 1), [managedPeriods]);
  const availablePrograms = useMemo(() => facets?.programs.filter((program) =>
    !facultyKey || program.parentValue === facultyKey) ?? [], [facets?.programs, facultyKey]);
  const timelineData = useMemo(() => (explore?.timeline ?? []).map((point) => ({
    name: point.periodLabel,
    graduated: mode === 'cohortCumulative' ? point.cumulativeGraduated : point.graduated,
    onTime: mode === 'cohortCumulative' ? point.cumulativeOnTime : point.onTime,
    workStudy: mode === 'cohortCumulative' ? point.cumulativeWorkStudy : point.workStudy,
  })), [explore?.timeline, mode]);

  const resetFilters = () => {
    setFacultyKey('');
    setProgramKey('');
    if (mode === 'period') setCohort('');
  };

  const handleCommitted = async (result: GraduationImportCommitResultV3) => {
    await loadPeriods(result.period.periodId);
    setCutoffPeriodId(result.period.periodId);
    setAcademicYearStart(result.period.academicYearStart);
    toast.success(result.unchanged
      ? 'Nội dung không thay đổi, hệ thống giữ nguyên revision hiện tại.'
      : `Đã lưu Đợt ${result.period.roundNumber} với ${formatNumber(result.period.studentCount)} sinh viên.`);
    if (result.revision.skippedRowCount > 0) {
      toast.warning(`Đã bỏ ${result.revision.skippedRowCount} dòng không xác định được khóa.`);
    }
  };

  const toggleHistory = async (periodId: number) => {
    if (historyPeriodId === periodId) {
      setHistoryPeriodId(null);
      setRevisions([]);
      return;
    }
    setHistoryPeriodId(periodId);
    setHistoryLoading(true);
    try {
      setRevisions(await graduationAnalyticsApi.revisions(periodId));
    } catch {
      toast.error('Không tải được lịch sử import.');
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading) return <div className="graduation-page"><div className="graduation-state"><LoaderCircle className="spin" /> Đang tải module...</div></div>;

  return <div className="graduation-page">
    <header className="graduation-page__header">
      <div><span>THỐNG KÊ KẾT QUẢ TỐT NGHIỆP</span><h1>Tốt nghiệp theo khóa và từng đợt</h1></div>
      <button type="button" className="btn btn-secondary" onClick={() => void loadPeriods()}><RefreshCw size={16} /> Làm mới</button>
    </header>
    {error && <div className="graduation-alert" role="alert">{error}</div>}

    <nav className="graduation-view-switch" aria-label="Màn hình thống kê tốt nghiệp">
      <button type="button" className={view === 'explore' ? 'is-selected' : ''} onClick={() => setView('explore')}>Khám phá chi tiết</button>
      <button type="button" className={view === 'manage' ? 'is-selected' : ''} onClick={() => setView('manage')}>Quản lý đợt import</button>
    </nav>

    {view === 'explore' && <section className="graduation-tab-panel">
      {periods.length === 0 ? <div className="graduation-empty"><FileSpreadsheet size={42} /><h2>Chưa có dữ liệu v3</h2><p>Chuyển sang Quản lý đợt import để tải danh sách sinh viên tốt nghiệp đầu tiên.</p><button className="btn btn-primary" type="button" onClick={() => setView('manage')}>Quản lý đợt</button></div> : <>
        <div className="graduation-v3-controls">
          <label>Phạm vi<select value={mode} onChange={(event) => { const next = event.target.value as GraduationExploreModeV3; setMode(next); setFacultyKey(''); setProgramKey(''); if (next === 'period') setCohort(''); }}><option value="period">Riêng một đợt</option><option value="cohortCumulative">Tích lũy một khóa qua các đợt</option></select></label>
          <label>Mốc dữ liệu<select value={cutoffPeriodId ?? ''} onChange={(event) => { setCutoffPeriodId(Number(event.target.value)); setFacultyKey(''); setProgramKey(''); setCohort(''); }}>{periods.map((period) => <option key={period.periodId} value={period.periodId}>{periodLabel(period)}</option>)}</select></label>
          <label>Khóa<select value={cohort} onChange={(event) => setCohort(event.target.value)}><option value="">{mode === 'cohortCumulative' ? 'Chọn khóa bắt buộc' : 'Tất cả khóa'}</option>{facets?.cohorts.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Khoa<select value={facultyKey} onChange={(event) => { setFacultyKey(event.target.value); setProgramKey(''); }}><option value="">Tất cả khoa</option>{facets?.faculties.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Chuyên ngành<select value={programKey} onChange={(event) => setProgramKey(event.target.value)}><option value="">Tất cả chuyên ngành</option>{availablePrograms.map((item) => <option key={`${item.parentValue}-${item.value}`} value={item.value}>{item.label}</option>)}</select></label>
          <button type="button" className="btn btn-secondary" onClick={resetFilters}>Đặt lại</button>
        </div>
        {mode === 'cohortCumulative' && !cohort && <div className="graduation-warning"><AlertTriangle size={17} /><div><strong>Hãy chọn một khóa để xem tích lũy.</strong><span>Hệ thống không cộng lẫn nhiều khóa trong chế độ này.</span></div></div>}
        {exploreLoading && <div className="graduation-overview-status"><LoaderCircle className="spin" /> Đang tính số liệu...</div>}
        {exploreError && <div className="graduation-alert" role="alert">{exploreError}</div>}
        {explore && <>
          <div className="graduation-scope-note"><strong>{explore.scope.mode === 'cohortCumulative' ? `Tích lũy ${explore.scope.cohort}` : 'Riêng đợt được chọn'}</strong><span>{explore.scope.startPeriodLabel}{explore.scope.startPeriodId !== explore.scope.cutoffPeriodId ? ` → ${explore.scope.cutoffPeriodLabel}` : ''} · {explore.scope.includedPeriodCount} đợt</span></div>
          <div className="graduation-kpis graduation-kpis--three">{explore.kpis.map((kpi) => <div key={kpi.id}><span>{kpi.label}</span><strong>{formatNumber(kpi.count)}</strong><small>{formatRate(kpi.rate)}</small></div>)}</div>
          <article className="graduation-v3-card"><header><div><span>XẾP LOẠI TỐT NGHIỆP</span><h2>Cơ cấu trong cùng phạm vi</h2></div></header><div className="graduation-rank-grid">{explore.ranks.map((rank) => <div key={rank.rank}><span>{rank.label}</span><strong>{formatNumber(rank.count)}</strong><small>{formatRate(rank.rate)}</small></div>)}</div></article>
          <article className="graduation-v3-card"><header><div><span>DIỄN BIẾN THEO ĐỢT</span><h2>{mode === 'cohortCumulative' ? `Số tích lũy của ${cohort}` : 'Số lượng trong đợt'}</h2></div></header><div className="graduation-v3-chart"><GraduationEChart type="line" data={timelineData} series={[{ key: 'graduated', label: 'Đã tốt nghiệp' }, { key: 'onTime', label: 'Đúng hạn' }, { key: 'workStudy', label: 'Hệ VLVH' }]} unit="count" showLabels /></div></article>
          <article className="graduation-v3-card graduation-v3-table"><header><div><span>BẢNG SỐ LƯỢNG TỔNG HỢP</span><h2>Theo khoa, chuyên ngành và khóa</h2></div>{explore.breakdown.length > 0 && <ExportDropdown buttonLabel="Xuất số liệu" size="sm" options={{ fileName: `thong-ke-tot-nghiep-${cohort || 'theo-dot'}`, metadata: { title: 'THỐNG KÊ KẾT QUẢ TỐT NGHIỆP', subtitle: explore.scope.cutoffPeriodLabel }, columns: [{ key: 'facultyName', header: 'Khoa', width: 24 }, { key: 'programName', header: 'Chuyên ngành', width: 28 }, { key: 'cohortCode', header: 'Khóa', width: 10 }, { key: 'graduated', header: 'Đã tốt nghiệp', type: 'number' as const, width: 14 }, { key: 'onTime', header: 'Đúng hạn', type: 'number' as const, width: 12 }, { key: 'workStudy', header: 'VLVH', type: 'number' as const, width: 10 }, { key: 'excellent', header: 'Xuất sắc', type: 'number' as const, width: 10 }, { key: 'veryGood', header: 'Giỏi', type: 'number' as const, width: 10 }, { key: 'good', header: 'Khá', type: 'number' as const, width: 10 }, { key: 'average', header: 'Trung bình', type: 'number' as const, width: 12 }], data: explore.breakdown }} />}</header><div><table><thead><tr><th>Khoa</th><th>Chuyên ngành</th><th>Khóa</th><th>Đã TN</th><th>Đúng hạn</th><th>VLVH</th><th>Xuất sắc</th><th>Giỏi</th><th>Khá</th><th>Trung bình</th></tr></thead><tbody>{explore.breakdown.map((row) => <tr key={`${row.facultyKey}-${row.programKey}-${row.cohortCode}`}><td>{row.facultyName}</td><td>{row.programName}</td><td>{row.cohortCode}</td><td>{row.graduated}</td><td>{row.onTime}</td><td>{row.workStudy}</td><td>{row.excellent}</td><td>{row.veryGood}</td><td>{row.good}</td><td>{row.average}</td></tr>)}</tbody></table></div></article>
        </>}
      </>}
    </section>}

    {view === 'manage' && <section className="graduation-tab-panel">
      <header className="graduation-tab-heading"><div><span>QUẢN LÝ DỮ LIỆU</span><h2>Danh sách file theo năm học và đợt</h2><p>Có thể import lại để thay revision active; lịch sử cũ vẫn được giữ.</p></div></header>
      <div className="graduation-year-picker"><label>Năm học<select value={academicYearStart} onChange={(event) => { setAcademicYearStart(Number(event.target.value)); setHistoryPeriodId(null); }}>{academicYears.map((year) => <option key={year} value={year}>{year}–{year + 1}</option>)}</select></label></div>
      <div className="graduation-period-manager"><table><thead><tr><th>Đợt</th><th>Tháng/năm</th><th>File active</th><th>Số SV</th><th>Revision</th><th>Dòng bỏ</th><th>Thao tác</th></tr></thead><tbody>{rounds.map((round) => { const period = managedByRound.get(round); return <tr key={round}><td><strong>Đợt {round}</strong></td><td>{period ? `${String(period.reviewMonth).padStart(2, '0')}/${period.reviewYear}` : '—'}</td><td title={period?.originalFileName}>{period?.originalFileName ?? 'Chưa có file'}</td><td>{period ? formatNumber(period.studentCount) : '—'}</td><td>{period ? `v${period.activeRevisionNumber}` : '—'}</td><td className={period?.skippedRowCount ? 'has-warning' : ''}>{period ? period.skippedRowCount : '—'}</td><td><div className="graduation-row-actions"><button type="button" className="btn btn-primary btn-sm" onClick={() => setImportTarget({ academicYearStart, roundNumber: round, period })}><Upload size={14} /> {period ? 'Import lại' : 'Chọn file'}</button>{period && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void toggleHistory(period.periodId)}><History size={14} /> Lịch sử</button>}</div></td></tr>; })}</tbody></table></div>
      {historyPeriodId && <div className="graduation-history"><h3>Lịch sử revision</h3>{historyLoading ? <div className="graduation-state"><LoaderCircle className="spin" /> Đang tải...</div> : <table><thead><tr><th>Phiên bản</th><th>File</th><th>Thời gian</th><th>Người import</th><th>Số SV</th><th>Dòng bỏ</th><th>Lý do thay thế</th></tr></thead><tbody>{revisions.map((revision) => <tr key={revision.revisionId}><td>v{revision.revisionNumber}</td><td>{revision.originalFileName}</td><td>{new Date(revision.importedAtUtc).toLocaleString('vi-VN')}</td><td>{revision.importedByName}</td><td>{formatNumber(revision.importedRowCount)}</td><td>{revision.skippedRowCount}</td><td>{revision.replaceReason ?? 'Import lần đầu'}</td></tr>)}</tbody></table>}</div>}
    </section>}

    <GraduationImportDialog isOpen={Boolean(importTarget)} target={importTarget} onClose={() => setImportTarget(null)} onCommitted={handleCommitted} />
  </div>;
}
