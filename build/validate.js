#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createPlan } = require('./validation-plan');

const ROOT = path.resolve(__dirname, '..');
const TAIL_BYTES = 8192;

function parseArgs(args) {
  const options = { profile: 'quick', tests: [], plan: false, json: false, timeoutMs: 300000 };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--plan') options.plan = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (['--profile', '--test', '--timeout-ms'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--profile') options.profile = value;
      else if (arg === '--test') options.tests.push(value);
      else {
        options.timeoutMs = Number(value);
        if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 3600000) {
          throw new Error('--timeout-ms must be an integer between 1 and 3600000');
        }
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.json && !options.plan) throw new Error('--json requires --plan; execution writes report.json');
  return options;
}

function writeJson(filename, value) {
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filename);
}

function stopProcess(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    killer.on('error', () => child.kill());
    killer.on('exit', (code) => {
      if (code) child.kill();
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

// Direct Node invocation avoids npm.cmd / shell quoting and never downloads tools.
function runCommand(args, { root, logFd, timeoutMs, signal }) {
  return new Promise((resolve) => {
    const env = { ...process.env, FORCE_COLOR: '0' };
    delete env.RISUTOKI_TEST_LOCAL_CORPUS;
    delete env.NODE_V8_COVERAGE;
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', logFd, logFd],
    });
    let timedOut = false;
    let error;
    const abort = () => stopProcess(child);
    const timer = setTimeout(() => {
      timedOut = true;
      stopProcess(child);
    }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.on('error', (cause) => {
      error = cause.message;
    });
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve({ exitCode: code, signal: exitSignal, timedOut, ...(error ? { error } : {}) });
    });
  });
}

function readTail(filename) {
  const fd = fs.openSync(filename, 'r');
  try {
    const length = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(length, TAIL_BYTES));
    fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, length - buffer.length));
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

async function executePlan(plan, { root = ROOT, timeoutMs = 300000, signal, output = console.log } = {}) {
  if (!plan.steps.length) throw new Error('Validation requires at least one step');
  const directory = path.join(root, '.build', 'validation');
  fs.mkdirSync(directory, { recursive: true });
  const lockPath = path.join(directory, 'lock.json');
  let lockFd;
  try {
    lockFd = fs.openSync(lockPath, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(
      `Another validation owns ${lockPath}. Wait for it to finish. If interrupted, inspect its PID before removing the stale lock.`,
      { cause: error },
    );
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const runDirectory = path.join(directory, runId);
  const report = {
    schemaVersion: 1,
    runId,
    profile: plan.profile,
    focusedTests: plan.focusedTests,
    node: process.version,
    platform: process.platform,
    startedAt: new Date().toISOString(),
    status: 'running',
    steps: [],
  };
  const persist = () => {
    writeJson(path.join(runDirectory, 'report.json'), report);
    writeJson(path.join(directory, 'latest.json'), report);
  };
  try {
    fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, runId, startedAt: report.startedAt }));
    fs.mkdirSync(runDirectory);
    persist();
    output(`Validation ${plan.profile}: ${plan.steps.length} steps (${runId})`);
    for (const step of plan.steps) {
      const result = { id: step.id, status: 'pending', dependencies: step.dependencies, commands: step.commands };
      report.steps.push(result);
      const blocked = step.dependencies.filter(
        (id) => report.steps.find((item) => item.id === id)?.status !== 'passed',
      );
      if (signal?.aborted || blocked.length) {
        result.status = 'skipped';
        result.reason = signal?.aborted ? 'interrupted' : `Blocked by: ${blocked.join(', ')}`;
        output(`SKIP ${step.id}: ${result.reason}`);
        persist();
        continue;
      }
      result.status = 'running';
      result.log = path
        .relative(root, path.join(runDirectory, `${step.id}.log`))
        .split(path.sep)
        .join('/');
      persist();
      output(`RUN  ${step.id}`);
      const started = performance.now();
      const logPath = path.join(root, result.log);
      const logFd = fs.openSync(logPath, 'w');
      const heartbeat = setInterval(
        () => output(`WAIT ${step.id}: ${Math.round((performance.now() - started) / 1000)}s`),
        30000,
      );
      try {
        for (const command of step.commands) {
          fs.writeSync(logFd, `$ node ${command.map((arg) => JSON.stringify(arg)).join(' ')}\n`);
          result.outcome = await runCommand(command, { root, logFd, timeoutMs, signal });
          if (result.outcome.exitCode !== 0 || result.outcome.timedOut || signal?.aborted) break;
        }
      } finally {
        clearInterval(heartbeat);
        fs.closeSync(logFd);
      }
      result.durationMs = Math.round(performance.now() - started);
      result.status =
        result.outcome?.exitCode === 0 && !result.outcome.timedOut && !signal?.aborted ? 'passed' : 'failed';
      output(`${result.status === 'passed' ? 'PASS' : 'FAIL'} ${step.id}: ${result.durationMs}ms`);
      if (result.status === 'failed') {
        result.tail = readTail(logPath);
        output(`${JSON.stringify(result.outcome)}\n${result.tail}\nLog: ${result.log}`);
      }
      persist();
    }
    report.status = signal?.aborted
      ? 'interrupted'
      : report.steps.every((step) => step.status === 'passed')
        ? 'passed'
        : 'failed';
    report.finishedAt = new Date().toISOString();
    persist();
    output(`${report.status.toUpperCase()}: ${path.join(runDirectory, 'report.json')}`);
    return report;
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    report.finishedAt = new Date().toISOString();
    if (fs.existsSync(runDirectory)) persist();
    throw error;
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lockPath);
  }
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(
      'Usage: npm run validate -- [--profile quick|test|mcp|ci|full|windows] [--test src/lib/example.test.ts] [--plan [--json]] [--timeout-ms 300000]\nFocused --test runs are quick-profile feedback, not full validation. Logs and reports: .build/validation/. Defaults to synthetic data.',
    );
    return;
  }
  const plan = createPlan(options);
  if (options.plan) {
    console.log(
      options.json
        ? JSON.stringify(plan, null, 2)
        : `${plan.profile}:\n${plan.steps.map((step) => `- ${step.id}${step.dependencies.length ? ` (after ${step.dependencies.join(', ')})` : ''}`).join('\n')}`,
    );
    return;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on('SIGINT', abort);
  process.on('SIGTERM', abort);
  try {
    const report = await executePlan(plan, { timeoutMs: options.timeoutMs, signal: controller.signal });
    process.exitCode = report.status === 'passed' ? 0 : controller.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { parseArgs, executePlan, main };
