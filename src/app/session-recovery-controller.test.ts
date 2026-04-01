import { describe, expect, it, vi } from 'vitest';

async function loadSessionRecoveryControllerModule(): Promise<Record<string, unknown>> {
  const modulePath = './session-recovery-controller';
  try {
    return await import(modulePath);
  } catch {
    return {};
  }
}

describe('session-recovery-controller', () => {
  it('restores a pending session and sets sticky UI provenance', async () => {
    const mod = await loadSessionRecoveryControllerModule();
    const runStartupSessionRecovery = mod.runStartupSessionRecovery as
      | ((deps: {
          api: {
            getPendingSessionRecovery: () => Promise<{
              sourceFilePath: string;
              autosavePath: string;
              staleWarning: string | null;
              provenance: { savedAt: string };
            } | null>;
            resolvePendingSessionRecovery: (
              action: 'restore' | 'open-original' | 'ignore',
            ) => Promise<{ action: 'restore' | 'open-original'; data: Record<string, unknown> } | null>;
          };
          showRecoveryDialog: (summary: {
            sourceFileName: string;
            savedAt: string;
            staleWarning?: string | null;
          }) => Promise<'restore' | 'open-original' | 'ignore'>;
          applyRecoveredDocument: (data: Record<string, unknown>) => void;
          setRestoredSessionLabel: (label: string) => void;
          showRestoredSessionStatus: (text: string) => void;
        }) => Promise<void>)
      | undefined;

    const applyRecoveredDocument = vi.fn();
    const setRestoredSessionLabel = vi.fn();
    const showRestoredSessionStatus = vi.fn();

    expect(typeof runStartupSessionRecovery).toBe('function');

    await runStartupSessionRecovery!({
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
    const mod = await loadSessionRecoveryControllerModule();
    const runStartupSessionRecovery = mod.runStartupSessionRecovery as
      | ((deps: {
          api: {
            getPendingSessionRecovery: () => Promise<null>;
            resolvePendingSessionRecovery: (
              action: 'restore' | 'open-original' | 'ignore',
            ) => Promise<{ action: 'restore' | 'open-original'; data: Record<string, unknown> } | null>;
          };
          showRecoveryDialog: (summary: {
            sourceFileName: string;
            savedAt: string;
            staleWarning?: string | null;
          }) => Promise<'restore' | 'open-original' | 'ignore'>;
          applyRecoveredDocument: (data: Record<string, unknown>) => void;
          setRestoredSessionLabel: (label: string) => void;
          showRestoredSessionStatus: (text: string) => void;
        }) => Promise<void>)
      | undefined;

    const applyRecoveredDocument = vi.fn();

    expect(typeof runStartupSessionRecovery).toBe('function');

    await runStartupSessionRecovery!({
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
    const mod = await loadSessionRecoveryControllerModule();
    const runStartupSessionRecovery = mod.runStartupSessionRecovery as
      | ((deps: {
          api: {
            getPendingSessionRecovery: () => Promise<{
              sourceFilePath: string;
              autosavePath: string;
              staleWarning: string | null;
              provenance: { savedAt: string };
            } | null>;
            resolvePendingSessionRecovery: (
              action: 'restore' | 'open-original' | 'ignore',
            ) => Promise<{ action: 'restore' | 'open-original'; data: Record<string, unknown> } | null>;
          };
          showRecoveryDialog: (summary: {
            sourceFileName: string;
            savedAt: string;
            staleWarning?: string | null;
          }) => Promise<'restore' | 'open-original' | 'ignore'>;
          applyRecoveredDocument: (data: Record<string, unknown>) => void;
          setRestoredSessionLabel: (label: string) => void;
          showRestoredSessionStatus: (text: string) => void;
        }) => Promise<void>)
      | undefined;

    const applyRecoveredDocument = vi.fn();
    const setRestoredSessionLabel = vi.fn();
    const showRestoredSessionStatus = vi.fn();

    expect(typeof runStartupSessionRecovery).toBe('function');

    await runStartupSessionRecovery!({
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
    const mod = await loadSessionRecoveryControllerModule();
    const runStartupSessionRecovery = mod.runStartupSessionRecovery as
      | ((deps: {
          api: {
            getPendingSessionRecovery: () => Promise<{
              sourceFilePath: string;
              autosavePath: string;
              staleWarning: string | null;
              provenance: { savedAt: string };
            } | null>;
            resolvePendingSessionRecovery: (
              action: 'restore' | 'open-original' | 'ignore',
            ) => Promise<{ action: 'restore' | 'open-original'; data: Record<string, unknown> } | null>;
          };
          showRecoveryDialog: (summary: {
            sourceFileName: string;
            savedAt: string;
            staleWarning?: string | null;
          }) => Promise<'restore' | 'open-original' | 'ignore'>;
          applyRecoveredDocument: (data: Record<string, unknown>) => void;
          setRestoredSessionLabel: (label: string) => void;
          showRestoredSessionStatus: (text: string) => void;
        }) => Promise<void>)
      | undefined;

    const applyRecoveredDocument = vi.fn();

    expect(typeof runStartupSessionRecovery).toBe('function');

    await runStartupSessionRecovery!({
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
