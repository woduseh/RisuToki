import PreviewEngine from '../lib/preview-engine';
import { escapePreviewHtml } from '../lib/preview-format';
import {
  getDefaultRpModeForDarkMode,
  readAppSettingsSnapshot,
  subscribeToAppSettings,
  syncBodyDarkMode,
  writeRpMode,
} from '../lib/app-settings';
import type { AppSettingsSnapshot } from '../lib/app-settings';
import { createDirectTerminalChatSession } from '../lib/chat-session';
import { getTalkTitle, toMediaAsset } from '../lib/asset-runtime';
import { loadMonacoRuntime } from '../lib/monaco-loader';
import { buildPreviewDebugClipboardText, renderPreviewDebugHtml } from '../lib/preview-debug';
import { createIframePreviewRuntime } from '../lib/preview-runtime';
import { createPreviewSession } from '../lib/preview-session';
import type { PreviewCharData } from '../lib/preview-session';
import { reportRuntimeError } from '../lib/runtime-feedback';
import { ensureWasmoon } from '../lib/script-loader';
import { initializeTerminalUi, TERM_THEME_DARK, TERM_THEME_LIGHT } from '../lib/terminal-ui';
import type { TerminalUiHandle } from '../lib/terminal-ui';
import {
  applySelectedChoice,
  cleanTuiOutput,
  extractChatChoices,
  filterDisplayChatMessages,
  isSpinnerNoise,
  removeCommandEcho,
  stripAnsi,
} from '../lib/terminal-chat';

declare const monaco: typeof import('monaco-editor');

const root = document.getElementById('popout-root')!;
if (!root) {
  throw new Error('Popout root element is missing.');
}

const talkTitle = getTalkTitle();
const initialPopoutSettings = readAppSettingsSnapshot();
let currentSettingsSnapshot = initialPopoutSettings;

function isDarkModeEnabled(): boolean {
  return currentSettingsSnapshot.darkMode;
}

function getPopoutTerminalTheme() {
  return isDarkModeEnabled() ? TERM_THEME_DARK : TERM_THEME_LIGHT;
}

function getPopoutMonacoTheme(): 'blue-archive' | 'blue-archive-dark' {
  return isDarkModeEnabled() ? 'blue-archive-dark' : 'blue-archive';
}

function createPopoutActionButton(
  text: string,
  options: {
    id?: string;
    title: string;
    ariaLabel?: string;
    extraClassName?: string;
  },
): HTMLButtonElement {
  const button = document.createElement('button');
  if (options.id) button.id = options.id;
  button.type = 'button';
  button.textContent = text;
  button.title = options.title;
  button.setAttribute('aria-label', options.ariaLabel ?? options.title);
  button.className = ['popout-action-btn', options.extraClassName].filter(Boolean).join(' ');
  return button;
}

function setPopoutButtonActive(button: HTMLElement | null, active: boolean): void {
  if (!button) return;
  button.classList.toggle('active', active);
}

function applyPopoutDarkMode(snapshot: AppSettingsSnapshot): void {
  currentSettingsSnapshot = snapshot;
  syncBodyDarkMode(document.body, snapshot.darkMode);
}

export async function initPopoutRenderer(): Promise<void> {
  applyPopoutDarkMode(initialPopoutSettings);
  const panelType = window.popoutAPI.getType();
  if (panelType === 'terminal') {
    await buildTerminalPopout();
  } else if (panelType === 'sidebar') {
    await buildSidebarPopout();
  } else if (panelType === 'editor') {
    await buildEditorPopout();
  } else if (panelType === 'preview') {
    await buildPreviewPopout();
  } else if (panelType === 'refs') {
    await buildRefsPopout();
  }
}

// ==================== Terminal Popout (full TokiTalk UI) ====================

