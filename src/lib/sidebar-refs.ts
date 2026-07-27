import { createTreeItem, createFolderItem } from './sidebar-builder';
import {
  findReferenceUiFieldItem,
  getReferenceGreetingItemLabel,
  getReferenceUiItems,
} from './reference-item-registry';
import { getRefFileType } from './reference-shared';
import { getReferenceExplorerWorkspaces } from './reference-explorer-model';
import { getFolderRef, resolveLorebookFolderRef } from './lorebook-folders';
import { parseLuaSections, parseCssSections } from './section-parser';
import { parseTriggerScriptsText } from './trigger-script-model';
import { normalizeTriggerScriptsText } from './trigger-scripts-runtime';

// ---- Types ----

export interface ReferenceFileData {
  lua?: string;
  css?: string;
  globalNote?: string;
  firstMessage?: string;
  description?: string;
  triggerScripts?: string;
  alternateGreetings?: string[];
  groupOnlyGreetings?: string[];
  defaultVariables?: string;
  lorebook?: Array<Record<string, unknown>>;
  regex?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ReferenceFile {
  id?: string;
  fileName: string;
  filePath?: string;
  fileType?: 'charx' | 'risum' | 'risup';
  data: ReferenceFileData;
}

export interface OpenedTab {
  id: string;
  _refLorebook?: unknown[];
  _risupGroupId?: string;
  [key: string]: unknown;
}

export interface RefsSidebarDeps {
  // State
  getReferenceFiles(): ReferenceFile[];
  syncReferenceFiles(): Promise<ReferenceFile[]>;

  // UI primitives
  showContextMenu(x: number, y: number, items: unknown[]): void;
  showConfirm(msg: string): Promise<boolean>;
  showPrompt(msg: string, defaultValue: string): Promise<string | null>;
  setStatus(msg: string): void;

  // Tab management
  openTab(
    id: string,
    label: string,
    lang: string,
    getValue: () => unknown,
    setValue: ((v: unknown) => void) | null,
  ): OpenedTab | null;
  findOpenTab(id: string): OpenedTab | undefined;
  activateTab(id: string): void;
  closeTab(id: string): void;

  // External text editing
  openExternalTextTab(
    id: string,
    label: string,
    value: string,
    persist: (val: string) => void | Promise<void>,
    language?: string,
  ): void;

