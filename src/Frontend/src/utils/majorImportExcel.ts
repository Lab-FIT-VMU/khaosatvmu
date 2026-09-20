import type { CellValue } from 'read-excel-file/browser';
import type { SheetData } from 'write-excel-file/browser';
import {
  buildLookupSheet,
  downloadFailedRows,
  templateHeaderRow,
  writeWorkbook,
  type FailedRowExport,
} from './importExcelShared';

const maximumFileSize = 5 * 1024 * 1024;
const majorCodeHeaders = new Set(['ma nganh', 'majorcode', 'major code']);
const majorNameHeaders = new Set([
  'ten nganh dao tao',
  'ten nganh hoc',
  'ten nganh',
  'nganh hoc',
  'majorname',
  'major name',
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
export interface ImportMajorRow {
  rowNumber: number;
  majorCode: string;
  majorName: string;
  /** Tên khoa viện trong tệp; App tra tên này ra "Majors"."FacultyId". */
  facultyName: string;
}

export type MajorImportFileErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_EMPTY'
  | 'CODE_HEADER_MISSING'
  | 'NAME_HEADER_MISSING'
  | 'FACULTY_HEADER_MISSING'
  | 'NO_DATA_ROWS'
  | 'READ_FAILED';

export class MajorImportFileError extends Error {
  public readonly code: MajorImportFileErrorCode;

  constructor(code: MajorImportFileErrorCode) {
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

export const majorTemplateFileName = 'mau-import-nganh-dao-tao.xlsx';

/** Tạo tệp mẫu danh mục chuẩn; tên đối chiếu file nghiệp vụ do hệ thống seed. */
export const majorImportColumns = [
  'Mã ngành',
  'Tên ngành đào tạo',
  'Tên khoa viện',
];
const majorColumnWidths = [16, 38, 38];

export async function downloadMajorImportTemplate(
  faculties: { facultyName: string }[] = []
): Promise<void> {
  const data: SheetData = [
    templateHeaderRow(majorImportColumns),
    [
      { value: 'CNT', type: String },
      { value: 'Công nghệ Thông tin', type: String },
      { value: 'Khoa Công nghệ Thông tin', type: String },
    ],
    [
      { value: 'KPM', type: String },
      { value: 'Kỹ thuật Phần mềm', type: String },
      { value: 'Khoa Công nghệ Thông tin', type: String },
    ],
    [
      { value: 'ĐTV', type: String },
      { value: 'Kỹ thuật Điện tử - Viễn thông', type: String },
      { value: 'Khoa Điện - Điện tử', type: String },
    ],
  ];

  await writeWorkbook(
    [
      {
        data,
        sheet: 'Nganh hoc',
        columns: majorColumnWidths.map((width) => ({ width })),
      } as never,
      buildLookupSheet(
        'Danh sach khoa vien',
        ['Khoa / Viện'],
        faculties.map((faculty) => [faculty.facultyName]),
        [50]
      ),
    ],
    majorTemplateFileName
  );
}

/** Xuất các dòng import hỏng ra tệp để sửa rồi nạp lại. */
export async function downloadMajorFailedRows(rows: FailedRowExport[]): Promise<void> {
  await downloadFailedRows({
    fileName: 'dong-loi-nganh-hoc.xlsx',
    sheetName: 'Dong loi',
    headers: majorImportColumns,
    columnWidths: majorColumnWidths,
    rows,
  });
}

/** Đọc tệp .xlsx và lấy ba trường danh mục chuẩn. */
export async function parseMajorImportFile(file: File): Promise<ImportMajorRow[]> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new MajorImportFileError('FILE_TYPE');
  }
  if (file.size > maximumFileSize) {
    throw new MajorImportFileError('FILE_SIZE');
  }

  let sheet;
  try {
    const { readSheet } = await import('read-excel-file/browser');
    sheet = await readSheet(file);
  } catch {
    throw new MajorImportFileError('READ_FAILED');
  }

  if (sheet.length === 0) {
    throw new MajorImportFileError('FILE_EMPTY');
  }

  const headers = sheet[0].map((value) => normalizeHeader(cellText(value)));
  const codeIndex = headers.findIndex((header) => majorCodeHeaders.has(header));
  if (codeIndex < 0) {
    throw new MajorImportFileError('CODE_HEADER_MISSING');
  }
  const nameIndex = headers.findIndex((header) => majorNameHeaders.has(header));
  if (nameIndex < 0) {
    throw new MajorImportFileError('NAME_HEADER_MISSING');
  }
  const facultyIndex = headers.findIndex((header) => facultyNameHeaders.has(header));
  if (facultyIndex < 0) {
    throw new MajorImportFileError('FACULTY_HEADER_MISSING');
  }
  const rows = sheet
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      majorCode: cellText(row[codeIndex]),
      majorName: cellText(row[nameIndex]),
      facultyName: cellText(row[facultyIndex]),
    }))
    .filter((row) => row.majorCode.length > 0 || row.majorName.length > 0 || row.facultyName.length > 0);

  if (rows.length === 0) {
    throw new MajorImportFileError('NO_DATA_ROWS');
  }

  return rows;
}
