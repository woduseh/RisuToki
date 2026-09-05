'use strict';

// Both `node --test build/doctor.test.js` and `node build/doctor.test.js` use
// node:test and these exact assertions. Direct execution avoids test-file process
// isolation only; the real pipe/socket/filesystem health checks still run and fail
// when the environment lacks those capabilities. No probe is mocked or skipped.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { doctor, run, main, parseArgs, satisfiesVersion, PROBE_TIMEOUT_MS } = require('./doctor');

const BUILD_ROOT = path.resolve(__dirname, '..', '.build');
const ENGINE = '^22.13.0 || >=24.0.0';

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function editJson(filename, mutate) {
  const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
  mutate(value);
  writeJson(filename, value);
}

function fixture(t) {
  fs.mkdirSync(BUILD_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(BUILD_ROOT, 'doctor-test-'));
  t.after(() => {
    // Verify the actual absolute target before recursively removing fixture data.
    const actual = fs.realpathSync(root);
    const parent = fs.realpathSync(BUILD_ROOT);
    assert.ok(actual.startsWith(`${parent}${path.sep}`));
    assert.ok(path.basename(actual).startsWith('doctor-test-'));
    fs.rmSync(actual, { recursive: true, force: true });
  });
  const manifest = {
    name: 'doctor-fixture',
    version: '1.2.3',
    engines: { node: ENGINE },
    dependencies: { alpha: '^1.2.0', '@doctor/exports-only': '~2.4.0' },
    devDependencies: { builder: '^0.3.0' },
    optionalDependencies: { optional: '^1.0.0' },
  };
  const versions = { alpha: '1.2.3', '@doctor/exports-only': '2.4.2', builder: '0.3.1', optional: '1.0.0' };
  const lock = {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: 3,
    packages: { '': structuredClone(manifest) },
  };
  for (const [name, version] of Object.entries(versions)) {
    lock.packages[`node_modules/${name}`] = { version };
    if (name === 'optional') continue;
    const directory = path.join(root, 'node_modules', name);
    writeJson(path.join(directory, 'package.json'), { name, version, exports: { '.': './index.js' } });
    fs.writeFileSync(
      path.join(directory, 'index.js'),
      "throw new Error('doctor must resolve, not load package code');\n",
    );
  }
  writeJson(path.join(root, 'package.json'), manifest);
  writeJson(path.join(root, 'package-lock.json'), lock);
  // The baseline must not falsely reject an allowed newer Node version.
  fs.writeFileSync(path.join(root, '.node-version'), '22.13.0\n');
  return root;
}

function desktopFixture(root) {
  const versions = { electron: '40.10.6', 'node-pty': '1.1.0', sharp: '0.35.3' };
  editJson(path.join(root, 'package.json'), (manifest) => Object.assign(manifest.dependencies, versions));
  editJson(path.join(root, 'package-lock.json'), (lock) => {
    Object.assign(lock.packages[''].dependencies, versions);
    for (const [name, version] of Object.entries(versions)) lock.packages[`node_modules/${name}`] = { version };
  });
  for (const [name, version] of Object.entries(versions)) {
    const directory = path.join(root, 'node_modules', name);
    writeJson(path.join(directory, 'package.json'), { name, version, main: './index.js' });
    fs.writeFileSync(
      path.join(directory, 'index.js'),
      "throw new Error('must not execute Electron or native code in doctor');\n",
    );
  }
  const directory = path.join(root, 'node_modules', 'electron');
  const binary = process.platform === 'win32' ? 'electron.exe' : 'electron';
  fs.writeFileSync(path.join(directory, 'path.txt'), binary);
  fs.mkdirSync(path.join(directory, 'dist'));
  const binaryPath = path.join(directory, 'dist', binary);
  fs.writeFileSync(binaryPath, 'fixture binary: existence only, not an executable\n');
  return binaryPath;
}

function check(report, id) {
  const result = report.checks.find((entry) => entry.id === id);
  assert.ok(result, `missing check: ${id}`);
  return result;
}

function hasIssue(report, id, code, name) {
  const result = check(report, id);
  assert.equal(result.status, 'failed');
  assert.ok(
    result.details.issues.some((issue) => issue.code === code && (!name || issue.package === name)),
    JSON.stringify(result),
  );
  assert.equal(report.status, 'failed');
  assert.equal(report.exitCode, 1);
}

function environment(t, name, value) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

