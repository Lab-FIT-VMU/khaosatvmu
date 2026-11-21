const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadModule(file) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (id) => id.startsWith('.')
    ? loadModule(path.resolve(path.dirname(file), `${id}.ts`))
    : require(id);
  new Function('module', 'exports', 'require', source)(module, module.exports, localRequire);
  return module.exports;
}

const { canAccessModule } = loadModule(path.resolve(__dirname, '../src/auth/modulePermissions.ts'));

for (const tab of ['design-system', 'course-grade-design']) {
  test(`${tab} requires its own permission, including for old bookmarks`, () => {
    assert.equal(canAccessModule(undefined, tab), false);
    assert.equal(canAccessModule([], tab), false);
    assert.equal(canAccessModule(['COURSE_GRADE_ANALYSIS_ACCESS', 'USER_ADMIN_ACCESS'], tab), false);
    assert.equal(canAccessModule(['DESIGN_SYSTEM_ACCESS'], tab), true);
    assert.equal(canAccessModule([], tab), false);
  });
}
