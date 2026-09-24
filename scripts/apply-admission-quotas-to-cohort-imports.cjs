const fs = require('fs');
const path = require('path');
const ExcelJS = require('../src/Frontend/node_modules/exceljs');

const targetDirectory = process.argv[2]
  ?? path.join(__dirname, '..', 'docs', 'import-data', 'khoa-nganh-dao-tao-tu-du-lieu-tot-nghiep');
const quotaFile = process.argv[3] ?? path.join(targetDirectory, 'chi-tieu-tuyen-sinh.json');

const programByClass = {
  ATM: 'D124', BDA: 'D111', BMM: 'A403', CDT: 'D117', CTT: 'D110',
  CNT: 'D114', CNTCL: 'H114', DKT: 'D101', DKTCH: 'S101', DTA: 'D108',
  DTD: 'D105', DTDCL: 'H105', DTT: 'D103', DTV: 'D104', GMA: 'A408',
  IBL: 'A409', KCD: 'D113', KCK: 'D116', KHD: 'D126', KMT: 'D115',
  KNL: 'D123', KPM: 'D118', KTB: 'D401', KTBCL: 'H401', KTD: 'D127',
  KTN: 'D402', KTNCL: 'H402', KTO: 'D122', KTT: 'D410', LHH: 'D120',
  LQC: 'D407', MCN: 'D128', MKT: 'D102', MKTCH: 'S102', MTT: 'D106',
  MXD: 'D109', NNA: 'D125', QCX: 'D130', QHH: 'D129', QKC: 'D131',
  QKD: 'D403', QKT: 'D404', TCH: 'D411', TDH: 'D121', TTM: 'D119',
  VTT: 'D107', XDD: 'D112',
};

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function programCodeForClass(classCode) {
  const normalized = normalize(classCode);
  const match = normalized.match(/^([A-Z]+)\d{2}(CL|CH|DH)$/);
  if (!match) return null;
  const [, prefix, variant] = match;
  return programByClass[`${prefix}${variant === 'CL' || variant === 'CH' ? variant : ''}`]
    ?? programByClass[prefix]
    ?? null;
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B84B3' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 30;
}

