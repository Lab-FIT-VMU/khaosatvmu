import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AreaChart as AreaChartIcon,
  BarChart3,
  CalendarRange,
  ChartBarStacked,
  ChartColumn,
  ChartColumnStacked,
  ChartNoAxesCombined,
  CircleAlert,
  Donut,
  Eye,
  FileSpreadsheet,
  History,
  LineChart as LineChartIcon,
  LoaderCircle,
  PieChart,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { GraduationEChart } from '../components/graduation/GraduationEChart';
import { GraduationSummaryTable } from '../components/graduation/GraduationSummaryTable';
import { GraduationSavedPreviewDialog } from '../components/graduation/GraduationSavedPreviewDialog';
import { GraduationDeletePeriodDialog } from '../components/graduation/GraduationDeletePeriodDialog';
import {
  GraduationFilterMultiSelect,
  type GraduationFilterOption,
} from '../components/graduation/GraduationFilterMultiSelect';
import {
  GraduationImportDialog,
  type GraduationImportTarget,
} from '../components/graduation/GraduationImportDialog';
import { graduationAnalyticsApi } from '../services/graduationAnalyticsApi';
import type {
  GraduationChartType,
  GraduationExploreModeV3,
  GraduationExploreResultV3,
  GraduationImportCommitResultV3,
  GraduationManagedPeriod,
  GraduationRevisionV3,
} from '../types/graduationAnalytics';
import '../styles/graduation-analytics.css';

type View = 'explore' | 'manage';
type ExploreChartMetric = 'graduated' | 'onTime' | 'workStudy' | 'excellent' | 'veryGood' | 'good' | 'average';
type ExploreChartDimension = 'period' | 'faculty' | 'program' | 'cohort';
type ExploreChartSeries = Exclude<ExploreChartDimension, 'period'> | '';
type ExploreChartSort = 'name' | 'value-asc' | 'value-desc';
const PROGRAM_SELECTION_SEPARATOR = '\u001f';
const programSelectionValue = (facultyKey: string | null, programKey: string) =>
  `${facultyKey ?? ''}${PROGRAM_SELECTION_SEPARATOR}${programKey}`;
type ResolvedChartConfig = {
  metric: ExploreChartMetric;
  groupBy: ExploreChartDimension;
  seriesBy: ExploreChartSeries;
  mode: GraduationExploreModeV3;
};
type ExploreRequestState = {
  data: GraduationExploreResultV3 | null;
  facets: GraduationExploreResultV3['facets'] | null;
  resolvedChart: ResolvedChartConfig | null;
  loading: boolean;
  error: string | null;
};
type ExploreRequestAction =
  | { type: 'start' }
  | { type: 'success'; data: GraduationExploreResultV3; chart: ResolvedChartConfig }
  | { type: 'failure'; message: string }
  | { type: 'reset' };

const initialExploreRequestState: ExploreRequestState = {
  data: null,
  facets: null,
  resolvedChart: null,
  loading: false,
  error: null,
};

const exploreRequestReducer = (
  state: ExploreRequestState,
  action: ExploreRequestAction,
): ExploreRequestState => {
  if (action.type === 'start') return { ...state, loading: true, error: null };
  if (action.type === 'success') {
    return {
      data: action.data,
      facets: action.data.facets,
      resolvedChart: action.chart,
      loading: false,
      error: null,
    };
  }
  if (action.type === 'failure') return { ...state, loading: false, error: action.message };
  return initialExploreRequestState;
};

const recommendedChartGroup = (
  mode: GraduationExploreModeV3,
  cohort: string,
  facultyKey: string,
  programKey: string,
): ExploreChartDimension => {
  if (mode === 'cohortCumulative') return 'period';
  if (!cohort) return 'cohort';
  if (!facultyKey) return 'faculty';
  if (!programKey) return 'program';
  return 'cohort';
};

const chartOptions: Array<{ id: GraduationChartType; label: string; icon: typeof BarChart3 }> = [
  { id: 'bar', label: 'Thanh ngang', icon: BarChart3 },
  { id: 'column', label: 'Cột', icon: ChartColumn },
  { id: 'combo', label: 'Cột + đường', icon: ChartNoAxesCombined },
  { id: 'stacked-bar', label: 'Thanh chồng', icon: ChartBarStacked },
  { id: 'stacked-column', label: 'Cột chồng', icon: ChartColumnStacked },
  { id: 'line', label: 'Đường', icon: LineChartIcon },
  { id: 'area', label: 'Miền', icon: AreaChartIcon },
  { id: 'pie', label: 'Tròn', icon: PieChart },
  { id: 'donut', label: 'Donut', icon: Donut },
];

const chartMetrics: Array<{ id: ExploreChartMetric; label: string }> = [
  { id: 'graduated', label: 'Đã tốt nghiệp' },
  { id: 'onTime', label: 'Tốt nghiệp đúng hạn' },
  { id: 'workStudy', label: 'Hệ VLVH' },
  { id: 'excellent', label: 'Xuất sắc' },
  { id: 'veryGood', label: 'Giỏi' },
  { id: 'good', label: 'Khá' },
  { id: 'average', label: 'Trung bình' },
];

const chartDimensions: Array<{ id: ExploreChartDimension; label: string }> = [
  { id: 'period', label: 'Đợt tốt nghiệp' },
  { id: 'faculty', label: 'Khoa' },
  { id: 'program', label: 'Chuyên ngành' },
  { id: 'cohort', label: 'Khóa' },
];

const chartSeriesDimensions: Array<{ id: Exclude<ExploreChartDimension, 'period'>; label: string }> = [
  { id: 'faculty', label: 'Khoa' },
  { id: 'program', label: 'Chuyên ngành' },
  { id: 'cohort', label: 'Khóa' },
];

const currentAcademicYearStart = () => {
  const now = new Date();
  return now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
};

const formatNumber = (value: number) => value.toLocaleString('vi-VN');
const formatRate = (value: number) => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
const periodOptionLabel = (period: GraduationManagedPeriod) =>
  `Đợt ${period.roundNumber} · ${String(period.reviewMonth).padStart(2, '0')}/${period.reviewYear}`;

