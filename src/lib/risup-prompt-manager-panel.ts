import type { CharxData } from '../stores/app-store';
import {
  SUPPORTED_PROMPT_ITEM_TYPES,
  defaultPromptItem,
  duplicatePromptItem,
  parsePromptTemplate,
  serializePromptTemplate,
  type PromptItemModel,
  type SupportedPromptItemType,
} from './risup-prompt-model';
import { promptItemSearchText, promptItemSummary, promptTypeLabel } from './risup-prompt-editor';
import { showContextMenu } from './context-menu';

export interface PromptManagerPanelDeps {
  getFileData: () => CharxData | null;
  openPromptItem: (itemId: string) => void;
  setPromptTemplate: (value: string) => void;
  confirm: (message: string) => Promise<boolean>;
  setStatus: (msg: string) => void;
  refresh: () => void;
  afterRender?: () => void;
}

const TYPE_FILTERS = [
  'plain',
  'jailbreak',
  'chat',
  'persona',
  'description',
  'lorebook',
  'globalNote',
  'authornote',
] as const;

const ROLE_FILTERS = ['system', 'user', 'bot', 'assistant', 'character'] as const;

const TYPE_LABELS: Record<string, string> = {
  plain: '일반 프롬프트',
  jailbreak: '탈옥 프롬프트',
  cot: '생각의 사슬',
  chatML: 'ChatML',
  chat: '채팅',
  persona: '페르소나',
  description: '캐릭터 설명',
  lorebook: '로어북',
  globalNote: '글로벌 노트',
  postEverything: '최후 삽입',
  memory: '메모리',
  authornote: '작가 노트',
  cache: '캐시',
  raw: '원본',
};

const ROLE_LABELS: Record<string, string> = {
  system: '시스템',
  user: '유저',
  bot: '봇',
  assistant: '어시스턴트',
  character: '캐릭터',
  all: '전체',
};

const SPECIAL_LABELS: Record<string, string> = {
  main: '메인',
  globalNote: '글로벌 노트',
  hasName: '이름 있음',
  textless: '본문 없음',
  unsupported: '미지원',
};

const state = {
  query: '',
  sort: 'order' as 'order' | 'name' | 'type',
  typeFilters: new Set<string>(),
  roleFilters: new Set<string>(),
  specialFilters: new Set<string>(),
  selected: new Set<string>(),
};

let depsRef: PromptManagerPanelDeps | null = null;

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

function isRisupDocument(data: CharxData | null): boolean {
  return !!data && data._fileType === 'risup';
}

function promptItemTitle(item: PromptItemModel, index: number): string {
  const summary = promptItemSummary(item);
  return summary && summary !== '(비어 있음)' ? summary : `${promptTypeLabel(item.type)} ${index + 1}`;
}

function promptItemPreview(item: PromptItemModel): string {
  const text = promptItemSearchText(item).replace(/\s+/g, ' ').trim();
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

function typeLabel(type: string | null | undefined): string {
  return TYPE_LABELS[type || 'raw'] || promptTypeLabel(type);
}

function roleLabel(role: string | null | undefined): string {
  return role ? ROLE_LABELS[role] || role : '';
}

function specialLabel(value: string | null | undefined): string {
  return value ? SPECIAL_LABELS[value] || value : '';
}

function promptItemRole(item: PromptItemModel): string | null {
  if (!item.supported) return null;
  if ('role' in item && typeof item.role === 'string') return item.role;
  return null;
}

function promptItemType2(item: PromptItemModel): string | null {
  if (!item.supported) return null;
  if ('type2' in item && typeof item.type2 === 'string') return item.type2;
  return null;
}

function matchesFilters(item: PromptItemModel): boolean {
  const query = state.query.trim().toLowerCase();
  if (query && !promptItemSearchText(item).includes(query)) return false;
  if (state.typeFilters.size > 0) {
    const type = item.type ?? '';
    const type2 = promptItemType2(item) ?? '';
    if (!state.typeFilters.has(type) && !state.typeFilters.has(type2)) return false;
  }
  if (state.roleFilters.size > 0) {
    const role = promptItemRole(item) ?? '';
    if (!state.roleFilters.has(role)) return false;
  }
  if (state.specialFilters.size > 0) {
    const type2 = promptItemType2(item) ?? '';
    const type = item.type ?? '';
    if (state.specialFilters.has('main') && type2 !== 'main') return false;
    if (state.specialFilters.has('globalNote') && type2 !== 'globalNote') return false;
    if (state.specialFilters.has('unsupported') && item.supported) return false;
    if (state.specialFilters.has('hasName') && (!item.supported || !('name' in item) || !item.name)) return false;
    if (state.specialFilters.has('textless') && !['chat', 'cache'].includes(type)) return false;
  }
  return true;
}

function sortedEntries(items: PromptItemModel[]): Array<{ item: PromptItemModel; index: number }> {
  const entries = items.map((item, index) => ({ item, index })).filter(({ item }) => matchesFilters(item));
  if (state.sort === 'name') {
    entries.sort((a, b) => promptItemTitle(a.item, a.index).localeCompare(promptItemTitle(b.item, b.index)));
  } else if (state.sort === 'type') {
    entries.sort((a, b) => String(a.item.type ?? '').localeCompare(String(b.item.type ?? '')) || a.index - b.index);
  }
  return entries;
}

function writeItems(items: PromptItemModel[]): void {
  const deps = depsRef;
  if (!deps) return;
  deps.setPromptTemplate(serializePromptTemplate({ items }));
  deps.refresh();
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

function rerenderWithFocus(): void {
  const root = document.getElementById('prompt-manager-panel');
  const focus = root ? captureFocus(root) : null;
  renderPromptManagerPanel();
  if (root) restoreFocus(root, focus);
}

function getItems(): PromptItemModel[] {
  const data = depsRef?.getFileData();
  const model = parsePromptTemplate(typeof data?.promptTemplate === 'string' ? data.promptTemplate : '');
  return model.state === 'valid' || model.state === 'empty' ? model.items : [];
}

function makeToolbarButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'manager-icon-btn', label);
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('click', onClick);
  return button;
}

