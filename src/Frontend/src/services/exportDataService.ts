import { toast } from 'sonner';
import { applyVmuFontsToPdf } from '../utils/vmuFontHelper';
import { toVietnameseFileSlug } from '../utils/vietnamese';

export type ExportFormat = 'xlsx' | 'docx' | 'pdf';

export interface ExportColumn<T = any> {
  key: string;
  header: string;
  /** Biến đổi giá trị từ dòng dữ liệu thô sang giá trị hiển thị / xuất */
  format?: (value: any, row: T, index: number) => string | number | boolean | null | undefined;
  /** Kiểu dữ liệu ô Excel: 'string' | 'number' | 'boolean' | 'date' */
  type?: 'string' | 'number' | 'boolean' | 'date';
  /**
   * Mã định dạng số của Excel, chỉ áp cho ô kiểu Number. Dùng cho cột phần trăm
   * và cột điểm: giữ giá trị là SỐ để Excel sắp xếp đúng, nhưng vẫn hiển thị kèm
   * đơn vị. Ví dụ `'0.0"%"'` cho ô mang giá trị 18.2 sẽ hiện "18.2%".
   *
   * Đừng dùng `'0.0%'` — Excel tự nhân 100 với mã đó, giá trị 18.2 sẽ hiện thành
   * "1820.0%". Muốn dùng nó thì phải lưu 0.182.
   */
  numberFormat?: string;
  /** Căn lề dữ liệu: 'left' | 'center' | 'right' */
  align?: 'left' | 'center' | 'right';
  /** Độ rộng cột tương đối (Excel character count / mm trong PDF) */
  width?: number;
}

export interface ExportMetadata {
  /** Cơ quan chủ quản cấp trên (mặc định: TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM) */
  institution?: string;
  /** Đơn vị / Phòng ban phụ trách (ví dụ: PHÒNG ĐẢM BẢO CHẤT LƯỢNG) */
  subInstitution?: string;
  /**
   * Đường dẫn điều hướng tới chỗ có số liệu, in ở dòng thứ hai của tệp — cùng kiểu
   * với thanh trên cùng của hệ thống: đi vào trang nào thì hiện trang đó, vào sâu
   * hơn thì nối thêm cấp dưới. Khai rồi thì dòng thứ hai là đường dẫn này, không
   * dùng `subInstitution` nữa.
   *
   * Ví dụ: ['Thống kê & Báo cáo', 'Theo Khoa/Viện', 'Công ty IMET'].
   */
  breadcrumb?: string[];
  /** Tiêu đề chính của báo cáo / danh mục */
  title: string;
  /** Tiêu đề phụ (ví dụ: Học kỳ 1 - Năm học 2025-2026) */
  subtitle?: string;
  /** Thông tin bổ sung theo dạng cặp khóa - giá trị (ví dụ: Giảng viên, Bộ môn, Ngày xuất...) */
  info?: Record<string, string | number | undefined | null>;
  /** Ghi chú chân trang / căn cứ số liệu */
  summaryNotes?: string[];
  /** Hướng trang PDF: 'portrait' (dọc) hoặc 'landscape' (ngang). Tự động chọn nếu để trống. */
  orientation?: 'portrait' | 'landscape';
}

/**
 * Một bảng trong sheet.
 *
 * Sheet một bảng thì khai thẳng `columns` / `data`; sheet gom nhiều bảng — ví dụ
 * một sheet cho mỗi khoa/viện, trong đó có bảng điểm theo câu, bảng bộ môn, bảng
 * lớp — thì khai ở `tables` để các bảng in nối tiếp trong cùng một tab.
 */
export interface ExportTable<T = any> {
  /** Tiêu đề in ngay trên bảng, ví dụ "Danh sách các bộ môn". */
  title?: string;
  columns: ExportColumn<T>[];
  data: T[];
  /** Ghi chú in ngay dưới bảng này. */
  summaryNotes?: string[];
}

/**
 * Ảnh biểu đồ chèn vào sheet, ngay dưới phần thông tin của sheet và trên bảng đầu
 * tiên — đúng vị trí biểu đồ đứng trên màn hình. Ảnh là PNG dạng data URL (sinh từ
 * canvas) kèm kích thước gốc để giữ đúng tỷ lệ.
 */
export interface ExportChart {
  dataUrl: string;
  width: number;
  height: number;
}

/** Cấu hình cho 1 bảng / 1 Sheet */
export interface ExportSheet<T = any> {
  /** Tên hiển thị trên tab Excel (tối đa 31 ký tự) */
  sheetName: string;
  /** Tiêu đề phân mục bảng (Word / PDF hoặc đầu sheet) */
  title?: string;
  subtitle?: string;
  /** Đường dẫn điều hướng riêng của sheet, in ở dòng thứ hai; thiếu thì lấy của tệp. */
  breadcrumb?: string[];
  info?: Record<string, string | number | undefined | null>;
  /** Ảnh biểu đồ của sheet, in ngay trên bảng đầu tiên. */
  chart?: ExportChart;
  /** Bảng duy nhất của sheet. Để trống khi sheet gom nhiều bảng ở `tables`. */
  columns?: ExportColumn<T>[];
  data?: T[];
  /** Nhiều bảng trong cùng một sheet, in nối tiếp theo thứ tự khai báo. */
  tables?: ExportTable<any>[];
  summaryNotes?: string[];
}

/** Các bảng thật sự của sheet, đã san phẳng hai cách khai báo về một dạng. */
export function tablesOfSheet(sheet: ExportSheet): ExportTable[] {
  if (sheet.tables && sheet.tables.length > 0) return sheet.tables;
  return [{ columns: sheet.columns ?? [], data: sheet.data ?? [] }];
}

