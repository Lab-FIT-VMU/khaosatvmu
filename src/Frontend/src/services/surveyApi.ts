import type {
  AnswerScale,
  AnswerScaleKind,
  CourseSectionSurvey,
  PublicSurvey,
  QuestionRating,
  SemesterSurvey,
  SurveyResponseDetail,
  SurveyResponseSummary,
  SurveyTemplate,
} from '../types';
import { maximumSectionsPerTemplate } from '../types';
import type { ScoringThresholds } from '../utils/reportThresholds';
import { ApiError, apiRequest, csrfRequest } from './apiClient';

export interface SaveAnswerScaleOptionPayload {
  /** 1..5, không bắt buộc liên tiếp (thang Có/Không dùng 1 và 5). */
  value: number;
  displayText: string;
}

export interface SaveAnswerScalePayload {
  answerScaleName: string;
  scaleKind: AnswerScaleKind;
  /** Phải rỗng khi `scaleKind` là `Text`. */
  options: SaveAnswerScaleOptionPayload[];
}

export interface SaveSurveyQuestionSectionPayload {
  /**
   * Mục đã có thì gửi kèm mã của nó để backend UPDATE tên tại chỗ, giữ nguyên
   * `sectionId` cho báo cáo cũ. Mục mới thì để null.
   */
  sectionId: number | null;
  sectionName: string;
}

export interface SaveSurveyQuestionPayload {
  questionText: string;
  /** Thang trả lời của riêng câu này. */
  answerScaleId: number;
  /**
   * Mức bắt buộc của câu bẫy độ tập trung; null là câu hỏi bình thường.
   * Chỉ đặt được trên thang có mức chọn sẵn và phải là một mức có thật.
   */
  attentionCheckValue: number | null;
  /** Vị trí mục trong mảng `sections` gửi kèm — mục mới chưa có mã để trỏ tới. */
  sectionIndex: number;
}

export interface SaveSurveyTemplatePayload {
  templateName: string;
  /** Ghi đè toàn bộ mục của bộ; mục cũ không còn trong danh sách sẽ bị xoá mềm. */
  sections: SaveSurveyQuestionSectionPayload[];
  /**
   * Ghi đè toàn bộ "SurveyQuestions" của bộ theo đúng thứ tự gửi lên. Các câu
   * cùng một mục phải nằm liền nhau.
   */
  questions: SaveSurveyQuestionPayload[];
}

/** Một nhóm tương đương (khoa/viện) trong bảng chuẩn hoá điểm. */
export interface NormalizationGroup {
  facultyId: number | null;
  facultyName: string;
  sectionCount: number;
  averageScore: number;
  /** Null khi nhóm có ít hơn hai lớp. */
  standardDeviation: number | null;
  canNormalize: boolean;
  /**
   * Mặt bằng khoa lệch mặt bằng trường bao nhiêu lần sai số chuẩn `σ/√n`.
   * Không phải bao nhiêu lần σ — đây là trung bình của n lớp, không phải một lớp.
   */
  meanZScore: number | null;
  lecturerCount: number;
  /** Tổng sĩ số các lớp của khoa — mẫu số của tỷ lệ phản hồi. */
  totalClassSize: number;
  /** Tổng phiếu thu về, kể cả phiếu bị bộ lọc nhiễu loại. */
  responseCount: number;
  validResponseCount: number;
  /** Phiếu thu về chia tổng sĩ số, theo phần trăm. */
  responseRate: number;
  /** Phiếu hợp lệ chia phiếu thu về, theo phần trăm. */
  validResponseRate: number;
  warningSectionCount: number;
}

export interface NormalizedSection {
  courseSectionSurveyId: number;
  courseCode: string;
  courseName: string;
  sectionName: string;
  lecturerName: string;
  departmentName: string;
  facultyName: string;
  classSize: number;
  averageScore: number;
  zSchool: number | null;
  zFaculty: number | null;
  zDifference: number | null;
  /** Mã diễn giải, xem normalizationVerdictLabels. */
  verdict: string;
  /** Tổng phiếu thu về của lớp, kể cả phiếu bị bộ lọc nhiễu loại. */
  responseCount: number;
  validResponseCount: number;
  /** Phiếu thu về chia sĩ số lớp, theo phần trăm. */
  responseRate: number;
  /** Phiếu hợp lệ chia phiếu thu về, theo phần trăm. */
  validResponseRate: number;
}

/** Một mục của bộ câu hỏi trong ô chọn tính điểm theo mục. */
export interface NormalizationQuestionSection {
  sectionId: number;
  sectionName: string;
  /** Số câu được chấm điểm của mục: không đếm câu bẫy và câu tự nhập. */
  questionCount: number;
}

export interface SemesterSurveyNormalization {
  semesterSurveyId: number;
  templateName: string;
  semesterName: string;
  academicYearName: string;
  schoolSectionCount: number;
  schoolAverageScore: number;
  schoolStandardDeviation: number | null;
  groups: NormalizationGroup[];
  sections: NormalizedSection[];
  /** Các mục của bộ câu hỏi của đợt, theo thứ tự trên phiếu. */
  questionSections: NormalizationQuestionSection[];
  /** Mục đang dùng để tính điểm và Z-Score; null là toàn bộ bài khảo sát. */
  questionSectionId: number | null;
}