test('Node engine boundaries allow the baseline and Node 24+ while excluding Node 23 and older releases', () => {
  for (const version of ['22.13.0', '22.99.99', '24.0.0', '24.14.0', '25.0.0', '30.0.0'])
    assert.equal(satisfiesVersion(version, ENGINE), true, version);
  for (const version of ['20.20.0', '22.12.99', '23.0.0', '23.99.99'])
    assert.equal(satisfiesVersion(version, ENGINE), false, version);
  for (const [version, range, expected] of [
    ['0.3.9', '^0.3.0', true],
    ['0.4.0', '^0.3.0', false],
    ['0.0.3', '^0.0.3', true],
    ['0.0.4', '^0.0.3', false],
    ['2.4.9', '~2.4.0', true],
    ['2.5.0', '~2.4.0', false],
    ['24.3.0', '>= 24 < 25', true],
    ['25.0.0', '>=24 <25', false],
    ['22.13.0', '22.x', true],
    ['24.0.0', '>22', true],
    ['22.99.0', '<=22', true],
    ['23.0.0', '<=22', false],
    ['24.1.0', '24.1', true],
    ['24.2.0', '24.1', false],
    ['24.0.0', '*', true],
    ['24.0.0', '=24.0.0', true],
  ])
    assert.equal(satisfiesVersion(version, range), expected, `${version}: ${range}`);
  for (const range of ['', 'latest', '^', '22 - 24', '>=24 || nonsense', '24.x.1', '024.0.0', 'file:elsewhere'])
    assert.throws(() => satisfiesVersion('24.14.0', range), { code: 'UNSUPPORTED_VERSION_RANGE' });
  assert.throws(() => satisfiesVersion('24.0.0-rc.1', ENGINE), { code: 'UNSUPPORTED_VERSION' });
  assert.equal(PROBE_TIMEOUT_MS, 3000);
  assert.equal(run, doctor);
});

test('real direct dependency fixtures accept exports-hidden manifests and ignore unused extraneous packages', async (t) => {
  const root = fixture(t);
  const stale = path.join(root, 'node_modules', 'unused-extraneous', 'package.json');
  fs.mkdirSync(path.dirname(stale));
  fs.writeFileSync(stale, 'intentionally malformed unused manifest');
  const inputs = ['package.json', 'package-lock.json', '.node-version'];
  const before = inputs.map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
  const report = await doctor({ root });
  assert.equal(check(report, 'node-version').status, satisfiesVersion(process.version, ENGINE) ? 'passed' : 'failed');
  assert.equal(check(report, 'package-lock').status, 'passed');
  assert.equal(check(report, 'dependencies').status, 'passed');
  assert.deepEqual(check(report, 'dependencies').details.omittedOptional, ['optional']);
  assert.deepEqual(
    inputs.map((file) => fs.readFileSync(path.join(root, file), 'utf8')),
    before,
  );
  assert.equal(fs.readFileSync(stale, 'utf8'), 'intentionally malformed unused manifest');
  assert.equal(
    report.checks.some((entry) => entry.id === 'electron-binary'),
    false,
  );
});

test('an incompatible engine in a real fixture fails without suppressing independent checks', async (t) => {
  const root = fixture(t);
  editJson(path.join(root, 'package.json'), (manifest) => {
    manifest.engines.node = '>=999.0.0';
  });
  const report = await doctor({ root });
  assert.equal(check(report, 'node-version').code, 'NODE_VERSION_MISMATCH');
  assert.equal(check(report, 'node-version').category, 'configuration');
  assert.ok(check(report, 'loopback-http'));
  assert.ok(check(report, 'pipe-spawn'));
  assert.equal(report.exitCode, 1);
});

for (const field of ['top-level', 'packages-root']) {
  test(`detects a mismatched ${field} lockfile root version`, async (t) => {
    const root = fixture(t);
    editJson(path.join(root, 'package-lock.json'), (lock) => {
      if (field === 'top-level') lock.version = '1.2.2';
      else lock.packages[''].version = '1.2.2';
    });
    hasIssue(await doctor({ root }), 'package-lock', 'ROOT_VERSION_MISMATCH');
  });
}

test('detects changed or removed direct declarations and locked versions outside declared ranges', async (t) => {
  const root = fixture(t);
  editJson(path.join(root, 'package-lock.json'), (lock) => {
    lock.packages[''].dependencies.alpha = '^1.1.0';
    lock.packages[''].devDependencies.stale = '^1.0.0';
    lock.packages['node_modules/alpha'].version = '2.0.0';
  });
  const report = await doctor({ root });
  hasIssue(report, 'package-lock', 'LOCK_SPEC_MISMATCH', 'alpha');
  hasIssue(report, 'package-lock', 'LOCK_SPEC_MISMATCH', 'stale');
  hasIssue(report, 'package-lock', 'LOCK_VERSION_OUT_OF_RANGE', 'alpha');
});

