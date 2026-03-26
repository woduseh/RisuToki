import type { Section } from './section-parser';
import type { Tab } from './tab-manager';
import type { ContextMenuItem } from './context-menu';
import { getFolderRef, normalizeFolderRef } from './lorebook-folders';

type TabStateFn = (index: number, tab: Tab) => Partial<Tab> | null;

export interface SidebarActionDeps {
  getFileData: () => Record<string, unknown> | null;
  getLuaSections: () => Section[];
  getCssSections: () => Section[];
  getCssStylePrefix: () => string;
  getCssStyleSuffix: () => string;

  showConfirm: (msg: string) => Promise<boolean>;
  showPrompt: (msg: string, defaultValue?: string) => Promise<string | null>;
  showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  setStatus: (msg: string) => void;
  buildSidebar: () => void;

  combineLuaSections: (sections: Section[]) => string;
  combineCssSections: (sections: Section[], prefix: string, suffix: string) => string;

  openTab: (
    id: string,
    label: string,
    language: string,
    getValue: () => unknown,
    setValue: ((v: unknown) => void) | null,
  ) => void;
  closeTab: (id: string) => void;
  markFieldDirty: (field: string) => void;
  shiftIndexedTabsAfterRemoval: (prefix: string, removedIndices: number[], buildTabState: TabStateFn) => void;
  refreshIndexedTabs: (prefix: string, buildTabState: TabStateFn) => void;

  buildLorebookTabState: TabStateFn;
  buildRegexTabState: TabStateFn;
  buildLuaSectionTabState: TabStateFn;
  buildCssSectionTabState: TabStateFn;
  buildAltGreetTabState: TabStateFn;
}

