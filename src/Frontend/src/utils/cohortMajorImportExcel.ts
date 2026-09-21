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

const cohortMajorCodeHeaders = new Set([
  'khoa nganh dao tao',
  'ten khoa nganh dao tao',
  'ma khoa nganh dao tao',
  'ma lop',
  'lop',
  'cohortmajorcode',
  'cohort major code',
]);
const majorNameHeaders = new Set([
  'nganh dao tao',
  'ten nganh dao tao',
  'ten nganh',
  'nganh hoc',
  'majorname',
  'major name',
]);
const studentCountHeaders = new Set([
  'so luong sinh vien',
  'so sinh vien',
  'si so',
  'studentcount',
  'student count',
]);

export interface ImportCohortMajorRow {
  rowNumber: number;
  /** Mã lớp khoá - ngành, vd 'CNT63CL'. Server tự tách ra khoá và ngành. */
  cohortMajorCode: string;
  /** Chỉ dùng khi tiền tố mã lớp không có trong danh mục ngành. */
  majorName: string;
  studentCount: number | null;
}

export type CohortMajorImportFileErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_EMPTY'
  | 'CODE_HEADER_MISSING'
  | 'NAME_HEADER_MISSING'
  | 'STUDENT_COUNT_HEADER_MISSING'
  | 'NO_DATA_ROWS'
  | 'READ_FAILED';

export class CohortMajorImportFileError extends Error {
  public readonly code: CohortMajorImportFileErrorCode;

  constructor(code: CohortMajorImportFileErrorCode) {
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

function cellNumber(value: CellValue | null | undefined): number | null {
  const text = cellText(value);
  if (text.length === 0) return null;
  const parsed = Number(text.replace(/[^\d-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export const cohortMajorTemplateFileName = 'mau-import-khoa-nganh-dao-tao.xlsx';

export const cohortMajorImportColumns = [
  'Khoá ngành đào tạo',
  'Ngành đào tạo',
  'Số lượng sinh viên',
];
const cohortMajorColumnWidths = [24, 40, 20];

export async function downloadCohortMajorImportTemplate(
  majors: { majorName: string }[] = []
): Promise<void> {
  const data: SheetData = [
    templateHeaderRow(cohortMajorImportColumns),
    [
      { value: 'CNT63CL', type: String },
      { value: 'Công nghệ thông tin (CLC)', type: String },
      { value: 62, type: Number },
    ],
    [
      { value: 'KPM66ĐH', type: String },
      { value: 'Công nghệ phần mềm', type: String },
      { value: 84, type: Number },
    ],
    [
      { value: 'ĐTĐ61ĐH', type: String },
      { value: 'Điện tự động công nghiệp', type: String },
      { value: 71, type: Number },
    ],
  ];

  await writeWorkbook(
    [
      {
        data,
        sheet: 'Khoa nganh dao tao',
        columns: cohortMajorColumnWidths.map((width) => ({ width })),
      } as never,
      buildLookupSheet(
        'Danh sach nganh',
        ['Tên ngành đào tạo'],
        majors.map((major) => [major.majorName]),
        [50]
      ),
    ],
    cohortMajorTemplateFileName
  );
}

export async function downloadCohortMajorFailedRows(rows: FailedRowExport[]): Promise<void> {
  await downloadFailedRows({
    fileName: 'dong-loi-khoa-nganh-dao-tao.xlsx',
    sheetName: 'Dong loi',
    headers: cohortMajorImportColumns,
    columnWidths: cohortMajorColumnWidths,
    rows,
  });
}

/** Đọc tệp .xlsx và lấy ba cột khoá ngành đào tạo, ngành đào tạo, số lượng sinh viên. */
export async function parseCohortMajorImportFile(file: File): Promise<ImportCohortMajorRow[]> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new CohortMajorImportFileError('FILE_TYPE');
  }
  if (file.size > maximumFileSize) {
    throw new CohortMajorImportFileError('FILE_SIZE');
  }

  let sheet;
  try {
    const { readSheet } = await import('read-excel-file/browser');
    sheet = await readSheet(file);
  } catch {
    throw new CohortMajorImportFileError('READ_FAILED');
  }

  if (sheet.length === 0) {
    throw new CohortMajorImportFileError('FILE_EMPTY');
  }

  const headers = sheet[0].map((value) => normalizeHeader(cellText(value)));
  const codeIndex = headers.findIndex((header) => cohortMajorCodeHeaders.has(header));
  if (codeIndex < 0) {
    throw new CohortMajorImportFileError('CODE_HEADER_MISSING');
  }
  const nameIndex = headers.findIndex((header) => majorNameHeaders.has(header));
  if (nameIndex < 0) {
    throw new CohortMajorImportFileError('NAME_HEADER_MISSING');
  }
  const countIndex = headers.findIndex((header) => studentCountHeaders.has(header));
  if (countIndex < 0) {
    throw new CohortMajorImportFileError('STUDENT_COUNT_HEADER_MISSING');
  }

  const rows = sheet
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      cohortMajorCode: cellText(row[codeIndex]).toUpperCase(),
      majorName: cellText(row[nameIndex]),
      studentCount: cellNumber(row[countIndex]),
    }))
    .filter((row) => row.cohortMajorCode.length > 0 || row.majorName.length > 0);

  if (rows.length === 0) {
    throw new CohortMajorImportFileError('NO_DATA_ROWS');
  }

  return rows;
}
