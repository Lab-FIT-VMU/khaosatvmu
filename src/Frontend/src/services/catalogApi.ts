import type {
  AcademicYear,
  Course,
  CourseSection,
  CourseType,
  Department,
  Faculty,
  Lecturer,
  Major,
  Position,
  Semester,
} from '../types';
import type { ImportFacultyRow } from '../utils/facultyImportExcel';
import type { ImportDepartmentRow } from '../utils/departmentImportExcel';
import type { ImportMajorRow } from '../utils/majorImportExcel';
import type { ImportCourseRow } from '../utils/courseImportExcel';
import type { ImportLecturerRow } from '../utils/lecturerImportExcel';
import type {
  ImportCourseSectionRow,
  UnidentifiedLecturer,
} from '../utils/courseSectionImportExcel';
import { apiRequest, csrfRequest } from './apiClient';

/** Kết quả import trả về từ API, dùng chung cho ba danh mục. */
export interface CatalogImportItem {
  rowNumber: number;
  name: string;
  facultyName: string | null;
  succeeded: boolean;
  errorCode: string | null;
}

export interface CatalogImportResponse {
  totalCount: number;
  createdCount: number;
  skippedCount: number;
  items: CatalogImportItem[];
}

/** Kết quả import lớp học phần, rộng hơn CatalogImportResponse. */
export interface CourseSectionImportResponse extends CatalogImportResponse {
  /** Số học phần được tạo tự động vì chưa có trong danh mục. */
  createdCourseCount: number;
  /** Số giảng viên được tạo tự động từ email trong tệp. */
  createdLecturerCount: number;
  /** Số lớp đã có sẵn và được cập nhật lại mã giảng viên. */
  updatedSectionCount: number;
  unidentifiedLecturers: UnidentifiedLecturer[];
}

/** Một lớp chưa gắn được giảng viên, dựng lại từ dữ liệu chứ không từ tệp import. */
export interface UnidentifiedSection {
  courseSectionId: number;
  /** Tên đọc từ tệp import, nằm ở cột UnidentifiedLecturerName. */
  lecturerName: string;
  courseCode: string;
  courseName: string;
  sectionName: string;
  classSize: number;
  departmentId: number | null;
  departmentName: string | null;
  facultyName: string | null;
  /** Cột "TCHT" của tệp import, lấy theo học phần sở hữu lớp. */
  credits: number;
}

/**
 * Gom các lớp trên theo tên giảng viên. Đây mới là danh sách cầm đi xin email: một
 * bộ môn có thể thiếu 36 lớp nhưng chỉ do 6 người dạy.
 */
export interface UnidentifiedLecturerGroup {
  lecturerName: string;
  departmentName: string | null;
  sectionCount: number;
  /** Nhãn lớp dạng "13150 / N01", để đối chiếu khi hỏi bộ môn. */
  sectionLabels: string[];
}

export interface UnidentifiedLecturerReport {
  sectionCount: number;
  lecturerCount: number;
  sections: UnidentifiedSection[];
  lecturers: UnidentifiedLecturerGroup[];
}

