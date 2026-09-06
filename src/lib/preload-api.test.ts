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
  test('forwards review drafts and guarded asset restore requests without changing their payloads', async () => {
    const ipcRenderer = makeMockIpc();
    const api = createTokiApi(ipcRenderer as unknown as IpcRenderer);
    const draft: Parameters<typeof api.getDocumentReview>[0] = {
      _documentId: 'document-1',
      _fileType: 'charx',
      name: 'Synthetic',
      description: 'Draft',
      firstMessage: '',
      alternateGreetings: [],
      globalNote: '',
      css: '',
      defaultVariables: '',
      lua: '',
      triggerScripts: '[]',
      lorebook: [],
      regex: [],
    };
    const request = {
      documentId: 'document-1',
      baselineToken: 'baseline-1',
      path: 'assets/icon/test.png',
      currentHash: 'sha256',
    };
    await api.getDocumentReview(draft);
    await api.restoreReviewAsset(request);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-document-review', draft);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('restore-review-asset', request);
  });

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

  test('forwards project clone and batch asset rename IPC calls', async () => {
    const ipcRenderer = makeMockIpc();
    ipcRenderer.invoke.mockResolvedValue(null);
    const api = createTokiApi(ipcRenderer as unknown as IpcRenderer);
    const operations = [{ oldPath: 'assets/icon/a.png', newName: 'b.png' }];

    await api.cloneProjectFolder();
    await api.renameAssetsBatch(operations);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('clone-project-folder');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('rename-assets-batch', operations);
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

  test('exposes Antigravity MCP configuration without the retired Gemini bridge', async () => {
    const ipcRenderer = makeMockIpc();
    const api = createTokiApi(ipcRenderer as unknown as IpcRenderer);

    await api.writeAntigravityMcpConfig();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('write-antigravity-mcp-config');
    expect(Object.prototype.hasOwnProperty.call(api, 'writeGeminiMcpConfig')).toBe(false);
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
