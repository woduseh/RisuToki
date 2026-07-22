import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_THEMES,
  DEFAULT_CUSTOM_THEME_PALETTE,
  createThemeFromCustomPalette,
  getRequiredCssVariables,
  normalizeCustomThemePalette,
} from './theme-registry';

describe('theme registry', () => {
  it('defines complete app, Monaco, and terminal data for every built-in preset', () => {
    const requiredVariables = getRequiredCssVariables();

    expect(BUILT_IN_THEMES.map((theme) => theme.id)).toEqual([
      'toki',
      'aris',
      'kei',
      'yuzu',
      'midori',
      'momoi',
      'yuuka',
      'hina',
      'mika',
      'kisaki',
    ]);

    expect(BUILT_IN_THEMES.map((theme) => theme.talkTitle)).toEqual([
      'TokiTalk',
      'ArisTalk',
      'KeiTalk',
      'YuzuTalk',
      'MidoriTalk',
      'MomoiTalk',
      'YuukaTalk',
      'HinaTalk',
      'MikaTalk',
      'KisakiTalk',
    ]);

    for (const theme of BUILT_IN_THEMES) {
      for (const variableName of requiredVariables) {
        expect(theme.cssVariables[variableName], `${theme.id} ${variableName}`).toBeTruthy();
      }
      expect(theme.monaco.base).toMatch(/^vs/);
      expect(theme.monaco.rules.length).toBeGreaterThan(0);
      expect(theme.monaco.colors['editor.background']).toBeTruthy();
      expect(theme.terminal.background).toBeTruthy();
      expect(theme.terminal.foreground).toBeTruthy();
    }
  });

  it('rejects custom palettes with invalid color values', () => {
    expect(normalizeCustomThemePalette({ ...DEFAULT_CUSTOM_THEME_PALETTE, accent: 'blue' })).toBeNull();
    expect(normalizeCustomThemePalette({ ...DEFAULT_CUSTOM_THEME_PALETTE, background: '#12345' })).toBeNull();
  });

  it('derives a complete custom theme from a valid palette', () => {
    const theme = createThemeFromCustomPalette({
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      mode: 'dark',
      accent: '#123456',
    });

    expect(theme.id).toBe('custom');
    expect(theme.mode).toBe('dark');
    expect(theme.defaultRpMode).toBe('aris');
    expect(theme.cssVariables['--accent']).toBe('#123456');
    expect(theme.monaco.base).toBe('vs-dark');
    expect(theme.terminal.cursor).toBe('#123456');
  });
});
