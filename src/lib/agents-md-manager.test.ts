import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so we can reference the fn
const { mockCleanupProfiles, mockSyncProfiles } = vi.hoisted(() => ({
  mockCleanupProfiles: vi.fn(),
  mockSyncProfiles: vi.fn((projectRoot: string) => ({
    entries: [
      {
        advisorId: 'pluni',
        filePath: `${projectRoot}/.github/agents/pluni.agent.md`,
        hadExistingFile: false,
        originalContent: null,
        legacyFilePath: null,
        legacyOriginalContent: null,
      },
      {
        advisorId: 'kotone',
        filePath: `${projectRoot}/.github/agents/kotone.agent.md`,
        hadExistingFile: false,
        originalContent: null,
        legacyFilePath: null,
        legacyOriginalContent: null,
      },
      {
        advisorId: 'sophia',
        filePath: `${projectRoot}/.github/agents/sophia.agent.md`,
        hadExistingFile: false,
        originalContent: null,
        legacyFilePath: null,
        legacyOriginalContent: null,
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
import { CHATBOT_CATEGORIES } from './pluni-persona';

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
          filePath: '/fake/.github/agents/pluni.agent.md',
          hadExistingFile: false,
          originalContent: null,
          legacyFilePath: null,
          legacyOriginalContent: null,
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
          filePath: '/fake/.github/agents/pluni.agent.md',
          hadExistingFile: false,
          originalContent: null,
          legacyFilePath: null,
          legacyOriginalContent: null,
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
            filePath: '/fake/.github/agents/pluni.agent.md',
            hadExistingFile: false,
            originalContent: null,
            legacyFilePath: null,
            legacyOriginalContent: null,
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
      getTerminalCwd: () => null,
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');

    expect(mockSyncProfiles).toHaveBeenCalledWith('/fake/project', 'solo', undefined);
  });

  it('passes previous state on re-sync within the same project', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/fake/project/test.charx',
      getTerminalCwd: () => null,
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');
    const firstState = mockSyncProfiles.mock.results[0].value;

    syncCopilotProfiles('world-sim');

    // Second call should pass the previous state for backup preservation
    expect(mockSyncProfiles).toHaveBeenCalledTimes(2);
    expect(mockSyncProfiles).toHaveBeenLastCalledWith('/fake/project', 'world-sim', firstState);
  });

  it('cleans old state when switching between similarly-prefixed project roots', () => {
    // First sync in /fake/app-beta
    _setDepsForTesting({
      getCurrentFilePath: () => '/fake/app-beta/test.charx',
      getTerminalCwd: () => null,
      getDirname: () => '/fake/electron',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');
    const betaState = mockSyncProfiles.mock.results[0].value;
    expect(mockCleanupProfiles).not.toHaveBeenCalled();

    // Switch to /fake/app — a strict prefix of /fake/app-beta.
    // With the old startsWith check, the existing entry path
    // "/fake/app-beta/.github/agents/pluni.md".startsWith("/fake/app")
    // would be TRUE, so cleanup would be SKIPPED (leaving stale files).
    _setDepsForTesting({
      getCurrentFilePath: () => '/fake/app/test.charx',
      getTerminalCwd: () => null,
      getDirname: () => '/fake/electron',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('world-sim');

    // Old state MUST have been cleaned up before syncing the new root
    expect(mockCleanupProfiles).toHaveBeenCalledOnce();
    expect(mockCleanupProfiles).toHaveBeenCalledWith(betaState);

    // New sync should use undefined (no previous state) since we switched roots
    expect(mockSyncProfiles).toHaveBeenLastCalledWith(expect.any(String), 'world-sim', undefined);
  });

  it('cleans up old state when cleanup is called after sync', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/fake/project/test.charx',
      getTerminalCwd: () => null,
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');
    const syncState = mockSyncProfiles.mock.results[0].value;

    cleanupAgentsMd();

    expect(mockCleanupProfiles).toHaveBeenCalledWith(syncState);
  });

  it('normalises an invalid category to "solo"', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/fake/project/test.charx',
      getTerminalCwd: () => null,
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    // Simulate the IPC handler's validation: an unknown string must
    // fall back to 'solo' instead of being blindly cast.
    const bogus = 'not-a-real-category';
    expect((CHATBOT_CATEGORIES as readonly string[]).includes(bogus)).toBe(false);

    const validated = (CHATBOT_CATEGORIES as readonly string[]).includes(bogus) ? (bogus as 'solo') : 'solo';
    syncCopilotProfiles(validated);

    expect(mockSyncProfiles).toHaveBeenCalledWith('/fake/project', 'solo', undefined);
  });
});

// ---------------------------------------------------------------------------
// Root resolution priority: explicit > terminalCwd > currentFilePath > cwd
// ---------------------------------------------------------------------------
describe('root resolution priority', () => {
  it('prefers explicit projectRoot over terminal cwd and currentFilePath', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/file-based/project/test.charx',
      getTerminalCwd: () => '/terminal-based/project',
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo', '/explicit/project');

    expect(mockSyncProfiles).toHaveBeenCalledWith('/explicit/project', 'solo', undefined);
  });

  it('uses terminal cwd when no explicit root is provided', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/file-based/project/test.charx',
      getTerminalCwd: () => '/terminal-based/project',
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');

    expect(mockSyncProfiles).toHaveBeenCalledWith('/terminal-based/project', 'solo', undefined);
  });

  it('falls back to currentFilePath dir when no terminal cwd', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/file-based/project/test.charx',
      getTerminalCwd: () => null,
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');

    expect(mockSyncProfiles).toHaveBeenCalledWith('/file-based/project', 'solo', undefined);
  });

  it('falls back to process.cwd() when no root sources are available', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => null,
      getTerminalCwd: () => null,
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');

    // Should use process.cwd() as the root
    expect(mockSyncProfiles).toHaveBeenCalledWith(process.cwd(), 'solo', undefined);
  });

  it('ignores empty-string explicit root and falls back to terminal cwd', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/file-based/project/test.charx',
      getTerminalCwd: () => '/terminal-based/project',
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo', '');

    expect(mockSyncProfiles).toHaveBeenCalledWith('/terminal-based/project', 'solo', undefined);
  });

  it('ignores relative explicit root and falls through to terminal cwd', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/file-based/project/test.charx',
      getTerminalCwd: () => '/terminal-based/project',
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo', 'relative/path');

    expect(mockSyncProfiles).toHaveBeenCalledWith('/terminal-based/project', 'solo', undefined);
  });

  it('ignores relative terminal cwd and falls through to currentFilePath', () => {
    _setDepsForTesting({
      getCurrentFilePath: () => '/file-based/project/test.charx',
      getTerminalCwd: () => 'relative/garbage',
      getDirname: () => '/fake/app',
      getGuidesDir: () => '/fake/guides',
    });

    syncCopilotProfiles('solo');

    expect(mockSyncProfiles).toHaveBeenCalledWith('/file-based/project', 'solo', undefined);
  });
});