export const catalogApi = {
  faculties: () => apiRequest<Faculty[]>('/api/catalog/faculties'),
  createFaculty: (facultyName: string) =>
    csrfRequest<Faculty>('/api/catalog/faculties', 'POST', { facultyName }),
  updateFaculty: (facultyId: number, facultyName: string) =>
    csrfRequest<Faculty>(`/api/catalog/faculties/${facultyId}`, 'PUT', { facultyName }),
  deleteFaculty: (facultyId: number) =>
    csrfRequest<boolean>(`/api/catalog/faculties/${facultyId}`, 'DELETE'),
  importFaculties: (rows: ImportFacultyRow[]) =>
    csrfRequest<CatalogImportResponse>('/api/catalog/faculties/import', 'POST', { rows }),

  departments: () => apiRequest<Department[]>('/api/catalog/departments'),
  /** departmentId phải tự nhập vì "Departments"."DepartmentId" không tự tăng. */
  createDepartment: (departmentId: number, departmentName: string, facultyId: number | null) =>
    csrfRequest<Department>('/api/catalog/departments', 'POST', {
      departmentId,
      departmentName,
      facultyId,
    }),
  updateDepartment: (departmentId: number, departmentName: string, facultyId: number | null) =>
    csrfRequest<Department>(`/api/catalog/departments/${departmentId}`, 'PUT', {
      departmentName,
      facultyId,
    }),
  deleteDepartment: (departmentId: number) =>
    csrfRequest<boolean>(`/api/catalog/departments/${departmentId}`, 'DELETE'),
  importDepartments: (rows: ImportDepartmentRow[]) =>
    csrfRequest<CatalogImportResponse>('/api/catalog/departments/import', 'POST', { rows }),

  positions: () => apiRequest<Position[]>('/api/catalog/positions'),
  createPosition: (positionName: string) =>
    csrfRequest<Position>('/api/catalog/positions', 'POST', { positionName }),
  updatePosition: (positionId: number, positionName: string) =>
    csrfRequest<Position>(`/api/catalog/positions/${positionId}`, 'PUT', { positionName }),
  deletePosition: (positionId: number) =>
    csrfRequest<boolean>(`/api/catalog/positions/${positionId}`, 'DELETE'),

  majors: () => apiRequest<Major[]>('/api/catalog/majors'),
  createMajor: (majorCode: string, majorName: string, facultyId: number) =>
    csrfRequest<Major>('/api/catalog/majors', 'POST', { majorCode, majorName, facultyId }),
  updateMajor: (majorId: number, majorCode: string, majorName: string, facultyId: number) =>
    csrfRequest<Major>(`/api/catalog/majors/${majorId}`, 'PUT', { majorCode, majorName, facultyId }),
  deleteMajor: (majorId: number) =>
    csrfRequest<boolean>(`/api/catalog/majors/${majorId}`, 'DELETE'),
  importMajors: (rows: ImportMajorRow[]) =>
    csrfRequest<CatalogImportResponse>('/api/catalog/majors/import', 'POST', { rows }),

  academicYears: () => apiRequest<AcademicYear[]>('/api/catalog/academic-years'),
  createAcademicYear: (year: SaveAcademicYearPayload) =>
    csrfRequest<AcademicYear>('/api/catalog/academic-years', 'POST', year),
  updateAcademicYear: (academicYearId: number, year: SaveAcademicYearPayload) =>
    csrfRequest<AcademicYear>(`/api/catalog/academic-years/${academicYearId}`, 'PUT', year),
  createSemester: (semesterName: string, academicYearId: number) =>
    csrfRequest<Semester>('/api/catalog/semesters', 'POST', { semesterName, academicYearId }),
  updateSemester: (semesterId: number, semesterName: string, academicYearId: number) =>
    csrfRequest<Semester>(`/api/catalog/semesters/${semesterId}`, 'PUT', {
      semesterName,
      academicYearId,
    }),
  deleteSemester: (semesterId: number) =>
    csrfRequest<boolean>(`/api/catalog/semesters/${semesterId}`, 'DELETE'),

  /** Bỏ trống semesterId để lấy toàn bộ lớp học phần. */
  courseSections: (semesterId?: number) =>
    apiRequest<CourseSection[]>(
      semesterId === undefined
        ? '/api/catalog/course-sections'
        : `/api/catalog/course-sections?semesterId=${semesterId}`,
    ),
  createCourseSection: (section: SaveCourseSectionPayload) =>
    csrfRequest<CourseSection>('/api/catalog/course-sections', 'POST', section),
  updateCourseSection: (courseSectionId: number, section: SaveCourseSectionPayload) =>
    csrfRequest<CourseSection>(`/api/catalog/course-sections/${courseSectionId}`, 'PUT', section),
  deleteCourseSection: (courseSectionId: number) =>
    csrfRequest<boolean>(`/api/catalog/course-sections/${courseSectionId}`, 'DELETE'),
  importCourseSections: (semesterId: number, rows: ImportCourseSectionRow[]) =>
    csrfRequest<CourseSectionImportResponse>('/api/catalog/course-sections/import', 'POST', {
      semesterId,
      rows,
    }),

  /**
   * Các lớp chưa gắn được giảng viên, backend đã lọc sẵn theo phạm vi người đang
   * đăng nhập. Trưởng bộ môn gọi thì ra bộ môn mình, quản trị gọi thì ra tất cả.
   */
  unidentifiedLecturers: (semesterId?: number | null) =>
    apiRequest<UnidentifiedLecturerReport>(
      semesterId == null
        ? '/api/catalog/course-sections/unidentified-lecturers'
        : `/api/catalog/course-sections/unidentified-lecturers?semesterId=${semesterId}`,
    ),

  /**
   * Bổ sung email (kèm bộ môn, khoa viện) cho giảng viên chưa xác định của MỘT lớp.
   * Chỉ lớp này được gắn mã; các lớp khác đang treo cùng tên có thể là người khác
   * nên không đụng tới.
   */
  resolveUnidentifiedLecturer: (
    courseSectionId: number,
    payload: ResolveUnidentifiedLecturerPayload,
  ) =>
    csrfRequest<ResolveUnidentifiedLecturerResponse>(
      `/api/catalog/course-sections/${courseSectionId}/resolve-lecturer`,
      'POST',
      payload,
    ),

  lecturers: () => apiRequest<Lecturer[]>('/api/catalog/lecturers'),
  createLecturer: (lecturer: SaveLecturerPayload) =>
    csrfRequest<Lecturer>('/api/catalog/lecturers', 'POST', lecturer),
  updateLecturer: (lecturerId: number, lecturer: SaveLecturerPayload) =>
    csrfRequest<Lecturer>(`/api/catalog/lecturers/${lecturerId}`, 'PUT', lecturer),
  deleteLecturer: (lecturerId: number) =>
    csrfRequest<boolean>(`/api/catalog/lecturers/${lecturerId}`, 'DELETE'),
  importLecturers: (rows: ImportLecturerRow[]) =>
    csrfRequest<CatalogImportResponse>('/api/catalog/lecturers/import', 'POST', { rows }),

  courses: () => apiRequest<Course[]>('/api/catalog/courses'),
  createCourse: (course: SaveCoursePayload) =>
    csrfRequest<Course>('/api/catalog/courses', 'POST', course),
  updateCourse: (courseId: number, course: SaveCoursePayload) =>
    csrfRequest<Course>(`/api/catalog/courses/${courseId}`, 'PUT', course),
  deleteCourse: (courseId: number) =>
    csrfRequest<boolean>(`/api/catalog/courses/${courseId}`, 'DELETE'),
  importCourses: (rows: ImportCourseRow[]) =>
    csrfRequest<CatalogImportResponse>('/api/catalog/courses/import', 'POST', { rows }),
};

