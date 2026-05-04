/**
 * Main-process session recovery manager.
 *
 * Coordinates recovery-record lifecycle, candidate discovery, and the
 * restore / open-original / ignore decision flow.
 *
 * All filesystem access goes through the injected dependency interface so
 * the module stays testable without touching real files.
 */

import type {
  AutosaveProvenance,
  PendingRecoveryCandidate,
  RecoveryFileType,
  SessionRecoveryRecord,
} from './session-recovery';

import {
  classifyRecoveryCandidateStaleness,
  getAutosaveSidecarPath,
  getSessionRecoveryRecordPath,
} from './session-recovery';

// ── Dependency interface ──────────────────────────────────────────────

export interface SessionRecoveryManagerDeps<TDocument extends Record<string, unknown> = Record<string, unknown>> {
  readFileSync(path: string, encoding: BufferEncoding): string;
  writeFileSync(path: string, data: string): void;
  writeFileAtomicSync?: (path: string, data: string) => void;
  existsSync(path: string): boolean;
  statSync(path: string): { mtimeMs: number };
  unlinkSync(path: string): void;
  userDataPath: string;
  openDocument(filePath: string): TDocument;
  setCurrentDocument(filePath: string, data: TDocument): void;
}

// ── Manager interface ─────────────────────────────────────────────────

export interface SessionRecoveryManager {
  markDocumentActive(filePath: string, fileType: RecoveryFileType): Promise<void>;
  updateAutosavePaths(autosavePath: string, sidecarPath: string): Promise<void>;
  clearAutosavePaths(): void;
  markCleanExit(): void;
  getPendingRecovery(): Promise<PendingRecoveryCandidate | null>;
  restoreFromRecovery(candidate: PendingRecoveryCandidate): Promise<void>;
  openOriginal(candidate: PendingRecoveryCandidate): Promise<void>;
  ignoreRecovery(): void;
  getLastRestoredProvenance(): AutosaveProvenance | null;
}

// ── Factory ───────────────────────────────────────────────────────────

