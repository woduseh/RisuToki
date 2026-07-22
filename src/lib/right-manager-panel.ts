import { getFolderRef, resolveLorebookFolderRef } from './lorebook-folders';
import Sortable from 'sortablejs';
import { SHARED_OPTIONS, makeFlatOnEnd } from './sidebar-dnd';
import { planAssetBatchRename, type AssetBatchRenameMode, type AssetBatchRenameOperation } from './asset-batch-rename';

interface LorebookEntryLike {
  key?: string;
  content?: string;
  comment?: string;
  mode?: string;
  alwaysActive?: boolean;
  forceActivation?: boolean;
  selective?: boolean;
  secondkey?: string;
  constant?: boolean;
  useRegex?: boolean;
  folder?: string;
  [key: string]: unknown;
}

interface AssetListEntry {
  path: string;
  size: number;
}

export interface RightManagerPanelDeps {
  getFileData: () => { lorebook?: LorebookEntryLike[]; _fileType?: string } | null;
  getProjectPath: () => string | null;
  openLorebookEntry: (idx: number) => void;
  addLorebookEntry: () => void;
  addLorebookFolder: () => void;
  renameLorebook: (idx: number) => void;
  commitLorebookName: (idx: number, name: string) => string | null;
  reorderLorebook: (fromIdx: number, toPositionInFolder: number, targetFolder: string) => void;
  deleteLorebook: (idx: number) => void;
  deleteLorebookMany: (indices: number[]) => Promise<void>;
  moveLorebookManyToFolder: (indices: number[], folderRef: string) => Promise<void>;
  openImageTab: (path: string, fileName: string) => void;
  addAssetFromDialog: (folder: string) => void;
  addAssetBuffer: (fileName: string, base64: string, folder: string) => Promise<unknown>;
  renameAsset: (path: string, fileName: string) => Promise<string | null>;
  renameAssetsBatch: (operations: AssetBatchRenameOperation[]) => Promise<{
    ok: boolean;
    renamed?: Array<{ oldPath: string; newPath: string }>;
    error?: string;
    conflicts?: string[];
  }>;
  deleteAssets: (paths: string[]) => Promise<void>;
  getAssetList: () => Promise<AssetListEntry[]>;
  getAssetData: (path: string) => Promise<string | null>;
  showPrompt: (msg: string, defaultValue?: string) => Promise<string | null>;
  showConfirm: (msg: string) => Promise<boolean>;
  setStatus: (msg: string) => void;
  refresh: () => void;
}

interface LoreFolderGroup {
  entry: LorebookEntryLike;
  index: number;
  ref: string;
  children: Array<{ entry: LorebookEntryLike; index: number }>;
}

const state = {
  loreQuery: '',
  loreFilters: {
    always: false,
    selective: false,
    regex: false,
  },
  loreExpanded: new Set<string>(['root']),
  loreSelected: new Set<number>(),
  assetQuery: '',
  assetGroup: 'all' as 'all' | 'icon' | 'other',
  assetView: 'tree' as 'tree' | 'grid',
  assetSelected: new Set<string>(),
};

let depsRef: RightManagerPanelDeps | null = null;
let loreSortable: Sortable | null = null;
let assetRenderToken = 0;

function destroyLoreSortable(): void {
  if (!loreSortable) return;
  try {
    loreSortable.destroy();
  } catch {
    /* already destroyed */
  }
  loreSortable = null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clear(node: HTMLElement): void {
  node.replaceChildren();
}

function isManagerSupportedDocument(data: ReturnType<RightManagerPanelDeps['getFileData']>): boolean {
  return !!data && data._fileType !== 'risup';
}

function entryLabel(entry: LorebookEntryLike, index: number): string {
  return String(entry.comment || entry.key || `entry_${index}`);
}

interface FocusSnapshot {
  selector: string;
  start: number | null;
  end: number | null;
}

function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement as HTMLInputElement | HTMLSelectElement | null;
  if (!active || !root.contains(active)) return null;
  const key = active.getAttribute('data-manager-focus-key');
  if (!key) return null;
  return {
    selector: `[data-manager-focus-key="${CSS.escape(key)}"]`,
    start: 'selectionStart' in active ? active.selectionStart : null,
    end: 'selectionEnd' in active ? active.selectionEnd : null,
  };
}

