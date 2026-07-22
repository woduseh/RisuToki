import type { TerminalTheme } from './terminal-ui';

export type ThemeMode = 'light' | 'dark';
export type BuiltInThemeId =
  | 'toki'
  | 'aris'
  | 'kei'
  | 'yuzu'
  | 'midori'
  | 'momoi'
  | 'yuuka'
  | 'hina'
  | 'mika'
  | 'kisaki';
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

const BUILT_IN_THEME_ORDER: BuiltInThemeId[] = [
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
];

export const BUILT_IN_THEMES: AppTheme[] = (
  [
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
      id: 'momoi',
      label: '모모이 (피치 핑크)',
      mode: 'light',
      talkTitle: 'MomoiTalk',
      defaultRpMode: 'toki',
      cssVariables: {
        '--bg-primary': '#fff4f5',
        '--bg-secondary': '#fffafb',
        '--bg-tertiary': '#f9dfe5',
        '--bg-hover': '#f3cdd7',
        '--bg-active': '#e77f91',
        '--text-primary': '#3b3040',
        '--text-secondary': '#8e6b78',
        '--text-highlight': '#261d2b',
        '--border-color': '#ecc0cc',
        '--accent': '#e77f91',
        '--accent-hover': '#cf687c',
        '--accent-light': '#f9dfe5',
        '--pink': '#f39bad',
        '--pink-light': '#ffe7ec',
        '--yellow': '#f0c85a',
        '--panel-shadow': '0 2px 12px rgba(231, 127, 145, 0.12), 0 1px 4px rgba(59, 48, 64, 0.05)',
      },
      monaco: lightMonaco('#fffafb', '#3b3040', '#e77f91'),
      terminal: makeTerminalTheme('light', '#fffafb', '#3b3040', '#e77f91'),
    },
    {
      id: 'midori',
      label: '미도리 (세이지 그린)',
      mode: 'light',
      talkTitle: 'MidoriTalk',
      defaultRpMode: 'toki',
      cssVariables: {
        '--bg-primary': '#f2faf5',
        '--bg-secondary': '#fbfefc',
        '--bg-tertiary': '#dcefe3',
        '--bg-hover': '#cbe6d5',
        '--bg-active': '#4f9f72',
        '--text-primary': '#213a2d',
        '--text-secondary': '#648071',
        '--text-highlight': '#14281d',
        '--border-color': '#b9d9c4',
        '--accent': '#4f9f72',
        '--accent-hover': '#3d835c',
        '--accent-light': '#dcefe3',
        '--pink': '#e88ba6',
        '--pink-light': '#fbe5ec',
        '--yellow': '#e0b84f',
        '--panel-shadow': '0 2px 12px rgba(79, 159, 114, 0.11), 0 1px 4px rgba(33, 58, 45, 0.05)',
      },
      monaco: lightMonaco('#fbfefc', '#213a2d', '#4f9f72'),
      terminal: makeTerminalTheme('light', '#fbfefc', '#213a2d', '#4f9f72'),
    },
    {
      id: 'yuzu',
      label: '유즈 (소프트 오렌지)',
      mode: 'light',
      talkTitle: 'YuzuTalk',
      defaultRpMode: 'toki',
      cssVariables: {
        '--bg-primary': '#fff7ed',
        '--bg-secondary': '#fffdf9',
        '--bg-tertiary': '#fbe5cc',
        '--bg-hover': '#f4d6b4',
        '--bg-active': '#df843f',
        '--text-primary': '#422f24',
        '--text-secondary': '#8a6a56',
        '--text-highlight': '#2c1d15',
        '--border-color': '#e8c49f',
        '--accent': '#df843f',
        '--accent-hover': '#c66c2d',
        '--accent-light': '#fbe5cc',
        '--pink': '#d87891',
        '--pink-light': '#f8e4e9',
        '--yellow': '#e8aa3a',
        '--panel-shadow': '0 2px 12px rgba(223, 132, 63, 0.12), 0 1px 4px rgba(66, 47, 36, 0.05)',
      },
      monaco: lightMonaco('#fffdf9', '#422f24', '#df843f'),
      terminal: makeTerminalTheme('light', '#fffdf9', '#422f24', '#df843f'),
    },
    {
      id: 'yuuka',
      label: '유우카 (클리어 시안)',
      mode: 'light',
      talkTitle: 'YuukaTalk',
      defaultRpMode: 'toki',
      cssVariables: {
        '--bg-primary': '#eefbfc',
        '--bg-secondary': '#fbfeff',
        '--bg-tertiary': '#d8f1f4',
        '--bg-hover': '#c5e9ee',
        '--bg-active': '#1aa7b8',
        '--text-primary': '#17343e',
        '--text-secondary': '#577e89',
        '--text-highlight': '#0c252e',
        '--border-color': '#abd9df',
        '--accent': '#1aa7b8',
        '--accent-hover': '#128999',
        '--accent-light': '#d8f1f4',
        '--pink': '#dd789d',
        '--pink-light': '#ffe8f1',
        '--yellow': '#e5bc4e',
        '--panel-shadow': '0 2px 12px rgba(26, 167, 184, 0.11), 0 1px 4px rgba(23, 52, 62, 0.05)',
      },
      monaco: lightMonaco('#fbfeff', '#17343e', '#1aa7b8'),
      terminal: makeTerminalTheme('light', '#fbfeff', '#17343e', '#1aa7b8'),
    },
    {
      id: 'hina',
      label: '히나 (플럼 크림슨)',
      mode: 'dark',
      talkTitle: 'HinaTalk',
      defaultRpMode: 'aris',
      cssVariables: {
        '--bg-primary': '#18131b',
        '--bg-secondary': '#241b28',
        '--bg-tertiary': '#332436',
        '--bg-hover': '#443048',
        '--bg-active': '#d95a72',
        '--text-primary': '#f1e7ee',
        '--text-secondary': '#b49baa',
        '--text-highlight': '#fff7fb',
        '--border-color': '#50394f',
        '--accent': '#d95a72',
        '--accent-hover': '#bd445d',
        '--accent-light': '#402735',
        '--pink': '#ee7891',
        '--pink-light': '#39212e',
        '--yellow': '#e4c46d',
        '--panel-shadow': '0 2px 14px rgba(217, 90, 114, 0.13), 0 1px 5px rgba(0, 0, 0, 0.28)',
      },
      monaco: darkMonaco('#1c151f', '#f1e7ee', '#d95a72'),
      terminal: makeTerminalTheme('dark', '#18131b', '#f1e7ee', '#d95a72'),
    },
    {
      id: 'mika',
      label: '미카 (아이보리 골드)',
      mode: 'light',
      talkTitle: 'MikaTalk',
      defaultRpMode: 'toki',
      cssVariables: {
        '--bg-primary': '#faf6ed',
        '--bg-secondary': '#fffdf9',
        '--bg-tertiary': '#f2e6cb',
        '--bg-hover': '#eadabb',
        '--bg-active': '#c59338',
        '--text-primary': '#413527',
        '--text-secondary': '#826f5c',
        '--text-highlight': '#2b2115',
        '--border-color': '#dcc89c',
        '--accent': '#c59338',
        '--accent-hover': '#a97729',
        '--accent-light': '#f2e6cb',
        '--pink': '#d97fa2',
        '--pink-light': '#f8e5eb',
        '--yellow': '#d9aa39',
        '--panel-shadow': '0 2px 12px rgba(197, 147, 56, 0.11), 0 1px 4px rgba(65, 53, 39, 0.05)',
      },
      monaco: lightMonaco('#fffdf9', '#413527', '#c59338'),
      terminal: makeTerminalTheme('light', '#fffdf9', '#413527', '#c59338'),
    },
    {
      id: 'kei',
      label: '케이 (화이트 레드)',
      mode: 'light',
      talkTitle: 'KeiTalk',
      defaultRpMode: 'toki',
      cssVariables: {
        '--bg-primary': '#f5f7fa',
        '--bg-secondary': '#ffffff',
        '--bg-tertiary': '#e9edf3',
        '--bg-hover': '#dde3eb',
        '--bg-active': '#d84c57',
        '--text-primary': '#252b36',
        '--text-secondary': '#707987',
        '--text-highlight': '#151a22',
        '--border-color': '#ccd3dd',
        '--accent': '#d84c57',
        '--accent-hover': '#ba3843',
        '--accent-light': '#f8e2e5',
        '--pink': '#e46a82',
        '--pink-light': '#fae7eb',
        '--yellow': '#d9a83f',
        '--panel-shadow': '0 2px 12px rgba(216, 76, 87, 0.1), 0 1px 4px rgba(37, 43, 54, 0.06)',
      },
      monaco: lightMonaco('#ffffff', '#252b36', '#d84c57'),
      terminal: makeTerminalTheme('light', '#ffffff', '#252b36', '#d84c57'),
    },
    {
      id: 'kisaki',
      label: '키사키 (먹빛 청옥)',
      mode: 'dark',
      talkTitle: 'KisakiTalk',
      defaultRpMode: 'aris',
      cssVariables: {
        '--bg-primary': '#111318',
        '--bg-secondary': '#191c22',
        '--bg-tertiary': '#242830',
        '--bg-hover': '#2d323b',
        '--bg-active': '#35969b',
        '--text-primary': '#ece8df',
        '--text-secondary': '#aaa69f',
        '--text-highlight': '#fffdf8',
        '--border-color': '#3a4049',
        '--accent': '#35969b',
        '--accent-hover': '#287b80',
        '--accent-light': '#19363a',
        '--pink': '#6ba8bd',
        '--pink-light': '#1b3038',
        '--yellow': '#c9a45f',
        '--panel-shadow': '0 2px 14px rgba(53, 150, 155, 0.12), 0 1px 5px rgba(0, 0, 0, 0.32)',
      },
      monaco: darkMonaco('#14171c', '#ece8df', '#35969b'),
      terminal: makeTerminalTheme('dark', '#111318', '#ece8df', '#35969b'),
    },
  ] satisfies AppTheme[]
).sort(
  (left, right) =>
    BUILT_IN_THEME_ORDER.indexOf(left.id as BuiltInThemeId) - BUILT_IN_THEME_ORDER.indexOf(right.id as BuiltInThemeId),
);

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