/** Nhãn tiếng Việt cho mã diễn giải, để không phơi mã ra màn hình. */
export const normalizationVerdictLabels: Record<string, string> = {
  CONCLUSION_FLIPS: 'Chuẩn hoá làm đổi kết luận rõ rệt',
  ABOVE_FACULTY: 'Trên mặt bằng khoa',
  BELOW_FACULTY: 'Thấp hơn mặt bằng khoa — theo dõi',
  NORMAL: 'Trong vùng bình thường',
  FACULTY_TOO_SMALL: 'Khoa quá ít lớp để chuẩn hoá',
};

/** Một dòng của bảng tổng hợp theo bộ môn. */
export interface DepartmentSummaryRow {
  facultyId: number | null;
  facultyName: string;
  departmentId: number | null;
  departmentName: string;
  sectionCount: number;
  lecturerCount: number;
  /** Tổng sĩ số các lớp của bộ môn — mẫu số của tỷ lệ phản hồi. */
  totalClassSize: number;
  /** Tổng phiếu thu về, kể cả phiếu bị bộ lọc nhiễu loại. */
  responseCount: number;
  validResponseCount: number;
  /** Phiếu thu về chia tổng sĩ số, theo phần trăm. */
  responseRate: number;
  /** Phiếu hợp lệ chia phiếu thu về, theo phần trăm. */
  validResponseRate: number;
  averageScore: number | null;
  warningSectionCount: number;
  /** Null khi bộ môn có ít hơn hai lớp. */
  standardDeviation: number | null;
  /** Mặt bằng bộ môn lệch mặt bằng toàn trường bao nhiêu lần sai số chuẩn σ/√n. */
  meanZScore: number | null;
  /** Mặt bằng bộ môn lệch mặt bằng khoa bao nhiêu lần sai số chuẩn σ/√n; null khi khoa quá ít lớp. */
  facultyMeanZScore: number | null;
}

export interface SemesterSurveyDepartmentSummary {
  semesterSurveyId: number;
  templateName: string;
  semesterName: string;
  academicYearName: string;
  /** Đã lọc theo phạm vi; trưởng bộ môn chỉ còn đúng dòng bộ môn mình. */
  rows: DepartmentSummaryRow[];
  /** Dòng tổng ở chân bảng, luôn tính trên toàn trường kể cả khi rows đã bị lọc. */
  schoolDepartmentCount: number;
  schoolSectionCount: number;
  schoolResponseCount: number;
  schoolAverageScore: number | null;
  schoolWarningCount: number;
}

/** Một dòng của bảng chẩn đoán học phần. */
export interface CourseDiagnosisRow {
  courseId: number;
  courseCode: string;
  courseName: string;
  departmentName: string;
  facultyName: string;
  sectionCount: number;
  lecturerCount: number;
  averageScore: number;
  minScore: number;
  maxScore: number;
  /** Cao nhất trừ thấp nhất. Học phần một lớp thì luôn bằng 0. */
  spread: number;
  weakestQuestionOrder: number | null;
  weakestQuestionScore: number | null;
  weakestQuestionText: string | null;
  /** Mã kết luận, xem courseDiagnosisLabels. */
  verdict: string;
  /** Tổng sĩ số các lớp của học phần — mẫu số của tỷ lệ phản hồi. */
  totalClassSize: number;
  /** Tổng phiếu thu về, kể cả phiếu bị bộ lọc nhiễu loại. */
  responseCount: number;
  validResponseCount: number;
  /** Phiếu thu về chia tổng sĩ số, theo phần trăm. */
  responseRate: number;
  /** Phiếu hợp lệ chia phiếu thu về, theo phần trăm. */
  validResponseRate: number;
  /** Mặt bằng học phần lệch mặt bằng toàn trường bao nhiêu lần sai số chuẩn σ/√n. */
  meanZScore: number | null;
  warningSectionCount: number;
  /** Mặt bằng học phần lệch mặt bằng khoa bao nhiêu lần sai số chuẩn σ/√n; null khi khoa quá ít lớp. */
  facultyMeanZScore: number | null;
}

export interface SemesterSurveyCourseDiagnosis {
  semesterSurveyId: number;
  templateName: string;
  semesterName: string;
  academicYearName: string;
  rows: CourseDiagnosisRow[];
}

export type SurveyAnalysisScopeType = 'faculty' | 'department' | 'course';

export interface SurveyScopeAnalysis {
  semesterSurveyId: number;
  scopeType: SurveyAnalysisScopeType;
  scopeId: number;
  scopeName: string;
  templateName: string;
  semesterName: string;
  academicYearName: string;
  sectionCount: number;
  totalClassSize: number;
  /** Chỉ đếm phiếu qua bộ lọc nhiễu. */
  responseCount: number;
  averageScore: number;
  questions: QuestionRating[];
  departments?: DepartmentSummaryRow[] | null;
  courses?: CourseDiagnosisRow[] | null;
  sections?: NormalizedSection[] | null;
}

export const courseDiagnosisLabels: Record<string, string> = {
  COURSE_ISSUE: 'Do học phần',
  LECTURER_VARIANCE: 'Do giảng viên',
  ALL_GOOD: 'Tốt đều',
  INCONCLUSIVE: 'Không có vấn đề rõ',
};

