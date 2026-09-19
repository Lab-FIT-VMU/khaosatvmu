export interface GraduationImportRow {
  sourceRowNumber: number;
  facultyName: string;
  programCode: string | null;
  programName: string;
  cohort: string;
  initialEnrollmentCount: number | null;
  reviewPeriodText: string;
  excellentCount: number | null;
  excellentRate: number | null;
  veryGoodCount: number | null;
  veryGoodRate: number | null;
  goodCount: number | null;
  goodRate: number | null;
  averageCount: number | null;
  averageRate: number | null;
  workStudyTransferCount: number | null;
  workStudyTransferRate: number | null;
}

export interface GraduationPeriod {
  periodId: number;
  label: string;
  reviewMonth: number;
  reviewYear: number;
  originalFileName: string;
  importedByName: string;
  importedAtUtc: string;
  rowCount: number;
}

export interface GraduationImportResult { period: GraduationPeriod }

export interface GraduationProgramOption {
  value: string;
  label: string;
  facultyName: string;
}

export interface GraduationFacets {
  faculties: string[];
  programs: GraduationProgramOption[];
  cohorts: string[];
  reviewYears: number[];
}

export interface GraduationDimension {
  id: 'faculty' | 'program' | 'cohort' | 'reviewYear';
  label: string;
  type: 'category' | 'time';
}

export interface GraduationMetric {
  id: string;
  label: string;
  unit: 'count' | 'percent';
  aggregation: 'sum' | 'ratio-of-sums';
  chartTypes: GraduationChartType[];
}

export type GraduationChartType =
  | 'bar'
  | 'column'
  | 'combo'
  | 'stacked-bar'
  | 'stacked-column'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut';

export interface GraduationMetadata {
  dimensions: GraduationDimension[];
  metrics: GraduationMetric[];
}

export type GraduationAnalysisScope = 'cumulative' | 'period';

export interface GraduationQuery {
  scope: GraduationAnalysisScope;
  periodId?: number | null;
  metricId: string;
  groupBy: GraduationDimension['id'];
  seriesBy?: GraduationDimension['id'] | null;
  faculty?: string | null;
  program?: string | null;
  cohort?: string | null;
}

export interface GraduationAnalyticsPoint {
  group: string;
  series: string | null;
  metricId: string;
  value: number | null;
  aggregation: 'sum' | 'ratio-of-sums';
  includedRows: number;
  totalRows: number;
}

export interface GraduationQueryResult {
  metricId: string;
  unit: 'count' | 'percent';
  groupBy: GraduationDimension['id'];
  seriesBy: GraduationDimension['id'] | null;
  points: GraduationAnalyticsPoint[];
}

export interface GraduationOverviewQuery {
  faculty?: string | null;
  program?: string | null;
  cohort?: string | null;
  fromYear?: number | null;
  toYear?: number | null;
}

export interface GraduationOutcomeSummary {
  metricId: string;
  label: string;
  count: number;
  rate: number | null;
  includedRows: number;
  totalRows: number;
}

export interface GraduationOutcomeGroup {
  group: string;
  totalOutcome: number;
  excellentCount: number;
  excellentRate: number | null;
  veryGoodCount: number;
  veryGoodRate: number | null;
  goodCount: number;
  goodRate: number | null;
  averageCount: number;
  averageRate: number | null;
  workStudyTransferCount: number;
  workStudyTransferRate: number | null;
  includedRows: number;
  totalRows: number;
}

export interface GraduationCohortYearPoint {
  reviewYear: number;
  cohort: string;
  totalOutcome: number;
  excellentCount: number;
  veryGoodCount: number;
  goodCount: number;
  averageCount: number;
  workStudyTransferCount: number;
  includedRows: number;
  totalRows: number;
}

export interface GraduationYearOverviewPoint {
  reviewYear: number;
  totalOutcome: number;
  excellentCount: number;
  veryGoodCount: number;
  goodCount: number;
  averageCount: number;
  workStudyTransferCount: number;
  includedRows: number;
  totalRows: number;
  complete: boolean;
}