async function buildTerminalPopout(): Promise<void> {
  // --- MomoTalk header (draggable) ---
  const header = document.createElement('div');
  header.id = 'terminal-header';
  header.className = 'popout-momo-header';
  header.innerHTML = `
    <div class="momo-header-left">
      <span class="momo-icon">💬</span>
      <span class="momo-title">${talkTitle}</span>
    </div>
    <div class="momo-header-right"></div>
  `;
  root.appendChild(header);
  const actions = header.querySelector('.momo-header-right');
  actions?.appendChild(createPopoutActionButton('🐰', { id: 'btn-rp-mode', title: 'RP 모드 (토키 말투)' }));
  actions?.appendChild(createPopoutActionButton('💭', { id: 'btn-chat-mode', title: '채팅 모드' }));
  actions?.appendChild(createPopoutActionButton('🖼', { id: 'btn-terminal-bg', title: '배경 이미지' }));
  actions?.appendChild(
    createPopoutActionButton('📌', { id: 'btn-popout-dock', title: '도킹 (복원)', ariaLabel: '도킹 (복원)' }),
  );
  actions?.appendChild(
    createPopoutActionButton('✕', {
      title: '닫기',
      ariaLabel: '닫기',
      extraClassName: 'btn-close-popout',
    }),
  );

  // --- Body (avatar + terminal) ---
  const body = document.createElement('div');
  body.id = 'bottom-area';
  body.className = 'panel-in-h';

  // Avatar panel
  const avatar = document.createElement('div');
  avatar.id = 'toki-avatar';
  avatar.innerHTML = `
    <div id="toki-avatar-display">
      <img id="toki-avatar-img" src="${toMediaAsset('icon.png')}">
    </div>
    <div class="popout-status" id="toki-status">
      <span id="toki-status-icon">💤</span>
      <span id="toki-status-text">대기중~</span>
    </div>
  `;
  body.appendChild(avatar);

  // Terminal wrap (terminal + chat overlay)
  const termWrap = document.createElement('div');
  termWrap.id = 'terminal-area';

  const termContainer = document.createElement('div');
  termContainer.id = 'terminal-container';
  termWrap.appendChild(termContainer);

  body.appendChild(termWrap);
  root.appendChild(body);

  // --- Wire header buttons ---
  header.querySelector('#btn-popout-dock')!.addEventListener('click', () => window.popoutAPI.dock());
  header.querySelector('.btn-close-popout')!.addEventListener('click', () => window.close());

  // --- Init terminal ---
  try {
    const disposeTerminalPopout = await initPopoutXterm(termContainer, termWrap);
    window.addEventListener('beforeunload', disposeTerminalPopout, { once: true });
  } catch (error) {
    termWrap.replaceChildren(
      createPopoutEmptyState('터미널 팝아웃을 초기화하지 못했습니다. 다시 시도해주세요.', 'terminal-init-error'),
    );
    reportRuntimeError({
      context: '터미널 팝아웃 초기화 실패',
      error,
      fallbackMessage: '터미널 팝아웃을 초기화하지 못했습니다.',
      logPrefix: '[Popout Terminal]',
    });
  }
}

// ==================== Xterm + Chat Mode ====================

let popoutTerm: TerminalUiHandle['term'] | null = null;
let popoutFitAddon: TerminalUiHandle['fitAddon'] | null = null;
let popoutChatMode = false;
const popoutChatSession = createDirectTerminalChatSession({
  applySelectedChoice,
  cleanTuiOutput,
  filterDisplayChatMessages,
  isSpinnerNoise,
  onUpdate: () => {
    if (popoutChatMode) renderPopoutChat();
  },
  removeCommandEcho,
  stripAnsi,
});

async function initPopoutXterm(container: HTMLElement, termWrap: HTMLElement): Promise<() => void> {
  let terminalUi: TerminalUiHandle | null = null;
  let disposeRpModeSubscription: (() => void) | null = null;

  const chatModeButton = document.getElementById('btn-chat-mode');
  const backgroundButton = document.getElementById('btn-terminal-bg');
  const handleChatModeClick = () => togglePopoutChatMode();
  const handleBackgroundClick = () => {
    container.classList.toggle('has-bg');
  };

  try {
    terminalUi = await initializeTerminalUi({
      api: {
        onTerminalData: (callback) => window.popoutAPI.onTerminalData(callback),
        onTerminalExit: (callback) => window.popoutAPI.onTerminalExit(callback),
        onTerminalStatus: (callback) => window.popoutAPI.onTerminalStatus(callback),
        terminalInput: (data) => window.popoutAPI.terminalInput(data),
        terminalIsRunning: () => window.popoutAPI.terminalIsRunning(),
        terminalResize: (cols, rows) => window.popoutAPI.terminalResize(cols, rows),
        terminalStart: (cols, rows) => window.popoutAPI.terminalStart(cols, rows),
      },
      container,
      onTerminalData: (data) => {
        if (popoutChatMode) popoutChatSession.handleTerminalData(data);
      },
      rightClickSelectsWord: false,
      setActive: setPopoutActive,
      shouldActivateOnData: () => true,
      theme: getPopoutTerminalTheme(),
      writeStatusToTerminal: true,
    });
    popoutTerm = terminalUi.term;
    popoutFitAddon = terminalUi.fitAddon;

    // --- Build chat view (overlay inside termWrap) ---
    buildPopoutChatView(termWrap);

    // --- Wire RP mode button ---
    disposeRpModeSubscription = initPopoutRpMode();

    // --- Wire chat mode button ---
    chatModeButton?.addEventListener('click', handleChatModeClick);

    // --- Wire background button ---
    backgroundButton?.addEventListener('click', handleBackgroundClick);

    return () => {
      chatModeButton?.removeEventListener('click', handleChatModeClick);
      backgroundButton?.removeEventListener('click', handleBackgroundClick);
      disposeRpModeSubscription?.();
      terminalUi?.dispose();
      popoutTerm = null;
      popoutFitAddon = null;
    };
  } catch (error) {
    disposeRpModeSubscription?.();
    terminalUi?.dispose();
    popoutTerm = null;
    popoutFitAddon = null;
    throw error;
  }
}

