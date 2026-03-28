import { describe, expect, it, vi } from 'vitest';
import * as formEditor from './form-editor';
import * as mcpDataUpdate from './mcp-data-update';
import { parseTriggerScriptsText } from './trigger-script-model';
import { TabManager } from './tab-manager';

const { planMcpDataUpdate } = mcpDataUpdate;

function createTestTabManager() {
  return new TabManager('editor-tabs', {
    onActivateTab: vi.fn(),
    onDisposeFormEditors: vi.fn(),
    onClearEditor: vi.fn(),
    isPanelPoppedOut: () => false,
    onPopOutTab: vi.fn(),
    isFormTabType: () => false,
  });
}

describe('MCP data update planner', () => {
  it('backs up lorebook tabs and requests sidebar refreshes', () => {
    const plan = planMcpDataUpdate('lorebook', [
      { id: 'lore_0', getValue: () => 'entry-0' },
      { id: 'lore_1', getValue: () => 'entry-1' },
      { id: 'description', getValue: () => 'desc' },
    ]);

    expect(plan).toEqual({
      backupTabIds: ['lore_0', 'lore_1'],
      refreshTabIds: [],
      refreshIndexedPrefixes: ['lore_'],
      refreshSidebar: true,
      statusMessage: 'AI 어시스턴트가 로어북을 수정했습니다',
      updateFileLabel: false,
    });
  });

  it('backs up lua section tabs and marks name updates for label refresh', () => {
    expect(
      planMcpDataUpdate('lua', [
        { id: 'lua', getValue: () => '-- full' },
        { id: 'lua_s0', getValue: () => '-- section' },
        { id: 'css', getValue: () => '<style />' },
      ]),
    ).toEqual({
      backupTabIds: ['lua', 'lua_s0'],
      refreshTabIds: [],
      refreshIndexedPrefixes: ['lua_s'],
      refreshSidebar: true,
      statusMessage: 'AI 어시스턴트가 lua 필드를 수정했습니다',
      updateFileLabel: false,
    });

    expect(planMcpDataUpdate('name', [{ id: 'name', getValue: () => 'Toki' }])).toEqual({
      backupTabIds: ['name'],
      refreshTabIds: [],
      refreshIndexedPrefixes: [],
      refreshSidebar: false,
      statusMessage: 'AI 어시스턴트가 name 필드를 수정했습니다',
      updateFileLabel: true,
    });
  });

  it('refreshes open risup group tabs when preset fields change', () => {
    expect(
      planMcpDataUpdate('mainPrompt', [
        { id: 'risup_prompts', getValue: () => ({ mainPrompt: 'old' }) },
        { id: 'regex_0', getValue: () => ({}) },
      ]),
    ).toEqual({
      backupTabIds: ['risup_prompts'],
      refreshTabIds: [],
      refreshIndexedPrefixes: ['risup_'],
      refreshSidebar: false,
      statusMessage: 'AI 어시스턴트가 mainPrompt 필드를 수정했습니다',
      updateFileLabel: false,
    });

    expect(
      planMcpDataUpdate('name', [
        { id: 'risup_basic', getValue: () => ({ name: 'Preset' }) },
        { id: 'regex_0', getValue: () => ({}) },
      ]),
    ).toEqual({
      backupTabIds: ['risup_basic'],
      refreshTabIds: [],
      refreshIndexedPrefixes: ['risup_'],
      refreshSidebar: false,
      statusMessage: 'AI 어시스턴트가 name 필드를 수정했습니다',
      updateFileLabel: true,
    });

    // Tab ID compatibility: risup_templates must be treated the same as any other risup_ tab
    expect(
      planMcpDataUpdate('promptTemplate', [
        { id: 'risup_templates', getValue: () => ({ promptTemplate: {} }) },
        { id: 'regex_0', getValue: () => ({}) },
      ]),
    ).toEqual({
      backupTabIds: ['risup_templates'],
      refreshTabIds: [],
      refreshIndexedPrefixes: ['risup_'],
      refreshSidebar: false,
      statusMessage: 'AI 어시스턴트가 promptTemplate 필드를 수정했습니다',
      updateFileLabel: false,
    });
  });

  it('backs up and refreshes open trigger form tabs when trigger scripts change', () => {
    expect(planMcpDataUpdate('triggerScripts', [{ id: 'triggerScripts', getValue: () => ({ triggers: [] }) }])).toEqual(
      {
        backupTabIds: ['triggerScripts'],
        refreshTabIds: ['triggerScripts'],
        refreshIndexedPrefixes: [],
        refreshSidebar: false,
        statusMessage: 'AI 어시스턴트가 triggerScripts 필드를 수정했습니다',
        updateFileLabel: false,
      },
    );
  });

  it('refreshes open trigger form tabs with the latest triggerScripts text', () => {
    const openTriggerScriptsFormTab = (
      formEditor as {
        openTriggerScriptsFormTab?: (
          tabMgr: Pick<TabManager, 'openTabs' | 'openTab'>,
          options: formEditor.TriggerScriptsFormTabOptions,
        ) => ReturnType<typeof formEditor.createTriggerScriptsFormTab> | null;
      }
    ).openTriggerScriptsFormTab;
    const refreshOpenTriggerScriptsTab = (
      mcpDataUpdate as {
        refreshOpenTriggerScriptsTab?: (options: {
          openTabs: ReturnType<typeof createTestTabManager>['openTabs'];
          activeTabId: string | null;
          buildTabState: (
            tab?: ReturnType<typeof createTestTabManager>['openTabs'][number],
          ) => ReturnType<typeof formEditor.createTriggerScriptsFormTab> | null;
          activateTab: (tab: ReturnType<typeof createTestTabManager>['openTabs'][number]) => void;
        }) => void;
      }
    ).refreshOpenTriggerScriptsTab;

    expect(openTriggerScriptsFormTab).toBeTypeOf('function');
    expect(refreshOpenTriggerScriptsTab).toBeTypeOf('function');
    if (!openTriggerScriptsFormTab || !refreshOpenTriggerScriptsTab) return;

    let rawText = JSON.stringify(
      [
        {
          comment: 'before',
          type: 'start',
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'print("before")' }],
          lowLevelAccess: false,
        },
      ],
      null,
      2,
    );
    const tabMgr = createTestTabManager();
    const tab = openTriggerScriptsFormTab(tabMgr, {
      getText: () => rawText,
      setText: (value) => {
        rawText = value;
      },
    });

    expect(tab).toBeTruthy();
    expect((tab?.getValue() as ReturnType<typeof parseTriggerScriptsText>).triggers[0]?.comment).toBe('before');

    tab!._triggerSelectedIndex = 4;
    tabMgr.activeTabId = 'triggerScripts';
    const activateTab = vi.fn();
    rawText = JSON.stringify(
      [
        {
          comment: 'after',
          type: 'start',
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'print("after")' }],
          lowLevelAccess: false,
        },
        {
          comment: 'added',
          type: 'manual',
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'print("added")' }],
          lowLevelAccess: true,
        },
      ],
      null,
      2,
    );

    refreshOpenTriggerScriptsTab({
      openTabs: tabMgr.openTabs,
      activeTabId: tabMgr.activeTabId,
      buildTabState: (currentTab) =>
        formEditor.createTriggerScriptsFormTab({
          getText: () => rawText,
          setText: (value) => {
            rawText = value;
          },
          selectedIndex:
            typeof currentTab?._triggerSelectedIndex === 'number' ? currentTab._triggerSelectedIndex : undefined,
        }),
      activateTab,
    });

    expect(tab?.language).toBe('_triggerform');
    expect(tab?._triggerSelectedIndex).toBe(4);
    expect(activateTab).toHaveBeenCalledWith(tab);
    expect(
      (tab?.getValue() as ReturnType<typeof parseTriggerScriptsText>).triggers.map((trigger) => trigger.comment),
    ).toEqual(['after', 'added']);
  });
});
