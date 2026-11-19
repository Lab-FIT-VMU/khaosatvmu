import type { CellValue } from 'read-excel-file/browser';

/*
  Chọn sheet khi đọc tệp import Excel của Danh mục đào tạo.

  Trước đây mọi luồng import chỉ đọc sheet ĐẦU TIÊN. Tệp có sheet nháp đứng trước sheet dữ
  liệu (vd "Sheet1" trước "Lop hoc phan") bị nạp nhầm mà không ai biết. Giờ: không chỉ định
  thì chọn sheet có đủ các cột bắt buộc (ưu tiên sheet có tên đúng loại dữ liệu), và trả về
  danh sách sheet để giao diện báo rõ đang đọc sheet nào, cho đổi sheet khác.
*/

export type SheetRows = readonly (readonly (CellValue | null)[])[];

/** Sheet đang đọc và các sheet có trong tệp. */
export interface ImportSheetChoice {
  sheetName: string;
  /** Mọi sheet của tệp, đúng thứ tự trong tệp. */
  sheetNames: string[];
  /** Các sheet có hàng tiêu đề đủ cột bắt buộc. */
  usableSheetNames: string[];
}

/** Kết quả đọc tệp import: các dòng của sheet đã chọn cùng thông tin sheet. */
export interface ImportParseResult<Row> extends ImportSheetChoice {
  rows: Row[];
}

// Dấu thanh tiếng Việt sau khi normalize('NFD') nằm trong dải U+0300..U+036F.
const combiningMarks = /[̀-ͯ]/g;

/** Chuẩn hoá tiêu đề cột / tên sheet: bỏ dấu, chữ thường, gộp khoảng trắng. */
export function normalizeImportHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(combiningMarks, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function headerText(value: CellValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

export interface PickImportSheetOptions {
  /** Sheet người dùng chọn; bỏ trống thì tự chọn. */
  sheetName?: string;
  /** Mỗi phần tử là tập tên cột chấp nhận cho MỘT cột bắt buộc (đã chuẩn hoá). */
  requiredHeaders: readonly ReadonlySet<string>[];
  /**
   * Tên sheet nên ưu tiên khi có nhiều sheet đọc được, dạng bỏ dấu, viết liền, chữ thường
   * (vd "lophocphan", "bomon").
   */
  preferredNames?: readonly string[];
}

/**
 * Đọc tệp và chọn sheet. Ném lỗi của thư viện nếu không đọc được tệp; nơi gọi đổi thành mã
 * lỗi READ_FAILED của luồng import đó.
 */
export async function pickImportSheet(
  file: File,
  options: PickImportSheetOptions,
): Promise<{ data: SheetRows; choice: ImportSheetChoice }> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets: { sheet: string; data: SheetRows }[] = await readXlsxFile(file);

  const isUsable = (data: SheetRows) => {
    if (data.length === 0) return false;
    const headers = data[0].map((value) => normalizeImportHeader(headerText(value)));
    return options.requiredHeaders.every((accepted) => headers.some((header) => accepted.has(header)));
  };
  const compactName = (name: string) => normalizeImportHeader(name).replace(/[^a-z0-9]/g, '');

  const usable = sheets.filter((item) => isUsable(item.data));
  const preferred = options.preferredNames ?? [];
  const chosen = (options.sheetName ? sheets.find((item) => item.sheet === options.sheetName) : undefined)
    ?? usable.find((item) => preferred.some((name) => compactName(item.sheet).includes(name)))
    ?? usable[0]
    ?? sheets[0];

  return {
    data: chosen?.data ?? [],
    choice: {
      sheetName: chosen?.sheet ?? '',
      sheetNames: sheets.map((item) => item.sheet),
      usableSheetNames: usable.map((item) => item.sheet),
    },
  };
}
