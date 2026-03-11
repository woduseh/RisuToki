import { parseLuaSections, combineLuaSections, parseCssSections, combineCssSections } from '../lib/section-parser';
import type { Section } from '../lib/section-parser';
import type { Tab } from '../lib/tab-manager';
import type { LayoutState, LayoutSlot, PanelPosition } from '../lib/layout-manager';
import { registerActions } from '../lib/action-registry';
import { useAppStore } from '../stores/app-store';
import type { RpMode, CharxData, LorebookEntry, RegexEntry, ReferenceFile } from '../stores/app-store';
import {
  createTreeItem,
  createFolderItem,
  updateSidebarActive as _updateSidebarActive,
  initSidebarSplitResizer as _initSidebarSplitResizer,
  buildAssetsSidebar as _buildAssetsSidebar,
  createLoreEntryItem as _createLoreEntryItem,
} from '../lib/sidebar-builder';
import PreviewEngine from '../lib/preview-engine';
import {
  handleClaudeStart as _handleClaudeStart,
  handleCopilotStart as _handleCopilotStart,
  handleCodexStart as _handleCodexStart,
} from '../lib/assistant-prompt';
import {
  getDefaultRpModeForDarkMode,
  readAppSettingsSnapshot,
  readStoredLayoutState,
  subscribeToAppSettings,
  writeAutosaveDir,
  writeAutosaveEnabled,
  writeAutosaveInterval,
  writeBgmEnabled,
  writeBgmPath,
  writeLayoutState,
  writeRpCustomText,
  writeRpMode,
} from '../lib/app-settings';
import type { StoredLayoutState } from '../lib/app-settings';
import { initTokiAvatar as initTokiAvatarUi, setTokiActive } from '../lib/avatar-ui';
import { defineDarkMonacoTheme } from '../lib/dark-mode';
import { showImageViewer as renderImageViewer } from '../lib/image-viewer';
import { closeAllMenus } from '../lib/menu-bar';
import { handleTerminalDataForBgm, isBgmEnabled, pauseBgm, setBgmEnabled, setBgmFilePath } from '../lib/bgm';
import { ensureBlueArchiveMonacoTheme, loadMonacoRuntime } from '../lib/monaco-loader';
import { createBufferedTerminalChatSession } from '../lib/chat-session';
import { feedBgBuffer, initChatMode as initChatModeUi, isChatMode, onChatData } from '../lib/chat-ui';
import { NON_MONACO_EDITOR_TAB_TYPES, requiresMonacoEditor, resolvePendingEditorTab } from '../lib/editor-activation';
import { createExternalTextTabState } from '../lib/external-text-tab';
import { collectDirtyEditorFields } from '../lib/editor-dirty-fields';
import { TabManager } from '../lib/tab-manager';
import { applyStoredLayoutState, createDefaultLayoutState, createLayoutManager, V_SLOTS } from '../lib/layout-manager';
import { planMcpDataUpdate } from '../lib/mcp-data-update';
import type { PopoutDeps } from '../lib/popout-window';
import {
  dockPanel as _dockPanel,
  isPanelPoppedOut,
  popOutEditorPanel as _popOutEditorPanel,
  popOutPanel as _popOutPanel,
  removePoppedOut,
  updatePopoutButtons,
} from '../lib/popout-window';
import { showPreviewPanel as renderPreviewPanel } from '../lib/preview-panel';
import { reportRuntimeError } from '../lib/runtime-feedback';
import { ensureWasmoon } from '../lib/script-loader';
import {
  disposeFormEditors,
  getFormEditors,
  initFormEditor,
  showLoreEditor,
  showRegexEditor,
} from '../lib/form-editor';
import type { FormTabInfo } from '../lib/form-editor';
import { showConfirm, resetConfirmAllowAll, showCloseConfirm, showPrompt } from '../lib/dialog';
import { showContextMenu, hideContextMenu } from '../lib/context-menu';
import type { ContextMenuItem } from '../lib/context-menu';
import { initPanelDragDrop as _initPanelDragDrop } from '../lib/panel-drag';
import {
  initializeTerminalUi,
  shouldTreatTerminalDataAsActivity,
  TERM_THEME_DARK,
  TERM_THEME_LIGHT,
} from '../lib/terminal-ui';
import {
  applySelectedChoice,
  cleanTuiOutput,
  filterDisplayChatMessages,
  isAssistantWelcomeBanner,
  isSpinnerNoise,
  stripAnsi,
} from '../lib/terminal-chat';
import { createBackup, formatBackupTime, getBackups, showBackupMenu } from '../lib/backup-store';
import { initDragDrop } from '../lib/drag-drop-import';
import { setStatus } from '../lib/status-bar';
import { showHelpPopup } from '../lib/help-popup';
import { createSidebarActions } from '../lib/sidebar-actions';
import {
  handleNew as _handleNew,
  handleOpen as _handleOpen,
  handleSave as _handleSave,
  handleSaveAs as _handleSaveAs,
} from '../lib/file-actions';
import type { FileActionDeps } from '../lib/file-actions';
import {
  stringifyStringArray,
  addReferenceFile as _addReferenceFile,
  buildRefsSidebar as _buildRefsSidebar,
  openRefTabById as _openRefTabById,
} from '../lib/sidebar-refs';
import { initKeyboard } from './keyboard-shortcuts';
import {
  getRpLabel,
  updateRpButtonStyle,
  updateBgmButtonStyle,
  initBgmUi,
  initRpModeButton,
  toggleDarkMode as _toggleDarkMode,
  refreshDarkModeUi as _refreshDarkModeUi,
  startAutosave,
  stopAutosave,
  showSettingsPopup as _showSettingsPopup,
  handleTerminalBg,
} from './settings-handlers';
import { tryExtractPrimaryLuaFromTriggerScriptsText, mergeLuaIntoTriggerScriptsText } from './trigger-script-utils';

const settingsSnapshot = readAppSettingsSnapshot();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monaco global is complex; ambient declaration
declare const monaco: any;

// ==================== State ====================

interface MonacoEditorInstance {
  getValue(): string;
  setValue(value: string): void;
  getModel(): unknown;
  dispose(): void;
  updateOptions(opts: unknown): void;
  onDidChangeModelContent(listener: () => void): { dispose(): void };
  getAction(id: string): { run(): void } | null;
  trigger(source: string, handlerId: string, payload?: unknown): void;
  getOption(id: number): unknown;
  getPosition(): { lineNumber: number; column: number } | null;
  setPosition(position: { lineNumber: number; column: number }): void;
  layout(dimension?: { width: number; height: number }): void;
  [key: string]: unknown;
}

let fileData: CharxData | null = null; // Current charx data
let editorInstance: MonacoEditorInstance | null = null; // Monaco editor instance
let monacoReady = false;
let monacoLoadTask: Promise<boolean> | null = null;

// Lua section management
let luaSections: Section[] = []; // [{ name, content }]

// Reference files (read-only)
let referenceFiles: ReferenceFile[] = []; // [{ fileName, data }]

async function syncReferenceFiles(): Promise<ReferenceFile[]> {
  referenceFiles = await window.tokiAPI.listReferences();
  return referenceFiles;
}

// RP mode: 'off' | 'toki' | 'aris' | 'custom'
// Migrate old boolean value
// Dark mode (Risu theme)
let darkMode = settingsSnapshot.darkMode;

// RP mode: 'off' | 'toki' | 'aris' | 'custom'
// Migrate old boolean value
let rpMode = settingsSnapshot.rpMode;
let rpCustomText = settingsSnapshot.rpCustomText;

// Autosave state
let autosaveEnabled = settingsSnapshot.autosaveEnabled;
let autosaveInterval = settingsSnapshot.autosaveInterval;
let autosaveDir = settingsSnapshot.autosaveDir; // empty = same as file

/** Sync imperative controller state → Pinia store for reactive UI */
function syncStoreState(): void {
  const store = useAppStore();
  store.setDarkMode(darkMode);
  store.setRpMode(rpMode as RpMode);
  store.bgmEnabled = isBgmEnabled();
}

// Chat mode state — UI lives in ../lib/chat-ui, session created here for wiring
const chatSession = createBufferedTerminalChatSession({
  applySelectedChoice,
  cleanTuiOutput,
  filterDisplayChatMessages,
  isAssistantWelcomeBanner,
  isSpinnerNoise,
  stripAnsi,
});

// Form tab types that use special editors (not Monaco)
const FORM_TAB_TYPES = NON_MONACO_EDITOR_TAB_TYPES;

const tabMgr = new TabManager('editor-tabs', {
  onActivateTab: (tab) => createOrSwitchEditor(tab),
  onDisposeFormEditors: () => disposeFormEditors(),
  onClearEditor: () => {
    document.getElementById('editor-container')!.innerHTML = '<div class="empty-state">항목을 선택하세요</div>';
    editorInstance = null;
  },
  isPanelPoppedOut: (panelId) => isPanelPoppedOut(panelId),
  onPopOutTab: (tabId) => popOutEditorPanel(tabId),
  isFormTabType: (language) => FORM_TAB_TYPES.has(language),
});

initFormEditor({
  isMonacoReady: () => monacoReady,
  isDarkMode: () => darkMode,
  getEditorInstance: (() => editorInstance) as Parameters<typeof initFormEditor>[0]['getEditorInstance'],
  setEditorInstance: (ed) => {
    editorInstance = ed as MonacoEditorInstance | null;
  },
  getFileData: () => fileData as Record<string, unknown> | null,
  tabMgr: tabMgr as unknown as Parameters<typeof initFormEditor>[0]['tabMgr'],
  createBackup,
  showPrompt,
  buildSidebar,
});

const layoutState = createDefaultLayoutState();
try {
  applyStoredLayoutState(layoutState, readStoredLayoutState() as (StoredLayoutState & Partial<LayoutState>) | null);
} catch (error) {
  reportRuntimeError({
    context: '레이아웃 상태 복원 실패',
    error,
    logPrefix: '[Layout]',
    setStatus,
  });
}

