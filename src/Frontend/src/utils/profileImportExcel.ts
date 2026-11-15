import type { CellValue } from 'read-excel-file/browser';
import type { SheetData } from 'write-excel-file/browser';
import {
  downloadFailedRows,
  templateHeaderRow,
  type FailedRowExport,
} from './importExcelShared';

const maximumFileSize = 5 * 1024 * 1024;

/**
 * Một vai trò điền được vào tệp Excel: tên tiếng Việt và mã. Danh sách lấy từ bảng
 * "Roles" (màn quản trị truyền vào), nên vai trò người quản trị tự thêm cũng dùng được.
 */
export interface ProfileRoleOption {
  roleCode: string;
  label: string;
}

const fullNameHeaders = new Set([
  'ho ten',
  'ho va ten',
  'ten giang vien',
  'fullname',
  'full name',
  'name',
]);

const emailHeaders = new Set([
  'email giang vien',
  'email',
  'dia chi email',
  'e-mail',
]);

const roleHeaders = new Set([
  'vai tro',
  'vai tro duoc cap',
  'role',
  'rolecode',
  'role code',
]);

export interface ImportProfileRow {
  rowNumber: number;
  fullName: string;
  email: string;
  /** Tên vai trò người dùng điền, đã đối chiếu với danh mục. */
  roleLabel: string;
  roleCode: string;
}

/** Dòng có vai trò không khớp tên nào của hệ thống. */
export interface InvalidRoleRow {
  rowNumber: number;
  email: string;
  rawRole: string;
}

export interface ProfileImportResult {
  rows: ImportProfileRow[];
  invalidRoleRows: InvalidRoleRow[];
}

export type ProfileImportFileErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_EMPTY'
  | 'EMAIL_HEADER_MISSING'
  | 'ROLE_HEADER_MISSING'
  | 'NO_DATA_ROWS'
  | 'READ_FAILED';

export class ProfileImportFileError extends Error {
  public readonly code: ProfileImportFileErrorCode;

