import { ensureXtermAssets, loadScript } from './script-loader';
import { getXtermFitAddonUrl, getXtermRuntimeUrl } from './asset-runtime';

export const TERM_THEME_DARK = {
  background: '#141a31',
  foreground: '#d8dce8',
  cursor: '#4a90d9',
  cursorAccent: '#141a31',
  selectionBackground: '#4a90d944',
  selectionForeground: '#f0f2f8',
  black: '#2e3a56',
  red: '#ef5350',
  green: '#66bb6a',
  yellow: '#ffca28',
  blue: '#4a90d9',
  magenta: '#ba68c8',
  cyan: '#4dd0e1',
  white: '#d8dce8',
  brightBlack: '#7a8ba5',
  brightRed: '#fc96ab',
  brightGreen: '#81c784',
  brightYellow: '#ffb342',
  brightBlue: '#6fb3f2',
  brightMagenta: '#ce93d8',
  brightCyan: '#80deea',
  brightWhite: '#f0f2f8',
};

export const TERM_THEME_LIGHT = {
  background: '#ffffff',
  foreground: '#2a323e',
  cursor: '#4a8ac6',
  cursorAccent: '#ffffff',
  selectionBackground: '#b3d4fc',
  selectionForeground: '#1a2740',
  black: '#4b5a6f',
  red: '#e53935',
  green: '#2e7d32',
  yellow: '#e65100',
  blue: '#3493f9',
  magenta: '#8e24aa',
  cyan: '#00838f',
  white: '#87929e',
  brightBlack: '#68788f',
  brightRed: '#fc96ab',
  brightGreen: '#66bb6a',
  brightYellow: '#ffb342',
  brightBlue: '#4a8ac6',
  brightMagenta: '#ba68c8',
  brightCyan: '#4dd0e1',
  brightWhite: '#ffffff',
};

export interface TerminalTheme {
  [key: string]: string;
}

interface TerminalStatusLike {
  detail?: string;
  message: string;
}

interface DisposableLike {
  dispose: () => void;
}

interface TerminalLike {
  cols: number;
  rows: number;
  options: {
    theme?: TerminalTheme;
  };
  attachCustomKeyEventHandler: (handler: (event: KeyboardEvent) => boolean) => void;
  clear: () => void;
  clearSelection: () => void;
  getSelection: () => string;
  hasSelection: () => boolean;
  loadAddon: (addon: FitAddonLike) => void;
  onData: (handler: (data: string) => void) => DisposableLike;
  open: (container: HTMLElement) => void;
  resize: (cols: number, rows: number) => void;
  scrollLines: (amount: number) => void;
  write: (data: string) => void;
  writeln: (data: string) => void;
  dispose?: () => void;
}

interface TerminalConstructor {
  new (options: {
    theme: TerminalTheme;
    fontSize: number;
    fontFamily: string;
    cursorBlink: boolean;
    scrollback: number;
    rightClickSelectsWord?: boolean;
    allowTransparency: boolean;
  }): TerminalLike;
}

interface FitAddonLike {
  fit: () => void;
}

interface FitAddonConstructor {
  new (): FitAddonLike;
}

interface RuntimeWindow extends Window {
  FitAddon?: FitAddonConstructor | { FitAddon?: FitAddonConstructor };
  Terminal?: TerminalConstructor | { Terminal?: TerminalConstructor };
  define?: unknown;
  require?: unknown;
}

export interface TerminalUiApi {
  onTerminalData: (callback: (data: string) => void) => (() => void) | void;
  onTerminalExit: (callback: () => void) => (() => void) | void;
  onTerminalStatus?: (callback: (event: TerminalStatusLike) => void) => (() => void) | void;
  terminalInput: (data: string) => void;
  terminalIsRunning?: () => Promise<boolean>;
  terminalResize: (cols: number, rows: number) => void;
  terminalStart: (cols?: number, rows?: number) => Promise<boolean>;
}

export interface TerminalUiOptions {
  activityIdleMs?: number;
  api: TerminalUiApi;
  container: HTMLElement;
  onActivity?: () => void;
  onTerminalData?: (data: string) => void;
  onUserInput?: (data: string) => void | Promise<void>;
  preserveAmdLoader?: boolean;
  rightClickSelectsWord?: boolean;
  setActive?: (active: boolean) => void;
  shouldActivateOnData?: (data: string) => boolean;
  theme: TerminalTheme;
  writeStatusToTerminal?: boolean;
}

export interface TerminalUiHandle {
  fitAddon: FitAddonLike;
  term: TerminalLike;
  /** Disconnect observers, remove listeners, and dispose the terminal */
  dispose: () => void;
}

