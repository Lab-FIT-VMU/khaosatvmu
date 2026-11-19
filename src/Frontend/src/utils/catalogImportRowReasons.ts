import { catalogErrorMessage } from '../services/catalogApi';
import type { Department, Faculty, Major } from '../types';
import {
  closestName,
  departmentNotFoundReason,
  duplicateReason,
  facultyNotFoundReason,
  foldKey,
} from './catalogImportReasons';
import type { ImportCohortMajorRow } from './cohortMajorImportExcel';
import type { ImportCourseRow } from './courseImportExcel';
import type { ImportDepartmentRow } from './departmentImportExcel';
import type { ImportFacultyRow } from './facultyImportExcel';
import type { ImportLecturerRow } from './lecturerImportExcel';
import type { ImportMajorRow } from './majorImportExcel';

/*
  Lý do bỏ qua từng dòng của các luồng import Danh mục đào tạo (khoa / viện, bộ môn, giảng
  viên, ngành, khoá ngành, học phần). Mỗi hàm nhận mã lỗi backend trả về, dòng trong tệp và
  danh mục đang dùng; trả câu nêu đúng giá trị gây lỗi, gợi ý giá trị đúng nếu đoán được.
  Lớp học phần ở courseSectionImportReasons.ts.
*/

type Code = string | null | undefined;

export function facultyImportReason(
  errorCode: Code,
  row: ImportFacultyRow | undefined,
  rows: readonly ImportFacultyRow[],
): string {
  if (!row) return catalogErrorMessage(errorCode);
  const name = row.facultyName.trim();
  switch (errorCode) {
    case 'CATALOG_FACULTY_NAME_EXISTS':
      return `Khoa / viện "${name}" đã có trong danh mục.`;
    case 'CATALOG_FACULTY_DUPLICATE_IN_FILE':
      return duplicateReason(`Khoa / viện "${name}"`, row, rows, (item) => foldKey(item.facultyName));
    default:
      return catalogErrorMessage(errorCode);
  }
}

export function departmentImportReason(
  errorCode: Code,
  row: ImportDepartmentRow | undefined,
  rows: readonly ImportDepartmentRow[],
  faculties: readonly Faculty[],
): string {
  if (!row) return catalogErrorMessage(errorCode);
  const id = row.departmentId > 0 ? String(row.departmentId) : '';
  switch (errorCode) {
    case 'CATALOG_DEPARTMENT_ID_REQUIRED':
      return `Bộ môn "${row.departmentName.trim()}": cột "Mã bộ môn" trống hoặc không phải số nguyên dương.`;
    case 'CATALOG_DEPARTMENT_ID_EXISTS':
      return `Mã bộ môn ${id} đã có trong danh mục (kể cả bộ môn đã xoá thì mã vẫn bị giữ). Dùng mã khác.`;
    case 'CATALOG_DEPARTMENT_ID_DUPLICATE_IN_FILE':
      return duplicateReason(`Mã bộ môn ${id}`, row, rows, (item) => (item.departmentId > 0 ? String(item.departmentId) : ''));
    case 'CATALOG_FACULTY_NOT_FOUND':
      return facultyNotFoundReason(row.facultyName, faculties);
    default:
      return catalogErrorMessage(errorCode);
  }
}

export function lecturerImportReason(
  errorCode: Code,
  row: ImportLecturerRow | undefined,
  rows: readonly ImportLecturerRow[],
  faculties: readonly Faculty[],
  departments: readonly Department[],
): string {
  if (!row) return catalogErrorMessage(errorCode);
  const email = row.email.trim();
  switch (errorCode) {
    case 'CATALOG_LECTURER_NAME_TOO_LONG':
      return `Họ tên dài ${row.fullName.trim().length} ký tự, tối đa 200.`;
    case 'CATALOG_LECTURER_EMAIL_INVALID':
      return `Email "${email}" không đúng định dạng (hoặc dài quá 320 ký tự).`;
    case 'CATALOG_LECTURER_EMAIL_EXISTS':
      return `Email ${email} đã thuộc một giảng viên trong danh mục.`;
    case 'CATALOG_LECTURER_EMAIL_DELETED':
      return `Email ${email} thuộc giảng viên đã xoá. Khôi phục giảng viên đó thay vì tạo mới.`;
    case 'CATALOG_LECTURER_EMAIL_DUPLICATE_IN_FILE':
      return duplicateReason(`Email ${email}`, row, rows, (item) => foldKey(item.email));
    case 'CATALOG_FACULTY_NOT_FOUND':
      return facultyNotFoundReason(row.facultyName, faculties);
    case 'CATALOG_DEPARTMENT_NOT_FOUND':
      return departmentNotFoundReason(row.departmentName, '', departments);
    case 'CATALOG_POSITION_NOT_FOUND':
      return `Không có chức vụ "${row.positionName.trim()}" trong danh mục chức vụ.`;
    default:
      return catalogErrorMessage(errorCode);
  }
}

