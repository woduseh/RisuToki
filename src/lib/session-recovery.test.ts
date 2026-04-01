import { describe, it, expect } from 'vitest';
import {
  STALE_THRESHOLD_MS,
  classifyRecoveryCandidateStaleness,
  getAutosaveExtension,
  getAutosaveSidecarPath,
  getSessionRecoveryRecordPath,
  selectLatestViableRecoveryCandidate,
  type PendingRecoveryCandidate,
} from './session-recovery';

describe('session-recovery helpers', () => {
  describe('getAutosaveExtension', () => {
    it('maps file types to matching autosave extensions', () => {
      expect(getAutosaveExtension('charx')).toBe('.charx');
      expect(getAutosaveExtension('risum')).toBe('.risum');
      expect(getAutosaveExtension('risup')).toBe('.risup');
    });
  });

  describe('getAutosaveSidecarPath', () => {
    it('derives the sidecar path from the autosave artifact path', () => {
      expect(getAutosaveSidecarPath('C:\\temp\\card_autosave_20260401.charx')).toBe(
        'C:\\temp\\card_autosave_20260401.charx.toki-recovery.json',
      );
    });
  });

  describe('getSessionRecoveryRecordPath', () => {
    it('derives the recovery record path from the user data directory', () => {
      expect(getSessionRecoveryRecordPath('C:\\Users\\wodus\\AppData\\Roaming\\RisuToki')).toBe(
        'C:\\Users\\wodus\\AppData\\Roaming\\RisuToki\\session-recovery.json',
      );
    });

    it('avoids duplicate separators when the user data directory already ends with one', () => {
      expect(getSessionRecoveryRecordPath('C:\\Users\\wodus\\AppData\\Roaming\\RisuToki\\')).toBe(
        'C:\\Users\\wodus\\AppData\\Roaming\\RisuToki\\session-recovery.json',
      );
    });
  });

  describe('classifyRecoveryCandidateStaleness', () => {
    it('marks a candidate stale when autosave is over 24 hours older than the original', () => {
      expect(
        classifyRecoveryCandidateStaleness({
          originalMtimeMs: STALE_THRESHOLD_MS + 200_000,
          autosaveMtimeMs: 100_000,
        }),
      ).toBeTruthy();
    });

    it('does not mark a candidate stale when the gap is exactly 24 hours', () => {
      expect(
        classifyRecoveryCandidateStaleness({
          originalMtimeMs: STALE_THRESHOLD_MS + 100_000,
          autosaveMtimeMs: 100_000,
        }),
      ).toBe(false);
    });

    it('marks a candidate stale when the gap exceeds 24 hours by 1 ms', () => {
      expect(
        classifyRecoveryCandidateStaleness({
          originalMtimeMs: STALE_THRESHOLD_MS + 100_001,
          autosaveMtimeMs: 100_000,
        }),
      ).toBe(true);
    });

    it('marks a candidate fresh when autosave is within 24 hours of the original', () => {
      const now = Date.now();
      expect(
        classifyRecoveryCandidateStaleness({
          originalMtimeMs: now,
          autosaveMtimeMs: now - 1000,
        }),
      ).toBeFalsy();
    });

    it('returns false when either mtime is null', () => {
      expect(
        classifyRecoveryCandidateStaleness({
          originalMtimeMs: null,
          autosaveMtimeMs: 100_000,
        }),
      ).toBeFalsy();
      expect(
        classifyRecoveryCandidateStaleness({
          originalMtimeMs: 200_000,
          autosaveMtimeMs: null,
        }),
      ).toBeFalsy();
    });
  });

  describe('selectLatestViableRecoveryCandidate', () => {
    function createCandidate(overrides: Partial<PendingRecoveryCandidate>): PendingRecoveryCandidate {
      return {
        sourceFilePath: 'C:\\cards\\hero.charx',
        autosavePath: 'C:\\cards\\hero_autosave_20260401.charx',
        provenance: {
          sourceFilePath: 'C:\\cards\\hero.charx',
          sourceFileType: 'charx',
          autosavePath: 'C:\\cards\\hero_autosave_20260401.charx',
          savedAt: '2026-04-01T10:00:00.000Z',
          dirtyFields: ['description'],
          appVersion: '0.31.0',
        },
        staleWarning: null,
        originalMtimeMs: 2_000,
        autosaveMtimeMs: 1_000,
        ...overrides,
      };
    }

    it('returns the latest candidate by autosave mtime when available', () => {
      const olderCandidate = createCandidate({
        autosavePath: 'C:\\cards\\older_autosave_20260401.charx',
        autosaveMtimeMs: 1_000,
        provenance: {
          ...createCandidate({}).provenance,
          autosavePath: 'C:\\cards\\older_autosave_20260401.charx',
          savedAt: '2026-04-01T09:00:00.000Z',
        },
      });
      const newerCandidate = createCandidate({
        autosavePath: 'C:\\cards\\newer_autosave_20260401.charx',
        autosaveMtimeMs: 2_000,
        provenance: {
          ...createCandidate({}).provenance,
          autosavePath: 'C:\\cards\\newer_autosave_20260401.charx',
          savedAt: '2026-04-01T10:00:00.000Z',
        },
      });

      expect(selectLatestViableRecoveryCandidate([olderCandidate, newerCandidate])).toBe(newerCandidate);
    });

    it('falls back to provenance savedAt when autosave mtime is missing', () => {
      const olderCandidate = createCandidate({
        autosavePath: 'C:\\cards\\older_autosave_20260401.charx',
        autosaveMtimeMs: null,
        provenance: {
          ...createCandidate({}).provenance,
          autosavePath: 'C:\\cards\\older_autosave_20260401.charx',
          savedAt: '2026-04-01T09:00:00.000Z',
        },
      });
      const newerCandidate = createCandidate({
        autosavePath: 'C:\\cards\\newer_autosave_20260401.charx',
        autosaveMtimeMs: null,
        provenance: {
          ...createCandidate({}).provenance,
          autosavePath: 'C:\\cards\\newer_autosave_20260401.charx',
          savedAt: '2026-04-01T10:00:00.000Z',
        },
      });

      expect(selectLatestViableRecoveryCandidate([olderCandidate, newerCandidate])).toBe(newerCandidate);
    });

    it('returns null when there are no viable candidates', () => {
      expect(selectLatestViableRecoveryCandidate([])).toBeNull();
    });

    it('treats invalid savedAt metadata as older than valid candidates', () => {
      const invalidCandidate = createCandidate({
        autosavePath: 'C:\\cards\\invalid_autosave_20260401.charx',
        autosaveMtimeMs: null,
        provenance: {
          ...createCandidate({}).provenance,
          autosavePath: 'C:\\cards\\invalid_autosave_20260401.charx',
          savedAt: 'not-a-date',
        },
      });
      const validCandidate = createCandidate({
        autosavePath: 'C:\\cards\\valid_autosave_20260401.charx',
        autosaveMtimeMs: null,
        provenance: {
          ...createCandidate({}).provenance,
          autosavePath: 'C:\\cards\\valid_autosave_20260401.charx',
          savedAt: '2026-04-01T10:00:00.000Z',
        },
      });

      expect(selectLatestViableRecoveryCandidate([invalidCandidate, validCandidate])).toBe(validCandidate);
    });
  });
});
