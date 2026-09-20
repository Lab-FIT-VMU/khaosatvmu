// ---------------------------------------------------------------------------
// DANH MỤC ĐÀO TẠO
// Tên trường và tính nullable khớp 1-1 với cột của bảng tương ứng trong dtb.md.
// ---------------------------------------------------------------------------

/** Bảng "Faculties" */
export interface Faculty {
  facultyId: number;
  facultyName: string;
}

/** Bảng "Departments" */
export interface Department {
  departmentId: number;
  departmentName: string;
  facultyId: number | null;
}

/** Bảng "Lecturers" */
export interface Lecturer {
  lecturerId: number;
  fullName: string;
  departmentId: number | null;
  facultyId: number | null;
  email: string | null;
  phoneNumber: string | null;
  positionId: number | null;
}

/** Bảng "Positions". Chức vụ của giảng viên. */
export interface Position {
  positionId: number;
  positionName: string;
}

/** Bảng "Majors" */
export interface Major {
  majorId: number;
  majorName: string;
  facultyId: number;
}

/** Bảng "Curricula" */
export interface Curriculum {
  curriculumId: number;
  majorId: number;
  totalCredits: number;
  requiredCredits: number;
  minElectiveCredits: number;
}

/** Bảng "CurriculumCourses" */
export interface CurriculumCourse {
  id: number;
  curriculumId: number;
  courseId: number;
  semesterOrder: number;
}

/** Cột "Courses"."CourseType" */
export type CourseType = 'Required' | 'Elective';

/** Bảng "Courses" */
export interface Course {
  courseId: number;
  courseCode: string;
  courseName: string;
  credits: number;
  /**
   * Null khi chưa xác định bắt buộc hay tự chọn — học phần tạo tự động lúc
   * import lớp học phần rơi vào trường hợp này, quản trị điền sau.
   */
  courseType: CourseType | null;
  departmentId: number | null;
  facultyId: number | null;
  prerequisiteCourseId: number | null;
}

/** Bảng "Semesters" */
export interface Semester {
  semesterId: number;
  semesterName: string;
  academicYearId: number;
}

/** Bảng "AcademicYears", kèm học kỳ để dựng cây bên trái trang lớp học phần. */
export interface AcademicYear {
  academicYearId: number;
  academicYearName: string;
  semesters: Semester[];
}

/** Bảng "CourseSections" */
export interface CourseSection {
  courseSectionId: number;
  courseId: number;
  semesterId: number;
  /**
   * Null khi tệp import không có email để xác định giảng viên; khi đó tên đọc
   * được nằm ở unidentifiedLecturerName. Hai trường này loại trừ nhau.
   */
  lecturerId: number | null;
  sectionName: string;
  classSize: number;
  /** Tên giảng viên chưa gắn được vào bảng "Lecturers" vì thiếu email. */
  unidentifiedLecturerName: string | null;
  /**
   * Tên người dạy do API gửi kèm. Đừng tra lại từ danh sách giảng viên: danh sách đó
   * đã bị lọc theo phạm vi người xem nên lớp do giảng viên bộ môn khác dạy hộ sẽ
   * không tra ra tên.
   */
  lecturerName: string | null;
  lecturerEmail: string | null;
}

export interface Criterion {
  id: string;
  category: 'Học phần' | 'Chương trình đào tạo';
  groupName: string; // e.g., "Nội dung giảng dạy", "Đội ngũ giảng viên", "CSVC"
  code: string;
  question: string;
  weight: number;
  status: 'Kích hoạt' | 'Tạm ẩn';
}

/**
 * Số mục tối đa của một bộ câu hỏi, tên mục đặt tuỳ ý. Số câu thì không giới hạn.
 * Phải trùng `SurveyRules.MaximumSectionsPerTemplate` bên backend.
 */
export const maximumSectionsPerTemplate = 3;

/** Số mức tối đa của một thang trả lời ("AnswerScaleOptions"."Value" CHECK 1..5). */
export const maximumAnswerScaleOptions = 5;

/** Độ dài tối đa của câu trả lời tự nhập ("SurveyResponseAnswers"."AnswerValue"). */
export const maximumTextAnswerLength = 2000;

