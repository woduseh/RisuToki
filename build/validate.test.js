'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, executePlan, main } = require('./validate');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-validation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function step(id, code, dependencies = []) {
  return { id, dependencies, commands: [['-e', code]] };
}

function plan(steps) {
  return { profile: 'fixture', focusedTests: [], steps };
}
const quiet = () => {};

test('argument validation fails closed and does not silently broaden focused validation', () => {
  assert.deepEqual(parseArgs(['--test', 'src/lib/mcp-search.test.ts', '--plan', '--json']), {
    profile: 'quick',
    tests: ['src/lib/mcp-search.test.ts'],
    plan: true,
    json: true,
    timeoutMs: 300000,
  });
  for (const args of [['--typo'], ['--profile'], ['--json'], ['--timeout-ms', 'NaN'], ['--timeout-ms', '0']]) {
    assert.throws(() => parseArgs(args));
  }
});

test('plan mode prints parseable JSON without creating files or directories', async (t) => {
  const outputs = [];
  t.mock.method(console, 'log', (value) => outputs.push(value));
  t.mock.method(fs, 'mkdirSync', () => {
    throw new Error('plan must not create directories');
  });
  t.mock.method(fs, 'writeFileSync', () => {
    throw new Error('plan must not write files');
  });
  await main(['--profile', 'full', '--plan', '--json']);
  const result = JSON.parse(outputs[0]);
  assert.equal(result.profile, 'full');
  assert.equal(result.steps.filter(({ id }) => id === 'node-build').length, 1);
});

test('successful commands run at repository root, isolate corpus opt-in, and retain full logs', async (t) => {
  const root = fixture(t);
  const previous = process.env.RISUTOKI_TEST_LOCAL_CORPUS;
  process.env.RISUTOKI_TEST_LOCAL_CORPUS = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.RISUTOKI_TEST_LOCAL_CORPUS;
    else process.env.RISUTOKI_TEST_LOCAL_CORPUS = previous;
  });
  const report = await executePlan(
    plan([
      step(
        'environment',
        `
    const assert = require('node:assert/strict');
    assert.equal(process.env.RISUTOKI_TEST_LOCAL_CORPUS, undefined);
    require('node:fs').writeFileSync('marker', process.cwd());
    console.log('x'.repeat(20000));
  `,
      ),
    ]),
    { root, output: quiet },
  );
  assert.equal(report.status, 'passed');
  assert.equal(fs.readFileSync(path.join(root, 'marker'), 'utf8'), root);
  assert.ok(fs.statSync(path.join(root, report.steps[0].log)).size > 20000);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.build/validation/latest.json'))).status, 'passed');
  assert.equal(fs.existsSync(path.join(root, '.build/validation/lock.json')), false);
});

test('exit failure beats success-looking output, skips dependents, and continues independent checks', async (t) => {
  const root = fixture(t);
  const report = await executePlan(
    plan([
      step('build', `console.log('x'.repeat(20000)); console.log('{"passed":true}'); process.exitCode=7;`),
      step('dependent', `throw new Error('must not run')`, ['build']),
      step('independent', `console.log('independent passed')`),
    ]),
    { root, output: quiet },
  );
  assert.equal(report.status, 'failed');
  assert.deepEqual(
    report.steps.map(({ status }) => status),
    ['failed', 'skipped', 'passed'],
  );
  assert.equal(report.steps[0].outcome.exitCode, 7);
  assert.ok(Buffer.byteLength(report.steps[0].tail) <= 8192);
  assert.match(report.steps[0].tail, /"passed":true/);
  assert.match(report.steps[1].reason, /build/);
});

test('a hung command times out, fails the run, and releases its lock', async (t) => {
  const root = fixture(t);
  const report = await executePlan(plan([step('hung', 'setInterval(() => {}, 1000)')]), {
    root,
    timeoutMs: 300,
    output: quiet,
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.steps[0].outcome.timedOut, true);
  assert.equal(fs.existsSync(path.join(root, '.build/validation/lock.json')), false);
});

test('a timed-out command stops its grandchild heartbeat', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-validation-tree-'));
  const heartbeatPath = path.join(root, 'grandchild-heartbeat');
  const pidPath = path.join(root, 'grandchild-pid');
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  t.after(() => {
    // Clean up even when a regression leaves the descendant alive.
    try {
      if (fs.existsSync(pidPath)) {
        const pid = Number(fs.readFileSync(pidPath, 'utf8'));
        try {
          process.kill(pid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  const grandchild = `
    const fs = require('node:fs');
    fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
    const beat = () => fs.writeFileSync(${JSON.stringify(heartbeatPath)}, String(Date.now()));
    beat();
    setInterval(beat, 50);
    setTimeout(() => process.exit(0), 15000);
  `;
  const report = await executePlan(
    plan([
      step(
        'parent',
        `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore', windowsHide: true }); setInterval(() => {}, 1000);`,
      ),
    ]),
    { root, timeoutMs: 2000, output: quiet },
  );
  assert.equal(report.status, 'failed');
  assert.equal(report.steps[0].outcome.timedOut, true);
  assert.ok(fs.existsSync(heartbeatPath), 'grandchild must start before the timeout');
  const stoppedHeartbeat = fs.readFileSync(heartbeatPath, 'utf8');
  await delay(400);
  assert.equal(fs.readFileSync(heartbeatPath, 'utf8'), stoppedHeartbeat, 'grandchild must stop writing after timeout');
});

test('an existing lock is never stolen or removed', async (t) => {
  const root = fixture(t);
  const directory = path.join(root, '.build/validation');
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, 'lock.json');
  const owner = JSON.stringify({ pid: process.pid, runId: 'another-run' });
  fs.writeFileSync(lock, owner);
  await assert.rejects(executePlan(plan([step('never', '')]), { root, output: quiet }), /Another validation/);
  assert.equal(fs.readFileSync(lock, 'utf8'), owner);
});

test('an aborted run records interruption and skips subsequent steps', async (t) => {
  const root = fixture(t);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300);
  t.after(() => clearTimeout(timer));
  const report = await executePlan(
    plan([step('running', 'setInterval(() => {}, 1000)'), step('later', 'process.exit(0)')]),
    { root, signal: controller.signal, output: quiet },
  );
  assert.equal(report.status, 'interrupted');
  assert.equal(report.steps[1].status, 'skipped');
  assert.equal(fs.existsSync(path.join(root, '.build/validation/lock.json')), false);
});

test('an empty plan cannot pass validation', async (t) => {
  await assert.rejects(executePlan(plan([]), { root: fixture(t), output: quiet }), /at least one step/);
});
