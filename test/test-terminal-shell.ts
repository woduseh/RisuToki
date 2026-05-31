import assert from 'node:assert/strict';
import {
  buildWindowsTerminalBootstrap,
  buildTerminalLaunchAttempts,
  getTerminalLaunchCandidates,
} from '../src/lib/terminal-shell';

(function testWindowsCandidatesIncludeResilientFallbacks() {
  const candidates = getTerminalLaunchCandidates({ platform: 'win32', env: {} });
  assert.deepEqual(
    candidates.map((candidate) => candidate.shell),
    ['powershell.exe', 'pwsh.exe', 'cmd.exe'],
  );
})();

(function testWindowsBootstrapRefreshesCodexProjectConfig() {
  const bootstrap = buildWindowsTerminalBootstrap();

  assert.match(bootstrap, /function global:__TokiWriteCodexMcpConfig/);
  assert.match(bootstrap, /function global:codex\.cmd/);
  assert.match(bootstrap, /TOKI_MCP_SERVER_PATH/);
})();

(function testAttemptsIncludeFallbackWorkingDirectory() {
  const attempts = buildTerminalLaunchAttempts({
    platform: 'win32',
    env: {},
    cwd: 'C:\\project\\missing',
    fallbackCwd: 'C:\\project',
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
    fallbackCwd: '/workspace',
  });

  assert.equal(attempts.filter((attempt) => attempt.cwd === '/workspace').length, 3);
})();

console.log('Terminal shell tests passed');
