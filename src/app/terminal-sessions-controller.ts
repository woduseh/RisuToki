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
  restart(): Promise<boolean | null>;
  sendInput(text: string, sessionId?: string | null): void;
  setActiveSession(sessionId: string): void;
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
      tab.title = session.name;
      tab.addEventListener('click', () => setActiveSession(session.id));
      tab.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setActiveSession(session.id);
        }
      });

      const label = document.createElement('span');
      label.className = 'terminal-tab-label';
      label.textContent = session.name;
      tab.appendChild(label);

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
    const info = await deps.api.terminalNewSession(name);
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
      preserveAmdLoader: true,
      rightClickSelectsWord: true,
      setActive: deps.setActive,
      shouldActivateOnData: () => shouldTreatTerminalDataAsActivity(lastUserInputTime),
      theme: deps.getTheme(),
      writeStatusToTerminal: true,
    });

    session.ui = terminalUi;
    return session;
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