test('detects missing required packages, wrong installed versions and corrupt manifests', async (t) => {
  const root = fixture(t);
  fs.unlinkSync(path.join(root, 'node_modules', 'alpha', 'package.json'));
  editJson(path.join(root, 'node_modules', 'builder', 'package.json'), (manifest) => {
    manifest.version = '0.3.0';
  });
  fs.writeFileSync(path.join(root, 'node_modules', '@doctor', 'exports-only', 'package.json'), '{malformed');
  const report = await doctor({ root });
  hasIssue(report, 'dependencies', 'ENOENT', 'alpha');
  hasIssue(report, 'dependencies', 'INSTALLED_VERSION_MISMATCH', 'builder');
  hasIssue(report, 'dependencies', 'INVALID_JSON', '@doctor/exports-only');
});

test('a missing locked direct package and an invalid optional installation cannot pass', async (t) => {
  const root = fixture(t);
  editJson(path.join(root, 'package-lock.json'), (lock) => {
    delete lock.packages['node_modules/alpha'];
  });
  writeJson(path.join(root, 'node_modules', 'optional', 'package.json'), { name: 'optional', version: '9.0.0' });
  const report = await doctor({ root });
  hasIssue(report, 'package-lock', 'LOCK_DEPENDENCY_MISSING_OR_UNSUPPORTED', 'alpha');
  hasIssue(report, 'dependencies', 'INSTALLED_VERSION_MISMATCH', 'alpha');
  hasIssue(report, 'dependencies', 'INSTALLED_VERSION_MISMATCH', 'optional');
});

for (const filename of ['package.json', 'package-lock.json']) {
  test(`corrupt ${filename} is reported safely while real environment probes still execute`, async (t) => {
    const root = fixture(t);
    const secret = 'DOCTOR_MALFORMED_CONTENT_SECRET';
    fs.writeFileSync(path.join(root, filename), `{${secret}`);
    const report = await doctor({ root });
    assert.equal(check(report, 'package-lock').code, 'INVALID_JSON');
    assert.equal(check(report, 'dependencies').code, 'INVALID_JSON');
    assert.equal(check(report, 'pipe-spawn').category, 'environment');
    assert.equal(check(report, 'loopback-http').category, 'environment');
    assert.equal(check(report, 'build-write').status, 'passed');
    assert.equal(report.exitCode, 1);
    assert.equal(JSON.stringify(report).includes(secret), false);
  });
}

test('reports a blocked .build path and persistence failure without changing that file', async (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.build'), 'user-owned file');
  const report = await doctor({ root });
  assert.equal(check(report, 'build-write').code, 'ENOTDIR');
  assert.equal(check(report, 'report-write').code, 'ENOTDIR');
  assert.equal(report.reportWritten, false);
  assert.equal(report.exitCode, 1);
  assert.equal(fs.readFileSync(path.join(root, '.build'), 'utf8'), 'user-owned file');
  assert.equal(check(report, 'dependencies').status, 'passed');
});

test('report matches the returned JSON, replaces stale content and cleans only owned temporary files', async (t) => {
  const root = fixture(t);
  const directory = path.join(root, '.build', 'doctor');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'report.json'), 'stale report');
  fs.writeFileSync(path.join(directory, 'keep.txt'), 'user data');
  const report = await doctor({ root });
  assert.equal(report.reportPath, '.build/doctor/report.json');
  assert.equal(report.reportWritten, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, report.reportPath), 'utf8')), report);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['keep.txt', 'report.json']);
  assert.equal(fs.readFileSync(path.join(directory, 'keep.txt'), 'utf8'), 'user data');
  assert.equal(report.exitCode, report.checks.some((entry) => entry.status === 'failed') ? 1 : 0);
});

test('an unreplaceable report destination fails and leaves no temporary report', async (t) => {
  const root = fixture(t);
  const directory = path.join(root, '.build', 'doctor');
  fs.mkdirSync(path.join(directory, 'report.json'), { recursive: true });
  const report = await doctor({ root });
  assert.equal(check(report, 'build-write').status, 'passed');
  assert.equal(check(report, 'report-write').status, 'failed');
  assert.equal(report.reportWritten, false);
  assert.equal(report.exitCode, 1);
  assert.deepEqual(fs.readdirSync(directory), ['report.json']);
  assert.equal(fs.statSync(path.join(directory, 'report.json')).isDirectory(), true);
});

test('--json produces one parseable result with the same exit status and persisted report', async (t) => {
  const root = fixture(t);
  const output = [];
  const report = await main(['--json'], { root, output: (text) => output.push(text) });
  assert.equal(output.length, 1);
  assert.deepEqual(JSON.parse(output[0]), report);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, report.reportPath), 'utf8')), report);
});

