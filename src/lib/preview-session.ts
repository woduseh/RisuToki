import type { PreviewLoreDecorators } from './lorebook-decorators';
import { simpleMarkdown, wrapCssForPreview, type PreviewParserEngine } from './preview-format';
import { createDocumentPreviewRuntime, PreviewRuntimeTimeoutError, type PreviewRuntime } from './preview-runtime';

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
  /** Present (1–99) when the entry uses probabilistic activation. */
  activationPercent?: number;
  /** Parsed decorator metadata from leading @@lines, if any. */
  decorators?: PreviewLoreDecorators;
  /** Keys that triggered activation. */
  matchedKeys?: string[];
  /** Keys that suppressed activation (from @@exclude_keys). */
  excludedKeys?: string[];
  /** Effective scan depth used for this entry. */
  effectiveScanDepth?: number;
  /** The random roll (0–100) used for probabilistic activation. */
  probabilityRoll?: number;
  /** Parser warnings (decorator parse errors, clamped values, etc.). */
  warnings?: string[];
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

export type PreviewInitState = 'idle' | 'loading' | 'ready' | 'error';

export interface PreviewSnapshot {
  messages: PreviewMessage[];
  luaInitialized: boolean;
  variables: Record<string, unknown>;
  lorebook: PreviewLorebookEntry[];
  loreMatches: PreviewLoreMatch[];
  scripts: PreviewRegexScript[];
  defaultVariables: string;
  luaOutput: string[];
  initState: PreviewInitState;
  initError: string | null;
  runtimeError: string | null;
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
  triggerScripts?: unknown;
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
  matchLorebook(messages: PreviewMessage[], lorebook: PreviewLorebookEntry[], scanDepth?: number): PreviewLoreMatch[];
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
  runtime?: PreviewRuntime;
}