/** Bảng "AnswerScaleOptions" */
export interface AnswerScaleOption {
  answerScaleOptionId: number;
  answerScaleId: number;
  /** 1..5 */
  value: number;
  displayText: string;
}

/**
 * Loại thang trả lời ("AnswerScales"."ScaleKind").
 * - `Options`: có sẵn các mức chọn (Mức độ hài lòng, Có/Không, Phần trăm...).
 * - `Text`: người trả lời tự nhập chữ, không có mức nào.
 */
export type AnswerScaleKind = 'Options' | 'Text';

/** Bảng "AnswerScales", kèm các mức trả lời để hiển thị trong một lần gọi. */
export interface AnswerScale {
  answerScaleId: number;
  answerScaleName: string;
  scaleKind: AnswerScaleKind;
  /** Rỗng với thang loại `Text`. */
  options: AnswerScaleOption[];
}

/** Bảng "SurveyQuestions". Thang trả lời gắn ở từng câu, không gắn cho cả bộ. */
/** Bảng "SurveyQuestionSections": mục chia nhóm câu hỏi, thuộc riêng một bộ. */
export interface SurveyQuestionSection {
  sectionId: number;
  sectionName: string;
}

export interface SurveyQuestion {
  questionId: number;
  surveyTemplateId: number;
  /** Mục chứa câu này; mọi câu đều thuộc một mục, kể cả câu bẫy. */
  sectionId: number;
  questionText: string;
  answerScaleId: number;
  /**
   * Mức bắt buộc của câu bẫy độ tập trung; null là câu hỏi bình thường.
   * Chỉ có ở màn quản trị — phiếu sinh viên cố ý không nhận trường này.
   */
  attentionCheckValue: number | null;
}

/** Bảng "SurveyTemplates", kèm mục và câu hỏi của bộ. */
export interface SurveyTemplate {
  surveyTemplateId: number;
  templateName: string;
  /** ISO 8601 */
  createdAt: string;
  /** Xếp theo thứ tự hiển thị, tức theo vị trí câu đầu tiên của từng mục. */
  sections: SurveyQuestionSection[];
  questions: SurveyQuestion[];
  /**
   * Bộ đã thu được phiếu chưa. Đã có thì chỉ sửa được chữ: thêm, bớt hay đổi chỗ
   * câu hỏi làm nội dung dịch sang câu khác trong khi phiếu cũ vẫn trỏ câu cũ.
   */
  hasResponses: boolean;
}

/** Bảng "SemesterSurveys", kèm số lớp và số phiếu đã thu của đợt. */
export interface SemesterSurvey {
  semesterSurveyId: number;
  /** Tên đợt do quản trị đặt lúc tạo. Khác `templateName` là tên bộ câu hỏi. */
  surveyName: string;
  semesterId: number;
  semesterName: string;
  academicYearName: string;
  surveyTemplateId: number;
  templateName: string;
  questionCount: number;
  /** ISO 8601 */
  createdAt: string;
  /** Lịch tổng của đợt; mọi lịch lớp phải nằm trọn trong khoảng này. */
  startTime: string;
  endTime: string;
  sectionSurveyCount: number;
  responseCount: number;
  /** Lớp của kỳ chưa có bài khảo sát trong đợt, do được thêm vào sau lúc tạo đợt. */
  missingSectionCount: number;
  /** Hình thức phiếu đang lưu; null là dùng mẫu mặc định. */
  formConfig: SurveyFormConfig | null;
}

/** Bảng "CourseSectionSurveys": bài khảo sát riêng của một lớp học phần. */
export interface CourseSectionSurvey {
  courseSectionSurveyId: number;
  semesterSurveyId: number;
  courseSectionId: number;
  /** Dùng để dựng link và mã QR riêng cho lớp. */
  linkToken: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  courseName: string;
  sectionName: string;
  lecturerName: string;
  /** Bộ môn của lớp: theo học phần, thiếu thì lấy của giảng viên. */
  departmentName: string;
  /** Khoa của lớp: theo học phần, rồi khoa của bộ môn, rồi của giảng viên. */
  facultyName: string;
  classSize: number;
  /** Mọi lượt nộp, kể cả phiếu bị bộ lọc nhiễu loại. */
  responseCount: number;
  /** Số phiếu qua được bộ lọc — phần duy nhất được tính vào tiến độ. */
  validResponseCount: number;
  /** Số phiếu bị bộ lọc loại. */
  invalidResponseCount: number;
}