function saveLayout(): void {
  try {
    writeLayoutState(layoutState);
  } catch (error) {
    reportRuntimeError({
      context: '레이아웃 상태 저장 실패',
      error,
      logPrefix: '[Layout]',
      setStatus,
    });
  }
}

const layoutManager = createLayoutManager({
  onRefit: () => {
    if (editorInstance) editorInstance.layout();
    if (fitAddon && term) fitAddon.fit();
  },
  onStatus: (message) => setStatus(message),
  saveState: saveLayout,
  state: layoutState,
});

// ==================== MCP Confirm Handler ====================
// Listen for MCP confirm requests from main process → show MomoTalk popup
window.tokiAPI.onMcpConfirmRequest(async (id, title, message) => {
  const result = await showConfirm(`[${title}]\n${message}`);
  window.tokiAPI.sendMcpConfirmResponse(id, result);
});

window.tokiAPI.onMcpStatus((event) => {
  const prefix = event.rejected ? 'MCP 요청 거부' : event.level === 'error' ? 'MCP 오류' : 'MCP 경고';
  const detail = event.suggestion ? ` — ${event.suggestion}` : '';
  setStatus(`${prefix}: ${event.message}${detail}`);
});

window.tokiAPI.onTerminalStatus((event) => {
  const prefix = event.level === 'error' ? '터미널 오류' : event.level === 'warn' ? '터미널 경고' : '터미널';
  const detail = event.detail ? ` — ${event.detail}` : '';
  setStatus(`${prefix}: ${event.message}${detail}`);
});

window.tokiAPI.onCloseConfirmRequest(async (id) => {
  const choice = await showCloseConfirm();
  window.tokiAPI.sendCloseConfirmResponse(id, choice);
});

function loadMonaco(): Promise<void> {
  return loadMonacoRuntime().then(() => {
    monacoReady = true;
  });
}

// ==================== Editor ====================
function initEditor(): void {
  const container = document.getElementById('editor-container')!;
  container.innerHTML = '<div class="empty-state">파일을 열어주세요 (Ctrl+O)</div>';
}

function renderEditorEmptyState(message: string): void {
  const container = document.getElementById('editor-container')!;
  if (container) {
    container.innerHTML = `<div class="empty-state">${message}</div>`;
  }
}

function ensureMonacoEditorReady(): Promise<boolean> {
  if (monacoReady) {
    return Promise.resolve(true);
  }
  if (monacoLoadTask) {
    return monacoLoadTask;
  }

  setStatus('Monaco 에디터 로딩 중...');
  monacoLoadTask = loadMonaco()
    .then(() => {
      if (darkMode) defineDarkMonacoTheme();
      flushPendingEditorActivation();
      setStatus('준비');
      return true;
    })
    .catch((err) => {
      console.error('[editor] Monaco load failed:', err);
      tabMgr.pendingEditorTabId = null;
      renderEditorEmptyState('Monaco 로딩 실패 — 에디터를 사용할 수 없습니다');
      setStatus('Monaco 로딩 실패 — 에디터 없이 동작');
      return false;
    })
    .finally(() => {
      monacoLoadTask = null;
    });

  return monacoLoadTask;
}

function queueEditorActivation(tabInfo: Tab): void {
  tabMgr.pendingEditorTabId = tabInfo.id;
  tabMgr.activeTabId = tabInfo.id;
  renderEditorEmptyState('에디터 로딩 중...');
  tabMgr.renderTabs();
  updateSidebarActive();
  void ensureMonacoEditorReady();
}

function flushPendingEditorActivation(): void {
  const pendingTab = resolvePendingEditorTab(tabMgr.openTabs, tabMgr.pendingEditorTabId, tabMgr.activeTabId);
  tabMgr.pendingEditorTabId = null;
  if (pendingTab) {
    createOrSwitchEditor(pendingTab);
  }
}

function createOrSwitchEditor(tabInfo: Tab): void {
  const container = document.getElementById('editor-container')!;

  // Special tab types: image, lorebook form, regex form

  if (tabInfo.language === '_image') {
    disposeFormEditors();
    tabMgr.activeTabId = tabInfo.id;
    showImageViewer(tabInfo.id, tabInfo._assetPath as string);
    tabMgr.renderTabs();
    updateSidebarActive();
    return;
  }

  if (tabInfo.language === '_loreform') {
    tabMgr.activeTabId = tabInfo.id;
    showLoreEditor(tabInfo as FormTabInfo);
    tabMgr.renderTabs();
    updateSidebarActive();
    return;
  }

  if (tabInfo.language === '_regexform') {
    tabMgr.activeTabId = tabInfo.id;
    showRegexEditor(tabInfo as FormTabInfo);
    tabMgr.renderTabs();
    updateSidebarActive();
    return;
  }

  if (!monacoReady && requiresMonacoEditor(tabInfo.language)) {
    queueEditorActivation(tabInfo);
    return;
  }

  // Save current editor content before switching + backup if dirty
  if (editorInstance && tabMgr.activeTabId) {
    const curTab = tabMgr.openTabs.find((t) => t.id === tabMgr.activeTabId);
    if (curTab && !FORM_TAB_TYPES.has(curTab.language) && curTab.setValue) {
      curTab._lastValue = editorInstance.getValue();
      curTab.setValue(curTab._lastValue);
      if (tabMgr.dirtyFields.has(curTab.id)) {
        createBackup(curTab.id, curTab._lastValue);
      }
    }
  }

  disposeFormEditors();
  container.innerHTML = '';
  if (editorInstance) {
    editorInstance.dispose();
  }

  tabMgr.pendingEditorTabId = null;
  ensureBlueArchiveMonacoTheme();

  if (darkMode) defineDarkMonacoTheme();

  const isReadOnly = !tabInfo.setValue;
  editorInstance = monaco.editor.create(container, {
    value: tabInfo.getValue(),
    language: tabInfo.language,
    theme: darkMode ? 'blue-archive-dark' : 'blue-archive',
    fontSize: 14,
    minimap: { enabled: true },
    wordWrap: 'on',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    tabSize: 2,
    mouseWheelZoom: true,
    readOnly: isReadOnly,
  });

  editorInstance!.onDidChangeModelContent(() => {
    const curTab = tabMgr.openTabs.find((t) => t.id === tabMgr.activeTabId);
    if (curTab && curTab.setValue) {
      // Auto-backup on first change (save original before modification)
      if (!tabMgr.dirtyFields.has(curTab.id)) {
        createBackup(curTab.id, curTab.getValue());
      }
      curTab.setValue(editorInstance!.getValue());
      tabMgr.dirtyFields.add(curTab.id);
      tabMgr.renderTabs();
      setStatus('수정됨');
    }
  });

  tabMgr.activeTabId = tabInfo.id;
  tabMgr.renderTabs();
  updateSidebarActive();
}

// ==================== Tab Management ====================

function openExternalTextTab(
  id: string,
  label: string,
  initialValue: string,
  persist: (value: string) => Promise<void> | void,
  language = 'plaintext',
): Tab | null {
  const state = createExternalTextTabState(initialValue, persist);
  return tabMgr.openTab(
    id,
    label,
    language,
    () => state.getValue(),
    (value) => {
      void state.setValue(value as string);
    },
  );
}

function buildLorebookTabState(index: number, tab: Tab): Record<string, unknown> | null {
  const entry = fileData?.lorebook?.[index];
  if (!entry) return null;

  const label = entry.comment || `entry_${index}`;
  if (tab.language === '_loreform') {
    return {
      id: `lore_${index}`,
      label,
      language: '_loreform',
      getValue: () => fileData!.lorebook[index],
      setValue: (value: unknown) => {
        Object.assign(fileData!.lorebook[index], value as Record<string, unknown>);
      },
    };
  }

  return {
    id: `lore_${index}`,
    label,
    language: tab.language || 'plaintext',
    getValue: () => fileData!.lorebook[index].content || '',
    setValue: (value: unknown) => {
      fileData!.lorebook[index].content = value as string;
    },
  };
}

function buildRegexTabState(index: number, tab: Tab): Record<string, unknown> | null {
  const entry = fileData?.regex?.[index];
  if (!entry) return null;

  const label = entry.comment || `regex_${index}`;
  if (tab.language === '_regexform') {
    return {
      id: `regex_${index}`,
      label,
      language: '_regexform',
      getValue: () => fileData!.regex[index],
      setValue: (value: unknown) => {
        Object.assign(fileData!.regex[index], value as Record<string, unknown>);
      },
    };
  }

  return {
    id: `regex_${index}`,
    label,
    language: tab.language || 'json',
    getValue: () => JSON.stringify(fileData!.regex[index], null, 2),
    setValue: (value: unknown) => {
      try {
        fileData!.regex[index] = JSON.parse(value as string);
      } catch (error) {
        reportRuntimeError({
          context: '정규식 JSON 파싱 실패',
          error,
          logPrefix: '[Editor]',
          setStatus,
        });
      }
    },
  };
}

function buildLuaSectionTabState(index: number, tab: Tab): Record<string, unknown> | null {
  const section = luaSections[index];
  if (!section) return null;

  return {
    id: `lua_s${index}`,
    label: section.name,
    language: tab.language || 'lua',
    getValue: () => luaSections[index].content,
    setValue: (value: unknown) => {
      luaSections[index].content = value as string;
      fileData!.lua = combineLuaSections(luaSections);
    },
  };
}

function buildCssSectionTabState(index: number, tab: Tab): Record<string, unknown> | null {
  const section = cssSections[index];
  if (!section) return null;

  return {
    id: `css_s${index}`,
    label: section.name,
    language: tab.language || 'css',
    getValue: () => cssSections[index].content,
    setValue: (value: unknown) => {
      cssSections[index].content = value as string;
      fileData!.css = combineCssSections(cssSections, _cssStylePrefix, _cssStyleSuffix);
    },
  };
}

// ==================== Sidebar ====================

// ==================== Sidebar ====================

