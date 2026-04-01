/**
 * Pure session-recovery helpers.
 *
 * No Electron APIs, no filesystem side effects.
 * Reusable by both autosave and recovery-manager code.
 */

export type RecoveryFileType = 'charx' | 'risum' | 'risup';

const AUTOSAVE_EXTENSION_MAP: Record<RecoveryFileType, string> = {
  charx: '.charx',
  risum: '.risum',
  risup: '.risup',
};

const SIDECAR_SUFFIX = '.toki-recovery.json';

/** If the autosave is more than 24 hours older than the original, it is stale. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// ── Type definitions ──────────────────────────────────────────────────

export interface AutosaveProvenance {
  sourceFilePath: string | null;
  sourceFileType: RecoveryFileType;
  autosavePath: string;
  savedAt: string;
  /** Metadata-only: which editor fields were dirty at autosave time. */
  dirtyFields: string[];
  appVersion: string;
}

export interface SessionRecoveryRecord {
  sourceFilePath: string | null;
  sourceFileType: RecoveryFileType | null;
  latestAutosavePath: string | null;
  latestAutosaveMetaPath: string | null;
  cleanExit: boolean;
  updatedAt: string;
}

export interface PendingRecoveryCandidate {
  sourceFilePath: string;
  autosavePath: string;
  provenance: AutosaveProvenance;
  staleWarning: string | null;
  originalMtimeMs: number | null;
  autosaveMtimeMs: number | null;
}

// ── Pure helpers ──────────────────────────────────────────────────────

export function getAutosaveExtension(fileType: RecoveryFileType): string {
  return AUTOSAVE_EXTENSION_MAP[fileType];
}

export function getAutosaveSidecarPath(autosavePath: string): string {
  return autosavePath + SIDECAR_SUFFIX;
}

/**
 * Returns `true` when the autosave artifact is considered stale — i.e. the
 * original file's mtime is more than 24 hours ahead of the autosave's mtime.
 *
 * Returns `false` when either timestamp is missing (cannot determine staleness).
 */
export function classifyRecoveryCandidateStaleness(params: {
  originalMtimeMs: number | null;
  autosaveMtimeMs: number | null;
}): boolean {
  const { originalMtimeMs, autosaveMtimeMs } = params;
  if (originalMtimeMs == null || autosaveMtimeMs == null) {
    return false;
  }
  return originalMtimeMs - autosaveMtimeMs > STALE_THRESHOLD_MS;
}
