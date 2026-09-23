import type {
  FacultyDepartmentReport,
  LecturerPerformanceReport,
  OperationalProgressReport,
  QuestionRating,
  SchoolOverviewComparisonOption,
  SchoolSurveyOverview,
  SectionSurveyAnalysis,
  SurveyQuestionSummaryReport,
  SurveyResultDetail,
  OpenCommentAnalysisReport,
} from '../types';
import { apiRequest, csrfRequest } from './apiClient';

export const reportApi = {
  operationalProgress: (semesterId: number) =>
    apiRequest<OperationalProgressReport>(
      `/api/v1/reports/operational-progress?semesterId=${semesterId}`,
    ),

  schoolOverview: (
    semesterId: number,
    comparisonSemesterId?: number,
    semesterSurveyId?: number,
    comparisonSemesterSurveyId?: number,
  ) => {
    const query = new URLSearchParams({ semesterId: String(semesterId) });
    if (comparisonSemesterId) query.append('comparisonSemesterId', String(comparisonSemesterId));
    if (semesterSurveyId) query.append('semesterSurveyId', String(semesterSurveyId));
    if (comparisonSemesterSurveyId) {
      query.append('comparisonSemesterSurveyId', String(comparisonSemesterSurveyId));
    }
    return apiRequest<SchoolSurveyOverview>(
      `/api/v1/reports/school-overview?${query.toString()}`,
    );
  },

  schoolOverviewComparisonOptions: () =>
    apiRequest<SchoolOverviewComparisonOption[]>(
      '/api/v1/reports/school-overview/comparison-options',
    ),

  /** Xếp hạng tiêu chí theo điểm: `lowest` = true lấy nhóm thấp nhất, false lấy cao nhất. */
  questionRanking: (params: {
    semesterId: number;
    semesterSurveyId?: number;
    count: number;
    lowest: boolean;
  }) => {
    const query = new URLSearchParams({
      semesterId: String(params.semesterId),
      count: String(params.count),
      lowest: String(params.lowest),
    });
    if (params.semesterSurveyId) query.append('semesterSurveyId', String(params.semesterSurveyId));
    return apiRequest<QuestionRating[]>(`/api/v1/reports/question-ranking?${query.toString()}`);
  },

  lecturers: (params?: { facultyId?: number; departmentId?: number; semesterId?: number }) => {
    const query = new URLSearchParams();
    if (params?.facultyId) query.append('facultyId', String(params.facultyId));
    if (params?.departmentId) query.append('departmentId', String(params.departmentId));
    if (params?.semesterId) query.append('semesterId', String(params.semesterId));
    const queryString = query.toString();
    return apiRequest<LecturerPerformanceReport[]>(
      queryString ? `/api/v1/reports/lecturers?${queryString}` : '/api/v1/reports/lecturers',
    );
  },

  lecturerDetail: (lecturerId: number, semesterId?: number) => {
    const query = semesterId ? `?semesterId=${semesterId}` : '';
    return apiRequest<LecturerPerformanceReport>(
      `/api/v1/reports/lecturers/${lecturerId}${query}`,
    );
  },

  /**
   * Trang giảng viên của người chưa gắn mã: tra theo tên đọc từ tệp import, khoanh
   * trong một khoa/viện. `facultyId` bằng 0 là lớp chưa thuộc khoa nào.
   */
  unidentifiedLecturerDetail: (name: string, facultyId: number, semesterId?: number) => {
    const query = new URLSearchParams({ name });
    if (facultyId > 0) query.append('facultyId', String(facultyId));
    if (semesterId) query.append('semesterId', String(semesterId));
    return apiRequest<LecturerPerformanceReport>(
      `/api/v1/reports/lecturers/unidentified?${query.toString()}`,
    );
  },

  faculties: (semesterId?: number) => {
    const query = semesterId ? `?semesterId=${semesterId}` : '';
    return apiRequest<FacultyDepartmentReport[]>(`/api/v1/reports/faculties${query}`);
  },

  questionAnalysis: (semesterSurveyId: number) =>
    apiRequest<SurveyQuestionSummaryReport>(
      `/api/v1/reports/question-analysis?semesterSurveyId=${semesterSurveyId}`,
    ),

  sectionAnalysis: (courseSectionSurveyId: number) =>
    apiRequest<SectionSurveyAnalysis>(
      `/api/v1/reports/section-analysis?courseSectionSurveyId=${courseSectionSurveyId}`,
    ),

  results: (params?: {
    semesterId?: number;
    facultyId?: number;
    departmentId?: number;
    lecturerId?: number;
    semesterSurveyId?: number;
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.semesterId) query.append('semesterId', String(params.semesterId));
    if (params?.facultyId) query.append('facultyId', String(params.facultyId));
    if (params?.departmentId) query.append('departmentId', String(params.departmentId));
    if (params?.lecturerId) query.append('lecturerId', String(params.lecturerId));
    if (params?.semesterSurveyId) query.append('semesterSurveyId', String(params.semesterSurveyId));
    if (params?.search) query.append('search', params.search);
    const queryString = query.toString();
    return apiRequest<SurveyResultDetail[]>(
      queryString ? `/api/v1/reports/results?${queryString}` : '/api/v1/reports/results',
    );
  },

  openComments: (params?: {
    semesterId?: number;
    semesterSurveyId?: number;
    facultyId?: number;
    departmentId?: number;
    lecturerId?: number;
    search?: string;
    validOnly?: boolean;
  }) => {
    const query = new URLSearchParams();
    if (params?.semesterId) query.append('semesterId', String(params.semesterId));
    if (params?.semesterSurveyId) query.append('semesterSurveyId', String(params.semesterSurveyId));
    if (params?.facultyId) query.append('facultyId', String(params.facultyId));
    if (params?.departmentId) query.append('departmentId', String(params.departmentId));
    if (params?.lecturerId) query.append('lecturerId', String(params.lecturerId));
    if (params?.search) query.append('search', params.search);
    if (params?.validOnly !== undefined) query.append('validOnly', String(params.validOnly));
    const queryString = query.toString();
    return apiRequest<OpenCommentAnalysisReport>(
      queryString ? `/api/v1/reports/open-comments?${queryString}` : '/api/v1/reports/open-comments',
    );
  },

  /**
   * Hiệu chỉnh nhãn cảm xúc của một ý kiến mở.
   *
   * Truyền chuỗi rỗng để bỏ hiệu chỉnh và quay về nhãn của model. Backend kiểm tra quyền và
   * phạm vi dữ liệu, giao diện chỉ ẩn nút chứ không phải cơ chế bảo vệ.
   */
  reviewOpenCommentSentiment: (responseId: number, sentiment: string) =>
    csrfRequest<void>(
      `/api/v1/reports/open-comments/${responseId}/sentiment`,
      'PATCH',
      { sentiment },
    ),
};
