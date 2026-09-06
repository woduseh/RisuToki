import { buildPreviewDebugClipboardText, renderPreviewDebugHtml } from './preview-debug';
import { createIframePreviewRuntime } from './preview-runtime';
import { createPreviewSession } from './preview-session';
import type {
  CreatePreviewSessionOptions,
  PreviewCharData,
  PreviewEngine,
  PreviewSession,
  PreviewSnapshot,
} from './preview-session';
import { reportRuntimeError } from './runtime-feedback';
import {
  createPreviewWorkbench,
  PREVIEW_VIEWPORT_PRESETS,
  type PreviewAssetCatalog,
  type PreviewViewportPreset,
  type PreviewViewportPresetId,
} from './preview-workbench';

export interface PreviewPanelViewState {
  greetingIndex: number;
  viewportPreset: PreviewViewportPresetId;
  debugOpen: boolean;
  activeDebugTab: 'variables' | 'lorebook' | 'lua' | 'regex' | 'assets';
  inputDraft: string;
  messageMode: 'conversation' | 'user' | 'char';
}

import type { PreviewSourceTarget } from './preview-asset-diagnostics';
export type { PreviewSourceTarget } from './preview-asset-diagnostics';

export interface PreviewPanelHandle {
  dispose(): void;
  getViewState(): PreviewPanelViewState;
  /** Hide the mounted session, including a detached debug drawer, without resetting it. */
  setVisible(visible: boolean): void;
}

export interface PreviewPanelDeps {
  fileData: PreviewCharData & {
    globalNote?: string;
    triggerScripts?: unknown;
    _risuExt?: Record<string, unknown>;
  };
  darkMode?: boolean;
  /** Loaded asset map (name → data URI). When null, skipped. */
  assetMap: Record<string, string> | null;
  /** Typed asset metadata used by the avatar and asset gallery. */
  previewAssets?: PreviewAssetCatalog | null;
  /** The PreviewEngine singleton used for CBS parsing. */
  engine: PreviewEngine;
  /** Status bar callback. */
  setStatus?: (message: string) => void;
  /** Toggle the temporary workspace focus layout and return its next state. */
  toggleFocusMode: () => boolean;
  /** Restore the normal workspace layout when this preview is disposed. */
  exitFocusMode: () => void;
  /** Observe focus changes caused by workspace controls outside this panel. */
  subscribeFocusMode: (listener: (focused: boolean) => void) => () => void;
  /** Optional factory for testing — defaults to the real `createPreviewSession`. */
  createSession?: (options: CreatePreviewSessionOptions) => PreviewSession;
  initialViewState?: Partial<PreviewPanelViewState>;
  onOpenSource?: (target: PreviewSourceTarget) => void;
}

interface DebugDragState {
  x: number;
  y: number;
}

/**
 * Build the full preview workbench inside an editor-tab container.
 *
 * Returns a `dispose` function that tears down the panel and listeners.
 */
