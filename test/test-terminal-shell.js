'use strict';

const assert = require('node:assert/strict');
const {
  buildTerminalLaunchAttempts,
  getTerminalLaunchCandidates
} = require('../src/lib/terminal-shell');

(function testWindowsCandidatesIncludeResilientFallbacks() {
  const candidates = getTerminalLaunchCandidates({ platform: 'win32', env: {} });
  assert.deepEqual(
    candidates.map((candidate) => candidate.shell),
    ['powershell.exe', 'pwsh.exe', 'cmd.exe']
  );
})();

(function testAttemptsIncludeFallbackWorkingDirectory() {
  const attempts = buildTerminalLaunchAttempts({
    platform: 'win32',
    env: {},
    cwd: 'C:\\project\\missing',
    fallbackCwd: 'C:\\project'
  });

  assert.equal(attempts[0].cwd, 'C:\\project\\missing');
  assert.equal(attempts[1].cwd, 'C:\\project');
  assert.equal(attempts[1].isFallbackCwd, true);
})();

(function testAttemptsDeduplicateIdenticalCwds() {
  const attempts = buildTerminalLaunchAttempts({
    platform: 'linux',
    env: { SHELL: '/bin/zsh' },
    cwd: '/workspace',
    fallbackCwd: '/workspace'
  });

  assert.equal(attempts.filter((attempt) => attempt.cwd === '/workspace').length, 3);
})();

console.log('Terminal shell tests passed');
