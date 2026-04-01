import { describe, expect, it, vi } from 'vitest';

async function loadSessionRecoveryMainModule(): Promise<Record<string, unknown>> {
  const modulePath = './session-recovery-main';
  try {
    return await import(modulePath);
  } catch {
    return {};
  }
}

describe('session-recovery-main', () => {
  it.each([
    ['C:\\cards\\hero.charx', 'charx'],
    ['C:\\cards\\module.risum', 'risum'],
    ['C:\\cards\\preset.risup', 'risup'],
  ])('marks %s as the active recovery document with file type %s', async (filePath, expectedType) => {
    const module = await loadSessionRecoveryMainModule();
    const markRecoveryDocumentActiveForPath = module.markRecoveryDocumentActiveForPath as
      | ((
          recoveryManager: { markDocumentActive: (path: string, fileType: string) => Promise<void> },
          path: string,
        ) => Promise<void>)
      | undefined;
    const recoveryManager = {
      markDocumentActive: vi.fn().mockResolvedValue(undefined),
    };

    expect(typeof markRecoveryDocumentActiveForPath).toBe('function');

    await markRecoveryDocumentActiveForPath!(recoveryManager, filePath);

    expect(recoveryManager.markDocumentActive).toHaveBeenCalledWith(filePath, expectedType);
  });

  it('does nothing when the recovery manager or file path is missing', async () => {
    const module = await loadSessionRecoveryMainModule();
    const markRecoveryDocumentActiveForPath = module.markRecoveryDocumentActiveForPath as
      | ((
          recoveryManager: { markDocumentActive: (path: string, fileType: string) => Promise<void> } | null,
          path: string | null,
        ) => Promise<void>)
      | undefined;
    const recoveryManager = {
      markDocumentActive: vi.fn().mockResolvedValue(undefined),
    };

    expect(typeof markRecoveryDocumentActiveForPath).toBe('function');

    await markRecoveryDocumentActiveForPath!(null, 'C:\\cards\\hero.charx');
    await markRecoveryDocumentActiveForPath!(recoveryManager, null);

    expect(recoveryManager.markDocumentActive).not.toHaveBeenCalled();
  });

  it('re-seeds recovery with the saved path after a successful explicit save', async () => {
    const module = await loadSessionRecoveryMainModule();
    const syncRecoveryAfterExplicitSave = module.syncRecoveryAfterExplicitSave as
      | ((
          recoveryManager: { markDocumentActive: (path: string, fileType: string) => Promise<void> },
          saveResult: { success: boolean; path?: string },
        ) => Promise<void>)
      | undefined;
    const recoveryManager = {
      markDocumentActive: vi.fn().mockResolvedValue(undefined),
    };

    expect(typeof syncRecoveryAfterExplicitSave).toBe('function');

    await syncRecoveryAfterExplicitSave!(recoveryManager, { success: true, path: 'C:\\cards\\saved.risum' });

    expect(recoveryManager.markDocumentActive).toHaveBeenCalledWith('C:\\cards\\saved.risum', 'risum');
  });

  it('does not touch recovery state after failed or pathless saves', async () => {
    const module = await loadSessionRecoveryMainModule();
    const syncRecoveryAfterExplicitSave = module.syncRecoveryAfterExplicitSave as
      | ((
          recoveryManager: { markDocumentActive: (path: string, fileType: string) => Promise<void> } | null,
          saveResult: { success: boolean; path?: string },
        ) => Promise<void>)
      | undefined;
    const recoveryManager = {
      markDocumentActive: vi.fn().mockResolvedValue(undefined),
    };

    expect(typeof syncRecoveryAfterExplicitSave).toBe('function');

    await syncRecoveryAfterExplicitSave!(recoveryManager, { success: false, path: 'C:\\cards\\saved.charx' });
    await syncRecoveryAfterExplicitSave!(recoveryManager, { success: true });
    await syncRecoveryAfterExplicitSave!(null, { success: true, path: 'C:\\cards\\saved.charx' });

    expect(recoveryManager.markDocumentActive).not.toHaveBeenCalled();
  });
});
