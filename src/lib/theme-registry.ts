import type { TerminalTheme } from './terminal-ui';

export type ThemeMode = 'light' | 'dark';
export type BuiltInThemeId = 'toki' | 'aris' | 'momotalk' | 'millennium' | 'gehenna' | 'trinity';
export type ThemeId = BuiltInThemeId | 'custom';
export type ThemeCssVariables = Record<string, string>;

export interface MonacoThemeSpec {
  base: 'vs' | 'vs-dark';
  colors: Record<string, string>;
  inherit: boolean;
  rules: Array<{
    background?: string;
    fontStyle?: string;
    foreground: string;
    token: string;
  }>;
}

export interface AppTheme {
  id: ThemeId;
  label: string;
  mode: ThemeMode;
  talkTitle: 'TokiTalk' | 'ArisTalk' | string;
  defaultRpMode: 'toki' | 'aris';
  cssVariables: ThemeCssVariables;
  monaco: MonacoThemeSpec;
  terminal: TerminalTheme;
}

export interface CustomThemePalette {
  background: string;
  surface: string;
  text: string;
  secondaryText: string;
  accent: string;
  warning: string;
  pink: string;
  border: string;
  mode?: ThemeMode;
  name?: string;
}

export const CUSTOM_THEME_FIELDS: Array<{
  key: keyof Omit<CustomThemePalette, 'mode' | 'name'>;
  label: string;
}> = [
  { key: 'background', label: '배경' },
  { key: 'surface', label: '표면' },
  { key: 'text', label: '본문' },
  { key: 'secondaryText', label: '보조 글자' },
  { key: 'accent', label: '강조' },
  { key: 'warning', label: '경고' },
  { key: 'pink', label: '핑크' },
  { key: 'border', label: '테두리' },
];

export const DEFAULT_CUSTOM_THEME_PALETTE: CustomThemePalette = {
  name: '커스텀',
  mode: 'light',
  background: '#f2f4f8',
  surface: '#ffffff',
  text: '#2b3a52',
  secondaryText: '#7a8ba5',
  accent: '#4a90d9',
  warning: '#ffca28',
  pink: '#f06292',
  border: '#c8d6e5',
};

const REQUIRED_CSS_VARIABLES = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-tertiary',
  '--bg-hover',
  '--bg-active',
  '--text-primary',
  '--text-secondary',
  '--text-highlight',
  '--border-color',
  '--accent',
  '--accent-hover',
  '--accent-light',
  '--pink',
  '--pink-light',
  '--yellow',
  '--panel-shadow',
] as const;

const COMMON_LIGHT_RULES = [
  { token: '', foreground: '2b3a52', background: 'f2f4f8' },
  { token: 'comment', foreground: '7a8ba5', fontStyle: 'italic' },
  { token: 'keyword', foreground: '4a90d9', fontStyle: 'bold' },
  { token: 'string', foreground: '2e7d32' },
  { token: 'number', foreground: 'e65100' },
  { token: 'type', foreground: '7b1fa2' },
  { token: 'function', foreground: '1565c0' },
  { token: 'variable', foreground: 'c62828' },
  { token: 'operator', foreground: 'f06292' },
  { token: 'delimiter', foreground: '546e7a' },
  { token: 'tag', foreground: '4a90d9' },
  { token: 'attribute.name', foreground: 'e65100' },
  { token: 'attribute.value', foreground: '2e7d32' },
];

const COMMON_DARK_RULES = [
  { token: '', foreground: 'd8dce8', background: '1c2340' },
  { token: 'comment', foreground: '7a8ba5', fontStyle: 'italic' },
  { token: 'keyword', foreground: '6fb3f2', fontStyle: 'bold' },
  { token: 'string', foreground: '66bb6a' },
  { token: 'number', foreground: 'ffca28' },
  { token: 'type', foreground: 'f06292' },
  { token: 'function', foreground: '74b9ff' },
  { token: 'variable', foreground: 'ef9a9a' },
  { token: 'operator', foreground: 'f06292' },
  { token: 'delimiter', foreground: '7a8ba5' },
];

function lightMonaco(background: string, foreground: string, accent: string): MonacoThemeSpec {
  return {
    base: 'vs',
    inherit: true,
    rules: COMMON_LIGHT_RULES,
    colors: {
      'editor.background': background,
      'editor.foreground': foreground,
      'editor.lineHighlightBackground': '#e3edf7',
      'editor.selectionBackground': `${accent}44`,
      'editor.inactiveSelectionBackground': '#d6e4f0',
      'editorCursor.foreground': accent,
      'editorLineNumber.foreground': '#a0b4cc',
      'editorLineNumber.activeForeground': accent,
      'editor.findMatchBackground': '#ffca2855',
      'editor.findMatchHighlightBackground': '#ffca2833',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#c8d6e5',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#c8d6e5',
      'editorSuggestWidget.selectedBackground': '#e3edf7',
      'minimap.background': background,
      'scrollbarSlider.background': '#c8d6e544',
      'scrollbarSlider.hoverBackground': `${accent}66`,
      'scrollbarSlider.activeBackground': `${accent}aa`,
    },
  };
}

