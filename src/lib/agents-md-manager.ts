import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

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

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

export function cleanupAgentsMd(): void {
  try {
    if (!activeAgentsFilePath) return;
    if (activeAgentsHadExistingFile) {
      fs.writeFileSync(activeAgentsFilePath, activeAgentsOriginalContent!, 'utf-8');
    } else if (fs.existsSync(activeAgentsFilePath)) {
      fs.unlinkSync(activeAgentsFilePath);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[main] Agents.md cleanup failed:', msg);
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
    activeAgentsOriginalContent = activeAgentsHadExistingFile
      ? fs.readFileSync(agentsPath, 'utf-8')
      : null;
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
}
