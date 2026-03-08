export interface FolderItemResult {
  header: HTMLDivElement;
  children: HTMLDivElement;
}

export interface TabLike {
  id: string;
  label: string;
}

export function createTreeItem(label: string, icon: string, indent: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `tree-item indent-${indent}`;
  el.dataset.label = label;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'icon';
  iconSpan.textContent = icon;
  el.appendChild(iconSpan);

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  el.appendChild(labelSpan);

  return el;
}

export function createFolderItem(label: string, icon: string, indent: number): FolderItemResult {
  const header = document.createElement('div');
  header.className = `tree-item indent-${indent}`;

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = '▶';
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

  header.addEventListener('click', (e) => {
    e.stopPropagation();
    const expanded = children.classList.toggle('expanded');
    arrow.textContent = expanded ? '▼' : '▶';
  });

  return { header, children };
}

export function updateSidebarActive(activeTabId: string | null, openTabs: TabLike[]): void {
  const items = document.querySelectorAll('.tree-item');
  const tab = activeTabId ? openTabs.find(t => t.id === activeTabId) : null;
  const targetLabel = tab ? tab.label : null;
  items.forEach(el => {
    (el as HTMLElement).classList.toggle('active', targetLabel !== null && (el as HTMLElement).dataset.label === targetLabel);
  });
}
