#!/usr/bin/env node
'use strict';

// No installed dependencies, shell, downloads, environment edits, or permission retries.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = '.build/doctor/report.json';
const PROBE_TIMEOUT_MS = 3000;
const TOKEN = 'risutoki-doctor-probe\n';
const GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const PERMISSION_CODES = new Set(['EPERM', 'EACCES', 'ERR_ACCESS_DENIED']);
const ENVIRONMENT_NAME = /^(?:NODE_.+|ELECTRON_.+|ESBUILD_.+|npm_config_.+|PATH|PATHEXT|TEMP|TMP|TMPDIR|CI)$/i;
const REPAIR_DEPENDENCIES =
  'Compare package.json, package-lock.json and the named installed packages. Restore matching committed metadata or deliberately refresh the installation in an approved environment; doctor never installs packages.';
const REPAIR_PERMISSIONS =
  'Inspect the current sandbox, Node permission flags, workspace ACLs and endpoint-security diagnostics. Use an already approved development environment or ask its owner to correct the restriction, then rerun doctor. No automatic escalation or check bypass is attempted.';

function fault(code) {
  return Object.assign(new Error(code), { code });
}

// Never serialize error.message, stacks, child output, argv, or environment values:
// they can contain paths, credentials in NODE_OPTIONS, or registry URLs.
function errorCode(error) {
  if (error instanceof SyntaxError) return 'INVALID_JSON';
  return typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : 'CHECK_ERROR';
}

function passed(summary, details = {}) {
  return { status: 'passed', summary, details };
}

function failed(code, summary, remediation, details = {}) {
  return {
    status: 'failed',
    code,
    summary,
    remediation: PERMISSION_CODES.has(code) ? `${remediation} ${REPAIR_PERMISSIONS}` : remediation,
    details,
  };
}

function objectFile(filename) {
  const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fault('INVALID_METADATA');
  return value;
}

function versionTuple(version) {
  const match =
    typeof version === 'string' && /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\w.-]+)?$/.exec(version);
  if (!match) throw fault('UNSUPPORTED_VERSION');
  const parts = match.slice(1, 4).map(Number);
  if (!parts.every(Number.isSafeInteger)) throw fault('UNSUPPORTED_VERSION');
  return parts;
}

function compare(a, b) {
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function nextVersion(parts, index) {
  return parts.map((part, position) => (position < index ? part : position === index ? part + 1 : 0));
}

// The repository uses stable numeric ranges. Support comparator sets, ||, ^, ~,
// and partial/x ranges; reject unsupported syntax instead of declaring it healthy.
// This is deliberately not a general npm resolver (git/file/alias/prerelease specs).
function satisfiesVersion(version, range) {
  const actual = versionTuple(version);
  if (typeof range !== 'string' || !range.trim()) throw fault('UNSUPPORTED_VERSION_RANGE');
  const alternatives = range.split('||').map((alternative) => {
    const tokens = alternative
      .trim()
      .replace(/(<=|>=|[<>=^~])\s+/g, '$1')
      .split(/\s+/);
    return tokens.map((token) => {
      const match = /^(<=|>=|[<>=^~])?v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(token);
      if (!match) throw fault('UNSUPPORTED_VERSION_RANGE');
      const operator = match[1] || '=';
      const raw = match.slice(2, 5);
      const count = raw.findIndex((part) => part === undefined || /^[xX*]$/.test(part));
      const precision = count < 0 ? 3 : count;
      if (raw.slice(precision).some((part) => part !== undefined && !/^[xX*]$/.test(part)))
        throw fault('UNSUPPORTED_VERSION_RANGE');
      if (raw.slice(0, precision).some((part) => !/^(0|[1-9]\d*)$/.test(part)))
        throw fault('UNSUPPORTED_VERSION_RANGE');
      const lower = raw.map((part, index) => (index < precision ? Number(part) : 0));
      if (!lower.every(Number.isSafeInteger)) throw fault('UNSUPPORTED_VERSION_RANGE');
      if (precision === 0) {
        if (operator !== '=') throw fault('UNSUPPORTED_VERSION_RANGE');
        return () => true;
      }
      const upper = nextVersion(lower, precision - 1);
      if (operator === '^' || operator === '~') {
        const index = operator === '~' ? Math.min(1, precision - 1) : lower.findIndex((part) => part > 0);
        const ceiling = nextVersion(lower, index < 0 ? precision - 1 : index);
        return (value) => compare(value, lower) >= 0 && compare(value, ceiling) < 0;
      }
      if (operator === '>=') return (value) => compare(value, lower) >= 0;
      if (operator === '<') return (value) => compare(value, lower) < 0;
      if (operator === '>') return (value) => (precision < 3 ? compare(value, upper) >= 0 : compare(value, lower) > 0);
      if (operator === '<=') return (value) => (precision < 3 ? compare(value, upper) < 0 : compare(value, lower) <= 0);
      return (value) =>
        precision < 3 ? compare(value, lower) >= 0 && compare(value, upper) < 0 : compare(value, lower) === 0;
    });
  });
  return alternatives.some((predicates) => predicates.every((predicate) => predicate(actual)));
}

function dependencyGroup(manifest, group) {
  const entries = manifest[group] ?? {};
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw fault('INVALID_DEPENDENCIES');
  for (const [name, spec] of Object.entries(entries)) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name) || typeof spec !== 'string')
      throw fault('INVALID_DEPENDENCIES');
  }
  return entries;
}

