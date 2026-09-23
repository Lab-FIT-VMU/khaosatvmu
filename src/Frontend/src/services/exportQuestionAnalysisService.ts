import { toast } from 'sonner';
import type { QuestionRating } from '../types';
import { applyVmuFontsToPdf } from '../utils/vmuFontHelper';
import { toVietnameseFileSlug } from '../utils/vietnamese';
import { formatDecimal, formatPercent } from '../utils/formatNumber';

export type QuestionExportFormat = 'xlsx' | 'docx' | 'pdf' | 'png';

export interface QuestionAnalysisExportMetadata {
  institution?: string;
  subInstitution?: string;
  title?: string;
  subtitle?: string;
  fileName?: string;
  info?: Record<string, string | number | undefined | null>;
  tabName?: string;
}

export interface QuestionAnalysisExportOptions {
  questions: QuestionRating[];
  overallAverageScore?: number;
  averageLabel?: string;
  responseCount?: number;
  title?: string;
  metadata?: QuestionAnalysisExportMetadata;
}

export const getScoreColor = (score: number): string => {
  if (score >= 4.5) return '#10b981'; // Emerald - Xuất sắc
  if (score >= 4.0) return '#0284c7'; // Sky / Blue - Tốt
  if (score >= 3.0) return '#f59e0b'; // Amber - Trung bình
  return '#ef4444'; // Rose - Cần cải thiện
};

export const getScoreRatingText = (score: number): string => {
  if (score >= 4.5) return 'Xuất sắc';
  if (score >= 4.0) return 'Tốt';
  if (score >= 3.0) return 'Trung bình';
  if (score > 0) return 'Cần cải thiện';
  return 'Chưa có điểm';
};

function formatCurrentDateTime(): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
}

