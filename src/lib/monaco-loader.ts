import { getMonacoBaseUrl, getMonacoLoaderUrl } from './asset-runtime';

type MonacoThemeRule = {
  background?: string;
  fontStyle?: string;
  foreground: string;
  token: string;
};

type MonacoThemeColors = Record<string, string>;

type MonacoEditor = {
  defineTheme: (name: string, theme: {
    base: string;
    colors: MonacoThemeColors;
    inherit: boolean;
    rules: MonacoThemeRule[];
  }) => void;
};

type MonacoRuntime = {
  editor: MonacoEditor;
};

type MonacoLoader = ((dependencies: string[], callback: () => void) => void) & {
  config: (options: { paths: { vs: string } }) => void;
};

type MonacoWindow = Window & {
  _baThemeDefined?: boolean;
  monaco?: MonacoRuntime;
  require?: MonacoLoader;
};

const BLUE_ARCHIVE_THEME = {
  base: 'vs',
  inherit: true,
  rules: [
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
    { token: 'attribute.value', foreground: '2e7d32' }
  ],
  colors: {
    'editor.background': '#f7f9fc',
    'editor.foreground': '#2b3a52',
    'editor.lineHighlightBackground': '#e3edf7',
    'editor.selectionBackground': '#b3d4fc',
    'editor.inactiveSelectionBackground': '#d6e4f0',
    'editorCursor.foreground': '#4a90d9',
    'editorLineNumber.foreground': '#a0b4cc',
    'editorLineNumber.activeForeground': '#4a90d9',
    'editor.findMatchBackground': '#ffca2855',
    'editor.findMatchHighlightBackground': '#ffca2833',
    'editorWidget.background': '#ffffff',
    'editorWidget.border': '#c8d6e5',
    'editorSuggestWidget.background': '#ffffff',
    'editorSuggestWidget.border': '#c8d6e5',
    'editorSuggestWidget.selectedBackground': '#e3edf7',
    'minimap.background': '#f2f4f8',
    'scrollbarSlider.background': '#c8d6e544',
    'scrollbarSlider.hoverBackground': '#4a90d966',
    'scrollbarSlider.activeBackground': '#4a90d9aa'
  }
} satisfies {
  base: string;
  colors: MonacoThemeColors;
  inherit: boolean;
  rules: MonacoThemeRule[];
};

let monacoLoadPromise: Promise<void> | null = null;

export function ensureBlueArchiveMonacoTheme(): void {
  const runtimeWindow = window as unknown as MonacoWindow;
  if (runtimeWindow._baThemeDefined) return;
  if (!runtimeWindow.monaco) {
    throw new Error('Monaco runtime is not available.');
  }
  runtimeWindow.monaco.editor.defineTheme('blue-archive', BLUE_ARCHIVE_THEME);
  runtimeWindow._baThemeDefined = true;
}

export async function loadMonacoRuntime(): Promise<void> {
  const runtimeWindow = window as unknown as MonacoWindow;
  if (runtimeWindow.monaco && runtimeWindow.require) {
    ensureBlueArchiveMonacoTheme();
    return;
  }

  if (!monacoLoadPromise) {
    monacoLoadPromise = new Promise<void>((resolve, reject) => {
      const loaderScript = document.createElement('script');
      loaderScript.src = getMonacoLoaderUrl();
      loaderScript.onload = () => {
        if (!runtimeWindow.require) {
          monacoLoadPromise = null;
          reject(new Error('Monaco AMD loader is not available.'));
          return;
        }

        runtimeWindow.require.config({ paths: { vs: getMonacoBaseUrl() } });
        runtimeWindow.require(['vs/editor/editor.main'], () => {
          try {
            ensureBlueArchiveMonacoTheme();
            resolve();
          } catch (error) {
            monacoLoadPromise = null;
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      };
      loaderScript.onerror = () => {
        monacoLoadPromise = null;
        reject(new Error('Failed to load Monaco loader.'));
      };
      document.head.appendChild(loaderScript);
    });
  }

  await monacoLoadPromise;
}
