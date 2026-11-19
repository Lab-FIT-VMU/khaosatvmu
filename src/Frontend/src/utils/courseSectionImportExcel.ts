import type { CellValue } from 'read-excel-file/browser';
import type { SheetData } from 'write-excel-file/browser';
import {
  buildLookupSheet,
  downloadFailedRows,
  templateHeaderRow,
  writeWorkbook,
  type FailedRowExport,
} from './importExcelShared';
import {
  lecturerLookupHeaders,
  lecturerLookupValues,
  lecturerLookupWidths,
  type LecturerLookupRow,
} from './importLookupRows';

const maximumFileSize = 5 * 1024 * 1024;

// Tên cột lấy theo tệp gốc của đơn vị đào tạo, kèm vài biến thể hay gặp.
const courseCodeHeaders = new Set([
  'ma hp',
  'ma hoc phan',
  'ma mon hoc',
  'coursecode',
  'course code',
]);
const courseNameHeaders = new Set([
  'hoc phan',
  'ten hoc phan',
  'ten mon hoc',
  'coursename',
  'course name',
]);
const sectionNameHeaders = new Set([
  'nhom',
  'ten lop',
  'ten lop hoc phan',
  'lop hoc phan',
  'sectionname',
  'section name',
]);
const creditsHeaders = new Set(['tcht', 'so tin chi', 'tin chi', 'credits']);
const classSizeHeaders = new Set(['si so', 'so sinh vien', 'classsize', 'class size']);
const departmentNameHeaders = new Set([
  'bo mon',
  'ten bo mon',
  'bo mon giang vien',
  'departmentname',
  'department name',
]);
const departmentCodeHeaders = new Set([
  'ma bm',
  'ma bo mon',
  'departmentid',
  'department id',
  'departmentcode',
]);
const facultyNameHeaders = new Set([
  'khoa',
  'khoa vien',
  'ten khoa',
  'ten khoa vien',
  'khoa vien giang vien',
  'facultyname',
  'faculty name',
]);
const lecturerNameHeaders = new Set([
  'giang vien',
  'ho va ten giang vien',
  'ho ten giang vien',
  'ten giang vien',
  'lecturerfullname',
]);
const lecturerEmailHeaders = new Set([
  'email',
  'email giang vien',
  'email cong vu',
  'lectureremail',
]);

export interface ImportCourseSectionRow {
  rowNumber: number;
  /** Cột "Mã HP". Tra ngược ra "CourseSections"."CourseId"; chưa có thì tạo học phần mới. */
  courseCode: string;
  /** Cột "Học phần". Dùng khi phải tạo học phần mới. */
  courseName: string;
  /** Cột "Nhóm", chính là tên lớp học phần. */
  sectionName: string;
  /** Cột "TCHT". Dùng khi phải tạo học phần mới. */
  credits: string;
  /** Cột "Sĩ số". */
  classSize: string;
  /** Cột "Bộ môn". Chỉ dùng khi cột "Mã BM" bỏ trống. */
  departmentName: string;
  /** Cột "Mã BM". Được ưu tiên hơn tên bộ môn. */
  departmentCode: string;
  /** Cột "Khoa". */
  facultyName: string;
  /** Cột "Giảng viên". */
  lecturerFullName: string;
  /** Cột "Email". Bỏ trống thì lớp được tạo với giảng viên chưa xác định. */
  lecturerEmail: string;
}

/** Một giảng viên thiếu email do backend trả về sau khi import. */
export interface UnidentifiedLecturer {
  rowNumber: number;
  fullName: string;
  departmentId: number | null;
  departmentName: string | null;
  facultyName: string | null;
  courseCode: string;
  sectionName: string;
  /** Cột "Học phần" của tệp import. */
  courseName: string;
  /** Cột "TCHT" của tệp import. */
  credits: number;
  /** Cột "Sĩ số" của tệp import. */
  classSize: number;
}

export type CourseSectionImportFileErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_EMPTY'
  | 'CODE_HEADER_MISSING'
  | 'SECTION_HEADER_MISSING'
  | 'NO_DATA_ROWS'
  | 'READ_FAILED';

export class CourseSectionImportFileError extends Error {
  public readonly code: CourseSectionImportFileErrorCode;

