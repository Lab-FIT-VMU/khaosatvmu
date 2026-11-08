import type {
  CourseGradeImportPreview,
  CourseGradeImportResult,
  CourseGradeSemester,
  GradeAnalysisRun,
} from '../types/courseGrades';
import { ApiError, apiRequest, csrfRequest, getCsrfToken } from './apiClient';

const basePath = '/api/v1/course-grades';

/**
 * Nạp điểm học phần theo kỳ. Hai bước như module tốt nghiệp: xem trước rồi xác nhận bằng
 * đúng file đó (backend so mã băm), nên trình duyệt giữ File trong bộ nhớ giữa hai bước.
 */
export const courseGradesApi = {
  semesters: () => apiRequest<CourseGradeSemester[]>(`${basePath}/semesters`),
  latestRun: () => apiRequest<GradeAnalysisRun | undefined>(`${basePath}/runs/latest`),
  previewImport: (semesterId: number, file: File) => {
    const form = new FormData();
    form.append('semesterId', String(semesterId));
    form.append('file', file);
    return multipartRequest<CourseGradeImportPreview>(`${basePath}/imports/preview`, form);
  },
  commitImport: (payload: {
    semesterId: number;
    file: File;
    previewFileHash: string;
    expectedActiveRevisionId: number | null;
    replaceReason: string | null;
  }) => {
    const form = new FormData();
    form.append('semesterId', String(payload.semesterId));
    form.append('file', payload.file);
    form.append('previewFileHash', payload.previewFileHash);
    if (payload.expectedActiveRevisionId) {
      form.append('expectedActiveRevisionId', String(payload.expectedActiveRevisionId));
    }
    if (payload.replaceReason?.trim()) form.append('replaceReason', payload.replaceReason.trim());
    return multipartRequest<CourseGradeImportResult>(`${basePath}/imports/commit`, form);
  },
  removeSemester: (semesterId: number, reason: string) =>
    csrfRequest<GradeAnalysisRun>(`${basePath}/semesters/${semesterId}`, 'DELETE', { reason }),
};

/** Thông điệp tiếng Việt backend gửi kèm mã lỗi; không có thì dùng câu dự phòng. */
export function courseGradeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && typeof error.body.message === 'string' && error.body.message) {
    return error.body.message;
  }
  return fallback;
}

async function multipartRequest<T>(path: string, form: FormData): Promise<T> {
  const send = async (csrfToken: string) => apiRequest<T>(path, {
    method: 'POST',
    headers: { 'X-CSRF-TOKEN': csrfToken },
    body: form,
  });
  try {
    return await send(await getCsrfToken());
  } catch (error) {
    if (error instanceof ApiError && error.errorCode === 'AUTH_CSRF_INVALID') {
      return send(await getCsrfToken(true));
    }
    throw error;
  }
}