/** Số cột rộng nhất của sheet, dùng để chọn hướng trang và bề rộng vùng tiêu đề. */
export function widestTableOf(sheet: ExportSheet): number {
  return Math.max(...tablesOfSheet(sheet).map((table) => table.columns.length), 0);
}

/** Tùy chọn xuất 1 Sheet đơn */
export interface ExportDataOptions<T = any> {
  fileName: string;
  metadata: ExportMetadata;
  columns: ExportColumn<T>[];
  data: T[];
  /** Tên sheet trong file Excel (tối đa 31 ký tự) */
  sheetName?: string;
}

/** Tùy chọn xuất nhiều Sheet / nhiều Section chuyên sâu */
export interface MultiSheetExportOptions {
  fileName: string;
  metadata: ExportMetadata;
  sheets: ExportSheet<any>[];
}

export type AnyExportOptions<T = any> = ExportDataOptions<T> | MultiSheetExportOptions;

export function isMultiSheetOptions(options: AnyExportOptions): options is MultiSheetExportOptions {
  return 'sheets' in options && Array.isArray((options as any).sheets) && (options as any).sheets.length > 0;
}

export function normalizeToMultiSheet(options: AnyExportOptions): MultiSheetExportOptions {
  if (isMultiSheetOptions(options)) {
    return options;
  }
  const single = options as ExportDataOptions;
  return {
    fileName: single.fileName,
    metadata: single.metadata,
    sheets: [
      {
        sheetName: single.sheetName || sanitizeSheetName(single.metadata.title),
        title: single.metadata.title,
        subtitle: single.metadata.subtitle,
        info: single.metadata.info,
        columns: single.columns,
        data: single.data,
        summaryNotes: single.metadata.summaryNotes,
      },
    ],
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ảnh biểu đồ là PNG dạng data URL; bản Word nhận mảng byte chứ không nhận chuỗi. */
function chartImageBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function sanitizeFileName(name: string, ext: string): string {
  const targetExt = ext.startsWith('.') ? ext : `.${ext}`;
  const baseName = name.toLowerCase().endsWith(targetExt.toLowerCase())
    ? name.slice(0, -targetExt.length)
    : name;
  return `${toVietnameseFileSlug(baseName)}${targetExt.toLowerCase()}`;
}

function sanitizeSheetName(name: string): string {
  const clean = name
    .trim()
    .replace(/[\\/:*?[\]]+/g, '_')
    .slice(0, 31);
  return clean || 'DuLieu';
}

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Áp mã định dạng số của Excel cho bản Word và PDF. Hai bộ xuất đó in thẳng chuỗi
 * nên nếu không dựng lại thì mất dấu %, dấu + và số lẻ mà mã định dạng thêm vào —
 * cùng một cột, tệp Excel hiện "18.2%" còn tệp Word hiện "18.2".
 *
 * Chỉ đọc phần mã định dạng đang dùng trong dự án: ba nhánh dương;âm;bằng 0, chữ
 * đặt trong nháy kép, mẫu số dạng 0.00 và dấu +/- viết trước mẫu. Gặp mã lạ hay ô
 * không phải số (ô "—", ô trống) thì trả nguyên chuỗi.
 */
export function applyNumberFormat(value: string | number, numberFormat?: string): string {
  const raw = String(value);
  if (!numberFormat || raw.trim() === '') return raw;

  const parsed = typeof value === 'number' ? value : Number(raw);
  if (!Number.isFinite(parsed)) return raw;

  const sections = numberFormat.split(';');
  const section = sections.length === 1 || parsed > 0
    ? sections[0]
    : parsed < 0
      ? sections[1] ?? sections[0]
      : sections[2] ?? sections[0];

  const pattern = section.match(/[0#][0#,]*(\.[0#]+)?/)?.[0];
  if (!pattern) return raw;

  // Mã một nhánh tự mang dấu âm; mã nhiều nhánh đã viết sẵn dấu nên chỉ lấy trị tuyệt đối.
  const target = sections.length === 1 ? parsed : Math.abs(parsed);
  const decimals = pattern.includes('.') ? pattern.split('.')[1].length : 0;
  // Mã định dạng của Excel luôn viết dấu chấm cho phần thập phân, còn bản Word/PDF
  // in thẳng chuỗi nên phải đổi sang dấu phẩy cho khớp bảng trên màn hình — màn hình
  // dùng Intl vi-VN, ô Excel cũng hiển thị theo locale của máy.
  const digits = pattern.includes(',')
    ? target.toLocaleString('vi-VN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    : target.toFixed(decimals).replace('.', ',');

  return section.replace(pattern, digits).replace(/"([^"]*)"/g, '$1');
}

/** Nối các cấp của đường dẫn điều hướng thành một dòng, giống breadcrumb trên web. */
function breadcrumbLine(segments?: string[]): string | undefined {
  const parts = (segments ?? []).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(' › ') : undefined;
}

function formatCurrentDateTime(): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
}

/** Sheet đã dựng xong phần dòng, sẵn sàng ghi ra tệp. */
interface BuiltExcelSheet {
  sheetName: string;
  rows: any[];
  columnWidths: { width: number }[];
  /** Số dòng đầu của sheet (cơ quan, tiêu đề, thông tin, ngày xuất) trước bảng đầu. */
  headerRowCount: number;
  chart?: ExportChart;
}

/**
 * Dựng toàn bộ dòng của một sheet: phần đầu trang, rồi từng bảng và ghi chú.
 *
 * Tách khỏi hàm ghi tệp vì có hai đường ghi: `write-excel-file` cho sheet thường và
 * ExcelJS cho sheet có ảnh biểu đồ (`write-excel-file` không chèn được ảnh). Cả hai
 * đường dùng chung đúng bộ dòng này nên bản Excel vẫn một kiểu trình bày.
 */
async function buildExcelSheet(
  sheet: ExportSheet<any>,
  metadata: ExportMetadata,
  sheetIdx: number,
  sheetCount: number,
): Promise<BuiltExcelSheet> {
  const tables = tablesOfSheet(sheet);
  const colCount = Math.max(...tables.map((table) => table.columns.length + 1), 4);

    const rows: any[] = [];

    // Dòng 1: Tên cơ quan chủ quản
    const instRow = new Array(colCount).fill({ value: '', type: String });
    instRow[0] = {
      value: (metadata.institution || 'TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM').toUpperCase(),
      type: String,
      fontWeight: 'bold',
      fontSize: 11,
      color: '#0f4c81',
    };
    rows.push(instRow);

    // Dòng 2: đường dẫn điều hướng tới chỗ có số liệu, hoặc đơn vị phụ trách nếu
    // chỗ gọi chưa khai đường dẫn.
    const secondLine = breadcrumbLine(sheet.breadcrumb ?? metadata.breadcrumb)
      ?? metadata.subInstitution;
    if (secondLine) {
      const subInstRow = new Array(colCount).fill({ value: '', type: String });
      subInstRow[0] = {
        value: secondLine.toUpperCase(),
        type: String,
        fontWeight: 'bold',
        fontSize: 10,
        color: '#555555',
      };
      rows.push(subInstRow);
    }

    // Dòng trống
    rows.push(new Array(colCount).fill({ value: '', type: String }));

    // Dòng tiêu đề Sheet
    const sheetTitle = sheet.title || (sheetCount > 1 ? `${metadata.title} — ${sheet.sheetName}` : metadata.title);
    const titleRow = new Array(colCount).fill({ value: '', type: String });
    titleRow[0] = {
      value: sheetTitle.toUpperCase(),
      type: String,
      fontWeight: 'bold',
      fontSize: 13,
      color: '#0f4c81',
    };
    rows.push(titleRow);

    // Dòng tiêu đề phụ (nếu có)
    const subTitle = sheet.subtitle || metadata.subtitle;
    if (subTitle) {
      const subtitleRow = new Array(colCount).fill({ value: '', type: String });
      subtitleRow[0] = {
        value: subTitle,
        type: String,
        fontStyle: 'italic',
        fontSize: 10,
        color: '#333333',
      };
      rows.push(subtitleRow);
    }

    // Thông tin metadata bổ sung
    const combinedInfo = { ...(metadata.info || {}), ...(sheet.info || {}) };
    if (Object.keys(combinedInfo).length > 0) {
      Object.entries(combinedInfo).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          const infoRow = new Array(colCount).fill({ value: '', type: String });
          infoRow[0] = { value: `${key}:`, type: String, fontWeight: 'bold', fontSize: 9.5 };
          infoRow[1] = { value: String(val), type: String, fontSize: 9.5 };
          rows.push(infoRow);
        }
      });
    }

    // Dòng xuất ngày giờ
    const dateRow = new Array(colCount).fill({ value: '', type: String });
    dateRow[0] = {
      value: `Thời gian xuất: ${formatCurrentDateTime()}`,
      type: String,
      fontStyle: 'italic',
      fontSize: 9,
      color: '#666666',
    };
    rows.push(dateRow);

    // Bề rộng thật của từng cột, đo dần ngay trong vòng lặp dựng dòng để không
    // phải quét lại toàn bộ dữ liệu lần thứ hai. Khởi tạo bằng 0 rồi cộng dồn
    // qua từng bảng, vì các bảng trong cùng sheet dùng chung một hệ cột.
    const measuredWidths: number[] = new Array(Math.max(0, colCount - 1)).fill(0);
    // `col.width` khai báo sẵn là mức SÀN, lấy mức lớn nhất trong các bảng cùng sheet.
    const declaredWidths: number[] = [];
    tables.forEach((table) => {
      table.columns.forEach((col, colIndex) => {
        declaredWidths[colIndex] = Math.max(declaredWidths[colIndex] ?? 0, col.width ?? 0);
      });
    });

    const headerRowCount = rows.length;

    for (let tableIdx = 0; tableIdx < tables.length; tableIdx++) {
      const table = tables[tableIdx];
      const columns = table.columns;
      const data = table.data;

      // Dòng trống trước bảng
      rows.push(new Array(colCount).fill({ value: '', type: String }));

      // Tiêu đề phân mục. Sheet gom nhiều bảng thì mỗi bảng phải nói rõ mình là
      // phần nào; sheet một bảng đã có tiêu đề của chính sheet ở trên.
      if (table.title && tables.length > 1) {
        const tableTitleRow = new Array(colCount).fill({ value: '', type: String });
        tableTitleRow[0] = {
          value: table.title.toUpperCase(),
          type: String,
          fontWeight: 'bold',
          fontSize: 11,
          color: '#14415c',
        };
        rows.push(tableTitleRow);
      }

      // Header của bảng dữ liệu. Nền sáng chữ đậm thay vì nền xanh đặc chữ trắng:
      // bảng rộng mấy chục cột mà cả dải tiêu đề tối om thì nhìn nặng và in ra tốn
      // mực. Viền dưới đậm là đủ để tách tiêu đề khỏi phần dữ liệu.
      const headerFill = '#e3edf5';
      const headerText = '#14415c';
      const headerRow = [
        {
          value: 'STT',
          type: String,
          fontWeight: 'bold',
          align: 'center',
          backgroundColor: headerFill,
          color: headerText,
          bottomBorderColor: '#0f4c81',
          bottomBorderStyle: 'medium',
        },
        ...columns.map((col) => ({
          value: col.header,
          type: String,
          fontWeight: 'bold',
          align: col.align || (col.type === 'number' ? 'right' : 'left'),
          backgroundColor: headerFill,
          color: headerText,
          bottomBorderColor: '#0f4c81',
          bottomBorderStyle: 'medium',
          wrap: true,
        })),
      ];
      rows.push(headerRow);

      columns.forEach((col, colIndex) => {
        measuredWidths[colIndex] = Math.max(measuredWidths[colIndex] ?? 0, col.header.length);
      });

      // Dòng dữ liệu
      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        if (rowIndex > 0 && rowIndex % 300 === 0) {
          await yieldToMain();
        }
        const row = data[rowIndex];
        const isEven = rowIndex % 2 === 1;
        const bgColor = isEven ? '#f8fafc' : '#ffffff';

        const dataRow = [
          {
            value: rowIndex + 1,
            type: Number,
            align: 'center',
            backgroundColor: bgColor,
          },
          ...columns.map((col, colIndex) => {
            let rawVal = (row as any)[col.key];
            if (col.format) {
              rawVal = col.format(rawVal, row, rowIndex);
            }

            // Ô số hiển thị theo numberFormat nên chuỗi hiện ra có thể dài hơn giá
            // trị thô (thêm dấu %, thêm số lẻ). Cộng thêm phần đuôi của mã định dạng
            // để cột không bị hụt đúng vài ký tự.
            const displayLength = rawVal === null || rawVal === undefined
              ? 0
              : String(rawVal).length + (col.numberFormat ? 1 : 0);
            if (displayLength > (measuredWidths[colIndex] ?? 0)) {
              measuredWidths[colIndex] = displayLength;
            }

            let cellType: any = String;
            let cellVal: any = rawVal;
            const align = col.align || (col.type === 'number' ? 'right' : 'left');

            if (rawVal === null || rawVal === undefined) {
              cellVal = '';
            } else if (typeof rawVal === 'number') {
              cellType = Number;
            } else if (typeof rawVal === 'boolean') {
              cellVal = rawVal ? 'Có' : 'Không';
            } else if (col.type === 'number') {
              const num = Number(rawVal);
              if (!isNaN(num)) {
                cellType = Number;
                cellVal = num;
              } else {
                cellVal = String(rawVal);
              }
            } else {
              cellVal = String(rawVal);
            }

            return {
              value: cellVal,
              type: cellType,
              align,
              backgroundColor: bgColor,
              // Chỉ ô số mới nhận mã định dạng; gắn vào ô chữ là Excel báo hỏng tệp.
              ...(cellType === Number && col.numberFormat
                ? { format: col.numberFormat }
                : {}),
            };
          }),
        ];
        rows.push(dataRow);
      }

      // Ghi chú riêng của bảng này, in ngay dưới bảng.
      if (table.summaryNotes && table.summaryNotes.length > 0) {
        table.summaryNotes.forEach((note) => {
          const noteRow = new Array(colCount).fill({ value: '', type: String });
          noteRow[0] = {
            value: `* ${note}`,
            type: String,
            fontStyle: 'italic',
            fontSize: 9,
            color: '#666666',
          };
          rows.push(noteRow);
        });
      }

      // Ngăn cách giữa hai bảng trong cùng sheet.
      if (tableIdx < tables.length - 1) {
        rows.push(new Array(colCount).fill({ value: '', type: String }));
      }
    }

    // Ghi chú chân trang nếu có
    const summaryNotes = sheet.summaryNotes || (sheetIdx === sheetCount - 1 ? metadata.summaryNotes : undefined);
    if (summaryNotes && summaryNotes.length > 0) {
      rows.push(new Array(colCount).fill({ value: '', type: String }));
      summaryNotes.forEach((note) => {
        const noteRow = new Array(colCount).fill({ value: '', type: String });
        noteRow[0] = {
          value: `* ${note}`,
          type: String,
          fontStyle: 'italic',
          fontSize: 9,
          color: '#666666',
        };
        rows.push(noteRow);
      });
    }

    // Bề rộng cột co theo nội dung thật. Trước đây chỉ đoán theo độ dài TIÊU ĐỀ
    // nên cột chứa tên học phần dài luôn bị cắt, còn tiêu đề dài như "Phiếu hợp
    // lệ" thì bị xuống dòng dù dữ liệu bên dưới chỉ có hai chữ số.
    //
    // Chặn trên 46 ký tự: ô ghi chú dài lê thê mà cho nở tự do thì kéo cả trang
    // giấy in ra ngoài khổ.
    const columnWidths = [
      { width: 6 }, // STT
      ...measuredWidths.map((measured, colIndex) => ({
        width: Math.min(46, Math.max(measured + 2, declaredWidths[colIndex] ?? 0, 8)),
      })),
    ];

    return {
      sheetName: sanitizeSheetName(sheet.sheetName || `Sheet${sheetIdx + 1}`),
      rows,
      columnWidths,
      headerRowCount,
      chart: sheet.chart,
    };
}

