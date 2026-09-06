import type { PreviewLoreDecorators } from './lorebook-decorators';
import { wrapCssForPreview, type PreviewParserEngine } from './preview-format';
import { renderPreviewMarkdown, type PreviewRenderMode } from './preview-renderer';
import { createDocumentPreviewRuntime, PreviewRuntimeTimeoutError, type PreviewRuntime } from './preview-runtime';
import type { RegexTraceEntry } from './content-simulation';
import { inspectPreviewAssetReferences, type PreviewAssetDiagnosticReport } from './preview-asset-diagnostics';

export interface PreviewRegexTrace extends RegexTraceEntry {
  sequence: number;
  messageIndex: number;
  surface: 'message' | 'background';
  beforeLength: number;
  afterLength: number;
  truncated: boolean;
}

export const PREVIEW_REGEX_TRACE_LIMIT = 80;
export const PREVIEW_REGEX_TRACE_TEXT_LIMIT = 3000;

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

export interface PreviewViewportSize {
  width: number;
  height: number;
}

export interface PreviewSnapshot {
  messages: PreviewMessage[];
  selectedGreetingIndex?: number;
  viewport?: PreviewViewportSize;
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
  /** Captured from the same regex pipeline execution that produced the displayed output. */
  regexTraces?: PreviewRegexTrace[];
  regexTracesDropped?: number;
  assetDiagnostics?: PreviewAssetDiagnosticReport;
}

export interface PreviewCharData {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  alternateGreetings?: string[];
  defaultVariables?: string;
  css?: string;
  backgroundEmbedding?: string;
  largePortrait?: boolean;
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
  setCharPersonality(personality: string): void;
  setCharScenario(scenario: string): void;
  setCharFirstMessage(message: string): void;
  setAssets(assets: Record<string, string>): void;
  setLorebook(lorebook: PreviewLorebookEntry[]): void;
  onReloadDisplay(callback: () => void): void;
  processRegex(
    content: string,
    scripts: PreviewRegexScript[],
    type?: string,
    onTrace?: (entry: RegexTraceEntry) => void,
  ): string;
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
  characterAvatar?: string | null;
  wrapPlainCss?: boolean;
  logPrefix?: string;
  onError?: (message: string, error: unknown) => void;
  onStateChange?: (snapshot: PreviewSnapshot) => void;
  runtime?: PreviewRuntime;
  initialGreetingIndex?: number;
  initialViewport?: PreviewViewportSize;
}

export interface PreviewSession {
  dispose(): void;
  getSnapshot(): PreviewSnapshot;
  handleSend(inputElement: HTMLTextAreaElement | HTMLInputElement): Promise<void>;
  injectMessage?(role: PreviewMessage['role'], content: string): Promise<void>;
  initialize(): Promise<void>;
  initializeLua(): Promise<boolean>;
  refreshBackground(): Promise<void>;
  reset(): Promise<void>;
  selectGreeting?(index: number): Promise<void>;
  setViewportSize?(size: PreviewViewportSize): Promise<void>;
}

function cloneMessages(messages: PreviewMessage[]): PreviewMessage[] {
  return messages.map((message) => ({ ...message }));
}

// PreviewEngine is shared. A replacement session must not reset it while a
// disposed session's already-started Lua operation is still completing.
const pendingEngineOperations = new WeakMap<PreviewEngine, Set<Promise<unknown>>>();

