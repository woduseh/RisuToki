import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTriggerScriptsText } from './trigger-script-model';
import { TabManager } from './tab-manager';
import { applyTriggerScriptsMcpRefresh, openTriggerScriptsTab } from './trigger-scripts-runtime';

function createTestTabManager(onActivateTab = vi.fn()) {
  return new TabManager('editor-tabs', {
    onActivateTab,
    onDisposeFormEditors: vi.fn(),
    onClearEditor: vi.fn(),
    isPanelPoppedOut: () => false,
    onPopOutTab: vi.fn(),
    isFormTabType: () => false,
  });
}

describe('trigger scripts runtime', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="editor-tabs"></div>';
  });

  it('opens triggerScripts through the runtime routing module in _triggerform mode', () => {
    const fileData = {
      triggerScripts: JSON.stringify(
        [
          {
            comment: 'legacy',
            type: 'start',
            conditions: [],
            effect: [{ type: 'triggerlua', code: 'print("legacy")' }],
            lowLevelAccess: false,
          },
        ],
        null,
        2,
      ),
      lua: '',
    };
    const onActivateTab = vi.fn();
    const tabMgr = createTestTabManager(onActivateTab);
    const legacyTab = tabMgr.openTab(
      'triggerScripts',
      '트리거 스크립트',
      'json',
      () => fileData.triggerScripts,
      (value) => {
        fileData.triggerScripts = value as string;
      },
    );
    legacyTab._triggerSelectedIndex = 2;
    onActivateTab.mockClear();

    const tab = openTriggerScriptsTab(tabMgr, fileData);

    expect(tab).toBeTruthy();
    expect(tab?.language).toBe('_triggerform');
    expect(tabMgr.findTab('triggerScripts')?.language).toBe('_triggerform');
    expect(tab?._triggerSelectedIndex).toBe(2);

    const draft = tab?.getValue() as ReturnType<typeof parseTriggerScriptsText>;
    draft.triggers[0].comment = 'rerouted';
    tab?.setValue?.(draft);

    expect(JSON.parse(fileData.triggerScripts)).toEqual([
      {
        comment: 'rerouted',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("legacy")' }],
        lowLevelAccess: false,
      },
    ]);
  });

  it('applies MCP triggerScripts refresh through the runtime routing module to update the open tab', () => {
    const fileData = {
      triggerScripts: JSON.stringify(
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
      ),
      lua: '',
    };
    const tabMgr = createTestTabManager();
    const tab = openTriggerScriptsTab(tabMgr, fileData);
    tab!._triggerSelectedIndex = 4;
    tabMgr.activeTabId = 'triggerScripts';
    const activateTab = vi.fn();

    applyTriggerScriptsMcpRefresh({
      fileData,
      value: [
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
      openTabs: tabMgr.openTabs,
      activeTabId: tabMgr.activeTabId,
      activateTab,
    });

    expect(tab?.language).toBe('_triggerform');
    expect(tab?._triggerSelectedIndex).toBe(4);
    expect(activateTab).toHaveBeenCalledWith(tab);
    expect(fileData.lua).toBe('print("after")');
    expect(
      (tab?.getValue() as ReturnType<typeof parseTriggerScriptsText>).triggers.map((trigger) => trigger.comment),
    ).toEqual(['after', 'added']);
  });
});