export interface SaveAcademicYearPayload {
  academicYearName: string;
}

export interface SaveCourseSectionPayload {
  courseId: number;
  semesterId: number;
  /** Null khi lớp chưa xác định được giảng viên. */
  lecturerId: number | null;
  sectionName: string;
  classSize: number;
  /** Chỉ điền khi lecturerId là null. */
  unidentifiedLecturerName: string | null;
}

/** Đúng những gì tệp import mang theo cho một dòng thiếu email. */
export interface ResolveUnidentifiedLecturerPayload {
  fullName: string;
  email: string;
  departmentId: number | null;
  facultyId: number | null;
}

export interface ResolveUnidentifiedLecturerResponse {
  lecturer: Lecturer;
  /** Giảng viên vừa được tạo mới, hay đã có sẵn theo email. */
  lecturerCreated: boolean;
}

export interface SaveLecturerPayload {
  fullName: string;
  departmentId: number | null;
  facultyId: number | null;
  email: string | null;
  phoneNumber: string | null;
  positionId: number | null;
}

export interface SaveCoursePayload {
  courseCode: string;
  courseName: string;
  credits: number;
  /** Null khi chưa xác định bắt buộc hay tự chọn. */
  courseType: CourseType | null;
  departmentId: number | null;
  facultyId: number | null;
  prerequisiteCourseId: number | null;
}

