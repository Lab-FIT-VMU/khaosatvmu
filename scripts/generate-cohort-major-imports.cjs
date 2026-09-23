const fs = require('fs');
const path = require('path');
const ExcelJS = require('../src/Frontend/node_modules/exceljs');

const [sourceDirectory, catalogFile, outputDirectory] = process.argv.slice(2);

if (!sourceDirectory || !catalogFile) {
  console.error('Usage: node scripts/generate-cohort-major-imports.cjs <source-directory> <major-catalog.xlsx> [output-directory]');
  process.exit(1);
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đðÐ]/gi, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function cellText(cell) {
  try {
    return String(cell.text ?? '').trim();
  } catch {
    return String(cell.value ?? '').trim();
  }
}

function normalizeClassCode(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/Ð/g, 'Đ')
    .replace(/[\s\-_.\/]+/g, '')
    .toUpperCase();
}

function cohortFromClassCode(classCode) {
  const match = classCode.match(/^[\p{L}]{2,10}(\d{2})(?:ĐH|DH|CL|CH)\d{0,2}$/u);
  return match ? `K${match[1]}` : null;
}

async function loadCanonicalMajors(fileName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(fileName);
  const sheet = workbook.getWorksheet('Ngành đào tạo') ?? workbook.worksheets[0];
  const majors = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const code = cellText(row.getCell(1));
    const name = cellText(row.getCell(2));
    const faculty = cellText(row.getCell(3));
    if (code && name) majors.push({ code, name, faculty });
  });
  return majors;
}

async function readSourceRows(directory) {
  const fileNames = fs.readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith('.xlsx'))
    .sort((left, right) => left.localeCompare(right, 'vi'));
  const rows = [];

  for (const fileName of fileNames) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(directory, fileName));
    const sheet = workbook.worksheets.find((item) => normalizeText(item.name) === 'TONGHOP');
    if (!sheet) continue;

    let headerRow = null;
    let studentColumn = 0;
    let classColumn = 0;
    let majorColumn = 0;
    let facultyColumn = 0;
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      for (let column = 1; column <= sheet.columnCount; column += 1) {
        const header = normalizeText(cellText(row.getCell(column)));
        if (header === 'MA SV') studentColumn = column;
        if (header === 'LOP' || header === 'MA LOP') classColumn = column;
        if (header === 'CHUYEN NGANH' || header === 'NGANH DAO TAO') majorColumn = column;
        if (header === 'KHOA' || header === 'KHOA / VIEN') facultyColumn = column;
      }
      if (classColumn && majorColumn) {
        headerRow = rowNumber;
        break;
      }
    }
    if (!headerRow) continue;

    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const classCode = normalizeClassCode(cellText(row.getCell(classColumn)));
      const majorName = cellText(row.getCell(majorColumn));
      if (!classCode && !majorName) continue;
      rows.push({
        fileName,
        rowNumber,
        studentCode: studentColumn ? cellText(row.getCell(studentColumn)) : '',
        classCode,
        cohortCode: cohortFromClassCode(classCode),
        majorName,
        facultyName: facultyColumn ? cellText(row.getCell(facultyColumn)) : '',
      });
    }
  }

  return rows;
}

function chooseMajor(candidates) {
  return [...candidates.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'vi'))[0]?.[0] ?? null;
}

function resolveConflictingMajor(classCode, candidates) {
  // Trong dữ liệu đào tạo của trường, hậu tố CL trên mã lớp là dấu hiệu ổn định
  // của chương trình CLC. Một số file tốt nghiệp cũ lại ghi tên ngành là (NC),
  // nên ưu tiên mã lớp thay vì loại cả lớp khỏi danh mục import.
  if (classCode.endsWith('CL')) {
    const clcMajor = [...candidates.keys()].find((name) => /\(CLC\)\s*$/i.test(name));
    if (clcMajor) {
      return { majorName: clcMajor, rule: 'Hậu tố CL của mã lớp → chương trình CLC' };
    }
  }
  return {
    majorName: chooseMajor(candidates),
    rule: 'Tên ngành xuất hiện nhiều nhất trong dữ liệu nguồn',
  };
}

function styleImportSheet(sheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'C1' };
  sheet.columns = [
    { key: 'classCode', width: 24 },
    { key: 'majorName', width: 44 },
    { key: 'studentCount', width: 20 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B84B3' } };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  header.height = 24;
}

async function writeCohortWorkbook(cohortCode, items, auditRows, destination) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KhaoSatVMU';
  workbook.created = new Date();
  const importSheet = workbook.addWorksheet('Khoa nganh dao tao');
  importSheet.addRow(['Khoá ngành đào tạo', 'Ngành đào tạo', 'Số lượng sinh viên']);
  for (const item of items) {
    importSheet.addRow([item.classCode, item.majorName, item.studentCount]);
  }
  styleImportSheet(importSheet);

  const auditSheet = workbook.addWorksheet('Đối chiếu nguồn');
  auditSheet.addRow([
    'Khoá',
    'Mã lớp',
    'Ngành chuẩn được chọn',
    'Số SV duy nhất quan sát được',
    'Tên ngành xuất hiện trong nguồn',
    'Kết luận',
  ]);
  for (const item of auditRows) {
    auditSheet.addRow([
      cohortCode,
      item.classCode,
      item.majorName ?? '',
      item.studentCount,
      item.sourceMajorNames.join(' | '),
      item.status,
    ]);
  }
  auditSheet.views = [{ state: 'frozen', ySplit: 1 }];
  auditSheet.autoFilter = { from: 'A1', to: 'F1' };
  auditSheet.columns = [16, 22, 42, 25, 70, 34].map((width) => ({ width }));
  auditSheet.getRow(1).font = { bold: true };

  const guide = workbook.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 110;
  guide.addRow(['HƯỚNG DẪN']);
  guide.addRow([`Khi import, chọn đúng ${cohortCode} ở trường “Import vào khoá học”.`]);
  guide.addRow(['Sheet “Khoa nganh dao tao” là dữ liệu import; hệ thống chỉ đọc sheet đầu tiên.']);
  guide.addRow(['Số lượng sinh viên trong file này là số mã sinh viên duy nhất quan sát được trong các file tốt nghiệp nguồn.']);
  guide.addRow(['Đây là số tối thiểu đã biết, không phải sĩ số đầu khoá. Cần thay bằng sĩ số đầu khoá chính thức nếu có.']);
  guide.addRow(['Các mã lớp có tên ngành nguồn mâu thuẫn vẫn được đưa vào import theo quy tắc mã lớp; chi tiết nằm trong sheet “Đối chiếu nguồn”.']);
  guide.getRow(1).font = { bold: true, size: 14 };

  await workbook.xlsx.writeFile(destination);
}