test('invalid arguments fail closed, never echo input, and JSON help does not create a report', async (t) => {
  const root = fixture(t);
  assert.deepEqual(parseArgs(['--desktop', '--json']), { desktop: true, json: true, help: false });
  for (const args of [['--skip-pipe'], ['--fix'], ['--install'], ['--timeout-ms', '99999']])
    assert.throws(() => parseArgs(args), { code: 'INVALID_ARGUMENT' });
  const output = [];
  const report = await main(['--unknown-SECRET', '--json'], { root, output: (text) => output.push(text) });
  assert.equal(report.exitCode, 2);
  assert.equal(report.code, 'INVALID_ARGUMENT');
  assert.equal(output.length, 1);
  assert.equal(output[0].includes('SECRET'), false);
  assert.deepEqual(JSON.parse(output[0]), report);
  output.length = 0;
  assert.equal((await main(['--help', '--json'], { root, output: (text) => output.push(text) })).exitCode, 0);
  assert.ok(JSON.parse(output[0]).usage);
  assert.equal(fs.existsSync(path.join(root, '.build')), false);
});

test('environment values and child startup errors are absent from JSON, text and all report files', async (t) => {
  const root = fixture(t);
  desktopFixture(root);
  const secret = 'DOCTOR_ENV_VALUE_MUST_NEVER_APPEAR';
  for (const name of ['NODE_OPTIONS', 'ESBUILD_BINARY_PATH', 'npm_config_token', 'ELECTRON_OVERRIDE_DIST_PATH'])
    environment(t, name, name === 'NODE_OPTIONS' ? `--${secret}` : secret);
  const output = [];
  const report = await main(['--desktop', '--json'], { root, output: (text) => output.push(text) });
  const plain = [];
  await main(['--desktop'], { root, output: (text) => plain.push(text) });
  assert.equal(
    check(report, 'pipe-spawn').status,
    'failed',
    'invalid inherited NODE_OPTIONS must not be sanitized into a passing child',
  );
  assert.equal(check(report, 'electron-binary').status, 'failed');
  for (const name of ['NODE_OPTIONS', 'ESBUILD_BINARY_PATH', 'npm_config_token', 'ELECTRON_OVERRIDE_DIST_PATH'])
    assert.ok(report.environment.variableNames.some((entry) => entry.toLowerCase() === name.toLowerCase()));
  assert.equal(output[0].includes(secret), false);
  assert.equal(plain[0].includes(secret), false);
  const directory = path.join(root, '.build', 'doctor');
  assert.deepEqual(fs.readdirSync(directory), ['report.json']);
  assert.equal(fs.readFileSync(path.join(directory, 'report.json'), 'utf8').includes(secret), false);
});

test('--desktop checks Electron binary existence and native resolution without loading package code', async (t) => {
  const root = fixture(t);
  const binary = desktopFixture(root);
  // This fixture explicitly tests the normal distribution directory. The separate
  // environment-value test exercises the real override path and its failure.
  environment(t, 'ELECTRON_OVERRIDE_DIST_PATH', undefined);
  const report = await doctor({ root, desktop: true });
  assert.equal(check(report, 'electron-binary').status, 'passed');
  assert.equal(check(report, 'native-resolution').status, 'passed');
  assert.match(check(report, 'native-resolution').summary, /separate live checks/);
  fs.unlinkSync(binary);
  const missing = await doctor({ root, desktop: true });
  assert.equal(check(missing, 'electron-binary').status, 'failed');
  assert.equal(missing.exitCode, 1);
});

test('--desktop detects a broken native entry instead of accepting an ancestor installation', async (t) => {
  const root = fixture(t);
  desktopFixture(root);
  fs.unlinkSync(path.join(root, 'node_modules', 'node-pty', 'index.js'));
  const report = await doctor({ root, desktop: true });
  hasIssue(report, 'native-resolution', 'MODULE_NOT_FOUND', 'node-pty');
});

// These are health assertions, not mocks or assertions that a denied environment
// is healthy. EPERM/EACCES, failed HTTP, or failed disk access keep this suite red.
for (const id of ['pipe-spawn', 'loopback-http', 'build-write']) {
  test(`live environment capability: ${id}`, async (t) => {
    const report = await doctor({ root: fixture(t) });
    const result = check(report, id);
    assert.equal(result.category, 'environment');
    if (id !== 'build-write') {
      assert.equal(result.details.timeoutMs, 3000);
      assert.ok(result.durationMs < 6000, `bounded probe took ${result.durationMs}ms`);
    }
    assert.equal(result.status, 'passed', JSON.stringify(result));
    if (id === 'pipe-spawn') {
      assert.deepEqual(result.details.stdio, ['pipe', 'pipe', 'pipe']);
      assert.equal(result.details.exitCode, 0);
    }
    if (id === 'loopback-http') assert.ok(result.details.port > 0);
  });
}
