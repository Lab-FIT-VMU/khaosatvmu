export const MODULE_REQUIRED_PERMISSION: Record<string, string | null> = {
  overview: null,
  progress: 'PROGRESS_ACCESS',
  reports: 'REPORTS_ACCESS',
  'survey-statistics': 'SURVEY_STATISTICS_ACCESS',
  'survey-analysis': 'SURVEY_ANALYSIS_ACCESS',
  // Chỉ quản trị: vai trò lọc thêm ở Sidebar và App, backend chặn thật. Lấy quyền
  // mà cả ADMIN lẫn SURVEY_ADMIN đang có sẵn để khỏi phải cấp thêm quyền mới.
  'graduation-analytics': 'GRADUATION_ANALYTICS_ACCESS',
  'graduation-analytics-2': 'GRADUATION_ANALYTICS_2_ACCESS',
  'survey-dashboard': 'SURVEY_DASHBOARD_ACCESS',
  faculties: 'FACULTIES_ACCESS',
  departments: 'DEPARTMENTS_ACCESS',
  lecturers: 'LECTURERS_ACCESS',
  majors: 'MAJORS_ACCESS',
  'cohort-majors': 'COHORT_MAJORS_ACCESS',
  courses: 'COURSES_ACCESS',
  classes: 'COURSE_SECTIONS_ACCESS',
  'course-question-sets': 'COURSE_QUESTION_SETS_ACCESS',
  // Legacy hashes remain guarded while old bookmarks are still accepted.
  criteria: 'COURSE_QUESTION_SETS_ACCESS',
  'course-campaigns': 'COURSE_CAMPAIGNS_ACCESS',
  campaigns: 'COURSE_CAMPAIGNS_ACCESS',
  'program-campaigns': 'PROGRAM_CAMPAIGNS_ACCESS',
  'program-criteria': 'PROGRAM_CRITERIA_ACCESS',
  'users-admin': 'USER_ADMIN_ACCESS',
};

export function canAccessModule(
  permissions: readonly string[] | undefined,
  moduleId: string,
): boolean {
  const required = MODULE_REQUIRED_PERMISSION[moduleId] ?? null;
  return required === null || permissions?.includes(required) === true;
}
