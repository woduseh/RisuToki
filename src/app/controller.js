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
  writeIdleAvatarState,
  writeLayoutState,
  writeRpCustomText,
  writeRpMode,
  writeWorkingAvatarState
} from '../lib/app-settings';
import {
  RISU_IDLE,
  RISU_DANCING,
  TOKI_IDLE,
  TOKI_CUTE,
  TOKI_DANCING,
  loadAvatarImage
} from '../lib/avatar';
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
import { buildPreviewDebugClipboardText, renderPreviewDebugHtml } from '../lib/preview-debug';
import { createPreviewSession } from '../lib/preview-session';
import { reportRuntimeError } from '../lib/runtime-feedback';
import { ensureWasmoon } from '../lib/script-loader';
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

function isSameReferencePath(left, right) {
  return typeof left === 'string'
    && typeof right === 'string'
    && left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

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

// Form editor mini-Monaco instances (lorebook/regex)
let formEditors = [];

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


async function addReferenceFile() {
  const beforeCount = (await syncReferenceFiles()).length;
  const result = await window.tokiAPI.openReference();
  if (!result) return;
  const added = (await syncReferenceFiles()).length - beforeCount;
  if (added > 0) {
    await buildRefsSidebar();
    setStatus(`참고 파일 추가: ${added}개`);
  } else {
    setStatus('이미 로드된 파일입니다');
  }
}

// ==================== Sidebar Refs Tab ====================

async function buildRefsSidebar() {
  const refsEl = document.getElementById('sidebar-refs');
  if (!refsEl) return;
  refsEl.innerHTML = '';
  await syncReferenceFiles();

  // Guides folder
  const guideData = await window.tokiAPI.listGuides();
  // Support both old (string[]) and new ({ builtIn, session }) format
  const builtInFiles = guideData?.builtIn || (Array.isArray(guideData) ? guideData : []);
  const sessionFiles = guideData?.session || [];
  const guideFolder = createFolderItem('가이드', '📖', 0);
  refsEl.appendChild(guideFolder.header);
  refsEl.appendChild(guideFolder.children);

  // Right-click on guide folder: new / import
  guideFolder.header.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, [
      { label: '새 가이드 작성', action: async () => {
        const name = await showPrompt('파일 이름 (예: guide.md)', 'new_guide.md');
        if (!name) return;
        const fn = name.endsWith('.md') ? name : name + '.md';
        await window.tokiAPI.writeGuide(fn, '');
        buildRefsSidebar();
        openExternalTextTab(
          `guide_${fn}`,
          `[가이드] ${fn}`,
          '',
          (val) => window.tokiAPI.writeGuide(fn, val)
        );
        setStatus(`가이드 생성: ${fn}`);
      }},
      { label: '가이드 불러오기 (세션 전용)', action: async () => {
        const imported = await window.tokiAPI.importGuide();
        if (imported.length > 0) {
          buildRefsSidebar();
          setStatus(`가이드 불러옴 (세션): ${imported.join(', ')}`);
        }
      }},
    ]);
  });

  // Helper: create guide item with click + context menu
  function addGuideItem(fileName, isSession) {
    const prefix = isSession ? '⏳ ' : '';
    const el = createTreeItem(prefix + fileName, '·', 1);
    el.addEventListener('click', async () => {
      const tabId = `guide_${fileName}`;
      const existing = tabMgr.openTabs.find(t => t.id === tabId);
      if (existing) {
        tabMgr.activeTabId = tabId;
        createOrSwitchEditor(existing);
        tabMgr.renderTabs();
        return;
      }
      const content = await window.tokiAPI.readGuide(fileName);
      if (content == null) { setStatus('가이드 파일 읽기 실패'); return; }
      openExternalTextTab(
        tabId,
        `[가이드] ${fileName}`,
        content,
        (val) => window.tokiAPI.writeGuide(fileName, val)
      );
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const items = [
        { label: '이름 복사', action: () => { navigator.clipboard.writeText(fileName); setStatus(`복사됨: ${fileName}`); } },
      ];
      if (!isSession) {
        items.push({ label: '경로 복사', action: async () => {
          const guidesDir = await window.tokiAPI.getGuidesPath();
          const fullPath = guidesDir ? `${guidesDir.replace(/\\/g, '/')}/${fileName}` : `guides/${fileName}`;
          navigator.clipboard.writeText(fullPath);
          setStatus(`복사됨: ${fullPath}`);
        }});
      }
      items.push('---');
      items.push({ label: isSession ? '제거' : '삭제', action: async () => {
        const msg = isSession ? `"${fileName}" 세션 가이드를 제거하시겠습니까?` : `"${fileName}" 가이드를 삭제하시겠습니까?`;
        if (!await showConfirm(msg)) return;
        tabMgr.closeTab(`guide_${fileName}`);
        await window.tokiAPI.deleteGuide(fileName);
        buildRefsSidebar();
        setStatus(isSession ? `가이드 제거됨: ${fileName}` : `가이드 삭제됨: ${fileName}`);
      }});
      showContextMenu(e.clientX, e.clientY, items);
    });
    guideFolder.children.appendChild(el);
  }

  for (const fileName of builtInFiles) addGuideItem(fileName, false);
  if (sessionFiles.length > 0) {
    // Separator between built-in and session guides
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--border-color);margin:4px 8px;';
    guideFolder.children.appendChild(sep);
    for (const fileName of sessionFiles) addGuideItem(fileName, true);
  }

  // Reference files section
  const refHeader = document.createElement('div');
  refHeader.className = 'tree-item indent-0 ref-section-header';
  refHeader.style.cssText = 'color:var(--accent);font-weight:700;font-size:11px;letter-spacing:0.5px;padding:10px 8px 4px;cursor:pointer;text-transform:uppercase;border-top:1px solid var(--border-color);margin-top:8px;';
  refHeader.textContent = '── 참고 파일 ──';
  refHeader.title = '클릭하여 참고 파일 추가';
  refHeader.addEventListener('click', addReferenceFile);
  refHeader.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      { label: '참고 파일 추가', action: addReferenceFile },
      ...(referenceFiles.length > 0 ? ['---', { label: '모두 제거', action: async () => { await window.tokiAPI.removeAllReferences(); await buildRefsSidebar(); } }] : []),
    ]);
  });
  refsEl.appendChild(refHeader);

  // Render each reference file
  for (let ri = 0; ri < referenceFiles.length; ri++) {
    const ref = referenceFiles[ri];
    const refFolder = createFolderItem(ref.fileName, '📎', 0);
    refsEl.appendChild(refFolder.header);
    refsEl.appendChild(refFolder.children);

    const refIdx = ri;
    refFolder.header.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const items = [
        { label: '이름 복사', action: () => { navigator.clipboard.writeText(ref.fileName); setStatus(`복사됨: ${ref.fileName}`); } },
      ];
      if (ref.filePath) {
        items.push({ label: '경로 복사', action: () => { navigator.clipboard.writeText(ref.filePath); setStatus(`복사됨: ${ref.filePath}`); } });
      }
      items.push('---');
      items.push({ label: '참고 파일 제거', action: async () => { await window.tokiAPI.removeReference(referenceFiles[refIdx].filePath || referenceFiles[refIdx].fileName); await buildRefsSidebar(); } });
      showContextMenu(e.clientX, e.clientY, items);
    });

    // Lua — split into sections like main sidebar
    if (ref.data.lua) {
      const refLuaSections = parseLuaSections(ref.data.lua);
      if (refLuaSections.length <= 1) {
        // Single section — just show as a single item
        const el = createTreeItem('Lua', '·', 1);
        el.addEventListener('click', () => {
          tabMgr.openTab(`ref_${refIdx}_lua`, `[참고] ${ref.fileName} - Lua`, 'lua', () => ref.data.lua, null);
        });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          showContextMenu(e.clientX, e.clientY, [
            { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_reference_field(${refIdx}, "lua")`); setStatus(`복사됨: read_reference_field(${refIdx}, "lua")`); } },
          ]);
        });
        refFolder.children.appendChild(el);
      } else {
        // Multiple sections — show as folder
        const luaFolder = createFolderItem('Lua', '{}', 1);
        refFolder.children.appendChild(luaFolder.header);
        refFolder.children.appendChild(luaFolder.children);
        // Combined view
        const combinedEl = createTreeItem('통합 보기', '📋', 2);
        combinedEl.addEventListener('click', () => {
          tabMgr.openTab(`ref_${refIdx}_lua`, `[참고] ${ref.fileName} - Lua (통합)`, 'lua', () => ref.data.lua, null);
        });
        combinedEl.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          showContextMenu(e.clientX, e.clientY, [
            { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_reference_field(${refIdx}, "lua")`); setStatus(`복사됨: read_reference_field(${refIdx}, "lua")`); } },
          ]);
        });
        luaFolder.children.appendChild(combinedEl);
        // Individual sections
        for (let si = 0; si < refLuaSections.length; si++) {
          const sec = refLuaSections[si];
          const secEl = createTreeItem(sec.name, '·', 2);
          const secIdx = si;
          secEl.addEventListener('click', () => {
            tabMgr.openTab(`ref_${refIdx}_lua_s${secIdx}`, `[참고] ${ref.fileName} - ${sec.name}`, 'lua', () => refLuaSections[secIdx].content, null);
          });
          secEl.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, [
              { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_reference_field(${refIdx}, "lua") → 섹션 "${sec.name}" (index ${secIdx})`); setStatus(`복사됨: 참고자료[${refIdx}] Lua 섹션[${secIdx}]`); } },
            ]);
          });
          luaFolder.children.appendChild(secEl);
        }
      }
    }

    const refFields = [
      { id: 'globalNote', label: '글로벌노트', lang: 'plaintext' },
      { id: 'firstMessage', label: '첫 메시지', lang: 'html' },
      { id: 'triggerScripts', label: '트리거 스크립트', lang: 'json' },
      { id: 'alternateGreetings', label: '추가 첫 메시지', lang: 'json', get: () => stringifyStringArray(ref.data.alternateGreetings) },
      { id: 'groupOnlyGreetings', label: '그룹 첫 메시지', lang: 'json', get: () => stringifyStringArray(ref.data.groupOnlyGreetings) },
      { id: 'description', label: '설명', lang: 'plaintext' },
    ];

    for (const f of refFields) {
      if (Array.isArray(ref.data[f.id])) {
        if (ref.data[f.id].length === 0) continue;
      } else if (f.id === 'triggerScripts') {
        if (!ref.data.triggerScripts || ref.data.triggerScripts === '[]') continue;
      } else if (!ref.data[f.id]) {
        continue;
      }
      const el = createTreeItem(f.label, '·', 1);
      const tabId = `ref_${refIdx}_${f.id}`;
      el.addEventListener('click', () => {
        tabMgr.openTab(tabId, `[참고] ${ref.fileName} - ${f.label}`, f.lang, f.get || (() => ref.data[f.id]), null);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, [
          { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_reference_field(${refIdx}, "${f.id}")`); setStatus(`복사됨: read_reference_field(${refIdx}, "${f.id}")`); } },
        ]);
      });
      refFolder.children.appendChild(el);
    }

    // CSS — split into sections like main sidebar
    if (ref.data.css) {
      const refCssSections = parseCssSections(ref.data.css).sections;
      if (refCssSections.length <= 1) {
        const el = createTreeItem('CSS', '·', 1);
        el.addEventListener('click', () => {
          tabMgr.openTab(`ref_${refIdx}_css`, `[참고] ${ref.fileName} - CSS`, 'css', () => ref.data.css, null);
        });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          showContextMenu(e.clientX, e.clientY, [
            { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_reference_field(${refIdx}, "css")`); setStatus(`복사됨: read_reference_field(${refIdx}, "css")`); } },
          ]);
        });
        refFolder.children.appendChild(el);
      } else {
        const cssFolderRef = createFolderItem('CSS', '🎨', 1);
        refFolder.children.appendChild(cssFolderRef.header);
        refFolder.children.appendChild(cssFolderRef.children);
        const combinedEl = createTreeItem('통합 보기', '📋', 2);
        combinedEl.addEventListener('click', () => {
          tabMgr.openTab(`ref_${refIdx}_css`, `[참고] ${ref.fileName} - CSS (통합)`, 'css', () => ref.data.css, null);
        });
        combinedEl.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          showContextMenu(e.clientX, e.clientY, [
            { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_reference_field(${refIdx}, "css")`); setStatus(`복사됨: read_reference_field(${refIdx}, "css")`); } },
          ]);
        });
        cssFolderRef.children.appendChild(combinedEl);
        for (let si = 0; si < refCssSections.length; si++) {
          const sec = refCssSections[si];
          const secEl = createTreeItem(sec.name, '·', 2);
          const secIdx = si;
          secEl.addEventListener('click', () => {
            tabMgr.openTab(`ref_${refIdx}_css_s${secIdx}`, `[참고] ${ref.fileName} - ${sec.name}`, 'css', () => refCssSections[secIdx].content, null);
          });
          secEl.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, [
              { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_reference_field(${refIdx}, "css") → 섹션 "${sec.name}" (index ${secIdx})`); setStatus(`복사됨: 참고자료[${refIdx}] CSS 섹션[${secIdx}]`); } },
            ]);
          });
          cssFolderRef.children.appendChild(secEl);
        }
      }
    }

    // Lorebook — folder structure + _loreform (readonly)
    if (ref.data.lorebook && ref.data.lorebook.length > 0) {
      const lbFolder = createFolderItem(`로어북 (${ref.data.lorebook.length})`, '📚', 1);
      refFolder.children.appendChild(lbFolder.header);
      refFolder.children.appendChild(lbFolder.children);

      // Group by folder (same logic as main sidebar)
      const refFolderDataList = [];
      const refFolderLookup = {};
      const refRootEntries = [];
      for (let li = 0; li < ref.data.lorebook.length; li++) {
        const entry = ref.data.lorebook[li];
        if (entry.mode === 'folder') {
          const fd = { entry, index: li, children: [] };
          refFolderDataList.push(fd);
          const k = entry.key || '', c = entry.comment || '';
          if (k) { refFolderLookup[`folder:${k}`] = fd; refFolderLookup[k] = fd; }
          if (c) { refFolderLookup[`folder:${c}`] = fd; refFolderLookup[c] = fd; }
          refFolderLookup[`folder:${li}`] = fd;
          refFolderLookup[String(li)] = fd;
        }
      }
      for (let li = 0; li < ref.data.lorebook.length; li++) {
        const entry = ref.data.lorebook[li];
        if (entry.mode === 'folder') continue;
        const folderId = entry.folder;
        const matched = folderId ? refFolderLookup[folderId] || refFolderLookup[String(folderId)] : null;
        if (matched) { matched.children.push({ entry, index: li }); }
        else { refRootEntries.push({ entry, index: li }); }
      }

      const refLorebook = ref.data.lorebook;
      function makeRefLoreItem(child, indent) {
        const lbLabel = child.entry.comment || child.entry.key || `#${child.index}`;
        const lbEl = createTreeItem(lbLabel, '·', indent);
        const li = child.index;
        const lbTabId = `ref_${refIdx}_lb_${li}`;
        lbEl.addEventListener('click', () => {
          const tab = tabMgr.openTab(lbTabId, `[참고] ${ref.fileName} - ${lbLabel}`, '_loreform', () => refLorebook[li], null);
          if (tab) tab._refLorebook = refLorebook;
        });
        lbEl.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          showContextMenu(e.clientX, e.clientY, [
            { label: '키 복사', action: () => { navigator.clipboard.writeText(child.entry.key || ''); setStatus(`복사됨: ${child.entry.key}`); } },
            { label: '내용 복사', action: () => { navigator.clipboard.writeText(child.entry.content || ''); setStatus('내용 복사됨'); } },
            { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_reference_field(${refIdx}, "lorebook") → index ${li}`); setStatus(`복사됨: 참고자료[${refIdx}] 로어북[${li}]`); } },
          ]);
        });
        return lbEl;
      }

      for (const folder of refFolderDataList) {
        const subFolder = createFolderItem(folder.entry.comment || `folder_${folder.index}`, '📁', 2);
        lbFolder.children.appendChild(subFolder.header);
        lbFolder.children.appendChild(subFolder.children);
        for (const child of folder.children) {
          subFolder.children.appendChild(makeRefLoreItem(child, 3));
        }
      }
      for (const child of refRootEntries) {
        lbFolder.children.appendChild(makeRefLoreItem(child, 2));
      }
    }

    // Regex — _regexform (readonly)
    if (ref.data.regex && ref.data.regex.length > 0) {
      const rxFolder = createFolderItem(`정규식 (${ref.data.regex.length})`, '⚡', 1);
      refFolder.children.appendChild(rxFolder.header);
      refFolder.children.appendChild(rxFolder.children);
      for (let xi = 0; xi < ref.data.regex.length; xi++) {
        const rx = ref.data.regex[xi];
        const rxLabel = rx.comment || `#${xi}`;
        const rxEl = createTreeItem(rxLabel, '·', 2);
        const rxTabId = `ref_${refIdx}_rx_${xi}`;
        const rxIdx = xi;
        rxEl.addEventListener('click', () => {
          tabMgr.openTab(rxTabId, `[참고] ${ref.fileName} - ${rxLabel}`, '_regexform', () => ref.data.regex[rxIdx], null);
        });
        rxEl.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          showContextMenu(e.clientX, e.clientY, [
            { label: '패턴 복사', action: () => { navigator.clipboard.writeText(rx.in || rx.findRegex || ''); setStatus('패턴 복사됨'); } },
            { label: '내용 복사', action: () => { navigator.clipboard.writeText(JSON.stringify(rx, null, 2)); setStatus('내용 복사됨'); } },
            { label: 'MCP 경로 복사', action: () => { navigator.clipboard.writeText(`read_reference_field(${refIdx}, "regex") → index ${rxIdx}`); setStatus(`복사됨: 참고자료[${refIdx}] 정규식[${rxIdx}]`); } },
          ]);
        });
        rxFolder.children.appendChild(rxEl);
      }
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

// ==================== Sidebar Actions ====================

// --- Lorebook ---
function addNewLorebook() {
  if (!fileData) return;
  const newEntry = {
    key: '',
    content: '',
    comment: `new_entry_${fileData.lorebook.length}`,
    mode: 'normal',
    insertorder: 100,
    alwaysActive: false,
    forceActivation: false,
    selective: false,
    secondkey: '',
    constant: false,
    order: fileData.lorebook.length,
    folder: ''
  };
  fileData.lorebook.push(newEntry);
  tabMgr.markFieldDirty('lorebook');
  buildSidebar();
  const idx = fileData.lorebook.length - 1;
  tabMgr.openTab(`lore_${idx}`, newEntry.comment, '_loreform',
    () => fileData.lorebook[idx],
    (v) => { Object.assign(fileData.lorebook[idx], v); }
  );
  setStatus('새 로어북 항목 추가됨');
}

async function addNewLorebookFolder() {
  if (!fileData) return;
  const name = await showPrompt('폴더 이름을 입력하세요', '새 폴더');
  if (!name) return;
  const folderId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const newFolder = {
    key: folderId,
    content: '',
    comment: name,
    mode: 'folder',
    insertorder: 100,
    alwaysActive: false,
    forceActivation: false,
    selective: false,
    secondkey: '',
    constant: false,
    order: fileData.lorebook.length,
    folder: ''
  };
  fileData.lorebook.push(newFolder);
  buildSidebar();
  tabMgr.markFieldDirty('lorebook');
  setStatus(`로어북 폴더 추가: ${name}`);
}

async function importLorebook() {
  if (!fileData) return;
  const imported = await window.tokiAPI.importJson();
  if (!imported || imported.length === 0) return;

  let addedCount = 0;
  for (const { fileName, data } of imported) {
    const entries = Array.isArray(data) ? data : (data.entries || [data]);
    for (const entry of entries) {
      fileData.lorebook.push({
        key: entry.key || (entry.keys ? entry.keys.join(', ') : ''),
        content: entry.content || '',
        comment: entry.comment || entry.name || fileName.replace('.json', ''),
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
      addedCount++;
    }
  }

  tabMgr.markFieldDirty('lorebook');
  buildSidebar();
  setStatus(`로어북 ${addedCount}개 항목 가져옴`);
}

async function deleteLorebook(idx) {
  if (!fileData || idx < 0 || idx >= fileData.lorebook.length) return;
  const name = fileData.lorebook[idx].comment || `entry_${idx}`;
  if (!await showConfirm(`"${name}" 로어북 항목을 삭제하시겠습니까?`)) return;

  tabMgr.closeTab(`lore_${idx}`);
  fileData.lorebook.splice(idx, 1);
  tabMgr.markFieldDirty('lorebook');
  buildSidebar();
  tabMgr.shiftIndexedTabsAfterRemoval('lore_', [idx], buildLorebookTabState);
  setStatus(`로어북 항목 삭제됨: ${name}`);
}

async function renameLorebook(idx) {
  if (!fileData || idx < 0 || idx >= fileData.lorebook.length) return;
  const oldName = fileData.lorebook[idx].comment || `entry_${idx}`;
  const newName = await showPrompt('새 이름:', oldName);
  if (!newName || newName === oldName) return;
  fileData.lorebook[idx].comment = newName;
  tabMgr.markFieldDirty('lorebook');
  buildSidebar();
  tabMgr.refreshIndexedTabs('lore_', buildLorebookTabState);
  setStatus(`로어북 항목 이름 변경: ${newName}`);
}

// --- Regex ---
function addNewRegex() {
  if (!fileData) return;
  const newRegex = {
    comment: `new_regex_${fileData.regex.length}`,
    in: '',
    out: '',
    type: 'editInput',
    ableFlag: true,
    flag: '',
    replaceOrder: 0
  };
  fileData.regex.push(newRegex);
  tabMgr.markFieldDirty('regex');
  buildSidebar();
  const idx = fileData.regex.length - 1;
  tabMgr.openTab(`regex_${idx}`, newRegex.comment, '_regexform',
    () => fileData.regex[idx],
    (v) => { Object.assign(fileData.regex[idx], v); }
  );
  setStatus('새 정규식 항목 추가됨');
}

async function importRegex() {
  if (!fileData) return;
  const imported = await window.tokiAPI.importJson();
  if (!imported || imported.length === 0) return;

  let addedCount = 0;
  for (const { fileName, data } of imported) {
    const entries = Array.isArray(data) ? data : [data];
    for (const entry of entries) {
      fileData.regex.push({
        comment: entry.comment || entry.name || fileName.replace('.json', ''),
        in: entry.in || entry.findRegex || '',
        out: entry.out || entry.replaceString || '',
        type: entry.type || 'editDisplay',
        ableFlag: entry.ableFlag !== undefined ? entry.ableFlag : true
      });
      addedCount++;
    }
  }

  tabMgr.markFieldDirty('regex');
  buildSidebar();
  setStatus(`정규식 ${addedCount}개 항목 가져옴`);
}

async function deleteRegex(idx) {
  if (!fileData || idx < 0 || idx >= fileData.regex.length) return;
  const name = fileData.regex[idx].comment || `regex_${idx}`;
  if (!await showConfirm(`"${name}" 정규식을 삭제하시겠습니까?`)) return;

  tabMgr.closeTab(`regex_${idx}`);
  fileData.regex.splice(idx, 1);
  tabMgr.markFieldDirty('regex');
  buildSidebar();
  tabMgr.shiftIndexedTabsAfterRemoval('regex_', [idx], buildRegexTabState);
  setStatus(`정규식 삭제됨: ${name}`);
}

async function renameRegex(idx) {
  if (!fileData || idx < 0 || idx >= fileData.regex.length) return;
  const oldName = fileData.regex[idx].comment || `regex_${idx}`;
  const newName = await showPrompt('새 이름:', oldName);
  if (!newName || newName === oldName) return;
  fileData.regex[idx].comment = newName;
  tabMgr.markFieldDirty('regex');
  buildSidebar();
  tabMgr.refreshIndexedTabs('regex_', buildRegexTabState);
  setStatus(`정규식 이름 변경: ${newName}`);
}

// --- Assets ---
async function addAssetFromDialog(targetFolder) {
  const added = await window.tokiAPI.addAsset(targetFolder || 'other');
  if (!added || added.length === 0) return;
  buildSidebar();
  setStatus(`에셋 ${added.length}개 추가됨`);
}

function attachAssetContextMenu(el, assetPath, fileName) {
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, [
      { label: '이름 변경', action: async () => {
        const newName = await showPrompt('새 파일명:', fileName);
        if (!newName || newName === fileName) return;
        const newPath = await window.tokiAPI.renameAsset(assetPath, newName);
        if (newPath) {
          buildSidebar();
          setStatus(`에셋 이름 변경: ${newName}`);
        }
      }},
      '---',
      { label: '삭제', action: async () => {
        if (!await showConfirm(`"${fileName}" 에셋을 삭제하시겠습니까?`)) return;
        const ok = await window.tokiAPI.deleteAsset(assetPath);
        if (ok) {
          tabMgr.closeTab(`img_${assetPath}`);
          buildSidebar();
          setStatus(`에셋 삭제됨: ${fileName}`);
        }
      }}
    ]);
  });
}

let _cssStylePrefix = '';
let _cssStyleSuffix = '';

let cssSections = [];

async function addLuaSection() {
  if (!fileData) return;
  const name = await showPrompt('새 Lua 섹션 이름:', `section_${luaSections.length}`);
  if (!name) return;

  luaSections.push({ name, content: '' });
  fileData.lua = combineLuaSections(luaSections);
  tabMgr.markFieldDirty('lua');
  buildSidebar();

  const idx = luaSections.length - 1;
  tabMgr.openTab(`lua_s${idx}`, name, 'lua',
    () => luaSections[idx].content,
    (v) => {
      luaSections[idx].content = v;
      fileData.lua = combineLuaSections(luaSections);
    }
  );
  setStatus(`Lua 섹션 추가됨: ${name}`);
}

async function renameLuaSection(idx) {
  if (idx < 0 || idx >= luaSections.length) return;
  const oldName = luaSections[idx].name;
  const newName = await showPrompt('새 이름:', oldName);
  if (!newName || newName === oldName) return;

  luaSections[idx].name = newName;
  fileData.lua = combineLuaSections(luaSections);
  tabMgr.markFieldDirty('lua');
  buildSidebar();
  tabMgr.refreshIndexedTabs('lua_s', buildLuaSectionTabState);
  setStatus(`Lua 섹션 이름 변경: ${newName}`);
}

async function deleteLuaSection(idx) {
  if (idx < 0 || idx >= luaSections.length) return;
  const name = luaSections[idx].name;
  if (!await showConfirm(`"${name}" Lua 섹션을 삭제하시겠습니까?`)) return;

  tabMgr.closeTab(`lua_s${idx}`);
  luaSections.splice(idx, 1);
  fileData.lua = combineLuaSections(luaSections);
  tabMgr.markFieldDirty('lua');
  buildSidebar();
  tabMgr.shiftIndexedTabsAfterRemoval('lua_s', [idx], buildLuaSectionTabState);
  setStatus(`Lua 섹션 삭제됨: ${name}`);
}

// --- CSS Section Management ---

async function addCssSection() {
  if (!fileData) return;
  const name = await showPrompt('새 CSS 섹션 이름:', `section_${cssSections.length}`);
  if (!name) return;

  cssSections.push({ name, content: '' });
  fileData.css = combineCssSections(cssSections, _cssStylePrefix, _cssStyleSuffix);
  tabMgr.markFieldDirty('css');
  buildSidebar();

  const idx = cssSections.length - 1;
  tabMgr.openTab(`css_s${idx}`, name, 'css',
    () => cssSections[idx].content,
    (v) => {
      cssSections[idx].content = v;
      fileData.css = combineCssSections(cssSections, _cssStylePrefix, _cssStyleSuffix);
    }
  );
  setStatus(`CSS 섹션 추가됨: ${name}`);
}

async function renameCssSection(idx) {
  if (idx < 0 || idx >= cssSections.length) return;
  const oldName = cssSections[idx].name;
  const newName = await showPrompt('새 이름:', oldName);
  if (!newName || newName === oldName) return;

  cssSections[idx].name = newName;
  fileData.css = combineCssSections(cssSections, _cssStylePrefix, _cssStyleSuffix);
  tabMgr.markFieldDirty('css');
  buildSidebar();
  tabMgr.refreshIndexedTabs('css_s', buildCssSectionTabState);
  setStatus(`CSS 섹션 이름 변경: ${newName}`);
}

async function deleteCssSection(idx) {
  if (idx < 0 || idx >= cssSections.length) return;
  const name = cssSections[idx].name;
  if (!await showConfirm(`"${name}" CSS 섹션을 삭제하시겠습니까?`)) return;

  tabMgr.closeTab(`css_s${idx}`);
  cssSections.splice(idx, 1);
  fileData.css = combineCssSections(cssSections, _cssStylePrefix, _cssStyleSuffix);
  tabMgr.markFieldDirty('css');
  buildSidebar();
  tabMgr.shiftIndexedTabsAfterRemoval('css_s', [idx], buildCssSectionTabState);
  setStatus(`CSS 섹션 삭제됨: ${name}`);
}

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

// ==================== Form Editors (Lorebook / Regex) ====================

function disposeFormEditors() {
  for (const ed of formEditors) {
    try {
      ed.dispose();
    } catch (error) {
      console.warn('[Editor] Failed to dispose form editor:', error);
    }
  }
  formEditors = [];
}

function createMiniMonaco(container, value, language, onChange) {
  if (!monacoReady) {
    const textarea = document.createElement('textarea');
    textarea.className = 'settings-textarea form-monaco-fallback';
    textarea.value = value || '';
    textarea.readOnly = !onChange;
    textarea.style.width = '100%';
    textarea.style.height = '100%';
    textarea.style.minHeight = 'inherit';
    textarea.style.margin = '0';
    textarea.style.border = 'none';
    textarea.style.borderRadius = '0';
    textarea.style.resize = 'none';
    container.replaceChildren(textarea);

    const handleInput = () => {
      if (onChange) onChange(textarea.value);
    };
    if (onChange) {
      textarea.addEventListener('input', handleInput);
    }

    const fallbackEditor = {
      dispose() {
        if (onChange) {
          textarea.removeEventListener('input', handleInput);
        }
        textarea.remove();
      },
      getValue() {
        return textarea.value;
      },
      updateOptions(options) {
        if (options && Object.prototype.hasOwnProperty.call(options, 'readOnly')) {
          textarea.readOnly = !!options.readOnly;
        }
      }
    };
    formEditors.push(fallbackEditor);
    return fallbackEditor;
  }

  ensureBlueArchiveMonacoTheme();
  if (darkMode && !window._baDarkThemeDefined) {
    defineDarkMonacoTheme();
  }

  try {
    const ed = monaco.editor.create(container, {
      value: value || '',
      language: language,
      theme: darkMode ? 'blue-archive-dark' : 'blue-archive',
      fontSize: 13,
      minimap: { enabled: false },
      wordWrap: 'on',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      lineNumbers: 'off',
      glyphMargin: false,
      folding: false,
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollbar: { vertical: 'auto', horizontal: 'auto' },
      tabSize: 2,
    });

    ed.onDidChangeModelContent(() => {
      if (onChange) onChange(ed.getValue());
    });

    formEditors.push(ed);
    return ed;
  } catch (error) {
    console.error('[Editor] Failed to create mini Monaco, falling back to textarea:', error);
    return createMiniMonaco(container, value, language, onChange);
  }
}

function showLoreEditor(tabInfo) {
  const container = document.getElementById('editor-container');

  // Save current Monaco state
  if (editorInstance && tabMgr.activeTabId !== tabInfo.id) {
    const curTab = tabMgr.openTabs.find(t => t.id === tabMgr.activeTabId);
    if (curTab && !FORM_TAB_TYPES.has(curTab.language) && curTab.setValue) {
      curTab._lastValue = editorInstance.getValue();
      curTab.setValue(curTab._lastValue);
    }
  }

  disposeFormEditors();
  container.innerHTML = '';
  if (editorInstance) { editorInstance.dispose(); editorInstance = null; }

  const data = tabInfo.getValue();
  if (!data) return;

  const readonly = !tabInfo.setValue;
  const markDirty = () => {
    if (readonly) return;
    // First-change backup (save original before modification)
    if (!tabMgr.dirtyFields.has(tabInfo.id)) {
      createBackup(tabInfo.id, data);
    }
    tabInfo.setValue(data);
    tabMgr.dirtyFields.add(tabInfo.id);
    tabMgr.renderTabs();
  };

  // Build form HTML
  const form = document.createElement('div');
  form.className = 'form-editor';

  // Header
  const header = document.createElement('div');
  header.className = 'form-editor-header';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = `📚 로어북: ${data.comment || tabInfo.label}`;
  header.appendChild(headerTitle);
  if (readonly) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:10px;color:var(--accent);margin-left:8px;';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  // Body
  const body = document.createElement('div');
  body.className = 'form-editor-body';

  // Helper: create text input row
  function addTextRow(labelText, field) {
    const row = document.createElement('div');
    row.className = 'form-row';
    const lbl = document.createElement('span');
    lbl.className = 'form-label';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.className = 'form-input';
    input.type = 'text';
    input.value = data[field] || '';
    if (readonly) { input.readOnly = true; } else {
      input.addEventListener('input', () => {
        data[field] = input.value;
        markDirty();
      });
    }
    row.appendChild(lbl);
    row.appendChild(input);
    body.appendChild(row);
    return input;
  }

  // Helper: create number input
  function addNumberRow(labelText, field) {
    const row = document.createElement('div');
    row.className = 'form-row';
    const lbl = document.createElement('span');
    lbl.className = 'form-label';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.className = 'form-input form-number';
    input.type = 'number';
    input.value = data[field] ?? 100;
    if (readonly) { input.readOnly = true; } else {
      input.addEventListener('input', () => {
        data[field] = parseInt(input.value, 10) || 0;
        markDirty();
      });
    }
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  addTextRow('이름', 'comment');

  // Folder dropdown (show folder names, not UUIDs)
  const folderRow = document.createElement('div');
  folderRow.className = 'form-row';
  const folderLbl = document.createElement('span');
  folderLbl.className = 'form-label';
  folderLbl.textContent = '폴더';
  const folderSelect = document.createElement('select');
  folderSelect.className = 'form-select';
  folderSelect.style.flex = '1';
  if (readonly) folderSelect.disabled = true;

  // Build folder options from lorebook (use ref source if readonly)
  const loreSource = tabInfo._refLorebook || (fileData ? fileData.lorebook : []) || [];
  const folderEntries = loreSource
    .map((e, i) => ({ entry: e, index: i }))
    .filter(f => f.entry.mode === 'folder');

  // "(없음)" = root
  const optNone = document.createElement('option');
  optNone.value = '';
  optNone.textContent = '(없음)';
  folderSelect.appendChild(optNone);

  // "+ 새 폴더 추가" (바로 아래)
  const optNew = document.createElement('option');
  optNew.value = '__new__';
  optNew.textContent = '+ 새 폴더 추가';
  folderSelect.appendChild(optNew);

  // Existing folders
  for (const f of folderEntries) {
    const opt = document.createElement('option');
    const folderId = `folder:${f.entry.key || f.index}`;
    opt.value = folderId;
    opt.textContent = f.entry.comment || folderId;
    folderSelect.appendChild(opt);
  }

  // Select current value (match by ID or find by comment)
  if (data.folder) {
    let matched = false;
    for (const opt of folderSelect.options) {
      if (opt.value === data.folder) { opt.selected = true; matched = true; break; }
    }
    if (!matched) {
      // Try matching by stripping prefix or by comment
      for (const f of folderEntries) {
        const folderId = `folder:${f.entry.key || f.index}`;
        if (data.folder === folderId || data.folder === f.entry.key || data.folder === f.entry.comment) {
          for (const opt of folderSelect.options) {
            if (opt.value === folderId) { opt.selected = true; matched = true; break; }
          }
          if (matched) break;
        }
      }
    }
  }

  folderSelect.addEventListener('change', async () => {
    if (folderSelect.value === '__new__') {
      const name = await showPrompt('새 폴더 이름을 입력하세요', '새 폴더');
      if (!name) {
        // Revert to previous selection
        folderSelect.value = data.folder || '';
        return;
      }
      const folderId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const newFolder = {
        key: folderId, content: '', comment: name, mode: 'folder',
        insertorder: 100, alwaysActive: false, forceActivation: false,
        selective: false, secondkey: '', constant: false,
        order: fileData.lorebook.length, folder: ''
      };
      fileData.lorebook.push(newFolder);
      // Add new option before the "+ 새 폴더" option
      const newOpt = document.createElement('option');
      newOpt.value = `folder:${folderId}`;
      newOpt.textContent = name;
      folderSelect.insertBefore(newOpt, optNew);
      folderSelect.value = `folder:${folderId}`;
      data.folder = `folder:${folderId}`;
      markDirty();
      buildSidebar();
    } else {
      data.folder = folderSelect.value;
      markDirty();
    }
  });

  folderRow.appendChild(folderLbl);
  folderRow.appendChild(folderSelect);
  body.appendChild(folderRow);

  addTextRow('활성화 키', 'key');
  addTextRow('멀티플 키', 'secondkey');

  // Insert order row
  const orderRow = document.createElement('div');
  orderRow.className = 'form-row';
  const orderLbl = document.createElement('span');
  orderLbl.className = 'form-label';
  orderLbl.textContent = '배치 순서';
  const orderInput = document.createElement('input');
  orderInput.className = 'form-input form-number';
  orderInput.type = 'number';
  orderInput.value = data.insertorder ?? 100;
  if (readonly) { orderInput.readOnly = true; } else {
    orderInput.addEventListener('input', () => {
      data.insertorder = parseInt(orderInput.value, 10) || 0;
      markDirty();
    });
  }
  orderRow.appendChild(orderLbl);
  orderRow.appendChild(orderInput);
  body.appendChild(orderRow);

  // Checkboxes row
  const checks = document.createElement('div');
  checks.className = 'form-checks';

  function addCheck(labelText, field) {
    const item = document.createElement('label');
    item.className = 'form-check-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!data[field];
    if (readonly) { cb.disabled = true; } else {
      cb.addEventListener('change', () => {
        data[field] = cb.checked;
        markDirty();
      });
    }
    item.appendChild(cb);
    item.appendChild(document.createTextNode(labelText));
    checks.appendChild(item);
  }

  addCheck('언제나 활성화', 'alwaysActive');
  addCheck('강제 활성화', 'forceActivation');
  addCheck('선택적', 'selective');
  body.appendChild(checks);

  // Content label
  const contentLabel = document.createElement('div');
  contentLabel.className = 'form-section-label';
  contentLabel.textContent = '프롬프트 (content)';
  body.appendChild(contentLabel);

  // Mini Monaco for content
  const monacoContainer = document.createElement('div');
  monacoContainer.className = 'form-monaco form-monaco-lore';
  body.appendChild(monacoContainer);

  form.appendChild(header);
  form.appendChild(body);
  container.appendChild(form);

  // Create mini Monaco after DOM insertion
  setTimeout(() => {
    const ed = createMiniMonaco(monacoContainer, data.content || '', 'plaintext', readonly ? null : (val) => {
      data.content = val;
      markDirty();
    });
    if (ed && readonly) ed.updateOptions({ readOnly: true });
  }, 10);
}

function showRegexEditor(tabInfo) {
  const container = document.getElementById('editor-container');

  // Save current Monaco state
  if (editorInstance && tabMgr.activeTabId !== tabInfo.id) {
    const curTab = tabMgr.openTabs.find(t => t.id === tabMgr.activeTabId);
    if (curTab && !FORM_TAB_TYPES.has(curTab.language) && curTab.setValue) {
      curTab._lastValue = editorInstance.getValue();
      curTab.setValue(curTab._lastValue);
    }
  }

  disposeFormEditors();
  container.innerHTML = '';
  if (editorInstance) { editorInstance.dispose(); editorInstance = null; }

  const data = tabInfo.getValue();
  if (!data) return;

  const readonly = !tabInfo.setValue;
  const markDirty = () => {
    if (readonly) return;
    // First-change backup (save original before modification)
    if (!tabMgr.dirtyFields.has(tabInfo.id)) {
      createBackup(tabInfo.id, data);
    }
    tabInfo.setValue(data);
    tabMgr.dirtyFields.add(tabInfo.id);
    tabMgr.renderTabs();
  };

  // Build form
  const form = document.createElement('div');
  form.className = 'form-editor';

  // Header
  const header = document.createElement('div');
  header.className = 'form-editor-header';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = `⚡ 정규식: ${data.comment || tabInfo.label}`;
  header.appendChild(headerTitle);
  if (readonly) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:10px;color:var(--accent);margin-left:8px;';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  // Toggle (ableFlag)
  const toggle = document.createElement('div');
  toggle.className = 'form-toggle' + (data.ableFlag !== false ? ' active' : '');
  toggle.title = '활성화 토글';
  if (!readonly) {
    toggle.addEventListener('click', () => {
      data.ableFlag = !toggle.classList.contains('active');
      toggle.classList.toggle('active');
      markDirty();
    });
  }
  header.appendChild(toggle);

  // Body
  const body = document.createElement('div');
  body.className = 'form-editor-body';

  // Name
  const nameRow = document.createElement('div');
  nameRow.className = 'form-row';
  const nameLbl = document.createElement('span');
  nameLbl.className = 'form-label';
  nameLbl.textContent = '이름';
  const nameInput = document.createElement('input');
  nameInput.className = 'form-input';
  nameInput.type = 'text';
  nameInput.value = data.comment || '';
  if (readonly) { nameInput.readOnly = true; } else {
    nameInput.addEventListener('input', () => {
      data.comment = nameInput.value;
      markDirty();
    });
  }
  nameRow.appendChild(nameLbl);
  nameRow.appendChild(nameInput);
  body.appendChild(nameRow);

  // Modification Type
  const typeRow = document.createElement('div');
  typeRow.className = 'form-row';
  const typeLbl = document.createElement('span');
  typeLbl.className = 'form-label';
  typeLbl.textContent = 'Type';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'form-select';
  if (readonly) typeSelect.disabled = true;
  const types = [
    { value: 'editInput', label: '입력문 수정' },
    { value: 'editOutput', label: '출력문 수정' },
    { value: 'editRequest', label: '리퀘스트 데이터 수정' },
    { value: 'editDisplay', label: '디스플레이 수정' },
    { value: 'editTranslation', label: '번역문 수정' },
    { value: 'disabled', label: '비활성화됨' },
  ];
  for (const t of types) {
    const opt = document.createElement('option');
    opt.value = t.value;
    opt.textContent = t.label;
    if (data.type === t.value) opt.selected = true;
    typeSelect.appendChild(opt);
  }
  if (!readonly) {
    typeSelect.addEventListener('change', () => {
      data.type = typeSelect.value;
      markDirty();
    });
  }
  typeRow.appendChild(typeLbl);
  typeRow.appendChild(typeSelect);
  body.appendChild(typeRow);

  // Find (in) label + mini Monaco
  const findLabel = document.createElement('div');
  findLabel.className = 'form-section-label';
  findLabel.textContent = 'Find (in)';
  body.appendChild(findLabel);

  const findContainer = document.createElement('div');
  findContainer.className = 'form-monaco form-monaco-regex';
  body.appendChild(findContainer);

  // Replace (out) label + mini Monaco (resizable)
  const replaceLabel = document.createElement('div');
  replaceLabel.className = 'form-section-label';
  replaceLabel.textContent = 'Replace (out)';
  body.appendChild(replaceLabel);

  const replaceContainer = document.createElement('div');
  replaceContainer.className = 'form-monaco form-monaco-regex form-monaco-resizable';
  body.appendChild(replaceContainer);

  // Resize handle for replace out
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'form-monaco-resize-handle';
  body.appendChild(resizeHandle);

  // === FLAGS PANEL ===
  const flagsPanel = document.createElement('div');
  flagsPanel.className = 'regex-flags-panel';

  // Parse current flag string
  const flagStr = data.flag || '';
  const normalFlags = [
    { key: 'g', label: 'Global (g)' },
    { key: 'i', label: 'Case Insensitive (i)' },
    { key: 'm', label: 'Multi Line (m)' },
    { key: 'u', label: 'Unicode (u)' },
    { key: 's', label: 'Dot All (s)' },
  ];
  const specialFlags = [
    { key: 'T', label: 'Move Top' },
    { key: 'B', label: 'Move Bottom' },
    { key: 'R', label: 'Repeat Back' },
    { key: 'C', label: 'IN CBS Parsing' },
    { key: 'N', label: 'No Newline Suffix' },
  ];

  // Track active flags
  const activeFlags = new Set(flagStr.split(''));
  const knownKeys = new Set([...normalFlags.map(f => f.key), ...specialFlags.map(f => f.key)]);
  const customChars = flagStr.split('').filter(c => !knownKeys.has(c)).join('');
  // Determine if custom flags section should be open
  // Default closed unless there are non-default flags (more than just 'g') or custom chars
  const nonDefaultFlags = [...activeFlags].filter(f => f !== 'g');
  const hasAnyFlag = nonDefaultFlags.length > 0 || customChars.length > 0;

  // Custom flag text input (declared early for rebuildFlagString)
  const customFlagInput = document.createElement('input');
  customFlagInput.className = 'form-input';
  customFlagInput.type = 'text';
  customFlagInput.placeholder = '직접 입력...';
  customFlagInput.value = customChars;
  customFlagInput.style.cssText = 'flex:1;margin-left:8px;';

  function rebuildFlagString() {
    let result = '';
    for (const f of normalFlags) { if (activeFlags.has(f.key)) result += f.key; }
    for (const f of specialFlags) { if (activeFlags.has(f.key)) result += f.key; }
    if (customFlagInput.value) result += customFlagInput.value;
    data.flag = result;
    markDirty();
  }

  // Toggle button: "커스텀 플래그" — controls visibility of flag sections
  const flagsToggleBtn = document.createElement('button');
  flagsToggleBtn.className = 'regex-flags-toggle-btn' + (hasAnyFlag ? ' active' : '');
  flagsToggleBtn.innerHTML = `<span class="toggle-indicator">${hasAnyFlag ? '▼' : '▶'}</span> 커스텀 플래그`;
  flagsPanel.appendChild(flagsToggleBtn);

  // Flag content wrapper (hidden by default, shown when toggle ON)
  const flagsContent = document.createElement('div');
  flagsContent.style.display = hasAnyFlag ? '' : 'none';

  // Normal Flag section
  const normalLabel = document.createElement('div');
  normalLabel.className = 'regex-flags-title';
  normalLabel.textContent = 'Normal Flag';
  flagsContent.appendChild(normalLabel);

  const normalGrid = document.createElement('div');
  normalGrid.className = 'regex-flags-grid';
  for (const f of normalFlags) {
    const btn = document.createElement('button');
    btn.className = 'regex-flag-btn' + (activeFlags.has(f.key) ? ' active' : '');
    btn.textContent = f.label;
    if (readonly) { btn.disabled = true; } else {
      btn.addEventListener('click', () => {
        if (activeFlags.has(f.key)) activeFlags.delete(f.key);
        else activeFlags.add(f.key);
        btn.classList.toggle('active');
        rebuildFlagString();
      });
    }
    normalGrid.appendChild(btn);
  }
  flagsContent.appendChild(normalGrid);

  // Special Flag (Other Flag) section
  const specialLabel = document.createElement('div');
  specialLabel.className = 'regex-flags-title';
  specialLabel.textContent = 'Other Flag';
  flagsContent.appendChild(specialLabel);

  const specialGrid = document.createElement('div');
  specialGrid.className = 'regex-flags-grid';
  for (const f of specialFlags) {
    const btn = document.createElement('button');
    btn.className = 'regex-flag-btn' + (activeFlags.has(f.key) ? ' active' : '');
    btn.textContent = f.label;
    if (readonly) { btn.disabled = true; } else {
      btn.addEventListener('click', () => {
        if (activeFlags.has(f.key)) activeFlags.delete(f.key);
        else activeFlags.add(f.key);
        btn.classList.toggle('active');
        rebuildFlagString();
      });
    }
    specialGrid.appendChild(btn);
  }
  flagsContent.appendChild(specialGrid);

  // Order Flag
  const orderLabel = document.createElement('div');
  orderLabel.className = 'regex-flags-title';
  orderLabel.textContent = 'Order Flag';
  flagsContent.appendChild(orderLabel);

  const orderInput = document.createElement('input');
  orderInput.className = 'form-input form-number';
  orderInput.type = 'number';
  orderInput.value = data.replaceOrder ?? 0;
  orderInput.style.width = '100%';
  if (readonly) { orderInput.readOnly = true; } else {
    orderInput.addEventListener('input', () => {
      data.replaceOrder = parseInt(orderInput.value, 10) || 0;
      markDirty();
    });
  }
  flagsContent.appendChild(orderInput);

  // Custom Flag text row
  const customRow = document.createElement('div');
  customRow.className = 'regex-custom-flag-row';
  const customFlagLabel = document.createElement('span');
  customFlagLabel.textContent = 'Custom';
  customFlagLabel.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-primary);';
  if (readonly) { customFlagInput.readOnly = true; } else {
    customFlagInput.addEventListener('input', () => rebuildFlagString());
  }
  customRow.appendChild(customFlagLabel);
  customRow.appendChild(customFlagInput);
  flagsContent.appendChild(customRow);

  flagsPanel.appendChild(flagsContent);

  // Toggle button click handler
  flagsToggleBtn.addEventListener('click', () => {
    const isActive = flagsToggleBtn.classList.toggle('active');
    flagsContent.style.display = isActive ? '' : 'none';
    flagsToggleBtn.querySelector('.toggle-indicator').textContent = isActive ? '▼' : '▶';
  });

  body.appendChild(flagsPanel);

  form.appendChild(header);
  form.appendChild(body);
  container.appendChild(form);

  // Drag-to-resize for replace out
  let startY = 0;
  let startH = 0;
  const onResizeMove = (e) => {
    const dy = e.clientY - startY;
    replaceContainer.style.height = Math.max(40, startH + dy) + 'px';
    for (const fe of formEditors) {
      if (fe && typeof fe.getDomNode === 'function' && replaceContainer.contains(fe.getDomNode())) {
        fe.layout();
      }
    }
  };
  const onResizeUp = () => {
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeUp);
  };
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startH = replaceContainer.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeUp);
  });

  // Create mini Monacos after DOM insertion
  setTimeout(() => {
    const edFind = createMiniMonaco(findContainer, data.in || '', 'plaintext', readonly ? null : (val) => {
      data.in = val;
      markDirty();
    });
    const edReplace = createMiniMonaco(replaceContainer, data.out || '', 'plaintext', readonly ? null : (val) => {
      data.out = val;
      markDirty();
    });
    if (readonly) {
      if (edFind) edFind.updateOptions({ readOnly: true });
      if (edReplace) edReplace.updateOptions({ readOnly: true });
    }
  }, 10);
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
async function handleNew() {
  const data = await window.tokiAPI.newFile();
  if (!data) return;
  fileData = data;
  tabMgr.reset();
  if (editorInstance) { editorInstance.dispose(); editorInstance = null; }

  document.getElementById('file-label').textContent = 'New Character';
  document.getElementById('editor-container').innerHTML =
    '<div class="empty-state">항목을 선택하세요</div>';
  document.getElementById('editor-tabs').innerHTML = '';

  buildSidebar();
  setStatus('새 파일 생성됨');
}

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

function stringifyStringArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : [], null, 2);
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

async function handleOpen() {
  try {
    setStatus('파일 열기 중...');
    const data = await window.tokiAPI.openFile();
    if (!data) { setStatus('준비'); return; }
    fileData = data;
    tabMgr.reset();
    if (editorInstance) { editorInstance.dispose(); editorInstance = null; }

    document.getElementById('file-label').textContent = `${data.name || 'Untitled'}`;
    document.getElementById('editor-container').innerHTML =
      '<div class="empty-state">항목을 선택하세요</div>';
    document.getElementById('editor-tabs').innerHTML = '';

    buildSidebar();
    setStatus(`파일 열림: ${data.name}`);
  } catch (err) {
    console.error('[renderer] handleOpen error:', err);
    setStatus(`열기 실패: ${err.message}`);
  }
}

async function handleSave() {
  if (!fileData) return;
  // Sync current editor content (skip form/image tabs)
  if (editorInstance && tabMgr.activeTabId) {
    const curTab = tabMgr.openTabs.find(t => t.id === tabMgr.activeTabId);
    if (curTab && !FORM_TAB_TYPES.has(curTab.language) && curTab.setValue) {
      curTab.setValue(editorInstance.getValue());
    }
  }
  const result = await window.tokiAPI.saveFile(fileData);
  if (result.success) {
    tabMgr.dirtyFields.clear();
    tabMgr.renderTabs();
    setStatus('저장 완료');
    // Cleanup autosave temp file after successful save
    window.tokiAPI.cleanupAutosave(autosaveDir || undefined);
  } else {
    setStatus(`저장 실패: ${result.error}`);
  }
}

