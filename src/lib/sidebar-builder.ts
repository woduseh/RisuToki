export interface FolderItemResult {
  header: HTMLDivElement;
  children: HTMLDivElement;
}

export interface TabLike {
  id: string;
  label: string;
}

/**
 * Creates a non-collapsible section header for sidebar category grouping.
 * Renders as a thin divider line with a centered label.
 */
export function createSectionHeader(label: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'sidebar-section-header';
  el.textContent = label;
  return el;
}

export function createTreeItem(label: string, icon: string, indent: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `tree-item indent-${indent}`;
  el.dataset.label = label;
  // Long names (e.g. full reference paths like bot/…_시뮬봇.md) truncate with
  // ellipsis; expose the full label on hover.
  el.title = label;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'icon';
  iconSpan.textContent = icon;
  el.appendChild(iconSpan);

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  el.appendChild(labelSpan);

  return el;
}

// Persists folder expanded/collapsed state across sidebar rebuilds.
// Key format is `${indent}:${label}` to handle same-name folders at different levels.
const _expandedFolders = new Set<string>();

export function createFolderItem(label: string, icon: string, indent: number): FolderItemResult {
  const header = document.createElement('div');
  header.className = `tree-item indent-${indent}`;
  header.title = label;

  const arrow = document.createElement('span');
  arrow.className = 'arrow';

  const folderKey = `${indent}:${label}`;
  const wasExpanded = _expandedFolders.has(folderKey);
  arrow.textContent = wasExpanded ? '▼' : '▶';

  header.appendChild(arrow);

  const iconSpan = document.createElement('span');
  iconSpan.className = 'icon';
  iconSpan.textContent = icon;
  header.appendChild(iconSpan);

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  header.appendChild(labelSpan);

  const children = document.createElement('div');
  children.className = 'tree-children';
  if (wasExpanded) children.classList.add('expanded');

  header.addEventListener('click', (e) => {
    e.stopPropagation();
    const expanded = children.classList.toggle('expanded');
    arrow.textContent = expanded ? '▼' : '▶';
    if (expanded) {
      _expandedFolders.add(folderKey);
    } else {
      _expandedFolders.delete(folderKey);
    }
  });

  return { header, children };
}

export function updateSidebarActive(activeTabId: string | null, openTabs: TabLike[]): void {
  const items = document.querySelectorAll('.tree-item');
  const tab = activeTabId ? openTabs.find((t) => t.id === activeTabId) : null;
  const targetLabel = tab ? tab.label : null;
  items.forEach((el) => {
    (el as HTMLElement).classList.toggle(
      'active',
      targetLabel !== null && (el as HTMLElement).dataset.label === targetLabel,
    );
  });
}
