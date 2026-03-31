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
import { initializeTerminalUi, TERM_THEME_LIGHT } from '../lib/terminal-ui';
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

export async function initPopoutRenderer(): Promise<void> {
  syncBodyDarkMode(document.body, initialPopoutSettings.darkMode);
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
    <div class="momo-header-right">
      <button id="btn-rp-mode" title="RP 모드 (토키 말투)">🐰</button>
      <button id="btn-chat-mode" title="채팅 모드">💭</button>
      <button id="btn-terminal-bg" title="배경 이미지">🖼</button>
      <button id="btn-popout-dock" title="도킹 (복원)">📌</button>
      <button class="btn-close-popout" title="닫기">✕</button>
    </div>
  `;
  root.appendChild(header);

  // --- Body (avatar + terminal) ---
  const body = document.createElement('div');
  body.id = 'popout-body';

  // Avatar panel
  const avatar = document.createElement('div');
  avatar.id = 'popout-avatar';
  avatar.innerHTML = `
    <div id="popout-avatar-display">
      <img id="popout-avatar-img" src="${toMediaAsset('icon.png')}">
    </div>
    <div class="popout-status" id="popout-status">
      <span id="popout-status-icon">💤</span>
      <span id="popout-status-text">대기중~</span>
    </div>
  `;
  body.appendChild(avatar);

  // Terminal wrap (terminal + chat overlay)
  const termWrap = document.createElement('div');
  termWrap.id = 'popout-terminal-wrap';

  const termContainer = document.createElement('div');
  termContainer.id = 'terminal-container';
  termWrap.appendChild(termContainer);

  body.appendChild(termWrap);
  root.appendChild(body);

  // --- Wire header buttons ---
  header.querySelector('#btn-popout-dock')!.addEventListener('click', () => window.popoutAPI.dock());
  header.querySelector('.btn-close-popout')!.addEventListener('click', () => window.close());

  // --- Init terminal ---
  await initPopoutXterm(termContainer, termWrap);
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

async function initPopoutXterm(container: HTMLElement, termWrap: HTMLElement): Promise<void> {
  const terminalUi = await initializeTerminalUi({
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
    theme: TERM_THEME_LIGHT,
    writeStatusToTerminal: true,
  });
  popoutTerm = terminalUi.term;
  popoutFitAddon = terminalUi.fitAddon;

  // --- Build chat view (overlay inside termWrap) ---
  buildPopoutChatView(termWrap);

  // --- Wire RP mode button ---
  initPopoutRpMode();

  // --- Wire chat mode button ---
  document.getElementById('btn-chat-mode')!.addEventListener('click', togglePopoutChatMode);

  // --- Wire background button ---
  document.getElementById('btn-terminal-bg')!.addEventListener('click', async () => {
    // Simple: prompt-style isn't available; just toggle a subtle bg
    container.classList.toggle('has-bg');
  });
}

// ==================== RP Mode (shared via localStorage) ====================

function initPopoutRpMode(): void {
  const btn = document.getElementById('btn-rp-mode');
  if (!btn) return;

  let snapshot = readAppSettingsSnapshot();
  updatePopoutRpStyle(btn, snapshot.rpMode !== 'off');

  btn.addEventListener('click', () => {
    snapshot = readAppSettingsSnapshot();
    const nextMode = snapshot.rpMode === 'off' ? getDefaultRpModeForDarkMode(snapshot.darkMode) : 'off';
    writeRpMode(nextMode);
    updatePopoutRpStyle(btn, nextMode !== 'off');
  });

  subscribeToAppSettings((nextSnapshot: AppSettingsSnapshot) => {
    snapshot = nextSnapshot;
    syncBodyDarkMode(document.body, snapshot.darkMode);
    const titleEl = document.querySelector('.momo-title');
    if (titleEl) {
      titleEl.textContent = snapshot.darkMode ? 'ArisTalk' : 'TokiTalk';
    }
    updatePopoutRpStyle(btn, snapshot.rpMode !== 'off');
  });
}

function updatePopoutRpStyle(btn: HTMLElement, active: boolean, rpMode = readAppSettingsSnapshot().rpMode): void {
  const label =
    rpMode === 'aris' ? '아리스' : rpMode === 'custom' ? '커스텀' : rpMode === 'pluni' ? '플루니 연구소' : '토키';
  btn.style.background = active ? 'rgba(255,255,255,0.5)' : '';
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
    _poImg = document.getElementById('popout-avatar-img') as HTMLImageElement | null;
    _poStatus = document.getElementById('popout-status');
    _poIcon = document.getElementById('popout-status-icon');
    _poText = document.getElementById('popout-status-text');
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
    btn.style.background = 'rgba(255,255,255,0.5)';
    (document.getElementById('chat-input') as HTMLInputElement | null)?.focus();
  } else {
    popoutChatSession.setActive(false);
    termContainer.style.display = '';
    chatView.classList.remove('active');
    btn.style.background = '';
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
      <div class="sidebar-header-btns">
        <button id="btn-popout-dock" title="도킹 (복원)" aria-label="도킹 (복원)">📌</button>
        <button class="btn-close-popout" title="닫기" aria-label="닫기">✕</button>
      </div>
    `;
    root.appendChild(header);

    header.querySelector('#btn-popout-dock')!.addEventListener('click', () => window.popoutAPI.dock());
    header.querySelector('.btn-close-popout')!.addEventListener('click', () => window.close());

    const content = document.createElement('div');
    content.id = 'popout-sidebar-content';
    root.appendChild(content);

    const data = await window.popoutAPI.getSidebarData();
    if (!data || !data.items || data.items.length === 0) {
      content.innerHTML =
        '<div style="padding:16px;color:var(--text-secondary);font-size:13px;">파일을 먼저 열어주세요</div>';
      return;
    }

    for (const item of data.items) {
      const el = document.createElement('div');
      el.className = `tree-item${item.indent ? ' indent-' + item.indent : ''}`;

      if (item.isHeader) {
        el.style.cssText =
          'color:var(--accent);font-weight:700;font-size:11px;letter-spacing:0.5px;padding:10px 8px 4px;cursor:default;text-transform:uppercase;';
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
  window.popoutAPI.onSidebarDataChanged(() => {
    renderSidebarPopout().catch((error: unknown) => {
      reportRuntimeError({
        context: '팝아웃 항목 목록 새로고침 실패',
        error,
        logPrefix: '[Popout Sidebar]',
      });
    });
  });
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
      <div class="sidebar-header-btns">
        <button id="btn-popout-dock" title="도킹 (복원)" aria-label="도킹 (복원)">📌</button>
        <button class="btn-close-popout" title="닫기" aria-label="닫기">✕</button>
      </div>
    `;
    root.appendChild(header);

    header.querySelector('#btn-popout-dock')!.addEventListener('click', () => window.popoutAPI.dock());
    header.querySelector('.btn-close-popout')!.addEventListener('click', () => window.close());

    const content = document.createElement('div');
    content.id = 'popout-sidebar-content';
    root.appendChild(content);

    const data = await window.popoutAPI.getRefsData();
    if (!data) {
      content.innerHTML =
        '<div style="padding:16px;color:var(--text-secondary);font-size:13px;">데이터를 불러올 수 없습니다</div>';
      return;
    }

    const builtInGuides = Array.isArray(data.guides) ? data.guides : [];
    const sessionGuides = Array.isArray(data.sessionGuides) ? data.sessionGuides : [];
    if (builtInGuides.length > 0 || sessionGuides.length > 0) {
      const guideHeader = document.createElement('div');
      guideHeader.className = 'tree-item';
      guideHeader.style.cssText =
        'color:var(--accent);font-weight:700;font-size:11px;letter-spacing:0.5px;padding:10px 8px 4px;cursor:default;text-transform:uppercase;';
      guideHeader.innerHTML = '<span class="icon">📖</span><span>가이드</span>';
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
      const refSep = document.createElement('div');
      refSep.className = 'tree-item';
      refSep.style.cssText =
        'color:var(--accent);font-weight:700;font-size:11px;letter-spacing:0.5px;padding:10px 8px 4px;cursor:default;text-transform:uppercase;border-top:1px solid var(--border-color);margin-top:8px;';
      refSep.textContent = '── 참고 파일 ──';
      content.appendChild(refSep);

      for (const item of data.refs) {
        const el = document.createElement('div');
        el.className = `tree-item${item.indent ? ' indent-' + item.indent : ''}`;

        if (item.isHeader) {
          el.style.cssText =
            'color:var(--accent);font-weight:700;font-size:11px;letter-spacing:0.5px;padding:10px 8px 4px;cursor:default;text-transform:uppercase;';
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
      content.innerHTML =
        '<div style="padding:16px;color:var(--text-secondary);font-size:13px;">참고자료가 없습니다</div>';
    }
  };

  await renderRefsPopout();
  window.popoutAPI.onRefsDataChanged(() => {
    renderRefsPopout().catch((error: unknown) => {
      reportRuntimeError({
        context: '참고자료 팝아웃 새로고침 실패',
        error,
        fallbackMessage: '참고자료 팝아웃을 새로고침하지 못했습니다.',
      });
    });
  });
}

// ==================== Editor Popout ====================

async function buildEditorPopout(): Promise<void> {
  // Header (draggable)
  const header = document.createElement('div');
  header.id = 'popout-editor-header';
  header.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;height:38px;padding:0 14px;background:linear-gradient(135deg,#4a90d9 0%,#6fb3f2 100%);color:#fff;font-size:13px;font-weight:600;-webkit-app-region:drag;flex-shrink:0;';
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:16px;">✏️</span>
      <span id="popout-editor-title">에디터</span>
    </div>
    <div style="display:flex;gap:6px;-webkit-app-region:no-drag;">
      <button id="btn-editor-save" title="저장 (Ctrl+S)" style="-webkit-app-region:no-drag;background:rgba(255,255,255,0.2);border:none;color:#fff;cursor:pointer;font-size:12px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;">💾</button>
      <button id="btn-popout-dock" title="도킹 (복원)" aria-label="도킹 (복원)" style="-webkit-app-region:no-drag;background:rgba(255,255,255,0.2);border:none;color:#fff;cursor:pointer;font-size:12px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;">📌</button>
      <button class="btn-close-popout" title="닫기" aria-label="닫기" style="-webkit-app-region:no-drag;background:rgba(255,255,255,0.2);border:none;color:#fff;cursor:pointer;font-size:12px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;">✕</button>
    </div>
  `;
  root.appendChild(header);

  // Editor container
  const editorContainer = document.createElement('div');
  editorContainer.id = 'popout-editor-container';
  editorContainer.style.cssText = 'flex:1;overflow:hidden;';
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
    theme: 'blue-archive',
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
  header.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#21222c;color:#f5f5f5;font-weight:600;font-size:13px;flex-shrink:0;border-bottom:1px solid #44475a;-webkit-app-region:drag;';
  const headerLeft = document.createElement('span');
  headerLeft.textContent = `${charData.name ?? ''} — 프리뷰`;
  headerLeft.style.cssText = '-webkit-app-region:drag;';
  const headerBtns = document.createElement('div');
  headerBtns.style.cssText = 'display:flex;gap:4px;align-items:center;-webkit-app-region:no-drag;';

  const resetBtn = document.createElement('button');
  resetBtn.textContent = '↻';
  resetBtn.title = '초기화';
  resetBtn.setAttribute('aria-label', '초기화');
  resetBtn.style.cssText =
    'background:rgba(255,255,255,0.1);border:none;color:#f5f5f5;font-size:14px;cursor:pointer;border-radius:4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;';

  // Debug toggle button
  const debugBtn = document.createElement('button');
  debugBtn.textContent = '🔧';
  debugBtn.title = '디버그 패널';
  debugBtn.setAttribute('aria-label', '디버그 패널');
  debugBtn.style.cssText = resetBtn.style.cssText;

  const dockBtn = document.createElement('button');
  dockBtn.textContent = '📌';
  dockBtn.title = '메인 창으로 도킹';
  dockBtn.setAttribute('aria-label', '메인 창으로 도킹');
  dockBtn.style.cssText = resetBtn.style.cssText;
  dockBtn.addEventListener('click', () => window.popoutAPI.dock());

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.title = '닫기';
  closeBtn.setAttribute('aria-label', '닫기');
  closeBtn.className = 'btn-close-popout';
  closeBtn.style.cssText = resetBtn.style.cssText;
  closeBtn.addEventListener('click', () => window.close());

  headerBtns.appendChild(resetBtn);
  headerBtns.appendChild(debugBtn);
  headerBtns.appendChild(dockBtn);
  headerBtns.appendChild(closeBtn);
  header.appendChild(headerLeft);
  header.appendChild(headerBtns);

  const chatFrame = document.createElement('iframe');
  chatFrame.style.cssText = 'flex:1;width:100%;border:none;background:#282a36;min-height:0;';
  chatFrame.setAttribute('sandbox', 'allow-scripts');

  const inputBar = document.createElement('div');
  inputBar.style.cssText =
    'display:flex;gap:6px;padding:8px 12px;background:#21222c;border-top:1px solid #44475a;flex-shrink:0;align-items:flex-end;';
  const chatInput = document.createElement('textarea');
  chatInput.placeholder = '메시지를 입력하세요...';
  chatInput.rows = 1;
  chatInput.style.cssText =
    'flex:1;padding:8px 12px;border:1px solid #44475a;border-radius:8px;background:#282a36;color:#f5f5f5;font-size:13px;resize:none;outline:none;max-height:120px;font-family:inherit;';
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
  const sendBtn = document.createElement('button');
  sendBtn.textContent = '전송';
  sendBtn.style.cssText =
    'padding:8px 16px;background:#4a90d9;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;white-space:nowrap;';
  inputBar.appendChild(chatInput);
  inputBar.appendChild(sendBtn);

  // ── Debug drawer ──
  const debugDrawer = document.createElement('div');
  debugDrawer.style.cssText =
    'border-top:1px solid #44475a;background:#1c2340;height:220px;display:none;flex-direction:column;flex-shrink:0;overflow:hidden;';

  const debugTabs = document.createElement('div');
  debugTabs.style.cssText =
    'display:flex;gap:2px;padding:4px 8px;background:#161b33;border-bottom:1px solid #44475a;flex-shrink:0;align-items:center;';
  const tabDefs = [
    { id: 'variables', label: '변수' },
    { id: 'lorebook', label: '로어북' },
    { id: 'lua', label: 'Lua' },
    { id: 'regex', label: '정규식' },
  ];
  const tabBtnStyle =
    'padding:3px 10px;border:none;border-radius:4px;font-size:11px;cursor:pointer;color:#aaa;background:transparent;';
  const tabBtnActiveStyle =
    'padding:3px 10px;border:none;border-radius:4px;font-size:11px;cursor:pointer;color:#fff;background:#44475a;';
  for (const td of tabDefs) {
    const tab = document.createElement('button');
    tab.style.cssText = td.id === activeDebugTab ? tabBtnActiveStyle : tabBtnStyle;
    tab.textContent = td.label;
    tab.addEventListener('click', () => {
      activeDebugTab = td.id;
      debugTabs.querySelectorAll<HTMLButtonElement>('button').forEach((t) => {
        if (t.dataset.debugTab) t.style.cssText = tabBtnStyle;
      });
      tab.style.cssText = tabBtnActiveStyle;
      updateDebugContent();
    });
    tab.dataset.debugTab = td.id;
    debugTabs.appendChild(tab);
  }

  const debugContentEl = document.createElement('div');
  debugContentEl.style.cssText = 'flex:1;overflow-y:auto;padding:6px 10px;font-size:11px;color:#ccc;';
  debugDrawer.appendChild(debugTabs);
  debugDrawer.appendChild(debugContentEl);

  // ── Debug resizer ──
  const debugResizer = document.createElement('div');
  debugResizer.style.cssText = 'height:4px;background:#44475a;cursor:ns-resize;flex-shrink:0;display:none;';
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
  debugCopyBtn.textContent = '📋 복사';
  debugCopyBtn.title = '디버그 정보 전체 복사';
  debugCopyBtn.style.cssText =
    'margin-left:auto;padding:3px 8px;border:none;border-radius:4px;font-size:11px;cursor:pointer;color:#fff;background:#2a335a;';
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