function restoreFocus(root: HTMLElement, snapshot: FocusSnapshot | null): void {
  if (!snapshot) return;
  queueMicrotask(() => {
    const target = root.querySelector<HTMLInputElement | HTMLSelectElement>(snapshot.selector);
    if (!target) return;
    target.focus();
    if (
      snapshot.start !== null &&
      snapshot.end !== null &&
      'setSelectionRange' in target &&
      target instanceof HTMLInputElement
    ) {
      target.setSelectionRange(snapshot.start, snapshot.end);
    }
  });
}

function renderRightManagerPanelWithFocus(rootId: string): void {
  const root = document.getElementById(rootId);
  const focus = root ? captureFocus(root) : null;
  renderRightManagerPanel();
  if (root) restoreFocus(root, focus);
}

function bindManagerSearchInput(input: HTMLInputElement, rootId: string, setValue: (value: string) => void): void {
  let composing = false;
  let pendingRender: number | null = null;
  const clearPendingRender = (): void => {
    if (pendingRender === null) return;
    window.clearTimeout(pendingRender);
    pendingRender = null;
  };
  const syncValue = (): void => setValue(input.value);
  const renderWithFocus = (): void => renderRightManagerPanelWithFocus(rootId);

  input.addEventListener('compositionstart', () => {
    composing = true;
    clearPendingRender();
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    syncValue();
    clearPendingRender();
    pendingRender = window.setTimeout(() => {
      pendingRender = null;
      renderWithFocus();
    }, 0);
  });
  input.addEventListener('input', (event) => {
    syncValue();
    const eventIsComposing = typeof InputEvent !== 'undefined' && event instanceof InputEvent && event.isComposing;
    if (composing || eventIsComposing) return;
    clearPendingRender();
    renderWithFocus();
  });
}

function normalizeText(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

function inferImageMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/png';
}

function entryMatchesFilters(entry: LorebookEntryLike): boolean {
  if (state.loreFilters.always && !(entry.alwaysActive || entry.constant || entry.forceActivation)) return false;
  if (state.loreFilters.selective && !entry.selective) return false;
  if (state.loreFilters.regex && !(entry.useRegex || entry.mode === 'regex')) return false;
  const query = state.loreQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = [entry.comment, entry.key, entry.secondkey, entry.content].map(normalizeText).join('\n');
  return haystack.includes(query);
}

function getLoreGroups(lorebook: LorebookEntryLike[]): {
  folders: LoreFolderGroup[];
  rootEntries: Array<{ entry: LorebookEntryLike; index: number }>;
} {
  const folders: LoreFolderGroup[] = [];
  const lookup: Record<string, LoreFolderGroup> = {};
  const rootEntries: Array<{ entry: LorebookEntryLike; index: number }> = [];

  lorebook.forEach((entry, index) => {
    if (entry.mode !== 'folder') return;
    const ref = getFolderRef(entry) || '';
    const group = { entry, index, ref, children: [] };
    folders.push(group);
    if (ref) lookup[ref] = group;
  });

  lorebook.forEach((entry, index) => {
    if (entry.mode === 'folder') return;
    const folderRef = resolveLorebookFolderRef(entry.folder, lorebook);
    const folder = folderRef ? lookup[folderRef] : null;
    if (folder) folder.children.push({ entry, index });
    else rootEntries.push({ entry, index });
  });

  return { folders, rootEntries };
}

function setButtonActive(button: HTMLButtonElement, active: boolean): void {
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
}

function makeToolbarButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'manager-icon-btn', label);
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  // Keep row/card click handlers (e.g. open-on-click) from also firing when a
  // row action button is pressed.
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function showInlineError(host: HTMLElement, message: string): void {
  host.querySelector('.manager-inline-error')?.remove();
  const error = el('div', 'manager-inline-error', message);
  host.appendChild(error);
}

function makeDragHandle(title: string): HTMLElement {
  const handle = el('span', 'manager-drag-handle disabled', '⋮⋮');
  handle.title = title;
  handle.setAttribute('aria-label', title);
  handle.setAttribute('aria-disabled', 'true');
  return handle;
}

function renderPanelShell(
  deps: RightManagerPanelDeps,
  root: HTMLElement,
  titleText: string,
  renderBody: (body: HTMLElement) => void,
): void {
  const data = deps.getFileData();
  root.style.display = isManagerSupportedDocument(data) ? 'flex' : 'none';
  root.classList.add('manager-panel');

  clear(root);
  const header = el('div', 'right-manager-header');
  const title = el('span', 'right-manager-title', titleText);
  const actions = el('div', 'right-manager-actions');
  header.append(title, actions);
  root.appendChild(header);

  const body = el('div', 'right-manager-body');
  root.appendChild(body);
  if (!data) {
    body.appendChild(el('div', 'right-manager-empty', '현재 열린 파일이 없습니다.'));
    return;
  }
  renderBody(body);
}