const compatibleChartPoints = (
  result: GraduationExploreResultV3,
  metric: ExploreChartMetric,
  groupBy: ExploreChartDimension,
  seriesBy: ExploreChartSeries,
  mode: GraduationExploreModeV3,
) => {
  if (result.chartPoints?.length) return result.chartPoints;
  if (groupBy === 'period') {
    if (seriesBy) return [];
    return result.timeline.map((point) => {
      const values: Record<ExploreChartMetric, number | undefined> = {
        graduated: mode === 'cohortCumulative' ? point.cumulativeGraduated : point.graduated,
        onTime: mode === 'cohortCumulative' ? point.cumulativeOnTime : point.onTime,
        workStudy: mode === 'cohortCumulative' ? point.cumulativeWorkStudy : point.workStudy,
        excellent: mode === 'cohortCumulative' ? point.cumulativeExcellent : point.excellent,
        veryGood: mode === 'cohortCumulative' ? point.cumulativeVeryGood : point.veryGood,
        good: mode === 'cohortCumulative' ? point.cumulativeGood : point.good,
        average: mode === 'cohortCumulative' ? point.cumulativeAverage : point.average,
      };
      return {
        groupKey: String(point.periodId),
        groupLabel: point.periodLabel,
        seriesKey: null,
        seriesLabel: null,
        value: values[metric] ?? 0,
      };
    });
  }

  const dimension = (row: GraduationExploreResultV3['breakdown'][number], id: Exclude<ExploreChartDimension, 'period'>) => {
    if (id === 'faculty') return { key: row.facultyKey, label: row.facultyName };
    if (id === 'program') return { key: `${row.facultyKey}|${row.programKey}`, label: row.programName };
    return { key: row.cohortCode, label: row.cohortCode };
  };
  const points = new Map<string, GraduationExploreResultV3['chartPoints'][number]>();
  result.breakdown.forEach((row) => {
    const group = dimension(row, groupBy);
    const series = seriesBy ? dimension(row, seriesBy) : null;
    const mapKey = `${group.key}\u001f${series?.key ?? ''}`;
    const current = points.get(mapKey);
    points.set(mapKey, {
      groupKey: group.key,
      groupLabel: group.label,
      seriesKey: series?.key ?? null,
      seriesLabel: series?.label ?? null,
      value: (current?.value ?? 0) + row[metric],
    });
  });
  return [...points.values()];
};

const timelineMetricValues = (
  point: GraduationExploreResultV3['timeline'][number],
  metric: ExploreChartMetric,
) => {
  const values: Record<ExploreChartMetric, { period: number; cumulative: number }> = {
    graduated: { period: point.graduated, cumulative: point.cumulativeGraduated },
    onTime: { period: point.onTime, cumulative: point.cumulativeOnTime },
    workStudy: { period: point.workStudy, cumulative: point.cumulativeWorkStudy },
    excellent: { period: point.excellent, cumulative: point.cumulativeExcellent },
    veryGood: { period: point.veryGood, cumulative: point.cumulativeVeryGood },
    good: { period: point.good, cumulative: point.cumulativeGood },
    average: { period: point.average, cumulative: point.cumulativeAverage },
  };
  return values[metric];
};

