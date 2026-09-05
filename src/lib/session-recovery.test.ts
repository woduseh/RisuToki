import { describe, it, expect } from 'vitest';
import {
  STALE_THRESHOLD_MS,
  classifyRecoveryCandidateStaleness,
  getAutosaveExtension,
  getAutosaveSidecarPath,
  getSessionRecoveryRecordPath,
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
});