// Dependency adapter for the extracted sidebar-refs module
function getRefsSidebarDeps() {
  return {
    getReferenceFiles: () => referenceFiles,
    syncReferenceFiles,
    showContextMenu,
    showConfirm,
    showPrompt,
    setStatus,
    openTab: (
      id: string,
      label: string,
      lang: string,
      getValue: () => unknown,
      setValue: ((v: unknown) => void) | null,
    ) => tabMgr.openTab(id, label, lang, getValue, setValue),
    findOpenTab: (id: string) => tabMgr.openTabs.find((t) => t.id === id),
    activateTab: (id: string) => {
      const tab = tabMgr.openTabs.find((t) => t.id === id);
      if (tab) {
        tabMgr.activeTabId = id;
        createOrSwitchEditor(tab);
        tabMgr.renderTabs();
      }
    },
    closeTab: (id: string) => tabMgr.closeTab(id),
    openExternalTextTab,
    openReference: () => window.tokiAPI.openReference(),
    removeReference: (p: string) => window.tokiAPI.removeReference(p),
    removeAllReferences: () => window.tokiAPI.removeAllReferences(),
    listGuides: () => window.tokiAPI.listGuides(),
    readGuide: (n: string) => window.tokiAPI.readGuide(n),
    writeGuide: (n: string, c: string) => window.tokiAPI.writeGuide(n, c),
    deleteGuide: (n: string) => window.tokiAPI.deleteGuide(n),
    importGuide: () => window.tokiAPI.importGuide(),
    getGuidesPath: () => window.tokiAPI.getGuidesPath(),
  };
}

function buildRefsSidebar(): void {
  const refsEl = document.getElementById('sidebar-refs');
  if (!refsEl) return;
  _buildRefsSidebar(refsEl, getRefsSidebarDeps() as unknown as Parameters<typeof _buildRefsSidebar>[1]);
}

function addReferenceFile(): void {
  const refsEl = document.getElementById('sidebar-refs');
  if (!refsEl) return;
  _addReferenceFile(refsEl, getRefsSidebarDeps() as unknown as Parameters<typeof _addReferenceFile>[1]);
}

function openRefTabById(tabId: string): void {
  _openRefTabById(tabId, getRefsSidebarDeps());
}

// ---------------------------------------------------------------------------
// Context-menu helpers (shared by sidebar items)
// ---------------------------------------------------------------------------

function createMcpCopyItem(mcpPath: string): ContextMenuItem {
  return {
    label: 'MCP 경로 복사',
    action: () => {
      navigator.clipboard.writeText(mcpPath);
      setStatus(`복사됨: ${mcpPath}`);
    },
  };
}

function appendBackupItems(items: ContextMenuItem[], backupKey: string, x: number, y: number): void {
  const store = getBackups(backupKey);
  if (store.length > 0) {
    items.push('---');
    items.push({
      label: '백업 불러오기',
      action: () => showBackupMenu(backupKey, x, y, backupMenuCallbacks),
    });
  }
}

