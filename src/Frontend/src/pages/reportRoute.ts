export type ReportWorkspace = 'overview' | 'details' | 'faculties' | 'departments' | 'courses' | 'comments';
export type ReportAnalysisView = 'faculties' | 'quality' | 'criteria';
export type SurveyAnalysisSourceTab =
  | 'normalization'
  | 'normalizationSections'
  | 'departments'
  | 'courses'
  | 'lecturer';
/**
 * Ba cấp của trang chi tiết mở từ nút "Xem KQ" trên các bảng xếp hạng. Cấp trên
 * là phạm vi đang xem, cấp dưới là danh sách nằm trong phạm vi đó:
 * khoa/viện → bộ môn → học phần → lớp học phần.
 */
export type ReportScopeType = 'faculty' | 'department' | 'course';
export type ReportScreen = ReportWorkspace | 'lecturer' | 'survey' | 'scope';

/** Đường dẫn của trang chi tiết. Tách ra để chỗ đọc và chỗ ghi không lệch nhau. */
export const scopeRouteSegment = 'scope';
/** Khóa sắp xếp của bảng tra cứu chi tiết — đúng bằng key các cột sắp xếp được. */
export const reportResultSortKeys = [
  'courseCode',
  'courseName',
  'sectionName',
  'facultyName',
  'departmentName',
  'lecturerName',
  'classSize',
  'responseCount',
  'validResponseCount',
  'invalidResponseCount',
  'responseRate',
  'validRate',
  'averageScore',
] as const;

export type ReportResultSortKey = (typeof reportResultSortKeys)[number];

/**
 * Giảng viên chưa gắn được mã: không có mã nên nhận diện bằng tên đọc từ tệp import,
 * khoanh trong khoa/viện của lớp đã bấm — hai người trùng tên ở hai khoa là chuyện
 * thường, còn một người vẫn dạy học phần của nhiều bộ môn trong cùng khoa.
 */
export interface UnidentifiedLecturerRef {
  name: string;
  /** 0 là lớp chưa thuộc khoa/viện nào. */
  facultyId: number;
}

export interface ReportRouteState {
  screen: ReportScreen;
  semesterId?: number;
  facultyId?: number;
  departmentId?: number;
  lecturerFilterId?: number;
  semesterSurveyId?: number;
  search?: string;
  lecturerId?: number;
  /** Trang giảng viên chưa gắn mã, hoặc trang cha của bài khảo sát mở từ trang đó. */
  unidentifiedLecturer?: UnidentifiedLecturerRef;
  surveyId?: number;
  parentLecturerId?: number;
  /** Chỉ có nghĩa khi `screen` là `scope`. */
  scopeType?: ReportScopeType;
  scopeId?: number;
  analysisView?: ReportAnalysisView;
  comparisonSemesterId?: number;
  resultSortKey?: ReportResultSortKey;
  resultSortDirection?: 'asc' | 'desc';
  source?: 'survey-analysis';
  sourceTab?: SurveyAnalysisSourceTab;
}

const surveyAnalysisSourceTabs: readonly SurveyAnalysisSourceTab[] = [
  'normalization',
  'normalizationSections',
  'departments',
  'courses',
  'lecturer',
];

