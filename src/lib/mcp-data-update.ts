export interface McpUpdateTabLike {
  getValue?: () => unknown;
  id: string;
}

export interface McpDataUpdatePlan {
  backupTabIds: string[];
  refreshIndexedPrefixes: string[];
  refreshSidebar: boolean;
  statusMessage: string;
  updateFileLabel: boolean;
}

function getBackupTabIds(field: string, openTabs: McpUpdateTabLike[]): string[] {
  if (field === 'lorebook') {
    return openTabs
      .filter((tab) => tab.id.startsWith('lore_') && tab.getValue)
      .map((tab) => tab.id);
  }

  if (field === 'regex') {
    return openTabs
      .filter((tab) => tab.id.startsWith('regex_') && tab.getValue)
      .map((tab) => tab.id);
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

  const tab = openTabs.find((entry) => entry.id === field && entry.getValue);
  return tab ? [tab.id] : [];
}

export function planMcpDataUpdate(field: string, openTabs: McpUpdateTabLike[]): McpDataUpdatePlan {
  if (field === 'lorebook') {
    return {
      backupTabIds: getBackupTabIds(field, openTabs),
      refreshIndexedPrefixes: ['lore_'],
      refreshSidebar: true,
      statusMessage: 'AI 어시스턴트가 로어북을 수정했습니다',
      updateFileLabel: false
    };
  }

  if (field === 'regex') {
    return {
      backupTabIds: getBackupTabIds(field, openTabs),
      refreshIndexedPrefixes: ['regex_'],
      refreshSidebar: true,
      statusMessage: 'AI 어시스턴트가 정규식을 수정했습니다',
      updateFileLabel: false
    };
  }

  const refreshIndexedPrefixes: string[] = [];
  let refreshSidebar = false;
  if (field === 'lua') {
    refreshIndexedPrefixes.push('lua_s');
    refreshSidebar = true;
  }
  if (field === 'css') {
    refreshIndexedPrefixes.push('css_s');
    refreshSidebar = true;
  }

  return {
    backupTabIds: getBackupTabIds(field, openTabs),
    refreshIndexedPrefixes,
    refreshSidebar,
    statusMessage: `AI 어시스턴트가 ${field} 필드를 수정했습니다`,
    updateFileLabel: field === 'name'
  };
}
