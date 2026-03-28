import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as risupTabsController from './risup-tabs-controller';
import {
  backupActiveRisupRestoreDraft,
  restoreRisupTabsControllerBackup,
  type RisupTabLike,
} from './risup-tabs-controller';

function makeRisupFileData(overrides: Record<string, unknown> = {}) {
  return {
    name: 'MyPreset',
    mainPrompt: 'You are a helpful assistant.',
    temperature: 0.8,
    ...overrides,
  };
}

function makeRisupTab(
  id: string,
  fileData: Record<string, unknown>,
): RisupTabLike & { getValue: () => unknown; setValue: (v: unknown) => void } {
  return {
    id,
    language: '_risupform',
    getValue: () => fileData,
    setValue: (v) => {
      Object.assign(fileData, v as Record<string, unknown>);
    },
  };
}

describe('backupActiveRisupRestoreDraft', () => {
  it('backs up the current state of the active risup form tab', () => {
    const fileData = makeRisupFileData();
    const tab = makeRisupTab('risup_prompts', fileData);
    const createBackup = vi.fn();

    backupActiveRisupRestoreDraft({
      activeTabId: 'risup_prompts',
      createBackup,
      tab,
    });

    expect(createBackup).toHaveBeenCalledTimes(1);
    expect(createBackup).toHaveBeenCalledWith('risup_prompts', fileData);
  });

  it('does not back up when the active tab is a different tab', () => {
    const fileData = makeRisupFileData();
    const tab = makeRisupTab('risup_prompts', fileData);
    const createBackup = vi.fn();

    backupActiveRisupRestoreDraft({
      activeTabId: 'risup_templates',
      createBackup,
      tab,
    });

    expect(createBackup).not.toHaveBeenCalled();
  });

  it('does not back up when the tab is not open (no tab provided)', () => {
    const createBackup = vi.fn();

    backupActiveRisupRestoreDraft({
      activeTabId: 'risup_prompts',
      createBackup,
      tab: null,
    });

    expect(createBackup).not.toHaveBeenCalled();
  });

  it('does not back up when the active tab id is null', () => {
    const fileData = makeRisupFileData();
    const tab = makeRisupTab('risup_prompts', fileData);
    const createBackup = vi.fn();

    backupActiveRisupRestoreDraft({
      activeTabId: null,
      createBackup,
      tab,
    });

    expect(createBackup).not.toHaveBeenCalled();
  });
});

describe('findActiveRisupTab', () => {
  it('finds the currently active risup form tab from open tabs', () => {
    const activeTab = makeRisupTab('risup_templates', makeRisupFileData());
    const inactiveTab = makeRisupTab('risup_prompts', makeRisupFileData());
    const findActiveRisupTab = (
      risupTabsController as {
        findActiveRisupTab?: (options: { activeTabId: string | null; openTabs: RisupTabLike[] }) => RisupTabLike | null;
      }
    ).findActiveRisupTab;

    expect(typeof findActiveRisupTab).toBe('function');
    if (!findActiveRisupTab) {
      return;
    }

    expect(
      findActiveRisupTab({
        activeTabId: 'risup_templates',
        openTabs: [inactiveTab, activeTab],
      }),
    ).toBe(activeTab);
  });
});

describe('restoreRisupTabsControllerBackup — invalid content', () => {
  it('returns false for string content', () => {
    const fileData = makeRisupFileData();
    const result = restoreRisupTabsControllerBackup({
      activeTabId: null,
      activateTab: vi.fn(),
      backupContent: '{"mainPrompt":"string backup"}',
      fileData: fileData as never,
      setFileLabel: vi.fn(),
    });

    expect(result).toBe(false);
    expect(fileData.mainPrompt).toBe('You are a helpful assistant.');
  });

  it('returns false for null content', () => {
    const fileData = makeRisupFileData();
    const result = restoreRisupTabsControllerBackup({
      activeTabId: null,
      activateTab: vi.fn(),
      backupContent: null,
      fileData: fileData as never,
    });

    expect(result).toBe(false);
  });

  it('returns false for array content', () => {
    const fileData = makeRisupFileData();
    const result = restoreRisupTabsControllerBackup({
      activeTabId: null,
      activateTab: vi.fn(),
      backupContent: [{ mainPrompt: 'bad' }],
      fileData: fileData as never,
    });

    expect(result).toBe(false);
    expect(fileData.mainPrompt).toBe('You are a helpful assistant.');
  });
});