function buildSidebar(): void {
  const tree = document.getElementById('sidebar-tree')!;
  tree.innerHTML = '';

  // Always build refs sidebar regardless of fileData
  buildRefsSidebar();

  if (!fileData) return;

  // ---- Lua folder (split/merge system) ----
  luaSections = parseLuaSections(fileData.lua);

  const luaFolder = createFolderItem('Lua', '{}', 0);
  tree.appendChild(luaFolder.header);
  tree.appendChild(luaFolder.children);

  // Right-click on Lua folder: add new section
  luaFolder.header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, [{ label: '새 하위항목 추가', action: () => addLuaSection() }]);
  });

  // Combined Lua view
  const luaCombinedEl = createTreeItem('통합 보기', '📋', 1);
  luaCombinedEl.dataset.label = 'Lua';
  luaCombinedEl.addEventListener('click', () => {
    fileData!.lua = combineLuaSections(luaSections);
    tabMgr.openTab(
      'lua',
      'Lua (통합)',
      'lua',
      () => fileData!.lua,
      (v: unknown) => {
        fileData!.lua = v as string;
        luaSections = parseLuaSections(v as string);
      },
    );
  });
  luaCombinedEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [createMcpCopyItem('read_field("lua")')];
    appendBackupItems(items, 'lua', e.clientX, e.clientY);
    showContextMenu(e.clientX, e.clientY, items);
  });
  luaFolder.children.appendChild(luaCombinedEl);

  // Individual Lua sections
  for (let i = 0; i < luaSections.length; i++) {
    const section = luaSections[i];
    const sectionEl = createTreeItem(section.name, '·', 1);
    const idx = i;
    sectionEl.addEventListener('click', () => {
      tabMgr.openTab(
        `lua_s${idx}`,
        section.name,
        'lua',
        () => luaSections[idx].content,
        (v: unknown) => {
          luaSections[idx].content = v as string;
          fileData!.lua = combineLuaSections(luaSections);
        },
      );
    });
    sectionEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items: ContextMenuItem[] = [
        { label: '이름 변경', action: () => renameLuaSection(idx) },
        createMcpCopyItem(`read_lua(${idx})`),
      ];
      appendBackupItems(items, `lua_s${idx}`, e.clientX, e.clientY);
      items.push('---');
      items.push({ label: '삭제', action: () => deleteLuaSection(idx) });
      showContextMenu(e.clientX, e.clientY, items);
    });
    luaFolder.children.appendChild(sectionEl);
  }

  // ---- File type check ----
  const isRisum = fileData._fileType === 'risum';

  // ---- CSS folder (section-based, like Lua) — charx only ----
  ({ sections: cssSections, prefix: _cssStylePrefix, suffix: _cssStyleSuffix } = parseCssSections(fileData.css));
  if (!isRisum) {
    const cssFolder = createFolderItem('CSS', '🎨', 0);
    tree.appendChild(cssFolder.header);
    tree.appendChild(cssFolder.children);

    // Right-click on CSS folder: add new section
    cssFolder.header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, [{ label: '새 하위항목 추가', action: () => addCssSection() }]);
    });

    // Combined CSS view
    const cssCombinedEl = createTreeItem('통합 보기', '📋', 1);
    cssCombinedEl.addEventListener('click', () => {
      tabMgr.openTab(
        'css',
        'CSS (통합)',
        'css',
        () => fileData!.css,
        (v: unknown) => {
          fileData!.css = v as string;
          ({ sections: cssSections, prefix: _cssStylePrefix, suffix: _cssStyleSuffix } = parseCssSections(v as string));
        },
      );
    });
    cssCombinedEl.addEventListener('contextmenu', (e) => {
      const items: ContextMenuItem[] = [createMcpCopyItem('read_field("css")')];
      appendBackupItems(items, 'css', e.clientX, e.clientY);
      showContextMenu(e.clientX, e.clientY, items);
    });
    cssFolder.children.appendChild(cssCombinedEl);

    // Individual CSS sections
    for (let i = 0; i < cssSections.length; i++) {
      const section = cssSections[i];
      const sectionEl = createTreeItem(section.name, '·', 1);
      const idx = i;
      sectionEl.addEventListener('click', () => {
        tabMgr.openTab(
          `css_s${idx}`,
          section.name,
          'css',
          () => cssSections[idx].content,
          (v: unknown) => {
            cssSections[idx].content = v as string;
            fileData!.css = combineCssSections(cssSections, _cssStylePrefix, _cssStyleSuffix);
          },
        );
      });
      sectionEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const items: ContextMenuItem[] = [
          { label: '이름 변경', action: () => renameCssSection(idx) },
          createMcpCopyItem(`read_css(${idx})`),
        ];
        appendBackupItems(items, `css_s${idx}`, e.clientX, e.clientY);
        items.push('---');
        items.push({ label: '삭제', action: () => deleteCssSection(idx) });
        showContextMenu(e.clientX, e.clientY, items);
      });
      cssFolder.children.appendChild(sectionEl);
    }
  } // end if (!isRisum) — CSS folder

  // ---- Single items ----
  const isRisup = fileData._fileType === 'risup';
  const charxOnlyFields = [
    'globalNote',
    'firstMessage',
    'alternateGreetings',
    'groupOnlyGreetings',
    'defaultVariables',
  ];
  const singles = [
    { id: 'globalNote', label: '글로벌노트', icon: '📝', lang: 'plaintext', field: 'globalNote' },
    { id: 'firstMessage', label: '첫 메시지', icon: '💬', lang: 'html', field: 'firstMessage' },
    {
      id: 'triggerScripts',
      label: '트리거 스크립트',
      icon: '🪝',
      lang: 'json',
      field: 'triggerScripts',
      get: () => fileData!.triggerScripts || '[]',
      set: (value: unknown) => {
        fileData!.triggerScripts = value as string;
        const nextLua = tryExtractPrimaryLuaFromTriggerScriptsText(value as string);
        if (nextLua !== null) fileData!.lua = nextLua;
      },
    },
    {
      id: 'alternateGreetings',
      label: '추가 첫 메시지',
      icon: '💭',
      lang: 'json',
      field: 'alternateGreetings',
      readonly: true,
      get: () => stringifyStringArray(fileData!.alternateGreetings),
    },
    {
      id: 'groupOnlyGreetings',
      label: '그룹 첫 메시지',
      icon: '👥',
      lang: 'json',
      field: 'groupOnlyGreetings',
      readonly: true,
      get: () => stringifyStringArray(fileData!.groupOnlyGreetings),
    },
    { id: 'defaultVariables', label: '기본변수', icon: '⚙', lang: 'plaintext', field: 'defaultVariables' },
    { id: 'description', label: '설명', icon: '📄', lang: 'plaintext', field: 'description' },
  ].filter((item) => (!isRisum && !isRisup) || !charxOnlyFields.includes(item.id));

  for (const item of singles) {
    const el = createTreeItem(item.label, item.icon, 0);
    el.addEventListener('click', () => {
      tabMgr.openTab(
        item.id,
        item.label,
        item.lang,
        item.get || (() => fileData![item.field!]),
        item.readonly
          ? null
          : item.set ||
              ((v: unknown) => {
                fileData![item.field!] = v;
              }),
      );
    });
    // Single item right-click: MCP path / backup
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items: ContextMenuItem[] = [];
      if (item.field) {
        items.push(createMcpCopyItem(`read_field("${item.field}")`));
      }
      appendBackupItems(items, item.id, e.clientX, e.clientY);
      showContextMenu(e.clientX, e.clientY, items);
    });
    tree.appendChild(el);
  }

  // Lorebook folder
  const lbFolder = createFolderItem('로어북', '📚', 0);
  tree.appendChild(lbFolder.header);
  tree.appendChild(lbFolder.children);

  // Lorebook folder right-click: add folder/entry / import / bulk delete
  lbFolder.header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      { label: '새 항목 추가', action: () => addNewLorebook() },
      { label: '새 폴더 추가', action: () => addNewLorebookFolder() },
      '---',
      { label: 'JSON 파일 가져오기', action: () => importLorebook() },
    ];
    if (fileData!.lorebook.length > 0) {
      items.push('---');
      items.push({
        label: `전체 삭제 (${fileData!.lorebook.length}개)`,
        action: async () => {
          if (
            !(await showConfirm(
              `로어북 전체 ${fileData!.lorebook.length}개 항목을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
            ))
          )
            return;
          // Close all lorebook tabs
          for (let i = fileData!.lorebook.length - 1; i >= 0; i--) tabMgr.closeTab(`lore_${i}`);
          fileData!.lorebook = [];
          tabMgr.markFieldDirty('lorebook');
          buildSidebar();
          setStatus('로어북 전체 삭제됨');
        },
      });
    }
    showContextMenu(e.clientX, e.clientY, items);
  });

  // Group lorebook by folder (robust multi-key matching)
  type LoreChild = { entry: LorebookEntry; index: number };
  type LoreFolder = { entry: LorebookEntry; index: number; children: LoreChild[] };
  const folderDataList: LoreFolder[] = []; // { entry, index, children }
  const folderLookup: Record<string, LoreFolder> = {}; // multiple keys → same folderData
  const rootEntries: LoreChild[] = [];
  for (let i = 0; i < fileData.lorebook.length; i++) {
    const entry = fileData.lorebook[i];
    if (entry.mode === 'folder') {
      const fd: LoreFolder = {
        entry,
        index: i,
        children: [],
      };
      folderDataList.push(fd);
      // Map by all possible IDs a child might reference
      const k = entry.key || '';
      const c = entry.comment || '';
      if (k) {
        folderLookup[`folder:${k}`] = fd;
        folderLookup[k] = fd;
      }
      if (c) {
        folderLookup[`folder:${c}`] = fd;
        folderLookup[c] = fd;
      }
      folderLookup[`folder:${i}`] = fd;
      folderLookup[String(i)] = fd;
    }
  }
  for (let i = 0; i < fileData.lorebook.length; i++) {
    const entry = fileData.lorebook[i];
    if (entry.mode === 'folder') continue;
    const folderId = entry.folder;
    const matched = folderId ? folderLookup[folderId] || folderLookup[String(folderId)] : null;
    if (matched) {
      matched.children.push({ entry, index: i });
    } else {
      rootEntries.push({ entry, index: i });
    }
  }

  for (const folder of folderDataList) {
    const subFolder = createFolderItem(folder.entry.comment || `folder_${folder.index}`, '📁', 1);
    lbFolder.children.appendChild(subFolder.header);
    lbFolder.children.appendChild(subFolder.children);

    // Lorebook folder right-click: rename / add entry / delete contents / delete folder
    const folderIdx = folder.index;
    const folderChildren = folder.children;
    subFolder.header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fEntry = fileData!.lorebook[folderIdx];
      const folderId = `folder:${fEntry.key || fEntry.comment || folderIdx}`;
      showContextMenu(e.clientX, e.clientY, [
        {
          label: '이름 변경',
          action: async () => {
            const newName = await showPrompt('폴더 이름', fEntry.comment || '');
            if (!newName) return;
            fEntry.comment = newName;
            tabMgr.markFieldDirty('lorebook');
            buildSidebar();
            setStatus(`폴더 이름 변경: ${newName}`);
          },
        },
        {
          label: '새 항목 추가',
          action: () => {
            const newEntry: LorebookEntry = {
              key: '',
              content: '',
              comment: `new_entry_${fileData!.lorebook.length}`,
              mode: 'normal',
              insertorder: 100,
              alwaysActive: false,
              forceActivation: false,
              selective: false,
              secondkey: '',
              constant: false,
              order: fileData!.lorebook.length,
              priority: 0,
              useRegex: false,
              extentions: {},
              folder: folderId,
            };
            fileData!.lorebook.push(newEntry);
            tabMgr.markFieldDirty('lorebook');
            buildSidebar();
            const idx = fileData!.lorebook.length - 1;
            tabMgr.openTab(
              `lore_${idx}`,
              newEntry.comment,
              '_loreform',
              () => fileData!.lorebook[idx],
              (v) => {
                Object.assign(fileData!.lorebook[idx], v);
              },
            );
            setStatus('폴더에 새 항목 추가됨');
          },
        },
        '---',
        ...(folderChildren.length > 0
          ? [
              {
                label: `내용 일괄 삭제 (${folderChildren.length}개)`,
                action: async () => {
                  if (
                    !(await showConfirm(
                      `"${fEntry.comment}" 폴더 내 ${folderChildren.length}개 항목을 모두 삭제하시겠습니까?`,
                    ))
                  )
                    return;
                  const indices = folderChildren.map((c) => c.index).sort((a, b) => b - a);
                  for (const i of indices) {
                    tabMgr.closeTab(`lore_${i}`);
                    fileData!.lorebook.splice(i, 1);
                  }
                  tabMgr.markFieldDirty('lorebook');
                  buildSidebar();
                  tabMgr.shiftIndexedTabsAfterRemoval('lore_', indices, buildLorebookTabState);
                  setStatus(`${indices.length}개 항목 삭제됨`);
                },
              },
            ]
          : []),
        {
          label: '폴더 삭제 (폴더만)',
          action: async () => {
            if (!(await showConfirm(`"${fEntry.comment}" 폴더를 삭제하시겠습니까?\n내부 항목은 루트로 이동됩니다.`)))
              return;
            // Move children to root
            for (const child of folderChildren) {
              fileData!.lorebook[child.index].folder = '';
            }
            tabMgr.closeTab(`lore_${folderIdx}`);
            fileData!.lorebook.splice(folderIdx, 1);
            tabMgr.markFieldDirty('lorebook');
            buildSidebar();
            tabMgr.shiftIndexedTabsAfterRemoval('lore_', [folderIdx], buildLorebookTabState);
            setStatus(`폴더 삭제됨: ${fEntry.comment}`);
          },
        },
        {
          label: '폴더+내용 전체 삭제',
          action: async () => {
            const total = folderChildren.length + 1;
            if (
              !(await showConfirm(
                `"${fEntry.comment}" 폴더와 내부 ${folderChildren.length}개 항목을 모두 삭제하시겠습니까?`,
              ))
            )
              return;
            const indices = [folderIdx, ...folderChildren.map((c) => c.index)].sort((a, b) => b - a);
            for (const i of indices) {
              tabMgr.closeTab(`lore_${i}`);
              fileData!.lorebook.splice(i, 1);
            }
            tabMgr.markFieldDirty('lorebook');
            buildSidebar();
            tabMgr.shiftIndexedTabsAfterRemoval('lore_', indices, buildLorebookTabState);
            setStatus(`폴더+내용 삭제됨 (${total}개)`);
          },
        },
      ]);
    });

    for (const child of folder.children) {
      const entryEl = createLoreEntryItem(child, 2);
      subFolder.children.appendChild(entryEl);
    }
  }

  for (const child of rootEntries) {
    const entryEl = createLoreEntryItem(child, 1);
    lbFolder.children.appendChild(entryEl);
  }

  // Regex folder
  const rxFolder = createFolderItem('정규식', '⚡', 0);
  tree.appendChild(rxFolder.header);
  tree.appendChild(rxFolder.children);

  // Regex folder right-click: add / import / bulk delete
  rxFolder.header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      { label: '새 항목 추가', action: () => addNewRegex() },
      { label: 'JSON 파일 가져오기', action: () => importRegex() },
    ];
    if (fileData!.regex.length > 0) {
      items.push('---');
      items.push({
        label: `전체 삭제 (${fileData!.regex.length}개)`,
        action: async () => {
          if (
            !(await showConfirm(
              `정규식 전체 ${fileData!.regex.length}개 항목을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
            ))
          )
            return;
          for (let i = fileData!.regex.length - 1; i >= 0; i--) tabMgr.closeTab(`regex_${i}`);
          fileData!.regex = [];
          tabMgr.markFieldDirty('regex');
          buildSidebar();
          setStatus('정규식 전체 삭제됨');
        },
      });
    }
    showContextMenu(e.clientX, e.clientY, items);
  });

  for (let i = 0; i < fileData.regex.length; i++) {
    const rx = fileData.regex[i];
    const label = rx.comment || `regex_${i}`;
    const el = createTreeItem(label, '·', 1);
    const idx = i;
    el.addEventListener('click', () => {
      tabMgr.openTab(
        `regex_${idx}`,
        label,
        '_regexform',
        () => fileData!.regex[idx],
        (v) => {
          Object.assign(fileData!.regex[idx], v);
        },
      );
    });
    // Regex item right-click: rename / copy path / backup / delete
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items: ContextMenuItem[] = [
        { label: '이름 변경', action: () => renameRegex(idx) },
        createMcpCopyItem(`read_regex(${idx})`),
      ];
      appendBackupItems(items, `regex_${idx}`, e.clientX, e.clientY);
      items.push('---');
      items.push({ label: '삭제', action: () => deleteRegex(idx) });
      showContextMenu(e.clientX, e.clientY, items);
    });
    rxFolder.children.appendChild(el);
  }

  // Assets (images) folder
  buildAssetsSidebar(tree);
}

function buildAssetsSidebar(tree: HTMLElement): void {
  _buildAssetsSidebar(tree, {
    showContextMenu,
    addAssetFromDialog,
    openImageTab,
    attachAssetContextMenu,
  });
}

function initSidebarSplitResizer(): void {
  _initSidebarSplitResizer({
    moveRefs: moveRefs as (pos: string) => void,
    popOutPanel,
    dockPanel,
    isPanelPoppedOut,
    showContextMenu,
  });
}

