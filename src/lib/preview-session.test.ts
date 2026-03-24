import { describe, expect, it, vi } from 'vitest';
import { createDocumentPreviewRuntime } from './preview-runtime';
import { createPreviewSession } from './preview-session';
import type { CreatePreviewSessionOptions, PreviewEngine, PreviewLorebookEntry, PreviewSnapshot } from './preview-session';

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
  namedTrigger: string | null;
  userName: string;
  variables: Record<string, unknown>;
}

function createEngine(): PreviewEngine & { state: TestEngineState } {
  const state: TestEngineState = {
    assets: null as Record<string, string> | null,
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
    variables: {}
  };

  return {
    state,
    async initLua(code: string) {
      state.luaCode = code;
      return true;
    },
    matchLorebook(messages, lorebook) {
      return lorebook.flatMap((entry, index) => {
        const key = entry.key;
        return typeof key === 'string' && messages.some((message) => String(message.content).includes(key))
          ? [{ index, reason: '키 매칭' }]
          : [];
      });
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
      return String(content).replace('[asset]', '<img src="data:image/png;base64,AAAA">');
    },
    risuChatParser(content: string) {
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
    }
  };
}

function createChatFrame() {
  const contentDocument = document.implementation.createHTMLDocument('preview-frame');
  const contentWindow = {
    document: contentDocument,
    postMessage() {},
  } as unknown as MessageEventSource & { document: Document; postMessage: (message: unknown, targetOrigin: string) => void };
  return {
    contentDocument,
    contentWindow
  };
}

function createWindowTarget(): NonNullable<CreatePreviewSessionOptions['windowTarget']> & { dispatchMessage: (event: MessageEvent<unknown>) => void } {
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
    }
  };
}

function flushMessages() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function interceptSessionHtmlWrites(documentRef: Document) {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
    ?? Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerHTML');
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
      }
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
    }
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
        lua: '-- lua script'
      },
      chatFrame,
      windowTarget,
      assetMap: { icon: 'data:image/png;base64,AAAA' },
      onStateChange: (snapshot: PreviewSnapshot) => stateSnapshots.push(snapshot)
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
        lua: '-- lua script'
      },
      chatFrame,
      windowTarget
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
        lua: '-- lua script'
      },
      chatFrame,
      windowTarget: messageTarget,
      runtime
    });

    await session.initialize();

    messageTarget.dispatchMessage(new MessageEvent('message', {
      data: { type: 'cbs-button', varName: 'choice', value: '외부' },
      source: null
    }));
    await flushMessages();

    expect(session.getSnapshot().variables.choice).toBeUndefined();

    messageTarget.dispatchMessage(new MessageEvent('message', {
      data: { type: 'cbs-button', varName: 'choice', value: '위조됨' },
      source: chatFrame.contentWindow as unknown as MessageEventSource
    }));
    await flushMessages();

    expect(session.getSnapshot().variables.choice).toBeUndefined();

    messageTarget.dispatchMessage(new MessageEvent('message', {
      data: runtime.createBridgeMessage({ type: 'cbs-button', varName: 'choice', value: '내부' }),
      source: chatFrame.contentWindow as unknown as MessageEventSource
    }));
    await flushMessages();

    expect(session.getSnapshot().variables.choice).toBe('내부');

    session.dispose();
    messageTarget.dispatchMessage(new MessageEvent('message', {
      data: runtime.createBridgeMessage({ type: 'cbs-button', varName: 'choice', value: '무시됨' }),
      source: chatFrame.contentWindow as unknown as MessageEventSource
    }));
    await flushMessages();

    expect(session.getSnapshot().variables.choice).toBe('내부');
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
        lua: '-- lua script'
      },
      chatFrame,
      windowTarget
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
        lua: '-- lua script'
      },
      chatFrame,
      windowTarget,
      assetMap: { icon: 'data:image/png;base64,AAAA' }
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
});