  // IPC (tokiAPI wrappers)
  openReference(): Promise<unknown>;
  removeReference(pathOrName: string): Promise<void>;
  removeAllReferences(): Promise<void>;
  listGuides(): Promise<{ builtIn?: string[]; session?: string[] } | string[] | null>;
  readGuide(name: string): Promise<string | null>;
  writeGuide(name: string, content: string): Promise<void>;
  deleteGuide(name: string): Promise<void>;
  importGuide(): Promise<string[]>;
  resolveGuidePath(name: string): Promise<string | null>;
}

// ---- Pure utilities ----

export function isSameReferencePath(left: unknown, right: unknown): boolean {
  return (
    typeof left === 'string' &&
    typeof right === 'string' &&
    left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
  );
}

export function stringifyStringArray(value: unknown): string {
  return JSON.stringify(Array.isArray(value) ? value : [], null, 2);
}

// ---- addReferenceFile ----

export async function addReferenceFile(container: HTMLElement, deps: RefsSidebarDeps): Promise<void> {
  const beforeCount = (await deps.syncReferenceFiles()).length;
  const result = await deps.openReference();
  if (!result) return;
  const added = (await deps.syncReferenceFiles()).length - beforeCount;
  if (added > 0) {
    await buildRefsSidebar(container, deps, 'files');
    deps.setStatus(`참고 파일 추가: ${added}개`);
  } else {
    deps.setStatus('이미 로드된 파일입니다');
  }
}

// ---- buildRefsSidebar ----

let _buildVersion = 0;
let _selectedReferenceKey: string | null = null;
const _selectedWorkspaceByReference = new Map<string, string>();
const _expandedReferenceLoreFolders = new Set<string>();
export type ReferencePanelView = 'guides' | 'files';

/** @internal — exposed for testing only */
export function _resetBuildVersion(): void {
  _buildVersion = 0;
  _selectedReferenceKey = null;
  _selectedWorkspaceByReference.clear();
  _expandedReferenceLoreFolders.clear();
}

export async function buildRefsSidebar(
  container: HTMLElement,
  deps: RefsSidebarDeps,
  view: ReferencePanelView = 'files',
): Promise<void> {
  const myVersion = ++_buildVersion;
  container.innerHTML = '';
  await deps.syncReferenceFiles();
  if (myVersion !== _buildVersion) return;
  const referenceFiles = deps.getReferenceFiles();

  const body = document.createElement('div');
  body.className = 'reference-subtab-body';
  container.appendChild(body);

  if (view === 'guides') {
    const guideData = await deps.listGuides();
    if (myVersion !== _buildVersion) return;
    const builtInFiles =
      (guideData as { builtIn?: string[] })?.builtIn || (Array.isArray(guideData) ? (guideData as string[]) : []);
    const sessionFiles = (guideData as { session?: string[] })?.session || [];
    renderGuidesView(body, container, deps, builtInFiles, sessionFiles);
  } else {
    renderReferenceFilesView(body, container, deps, referenceFiles);
  }
}

function createToolbarButton(label: string, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'reference-toolbar-button';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('click', onClick);
  return button;
}

function renderGuidesView(
  body: HTMLElement,
  rootContainer: HTMLElement,
  deps: RefsSidebarDeps,
  builtInFiles: string[],
  sessionFiles: string[],
): void {
  const toolbar = document.createElement('div');
  toolbar.className = 'reference-toolbar';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = '가이드 검색…';
  search.setAttribute('aria-label', '가이드 검색');
  const actions = document.createElement('div');
  actions.className = 'reference-toolbar-actions';
  toolbar.append(search, actions);
  const tree = document.createElement('div');
  tree.className = 'reference-explorer-tree';
  body.append(toolbar, tree);

  const createGuide = async () => {
    const name = await deps.showPrompt('파일 이름 (예: guide.md)', 'new_guide.md');
    if (!name) return;
    const fileName = name.endsWith('.md') ? name : `${name}.md`;
    await deps.writeGuide(fileName, '');
    await buildRefsSidebar(rootContainer, deps, 'guides');
    deps.openExternalTextTab(
      `guide_${fileName}`,
      `[가이드] ${fileName}`,
      '',
      (value: string) => deps.writeGuide(fileName, value),
      'markdown',
    );
    deps.setStatus(`가이드 생성: ${fileName}`);
  };
  const importGuide = async () => {
    const imported = await deps.importGuide();
    if (imported.length === 0) return;
    await buildRefsSidebar(rootContainer, deps, 'guides');
    deps.setStatus(`가이드 불러옴 (세션): ${imported.join(', ')}`);
  };
  actions.append(
    createToolbarButton('+', '새 가이드 작성', () => void createGuide()),
    createToolbarButton('⇩', '가이드 불러오기 (세션 전용)', () => void importGuide()),
  );

  const renderTree = () => {
    tree.innerHTML = '';
    const query = search.value.trim().toLocaleLowerCase();
    const guidePathFolders = new Map<string, HTMLDivElement>();
    let sessionGuideRoot: HTMLDivElement | null = null;

    const destination = (fileName: string, isSession: boolean) => {
      const parts = fileName.replace(/\\/g, '/').split('/').filter(Boolean);
      const label = parts.pop() || fileName;
      let parent = tree;
      let indent = 0;
      let key = isSession ? 'session' : 'built-in';
      if (isSession) {
        if (!sessionGuideRoot) {
          const sessionFolder = createFolderItem('세션 가이드', '⏳', 0);
          tree.append(sessionFolder.header, sessionFolder.children);
          sessionGuideRoot = sessionFolder.children;
        }
        parent = sessionGuideRoot;
        indent = 1;
      }
      for (const segment of parts) {
        key += `/${segment}`;
        let children = guidePathFolders.get(key);
        if (!children) {
          const folder = createFolderItem(segment, '📁', indent);
          folder.header.dataset.label = segment;
          parent.append(folder.header, folder.children);
          children = folder.children;
          guidePathFolders.set(key, children);
        }
        parent = children;
        indent += 1;
      }
      return { parent, label, indent };
    };

    const addGuideItem = (fileName: string, isSession: boolean) => {
      if (query && !fileName.toLocaleLowerCase().includes(query)) return;
      const target = destination(fileName, isSession);
      const item = createTreeItem(target.label, '·', target.indent);
      item.title = fileName;
      item.addEventListener('click', async () => {
        const tabId = `guide_${fileName}`;
        if (deps.findOpenTab(tabId)) {
          deps.activateTab(tabId);
          return;
        }
        const content = await deps.readGuide(fileName);
        if (content == null) {
          deps.setStatus('가이드 파일 읽기 실패');
          return;
        }
        deps.openExternalTextTab(
          tabId,
          `[가이드] ${fileName}`,
          content,
          (value: string) => deps.writeGuide(fileName, value),
          'markdown',
        );
      });
      item.addEventListener('contextmenu', (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const items: unknown[] = [
          {
            label: '이름 복사',
            action: () => {
              void navigator.clipboard.writeText(fileName);
              deps.setStatus(`복사됨: ${fileName}`);
            },
          },
        ];
        if (!isSession) {
          items.push({
            label: '경로 복사',
            action: async () => {
              const resolvedPath = await deps.resolveGuidePath(fileName);
              const fullPath = resolvedPath ? resolvedPath.replace(/\\/g, '/') : fileName;
              await navigator.clipboard.writeText(fullPath);
              deps.setStatus(`복사됨: ${fullPath}`);
            },
          });
        }
        items.push('---', {
          label: isSession ? '제거' : '삭제',
          action: async () => {
            const message = isSession
              ? `"${fileName}" 세션 가이드를 제거하시겠습니까?`
              : `"${fileName}" 가이드를 삭제하시겠습니까?`;
            if (!(await deps.showConfirm(message))) return;
            deps.closeTab(`guide_${fileName}`);
            await deps.deleteGuide(fileName);
            await buildRefsSidebar(rootContainer, deps, 'guides');
            deps.setStatus(isSession ? `가이드 제거됨: ${fileName}` : `가이드 삭제됨: ${fileName}`);
          },
        });
        deps.showContextMenu(event.clientX, event.clientY, items);
      });
      target.parent.appendChild(item);
    };

    for (const fileName of builtInFiles) addGuideItem(fileName, false);
    for (const fileName of sessionFiles) addGuideItem(fileName, true);
    if (!tree.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'reference-empty-state';
      empty.textContent = query ? '검색 결과가 없습니다.' : '등록된 가이드가 없습니다.';
      tree.appendChild(empty);
    }
  };
  search.addEventListener('input', renderTree);
  renderTree();
}

function referenceKey(reference: ReferenceFile, index: number): string {
  return reference.id || reference.filePath || `${index}:${reference.fileName}`;
}

function referenceDisplayName(reference: ReferenceFile): string {
  return reference.fileName.replace(/\\/g, '/').split('/').filter(Boolean).pop() || reference.fileName;
}

function renderReferenceFilesView(
  body: HTMLElement,
  rootContainer: HTMLElement,
  deps: RefsSidebarDeps,
  referenceFiles: ReferenceFile[],
): void {
  body.innerHTML = '';
  const selectedIndex = referenceFiles.findIndex(
    (reference, index) => referenceKey(reference, index) === _selectedReferenceKey,
  );
  if (selectedIndex >= 0) {
    renderSelectedReference(body, rootContainer, deps, referenceFiles, selectedIndex);
    return;
  }
  _selectedReferenceKey = null;

  const toolbar = document.createElement('div');
  toolbar.className = 'reference-toolbar';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = '참고 파일 검색…';
  search.setAttribute('aria-label', '참고 파일 검색');
  const actions = document.createElement('div');
  actions.className = 'reference-toolbar-actions';
  actions.append(
    createToolbarButton('+', '참고 파일 추가', () => {
      void addReferenceFile(rootContainer, deps);
    }),
  );
  if (referenceFiles.length > 0) {
    actions.append(
      createToolbarButton('⋯', '참고 파일 메뉴', (event) => {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        deps.showContextMenu(rect.right, rect.bottom, [
          {
            label: '모두 제거',
            action: async () => {
              await deps.removeAllReferences();
              _selectedReferenceKey = null;
              await buildRefsSidebar(rootContainer, deps, 'files');
            },
          },
        ]);
      }),
    );
  }
  toolbar.append(search, actions);
  const list = document.createElement('div');
  list.className = 'reference-file-list';
  body.append(toolbar, list);

  const renderList = () => {
    list.innerHTML = '';
    const query = search.value.trim().toLocaleLowerCase();
    referenceFiles.forEach((reference, index) => {
      const haystack = `${reference.fileName} ${reference.filePath || ''}`.toLocaleLowerCase();
      if (query && !haystack.includes(query)) return;
      const fileType = reference.fileType || getRefFileType(reference);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'reference-file-row';
      row.title = reference.filePath || reference.fileName;
      row.innerHTML = `<span class="reference-file-badge">${fileType.toUpperCase()}</span><span class="reference-file-copy"><strong></strong><small></small></span><span class="reference-file-chevron">›</span>`;
      row.querySelector('strong')!.textContent = referenceDisplayName(reference);
      row.querySelector('small')!.textContent = reference.filePath || reference.fileName;
      row.addEventListener('click', () => {
        _selectedReferenceKey = referenceKey(reference, index);
        renderReferenceFilesView(body, rootContainer, deps, referenceFiles);
      });
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        showReferenceFileMenu(event.clientX, event.clientY, rootContainer, deps, referenceFiles, index);
      });
      list.appendChild(row);
    });
    if (!list.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'reference-empty-state';
      empty.textContent = query ? '검색 결과가 없습니다.' : '등록된 참고 파일이 없습니다.';
      list.appendChild(empty);
    }
  };
  search.addEventListener('input', renderList);
  renderList();
}