  constructor(code: CourseSectionImportFileErrorCode) {
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

export const courseSectionTemplateFileName = 'mau-import-lop-hoc-phan.xlsx';
export const unidentifiedLecturerFileName = 'giang-vien-thieu-email.xlsx';

/** Đúng thứ tự cột trong tệp gốc của đơn vị đào tạo. */
export const templateHeader = [
  'Mã HP',
  'Học phần',
  'Nhóm',
  'TCHT',
  'Sĩ số',
  'Bộ môn',
  'Khoa',
  'Giảng viên',
  'Email',
  'Mã BM',
];

/** Bề rộng cột đi kèm templateHeader, dùng chung cho tệp mẫu và tệp thiếu email. */
const templateColumnWidths = [
  { width: 12 },
  { width: 34 },
  { width: 10 },
  { width: 8 },
  { width: 8 },
  { width: 24 },
  { width: 20 },
  { width: 24 },
  { width: 30 },
  { width: 10 },
];

/**
 * Tạo và tải tệp Excel mẫu cho lớp học phần, dựng đúng 10 cột của tệp gốc.
 * Học kỳ lấy từ học kỳ đang chọn trên cây bên trái nên tệp không cần cột học kỳ.
 * Dòng cuối cố tình bỏ trống Email để minh hoạ nhánh giảng viên chưa xác định.
 */
export async function downloadCourseSectionImportTemplate(
  lecturerRows: LecturerLookupRow[] = []
): Promise<void> {
  const rows = [
    [
      '11107E',
      'La bàn từ',
      'N94',
      '2',
      '30',
      'Cơ sở hàng hải',
      'Hàng hải',
      'Bùi Văn Hưng',
      'buivanhung@vimaru.edu.vn',
      '111',
    ],
    [
      '11110',
      'Đại cương hàng hải',
      'N01',
      '2',
      '26',
      'Cơ sở hàng hải',
      'Hàng hải',
      'Nguyễn Văn Quang',
      'nguyenvanquang@vimaru.edu.vn',
      '111',
    ],
    [
      '11216E',
      'Thu nhận và PT các TTTT trên biển',
      'N92',
      '2',
      '39',
      'Hàng hải',
      'Hàng hải',
      'Lê Tuấn Sơn',
      '',
      '112',
    ],
  ];

  const data: SheetData = [
    templateHeaderRow(templateHeader),
    ...rows.map((row) => row.map((value) => ({ value, type: String }))),
  ];

  await writeWorkbook(
    [
      {
        data,
        sheet: 'Lop hoc phan',
        columns: templateColumnWidths,
      } as never,
      buildLookupSheet(
        'Danh sach giang vien',
        lecturerLookupHeaders,
        lecturerRows.map(lecturerLookupValues),
        lecturerLookupWidths
      ),
    ],
    courseSectionTemplateFileName
  );
}

/** Xuất các dòng import hỏng ra tệp để sửa rồi nạp lại. */
export async function downloadCourseSectionFailedRows(rows: FailedRowExport[]): Promise<void> {
  await downloadFailedRows({
    fileName: 'dong-loi-lop-hoc-phan.xlsx',
    sheetName: 'Dong loi',
    headers: templateHeader,
    columnWidths: templateColumnWidths.map((column) => column.width),
    rows,
  });
}

/**
 * Đủ dữ liệu để xuất tệp. Cố ý không đòi `rowNumber` vì danh sách còn đến từ endpoint
 * dựng lại theo phạm vi bộ môn, chỗ đó không có số dòng của tệp import nào cả.
 */
export type UnidentifiedLecturerRow = Omit<UnidentifiedLecturer, 'rowNumber'>;

/**
 * Xuất tệp Excel các lớp có giảng viên thiếu email, ĐÚNG mười cột của tệp import
 * lớp học phần. Người nhận chỉ việc điền thêm cột Email (và Bộ môn / Mã BM / Khoa
 * nếu còn trống) rồi nộp lại thẳng vào chức năng Import, không phải chép tay sang
 * tệp khác.
 *
 * Cố ý để MỘT sheet duy nhất dù danh sách có nhiều bộ môn: hàm đọc tệp chỉ đọc
 * sheet đầu tiên, tách sheet theo bộ môn là mất trắng các bộ môn còn lại khi nhập
 * lại. Các dòng vẫn được xếp liền nhau theo bộ môn để dễ cắt ra gửi từng người.
 */
export async function downloadUnidentifiedLecturerFile(
  lecturers: readonly UnidentifiedLecturerRow[]
): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  // Gom theo bộ môn, giữ nguyên thứ tự xuất hiện trong danh sách.
  const groups = new Map<string, UnidentifiedLecturerRow[]>();
  for (const lecturer of lecturers) {
    const key = lecturer.departmentName ?? '';
    const group = groups.get(key);
    if (group) group.push(lecturer);
    else groups.set(key, [lecturer]);
  }
  const ordered = [...groups.values()].flat();

  const data: SheetData = [
    templateHeader.map((value) => ({ value, type: String, fontWeight: 'bold' as const })),
    ...ordered.map((lecturer) => [
      { value: lecturer.courseCode, type: String },
      { value: lecturer.courseName, type: String },
      { value: lecturer.sectionName, type: String },
      { value: String(lecturer.credits), type: String },
      { value: String(lecturer.classSize), type: String },
      { value: lecturer.departmentName ?? '', type: String },
      { value: lecturer.facultyName ?? '', type: String },
      { value: lecturer.fullName, type: String },
      // Cột phải điền. Để trống chính là lý do lớp này có mặt trong tệp.
      { value: '', type: String },
      { value: lecturer.departmentId === null ? '' : String(lecturer.departmentId), type: String },
    ]),
  ];

  await writeXlsxFile(data, {
    sheet: 'Lop hoc phan',
    columns: templateColumnWidths,
  }).toFile(unidentifiedLecturerFileName);
}

/** Kết quả đọc tệp: các dòng của sheet đã chọn, kèm danh sách sheet để người dùng đổi. */
export interface CourseSectionImportParseResult {
  rows: ImportCourseSectionRow[];
  /** Sheet đang đọc. */
  sheetName: string;
  /** Mọi sheet trong tệp, đúng thứ tự trong tệp. */
  sheetNames: string[];
  /** Các sheet có hàng tiêu đề đủ cột "Mã HP" và "Nhóm". */
  usableSheetNames: string[];
}

type SheetRows = readonly (readonly (CellValue | null)[])[];

/** Hàng đầu có đủ cột Mã HP và Nhóm thì sheet đọc được. */
function isUsableSheet(data: SheetRows): boolean {
  if (data.length === 0) return false;
  const headers = data[0].map((value) => normalizeHeader(cellText(value)));
  return headers.some((header) => courseCodeHeaders.has(header))
    && headers.some((header) => sectionNameHeaders.has(header));
}

/**
 * Đọc tệp .xlsx của danh sách lớp học phần.
 *
 * Tệp có nhiều sheet thì KHÔNG mặc định lấy sheet đầu: trước đây tệp có một sheet nháp đứng
 * trước sheet "Lop hoc phan" bị nạp nhầm mà không ai biết. Không chỉ định thì chọn sheet có
 * đủ cột Mã HP / Nhóm, ưu tiên sheet tên "Lớp học phần"; giao diện báo rõ đang đọc sheet nào
 * và cho đổi.
 */
export async function parseCourseSectionImportFile(
  file: File,
  sheetName?: string,
): Promise<CourseSectionImportParseResult> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new CourseSectionImportFileError('FILE_TYPE');
  }
  if (file.size > maximumFileSize) {
    throw new CourseSectionImportFileError('FILE_SIZE');
  }

  let sheets: { sheet: string; data: SheetRows }[];
  try {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    sheets = await readXlsxFile(file);
  } catch {
    throw new CourseSectionImportFileError('READ_FAILED');
  }

  if (sheets.length === 0) {
    throw new CourseSectionImportFileError('FILE_EMPTY');
  }

  const usable = sheets.filter((item) => isUsableSheet(item.data));
  const chosen = (sheetName ? sheets.find((item) => item.sheet === sheetName) : undefined)
    ?? usable.find((item) => normalizeHeader(item.sheet).replace(/[^a-z0-9]/g, '').includes('lophocphan'))
    ?? usable[0]
    ?? sheets[0];

  return {
    rows: parseSheetRows(chosen.data),
    sheetName: chosen.sheet,
    sheetNames: sheets.map((item) => item.sheet),
    usableSheetNames: usable.map((item) => item.sheet),
  };
}

