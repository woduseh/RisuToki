import { ipcMain } from 'electron';
import * as os from 'os';
import { buildTerminalLaunchAttempts } from './terminal-shell';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TerminalManagerDeps {
  broadcastToAll: (channel: string, ...args: any[]) => void;
  getCurrentFilePath: () => string | null;
  getApiPort: () => number | null;
  getApiToken: () => string | null;
  getMcpServerPath: () => string;
  spawnPty?: (shell: string, args: string[], options: Record<string, unknown>) => PtyProcess;
}

export interface TerminalSessionInfo {
  id: string;
  name: string;
  running: boolean;
  createdAt: number;
  updatedAt: number;
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

interface TerminalSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  ptyProcess: PtyProcess | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_TERMINAL_SESSION_ID = 'default';

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

function serializeSession(session: TerminalSession): TerminalSessionInfo {
  return {
    id: session.id,
    name: session.name,
    running: !!session.ptyProcess,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Module state & init
// ---------------------------------------------------------------------------

let sessionCounter = 0;
const sessions = new Map<string, TerminalSession>();

function getOrCreateSession(sessionId = DEFAULT_TERMINAL_SESSION_ID, name = 'Shell'): TerminalSession {
  const existing = sessions.get(sessionId);
  if (existing) {
    if (name && existing.name !== name) {
      existing.name = name;
      existing.updatedAt = Date.now();
    }
    return existing;
  }

  const now = Date.now();
  const session = {
    id: sessionId,
    name,
    createdAt: now,
    updatedAt: now,
    ptyProcess: null,
  };
  sessions.set(sessionId, session);
  return session;
}

function createSession(name = 'Shell'): TerminalSession {
  sessionCounter += 1;
  return getOrCreateSession(`session-${Date.now()}-${sessionCounter}`, name);
}

export function isTerminalRunning(sessionId = DEFAULT_TERMINAL_SESSION_ID): boolean {
  return !!sessions.get(sessionId)?.ptyProcess;
}

export function listTerminalSessions(): TerminalSessionInfo[] {
  return [...sessions.values()].map(serializeSession).sort((a, b) => a.createdAt - b.createdAt);
}

export function killTerminal(sessionId?: string): void {
  const targetSessions = sessionId
    ? [sessions.get(sessionId)].filter((entry): entry is TerminalSession => !!entry)
    : [...sessions.values()];

  for (const session of targetSessions) {
    if (session.ptyProcess) {
      session.ptyProcess.__tokiStopRequested = true;
      session.ptyProcess.kill();
      session.ptyProcess = null;
      session.updatedAt = Date.now();
    }
  }
}

export function initTerminalManager(deps: TerminalManagerDeps): void {
  const { broadcastToAll, getApiPort, getApiToken, getMcpServerPath } = deps;

  function broadcastTerminalStatus(
    sessionId: string,
    level: string,
    message: string,
    detail: string | null = null,
  ): void {
    const payload = getTerminalStatusMessage(level, message, detail);
    broadcastToAll('terminal-status-session', sessionId, payload);
    if (sessionId === DEFAULT_TERMINAL_SESSION_ID) {
      broadcastToAll('terminal-status', payload);
    }
  }

  async function startSession(sessionId: string, cols: number, rows: number, name = 'Shell'): Promise<boolean> {
    const session = getOrCreateSession(sessionId, name);
    if (session.ptyProcess) {
      session.ptyProcess.__tokiStopRequested = true;
      session.ptyProcess.kill();
      session.ptyProcess = null;
    }

    let spawnPty = deps.spawnPty;
    if (!spawnPty) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ptyModule = require('node-pty') as {
          default?: { spawn?: (...args: any[]) => PtyProcess };
          spawn?: (...args: any[]) => PtyProcess;
        };
        spawnPty = ptyModule.spawn || ptyModule.default?.spawn;
        if (!spawnPty) throw new Error('node-pty spawn is not available.');
      } catch (error) {
        const detail = formatTerminalError(error);
        broadcastTerminalStatus(sessionId, 'error', '터미널 구성요소를 불러오지 못했습니다.', detail);
        console.warn('[Terminal] failed to load node-pty:', error);
        return false;
      }
    }

    const homeDir = os.homedir();

    const attempts: LaunchAttempt[] = buildTerminalLaunchAttempts({
      platform: process.platform,
      env: process.env,
      cwd: homeDir,
      fallbackCwd: homeDir,
    });

    const cleanEnv = Object.assign({}, process.env) as Record<string, string | undefined>;
    delete cleanEnv.CLAUDECODE;

    const apiPort = getApiPort();
    const apiToken = getApiToken();
    if (apiPort && apiToken) {
      cleanEnv.TOKI_PORT = String(apiPort);
      cleanEnv.TOKI_TOKEN = apiToken;
      cleanEnv.TOKI_MCP_SERVER_PATH = getMcpServerPath();
    }

    const failures: { label: string; cwd: string; detail: string }[] = [];

    for (const attempt of attempts) {
      try {
        const processHandle: PtyProcess = spawnPty(attempt.shell, attempt.args, {
          name: 'xterm-256color',
          ...(process.platform === 'win32' && process.env.RISUTOKI_USE_BUNDLED_CONPTY === '1'
            ? { useConptyDll: true }
            : {}),
          cols: cols || 120,
          rows: rows || 24,
          cwd: attempt.cwd,
          env: cleanEnv,
        });

        processHandle.__tokiStopRequested = false;
        session.ptyProcess = processHandle;
        session.updatedAt = Date.now();
        processHandle.onData((data: string) => {
          broadcastToAll('terminal-data-session', session.id, data);
          if (session.id === DEFAULT_TERMINAL_SESSION_ID) {
            broadcastToAll('terminal-data', data);
          }
        });
        processHandle.onExit((event: { exitCode?: number; signal?: number } = {}) => {
          const exitCode = typeof event.exitCode === 'number' ? event.exitCode : null;
          const signal = typeof event.signal === 'number' ? event.signal : null;
          const wasRequested = !!processHandle.__tokiStopRequested;
          const isCurrentProcess = session.ptyProcess === processHandle;
          if (isCurrentProcess) {
            broadcastToAll('terminal-exit-session', session.id);
            if (session.id === DEFAULT_TERMINAL_SESSION_ID) {
              broadcastToAll('terminal-exit');
            }
            session.ptyProcess = null;
            session.updatedAt = Date.now();
          }
          if (isCurrentProcess && !wasRequested && (exitCode !== null || signal !== null)) {
            const parts: string[] = [];
            if (exitCode !== null) parts.push(`exit code ${exitCode}`);
            if (signal !== null) parts.push(`signal ${signal}`);
            broadcastTerminalStatus(session.id, 'warn', '터미널 프로세스가 종료되었습니다.', parts.join(', '));
          }
        });

        if (failures.length > 0) {
          const recoveryDetail = attempt.isFallbackCwd ? `${attempt.label} / ${attempt.cwd}` : attempt.label;
          broadcastTerminalStatus(session.id, 'warn', '터미널을 복구해 다시 연결했습니다.', recoveryDetail);
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

    const detail = failures.map((failure) => `${failure.label} @ ${failure.cwd}: ${failure.detail}`).join(' | ');
    broadcastTerminalStatus(session.id, 'error', '터미널 시작에 실패했습니다.', detail);
    return false;
  }

  ipcMain.handle('terminal-new-session', async (_: unknown, name?: string) => serializeSession(createSession(name)));

  ipcMain.handle('terminal-list-sessions', () => listTerminalSessions());

  ipcMain.handle('terminal-rename-session', (_: unknown, sessionId: string, name: string) => {
    const session = sessions.get(sessionId);
    if (!session || !name.trim()) return false;
    session.name = name.trim();
    session.updatedAt = Date.now();
    return true;
  });

  ipcMain.handle(
    'terminal-start-session',
    async (_: unknown, sessionId: string, cols: number, rows: number, name?: string) =>
      startSession(sessionId || DEFAULT_TERMINAL_SESSION_ID, cols, rows, name || 'Shell'),
  );

  ipcMain.on('terminal-input-session', (_: unknown, sessionId: string, data: string) => {
    sessions.get(sessionId || DEFAULT_TERMINAL_SESSION_ID)?.ptyProcess?.write(data);
  });

  ipcMain.on('terminal-resize-session', (_: unknown, sessionId: string, cols: number, rows: number) => {
    sessions.get(sessionId || DEFAULT_TERMINAL_SESSION_ID)?.ptyProcess?.resize(cols, rows);
  });

  ipcMain.handle('terminal-stop-session', (_: unknown, sessionId: string) => {
    killTerminal(sessionId || DEFAULT_TERMINAL_SESSION_ID);
    return true;
  });

  ipcMain.handle('terminal-is-session-running', (_: unknown, sessionId: string) =>
    isTerminalRunning(sessionId || DEFAULT_TERMINAL_SESSION_ID),
  );

  ipcMain.handle('terminal-start', async (_: unknown, cols: number, rows: number) =>
    startSession(DEFAULT_TERMINAL_SESSION_ID, cols, rows, 'Shell'),
  );

  ipcMain.on('terminal-input', (_: unknown, data: string) => {
    sessions.get(DEFAULT_TERMINAL_SESSION_ID)?.ptyProcess?.write(data);
  });

  ipcMain.on('terminal-resize', (_: unknown, cols: number, rows: number) => {
    sessions.get(DEFAULT_TERMINAL_SESSION_ID)?.ptyProcess?.resize(cols, rows);
  });

  ipcMain.handle('terminal-stop', () => {
    killTerminal(DEFAULT_TERMINAL_SESSION_ID);
    return true;
  });

  ipcMain.handle('terminal-is-running', () => isTerminalRunning(DEFAULT_TERMINAL_SESSION_ID));
}
