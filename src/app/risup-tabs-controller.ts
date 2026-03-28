import type { CharxData } from '../stores/app-store';

export interface RisupTabLike {
  id: string;
  language: string;
  getValue?: (() => unknown) | null;
  setValue?: ((value: unknown) => void) | null;
}

export interface RisupSidebarGroupLike {
  id: string;
  label: string;
  hidden?: boolean;
}

export interface RisupSidebarBackupTarget {
  backupKey: string;
  label: string;
}

export interface RisupSidebarExtraItem {
  field: string;
  icon: string;
  id: string;
  label: string;
  language: string;
}

export interface RisupTabsPreRestoreOptions<TTab extends RisupTabLike = RisupTabLike> {
  activeTabId: string | null;
  createBackup: (tabId: string, value: unknown) => void;
  activeTab?: TTab | null;
  tab?: TTab | null;
}

export interface RisupTabsRestoreOptions<TTab extends RisupTabLike = RisupTabLike> {
  activeTabId: string | null;
  activateTab: (tab: TTab) => void;
  activeTab?: TTab | null;
  backupContent: unknown;
  fileData: CharxData | null;
  setFileLabel?: ((name: string) => void) | null;
  tab?: TTab | null;
}

export interface FindActiveRisupTabOptions<TTab extends RisupTabLike = RisupTabLike> {
  activeTabId: string | null;
  openTabs: readonly TTab[];
}

export function findActiveRisupTab<TTab extends RisupTabLike>(options: FindActiveRisupTabOptions<TTab>): TTab | null {
  if (!options.activeTabId?.startsWith('risup_')) {
    return null;
  }

  return options.openTabs.find((tab) => tab.id === options.activeTabId) ?? null;
}

export function getRisupSidebarBackupTargets(
  currentGroupId: string,
  groups: readonly RisupSidebarGroupLike[],
  hasBackups: (backupKey: string) => boolean,
): RisupSidebarBackupTarget[] {
  const targets: RisupSidebarBackupTarget[] = [];
  const currentBackupKey = `risup_${currentGroupId}`;

  if (hasBackups(currentBackupKey)) {
    targets.push({ backupKey: currentBackupKey, label: '백업 불러오기' });
  }

  if (currentGroupId !== 'templates') {
    return targets;
  }

  for (const group of groups) {
    if (!group.hidden) {
      continue;
    }

    const backupKey = `risup_${group.id}`;
    if (!hasBackups(backupKey)) {
      continue;
    }

    targets.push({ backupKey, label: `${group.label} 백업 불러오기` });
  }

  return targets;
}

export function getRisupSidebarExtraItems(): RisupSidebarExtraItem[] {
  return [
    {
      field: 'description',
      icon: '📄',
      id: 'description',
      label: '설명',
      language: 'plaintext',
    },
  ];
}

/**
 * Backs up the current state of the active risup form tab before a restore
 * overwrites it. Uses tab.getValue() because risup form tabs do not use Monaco
 * (editorInstance is null for these tabs).
 */
export function backupActiveRisupRestoreDraft<TTab extends RisupTabLike>(
  options: RisupTabsPreRestoreOptions<TTab>,
): void {
  const activeTab = options.activeTab ?? options.tab;

  if (!activeTab?.getValue || !options.activeTabId?.startsWith('risup_') || options.activeTabId !== activeTab.id) {
    return;
  }

  options.createBackup(activeTab.id, activeTab.getValue());
}

/**
 * Restores a risup backup into either an open form tab or directly into
 * fileData when the tab is closed.
 *
 * Returns true on success, false if the backup content is invalid or fileData
 * is unavailable for a closed-tab restore.
 */
export function restoreRisupTabsControllerBackup<TTab extends RisupTabLike>(
  options: RisupTabsRestoreOptions<TTab>,
): boolean {
  if (!options.backupContent || typeof options.backupContent !== 'object' || Array.isArray(options.backupContent)) {
    return false;
  }

  const content = options.backupContent as Record<string, unknown>;
  const restoreTab = options.tab ?? null;

  if (restoreTab?.setValue) {
    restoreTab.setValue(content);
  } else {
    if (!options.fileData) {
      return false;
    }

    Object.assign(options.fileData, content);
    if ('name' in content && options.setFileLabel) {
      options.setFileLabel((content.name as string) || 'Untitled');
    }
  }

  const activeTab = options.activeTab ?? (restoreTab && options.activeTabId === restoreTab.id ? restoreTab : null);

  if (activeTab && options.activeTabId === activeTab.id) {
    options.activateTab(activeTab);
  }

  return true;
}
