import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionRecoveryManagerDeps } from './session-recovery-manager';
import { createSessionRecoveryManager } from './session-recovery-manager';
import type { AutosaveProvenance, SessionRecoveryRecord } from './session-recovery';
import { STALE_THRESHOLD_MS } from './session-recovery';

// ── Test helpers ──────────────────────────────────────────────────────

const USER_DATA_PATH = 'C:\\Users\\test\\AppData\\Roaming\\RisuToki';
const RECORD_PATH = `${USER_DATA_PATH}\\session-recovery.json`;
const SOURCE_PATH = 'C:\\cards\\hero.charx';
const AUTOSAVE_PATH = 'C:\\cards\\hero_autosave_20260401.charx';
const SIDECAR_PATH = `${AUTOSAVE_PATH}.toki-recovery.json`;

function makeProvenance(overrides: Partial<AutosaveProvenance> = {}): AutosaveProvenance {
  return {
    sourceFilePath: SOURCE_PATH,
    sourceFileType: 'charx',
    autosavePath: AUTOSAVE_PATH,
    savedAt: '2026-04-01T10:00:00.000Z',
    dirtyFields: ['description'],
    appVersion: '0.31.0',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<SessionRecoveryRecord> = {}): SessionRecoveryRecord {
  return {
    sourceFilePath: SOURCE_PATH,
    sourceFileType: 'charx',
    latestAutosavePath: AUTOSAVE_PATH,
    latestAutosaveMetaPath: SIDECAR_PATH,
    cleanExit: false,
    updatedAt: '2026-04-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<SessionRecoveryManagerDeps> = {}): SessionRecoveryManagerDeps {
  return {
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ mtimeMs: 1000 })),
    unlinkSync: vi.fn(),
    userDataPath: USER_DATA_PATH,
    openDocument: vi.fn(() => ({ name: 'Hero' })),
    setCurrentDocument: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('SessionRecoveryManager', () => {
  let deps: SessionRecoveryManagerDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  // ── markDocumentActive ────────────────────────────────────────────

  describe('markDocumentActive', () => {
    it('writes a dirty recovery record when a document becomes active', async () => {
      const manager = createSessionRecoveryManager(deps);
      await manager.markDocumentActive(SOURCE_PATH, 'charx');

      expect(deps.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('session-recovery.json'),
        expect.stringContaining('"cleanExit":false'),
      );
    });

    it('includes source file path and type in the record', async () => {
      const manager = createSessionRecoveryManager(deps);
      await manager.markDocumentActive(SOURCE_PATH, 'charx');

      const writtenData = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const parsed = JSON.parse(writtenData) as SessionRecoveryRecord;
      expect(parsed.sourceFilePath).toBe(SOURCE_PATH);
      expect(parsed.sourceFileType).toBe('charx');
    });

    it('uses atomic record writes when available', async () => {
      const writeFileSync = vi.fn();
      const writeFileAtomicSync = vi.fn();
      deps = makeDeps({ writeFileSync, writeFileAtomicSync });
      const manager = createSessionRecoveryManager(deps);

      await manager.markDocumentActive(SOURCE_PATH, 'charx');

      expect(writeFileAtomicSync).toHaveBeenCalledWith(
        expect.stringContaining('session-recovery.json'),
        expect.stringContaining('"cleanExit":false'),
      );
      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it('sets latestAutosavePath and latestAutosaveMetaPath to null initially', async () => {
      const manager = createSessionRecoveryManager(deps);
      await manager.markDocumentActive(SOURCE_PATH, 'charx');

      const writtenData = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const parsed = JSON.parse(writtenData) as SessionRecoveryRecord;
      expect(parsed.latestAutosavePath).toBeNull();
      expect(parsed.latestAutosaveMetaPath).toBeNull();
    });
  });

  // ── updateAutosavePaths ───────────────────────────────────────────

  describe('updateAutosavePaths', () => {
    it('updates autosave path and sidecar path in the record', async () => {
      const manager = createSessionRecoveryManager(deps);
      await manager.markDocumentActive(SOURCE_PATH, 'charx');
      (deps.writeFileSync as ReturnType<typeof vi.fn>).mockClear();

      await manager.updateAutosavePaths(AUTOSAVE_PATH, SIDECAR_PATH);

      const writtenData = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const parsed = JSON.parse(writtenData) as SessionRecoveryRecord;
      expect(parsed.latestAutosavePath).toBe(AUTOSAVE_PATH);
      expect(parsed.latestAutosaveMetaPath).toBe(SIDECAR_PATH);
      expect(parsed.cleanExit).toBe(false);
    });

    it('does not write to disk when no document is active', async () => {
      const manager = createSessionRecoveryManager(deps);

      await manager.updateAutosavePaths(AUTOSAVE_PATH, SIDECAR_PATH);

      expect(deps.writeFileSync).not.toHaveBeenCalled();
    });
  });

  // ── clearAutosavePaths ─────────────────────────────────────────────

  describe('clearAutosavePaths', () => {
    it('clears autosave paths while keeping the active source document dirty', async () => {
      const manager = createSessionRecoveryManager(deps);
      await manager.markDocumentActive(SOURCE_PATH, 'charx');
      await manager.updateAutosavePaths(AUTOSAVE_PATH, SIDECAR_PATH);
      (deps.writeFileSync as ReturnType<typeof vi.fn>).mockClear();

      manager.clearAutosavePaths();

      const writtenData = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const parsed = JSON.parse(writtenData) as SessionRecoveryRecord;
      expect(parsed.sourceFilePath).toBe(SOURCE_PATH);
      expect(parsed.sourceFileType).toBe('charx');
      expect(parsed.latestAutosavePath).toBeNull();
      expect(parsed.latestAutosaveMetaPath).toBeNull();
      expect(parsed.cleanExit).toBe(false);
    });

    it('does not write to disk when there is no active record', () => {
      const manager = createSessionRecoveryManager(deps);

      manager.clearAutosavePaths();

      expect(deps.writeFileSync).not.toHaveBeenCalled();
    });
  });

  // ── markCleanExit ─────────────────────────────────────────────────

  describe('markCleanExit', () => {
    it('writes a clean-exit record', async () => {
      const manager = createSessionRecoveryManager(deps);
      await manager.markDocumentActive(SOURCE_PATH, 'charx');
      (deps.writeFileSync as ReturnType<typeof vi.fn>).mockClear();

      manager.markCleanExit();

      const writtenData = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const parsed = JSON.parse(writtenData) as SessionRecoveryRecord;
      expect(parsed.cleanExit).toBe(true);
    });

    it('writes a clean-exit record even when no document was active', () => {
      const manager = createSessionRecoveryManager(deps);
      manager.markCleanExit();

      expect(deps.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('session-recovery.json'),
        expect.stringContaining('"cleanExit":true'),
      );
    });
  });

  // ── getPendingRecovery ────────────────────────────────────────────

  describe('getPendingRecovery', () => {
    it('returns a pending recovery candidate when the previous session was interrupted and files still exist', async () => {
      const record = makeRecord({ latestAutosaveMetaPath: null });
      const provenance = makeProvenance();

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          if (p === SIDECAR_PATH) return JSON.stringify(provenance);
          return '{}';
        }),
        existsSync: vi.fn(() => true),
        statSync: vi.fn(() => ({ mtimeMs: 2000 })),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).not.toBeNull();
      expect(candidate?.autosavePath).toContain('_autosave_');
      expect(candidate?.sourceFilePath).toBe(SOURCE_PATH);
    });

    it('returns null when the previous session exited cleanly', async () => {
      const record = makeRecord({ cleanExit: true });

      deps = makeDeps({
        readFileSync: vi.fn(() => JSON.stringify(record)),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('returns null when the recovery record does not exist', async () => {
      deps = makeDeps({
        existsSync: vi.fn((p: string) => p !== RECORD_PATH),
        readFileSync: vi.fn(() => {
          throw new Error('ENOENT');
        }),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('returns null when the original source file no longer exists', async () => {
      const record = makeRecord();
      const provenance = makeProvenance();
      const unlinkSync = vi.fn();

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          if (p === SIDECAR_PATH) return JSON.stringify(provenance);
          return '{}';
        }),
        existsSync: vi.fn((p: string) => p !== SOURCE_PATH),
        unlinkSync,
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
      expect(deps.writeFileSync).not.toHaveBeenCalled();
      expect(unlinkSync).not.toHaveBeenCalled();
    });

    it('returns null when the autosave artifact no longer exists', async () => {
      const record = makeRecord();

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          return '{}';
        }),
        existsSync: vi.fn((p: string) => p !== AUTOSAVE_PATH),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('returns null when the sidecar file does not exist', async () => {
      const record = makeRecord();

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          return '{}';
        }),
        existsSync: vi.fn((p: string) => p !== SIDECAR_PATH),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('returns null when the sidecar JSON is malformed', async () => {
      const record = makeRecord();

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          if (p === SIDECAR_PATH) return '<<<not json>>>';
          return '{}';
        }),
        existsSync: vi.fn(() => true),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('returns null when the recovery record JSON is malformed', async () => {
      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return '{"latestAutosavePath":';
          return '{}';
        }),
        existsSync: vi.fn(() => true),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
      expect(deps.statSync).not.toHaveBeenCalled();
    });

    it('returns null for invalid recovery record shapes without probing arbitrary paths', async () => {
      const invalidRecord = {
        sourceFilePath: SOURCE_PATH,
        sourceFileType: 'charx',
        latestAutosavePath: { path: AUTOSAVE_PATH },
        latestAutosaveMetaPath: SIDECAR_PATH,
        cleanExit: false,
        updatedAt: '2026-04-01T10:00:00.000Z',
      };

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(invalidRecord);
          return '{}';
        }),
        existsSync: vi.fn(() => true),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
      expect(deps.existsSync).toHaveBeenCalledWith(RECORD_PATH);
      expect(deps.existsSync).not.toHaveBeenCalledWith(SOURCE_PATH);
      expect(deps.existsSync).not.toHaveBeenCalledWith(AUTOSAVE_PATH);
    });

    it('returns null when the sidecar has an invalid provenance shape', async () => {
      const record = makeRecord();
      const invalidProvenance = {
        ...makeProvenance(),
        dirtyFields: 'description',
      };

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          if (p === SIDECAR_PATH) return JSON.stringify(invalidProvenance);
          return '{}';
        }),
        existsSync: vi.fn(() => true),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('returns null when the sidecar source path disagrees with the record', async () => {
      const record = makeRecord();
      const provenance = makeProvenance({ sourceFilePath: 'C:\\other\\different.charx' });

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          if (p === SIDECAR_PATH) return JSON.stringify(provenance);
          return '{}';
        }),
        existsSync: vi.fn(() => true),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('returns null when the sidecar autosave path disagrees with the record', async () => {
      const record = makeRecord();
      const provenance = makeProvenance({ autosavePath: 'C:\\cards\\wrong_autosave.charx' });

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          if (p === SIDECAR_PATH) return JSON.stringify(provenance);
          return '{}';
        }),
        existsSync: vi.fn(() => true),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('returns null when the sidecar file type disagrees with the record', async () => {
      const record = makeRecord({ sourceFileType: 'charx' });
      const provenance = makeProvenance({ sourceFileType: 'risum' });

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          if (p === SIDECAR_PATH) return JSON.stringify(provenance);
          return '{}';
        }),
        existsSync: vi.fn(() => true),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('returns null when the record has no autosave path', async () => {
      const record = makeRecord({ latestAutosavePath: null });

      deps = makeDeps({
        readFileSync: vi.fn(() => JSON.stringify(record)),
        existsSync: vi.fn(() => true),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('returns null when the record has no source file path', async () => {
      const record = makeRecord({ sourceFilePath: null });

      deps = makeDeps({
        readFileSync: vi.fn(() => JSON.stringify(record)),
        existsSync: vi.fn(() => true),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).toBeNull();
    });

    it('populates staleness metadata on the candidate', async () => {
      const nowMs = Date.now();
      const record = makeRecord();
      const provenance = makeProvenance();

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          if (p === SIDECAR_PATH) return JSON.stringify(provenance);
          return '{}';
        }),
        existsSync: vi.fn(() => true),
        statSync: vi.fn((p: string) => {
          if (p === SOURCE_PATH) return { mtimeMs: nowMs };
          if (p === AUTOSAVE_PATH) return { mtimeMs: nowMs - 1000 };
          return { mtimeMs: 0 };
        }),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).not.toBeNull();
      expect(candidate!.originalMtimeMs).toBe(nowMs);
      expect(candidate!.autosaveMtimeMs).toBe(nowMs - 1000);
      expect(candidate!.staleWarning).toBeNull();
    });

    it('adds a stale warning when the autosave is too old', async () => {
      const nowMs = Date.now();
      const record = makeRecord();
      const provenance = makeProvenance();

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          if (p === SIDECAR_PATH) return JSON.stringify(provenance);
          return '{}';
        }),
        existsSync: vi.fn(() => true),
        statSync: vi.fn((p: string) => {
          if (p === SOURCE_PATH) return { mtimeMs: nowMs };
          if (p === AUTOSAVE_PATH) return { mtimeMs: nowMs - STALE_THRESHOLD_MS - 1 };
          return { mtimeMs: 0 };
        }),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).not.toBeNull();
      expect(candidate!.staleWarning).toContain('stale');
    });

    it('handles statSync failure gracefully by setting mtime to null', async () => {
      const record = makeRecord();
      const provenance = makeProvenance();

      deps = makeDeps({
        readFileSync: vi.fn((p: string) => {
          if (p === RECORD_PATH) return JSON.stringify(record);
          if (p === SIDECAR_PATH) return JSON.stringify(provenance);
          return '{}';
        }),
        existsSync: vi.fn(() => true),
        statSync: vi.fn(() => {
          throw new Error('EACCES');
        }),
      });

      const manager = createSessionRecoveryManager(deps);
      const candidate = await manager.getPendingRecovery();

      expect(candidate).not.toBeNull();
      expect(candidate!.originalMtimeMs).toBeNull();
      expect(candidate!.autosaveMtimeMs).toBeNull();
    });
  });

  // ── restoreFromRecovery ───────────────────────────────────────────

  describe('restoreFromRecovery', () => {
    it('loads autosave data and binds it to the original source path', async () => {
      const autosaveData = { name: 'Hero (recovered)' };
      deps = makeDeps({
        openDocument: vi.fn(() => autosaveData),
      });

      const candidate = {
        sourceFilePath: SOURCE_PATH,
        autosavePath: AUTOSAVE_PATH,
        provenance: makeProvenance(),
        staleWarning: null,
        originalMtimeMs: 2000,
        autosaveMtimeMs: 1000,
      };

      const manager = createSessionRecoveryManager(deps);
      await manager.restoreFromRecovery(candidate);

      expect(deps.openDocument).toHaveBeenCalledWith(AUTOSAVE_PATH);
      expect(deps.setCurrentDocument).toHaveBeenCalledWith(SOURCE_PATH, autosaveData);
    });

    it('re-seeds the in-memory record for follow-up autosave tracking', async () => {
      deps = makeDeps({
        openDocument: vi.fn(() => ({ name: 'Hero' })),
      });

      const candidate = {
        sourceFilePath: SOURCE_PATH,
        autosavePath: AUTOSAVE_PATH,
        provenance: makeProvenance(),
        staleWarning: null,
        originalMtimeMs: 2000,
        autosaveMtimeMs: 1000,
      };

      const manager = createSessionRecoveryManager(deps);
      await manager.restoreFromRecovery(candidate);
      (deps.writeFileSync as ReturnType<typeof vi.fn>).mockClear();

      await manager.updateAutosavePaths(
        'C:\\cards\\hero_autosave_20260402.charx',
        'C:\\cards\\hero_autosave_20260402.charx.toki-recovery.json',
      );

      const writtenData = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const parsed = JSON.parse(writtenData) as SessionRecoveryRecord;
      expect(parsed.sourceFilePath).toBe(SOURCE_PATH);
      expect(parsed.latestAutosavePath).toBe('C:\\cards\\hero_autosave_20260402.charx');
    });

    it('clears the pending candidate after restore', async () => {
      deps = makeDeps({
        openDocument: vi.fn(() => ({ name: 'Hero' })),
      });

      const candidate = {
        sourceFilePath: SOURCE_PATH,
        autosavePath: AUTOSAVE_PATH,
        provenance: makeProvenance(),
        staleWarning: null,
        originalMtimeMs: 2000,
        autosaveMtimeMs: 1000,
      };

      const manager = createSessionRecoveryManager(deps);
      await manager.restoreFromRecovery(candidate);

      // After restoring, getPendingRecovery should return null
      const afterCandidate = await manager.getPendingRecovery();
      expect(afterCandidate).toBeNull();
    });

    it('preserves recovery provenance in manager state', async () => {
      deps = makeDeps({
        openDocument: vi.fn(() => ({ name: 'Hero' })),
      });

      const provenance = makeProvenance();
      const candidate = {
        sourceFilePath: SOURCE_PATH,
        autosavePath: AUTOSAVE_PATH,
        provenance,
        staleWarning: null,
        originalMtimeMs: 2000,
        autosaveMtimeMs: 1000,
      };

      const manager = createSessionRecoveryManager(deps);
      await manager.restoreFromRecovery(candidate);

      expect(manager.getLastRestoredProvenance()).toEqual(provenance);
    });
  });

  // ── openOriginal ──────────────────────────────────────────────────

  describe('openOriginal', () => {
    it('loads the original file and sets it as the current document', async () => {
      const originalData = { name: 'Hero (original)' };
      deps = makeDeps({
        openDocument: vi.fn(() => originalData),
      });

      const candidate = {
        sourceFilePath: SOURCE_PATH,
        autosavePath: AUTOSAVE_PATH,
        provenance: makeProvenance(),
        staleWarning: null,
        originalMtimeMs: 2000,
        autosaveMtimeMs: 1000,
      };

      const manager = createSessionRecoveryManager(deps);
      await manager.openOriginal(candidate);

      expect(deps.openDocument).toHaveBeenCalledWith(SOURCE_PATH);
      expect(deps.setCurrentDocument).toHaveBeenCalledWith(SOURCE_PATH, originalData);
    });

    it('clears the pending candidate after opening original', async () => {
      deps = makeDeps({
        openDocument: vi.fn(() => ({ name: 'Hero' })),
      });

      const candidate = {
        sourceFilePath: SOURCE_PATH,
        autosavePath: AUTOSAVE_PATH,
        provenance: makeProvenance(),
        staleWarning: null,
        originalMtimeMs: 2000,
        autosaveMtimeMs: 1000,
      };

      const manager = createSessionRecoveryManager(deps);
      await manager.openOriginal(candidate);

      const afterCandidate = await manager.getPendingRecovery();
      expect(afterCandidate).toBeNull();
    });

    it('does not preserve recovery provenance', async () => {
      deps = makeDeps({
        openDocument: vi.fn(() => ({ name: 'Hero' })),
      });

      const candidate = {
        sourceFilePath: SOURCE_PATH,
        autosavePath: AUTOSAVE_PATH,
        provenance: makeProvenance(),
        staleWarning: null,
        originalMtimeMs: 2000,
        autosaveMtimeMs: 1000,
      };

      const manager = createSessionRecoveryManager(deps);
      await manager.openOriginal(candidate);

      expect(manager.getLastRestoredProvenance()).toBeNull();
    });

    it('clears autosave paths when opening the original file', async () => {
      deps = makeDeps({
        openDocument: vi.fn(() => ({ name: 'Hero' })),
      });

      const candidate = {
        sourceFilePath: SOURCE_PATH,
        autosavePath: AUTOSAVE_PATH,
        provenance: makeProvenance(),
        staleWarning: null,
        originalMtimeMs: 2000,
        autosaveMtimeMs: 1000,
      };

      const manager = createSessionRecoveryManager(deps);
      await manager.openOriginal(candidate);

      const writtenData = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1];
      const parsed = JSON.parse(writtenData) as SessionRecoveryRecord;
      expect(parsed.latestAutosavePath).toBeNull();
      expect(parsed.latestAutosaveMetaPath).toBeNull();
    });
  });

  // ── ignoreRecovery ────────────────────────────────────────────────

  describe('ignoreRecovery', () => {
    it('clears the pending candidate for this launch', async () => {
      const manager = createSessionRecoveryManager(deps);
      manager.ignoreRecovery();

      const afterCandidate = await manager.getPendingRecovery();
      expect(afterCandidate).toBeNull();
    });

    it('does not delete autosave files from disk', () => {
      const manager = createSessionRecoveryManager(deps);
      manager.ignoreRecovery();

      expect(deps.unlinkSync).not.toHaveBeenCalled();
    });

    it('does not preserve recovery provenance', () => {
      const manager = createSessionRecoveryManager(deps);
      manager.ignoreRecovery();

      expect(manager.getLastRestoredProvenance()).toBeNull();
    });
  });
});
