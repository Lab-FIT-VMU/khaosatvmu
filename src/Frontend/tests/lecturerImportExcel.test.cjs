const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

// `sheets`: một bảng (mảng các dòng) cho tệp một sheet, hoặc [{ sheet, data }] cho tệp nhiều sheet.
function importer(sheets) {
  const workbook = Array.isArray(sheets) && sheets.length > 0 && !Array.isArray(sheets[0])
    ? sheets
    : [{ sheet: 'Sheet1', data: sheets }];
  const cache = new Map();
  function load(file) {
    if (!path.extname(file)) file = existsSync(`${file}.ts`) ? `${file}.ts` : path.join(file, 'index.ts');
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = id => id === 'read-excel-file/browser'
      ? { __esModule: true, default: async () => workbook, readSheet: async () => workbook[0].data }
      : id.startsWith('.') ? load(path.resolve(path.dirname(file), id)) : require(id);
    new Function('module', 'exports', 'require', source)(module, module.exports, localRequire);
    return module.exports;
  }
  return load(path.resolve(__dirname, '../src/utils/lecturerImportExcel.ts'));
}

test('a workbook without the required email column is rejected before import', async () => {
  const api = importer([['Họ và tên'], ['Nguyễn Văn A']]);
  await assert.rejects(api.parseLecturerImportFile({ name: 'lecturers.xlsx', size: 100 }),
    error => error.code === 'EMAIL_HEADER_MISSING');
});

test('preview identifies missing email, invalid email and oversized names per row', async () => {
  const api = importer([
    ['Họ và tên', 'Email'],
    ['Nguyễn Văn A', ''],
    ['Nguyễn Văn B', 'bad-email'],
    ['x'.repeat(201), 'valid@example.com'],
    ['Nguyễn Văn C', 'valid@example.com'],
  ]);
  const { rows } = await api.parseLecturerImportFile({ name: 'lecturers.xlsx', size: 100 });
  assert.deepEqual(rows.map(row => row.rowNumber), [2, 3, 4, 5]);
  assert.match(api.lecturerImportRowError(rows[0]), /Thiếu email/);
  assert.match(api.lecturerImportRowError(rows[1]), /không đúng định dạng/);
  assert.match(api.lecturerImportRowError(rows[2]), /200 ký tự/);
  assert.equal(api.lecturerImportRowError(rows[3]), null);
});

test('a corrected failed-row workbook can be parsed and validated again', async () => {
  const api = importer([['Họ và tên', 'Email', 'Lý do lỗi'], ['Nguyễn Văn A', 'fixed@example.com', 'Thiếu email']]);
  const { rows } = await api.parseLecturerImportFile({ name: 'dong-loi-giang-vien.xlsx', size: 100 });
  assert.equal(rows.length, 1);
  assert.equal(api.lecturerImportRowError(rows[0]), null);
});

test('a draft sheet in front of the data sheet is skipped, and the sheet can be chosen', async () => {
  const api = importer([
    { sheet: 'Ghi chu', data: [['Ghi chú'], ['Bản nháp']] },
    { sheet: 'Giang vien', data: [['Họ và tên', 'Email'], ['Nguyễn Văn A', 'a@example.com']] },
    { sheet: 'Sheet3', data: [['Họ và tên', 'Email'], ['Nguyễn Văn B', 'b@example.com'], ['Nguyễn Văn C', 'c@example.com']] },
  ]);
  const picked = await api.parseLecturerImportFile({ name: 'lecturers.xlsx', size: 100 });
  assert.equal(picked.sheetName, 'Giang vien');
  assert.deepEqual(picked.sheetNames, ['Ghi chu', 'Giang vien', 'Sheet3']);
  assert.deepEqual(picked.usableSheetNames, ['Giang vien', 'Sheet3']);
  assert.equal(picked.rows.length, 1);

  const chosen = await api.parseLecturerImportFile({ name: 'lecturers.xlsx', size: 100 }, 'Sheet3');
  assert.equal(chosen.sheetName, 'Sheet3');
  assert.equal(chosen.rows.length, 2);
});
