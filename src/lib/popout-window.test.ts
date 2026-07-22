import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPanelPoppedOut, popOutEditorPanel, popOutPanel, removePoppedOut } from './popout-window';
import type { PopoutDeps } from './popout-window';

function makeDeps(overrides: Partial<PopoutDeps> = {}): PopoutDeps {
  return {
    setPanelPoppedOut: vi.fn(),
    refitWorkspace: vi.fn(),
    setStatus: vi.fn(),
    getEditorInstance: vi.fn(() => null),
    setEditorInstance: vi.fn(),
    createOrSwitchEditor: vi.fn(),
    tabMgr: {
      activeTabId: null,
      openTabs: [],
      renderTabs: vi.fn(),
    },
    ...overrides,
  };
}

const stubTokiAPI = {
  popoutPanel: vi.fn(async () => true),
  setEditorPopoutData: vi.fn(async () => 'req-123'),
};

beforeEach(() => {
  (window as unknown as Record<string, unknown>).tokiAPI = stubTokiAPI;
  vi.clearAllMocks();
  removePoppedOut('editor');
  removePoppedOut('terminal');
  removePoppedOut('refs');
  document.body.innerHTML = '';
});

describe('fixed workspace popouts', () => {
  it.each(['terminal', 'refs'] as const)('pops out the supported %s panel through workspace state', async (panelId) => {
    const deps = makeDeps();

    await popOutPanel(panelId, deps, 'request-id');

    expect(stubTokiAPI.popoutPanel).toHaveBeenCalledWith(panelId, 'request-id');
    expect(isPanelPoppedOut(panelId)).toBe(true);
    expect(deps.setPanelPoppedOut).toHaveBeenCalledWith(panelId, true);
    expect(deps.refitWorkspace).toHaveBeenCalledOnce();
    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('팝아웃'));
  });

  it('does not request a duplicate popout for the same panel', async () => {
    const deps = makeDeps();
    await popOutPanel('terminal', deps);
    vi.clearAllMocks();

    await popOutPanel('terminal', deps);

    expect(stubTokiAPI.popoutPanel).not.toHaveBeenCalled();
    expect(deps.setPanelPoppedOut).not.toHaveBeenCalled();
  });

  it('removes tracked state without changing workspace state', async () => {
    const deps = makeDeps();
    await popOutPanel('refs', deps);
    vi.clearAllMocks();

    removePoppedOut('refs');

    expect(isPanelPoppedOut('refs')).toBe(false);
    expect(deps.setPanelPoppedOut).not.toHaveBeenCalled();
  });
});

describe('editor popout', () => {
  it('sends editor content and creates a popout window', async () => {
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
      expect.objectContaining({ tabId: 'tab-1', content: 'hello', language: 'lua' }),
    );
    expect(stubTokiAPI.popoutPanel).toHaveBeenCalledWith('editor', 'req-123');
    expect(isPanelPoppedOut('editor')).toBe(true);
    expect(mockEditor.dispose).toHaveBeenCalled();
    expect(deps.setEditorInstance).toHaveBeenCalledWith(null);
  });

  it('shows the inline docking hint while the editor is popped out', async () => {
    const container = document.createElement('div');
    container.id = 'editor-container';
    document.body.appendChild(container);
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
      tabMgr: { activeTabId: 'tab-1', openTabs: [mockTab], renderTabs: vi.fn() },
    });

    await popOutEditorPanel(null, deps);

    expect(container.textContent).toContain('팝아웃 창에서 작업 중');
    expect(container.textContent).toContain('도킹하면 여기로 복원됩니다');
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