/** Số câu đã chọn ở một mức trả lời trong cùng một phiếu. */
export interface SurveyResponseValueCount {
  value: number;
  displayText: string;
  count: number;
}

/** Một dòng trong danh sách phiếu trả lời của bài khảo sát một lớp học phần. */
export interface SurveyResponseSummary {
  responseId: number;
  courseSectionSurveyId: number;
  /** ISO 8601 */
  submittedAt: string;
  score: number;
  additionalComments: string | null;
  answerCount: number;
  valueCounts: SurveyResponseValueCount[];
  /** Phiếu có qua bộ lọc nhiễu không. Phiếu bị lọc vẫn tính là một lượt nộp. */
  isValid: boolean;
  /** Các mã lý do bị lọc ngăn cách dấu phẩy; null khi phiếu hợp lệ. */
  rejectionReasons: string | null;
}

/** Nhãn tiếng Việt của mã lý do lọc nhiễu, để không phơi mã ra màn hình. */
export const rejectionReasonLabels: Record<string, string> = {
  TOO_FAST: 'Làm bài quá nhanh',
  SINGLE_ANSWER: 'Chọn cùng một mức cho mọi câu',
  ATTENTION_CHECK_FAILED: 'Sai câu kiểm tra độ tập trung',
};

/** Đổi chuỗi mã lý do thành danh sách nhãn tiếng Việt. */
export function rejectionReasonTexts(reasons: string | null): string[] {
  if (!reasons) return [];
  return reasons
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0)
    .map((code) => rejectionReasonLabels[code] ?? code);
}

export interface SurveyResponseAnswer {
  questionId: number;
  questionText: string;
  answerScaleId: number;
  scaleKind: AnswerScaleKind;
  /** Giá trị thô: số mức đã chọn với thang `Options`, nội dung gõ với thang `Text`. */
  answerValue: string;
  /** Chỉ có giá trị với câu thuộc thang `Options`. */
  selectedValue: number | null;
  selectedText: string;
}

/** Toàn bộ nội dung một phiếu trả lời, dùng cho modal chỉ xem. */
export interface SurveyResponseDetail {
  responseId: number;
  courseSectionSurveyId: number;
  submittedAt: string;
  score: number;
  additionalComments: string | null;
  templateName: string;
  courseCode: string;
  courseName: string;
  sectionName: string;
  lecturerName: string;
  /** Các thang mà bộ câu hỏi của phiếu đang dùng. */
  answerScales: AnswerScale[];
  answers: SurveyResponseAnswer[];
}

/** Phiếu khảo sát sinh viên thấy khi mở link hoặc quét QR. */
export interface PublicSurvey {
  linkToken: string;
  /** Tên BỘ CÂU HỎI — chuyện nội bộ, không dùng làm tiêu đề phiếu. */
  templateName: string;
  /** Tên ĐỢT khảo sát do quản trị đặt; đây mới là tiêu đề sinh viên thấy. */
  surveyName: string;
  courseCode: string;
  courseName: string;
  sectionName: string;
  lecturerName: string;
  semesterName: string;
  academicYearName: string;
  /** Số tín chỉ của học phần; 0 khi chưa nhập. Phiếu chỉ hiện khi quản trị bật. */
  credits: number;
  /** Khoa và bộ môn của học phần; rỗng khi học phần chưa gắn. */
  facultyName: string;
  departmentName: string;
  startTime: string;
  endTime: string;
  isOpen: boolean;
  /** Các thang mà bộ câu hỏi đang dùng; mỗi câu trỏ tới một thang qua `answerScaleId`. */
  answerScales: AnswerScale[];
  /** Mục của bộ, đã xếp đúng thứ tự phiếu hiển thị. */
  sections: SurveyQuestionSection[];
  questions: {
    questionId: number;
    questionText: string;
    answerScaleId: number;
    sectionId: number;
  }[];
  /** Hình thức phiếu do quản trị đặt lúc tạo đợt; null là dùng mẫu mặc định. */
  formConfig: SurveyFormConfig | null;
}

