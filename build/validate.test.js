'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { parseArgs, executePlan, main, CLEANUP_FAILURE_EXIT_CODE } = require('./validate');

function fixture(t, prefix = 'risutoki-validation-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => cleanFixture(root));
  return root;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function cleanFixture(root) {
  if (!fs.existsSync(root)) return;
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('risutoki-validation-'));
  fs.writeFileSync(path.join(root, 'stop-fixture'), 'stop');
  const pids = fs
    .readdirSync(root)
    .filter((name) => name.endsWith('-pid'))
    .map((name) => Number(fs.readFileSync(path.join(root, name), 'utf8')));
  const deadline = Date.now() + 3000;
  while (pids.some(isRunning) && Date.now() < deadline) await delay(25);
  assert.deepEqual(pids.filter(isRunning), [], 'fixture processes must acknowledge cooperative shutdown');
  await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

function cooperativeProcess(root, name, code = '') {
  return `
    const fixtureFs = require('node:fs');
    fixtureFs.writeFileSync(${JSON.stringify(path.join(root, `${name}-pid`))}, String(process.pid));
    setInterval(() => {
      if (fixtureFs.existsSync(${JSON.stringify(path.join(root, 'stop-fixture'))}) ||
          fixtureFs.existsSync(${JSON.stringify(path.join(root, `stop-${name}`))})) process.exit(0);
    }, 25);
    setTimeout(() => process.exit(0), 15000).unref();
    ${code}
  `;
}

function step(id, code, dependencies = []) {
  return { id, dependencies, commands: [['-e', code]] };
}

function plan(steps) {
  return { profile: 'fixture', focusedTests: [], steps };
}
const quiet = () => {};

async function runCli(t, command, { abort = false, hang = false } = {}) {
  const root = fixture(t);
  const build = path.join(root, 'build');
  fs.mkdirSync(build);
  fs.copyFileSync(path.join(__dirname, 'validate.js'), path.join(build, 'validate.js'));
  const code = hang ? cooperativeProcess(root, 'command', command) : command;
  fs.writeFileSync(
    path.join(build, 'validation-plan.js'),
    `exports.createPlan = () => (${JSON.stringify(plan([step('command', code)]))});`,
  );
  const args = [];
  if (abort) {
    fs.writeFileSync(
      path.join(root, 'abort.cjs'),
      `
      const timer = setInterval(() => {
        if (require('node:fs').existsSync('ready')) {
          clearInterval(timer);
          process.emit('SIGINT');
        }
      }, 20);
      timer.unref();
    `,
    );
    args.push('--require', './abort.cjs');
  }
  args.push('build/validate.js', '--timeout-ms', abort ? '10000' : '300');
  const logPath = path.join(root, 'cli.log');
  const fd = fs.openSync(logPath, 'w');
  let child;
  try {
    child = childProcess.spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', fd, fd] });
  } finally {
    fs.closeSync(fd);
  }
  const outcome = await new Promise((resolve) => {
    let error;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      fs.writeFileSync(path.join(root, 'stop-fixture'), 'stop');
    }, 15000);
    child.on('error', (cause) => {
      error = cause;
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, error, timedOut });
    });
  });
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.timedOut, false, 'CLI must finish without the fixture watchdog');
  return {
    root,
    outcome,
    report: JSON.parse(fs.readFileSync(path.join(root, '.build/validation/latest.json'), 'utf8')),
  };
}

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
  const report = await executePlan(plan([step('hung', cooperativeProcess(root, 'command'))]), {
    root,
    timeoutMs: 300,
    output: quiet,
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.steps[0].outcome.timedOut, true);
  if (report.steps[0].outcome.cleanupError) t.diagnostic(report.steps[0].tail);
  assert.equal(fs.existsSync(path.join(root, '.build/validation/lock.json')), false);
});

function treeFixture(t, { detached = false } = {}) {
  const root = fixture(t, 'risutoki-validation-tree-');
  const heartbeatPath = path.join(root, 'grandchild-heartbeat');
  const grandchild = cooperativeProcess(
    root,
    'grandchild',
    `
    const fs = require('node:fs');
    const beat = () => fs.writeFileSync(${JSON.stringify(heartbeatPath)}, String(Date.now()));
    beat();
    setInterval(beat, 50);
  `,
  );
  return {
    root,
    heartbeatPath,
    parent: step(
      'parent',
      cooperativeProcess(
        root,
        'parent',
        `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore', windowsHide: true, detached: ${detached} });`,
      ),
    ),
  };
}