function darkMonaco(background: string, foreground: string, accent: string): MonacoThemeSpec {
  return {
    base: 'vs-dark',
    inherit: true,
    rules: COMMON_DARK_RULES,
    colors: {
      'editor.background': background,
      'editor.foreground': foreground,
      'editor.lineHighlightBackground': '#1e2844',
      'editor.selectionBackground': `${accent}44`,
      'editorCursor.foreground': accent,
      'editorLineNumber.foreground': '#3a4a68',
      'editorLineNumber.activeForeground': accent,
      'editorWidget.background': '#1c2340',
      'editorWidget.border': '#2e3a56',
      'minimap.background': background,
      'scrollbarSlider.background': '#2e3a5644',
      'scrollbarSlider.hoverBackground': `${accent}66`,
    },
  };
}

function makeTerminalTheme(mode: ThemeMode, background: string, foreground: string, accent: string): TerminalTheme {
  return mode === 'dark'
    ? {
        background,
        foreground,
        cursor: accent,
        cursorAccent: background,
        selectionBackground: `${accent}44`,
        selectionForeground: '#f0f2f8',
        black: '#2e3a56',
        red: '#ef5350',
        green: '#66bb6a',
        yellow: '#ffca28',
        blue: accent,
        magenta: '#ba68c8',
        cyan: '#4dd0e1',
        white: foreground,
        brightBlack: '#7a8ba5',
        brightRed: '#fc96ab',
        brightGreen: '#81c784',
        brightYellow: '#ffb342',
        brightBlue: '#6fb3f2',
        brightMagenta: '#ce93d8',
        brightCyan: '#80deea',
        brightWhite: '#f0f2f8',
      }
    : {
        background,
        foreground,
        cursor: accent,
        cursorAccent: background,
        selectionBackground: `${accent}44`,
        selectionForeground: '#1a2740',
        black: '#4b5a6f',
        red: '#e53935',
        green: '#2e7d32',
        yellow: '#e65100',
        blue: accent,
        magenta: '#8e24aa',
        cyan: '#00838f',
        white: '#87929e',
        brightBlack: '#68788f',
        brightRed: '#fc96ab',
        brightGreen: '#66bb6a',
        brightYellow: '#ffb342',
        brightBlue: accent,
        brightMagenta: '#ba68c8',
        brightCyan: '#4dd0e1',
        brightWhite: '#ffffff',
      };
}

