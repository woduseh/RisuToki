import { parseLuaSections, combineLuaSections, parseCssSections, combineCssSections, detectLuaSection, detectCssSectionInline, detectCssBlockOpen, detectCssBlockClose } from '../lib/section-parser';
import { createTreeItem, createFolderItem, updateSidebarActive as _updateSidebarActive } from '../lib/sidebar-builder';
import PreviewEngine from '../lib/preview-engine';
import {
  buildAssistantLaunchCommand,
  buildWindowsAssistantBootstrapCommand,
  detectRuntimePlatform
} from '../lib/assistant-launch';
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
  writeDarkMode,
  writeLayoutState,
  writeRpCustomText,
  writeRpMode
} from '../lib/app-settings';
import {
  initTokiAvatar as initTokiAvatarUi,
  setTokiActive,
  refreshAvatarForDarkMode
} from '../lib/avatar-ui';
import { applyDarkMode, defineDarkMonacoTheme } from '../lib/dark-mode';
import { showImageViewer as renderImageViewer } from '../lib/image-viewer';
import { initMenuBar, closeAllMenus } from '../lib/menu-bar';
import {
  handleTerminalDataForBgm,
  initBgm as initBgmModule,
  isBgmEnabled,
  pauseBgm,
  setBgmEnabled,
  setBgmFilePath
} from '../lib/bgm';
import { ensureBlueArchiveMonacoTheme, loadMonacoRuntime } from '../lib/monaco-loader';
import { createBufferedTerminalChatSession } from '../lib/chat-session';
import {
  NON_MONACO_EDITOR_TAB_TYPES,
  requiresMonacoEditor,
  resolvePendingEditorTab
} from '../lib/editor-activation';
import { createExternalTextTabState } from '../lib/external-text-tab';
import { collectDirtyEditorFields } from '../lib/editor-dirty-fields';
import { TabManager } from '../lib/tab-manager';
import {
  applyStoredLayoutState,
  createDefaultLayoutState,
  createLayoutManager,
  V_SLOTS
} from '../lib/layout-manager';
import { planMcpDataUpdate } from '../lib/mcp-data-update';
import { applyDockedLayoutState, applyPopoutLayoutState } from '../lib/popout-state';
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
import { showConfirm, resetConfirmAllowAll, showCloseConfirm, showPrompt } from '../lib/dialog';
import { showContextMenu, hideContextMenu } from '../lib/context-menu';
import {
  initializeTerminalUi,
  shouldTreatTerminalDataAsActivity,
  TERM_THEME_DARK,
  TERM_THEME_LIGHT
} from '../lib/terminal-ui';
import {
  AI_AGENT_LABELS,
  applySelectedChoice,
  cleanTuiOutput,
  extractChatChoices,
  filterDisplayChatMessages,
  isAssistantWelcomeBanner,
  isSpinnerNoise,
  stripAnsi
} from '../lib/terminal-chat';
import { buildAssetPromptTemplate } from '../lib/asset-prompt-template';
import { createBackup, formatBackupTime, getBackups, showBackupMenu } from '../lib/backup-store';
import { setStatus } from '../lib/status-bar';
import { showHelpPopup } from '../lib/help-popup';
import { showSettingsPopup as renderSettingsPopup } from '../lib/settings-popup';
import { createSidebarActions } from '../lib/sidebar-actions';
import {
  handleNew as _handleNew,
  handleOpen as _handleOpen,
  handleSave as _handleSave,
  handleSaveAs as _handleSaveAs,
} from '../lib/file-actions';
import {
  isSameReferencePath,
  stringifyStringArray,
  addReferenceFile as _addReferenceFile,
  buildRefsSidebar as _buildRefsSidebar,
  openRefTabById as _openRefTabById,
} from '../lib/sidebar-refs';

const settingsSnapshot = readAppSettingsSnapshot();

// ==================== State ====================
let fileData = null;       // Current charx data
let editorInstance = null;  // Monaco editor instance
let monacoReady = false;
let monacoLoadTask = null;

// Lua section management
let luaSections = []; // [{ name, content }]

// Reference files (read-only)
let referenceFiles = []; // [{ fileName, data }]