/**
 * Hình thức phiếu khảo sát: màu, ảnh và các đoạn chữ. Mọi trường đều có thể vắng,
 * vắng thì dùng mặc định của hệ thống — đợt cũ không có cấu hình nào vẫn hiển thị
 * y như trước.
 *
 * Chỉ đặt được lúc tạo đợt, tạo xong không sửa.
 */
/** Định dạng một đoạn chữ; trường nào bỏ trống là giữ kiểu mặc định của phiếu. */
export interface SurveyTextStyle {
  bold?: boolean | null;
  italic?: boolean | null;
  underline?: boolean | null;
  fontSize?: number | null;
  /** 'left' | 'center' | 'right' */
  align?: string | null;
}

export interface SurveyFormConfig {
  /** Phiên bản cấu trúc cấu hình, đi kèm dữ liệu chứ không suy từ mã nguồn. */
  version: number;

  /** Mã mẫu phiếu đã chọn trong thư viện mẫu; chỉ để màn soạn biết đang sửa mẫu nào. */
  templateId?: string | null;

  primaryColor?: string | null;
  backgroundColor?: string | null;
  submitButtonColor?: string | null;

  logoUrl?: string | null;
  coverImageUrl?: string | null;
  /** Vùng ảnh bìa hiện trong khung, dạng "50% 40%"; null là canh giữa. */
  coverPosition?: string | null;

  /** Định dạng chữ của tiêu đề phiếu. Bỏ trống thì theo mẫu mặc định. */
  titleFont?: string | null;
  titleFontSize?: number | null;
  titleBold?: boolean | null;
  titleItalic?: boolean | null;
  titleUnderline?: boolean | null;
  titleAlign?: string | null;

  /**
   * Những thông tin KHÔNG cho hiện trên phiếu (mã trong `surveyInfoFields`). Ghi phần
   * bị ẩn chứ không ghi phần được hiện, để đợt cũ và thông tin thêm sau đều mặc định hiện.
   */
  hiddenFields?: string[] | null;

  title?: string | null;
  /** Dòng đầu của dải lưu ý; bỏ trống là "Lưu ý". */
  introHeading?: string | null;
  /** Nội dung dải lưu ý. */
  intro?: string | null;
  /** Định dạng riêng cho dòng đầu và cho nội dung của dải lưu ý. */
  noticeHeadingStyle?: SurveyTextStyle | null;
  noticeTextStyle?: SurveyTextStyle | null;
  submitLabel?: string | null;
  thankYouTitle?: string | null;
  thankYouMessage?: string | null;

  /**
   * Chữ của ba màn chặn, mỗi câu ứng với đúng một mã lỗi của phiếu công khai:
   * `notOpenMessage` ↔ SURVEY_LINK_NOT_STARTED, `closedMessage` ↔ SURVEY_LINK_EXPIRED,
   * `classFullMessage` ↔ SURVEY_CLASS_FULL.
   */
  notOpenMessage?: string | null;
  closedMessage?: string | null;
  classFullMessage?: string | null;
}

export interface SurveyCampaign {
  id: string;
  title: string;
  type: 'Học phần' | 'Chương trình đào tạo';
  semester: string;
  academicYear: string;
  majorId?: string;
  majorName?: string;
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  classId?: string;
  classCode?: string;
  groupId?: string;
  groupCode?: string; // N01, N02...
  lecturerName?: string;
  startDate: string; // YYYY-MM-DD (Thời gian mở quét QR)
  endDate: string;   // YYYY-MM-DD (Thời gian đóng quét QR)
  status: 'Đang diễn ra' | 'Sắp diễn ra' | 'Đã kết thúc';
  targetAudience: string;
  surveyLink?: string;
  qrCodeUrl?: string;
  totalTargetResponses: number;
  actualResponses: number;
}