function directDependencies(manifest) {
  return Object.assign(
    {},
    dependencyGroup(manifest, 'devDependencies'),
    dependencyGroup(manifest, 'dependencies'),
    dependencyGroup(manifest, 'optionalDependencies'),
  );
}

function metadata(root) {
  const manifest = objectFile(path.join(root, 'package.json'));
  const lock = objectFile(path.join(root, 'package-lock.json'));
  if (
    ![2, 3].includes(lock.lockfileVersion) ||
    !lock.packages ||
    typeof lock.packages !== 'object' ||
    Array.isArray(lock.packages)
  )
    throw fault('UNSUPPORTED_LOCKFILE');
  if (!lock.packages[''] || typeof lock.packages[''] !== 'object' || Array.isArray(lock.packages['']))
    throw fault('LOCK_ROOT_MISSING');
  return { manifest, lock };
}

function checkNode(root) {
  const manifest = objectFile(path.join(root, 'package.json'));
  const range = manifest.engines?.node;
  const details = { version: process.version, required: range };
  return satisfiesVersion(process.version, range)
    ? passed(
        'Node satisfies package.json engines.node (.node-version is a baseline, not an exclusive version).',
        details,
      )
    : failed(
        'NODE_VERSION_MISMATCH',
        'Node does not satisfy package.json engines.node.',
        'Select a Node version allowed by package.json engines.node, then rerun doctor.',
        details,
      );
}

function checkLock(root) {
  const { manifest, lock } = metadata(root);
  const lockedRoot = lock.packages[''];
  const issues = [];
  if (
    typeof manifest.version !== 'string' ||
    !manifest.version ||
    manifest.version !== lock.version ||
    manifest.version !== lockedRoot.version
  )
    issues.push({ code: 'ROOT_VERSION_MISMATCH' });
  if (
    typeof manifest.name !== 'string' ||
    !manifest.name ||
    manifest.name !== lock.name ||
    manifest.name !== lockedRoot.name
  )
    issues.push({ code: 'ROOT_NAME_MISMATCH' });
  if (manifest.engines?.node !== lockedRoot.engines?.node) issues.push({ code: 'LOCK_NODE_ENGINE_MISMATCH' });
  for (const group of GROUPS) {
    const declared = dependencyGroup(manifest, group);
    const locked = dependencyGroup(lockedRoot, group);
    for (const name of new Set([...Object.keys(declared), ...Object.keys(locked)])) {
      if (declared[name] !== locked[name]) issues.push({ code: 'LOCK_SPEC_MISMATCH', package: name, group });
    }
  }
  for (const [name, spec] of Object.entries(directDependencies(manifest))) {
    const entry = lock.packages[`node_modules/${name}`];
    if (!entry?.version || entry.link) {
      issues.push({ code: 'LOCK_DEPENDENCY_MISSING_OR_UNSUPPORTED', package: name });
      continue;
    }
    try {
      if (!satisfiesVersion(entry.version, spec)) issues.push({ code: 'LOCK_VERSION_OUT_OF_RANGE', package: name });
    } catch (error) {
      issues.push({ code: errorCode(error), package: name });
    }
  }
  return issues.length
    ? failed('LOCK_MISMATCH', 'Package and lockfile metadata are inconsistent or unsupported.', REPAIR_DEPENDENCIES, {
        issues,
      })
    : passed('Root name/version, Node engine and direct dependency declarations match the lockfile.');
}