function parseSheetRows(sheet: SheetRows): ImportCourseSectionRow[] {
  if (sheet.length === 0) {
    throw new CourseSectionImportFileError('FILE_EMPTY');
  }

  const headers = sheet[0].map((value) => normalizeHeader(cellText(value)));
  const indexOf = (candidates: Set<string>) =>
    headers.findIndex((header) => candidates.has(header));

  const codeIndex = indexOf(courseCodeHeaders);
  if (codeIndex < 0) {
    throw new CourseSectionImportFileError('CODE_HEADER_MISSING');
  }
  const sectionIndex = indexOf(sectionNameHeaders);
  if (sectionIndex < 0) {
    throw new CourseSectionImportFileError('SECTION_HEADER_MISSING');
  }

  const courseNameIndex = indexOf(courseNameHeaders);
  const creditsIndex = indexOf(creditsHeaders);
  const classSizeIndex = indexOf(classSizeHeaders);
  const departmentNameIndex = indexOf(departmentNameHeaders);
  const departmentCodeIndex = indexOf(departmentCodeHeaders);
  const facultyIndex = indexOf(facultyNameHeaders);
  const lecturerNameIndex = indexOf(lecturerNameHeaders);
  const lecturerEmailIndex = indexOf(lecturerEmailHeaders);

  const pick = (row: readonly (CellValue | null)[], index: number) =>
    index < 0 ? '' : cellText(row[index]);

  const rows = sheet
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      courseCode: cellText(row[codeIndex]),
      courseName: pick(row, courseNameIndex),
      sectionName: cellText(row[sectionIndex]),
      credits: pick(row, creditsIndex),
      classSize: pick(row, classSizeIndex),
      departmentName: pick(row, departmentNameIndex),
      departmentCode: pick(row, departmentCodeIndex),
      facultyName: pick(row, facultyIndex),
      lecturerFullName: pick(row, lecturerNameIndex),
      lecturerEmail: pick(row, lecturerEmailIndex),
    }))
    .filter((row) => row.courseCode.length > 0 || row.sectionName.length > 0);

  if (rows.length === 0) {
    throw new CourseSectionImportFileError('NO_DATA_ROWS');
  }

  return rows;
}
