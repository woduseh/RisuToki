import { describe, expect, it, vi } from 'vitest';

import { markRecoveryDocumentActiveForPath, syncRecoveryAfterExplicitSave } from './session-recovery-main';

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
});
