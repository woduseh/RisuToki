import { describe, expect, it, vi } from 'vitest';
import type { SidebarActionDeps } from './sidebar-actions';
import { createSidebarActions } from './sidebar-actions';
import type { Section } from './section-parser';
import type { Tab } from './tab-manager';

type TabStateFn = (index: number, tab: Tab) => Partial<Tab> | null;

function createMockDeps(overrides: Partial<SidebarActionDeps> = {}): SidebarActionDeps {
  return {
    getFileData: () => ({ lorebook: [], regex: [], lua: '', css: '', assets: [] }),
    getLuaSections: () => [],
    getCssSections: () => [],
    getCssStylePrefix: () => '',
    getCssStyleSuffix: () => '',
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn().mockResolvedValue('test'),
    showContextMenu: vi.fn(),
    setStatus: vi.fn(),
    buildSidebar: vi.fn(),
    combineLuaSections: (s: Section[]) => s.map((x) => `-- ===== ${x.name} =====\n${x.content}`).join('\n'),
    combineCssSections: (s: Section[]) => s.map((x) => `/* ===== ${x.name} ===== */\n${x.content}`).join('\n'),
    openTab: vi.fn(),
    closeTab: vi.fn(),
    markFieldDirty: vi.fn(),
    shiftIndexedTabsAfterRemoval: vi.fn(),
    refreshIndexedTabs: vi.fn(),
    buildLorebookTabState: vi.fn().mockReturnValue(null) as unknown as TabStateFn,
    buildRegexTabState: vi.fn().mockReturnValue(null) as unknown as TabStateFn,
    buildLuaSectionTabState: vi.fn().mockReturnValue(null) as unknown as TabStateFn,
    buildCssSectionTabState: vi.fn().mockReturnValue(null) as unknown as TabStateFn,
    ...overrides,
  };
}

describe('reorderRegex', () => {
  it('should move item from index 0 to index 2', () => {
    const regex = [{ comment: 'A' }, { comment: 'B' }, { comment: 'C' }];
    const deps = createMockDeps({ getFileData: () => ({ lorebook: [], regex, lua: '', css: '' }) });
    const actions = createSidebarActions(deps);
    actions.reorderRegex(0, 2);
    expect(regex.map((r) => r.comment)).toEqual(['B', 'C', 'A']);
    expect(deps.markFieldDirty).toHaveBeenCalledWith('regex');
    expect(deps.buildSidebar).toHaveBeenCalled();
  });

  it('should move item from index 2 to index 0', () => {
    const regex = [{ comment: 'A' }, { comment: 'B' }, { comment: 'C' }];
    const deps = createMockDeps({ getFileData: () => ({ lorebook: [], regex, lua: '', css: '' }) });
    const actions = createSidebarActions(deps);
    actions.reorderRegex(2, 0);
    expect(regex.map((r) => r.comment)).toEqual(['C', 'A', 'B']);
  });
});

describe('reorderLuaSections', () => {
  it('should reorder lua sections and recombine', () => {
    const sections: Section[] = [
      { name: 'main', content: 'code1' },
      { name: 'utils', content: 'code2' },
      { name: 'test', content: 'code3' },
    ];
    const fileData = { lorebook: [], regex: [], lua: '', css: '' };
    const deps = createMockDeps({
      getFileData: () => fileData,
      getLuaSections: () => sections,
    });
    const actions = createSidebarActions(deps);
    actions.reorderLuaSections(2, 0);
    expect(sections.map((s) => s.name)).toEqual(['test', 'main', 'utils']);
    expect(fileData.lua).toContain('test');
    expect(deps.markFieldDirty).toHaveBeenCalledWith('lua');
  });
});

describe('reorderCssSections', () => {
  it('should reorder css sections and recombine', () => {
    const sections: Section[] = [
      { name: 'layout', content: 'css1' },
      { name: 'theme', content: 'css2' },
    ];
    const fileData = { lorebook: [], regex: [], lua: '', css: '' };
    const deps = createMockDeps({
      getFileData: () => fileData,
      getCssSections: () => sections,
    });
    const actions = createSidebarActions(deps);
    actions.reorderCssSections(1, 0);
    expect(sections.map((s) => s.name)).toEqual(['theme', 'layout']);
    expect(deps.markFieldDirty).toHaveBeenCalledWith('css');
  });
});

describe('reorderLorebook', () => {
  it('should move root entry to different position in root', () => {
    const lorebook = [
      { comment: 'A', mode: 'normal', folder: '', key: '' },
      { comment: 'B', mode: 'normal', folder: '', key: '' },
      { comment: 'C', mode: 'normal', folder: '', key: '' },
    ];
    const deps = createMockDeps({ getFileData: () => ({ lorebook, regex: [], lua: '', css: '' }) });
    const actions = createSidebarActions(deps);
    actions.reorderLorebook(0, 2, '');
    expect(lorebook.map((e) => e.comment)).toEqual(['B', 'C', 'A']);
  });

  it('should move root entry into a folder', () => {
    const lorebook = [
      { comment: 'FolderX', mode: 'folder', folder: '', key: 'uuid-1' },
      { comment: 'child1', mode: 'normal', folder: 'folder:uuid-1', key: '' },
      { comment: 'rootItem', mode: 'normal', folder: '', key: '' },
    ];
    const deps = createMockDeps({ getFileData: () => ({ lorebook, regex: [], lua: '', css: '' }) });
    const actions = createSidebarActions(deps);
    // Move rootItem (idx 2) into folder:uuid-1 at position 0
    actions.reorderLorebook(2, 0, 'folder:uuid-1');
    // rootItem should now have folder set
    const movedItem = lorebook.find((e) => e.comment === 'rootItem');
    expect(movedItem?.folder).toBe('folder:uuid-1');
    expect(deps.markFieldDirty).toHaveBeenCalledWith('lorebook');
  });

  it('should move folder child to root', () => {
    const lorebook = [
      { comment: 'FolderX', mode: 'folder', folder: '', key: 'uuid-1' },
      { comment: 'child1', mode: 'normal', folder: 'folder:uuid-1', key: '' },
      { comment: 'rootA', mode: 'normal', folder: '', key: '' },
    ];
    const deps = createMockDeps({ getFileData: () => ({ lorebook, regex: [], lua: '', css: '' }) });
    const actions = createSidebarActions(deps);
    // Move child1 (idx 1) to root at position 0
    actions.reorderLorebook(1, 0, '');
    const movedItem = lorebook.find((e) => e.comment === 'child1');
    expect(movedItem?.folder).toBe('');
  });
});
