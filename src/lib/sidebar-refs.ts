import { createTreeItem, createFolderItem } from './sidebar-builder';
import { parseLuaSections, parseCssSections } from './section-parser';

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
  lorebook?: Array<Record<string, unknown>>;
  regex?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ReferenceFile {
  fileName: string;
  filePath?: string;
  data: ReferenceFileData;
}

export interface OpenedTab {
  id: string;
  _refLorebook?: unknown[];
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
  getGuidesPath(): Promise<string | null>;
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

export async function addReferenceFile(
  container: HTMLElement,
  deps: RefsSidebarDeps,
): Promise<void> {
  const beforeCount = (await deps.syncReferenceFiles()).length;
  const result = await deps.openReference();
  if (!result) return;
  const added = (await deps.syncReferenceFiles()).length - beforeCount;
  if (added > 0) {
    await buildRefsSidebar(container, deps);
    deps.setStatus(`참고 파일 추가: ${added}개`);
  } else {
    deps.setStatus('이미 로드된 파일입니다');
  }
}

// ---- buildRefsSidebar ----

export async function buildRefsSidebar(
  container: HTMLElement,
  deps: RefsSidebarDeps,
): Promise<void> {
  container.innerHTML = '';
  await deps.syncReferenceFiles();
  const referenceFiles = deps.getReferenceFiles();

  // ---- Guides folder ----
  const guideData = await deps.listGuides();
  const builtInFiles =
    (guideData as { builtIn?: string[] })?.builtIn ||
    (Array.isArray(guideData) ? (guideData as string[]) : []);
  const sessionFiles = (guideData as { session?: string[] })?.session || [];
  const guideFolder = createFolderItem('가이드', '📖', 0);
  container.appendChild(guideFolder.header);
  container.appendChild(guideFolder.children);

  // Right-click on guide folder: new / import
  guideFolder.header.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deps.showContextMenu(e.clientX, e.clientY, [
      {
        label: '새 가이드 작성',
        action: async () => {
          const name = await deps.showPrompt(
            '파일 이름 (예: guide.md)',
            'new_guide.md',
          );
          if (!name) return;
          const fn = name.endsWith('.md') ? name : name + '.md';
          await deps.writeGuide(fn, '');
          buildRefsSidebar(container, deps);
          deps.openExternalTextTab(
            `guide_${fn}`,
            `[가이드] ${fn}`,
            '',
            (val: string) => deps.writeGuide(fn, val),
          );
          deps.setStatus(`가이드 생성: ${fn}`);
        },
      },
      {
        label: '가이드 불러오기 (세션 전용)',
        action: async () => {
          const imported = await deps.importGuide();
          if (imported.length > 0) {
            buildRefsSidebar(container, deps);
            deps.setStatus(`가이드 불러옴 (세션): ${imported.join(', ')}`);
          }
        },
      },
    ]);
  });

  // Helper: create guide item with click + context menu
  function addGuideItem(fileName: string, isSession: boolean) {
    const prefix = isSession ? '⏳ ' : '';
    const el = createTreeItem(prefix + fileName, '·', 1);
    el.addEventListener('click', async () => {
      const tabId = `guide_${fileName}`;
      const existing = deps.findOpenTab(tabId);
      if (existing) {
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
        (val: string) => deps.writeGuide(fileName, val),
      );
    });
    el.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const items: unknown[] = [
        {
          label: '이름 복사',
          action: () => {
            navigator.clipboard.writeText(fileName);
            deps.setStatus(`복사됨: ${fileName}`);
          },
        },
      ];
      if (!isSession) {
        items.push({
          label: '경로 복사',
          action: async () => {
            const guidesDir = await deps.getGuidesPath();
            const fullPath = guidesDir
              ? `${guidesDir.replace(/\\/g, '/')}/${fileName}`
              : `guides/${fileName}`;
            navigator.clipboard.writeText(fullPath);
            deps.setStatus(`복사됨: ${fullPath}`);
          },
        });
      }
      items.push('---');
      items.push({
        label: isSession ? '제거' : '삭제',
        action: async () => {
          const msg = isSession
            ? `"${fileName}" 세션 가이드를 제거하시겠습니까?`
            : `"${fileName}" 가이드를 삭제하시겠습니까?`;
          if (!(await deps.showConfirm(msg))) return;
          deps.closeTab(`guide_${fileName}`);
          await deps.deleteGuide(fileName);
          buildRefsSidebar(container, deps);
          deps.setStatus(
            isSession
              ? `가이드 제거됨: ${fileName}`
              : `가이드 삭제됨: ${fileName}`,
          );
        },
      });
      deps.showContextMenu(e.clientX, e.clientY, items);
    });
    guideFolder.children.appendChild(el);
  }

  for (const fileName of builtInFiles) addGuideItem(fileName, false);
  if (sessionFiles.length > 0) {
    const sep = document.createElement('div');
    sep.style.cssText =
      'height:1px;background:var(--border-color);margin:4px 8px;';
    guideFolder.children.appendChild(sep);
    for (const fileName of sessionFiles) addGuideItem(fileName, true);
  }

  // ---- Reference files section ----
  const refHeader = document.createElement('div');
  refHeader.className = 'tree-item indent-0 ref-section-header';
  refHeader.style.cssText =
    'color:var(--accent);font-weight:700;font-size:11px;letter-spacing:0.5px;padding:10px 8px 4px;cursor:pointer;text-transform:uppercase;border-top:1px solid var(--border-color);margin-top:8px;';
  refHeader.textContent = '── 참고 파일 ──';
  refHeader.title = '클릭하여 참고 파일 추가';
  refHeader.addEventListener('click', () =>
    addReferenceFile(container, deps),
  );
  refHeader.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    deps.showContextMenu(e.clientX, e.clientY, [
      {
        label: '참고 파일 추가',
        action: () => addReferenceFile(container, deps),
      },
      ...(referenceFiles.length > 0
        ? [
            '---',
            {
              label: '모두 제거',
              action: async () => {
                await deps.removeAllReferences();
                await buildRefsSidebar(container, deps);
              },
            },
          ]
        : []),
    ]);
  });
  container.appendChild(refHeader);

  // Render each reference file
  for (let ri = 0; ri < referenceFiles.length; ri++) {
    renderReferenceFile(container, deps, referenceFiles, ri);
  }
}

