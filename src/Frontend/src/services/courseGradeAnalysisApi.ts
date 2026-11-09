import type {
  AnalysisCourse,
  AnalysisLecturerCourse,
  AnalysisOverview,
  AnalysisSection,
  ThresholdSaveResult,
  ThresholdSet,
} from '../types/courseGradeAnalysis';
import { apiRequest, csrfRequest } from './apiClient';

const reports = '/api/v1/course-grade-analysis';
const thresholds = '/api/v1/course-grade-thresholds';

const query = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.append(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** Báo cáo phân tích điểm (chỉ đọc) và ngưỡng phân tích. Phạm vi do backend lọc theo người xem. */
export const courseGradeAnalysisApi = {
  overview: () => apiRequest<AnalysisOverview>(`${reports}/overview`),
  courses: (semesterId: number, filters: { facultyId?: number | null; departmentId?: number | null } = {}) =>
    apiRequest<AnalysisCourse[]>(`${reports}/terms/${semesterId}/courses${query(filters)}`),
  sections: (semesterId: number, filters: { departmentId?: number | null; courseCode?: string | null }) =>
    apiRequest<AnalysisSection[]>(`${reports}/terms/${semesterId}/sections${query(filters)}`),
  lecturerCourses: (filters: { departmentId?: number | null; courseCode?: string | null } = {}) =>
    apiRequest<AnalysisLecturerCourse[]>(`${reports}/lecturer-courses${query(filters)}`),

  thresholds: () => apiRequest<ThresholdSet>(thresholds),
  saveThresholds: (values: { code: string; numericValue: number | null; booleanValue: boolean | null; textListValue: string[] | null }[]) =>
    csrfRequest<ThresholdSaveResult>(thresholds, 'PUT', { thresholds: values }),
  resetThresholds: () => csrfRequest<ThresholdSaveResult>(`${thresholds}/reset`, 'POST', {}),
};
