import {
  createTriggerScriptsFormTab,
  openTriggerScriptsFormTab,
  type TriggerScriptsFormTabManagerLike,
} from './form-editor';
import { refreshOpenTriggerScriptsTab, type TriggerScriptsTabLike } from './mcp-data-update';
import type { TriggerFormTabInfo } from './trigger-form-editor';
import { tryExtractPrimaryLuaFromTriggerScriptsText } from './trigger-script-model';

export interface TriggerScriptsRuntimeFileData {
  triggerScripts: unknown;
  lua?: string;
}

export interface ApplyTriggerScriptsMcpRefreshOptions<TTab extends TriggerScriptsTabLike = TriggerScriptsTabLike> {
  activeTabId: string | null;
  activateTab: (tab: TTab) => void;
  fileData: TriggerScriptsRuntimeFileData | null;
  openTabs: TTab[];
  value: unknown;
}

export function normalizeTriggerScriptsText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value ?? [], null, 2);
  } catch {
    return '[]';
  }
}

export function syncTriggerScriptsText(fileData: TriggerScriptsRuntimeFileData, text: string): void {
  fileData.triggerScripts = text;
  const nextLua = tryExtractPrimaryLuaFromTriggerScriptsText(text);
  if (nextLua !== null) {
    fileData.lua = nextLua;
  }
}

function buildTriggerScriptsTabState<TTab extends TriggerScriptsTabLike>(
  fileData: TriggerScriptsRuntimeFileData | null,
  tab?: TTab,
): TriggerFormTabInfo | null {
  if (!fileData) return null;

  return createTriggerScriptsFormTab({
    id: 'triggerScripts',
    label: '트리거 스크립트',
    getText: () => normalizeTriggerScriptsText(fileData.triggerScripts),
    setText: (text) => {
      syncTriggerScriptsText(fileData, text);
    },
    selectedIndex: typeof tab?._triggerSelectedIndex === 'number' ? tab._triggerSelectedIndex : undefined,
  });
}

export function openTriggerScriptsTab(
  tabMgr: TriggerScriptsFormTabManagerLike,
  fileData: TriggerScriptsRuntimeFileData | null,
): TriggerFormTabInfo | null {
  if (!fileData) return null;

  return openTriggerScriptsFormTab(tabMgr, {
    id: 'triggerScripts',
    label: '트리거 스크립트',
    getText: () => normalizeTriggerScriptsText(fileData.triggerScripts),
    setText: (text) => {
      syncTriggerScriptsText(fileData, text);
    },
  });
}

export function applyTriggerScriptsMcpRefresh<TTab extends TriggerScriptsTabLike>(
  options: ApplyTriggerScriptsMcpRefreshOptions<TTab>,
): void {
  if (!options.fileData) return;

  syncTriggerScriptsText(options.fileData, normalizeTriggerScriptsText(options.value));
  refreshOpenTriggerScriptsTab({
    openTabs: options.openTabs,
    activeTabId: options.activeTabId,
    buildTabState: (tab) => buildTriggerScriptsTabState(options.fileData, tab),
    activateTab: options.activateTab,
  });
}