// ---- Per-reference-file rendering (private helper) ----

function renderReferenceFile(
  container: HTMLElement,
  deps: RefsSidebarDeps,
  referenceFiles: ReferenceFile[],
  ri: number,
): void {
  const ref = referenceFiles[ri];
  const refFolder = createFolderItem(ref.fileName, '📎', 0);
  container.appendChild(refFolder.header);
  container.appendChild(refFolder.children);

  const refIdx = ri;
  refFolder.header.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const items: unknown[] = [
      {
        label: '이름 복사',
        action: () => {
          navigator.clipboard.writeText(ref.fileName);
          deps.setStatus(`복사됨: ${ref.fileName}`);
        },
      },
    ];
    if (ref.filePath) {
      items.push({
        label: '경로 복사',
        action: () => {
          navigator.clipboard.writeText(ref.filePath!);
          deps.setStatus(`복사됨: ${ref.filePath}`);
        },
      });
    }
    items.push('---');
    items.push({
      label: '참고 파일 제거',
      action: async () => {
        await deps.removeReference(
          referenceFiles[refIdx].filePath || referenceFiles[refIdx].fileName,
        );
        await buildRefsSidebar(container, deps);
      },
    });
    deps.showContextMenu(e.clientX, e.clientY, items);
  });

  // Lua — split into sections like main sidebar
  if (ref.data.lua) {
    renderRefLua(refFolder.children, deps, ref, refIdx);
  }

  // Standard fields
  const refFields = [
    { id: 'globalNote', label: '글로벌노트', lang: 'plaintext' },
    { id: 'firstMessage', label: '첫 메시지', lang: 'html' },
    { id: 'triggerScripts', label: '트리거 스크립트', lang: 'json' },
    {
      id: 'alternateGreetings',
      label: '추가 첫 메시지',
      lang: 'json',
      get: () => stringifyStringArray(ref.data.alternateGreetings),
    },
    {
      id: 'groupOnlyGreetings',
      label: '그룹 첫 메시지',
      lang: 'json',
      get: () => stringifyStringArray(ref.data.groupOnlyGreetings),
    },
    { id: 'description', label: '설명', lang: 'plaintext' },
  ];

  for (const f of refFields) {
    const val = ref.data[f.id];
    if (Array.isArray(val)) {
      if (val.length === 0) continue;
    } else if (f.id === 'triggerScripts') {
      if (!ref.data.triggerScripts || ref.data.triggerScripts === '[]')
        continue;
    } else if (!val) {
      continue;
    }
    const el = createTreeItem(f.label, '·', 1);
    const tabId = `ref_${refIdx}_${f.id}`;
    el.addEventListener('click', () => {
      deps.openTab(
        tabId,
        `[참고] ${ref.fileName} - ${f.label}`,
        f.lang,
        f.get || (() => ref.data[f.id]),
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
            navigator.clipboard.writeText(
              `read_reference_field(${refIdx}, "${f.id}")`,
            );
            deps.setStatus(
              `복사됨: read_reference_field(${refIdx}, "${f.id}")`,
            );
          },
        },
      ]);
    });
    refFolder.children.appendChild(el);
  }

  // CSS — split into sections
  if (ref.data.css) {
    renderRefCss(refFolder.children, deps, ref, refIdx);
  }

  // Lorebook
  if (ref.data.lorebook && ref.data.lorebook.length > 0) {
    renderRefLorebook(refFolder.children, deps, ref, refIdx);
  }

  // Regex
  if (ref.data.regex && ref.data.regex.length > 0) {
    renderRefRegex(refFolder.children, deps, ref, refIdx);
  }
}