function makeFilterToggle(label: string, value: string, target: Set<string>, rerender: () => void): HTMLLabelElement {
  const wrap = el('label', 'manager-filter-toggle');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = target.has(value);
  input.addEventListener('change', () => {
    if (input.checked) target.add(value);
    else target.delete(value);
    rerender();
  });
  wrap.append(input, document.createTextNode(label));
  return wrap;
}

function promptAddMenu(anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const event = new CustomEvent('toki:prompt-manager-add-menu', {
    detail: { x: rect.left, y: rect.bottom },
  });
  document.dispatchEvent(event);
}

function renderPanelShell(root: HTMLElement, titleText: string, renderBody: (body: HTMLElement) => void): void {
  const data = depsRef?.getFileData() ?? null;
  root.style.display = isRisupDocument(data) ? 'flex' : 'none';
  clear(root);
  if (!isRisupDocument(data)) return;

  const header = el('div', 'right-manager-header');
  const title = el('div', 'right-manager-title', titleText);
  const actions = el('div', 'right-manager-actions');
  header.append(title, actions);
  const body = el('div', 'right-manager-body');
  root.append(header, body);
  renderBody(body);
}

function renderPromptPanel(body: HTMLElement): void {
  const deps = depsRef;
  const data = deps?.getFileData() ?? null;
  if (!deps || !isRisupDocument(data)) return;
  const risupData = data as CharxData;

  const model = parsePromptTemplate(typeof risupData.promptTemplate === 'string' ? risupData.promptTemplate : '');
  if (model.state === 'invalid') {
    const empty = el('div', 'right-manager-empty', `promptTemplate 오류: ${model.parseError ?? '알 수 없는 오류'}`);
    body.appendChild(empty);
    return;
  }

  const toolbar = el('div', 'manager-toolbar');
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'form-input manager-search-input';
  search.setAttribute('data-manager-focus-key', 'prompt-search');
  search.placeholder = '검색...';
  search.value = state.query;
  search.addEventListener('input', () => {
    state.query = search.value;
    rerenderWithFocus();
  });
  toolbar.appendChild(search);

  const sort = document.createElement('select');
  sort.className = 'form-select manager-sort-select';
  sort.setAttribute('data-manager-focus-key', 'prompt-sort');
  [
    ['order', '순서'],
    ['name', '이름'],
    ['type', '타입'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = state.sort === value;
    sort.appendChild(option);
  });
  sort.addEventListener('change', () => {
    state.sort = sort.value as typeof state.sort;
    rerenderWithFocus();
  });
  toolbar.appendChild(sort);

  const add = makeToolbarButton('+', '프롬프트 블록 추가', () => promptAddMenu(add));
  toolbar.appendChild(add);
  body.appendChild(toolbar);

  const filters = el('div', 'prompt-manager-filter-groups');
  const typeRow = el('div', 'manager-filter-section');
  typeRow.append(el('div', 'manager-filter-section-title', '타입'));
  const typeOptions = el('div', 'manager-filter-row');
  for (const type of TYPE_FILTERS)
    typeOptions.appendChild(makeFilterToggle(typeLabel(type), type, state.typeFilters, rerenderWithFocus));
  typeRow.appendChild(typeOptions);
  filters.appendChild(typeRow);
  const roleRow = el('div', 'manager-filter-section');
  roleRow.append(el('div', 'manager-filter-section-title', '역할'));
  const roleOptions = el('div', 'manager-filter-row');
  for (const role of ROLE_FILTERS)
    roleOptions.appendChild(makeFilterToggle(roleLabel(role), role, state.roleFilters, rerenderWithFocus));
  roleRow.appendChild(roleOptions);
  filters.appendChild(roleRow);
  const specialRow = el('div', 'manager-filter-section');
  specialRow.append(el('div', 'manager-filter-section-title', '특수'));
  const specialOptions = el('div', 'manager-filter-row');
  specialOptions.appendChild(makeFilterToggle('메인 프롬프트', 'main', state.specialFilters, rerenderWithFocus));
  specialOptions.appendChild(makeFilterToggle('글로벌 노트', 'globalNote', state.specialFilters, rerenderWithFocus));
  specialOptions.appendChild(makeFilterToggle('이름 있음', 'hasName', state.specialFilters, rerenderWithFocus));
  specialOptions.appendChild(makeFilterToggle('본문 없음', 'textless', state.specialFilters, rerenderWithFocus));
  specialOptions.appendChild(makeFilterToggle('미지원', 'unsupported', state.specialFilters, rerenderWithFocus));
  specialRow.appendChild(specialOptions);
  filters.appendChild(specialRow);
  body.appendChild(filters);

  if (state.selected.size > 0) {
    const selectedBar = el('div', 'manager-selected-bar');
    selectedBar.append(el('span', undefined, `${state.selected.size}개 선택됨`));
    selectedBar.appendChild(
      makeToolbarButton('삭제', '선택한 프롬프트 삭제', async () => {
        if (!(await deps.confirm(`선택한 프롬프트 블록 ${state.selected.size}개를 삭제하시겠습니까?`))) return;
        const next = model.items.filter((item) => !state.selected.has(item.id ?? ''));
        state.selected.clear();
        writeItems(next);
        deps.setStatus('선택한 프롬프트 블록을 삭제했습니다.');
      }),
    );
    body.appendChild(selectedBar);
  }

  const entries = sortedEntries(model.items);
  const list = el('div', 'manager-list prompt-manager-list');
  if (entries.length === 0) {
    list.appendChild(el('div', 'right-manager-empty', '표시할 프롬프트 블록이 없습니다.'));
  }

  for (const { item, index } of entries) {
    const id = item.id ?? `prompt-item-${index}`;
    const row = el('div', 'manager-row prompt-manager-row');
    row.classList.toggle('selected', state.selected.has(id));
    row.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) return;
      deps.openPromptItem(id);
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selected.has(id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(id);
      else state.selected.delete(id);
      renderPromptManagerPanel();
    });
    row.appendChild(checkbox);

    const main = el('div', 'manager-row-main prompt-manager-row-main');
    main.append(el('div', 'manager-row-title', promptItemTitle(item, index)));
    main.append(el('div', 'manager-row-subtitle', promptItemPreview(item)));
    row.appendChild(main);

    const badges = el('div', 'prompt-manager-badges');
    badges.append(el('span', 'manager-badge', typeLabel(item.type)));
    const role = promptItemRole(item);
    const type2 = promptItemType2(item);
    if (role) badges.append(el('span', 'manager-badge', roleLabel(role)));
    if (type2 && type2 !== 'normal')
      badges.append(el('span', 'manager-badge manager-badge-accent', specialLabel(type2)));
    row.appendChild(badges);

    const actions = el('div', 'manager-row-actions');
    actions.appendChild(
      makeToolbarButton('↑', '위로 이동', () => {
        if (index <= 0) return;
        writeItems(moveItem(model.items, index, index - 1));
      }),
    );
    actions.appendChild(
      makeToolbarButton('↓', '아래로 이동', () => {
        if (index >= model.items.length - 1) return;
        writeItems(moveItem(model.items, index, index + 1));
      }),
    );
    actions.appendChild(
      makeToolbarButton('⧉', '복제', () => {
        const next = [...model.items];
        next.splice(index + 1, 0, duplicatePromptItem(item));
        writeItems(next);
      }),
    );
    actions.appendChild(
      makeToolbarButton('✕', '삭제', async () => {
        if (!(await deps.confirm(`"${promptItemTitle(item, index)}" 프롬프트 블록을 삭제하시겠습니까?`))) return;
        const next = [...model.items];
        next.splice(index, 1);
        state.selected.delete(id);
        writeItems(next);
      }),
    );
    row.appendChild(actions);
    list.appendChild(row);
  }
  body.appendChild(list);
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function handleAddMenu(event: Event): void {
  const deps = depsRef;
  if (!deps) return;
  const detail = (event as CustomEvent<{ x: number; y: number }>).detail;
  const menu = SUPPORTED_PROMPT_ITEM_TYPES.map((type) => ({
    label: promptTypeLabel(type),
    action: () => {
      writeItems([...getItems(), defaultPromptItem(type as SupportedPromptItemType)]);
      deps.setStatus('프롬프트 블록을 추가했습니다.');
    },
  }));
  showContextMenu(detail.x, detail.y, menu);
}

export function initPromptManagerPanel(deps: PromptManagerPanelDeps): void {
  depsRef = deps;
  document.removeEventListener('toki:prompt-manager-add-menu', handleAddMenu);
  document.addEventListener('toki:prompt-manager-add-menu', handleAddMenu);
}

export function renderPromptManagerPanel(): void {
  const root = document.getElementById('prompt-manager-panel');
  if (!root) return;
  renderPanelShell(root, '프롬프트 관리자', renderPromptPanel);
  depsRef?.afterRender?.();
}
