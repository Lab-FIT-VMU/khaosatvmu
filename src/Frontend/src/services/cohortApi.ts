import type { ImportCohortMajorRow } from '../utils/cohortMajorImportExcel';
import { apiRequest, csrfRequest } from './apiClient';

export interface Cohort {
  cohortId: number;
  cohortCode: string;
  cohortName: string;
  academicYearId: number;
  academicYearName: string;
  cohortMajorCount: number;
}

export interface CohortMajor {
  cohortMajorId: number;
  cohortMajorCode: string;
  cohortId: number;
  cohortCode: string;
  majorId: number;
  majorCode: string;
  majorName: string;
  facultyName: string;
  studentCount: number;
  graduatedCount: number;
  notGraduatedCount: number;
  onTimeGraduatedCount: number;
  excellentCount: number;
  veryGoodCount: number;
  goodCount: number;
  averageCount: number;
  workStudyCount: number;
}

export interface CohortImportItem {
  rowNumber: number;
  cohortMajorCode: string;
  succeeded: boolean;
  errorCode: string | null;
}

export interface CohortImportResponse {
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  items: CohortImportItem[];
}

export const cohortApi = {
  cohorts: () => apiRequest<Cohort[]>('/api/catalog/cohorts'),

  createCohort: (academicYearId: number, cohortCode?: string, cohortName?: string) =>
    csrfRequest<Cohort>('/api/catalog/cohorts', 'POST', {
      academicYearId,
      cohortCode: cohortCode ?? null,
      cohortName: cohortName ?? null,
    }),

  updateCohort: (cohortId: number, academicYearId: number, cohortCode: string, cohortName: string) =>
    csrfRequest<Cohort>(`/api/catalog/cohorts/${cohortId}`, 'PUT', {
      academicYearId,
      cohortCode,
      cohortName,
    }),

  deleteCohort: (cohortId: number) =>
    csrfRequest<boolean>(`/api/catalog/cohorts/${cohortId}`, 'DELETE'),

  cohortMajors: (cohortId?: number | null) =>
    apiRequest<CohortMajor[]>(
      cohortId ? `/api/catalog/cohort-majors?cohortId=${cohortId}` : '/api/catalog/cohort-majors'
    ),

  createCohortMajor: (
    cohortId: number,
    cohortMajorCode: string,
    majorId: number,
    studentCount: number
  ) =>
    csrfRequest<CohortMajor>('/api/catalog/cohort-majors', 'POST', {
      cohortId,
      cohortMajorCode,
      majorId,
      studentCount,
    }),

  updateCohortMajor: (
    cohortMajorId: number,
    cohortId: number,
    cohortMajorCode: string,
    majorId: number,
    studentCount: number
  ) =>
    csrfRequest<CohortMajor>(`/api/catalog/cohort-majors/${cohortMajorId}`, 'PUT', {
      cohortId,
      cohortMajorCode,
      majorId,
      studentCount,
    }),

  deleteCohortMajor: (cohortMajorId: number) =>
    csrfRequest<boolean>(`/api/catalog/cohort-majors/${cohortMajorId}`, 'DELETE'),

  importCohortMajors: (cohortId: number, rows: ImportCohortMajorRow[]) =>
    csrfRequest<CohortImportResponse>('/api/catalog/cohort-majors/import', 'POST', {
      cohortId,
      rows,
    }),
};

export const cohortErrorMessages: Record<string, string> = {
  COHORT_ACADEMIC_YEAR_REQUIRED: 'Vui lòng chọn năm học.',
  COHORT_ACADEMIC_YEAR_NOT_FOUND: 'Không tìm thấy năm học.',
  COHORT_ACADEMIC_YEAR_USED: 'Năm học này đã có khoá học.',
  COHORT_NOT_FOUND: 'Không tìm thấy khoá học.',
  COHORT_CODE_REQUIRED: 'Thiếu mã khoá.',
  COHORT_CODE_EXISTS: 'Mã khoá đã tồn tại.',
  COHORT_IN_USE: 'Khoá đang có khoá ngành đào tạo, không xoá được.',
  COHORT_MAJOR_NOT_FOUND: 'Không tìm thấy khoá ngành đào tạo.',
  COHORT_MAJOR_CODE_REQUIRED: 'Thiếu tên khoá ngành đào tạo.',
  COHORT_MAJOR_CODE_EXISTS: 'Tên khoá ngành đào tạo đã có trong khoá này.',
  COHORT_MAJOR_EXISTS: 'Khoá này đã có ngành đào tạo đó.',
  COHORT_MAJOR_IN_USE: 'Đang có số liệu tốt nghiệp tham chiếu, không xoá được.',
  COHORT_MAJOR_MAJOR_REQUIRED: 'Vui lòng chọn ngành đào tạo.',
  COHORT_MAJOR_MAJOR_NOT_FOUND:
    'Không tra được ngành đào tạo từ cột "Ngành đào tạo".',
  COHORT_MAJOR_STUDENT_COUNT_INVALID: 'Số lượng sinh viên đầu vào phải là số không âm.',
  COHORT_MAJOR_IMPORT_MULTIPLE_COHORTS:
    'File chứa dữ liệu của từ hai khóa học trở lên. Mỗi file chỉ được import cho một khóa học.',
  COHORT_MAJOR_IMPORT_COHORT_MISMATCH:
    'Mã lớp trong file không thuộc khóa học đang chọn. Hãy chọn đúng khóa hoặc dùng file khác.',
};

export function cohortErrorMessage(errorCode: string | null | undefined): string {
  return cohortErrorMessages[errorCode ?? ''] ?? 'Không thể kết nối tới máy chủ.';
}
