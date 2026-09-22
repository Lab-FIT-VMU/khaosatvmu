import { toast } from 'sonner';
import { applyVmuFontsToPdf } from '../utils/vmuFontHelper';
import { toVietnameseFileSlug } from '../utils/vietnamese';

export type GraduationReportFormat = 'pdf' | 'docx' | 'xlsx' | 'png';

export interface GraduationReportTableColumn {
  key: string;
  header: string;
  numeric?: boolean;
}

export interface GraduationReportExportOptions {
  fileName: string;
  title: string;
  subtitle: string;
  chartTitle: string;
  chartDescription: string;
  chartDataUrl: string;
  tableTitle: string;
  tableColumns: GraduationReportTableColumn[];
  tableRows: Array<Record<string, string | number>>;
  info: Record<string, string | number>;
}

const tableHeaders = (options: GraduationReportExportOptions) =>
  options.tableColumns.map((column) => column.header);

const tableValues = (options: GraduationReportExportOptions) =>
  options.tableRows.map((row) => options.tableColumns.map((column) => row[column.key] ?? ''));

const formatDateTime = () => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date());

const fileNameFor = (baseName: string, extension: string) =>
  `${toVietnameseFileSlug(baseName.replace(/\.[^.]+$/, ''))}.${extension}`;

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const dataUrlToUint8Array = (dataUrl: string) => {
  const binary = atob(dataUrl.split(',')[1] ?? '');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Không thể dựng ảnh biểu đồ để xuất.'));
  image.src = source;
});

async function createTitledChartImage(options: GraduationReportExportOptions) {
  const chart = await loadImage(options.chartDataUrl);
  const headerHeight = 96;
  const canvas = document.createElement('canvas');
  canvas.width = chart.naturalWidth;
  canvas.height = chart.naturalHeight + headerHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không thể khởi tạo ảnh biểu đồ.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0f4c81';
  context.font = '700 32px "Segoe UI", Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`BIỂU ĐỒ ${options.chartTitle.toUpperCase()}`, canvas.width / 2, 42, canvas.width - 96);
  context.strokeStyle = '#dbe4ea';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(36, 76);
  context.lineTo(canvas.width - 36, 76);
  context.stroke();
  context.drawImage(chart, 0, headerHeight);
  return canvas.toDataURL('image/png');
}

async function exportPng(options: GraduationReportExportOptions) {
  const response = await fetch(await createTitledChartImage(options));
  downloadBlob(await response.blob(), fileNameFor(`${options.fileName}-bieu-do`, 'png'));
}