async function assertStoppedHeartbeat(heartbeatPath) {
  assert.ok(fs.existsSync(heartbeatPath), 'grandchild must start before interruption');
  const stoppedHeartbeat = fs.readFileSync(heartbeatPath, 'utf8');
  await delay(400);
  assert.equal(
    fs.readFileSync(heartbeatPath, 'utf8'),
    stoppedHeartbeat,
    'grandchild must stop writing after interruption',
  );
}

for (const interruption of ['timeout', 'abort']) {
  test(`${interruption} stops the process tree before releasing its lock`, async (t) => {
    const { root, heartbeatPath, parent } = treeFixture(t, { detached: process.platform === 'win32' });
    const controller = new AbortController();
    const timer = interruption === 'abort' ? setTimeout(() => controller.abort(), 2000) : undefined;
    let report;
    try {
      report = await executePlan(plan([parent]), {
        root,
        timeoutMs: interruption === 'timeout' ? 2000 : 10000,
        signal: controller.signal,
        output: quiet,
      });
    } finally {
      clearTimeout(timer);
    }
    assert.equal(report.status, interruption === 'timeout' ? 'failed' : 'interrupted');
    assert.equal(fs.existsSync(path.join(root, '.build/validation/lock.json')), false);
    await assertStoppedHeartbeat(heartbeatPath);
  });
}

for (const failure of ['exit', 'spawn']) {
  test(
    `failed Windows tree cleanup (${failure}) keeps the workspace locked and skips further commands`,
    { skip: process.platform !== 'win32' },
    async (t) => {
      const { root, heartbeatPath, parent } = treeFixture(t, { detached: true });
      const spawn = childProcess.spawn;
      t.mock.method(childProcess, 'spawn', (executable, args, options) => {
        // Fault injection still uses a real child process for the failing termination tool.
        if (path.basename(executable).toLowerCase() === 'taskkill') {
          return failure === 'exit'
            ? spawn(process.execPath, ['-e', 'process.exit(5)'], options)
            : spawn(path.join(root, 'missing-taskkill.exe'), args, options);
        }
        return spawn(executable, args, options);
      });
      const controller = new AbortController();
      const timer = failure === 'spawn' ? setTimeout(() => controller.abort(), 2000) : undefined;
      t.after(() => clearTimeout(timer));
      const report = await executePlan(
        plan([parent, step('later', "require('node:fs').writeFileSync('must-not-run', 'ran')")]),
        { root, timeoutMs: failure === 'exit' ? 2000 : 10000, signal: controller.signal, output: quiet },
      );
      const lockPath = path.join(root, '.build/validation/lock.json');
      const before = fs.readFileSync(heartbeatPath, 'utf8');
      await delay(200);
      t.diagnostic(
        JSON.stringify({
          status: report.status,
          later: report.steps[1].status,
          lockRetained: fs.existsSync(lockPath),
          descendantStillWriting: fs.readFileSync(heartbeatPath, 'utf8') !== before,
        }),
      );
      assert.equal(report.status, failure === 'exit' ? 'failed' : 'interrupted');
      assert.equal(report.steps[1].status, 'skipped');
      assert.equal(
        fs.existsSync(lockPath),
        true,
        'unconfirmed cleanup must not unlock a workspace with live descendants',
      );
      assert.match(report.steps[0].outcome.cleanupError, /taskkill/i);
      assert.equal(fs.existsSync(path.join(root, 'must-not-run')), false);
      const owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      assert.equal(owner.childPid, report.steps[0].outcome.pid);
      assert.equal(owner.cleanupError, report.steps[0].outcome.cleanupError);
      await assert.rejects(executePlan(plan([step('retry', '')]), { root, output: quiet }), /Another validation/);
      assert.deepEqual(JSON.parse(fs.readFileSync(lockPath, 'utf8')), owner);
    },
  );
}