function createLoreEntryItem(child: { entry: LorebookEntry; index: number }, indent: number): HTMLElement {
  return _createLoreEntryItem(child, indent, {
    getFileData: () => fileData,
    openTab: (id, label, language, getValue, setValue) => tabMgr.openTab(id, label, language, getValue, setValue),
    showContextMenu,
    renameLorebook,
    deleteLorebook,
    setStatus,
    getBackups,
    showBackupMenu: (tabId, x, y) => showBackupMenu(tabId, x, y, backupMenuCallbacks),
  });
}

function updateSidebarActive(): void {
  _updateSidebarActive(tabMgr.activeTabId, tabMgr.openTabs);
}

// ==================== Sidebar Actions (delegated to ../lib/sidebar-actions) ====================

let _cssStylePrefix = '';
let _cssStyleSuffix = '';

let cssSections: Section[] = [];

const sidebarActions = createSidebarActions({
  getFileData: () => fileData,
  getLuaSections: () => luaSections,
  getCssSections: () => cssSections,
  getCssStylePrefix: () => _cssStylePrefix,
  getCssStyleSuffix: () => _cssStyleSuffix,
  showConfirm,
  showPrompt,
  showContextMenu,
  setStatus,
  buildSidebar,
  combineLuaSections,
  combineCssSections,
  openTab: (id, label, language, getValue, setValue) => tabMgr.openTab(id, label, language, getValue, setValue),
  closeTab: (id: string) => tabMgr.closeTab(id),
  markFieldDirty: (field) => tabMgr.markFieldDirty(field),
  shiftIndexedTabsAfterRemoval: (prefix, removed, fn) => tabMgr.shiftIndexedTabsAfterRemoval(prefix, removed, fn),
  refreshIndexedTabs: (prefix, fn) => tabMgr.refreshIndexedTabs(prefix, fn),
  buildLorebookTabState,
  buildRegexTabState,
  buildLuaSectionTabState,
  buildCssSectionTabState,
});

const {
  addNewLorebook,
  addNewLorebookFolder,
  importLorebook,
  deleteLorebook,
  renameLorebook,
  addNewRegex,
  importRegex,
  deleteRegex,
  renameRegex,
  addAssetFromDialog,
  attachAssetContextMenu,
  addLuaSection,
  renameLuaSection,
  deleteLuaSection,
  addCssSection,
  renameCssSection,
  deleteCssSection,
} = sidebarActions;

// ==================== Backup System ====================

const backupMenuCallbacks = { setStatus, onRestore: restoreBackup };

function restoreBackup(tabId: string, backupIdx: number): void {
  const store = getBackups(tabId);
  if (!store[backupIdx]) return;

  const backup = store[backupIdx];

  // Find the matching tab or open it
  const tab = tabMgr.openTabs.find((t) => t.id === tabId);
  if (tab) {
    // Backup current content before restoring
    if (editorInstance && tabMgr.activeTabId === tabId) {
      createBackup(tabId, editorInstance.getValue());
    }
    tab.setValue!(backup.content);
    // Refresh editor if it's the active tab
    if (tabMgr.activeTabId === tabId && editorInstance) {
      editorInstance.setValue(backup.content as string);
    }
  } else {
    if (!fileData) return;
    // Tab not open - need to update the data directly
    // For lua sections
    if (tabId.startsWith('lua_s')) {
      const idx = parseInt(tabId.replace('lua_s', ''), 10);
      if (luaSections[idx]) {
        luaSections[idx].content = backup.content as string;
        fileData.lua = combineLuaSections(luaSections);
      }
    } else if (tabId === 'lua') {
      fileData.lua = backup.content as string;
      luaSections = parseLuaSections(backup.content as string);
    } else if (tabId === 'css') {
      fileData.css = backup.content as string;
      ({
        sections: cssSections,
        prefix: _cssStylePrefix,
        suffix: _cssStyleSuffix,
      } = parseCssSections(backup.content as string));
    } else if (tabId.startsWith('lore_')) {
      const idx = parseInt(tabId.replace('lore_', ''), 10);
      if (fileData.lorebook[idx]) {
        if (typeof backup.content === 'object') {
          Object.assign(fileData.lorebook[idx], backup.content);
        } else {
          fileData.lorebook[idx].content = backup.content as string;
        }
      }
    } else if (tabId.startsWith('regex_')) {
      const idx = parseInt(tabId.replace('regex_', ''), 10);
      if (fileData.regex[idx]) {
        if (typeof backup.content === 'object') {
          Object.assign(fileData.regex[idx], backup.content);
        } else {
          try {
            Object.assign(fileData.regex[idx], JSON.parse(backup.content as string));
          } catch (error) {
            console.warn('[Backup] Failed to parse regex backup JSON:', error);
            setStatus('정규식 백업 복원 실패: JSON 형식이 올바르지 않습니다');
            return;
          }
        }
      }
    } else if (fileData[tabId] !== undefined) {
      fileData[tabId] = backup.content;
    }
  }

  tabMgr.markDirtyForTabId(tabId);
  if (tabId.startsWith('lore_')) {
    tabMgr.refreshIndexedTabs('lore_', buildLorebookTabState);
  } else if (tabId.startsWith('regex_')) {
    tabMgr.refreshIndexedTabs('regex_', buildRegexTabState);
  } else if (tabId.startsWith('lua_s')) {
    tabMgr.refreshIndexedTabs('lua_s', buildLuaSectionTabState);
  } else if (tabId.startsWith('css_s')) {
    tabMgr.refreshIndexedTabs('css_s', buildCssSectionTabState);
  }
  setStatus(`백업 v${backupIdx + 1} 복원됨 (${formatBackupTime(backup.time)})`);
}

// ==================== Terminal (xterm.js + node-pty) ====================
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- xterm.js types would need additional imports
let term: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- xterm.js FitAddon type
let fitAddon: any = null;

async function initTerminal(): Promise<void> {
  const container = document.getElementById('terminal-container')!;
  const terminalUi = await initializeTerminalUi({
    api: {
      onTerminalData: (callback) => window.tokiAPI.onTerminalData(callback),
      onTerminalExit: (callback) => window.tokiAPI.onTerminalExit(callback),
      onTerminalStatus: (callback) => window.tokiAPI.onTerminalStatus(callback),
      terminalInput: (data) => window.tokiAPI.terminalInput(data),
      terminalIsRunning: () => window.tokiAPI.terminalIsRunning(),
      terminalResize: (cols, rows) => window.tokiAPI.terminalResize(cols, rows),
      terminalStart: (cols, rows) => window.tokiAPI.terminalStart(cols, rows),
    },
    container,
    onActivity: () => handleTerminalDataForBgm(),
    onTerminalData: (data) => {
      if (isChatMode()) onChatData(data);
      feedBgBuffer(data);
    },
    onUserInput: () => {
      lastUserInputTime = Date.now();
    },
    preserveAmdLoader: true,
    rightClickSelectsWord: true,
    setActive: setTokiActive,
    shouldActivateOnData: () => shouldTreatTerminalDataAsActivity(lastUserInputTime),
    theme: darkMode ? TERM_THEME_DARK : TERM_THEME_LIGHT,
    writeStatusToTerminal: true,
  });
  term = terminalUi.term;
  fitAddon = terminalUi.fitAddon;
}

// ==================== Image Viewer ====================
function openImageTab(assetPath: string, fileName: string): void {
  const tabId = `img_${assetPath}`;
  // Check if already open
  if (tabMgr.openTabs.find((t) => t.id === tabId)) {
    tabMgr.activeTabId = tabId;
    showImageViewer(tabId, assetPath);
    tabMgr.renderTabs();
    updateSidebarActive();
    return;
  }

  // Add tab manually (not Monaco editor)
  const tab = {
    id: tabId,
    label: fileName,
    language: '_image',
    getValue: () => '',
    setValue: () => {},
    _lastValue: null,
    _assetPath: assetPath,
  };
  tabMgr.openTabs.push(tab);
  tabMgr.activeTabId = tabId;
  showImageViewer(tabId, assetPath);
  tabMgr.renderTabs();
  updateSidebarActive();
}

async function showImageViewer(tabId: string, assetPath: string): Promise<void> {
  // Save current Monaco editor
  if (editorInstance && tabMgr.activeTabId !== tabId) {
    const curTab = tabMgr.openTabs.find((t) => t.id === tabMgr.activeTabId);
    if (curTab && curTab.language !== '_image' && curTab.setValue) {
      curTab._lastValue = editorInstance.getValue();
      curTab.setValue(curTab._lastValue);
    }
  }

  const container = document.getElementById('editor-container')!;
  container.innerHTML = '';
  if (editorInstance) {
    editorInstance.dispose();
    editorInstance = null;
  }

  await renderImageViewer(container, assetPath);
}

// ==================== Layout Management ====================

function rebuildLayout(): void {
  layoutManager.rebuild();
}

function toggleSidebar(): void {
  layoutManager.toggleSidebar();
}

function toggleTerminal(): void {
  layoutManager.toggleTerminal();
}

function toggleAvatar(): void {
  layoutManager.toggleAvatar();
}

function moveItems(pos: LayoutSlot | 'hide'): void {
  layoutManager.moveItems(pos);
}

function moveTerminal(pos: LayoutSlot): void {
  layoutManager.moveTerminal(pos);
}

function moveRefs(pos: PanelPosition): void {
  layoutManager.moveRefs(pos);
}

function resetLayout(): void {
  layoutManager.resetLayout();
}

async function restartTerminal(): Promise<void> {
  if (!term) return;
  await window.tokiAPI.terminalStop();
  // Wait for pty to fully terminate before starting a new one
  await new Promise((r) => setTimeout(r, 200));
  term.clear();
  const restarted = await window.tokiAPI.terminalStart(term.cols, term.rows);
  setStatus(restarted ? '터미널 재시작됨' : '터미널 재시작 실패');
}

