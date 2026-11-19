import type { Sheet, SheetData } from 'write-excel-file/browser';

/** Kiểm tra nhanh trước khi gửi; backend vẫn xác thực email khi lưu. */
export function isValidImportEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+$/u.test(value);
}

/**
 * Phần dùng chung của mọi luồng import Excel: kiểu hàng tiêu đề của tệp mẫu, và
 * việc xuất ngược các dòng lỗi ra tệp.
 *
 * Tệp lớp học phần thật có 500-2000 dòng, nên khi import hỏng vài chục dòng thì
 * đọc trên màn hình là không xuể. Xuất riêng các dòng đó ra một tệp giữ nguyên
 * bố cục cột của tệp mẫu, người dùng sửa tại chỗ rồi nạp lại chính tệp đó.
 */

/** Nền vàng của hàng tiêu đề, để phân biệt ngay với dòng dữ liệu. */
export const templateHeaderBackground = '#FFE699';

type HeaderCell = NonNullable<SheetData[number][number]>;

/** Một hàng tiêu đề in đậm trên nền vàng. */
export function templateHeaderRow(labels: string[]): SheetData[number] {
  return labels.map(
    (label): HeaderCell => ({
      value: label,
      type: String,
      fontWeight: 'bold',
      backgroundColor: templateHeaderBackground,
      align: 'center',
      alignVertical: 'center',
      wrap: true,
    })
  );
}

/** Giá trị một ô của sheet tra cứu: để trống bằng chuỗi rỗng hoặc null. */
export type LookupValue = string | number | null;

/**
 * Dựng một sheet tra cứu — sheet thứ hai của tệp mẫu, chứa sẵn danh mục đang có
 * trong hệ thống để người điền tệp khỏi phải tự nhớ mã và tên.
 */
export function buildLookupSheet(
  sheetName: string,
  headers: string[],
  rows: LookupValue[][],
  columnWidths: number[]
): Sheet<unknown> {
  const data: SheetData = [
    templateHeaderRow(headers),
    ...rows.map((row) =>
      row.map((value) => {
        if (value === null || value === '') return null;
        return typeof value === 'number'
          ? { value, type: Number }
          : { value: String(value), type: String };
      })
    ),
  ];

  return {
    data,
    sheet: sheetName,
    columns: columnWidths.map((width) => ({ width })),
  } as Sheet<unknown>;
}

/** Ghi một tệp .xlsx gồm nhiều sheet. */
export async function writeWorkbook(sheets: Sheet<unknown>[], fileName: string): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  // Kiểu của thư viện gắn với FileContent của môi trường, không khớp `unknown`
  // dùng ở chữ ký chung phía trên; nội dung dữ liệu thì vẫn đúng như thư viện đòi.
  await (writeXlsxFile as unknown as (
    sheets: unknown[]
  ) => { toFile: (name: string) => Promise<void> })(sheets).toFile(fileName);
}

/** Một dòng lỗi để xuất ra tệp: các ô đúng thứ tự cột, kèm lý do. */
export interface FailedRowExport {
  /** Số dòng trong tệp gốc, giúp người dùng dò lại đúng chỗ. */
  rowNumber: number;
  values: LookupValue[];
  reason: string;
}

/**
 * Xuất các dòng lỗi ra .xlsx. Cột đầu là số dòng trong tệp gốc, cột cuối là lý do,
 * ở giữa giữ nguyên thứ tự cột của tệp mẫu để sửa xong nạp lại được ngay.
 */
export async function downloadFailedRows(options: {
  fileName: string;
  sheetName: string;
  headers: string[];
  columnWidths: number[];
  rows: FailedRowExport[];
}): Promise<void> {
  const { fileName, sheetName, headers, columnWidths, rows } = options;

  const sheet = buildLookupSheet(
    sheetName,
    ['Dòng trong tệp gốc', ...headers, 'Lý do'],
    rows.map((row) => [row.rowNumber, ...row.values, row.reason]),
    [18, ...columnWidths, 46]
  );

  await writeWorkbook([sheet], fileName);
}
