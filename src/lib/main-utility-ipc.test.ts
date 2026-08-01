import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcHandle, showOpenDialog } = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  showOpenDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: ipcHandle },
  dialog: { showOpenDialog },
}));

import { initMainUtilityIpc } from './main-utility-ipc';

function getHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = ipcHandle.mock.calls.find((args: unknown[]) => args[0] === channel);
  if (!registration) throw new Error(`Missing IPC handler: ${channel}`);
  return registration[1] as (...args: unknown[]) => unknown;
}

describe('main utility IPC registration', () => {
  beforeEach(() => {
    ipcHandle.mockReset();
    showOpenDialog.mockReset();
  });

  it('registers the bounded utility and persona channel group', () => {
    initMainUtilityIpc({
      appRoot: 'C:\\app',
      getMainWindow: () => null,
      getMcpInfo: () => null,
      getUserDataPath: () => 'C:\\user-data',
    });

    expect(ipcHandle.mock.calls.map((args: unknown[]) => args[0])).toEqual([
      'get-mcp-info',
      'import-json',
      'read-persona',
      'write-persona',
      'list-personas',
      'write-system-prompt',
    ]);
  });

  it('builds MCP runtime info and delegates persona operations', async () => {
    const personaStore = {
      read: vi.fn(async () => 'persona'),
      write: vi.fn(async () => true),
      list: vi.fn(async () => ['default']),
    };
    const createPersonaStore = vi.fn(() => personaStore);
    initMainUtilityIpc({
      appRoot: 'C:\\app',
      getMainWindow: () => null,
      getMcpInfo: () => ({ port: 1234, token: 'secret' }),
      getUserDataPath: () => 'C:\\user-data',
      createPersonaStore,
    });

    expect(getHandler('get-mcp-info')()).toEqual({
      port: 1234,
      token: 'secret',
      mcpServerPath: expect.stringMatching(/toki-mcp-server\.js$/),
    });
    await expect(getHandler('read-persona')({}, 'default')).resolves.toBe('persona');
    await expect(getHandler('write-persona')({}, 'default', 'updated')).resolves.toBe(true);
    await expect(getHandler('list-personas')()).resolves.toEqual(['default']);
    expect(createPersonaStore).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]assets[\\/]persona$/),
      expect.stringMatching(/[\\/]personas$/),
    );
  });
});