// ==================== Actions ====================
/** @type {import('../lib/file-actions').FileActionDeps} */
const fileActionDeps: FileActionDeps = {
  getFileData: () => fileData,
  setFileData: (d) => {
    fileData = d as CharxData;
  },
  getEditorInstance: () => editorInstance,
  setEditorInstance: (v) => {
    editorInstance = v;
  },
  getAutosaveDir: () => autosaveDir,
  tabMgr,
  buildSidebar,
  setStatus,
};

async function handleNew(): Promise<void> {
  return _handleNew(fileActionDeps);
}
async function handleOpen(): Promise<void> {
  return _handleOpen(fileActionDeps);
}
async function handleSave(): Promise<void> {
  return _handleSave(fileActionDeps);
}
async function handleSaveAs(): Promise<void> {
  return _handleSaveAs(fileActionDeps);
}

// ==================== RP Mode ====================
// RP mode UI is in ./settings-handlers.ts

// Trigger script text helpers are in ./trigger-script-utils.ts

function getAssistantDeps() {
  return {
    rpMode,
    rpCustomText,
    hasTerminal: !!term,
    readPersona: (mode: string) => window.tokiAPI.readPersona(mode),
    getClaudePrompt: () => window.tokiAPI.getClaudePrompt(),
    writeMcpConfig: () => window.tokiAPI.writeMcpConfig(),
    writeCopilotMcpConfig: () => window.tokiAPI.writeCopilotMcpConfig(),
    writeCodexMcpConfig: () => window.tokiAPI.writeCodexMcpConfig(),
    cleanupAgentsMd: () => window.tokiAPI.cleanupAgentsMd(),
    writeSystemPrompt: (content: string) => window.tokiAPI.writeSystemPrompt(content),
    writeAgentsMd: (content: string) => window.tokiAPI.writeAgentsMd(content),
    terminalInput: (text: string) => window.tokiAPI.terminalInput(text),
    setStatus,
    navigatorLike: window.navigator,
  };
}

async function handleClaudeStart(): Promise<void> {
  // getAssistantDeps() is structurally compatible at runtime; minor return-type
  // mismatches (Promise<boolean> vs Promise<void>) require the double assertion.
  await _handleClaudeStart(getAssistantDeps() as unknown as Parameters<typeof _handleClaudeStart>[0]);
}

async function handleCopilotStart(): Promise<void> {
  await _handleCopilotStart(getAssistantDeps() as unknown as Parameters<typeof _handleCopilotStart>[0]);
}

async function handleCodexStart(): Promise<void> {
  await _handleCodexStart(getAssistantDeps() as unknown as Parameters<typeof _handleCodexStart>[0]);
}

// ==================== Terminal Background ====================
// Terminal background handler is in ./settings-handlers.ts