async function handleSaveAs() {
  if (!fileData) return;
  if (editorInstance && tabMgr.activeTabId) {
    const curTab = tabMgr.openTabs.find(t => t.id === tabMgr.activeTabId);
    if (curTab && !FORM_TAB_TYPES.has(curTab.language) && curTab.setValue) {
      curTab.setValue(editorInstance.getValue());
    }
  }
  const result = await window.tokiAPI.saveFileAs(fileData);
  if (result.success) {
    tabMgr.dirtyFields.clear();
    tabMgr.renderTabs();
    setStatus(`저장 완료: ${result.path}`);
  } else {
    setStatus(`저장 취소`);
  }
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
  applyDarkMode(darkMode, { editorInstance, formEditors });

  // Update TokiTalk title
  const titleEl = document.querySelector('.momo-title');
  if (titleEl) titleEl.textContent = darkMode ? 'ArisTalk' : 'TokiTalk';

  // Update status text with character dialogue
  const statusText = document.getElementById('toki-status-text');
  if (statusText) {
    if (tokiActive) {
      statusText.textContent = darkMode ? randomLine(RISU_WORKING_LINES) : randomLine(TOKI_WORKING_LINES);
    } else {
      statusText.textContent = darkMode ? randomLine(RISU_IDLE_LINES) : randomLine(TOKI_IDLE_LINES);
    }
  }

  // Switch avatar image
  if (tokiImg) {
    if (tokiActive) {
      if (darkMode) loadTokiImage(RISU_DANCING);
      else loadTokiImage(TOKI_DANCING);
    } else {
      if (darkMode) loadTokiImage(RISU_IDLE);
      else loadTokiImage(TOKI_IDLE);
    }
  }

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

// ==================== Toki Avatar ====================
let tokiActive = false;

// Echo filter: ignore terminal data within 300ms of user input
let lastUserInputTime = 0;

// Character dialogue lines
const TOKI_IDLE_LINES = [
  '분부대로.',
  '완벽한 보좌를 약속드립니다.',
  '대기 중입니다.',
  '지시를 기다리겠습니다.',
];
const TOKI_WORKING_LINES = [
  '신속히 처리하겠습니다.',
  '...집중하고 있습니다.',
  '작업 진행 중입니다.',
  '완벽하게 수행하겠습니다.',
];
const RISU_IDLE_LINES = [
  '오늘은 어떤 모험을 떠나실 건가요?',
  '아리스, 대기 중입니다!',
  '선생님! 지시를!',
  '다음 퀘스트는 뭔가요?',
];
const RISU_WORKING_LINES = [
  '아리스, 전력으로 갑니다!',
  '마력 충전 중...!',
  '퀘스트 진행 중입니다!',
  '빛이여, 힘을 빌려줘...!',
];

function randomLine(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
let tokiImg = null;
let tokiCurrentSrc = TOKI_IDLE;

function initTokiAvatar() {
  const display = document.getElementById('toki-avatar-display');

  // Img directly displays everything (static PNG + animated GIF)
  tokiImg = document.createElement('img');
  tokiImg.id = 'toki-img-source';
  tokiImg.style.cssText = 'width:100%;height:auto;';
  display.appendChild(tokiImg);

  tokiImg.addEventListener('error', () => {
    console.error('[Toki] Image load error:', tokiCurrentSrc);
  });

  // Load saved idle image or default
  const savedIdleInit = readAppSettingsSnapshot().avatarIdle;
  if (savedIdleInit) {
    loadTokiImage(savedIdleInit.src);
  } else {
    loadTokiImage(darkMode ? RISU_IDLE : TOKI_IDLE);
  }

  // Set initial dialogue
  const initStatusText = document.getElementById('toki-status-text');
  if (initStatusText) {
    initStatusText.textContent = darkMode ? randomLine(RISU_IDLE_LINES) : randomLine(TOKI_IDLE_LINES);
  }

  // Right-click to switch avatar
  const avatar = document.getElementById('toki-avatar');
  avatar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showAvatarPicker();
  });
}

