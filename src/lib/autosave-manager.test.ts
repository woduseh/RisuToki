import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcHandle } = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcHandle,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  BrowserWindow: class BrowserWindow {},
}));

import { initAutosaveManager } from './autosave-manager';
import { applyUpdates, initDataSerializer } from './data-serializer';

function getRegisteredHandler(name: string) {
  const call = ipcHandle.mock.calls.find(([channel]) => channel === name);
  if (!call) {
    throw new Error(`Handler "${name}" was not registered`);
  }
  return call[1] as (...args: unknown[]) => Promise<{ success: boolean; error?: string; path?: string }>;
}

describe('autosave-manager', () => {
  beforeEach(() => {
    ipcHandle.mockClear();
    initDataSerializer({
      stringifyTriggerScripts: (scripts) => JSON.stringify(scripts ?? []),
      normalizeTriggerScripts: (scripts) => (Array.isArray(scripts) ? scripts : []),
      extractPrimaryLuaFromTriggerScripts: () => '',
      mergePrimaryLuaIntoTriggerScripts: (scripts) => (Array.isArray(scripts) ? scripts : []),
    });
  });

  it('returns failure and does not write when risup structured updates are invalid', async () => {
    const currentData = {
      _fileType: 'risup',
      name: 'Preset',
      promptTemplate: '[{"type":"plain","type2":"normal","text":"ok","role":"system"}]',
      formatingOrder: '["main","description"]',
    };
    const saveCharx = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      initAutosaveManager({
        getCurrentData: () => currentData,
        getCurrentFilePath: () => 'C:\\Users\\wodus\\Temp\\preset.risup',
        getMainWindow: () => null,
        saveCharx,
        applyUpdates,
      });

      const autosaveHandler = getRegisteredHandler('autosave-file');
      const result = await autosaveHandler({}, { name: 'BadName', promptTemplate: '{"broken":true}' });

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/Invalid promptTemplate/i),
        }),
      );
      expect(saveCharx).not.toHaveBeenCalled();
      expect(currentData.name).toBe('Preset');
      expect(currentData.promptTemplate).toBe('[{"type":"plain","type2":"normal","text":"ok","role":"system"}]');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('returns failure and does not write when json-backed risup updates are invalid', async () => {
    const currentData = {
      _fileType: 'risup',
      name: 'Preset',
      presetBias: '[["hello",5]]',
      localStopStrings: '["END"]',
    };
    const saveCharx = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      initAutosaveManager({
        getCurrentData: () => currentData,
        getCurrentFilePath: () => 'C:\\Users\\wodus\\Temp\\preset.risup',
        getMainWindow: () => null,
        saveCharx,
        applyUpdates,
      });

      const autosaveHandler = getRegisteredHandler('autosave-file');
      const result = await autosaveHandler({}, { name: 'BadName', localStopStrings: '["END", 42]' });

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/Invalid localStopStrings/i),
        }),
      );
      expect(saveCharx).not.toHaveBeenCalled();
      expect(currentData.name).toBe('Preset');
      expect(currentData.localStopStrings).toBe('["END"]');
    } finally {
      errorSpy.mockRestore();
    }
  });
});
