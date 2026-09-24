export const MODULE_REQUIRED_PERMISSION: Record<string, string | null> = {
  // Mỗi mục trên thanh điều hướng có đúng một quyền, để trang Phân quyền Module bật
  // tắt được từng mục một. Tên quyền bên backend cũng phải trùng nhãn của mục.
  overview: 'DASHBOARD_ACCESS',
  progress: 'PROGRESS_ACCESS',
  reports: 'REPORTS_ACCESS',
  'survey-statistics': 'SURVEY_STATISTICS_ACCESS',
  'survey-analysis': 'SURVEY_ANALYSIS_ACCESS',
  // Tải lên tách khỏi xem: đây là thao tác ghi trên dữ liệu toàn trường.
  'graduation-data-upload': 'GRADUATION_UPLOAD_ACCESS',
  'graduation-statistics': 'GRADUATION_ANALYTICS_ACCESS',
  // Giữ hash cũ để bookmark tự chuyển vào module thống nhất.
  'graduation-analytics': 'GRADUATION_ANALYTICS_ACCESS',
  'graduation-analytics-2': 'GRADUATION_ANALYTICS_ACCESS',
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

/**
 * Quyền của từng tab bên trong module, khớp ModuleTabPermissions bên backend. Trang
 * nào có thanh tab thì lọc tab theo bảng này; mục trên thanh điều hướng vẫn theo
 * MODULE_REQUIRED_PERMISSION ở trên.
 */
export const TAB_PERMISSION = {
  reports: {
    overview: 'REPORTS_TAB_OVERVIEW',
    faculties: 'REPORTS_TAB_FACULTIES',
    departments: 'REPORTS_TAB_DEPARTMENTS',
    courses: 'REPORTS_TAB_COURSES',
    comments: 'REPORTS_TAB_OPEN_COMMENTS',
    details: 'REPORTS_TAB_DETAILS',
  },
  /** Ba tab con trong tab Tổng quan của Thống kê & Báo cáo. */
  reportsOverview: {
    faculties: 'REPORTS_TAB_OVERVIEW_FACULTIES',
    quality: 'REPORTS_TAB_OVERVIEW_QUALITY',
    criteria: 'REPORTS_TAB_OVERVIEW_CRITERIA',
  },
  surveyAnalysis: {
    normalization: 'SURVEY_ANALYSIS_TAB_FACULTIES',
    departments: 'SURVEY_ANALYSIS_TAB_DEPARTMENTS',
    courses: 'SURVEY_ANALYSIS_TAB_COURSES',
    normalizationSections: 'SURVEY_ANALYSIS_TAB_SECTIONS',
    lecturer: 'SURVEY_ANALYSIS_TAB_LECTURERS',
  },
  programCampaigns: {
    'Học phần': 'PROGRAM_CAMPAIGNS_TAB_COURSE',
    'Chương trình đào tạo': 'PROGRAM_CAMPAIGNS_TAB_PROGRAM',
  },
  programCriteria: {
    'Học phần': 'PROGRAM_CRITERIA_TAB_COURSE',
    'Chương trình đào tạo': 'PROGRAM_CRITERIA_TAB_PROGRAM',
  },
  usersAdmin: {
    users: 'USER_ADMIN_TAB_ACCOUNTS',
    audit: 'USER_ADMIN_TAB_AUDIT',
    permissions: 'USER_ADMIN_TAB_PERMISSIONS',
  },
} as const;

/** Tab có được bật cho vai trò đang dùng không. */
export function canAccessTab(
  permissions: readonly string[] | undefined,
  permissionCode: string,
): boolean {
  return permissions?.includes(permissionCode) === true;
}

export function canAccessModule(
  permissions: readonly string[] | undefined,
  moduleId: string,
): boolean {
  const required = MODULE_REQUIRED_PERMISSION[moduleId] ?? null;
  return required === null || permissions?.includes(required) === true;
}
