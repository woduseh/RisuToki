import { describe, expect, it, vi } from 'vitest';
import { runStartupSessionRecovery } from './session-recovery-controller';

describe('session-recovery-controller', () => {
  it('restores a pending session and sets sticky UI provenance', async () => {
    const applyRecoveredDocument = vi.fn();
    const setRestoredSessionLabel = vi.fn();
    const showRestoredSessionStatus = vi.fn();

    await runStartupSessionRecovery({
      api: {
        getPendingSessionRecovery: vi.fn().mockResolvedValue({
          sourceFilePath: 'C:\\cards\\Character.charx',
          autosavePath: 'C:\\cards\\Character_autosave_20260401.charx',
          staleWarning: null,
          provenance: { savedAt: '2026-04-01T09:41:20.000Z' },
        }),
        resolvePendingSessionRecovery: vi.fn().mockResolvedValue({
          action: 'restore',
          data: { name: 'Character' },
        }),
      },
      showRecoveryDialog: vi.fn().mockResolvedValue('restore'),
      applyRecoveredDocument,
      setRestoredSessionLabel,
      showRestoredSessionStatus,
    });

    expect(applyRecoveredDocument).toHaveBeenCalledWith({ name: 'Character' });
    expect(setRestoredSessionLabel).toHaveBeenCalledWith('자동복원');
    expect(showRestoredSessionStatus).toHaveBeenCalledWith(
      expect.stringMatching(/^자동 저장에서 복원됨: Character\.charx \(04\/01 \d{2}:41:20\)$/),
    );
  });

  it('does nothing when there is no pending recovery candidate', async () => {
    const applyRecoveredDocument = vi.fn();

    await runStartupSessionRecovery({
      api: {
        getPendingSessionRecovery: vi.fn().mockResolvedValue(null),
        resolvePendingSessionRecovery: vi.fn(),
      },
      showRecoveryDialog: vi.fn(),
      applyRecoveredDocument,
      setRestoredSessionLabel: vi.fn(),
      showRestoredSessionStatus: vi.fn(),
    });

    expect(applyRecoveredDocument).not.toHaveBeenCalled();
  });

  it('opens the original document without setting restored-session provenance', async () => {
    const applyRecoveredDocument = vi.fn();
    const setRestoredSessionLabel = vi.fn();
    const showRestoredSessionStatus = vi.fn();

    await runStartupSessionRecovery({
      api: {
        getPendingSessionRecovery: vi.fn().mockResolvedValue({
          sourceFilePath: 'C:\\cards\\Character.charx',
          autosavePath: 'C:\\cards\\Character_autosave_20260401.charx',
          staleWarning: null,
          provenance: { savedAt: '2026-04-01T09:41:20.000Z' },
        }),
        resolvePendingSessionRecovery: vi.fn().mockResolvedValue({
          action: 'open-original',
          data: { name: 'Character' },
        }),
      },
      showRecoveryDialog: vi.fn().mockResolvedValue('open-original'),
      applyRecoveredDocument,
      setRestoredSessionLabel,
      showRestoredSessionStatus,
    });

    expect(applyRecoveredDocument).toHaveBeenCalledWith({ name: 'Character' });
    expect(setRestoredSessionLabel).not.toHaveBeenCalled();
    expect(showRestoredSessionStatus).not.toHaveBeenCalled();
  });

  it('ignores the pending recovery without applying a document', async () => {
    const applyRecoveredDocument = vi.fn();

    await runStartupSessionRecovery({
      api: {
        getPendingSessionRecovery: vi.fn().mockResolvedValue({
          sourceFilePath: 'C:\\cards\\Character.charx',
          autosavePath: 'C:\\cards\\Character_autosave_20260401.charx',
          staleWarning: null,
          provenance: { savedAt: '2026-04-01T09:41:20.000Z' },
        }),
        resolvePendingSessionRecovery: vi.fn().mockResolvedValue(null),
      },
      showRecoveryDialog: vi.fn().mockResolvedValue('ignore'),
      applyRecoveredDocument,
      setRestoredSessionLabel: vi.fn(),
      showRestoredSessionStatus: vi.fn(),
    });

    expect(applyRecoveredDocument).not.toHaveBeenCalled();
  });
});