/** Thông báo tiếng Việt cho mã lỗi của API danh mục. */
export const catalogErrorMessages: Record<string, string> = {
  CATALOG_OUT_OF_SCOPE: 'Bạn không có quyền thực hiện thao tác này với hồ sơ đang sử dụng.',
  CATALOG_INVALID_REQUEST: 'Dữ liệu gửi lên không hợp lệ.',
  CATALOG_FACULTY_NOT_FOUND: 'Không tìm thấy khoa viện.',
  CATALOG_FACULTY_NAME_REQUIRED: 'Thiếu tên khoa viện.',
  CATALOG_FACULTY_NAME_EXISTS: 'Tên khoa viện đã tồn tại.',
  CATALOG_FACULTY_DUPLICATE_IN_FILE: 'Tên bị lặp trong tệp.',
  CATALOG_FACULTY_IN_USE: 'Khoa viện đang được giảng viên hoặc học phần tham chiếu.',
  CATALOG_DEPARTMENT_NOT_FOUND: 'Không tìm thấy bộ môn.',
  CATALOG_DEPARTMENT_NAME_REQUIRED: 'Thiếu tên bộ môn.',
  CATALOG_DEPARTMENT_ID_REQUIRED: 'Thiếu mã bộ môn hoặc mã không phải số nguyên dương.',
  CATALOG_DEPARTMENT_ID_EXISTS: 'Mã bộ môn đã tồn tại trong hệ thống.',
  CATALOG_DEPARTMENT_ID_DUPLICATE_IN_FILE: 'Mã bộ môn bị lặp trong tệp.',
  CATALOG_DEPARTMENT_IN_USE: 'Bộ môn đang được giảng viên hoặc học phần tham chiếu.',
  CATALOG_DEPARTMENT_CODE_INVALID: 'Cột "Mã BM" phải là số nguyên dương.',
  CATALOG_COURSE_NAME_REQUIRED_FOR_AUTO_CREATE:
    'Học phần chưa có trong danh mục nên cần cột "Học phần" để tạo mới.',
  CATALOG_POSITION_NOT_FOUND: 'Không tìm thấy chức vụ.',
  CATALOG_POSITION_NAME_REQUIRED: 'Thiếu tên chức vụ.',
  CATALOG_POSITION_NAME_EXISTS: 'Tên chức vụ đã tồn tại.',
  CATALOG_MAJOR_NOT_FOUND: 'Không tìm thấy ngành đào tạo.',
  CATALOG_MAJOR_CODE_REQUIRED: 'Thiếu mã ngành.',
  CATALOG_MAJOR_NAME_REQUIRED: 'Thiếu tên ngành đào tạo.',
  CATALOG_MAJOR_FACULTY_REQUIRED: 'Thiếu tên khoa viện (cột FacultyId không được để trống).',
  CATALOG_MAJOR_EXISTS: 'Ngành đào tạo này đã tồn tại trong khoa / viện.',
  CATALOG_ACADEMIC_YEAR_NOT_FOUND: 'Không tìm thấy năm học.',
  CATALOG_ACADEMIC_YEAR_NAME_REQUIRED: 'Thiếu tên năm học.',
  CATALOG_ACADEMIC_YEAR_NAME_EXISTS: 'Tên năm học đã tồn tại.',
  CATALOG_ACADEMIC_YEAR_NAME_INVALID:
    'Tên năm học phải có dạng năm liền nhau, ví dụ 2025-2026.',
  CATALOG_SEMESTER_NOT_FOUND: 'Không tìm thấy học kỳ.',
  CATALOG_SEMESTER_NAME_REQUIRED: 'Thiếu tên học kỳ.',
  CATALOG_SEMESTER_NAME_EXISTS: 'Năm học này đã có học kỳ trùng tên.',
  CATALOG_COURSE_SECTION_NOT_FOUND: 'Không tìm thấy lớp học phần.',
  CATALOG_COURSE_SECTION_NAME_REQUIRED: 'Thiếu tên lớp.',
  CATALOG_COURSE_SECTION_EXISTS: 'Học phần này trong học kỳ đã có lớp trùng tên.',
  CATALOG_COURSE_SECTION_SIZE_INVALID: 'Sĩ số không hợp lệ.',
  CATALOG_COURSE_SECTION_DUPLICATE_IN_FILE: 'Lớp bị lặp trong tệp.',
  CATALOG_SECTION_LECTURER_REQUIRED: 'Thiếu giảng viên (cần email hoặc họ tên).',
  CATALOG_SECTION_LECTURER_ALREADY_SET: 'Lớp này đã có giảng viên, dùng nút Sửa để đổi.',
  CATALOG_LECTURER_AMBIGUOUS:
    'Có nhiều giảng viên trùng tên. Hãy ghi thêm email, bộ môn hoặc khoa viện.',
  CATALOG_LECTURER_NOT_FOUND: 'Không tìm thấy giảng viên.',
  CATALOG_LECTURER_NAME_REQUIRED: 'Thiếu họ và tên giảng viên.',
  CATALOG_LECTURER_EMAIL_REQUIRED:
    'Thiếu email giảng viên. Không có email thì không tạo được tài khoản đăng nhập.',
  CATALOG_LECTURER_EMAIL_EXISTS: 'Email đã tồn tại trong danh mục.',
  CATALOG_LECTURER_EMAIL_DUPLICATE_IN_FILE: 'Email bị lặp trong tệp.',
  CATALOG_LECTURER_IN_USE: 'Giảng viên đang được lớp học phần tham chiếu.',
  CATALOG_COURSE_NOT_FOUND: 'Không tìm thấy học phần.',
  CATALOG_COURSE_CODE_REQUIRED: 'Thiếu mã học phần.',
  CATALOG_COURSE_NAME_REQUIRED: 'Thiếu tên học phần.',
  CATALOG_COURSE_CODE_EXISTS: 'Mã học phần đã tồn tại.',
  CATALOG_COURSE_DUPLICATE_IN_FILE: 'Mã học phần bị lặp trong tệp.',
  CATALOG_COURSE_CREDITS_INVALID: 'Số tín chỉ không hợp lệ.',
  CATALOG_COURSE_TYPE_INVALID: 'Loại học phần chỉ nhận Bắt buộc hoặc Tự chọn.',
  CATALOG_PREREQUISITE_NOT_FOUND: 'Không tìm thấy học phần tiên quyết trùng mã.',
  CATALOG_COURSE_IN_USE: 'Học phần đang được học phần khác dùng làm tiên quyết.',
  AUTH_CSRF_INVALID: 'Phiên bảo mật đã thay đổi. Vui lòng tải lại trang.',
};

export function catalogErrorMessage(errorCode: string | null | undefined): string {
  return catalogErrorMessages[errorCode ?? ''] ?? 'Không thể kết nối tới máy chủ.';
}
