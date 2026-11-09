import type { CellValue } from 'read-excel-file/browser';
import type { SheetData } from 'write-excel-file/browser';
import type { StudentImportRow } from '../types/students';
import { templateHeaderRow, writeWorkbook } from './importExcelShared';

/*
  File danh sách sinh viên: mỗi sheet một khóa ("Khóa 66"), cùng bộ cột. Trình duyệt đọc mọi sheet,
  người dùng chọn sheet cần nạp, rồi gửi các dòng lên server kiểm tra (xem trước) và ghi (xác nhận).
*/

const maximumFileSize = 20 * 1024 * 1024;

export const studentImportColumns = [
  'Mã sinh viên',
  'Họ và tên',
  'Lớp hành chính',
  'Khóa',
  'Ngày sinh',
  'Giới tính',
  'Email',
  'Số điện thoại',
  'Tình trạng học tập',
];
export const studentImportColumnWidths = [14, 30, 16, 8, 12, 10, 30, 16, 20];
export const studentTemplateFileName = 'mau-import-sinh-vien.xlsx';

type Field = keyof Omit<StudentImportRow, 'sheetName' | 'rowNumber'>;

/** Tên cột chấp nhận (đã bỏ dấu, chữ thường), gồm cả tên cột của file điểm (f_masv, f_tensv, f_tenlop). */
const headerAliases: Record<Field, string[]> = {
  studentCode: ['ma sinh vien', 'ma sv', 'masv', 'mssv', 'f_masv', 'student code'],
  fullName: ['ho va ten', 'ho ten', 'ten sinh vien', 'ho va ten sinh vien', 'f_tensv', 'full name'],
  administrativeClassCode: ['lop hanh chinh', 'lop', 'lop sinh hoat', 'ma lop', 'f_tenlop'],
  cohort: ['khoa', 'khoa hoc', 'nien khoa'],
  dateOfBirth: ['ngay sinh', 'ngay thang nam sinh'],
  gender: ['gioi tinh'],
  email: ['email', 'e-mail', 'thu dien tu'],
  phoneNumber: ['so dien thoai', 'dien thoai', 'sdt'],
  studyStatus: ['tinh trang hoc tap', 'tinh trang', 'trang thai'],
};

export type StudentImportFileErrorCode = 'FILE_TYPE' | 'FILE_SIZE' | 'READ_FAILED' | 'NO_STUDENT_SHEET';

export class StudentImportFileError extends Error {
  public readonly code: StudentImportFileErrorCode;

  constructor(code: StudentImportFileErrorCode) {
    super(code);
    this.code = code;
  }
}

export const studentImportFileErrorMessages: Record<StudentImportFileErrorCode, string> = {
  FILE_TYPE: 'Chỉ nhận file Excel định dạng .xlsx.',
  FILE_SIZE: 'File vượt quá 20 MB.',
  READ_FAILED: 'Không đọc được file Excel.',
  NO_STUDENT_SHEET: 'Không có sheet nào có cột "Mã sinh viên" và "Họ và tên".',
};

/** Một sheet đọc được từ file: tên, khóa đoán từ tên sheet, các dòng. */
export interface StudentImportSheet {
  name: string;
  cohortHint: string | null;
  rows: StudentImportRow[];
}

// Dấu thanh tiếng Việt sau khi normalize('NFD') nằm trong dải U+0300..U+036F.
const combiningMarks = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(combiningMarks, '').replace(/đ/gi, 'd').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cellText(value: CellValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Ô ngày của Excel: read-excel-file trả Date theo UTC.
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === 'number' && Number.isInteger(value)) return String(value);
  return String(value).trim();
}

/** "Khóa 66", "K66", "66" → "66". */
export function cohortFromSheetName(name: string): string | null {
  const match = name.match(/\d{2,3}/);
  return match ? match[0] : null;
}

export async function parseStudentImportFile(file: File): Promise<StudentImportSheet[]> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new StudentImportFileError('FILE_TYPE');
  if (file.size > maximumFileSize) throw new StudentImportFileError('FILE_SIZE');

  let sheets: { sheet: string; data: CellValue[][] }[];
  try {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    sheets = (await readXlsxFile(file)) as unknown as { sheet: string; data: CellValue[][] }[];
  } catch {
    throw new StudentImportFileError('READ_FAILED');
  }

  const result: StudentImportSheet[] = [];
  for (const { sheet, data } of sheets) {
    if (data.length === 0) continue;
    const headers = data[0].map((value) => normalizeHeader(cellText(value)));
    const index = Object.fromEntries(
      (Object.keys(headerAliases) as Field[]).map((field) => [field, headers.findIndex((h) => headerAliases[field].includes(h))]),
    ) as Record<Field, number>;
    if (index.studentCode < 0 || index.fullName < 0) continue;

    const cohortHint = cohortFromSheetName(sheet);
    const text = (row: CellValue[], field: Field) => (index[field] >= 0 ? cellText(row[index[field]]) : '');
    const optional = (row: CellValue[], field: Field) => text(row, field) || null;
    const rows = data.slice(1)
      .map((row, i): StudentImportRow => ({
        sheetName: sheet,
        rowNumber: i + 2,
        studentCode: text(row, 'studentCode'),
        fullName: text(row, 'fullName'),
        administrativeClassCode: optional(row, 'administrativeClassCode'),
        cohort: optional(row, 'cohort') ?? cohortHint,
        dateOfBirth: optional(row, 'dateOfBirth'),
        gender: optional(row, 'gender'),
        email: optional(row, 'email'),
        phoneNumber: optional(row, 'phoneNumber'),
        studyStatus: optional(row, 'studyStatus'),
      }))
      .filter((row) => row.studentCode.length > 0 || row.fullName.length > 0);
    if (rows.length > 0) result.push({ name: sheet, cohortHint, rows });
  }

  if (result.length === 0) throw new StudentImportFileError('NO_STUDENT_SHEET');
  return result;
}

export async function downloadStudentImportTemplate(): Promise<void> {
  const sample: SheetData = [
    templateHeaderRow(studentImportColumns),
    [
      { value: '100018', type: String },
      { value: 'Nguyễn Văn A', type: String },
      { value: 'ĐKT66ĐH', type: String },
      { value: '66', type: String },
      { value: '14/03/2007', type: String },
      { value: 'Nam', type: String },
      null,
      null,
      { value: 'Đang học', type: String },
    ],
  ];
  await writeWorkbook(
    [
      { data: sample, sheet: 'Khóa 66', columns: studentImportColumnWidths.map((width) => ({ width })) } as never,
      {
        data: [
          [{ value: 'HƯỚNG DẪN NẠP DANH SÁCH SINH VIÊN', type: String }],
          [{ value: 'Mỗi sheet là một khóa, đặt tên dạng "Khóa 66". Khi nạp, chọn các sheet (khóa) cần nạp.', type: String }],
          [{ value: 'Bắt buộc: Mã sinh viên, Họ và tên. Các cột khác có thể để trống; ô trống không xóa thông tin đang có.', type: String }],
          [{ value: 'Khóa và ngành được suy từ Lớp hành chính (ĐKT66ĐH → Khóa 66); lớp không suy được thì lấy cột Khóa, rồi tên sheet.', type: String }],
          [{ value: 'Ngày sinh dạng ngày/tháng/năm. Giới tính: Nam, Nữ hoặc Khác.', type: String }],
          [{ value: 'Sinh viên đã có: họ tên và lớp hành chính được cập nhật theo file.', type: String }],
        ],
        sheet: 'Huong dan',
        columns: [{ width: 110 }],
      } as never,
    ],
    studentTemplateFileName,
  );
}