function renderLorebookPanel(deps: RightManagerPanelDeps, body: HTMLElement): void {
  // The panel rebuilds its DOM on each render; tear down the stale drag instance.
  destroyLoreSortable();
  const data = deps.getFileData();
  const lorebook = data?.lorebook || [];

  const toolbar = el('div', 'manager-toolbar');
  const query = el('input', 'manager-search') as HTMLInputElement;
  query.setAttribute('data-manager-focus-key', 'lore-search');
  query.placeholder = '검색...';
  query.value = state.loreQuery;
  bindManagerSearchInput(query, 'lore-manager-panel', (value) => {
    state.loreQuery = value;
  });
  toolbar.appendChild(query);
  const addEntry = makeToolbarButton('＋ 항목', '새 로어북 항목', () => deps.addLorebookEntry());
  const addFolder = makeToolbarButton('＋ 폴더', '새 폴더', () => deps.addLorebookFolder());
  addEntry.classList.add('manager-primary-action');
  addFolder.classList.add('manager-primary-action');
  toolbar.append(addEntry, addFolder);
  body.appendChild(toolbar);

  const filterBar = el('div', 'manager-filter-row');
  const always = makeToolbarButton('항상', '항상 활성 필터', () => {
    state.loreFilters.always = !state.loreFilters.always;
    renderRightManagerPanel();
  });
  const selective = makeToolbarButton('2키', '선택적 활성 필터', () => {
    state.loreFilters.selective = !state.loreFilters.selective;
    renderRightManagerPanel();
  });
  const regex = makeToolbarButton('정규식', '정규식 항목 필터', () => {
    state.loreFilters.regex = !state.loreFilters.regex;
    renderRightManagerPanel();
  });
  setButtonActive(always, state.loreFilters.always);
  setButtonActive(selective, state.loreFilters.selective);
  setButtonActive(regex, state.loreFilters.regex);
  filterBar.append(always, selective, regex);
  body.appendChild(filterBar);

  if (state.loreSelected.size > 0) {
    const selectedBar = el('div', 'manager-selected-bar');
    selectedBar.appendChild(el('span', '', `${state.loreSelected.size}개 선택됨`));
    selectedBar.appendChild(
      makeToolbarButton('이동', '선택 항목 폴더 이동', () => showFolderMovePicker(deps, selectedBar)),
    );
    selectedBar.appendChild(
      makeToolbarButton('삭제', '선택 항목 삭제', async () => {
        await deps.deleteLorebookMany([...state.loreSelected]);
        state.loreSelected.clear();
        renderRightManagerPanel();
      }),
    );
    body.appendChild(selectedBar);
  }

  const list = el('div', 'manager-list');
  body.appendChild(list);

  const { folders, rootEntries } = getLoreGroups(lorebook);
  const renderEntries = (entries: Array<{ entry: LorebookEntryLike; index: number }>, parent: HTMLElement) => {
    for (const child of entries.filter((item) => entryMatchesFilters(item.entry))) {
      parent.appendChild(createLoreRow(deps, child.entry, child.index));
    }
  };

  for (const folder of folders) {
    const matchingChildren = folder.children.filter((item) => entryMatchesFilters(item.entry));
    const folderMatches = entryMatchesFilters(folder.entry);
    if (!folderMatches && matchingChildren.length === 0) continue;
    const folderKey = folder.ref || `idx:${folder.index}`;
    const folderRow = el('div', 'manager-folder-row');
    const arrow = el('button', 'manager-folder-arrow', state.loreExpanded.has(folderKey) ? '▼' : '▶');
    arrow.type = 'button';
    arrow.addEventListener('click', () => {
      if (state.loreExpanded.has(folderKey)) state.loreExpanded.delete(folderKey);
      else state.loreExpanded.add(folderKey);
      renderRightManagerPanel();
    });
    const folderName = entryLabel(folder.entry, folder.index);
    const label = el('div', 'manager-folder-label', folderName);
    label.title = `${folderName} - 더블클릭하여 이름 변경`;
    label.setAttribute('aria-label', `${folderName} 폴더, 더블클릭하여 이름 변경`);
    const badge = el('span', 'manager-badge', '폴더');
    folderRow.append(arrow, label, badge);

    function beginFolderRename(): void {
      if (label.querySelector('input')) return;
      const original = entryLabel(folder.entry, folder.index);
      const input = el('input', 'manager-inline-rename') as HTMLInputElement;
      input.type = 'text';
      input.value = String(folder.entry.comment ?? '');
      label.replaceChildren(input);
      input.focus();
      input.select();
      let settled = false;
      const cancel = (): void => {
        if (settled) return;
        settled = true;
        label.textContent = original;
      };
      const commit = (): void => {
        if (settled) return;
        const error = deps.commitLorebookName(folder.index, input.value);
        if (error) {
          showInlineError(label, error);
          input.focus();
          return;
        }
        settled = true;
        label.textContent = input.value.trim() || original;
      };
      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      });
      input.addEventListener('blur', commit);
    }
    folderRow.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      beginFolderRename();
    });
    list.appendChild(folderRow);
    if (state.loreExpanded.has(folderKey)) {
      const childList = el('div', 'manager-folder-children');
      renderEntries(matchingChildren, childList);
      list.appendChild(childList);
    }
  }

  renderEntries(rootEntries, list);

  if (!list.childElementCount) list.appendChild(el('div', 'right-manager-empty', '표시할 로어북 항목이 없습니다.'));

  // Drag reordering only when the visible order is unambiguous: a flat list
  // (no folders) with no active search/filters. With folders or filters the DOM
  // order no longer maps 1:1 to root positions, so the ↑/↓-free fallback is to
  // reorder via the folder move tools instead.
  const loreFilterActive =
    state.loreQuery.trim() !== '' || state.loreFilters.always || state.loreFilters.selective || state.loreFilters.regex;
  const loreDndEnabled = folders.length === 0 && !loreFilterActive && rootEntries.length > 1;
  if (loreDndEnabled) {
    list.classList.add('manager-lore-list-sortable');
    list.querySelectorAll<HTMLElement>(':scope > .manager-lore-row > .manager-drag-handle').forEach((handle) => {
      handle.classList.remove('disabled');
      handle.setAttribute('aria-disabled', 'false');
    });
    loreSortable = Sortable.create(list, {
      ...SHARED_OPTIONS,
      handle: '.manager-drag-handle',
      filter: 'input, button, .no-sort',
      preventOnFilter: false,
      onEnd: makeFlatOnEnd((fromIdx, toIdx) => {
        deps.reorderLorebook(fromIdx, toIdx, '');
      }),
    });
  }
}

