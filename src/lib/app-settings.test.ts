import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTOSAVE_INTERVAL,
  clearAutosaveDir,
  readAppSettingsSnapshot,
  writeAutosaveDir,
  writeAutosaveEnabled,
  writeAutosaveInterval,
  writeDarkMode,
  writeLayoutState,
  writeRpMode
} from './app-settings';

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    }
  };
}

describe('app settings', () => {
  it('migrates legacy boolean rp mode using dark mode', () => {
    const storage = createStorage();
    writeDarkMode(true, storage);
    storage.setItem('toki-rp-mode', 'true');

    expect(readAppSettingsSnapshot(storage).rpMode).toBe('aris');

    writeDarkMode(false, storage);
    expect(readAppSettingsSnapshot(storage).rpMode).toBe('toki');
  });

  it('returns defaults for missing settings', () => {
    const snapshot = readAppSettingsSnapshot(createStorage());
    expect(snapshot.darkMode).toBe(false);
    expect(snapshot.autosaveInterval).toBe(DEFAULT_AUTOSAVE_INTERVAL);
    expect(snapshot.rpMode).toBe('off');
    expect(snapshot.layoutState).toBeNull();
  });

  it('writes and clears persisted settings through helpers', () => {
    const storage = createStorage();
    writeRpMode('custom', storage);
    writeAutosaveEnabled(true, storage);
    writeAutosaveInterval(120_000, storage);
    writeAutosaveDir('C:\\temp', storage);
    writeLayoutState({ itemsPos: 'right', terminalVisible: false }, storage);

    let snapshot = readAppSettingsSnapshot(storage);
    expect(snapshot.rpMode).toBe('custom');
    expect(snapshot.autosaveEnabled).toBe(true);
    expect(snapshot.autosaveInterval).toBe(120_000);
    expect(snapshot.autosaveDir).toBe('C:\\temp');
    expect(snapshot.layoutState?.itemsPos).toBe('right');

    clearAutosaveDir(storage);
    snapshot = readAppSettingsSnapshot(storage);
    expect(snapshot.autosaveDir).toBe('');
  });
});
