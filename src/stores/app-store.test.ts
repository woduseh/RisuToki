import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app-store';

describe('app-store pluniCategory', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('defaults pluniCategory to "solo"', () => {
    const store = useAppStore();
    expect(store.pluniCategory).toBe('solo');
  });

  it('setPluniCategory updates the reactive state', () => {
    const store = useAppStore();
    store.setPluniCategory('world-sim');
    expect(store.pluniCategory).toBe('world-sim');

    store.setPluniCategory('multi-char');
    expect(store.pluniCategory).toBe('multi-char');
  });

  it('setPluniCategory keeps other fields unchanged', () => {
    const store = useAppStore();
    store.setDarkMode(true);
    store.setRpMode('pluni');

    store.setPluniCategory('world-sim');

    expect(store.darkMode).toBe(true);
    expect(store.rpMode).toBe('pluni');
    expect(store.pluniCategory).toBe('world-sim');
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
});
