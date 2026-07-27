import { writeCustomTheme, writeThemeId } from '../lib/app-settings';
import type { McpApprovalMode } from '../lib/app-settings';
import { applyTheme } from '../lib/dark-mode';
import { refreshAvatarForDarkMode } from '../lib/avatar-ui';
import { setStatus } from '../lib/status-bar';
import { showSettingsPopup as renderSettingsPopup } from '../lib/settings-popup';
import { getTheme, isDarkTheme, type CustomThemePalette, type ThemeId } from '../lib/theme-registry';

export interface ThemeUiDeps {
  getEditorInstance(): { updateOptions(opts: unknown): void } | null;
  getFormEditors(): Array<{ updateOptions(opts: unknown): void }>;
  getTerminal(): { options: { theme: unknown } } | null;
}

export interface ThemeDeps extends ThemeUiDeps {
  getThemeId(): ThemeId;
  getCustomTheme(): CustomThemePalette | null;
  setThemeId(themeId: ThemeId): void;
  setCustomTheme(theme: CustomThemePalette | null): void;
}

export function changeTheme(themeId: ThemeId, deps: ThemeDeps): void {
  const customTheme = deps.getCustomTheme();
  deps.setThemeId(themeId);
  writeThemeId(themeId);
  refreshThemeUi(themeId, customTheme, deps);
  setStatus(`테마 변경: ${getTheme(themeId, customTheme).label}`);
}

export function updateCustomTheme(theme: CustomThemePalette | null, deps: ThemeDeps): void {
  deps.setCustomTheme(theme);
  writeCustomTheme(theme);
  if (deps.getThemeId() === 'custom') {
    refreshThemeUi('custom', theme, deps);
  }
}

export function refreshThemeUi(themeId: ThemeId, customTheme: CustomThemePalette | null, deps: ThemeUiDeps): void {
  const theme = getTheme(themeId, customTheme);
  applyTheme(themeId, customTheme, {
    editorInstance: deps.getEditorInstance(),
    formEditors: deps.getFormEditors(),
  });

  const titleEl = document.querySelector('.momo-title');
  if (titleEl) titleEl.textContent = theme.talkTitle;
  refreshAvatarForDarkMode(theme.mode === 'dark');

  const term = deps.getTerminal();
  if (term) {
    term.options.theme = theme.terminal;
  }

  void isDarkTheme(themeId, customTheme);
}

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

export interface AutosaveDeps {
  getAutosaveEnabled(): boolean;
  getAutosaveInterval(): number;
  getAutosaveDir(): string;
  getDirtyFieldCount(): number;
  getFileData(): Record<string, unknown> | null;
  collectDirtyFields(): Record<string, unknown>;
}

let autosaveTimer: ReturnType<typeof setInterval> | null = null;

export function startAutosave(deps: AutosaveDeps): void {
  stopAutosave();
  if (!deps.getAutosaveEnabled()) return;
  autosaveTimer = setInterval(async () => {
    if (deps.getDirtyFieldCount() === 0 || !deps.getFileData()) return;
    const filePath = await window.tokiAPI.getFilePath();
    if (!filePath && !deps.getAutosaveDir()) return;
    const updatedFields = deps.collectDirtyFields();
    if (deps.getAutosaveDir()) (updatedFields as Record<string, unknown>)._autosaveDir = deps.getAutosaveDir();
    const result = await window.tokiAPI.autosaveFile(updatedFields);
    if (result && result.success) {
      setStatus(`자동 저장됨: ${result.path?.split(/[/\\]/).pop()}`);
    }
  }, deps.getAutosaveInterval());
}

export function stopAutosave(): void {
  if (autosaveTimer) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Settings Popup
// ---------------------------------------------------------------------------

export interface SettingsPopupDeps {
  getState(): {
    autosaveEnabled: boolean;
    autosaveInterval: number;
    autosaveDir: string;
    themeId: ThemeId;
    customTheme: CustomThemePalette | null;
    bgmEnabled: boolean;
    rpMode: string;
    rpCustomText: string;
    mcpApprovalMode: McpApprovalMode;
    previewFocusByDefault: boolean;
  };
  onAutosaveToggle(enabled: boolean): void;
  onAutosaveIntervalChange(interval: number): void;
  onPickAutosaveDir(): Promise<string | null>;
  onResetAutosaveDir(): void;
  onOpenAutosaveDir(): Promise<void>;
  onThemeChange(themeId: ThemeId): void;
  onCustomThemeChange(theme: CustomThemePalette | null): void;
  onBgmToggle(enabled: boolean): void;
  onPickBgm(): Promise<string | null>;
  onRpModeChange(mode: string): void;
  onRpCustomTextChange(text: string): void;
  onMcpApprovalModeChange(mode: McpApprovalMode): void;
  onPreviewFocusByDefaultChange(enabled: boolean): void;
  onOpenPersonaTab(name: string): Promise<void>;
}

export function showSettingsPopup(deps: SettingsPopupDeps): void {
  const state = deps.getState();
  renderSettingsPopup(state, {
    onAutosaveToggle: deps.onAutosaveToggle,
    onAutosaveIntervalChange: deps.onAutosaveIntervalChange,
    onPickAutosaveDir: deps.onPickAutosaveDir,
    onResetAutosaveDir: deps.onResetAutosaveDir,
    onOpenAutosaveDir: deps.onOpenAutosaveDir,
    onThemeChange: deps.onThemeChange,
    onCustomThemeChange: deps.onCustomThemeChange,
    onBgmToggle: deps.onBgmToggle,
    onPickBgm: deps.onPickBgm,
    onRpModeChange: deps.onRpModeChange,
    onRpCustomTextChange: deps.onRpCustomTextChange,
    onMcpApprovalModeChange: deps.onMcpApprovalModeChange,
    onPreviewFocusByDefaultChange: deps.onPreviewFocusByDefaultChange,
    onOpenPersonaTab: deps.onOpenPersonaTab,
  });
}

// ---------------------------------------------------------------------------
// Terminal Background
// ---------------------------------------------------------------------------

export async function handleTerminalBg(): Promise<void> {
  const dataUrl = await window.tokiAPI.pickBgImage();
  const container = document.getElementById('terminal-container')!;
  if (dataUrl) {
    container.style.backgroundImage = `url("${dataUrl}")`;
    container.classList.add('has-bg');
  } else {
    container.style.backgroundImage = '';
    container.classList.remove('has-bg');
  }
}
