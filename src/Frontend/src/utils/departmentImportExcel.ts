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

const maximumFileSize = 5 * 1024 * 1024;
const departmentIdHeaders = new Set([
  'ma bo mon',
  'ma',
  'departmentid',
  'department id',
]);
const departmentNameHeaders = new Set([
  'ten bo mon',
  'bo mon',
  'departmentname',
  'department name',
]);
const facultyNameHeaders = new Set([
  'ten khoa vien',
  'ten khoa/vien',
  'ten khoa / vien',
  'ten khoa',
  'khoa vien',
  'facultyname',
  'faculty name',
]);

export interface ImportDepartmentRow {
  rowNumber: number;
  /** Mã bộ môn tự nhập; "Departments"."DepartmentId" không tự tăng. 0 nghĩa là bỏ trống hoặc sai định dạng. */
  departmentId: number;
  departmentName: string;
  /** Tên khoa viện trong tệp; App tra tên này ra "Departments"."FacultyId". */
  facultyName: string;
}

export type DepartmentImportFileErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_EMPTY'
  | 'ID_HEADER_MISSING'
  | 'NAME_HEADER_MISSING'
  | 'FACULTY_HEADER_MISSING'
  | 'NO_DATA_ROWS'
  | 'READ_FAILED';

export class DepartmentImportFileError extends Error {
  public readonly code: DepartmentImportFileErrorCode;

  constructor(code: DepartmentImportFileErrorCode) {
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

/** Mã bộ môn phải là số nguyên dương; trả 0 khi ô trống hoặc không phải số. */
function cellPositiveInteger(value: CellValue | null | undefined): number {
  const text = cellText(value);
  if (!/^\d+$/.test(text)) return 0;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export const departmentTemplateFileName = 'mau-import-bo-mon.xlsx';

/** Cột của tệp mẫu, cũng là bố cục của tệp xuất dòng lỗi. */
export const departmentImportColumns = ['Mã bộ môn', 'Tên bộ môn', 'Tên khoa viện'];
const departmentColumnWidths = [14, 38, 38];

/**
 * Tạo và tải tệp Excel mẫu: cột "Mã bộ môn", "Tên bộ môn" và "Tên khoa viện".
 * Mã bộ môn phải tự điền vì cột khóa chính không tự tăng.
 * Khi import, tên khoa viện được tra ngược ra FacultyId.
 *
 * Sheet thứ hai liệt kê khoa/viện đang có để người điền chép đúng tên, khỏi gõ
 * sai rồi bị bỏ dòng lúc import.
 */
export async function downloadDepartmentImportTemplate(
  faculties: { facultyName: string }[] = []
): Promise<void> {
  const data: SheetData = [
    templateHeaderRow(departmentImportColumns),
    [
      { value: 101, type: Number },
      { value: 'Bộ môn Công nghệ Phần mềm', type: String },
      { value: 'Khoa Công nghệ Thông tin', type: String },
    ],
    [
      { value: 102, type: Number },
      { value: 'Bộ môn Hệ thống Thông tin', type: String },
      { value: 'Khoa Công nghệ Thông tin', type: String },
    ],
    [
      { value: 201, type: Number },
      { value: 'Bộ môn Điện tử Viễn thông', type: String },
      { value: 'Khoa Điện - Điện tử', type: String },
    ],
  ];

  await writeWorkbook(
    [
      {
        data,
        sheet: 'Bo mon',
        columns: departmentColumnWidths.map((width) => ({ width })),
      } as never,
      buildLookupSheet(
        'Danh sach khoa vien',
        ['Khoa / Viện'],
        faculties.map((faculty) => [faculty.facultyName]),
        [50]
      ),
    ],
    departmentTemplateFileName
  );
}

/** Xuất các dòng import hỏng ra tệp để sửa rồi nạp lại. */
export async function downloadDepartmentFailedRows(rows: FailedRowExport[]): Promise<void> {
  await downloadFailedRows({
    fileName: 'dong-loi-bo-mon.xlsx',
    sheetName: 'Dong loi',
    headers: departmentImportColumns,
    columnWidths: departmentColumnWidths,
    rows,
  });
}

/**
 * Đọc tệp .xlsx và lấy mã bộ môn, tên bộ môn kèm tên khoa viện. Tệp nhiều sheet: đọc
 * `sheetName`, bỏ trống thì tự chọn sheet đủ cột (xem importSheets).
 */
export async function parseDepartmentImportFile(
  file: File,
  sheetName?: string,
): Promise<ImportParseResult<ImportDepartmentRow>> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new DepartmentImportFileError('FILE_TYPE');
  }
  if (file.size > maximumFileSize) {
    throw new DepartmentImportFileError('FILE_SIZE');
  }

  let picked: Awaited<ReturnType<typeof pickImportSheet>>;
  try {
    picked = await pickImportSheet(file, {
      sheetName,
      requiredHeaders: [departmentIdHeaders, departmentNameHeaders, facultyNameHeaders],
      preferredNames: ['bomon'],
    });
  } catch {
    throw new DepartmentImportFileError('READ_FAILED');
  }
  const sheet = picked.data;

  if (sheet.length === 0) {
    throw new DepartmentImportFileError('FILE_EMPTY');
  }

  const headers = sheet[0].map((value) => normalizeHeader(cellText(value)));
  const idIndex = headers.findIndex((header) => departmentIdHeaders.has(header));
  if (idIndex < 0) {
    throw new DepartmentImportFileError('ID_HEADER_MISSING');
  }
  const nameIndex = headers.findIndex((header) => departmentNameHeaders.has(header));
  if (nameIndex < 0) {
    throw new DepartmentImportFileError('NAME_HEADER_MISSING');
  }
  const facultyIndex = headers.findIndex((header) => facultyNameHeaders.has(header));
  if (facultyIndex < 0) {
    throw new DepartmentImportFileError('FACULTY_HEADER_MISSING');
  }

  const rows = sheet
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      departmentId: cellPositiveInteger(row[idIndex]),
      departmentName: cellText(row[nameIndex]),
      facultyName: cellText(row[facultyIndex]),
    }))
    .filter(
      (row) =>
        row.departmentId > 0 || row.departmentName.length > 0 || row.facultyName.length > 0
    );

  if (rows.length === 0) {
    throw new DepartmentImportFileError('NO_DATA_ROWS');
  }

  return { rows, ...picked.choice };
}