function checkDependencies(root) {
  const { manifest, lock } = metadata(root);
  const declared = directDependencies(manifest);
  const optional = dependencyGroup(manifest, 'optionalDependencies');
  const issues = [];
  const omittedOptional = [];
  for (const name of Object.keys(declared).sort()) {
    let installed;
    try {
      // Read manifests directly: package exports can intentionally hide package.json.
      installed = objectFile(path.join(root, 'node_modules', name, 'package.json'));
    } catch (error) {
      if (error.code === 'ENOENT' && Object.hasOwn(optional, name)) omittedOptional.push(name);
      else issues.push({ code: errorCode(error), package: name });
      continue;
    }
    const locked = lock.packages[`node_modules/${name}`];
    if (typeof installed.version !== 'string' || !locked?.version || installed.version !== locked.version)
      issues.push({ code: 'INSTALLED_VERSION_MISMATCH', package: name });
    if (installed.name !== (locked?.name || name)) issues.push({ code: 'INSTALLED_NAME_MISMATCH', package: name });
  }
  const details = { declared: Object.keys(declared).length, omittedOptional, issues };
  return issues.length
    ? failed(
        'DEPENDENCIES_INCONSISTENT',
        'Required direct packages are missing, unreadable or differ from the lockfile.',
        REPAIR_DEPENDENCIES,
        details,
      )
    : passed('Installed direct packages match locked versions; unrelated extraneous packages are ignored.', details);
}

function probePipe(root) {
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let stdout = '';
    let stderr = '';
    const details = { timeoutMs: PROBE_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] };
    const remediation =
      'A real Node child must exchange stdin, stdout and stderr through pipes for esbuild/Vitest and isolated tests. Review the named environment variables locally and inspect process/pipe permissions.';
    const finish = (result, terminate = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (terminate && child?.pid && child.exitCode === null) {
        try {
          result.details.terminationRequested = child.kill('SIGKILL');
        } catch (error) {
          result.details.terminationError = errorCode(error);
        }
      }
      child?.stdin?.destroy();
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      child?.unref();
      resolve(result);
    };
    const fail = (code) =>
      finish(
        failed(
          code,
          'Node pipe child probe failed; this is an environment prerequisite, not an application assertion failure.',
          remediation,
          { ...details },
        ),
        true,
      );
    const timer = setTimeout(() => fail('ETIMEDOUT'), PROBE_TIMEOUT_MS);
    try {
      child = spawn(
        process.execPath,
        [
          '-e',
          `let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => { if (input !== ${JSON.stringify(TOKEN)}) { process.exitCode = 23; return; } process.stdout.write(input); process.stderr.write(input); });`,
        ],
        {
          cwd: root,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      child.on('error', (error) => fail(errorCode(error)));
      child.stdin.on('error', (error) => fail(errorCode(error)));
      child.stdout.on('error', (error) => fail(errorCode(error)));
      child.stderr.on('error', (error) => fail(errorCode(error)));
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        if (stdout.length + chunk.length > 4096) fail('PIPE_OUTPUT_LIMIT');
        else stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        if (stderr.length + chunk.length > 4096) fail('PIPE_OUTPUT_LIMIT');
        else stderr += chunk;
      });
      child.on('close', (exitCode, signal) => {
        if (exitCode === 0 && signal === null && stdout === TOKEN && stderr === TOKEN)
          finish(
            passed('A real Node child exchanged data over all three pipes and exited successfully.', {
              ...details,
              exitCode,
            }),
          );
        else
          finish(
            failed('PIPE_CHILD_FAILED', 'Node child did not complete the expected pipe exchange.', remediation, {
              ...details,
              exitCode,
              signal,
            }),
          );
      });
      child.stdin.end(TOKEN);
    } catch (error) {
      fail(errorCode(error));
    }
  });
}

