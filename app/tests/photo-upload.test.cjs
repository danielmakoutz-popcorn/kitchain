const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

function load(relativePath, imports = {}, globals = {}) {
  const filename = path.resolve(__dirname, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, Blob, FormData, TextEncoder, Uint8Array,
    require: name => {
      if (!(name in imports)) throw new Error(`Unexpected runtime import: ${name}`);
      return imports[name];
    },
    ...globals,
  }, { filename });
  return exports;
}

// Use the installed SDK's real FormData patch and multipart serializer: this is
// where the reported iPhone error originated. Only native disk access is mocked.
class RNFormData {
  constructor() { this._parts = []; }
}
const { installFormDataPatch } = load('../node_modules/expo/src/winter/FormData.ts');
const ExpoFormData = installFormDataPatch(RNFormData);
const { convertFormDataAsync } = load('../node_modules/expo/src/winter/fetch/convertFormData.ts', {
  '../../utils/blobUtils': { blobToArrayBufferAsync: blob => blob.arrayBuffer() },
});
// Model the native Blob limitation that Node's browser-compatible Blob misses.
class NativeBlob {
  constructor(parts) {
    if (parts.some(part => part instanceof ArrayBuffer || ArrayBuffer.isView(part))) {
      throw new Error("Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported");
    }
    throw new Error('Native uploads should reference a File directly');
  }
}
const imageBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128, 64]);

for (const uri of ['file:///cache/recipe.png', 'file:///documents/kitchain-scan-drafts/recovered.png']) {
  test(`SDK 57 serializes photo bytes, MIME type and filename from ${uri}`, async () => {
    class File {
      constructor(value) { assert.equal(value, uri); }
      type = 'image/png';
      name = 'Grandma card.png';
      async bytes() { return imageBytes; }
    }
    const { photoForm } = load('../lib/photos.ts', { 'expo-file-system': { File } }, { FormData: ExpoFormData, Blob: NativeBlob });
    const form = await photoForm({ uri, fileName: 'Grandma card.png', mimeType: 'image/png' });
    const { body, boundary } = await convertFormDataAsync(form, 'test-boundary');
    const encoded = Buffer.from(body);
    assert.equal(boundary, 'test-boundary');
    assert.match(encoded.toString('latin1'), /name="file"; filename="Grandma%20card.png"/);
    assert.match(encoded.toString('latin1'), /content-type: image\/png/);
    assert.ok(encoded.includes(Buffer.from(imageBytes)));
    assert.ok(!encoded.includes(Buffer.from(uri)));
  });
}

test('the real SDK serializer rejects the old URI part, reproducing the phone error', async () => {
  const form = new ExpoFormData();
  form.append('file', { uri: 'file:///cache/recipe.png', name: 'recipe.png', type: 'image/png' });
  await assert.rejects(convertFormDataAsync(form), /Unsupported FormDataPart implementation/);
});

test('a native file read failure propagates during multipart serialization', async () => {
  class File { async bytes() { throw new Error('Photo no longer exists'); } }
  const { photoForm } = load('../lib/photos.ts', { 'expo-file-system': { File } }, { FormData: ExpoFormData, Blob: NativeBlob });
  const form = await photoForm({ uri: 'file:///missing.png' });
  await assert.rejects(convertFormDataAsync(form), /Photo no longer exists/);
});

test('web uploads preserve the original browser File', async () => {
  const { photoForm } = load('../lib/photos.web.ts');
  const file = new File([imageBytes], 'recipe.png', { type: 'image/png' });
  const form = await photoForm({ file, uri: 'blob:unused', fileName: file.name });
  const part = form.get('file');
  assert.equal(part.name, 'recipe.png');
  assert.equal(part.type, 'image/png');
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), Buffer.from(imageBytes));
});

test('web recovered drafts upload the bytes from their data URL', async () => {
  const uri = `data:image/png;base64,${Buffer.from(imageBytes).toString('base64')}`;
  const { photoForm } = load('../lib/photos.web.ts', {}, { fetch });
  const part = (await photoForm({ uri, fileName: 'recovered.png' })).get('file');
  assert.equal(part.name, 'recovered.png');
  assert.equal(part.type, 'image/png');
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), Buffer.from(imageBytes));
});


test('the native Blob model reproduces the ArrayBuffer error in the previous fix', () => {
  assert.throws(() => new NativeBlob([imageBytes]), /Creating blobs from 'ArrayBuffer'/);
});
