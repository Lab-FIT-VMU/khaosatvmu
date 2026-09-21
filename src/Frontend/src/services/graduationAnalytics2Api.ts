import type {
  GraduationExploreModeV3,
  GraduationExploreResultV3,
  GraduationImportCommitResultV3,
  GraduationImportPreviewV3,
  GraduationManagedPeriod,
  GraduationRevisionV3,
} from '../types/graduationAnalytics2';
import { ApiError, apiRequest, csrfRequest, getCsrfToken } from './apiClient';

const basePath = '/api/v1/graduation-analytics-2';

export interface GraduationRound {
  graduationRoundId: number;
  roundNumber: number;
  createdAt: string;
  academicYearId: number;
  academicYearName: string;
  cohortMajorCount: number;
  graduatedCount: number;
}

/** Một dòng của "CohortMajorGraduations", giữ nguyên các cột số như lúc import. */
export interface GraduationResultRow {
  cohortMajorGraduationId: number;
  graduationRoundId: number;
  roundNumber: number;
  academicYearId: number;
  academicYearName: string;
  cohortMajorId: number;
  cohortMajorCode: string;
  cohortCode: string;
  cohortName: string;
  majorCode: string;
  majorName: string;
  facultyName: string;
  studentCount: number;
  graduatedCount: number;
  excellentCount: number;
  veryGoodCount: number;
  goodCount: number;
  averageCount: number;
  workStudyCount: number;
}

export interface StudentListPreviewRow {
  classCode: string;
  cohortMajorId: number | null;
  cohortMajorCode: string | null;
  cohortName: string | null;
  majorName: string | null;
  graduatedCount: number;
  excellentCount: number;
  veryGoodCount: number;
  goodCount: number;
  averageCount: number;
  workStudyCount: number;
  errorCode: string | null;
}

export interface StudentListSkippedRow {
  sourceRowNumber: number;
  classCode: string;
  reason: string;
}

export interface StudentListPreview {
  graduationRoundId: number;
  roundNumber: number;
  academicYearName: string;
  originalFileName: string;
  sourceSheetName: string;
  sourceRowCount: number;
  importedRowCount: number;
  skippedRowCount: number;
  matchedClassCount: number;
  unmatchedClassCount: number;
  rows: StudentListPreviewRow[];
  skippedRows: StudentListSkippedRow[];
}

export interface StudentListCommit {
  graduationRoundId: number;
  roundNumber: number;
  savedClassCount: number;
  skippedClassCount: number;
  graduatedCount: number;
}

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
  deletePeriod: (periodId: number) =>
    csrfRequest<void>(`${basePath}/managed-periods/${periodId}`, 'DELETE'),
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
  rounds: (academicYearId?: number | null) =>
    apiRequest<GraduationRound[]>(
      academicYearId ? `${basePath}/rounds?academicYearId=${academicYearId}` : `${basePath}/rounds`
    ),

  createRound: (academicYearId: number) =>
    csrfRequest<GraduationRound>(`${basePath}/rounds`, 'POST', { academicYearId }),

  deleteRound: (graduationRoundId: number) =>
    csrfRequest<boolean>(`${basePath}/rounds/${graduationRoundId}`, 'DELETE'),

  results: (academicYearId?: number | null, graduationRoundId?: number | null) => {
    const query = new URLSearchParams();
    if (academicYearId) query.set('academicYearId', String(academicYearId));
    if (graduationRoundId) query.set('graduationRoundId', String(graduationRoundId));
    const suffix = query.toString();
    return apiRequest<GraduationResultRow[]>(`${basePath}/results${suffix ? `?${suffix}` : ''}`);
  },

  previewRoundImport: (graduationRoundId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return multipartRequest<StudentListPreview>(
      `${basePath}/rounds/${graduationRoundId}/import/preview`, form);
  },

  commitRoundImport: (graduationRoundId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return multipartRequest<StudentListCommit>(
      `${basePath}/rounds/${graduationRoundId}/import`, form);
  },
};

export const graduationRoundErrorMessages: Record<string, string> = {
  GRADUATION_ROUND_ACADEMIC_YEAR_REQUIRED: 'Vui lòng chọn năm học.',
  GRADUATION_ROUND_ACADEMIC_YEAR_NOT_FOUND: 'Không tìm thấy năm học.',
  GRADUATION_ROUND_NOT_FOUND: 'Không tìm thấy đợt tốt nghiệp.',
  GRADUATION_ROUND_IN_USE: 'Đợt đã có số liệu tốt nghiệp, không xoá được.',
};

export function graduationRoundErrorMessage(errorCode: string | null | undefined): string {
  return graduationRoundErrorMessages[errorCode ?? ''] ?? 'Không thể kết nối tới máy chủ.';
}

export const studentListMatchMessages: Record<string, string> = {
  STUDENT_LIST_COHORT_MAJOR_NOT_FOUND:
    'Chưa có khoá ngành đào tạo nào trùng tên lớp này trong danh mục.',
  STUDENT_LIST_COHORT_MAJOR_AMBIGUOUS:
    'Tên lớp này trùng ở nhiều khoá, không xác định được khoá nào.',
  STUDENT_LIST_IMPORT_INVALID_FILE: 'Không đọc được tệp Excel.',
  STUDENT_LIST_IMPORT_HEADER_NOT_FOUND:
    'Không tìm thấy hàng tiêu đề có cột "Lớp" và "Loại TN".',
  STUDENT_LIST_IMPORT_TOO_MANY_ROWS: 'Tệp có quá nhiều dòng.',
  STUDENT_LIST_IMPORT_NO_DATA_ROWS: 'Tệp chưa có dòng sinh viên nào.',
};

export function studentListMatchMessage(errorCode: string | null | undefined): string {
  return studentListMatchMessages[errorCode ?? ''] ?? 'Không thể kết nối tới máy chủ.';
}

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