describe('restoreRisupTabsControllerBackup — closed tab', () => {
  it('merges backup content into fileData when the tab is closed', () => {
    const fileData = makeRisupFileData({ mainPrompt: 'old prompt' });
    const setFileLabel = vi.fn();

    const result = restoreRisupTabsControllerBackup({
      activeTabId: null,
      activateTab: vi.fn(),
      backupContent: { mainPrompt: 'restored prompt', temperature: 0.5 },
      fileData: fileData as never,
      setFileLabel,
    });

    expect(result).toBe(true);
    expect(fileData.mainPrompt).toBe('restored prompt');
    expect(fileData.temperature).toBe(0.5);
    expect(setFileLabel).not.toHaveBeenCalled();
  });

  it('updates the file label when backup content includes name', () => {
    const fileData = makeRisupFileData({ name: 'OldName' });
    const setFileLabel = vi.fn();

    const result = restoreRisupTabsControllerBackup({
      activeTabId: null,
      activateTab: vi.fn(),
      backupContent: { name: 'RestoredPreset', mainPrompt: 'new' },
      fileData: fileData as never,
      setFileLabel,
    });

    expect(result).toBe(true);
    expect(fileData.name).toBe('RestoredPreset');
    expect(setFileLabel).toHaveBeenCalledWith('RestoredPreset');
  });

  it('uses "Untitled" when name in backup content is empty', () => {
    const fileData = makeRisupFileData({ name: 'OldName' });
    const setFileLabel = vi.fn();

    restoreRisupTabsControllerBackup({
      activeTabId: null,
      activateTab: vi.fn(),
      backupContent: { name: '' },
      fileData: fileData as never,
      setFileLabel,
    });

    expect(setFileLabel).toHaveBeenCalledWith('Untitled');
  });

  it('does not call setFileLabel when name is absent from backup', () => {
    const fileData = makeRisupFileData();
    const setFileLabel = vi.fn();

    restoreRisupTabsControllerBackup({
      activeTabId: null,
      activateTab: vi.fn(),
      backupContent: { mainPrompt: 'no name here' },
      fileData: fileData as never,
      setFileLabel,
    });

    expect(setFileLabel).not.toHaveBeenCalled();
  });

  it('returns false and does not mutate when fileData is null', () => {
    const result = restoreRisupTabsControllerBackup({
      activeTabId: null,
      activateTab: vi.fn(),
      backupContent: { mainPrompt: 'value' },
      fileData: null,
    });

    expect(result).toBe(false);
  });

  it('preserves compatibility: risup_templates and risup_prompts both restore correctly', () => {
    for (const tabId of ['risup_templates', 'risup_prompts']) {
      const fileData = makeRisupFileData();
      const result = restoreRisupTabsControllerBackup({
        activeTabId: null,
        activateTab: vi.fn(),
        backupContent: { mainPrompt: `from ${tabId}` },
        fileData: fileData as never,
      });

      expect(result).toBe(true);
      expect(fileData.mainPrompt).toBe(`from ${tabId}`);
    }
  });
});

