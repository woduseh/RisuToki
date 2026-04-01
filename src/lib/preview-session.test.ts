import { describe, expect, it, vi } from 'vitest';
import { createDocumentPreviewRuntime, PreviewRuntimeTimeoutError } from './preview-runtime';
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
});
