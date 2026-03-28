import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so we can reference the fn
const { mockCleanupProfiles, mockSyncProfiles } = vi.hoisted(() => ({
  mockCleanupProfiles: vi.fn(),
  mockSyncProfiles: vi.fn((projectRoot: string) => ({
    entries: [
      {
        advisorId: 'pluni',
        filePath: `${projectRoot}/.github/agents/pluni.md`,
        hadExistingFile: false,
        originalContent: null,
      },
      {
        advisorId: 'kotone',
        filePath: `${projectRoot}/.github/agents/kotone.md`,
        hadExistingFile: false,
        originalContent: null,
      },
      {
        advisorId: 'sophia',
        filePath: `${projectRoot}/.github/agents/sophia.md`,
        hadExistingFile: false,
        originalContent: null,
      },
    ],
  })),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('./copilot-agent-profile-manager', () => ({
  cleanupAgentProfiles: mockCleanupProfiles,
  syncAgentProfiles: mockSyncProfiles,
}));

import type { AgentProfileState } from './copilot-agent-profile-manager';
import {
  cleanupAgentsMd,
  setActiveAgentProfileState,
  syncCopilotProfiles,
  _setAgentsMdRestoreStateForTesting,
  _setDepsForTesting,
} from './agents-md-manager';

// Fake deps for syncCopilotProfiles (needs a deps object set via initAgentsMdManager-like path)
// Since the module uses a module-scoped `deps` variable, we set it through the test-only helpers.
// For syncCopilotProfiles, we need to mock the deps.getCurrentFilePath() etc.
// We'll use the fact that cleanupAgentsMd() is the public entry point for cleanup.

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module state: call cleanup to clear any leftover state
  cleanupAgentsMd();
  mockCleanupProfiles.mockClear();
  mockSyncProfiles.mockClear();
});

describe('cleanupAgentsMd', () => {
  it('cleans up agent profiles even when no AGENTS.md file is active', () => {
    const fakeState: AgentProfileState = {
      entries: [
        {
          advisorId: 'pluni',
          filePath: '/fake/.github/agents/pluni.md',
          hadExistingFile: false,
          originalContent: null,
        },
      ],
    };

    // Set profile state without any active AGENTS.md file path
    setActiveAgentProfileState(fakeState);

    // Call cleanup — before the fix, this would return early and skip
    // cleanupAgentProfiles because activeAgentsFilePath is null.
    cleanupAgentsMd();

    // Profile cleanup MUST have been called with the state
    expect(mockCleanupProfiles).toHaveBeenCalledOnce();
    expect(mockCleanupProfiles).toHaveBeenCalledWith(fakeState);
  });

  it('resets activeAgentProfileState after cleanup even without AGENTS.md', () => {
    const fakeState: AgentProfileState = {
      entries: [
        {
          advisorId: 'pluni',
          filePath: '/fake/.github/agents/pluni.md',
          hadExistingFile: false,
          originalContent: null,
        },
      ],
    };

    setActiveAgentProfileState(fakeState);
    cleanupAgentsMd();

    // Second call should NOT call cleanupAgentProfiles again (state was reset)
    mockCleanupProfiles.mockClear();
    cleanupAgentsMd();
    expect(mockCleanupProfiles).not.toHaveBeenCalled();
  });

  it('resets state even when cleanupAgentProfiles throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const fakeState: AgentProfileState = {
        entries: [
          {
            advisorId: 'pluni',
            filePath: '/fake/.github/agents/pluni.md',
            hadExistingFile: false,
            originalContent: null,
          },
        ],
      };

      setActiveAgentProfileState(fakeState);
      mockCleanupProfiles.mockImplementationOnce(() => {
        throw new Error('simulated cleanup failure');
      });

      // cleanupAgentsMd should NOT throw — it should catch the error
      expect(() => cleanupAgentsMd()).not.toThrow();

      // The warning must have been emitted with the error message
      expect(warnSpy).toHaveBeenCalledWith('[main] Copilot agent-profile cleanup failed:', 'simulated cleanup failure');

      // State should still be reset, so a second call should NOT invoke cleanupAgentProfiles
      mockCleanupProfiles.mockClear();
      cleanupAgentsMd();
      expect(mockCleanupProfiles).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
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

describe('syncCopilotProfiles', () => {
  it('calls syncAgentProfiles with the current working directory and category', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/fake/project/test.charx',
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');

    expect(mockSyncProfiles).toHaveBeenCalledWith(expect.stringContaining('project'), 'solo', undefined);
  });

  it('passes previous state on re-sync within the same project', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/fake/project/test.charx',
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');
    const firstState = mockSyncProfiles.mock.results[0].value;

    syncCopilotProfiles('world-sim');

    // Second call should pass the previous state for backup preservation
    expect(mockSyncProfiles).toHaveBeenCalledTimes(2);
    expect(mockSyncProfiles).toHaveBeenLastCalledWith(expect.stringContaining('project'), 'world-sim', firstState);
  });

  it('cleans up old state when cleanup is called after sync', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/fake/project/test.charx',
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');
    const syncState = mockSyncProfiles.mock.results[0].value;

    cleanupAgentsMd();

    expect(mockCleanupProfiles).toHaveBeenCalledWith(syncState);
  });
});