export interface SurveyResponse {
  id: string;
  campaignId: string;
  classId?: string;
  studentIdHash: string;
  submittedAt: string;
  ratings: Record<string, number>; // criterionId -> rating (1-5)
  feedbackComments?: string;
}

export interface SystemStats {
  totalFaculties: number;
  totalMajors: number;
  totalCourses: number;
  totalClasses: number;
  activeCampaigns: number;
  totalResponses: number;
  /** Tổng sĩ số các lớp đã được phát phiếu, dùng để tính tỷ lệ hoàn thành. */
  totalTargetResponses: number;
  overallSatisfaction: number; // e.g. 4.65 / 5.0
  qrScanCount: number;
}

export interface AuthProfile {
  id: string;
  name: string;
  code: string;
  roleCode: string;
  organizationUnitCode: string | null;
  organizationUnitName: string | null;
  isDefault: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user: AuthUser | null;
  activeProfile: AuthProfile | null;
  availableProfiles: AuthProfile[];
}

export interface AuthAccess {
  profileId: string;
  roleCode: string;
  organizationUnitCode: string | null;
  permissions: string[];
}

export interface AuthConfiguration {
  googleConfigured: boolean;
  allowAnyGoogleAccount: boolean;
  development: boolean;
}

export interface AdminProfile {
  id: string;
  name: string;
  code: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  organizationUnitCode: string | null;
  organizationUnitName: string | null;
  isActive: boolean;
  isDefault: boolean;
  lastSelectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  profiles: AdminProfile[];
  /** Hồ sơ giảng viên gắn với tài khoản; null với tài khoản quản trị thuần. */
  lecturerId: number | null;
}

export interface ImportAdminUserRow {
  rowNumber: number;
  email: string;
  displayName: string;
}

export interface AdminUserImportItem {
  rowNumber: number;
  email: string;
  succeeded: boolean;
  errorCode: string | null;
}

export interface AdminUserImportResult {
  totalCount: number;
  createdCount: number;
  skippedCount: number;
  items: AdminUserImportItem[];
}

/** Một dòng của kết quả cấp hồ sơ hàng loạt. */
export interface AdminProfileImportItem {
  rowNumber: number;
  email: string;
  succeeded: boolean;
  errorCode: string | null;
}

export interface AdminProfileImportResult {
  totalCount: number;
  createdCount: number;
  skippedCount: number;
  items: AdminProfileImportItem[];
}

export interface AdminRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface AdminAuditLog {
  id: string;
  source: 'AUTH' | 'CHANGE';
  userId: string | null;
  profileId: string | null;
  email: string | null;
  event: string;
  entityName: string | null;
  recordId: string | null;
  metadata: string | null;
  oldValues: string | null;
  newValues: string | null;
  createdAt: string;
}

export interface AdminPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface SaveAdminProfile {
  name: string;
  roleId: string;
  organizationUnitCode: string | null;
  organizationUnitName: string | null;
  isDefault: boolean;
}

// ---------------------------------------------------------------------------
// BÁO CÁO & THỐNG KÊ (REPORTS & STATISTICS)
// ---------------------------------------------------------------------------

export interface SectionProgressDetail {
  courseSectionSurveyId: number;
  courseCode: string;
  courseName: string;
  sectionName: string;
  lecturerName: string;
  classSize: number;
  responseCount: number;
  completionRate: number;
  status: 'Hoàn thành' | 'Đang thu' | 'Chậm tiến độ';
}

export interface OperationalProgressReport {
  semesterId: number;
  semesterName: string;
  academicYearName: string;
  totalTargetResponses: number;
  totalActualResponses: number;
  overallCompletionRate: number;
  completedSectionCount: number;
  inProgressSectionCount: number;
  laggingSectionCount: number;
  sectionDetails: SectionProgressDetail[];
}

export interface OptionCount {
  value: number;
  displayText: string;
  count: number;
  percentage: number;
}

