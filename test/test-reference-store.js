'use strict';

const assert = require('node:assert/strict');

const {
  normalizeReferencePath,
  upsertReferenceRecord,
  removeReferenceRecord,
  serializeReferenceManifest,
  parseReferenceManifest,
  validateReferenceManifestPaths
} = require('../src/lib/reference-store');

(function testUpsertUsesFilePathIdentity() {
  const first = {
    fileName: 'same.charx',
    filePath: 'C:\\refs\\alpha\\same.charx',
    data: { name: 'alpha' }
  };
  const second = {
    fileName: 'same.charx',
    filePath: 'C:\\refs\\beta\\same.charx',
    data: { name: 'beta' }
  };

  const records = upsertReferenceRecord(upsertReferenceRecord([], first), second);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((entry) => entry.data.name), ['alpha', 'beta']);
})();

(function testRemovePrefersFullPathIdentity() {
  const records = [
    { fileName: 'same.charx', filePath: 'C:\\refs\\alpha\\same.charx', data: {} },
    { fileName: 'same.charx', filePath: 'C:\\refs\\beta\\same.charx', data: {} }
  ];

  const remaining = removeReferenceRecord(records, 'C:\\refs\\alpha\\same.charx');
  assert.equal(remaining.length, 1);
  assert.equal(normalizeReferencePath(remaining[0].filePath), normalizeReferencePath('C:\\refs\\beta\\same.charx'));
})();

(function testManifestRoundTripDeduplicatesPaths() {
  const manifest = serializeReferenceManifest([
    { fileName: 'a.charx', filePath: 'C:\\refs\\a.charx', data: {} },
    { fileName: 'a.charx', filePath: 'C:\\refs\\a.charx', data: {} },
    { fileName: 'b.charx', filePath: 'C:\\refs\\b.charx', data: {} }
  ]);

  assert.deepEqual(parseReferenceManifest(manifest), [
    normalizeReferencePath('C:\\refs\\a.charx'),
    normalizeReferencePath('C:\\refs\\b.charx')
  ]);
})();

(function testManifestValidationFiltersMissingAndUnsupportedFiles() {
  const result = validateReferenceManifestPaths(
    {
      version: 1,
      paths: [
        'C:\\refs\\a.charx',
        'C:\\refs\\notes.txt',
        'C:\\refs\\missing.risum'
      ]
    },
    {
      existsSync(filePath) {
        return filePath.endsWith('a.charx') || filePath.endsWith('notes.txt');
      }
    }
  );

  assert.deepEqual(result.validPaths, [normalizeReferencePath('C:\\refs\\a.charx')]);
  assert.deepEqual(result.issues, [
    { filePath: normalizeReferencePath('C:\\refs\\notes.txt'), reason: 'unsupported-extension' },
    { filePath: normalizeReferencePath('C:\\refs\\missing.risum'), reason: 'missing-file' }
  ]);
})();

console.log('Reference store tests passed');