describe('restoreRisupTabsControllerBackup — open tab', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('calls setValue and activateTab when the open tab is active', () => {
    const fileData = makeRisupFileData({ mainPrompt: 'before' });
    const tab = makeRisupTab('risup_prompts', fileData);
    const activateTab = vi.fn();

    const result = restoreRisupTabsControllerBackup({
      activeTabId: 'risup_prompts',
      activateTab,
      backupContent: { mainPrompt: 'restored' },
      fileData: fileData as never,
      tab,
    });

    expect(result).toBe(true);
    expect(fileData.mainPrompt).toBe('restored');
    expect(activateTab).toHaveBeenCalledTimes(1);
    expect(activateTab).toHaveBeenCalledWith(tab);
  });

  it('calls setValue but does NOT call activateTab for an open but inactive tab', () => {
    const fileData = makeRisupFileData({ mainPrompt: 'before' });
    const tab = makeRisupTab('risup_prompts', fileData);
    const activateTab = vi.fn();

    const result = restoreRisupTabsControllerBackup({
      activeTabId: 'risup_templates', // different tab is active
      activateTab,
      backupContent: { mainPrompt: 'restored' },
      fileData: fileData as never,
      tab,
    });

    expect(result).toBe(true);
    expect(fileData.mainPrompt).toBe('restored');
    expect(activateTab).not.toHaveBeenCalled();
  });

  it('rerenders the active risup form when restoring a different risup tab that shares the preset object', () => {
    const fileData = makeRisupFileData({ mainPrompt: 'before', promptTemplate: '{}' });
    const requestedTab = makeRisupTab('risup_prompts', fileData);
    const activeTab = makeRisupTab('risup_templates', fileData);
    const activateTab = vi.fn();

    const result = restoreRisupTabsControllerBackup({
      activeTabId: 'risup_templates',
      activeTab,
      activateTab,
      backupContent: { mainPrompt: 'restored' },
      fileData: fileData as never,
      tab: requestedTab,
    } as never);

    expect(result).toBe(true);
    expect(fileData.mainPrompt).toBe('restored');
    expect(activateTab).toHaveBeenCalledTimes(1);
    expect(activateTab).toHaveBeenCalledWith(activeTab);
  });

  it('restores risup_templates tab via tab.setValue when tab is open', () => {
    const fileData = makeRisupFileData({ promptTemplate: '{}' });
    const tab = makeRisupTab('risup_templates', fileData);
    const activateTab = vi.fn();

    const result = restoreRisupTabsControllerBackup({
      activeTabId: 'risup_templates',
      activateTab,
      backupContent: { promptTemplate: '{"new":"template"}' },
      fileData: fileData as never,
      tab,
    });

    expect(result).toBe(true);
    expect((fileData as Record<string, unknown>).promptTemplate).toBe('{"new":"template"}');
    expect(activateTab).toHaveBeenCalledWith(tab);
  });
});

describe('getRisupSidebarBackupTargets', () => {
  it('keeps hidden legacy risup backups reachable from the visible templates menu', () => {
    const getRisupSidebarBackupTargets = (
      risupTabsController as {
        getRisupSidebarBackupTargets?: (
          currentGroupId: string,
          groups: ReadonlyArray<{ id: string; label: string; hidden?: boolean }>,
          hasBackups: (backupKey: string) => boolean,
        ) => Array<{ backupKey: string; label: string }>;
      }
    ).getRisupSidebarBackupTargets;

    expect(typeof getRisupSidebarBackupTargets).toBe('function');
    if (!getRisupSidebarBackupTargets) {
      return;
    }

    expect(
      getRisupSidebarBackupTargets(
        'templates',
        [
          { id: 'templates', label: '프롬프트' },
          { id: 'prompts', label: '레거시 프롬프트', hidden: true },
        ],
        (backupKey) => backupKey === 'risup_prompts',
      ),
    ).toEqual([{ backupKey: 'risup_prompts', label: '레거시 프롬프트 백업 불러오기' }]);
  });
});

describe('getRisupSidebarExtraItems', () => {
  it('keeps the top-level risup description editor visible alongside grouped preset fields', () => {
    const getRisupSidebarExtraItems = (
      risupTabsController as {
        getRisupSidebarExtraItems?: () => Array<{
          field: string;
          icon: string;
          id: string;
          label: string;
          language: string;
        }>;
      }
    ).getRisupSidebarExtraItems;

    expect(typeof getRisupSidebarExtraItems).toBe('function');
    if (!getRisupSidebarExtraItems) {
      return;
    }

    expect(getRisupSidebarExtraItems()).toEqual([
      {
        field: 'description',
        icon: '📄',
        id: 'description',
        label: '설명',
        language: 'plaintext',
      },
    ]);
  });
});
