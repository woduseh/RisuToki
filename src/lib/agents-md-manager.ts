import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { writeFileAtomicSync } from './atomic-write';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AgentsMdDeps {
  getCurrentFilePath: () => string | null;
  getTerminalCwd: () => string | null;
  getDirname: () => string;
  resolveGuidePath: (filename: string) => string | null;
  /** Test seam; production uses the same-directory atomic writer. */
  writeFileAtomicSync?: (filePath: string, data: string) => void;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: AgentsMdDeps;
let activeAgentsFilePath: string | null = null;
let activeAgentsCreatedFile = false;

const MANAGED_BLOCK_START = '<!-- RisuToki:session-context:start -->';
const MANAGED_BLOCK_END = '<!-- RisuToki:session-context:end -->';
const MANAGED_BLOCK_PATTERN = new RegExp(
  `${MANAGED_BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MANAGED_BLOCK_END.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  )}(?:\\r?\\n)?`,
  'g',
);

function neutralizeManagedMarkerLiterals(content: string): string {
  return content
    .replaceAll(MANAGED_BLOCK_START, '&lt;!-- RisuToki:session-context:start -->')
    .replaceAll(MANAGED_BLOCK_END, '&lt;!-- RisuToki:session-context:end -->');
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Resolve project root with priority (each candidate must be an absolute path):
 *
 * 1. explicit override (if non-empty and absolute)
 * 2. tracked terminal cwd (if absolute)
 * 3. dirname of currently-open file
 * 4. process.cwd()
 */
function resolveProjectRoot(explicitRoot?: string | null): string {
  if (explicitRoot && path.isAbsolute(explicitRoot)) return explicitRoot;

  const termCwd = deps.getTerminalCwd();
  if (termCwd && path.isAbsolute(termCwd)) return termCwd;

  const filePath = deps.getCurrentFilePath();
  if (filePath) return path.dirname(filePath);

  return process.cwd();
}

export function cleanupAgentsMd(): void {
  if (!activeAgentsFilePath) return;

  let completed = false;
  try {
    if (!fs.existsSync(activeAgentsFilePath)) {
      completed = true;
    } else {
      const currentContent = fs.readFileSync(activeAgentsFilePath, 'utf-8');
      const cleanedContent = stripManagedSessionBlocks(currentContent);

      if (activeAgentsCreatedFile && !cleanedContent.trim()) {
        fs.unlinkSync(activeAgentsFilePath);
      } else if (cleanedContent !== currentContent) {
        atomicWrite(activeAgentsFilePath, cleanedContent);
      }
      completed = true;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[main] Agents.md cleanup failed:', msg);
  }

  if (completed) {
    activeAgentsFilePath = null;
    activeAgentsCreatedFile = false;
  }
}

function atomicWrite(filePath: string, content: string): void {
  const writer =
    deps.writeFileAtomicSync ??
    ((targetPath: string, data: string) => {
      writeFileAtomicSync(targetPath, data, { encoding: 'utf8' });
    });
  writer(filePath, content);
}

function stripManagedSessionBlocks(content: string): string {
  return content.replace(MANAGED_BLOCK_PATTERN, '');
}

function readProjectGuideContent(cwd: string, agentsPath: string): string {
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

  const guidesClaudePath = deps.resolveGuidePath('CLAUDE.md');
  if (guidesClaudePath && fs.existsSync(guidesClaudePath)) {
    return fs.readFileSync(guidesClaudePath, 'utf-8');
  }

  return '';
}

function buildAgentsDocument(sessionContent: string | null, projectGuideContent: string | null): string {
  const trimmedSessionContent = neutralizeManagedMarkerLiterals(String(sessionContent || '').trim());
  const projectGuide = stripManagedSessionBlocks(String(projectGuideContent || ''));
  if (!trimmedSessionContent) return projectGuide;

  const managedBlock = [
    MANAGED_BLOCK_START,
    '# RisuToki Session Context',
    '',
    trimmedSessionContent,
    MANAGED_BLOCK_END,
  ].join('\n');
  return projectGuide ? `${managedBlock}\n${projectGuide}` : managedBlock;
}

function writeAgentsMd(content: string, projectRoot?: string | null): string | null {
  const cwd = resolveProjectRoot(projectRoot);
  const agentsPath = path.join(cwd, 'AGENTS.md');

  if (activeAgentsFilePath && activeAgentsFilePath !== agentsPath) {
    const previousAgentsPath = activeAgentsFilePath;
    cleanupAgentsMd();
    if (activeAgentsFilePath === previousAgentsPath) {
      throw new Error('Previous managed AGENTS.md cleanup failed; refusing to replace lifecycle state');
    }
  }

  const fileExisted = fs.existsSync(agentsPath);
  const rawProjectGuideContent = readProjectGuideContent(cwd, agentsPath);
  const hadManagedBlock = rawProjectGuideContent.includes(MANAGED_BLOCK_START);
  const projectGuideContent = stripManagedSessionBlocks(rawProjectGuideContent);
  const createdFile = !fileExisted || (hadManagedBlock && !projectGuideContent.trim());
  const finalContent = buildAgentsDocument(content, projectGuideContent);
  if (!finalContent.trim()) {
    if (fileExisted && hadManagedBlock && createdFile) {
      fs.unlinkSync(agentsPath);
    }
    activeAgentsFilePath = null;
    activeAgentsCreatedFile = false;
    return null;
  }

  atomicWrite(agentsPath, finalContent);
  activeAgentsFilePath = agentsPath;
  activeAgentsCreatedFile = createdFile;
  console.log('[main] AGENTS.md written:', agentsPath);
  return agentsPath;
}

// ---------------------------------------------------------------------------
// Init — register IPC handlers
// ---------------------------------------------------------------------------

export function initAgentsMdManager(d: AgentsMdDeps): void {
  deps = d;

  ipcMain.handle('write-agents-md', (_, content: string, projectRoot?: string) => {
    return writeAgentsMd(content, projectRoot);
  });

  ipcMain.handle('write-codex-agents-md', (_, content: string, projectRoot?: string) => {
    return writeAgentsMd(content, projectRoot);
  });

  ipcMain.handle('cleanup-agents-md', () => {
    cleanupAgentsMd();
    return true;
  });
}