async function updateWorkbook(cohortCode, cohortData) {
  const fileName = path.join(targetDirectory, `khoa-nganh-dao-tao-${cohortCode}.xlsx`);
  if (!fs.existsSync(fileName)) return null;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(fileName);
  const importSheet = workbook.worksheets[0];
  const auditSheet = workbook.getWorksheet('Đối chiếu nguồn') ?? workbook.worksheets[1];
  const originalCounts = new Map();

  if (auditSheet) {
    for (let rowNumber = 2; rowNumber <= auditSheet.rowCount; rowNumber += 1) {
      const row = auditSheet.getRow(rowNumber);
      originalCounts.set(normalize(row.getCell(2).text), Number(row.getCell(4).value) || 0);
    }
  }

  const report = { cohortCode, admissionYear: cohortData.admissionYear, rows: 0, quotaRows: 0, lowerBoundRows: 0, unresolvedRows: [] };
  // Giữ đúng tên cột mà trình import nhận diện; tính chất tạm tính được ghi tại các sheet hướng dẫn/nguồn.
  importSheet.getCell('C1').value = 'Số lượng sinh viên đầu vào';

  for (let rowNumber = 2; rowNumber <= importSheet.rowCount; rowNumber += 1) {
    const row = importSheet.getRow(rowNumber);
    const classCode = row.getCell(1).text;
    const observedGraduates = originalCounts.get(normalize(classCode)) ?? (Number(row.getCell(3).value) || 0);
    const programCode = programCodeForClass(classCode);
    const quota = programCode ? cohortData.quotas[programCode] : undefined;
    report.rows += 1;

    if (Number.isFinite(quota)) {
      const applied = Math.max(quota, observedGraduates);
      row.getCell(3).value = applied;
      report.quotaRows += 1;
      if (applied !== quota) report.lowerBoundRows += 1;
    } else {
      row.getCell(3).value = observedGraduates;
      report.unresolvedRows.push({ classCode, programCode, observedGraduates });
    }
  }
  styleHeader(importSheet.getRow(1));
  importSheet.getColumn(3).width = 30;

  if (auditSheet) {
    auditSheet.getCell('G1').value = 'Mã CTĐT tuyển sinh';
    auditSheet.getCell('H1').value = 'Chỉ tiêu công bố';
    auditSheet.getCell('I1').value = 'Số đầu vào tạm tính áp dụng';
    auditSheet.getCell('J1').value = 'Căn cứ áp dụng';
    for (let rowNumber = 2; rowNumber <= auditSheet.rowCount; rowNumber += 1) {
      const row = auditSheet.getRow(rowNumber);
      const classCode = row.getCell(2).text;
      const observedGraduates = Number(row.getCell(4).value) || 0;
      const programCode = programCodeForClass(classCode);
      const quota = programCode ? cohortData.quotas[programCode] : undefined;
      const applied = Number.isFinite(quota) ? Math.max(quota, observedGraduates) : observedGraduates;
      row.getCell(7).value = programCode ?? '';
      row.getCell(8).value = Number.isFinite(quota) ? quota : '';
      row.getCell(9).value = applied;
      row.getCell(10).value = !Number.isFinite(quota)
        ? 'Chưa có chỉ tiêu chi tiết; giữ số SV tốt nghiệp quan sát được'
        : quota < observedGraduates
          ? 'Lấy số SV tốt nghiệp quan sát được làm cận dưới vì lớn hơn chỉ tiêu'
          : 'Chỉ tiêu tuyển sinh công bố';
    }
    auditSheet.autoFilter = { from: 'A1', to: 'J1' };
    auditSheet.columns = [16, 22, 42, 25, 70, 34, 20, 20, 26, 54].map((width) => ({ width }));
    styleHeader(auditSheet.getRow(1));
  }

  const oldSourceSheet = workbook.getWorksheet('Nguồn chỉ tiêu');
  if (oldSourceSheet) workbook.removeWorksheet(oldSourceSheet.id);
  const sourceSheet = workbook.addWorksheet('Nguồn chỉ tiêu');
  sourceSheet.columns = [{ width: 30 }, { width: 100 }];
  sourceSheet.addRows([
    ['THÔNG TIN NGUỒN', 'GIÁ TRỊ'],
    ['Khóa', cohortCode],
    ['Năm tuyển sinh', cohortData.admissionYear],
    ['Loại dữ liệu', 'Chỉ tiêu tuyển sinh dùng làm số đầu vào tạm tính; KHÔNG phải số sinh viên thực nhập'],
    ['Loại nguồn', cohortData.sourceKind],
    ['Nguồn', cohortData.sourceUrl],
    ['Nguyên tắc', 'Số áp dụng = max(chỉ tiêu công bố, số sinh viên tốt nghiệp duy nhất đã quan sát) để không tạo tỷ lệ tốt nghiệp vượt 100%'],
    ['Ghi chú', cohortData.notes ?? 'Thay bằng số thực nhập chính thức khi Nhà trường cung cấp dữ liệu.'],
  ]);
  styleHeader(sourceSheet.getRow(1));
  sourceSheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const oldGuide = workbook.getWorksheet('Hướng dẫn');
  if (oldGuide) workbook.removeWorksheet(oldGuide.id);
  const guide = workbook.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 115;
  guide.addRows([
    ['HƯỚNG DẪN'],
    [`Khi import, chọn đúng ${cohortCode} ở trường “Import vào khóa học”.`],
    [`File này chỉ được chứa mã lớp của ${cohortCode}; hệ thống sẽ từ chối file chứa từ hai khóa trở lên.`],
    ['Sheet “Khoa nganh dao tao” là dữ liệu import; hệ thống chỉ đọc sheet đầu tiên.'],
    ['Cột số lượng sinh viên đầu vào hiện dùng chỉ tiêu tuyển sinh công bố làm dữ liệu tạm tính, không phải số thực nhập.'],
    ['Nếu số tốt nghiệp quan sát được lớn hơn chỉ tiêu, file dùng số tốt nghiệp làm cận dưới để tránh tỷ lệ vượt 100%.'],
    ['Xem nguồn, năm công bố và nguyên tắc áp dụng tại sheet “Nguồn chỉ tiêu”.'],
    ['Cần thay dữ liệu tạm tính bằng số thực nhập khi Nhà trường cung cấp dữ liệu chính thức.'],
  ]);
  guide.getRow(1).font = { bold: true, size: 14 };
  guide.getColumn(1).alignment = { wrapText: true, vertical: 'top' };

  await workbook.xlsx.writeFile(fileName);
  return report;
}

async function main() {
  const quotaCatalog = JSON.parse(fs.readFileSync(quotaFile, 'utf8'));
  const reports = [];
  for (const [cohortCode, cohortData] of Object.entries(quotaCatalog.cohorts)) {
    const report = await updateWorkbook(cohortCode, cohortData);
    if (report) reports.push(report);
  }
  fs.writeFileSync(
    path.join(targetDirectory, 'bao-cao-ap-dung-chi-tieu.json'),
    `${JSON.stringify({ reports }, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify(reports, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