// ==================== Resizers ====================
function initResizers(): void {
  // Slot resizers are initialized by rebuildLayout() → initSlotResizers()
  // Only avatar-terminal resizer needs static init here

  const avatarResizer = document.getElementById('avatar-resizer');
  const avatar = document.getElementById('toki-avatar')!;
  if (avatarResizer) {
    avatarResizer.addEventListener('mousedown', (e) => {
      if (!V_SLOTS.has(layoutState.terminalPos)) return; // only in vertical slots
      e.preventDefault();
      avatarResizer.classList.add('active');
      const startY = e.clientY;
      const startH = avatar.offsetHeight;
      const onMove = (ev: MouseEvent) => {
        const dy = ev.clientY - startY;
        avatar.style.height = Math.max(60, Math.min(400, startH + dy)) + 'px';
      };
      const onUp = () => {
        avatarResizer.classList.remove('active');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (fitAddon && term) fitAddon.fit();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // Terminal toggle — handled by Vue @click in App.vue (action 'toggle-terminal')
}

// ==================== Dark Mode ====================

function getDarkModeDeps() {
  return {
    getEditorInstance: () => editorInstance as { updateOptions(opts: unknown): void } | null,
    getFormEditors: () => getFormEditors() as Array<{ updateOptions(opts: unknown): void }>,
    getTerminal: () => term as { options: { theme: unknown } } | null,
    getRpMode: () => rpMode,
    setRpMode: (mode: string) => {
      rpMode = mode as RpMode;
    },
    termThemeDark: TERM_THEME_DARK,
    termThemeLight: TERM_THEME_LIGHT,
  };
}

function toggleDarkMode(): void {
  darkMode = _toggleDarkMode(darkMode, getDarkModeDeps());
  syncStoreState();
}

function refreshDarkModeUi(): void {
  _refreshDarkModeUi(darkMode, getDarkModeDeps());
}

// ==================== BGM (Terminal Response Music) ====================
// BGM UI initialization is in ./settings-handlers.ts

// Echo filter: ignore terminal data within 300ms of user input
let lastUserInputTime = 0;

// Help popup and syntax reference are now in '../lib/help-popup'

// ==================== Autosave ====================
// Autosave is in ./settings-handlers.ts

function getAutosaveDeps() {
  return {
    getAutosaveEnabled: () => autosaveEnabled,
    getAutosaveInterval: () => autosaveInterval,
    getAutosaveDir: () => autosaveDir,
    getDirtyFieldCount: () => tabMgr.dirtyFields.size,
    getFileData: () => fileData as Record<string, unknown> | null,
    collectDirtyFields: () =>
      collectDirtyEditorFields({
        dirtyFields: tabMgr.dirtyFields,
        fileData: fileData!,
        openTabs: tabMgr.openTabs,
      }),
  };
}

// ==================== Settings Popup ====================

function showSettingsPopup(): void {
  _showSettingsPopup({
    getState: () => ({
      autosaveEnabled,
      autosaveInterval,
      autosaveDir,
      darkMode,
      bgmEnabled: isBgmEnabled(),
      rpMode,
      rpCustomText,
    }),
    onAutosaveToggle(enabled) {
      autosaveEnabled = enabled;
      writeAutosaveEnabled(autosaveEnabled);
      if (autosaveEnabled) startAutosave(getAutosaveDeps());
      else stopAutosave();
    },
    onAutosaveIntervalChange(interval) {
      autosaveInterval = interval;
      writeAutosaveInterval(autosaveInterval);
      if (autosaveEnabled) startAutosave(getAutosaveDeps());
    },
    async onPickAutosaveDir() {
      const dir = await window.tokiAPI.pickAutosaveDir();
      if (dir) {
        autosaveDir = dir;
        writeAutosaveDir(dir);
      }
      return dir;
    },
    onResetAutosaveDir() {
      autosaveDir = '';
      writeAutosaveDir('');
    },
    async onOpenAutosaveDir() {
      if (autosaveDir) {
        window.tokiAPI.openFolder(autosaveDir);
      } else {
        const info = await window.tokiAPI.getAutosaveInfo();
        if (info) window.tokiAPI.openFolder(info.dir);
        else setStatus('파일을 먼저 열어주세요');
      }
    },
    onDarkModeToggle() {
      toggleDarkMode();
    },
    onBgmToggle(enabled) {
      setBgmEnabled(enabled);
      writeBgmEnabled(isBgmEnabled());
      const bgmBtn = document.getElementById('btn-bgm');
      if (bgmBtn) updateBgmButtonStyle(bgmBtn);
      if (!isBgmEnabled()) pauseBgm();
    },
    onRpModeChange(mode: string) {
      rpMode = mode as RpMode;
      writeRpMode(rpMode);
      const btn = document.getElementById('btn-rp-mode');
      if (btn) updateRpButtonStyle(btn, rpMode);
    },
    onRpCustomTextChange(text) {
      rpCustomText = text;
      writeRpCustomText(rpCustomText);
    },
    async onOpenPersonaTab(name) {
      const tabId = `persona_${name}`;
      const existing = tabMgr.openTabs.find((t) => t.id === tabId);
      if (existing) {
        tabMgr.activeTabId = tabId;
        createOrSwitchEditor(existing);
        tabMgr.renderTabs();
      } else {
        const content = await window.tokiAPI.readPersona(name);
        openExternalTextTab(tabId, `[페르소나] ${name}.txt`, content || '', (val) =>
          window.tokiAPI.writePersona(name, val).then(() => {
            setStatus(`페르소나 저장: ${name}.txt`);
          }),
        );
      }
    },
  });
}

// ==================== Preview Test Panel ====================

async function showPreviewPanel(): Promise<void> {
  if (!fileData) {
    setStatus('파일을 먼저 열어주세요');
    return;
  }

  // Remove existing
  const existing = document.querySelector('.preview-overlay');
  if (existing) existing.remove();

  // Load all assets (name → data URI)
  let assetMapForEngine: Record<string, string> = {};
  try {
    const assetResult = await window.tokiAPI.getAllAssetsMap();
    assetMapForEngine = assetResult.assets || assetResult;
  } catch (error) {
    reportRuntimeError({
      context: '프리뷰 에셋 불러오기 실패',
      error,
      logPrefix: '[Preview]',
      setStatus,
    });
  }

  await ensureWasmoon();

  renderPreviewPanel(document.body, {
    fileData,
    assetMap: assetMapForEngine,
    engine: PreviewEngine,
    setStatus,
    popoutPreview: async (charData) => {
      const requestId = await window.tokiAPI.setPreviewPopoutData(charData as unknown as Record<string, unknown>);
      await window.tokiAPI.popoutPanel('preview', requestId);
    },
  });
}

// ==================== Panel Drag & Drop ====================
// Core logic lives in ../lib/panel-drag.ts; thin wrapper below closes
// over controller-level state via a lazily-built deps object.

function initPanelDragDrop(): void {
  _initPanelDragDrop({
    moveItems,
    moveTerminal,
    toggleSidebar,
    toggleTerminal,
    isPanelPoppedOut,
    popOutPanel,
    dockPanel,
    showContextMenu,
  });
}

// ==================== Pop-out Mode (External Window) ====================
// Core logic lives in ../lib/popout-window.ts; thin wrappers below close
// over controller-level state via a lazily-built deps object.

function getPopoutDeps() {
  return {
    layoutState,
    rebuildLayout,
    setStatus,
    getEditorInstance: () => editorInstance,
    setEditorInstance: (ed: MonacoEditorInstance | null) => {
      editorInstance = ed;
    },
    createOrSwitchEditor,
    tabMgr,
    fitTerminal: () => {
      if (fitAddon && term) fitAddon.fit();
    },
  };
}

function popOutPanel(panelId: string, requestId: string | null = null): Promise<void> {
  return _popOutPanel(panelId, getPopoutDeps() as unknown as PopoutDeps, requestId);
}

function popOutEditorPanel(tabId: string): Promise<void> {
  return _popOutEditorPanel(tabId, getPopoutDeps() as unknown as PopoutDeps);
}

function dockPanel(panelId: string): void {
  _dockPanel(panelId, getPopoutDeps() as unknown as PopoutDeps);
}

// Tab open by ID (used for sidebar popout clicks)
function openTabById(tabId: string): void {
  if (!fileData) return;
  const data = fileData;

  const tabMap: Record<
    string,
    { label: string; lang: string; get: () => unknown; set: ((v: unknown) => void) | null }
  > = {
    lua: {
      label: 'Lua (통합)',
      lang: 'lua',
      get: () => data.lua,
      set: (v: unknown) => {
        data.lua = v as string;
        data.triggerScripts = mergeLuaIntoTriggerScriptsText(data.triggerScripts, v as string);
        luaSections = parseLuaSections(v as string);
      },
    },
    globalNote: {
      label: '글로벌노트',
      lang: 'plaintext',
      get: () => data.globalNote,
      set: (v: unknown) => {
        data.globalNote = v as string;
      },
    },
    firstMessage: {
      label: '첫 메시지',
      lang: 'html',
      get: () => data.firstMessage,
      set: (v: unknown) => {
        data.firstMessage = v as string;
      },
    },
    triggerScripts: {
      label: '트리거 스크립트',
      lang: 'json',
      get: () => data.triggerScripts || '[]',
      set: (v: unknown) => {
        data.triggerScripts = v as string;
        const nextLua = tryExtractPrimaryLuaFromTriggerScriptsText(v as string);
        if (nextLua !== null) data.lua = nextLua;
      },
    },
    alternateGreetings: {
      label: '추가 첫 메시지',
      lang: 'json',
      get: () => stringifyStringArray(data.alternateGreetings),
      set: null,
    },
    groupOnlyGreetings: {
      label: '그룹 첫 메시지',
      lang: 'json',
      get: () => stringifyStringArray(data.groupOnlyGreetings),
      set: null,
    },
    css: {
      label: 'CSS (통합)',
      lang: 'css',
      get: () => data.css,
      set: (v: unknown) => {
        data.css = v as string;
        ({ sections: cssSections, prefix: _cssStylePrefix, suffix: _cssStyleSuffix } = parseCssSections(v as string));
      },
    },
    defaultVariables: {
      label: '기본변수',
      lang: 'plaintext',
      get: () => data.defaultVariables,
      set: (v: unknown) => {
        data.defaultVariables = v as string;
      },
    },
    description: {
      label: '설명',
      lang: 'plaintext',
      get: () => data.description,
      set: (v: unknown) => {
        data.description = v as string;
      },
    },
  };

  if (tabMap[tabId]) {
    const t = tabMap[tabId];
    if (tabId === 'lua') data.lua = combineLuaSections(luaSections);
    tabMgr.openTab(tabId, t.label, t.lang, t.get, t.set);
    return;
  }

  if (tabId.startsWith('lore_')) {
    const idx = parseInt(tabId.replace('lore_', ''), 10);
    if (data.lorebook[idx]) {
      const label = data.lorebook[idx].comment || `entry_${idx}`;
      tabMgr.openTab(
        tabId,
        label,
        'plaintext',
        () => data.lorebook[idx].content || '',
        (v: unknown) => {
          data.lorebook[idx].content = v as string;
        },
      );
    }
  } else if (tabId.startsWith('regex_')) {
    const idx = parseInt(tabId.replace('regex_', ''), 10);
    if (data.regex[idx]) {
      const label = data.regex[idx].comment || `regex_${idx}`;
      tabMgr.openTab(
        tabId,
        label,
        'json',
        () => JSON.stringify(data.regex[idx], null, 2),
        (v: unknown) => {
          try {
            data.regex[idx] = JSON.parse(v as string);
          } catch (e) {
            console.warn('[controller] Invalid JSON in regex editor:', (e as Error).message);
          }
        },
      );
    }
  } else if (tabId.startsWith('guide_')) {
    // Guide file from refs popout
    const fileName = tabId.replace('guide_', '');
    const existing = tabMgr.openTabs.find((t) => t.id === tabId);
    if (existing) {
      tabMgr.activeTabId = tabId;
      createOrSwitchEditor(existing);
      tabMgr.renderTabs();
      return;
    }
    window.tokiAPI.readGuide(fileName).then((content) => {
      if (content == null) {
        setStatus('가이드 파일 읽기 실패');
        return;
      }
      openExternalTextTab(tabId, `[가이드] ${fileName}`, content, (val: string) => {
        window.tokiAPI.writeGuide(fileName, val);
      });
    });
  } else if (tabId.startsWith('ref_')) {
    // Reference file item from refs popout
    openRefTabById(tabId);
  }
}

// ==================== Keyboard Shortcuts ====================
// Keyboard shortcuts are in ./keyboard-shortcuts.ts

// ==================== Init ====================
export async function initMainRenderer(): Promise<void> {
  subscribeToAppSettings((snapshot) => {
    const darkModeChanged = snapshot.darkMode !== darkMode;
    darkMode = snapshot.darkMode;
    rpMode = snapshot.rpMode;
    rpCustomText = snapshot.rpCustomText;
    setBgmEnabled(snapshot.bgmEnabled);
    autosaveEnabled = snapshot.autosaveEnabled;
    autosaveInterval = snapshot.autosaveInterval;
    autosaveDir = snapshot.autosaveDir;
    if (darkModeChanged) {
      refreshDarkModeUi();
    }
    // Sync to Pinia store for reactive UI
    syncStoreState();
  });

  // Wire preview engine errors to status bar
  PreviewEngine.setErrorHandler((context, message) => {
    setStatus(`⚠️ ${context}: ${message}`);
  });
  registerActions({
    // File
    new: () => handleNew(),
    open: () => handleOpen(),
    save: () => handleSave(),
    'save-as': () => handleSaveAs(),
    'close-tab': () => {
      if (tabMgr.activeTabId) tabMgr.closeTab(tabMgr.activeTabId);
    },

    // Edit (Monaco editor commands)
    undo: () => {
      if (editorInstance) editorInstance.trigger('menu', 'undo');
    },
    redo: () => {
      if (editorInstance) editorInstance.trigger('menu', 'redo');
    },
    cut: () => document.execCommand('cut'),
    copy: () => document.execCommand('copy'),
    paste: () => document.execCommand('paste'),
    'select-all': () => {
      if (editorInstance) editorInstance.trigger('menu', 'editor.action.selectAll');
    },
    find: () => {
      if (editorInstance) editorInstance.trigger('menu', 'actions.find');
    },
    replace: () => {
      if (editorInstance) editorInstance.trigger('menu', 'editor.action.startFindReplaceAction');
    },

    // View — toggles
    'toggle-sidebar': () => toggleSidebar(),
    'toggle-terminal': () => toggleTerminal(),
    'toggle-avatar': () => toggleAvatar(),
    // Items position
    'items-left': () => moveItems('left'),
    'items-right': () => moveItems('right'),
    'items-far-left': () => moveItems('far-left'),
    'items-far-right': () => moveItems('far-right'),
    'items-top': () => moveItems('top'),
    'items-bottom': () => moveItems('bottom'),
    // Refs position
    'refs-sidebar': () => moveRefs('sidebar'),
    'refs-left': () => moveRefs('left'),
    'refs-right': () => moveRefs('right'),
    'refs-far-left': () => moveRefs('far-left'),
    'refs-far-right': () => moveRefs('far-right'),
    'refs-top': () => moveRefs('top'),
    'refs-bottom': () => moveRefs('bottom'),
    // Terminal position
    'terminal-bottom': () => moveTerminal('bottom'),
    'terminal-left': () => moveTerminal('left'),
    'terminal-right': () => moveTerminal('right'),
    'terminal-far-left': () => moveTerminal('far-left'),
    'terminal-far-right': () => moveTerminal('far-right'),
    'terminal-top': () => moveTerminal('top'),
    // Reset
    'layout-reset': () => resetLayout(),
    'zoom-in': () => {
      if (editorInstance) {
        const sz = editorInstance.getOption(monaco.editor.EditorOption.fontSize) as number;
        editorInstance.updateOptions({ fontSize: sz + 1 });
      }
    },
    'zoom-out': () => {
      if (editorInstance) {
        const sz = editorInstance.getOption(monaco.editor.EditorOption.fontSize) as number;
        editorInstance.updateOptions({ fontSize: Math.max(8, sz - 1) });
      }
    },
    'zoom-reset': () => {
      if (editorInstance) editorInstance.updateOptions({ fontSize: 14 });
    },
    'toggle-dark': () => toggleDarkMode(),
    'preview-test': () => showPreviewPanel(),
    devtools: () => window.tokiAPI.toggleDevTools(),

    // Terminal
    'claude-start': () => handleClaudeStart(),
    'copilot-start': () => handleCopilotStart(),
    'codex-start': () => handleCodexStart(),
    'terminal-clear': () => {
      if (term) term.clear();
    },
    'terminal-restart': () => restartTerminal(),

    // Settings & buttons (now handled by Vue template @click)
    settings: () => showSettingsPopup(),
    'rp-toggle': () => {
      if (rpMode === 'off') {
        rpMode = getDefaultRpModeForDarkMode(darkMode);
      } else {
        rpMode = 'off';
      }
      writeRpMode(rpMode);
      syncStoreState();
      setStatus(rpMode === 'off' ? 'RP 모드 OFF' : `RP 모드 ON (${getRpLabel(rpMode)}) — 다음 AI CLI 시작 시 적용`);
    },
    'bgm-toggle': () => {
      setBgmEnabled(!isBgmEnabled());
      writeBgmEnabled(isBgmEnabled());
      if (!isBgmEnabled()) pauseBgm();
      syncStoreState();
      setStatus(isBgmEnabled() ? 'BGM ON' : 'BGM OFF');
    },
    'bgm-pick': async () => {
      const filePath = await window.tokiAPI.pickBgm();
      if (!filePath) return;
      setBgmFilePath(filePath);
      writeBgmPath(filePath);
      setStatus(`BGM 변경: ${filePath.split(/[/\\]/).pop()}`);
    },
    'terminal-bg': () => handleTerminalBg(),
    'sidebar-expand': () => moveItems(layoutState.itemsPos),
    help: () => showHelpPopup(),
  });
  // Initialize BGM module (state + UI)
  initBgmUi(settingsSnapshot.bgmEnabled, settingsSnapshot.bgmPath);
  syncStoreState();
  initResizers();
  initKeyboard({
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    closeActiveTab: () => {
      if (tabMgr.activeTabId) tabMgr.closeTab(tabMgr.activeTabId);
    },
    toggleSidebar,
    toggleTerminal,
    showPreviewPanel,
  });
  initDragDrop(document.getElementById('sidebar')!, {
    get fileData() {
      return fileData;
    },
    get referenceFiles() {
      return referenceFiles;
    },
    syncReferenceFiles,
    addAssetBuffer: (name, data) => window.tokiAPI.addAssetBuffer(name, data),
    buildSidebar,
    setStatus,
    openReferencePath: (path) => window.tokiAPI.openReferencePath(path),
  });
  initEditor();
  initSidebarSplitResizer();
  initTokiAvatarUi(document.getElementById('toki-avatar-display')!, { darkMode, setStatus });
  refreshDarkModeUi(); // Apply saved dark mode preference
  initChatModeUi(document.getElementById('terminal-area')!, {
    chatSession,
    fitTerminal: () => {
      if (fitAddon && term) setTimeout(() => fitAddon.fit(), 20);
    },
    isTerminalReady: () => !!term,
    terminalInput: (text) => window.tokiAPI.terminalInput(text),
  });
  initPanelDragDrop();
  // Refs panel dock button
  const refsPanelDockBtn = document.getElementById('btn-refs-panel-dock');
  if (refsPanelDockBtn) refsPanelDockBtn.addEventListener('click', () => moveRefs('sidebar'));
  // Refs panel popout button (in separated refs-panel header)
  const refsPanelPopoutBtn = document.getElementById('btn-refs-panel-popout');
  if (refsPanelPopoutBtn) {
    refsPanelPopoutBtn.addEventListener('click', () => {
      if (isPanelPoppedOut('refs')) dockPanel('refs');
      else popOutPanel('refs');
    });
  }
  // Apply saved layout (restore positions)
  rebuildLayout();
  if (autosaveEnabled) startAutosave(getAutosaveDeps());
  await buildRefsSidebar(); // Load guides & refs even without a file open
  const referenceManifestStatus = await window.tokiAPI.getReferenceManifestStatus();
  if (referenceManifestStatus) {
    const prefix = referenceManifestStatus.level === 'error' ? '참고자료 오류' : '참고자료 경고';
    const detail = referenceManifestStatus.detail ? ` — ${referenceManifestStatus.detail}` : '';
    setStatus(`${prefix}: ${referenceManifestStatus.message}${detail}`);
  }
  await ensureWasmoon();

  // Listen for popout window events
  window.tokiAPI.onPopoutClosed((panelType) => {
    removePoppedOut(panelType);
    // Show the panel back in main window
    if (panelType === 'sidebar') {
      layoutState.itemsVisible = true;
    } else if (panelType === 'terminal') {
      layoutState.terminalVisible = true;
    } else if (panelType === 'editor') {
      // Re-open editor in main window
      if (tabMgr.activeTabId) {
        const curTab = tabMgr.openTabs.find((t) => t.id === tabMgr.activeTabId);
        if (curTab) createOrSwitchEditor(curTab);
      }
      tabMgr.renderTabs();
    } else if (panelType === 'preview') {
      // Re-open inline preview when popout docks
      showPreviewPanel();
    } else if (panelType === 'refs') {
      layoutState.refsPos = layoutState._refsPosBefore || 'sidebar';
      delete layoutState._refsPosBefore;
    }
    rebuildLayout();
    if (panelType === 'terminal' && fitAddon && term) {
      setTimeout(() => fitAddon.fit(), 50);
    }
    updatePopoutButtons();
    const panelName =
      panelType === 'sidebar'
        ? '항목'
        : panelType === 'editor'
          ? '에디터'
          : panelType === 'preview'
            ? '프리뷰'
            : panelType === 'refs'
              ? '참고자료'
              : 'TokiTalk';
    setStatus(`${panelName} 도킹됨`);
  });

  // Listen for editor popout content changes
  window.tokiAPI.onEditorPopoutChange((tabId, content) => {
    const tab = tabMgr.openTabs.find((t) => t.id === tabId);
    if (tab && tab.setValue) {
      tab.setValue(content);
      tab._lastValue = content;
      tabMgr.dirtyFields.add(tabId);
      tabMgr.renderTabs();
    }
  });

  // Listen for editor popout save request
  window.tokiAPI.onEditorPopoutSave(() => {
    handleSave();
  });

  // Listen for sidebar popout clicks → open tab in main editor
  window.tokiAPI.onPopoutSidebarClick((itemId) => {
    openTabById(itemId);
  });

  // Listen for refs popout clicks → open tab in main editor
  window.tokiAPI.onPopoutRefsClick((tabId) => {
    openTabById(tabId);
  });

  // Listen for MCP data updates (AI assistant modified data via MCP server)
  window.tokiAPI.onDataUpdated((field, value) => {
    if (!fileData) return;
    // (debug log removed)

    const updatePlan = planMcpDataUpdate(field, tabMgr.openTabs);
    for (const tabId of updatePlan.backupTabIds) {
      const tab = tabMgr.openTabs.find((entry) => entry.id === tabId);
      if (tab?.getValue) {
        createBackup(tab.id, tab.getValue());
      }
    }

    if (field === 'lorebook') {
      fileData.lorebook = value as LorebookEntry[];
      if (updatePlan.refreshSidebar) buildSidebar();
      if (updatePlan.refreshIndexedPrefixes.includes('lore_')) {
        tabMgr.refreshIndexedTabs('lore_', buildLorebookTabState);
      }
      const activeTab = tabMgr.activeTabId ? tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId) : null;
      if (activeTab && activeTab.id.startsWith('lore_') && editorInstance && !FORM_TAB_TYPES.has(activeTab.language)) {
        const pos = editorInstance.getPosition();
        editorInstance.setValue((activeTab.getValue() as string) || '');
        if (pos) editorInstance.setPosition(pos);
      }
    } else if (field === 'regex') {
      fileData.regex = value as RegexEntry[];
      if (updatePlan.refreshSidebar) buildSidebar();
      if (updatePlan.refreshIndexedPrefixes.includes('regex_')) {
        tabMgr.refreshIndexedTabs('regex_', buildRegexTabState);
      }
      const activeTab = tabMgr.activeTabId ? tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId) : null;
      if (activeTab && activeTab.id.startsWith('regex_') && editorInstance && !FORM_TAB_TYPES.has(activeTab.language)) {
        const pos = editorInstance.getPosition();
        editorInstance.setValue((activeTab.getValue() as string) || '');
        if (pos) editorInstance.setPosition(pos);
      }
    } else {
      fileData[field] = value;
      if (field === 'triggerScripts') {
        const nextLua = tryExtractPrimaryLuaFromTriggerScriptsText(value as string);
        if (nextLua !== null) fileData.lua = nextLua;
      }
      if (field === 'lua') {
        fileData.triggerScripts = mergeLuaIntoTriggerScriptsText(fileData.triggerScripts, value as string);
      }
      if (field === 'lua') {
        luaSections = parseLuaSections(value as string);
      }
      if (field === 'css') {
        ({
          sections: cssSections,
          prefix: _cssStylePrefix,
          suffix: _cssStyleSuffix,
        } = parseCssSections(value as string));
      }
      if (updatePlan.refreshSidebar) {
        buildSidebar();
      }
      for (const prefix of updatePlan.refreshIndexedPrefixes) {
        if (prefix === 'lua_s') {
          tabMgr.refreshIndexedTabs(prefix, buildLuaSectionTabState);
        } else if (prefix === 'css_s') {
          tabMgr.refreshIndexedTabs(prefix, buildCssSectionTabState);
        }
      }
      if (field === tabMgr.activeTabId && editorInstance) {
        const activeTab = tabMgr.openTabs.find((tab) => tab.id === field);
        const pos = editorInstance.getPosition();
        editorInstance.setValue(activeTab?.getValue ? (activeTab.getValue() as string) || '' : (value as string) || '');
        if (pos) editorInstance.setPosition(pos);
      }
      if (field === 'lua' && tabMgr.activeTabId?.startsWith('lua_s') && editorInstance) {
        const activeTab = tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId);
        if (activeTab) {
          const pos = editorInstance.getPosition();
          editorInstance.setValue((activeTab.getValue() as string) || '');
          if (pos) editorInstance.setPosition(pos);
        }
      }
      if (field === 'css' && tabMgr.activeTabId?.startsWith('css_s') && editorInstance) {
        const activeTab = tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId);
        if (activeTab) {
          const pos = editorInstance.getPosition();
          editorInstance.setValue((activeTab.getValue() as string) || '');
          if (pos) editorInstance.setPosition(pos);
        }
      }
      if (updatePlan.updateFileLabel) {
        useAppStore().setFileLabel((value as string) || 'Untitled');
      }
    }
    setStatus(updatePlan.statusMessage);
    tabMgr.markFieldDirty(field);
  });

  // Load Monaco (async)
  await ensureMonacoEditorReady();

  // Load Terminal (async, non-blocking)
  try {
    await initTerminal();
  } catch (err) {
    console.error('[init] Terminal load failed:', err);
    document.getElementById('terminal-container')!.innerHTML =
      '<div style="color:#f44;padding:8px;font-size:12px;">터미널 로딩 실패: ' + (err as Error).message + '</div>';
  }
}