// ==================== RP Mode (shared via localStorage) ====================

function initPopoutRpMode(): () => void {
  const btn = document.getElementById('btn-rp-mode');
  if (!btn) return () => {};

  let snapshot = readAppSettingsSnapshot();
  updatePopoutRpStyle(btn, snapshot.rpMode !== 'off');

  const handleClick = () => {
    snapshot = readAppSettingsSnapshot();
    const nextMode = snapshot.rpMode === 'off' ? getDefaultRpModeForDarkMode(snapshot.darkMode) : 'off';
    writeRpMode(nextMode);
    updatePopoutRpStyle(btn, nextMode !== 'off');
  };
  btn.addEventListener('click', handleClick);

  const disposeSettingsSubscription = subscribeToAppSettings((nextSnapshot: AppSettingsSnapshot) => {
    snapshot = nextSnapshot;
    currentSettingsSnapshot = nextSnapshot;
    applyPopoutDarkMode(snapshot);
    const titleEl = document.querySelector('.momo-title');
    if (titleEl) {
      titleEl.textContent = snapshot.darkMode ? 'ArisTalk' : 'TokiTalk';
    }
    if (popoutTerm) {
      popoutTerm.options.theme = getPopoutTerminalTheme();
    }
    updatePopoutRpStyle(btn, snapshot.rpMode !== 'off');
  });

  return () => {
    btn.removeEventListener('click', handleClick);
    disposeSettingsSubscription();
  };
}

function updatePopoutRpStyle(btn: HTMLElement, active: boolean, rpMode = readAppSettingsSnapshot().rpMode): void {
  const label =
    rpMode === 'aris' ? '아리스' : rpMode === 'custom' ? '커스텀' : rpMode === 'pluni' ? '플루니 연구소' : '토키';
  setPopoutButtonActive(btn, active);
  btn.title = active ? `RP 모드 ON (${label})` : 'RP 모드 OFF';
}

// ==================== Avatar State ====================

const IDLE_IMG = toMediaAsset('icon.png');
const DANCING_IMG = toMediaAsset('Dancing_toki.gif');

let _popoutIsActive = false;
let _poImg: HTMLImageElement | null,
  _poStatus: HTMLElement | null,
  _poIcon: HTMLElement | null,
  _poText: HTMLElement | null;
function setPopoutActive(active: boolean): void {
  if (_popoutIsActive === active) return;
  if (!_poImg) {
    _poImg = document.getElementById('toki-avatar-img') as HTMLImageElement | null;
    _poStatus = document.getElementById('toki-status');
    _poIcon = document.getElementById('toki-status-icon');
    _poText = document.getElementById('toki-status-text');
  }
  if (!_poImg || !_poStatus || !_poIcon || !_poText) return;
  _popoutIsActive = active;

  if (active) {
    _poImg.src = DANCING_IMG;
    _poStatus.classList.add('working');
    _poIcon.textContent = '✨';
    _poText.textContent = '작업중~';
  } else {
    _poImg.src = IDLE_IMG;
    _poStatus.classList.remove('working');
    _poIcon.textContent = '💤';
    _poText.textContent = '대기중~';
  }
}

// ==================== Chat Mode ====================