/** Giải nghĩa từng kết luận, hiện khi di chuột và trong phần chú thích. */
export const courseDiagnosisDescriptions: Record<string, string> = {
  COURSE_ISSUE:
    'Kể cả lớp cao điểm nhất cũng nằm ở mức cảnh báo. Mọi giảng viên dạy học phần này '
    + 'đều bị chấm thấp, nên vấn đề nằm ở bản thân học phần: nội dung, giáo trình hoặc '
    + 'cách tổ chức. Đổi giảng viên sẽ không giải quyết được.',
  LECTURER_VARIANCE:
    'Các lớp cùng học phần chấm chênh nhau nhiều. Cùng một nội dung mà lớp này hài lòng '
    + 'lớp kia không, nên khác biệt đến từ người dạy chứ không từ học phần.',
  ALL_GOOD:
    'Kể cả lớp thấp điểm nhất cũng đạt từ 4.00 trở lên. Cách dạy học phần này đang hiệu '
    + 'quả ở mọi lớp, nên xem xét nhân rộng.',
  INCONCLUSIVE:
    'Không rơi vào ba trường hợp trên: điểm không thấp đều, không tốt đều, các lớp cũng '
    + 'không chênh nhau nhiều. Học phần chạy bình thường.',
};

/**
 * Dải chỉ số gọn cho bảng điều khiển của trưởng bộ môn. Mỗi con số của bộ môn đi kèm
 * một con số toàn trường để so — mặt bằng luôn tính trên toàn bộ dữ liệu.
 */
export interface DepartmentDashboard {
  semesterSurveyId: number;
  templateName: string;
  semesterName: string;
  academicYearName: string;
  /** Rỗng khi người xem là quản trị. */
  departmentName: string | null;
  sectionCount: number;
  schoolSectionCount: number;
  completionRate: number;
  schoolCompletionRate: number;
  averageScore: number | null;
  schoolAverageScore: number | null;
  weakSectionCount: number;
  weakScoreThreshold: number;
}

/** Một giảng viên trong bảng tổng hợp giảng viên của đợt khảo sát. */
export interface LecturerOption {
  lecturerId: number;
  fullName: string;
  departmentName: string;
  facultyName: string;
  sectionCount: number;
  totalClassSize: number;
  responseCount: number;
  validResponseCount: number;
  /** Phiếu thu về chia tổng sĩ số, theo phần trăm. */
  responseRate: number;
  /** Phiếu hợp lệ chia phiếu thu về, theo phần trăm. */
  validResponseRate: number;
  averageScore: number | null;
  minScore: number | null;
  maxScore: number | null;
  warningSectionCount: number;
}

export interface LecturerSection {
  courseSectionSurveyId: number;
  courseCode: string;
  courseName: string;
  sectionName: string;
  classSize: number;
  /** Tổng phiếu thu về, kể cả phiếu bị bộ lọc nhiễu loại. */
  responseCount: number;
  validResponseCount: number;
  /** Phiếu thu về chia sĩ số, theo phần trăm. */
  responseRate: number;
  /** Phiếu hợp lệ chia phiếu thu về, theo phần trăm. */
  validResponseRate: number;
  averageScore: number;
  /** Trung bình mọi lớp cùng học phần, kể cả lớp người khác dạy. Null khi chỉ có một lớp. */
  courseAverageScore: number | null;
  differenceFromCourse: number | null;
  zSchool: number | null;
  /** Null khi khoa quá ít lớp để chuẩn hoá. */
  zFaculty: number | null;
  /** Null khi bộ môn quá ít lớp để chuẩn hoá. */
  zDepartment: number | null;
}

export interface LecturerReport {

  lecturerId: number;
  fullName: string;
  departmentName: string;
  facultyName: string;
  sectionCount: number;
  totalResponseCount: number;
  averageScore: number;
  sections: LecturerSection[];
}

/** Điểm trung bình toàn trường của một câu hỏi. */
export interface DashboardQuestionScore {
  questionOrder: number;
  questionText: string;
  averageScore: number;
  /** Số lớp có điểm câu này dưới ngưỡng cảnh báo. */
  sectionsBelowThreshold: number;
}

export interface DashboardFacultyScore {
  facultyId: number | null;
  facultyName: string;
  sectionCount: number;
  averageScore: number;
}

/**
 * Trạng thái phát hành kết quả của một đợt. Chưa phát hành thì trưởng bộ môn và
 * giảng viên không xem được số liệu của đợt, kể cả khi đã mở quyền vào module.
 */
export interface SurveyPublication {
  semesterSurveyId: number;
  isPublished: boolean;
  /** Lần phát hành / thu hồi gần nhất; null khi chưa từng bấm. */
  changedAt: string | null;
  changedByName: string;
  /** Đã qua thời gian thu phiếu — điều kiện để bấm phát hành. */
  hasEnded: boolean;
}

/** Một lần đổi cấu hình tính điểm hoặc cập nhật điểm, kèm nguyên bộ cấu hình lúc đó. */
export interface ScoringChange {
  id: number;
  /** CONFIG_UPDATED hoặc SCORES_RECALCULATED. */
  kind: string;
  semesterSurveyId: number | null;
  semesterSurveyName: string | null;
  minimumResponseRate: number;
  minimumValidRate: number;
  changedByName: string;
  changedAt: string;
}

export interface ScoringChangeFeed {
  /** Mốc mới nhất, kể cả sự kiện của chính người đang xem. */
  latestId: number;
  /** Cũ trước mới sau; không gồm sự kiện của chính người đang xem. */
  items: ScoringChange[];
}