function showReferenceFileMenu(
  x: number,
  y: number,
  rootContainer: HTMLElement,
  deps: RefsSidebarDeps,
  referenceFiles: ReferenceFile[],
  index: number,
): void {
  const reference = referenceFiles[index];
  const items: unknown[] = [
    {
      label: '이름 복사',
      action: () => {
        void navigator.clipboard.writeText(reference.fileName);
        deps.setStatus(`복사됨: ${reference.fileName}`);
      },
    },
  ];
  if (reference.filePath) {
    items.push({
      label: '경로 복사',
      action: () => {
        void navigator.clipboard.writeText(reference.filePath!);
        deps.setStatus(`복사됨: ${reference.filePath}`);
      },
    });
  }
  items.push('---', {
    label: '참고 파일 제거',
    action: async () => {
      await deps.removeReference(reference.filePath || reference.fileName);
      _selectedReferenceKey = null;
      await buildRefsSidebar(rootContainer, deps, 'files');
    },
  });
  deps.showContextMenu(x, y, items);
}

function renderSelectedReference(
  body: HTMLElement,
  rootContainer: HTMLElement,
  deps: RefsSidebarDeps,
  referenceFiles: ReferenceFile[],
  refIdx: number,
): void {
  const reference = referenceFiles[refIdx];
  const fileType = reference.fileType || getRefFileType(reference);
  const key = referenceKey(reference, refIdx);
  const workspaces = getReferenceExplorerWorkspaces(fileType, reference.data);
  let workspaceId = _selectedWorkspaceByReference.get(key);
  if (!workspaceId || !workspaces.some((workspace) => workspace.id === workspaceId)) {
    workspaceId = workspaces[0]?.id;
  }
  if (workspaceId) _selectedWorkspaceByReference.set(key, workspaceId);

  const header = document.createElement('div');
  header.className = 'reference-detail-header';
  const back = createToolbarButton('‹', '참고 파일 목록으로 돌아가기', () => {
    _selectedReferenceKey = null;
    renderReferenceFilesView(body, rootContainer, deps, referenceFiles);
  });
  const identity = document.createElement('div');
  identity.className = 'reference-detail-identity';
  const name = document.createElement('strong');
  name.textContent = referenceDisplayName(reference);
  const badge = document.createElement('span');
  badge.className = 'reference-file-badge';
  badge.textContent = fileType.toUpperCase();
  identity.append(name, badge);
  const menu = createToolbarButton('⋯', '참고 파일 메뉴', (event) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    showReferenceFileMenu(rect.right, rect.bottom, rootContainer, deps, referenceFiles, refIdx);
  });
  header.append(back, identity, menu);

  const workspaceTabs = document.createElement('div');
  workspaceTabs.className = 'reference-workspace-tabs';
  workspaceTabs.setAttribute('role', 'tablist');
  workspaceTabs.setAttribute('aria-label', '참고 파일 작업공간');
  const content = document.createElement('div');
  content.className = 'reference-workspace-content';
  body.append(header, workspaceTabs, content);

  const renderWorkspace = () => {
    content.innerHTML = '';
    workspaceTabs.querySelectorAll('button').forEach((button) => {
      const active = button.dataset.workspaceId === workspaceId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      const empty = document.createElement('div');
      empty.className = 'reference-empty-state';
      empty.textContent = '표시할 항목이 없습니다.';
      content.appendChild(empty);
      return;
    }
    renderReferenceWorkspaceItems(content, deps, reference, refIdx, workspace.items);
  };

  for (const workspace of workspaces) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.workspaceId = workspace.id;
    button.setAttribute('role', 'tab');
    button.textContent = workspace.label;
    button.addEventListener('click', () => {
      workspaceId = workspace.id;
      _selectedWorkspaceByReference.set(key, workspace.id);
      renderWorkspace();
    });
    workspaceTabs.appendChild(button);
  }
  renderWorkspace();
}

