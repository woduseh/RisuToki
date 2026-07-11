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
  createSectionHeader,
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
  handleAntigravityStart as _handleAntigravityStart,
} from '../lib/assistant-prompt';
import {
  addRecentItem,
  clearRecentItems,
  readAppSettingsSnapshot,
  readRecentItems,
  readStoredLayoutState,
  removeRecentItem,
  subscribeToAppSettings,
  writeAutosaveDir,
  writeAutosaveEnabled,
  writeAutosaveInterval,
  writeBgmEnabled,
  writeBgmPath,
  writeLayoutState,
  writeMcpApprovalMode,
  writeRpCustomText,
  writeRpMode,
} from '../lib/app-settings';
import type { McpApprovalMode, RecentItem, RecentSourceFormat, StoredLayoutState } from '../lib/app-settings';
import { initTokiAvatar as initTokiAvatarUi, setTokiActive } from '../lib/avatar-ui';
import { defineAppMonacoTheme } from '../lib/dark-mode';
import { showImageViewer as renderImageViewer } from '../lib/image-viewer';
import { handleTerminalDataForBgm, initBgm, isBgmEnabled, pauseBgm, setBgmEnabled, setBgmFilePath } from '../lib/bgm';
import { ensureBlueArchiveMonacoTheme, loadMonacoRuntime } from '../lib/monaco-loader';
import { createBufferedTerminalChatSession } from '../lib/chat-session';
import { feedBgBuffer, initChatMode as initChatModeUi, isChatMode, onChatData } from '../lib/chat-ui';
import { NON_MONACO_EDITOR_TAB_TYPES, requiresMonacoEditor, resolvePendingEditorTab } from '../lib/editor-activation';
import { createExternalTextTabState } from '../lib/external-text-tab';
import { collectDirtyEditorFields } from '../lib/editor-dirty-fields';
import { resolveCloseWindowAction } from '../lib/close-window-policy';
import { getFolderRef, resolveLorebookFolderRef } from '../lib/lorebook-folders';
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
import { showMarkdownPreview } from '../lib/markdown-preview';
import { reportRuntimeError } from '../lib/runtime-feedback';
import { ensureWasmoon } from '../lib/script-loader';
import {
  disposeFormEditors,
  getFormEditors,
  initFormEditor,
  showLoreEditor,
  showBooleanEditor,
  showModuleSettingsEditor,
  showToggleTemplateEditor,
  showTriggerEditor,
  showRisupEditor,
  showRisupPromptItemEditor,
  showRegexEditor,
} from '../lib/form-editor';
import type {
  BooleanFormTabInfo,
  FormTabInfo,
  ModuleSettingsFormTabInfo,
  RisupPromptItemTabInfo,
  ToggleFormTabInfo,
} from '../lib/form-editor';
import type { RisupFormTabInfo } from '../lib/risup-form-editor';
import {
  resetMcpConfirmAllowAll,
  showConfirm,
  showCloseConfirm,
  showMcpConfirm,
  showPrompt,
  showSessionRecoveryDialog,
} from '../lib/dialog';
import { showContextMenu } from '../lib/context-menu';
import type { ContextMenuItem } from '../lib/context-menu';
import { initPanelDragDrop as _initPanelDragDrop } from '../lib/panel-drag';
import { initializeTerminalUi, shouldTreatTerminalDataAsActivity, type TerminalUiHandle } from '../lib/terminal-ui';
import { TerminalSessionContext } from '../lib/terminal-session-context';
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
import { formatDocumentStats, summarizeDocumentStats } from '../lib/document-stats';
import { showHelpPopup } from '../lib/help-popup';
import { createSidebarActions } from '../lib/sidebar-actions';
import { initSidebarDnD, destroyAllSortables } from '../lib/sidebar-dnd';
import { initRightManagerPanel, renderRightManagerPanel } from '../lib/right-manager-panel';
import { initPromptManagerPanel, renderPromptManagerPanel } from '../lib/risup-prompt-manager-panel';
import {
  handleNew as _handleNew,
  handleOpen as _handleOpen,
  handleOpenPath as _handleOpenPath,
  handleSave as _handleSave,
  handleSaveAs as _handleSaveAs,
} from '../lib/file-actions';
import type { FileActionDeps } from '../lib/file-actions';
import { runStartupSessionRecovery } from './session-recovery-controller';
import {
  stringifyStringArray,
  buildRefsSidebar as _buildRefsSidebar,
  openRefTabById as _openRefTabById,
} from '../lib/sidebar-refs';
import {
  RISUP_FIELD_GROUPS,
  getVisibleRisupFieldGroups,
  getRisupFieldGroup,
  type RisupFieldGroupId,
} from '../lib/risup-fields';
import { parsePromptTemplate, type PromptItemModel } from '../lib/risup-prompt-model';
import { promptItemSummary } from '../lib/risup-prompt-editor';
import { getCharxInfoItems } from '../lib/charx-sidebar-fields';
import { collectHiddenFieldWarnings } from '../lib/mcp-field-access';
import { isTriggerScriptsLuaMode } from '../lib/trigger-script-model';
import { initKeyboard } from './keyboard-shortcuts';
import {
  changeTheme as _changeTheme,
  refreshThemeUi as _refreshThemeUi,
  updateCustomTheme as _updateCustomTheme,
  startAutosave,
  stopAutosave,
  showSettingsPopup as _showSettingsPopup,
  handleTerminalBg,
} from './settings-handlers';
import { getTheme, type CustomThemePalette, type ThemeId } from '../lib/theme-registry';
import {
  activateTriggerScriptsFormTab,
  applyTriggerScriptsControllerMcpUpdate,
  backupActiveTriggerScriptsRestoreDraft,
  openTriggerScriptsControllerTab,
  restoreTriggerScriptsControllerBackup,
} from './trigger-scripts-controller';
import { mergeLuaIntoTriggerScriptsText } from './trigger-script-utils';
import {
  backupActiveRisupRestoreDraft,
  findActiveRisupTab,
  getRisupSidebarBackupTargets,
  getRisupSidebarExtraItems,
  restoreRisupTabsControllerBackup,
} from './risup-tabs-controller';

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
  getDomNode(): HTMLElement | null;
  layout(dimension?: { width: number; height: number }): void;
  [key: string]: unknown;
}

let fileData: CharxData | null = null; // Current charx data
let currentProjectPath: string | null = null;
let editorInstance: MonacoEditorInstance | null = null; // Monaco editor instance
let monacoReady = false;
let monacoLoadTask: Promise<boolean> | null = null;
const PROJECT_RAW_SYNC_DELAY_MS = 700;
const projectRawSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const projectRawSyncState = new Map<string, 'syncing' | 'synced' | 'error'>();

// IME composition guard — skip DOM-heavy side-effects during CJK composition
let isComposing = false;
let pendingRenderTabs = false;

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
// Theme state. `darkMode` remains a derived legacy flag for existing branches.
let darkMode = settingsSnapshot.darkMode;
let themeId: ThemeId = settingsSnapshot.themeId;
let customTheme: CustomThemePalette | null = settingsSnapshot.customTheme;

// RP mode: 'off' | 'toki' | 'aris' | 'custom'
// Migrate old boolean value
let rpMode = settingsSnapshot.rpMode;
let rpCustomText = settingsSnapshot.rpCustomText;
let mcpApprovalMode: McpApprovalMode = settingsSnapshot.mcpApprovalMode;

// Autosave state
let autosaveEnabled = settingsSnapshot.autosaveEnabled;
let autosaveInterval = settingsSnapshot.autosaveInterval;
let autosaveDir = settingsSnapshot.autosaveDir; // empty = same as file
let documentSwitchInProgress = false;
let rendererOpenRequestInProgress = false;

function refreshRecentItems(): void {
  useAppStore().setRecentItems(readRecentItems());
}

function rememberRecentFile(path: string | undefined, sourceFormat?: string): void {
  if (!path) return;
  addRecentItem({
    kind: 'file',
    path,
    sourceFormat: sourceFormat as RecentSourceFormat | undefined,
  });
  refreshRecentItems();
}

function rememberRecentProject(projectPath: string | undefined): void {
  if (!projectPath) return;
  addRecentItem({ kind: 'project', path: projectPath });
  refreshRecentItems();
}

/** Sync imperative controller state → Pinia store for reactive UI */
function syncStoreState(): void {
  const store = useAppStore();
  store.setDarkMode(darkMode);
  store.setThemeId(themeId);
  store.setCustomTheme(customTheme);
  store.setRpMode(rpMode as RpMode);
  store.bgmEnabled = isBgmEnabled();
  store.setRecentItems(readRecentItems());
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

async function confirmDirtyTabClose(): Promise<boolean> {
  const decision = resolveCloseWindowAction({ choice: await showCloseConfirm() });
  if (decision.action === 'stay') {
    return false;
  }
  if (decision.action === 'save') {
    await handleSave();
    return tabMgr.dirtyFields.size === 0;
  }
  return true;
}

const tabMgr = new TabManager(
  'editor-tabs',
  {
    onActivateTab: (tab) => createOrSwitchEditor(tab),
    onDisposeFormEditors: () => disposeFormEditors(),
    onClearEditor: () => {
      document.getElementById('editor-container')!.innerHTML = '<div class="empty-state">항목을 선택하세요</div>';
      editorInstance = null;
    },
    isPanelPoppedOut: (panelId) => isPanelPoppedOut(panelId),
    onPopOutTab: (tabId) => popOutEditorPanel(tabId),
    isFormTabType: (language) => FORM_TAB_TYPES.has(language),
    onTabsRendered: () => updateDocumentStats(),
  },
  confirmDirtyTabClose,
);

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
  const result = await showMcpConfirm(title, message, mcpApprovalMode);
  window.tokiAPI.sendMcpConfirmResponse(id, result);
});

function getRendererDocumentFileType(data: Record<string, unknown>): 'charx' | 'risum' | 'risup' {
  return data._fileType === 'risum' || data._fileType === 'risup' ? data._fileType : 'charx';
}