async function exportPdf(options: GraduationReportExportOptions) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const hasVmuFont = await applyVmuFontsToPdf(doc);
  const font = hasVmuFont ? 'Roboto' : 'helvetica';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;
  const chartDataUrl = await createTitledChartImage(options);

  doc.setFont(font, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 76, 129);
  doc.text('TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM', margin, y);
  y += 5;
  doc.setDrawColor(15, 76, 129);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  doc.setFontSize(14);
  doc.text(options.title.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(options.subtitle, pageWidth / 2, y, { align: 'center' });
  y += 5;

  const infoEntries = [...Object.entries(options.info), ['Thời gian xuất', formatDateTime()]];
  const infoHalf = Math.ceil(infoEntries.length / 2);
  const infoBody = Array.from({ length: infoHalf }, (_, index) => {
    const left = infoEntries[index];
    const right = infoEntries[index + infoHalf];
    return [
      `${left[0]}:`, String(left[1]),
      right ? `${right[0]}:` : '', right ? String(right[1]) : '',
    ];
  });
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    margin: { left: margin, right: margin },
    body: infoBody,
    styles: { font, fontSize: 8.5, cellPadding: 0.7, textColor: [51, 65, 85] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 27, textColor: [30, 41, 59] },
      1: { cellWidth: 99 },
      2: { fontStyle: 'bold', cellWidth: 27, textColor: [30, 41, 59] },
      3: { cellWidth: 99 },
    },
  });
  y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 5;

  doc.setFont(font, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 76, 129);
  doc.text(options.chartTitle.toUpperCase(), margin, y);
  y += 4;
  doc.setFont(font, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(options.chartDescription, margin, y);
  y += 3;

  const imageProperties = doc.getImageProperties(chartDataUrl);
  const maxImageWidth = pageWidth - margin * 2;
  const naturalHeight = maxImageWidth * imageProperties.height / imageProperties.width;
  const imageHeight = Math.min(87, naturalHeight);
  const imageWidth = imageHeight === naturalHeight
    ? maxImageWidth
    : imageHeight * imageProperties.width / imageProperties.height;
  doc.addImage(chartDataUrl, 'PNG', (pageWidth - imageWidth) / 2, y, imageWidth, imageHeight);
  y += imageHeight + 7;

  if (y > pageHeight - 35) {
    doc.addPage();
    y = margin;
  }
  doc.setFont(font, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 76, 129);
  doc.text(options.tableTitle.toUpperCase(), margin, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [tableHeaders(options)],
    body: tableValues(options),
    theme: 'grid',
    margin: { left: margin, right: margin, bottom: 12 },
    styles: { font, fontSize: 7, cellPadding: 1.4, lineColor: [203, 213, 225], lineWidth: 0.15 },
    headStyles: { fillColor: [227, 237, 245], textColor: [20, 65, 92], fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(options.tableColumns.map((column, index) => [
      index,
      { halign: column.numeric ? 'right' : 'left' },
    ])),
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont(font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Thời gian xuất: ${formatDateTime()} · Trang ${page}/${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
  }
  doc.save(fileNameFor(options.fileName, 'pdf'));
}

async function exportWord(options: GraduationReportExportOptions) {
  const docx = await import('docx');
  const {
    AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer,
    PageNumber, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun,
    WidthType, ShadingType,
  } = docx;
  const chartDataUrl = await createTitledChartImage(options);
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' };
  const cellBorders = { top: border, bottom: border, left: border, right: border };
  const children: any[] = [
    new Paragraph({ children: [new TextRun({ text: 'TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM', bold: true, color: '0F4C81', size: 20 })] }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '0F4C81' } }, spacing: { after: 160 } }),
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: options.title.toUpperCase(), bold: true, color: '0F4C81', size: 28 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 140 }, children: [new TextRun({ text: options.subtitle, italics: true, color: '475569', size: 19 })] }),
    ...Object.entries({ ...options.info, 'Thời gian xuất': formatDateTime() }).map(([label, value]) => new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: `${label}: `, bold: true, size: 18 }), new TextRun({ text: String(value), size: 18 })],
    })),
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 50 }, children: [new TextRun({ text: options.chartTitle.toUpperCase(), bold: true, color: '0F4C81', size: 21 })] }),
    new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: options.chartDescription, color: '475569', size: 18 })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [new ImageRun({ data: dataUrlToUint8Array(chartDataUrl), transformation: { width: 920, height: 470 }, type: 'png' })],
    }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { after: 100 }, children: [new TextRun({ text: options.tableTitle.toUpperCase(), bold: true, color: '0F4C81', size: 21 })] }),
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    children: tableHeaders(options).map((header) => new TableCell({
      borders: cellBorders,
      shading: { type: ShadingType.CLEAR, fill: 'E3EDF5', color: 'auto' },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: header, bold: true, color: '14415C', size: 15 })] })],
    })),
  });
  const dataRows = tableValues(options).map((values, index) => new TableRow({
    children: values.map((value, columnIndex) => new TableCell({
      borders: cellBorders,
      shading: index % 2 ? { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' } : undefined,
      children: [new Paragraph({
        alignment: options.tableColumns[columnIndex]?.numeric ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: String(value), size: 14 })],
      })],
    })),
  }));
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }));

  const document = new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 700, right: 600, bottom: 700, left: 600 },
        },
      },
      children,
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Trang ', size: 16, color: '888888' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '888888' }), new TextRun({ text: ' / ', size: 16, color: '888888' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '888888' })] })] }) },
    }],
  });
  downloadBlob(await Packer.toBlob(document), fileNameFor(options.fileName, 'docx'));
}

