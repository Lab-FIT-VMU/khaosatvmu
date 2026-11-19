const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function importer(sheet) {
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
      ? { readSheet: async () => sheet }
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
  const rows = await api.parseLecturerImportFile({ name: 'lecturers.xlsx', size: 100 });
  assert.deepEqual(rows.map(row => row.rowNumber), [2, 3, 4, 5]);
  assert.match(api.lecturerImportRowError(rows[0]), /Thiếu email/);
  assert.match(api.lecturerImportRowError(rows[1]), /không đúng định dạng/);
  assert.match(api.lecturerImportRowError(rows[2]), /200 ký tự/);
  assert.equal(api.lecturerImportRowError(rows[3]), null);
});

test('a corrected failed-row workbook can be parsed and validated again', async () => {
  const api = importer([['Họ và tên', 'Email', 'Lý do lỗi'], ['Nguyễn Văn A', 'fixed@example.com', 'Thiếu email']]);
  const rows = await api.parseLecturerImportFile({ name: 'dong-loi-giang-vien.xlsx', size: 100 });
  assert.equal(rows.length, 1);
  assert.equal(api.lecturerImportRowError(rows[0]), null);
});
