import { parseLuaSections, combineLuaSections, parseCssSections, combineCssSections } from '../lib/section-parser';
import type { Section } from '../lib/section-parser';
import type { Tab } from '../lib/tab-manager';
import { registerActions } from '../lib/action-registry';
import { useAppStore } from '../stores/app-store';
import type { RpMode, LorebookEntry, RegexEntry, ReferenceFile, RendererDocumentData } from '../stores/app-store';
import {
  createTreeItem,
  createFolderItem,
  createSectionHeader,
  updateSidebarActive as _updateSidebarActive,
  buildAssetsSidebar as _buildAssetsSidebar,
  createLoreEntryItem as _createLoreEntryItem,
} from '../lib/sidebar-builder';
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
  removeRecentItem,
  subscribeToAppSettings,
  writeAutosaveDir,
  writeAutosaveEnabled,
  writeAutosaveInterval,
  writeBgmEnabled,
  writeBgmPath,
  writeMcpApprovalMode,
  writePreviewFocusByDefault,
  writeRpCustomText,
  writeRpMode,
} from '../lib/app-settings';
import type { McpApprovalMode, RecentItem, RecentSourceFormat } from '../lib/app-settings';
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
import { planMcpDataUpdate } from '../lib/mcp-data-update';
import type { PreviewPanelDeps } from '../lib/preview-panel';
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
import { createProjectWorkspaceController } from './project-workspace-controller';
import { handleMcpDataUpdate } from './mcp-update-controller';
import { createTerminalSessionsController, type TerminalSessionUi } from './terminal-sessions-controller';
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

let fileData: RendererDocumentData | null = null; // Current serialized renderer document data
let currentProjectPath: string | null = null;
let editorInstance: MonacoEditorInstance | null = null; // Monaco editor instance
let previewPanelHandle: { dispose: () => void } | null = null;
let previewRenderVersion = 0;
let monacoReady = false;
let monacoLoadTask: Promise<boolean> | null = null;

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
let previewFocusByDefault = settingsSnapshot.previewFocusByDefault;

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

const terminalSessions = createTerminalSessionsController({
  api: window.tokiAPI,
  getTheme: () => getTheme(themeId, customTheme).terminal,
  onActivity: handleTerminalDataForBgm,
  onActiveTerminalData: (data) => {
    if (isChatMode()) onChatData(data);
    feedBgBuffer(data);
  },
  setActive: setTokiActive,
  setStatus,
});

// Form tab types that use special editors (not Monaco)
const FORM_TAB_TYPES = NON_MONACO_EDITOR_TAB_TYPES;

function disposePreviewPanel(): void {
  previewRenderVersion += 1;
  previewPanelHandle?.dispose();
  previewPanelHandle = null;
}

function disposeEditorSurfaces(): void {
  disposeFormEditors();
  disposePreviewPanel();
}

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
    onDisposeFormEditors: () => disposeEditorSurfaces(),
    onClearEditor: () => {
      document.getElementById('editor-container')!.innerHTML = '<div class="empty-state">항목을 선택하세요</div>';
      editorInstance = null;
      updateSidebarActive();
    },
    isFormTabType: (language) => FORM_TAB_TYPES.has(language),
    onTabsRendered: () => updateDocumentStats(),
  },
  confirmDirtyTabClose,
);

const projectWorkspace = createProjectWorkspaceController({
  api: window.tokiAPI,
  tabManager: tabMgr,
  applyReloadedProject: (data, projectPath) => {
    setCurrentFileData(data);
    currentProjectPath = projectPath || currentProjectPath;
    buildSidebar();
  },
  getEditorValue: () => editorInstance?.getValue() ?? null,
  openImageTab,
  setStatus,
});