window.tokiAPI.onMcpOpenFileRequest(async (id, request) => {
  if (rendererOpenRequestInProgress) {
    window.tokiAPI.sendMcpOpenFileResponse(id, {
      success: false,
      error: 'Another document switch is already in progress.',
      suggestion: '현재 열기 작업이 끝난 뒤 다시 시도하세요.',
    });
    return;
  }

  rendererOpenRequestInProgress = true;
  try {
    const opened = await _handleOpenPath(fileActionDeps, request.filePath, {
      onLoadStateChange: (loading) => {
        documentSwitchInProgress = loading;
      },
      saveCurrent: request.saveCurrent,
      targetLabel: request.targetLabel,
    });
    if (!opened) {
      window.tokiAPI.sendMcpOpenFileResponse(id, {
        success: false,
        canceled: true,
        error: 'Document replacement was canceled or the current file could not be saved.',
      });
      return;
    }
    window.tokiAPI.sendMcpOpenFileResponse(id, {
      success: true,
      filePath: request.filePath,
      fileType: getRendererDocumentFileType(opened),
      name: String((opened as Record<string, unknown>).name || 'Untitled'),
    });
  } catch (error) {
    window.tokiAPI.sendMcpOpenFileResponse(id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    rendererOpenRequestInProgress = false;
    documentSwitchInProgress = false;
  }
});

window.tokiAPI.onMcpSessionStatusRequest((id) => {
  const dirtyFields = documentSwitchInProgress ? [] : [...tabMgr.dirtyFields].sort();
  window.tokiAPI.sendMcpSessionStatusResponse(id, {
    success: true,
    renderer: {
      autosaveDir,
      autosaveEnabled,
      autosaveInterval,
      dirtyFieldCount: dirtyFields.length,
      dirtyFields,
      documentSwitchInProgress,
      hasUnsavedChanges: dirtyFields.length > 0,
    },
  });
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
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = message;
    container.replaceChildren(emptyState);
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
      defineAppMonacoTheme(themeId, customTheme);
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

function proseEditorOptions(simple: boolean, isLargeFile = false): Record<string, unknown> {
  return {
    minimap: { enabled: !simple && !isLargeFile },
    lineNumbers: simple ? 'off' : 'on',
    glyphMargin: !simple,
    folding: !simple,
    renderLineHighlight: simple ? 'none' : 'line',
    overviewRulerLanes: simple ? 0 : 3,
    hideCursorInOverviewRuler: simple,
    padding: simple ? { top: 16, bottom: 16 } : { top: 0, bottom: 0 },
    renderWhitespace: simple ? 'none' : 'selection',
  };
}

function updateEditorModeToggle(tabInfo: Tab): void {
  const button = document.getElementById('editor-mode-toggle') as HTMLButtonElement | null;
  if (!button) return;
  if (tabInfo.editorKind !== 'prose') {
    button.style.display = 'none';
    button.onclick = null;
    return;
  }
  tabInfo.editorView ??= 'simple';
  button.style.display = '';
  button.textContent = tabInfo.editorView === 'simple' ? '코드 보기' : '단순 보기';
  button.title = tabInfo.editorView === 'simple' ? '줄번호와 코드 도구 표시' : '산문에 집중하는 단순 보기';
  button.onclick = () => {
    tabInfo.editorView = tabInfo.editorView === 'simple' ? 'code' : 'simple';
    const simple = tabInfo.editorView === 'simple';
    editorInstance?.updateOptions(proseEditorOptions(simple, (editorInstance?.getValue().length ?? 0) > 100000));
    updateEditorModeToggle(tabInfo);
  };
}

function createOrSwitchEditor(tabInfo: Tab): void {
  const container = document.getElementById('editor-container')!;
  updateEditorModeToggle(tabInfo);

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

  if (tabInfo.language === '_booleanform') {
    tabMgr.activeTabId = tabInfo.id;
    showBooleanEditor(tabInfo as BooleanFormTabInfo);
    tabMgr.renderTabs();
    updateSidebarActive();
    return;
  }

  if (tabInfo.language === '_modulesettingsform') {
    tabMgr.activeTabId = tabInfo.id;
    showModuleSettingsEditor(tabInfo as ModuleSettingsFormTabInfo);
    tabMgr.renderTabs();
    updateSidebarActive();
    return;
  }

  if (tabInfo.language === '_toggleform') {
    tabMgr.activeTabId = tabInfo.id;
    showToggleTemplateEditor(tabInfo as ToggleFormTabInfo);
    tabMgr.renderTabs();
    updateSidebarActive();
    return;
  }

  if (tabInfo.language === '_risupform') {
    tabMgr.activeTabId = tabInfo.id;
    showRisupEditor(tabInfo as RisupFormTabInfo);
    tabMgr.renderTabs();
    updateSidebarActive();
    return;
  }

  if (tabInfo.language === '_risupPromptItemForm') {
    tabMgr.activeTabId = tabInfo.id;
    showRisupPromptItemEditor(tabInfo as unknown as RisupPromptItemTabInfo);
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

  if (
    activateTriggerScriptsFormTab(tabInfo, tabMgr, {
      showTriggerEditor: (triggerTab) => showTriggerEditor(triggerTab),
      updateSidebarActive,
    })
  ) {
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

  const monacoThemeId = defineAppMonacoTheme(themeId, customTheme);

  const isReadOnly = !tabInfo.setValue;
  const initialValue = tabInfo.getValue() as string;
  const isLargeFile = initialValue.length > 100000;
  const simpleProse = tabInfo.editorKind === 'prose' && (tabInfo.editorView ?? 'simple') === 'simple';
  editorInstance = monaco.editor.create(container, {
    value: initialValue,
    language: tabInfo.language,
    theme: monacoThemeId,
    fontSize: 14,
    wordWrap: 'on',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    ...proseEditorOptions(simpleProse, isLargeFile),
    tabSize: 2,
    mouseWheelZoom: true,
    readOnly: isReadOnly,
    maxTokenizationLineLength: 20000,
  });

  // Track IME composition to avoid DOM-heavy side effects during CJK input
  const edDom = editorInstance!.getDomNode?.();
  if (edDom) {
    edDom.addEventListener('compositionstart', () => {
      isComposing = true;
    });
    edDom.addEventListener('compositionend', () => {
      isComposing = false;
      if (pendingRenderTabs) {
        pendingRenderTabs = false;
        tabMgr.renderTabs();
      }
    });
  }

  editorInstance!.onDidChangeModelContent(() => {
    const curTab = tabMgr.openTabs.find((t) => t.id === tabMgr.activeTabId);
    if (curTab && curTab.setValue) {
      // Auto-backup on first change (save original before modification)
      if (!tabMgr.dirtyFields.has(curTab.id)) {
        createBackup(curTab.id, curTab.getValue());
      }
      curTab.setValue(editorInstance!.getValue());
      tabMgr.dirtyFields.add(curTab.id);
      // Defer renderTabs during IME composition to prevent double-backspace
      if (isComposing) {
        pendingRenderTabs = true;
      } else {
        tabMgr.renderTabs();
      }
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
  persist: (value: string) => Promise<unknown> | void,
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
    { editorKind: 'prose', editorView: 'simple' },
  );
}

function openProseTab(
  id: string,
  label: string,
  language: string,
  getValue: () => unknown,
  setValue: ((value: unknown) => void) | null,
): Tab {
  return tabMgr.openTab(id, label, language, getValue, setValue, {
    editorKind: 'prose',
    editorView: 'simple',
  });
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

function buildAltGreetTabState(index: number): Record<string, unknown> | null {
  const arr = fileData?.alternateGreetings as string[] | undefined;
  if (!arr || index >= arr.length) return null;

  return {
    id: `altGreet_${index}`,
    label: `인사말 ${index + 1}`,
    language: 'html',
    getValue: () => (fileData!.alternateGreetings as string[])[index] ?? '',
    setValue: (value: unknown) => {
      (fileData!.alternateGreetings as string[])[index] = value as string;
    },
    editorKind: 'prose',
    editorView: 'simple',
  };
}

function buildRisupTabState(groupId: string, _tab: Tab): Record<string, unknown> | null {
  const group = getRisupFieldGroup(groupId);
  if (!fileData || !group || group.hidden) return null;

  return {
    id: `risup_${group.id}`,
    label: group.label,
    language: '_risupform',
    _risupGroupId: group.id,
    getValue: () => fileData!,
    setValue: (value: unknown) => {
      Object.assign(fileData!, value as Record<string, unknown>);
      if (value && typeof value === 'object' && 'name' in (value as Record<string, unknown>)) {
        useAppStore().setFileLabel((fileData!.name as string) || 'Untitled');
      }
    },
  };
}

function openRisupGroupTab(groupId: RisupFieldGroupId): void {
  const group = getRisupFieldGroup(groupId);
  if (!group || group.hidden) {
    setStatus('비권장/레거시 프롬프트 필드는 편집기에서 열 수 없습니다.');
    return;
  }
  const tabState = buildRisupTabState(groupId, {
    id: `risup_${groupId}`,
    label: group.label,
    language: '_risupform',
    getValue: () => fileData!,
    setValue: null,
    _lastValue: null,
  });
  if (!tabState) return;
  const tab = tabMgr.openTab(
    tabState.id as string,
    tabState.label as string,
    tabState.language as string,
    tabState.getValue as () => unknown,
    tabState.setValue as ((value: unknown) => void) | null,
  );
  tab._risupGroupId = groupId;
}

function getRisupPromptItems(): PromptItemModel[] {
  if (!fileData || fileData._fileType !== 'risup') return [];
  const model = parsePromptTemplate(typeof fileData.promptTemplate === 'string' ? fileData.promptTemplate : '');
  return model.state === 'valid' || model.state === 'empty' ? model.items : [];
}

function setRisupPromptTemplate(value: string): void {
  if (!fileData || fileData._fileType !== 'risup') return;
  fileData.promptTemplate = value;
  tabMgr.markFieldDirty('promptTemplate');
  tabMgr.markDirtyForTabId('risup_prompt');
  tabMgr.refreshIndexedTabs('risup_prompt_item_', (_index, tab) =>
    buildRisupPromptItemTabState(String(tab._promptItemId || tab.id.replace('risup_prompt_item_', '')), tab),
  );
  tabMgr.refreshIndexedTabs('risup_', (_index, tab) => buildRisupTabState(tab.id.replace('risup_', ''), tab));
  renderPromptManagerPanel();
}

function buildRisupPromptItemTabState(itemId: string, _tab: Tab): Record<string, unknown> | null {
  if (!fileData || fileData._fileType !== 'risup') return null;
  const item = getRisupPromptItems().find((entry) => entry.id === itemId);
  if (!item) return null;
  const label = promptItemSummary(item) || promptTypeLabelForController(item.type);
  return {
    id: `risup_prompt_item_${itemId}`,
    label,
    language: '_risupPromptItemForm',
    _promptItemId: itemId,
    getValue: () => (typeof fileData?.promptTemplate === 'string' ? fileData.promptTemplate : ''),
    setValue: (value: unknown) => {
      if (!fileData) return;
      fileData.promptTemplate = String(value ?? '');
      renderPromptManagerPanel();
    },
  };
}

function promptTypeLabelForController(type: string | null | undefined): string {
  return type ? `프롬프트 ${type}` : '프롬프트 블록';
}

function openRisupPromptItemTab(itemId: string): void {
  const tabState = buildRisupPromptItemTabState(itemId, {
    id: `risup_prompt_item_${itemId}`,
    label: '프롬프트 블록',
    language: '_risupPromptItemForm',
    getValue: () => '',
    setValue: null,
    _lastValue: null,
  });
  if (!tabState) {
    setStatus('프롬프트 블록을 열 수 없습니다.');
    return;
  }
  const tab = tabMgr.openTab(
    tabState.id as string,
    tabState.label as string,
    tabState.language as string,
    tabState.getValue as () => unknown,
    tabState.setValue as ((value: unknown) => void) | null,
  );
  tab._promptItemId = itemId;
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
    resolveGuidePath: (name: string) => window.tokiAPI.resolveGuidePath(name),
  };
}

function buildRefsSidebar(): void {
  const refsEl = document.getElementById('sidebar-refs');
  if (!refsEl) return;
  _buildRefsSidebar(refsEl, getRefsSidebarDeps() as unknown as Parameters<typeof _buildRefsSidebar>[1]);
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
    if (items.length > 0) {
      items.push('---');
    }
    items.push({ label: '백업 불러오기', action: () => showBackupMenu(backupKey, x, y, backupMenuCallbacks) });
  }
}

function buildRegexSidebar(tree: HTMLElement): void {
  const rxFolder = createFolderItem('정규식', '⚡', 0);
  tree.appendChild(rxFolder.header);
  tree.appendChild(rxFolder.children);

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
          ) {
            return;
          }
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

  const regexContainer = document.createElement('div');
  regexContainer.dataset.dndRegexContainer = '';
  rxFolder.children.appendChild(regexContainer);

  for (let i = 0; i < fileData!.regex.length; i++) {
    const rx = fileData!.regex[i];
    const label = rx.comment || `regex_${i}`;
    const el = createTreeItem(label, '·', 1);
    el.dataset.dndIdx = String(i);
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
    regexContainer.appendChild(el);
  }
}

function buildRisupSidebar(tree: HTMLElement): void {
  tree.appendChild(createSectionHeader('프리셋'));

  for (const group of getVisibleRisupFieldGroups()) {
    const el = createTreeItem(group.label, group.icon, 0);
    el.addEventListener('click', () => openRisupGroupTab(group.id));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items: ContextMenuItem[] = [];
      for (const target of getRisupSidebarBackupTargets(
        group.id,
        RISUP_FIELD_GROUPS,
        (backupKey) => getBackups(backupKey).length > 0,
      )) {
        if (items.length > 0) {
          items.push('---');
        }
        items.push({
          label: target.label,
          action: () => showBackupMenu(target.backupKey, e.clientX, e.clientY, backupMenuCallbacks),
        });
      }
      if (items.length > 0) {
        showContextMenu(e.clientX, e.clientY, items);
      }
    });
    tree.appendChild(el);
  }

  for (const item of getRisupSidebarExtraItems()) {
    const el = createTreeItem(item.label, item.icon, 0);
    el.addEventListener('click', () => {
      tabMgr.openTab(
        item.id,
        item.label,
        item.language,
        () => fileData![item.field],
        (v: unknown) => {
          fileData![item.field] = v as string;
        },
      );
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items: ContextMenuItem[] = [createMcpCopyItem(`read_field("${item.field}")`)];
      appendBackupItems(items, item.id, e.clientX, e.clientY);
      showContextMenu(e.clientX, e.clientY, items);
    });
    tree.appendChild(el);
  }

  tree.appendChild(createSectionHeader('스크립트'));
  buildRegexSidebar(tree);
  initSidebarDnD(getDndDeps());
}

function appendHiddenFieldWarnings(tree: HTMLElement): void {
  if (!fileData) return;
  const warnings = collectHiddenFieldWarnings(fileData as unknown as Record<string, unknown>);
  if (warnings.length === 0) return;

  const folder = createFolderItem(`호환성 경고 (${warnings.length})`, '⚠️', 0);
  folder.header.title = '구버전 호환을 위해 보존되지만 일반 편집에서는 숨겨지는 값';
  tree.appendChild(folder.header);
  tree.appendChild(folder.children);
  for (const warning of warnings) {
    const detail =
      warning.count !== undefined
        ? `${warning.field} · ${warning.category} · ${warning.count}개`
        : `${warning.field} · ${warning.category} · ${warning.size ?? 0}자`;
    const el = createTreeItem(detail, '⚠️', 0);
    el.title = `${warning.reason}\n${warning.suggestion}\n값은 호환성을 위해 보존되지만 편집기와 MCP 일반 조회에서는 숨겨집니다.`;
    folder.children.appendChild(el);
  }
}

type RisumSidebarField = {
  id: keyof Pick<CharxData, 'backgroundEmbedding' | 'customModuleToggle'>;
  label: string;
  icon: string;
  lang: string;
  kind?: 'toggle-template';
};

interface ProjectTreeNode {
  name: string;
  type: 'directory' | 'file';
  relativePath: string;
  children?: ProjectTreeNode[];
}

const RISUM_MODULE_SIDEBAR_FIELDS: readonly RisumSidebarField[] = [
  { id: 'backgroundEmbedding', label: '배경 임베딩', icon: '🎨', lang: 'html' },
  { id: 'customModuleToggle', label: '커스텀 토글', icon: '☑', lang: 'plaintext', kind: 'toggle-template' },
] as const;

function projectFileLanguage(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.lua')) return 'lua';
  return 'plaintext';
}

function projectFileIcon(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.match(/\.(png|jpg|jpeg|webp|gif)$/)) return '🖼';
  if (lower.endsWith('.json')) return '{}';
  if (lower.endsWith('.md')) return '📝';
  return '·';
}

function validateProjectRawFile(relativePath: string, content: string): string | null {
  if (!relativePath.toLowerCase().endsWith('.json')) return null;
  try {
    JSON.parse(content);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

function getProjectRelativePathFromTabId(tabId: string): string | null {
  return tabId.startsWith('project:') ? tabId.slice('project:'.length) : null;
}

async function reloadProjectAfterRawFileSync(tabId: string, relativePath: string): Promise<boolean> {
  const result = await window.tokiAPI.reloadProjectFolder();
  if (!result.success || !result.data) {
    projectRawSyncState.set(tabId, 'error');
    setStatus(`프로젝트 원본 파일 오류: ${result.error || '프로젝트를 다시 읽을 수 없습니다.'}`);
    return false;
  }
  setCurrentFileData(result.data as CharxData);
  currentProjectPath = result.projectPath || currentProjectPath;
  buildSidebar();
  projectRawSyncState.set(tabId, 'synced');
  tabMgr.dirtyFields.delete(tabId);
  tabMgr.renderTabs();
  setStatus(`프로젝트 원본 파일 동기화됨: ${relativePath}`);
  return true;
}

async function syncProjectRawFileTab(tabId: string, relativePath: string, content: string): Promise<boolean> {
  const validationError = validateProjectRawFile(relativePath, content);
  if (validationError) {
    projectRawSyncState.set(tabId, 'error');
    setStatus(`프로젝트 원본 파일 오류: ${relativePath} JSON 형식 오류 - ${validationError}`);
    return false;
  }

  try {
    projectRawSyncState.set(tabId, 'syncing');
    await window.tokiAPI.writeProjectFile(relativePath, content);
    return await reloadProjectAfterRawFileSync(tabId, relativePath);
  } catch (error) {
    projectRawSyncState.set(tabId, 'error');
    setStatus(`프로젝트 원본 파일 오류: ${(error as Error).message}`);
    return false;
  }
}

function scheduleProjectRawFileSync(tabId: string, relativePath: string, getContent: () => string): void {
  const existing = projectRawSyncTimers.get(tabId);
  if (existing) clearTimeout(existing);
  projectRawSyncState.set(tabId, 'syncing');
  const timer = setTimeout(() => {
    projectRawSyncTimers.delete(tabId);
    if (!tabMgr.findTab(tabId)) return;
    void syncProjectRawFileTab(tabId, relativePath, getContent());
  }, PROJECT_RAW_SYNC_DELAY_MS);
  projectRawSyncTimers.set(tabId, timer);
}

async function flushProjectRawFileTab(tabId: string, content: string): Promise<boolean> {
  const relativePath = getProjectRelativePathFromTabId(tabId);
  if (!relativePath) return true;
  const timer = projectRawSyncTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    projectRawSyncTimers.delete(tabId);
  }
  return syncProjectRawFileTab(tabId, relativePath, content);
}

function clearProjectRawSyncState(): void {
  for (const timer of projectRawSyncTimers.values()) clearTimeout(timer);
  projectRawSyncTimers.clear();
  projectRawSyncState.clear();
}

async function openProjectFileTab(relativePath: string): Promise<void> {
  const lower = relativePath.toLowerCase();
  if (lower.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
    openImageTab(relativePath, relativePath.split('/').pop() || relativePath);
    return;
  }
  let content = await window.tokiAPI.readProjectFile(relativePath);
  const tabId = `project:${relativePath}`;
  tabMgr.openTab(
    tabId,
    `[원본] ${relativePath}`,
    projectFileLanguage(relativePath),
    () => content,
    (value) => {
      content = String(value ?? '');
      scheduleProjectRawFileSync(tabId, relativePath, () => content);
    },
  );
}

function appendProjectTreeNode(parent: HTMLElement, node: ProjectTreeNode, indent: number): void {
  if (node.type === 'directory') {
    const folder = createFolderItem(node.name, '📁', indent);
    parent.appendChild(folder.header);
    parent.appendChild(folder.children);
    for (const child of node.children || []) appendProjectTreeNode(folder.children, child, indent + 1);
    return;
  }
  const item = createTreeItem(node.name, projectFileIcon(node.relativePath), indent);
  item.addEventListener('click', () => void openProjectFileTab(node.relativePath));
  parent.appendChild(item);
}

async function appendProjectFilesSidebar(tree: HTMLElement): Promise<void> {
  const projectTree = await window.tokiAPI.getProjectTree();
  if (!projectTree) return;
  tree.appendChild(createSectionHeader('고급'));
  const folder = createFolderItem('프로젝트 원본 파일', '📁', 0);
  folder.header.title = '고급: 폴더의 원본 파일을 직접 열어 편집합니다.';
  tree.appendChild(folder.header);
  tree.appendChild(folder.children);
  const hint = document.createElement('div');
  hint.className = 'project-raw-hint';
  hint.textContent = '고급 원본 파일 · 일반 편집은 위 구조화 항목을 사용하세요';
  folder.children.appendChild(hint);
  for (const child of projectTree.children || []) appendProjectTreeNode(folder.children, child, 1);
}

// Tracks the most recent async asset-content probe so a slower, superseded
// document load cannot overwrite the current document's manager state.
let assetContentToken = 0;
let documentStatsToken = 0;

// Report whether the lorebook / asset managers currently have any items, so the
// layout manager can auto-collapse empty managers and give the editor the width.
function updateManagerContentFromFile(): void {
  const data = fileData;
  const loreHasContent = !!(data && Array.isArray(data.lorebook) && data.lorebook.length > 0);
  layoutManager.setManagerContent({ lore: loreHasContent });

  const token = ++assetContentToken;
  Promise.resolve(window.tokiAPI.getAssetList())
    .then((list) => {
      if (token !== assetContentToken) return; // superseded by a newer document load
      const count = Array.isArray(list) ? list.length : 0;
      layoutManager.setManagerContent({ asset: count > 0 });
    })
    .catch(() => {
      /* ignore asset-listing failures for layout purposes */
    });
}

function buildSidebar(): void {
  updateDocumentStats();
  destroyAllSortables();
  const tree = document.getElementById('sidebar-tree')!;
  tree.innerHTML = '';

  // Always build refs sidebar regardless of fileData
  buildRefsSidebar();

  const promptManagerAvailable = !!fileData && fileData._fileType === 'risup';
  const managersAvailable = !!fileData && fileData._fileType !== 'risup';
  if (managersAvailable) {
    layoutManager.setManagerAvailability({ lore: true, asset: true, prompt: false });
    updateManagerContentFromFile();
  } else {
    if (fileData?._fileType === 'risup') {
      const promptModel = parsePromptTemplate(
        typeof fileData.promptTemplate === 'string' ? fileData.promptTemplate : '',
      );
      layoutManager.setManagerContent({
        prompt: promptModel.state === 'invalid' || promptModel.items.length > 0,
      });
    }
    layoutManager.setManagerAvailability({ lore: false, asset: false, prompt: promptManagerAvailable });
  }

  if (!fileData) {
    const empty = document.createElement('div');
    empty.className = 'sidebar-empty-state';
    const title = document.createElement('div');
    title.className = 'sidebar-empty-title';
    title.textContent = '현재 열린 파일이 없습니다';
    const hint = document.createElement('div');
    hint.className = 'sidebar-empty-hint';
    hint.textContent = '파일 > 열기 또는 Ctrl+O로 문서를 열어주세요';
    empty.append(title, hint);
    tree.appendChild(empty);
    renderRightManagerPanel();
    renderPromptManagerPanel();
    return;
  }

  const isRisum = fileData._fileType === 'risum';
  const isRisup = fileData._fileType === 'risup';
  const isCharx = !isRisum && !isRisup;
  if (isRisup) {
    buildRisupSidebar(tree);
    appendHiddenFieldWarnings(tree);
    renderRightManagerPanel();
    renderPromptManagerPanel();
    return;
  }

  // ---- Parse Lua sections (defer DOM append to 스크립트 section) ----
  luaSections = parseLuaSections(fileData.lua);

  const luaFolder = createFolderItem('Lua', '{}', 0);

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
  const luaSectionContainer = document.createElement('div');
  luaSectionContainer.dataset.dndLuaContainer = '';
  luaFolder.children.appendChild(luaSectionContainer);

  for (let i = 0; i < luaSections.length; i++) {
    const section = luaSections[i];
    const sectionEl = createTreeItem(section.name, '·', 1);
    sectionEl.dataset.dndIdx = String(i);
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
    luaSectionContainer.appendChild(sectionEl);
  }

  // ---- Parse CSS sections (defer DOM append to 스크립트 section) — charx only ----
  ({ sections: cssSections, prefix: _cssStylePrefix, suffix: _cssStyleSuffix } = parseCssSections(fileData.css));
  let cssFolder: ReturnType<typeof createFolderItem> | null = null;
  if (isCharx) {
    cssFolder = createFolderItem('CSS', '🎨', 0);

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
    const cssSectionContainer = document.createElement('div');
    cssSectionContainer.dataset.dndCssContainer = '';
    cssFolder.children.appendChild(cssSectionContainer);

    for (let i = 0; i < cssSections.length; i++) {
      const section = cssSections[i];
      const sectionEl = createTreeItem(section.name, '·', 1);
      sectionEl.dataset.dndIdx = String(i);
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
      cssSectionContainer.appendChild(sectionEl);
    }
  } // end if (!isRisum) — CSS folder

  // ---- Detect Lua/Trigger mode for mutual exclusivity ----
  let luaMode = true; // default: Lua active
  if (isCharx || isRisum) {
    luaMode = isTriggerScriptsLuaMode(fileData.triggerScripts);
  }

  // ---- Section: 캐릭터 정보 (charx only) ----
  if (isCharx) {
    tree.appendChild(createSectionHeader('캐릭터 정보'));

    const charInfoItems = getCharxInfoItems();
    for (const item of charInfoItems) {
      const el = createTreeItem(item.label, item.icon, 0);
      el.addEventListener('click', () => {
        const isProse = ['description', 'globalNote', 'creatorcomment', 'exampleMessage'].includes(item.id);
        const open = isProse ? openProseTab : tabMgr.openTab.bind(tabMgr);
        open(
          item.id,
          item.label,
          item.lang,
          () => fileData![item.field],
          (v: unknown) => {
            fileData![item.field] = v as string;
          },
        );
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const items: ContextMenuItem[] = [createMcpCopyItem(`read_field("${item.field}")`)];
        appendBackupItems(items, item.id, e.clientX, e.clientY);
        showContextMenu(e.clientX, e.clientY, items);
      });
      tree.appendChild(el);
    }
  }

  // ---- Section: 모듈 정보 (risum only) ----
  if (isRisum) {
    tree.appendChild(createSectionHeader('모듈 정보'));

    const settingsEl = createTreeItem('모듈 설정', '📦', 0);
    settingsEl.addEventListener('click', () => {
      tabMgr.openTab(
        'moduleSettings',
        '모듈 설정',
        '_modulesettingsform',
        () => fileData!,
        (value: unknown) => {
          Object.assign(fileData!, value as Record<string, unknown>);
          useAppStore().setFileLabel(String(fileData!.moduleName || 'Untitled'));
        },
      );
    });
    tree.appendChild(settingsEl);

    for (const item of RISUM_MODULE_SIDEBAR_FIELDS) {
      const el = createTreeItem(item.label, item.icon, 0);
      el.addEventListener('click', () => {
        tabMgr.openTab(
          String(item.id),
          item.label,
          item.kind === 'toggle-template' ? '_toggleform' : item.lang,
          () => String(fileData![item.id] ?? ''),
          (v: unknown) => {
            if (item.kind === 'toggle-template') {
              (fileData! as Record<string, unknown>)[item.id] = String(v ?? '');
            } else {
              (fileData! as Record<string, unknown>)[item.id] = v as string;
            }
          },
        );
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const items: ContextMenuItem[] = [createMcpCopyItem(`read_field("${String(item.id)}")`)];
        appendBackupItems(items, String(item.id), e.clientX, e.clientY);
        showContextMenu(e.clientX, e.clientY, items);
      });
      tree.appendChild(el);
    }
  }

  // ---- Section: 메시지 (charx only) ----
  if (isCharx) {
    tree.appendChild(createSectionHeader('메시지'));

    // 첫 메시지
    const fmEl = createTreeItem('첫 메시지', '💬', 0);
    fmEl.addEventListener('click', () => {
      openProseTab(
        'firstMessage',
        '첫 메시지',
        'html',
        () => fileData!.firstMessage,
        (v: unknown) => {
          fileData!.firstMessage = v as string;
        },
      );
    });
    fmEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items: ContextMenuItem[] = [createMcpCopyItem('read_field("firstMessage")')];
      appendBackupItems(items, 'firstMessage', e.clientX, e.clientY);
      showContextMenu(e.clientX, e.clientY, items);
    });
    tree.appendChild(fmEl);
    const altGreetFolder = createFolderItem('추가 첫 메시지', '💭', 0);
    tree.appendChild(altGreetFolder.header);
    tree.appendChild(altGreetFolder.children);

    altGreetFolder.header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, [
        { label: '새 인사말 추가', action: () => addAlternateGreeting() },
        '---',
        createMcpCopyItem('read_field("alternateGreetings")'),
      ]);
    });

    const altGreetContainer = document.createElement('div');
    altGreetContainer.dataset.dndAltgreetContainer = '';
    altGreetFolder.children.appendChild(altGreetContainer);

    const altArr = (fileData.alternateGreetings as string[]) || [];
    for (let i = 0; i < altArr.length; i++) {
      const idx = i;
      const preview = altArr[i].slice(0, 30).replace(/\n/g, ' ') || '(빈 인사말)';
      const itemEl = createTreeItem(`인사말 ${idx + 1}`, '·', 1);
      itemEl.title = preview;
      itemEl.dataset.dndIdx = String(idx);
      itemEl.addEventListener('click', () => {
        openProseTab(
          `altGreet_${idx}`,
          `인사말 ${idx + 1}`,
          'html',
          () => (fileData!.alternateGreetings as string[])[idx] ?? '',
          (v: unknown) => {
            (fileData!.alternateGreetings as string[])[idx] = v as string;
          },
        );
      });
      itemEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const items: ContextMenuItem[] = [createMcpCopyItem(`read_field("alternateGreetings")`)];
        appendBackupItems(items, `altGreet_${idx}`, e.clientX, e.clientY);
        items.push('---');
        items.push({ label: '삭제', action: () => deleteAlternateGreeting(idx) });
        showContextMenu(e.clientX, e.clientY, items);
      });
      altGreetContainer.appendChild(itemEl);
    }
  }

  // ---- Description for risum/risup (outside category sections) ----
  if (!isCharx) {
    const descEl = createTreeItem('설명', '📄', 0);
    descEl.addEventListener('click', () => {
      openProseTab(
        'description',
        '설명',
        'plaintext',
        () => fileData!.description,
        (v: unknown) => {
          fileData!.description = v as string;
        },
      );
    });
    descEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items: ContextMenuItem[] = [createMcpCopyItem('read_field("description")')];
      appendBackupItems(items, 'description', e.clientX, e.clientY);
      showContextMenu(e.clientX, e.clientY, items);
    });
    tree.appendChild(descEl);
  }

  // ==== Section: 스크립트 ====
  tree.appendChild(createSectionHeader('스크립트'));

  // Lua folder (built above, now appended)
  if ((isCharx || isRisum) && !luaMode) {
    luaFolder.header.classList.add('inactive');
    luaFolder.header.title = '현재 트리거 스크립트 모드입니다. Lua는 triggerScripts에 임베디드 시 활성화됩니다.';
  }
  tree.appendChild(luaFolder.header);
  tree.appendChild(luaFolder.children);

  // CSS folder (built above, charx only)
  if (cssFolder) {
    tree.appendChild(cssFolder.header);
    tree.appendChild(cssFolder.children);
  }

  // Trigger Scripts (single item)
  if (!isRisup) {
    const triggerEl = createTreeItem('트리거 스크립트', '🪝', 0);
    if ((isCharx || isRisum) && luaMode) {
      triggerEl.classList.add('inactive');
      triggerEl.title = '현재 Lua 모드입니다. triggerScripts에 독립적 트리거가 있으면 활성화됩니다.';
    }
    triggerEl.addEventListener('click', () => {
      openTriggerScriptsControllerTab(tabMgr, fileData);
    });
    triggerEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items: ContextMenuItem[] = [createMcpCopyItem('read_field("triggerScripts")')];
      appendBackupItems(items, 'triggerScripts', e.clientX, e.clientY);
      showContextMenu(e.clientX, e.clientY, items);
    });
    tree.appendChild(triggerEl);
  }

  buildRegexSidebar(tree);

  // ==== Section: 데이터 ====
  tree.appendChild(createSectionHeader('데이터'));

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

  // Group lorebook by folder using normalized folder refs.
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
      const folderRef = getFolderRef(entry);
      if (folderRef) {
        folderLookup[folderRef] = fd;
      }
    }
  }
  for (let i = 0; i < fileData.lorebook.length; i++) {
    const entry = fileData.lorebook[i];
    if (entry.mode === 'folder') continue;
    const folderId = resolveLorebookFolderRef(entry.folder, fileData.lorebook);
    const matched = folderId ? folderLookup[folderId] : null;
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
    // Tag for DnD
    const fEntry = fileData.lorebook[folder.index];
    const folderKey = getFolderRef(fEntry) || '';
    subFolder.children.dataset.dndLoreContainer = '';
    subFolder.children.dataset.dndLoreFolder = folderKey;

    // Lorebook folder right-click: rename / add entry / delete contents / delete folder
    const folderIdx = folder.index;
    const folderChildren = folder.children;
    subFolder.header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fEntry = fileData!.lorebook[folderIdx];
      const normalizedFolderId = getFolderRef(fEntry) || '';
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
              folder: normalizedFolderId,
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
      entryEl.dataset.dndIdx = String(child.index);
      subFolder.children.appendChild(entryEl);
    }
  }

  // Root lorebook entries container (for DnD)
  const loreRootContainer = document.createElement('div');
  loreRootContainer.dataset.dndLoreContainer = '';
  loreRootContainer.dataset.dndLoreFolder = '';
  lbFolder.children.appendChild(loreRootContainer);

  for (const child of rootEntries) {
    const entryEl = createLoreEntryItem(child, 1);
    entryEl.dataset.dndIdx = String(child.index);
    loreRootContainer.appendChild(entryEl);
  }

  // ==== Section: 에셋 ====
  tree.appendChild(createSectionHeader('에셋'));

  // Assets (images) folder — then initialize drag-and-drop
  buildAssetsSidebar(tree).then(() => {
    initSidebarDnD(getDndDeps());
    renderRightManagerPanel();
    initPanelDragDrop();
    void appendProjectFilesSidebar(tree).then(() => appendHiddenFieldWarnings(tree));
  });
}

