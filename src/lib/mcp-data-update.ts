import { isRisupEditableFieldId } from './risup-fields';

export interface McpUpdateTabLike {
  getValue?: () => unknown;
  id: string;
}

export interface McpDataUpdatePlan {
  backupTabIds: string[];
  refreshTabIds: string[];
  refreshIndexedPrefixes: string[];
  refreshSidebar: boolean;
  statusMessage: string;
  updateFileLabel: boolean;
}

export interface TriggerScriptsTabLike {
  id: string;
  label?: string;
  language?: string;
  getValue?: () => unknown;
  setValue?: ((value: unknown) => void) | null;
  _triggerSelectedIndex?: number;
  _lastValue?: unknown;
}

export interface TriggerScriptsTabRefreshOptions<TTab extends TriggerScriptsTabLike = TriggerScriptsTabLike> {
  openTabs: TTab[];
  activeTabId: string | null;
  buildTabState: (tab?: TTab) => TriggerScriptsTabLike | null;
  activateTab: (tab: TTab) => void;
}

function getBackupTabIds(field: string, openTabs: McpUpdateTabLike[]): string[] {
  const backupIds = new Set<string>();

  if (field === 'lorebook') {
    return openTabs.filter((tab) => tab.id.startsWith('lore_') && tab.getValue).map((tab) => tab.id);
  }

  if (field === 'regex') {
    return openTabs.filter((tab) => tab.id.startsWith('regex_') && tab.getValue).map((tab) => tab.id);
  }

  if (field === 'lua' || field === 'css') {
    return openTabs
      .filter((tab) => {
        if (!tab.getValue) return false;
        return field === 'lua'
          ? tab.id === 'lua' || tab.id.startsWith('lua_s')
          : tab.id === 'css' || tab.id.startsWith('css_s');
      })
      .map((tab) => tab.id);
  }

  if (isRisupEditableFieldId(field)) {
    for (const tab of openTabs) {
      if (tab.id.startsWith('risup_') && tab.getValue) {
        backupIds.add(tab.id);
      }
    }
  }

  const tab = openTabs.find((entry) => entry.id === field && entry.getValue);
  if (tab) {
    backupIds.add(tab.id);
  }
  return [...backupIds];
}

export function planMcpDataUpdate(field: string, openTabs: McpUpdateTabLike[]): McpDataUpdatePlan {
  if (field === 'lorebook') {
    return {
      backupTabIds: getBackupTabIds(field, openTabs),
      refreshTabIds: [],
      refreshIndexedPrefixes: ['lore_'],
      refreshSidebar: true,
      statusMessage: 'AI 어시스턴트가 로어북을 수정했습니다',
      updateFileLabel: false,
    };
  }

  if (field === 'regex') {
    return {
      backupTabIds: getBackupTabIds(field, openTabs),
      refreshTabIds: [],
      refreshIndexedPrefixes: ['regex_'],
      refreshSidebar: true,
      statusMessage: 'AI 어시스턴트가 정규식을 수정했습니다',
      updateFileLabel: false,
    };
  }

  const refreshIndexedPrefixes: string[] = [];
  const refreshTabIds: string[] = [];
  let refreshSidebar = false;
  const hasOpenRisupTabs = openTabs.some((tab) => tab.id.startsWith('risup_') && tab.getValue);
  if (field === 'lua') {
    refreshIndexedPrefixes.push('lua_s');
    refreshSidebar = true;
  }
  if (field === 'css') {
    refreshIndexedPrefixes.push('css_s');
    refreshSidebar = true;
  }
  if (isRisupEditableFieldId(field) && hasOpenRisupTabs) {
    refreshIndexedPrefixes.push('risup_');
  }
  if (field === 'triggerScripts' && openTabs.some((tab) => tab.id === 'triggerScripts' && tab.getValue)) {
    refreshTabIds.push('triggerScripts');
  }

  return {
    backupTabIds: getBackupTabIds(field, openTabs),
    refreshTabIds,
    refreshIndexedPrefixes,
    refreshSidebar,
    statusMessage: `AI 어시스턴트가 ${field} 필드를 수정했습니다`,
    updateFileLabel: field === 'name',
  };
}

export function refreshOpenTriggerScriptsTab<TTab extends TriggerScriptsTabLike>(
  options: TriggerScriptsTabRefreshOptions<TTab>,
): void {
  const openTriggerTab = options.openTabs.find((tab) => tab.id === 'triggerScripts');
  if (!openTriggerTab) return;

  const nextTriggerTabState = options.buildTabState(openTriggerTab);
  if (!nextTriggerTabState) return;

  Object.assign(openTriggerTab, nextTriggerTabState);

  if (options.activeTabId === openTriggerTab.id) {
    options.activateTab(openTriggerTab);
  }
}