function createLoreRow(deps: RightManagerPanelDeps, entry: LorebookEntryLike, index: number): HTMLElement {
  const row = el('div', 'manager-lore-row');
  row.dataset.dndIdx = String(index);
  row.classList.toggle('selected', state.loreSelected.has(index));

  const checkbox = el('input', 'manager-check') as HTMLInputElement;
  checkbox.type = 'checkbox';
  checkbox.checked = state.loreSelected.has(index);
  checkbox.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleLoreSelection(index, (event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey);
  });

  const main = el('div', 'manager-row-main');
  const titleEl = el('div', 'manager-row-title', entryLabel(entry, index));
  main.appendChild(titleEl);

  // Inline rename: swap the title text for an input instead of a blocking modal.
  function beginInlineRename(): void {
    if (titleEl.querySelector('input')) return; // already editing
    const input = el('input', 'manager-inline-rename') as HTMLInputElement;
    input.type = 'text';
    input.value = String(entry.comment ?? '');
    titleEl.replaceChildren(input);
    input.focus();
    input.select();

    let settled = false;
    const commit = (): void => {
      if (settled) return;
      const error = deps.commitLorebookName(index, input.value);
      if (error) {
        showInlineError(titleEl, error);
        input.focus();
        return;
      }
      settled = true;
      // If the commit did not trigger a rebuild (e.g. unchanged name), make sure
      // the label text is restored rather than leaving a stray input.
      titleEl.textContent = entryLabel({ ...entry, comment: input.value.trim() || entry.comment }, index);
    };
    const cancel = (): void => {
      if (settled) return;
      settled = true;
      titleEl.textContent = entryLabel(entry, index);
    };

    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    });
    input.addEventListener('blur', commit);
  }

  titleEl.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    beginInlineRename();
  });

  const contentPreview = String(entry.content || '')
    .replace(/\s+/g, ' ')
    .trim();
  const keys = [entry.key, entry.secondkey].filter(Boolean).join(' / ');
  main.appendChild(el('div', 'manager-row-subtitle', contentPreview.slice(0, 72) || keys));

  const tags = el('div', 'manager-row-tags');
  if (entry.alwaysActive || entry.constant || entry.forceActivation)
    tags.appendChild(el('span', 'manager-chip', '항상'));
  if (entry.selective) tags.appendChild(el('span', 'manager-chip', '2키'));
  if (entry.useRegex || entry.mode === 'regex') tags.appendChild(el('span', 'manager-chip', '정규식'));

  const actions = el('div', 'manager-row-actions');
  const lorebook = deps.getFileData()?.lorebook || [];
  const folderRef = resolveLorebookFolderRef(entry.folder, lorebook);
  const siblings = lorebook
    .map((candidate, candidateIndex) => ({ entry: candidate, index: candidateIndex }))
    .filter(
      (candidate) =>
        candidate.entry.mode !== 'folder' && resolveLorebookFolderRef(candidate.entry.folder, lorebook) === folderRef,
    );
  const siblingPosition = siblings.findIndex((candidate) => candidate.index === index);
  const moveUp = makeToolbarButton('↑', '위로 이동', () => {
    if (siblingPosition > 0) deps.reorderLorebook(index, siblingPosition - 1, folderRef);
  });
  const moveDown = makeToolbarButton('↓', '아래로 이동', () => {
    if (siblingPosition >= 0 && siblingPosition < siblings.length - 1) {
      deps.reorderLorebook(index, siblingPosition + 1, folderRef);
    }
  });
  moveUp.disabled = siblingPosition <= 0;
  moveDown.disabled = siblingPosition < 0 || siblingPosition >= siblings.length - 1;
  actions.append(moveUp, moveDown);
  actions.appendChild(makeToolbarButton('✎', '이름 변경', () => beginInlineRename()));
  actions.appendChild(makeToolbarButton('✕', '삭제', () => void deps.deleteLorebook(index)));

  row.append(makeDragHandle('로어북 순서 드래그'), checkbox, main, tags, actions);
  row.addEventListener('click', (event) => {
    if ((event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey) {
      toggleLoreSelection(index, true);
      return;
    }
    deps.openLorebookEntry(index);
  });
  return row;
}