export interface SemesterSurveyDashboard {
  semesterSurveyId: number;
  templateName: string;
  semesterName: string;
  academicYearName: string;
  sectionCount: number;
  /** Mọi lượt nộp, kể cả phiếu bị bộ lọc nhiễu loại. */
  totalResponseCount: number;
  /** Phiếu qua được bộ lọc — mẫu số của tiến độ và mọi số liệu chất lượng. */
  validResponseCount: number;
  /** Phiếu hợp lệ trên tổng sĩ số các lớp của đợt. */
  averageCompletionRate: number;
  /** Null khi chưa lớp nào thu được phiếu hợp lệ. */
  overallScore: number | null;
  scoredSectionCount: number;
  questions: DashboardQuestionScore[];
  /** Năm câu điểm thấp nhất, sắp từ thấp lên. */
  weakestQuestions: DashboardQuestionScore[];
  faculties: DashboardFacultyScore[];
  courseIssueCount: number;
  lecturerVarianceCount: number;
  /** Tổng sĩ số của mọi lớp trong đợt — mẫu số của tỷ lệ phản hồi. */
  totalClassSize: number;
  /** Số phiếu ĐÃ THU trên tổng sĩ số; `averageCompletionRate` chỉ đếm phiếu hợp lệ. */
  responseRate: number;
}

export interface RecalculateScoresResult {
  semesterSurveyId: number;
  updatedSectionCount: number;
  /** ISO 8601 */
  calculatedAt: string;
}

/** Kết quả bù bài khảo sát cho lớp thêm vào kỳ sau khi đợt đã tạo. */
/** Phạm vi lớp được phát phiếu. Khớp `SurveyScopeTypes` bên backend. */
export type SurveyScopeType = 'all' | 'faculty' | 'department' | 'section';

export interface AddSectionsToSemesterSurveyPayload {
  scopeType: SurveyScopeType;
  /** Mã khoa / bộ môn / lớp học phần. Bỏ trống khi scopeType là 'all'. */
  scopeId: number | null;
  /** ISO 8601 (UTC) */
  startTime: string;
  endTime: string;
}

export interface ClearSectionSurveyResponsesResult {
  courseSectionSurveyId: number;
  courseCode: string;
  courseName: string;
  sectionName: string;
  /** Số phiếu vừa bị huỷ, tính cả phiếu đã bị bộ lọc nhiễu loại. */
  clearedResponseCount: number;
  /** Số dòng điểm từng câu bị xoá theo. */
  clearedQuestionScoreCount: number;
  clearedAt: string;
}

export interface SurveyScopePreview {
  scopeType: SurveyScopeType;
  scopeId: number | null;
  /** Số lớp của kỳ thuộc phạm vi này. */
  scopeSectionCount: number;
  /** Trong đó bao nhiêu lớp chưa có bài trong đợt đang xét. */
  newSectionCount: number;
}

export interface AddSectionsToSemesterSurveyResult {
  semesterSurveyId: number;
  surveyName: string;
  /** Số lớp vừa được tạo bài khảo sát. */
  createdSectionCount: number;
  /** Lớp thuộc phạm vi nhưng đã có bài từ trước nên bỏ qua. */
  skippedSectionCount: number;
  startTime: string;
  endTime: string;
}

/** Một cột C của bảng thống kê, sinh theo bộ câu hỏi của đợt. */
export interface StatisticsQuestionColumn {
  questionId: number;
  order: number;
  questionText: string;
}

export interface SectionQuestionScore {
  questionId: number;
  averageScore: number;
  answerCount: number;
}

/** Một dòng của bảng dữ liệu khảo sát: toàn bộ số liệu của một lớp học phần. */
export interface SectionStatisticsRow {
  courseSectionId: number;
  courseSectionSurveyId: number;
  courseCode: string;
  courseName: string;
  sectionName: string;
  departmentName: string;
  lecturerName: string;
  classSize: number;
  /** Tổng lượt nộp, tính cả phiếu bị lọc. */
  totalResponseCount: number;
  validResponseCount: number;
  invalidResponseCount: number;
  completionRate: number;
  /** Ảnh chụp lần bấm tính gần nhất; null là chưa tính lần nào. */
  averageScore: number | null;
  /** ISO 8601 */
  scoreCalculatedAt: string | null;
  openCommentCount: number;
  weakestQuestionId: number | null;
  weakestQuestionScore: number | null;
  questionScores: SectionQuestionScore[];
  /** Khoa/viện suy từ bộ môn; rỗng khi bộ môn chưa thuộc khoa nào. */
  facultyName: string;
}

export interface SemesterSurveyStatistics {
  semesterSurveyId: number;
  templateName: string;
  semesterName: string;
  academicYearName: string;
  /** ISO 8601, null là chưa lớp nào được tính. */
  lastCalculatedAt: string | null;
  /** Số phiếu về sau lần tính gần nhất. Khác 0 nghĩa là số đang xem đã cũ. */
  responsesSinceLastCalculation: number;
  questionColumns: StatisticsQuestionColumn[];
  /**
   * Số câu bẫy của bộ. Câu bẫy không được đánh số nên bảng không nhảy cóc số câu,
   * nhưng vẫn phải nói ra để người xem biết bộ dài hơn số cột ở đây.
   */
  attentionCheckCount: number;
  rows: SectionStatisticsRow[];
}

