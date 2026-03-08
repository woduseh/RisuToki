import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dockPanel,
  isPanelPoppedOut,
  popOutEditorPanel,
  popOutPanel,
  removePoppedOut,
  updatePopoutButtons,
} from './popout-window';
import type { PopoutDeps } from './popout-window';

/* ---------- helpers ---------- */

function makeDeps(overrides: Partial<PopoutDeps> = {}): PopoutDeps {
  return {
    layoutState: { itemsVisible: true, terminalVisible: true, refsPos: 'sidebar' },
    rebuildLayout: vi.fn(),
    setStatus: vi.fn(),
    getEditorInstance: vi.fn(() => null),
    setEditorInstance: vi.fn(),
    createOrSwitchEditor: vi.fn(),
    tabMgr: {
      activeTabId: null,
      openTabs: [],
      renderTabs: vi.fn(),
    },
    fitTerminal: vi.fn(),
    ...overrides,
  };
}

/* Stub window.tokiAPI for all tests */
const stubTokiAPI = {
  popoutPanel: vi.fn(async () => true),
  closePopout: vi.fn(async () => true),
  setEditorPopoutData: vi.fn(async () => 'req-123'),
};

beforeEach(() => {
  (window as unknown as Record<string, unknown>).tokiAPI = stubTokiAPI;
  vi.clearAllMocks();
  // Ensure clean state between tests
  removePoppedOut('sidebar');
  removePoppedOut('editor');
  removePoppedOut('terminal');
  removePoppedOut('refs');
});

/* ---------- tests ---------- */

describe('isPanelPoppedOut / removePoppedOut', () => {
  it('returns false for unknown panels', () => {
    expect(isPanelPoppedOut('sidebar')).toBe(false);
  });

  it('tracks panels after popOutPanel', async () => {
    const deps = makeDeps();
    await popOutPanel('sidebar', deps);
    expect(isPanelPoppedOut('sidebar')).toBe(true);
  });

  it('removePoppedOut clears state without IPC', () => {
    // Force add via popOutPanel first
    const deps = makeDeps();
    popOutPanel('terminal', deps);
    // Clear
    removePoppedOut('terminal');
    expect(isPanelPoppedOut('terminal')).toBe(false);
    // closePopout should NOT have been called
    expect(stubTokiAPI.closePopout).not.toHaveBeenCalled();
  });
});

describe('popOutPanel', () => {
  it('calls tokiAPI.popoutPanel and applies layout state', async () => {
    const deps = makeDeps();
    await popOutPanel('sidebar', deps);

    expect(stubTokiAPI.popoutPanel).toHaveBeenCalledWith('sidebar', null);
    expect(deps.layoutState.itemsVisible).toBe(false);
    expect(deps.rebuildLayout).toHaveBeenCalled();
    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('팝아웃'));
  });

  it('is a no-op when already popped out', async () => {
    const deps = makeDeps();
    await popOutPanel('sidebar', deps);
    vi.clearAllMocks();

    await popOutPanel('sidebar', deps);
    expect(stubTokiAPI.popoutPanel).not.toHaveBeenCalled();
  });

  it('forwards requestId to IPC', async () => {
    const deps = makeDeps();
    await popOutPanel('refs', deps, 'custom-req');
    expect(stubTokiAPI.popoutPanel).toHaveBeenCalledWith('refs', 'custom-req');
  });
});

describe('popOutEditorPanel', () => {
  it('sends editor content and creates popout window', async () => {
    const mockEditor = { getValue: () => 'hello', dispose: vi.fn() };
    const mockTab = {
      id: 'tab-1',
      label: 'main.lua',
      language: 'lua',
      getValue: () => 'hello',
      setValue: vi.fn(),
    };
    const deps = makeDeps({
      getEditorInstance: () => mockEditor,
      tabMgr: {
        activeTabId: 'tab-1',
        openTabs: [mockTab],
        renderTabs: vi.fn(),
      },
    });

    await popOutEditorPanel(null, deps);

    expect(stubTokiAPI.setEditorPopoutData).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 'tab-1',
        content: 'hello',
        language: 'lua',
      }),
    );
    expect(stubTokiAPI.popoutPanel).toHaveBeenCalledWith('editor', 'req-123');
    expect(isPanelPoppedOut('editor')).toBe(true);
    expect(mockEditor.dispose).toHaveBeenCalled();
    expect(deps.setEditorInstance).toHaveBeenCalledWith(null);
  });

  it('skips image tabs', async () => {
    const deps = makeDeps({
      tabMgr: {
        activeTabId: 'img',
        openTabs: [{ id: 'img', label: 'pic', language: '_image', getValue: () => '', setValue: null }],
        renderTabs: vi.fn(),
      },
    });

    await popOutEditorPanel(null, deps);
    expect(stubTokiAPI.popoutPanel).not.toHaveBeenCalled();
  });
});

describe('dockPanel', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('closes popout and restores layout for non-editor panels', async () => {
    const deps = makeDeps();
    await popOutPanel('terminal', deps);
    vi.clearAllMocks();

    dockPanel('terminal', deps);

    expect(stubTokiAPI.closePopout).toHaveBeenCalledWith('terminal');
    expect(isPanelPoppedOut('terminal')).toBe(false);
    expect(deps.layoutState.terminalVisible).toBe(true);
    expect(deps.rebuildLayout).toHaveBeenCalled();
    // fitTerminal is deferred via setTimeout(50)
    vi.advanceTimersByTime(60);
    expect(deps.fitTerminal).toHaveBeenCalled();
  });

  it('re-opens editor tab when docking editor panel', async () => {
    const mockTab = {
      id: 'tab-1',
      label: 'main.lua',
      language: 'lua',
      getValue: () => 'code',
      setValue: vi.fn(),
    };
    const deps = makeDeps({
      getEditorInstance: () => ({ getValue: () => 'code', dispose: vi.fn() }),
      tabMgr: {
        activeTabId: 'tab-1',
        openTabs: [mockTab],
        renderTabs: vi.fn(),
      },
    });

    await popOutEditorPanel(null, deps);
    vi.clearAllMocks();

    dockPanel('editor', deps);

    expect(deps.createOrSwitchEditor).toHaveBeenCalledWith(mockTab);
    expect(deps.tabMgr.renderTabs).toHaveBeenCalled();
  });

  it('is a no-op when panel is not popped out', () => {
    const deps = makeDeps();
    dockPanel('sidebar', deps);
    expect(stubTokiAPI.closePopout).not.toHaveBeenCalled();
  });
});

describe('updatePopoutButtons', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('toggles button text based on popout state', async () => {
    document.body.innerHTML = '<button data-popout-panel="sidebar">↗</button>';
    const deps = makeDeps();

    await popOutPanel('sidebar', deps);
    updatePopoutButtons();

    const btn = document.querySelector('[data-popout-panel="sidebar"]') as HTMLElement;
    expect(btn.textContent).toBe('📌');
    expect(btn.title).toBe('도킹 (복원)');

    dockPanel('sidebar', deps);
    updatePopoutButtons();

    expect(btn.textContent).toBe('↗');
    expect(btn.title).toBe('팝아웃 (분리)');
  });
});