// ---- Lua sub-tree ----

function renderRefLua(
  parent: HTMLElement,
  deps: RefsSidebarDeps,
  ref: ReferenceFile,
  refIdx: number,
): void {
  const refLuaSections = parseLuaSections(ref.data.lua!);
  if (refLuaSections.length <= 1) {
    const el = createTreeItem('Lua', '·', 1);
    el.addEventListener('click', () => {
      deps.openTab(
        `ref_${refIdx}_lua`,
        `[참고] ${ref.fileName} - Lua`,
        'lua',
        () => ref.data.lua,
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
            navigator.clipboard.writeText(
              `read_reference_field(${refIdx}, "lua")`,
            );
            deps.setStatus(`복사됨: read_reference_field(${refIdx}, "lua")`);
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
      deps.openTab(
        `ref_${refIdx}_lua`,
        `[참고] ${ref.fileName} - Lua (통합)`,
        'lua',
        () => ref.data.lua,
        null,
      );
    });
    combinedEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: 'MCP 경로 복사',
          action: () => {
            navigator.clipboard.writeText(
              `read_reference_field(${refIdx}, "lua")`,
            );
            deps.setStatus(`복사됨: read_reference_field(${refIdx}, "lua")`);
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
              navigator.clipboard.writeText(
                `read_reference_field(${refIdx}, "lua") → 섹션 "${sec.name}" (index ${secIdx})`,
              );
              deps.setStatus(
                `복사됨: 참고자료[${refIdx}] Lua 섹션[${secIdx}]`,
              );
            },
          },
        ]);
      });
      luaFolder.children.appendChild(secEl);
    }
  }
}

// ---- CSS sub-tree ----