function toggleLoreSelection(index: number, additive: boolean): void {
  if (!additive) state.loreSelected.clear();
  if (state.loreSelected.has(index)) state.loreSelected.delete(index);
  else state.loreSelected.add(index);
  renderRightManagerPanel();
}

function showFolderMovePicker(deps: RightManagerPanelDeps, host: HTMLElement): void {
  host.querySelector('.manager-folder-picker')?.remove();
  const data = deps.getFileData();
  const lorebook = data?.lorebook || [];
  const { folders } = getLoreGroups(lorebook);
  const picker = el('div', 'manager-folder-picker');
  const title = el('div', 'manager-folder-picker-title', '이동할 폴더');
  const options = el('div', 'manager-folder-picker-options');
  const addOption = (label: string, folderRef: string): void => {
    const button = makeToolbarButton(label, `${label}(으)로 이동`, () => {
      void deps.moveLorebookManyToFolder([...state.loreSelected], folderRef).then(() => {
        state.loreSelected.clear();
        renderRightManagerPanel();
      });
    });
    button.classList.add('manager-folder-option');
    options.appendChild(button);
  };
  addOption('루트', '');
  for (const folder of folders) addOption(entryLabel(folder.entry, folder.index), folder.ref);
  picker.append(title, options);
  host.appendChild(picker);
}

