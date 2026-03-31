import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coerceTerminalGeometry,
  createInputDispatcher,
  fitTerminalSafely,
  formatTerminalStatusLine,
  initializeTerminalUi,
  shouldTreatTerminalDataAsActivity,
} from './terminal-ui';

vi.mock('./script-loader', () => ({
  ensureXtermAssets: vi.fn(),
  loadScript: vi.fn(async () => {}),
}));

vi.mock('./asset-runtime', () => ({
  getXtermFitAddonUrl: vi.fn(() => 'fit.js'),
  getXtermRuntimeUrl: vi.fn(() => 'xterm.js'),
}));

describe('terminal-ui helpers', () => {
  it('filters terminal echo activity using the configured window', () => {
    expect(shouldTreatTerminalDataAsActivity(1000, 1200, 300)).toBe(false);
    expect(shouldTreatTerminalDataAsActivity(1000, 1401, 300)).toBe(true);
  });

  it('formats terminal status lines consistently', () => {
    expect(formatTerminalStatusLine({ message: '복구 완료' })).toBe('\r\n[복구 완료]');
    expect(formatTerminalStatusLine({ message: '복구 완료', detail: 'pwsh.exe' })).toBe('\r\n[복구 완료 (pwsh.exe)]');
  });

  it('falls back to safe terminal dimensions when layout is not ready yet', () => {
    expect(coerceTerminalGeometry(0, 0)).toEqual({ cols: 80, rows: 24 });
    expect(coerceTerminalGeometry(10, 1)).toEqual({ cols: 80, rows: 24 });
    expect(coerceTerminalGeometry(120, 30)).toEqual({ cols: 120, rows: 30 });
  });
});

describe('createInputDispatcher', () => {
  const flush = () => new Promise<void>((r) => setTimeout(r, 10));

  it('forwards data immediately when no gate is active', () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));
    dispatcher.dispatch('a');
    dispatcher.dispatch('b');
    expect(forwarded).toEqual(['a', 'b']);
  });

  it('holds gated input until gate resolves', async () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));

    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });

    dispatcher.dispatch('\r', gate);
    expect(forwarded).toEqual([]);

    resolve();
    await flush();
    expect(forwarded).toEqual(['\r']);
  });

  it('queues subsequent inputs behind an active gate', async () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));

    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });

    dispatcher.dispatch('\r', gate);
    dispatcher.dispatch('n');
    dispatcher.dispatch('e');
    expect(forwarded).toEqual([]);

    resolve();
    await flush();
    expect(forwarded).toEqual(['\r', 'n', 'e']);
  });

  it('resumes immediate forwarding after gate drains', async () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));

    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });

    dispatcher.dispatch('\r', gate);
    resolve();
    await flush();
    expect(forwarded).toEqual(['\r']);

    // Subsequent dispatch should be immediate (sync path)
    dispatcher.dispatch('x');
    expect(forwarded).toEqual(['\r', 'x']);
  });

  it('still forwards data when gate rejects', async () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));

    const gate = Promise.reject(new Error('prep failed'));
    dispatcher.dispatch('\r', gate);

    await flush();
    expect(forwarded).toEqual(['\r']);
  });

  it('handles consecutive gates correctly', async () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));

    let resolve1!: () => void;
    const gate1 = new Promise<void>((r) => {
      resolve1 = r;
    });
    let resolve2!: () => void;
    const gate2 = new Promise<void>((r) => {
      resolve2 = r;
    });

    dispatcher.dispatch('a', gate1);
    dispatcher.dispatch('b', gate2);

    resolve1();
    await flush();
    // only 'a' forwarded; 'b' is still gated behind gate2
    expect(forwarded).toEqual(['a']);

    resolve2();
    await flush();
    expect(forwarded).toEqual(['a', 'b']);
  });
});

describe('fitTerminalSafely', () => {
  it('returns true when fit succeeds', () => {
    const fitAddon = { fit: () => undefined };
    expect(fitTerminalSafely(fitAddon)).toBe(true);
  });

  it('returns false and reports when fit throws', () => {
    const onError = vi.fn();
    const fitAddon = {
      fit: () => {
        throw new Error('fit failed');
      },
    };

    expect(fitTerminalSafely(fitAddon, onError)).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('initializeTerminalUi disposal', () => {
  const originalTerminal = (window as Window & { Terminal?: unknown }).Terminal;
  const originalFitAddon = (window as Window & { FitAddon?: unknown }).FitAddon;
  const originalResizeObserver = globalThis.ResizeObserver;

  afterEach(() => {
    (window as Window & { Terminal?: unknown }).Terminal = originalTerminal;
    (window as Window & { FitAddon?: unknown }).FitAddon = originalFitAddon;
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('disposes terminal onData subscription when UI is disposed', async () => {
    const disposeOnData = vi.fn();
    const termDispose = vi.fn();

    class MockTerminal {
      cols = 80;
      rows = 24;
      options = { theme: {} };
      attachCustomKeyEventHandler = vi.fn();
      clear = vi.fn();
      clearSelection = vi.fn();
      getSelection = vi.fn(() => '');
      hasSelection = vi.fn(() => false);
      loadAddon = vi.fn();
      onData = vi.fn(() => ({ dispose: disposeOnData }));
      open = vi.fn((container: HTMLElement) => {
        const viewport = document.createElement('div');
        viewport.className = 'xterm-viewport';
        container.appendChild(viewport);
      });
      resize = vi.fn();
      scrollLines = vi.fn();
      write = vi.fn();
      writeln = vi.fn();
      dispose = termDispose;

      constructor(options: unknown) {
        void options;
      }
    }

    class MockFitAddon {
      fit = vi.fn();
    }

    class MockResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();

      constructor(callback: ResizeObserverCallback) {
        void callback;
      }
    }

    (window as Window & { Terminal?: unknown }).Terminal = MockTerminal;
    (window as Window & { FitAddon?: unknown }).FitAddon = MockFitAddon;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 600 });

    const handle = await initializeTerminalUi({
      api: {
        onTerminalData: vi.fn(() => () => {}),
        onTerminalExit: vi.fn(() => () => {}),
        onTerminalStatus: vi.fn(() => () => {}),
        terminalInput: vi.fn(),
        terminalIsRunning: vi.fn(async () => true),
        terminalResize: vi.fn(),
        terminalStart: vi.fn(async () => true),
      },
      container,
      theme: {},
      writeStatusToTerminal: true,
    });

    handle.dispose();

    expect(disposeOnData).toHaveBeenCalledTimes(1);
    expect(termDispose).toHaveBeenCalledTimes(1);
  });
});
