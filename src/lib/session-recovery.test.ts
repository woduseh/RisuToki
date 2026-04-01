import { describe, it, expect } from 'vitest';
import { getAutosaveExtension, getAutosaveSidecarPath, classifyRecoveryCandidateStaleness } from './session-recovery';

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

  describe('classifyRecoveryCandidateStaleness', () => {
    it('marks a candidate stale when autosave is over 24 hours older than the original', () => {
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      expect(
        classifyRecoveryCandidateStaleness({
          originalMtimeMs: twentyFourHoursMs + 200_000,
          autosaveMtimeMs: 100_000,
        }),
      ).toBeTruthy();
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