test(
  'Windows cleanup awaits a simulated termination helper even after the direct child exits',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const { root, heartbeatPath, parent } = treeFixture(t, { detached: true });
    const spawn = childProcess.spawn;
    t.mock.method(childProcess, 'spawn', (executable, args, options) => {
      if (path.basename(executable).toLowerCase() === 'taskkill') {
        return spawn(
          process.execPath,
          [
            '-e',
            cooperativeProcess(
              root,
              'terminator',
              `
        const fs = require('node:fs');
        // Cooperative fixture shutdown isolates the helper-wait contract from OS permissions.
        fs.writeFileSync(${JSON.stringify(path.join(root, 'stop-grandchild'))}, 'stop');
        fs.writeFileSync(${JSON.stringify(path.join(root, 'stop-parent'))}, 'stop');
        setTimeout(() => {
          fs.writeFileSync(${JSON.stringify(path.join(root, 'termination-finished'))}, 'done');
          process.exit(0);
        }, 400);
      `,
            ),
          ],
          options,
        );
      }
      return spawn(executable, args, options);
    });
    const report = await executePlan(
      plan([
        parent,
        step('later', "require('node:assert/strict').ok(require('node:fs').existsSync('termination-finished'))"),
      ]),
      {
        root,
        timeoutMs: 2000,
        output: quiet,
      },
    );
    assert.equal(report.status, 'failed');
    assert.equal(report.steps[1].status, 'passed');
    assert.equal(fs.existsSync(path.join(root, 'termination-finished')), true);
    assert.equal(fs.existsSync(path.join(root, '.build/validation/lock.json')), false);
    await assertStoppedHeartbeat(heartbeatPath);
  },
);

test(
  'a stalled Windows termination helper is bounded and cannot unlock the workspace',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const { root, parent } = treeFixture(t, { detached: true });
    const spawn = childProcess.spawn;
    t.mock.method(childProcess, 'spawn', (executable, args, options) => {
      if (path.basename(executable).toLowerCase() === 'taskkill') {
        return spawn(process.execPath, ['-e', cooperativeProcess(root, 'terminator')], options);
      }
      return spawn(executable, args, options);
    });
    const started = performance.now();
    const report = await executePlan(plan([parent]), { root, timeoutMs: 2000, output: quiet });
    assert.equal(report.status, 'failed');
    assert.equal(report.lockRetained, true);
    assert.match(report.steps[0].outcome.cleanupError, /cleanup timed out/);
    assert.ok(performance.now() - started < 12000, 'cleanup must not wait forever for taskkill');
  },
);

test('a failed command cannot be masked by a later command in the same step', async (t) => {
  const root = fixture(t);
  const report = await executePlan(
    plan([
      {
        id: 'multiple',
        dependencies: [],
        commands: [
          ['-e', 'process.exit(9)'],
          ['-e', "require('node:fs').writeFileSync('must-not-run', 'passed')"],
        ],
      },
    ]),
    { root, output: quiet },
  );
  assert.equal(report.status, 'failed');
  assert.equal(report.steps[0].outcome.exitCode, 9);
  assert.equal(fs.existsSync(path.join(root, 'must-not-run')), false);
});

test('child cleanup failure exit code 70 retains the lock and blocks every later command', async (t) => {
  const root = fixture(t);
  assert.equal(CLEANUP_FAILURE_EXIT_CODE, 70);
  const report = await executePlan(
    plan([
      {
        id: 'child-runner',
        dependencies: [],
        commands: [
          ['-e', "console.error('Fixture child could not confirm descendant cleanup'); process.exit(70)"],
          ['-e', "require('node:fs').writeFileSync('must-not-run', 'ran')"],
        ],
      },
      step('independent', "require('node:fs').writeFileSync('must-not-run', 'ran')"),
    ]),
    { root, output: quiet },
  );
  assert.equal(report.status, 'failed');
  assert.equal(report.lockRetained, true);
  assert.equal(report.steps[0].outcome.exitCode, 70);
  assert.equal(report.steps[0].outcome.cleanupError, 'Child reported unconfirmed cleanup; inspect step log');
  assert.equal(report.steps[1].status, 'skipped');
  assert.equal(fs.existsSync(path.join(root, 'must-not-run')), false);
  const lockPath = path.join(root, '.build/validation/lock.json');
  const owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(owner.childPid, report.steps[0].outcome.pid);
  assert.equal(owner.cleanupError, report.steps[0].outcome.cleanupError);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.build/validation/latest.json'), 'utf8')), report);
  await assert.rejects(executePlan(plan([step('retry', '')]), { root, output: quiet }), /Another validation/);
  t.diagnostic(
    JSON.stringify({ childExit: 70, status: report.status, lockRetained: true, next: report.steps[1].status }),
  );
});

