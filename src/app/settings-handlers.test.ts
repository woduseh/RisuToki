import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAppSettingsSnapshot, writeRpMode } from '../lib/app-settings';
import type { CustomThemePalette, ThemeId } from '../lib/theme-registry';
import { changeTheme } from './settings-handlers';

describe('settings-handlers', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('changes and persists the app theme without changing RP mode', () => {
    let themeId: ThemeId = 'toki';
    let customTheme: CustomThemePalette | null = null;
    writeRpMode('aris');

    changeTheme('millennium', {
      getEditorInstance: () => null,
      getFormEditors: () => [],
      getTerminal: () => null,
      getThemeId: () => themeId,
      getCustomTheme: () => customTheme,
      setThemeId: (value) => {
        themeId = value;
      },
      setCustomTheme: (value) => {
        customTheme = value;
      },
    });

    expect(themeId).toBe('millennium');
    expect(readAppSettingsSnapshot().themeId).toBe('millennium');
    expect(readAppSettingsSnapshot().rpMode).toBe('aris');
  });

  it('does not require RP or dark-mode mutation callbacks in the theme contract', () => {
    const setThemeId = vi.fn();
    changeTheme('trinity', {
      getEditorInstance: () => null,
      getFormEditors: () => [],
      getTerminal: () => null,
      getThemeId: () => 'toki',
      getCustomTheme: () => null,
      setThemeId,
      setCustomTheme: vi.fn(),
    });
    expect(setThemeId).toHaveBeenCalledWith('trinity');
  });
});