async function renderAssetPanel(deps: RightManagerPanelDeps, body: HTMLElement, renderToken: number): Promise<void> {
  const toolbar = el('div', 'manager-toolbar');
  const query = el('input', 'manager-search') as HTMLInputElement;
  query.setAttribute('data-manager-focus-key', 'asset-search');
  query.placeholder = '검색...';
  query.value = state.assetQuery;
  bindManagerSearchInput(query, 'asset-manager-panel', (value) => {
    state.assetQuery = value;
  });
  toolbar.appendChild(query);
  const addAsset = makeToolbarButton('＋ 에셋', '추가 에셋 추가', () => deps.addAssetFromDialog('other'));
  const addIcon = makeToolbarButton('★ 아이콘', '캐릭터 아이콘 추가', () => deps.addAssetFromDialog('icon'));
  addAsset.classList.add('manager-primary-action');
  addIcon.classList.add('manager-primary-action');
  toolbar.append(addAsset, addIcon);
  body.appendChild(toolbar);

  const groupBar = el('div', 'manager-filter-row');
  for (const [key, label] of [
    ['all', '전체'],
    ['icon', '아이콘'],
    ['other', '추가 에셋'],
  ] as const) {
    const button = makeToolbarButton(label, `${label} 보기`, () => {
      state.assetGroup = key;
      renderRightManagerPanel();
    });
    setButtonActive(button, state.assetGroup === key);
    groupBar.appendChild(button);
  }
  const viewSpacer = el('span', 'manager-filter-spacer');
  const treeView = makeToolbarButton('트리', '파일명 트리 보기', () => {
    state.assetView = 'tree';
    renderRightManagerPanel();
  });
  const gridView = makeToolbarButton('썸네일', '썸네일 보기', () => {
    state.assetView = 'grid';
    renderRightManagerPanel();
  });
  setButtonActive(treeView, state.assetView === 'tree');
  setButtonActive(gridView, state.assetView === 'grid');
  groupBar.append(viewSpacer, treeView, gridView);
  body.appendChild(groupBar);

  if (state.assetSelected.size > 0) {
    const selectedBar = el('div', 'manager-selected-bar');
    selectedBar.appendChild(el('span', '', `${state.assetSelected.size}개 선택됨`));
    if (state.assetSelected.size >= 2) {
      selectedBar.appendChild(
        makeToolbarButton('이름 일괄 변경', '선택 에셋 이름 일괄 변경', () => void beginAssetBatchRename(deps)),
      );
    }
    selectedBar.appendChild(
      makeToolbarButton('삭제', '선택 에셋 삭제', async () => {
        await deps.deleteAssets([...state.assetSelected]);
        state.assetSelected.clear();
        renderRightManagerPanel();
      }),
    );
    body.appendChild(selectedBar);
  }

  const assetHost = el('div', state.assetView === 'tree' ? 'manager-asset-tree' : 'manager-asset-grid');
  assetHost.addEventListener('dragover', (event) => {
    event.preventDefault();
    assetHost.classList.add('drag-over');
  });
  assetHost.addEventListener('dragleave', () => assetHost.classList.remove('drag-over'));
  assetHost.addEventListener('drop', (event) => {
    event.preventDefault();
    assetHost.classList.remove('drag-over');
    const folder = state.assetGroup === 'icon' ? 'icon' : 'other';
    void addDroppedAssetFiles(deps, event.dataTransfer?.files || null, folder);
  });
  body.appendChild(assetHost);
  const assets = await deps.getAssetList();
  if (renderToken !== assetRenderToken || !assetHost.isConnected) return;
  const queryLower = state.assetQuery.trim().toLowerCase();
  const filtered = assets.filter((asset) => {
    const group = asset.path.split('/')[1] === 'icon' ? 'icon' : 'other';
    if (state.assetGroup !== 'all' && state.assetGroup !== group) return false;
    if (!queryLower) return true;
    return asset.path.toLowerCase().includes(queryLower);
  });

  if (state.assetView === 'tree') {
    assetHost.appendChild(buildAssetFilenameTree(deps, filtered));
  } else {
    const cards = await Promise.all(filtered.map((asset) => createAssetCard(deps, asset)));
    if (renderToken !== assetRenderToken || !assetHost.isConnected) return;
    assetHost.append(...cards);
  }
  if (!filtered.length) assetHost.appendChild(el('div', 'right-manager-empty', '표시할 에셋이 없습니다.'));
}

interface AssetTreeNode {
  children: Map<string, AssetTreeNode>;
  assets: AssetListEntry[];
}

