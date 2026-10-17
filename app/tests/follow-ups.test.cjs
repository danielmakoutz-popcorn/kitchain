const fs = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

// Exercise the actual pure TypeScript modules without a native runtime or a second test framework.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(outputText, filename);
};
const { createScanDraftStore, emptyScanDraft } = require('../lib/scan-draft-core.ts');
const { findRecipes } = require('../lib/recipe-search.ts');

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
}
const origin = 'http://example.test:8000';
function review() {
  return {
    ...emptyScanDraft(origin),
    photo: { uri: 'file:///documents/draft.png', width: 80, height: 50, mimeType: 'image/png' },
    result: { scan_id: 11, title: 'Soup', ingredients: ['2 eggs'], steps: ['Mix'], notes: ['Warm'], raw_text: 'Raw response', confidence: 'medium', uncertain_lines: ['amount'] },
    title: 'Edited soup', ingredientsText: '3 eggs', stepsText: 'Mix gently', notesText: 'Serve warm', selectedProfileId: 7,
  };
}

test('a new screen/store recovers the edited review, photo, scan, notes, and writer', async () => {
  const storage = memoryStorage();
  const original = review();
  await createScanDraftStore(storage, origin).save(original);
  assert.deepEqual(await createScanDraftStore(storage, origin).load(), original);
});

test('drafts are isolated by API server', async () => {
  const storage = memoryStorage();
  await createScanDraftStore(storage, origin).save(review());
  assert.equal(await createScanDraftStore(storage, 'http://another-server.test').load(), null);
});

test('a delayed old autosave cannot recreate a cleared draft', async () => {
  const storage = memoryStorage();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const originalWrite = storage.setItem;
  storage.setItem = async (...args) => { await gate; await originalWrite(...args); };
  const store = createScanDraftStore(storage, origin);
  const first = store.save(review());
  const second = store.save({ ...review(), title: 'Latest edit' });
  const removal = store.clear();
  release();
  await Promise.all([first, second, removal]);
  assert.equal(await store.load(), null);
});

test('a failed write can be retried without poisoning later saves', async () => {
  const storage = memoryStorage();
  const originalWrite = storage.setItem;
  storage.setItem = async () => { throw new Error('Full device'); };
  const store = createScanDraftStore(storage, origin);
  await assert.rejects(store.save(review()), /Full device/);
  storage.setItem = originalWrite;
  await store.save({ ...review(), title: 'Retried edit' });
  assert.equal((await store.load()).title, 'Retried edit');
});

test('a malformed draft is reported and preserved for an explicit discard', async () => {
  const storage = memoryStorage();
  await storage.setItem(`kitchain:scan-draft:v1:${encodeURIComponent(origin)}`, '{broken');
  const store = createScanDraftStore(storage, origin);
  await assert.rejects(store.load());
  assert.equal(storage.values.size, 1);
  await store.clear();
  assert.equal(await store.load(), null);
});

test('completion markers survive failed cleanup so a known saved recipe can be opened', async () => {
  const storage = memoryStorage();
  const store = createScanDraftStore(storage, origin);
  const draft = review();
  await store.save(draft);
  storage.removeItem = async () => { throw new Error('Unavailable'); };
  await assert.rejects(store.finish(draft, 501), /Unavailable/);
  assert.equal((await createScanDraftStore(storage, origin).load()).savedRecipeId, 501);
});

test('an older screen finishing a save cannot erase or overwrite a newer photo draft', async () => {
  const storage = memoryStorage();
  const store = createScanDraftStore(storage, origin);
  const original = review();
  await store.save(original);
  const newer = { ...review(), title: 'A different card', photo: { ...review().photo, uri: 'file:///documents/new-card.png' } };
  await store.save(newer);
  assert.equal(await store.finish(original, 501), false);
  assert.deepEqual(await store.load(), newer);
});

test('finishing an old save preserves newer edits and a rescan of the same photo', async () => {
  const storage = memoryStorage();
  const store = createScanDraftStore(storage, origin);
  const original = review();
  for (const newer of [{ ...original, title: 'Edited after returning' }, { ...original, result: { ...original.result, scan_id: 12 } }]) {
    await store.save(newer);
    assert.equal(await store.finish(original, 501), false);
    assert.deepEqual(await store.load(), newer);
  }
});

const recipes = [
  { id: 1, title: 'Café Soup', description: 'Comfort food', ingredients: ['2 Eggs', '1 cup milk'], created_at: '2026-01-01T12:00:00Z' },
  { id: 2, title: 'Apple bake', description: 'Quick dessert', ingredients: ['Apples', 'cinnamon'], created_at: '2026-03-01T12:00:00Z' },
  { id: 3, title: 'Toast (GF)', description: 'Breakfast', ingredients: ['Bread'], created_at: '2026-02-01T12:00:00Z' },
];
test('search matches title, description and ingredients without case/accent sensitivity', () => {
  assert.deepEqual(findRecipes(recipes, ' CAFE eggs ').map(r => r.id), [1]);
  assert.deepEqual(findRecipes(recipes, 'quick').map(r => r.id), [2]);
  assert.deepEqual(findRecipes(recipes, 'CINNAMON').map(r => r.id), [2]);
  assert.deepEqual(findRecipes(recipes, 'unmatched'), []);
  assert.deepEqual(findRecipes(recipes, '(GF)').map(r => r.id), [3]);
});
test('clearing search shows all recipes; sorting never mutates the collection', () => {
  const original = recipes.map(r => r.id);
  assert.deepEqual(findRecipes(recipes, '   ').map(r => r.id), [2, 3, 1]);
  assert.deepEqual(findRecipes(recipes, '', 'oldest').map(r => r.id), [1, 3, 2]);
  assert.deepEqual(findRecipes(recipes, '', 'title').map(r => r.id), [2, 1, 3]);
  assert.deepEqual(recipes.map(r => r.id), original);
});

function photoAdapter(copy) {
  const vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../lib/draft-platform.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  class Directory {
    constructor() { this.uri = 'file:///documents/kitchain-scan-drafts'; }
    create() {}
  }
  class File {
    constructor(parent, name) { this.uri = name ? `${parent.uri}/${name}` : parent; }
    copy(destination) { return copy(destination); }
  }
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      if (name === 'expo-file-system') return { Directory, File, Paths: { document: 'file:///documents' } };
      if (name === '@react-native-async-storage/async-storage') return { default: memoryStorage() };
      throw new Error(`Unexpected runtime import: ${name}`);
    },
  });
  return exports;
}

test('native photo draft is not ready until the asynchronous file copy finishes', async () => {
  let finishCopy;
  const copying = new Promise(resolve => { finishCopy = resolve; });
  const adapter = photoAdapter(() => copying);
  let ready = false;
  const saving = adapter.keepDraftPhoto({ uri: 'file:///cache/card.png', width: 80, height: 50 }).then(photo => {
    ready = true;
    return photo;
  });
  await Promise.resolve();
  assert.equal(ready, false);
  finishCopy();
  assert.match((await saving).uri, /^file:\/\/\/documents\/kitchain-scan-drafts\//);
});

test('native photo copy failure reaches the caller instead of storing an unusable draft', async () => {
  const adapter = photoAdapter(() => Promise.reject(new Error('Storage full')));
  await assert.rejects(adapter.keepDraftPhoto({ uri: 'file:///cache/card.png' }), /Storage full/);
});
