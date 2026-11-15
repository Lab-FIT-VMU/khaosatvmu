import type { CellValue } from 'read-excel-file/browser';
import type { SheetData } from 'write-excel-file/browser';
import { maximumSectionsPerTemplate } from '../types';
import type { AnswerScale } from '../types';
import {
  buildLookupSheet,
  downloadFailedRows,
  templateHeaderRow,
  writeWorkbook,
  type FailedRowExport,
} from './importExcelShared';

const maximumFileSize = 5 * 1024 * 1024;

// Cột mục, đứng đầu tệp. Bắt buộc điền ở MỌI dòng, kể cả dòng câu bẫy.
const sectionHeaders = new Set([
  'muc',
  'muc cau hoi',
  'nhom',
  'nhom cau hoi',
  'phan',
  'section',
]);

const questionTextHeaders = new Set([
  'noi dung cau hoi',
  'cau hoi',
  'noi dung',
  'questiontext',
  'question text',
  'question',
]);

// Cột mức bắt buộc của câu bẫy độ tập trung, để trống là câu hỏi bình thường.
// So khớp CHÍNH XÁC chứ không so khớp chứa: "Mục" chuẩn hoá thành 'muc', mà ở đây
// có 'muc bat buoc' và 'muc bay' — so khớp chứa là hai cột bắt nhầm nhau.
const attentionCheckHeaders = new Set([
  'dap an bat buoc phai chon',
  'dap an bat buoc',
  'muc bat buoc',
  'cau bay',
  'muc bay',
  'muc dap an bat buoc',
  'attentioncheckvalue',
  'attention check',
]);

export interface ImportSurveyQuestionRow {
  rowNumber: number;
  /** Tên mục như người dùng gõ, giữ nguyên chữ hoa chữ thường của lần đầu xuất hiện. */
  sectionName: string;
  /** Vị trí mục trong danh sách mục đọc được, dùng làm `sectionIndex` khi lưu. */
  sectionIndex: number;
  questionText: string;
  /**
   * Nội dung ô "Đáp án bắt buộc phải chọn" như trong tệp; rỗng là câu hỏi bình
   * thường. Chưa đối chiếu với thang: thang do người dùng chọn trên hộp thoại và có
   * thể đổi sau khi đã đọc tệp, xem `attentionCheckOf`.
   */
  rawAttention: string;
}

export type SurveyTemplateImportFileErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_EMPTY'
  | 'SECTION_HEADER_MISSING'
  | 'QUESTION_HEADER_MISSING'
  | 'NO_DATA_ROWS'
  | 'TOO_MANY_SECTIONS'
  | 'READ_FAILED';

export class SurveyTemplateImportFileError extends Error {
  public readonly code: SurveyTemplateImportFileErrorCode;

  constructor(code: SurveyTemplateImportFileErrorCode) {
    super(code);
    this.code = code;
  }
}

/** Dòng đặt câu bẫy nhưng mức bắt buộc không có trong thang của bộ. */
export interface InvalidAttentionCheckRow {
  rowNumber: number;
  questionText: string;
  rawValue: string;
}

/**
 * Mức bắt buộc của câu bẫy theo thang của bộ: null là câu thường, `undefined` là ô
 * có điền nhưng không phải một mức của thang đó. Cùng luật với backend để người
 * dùng thấy lỗi ngay lúc xem trước, khỏi gửi lên rồi mới bị trả về.
 */
export function attentionCheckOf(
  row: ImportSurveyQuestionRow,
  scale: AnswerScale | undefined
): number | null | undefined {
  if (row.rawAttention.length === 0) return null;
  const required = Number(row.rawAttention);
  return Number.isInteger(required) && scale?.options.some((option) => option.value === required)
    ? required
    : undefined;
}

/**
 * Dòng có vấn đề ở cột Mục.
 * - `MISSING`: bỏ trống tên mục. Hay gặp nhất là do GỘP Ô (merge) cột Mục — thư
 *   viện đọc chỉ trả giá trị cho ô trên cùng, các dòng sau ra rỗng.
 * - `NOT_CONTIGUOUS`: mục quay lại sau khi đã sang mục khác, tức bị cắt làm hai
 *   khúc. Tiêu đề mục hiện trước câu đầu tiên của mục nên không đặt vào đâu được.
 */
export interface InvalidSectionRow {
  rowNumber: number;
  questionText: string;
  sectionName: string;
  reason: 'MISSING' | 'NOT_CONTIGUOUS';
}

