import type { CellValue } from 'read-excel-file/browser';
import type { SheetData } from 'write-excel-file/browser';
import {
  buildLookupSheet,
  downloadFailedRows,
  isValidImportEmail,
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

const fullNameHeaders = new Set([
  'ho va ten',
  'ho ten',
  'ten giang vien',
  'fullname',
  'full name',
]);
const emailHeaders = new Set(['email', 'email cong vu', 'gmail']);
const phoneHeaders = new Set(['so dien thoai', 'dien thoai', 'sdt', 'phonenumber', 'phone number']);
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
const positionNameHeaders = new Set([
  'chuc vu',
  'ten chuc vu',
  'positionname',
  'position name',
  'position',
]);

/** Chức vụ mặc định khi cột chức vụ của một dòng bị bỏ trống. */
export const defaultPositionName = 'Giảng viên';

export interface ImportLecturerRow {
  rowNumber: number;
  fullName: string;
  email: string;
  phoneNumber: string;
  /** Tra ngược ra "Lecturers"."FacultyId". */
  facultyName: string;
  /** Tra ngược ra "Lecturers"."DepartmentId". */
  departmentName: string;
  /** Tra ngược ra "Lecturers"."PositionId"; để trống thì backend dùng defaultPositionName. */
  positionName: string;
}

export function lecturerImportRowError(row: ImportLecturerRow): string | null {
  if (!row.fullName.trim()) return 'Thiếu họ và tên';
  if (row.fullName.trim().length > 200) return 'Họ và tên không được vượt quá 200 ký tự';
  if (!row.email.trim()) return 'Thiếu email';
  if (!isValidImportEmail(row.email.trim())) return 'Email không đúng định dạng hoặc vượt quá 320 ký tự';
  return null;
}

export type LecturerImportFileErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_EMPTY'
  | 'NAME_HEADER_MISSING'
  | 'EMAIL_HEADER_MISSING'
  | 'NO_DATA_ROWS'
  | 'READ_FAILED';

export class LecturerImportFileError extends Error {
  public readonly code: LecturerImportFileErrorCode;

  constructor(code: LecturerImportFileErrorCode) {
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

export const lecturerTemplateFileName = 'mau-import-giang-vien.xlsx';

/**
 * Tạo và tải tệp Excel mẫu cho giảng viên. Khoa viện, bộ môn và chức vụ ghi theo tên,
 * khi import được tra ngược ra id. Dòng cuối để trống cột chức vụ để minh họa
 * trường hợp mặc định thành "Giảng viên".
 */
export const lecturerImportColumns = [
  'Họ và tên',
  'Email',
  'Số điện thoại',
  'Tên khoa viện',
  'Tên bộ môn',
  'Chức vụ',
];
const lecturerColumnWidths = [26, 30, 18, 30, 30, 22];

export async function downloadLecturerImportTemplate(
  departmentRows: DepartmentLookupRow[] = []
): Promise<void> {
  const rows = [
    ['Nguyễn Văn Hải', 'hainv@vimaru.edu.vn', '0912345678', 'Khoa Công nghệ Thông tin', 'Bộ môn Công nghệ Phần mềm', 'Trưởng Bộ môn'],
    ['Trần Thị Bình', 'binhtt@vimaru.edu.vn', '0987654321', 'Khoa Công nghệ Thông tin', '', 'Giảng viên chính'],
    ['Lê Văn Cường', 'cuonglv@vimaru.edu.vn', '', 'Khoa Điện - Điện tử', '', ''],
  ];

  const data: SheetData = [
    templateHeaderRow(lecturerImportColumns),
    ...rows.map((row) => row.map((value) => ({ value, type: String }))),
  ];

  await writeWorkbook(
    [
      {
        data,
        sheet: 'Giang vien',
        columns: lecturerColumnWidths.map((width) => ({ width })),
      } as never,
      buildLookupSheet(
        'Danh sach bo mon',
        departmentLookupHeaders,
        departmentRows.map(departmentLookupValues),
        departmentLookupWidths
      ),
    ],
    lecturerTemplateFileName
  );
}

/** Xuất các dòng import hỏng ra tệp để sửa rồi nạp lại. */
export async function downloadLecturerFailedRows(rows: FailedRowExport[]): Promise<void> {
  await downloadFailedRows({
    fileName: 'dong-loi-giang-vien.xlsx',
    sheetName: 'Dong loi',
    headers: lecturerImportColumns,
    columnWidths: lecturerColumnWidths,
    rows,
  });
}

/**
 * Đọc tệp .xlsx của danh mục giảng viên. Tệp nhiều sheet: đọc `sheetName`, bỏ trống thì tự
 * chọn sheet đủ cột họ tên và email (xem importSheets).
 */
export async function parseLecturerImportFile(
  file: File,
  sheetName?: string,
): Promise<ImportParseResult<ImportLecturerRow>> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new LecturerImportFileError('FILE_TYPE');
  }
  if (file.size > maximumFileSize) {
    throw new LecturerImportFileError('FILE_SIZE');
  }

  let picked: Awaited<ReturnType<typeof pickImportSheet>>;
  try {
    picked = await pickImportSheet(file, {
      sheetName,
      requiredHeaders: [fullNameHeaders, emailHeaders],
      preferredNames: ['giangvien'],
    });
  } catch {
    throw new LecturerImportFileError('READ_FAILED');
  }
  const sheet = picked.data;

  if (sheet.length === 0) {
    throw new LecturerImportFileError('FILE_EMPTY');
  }

  const headers = sheet[0].map((value) => normalizeHeader(cellText(value)));
  const indexOf = (candidates: Set<string>) =>
    headers.findIndex((header) => candidates.has(header));

  const nameIndex = indexOf(fullNameHeaders);
  if (nameIndex < 0) {
    throw new LecturerImportFileError('NAME_HEADER_MISSING');
  }
  const emailIndex = indexOf(emailHeaders);
  if (emailIndex < 0) {
    throw new LecturerImportFileError('EMAIL_HEADER_MISSING');
  }
  const phoneIndex = indexOf(phoneHeaders);
  const facultyIndex = indexOf(facultyNameHeaders);
  const departmentIndex = indexOf(departmentNameHeaders);
  // Cột Chức vụ là tùy chọn: bỏ trống thì backend gán defaultPositionName.
  const positionIndex = indexOf(positionNameHeaders);

  const pick = (row: readonly (CellValue | null)[], index: number) =>
    index < 0 ? '' : cellText(row[index]);

  const rows = sheet
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      fullName: cellText(row[nameIndex]),
      email: pick(row, emailIndex),
      phoneNumber: pick(row, phoneIndex),
      facultyName: pick(row, facultyIndex),
      departmentName: pick(row, departmentIndex),
      positionName: pick(row, positionIndex),
    }))
    .filter((row) => row.fullName.length > 0 || row.email.length > 0);

  if (rows.length === 0) {
    throw new LecturerImportFileError('NO_DATA_ROWS');
  }

  return { rows, ...picked.choice };
}