async function exportExcel(options: GraduationReportExportOptions) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const chartDataUrl = await createTitledChartImage(options);
  workbook.creator = 'VMU Survey System';
  const sheet = workbook.addWorksheet('Thong_ke_tot_nghiep', { views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }] });
  sheet.columns = options.tableColumns.map((column, index) => ({
    width: column.numeric ? 16 : index === 0 ? 34 : 26,
  }));
  let rowIndex = 1;
  const titleCell = sheet.getCell(rowIndex++, 1);
  titleCell.value = 'TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM';
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F4C81' } };
  rowIndex += 1;
  const reportTitle = sheet.getCell(rowIndex++, 1);
  reportTitle.value = options.title.toUpperCase();
  reportTitle.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0F4C81' } };
  const subtitle = sheet.getCell(rowIndex++, 1);
  subtitle.value = options.subtitle;
  subtitle.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
  for (const [label, value] of Object.entries({ ...options.info, 'Thời gian xuất': formatDateTime() })) {
    sheet.getCell(rowIndex, 1).value = `${label}:`;
    sheet.getCell(rowIndex, 1).font = { name: 'Arial', size: 10, bold: true };
    sheet.getCell(rowIndex, 2).value = String(value);
    sheet.getCell(rowIndex, 2).font = { name: 'Arial', size: 10 };
    rowIndex += 1;
  }
  rowIndex += 1;
  const chartHeading = sheet.getCell(rowIndex++, 1);
  chartHeading.value = options.chartTitle.toUpperCase();
  chartHeading.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F4C81' } };
  const chartNote = sheet.getCell(rowIndex++, 1);
  chartNote.value = options.chartDescription;
  chartNote.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF475569' } };
  const imageId = workbook.addImage({ base64: chartDataUrl, extension: 'png' });
  sheet.addImage(imageId, { tl: { col: 0, row: rowIndex - 1 }, ext: { width: 1040, height: 460 }, editAs: 'oneCell' });
  rowIndex += 25;
  const sectionCell = sheet.getCell(rowIndex++, 1);
  sectionCell.value = options.tableTitle.toUpperCase();
  sectionCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F4C81' } };
  const tableHeader = sheet.getRow(rowIndex++);
  tableHeader.values = tableHeaders(options);
  tableHeader.height = 28;
  tableHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EDF5' } };
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF14415C' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'medium', color: { argb: 'FF0F4C81' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  tableValues(options).forEach((values, index) => {
    const row = sheet.getRow(rowIndex++);
    row.values = values;
    row.eachCell((cell, column) => {
      cell.font = { name: 'Arial', size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: options.tableColumns[column - 1]?.numeric ? 'right' : 'left', wrapText: true };
      cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      if (index % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });
  });
  sheet.autoFilter = { from: { row: rowIndex - options.tableRows.length - 1, column: 1 }, to: { row: rowIndex - 1, column: options.tableColumns.length } };
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileNameFor(options.fileName, 'xlsx'));
}

export async function exportGraduationReport(format: GraduationReportFormat, options: GraduationReportExportOptions) {
  try {
    if (format === 'png') await exportPng(options);
    if (format === 'pdf') await exportPdf(options);
    if (format === 'docx') await exportWord(options);
    if (format === 'xlsx') await exportExcel(options);
    toast.success(`Đã xuất ${format === 'png' ? 'ảnh biểu đồ' : format.toUpperCase()} thành công.`);
  } catch (error) {
    console.error('Graduation report export failed:', error);
    toast.error('Không thể xuất kết quả. Vui lòng thử lại.');
    throw error;
  }
}
