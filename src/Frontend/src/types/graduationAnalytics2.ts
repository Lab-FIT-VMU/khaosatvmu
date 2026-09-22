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
  reviewMonth: number | null;
  reviewYear: number | null;
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
    cohorts: string[];
    startPeriodId: number;
    startPeriodLabel: string;
    cutoffPeriodId: number;
    cutoffPeriodLabel: string;
    includedPeriodCount: number;
  };
  kpis: Array<{ id: string; label: string; count: number; rate: number }>;
  ranks: Array<{
    rank: GraduationRankV3;
    label: string;
    count: number;
    rate: number;
    workStudyCount: number;
    workStudyRate: number;
  }>;
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
    studentCount: number;
    graduated: number;
    notGraduated: number;
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
    count: number;
    total: number;
  }>;
  facets: {
    faculties: GraduationFacetOptionV3[];
    programs: GraduationFacetOptionV3[];
    cohorts: string[];
  };
}