function renderRefCss(
  parent: HTMLElement,
  deps: RefsSidebarDeps,
  ref: ReferenceFile,
  refIdx: number,
): void {
  const refCssSections = parseCssSections(ref.data.css!).sections;
  if (refCssSections.length <= 1) {
    const el = createTreeItem('CSS', '·', 1);
    el.addEventListener('click', () => {
      deps.openTab(
        `ref_${refIdx}_css`,
        `[참고] ${ref.fileName} - CSS`,
        'css',
        () => ref.data.css,
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
            navigator.clipboard.writeText(
              `read_reference_field(${refIdx}, "css")`,
            );
            deps.setStatus(`복사됨: read_reference_field(${refIdx}, "css")`);
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
      deps.openTab(
        `ref_${refIdx}_css`,
        `[참고] ${ref.fileName} - CSS (통합)`,
        'css',
        () => ref.data.css,
        null,
      );
    });
    combinedEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: 'MCP 경로 복사',
          action: () => {
            navigator.clipboard.writeText(
              `read_reference_field(${refIdx}, "css")`,
            );
            deps.setStatus(`복사됨: read_reference_field(${refIdx}, "css")`);
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
              navigator.clipboard.writeText(
                `read_reference_field(${refIdx}, "css") → 섹션 "${sec.name}" (index ${secIdx})`,
              );
              deps.setStatus(
                `복사됨: 참고자료[${refIdx}] CSS 섹션[${secIdx}]`,
              );
            },
          },
        ]);
      });
      cssFolderRef.children.appendChild(secEl);
    }
  }
}

// ---- Lorebook sub-tree ----

function renderRefLorebook(
  parent: HTMLElement,
  deps: RefsSidebarDeps,
  ref: ReferenceFile,
  refIdx: number,
): void {
  const lorebook = ref.data.lorebook!;
  const lbFolder = createFolderItem(`로어북 (${lorebook.length})`, '📚', 1);
  parent.appendChild(lbFolder.header);
  parent.appendChild(lbFolder.children);

  // Group by folder
  const folderDataList: {
    entry: Record<string, unknown>;
    index: number;
    children: { entry: Record<string, unknown>; index: number }[];
  }[] = [];
  const folderLookup: Record<
    string,
    (typeof folderDataList)[number]
  > = {};
  const rootEntries: { entry: Record<string, unknown>; index: number }[] = [];

  for (let li = 0; li < lorebook.length; li++) {
    const entry = lorebook[li];
    if (entry.mode === 'folder') {
      const fd = { entry, index: li, children: [] as typeof rootEntries };
      folderDataList.push(fd);
      const k = (entry.key as string) || '';
      const c = (entry.comment as string) || '';
      if (k) {
        folderLookup[`folder:${k}`] = fd;
        folderLookup[k] = fd;
      }
      if (c) {
        folderLookup[`folder:${c}`] = fd;
        folderLookup[c] = fd;
      }
      folderLookup[`folder:${li}`] = fd;
      folderLookup[String(li)] = fd;
    }
  }
  for (let li = 0; li < lorebook.length; li++) {
    const entry = lorebook[li];
    if (entry.mode === 'folder') continue;
    const folderId = entry.folder as string | undefined;
    const matched = folderId
      ? folderLookup[folderId] || folderLookup[String(folderId)]
      : null;
    if (matched) {
      matched.children.push({ entry, index: li });
    } else {
      rootEntries.push({ entry, index: li });
    }
  }

  function makeRefLoreItem(
    child: { entry: Record<string, unknown>; index: number },
    indent: number,
  ): HTMLDivElement {
    const lbLabel =
      (child.entry.comment as string) ||
      (child.entry.key as string) ||
      `#${child.index}`;
    const lbEl = createTreeItem(lbLabel, '·', indent);
    const li = child.index;
    const lbTabId = `ref_${refIdx}_lb_${li}`;
    lbEl.addEventListener('click', () => {
      const tab = deps.openTab(
        lbTabId,
        `[참고] ${ref.fileName} - ${lbLabel}`,
        '_loreform',
        () => lorebook[li],
        null,
      );
      if (tab) tab._refLorebook = lorebook;
    });
    lbEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: '키 복사',
          action: () => {
            navigator.clipboard.writeText(
              (child.entry.key as string) || '',
            );
            deps.setStatus(`복사됨: ${child.entry.key}`);
          },
        },
        {
          label: '내용 복사',
          action: () => {
            navigator.clipboard.writeText(
              (child.entry.content as string) || '',
            );
            deps.setStatus('내용 복사됨');
          },
        },
        {
          label: 'MCP 경로 복사',
          action: () => {
            navigator.clipboard.writeText(
              `read_reference_field(${refIdx}, "lorebook") → index ${li}`,
            );
            deps.setStatus(`복사됨: 참고자료[${refIdx}] 로어북[${li}]`);
          },
        },
      ]);
    });
    return lbEl;
  }

  for (const folder of folderDataList) {
    const subFolder = createFolderItem(
      (folder.entry.comment as string) || `folder_${folder.index}`,
      '📁',
      2,
    );
    lbFolder.children.appendChild(subFolder.header);
    lbFolder.children.appendChild(subFolder.children);
    for (const child of folder.children) {
      subFolder.children.appendChild(makeRefLoreItem(child, 3));
    }
  }
  for (const child of rootEntries) {
    lbFolder.children.appendChild(makeRefLoreItem(child, 2));
  }
}

