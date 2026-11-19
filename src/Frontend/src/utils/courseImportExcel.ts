import type { CellValue } from 'read-excel-file/browser';
import type { SheetData } from 'write-excel-file/browser';
import {
  buildLookupSheet,
  downloadFailedRows,
  templateHeaderRow,
  writeWorkbook,
  type FailedRowExport,
} from './importExcelShared';
import { pickImportSheet, type ImportParseResult } from './importSheets';
import {
  departmentLookupHeaders,
  departmentLookupValues,
  departmentLookupWidths,
  type DepartmentLookupRow,
} from './importLookupRows';

const maximumFileSize = 5 * 1024 * 1024;

const courseCodeHeaders = new Set(['ma hoc phan', 'ma mon hoc', 'coursecode', 'course code']);
const courseNameHeaders = new Set(['ten hoc phan', 'ten mon hoc', 'coursename', 'course name']);
const creditsHeaders = new Set(['so tin chi', 'tin chi', 'credits']);
const courseTypeHeaders = new Set(['loai hoc phan', 'loai mon hoc', 'coursetype', 'course type']);
const facultyNameHeaders = new Set([
  'ten khoa vien',
  'ten khoa/vien',
  'ten khoa / vien',
  'ten khoa',
  'khoa vien',
  'facultyname',
  'faculty name',
]);
const departmentNameHeaders = new Set([
  'ten bo mon',
  'bo mon',
  'departmentname',
  'department name',
]);
const prerequisiteHeaders = new Set([
  'ma hoc phan tien quyet',
  'hoc phan tien quyet',
  'tien quyet',
  'prerequisitecoursecode',
  'prerequisite course code',
]);

export interface ImportCourseRow {
  rowNumber: number;
  courseCode: string;
  courseName: string;
  credits: string;
  courseType: string;
  /** Tra ngược ra "Courses"."FacultyId". */
  facultyName: string;
  /** Tra ngược ra "Courses"."DepartmentId". */
  departmentName: string;
  /** Tra ngược ra "Courses"."PrerequisiteCourseId". */
  prerequisiteCourseCode: string;
}

export type CourseImportFileErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_EMPTY'
  | 'CODE_HEADER_MISSING'
  | 'NAME_HEADER_MISSING'
  | 'NO_DATA_ROWS'
  | 'READ_FAILED';

export class CourseImportFileError extends Error {
  public readonly code: CourseImportFileErrorCode;

  constructor(code: CourseImportFileErrorCode) {
    super(code);
    this.code = code;
  }
}

// Dấu thanh tiếng Việt sau khi normalize('NFD') nằm trong dải U+0300..U+036F.
const combiningMarks = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(combiningMarks, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cellText(value: CellValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

export const courseTemplateFileName = 'mau-import-hoc-phan.xlsx';

/**
 * Tạo và tải tệp Excel mẫu cho học phần. Khoa viện, bộ môn và học phần tiên
 * quyết ghi theo tên / mã, khi import được tra ngược ra id.
 */
export const courseImportColumns = [
  'Mã học phần',
  'Tên học phần',
  'Số tín chỉ',
  'Loại học phần',
  'Tên khoa viện',
  'Tên bộ môn',
  'Mã học phần tiên quyết',
];
const courseColumnWidths = [16, 34, 12, 16, 30, 30, 22];

export async function downloadCourseImportTemplate(
  departmentRows: DepartmentLookupRow[] = []
): Promise<void> {
  const rows = [
    ['19783', 'Lập trình Web nâng cao', '3', 'Bắt buộc', 'Khoa Công nghệ Thông tin', 'Bộ môn Công nghệ Phần mềm', ''],
    ['19784', 'Trí tuệ nhân tạo', '3', 'Tự chọn', 'Khoa Công nghệ Thông tin', 'Bộ môn Công nghệ Phần mềm', '19783'],
    ['20101', 'Kỹ thuật điện tử', '4', 'Bắt buộc', 'Khoa Điện - Điện tử', '', ''],
  ];

  const data: SheetData = [
    templateHeaderRow(courseImportColumns),
    ...rows.map((row) => row.map((value) => ({ value, type: String }))),
  ];

  await writeWorkbook(
    [
      {
        data,
        sheet: 'Hoc phan',
        columns: courseColumnWidths.map((width) => ({ width })),
      } as never,
      buildLookupSheet(
        'Danh sach bo mon',
        departmentLookupHeaders,
        departmentRows.map(departmentLookupValues),
        departmentLookupWidths
      ),
    ],
    courseTemplateFileName
  );
}

/** Xuất các dòng import hỏng ra tệp để sửa rồi nạp lại. */
export async function downloadCourseFailedRows(rows: FailedRowExport[]): Promise<void> {
  await downloadFailedRows({
    fileName: 'dong-loi-hoc-phan.xlsx',
    sheetName: 'Dong loi',
    headers: courseImportColumns,
    columnWidths: courseColumnWidths,
    rows,
  });
}

/** Đọc tệp .xlsx của danh mục học phần. */
export async function parseCourseImportFile(
  file: File,
  sheetName?: string,
): Promise<ImportParseResult<ImportCourseRow>> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new CourseImportFileError('FILE_TYPE');
  }
  if (file.size > maximumFileSize) {
    throw new CourseImportFileError('FILE_SIZE');
  }

  // Tệp nhiều sheet: đọc `sheetName`, bỏ trống thì tự chọn sheet đủ cột (xem importSheets).
  let picked: Awaited<ReturnType<typeof pickImportSheet>>;
  try {
    picked = await pickImportSheet(file, {
      sheetName,
      requiredHeaders: [courseCodeHeaders, courseNameHeaders],
      preferredNames: ['hocphan'],
    });
  } catch {
    throw new CourseImportFileError('READ_FAILED');
  }
  const sheet = picked.data;

  if (sheet.length === 0) {
    throw new CourseImportFileError('FILE_EMPTY');
  }

  const headers = sheet[0].map((value) => normalizeHeader(cellText(value)));
  const indexOf = (candidates: Set<string>) =>
    headers.findIndex((header) => candidates.has(header));

  const codeIndex = indexOf(courseCodeHeaders);
  if (codeIndex < 0) {
    throw new CourseImportFileError('CODE_HEADER_MISSING');
  }
  const nameIndex = indexOf(courseNameHeaders);
  if (nameIndex < 0) {
    throw new CourseImportFileError('NAME_HEADER_MISSING');
  }
  const creditsIndex = indexOf(creditsHeaders);
  const typeIndex = indexOf(courseTypeHeaders);
  const facultyIndex = indexOf(facultyNameHeaders);
  const departmentIndex = indexOf(departmentNameHeaders);
  const prerequisiteIndex = indexOf(prerequisiteHeaders);

  const pick = (row: readonly (CellValue | null)[], index: number) =>
    index < 0 ? '' : cellText(row[index]);

  const rows = sheet
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      courseCode: cellText(row[codeIndex]),
      courseName: cellText(row[nameIndex]),
      credits: pick(row, creditsIndex),
      courseType: pick(row, typeIndex),
      facultyName: pick(row, facultyIndex),
      departmentName: pick(row, departmentIndex),
      prerequisiteCourseCode: pick(row, prerequisiteIndex),
    }))
    .filter((row) => row.courseCode.length > 0 || row.courseName.length > 0);

  if (rows.length === 0) {
    throw new CourseImportFileError('NO_DATA_ROWS');
  }

  return { rows, ...picked.choice };
}
