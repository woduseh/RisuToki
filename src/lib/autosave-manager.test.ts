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

import { initAutosaveManager, type AutosaveManagerDeps } from './autosave-manager';
import { applyUpdates, initDataSerializer } from './data-serializer';

function getRegisteredHandler(name: string) {
  const call = ipcHandle.mock.calls.find((args: unknown[]) => args[0] === name);
  if (!call) {
    throw new Error(`Handler "${name}" was not registered`);
  }
  return call[1] as (...args: unknown[]) => Promise<{ success: boolean; error?: string; path?: string }>;
}

function makeDeps(overrides: Partial<AutosaveManagerDeps> = {}): AutosaveManagerDeps {
  return {
    getCurrentData: () => ({ _fileType: 'charx', name: 'TestChar' }),
    getCurrentFilePath: () => 'C:\\data\\test.charx',
    getMainWindow: () => null,
    saveCharx: vi.fn(),
    saveRisum: vi.fn(),
    saveRisup: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    unlinkSync: vi.fn(),
    applyUpdates: vi.fn(),
    ...overrides,
  };
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

  // ── Writer routing ──────────────────────────────────────────────────

  describe('same-type writer dispatch', () => {
    it('writes charx autosaves with saveCharx and a .charx extension', async () => {
      const saveCharx = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'charx', name: 'MyChar' }),
        getCurrentFilePath: () => 'C:\\data\\char.charx',
        saveCharx,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { description: 'updated' });

      expect(saveCharx).toHaveBeenCalledWith(expect.stringMatching(/_autosave_.*\.charx$/), expect.anything());
      expect(d.saveRisum).not.toHaveBeenCalled();
      expect(d.saveRisup).not.toHaveBeenCalled();
    });

    it('writes risum autosaves with saveRisum and a .risum extension', async () => {
      const saveRisum = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'risum', name: 'MyModule' }),
        getCurrentFilePath: () => 'C:\\data\\module.risum',
        saveRisum,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { description: 'updated' });

      expect(saveRisum).toHaveBeenCalledWith(expect.stringMatching(/_autosave_.*\.risum$/), expect.anything());
      expect(d.saveCharx).not.toHaveBeenCalled();
      expect(d.saveRisup).not.toHaveBeenCalled();
    });

    it('writes risup autosaves with saveRisup and a .risup extension', async () => {
      const saveRisup = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'risup', name: 'MyPreset' }),
        getCurrentFilePath: () => 'C:\\data\\preset.risup',
        saveRisup,
        applyUpdates,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { name: 'UpdatedPreset' });

      expect(saveRisup).toHaveBeenCalledWith(expect.stringMatching(/_autosave_.*\.risup$/), expect.anything());
      expect(d.saveCharx).not.toHaveBeenCalled();
      expect(d.saveRisum).not.toHaveBeenCalled();
    });

    it('defaults to charx when _fileType is missing', async () => {
      const saveCharx = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({ name: 'Legacy' }),
        getCurrentFilePath: () => 'C:\\data\\old.charx',
        saveCharx,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { description: 'updated' });

      expect(saveCharx).toHaveBeenCalledWith(expect.stringMatching(/_autosave_.*\.charx$/), expect.anything());
    });

    it('uses a canonical timestamp without introducing a double dot before the extension', async () => {
      const saveCharx = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'charx', name: 'MyChar' }),
        getCurrentFilePath: () => 'C:\\data\\char.charx',
        saveCharx,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { description: 'updated' });

      const autosavePath = saveCharx.mock.calls[0][0] as string;
      expect(autosavePath).toMatch(/_autosave_\d{14}\.charx$/);
      expect(autosavePath).not.toContain('..charx');
    });
  });

  // ── Provenance sidecar ──────────────────────────────────────────────

  describe('provenance sidecar', () => {
    it('writes a provenance sidecar next to the autosave artifact', async () => {
      const localWriteFileSync = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'charx', name: 'MyChar' }),
        getCurrentFilePath: () => 'C:\\data\\char.charx',
        writeFileSync: localWriteFileSync,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { description: 'updated' });

      expect(localWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.toki-recovery.json'),
        expect.stringContaining('"dirtyFields"'),
      );
    });

    it('sidecar contains expected provenance fields', async () => {
      const localWriteFileSync = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'risum', name: 'MyModule' }),
        getCurrentFilePath: () => 'C:\\data\\module.risum',
        writeFileSync: localWriteFileSync,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { moduleName: 'Changed' });

      expect(localWriteFileSync).toHaveBeenCalledTimes(1);
      const sidecarJson = JSON.parse(localWriteFileSync.mock.calls[0][1] as string);
      expect(sidecarJson).toEqual(
        expect.objectContaining({
          sourceFilePath: 'C:\\data\\module.risum',
          sourceFileType: 'risum',
          autosavePath: expect.stringMatching(/_autosave_.*\.risum$/),
          savedAt: expect.any(String),
          dirtyFields: expect.arrayContaining(['moduleName']),
          appVersion: expect.any(String),
        }),
      );
    });

    it('sidecar path matches the autosave path with suffix', async () => {
      const localWriteFileSync = vi.fn();
      const saveCharx = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'charx', name: 'C' }),
        getCurrentFilePath: () => 'C:\\data\\test.charx',
        saveCharx,
        writeFileSync: localWriteFileSync,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { name: 'Updated' });

      const autosavePath = saveCharx.mock.calls[0][0] as string;
      const sidecarPath = localWriteFileSync.mock.calls[0][0] as string;
      expect(sidecarPath).toBe(autosavePath + '.toki-recovery.json');
    });

    it('includes dirty fields from updatedFields keys', async () => {
      const localWriteFileSync = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'charx', name: 'C' }),
        getCurrentFilePath: () => 'C:\\data\\test.charx',
        writeFileSync: localWriteFileSync,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { name: 'New', description: 'Desc', firstMessage: 'Hi' });

      const sidecarJson = JSON.parse(localWriteFileSync.mock.calls[0][1] as string);
      expect(sidecarJson.dirtyFields).toEqual(expect.arrayContaining(['name', 'description', 'firstMessage']));
    });

    it('excludes internal fields from dirtyFields', async () => {
      const localWriteFileSync = vi.fn();
      const saveCharx = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'charx', name: 'C' }),
        getCurrentFilePath: () => 'C:\\data\\test.charx',
        saveCharx,
        writeFileSync: localWriteFileSync,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { name: 'New', _autosaveDir: 'C:\\custom' });

      const sidecarJson = JSON.parse(localWriteFileSync.mock.calls[0][1] as string);
      expect(sidecarJson.dirtyFields).not.toContain('_autosaveDir');
      expect(sidecarJson.dirtyFields).toContain('name');
      expect(saveCharx).toHaveBeenCalledWith(expect.stringMatching(/^C:\\custom\\/), expect.anything());
    });
  });

  // ── Cleanup ──────────────────────────────────────────────────────────

  describe('cleanup-autosave', () => {
    it('removes autosave artifacts and their sidecars', () => {
      const readdirSync = vi
        .fn()
        .mockReturnValue([
          'char_autosave_20250101T120000.charx',
          'char_autosave_20250101T120000.charx.toki-recovery.json',
          'char_autosave_20250102T120000.charx',
          'char_autosave_20250102T120000.charx.toki-recovery.json',
          'other_file.charx',
        ]);
      const unlinkSync = vi.fn();

      const d = makeDeps({
        getCurrentFilePath: () => 'C:\\data\\char.charx',
        readdirSync,
        unlinkSync,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('cleanup-autosave');

      handler(null);

      expect(unlinkSync).toHaveBeenCalledTimes(4);
      expect(unlinkSync).toHaveBeenCalledWith(expect.stringContaining('char_autosave_20250101T120000.charx'));
      expect(unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('char_autosave_20250101T120000.charx.toki-recovery.json'),
      );
      expect(unlinkSync).not.toHaveBeenCalledWith(expect.stringContaining('other_file.charx'));
    });

    it('removes risum autosave artifacts and sidecars', () => {
      const readdirSync = vi
        .fn()
        .mockReturnValue([
          'mod_autosave_20250101T120000.risum',
          'mod_autosave_20250101T120000.risum.toki-recovery.json',
        ]);
      const unlinkSync = vi.fn();

      const d = makeDeps({
        getCurrentFilePath: () => 'C:\\data\\mod.risum',
        readdirSync,
        unlinkSync,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('cleanup-autosave');

      handler(null);

      expect(unlinkSync).toHaveBeenCalledTimes(2);
    });

    it('removes risup autosave artifacts and sidecars', () => {
      const readdirSync = vi
        .fn()
        .mockReturnValue([
          'preset_autosave_20250101T120000.risup',
          'preset_autosave_20250101T120000.risup.toki-recovery.json',
        ]);
      const unlinkSync = vi.fn();

      const d = makeDeps({
        getCurrentFilePath: () => 'C:\\data\\preset.risup',
        readdirSync,
        unlinkSync,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('cleanup-autosave');

      handler(null);

      expect(unlinkSync).toHaveBeenCalledTimes(2);
    });

    it('removes mixed-type autosave artifacts when cleanup dir is given', () => {
      const readdirSync = vi
        .fn()
        .mockReturnValue([
          'char_autosave_20250101T120000.charx',
          'char_autosave_20250101T120000.charx.toki-recovery.json',
          'char_autosave_20250102T120000.risum',
          'char_autosave_20250102T120000.risum.toki-recovery.json',
        ]);
      const unlinkSync = vi.fn();

      const d = makeDeps({
        getCurrentFilePath: () => 'C:\\data\\char.charx',
        readdirSync,
        unlinkSync,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('cleanup-autosave');

      handler(null, 'C:\\custom');

      expect(unlinkSync).toHaveBeenCalledTimes(4);
    });
  });

  // ── Invalid risup updates ──────────────────────────────────────────

  describe('invalid risup updates', () => {
    it('preserves migrated promptTemplate ids in risup autosave writes', async () => {
      const idBearingTemplate = JSON.stringify([
        { id: 'prompt-plain-abc-0', type: 'plain', type2: 'normal', text: 'test', role: 'system' },
      ]);
      const saveRisup = vi.fn();
      const d = makeDeps({
        getCurrentData: () => ({
          _fileType: 'risup',
          name: 'Preset',
          promptTemplate: idBearingTemplate,
        }),
        getCurrentFilePath: () => 'C:\\data\\preset.risup',
        saveRisup,
        applyUpdates,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      await handler({}, { name: 'UpdatedPreset' });

      expect(saveRisup).toHaveBeenCalledTimes(1);
      const savedData = saveRisup.mock.calls[0][1];
      expect(savedData.promptTemplate).toBe(idBearingTemplate);
    });

    it('returns failure and does not write when risup structured updates are invalid', async () => {
      const currentData = {
        _fileType: 'risup',
        name: 'Preset',
        promptTemplate: '[{"type":"plain","type2":"normal","text":"ok","role":"system"}]',
        formatingOrder: '["main","description"]',
      };
      const saveRisup = vi.fn();
      const localWriteFileSync = vi.fn();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        initAutosaveManager({
          getCurrentData: () => currentData,
          getCurrentFilePath: () => 'C:\\Users\\wodus\\Temp\\preset.risup',
          getMainWindow: () => null,
          saveCharx: vi.fn(),
          saveRisum: vi.fn(),
          saveRisup,
          writeFileSync: localWriteFileSync,
          mkdirSync: vi.fn(),
          readdirSync: vi.fn().mockReturnValue([]),
          unlinkSync: vi.fn(),
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
        expect(saveRisup).not.toHaveBeenCalled();
        expect(localWriteFileSync).not.toHaveBeenCalled();
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
      const saveRisup = vi.fn();
      const localWriteFileSync = vi.fn();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        initAutosaveManager({
          getCurrentData: () => currentData,
          getCurrentFilePath: () => 'C:\\Users\\wodus\\Temp\\preset.risup',
          getMainWindow: () => null,
          saveCharx: vi.fn(),
          saveRisum: vi.fn(),
          saveRisup,
          writeFileSync: localWriteFileSync,
          mkdirSync: vi.fn(),
          readdirSync: vi.fn().mockReturnValue([]),
          unlinkSync: vi.fn(),
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
        expect(saveRisup).not.toHaveBeenCalled();
        expect(localWriteFileSync).not.toHaveBeenCalled();
        expect(currentData.name).toBe('Preset');
        expect(currentData.localStopStrings).toBe('["END"]');
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('cleans up the autosave artifact when sidecar writing fails', async () => {
      const unlinkSync = vi.fn();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const d = makeDeps({
          getCurrentData: () => ({ _fileType: 'charx', name: 'MyChar' }),
          getCurrentFilePath: () => 'C:\\data\\char.charx',
          writeFileSync: vi.fn(() => {
            throw new Error('disk full');
          }),
          unlinkSync,
        });
        initAutosaveManager(d);
        const handler = getRegisteredHandler('autosave-file');

        const result = await handler({}, { description: 'updated' });

        expect(result).toEqual(
          expect.objectContaining({
            success: false,
            error: expect.stringMatching(/disk full/i),
          }),
        );
        expect(unlinkSync).toHaveBeenCalledWith(expect.stringMatching(/_autosave_.*\.charx$/));
        expect(unlinkSync).toHaveBeenCalledWith(expect.stringContaining('.toki-recovery.json'));
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  // ── Return value ───────────────────────────────────────────────────

  describe('autosave return value', () => {
    it('returns success with the autosave path', async () => {
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'charx', name: 'Char' }),
        getCurrentFilePath: () => 'C:\\data\\char.charx',
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      const result = await handler({}, { description: 'updated' });

      expect(result.success).toBe(true);
      expect(result.path).toMatch(/_autosave_.*\.charx$/);
    });

    it('returns failure when no data is loaded', async () => {
      const d = makeDeps({
        getCurrentData: () => null,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      const result = await handler({}, { description: 'updated' });

      expect(result.success).toBe(false);
    });

    it('returns failure when no file path and no autosave dir', async () => {
      const d = makeDeps({
        getCurrentData: () => ({ _fileType: 'charx', name: 'NoPath' }),
        getCurrentFilePath: () => null,
      });
      initAutosaveManager(d);
      const handler = getRegisteredHandler('autosave-file');

      const result = await handler({}, { description: 'updated' });

      expect(result.success).toBe(false);
    });
  });
});