function buildPopoutChatView(termWrap: HTMLElement): void {
  const chatView = document.createElement('div');
  chatView.id = 'chat-view';

  const chatMsgs = document.createElement('div');
  chatMsgs.id = 'chat-messages';

  const chatInputArea = document.createElement('div');
  chatInputArea.id = 'chat-input-area';

  const chatInput = document.createElement('input');
  chatInput.type = 'text';
  chatInput.id = 'chat-input';
  chatInput.placeholder = '메시지를 입력하세요...';

  const chatSendBtn = document.createElement('button');
  chatSendBtn.id = 'chat-send-btn';
  chatSendBtn.textContent = '전송';

  chatInputArea.appendChild(chatInput);
  chatInputArea.appendChild(chatSendBtn);
  chatView.appendChild(chatMsgs);
  chatView.appendChild(chatInputArea);
  termWrap.appendChild(chatView);

  chatSendBtn.addEventListener('click', popoutChatSend);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      popoutChatSend();
    }
  });
}

function togglePopoutChatMode(): void {
  popoutChatMode = !popoutChatMode;
  const termContainer = document.getElementById('terminal-container');
  const chatView = document.getElementById('chat-view');
  const btn = document.getElementById('btn-chat-mode');
  if (!termContainer || !chatView || !btn) return;

  if (popoutChatMode) {
    popoutChatSession.setActive(true);

    termContainer.style.display = 'none';
    chatView.classList.add('active');
    setPopoutButtonActive(btn, true);
    (document.getElementById('chat-input') as HTMLInputElement | null)?.focus();
  } else {
    popoutChatSession.setActive(false);
    termContainer.style.display = '';
    chatView.classList.remove('active');
    setPopoutButtonActive(btn, false);
    if (popoutFitAddon && popoutTerm) setTimeout(() => popoutFitAddon!.fit(), 20);
  }
}

function popoutChatSend(): void {
  const input = document.getElementById('chat-input') as HTMLInputElement | null;
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  popoutChatSession.send(text);
  renderPopoutChat();

  window.popoutAPI.terminalInput(text);
  setTimeout(() => {
    window.popoutAPI.terminalInput('\r');
  }, 50);
}

function finalizePopoutChat(): void {
  popoutChatSession.finalizeResponse();
  renderPopoutChat();
}

function renderPopoutChat(): void {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  container.innerHTML = '';

  const chatState = popoutChatSession.getState();
  const popoutChatMessages = popoutChatSession.getMessages();
  for (const msg of popoutChatMessages) {
    if (!msg.text && !chatState.isStreaming) continue;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${msg.type}`;

    const name = document.createElement('div');
    name.className = 'chat-bubble-name';
    name.textContent = msg.type === 'user' ? 'You' : 'Toki';
    bubble.appendChild(name);

    const content = document.createElement('div');
    content.className = 'chat-bubble-text';
    content.textContent = msg.text || '...';
    bubble.appendChild(content);

    container.appendChild(bubble);

    // Detect numbered choices and render MomoTalk-style buttons (skip if already chosen)
    if (msg.type === 'system' && msg.text && !chatState.isStreaming && !msg._choiceMade) {
      const choices = extractChatChoices(msg.text);
      if (choices.length >= 2) {
        const choiceContainer = document.createElement('div');
        choiceContainer.className = 'chat-choices';
        for (const choice of choices) {
          const btn = document.createElement('button');
          btn.className = 'chat-choice-btn';
          btn.textContent = choice.label;
          btn.addEventListener('click', () => sendPopoutChoice(choice.value));
          choiceContainer.appendChild(btn);
        }
        container.appendChild(choiceContainer);
      }
    }
  }
  container.scrollTop = container.scrollHeight;
}

function sendPopoutChoice(value: string): void {
  popoutChatSession.selectChoice(value);
  renderPopoutChat();
  window.popoutAPI.terminalInput(value);
  setTimeout(() => window.popoutAPI.terminalInput('\r'), 50);
}

// ==================== Sidebar Popout (MomoTalk style) ====================

async function buildSidebarPopout(): Promise<void> {
  let selectedItemId: string | null = null;

  const renderSidebarPopout = async (): Promise<void> => {
    root.innerHTML = '';

    const header = document.createElement('div');
    header.id = 'popout-sidebar-header';
    header.className = 'sidebar-header';
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:18px;">📁</span>
        <span style="font-size:15px;font-weight:700;">항목</span>
      </div>
      <div class="sidebar-header-btns"></div>
    `;
    root.appendChild(header);
    const buttons = header.querySelector('.sidebar-header-btns');
    buttons?.appendChild(
      createPopoutActionButton('📌', { id: 'btn-popout-dock', title: '도킹 (복원)', ariaLabel: '도킹 (복원)' }),
    );
    buttons?.appendChild(
      createPopoutActionButton('✕', {
        title: '닫기',
        ariaLabel: '닫기',
        extraClassName: 'btn-close-popout',
      }),
    );

    header.querySelector('#btn-popout-dock')!.addEventListener('click', () => window.popoutAPI.dock());
    header.querySelector('.btn-close-popout')!.addEventListener('click', () => window.close());

    const content = document.createElement('div');
    content.id = 'popout-sidebar-content';
    root.appendChild(content);

    const data = await window.popoutAPI.getSidebarData();
    if (!data || !data.items || data.items.length === 0) {
      content.replaceChildren(createPopoutEmptyState('파일을 먼저 열어주세요'));
      return;
    }

    for (const item of data.items) {
      const el = document.createElement('div');
      el.className = `tree-item${item.indent ? ' indent-' + item.indent : ''}`;

      if (item.isHeader) {
        el.classList.add('tree-section-header');
      }

      if (item.icon) {
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.textContent = item.icon;
        el.appendChild(icon);
      }

      const label = document.createElement('span');
      label.textContent = item.label;
      el.appendChild(label);

      if (item.id) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          selectedItemId = item.id!;
          window.popoutAPI.sidebarClick(item.id!);
          content.querySelectorAll('.tree-item').forEach((x) => x.classList.remove('active'));
          el.classList.add('active');
        });
        if (selectedItemId === item.id) {
          el.classList.add('active');
        }
      }

      content.appendChild(el);
    }
  };

  await renderSidebarPopout();
  const disposeSidebarRefresh = window.popoutAPI.onSidebarDataChanged(() => {
    renderSidebarPopout().catch((error: unknown) => {
      reportRuntimeError({
        context: '팝아웃 항목 목록 새로고침 실패',
        error,
        logPrefix: '[Popout Sidebar]',
      });
    });
  });
  window.addEventListener(
    'beforeunload',
    () => {
      disposeSidebarRefresh?.();
    },
    { once: true },
  );
}