export function createSessionRecoveryManager<TDocument extends Record<string, unknown>>(
  deps: SessionRecoveryManagerDeps<TDocument>,
): SessionRecoveryManager {
  const recordPath = getSessionRecoveryRecordPath(deps.userDataPath);

  let currentRecord: SessionRecoveryRecord | null = null;
  let dismissed = false;
  let lastRestoredProvenance: AutosaveProvenance | null = null;

  // ── Internal helpers ──────────────────────────────────────────────

  function createRecord(
    sourceFilePath: string | null,
    sourceFileType: RecoveryFileType | null,
    latestAutosavePath: string | null,
    latestAutosaveMetaPath: string | null,
    cleanExit: boolean,
  ): SessionRecoveryRecord {
    return {
      sourceFilePath,
      sourceFileType,
      latestAutosavePath,
      latestAutosaveMetaPath,
      cleanExit,
      updatedAt: new Date().toISOString(),
    };
  }

  function writeRecord(record: SessionRecoveryRecord): void {
    const writer = deps.writeFileAtomicSync ?? deps.writeFileSync;
    writer(recordPath, JSON.stringify(record));
    currentRecord = record;
  }

  function readRecordFromDisk(): SessionRecoveryRecord | null {
    try {
      if (!deps.existsSync(recordPath)) return null;
      const raw = deps.readFileSync(recordPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      return isSessionRecoveryRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function safeMtimeMs(filePath: string): number | null {
    try {
      return deps.statSync(filePath).mtimeMs;
    } catch {
      return null;
    }
  }

  function readProvenance(sidecarPath: string): AutosaveProvenance | null {
    try {
      const raw = deps.readFileSync(sidecarPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      return isAutosaveProvenance(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function isRecoveryFileType(value: unknown): value is RecoveryFileType {
    return value === 'charx' || value === 'risum' || value === 'risup';
  }

  function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
  }

  function isSessionRecoveryRecord(value: unknown): value is SessionRecoveryRecord {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<SessionRecoveryRecord>;
    return (
      isNullableString(record.sourceFilePath) &&
      (record.sourceFileType === null || isRecoveryFileType(record.sourceFileType)) &&
      isNullableString(record.latestAutosavePath) &&
      isNullableString(record.latestAutosaveMetaPath) &&
      typeof record.cleanExit === 'boolean' &&
      typeof record.updatedAt === 'string'
    );
  }

  function isAutosaveProvenance(value: unknown): value is AutosaveProvenance {
    if (!value || typeof value !== 'object') return false;
    const provenance = value as Partial<AutosaveProvenance>;
    return (
      isNullableString(provenance.sourceFilePath) &&
      isRecoveryFileType(provenance.sourceFileType) &&
      typeof provenance.autosavePath === 'string' &&
      typeof provenance.savedAt === 'string' &&
      Array.isArray(provenance.dirtyFields) &&
      provenance.dirtyFields.every((field) => typeof field === 'string') &&
      typeof provenance.appVersion === 'string'
    );
  }

  // ── Public API ────────────────────────────────────────────────────

  return {
    async markDocumentActive(filePath, fileType) {
      writeRecord(createRecord(filePath, fileType, null, null, false));
    },

    async updateAutosavePaths(autosavePath, sidecarPath) {
      if (!currentRecord) return;
      writeRecord(
        createRecord(currentRecord.sourceFilePath, currentRecord.sourceFileType, autosavePath, sidecarPath, false),
      );
    },

    clearAutosavePaths() {
      if (!currentRecord) return;
      writeRecord(createRecord(currentRecord.sourceFilePath, currentRecord.sourceFileType, null, null, false));
    },

    markCleanExit() {
      writeRecord(
        createRecord(
          currentRecord?.sourceFilePath ?? null,
          currentRecord?.sourceFileType ?? null,
          currentRecord?.latestAutosavePath ?? null,
          currentRecord?.latestAutosaveMetaPath ?? null,
          true,
        ),
      );
    },

    async getPendingRecovery() {
      if (dismissed) return null;

      const record = readRecordFromDisk();
      if (!record) return null;
      if (record.cleanExit) return null;
      if (!record.sourceFilePath) return null;
      if (!record.latestAutosavePath) return null;

      const sidecarPath = record.latestAutosaveMetaPath ?? getAutosaveSidecarPath(record.latestAutosavePath);

      // Coherence: all three files must still exist
      if (!deps.existsSync(record.sourceFilePath)) return null;
      if (!deps.existsSync(record.latestAutosavePath)) return null;
      if (!deps.existsSync(sidecarPath)) return null;

      // Coherence: sidecar must parse and agree with the record
      const provenance = readProvenance(sidecarPath);
      if (!provenance) return null;
      if (provenance.sourceFilePath !== record.sourceFilePath) return null;
      if (provenance.autosavePath !== record.latestAutosavePath) return null;
      if (record.sourceFileType && provenance.sourceFileType !== record.sourceFileType) return null;

      // Gather staleness metadata
      const originalMtimeMs = safeMtimeMs(record.sourceFilePath);
      const autosaveMtimeMs = safeMtimeMs(record.latestAutosavePath);
      const isStale = classifyRecoveryCandidateStaleness({
        originalMtimeMs,
        autosaveMtimeMs,
      });

      const candidate: PendingRecoveryCandidate = {
        sourceFilePath: record.sourceFilePath,
        autosavePath: record.latestAutosavePath,
        provenance,
        staleWarning: isStale
          ? 'Autosave artifact is stale — the original file has been modified significantly since the autosave was created.'
          : null,
        originalMtimeMs,
        autosaveMtimeMs,
      };

      return candidate;
    },

    async restoreFromRecovery(candidate) {
      const data = deps.openDocument(candidate.autosavePath);
      deps.setCurrentDocument(candidate.sourceFilePath, data);
      writeRecord(
        createRecord(
          candidate.sourceFilePath,
          candidate.provenance.sourceFileType,
          candidate.autosavePath,
          getAutosaveSidecarPath(candidate.autosavePath),
          false,
        ),
      );
      lastRestoredProvenance = candidate.provenance;
      dismissed = true;
    },

    async openOriginal(candidate) {
      const data = deps.openDocument(candidate.sourceFilePath);
      deps.setCurrentDocument(candidate.sourceFilePath, data);
      writeRecord(createRecord(candidate.sourceFilePath, candidate.provenance.sourceFileType, null, null, false));
      lastRestoredProvenance = null;
      dismissed = true;
    },

    ignoreRecovery() {
      lastRestoredProvenance = null;
      dismissed = true;
    },

    getLastRestoredProvenance() {
      return lastRestoredProvenance;
    },
  };
}
