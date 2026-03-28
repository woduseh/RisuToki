import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabManager } from '../lib/tab-manager';
import type { TriggerFormTabInfo } from '../lib/trigger-form-editor';
import { parseTriggerScriptsText } from '../lib/trigger-script-model';
import {
  activateTriggerScriptsFormTab,
  applyTriggerScriptsControllerMcpUpdate,
  backupActiveTriggerScriptsRestoreDraft,
  openTriggerScriptsControllerTab,
  restoreTriggerScriptsControllerBackup,
} from './trigger-scripts-controller';

function createFileData(triggerComment = 'legacy') {
  return {
    triggerScripts: JSON.stringify(
      [
        {
          comment: triggerComment,
          type: 'start',
          conditions: [],
          effect: [{ type: 'triggerlua', code: `print("${triggerComment}")` }],
          lowLevelAccess: false,
        },
      ],
      null,
      2,
    ),
    lua: '',
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createTriggerScriptsControllerHarness() {
  const showTriggerEditor = vi.fn();
  const updateSidebarActive = vi.fn();
  const fallbackActivate = vi.fn();

  const activateTab = (tab: TriggerFormTabInfo) => {
    if (activateTriggerScriptsFormTab(tab, tabMgr, { showTriggerEditor, updateSidebarActive })) {
      return;
    }

    fallbackActivate(tab);
  };

  const tabMgr = new TabManager('editor-tabs', {
    onActivateTab: (tab) => activateTab(tab as TriggerFormTabInfo),
    onDisposeFormEditors: vi.fn(),
    onClearEditor: vi.fn(),
    isPanelPoppedOut: () => false,
    onPopOutTab: vi.fn(),
    isFormTabType: () => false,
  });

  return {
    activateTab,
    fallbackActivate,
    showTriggerEditor,
    tabMgr,
    updateSidebarActive,
  };
}

describe('trigger scripts controller wiring', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="editor-tabs"></div>';
  });

  it('opens triggerScripts through the controller wiring and renders the trigger form tab', () => {
    const fileData = createFileData();
    const { fallbackActivate, showTriggerEditor, tabMgr, updateSidebarActive } =
      createTriggerScriptsControllerHarness();

    const tab = openTriggerScriptsControllerTab(tabMgr, fileData);

    expect(tab).toBeTruthy();
    expect(tab?.language).toBe('_triggerform');
    expect(tabMgr.activeTabId).toBe('triggerScripts');
    expect(tabMgr.findTab('triggerScripts')?.language).toBe('_triggerform');
    expect(showTriggerEditor).toHaveBeenCalledTimes(1);
    expect(showTriggerEditor).toHaveBeenCalledWith(tab);
    expect(updateSidebarActive).toHaveBeenCalledTimes(1);
    expect(fallbackActivate).not.toHaveBeenCalled();
  });

  it('backs up and refreshes the active trigger form tab for MCP triggerScripts updates through the controller wiring', () => {
    const fileData = createFileData('before');
    const createBackup = vi.fn();
    const { activateTab, fallbackActivate, showTriggerEditor, tabMgr, updateSidebarActive } =
      createTriggerScriptsControllerHarness();
    const tab = openTriggerScriptsControllerTab(tabMgr, fileData);
    tab!._triggerSelectedIndex = 4;
    tabMgr.activeTabId = 'triggerScripts';
    const previousDraft = cloneJson(tab?.getValue());
    showTriggerEditor.mockClear();
    updateSidebarActive.mockClear();

    applyTriggerScriptsControllerMcpUpdate({
      tabMgr,
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
      createBackup,
      activateTab: (refreshTab) => activateTab(refreshTab as TriggerFormTabInfo),
    });

    expect(createBackup).toHaveBeenCalledTimes(1);
    expect(createBackup).toHaveBeenCalledWith('triggerScripts', previousDraft);
    expect(showTriggerEditor).toHaveBeenCalledTimes(1);
    expect(showTriggerEditor).toHaveBeenCalledWith(tab);
    expect(updateSidebarActive).toHaveBeenCalledTimes(1);
    expect(fallbackActivate).not.toHaveBeenCalled();
    expect(tab?._triggerSelectedIndex).toBe(4);
    expect(fileData.lua).toBe('print("after")');
    expect(
      (tab?.getValue() as { triggers: Array<{ comment: string }> }).triggers.map((trigger) => trigger.comment),
    ).toEqual(['after', 'added']);
  });

  it('restores triggerScripts draft backups through the controller wiring for an open active form tab', () => {
    const fileData = createFileData('before');
    const { activateTab, fallbackActivate, showTriggerEditor, tabMgr, updateSidebarActive } =
      createTriggerScriptsControllerHarness();
    const tab = openTriggerScriptsControllerTab(tabMgr, fileData);
    showTriggerEditor.mockClear();
    updateSidebarActive.mockClear();

    const backupDraft = cloneJson(
      parseTriggerScriptsText(
        JSON.stringify(
          [
            {
              comment: 'restored',
              type: 'start',
              conditions: [],
              effect: [{ type: 'triggerlua', code: 'print("restored")' }],
              lowLevelAccess: false,
            },
          ],
          null,
          2,
        ),
      ),
    );

    const restored = restoreTriggerScriptsControllerBackup({
      tab: tab ?? undefined,
      fileData,
      backupContent: backupDraft,
      activeTabId: 'triggerScripts',
      activateTab: (restoreTab) => activateTab(restoreTab as TriggerFormTabInfo),
    });

    expect(restored).toBe(true);
    expect(fallbackActivate).not.toHaveBeenCalled();
    expect(showTriggerEditor).toHaveBeenCalledTimes(1);
    expect(showTriggerEditor).toHaveBeenCalledWith(tab);
    expect(updateSidebarActive).toHaveBeenCalledTimes(1);
    expect(fileData.triggerScripts).toContain('"comment": "restored"');
    expect(fileData.lua).toBe('print("restored")');
    expect(
      (tab?.getValue() as { triggers: Array<{ comment: string }> }).triggers.map((trigger) => trigger.comment),
    ).toEqual(['restored']);
  });

  it('backs up the active triggerScripts draft before restore overwrites it', () => {
    const createBackup = vi.fn();
    const fileData = createFileData('before');
    const { tabMgr } = createTriggerScriptsControllerHarness();
    const tab = openTriggerScriptsControllerTab(tabMgr, fileData);
    const currentDraft = cloneJson(tab?.getValue());

    backupActiveTriggerScriptsRestoreDraft({
      activeTabId: 'triggerScripts',
      createBackup,
      tab: tab ?? undefined,
    });

    expect(createBackup).toHaveBeenCalledTimes(1);
    expect(createBackup).toHaveBeenCalledWith('triggerScripts', currentDraft);
  });

  it('restores triggerScripts draft backups into file data when the tab is closed', () => {
    const fileData = createFileData('before');

    const restored = restoreTriggerScriptsControllerBackup({
      activeTabId: null,
      activateTab: vi.fn(),
      backupContent: {
        ...parseTriggerScriptsText(
          JSON.stringify(
            [
              {
                comment: 'closed',
                type: 'start',
                conditions: [],
                effect: [{ type: 'triggerlua', code: 'print("closed")' }],
                lowLevelAccess: false,
              },
            ],
            null,
            2,
          ),
        ),
      },
      fileData,
    });

    expect(restored).toBe(true);
    expect(fileData.triggerScripts).toContain('"comment": "closed"');
    expect(fileData.lua).toBe('print("closed")');
  });
});
