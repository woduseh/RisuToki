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

export interface PreviewPanelDeps {
  fileData: PreviewCharData & { globalNote?: string; triggerScripts?: unknown };
  darkMode?: boolean;
  /** Loaded asset map (name → data URI). When null, skipped. */
  assetMap: Record<string, string> | null;
  /** The PreviewEngine singleton used for CBS parsing. */
  engine: PreviewEngine;
  /** Status bar callback. */
  setStatus?: (message: string) => void;
  /** Open a pop-out panel. Returns a cleanup function or void. */
  popoutPreview?: (charData: PreviewCharData & { assets: null }) => Promise<void>;
  /** Optional factory for testing — defaults to the real `createPreviewSession`. */
  createSession?: (options: CreatePreviewSessionOptions) => PreviewSession;
}

interface DebugDragState {
  x: number;
  y: number;
}

/**
 * Build the full preview-panel overlay DOM and wire up all interactions.
 *
 * Returns a `dispose` function that tears down the panel and listeners.
 */
export function showPreviewPanel(container: HTMLElement, deps: PreviewPanelDeps): { dispose: () => void } {
  const { engine, fileData, assetMap, setStatus, popoutPreview, createSession: sessionFactory } = deps;
  const makeSession = sessionFactory ?? createPreviewSession;

  const charData: PreviewCharData = {
    name: fileData.name || 'Character',
    description: fileData.description || '',
    personality: fileData.personality || '',
    scenario: fileData.scenario || '',
    firstMessage: fileData.firstMessage || '',
    css: fileData.css || '',
    defaultVariables: fileData.defaultVariables || '',
    lua: fileData.lua || '',
    triggerScripts: fileData.triggerScripts || [],
    lorebook: fileData.lorebook || [],
    regex: fileData.regex || [],
  };

  let debugOpen = false;
  let activeDebugTab = 'variables';

  // ══════════════ Build UI ══════════════

  const overlay = document.createElement('div');
  overlay.className = 'preview-overlay';

  const panel = document.createElement('div');
  panel.className = 'preview-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', `${charData.name} 프리뷰`);

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'preview-header';
  header.classList.add('popout-header-main');
  const headerLeft = document.createElement('span');
  headerLeft.className = 'preview-header-title';
  headerLeft.textContent = `${charData.name} — 프리뷰`;
  const headerBtns = document.createElement('div');
  headerBtns.className = 'popout-header-actions';

  const popoutPreviewBtn = document.createElement('button');
  popoutPreviewBtn.className = 'popout-action-btn';
  popoutPreviewBtn.textContent = '↗';
  popoutPreviewBtn.title = '팝아웃 (별도 창)';
  popoutPreviewBtn.setAttribute('aria-label', '팝아웃 (별도 창)');

  const resetBtn = document.createElement('button');
  resetBtn.className = 'popout-action-btn';
  resetBtn.textContent = '↻';
  resetBtn.title = '초기화';
  resetBtn.setAttribute('aria-label', '초기화');

  const debugBtn = document.createElement('button');
  debugBtn.className = 'popout-action-btn';
  debugBtn.textContent = '🔧';
  debugBtn.title = '디버그 패널';
  debugBtn.setAttribute('aria-label', '디버그 패널');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'popout-action-btn btn-close-popout';
  closeBtn.textContent = '✕';
  closeBtn.title = '닫기';
  closeBtn.setAttribute('aria-label', '닫기');

  headerBtns.appendChild(popoutPreviewBtn);
  headerBtns.appendChild(resetBtn);
  headerBtns.appendChild(debugBtn);
  headerBtns.appendChild(closeBtn);
  header.appendChild(headerLeft);
  header.appendChild(headerBtns);

  // ── Chat iframe ──
  const chatFrame = document.createElement('iframe');
  chatFrame.className = 'preview-chat-frame';
  chatFrame.setAttribute('sandbox', 'allow-scripts');

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
  const sendBtn = document.createElement('button');
  sendBtn.className = 'preview-send-btn';
  sendBtn.textContent = '전송';
  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
  inputBar.appendChild(chatInput);
  inputBar.appendChild(sendBtn);

  // ── Debug drawer (hidden by default) ──
  const debugDrawer = document.createElement('div');
  debugDrawer.className = 'preview-debug-drawer';
  debugDrawer.style.display = 'none';

  const debugTabs = document.createElement('div');
  debugTabs.className = 'preview-debug-tabs';
  const tabDefs = [
    { id: 'variables', label: '변수' },
    { id: 'lorebook', label: '로어북' },
    { id: 'lua', label: 'Lua' },
    { id: 'regex', label: '정규식' },
  ];
  for (const td of tabDefs) {
    const tab = document.createElement('button');
    tab.className = 'preview-debug-tab' + (td.id === activeDebugTab ? ' active' : '');
    tab.textContent = td.label;
    tab.addEventListener('click', () => {
      activeDebugTab = td.id;
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
    debugDrawer.style.display = '';
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
    debugDrawer.style.display = debugOpen ? '' : 'none';
    debugTabs.style.cursor = '';
    debugTabs.removeEventListener('mousedown', onDebugDragStart);
  }

  const debugContent = document.createElement('div');
  debugContent.className = 'preview-debug-content';
  debugDrawer.appendChild(debugTabs);
  debugDrawer.appendChild(debugContent);

  // ── Debug resizer (between input bar and debug drawer) ──
  const debugResizer = document.createElement('div');
  debugResizer.className = 'preview-debug-resizer';
  debugResizer.style.display = 'none';
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
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // ── Session ──
  // eslint-disable-next-line prefer-const -- assigned after updateDebugPanel is defined (circular reference)
  let session: PreviewSession;

  function updateDebugPanel(): void {
    const snapshot = session.getSnapshot();
    debugContent.innerHTML = renderPreviewDebugHtml({
      activeTab: activeDebugTab,
      snapshot,
      luaInitButtonId: 'main-preview-lua-init',
    });

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
    const loading = snapshot.initState === 'loading';
    const errorMessage = snapshot.initState === 'error' ? snapshot.initError : snapshot.runtimeError;

    statusBanner.hidden = !loading;
    statusBanner.textContent = loading ? '프리뷰 초기화 중...' : '';

    errorBanner.hidden = !errorMessage;
    errorBanner.textContent = errorMessage ?? '';

    chatInput.disabled = loading;
    sendBtn.disabled = loading;
    resetBtn.disabled = loading;
  }

  session = makeSession({
    engine,
    charData,
    chatFrame,
    windowTarget: window,
    assetMap,
    runtime: createIframePreviewRuntime(chatFrame, window),
    wrapPlainCss: true,
    logPrefix: '[Preview]',
    onError: (message, error) => {
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

  function closePreview(): void {
    session.dispose();
    if (debugDetached) debugDrawer.remove();
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  popoutPreviewBtn.addEventListener('click', async () => {
    if (popoutPreview) {
      await popoutPreview({
        name: charData.name,
        description: charData.description,
        personality: charData.personality,
        scenario: charData.scenario,
        firstMessage: charData.firstMessage,
        defaultVariables: charData.defaultVariables,
        lua: charData.lua,
        triggerScripts: charData.triggerScripts,
        css: charData.css,
        lorebook: charData.lorebook,
        regex: charData.regex,
        assets: null,
      });
    }
    closePreview();
  });

  resetBtn.addEventListener('click', async () => {
    chatInput.style.height = 'auto';
    await session.reset();
    if (debugOpen) updateDebugPanel();
  });

  closeBtn.addEventListener('click', closePreview);

  sendBtn.addEventListener('click', () => {
    void session.handleSend(chatInput);
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void session.handleSend(chatInput);
    }
  });

  debugCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(buildPreviewDebugClipboardText(session.getSnapshot())).then(() => {
      debugCopyBtn.textContent = '✅ 복사됨';
      setTimeout(() => {
        debugCopyBtn.textContent = '📋 복사';
      }, 1500);
    });
  });

  debugBtn.addEventListener('click', () => {
    debugOpen = !debugOpen;
    debugDrawer.style.display = debugOpen ? 'flex' : 'none';
    debugResizer.style.display = debugOpen ? '' : 'none';
    debugBtn.classList.toggle('active', debugOpen);
    if (debugOpen) updateDebugPanel();
  });

  // ── Assemble ──
  panel.appendChild(header);
  panel.appendChild(statusBanner);
  panel.appendChild(errorBanner);
  panel.appendChild(chatFrame);
  panel.appendChild(inputBar);
  panel.appendChild(debugResizer);
  panel.appendChild(debugDrawer);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  // Initialize iframe after it's in the DOM
  requestAnimationFrame(async () => {
    try {
      await session.initialize();
    } catch {
      // Startup errors are surfaced via initState/initError in the snapshot;
      // catching here prevents unhandled promise rejections.
    }
  });

  // Escape to close
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      closePreview();
    }
  };
  document.addEventListener('keydown', onKey);

  return { dispose: closePreview };
}