export interface PreviewSession {
  dispose(): void;
  getSnapshot(): PreviewSnapshot;
  handleSend(inputElement: HTMLTextAreaElement | HTMLInputElement): Promise<void>;
  initialize(): Promise<void>;
  initializeLua(): Promise<boolean>;
  refreshBackground(): Promise<void>;
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
  onStateChange = () => {},
  runtime: providedRuntime,
}: CreatePreviewSessionOptions): PreviewSession {
  const lorebook = charData.lorebook || [];
  const scripts = charData.regex || [];
  const runtime = providedRuntime ?? createDocumentPreviewRuntime(chatFrame);

  let previewMessages: PreviewMessage[] = [];
  let msgIndex = 0;
  let luaInitialized = false;
  let messageBridgeAttached = false;
  let documentBridgeAttached = false;
  let initState: PreviewInitState = 'idle';
  let initError: string | null = null;
  let runtimeError: string | null = null;

  function buildEffectiveLuaCode(): string | undefined {
    if (Array.isArray(charData.triggerScripts) && charData.triggerScripts.length > 0) {
      const codeBlocks = charData.triggerScripts.flatMap((trigger) => {
        if (!trigger || typeof trigger !== 'object') return [];
        const record = trigger as { effect?: unknown[] };
        const effects = Array.isArray(record.effect) ? record.effect : [];
        return effects.flatMap((effect) => {
          if (!effect || typeof effect !== 'object') return [];
          const entry = effect as { type?: unknown; code?: unknown };
          const code = typeof entry.code === 'string' ? entry.code : null;
          const isTriggerLua = entry.type === 'triggerlua' || (entry.type === undefined && code !== null);
          return code !== null && isTriggerLua && code.trim().length > 0 ? [code] : [];
        });
      });

      if (codeBlocks.length > 0) {
        return codeBlocks.join('\n\n');
      }
    }

    return charData.lua;
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
      luaOutput: engine.getLuaOutput(),
      initState,
      initError,
      runtimeError,
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
      runtimeError = `Lua trigger "${triggerName}" failed: ${error instanceof Error ? error.message : String(error)}`;
      notifyStateChange();
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
      runtimeError = `Lua named trigger "${triggerName}" failed: ${error instanceof Error ? error.message : String(error)}`;
      notifyStateChange();
      onError?.(`Lua named trigger "${triggerName}" failed`, error);
      console.warn(`${logPrefix} Lua named trigger "${triggerName}" failed:`, error);
    }
  }

  async function transformMessageContent(
    role: PreviewMessage['role'],
    rawContent: string,
    chatID: number,
  ): Promise<string> {
    let content = rawContent;
    const cbsOptions = (runVar: boolean) => ({
      runVar,
      chatID,
      messageCount: previewMessages.length + 1,
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

  async function addMessage(
    role: PreviewMessage['role'],
    rawContent: string,
    options?: { scrollToBottom?: boolean },
  ): Promise<void> {
    const idx = msgIndex++;
    const content = await transformMessageContent(role, rawContent, idx);
    await runtime.appendMessage({
      index: idx,
      name: role === 'char' ? charData.name || 'Character' : 'User',
      avatarBg: role === 'char' ? 'var(--risu-theme-selected)' : 'var(--risu-theme-borderc)',
      content,
    });
    previewMessages.push({ role, content: rawContent });
    if (options?.scrollToBottom !== false) {
      runtime.scrollToBottom();
    }
    notifyStateChange();
  }

  async function refreshBackground(): Promise<void> {
    let processed = wrapCssForPreview({
      raw: charData.css || '',
      engine,
      wrapInStyleTag: wrapPlainCss,
    });

    const luaHtml = engine.getLuaOutputHTML();
    if (luaHtml) {
      let parsedLuaHtml = engine.risuChatParser(luaHtml, { runVar: true });
      parsedLuaHtml = engine.resolveAssetImages(parsedLuaHtml);
      processed += parsedLuaHtml;
    }

    await runtime.setBackground(processed);
    notifyStateChange();
  }

  async function reRenderMessages(): Promise<void> {
    const savedMessages = cloneMessages(previewMessages);
    await runtime.clearMessages();
    previewMessages = [];
    msgIndex = 0;

    for (const message of savedMessages) {
      await addMessage(message.role, message.content);
    }

    await refreshBackground();
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
          runtimeError = `Lua button "${message.data}" failed: ${error instanceof Error ? error.message : String(error)}`;
          notifyStateChange();
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
    if (chatFrame.contentWindow && event.source !== (chatFrame.contentWindow as unknown as MessageEventSource)) return;
    const message = runtime.parseBridgeMessage(event.data);
    if (!message) return;
    void handleBridgeMessage(message);
  };

  const onDocumentBridgeMessage = (event: Event): void => {
    const customEvent = event as CustomEvent<unknown>;
    if (!customEvent.detail) return;
    void handleBridgeMessage(customEvent.detail);
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

  function attachDocumentBridge(): void {
    const documentRef = chatFrame.contentDocument;
    if (!documentRef || documentBridgeAttached) return;
    documentRef.addEventListener('preview-runtime-bridge', onDocumentBridgeMessage as EventListener);
    documentBridgeAttached = true;
  }

  function detachDocumentBridge(): void {
    const documentRef = chatFrame.contentDocument;
    if (!documentRef || !documentBridgeAttached) return;
    documentRef.removeEventListener('preview-runtime-bridge', onDocumentBridgeMessage as EventListener);
    documentBridgeAttached = false;
  }

  async function initializeLua(runStartTrigger = true): Promise<boolean> {
    const effectiveLuaCode = buildEffectiveLuaCode();
    if (effectiveLuaCode == null || effectiveLuaCode.trim() === '') {
      luaInitialized = false;
      notifyStateChange();
      return luaInitialized;
    }

    luaInitialized = await engine.initLua(effectiveLuaCode);
    if (luaInitialized && runStartTrigger) {
      await runLuaTrigger('start', null);
    }
    notifyStateChange();
    return luaInitialized;
  }

  async function initializeFrameDocument(): Promise<void> {
    await runtime.resetDocument();
  }

  function formatInitError(error: unknown): string {
    if (error instanceof PreviewRuntimeTimeoutError) {
      return 'Preview iframe failed to initialize within the timeout period.';
    }
    return error instanceof Error ? error.message : String(error);
  }

  async function initialize(): Promise<void> {
    previewMessages = [];
    msgIndex = 0;
    luaInitialized = false;
    initState = 'loading';
    initError = null;
    runtimeError = null;
    notifyStateChange();

    resetEngineState();
    attachMessageBridge();

    try {
      await initializeFrameDocument();
      attachDocumentBridge();
      await initializeLua(true);

      if (charData.firstMessage) {
        await addMessage('char', charData.firstMessage, { scrollToBottom: false });
      }

      await refreshBackground();
    } catch (error) {
      initState = 'error';
      initError = formatInitError(error);
      notifyStateChange();
      onError?.('Preview initialization failed', error);
      throw error;
    }

    initState = 'ready';
    notifyStateChange();
  }

  async function reset(): Promise<void> {
    previewMessages = [];
    msgIndex = 0;
    luaInitialized = false;
    initState = 'loading';
    initError = null;
    runtimeError = null;
    notifyStateChange();

    resetEngineState();

    try {
      await initializeFrameDocument();
      attachDocumentBridge();
      await initializeLua(true);

      if (charData.firstMessage) {
        await addMessage('char', charData.firstMessage, { scrollToBottom: false });
      }

      await refreshBackground();
    } catch (error) {
      initState = 'error';
      initError = formatInitError(error);
      notifyStateChange();
      onError?.('Preview reset failed', error);
      throw error;
    }

    initState = 'ready';
    notifyStateChange();
  }

  async function handleSend(inputElement: HTMLTextAreaElement | HTMLInputElement): Promise<void> {
    const text = inputElement.value.trim();
    if (!text) return;

    inputElement.value = '';
    inputElement.style.height = 'auto';

    await addMessage('user', text);
    await runLuaTrigger('input', text);

    const response =
      charData.firstMessage && previewMessages.length <= 2
        ? charData.firstMessage
        : `${charData.name || 'Character'}: "${text}"에 대한 응답입니다.`;

    await runLuaTrigger('output', response);
    await addMessage('char', response);
    await refreshBackground();
  }

  return {
    dispose() {
      detachDocumentBridge();
      detachMessageBridge();
      runtime.dispose();
    },
    getSnapshot,
    handleSend,
    initialize,
    initializeLua: () => initializeLua(false),
    refreshBackground,
    reset,
  };
}
