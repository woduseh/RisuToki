import { syncBodyTheme } from './app-settings';
import { ensureBlueArchiveMonacoTheme } from './monaco-loader';
import { getTheme, type CustomThemePalette, type ThemeId } from './theme-registry';

type MonacoWindow = Window & {
  _risutokiThemeDefinitions?: Set<string>;
  monaco?: {
    editor: {
      defineTheme: (name: string, theme: unknown) => void;
      setTheme: (name: string) => void;
    };
  };
};

export function defineAppMonacoTheme(themeId: ThemeId, customTheme?: CustomThemePalette | null): string {
  const w = window as unknown as MonacoWindow;
  const theme = getTheme(themeId, customTheme);
  const monacoThemeId = `risutoki-${theme.id}`;
  if (!w.monaco) return monacoThemeId;
  ensureBlueArchiveMonacoTheme();
  w._risutokiThemeDefinitions ??= new Set<string>();
  if (!w._risutokiThemeDefinitions.has(monacoThemeId)) {
    w.monaco.editor.defineTheme(monacoThemeId, theme.monaco);
    w._risutokiThemeDefinitions.add(monacoThemeId);
  }
  return monacoThemeId;
}

export function applyTheme(themeId: ThemeId, customTheme?: CustomThemePalette | null): void {
  const theme = getTheme(themeId, customTheme);
  syncBodyTheme(document.body, themeId, customTheme);
  for (const [key, value] of Object.entries(theme.cssVariables)) {
    document.body.style.setProperty(key, value);
  }

  const w = window as unknown as MonacoWindow;
  if (w.monaco) {
    w.monaco.editor.setTheme(defineAppMonacoTheme(themeId, customTheme));
  }
}