const positiveInt = (value: string | null | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const nonNegativeInt = (value: string | null | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

export const getHashRoot = (hash = window.location.hash): string =>
  hash.replace(/^#\/?/, '').split(/[/?]/, 1)[0]?.trim() || 'overview';

export const parseReportRoute = (hash = window.location.hash): ReportRouteState => {
  const normalized = hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = normalized.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart);
  const routeSegment = segments[0] === 'reports' ? segments[1] : undefined;

  const lecturerName = query.get('lecturerName')?.trim();
  const namedLecturer: UnidentifiedLecturerRef | undefined = lecturerName
    ? { name: lecturerName, facultyId: nonNegativeInt(query.get('lecturerFaculty')) ?? 0 }
    : undefined;

  let screen: ReportScreen = 'overview';
  let lecturerId: number | undefined;
  let surveyId: number | undefined;
  let unidentifiedLecturer: UnidentifiedLecturerRef | undefined;
  let scopeType: ReportScopeType | undefined;
  let scopeId: number | undefined;

  if (routeSegment === 'details' || routeSegment === 'overview'
    || routeSegment === 'faculties' || routeSegment === 'departments' || routeSegment === 'courses'
    || routeSegment === 'comments') {
    screen = routeSegment;
  } else if (routeSegment === scopeRouteSegment) {
    // `/reports/scope/khoa-vien/15` — cấp và mã đơn vị phải cùng có, thiếu một
    // trong hai thì rơi về trang tổng quan chứ không mở trang chi tiết rỗng.
    const routeScopeType = segments[2];
    const routeScopeId = positiveInt(segments[3]);
    if ((routeScopeType === 'faculty' || routeScopeType === 'department'
      || routeScopeType === 'course') && routeScopeId) {
      scopeType = routeScopeType;
      scopeId = routeScopeId;
      screen = 'scope';
    }
  } else if (routeSegment === 'rankings') {
    // Link cũ của bảng tổng hợp đơn vị chuyển về tab Khoa / Viện mới.
    screen = 'faculties';
  } else if (routeSegment === 'lecturers') {
    lecturerId = positiveInt(segments[2]);
    if (!lecturerId && segments[2] === 'unidentified') unidentifiedLecturer = namedLecturer;
    screen = lecturerId || unidentifiedLecturer ? 'lecturer' : 'details';
  } else if (routeSegment === 'surveys') {
    surveyId = positiveInt(segments[2]);
    screen = surveyId ? 'survey' : 'details';
  }

  const parentLecturerId = positiveInt(query.get('fromLecturer'));
  if (screen === 'survey' && !parentLecturerId) unidentifiedLecturer = namedLecturer;

  const analysis = query.get('analysis');
  const analysisView: ReportAnalysisView | undefined =
    analysis === 'quality' || analysis === 'faculties' || analysis === 'criteria' ? analysis : undefined;
  const sort = query.get('sort');
  const resultSortKey = reportResultSortKeys.find((key) => key === sort);
  const source = query.get('from') === 'survey-analysis' ? 'survey-analysis' : undefined;
  const rawSourceTab = query.get('fromTab');
  const sourceTab = source && surveyAnalysisSourceTabs.includes(rawSourceTab as SurveyAnalysisSourceTab)
    ? rawSourceTab as SurveyAnalysisSourceTab
    : undefined;

  return {
    screen,
    semesterId: positiveInt(query.get('semester')),
    facultyId: positiveInt(query.get('faculty')),
    departmentId: positiveInt(query.get('department')),
    lecturerFilterId: positiveInt(query.get('lecturerFilter')),
    semesterSurveyId: positiveInt(query.get('campaign')),
    search: query.get('q')?.trim() || undefined,
    lecturerId,
    unidentifiedLecturer,
    surveyId,
    parentLecturerId,
    scopeType,
    scopeId,
    analysisView,
    comparisonSemesterId: positiveInt(query.get('compare')),
    resultSortKey,
    resultSortDirection: resultSortKey && query.get('direction') === 'desc' ? 'desc' : 'asc',
    source,
    sourceTab,
  };
};

export const buildReportHash = (route: ReportRouteState): string => {
  let path = `/reports/${route.screen}`;
  if (route.screen === 'scope') {
    // Trang chi tiết cần đủ cấp lẫn mã đơn vị mới dựng lại được. Thiếu thì rơi về
    // bảng tra cứu chi tiết thay vì ghi ra một đường dẫn không đọc ngược được.
    path = route.scopeType && route.scopeId
      ? `/reports/${scopeRouteSegment}/${route.scopeType}/${route.scopeId}`
      : '/reports/details';
  } else if (route.screen === 'lecturer' && route.lecturerId) {
    path = `/reports/lecturers/${route.lecturerId}`;
  } else if (route.screen === 'lecturer' && route.unidentifiedLecturer) {
    path = '/reports/lecturers/unidentified';
  } else if (route.screen === 'survey' && route.surveyId) {
    path = `/reports/surveys/${route.surveyId}`;
  }

  const query = new URLSearchParams();
  if (route.semesterId) query.set('semester', String(route.semesterId));
  if (route.facultyId) query.set('faculty', String(route.facultyId));
  if (route.departmentId) query.set('department', String(route.departmentId));
  if (route.lecturerFilterId) query.set('lecturerFilter', String(route.lecturerFilterId));
  if (route.semesterSurveyId) query.set('campaign', String(route.semesterSurveyId));
  if (route.search) query.set('q', route.search);
  if (route.parentLecturerId) query.set('fromLecturer', String(route.parentLecturerId));
  // Tên giảng viên chưa gắn mã chỉ có nghĩa ở trang giảng viên đó và ở bài khảo sát
  // mở ra từ trang ấy; ở trang danh sách thì bỏ, không để dính sang lần bấm sau.
  const carriesUnidentifiedLecturer =
    (route.screen === 'lecturer' && !route.lecturerId)
    || (route.screen === 'survey' && !route.parentLecturerId);
  if (route.unidentifiedLecturer && carriesUnidentifiedLecturer) {
    query.set('lecturerName', route.unidentifiedLecturer.name);
    query.set('lecturerFaculty', String(route.unidentifiedLecturer.facultyId));
  }
  if (route.analysisView && route.analysisView !== 'faculties') query.set('analysis', route.analysisView);
  if (route.comparisonSemesterId) query.set('compare', String(route.comparisonSemesterId));
  if (route.resultSortKey) {
    query.set('sort', route.resultSortKey);
    if (route.resultSortDirection === 'desc') query.set('direction', 'desc');
  }
  if (route.source === 'survey-analysis') {
    query.set('from', route.source);
    if (route.sourceTab) query.set('fromTab', route.sourceTab);
  }

  const queryString = query.toString();
  return `#${path}${queryString ? `?${queryString}` : ''}`;
};