function sanitizeFileName(name: string, ext: string): string {
  const targetExt = ext.startsWith('.') ? ext : `.${ext}`;
  const baseName = name.toLowerCase().endsWith(targetExt.toLowerCase())
    ? name.slice(0, -targetExt.length)
    : name;
  return `${toVietnameseFileSlug(baseName)}${targetExt.toLowerCase()}`;
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

function base64ToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function drawRoundedTopRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (h <= 0) return;
  const radius = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

/**
 * Vẽ biểu đồ cột điểm các câu hỏi lên Canvas 2D độ nét cao (2x DPI)
 * và trả về chuỗi PNG Data URL.
 */
export async function generateQuestionChartImage(
  options: QuestionAnalysisExportOptions,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const { questions, overallAverageScore, averageLabel = 'ĐTB toàn bài', title } = options;

  const coded = (questions || []).map((q, idx) => ({
    ...q,
    code: `C${q.questionOrder || idx + 1}`,
  }));
  const chartData = coded.filter((q) => q.scaleKind !== 'Text');

  const computedAverage =
    overallAverageScore !== undefined
      ? overallAverageScore
      : chartData.length > 0
      ? chartData.reduce((sum, q) => sum + q.averageScore, 0) / chartData.length
      : 0;

  const marginLeft = 56;
  const marginRight = 32;
  const marginTop = 84;
  const marginBottom = 56;

  // Tính bề rộng linh hoạt theo số cột
  const barSlotWidth = chartData.length > 14 ? 50 : 56;
  const cssWidth = Math.max(820, marginLeft + marginRight + Math.max(chartData.length, 1) * barSlotWidth);
  const cssHeight = 380;
  const scale = 2; // 2x Retina resolution

  const canvas = document.createElement('canvas');
  canvas.width = cssWidth * scale;
  canvas.height = cssHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Không thể khởi tạo ngữ cảnh vẽ Canvas 2D');
  }

  ctx.scale(scale, scale);

  // 1. Nền trắng
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  // Viền bao quanh tinh tế
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);

  // 2. Tiêu đề biểu đồ
  const chartTitle = (title || 'BIỂU ĐỒ ĐIỂM TRUNG BÌNH THEO CÂU HỎI').toUpperCase();
  ctx.fillStyle = '#0f4c81';
  ctx.font = 'bold 14px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(chartTitle, 24, 30);

  // 3. Chú thích thang điểm (Legend)
  const legendItems = [
    { color: '#10b981', label: '≥ 4.5 (Xuất sắc)' },
    { color: '#0284c7', label: '4.0 - 4.49 (Tốt)' },
    { color: '#f59e0b', label: '3.0 - 3.99 (Trung bình)' },
    { color: '#ef4444', label: '< 3.0 (Cần cải thiện)' },
  ];

  let legendX = 24;
  const legendY = 54;
  ctx.font = '11px "Segoe UI", Roboto, Arial, sans-serif';

  legendItems.forEach((item) => {
    // Vẽ ô màu
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(legendX + 6, legendY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.fillText(item.label, legendX + 16, legendY + 4);

    legendX += ctx.measureText(item.label).width + 32;
  });

  // Điểm trung bình mốc hiển thị ở góc phải header
  if (computedAverage > 0) {
    const avgText = `${averageLabel}: ${formatDecimal(computedAverage, 3)} / 5,0`;
    ctx.font = 'bold 12px "Segoe UI", Roboto, Arial, sans-serif';
    const textW = ctx.measureText(avgText).width;
    const badgeX = cssWidth - marginRight - textW - 20;
    const badgeY = 16;

    ctx.fillStyle = '#f0f9ff';
    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(badgeX, badgeY, textW + 16, 26, 4);
    } else {
      ctx.rect(badgeX, badgeY, textW + 16, 26);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = getScoreColor(computedAverage);
    ctx.textAlign = 'left';
    ctx.fillText(avgText, badgeX + 8, badgeY + 18);
  }

  // 4. Khung vẽ biểu đồ (Plot area)
  const plotX = marginLeft;
  const plotY = marginTop;
  const plotW = cssWidth - marginLeft - marginRight;
  const plotH = cssHeight - marginTop - marginBottom;

  // Trục Y: các mốc 0, 1, 2, 3, 4, 5
  for (let i = 0; i <= 5; i++) {
    const y = plotY + plotH - (i / 5) * plotH;
    ctx.beginPath();
    ctx.setLineDash(i === 0 ? [] : [3, 3]);
    ctx.strokeStyle = i === 0 ? '#cbd5e1' : '#eef2f6';
    ctx.lineWidth = 1;
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotW, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${i}.0`, plotX - 8, y + 4);
  }

  // Đường tham chiếu ĐTB mốc
  if (computedAverage > 0 && computedAverage <= 5) {
    const refY = plotY + plotH - (computedAverage / 5) * plotH;
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.moveTo(plotX, refY);
    ctx.lineTo(plotX + plotW, refY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Trục X cơ sở
  ctx.beginPath();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.moveTo(plotX, plotY + plotH);
  ctx.lineTo(plotX + plotW, plotY + plotH);
  ctx.stroke();

  // 5. Cột điểm từng câu
  if (chartData.length > 0) {
    const colSlot = plotW / chartData.length;
    const barWidth = Math.min(42, Math.max(16, colSlot * 0.65));

    chartData.forEach((q, idx) => {
      const cx = plotX + idx * colSlot + colSlot / 2;
      const barX = cx - barWidth / 2;
      const score = Math.max(0, Math.min(5, q.averageScore));
      const barHeight = (score / 5) * plotH;
      const barY = plotY + plotH - barHeight;
      const color = getScoreColor(score);

      // Vẽ thanh cột bo góc trên
      drawRoundedTopRect(ctx, barX, barY, barWidth, barHeight, 5);
      ctx.fillStyle = color;
      ctx.fill();

      // Điểm số trên đầu cột
      if (score > 0) {
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 11px "Segoe UI", Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatDecimal(score, 3), cx, barY - 6);
      }

      // Mã câu C1, C2... dưới chân cột
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 12px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(q.code, cx, plotY + plotH + 18);
    });
  } else {
    ctx.fillStyle = '#64748b';
    ctx.font = 'italic 13px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Chưa có dữ liệu câu hỏi dạng đánh giá điểm.', cssWidth / 2, plotY + plotH / 2);
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: cssWidth,
    height: cssHeight,
  };
}

/**
 * Tải file ảnh biểu đồ PNG trực tiếp.
 */
export async function downloadQuestionChartPng(options: QuestionAnalysisExportOptions): Promise<void> {
  const { dataUrl } = await generateQuestionChartImage(options);
  const baseName = options.metadata?.fileName || options.title || 'bieu-do-cau-hoi-khao-sat';
  const fileName = sanitizeFileName(`${baseName}-bieu-do`, '.png');

  const res = await fetch(dataUrl);
  const blob = await res.blob();
  downloadBlob(blob, fileName);
}

/**
 * Xuất dữ liệu câu hỏi kèm biểu đồ ra file PDF (.pdf) chuẩn VMU in ấn khổ ngang (Landscape).
 */
export async function exportQuestionAnalysisToPdf(options: QuestionAnalysisExportOptions): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const { questions, metadata } = options;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const hasVmuFont = await applyVmuFontsToPdf(doc);
  const fontName = hasVmuFont ? 'Roboto' : 'helvetica';

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let currentY = margin;

  // Header: Đơn vị chủ quản
  doc.setFont(fontName, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 76, 129);
  doc.text((metadata?.institution || 'TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM').toUpperCase(), margin, currentY);
  currentY += 4.5;

  if (metadata?.subInstitution) {
    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    doc.text(metadata.subInstitution.toUpperCase(), margin, currentY);
    currentY += 4.5;
  }

  // Dòng kẻ phân cách trên
  doc.setDrawColor(15, 76, 129);
  doc.setLineWidth(0.4);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 6;

  // Tiêu đề báo cáo
  const titleText = (metadata?.title || options.title || 'BÁO CÁO PHÂN TÍCH KẾT QUẢ KHẢO SÁT THEO CÂU HỎI').toUpperCase();
  doc.setFont(fontName, 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 76, 129);
  const maxContentWidth = pageWidth - margin * 2;
  const titleLines = doc.splitTextToSize(titleText, maxContentWidth);
  doc.text(titleLines, pageWidth / 2, currentY, { align: 'center' });
  currentY += titleLines.length * 5.5;

  // Tiêu đề phụ
  if (metadata?.subtitle) {
    doc.setFont(fontName, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const subLines = doc.splitTextToSize(metadata.subtitle, maxContentWidth);
    doc.text(subLines, pageWidth / 2, currentY, { align: 'center' });
    currentY += subLines.length * 4.5 + 1;
  }

  // Thông tin metadata bổ sung dạng 2 cột không viền (chống tràn/đè chữ khi tên đợt dài)
  const combinedInfo = metadata?.info || {};
  const infoKeys = Object.keys(combinedInfo).filter(
    (k) => combinedInfo[k] !== undefined && combinedInfo[k] !== null && combinedInfo[k] !== ''
  );
  if (infoKeys.length > 0) {
    const colHalf = Math.ceil(infoKeys.length / 2);
    const col1Keys = infoKeys.slice(0, colHalf);
    const col2Keys = infoKeys.slice(colHalf);
    const rowCount = Math.max(col1Keys.length, col2Keys.length);

    const body: string[][] = [];
    for (let i = 0; i < rowCount; i++) {
      const k1 = col1Keys[i];
      const k2 = col2Keys[i];
      body.push([
        k1 ? `• ${k1}:` : '',
        k1 ? String(combinedInfo[k1]) : '',
        k2 ? `• ${k2}:` : '',
        k2 ? String(combinedInfo[k2]) : '',
      ]);
    }

    const labelColWidth = 32;
    const valColWidth = Math.max(60, (maxContentWidth - labelColWidth * 2) / 2);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'plain',
      styles: {
        font: fontName,
        fontSize: 8.5,
        cellPadding: { top: 0.6, bottom: 0.6, left: 1, right: 2 },
        overflow: 'linebreak',
        valign: 'top',
      },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [30, 41, 59], cellWidth: labelColWidth },
        1: { fontStyle: 'normal', textColor: [71, 85, 105], cellWidth: valColWidth },
        2: { fontStyle: 'bold', textColor: [30, 41, 59], cellWidth: labelColWidth },
        3: { fontStyle: 'normal', textColor: [71, 85, 105], cellWidth: valColWidth },
      },
      body,
    });

    const finalInfoY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
    currentY = (finalInfoY ?? currentY) + 5;
  }

  // 1. Chèn Biểu đồ câu hỏi
  const { dataUrl: chartImg, width: imgW, height: imgH } = await generateQuestionChartImage(options);
  const pdfImgW = pageWidth - margin * 2;
  const pdfImgH = (imgH / imgW) * pdfImgW;

  // Kiểm tra trang nếu không đủ chỗ cho ảnh
  if (currentY + pdfImgH > pageHeight - margin) {
    doc.addPage();
    currentY = margin;
  }

  doc.addImage(chartImg, 'PNG', margin, currentY, pdfImgW, pdfImgH);
  currentY += pdfImgH + 7;

  // 2. Bảng phân bố điểm từng thang đo
  const coded = (questions || []).map((q, idx) => ({
    ...q,
    code: `C${q.questionOrder || idx + 1}`,
  }));
  const chartData = coded.filter((q) => q.scaleKind !== 'Text');
  const textQuestions = coded.filter((q) => q.scaleKind === 'Text');

  const distributionGroups = chartData.reduce<Map<string, typeof coded>>((groups, question) => {
    const key = question.answerScaleName || 'Thang trả lời';
    const current = groups.get(key);
    if (current) current.push(question);
    else groups.set(key, [question]);
    return groups;
  }, new Map());

  for (const [scaleName, groupQuestions] of distributionGroups.entries()) {
    const optionsList = groupQuestions[0]?.optionDistribution ?? [];

    if (currentY > pageHeight - 35) {
      doc.addPage();
      currentY = margin;
    }

    doc.setFont(fontName, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 76, 129);
    doc.text(`BẢNG ĐIỂM CHI TIẾT & TỶ LỆ PHÂN BỐ · ${scaleName.toUpperCase()}`, margin, currentY);
    currentY += 4;

    const headCols = [
      { content: 'Mã', styles: { halign: 'center' as const } },
      { content: 'Nội dung câu hỏi khảo sát', styles: { halign: 'left' as const } },
      ...optionsList.map((opt) => ({
        content: `Mức ${opt.value}\n(${opt.displayText})`,
        styles: { halign: 'center' as const },
      })),
      { content: 'Điểm TB', styles: { halign: 'center' as const } },
      { content: 'Đánh giá', styles: { halign: 'center' as const } },
    ];

    const bodyRows = groupQuestions.map((q) => {
      const optCells = optionsList.map((col) => {
        const cell = q.optionDistribution?.find((o) => o.value === col.value);
        if (!cell) return '0 (0%)';
        return `${cell.count}\n(${formatPercent(cell.percentage, 3)})`;
      });

      return [
        q.code,
        q.questionText,
        ...optCells,
        q.averageScore > 0 ? formatDecimal(q.averageScore, 3) : '—',
        getScoreRatingText(q.averageScore),
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [headCols],
      body: bodyRows,
      theme: 'grid',
      styles: {
        font: fontName,
        fontSize: 8,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [227, 237, 245],
        textColor: [20, 65, 92],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 'auto', halign: 'left' },
        [headCols.length - 2]: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        [headCols.length - 1]: { cellWidth: 26, halign: 'center' },
      },
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        // Vẽ số trang ở cuối mỗi trang
        const totalPages = (doc.internal as any).getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          doc.setFont(fontName, 'italic');
          doc.setFontSize(8);
          doc.setTextColor(140, 140, 140);
          doc.text(
            `Thời gian xuất: ${formatCurrentDateTime()} — Trang ${i}/${totalPages}`,
            pageWidth - margin,
            pageHeight - 8,
            { align: 'right' },
          );
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // 3. Câu hỏi tự nhập (nếu có)
  if (textQuestions.length > 0) {
    if (currentY > pageHeight - 30) {
      doc.addPage();
      currentY = margin;
    }

    doc.setFont(fontName, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 76, 129);
    doc.text('Ý KIẾN ĐÓNG GÓP TỰ NHẬP CỦA NGƯỜI HỌC', margin, currentY);
    currentY += 5;

    textQuestions.forEach((tq) => {
      if (currentY > pageHeight - 25) {
        doc.addPage();
        currentY = margin;
      }

      doc.setFont(fontName, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`${tq.code}. ${tq.questionText} (${tq.totalAnswers} lượt trả lời)`, margin, currentY);
      currentY += 4.5;

      const answers = tq.textAnswers || [];
      if (answers.length === 0) {
        doc.setFont(fontName, 'italic');
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text('(Không có ý kiến nào)', margin + 6, currentY);
        currentY += 4.5;
      } else {
        doc.setFont(fontName, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        answers.forEach((ans) => {
          if (currentY > pageHeight - 15) {
            doc.addPage();
            currentY = margin;
          }
          const wrapped = doc.splitTextToSize(`- ${ans}`, pageWidth - margin * 2 - 8);
          doc.text(wrapped, margin + 4, currentY);
          currentY += wrapped.length * 3.8;
        });
        currentY += 3;
      }
    });
  }

  const baseName = metadata?.fileName || options.title || 'bao-cao-cau-hoi-khao-sat';
  const finalFileName = sanitizeFileName(baseName, '.pdf');
  doc.save(finalFileName);
}

/**
 * Xuất dữ liệu câu hỏi kèm biểu đồ ra file Word (.docx) chuẩn thể thức VMU.
 */
export async function exportQuestionAnalysisToWord(options: QuestionAnalysisExportOptions): Promise<void> {
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

  const { questions, metadata } = options;

  const docChildren: any[] = [];

  // Header Quốc hiệu / Tên trường
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: (metadata?.institution || 'TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM').toUpperCase(),
          bold: true,
          size: 20, // 10pt
          color: '0F4C81',
        }),
      ],
    }),
  );

  if (metadata?.subInstitution) {
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: metadata.subInstitution.toUpperCase(),
            bold: true,
            size: 18,
            color: '555555',
          }),
        ],
      }),
    );
  }

  // Kẻ đường ngăn cách
  docChildren.push(
    new Paragraph({
      spacing: { after: 140 },
      border: {
        bottom: {
          color: '0F4C81',
          space: 1,
          style: BorderStyle.SINGLE,
          size: 6,
        },
      },
    }),
  );

  // Tiêu đề báo cáo
  const titleText = (metadata?.title || options.title || 'BÁO CÁO PHÂN TÍCH KẾT QUẢ KHẢO SÁT THEO CÂU HỎI').toUpperCase();
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 140, after: 80 },
      children: [
        new TextRun({
          text: titleText,
          bold: true,
          size: 26,
          color: '0F4C81',
        }),
      ],
    }),
  );

  // Tiêu đề phụ
  if (metadata?.subtitle) {
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: metadata.subtitle,
            italics: true,
            size: 20,
            color: '444444',
          }),
        ],
      }),
    );
  }

  // Metadata thông tin
  const combinedInfo = metadata?.info || {};
  Object.entries(combinedInfo).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      docChildren.push(
        new Paragraph({
          spacing: { after: 30 },
          children: [
            new TextRun({ text: `• ${k}: `, bold: true, size: 19 }),
            new TextRun({ text: String(v), size: 19, color: '334155' }),
          ],
        }),
      );
    }
  });

  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: `Thời gian xuất: ${formatCurrentDateTime()}`,
          italics: true,
          size: 16,
          color: '777777',
        }),
      ],
    }),
  );

  // 1. PHẦN I: BIỂU ĐỒ ĐIỂM CÁC CÂU HỎI
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: 'I. BIỂU ĐỒ ĐIỂM TRUNG BÌNH CÁC CÂU HỎI',
          bold: true,
          size: 22,
          color: '0F4C81',
        }),
      ],
    }),
  );

  const { dataUrl: chartImg } = await generateQuestionChartImage(options);
  const imageBytes = base64ToUint8Array(chartImg);

  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new ImageRun({
          type: 'png',
          data: imageBytes,
          transformation: {
            width: 620,
            height: 270,
          },
        }),
      ],
    }),
  );

  // 2. PHẦN II: BẢNG ĐIỂM CHI TIẾT VÀ TỶ LỆ PHÂN BỐ LỰA CHỌN
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 100 },
      children: [
        new TextRun({
          text: 'II. BẢNG ĐIỂM CHI TIẾT VÀ TỶ LỆ PHÂN BỐ LỰA CHỌN',
          bold: true,
          size: 22,
          color: '0F4C81',
        }),
      ],
    }),
  );

  const coded = (questions || []).map((q, idx) => ({
    ...q,
    code: `C${q.questionOrder || idx + 1}`,
  }));
  const chartData = coded.filter((q) => q.scaleKind !== 'Text');
  const textQuestions = coded.filter((q) => q.scaleKind === 'Text');

  const distributionGroups = chartData.reduce<Map<string, typeof coded>>((groups, question) => {
    const key = question.answerScaleName || 'Thang trả lời';
    const current = groups.get(key);
    if (current) current.push(question);
    else groups.set(key, [question]);
    return groups;
  }, new Map());

  for (const [scaleName, groupQuestions] of distributionGroups.entries()) {
    const optionsList = groupQuestions[0]?.optionDistribution ?? [];

    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 140, after: 60 },
        children: [
          new TextRun({
            text: `Thang đánh giá: ${scaleName}`,
            bold: true,
            size: 20,
            color: '1E293B',
          }),
        ],
      }),
    );

    const headerCells = [
      new TableCell({
        shading: { fill: '0F4C81', type: ShadingType.CLEAR },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Mã', bold: true, color: 'FFFFFF', size: 17 })],
          }),
        ],
      }),
      new TableCell({
        shading: { fill: '0F4C81', type: ShadingType.CLEAR },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: 'Nội dung câu hỏi khảo sát', bold: true, color: 'FFFFFF', size: 17 })],
          }),
        ],
      }),
      ...optionsList.map(
        (opt) =>
          new TableCell({
            shading: { fill: '0F4C81', type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `M${opt.value} (${opt.displayText})`, bold: true, color: 'FFFFFF', size: 16 })],
              }),
            ],
          }),
      ),
      new TableCell({
        shading: { fill: '0F4C81', type: ShadingType.CLEAR },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Điểm TB', bold: true, color: 'FFFFFF', size: 17 })],
          }),
        ],
      }),
      new TableCell({
        shading: { fill: '0F4C81', type: ShadingType.CLEAR },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Đánh giá', bold: true, color: 'FFFFFF', size: 17 })],
          }),
        ],
      }),
    ];

    const bodyRows = groupQuestions.map((q, rIdx) => {
      const isEven = rIdx % 2 === 1;
      const fill = isEven ? 'F8FAFC' : 'FFFFFF';

      const optCells = optionsList.map((col) => {
        const cell = q.optionDistribution?.find((o) => o.value === col.value);
        const cellText = cell ? `${cell.count} (${formatPercent(cell.percentage, 3)})` : '0 (0%)';
        return new TableCell({
          shading: { fill, type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: cellText, size: 16 })],
            }),
          ],
        });
      });

      return new TableRow({
        children: [
          new TableCell({
            shading: { fill, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: q.code, bold: true, size: 17 })],
              }),
            ],
          }),
          new TableCell({
            shading: { fill, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({ text: q.questionText, size: 17 })],
              }),
            ],
          }),
          ...optCells,
          new TableCell({
            shading: { fill, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: q.averageScore > 0 ? formatDecimal(q.averageScore, 3) : '—', bold: true, size: 17 })],
              }),
            ],
          }),
          new TableCell({
            shading: { fill, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: getScoreRatingText(q.averageScore), size: 16 })],
              }),
            ],
          }),
        ],
      });
    });

    const docTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ tableHeader: true, children: headerCells }), ...bodyRows],
    });

    docChildren.push(docTable);
  }

  // 3. PHẦN III: Ý KIẾN ĐÓNG GÓP TỰ NHẬP
  if (textQuestions.length > 0) {
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 100 },
        children: [
          new TextRun({
            text: 'III. Ý KIẾN ĐÓNG GÓP TỰ NHẬP CỦA NGƯỜI HỌC',
            bold: true,
            size: 22,
            color: '0F4C81',
          }),
        ],
      }),
    );

    textQuestions.forEach((tq) => {
      docChildren.push(
        new Paragraph({
          spacing: { before: 100, after: 40 },
          children: [
            new TextRun({
              text: `${tq.code}. ${tq.questionText} `,
              bold: true,
              size: 19,
              color: '1E293B',
            }),
            new TextRun({
              text: `(${tq.totalAnswers} lượt trả lời)`,
              italics: true,
              size: 17,
              color: '64748B',
            }),
          ],
        }),
      );

      const answers = tq.textAnswers || [];
      if (answers.length === 0) {
        docChildren.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: '(Chưa có ý kiến nào)', italics: true, size: 17, color: '888888' })],
          }),
        );
      } else {
        answers.forEach((ans) => {
          docChildren.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 30 },
              children: [new TextRun({ text: ans, size: 18 })],
            }),
          );
        });
      }
    });
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: 1000,
              bottom: 1000,
              left: 1000,
              right: 1000,
            },
          },
        },
        children: docChildren,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'Trang ', size: 16, color: '888888' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '888888' }),
                  new TextRun({ text: ' / ', size: 16, color: '888888' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '888888' }),
                ],
              }),
            ],
          }),
        },
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const baseName = metadata?.fileName || options.title || 'bao-cao-cau-hoi-khao-sat';
  const finalFileName = sanitizeFileName(baseName, '.docx');
  downloadBlob(blob, finalFileName);
}

/**
 * Xuất bảng điểm phân tích các câu hỏi ra file Excel (.xlsx).
 */
export async function exportQuestionAnalysisToExcel(options: QuestionAnalysisExportOptions): Promise<void> {
  const ExcelJS = await import('exceljs');

  const { questions, metadata } = options;
  const coded = (questions || []).map((q, idx) => ({
    ...q,
    code: `C${q.questionOrder || idx + 1}`,
  }));
  const chartData = coded.filter((q) => q.scaleKind !== 'Text');
  const textQuestions = coded.filter((q) => q.scaleKind === 'Text');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VMU Survey System';
  workbook.lastModifiedBy = 'VMU Survey System';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Sheet 1: Bảng điểm câu hỏi
  const ws = workbook.addWorksheet('Diem_Cau_Hoi', {
    views: [{ showGridLines: true }],
  });

  // Thiết lập độ rộng cột tương đối
  ws.columns = [
    { key: 'code', width: 9 },
    { key: 'text', width: 46 },
    { key: 'scale', width: 18 },
    { key: 'm1_count', width: 11 },
    { key: 'm1_pct', width: 11 },
    { key: 'm2_count', width: 11 },
    { key: 'm2_pct', width: 11 },
    { key: 'm3_count', width: 11 },
    { key: 'm3_pct', width: 11 },
    { key: 'm4_count', width: 11 },
    { key: 'm4_pct', width: 11 },
    { key: 'm5_count', width: 11 },
    { key: 'm5_pct', width: 11 },
    { key: 'avg', width: 13 },
    { key: 'rating', width: 15 },
    { key: 'total', width: 13 },
  ];

  let r = 1;

  // Dòng 1: Cơ quan chủ quản
  const instCell = ws.getCell(`A${r}`);
  instCell.value = (metadata?.institution || 'TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM').toUpperCase();
  instCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F4C81' } };
  r++;

  // Dòng 2: Phân hệ
  if (metadata?.subInstitution) {
    const subInstCell = ws.getCell(`A${r}`);
    subInstCell.value = metadata.subInstitution.toUpperCase();
    subInstCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF555555' } };
    r++;
  }

  r++; // Dòng trống

  // Dòng Tiêu đề
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = (metadata?.title || options.title || 'BÁO CÁO PHÂN TÍCH KẾT QUẢ KHẢO SÁT THEO CÂU HỎI').toUpperCase();
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF0F4C81' } };
  r++;

  // Tiêu đề phụ
  if (metadata?.subtitle) {
    const subtitleCell = ws.getCell(`A${r}`);
    subtitleCell.value = metadata.subtitle;
    subtitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF333333' } };
    r++;
  }

  // Metadata thông tin
  const combinedInfo = metadata?.info || {};
  Object.entries(combinedInfo).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      const labelCell = ws.getCell(`A${r}`);
      labelCell.value = `${k}:`;
      labelCell.font = { name: 'Arial', size: 9.5, bold: true };

      const valCell = ws.getCell(`B${r}`);
      valCell.value = String(v);
      valCell.font = { name: 'Arial', size: 9.5 };
      r++;
    }
  });

  // Dòng ngày xuất
  const dateCell = ws.getCell(`A${r}`);
  dateCell.value = `Thời gian xuất: ${formatCurrentDateTime()}`;
  dateCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF666666' } };
  r += 2; // Cách 1 dòng trống trước ảnh biểu đồ

  // CHÈN HÌNH ẢNH BIỂU ĐỒ VÀO EXCEL
  const { dataUrl: chartImg, width: imgW, height: imgH } = await generateQuestionChartImage(options);
  const imageId = workbook.addImage({
    base64: chartImg,
    extension: 'png',
  });

  const chartStartRow = r - 1; // 0-indexed cho exceljs
  const chartPixelW = 860;
  const chartPixelH = Math.round(chartPixelW * (imgH / imgW));

  ws.addImage(imageId, {
    tl: { col: 0, row: chartStartRow },
    ext: { width: chartPixelW, height: chartPixelH },
    editAs: 'oneCell',
  });

  // Tính số dòng Excel mà ảnh chiếm (mỗi dòng ~20px)
  const chartRowSpan = Math.ceil(chartPixelH / 20) + 2;
  r += chartRowSpan;

  // Tiêu đề phân mục Bảng
  const sectionTitleCell = ws.getCell(`A${r}`);
  sectionTitleCell.value = 'BẢNG ĐIỂM CHI TIẾT & TỶ LỆ PHÂN BỐ CÁC MỨC ĐÁNH GIÁ';
  sectionTitleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F4C81' } };
  r++;

  // Header bảng
  const headers = [
    'Mã câu',
    'Nội dung câu hỏi',
    'Thang đo',
    'Mức 1 (SL)',
    'Mức 1 (%)',
    'Mức 2 (SL)',
    'Mức 2 (%)',
    'Mức 3 (SL)',
    'Mức 3 (%)',
    'Mức 4 (SL)',
    'Mức 4 (%)',
    'Mức 5 (SL)',
    'Mức 5 (%)',
    'Điểm TB',
    'Đánh giá',
    'Tổng lượt TL',
  ];

  const headerRow = ws.getRow(r);
  headerRow.values = headers;
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE3EDF5' },
    };
    cell.font = {
      name: 'Arial',
      size: 9.5,
      bold: true,
      color: { argb: 'FF14415C' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F4C81' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  r++;

  // Dữ liệu từng câu
  chartData.forEach((q, idx) => {
    const isEven = idx % 2 === 1;
    const findOpt = (val: number) => q.optionDistribution?.find((o) => o.value === val);
    const m1 = findOpt(1);
    const m2 = findOpt(2);
    const m3 = findOpt(3);
    const m4 = findOpt(4);
    const m5 = findOpt(5);

    const dataRow = ws.getRow(r);
    dataRow.values = [
      q.code,
      q.questionText,
      q.answerScaleName || 'Thang trả lời',
      m1?.count ?? 0,
      (m1?.percentage ?? 0) / 100,
      m2?.count ?? 0,
      (m2?.percentage ?? 0) / 100,
      m3?.count ?? 0,
      (m3?.percentage ?? 0) / 100,
      m4?.count ?? 0,
      (m4?.percentage ?? 0) / 100,
      m5?.count ?? 0,
      (m5?.percentage ?? 0) / 100,
      q.averageScore > 0 ? Number(q.averageScore.toFixed(3)) : 0,
      getScoreRatingText(q.averageScore),
      q.totalAnswers,
    ];
    dataRow.height = 20;

    dataRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 9 };
      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      // Định dạng số & căn lề
      if (colNumber === 1) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { name: 'Arial', size: 9, bold: true };
      } else if (colNumber === 2 || colNumber === 3) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if ([5, 7, 9, 11, 13].includes(colNumber)) {
        // Tỷ lệ %
        cell.numFmt = '0.0%';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (colNumber === 14) {
        // Điểm TB
        cell.numFmt = '0.00';
        cell.font = { name: 'Arial', size: 9, bold: true };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (colNumber === 15) {
        // Đánh giá
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        // Số lượng
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });

    r++;
  });

  // Sheet 2: Ý kiến tự nhập (nếu có)
  if (textQuestions.length > 0) {
    const wsText = workbook.addWorksheet('Y_Kien_Tu_Nhap', {
      views: [{ showGridLines: true }],
    });

    wsText.columns = [
      { key: 'code', width: 10 },
      { key: 'question', width: 45 },
      { key: 'stt', width: 8 },
      { key: 'answer', width: 70 },
    ];

    const tHeadRow = wsText.getRow(1);
    tHeadRow.values = ['Mã câu', 'Nội dung câu hỏi khảo sát', 'STT', 'Ý kiến đóng góp của người học'];
    tHeadRow.height = 24;
    tHeadRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE3EDF5' },
      };
      cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF14415C' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF0F4C81' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    let tr = 2;
    textQuestions.forEach((tq) => {
      const answers = tq.textAnswers || [];
      if (answers.length === 0) {
        const row = wsText.getRow(tr);
        row.values = [tq.code, tq.questionText, 1, '(Chưa có ý kiến nào)'];
        row.font = { name: 'Arial', size: 9 };
        row.getCell(4).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF888888' } };
        tr++;
      } else {
        answers.forEach((ans, aIdx) => {
          const row = wsText.getRow(tr);
          row.values = [tq.code, tq.questionText, aIdx + 1, ans];
          row.font = { name: 'Arial', size: 9 };
          row.getCell(1).alignment = { horizontal: 'center' };
          row.getCell(3).alignment = { horizontal: 'center' };
          tr++;
        });
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const baseName = metadata?.fileName || options.title || 'bao-cao-cau-hoi-khao-sat';
  const finalFileName = sanitizeFileName(baseName, '.xlsx');
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, finalFileName);
}

/**
 * Điều phối xuất phân tích câu hỏi theo định dạng.
 */
export async function exportQuestionAnalysis(
  format: QuestionExportFormat,
  options: QuestionAnalysisExportOptions,
): Promise<void> {
  const formatLabels: Record<QuestionExportFormat, string> = {
    xlsx: 'Excel',
    docx: 'Word',
    pdf: 'PDF',
    png: 'Ảnh biểu đồ',
  };

  const toastId = toast.loading(`Đang xuất dữ liệu định dạng ${formatLabels[format]}...`);

  try {
    switch (format) {
      case 'xlsx':
        await exportQuestionAnalysisToExcel(options);
        break;
      case 'docx':
        await exportQuestionAnalysisToWord(options);
        break;
      case 'pdf':
        await exportQuestionAnalysisToPdf(options);
        break;
      case 'png':
        await downloadQuestionChartPng(options);
        break;
    }
    toast.success(`Đã xuất thành công file ${formatLabels[format]}`, { id: toastId });
  } catch (error) {
    console.error('Export question analysis error:', error);
    toast.error(`Xuất file ${formatLabels[format]} thất bại: ${(error as Error)?.message || 'Lỗi không xác định'}`, {
      id: toastId,
    });
    throw error;
  }
}
