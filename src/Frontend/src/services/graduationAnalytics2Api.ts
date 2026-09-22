import type {
  GraduationExploreModeV3,
  GraduationExploreResultV3,
  GraduationImportCommitResultV3,
  GraduationImportPreviewV3,
  GraduationManagedPeriod,
  GraduationRevisionV3,
} from '../types/graduationAnalytics2';
import { ApiError, apiRequest, csrfRequest, getCsrfToken } from './apiClient';

const basePath = '/api/v1/graduation-analytics';

export const graduationAnalytics2Api = {
  academicYearStarts: () => apiRequest<number[]>(`${basePath}/academic-years`),
  managedPeriods: (academicYearStart?: number) => {
    const query = academicYearStart ? `?academicYearStart=${academicYearStart}` : '';
    return apiRequest<GraduationManagedPeriod[]>(`${basePath}/managed-periods${query}`);
  },
  revisions: (periodId: number) =>
    apiRequest<GraduationRevisionV3[]>(`${basePath}/managed-periods/${periodId}/revisions`),
  activePreview: (periodId: number) =>
    apiRequest<GraduationImportPreviewV3>(`${basePath}/managed-periods/${periodId}/preview`),
  deletePeriod: (periodId: number, reason: string) =>
    csrfRequest<void>(`${basePath}/managed-periods/${periodId}`, 'DELETE', { reason }),
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
    cohorts?: string[] | null;
    facultyKeys?: string[] | null;
    programKeys?: string[] | null;
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
