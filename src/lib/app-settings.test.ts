import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTOSAVE_INTERVAL,
  clearAutosaveDir,
  getDefaultCustomTheme,
  normalizeRpMode,
  readAppSettingsSnapshot,
  readStoredLayoutState,
  writeAutosaveDir,
  writeAutosaveEnabled,
  writeAutosaveInterval,
  writeDarkMode,
  writeCustomTheme,
  writeLayoutState,
  writeRpMode,
  writeThemeId,
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
    },
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
    expect(snapshot.themeId).toBe('toki');
    expect(snapshot.customTheme).toBeNull();
    expect(snapshot.autosaveInterval).toBe(DEFAULT_AUTOSAVE_INTERVAL);
    expect(snapshot.rpMode).toBe('off');
    expect(snapshot.layoutState).toBeNull();
  });

  it('maps legacy dark mode to the matching built-in theme id', () => {
    const storage = createStorage();

    writeDarkMode(true, storage);
    expect(readAppSettingsSnapshot(storage).themeId).toBe('aris');
    expect(readAppSettingsSnapshot(storage).darkMode).toBe(true);

    writeDarkMode(false, storage);
    expect(readAppSettingsSnapshot(storage).themeId).toBe('toki');
    expect(readAppSettingsSnapshot(storage).darkMode).toBe(false);
  });

  it('prefers stored theme id over legacy dark mode', () => {
    const storage = createStorage();
    storage.setItem('toki-dark-mode', 'true');
    writeThemeId('millennium', storage);

    const snapshot = readAppSettingsSnapshot(storage);

    expect(snapshot.themeId).toBe('millennium');
    expect(snapshot.darkMode).toBe(false);
  });

  it('falls back safely when custom theme JSON is invalid', () => {
    const storage = createStorage();
    writeThemeId('custom', storage);
    storage.setItem('toki-custom-theme', '{broken');

    const snapshot = readAppSettingsSnapshot(storage);

    expect(snapshot.themeId).toBe('custom');
    expect(snapshot.customTheme).toBeNull();
    expect(snapshot.darkMode).toBe(false);
  });

  it('persists a valid custom theme palette', () => {
    const storage = createStorage();
    const customTheme = { ...getDefaultCustomTheme(), mode: 'dark' as const, accent: '#123456' };

    writeCustomTheme(customTheme, storage);
    writeThemeId('custom', storage);

    const snapshot = readAppSettingsSnapshot(storage);
    expect(snapshot.themeId).toBe('custom');
    expect(snapshot.customTheme?.accent).toBe('#123456');
    expect(snapshot.darkMode).toBe(true);
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

  it('returns null instead of throwing when stored layout JSON is corrupted', () => {
    const storage = createStorage();
    storage.setItem('toki-layout-state', '{broken');

    expect(readStoredLayoutState(storage)).toBeNull();
  });

  it('normalizes legacy sidebar layout keys instead of dropping stored state', () => {
    const storage = createStorage();
    storage.setItem(
      'toki-layout-state',
      JSON.stringify({
        sidebarPos: 'right',
        sidebarVisible: false,
        terminalPos: 'bottom',
      }),
    );

    expect(readStoredLayoutState(storage)).toEqual({
      itemsPos: 'right',
      itemsVisible: false,
      terminalPos: 'bottom',
    });
  });

  it('drops avatar state objects that do not contain a string src field', () => {
    const storage = createStorage();
    storage.setItem('toki-avatar-idle', JSON.stringify({ foo: 'bar' }));
    storage.setItem('toki-avatar-working', JSON.stringify({ src: 123 }));

    const snapshot = readAppSettingsSnapshot(storage);

    expect(snapshot.avatarIdle).toBeNull();
    expect(snapshot.avatarWorking).toBeNull();
  });

  it('normalizeRpMode still rejects unknown values', () => {
    expect(normalizeRpMode('invalid', false)).toBe('off');
    expect(normalizeRpMode('pluni', false)).toBe('off');
    expect(normalizeRpMode(null, false)).toBe('off');
  });
});
