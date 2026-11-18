const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

// Compile the actual TS modules in isolation. Each test owns its fetch mock and
// module cache, so no network access or global fetch mutation is needed.
function modules(fetchMock = async () => { throw new Error('Unexpected request'); }) {
  const cache = new Map();
  const root = path.resolve(__dirname, '../src');
  function load(file) {
    if (!path.extname(file)) file = existsSync(`${file}.ts`) ? `${file}.ts` : path.join(file, 'index.ts');
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = id => id.startsWith('.') ? load(path.resolve(path.dirname(file), id)) : require(id);
    new Function('module', 'exports', 'require', 'fetch', source)(module, module.exports, localRequire, fetchMock);
    return module.exports;
  }
  return relative => load(path.join(root, relative));
}

for (const [status, expected] of [[400, 'API_INVALID_REQUEST'], [401, 'API_UNAUTHORIZED'],
  [403, 'API_FORBIDDEN'], [404, 'API_NOT_FOUND'], [409, 'DATA_CONFLICT'],
  [413, 'API_PAYLOAD_TOO_LARGE'], [429, 'API_RATE_LIMITED'], [500, 'API_SERVER_ERROR'], [502, 'API_SERVER_ERROR']]) {
  test(`HTTP ${status} preserves status, classification and trace header`, async () => {
    const load = modules(async () => new Response('{}', { status, headers: { 'X-Trace-Id': 'request-123' } }));
    const api = load('services/apiClient');
    await assert.rejects(api.apiRequest('/test'), error => {
      assert.ok(error instanceof api.ApiError);
      assert.equal(error.status, status);
      assert.equal(error.errorCode, expected);
      assert.equal(error.traceId, 'request-123');
      assert.match(api.apiErrorMessage(error), /Mã tra cứu: request-123/);
      return true;
    });
  });
}

test('a real network failure is distinguished from a server failure', async () => {
  const load = modules(async () => { throw new TypeError('Failed to fetch'); });
  const api = load('services/apiClient');
  await assert.rejects(api.apiRequest('/test'), error => {
    assert.equal(error.status, 0);
    assert.equal(error.errorCode, 'API_NETWORK_ERROR');
    assert.match(api.apiErrorMessage(error), /Không thể kết nối/);
    assert.doesNotMatch(api.apiErrorMessage(new api.ApiError(500, 'API_SERVER_ERROR')), /Không thể kết nối/);
    return true;
  });
});

for (const body of ['null', '[]', 'not JSON']) {
  test(`unexpected error body ${body} retains HTTP 500`, async () => {
    const load = modules(async () => new Response(body, { status: 500 }));
    const api = load('services/apiClient');
    await assert.rejects(api.apiRequest('/test'), error => error instanceof api.ApiError
      && error.status === 500 && error.errorCode === 'API_SERVER_ERROR');
  });
}

test('the supplied production-style error is shown as a server error', async () => {
  const load = modules(async () => new Response(JSON.stringify({ title: 'Internal Server Error', status: 500,
    detail: 'An unexpected error occurred. Please try again later.', instance: '/api/catalog/lecturers/import' }), { status: 500 }));
  const api = load('services/apiClient');
  await assert.rejects(api.apiRequest('/test'), error => {
    assert.match(api.apiErrorMessage(error), /Máy chủ gặp lỗi/);
    return true;
  });
});

test('domain code, structured error body and trace are preserved', async () => {
  const body = { errorCode: 'CATALOG_LECTURER_EMAIL_EXISTS', traceId: 'body-id', formConfig: { title: 'custom' } };
  const load = modules(async () => new Response(JSON.stringify(body), { status: 409, headers: { 'X-Trace-Id': 'header-id' } }));
  const api = load('services/apiClient');
  await assert.rejects(api.apiRequest('/test'), error => {
    assert.equal(error.errorCode, body.errorCode);
    assert.equal(error.traceId, 'body-id');
    assert.deepEqual(error.body.formConfig, body.formConfig);
    assert.equal(api.apiErrorMessage(error, () => 'Email đã tồn tại.'), 'Email đã tồn tại. Mã tra cứu: body-id.');
    return true;
  });
});

