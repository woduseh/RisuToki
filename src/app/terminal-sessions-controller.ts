import { TerminalSessionContext } from '../lib/terminal-session-context';
import {
  initializeTerminalUi,
  shouldTreatTerminalDataAsActivity,
  type TerminalTheme,
  type TerminalUiHandle,
  type TerminalUiOptions,
} from '../lib/terminal-ui';

export interface TerminalSessionUi {
  id: string;
  name: string;
  container: HTMLElement;
  context: TerminalSessionContext;
  ui: TerminalUiHandle | null;
}

type TerminalStatusCallback = NonNullable<TerminalUiOptions['api']['onTerminalStatus']>;
type TerminalStatus = Parameters<Parameters<TerminalStatusCallback>[0]>[0];

interface TerminalSessionsApi {
  onTerminalDataSession(callback: (sessionId: string, data: string) => void): () => void;
  onTerminalExitSession(callback: (sessionId: string) => void): () => void;
  onTerminalStatusSession(callback: (sessionId: string, event: TerminalStatus) => void): () => void;
  setTerminalCwd(cwd: string | null): Promise<boolean>;
  terminalInputSession(sessionId: string, data: string): void;
  terminalIsSessionRunning(sessionId: string): Promise<boolean>;
  terminalNewSession(name?: string): Promise<{ id: string; name: string }>;
  terminalRenameSession(sessionId: string, name: string): Promise<boolean>;
  terminalResizeSession(sessionId: string, cols: number, rows: number): void;
  terminalStartSession(sessionId: string, cols?: number, rows?: number, name?: string): Promise<boolean>;
  terminalStopSession(sessionId: string): Promise<boolean>;
}

export interface TerminalSessionsControllerDeps {
  api: TerminalSessionsApi;
  getTheme(): TerminalTheme;
  initializeUi?: (options: TerminalUiOptions) => Promise<TerminalUiHandle>;
  onActivity(): void;
  onActiveTerminalData(data: string): void;
  setActive(active: boolean): void;
  setStatus(message: string): void;
}

export interface TerminalSessionsController {
  readonly activeSessionId: string | null;
  clearActiveTerminal(): void;
  closeSession(sessionId: string): Promise<void>;
  createSession(name?: string): Promise<TerminalSessionUi>;
  fit(delayMs?: number): void;
  getActiveContext(): TerminalSessionContext;
  getActiveSession(): TerminalSessionUi | null;
  getSession(sessionId: string): TerminalSessionUi | null;
  getTerminal(): TerminalUiHandle['term'] | null;
  init(): Promise<void>;
  renameSession(sessionId: string, name: string): Promise<boolean>;
  restart(): Promise<boolean | null>;
  sendInput(text: string, sessionId?: string | null): void;
  setActiveSession(sessionId: string): void;
}

export function makeUniqueTerminalSessionName(requested: string, existingNames: Iterable<string>): string {
  const preferred = requested.trim() || 'Shell';
  const occupied = new Set(Array.from(existingNames, (name) => name.trim().toLocaleLowerCase()));
  if (!occupied.has(preferred.toLocaleLowerCase())) return preferred;

  const match = preferred.match(/^(.*?)(?:\s+\((\d+)\))?$/);
  const stem = match?.[1]?.trim() || preferred;
  let suffix = Math.max(2, Number(match?.[2] || 1) + 1);
  while (occupied.has(`${stem} (${suffix})`.toLocaleLowerCase())) suffix += 1;
  return `${stem} (${suffix})`;
}

