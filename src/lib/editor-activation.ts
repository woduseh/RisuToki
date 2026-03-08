export interface EditorActivationTabLike {
  id: string;
  language: string;
}

export const NON_MONACO_EDITOR_TAB_TYPES = new Set(['_image', '_loreform', '_regexform']);

export function requiresMonacoEditor(language: string): boolean {
  return !NON_MONACO_EDITOR_TAB_TYPES.has(language);
}

export function resolvePendingEditorTab<T extends EditorActivationTabLike>(
  openTabs: readonly T[],
  pendingTabId: string | null,
  activeTabId: string | null
): T | null {
  const requestedIds = [pendingTabId, activeTabId].filter((value, index, items): value is string => {
    return typeof value === 'string' && items.indexOf(value) === index;
  });

  for (const tabId of requestedIds) {
    const tab = openTabs.find((candidate) => candidate.id === tabId);
    if (tab) return tab;
  }

  return null;
}
