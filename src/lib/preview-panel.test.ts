import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showPreviewPanel } from './preview-panel';
import type { PreviewPanelDeps } from './preview-panel';
import type {
  CreatePreviewSessionOptions,
  PreviewEngine,
  PreviewLorebookEntry,
  PreviewSession,
  PreviewSnapshot,
} from './preview-session';

interface TestEngineState {
  assets: Record<string, string> | null;
  charName: string;
  defaultVariables: string;
  description: string;
  personality: string;
  scenario: string;
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
    personality: '',
    scenario: '',
    firstMessage: '',
    lorebook: [],
    luaCode: '',
    luaHtml: '',
    luaOutput: [],
    userName: '',
    variables: {},
  };

  return {
    state,
    async initLua(code: string) {
      state.luaCode = code;
      return true;
    },
    matchLorebook() {
      return [];
    },
    onReloadDisplay() {},
    processRegex(content: string) {
      return content;
    },
    resetVars() {
      state.variables = {};
      state.luaOutput = [];
      state.luaHtml = '';
    },
    resolveAssetImages(content: string) {
      return content;
    },
    risuChatParser(content: string) {
      return content;
    },
    async runLuaButtonClick() {},
    async runLuaTrigger(_name: string, payload: string | null) {
      return payload;
    },
    async runLuaTriggerByName() {},
    setAssets(assets: Record<string, string>) {
      state.assets = assets;
    },
    setCharDescription(d: string) {
      state.description = d;
    },
    setCharPersonality(p: string) {
      state.personality = p;
    },
    setCharScenario(s: string) {
      state.scenario = s;
    },
    setCharFirstMessage(m: string) {
      state.firstMessage = m;
    },
    setCharName(n: string) {
      state.charName = n;
    },
    setChatVar(name: string, value: unknown) {
      state.variables[name] = value;
    },
    setDefaultVars(dv: string) {
      state.defaultVariables = dv;
    },
    setLorebook(lb: PreviewLorebookEntry[]) {
      state.lorebook = lb;
    },
    setUserName(n: string) {
      state.userName = n;
    },
    getLuaOutput() {
      return [...state.luaOutput];
    },
    getLuaOutputHTML() {
      return state.luaHtml;
    },
    getVariables() {
      return { ...state.variables };
    },
  };
}

function createDeps(overrides: Partial<PreviewPanelDeps> = {}): PreviewPanelDeps {
  const { fileData: fileDataOverride, ...restOverrides } = overrides;
  const defaultFileData: PreviewPanelDeps['fileData'] = {
    name: 'Toki',
    description: 'desc',
    personality: '',
    scenario: '',
    firstMessage: '안녕하세요',
    defaultVariables: '',
    css: '',
    lorebook: [],
    regex: [],
    lua: '',
  };

  return {
    fileData: {
      ...defaultFileData,
      ...fileDataOverride,
    },
    assetMap: null,
    engine: createEngine(),
    toggleFocusMode: () => true,
    exitFocusMode: () => {},
    subscribeFocusMode: (listener) => {
      listener(false);
      return () => {};
    },
    ...restOverrides,
  };
}