export function createTerminalSessionsController(deps: TerminalSessionsControllerDeps): TerminalSessionsController {
  const sessions = new Map<string, TerminalSessionUi>();
  const fallbackContext = new TerminalSessionContext();
  const initUi = deps.initializeUi ?? initializeTerminalUi;
  let activeSessionId: string | null = null;
  let lastUserInputTime = 0;

  function getActiveSession(): TerminalSessionUi | null {
    return activeSessionId ? sessions.get(activeSessionId) || null : null;
  }

  function getActiveContext(): TerminalSessionContext {
    return getActiveSession()?.context || fallbackContext;
  }

  function beginSessionRename(session: TerminalSessionUi, label: HTMLElement): void {
    const tab = label.closest<HTMLElement>('.terminal-tab');
    if (!tab || tab.querySelector('.terminal-tab-rename')) return;

    const input = document.createElement('input');
    input.className = 'terminal-tab-rename';
    input.type = 'text';
    input.value = session.name;
    input.setAttribute('aria-label', '터미널 셀 이름');
    let settled = false;

    const cancel = () => {
      if (settled) return;
      settled = true;
      renderTabs();
    };
    const commit = () => {
      if (settled) return;
      const nextName = input.value.trim();
      if (!nextName) {
        cancel();
        return;
      }
      settled = true;
      void renameSession(session.id, nextName).then((renamed) => {
        if (!renamed) renderTabs();
      });
    };

    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('dblclick', (event) => event.stopPropagation());
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    });
    input.addEventListener('blur', commit);
    label.replaceWith(input);
    input.focus();
    input.select();
  }

  function renderTabs(): void {
    const tabs = document.getElementById('terminal-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';

    for (const session of sessions.values()) {
      const tab = document.createElement('div');
      tab.className = `terminal-tab${session.id === activeSessionId ? ' active' : ''}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(session.id === activeSessionId));
      tab.tabIndex = 0;
      tab.title = `${session.name} · 더블클릭하거나 F2를 눌러 이름 변경`;
      tab.addEventListener('click', () => setActiveSession(session.id));
      tab.addEventListener('keydown', (event) => {
        if (event.key === 'F2') {
          event.preventDefault();
          const label = tab.querySelector<HTMLElement>('.terminal-tab-label');
          if (label) beginSessionRename(session, label);
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setActiveSession(session.id);
        }
      });

      const label = document.createElement('span');
      label.className = 'terminal-tab-label';
      label.textContent = session.name;
      label.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginSessionRename(session, label);
      });
      tab.appendChild(label);

      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'terminal-tab-rename-button';
      rename.title = '터미널 셀 이름 변경';
      rename.setAttribute('aria-label', `${session.name} 이름 변경`);
      rename.textContent = '✎';
      rename.addEventListener('click', (event) => {
        event.stopPropagation();
        beginSessionRename(session, label);
      });
      tab.appendChild(rename);

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'terminal-tab-close';
      close.title = '터미널 탭 닫기';
      close.setAttribute('aria-label', `${session.name} 탭 닫기`);
      close.textContent = '×';
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        void closeSession(session.id);
      });
      tab.appendChild(close);
      tabs.appendChild(tab);
    }

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'terminal-tab-add';
    add.title = '새 터미널';
    add.setAttribute('aria-label', '새 터미널');
    add.textContent = '+';
    add.addEventListener('click', () => {
      void createSession('Shell');
    });
    tabs.appendChild(add);
  }

  function fit(delayMs = 0): void {
    if (delayMs <= 0) {
      getActiveSession()?.ui?.fitAddon.fit();
      return;
    }
    window.setTimeout(() => getActiveSession()?.ui?.fitAddon.fit(), delayMs);
  }

  function setActiveSession(sessionId: string): void {
    if (!sessions.has(sessionId)) return;
    activeSessionId = sessionId;
    for (const session of sessions.values()) {
      session.container.classList.toggle('active', session.id === sessionId);
    }
    renderTabs();
    const cwd = getActiveContext().cwd;
    if (cwd) void deps.api.setTerminalCwd(cwd);
    fit(20);
  }

  async function closeSession(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) return;
    await deps.api.terminalStopSession(session.id);
    session.ui?.dispose();
    session.container.remove();
    sessions.delete(session.id);

    if (activeSessionId === session.id) {
      activeSessionId = sessions.keys().next().value || null;
    }

    if (!activeSessionId) {
      await createSession('Shell');
      return;
    }

    setActiveSession(activeSessionId);
  }

  async function createSession(name = 'Shell'): Promise<TerminalSessionUi> {
    const root = document.getElementById('terminal-container')!;
    const uniqueName = makeUniqueTerminalSessionName(
      name,
      Array.from(sessions.values(), (session) => session.name),
    );
    const info = await deps.api.terminalNewSession(uniqueName);
    const sessionContainer = document.createElement('div');
    sessionContainer.className = 'terminal-session';
    sessionContainer.dataset.sessionId = info.id;
    root.appendChild(sessionContainer);

    const session: TerminalSessionUi = {
      id: info.id,
      name: info.name,
      container: sessionContainer,
      context: new TerminalSessionContext(),
      ui: null,
    };
    sessions.set(session.id, session);
    setActiveSession(session.id);

    const terminalUi = await initUi({
      api: {
        onTerminalData: (callback) =>
          deps.api.onTerminalDataSession((sessionId, data) => {
            if (sessionId === session.id) callback(data);
          }),
        onTerminalExit: (callback) =>
          deps.api.onTerminalExitSession((sessionId) => {
            if (sessionId === session.id) callback();
          }),
        onTerminalStatus: (callback) =>
          deps.api.onTerminalStatusSession((sessionId, event) => {
            if (sessionId === session.id) callback(event);
          }),
        terminalInput: (data) => deps.api.terminalInputSession(session.id, data),
        terminalIsRunning: () => deps.api.terminalIsSessionRunning(session.id),
        terminalResize: (cols, rows) => deps.api.terminalResizeSession(session.id, cols, rows),
        terminalStart: (cols, rows) => deps.api.terminalStartSession(session.id, cols, rows, session.name),
      },
      container: session.container,
      onActivity: deps.onActivity,
      onTerminalData: (data) => {
        if (session.id === activeSessionId) deps.onActiveTerminalData(data);
      },
      onUserInput: (data) => {
        lastUserInputTime = Date.now();
        const previousCwd = session.context.cwd;
        session.context.feedInput(data);
        if (session.id === activeSessionId && session.context.cwd !== previousCwd) {
          void deps.api.setTerminalCwd(session.context.cwd);
        }
      },
      rightClickSelectsWord: true,
      setActive: deps.setActive,
      shouldActivateOnData: () => shouldTreatTerminalDataAsActivity(lastUserInputTime),
      theme: deps.getTheme(),
      writeStatusToTerminal: true,
    });

    session.ui = terminalUi;
    return session;
  }

  async function renameSession(sessionId: string, name: string): Promise<boolean> {
    const session = sessions.get(sessionId);
    const trimmed = name.trim();
    if (!session || !trimmed) return false;

    const uniqueName = makeUniqueTerminalSessionName(
      trimmed,
      Array.from(sessions.values())
        .filter((candidate) => candidate.id !== sessionId)
        .map((candidate) => candidate.name),
    );
    if (uniqueName === session.name) {
      renderTabs();
      return true;
    }

    const renamed = await deps.api.terminalRenameSession(sessionId, uniqueName);
    if (!renamed) {
      deps.setStatus('터미널 이름을 변경하지 못했습니다');
      return false;
    }

    session.name = uniqueName;
    renderTabs();
    deps.setStatus(`터미널 이름 변경: ${uniqueName}`);
    return true;
  }

  return {
    get activeSessionId() {
      return activeSessionId;
    },

    clearActiveTerminal() {
      getActiveSession()?.ui?.term.clear();
    },

    closeSession,
    createSession,
    fit,
    getActiveContext,
    getActiveSession,
    getSession: (sessionId) => sessions.get(sessionId) || null,
    getTerminal: () => getActiveSession()?.ui?.term || null,

    async init() {
      document.getElementById('terminal-container')!.innerHTML = '';
      sessions.clear();
      activeSessionId = null;
      await createSession('Shell');
    },

    renameSession,

    async restart() {
      const active = getActiveSession();
      if (!active?.ui) return null;
      await deps.api.terminalStopSession(active.id);
      await new Promise((resolve) => setTimeout(resolve, 200));
      active.ui.term.clear();
      active.context.reset();
      const restarted = await deps.api.terminalStartSession(
        active.id,
        active.ui.term.cols,
        active.ui.term.rows,
        active.name,
      );
      deps.setStatus(restarted ? '터미널 재시작됨' : '터미널 재시작 실패');
      return restarted;
    },

    sendInput(text, sessionId) {
      const targetId = sessionId || activeSessionId;
      if (targetId) deps.api.terminalInputSession(targetId, text);
    },

    setActiveSession,
  };
}