function renderReferenceWorkspaceItems(
  container: HTMLElement,
  deps: RefsSidebarDeps,
  ref: ReferenceFile,
  refIdx: number,
  items: ReturnType<typeof getReferenceExplorerWorkspaces>[number]['items'],
): void {
  container.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>('.tree-item');
    if (!item || !container.contains(item)) return;
    container.querySelectorAll('.tree-item.active').forEach((candidate) => candidate.classList.remove('active'));
    item.classList.add('active');
  });

  for (const item of items) {
    if (item.kind === 'field') {
      const el = createTreeItem(item.label, item.icon, 0);
      const tabId = `ref_${refIdx}_${item.field}`;
      el.addEventListener('click', () => {
        deps.openTab(tabId, `[참고] ${ref.fileName} - ${item.label}`, item.language, () => ref.data[item.field], null);
      });
      el.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        deps.showContextMenu(e.clientX, e.clientY, [
          {
            label: 'MCP 경로 복사',
            action: () => {
              navigator.clipboard.writeText(`read_reference_field(${refIdx}, "${item.field}")`);
              deps.setStatus(`복사됨: read_reference_field(${refIdx}, "${item.field}")`);
            },
          },
        ]);
      });
      container.appendChild(el);
      continue;
    }
    if (item.kind === 'greetings') {
      renderRefGreetings(container, deps, ref, refIdx, item.label, item.greetingType, item.field, item.icon);
      continue;
    }
    if (item.kind === 'lua') {
      renderRefLua(container, deps, ref, refIdx);
      continue;
    }
    if (item.kind === 'css') {
      renderRefCss(container, deps, ref, refIdx);
      continue;
    }
    if (item.kind === 'triggerScripts') {
      renderRefTriggerScripts(container, deps, ref, refIdx, item.label, item.icon);
      continue;
    }
    if (item.kind === 'lorebook') {
      renderRefLorebook(container, deps, ref, refIdx);
      continue;
    }
    if (item.kind === 'regex') {
      renderRefRegex(container, deps, ref, refIdx);
      continue;
    }
    if (item.kind === 'risup-group') {
      const el = createTreeItem(item.label, item.icon, 0);
      const tabId = `ref_${refIdx}_risup_${item.groupId}`;
      el.addEventListener('click', () => {
        const tab = deps.openTab(tabId, `[참고] ${ref.fileName} - ${item.label}`, '_risupform', () => ref.data, null);
        if (tab) tab._risupGroupId = item.groupId;
      });
      container.appendChild(el);
    }
  }
}

