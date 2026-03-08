export type IndexedTab = {
  id: string;
  [key: string]: unknown;
};

export function createRemovalIndexResolver(removedIndices: number[]) {
  const removed = [...new Set(removedIndices)]
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((left, right) => left - right);

  return (oldIndex: number): number | null => {
    if (!Number.isInteger(oldIndex) || oldIndex < 0) return null;
    if (removed.includes(oldIndex)) return null;

    let shift = 0;
    for (const removedIndex of removed) {
      if (removedIndex >= oldIndex) break;
      shift += 1;
    }
    return oldIndex - shift;
  };
}

interface RemapIndexedTabsOptions<TTab extends IndexedTab> {
  tabs: TTab[];
  dirtyIds: Set<string>;
  activeTabId: string | null;
  prefix: string;
  resolveIndex: (oldIndex: number) => number | null;
  buildTabState: (index: number, tab: TTab) => Partial<TTab> | null;
}

export function remapIndexedTabs<TTab extends IndexedTab>({
  tabs,
  dirtyIds,
  activeTabId,
  prefix,
  resolveIndex,
  buildTabState
}: RemapIndexedTabsOptions<TTab>) {
  const nextTabs: TTab[] = [];
  const nextDirtyIds = new Set<string>();
  let nextActiveTabId = activeTabId;

  for (const tab of tabs) {
    if (!tab.id.startsWith(prefix)) {
      nextTabs.push(tab);
      if (dirtyIds.has(tab.id)) nextDirtyIds.add(tab.id);
      continue;
    }

    const oldIndex = Number.parseInt(tab.id.slice(prefix.length), 10);
    if (Number.isNaN(oldIndex)) {
      nextTabs.push(tab);
      if (dirtyIds.has(tab.id)) nextDirtyIds.add(tab.id);
      continue;
    }

    const nextIndex = resolveIndex(oldIndex);
    if (nextIndex == null) {
      if (activeTabId === tab.id) nextActiveTabId = null;
      continue;
    }

    const nextTabState = buildTabState(nextIndex, tab);
    if (!nextTabState) {
      if (activeTabId === tab.id) nextActiveTabId = null;
      continue;
    }

    const nextTab = { ...tab, ...nextTabState };
    nextTabs.push(nextTab);

    if (dirtyIds.has(tab.id)) nextDirtyIds.add(nextTab.id);
    if (activeTabId === tab.id) nextActiveTabId = nextTab.id;
  }

  return {
    tabs: nextTabs,
    dirtyIds: nextDirtyIds,
    activeTabId: nextActiveTabId
  };
}
