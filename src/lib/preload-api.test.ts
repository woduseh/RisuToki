import type { IpcRenderer } from 'electron';
import { describe, expect, test, vi } from 'vitest';

import { createTokiApi } from './preload-api';

function makeMockIpc() {
  return {
    invoke: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
  };
}

describe('createTokiApi', () => {
  test('does not expose the retired sync server controls', () => {
    const ipcRenderer = makeMockIpc();
    const api = createTokiApi(ipcRenderer as unknown as IpcRenderer);

    expect(typeof api.getAutosaveInfo).toBe('function');
    expect(typeof api.pickAutosaveDir).toBe('function');
    expect(Object.prototype.hasOwnProperty.call(api, 'startSync')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(api, 'stopSync')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(api, 'onSyncStatus')).toBe(false);
  });

  test('exposes session recovery IPC methods', () => {
    const ipcRenderer = makeMockIpc();
    const api = createTokiApi(ipcRenderer as unknown as IpcRenderer);

    expect(typeof api.getPendingSessionRecovery).toBe('function');
    expect(typeof api.resolvePendingSessionRecovery).toBe('function');
  });

  test('getPendingSessionRecovery invokes correct IPC channel', async () => {
    const ipcRenderer = makeMockIpc();
    ipcRenderer.invoke.mockResolvedValue(null);
    const api = createTokiApi(ipcRenderer as unknown as IpcRenderer);

    await api.getPendingSessionRecovery();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-pending-session-recovery');
  });

  test('resolvePendingSessionRecovery forwards action argument', async () => {
    const ipcRenderer = makeMockIpc();
    ipcRenderer.invoke.mockResolvedValue(null);
    const api = createTokiApi(ipcRenderer as unknown as IpcRenderer);

    await api.resolvePendingSessionRecovery('restore');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('resolve-pending-session-recovery', 'restore');

    await api.resolvePendingSessionRecovery('open-original');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('resolve-pending-session-recovery', 'open-original');

    await api.resolvePendingSessionRecovery('ignore');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('resolve-pending-session-recovery', 'ignore');
  });

  test('exposes MCP session status IPC bridge methods', () => {
    const ipcRenderer = makeMockIpc();
    const api = createTokiApi(ipcRenderer as unknown as IpcRenderer) as unknown as {
      onMcpSessionStatusRequest?: unknown;
      sendMcpSessionStatusResponse?: unknown;
    };

    expect(typeof api.onMcpSessionStatusRequest).toBe('function');
    expect(typeof api.sendMcpSessionStatusResponse).toBe('function');
  });

  test('MCP session status bridge uses the correct IPC channels', () => {
    const ipcRenderer = makeMockIpc();
    const api = createTokiApi(ipcRenderer as unknown as IpcRenderer) as unknown as {
      onMcpSessionStatusRequest: (cb: (id: number) => void) => void;
      sendMcpSessionStatusResponse: (id: number, response: Record<string, unknown>) => void;
    };
    const callback = () => undefined;

    api.onMcpSessionStatusRequest(callback);
    expect(ipcRenderer.on).toHaveBeenCalledWith('mcp-session-status-request', expect.any(Function));

    api.sendMcpSessionStatusResponse(7, {
      success: true,
      renderer: {
        autosaveDir: 'C:\\autosave',
        autosaveEnabled: true,
        autosaveInterval: 120000,
        dirtyFieldCount: 2,
        dirtyFields: ['description', 'firstMessage'],
        documentSwitchInProgress: false,
        hasUnsavedChanges: true,
      },
    });
    expect(ipcRenderer.send).toHaveBeenCalledWith('mcp-session-status-response', 7, {
      success: true,
      renderer: {
        autosaveDir: 'C:\\autosave',
        autosaveEnabled: true,
        autosaveInterval: 120000,
        dirtyFieldCount: 2,
        dirtyFields: ['description', 'firstMessage'],
        documentSwitchInProgress: false,
        hasUnsavedChanges: true,
      },
    });
  });
});