export interface QuestionRating {
  questionId: number;
  /** Số thứ tự câu trong bộ đề (C1, C2...), đánh trên cả câu bẫy và câu tự nhập. */
  questionOrder: number;
  questionText: string;
  /** Chỉ có ý nghĩa với câu thuộc thang `Options`. */
  averageScore: number;
  totalAnswers: number;
  /** Theo đúng các mức của thang câu đó, rỗng với câu thang `Text`. */
  optionDistribution: OptionCount[];
  scaleKind: AnswerScaleKind;
  answerScaleName: string;
  /** Nội dung người học tự nhập, chỉ có với câu thang `Text`. */
  textAnswers: string[] | null;
}

export interface LecturerSectionSummary {
  courseSectionSurveyId: number;
  courseCode: string;
  courseName: string;
  sectionName: string;
  classSize: number;
  /** Mọi lượt nộp, kể cả phiếu bị bộ lọc nhiễu loại. */
  responseCount: number;
  /** Phiếu qua được bộ lọc — mẫu số của mọi số liệu chất lượng. */
  validResponseCount: number;
  invalidResponseCount: number;
  /** Tính trên phiếu hợp lệ so với sĩ số. */
  completionRate: number;
  averageScore: number;
}

export interface LecturerPerformanceReport {
  lecturerId: number;
  fullName: string;
  departmentName: string;
  facultyName: string;
  averageScore: number;
  totalResponses: number;
  courseSectionCount: number;
  departmentAverageScore: number;
  facultyAverageScore: number;
  sections: LecturerSectionSummary[];
  questionRatings: QuestionRating[];
  /**
   * Phần phiếu hợp lệ thực sự dựng nên `averageScore`: chỉ của lớp đã chốt điểm.
   * `totalResponses` đếm cả lớp chưa đủ điều kiện vì đó là tiến độ.
   */
  scoredValidResponseCount: number;
}

export interface DepartmentSummary {
  departmentId: number;
  departmentName: string;
  lecturerCount: number;
  sectionCount: number;
  responseCount: number;
  averageSatisfactionScore: number;
}

export interface FacultyDepartmentReport {
  facultyId: number;
  facultyName: string;
  totalDepartments: number;
  totalLecturers: number;
  totalSections: number;
  totalResponses: number;
  averageSatisfactionScore: number;
  departments: DepartmentSummary[];
}

export interface SurveyQuestionSummaryReport {
  semesterSurveyId: number;
  surveyTemplateId: number;
  templateName: string;
  totalResponses: number;
  overallAverageScore: number;
  questions: QuestionRating[];
}

/** Phân tích theo từng câu hỏi của một bài khảo sát lớp học phần. */
export interface SectionSurveyAnalysis {
  courseSectionSurveyId: number;
  courseCode: string;
  courseName: string;
  sectionName: string;
  lecturerName: string;
  classSize: number;
  responseCount: number;
  averageScore: number;
  templateName: string;
  questions: QuestionRating[];
  /**
   * Lớp đã được chốt điểm ở lần bấm "Tính lại điểm" gần nhất chưa. Chưa chốt thì
   * mọi số liệu phân tích đều rỗng, đúng như ô điểm bỏ trống ở Bảng dữ liệu khảo sát.
   */
  isScored: boolean;
}

/** Một dòng kết quả chi tiết của một bài khảo sát lớp học phần. */
export interface SurveyResultDetail {
  courseSectionSurveyId: number;
  semesterSurveyId: number;
  templateName: string;
  lecturerId: number;
  lecturerName: string;
  /**
   * Tên đọc từ tệp import khi lớp chưa gắn được mã giảng viên (`lecturerId` bằng 0).
   * Có tên thì mở được trang giảng viên theo tên; null là lớp chưa có người dạy.
   */
  unidentifiedLecturerName?: string | null;
  departmentId: number;
  departmentName: string;
  facultyId: number;
  facultyName: string;
  courseCode: string;
  courseName: string;
  sectionName: string;
  classSize: number;
  /** Mọi lượt nộp, kể cả phiếu bị bộ lọc nhiễu loại. */
  responseCount: number;
  /** Phiếu qua được bộ lọc — mẫu số của mọi số liệu chất lượng. */
  validResponseCount: number;
  invalidResponseCount: number;
  /** Tính trên phiếu hợp lệ so với sĩ số. */
  completionRate: number;
  averageScore: number;
}

