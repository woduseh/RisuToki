import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

import { cleanupAgentsMd, _setAgentsMdRestoreStateForTesting } from './agents-md-manager';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module state: call cleanup to clear any leftover state
  cleanupAgentsMd();
});

describe('AGENTS.md null-guard restore', () => {
  it('skips restore and warns when originalContent is null despite hadExistingFile', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      // Set up inconsistent state: file path set, had existing file, but content is null
      _setAgentsMdRestoreStateForTesting('/fake/AGENTS.md', true, null);

      cleanupAgentsMd();

      // Should have warned about the skipped restore (not "cleanup failed" from a throw)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md restore skipped'));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
