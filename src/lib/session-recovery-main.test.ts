import { describe, expect, it, vi } from 'vitest';

import { markRecoveryDocumentActiveForPath, syncRecoveryAfterExplicitSave } from './session-recovery-main';
import { createSessionRecoveryManager } from './session-recovery-manager';
import { getAutosaveSidecarPath } from './session-recovery';

describe('session-recovery-main', () => {
  it.each([
    ['C:\\cards\\hero.charx', 'charx'],
    ['C:\\cards\\module.risum', 'risum'],
    ['C:\\cards\\preset.risup', 'risup'],
  ])('marks %s as the active recovery document with file type %s', async (filePath, expectedType) => {
    const recoveryManager = {
      markDocumentActive: vi.fn().mockResolvedValue(undefined),
    };

    await markRecoveryDocumentActiveForPath(recoveryManager, filePath);

    expect(recoveryManager.markDocumentActive).toHaveBeenCalledWith(filePath, expectedType);
  });

  it('does nothing when the recovery manager or file path is missing', async () => {
    const recoveryManager = {
      markDocumentActive: vi.fn().mockResolvedValue(undefined),
    };

    await markRecoveryDocumentActiveForPath(null, 'C:\\cards\\hero.charx');
    await markRecoveryDocumentActiveForPath(recoveryManager, null);

    expect(recoveryManager.markDocumentActive).not.toHaveBeenCalled();
  });

  it('re-seeds recovery with the saved path after a successful explicit save', async () => {
    const recoveryManager = {
      markDocumentActive: vi.fn().mockResolvedValue(undefined),
    };

    await syncRecoveryAfterExplicitSave(recoveryManager, { success: true, path: 'C:\\cards\\saved.risum' });

    expect(recoveryManager.markDocumentActive).toHaveBeenCalledWith('C:\\cards\\saved.risum', 'risum');
  });

  it('does not touch recovery state after failed or pathless saves', async () => {
    const recoveryManager = {
      markDocumentActive: vi.fn().mockResolvedValue(undefined),
    };

    await syncRecoveryAfterExplicitSave(recoveryManager, { success: false, path: 'C:\\cards\\saved.charx' });
    await syncRecoveryAfterExplicitSave(recoveryManager, { success: true });
    await syncRecoveryAfterExplicitSave(null, { success: true, path: 'C:\\cards\\saved.charx' });

    expect(recoveryManager.markDocumentActive).not.toHaveBeenCalled();
  });

  it('makes the first saved document recoverable after a later autosave without a prior active-file record', async () => {
    const sourcePath = 'C:\\cards\\saved.risum';
    const autosavePath = 'C:\\cards\\saved_autosave.risum';
    const sidecarPath = getAutosaveSidecarPath(autosavePath);
    const files = new Map<string, string>([
      [sourcePath, 'source'],
      [autosavePath, 'autosave'],
      [
        sidecarPath,
        JSON.stringify({
          sourceFilePath: sourcePath,
          sourceFileType: 'risum',
          autosavePath,
          savedAt: '2026-10-04T00:00:00.000Z',
          dirtyFields: ['description'],
          appVersion: 'test',
        }),
      ],
    ]);
    const deps = {
      readFileSync: (filePath: string) => files.get(filePath)!,
      writeFileSync: (filePath: string, content: string) => {
        files.set(filePath, content);
      },
      existsSync: (filePath: string) => files.has(filePath),
      statSync: () => ({ mtimeMs: 1000 }),
      userDataPath: 'C:\\user-data',
      openDocument: vi.fn(() => ({})),
      setCurrentDocument: vi.fn(),
    };
    const manager = createSessionRecoveryManager(deps);

    await syncRecoveryAfterExplicitSave(manager, { success: true, path: sourcePath });
    await manager.updateAutosavePaths(autosavePath, sidecarPath);

    const nextRun = createSessionRecoveryManager(deps);
    expect(await nextRun.getPendingRecovery()).toMatchObject({ sourceFilePath: sourcePath, autosavePath });
  });
});