async function syncReferenceFiles() {
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
let autosaveTimer = null;


// Chat mode state
let chatMode = false;
const chatSession = createBufferedTerminalChatSession({
  applySelectedChoice,
  cleanTuiOutput,
  filterDisplayChatMessages,
  isAssistantWelcomeBanner,
  isSpinnerNoise,
  onUpdate: () => {
    if (chatMode) renderChatMessages();
  },
  stripAnsi
});

// Form tab types that use special editors (not Monaco)
const FORM_TAB_TYPES = NON_MONACO_EDITOR_TAB_TYPES;

const tabMgr = new TabManager('editor-tabs', {
  onActivateTab: (tab) => createOrSwitchEditor(tab),
  onDisposeFormEditors: () => disposeFormEditors(),
  onClearEditor: () => {
    document.getElementById('editor-container').innerHTML =
      '<div class="empty-state">항목을 선택하세요</div>';
    editorInstance = null;
  },
  isPanelPoppedOut: (panelId) => isPanelPoppedOut(panelId),
  onPopOutTab: (tabId) => popOutEditorPanel(tabId),
  isFormTabType: (language) => FORM_TAB_TYPES.has(language)
});

initFormEditor({
  isMonacoReady: () => monacoReady,
  isDarkMode: () => darkMode,
  getEditorInstance: () => editorInstance,
  setEditorInstance: (ed) => { editorInstance = ed; },
  getFileData: () => fileData,
  tabMgr,
  createBackup,
  showPrompt,
  buildSidebar,
});

const layoutState = createDefaultLayoutState();
try {
  applyStoredLayoutState(layoutState, readStoredLayoutState());
} catch (error) {
  reportRuntimeError({
    context: '레이아웃 상태 복원 실패',
    error,
    logPrefix: '[Layout]',
    setStatus
  });
}

function saveLayout() {
  try {
    writeLayoutState(layoutState);
  } catch (error) {
    reportRuntimeError({
      context: '레이아웃 상태 저장 실패',
      error,
      logPrefix: '[Layout]',
      setStatus
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
  state: layoutState
});

// ==================== MCP Confirm Handler ====================
// Listen for MCP confirm requests from main process → show MomoTalk popup
window.tokiAPI.onMcpConfirmRequest(async (id, title, message) => {
  const result = await showConfirm(`[${title}]\n${message}`);
  window.tokiAPI.sendMcpConfirmResponse(id, result);
});

window.tokiAPI.onMcpStatus((event) => {
  const prefix = event.rejected ? 'MCP 요청 거부' : (event.level === 'error' ? 'MCP 오류' : 'MCP 경고');
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

function loadMonaco() {
  return loadMonacoRuntime().then(() => {
    monacoReady = true;
  });
}

// ==================== Editor ====================
function initEditor() {
  const container = document.getElementById('editor-container');
  container.innerHTML = '<div class="empty-state">파일을 열어주세요 (Ctrl+O)</div>';
}

function renderEditorEmptyState(message) {
  const container = document.getElementById('editor-container');
  if (container) {
    container.innerHTML = `<div class="empty-state">${message}</div>`;
  }
}

function ensureMonacoEditorReady() {
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

function queueEditorActivation(tabInfo) {
  tabMgr.pendingEditorTabId = tabInfo.id;
  tabMgr.activeTabId = tabInfo.id;
  renderEditorEmptyState('에디터 로딩 중...');
  tabMgr.renderTabs();
  updateSidebarActive();
  void ensureMonacoEditorReady();
}

function flushPendingEditorActivation() {
  const pendingTab = resolvePendingEditorTab(tabMgr.openTabs, tabMgr.pendingEditorTabId, tabMgr.activeTabId);
  tabMgr.pendingEditorTabId = null;
  if (pendingTab) {
    createOrSwitchEditor(pendingTab);
  }
}

function createOrSwitchEditor(tabInfo) {
  const container = document.getElementById('editor-container');

  // Special tab types: image, lorebook form, regex form

  if (tabInfo.language === '_image') {
    disposeFormEditors();
    tabMgr.activeTabId = tabInfo.id;
    showImageViewer(tabInfo.id, tabInfo._assetPath);
    tabMgr.renderTabs();
    updateSidebarActive();
    return;
  }

  if (tabInfo.language === '_loreform') {
    tabMgr.activeTabId = tabInfo.id;
    showLoreEditor(tabInfo);
    tabMgr.renderTabs();
    updateSidebarActive();
    return;
  }

  if (tabInfo.language === '_regexform') {
    tabMgr.activeTabId = tabInfo.id;
    showRegexEditor(tabInfo);
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
    const curTab = tabMgr.openTabs.find(t => t.id === tabMgr.activeTabId);
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
  if (editorInstance) { editorInstance.dispose(); }

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
    readOnly: isReadOnly
  });

  editorInstance.onDidChangeModelContent(() => {
    const curTab = tabMgr.openTabs.find(t => t.id === tabMgr.activeTabId);
    if (curTab && curTab.setValue) {
      // Auto-backup on first change (save original before modification)
      if (!tabMgr.dirtyFields.has(curTab.id)) {
        createBackup(curTab.id, curTab.getValue());
      }
      curTab.setValue(editorInstance.getValue());
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

function openExternalTextTab(id, label, initialValue, persist, language = 'plaintext') {
  const state = createExternalTextTabState(initialValue, persist);
  return tabMgr.openTab(id, label, language, () => state.getValue(), (value) => {
    void state.setValue(value);
  });
}

function buildLorebookTabState(index, tab) {
  const entry = fileData?.lorebook?.[index];
  if (!entry) return null;

  const label = entry.comment || `entry_${index}`;
  if (tab.language === '_loreform') {
    return {
      id: `lore_${index}`,
      label,
      language: '_loreform',
      getValue: () => fileData.lorebook[index],
      setValue: (value) => { Object.assign(fileData.lorebook[index], value); }
    };
  }

  return {
    id: `lore_${index}`,
    label,
    language: tab.language || 'plaintext',
    getValue: () => fileData.lorebook[index].content || '',
    setValue: (value) => { fileData.lorebook[index].content = value; }
  };
}

function buildRegexTabState(index, tab) {
  const entry = fileData?.regex?.[index];
  if (!entry) return null;

  const label = entry.comment || `regex_${index}`;
  if (tab.language === '_regexform') {
    return {
      id: `regex_${index}`,
      label,
      language: '_regexform',
      getValue: () => fileData.regex[index],
      setValue: (value) => { Object.assign(fileData.regex[index], value); }
    };
  }

  return {
    id: `regex_${index}`,
    label,
    language: tab.language || 'json',
    getValue: () => JSON.stringify(fileData.regex[index], null, 2),
    setValue: (value) => {
      try {
        fileData.regex[index] = JSON.parse(value);
      } catch (error) {
        reportRuntimeError({
          context: '정규식 JSON 파싱 실패',
          error,
          logPrefix: '[Editor]',
          setStatus
        });
      }
    }
  };
}

function buildLuaSectionTabState(index, tab) {
  const section = luaSections[index];
  if (!section) return null;

  return {
    id: `lua_s${index}`,
    label: section.name,
    language: tab.language || 'lua',
    getValue: () => luaSections[index].content,
    setValue: (value) => {
      luaSections[index].content = value;
      fileData.lua = combineLuaSections(luaSections);
    }
  };
}

function buildCssSectionTabState(index, tab) {
  const section = cssSections[index];
  if (!section) return null;

  return {
    id: `css_s${index}`,
    label: section.name,
    language: tab.language || 'css',
    getValue: () => cssSections[index].content,
    setValue: (value) => {
      cssSections[index].content = value;
      fileData.css = combineCssSections(cssSections, _cssStylePrefix, _cssStyleSuffix);
    }
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
    openTab: (id, label, lang, getValue, setValue) => tabMgr.openTab(id, label, lang, getValue, setValue),
    findOpenTab: (id) => tabMgr.openTabs.find(t => t.id === id),
    activateTab: (id) => {
      const tab = tabMgr.openTabs.find(t => t.id === id);
      if (tab) {
        tabMgr.activeTabId = id;
        createOrSwitchEditor(tab);
        tabMgr.renderTabs();
      }
    },
    closeTab: (id) => tabMgr.closeTab(id),
    openExternalTextTab,
    openReference: () => window.tokiAPI.openReference(),
    removeReference: (p) => window.tokiAPI.removeReference(p),
    removeAllReferences: () => window.tokiAPI.removeAllReferences(),
    listGuides: () => window.tokiAPI.listGuides(),
    readGuide: (n) => window.tokiAPI.readGuide(n),
    writeGuide: (n, c) => window.tokiAPI.writeGuide(n, c),
    deleteGuide: (n) => window.tokiAPI.deleteGuide(n),
    importGuide: () => window.tokiAPI.importGuide(),
    getGuidesPath: () => window.tokiAPI.getGuidesPath(),
  };
}

function buildRefsSidebar() {
  const refsEl = document.getElementById('sidebar-refs');
  if (!refsEl) return;
  return _buildRefsSidebar(refsEl, getRefsSidebarDeps());
}

function addReferenceFile() {
  const refsEl = document.getElementById('sidebar-refs');
  if (!refsEl) return;
  return _addReferenceFile(refsEl, getRefsSidebarDeps());
}

function openRefTabById(tabId) {
  _openRefTabById(tabId, getRefsSidebarDeps());
}

function buildSidebar() {
  const tree = document.getElementById('sidebar-tree');
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
    e.preventDefault(); e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, [
      { label: '새 하위항목 추가', action: () => addLuaSection() },
    ]);
  });

  // Combined Lua view
  const luaCombinedEl = createTreeItem('통합 보기', '📋', 1);
  luaCombinedEl.dataset.label = 'Lua';
  luaCombinedEl.addEventListener('click', () => {
    fileData.lua = combineLuaSections(luaSections);
    tabMgr.openTab('lua', 'Lua (통합)', 'lua',
      () => fileData.lua,
      (v) => {
        fileData.lua = v;
        luaSections = parseLuaSections(v);
      }
    );
  });
  luaCombinedEl.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    const items = [
      { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText('read_field("lua")'); setStatus('복사됨: read_field("lua")'); } },
    ];
    const store = getBackups('lua');
    if (store.length > 0) {
      items.push('---');
      items.push({ label: '백업 불러오기', action: () => showBackupMenu('lua', e.clientX, e.clientY, backupMenuCallbacks) });
    }
    showContextMenu(e.clientX, e.clientY, items);
  });
  luaFolder.children.appendChild(luaCombinedEl);

  // Individual Lua sections
  for (let i = 0; i < luaSections.length; i++) {
    const section = luaSections[i];
    const sectionEl = createTreeItem(section.name, '·', 1);
    const idx = i;
    sectionEl.addEventListener('click', () => {
      tabMgr.openTab(`lua_s${idx}`, section.name, 'lua',
        () => luaSections[idx].content,
        (v) => {
          luaSections[idx].content = v;
          fileData.lua = combineLuaSections(luaSections);
        }
      );
    });
    sectionEl.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const items = [
        { label: '이름 변경', action: () => renameLuaSection(idx) },
        { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_lua(${idx})`); setStatus(`복사됨: read_lua(${idx})`); } },
      ];
      const store = getBackups(`lua_s${idx}`);
      if (store.length > 0) {
        items.push('---');
        items.push({ label: '백업 불러오기', action: () => showBackupMenu(`lua_s${idx}`, e.clientX, e.clientY, backupMenuCallbacks) });
      }
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
    e.preventDefault(); e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, [
      { label: '새 하위항목 추가', action: () => addCssSection() },
    ]);
  });

  // Combined CSS view
  const cssCombinedEl = createTreeItem('통합 보기', '📋', 1);
  cssCombinedEl.addEventListener('click', () => {
    tabMgr.openTab('css', 'CSS (통합)', 'css',
      () => fileData.css,
      (v) => {
        fileData.css = v;
        ({ sections: cssSections, prefix: _cssStylePrefix, suffix: _cssStyleSuffix } = parseCssSections(v));
      }
    );
  });
  cssCombinedEl.addEventListener('contextmenu', (e) => {
    const items = [
      { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText('read_field("css")'); setStatus('복사됨: read_field("css")'); } },
    ];
    const store = getBackups('css');
    if (store.length > 0) {
      items.push('---');
      items.push({ label: '백업 불러오기', action: () => showBackupMenu('css', e.clientX, e.clientY, backupMenuCallbacks) });
    }
    showContextMenu(e.clientX, e.clientY, items);
  });
  cssFolder.children.appendChild(cssCombinedEl);

  // Individual CSS sections
  for (let i = 0; i < cssSections.length; i++) {
    const section = cssSections[i];
    const sectionEl = createTreeItem(section.name, '·', 1);
    const idx = i;
    sectionEl.addEventListener('click', () => {
      tabMgr.openTab(`css_s${idx}`, section.name, 'css',
        () => cssSections[idx].content,
        (v) => {
          cssSections[idx].content = v;
          fileData.css = combineCssSections(cssSections, _cssStylePrefix, _cssStyleSuffix);
        }
      );
    });
    sectionEl.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const items = [
        { label: '이름 변경', action: () => renameCssSection(idx) },
        { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_css(${idx})`); setStatus(`복사됨: read_css(${idx})`); } },
      ];
      const store = getBackups(`css_s${idx}`);
      if (store.length > 0) {
        items.push('---');
        items.push({ label: '백업 불러오기', action: () => showBackupMenu(`css_s${idx}`, e.clientX, e.clientY, backupMenuCallbacks) });
      }
      items.push('---');
      items.push({ label: '삭제', action: () => deleteCssSection(idx) });
      showContextMenu(e.clientX, e.clientY, items);
    });
    cssFolder.children.appendChild(sectionEl);
  }
  } // end if (!isRisum) — CSS folder

  // ---- Single items ----
  const charxOnlyFields = ['globalNote', 'firstMessage', 'alternateGreetings', 'groupOnlyGreetings', 'defaultVariables'];
  const singles = [
    { id: 'globalNote', label: '글로벌노트', icon: '📝', lang: 'plaintext', field: 'globalNote' },
    { id: 'firstMessage', label: '첫 메시지', icon: '💬', lang: 'html', field: 'firstMessage' },
    {
      id: 'assetPromptTemplate',
      label: '에셋 프롬프트 템플릿',
      icon: '🖼️',
      lang: 'markdown',
      readonly: true,
      get: () => buildAssetPromptTemplate({
        name: fileData.name,
        description: fileData.description
      })
    },
    {
      id: 'triggerScripts',
      label: '트리거 스크립트',
      icon: '🪝',
      lang: 'json',
      field: 'triggerScripts',
      get: () => fileData.triggerScripts || '[]',
      set: (value) => {
        fileData.triggerScripts = value;
        const nextLua = tryExtractPrimaryLuaFromTriggerScriptsText(value);
        if (nextLua !== null) fileData.lua = nextLua;
      }
    },
    {
      id: 'alternateGreetings',
      label: '추가 첫 메시지',
      icon: '💭',
      lang: 'json',
      field: 'alternateGreetings',
      readonly: true,
      get: () => stringifyStringArray(fileData.alternateGreetings)
    },
    {
      id: 'groupOnlyGreetings',
      label: '그룹 첫 메시지',
      icon: '👥',
      lang: 'json',
      field: 'groupOnlyGreetings',
      readonly: true,
      get: () => stringifyStringArray(fileData.groupOnlyGreetings)
    },
    { id: 'defaultVariables', label: '기본변수', icon: '⚙', lang: 'plaintext', field: 'defaultVariables' },
    { id: 'description', label: '설명', icon: '📄', lang: 'plaintext', field: 'description' },
  ].filter(item => !isRisum || !charxOnlyFields.includes(item.id));

  for (const item of singles) {
    const el = createTreeItem(item.label, item.icon, 0);
    el.addEventListener('click', () => {
      tabMgr.openTab(item.id, item.label, item.lang,
        item.get || (() => fileData[item.field]),
        item.readonly ? null : (item.set || ((v) => { fileData[item.field] = v; }))
      );
    });
    // Single item right-click: MCP path / backup
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const items = [];
      if (item.field) {
        items.push({ label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_field("${item.field}")`); setStatus(`복사됨: read_field("${item.field}")`); } });
      }
      if (item.id === 'assetPromptTemplate') {
        items.push({ label: '템플릿 복사', action: () => { navigator.clipboard.writeText(item.get()); setStatus('에셋 프롬프트 템플릿 복사됨'); } });
      }
      const store = getBackups(item.id);
      if (store.length > 0) {
        items.push('---');
        items.push({ label: '백업 불러오기', action: () => showBackupMenu(item.id, e.clientX, e.clientY, backupMenuCallbacks) });
      }
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
    e.preventDefault(); e.stopPropagation();
    const items = [
      { label: '새 항목 추가', action: () => addNewLorebook() },
      { label: '새 폴더 추가', action: () => addNewLorebookFolder() },
      '---',
      { label: 'JSON 파일 가져오기', action: () => importLorebook() },
    ];
    if (fileData.lorebook.length > 0) {
      items.push('---');
      items.push({ label: `전체 삭제 (${fileData.lorebook.length}개)`, action: async () => {
        if (!await showConfirm(`로어북 전체 ${fileData.lorebook.length}개 항목을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
        // Close all lorebook tabs
        for (let i = fileData.lorebook.length - 1; i >= 0; i--) tabMgr.closeTab(`lore_${i}`);
        fileData.lorebook = [];
        tabMgr.markFieldDirty('lorebook');
        buildSidebar();
        setStatus('로어북 전체 삭제됨');
      }});
    }
    showContextMenu(e.clientX, e.clientY, items);
  });

  // Group lorebook by folder (robust multi-key matching)
  const folderDataList = []; // { entry, index, children }
  const folderLookup = {};   // multiple keys → same folderData
  const rootEntries = [];
  for (let i = 0; i < fileData.lorebook.length; i++) {
    const entry = fileData.lorebook[i];
    if (entry.mode === 'folder') {
      const fd = { entry, index: i, children: [] };
      folderDataList.push(fd);
      // Map by all possible IDs a child might reference
      const k = entry.key || '';
      const c = entry.comment || '';
      if (k) { folderLookup[`folder:${k}`] = fd; folderLookup[k] = fd; }
      if (c) { folderLookup[`folder:${c}`] = fd; folderLookup[c] = fd; }
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
      e.preventDefault(); e.stopPropagation();
      const fEntry = fileData.lorebook[folderIdx];
      const folderId = `folder:${fEntry.key || fEntry.comment || folderIdx}`;
      showContextMenu(e.clientX, e.clientY, [
        { label: '이름 변경', action: async () => {
          const newName = await showPrompt('폴더 이름', fEntry.comment || '');
          if (!newName) return;
          fEntry.comment = newName;
          tabMgr.markFieldDirty('lorebook');
          buildSidebar();
          setStatus(`폴더 이름 변경: ${newName}`);
        }},
        { label: '새 항목 추가', action: () => {
          const newEntry = {
            key: '', content: '', comment: `new_entry_${fileData.lorebook.length}`,
            mode: 'normal', insertorder: 100, alwaysActive: false, forceActivation: false,
            selective: false, secondkey: '', constant: false,
            order: fileData.lorebook.length, folder: folderId
          };
          fileData.lorebook.push(newEntry);
          tabMgr.markFieldDirty('lorebook');
          buildSidebar();
          const idx = fileData.lorebook.length - 1;
          tabMgr.openTab(`lore_${idx}`, newEntry.comment, '_loreform',
            () => fileData.lorebook[idx], (v) => { Object.assign(fileData.lorebook[idx], v); });
          setStatus('폴더에 새 항목 추가됨');
        }},
        '---',
        ...(folderChildren.length > 0 ? [{ label: `내용 일괄 삭제 (${folderChildren.length}개)`, action: async () => {
          if (!await showConfirm(`"${fEntry.comment}" 폴더 내 ${folderChildren.length}개 항목을 모두 삭제하시겠습니까?`)) return;
          const indices = folderChildren.map(c => c.index).sort((a, b) => b - a);
          for (const i of indices) {
            tabMgr.closeTab(`lore_${i}`);
            fileData.lorebook.splice(i, 1);
          }
          tabMgr.markFieldDirty('lorebook');
          buildSidebar();
          tabMgr.shiftIndexedTabsAfterRemoval('lore_', indices, buildLorebookTabState);
          setStatus(`${indices.length}개 항목 삭제됨`);
        }}] : []),
        { label: '폴더 삭제 (폴더만)', action: async () => {
          if (!await showConfirm(`"${fEntry.comment}" 폴더를 삭제하시겠습니까?\n내부 항목은 루트로 이동됩니다.`)) return;
          // Move children to root
          for (const child of folderChildren) {
            fileData.lorebook[child.index].folder = '';
          }
          tabMgr.closeTab(`lore_${folderIdx}`);
          fileData.lorebook.splice(folderIdx, 1);
          tabMgr.markFieldDirty('lorebook');
          buildSidebar();
          tabMgr.shiftIndexedTabsAfterRemoval('lore_', [folderIdx], buildLorebookTabState);
          setStatus(`폴더 삭제됨: ${fEntry.comment}`);
        }},
        { label: '폴더+내용 전체 삭제', action: async () => {
          const total = folderChildren.length + 1;
          if (!await showConfirm(`"${fEntry.comment}" 폴더와 내부 ${folderChildren.length}개 항목을 모두 삭제하시겠습니까?`)) return;
          const indices = [folderIdx, ...folderChildren.map(c => c.index)].sort((a, b) => b - a);
          for (const i of indices) {
            tabMgr.closeTab(`lore_${i}`);
            fileData.lorebook.splice(i, 1);
          }
          tabMgr.markFieldDirty('lorebook');
          buildSidebar();
          tabMgr.shiftIndexedTabsAfterRemoval('lore_', indices, buildLorebookTabState);
          setStatus(`폴더+내용 삭제됨 (${total}개)`);
        }},
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
    e.preventDefault(); e.stopPropagation();
    const items = [
      { label: '새 항목 추가', action: () => addNewRegex() },
      { label: 'JSON 파일 가져오기', action: () => importRegex() },
    ];
    if (fileData.regex.length > 0) {
      items.push('---');
      items.push({ label: `전체 삭제 (${fileData.regex.length}개)`, action: async () => {
        if (!await showConfirm(`정규식 전체 ${fileData.regex.length}개 항목을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
        for (let i = fileData.regex.length - 1; i >= 0; i--) tabMgr.closeTab(`regex_${i}`);
        fileData.regex = [];
        tabMgr.markFieldDirty('regex');
        buildSidebar();
        setStatus('정규식 전체 삭제됨');
      }});
    }
    showContextMenu(e.clientX, e.clientY, items);
  });

  for (let i = 0; i < fileData.regex.length; i++) {
    const rx = fileData.regex[i];
    const label = rx.comment || `regex_${i}`;
    const el = createTreeItem(label, '·', 1);
    const idx = i;
    el.addEventListener('click', () => {
      tabMgr.openTab(`regex_${idx}`, label, '_regexform',
        () => fileData.regex[idx],
        (v) => { Object.assign(fileData.regex[idx], v); }
      );
    });
    // Regex item right-click: rename / copy path / backup / delete
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const items = [
        { label: '이름 변경', action: () => renameRegex(idx) },
        { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_regex(${idx})`); setStatus(`복사됨: read_regex(${idx})`); } },
      ];
      const store = getBackups(`regex_${idx}`);
      if (store.length > 0) {
        items.push('---');
        items.push({ label: '백업 불러오기', action: () => showBackupMenu(`regex_${idx}`, e.clientX, e.clientY, backupMenuCallbacks) });
      }
      items.push('---');
      items.push({ label: '삭제', action: () => deleteRegex(idx) });
      showContextMenu(e.clientX, e.clientY, items);
    });
    rxFolder.children.appendChild(el);
  }

  // Assets (images) folder
  buildAssetsSidebar(tree);
}

async function buildAssetsSidebar(tree) {
  const assetList = await window.tokiAPI.getAssetList();

  const assetsFolder = createFolderItem('에셋 (이미지)', '🖼', 0);
  tree.appendChild(assetsFolder.header);
  tree.appendChild(assetsFolder.children);

  // Group assets by folder
  const groups = { icon: [], other: [] };
  if (assetList) {
    for (const asset of assetList) {
      const parts = asset.path.split('/');
      const group = parts[1] === 'icon' ? 'icon' : 'other';
      groups[group].push(asset);
    }
  }

  // Always show icon and other folders
  const folderDefs = [
    { key: 'icon', label: '아이콘 (icon)', icon: '⭐' },
    { key: 'other', label: '기타 (other)', icon: '📁' },
  ];

  for (const def of folderDefs) {
    const subFolder = createFolderItem(def.label, def.icon, 1);
    assetsFolder.children.appendChild(subFolder.header);
    assetsFolder.children.appendChild(subFolder.children);

    // Right-click on subfolder: add to this folder
    const targetFolder = def.key;
    subFolder.header.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, [
        { label: '이미지 추가', action: () => addAssetFromDialog(targetFolder) },
      ]);
    });

    // Add existing assets under this folder
    for (const asset of groups[def.key]) {
      const fileName = asset.path.split('/').pop();
      const el = createTreeItem(`${fileName} (${(asset.size/1024).toFixed(0)}KB)`, '·', 2);
      el.addEventListener('click', () => openImageTab(asset.path, fileName));
      attachAssetContextMenu(el, asset.path, fileName);
      subFolder.children.appendChild(el);
    }
  }
}


