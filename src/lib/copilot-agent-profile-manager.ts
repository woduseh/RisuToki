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
  LENS_SELECTION_RULE,
  getAdvisorProfile,
  getInterpretation,
  buildModelSeatHint,
} from './pluni-persona';

// ── Public types ───────────────────────────────────────────────────

export interface AgentProfileEntry {
  readonly advisorId: AdvisorId;
  readonly filePath: string;
  readonly hadExistingFile: boolean;
  readonly originalContent: string | null;
  /** Path to a pre-existing legacy `${id}.md` file that was removed during sync. */
  readonly legacyFilePath: string | null;
  /** Original content of the legacy file, for cleanup restoration. */
  readonly legacyOriginalContent: string | null;
}

export interface AgentProfileState {
  readonly entries: readonly AgentProfileEntry[];
}

// ── Constants ──────────────────────────────────────────────────────

/** Relative directory under a project root where Copilot agent profiles live. */
export const AGENT_PROFILE_DIR = path.join('.github', 'agents');

// ── Markdown generation ────────────────────────────────────────────

/**
 * Returns the canonical file name for an advisor's agent profile.
 * GitHub requires the `.agent.md` extension for custom agents.
 */
export function getAgentFileName(id: AdvisorId): string {
  return `${id}.agent.md`;
}

/** Pre-canonical filename used before the `.agent.md` convention. */
function getLegacyAgentFileName(id: AdvisorId): string {
  return `${id}.md`;
}

/** Escape a string for use as a YAML double-quoted scalar. */
function yamlQuote(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

/**
 * Builds a complete Copilot custom-agent markdown document for an advisor,
 * framed through a specific chatbot category.
 *
 * Derives all content from `pluni-persona` rather than duplicating constants.
 */
export function buildAgentProfileMarkdown(advisor: AdvisorId, category: ChatbotCategory): string {
  const profile = getAdvisorProfile(advisor);
  const interp = getInterpretation(advisor, category);
  const seatHint = buildModelSeatHint();

  const toolkitList = profile.toolkit.map((t) => `- ${t}`).join('\n');
  const deliverablesList = profile.deliverables.map((d) => `- ${d}`).join('\n');
  const strengthsList = profile.strengths.map((s) => `- ${s}`).join('\n');

  const sections: string[] = [
    // YAML frontmatter required by GitHub custom-agent spec
    '---',
    `name: ${yamlQuote(profile.name)}`,
    `description: ${yamlQuote(profile.role)}`,
    'tools:',
    '  - "*"',
    '---',
    '',
    `# ${profile.name}`,
    '',
    `> Copilot custom agent — ${category} advisory mode`,
    '',
    `**Role:** ${profile.role}`,
    '',
    `## Tone`,
    '',
    profile.tone,
    '',
    `## Analytical Toolkit`,
    '',
    toolkitList,
    '',
    `## Method`,
    '',
    profile.method,
    '',
    `## Lens Selection Rule`,
    '',
    LENS_SELECTION_RULE,
    '',
    `## Focus (${category})`,
    '',
    interp.focus,
    '',
    `## Expected Deliverables`,
    '',
    deliverablesList,
    '',
    `## Core Strengths`,
    '',
    strengthsList,
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
    let legacyFilePath: string | null;
    let legacyOriginalContent: string | null;

    if (prev) {
      // Re-sync: preserve the original pre-session backup
      hadExistingFile = prev.hadExistingFile;
      originalContent = prev.originalContent;
      legacyFilePath = prev.legacyFilePath;
      legacyOriginalContent = prev.legacyOriginalContent;
    } else {
      // First sync: check what's on disk
      hadExistingFile = fs.existsSync(filePath);
      originalContent = hadExistingFile ? fs.readFileSync(filePath, 'utf-8') : null;

      // Detect and remove legacy files (e.g. pluni.md → pluni.agent.md)
      const legacyFileName = getLegacyAgentFileName(id);
      if (legacyFileName !== fileName) {
        const legacyPath = path.join(agentsDir, legacyFileName);
        if (fs.existsSync(legacyPath)) {
          legacyFilePath = legacyPath;
          legacyOriginalContent = fs.readFileSync(legacyPath, 'utf-8');
          fs.unlinkSync(legacyPath);
        } else {
          legacyFilePath = null;
          legacyOriginalContent = null;
        }
      } else {
        legacyFilePath = null;
        legacyOriginalContent = null;
      }
    }

    fs.writeFileSync(filePath, content, 'utf-8');

    entries.push({ advisorId: id, filePath, hadExistingFile, originalContent, legacyFilePath, legacyOriginalContent });
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
    // Canonical cleanup and legacy restore use separate try/catch blocks
    // so a failure in one does not skip the other.
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
      console.warn(`[copilot-agent-profile] Canonical cleanup failed for ${entry.filePath}:`, msg);
    }

    // Restore legacy file if it was backed up during migration
    try {
      if (entry.legacyFilePath && entry.legacyOriginalContent != null) {
        fs.writeFileSync(entry.legacyFilePath, entry.legacyOriginalContent, 'utf-8');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[copilot-agent-profile] Legacy restore failed for ${entry.legacyFilePath}:`, msg);
    }
  }
}
