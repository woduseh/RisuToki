import { buildPreviewDocument, buildPreviewMessageHtml, simpleMarkdown, wrapCssForPreview, type PreviewParserEngine } from './preview-format';

export interface PreviewMessage {
  role: 'char' | 'user';
  content: string;
}

export interface PreviewLorebookEntry {
  comment?: string;
  key?: string;
  mode?: string;
  alwaysActive?: boolean;
  [key: string]: unknown;
}

export interface PreviewLoreMatch {
  index: number;
  reason: string;
}

export interface PreviewRegexScript {
  type?: string;
  comment?: string;
  find?: string;
  in?: string;
  replace?: string;
  out?: string;
  ableFlag?: boolean;
  [key: string]: unknown;
}

export interface PreviewSnapshot {
  messages: PreviewMessage[];
  luaInitialized: boolean;
  variables: Record<string, unknown>;
  lorebook: PreviewLorebookEntry[];
  loreMatches: PreviewLoreMatch[];
  scripts: PreviewRegexScript[];
  defaultVariables: string;
  luaOutput: string[];
}

export interface PreviewCharData {
  name?: string;
  description?: string;
  firstMessage?: string;
  defaultVariables?: string;
  css?: string;
  lorebook?: PreviewLorebookEntry[];
  regex?: PreviewRegexScript[];
  lua?: string;
}

export interface PreviewEngine extends PreviewParserEngine {
  resetVars(): void;
  setCharName(name: string): void;
  setUserName(name: string): void;
  setDefaultVars(defaultVariables: string): void;
  setCharDescription(description: string): void;
  setCharFirstMessage(message: string): void;
  setAssets(assets: Record<string, string>): void;
  setLorebook(lorebook: PreviewLorebookEntry[]): void;
  onReloadDisplay(callback: () => void): void;
  processRegex(content: string, scripts: PreviewRegexScript[], type?: string): string;
  resolveAssetImages(content: string): string;
  runLuaButtonClick(chatId: number, data: string): Promise<void>;
  runLuaTrigger(triggerName: string, payload: string | null): Promise<string | null>;
  runLuaTriggerByName(triggerName: string): Promise<void>;
  initLua(code: string): Promise<boolean>;
  getLuaOutput(): string[];
  getLuaOutputHTML(): string;
  getVariables(): Record<string, unknown>;
  setChatVar(name: string, value: unknown): void;
  matchLorebook(messages: PreviewMessage[], lorebook: PreviewLorebookEntry[]): PreviewLoreMatch[];
}

interface PreviewWindowLike {
  document?: Document | null;
}

export interface PreviewChatFrame {
  contentDocument: Document | null;
  contentWindow?: PreviewWindowLike | null;
}

