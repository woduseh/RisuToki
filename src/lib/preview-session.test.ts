import { describe, expect, it, vi } from 'vitest';
import { createDocumentPreviewRuntime, PreviewRuntimeTimeoutError } from './preview-runtime';
import type { PreviewBridgeMessage } from './preview-runtime';
import { createPreviewSession } from './preview-session';
import type {
  CreatePreviewSessionOptions,
  PreviewEngine,
  PreviewLorebookEntry,
  PreviewSnapshot,
} from './preview-session';

interface TestEngineState {
  assets: Record<string, string> | null;
  cbsCalls: Array<{ chatID?: number; content: string; runVar?: boolean }>;
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
  namedTrigger: string | null;
  userName: string;
  variables: Record<string, unknown>;
}

function createEngine(): PreviewEngine & { state: TestEngineState } {
  const state: TestEngineState = {
    assets: null as Record<string, string> | null,
    cbsCalls: [],
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
    namedTrigger: null,
    userName: '',
    variables: {},
  };

  return {
    state,
    async initLua(code: string) {
      state.luaCode = code;
      return true;
    },
    matchLorebook(messages, lorebook) {
      return lorebook.flatMap((entry, index) => {
        if (entry.mode === 'folder') return [];
        const pct = entry.activationPercent as number | undefined | null;
        if (pct === 0) return [];

        const key = entry.key;
        const matched =
          entry.alwaysActive ||
          (typeof key === 'string' && key !== '' && messages.some((message) => String(message.content).includes(key)));
        if (!matched) return [];

        const result: { index: number; reason: string; activationPercent?: number } = {
          index,
          reason: entry.alwaysActive ? '항상 활성' : '키 매칭',
        };
        if (pct != null && pct > 0 && pct < 100) result.activationPercent = pct;
        return [result];
      });
    },
    onReloadDisplay() {},
    processRegex(content: string) {
      return content;
    },
    resetVars() {
      state.cbsCalls = [];
      state.variables = {};
      state.luaOutput = [];
      state.luaHtml = '';
    },
    resolveAssetImages(content: string) {
      return String(content).replace('[asset]', '<img src="data:image/png;base64,AAAA">');
    },
    risuChatParser(content: string, options?: { chatID?: number; runVar?: boolean }) {
      state.cbsCalls.push({ content, chatID: options?.chatID, runVar: options?.runVar });
      return String(content).replace('{{char}}', state.charName);
    },
    async runLuaButtonClick(chatId: number, data: string) {
      state.luaOutput.push(`button:${chatId}:${data}`);
    },
    async runLuaTrigger(name: string, payload: string | null) {
      if (name === 'start') {
        state.luaOutput.push('lua:start');
        state.luaHtml = '<div class="lua-output">lua-started</div>';
        return payload;
      }

      if (name === 'input') {
        state.variables.lastInput = payload;
        return payload;
      }

      if (name === 'output') {
        state.variables.lastOutput = payload;
        return payload;
      }

      return payload;
    },
    async runLuaTriggerByName(name: string) {
      state.namedTrigger = name;
    },
    setAssets(assets: Record<string, string>) {
      state.assets = assets;
    },
    setCharDescription(description: string) {
      state.description = description;
    },
    setCharPersonality(personality: string) {
      state.personality = personality;
    },
    setCharScenario(scenario: string) {
      state.scenario = scenario;
    },
    setCharFirstMessage(firstMessage: string) {
      state.firstMessage = firstMessage;
    },
    setCharName(charName: string) {
      state.charName = charName;
    },
    setChatVar(name: string, value: unknown) {
      state.variables[name] = value;
    },
    setDefaultVars(defaultVariables: string) {
      state.defaultVariables = defaultVariables;
    },
    setLorebook(lorebook: PreviewLorebookEntry[]) {
      state.lorebook = lorebook;
    },
    setUserName(userName: string) {
      state.userName = userName;
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

function createChatFrame() {
  const contentDocument = document.implementation.createHTMLDocument('preview-frame');
  const contentWindow = {
    document: contentDocument,
    postMessage() {},
  } as unknown as MessageEventSource & {
    document: Document;
    postMessage: (message: unknown, targetOrigin: string) => void;
  };
  return {
    contentDocument,
    contentWindow,
  };
}

function createCrossOriginLikeChatFrame() {
  const contentWindow = {
    postMessage() {},
  } as { postMessage: (message: unknown, targetOrigin: string) => void; document?: Document | null };

  Object.defineProperty(contentWindow, 'document', {
    configurable: true,
    get() {
      throw new DOMException(
        'Blocked a frame with origin "http://127.0.0.1:5173" from accessing a cross-origin frame.',
        'SecurityError',
      );
    },
  });

  return {
    contentDocument: null,
    contentWindow,
  };
}

function createNoopRuntime(): NonNullable<CreatePreviewSessionOptions['runtime']> {
  return {
    async appendMessage() {},
    async clearMessages() {},
    createBridgeMessage(message) {
      return message;
    },
    dispose() {},
    parseBridgeMessage() {
      return null;
    },
    async resetDocument() {},
    scrollToBottom() {},
    async setBackground() {},
  };
}

function createWindowTarget(): NonNullable<CreatePreviewSessionOptions['windowTarget']> & {
  dispatchMessage: (event: MessageEvent<unknown>) => void;
} {
  const listeners = new Set<(event: MessageEvent<unknown>) => void>();
  return {
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    dispatchMessage(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

function flushMessages() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function interceptSessionHtmlWrites(documentRef: Document) {
  const descriptor =
    Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML') ??
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerHTML');
  if (!descriptor?.get || !descriptor.set) {
    throw new Error('innerHTML descriptor not available');
  }
  const innerHtmlEnumerable = descriptor.enumerable ?? false;
  const innerHtmlGet = descriptor.get;
  const innerHtmlSet = descriptor.set;

  const writes: Array<{ element: Element; value: string }> = [];
  const patchedElements = new WeakSet<Element>();
  const originalCreateElement = documentRef.createElement.bind(documentRef);

  function patchElement(element: Element | null) {
    if (!element || patchedElements.has(element)) {
      return;
    }
    patchedElements.add(element);
    Object.defineProperty(element, 'innerHTML', {
      configurable: true,
      enumerable: innerHtmlEnumerable,
      get() {
        return innerHtmlGet.call(this);
      },
      set(value: string) {
        writes.push({ element: this as Element, value });
        innerHtmlSet.call(this, value);
      },
    });
  }

  documentRef.createElement = ((tagName: string, options?: ElementCreationOptions) => {
    const element = originalCreateElement(tagName, options);
    patchElement(element);
    return element;
  }) as typeof documentRef.createElement;

  patchElement(documentRef.getElementById('bg-dom'));
  patchElement(documentRef.getElementById('chat-container'));

  return {
    writes,
    restore() {
      documentRef.createElement = originalCreateElement as typeof documentRef.createElement;
    },
  };
}

describe('preview session', () => {
  it('initializes the frame, engine state, and first message', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const stateSnapshots: PreviewSnapshot[] = [];
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: 'preview description',
        firstMessage: '첫 인사 [asset]',
        defaultVariables: '{"affinity": 0}',
        css: 'body { color: red; }',
        lorebook: [{ comment: '인사', key: '첫', mode: 'normal' }],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
      assetMap: { icon: 'data:image/png;base64,AAAA' },
      onStateChange: (snapshot: PreviewSnapshot) => stateSnapshots.push(snapshot),
    });

    await session.initialize();

    const snapshot = session.getSnapshot();
    const chatText = chatFrame.contentDocument.querySelector('.chattext')?.innerHTML ?? '';
    const backgroundHtml = chatFrame.contentDocument.getElementById('bg-dom')?.innerHTML ?? '';

    expect(snapshot.luaInitialized).toBe(true);
    expect(snapshot.messages).toEqual([{ role: 'char', content: '첫 인사 [asset]' }]);
    expect(chatText).toContain('첫 인사');
    expect(chatText).toContain('data:image/png;base64,AAAA');
    expect(backgroundHtml).toContain('<style>');
    expect(backgroundHtml).toContain('lua-started');
    expect(engine.state.assets).toEqual({ icon: 'data:image/png;base64,AAAA' });
    expect(stateSnapshots.length).toBeGreaterThan(0);
  });

  it('renders richer markdown and structural html inside the message container without reparenting them out', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage:
          '# 제목\n- 첫째\n- 둘째\n[문서](https://example.com)\n<details open><summary>더보기</summary><p><u>강조</u> 내용</p></details>',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget: createWindowTarget(),
    });

    await session.initialize();

    const chatText = chatFrame.contentDocument.querySelector('.chattext');
    const heading = chatText?.querySelector('h1');
    const listItems = [...(chatText?.querySelectorAll('ul li') ?? [])].map((item) => item.textContent);
    const link = chatText?.querySelector('a[href="https://example.com"]');
    const details = chatText?.querySelector('details');

    expect(heading?.textContent).toBe('제목');
    expect(listItems).toEqual(['첫째', '둘째']);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(details?.hasAttribute('open')).toBe(true);
    expect(details?.querySelector('summary')?.textContent).toBe('더보기');
    expect(details?.querySelector('u')?.textContent).toBe('강조');
  });

  it('hydrates personality and scenario into the engine during initialization', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: 'desc',
        personality: 'cheerful and curious',
        scenario: 'a rainy afternoon',
        firstMessage: '안녕',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
      },
      chatFrame,
      windowTarget: createWindowTarget(),
      runtime: createNoopRuntime(),
    });

    await session.initialize();

    expect(engine.state.personality).toBe('cheerful and curious');
    expect(engine.state.scenario).toBe('a rainy afternoon');
  });

  it('defaults personality and scenario to empty string when omitted from charData', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: 'desc',
        firstMessage: '안녕',
      },
      chatFrame,
      windowTarget: createWindowTarget(),
      runtime: createNoopRuntime(),
    });

    await session.initialize();

    expect(engine.state.personality).toBe('');
    expect(engine.state.scenario).toBe('');
  });

  it('re-hydrates personality and scenario on reset', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        personality: 'bold',
        scenario: 'dungeon',
        firstMessage: '안녕',
      },
      chatFrame,
      windowTarget: createWindowTarget(),
      runtime: createNoopRuntime(),
    });

    await session.initialize();

    // Simulate engine state being cleared externally
    engine.state.personality = '';
    engine.state.scenario = '';

    await session.reset();

    expect(engine.state.personality).toBe('bold');
    expect(engine.state.scenario).toBe('dungeon');
  });

  it('handles user sends and records lua-triggered state', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
    });

    await session.initialize();

    const input = document.createElement('textarea');
    input.value = '안녕';
    input.style.height = '40px';

    await session.handleSend(input);

    const snapshot = session.getSnapshot();
    expect(snapshot.messages.map((message) => message.role)).toEqual(['char', 'user', 'char']);
    expect(snapshot.variables.lastInput).toBe('안녕');
    expect(snapshot.variables.lastOutput).toBe('첫 메시지');
    expect(input.value).toBe('');
    expect(input.style.height).toBe('auto');
    expect(chatFrame.contentDocument.querySelectorAll('.chat-message-container')).toHaveLength(3);
  });

  it('passes the first character response through CBS with chatID 2 so first-message flags are not off by one', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
    });

    await session.initialize();
    engine.state.cbsCalls = [];

    const input = document.createElement('textarea');
    input.value = '안녕';
    input.style.height = '40px';

    await session.handleSend(input);

    const charRenderCalls = engine.state.cbsCalls.filter(
      (call) => call.content === '첫 메시지' && call.runVar === true,
    );
    expect(charRenderCalls[0]?.chatID).toBe(2);
  });

  it('does not activate lorebook entries from the preview-generated response text alone', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [{ comment: 'Response-only lore', key: '응답입니다', mode: 'normal' }],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
    });

    await session.initialize();

    const input = document.createElement('textarea');
    input.value = '안녕';
    input.style.height = '40px';

    await session.handleSend(input);

    const snapshot = session.getSnapshot();
    expect(snapshot.messages.map((message) => message.role)).toEqual(['char', 'user', 'char']);
    expect(snapshot.loreMatches).toEqual([]);
  });

  it('accepts iframe bridge messages only from the active frame and current runtime token, then detaches cleanly', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const messageTarget = createWindowTarget();
    const runtime = createDocumentPreviewRuntime(chatFrame);
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [{ comment: '선택', key: '첫', mode: 'normal' }],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget: messageTarget,
      runtime,
    });

    await session.initialize();

    messageTarget.dispatchMessage(
      new MessageEvent('message', {
        data: { type: 'cbs-button', varName: 'choice', value: '외부' },
        source: null,
      }),
    );
    await flushMessages();

    expect(session.getSnapshot().variables.choice).toBeUndefined();

    messageTarget.dispatchMessage(
      new MessageEvent('message', {
        data: { type: 'cbs-button', varName: 'choice', value: '위조됨' },
        source: chatFrame.contentWindow as unknown as MessageEventSource,
      }),
    );
    await flushMessages();

    expect(session.getSnapshot().variables.choice).toBeUndefined();

    messageTarget.dispatchMessage(
      new MessageEvent('message', {
        data: runtime.createBridgeMessage({ type: 'cbs-button', varName: 'choice', value: '내부' }),
        source: chatFrame.contentWindow as unknown as MessageEventSource,
      }),
    );
    await flushMessages();

    expect(session.getSnapshot().variables.choice).toBe('내부');

    session.dispose();
    messageTarget.dispatchMessage(
      new MessageEvent('message', {
        data: runtime.createBridgeMessage({ type: 'cbs-button', varName: 'choice', value: '무시됨' }),
        source: chatFrame.contentWindow as unknown as MessageEventSource,
      }),
    );
    await flushMessages();

    expect(session.getSnapshot().variables.choice).toBe('내부');
  });

  it('initializes safely when the iframe document is unavailable and contentWindow.document is cross-origin blocked', async () => {
    const engine = createEngine();
    const chatFrame = createCrossOriginLikeChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
      runtime: createNoopRuntime(),
    });

    await expect(session.initialize()).resolves.toBeUndefined();
  });

  it('disposes safely when contentWindow.document is cross-origin blocked', () => {
    const engine = createEngine();
    const chatFrame = createCrossOriginLikeChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
      runtime: createNoopRuntime(),
    });

    expect(() => session.dispose()).not.toThrow();
  });

  it('resets safely when the iframe document is unavailable and contentWindow.document is cross-origin blocked', async () => {
    const engine = createEngine();
    const chatFrame = createCrossOriginLikeChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
      runtime: createNoopRuntime(),
    });

    await expect(session.reset()).resolves.toBeUndefined();
  });

  it('processes document-runtime button clicks through the local bridge listener', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const runtime = createDocumentPreviewRuntime(chatFrame);
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '<button risu-btn="advance">다음</button>',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
      runtime,
    });

    await session.initialize();

    const button = chatFrame.contentDocument.querySelector('button[risu-btn="advance"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    button?.click();
    await flushMessages();

    expect(engine.state.luaOutput).toContain('button:0:advance');
  });

  it('initializes lua from triggerScripts when the standalone lua field is blank', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '',
        triggerScripts: [
          {
            comment: 'start',
            type: 'start',
            effect: [{ type: 'triggerlua', code: 'function onStart(id)\n  boot = true\nend' }],
          },
          {
            comment: 'manual',
            type: 'manual',
            effect: [{ type: 'triggerlua', code: 'function onButtonClick(id, data)\n  clicked = data\nend' }],
          },
        ],
      } as CreatePreviewSessionOptions['charData'] & { triggerScripts: unknown[] },
      chatFrame,
      windowTarget,
    });

    await session.initialize();

    expect(session.getSnapshot().luaInitialized).toBe(true);
    expect(engine.state.luaCode).toContain('function onStart(id)');
    expect(engine.state.luaCode).toContain('function onButtonClick(id, data)');
  });

  it('routes risu-trigger button names to named trigger execution', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '<button risu-trigger="onAttack">공격</button>',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
    });

    await session.initialize();

    const button = chatFrame.contentDocument.querySelector(
      'button[risu-trigger="onAttack"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    button?.click();
    await flushMessages();

    expect(engine.state.namedTrigger).toBe('onAttack');
  });

  it('documents the secure runtime direction: initialization should not require document.write from the parent session', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const writeSpy = vi.spyOn(chatFrame.contentDocument, 'write');
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: 'body { color: red; }',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
    });

    await session.initialize();

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('documents the secure runtime direction: the message send path should not require parent-side innerHTML injection', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지 [asset]',
        defaultVariables: '',
        css: 'body { color: red; }',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
      assetMap: { icon: 'data:image/png;base64,AAAA' },
    });
    await session.initialize();

    const tracker = interceptSessionHtmlWrites(chatFrame.contentDocument);

    try {
      const input = document.createElement('textarea');
      input.value = '안녕';
      await session.handleSend(input);
    } finally {
      tracker.restore();
    }

    expect(tracker.writes).toHaveLength(0);
  });

  it('does not scroll to bottom during initial first-message render', async () => {
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const runtime = createDocumentPreviewRuntime(chatFrame);
    const scrollSpy = vi.spyOn(runtime, 'scrollToBottom');
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: Array.from({ length: 30 }, (_, index) => `줄 ${index + 1}`).join('\n'),
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
      runtime,
    });

    await session.initialize();

    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('reports idle -> loading -> ready across initialize', async () => {
    const snapshots: PreviewSnapshot[] = [];
    const session = createPreviewSession({
      engine: createEngine(),
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame: createChatFrame(),
      windowTarget: createWindowTarget(),
      runtime: createNoopRuntime(),
      onStateChange: (snapshot) => snapshots.push(snapshot),
    });

    expect(session.getSnapshot().initState).toBe('idle');

    await session.initialize();

    expect(snapshots.map((snapshot) => snapshot.initState)).toContain('loading');
    expect(session.getSnapshot()).toMatchObject({
      initState: 'ready',
      initError: null,
      runtimeError: null,
    });
  });

  it('captures initError when resetDocument rejects with PreviewRuntimeTimeoutError', async () => {
    const onError = vi.fn();
    const runtime = {
      ...createNoopRuntime(),
      resetDocument: vi.fn().mockRejectedValue(new PreviewRuntimeTimeoutError()),
    };
    const session = createPreviewSession({
      engine: createEngine(),
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame: createChatFrame(),
      windowTarget: createWindowTarget(),
      runtime,
      onError,
    });

    await expect(session.initialize()).rejects.toBeInstanceOf(PreviewRuntimeTimeoutError);
    expect(session.getSnapshot().initState).toBe('error');
    expect(session.getSnapshot().initError).toContain('iframe');
    expect(onError).toHaveBeenCalled();
  });

  it('stores runtimeError after a post-ready trigger failure and clears it on reset', async () => {
    const engine = createEngine();
    engine.runLuaTriggerByName = vi.fn().mockRejectedValue(new Error('boom'));
    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '<button risu-trigger="onAttack">공격</button>',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
    });

    await session.initialize();
    const button = chatFrame.contentDocument.querySelector('button[risu-trigger="onAttack"]') as HTMLButtonElement;
    button.click();
    await flushMessages();

    expect(session.getSnapshot().runtimeError).toContain('onAttack');

    await session.reset();

    expect(session.getSnapshot().runtimeError).toBeNull();
  });

  it('sets error state when initializeLua fails after loading has started', async () => {
    const engine = createEngine();
    engine.initLua = vi.fn().mockRejectedValue(new Error('lua boom'));
    const snapshots: PreviewSnapshot[] = [];
    const onError = vi.fn();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame: createChatFrame(),
      windowTarget: createWindowTarget(),
      runtime: createNoopRuntime(),
      onStateChange: (snapshot) => snapshots.push(snapshot),
      onError,
    });

    await expect(session.initialize()).rejects.toThrow('lua boom');
    expect(session.getSnapshot().initState).toBe('error');
    expect(session.getSnapshot().initError).toContain('lua boom');
    expect(onError).toHaveBeenCalled();
    expect(snapshots.at(-1)?.initState).toBe('error');
  });

  it('sets error state when refreshBackground fails during initialize', async () => {
    const runtime = {
      ...createNoopRuntime(),
      setBackground: vi.fn().mockRejectedValue(new Error('bg fail')),
    };
    const onError = vi.fn();
    const session = createPreviewSession({
      engine: createEngine(),
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
      },
      chatFrame: createChatFrame(),
      windowTarget: createWindowTarget(),
      runtime,
      onError,
    });

    await expect(session.initialize()).rejects.toThrow('bg fail');
    expect(session.getSnapshot().initState).toBe('error');
    expect(session.getSnapshot().initError).toContain('bg fail');
    expect(onError).toHaveBeenCalled();
  });

  it('sets error state when initializeLua fails during reset', async () => {
    const engine = createEngine();
    const onError = vi.fn();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Toki',
        description: '',
        firstMessage: '첫 메시지',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame: createChatFrame(),
      windowTarget: createWindowTarget(),
      runtime: createNoopRuntime(),
      onError,
    });

    await session.initialize();
    expect(session.getSnapshot().initState).toBe('ready');

    engine.initLua = vi.fn().mockRejectedValue(new Error('reset lua boom'));

    await expect(session.reset()).rejects.toThrow('reset lua boom');
    expect(session.getSnapshot().initState).toBe('error');
    expect(session.getSnapshot().initError).toContain('reset lua boom');
    expect(onError).toHaveBeenCalled();
  });
});