function buildAssetsSidebar(tree: HTMLElement): Promise<void> {
  return _buildAssetsSidebar(tree, {
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
  // Keep the store aware of the active tab's language so the preview menu can
  // enable for markdown guide tabs (not just charx files).
  const activeTab = tabMgr.activeTabId ? tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId) : null;
  useAppStore().setActiveTabLanguage(activeTab?.language ?? '');
  updateDocumentStats();
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
  buildAltGreetTabState,
});

const {
  addNewLorebook,
  addNewLorebookFolder,
  importLorebook,
  deleteLorebook,
  renameLorebook,
  renameLorebookTo,
  reorderLorebook,
  addNewRegex,
  importRegex,
  deleteRegex,
  renameRegex,
  reorderRegex,
  addAssetFromDialog,
  attachAssetContextMenu,
  reorderAsset,
  addLuaSection,
  renameLuaSection,
  deleteLuaSection,
  reorderLuaSections,
  addCssSection,
  renameCssSection,
  deleteCssSection,
  reorderCssSections,
  addAlternateGreeting,
  deleteAlternateGreeting,
  reorderAlternateGreetings,
} = sidebarActions;

function openLorebookEntry(idx: number): void {
  if (!fileData?.lorebook || idx < 0 || idx >= fileData.lorebook.length) return;
  const entry = fileData.lorebook[idx];
  tabMgr.openTab(
    `lore_${idx}`,
    entry.comment || `entry_${idx}`,
    '_loreform',
    () => fileData!.lorebook[idx],
    (v) => {
      Object.assign(fileData!.lorebook[idx], v);
    },
  );
}

