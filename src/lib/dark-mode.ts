import { syncBodyDarkMode } from './app-settings';
import { ensureBlueArchiveMonacoTheme } from './monaco-loader';

type MonacoWindow = Window & {
  _baDarkThemeDefined?: boolean;
  monaco?: {
    editor: {
      defineTheme: (name: string, theme: unknown) => void;
      setTheme: (name: string) => void;
    };
  };
};

const BLUE_ARCHIVE_DARK_THEME = {
  base: 'vs-dark',
  inherit: true,
  rules: [
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
  ],
  colors: {
    'editor.background': '#181e34',
    'editor.foreground': '#d8dce8',
    'editor.lineHighlightBackground': '#1e2844',
    'editor.selectionBackground': '#4a90d944',
    'editorCursor.foreground': '#4a90d9',
    'editorLineNumber.foreground': '#3a4a68',
    'editorLineNumber.activeForeground': '#4a90d9',
    'editorWidget.background': '#1c2340',
    'editorWidget.border': '#2e3a56',
    'minimap.background': '#141a31',
    'scrollbarSlider.background': '#2e3a5644',
    'scrollbarSlider.hoverBackground': '#4a90d966',
  }
};

/**
 * Define the Blue Archive dark Monaco theme.
 * No-ops if already defined or Monaco is not loaded yet.
 */
export function defineDarkMonacoTheme(): void {
  const w = window as unknown as MonacoWindow;
  if (w._baDarkThemeDefined) return;
  if (!w.monaco) return;
  ensureBlueArchiveMonacoTheme();
  w.monaco.editor.defineTheme('blue-archive-dark', BLUE_ARCHIVE_DARK_THEME);
  w._baDarkThemeDefined = true;
}

/**
 * Apply dark-mode CSS class on `document.body` and switch the global Monaco
 * editor theme.  The optional `options` bag is reserved for callers that hold
 * references to individual editor instances they want to update explicitly.
 */
export function applyDarkMode(enabled: boolean, options?: {
  editorInstance?: { updateOptions: (opts: unknown) => void } | null;
  formEditors?: Array<{ updateOptions: (opts: unknown) => void }>;
}): void {
  void options; // reserved for future per-instance updates
  syncBodyDarkMode(document.body, enabled);

  const w = window as unknown as MonacoWindow;
  if (w.monaco) {
    defineDarkMonacoTheme();
    w.monaco.editor.setTheme(enabled ? 'blue-archive-dark' : 'blue-archive');
  }
}