function initSidebarSplitResizer() {
  const resizer = document.getElementById('sidebar-split-resizer');
  const itemsSection = document.getElementById('sidebar-items-section');
  const refsSection = document.getElementById('sidebar-refs-section');
  if (!resizer || !itemsSection || !refsSection) return;

  let startY = 0;
  let startItemsH = 0;
  let startRefsH = 0;

  const onMove = (e) => {
    const dy = e.clientY - startY;
    const newItemsH = Math.max(60, startItemsH + dy);
    const newRefsH = Math.max(60, startRefsH - dy);
    itemsSection.style.flex = `0 0 ${newItemsH}px`;
    refsSection.style.flex = `0 0 ${newRefsH}px`;
  };
  const onUp = () => {
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startItemsH = itemsSection.offsetHeight;
    startRefsH = refsSection.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // --- Refs section buttons ---
  // refsSection already declared above
  const refsContent = document.getElementById('sidebar-refs');
  const collapseBtn = document.getElementById('btn-refs-collapse');
  const closeBtn = document.getElementById('btn-refs-close');
  const separateBtn = document.getElementById('btn-refs-separate');
  const extPopoutBtn = document.getElementById('btn-refs-extpopout');

  if (collapseBtn && refsContent) {
    let refsCollapsed = false;
    collapseBtn.addEventListener('click', () => {
      refsCollapsed = !refsCollapsed;
      refsContent.style.display = refsCollapsed ? 'none' : '';
      collapseBtn.textContent = refsCollapsed ? '▶' : '▼';
      collapseBtn.title = refsCollapsed ? '참고자료 펼치기' : '참고자료 접기';
    });
  }
  if (closeBtn && refsSection && resizer) {
    closeBtn.addEventListener('click', () => {
      refsSection.style.display = 'none';
      resizer.style.display = 'none';
      itemsSection.style.flex = '1';
    });
  }
  if (separateBtn) {
    separateBtn.addEventListener('click', () => {
      moveRefs('right');
    });
  }
  if (extPopoutBtn) {
    extPopoutBtn.addEventListener('click', () => {
      if (isPanelPoppedOut('refs')) {
        dockPanel('refs');
      } else {
        popOutPanel('refs');
      }
    });
  }
  // Right-click on refs header for position options
  const refsHeader = document.querySelector('.sidebar-header-refs');
  if (refsHeader) {
    refsHeader.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, [
        { label: '→ 사이드바', action: () => moveRefs('sidebar') },
        { label: '→ 좌측', action: () => moveRefs('left') },
        { label: '→ 우측', action: () => moveRefs('right') },
        { label: '→ 좌끝', action: () => moveRefs('far-left') },
        { label: '→ 우끝', action: () => moveRefs('far-right') },
        { label: '→ 상단', action: () => moveRefs('top') },
        { label: '→ 하단', action: () => moveRefs('bottom') },
      ]);
    });
  }
}

// createTreeItem and createFolderItem are imported from '../lib/sidebar-builder'