export const surveyApi = {
  answerScales: () => apiRequest<AnswerScale[]>('/api/surveys/answer-scales'),
  createAnswerScale: (scale: SaveAnswerScalePayload) =>
    csrfRequest<AnswerScale>('/api/surveys/answer-scales', 'POST', scale),
  updateAnswerScale: (answerScaleId: number, scale: SaveAnswerScalePayload) =>
    csrfRequest<AnswerScale>(`/api/surveys/answer-scales/${answerScaleId}`, 'PUT', scale),
  deleteAnswerScale: (answerScaleId: number) =>
    csrfRequest<boolean>(`/api/surveys/answer-scales/${answerScaleId}`, 'DELETE'),

  templates: () => apiRequest<SurveyTemplate[]>('/api/surveys/templates'),
  createTemplate: (template: SaveSurveyTemplatePayload) =>
    csrfRequest<SurveyTemplate>('/api/surveys/templates', 'POST', template),
  updateTemplate: (surveyTemplateId: number, template: SaveSurveyTemplatePayload) =>
    csrfRequest<SurveyTemplate>(`/api/surveys/templates/${surveyTemplateId}`, 'PUT', template),
  deleteTemplate: (surveyTemplateId: number) =>
    csrfRequest<boolean>(`/api/surveys/templates/${surveyTemplateId}`, 'DELETE'),

  /** Bảng dữ liệu khảo sát của một đợt: mỗi dòng là một lớp học phần. */
  semesterSurveyStatistics: (semesterSurveyId: number) =>
    apiRequest<SemesterSurveyStatistics>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/statistics`,
    ),
  /** Chuẩn hoá điểm bằng Z-score, so toàn đợt và so trong khoa/viện. */
  /**
   * Chuẩn hoá điểm (Z-Score) của đợt. Truyền `questionSectionId` thì điểm của mỗi lớp
   * chỉ gộp các câu thuộc mục đó; bỏ trống là toàn bộ bài khảo sát.
   */
  semesterSurveyNormalization: (semesterSurveyId: number, questionSectionId?: number | null) =>
    apiRequest<SemesterSurveyNormalization>(
      questionSectionId
        ? `/api/surveys/semester-surveys/${semesterSurveyId}/normalization?questionSectionId=${questionSectionId}`
        : `/api/surveys/semester-surveys/${semesterSurveyId}/normalization`,
    ),
  /** Tổng hợp theo bộ môn, phục vụ trưởng khoa. */
  semesterSurveyDepartmentSummary: (semesterSurveyId: number) =>
    apiRequest<SemesterSurveyDepartmentSummary>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/department-summary`,
    ),
  /** Tổng quan toàn trường của một đợt khảo sát. */
  semesterSurveyDashboard: (semesterSurveyId: number) =>
    apiRequest<SemesterSurveyDashboard>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/dashboard`,
    ),
  /** So các lớp trong cùng một học phần để tách lỗi học phần khỏi lỗi giảng viên. */
  semesterSurveyCourseDiagnosis: (semesterSurveyId: number) =>
    apiRequest<SemesterSurveyCourseDiagnosis>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/course-diagnosis`,
    ),
  semesterSurveyScopeAnalysis: (
    semesterSurveyId: number,
    scopeType: SurveyAnalysisScopeType,
    scopeId: number,
  ) => {
    const query = new URLSearchParams({ scopeType, scopeId: String(scopeId) });
    return apiRequest<SurveyScopeAnalysis>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/scope-analysis?${query.toString()}`,
    );
  },
  /** Danh sách giảng viên có lớp trong đợt, dùng cho ô chọn. */
  semesterSurveyLecturers: (semesterSurveyId: number) =>
    apiRequest<LecturerOption[]>(`/api/surveys/semester-surveys/${semesterSurveyId}/lecturers`)
      .then((rows) => rows.map((row) => {
        const totalClassSize = Number.isFinite(row.totalClassSize) ? row.totalClassSize : 0;
        const responseCount = Number.isFinite(row.responseCount) ? row.responseCount : 0;
        const validResponseCount = Number.isFinite(row.validResponseCount) ? row.validResponseCount : 0;
        return {
          ...row,
          totalClassSize,
          responseCount,
          validResponseCount,
          responseRate: Number.isFinite(row.responseRate)
            ? row.responseRate
            : totalClassSize > 0
              ? (responseCount / totalClassSize) * 100
              : 0,
          validResponseRate: Number.isFinite(row.validResponseRate)
            ? row.validResponseRate
            : responseCount > 0
              ? (validResponseCount / responseCount) * 100
              : 0,
          averageScore: typeof row.averageScore === 'number' && Number.isFinite(row.averageScore)
            ? row.averageScore
            : null,
          minScore: typeof row.minScore === 'number' && Number.isFinite(row.minScore)
            ? row.minScore
            : null,
          maxScore: typeof row.maxScore === 'number' && Number.isFinite(row.maxScore)
            ? row.maxScore
            : null,
          warningSectionCount: Number.isFinite(row.warningSectionCount)
            ? row.warningSectionCount
            : 0,
        };
      })),
  /** Báo cáo cá nhân của đúng một giảng viên trong đợt. */
  lecturerReport: (semesterSurveyId: number, lecturerId: number) =>
    apiRequest<LecturerReport>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/lecturers/${lecturerId}`,
    ),
  /** Tính lại điểm trung bình cho mọi lớp của đợt. Chỉ chạy khi bấm nút. */
  recalculateScores: (semesterSurveyId: number) =>
    csrfRequest<RecalculateScoresResult>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/recalculate-scores`,
      'POST',
    ),

  /** Bỏ trống semesterId để lấy toàn bộ đợt khảo sát. */
  /** Dải chỉ số gọn cho bảng điều khiển của trưởng bộ môn. */
  departmentDashboard: (semesterSurveyId: number) =>
    apiRequest<DepartmentDashboard>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/department-dashboard`,
    ),

  semesterSurveys: (semesterId?: number, signal?: AbortSignal) =>
    apiRequest<SemesterSurvey[]>(
      semesterId === undefined
        ? '/api/surveys/semester-surveys'
        : `/api/surveys/semester-surveys?semesterId=${semesterId}`,
      { signal },
    ),
  createSemesterSurvey: (survey: CreateSemesterSurveyPayload) =>
    csrfRequest<SemesterSurvey>('/api/surveys/semester-surveys', 'POST', survey),
  updateSemesterSurvey: (
    semesterSurveyId: number,
    survey: UpdateSemesterSurveyPayload,
  ) =>
    csrfRequest<SemesterSurvey>(
      `/api/surveys/semester-surveys/${semesterSurveyId}`,
      'PUT',
      survey,
    ),
  deleteSemesterSurvey: (semesterSurveyId: number) =>
    csrfRequest<boolean>(`/api/surveys/semester-surveys/${semesterSurveyId}`, 'DELETE'),
  /**
   * Trạng thái phát hành kết quả của một đợt. Ai cũng đọc được để giao diện nói rõ
   * vì sao chưa có số liệu; chỉ quản trị mới đổi được.
   */
  surveyPublication: (semesterSurveyId: number) =>
    apiRequest<SurveyPublication>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/publication`,
    ),
  setSurveyPublication: (semesterSurveyId: number, publish: boolean) =>
    csrfRequest<SurveyPublication>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/publication`,
      'PUT',
      { publish },
    ),
  /** Hai vòng lọc lớp được tính điểm, dùng chung cho mọi trang báo cáo. */
  scoringThresholds: () =>
    apiRequest<ScoringThresholds>('/api/surveys/scoring-thresholds'),
  /** Chỉ quản trị mới đổi được; server tự chặn các vai trò khác. */
  updateScoringThresholds: (thresholds: ScoringThresholds) =>
    csrfRequest<ScoringThresholds>('/api/surveys/scoring-thresholds', 'PUT', thresholds),
  /**
   * Các lần đổi cấu hình / cập nhật điểm do NGƯỜI KHÁC làm sau mốc `afterId`.
   * Không truyền `afterId` thì chỉ nhận mốc mới nhất để bắt đầu theo dõi.
   */
  scoringChanges: (afterId?: number) =>
    apiRequest<ScoringChangeFeed>(
      afterId === undefined
        ? '/api/surveys/scoring-changes'
        : `/api/surveys/scoring-changes?afterId=${afterId}`,
    ),
  /** Đếm trước số lớp của một phạm vi, tính ở server để khớp đúng lúc tạo thật. */
  previewSectionScope: (params: {
    semesterId: number;
    scopeType: SurveyScopeType;
    scopeId: number | null;
    semesterSurveyId?: number;
  }) => {
    const searchParams = new URLSearchParams({
      semesterId: String(params.semesterId),
      scopeType: params.scopeType,
    });
    if (params.scopeId !== null) searchParams.set('scopeId', String(params.scopeId));
    if (params.semesterSurveyId !== undefined) {
      searchParams.set('semesterSurveyId', String(params.semesterSurveyId));
    }
    return apiRequest<SurveyScopePreview>(
      `/api/surveys/section-scope-preview?${searchParams.toString()}`,
    );
  },

  /** Bổ sung lớp vào đợt đã có theo phạm vi tự chọn. Lớp đã có bài thì bỏ qua. */
  addSectionsToSemesterSurvey: (
    semesterSurveyId: number,
    payload: AddSectionsToSemesterSurveyPayload,
  ) =>
    csrfRequest<AddSectionsToSemesterSurveyResult>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/add-sections`,
      'POST',
      payload,
    ),

  courseSectionSurveys: (semesterSurveyId: number, signal?: AbortSignal) =>
    apiRequest<CourseSectionSurvey[]>(
      `/api/surveys/semester-surveys/${semesterSurveyId}/sections`,
      { signal },
    ),
  allCourseSectionSurveys: (
    params?: { semesterSurveyId?: number; semesterId?: number },
    signal?: AbortSignal,
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.semesterSurveyId !== undefined) {
      searchParams.set('semesterSurveyId', String(params.semesterSurveyId));
    }
    if (params?.semesterId !== undefined) {
      searchParams.set('semesterId', String(params.semesterId));
    }
    const qs = searchParams.toString();
    return apiRequest<CourseSectionSurvey[]>(
      qs ? `/api/surveys/course-section-surveys?${qs}` : '/api/surveys/course-section-surveys',
      { signal },
    );
  },
  courseSectionSurvey: (courseSectionSurveyId: number) =>
    apiRequest<CourseSectionSurvey>(
      `/api/surveys/course-section-surveys/${courseSectionSurveyId}`,
    ),
  surveyResponses: (courseSectionSurveyId: number) =>
    apiRequest<SurveyResponseSummary[]>(
      `/api/surveys/course-section-surveys/${courseSectionSurveyId}/responses`,
    ),
  surveyResponse: (responseId: number) =>
    apiRequest<SurveyResponseDetail>(`/api/surveys/responses/${responseId}`),
  /** Huỷ toàn bộ phiếu của một lớp để lớp làm lại. Xoá mềm, có lưu vết. */
  clearSectionSurveyResponses: (courseSectionSurveyId: number) =>
    csrfRequest<ClearSectionSurveyResponsesResult>(
      `/api/surveys/course-section-surveys/${courseSectionSurveyId}/clear-responses`,
      'POST',
    ),
};

/** Phiếu của sinh viên: mở bằng link hoặc QR nên không cần đăng nhập. */
export const publicSurveyApi = {
  survey: (linkToken: string) =>
    apiRequest<PublicSurvey>(`/api/public/surveys/${encodeURIComponent(linkToken)}`),
  /**
   * Bấm "Bắt đầu làm bài". Server phát vé đã ký tại đúng thời điểm này để lát
   * nữa biết bài làm mất bao lâu. Gọi lại bao nhiêu lần cũng được, mỗi lần nhận
   * một vé mới với mốc thời gian mới.
   */
  start: (linkToken: string) =>
    apiRequest<{ startTicket: string }>(
      `/api/public/surveys/${encodeURIComponent(linkToken)}/start`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    ),
  submit: (linkToken: string, body: SubmitSurveyResponsePayload) =>
    apiRequest<{ responseId: number; score: number; submittedAt: string }>(
      `/api/public/surveys/${encodeURIComponent(linkToken)}/responses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
};