/** Ghi một sheet đã dựng sẵn bằng `write-excel-file`. */
async function writeExcelWithPlainWriter(
  fileName: string,
  built: BuiltExcelSheet[],
): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  const excelSheets = built.map((item, index) => {
    let sheetName = item.sheetName;
    const isDuplicate = built
      .slice(0, index)
      .some((previous) => previous.sheetName === sheetName);
    if (isDuplicate) sheetName = sanitizeSheetName(`${sheetName}_${index + 1}`);
    return { sheet: sheetName, columns: item.columnWidths, data: item.rows };
  });

  if (excelSheets.length === 1) {
    await (writeXlsxFile as any)(excelSheets[0].data, {
      sheet: excelSheets[0].sheet,
      columns: excelSheets[0].columns,
    }).toFile(sanitizeFileName(fileName, '.xlsx'));
  } else {
    await (writeXlsxFile as any)(excelSheets).toFile(sanitizeFileName(fileName, '.xlsx'));
  }
}

/** Đổi '#rrggbb' sang ARGB mà ExcelJS chờ đợi. */
const toArgb = (color: string): string =>
  `FF${color.replace('#', '').toUpperCase()}`;

/**
 * Ghi tệp Excel bằng ExcelJS — dùng khi sheet có ảnh biểu đồ, vì `write-excel-file`
 * không chèn được ảnh. Bộ dòng vẫn do `buildExcelSheet` dựng nên hai đường ghi cho
 * ra cùng một cách trình bày.
 */
