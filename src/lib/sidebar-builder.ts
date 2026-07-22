import type { ContextMenuItem } from './context-menu';

export interface FolderItemResult {
  header: HTMLDivElement;
  children: HTMLDivElement;
}

export interface TabLike {
  id: string;
  label: string;
}

export interface LoreEntryChild {
  index: number;
  entry: { comment?: string; [key: string]: unknown };
}

export interface AssetsSidebarDeps {
  showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  addAssetFromDialog: (folder: string) => void;
  openImageTab: (path: string, fileName: string) => void;
  attachAssetContextMenu: (el: HTMLElement, path: string, fileName: string) => void;
}

export interface LoreEntryItemDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getFileData: () => any;
  openTab: (
    id: string,
    label: string,
    language: string,
    getValue: () => unknown,
    setValue: (v: unknown) => void,
  ) => void;
  showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  renameLorebook: (idx: number) => void;
  deleteLorebook: (idx: number) => void;
  setStatus: (msg: string) => void;
  getBackups: (tabId: string) => unknown[];
  showBackupMenu: (tabId: string, x: number, y: number) => void;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;

export async function buildAssetsSidebar(tree: HTMLElement, deps: AssetsSidebarDeps): Promise<void> {
  const assetList = await window.tokiAPI.getAssetList();

  const assetsFolder = createFolderItem('에셋 (이미지)', '🖼', 0);
  tree.appendChild(assetsFolder.header);
  tree.appendChild(assetsFolder.children);

  // Group assets by folder
  const groups: Record<string, { path: string; size: number }[]> = { icon: [], other: [] };
  if (assetList) {
    for (const asset of assetList) {
      const parts = asset.path.split('/');
      const group = parts[1] === 'icon' ? 'icon' : 'other';
      groups[group].push(asset);
    }
  }

  // Always show icon and other folders
  const folderDefs = [
    { key: 'icon', label: '아이콘 (icon)', icon: '⭐' },
    { key: 'other', label: '기타 (other)', icon: '📁' },
  ];

  for (const def of folderDefs) {
    const subFolder = createFolderItem(def.label, def.icon, 1);
    assetsFolder.children.appendChild(subFolder.header);
    assetsFolder.children.appendChild(subFolder.children);

    // Right-click on subfolder: add to this folder
    const targetFolder = def.key;
    subFolder.header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        { label: '이미지 추가', action: () => deps.addAssetFromDialog(targetFolder) },
      ]);
    });

    // Mark container for DnD
    subFolder.children.dataset.dndAssetContainer = '';
    subFolder.children.dataset.dndAssetFolder = def.key;

    // Add existing assets under this folder
    for (const asset of groups[def.key]) {
      const fileName = asset.path.split('/').pop()!;
      const el = createTreeItem(`${fileName} (${(asset.size / 1024).toFixed(0)}KB)`, '·', 2);
      el.dataset.dndAssetPath = asset.path;
      el.addEventListener('click', () => deps.openImageTab(asset.path, fileName));
      deps.attachAssetContextMenu(el, asset.path, fileName);
      subFolder.children.appendChild(el);
    }
  }
}

export function createLoreEntryItem(child: LoreEntryChild, indent: number, deps: LoreEntryItemDeps): HTMLDivElement {
  const label = child.entry.comment || `entry_${child.index}`;
  const el = createTreeItem(label, '·', indent);
  const idx = child.index;
  el.addEventListener('click', () => {
    const fileData = deps.getFileData();
    deps.openTab(
      `lore_${idx}`,
      label,
      '_loreform',
      () => fileData.lorebook[idx],
      (v: unknown) => {
        Object.assign(fileData.lorebook[idx], v as object);
      },
    );
  });
  // Lorebook entry right-click: rename / copy path / backup / delete
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      { label: '이름 변경', action: () => deps.renameLorebook(idx) },
      {
        label: 'MCP 경로 복사',
        action: () => {
          navigator.clipboard.writeText(`read_lorebook(${idx})`);
          deps.setStatus(`복사됨: read_lorebook(${idx})`);
        },
      },
    ];
    const store = deps.getBackups(`lore_${idx}`);
    if (store.length > 0) {
      items.push('---');
      items.push({ label: '백업 불러오기', action: () => deps.showBackupMenu(`lore_${idx}`, e.clientX, e.clientY) });
    }
    items.push('---');
    items.push({ label: '삭제', action: () => deps.deleteLorebook(idx) });
    deps.showContextMenu(e.clientX, e.clientY, items);
  });
  return el;
}