// ── Hinano button parity: state round-trip / rerender / request injection ──

describe('preview session: button-driven state parity (Hinano regression)', () => {
  it('named trigger (risu-trigger) can set state that survives rerender', async () => {
    // Simulates Hinano's Status Display buttons: a risu-trigger button fires
    // a named trigger that calls setState, then display re-renders. The state
    // must persist through the rerender cycle.
    const engine = createEngine();
    // Override runLuaTriggerByName to simulate setState behavior:
    // In RisuAI, the trigger calls setState(id, "mood", "happy") which does
    // setChatVar(id, "__mood", json.encode("happy"))
    engine.runLuaTriggerByName = vi.fn(async (name: string) => {
      engine.state.namedTrigger = name;
      // Simulate what Lua setState would do:
      engine.setChatVar('__mood', JSON.stringify('happy'));
    });

    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Hinano',
        description: '',
        firstMessage: '<button risu-trigger="setMood">기분 변경</button>',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
    });

    await session.initialize();

    // Click the trigger button
    const button = chatFrame.contentDocument.querySelector(
      'button[risu-trigger="setMood"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    button?.click();
    await flushMessages();

    // State must survive the rerender that happens after trigger execution
    const snapshot = session.getSnapshot();
    expect(engine.runLuaTriggerByName).toHaveBeenCalledWith('setMood');
    expect(snapshot.variables.__mood).toBe(JSON.stringify('happy'));
  });

  it('button-driven display refresh re-renders messages after state change', async () => {
    // After a risu-trigger button click, handleBridgeMessage calls
    // reRenderMessages(). This test verifies that messages are actually
    // cleared and re-added (display refresh visibility).
    const engine = createEngine();
    const appendCalls: Array<{ index: number; content: string }> = [];
    const clearCalls: number[] = [];

    const runtime: NonNullable<CreatePreviewSessionOptions['runtime']> = {
      async appendMessage(msg) {
        appendCalls.push({ index: msg.index, content: msg.content });
      },
      async clearMessages() {
        clearCalls.push(1);
      },
      createBridgeMessage(message) {
        return message;
      },
      dispose() {},
      parseBridgeMessage(data) {
        return data as PreviewBridgeMessage | null;
      },
      async resetDocument() {},
      scrollToBottom() {},
      async setBackground() {},
    };

    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Hinano',
        description: '',
        firstMessage: '안녕하세요',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
      runtime,
    });

    await session.initialize();

    // Record counts after init
    const initAppendCount = appendCalls.length;
    expect(initAppendCount).toBe(1); // first message

    // Simulate a risu-trigger bridge message (as if button was clicked)
    const bridgeEvent = new CustomEvent('preview-runtime-bridge', {
      detail: { type: 'risu-trigger', name: 'onAction' },
    });
    chatFrame.contentDocument.dispatchEvent(bridgeEvent);
    await flushMessages();

    // reRenderMessages should have cleared and re-added
    expect(clearCalls.length).toBeGreaterThanOrEqual(1);
    expect(appendCalls.length).toBeGreaterThan(initAppendCount);
  });

  it('setChatVar state set by trigger reaches snapshot variables (request processing parity)', async () => {
    // In RisuAI, state set via setState/setChatVar during a trigger is
    // available in the request processing pipeline. In preview, this means
    // the snapshot variables must reflect the state after trigger execution.
    const engine = createEngine();
    engine.runLuaTriggerByName = vi.fn(async () => {
      // Simulate trigger setting multiple state vars (like Hinano's HP/status)
      engine.setChatVar('__hp', '100');
      engine.setChatVar('__status', '"normal"');
      engine.setChatVar('__location', '"academy"');
    });

    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const stateSnapshots: PreviewSnapshot[] = [];
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Hinano',
        description: '',
        firstMessage: '<button risu-trigger="initBattle">전투 시작</button>',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
      onStateChange: (snapshot) => stateSnapshots.push(snapshot),
    });

    await session.initialize();

    const button = chatFrame.contentDocument.querySelector(
      'button[risu-trigger="initBattle"]',
    ) as HTMLButtonElement | null;
    button?.click();
    await flushMessages();

    // The final snapshot must contain all state vars set by the trigger
    const finalSnapshot = session.getSnapshot();
    expect(finalSnapshot.variables.__hp).toBe('100');
    expect(finalSnapshot.variables.__status).toBe('"normal"');
    expect(finalSnapshot.variables.__location).toBe('"academy"');
  });

  it('risu-btn button click preserves state set during Lua button handler', async () => {
    // risu-btn fires runLuaButtonClick. If the handler sets state via
    // setChatVar, it must persist through the subsequent rerender.
    const engine = createEngine();
    engine.runLuaButtonClick = vi.fn(async (_chatId: number, data: string) => {
      engine.state.luaOutput.push(`button:${_chatId}:${data}`);
      // Simulate Lua setState during button click:
      engine.setChatVar('__action', JSON.stringify(data));
    });

    const chatFrame = createChatFrame();
    const windowTarget = createWindowTarget();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Hinano',
        description: '',
        firstMessage: '<button risu-btn="attack">공격</button>',
        defaultVariables: '',
        css: '',
        lorebook: [],
        regex: [],
        lua: '-- lua script',
      },
      chatFrame,
      windowTarget,
    });

    await session.initialize();

    const button = chatFrame.contentDocument.querySelector('button[risu-btn="attack"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    button?.click();
    await flushMessages();

    const snapshot = session.getSnapshot();
    expect(snapshot.variables.__action).toBe(JSON.stringify('attack'));
  });

  it('queued scenario: defaultVariables with __-prefixed state are available after init', async () => {
    // Some cards pre-seed state via defaultVariables. The __-prefixed vars
    // should be accessible just like regular vars for the request pipeline.
    const engine = createEngine();
    const chatFrame = createChatFrame();
    const session = createPreviewSession({
      engine,
      charData: {
        name: 'Hinano',
        description: '',
        firstMessage: '안녕',
        defaultVariables: '__hp = 100\n__status = normal\naffinity = 0',
        css: '',
        lorebook: [],
        regex: [],
      },
      chatFrame,
      windowTarget: createWindowTarget(),
      runtime: createNoopRuntime(),
    });

    await session.initialize();

    // defaultVariables should be set on the engine
    expect(engine.state.defaultVariables).toBe('__hp = 100\n__status = normal\naffinity = 0');
  });
});
