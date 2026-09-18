import type {
  GraduationAnalysisScope,
  GraduationFacets,
  GraduationImportResult,
  GraduationImportRow,
  GraduationMetadata,
  GraduationOverview,
  GraduationOverviewQuery,
  GraduationPeriod,
  GraduationQuery,
  GraduationQueryResult,
  GraduationRowsPage,
  GraduationExploreModeV3,
  GraduationExploreResultV3,
  GraduationImportCommitResultV3,
  GraduationImportPreviewV3,
  GraduationManagedPeriod,
  GraduationRevisionV3,
} from '../types/graduationAnalytics';
import { ApiError, apiRequest, csrfRequest, getCsrfToken } from './apiClient';

const basePath = '/api/v1/graduation-analytics';

export const graduationAnalyticsApi = {
  periods: () => apiRequest<GraduationPeriod[]>(`${basePath}/periods`),
  metadata: () => apiRequest<GraduationMetadata>(`${basePath}/metadata`),
  facets: (scope: GraduationAnalysisScope, periodId?: number | null) => {
    const query = new URLSearchParams({ scope });
    if (scope === 'period' && periodId) query.set('periodId', String(periodId));
    return apiRequest<GraduationFacets>(`${basePath}/facets?${query.toString()}`);
  },
  importPeriod: (payload: {
    originalFileName: string;
    sourceSheetName: string;
    rows: GraduationImportRow[];
  }) => csrfRequest<GraduationImportResult>(`${basePath}/periods`, 'POST', payload),
  overview: (payload: GraduationOverviewQuery) =>
    csrfRequest<GraduationOverview>(`${basePath}/overview`, 'POST', payload),
  query: (payload: GraduationQuery) =>
    csrfRequest<GraduationQueryResult>(`${basePath}/query`, 'POST', payload),
  rows: (
    periodId: number,
    page = 1,
    pageSize = 25,
    search = '',
    filters?: { faculty?: string; program?: string; cohort?: string },
  ) => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) query.set('search', search.trim());
    if (filters?.faculty) query.set('faculty', filters.faculty);
    if (filters?.program) query.set('program', filters.program);
    if (filters?.cohort) query.set('cohort', filters.cohort);
    return apiRequest<GraduationRowsPage>(
      `${basePath}/periods/${periodId}/rows?${query.toString()}`,
    );
  },
  managedPeriods: (academicYearStart?: number) => {
    const query = academicYearStart ? `?academicYearStart=${academicYearStart}` : '';
    return apiRequest<GraduationManagedPeriod[]>(`${basePath}/managed-periods${query}`);
  },
  revisions: (periodId: number) =>
    apiRequest<GraduationRevisionV3[]>(`${basePath}/managed-periods/${periodId}/revisions`),
  previewImport: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return multipartRequest<GraduationImportPreviewV3>(`${basePath}/imports/preview`, form);
  },
  commitImport: async (payload: {
    file: File;
    academicYearStart: number;
    roundNumber: number;
    reviewMonth: number;
    reviewYear: number;
    previewFileHash: string;
    expectedActiveRevisionId?: number | null;
    replaceReason?: string | null;
  }) => {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('academicYearStart', String(payload.academicYearStart));
    form.append('roundNumber', String(payload.roundNumber));
    form.append('reviewMonth', String(payload.reviewMonth));
    form.append('reviewYear', String(payload.reviewYear));
    form.append('previewFileHash', payload.previewFileHash);
    if (payload.expectedActiveRevisionId) {
      form.append('expectedActiveRevisionId', String(payload.expectedActiveRevisionId));
    }
    if (payload.replaceReason?.trim()) form.append('replaceReason', payload.replaceReason.trim());
    return multipartRequest<GraduationImportCommitResultV3>(`${basePath}/imports/commit`, form);
  },
  exploreV3: (payload: {
    mode: GraduationExploreModeV3;
    startPeriodId?: number | null;
    cutoffPeriodId: number;
    cohort?: string | null;
    facultyKey?: string | null;
    programKey?: string | null;
    metricId: string;
    groupBy: string;
    seriesBy?: string | null;
  }) => csrfRequest<GraduationExploreResultV3>(`${basePath}/explore/summary`, 'POST', payload),
};

async function multipartRequest<T>(path: string, form: FormData): Promise<T> {
  const token = await getCsrfToken();
  const send = (csrfToken: string) => apiRequest<T>(path, {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': csrfToken },
      body: form,
    });
  try {
    return await send(token);
  } catch (error) {
    if (error instanceof ApiError && error.errorCode === 'AUTH_CSRF_INVALID') {
      return send(await getCsrfToken(true));
    }
    throw error;
  }
}
