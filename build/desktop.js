#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { stopProcess, CLEANUP_FAILURE_EXIT_CODE } = require('./validate');

const ROOT = path.resolve(__dirname, '..');

function createSession(root = ROOT, { dev = false, devSmoke = false, injectRendererError = false } = {}) {
  root = fs.realpathSync(root);
  for (const relative of ['.build', '.build/desktop']) {
    const parent = path.join(root, relative);
    fs.mkdirSync(parent, { recursive: true });
    if (fs.lstatSync(parent).isSymbolicLink()) throw new Error('Refusing a redirected desktop output directory');
  }
  const directory = path.join(root, '.build', 'desktop', `${Date.now()}-${randomUUID().slice(0, 8)}`);
  const data = path.join(directory, 'data');
  for (const name of ['home', 'app-data', 'local-data', 'user-data', 'temp', 'work']) {
    fs.mkdirSync(path.join(data, name), { recursive: true });
  }
  const session = { schemaVersion: 1, directory, data, dev, devSmoke, injectRendererError };
  fs.writeFileSync(path.join(directory, 'session.json'), JSON.stringify(session));
  // Electron reads this package before loading the bootstrap, including the real app version.
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'risutoki-desktop-check',
      version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
      main: path.join(root, 'build', 'desktop-entry.js'),
    }),
  );
  return session;
}

function sessionEnv(session, inherited = process.env) {
  const env = { ...inherited };
  for (const name of Object.keys(env)) {
    if (
      /^(TOKI_|RISUTOKI_MCP_|VITE_DEV_SERVER_URL$|ELECTRON_RUN_AS_NODE$|NODE_OPTIONS$|NODE_PATH$|CODEX_HOME$)/i.test(
        name,
      )
    ) {
      delete env[name];
    }
  }
  // These overrides belong only to the disposable child, never the calling shell.
  const home = path.join(session.data, 'home');
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(session.data, 'app-data'),
    LOCALAPPDATA: path.join(session.data, 'local-data'),
    XDG_CONFIG_HOME: path.join(session.data, 'app-data'),
    XDG_CACHE_HOME: path.join(session.data, 'local-data'),
    TMP: path.join(session.data, 'temp'),
    TEMP: path.join(session.data, 'temp'),
    TMPDIR: path.join(session.data, 'temp'),
    RISUTOKI_DESKTOP_RUN_DIR: session.directory,
    RISUTOKI_USE_BUNDLED_CONPTY: '1',
  });
  if (process.platform === 'win32') {
    env.HOMEDRIVE = path.parse(home).root.replace(/[\\/]$/, '');
    env.HOMEPATH = home.slice(env.HOMEDRIVE.length);
  }
  return env;
}