function probeLoopback() {
  return new Promise((resolve) => {
    let request;
    let settled = false;
    let port;
    const sockets = new Set();
    const server = http.createServer((_request, response) => response.end(TOKEN));
    const remediation =
      'The renderer dev server and local desktop/MCP services need loopback sockets. Inspect local bind/connect policy and endpoint-security diagnostics for 127.0.0.1; this probe uses an OS-selected port and no external network.';
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request?.destroy();
      for (const socket of sockets) socket.destroy();
      server.close();
      server.unref();
      resolve(result);
    };
    const fail = (code) =>
      finish(
        failed(code, 'Loopback bind or HTTP round trip failed.', remediation, {
          host: '127.0.0.1',
          port,
          timeoutMs: PROBE_TIMEOUT_MS,
        }),
      );
    const timer = setTimeout(() => fail('ETIMEDOUT'), PROBE_TIMEOUT_MS);
    server.on('error', (error) => fail(errorCode(error)));
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', (error) => fail(errorCode(error)));
    });
    try {
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        if (settled) return;
        port = server.address().port;
        request = http.get({ hostname: '127.0.0.1', port, path: '/', agent: false }, (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('error', (error) => fail(errorCode(error)));
          response.on('data', (chunk) => {
            if (body.length + chunk.length > 4096) fail('HTTP_OUTPUT_LIMIT');
            else body += chunk;
          });
          response.on('end', () => {
            if (response.statusCode !== 200 || body !== TOKEN) fail('HTTP_RESPONSE_MISMATCH');
            else
              finish(
                passed('Bound port 0 on 127.0.0.1, completed a local HTTP request and closed the sockets.', {
                  host: '127.0.0.1',
                  port,
                  timeoutMs: PROBE_TIMEOUT_MS,
                }),
              );
          });
        });
        request.on('error', (error) => fail(errorCode(error)));
      });
    } catch (error) {
      fail(errorCode(error));
    }
  });
}

function reportDirectory(root) {
  // Do not write through a .build/doctor junction or symlink outside the workspace.
  for (const relative of ['.build', '.build/doctor']) {
    const directory = path.join(root, relative);
    try {
      fs.mkdirSync(directory);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink()) throw fault('UNSAFE_REPORT_DIRECTORY');
    if (!stat.isDirectory()) throw fault('ENOTDIR');
  }
  return path.join(root, '.build', 'doctor');
}