function buildAssetFilenameTree(deps: RightManagerPanelDeps, assets: AssetListEntry[]): HTMLElement {
  const root: AssetTreeNode = { children: new Map(), assets: [] };
  for (const asset of assets) {
    const fileName = asset.path.split('/').pop() || asset.path;
    const key = fileName.replace(/\.[^.]+$/, '');
    const segments = key.split(/[_\-. ]+/).filter(Boolean);
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      const child = node.children.get(segment) || { children: new Map<string, AssetTreeNode>(), assets: [] };
      node.children.set(segment, child);
      node = child;
    }
    node.assets.push(asset);
  }

  const renderNode = (node: AssetTreeNode): HTMLElement => {
    const container = el('div', 'asset-tree-children');
    for (const [label, child] of [...node.children].sort(([a], [b]) => a.localeCompare(b))) {
      const details = el('details', 'asset-tree-group') as HTMLDetailsElement;
      details.open = true;
      const summary = el('summary');
      summary.append(el('span', 'asset-tree-folder-name', label), el('small', '', String(countAssetTree(child))));
      details.append(summary, renderNode(child));
      container.appendChild(details);
    }
    for (const asset of node.assets.sort((a, b) => a.path.localeCompare(b.path))) {
      const fileName = asset.path.split('/').pop() || asset.path;
      const row = el('button', 'asset-tree-file') as HTMLButtonElement;
      row.type = 'button';
      row.classList.toggle('selected', state.assetSelected.has(asset.path));
      const check = el('input') as HTMLInputElement;
      check.type = 'checkbox';
      check.checked = state.assetSelected.has(asset.path);
      check.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleAssetSelection(asset.path, (event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey);
      });
      row.append(check, el('span', '', fileName), el('small', '', `${Math.round(asset.size / 1024)} KB`));
      row.addEventListener('click', () => deps.openImageTab(asset.path, fileName));
      container.appendChild(row);
    }
    return container;
  };
  return renderNode(root);
}

function countAssetTree(node: AssetTreeNode): number {
  let count = node.assets.length;
  for (const child of node.children.values()) count += countAssetTree(child);
  return count;
}

async function promptAssetBatchRenameMode(deps: RightManagerPanelDeps): Promise<AssetBatchRenameMode | null> {
  const modeText = await deps.showPrompt('일괄 이름 변경 모드: "패턴+번호" 또는 "찾기/바꾸기"', '패턴+번호');
  if (modeText === null) return null;
  const normalized = modeText.trim().toLowerCase();
  if (normalized.startsWith('찾') || normalized.includes('replace') || normalized.includes('바꾸')) {
    const find = await deps.showPrompt('찾을 문자열', '');
    if (find === null) return null;
    const replace = await deps.showPrompt('바꿀 문자열', '');
    if (replace === null) return null;
    return { kind: 'replace', find, replace };
  }

  const baseName = await deps.showPrompt('새 이름 패턴', 'asset');
  if (baseName === null) return null;
  const startText = await deps.showPrompt('시작 번호', '1');
  if (startText === null) return null;
  const paddingText = await deps.showPrompt('번호 자릿수', '3');
  if (paddingText === null) return null;
  return {
    kind: 'pattern',
    baseName,
    start: Number.parseInt(startText, 10) || 1,
    padding: Number.parseInt(paddingText, 10) || 3,
  };
}

async function beginAssetBatchRename(deps: RightManagerPanelDeps): Promise<void> {
  const selectedPaths = [...state.assetSelected];
  const mode = await promptAssetBatchRenameMode(deps);
  if (!mode) return;

  const assets = await deps.getAssetList();
  const plan = planAssetBatchRename(assets, selectedPaths, mode);
  if (plan.errors.length > 0) {
    deps.setStatus(`에셋 일괄 이름 변경 실패: ${plan.errors[0]}`);
    return;
  }

  const preview = plan.preview
    .slice(0, 20)
    .map((item) => `${item.oldPath} -> ${item.newPath}`)
    .join('\n');
  const suffix = plan.preview.length > 20 ? `\n...외 ${plan.preview.length - 20}개` : '';
  const confirmed = await deps.showConfirm(
    `선택한 에셋 ${plan.operations.length}개의 이름을 변경하시겠습니까?\n\n${preview}${suffix}`,
  );
  if (!confirmed) return;

  const result = await deps.renameAssetsBatch(plan.operations);
  if (!result.ok) {
    deps.setStatus(`에셋 일괄 이름 변경 실패: ${result.conflicts?.[0] || result.error || '알 수 없는 오류'}`);
    return;
  }

  state.assetSelected.clear();
  renderRightManagerPanel();
  deps.refresh();
  deps.setStatus(`에셋 ${result.renamed?.length ?? plan.operations.length}개 이름 변경됨`);
}