export function shouldTreatTerminalDataAsActivity(
  lastUserInputTime: number,
  now = Date.now(),
  echoWindowMs = 300,
): boolean {
  return now - lastUserInputTime >= echoWindowMs;
}

export function formatTerminalStatusLine(event: TerminalStatusLike): string {
  const detail = event.detail ? ` (${event.detail})` : '';
  return `\r\n[${event.message}${detail}]`;
}

export function coerceTerminalGeometry(
  cols: number,
  rows: number,
  fallbackCols = 80,
  fallbackRows = 24,
): { cols: number; rows: number } {
  return {
    cols: cols >= 20 ? cols : fallbackCols,
    rows: rows >= 2 ? rows : fallbackRows,
  };
}

// ---------------------------------------------------------------------------
// Async input dispatcher — allows an async gate (e.g. Copilot prep) to hold
// the Enter key while keeping subsequent keystrokes in order.
// ---------------------------------------------------------------------------

export interface InputDispatcher {
  /**
   * Forward `data` to the PTY.  If `gate` is provided, hold this data (and
   * all subsequent dispatches) until the gate settles.  If a previous gate
   * is still pending, queue behind it even without a new gate.
   */
  dispatch(data: string, gate?: Promise<void>): void;
}

export function createInputDispatcher(forward: (data: string) => void): InputDispatcher {
  let queueDepth = 0;
  let chain: Promise<void> = Promise.resolve();

  return {
    dispatch(data: string, gate?: Promise<void>): void {
      if (gate != null || queueDepth > 0) {
        queueDepth++;
        chain = chain.then(async () => {
          if (gate != null) {
            try {
              await gate;
            } catch {
              /* prep failed — still forward the keystroke */
            }
          }
          try {
            forward(data);
          } finally {
            queueDepth--;
          }
        });
      } else {
        forward(data);
      }
    },
  };
}

function getTerminalConstructor(runtimeWindow: RuntimeWindow): TerminalConstructor {
  const terminalRef = runtimeWindow.Terminal;
  if (typeof terminalRef === 'function') {
    return terminalRef;
  }
  if (terminalRef && typeof terminalRef.Terminal === 'function') {
    return terminalRef.Terminal;
  }
  throw new Error('Terminal runtime is not available.');
}

function getFitAddonConstructor(runtimeWindow: RuntimeWindow): FitAddonConstructor {
  const fitAddonRef = runtimeWindow.FitAddon;
  if (typeof fitAddonRef === 'function') {
    return fitAddonRef;
  }
  if (fitAddonRef && typeof fitAddonRef.FitAddon === 'function') {
    return fitAddonRef.FitAddon;
  }
  throw new Error('FitAddon runtime is not available.');
}

function forwardViewportPointerEvents(container: HTMLElement): () => void {
  const viewport = container.querySelector<HTMLElement>('.xterm-viewport');
  if (!viewport) return () => {};

  const eventNames = ['mousedown', 'dblclick', 'contextmenu', 'auxclick'] as const;
  const listeners = eventNames.map((eventName) => {
    const listener = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      const scrollbarWidth = viewport.offsetWidth - viewport.clientWidth;
      const rect = viewport.getBoundingClientRect();
      if (event.clientX >= rect.right - scrollbarWidth - 2) return;

      event.stopPropagation();
      event.preventDefault();
      viewport.style.pointerEvents = 'none';
      const target = document.elementFromPoint(event.clientX, event.clientY);
      viewport.style.pointerEvents = '';
      if (target) {
        target.dispatchEvent(new MouseEvent(eventName, event));
      }
    };
    viewport.addEventListener(eventName, listener);
    return [eventName, listener] as const;
  });

  return () => {
    for (const [eventName, listener] of listeners) {
      viewport.removeEventListener(eventName, listener);
    }
  };
}

export function fitTerminalSafely(fitAddon: FitAddonLike, onError?: (error: unknown) => void): boolean {
  try {
    fitAddon.fit();
    return true;
  } catch (error) {
    onError?.(error);
    return false;
  }
}

async function ensureTerminalRuntime(preserveAmdLoader: boolean): Promise<{
  FitAddon: FitAddonConstructor;
  Terminal: TerminalConstructor;
}> {
  ensureXtermAssets();

  const runtimeWindow = window as RuntimeWindow;
  const savedDefine = runtimeWindow.define;
  const savedRequire = runtimeWindow.require;

  if (preserveAmdLoader) {
    runtimeWindow.define = undefined;
    runtimeWindow.require = undefined;
  }

  try {
    await loadScript(getXtermRuntimeUrl());
    await loadScript(getXtermFitAddonUrl());
  } finally {
    if (preserveAmdLoader) {
      runtimeWindow.define = savedDefine;
      runtimeWindow.require = savedRequire;
    }
  }

  return {
    FitAddon: getFitAddonConstructor(runtimeWindow),
    Terminal: getTerminalConstructor(runtimeWindow),
  };
}