export function createPreviewSession({
  engine,
  charData,
  chatFrame,
  windowTarget = window,
  assetMap = null,
  characterAvatar = null,
  wrapPlainCss = true,
  logPrefix = '[Preview]',
  onError,
  onStateChange = () => {},
  runtime: providedRuntime,
  initialGreetingIndex = -1,
  initialViewport,
}: CreatePreviewSessionOptions): PreviewSession {
  const lorebook = charData.lorebook || [];
  const scripts = charData.regex || [];
  const runtime = providedRuntime ?? createDocumentPreviewRuntime(chatFrame);
  const assetDiagnostics = inspectPreviewAssetReferences(charData, assetMap);

  let previewMessages: PreviewMessage[] = [];
  let msgIndex = 0;
  let luaInitialized = false;
  let messageBridgeAttached = false;
  let documentBridgeAttached = false;
  let initState: PreviewInitState = 'idle';
  let initError: string | null = null;
  let runtimeError: string | null = null;
  let regexTraces: PreviewRegexTrace[] = [];
  let regexTraceSequence = 0;
  let regexTracesDropped = 0;
  let disposed = false;
  let selectedGreetingIndex =
    Number.isInteger(initialGreetingIndex) &&
    initialGreetingIndex >= -1 &&
    initialGreetingIndex < (charData.alternateGreetings?.length ?? 0)
      ? initialGreetingIndex
      : -1;
  let viewport: PreviewViewportSize = {
    width: Number.isFinite(initialViewport?.width) ? Math.max(1, Math.round(initialViewport!.width)) : 1024,
    height: Number.isFinite(initialViewport?.height) ? Math.max(1, Math.round(initialViewport!.height)) : 768,
  };

  async function runEngineOperation<T>(operation: () => Promise<T>): Promise<T> {
    const pending = pendingEngineOperations.get(engine) ?? new Set<Promise<unknown>>();
    pendingEngineOperations.set(engine, pending);
    const promise = operation();
    pending.add(promise);
    try {
      return await promise;
    } finally {
      pending.delete(promise);
    }
  }

  async function waitForEngineIdle(): Promise<void> {
    const pending = pendingEngineOperations.get(engine);
    if (pending?.size) await Promise.allSettled([...pending]);
  }

  function getSelectedGreeting(): string {
    if (selectedGreetingIndex < 0) return charData.firstMessage || '';
    return charData.alternateGreetings?.[selectedGreetingIndex] || '';
  }

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
      selectedGreetingIndex,
      viewport: { ...viewport },
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
      regexTraces: regexTraces.map((entry) => ({ ...entry })),
      regexTracesDropped,
      assetDiagnostics: {
        ...assetDiagnostics,
        missing: assetDiagnostics.missing.map((entry) => ({ ...entry, source: { ...entry.source } })),
      },
    };
  }

  function applyRegex(content: string, mode: string, messageIndex: number, surface: 'message' | 'background'): string {
    if (disposed) return content;
    return engine.processRegex(content, scripts, mode, (entry) => {
      if (disposed) return;
      const beforeLength = entry.before.length;
      const afterLength = entry.after.length;
      regexTraces.push({
        ...entry,
        comment: entry.comment.slice(0, 300),
        error: entry.error?.slice(0, 1000),
        before: entry.before.slice(0, PREVIEW_REGEX_TRACE_TEXT_LIMIT),
        after: entry.after.slice(0, PREVIEW_REGEX_TRACE_TEXT_LIMIT),
        sequence: ++regexTraceSequence,
        messageIndex,
        surface,
        beforeLength,
        afterLength,
        truncated: beforeLength > PREVIEW_REGEX_TRACE_TEXT_LIMIT || afterLength > PREVIEW_REGEX_TRACE_TEXT_LIMIT,
      });
      if (regexTraces.length > PREVIEW_REGEX_TRACE_LIMIT) {
        regexTraces.shift();
        regexTracesDropped++;
      }
    });
  }

  function notifyStateChange(): void {
    if (disposed) return;
    onStateChange(getSnapshot());
  }

  function resetEngineState(): void {
    engine.resetVars();
    engine.setCharName(charData.name || 'Character');
    engine.setUserName('User');
    engine.setDefaultVars(charData.defaultVariables || '');
    engine.setCharDescription(charData.description || '');
    engine.setCharPersonality(charData.personality || '');
    engine.setCharScenario(charData.scenario || '');
    engine.setCharFirstMessage(getSelectedGreeting());
    engine.setAssets(assetMap || {});
    engine.setLorebook(lorebook);
    engine.onReloadDisplay(() => {});
  }

  async function runLuaTrigger(triggerName: string, payload: string | null = null): Promise<string | null> {
    if (disposed || !luaInitialized) return payload;

    try {
      return await runEngineOperation(() => engine.runLuaTrigger(triggerName, payload));
    } catch (error) {
      if (disposed) return payload;
      runtimeError = `Lua trigger "${triggerName}" failed: ${error instanceof Error ? error.message : String(error)}`;
      notifyStateChange();
      onError?.(`Lua trigger "${triggerName}" failed`, error);
      console.warn(`${logPrefix} Lua trigger "${triggerName}" failed:`, error);
      return payload;
    }
  }

  async function runNamedTrigger(triggerName: string): Promise<void> {
    if (disposed || !luaInitialized) return;

    try {
      await runEngineOperation(() => engine.runLuaTriggerByName(triggerName));
    } catch (error) {
      if (disposed) return;
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
      firstMessageIndex: selectedGreetingIndex,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });

    if (role === 'char') {
      content = applyRegex(content, 'editoutput', chatID, 'message');
      content = (await runLuaTrigger('editOutput', content)) || '';
      if (disposed) return '';
      content = engine.risuChatParser(content, cbsOptions(true));
    } else {
      content = applyRegex(content, 'editinput', chatID, 'message');
      content = (await runLuaTrigger('editInput', content)) || '';
      if (disposed) return '';
      content = engine.risuChatParser(content, cbsOptions(true));
    }

    return transformDisplayContent(content, chatID, 'normal');
  }

  async function transformDisplayContent(rawContent: string, chatID: number, mode: PreviewRenderMode): Promise<string> {
    if (disposed) return '';
    const cbsOptions = (runVar: boolean) => ({
      runVar,
      chatID,
      messageCount: previewMessages.length + 1,
      firstMessageIndex: selectedGreetingIndex,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    // RisuAI applies editdisplay scripts while asset references still contain
    // their authored names. Resolving to data URIs first leaks the full Base64
    // value into regex capture groups and visible labels.
    let content = applyRegex(rawContent, 'editdisplay', chatID, mode === 'back' ? 'background' : 'message');
    content = engine.risuChatParser(content, cbsOptions(true));
    content = (await runLuaTrigger('editDisplay', content)) || '';
    if (disposed) return '';
    content = engine.risuChatParser(content, cbsOptions(false));
    content = engine.resolveAssetImages(content);
    content = renderPreviewMarkdown(content, mode);
    return engine.resolveAssetImages(content);
  }

  async function addMessage(
    role: PreviewMessage['role'],
    rawContent: string,
    options?: { scrollToBottom?: boolean },
  ): Promise<void> {
    if (disposed) return;
    const idx = msgIndex++;
    const content = await transformMessageContent(role, rawContent, idx);
    if (disposed) return;
    await runtime.appendMessage({
      index: idx,
      name: role === 'char' ? charData.name || 'Character' : 'User',
      avatarBg: role === 'char' ? 'var(--risu-theme-selected)' : 'var(--risu-theme-borderc)',
      avatarSrc: role === 'char' ? characterAvatar || undefined : undefined,
      largePortrait: role === 'char' && charData.largePortrait === true,
      content,
    });
    if (disposed) return;
    previewMessages.push({ role, content: rawContent });
    if (options?.scrollToBottom !== false) {
      runtime.scrollToBottom();
    }
    notifyStateChange();
  }

  async function refreshBackground(): Promise<void> {
    if (disposed) return;
    let backgroundSource = [charData.css, charData.backgroundEmbedding]
      .filter((source): source is string => typeof source === 'string' && source.trim().length > 0)
      .map((raw) =>
        wrapCssForPreview({
          raw,
          engine,
          wrapInStyleTag: wrapPlainCss,
        }),
      )
      .join('\n');

    const luaHtml = engine.getLuaOutputHTML();
    if (luaHtml) {
      backgroundSource += `\n${engine.risuChatParser(luaHtml, { runVar: true })}`;
    }

    const processed = await transformDisplayContent(backgroundSource, -1, 'back');
    if (disposed) return;
    await runtime.setBackground(processed);
    notifyStateChange();
  }

  async function reRenderMessages(): Promise<void> {
    if (disposed) return;
    const savedMessages = cloneMessages(previewMessages);
    await runtime.clearMessages();
    if (disposed) return;
    previewMessages = [];
    msgIndex = 0;

    for (const message of savedMessages) {
      await addMessage(message.role, message.content);
    }

    await refreshBackground();
  }

  async function handleBridgeMessage(data: unknown): Promise<void> {
    if (disposed) return;
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
          await runEngineOperation(() => engine.runLuaButtonClick(chatId, message.data as string));
        } catch (error) {
          if (disposed) return;
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
    if (disposed) return;
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
    if (disposed) return false;
    const effectiveLuaCode = buildEffectiveLuaCode();
    if (effectiveLuaCode == null || effectiveLuaCode.trim() === '') {
      luaInitialized = false;
      notifyStateChange();
      return luaInitialized;
    }

    luaInitialized = await runEngineOperation(() => engine.initLua(effectiveLuaCode));
    if (disposed) return false;
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
    if (disposed) return;
    previewMessages = [];
    msgIndex = 0;
    luaInitialized = false;
    initState = 'loading';
    initError = null;
    runtimeError = null;
    regexTraces = [];
    regexTraceSequence = 0;
    regexTracesDropped = 0;
    notifyStateChange();

    try {
      await waitForEngineIdle();
      if (disposed) return;
      resetEngineState();
      attachMessageBridge();
      await initializeFrameDocument();
      if (disposed) return;
      attachDocumentBridge();
      await initializeLua(true);
      if (disposed) return;

      const greeting = getSelectedGreeting();
      if (greeting) {
        await addMessage('char', greeting, { scrollToBottom: false });
      }

      await refreshBackground();
    } catch (error) {
      if (disposed) return;
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
    if (disposed) return;
    previewMessages = [];
    msgIndex = 0;
    luaInitialized = false;
    initState = 'loading';
    initError = null;
    runtimeError = null;
    regexTraces = [];
    regexTraceSequence = 0;
    regexTracesDropped = 0;
    notifyStateChange();

    try {
      await waitForEngineIdle();
      if (disposed) return;
      resetEngineState();
      await initializeFrameDocument();
      if (disposed) return;
      attachDocumentBridge();
      await initializeLua(true);
      if (disposed) return;

      const greeting = getSelectedGreeting();
      if (greeting) {
        await addMessage('char', greeting, { scrollToBottom: false });
      }

      await refreshBackground();
    } catch (error) {
      if (disposed) return;
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
    if (disposed) return;
    const text = inputElement.value.trim();
    if (!text) return;

    inputElement.value = '';
    inputElement.style.height = 'auto';

    await addMessage('user', text);
    await runLuaTrigger('input', text);

    const selectedGreeting = getSelectedGreeting();
    const response =
      selectedGreeting && previewMessages.length <= 2
        ? selectedGreeting
        : `${charData.name || 'Character'}: "${text}"에 대한 응답입니다.`;

    await runLuaTrigger('output', response);
    await addMessage('char', response);
    await refreshBackground();
  }

  async function injectMessage(role: PreviewMessage['role'], content: string): Promise<void> {
    if (disposed) return;
    const text = content.trim();
    if (!text) return;

    if (role === 'user') {
      await addMessage('user', text);
      await runLuaTrigger('input', text);
    } else {
      await runLuaTrigger('output', text);
      await addMessage('char', text);
    }
    await refreshBackground();
  }

  async function selectGreeting(index: number): Promise<void> {
    if (disposed) return;
    const greetings = charData.alternateGreetings || [];
    if (!Number.isInteger(index) || index < -1 || index >= greetings.length) {
      throw new RangeError(`Greeting index ${index} is out of range`);
    }
    selectedGreetingIndex = index;
    await reset();
  }

  async function setViewportSize(size: PreviewViewportSize): Promise<void> {
    if (disposed) return;
    viewport = {
      width: Math.max(1, Math.round(size.width)),
      height: Math.max(1, Math.round(size.height)),
    };
    if (previewMessages.length > 0) {
      await reRenderMessages();
    } else {
      await refreshBackground();
    }
    notifyStateChange();
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      detachDocumentBridge();
      detachMessageBridge();
      runtime.dispose();
    },
    getSnapshot,
    handleSend,
    injectMessage,
    initialize,
    initializeLua: () => initializeLua(false),
    refreshBackground,
    reset,
    selectGreeting,
    setViewportSize,
  };
}