describe('preview-panel', () => {
  it('merges partial fileData overrides with preview defaults', () => {
    const deps = createDeps({
      fileData: {
        personality: 'cheerful and curious',
        scenario: 'a rainy afternoon',
      },
    });

    expect(deps.fileData.name).toBe('Toki');
    expect(deps.fileData.description).toBe('desc');
    expect(deps.fileData.personality).toBe('cheerful and curious');
    expect(deps.fileData.scenario).toBe('a rainy afternoon');
    expect(deps.fileData.firstMessage).toBe('안녕하세요');
  });

  it('mounts the preview workbench directly inside the given editor container', () => {
    const container = document.createElement('div');
    const deps = createDeps();

    const { dispose } = showPreviewPanel(container, deps);

    const panel = container.querySelector('.preview-panel');
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('role')).toBe('region');
    expect(panel!.querySelector('.preview-header')).not.toBeNull();
    expect(panel!.querySelector('.preview-chat-frame')).not.toBeNull();
    expect(panel!.querySelector('.preview-input-bar')).not.toBeNull();
    expect(container.querySelector('.preview-overlay')).toBeNull();

    dispose();
  });

  it('renders greeting, viewport, role injection, and typed asset controls', async () => {
    const container = document.createElement('div');
    const injectMessage = vi.fn().mockResolvedValue(undefined);
    const selectGreeting = vi.fn().mockResolvedValue(undefined);
    const setViewportSize = vi.fn().mockResolvedValue(undefined);
    const session: PreviewSession = {
      dispose() {},
      getSnapshot: () => ({
        messages: [],
        luaInitialized: false,
        variables: {},
        lorebook: [],
        loreMatches: [],
        scripts: [],
        defaultVariables: '',
        luaOutput: [],
        initState: 'idle',
        initError: null,
        runtimeError: null,
      }),
      handleSend: vi.fn().mockResolvedValue(undefined),
      injectMessage,
      initialize: vi.fn().mockResolvedValue(undefined),
      initializeLua: vi.fn().mockResolvedValue(false),
      refreshBackground: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
      selectGreeting,
      setViewportSize,
    };

    const { dispose } = showPreviewPanel(
      container,
      createDeps({
        fileData: { alternateGreetings: ['대체 인사'] },
        previewAssets: {
          icon: 'data:image/png;base64,ICON',
          manifest: [
            {
              name: 'scene',
              uri: 'data:image/png;base64,SCENE',
              ext: 'png',
              mime: 'image/png',
              type: 'asset',
              source: 'card',
            },
          ],
        },
        createSession: () => session,
      }),
    );

    const greeting = container.querySelector('.preview-tool-select') as HTMLSelectElement;
    greeting.value = '0';
    greeting.dispatchEvent(new Event('change'));
    expect(selectGreeting).toHaveBeenCalledWith(0);

    (container.querySelectorAll('.preview-viewport-group button')[2] as HTMLButtonElement).click();
    expect(setViewportSize).toHaveBeenCalledWith({ width: 390, height: 844 });

    (container.querySelector('.preview-asset-toggle') as HTMLButtonElement).click();
    (container.querySelector('.preview-asset-card') as HTMLButtonElement).click();
    const input = container.querySelector('.preview-input-textarea') as HTMLTextAreaElement;
    expect(input.value).toBe('{{asset::scene}}');

    const mode = container.querySelector('.preview-message-mode') as HTMLSelectElement;
    mode.value = 'char';
    input.value = '캐릭터 표시';
    (container.querySelector('.preview-send-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(injectMessage).toHaveBeenCalledWith('char', '캐릭터 표시'));

    dispose();
  });

  it('uses preview-specific header controls for the editor tab', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);

    const header = container.querySelector('.preview-header') as HTMLElement | null;
    const title = header?.querySelector('.preview-header-title');
    expect(title?.textContent).toContain('Toki');

    const actions = header?.querySelector('.preview-header-actions');
    const buttons = Array.from(actions?.querySelectorAll('button') ?? []);
    expect(buttons).toHaveLength(3);
    expect(buttons.every((button) => button.classList.contains('preview-action-btn'))).toBe(true);

    dispose();
  });

  it('creates the preview iframe with a sandbox that withholds dangerous iframe capabilities', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);
    try {
      const iframe = container.querySelector('.preview-chat-frame');
      const sandbox = iframe?.getAttribute('sandbox');
      const sandboxTokens = new Set((sandbox ?? '').split(/\s+/).filter(Boolean));

      expect(sandbox).toBeTruthy();
      expect(sandboxTokens.has('allow-same-origin')).toBe(false);
      expect(sandboxTokens.has('allow-top-navigation')).toBe(false);
      expect(sandboxTokens.has('allow-popups')).toBe(false);
      expect(sandboxTokens.has('allow-popups-to-escape-sandbox')).toBe(false);
      expect(sandboxTokens.has('allow-modals')).toBe(false);
    } finally {
      dispose();
    }
  });

  it('passes personality and scenario into the preview session charData', () => {
    const container = document.createElement('div');
    const createSession = vi.fn((options: CreatePreviewSessionOptions) => {
      void options;
      return {
        dispose() {},
        getSnapshot: () => ({
          messages: [],
          luaInitialized: false,
          variables: {},
          lorebook: [],
          loreMatches: [],
          scripts: [],
          defaultVariables: '',
          luaOutput: [],
          initState: 'idle' as const,
          initError: null,
          runtimeError: null,
        }),
        handleSend: vi.fn().mockResolvedValue(undefined),
        initialize: vi.fn().mockResolvedValue(undefined),
        initializeLua: vi.fn().mockResolvedValue(false),
        refreshBackground: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
      };
    });

    showPreviewPanel(
      container,
      createDeps({
        createSession,
        fileData: {
          name: 'Toki',
          description: 'desc',
          personality: 'steady and kind',
          scenario: 'at the harbor',
          firstMessage: '안녕하세요',
          alternateGreetings: ['다른 인사'],
          defaultVariables: '',
          css: '',
          backgroundEmbedding: '<div>module</div>',
          lorebook: [],
          regex: [],
          lua: '',
          _risuExt: { largePortrait: true },
        },
      }),
    );

    expect(createSession).toHaveBeenCalledTimes(1);
    const options = createSession.mock.calls[0][0];
    expect(options.charData.personality).toBe('steady and kind');
    expect(options.charData.scenario).toBe('at the harbor');
    expect(options.charData.alternateGreetings).toEqual(['다른 인사']);
    expect(options.charData.backgroundEmbedding).toBe('<div>module</div>');
    expect(options.charData.largePortrait).toBe(true);
  });

  it('dispose removes the mounted preview panel', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);

    expect(container.querySelector('.preview-panel')).not.toBeNull();
    dispose();
    expect(container.querySelector('.preview-panel')).toBeNull();
  });

  it('toggles debug drawer on debug button click', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);

    const debugDrawer = container.querySelector('.preview-debug-drawer') as HTMLElement;
    expect(debugDrawer.style.display).toBe('none');

    const buttons = container.querySelectorAll('.preview-header button');
    const debugBtn = buttons[1] as HTMLButtonElement;
    expect(debugBtn.textContent).toBe('🔧');

    debugBtn.click();
    expect(debugDrawer.style.display).toBe('flex');

    debugBtn.click();
    expect(debugDrawer.style.display).toBe('none');

    dispose();
  });

  it('does not send on Enter while IME composition is active', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);

    const chatInput = container.querySelector('.preview-input-textarea') as HTMLTextAreaElement;

    // Composing Enter should NOT call preventDefault (send not triggered)
    const composingEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(composingEvent, 'isComposing', { value: true });
    chatInput.dispatchEvent(composingEvent);

    expect(composingEvent.defaultPrevented).toBe(false);

    dispose();
  });

  it('sends on plain Enter when not composing', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);

    const chatInput = container.querySelector('.preview-input-textarea') as HTMLTextAreaElement;
    chatInput.value = '테스트 메시지';

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'isComposing', { value: false });
    chatInput.dispatchEvent(event);

    // The event should have been prevented (send triggered)
    expect(event.defaultPrevented).toBe(true);

    dispose();
  });

  it('resets textarea height to auto after session reset', async () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);

    const chatInput = container.querySelector('.preview-input-textarea') as HTMLTextAreaElement;
    // Simulate user typing that grew the textarea
    chatInput.style.height = '80px';

    // Click reset button
    const resetBtn = container.querySelector('button[aria-label="초기화"]') as HTMLButtonElement;
    expect(resetBtn).not.toBeNull();
    resetBtn.click();

    // After reset, the textarea height should be restored to 'auto'
    await vi.waitFor(() => {
      expect(chatInput.style.height).toBe('auto');
    });

    dispose();
  });

  it('toggles active class on debug button when opening/closing drawer', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);

    const buttons = container.querySelectorAll('.preview-header button');
    const debugBtn = buttons[1] as HTMLButtonElement;
    expect(debugBtn.getAttribute('aria-label')).toBe('디버그 패널');

    // Initially not active
    expect(debugBtn.classList.contains('active')).toBe(false);

    // Open debug drawer — button should gain 'active' class
    debugBtn.click();
    expect(debugBtn.classList.contains('active')).toBe(true);

    // Close debug drawer — button should lose 'active' class
    debugBtn.click();
    expect(debugBtn.classList.contains('active')).toBe(false);

    dispose();
  });

  it('toggles the temporary workspace focus mode and restores it on dispose', () => {
    const container = document.createElement('div');
    let focused = false;
    const toggleFocusMode = vi.fn(() => {
      focused = !focused;
      return focused;
    });
    const exitFocusMode = vi.fn(() => {
      focused = false;
    });
    const focusSubscription: { listener?: (nextFocused: boolean) => void } = {};
    const unsubscribeFocusMode = vi.fn();
    const subscribeFocusMode = vi.fn((listener: (nextFocused: boolean) => void) => {
      focusSubscription.listener = listener;
      listener(false);
      return unsubscribeFocusMode;
    });
    const { dispose } = showPreviewPanel(container, createDeps({ toggleFocusMode, exitFocusMode, subscribeFocusMode }));
    const focusBtn = container.querySelector('button[aria-label="프리뷰 집중 모드"]') as HTMLButtonElement;

    expect(focusBtn.getAttribute('aria-pressed')).toBe('false');

    focusBtn.click();
    expect(toggleFocusMode).toHaveBeenCalledTimes(1);
    expect(focusBtn.classList.contains('active')).toBe(true);
    expect(focusBtn.getAttribute('aria-pressed')).toBe('true');
    expect(focusBtn.title).toBe('프리뷰 집중 모드 종료');

    focusBtn.click();
    expect(toggleFocusMode).toHaveBeenCalledTimes(2);
    expect(focusBtn.classList.contains('active')).toBe(false);
    expect(focusBtn.getAttribute('aria-pressed')).toBe('false');

    focusSubscription.listener?.(true);
    expect(focusBtn.classList.contains('active')).toBe(true);
    focusSubscription.listener?.(false);
    expect(focusBtn.classList.contains('active')).toBe(false);

    focusBtn.click();
    dispose();
    expect(unsubscribeFocusMode).toHaveBeenCalledTimes(1);
    expect(exitFocusMode).toHaveBeenCalledTimes(1);
    expect(focused).toBe(false);
  });

  it('adds accessible labels to icon-only preview header buttons', () => {
    const container = document.createElement('div');
    const deps = createDeps();
    const { dispose } = showPreviewPanel(container, deps);

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.preview-header button'));
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '초기화',
      '디버그 패널',
      '프리뷰 집중 모드',
    ]);

    dispose();
  });

  // ── Diagnostics banner tests ──

  describe('diagnostics banner', () => {
    let onStateChange: ((snapshot: PreviewSnapshot) => void) | undefined;
    let currentSnapshot: PreviewSnapshot = {
      messages: [],
      luaInitialized: false,
      variables: {},
      lorebook: [],
      loreMatches: [],
      scripts: [],
      defaultVariables: '',
      luaOutput: [],
      initState: 'idle',
      initError: null,
      runtimeError: null,
    };

    const emitSnapshot = (patch: Partial<PreviewSnapshot>) => {
      currentSnapshot = { ...currentSnapshot, ...patch };
      onStateChange?.(currentSnapshot);
    };

    const createSession = vi.fn((options: CreatePreviewSessionOptions) => {
      onStateChange = options.onStateChange;
      return {
        dispose() {},
        getSnapshot: () => currentSnapshot,
        handleSend: vi.fn().mockResolvedValue(undefined),
        initialize: vi.fn(async () => {
          emitSnapshot({ initState: 'loading' });
          return new Promise<void>(() => {});
        }),
        initializeLua: vi.fn().mockResolvedValue(false),
        refreshBackground: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
      };
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    beforeEach(() => {
      currentSnapshot = {
        messages: [],
        luaInitialized: false,
        variables: {},
        lorebook: [],
        loreMatches: [],
        scripts: [],
        defaultVariables: '',
        luaOutput: [],
        initState: 'idle',
        initError: null,
        runtimeError: null,
      };
      onStateChange = undefined;
      createSession.mockClear();
    });

    it('shows a loading banner and disables reset/send controls while initialization is in flight', async () => {
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

      const container = document.createElement('div');
      showPreviewPanel(container, createDeps({ createSession }));

      expect(container.querySelector('.preview-status-banner')?.textContent).toContain('초기화');
      expect((container.querySelector('.preview-send-btn') as HTMLButtonElement).disabled).toBe(true);
      expect((container.querySelector('button[aria-label="초기화"]') as HTMLButtonElement).disabled).toBe(true);
      expect((container.querySelector('.preview-input-textarea') as HTMLTextAreaElement).disabled).toBe(true);
    });

    it('shows a persistent error banner when runtimeError is present after startup', async () => {
      const initialize = vi.fn(async () => {
        emitSnapshot({ initState: 'ready', runtimeError: 'Lua named trigger "onAttack" failed: boom' });
      });

      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

      const localCreateSession = vi.fn((options: CreatePreviewSessionOptions) => {
        onStateChange = options.onStateChange;
        return {
          dispose() {},
          getSnapshot: () => currentSnapshot,
          handleSend: vi.fn().mockResolvedValue(undefined),
          initialize,
          initializeLua: vi.fn().mockResolvedValue(false),
          refreshBackground: vi.fn().mockResolvedValue(undefined),
          reset: vi.fn().mockResolvedValue(undefined),
        };
      });

      const container = document.createElement('div');
      showPreviewPanel(container, createDeps({ createSession: localCreateSession }));

      await vi.waitFor(() => {
        expect(initialize).toHaveBeenCalledTimes(1);
      });

      const errorBanner = container.querySelector('.preview-error-banner') as HTMLElement;
      expect(errorBanner).not.toBeNull();
      expect(errorBanner.hidden).toBe(false);
      expect(errorBanner.textContent).toContain('Lua named trigger "onAttack" failed: boom');
    });

    it('catches initialize rejection so startup errors do not disappear as unhandled rejections', async () => {
      const initialize = vi.fn(async () => {
        emitSnapshot({ initState: 'error', initError: '프리뷰 초기화에 실패했습니다.' });
        throw new Error('startup boom');
      });

      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

      const localCreateSession = vi.fn((options: CreatePreviewSessionOptions) => {
        onStateChange = options.onStateChange;
        return {
          dispose() {},
          getSnapshot: () => currentSnapshot,
          handleSend: vi.fn().mockResolvedValue(undefined),
          initialize,
          initializeLua: vi.fn().mockResolvedValue(false),
          refreshBackground: vi.fn().mockResolvedValue(undefined),
          reset: vi.fn().mockResolvedValue(undefined),
        };
      });

      const container = document.createElement('div');
      showPreviewPanel(container, createDeps({ createSession: localCreateSession }));

      await vi.waitFor(() => {
        expect(initialize).toHaveBeenCalledTimes(1);
      });

      const errorBanner = container.querySelector('.preview-error-banner') as HTMLElement;
      expect(errorBanner).not.toBeNull();
      expect(errorBanner.hidden).toBe(false);
      expect(errorBanner.textContent).toContain('프리뷰 초기화에 실패했습니다.');

      // Status banner should not show loading state after error
      const statusBanner = container.querySelector('.preview-status-banner') as HTMLElement;
      expect(statusBanner.hidden).toBe(true);
    });
  });
});