export function showPreviewPanel(container: HTMLElement, deps: PreviewPanelDeps): PreviewPanelHandle {
  const {
    engine,
    fileData,
    assetMap,
    previewAssets,
    setStatus,
    toggleFocusMode,
    exitFocusMode,
    subscribeFocusMode,
    createSession: sessionFactory,
  } = deps;
  const makeSession = sessionFactory ?? createPreviewSession;

  const charData: PreviewCharData = {
    name: fileData.name || 'Character',
    description: fileData.description || '',
    personality: fileData.personality || '',
    scenario: fileData.scenario || '',
    firstMessage: fileData.firstMessage || '',
    alternateGreetings: fileData.alternateGreetings || [],
    css: fileData.css || '',
    backgroundEmbedding: fileData.backgroundEmbedding || '',
    largePortrait:
      fileData.largePortrait ??
      (typeof fileData._risuExt?.largePortrait === 'boolean' ? fileData._risuExt.largePortrait : false),
    defaultVariables: fileData.defaultVariables || '',
    lua: fileData.lua || '',
    triggerScripts: fileData.triggerScripts || [],
    lorebook: fileData.lorebook || [],
    regex: fileData.regex || [],
  };

  const initial = deps.initialViewState;
  const requestedGreeting = initial?.greetingIndex ?? -1;
  let greetingIndex =
    Number.isInteger(requestedGreeting) &&
    requestedGreeting >= -1 &&
    requestedGreeting < charData.alternateGreetings!.length
      ? requestedGreeting
      : -1;
  let viewportPreset =
    PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === initial?.viewportPreset) ?? PREVIEW_VIEWPORT_PRESETS[0];
  let debugOpen = initial?.debugOpen === true;
  let activeDebugTab: PreviewPanelViewState['activeDebugTab'] = [
    'variables',
    'lorebook',
    'lua',
    'regex',
    'assets',
  ].includes(initial?.activeDebugTab ?? '')
    ? initial!.activeDebugTab!
    : 'variables';
  let disposed = false;
  let visible = true;
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;
  let cleanupDebugResize: (() => void) | undefined;
  // Assigned after the DOM callbacks are created.
  // eslint-disable-next-line prefer-const
  let session: PreviewSession;

  // ══════════════ Build UI ══════════════

  const panel = document.createElement('div');
  panel.className = 'preview-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', `${charData.name} 프리뷰`);

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'preview-header';
  const headerLeft = document.createElement('span');
  headerLeft.className = 'preview-header-title';
  headerLeft.textContent = `${charData.name} — 로컬 프리뷰`;
  headerLeft.title = '실제 AI 모델 응답이 아닌 CBS·스크립트·메시지 표시 테스트입니다.';
  const headerBtns = document.createElement('div');
  headerBtns.className = 'preview-header-actions';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'preview-action-btn';
  resetBtn.textContent = '↻';
  resetBtn.title = '초기화';
  resetBtn.setAttribute('aria-label', '초기화');

  const debugBtn = document.createElement('button');
  debugBtn.className = 'preview-action-btn';
  debugBtn.textContent = '🔧';
  debugBtn.title = '디버그 패널';
  debugBtn.setAttribute('aria-label', '디버그 패널');

  const focusBtn = document.createElement('button');
  focusBtn.className = 'preview-action-btn';
  focusBtn.textContent = '⛶';
  focusBtn.title = '프리뷰 집중 모드';
  focusBtn.setAttribute('aria-label', '프리뷰 집중 모드');
  focusBtn.setAttribute('aria-pressed', 'false');
  const applyFocusButtonState = (focused: boolean) => {
    focusBtn.classList.toggle('active', focused);
    focusBtn.setAttribute('aria-pressed', String(focused));
    focusBtn.title = focused ? '프리뷰 집중 모드 종료' : '프리뷰 집중 모드';
  };
  const unsubscribeFocusMode = subscribeFocusMode(applyFocusButtonState);

  headerBtns.appendChild(resetBtn);
  headerBtns.appendChild(debugBtn);
  headerBtns.appendChild(focusBtn);
  header.appendChild(headerLeft);
  header.appendChild(headerBtns);

  // ── Chat iframe ──
  const chatFrame = document.createElement('iframe');
  chatFrame.className = 'preview-chat-frame';
  chatFrame.setAttribute('sandbox', 'allow-scripts');
  const frameStage = document.createElement('div');
  frameStage.className = 'preview-frame-stage';
  const frameShell = document.createElement('div');
  frameShell.className = 'preview-frame-shell';
  frameShell.dataset.viewport = 'desktop';
  frameShell.appendChild(chatFrame);
  frameStage.appendChild(frameShell);

  // ── Diagnostics banners ──
  const statusBanner = document.createElement('div');
  statusBanner.className = 'preview-status-banner';
  statusBanner.hidden = true;

  const errorBanner = document.createElement('div');
  errorBanner.className = 'preview-error-banner';
  errorBanner.hidden = true;

  // ── Input bar ──
  const inputBar = document.createElement('div');
  inputBar.className = 'preview-input-bar';
  const chatInput = document.createElement('textarea');
  chatInput.className = 'preview-input-textarea';
  chatInput.placeholder = '메시지를 입력하세요...';
  chatInput.rows = 1;
  chatInput.value = initial?.inputDraft ?? '';
  const messageMode = document.createElement('select');
  messageMode.className = 'preview-message-mode';
  messageMode.setAttribute('aria-label', '프리뷰 메시지 표시 방식');
  for (const [value, label] of [
    ['conversation', '대화'],
    ['user', '사용자만'],
    ['char', '캐릭터만'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    messageMode.appendChild(option);
  }
  messageMode.value = ['conversation', 'user', 'char'].includes(initial?.messageMode ?? '')
    ? initial!.messageMode!
    : 'conversation';
  const sendBtn = document.createElement('button');
  sendBtn.className = 'preview-send-btn';
  sendBtn.textContent = '전송';
  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
  inputBar.appendChild(chatInput);
  inputBar.appendChild(messageMode);
  inputBar.appendChild(sendBtn);

  function insertAssetToken(name: string): void {
    const token = `{{asset::${name}}}`;
    const start = chatInput.selectionStart ?? chatInput.value.length;
    const end = chatInput.selectionEnd ?? start;
    chatInput.value = `${chatInput.value.slice(0, start)}${token}${chatInput.value.slice(end)}`;
    chatInput.selectionStart = chatInput.selectionEnd = start + token.length;
    chatInput.dispatchEvent(new Event('input'));
    chatInput.focus();
  }

  function applyViewport(preset: PreviewViewportPreset): void {
    if (disposed) return;
    viewportPreset = preset;
    frameShell.dataset.viewport = preset.id;
    frameShell.style.width = preset.id === 'desktop' ? '100%' : `min(100%, ${preset.width}px)`;
    void session.setViewportSize?.({ width: preset.width, height: preset.height });
  }

  const workbench = createPreviewWorkbench(
    document,
    charData.alternateGreetings || [],
    previewAssets || null,
    {
      onGreetingChange: (index) => {
        if (disposed) return;
        greetingIndex = index;
        return session.selectGreeting?.(index);
      },
      onViewportChange: applyViewport,
      onAssetInsert: insertAssetToken,
    },
    { greetingIndex, viewportPreset: viewportPreset.id },
  );
  frameShell.dataset.viewport = viewportPreset.id;
  frameShell.style.width = viewportPreset.id === 'desktop' ? '100%' : `min(100%, ${viewportPreset.width}px)`;
  if (deps.onOpenSource) {
    const source = document.createElement('button');
    source.type = 'button';
    source.className = 'preview-tool-button';
    source.dataset.action = 'open-greeting-source';
    source.textContent = '원문 열기';
    source.setAttribute('aria-label', '선택한 첫 메시지 원문 열기');
    source.addEventListener('click', () => {
      if (!disposed) deps.onOpenSource!({ type: 'greeting', index: greetingIndex });
    });
    workbench.toolbar.insertBefore(source, workbench.toolbar.children[1]);
  }

  // ── Debug drawer (hidden by default) ──
  const debugDrawer = document.createElement('div');
  debugDrawer.className = 'preview-debug-drawer';
  debugDrawer.style.display = debugOpen ? 'flex' : 'none';
  debugBtn.classList.toggle('active', debugOpen);

  const debugTabs = document.createElement('div');
  debugTabs.className = 'preview-debug-tabs';
  const tabDefs = [
    { id: 'variables', label: '변수' },
    { id: 'lorebook', label: '로어북' },
    { id: 'lua', label: 'Lua' },
    { id: 'regex', label: '정규식' },
    { id: 'assets', label: '에셋' },
  ];
  for (const td of tabDefs) {
    const tab = document.createElement('button');
    tab.className = 'preview-debug-tab' + (td.id === activeDebugTab ? ' active' : '');
    tab.textContent = td.label;
    tab.addEventListener('click', () => {
      activeDebugTab = td.id as PreviewPanelViewState['activeDebugTab'];
      debugTabs.querySelectorAll('.preview-debug-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      updateDebugPanel();
    });
    debugTabs.appendChild(tab);
  }
  // Copy debug button
  const debugCopyBtn = document.createElement('button');
  debugCopyBtn.className = 'preview-debug-copy-btn';
  debugCopyBtn.textContent = '📋 복사';
  debugCopyBtn.title = '디버그 정보 전체 복사';
  debugTabs.appendChild(debugCopyBtn);

  // ── Debug detach/dock button ──
  let debugDetached = false;
  const debugDragOffset: DebugDragState = { x: 0, y: 0 };

  const debugDetachBtn = document.createElement('button');
  debugDetachBtn.className = 'preview-debug-copy-btn';
  debugDetachBtn.textContent = '⇱ 분리';
  debugDetachBtn.title = '디버그 패널 분리 (플로팅)';
  debugDetachBtn.addEventListener('click', () => {
    if (debugDetached) dockDebugPanel();
    else detachDebugPanel();
  });
  debugTabs.appendChild(debugDetachBtn);

  function onDebugDragMove(e: MouseEvent): void {
    debugDrawer.style.left = e.clientX - debugDragOffset.x + 'px';
    debugDrawer.style.top = e.clientY - debugDragOffset.y + 'px';
  }

  function onDebugDragEnd(): void {
    debugTabs.style.cursor = 'grab';
    document.removeEventListener('mousemove', onDebugDragMove);
    document.removeEventListener('mouseup', onDebugDragEnd);
  }

  function onDebugDragStart(e: MouseEvent): void {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    e.preventDefault();
    const rect = debugDrawer.getBoundingClientRect();
    debugDragOffset.x = e.clientX - rect.left;
    debugDragOffset.y = e.clientY - rect.top;
    debugDrawer.style.transform = '';
    debugTabs.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onDebugDragMove);
    document.addEventListener('mouseup', onDebugDragEnd);
  }

  function detachDebugPanel(): void {
    debugDetached = true;
    debugDetachBtn.textContent = '⇲ 도킹';
    debugDetachBtn.title = '디버그 패널 도킹 (복귀)';
    document.body.appendChild(debugDrawer);
    debugDrawer.classList.add('preview-debug-floating');
    applyPanelVisibility();
    debugDrawer.style.left = '50%';
    debugDrawer.style.top = '50%';
    debugDrawer.style.transform = 'translate(-50%, -50%)';

    // Make tabs a drag handle
    debugTabs.style.cursor = 'grab';
    debugTabs.addEventListener('mousedown', onDebugDragStart);
  }

  function dockDebugPanel(): void {
    debugDetached = false;
    debugDetachBtn.textContent = '⇱ 분리';
    debugDetachBtn.title = '디버그 패널 분리 (플로팅)';
    debugDrawer.classList.remove('preview-debug-floating');
    debugDrawer.style.left = '';
    debugDrawer.style.top = '';
    debugDrawer.style.transform = '';
    panel.appendChild(debugDrawer);
    applyPanelVisibility();
    debugTabs.style.cursor = '';
    debugTabs.removeEventListener('mousedown', onDebugDragStart);
  }

  const debugContent = document.createElement('div');
  debugContent.className = 'preview-debug-content';
  debugDrawer.appendChild(debugTabs);
  debugDrawer.appendChild(debugContent);
  debugContent.addEventListener('click', (event) => {
    if (disposed || !deps.onOpenSource || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>('[data-preview-source]');
    if (!button) return;
    const type = button.dataset.previewSource;
    if (type === 'lua') deps.onOpenSource({ type });
    else if (type === 'asset' || type === 'asset-reference') {
      const index = Number(button.dataset.diagnosticIndex);
      const missing =
        Number.isInteger(index) && index >= 0 ? session.getSnapshot().assetDiagnostics?.missing[index] : undefined;
      if (missing) deps.onOpenSource(type === 'asset' ? { type: 'asset', name: missing.name } : missing.source);
    } else if (type === 'lorebook' || type === 'regex') {
      const index = Number(button.dataset.sourceIndex);
      if (Number.isInteger(index) && index >= 0) deps.onOpenSource({ type, index });
    }
  });

  // ── Debug resizer (between input bar and debug drawer) ──
  const debugResizer = document.createElement('div');
  debugResizer.className = 'preview-debug-resizer';
  debugResizer.style.display = debugOpen ? '' : 'none';
  function applyPanelVisibility(): void {
    panel.style.display = visible ? '' : 'none';
    debugDrawer.style.display = visible && debugOpen ? 'flex' : 'none';
    debugResizer.style.display = visible && debugOpen && !debugDetached ? '' : 'none';
  }

  function setVisible(nextVisible: boolean): void {
    if (disposed) return;
    visible = nextVisible;
    if (!visible) {
      cleanupDebugResize?.();
      onDebugDragEnd();
    }
    applyPanelVisibility();
  }
  debugResizer.addEventListener('mousedown', (e) => {
    if (debugDetached) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = debugDrawer.getBoundingClientRect().height;
    const onMove = (ev: MouseEvent): void => {
      const delta = startY - ev.clientY;
      const newH = Math.max(80, Math.min(startH + delta, panel.getBoundingClientRect().height - 200));
      debugDrawer.style.height = newH + 'px';
    };
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    cleanupDebugResize?.();
    cleanupDebugResize = onUp;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // ── Session ──
  function updateDebugPanel(): void {
    if (disposed || !session) return;
    const snapshot = session.getSnapshot();
    const scrollTop = debugContent.scrollTop;
    const openSections = new Set(
      [...debugContent.querySelectorAll<HTMLDetailsElement>('details[open][data-debug-section]')].map(
        (section) => section.dataset.debugSection,
      ),
    );
    debugContent.innerHTML = renderPreviewDebugHtml({
      activeTab: activeDebugTab,
      snapshot,
      luaInitButtonId: 'main-preview-lua-init',
      sourceLinks: !!deps.onOpenSource,
    });
    for (const section of debugContent.querySelectorAll<HTMLDetailsElement>('details[data-debug-section]')) {
      section.open = openSections.has(section.dataset.debugSection);
    }
    debugContent.scrollTop = scrollTop;

    if (!snapshot.luaInitialized) {
      const button = debugContent.querySelector('#main-preview-lua-init') as HTMLButtonElement | null;
      if (button) {
        button.addEventListener('click', async () => {
          button.textContent = '초기화 중...';
          button.disabled = true;
          await session.initializeLua();
          updateDebugPanel();
        });
      }
    }
  }

  function applySnapshot(snapshot: PreviewSnapshot): void {
    if (disposed) return;
    const loading = snapshot.initState === 'loading';
    const errorMessage = snapshot.initState === 'error' ? snapshot.initError : snapshot.runtimeError;

    statusBanner.hidden = !loading;
    statusBanner.textContent = loading ? '프리뷰 초기화 중...' : '';

    errorBanner.hidden = !errorMessage;
    errorBanner.textContent = errorMessage ?? '';

    chatInput.disabled = loading;
    messageMode.disabled = loading;
    sendBtn.disabled = loading;
    resetBtn.disabled = loading;
    workbench.setLoading(loading);
  }

  session = makeSession({
    engine,
    charData,
    chatFrame,
    windowTarget: window,
    assetMap,
    characterAvatar: previewAssets?.icon || assetMap?.['__source:char'] || null,
    runtime: createIframePreviewRuntime(chatFrame, window),
    initialGreetingIndex: greetingIndex,
    initialViewport: { width: viewportPreset.width, height: viewportPreset.height },
    wrapPlainCss: true,
    logPrefix: '[Preview]',
    onError: (message, error) => {
      if (disposed) return;
      reportRuntimeError({
        context: message,
        error,
        logPrefix: '[Preview]',
        setStatus,
      });
    },
    onStateChange: (snapshot) => {
      applySnapshot(snapshot);
      if (debugOpen) updateDebugPanel();
    },
  });

  function disposePreview(): void {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(initializeFrame);
    if (copyTimeout) clearTimeout(copyTimeout);
    cleanupDebugResize?.();
    onDebugDragEnd();
    session.dispose();
    unsubscribeFocusMode();
    exitFocusMode();
    if (debugDetached) debugDrawer.remove();
    panel.remove();
  }

  resetBtn.addEventListener('click', async () => {
    chatInput.style.height = 'auto';
    await session.reset();
    if (debugOpen) updateDebugPanel();
  });

  async function submitPreviewInput(): Promise<void> {
    if (disposed) return;
    if (messageMode.value === 'conversation') {
      await session.handleSend(chatInput);
    } else {
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';
      chatInput.style.height = 'auto';
      await session.injectMessage?.(messageMode.value === 'user' ? 'user' : 'char', text);
    }
  }

  sendBtn.addEventListener('click', () => {
    void submitPreviewInput();
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void submitPreviewInput();
    }
  });

  debugCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(buildPreviewDebugClipboardText(session.getSnapshot())).then(() => {
      if (disposed) return;
      debugCopyBtn.textContent = '✅ 복사됨';
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        debugCopyBtn.textContent = '📋 복사';
      }, 1500);
    });
  });

  debugBtn.addEventListener('click', () => {
    debugOpen = !debugOpen;
    applyPanelVisibility();
    debugBtn.classList.toggle('active', debugOpen);
    if (debugOpen) updateDebugPanel();
  });

  focusBtn.addEventListener('click', () => {
    applyFocusButtonState(toggleFocusMode());
  });

  // ── Assemble ──
  panel.appendChild(header);
  const localNotice = document.createElement('div');
  localNotice.className = 'preview-simulation-note';
  localNotice.textContent = '로컬 표시·스크립트 테스트예요. 대화 모드는 모의 응답을 사용해요.';
  panel.appendChild(localNotice);
  panel.appendChild(statusBanner);
  panel.appendChild(errorBanner);
  panel.appendChild(workbench.toolbar);
  panel.appendChild(workbench.assetDrawer);
  panel.appendChild(frameStage);
  panel.appendChild(inputBar);
  panel.appendChild(debugResizer);
  panel.appendChild(debugDrawer);
  container.appendChild(panel);

  // Initialize iframe after it's in the DOM
  if (debugOpen) updateDebugPanel();
  const initializeFrame = requestAnimationFrame(async () => {
    if (disposed) return;
    try {
      await session.initialize();
    } catch {
      // Startup errors are surfaced via initState/initError in the snapshot;
      // catching here prevents unhandled promise rejections.
    }
  });

  return {
    dispose: disposePreview,
    setVisible,
    getViewState: () => ({
      greetingIndex,
      viewportPreset: viewportPreset.id,
      debugOpen,
      activeDebugTab,
      inputDraft: chatInput.value,
      messageMode: messageMode.value as PreviewPanelViewState['messageMode'],
    }),
  };
}