async function deleteLorebookMany(indices: number[]): Promise<void> {
  if (!fileData?.lorebook || indices.length === 0) return;
  const unique = [...new Set(indices)].filter((idx) => idx >= 0 && idx < fileData!.lorebook.length);
  if (unique.length === 0) return;
  if (!(await showConfirm(`선택한 로어북 ${unique.length}개 항목을 삭제하시겠습니까?`))) return;
  const sorted = unique.sort((a, b) => b - a);
  for (const idx of sorted) {
    tabMgr.closeTab(`lore_${idx}`);
    fileData.lorebook.splice(idx, 1);
  }
  tabMgr.markFieldDirty('lorebook');
  tabMgr.shiftIndexedTabsAfterRemoval('lore_', sorted, buildLorebookTabState);
  buildSidebar();
  setStatus(`로어북 ${sorted.length}개 항목 삭제됨`);
}

async function moveLorebookManyToFolder(indices: number[], folderRef: string): Promise<void> {
  if (!fileData?.lorebook || indices.length === 0) return;
  const unique = [...new Set(indices)].filter((idx) => {
    const entry = fileData!.lorebook[idx];
    return entry && entry.mode !== 'folder';
  });
  if (unique.length === 0) return;
  for (const idx of unique) {
    fileData.lorebook[idx].folder = folderRef;
  }
  tabMgr.markFieldDirty('lorebook');
  tabMgr.refreshIndexedTabs('lore_', buildLorebookTabState);
  buildSidebar();
  setStatus(`로어북 ${unique.length}개 항목 이동됨`);
}