async function writeExcelWithImages(
  fileName: string,
  built: BuiltExcelSheet[],
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VMU Survey System';
  workbook.lastModifiedBy = 'VMU Survey System';
  workbook.created = new Date();
  workbook.modified = new Date();

  const usedSheetNames = new Set<string>();

  for (let sheetIdx = 0; sheetIdx < built.length; sheetIdx++) {
    const item = built[sheetIdx];
    let sheetName = item.sheetName;
    if (usedSheetNames.has(sheetName)) {
      sheetName = sanitizeSheetName(`${sheetName}_${sheetIdx + 1}`);
    }
    usedSheetNames.add(sheetName);

    const ws = workbook.addWorksheet(sheetName, { views: [{ showGridLines: true }] });
    item.columnWidths.forEach((column, index) => {
      ws.getColumn(index + 1).width = column.width;
    });

    const styleRow = (cells: any[], rowNumber: number) => {
      // Dòng dữ liệu là dòng có nền xen kẽ hoặc mã định dạng số; dòng tiêu đề, dòng
      // trống và dòng ghi chú không có hai thứ đó nên không bị kẻ viền thành ô rỗng.
      const isDataRow = cells.some((cell) => Boolean(cell?.backgroundColor || cell?.format));
      const row = ws.getRow(rowNumber);
      cells.forEach((cell, cellIndex) => {
        const target = row.getCell(cellIndex + 1);
        target.value = cell?.value ?? '';
        const font: Record<string, unknown> = { name: 'Arial' };
        if (cell?.fontSize) font.size = cell.fontSize; else font.size = 10;
        if (cell?.fontWeight === 'bold') font.bold = true;
        if (cell?.fontStyle === 'italic') font.italic = true;
        if (cell?.color) font.color = { argb: toArgb(cell.color) };
        target.font = font as any;
        target.alignment = {
          horizontal: cell?.align === 'right' ? 'right' : cell?.align === 'center' ? 'center' : 'left',
          vertical: 'middle',
          wrapText: Boolean(cell?.wrap),
        };
        if (cell?.backgroundColor && cell.backgroundColor !== '#ffffff') {
          target.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: toArgb(cell.backgroundColor) },
          };
        }
        if (cell?.bottomBorderStyle === 'medium') {
          target.border = {
            bottom: { style: 'medium', color: { argb: toArgb(cell.bottomBorderColor || '#0f4c81') } },
          };
        } else if (isDataRow) {
          target.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        }
        if (cell?.format) target.numFmt = cell.format;
      });
      return row;
    };

    // Phần đầu trang, rồi tới ảnh biểu đồ (nếu có), rồi mới tới các bảng.
    let cursor = 1;
    for (const row of item.rows.slice(0, item.headerRowCount)) {
      styleRow(row, cursor);
      cursor += 1;
    }

    if (item.chart) {
      const imageId = workbook.addImage({
        base64: item.chart.dataUrl,
        extension: 'png',
      });
      const chartWidth = 900;
      const chartHeight = Math.round(chartWidth * (item.chart.height / item.chart.width));
      ws.addImage(imageId, {
        // Ảnh neo vào dòng đang trống; ảnh nằm đè lên các dòng phía dưới nên phải
        // nhảy con trỏ qua đủ số dòng mà ảnh chiếm (mỗi dòng ~20px).
        tl: { col: 0, row: cursor - 1 },
        ext: { width: chartWidth, height: chartHeight },
        editAs: 'oneCell',
      });
      cursor += Math.ceil(chartHeight / 20) + 2;
    }

    for (const row of item.rows.slice(item.headerRowCount)) {
      styleRow(row, cursor);
      cursor += 1;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    sanitizeFileName(fileName, '.xlsx'),
  );
}

