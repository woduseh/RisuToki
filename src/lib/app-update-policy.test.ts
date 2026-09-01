// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  isNewerStableVersion,
  normalizeStableVersion,
  parseStableVersion,
  shouldPromptForUpdate,
} from './app-update-policy';

describe('application update policy', () => {
  it('normalizes stable release tags', () => {
    expect(parseStableVersion('v3.1.0')).toEqual({ major: 3, minor: 1, patch: 0 });
    expect(normalizeStableVersion('v3.1.0')).toBe('3.1.0');
    expect(normalizeStableVersion('v3.1.0-beta.1')).toBeNull();
  });

  it('compares major, minor, and patch versions numerically', () => {
    expect(isNewerStableVersion('3.1.0', '3.0.9')).toBe(true);
    expect(isNewerStableVersion('3.0.10', '3.0.9')).toBe(true);
    expect(isNewerStableVersion('3.0.1', '3.0.1')).toBe(false);
    expect(isNewerStableVersion('2.9.9', '3.0.0')).toBe(false);
  });

  it('prompts only once for each newer latest release', () => {
    expect(shouldPromptForUpdate({ latestVersion: '3.1.0', currentVersion: '3.0.1', lastPromptedVersion: null })).toBe(
      true,
    );
    expect(
      shouldPromptForUpdate({ latestVersion: '3.1.0', currentVersion: '3.0.1', lastPromptedVersion: '3.1.0' }),
    ).toBe(false);
    expect(
      shouldPromptForUpdate({ latestVersion: '3.1.1', currentVersion: '3.0.1', lastPromptedVersion: '3.1.0' }),
    ).toBe(true);
  });
});