async function renameAssetFromManager(assetPath: string, fileName: string): Promise<string | null> {
  const newName = fileName.trim();
  const originalName = assetPath.split('/').pop() || assetPath;
  if (!newName) return '파일명을 입력하세요.';
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(newName)) return '파일명에 사용할 수 없는 문자가 있습니다.';
  const oldExtension = originalName.includes('.')
    ? originalName.slice(originalName.lastIndexOf('.')).toLocaleLowerCase()
    : '';
  const newExtension = newName.includes('.') ? newName.slice(newName.lastIndexOf('.')).toLocaleLowerCase() : '';
  if (!newExtension || newExtension !== oldExtension) return `확장자는 ${oldExtension || '(없음)'} 그대로 유지하세요.`;
  const assets = await window.tokiAPI.getAssetList();
  const parent = assetPath.includes('/') ? assetPath.slice(0, assetPath.lastIndexOf('/') + 1) : '';
  const nextPath = `${parent}${newName}`.toLocaleLowerCase();
  if (assets.some((asset) => asset.path !== assetPath && asset.path.toLocaleLowerCase() === nextPath)) {
    return '같은 경로에 동일한 파일명이 이미 있습니다.';
  }
  if (newName === originalName) return null;
  const newPath = await window.tokiAPI.renameAsset(assetPath, newName);
  if (!newPath) return '에셋 이름 변경에 실패했습니다.';
  buildSidebar();
  setStatus(`에셋 이름 변경: ${newName}`);
  return null;
}

async function renameAssetsBatchFromManager(operations: Array<{ oldPath: string; newName: string }>): Promise<{
  ok: boolean;
  renamed?: Array<{ oldPath: string; newPath: string }>;
  error?: string;
  conflicts?: string[];
}> {
  const result = await window.tokiAPI.renameAssetsBatch(operations);
  if (result.ok) buildSidebar();
  return result;
}

async function deleteAssetsFromManager(paths: string[]): Promise<void> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return;
  const preview = unique.map((path) => path.split('/').pop() || path).join('\n');
  if (!(await showConfirm(`선택한 에셋 ${unique.length}개를 삭제하시겠습니까?\n\n${preview}`))) return;
  const ok = await window.tokiAPI.deleteAssets(unique);
  if (!ok) {
    setStatus('에셋 삭제 실패');
    return;
  }
  for (const path of unique) tabMgr.closeTab(`img_${path}`);
  buildSidebar();
  setStatus(`에셋 ${unique.length}개 삭제됨`);
}

// ==================== Drag-and-Drop Dependencies ====================

function getDndDeps() {
  return {
    getFileData: () => fileData,
    getLuaSections: () => luaSections,
    getCssSections: () => cssSections,
    getCssStylePrefix: () => _cssStylePrefix,
    getCssStyleSuffix: () => _cssStyleSuffix,
    reorderLorebook,
    reorderRegex,
    reorderLuaSections,
    reorderCssSections,
    reorderAsset,
    reorderAlternateGreetings,
  };
}

// ==================== Backup System ====================

const backupMenuCallbacks = { setStatus, onRestore: restoreBackup };