/**
 * Xuất dữ liệu ra file Excel (.xlsx) hỗ trợ nhiều Sheet/Tab với định dạng chuẩn VMU.
 */
export async function exportToExcel(options: AnyExportOptions): Promise<void> {
  const multi = normalizeToMultiSheet(options);
  const { fileName, metadata, sheets } = multi;

  const built: BuiltExcelSheet[] = [];
  for (let sheetIdx = 0; sheetIdx < sheets.length; sheetIdx++) {
    built.push(await buildExcelSheet(sheets[sheetIdx], metadata, sheetIdx, sheets.length));
  }

  // Sheet có ảnh biểu đồ thì phải đi đường ExcelJS; còn lại giữ nguyên đường cũ.
  if (built.some((item) => item.chart)) {
    await writeExcelWithImages(fileName, built);
    return;
  }

  await writeExcelWithPlainWriter(fileName, built);
}

/**
 * Xuất dữ liệu ra file Word (.docx) theo thể thức chuẩn văn bản VMU, hỗ trợ nhiều bảng / phân mục.
 */
export async function exportToWord(options: AnyExportOptions): Promise<void> {
  const docx = await import('docx');
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    HeadingLevel,
    AlignmentType,
    WidthType,
    BorderStyle,
    ShadingType,
    Footer,
    PageNumber,
    PageOrientation,
    ImageRun,
  } = docx;

  const multi = normalizeToMultiSheet(options);
  const { fileName, metadata, sheets } = multi;

  // Xác định hướng trang: nếu có bảng nào > 6 cột thì chọn landscape. Sheet gom
  // nhiều bảng thì tính theo bảng rộng nhất của sheet.
  const maxCols = Math.max(...sheets.map(widestTableOf), 0);
  const isLandscape =
    metadata.orientation === 'landscape' ||
    (!metadata.orientation && maxCols > 6);

  const docChildren: any[] = [];

  // Header Quốc hiệu / Tên trường
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: (metadata.institution || 'TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM').toUpperCase(),
          bold: true,
          size: 20, // 10pt
          color: '0F4C81',
        }),
      ],
    })
  );

  // Dòng 2: đường dẫn điều hướng tới chỗ có số liệu, hoặc đơn vị phụ trách.
  const documentBreadcrumb = breadcrumbLine(metadata.breadcrumb) ?? metadata.subInstitution;
  if (documentBreadcrumb) {
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: documentBreadcrumb.toUpperCase(),
            bold: true,
            size: 18, // 9pt
            color: '555555',
          }),
        ],
      })
    );
  }

  // Dòng kẻ ngăn cách
  docChildren.push(
    new Paragraph({
      spacing: { after: 150 },
      border: {
        bottom: {
          color: '0F4C81',
          space: 1,
          style: BorderStyle.SINGLE,
          size: 6,
        },
      },
    })
  );

  // Tiêu đề báo cáo chính
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 150, after: 80 },
      children: [
        new TextRun({
          text: metadata.title.toUpperCase(),
          bold: true,
          size: 26, // 13pt
          color: '0F4C81',
        }),
      ],
    })
  );

  // Tiêu đề phụ
  if (metadata.subtitle) {
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: metadata.subtitle,
            italics: true,
            size: 20, // 10pt
            color: '444444',
          }),
        ],
      })
    );
  }

  // Thông tin metadata chung
  if (metadata.info) {
    Object.entries(metadata.info).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        docChildren.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `• ${key}: `, bold: true, size: 19 }),
              new TextRun({ text: String(val), size: 19 }),
            ],
          })
        );
      }
    });
  }

  // Thời gian xuất
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 150 },
      children: [
        new TextRun({
          text: `Thời gian xuất: ${formatCurrentDateTime()}`,
          italics: true,
          size: 16, // 8pt
          color: '777777',
        }),
      ],
    })
  );

  // Render từng bảng / phân mục (Sheet)
  for (let sheetIdx = 0; sheetIdx < sheets.length; sheetIdx++) {
    const sheet = sheets[sheetIdx];
    // Tiêu đề phân mục nếu có nhiều hơn 1 bảng
    if (sheets.length > 1 || sheet.title) {
      const sectionHeading = sheet.title || `${sheetIdx + 1}. ${sheet.sheetName.toUpperCase()}`;
      docChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({
              text: sectionHeading,
              bold: true,
              size: 22, // 11pt
              color: '0F4C81',
            }),
          ],
        })
      );
    }

    if (sheet.subtitle) {
      docChildren.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: sheet.subtitle,
              italics: true,
              size: 18,
              color: '555555',
            }),
          ],
        })
      );
    }

    // Sheet có thể gom nhiều bảng: mỗi bảng in một tiêu đề nhỏ rồi tới bảng dữ liệu.
    const tables = tablesOfSheet(sheet);

    // Sheet nhiều phân mục (mỗi khoa một phân mục) thì in đường dẫn riêng của phân
    // mục đó; tệp một phân mục đã có đường dẫn chung ở đầu tệp rồi.
    const sheetBreadcrumb = breadcrumbLine(sheet.breadcrumb);
    if (sheetBreadcrumb && sheets.length > 1) {
      docChildren.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: sheetBreadcrumb,
              italics: true,
              size: 18,
              color: '555555',
            }),
          ],
        })
      );
    }

    // Ảnh biểu đồ của sheet đứng ngay trên bảng đầu tiên, đúng như trên màn hình.
    if (sheet.chart) {
      const chartWidth = 620;
      const chartHeight = Math.round(chartWidth * (sheet.chart.height / sheet.chart.width));
      docChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 160 },
          children: [
            new ImageRun({
              type: 'png',
              data: chartImageBytes(sheet.chart.dataUrl),
              transformation: { width: chartWidth, height: chartHeight },
            }),
          ],
        })
      );
    }

    for (const exportTable of tables) {
      const columns = exportTable.columns;
      const data = exportTable.data;

      // Tiêu đề phân mục của bảng trong sheet gom nhiều bảng.
      if (exportTable.title && tables.length > 1) {
        docChildren.push(
          new Paragraph({
            spacing: { before: 160, after: 60 },
            children: [
              new TextRun({
                text: exportTable.title,
                bold: true,
                size: 20,
                color: '14415C',
              }),
            ],
          })
        );
      }

      // Header bảng
      const headerRow = new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            shading: { fill: '0F4C81', type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'STT', bold: true, color: 'FFFFFF', size: 17 }),
                ],
              }),
            ],
          }),
          // Tên cột luôn căn giữa, không theo căn lề của dữ liệu bên dưới: cột số căn
          // phải làm tên cột dạt hẳn sang mép, nhìn như lệch hàng.
          ...columns.map((col) => new TableCell({
            shading: { fill: '0F4C81', type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: col.header, bold: true, color: 'FFFFFF', size: 17 }),
                ],
              }),
            ],
          })),
        ],
      });

      // Dòng dữ liệu
      const dataRows: any[] = [];
      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        if (rowIndex > 0 && rowIndex % 300 === 0) {
          await yieldToMain();
        }
        const row = data[rowIndex];
        const isEven = rowIndex % 2 === 1;
        const fill = isEven ? 'F8FAFC' : 'FFFFFF';

        dataRows.push(
          new TableRow({
            children: [
              new TableCell({
                shading: { fill, type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: String(rowIndex + 1), size: 17 })],
                  }),
                ],
              }),
              ...columns.map((col) => {
                let val = (row as any)[col.key];
                if (col.format) {
                  val = col.format(val, row, rowIndex);
                }
                const displayVal = val === null || val === undefined
                  ? ''
                  : applyNumberFormat(val as string | number, col.numberFormat);

                const alignment =
                  col.align === 'center'
                    ? AlignmentType.CENTER
                    : col.align === 'right' || col.type === 'number'
                    ? AlignmentType.RIGHT
                    : AlignmentType.LEFT;

                return new TableCell({
                  shading: { fill, type: ShadingType.CLEAR },
                  children: [
                    new Paragraph({
                      alignment,
                      children: [new TextRun({ text: displayVal, size: 17 })],
                    }),
                  ],
                });
              }),
            ],
          })
        );
      }

      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
      });

      docChildren.push(table);

      // Ghi chú riêng của bảng, in ngay dưới bảng đó.
      if (exportTable.summaryNotes && exportTable.summaryNotes.length > 0) {
        exportTable.summaryNotes.forEach((note) => {
          docChildren.push(
            new Paragraph({
              spacing: { before: 60, after: 40 },
              children: [
                new TextRun({
                  text: `* ${note}`,
                  italics: true,
                  size: 16,
                  color: '666666',
                }),
              ],
            })
          );
        });
      }
    }

    // Ghi chú chân trang của sheet, in sau khi hết mọi bảng của sheet đó.
    const sheetNotes = sheet.summaryNotes || (sheetIdx === sheets.length - 1 ? metadata.summaryNotes : undefined);
    if (sheetNotes && sheetNotes.length > 0) {
      sheetNotes.forEach((note) => {
        docChildren.push(
          new Paragraph({
            spacing: { before: 60, after: 40 },
            children: [
              new TextRun({
                text: `* ${note}`,
                italics: true,
                size: 16,
                color: '666666',
              }),
            ],
          })
        );
      });
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Hệ thống Khảo sát & Đảm bảo Chất lượng VMU • Trang ',
                    size: 16,
                    color: '888888',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: '888888',
                  }),
                  new TextRun({
                    text: ' / ',
                    size: 16,
                    color: '888888',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: '888888',
                  }),
                ],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, sanitizeFileName(fileName, '.docx'));
}

