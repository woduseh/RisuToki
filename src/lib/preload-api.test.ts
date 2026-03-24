import type { IpcRenderer } from 'electron';
import { describe, expect, test, vi } from 'vitest';

import { createTokiApi } from './preload-api';

describe('createTokiApi', () => {
  test('does not expose the retired sync server controls', () => {
    const ipcRenderer = {
      invoke: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
    };

    const api = createTokiApi(ipcRenderer as unknown as IpcRenderer);

    expect(typeof api.getAutosaveInfo).toBe('function');
    expect(typeof api.pickAutosaveDir).toBe('function');
    expect(Object.prototype.hasOwnProperty.call(api, 'startSync')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(api, 'stopSync')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(api, 'onSyncStatus')).toBe(false);
  });
});