function renderRefGreetings(
  parent: HTMLElement,
  deps: RefsSidebarDeps,
  ref: ReferenceFile,
  refIdx: number,
  label: string,
  greetingType: 'alternate' | 'group',
  fieldName: 'alternateGreetings' | 'groupOnlyGreetings',
  icon: string,
): void {
  const greetings = Array.isArray(ref.data[fieldName]) ? ref.data[fieldName] : [];
  if (greetings.length === 0) return;

  const folder = createFolderItem(label, icon, 1);
  parent.appendChild(folder.header);
  parent.appendChild(folder.children);

  folder.header.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deps.showContextMenu(e.clientX, e.clientY, [
      {
        label: 'MCP 경로 복사',
        action: () => {
          navigator.clipboard.writeText(`list_reference_greetings(${refIdx}, "${greetingType}")`);
          deps.setStatus(`복사됨: list_reference_greetings(${refIdx}, "${greetingType}")`);
        },
      },
    ]);
  });

  for (let i = 0; i < greetings.length; i++) {
    const greetingLabel = getReferenceGreetingItemLabel(i);
    const itemEl = createTreeItem(greetingLabel, '·', 2);
    const tabId = `ref_${refIdx}_greeting_${greetingType}_${i}`;
    itemEl.title = greetings[i].slice(0, 80).replace(/\n/g, ' ') || '(빈 인사말)';
    itemEl.addEventListener('click', () => {
      deps.openTab(tabId, `[참고] ${ref.fileName} - ${greetingLabel}`, 'html', () => greetings[i] ?? '', null);
    });
    itemEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: 'MCP 경로 복사',
          action: () => {
            navigator.clipboard.writeText(`read_reference_greeting(${refIdx}, "${greetingType}", ${i})`);
            deps.setStatus(`복사됨: read_reference_greeting(${refIdx}, "${greetingType}", ${i})`);
          },
        },
      ]);
    });
    folder.children.appendChild(itemEl);
  }
}

// ---- Lua sub-tree ----

function renderRefLua(parent: HTMLElement, deps: RefsSidebarDeps, ref: ReferenceFile, refIdx: number): void {
  const refLuaSections = parseLuaSections(ref.data.lua!);
  if (refLuaSections.length <= 1) {
    const el = createTreeItem('Lua', '·', 1);
    el.addEventListener('click', () => {
      deps.openTab(`ref_${refIdx}_lua`, `[참고] ${ref.fileName} - Lua`, 'lua', () => ref.data.lua, null);
    });
    el.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: 'MCP 경로 복사',
          action: () => {
            navigator.clipboard.writeText(`list_reference_lua(${refIdx})`);
            deps.setStatus(`복사됨: list_reference_lua(${refIdx})`);
          },
        },
      ]);
    });
    parent.appendChild(el);
  } else {
    const luaFolder = createFolderItem('Lua', '{}', 1);
    parent.appendChild(luaFolder.header);
    parent.appendChild(luaFolder.children);
    // Combined view
    const combinedEl = createTreeItem('통합 보기', '📋', 2);
    combinedEl.addEventListener('click', () => {
      deps.openTab(`ref_${refIdx}_lua`, `[참고] ${ref.fileName} - Lua (통합)`, 'lua', () => ref.data.lua, null);
    });
    combinedEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: 'MCP 경로 복사',
          action: () => {
            navigator.clipboard.writeText(`list_reference_lua(${refIdx})`);
            deps.setStatus(`복사됨: list_reference_lua(${refIdx})`);
          },
        },
      ]);
    });
    luaFolder.children.appendChild(combinedEl);
    // Individual sections
    for (let si = 0; si < refLuaSections.length; si++) {
      const sec = refLuaSections[si];
      const secEl = createTreeItem(sec.name, '·', 2);
      const secIdx = si;
      secEl.addEventListener('click', () => {
        deps.openTab(
          `ref_${refIdx}_lua_s${secIdx}`,
          `[참고] ${ref.fileName} - ${sec.name}`,
          'lua',
          () => refLuaSections[secIdx].content,
          null,
        );
      });
      secEl.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        deps.showContextMenu(e.clientX, e.clientY, [
          {
            label: 'MCP 경로 복사',
            action: () => {
              navigator.clipboard.writeText(`read_reference_lua(${refIdx}, ${secIdx})`);
              deps.setStatus(`복사됨: 참고자료[${refIdx}] Lua 섹션[${secIdx}]`);
            },
          },
        ]);
      });
      luaFolder.children.appendChild(secEl);
    }
  }
}

// ---- CSS sub-tree ----