/**
 * Xuất dữ liệu ra file PDF (.pdf) với font tiếng Việt Unicode và bố cục chuẩn in ấn.
 */
export async function exportToPdf(options: AnyExportOptions): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const multi = normalizeToMultiSheet(options);
  const { fileName, metadata, sheets } = multi;

  // Sheet gom nhiều bảng thì lấy bảng rộng nhất để chọn hướng trang.
  const maxCols = Math.max(...sheets.map(widestTableOf), 0);
  const isLandscape =
    metadata.orientation === 'landscape' ||
    (!metadata.orientation && maxCols > 6);

  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Áp dụng font tiếng Việt UTF-8
  const hasVmuFont = await applyVmuFontsToPdf(doc);
  const activeFont = hasVmuFont ? 'Roboto' : 'helvetica';

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  let currentY = margin;

  // Header: Tên trường & Phân hệ
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 76, 129);
  doc.text((metadata.institution || 'TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM').toUpperCase(), margin, currentY);
  currentY += 5;

  // Dòng 2: đường dẫn điều hướng tới chỗ có số liệu, hoặc đơn vị phụ trách.
  const documentBreadcrumb = breadcrumbLine(metadata.breadcrumb) ?? metadata.subInstitution;
  if (documentBreadcrumb) {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(documentBreadcrumb.toUpperCase(), margin, currentY);
    currentY += 5;
  }

  // Dòng kẻ phân cách trên
  doc.setDrawColor(15, 76, 129);
  doc.setLineWidth(0.5);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 7;

  // Tiêu đề báo cáo
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 76, 129);
  doc.text(metadata.title.toUpperCase(), pageWidth / 2, currentY, { align: 'center' });
  currentY += 6;

  // Tiêu đề phụ
  if (metadata.subtitle) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    doc.text(metadata.subtitle, pageWidth / 2, currentY, { align: 'center' });
    currentY += 5;
  }

  // Thông tin metadata bổ sung
  if (metadata.info) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(50, 50, 50);

    const entries = Object.entries(metadata.info).filter(
      ([_, val]) => val !== undefined && val !== null && val !== ''
    );

    entries.forEach(([key, val]) => {
      const fullText = `• ${key}: ${val}`;
      const lines = doc.splitTextToSize(fullText, pageWidth - margin * 2);
      doc.text(lines, margin, currentY);
      currentY += lines.length * 4.2;
    });
  }

  // Ngày giờ xuất
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Thời gian xuất: ${formatCurrentDateTime()}`, pageWidth - margin, currentY, {
    align: 'right',
  });
  currentY += 4;

  // Render từng bảng / phân mục
  for (let sheetIdx = 0; sheetIdx < sheets.length; sheetIdx++) {
    const sheet = sheets[sheetIdx];
    // Nếu bảng tiếp theo làm tràn trang, autoTable tự sang trang mới
    const lastFinalY = (doc as any).lastAutoTable?.finalY;
    if (lastFinalY && lastFinalY > currentY) {
      currentY = lastFinalY + 6;
    }

    if (sheets.length > 1 || sheet.title) {
      if (currentY + 15 > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }
      doc.setFont(activeFont, 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 76, 129);
      const heading = sheet.title || `${sheetIdx + 1}. ${sheet.sheetName.toUpperCase()}`;
      doc.text(heading, margin, currentY);
      currentY += 4.5;
    }

    if (sheet.subtitle) {
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(sheet.subtitle, margin, currentY);
      currentY += 4;
    }

    // Sheet có thể gom nhiều bảng: mỗi bảng một autoTable nối tiếp nhau.
    const tables = tablesOfSheet(sheet);

    // Đường dẫn riêng của phân mục (tệp nhiều phân mục, mỗi khoa một phân mục).
    const sheetBreadcrumb = breadcrumbLine(sheet.breadcrumb);
    if (sheetBreadcrumb && sheets.length > 1) {
      if (currentY + 10 > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }
      doc.setFont(activeFont, 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(85, 85, 85);
      doc.text(sheetBreadcrumb, margin, currentY);
      currentY += 4;
    }

    // Ảnh biểu đồ của sheet, chèn ngay trên bảng đầu tiên và tự sang trang nếu hụt chỗ.
    if (sheet.chart) {
      const chartWidth = pageWidth - margin * 2;
      const chartHeight = (sheet.chart.height / sheet.chart.width) * chartWidth;
      if (currentY + chartHeight > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }
      doc.addImage(sheet.chart.dataUrl, 'PNG', margin, currentY, chartWidth, chartHeight);
      currentY += chartHeight + 6;
    }

    /** In các dòng ghi chú ngay dưới bảng vừa vẽ, tự sang trang khi hết chỗ. */
    const printNotes = (notes?: string[]) => {
      if (!notes || notes.length === 0) return;
      const lastY = (doc as any).lastAutoTable?.finalY || currentY;
      let noteY = lastY + 5;
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      notes.forEach((note) => {
        const lines = doc.splitTextToSize(`* ${note}`, pageWidth - margin * 2) as string[];
        const noteHeight = Math.max(lines.length, 1) * 3.2;
        if (noteY + noteHeight > pageHeight - 15) {
          doc.addPage();
          noteY = margin;
        }
        doc.text(lines, margin, noteY);
        noteY += noteHeight + 1.5;
      });
      currentY = noteY;
    };

    for (const exportTable of tables) {
      if (exportTable.title && tables.length > 1) {
        const lastTitleY = (doc as any).lastAutoTable?.finalY;
        if (lastTitleY && lastTitleY > currentY) currentY = lastTitleY + 6;
        if (currentY + 15 > pageHeight - margin) {
          doc.addPage();
          currentY = margin;
        }
        doc.setFont(activeFont, 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(20, 65, 92);
        doc.text(exportTable.title, margin, currentY);
        currentY += 4.5;
      }

      const columns = exportTable.columns;
      const data = exportTable.data;

      const head = [
        [
          'STT',
          ...columns.map((col) => col.header),
        ],
      ];

      const body: string[][] = [];
      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        if (rowIndex > 0 && rowIndex % 300 === 0) {
          await yieldToMain();
        }
        const row = data[rowIndex];
        body.push([
          String(rowIndex + 1),
          ...columns.map((col) => {
            let val = (row as any)[col.key];
            if (col.format) {
              val = col.format(val, row, rowIndex);
            }
            return val === null || val === undefined
              ? ''
              : applyNumberFormat(val as string | number, col.numberFormat);
          }),
        ]);
      }

      const columnStyles: Record<number, any> = {
        0: { halign: 'center', cellWidth: 10 },
      };

      columns.forEach((col, idx) => {
        const colIdx = idx + 1;
        const halign =
          col.align === 'center'
            ? 'center'
            : col.align === 'right' || col.type === 'number'
            ? 'right'
            : 'left';
        columnStyles[colIdx] = { halign };
      });

      autoTable(doc, {
        startY: currentY,
        head,
        body,
        margin: { left: margin, right: margin, bottom: 15 },
        styles: {
          font: activeFont,
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [15, 76, 129],
          textColor: [255, 255, 255],
          font: activeFont,
          fontStyle: 'bold',
          halign: 'center',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles,
      });

      // Ghi chú riêng của bảng, in ngay dưới bảng đó.
      printNotes(exportTable.summaryNotes);
    }

    // Ghi chú chân trang của sheet, in sau khi hết mọi bảng của sheet đó.
    printNotes(sheet.summaryNotes || (sheetIdx === sheets.length - 1 ? metadata.summaryNotes : undefined));
  }

  const totalPages = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Trang ${pageNumber} / ${totalPages}`, pageWidth - margin, pageHeight - 8, {
      align: 'right',
    });
    doc.text('Hệ thống Khảo sát & Đảm bảo Chất lượng VMU', margin, pageHeight - 8, {
      align: 'left',
    });
  }

  doc.save(sanitizeFileName(fileName, '.pdf'));
}

