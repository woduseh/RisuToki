import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

type IpcHandler = (_event: unknown, ...args: unknown[]) => unknown;
type IpcListener = (_event: unknown, ...args: unknown[]) => void;

class FakePtyProcess {
  __tokiStopRequested = false;
  dataHandlers: ((data: string) => void)[] = [];
  exitHandlers: ((event?: { exitCode?: number; signal?: number }) => void)[] = [];
  resize = vi.fn();
  write = vi.fn();
  kill = vi.fn(() => {
    this.exitHandlers.forEach((handler) => handler({ exitCode: 0 }));
  });

  onData(cb: (data: string) => void): void {
    this.dataHandlers.push(cb);
  }

  onExit(cb: (event?: { exitCode?: number; signal?: number }) => void): void {
    this.exitHandlers.push(cb);
  }

  emitData(data: string): void {
    this.dataHandlers.forEach((handler) => handler(data));
  }
}

const mockState = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  listeners: new Map<string, IpcListener>(),
  ptys: [] as FakePtyProcess[],
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      mockState.handlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, listener: IpcListener) => {
      mockState.listeners.set(channel, listener);
    }),
  },
}));

vi.mock('./terminal-shell', () => ({
  buildTerminalLaunchAttempts: () => [
    {
      label: 'PowerShell',
      shell: 'pwsh.exe',
      args: [],
      cwd: 'C:\\Users\\tester',
      isFallbackCwd: false,
    },
  ],
}));

async function initManager() {
  vi.resetModules();
  mockState.handlers.clear();
  mockState.listeners.clear();
  mockState.ptys = [];
  const broadcastToAll = vi.fn();
  const manager = await import('./terminal-manager');
  manager.initTerminalManager({
    broadcastToAll,
    getCurrentFilePath: () => null,
    getApiPort: () => 1234,
    getApiToken: () => 'token',
    getMcpServerPath: () => 'toki-mcp-server.js',
    spawnPty: () => {
      const pty = new FakePtyProcess();
      mockState.ptys.push(pty);
      return pty;
    },
  });
  return { broadcastToAll, manager };
}

describe('terminal manager sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates independent sessions for input, resize, data, and exit events', async () => {
    const { broadcastToAll } = await initManager();
    const first = (await mockState.handlers.get('terminal-new-session')?.({}, 'One')) as { id: string };
    const second = (await mockState.handlers.get('terminal-new-session')?.({}, 'Two')) as { id: string };

    await mockState.handlers.get('terminal-start-session')?.({}, first.id, 80, 24, 'One');
    await mockState.handlers.get('terminal-start-session')?.({}, second.id, 100, 30, 'Two');

    mockState.listeners.get('terminal-input-session')?.({}, first.id, 'echo one\r');
    mockState.listeners.get('terminal-input-session')?.({}, second.id, 'echo two\r');
    mockState.listeners.get('terminal-resize-session')?.({}, second.id, 120, 40);

    expect(mockState.ptys[0].write).toHaveBeenCalledWith('echo one\r');
    expect(mockState.ptys[1].write).toHaveBeenCalledWith('echo two\r');
    expect(mockState.ptys[1].resize).toHaveBeenCalledWith(120, 40);

    mockState.ptys[0].emitData('one');
    mockState.ptys[1].emitData('two');

    expect(broadcastToAll).toHaveBeenCalledWith('terminal-data-session', first.id, 'one');
    expect(broadcastToAll).toHaveBeenCalledWith('terminal-data-session', second.id, 'two');

    await mockState.handlers.get('terminal-stop-session')?.({}, first.id);

    expect(broadcastToAll).toHaveBeenCalledWith('terminal-exit-session', first.id);
  });

  it('waits for all terminal exits, including an already stopped session, before shutdown completes', async () => {
    const { manager } = await initManager();
    const first = (await mockState.handlers.get('terminal-new-session')?.({}, 'One')) as { id: string };
    const second = (await mockState.handlers.get('terminal-new-session')?.({}, 'Two')) as { id: string };
    await mockState.handlers.get('terminal-start-session')?.({}, first.id, 80, 24);
    await mockState.handlers.get('terminal-start-session')?.({}, second.id, 80, 24);
    for (const pty of mockState.ptys) pty.kill.mockImplementation(() => {});

    manager.killTerminal(first.id);
    let completed = false;
    const shutdown = manager.shutdownTerminals().then(() => {
      completed = true;
    });
    await flushPromises();
    expect(completed).toBe(false);
    mockState.ptys[1].exitHandlers.forEach((handler) => handler({ exitCode: 0 }));
    await flushPromises();
    expect(completed).toBe(false);
    mockState.ptys[0].exitHandlers.forEach((handler) => handler({ exitCode: 0 }));
    await shutdown;
    expect(completed).toBe(true);
    expect(manager.listTerminalSessions().every((session) => !session.running)).toBe(true);
    for (const pty of mockState.ptys) expect(pty.kill).toHaveBeenCalledTimes(1);
  });

  it('rejects a terminal shutdown that never finishes instead of hanging or reporting success', async () => {
    const { manager } = await initManager();
    await mockState.handlers.get('terminal-start')?.({}, 80, 24);
    mockState.ptys[0].kill.mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const rejection = expect(manager.shutdownTerminals()).rejects.toThrow('Terminal shutdown timed out');
      await vi.advanceTimersByTimeAsync(5000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps legacy single-terminal APIs wired to the default session', async () => {
    const { broadcastToAll, manager } = await initManager();

    await mockState.handlers.get('terminal-start')?.({}, 80, 24);
    mockState.listeners.get('terminal-input')?.({}, 'legacy\r');
    mockState.ptys[0].emitData('legacy output');

    expect(manager.isTerminalRunning()).toBe(true);
    expect(mockState.ptys[0].write).toHaveBeenCalledWith('legacy\r');
    expect(broadcastToAll).toHaveBeenCalledWith('terminal-data-session', 'default', 'legacy output');
    expect(broadcastToAll).toHaveBeenCalledWith('terminal-data', 'legacy output');

    await mockState.handlers.get('terminal-stop')?.({});

    expect(broadcastToAll).toHaveBeenCalledWith('terminal-exit-session', 'default');
    expect(broadcastToAll).toHaveBeenCalledWith('terminal-exit');
  });
});
