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

/** Cấu hình cho 1 bảng / 1 Sheet */
export interface ExportSheet<T = any> {
  /** Tên hiển thị trên tab Excel (tối đa 31 ký tự) */
  sheetName: string;
  /** Tiêu đề phân mục bảng (Word / PDF hoặc đầu sheet) */
  title?: string;
  subtitle?: string;
  info?: Record<string, string | number | undefined | null>;
  columns: ExportColumn<T>[];
  data: T[];
  summaryNotes?: string[];
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
  const digits = pattern.includes(',')
    ? target.toLocaleString('vi-VN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    : target.toFixed(decimals);

  return section.replace(pattern, digits).replace(/"([^"]*)"/g, '$1');
}

function formatCurrentDateTime(): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
}

/**
 * Xuất dữ liệu ra file Excel (.xlsx) hỗ trợ nhiều Sheet/Tab với định dạng chuẩn VMU.
 */
export async function exportToExcel(options: AnyExportOptions): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  const multi = normalizeToMultiSheet(options);
  const { fileName, metadata, sheets } = multi;

  const excelSheets: any[] = [];
  const usedSheetNames = new Set<string>();

  for (let sheetIdx = 0; sheetIdx < sheets.length; sheetIdx++) {
    const sheet = sheets[sheetIdx];
    let sheetName = sanitizeSheetName(sheet.sheetName || `Sheet${sheetIdx + 1}`);
    if (usedSheetNames.has(sheetName)) {
      sheetName = sanitizeSheetName(`${sheetName}_${sheetIdx + 1}`);
    }
    usedSheetNames.add(sheetName);

    const columns = sheet.columns;
    const data = sheet.data;
    const colCount = Math.max(columns.length, 4);

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

    // Dòng 2: Phòng ban / Phân hệ
    if (metadata.subInstitution) {
      const subInstRow = new Array(colCount).fill({ value: '', type: String });
      subInstRow[0] = {
        value: metadata.subInstitution.toUpperCase(),
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
    const sheetTitle = sheet.title || (sheets.length > 1 ? `${metadata.title} — ${sheet.sheetName}` : metadata.title);
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

    // Dòng trống trước bảng
    rows.push(new Array(colCount).fill({ value: '', type: String }));

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

    // Bề rộng thật của từng cột, đo dần ngay trong vòng lặp dựng dòng để không
    // phải quét lại toàn bộ dữ liệu lần thứ hai. Khởi tạo bằng độ dài tiêu đề.
    const measuredWidths = columns.map((col) => col.header.length);

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
          if (displayLength > measuredWidths[colIndex]) {
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

    // Ghi chú chân trang nếu có
    const summaryNotes = sheet.summaryNotes || (sheetIdx === sheets.length - 1 ? metadata.summaryNotes : undefined);
    if (summaryNotes && summaryNotes.length > 0) {
      rows.push(new Array(colCount + 1).fill({ value: '', type: String }));
      summaryNotes.forEach((note) => {
        const noteRow = new Array(colCount + 1).fill({ value: '', type: String });
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
    // `col.width` khai báo sẵn không còn là con số cuối cùng mà thành mức SÀN, để
    // các cột hẹp không dính sát nhau. Chặn trên 46 ký tự: ô ghi chú dài lê thê
    // mà cho nở tự do thì kéo cả trang giấy in ra ngoài khổ.
    const columnWidths = [
      { width: 6 }, // STT
      ...columns.map((col, colIndex) => ({
        width: Math.min(
          46,
          Math.max(measuredWidths[colIndex] + 2, col.width ?? 0, 8)
        ),
      })),
    ];

    excelSheets.push({
      sheet: sheetName,
      columns: columnWidths,
      data: rows,
    });
  }

  if (excelSheets.length === 1) {
    await (writeXlsxFile as any)(excelSheets[0].data, {
      sheet: excelSheets[0].sheet,
      columns: excelSheets[0].columns,
    }).toFile(sanitizeFileName(fileName, '.xlsx'));
  } else {
    await (writeXlsxFile as any)(excelSheets).toFile(sanitizeFileName(fileName, '.xlsx'));
  }
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
  } = docx;

  const multi = normalizeToMultiSheet(options);
  const { fileName, metadata, sheets } = multi;

  // Xác định hướng trang: nếu có sheet nào > 6 cột thì chọn landscape
  const maxCols = Math.max(...sheets.map((s) => s.columns.length));
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

  if (metadata.subInstitution) {
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: metadata.subInstitution.toUpperCase(),
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

    const columns = sheet.columns;
    const data = sheet.data;

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

    // Ghi chú dưới bảng
    const summaryNotes = sheet.summaryNotes || (sheetIdx === sheets.length - 1 ? metadata.summaryNotes : undefined);
    if (summaryNotes && summaryNotes.length > 0) {
      summaryNotes.forEach((note) => {
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

  const maxCols = Math.max(...sheets.map((s) => s.columns.length));
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

  if (metadata.subInstitution) {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(metadata.subInstitution.toUpperCase(), margin, currentY);
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

    const columns = sheet.columns;
    const data = sheet.data;

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

    const summaryNotes = sheet.summaryNotes || (sheetIdx === sheets.length - 1 ? metadata.summaryNotes : undefined);
    if (summaryNotes && summaryNotes.length > 0) {
      const lastY = (doc as any).lastAutoTable?.finalY || currentY;
      let noteY = lastY + 5;
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      summaryNotes.forEach((note) => {
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
    }
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
    const totalRows = multi.sheets.reduce((acc, s) => acc + s.data.length, 0);

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
