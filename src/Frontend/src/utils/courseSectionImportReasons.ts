import { catalogErrorMessage } from '../services/catalogApi';
import type { Department, Faculty } from '../types';
import {
  departmentNotFoundReason,
  duplicateReason,
  facultyNotFoundReason,
  foldKey,
} from './catalogImportReasons';
import type { ImportCourseSectionRow } from './courseSectionImportExcel';

/*
  Lý do bỏ qua của từng dòng khi import lớp học phần, viết cụ thể (xem catalogImportReasons).
*/

export interface CourseSectionReasonContext {
  rows: readonly ImportCourseSectionRow[];
  departments: readonly Department[];
  faculties: readonly Faculty[];
}

/** Câu lý do cho một dòng bị bỏ qua. */
export function courseSectionFailureReason(
  errorCode: string | null | undefined,
  row: ImportCourseSectionRow | undefined,
  context: CourseSectionReasonContext,
): string {
  const fallback = catalogErrorMessage(errorCode);
  if (!row) return fallback;

  const code = row.courseCode.trim();
  const section = row.sectionName.trim();

  switch (errorCode) {
    case 'CATALOG_DEPARTMENT_CODE_INVALID':
      return `Cột "Mã BM" ghi "${row.departmentCode}", phải là số nguyên dương.`;

    case 'CATALOG_DEPARTMENT_NOT_FOUND':
      return departmentNotFoundReason(row.departmentName, row.departmentCode, context.departments);

    case 'CATALOG_FACULTY_NOT_FOUND':
      return facultyNotFoundReason(row.facultyName, context.faculties);

    case 'CATALOG_LECTURER_EMAIL_INVALID':
      return `Email "${row.lecturerEmail}" không đúng định dạng (hoặc dài quá 320 ký tự).`;

    case 'CATALOG_LECTURER_NAME_REQUIRED':
      return `Email ${row.lecturerEmail} chưa có trong danh mục giảng viên nên cần cột "Giảng viên" để tạo mới, nhưng cột này đang trống.`;

    case 'CATALOG_LECTURER_NAME_TOO_LONG':
      return `Họ tên giảng viên dài ${row.lecturerFullName.trim().length} ký tự, tối đa 200.`;

    case 'CATALOG_COURSE_SECTION_SIZE_INVALID':
      return `Cột "Sĩ số" ghi "${row.classSize}", phải là số nguyên không âm.`;

    case 'CATALOG_COURSE_CREDITS_INVALID':
      return `Học phần ${code} chưa có trong danh mục; cột "TCHT" ghi "${row.credits}", phải là số nguyên không âm.`;

    case 'CATALOG_COURSE_NAME_REQUIRED_FOR_AUTO_CREATE':
      return `Học phần ${code} chưa có trong danh mục nên cần cột "Học phần" để tạo mới, nhưng cột này đang trống.`;

    case 'CATALOG_COURSE_SECTION_EXISTS':
      return `Học phần ${code} đã có lớp ${section} trong học kỳ này (và lớp đã có giảng viên, hoặc dòng này không có email để gắn).`;

    case 'CATALOG_COURSE_SECTION_DUPLICATE_IN_FILE':
      return duplicateReason(`Lớp ${code} – ${section}`, row, context.rows,
        (item) => `${foldKey(item.courseCode)}|${foldKey(item.sectionName)}`);

    case 'CATALOG_COURSE_CODE_REQUIRED':
      return 'Thiếu cột "Mã HP".';

    case 'CATALOG_COURSE_SECTION_NAME_REQUIRED':
      return `Học phần ${code}: thiếu cột "Nhóm" (tên lớp).`;

    default:
      return fallback;
  }
}