export function majorImportReason(
  errorCode: Code,
  row: ImportMajorRow | undefined,
  rows: readonly ImportMajorRow[],
  faculties: readonly Faculty[],
): string {
  if (!row) return catalogErrorMessage(errorCode);
  const code = row.majorCode.trim();
  const name = row.majorName.trim();
  switch (errorCode) {
    case 'CATALOG_FACULTY_NOT_FOUND':
      return facultyNotFoundReason(row.facultyName, faculties);
    case 'CATALOG_MAJOR_EXISTS':
      return `Ngành "${name}" đã có trong ${row.facultyName.trim() || 'khoa / viện này'}.`;
    case 'CATALOG_MAJOR_CODE_EXISTS': {
      const earlier = rows.find((item) => item.rowNumber < row.rowNumber && foldKey(item.majorCode) === foldKey(code));
      return earlier
        ? `Mã ngành ${code} lặp lại; đã có ở dòng ${earlier.rowNumber} của tệp.`
        : `Mã ngành ${code} đã có trong danh mục.`;
    }
    default:
      return catalogErrorMessage(errorCode);
  }
}

export function courseImportReason(
  errorCode: Code,
  row: ImportCourseRow | undefined,
  rows: readonly ImportCourseRow[],
  faculties: readonly Faculty[],
  departments: readonly Department[],
): string {
  if (!row) return catalogErrorMessage(errorCode);
  const code = row.courseCode.trim();
  switch (errorCode) {
    case 'CATALOG_COURSE_NAME_REQUIRED':
      return `Học phần ${code}: thiếu cột tên học phần.`;
    case 'CATALOG_COURSE_CODE_EXISTS':
      return `Mã học phần ${code} đã có trong danh mục.`;
    case 'CATALOG_COURSE_DUPLICATE_IN_FILE':
      return duplicateReason(`Mã học phần ${code}`, row, rows, (item) => foldKey(item.courseCode));
    case 'CATALOG_COURSE_CREDITS_INVALID':
      return `Học phần ${code}: cột số tín chỉ ghi "${row.credits}", phải là số nguyên không âm.`;
    case 'CATALOG_COURSE_TYPE_INVALID':
      return `Học phần ${code}: loại học phần "${row.courseType}" không hợp lệ.`;
    case 'CATALOG_FACULTY_NOT_FOUND':
      return facultyNotFoundReason(row.facultyName, faculties);
    case 'CATALOG_DEPARTMENT_NOT_FOUND':
      return departmentNotFoundReason(row.departmentName, '', departments);
    case 'CATALOG_PREREQUISITE_NOT_FOUND':
      return `Học phần tiên quyết ${row.prerequisiteCourseCode.trim()} không có trong danh mục, cũng không có trong tệp.`;
    default:
      return catalogErrorMessage(errorCode);
  }
}

export function cohortMajorImportReason(
  errorCode: Code,
  fallback: string,
  row: ImportCohortMajorRow | undefined,
  rows: readonly ImportCohortMajorRow[],
  majors: readonly Major[],
): string {
  if (!row) return fallback;
  const code = row.cohortMajorCode.trim();
  switch (errorCode) {
    case 'COHORT_MAJOR_STUDENT_COUNT_INVALID':
      return `Lớp ${code}: sĩ số "${row.studentCount ?? ''}" không hợp lệ, phải là số nguyên không âm.`;
    case 'COHORT_MAJOR_MAJOR_NOT_FOUND': {
      const typed = row.majorName.trim();
      const suggestion = typed ? closestName(typed, majors, (item) => item.majorName) : undefined;
      if (!typed) return `Lớp ${code}: không tách được ngành từ mã lớp và cột tên ngành đang trống.`;
      return suggestion && foldKey(suggestion.majorName) !== foldKey(typed)
        ? `Lớp ${code}: không có ngành "${typed}". Tên đúng trong danh mục: "${suggestion.majorName}".`
        : `Lớp ${code}: không có ngành "${typed}" trong danh mục ngành.`;
    }
    case 'COHORT_MAJOR_EXISTS': {
      const earlier = rows.find((item) => item.rowNumber < row.rowNumber && foldKey(item.cohortMajorCode) === foldKey(code));
      return earlier
        ? `Lớp ${code} lặp lại; đã có ở dòng ${earlier.rowNumber} của tệp.`
        : `Lớp ${code} đã có trong khoá này.`;
    }
    default:
      return fallback;
  }
}
