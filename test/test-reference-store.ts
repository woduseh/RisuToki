import assert from 'node:assert/strict';

import {
  normalizeReferencePath,
  upsertReferenceRecord,
  removeReferenceRecord,
  serializeReferenceManifest,
  parseReferenceManifest,
  validateReferenceManifestPaths,
  getRefFileType,
  REF_SCALAR_FIELDS,
  REF_ALLOWED_READ_FIELDS,
} from '../src/lib/reference-store';

(function testUpsertUsesFilePathIdentity() {
  const first = {
    fileName: 'same.charx',
    filePath: 'C:\\refs\\alpha\\same.charx',
    data: { name: 'alpha' },
  };
  const second = {
    fileName: 'same.charx',
    filePath: 'C:\\refs\\beta\\same.charx',
    data: { name: 'beta' },
  };

  const records = upsertReferenceRecord(upsertReferenceRecord([], first), second);
  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((entry) => (entry.data as Record<string, string>).name),
    ['alpha', 'beta'],
  );
})();

(function testRemovePrefersFullPathIdentity() {
  const records = [
    { fileName: 'same.charx', filePath: 'C:\\refs\\alpha\\same.charx', data: {} },
    { fileName: 'same.charx', filePath: 'C:\\refs\\beta\\same.charx', data: {} },
  ];

  const remaining = removeReferenceRecord(records, 'C:\\refs\\alpha\\same.charx');
  assert.equal(remaining.length, 1);
  assert.equal(normalizeReferencePath(remaining[0].filePath), normalizeReferencePath('C:\\refs\\beta\\same.charx'));
})();

(function testManifestRoundTripDeduplicatesPaths() {
  const manifest = serializeReferenceManifest([
    { fileName: 'a.charx', filePath: 'C:\\refs\\a.charx', data: {} },
    { fileName: 'a.charx', filePath: 'C:\\refs\\a.charx', data: {} },
    { fileName: 'b.charx', filePath: 'C:\\refs\\b.charx', data: {} },
  ]);

  assert.deepEqual(parseReferenceManifest(manifest), [
    normalizeReferencePath('C:\\refs\\a.charx'),
    normalizeReferencePath('C:\\refs\\b.charx'),
  ]);
})();

(function testManifestValidationFiltersMissingAndUnsupportedFiles() {
  const result = validateReferenceManifestPaths(
    {
      version: 1,
      paths: ['C:\\refs\\a.charx', 'C:\\refs\\preset.risup', 'C:\\refs\\notes.txt', 'C:\\refs\\missing.risum'],
    },
    {
      existsSync(filePath: string) {
        return filePath.endsWith('a.charx') || filePath.endsWith('preset.risup') || filePath.endsWith('notes.txt');
      },
    },
  );

  assert.deepEqual(result.validPaths, [
    normalizeReferencePath('C:\\refs\\a.charx'),
    normalizeReferencePath('C:\\refs\\preset.risup'),
  ]);
  assert.deepEqual(result.issues, [
    { filePath: normalizeReferencePath('C:\\refs\\notes.txt'), reason: 'unsupported-extension' },
    { filePath: normalizeReferencePath('C:\\refs\\missing.risum'), reason: 'missing-file' },
  ]);
})();

(function testValidationAcceptsRisupExtension() {
  const result = validateReferenceManifestPaths(
    {
      version: 1,
      paths: ['C:\\refs\\preset.risup', 'C:\\refs\\card.charx'],
    },
    { existsSync: () => true },
  );
  assert.deepEqual(result.validPaths, [
    normalizeReferencePath('C:\\refs\\preset.risup'),
    normalizeReferencePath('C:\\refs\\card.charx'),
  ]);
  assert.deepEqual(result.issues, []);
})();

(function testGetRefFileTypeFromData() {
  assert.equal(getRefFileType({ data: { _fileType: 'risum' } }), 'risum');
  assert.equal(getRefFileType({ data: { _fileType: 'risup' } }), 'risup');
  assert.equal(getRefFileType({ data: { _fileType: 'charx' } }), 'charx');
  assert.equal(getRefFileType({ data: {} }), 'charx');
})();

(function testGetRefFileTypeFallsBackToExtension() {
  assert.equal(getRefFileType({ fileName: 'mod.risum', data: {} }), 'risum');
  assert.equal(getRefFileType({ fileName: 'pre.risup', data: {} }), 'risup');
  assert.equal(getRefFileType({ fileName: 'card.charx', data: {} }), 'charx');
  assert.equal(getRefFileType({ fileName: 'unknown', data: {} }), 'charx');
})();

(function testRefScalarFieldsContainsExpectedEntries() {
  const ids = REF_SCALAR_FIELDS.map((f) => f.id);
  assert.ok(ids.includes('globalNote'));
  assert.ok(ids.includes('alternateGreetings'));
  assert.ok(ids.includes('groupOnlyGreetings'));
  assert.ok(ids.includes('defaultVariables'));
  assert.ok(ids.includes('description'));
  // isArray flag
  const altGreetings = REF_SCALAR_FIELDS.find((f) => f.id === 'alternateGreetings');
  assert.ok(altGreetings?.isArray);
})();

(function testRefAllowedReadFieldsIncludesLuaCssName() {
  assert.ok(REF_ALLOWED_READ_FIELDS.includes('lua'));
  assert.ok(REF_ALLOWED_READ_FIELDS.includes('css'));
  assert.ok(REF_ALLOWED_READ_FIELDS.includes('name'));
  assert.ok(REF_ALLOWED_READ_FIELDS.includes('globalNote'));
  assert.ok(REF_ALLOWED_READ_FIELDS.includes('defaultVariables'));
  // Array fields should NOT be in allowed read (they have special handling)
  assert.ok(!REF_ALLOWED_READ_FIELDS.includes('alternateGreetings'));
  assert.ok(!REF_ALLOWED_READ_FIELDS.includes('groupOnlyGreetings'));
})();

console.log('Reference store tests passed');