// ---- Regex sub-tree ----

function renderRefRegex(
  parent: HTMLElement,
  deps: RefsSidebarDeps,
  ref: ReferenceFile,
  refIdx: number,
): void {
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
      deps.openTab(
        rxTabId,
        `[참고] ${ref.fileName} - ${rxLabel}`,
        '_regexform',
        () => ref.data.regex![rxIdx],
        null,
      );
    });
    rxEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: '패턴 복사',
          action: () => {
            navigator.clipboard.writeText(
              (rx.in as string) || (rx.findRegex as string) || '',
            );
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
            navigator.clipboard.writeText(
              `read_reference_field(${refIdx}, "regex") → index ${rxIdx}`,
            );
            deps.setStatus(`복사됨: 참고자료[${refIdx}] 정규식[${rxIdx}]`);
          },
        },
      ]);
    });
    rxFolder.children.appendChild(rxEl);
  }
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
  const fieldPart = parts[2];

  if (fieldPart === 'lua') {
    deps.openTab(
      tabId,
      `[참고] ${ref.fileName} - Lua`,
      'lua',
      () => ref.data.lua,
      null,
    );
  } else if (fieldPart === 'css') {
    deps.openTab(
      tabId,
      `[참고] ${ref.fileName} - CSS`,
      'css',
      () => ref.data.css,
      null,
    );
  } else if (fieldPart === 'globalNote') {
    deps.openTab(
      tabId,
      `[참고] ${ref.fileName} - 글로벌노트`,
      'plaintext',
      () => ref.data.globalNote,
      null,
    );
  } else if (fieldPart === 'firstMessage') {
    deps.openTab(
      tabId,
      `[참고] ${ref.fileName} - 첫 메시지`,
      'html',
      () => ref.data.firstMessage,
      null,
    );
  } else if (fieldPart === 'triggerScripts') {
    deps.openTab(
      tabId,
      `[참고] ${ref.fileName} - 트리거 스크립트`,
      'json',
      () => ref.data.triggerScripts || '[]',
      null,
    );
  } else if (fieldPart === 'alternateGreetings') {
    deps.openTab(
      tabId,
      `[참고] ${ref.fileName} - 추가 첫 메시지`,
      'json',
      () => stringifyStringArray(ref.data.alternateGreetings),
      null,
    );
  } else if (fieldPart === 'groupOnlyGreetings') {
    deps.openTab(
      tabId,
      `[참고] ${ref.fileName} - 그룹 첫 메시지`,
      'json',
      () => stringifyStringArray(ref.data.groupOnlyGreetings),
      null,
    );
  } else if (fieldPart === 'description') {
    deps.openTab(
      tabId,
      `[참고] ${ref.fileName} - 설명`,
      'plaintext',
      () => ref.data.description,
      null,
    );
  } else if (fieldPart === 'lb' && parts.length >= 4) {
    const li = parseInt(parts[3], 10);
    if (ref.data.lorebook && ref.data.lorebook[li]) {
      const lbLabel =
        (ref.data.lorebook[li].comment as string) ||
        (ref.data.lorebook[li].key as string) ||
        `#${li}`;
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
      deps.openTab(
        tabId,
        `[참고] ${ref.fileName} - ${rxLabel}`,
        '_regexform',
        () => ref.data.regex![xi],
        null,
      );
    }
  }
}