function createLoreEntryItem(child, indent) {
  const label = child.entry.comment || `entry_${child.index}`;
  const el = createTreeItem(label, '·', indent);
  const idx = child.index;
  el.addEventListener('click', () => {
    tabMgr.openTab(`lore_${idx}`, label, '_loreform',
      () => fileData.lorebook[idx],
      (v) => { Object.assign(fileData.lorebook[idx], v); }
    );
  });
  // Lorebook entry right-click: rename / copy path / backup / delete
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    const items = [
      { label: '이름 변경', action: () => renameLorebook(idx) },
      { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_lorebook(${idx})`); setStatus(`복사됨: read_lorebook(${idx})`); } },
    ];
    const store = getBackups(`lore_${idx}`);
    if (store.length > 0) {
      items.push('---');
      items.push({ label: '백업 불러오기', action: () => showBackupMenu(`lore_${idx}`, e.clientX, e.clientY, backupMenuCallbacks) });
    }
    items.push('---');
    items.push({ label: '삭제', action: () => deleteLorebook(idx) });
    showContextMenu(e.clientX, e.clientY, items);
  });
  return el;
}

function updateSidebarActive() {
  _updateSidebarActive(tabMgr.activeTabId, tabMgr.openTabs);
}

// ==================== Sidebar Actions (delegated to ../lib/sidebar-actions) ====================

let _cssStylePrefix = '';
let _cssStyleSuffix = '';

let cssSections = [];

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
  closeTab: (id) => tabMgr.closeTab(id),
  markFieldDirty: (field) => tabMgr.markFieldDirty(field),
  shiftIndexedTabsAfterRemoval: (prefix, removed, fn) => tabMgr.shiftIndexedTabsAfterRemoval(prefix, removed, fn),
  refreshIndexedTabs: (prefix, fn) => tabMgr.refreshIndexedTabs(prefix, fn),
  buildLorebookTabState,
  buildRegexTabState,
  buildLuaSectionTabState,
  buildCssSectionTabState,
});

const {
  addNewLorebook, addNewLorebookFolder, importLorebook, deleteLorebook, renameLorebook,
  addNewRegex, importRegex, deleteRegex, renameRegex,
  addAssetFromDialog, attachAssetContextMenu,
  addLuaSection, renameLuaSection, deleteLuaSection,
  addCssSection, renameCssSection, deleteCssSection,
} = sidebarActions;

// ==================== Backup System ====================

const backupMenuCallbacks = { setStatus, onRestore: restoreBackup };

function restoreBackup(tabId, backupIdx) {
  const store = getBackups(tabId);
  if (!store[backupIdx]) return;

  const backup = store[backupIdx];

  // Find the matching tab or open it
  const tab = tabMgr.openTabs.find(t => t.id === tabId);
  if (tab) {
    // Backup current content before restoring
    if (editorInstance && tabMgr.activeTabId === tabId) {
      createBackup(tabId, editorInstance.getValue());
    }
    tab.setValue(backup.content);
    // Refresh editor if it's the active tab
    if (tabMgr.activeTabId === tabId && editorInstance) {
      editorInstance.setValue(backup.content);
    }
  } else {
    // Tab not open - need to update the data directly
    // For lua sections
    if (tabId.startsWith('lua_s')) {
      const idx = parseInt(tabId.replace('lua_s', ''), 10);
      if (luaSections[idx]) {
        luaSections[idx].content = backup.content;
        fileData.lua = combineLuaSections(luaSections);
      }
    } else if (tabId === 'lua') {
      fileData.lua = backup.content;
      luaSections = parseLuaSections(backup.content);
    } else if (tabId === 'css') {
      fileData.css = backup.content;
      ({ sections: cssSections, prefix: _cssStylePrefix, suffix: _cssStyleSuffix } = parseCssSections(backup.content));
    } else if (tabId.startsWith('lore_')) {
      const idx = parseInt(tabId.replace('lore_', ''), 10);
      if (fileData.lorebook[idx]) {
        if (typeof backup.content === 'object') {
          Object.assign(fileData.lorebook[idx], backup.content);
        } else {
          fileData.lorebook[idx].content = backup.content;
        }
      }
    } else if (tabId.startsWith('regex_')) {
      const idx = parseInt(tabId.replace('regex_', ''), 10);
      if (fileData.regex[idx]) {
        if (typeof backup.content === 'object') {
          Object.assign(fileData.regex[idx], backup.content);
        } else {
          try {
            Object.assign(fileData.regex[idx], JSON.parse(backup.content));
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

// ==================== Drag & Drop ====================
function readFileAsBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
}

function initDragDrop() {
  const sidebar = document.getElementById('sidebar');

  sidebar.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sidebar.classList.add('drop-highlight');
  });

  sidebar.addEventListener('dragleave', (e) => {
    e.preventDefault();
    sidebar.classList.remove('drop-highlight');
  });

  sidebar.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    sidebar.classList.remove('drop-highlight');

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    let jsonCount = 0, imgCount = 0, charxCount = 0;

    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();

      // .charx/.risum files → add as reference (works even without main file open)
      if (ext === 'charx' || ext === 'risum') {
        if (referenceFiles.some(r => isSameReferencePath(r.filePath, file.path))) {
          setStatus(`이미 로드됨: ${file.name}`);
          continue;
        }
        const ref = await window.tokiAPI.openReferencePath(file.path);
        if (ref) {
          await syncReferenceFiles();
          charxCount++;
        }
        continue;
      }

      if (!fileData) {
        setStatus('파일을 먼저 열어주세요');
        return;
      }

      if (ext === 'json') {
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          const entries = Array.isArray(data) ? data : [data];
          // Detect regex vs lorebook: regex has "in"/"findRegex" or type "editDisplay"/"editInput"
          const isRegex = entries.some(e =>
            e.in !== undefined || e.findRegex !== undefined ||
            e.type === 'editDisplay' || e.type === 'editInput'
          );

          if (isRegex) {
            for (const entry of entries) {
              fileData.regex.push({
                comment: entry.comment || entry.name || file.name.replace('.json', ''),
                in: entry.in || entry.findRegex || '',
                out: entry.out || entry.replaceString || '',
                type: entry.type || 'editDisplay',
                ableFlag: entry.ableFlag !== undefined ? entry.ableFlag : true
              });
            }
          } else {
            const lbEntries = data.entries || entries;
            for (const entry of lbEntries) {
              fileData.lorebook.push({
                key: entry.key || (entry.keys ? entry.keys.join(', ') : ''),
                content: entry.content || '',
                comment: entry.comment || entry.name || file.name.replace('.json', ''),
                mode: entry.mode || 'normal',
                insertorder: entry.insertorder || entry.insertion_order || 100,
                alwaysActive: entry.alwaysActive || entry.constant || false,
                forceActivation: entry.forceActivation || false,
                selective: entry.selective || false,
                secondkey: entry.secondkey || (entry.secondary_keys ? entry.secondary_keys.join(', ') : ''),
                constant: entry.constant || false,
                order: fileData.lorebook.length,
                folder: entry.folder || ''
              });
            }
          }
          jsonCount++;
        } catch (err) {
          console.warn('[drag-drop] Invalid JSON:', file.name, err);
        }
      } else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
        const base64 = await readFileAsBase64(file);
        const result = await window.tokiAPI.addAssetBuffer(file.name, base64);
        if (result) imgCount++;
      }
    }

    buildSidebar();
    const parts = [];
    if (charxCount > 0) parts.push(`참고 파일 ${charxCount}개`);
    if (jsonCount > 0) parts.push(`JSON ${jsonCount}개`);
    if (imgCount > 0) parts.push(`이미지 ${imgCount}개`);
    if (parts.length > 0) {
      setStatus(`드래그 드롭: ${parts.join(', ')} 추가됨`);
    }
  });
}

// ==================== Terminal (xterm.js + node-pty) ====================
let term = null;
let fitAddon = null;

async function initTerminal() {
  const container = document.getElementById('terminal-container');
  const terminalUi = await initializeTerminalUi({
    api: {
      onTerminalData: (callback) => window.tokiAPI.onTerminalData(callback),
      onTerminalExit: (callback) => window.tokiAPI.onTerminalExit(callback),
      onTerminalStatus: (callback) => window.tokiAPI.onTerminalStatus(callback),
      terminalInput: (data) => window.tokiAPI.terminalInput(data),
      terminalIsRunning: () => window.tokiAPI.terminalIsRunning(),
      terminalResize: (cols, rows) => window.tokiAPI.terminalResize(cols, rows),
      terminalStart: (cols, rows) => window.tokiAPI.terminalStart(cols, rows)
    },
    container,
    onActivity: () => handleTerminalDataForBgm(),
    onTerminalData: (data) => {
      if (chatMode) onChatData(data);
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
    writeStatusToTerminal: true
  });
  term = terminalUi.term;
  fitAddon = terminalUi.fitAddon;
}


// ==================== Image Viewer ====================
function openImageTab(assetPath, fileName) {
  const tabId = `img_${assetPath}`;
  // Check if already open
  if (tabMgr.openTabs.find(t => t.id === tabId)) {
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
    _assetPath: assetPath
  };
  tabMgr.openTabs.push(tab);
  tabMgr.activeTabId = tabId;
  showImageViewer(tabId, assetPath);
  tabMgr.renderTabs();
  updateSidebarActive();
}

async function showImageViewer(tabId, assetPath) {
  // Save current Monaco editor
  if (editorInstance && tabMgr.activeTabId !== tabId) {
    const curTab = tabMgr.openTabs.find(t => t.id === tabMgr.activeTabId);
    if (curTab && curTab.language !== '_image' && curTab.setValue) {
      curTab._lastValue = editorInstance.getValue();
      curTab.setValue(curTab._lastValue);
    }
  }

  const container = document.getElementById('editor-container');
  container.innerHTML = '';
  if (editorInstance) { editorInstance.dispose(); editorInstance = null; }

  await renderImageViewer(container, assetPath);
}

// ==================== Layout Management ====================

function rebuildLayout() {
  layoutManager.rebuild();
}

function toggleSidebar() {
  layoutManager.toggleSidebar();
}

function toggleTerminal() {
  layoutManager.toggleTerminal();
}

function toggleAvatar() {
  layoutManager.toggleAvatar();
}

function moveItems(pos) {
  layoutManager.moveItems(pos);
}

function moveTerminal(pos) {
  layoutManager.moveTerminal(pos);
}

function moveRefs(pos) {
  layoutManager.moveRefs(pos);
}

function resetLayout() {
  layoutManager.resetLayout();
}

async function restartTerminal() {
  if (!term) return;
  await window.tokiAPI.terminalStop();
  // Wait for pty to fully terminate before starting a new one
  await new Promise(r => setTimeout(r, 200));
  term.clear();
  const restarted = await window.tokiAPI.terminalStart(term.cols, term.rows);
  setStatus(restarted ? '터미널 재시작됨' : '터미널 재시작 실패');
}

// ==================== Actions ====================
/** @type {import('../lib/file-actions').FileActionDeps} */
const fileActionDeps = {
  getFileData: () => fileData,
  setFileData: (d) => { fileData = d; },
  getEditorInstance: () => editorInstance,
  setEditorInstance: (v) => { editorInstance = v; },
  getAutosaveDir: () => autosaveDir,
  tabMgr,
  buildSidebar,
  setStatus,
};

async function handleNew() { return _handleNew(fileActionDeps); }
async function handleOpen() { return _handleOpen(fileActionDeps); }
async function handleSave() { return _handleSave(fileActionDeps); }
async function handleSaveAs() { return _handleSaveAs(fileActionDeps); }

// ==================== RP Mode ====================

// Load RP persona text (from file or custom)
async function loadRpPersona() {
  if (rpMode === 'off') return '';
  if (rpMode === 'custom') return rpCustomText;
  // 'toki' or 'aris' — read from file
  const text = await window.tokiAPI.readPersona(rpMode);
  return text || '';
}

function getRpLabel() {
  if (rpMode === 'off') return 'OFF';
  if (rpMode === 'toki') return '토키';
  if (rpMode === 'aris') return '아리스';
  if (rpMode === 'custom') return '커스텀';
  return 'OFF';
}

function initRpModeButton() {
  const btn = document.getElementById('btn-rp-mode');
  if (!btn) return;
  updateRpButtonStyle(btn);
  // Click: quick toggle ON/OFF (auto picks toki/aris based on dark mode)
  btn.addEventListener('click', () => {
    if (rpMode === 'off') {
      rpMode = getDefaultRpModeForDarkMode(darkMode);
    } else {
      rpMode = 'off';
    }
    writeRpMode(rpMode);
    updateRpButtonStyle(btn);
    setStatus(rpMode === 'off' ? 'RP 모드 OFF' : `RP 모드 ON (${getRpLabel()}) — 다음 AI CLI 시작 시 적용`);
  });
}

function updateRpButtonStyle(btn) {
  const isOn = rpMode !== 'off';
  btn.style.background = isOn ? 'rgba(255,255,255,0.5)' : '';
  btn.title = isOn ? `RP: ${getRpLabel()} (클릭: OFF)` : 'RP 모드 OFF (클릭: ON)';
}

function tryExtractPrimaryLuaFromTriggerScriptsText(value) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    for (const trigger of parsed) {
      const effects = Array.isArray(trigger?.effect) ? trigger.effect : [];
      for (const effect of effects) {
        if (effect && typeof effect.code === 'string' && (effect.type === 'triggerlua' || typeof effect.type !== 'string')) {
          return effect.code;
        }
      }
    }
    return '';
  } catch {
    return null;
  }
}

function mergeLuaIntoTriggerScriptsText(triggerScriptsText, lua) {
  if (typeof lua !== 'string' || !lua) {
    return triggerScriptsText;
  }

  try {
    const parsed = JSON.parse(triggerScriptsText || '[]');
    if (!Array.isArray(parsed)) return triggerScriptsText;

    for (const trigger of parsed) {
      const effects = Array.isArray(trigger?.effect) ? trigger.effect : [];
      for (const effect of effects) {
        if (effect && (effect.type === 'triggerlua' || typeof effect.code === 'string')) {
          effect.type = effect.type || 'triggerlua';
          effect.code = lua;
          return JSON.stringify(parsed, null, 2);
        }
      }
    }

    parsed.unshift({
      comment: '',
      type: 'start',
      conditions: [],
      effect: [{ type: 'triggerlua', code: lua }],
      lowLevelAccess: false
    });
    return JSON.stringify(parsed, null, 2);
  } catch {
    return triggerScriptsText;
  }
}

async function buildAssistantPrompt(promptInfo, mcpConnected) {
  if (!promptInfo) {
    return rpMode !== 'off' ? await loadRpPersona() : '';
  }

  const lines = [
    `당신은 RisuToki에 내장된 AI 어시스턴트입니다.`,
    ``,
    `== 현재 파일 ==`,
    `파일: ${promptInfo.fileName}`,
    `캐릭터: ${promptInfo.name}`,
    `구성: ${promptInfo.stats}`,
    ``,
    `== .charx 파일 구조 ==`,
    `.charx = ZIP 아카이브 (card.json + module.risum + assets/)`,
    `card.json: V3 캐릭터 카드 스펙 (name, description, firstMessage, personality 등)`,
    `module.risum: RPack 인코딩된 바이너리 (Lua 트리거, 정규식 스크립트, 로어북)`,
    `assets/: 이미지 리소스 (icon/, other/image/)`,
    ``,
    `== 편집 가능 필드 ==`,
    `- lua: Lua 5.4 트리거 스크립트 (RisuAI CBS API 사용). "-- ===== 섹션명 =====" 구분자로 섹션 분리됨`,
    `- globalNote: 포스트 히스토리 인스트럭션 (시스템 프롬프트 뒤에 삽입됨)`,
    `- firstMessage: 첫 메시지 (HTML/마크다운 혼용 가능)`,
    `- description: 캐릭터 설명`,
    `- css: 커스텀 CSS (RisuAI 채팅 UI에 적용)`,
    `- defaultVariables: 기본 변수 (평문)`,
    `- name: 캐릭터 이름`,
    ``,
    `== 로어북 항목 구조 ==`,
    `{ key: "트리거키워드", secondkey: "", comment: "설명", content: "본문",`,
    `  order: 100, priority: 0, selective: false, alwaysActive: false, mode: "normal" }`,
    ``,
    `== 정규식 스크립트 구조 ==`,
    `{ comment: "설명", type: "editoutput"|"editinput"|"editdisplay",`,
    `  find: "정규식패턴", replace: "치환문자열", flag: "g"|"gi"|"gm" }`,
  ];

  if (mcpConnected) {
    lines.push(``);
    lines.push(`== RisuToki MCP 도구 ==`);
    lines.push(`연결됨. 다음 도구로 에디터 데이터를 직접 읽기/쓰기할 수 있습니다:`);
    lines.push(`- list_fields: 필드 목록 + 크기 확인`);
    lines.push(`- read_field(field) / write_field(field, content): 필드 읽기/쓰기`);
    lines.push(`- list_lorebook / read_lorebook(index) / write_lorebook(index, data): 로어북 관리`);
    lines.push(`- add_lorebook(data) / delete_lorebook(index): 로어북 추가/삭제`);
    lines.push(`- list_regex / read_regex(index) / write_regex(index, data): 정규식 관리`);
    lines.push(`- add_regex(data) / delete_regex(index): 정규식 추가/삭제`);
    lines.push(`- list_lua / read_lua(index) / write_lua(index, content): Lua 섹션별 읽기/쓰기 (-- ===== 섹션명 ===== 구분자 기준)`);
    lines.push(`- replace_in_lua(index, find, replace, regex?, flags?): Lua 섹션 내 문자열 치환 (서버에서 직접 처리)`);
    lines.push(`- insert_in_lua(index, content, position?, anchor?): Lua 섹션에 코드 삽입 (end/start/after/before)`);
    lines.push(`- list_css / read_css(index) / write_css(index, content): CSS 섹션별 읽기/쓰기 (/* ===== 섹션명 ===== */ 구분자 기준)`);
    lines.push(`- replace_in_css(index, find, replace, regex?, flags?): CSS 섹션 내 문자열 치환 (서버에서 직접 처리)`);
    lines.push(`- insert_in_css(index, content, position?, anchor?): CSS 섹션에 코드 삽입 (end/start/after/before)`);
    lines.push(`- list_references: 로드된 참고 자료 파일 목록 (읽기 전용)`);
    lines.push(`- read_reference_field(index, field): 참고 파일의 필드 읽기 (읽기 전용)`);
    lines.push(`write/add/delete 도구 사용 시 에디터에서 사용자 확인 팝업이 뜹니다.`);
    lines.push(`도구를 적극 활용하여 사용자의 요청을 수행하세요.`);
    lines.push(``);
    lines.push(`== 중요: 읽기 규칙 ==`);
    lines.push(`- lua, css 필드는 반드시 섹션 단위로 읽으세요: list_lua → read_lua(index)`);
    lines.push(`- read_field("lua")나 read_field("css")는 전체를 한번에 반환하므로 사용하지 마세요`);
    lines.push(`- 로어북도 list_lorebook → read_lorebook(index) 순서로 개별 읽기`);
    lines.push(`- 정규식도 list_regex → read_regex(index) 순서로 개별 읽기`);
  } else {
    lines.push(`편집 중인 항목의 내용을 알려주면 수정을 도와드리겠습니다.`);
  }

  const rpText = await loadRpPersona();
  if (rpText) {
    lines.push(``);
    lines.push(`== Response Persona ==`);
    lines.push(rpText);
  }

  return lines.join('\n');
}

async function startAssistantCli(agent) {
  if (!term) {
    setStatus('터미널이 준비되지 않았습니다');
    return;
  }

  const promptInfo = await window.tokiAPI.getClaudePrompt();
  const runtimePlatform = detectRuntimePlatform(window.navigator);
  let mcpConnected = false;

  if (agent === 'claude') {
    mcpConnected = !!(await window.tokiAPI.writeMcpConfig());
    await window.tokiAPI.cleanupAgentsMd();
  } else if (agent === 'copilot') {
    mcpConnected = !!(await window.tokiAPI.writeCopilotMcpConfig());
  } else if (agent === 'codex') {
    mcpConnected = !!(await window.tokiAPI.writeCodexMcpConfig());
  }

  const initPrompt = await buildAssistantPrompt(promptInfo, mcpConnected);
  let cmd;

  if (agent === 'claude') {
    if (initPrompt) {
      const { filePath, platform } = await window.tokiAPI.writeSystemPrompt(initPrompt);
      cmd = buildAssistantLaunchCommand({
        agent,
        hasInitPrompt: true,
        platform: platform || runtimePlatform,
        systemPromptPath: filePath
      });
    } else {
      cmd = buildAssistantLaunchCommand({ agent, platform: runtimePlatform });
    }
  } else {
    await window.tokiAPI.writeAgentsMd(initPrompt || '');
    cmd = buildAssistantLaunchCommand({ agent, platform: runtimePlatform });
  }

  if (runtimePlatform === 'win32') {
    window.tokiAPI.terminalInput(buildWindowsAssistantBootstrapCommand());
  }

  window.tokiAPI.terminalInput(cmd);
  setStatus(`${AI_AGENT_LABELS[agent]} 시작 중...`);
}

async function handleClaudeStart() {
  await startAssistantCli('claude');
}

async function handleCopilotStart() {
  await startAssistantCli('copilot');
}

async function handleCodexStart() {
  await startAssistantCli('codex');
}


// ==================== Terminal Background ====================
async function handleTerminalBg() {
  const dataUrl = await window.tokiAPI.pickBgImage();
  const container = document.getElementById('terminal-container');
  if (dataUrl) {
    container.style.backgroundImage = `url("${dataUrl}")`;
    container.classList.add('has-bg');
  } else {
    // Clicked cancel → remove background
    container.style.backgroundImage = '';
    container.classList.remove('has-bg');
  }
}

// ==================== Resizers ====================
function initResizers() {
  // Slot resizers are initialized by rebuildLayout() → initSlotResizers()
  // Only avatar-terminal resizer needs static init here

  const avatarResizer = document.getElementById('avatar-resizer');
  const avatar = document.getElementById('toki-avatar');
  if (avatarResizer) {
    avatarResizer.addEventListener('mousedown', (e) => {
      if (!V_SLOTS.has(layoutState.terminalPos)) return; // only in vertical slots
      e.preventDefault();
      avatarResizer.classList.add('active');
      const startY = e.clientY;
      const startH = avatar.offsetHeight;
      const onMove = (ev) => {
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

  // Terminal toggle
  document.getElementById('btn-terminal-toggle').addEventListener('click', () => toggleTerminal());
}

// ==================== Dark Mode ====================


function toggleDarkMode() {
  darkMode = !darkMode;
  writeDarkMode(darkMode);
  refreshDarkModeUi();
  setStatus(darkMode ? '다크 모드 ON (Aris)' : '라이트 모드 ON (Toki)');
}

function refreshDarkModeUi() {
  applyDarkMode(darkMode, { editorInstance, formEditors: getFormEditors() });

  // Update TokiTalk title
  const titleEl = document.querySelector('.momo-title');
  if (titleEl) titleEl.textContent = darkMode ? 'ArisTalk' : 'TokiTalk';

  // Update status text and avatar image for dark-mode switch
  refreshAvatarForDarkMode(darkMode);

  // Switch terminal (xterm) theme
  if (typeof term !== 'undefined' && term) {
    term.options.theme = darkMode ? TERM_THEME_DARK : TERM_THEME_LIGHT;
  }

  // Auto-switch RP persona on dark mode toggle (if not custom/off)
  if (rpMode === 'toki' || rpMode === 'aris') {
    rpMode = getDefaultRpModeForDarkMode(darkMode);
    writeRpMode(rpMode);
  }
  const rpBtn = document.getElementById('btn-rp-mode');
  if (rpBtn) updateRpButtonStyle(rpBtn);

  // Update avatar right-click menu character name in context
  // (handled dynamically when contextmenu is shown)
}

// ==================== BGM (Terminal Response Music) ====================

function initBgmUi() {
  initBgmModule(settingsSnapshot.bgmEnabled, settingsSnapshot.bgmPath);

  const btn = document.getElementById('btn-bgm');
  if (!btn) return;

  updateBgmButtonStyle(btn);

  // Left-click: toggle on/off
  btn.addEventListener('click', () => {
    setBgmEnabled(!isBgmEnabled());
    writeBgmEnabled(isBgmEnabled());
    updateBgmButtonStyle(btn);
    if (!isBgmEnabled()) {
      pauseBgm();
    }
    setStatus(isBgmEnabled() ? 'BGM ON' : 'BGM OFF');
  });

  // Right-click: pick new BGM file
  btn.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const filePath = await window.tokiAPI.pickBgm();
    if (!filePath) return;
    setBgmFilePath(filePath);
    writeBgmPath(filePath);
    setStatus(`BGM 변경: ${filePath.split(/[/\\]/).pop()}`);
  });
}

function updateBgmButtonStyle(btn) {
  const enabled = isBgmEnabled();
  btn.textContent = enabled ? '🔊' : '🔇';
  btn.title = enabled ? 'BGM ON (우클릭: 파일 변경)' : 'BGM OFF (우클릭: 파일 변경)';
  btn.style.background = enabled ? 'rgba(255,255,255,0.5)' : '';
}

// Echo filter: ignore terminal data within 300ms of user input
let lastUserInputTime = 0;

// ==================== Chat Mode (TokiTalk Bubbles) ====================

function initChatMode() {
  const termArea = document.getElementById('terminal-area');

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
  termArea.appendChild(chatView);

  chatSendBtn.addEventListener('click', chatSendInput);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatSendInput();
    }
  });

  document.getElementById('btn-chat-mode').addEventListener('click', toggleChatMode);
}

function toggleChatMode() {
  chatMode = !chatMode;
  const termContainer = document.getElementById('terminal-container');
  const chatView = document.getElementById('chat-view');
  const btn = document.getElementById('btn-chat-mode');

  if (chatMode) {
    chatSession.setActive(true);

    termContainer.style.display = 'none';
    chatView.classList.add('active');
    btn.style.background = 'rgba(255,255,255,0.5)';
    renderChatMessages();
    document.getElementById('chat-input').focus();
  } else {
    chatSession.setActive(false);
    termContainer.style.display = '';
    chatView.classList.remove('active');
    btn.style.background = '';
    if (fitAddon && term) setTimeout(() => fitAddon.fit(), 20);
  }
}

function chatSendInput() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  chatSession.send(text);
  renderChatMessages();

  // Send to pty: text first, then Enter after short delay
  // Interactive CLI TUI needs separate text input and Enter key
  window.tokiAPI.terminalInput(text);
  setTimeout(() => {
    window.tokiAPI.terminalInput('\r');
  }, 50);
}

function onChatData(rawData) {
  chatSession.handleTerminalData(rawData);
}

function finalizeChatResponse() {
  chatSession.finalizeResponse();
  renderChatMessages();
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const chatState = chatSession.getState();
  const chatMessages = chatSession.getMessages();
  container.innerHTML = '';

  for (const msg of chatMessages) {
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

    // Detect numbered choices in system message and render buttons (skip if already chosen)
    if (msg.type === 'system' && msg.text && !chatState.isStreaming && !msg._choiceMade) {
        const choices = extractChatChoices(msg.text);
        if (choices.length >= 2) {
        const choiceContainer = document.createElement('div');
        choiceContainer.className = 'chat-choices';
        for (const choice of choices) {
          const btn = document.createElement('button');
          btn.className = 'chat-choice-btn';
          btn.textContent = choice.label;
          btn.addEventListener('click', () => sendChatChoice(choice.value));
          choiceContainer.appendChild(btn);
        }
        container.appendChild(choiceContainer);
      }
    }
  }

  container.scrollTop = container.scrollHeight;
}

function sendChatChoice(value) {
  if (!term) return;
  chatSession.selectChoice(value);
  renderChatMessages();
  window.tokiAPI.terminalInput(value);
  setTimeout(() => window.tokiAPI.terminalInput('\r'), 50);
}

// Background buffer: always collects terminal output so chat mode can show recent data
function feedBgBuffer(rawData) {
  chatSession.feedBackgroundData(rawData);
}

// Help popup and syntax reference are now in '../lib/help-popup'

// ==================== Autosave ====================

function startAutosave() {
  stopAutosave();
  if (!autosaveEnabled) return;
  autosaveTimer = setInterval(async () => {
    if (tabMgr.dirtyFields.size === 0 || !fileData) return;
    const filePath = await window.tokiAPI.getFilePath();
    if (!filePath && !autosaveDir) return;
    const updatedFields = collectDirtyFields();
    if (autosaveDir) updatedFields._autosaveDir = autosaveDir;
    const result = await window.tokiAPI.autosaveFile(updatedFields);
    if (result && result.success) {
      setStatus(`자동 저장됨: ${result.path.split(/[/\\]/).pop()}`);
    }
  }, autosaveInterval);
}

function stopAutosave() {
  if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
}

function collectDirtyFields() {
  return collectDirtyEditorFields({
    dirtyFields: tabMgr.dirtyFields,
    fileData,
    openTabs: tabMgr.openTabs
  });
}

// ==================== Settings Popup ====================

function showSettingsPopup() {
  renderSettingsPopup(
    {
      autosaveEnabled,
      autosaveInterval,
      autosaveDir,
      darkMode,
      bgmEnabled: isBgmEnabled(),
      rpMode,
      rpCustomText,
    },
    {
      onAutosaveToggle(enabled) {
        autosaveEnabled = enabled;
        writeAutosaveEnabled(autosaveEnabled);
        if (autosaveEnabled) startAutosave();
        else stopAutosave();
      },
      onAutosaveIntervalChange(interval) {
        autosaveInterval = interval;
        writeAutosaveInterval(autosaveInterval);
        if (autosaveEnabled) startAutosave();
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
      onRpModeChange(mode) {
        rpMode = mode;
        writeRpMode(rpMode);
        const btn = document.getElementById('btn-rp-mode');
        if (btn) updateRpButtonStyle(btn);
      },
      onRpCustomTextChange(text) {
        rpCustomText = text;
        writeRpCustomText(rpCustomText);
      },
      async onOpenPersonaTab(name) {
        const tabId = `persona_${name}`;
        const existing = tabMgr.openTabs.find(t => t.id === tabId);
        if (existing) { tabMgr.activeTabId = tabId; createOrSwitchEditor(existing); tabMgr.renderTabs(); }
        else {
          const content = await window.tokiAPI.readPersona(name);
          openExternalTextTab(
            tabId,
            `[페르소나] ${name}.txt`,
            content || '',
            (val) => window.tokiAPI.writePersona(name, val).then(() => {
              setStatus(`페르소나 저장: ${name}.txt`);
            })
          );
        }
      },
    }
  );
}

// ==================== Preview Test Panel ====================

async function showPreviewPanel() {
  if (!fileData) { setStatus('파일을 먼저 열어주세요'); return; }

  // Remove existing
  const existing = document.querySelector('.preview-overlay');
  if (existing) existing.remove();

  // Load all assets (name → data URI)
  let assetMapForEngine = {};
  try {
    const assetResult = await window.tokiAPI.getAllAssetsMap();
    assetMapForEngine = assetResult.assets || assetResult;
  } catch (error) {
    reportRuntimeError({
      context: '프리뷰 에셋 불러오기 실패',
      error,
      logPrefix: '[Preview]',
      setStatus
    });
  }

  await ensureWasmoon();

  renderPreviewPanel(document.body, {
    fileData,
    assetMap: assetMapForEngine,
    engine: PreviewEngine,
    setStatus,
    popoutPreview: async (charData) => {
      const requestId = await window.tokiAPI.setPreviewPopoutData(charData);
      await window.tokiAPI.popoutPanel('preview', requestId);
    }
  });
}

// ==================== Panel Drag & Drop ====================

function initPanelDragDrop() {
  // Make panel headers draggable
  const draggables = [
    { el: document.querySelector('.sidebar-header'), panel: 'sidebar', label: '항목' },
    { el: document.getElementById('terminal-header'), panel: 'terminal', label: 'TokiTalk' },
  ];

  for (const item of draggables) {
    if (!item.el) continue;
    item.el.style.cursor = 'grab';

    // Add pop-out button to header
    const popoutBtn = document.createElement('button');
    popoutBtn.className = 'panel-collapse-btn';
    popoutBtn.title = '팝아웃 (분리)';
    popoutBtn.textContent = '↗';
    popoutBtn.dataset.popoutPanel = item.panel;
    popoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPanelPoppedOut(item.panel)) {
        dockPanel(item.panel);
      } else {
        popOutPanel(item.panel);
      }
    });

    // Add close button (✕)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'panel-collapse-btn';
    closeBtn.title = '닫기';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.panel === 'sidebar') toggleSidebar();
      else if (item.panel === 'terminal') toggleTerminal();
    });

    if (item.panel === 'sidebar') {
      // Sidebar header: buttons group [↗ popout] [◀ collapse] [✕ close]
      const btnsGroup = item.el.querySelector('.sidebar-header-btns');
      const collapseBtn = document.getElementById('btn-sidebar-collapse');
      if (btnsGroup && collapseBtn) {
        btnsGroup.insertBefore(popoutBtn, collapseBtn);
        btnsGroup.appendChild(closeBtn);
      }
    } else if (item.panel === 'terminal') {
      // Terminal header: [↗ popout] [━ toggle] [✕ close]
      const headerRight = item.el.querySelector('.momo-header-right');
      const toggleBtn = document.getElementById('btn-terminal-toggle');
      if (headerRight && toggleBtn) {
        headerRight.insertBefore(popoutBtn, toggleBtn);
        toggleBtn.after(closeBtn);
      }
    }

    item.el.addEventListener('mousedown', (e) => {
      // Ignore if clicking a button inside the header
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      // Ignore right-click
      if (e.button !== 0) return;

      e.preventDefault();
      startPanelDrag(e, item.panel, item.label);
    });

    // Right-click for position + pop-out options
    item.el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isPoppedOut_ = isPanelPoppedOut(item.panel);
      const moveFn = item.panel === 'sidebar' ? moveItems : moveTerminal;
      const posItems = [
        { label: '→ 좌측', action: () => moveFn('left') },
        { label: '→ 우측', action: () => moveFn('right') },
        { label: '→ 좌끝', action: () => moveFn('far-left') },
        { label: '→ 우끝', action: () => moveFn('far-right') },
        { label: '→ 상단', action: () => moveFn('top') },
        { label: '→ 하단', action: () => moveFn('bottom') },
        { separator: true },
        isPoppedOut_
          ? { label: '도킹 (복원)', action: () => dockPanel(item.panel) }
          : { label: '팝아웃 (분리)', action: () => popOutPanel(item.panel) },
      ];
      showContextMenu(e.clientX, e.clientY, posItems);
    });
  }
}

function startPanelDrag(e, panelId, label) {
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;
  let dropZones = [];

  const onMove = (ev) => {
    const dx = Math.abs(ev.clientX - startX);
    const dy = Math.abs(ev.clientY - startY);

    // Start drag after 8px movement threshold
    if (!dragging && (dx > 8 || dy > 8)) {
      dragging = true;
      dropZones = createDropZones(panelId);
      document.body.style.cursor = 'grabbing';
    }

    if (dragging) {
      // Highlight the zone under cursor (rects cached at creation time)
      for (const zone of dropZones) {
        const r = zone._rect;
        if (ev.clientX >= r.left && ev.clientX <= r.right &&
            ev.clientY >= r.top && ev.clientY <= r.bottom) {
          zone.el.classList.add('hover');
        } else {
          zone.el.classList.remove('hover');
        }
      }
    }
  };

  const onUp = (ev) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';

    if (!dragging) return;

    // Find which zone was dropped on (use cached rects)
    let dropped = null;
    for (const zone of dropZones) {
      const r = zone._rect;
      if (ev.clientX >= r.left && ev.clientX <= r.right &&
          ev.clientY >= r.top && ev.clientY <= r.bottom) {
        dropped = zone;
      }
      zone.el.remove();
    }

    if (dropped) {
      applyPanelDrop(panelId, dropped.position);
    }
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function createDropZones(panelId) {
  const zones = [];
  const appBody = document.getElementById('app-body');
  const rect = appBody.getBoundingClientRect();
  const e = 0.08; // edge ratio for far zones
  const s = 0.15; // side ratio

  // All panels can go to all 6 positions
  const positions = [
    { position: 'far-left', label: '좌끝', x: rect.left, y: rect.top, w: rect.width * e, h: rect.height },
    { position: 'left', label: '좌측', x: rect.left + rect.width * e, y: rect.top + rect.height * 0.15, w: rect.width * (s - e), h: rect.height * 0.7 },
    { position: 'top', label: '상단', x: rect.left + rect.width * e, y: rect.top, w: rect.width * (1 - 2 * e), h: rect.height * 0.15 },
    { position: 'bottom', label: '하단', x: rect.left + rect.width * e, y: rect.bottom - rect.height * 0.15, w: rect.width * (1 - 2 * e), h: rect.height * 0.15 },
    { position: 'right', label: '우측', x: rect.right - rect.width * s, y: rect.top + rect.height * 0.15, w: rect.width * (s - e), h: rect.height * 0.7 },
    { position: 'far-right', label: '우끝', x: rect.right - rect.width * e, y: rect.top, w: rect.width * e, h: rect.height },
  ];

  for (const pos of positions) {
    const zone = document.createElement('div');
    zone.className = 'panel-drop-zone visible';
    zone.style.left = pos.x + 'px';
    zone.style.top = pos.y + 'px';
    zone.style.width = pos.w + 'px';
    zone.style.height = pos.h + 'px';

    const labelEl = document.createElement('div');
    labelEl.className = 'panel-drop-zone-label';
    labelEl.textContent = pos.label;
    zone.appendChild(labelEl);

    document.body.appendChild(zone);
    zones.push({ el: zone, position: pos.position, _rect: zone.getBoundingClientRect() });
  }

  return zones;
}

function applyPanelDrop(panelId, position) {
  if (panelId === 'sidebar') {
    moveItems(position);
  } else if (panelId === 'terminal') {
    moveTerminal(position);
  }
}

// ==================== Pop-out Mode (External Window) ====================

const poppedOutPanels = new Set(); // tracks which panels are popped out

function isPanelPoppedOut(panelId) {
  return poppedOutPanels.has(panelId);
}

async function popOutPanel(panelId, requestId = null) {
  if (isPanelPoppedOut(panelId)) return;

  const handleTitle = panelId === 'sidebar' ? '항목' : panelId === 'refs' ? '참고자료' : 'TokiTalk';

  // Create external window via IPC
  await window.tokiAPI.popoutPanel(panelId, requestId);
  poppedOutPanels.add(panelId);

  // Hide the panel in main window
  applyPopoutLayoutState(panelId, layoutState);
  rebuildLayout();

  // Update popout button icon
  updatePopoutButtons();
  setStatus(`${handleTitle} 팝아웃됨 (외부 창)`);
}

async function popOutEditorPanel(tabId) {
  if (isPanelPoppedOut('editor')) return;

  const targetId = tabId || tabMgr.activeTabId;
  if (!targetId) return;

  const curTab = tabMgr.openTabs.find(t => t.id === targetId);
  if (!curTab || curTab.language === '_image') return;

  // Switch to target tab first if not active
  if (targetId !== tabMgr.activeTabId) {
    createOrSwitchEditor(curTab);
  }

  // Get current content
  let content = '';
  if (editorInstance) {
    content = editorInstance.getValue();
    if (curTab.setValue) curTab.setValue(content);
  } else {
    content = curTab.getValue();
  }

  // Send tab data to main process for popout to pick up
  const requestId = await window.tokiAPI.setEditorPopoutData({
    tabId: curTab.id,
    label: curTab.label,
    language: curTab.language,
    content: content,
    readOnly: !curTab.setValue
  });

  // Create popout window
  await window.tokiAPI.popoutPanel('editor', requestId);
  poppedOutPanels.add('editor');

  // Show placeholder in editor area
  const container = document.getElementById('editor-container');
  if (editorInstance) { editorInstance.dispose(); editorInstance = null; }
  container.innerHTML = '<div class="empty-state">편집중 (팝아웃 창)</div>';

  tabMgr.renderTabs();
  setStatus(`에디터 팝아웃됨: ${curTab.label}`);
}

function dockPanel(panelId) {
  if (!isPanelPoppedOut(panelId)) return;

  // Close external window via IPC
  window.tokiAPI.closePopout(panelId);
  poppedOutPanels.delete(panelId);

  // Show the panel back in main window
  if (panelId === 'editor') {
    // Re-open the active tab in the main editor
    if (tabMgr.activeTabId) {
      const curTab = tabMgr.openTabs.find(t => t.id === tabMgr.activeTabId);
      if (curTab) createOrSwitchEditor(curTab);
    }
  } else {
    applyDockedLayoutState(panelId, layoutState);
  }
  rebuildLayout();

  // Refit terminal
  if (panelId === 'terminal' && fitAddon && term) {
    setTimeout(() => fitAddon.fit(), 50);
  }

  updatePopoutButtons();
  tabMgr.renderTabs();
  const panelName = panelId === 'sidebar' ? '항목' : panelId === 'editor' ? '에디터' : panelId === 'refs' ? '참고자료' : 'TokiTalk';
  setStatus(`${panelName} 도킹됨`);
}

function updatePopoutButtons() {
  // Update popout button icons based on current state
  document.querySelectorAll('[data-popout-panel]').forEach(btn => {
    const panel = btn.dataset.popoutPanel;
    if (poppedOutPanels.has(panel)) {
      btn.textContent = '📌';
      btn.title = '도킹 (복원)';
    } else {
      btn.textContent = '↗';
      btn.title = '팝아웃 (분리)';
    }
  });
}

// Tab open by ID (used for sidebar popout clicks)
function openTabById(tabId) {
  if (!fileData) return;

  const tabMap = {
    assetPromptTemplate: {
      label: '에셋 프롬프트 템플릿',
      lang: 'markdown',
      get: () => buildAssetPromptTemplate({
        name: fileData.name,
        description: fileData.description
      }),
      set: null
    },
    lua: {
      label: 'Lua (통합)',
      lang: 'lua',
      get: () => fileData.lua,
      set: (v) => {
        fileData.lua = v;
        fileData.triggerScripts = mergeLuaIntoTriggerScriptsText(fileData.triggerScripts, v);
        luaSections = parseLuaSections(v);
      }
    },
    globalNote: { label: '글로벌노트', lang: 'plaintext', get: () => fileData.globalNote, set: (v) => { fileData.globalNote = v; } },
    firstMessage: { label: '첫 메시지', lang: 'html', get: () => fileData.firstMessage, set: (v) => { fileData.firstMessage = v; } },
    triggerScripts: {
      label: '트리거 스크립트',
      lang: 'json',
      get: () => fileData.triggerScripts || '[]',
      set: (v) => {
        fileData.triggerScripts = v;
        const nextLua = tryExtractPrimaryLuaFromTriggerScriptsText(v);
        if (nextLua !== null) fileData.lua = nextLua;
      }
    },
    alternateGreetings: { label: '추가 첫 메시지', lang: 'json', get: () => stringifyStringArray(fileData.alternateGreetings), set: null },
    groupOnlyGreetings: { label: '그룹 첫 메시지', lang: 'json', get: () => stringifyStringArray(fileData.groupOnlyGreetings), set: null },
    css: { label: 'CSS (통합)', lang: 'css', get: () => fileData.css, set: (v) => { fileData.css = v; ({ sections: cssSections, prefix: _cssStylePrefix, suffix: _cssStyleSuffix } = parseCssSections(v)); } },
    defaultVariables: { label: '기본변수', lang: 'plaintext', get: () => fileData.defaultVariables, set: (v) => { fileData.defaultVariables = v; } },
    description: { label: '설명', lang: 'plaintext', get: () => fileData.description, set: (v) => { fileData.description = v; } },
  };

  if (tabMap[tabId]) {
    const t = tabMap[tabId];
    if (tabId === 'lua') fileData.lua = combineLuaSections(luaSections);
    tabMgr.openTab(tabId, t.label, t.lang, t.get, t.set);
    return;
  }

  if (tabId.startsWith('lore_')) {
    const idx = parseInt(tabId.replace('lore_', ''), 10);
    if (fileData.lorebook[idx]) {
      const label = fileData.lorebook[idx].comment || `entry_${idx}`;
      tabMgr.openTab(tabId, label, 'plaintext',
        () => fileData.lorebook[idx].content || '',
        (v) => { fileData.lorebook[idx].content = v; });
    }
  } else if (tabId.startsWith('regex_')) {
    const idx = parseInt(tabId.replace('regex_', ''), 10);
    if (fileData.regex[idx]) {
      const label = fileData.regex[idx].comment || `regex_${idx}`;
      tabMgr.openTab(tabId, label, 'json',
        () => JSON.stringify(fileData.regex[idx], null, 2),
        (v) => { try { fileData.regex[idx] = JSON.parse(v); } catch(e){} });
    }
  } else if (tabId.startsWith('guide_')) {
    // Guide file from refs popout
    const fileName = tabId.replace('guide_', '');
    const existing = tabMgr.openTabs.find(t => t.id === tabId);
    if (existing) {
      tabMgr.activeTabId = tabId;
      createOrSwitchEditor(existing);
      tabMgr.renderTabs();
      return;
    }
    window.tokiAPI.readGuide(fileName).then(content => {
      if (content == null) { setStatus('가이드 파일 읽기 실패'); return; }
      openExternalTextTab(
        tabId,
        `[가이드] ${fileName}`,
        content,
        (val) => window.tokiAPI.writeGuide(fileName, val)
      );
    });
  } else if (tabId.startsWith('ref_')) {
    // Reference file item from refs popout
    openRefTabById(tabId);
  }
}

// ==================== Keyboard Shortcuts ====================
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault(); handleNew();
    } else if (e.ctrlKey && e.key === 'o') {
      e.preventDefault(); handleOpen();
    } else if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault(); handleSaveAs();
    } else if (e.ctrlKey && e.key === 's') {
      e.preventDefault(); handleSave();
    } else if (e.ctrlKey && e.key === 'w') {
      e.preventDefault(); if (tabMgr.activeTabId) tabMgr.closeTab(tabMgr.activeTabId);
    } else if (e.ctrlKey && e.key === 'b') {
      e.preventDefault(); toggleSidebar();
    } else if (e.ctrlKey && e.key === '`') {
      e.preventDefault(); toggleTerminal();
    } else if (e.key === 'F5') {
      e.preventDefault(); showPreviewPanel();
    } else if (e.key === 'Escape') {
      closeAllMenus();
    }
  });
}

