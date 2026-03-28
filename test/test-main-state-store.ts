import assert from 'node:assert/strict';
import { createMainStateStore } from '../src/lib/main-state-store';

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

(function testTerminalCwdDefaultsToNull() {
  const store = createMainStateStore();
  assert.equal(store.terminalCwd, null);
})();

(function testSetTerminalCwd() {
  const store = createMainStateStore();
  store.setTerminalCwd('C:\\repo');
  assert.equal(store.terminalCwd, 'C:\\repo');
  store.setTerminalCwd(null);
  assert.equal(store.terminalCwd, null);
})();

console.log('Main state store tests passed');