  constructor(code: ProfileImportFileErrorCode) {
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

/** Tra vai trò từ tên tiếng Việt hoặc từ chính mã vai trò, bỏ qua dấu và hoa thường. */
function roleCodeFromLabel(value: string, profileRoleOptions: ProfileRoleOption[]): string | null {
  const normalized = normalizeHeader(value);
  if (normalized.length === 0) return null;

  const match = profileRoleOptions.find(
    (option) =>
      normalizeHeader(option.label) === normalized
      || normalizeHeader(option.roleCode) === normalized
  );
  return match?.roleCode ?? null;
}

export const profileTemplateFileName = 'mau-import-ho-so-nguoi-dung.xlsx';

export const profileImportColumns = ['Họ tên', 'Email giảng viên', 'Vai trò'];
const profileColumnWidths = [28, 38, 22];

/** Xuất các dòng import hỏng ra tệp để sửa rồi nạp lại. */
export async function downloadProfileFailedRows(rows: FailedRowExport[]): Promise<void> {
  await downloadFailedRows({
    fileName: 'dong-loi-ho-so-nguoi-dung.xlsx',
    sheetName: 'Dong loi',
    headers: profileImportColumns,
    columnWidths: profileColumnWidths,
    rows,
  });
}

/**
 * Tạo và tải tệp Excel mẫu để cấp hồ sơ hàng loạt.
 *
 * Bố cục theo đúng tệp mẫu của bộ câu hỏi: cột A/B/C là ba cột dùng để import,
 * chừa trống cột D và E, cột F là bảng tra vai trò. Có bảng tra thì người điền
 * không phải nhớ chính xác cách viết tên vai trò.
 */
export async function downloadProfileImportTemplate(profileRoleOptions: ProfileRoleOption[]): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  // Dòng mẫu dùng tên vai trò đang có thật, để tệp mẫu nạp lại được ngay.
  const sampleRoles = profileRoleOptions.map((option) => option.label);
  const sampleRows = [
    { fullName: 'Nguyễn Văn A', email: 'nguyenvana@vimaru.edu.vn', role: sampleRoles[0] ?? '' },
    { fullName: 'Trần Thị B', email: 'tranthib@vimaru.edu.vn', role: sampleRoles[1] ?? sampleRoles[0] ?? '' },
    { fullName: 'Lê Văn C', email: 'levanc@vimaru.edu.vn', role: sampleRoles[2] ?? sampleRoles[0] ?? '' },
  ];

  const [fullNameCell, emailCell, roleCell, , , roleLookupCell] = templateHeaderRow([
    ...profileImportColumns,
    '',
    '',
    'Tên vai trò điền được',
  ]);
  const header: SheetData[number] = [
    fullNameCell,
    emailCell,
    roleCell,
    null,
    null,
    roleLookupCell,
  ];

  // Số dòng mẫu và số vai trò lệch nhau nên bảng bên phải trải dài độc lập.
  const bodyRowCount = Math.max(sampleRows.length, profileRoleOptions.length);
  const body: SheetData = [];

  for (let index = 0; index < bodyRowCount; index += 1) {
    const sample = sampleRows[index];
    const role = profileRoleOptions[index];

    body.push([
      sample ? { value: sample.fullName, type: String } : null,
      sample ? { value: sample.email, type: String } : null,
      sample ? { value: sample.role, type: String } : null,
      null,
      null,
      role ? { value: role.label, type: String } : null,
    ]);
  }

  await writeXlsxFile([header, ...body], {
    sheet: 'Ho so nguoi dung',
    columns: [
      { width: 28 },
      { width: 38 },
      { width: 22 },
      { width: 4 },
      { width: 4 },
      { width: 26 },
    ],
  }).toFile(profileTemplateFileName);
}

/**
 * Đọc tệp Excel cấp hồ sơ. Cột Họ tên chỉ để người điền đối chiếu cho khỏi nhầm
 * người — hệ thống khớp tài khoản bằng EMAIL, không bằng tên.
 */
export async function parseProfileImportFile(
  file: File,
  profileRoleOptions: ProfileRoleOption[],
): Promise<ProfileImportResult> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new ProfileImportFileError('FILE_TYPE');
  }
  if (file.size > maximumFileSize) {
    throw new ProfileImportFileError('FILE_SIZE');
  }

  let sheet;
  try {
    const { readSheet } = await import('read-excel-file/browser');
    sheet = await readSheet(file);
  } catch {
    throw new ProfileImportFileError('READ_FAILED');
  }

  if (sheet.length === 0) {
    throw new ProfileImportFileError('FILE_EMPTY');
  }

  const headers = sheet[0].map((value) => normalizeHeader(cellText(value)));
  const emailIndex = headers.findIndex((header) => emailHeaders.has(header));
  if (emailIndex < 0) {
    throw new ProfileImportFileError('EMAIL_HEADER_MISSING');
  }

  // Tránh bắt trúng cột "Vai trò của hệ thống" của bảng tra bên phải.
  const roleIndex = headers.findIndex(
    (header, index) => index !== emailIndex && roleHeaders.has(header)
  );
  if (roleIndex < 0) {
    throw new ProfileImportFileError('ROLE_HEADER_MISSING');
  }

  const nameIndex = headers.findIndex(
    (header, index) => index !== emailIndex && index !== roleIndex && fullNameHeaders.has(header)
  );

  const dataRows = sheet
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      fullName: nameIndex < 0 ? '' : cellText(row[nameIndex]),
      email: cellText(row[emailIndex]),
      rawRole: cellText(row[roleIndex]),
    }))
    .filter((row) => row.email.length > 0);

  if (dataRows.length === 0) {
    throw new ProfileImportFileError('NO_DATA_ROWS');
  }

  const rows: ImportProfileRow[] = [];
  const invalidRoleRows: InvalidRoleRow[] = [];

  for (const row of dataRows) {
    const roleCode = roleCodeFromLabel(row.rawRole, profileRoleOptions);
    if (!roleCode) {
      invalidRoleRows.push({
        rowNumber: row.rowNumber,
        email: row.email,
        rawRole: row.rawRole,
      });
      continue;
    }

    rows.push({
      rowNumber: row.rowNumber,
      fullName: row.fullName,
      email: row.email.toLowerCase(),
      roleLabel: profileRoleOptions.find((option) => option.roleCode === roleCode)!.label,
      roleCode,
    });
  }

  return { rows, invalidRoleRows };
}
