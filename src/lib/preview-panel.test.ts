import { describe, expect, it, vi } from 'vitest';
import { showPreviewPanel } from './preview-panel';
import type { PreviewPanelDeps } from './preview-panel';
import type { PreviewEngine, PreviewLorebookEntry } from './preview-session';

interface TestEngineState {
  assets: Record<string, string> | null;
  charName: string;
  defaultVariables: string;
  description: string;
  firstMessage: string;
  lorebook: PreviewLorebookEntry[];
  luaCode: string;
  luaHtml: string;
  luaOutput: string[];
  userName: string;
  variables: Record<string, unknown>;
}

function createEngine(): PreviewEngine & { state: TestEngineState } {
  const state: TestEngineState = {
    assets: null,
    charName: '',
    defaultVariables: '',
    description: '',
    firstMessage: '',
    lorebook: [],
    luaCode: '',
    luaHtml: '',
    luaOutput: [],
    userName: '',
    variables: {}
  };

  return {
    state,
    async initLua(code: string) {
      state.luaCode = code;
      return true;
    },
    matchLorebook() { return []; },
    onReloadDisplay() {},
    processRegex(content: string) { return content; },
    resetVars() {
      state.variables = {};
      state.luaOutput = [];
      state.luaHtml = '';
    },
    resolveAssetImages(content: string) { return content; },
    risuChatParser(content: string) { return content; },
    async runLuaButtonClick() {},
    async runLuaTrigger(_name: string, payload: string | null) { return payload; },
    async runLuaTriggerByName() {},
    setAssets(assets: Record<string, string>) { state.assets = assets; },
    setCharDescription(d: string) { state.description = d; },
    setCharFirstMessage(m: string) { state.firstMessage = m; },
    setCharName(n: string) { state.charName = n; },
    setChatVar(name: string, value: unknown) { state.variables[name] = value; },
    setDefaultVars(dv: string) { state.defaultVariables = dv; },
    setLorebook(lb: PreviewLorebookEntry[]) { state.lorebook = lb; },
    setUserName(n: string) { state.userName = n; },
    getLuaOutput() { return [...state.luaOutput]; },
    getLuaOutputHTML() { return state.luaHtml; },
    getVariables() { return { ...state.variables }; }
  };
}

function createDeps(overrides: Partial<PreviewPanelDeps> = {}): PreviewPanelDeps {
  return {
    fileData: {
      name: 'Toki',
      description: 'desc',
      firstMessage: '안녕하세요',
      defaultVariables: '',
      css: '',
      lorebook: [],
      regex: [],
      lua: ''
    },
    assetMap: null,
    engine: createEngine(),
    ...overrides
  };
}

describe('preview-panel', () => {
  it('creates the overlay inside the given container', () => {
    const container = document.createElement('div');
    const deps = createDeps();

    const { dispose } = showPreviewPanel(container, deps);

    const overlay = container.querySelector('.preview-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.querySelector('.preview-panel')).not.toBeNull();
    expect(overlay!.querySelector('.preview-header')).not.toBeNull();
    expect(overlay!.querySelector('.preview-chat-frame')).not.toBeNull();
    expect(overlay!.querySelector('.preview-input-bar')).not.toBeNull();

    dispose();
  });

  it('creates the preview iframe with a sandbox attribute for untrusted preview content', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);
    try {
      const iframe = container.querySelector('.preview-chat-frame');
      expect(iframe?.getAttribute('sandbox')).toBeTruthy();
    } finally {
      dispose();
    }
  });

  it('closes overlay when close button is clicked', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    showPreviewPanel(container, deps);

    const closeBtn = container.querySelector('.preview-header button:last-child') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(container.querySelector('.preview-overlay')).toBeNull();
  });

  it('calls popoutPreview callback on popout button click', async () => {
    const container = document.createElement('div');
    const popoutPreview = vi.fn().mockResolvedValue(undefined);
    const deps = createDeps({ popoutPreview });
    showPreviewPanel(container, deps);

    const buttons = container.querySelectorAll('.preview-header button');
    const popoutBtn = buttons[0] as HTMLButtonElement;
    expect(popoutBtn.textContent).toBe('↗');

    popoutBtn.click();
    await vi.waitFor(() => {
      expect(popoutPreview).toHaveBeenCalledTimes(1);
    });

    const callArg = popoutPreview.mock.calls[0][0];
    expect(callArg.name).toBe('Toki');
    expect(callArg.assets).toBeNull();
  });

  it('dispose removes the overlay', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);

    expect(container.querySelector('.preview-overlay')).not.toBeNull();
    dispose();
    expect(container.querySelector('.preview-overlay')).toBeNull();
  });

  it('toggles debug drawer on debug button click', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);

    const debugDrawer = container.querySelector('.preview-debug-drawer') as HTMLElement;
    expect(debugDrawer.style.display).toBe('none');

    const buttons = container.querySelectorAll('.preview-header button');
    const debugBtn = buttons[2] as HTMLButtonElement;
    expect(debugBtn.textContent).toBe('🔧');

    debugBtn.click();
    expect(debugDrawer.style.display).toBe('flex');

    debugBtn.click();
    expect(debugDrawer.style.display).toBe('none');

    dispose();
  });
});