function probeWrite(root) {
  const directory = reportDirectory(root);
  const temporary = fs.mkdtempSync(path.join(directory, 'probe-'));
  const original = path.join(temporary, 'probe.txt');
  const renamed = path.join(temporary, 'renamed.txt');
  let failure;
  try {
    fs.writeFileSync(original, TOKEN, { flag: 'wx', mode: 0o600 });
    if (fs.readFileSync(original, 'utf8') !== TOKEN) throw fault('WRITE_READ_MISMATCH');
    fs.renameSync(original, renamed);
    fs.unlinkSync(renamed);
  } catch (error) {
    failure = error;
  }
  // Attempt all cleanup, preserving the first failure. Never delete other files.
  for (const filename of [original, renamed]) {
    try {
      fs.unlinkSync(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') failure ||= error;
    }
  }
  try {
    fs.rmdirSync(temporary);
  } catch (error) {
    failure ||= error;
  }
  if (failure) throw failure;
  return passed('Created, read, renamed and removed a temporary file under .build/doctor.');
}

function checkElectron(root) {
  const directory = path.join(root, 'node_modules', 'electron');
  objectFile(path.join(directory, 'package.json'));
  let executable;
  try {
    executable = fs.readFileSync(path.join(directory, 'path.txt'), 'utf8').trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const override = process.env.ELECTRON_OVERRIDE_DIST_PATH;
  if (!executable && !override) throw fault('ELECTRON_BINARY_MISSING');
  executable ||= 'electron';
  if (path.isAbsolute(executable) || executable.split(/[\\/]/).includes('..')) throw fault('INVALID_ELECTRON_PATH');
  const binary = path.join(override || path.join(directory, 'dist'), executable);
  if (!fs.statSync(binary).isFile()) throw fault('ELECTRON_BINARY_MISSING');
  return passed(
    'Electron binary exists. Even Electron --version success does not guarantee a GUI launch; use desktop smoke.',
    { binarySource: override ? 'ELECTRON_OVERRIDE_DIST_PATH' : 'electron/dist' },
  );
}

function checkNativeResolution(root) {
  const requireFromRoot = createRequire(path.join(root, 'package.json'));
  const issues = [];
  for (const name of ['node-pty', 'sharp']) {
    try {
      const directory = fs.realpathSync(path.join(root, 'node_modules', name));
      objectFile(path.join(directory, 'package.json'));
      const entry = fs.realpathSync(requireFromRoot.resolve(name));
      const relative = path.relative(directory, entry);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        throw fault('RESOLVED_OUTSIDE_PACKAGE');
      if (!fs.statSync(entry).isFile()) throw fault('NATIVE_ENTRY_MISSING');
    } catch (error) {
      issues.push({ package: name, code: errorCode(error) });
    }
  }
  return issues.length
    ? failed(
        'NATIVE_RESOLUTION_FAILED',
        'Desktop native package entry points could not be resolved from this root.',
        REPAIR_DEPENDENCIES,
        { issues },
      )
    : passed(
        'node-pty and sharp entry points resolve locally; addon ABI and terminal/image operations need separate live checks.',
      );
}

async function recordCheck(id, category, operation, remediation) {
  const started = performance.now();
  let result;
  try {
    result = await operation();
  } catch (error) {
    result = failed(errorCode(error), `${id} could not complete.`, remediation);
  }
  return { id, category, ...result, durationMs: Math.round(performance.now() - started) };
}

function summarize(report) {
  const failures = report.checks.filter((check) => check.status === 'failed');
  report.status = failures.length ? 'failed' : 'passed';
  report.exitCode = failures.length ? 1 : 0;
  report.summary = { passed: report.checks.length - failures.length, failed: failures.length };
}

function persist(root, report) {
  const directory = reportDirectory(root);
  const filename = path.join(directory, 'report.json');
  const temporary = path.join(directory, `report-${randomUUID()}.tmp`);
  let fd;
  let owned = false;
  let failure;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    owned = true;
    fs.writeFileSync(fd, `${JSON.stringify(report, null, 2)}\n`);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, filename);
  } catch (error) {
    failure = error;
  }
  if (fd !== undefined) {
    try {
      fs.closeSync(fd);
    } catch (error) {
      failure ||= error;
    }
  }
  if (owned) {
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') failure ||= error;
    }
  }
  if (failure) throw failure;
}

