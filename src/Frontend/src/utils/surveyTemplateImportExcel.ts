import type { CellValue } from 'read-excel-file/browser';
import type { SheetData } from 'write-excel-file/browser';
import { maximumSectionsPerTemplate } from '../types';
import type { AnswerScale } from '../types';
import { resolveSurveySectionKey, surveySectionName } from './surveySectionCatalog';
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

// Cột mã thang trả lời nằm ngay cạnh cột nội dung câu hỏi.
const answerScaleCodeHeaders = new Set([
  'ma thang tra loi',
  'ma thang',
  'thang tra loi',
  'ma thang tra loi cua he thong',
  'answerscaleid',
  'answer scale id',
  'scale',
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
  /** Tên chuẩn của mục trong danh mục mục cố định, không phải chữ người dùng gõ. */
  sectionName: string;
  /** Vị trí mục trong danh sách mục đọc được, dùng làm `sectionIndex` khi lưu. */
  sectionIndex: number;
  questionText: string;
  /** Mã thang trả lời người dùng điền, đã đối chiếu với danh mục của hệ thống. */
  answerScaleId: number;
  answerScaleName: string;
  /** Mức bắt buộc của câu bẫy; null là câu hỏi bình thường. */
  attentionCheckValue: number | null;
}

export type SurveyTemplateImportFileErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_EMPTY'
  | 'SECTION_HEADER_MISSING'
  | 'QUESTION_HEADER_MISSING'
  | 'SCALE_HEADER_MISSING'
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

/** Dòng có mã thang trả lời sai, hiển thị để người dùng sửa lại tệp. */
export interface InvalidScaleCodeRow {
  rowNumber: number;
  questionText: string;
  rawCode: string;
}

/** Dòng đặt câu bẫy nhưng mức bắt buộc không dùng được với thang của câu đó. */
export interface InvalidAttentionCheckRow {
  rowNumber: number;
  questionText: string;
  rawValue: string;
  reason: 'TEXT_SCALE' | 'VALUE_NOT_IN_SCALE';
}

/**
 * Dòng có vấn đề ở cột Mục.
 * - `MISSING`: bỏ trống tên mục. Hay gặp nhất là do GỘP Ô (merge) cột Mục — thư
 *   viện đọc chỉ trả giá trị cho ô trên cùng, các dòng sau ra rỗng.
 * - `NOT_CONTIGUOUS`: mục quay lại sau khi đã sang mục khác, tức bị cắt làm hai
 *   khúc. Tiêu đề mục hiện trước câu đầu tiên của mục nên không đặt vào đâu được.
 * - `NOT_IN_CATALOG`: tên mục không thuộc danh mục mục cố định.
 */
export interface InvalidSectionRow {
  rowNumber: number;
  questionText: string;
  sectionName: string;
  reason: 'MISSING' | 'NOT_CONTIGUOUS' | 'NOT_IN_CATALOG';
}

export interface SurveyTemplateImportResult {
  /** Tên các mục theo đúng thứ tự xuất hiện trong tệp. */
  sections: string[];
  rows: ImportSurveyQuestionRow[];
  invalidSectionRows: InvalidSectionRow[];
  invalidScaleRows: InvalidScaleCodeRow[];
  invalidAttentionCheckRows: InvalidAttentionCheckRow[];
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

function cellText(value: CellValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

export const surveyTemplateTemplateFileName = 'mau-import-bo-cau-hoi.xlsx';

export const surveyTemplateImportColumns = [
  'Mục',
  'Câu hỏi',
  'Mã thang trả lời',
  'Đáp án bắt buộc phải chọn (câu hỏi bẫy)',
];
const surveyTemplateColumnWidths = [32, 70, 18, 30];

/**
 * Tạo và tải tệp Excel mẫu cho một bộ câu hỏi khảo sát.
 *
 * Sheet 1 là bốn cột dùng để import. Bảng tra thang trả lời nằm ở sheet 2 chứ
 * không kẹp bên phải sheet 1 nữa: để chung một sheet thì người soạn hay chèn hay
 * xoá dòng ở phần câu hỏi và làm xô lệch luôn bảng tra bên cạnh.
 *
 * Câu mẫu cố ý trải trên cả ba mục cố định và có một câu bẫy nằm giữa mục, để người
 * soạn thấy ngay ba điều: tên mục phải LẶP LẠI ở mọi dòng (không gộp ô), câu bẫy
 * cũng phải có mục, và các câu cùng mục phải nằm liền nhau.
 */
export async function downloadSurveyTemplateImportTemplate(
  answerScales: AnswerScale[]
): Promise<void> {
  // Câu mẫu gợi ý mã thang đầu tiên đang có để người dùng thấy cách điền.
  const defaultScale = answerScales.find((scale) => scale.scaleKind === 'Options');
  const defaultScaleId = defaultScale?.answerScaleId ?? answerScales[0]?.answerScaleId ?? 1;
  // Mức mẫu cho câu bẫy phải là một mức có thật của chính thang đó.
  const trapValue = defaultScale?.options?.[Math.floor((defaultScale.options.length - 1) / 2)]?.value;

  // Tên mục lấy thẳng từ danh mục cố định để tệp mẫu luôn qua được luật khi nhập lại.
  const courseSection = surveySectionName('COURSE_CONTENT');
  const lecturerSection = surveySectionName('LECTURER');
  const facilitiesSection = surveySectionName('FACILITIES');

  const sampleRows: {
    sectionName: string;
    questionText: string;
    answerScaleId: number;
    trap: number | null;
  }[] = [
    {
      sectionName: courseSection,
      questionText: 'Học phần trang bị đầy đủ kiến thức, kỹ năng nghề nghiệp cho người học.',
      answerScaleId: defaultScaleId,
      trap: null,
    },
    {
      sectionName: courseSection,
      questionText: 'Học liệu và tài liệu tham khảo của học phần đầy đủ, cập nhật.',
      answerScaleId: defaultScaleId,
      trap: null,
    },
    {
      sectionName: courseSection,
      questionText: trapValue
        ? `Đây là câu hỏi rà soát chất lượng phiếu khảo sát, không đánh giá học phần hay giảng viên. Xin Anh/Chị chọn phương án ${trapValue}.`
        : 'Cách kiểm tra, đánh giá của học phần phản ánh đúng năng lực người học.',
      answerScaleId: defaultScaleId,
      trap: trapValue ?? null,
    },
    {
      sectionName: lecturerSection,
      questionText: 'Giảng viên trình bày nội dung bài giảng rõ ràng, dễ hiểu.',
      answerScaleId: defaultScaleId,
      trap: null,
    },
    {
      sectionName: lecturerSection,
      questionText: 'Giảng viên thực hiện nghiêm túc giờ giảng, sử dụng hiệu quả thời gian lên lớp.',
      answerScaleId: defaultScaleId,
      trap: null,
    },
    {
      sectionName: facilitiesSection,
      questionText: 'Phòng học, trang thiết bị đáp ứng yêu cầu học tập của học phần.',
      answerScaleId: defaultScaleId,
      trap: null,
    },
  ];

  const data: SheetData = [
    templateHeaderRow(surveyTemplateImportColumns),
    ...sampleRows.map((question) => [
      { value: question.sectionName, type: String },
      { value: question.questionText, type: String },
      { value: question.answerScaleId, type: Number },
      question.trap ? { value: question.trap, type: Number } : null,
    ]),
  ];

  await writeWorkbook(
    [
      {
        data,
        sheet: 'Bo cau hoi',
        columns: surveyTemplateColumnWidths.map((width) => ({ width })),
      } as never,
      buildAnswerScaleLookupSheet(answerScales),
    ],
    surveyTemplateTemplateFileName
  );
}

/**
 * Sheet tra thang trả lời. Ngoài tên và mã còn trải luôn năm mức của thang ra năm
 * cột: thang nào không có mức nào thì bỏ trống đúng ô đó, nên nhìn phát biết ngay
 * thang "Có/Không" chỉ dùng mức 1 và 5. Thang tự nhập chữ không có mức nào nên
 * ghi thẳng "(Không có đáp án)" vào ngay cột tên.
 */
function buildAnswerScaleLookupSheet(answerScales: AnswerScale[]) {
  const rows = answerScales.map((scale) => {
    const label =
      scale.scaleKind === 'Text'
        ? `${scale.answerScaleName} (Không có đáp án)`
        : scale.answerScaleName;

    const optionByValue = new Map(scale.options.map((option) => [option.value, option.displayText]));
    const optionCells = [1, 2, 3, 4, 5].map((value) => optionByValue.get(value) ?? '');

    return [label, scale.answerScaleId, ...optionCells];
  });

  return buildLookupSheet(
    'Danh sach thang tra loi',
    [
      'Thang trả lời của hệ thống',
      'Mã thang trả lời',
      'Đáp án 1',
      'Đáp án 2',
      'Đáp án 3',
      'Đáp án 4',
      'Đáp án 5',
    ],
    rows,
    [38, 18, 22, 22, 22, 22, 22]
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
 * Đọc tệp .xlsx chứa danh sách câu hỏi kèm mã thang trả lời của từng câu.
 * Mã thang được đối chiếu với danh mục hệ thống truyền vào; dòng sai mã được
 * tách riêng để hiển thị cho người dùng thay vì làm hỏng cả lần import.
 */
export async function parseSurveyTemplateImportFile(
  file: File,
  answerScales: AnswerScale[]
): Promise<SurveyTemplateImportResult> {
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

  // Tránh bắt trúng cột "Thang trả lời của hệ thống" của bảng tra bên phải.
  const scaleIndex = headers.findIndex(
    (header, index) =>
      index !== questionIndex && index !== sectionIndex && answerScaleCodeHeaders.has(header)
  );
  if (scaleIndex < 0) {
    throw new SurveyTemplateImportFileError('SCALE_HEADER_MISSING');
  }

  // Cột câu bẫy là tùy chọn: bộ không có câu bẫy nào thì bỏ hẳn cột cũng được.
  const attentionIndex = headers.findIndex(
    (header, index) =>
      index !== questionIndex
      && index !== sectionIndex
      && index !== scaleIndex
      && attentionCheckHeaders.has(header)
  );

  const scaleById = new Map(answerScales.map((scale) => [scale.answerScaleId, scale]));

  const dataRows = sheet
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      sectionName: cellText(row[sectionIndex]),
      questionText: cellText(row[questionIndex]),
      rawCode: cellText(row[scaleIndex]),
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

    // Mục phải thuộc danh mục cố định, và nhận theo KHOÁ danh mục chứ không theo
    // chữ gõ: "cơ sơ vật chất" với "cơ sở vật chất" là cùng một mục.
    const key = resolveSurveySectionKey(row.sectionName);
    if (key === null) {
      invalidSectionRows.push({
        rowNumber: row.rowNumber,
        questionText: row.questionText,
        sectionName: row.sectionName,
        reason: 'NOT_IN_CATALOG',
      });
      continue;
    }

    const known = sectionIndexByKey.get(key);

    if (known === undefined) {
      sectionIndexByKey.set(key, sections.length);
      sections.push(surveySectionName(key));
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
  const invalidScaleRows: InvalidScaleCodeRow[] = [];
  const invalidAttentionCheckRows: InvalidAttentionCheckRow[] = [];

  for (const row of dataRows) {
    const rowSectionIndex = sectionOfRow.get(row.rowNumber);
    // Dòng đã bị bắt lỗi ở vòng đọc mục thì bỏ qua, khỏi báo lỗi chồng lên nhau.
    if (rowSectionIndex === undefined) continue;

    const code = Number(row.rawCode);
    const scale = Number.isInteger(code) ? scaleById.get(code) : undefined;

    if (!scale) {
      invalidScaleRows.push({
        rowNumber: row.rowNumber,
        questionText: row.questionText,
        rawCode: row.rawCode,
      });
      continue;
    }

    // Kiểm cùng luật với backend để người dùng biết lỗi ngay tại chỗ xem trước,
    // khỏi gửi lên rồi mới bị trả về.
    let attentionCheckValue: number | null = null;
    if (row.rawAttention.length > 0) {
      if (scale.scaleKind !== 'Options') {
        invalidAttentionCheckRows.push({
          rowNumber: row.rowNumber,
          questionText: row.questionText,
          rawValue: row.rawAttention,
          reason: 'TEXT_SCALE',
        });
        continue;
      }

      const required = Number(row.rawAttention);
      if (!Number.isInteger(required) || !scale.options.some((o) => o.value === required)) {
        invalidAttentionCheckRows.push({
          rowNumber: row.rowNumber,
          questionText: row.questionText,
          rawValue: row.rawAttention,
          reason: 'VALUE_NOT_IN_SCALE',
        });
        continue;
      }
      attentionCheckValue = required;
    }

    rows.push({
      rowNumber: row.rowNumber,
      sectionName: sections[rowSectionIndex],
      sectionIndex: rowSectionIndex,
      questionText: row.questionText,
      answerScaleId: scale.answerScaleId,
      answerScaleName: scale.answerScaleName,
      attentionCheckValue,
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
    invalidScaleRows,
    invalidAttentionCheckRows,
  };
}
