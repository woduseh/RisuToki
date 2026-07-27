import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app-store';

describe('app-store reactive state', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('tracks restored-session provenance in reactive store state', () => {
    const store = useAppStore() as ReturnType<typeof useAppStore> & {
      displayFileLabel?: string;
      restoredSessionLabel?: string;
      setRestoredSessionLabel?: (label: string) => void;
    };

    store.setFileLabel('Character');

    expect(typeof store.setRestoredSessionLabel).toBe('function');

    store.setRestoredSessionLabel!('자동복원');

    expect(store.fileLabel).toBe('Character');
    expect(store.restoredSessionLabel).toBe('자동복원');
    expect(store.displayFileLabel).toBe('Character [자동복원]');
  });

  it('clearing restored-session provenance does not wipe unrelated UI state', () => {
    const store = useAppStore() as ReturnType<typeof useAppStore> & {
      displayFileLabel?: string;
      clearRestoredSessionState?: () => void;
      setRestoredSessionLabel?: (label: string) => void;
    };

    store.setDarkMode(true);
    store.setStatus('일반 상태', { sticky: true });
    store.setFileLabel('Character');

    expect(typeof store.setRestoredSessionLabel).toBe('function');
    expect(typeof store.clearRestoredSessionState).toBe('function');

    store.setRestoredSessionLabel!('자동복원');
    store.clearRestoredSessionState!();

    expect(store.darkMode).toBe(true);
    expect(store.statusText).toBe('일반 상태');
    expect(store.statusSticky).toBe(true);
    expect(store.fileLabel).toBe('Character');
    expect(store.displayFileLabel).toBe('Character');
  });

  it('stores a sticky recovery status that clears with restored-session state', () => {
    const store = useAppStore() as ReturnType<typeof useAppStore> & {
      clearRestoredSessionState?: () => void;
      showRestoredSessionStatus?: (text: string) => void;
    };

    expect(typeof store.showRestoredSessionStatus).toBe('function');
    expect(typeof store.clearRestoredSessionState).toBe('function');

    store.showRestoredSessionStatus!('자동 저장에서 복원됨: Character.charx (04/01 09:41:20)');

    expect(store.statusText).toBe('자동 저장에서 복원됨: Character.charx (04/01 09:41:20)');
    expect(store.statusKind).toBe('info');
    expect(store.statusSticky).toBe(true);

    store.clearRestoredSessionState!();

    expect(store.statusText).toBe('');
    expect(store.statusSticky).toBe(false);
  });

  it('derives talk title from selected theme metadata', () => {
    const store = useAppStore();

    expect(store.talkTitle).toBe('TokiTalk');

    store.setThemeId('aris');
    expect(store.talkTitle).toBe('ArisTalk');

    store.setThemeId('yuuka');
    expect(store.talkTitle).toBe('YuukaTalk');
  });

  it('keeps the avatar attached to the terminal and toggles only its visibility', () => {
    const store = useAppStore();

    if (store.activeUtility === 'terminal') store.toggleUtility('terminal');
    expect(store.activeUtility).toBeNull();

    store.toggleAvatar();
    expect(store.activeUtility).toBe('terminal');
    expect(store.avatarVisible).toBe(true);

    store.toggleAvatar();
    expect(store.activeUtility).toBe('terminal');
    expect(store.avatarVisible).toBe(false);
  });

  it('toggles references independently from the terminal shelf', () => {
    const store = useAppStore();
    expect(store.activeUtility).toBe('terminal');
    expect(store.referencesVisible).toBe(false);

    store.toggleReferences();
    expect(store.referencesVisible).toBe(true);
    expect(store.activeUtility).toBe('terminal');

    store.toggleUtility('terminal');
    expect(store.referencesVisible).toBe(true);
    expect(store.activeUtility).toBeNull();
  });

  it('uses mutually exclusive tabs inside the unified right sidebar', () => {
    const store = useAppStore();
    store.setFileData({ lorebook: [{ comment: 'Entry' }] } as never);
    store.setActiveTabId('lore_0');

    expect(store.inspectorVisible).toBe(true);
    expect(store.referencesVisible).toBe(false);

    store.toggleReferences();
    expect(store.inspectorVisible).toBe(false);
    expect(store.referencesVisible).toBe(true);

    store.setRightSidebarView('guides');
    expect(store.guidesVisible).toBe(true);
    expect(store.inspectorVisible).toBe(false);
    expect(store.referencesVisible).toBe(false);

    store.toggleInspector();
    expect(store.inspectorVisible).toBe(true);
    expect(store.guidesVisible).toBe(false);
    expect(store.referencesVisible).toBe(false);
  });

  it('collapses surrounding panels for preview focus and restores their prior state', () => {
    const store = useAppStore();
    store.setFileData({ lorebook: [{ comment: 'Entry' }] } as never);
    store.setActiveTabId('lore_0');
    store.setActiveUtility('terminal');

    expect(store.previewFocusMode).toBe(false);
    expect(store.togglePreviewFocusMode()).toBe(true);
    expect(store.previewFocusMode).toBe(true);
    expect(store.navigatorVisible).toBe(false);
    expect(store.rightSidebarView).toBeNull();
    expect(store.activeUtility).toBeNull();

    store.setPreviewFocusMode(false);
    expect(store.previewFocusMode).toBe(false);
    expect(store.navigatorVisible).toBe(true);
    expect(store.rightSidebarView).toBe('inspector');
    expect(store.activeUtility).toBe('terminal');
  });

  it('leaves focus mode without reopening every panel when a panel is opened manually', () => {
    const store = useAppStore();
    store.setRightSidebarView('guides');
    store.setPreviewFocusMode(true);

    store.toggleNavigator();

    expect(store.previewFocusMode).toBe(false);
    expect(store.navigatorVisible).toBe(true);
    expect(store.rightSidebarView).toBeNull();
    expect(store.activeUtility).toBeNull();
  });
});

describe('app-store previewability', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('returns false when no file is open', () => {
    const store = useAppStore();
    expect(store.canPreviewCurrentFile).toBe(false);
  });

  it('treats missing _fileType as charx for previewability', () => {
    const store = useAppStore();
    store.setFileData({ name: 'Character' } as never);
    expect(store.canPreviewCurrentFile).toBe(true);
  });

  it('treats explicit charx as previewable', () => {
    const store = useAppStore();
    store.setFileData({ _fileType: 'charx', name: 'Character' } as never);
    expect(store.canPreviewCurrentFile).toBe(true);
  });

  it('treats risum as non-previewable', () => {
    const store = useAppStore();
    store.setFileData({ _fileType: 'risum', name: 'Module' } as never);
    expect(store.canPreviewCurrentFile).toBe(false);
  });

  it('treats risup as non-previewable', () => {
    const store = useAppStore();
    store.setFileData({ _fileType: 'risup', name: 'Preset' } as never);
    expect(store.canPreviewCurrentFile).toBe(false);
  });

  it('clears document-scoped tab and inspector context when another file is loaded', () => {
    const store = useAppStore();
    store.setFileData({ _fileType: 'charx', name: 'Character', lorebook: [{}] } as never);
    store.setActiveTabId('lore_0');
    store.setActiveTabLanguage('plaintext');

    expect(store.hasInspectorContext).toBe(true);

    store.setFileData({ _fileType: 'risum', name: 'Module', lorebook: [] } as never);

    expect(store.activeTabId).toBeNull();
    expect(store.activeTabLanguage).toBe('');
    expect(store.hasInspectorContext).toBe(false);
  });
});