/** Silent library entry point. Always runs real probes and persists a sanitized report. */
async function doctor({ root = ROOT, desktop = false } = {}) {
  root = path.resolve(root);
  const started = performance.now();
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    desktop: Boolean(desktop),
    environment: {
      variableNames: Object.keys(process.env)
        .filter((name) => ENVIRONMENT_NAME.test(name))
        .sort(),
    },
    reportPath: REPORT_PATH,
    reportWritten: false,
    checks: [],
    limitations: [
      'Prerequisite diagnostics do not run or certify application tests, builds or desktop smoke.',
      'Only direct installed package manifests are checked; transitive integrity is outside this check.',
      'Environment influence is listed by variable name only; raw child output and error messages are not retained.',
    ],
  };
  if (desktop)
    report.limitations.push(
      'Electron --version success does not guarantee a GUI launch: Chromium IPC or desktop access can be denied before a window opens. Native addon loading/ABI also requires desktop smoke.',
    );
  const specs = [
    [
      'node-version',
      'configuration',
      () => checkNode(root),
      'Check package.json engines.node and select a supported Node release. Stable comparator, caret, tilde and partial/x ranges are supported.',
    ],
    ['package-lock', 'dependencies', () => checkLock(root), REPAIR_DEPENDENCIES],
    ['dependencies', 'dependencies', () => checkDependencies(root), REPAIR_DEPENDENCIES],
    ['pipe-spawn', 'environment', () => probePipe(root), REPAIR_PERMISSIONS],
    ['loopback-http', 'environment', probeLoopback, REPAIR_PERMISSIONS],
    [
      'build-write',
      'environment',
      () => probeWrite(root),
      'Check that .build/doctor is a writable directory and cleanup/rename is allowed. Keep the current report from stdout if persistence fails.',
    ],
  ];
  if (desktop)
    specs.push(
      [
        'electron-binary',
        'dependencies',
        () => checkElectron(root),
        'Check the Electron installation, binary download/install status and the listed ELECTRON_* environment variables locally. Restore the expected binary in an approved environment; doctor does not install or launch Electron.',
      ],
      ['native-resolution', 'dependencies', () => checkNativeResolution(root), REPAIR_DEPENDENCIES],
    );
  for (const spec of specs) report.checks.push(await recordCheck(...spec));
  report.finishedAt = new Date().toISOString();
  report.durationMs = Math.round(performance.now() - started);
  summarize(report);
  report.reportWritten = true;
  try {
    persist(root, report);
  } catch (error) {
    report.reportWritten = false;
    report.checks.push({
      id: 'report-write',
      category: 'environment',
      ...failed(
        errorCode(error),
        "Could not replace .build/doctor/report.json; any previous report is stale. Use this run's stdout.",
        'Check the report directory and file permissions, then rerun doctor.',
      ),
      durationMs: 0,
    });
    summarize(report);
  }
  return report;
}

function parseArgs(args) {
  const options = { desktop: false, json: false, help: false };
  for (const arg of args) {
    if (arg === '--desktop') options.desktop = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw fault('INVALID_ARGUMENT');
  }
  return options;
}

async function main(args = process.argv.slice(2), { root = ROOT, output = console.log } = {}) {
  let report;
  const json = args.includes('--json');
  try {
    const options = parseArgs(args);
    if (options.help) {
      report = { usage: 'node build/doctor.js [--desktop] [--json]', reportPath: REPORT_PATH, exitCode: 0 };
    } else report = await doctor({ root, desktop: options.desktop });
  } catch (error) {
    report = {
      schemaVersion: 1,
      status: 'failed',
      exitCode: 2,
      code: errorCode(error),
      summary: 'Doctor could not run. Usage: node build/doctor.js [--desktop] [--json]',
    };
  }
  if (json) output(JSON.stringify(report, null, 2));
  else if (report.usage) output(`${report.usage}\nReport: ${REPORT_PATH}`);
  else if (!report.checks) output(report.summary);
  else {
    const lines = report.checks.flatMap((check) => [
      `${check.status === 'passed' ? 'PASS' : 'FAIL'} ${check.id}${check.code ? ` [${check.code}]` : ''}: ${check.summary}`,
      ...(check.details.issues?.map((issue) => `  ${issue.package || 'root'}: ${issue.code}`) || []),
      ...(check.remediation ? [`  Action: ${check.remediation}`] : []),
    ]);
    lines.push(`Environment variable names only: ${report.environment.variableNames.join(', ') || '(none)'}`);
    lines.push(
      `${report.status.toUpperCase()}: ${report.summary.failed} failed; ${report.reportWritten ? `report: ${REPORT_PATH}` : 'report not saved'}`,
    );
    output(lines.join('\n'));
  }
  return report;
}

if (require.main === module) {
  main()
    .then((report) => {
      process.exitCode = report.exitCode;
    })
    .catch(() => {
      // Even an unexpected output failure must not print potentially sensitive errors.
      process.exitCode = 2;
    });
}

module.exports = { doctor, run: doctor, main, parseArgs, satisfiesVersion, PROBE_TIMEOUT_MS };