function showAvatarPicker() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
  const popup = document.createElement('div');
  popup.className = 'settings-popup';
  popup.style.cssText += 'width:520px;max-width:90vw;';

  const header = document.createElement('div');
  header.className = 'help-popup-header';
  header.innerHTML = '<span>아바타 이미지 선택</span>';
  const closeBtn = document.createElement('span');
  closeBtn.className = 'help-popup-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'help-popup-body';
  body.style.cssText = 'padding:12px;';

  // Built-in images
  const images = [
    { src: TOKI_IDLE, label: '토키 (기본)' },
    { src: TOKI_CUTE, label: '토키 (cute)' },
    { src: TOKI_DANCING, label: '토키 (dancing)' },
    { src: RISU_IDLE, label: '아리스 (기본)' },
    { src: RISU_DANCING, label: '아리스 (dancing)' },
  ];

  const { avatarIdle: savedIdle, avatarWorking: savedWork } = readAppSettingsSnapshot();

  // Helper: create image card
  function makeCard(img, currentSrc, onClick) {
    const card = document.createElement('div');
    card.style.cssText = 'border:2px solid var(--border-color);border-radius:8px;padding:6px;cursor:pointer;text-align:center;transition:border-color 0.2s;';
    const preview = document.createElement('img');
    preview.src = img.src;
    preview.style.cssText = 'width:60px;height:60px;object-fit:contain;display:block;margin:0 auto 4px;';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;';
    lbl.textContent = img.label;
    card.appendChild(preview);
    card.appendChild(lbl);
    if (currentSrc === img.src) card.style.borderColor = 'var(--accent)';
    card.addEventListener('click', onClick);
    card.addEventListener('mouseenter', () => card.style.borderColor = 'var(--accent)');
    card.addEventListener('mouseleave', () => { if (currentSrc !== img.src) card.style.borderColor = 'var(--border-color)'; });
    return card;
  }

  // Helper: "추가" card (file picker)
  function makeAddCard(onPick) {
    const card = document.createElement('div');
    card.style.cssText = 'border:2px dashed var(--border-color);border-radius:8px;padding:6px;cursor:pointer;text-align:center;transition:border-color 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80px;';
    card.innerHTML = '<div style="font-size:24px;color:var(--text-secondary);">+</div><div style="font-size:10px;color:var(--text-secondary);">이미지 추가</div>';
    card.addEventListener('click', onPick);
    card.addEventListener('mouseenter', () => card.style.borderColor = 'var(--accent)');
    card.addEventListener('mouseleave', () => card.style.borderColor = 'var(--border-color)');
    return card;
  }

  // === Section: 대기 이미지 ===
  const idleLabel = document.createElement('div');
  idleLabel.style.cssText = 'font-weight:700;font-size:12px;margin-bottom:8px;color:var(--text-primary);';
  idleLabel.textContent = '대기 이미지';
  body.appendChild(idleLabel);

  const idleGrid = document.createElement('div');
  idleGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;';
  const idleSrc = savedIdle ? savedIdle.src : (tokiCurrentSrc || '');
  for (const img of images) {
    idleGrid.appendChild(makeCard(img, idleSrc, () => {
      writeIdleAvatarState({ src: img.src });
      if (!tokiActive) loadTokiImage(img.src);
      overlay.remove();
      setStatus(`대기 이미지: ${img.label}`);
    }));
  }
  // Add custom image card
  idleGrid.appendChild(makeAddCard(async () => {
    const dataUri = await window.tokiAPI.pickBgImage();
    if (!dataUri) return;
    writeIdleAvatarState({ src: dataUri });
    if (!tokiActive) loadTokiImage(dataUri);
    overlay.remove();
    setStatus('대기 이미지: 커스텀');
  }));
  body.appendChild(idleGrid);

  // === Section: 작업중 이미지 ===
  const workLabel = document.createElement('div');
  workLabel.style.cssText = 'font-weight:700;font-size:12px;margin-bottom:8px;color:var(--text-primary);';
  workLabel.textContent = '작업중 이미지';
  body.appendChild(workLabel);

  const workGrid = document.createElement('div');
  workGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;';
  const workSrc = savedWork ? savedWork.src : '';
  for (const img of images) {
    workGrid.appendChild(makeCard(img, workSrc, () => {
      writeWorkingAvatarState({ src: img.src });
      if (tokiActive) loadTokiImage(img.src);
      overlay.remove();
      setStatus(`작업중 이미지: ${img.label}`);
    }));
  }
  // Add custom image card
  workGrid.appendChild(makeAddCard(async () => {
    const dataUri = await window.tokiAPI.pickBgImage();
    if (!dataUri) return;
    writeWorkingAvatarState({ src: dataUri });
    if (tokiActive) loadTokiImage(dataUri);
    overlay.remove();
    setStatus('작업중 이미지: 커스텀');
  }));
  body.appendChild(workGrid);

  popup.appendChild(header);
  popup.appendChild(body);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function loadTokiImage(src) {
  const prevSrc = tokiCurrentSrc;
  tokiCurrentSrc = src;

  // If same src is already loaded, do nothing
  if (prevSrc === src && tokiImg.complete && tokiImg.naturalWidth > 0) return;

  loadAvatarImage(src, tokiImg);
}