// ==================== Init ====================
export async function initMainRenderer() {
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
    const rpBtn = document.getElementById('btn-rp-mode');
    if (rpBtn) updateRpButtonStyle(rpBtn);
    const bgmBtn = document.getElementById('btn-bgm');
    if (bgmBtn) updateBgmButtonStyle(bgmBtn);
  });
  initMenuBar({
    // File
    'new': () => handleNew(),
    'open': () => handleOpen(),
    'save': () => handleSave(),
    'save-as': () => handleSaveAs(),
    'close-tab': () => { if (tabMgr.activeTabId) tabMgr.closeTab(tabMgr.activeTabId); },

    // Edit (Monaco editor commands)
    'undo': () => { if (editorInstance) editorInstance.trigger('menu', 'undo'); },
    'redo': () => { if (editorInstance) editorInstance.trigger('menu', 'redo'); },
    'cut': () => document.execCommand('cut'),
    'copy': () => document.execCommand('copy'),
    'paste': () => document.execCommand('paste'),
    'select-all': () => { if (editorInstance) editorInstance.trigger('menu', 'editor.action.selectAll'); },
    'find': () => { if (editorInstance) editorInstance.trigger('menu', 'actions.find'); },
    'replace': () => { if (editorInstance) editorInstance.trigger('menu', 'editor.action.startFindReplaceAction'); },

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
        const sz = editorInstance.getOption(monaco.editor.EditorOption.fontSize);
        editorInstance.updateOptions({ fontSize: sz + 1 });
      }
    },
    'zoom-out': () => {
      if (editorInstance) {
        const sz = editorInstance.getOption(monaco.editor.EditorOption.fontSize);
        editorInstance.updateOptions({ fontSize: Math.max(8, sz - 1) });
      }
    },
    'zoom-reset': () => { if (editorInstance) editorInstance.updateOptions({ fontSize: 14 }); },
    'toggle-dark': () => toggleDarkMode(),
    'preview-test': () => showPreviewPanel(),
    'devtools': () => window.tokiAPI.toggleDevTools(),

    // Terminal
    'claude-start': () => handleClaudeStart(),
    'copilot-start': () => handleCopilotStart(),
    'codex-start': () => handleCodexStart(),
    'terminal-clear': () => { if (term) term.clear(); },
    'terminal-restart': () => restartTerminal(),
  });
  initResizers();
  initKeyboard();
  initDragDrop();
  initEditor();
  document.getElementById('btn-terminal-bg').addEventListener('click', handleTerminalBg);
  initRpModeButton();
  initBgmUi();
  document.getElementById('btn-sidebar-collapse').addEventListener('click', toggleSidebar);
  document.getElementById('btn-avatar-collapse').addEventListener('click', toggleAvatar);
  document.getElementById('sidebar-expand').addEventListener('click', () => {
    moveItems(layoutState.itemsPos);
  });
  document.getElementById('toki-help-btn').addEventListener('click', showHelpPopup);
  document.getElementById('btn-settings').addEventListener('click', showSettingsPopup);
  initSidebarSplitResizer();
  initTokiAvatarUi(document.getElementById('toki-avatar-display'), { darkMode, setStatus });
  refreshDarkModeUi(); // Apply saved dark mode preference
  initChatMode();
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
  if (autosaveEnabled) startAutosave();
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
    poppedOutPanels.delete(panelType);
    // Show the panel back in main window
    if (panelType === 'sidebar') {
      layoutState.itemsVisible = true;
    } else if (panelType === 'terminal') {
      layoutState.terminalVisible = true;
    } else if (panelType === 'editor') {
      // Re-open editor in main window
      if (tabMgr.activeTabId) {
        const curTab = tabMgr.openTabs.find(t => t.id === tabMgr.activeTabId);
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
    const panelName = panelType === 'sidebar' ? '항목' : panelType === 'editor' ? '에디터' : panelType === 'preview' ? '프리뷰' : panelType === 'refs' ? '참고자료' : 'TokiTalk';
    setStatus(`${panelName} 도킹됨`);
  });

  // Listen for editor popout content changes
  window.tokiAPI.onEditorPopoutChange((tabId, content) => {
    const tab = tabMgr.openTabs.find(t => t.id === tabId);
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
      fileData.lorebook = value;
      if (updatePlan.refreshSidebar) buildSidebar();
      if (updatePlan.refreshIndexedPrefixes.includes('lore_')) {
        tabMgr.refreshIndexedTabs('lore_', buildLorebookTabState);
      }
      const activeTab = tabMgr.activeTabId ? tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId) : null;
      if (activeTab && activeTab.id.startsWith('lore_') && editorInstance && !FORM_TAB_TYPES.has(activeTab.language)) {
        const pos = editorInstance.getPosition();
        editorInstance.setValue(activeTab.getValue() || '');
        if (pos) editorInstance.setPosition(pos);
      }
    } else if (field === 'regex') {
      fileData.regex = value;
      if (updatePlan.refreshSidebar) buildSidebar();
      if (updatePlan.refreshIndexedPrefixes.includes('regex_')) {
        tabMgr.refreshIndexedTabs('regex_', buildRegexTabState);
      }
      const activeTab = tabMgr.activeTabId ? tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId) : null;
      if (activeTab && activeTab.id.startsWith('regex_') && editorInstance && !FORM_TAB_TYPES.has(activeTab.language)) {
        const pos = editorInstance.getPosition();
        editorInstance.setValue(activeTab.getValue() || '');
        if (pos) editorInstance.setPosition(pos);
      }
    } else {
      fileData[field] = value;
      if (field === 'triggerScripts') {
        const nextLua = tryExtractPrimaryLuaFromTriggerScriptsText(value);
        if (nextLua !== null) fileData.lua = nextLua;
      }
      if (field === 'lua') {
        fileData.triggerScripts = mergeLuaIntoTriggerScriptsText(fileData.triggerScripts, value);
      }
      if (field === 'lua') {
        luaSections = parseLuaSections(value);
      }
      if (field === 'css') {
        ({ sections: cssSections, prefix: _cssStylePrefix, suffix: _cssStyleSuffix } = parseCssSections(value));
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
        editorInstance.setValue(activeTab?.getValue ? (activeTab.getValue() || '') : (value || ''));
        if (pos) editorInstance.setPosition(pos);
      }
      if ((field === 'description' || field === 'name') && tabMgr.activeTabId === 'assetPromptTemplate' && editorInstance) {
        const activeTab = tabMgr.openTabs.find((tab) => tab.id === 'assetPromptTemplate');
        if (activeTab) {
          const pos = editorInstance.getPosition();
          editorInstance.setValue(activeTab.getValue() || '');
          if (pos) editorInstance.setPosition(pos);
        }
      }
      if (field === 'lua' && tabMgr.activeTabId?.startsWith('lua_s') && editorInstance) {
        const activeTab = tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId);
        if (activeTab) {
          const pos = editorInstance.getPosition();
          editorInstance.setValue(activeTab.getValue() || '');
          if (pos) editorInstance.setPosition(pos);
        }
      }
      if (field === 'css' && tabMgr.activeTabId?.startsWith('css_s') && editorInstance) {
        const activeTab = tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId);
        if (activeTab) {
          const pos = editorInstance.getPosition();
          editorInstance.setValue(activeTab.getValue() || '');
          if (pos) editorInstance.setPosition(pos);
        }
      }
      if (updatePlan.updateFileLabel) {
        const label = document.getElementById('file-label');
        if (label) label.textContent = value || 'Untitled';
      }
    }
    setStatus(updatePlan.statusMessage);
    tabMgr.markFieldDirty(field);
  });

  // (debug log removed)

  // Load Monaco (async)
  await ensureMonacoEditorReady();

  // Load Terminal (async, non-blocking)
  try {
    await initTerminal();
    // (debug log removed)
  } catch (err) {
    console.error('[init] Terminal load failed:', err);
    document.getElementById('terminal-container').innerHTML =
      '<div style="color:#f44;padding:8px;font-size:12px;">터미널 로딩 실패: ' + err.message + '</div>';
  }
}