function renderRefCss(parent: HTMLElement, deps: RefsSidebarDeps, ref: ReferenceFile, refIdx: number): void {
  const refCssSections = parseCssSections(ref.data.css!).sections;
  if (refCssSections.length <= 1) {
    const el = createTreeItem('CSS', '·', 1);
    el.addEventListener('click', () => {
      deps.openTab(`ref_${refIdx}_css`, `[참고] ${ref.fileName} - CSS`, 'css', () => ref.data.css, null);
    });
    el.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: 'MCP 경로 복사',
          action: () => {
            navigator.clipboard.writeText(`list_reference_css(${refIdx})`);
            deps.setStatus(`복사됨: list_reference_css(${refIdx})`);
          },
        },
      ]);
    });
    parent.appendChild(el);
  } else {
    const cssFolderRef = createFolderItem('CSS', '🎨', 1);
    parent.appendChild(cssFolderRef.header);
    parent.appendChild(cssFolderRef.children);
    const combinedEl = createTreeItem('통합 보기', '📋', 2);
    combinedEl.addEventListener('click', () => {
      deps.openTab(`ref_${refIdx}_css`, `[참고] ${ref.fileName} - CSS (통합)`, 'css', () => ref.data.css, null);
    });
    combinedEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: 'MCP 경로 복사',
          action: () => {
            navigator.clipboard.writeText(`list_reference_css(${refIdx})`);
            deps.setStatus(`복사됨: list_reference_css(${refIdx})`);
          },
        },
      ]);
    });
    cssFolderRef.children.appendChild(combinedEl);
    for (let si = 0; si < refCssSections.length; si++) {
      const sec = refCssSections[si];
      const secEl = createTreeItem(sec.name, '·', 2);
      const secIdx = si;
      secEl.addEventListener('click', () => {
        deps.openTab(
          `ref_${refIdx}_css_s${secIdx}`,
          `[참고] ${ref.fileName} - ${sec.name}`,
          'css',
          () => refCssSections[secIdx].content,
          null,
        );
      });
      secEl.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        deps.showContextMenu(e.clientX, e.clientY, [
          {
            label: 'MCP 경로 복사',
            action: () => {
              navigator.clipboard.writeText(`read_reference_css(${refIdx}, ${secIdx})`);
              deps.setStatus(`복사됨: 참고자료[${refIdx}] CSS 섹션[${secIdx}]`);
            },
          },
        ]);
      });
      cssFolderRef.children.appendChild(secEl);
    }
  }
}

// ---- Lorebook sub-tree ----