// Cached avatar DOM elements (populated on first call)
let _avatarEl, _statusEl, _statusIconEl, _statusTextEl;
function setTokiActive(active) {
  if (!_avatarEl) {
    _avatarEl = document.getElementById('toki-avatar');
    _statusEl = document.getElementById('toki-status');
    _statusIconEl = document.getElementById('toki-status-icon');
    _statusTextEl = document.getElementById('toki-status-text');
  }
  const avatar = _avatarEl;
  const statusEl = _statusEl;
  const statusIcon = _statusIconEl;
  const statusText = _statusTextEl;

  if (active && !tokiActive) {
    tokiActive = true;
    avatar.classList.add('active');
    statusEl.classList.add('working');
    statusIcon.textContent = '✨';
    // Read saved working image from localStorage, fallback to defaults
    const savedWork = readAppSettingsSnapshot().avatarWorking;
    if (savedWork) {
      loadTokiImage(savedWork.src);
    } else if (darkMode) {
      loadTokiImage(RISU_DANCING);
    } else {
      loadTokiImage(TOKI_DANCING);
    }
    statusText.textContent = darkMode ? randomLine(RISU_WORKING_LINES) : randomLine(TOKI_WORKING_LINES);
  } else if (!active && tokiActive) {
    tokiActive = false;
    avatar.classList.remove('active');
    statusEl.classList.remove('working');
    statusIcon.textContent = '💤';
    // Read saved idle image from localStorage, fallback to defaults
    const savedIdle = readAppSettingsSnapshot().avatarIdle;
    if (savedIdle) {
      loadTokiImage(savedIdle.src);
    } else if (darkMode) {
      loadTokiImage(RISU_IDLE);
    } else {
      loadTokiImage(TOKI_IDLE);
    }
    statusText.textContent = darkMode ? randomLine(RISU_IDLE_LINES) : randomLine(TOKI_IDLE_LINES);
  }
}

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

  const charData = {
    name: fileData.name || 'Character',
    description: fileData.description || '',
    firstMessage: fileData.firstMessage || '',
    globalNote: fileData.globalNote || '',
    css: fileData.css || '',
    defaultVariables: fileData.defaultVariables || '',
    lua: fileData.lua || '',
    lorebook: fileData.lorebook || [],
    regex: fileData.regex || [],
  };

  // Load all assets (name → data URI)
  let assetMapForEngine = {};
  try {
    const assetResult = await window.tokiAPI.getAllAssetsMap();
    assetMapForEngine = assetResult.assets || assetResult;
    const d = assetResult.debug || {};
    // (debug log removed)
  } catch (error) {
    reportRuntimeError({
      context: '프리뷰 에셋 불러오기 실패',
      error,
      logPrefix: '[Preview]',
      setStatus
    });
  }

  await ensureWasmoon();

  let debugOpen = false;
  let activeDebugTab = 'variables';

  // ══════════════ Build UI ══════════════

  const overlay = document.createElement('div');
  overlay.className = 'preview-overlay';

  const panel = document.createElement('div');
  panel.className = 'preview-panel';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'preview-header';
  const headerLeft = document.createElement('span');
  headerLeft.textContent = `${charData.name} — 프리뷰`;
  const headerBtns = document.createElement('div');
  headerBtns.style.cssText = 'display:flex;gap:4px;align-items:center;';

  const popoutPreviewBtn = document.createElement('button');
  popoutPreviewBtn.textContent = '↗';
  popoutPreviewBtn.title = '팝아웃 (별도 창)';

  const resetBtn = document.createElement('button');
  resetBtn.textContent = '↻';
  resetBtn.title = '초기화';

  const debugBtn = document.createElement('button');
  debugBtn.textContent = '🔧';
  debugBtn.title = '디버그 패널';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';

  headerBtns.appendChild(popoutPreviewBtn);
  headerBtns.appendChild(resetBtn);
  headerBtns.appendChild(debugBtn);
  headerBtns.appendChild(closeBtn);
  header.appendChild(headerLeft);
  header.appendChild(headerBtns);

  // ── Chat iframe ──
  const chatFrame = document.createElement('iframe');
  chatFrame.className = 'preview-chat-frame';

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
      debugTabs.querySelectorAll('.preview-debug-tab').forEach(t => t.classList.remove('active'));
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
  let debugDragOffset = { x: 0, y: 0 };

  const debugDetachBtn = document.createElement('button');
  debugDetachBtn.className = 'preview-debug-copy-btn';
  debugDetachBtn.textContent = '⇱ 분리';
  debugDetachBtn.title = '디버그 패널 분리 (플로팅)';
  debugDetachBtn.addEventListener('click', () => {
    if (debugDetached) dockDebugPanel();
    else detachDebugPanel();
  });
  debugTabs.appendChild(debugDetachBtn);

  function detachDebugPanel() {
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

  function dockDebugPanel() {
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

  function onDebugDragStart(e) {
    if (e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    const rect = debugDrawer.getBoundingClientRect();
    debugDragOffset.x = e.clientX - rect.left;
    debugDragOffset.y = e.clientY - rect.top;
    debugDrawer.style.transform = '';
    debugTabs.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onDebugDragMove);
    document.addEventListener('mouseup', onDebugDragEnd);
  }

  function onDebugDragMove(e) {
    debugDrawer.style.left = (e.clientX - debugDragOffset.x) + 'px';
    debugDrawer.style.top = (e.clientY - debugDragOffset.y) + 'px';
  }

  function onDebugDragEnd() {
    debugTabs.style.cursor = 'grab';
    document.removeEventListener('mousemove', onDebugDragMove);
    document.removeEventListener('mouseup', onDebugDragEnd);
  }

  const debugContent = document.createElement('div');
  debugContent.className = 'preview-debug-content';
  debugDrawer.appendChild(debugTabs);
  debugDrawer.appendChild(debugContent);

  // ── Debug resizer (between input bar and debug drawer) ──
  const debugResizer = document.createElement('div');
  debugResizer.className = 'preview-debug-resizer';
  debugResizer.style.display = 'none';
  let debugResizing = false;
  debugResizer.addEventListener('mousedown', (e) => {
    if (debugDetached) return;
    e.preventDefault();
    debugResizing = true;
    const startY = e.clientY;
    const startH = debugDrawer.getBoundingClientRect().height;
    const onMove = (ev) => {
      const delta = startY - ev.clientY;
      const newH = Math.max(80, Math.min(startH + delta, panel.getBoundingClientRect().height - 200));
      debugDrawer.style.height = newH + 'px';
    };
    const onUp = () => {
      debugResizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  const session = createPreviewSession({
    engine: PreviewEngine,
    charData,
    chatFrame,
    windowTarget: window,
    assetMap: assetMapForEngine,
    wrapPlainCss: true,
    logPrefix: '[Preview]',
    onError: (message, error) => {
      reportRuntimeError({
        context: message,
        error,
        logPrefix: '[Preview]',
        setStatus
      });
    },
    onStateChange: () => {
      if (debugOpen) updateDebugPanel();
    }
  });

  function updateDebugPanel() {
    const snapshot = session.getSnapshot();
    debugContent.innerHTML = renderPreviewDebugHtml({
      activeTab: activeDebugTab,
      snapshot,
      luaInitButtonId: 'main-preview-lua-init'
    });

    if (!snapshot.luaInitialized) {
      const button = debugContent.querySelector('#main-preview-lua-init');
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

  function closePreview() {
    session.dispose();
    if (debugDetached) debugDrawer.remove();
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  popoutPreviewBtn.addEventListener('click', async () => {
    const requestId = await window.tokiAPI.setPreviewPopoutData({
      name: charData.name,
      description: charData.description,
      firstMessage: charData.firstMessage,
      defaultVariables: charData.defaultVariables,
      lua: charData.lua,
      css: charData.css,
      lorebook: charData.lorebook,
      regex: charData.regex,
      assets: null
    });
    await window.tokiAPI.popoutPanel('preview', requestId);
    closePreview();
  });

  resetBtn.addEventListener('click', async () => {
    await session.reset();
    if (debugOpen) updateDebugPanel();
  });

  closeBtn.addEventListener('click', closePreview);

  sendBtn.addEventListener('click', () => {
    void session.handleSend(chatInput);
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void session.handleSend(chatInput);
    }
  });

  debugCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(buildPreviewDebugClipboardText(session.getSnapshot())).then(() => {
      debugCopyBtn.textContent = '✅ 복사됨';
      setTimeout(() => { debugCopyBtn.textContent = '📋 복사'; }, 1500);
    });
  });

  debugBtn.addEventListener('click', () => {
    debugOpen = !debugOpen;
    debugDrawer.style.display = debugOpen ? 'flex' : 'none';
    debugResizer.style.display = debugOpen ? '' : 'none';
    if (debugOpen) updateDebugPanel();
  });

  // ── Assemble ──
  panel.appendChild(header);
  panel.appendChild(chatFrame);
  panel.appendChild(inputBar);
  panel.appendChild(debugResizer);
  panel.appendChild(debugDrawer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Initialize iframe after it's in the DOM
  requestAnimationFrame(async () => {
    await session.initialize();
  });

  // Escape to close
  const onKey = (e) => {
    if (e.key === 'Escape') {
      closePreview();
    }
  };
  document.addEventListener('keydown', onKey);
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

function openRefTabById(tabId) {
  // Check if tab already open
  const existing = tabMgr.openTabs.find(t => t.id === tabId);
  if (existing) {
    tabMgr.activeTabId = tabId;
    createOrSwitchEditor(existing);
    tabMgr.renderTabs();
    return;
  }

  // Parse: ref_{ri}_{field} or ref_{ri}_lb_{li} or ref_{ri}_rx_{xi}
  const parts = tabId.split('_');
  if (parts.length < 3) return;
  const ri = parseInt(parts[1], 10);
  if (ri < 0 || ri >= referenceFiles.length) return;
  const ref = referenceFiles[ri];
  const fieldPart = parts[2];

  if (fieldPart === 'lua') {
    tabMgr.openTab(tabId, `[참고] ${ref.fileName} - Lua`, 'lua', () => ref.data.lua, null);
  } else if (fieldPart === 'css') {
    tabMgr.openTab(tabId, `[참고] ${ref.fileName} - CSS`, 'css', () => ref.data.css, null);
  } else if (fieldPart === 'globalNote') {
    tabMgr.openTab(tabId, `[참고] ${ref.fileName} - 글로벌노트`, 'plaintext', () => ref.data.globalNote, null);
  } else if (fieldPart === 'firstMessage') {
    tabMgr.openTab(tabId, `[참고] ${ref.fileName} - 첫 메시지`, 'html', () => ref.data.firstMessage, null);
  } else if (fieldPart === 'triggerScripts') {
    tabMgr.openTab(tabId, `[참고] ${ref.fileName} - 트리거 스크립트`, 'json', () => ref.data.triggerScripts || '[]', null);
  } else if (fieldPart === 'alternateGreetings') {
    tabMgr.openTab(tabId, `[참고] ${ref.fileName} - 추가 첫 메시지`, 'json', () => stringifyStringArray(ref.data.alternateGreetings), null);
  } else if (fieldPart === 'groupOnlyGreetings') {
    tabMgr.openTab(tabId, `[참고] ${ref.fileName} - 그룹 첫 메시지`, 'json', () => stringifyStringArray(ref.data.groupOnlyGreetings), null);
  } else if (fieldPart === 'description') {
    tabMgr.openTab(tabId, `[참고] ${ref.fileName} - 설명`, 'plaintext', () => ref.data.description, null);
  } else if (fieldPart === 'lb' && parts.length >= 4) {
    const li = parseInt(parts[3], 10);
    if (ref.data.lorebook && ref.data.lorebook[li]) {
      const lbLabel = ref.data.lorebook[li].comment || ref.data.lorebook[li].key || `#${li}`;
      const tab = tabMgr.openTab(tabId, `[참고] ${ref.fileName} - ${lbLabel}`, '_loreform', () => ref.data.lorebook[li], null);
      if (tab) tab._refLorebook = ref.data.lorebook;
    }
  } else if (fieldPart === 'rx' && parts.length >= 4) {
    const xi = parseInt(parts[3], 10);
    if (ref.data.regex && ref.data.regex[xi]) {
      const rxLabel = ref.data.regex[xi].comment || `#${xi}`;
      tabMgr.openTab(tabId, `[참고] ${ref.fileName} - ${rxLabel}`, '_regexform', () => ref.data.regex[xi], null);
    }
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
  initTokiAvatar();
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
