'use strict';

const assert = require('node:assert/strict');
const { createMainStateStore } = require('../src/lib/main-state-store');

(function testResetCurrentDocumentClearsPath() {
  const store = createMainStateStore();
  store.setCurrentDocument('C:\\bot.charx', { name: 'bot' });
  store.resetCurrentDocument({ name: 'new' });
  assert.equal(store.currentFilePath, null);
  assert.deepEqual(store.currentData, { name: 'new' });
})();

(function testReferenceFilesAreCopiedOnSet() {
  const store = createMainStateStore();
  const refs = [{ filePath: 'C:\\a.charx' }];
  store.setReferenceFiles(refs);
  refs.push({ filePath: 'C:\\b.charx' });
  assert.deepEqual(store.referenceFiles, [{ filePath: 'C:\\a.charx' }]);
})();

(function testReferenceManifestStatusUpdates() {
  const store = createMainStateStore();
  store.setReferenceManifestStatus({ level: 'warn', message: 'warn' });
  assert.deepEqual(store.referenceManifestStatus, { level: 'warn', message: 'warn' });
})();

console.log('Main state store tests passed');
