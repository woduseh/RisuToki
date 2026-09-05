'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createSession, sessionEnv, cleanSession, runDesktop } = require('./desktop');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-desktop-test-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('concurrent sessions isolate home, temp, artifacts and configuration without changing parent env', (t) => {
  const root = fixture(t);
  const one = createSession(root);
  const two = createSession(root);
  const inherited = {
    PATH: 'keep',
    HOME: 'original',
    USERPROFILE: 'original',
    CODEX_HOME: 'original',
    RISUTOKI_MCP_FILE: 'private.charx',
    TOKI_TOKEN: 'private-token',
    VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173',
    NODE_OPTIONS: '--inspect',
    ELECTRON_RUN_AS_NODE: '1',
  };
  const copy = { ...inherited };
  const env = sessionEnv(one, inherited);
  assert.deepEqual(inherited, copy);
  assert.equal(env.PATH, inherited.PATH);
  for (const key of [
    'RISUTOKI_MCP_FILE',
    'TOKI_TOKEN',
    'VITE_DEV_SERVER_URL',
    'NODE_OPTIONS',
    'ELECTRON_RUN_AS_NODE',
    'CODEX_HOME',
  ])
    assert.equal(env[key], undefined);
  for (const key of ['HOME', 'USERPROFILE', 'TMP', 'TEMP', 'TMPDIR', 'APPDATA', 'LOCALAPPDATA']) {
    assert.ok(env[key].startsWith(one.data + path.sep));
    assert.ok(fs.statSync(env[key]).isDirectory());
    assert.notEqual(env[key], sessionEnv(two)[key]);
  }
  fs.writeFileSync(path.join(one.data, 'home', 'test-secret'), 'synthetic');
  fs.writeFileSync(path.join(one.directory, 'report.json'), '{}');
  cleanSession(one, root);
  assert.equal(fs.existsSync(one.data), false);
  assert.equal(fs.existsSync(path.join(one.directory, 'report.json')), true);
  assert.equal(fs.existsSync(two.data), true);
  cleanSession(two, root);
});

test('cleanup rejects a path outside its generated session and retains the sentinel', (t) => {
  const root = fixture(t);
  const session = createSession(root);
  const sentinel = path.join(root, 'user-data');
  fs.mkdirSync(sentinel);
  fs.writeFileSync(path.join(sentinel, 'keep'), 'user data');
  assert.throws(() => cleanSession({ ...session, data: sentinel }, root), /Refusing to clean/);
  assert.equal(fs.readFileSync(path.join(sentinel, 'keep'), 'utf8'), 'user data');
  cleanSession(session, root);
});

test('cleanup does not follow a data junction or symlink', (t) => {
  const root = fixture(t);
  const session = createSession(root);
  const sentinel = path.join(root, 'sentinel');
  fs.mkdirSync(sentinel);
  fs.writeFileSync(path.join(sentinel, 'keep'), 'user data');
  fs.rmSync(session.data, { recursive: true });
  fs.symlinkSync(sentinel, session.data, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => cleanSession(session, root), /Refusing to follow/);
  assert.equal(fs.readFileSync(path.join(sentinel, 'keep'), 'utf8'), 'user data');
  fs.unlinkSync(session.data);
});

test('session creation rejects a redirected build directory before writing outside the checkout', (t) => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-desktop-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(root, '.build'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => createSession(root), /Refusing a redirected/);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(path.join(root, '.build'));
});

for (const condition of ['missing-report', 'empty-checks', 'nonzero-exit']) {
  test(`launcher rejects ${condition}, preserves evidence and cleans a real child session`, async (t) => {
    const root = fixture(t);
    for (const file of ['.build/electron/main.js', '.build/electron/preload.js', 'dist/index.html']) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), 'test build placeholder');
    }
    fs.mkdirSync(path.join(root, 'build'));
    // Test the launcher using a real Node child. This fixture is not an Electron integration pass.
    fs.writeFileSync(
      path.join(root, 'build', 'desktop-entry.js'),
      `
      const fs = require('node:fs');
      const path = require('node:path');
      console.log('PASS (synthetic child output, not evidence of success)');
      if (${JSON.stringify(condition)} !== 'missing-report') {
        fs.writeFileSync(path.join(process.env.RISUTOKI_DESKTOP_RUN_DIR, 'app-result.json'), JSON.stringify({ status: 'passed', shutdown: 'closed', checks: [] }));
      }
      process.exit(${condition === 'nonzero-exit' ? 7 : 0});
    `,
    );
    const report = await runDesktop({}, { root, executable: process.execPath });
    assert.equal(report.status, 'failed');
    assert.equal(report.cleaned, true);
    assert.equal(report.outcome.exitCode, condition === 'nonzero-exit' ? 7 : 0);
    const directory = path.join(root, '.build', 'desktop', fs.readdirSync(path.join(root, '.build', 'desktop'))[0]);
    assert.equal(fs.existsSync(path.join(directory, 'data')), false);
    assert.match(fs.readFileSync(path.join(directory, 'process.log'), 'utf8'), /PASS \(synthetic/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8')).status, 'failed');
  });
}

test('a real report filesystem failure aborts before launch and still cleans session data', async (t) => {
  const root = fixture(t);
  for (const file of ['.build/electron/main.js', '.build/electron/preload.js', 'dist/index.html']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'test build placeholder');
  }
  const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (filename, ...args) => {
    if (path.basename(filename) === 'report.json' && !fs.existsSync(filename)) fs.mkdirSync(filename);
    return write(filename, ...args);
  });
  const report = await runDesktop({}, { root, executable: process.execPath });
  assert.equal(report.status, 'failed');
  assert.equal(report.childPid, undefined);
  assert.equal(report.cleaned, true);
  assert.ok(report.reportWriteError);
  const directory = path.join(root, '.build', 'desktop', fs.readdirSync(path.join(root, '.build', 'desktop'))[0]);
  assert.equal(fs.existsSync(path.join(directory, 'data')), false);
});