export function createSidebarActions(deps: SidebarActionDeps) {
  // ----- helpers -----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fd(): any {
    return deps.getFileData();
  }

  function createFolderUuid(): string {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // ==================== Lorebook ====================

  function addNewLorebook(): void {
    const fileData = fd();
    if (!fileData) return;
    const newEntry = {
      key: '',
      content: '',
      comment: `new_entry_${fileData.lorebook.length}`,
      mode: 'normal',
      insertorder: 100,
      alwaysActive: false,
      forceActivation: false,
      selective: false,
      secondkey: '',
      constant: false,
      order: fileData.lorebook.length,
      folder: '',
    };
    fileData.lorebook.push(newEntry);
    deps.markFieldDirty('lorebook');
    deps.buildSidebar();
    const idx = fileData.lorebook.length - 1;
    deps.openTab(
      `lore_${idx}`,
      newEntry.comment,
      '_loreform',
      () => fd().lorebook[idx],
      (v: unknown) => {
        Object.assign(fd().lorebook[idx], v as object);
      },
    );
    deps.setStatus('새 로어북 항목 추가됨');
  }

  async function addNewLorebookFolder(): Promise<void> {
    const fileData = fd();
    if (!fileData) return;
    const name = await deps.showPrompt('폴더 이름을 입력하세요', '새 폴더');
    if (!name) return;
    const folderId = createFolderUuid();
    const newFolder = {
      key: folderId,
      content: '',
      comment: name,
      mode: 'folder',
      insertorder: 100,
      alwaysActive: false,
      forceActivation: false,
      selective: false,
      secondkey: '',
      constant: false,
      order: fileData.lorebook.length,
      folder: '',
    };
    fileData.lorebook.push(newFolder);
    deps.buildSidebar();
    deps.markFieldDirty('lorebook');
    deps.setStatus(`로어북 폴더 추가: ${name}`);
  }

  async function importLorebook(): Promise<void> {
    const fileData = fd();
    if (!fileData) return;
    const imported = await window.tokiAPI.importJson();
    if (!imported || imported.length === 0) return;

    let addedCount = 0;
    for (const raw of imported) {
      const item = raw as { fileName: string; data: Record<string, unknown> };
      const entries = Array.isArray(item.data) ? item.data : (item.data.entries as unknown[]) || [item.data];
      for (const entry of entries) {
        const sourceEntry = entry as Record<string, unknown>;
        const mode = String(sourceEntry.mode || 'normal');
        const isFolder = mode === 'folder';
        const canonicalFolderUuid = isFolder
          ? (typeof sourceEntry.key === 'string' && sourceEntry.key) ||
            (typeof sourceEntry.id === 'string' && sourceEntry.id) ||
            createFolderUuid()
          : '';

        fileData.lorebook.push({
          key: canonicalFolderUuid || (typeof sourceEntry.key === 'string' ? sourceEntry.key : ''),
          content: (sourceEntry.content as string) || '',
          comment:
            (sourceEntry.comment as string) || (sourceEntry.name as string) || item.fileName.replace('.json', ''),
          mode,
          insertorder: (sourceEntry.insertorder as number) || (sourceEntry.insertion_order as number) || 100,
          alwaysActive: Boolean(sourceEntry.alwaysActive || sourceEntry.constant),
          forceActivation: Boolean(sourceEntry.forceActivation),
          selective: Boolean(sourceEntry.selective),
          secondkey:
            (typeof sourceEntry.secondkey === 'string' ? sourceEntry.secondkey : '') ||
            (Array.isArray(sourceEntry.secondary_keys) ? sourceEntry.secondary_keys.join(', ') : ''),
          constant: Boolean(sourceEntry.constant),
          order: fileData.lorebook.length,
          folder: isFolder ? '' : normalizeFolderRef(sourceEntry.folder),
        });
        addedCount++;
      }
    }

    deps.markFieldDirty('lorebook');
    deps.buildSidebar();
    deps.setStatus(`로어북 ${addedCount}개 항목 가져옴`);
  }

  async function deleteLorebook(idx: number): Promise<void> {
    const fileData = fd();
    if (!fileData || idx < 0 || idx >= fileData.lorebook.length) return;
    const name = fileData.lorebook[idx].comment || `entry_${idx}`;
    if (!(await deps.showConfirm(`"${name}" 로어북 항목을 삭제하시겠습니까?`))) return;

    deps.closeTab(`lore_${idx}`);
    fileData.lorebook.splice(idx, 1);
    deps.markFieldDirty('lorebook');
    deps.buildSidebar();
    deps.shiftIndexedTabsAfterRemoval('lore_', [idx], deps.buildLorebookTabState);
    deps.setStatus(`로어북 항목 삭제됨: ${name}`);
  }

  async function renameLorebook(idx: number): Promise<void> {
    const fileData = fd();
    if (!fileData || idx < 0 || idx >= fileData.lorebook.length) return;
    const oldName = fileData.lorebook[idx].comment || `entry_${idx}`;
    const newName = await deps.showPrompt('새 이름:', oldName);
    if (!newName || newName === oldName) return;
    fileData.lorebook[idx].comment = newName;
    deps.markFieldDirty('lorebook');
    deps.buildSidebar();
    deps.refreshIndexedTabs('lore_', deps.buildLorebookTabState);
    deps.setStatus(`로어북 항목 이름 변경: ${newName}`);
  }

  // ==================== Regex ====================

  function addNewRegex(): void {
    const fileData = fd();
    if (!fileData) return;
    const newRegex = {
      comment: `new_regex_${fileData.regex.length}`,
      in: '',
      out: '',
      type: 'editinput',
      ableFlag: true,
      flag: '',
      replaceOrder: 0,
    };
    fileData.regex.push(newRegex);
    deps.markFieldDirty('regex');
    deps.buildSidebar();
    const idx = fileData.regex.length - 1;
    deps.openTab(
      `regex_${idx}`,
      newRegex.comment,
      '_regexform',
      () => fd().regex[idx],
      (v: unknown) => {
        Object.assign(fd().regex[idx], v as object);
      },
    );
    deps.setStatus('새 정규식 항목 추가됨');
  }

  async function importRegex(): Promise<void> {
    const fileData = fd();
    if (!fileData) return;
    const imported = await window.tokiAPI.importJson();
    if (!imported || imported.length === 0) return;

    let addedCount = 0;
    for (const raw of imported) {
      const item = raw as { fileName: string; data: Record<string, unknown> };
      const entries = Array.isArray(item.data) ? item.data : ([item.data] as Record<string, unknown>[]);
      for (const entry of entries) {
        fileData.regex.push({
          comment: entry.comment || entry.name || item.fileName.replace('.json', ''),
          in: entry.in || entry.findRegex || '',
          out: entry.out || entry.replaceString || '',
          type: (entry.type || 'editdisplay').toString().toLowerCase(),
          ableFlag: entry.ableFlag !== undefined ? entry.ableFlag : true,
        });
        addedCount++;
      }
    }

    deps.markFieldDirty('regex');
    deps.buildSidebar();
    deps.setStatus(`정규식 ${addedCount}개 항목 가져옴`);
  }

  async function deleteRegex(idx: number): Promise<void> {
    const fileData = fd();
    if (!fileData || idx < 0 || idx >= fileData.regex.length) return;
    const name = fileData.regex[idx].comment || `regex_${idx}`;
    if (!(await deps.showConfirm(`"${name}" 정규식을 삭제하시겠습니까?`))) return;

    deps.closeTab(`regex_${idx}`);
    fileData.regex.splice(idx, 1);
    deps.markFieldDirty('regex');
    deps.buildSidebar();
    deps.shiftIndexedTabsAfterRemoval('regex_', [idx], deps.buildRegexTabState);
    deps.setStatus(`정규식 삭제됨: ${name}`);
  }

  async function renameRegex(idx: number): Promise<void> {
    const fileData = fd();
    if (!fileData || idx < 0 || idx >= fileData.regex.length) return;
    const oldName = fileData.regex[idx].comment || `regex_${idx}`;
    const newName = await deps.showPrompt('새 이름:', oldName);
    if (!newName || newName === oldName) return;
    fileData.regex[idx].comment = newName;
    deps.markFieldDirty('regex');
    deps.buildSidebar();
    deps.refreshIndexedTabs('regex_', deps.buildRegexTabState);
    deps.setStatus(`정규식 이름 변경: ${newName}`);
  }

  // ==================== Assets ====================

  async function addAssetFromDialog(targetFolder?: string): Promise<void> {
    const added = await window.tokiAPI.addAsset(targetFolder || 'other');
    if (!added || (Array.isArray(added) && added.length === 0)) return;
    deps.buildSidebar();
    const count = Array.isArray(added) ? added.length : 1;
    deps.setStatus(`에셋 ${count}개 추가됨`);
  }

  function attachAssetContextMenu(el: HTMLElement, assetPath: string, fileName: string): void {
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deps.showContextMenu(e.clientX, e.clientY, [
        {
          label: '이름 변경',
          action: async () => {
            const newName = await deps.showPrompt('새 파일명:', fileName);
            if (!newName || newName === fileName) return;
            const newPath = await window.tokiAPI.renameAsset(assetPath, newName);
            if (newPath) {
              deps.buildSidebar();
              deps.setStatus(`에셋 이름 변경: ${newName}`);
            }
          },
        },
        '---',
        {
          label: '삭제',
          action: async () => {
            if (!(await deps.showConfirm(`"${fileName}" 에셋을 삭제하시겠습니까?`))) return;
            const ok = await window.tokiAPI.deleteAsset(assetPath);
            if (ok) {
              deps.closeTab(`img_${assetPath}`);
              deps.buildSidebar();
              deps.setStatus(`에셋 삭제됨: ${fileName}`);
            }
          },
        },
      ]);
    });
  }

  // ==================== Lua Sections ====================

  async function addLuaSection(): Promise<void> {
    const fileData = fd();
    if (!fileData) return;
    const luaSections = deps.getLuaSections();
    const name = await deps.showPrompt('새 Lua 섹션 이름:', `section_${luaSections.length}`);
    if (!name) return;

    luaSections.push({ name, content: '' });
    fileData.lua = deps.combineLuaSections(luaSections);
    deps.markFieldDirty('lua');
    deps.buildSidebar();

    const idx = luaSections.length - 1;
    deps.openTab(
      `lua_s${idx}`,
      name,
      'lua',
      () => deps.getLuaSections()[idx].content,
      (v: unknown) => {
        deps.getLuaSections()[idx].content = v as string;
        fd().lua = deps.combineLuaSections(deps.getLuaSections());
      },
    );
    deps.setStatus(`Lua 섹션 추가됨: ${name}`);
  }

  async function renameLuaSection(idx: number): Promise<void> {
    const luaSections = deps.getLuaSections();
    if (idx < 0 || idx >= luaSections.length) return;
    const oldName = luaSections[idx].name;
    const newName = await deps.showPrompt('새 이름:', oldName);
    if (!newName || newName === oldName) return;

    luaSections[idx].name = newName;
    fd().lua = deps.combineLuaSections(luaSections);
    deps.markFieldDirty('lua');
    deps.buildSidebar();
    deps.refreshIndexedTabs('lua_s', deps.buildLuaSectionTabState);
    deps.setStatus(`Lua 섹션 이름 변경: ${newName}`);
  }

  async function deleteLuaSection(idx: number): Promise<void> {
    const luaSections = deps.getLuaSections();
    if (idx < 0 || idx >= luaSections.length) return;
    const name = luaSections[idx].name;
    if (!(await deps.showConfirm(`"${name}" Lua 섹션을 삭제하시겠습니까?`))) return;

    deps.closeTab(`lua_s${idx}`);
    luaSections.splice(idx, 1);
    fd().lua = deps.combineLuaSections(luaSections);
    deps.markFieldDirty('lua');
    deps.buildSidebar();
    deps.shiftIndexedTabsAfterRemoval('lua_s', [idx], deps.buildLuaSectionTabState);
    deps.setStatus(`Lua 섹션 삭제됨: ${name}`);
  }

  // ==================== CSS Sections ====================

  async function addCssSection(): Promise<void> {
    const fileData = fd();
    if (!fileData) return;
    const cssSections = deps.getCssSections();
    const name = await deps.showPrompt('새 CSS 섹션 이름:', `section_${cssSections.length}`);
    if (!name) return;

    cssSections.push({ name, content: '' });
    fileData.css = deps.combineCssSections(cssSections, deps.getCssStylePrefix(), deps.getCssStyleSuffix());
    deps.markFieldDirty('css');
    deps.buildSidebar();

    const idx = cssSections.length - 1;
    deps.openTab(
      `css_s${idx}`,
      name,
      'css',
      () => deps.getCssSections()[idx].content,
      (v: unknown) => {
        deps.getCssSections()[idx].content = v as string;
        fd().css = deps.combineCssSections(deps.getCssSections(), deps.getCssStylePrefix(), deps.getCssStyleSuffix());
      },
    );
    deps.setStatus(`CSS 섹션 추가됨: ${name}`);
  }

  async function renameCssSection(idx: number): Promise<void> {
    const cssSections = deps.getCssSections();
    if (idx < 0 || idx >= cssSections.length) return;
    const oldName = cssSections[idx].name;
    const newName = await deps.showPrompt('새 이름:', oldName);
    if (!newName || newName === oldName) return;

    cssSections[idx].name = newName;
    fd().css = deps.combineCssSections(cssSections, deps.getCssStylePrefix(), deps.getCssStyleSuffix());
    deps.markFieldDirty('css');
    deps.buildSidebar();
    deps.refreshIndexedTabs('css_s', deps.buildCssSectionTabState);
    deps.setStatus(`CSS 섹션 이름 변경: ${newName}`);
  }

  async function deleteCssSection(idx: number): Promise<void> {
    const cssSections = deps.getCssSections();
    if (idx < 0 || idx >= cssSections.length) return;
    const name = cssSections[idx].name;
    if (!(await deps.showConfirm(`"${name}" CSS 섹션을 삭제하시겠습니까?`))) return;

    deps.closeTab(`css_s${idx}`);
    cssSections.splice(idx, 1);
    fd().css = deps.combineCssSections(cssSections, deps.getCssStylePrefix(), deps.getCssStyleSuffix());
    deps.markFieldDirty('css');
    deps.buildSidebar();
    deps.shiftIndexedTabsAfterRemoval('css_s', [idx], deps.buildCssSectionTabState);
    deps.setStatus(`CSS 섹션 삭제됨: ${name}`);
  }

  // ==================== Reorder ====================

  function reorderLorebook(fromIdx: number, toPositionInFolder: number, targetFolder: string): void {
    const fileData = fd();
    if (!fileData) return;
    const lb: unknown[] = fileData.lorebook;
    if (fromIdx < 0 || fromIdx >= lb.length) return;

    const item = lb[fromIdx] as Record<string, unknown>;
    const normalizedTargetFolder = targetFolder ? normalizeFolderRef(targetFolder) : '';

    // Update folder assignment
    item.folder = normalizedTargetFolder;

    // Remove from old position
    lb.splice(fromIdx, 1);

    if (normalizedTargetFolder === '') {
      // Moving to root — find insertion point among root entries
      const rootIndices: number[] = [];
      for (let i = 0; i < lb.length; i++) {
        const e = lb[i] as Record<string, unknown>;
        if (e.mode !== 'folder' && !e.folder) rootIndices.push(i);
      }
      const insertAt = toPositionInFolder < rootIndices.length ? rootIndices[toPositionInFolder] : lb.length;
      lb.splice(insertAt, 0, item);
    } else {
      // Moving to a folder — find the folder, then insert after folder + existing children
      let folderIdx = -1;
      for (let i = 0; i < lb.length; i++) {
        const e = lb[i] as Record<string, unknown>;
        if (getFolderRef(e) === normalizedTargetFolder) {
          folderIdx = i;
          break;
        }
      }
      if (folderIdx === -1) {
        // Folder not found, append to end
        lb.push(item);
      } else {
        // Count children already in this folder
        const childrenInFolder: number[] = [];
        for (let i = 0; i < lb.length; i++) {
          const e = lb[i] as Record<string, unknown>;
          if (normalizeFolderRef(e.folder) === normalizedTargetFolder) childrenInFolder.push(i);
        }
        const insertAt =
          toPositionInFolder < childrenInFolder.length
            ? childrenInFolder[toPositionInFolder]
            : childrenInFolder.length > 0
              ? childrenInFolder[childrenInFolder.length - 1] + 1
              : folderIdx + 1;
        lb.splice(insertAt, 0, item);
      }
    }

    deps.markFieldDirty('lorebook');
    deps.refreshIndexedTabs('lore_', deps.buildLorebookTabState);
    deps.buildSidebar();
    deps.setStatus('로어북 항목 이동됨');
  }

  function reorderRegex(fromIdx: number, toIdx: number): void {
    const fileData = fd();
    if (!fileData) return;
    const arr: unknown[] = fileData.regex;
    if (fromIdx < 0 || fromIdx >= arr.length) return;
    const item = arr.splice(fromIdx, 1)[0];
    const adjustedTo = toIdx > fromIdx ? toIdx : toIdx;
    arr.splice(Math.min(adjustedTo, arr.length), 0, item);
    deps.markFieldDirty('regex');
    deps.refreshIndexedTabs('regex_', deps.buildRegexTabState);
    deps.buildSidebar();
    deps.setStatus('정규식 항목 이동됨');
  }

  function reorderLuaSections(fromIdx: number, toIdx: number): void {
    const fileData = fd();
    if (!fileData) return;
    const sections = deps.getLuaSections();
    if (fromIdx < 0 || fromIdx >= sections.length) return;
    const item = sections.splice(fromIdx, 1)[0];
    const adjustedTo = toIdx > fromIdx ? toIdx : toIdx;
    sections.splice(Math.min(adjustedTo, sections.length), 0, item);
    fileData.lua = deps.combineLuaSections(sections);
    deps.markFieldDirty('lua');
    deps.refreshIndexedTabs('lua_s', deps.buildLuaSectionTabState);
    deps.buildSidebar();
    deps.setStatus('Lua 섹션 이동됨');
  }

  function reorderCssSections(fromIdx: number, toIdx: number): void {
    const fileData = fd();
    if (!fileData) return;
    const sections = deps.getCssSections();
    if (fromIdx < 0 || fromIdx >= sections.length) return;
    const item = sections.splice(fromIdx, 1)[0];
    const adjustedTo = toIdx > fromIdx ? toIdx : toIdx;
    sections.splice(Math.min(adjustedTo, sections.length), 0, item);
    fileData.css = deps.combineCssSections(sections, deps.getCssStylePrefix(), deps.getCssStyleSuffix());
    deps.markFieldDirty('css');
    deps.refreshIndexedTabs('css_s', deps.buildCssSectionTabState);
    deps.buildSidebar();
    deps.setStatus('CSS 섹션 이동됨');
  }

  async function reorderAsset(fromPath: string, toIdx: number): Promise<void> {
    const ok = await window.tokiAPI.reorderAsset(fromPath, toIdx);
    if (ok) {
      deps.buildSidebar();
      deps.setStatus('에셋 위치 변경됨');
    }
  }

  // ==================== Alternate Greetings ====================

  function addAlternateGreeting(): void {
    const fileData = fd();
    if (!fileData) return;
    const arr: string[] = fileData.alternateGreetings;
    arr.push('');
    const idx = arr.length - 1;
    deps.markFieldDirty('alternateGreetings');
    deps.buildSidebar();
    deps.openTab(
      `altGreet_${idx}`,
      `인사말 ${idx + 1}`,
      'html',
      () => fd().alternateGreetings[idx] ?? '',
      (v: unknown) => {
        fd().alternateGreetings[idx] = v as string;
      },
    );
    deps.setStatus(`추가 첫 메시지 ${idx + 1} 추가됨`);
  }

  async function deleteAlternateGreeting(idx: number): Promise<void> {
    const fileData = fd();
    if (!fileData) return;
    const arr: string[] = fileData.alternateGreetings;
    if (idx < 0 || idx >= arr.length) return;
    if (!(await deps.showConfirm(`인사말 ${idx + 1}을(를) 삭제하시겠습니까?`))) return;
    deps.closeTab(`altGreet_${idx}`);
    arr.splice(idx, 1);
    deps.markFieldDirty('alternateGreetings');
    deps.buildSidebar();
    deps.shiftIndexedTabsAfterRemoval('altGreet_', [idx], deps.buildAltGreetTabState);
    deps.setStatus(`추가 첫 메시지 ${idx + 1} 삭제됨`);
  }

  function reorderAlternateGreetings(fromIdx: number, toIdx: number): void {
    const fileData = fd();
    if (!fileData) return;
    const arr: string[] = fileData.alternateGreetings;
    if (fromIdx < 0 || fromIdx >= arr.length) return;
    const item = arr.splice(fromIdx, 1)[0];
    arr.splice(Math.min(toIdx, arr.length), 0, item);
    deps.markFieldDirty('alternateGreetings');
    deps.refreshIndexedTabs('altGreet_', deps.buildAltGreetTabState);
    deps.buildSidebar();
    deps.setStatus('추가 첫 메시지 이동됨');
  }

  return {
    addNewLorebook,
    addNewLorebookFolder,
    importLorebook,
    deleteLorebook,
    renameLorebook,
    reorderLorebook,
    addNewRegex,
    importRegex,
    deleteRegex,
    renameRegex,
    reorderRegex,
    addAssetFromDialog,
    attachAssetContextMenu,
    reorderAsset,
    addLuaSection,
    renameLuaSection,
    deleteLuaSection,
    reorderLuaSections,
    addCssSection,
    renameCssSection,
    deleteCssSection,
    reorderCssSections,
    addAlternateGreeting,
    deleteAlternateGreeting,
    reorderAlternateGreetings,
  };
}