initFormEditor({
  isMonacoReady: () => monacoReady,
  getMonacoThemeId: () => defineAppMonacoTheme(themeId, customTheme),
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
      name: opened.name || 'Untitled',
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
    document: fileData,
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

  // Special tab types: preview, image, and structured form editors.

  if (tabInfo.language === '_preview') {
    disposeEditorSurfaces();
    editorInstance?.dispose();
    editorInstance = null;
    container.innerHTML = '';
    tabMgr.activeTabId = tabInfo.id;
    tabMgr.pendingEditorTabId = null;
    tabMgr.renderTabs();
    updateSidebarActive();
    void renderCharacterPreview(container, tabInfo.id);
    return;
  }

  disposePreviewPanel();

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

  disposeEditorSurfaces();
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

async function buildRefsSidebar(): Promise<void> {
  const refsEl = document.getElementById('refs-panel-content') ?? document.getElementById('sidebar-refs');
  if (!refsEl) return;
  const view = useAppStore().rightSidebarView === 'guides' ? 'guides' : 'files';
  await _buildRefsSidebar(refsEl, getRefsSidebarDeps() as unknown as Parameters<typeof _buildRefsSidebar>[1], view);
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
    el.dataset.workspace =
      group.id === 'basic'
        ? 'basic'
        : group.id === 'model-api'
          ? 'model'
          : ['parameters', 'sampling', 'thinking'].includes(group.id)
            ? 'parameters'
            : 'advanced';
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
    el.dataset.workspace = item.id === 'risup_prompt' ? 'prompts' : 'advanced';
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
  for (const child of Array.from(tree.children)) {
    if (!child.getAttribute('data-workspace') && child !== tree.firstElementChild) {
      (child as HTMLElement).dataset.workspace = 'advanced';
    }
  }
  initSidebarDnD(getDndDeps());
}

function tagSidebarSections(tree: HTMLElement): void {
  const sectionMap: Record<string, string> = {
    '캐릭터 정보': 'character',
    '모듈 정보': 'module',
    메시지: 'messages',
    스크립트: 'scripts',
    데이터: 'lorebook',
    에셋: 'assets',
  };
  let workspace = '';
  for (const child of Array.from(tree.children)) {
    const element = child as HTMLElement;
    if (element.classList.contains('sidebar-section-header')) {
      workspace = sectionMap[element.textContent?.trim() || ''] || workspace;
    }
    if (workspace) element.dataset.workspace = workspace;
  }
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
  id: keyof Pick<RendererDocumentData, 'backgroundEmbedding' | 'customModuleToggle'>;
  label: string;
  icon: string;
  lang: string;
  kind?: 'toggle-template';
};

const RISUM_MODULE_SIDEBAR_FIELDS: readonly RisumSidebarField[] = [
  { id: 'backgroundEmbedding', label: '배경 임베딩', icon: '🎨', lang: 'html' },
  { id: 'customModuleToggle', label: '커스텀 토글', icon: '☑', lang: 'plaintext', kind: 'toggle-template' },
] as const;

let documentStatsToken = 0;

function buildSidebar(): void {
  updateDocumentStats();
  destroyAllSortables();
  const tree = document.getElementById('sidebar-tree')!;
  tree.innerHTML = '';

  // Always build refs sidebar regardless of fileData
  buildRefsSidebar();

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
  tagSidebarSections(tree);

  // Assets (images) folder — then initialize drag-and-drop
  buildAssetsSidebar(tree).then(() => {
    initSidebarDnD(getDndDeps());
    renderRightManagerPanel();
    void projectWorkspace.appendFilesSidebar(tree).then(() => appendHiddenFieldWarnings(tree));
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
  const store = useAppStore();
  store.setActiveTabId(tabMgr.activeTabId);
  store.setActiveTabLanguage(activeTab?.language ?? '');
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

// ==================== Fixed Workspace Layout ====================

function refitWorkspace(): void {
  if (editorInstance) editorInstance.layout();
  terminalSessions.fit();
}

function toggleSidebar(): void {
  useAppStore().toggleNavigator();
}

function toggleTerminal(): void {
  useAppStore().toggleUtility('terminal');
}

function toggleAvatar(): void {
  useAppStore().toggleAvatar();
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

function setCurrentFileData(data: RendererDocumentData | null): void {
  fileData = data;
  useAppStore().setFileData(data);
  updateDocumentStats();
}

function resetDocumentWorkspace(): void {
  projectWorkspace.clearRawSyncState();
  disposeEditorSurfaces();
  tabMgr.reset();
  if (editorInstance) {
    editorInstance.dispose();
    editorInstance = null;
  }
  document.getElementById('editor-container')!.innerHTML = '<div class="empty-state">항목을 선택하세요</div>';
  document.getElementById('editor-tabs')!.innerHTML = '';
  updateDocumentStats();
}

function applyLoadedDocument(data: RendererDocumentData): void {
  setCurrentFileData(data);
  resetDocumentWorkspace();
  useAppStore().setFileLabel(data.name || 'Untitled');
  buildSidebar();
}

/** @type {import('../lib/file-actions').FileActionDeps} */
const fileActionDeps: FileActionDeps = {
  getFileData: () => fileData,
  setFileData: (d) => {
    setCurrentFileData(d);
  },
  getEditorInstance: () => editorInstance,
  setEditorInstance: (v) => {
    editorInstance = v;
  },
  disposeEditorSurfaces,
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
  setCurrentFileData(result.data);
  currentProjectPath = result.projectPath || null;
  rememberRecentProject(result.projectPath);
  useAppStore().setFileLabel(`${fileData?.name || 'Untitled'} · 프로젝트 폴더`);
  resetDocumentWorkspace();
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
  setCurrentFileData(result.data);
  currentProjectPath = result.projectPath || null;
  rememberRecentProject(result.projectPath);
  useAppStore().setFileLabel(`${fileData?.name || 'Untitled'} · 프로젝트 폴더`);
  resetDocumentWorkspace();
  buildSidebar();
  await window.tokiAPI.watchProjectFolder();
  setStatus(`프로젝트 폴더 열림: 구조화 편집을 기본으로 사용합니다. (${result.projectPath})`);
}

async function handleCloneProjectFolder(): Promise<void> {
  if (!currentProjectPath) {
    setStatus('복제할 프로젝트 폴더가 열려 있지 않습니다');
    return;
  }
  if (!(await projectWorkspace.syncActiveFileTab())) return;
  if (tabMgr.dirtyFields.size > 0) {
    await handleSave();
    if (tabMgr.dirtyFields.size > 0) return;
  }
  const result = await window.tokiAPI.cloneProjectFolder();
  if (!result.success) {
    if (!result.canceled) setStatus(`프로젝트 복제 실패: ${result.error || '알 수 없는 오류'}`);
    return;
  }
  setCurrentFileData(result.data);
  currentProjectPath = result.projectPath || null;
  rememberRecentProject(result.projectPath);
  useAppStore().setFileLabel(`${fileData?.name || 'Untitled'} · 프로젝트 폴더`);
  resetDocumentWorkspace();
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
      setCurrentFileData(result.data);
      currentProjectPath = result.projectPath || null;
      useAppStore().setFileLabel(`${fileData?.name || 'Untitled'} · 프로젝트 폴더`);
      resetDocumentWorkspace();
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

async function handleSave(): Promise<void> {
  if (!(await projectWorkspace.syncActiveFileTab())) return;
  return _handleSave(fileActionDeps);
}
async function handleSaveAs(): Promise<void> {
  if (!(await projectWorkspace.syncActiveFileTab())) return;
  return _handleSaveAs(fileActionDeps);
}

async function handleReassembleProjectDocument(): Promise<void> {
  if (!(await projectWorkspace.syncActiveFileTab())) return;
  const fileData = fileActionDeps.getFileData();
  const result = await window.tokiAPI.reassembleProjectDocument(fileData || undefined);
  setStatus(result.success ? `파일 내보내기 완료: ${result.path}` : `파일 내보내기 실패: ${result.error}`);
}

// ==================== RP Mode ====================
// RP mode UI is in ./settings-handlers.ts

// Trigger script text helpers are in ./trigger-script-utils.ts

async function createAssistantTerminalSession(name: string): Promise<TerminalSessionUi> {
  return terminalSessions.createSession(name);
}

function getAssistantDeps(sessionId?: string) {
  const session = sessionId ? terminalSessions.getSession(sessionId) : terminalSessions.getActiveSession();
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
    terminalInput: (text: string) => terminalSessions.sendInput(text, session?.id),
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

// ==================== App Theme ====================

function getThemeUiDeps() {
  return {
    getEditorInstance: () => editorInstance as { updateOptions(opts: unknown): void } | null,
    getFormEditors: () => getFormEditors() as Array<{ updateOptions(opts: unknown): void }>,
    getTerminal: () => terminalSessions.getTerminal() as { options: { theme: unknown } } | null,
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

// Help popup and syntax reference are now in '../lib/help-popup'

// ==================== Autosave ====================
// Autosave is in ./settings-handlers.ts

function getAutosaveDeps() {
  return {
    getAutosaveEnabled: () => autosaveEnabled,
    getAutosaveInterval: () => autosaveInterval,
    getAutosaveDir: () => autosaveDir,
    getDirtyFieldCount: () => (documentSwitchInProgress ? 0 : tabMgr.dirtyFields.size),
    getFileData: () => fileData,
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
      previewFocusByDefault,
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
      syncStoreState();
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
      syncStoreState();
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
    onPreviewFocusByDefaultChange(enabled) {
      previewFocusByDefault = enabled;
      writePreviewFocusByDefault(enabled);
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
    const { showMarkdownPreview } = await import('../lib/markdown-preview');
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

  tabMgr.openTab('preview', `${fileData.name || 'Character'} · 프리뷰`, '_preview', () => null, null);
}

async function renderCharacterPreview(container: HTMLElement, tabId: string): Promise<void> {
  if (!fileData || (fileData._fileType || 'charx') !== 'charx') return;
  const renderVersion = ++previewRenderVersion;
  const activeFileData = fileData;
  container.innerHTML = '<div class="preview-loading-state">프리뷰 준비 중…</div>';

  const previewModulesPromise = Promise.all([import('../lib/preview-engine'), import('../lib/preview-panel')]);

  // Load all assets (name → data URI)
  let assetMapForEngine: Record<string, string> = {};
  let previewAssets: PreviewPanelDeps['previewAssets'] = null;
  try {
    const assetResult = await window.tokiAPI.getAllAssetsMap();
    previewAssets = assetResult;
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

  const [{ default: PreviewEngine }, { showPreviewPanel: renderPreviewPanel }] = await previewModulesPromise;
  if (renderVersion !== previewRenderVersion || tabMgr.activeTabId !== tabId || fileData !== activeFileData) return;
  PreviewEngine.setErrorHandler((context, message) => {
    setStatus(`⚠️ ${context}: ${message}`);
  });

  container.innerHTML = '';
  previewPanelHandle = renderPreviewPanel(container, {
    fileData: activeFileData,
    assetMap: assetMapForEngine,
    previewAssets,
    engine: PreviewEngine,
    setStatus,
    toggleFocusMode: () => useAppStore().togglePreviewFocusMode(),
    exitFocusMode: () => useAppStore().setPreviewFocusMode(false),
    subscribeFocusMode: (listener) => {
      const store = useAppStore();
      listener(store.previewFocusMode);
      return store.$subscribe((_mutation, state) => listener(state.previewFocusMode), { detached: true });
    },
  });
  if (previewFocusByDefault) useAppStore().setPreviewFocusMode(true);
}

// ==================== Keyboard Shortcuts ====================
// Keyboard shortcuts are in ./keyboard-shortcuts.ts

function togglePreviewFocusModeShortcut(): void {
  const activeTab = tabMgr.activeTabId ? tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId) : null;
  if (activeTab?.language !== '_preview') return;
  useAppStore().togglePreviewFocusMode();
}

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
    previewFocusByDefault = snapshot.previewFocusByDefault;
    if (themeChanged) {
      refreshThemeUi();
    }
    // Sync to Pinia store for reactive UI
    syncStoreState();
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
    'refresh-references': () => {
      void buildRefsSidebar();
    },
    'asset-output-wizard': () => useAppStore().setAssetWizardOpen(true),
    'workspace-model-change': (payload) => {
      const change = (payload || {}) as { tabId?: string; field?: string };
      if (!change.field) return;
      tabMgr.markFieldDirty(change.field);
      if (change.tabId) tabMgr.markDirtyForTabId(change.tabId);
      if (change.field === 'lorebook') tabMgr.refreshIndexedTabs('lore_', buildLorebookTabState);
      if (change.field === 'regex') tabMgr.refreshIndexedTabs('regex_', buildRegexTabState);
      if (change.field === 'promptTemplate') {
        tabMgr.refreshIndexedTabs('risup_prompt_item_', (_index, tab) =>
          buildRisupPromptItemTabState(String(tab._promptItemId || tab.id.replace('risup_prompt_item_', '')), tab),
        );
        tabMgr.refreshIndexedTabs('risup_', (_index, tab) => buildRisupTabState(tab.id.replace('risup_', ''), tab));
      }
      buildSidebar();
      renderRightManagerPanel();
      renderPromptManagerPanel();
      setStatus('변경사항이 문서에 반영되었습니다');
    },
    'asset-rename-selected': async (payload) => {
      const path = typeof payload === 'string' ? payload : '';
      if (!path) return;
      const currentName = path.split('/').pop() || path;
      const nextName = await showPrompt('새 파일명을 입력하세요. 확장자는 유지해야 합니다.', currentName);
      if (nextName === null) return;
      const error = await renameAssetFromManager(path, nextName);
      if (error) setStatus(error);
      else renderRightManagerPanel();
    },
    'asset-delete-selected': async (payload) => {
      const path = typeof payload === 'string' ? payload : '';
      if (!path) return;
      await deleteAssetsFromManager([path]);
      renderRightManagerPanel();
    },
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
      terminalSessions.clearActiveTerminal();
    },
    'terminal-restart': () => terminalSessions.restart(),
    'toggle-bgm': () => {
      const enabled = !isBgmEnabled();
      setBgmEnabled(enabled);
      writeBgmEnabled(enabled);
      if (!enabled) pauseBgm();
      syncStoreState();
      setStatus(`BGM ${enabled ? '켜짐' : '꺼짐'}`);
    },
    'cycle-rp-mode': () => {
      const modes: RpMode[] = rpCustomText.trim() ? ['off', 'toki', 'aris', 'custom'] : ['off', 'toki', 'aris'];
      const currentIndex = modes.indexOf(rpMode);
      rpMode = modes[(currentIndex + 1) % modes.length] || 'off';
      writeRpMode(rpMode);
      syncStoreState();
      setStatus(`RP 모드: ${useAppStore().rpLabel}`);
    },

    // Settings & buttons (now handled by Vue template @click)
    settings: () => showSettingsPopup(),
    'terminal-bg': () => handleTerminalBg(),
    help: () => showHelpPopup(),
  });
  initBgm(settingsSnapshot.bgmEnabled, settingsSnapshot.bgmPath);
  syncStoreState();
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
    togglePreviewFocusMode: togglePreviewFocusModeShortcut,
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

  initTokiAvatarUi(document.getElementById('toki-avatar-display')!, { darkMode, setStatus });
  refreshThemeUi(); // Apply the persisted app theme without changing RP mode
  initChatModeUi(document.getElementById('terminal-area')!, {
    chatSession,
    fitTerminal: () => {
      terminalSessions.fit(20);
    },
    isTerminalReady: () => !!terminalSessions.getTerminal(),
    terminalInput: (text) => terminalSessions.sendInput(text),
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
  });
  initPromptManagerPanel({
    getFileData: () => fileData,
    openPromptItem: openRisupPromptItemTab,
    setPromptTemplate: setRisupPromptTemplate,
    confirm: showConfirm,
    setStatus,
    refresh: buildSidebar,
  });
  if (autosaveEnabled) startAutosave(getAutosaveDeps());
  await buildRefsSidebar(); // Load guides & refs even without a file open
  const referenceManifestStatus = await window.tokiAPI.getReferenceManifestStatus();
  if (referenceManifestStatus) {
    const prefix = referenceManifestStatus.level === 'error' ? '참고자료 오류' : '참고자료 경고';
    const detail = referenceManifestStatus.detail ? ` — ${referenceManifestStatus.detail}` : '';
    setStatus(`${prefix}: ${referenceManifestStatus.message}${detail}`);
  }

  window.tokiAPI.onProjectFolderChanged((payload) => {
    void projectWorkspace.handleFolderChanged(payload);
  });

  // Listen for MCP data updates (AI assistant modified data via MCP server)
  window.tokiAPI.onDataUpdated((field, value) => {
    handleMcpDataUpdate(
      {
        tabManager: tabMgr,
        getFileData: () => fileData,
        getEditor: () => editorInstance,
        formTabTypes: FORM_TAB_TYPES,
        createBackup,
        buildSidebar,
        buildLorebookTabState,
        buildRegexTabState,
        buildLuaSectionTabState,
        buildCssSectionTabState,
        buildRisupTabState,
        applyTriggerScriptsUpdate: (nextValue) =>
          applyTriggerScriptsControllerMcpUpdate({
            tabMgr,
            fileData: fileData!,
            value: nextValue,
            createBackup,
            activateTab: (tab) => createOrSwitchEditor(tab),
          }),
        mergeLuaIntoTriggerScripts: mergeLuaIntoTriggerScriptsText,
        updateLuaSections: (lua) => {
          luaSections = parseLuaSections(lua);
        },
        updateCssSections: (css) => {
          ({ sections: cssSections, prefix: _cssStylePrefix, suffix: _cssStyleSuffix } = parseCssSections(css));
        },
        setFileLabel: (label) => useAppStore().setFileLabel(label),
        setStatus,
      },
      field,
      value,
    );
  });
  // Load Terminal (async, non-blocking)
  try {
    await terminalSessions.init();
  } catch (err) {
    console.error('[init] Terminal load failed:', err);
    document.getElementById('terminal-container')!.innerHTML =
      '<div style="color:#f44;padding:8px;font-size:12px;">터미널 로딩 실패: ' + (err as Error).message + '</div>';
  }
}