function renderRefLorebook(parent: HTMLElement, deps: RefsSidebarDeps, ref: ReferenceFile, refIdx: number): void {
  const lorebook = ref.data.lorebook!;
  const folderDataList: {
    entry: Record<string, unknown>;
    index: number;
    ref: string;
    children: { entry: Record<string, unknown>; index: number }[];
  }[] = [];
  const folderLookup = new Map<string, (typeof folderDataList)[number]>();
  const rootEntries: { entry: Record<string, unknown>; index: number }[] = [];

  for (let li = 0; li < lorebook.length; li++) {
    const entry = lorebook[li];
    if (entry.mode === 'folder') {
      const folderRef = getFolderRef(entry) || `idx:${li}`;
      const fd = { entry, index: li, ref: folderRef, children: [] as typeof rootEntries };
      folderDataList.push(fd);
      if (folderRef.startsWith('folder:')) folderLookup.set(folderRef, fd);
    }
  }
  for (let li = 0; li < lorebook.length; li++) {
    const entry = lorebook[li];
    if (entry.mode === 'folder') continue;
    const folderRef = resolveLorebookFolderRef(entry.folder, lorebook);
    const matched = folderLookup.get(folderRef);
    if (matched) {
      matched.children.push({ entry, index: li });
    } else {
      rootEntries.push({ entry, index: li });
    }
  }

  const list = document.createElement('div');
  list.className = 'manager-list reference-lorebook-list';
  parent.appendChild(list);

  function makeRefLoreItem(child: { entry: Record<string, unknown>; index: number }): HTMLDivElement {
    const lbLabel = (child.entry.comment as string) || (child.entry.key as string) || `#${child.index}`;
    const lbEl = document.createElement('div');
    lbEl.className = 'manager-lore-row reference-lorebook-row';
    lbEl.tabIndex = 0;
    lbEl.setAttribute('role', 'button');
    const main = document.createElement('div');
    main.className = 'manager-row-main';
    const title = document.createElement('div');
    title.className = 'manager-row-title';
    title.textContent = lbLabel;
    const subtitle = document.createElement('div');
    subtitle.className = 'manager-row-subtitle';
    subtitle.textContent = String(child.entry.key || '키 없음');
    main.append(title, subtitle);
    const tags = document.createElement('div');
    tags.className = 'manager-row-tags';
    if (child.entry.alwaysActive || child.entry.constant || child.entry.forceActivation) {
      const chip = document.createElement('span');
      chip.className = 'manager-chip manager-badge-accent';
      chip.textContent = '항상';
      tags.appendChild(chip);
    }
    if (child.entry.selective) {
      const chip = document.createElement('span');
      chip.className = 'manager-chip';
      chip.textContent = '2키';
      tags.appendChild(chip);
    }
    if (child.entry.useRegex || child.entry.mode === 'regex') {
      const chip = document.createElement('span');
      chip.className = 'manager-chip';
      chip.textContent = '정규식';
      tags.appendChild(chip);
    }
    lbEl.append(main, tags);
    const li = child.index;
    const lbTabId = `ref_${refIdx}_lb_${li}`;
    const openEntry = () => {
      const tab = deps.openTab(lbTabId, `[참고] ${ref.fileName} - ${lbLabel}`, '_loreform', () => lorebook[li], null);
      if (tab) tab._refLorebook = lorebook;
    };
    lbEl.addEventListener('click', openEntry);
    lbEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openEntry();
    });
    lbEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: '키 복사',
          action: () => {
            navigator.clipboard.writeText((child.entry.key as string) || '');
            deps.setStatus(`복사됨: ${child.entry.key}`);
          },
        },
        {
          label: '내용 복사',
          action: () => {
            navigator.clipboard.writeText((child.entry.content as string) || '');
            deps.setStatus('내용 복사됨');
          },
        },
        {
          label: 'MCP 경로 복사',
          action: () => {
            navigator.clipboard.writeText(`read_reference_lorebook(${refIdx}, ${li})`);
            deps.setStatus(`복사됨: 참고자료[${refIdx}] 로어북[${li}]`);
          },
        },
      ]);
    });
    return lbEl;
  }

  for (const folder of folderDataList) {
    const folderName = (folder.entry.comment as string) || (folder.entry.key as string) || `folder_${folder.index}`;
    const folderRow = document.createElement('div');
    folderRow.className = 'manager-folder-row reference-lorebook-folder';
    const arrow = document.createElement('button');
    arrow.type = 'button';
    arrow.className = 'manager-folder-arrow';
    const expanded = _expandedReferenceLoreFolders.has(folder.ref);
    arrow.textContent = expanded ? '▼' : '▶';
    arrow.setAttribute('aria-expanded', String(expanded));
    arrow.setAttribute('aria-label', `${folderName} 폴더 ${expanded ? '접기' : '펼치기'}`);
    const label = document.createElement('div');
    label.className = 'manager-folder-label';
    label.textContent = folderName;
    label.title = folderName;
    const badge = document.createElement('span');
    badge.className = 'manager-badge';
    badge.textContent = `${folder.children.length}`;
    folderRow.append(arrow, label, badge);
    const children = document.createElement('div');
    children.className = 'manager-folder-children';
    children.hidden = !expanded;
    for (const child of folder.children) {
      children.appendChild(makeRefLoreItem(child));
    }
    arrow.addEventListener('click', () => {
      const nextExpanded = children.hidden;
      children.hidden = !nextExpanded;
      arrow.textContent = nextExpanded ? '▼' : '▶';
      arrow.setAttribute('aria-expanded', String(nextExpanded));
      arrow.setAttribute('aria-label', `${folderName} 폴더 ${nextExpanded ? '접기' : '펼치기'}`);
      if (nextExpanded) _expandedReferenceLoreFolders.add(folder.ref);
      else _expandedReferenceLoreFolders.delete(folder.ref);
    });
    list.append(folderRow, children);
  }
  const rootList = document.createElement('div');
  rootList.className = 'manager-root-entries reference-lorebook-root';
  for (const child of rootEntries) {
    rootList.appendChild(makeRefLoreItem(child));
  }
  list.appendChild(rootList);
  if (!folderDataList.length && !rootEntries.length) {
    const empty = document.createElement('div');
    empty.className = 'right-manager-empty';
    empty.textContent = '표시할 로어북 항목이 없습니다.';
    list.appendChild(empty);
  }
}

// ---- Regex sub-tree ----

function renderRefRegex(parent: HTMLElement, deps: RefsSidebarDeps, ref: ReferenceFile, refIdx: number): void {
  const regex = ref.data.regex!;
  const rxFolder = createFolderItem(`정규식 (${regex.length})`, '⚡', 1);
  parent.appendChild(rxFolder.header);
  parent.appendChild(rxFolder.children);
  for (let xi = 0; xi < regex.length; xi++) {
    const rx = regex[xi];
    const rxLabel = (rx.comment as string) || `#${xi}`;
    const rxEl = createTreeItem(rxLabel, '·', 2);
    const rxTabId = `ref_${refIdx}_rx_${xi}`;
    const rxIdx = xi;
    rxEl.addEventListener('click', () => {
      deps.openTab(rxTabId, `[참고] ${ref.fileName} - ${rxLabel}`, '_regexform', () => ref.data.regex![rxIdx], null);
    });
    rxEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: '패턴 복사',
          action: () => {
            navigator.clipboard.writeText((rx.in as string) || (rx.findRegex as string) || '');
            deps.setStatus('패턴 복사됨');
          },
        },
        {
          label: '내용 복사',
          action: () => {
            navigator.clipboard.writeText(JSON.stringify(rx, null, 2));
            deps.setStatus('내용 복사됨');
          },
        },
        {
          label: 'MCP 경로 복사',
          action: () => {
            navigator.clipboard.writeText(`read_reference_regex(${refIdx}, ${rxIdx})`);
            deps.setStatus(`복사됨: 참고자료[${refIdx}] 정규식[${rxIdx}]`);
          },
        },
      ]);
    });
    rxFolder.children.appendChild(rxEl);
  }
}

