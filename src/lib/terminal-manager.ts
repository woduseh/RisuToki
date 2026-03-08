import { ipcMain } from 'electron';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TerminalManagerDeps {
  broadcastToAll: (channel: string, ...args: any[]) => void;
  getCurrentFilePath: () => string | null;
  getApiPort: () => number | null;
  getApiToken: () => string | null;
}

interface LaunchAttempt {
  label: string;
  shell: string;
  args: string[];
  cwd: string;
  isFallbackCwd: boolean;
}

interface PtyProcess {
  __tokiStopRequested: boolean;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (event?: { exitCode?: number; signal?: number }) => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getTerminalStatusMessage(
  level: string,
  message: string,
  detail: string | null = null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { level, message };
  if (detail) payload.detail = detail;
  return payload;
}

function formatTerminalError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || '알 수 없는 오류';
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return '알 수 없는 오류';
}

// ---------------------------------------------------------------------------
// Module state & init
// ---------------------------------------------------------------------------

let ptyProcess: PtyProcess | null = null;

export function isTerminalRunning(): boolean {
  return !!ptyProcess;
}

export function killTerminal(): void {
  if (ptyProcess) {
    ptyProcess.__tokiStopRequested = true;
    ptyProcess.kill();
    ptyProcess = null;
  }
}

export function initTerminalManager(deps: TerminalManagerDeps): void {
  const { broadcastToAll, getCurrentFilePath, getApiPort, getApiToken } = deps;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildTerminalLaunchAttempts } = require('./terminal-shell.cjs') as {
    buildTerminalLaunchAttempts: (opts: Record<string, unknown>) => LaunchAttempt[];
  };

  function broadcastTerminalStatus(
    level: string,
    message: string,
    detail: string | null = null,
  ): void {
    broadcastToAll(
      'terminal-status',
      getTerminalStatusMessage(level, message, detail),
    );
  }

  // --- terminal-start ---
  ipcMain.handle('terminal-start', async (_: unknown, cols: number, rows: number) => {
    if (ptyProcess) {
      ptyProcess.__tokiStopRequested = true;
      ptyProcess.kill();
      ptyProcess = null;
    }

    let pty: { spawn: (...args: any[]) => PtyProcess };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      pty = require('node-pty');
    } catch (error) {
      const detail = formatTerminalError(error);
      broadcastTerminalStatus('error', '터미널 구성요소를 불러오지 못했습니다.', detail);
      console.warn('[Terminal] failed to load node-pty:', error);
      return false;
    }

    const currentFile = getCurrentFilePath();
    const preferredCwd = currentFile ? path.dirname(currentFile) : process.cwd();
    const attempts: LaunchAttempt[] = buildTerminalLaunchAttempts({
      platform: process.platform,
      env: process.env,
      cwd: preferredCwd,
      fallbackCwd: process.cwd(),
    });

    // Clean env: remove CLAUDECODE so nested claude sessions work
    const cleanEnv = Object.assign({}, process.env) as Record<string, string | undefined>;
    delete cleanEnv.CLAUDECODE;

    // Inject MCP API info for toki-mcp-server
    const apiPort = getApiPort();
    const apiToken = getApiToken();
    if (apiPort && apiToken) {
      cleanEnv.TOKI_PORT = String(apiPort);
      cleanEnv.TOKI_TOKEN = apiToken;
    }

    const failures: { label: string; cwd: string; detail: string }[] = [];

    for (const attempt of attempts) {
      try {
        const processHandle: PtyProcess = pty.spawn(attempt.shell, attempt.args, {
          name: 'xterm-256color',
          cols: cols || 120,
          rows: rows || 24,
          cwd: attempt.cwd,
          env: cleanEnv,
        });

        processHandle.__tokiStopRequested = false;
        ptyProcess = processHandle;
        ptyProcess.onData((data: string) => broadcastToAll('terminal-data', data));
        ptyProcess.onExit((event: { exitCode?: number; signal?: number } = {}) => {
          const exitCode = typeof event.exitCode === 'number' ? event.exitCode : null;
          const signal = typeof event.signal === 'number' ? event.signal : null;
          const wasRequested = !!processHandle.__tokiStopRequested;
          const isCurrentProcess = ptyProcess === processHandle;
          if (isCurrentProcess) {
            broadcastToAll('terminal-exit');
            ptyProcess = null;
          }
          if (isCurrentProcess && !wasRequested && (exitCode !== null || signal !== null)) {
            const parts: string[] = [];
            if (exitCode !== null) parts.push(`exit code ${exitCode}`);
            if (signal !== null) parts.push(`signal ${signal}`);
            broadcastTerminalStatus('warn', '터미널 프로세스가 종료되었습니다.', parts.join(', '));
          }
        });

        if (failures.length > 0) {
          const recoveryDetail = attempt.isFallbackCwd
            ? `${attempt.label} / ${attempt.cwd}`
            : attempt.label;
          broadcastTerminalStatus('warn', '터미널을 복구해 다시 연결했습니다.', recoveryDetail);
        }

        return true;
      } catch (error) {
        failures.push({
          label: attempt.label,
          cwd: attempt.cwd,
          detail: formatTerminalError(error),
        });
        console.warn('[Terminal] failed to start attempt:', attempt, error);
      }
    }

    const detail = failures
      .map((failure) => `${failure.label} @ ${failure.cwd}: ${failure.detail}`)
      .join(' | ');
    broadcastTerminalStatus('error', '터미널 시작에 실패했습니다.', detail);
    return false;
  });

  // --- terminal-input ---
  ipcMain.on('terminal-input', (_: unknown, data: string) => {
    if (ptyProcess) ptyProcess.write(data);
  });

  // --- terminal-resize ---
  ipcMain.on('terminal-resize', (_: unknown, cols: number, rows: number) => {
    if (ptyProcess) ptyProcess.resize(cols, rows);
  });

  // --- terminal-stop ---
  ipcMain.handle('terminal-stop', () => {
    killTerminal();
    return true;
  });

  // --- terminal-is-running ---
  ipcMain.handle('terminal-is-running', () => isTerminalRunning());
}
