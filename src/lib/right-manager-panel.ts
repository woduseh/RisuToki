import { getFolderRef, resolveLorebookFolderRef } from './lorebook-folders';

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
  deleteLorebook: (idx: number) => void;
  deleteLorebookMany: (indices: number[]) => Promise<void>;
  moveLorebookManyToFolder: (indices: number[], folderRef: string) => Promise<void>;
  openImageTab: (path: string, fileName: string) => void;
  addAssetFromDialog: (folder: string) => void;
  addAssetBuffer: (fileName: string, base64: string, folder: string) => Promise<unknown>;
  renameAsset: (path: string, fileName: string) => Promise<void>;
  deleteAssets: (paths: string[]) => Promise<void>;
  getAssetList: () => Promise<AssetListEntry[]>;
  getAssetData: (path: string) => Promise<string | null>;
  setStatus: (msg: string) => void;
  refresh: () => void;
  afterRender?: () => void;
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
  assetSelected: new Set<string>(),
};

let depsRef: RightManagerPanelDeps | null = null;

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
  button.addEventListener('click', onClick);
  return button;
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
  const data = deps.getFileData();
  const lorebook = data?.lorebook || [];

  const toolbar = el('div', 'manager-toolbar');
  const query = el('input', 'manager-search') as HTMLInputElement;
  query.setAttribute('data-manager-focus-key', 'lore-search');
  query.placeholder = '검색...';
  query.value = state.loreQuery;
  query.addEventListener('input', () => {
    state.loreQuery = query.value;
    renderRightManagerPanelWithFocus('lore-manager-panel');
  });
  toolbar.appendChild(query);
  toolbar.appendChild(makeToolbarButton('+', '새 로어북 항목', () => deps.addLorebookEntry()));
  toolbar.appendChild(makeToolbarButton('+폴더', '새 폴더', () => deps.addLorebookFolder()));
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
    selectedBar.appendChild(makeToolbarButton('이동', '선택 항목 폴더 이동', () => void promptMoveLoreSelection(deps)));
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
    const label = el('div', 'manager-folder-label', entryLabel(folder.entry, folder.index));
    const badge = el('span', 'manager-badge', '폴더');
    folderRow.append(arrow, label, badge);
    folderRow.addEventListener('dblclick', () => deps.renameLorebook(folder.index));
    list.appendChild(folderRow);
    if (state.loreExpanded.has(folderKey)) {
      const childList = el('div', 'manager-folder-children');
      renderEntries(matchingChildren, childList);
      list.appendChild(childList);
    }
  }

  renderEntries(rootEntries, list);

  if (!list.childElementCount) list.appendChild(el('div', 'right-manager-empty', '표시할 로어북 항목이 없습니다.'));
}

function createLoreRow(deps: RightManagerPanelDeps, entry: LorebookEntryLike, index: number): HTMLElement {
  const row = el('div', 'manager-lore-row');
  row.classList.toggle('selected', state.loreSelected.has(index));

  const checkbox = el('input', 'manager-check') as HTMLInputElement;
  checkbox.type = 'checkbox';
  checkbox.checked = state.loreSelected.has(index);
  checkbox.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleLoreSelection(index, (event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey);
  });

  const main = el('div', 'manager-row-main');
  main.appendChild(el('div', 'manager-row-title', entryLabel(entry, index)));
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
  actions.appendChild(makeToolbarButton('✎', '이름 변경', () => deps.renameLorebook(index)));
  actions.appendChild(makeToolbarButton('✕', '삭제', () => void deps.deleteLorebook(index)));

  row.append(checkbox, main, tags, actions);
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

async function promptMoveLoreSelection(deps: RightManagerPanelDeps): Promise<void> {
  const data = deps.getFileData();
  const lorebook = data?.lorebook || [];
  const { folders } = getLoreGroups(lorebook);
  const names = ['루트', ...folders.map((folder) => entryLabel(folder.entry, folder.index))].join(', ');
  const target = window.prompt(`이동할 폴더 이름을 입력하세요.\n사용 가능: ${names}`, '루트');
  if (target === null) return;
  const folder = folders.find((item) => entryLabel(item.entry, item.index) === target);
  await deps.moveLorebookManyToFolder([...state.loreSelected], folder ? folder.ref : '');
}

