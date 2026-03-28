import type { TriggerScriptsFormTabManagerLike } from '../lib/form-editor';
import { planMcpDataUpdate, type McpDataUpdatePlan, type TriggerScriptsTabLike } from '../lib/mcp-data-update';
import type { TriggerFormTabInfo } from '../lib/trigger-form-editor';
import {
  applyTriggerScriptsMcpRefresh,
  openTriggerScriptsTab,
  syncTriggerScriptsText,
  type TriggerScriptsRuntimeFileData,
} from '../lib/trigger-scripts-runtime';
import {
  parseTriggerScriptsText,
  serializeTriggerScriptModel,
  type TriggerScriptModel,
} from '../lib/trigger-script-model';

export type TriggerScriptsControllerTabManager<TTab extends TriggerScriptsTabLike = TriggerScriptsTabLike> =
  TriggerScriptsFormTabManagerLike & {
    activeTabId: string | null;
    openTabs: TTab[];
    renderTabs: () => void;
  };

export interface TriggerScriptsActivationDeps {
  showTriggerEditor: (tabInfo: TriggerFormTabInfo) => void;
  updateSidebarActive: () => void;
}

export interface TriggerScriptsControllerMcpUpdateOptions<TTab extends TriggerScriptsTabLike = TriggerScriptsTabLike> {
  activateTab: (tab: TTab) => void;
  createBackup: (tabId: string, value: unknown) => void;
  fileData: TriggerScriptsRuntimeFileData | null;
  tabMgr: Pick<TriggerScriptsControllerTabManager<TTab>, 'activeTabId' | 'openTabs'>;
  value: unknown;
}

export interface TriggerScriptsControllerRestoreOptions<TTab extends TriggerScriptsTabLike = TriggerScriptsTabLike> {
  activeTabId: string | null;
  activateTab: (tab: TTab) => void;
  backupContent: unknown;
  fileData: TriggerScriptsRuntimeFileData | null;
  tab?: TTab | null;
}

export interface TriggerScriptsPreRestoreBackupOptions<TTab extends TriggerScriptsTabLike = TriggerScriptsTabLike> {
  activeTabId: string | null;
  createBackup: (tabId: string, value: unknown) => void;
  tab?: TTab | null;
}

function getTriggerScriptsBackupText(backupContent: unknown): string {
  if (typeof backupContent === 'string') {
    return backupContent;
  }

  if (
    backupContent &&
    typeof backupContent === 'object' &&
    Array.isArray((backupContent as { triggers?: unknown[] }).triggers)
  ) {
    return serializeTriggerScriptModel(backupContent as Pick<TriggerScriptModel, 'triggers'>);
  }

  try {
    return JSON.stringify(backupContent ?? [], null, 2);
  } catch {
    return '[]';
  }
}

export function activateTriggerScriptsFormTab(
  tabInfo: TriggerFormTabInfo,
  tabMgr: Pick<TriggerScriptsControllerTabManager, 'activeTabId' | 'renderTabs'>,
  deps: TriggerScriptsActivationDeps,
): boolean {
  if (tabInfo.language !== '_triggerform') {
    return false;
  }

  tabMgr.activeTabId = tabInfo.id;
  deps.showTriggerEditor(tabInfo);
  tabMgr.renderTabs();
  deps.updateSidebarActive();
  return true;
}

export function openTriggerScriptsControllerTab<TTab extends TriggerScriptsTabLike>(
  tabMgr: TriggerScriptsControllerTabManager<TTab>,
  fileData: TriggerScriptsRuntimeFileData | null,
): TriggerFormTabInfo | null {
  return openTriggerScriptsTab(tabMgr, fileData);
}

export function applyTriggerScriptsControllerMcpUpdate<TTab extends TriggerScriptsTabLike>(
  options: TriggerScriptsControllerMcpUpdateOptions<TTab>,
): McpDataUpdatePlan {
  const updatePlan = planMcpDataUpdate('triggerScripts', options.tabMgr.openTabs);

  for (const tabId of updatePlan.backupTabIds) {
    const tab = options.tabMgr.openTabs.find((entry) => entry.id === tabId);
    if (tab?.getValue) {
      options.createBackup(tab.id, tab.getValue());
    }
  }

  applyTriggerScriptsMcpRefresh({
    fileData: options.fileData,
    value: options.value,
    openTabs: options.tabMgr.openTabs,
    activeTabId: options.tabMgr.activeTabId,
    activateTab: options.activateTab,
  });

  return updatePlan;
}

export function backupActiveTriggerScriptsRestoreDraft<TTab extends TriggerScriptsTabLike>(
  options: TriggerScriptsPreRestoreBackupOptions<TTab>,
): void {
  if (options.activeTabId !== 'triggerScripts' || !options.tab?.getValue) {
    return;
  }

  options.createBackup(options.tab.id, options.tab.getValue());
}

export function restoreTriggerScriptsControllerBackup<TTab extends TriggerScriptsTabLike>(
  options: TriggerScriptsControllerRestoreOptions<TTab>,
): boolean {
  const text = getTriggerScriptsBackupText(options.backupContent);

  if (options.tab?.setValue) {
    const draft =
      typeof options.backupContent === 'string'
        ? parseTriggerScriptsText(text)
        : options.backupContent &&
            typeof options.backupContent === 'object' &&
            'triggers' in (options.backupContent as object)
          ? (options.backupContent as Pick<TriggerScriptModel, 'triggers'>)
          : parseTriggerScriptsText(text);
    options.tab.setValue(draft);
    if (options.activeTabId === options.tab.id) {
      options.activateTab(options.tab);
    }
    return true;
  }

  if (!options.fileData) {
    return false;
  }

  syncTriggerScriptsText(options.fileData, text);
  return true;
}