test('a process terminated by a signal cannot pass validation', async (t) => {
  const report = await executePlan(plan([step('signal', "process.kill(process.pid, 'SIGTERM')")]), {
    root: fixture(t),
    output: quiet,
  });
  assert.equal(report.status, 'failed');
  assert.notEqual(report.steps[0].outcome.exitCode, 0);
});

for (const sample of [
  { name: 'success', code: 'process.exit(0)', exitCode: 0, status: 'passed' },
  { name: 'nonzero failure', code: `console.log('{"passed":true}'); process.exit(7)`, exitCode: 1, status: 'failed' },
  { name: 'timeout', code: '', exitCode: 1, status: 'failed', hang: true },
  {
    name: 'abort',
    code: "require('node:fs').writeFileSync('ready', 'ready')",
    exitCode: 130,
    status: 'interrupted',
    abort: true,
    hang: true,
  },
]) {
  test(`CLI ${sample.name} returns the real failure status from an isolated root`, async (t) => {
    const { root, outcome, report } = await runCli(t, sample.code, sample);
    assert.equal(outcome.exitCode, sample.exitCode);
    assert.equal(report.status, sample.status);
    assert.equal(fs.existsSync(path.join(root, '.build/validation/lock.json')), !!report.lockRetained);
    t.diagnostic(
      JSON.stringify({
        scenario: sample.name,
        exitCode: outcome.exitCode,
        status: report.status,
        lockRetained: !!report.lockRetained,
      }),
    );
  });
}

test('spawn errors fail validation and still allow independent commands', async (t) => {
  const root = fixture(t);
  const spawn = childProcess.spawn;
  let first = true;
  t.mock.method(childProcess, 'spawn', (executable, args, options) => {
    if (first) {
      first = false;
      return spawn(path.join(root, 'missing-node.exe'), args, options);
    }
    return spawn(executable, args, options);
  });
  const report = await executePlan(plan([step('unavailable', ''), step('independent', '')]), { root, output: quiet });
  assert.equal(report.status, 'failed');
  assert.deepEqual(
    report.steps.map(({ status }) => status),
    ['failed', 'passed'],
  );
  assert.match(report.steps[0].outcome.error, /ENOENT/);
  assert.equal(fs.existsSync(path.join(root, '.build/validation/lock.json')), false);
});

test('a synchronous spawn error writes a failure report and releases the lock', async (t) => {
  const root = fixture(t);
  t.mock.method(childProcess, 'spawn', () => {
    throw Object.assign(new Error('spawn EPERM'), { code: 'EPERM' });
  });
  await assert.rejects(executePlan(plan([step('unavailable', '')]), { root, output: quiet }), /spawn EPERM/);
  const report = JSON.parse(fs.readFileSync(path.join(root, '.build/validation/latest.json'), 'utf8'));
  assert.equal(report.status, 'failed');
  assert.equal(report.error, 'spawn EPERM');
  assert.equal(fs.existsSync(path.join(root, '.build/validation/lock.json')), false);
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
    plan([step('running', cooperativeProcess(root, 'command')), step('later', 'process.exit(0)')]),
    { root, signal: controller.signal, output: quiet },
  );
  assert.equal(report.status, 'interrupted');
  assert.equal(report.steps[1].status, 'skipped');
  assert.equal(fs.existsSync(path.join(root, '.build/validation/lock.json')), false);
});

test('an empty plan cannot pass validation', async (t) => {
  await assert.rejects(executePlan(plan([]), { root: fixture(t), output: quiet }), /at least one step/);
});