async function renderAssetPanel(deps: RightManagerPanelDeps, body: HTMLElement): Promise<void> {
  const toolbar = el('div', 'manager-toolbar');
  const query = el('input', 'manager-search') as HTMLInputElement;
  query.setAttribute('data-manager-focus-key', 'asset-search');
  query.placeholder = '검색...';
  query.value = state.assetQuery;
  query.addEventListener('input', () => {
    state.assetQuery = query.value;
    renderRightManagerPanelWithFocus('asset-manager-panel');
  });
  toolbar.appendChild(query);
  toolbar.appendChild(makeToolbarButton('+', '추가 에셋 추가', () => deps.addAssetFromDialog('other')));
  toolbar.appendChild(makeToolbarButton('★', '캐릭터 아이콘 추가', () => deps.addAssetFromDialog('icon')));
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
  body.appendChild(groupBar);

  if (state.assetSelected.size > 0) {
    const selectedBar = el('div', 'manager-selected-bar');
    selectedBar.appendChild(el('span', '', `${state.assetSelected.size}개 선택됨`));
    selectedBar.appendChild(
      makeToolbarButton('삭제', '선택 에셋 삭제', async () => {
        await deps.deleteAssets([...state.assetSelected]);
        state.assetSelected.clear();
        renderRightManagerPanel();
      }),
    );
    body.appendChild(selectedBar);
  }

  const grid = el('div', 'manager-asset-grid');
  grid.addEventListener('dragover', (event) => {
    event.preventDefault();
    grid.classList.add('drag-over');
  });
  grid.addEventListener('dragleave', () => grid.classList.remove('drag-over'));
  grid.addEventListener('drop', (event) => {
    event.preventDefault();
    grid.classList.remove('drag-over');
    const folder = state.assetGroup === 'icon' ? 'icon' : 'other';
    void addDroppedAssetFiles(deps, event.dataTransfer?.files || null, folder);
  });
  body.appendChild(grid);
  const assets = await deps.getAssetList();
  const queryLower = state.assetQuery.trim().toLowerCase();
  const filtered = assets.filter((asset) => {
    const group = asset.path.split('/')[1] === 'icon' ? 'icon' : 'other';
    if (state.assetGroup !== 'all' && state.assetGroup !== group) return false;
    if (!queryLower) return true;
    return asset.path.toLowerCase().includes(queryLower);
  });

  for (const asset of filtered) {
    grid.appendChild(await createAssetCard(deps, asset));
  }
  if (!filtered.length) grid.appendChild(el('div', 'right-manager-empty', '표시할 에셋이 없습니다.'));
}

async function createAssetCard(deps: RightManagerPanelDeps, asset: AssetListEntry): Promise<HTMLElement> {
  const card = el('div', 'manager-asset-card');
  card.classList.toggle('selected', state.assetSelected.has(asset.path));
  const fileName = asset.path.split('/').pop() || asset.path;

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
  actions.appendChild(makeToolbarButton('✎', '이름 변경', () => void deps.renameAsset(asset.path, fileName)));
  actions.appendChild(makeToolbarButton('✕', '삭제', () => void deps.deleteAssets([asset.path])));
  card.appendChild(actions);

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
  const loreRoot = document.getElementById('lore-manager-panel');
  const assetRoot = document.getElementById('asset-manager-panel');
  if (loreRoot) {
    renderPanelShell(depsRef, loreRoot, '로어북 관리자', (body) => renderLorebookPanel(depsRef!, body));
  }
  if (assetRoot) {
    renderPanelShell(depsRef, assetRoot, '에셋 관리자', (body) => void renderAssetPanel(depsRef!, body));
  }
  depsRef.afterRender?.();
}