export interface CreateSemesterSurveyPayload {
  /** Tên đợt do quản trị đặt. Bắt buộc, backend trả SURVEY_SEMESTER_SURVEY_NAME_REQUIRED nếu trống. */
  surveyName: string;
  /** Phạm vi lớp được phát phiếu. Bỏ trống thì backend hiểu là cả kỳ. */
  scopeType: SurveyScopeType;
  /** Mã khoa / bộ môn / lớp học phần. Bỏ trống khi scopeType là 'all'. */
  scopeId: number | null;
  semesterId: number;
  surveyTemplateId: number;
  /** ISO 8601 (UTC) */
  startTime: string;
  endTime: string;
}

export interface UpdateSemesterSurveyPayload {
  surveyName: string;
  /** ISO 8601 (UTC). Mọi lịch lớp phải nằm trọn trong khoảng này. */
  startTime: string;
  endTime: string;
}

export interface SubmitSurveyResponsePayload {
  /** `answerValue`: số mức đã chọn dạng chuỗi, hoặc nội dung tự nhập. */
  answers: { questionId: number; answerValue: string }[];
  additionalComments: string | null;
  /**
   * Vé nhận được lúc bấm "Bắt đầu làm bài". Thiếu vé thì server vẫn nhận phiếu
   * nhưng coi như làm bài 0 giây.
   */
  startTicket: string | null;
}

