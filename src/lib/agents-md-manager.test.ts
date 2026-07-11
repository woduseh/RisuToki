import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeFileAtomicSync } from './atomic-write';

const handleMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
}));

import { cleanupAgentsMd, initAgentsMdManager } from './agents-md-manager';

const START_MARKER = '<!-- RisuToki:session-context:start -->';
const END_MARKER = '<!-- RisuToki:session-context:end -->';

type IpcHandler = (_event: unknown, content: string, projectRoot?: string) => string | null;

let tempDir: string;

function initializeManager(overrides: { writeFileAtomicSync?: (filePath: string, data: string) => void } = {}): void {
  initAgentsMdManager({
    getCurrentFilePath: () => null,
    getTerminalCwd: () => tempDir,
    getDirname: () => tempDir,
    resolveGuidePath: () => null,
    writeFileAtomicSync: overrides.writeFileAtomicSync ?? ((filePath, data) => writeFileAtomicSync(filePath, data)),
  });
}

function getWriteHandler(): IpcHandler {
  const calls = handleMock.mock.calls;
  const registration = [...calls].reverse().find(([channel]) => channel === 'write-agents-md');
  if (!registration) throw new Error('write-agents-md handler was not registered');
  return registration[1] as IpcHandler;
}

function writeSession(content: string): string | null {
  return getWriteHandler()(undefined, content, tempDir);
}

function readAgents(): string {
  return fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf8');
}

beforeEach(() => {
  cleanupAgentsMd();
  vi.clearAllMocks();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-agents-'));
});

afterEach(() => {
  cleanupAgentsMd();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('managed AGENTS.md lifecycle', () => {
  it('adds a marked session block while preserving an existing project guide', () => {
    const agentsPath = path.join(tempDir, 'AGENTS.md');
    const original = '# Project Guide\n\nKeep this exactly.\n';
    fs.writeFileSync(agentsPath, original, 'utf8');
    initializeManager();

    expect(writeSession('Session instructions')).toBe(agentsPath);
    const written = readAgents();
    expect(written).toContain(`${START_MARKER}\n# RisuToki Session Context`);
    expect(written).toContain('Session instructions');
    expect(written).toContain(END_MARKER);
    expect(written.endsWith(original)).toBe(true);

    cleanupAgentsMd();
    expect(readAgents()).toBe(original);
  });

  it('deletes an app-created file when cleanup leaves no user content', () => {
    const agentsPath = path.join(tempDir, 'AGENTS.md');
    initializeManager();

    writeSession('Temporary session');
    expect(fs.existsSync(agentsPath)).toBe(true);

    cleanupAgentsMd();
    expect(fs.existsSync(agentsPath)).toBe(false);
  });

  it('replaces a stale managed block from a previous process', () => {
    const agentsPath = path.join(tempDir, 'AGENTS.md');
    fs.writeFileSync(
      agentsPath,
      `${START_MARKER}\n# RisuToki Session Context\n\nOld session\n${END_MARKER}\n# User Guide\n`,
      'utf8',
    );
    initializeManager();

    writeSession('Fresh session');
    const written = readAgents();
    expect(written.match(new RegExp(START_MARKER, 'g'))).toHaveLength(1);
    expect(written).toContain('Fresh session');
    expect(written).not.toContain('Old session');

    cleanupAgentsMd();
    expect(readAgents()).toBe('# User Guide\n');
  });

  it('is idempotent across duplicate writes to the same file', () => {
    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# Guide', 'utf8');
    initializeManager();

    writeSession('First session');
    writeSession('Second session');
    const written = readAgents();

    expect(written.match(new RegExp(START_MARKER, 'g'))).toHaveLength(1);
    expect(written).not.toContain('First session');
    expect(written).toContain('Second session');
    expect(written.endsWith('# Guide')).toBe(true);
  });

  it('cleanup removes only the managed block and preserves edits made during the session', () => {
    const agentsPath = path.join(tempDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Original Guide\n', 'utf8');
    initializeManager();
    writeSession('Session context');

    fs.appendFileSync(agentsPath, '\n# User Edit\nKeep this change.\n', 'utf8');
    cleanupAgentsMd();

    expect(readAgents()).toBe('# Original Guide\n\n# User Edit\nKeep this change.\n');
  });

  it('neutralizes managed marker literals inside session content before cleanup', () => {
    const agentsPath = path.join(tempDir, 'AGENTS.md');
    const original = '# Original Guide\n';
    fs.writeFileSync(agentsPath, original, 'utf8');
    initializeManager();

    writeSession(`Before\n${END_MARKER}\nMiddle\n${START_MARKER}\nAfter`);
    const written = readAgents();

    expect(written.match(new RegExp(START_MARKER, 'g'))).toHaveLength(1);
    expect(written.match(new RegExp(END_MARKER, 'g'))).toHaveLength(1);
    expect(written).toContain('&lt;!-- RisuToki:session-context:start -->');
    expect(written).toContain('&lt;!-- RisuToki:session-context:end -->');

    cleanupAgentsMd();
    expect(readAgents()).toBe(original);
  });

  it('leaves the target unchanged when the atomic replacement fails', () => {
    const agentsPath = path.join(tempDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Original Guide\n', 'utf8');
    initializeManager({
      writeFileAtomicSync: () => {
        throw new Error('simulated atomic rename failure');
      },
    });

    expect(() => writeSession('Session context')).toThrow('simulated atomic rename failure');
    expect(readAgents()).toBe('# Original Guide\n');
  });

  it('keeps cleanup state after an atomic failure so cleanup can be retried', () => {
    const agentsPath = path.join(tempDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Original Guide\n', 'utf8');
    let failWrites = false;
    initializeManager({
      writeFileAtomicSync: (filePath, data) => {
        if (failWrites) throw new Error('simulated cleanup failure');
        writeFileAtomicSync(filePath, data);
      },
    });
    writeSession('Session context');
    const managedContent = readAgents();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    failWrites = true;
    cleanupAgentsMd();
    expect(readAgents()).toBe(managedContent);
    expect(warnSpy).toHaveBeenCalledWith('[main] Agents.md cleanup failed:', 'simulated cleanup failure');

    failWrites = false;
    cleanupAgentsMd();
    expect(readAgents()).toBe('# Original Guide\n');
    warnSpy.mockRestore();
  });

  it('does not create an empty AGENTS.md when there is no session or guide', () => {
    const agentsPath = path.join(tempDir, 'AGENTS.md');
    initializeManager();

    expect(writeSession('')).toBeNull();
    expect(fs.existsSync(agentsPath)).toBe(false);
  });
});