function restoreBackup(tabId: string, backupIdx: number): void {
  const store = getBackups(tabId);
  if (!store[backupIdx]) return;

  const backup = store[backupIdx];

  // Find the matching tab or open it
  const tab = tabMgr.openTabs.find((t) => t.id === tabId);
  if (tabId === 'triggerScripts') {
    backupActiveTriggerScriptsRestoreDraft({
      activeTabId: tabMgr.activeTabId,
      createBackup,
      tab,
    });
    const restored = restoreTriggerScriptsControllerBackup({
      activeTabId: tabMgr.activeTabId,
      activateTab: (restoreTab) => createOrSwitchEditor(restoreTab as Tab),
      backupContent: backup.content,
      fileData,
      tab,
    });
    if (!restored) return;
    tabMgr.markDirtyForTabId(tabId);
    return;
  }
  if (tabId.startsWith('risup_')) {
    const activeRisupTab = findActiveRisupTab({
      activeTabId: tabMgr.activeTabId,
      openTabs: tabMgr.openTabs,
    });
    backupActiveRisupRestoreDraft({
      activeTabId: tabMgr.activeTabId,
      activeTab: activeRisupTab,
      createBackup,
    });
    const restored = restoreRisupTabsControllerBackup({
      activeTabId: tabMgr.activeTabId,
      activeTab: activeRisupTab,
      activateTab: (restoreTab) => createOrSwitchEditor(restoreTab as Tab),
      backupContent: backup.content,
      fileData,
      setFileLabel: (name) => useAppStore().setFileLabel(name),
      tab,
    });
    if (!restored) {
      setStatus('백업 복원 실패: 형식이 올바르지 않습니다');
      return;
    }
    tabMgr.markDirtyForTabId(tabId);
    if (activeRisupTab && activeRisupTab.id !== tabId) {
      tabMgr.markDirtyForTabId(activeRisupTab.id);
    }
    setStatus(`백업 v${backupIdx + 1} 복원됨 (${formatBackupTime(backup.time)})`);
    return;
  }
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

interface TerminalSessionUi {
  id: string;
  name: string;
  container: HTMLElement;
  context: TerminalSessionContext;
  ui: TerminalUiHandle | null;
}

const terminalSessions = new Map<string, TerminalSessionUi>();
let activeTerminalSessionId: string | null = null;
const fallbackTerminalSession = new TerminalSessionContext();

function getActiveTerminalSession(): TerminalSessionUi | null {
  return activeTerminalSessionId ? terminalSessions.get(activeTerminalSessionId) || null : null;
}

function getActiveTerminalContext(): TerminalSessionContext {
  return getActiveTerminalSession()?.context || fallbackTerminalSession;
}

function syncActiveTerminalHandles(): void {
  const active = getActiveTerminalSession();
  term = active?.ui?.term || null;
  fitAddon = active?.ui?.fitAddon || null;
}

function renderTerminalTabs(): void {
  const tabs = document.getElementById('terminal-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';

  for (const session of terminalSessions.values()) {
    const tab = document.createElement('div');
    tab.className = `terminal-tab${session.id === activeTerminalSessionId ? ' active' : ''}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(session.id === activeTerminalSessionId));
    tab.tabIndex = 0;
    tab.title = session.name;
    tab.addEventListener('click', () => setActiveTerminalSession(session.id));
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setActiveTerminalSession(session.id);
      }
    });

    const label = document.createElement('span');
    label.className = 'terminal-tab-label';
    label.textContent = session.name;
    tab.appendChild(label);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'terminal-tab-close';
    close.title = '터미널 탭 닫기';
    close.setAttribute('aria-label', `${session.name} 탭 닫기`);
    close.textContent = '×';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      void closeTerminalSession(session.id);
    });
    tab.appendChild(close);
    tabs.appendChild(tab);
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'terminal-tab-add';
  add.title = '새 터미널';
  add.setAttribute('aria-label', '새 터미널');
  add.textContent = '+';
  add.addEventListener('click', () => {
    void createTerminalSession('Shell');
  });
  tabs.appendChild(add);
}

function setActiveTerminalSession(sessionId: string): void {
  if (!terminalSessions.has(sessionId)) return;
  activeTerminalSessionId = sessionId;
  for (const session of terminalSessions.values()) {
    session.container.classList.toggle('active', session.id === sessionId);
  }
  syncActiveTerminalHandles();
  renderTerminalTabs();
  const cwd = getActiveTerminalContext().cwd;
  if (cwd) void window.tokiAPI.setTerminalCwd(cwd);
  if (fitAddon && term) {
    window.setTimeout(() => fitAddon.fit(), 20);
  }
}

async function closeTerminalSession(sessionId: string): Promise<void> {
  const session = terminalSessions.get(sessionId);
  if (!session) return;
  await window.tokiAPI.terminalStopSession(session.id);
  session.ui?.dispose();
  session.container.remove();
  terminalSessions.delete(session.id);

  if (activeTerminalSessionId === session.id) {
    activeTerminalSessionId = terminalSessions.keys().next().value || null;
  }

  if (!activeTerminalSessionId) {
    await createTerminalSession('Shell');
    return;
  }

  setActiveTerminalSession(activeTerminalSessionId);
}

async function createTerminalSession(name = 'Shell'): Promise<TerminalSessionUi> {
  const root = document.getElementById('terminal-container')!;
  const info = await window.tokiAPI.terminalNewSession(name);
  const sessionContainer = document.createElement('div');
  sessionContainer.className = 'terminal-session';
  sessionContainer.dataset.sessionId = info.id;
  root.appendChild(sessionContainer);

  const session: TerminalSessionUi = {
    id: info.id,
    name: info.name,
    container: sessionContainer,
    context: new TerminalSessionContext(),
    ui: null,
  };
  terminalSessions.set(session.id, session);
  setActiveTerminalSession(session.id);

  const terminalUi = await initializeTerminalUi({
    api: {
      onTerminalData: (callback) =>
        window.tokiAPI.onTerminalDataSession((sessionId, data) => {
          if (sessionId === session.id) callback(data);
        }),
      onTerminalExit: (callback) =>
        window.tokiAPI.onTerminalExitSession((sessionId) => {
          if (sessionId === session.id) callback();
        }),
      onTerminalStatus: (callback) =>
        window.tokiAPI.onTerminalStatusSession((sessionId, event) => {
          if (sessionId === session.id) callback(event);
        }),
      terminalInput: (data) => window.tokiAPI.terminalInputSession(session.id, data),
      terminalIsRunning: () => window.tokiAPI.terminalIsSessionRunning(session.id),
      terminalResize: (cols, rows) => window.tokiAPI.terminalResizeSession(session.id, cols, rows),
      terminalStart: (cols, rows) => window.tokiAPI.terminalStartSession(session.id, cols, rows, session.name),
    },
    container: session.container,
    onActivity: () => handleTerminalDataForBgm(),
    onTerminalData: (data) => {
      if (session.id !== activeTerminalSessionId) return;
      if (isChatMode()) onChatData(data);
      feedBgBuffer(data);
    },
    onUserInput: (data) => {
      lastUserInputTime = Date.now();
      const prevCwd = session.context.cwd;
      session.context.feedInput(data);
      if (session.id === activeTerminalSessionId && session.context.cwd !== prevCwd) {
        window.tokiAPI.setTerminalCwd(session.context.cwd);
      }
    },
    preserveAmdLoader: true,
    rightClickSelectsWord: true,
    setActive: setTokiActive,
    shouldActivateOnData: () => shouldTreatTerminalDataAsActivity(lastUserInputTime),
    theme: getTheme(themeId, customTheme).terminal,
    writeStatusToTerminal: true,
  });

  session.ui = terminalUi;
  if (session.id === activeTerminalSessionId) {
    syncActiveTerminalHandles();
  }
  return session;
}

async function initTerminal(): Promise<void> {
  document.getElementById('terminal-container')!.innerHTML = '';
  terminalSessions.clear();
  activeTerminalSessionId = null;
  await createTerminalSession('Shell');
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

function moveLoreManager(pos: LayoutSlot | 'hide'): void {
  layoutManager.moveLoreManager(pos);
}

function moveAssetManager(pos: LayoutSlot | 'hide'): void {
  layoutManager.moveAssetManager(pos);
}

function movePromptManager(pos: LayoutSlot | 'hide'): void {
  layoutManager.movePromptManager(pos);
}

function moveRefs(pos: PanelPosition): void {
  layoutManager.moveRefs(pos);
}

function resetLayout(): void {
  layoutManager.resetLayout();
}

async function restartTerminal(): Promise<void> {
  const active = getActiveTerminalSession();
  if (!active?.ui) return;
  await window.tokiAPI.terminalStopSession(active.id);
  // Wait for pty to fully terminate before starting a new one
  await new Promise((r) => setTimeout(r, 200));
  active.ui.term.clear();
  active.context.reset();
  const restarted = await window.tokiAPI.terminalStartSession(
    active.id,
    active.ui.term.cols,
    active.ui.term.rows,
    active.name,
  );
  setStatus(restarted ? '터미널 재시작됨' : '터미널 재시작 실패');
}

// ==================== Actions ====================
function getActiveTabForStats(): Pick<Tab, 'getValue'> | null {
  const activeTab = tabMgr.activeTabId ? tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId) : null;
  if (!activeTab) return null;
  if (editorInstance && !FORM_TAB_TYPES.has(activeTab.language)) {
    return { getValue: () => editorInstance!.getValue() };
  }
  return activeTab;
}

function updateDocumentStats(): void {
  const store = useAppStore();
  const token = ++documentStatsToken;
  if (!fileData) {
    store.setDocumentStatsText('');
    return;
  }
  const stats = summarizeDocumentStats({
    data: fileData,
    dirty: tabMgr.dirtyFields.size > 0,
    activeTab: getActiveTabForStats(),
  });
  store.setDocumentStatsText(formatDocumentStats(stats));

  if (fileData._fileType === 'risup') return;
  void window.tokiAPI
    .getAssetList()
    .then((assets) => {
      if (token !== documentStatsToken) return;
      stats.assetCount = Array.isArray(assets) ? assets.length : stats.assetCount;
      store.setDocumentStatsText(formatDocumentStats(stats));
    })
    .catch(() => {
      /* keep the synchronous stats if asset listing fails */
    });
}

function setCurrentFileData(data: CharxData | null): void {
  fileData = data;
  layoutManager.resetManagerContentState();
  useAppStore().setFileData(data);
  updateDocumentStats();
}

function resetDocumentWorkspace(): void {
  clearProjectRawSyncState();
  tabMgr.reset();
  if (editorInstance) {
    editorInstance.dispose();
    editorInstance = null;
  }
  document.getElementById('editor-container')!.innerHTML = '<div class="empty-state">항목을 선택하세요</div>';
  document.getElementById('editor-tabs')!.innerHTML = '';
  updateDocumentStats();
}

function applyLoadedDocument(data: Record<string, unknown>): void {
  const nextData = data as CharxData;
  setCurrentFileData(nextData);
  resetDocumentWorkspace();
  useAppStore().setFileLabel((nextData.name as string) || 'Untitled');
  buildSidebar();
}

/** @type {import('../lib/file-actions').FileActionDeps} */
const fileActionDeps: FileActionDeps = {
  getFileData: () => fileData,
  setFileData: (d) => {
    setCurrentFileData(d as CharxData);
  },
  getEditorInstance: () => editorInstance,
  setEditorInstance: (v) => {
    editorInstance = v;
  },
  getAutosaveDir: () => autosaveDir,
  hasUnsavedChanges: () => tabMgr.dirtyFields.size > 0,
  requestDocumentReplacement: async (_targetLabel) => showCloseConfirm(),
  saveCurrentDocument: async () => handleSave(),
  tabMgr,
  buildSidebar,
  setStatus,
};

async function handleNew(): Promise<void> {
  await _handleNew(fileActionDeps);
  currentProjectPath = null;
}
async function handleOpen(): Promise<void> {
  const result = await _handleOpen(fileActionDeps);
  if (!result) return;
  currentProjectPath = null;
  rememberRecentFile(result.path, result.sourceFormat);
}

async function handleExtractDocumentProject(): Promise<void> {
  const result = await window.tokiAPI.extractDocumentToProject();
  if (!result.success) {
    if (!result.canceled) setStatus(`프로젝트 추출 실패: ${result.error || '알 수 없는 오류'}`);
    return;
  }
  setCurrentFileData(result.data as CharxData);
  currentProjectPath = result.projectPath || null;
  rememberRecentProject(result.projectPath);
  useAppStore().setFileLabel(`${fileData?.name || 'Untitled'} · 프로젝트 폴더`);
  tabMgr.reset();
  buildSidebar();
  await window.tokiAPI.watchProjectFolder();
  setStatus(`프로젝트 폴더 열림: 구조화 편집을 기본으로 사용합니다. (${result.projectPath})`);
}

async function handleOpenProjectFolder(): Promise<void> {
  const result = await window.tokiAPI.openProjectFolder();
  if (!result.success) {
    if (!result.canceled) setStatus(`프로젝트 열기 실패: ${result.error || '알 수 없는 오류'}`);
    return;
  }
  setCurrentFileData(result.data as CharxData);
  currentProjectPath = result.projectPath || null;
  rememberRecentProject(result.projectPath);
  useAppStore().setFileLabel(`${fileData?.name || 'Untitled'} · 프로젝트 폴더`);
  tabMgr.reset();
  buildSidebar();
  await window.tokiAPI.watchProjectFolder();
  setStatus(`프로젝트 폴더 열림: 구조화 편집을 기본으로 사용합니다. (${result.projectPath})`);
}

async function handleCloneProjectFolder(): Promise<void> {
  if (!currentProjectPath) {
    setStatus('복제할 프로젝트 폴더가 열려 있지 않습니다');
    return;
  }
  if (!(await syncActiveProjectFileTab())) return;
  if (tabMgr.dirtyFields.size > 0) {
    await handleSave();
    if (tabMgr.dirtyFields.size > 0) return;
  }
  const result = await window.tokiAPI.cloneProjectFolder();
  if (!result.success) {
    if (!result.canceled) setStatus(`프로젝트 복제 실패: ${result.error || '알 수 없는 오류'}`);
    return;
  }
  setCurrentFileData(result.data as CharxData);
  currentProjectPath = result.projectPath || null;
  rememberRecentProject(result.projectPath);
  useAppStore().setFileLabel(`${fileData?.name || 'Untitled'} · 프로젝트 폴더`);
  tabMgr.reset();
  buildSidebar();
  await window.tokiAPI.watchProjectFolder();
  setStatus(`프로젝트 복제본 열림: ${result.projectPath}`);
}

async function handleOpenRecentItem(payload?: unknown): Promise<void> {
  const item = payload as RecentItem | undefined;
  if (!item?.path) return;
  try {
    if (item.kind === 'project') {
      const result = await window.tokiAPI.openProjectFolderPath(item.path);
      if (!result.success) {
        throw new Error(result.error || '알 수 없는 오류');
      }
      setCurrentFileData(result.data as CharxData);
      currentProjectPath = result.projectPath || null;
      useAppStore().setFileLabel(`${fileData?.name || 'Untitled'} · 프로젝트 폴더`);
      tabMgr.reset();
      buildSidebar();
      await window.tokiAPI.watchProjectFolder();
      rememberRecentProject(result.projectPath || item.path);
      setStatus(`최근 프로젝트 열림: ${result.projectPath || item.path}`);
      return;
    }

    await _handleOpenPath(fileActionDeps, item.path, { targetLabel: item.path });
    currentProjectPath = null;
    rememberRecentFile(item.path, item.sourceFormat);
    setStatus(`최근 파일 열림: ${item.path}`);
  } catch (error) {
    removeRecentItem(item.path);
    refreshRecentItems();
    setStatus(`최근 항목 열기 실패: ${(error as Error).message}`);
  }
}

function handleClearRecentItems(): void {
  clearRecentItems();
  refreshRecentItems();
  setStatus('최근 항목을 지웠습니다');
}

async function syncActiveProjectFileTab(): Promise<boolean> {
  if (!tabMgr.activeTabId?.startsWith('project:') || !editorInstance) return true;
  const tab = tabMgr.openTabs.find((entry) => entry.id === tabMgr.activeTabId);
  if (!tab?.setValue) return true;
  const ok = await flushProjectRawFileTab(tab.id, editorInstance.getValue());
  if (ok) {
    tabMgr.dirtyFields.delete(tab.id);
    tabMgr.renderTabs();
  }
  return ok;
}

async function handleSave(): Promise<void> {
  if (!(await syncActiveProjectFileTab())) return;
  return _handleSave(fileActionDeps);
}
async function handleSaveAs(): Promise<void> {
  if (!(await syncActiveProjectFileTab())) return;
  return _handleSaveAs(fileActionDeps);
}

async function handleReassembleProjectDocument(): Promise<void> {
  if (!(await syncActiveProjectFileTab())) return;
  const fileData = fileActionDeps.getFileData();
  const result = await window.tokiAPI.reassembleProjectDocument(fileData || undefined);
  setStatus(result.success ? `파일 내보내기 완료: ${result.path}` : `파일 내보내기 실패: ${result.error}`);
}

// ==================== RP Mode ====================
// RP mode UI is in ./settings-handlers.ts

// Trigger script text helpers are in ./trigger-script-utils.ts

function sendTerminalInputToSession(sessionId: string | null | undefined, text: string): void {
  const targetId = sessionId || activeTerminalSessionId;
  if (!targetId) return;
  window.tokiAPI.terminalInputSession(targetId, text);
}

async function createAssistantTerminalSession(name: string): Promise<TerminalSessionUi> {
  const session = await createTerminalSession(name);
  setActiveTerminalSession(session.id);
  return session;
}

function getAssistantDeps(sessionId?: string) {
  const session = sessionId ? terminalSessions.get(sessionId) || null : getActiveTerminalSession();
  return {
    rpMode,
    rpCustomText,
    hasTerminal: !!session?.ui,
    readPersona: (mode: string) => window.tokiAPI.readPersona(mode),
    getClaudePrompt: () => window.tokiAPI.getClaudePrompt(),
    writeMcpConfig: () => window.tokiAPI.writeMcpConfig(),
    writeCopilotMcpConfig: () => window.tokiAPI.writeCopilotMcpConfig(),
    writeCodexMcpConfig: (projectRoot?: string | null) => window.tokiAPI.writeCodexMcpConfig(projectRoot),
    writeAntigravityMcpConfig: () => window.tokiAPI.writeAntigravityMcpConfig(),
    cleanupAgentsMd: () => window.tokiAPI.cleanupAgentsMd(),
    writeSystemPrompt: (content: string) => window.tokiAPI.writeSystemPrompt(content),
    writeAgentsMd: (content: string, projectRoot?: string | null) => window.tokiAPI.writeAgentsMd(content, projectRoot),
    terminalInput: (text: string) => sendTerminalInputToSession(session?.id, text),
    setStatus,
    navigatorLike: window.navigator,
    projectRoot: currentProjectPath || session?.context.cwd || null,
  };
}

async function handleClaudeStart(): Promise<void> {
  const session = await createAssistantTerminalSession('Claude');
  // getAssistantDeps() is structurally compatible at runtime; minor return-type
  // mismatches (Promise<boolean> vs Promise<void>) require the double assertion.
  await _handleClaudeStart(getAssistantDeps(session.id) as unknown as Parameters<typeof _handleClaudeStart>[0]);
}

async function handleCopilotStart(): Promise<void> {
  const session = await createAssistantTerminalSession('Copilot');
  await _handleCopilotStart(getAssistantDeps(session.id) as unknown as Parameters<typeof _handleCopilotStart>[0]);
}

async function handleCodexStart(): Promise<void> {
  const session = await createAssistantTerminalSession('Codex');
  await _handleCodexStart(getAssistantDeps(session.id) as unknown as Parameters<typeof _handleCodexStart>[0]);
}

async function handleAntigravityStart(): Promise<void> {
  const session = await createAssistantTerminalSession('Antigravity');
  await _handleAntigravityStart(
    getAssistantDeps(session.id) as unknown as Parameters<typeof _handleAntigravityStart>[0],
  );
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

// ==================== App Theme ====================

function getThemeUiDeps() {
  return {
    getEditorInstance: () => editorInstance as { updateOptions(opts: unknown): void } | null,
    getFormEditors: () => getFormEditors() as Array<{ updateOptions(opts: unknown): void }>,
    getTerminal: () => term as { options: { theme: unknown } } | null,
  };
}

function getThemeDeps() {
  return {
    ...getThemeUiDeps(),
    getThemeId: () => themeId,
    getCustomTheme: () => customTheme,
    setThemeId: (nextThemeId: ThemeId) => {
      themeId = nextThemeId;
      darkMode = getTheme(themeId, customTheme).mode === 'dark';
    },
    setCustomTheme: (nextCustomTheme: CustomThemePalette | null) => {
      customTheme = nextCustomTheme;
      darkMode = getTheme(themeId, customTheme).mode === 'dark';
    },
  };
}

function changeTheme(nextThemeId: ThemeId): void {
  _changeTheme(nextThemeId, getThemeDeps());
  darkMode = getTheme(themeId, customTheme).mode === 'dark';
  syncStoreState();
}

function refreshThemeUi(): void {
  _refreshThemeUi(themeId, customTheme, getThemeUiDeps());
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
    getDirtyFieldCount: () => (documentSwitchInProgress ? 0 : tabMgr.dirtyFields.size),
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
      themeId,
      customTheme,
      bgmEnabled: isBgmEnabled(),
      rpMode,
      rpCustomText,
      mcpApprovalMode,
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
    onThemeChange(nextThemeId) {
      changeTheme(nextThemeId);
    },
    onCustomThemeChange(nextCustomTheme) {
      _updateCustomTheme(nextCustomTheme, getThemeDeps());
      darkMode = getTheme(themeId, customTheme).mode === 'dark';
      syncStoreState();
    },
    onBgmToggle(enabled) {
      setBgmEnabled(enabled);
      writeBgmEnabled(isBgmEnabled());
      if (!isBgmEnabled()) pauseBgm();
    },
    async onPickBgm() {
      const filePath = await window.tokiAPI.pickBgm();
      if (!filePath) return null;
      setBgmFilePath(filePath);
      writeBgmPath(filePath);
      setStatus(`BGM 변경: ${filePath.split(/[/\\]/).pop()}`);
      return filePath;
    },
    onRpModeChange(mode: string) {
      rpMode = mode as RpMode;
      writeRpMode(rpMode);
    },
    onRpCustomTextChange(text) {
      rpCustomText = text;
      writeRpCustomText(rpCustomText);
    },
    onMcpApprovalModeChange(mode) {
      mcpApprovalMode = mode;
      resetMcpConfirmAllowAll();
      writeMcpApprovalMode(mode);
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
  // Markdown documents (e.g. bundled guide files) get a rendered HTML preview
  // regardless of whether a charx file is loaded.
  const activeTab = tabMgr.activeTabId ? tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId) : null;
  if (activeTab && activeTab.language === 'markdown') {
    showMarkdownPreview(String(activeTab.getValue() ?? ''), activeTab.label);
    return;
  }

  if (!fileData) {
    setStatus('파일을 먼저 열어주세요');
    return;
  }

  const previewFileType = fileData._fileType || 'charx';

  if (previewFileType !== 'charx') {
    setStatus('프리뷰는 .charx 파일에서만 사용할 수 있습니다');
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
    moveLoreManager,
    moveAssetManager,
    movePromptManager,
    toggleSidebar,
    toggleTerminal,
    toggleLoreManager: () => layoutManager.toggleLoreManager(),
    toggleAssetManager: () => layoutManager.toggleAssetManager(),
    togglePromptManager: () => layoutManager.togglePromptManager(),
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
  const effectiveRequestId = panelId === 'terminal' ? activeTerminalSessionId || requestId : requestId;
  return _popOutPanel(panelId, getPopoutDeps() as unknown as PopoutDeps, effectiveRequestId);
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

  if (tabId === 'triggerScripts') {
    openTriggerScriptsControllerTab(tabMgr, fileData);
    return;
  }

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
    alternateGreetings: {
      label: '추가 첫 메시지',
      lang: 'json',
      get: () => stringifyStringArray(data.alternateGreetings),
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
  };

  for (const item of getCharxInfoItems()) {
    const field = item.field;
    tabMap[item.id] = {
      label: item.label,
      lang: item.lang,
      get: () => data[field] ?? '',
      set: (v: unknown) => {
        data[field] = v as string;
      },
    };
  }

  if (tabMap[tabId]) {
    const t = tabMap[tabId];
    if (tabId === 'lua') data.lua = combineLuaSections(luaSections);
    tabMgr.openTab(tabId, t.label, t.lang, t.get, t.set);
    return;
  }

  if (tabId.startsWith('risup_')) {
    if (tabId.startsWith('risup_prompt_item_')) {
      openRisupPromptItemTab(tabId.replace('risup_prompt_item_', ''));
      return;
    }
    const groupId = tabId.replace('risup_', '') as RisupFieldGroupId;
    if (getRisupFieldGroup(groupId)) {
      openRisupGroupTab(groupId);
    }
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
      openExternalTextTab(
        tabId,
        `[가이드] ${fileName}`,
        content,
        (val: string) => window.tokiAPI.writeGuide(fileName, val),
        'markdown',
      );
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
    const themeChanged = snapshot.themeId !== themeId || snapshot.customTheme !== customTheme;
    darkMode = snapshot.darkMode;
    themeId = snapshot.themeId;
    customTheme = snapshot.customTheme;
    rpMode = snapshot.rpMode;
    rpCustomText = snapshot.rpCustomText;
    setBgmEnabled(snapshot.bgmEnabled);
    autosaveEnabled = snapshot.autosaveEnabled;
    autosaveInterval = snapshot.autosaveInterval;
    autosaveDir = snapshot.autosaveDir;
    if (themeChanged) {
      refreshThemeUi();
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
    'open-recent-item': (payload) => handleOpenRecentItem(payload),
    'clear-recent-items': () => handleClearRecentItems(),
    'open-project-folder': () => handleOpenProjectFolder(),
    'extract-document-project': () => handleExtractDocumentProject(),
    'extract-charx-project': () => handleExtractDocumentProject(),
    'clone-project-folder': () => handleCloneProjectFolder(),
    save: () => handleSave(),
    'save-as': () => handleSaveAs(),
    'reassemble-project-document': () => handleReassembleProjectDocument(),
    'reassemble-project-charx': () => handleReassembleProjectDocument(),
    'close-tab': () => {
      if (tabMgr.activeTabId) void tabMgr.requestCloseTab(tabMgr.activeTabId);
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
    'toggle-lore-manager': () => layoutManager.toggleLoreManager(),
    'toggle-asset-manager': () => layoutManager.toggleAssetManager(),
    'toggle-prompt-manager': () => layoutManager.togglePromptManager(),
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
    // Manager positions
    'lore-manager-left': () => moveLoreManager('left'),
    'lore-manager-right': () => moveLoreManager('right'),
    'lore-manager-far-left': () => moveLoreManager('far-left'),
    'lore-manager-far-right': () => moveLoreManager('far-right'),
    'lore-manager-top': () => moveLoreManager('top'),
    'lore-manager-bottom': () => moveLoreManager('bottom'),
    'lore-manager-hide': () => moveLoreManager('hide'),
    'asset-manager-left': () => moveAssetManager('left'),
    'asset-manager-right': () => moveAssetManager('right'),
    'asset-manager-far-left': () => moveAssetManager('far-left'),
    'asset-manager-far-right': () => moveAssetManager('far-right'),
    'asset-manager-top': () => moveAssetManager('top'),
    'asset-manager-bottom': () => moveAssetManager('bottom'),
    'asset-manager-hide': () => moveAssetManager('hide'),
    'prompt-manager-left': () => movePromptManager('left'),
    'prompt-manager-right': () => movePromptManager('right'),
    'prompt-manager-far-left': () => movePromptManager('far-left'),
    'prompt-manager-far-right': () => movePromptManager('far-right'),
    'prompt-manager-top': () => movePromptManager('top'),
    'prompt-manager-bottom': () => movePromptManager('bottom'),
    'prompt-manager-hide': () => movePromptManager('hide'),
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
    'preview-test': () => showPreviewPanel(),
    devtools: () => window.tokiAPI.toggleDevTools(),

    // Terminal
    'claude-start': () => handleClaudeStart(),
    'copilot-start': () => handleCopilotStart(),
    'codex-start': () => handleCodexStart(),
    'antigravity-start': () => handleAntigravityStart(),
    'terminal-clear': () => {
      if (term) term.clear();
    },
    'terminal-restart': () => restartTerminal(),

    // Settings & buttons (now handled by Vue template @click)
    settings: () => showSettingsPopup(),
    'terminal-bg': () => handleTerminalBg(),
    'sidebar-expand': () => moveItems(layoutState.itemsPos),
    help: () => showHelpPopup(),
  });
  initBgm(settingsSnapshot.bgmEnabled, settingsSnapshot.bgmPath);
  syncStoreState();
  initResizers();
  initKeyboard({
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    closeActiveTab: () => {
      if (tabMgr.activeTabId) void tabMgr.requestCloseTab(tabMgr.activeTabId);
    },
    toggleSidebar,
    toggleTerminal,
    showPreviewPanel,
    showSettingsPopup,
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
  try {
    await runStartupSessionRecovery({
      api: {
        getPendingSessionRecovery: () => window.tokiAPI.getPendingSessionRecovery(),
        resolvePendingSessionRecovery: (action) => window.tokiAPI.resolvePendingSessionRecovery(action),
      },
      showRecoveryDialog: showSessionRecoveryDialog,
      applyRecoveredDocument: applyLoadedDocument,
      setRestoredSessionLabel: (label) => useAppStore().setRestoredSessionLabel(label),
      showRestoredSessionStatus: (text) => useAppStore().showRestoredSessionStatus(text),
    });
  } catch (error) {
    reportRuntimeError({
      context: '자동 저장 복원 초기화 실패',
      error,
      logPrefix: '[Recovery]',
      setStatus,
    });
  }

  // ---- Inline name editing on #file-label double-click ----
  const fileLabelEl = document.getElementById('file-label');
  if (fileLabelEl) {
    fileLabelEl.addEventListener('dblclick', () => {
      if (!fileData) return;
      const currentName = (fileData.name as string) || '';
      const input = document.createElement('input');
      input.id = 'file-label-input';
      input.type = 'text';
      input.value = currentName;
      const originalText = fileLabelEl.textContent;
      fileLabelEl.textContent = '';
      fileLabelEl.appendChild(input);
      input.focus();
      input.select();

      const commit = () => {
        const newName = input.value.trim();
        if (input.parentNode) {
          input.remove();
          fileLabelEl.textContent = newName || originalText || 'Untitled';
        }
        if (newName && newName !== currentName) {
          fileData!.name = newName;
          tabMgr.markFieldDirty('name');
          useAppStore().setFileLabel(newName);
          setStatus(`봇 이름 변경됨: ${newName}`);
        }
      };
      const cancel = () => {
        if (input.parentNode) {
          input.remove();
          fileLabelEl.textContent = originalText;
        }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });
      input.addEventListener('blur', commit);
    });
  }

  initSidebarSplitResizer();
  initTokiAvatarUi(document.getElementById('toki-avatar-display')!, { darkMode, setStatus });
  refreshThemeUi(); // Apply the persisted app theme without changing RP mode
  initChatModeUi(document.getElementById('terminal-area')!, {
    chatSession,
    fitTerminal: () => {
      if (fitAddon && term) setTimeout(() => fitAddon.fit(), 20);
    },
    isTerminalReady: () => !!term,
    terminalInput: (text) => sendTerminalInputToSession(activeTerminalSessionId, text),
  });
  initRightManagerPanel({
    getFileData: () => fileData,
    getProjectPath: () => currentProjectPath,
    openLorebookEntry,
    addLorebookEntry: addNewLorebook,
    addLorebookFolder: addNewLorebookFolder,
    renameLorebook,
    commitLorebookName: renameLorebookTo,
    reorderLorebook,
    deleteLorebook,
    deleteLorebookMany,
    moveLorebookManyToFolder,
    openImageTab,
    addAssetFromDialog,
    addAssetBuffer: (name, data, folder) => window.tokiAPI.addAssetBuffer(name, data, folder),
    renameAsset: renameAssetFromManager,
    renameAssetsBatch: renameAssetsBatchFromManager,
    deleteAssets: deleteAssetsFromManager,
    getAssetList: () => window.tokiAPI.getAssetList(),
    getAssetData: (path) => window.tokiAPI.getAssetData(path),
    showPrompt,
    showConfirm,
    setStatus,
    refresh: buildSidebar,
    afterRender: initPanelDragDrop,
  });
  initPromptManagerPanel({
    getFileData: () => fileData,
    openPromptItem: openRisupPromptItemTab,
    setPromptTemplate: setRisupPromptTemplate,
    confirm: showConfirm,
    setStatus,
    refresh: buildSidebar,
    afterRender: initPanelDragDrop,
  });
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

  window.tokiAPI.onProjectFolderChanged(async (payload) => {
    if (tabMgr.dirtyFields.size > 0) {
      setStatus(
        `프로젝트 파일 변경 감지됨: ${payload.fileName || payload.path}. 저장되지 않은 탭이 있어 자동 반영하지 않았습니다.`,
      );
      return;
    }
    const result = await window.tokiAPI.reloadProjectFolder();
    if (!result.success || !result.data) {
      setStatus(`프로젝트 다시 불러오기 실패: ${result.error || '알 수 없는 오류'}`);
      return;
    }
    setCurrentFileData(result.data as CharxData);
    currentProjectPath = result.projectPath || currentProjectPath;
    buildSidebar();
    setStatus(`프로젝트 변경 반영됨: ${payload.fileName || payload.path}`);
  });

  // Listen for MCP data updates (AI assistant modified data via MCP server)
  window.tokiAPI.onDataUpdated((field, value) => {
    if (!fileData) return;
    // (debug log removed)

    const updatePlan =
      field === 'triggerScripts'
        ? applyTriggerScriptsControllerMcpUpdate({
            tabMgr,
            fileData,
            value,
            createBackup,
            activateTab: (tab) => createOrSwitchEditor(tab),
          })
        : planMcpDataUpdate(field, tabMgr.openTabs);
    if (field !== 'triggerScripts') {
      for (const tabId of updatePlan.backupTabIds) {
        const tab = tabMgr.openTabs.find((entry) => entry.id === tabId);
        if (tab?.getValue) {
          createBackup(tab.id, tab.getValue());
        }
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
      if (field !== 'triggerScripts') {
        fileData[field] = value;
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
        } else if (prefix === 'risup_') {
          tabMgr.refreshIndexedTabs(prefix, (_index, tab) => buildRisupTabState(tab.id.replace('risup_', ''), tab));
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

  // Load Terminal (async, non-blocking)
  try {
    await initTerminal();
  } catch (err) {
    console.error('[init] Terminal load failed:', err);
    document.getElementById('terminal-container')!.innerHTML =
      '<div style="color:#f44;padding:8px;font-size:12px;">터미널 로딩 실패: ' + (err as Error).message + '</div>';
  }
}
