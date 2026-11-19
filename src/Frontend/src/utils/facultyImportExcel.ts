import type { CellValue } from 'read-excel-file/browser';
import type { SheetData } from 'write-excel-file/browser';
import {
  downloadFailedRows,
  templateHeaderRow,
  writeWorkbook,
  type FailedRowExport,
} from './importExcelShared';
import { pickImportSheet, type ImportParseResult } from './importSheets';

const maximumFileSize = 5 * 1024 * 1024;
const facultyNameHeaders = new Set([
  'ten khoa vien',
  'ten khoa/vien',
  'ten khoa / vien',
  'ten khoa',
  'khoa vien',
  'facultyname',
  'faculty name',
]);

export interface ImportFacultyRow {
  rowNumber: number;
  facultyName: string;
}

export type FacultyImportFileErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_EMPTY'
  | 'NAME_HEADER_MISSING'
  | 'NO_DATA_ROWS'
  | 'READ_FAILED';

export class FacultyImportFileError extends Error {
  public readonly code: FacultyImportFileErrorCode;

  constructor(code: FacultyImportFileErrorCode) {
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

export const facultyTemplateFileName = 'mau-import-khoa-vien.xlsx';

/**
 * Tạo và tải tệp Excel mẫu: một cột "Tên khoa viện" kèm vài dòng ví dụ, đúng
 * định dạng mà parseFacultyImportFile đọc được.
 */
export const facultyImportColumns = ['Tên khoa viện'];
const facultyColumnWidths = [42];

export async function downloadFacultyImportTemplate(): Promise<void> {
  const data: SheetData = [
    templateHeaderRow(facultyImportColumns),
    [{ value: 'Khoa Công nghệ Thông tin', type: String }],
    [{ value: 'Khoa Điện - Điện tử', type: String }],
    [{ value: 'Viện Đào tạo Quốc tế', type: String }],
  ];

  // Khoa/viện là gốc của cây danh mục nên không có bảng tra nào để kèm thêm.
  await writeWorkbook(
    [
      {
        data,
        sheet: 'Khoa vien',
        columns: facultyColumnWidths.map((width) => ({ width })),
      } as never,
    ],
    facultyTemplateFileName
  );
}

/** Xuất các dòng import hỏng ra tệp để sửa rồi nạp lại. */
export async function downloadFacultyFailedRows(rows: FailedRowExport[]): Promise<void> {
  await downloadFailedRows({
    fileName: 'dong-loi-khoa-vien.xlsx',
    sheetName: 'Dong loi',
    headers: facultyImportColumns,
    columnWidths: facultyColumnWidths,
    rows,
  });
}

/**
 * Đọc tệp .xlsx và lấy cột tên khoa viện. Mỗi dòng dữ liệu là một khoa / viện. Tệp nhiều
 * sheet: đọc `sheetName`, bỏ trống thì tự chọn sheet có cột tên khoa viện (xem importSheets).
 */
export async function parseFacultyImportFile(
  file: File,
  sheetName?: string,
): Promise<ImportParseResult<ImportFacultyRow>> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new FacultyImportFileError('FILE_TYPE');
  }
  if (file.size > maximumFileSize) {
    throw new FacultyImportFileError('FILE_SIZE');
  }

  let picked: Awaited<ReturnType<typeof pickImportSheet>>;
  try {
    picked = await pickImportSheet(file, {
      sheetName,
      requiredHeaders: [facultyNameHeaders],
      preferredNames: ['khoavien', 'khoa'],
    });
  } catch {
    throw new FacultyImportFileError('READ_FAILED');
  }
  const sheet = picked.data;

  if (sheet.length === 0) {
    throw new FacultyImportFileError('FILE_EMPTY');
  }

  const headers = sheet[0].map((value) => normalizeHeader(cellText(value)));
  const nameIndex = headers.findIndex((header) => facultyNameHeaders.has(header));
  if (nameIndex < 0) {
    throw new FacultyImportFileError('NAME_HEADER_MISSING');
  }

  const rows = sheet
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      facultyName: cellText(row[nameIndex]),
    }))
    .filter((row) => row.facultyName.length > 0);

  if (rows.length === 0) {
    throw new FacultyImportFileError('NO_DATA_ROWS');
  }

  return { rows, ...picked.choice };
}