test('success-body protocol and stream failures are not presented as connection failures', async () => {
  for (const [response, code] of [
    [new Response('not JSON', { headers: { 'X-Trace-Id': 'success-id' } }), 'API_INVALID_RESPONSE'],
    [{ ok: true, status: 200, headers: new Headers({ 'X-Trace-Id': 'success-id' }), text: async () => { throw new TypeError('interrupted'); } }, 'API_RESPONSE_READ_ERROR'],
  ]) {
    const api = modules(async () => response)('services/apiClient');
    await assert.rejects(api.apiRequest('/test'), error => {
      assert.equal(error.errorCode, code);
      assert.equal(error.status, 200);
      assert.equal(error.traceId, 'success-id');
      assert.doesNotMatch(api.apiErrorMessage(error), /Không thể kết nối/);
      return true;
    });
  }
});

test('request and response-body cancellation keep AbortError', async () => {
  const aborted = new DOMException('Aborted', 'AbortError');
  const responses = [
    async () => { throw aborted; },
    async () => ({ ok: false, status: 500, json: async () => { throw aborted; } }),
    async () => ({ ok: true, status: 200, headers: new Headers(), text: async () => { throw aborted; } }),
  ];
  for (const fetchMock of responses) {
    const api = modules(fetchMock)('services/apiClient');
    await assert.rejects(api.apiRequest('/test'), error => error === aborted);
  }
});

test('admin and auth modules share common errors without losing domain messages', () => {
  const load = modules();
  const api = load('services/apiClient');
  const admin = load('services/adminErrorMessages');
  const auth = load('auth/authMessages');
  for (const code of ['API_SERVER_ERROR', 'API_NETWORK_ERROR', 'API_UNAUTHORIZED', 'API_FORBIDDEN', 'API_RATE_LIMITED']) {
    assert.equal(admin.adminErrorMessage(code), api.commonApiErrorMessage(code));
    assert.equal(auth.authMessage(code), api.commonApiErrorMessage(code));
  }
  assert.match(admin.adminErrorMessage('ADMIN_IMPORT_ROLE_INVALID'), /Vai trò/);
  assert.match(auth.authMessage('AUTH_PROFILE_DISABLED'), /vô hiệu hóa/);
  assert.doesNotMatch(api.apiErrorMessage(new SyntaxError('private parser failure')), /Không thể kết nối|private/);
});

test('all declared survey and admin business errors have Vietnamese messages', () => {
  const load = modules();
  const mappings = [
    ['Surveys/SurveyContracts.cs', 'SURVEY_', load('services/surveyApi').surveyErrorMessages],
    ['UserAdministration/UserAdministrationContracts.cs', 'ADMIN_', load('services/adminErrorMessages').adminErrorMessages],
  ];
  for (const [file, prefix, messages] of mappings) {
    const contracts = readFileSync(path.resolve(__dirname, '../../Backend/Application', file), 'utf8');
    const codes = [...contracts.matchAll(/public const string \w+ = "([A-Z_]+)"/g)]
      .map(match => match[1]).filter(code => code.startsWith(prefix));
    assert.ok(codes.length > 10);
    for (const code of codes) assert.ok(messages[code], `Missing message for ${code}`);
  }
});

test('graduation UI retains domain details but never blames the file for a 500', () => {
  const load = modules();
  const api = load('services/apiClient');
  const graduation = load('services/graduationErrorMessages');
  assert.equal(graduation.graduationErrorMessage(new api.ApiError(400, 'GRADUATION_IMPORT_INVALID',
    { message: 'Dòng 3: thiếu mã lớp.' })), 'Dòng 3: thiếu mã lớp.');
  const message = graduation.graduationErrorMessage(new api.ApiError(500, 'API_SERVER_ERROR',
    { message: 'private implementation failure', traceId: 'parser-trace' }));
  assert.match(message, /Máy chủ gặp lỗi.*parser-trace/);
  assert.doesNotMatch(message, /private|kiểm tra.*file|file hỏng/);
});
