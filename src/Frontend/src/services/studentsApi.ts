import type { StudentImportPreview, StudentImportResult, StudentImportRow, StudentList } from '../types/students';
import { apiRequest, csrfRequest } from './apiClient';

const basePath = '/api/v1/students';

export const studentsApi = {
  /** cohortId null + unassigned false: mọi khóa. */
  list: (filter: { cohortId: number | null; unassigned: boolean }) => {
    const params = new URLSearchParams();
    if (filter.unassigned) params.set('unassigned', 'true');
    else if (filter.cohortId !== null) params.set('cohortId', String(filter.cohortId));
    const query = params.toString();
    return apiRequest<StudentList>(`${basePath}/${query ? `?${query}` : ''}`);
  },
  previewImport: (rows: StudentImportRow[]) =>
    csrfRequest<StudentImportPreview>(`${basePath}/import/preview`, 'POST', { rows, previewHash: null }),
  commitImport: (rows: StudentImportRow[], previewHash: string) =>
    csrfRequest<StudentImportResult>(`${basePath}/import/commit`, 'POST', { rows, previewHash }),
};