export const BUILT_IN_THEMES: AppTheme[] = [
  {
    id: 'toki',
    label: '토키 (라이트)',
    mode: 'light',
    talkTitle: 'TokiTalk',
    defaultRpMode: 'toki',
    cssVariables: {
      '--bg-primary': '#f2f4f8',
      '--bg-secondary': '#ffffff',
      '--bg-tertiary': '#e8edf5',
      '--bg-hover': '#dce4f0',
      '--bg-active': '#4a90d9',
      '--text-primary': '#2b3a52',
      '--text-secondary': '#7a8ba5',
      '--text-highlight': '#1a2740',
      '--border-color': '#c8d6e5',
      '--accent': '#4a90d9',
      '--accent-hover': '#3a7bc8',
      '--accent-light': '#e3edf7',
      '--pink': '#f06292',
      '--pink-light': '#fce4ec',
      '--yellow': '#ffca28',
      '--panel-shadow': '0 2px 12px rgba(74, 144, 217, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)',
    },
    monaco: lightMonaco('#f7f9fc', '#2b3a52', '#4a90d9'),
    terminal: makeTerminalTheme('light', '#ffffff', '#2a323e', '#4a8ac6'),
  },
  {
    id: 'aris',
    label: '아리스 (다크)',
    mode: 'dark',
    talkTitle: 'ArisTalk',
    defaultRpMode: 'aris',
    cssVariables: {
      '--bg-primary': '#141a31',
      '--bg-secondary': '#1c2340',
      '--bg-tertiary': '#242c4a',
      '--bg-hover': '#2a3458',
      '--bg-active': '#4a90d9',
      '--text-primary': '#d8dce8',
      '--text-secondary': '#7a8ba5',
      '--text-highlight': '#f0f2f8',
      '--border-color': '#2e3a56',
      '--accent': '#4a90d9',
      '--accent-hover': '#3a7bc8',
      '--accent-light': '#1e2844',
      '--pink': '#f06292',
      '--pink-light': '#2a1e2e',
      '--yellow': '#ffca28',
      '--panel-shadow': '0 2px 12px rgba(74, 144, 217, 0.1), 0 1px 4px rgba(0, 0, 0, 0.2)',
    },
    monaco: darkMonaco('#181e34', '#d8dce8', '#4a90d9'),
    terminal: makeTerminalTheme('dark', '#141a31', '#d8dce8', '#4a90d9'),
  },
  {
    id: 'momotalk',
    label: '모모톡 (핑크 라이트)',
    mode: 'light',
    talkTitle: 'TokiTalk',
    defaultRpMode: 'toki',
    cssVariables: {
      '--bg-primary': '#fff5f8',
      '--bg-secondary': '#ffffff',
      '--bg-tertiary': '#ffe3ed',
      '--bg-hover': '#ffd4e3',
      '--bg-active': '#e85d8f',
      '--text-primary': '#493041',
      '--text-secondary': '#9b6f83',
      '--text-highlight': '#291823',
      '--border-color': '#f2b8cf',
      '--accent': '#e85d8f',
      '--accent-hover': '#cc4478',
      '--accent-light': '#ffe3ed',
      '--pink': '#fc96ab',
      '--pink-light': '#ffeaf0',
      '--yellow': '#f5b942',
      '--panel-shadow': '0 2px 12px rgba(232, 93, 143, 0.1), 0 1px 4px rgba(0, 0, 0, 0.04)',
    },
    monaco: lightMonaco('#fff9fb', '#493041', '#e85d8f'),
    terminal: makeTerminalTheme('light', '#ffffff', '#493041', '#e85d8f'),
  },
  {
    id: 'millennium',
    label: '밀레니엄 (시안 라이트)',
    mode: 'light',
    talkTitle: 'TokiTalk',
    defaultRpMode: 'toki',
    cssVariables: {
      '--bg-primary': '#eefbff',
      '--bg-secondary': '#ffffff',
      '--bg-tertiary': '#d7f4fb',
      '--bg-hover': '#c5edf7',
      '--bg-active': '#00a6c8',
      '--text-primary': '#17333d',
      '--text-secondary': '#5f8790',
      '--text-highlight': '#0d2229',
      '--border-color': '#aadbe5',
      '--accent': '#00a6c8',
      '--accent-hover': '#0088a6',
      '--accent-light': '#d7f4fb',
      '--pink': '#e76f9f',
      '--pink-light': '#ffe8f1',
      '--yellow': '#f4c542',
      '--panel-shadow': '0 2px 12px rgba(0, 166, 200, 0.1), 0 1px 4px rgba(0, 0, 0, 0.04)',
    },
    monaco: lightMonaco('#f7fdff', '#17333d', '#00a6c8'),
    terminal: makeTerminalTheme('light', '#ffffff', '#17333d', '#00a6c8'),
  },
  {
    id: 'gehenna',
    label: '게헨나 (레드 다크)',
    mode: 'dark',
    talkTitle: 'ArisTalk',
    defaultRpMode: 'aris',
    cssVariables: {
      '--bg-primary': '#1d1418',
      '--bg-secondary': '#2a1b20',
      '--bg-tertiary': '#38232a',
      '--bg-hover': '#49303a',
      '--bg-active': '#d04a55',
      '--text-primary': '#f2d8dc',
      '--text-secondary': '#b88991',
      '--text-highlight': '#fff2f4',
      '--border-color': '#5a343d',
      '--accent': '#d04a55',
      '--accent-hover': '#b83945',
      '--accent-light': '#40252d',
      '--pink': '#ff7896',
      '--pink-light': '#3b2029',
      '--yellow': '#ffc857',
      '--panel-shadow': '0 2px 12px rgba(208, 74, 85, 0.12), 0 1px 4px rgba(0, 0, 0, 0.24)',
    },
    monaco: darkMonaco('#21161a', '#f2d8dc', '#d04a55'),
    terminal: makeTerminalTheme('dark', '#1d1418', '#f2d8dc', '#d04a55'),
  },
  {
    id: 'trinity',
    label: '트리니티 (아이보리 골드)',
    mode: 'light',
    talkTitle: 'TokiTalk',
    defaultRpMode: 'toki',
    cssVariables: {
      '--bg-primary': '#f8f4e8',
      '--bg-secondary': '#fffdf8',
      '--bg-tertiary': '#efe4c9',
      '--bg-hover': '#e6d9b8',
      '--bg-active': '#b7892c',
      '--text-primary': '#413522',
      '--text-secondary': '#85745a',
      '--text-highlight': '#2b2113',
      '--border-color': '#d7c59e',
      '--accent': '#b7892c',
      '--accent-hover': '#966d1f',
      '--accent-light': '#efe4c9',
      '--pink': '#d46b8c',
      '--pink-light': '#f8e5eb',
      '--yellow': '#d6a92c',
      '--panel-shadow': '0 2px 12px rgba(183, 137, 44, 0.1), 0 1px 4px rgba(0, 0, 0, 0.04)',
    },
    monaco: lightMonaco('#fffdf8', '#413522', '#b7892c'),
    terminal: makeTerminalTheme('light', '#fffdf8', '#413522', '#b7892c'),
  },
];

