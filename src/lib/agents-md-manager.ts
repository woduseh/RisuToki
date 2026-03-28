import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { cleanupAgentProfiles, syncAgentProfiles, type AgentProfileState } from './copilot-agent-profile-manager';
import type { ChatbotCategory } from './pluni-persona';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AgentsMdDeps {
  getCurrentFilePath: () => string | null;
  getDirname: () => string;
  getGuidesDir: () => string;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: AgentsMdDeps;
let activeAgentsFilePath: string | null = null;
let activeAgentsOriginalContent: string | null = null;
let activeAgentsHadExistingFile = false;

/** Tracked Copilot agent-profile state for session-lifetime cleanup. */
let activeAgentProfileState: AgentProfileState | null = null;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

export function cleanupAgentsMd(): void {
  try {
    if (!activeAgentsFilePath) {
      // No AGENTS.md to restore — skip file I/O but still clean up profiles below.
    } else if (activeAgentsHadExistingFile) {
      if (activeAgentsOriginalContent !== null) {
        fs.writeFileSync(activeAgentsFilePath, activeAgentsOriginalContent, 'utf-8');
      } else {
        console.warn('[main] AGENTS.md restore skipped: original content missing despite pre-existing file flag');
      }
    } else if (fs.existsSync(activeAgentsFilePath)) {
      fs.unlinkSync(activeAgentsFilePath);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[main] Agents.md cleanup failed:', msg);
  }

  // Delegate Copilot agent-profile cleanup (same resilience as AGENTS.md above)
  if (activeAgentProfileState) {
    try {
      cleanupAgentProfiles(activeAgentProfileState);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[main] Copilot agent-profile cleanup failed:', msg);
    } finally {
      activeAgentProfileState = null;
    }
  }

  activeAgentsFilePath = null;
  activeAgentsOriginalContent = null;
  activeAgentsHadExistingFile = false;
}

function readProjectGuideContent(cwd: string, agentsPath: string): string {
  if (activeAgentsFilePath === agentsPath && typeof activeAgentsOriginalContent === 'string') {
    return activeAgentsOriginalContent;
  }

  if (fs.existsSync(agentsPath)) {
    return fs.readFileSync(agentsPath, 'utf-8');
  }

  const claudePath = path.join(cwd, 'CLAUDE.md');
  if (fs.existsSync(claudePath)) {
    return fs.readFileSync(claudePath, 'utf-8');
  }

  const bundledAgentsPath = path.join(deps.getDirname(), 'AGENTS.md');
  if (fs.existsSync(bundledAgentsPath)) {
    return fs.readFileSync(bundledAgentsPath, 'utf-8');
  }

  const bundledClaudePath = path.join(deps.getDirname(), 'CLAUDE.md');
  if (fs.existsSync(bundledClaudePath)) {
    return fs.readFileSync(bundledClaudePath, 'utf-8');
  }

  const guidesClaudePath = path.join(deps.getGuidesDir(), 'CLAUDE.md');
  if (fs.existsSync(guidesClaudePath)) {
    return fs.readFileSync(guidesClaudePath, 'utf-8');
  }

  return '';
}

function buildAgentsDocument(sessionContent: string | null, projectGuideContent: string | null): string {
  const sections: string[] = [];
  const trimmedSessionContent = String(sessionContent || '').trim();
  const trimmedProjectGuide = String(projectGuideContent || '').trim();

  if (trimmedSessionContent) {
    sections.push(`# RisuToki Session Context\n\n${trimmedSessionContent}`);
  }

  if (trimmedProjectGuide) {
    sections.push(trimmedProjectGuide);
  }

  return sections.join('\n\n---\n\n');
}

function writeAgentsMd(content: string): string | null {
  const cwd = deps.getCurrentFilePath() ? path.dirname(deps.getCurrentFilePath()!) : process.cwd();
  const agentsPath = path.join(cwd, 'AGENTS.md');

  if (activeAgentsFilePath && activeAgentsFilePath !== agentsPath) {
    cleanupAgentsMd();
  }

  if (activeAgentsFilePath !== agentsPath) {
    activeAgentsHadExistingFile = fs.existsSync(agentsPath);
    activeAgentsOriginalContent = activeAgentsHadExistingFile ? fs.readFileSync(agentsPath, 'utf-8') : null;
  }

  const projectGuideContent = readProjectGuideContent(cwd, agentsPath);
  const finalContent = buildAgentsDocument(content, projectGuideContent);
  if (!finalContent.trim()) {
    cleanupAgentsMd();
    return null;
  }

  fs.writeFileSync(agentsPath, finalContent, 'utf-8');
  activeAgentsFilePath = agentsPath;
  console.log('[main] AGENTS.md written:', agentsPath);
  return agentsPath;
}

// ---------------------------------------------------------------------------
// Copilot agent-profile state setter (for later integration)
// ---------------------------------------------------------------------------

/**
 * Store the active Copilot agent-profile state so `cleanupAgentsMd()`
 * can restore/delete the files when the session ends.
 */
export function setActiveAgentProfileState(state: AgentProfileState | null): void {
  activeAgentProfileState = state;
}

/**
 * Derive the project root from the currently open file (same convention
 * as AGENTS.md placement), then sync Copilot custom-agent profiles for
 * the selected chatbot category.
 *
 * Preserves previous-state backups on re-sync in the same project root.
 * Cleans old profile state first if switching project roots.
 */
export function syncCopilotProfiles(category: ChatbotCategory): void {
  const cwd = deps.getCurrentFilePath() ? path.dirname(deps.getCurrentFilePath()!) : process.cwd();

  // If we already have state from a different project root, clean it up first
  if (activeAgentProfileState) {
    const existingRoot = activeAgentProfileState.entries[0]?.filePath;
    if (existingRoot && !existingRoot.startsWith(cwd)) {
      try {
        cleanupAgentProfiles(activeAgentProfileState);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[main] Copilot agent-profile cleanup (project switch) failed:', msg);
      }
      activeAgentProfileState = null;
    }
  }

  const newState = syncAgentProfiles(cwd, category, activeAgentProfileState ?? undefined);
  activeAgentProfileState = newState;
  console.log(`[main] Copilot agent profiles synced for category "${category}" in:`, cwd);
}

// ---------------------------------------------------------------------------
// Test-only state setter
// ---------------------------------------------------------------------------

/** @internal Exported only for unit tests — sets AGENTS.md restore state directly. */
export function _setAgentsMdRestoreStateForTesting(
  filePath: string | null,
  hadExisting: boolean,
  originalContent: string | null,
): void {
  activeAgentsFilePath = filePath;
  activeAgentsHadExistingFile = hadExisting;
  activeAgentsOriginalContent = originalContent;
}

/** @internal Exported only for unit tests — sets deps without IPC registration. */
export function _setDepsForTesting(d: AgentsMdDeps): void {
  deps = d;
}

// ---------------------------------------------------------------------------
// Init — register IPC handlers
// ---------------------------------------------------------------------------

export function initAgentsMdManager(d: AgentsMdDeps): void {
  deps = d;

  ipcMain.handle('write-agents-md', (_, content: string) => {
    return writeAgentsMd(content);
  });

  ipcMain.handle('write-codex-agents-md', (_, content: string) => {
    return writeAgentsMd(content);
  });

  ipcMain.handle('cleanup-agents-md', () => {
    cleanupAgentsMd();
    return true;
  });

  ipcMain.handle('sync-copilot-agent-profiles', (_, category: string) => {
    syncCopilotProfiles(category as ChatbotCategory);
    return true;
  });
}