/**
 * Hàm điều phối chung cho mọi hành động xuất dữ liệu (hỗ trợ cả Single Sheet và Multi Sheet).
 */
export async function exportData(
  format: ExportFormat,
  options: AnyExportOptions
): Promise<void> {
  const formatLabels: Record<ExportFormat, string> = {
    xlsx: 'Excel (.xlsx)',
    docx: 'Word (.docx)',
    pdf: 'PDF (.pdf)',
  };

  const toastId = toast.loading(`Đang khởi tạo tệp ${formatLabels[format]}...`);

  try {
    if (format === 'xlsx') {
      await exportToExcel(options);
    } else if (format === 'docx') {
      await exportToWord(options);
    } else if (format === 'pdf') {
      await exportToPdf(options);
    }

    const multi = normalizeToMultiSheet(options);
    // Sheet gom nhiều bảng thì tổng số dòng là tổng của mọi bảng trong sheet.
    const totalRows = multi.sheets.reduce(
      (acc, s) => acc + tablesOfSheet(s).reduce((sum, t) => sum + t.data.length, 0),
      0,
    );

    toast.success(`Đã xuất thành công tệp ${formatLabels[format]}`, {
      id: toastId,
      description: `Báo cáo: ${multi.metadata.title} (${multi.sheets.length} phân mục / ${totalRows} dòng dữ liệu)`,
    });
  } catch (error) {
    console.error('Export error:', error);
    toast.error(`Xuất tệp ${formatLabels[format]} thất bại`, {
      id: toastId,
      description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
    });
  }
}
