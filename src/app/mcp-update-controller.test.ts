import { describe, expect, it, vi } from 'vitest';

import type { RendererDocumentData } from '../lib/document-types';
import type { Tab } from '../lib/tab-manager';
import { TabManager } from '../lib/tab-manager';
import { handleMcpDataUpdate, type McpUpdateControllerDeps } from './mcp-update-controller';

function makeDocument(): RendererDocumentData {
  return {
    name: 'Test',
    description: '',
    firstMessage: '',
    alternateGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: '[]',
    lorebook: [],
    regex: [],
    _fileType: 'charx',
  };
}

function makeDeps(fileData: RendererDocumentData, tabs: Tab[] = []): McpUpdateControllerDeps {
  return {
    tabManager: {
      activeTabId: null,
      openTabs: tabs,
      markFieldDirty: vi.fn(),
      refreshIndexedTabs: vi.fn(),
      refreshTabs: vi.fn(),
    },
    getFileData: () => fileData,
    getEditor: () => null,
    formTabTypes: new Set(),
    createBackup: vi.fn(),
    buildSidebar: vi.fn(),
    buildLorebookTabState: vi.fn(() => null),
    buildRegexTabState: vi.fn(() => null),
    buildLuaSectionTabState: vi.fn(() => null),
    buildCssSectionTabState: vi.fn(() => null),
    buildRisupTabState: vi.fn(() => null),
    buildRisupPromptItemTabState: vi.fn(() => null),
    applyTriggerScriptsUpdate: vi.fn(),
    mergeLuaIntoTriggerScripts: vi.fn(() => '[{"effect":[]}]'),
    updateLuaSections: vi.fn(),
    updateCssSections: vi.fn(),
    setFileLabel: vi.fn(),
    setStatus: vi.fn(),
  };
}

describe('renderer MCP update controller', () => {
  it('backs up and refreshes open lorebook tabs before marking the field dirty', () => {
    const fileData = makeDocument();
    const loreTab = {
      id: 'lore_0',
      label: 'Lore',
      language: 'markdown',
      getValue: () => 'before',
      setValue: null,
      _lastValue: null,
    } satisfies Tab;
    const deps = makeDeps(fileData, [loreTab]);
    const nextLorebook = [{ key: 'test', content: 'after' }];

    handleMcpDataUpdate(deps, 'lorebook', nextLorebook);

    expect(fileData.lorebook).toBe(nextLorebook);
    expect(deps.createBackup).toHaveBeenCalledWith('lore_0', 'before');
    expect(deps.buildSidebar).toHaveBeenCalledOnce();
    expect(deps.tabManager.refreshIndexedTabs).toHaveBeenCalledWith('lore_', deps.buildLorebookTabState);
    expect(deps.tabManager.markFieldDirty).toHaveBeenCalledWith('lorebook');
  });

  it('keeps Lua and trigger-script representations synchronized', () => {
    const fileData = makeDocument();
    const deps = makeDeps(fileData);

    handleMcpDataUpdate(deps, 'lua', 'print("updated")');

    expect(fileData.lua).toBe('print("updated")');
    expect(fileData.triggerScripts).toBe('[{"effect":[]}]');
    expect(deps.mergeLuaIntoTriggerScripts).toHaveBeenCalledWith('[]', 'print("updated")');
    expect(deps.updateLuaSections).toHaveBeenCalledWith('print("updated")');
  });

  it('refreshes RISUP groups and prompt string IDs through the real tab manager', () => {
    const fileData = makeDocument();
    fileData._fileType = 'risup';
    fileData.promptTemplate = 'before';
    const onActivateTab = vi.fn();
    const tabManager = new TabManager('editor-tabs', {
      onActivateTab,
      onDisposeFormEditors: vi.fn(),
      onClearEditor: vi.fn(),
      isFormTabType: () => true,
    });
    const group = tabManager.openTab('risup_prompt', 'Group', '_risupform', () => fileData, null);
    const prompt = tabManager.openTab(
      'risup_prompt_item_alpha-uuid',
      'Old prompt',
      '_risupPromptItemForm',
      () => 'before',
      null,
    );
    const removed = tabManager.openTab(
      'risup_prompt_item_deleted-uuid',
      'Deleted',
      '_risupPromptItemForm',
      () => 'deleted',
      null,
    );
    tabManager.activeTabId = prompt.id;
    onActivateTab.mockClear();
    const deps = makeDeps(fileData);
    deps.tabManager = tabManager;
    deps.buildRisupTabState = vi.fn((field) => (field === 'prompt' ? { label: 'Refreshed group' } : null));
    deps.buildRisupPromptItemTabState = vi.fn((itemId) =>
      itemId === 'alpha-uuid'
        ? {
            label: 'Renamed prompt',
            getValue: () => fileData.promptTemplate,
          }
        : null,
    );

    handleMcpDataUpdate(deps, 'promptTemplate', 'after');

    expect(group.label).toBe('Refreshed group');
    expect(prompt.label).toBe('Renamed prompt');
    expect(prompt.getValue()).toBe('after');
    expect(tabManager.findTab(removed.id)).toBeUndefined();
    expect(deps.buildRisupTabState).toHaveBeenCalledExactlyOnceWith('prompt', group);
    expect(onActivateTab).toHaveBeenCalledExactlyOnceWith(prompt);
    expect(tabManager.dirtyFields.has('promptTemplate')).toBe(true);
    expect(deps.createBackup).toHaveBeenCalledWith(prompt.id, 'before');
  });
});