async function createAssetCard(deps: RightManagerPanelDeps, asset: AssetListEntry): Promise<HTMLElement> {
  const card = el('div', 'manager-asset-card');
  card.classList.toggle('selected', state.assetSelected.has(asset.path));
  const fileName = asset.path.split('/').pop() || asset.path;
  // Thumbnails crop similarly-named sprites (e.g. Hari_Daily_a…); expose the
  // full name on hover anywhere over the card, not just the truncated label.
  card.title = fileName;

  const check = el('input', 'manager-asset-check') as HTMLInputElement;
  check.type = 'checkbox';
  check.checked = state.assetSelected.has(asset.path);
  check.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleAssetSelection(asset.path, (event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey);
  });
  card.appendChild(check);

  const preview = el('div', 'manager-asset-preview');
  const img = el('img') as HTMLImageElement;
  img.alt = fileName;
  const data = await deps.getAssetData(asset.path);
  if (data) img.src = `data:${inferImageMime(asset.path)};base64,${data}`;
  preview.appendChild(img);
  card.appendChild(preview);

  const label = el('div', 'manager-asset-name', fileName);
  label.title = asset.path;
  card.appendChild(label);
  card.appendChild(el('div', 'manager-asset-size', `${Math.round(asset.size / 1024)} KB`));

  const actions = el('div', 'manager-asset-actions');
  actions.appendChild(makeToolbarButton('✎', '이름 변경', () => beginInlineRename()));
  actions.appendChild(makeToolbarButton('✕', '삭제', () => void deps.deleteAssets([asset.path])));
  card.appendChild(actions);

  function beginInlineRename(): void {
    if (label.querySelector('input')) return;
    const input = el('input', 'manager-inline-rename') as HTMLInputElement;
    input.type = 'text';
    input.value = fileName;
    label.replaceChildren(input);
    input.focus();
    input.select();
    let settled = false;
    let committing = false;
    const cancel = (): void => {
      if (settled || committing) return;
      settled = true;
      label.textContent = fileName;
    };
    const commit = async (): Promise<void> => {
      if (settled || committing) return;
      committing = true;
      const error = await deps.renameAsset(asset.path, input.value);
      committing = false;
      if (error) {
        showInlineError(label, error);
        input.focus();
        return;
      }
      settled = true;
      label.textContent = input.value.trim() || fileName;
    };
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        void commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    });
    input.addEventListener('blur', () => void commit());
  }

  card.addEventListener('click', (event) => {
    if ((event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey) {
      toggleAssetSelection(asset.path, true);
      return;
    }
    deps.openImageTab(asset.path, fileName);
  });

  card.addEventListener('dragover', (event) => {
    event.preventDefault();
    card.classList.add('drag-over');
  });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  card.addEventListener('drop', (event) => {
    event.preventDefault();
    card.classList.remove('drag-over');
    const group = asset.path.split('/')[1] === 'icon' ? 'icon' : 'other';
    void addDroppedAssetFiles(deps, event.dataTransfer?.files || null, group);
  });

  return card;
}

async function addDroppedAssetFiles(
  deps: RightManagerPanelDeps,
  files: FileList | null,
  folder: string,
): Promise<void> {
  if (!files || files.length === 0) return;
  let added = 0;
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue;
    const base64 = await readFileAsBase64(file);
    const result = await deps.addAssetBuffer(file.name, base64, folder);
    if (result) added++;
  }
  if (added > 0) {
    deps.setStatus(`에셋 ${added}개 추가됨`);
    deps.refresh();
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function toggleAssetSelection(path: string, additive: boolean): void {
  if (!additive) state.assetSelected.clear();
  if (state.assetSelected.has(path)) state.assetSelected.delete(path);
  else state.assetSelected.add(path);
  renderRightManagerPanel();
}

export function initRightManagerPanel(deps: RightManagerPanelDeps): void {
  depsRef = deps;
  renderRightManagerPanel();
}

export function renderRightManagerPanel(): void {
  if (!depsRef) return;
  const renderToken = ++assetRenderToken;
  const loreRoot = document.getElementById('lore-manager-panel');
  const assetRoot = document.getElementById('asset-manager-panel');
  if (loreRoot) {
    renderPanelShell(depsRef, loreRoot, '로어북 관리자', (body) => renderLorebookPanel(depsRef!, body));
  }
  if (assetRoot) {
    renderPanelShell(depsRef, assetRoot, '에셋 관리자', (body) => void renderAssetPanel(depsRef!, body, renderToken));
  }
}