/**
 * Tải tệp Excel danh sách lớp kèm ảnh mã QR của một đợt.
 *
 * Server dựng tệp và trả về nguyên khối, trình duyệt chỉ nhận rồi lưu — trước đây
 * chỗ này sinh QR và nén workbook ngay trên luồng chính nên đợt vài nghìn lớp là
 * treo tab.
 *
 * Không dùng `apiRequest` vì phần thân là nhị phân chứ không phải JSON.
 */
export async function downloadCourseSurveyQrExcel(semesterSurveyId: number): Promise<{
  blob: Blob;
  fileName: string;
}> {
  const response = await fetch(
    `/api/surveys/semester-surveys/${semesterSurveyId}/qr-export`,
    { credentials: 'include' },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { errorCode?: string };
    throw new ApiError(response.status, body.errorCode ?? 'API_REQUEST_FAILED');
  }

  // Tên tệp do server đặt, đọc từ Content-Disposition; hụt thì dùng tên dự phòng.
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const fileName = match ? decodeURIComponent(match[1]) : 'ma-qr-dot-khao-sat.xlsx';

  return { blob: await response.blob(), fileName };
}

/** Link sinh viên dùng để vào làm bài của một lớp học phần. */
export function surveyLinkOf(linkToken: string): string {
  return `${window.location.origin}/survey/${linkToken}`;
}