const THEME_MAP = new Map<ThemeId, AppTheme>(BUILT_IN_THEMES.map((theme) => [theme.id, theme]));

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeThemeId(value: string | null | undefined, legacyDarkMode = false): ThemeId {
  if (value === 'custom') return 'custom';
  if (value && THEME_MAP.has(value as ThemeId)) return value as ThemeId;
  return legacyDarkMode ? 'aris' : 'toki';
}

export function normalizeCustomThemePalette(value: unknown): CustomThemePalette | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<CustomThemePalette>;
  for (const field of CUSTOM_THEME_FIELDS) {
    if (!isHexColor(source[field.key])) return null;
  }
  const background = source.background;
  const surface = source.surface;
  const text = source.text;
  const secondaryText = source.secondaryText;
  const accent = source.accent;
  const warning = source.warning;
  const pink = source.pink;
  const border = source.border;
  if (
    !isHexColor(background) ||
    !isHexColor(surface) ||
    !isHexColor(text) ||
    !isHexColor(secondaryText) ||
    !isHexColor(accent) ||
    !isHexColor(warning) ||
    !isHexColor(pink) ||
    !isHexColor(border)
  ) {
    return null;
  }
  return {
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim().slice(0, 40) : '커스텀',
    mode: source.mode === 'dark' ? 'dark' : 'light',
    background,
    surface,
    text,
    secondaryText,
    accent,
    warning,
    pink,
    border,
  };
}

export function parseCustomThemePalette(raw: string | null): CustomThemePalette | null {
  if (!raw) return null;
  try {
    return normalizeCustomThemePalette(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function createThemeFromCustomPalette(palette: CustomThemePalette | null): AppTheme {
  const normalized = normalizeCustomThemePalette(palette) ?? DEFAULT_CUSTOM_THEME_PALETTE;
  const mode = normalized.mode ?? 'light';
  const isDark = mode === 'dark';
  const cssVariables: ThemeCssVariables = {
    '--bg-primary': normalized.background,
    '--bg-secondary': normalized.surface,
    '--bg-tertiary': isDark ? '#242c4a' : '#e8edf5',
    '--bg-hover': isDark ? '#2a3458' : '#dce4f0',
    '--bg-active': normalized.accent,
    '--text-primary': normalized.text,
    '--text-secondary': normalized.secondaryText,
    '--text-highlight': isDark ? '#f0f2f8' : '#1a2740',
    '--border-color': normalized.border,
    '--accent': normalized.accent,
    '--accent-hover': normalized.accent,
    '--accent-light': isDark ? '#1e2844' : '#e3edf7',
    '--pink': normalized.pink,
    '--pink-light': isDark ? '#2a1e2e' : '#fce4ec',
    '--yellow': normalized.warning,
    '--panel-shadow': isDark
      ? '0 2px 12px rgba(0, 0, 0, 0.24), 0 1px 4px rgba(0, 0, 0, 0.2)'
      : '0 2px 12px rgba(74, 144, 217, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)',
  };
  return {
    id: 'custom',
    label: normalized.name || '커스텀',
    mode,
    talkTitle: isDark ? 'ArisTalk' : 'TokiTalk',
    defaultRpMode: isDark ? 'aris' : 'toki',
    cssVariables,
    monaco: isDark
      ? darkMonaco(normalized.background, normalized.text, normalized.accent)
      : lightMonaco(normalized.surface, normalized.text, normalized.accent),
    terminal: makeTerminalTheme(mode, normalized.surface, normalized.text, normalized.accent),
  };
}

export function getTheme(themeId: ThemeId, customPalette?: CustomThemePalette | null): AppTheme {
  if (themeId === 'custom') return createThemeFromCustomPalette(customPalette ?? null);
  return THEME_MAP.get(themeId) ?? THEME_MAP.get('toki')!;
}

export function isDarkTheme(themeId: ThemeId, customPalette?: CustomThemePalette | null): boolean {
  return getTheme(themeId, customPalette).mode === 'dark';
}

export function getDefaultRpModeForTheme(themeId: ThemeId, customPalette?: CustomThemePalette | null): 'toki' | 'aris' {
  return getTheme(themeId, customPalette).defaultRpMode;
}

export function getTalkTitleForTheme(themeId: ThemeId, customPalette?: CustomThemePalette | null): string {
  return getTheme(themeId, customPalette).talkTitle;
}

export function getRequiredCssVariables(): readonly string[] {
  return REQUIRED_CSS_VARIABLES;
}
