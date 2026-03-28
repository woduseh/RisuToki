/**
 * Generates and manages temporary Copilot custom-agent profile files
 * under `.github/agents/` in the active working directory.
 *
 * Each advisor (Pluni, Kotone, Sophia) gets one markdown file that
 * Copilot reads as a custom-agent definition.
 *
 * This module owns:
 *   - markdown generation (buildAgentProfileMarkdown)
 *   - file path mapping (getAgentFileName, AGENT_PROFILE_DIR)
 *   - sync/overwrite with backup (syncAgentProfiles)
 *   - cleanup/restore (cleanupAgentProfiles)
 *
 * It does NOT handle IPC registration or session-lifetime coordination;
 * those remain in agents-md-manager.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  type AdvisorId,
  type ChatbotCategory,
  ADVISOR_IDS,
  getAdvisorProfile,
  buildAdvisorSummary,
  buildModelSeatHint,
} from './pluni-persona';

// ── Public types ───────────────────────────────────────────────────

export interface AgentProfileEntry {
  readonly advisorId: AdvisorId;
  readonly filePath: string;
  readonly hadExistingFile: boolean;
  readonly originalContent: string | null;
}

export interface AgentProfileState {
  readonly entries: readonly AgentProfileEntry[];
}

// ── Constants ──────────────────────────────────────────────────────

/** Relative directory under a project root where Copilot agent profiles live. */
export const AGENT_PROFILE_DIR = path.join('.github', 'agents');

// ── Markdown generation ────────────────────────────────────────────

/**
 * Returns the expected file name for an advisor's agent profile.
 */
export function getAgentFileName(id: AdvisorId): string {
  return `${id}.md`;
}

/**
 * Builds a complete Copilot custom-agent markdown document for an advisor,
 * framed through a specific chatbot category.
 *
 * Derives all content from `pluni-persona` rather than duplicating constants.
 */
export function buildAgentProfileMarkdown(advisor: AdvisorId, category: ChatbotCategory): string {
  const profile = getAdvisorProfile(advisor);
  const summary = buildAdvisorSummary(advisor, category);
  const seatHint = buildModelSeatHint();

  const sections: string[] = [
    `# ${profile.name}`,
    '',
    `> Copilot custom agent — ${category} advisory mode`,
    '',
    summary,
    '',
    `Model-seat allocation: ${seatHint.label}`,
  ];

  return sections.join('\n');
}

// ── Sync / overwrite with backup ──────────────────────────────────

/**
 * Creates or overwrites `.github/agents/*.md` for all three advisors.
 *
 * When `previousState` is supplied (re-sync), the original backups from
 * the first sync are preserved so cleanup always restores to the true
 * pre-session state.
 *
 * @returns state object that must be passed to `cleanupAgentProfiles`.
 */
export function syncAgentProfiles(
  projectRoot: string,
  category: ChatbotCategory,
  previousState?: AgentProfileState,
): AgentProfileState {
  const agentsDir = path.join(projectRoot, AGENT_PROFILE_DIR);
  fs.mkdirSync(agentsDir, { recursive: true });

  // Index previous entries by advisor id for backup preservation
  const previousByAdvisor = new Map<AdvisorId, AgentProfileEntry>();
  if (previousState) {
    for (const entry of previousState.entries) {
      previousByAdvisor.set(entry.advisorId, entry);
    }
  }

  const entries: AgentProfileEntry[] = [];

  for (const id of ADVISOR_IDS) {
    const fileName = getAgentFileName(id);
    const filePath = path.join(agentsDir, fileName);
    const content = buildAgentProfileMarkdown(id, category);

    // Determine backup: prefer previous state's original if re-syncing
    const prev = previousByAdvisor.get(id);
    let hadExistingFile: boolean;
    let originalContent: string | null;

    if (prev) {
      // Re-sync: preserve the original pre-session backup
      hadExistingFile = prev.hadExistingFile;
      originalContent = prev.originalContent;
    } else {
      // First sync: check what's on disk
      hadExistingFile = fs.existsSync(filePath);
      originalContent = hadExistingFile ? fs.readFileSync(filePath, 'utf-8') : null;
    }

    fs.writeFileSync(filePath, content, 'utf-8');

    entries.push({ advisorId: id, filePath, hadExistingFile, originalContent });
  }

  return { entries };
}

// ── Cleanup / restore ──────────────────────────────────────────────

/**
 * Restores or deletes agent profile files based on session state.
 *
 * - Files that existed before the session → restored to original content.
 * - Files created fresh for the session → deleted.
 */
export function cleanupAgentProfiles(state: AgentProfileState): void {
  for (const entry of state.entries) {
    try {
      if (entry.hadExistingFile) {
        if (entry.originalContent != null) {
          fs.writeFileSync(entry.filePath, entry.originalContent, 'utf-8');
        }
        // originalContent null despite hadExistingFile — leave file as-is
      } else if (fs.existsSync(entry.filePath)) {
        fs.unlinkSync(entry.filePath);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[copilot-agent-profile] Cleanup failed for ${entry.filePath}:`, msg);
    }
  }
}
