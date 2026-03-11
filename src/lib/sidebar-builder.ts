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

export interface SplitResizerDeps {
  moveRefs: (pos: string) => void;
  popOutPanel: (panelId: string) => void;
  dockPanel: (panelId: string) => void;
  isPanelPoppedOut: (panelId: string) => boolean;
  showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
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

// Persists folder expanded/collapsed state across sidebar rebuilds.
// Key format is `${indent}:${label}` to handle same-name folders at different levels.
const _expandedFolders = new Set<string>();

export function createFolderItem(label: string, icon: string, indent: number): FolderItemResult {
  const header = document.createElement('div');
  header.className = `tree-item indent-${indent}`;

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

export function initSidebarSplitResizer(deps: SplitResizerDeps): void {
  const resizer = document.getElementById('sidebar-split-resizer');
  const itemsSection = document.getElementById('sidebar-items-section');
  const refsSection = document.getElementById('sidebar-refs-section');
  if (!resizer || !itemsSection || !refsSection) return;

  let startY = 0;
  let startItemsH = 0;
  let startRefsH = 0;

  const onMove = (e: MouseEvent) => {
    const dy = e.clientY - startY;
    const newItemsH = Math.max(60, startItemsH + dy);
    const newRefsH = Math.max(60, startRefsH - dy);
    itemsSection.style.flex = `0 0 ${newItemsH}px`;
    refsSection.style.flex = `0 0 ${newRefsH}px`;
  };
  const onUp = () => {
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startItemsH = itemsSection.offsetHeight;
    startRefsH = refsSection.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // --- Refs section buttons ---
  const refsContent = document.getElementById('sidebar-refs');
  const collapseBtn = document.getElementById('btn-refs-collapse');
  const closeBtn = document.getElementById('btn-refs-close');
  const separateBtn = document.getElementById('btn-refs-separate');
  const extPopoutBtn = document.getElementById('btn-refs-extpopout');

  if (collapseBtn && refsContent) {
    let refsCollapsed = false;
    collapseBtn.addEventListener('click', () => {
      refsCollapsed = !refsCollapsed;
      refsContent.style.display = refsCollapsed ? 'none' : '';
      collapseBtn.textContent = refsCollapsed ? '▶' : '▼';
      collapseBtn.title = refsCollapsed ? '참고자료 펼치기' : '참고자료 접기';
    });
  }
  if (closeBtn && refsSection && resizer) {
    closeBtn.addEventListener('click', () => {
      refsSection.style.display = 'none';
      resizer.style.display = 'none';
      itemsSection.style.flex = '1';
    });
  }
  if (separateBtn) {
    separateBtn.addEventListener('click', () => {
      deps.moveRefs('right');
    });
  }
  if (extPopoutBtn) {
    extPopoutBtn.addEventListener('click', () => {
      if (deps.isPanelPoppedOut('refs')) {
        deps.dockPanel('refs');
      } else {
        deps.popOutPanel('refs');
      }
    });
  }
  // Right-click on refs header for position options
  const refsHeader = document.querySelector('.sidebar-header-refs');
  if (refsHeader) {
    refsHeader.addEventListener('contextmenu', (e: Event) => {
      const me = e as MouseEvent;
      me.preventDefault();
      me.stopPropagation();
      deps.showContextMenu(me.clientX, me.clientY, [
        { label: '→ 사이드바', action: () => deps.moveRefs('sidebar') },
        { label: '→ 좌측', action: () => deps.moveRefs('left') },
        { label: '→ 우측', action: () => deps.moveRefs('right') },
        { label: '→ 좌끝', action: () => deps.moveRefs('far-left') },
        { label: '→ 우끝', action: () => deps.moveRefs('far-right') },
        { label: '→ 상단', action: () => deps.moveRefs('top') },
        { label: '→ 하단', action: () => deps.moveRefs('bottom') },
      ]);
    });
  }
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

    // Add existing assets under this folder
    for (const asset of groups[def.key]) {
      const fileName = asset.path.split('/').pop()!;
      const el = createTreeItem(`${fileName} (${(asset.size / 1024).toFixed(0)}KB)`, '·', 2);
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