async function main() {
  const canonicalMajors = await loadCanonicalMajors(catalogFile);
  const canonicalByName = new Map(canonicalMajors.map((major) => [normalizeText(major.name), major]));
  const sourceRows = await readSourceRows(sourceDirectory);
  const grouped = new Map();
  const unresolvedRows = [];

  for (const row of sourceRows) {
    const major = canonicalByName.get(normalizeText(row.majorName));
    if (!row.cohortCode || !major) {
      unresolvedRows.push({ ...row, reason: !row.cohortCode ? 'Không tách được khóa từ mã lớp' : 'Không khớp danh mục ngành' });
      continue;
    }
    const key = `${row.cohortCode}\u0000${row.classCode}`;
    let item = grouped.get(key);
    if (!item) {
      item = {
        cohortCode: row.cohortCode,
        classCode: row.classCode,
        majors: new Map(),
        students: new Set(),
        sourceNames: new Set(),
      };
      grouped.set(key, item);
    }
    item.majors.set(major.name, (item.majors.get(major.name) ?? 0) + 1);
    item.sourceNames.add(row.majorName);
    if (row.studentCode) item.students.add(row.studentCode);
  }

  const cohorts = new Map();
  const conflicts = [];
  for (const item of grouped.values()) {
    const isConflict = item.majors.size > 1;
    const resolution = isConflict
      ? resolveConflictingMajor(item.classCode, item.majors)
      : { majorName: chooseMajor(item.majors), rule: null };
    const chosenName = resolution.majorName;
    const audit = {
      classCode: item.classCode,
      majorName: chosenName,
      studentCount: item.students.size,
      sourceMajorNames: [...item.sourceNames].sort((a, b) => a.localeCompare(b, 'vi')),
      status: isConflict
        ? `Mâu thuẫn tên ngành — đã đối chiếu: ${resolution.rule}`
        : 'Đủ điều kiện import',
    };
    if (!cohorts.has(item.cohortCode)) cohorts.set(item.cohortCode, { imports: [], audits: [] });
    const cohort = cohorts.get(item.cohortCode);
    cohort.audits.push(audit);
    if (isConflict) {
      conflicts.push({
        cohortCode: item.cohortCode,
        ...audit,
        resolutionRule: resolution.rule,
        counts: Object.fromEntries(item.majors),
      });
    }
    cohort.imports.push({ classCode: item.classCode, majorName: chosenName, studentCount: item.students.size });
  }

  const duplicateMajorMappings = [];
  for (const [cohortCode, cohort] of cohorts) {
    const byMajor = new Map();
    for (const item of cohort.imports) {
      if (!byMajor.has(item.majorName)) byMajor.set(item.majorName, []);
      byMajor.get(item.majorName).push(item.classCode);
    }
    for (const [majorName, classCodes] of byMajor) {
      if (classCodes.length > 1) {
        duplicateMajorMappings.push({ cohortCode, majorName, classCodes });
      }
    }
  }

  const report = {
    sourceFileCount: fs.readdirSync(sourceDirectory).filter((name) => name.toLowerCase().endsWith('.xlsx')).length,
    sourceRowCount: sourceRows.length,
    sourceClassCount: new Set(sourceRows.map((row) => row.classCode).filter(Boolean)).size,
    cohortCount: cohorts.size,
    importRowCount: [...cohorts.values()].reduce((sum, cohort) => sum + cohort.imports.length, 0),
    importRowsByCohort: Object.fromEntries([...cohorts.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'vi', { numeric: true }))
      .map(([cohortCode, cohort]) => [cohortCode, cohort.imports.length])),
    conflictCount: conflicts.length,
    resolvedConflictCount: conflicts.length,
    duplicateMajorMappingCount: duplicateMajorMappings.length,
    unresolvedRowCount: unresolvedRows.length,
    conflicts,
    duplicateMajorMappings,
    unresolved: unresolvedRows.slice(0, 100),
  };
  report.coveredClassCount = report.importRowCount;
  report.classCoveragePercent = report.sourceClassCount > 0
    ? Number((report.coveredClassCount * 100 / report.sourceClassCount).toFixed(2))
    : 100;

  if (!outputDirectory) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const [cohortCode, cohort] of [...cohorts.entries()].sort()) {
    cohort.imports.sort((left, right) => left.classCode.localeCompare(right.classCode, 'vi'));
    cohort.audits.sort((left, right) => left.classCode.localeCompare(right.classCode, 'vi'));
    await writeCohortWorkbook(
      cohortCode,
      cohort.imports,
      cohort.audits,
      path.join(outputDirectory, `khoa-nganh-dao-tao-${cohortCode}.xlsx`),
    );
  }
  fs.writeFileSync(path.join(outputDirectory, 'bao-cao-doi-chieu.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