// ==================== Refs Popout ====================

async function buildRefsPopout(): Promise<void> {
  let selectedItemId: string | null = null;

  const renderRefsPopout = async (): Promise<void> => {
    root.innerHTML = '';

    const header = document.createElement('div');
    header.id = 'popout-sidebar-header';
    header.className = 'sidebar-header';
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:18px;">📄</span>
        <span style="font-size:15px;font-weight:700;">참고자료</span>
      </div>
      <div class="sidebar-header-btns"></div>
    `;
    root.appendChild(header);
    const buttons = header.querySelector('.sidebar-header-btns');
    buttons?.appendChild(
      createPopoutActionButton('📌', { id: 'btn-popout-dock', title: '도킹 (복원)', ariaLabel: '도킹 (복원)' }),
    );
    buttons?.appendChild(
      createPopoutActionButton('✕', {
        title: '닫기',
        ariaLabel: '닫기',
        extraClassName: 'btn-close-popout',
      }),
    );

    header.querySelector('#btn-popout-dock')!.addEventListener('click', () => window.popoutAPI.dock());
    header.querySelector('.btn-close-popout')!.addEventListener('click', () => window.close());

    const content = document.createElement('div');
    content.id = 'popout-sidebar-content';
    root.appendChild(content);

    const data = await window.popoutAPI.getRefsData();
    if (!data) {
      content.replaceChildren(createPopoutEmptyState('데이터를 불러올 수 없습니다'));
      return;
    }

    const builtInGuides = Array.isArray(data.guides) ? data.guides : [];
    const sessionGuides = Array.isArray(data.sessionGuides) ? data.sessionGuides : [];
    if (builtInGuides.length > 0 || sessionGuides.length > 0) {
      const guideHeader = createTreeSectionHeader('가이드', { icon: '📖' });
      content.appendChild(guideHeader);

      const appendGuideItem = (fileName: string, isSession: boolean): void => {
        const el = document.createElement('div');
        el.className = 'tree-item indent-1';
        el.style.cursor = 'pointer';
        el.innerHTML = `<span class="icon">·</span><span>${isSession ? '⏳ ' : ''}${escapePreviewHtml(fileName)}</span>`;
        el.addEventListener('click', () => {
          selectedItemId = `guide_${fileName}`;
          window.popoutAPI.refsItemClick(`guide_${fileName}`);
          content.querySelectorAll('.tree-item').forEach((x) => x.classList.remove('active'));
          el.classList.add('active');
        });
        if (selectedItemId === `guide_${fileName}`) {
          el.classList.add('active');
        }
        content.appendChild(el);
      };

      for (const fileName of builtInGuides) appendGuideItem(fileName, false);
      if (builtInGuides.length > 0 && sessionGuides.length > 0) {
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:var(--border-color);margin:4px 8px;';
        content.appendChild(sep);
      }
      for (const fileName of sessionGuides) appendGuideItem(fileName, true);
    }

    if (data.refs && data.refs.length > 0) {
      const refSep = createTreeSectionHeader('── 참고 파일 ──', { bordered: true });
      content.appendChild(refSep);

      for (const item of data.refs) {
        const el = document.createElement('div');
        el.className = `tree-item${item.indent ? ' indent-' + item.indent : ''}`;

        if (item.isHeader) {
          el.classList.add('tree-section-header');
        } else if (item.isFolder) {
          el.style.cssText = 'font-weight:600;padding-top:8px;padding-bottom:4px;cursor:default;';
        }

        if (item.icon) {
          const icon = document.createElement('span');
          icon.className = 'icon';
          icon.textContent = item.icon;
          el.appendChild(icon);
        }

        const label = document.createElement('span');
        label.textContent = item.label;
        el.appendChild(label);

        if (item.id) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', () => {
            selectedItemId = item.id!;
            window.popoutAPI.refsItemClick(item.id!);
            content.querySelectorAll('.tree-item').forEach((x) => x.classList.remove('active'));
            el.classList.add('active');
          });
          if (selectedItemId === item.id) {
            el.classList.add('active');
          }
        }

        content.appendChild(el);
      }
    }

    if (builtInGuides.length === 0 && sessionGuides.length === 0 && (!data.refs || data.refs.length === 0)) {
      content.replaceChildren(createPopoutEmptyState('참고자료가 없습니다'));
    }
  };

  await renderRefsPopout();
  const disposeRefsRefresh = window.popoutAPI.onRefsDataChanged(() => {
    renderRefsPopout().catch((error: unknown) => {
      reportRuntimeError({
        context: '참고자료 팝아웃 새로고침 실패',
        error,
        fallbackMessage: '참고자료 팝아웃을 새로고침하지 못했습니다.',
      });
    });
  });
  window.addEventListener(
    'beforeunload',
    () => {
      disposeRefsRefresh?.();
    },
    { once: true },
  );
}

// ==================== Editor Popout ====================

async function buildEditorPopout(): Promise<void> {
  // Header (draggable)
  const header = document.createElement('div');
  header.id = 'popout-editor-header';
  header.className = 'popout-header-main popout-header-main--editor popout-editor-header';
  header.innerHTML = `
    <div class="popout-header-title">
      <span style="font-size:16px;">✏️</span>
      <span id="popout-editor-title" class="popout-header-title-text">에디터</span>
    </div>
    <div class="popout-header-actions"></div>
  `;
  root.appendChild(header);
  const headerActions = header.querySelector('.popout-header-actions');
  headerActions?.appendChild(createPopoutActionButton('💾', { id: 'btn-editor-save', title: '저장 (Ctrl+S)' }));
  headerActions?.appendChild(
    createPopoutActionButton('📌', { id: 'btn-popout-dock', title: '도킹 (복원)', ariaLabel: '도킹 (복원)' }),
  );
  headerActions?.appendChild(
    createPopoutActionButton('✕', {
      title: '닫기',
      ariaLabel: '닫기',
      extraClassName: 'btn-close-popout',
    }),
  );

  // Editor container
  const editorContainer = document.createElement('div');
  editorContainer.id = 'popout-editor-container';
  editorContainer.className = 'popout-editor-container';
  root.appendChild(editorContainer);

  // Wire buttons
  header.querySelector('#btn-popout-dock')!.addEventListener('click', () => window.popoutAPI.dock());
  header.querySelector('.btn-close-popout')!.addEventListener('click', () => window.close());

  // Get tab data from main process
  const data = await window.popoutAPI.getEditorData(window.popoutAPI.getRequestId());
  if (!data) {
    editorContainer.innerHTML =
      '<div style="padding:16px;color:#888;font-size:13px;">탭 데이터를 불러올 수 없습니다</div>';
    return;
  }

  const titleEl = document.getElementById('popout-editor-title');
  if (titleEl) {
    titleEl.textContent = data.label || '에디터';
    if (data.readOnly) {
      const badge = document.createElement('span');
      badge.className = 'readonly-badge';
      badge.textContent = '읽기전용';
      titleEl.appendChild(badge);
    }
  }

  const saveBtn = header.querySelector('#btn-editor-save') as HTMLButtonElement | null;
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (data.readOnly) return;
      window.popoutAPI.editorSave();
    });
    if (data.readOnly) {
      saveBtn.disabled = true;
      saveBtn.setAttribute('aria-label', '저장 (읽기전용)');
      saveBtn.title = '읽기전용 탭';
    } else {
      saveBtn.setAttribute('aria-label', '저장 (Ctrl+S)');
    }
  }

  await loadMonacoRuntime();

  const editor = monaco.editor.create(editorContainer, {
    value: data.content || '',
    language: data.language || 'plaintext',
    theme: getPopoutMonacoTheme(),
    fontSize: 14,
    minimap: { enabled: true },
    wordWrap: 'on',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    tabSize: 2,
    mouseWheelZoom: true,
    readOnly: !!data.readOnly,
  });

  // Sync changes back to main window
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  editor.onDidChangeModelContent(() => {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      window.popoutAPI.editorChange(data.tabId, editor.getValue());
    }, 300);
  });

  // Ctrl+S → save (skip for read-only tabs)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    if (data.readOnly) return;
    // Send latest content first, then trigger save
    window.popoutAPI.editorChange(data.tabId, editor.getValue());
    window.popoutAPI.editorSave();
  });
}

// ==================== Preview Popout ====================

async function buildPreviewPopout(): Promise<void> {
  const charData = (await window.popoutAPI.getPreviewData(window.popoutAPI.getRequestId())) as PreviewCharData | null;
  if (!charData) {
    root.innerHTML = '<div style="padding:24px;color:#888;">프리뷰 데이터를 불러올 수 없습니다</div>';
    return;
  }
  let assetMapForEngine: Record<string, string> = {};
  try {
    const assetResult = await window.popoutAPI.getAllAssetsMap();
    assetMapForEngine = assetResult.assets || (assetResult as unknown as Record<string, string>);
  } catch (error) {
    reportRuntimeError({
      context: '팝아웃 프리뷰 에셋 불러오기 실패',
      error,
      logPrefix: '[Popout Preview]',
    });
  }

  await ensureWasmoon();

  let debugOpen = false;
  let activeDebugTab = 'variables';

  // ── Build UI ──
  const header = document.createElement('div');
  header.className = 'preview-header';
  header.classList.add('popout-header-main');
  const headerLeft = document.createElement('span');
  headerLeft.className = 'preview-header-title';
  headerLeft.textContent = `${charData.name ?? ''} — 프리뷰`;
  const headerBtns = document.createElement('div');
  headerBtns.className = 'popout-header-actions';

  const resetBtn = createPopoutActionButton('↻', { title: '초기화', ariaLabel: '초기화' });

  // Debug toggle button
  const debugBtn = createPopoutActionButton('🔧', { title: '디버그 패널', ariaLabel: '디버그 패널' });

  const dockBtn = createPopoutActionButton('📌', { title: '메인 창으로 도킹', ariaLabel: '메인 창으로 도킹' });
  dockBtn.addEventListener('click', () => window.popoutAPI.dock());

  const closeBtn = createPopoutActionButton('✕', {
    title: '닫기',
    ariaLabel: '닫기',
    extraClassName: 'btn-close-popout',
  });
  closeBtn.addEventListener('click', () => window.close());

  headerBtns.appendChild(resetBtn);
  headerBtns.appendChild(debugBtn);
  headerBtns.appendChild(dockBtn);
  headerBtns.appendChild(closeBtn);
  header.appendChild(headerLeft);
  header.appendChild(headerBtns);

  const chatFrame = document.createElement('iframe');
  chatFrame.className = 'preview-chat-frame';
  chatFrame.setAttribute('sandbox', 'allow-scripts');

  const inputBar = document.createElement('div');
  inputBar.className = 'preview-input-bar';
  const chatInput = document.createElement('textarea');
  chatInput.className = 'preview-input-textarea';
  chatInput.placeholder = '메시지를 입력하세요...';
  chatInput.rows = 1;
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
  const sendBtn = document.createElement('button');
  sendBtn.className = 'preview-send-btn';
  sendBtn.textContent = '전송';
  inputBar.appendChild(chatInput);
  inputBar.appendChild(sendBtn);

  // ── Debug drawer ──
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
    tab.className = 'preview-debug-tab';
    if (td.id === activeDebugTab) tab.classList.add('active');
    tab.textContent = td.label;
    tab.addEventListener('click', () => {
      activeDebugTab = td.id;
      debugTabs.querySelectorAll<HTMLButtonElement>('button').forEach((t) => {
        if (t.dataset.debugTab) t.classList.remove('active');
      });
      tab.classList.add('active');
      updateDebugContent();
    });
    tab.dataset.debugTab = td.id;
    debugTabs.appendChild(tab);
  }

  const debugContentEl = document.createElement('div');
  debugContentEl.className = 'preview-debug-content';
  debugDrawer.appendChild(debugTabs);
  debugDrawer.appendChild(debugContentEl);

  // ── Debug resizer ──
  const debugResizer = document.createElement('div');
  debugResizer.className = 'preview-debug-resizer';
  debugResizer.style.display = 'none';
  debugResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = debugDrawer.getBoundingClientRect().height;
    const onMove = (ev: MouseEvent): void => {
      const delta = startY - ev.clientY;
      debugDrawer.style.height = Math.max(80, startH + delta) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  const debugCopyBtn = document.createElement('button');
  debugCopyBtn.className = 'preview-debug-copy-btn';
  debugCopyBtn.textContent = '📋 복사';
  debugCopyBtn.title = '디버그 정보 전체 복사';
  debugTabs.appendChild(debugCopyBtn);

  const session = createPreviewSession({
    engine: PreviewEngine,
    charData,
    chatFrame,
    windowTarget: window,
    assetMap: assetMapForEngine,
    runtime: createIframePreviewRuntime(chatFrame, window),
    wrapPlainCss: true,
    logPrefix: '[Popout Preview]',
    onError: (message, error) => {
      reportRuntimeError({
        context: message,
        error,
        logPrefix: '[Popout Preview]',
      });
    },
    onStateChange: () => {
      if (debugOpen) updateDebugContent();
    },
  });

  function updateDebugContent(): void {
    const snapshot = session.getSnapshot();
    debugContentEl.innerHTML = renderPreviewDebugHtml({
      activeTab: activeDebugTab,
      snapshot,
      luaInitButtonId: 'popout-preview-lua-init',
    });

    if (!snapshot.luaInitialized) {
      const button = debugContentEl.querySelector('#popout-preview-lua-init') as HTMLButtonElement | null;
      if (button) {
        button.addEventListener('click', async () => {
          button.textContent = '초기화 중...';
          button.disabled = true;
          await session.initializeLua();
          updateDebugContent();
        });
      }
    }
  }

  debugBtn.addEventListener('click', () => {
    debugOpen = !debugOpen;
    debugDrawer.style.display = debugOpen ? 'flex' : 'none';
    debugResizer.style.display = debugOpen ? '' : 'none';
    debugBtn.classList.toggle('active', debugOpen);
    if (debugOpen) updateDebugContent();
  });

  resetBtn.addEventListener('click', async () => {
    await session.reset();
    chatInput.style.height = 'auto';
    if (debugOpen) updateDebugContent();
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void session.handleSend(chatInput);
    }
  });

  sendBtn.addEventListener('click', () => {
    void session.handleSend(chatInput);
  });

  debugCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(buildPreviewDebugClipboardText(session.getSnapshot())).then(() => {
      debugCopyBtn.textContent = '✅ 복사됨';
      setTimeout(() => {
        debugCopyBtn.textContent = '📋 복사';
      }, 1500);
    });
  });

  window.addEventListener(
    'beforeunload',
    () => {
      session.dispose();
    },
    { once: true },
  );

  root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#282a36;';
  root.appendChild(header);
  root.appendChild(chatFrame);
  root.appendChild(inputBar);
  root.appendChild(debugResizer);
  root.appendChild(debugDrawer);

  // Initialize iframe
  requestAnimationFrame(async () => {
    await session.initialize();
  });
}

// ==================== Shared Helpers ====================

function createPopoutEmptyState(message: string, extraClassName?: string): HTMLDivElement {
  const empty = document.createElement('div');
  empty.className = ['popout-empty-state', extraClassName].filter(Boolean).join(' ');
  empty.textContent = message;
  return empty;
}

function createTreeSectionHeader(
  label: string,
  options?: {
    bordered?: boolean;
    icon?: string;
  },
): HTMLDivElement {
  const header = document.createElement('div');
  header.className = ['tree-item', 'tree-section-header', options?.bordered ? 'tree-section-header--bordered' : '']
    .filter(Boolean)
    .join(' ');
  if (options?.icon) {
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = options.icon;
    header.appendChild(icon);
  }
  const text = document.createElement('span');
  text.textContent = label;
  header.appendChild(text);
  return header;
}