/** Thông báo tiếng Việt cho mã lỗi của API bộ câu hỏi khảo sát. */
export const surveyErrorMessages: Record<string, string> = {
  SURVEY_INVALID_REQUEST: 'Dữ liệu gửi lên không hợp lệ.',
  SURVEY_ANSWER_SCALE_NOT_FOUND: 'Không tìm thấy thang trả lời.',
  SURVEY_ANSWER_SCALE_NAME_REQUIRED: 'Thiếu tên thang trả lời.',
  SURVEY_ANSWER_SCALE_NAME_EXISTS: 'Tên thang trả lời đã tồn tại.',
  SURVEY_ANSWER_SCALE_OPTIONS_INVALID: 'Thang trả lời cần từ 2 đến 5 mức, mỗi mức một giá trị 1-5.',
  SURVEY_ANSWER_SCALE_OPTION_TEXT_REQUIRED: 'Thiếu nhãn hiển thị của một mức trả lời.',
  SURVEY_ANSWER_SCALE_IN_USE: 'Thang trả lời đang được câu hỏi sử dụng.',
  SURVEY_ANSWER_SCALE_KIND_INVALID: 'Loại thang trả lời không hợp lệ.',
  SURVEY_ANSWER_SCALE_TEXT_HAS_OPTIONS: 'Thang tự nhập không được có mức trả lời nào.',
  SURVEY_ANSWER_SCALE_KIND_LOCKED:
    'Không đổi được loại thang vì đã có câu hỏi dùng thang này.',
  SURVEY_QUESTION_SCALE_NOT_FOUND: 'Một câu hỏi đang trỏ tới mã thang trả lời không tồn tại.',
  SURVEY_TEMPLATE_NOT_FOUND: 'Không tìm thấy bộ câu hỏi.',
  SURVEY_TEMPLATE_NAME_REQUIRED: 'Thiếu tên bộ câu hỏi.',
  SURVEY_TEMPLATE_NAME_EXISTS: 'Tên bộ câu hỏi đã tồn tại.',
  SURVEY_TEMPLATE_QUESTIONS_REQUIRED: 'Bộ câu hỏi cần ít nhất một câu hỏi.',
  SURVEY_TEMPLATE_IN_USE:
    'Bộ câu hỏi đã thu phiếu nên chỉ sửa được nội dung chữ: không thêm, bớt, đổi chỗ câu hỏi hay đổi thang trả lời.',
  SURVEY_TEMPLATE_SECTIONS_REQUIRED: 'Bộ câu hỏi cần ít nhất một mục.',
  SURVEY_TEMPLATE_TOO_MANY_SECTIONS: `Mỗi bộ câu hỏi chỉ được tối đa ${maximumSectionsPerTemplate} mục.`,
  SURVEY_SECTION_NAME_REQUIRED: 'Thiếu tên mục.',
  SURVEY_SECTION_NAME_EXISTS: 'Hai mục trong cùng một bộ không được trùng tên.',
  SURVEY_SECTION_NOT_FOUND: 'Một mục gửi lên không thuộc bộ câu hỏi này.',
  SURVEY_SECTION_EMPTY: 'Mỗi mục phải có ít nhất một câu hỏi.',
  SURVEY_QUESTION_SECTION_INVALID: 'Một câu hỏi đang trỏ tới mục không tồn tại.',
  SURVEY_SECTION_QUESTIONS_NOT_CONTIGUOUS:
    'Các câu hỏi cùng một mục phải nằm liền nhau, không được xen kẽ với mục khác.',
  SURVEY_SEMESTER_NOT_FOUND: 'Không tìm thấy học kỳ.',
  SURVEY_SEMESTER_HAS_NO_SECTIONS: 'Học kỳ này chưa có lớp học phần nào để tạo bài khảo sát.',
  SURVEY_SCHEDULE_INVALID: 'Thời gian đóng phải sau thời gian mở.',
  SURVEY_SEMESTER_SURVEY_SCHEDULE_EXCLUDES_SECTIONS:
    'Không thể lưu vì lịch tổng mới không bao trọn thời gian của một hoặc nhiều lớp học phần trong đợt.',
  SURVEY_SECTION_SCHEDULE_OUTSIDE_SEMESTER_SURVEY:
    'Thời gian của lớp học phần phải nằm trọn trong thời gian mở và đóng của đợt khảo sát.',
  SURVEY_SEMESTER_SURVEY_NOT_FOUND: 'Không tìm thấy đợt khảo sát.',
  SURVEY_RESULTS_NOT_PUBLISHED:
    'Kết quả của đợt khảo sát này chưa được phát hành. Quản trị sẽ phát hành sau khi đợt kết thúc.',
  SURVEY_NOT_ENDED:
    'Đợt khảo sát chưa kết thúc nên chưa phát hành kết quả được.',
  SURVEY_SEMESTER_SURVEY_NAME_REQUIRED: 'Vui lòng đặt tên cho bài khảo sát.',
  SURVEY_SEMESTER_SURVEY_HAS_RESPONSES: 'Đợt khảo sát đã có phiếu trả lời nên không xóa được.',
  SURVEY_SCOPE_TYPE_UNSUPPORTED: 'Kiểu phạm vi không hợp lệ.',
  SURVEY_SCOPE_ID_REQUIRED: 'Vui lòng chọn đơn vị cho phạm vi đã chọn.',
  SURVEY_SCOPE_HAS_NO_SECTIONS: 'Phạm vi này không có lớp học phần nào trong học kỳ đã chọn.',
  SURVEY_SCOPE_SECTIONS_ALREADY_ADDED:
    'Mọi lớp của phạm vi này đều đã có bài khảo sát trong đợt.',
  SURVEY_SECTION_SURVEY_NOT_FOUND: 'Không tìm thấy bài khảo sát của lớp học phần.',
  SURVEY_SECTION_SURVEY_HAS_NO_RESPONSES: 'Lớp này chưa có phiếu nào nên không có gì để huỷ.',
  SURVEY_RESPONSE_NOT_FOUND: 'Không tìm thấy phiếu trả lời.',
  SURVEY_LINK_NOT_FOUND: 'Đường dẫn khảo sát không tồn tại.',
  SURVEY_LINK_NOT_OPEN: 'Bài khảo sát chưa mở hoặc đã hết hạn.',
  SURVEY_LINK_NOT_STARTED: 'Bài khảo sát chưa tới thời gian mở. Vui lòng quay lại đúng khung giờ ghi trên thông báo của lớp.',
  SURVEY_LINK_EXPIRED: 'Bài khảo sát đã hết hạn nộp phiếu. Đường dẫn này không còn nhận thêm câu trả lời.',
  SURVEY_CLASS_FULL: 'Lớp đã thu đủ số phiếu theo sĩ số nên không nhận thêm. Nếu bạn chưa làm bài, vui lòng báo giảng viên phụ trách lớp.',
  SURVEY_ANSWERS_INCOMPLETE: 'Vui lòng trả lời đầy đủ tất cả câu hỏi.',
  SURVEY_ANSWER_VALUE_INVALID: 'Mức đánh giá không hợp lệ.',
  SURVEY_ANSWER_TEXT_TOO_LONG: 'Câu trả lời tự nhập không được vượt quá 2000 ký tự.',
  SURVEY_COMMENTS_TOO_LONG: 'Ý kiến khác không được vượt quá 1000 ký tự.',
  AUTH_CSRF_INVALID: 'Phiên bảo mật đã thay đổi. Vui lòng tải lại trang.',
};

export function surveyErrorMessage(errorCode: string | null | undefined): string {
  return surveyErrorMessages[errorCode ?? ''] ?? 'Không thể kết nối tới máy chủ.';
}