export function GraduationAnalyticsPage() {
  const [view, setView] = useState<View>('manage');
  const [periods, setPeriods] = useState<GraduationManagedPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startPeriodId, setStartPeriodId] = useState<number | null>(null);
  const [cutoffPeriodId, setCutoffPeriodId] = useState<number | null>(null);
  const [mode, setMode] = useState<GraduationExploreModeV3>('period');
  const [chartMetric, setChartMetric] = useState<ExploreChartMetric>('graduated');
  const [chartGroupBy, setChartGroupBy] = useState<ExploreChartDimension>('cohort');
  const [chartSeriesBy, setChartSeriesBy] = useState<ExploreChartSeries>('');
  const [chartSort, setChartSort] = useState<ExploreChartSort>('name');
  const [chartTopInput, setChartTopInput] = useState('');
  const [chartType, setChartType] = useState<GraduationChartType>('bar');
  const [showChartLabels, setShowChartLabels] = useState(true);
  const [selectedCohorts, setSelectedCohorts] = useState<string[]>([]);
  const [selectedFacultyKeys, setSelectedFacultyKeys] = useState<string[]>([]);
  const [selectedProgramKeys, setSelectedProgramKeys] = useState<string[]>([]);
  const [exploreRequest, dispatchExploreRequest] = useReducer(
    exploreRequestReducer,
    initialExploreRequestState,
  );
  const explore = exploreRequest.data;
  const facets = exploreRequest.facets;
  const exploreLoading = exploreRequest.loading;
  const exploreError = exploreRequest.error;
  const [academicYearStart, setAcademicYearStart] = useState(currentAcademicYearStart());
  const [importTarget, setImportTarget] = useState<GraduationImportTarget | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState<GraduationManagedPeriod | null>(null);
  const [deletePeriod, setDeletePeriod] = useState<GraduationManagedPeriod | null>(null);
  const [historyPeriodId, setHistoryPeriodId] = useState<number | null>(null);
  const [revisions, setRevisions] = useState<GraduationRevisionV3[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [visibleRoundsByYear, setVisibleRoundsByYear] = useState<Record<number, number>>({});
  const chartHelpRef = useRef<HTMLDetailsElement>(null);

  const loadPeriods = useCallback(async (preferredPeriodId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const next = await graduationAnalyticsApi.managedPeriods();
      setPeriods(next);
      const earliest = [...next].sort((a, b) =>
        a.academicYearStart - b.academicYearStart || a.roundNumber - b.roundNumber)[0];
      const latest = [...next].sort((a, b) =>
        b.academicYearStart - a.academicYearStart || b.roundNumber - a.roundNumber)[0];
      setStartPeriodId((current) => current && next.some((period) => period.periodId === current)
        ? current
        : earliest?.periodId ?? null);
      setCutoffPeriodId((current) => preferredPeriodId
        ?? (current && next.some((period) => period.periodId === current) ? current : latest?.periodId ?? null));
    } catch {
      setError('Không tải được dữ liệu thống kê tốt nghiệp.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPeriods(); }, [loadPeriods]);

  useEffect(() => {
    const closeHelpWhenClickingOutside = (event: PointerEvent) => {
      const help = chartHelpRef.current;
      if (help?.open && event.target instanceof Node && !help.contains(event.target)) {
        help.open = false;
      }
    };
    document.addEventListener('pointerdown', closeHelpWhenClickingOutside);
    return () => document.removeEventListener('pointerdown', closeHelpWhenClickingOutside);
  }, []);

  useEffect(() => {
    if (!cutoffPeriodId || (mode === 'cohortCumulative' && !startPeriodId)) {
      dispatchExploreRequest({ type: 'reset' });
      return;
    }
    let cancelled = false;
    dispatchExploreRequest({ type: 'start' });
    const requestedChart: ResolvedChartConfig = {
      metric: chartMetric,
      groupBy: chartGroupBy,
      seriesBy: chartSeriesBy,
      mode,
    };
    graduationAnalyticsApi.exploreV3({
      mode,
      startPeriodId: mode === 'cohortCumulative' ? startPeriodId : null,
      cutoffPeriodId,
      cohorts: selectedCohorts,
      facultyKeys: selectedFacultyKeys,
      programKeys: selectedProgramKeys,
      metricId: chartMetric,
      groupBy: chartGroupBy,
      seriesBy: chartSeriesBy || null,
    }).then((result) => {
      if (cancelled) return;
      dispatchExploreRequest({ type: 'success', data: result, chart: requestedChart });
    }).catch(() => {
      if (!cancelled) {
        dispatchExploreRequest({
          type: 'failure',
          message: 'Không tải được số liệu với phạm vi đang chọn.',
        });
      }
    });
    return () => { cancelled = true; };
  }, [chartGroupBy, chartMetric, chartSeriesBy, cutoffPeriodId, mode, selectedCohorts, selectedFacultyKeys, selectedProgramKeys, startPeriodId]);

  const academicYears = useMemo(() => {
    const current = currentAcademicYearStart();
    return Array.from({ length: 21 }, (_, index) => current + 10 - index);
  }, []);
  const chronologicalPeriods = useMemo(() => [...periods].sort((a, b) =>
    a.academicYearStart - b.academicYearStart || a.roundNumber - b.roundNumber), [periods]);
  const periodsByAcademicYear = useMemo(() => {
    const groups = new Map<string, GraduationManagedPeriod[]>();
    chronologicalPeriods.forEach((period) => {
      const group = groups.get(period.academicYearLabel);
      if (group) group.push(period);
      else groups.set(period.academicYearLabel, [period]);
    });
    return [...groups.entries()];
  }, [chronologicalPeriods]);
  const managedPeriods = useMemo(() => periods
    .filter((period) => period.academicYearStart === academicYearStart)
    .sort((a, b) => a.roundNumber - b.roundNumber), [academicYearStart, periods]);
  const managedByRound = useMemo(() => new Map(managedPeriods.map((period) =>
    [period.roundNumber, period])), [managedPeriods]);
  const highestImportedRound = useMemo(() => Math.max(
    0,
    ...managedPeriods.map((period) => period.roundNumber),
  ), [managedPeriods]);
  const visibleRoundCount = Math.max(1, highestImportedRound, visibleRoundsByYear[academicYearStart] ?? 0);
  const rounds = useMemo(() => Array.from(
    { length: visibleRoundCount },
    (_, index) => index + 1), [visibleRoundCount]);
  const managedStudentCount = useMemo(() => managedPeriods.reduce(
    (total, period) => total + period.studentCount,
    0,
  ), [managedPeriods]);
  const facultyOptions = useMemo<GraduationFilterOption[]>(() =>
    facets?.faculties.map((item) => ({ value: item.value, label: item.label })) ?? [],
  [facets?.faculties]);
  const facultyLabelByKey = useMemo(() => new Map(
    facets?.faculties.map((item) => [item.value, item.label]) ?? [],
  ), [facets?.faculties]);
  const availablePrograms = useMemo(() => facets?.programs.filter((program) =>
    selectedFacultyKeys.length === 0
    || Boolean(program.parentValue && selectedFacultyKeys.includes(program.parentValue))) ?? [],
  [facets?.programs, selectedFacultyKeys]);
  const programOptions = useMemo<GraduationFilterOption[]>(() => availablePrograms.map((item) => ({
    value: programSelectionValue(item.parentValue, item.value),
    label: selectedFacultyKeys.length === 1
      ? item.label
      : `${item.label} · ${facultyLabelByKey.get(item.parentValue ?? '') ?? 'Chưa xác định khoa'}`,
  })), [availablePrograms, facultyLabelByKey, selectedFacultyKeys.length]);
  const singleSelectedCohort = selectedCohorts.length === 1 ? selectedCohorts[0] : '';
  const singleSelectedFaculty = selectedFacultyKeys.length === 1 ? selectedFacultyKeys[0] : '';
  const singleSelectedProgram = selectedProgramKeys.length === 1 ? selectedProgramKeys[0] : '';

  useEffect(() => {
    if (!facets) return;
    const available = new Set(facets.cohorts);
    setSelectedCohorts((current) => {
      const next = current.filter((item) => available.has(item));
      return next.length === current.length ? current : next;
    });
  }, [facets]);

  useEffect(() => {
    if (!facets) return;
    const available = new Set(facets.faculties.map((item) => item.value));
    setSelectedFacultyKeys((current) => {
      const next = current.filter((item) => available.has(item));
      return next.length === current.length ? current : next;
    });
  }, [facets]);

  useEffect(() => {
    const available = new Set(programOptions.map((item) => item.value));
    setSelectedProgramKeys((current) => {
      const next = current.filter((item) => available.has(item));
      return next.length === current.length ? current : next;
    });
  }, [programOptions]);

  const fixedChartDimensions = new Set<ExploreChartDimension>([
    ...(mode === 'period' ? ['period' as const] : []),
    ...(singleSelectedFaculty ? ['faculty' as const] : []),
    ...(singleSelectedProgram ? ['program' as const] : []),
    ...(singleSelectedCohort ? ['cohort' as const] : []),
  ]);
  const meaningfulChartGroups = chartDimensions
    .map((item) => item.id)
    .filter((dimension) => !fixedChartDimensions.has(dimension));
  const allChartDimensionsFixed = meaningfulChartGroups.length === 0;
  const availableChartGroups = new Set<ExploreChartDimension>(
    meaningfulChartGroups.length > 0 ? meaningfulChartGroups : ['cohort'],
  );
  const isChartSeriesAvailable = (dimension: Exclude<ExploreChartDimension, 'period'>) =>
    dimension !== chartGroupBy
    && !fixedChartDimensions.has(dimension)
    && !(chartGroupBy === 'program' && dimension === 'faculty');
  const displayedChartMetric = exploreRequest.resolvedChart?.metric ?? chartMetric;
  const displayedChartGroup = exploreRequest.resolvedChart?.groupBy ?? chartGroupBy;
  const displayedChartSeries = exploreRequest.resolvedChart?.seriesBy ?? chartSeriesBy;
  const displayedChartMode = exploreRequest.resolvedChart?.mode ?? mode;
  const displayedCohorts = explore?.scope.cohorts ?? selectedCohorts;
  const selectedChartMetric = chartMetrics.find((item) => item.id === displayedChartMetric) ?? chartMetrics[0];
  const selectedChartDimension = chartDimensions.find((item) => item.id === displayedChartGroup) ?? chartDimensions[0];
  const isRequestedCumulativeTimeline = mode === 'cohortCumulative' && chartGroupBy === 'period';
  const isDisplayedCumulativeTimeline = displayedChartMode === 'cohortCumulative' && displayedChartGroup === 'period';
  const isDisplayedCumulativeCombo = isDisplayedCumulativeTimeline && !displayedChartSeries;
  const chartTopIsValid = chartTopInput === '' || (/^\d+$/.test(chartTopInput) && Number(chartTopInput) >= 1 && Number(chartTopInput) <= 100);
  const chartTop = chartTopIsValid && chartTopInput ? Number(chartTopInput) : 0;
  const chartModel = useMemo(() => {
    if (explore && isDisplayedCumulativeCombo) {
      return {
        data: explore.timeline.map((point) => {
          const values = timelineMetricValues(point, displayedChartMetric);
          return {
            name: point.periodLabel,
            periodValue: values.period,
            cumulativeValue: values.cumulative,
            total: values.cumulative,
          };
        }),
        series: [
          { key: 'periodValue', label: 'Riêng đợt', chartType: 'bar' as const },
          { key: 'cumulativeValue', label: 'Tổng tích lũy', chartType: 'line' as const },
        ],
      };
    }
    const points = explore
      ? compatibleChartPoints(
        explore,
        displayedChartMetric,
        displayedChartGroup,
        displayedChartSeries,
        displayedChartMode,
      )
      : [];
    const seriesOptions = [...new Map(points
      .filter((point) => point.seriesKey && point.seriesLabel)
      .map((point) => [point.seriesKey!, point.seriesLabel!])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'vi'));
    const seriesKeyById = new Map(seriesOptions.map(([id], index) => [id, `series_${index}`]));
    const series = displayedChartSeries
      ? seriesOptions.map(([id, label]) => ({ key: seriesKeyById.get(id)!, label }))
      : [{ key: 'value', label: selectedChartMetric.label }];
    const groups = new Map<string, { name: string; total: number; values: Map<string, number> }>();
    points.forEach((point) => {
      const group = groups.get(point.groupKey) ?? {
        name: point.groupLabel,
        total: 0,
        values: new Map<string, number>(),
      };
      const valueKey = displayedChartSeries && point.seriesKey
        ? seriesKeyById.get(point.seriesKey) ?? 'value'
        : 'value';
      group.values.set(valueKey, (group.values.get(valueKey) ?? 0) + point.value);
      group.total += point.value;
      groups.set(point.groupKey, group);
    });
    const data = [...groups.values()].map((group) => {
      const row: Record<string, string | number | null> = { name: group.name, total: group.total };
      series.forEach((item) => { row[item.key] = group.values.get(item.key) ?? 0; });
      return row;
    });
    if (!isDisplayedCumulativeTimeline) {
      data.sort((a, b) => {
        if (chartSort === 'name') return String(a.name).localeCompare(String(b.name), 'vi');
        const difference = Number(a.total) - Number(b.total);
        return chartSort === 'value-asc' ? difference : -difference;
      });
    }
    return {
      data: !isDisplayedCumulativeTimeline && chartTop > 0 ? data.slice(0, chartTop) : data,
      series,
    };
  }, [chartSort, chartTop, displayedChartGroup, displayedChartMetric, displayedChartMode, displayedChartSeries, explore, isDisplayedCumulativeCombo, isDisplayedCumulativeTimeline, selectedChartMetric.label]);
  const availableChartTypes = useMemo(() => {
    if (isDisplayedCumulativeCombo) return ['combo' as GraduationChartType];
    if (isDisplayedCumulativeTimeline) return ['line' as GraduationChartType];
    return chartOptions
      .map((item) => item.id)
      .filter((type) => {
        if (type === 'combo') return false;
        if (type === 'pie' || type === 'donut') return !displayedChartSeries && chartModel.data.length <= 12;
        if (type === 'stacked-bar' || type === 'stacked-column') return Boolean(displayedChartSeries);
        return true;
      });
  }, [chartModel.data.length, displayedChartSeries, isDisplayedCumulativeCombo, isDisplayedCumulativeTimeline]);

  useEffect(() => {
    if (!availableChartTypes.includes(chartType)) {
      setChartType(isDisplayedCumulativeCombo ? 'combo' : isDisplayedCumulativeTimeline ? 'line' : 'bar');
    }
  }, [availableChartTypes, chartType, isDisplayedCumulativeCombo, isDisplayedCumulativeTimeline]);

  const handleModeChange = (next: GraduationExploreModeV3) => {
    setMode(next);
    if (next === 'cohortCumulative') {
      const earliestPeriod = chronologicalPeriods[0];
      const latestPeriod = chronologicalPeriods.at(-1);
      if (earliestPeriod) setStartPeriodId(earliestPeriod.periodId);
      if (latestPeriod) setCutoffPeriodId(latestPeriod.periodId);
    }
    setChartGroupBy(recommendedChartGroup(next, singleSelectedCohort, singleSelectedFaculty, singleSelectedProgram));
    setChartSeriesBy(next === 'cohortCumulative' && !singleSelectedCohort ? 'cohort' : '');
  };

  const handleStartPeriodChange = (nextPeriodId: number) => {
    setStartPeriodId(nextPeriodId);
    const nextIndex = chronologicalPeriods.findIndex((period) => period.periodId === nextPeriodId);
    const cutoffIndex = chronologicalPeriods.findIndex((period) => period.periodId === cutoffPeriodId);
    if (cutoffIndex >= 0 && nextIndex > cutoffIndex) setCutoffPeriodId(nextPeriodId);
  };

  const handleCutoffPeriodChange = (nextPeriodId: number) => {
    setCutoffPeriodId(nextPeriodId);
    const startIndex = chronologicalPeriods.findIndex((period) => period.periodId === startPeriodId);
    const nextIndex = chronologicalPeriods.findIndex((period) => period.periodId === nextPeriodId);
    if (startIndex >= 0 && nextIndex < startIndex) setStartPeriodId(nextPeriodId);
  };

  const handleCohortChange = (next: string[]) => {
    setSelectedCohorts(next);
    const fixedCohort = next.length === 1 ? next[0] : '';
    if (fixedCohort && chartGroupBy === 'cohort') {
      setChartGroupBy(recommendedChartGroup(mode, fixedCohort, singleSelectedFaculty, singleSelectedProgram));
    }
    if (fixedCohort && chartSeriesBy === 'cohort') setChartSeriesBy('');
    if (!fixedCohort && mode === 'cohortCumulative' && chartGroupBy === 'period' && !chartSeriesBy) {
      setChartSeriesBy('cohort');
    }
  };

  const handleFacultyChange = (next: string[]) => {
    setSelectedFacultyKeys(next);
    const fixedFaculty = next.length === 1 ? next[0] : '';
    const allowedPrograms = new Set((facets?.programs ?? [])
      .filter((program) => next.length === 0 || Boolean(program.parentValue && next.includes(program.parentValue)))
      .map((program) => programSelectionValue(program.parentValue, program.value)));
    const nextPrograms = selectedProgramKeys.filter((item) => allowedPrograms.has(item));
    setSelectedProgramKeys(nextPrograms);
    const fixedProgram = nextPrograms.length === 1 ? nextPrograms[0] : '';
    if (fixedFaculty && chartGroupBy === 'faculty') {
      setChartGroupBy(recommendedChartGroup(mode, singleSelectedCohort, fixedFaculty, fixedProgram));
    }
    if (fixedFaculty && chartSeriesBy === 'faculty') setChartSeriesBy('');
  };

  const handleProgramChange = (next: string[]) => {
    setSelectedProgramKeys(next);
    const fixedProgram = next.length === 1 ? next[0] : '';
    if (fixedProgram && chartGroupBy === 'program') {
      setChartGroupBy(recommendedChartGroup(mode, singleSelectedCohort, singleSelectedFaculty, fixedProgram));
    }
    if (fixedProgram && chartSeriesBy === 'program') setChartSeriesBy('');
  };

  const resetFilters = () => {
    setSelectedFacultyKeys([]);
    setSelectedProgramKeys([]);
    setSelectedCohorts([]);
    setChartGroupBy(recommendedChartGroup(mode, '', '', ''));
    setChartSeriesBy(mode === 'cohortCumulative' ? 'cohort' : '');
  };

  const handleCommitted = async (result: GraduationImportCommitResultV3) => {
    await loadPeriods(result.period.periodId);
    setCutoffPeriodId(result.period.periodId);
    setAcademicYearStart(result.period.academicYearStart);
    toast.success(result.unchanged
      ? 'Nội dung không thay đổi, hệ thống giữ nguyên lần cập nhật hiện tại.'
      : `Đã lưu Đợt ${result.period.roundNumber} với ${formatNumber(result.period.studentCount)} sinh viên.`);
    if (result.revision.skippedRowCount > 0) {
      toast.warning(`Đã bỏ ${result.revision.skippedRowCount} dòng không xác định được khóa.`);
    }
  };

  const handlePeriodDeleted = async (period: GraduationManagedPeriod) => {
    setVisibleRoundsByYear((current) => ({
      ...current,
      [period.academicYearStart]: Math.max(current[period.academicYearStart] ?? 0, period.roundNumber),
    }));
    if (historyPeriodId === period.periodId) {
      setHistoryPeriodId(null);
      setRevisions([]);
    }
    if (previewPeriod?.periodId === period.periodId) setPreviewPeriod(null);
    await loadPeriods();
    toast.success(`Đã xóa dữ liệu Đợt ${period.roundNumber}. Lịch sử tải lên vẫn được lưu.`);
  };

  const addRound = () => {
    setVisibleRoundsByYear((current) => ({
      ...current,
      [academicYearStart]: visibleRoundCount + 1,
    }));
  };

  const removeLatestEmptyRound = () => {
    setVisibleRoundsByYear((current) => ({
      ...current,
      [academicYearStart]: Math.max(1, highestImportedRound, visibleRoundCount - 1),
    }));
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
      toast.error('Không tải được lịch sử tải lên.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const renderExploreControls = () => <div className={`graduation-v3-controls${mode === 'cohortCumulative' ? ' is-range' : ''}`}>
    <label>Phạm vi<select value={mode} onChange={(event) => handleModeChange(event.target.value as GraduationExploreModeV3)}><option value="period">Riêng một đợt</option><option value="cohortCumulative">Tích lũy qua các đợt</option></select></label>
    {mode === 'cohortCumulative' ? <>
      <label>Từ đợt<select value={startPeriodId ?? ''} onChange={(event) => handleStartPeriodChange(Number(event.target.value))}>{periodsByAcademicYear.map(([academicYearLabel, yearPeriods]) => <optgroup key={academicYearLabel} label={academicYearLabel}>{yearPeriods.map((period) => <option key={period.periodId} value={period.periodId}>{periodOptionLabel(period)}</option>)}</optgroup>)}</select></label>
      <label>Đến đợt<select value={cutoffPeriodId ?? ''} onChange={(event) => handleCutoffPeriodChange(Number(event.target.value))}>{periodsByAcademicYear.map(([academicYearLabel, yearPeriods]) => <optgroup key={academicYearLabel} label={academicYearLabel}>{yearPeriods.map((period) => <option key={period.periodId} value={period.periodId}>{periodOptionLabel(period)}</option>)}</optgroup>)}</select></label>
    </> : <label>Mốc dữ liệu<select value={cutoffPeriodId ?? ''} onChange={(event) => { setCutoffPeriodId(Number(event.target.value)); setSelectedFacultyKeys([]); setSelectedProgramKeys([]); setSelectedCohorts([]); setChartGroupBy(recommendedChartGroup(mode, '', '', '')); setChartSeriesBy(''); }}>{periodsByAcademicYear.map(([academicYearLabel, yearPeriods]) => <optgroup key={academicYearLabel} label={academicYearLabel}>{yearPeriods.map((period) => <option key={period.periodId} value={period.periodId}>{periodOptionLabel(period)}</option>)}</optgroup>)}</select></label>}
    <div className="graduation-filter-field"><span>Khóa</span><GraduationFilterMultiSelect options={(facets?.cohorts ?? []).map((item) => ({ value: item, label: item }))} value={selectedCohorts} onChange={handleCohortChange} allLabel="Tất cả khóa" selectedLabel={(count) => `${count} khóa đã chọn`} searchPlaceholder="Tìm khóa..." searchAriaLabel="Tìm khóa" dialogAriaLabel="Chọn các khóa cần thống kê" emptyMessage="Không tìm thấy khóa phù hợp." /></div>
    <div className="graduation-filter-field"><span>Khoa</span><GraduationFilterMultiSelect options={facultyOptions} value={selectedFacultyKeys} onChange={handleFacultyChange} allLabel="Tất cả khoa" selectedLabel={(count) => `${count} khoa đã chọn`} searchPlaceholder="Tìm khoa..." searchAriaLabel="Tìm khoa" dialogAriaLabel="Chọn các khoa cần thống kê" emptyMessage="Không tìm thấy khoa phù hợp." /></div>
    <div className="graduation-filter-field"><span>Chuyên ngành</span><GraduationFilterMultiSelect options={programOptions} value={selectedProgramKeys} onChange={handleProgramChange} allLabel="Tất cả chuyên ngành" selectedLabel={(count) => `${count} chuyên ngành đã chọn`} searchPlaceholder="Tìm chuyên ngành..." searchAriaLabel="Tìm chuyên ngành" dialogAriaLabel="Chọn các chuyên ngành cần thống kê" emptyMessage="Không tìm thấy chuyên ngành phù hợp." /></div>
    <button type="button" className="btn graduation-filter-reset" onClick={resetFilters}><RotateCcw aria-hidden="true" />Đặt lại</button>
  </div>;

  if (loading) return <div className="graduation-page"><div className="graduation-state"><LoaderCircle className="spin" /> Đang tải module...</div></div>;

  return <div className="graduation-page">
    {error && <div className="graduation-alert" role="alert">{error}</div>}

    <nav className="graduation-view-switch" aria-label="Màn hình thống kê tốt nghiệp">
      <button type="button" className={view === 'manage' ? 'is-selected' : ''} onClick={() => setView('manage')}>Tải lên dữ liệu</button>
      <button type="button" className={view === 'explore' ? 'is-selected' : ''} onClick={() => setView('explore')}>Khám phá chi tiết</button>
    </nav>

    {view === 'explore' && <section className="graduation-tab-panel">
      {periods.length === 0 ? <div className="graduation-empty"><FileSpreadsheet size={42} /><h2>Chưa có dữ liệu</h2><p>Chuyển sang tab Tải lên dữ liệu để tải danh sách sinh viên tốt nghiệp đầu tiên.</p><button className="btn btn-primary" type="button" onClick={() => setView('manage')}>Tải lên dữ liệu</button></div> : <>
        {exploreError && <div className="graduation-alert" role="alert">{exploreError}</div>}
        {!explore && <>{renderExploreControls()}{exploreLoading && <div className="graduation-overview-status"><LoaderCircle className="spin" /> Đang tính số liệu...</div>}</>}
        {explore && <>
          <article className="graduation-result-summary">
            <header>
              <div>
                <span>TỔNG QUAN KẾT QUẢ</span>
                <h2>Kết quả tốt nghiệp và cơ cấu xếp loại</h2>
              </div>
              <p>{displayedCohorts.length === 0 ? 'Tất cả khóa' : displayedCohorts.length === 1 ? `Khóa ${displayedCohorts[0]}` : `${displayedCohorts.length} khóa đã chọn`}</p>
            </header>
            <section className="graduation-result-summary__kpis" aria-label="Các chỉ số tốt nghiệp chính">
              {explore.kpis.map((kpi) => <div key={kpi.id} data-kpi={kpi.id}>
                <span>{kpi.label}</span>
                <strong>{formatNumber(kpi.count)}</strong>
                <small>{formatRate(kpi.rate)} tổng số sinh viên</small>
              </div>)}
            </section>
            <section className="graduation-result-summary__ranks" aria-labelledby="graduation-rank-heading">
              <div className="graduation-result-summary__section-heading">
                <h3 id="graduation-rank-heading">Xếp loại tốt nghiệp</h3>
                <span>Tỷ trọng trên tổng số sinh viên</span>
              </div>
              <div className="graduation-result-summary__distribution" role="img" aria-label="Tỷ trọng các mức xếp loại tốt nghiệp">
                {explore.ranks.map((rank) => <span key={rank.rank} style={{ width: `${rank.rate}%` }} title={`${rank.label}: ${formatRate(rank.rate)}`} />)}
              </div>
              <div className="graduation-result-summary__rank-grid">
                {explore.ranks.map((rank) => <div key={rank.rank}>
                  <span><i aria-hidden="true" />{rank.label}</span>
                  <strong>{formatNumber(rank.count)}</strong>
                  <small>{formatRate(rank.rate)}</small>
                </div>)}
              </div>
            </section>
          </article>
          {renderExploreControls()}
          <div className="graduation-scope-note"><strong>{explore.scope.mode === 'cohortCumulative' ? (displayedCohorts.length > 0 ? `Tích lũy ${displayedCohorts.join(', ')}` : 'Tích lũy tất cả khóa') : 'Riêng đợt được chọn'}</strong><span>{explore.scope.startPeriodLabel}{explore.scope.startPeriodId !== explore.scope.cutoffPeriodId ? ` → ${explore.scope.cutoffPeriodLabel}` : ''} · {explore.scope.includedPeriodCount} đợt</span></div>
          <div className="graduation-workspace graduation-explore-chart-workspace">
            <aside className="graduation-builder">
              <div className="graduation-builder__heading">
                <h2>Cấu hình biểu đồ</h2>
                <details ref={chartHelpRef} className="graduation-builder__help">
                  <summary title="Hướng dẫn sử dụng biểu đồ" aria-label="Mở hướng dẫn sử dụng biểu đồ"><CircleAlert aria-hidden="true" /></summary>
                  <div className="graduation-builder__help-panel">
                    <strong>Cách cấu hình biểu đồ</strong>
                    <ul>
                      <li>Bộ lọc phía trên giới hạn tập sinh viên được thống kê.</li>
                      <li>Trong phạm vi tích lũy, <b>Từ đợt</b> và <b>Đến đợt</b> xác định khoảng tính; số tích lũy bắt đầu lại từ đợt đầu khoảng.</li>
                      <li><b>Tiêu chí</b> là số liệu cần xem.</li>
                      <li><b>So sánh theo</b> tạo các nhóm trên biểu đồ.</li>
                      <li><b>Phân chuỗi</b> tách mỗi nhóm theo một chiều khác.</li>
                      <li>Để xem tổng quan tích lũy, chọn <b>Đợt tốt nghiệp</b> và phân chuỗi theo <b>Khóa</b>.</li>
                      <li>Biểu đồ chồng cần phân chuỗi; biểu đồ tròn chỉ dùng khi không phân chuỗi và có tối đa 12 nhóm.</li>
                      <li>Trong phạm vi tích lũy, đường thể hiện tổng tích lũy; cột (khi không phân chuỗi) thể hiện riêng từng đợt.</li>
                    </ul>
                  </div>
                </details>
              </div>
              <label>Tiêu chí<select value={chartMetric} onChange={(event) => setChartMetric(event.target.value as ExploreChartMetric)}>{chartMetrics.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label>So sánh theo<select value={chartGroupBy} onChange={(event) => { const next = event.target.value as ExploreChartDimension; setChartGroupBy(next); if (chartSeriesBy === next || (next === 'program' && chartSeriesBy === 'faculty')) setChartSeriesBy(''); }}>{chartDimensions.map((item) => <option key={item.id} value={item.id} disabled={!availableChartGroups.has(item.id)}>{item.label}</option>)}</select></label>
              <label>Phân chuỗi<select value={chartSeriesBy} onChange={(event) => setChartSeriesBy(event.target.value as ExploreChartSeries)}><option value="">Không phân chuỗi</option>{chartSeriesDimensions.map((item) => <option key={item.id} value={item.id} disabled={!isChartSeriesAvailable(item.id)}>{item.label}</option>)}</select></label>
              {allChartDimensionsFixed && <p className="graduation-builder__error">Tất cả chiều so sánh đã bị cố định. Hãy bỏ bớt bộ lọc để biểu đồ có nhiều nhóm.</p>}
              <div className="graduation-builder__advanced">
                <label className={isRequestedCumulativeTimeline ? 'is-disabled' : ''}>Sắp xếp<select disabled={isRequestedCumulativeTimeline} value={chartSort} onChange={(event) => setChartSort(event.target.value as ExploreChartSort)} title={isRequestedCumulativeTimeline ? 'Dữ liệu tích lũy luôn được sắp theo thời gian' : undefined}><option value="name">Tên A–Z</option><option value="value-asc">Giá trị tăng dần</option><option value="value-desc">Giá trị giảm dần</option></select></label>
                <label className={isRequestedCumulativeTimeline ? 'is-disabled' : ''}>Top<input disabled={isRequestedCumulativeTimeline} type="number" min="1" max="100" inputMode="numeric" value={chartTopInput} onChange={(event) => setChartTopInput(event.target.value)} placeholder={isRequestedCumulativeTimeline ? 'Không áp dụng' : 'Tất cả'} aria-invalid={!isRequestedCumulativeTimeline && !chartTopIsValid} title={isRequestedCumulativeTimeline ? 'Không giới hạn mốc thời gian trong biểu đồ tích lũy' : undefined} /></label>
              </div>
              {!isRequestedCumulativeTimeline && !chartTopIsValid && <p className="graduation-builder__error">Top phải là số nguyên từ 1 đến 100.</p>}
              <fieldset><legend>Loại biểu đồ</legend><div className="graduation-chart-types">{chartOptions.map((item) => { const Icon = item.icon; const enabled = availableChartTypes.includes(item.id); return <button key={item.id} type="button" disabled={!enabled} className={chartType === item.id ? 'is-selected' : ''} onClick={() => setChartType(item.id)} aria-pressed={chartType === item.id}><Icon aria-hidden="true" /><span>{item.label}</span></button>; })}</div></fieldset>
              <label className="graduation-builder__check"><input type="checkbox" checked={showChartLabels} onChange={(event) => setShowChartLabels(event.target.checked)} /> Hiển thị nhãn giá trị</label>
            </aside>
            <article className="graduation-chart-panel">
              <header><div><h2>{selectedChartMetric.label} theo {selectedChartDimension.label.toLocaleLowerCase('vi-VN')}</h2><p>{isDisplayedCumulativeCombo ? 'Cột: riêng từng đợt · Đường: tổng tích lũy' : displayedChartSeries ? `Phân chuỗi theo ${chartSeriesDimensions.find((item) => item.id === displayedChartSeries)?.label.toLocaleLowerCase('vi-VN')}` : 'Không phân chuỗi'}</p></div><span className={exploreLoading ? 'is-updating' : ''}>{exploreLoading ? <><LoaderCircle className="spin" /> Đang cập nhật</> : `${chartModel.data.length} ${isDisplayedCumulativeTimeline ? 'mốc thời gian' : 'nhóm dữ liệu'}`}</span></header>
              {chartModel.data.length > 0 ? <div className="graduation-chart"><GraduationEChart type={chartType} data={chartModel.data} series={chartModel.series} unit="count" showLabels={showChartLabels} /></div> : <div className="graduation-chart-empty">{Array.isArray(explore.chartPoints) ? 'Không có dữ liệu phù hợp với cấu hình hiện tại.' : 'Backend API đang dùng phiên bản cũ. Hãy khởi động lại API để sử dụng cấu hình này.'}</div>}
            </article>
          </div>
          <GraduationSummaryTable
            rows={explore.breakdown}
            fileName={`thong-ke-tot-nghiep-${displayedCohorts.join('-') || 'theo-dot'}`}
            subtitle={explore.scope.startPeriodId === explore.scope.cutoffPeriodId
              ? explore.scope.cutoffPeriodLabel
              : `${explore.scope.startPeriodLabel} → ${explore.scope.cutoffPeriodLabel}`}
          />
        </>}
      </>}
    </section>}

    {view === 'manage' && <section className="graduation-tab-panel">
      <header className="graduation-import-heading">
        <div className="graduation-import-heading__title"><CalendarRange size={20} /><h2>Tải lên đợt tốt nghiệp</h2></div>
        <div className="graduation-import-heading__summary" aria-label="Tóm tắt năm học đang chọn"><span><strong>{managedPeriods.length}</strong> đợt đã tải lên</span><span><strong>{formatNumber(managedStudentCount)}</strong> sinh viên</span></div>
      </header>
      <div className="graduation-import-toolbar">
        <label>Năm học<select value={academicYearStart} onChange={(event) => { setAcademicYearStart(Number(event.target.value)); setHistoryPeriodId(null); setRevisions([]); }}>{academicYears.map((year) => <option key={year} value={year}>{year}–{year + 1}</option>)}</select></label>
      </div>
      <div className="graduation-period-manager">
        <table>
          <thead><tr><th>Đợt</th><th>Trạng thái</th><th>Tháng/năm xét</th><th>File đang dùng</th><th>Người tải lên</th><th>Số sinh viên</th><th>Lần cập nhật</th><th>Dòng bỏ</th><th>Hành động</th></tr></thead>
          <tbody>{rounds.map((round) => {
            const period = managedByRound.get(round);
            const canRemove = !period && round === visibleRoundCount && visibleRoundCount > Math.max(1, highestImportedRound);
            return <tr key={round}>
              <td><strong>Đợt {round}</strong></td>
              <td><span className={`graduation-period-status ${period ? 'is-ready' : 'is-empty'}`}><i />{period ? 'Đã có dữ liệu' : 'Chờ tải lên'}</span></td>
              <td>{period ? `${String(period.reviewMonth).padStart(2, '0')}/${period.reviewYear}` : <span className="graduation-muted">Chọn khi tải lên</span>}</td>
              <td title={period?.originalFileName}>{period ? <><strong className="graduation-file-name">{period.originalFileName}</strong><small>Tải lên vào {new Date(period.importedAtUtc).toLocaleTimeString('vi-VN')} ngày {new Date(period.importedAtUtc).toLocaleDateString('vi-VN')}</small></> : <span className="graduation-muted">Chưa chọn file Excel</span>}</td>
              <td title={period?.importedByName}>{period?.importedByName || '—'}</td>
              <td>{period ? formatNumber(period.studentCount) : '—'}</td>
              <td>{period ? `Lần ${period.activeRevisionNumber}` : '—'}</td>
              <td className={period?.skippedRowCount ? 'has-warning' : ''}>{period ? period.skippedRowCount : '—'}</td>
              <td><div className="graduation-row-actions">
                <button type="button" className="btn btn-secondary graduation-icon-button" onClick={() => setImportTarget({ academicYearStart, roundNumber: round, period })} title={period ? `Tải lên lại Đợt ${round}` : `Tải file lên cho Đợt ${round}`} aria-label={period ? `Tải lên lại Đợt ${round}` : `Tải file lên cho Đợt ${round}`}><Upload aria-hidden="true" /></button>
                {period && <button type="button" className="btn btn-secondary graduation-icon-button" onClick={() => setPreviewPeriod(period)} title={`Xem dữ liệu đã tải lên của Đợt ${round}`} aria-label={`Xem dữ liệu đã tải lên của Đợt ${round}`}><Eye aria-hidden="true" /></button>}
                {period && <button type="button" className="btn btn-secondary graduation-icon-button" onClick={() => void toggleHistory(period.periodId)} aria-expanded={historyPeriodId === period.periodId} title={`${historyPeriodId === period.periodId ? 'Ẩn' : 'Xem'} lịch sử cập nhật Đợt ${round}`} aria-label={`${historyPeriodId === period.periodId ? 'Ẩn' : 'Xem'} lịch sử cập nhật Đợt ${round}`}><History aria-hidden="true" /></button>}
                {period && <button type="button" className="btn btn-secondary graduation-icon-button graduation-icon-button--danger" onClick={() => setDeletePeriod(period)} title={`Xóa dữ liệu Đợt ${round}`} aria-label={`Xóa dữ liệu Đợt ${round}`}><Trash2 aria-hidden="true" /></button>}
                {canRemove && <button type="button" className="btn btn-secondary graduation-icon-button graduation-icon-button--danger" onClick={removeLatestEmptyRound} title={`Xóa Đợt ${round}`} aria-label={`Xóa Đợt ${round}`}><Trash2 aria-hidden="true" /></button>}
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="graduation-add-round"><button type="button" onClick={addRound}><Plus size={16} /> Thêm Đợt {visibleRoundCount + 1}</button></div>
      {historyPeriodId && <div className="graduation-history"><h3>Lịch sử cập nhật</h3>{historyLoading ? <div className="graduation-state"><LoaderCircle className="spin" /> Đang tải...</div> : <table><thead><tr><th>Lần cập nhật</th><th>File</th><th>Thời gian</th><th>Người tải lên</th><th>Số sinh viên</th><th>Dòng bỏ</th><th>Lý do thay thế</th></tr></thead><tbody>{revisions.map((revision) => <tr key={revision.revisionId}><td>Lần {revision.revisionNumber}</td><td>{revision.originalFileName}</td><td>{new Date(revision.importedAtUtc).toLocaleString('vi-VN')}</td><td>{revision.importedByName}</td><td>{formatNumber(revision.importedRowCount)}</td><td>{revision.skippedRowCount}</td><td>{revision.replaceReason ?? 'Tải lên lần đầu'}</td></tr>)}</tbody></table>}</div>}
    </section>}

    <GraduationImportDialog isOpen={Boolean(importTarget)} target={importTarget} onClose={() => setImportTarget(null)} onCommitted={handleCommitted} />
    <GraduationSavedPreviewDialog period={previewPeriod} onClose={() => setPreviewPeriod(null)} />
    <GraduationDeletePeriodDialog period={deletePeriod} onClose={() => setDeletePeriod(null)} onDeleted={handlePeriodDeleted} />
  </div>;
}