export async function initializeTerminalUi(options: TerminalUiOptions): Promise<TerminalUiHandle> {
  const { Terminal, FitAddon } = await ensureTerminalRuntime(!!options.preserveAmdLoader);

  options.container.innerHTML = '';

  const term = new Terminal({
    theme: options.theme,
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
    cursorBlink: true,
    scrollback: 3000,
    rightClickSelectsWord: options.rightClickSelectsWord,
    allowTransparency: true,
  });
  const fitAddon = new FitAddon();
  let activityTimer: number | null = null;

  term.loadAddon(fitAddon);
  term.open(options.container);
  const cleanupViewportPointerEvents = forwardViewportPointerEvents(options.container);

  const wheelHandler = (e: WheelEvent): void => {
    const lines = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY : Math.sign(e.deltaY) * 3;
    term.scrollLines(lines);
  };
  options.container.addEventListener('wheel', wheelHandler, { passive: true });

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 50);
  });
  fitTerminalSafely(fitAddon);

  const dispatcher = createInputDispatcher((data) => options.api.terminalInput(data));

  const disposeOnData = term.onData((data) => {
    const maybePromise = options.onUserInput?.(data);
    const gate =
      maybePromise != null && typeof (maybePromise as Promise<void>).then === 'function'
        ? (maybePromise as Promise<void>)
        : undefined;
    dispatcher.dispatch(data, gate);
  });

  const disposeTerminalData = options.api.onTerminalData((data) => {
    term.write(data);
    options.onTerminalData?.(data);

    const shouldActivate = options.shouldActivateOnData ? options.shouldActivateOnData(data) : false;
    if (!shouldActivate || !options.setActive) return;

    options.setActive(true);
    options.onActivity?.();
    if (activityTimer !== null) {
      window.clearTimeout(activityTimer);
    }
    activityTimer = window.setTimeout(() => {
      options.setActive?.(false);
      activityTimer = null;
    }, options.activityIdleMs ?? 1500);
  });

  const disposeTerminalExit = options.api.onTerminalExit(() => {
    term.writeln('\r\n[프로세스 종료]');
  });

  let disposeTerminalStatus: (() => void) | void;
  if (options.writeStatusToTerminal && options.api.onTerminalStatus) {
    disposeTerminalStatus = options.api.onTerminalStatus((event) => {
      term.writeln(formatTerminalStatusLine(event));
    });
  }

  const resizeObserver = new ResizeObserver(() => {
    if (options.container.clientWidth <= 0 || options.container.clientHeight <= 0) {
      return;
    }
    if (!fitTerminalSafely(fitAddon)) {
      return;
    }
    options.api.terminalResize(term.cols, term.rows);
  });
  resizeObserver.observe(options.container);

  if (options.container.clientWidth <= 0 || options.container.clientHeight <= 0 || term.cols < 20 || term.rows < 2) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 100);
    });
    if (options.container.clientWidth > 0 && options.container.clientHeight > 0) {
      fitTerminalSafely(fitAddon);
    }
  }

  const initialGeometry = coerceTerminalGeometry(term.cols, term.rows);
  if (initialGeometry.cols !== term.cols || initialGeometry.rows !== term.rows) {
    term.resize(initialGeometry.cols, initialGeometry.rows);
  }

  const isRunning = options.api.terminalIsRunning ? await options.api.terminalIsRunning() : false;
  if (!isRunning) {
    const started = await options.api.terminalStart(initialGeometry.cols, initialGeometry.rows);
    if (!started) {
      term.writeln('\r\n[터미널 시작 실패]');
    }
  } else {
    options.api.terminalResize(initialGeometry.cols, initialGeometry.rows);
  }

  return {
    term,
    fitAddon,
    dispose: () => {
      resizeObserver.disconnect();
      cleanupViewportPointerEvents();
      options.container.removeEventListener('wheel', wheelHandler as EventListener);
      disposeOnData?.dispose?.();
      disposeTerminalData?.();
      disposeTerminalExit?.();
      disposeTerminalStatus?.();
      if (activityTimer !== null) window.clearTimeout(activityTimer);
      term.dispose?.();
    },
  };
}
