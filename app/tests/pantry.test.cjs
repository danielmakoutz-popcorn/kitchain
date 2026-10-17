const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

function moduleFrom(relative, imports = {}) {
  const filename = path.resolve(__dirname, relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, Headers, process: { env: {} }, require: name => {
    if (!(name in imports)) throw new Error('Unexpected import: ' + name);
    return imports[name];
  } }, { filename });
  return exports;
}

test('manual entries and reviewed photo names merge without duplicate ingredients', () => {
  const { ingredientList, validatePantry } = moduleFrom('../lib/pantry.ts');
  const items = ingredientList('Rice, Bell   pepper\n\n rice \nEggs');
  assert.deepEqual(Array.from(items), ['rice', 'Bell pepper', 'Eggs']);
  validatePantry(items);
  assert.throws(() => validatePantry(Array.from({ length: 81 }, (_, i) => 'food ' + i)), /80/);
  assert.throws(() => validatePantry(['x'.repeat(101)]), /100/);
});

function apiFixture(respond) {
  const origin = 'http://api.test:8000';
  const key = 'kitchain-community-profile:' + origin;
  const values = new Map([[key, 'existing-token']]);
  const calls = [];
  const api = moduleFrom('../lib/api.ts', {
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { apiBase: origin } } } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async name => values.get(name) ?? null,
      setItem: async (name, value) => values.set(name, value),
    } },
    'expo/fetch': { fetch: async (url, init) => {
      calls.push({ url, init });
      const reply = await respond(url.replace(origin, ''), init);
      return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
    } },
  });
  return { api, calls, values, key };
}

test('a temporary server failure cannot silently create a different pantry owner', async () => {
  const fixture = apiFixture(() => ({ status: 503, body: { detail: 'Server temporarily unavailable' } }));
  await assert.rejects(fixture.api.pantryApi.get(), /temporarily unavailable/);
  assert.equal(fixture.values.get(fixture.key), 'existing-token');
  assert.equal(fixture.calls.length, 1);
  assert.ok(fixture.calls[0].url.endsWith('/community/me'));
});

test('an invalidated local profile is replaced only after an explicit 401 response', async () => {
  const fixture = apiFixture((route, init) => {
    if (route.endsWith('/community/me')) return { status: 401, body: { detail: 'Unknown local profile' } };
    if (route.endsWith('/community/members')) return { status: 201, body: { id: 'new-cook', name: 'Home cook', token: 'new-token' } };
    assert.equal(init.headers.get('Authorization'), 'Bearer new-token');
    return { status: 200, body: { items: [], revision: 0 } };
  });
  await fixture.api.pantryApi.get();
  assert.equal(fixture.values.get(fixture.key), 'new-token');
  assert.equal(fixture.calls.length, 3);
});

test('concurrent pantry calls reuse the same cook and attach its token and revision', async () => {
  const fixture = apiFixture((route, init) => {
    if (route.endsWith('/community/me')) return { status: 200, body: { id: 'cook-1', name: 'Home cook' } };
    assert.equal(init.headers.get('Authorization'), 'Bearer existing-token');
    if (init.method === 'PUT') assert.deepEqual(JSON.parse(init.body), { items: ['Rice'], revision: 3 });
    return { status: 200, body: { items: ['Rice'], revision: 4 } };
  });
  await Promise.all([fixture.api.pantryApi.get(), fixture.api.pantryApi.get()]);
  await fixture.api.pantryApi.save({ items: ['Rice'], revision: 3 });
  assert.equal(fixture.calls.filter(call => call.url.endsWith('/community/me')).length, 1);
  assert.equal(fixture.calls.filter(call => call.url.endsWith('/community/members')).length, 0);
});