// ---------------------------------------------------------------------------
// BẢNG TỔNG QUAN TOÀN TRƯỜNG (EXECUTIVE SURVEY DASHBOARD)
// ---------------------------------------------------------------------------

/** Một nhóm điểm trong phân bố điểm toàn trường (theo điểm TB từng phiếu). */
export interface ScoreBand {
  band: number;
  label: string;
  count: number;
  percentage: number;
}

/** Dữ liệu 1 Khoa cho biểu đồ tổng quan toàn trường. */
export interface FacultyOverview {
  facultyId: number;
  facultyName: string;
  departmentCount: number;
  sectionCount: number;
  targetResponses: number;
  responseCount: number;
  completionRate: number;
  averageScore: number;
}

/** Dữ liệu 1 Bộ môn cho bảng "chậm tiến độ" của tổng quan toàn trường. */
export interface DepartmentOverview {
  departmentId: number;
  departmentName: string;
  facultyId: number;
  facultyName: string;
  sectionCount: number;
  targetResponses: number;
  responseCount: number;
  completionRate: number;
  averageScore: number;
}

/** So sánh học kỳ hiện tại với học kỳ được chọn. */
export interface SemesterComparison {
  comparisonType: 'semester' | 'campaign';
  comparisonSemesterId: number;
  comparisonSemesterSurveyId: number | null;
  comparisonSemesterName: string;
  comparisonAcademicYearName: string;
  comparisonTemplateName: string | null;
  comparisonSectionCount: number;
  comparisonTargetResponses: number;
  comparisonResponseCount: number;
  comparisonCompletionRate: number;
  comparisonAverageScore: number;
  completionRateDelta: number;
  averageScoreDelta: number;
}

export interface SchoolOverviewComparisonOption {
  semesterSurveyId: number;
  /** Tên đợt do quản trị đặt. Khác `templateName` là tên bộ câu hỏi. */
  surveyName: string;
  semesterId: number;
  semesterName: string;
  academicYearName: string;
  surveyTemplateId: number;
  templateName: string;
  createdAt: string;
}

/** Bảng tổng quan toàn trường (executive summary) của một học kỳ. */
export interface SchoolSurveyOverview {
  semesterId: number;
  semesterName: string;
  academicYearName: string;
  totalSections: number;
  totalTargetResponses: number;
  totalResponses: number;
  completionRate: number;
  completedSectionCount: number;
  inProgressSectionCount: number;
  laggingSectionCount: number;
  overallAverageScore: number;
  /** Số lớp qua được hai vòng lọc — nhóm "đủ điều kiện" của Bảng dữ liệu khảo sát. */
  scoredSectionCount: number;
  /** Số phiếu hợp lệ của riêng nhóm lớp trên, tức mẫu số của điểm trung bình. */
  scoredValidResponseCount: number;
  scoreDistribution: ScoreBand[];
  schoolAverageScore: number;
  faculties: FacultyOverview[];
  departments: DepartmentOverview[];
  weakestQuestions: QuestionRating[];
  semesterComparison: SemesterComparison | null;
  /** Mọi lượt nộp, kể cả phiếu bị lọc nhiễu; `totalResponses` chỉ đếm phiếu hợp lệ. */
  totalSubmittedResponses: number;
  /** Số phiếu đã thu trên chỉ tiêu — vế thứ nhất của ngưỡng tính điểm. */
  responseRate: number;
}

// ---------------------------------------------------------------------------
// PHÂN QUYỀN THEO MODULE (PERMISSION MANAGEMENT)
// ---------------------------------------------------------------------------

export interface PermissionDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
}

export interface RolePermissionStatus {
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  category: string;
  isGranted: boolean;
}

export interface RolePermissionMatrix {
  roleId: string;
  roleCode: string;
  roleName: string;
  permissions: RolePermissionStatus[];
}

export interface RolePermissionGrantDto {
  permissionId: string;
  isGranted: boolean;
}
