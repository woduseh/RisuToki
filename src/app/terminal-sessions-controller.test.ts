import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TerminalUiHandle, TerminalUiOptions } from '../lib/terminal-ui';
import { createTerminalSessionsController, type TerminalSessionsControllerDeps } from './terminal-sessions-controller';

function createFixture() {
  let sequence = 0;
  const initialized = new Map<string, TerminalUiOptions>();
  const handles = new Map<string, TerminalUiHandle>();
  const terminalInputSession = vi.fn();
  const terminalRenameSession = vi.fn().mockResolvedValue(true);
  const terminalStopSession = vi.fn().mockResolvedValue(true);
  const setTerminalCwd = vi.fn().mockResolvedValue(true);
  const onActiveTerminalData = vi.fn();

  const api: TerminalSessionsControllerDeps['api'] = {
    onTerminalDataSession: vi.fn().mockReturnValue(vi.fn()),
    onTerminalExitSession: vi.fn().mockReturnValue(vi.fn()),
    onTerminalStatusSession: vi.fn().mockReturnValue(vi.fn()),
    setTerminalCwd,
    terminalInputSession,
    terminalIsSessionRunning: vi.fn().mockResolvedValue(true),
    terminalNewSession: vi.fn().mockImplementation(async (name = 'Shell') => ({
      id: `session-${++sequence}`,
      name,
    })),
    terminalRenameSession,
    terminalResizeSession: vi.fn(),
    terminalStartSession: vi.fn().mockResolvedValue(true),
    terminalStopSession,
  };

  const controller = createTerminalSessionsController({
    api,
    getTheme: () => ({ background: '#000000' }),
    initializeUi: vi.fn().mockImplementation(async (options: TerminalUiOptions) => {
      const sessionId = options.container.dataset.sessionId!;
      initialized.set(sessionId, options);
      const handle = {
        dispose: vi.fn(),
        fitAddon: { fit: vi.fn() },
        term: {
          clear: vi.fn(),
          cols: 80,
          options: {},
          rows: 24,
        },
      } as unknown as TerminalUiHandle;
      handles.set(sessionId, handle);
      return handle;
    }),
    onActivity: vi.fn(),
    onActiveTerminalData,
    setActive: vi.fn(),
    setStatus: vi.fn(),
  });

  return {
    api,
    controller,
    handles,
    initialized,
    onActiveTerminalData,
    setTerminalCwd,
    terminalInputSession,
    terminalRenameSession,
    terminalStopSession,
  };
}

describe('terminal-sessions-controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="terminal-tabs"></div><div id="terminal-container"></div>';
  });

  it('initializes a shell session and renders it as the active tab', async () => {
    const fixture = createFixture();

    await fixture.controller.init();

    expect(fixture.controller.activeSessionId).toBe('session-1');
    expect(fixture.controller.getActiveSession()?.name).toBe('Shell');
    expect(document.querySelector('.terminal-session.active')?.getAttribute('data-session-id')).toBe('session-1');
    expect(document.querySelector('.terminal-tab.active')?.textContent).toContain('Shell');
    expect(fixture.controller.getTerminal()).toBe(fixture.handles.get('session-1')?.term);
  });

  it('switches sessions and routes input to the requested or active session', async () => {
    const fixture = createFixture();
    await fixture.controller.init();
    await fixture.controller.createSession('Codex');

    fixture.controller.sendInput('active');
    fixture.controller.sendInput('explicit', 'session-1');
    fixture.controller.setActiveSession('session-1');

    expect(fixture.terminalInputSession).toHaveBeenNthCalledWith(1, 'session-2', 'active');
    expect(fixture.terminalInputSession).toHaveBeenNthCalledWith(2, 'session-1', 'explicit');
    expect(fixture.controller.activeSessionId).toBe('session-1');
    expect(document.querySelector('[data-session-id="session-1"]')?.classList.contains('active')).toBe(true);
  });

  it('creates uniquely named shell cells', async () => {
    const fixture = createFixture();
    await fixture.controller.init();

    const second = await fixture.controller.createSession('Shell');
    const third = await fixture.controller.createSession('Shell');

    expect(second.name).toBe('Shell (2)');
    expect(third.name).toBe('Shell (3)');
    expect(fixture.api.terminalNewSession).toHaveBeenNthCalledWith(2, 'Shell (2)');
    expect(fixture.api.terminalNewSession).toHaveBeenNthCalledWith(3, 'Shell (3)');
  });

  it('renames a cell inline and resolves name collisions', async () => {
    const fixture = createFixture();
    await fixture.controller.init();
    await fixture.controller.createSession('Notes');
    fixture.controller.setActiveSession('session-1');

    const renameButton = document.querySelector<HTMLButtonElement>('.terminal-tab.active .terminal-tab-rename-button')!;
    expect(renameButton.getAttribute('aria-label')).toBe('Shell 이름 변경');
    renameButton.click();
    const input = document.querySelector<HTMLInputElement>('.terminal-tab-rename')!;
    input.value = 'Notes';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();

    expect(fixture.terminalRenameSession).toHaveBeenCalledWith('session-1', 'Notes (2)');
    expect(fixture.controller.getSession('session-1')?.name).toBe('Notes (2)');
    expect(document.querySelector('.terminal-tab.active')?.textContent).toContain('Notes (2)');
  });

  it('tracks cwd and forwards output only for the active session', async () => {
    const fixture = createFixture();
    await fixture.controller.init();
    const firstOptions = fixture.initialized.get('session-1')!;

    firstOptions.onUserInput?.('cd C:\\cards\r');
    firstOptions.onTerminalData?.('first');
    await fixture.controller.createSession('Second');
    firstOptions.onTerminalData?.('hidden');
    fixture.initialized.get('session-2')?.onTerminalData?.('second');

    expect(fixture.controller.getSession('session-1')?.context.cwd).toBe('C:\\cards');
    expect(fixture.setTerminalCwd).toHaveBeenCalledWith('C:\\cards');
    expect(fixture.onActiveTerminalData).toHaveBeenCalledTimes(2);
    expect(fixture.onActiveTerminalData).toHaveBeenNthCalledWith(1, 'first');
    expect(fixture.onActiveTerminalData).toHaveBeenNthCalledWith(2, 'second');
  });

  it('disposes a closed session and activates the remaining session', async () => {
    const fixture = createFixture();
    await fixture.controller.init();
    await fixture.controller.createSession('Second');

    await fixture.controller.closeSession('session-2');

    expect(fixture.terminalStopSession).toHaveBeenCalledWith('session-2');
    expect(fixture.handles.get('session-2')?.dispose).toHaveBeenCalled();
    expect(fixture.controller.activeSessionId).toBe('session-1');
    expect(fixture.controller.getSession('session-2')).toBeNull();
  });

  it('clears only the active terminal buffer', async () => {
    const fixture = createFixture();
    await fixture.controller.init();

    fixture.controller.clearActiveTerminal();

    expect(fixture.handles.get('session-1')?.term.clear).toHaveBeenCalled();
    expect(fixture.controller.getActiveSession()).not.toBeNull();
  });
});