function renderRefTriggerScripts(
  parent: HTMLElement,
  deps: RefsSidebarDeps,
  ref: ReferenceFile,
  refIdx: number,
  label: string,
  icon: string,
): void {
  const el = createTreeItem(label, icon, 1);
  const tabId = `ref_${refIdx}_triggerScripts`;
  el.addEventListener('click', () => {
    deps.openTab(
      tabId,
      `[참고] ${ref.fileName} - ${label}`,
      '_triggerform',
      () => parseTriggerScriptsText(normalizeTriggerScriptsText(ref.data.triggerScripts)),
      null,
    );
  });
  el.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deps.showContextMenu(e.clientX, e.clientY, [
      {
        label: 'MCP 경로 복사',
        action: () => {
          navigator.clipboard.writeText(`list_reference_triggers(${refIdx})`);
          deps.setStatus(`복사됨: list_reference_triggers(${refIdx})`);
        },
      },
    ]);
  });
  parent.appendChild(el);
}

// ---- openRefTabById ----

export interface OpenRefTabDeps {
  getReferenceFiles(): ReferenceFile[];
  openTab(
    id: string,
    label: string,
    lang: string,
    getValue: () => unknown,
    setValue: ((v: unknown) => void) | null,
  ): OpenedTab | null;
  findOpenTab(id: string): OpenedTab | undefined;
  activateTab(id: string): void;
}

export function openRefTabById(tabId: string, deps: OpenRefTabDeps): void {
  const existing = deps.findOpenTab(tabId);
  if (existing) {
    deps.activateTab(tabId);
    return;
  }

  const parts = tabId.split('_');
  if (parts.length < 3) return;
  const ri = parseInt(parts[1], 10);
  const referenceFiles = deps.getReferenceFiles();
  if (ri < 0 || ri >= referenceFiles.length) return;
  const ref = referenceFiles[ri];
  const fileType = ref.fileType || getRefFileType(ref);
  const fieldPart = parts[2];

  if (fieldPart === 'lua') {
    deps.openTab(tabId, `[참고] ${ref.fileName} - Lua`, 'lua', () => ref.data.lua, null);
  } else if (fieldPart === 'css') {
    deps.openTab(tabId, `[참고] ${ref.fileName} - CSS`, 'css', () => ref.data.css, null);
  } else if (fieldPart === 'triggerScripts') {
    deps.openTab(
      tabId,
      `[참고] ${ref.fileName} - 트리거 스크립트`,
      '_triggerform',
      () => parseTriggerScriptsText(normalizeTriggerScriptsText(ref.data.triggerScripts)),
      null,
    );
  } else if (fieldPart === 'greeting' && parts.length >= 5) {
    const greetingType = parts[3];
    const fieldName =
      greetingType === 'alternate' ? 'alternateGreetings' : greetingType === 'group' ? 'groupOnlyGreetings' : null;
    const idx = parseInt(parts[4], 10);
    const greetings = fieldName && Array.isArray(ref.data[fieldName]) ? ref.data[fieldName] : [];
    if (idx >= 0 && idx < greetings.length) {
      const greetingLabel = getReferenceGreetingItemLabel(idx);
      deps.openTab(tabId, `[참고] ${ref.fileName} - ${greetingLabel}`, 'html', () => greetings[idx] ?? '', null);
    }
  } else if (fieldPart === 'risup' && parts.length >= 4) {
    const groupId = parts.slice(3).join('_');
    const groupItem = getReferenceUiItems(fileType).find(
      (item) => item.kind === 'risup-group' && item.groupId === groupId,
    );
    if (groupItem?.kind === 'risup-group') {
      const tab = deps.openTab(
        tabId,
        `[참고] ${ref.fileName} - ${groupItem.label}`,
        '_risupform',
        () => ref.data,
        null,
      );
      if (tab) tab._risupGroupId = groupItem.groupId;
    }
  } else if (fieldPart === 'lb' && parts.length >= 4) {
    const li = parseInt(parts[3], 10);
    if (ref.data.lorebook && ref.data.lorebook[li]) {
      const lbLabel = (ref.data.lorebook[li].comment as string) || (ref.data.lorebook[li].key as string) || `#${li}`;
      const tab = deps.openTab(
        tabId,
        `[참고] ${ref.fileName} - ${lbLabel}`,
        '_loreform',
        () => ref.data.lorebook![li],
        null,
      );
      if (tab) tab._refLorebook = ref.data.lorebook;
    }
  } else if (fieldPart === 'rx' && parts.length >= 4) {
    const xi = parseInt(parts[3], 10);
    if (ref.data.regex && ref.data.regex[xi]) {
      const rxLabel = (ref.data.regex[xi].comment as string) || `#${xi}`;
      deps.openTab(tabId, `[참고] ${ref.fileName} - ${rxLabel}`, '_regexform', () => ref.data.regex![xi], null);
    }
  } else {
    const fieldDef = findReferenceUiFieldItem(fileType, fieldPart);
    if (fieldDef) {
      deps.openTab(
        tabId,
        `[참고] ${ref.fileName} - ${fieldDef.label}`,
        fieldDef.language,
        () => ref.data[fieldDef.field],
        null,
      );
    }
  }
}