interface PreviewWindowTarget {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

export interface CreatePreviewSessionOptions {
  engine: PreviewEngine;
  charData: PreviewCharData;
  chatFrame: PreviewChatFrame;
  windowTarget?: PreviewWindowTarget;
  assetMap?: Record<string, string> | null;
  wrapPlainCss?: boolean;
  logPrefix?: string;
  onError?: (message: string, error: unknown) => void;
  onStateChange?: (snapshot: PreviewSnapshot) => void;
}

export interface PreviewSession {
  dispose(): void;
  getSnapshot(): PreviewSnapshot;
  handleSend(inputElement: HTMLTextAreaElement | HTMLInputElement): Promise<void>;
  initialize(): Promise<void>;
  initializeLua(): Promise<boolean>;
  refreshBackground(): void;
  reset(): Promise<void>;
}

function cloneMessages(messages: PreviewMessage[]): PreviewMessage[] {
  return messages.map((message) => ({ ...message }));
}

export function createPreviewSession({
  engine,
  charData,
  chatFrame,
  windowTarget = window,
  assetMap = null,
  wrapPlainCss = true,
  logPrefix = '[Preview]',
  onError,
  onStateChange = () => {}
}: CreatePreviewSessionOptions): PreviewSession {
  const lorebook = charData.lorebook || [];
  const scripts = charData.regex || [];

  let previewMessages: PreviewMessage[] = [];
  let msgIndex = 0;
  let luaInitialized = false;
  let messageBridgeAttached = false;

  function getFrameDocument(): Document | null {
    return chatFrame.contentDocument || chatFrame.contentWindow?.document || null;
  }

  function getSnapshot(): PreviewSnapshot {
    return {
      messages: cloneMessages(previewMessages),
      luaInitialized,
      variables: engine.getVariables(),
      lorebook,
      loreMatches: previewMessages.length > 0 ? engine.matchLorebook(previewMessages, lorebook) : [],
      scripts,
      defaultVariables: charData.defaultVariables || '',
      luaOutput: engine.getLuaOutput()
    };
  }

  function notifyStateChange(): void {
    onStateChange(getSnapshot());
  }

  function resetEngineState(): void {
    engine.resetVars();
    engine.setCharName(charData.name || 'Character');
    engine.setUserName('User');
    engine.setDefaultVars(charData.defaultVariables || '');
    engine.setCharDescription(charData.description || '');
    engine.setCharFirstMessage(charData.firstMessage || '');
    engine.setAssets(assetMap || {});
    engine.setLorebook(lorebook);
    engine.onReloadDisplay(() => {});
  }

  async function runLuaTrigger(triggerName: string, payload: string | null = null): Promise<string | null> {
    if (!luaInitialized) return payload;

    try {
      return await engine.runLuaTrigger(triggerName, payload);
    } catch (error) {
      onError?.(`Lua trigger "${triggerName}" failed`, error);
      console.warn(`${logPrefix} Lua trigger "${triggerName}" failed:`, error);
      return payload;
    }
  }

  async function runNamedTrigger(triggerName: string): Promise<void> {
    if (!luaInitialized) return;

    try {
      await engine.runLuaTriggerByName(triggerName);
    } catch (error) {
      onError?.(`Lua named trigger "${triggerName}" failed`, error);
      console.warn(`${logPrefix} Lua named trigger "${triggerName}" failed:`, error);
    }
  }

  function buildChatDocument(): string {
    return buildPreviewDocument(wrapCssForPreview({
      raw: charData.css || '',
      engine,
      wrapInStyleTag: wrapPlainCss
    }));
  }

  async function transformMessageContent(role: PreviewMessage['role'], rawContent: string): Promise<string> {
    let content = rawContent;
    const cbsOptions = (runVar: boolean) => ({
      runVar,
      chatID: msgIndex,
      messageCount: previewMessages.length + 1
    });

    if (role === 'char') {
      content = engine.processRegex(content, scripts, 'editoutput');
      content = (await runLuaTrigger('editOutput', content)) || '';
      content = engine.risuChatParser(content, cbsOptions(true));
      content = engine.processRegex(content, scripts, 'editdisplay');
      content = engine.risuChatParser(content, cbsOptions(true));
      content = (await runLuaTrigger('editDisplay', content)) || '';
      content = engine.risuChatParser(content, cbsOptions(false));
    } else {
      content = engine.processRegex(content, scripts, 'editinput');
      content = (await runLuaTrigger('editInput', content)) || '';
      content = engine.risuChatParser(content, cbsOptions(true));
    }

    content = simpleMarkdown(content);
    return engine.resolveAssetImages(content);
  }

  async function addMessage(role: PreviewMessage['role'], rawContent: string): Promise<void> {
    const documentRef = getFrameDocument();
    if (!documentRef) return;

    const container = documentRef.getElementById('chat-container');
    if (!container) return;

    const idx = msgIndex++;
    const content = await transformMessageContent(role, rawContent);
    const wrapper = documentRef.createElement('div');
    wrapper.className = 'chat-message-container';
    wrapper.setAttribute('x-hashed', String(idx));
    wrapper.innerHTML = buildPreviewMessageHtml({
      index: idx,
      name: role === 'char' ? (charData.name || 'Character') : 'User',
      avatarBg: role === 'char' ? 'var(--risu-theme-selected)' : 'var(--risu-theme-borderc)',
      content
    });

    container.appendChild(wrapper);
    previewMessages.push({ role, content: rawContent });
    documentRef.documentElement.scrollTop = documentRef.documentElement.scrollHeight;
    notifyStateChange();
  }

  function refreshBackground(): void {
    const documentRef = getFrameDocument();
    if (!documentRef) return;

    const backgroundDom = documentRef.getElementById('bg-dom');
    if (!backgroundDom) return;

    let processed = wrapCssForPreview({
      raw: charData.css || '',
      engine,
      wrapInStyleTag: wrapPlainCss
    });

    const luaHtml = engine.getLuaOutputHTML();
    if (luaHtml) {
      let parsedLuaHtml = engine.risuChatParser(luaHtml, { runVar: true });
      parsedLuaHtml = engine.resolveAssetImages(parsedLuaHtml);
      processed += parsedLuaHtml;
    }

    backgroundDom.innerHTML = processed;
    notifyStateChange();
  }

  async function reRenderMessages(): Promise<void> {
    const documentRef = getFrameDocument();
    if (!documentRef) return;

    const container = documentRef.getElementById('chat-container');
    if (!container) return;

    const savedMessages = cloneMessages(previewMessages);
    container.innerHTML = '';
    previewMessages = [];
    msgIndex = 0;

    for (const message of savedMessages) {
      await addMessage(message.role, message.content);
    }

    refreshBackground();
  }

  async function handleBridgeMessage(data: unknown): Promise<void> {
    if (!data || typeof data !== 'object') return;

    const message = data as Record<string, unknown>;
    if (message.type === 'cbs-button' && typeof message.varName === 'string') {
      engine.setChatVar(message.varName, message.value);
      await reRenderMessages();
      return;
    }

    if (message.type === 'risu-btn' && typeof message.data === 'string') {
      const chatId = previewMessages.length > 0 ? previewMessages.length - 1 : 0;
      if (luaInitialized) {
        try {
          await engine.runLuaButtonClick(chatId, message.data);
        } catch (error) {
          onError?.(`Lua button "${message.data}" failed`, error);
          console.warn(`${logPrefix} Lua button "${message.data}" failed:`, error);
        }
      }
      await reRenderMessages();
      return;
    }

    if (message.type === 'risu-trigger' && typeof message.name === 'string') {
      await runNamedTrigger(message.name);
      await reRenderMessages();
    }
  }

  const onWindowMessage = (event: MessageEvent<unknown>): void => {
    if (!event.data) return;
    if (chatFrame.contentWindow && event.source !== (chatFrame.contentWindow as unknown as MessageEventSource)) return;
    void handleBridgeMessage(event.data);
  };

  function attachMessageBridge(): void {
    if (messageBridgeAttached) return;
    windowTarget.addEventListener('message', onWindowMessage);
    messageBridgeAttached = true;
  }

  function detachMessageBridge(): void {
    if (!messageBridgeAttached) return;
    windowTarget.removeEventListener('message', onWindowMessage);
    messageBridgeAttached = false;
  }

  async function initializeLua(runStartTrigger = true): Promise<boolean> {
    if (!charData.lua) {
      luaInitialized = false;
      notifyStateChange();
      return luaInitialized;
    }

    luaInitialized = await engine.initLua(charData.lua);
    if (luaInitialized && runStartTrigger) {
      await runLuaTrigger('start', null);
    }
    notifyStateChange();
    return luaInitialized;
  }

  async function initializeFrameDocument(): Promise<void> {
    const documentRef = getFrameDocument();
    if (!documentRef) return;

    documentRef.open();
    documentRef.write(buildChatDocument());
    documentRef.close();
  }

  async function initialize(): Promise<void> {
    previewMessages = [];
    msgIndex = 0;
    luaInitialized = false;

    resetEngineState();
    attachMessageBridge();
    await initializeFrameDocument();
    await initializeLua(true);

    if (charData.firstMessage) {
      await addMessage('char', charData.firstMessage);
    }

    refreshBackground();
  }

  async function reset(): Promise<void> {
    previewMessages = [];
    msgIndex = 0;
    luaInitialized = false;

    resetEngineState();
    await initializeFrameDocument();
    await initializeLua(true);

    if (charData.firstMessage) {
      await addMessage('char', charData.firstMessage);
    }

    refreshBackground();
  }

  async function handleSend(inputElement: HTMLTextAreaElement | HTMLInputElement): Promise<void> {
    const text = inputElement.value.trim();
    if (!text) return;

    inputElement.value = '';
    inputElement.style.height = 'auto';

    await addMessage('user', text);
    await runLuaTrigger('input', text);

    const response = charData.firstMessage && previewMessages.length <= 2
      ? charData.firstMessage
      : `${charData.name || 'Character'}: "${text}"에 대한 응답입니다.`;

    await runLuaTrigger('output', response);
    await addMessage('char', response);
    refreshBackground();
  }

  return {
    dispose: detachMessageBridge,
    getSnapshot,
    handleSend,
    initialize,
    initializeLua: () => initializeLua(false),
    refreshBackground,
    reset
  };
}