export interface SurveyTemplateImportResult {
  /** Tên các mục theo đúng thứ tự xuất hiện trong tệp. */
  sections: string[];
  rows: ImportSurveyQuestionRow[];
  invalidSectionRows: InvalidSectionRow[];
}

// Dấu thanh tiếng Việt sau khi normalize('NFD') nằm trong dải U+0300..U+036F.
const combiningMarks = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Bỏ luôn phần trong ngoặc đơn: tiêu đề thật hay kèm chú thích, vd "Đáp án bắt
 * buộc phải chọn (câu hỏi bẫy)". Chú thích đó là chỗ người soạn hay sửa chữ nhất
 * nên đừng để nó quyết định có nhận ra cột hay không.
 */
function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(combiningMarks, '')
    .replace(/đ/gi, 'd')
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Khoá so tên mục: bỏ dấu, gộp khoảng trắng, không phân biệt hoa thường. */
function sectionKey(value: string): string {
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

export const surveyTemplateTemplateFileName = 'mau-import-bo-cau-hoi.xlsx';

export const surveyTemplateImportColumns = [
  'Mục',
  'Câu hỏi',
  'Đáp án bắt buộc phải chọn (câu hỏi bẫy)',
];
const surveyTemplateColumnWidths = [32, 70, 30];

/**
 * Tạo và tải tệp Excel mẫu cho một bộ câu hỏi khảo sát.
 *
 * Sheet 1 là ba cột dùng để import. Tệp không có cột thang trả lời: cả bộ dùng một
 * thang, chọn trên hộp thoại ngay cạnh tên bộ. Sheet 2 liệt kê các mức của từng
 * thang để người soạn biết điền mức nào cho câu bẫy — nằm ở sheet riêng vì để chung
 * thì chèn, xoá dòng câu hỏi là xô lệch luôn bảng tra bên cạnh.
 *
 * Câu mẫu cố ý trải trên ba mục và có một câu bẫy nằm giữa mục, để người soạn thấy
 * ngay ba điều: tên mục phải LẶP LẠI ở mọi dòng (không gộp ô), câu bẫy cũng phải có
 * mục, và các câu cùng mục phải nằm liền nhau. Tên mục đặt tuỳ ý, tối đa
 * `maximumSectionsPerTemplate` mục.
 */
export async function downloadSurveyTemplateImportTemplate(
  answerScales: AnswerScale[],
  selectedScale?: AnswerScale
): Promise<void> {
  // Mức mẫu cho câu bẫy phải là một mức có thật của thang đang chọn.
  const sampleScale = selectedScale ?? answerScales[0];
  const trapValue = sampleScale?.options?.[Math.floor((sampleScale.options.length - 1) / 2)]?.value;

  // Tên mục chỉ là ví dụ, người soạn đặt tên nào cũng được.
  const courseSection = 'Nội dung đánh giá học phần';
  const lecturerSection = 'Nội dung đánh giá về giảng viên';
  const facilitiesSection = 'Nội dung đánh giá về cơ sở vật chất, phục vụ học tập';

  const sampleRows: {
    sectionName: string;
    questionText: string;
    trap: number | null;
  }[] = [
    {
      sectionName: courseSection,
      questionText: 'Học phần trang bị đầy đủ kiến thức, kỹ năng nghề nghiệp cho người học.',
      trap: null,
    },
    {
      sectionName: courseSection,
      questionText: 'Học liệu và tài liệu tham khảo của học phần đầy đủ, cập nhật.',
      trap: null,
    },
    {
      sectionName: courseSection,
      questionText: trapValue
        ? `Đây là câu hỏi rà soát chất lượng phiếu khảo sát, không đánh giá học phần hay giảng viên. Xin Anh/Chị chọn phương án ${trapValue}.`
        : 'Cách kiểm tra, đánh giá của học phần phản ánh đúng năng lực người học.',
      trap: trapValue ?? null,
    },
    {
      sectionName: lecturerSection,
      questionText: 'Giảng viên trình bày nội dung bài giảng rõ ràng, dễ hiểu.',
      trap: null,
    },
    {
      sectionName: lecturerSection,
      questionText: 'Giảng viên thực hiện nghiêm túc giờ giảng, sử dụng hiệu quả thời gian lên lớp.',
      trap: null,
    },
    {
      sectionName: facilitiesSection,
      questionText: 'Phòng học, trang thiết bị đáp ứng yêu cầu học tập của học phần.',
      trap: null,
    },
  ];

  // Lưu ý đặt ở cột E, cách ba cột nhập một cột trống và gộp dọc suốt các dòng mẫu.
  // Trình đọc tệp chỉ lấy đúng ba cột có tiêu đề nên ô này không bị hiểu thành dữ liệu.
  const sectionNote =
    `LƯU Ý: Tên mục ở cột "Mục" đặt tuỳ ý, mỗi bộ câu hỏi tối đa ${maximumSectionsPerTemplate} mục. `
    + 'Ghi lại tên mục ở từng dòng (không gộp ô) và để các câu cùng mục nằm liền nhau.';

  const data: SheetData = [
    [
      ...templateHeaderRow(surveyTemplateImportColumns),
      null,
      {
        value: sectionNote,
        type: String,
        fontWeight: 'bold',
        textColor: '#B42318',
        wrap: true,
        alignVertical: 'top',
        rowSpan: sampleRows.length + 1,
      },
    ],
    ...sampleRows.map((question) => [
      { value: question.sectionName, type: String },
      { value: question.questionText, type: String },
      question.trap ? { value: question.trap, type: Number } : null,
      null,
      null,
    ]),
  ];

  await writeWorkbook(
    [
      {
        data,
        sheet: 'Bo cau hoi',
        // Cột D để trống làm khoảng cách, cột E rộng cho dòng lưu ý.
        columns: [...surveyTemplateColumnWidths, 4, 60].map((width) => ({ width })),
      } as never,
      buildAnswerScaleLookupSheet(answerScales),
    ],
    surveyTemplateTemplateFileName
  );
}

/**
 * Sheet tra thang trả lời: tên thang và năm mức của nó trải ra năm cột. Thang nào
 * không có mức nào thì bỏ trống đúng ô đó, nên nhìn phát biết ngay thang "Có/Không"
 * chỉ dùng mức 1 và 5 — đó là các số điền được vào cột câu bẫy.
 */
function buildAnswerScaleLookupSheet(answerScales: AnswerScale[]) {
  const rows = answerScales.map((scale) => {
    const optionByValue = new Map(scale.options.map((option) => [option.value, option.displayText]));
    const optionCells = [1, 2, 3, 4, 5].map((value) => optionByValue.get(value) ?? '');

    return [scale.answerScaleName, ...optionCells];
  });

  return buildLookupSheet(
    'Danh sach thang tra loi',
    [
      'Thang trả lời của hệ thống',
      'Đáp án 1',
      'Đáp án 2',
      'Đáp án 3',
      'Đáp án 4',
      'Đáp án 5',
    ],
    rows,
    [38, 22, 22, 22, 22, 22]
  );
}

/** Xuất các dòng import hỏng ra tệp để sửa rồi nạp lại. */
export async function downloadSurveyTemplateFailedRows(rows: FailedRowExport[]): Promise<void> {
  await downloadFailedRows({
    fileName: 'dong-loi-bo-cau-hoi.xlsx',
    sheetName: 'Dong loi',
    headers: surveyTemplateImportColumns,
    columnWidths: surveyTemplateColumnWidths,
    rows,
  });
}

/**
 * Đọc tệp .xlsx chứa danh sách câu hỏi theo mục. Tệp không mang thang trả lời —
 * thang của cả bộ chọn trên hộp thoại — nên mức câu bẫy được đối chiếu sau, bằng
 * `attentionCheckOf`. Dòng sai ở cột Mục được tách riêng để hiển thị cho người
 * dùng thay vì làm hỏng cả lần import.
 */
export async function parseSurveyTemplateImportFile(file: File): Promise<SurveyTemplateImportResult> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new SurveyTemplateImportFileError('FILE_TYPE');
  }
  if (file.size > maximumFileSize) {
    throw new SurveyTemplateImportFileError('FILE_SIZE');
  }

  let sheet;
  try {
    const { readSheet } = await import('read-excel-file/browser');
    sheet = await readSheet(file);
  } catch {
    throw new SurveyTemplateImportFileError('READ_FAILED');
  }

  if (sheet.length === 0) {
    throw new SurveyTemplateImportFileError('FILE_EMPTY');
  }

  const headers = sheet[0].map((value) => normalizeHeader(cellText(value)));
  const questionIndex = headers.findIndex((header) => questionTextHeaders.has(header));
  if (questionIndex < 0) {
    throw new SurveyTemplateImportFileError('QUESTION_HEADER_MISSING');
  }

  const sectionIndex = headers.findIndex(
    (header, index) => index !== questionIndex && sectionHeaders.has(header)
  );
  if (sectionIndex < 0) {
    throw new SurveyTemplateImportFileError('SECTION_HEADER_MISSING');
  }

  // Cột câu bẫy là tùy chọn: bộ không có câu bẫy nào thì bỏ hẳn cột cũng được. Tệp
  // theo mẫu cũ còn cột "Mã thang trả lời" thì cột đó bị bỏ qua.
  const attentionIndex = headers.findIndex(
    (header, index) =>
      index !== questionIndex && index !== sectionIndex && attentionCheckHeaders.has(header)
  );

  const dataRows = sheet
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      sectionName: cellText(row[sectionIndex]),
      questionText: cellText(row[questionIndex]),
      rawAttention: attentionIndex < 0 ? '' : cellText(row[attentionIndex]),
    }))
    .filter((row) => row.questionText.length > 0);

  if (dataRows.length === 0) {
    throw new SurveyTemplateImportFileError('NO_DATA_ROWS');
  }

  // Đọc tuần tự từ trên xuống: gặp mục mới thì mở mục mới, mục đã gặp thì dùng lại
  // đúng mục đó. Mục quay lại sau khi đã sang mục khác là bị cắt khúc, ghi vào danh
  // sách lỗi chứ không tự gộp — tự gộp thì thứ tự câu khi lưu khác thứ tự trong
  // tệp, người dùng không hiểu vì sao.
  const invalidSectionRows: InvalidSectionRow[] = [];
  const sections: string[] = [];
  const sectionIndexByKey = new Map<string, number>();
  const sectionOfRow = new Map<number, number>();
  let previousSectionIndex = -1;

  for (const row of dataRows) {
    if (row.sectionName.length === 0) {
      invalidSectionRows.push({
        rowNumber: row.rowNumber,
        questionText: row.questionText,
        sectionName: '',
        reason: 'MISSING',
      });
      continue;
    }

    const key = sectionKey(row.sectionName);
    const known = sectionIndexByKey.get(key);

    if (known === undefined) {
      sectionIndexByKey.set(key, sections.length);
      sections.push(row.sectionName);
      previousSectionIndex = sections.length - 1;
      sectionOfRow.set(row.rowNumber, previousSectionIndex);
      continue;
    }

    if (known !== previousSectionIndex) {
      invalidSectionRows.push({
        rowNumber: row.rowNumber,
        questionText: row.questionText,
        sectionName: row.sectionName,
        reason: 'NOT_CONTIGUOUS',
      });
      continue;
    }

    sectionOfRow.set(row.rowNumber, known);
  }

  if (sections.length > maximumSectionsPerTemplate) {
    throw new SurveyTemplateImportFileError('TOO_MANY_SECTIONS');
  }

  const rows: ImportSurveyQuestionRow[] = [];

  for (const row of dataRows) {
    const rowSectionIndex = sectionOfRow.get(row.rowNumber);
    // Dòng đã bị bắt lỗi ở vòng đọc mục thì bỏ qua, khỏi báo lỗi chồng lên nhau.
    if (rowSectionIndex === undefined) continue;

    rows.push({
      rowNumber: row.rowNumber,
      sectionName: sections[rowSectionIndex],
      sectionIndex: rowSectionIndex,
      questionText: row.questionText,
      rawAttention: row.rawAttention,
    });
  }

  // Mục mà mọi câu của nó đều lỗi thì không còn câu nào, gửi lên backend sẽ bị
  // trả về SECTION_EMPTY. Dồn lại cho khớp: chỉ giữ mục thật sự còn câu, và đánh
  // lại chỉ số cho các câu.
  const usedSectionIndexes = [...new Set(rows.map((row) => row.sectionIndex))].sort(
    (a, b) => a - b
  );
  const remappedIndexes = new Map(
    usedSectionIndexes.map((original, index) => [original, index])
  );

  return {
    sections: usedSectionIndexes.map((index) => sections[index]),
    rows: rows.map((row) => ({
      ...row,
      sectionIndex: remappedIndexes.get(row.sectionIndex) ?? 0,
    })),
    invalidSectionRows,
  };
}