export interface GraduationOverview {
  totalOutcome: number;
  periodCount: number;
  cohortCount: number;
  programCount: number;
  facultyCount: number;
  includedRows: number;
  totalRows: number;
  composition: GraduationOutcomeSummary[];
  byCohort: GraduationOutcomeGroup[];
  cohortYear: GraduationCohortYearPoint[];
}

export interface GraduationRow extends GraduationImportRow {
  rowId: number;
  periodId: number;
  sourceSheetName: string;
  reviewMonth: number | null;
  reviewYear: number | null;
}

export interface GraduationRowsPage {
  items: GraduationRow[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export type GraduationRankV3 = 1 | 2 | 3 | 4;

export interface GraduationImportAggregateV3 {
  facultyNameRaw: string;
  facultyKey: string;
  programNameRaw: string;
  programKey: string;
  derivedProgramCode: string | null;
  cohortCode: string;
  graduationRank: GraduationRankV3;
  isWorkStudy: boolean;
  studentCount: number;
}

export interface GraduationImportWarningV3 {
  code: string;
  message: string;
  sourceSheetName: string;
  classCode: string | null;
  sourceRowNumbers: number[];
}

export interface GraduationImportPreviewV3 {
  originalFileName: string;
  sourceSheetName: string;
  fileHash: string;
  sourceRowCount: number;
  importedRowCount: number;
  skippedRowCount: number;
  aggregates: GraduationImportAggregateV3[];
  warnings: GraduationImportWarningV3[];
}

export interface GraduationRevisionV3 {
  revisionId: number;
  revisionNumber: number;
  originalFileName: string;
  sourceSheetName: string;
  fileHash: string;
  sourceRowCount: number;
  importedRowCount: number;
  skippedRowCount: number;
  warnings: GraduationImportWarningV3[];
  importedAtUtc: string;
  importedByName: string;
  replaceReason: string | null;
  replacedRevisionId: number | null;
}

export interface GraduationManagedPeriod {
  periodId: number;
  academicYearStart: number;
  academicYearLabel: string;
  roundNumber: number;
  reviewMonth: number;
  reviewYear: number;
  activeRevisionId: number;
  activeRevisionNumber: number;
  originalFileName: string;
  studentCount: number;
  skippedRowCount: number;
  importedAtUtc: string;
  importedByName: string;
}

export interface GraduationImportCommitResultV3 {
  period: GraduationManagedPeriod;
  revision: GraduationRevisionV3;
  unchanged: boolean;
}

export type GraduationExploreModeV3 = 'period' | 'cohortCumulative';

export interface GraduationFacetOptionV3 {
  value: string;
  label: string;
  parentValue: string | null;
}

export interface GraduationExploreResultV3 {
  scope: {
    mode: GraduationExploreModeV3;
    cohort: string | null;
    startPeriodId: number;
    startPeriodLabel: string;
    cutoffPeriodId: number;
    cutoffPeriodLabel: string;
    includedPeriodCount: number;
  };
  kpis: Array<{ id: string; label: string; count: number; rate: number }>;
  ranks: Array<{ rank: GraduationRankV3; label: string; count: number; rate: number }>;
  timeline: Array<{
    periodId: number;
    periodLabel: string;
    graduated: number;
    onTime: number;
    workStudy: number;
    excellent: number;
    veryGood: number;
    good: number;
    average: number;
    cumulativeGraduated: number;
    cumulativeOnTime: number;
    cumulativeWorkStudy: number;
    cumulativeExcellent: number;
    cumulativeVeryGood: number;
    cumulativeGood: number;
    cumulativeAverage: number;
  }>;
  breakdown: Array<{
    facultyName: string;
    facultyKey: string;
    programName: string;
    programKey: string;
    cohortCode: string;
    graduated: number;
    onTime: number;
    workStudy: number;
    excellent: number;
    veryGood: number;
    good: number;
    average: number;
  }>;
  chartPoints: Array<{
    groupKey: string;
    groupLabel: string;
    seriesKey: string | null;
    seriesLabel: string | null;
    value: number;
  }>;
  facets: {
    faculties: GraduationFacetOptionV3[];
    programs: GraduationFacetOptionV3[];
    cohorts: string[];
  };
}