function cleanSession(session, root = ROOT) {
  const parent = fs.realpathSync(path.join(root, '.build', 'desktop'));
  const directory = fs.realpathSync(session.directory);
  if (path.dirname(directory) !== parent || session.data !== path.join(directory, 'data')) {
    throw new Error('Refusing to clean a desktop session outside .build/desktop/<run>/data');
  }
  if (fs.existsSync(session.data) && fs.realpathSync(session.data) !== session.data) {
    throw new Error('Refusing to follow a redirected desktop data directory');
  }
  fs.rmSync(session.data, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

async function chooseLoopbackPort() {
  // Vite 7 treats port: 0 as its default port. Select an OS-assigned candidate,
  // then strictPort makes Vite fail if another process acquires it before us.
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function runDesktop(
  { dev = false, devSmoke = false, injectRendererError = false } = {},
  { root = ROOT, executable } = {},
) {
  dev ||= devSmoke;
  // Builds are dependencies in validation-plan.js. Direct use checks prebuilt output only.
  for (const file of ['.build/electron/main.js', '.build/electron/preload.js', ...(dev ? [] : ['dist/index.html'])]) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}; run npm run test:desktop first.`);
  }
  const session = createSession(root, { dev, devSmoke, injectRendererError });
  const reportPath = path.join(session.directory, 'report.json');
  const logPath = path.join(session.directory, 'process.log');
  const report = {
    schemaVersion: 1,
    mode: devSmoke ? 'dev-smoke' : dev ? 'dev' : 'smoke',
    status: 'running',
    startedAt: new Date().toISOString(),
    pid: process.pid,
    checks: [],
    buildEvidence: 'See the enclosing validation report; direct invocation uses prebuilt output.',
  };
  const persist = () => fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  let server;
  let child;
  let logFd;
  let stopping;
  let watchdog;
  let complete;
  let interrupted = false;
  const terminate = () => {
    if (stopping) return stopping;
    if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    stopping = stopProcess(child, logFd).then((error) => {
      if (error) {
        child.unref();
        report.cleanupError = error;
        complete?.({ exitCode: child.exitCode, signal: child.signalCode, cleanupError: error });
      }
      return error;
    });
    return stopping;
  };
  const abort = () => {
    interrupted = true;
    void terminate();
  };
  process.on('SIGINT', abort);
  process.on('SIGTERM', abort);
  try {
    persist();
    const env = sessionEnv(session);
    if (dev) {
      const { createServer } = await import('vite');
      const port = await chooseLoopbackPort();
      server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true } });
      await server.listen();
      const address = server.httpServer.address();
      if (!address || typeof address === 'string') throw new Error('Vite did not bind a TCP port');
      env.VITE_DEV_SERVER_URL = `http://127.0.0.1:${address.port}/`;
      report.rendererUrl = env.VITE_DEV_SERVER_URL;
      console.log(`Renderer ready: ${env.VITE_DEV_SERVER_URL} (this session owns the server)`);
    }
    if (interrupted) throw new Error('Interrupted before Electron startup');
    executable ??= require('electron');
    logFd = fs.openSync(logPath, 'w');
    console.log(`Desktop ${report.mode}: ${session.directory}`);
    child = spawn(executable, [session.directory], {
      cwd: path.join(session.data, 'work'),
      env,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', logFd, logFd],
    });
    const completion = new Promise((resolve) => {
      complete = resolve;
      let error;
      // Dev lifetime is bounded by the enclosing validator; smoke always has its own watchdog.
      watchdog =
        dev && !devSmoke
          ? null
          : setTimeout(() => {
              report.timedOut = true;
              void terminate();
            }, 90000);
      child.on('error', (cause) => {
        error = cause.message;
      });
      child.on('close', (exitCode, signal) => {
        clearTimeout(watchdog);
        resolve({ exitCode, signal, ...(error ? { error } : {}) });
      });
    });
    report.childPid = child.pid;
    persist();
    const outcome = await completion;
    await stopping;
    report.outcome = outcome;
    const resultPath = path.join(session.directory, 'app-result.json');
    const result = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : null;
    report.app = result;
    if (
      interrupted ||
      outcome.exitCode !== 0 ||
      report.cleanupError ||
      report.timedOut ||
      result?.status !== 'passed' ||
      result.shutdown !== 'closed'
    ) {
      throw new Error(
        result?.error ||
          outcome.error ||
          report.cleanupError ||
          `Electron check incomplete (exit=${outcome.exitCode}, timeout=${!!report.timedOut})`,
      );
    }
    const required =
      dev && !devSmoke
        ? ['renderer-ready']
        : [
            'renderer-ready',
            'create-edit-save',
            'reopen-saved-file',
            'invalid-file',
            'authenticated-api',
            'native-image',
            'native-terminal',
            'clean-close',
          ];
    if (!required.every((name) => result.checks?.some((check) => check.name === name)))
      throw new Error('Application report is missing required checks');
    report.status = 'passed';
  } catch (error) {
    report.status = interrupted ? 'interrupted' : 'failed';
    report.error = error.message;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    clearTimeout(watchdog);
    // A report/write exception after spawn must still wait for child/tree termination.
    try {
      await terminate();
    } catch (error) {
      report.cleanupError = error.message;
    }
    if (logFd !== undefined) {
      try {
        fs.closeSync(logFd);
      } catch (error) {
        report.cleanupError ||= error.message;
      }
    }
    try {
      await server?.close();
    } catch (error) {
      report.cleanupError = error.message;
    }
    try {
      if (!report.cleanupError) {
        cleanSession(session, root);
        report.cleaned = true;
      }
    } catch (error) {
      report.cleanupError = error.message;
    }
    if (report.cleanupError) {
      report.status = 'failed';
      report.cleaned = false;
    }
    report.finishedAt = new Date().toISOString();
    try {
      persist();
    } catch (error) {
      report.status = 'failed';
      report.reportWriteError = error.message;
    }
  }
  console.log(`${report.status.toUpperCase()}: ${reportPath}`);
  if (report.status !== 'passed')
    console.error(`${report.error || report.cleanupError || report.reportWriteError}\nLog: ${logPath}`);
  if (report.reportWriteError)
    console.error(`Report not saved; any existing report is stale: ${report.reportWriteError}`);
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (
    args.some((arg) => !['--dev', '--dev-smoke', '--inject-renderer-error'].includes(arg)) ||
    new Set(args).size > 1
  ) {
    console.error(
      'Usage: node build/desktop.js [--dev | --dev-smoke | --inject-renderer-error]. Normally use npm run test:desktop or npm run dev:isolated.',
    );
    process.exitCode = 1;
  } else {
    runDesktop({
      dev: args.includes('--dev'),
      devSmoke: args.includes('--dev-smoke'),
      injectRendererError: args.includes('--inject-renderer-error'),
    })
      .then((report) => {
        process.exitCode = report.cleanupError ? CLEANUP_FAILURE_EXIT_CODE : report.status === 'passed' ? 0 : 1;
      })
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}

module.exports = { createSession, sessionEnv, cleanSession, runDesktop };
