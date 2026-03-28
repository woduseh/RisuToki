import type { RpMode } from '../stores/app-store';
import {
  getDefaultRpModeForDarkMode,
  writeBgmEnabled,
  writeBgmPath,
  writeDarkMode,
  writeRpMode,
} from '../lib/app-settings';
import { applyDarkMode } from '../lib/dark-mode';
import { refreshAvatarForDarkMode } from '../lib/avatar-ui';
import { isBgmEnabled, initBgm as initBgmModule, pauseBgm, setBgmEnabled, setBgmFilePath } from '../lib/bgm';
import { setStatus } from '../lib/status-bar';
import { showSettingsPopup as renderSettingsPopup } from '../lib/settings-popup';

// ---------------------------------------------------------------------------
// RP Mode
// ---------------------------------------------------------------------------

export function getRpLabel(rpMode: string): string {
  if (rpMode === 'off') return 'OFF';
  if (rpMode === 'toki') return '토키';
  if (rpMode === 'aris') return '아리스';
  if (rpMode === 'custom') return '커스텀';
  if (rpMode === 'pluni') return '플루니 연구소';
  return 'OFF';
}

export function updateRpButtonStyle(btn: HTMLElement, rpMode: string): void {
  const isOn = rpMode !== 'off';
  btn.style.background = isOn ? 'rgba(255,255,255,0.5)' : '';
  btn.title = isOn ? `RP: ${getRpLabel(rpMode)} (클릭: OFF)` : 'RP 모드 OFF (클릭: ON)';
}

// ---------------------------------------------------------------------------
// BGM UI
// ---------------------------------------------------------------------------

export function updateBgmButtonStyle(btn: HTMLElement): void {
  const enabled = isBgmEnabled();
  btn.textContent = enabled ? '🔊' : '🔇';
  btn.title = enabled ? 'BGM ON (우클릭: 파일 변경)' : 'BGM OFF (우클릭: 파일 변경)';
  btn.style.background = enabled ? 'rgba(255,255,255,0.5)' : '';
}

export function initBgmUi(bgmEnabled: boolean, bgmPath: string): void {
  initBgmModule(bgmEnabled, bgmPath);

  const btn = document.getElementById('btn-bgm');
  if (!btn) return;

  updateBgmButtonStyle(btn);

  btn.addEventListener('click', () => {
    setBgmEnabled(!isBgmEnabled());
    writeBgmEnabled(isBgmEnabled());
    updateBgmButtonStyle(btn);
    if (!isBgmEnabled()) pauseBgm();
    setStatus(isBgmEnabled() ? 'BGM ON' : 'BGM OFF');
  });

  btn.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const filePath = await window.tokiAPI.pickBgm();
    if (!filePath) return;
    setBgmFilePath(filePath);
    writeBgmPath(filePath);
    setStatus(`BGM 변경: ${filePath.split(/[/\\]/).pop()}`);
  });
}

// ---------------------------------------------------------------------------
// RP Mode Button
// ---------------------------------------------------------------------------

export interface RpModeState {
  rpMode: RpMode;
  darkMode: boolean;
}

export function initRpModeButton(state: RpModeState, onUpdate: (mode: RpMode) => void): void {
  const btn = document.getElementById('btn-rp-mode');
  if (!btn) return;
  updateRpButtonStyle(btn, state.rpMode);

  btn.addEventListener('click', () => {
    let newMode: RpMode;
    if (state.rpMode === 'off') {
      newMode = getDefaultRpModeForDarkMode(state.darkMode) as RpMode;
    } else {
      newMode = 'off';
    }
    onUpdate(newMode);
    writeRpMode(newMode);
    updateRpButtonStyle(btn, newMode);
    setStatus(newMode === 'off' ? 'RP 모드 OFF' : `RP 모드 ON (${getRpLabel(newMode)}) — 다음 AI CLI 시작 시 적용`);
  });
}

// ---------------------------------------------------------------------------
// Dark Mode
// ---------------------------------------------------------------------------

export interface DarkModeDeps {
  getEditorInstance(): { updateOptions(opts: unknown): void } | null;
  getFormEditors(): Array<{ updateOptions(opts: unknown): void }>;
  getTerminal(): { options: { theme: unknown } } | null;
  getRpMode(): string;
  setRpMode(mode: string): void;
  termThemeDark: unknown;
  termThemeLight: unknown;
}

export function toggleDarkMode(darkMode: boolean, deps: DarkModeDeps): boolean {
  const next = !darkMode;
  writeDarkMode(next);
  refreshDarkModeUi(next, deps);
  setStatus(next ? '다크 모드 ON (Aris)' : '라이트 모드 ON (Toki)');
  return next;
}

export function refreshDarkModeUi(darkMode: boolean, deps: DarkModeDeps): void {
  applyDarkMode(darkMode, {
    editorInstance: deps.getEditorInstance(),
    formEditors: deps.getFormEditors(),
  });

  const titleEl = document.querySelector('.momo-title');
  if (titleEl) titleEl.textContent = darkMode ? 'ArisTalk' : 'TokiTalk';
  refreshAvatarForDarkMode(darkMode);

  const term = deps.getTerminal();
  if (term) {
    term.options.theme = darkMode ? deps.termThemeDark : deps.termThemeLight;
  }

  const rpMode = deps.getRpMode();
  if (rpMode === 'toki' || rpMode === 'aris') {
    const next = getDefaultRpModeForDarkMode(darkMode);
    deps.setRpMode(next);
    writeRpMode(next);
  }
  const rpBtn = document.getElementById('btn-rp-mode');
  if (rpBtn) updateRpButtonStyle(rpBtn, deps.getRpMode());
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
    darkMode: boolean;
    bgmEnabled: boolean;
    rpMode: string;
    rpCustomText: string;
    pluniCategory: string;
  };
  onAutosaveToggle(enabled: boolean): void;
  onAutosaveIntervalChange(interval: number): void;
  onPickAutosaveDir(): Promise<string | null>;
  onResetAutosaveDir(): void;
  onOpenAutosaveDir(): Promise<void>;
  onDarkModeToggle(): void;
  onBgmToggle(enabled: boolean): void;
  onRpModeChange(mode: string): void;
  onRpCustomTextChange(text: string): void;
  onOpenPersonaTab(name: string): Promise<void>;
  onPluniCategoryChange(category: string): void;
}

export function showSettingsPopup(deps: SettingsPopupDeps): void {
  const state = deps.getState();
  renderSettingsPopup(state, {
    onAutosaveToggle: deps.onAutosaveToggle,
    onAutosaveIntervalChange: deps.onAutosaveIntervalChange,
    onPickAutosaveDir: deps.onPickAutosaveDir,
    onResetAutosaveDir: deps.onResetAutosaveDir,
    onOpenAutosaveDir: deps.onOpenAutosaveDir,
    onDarkModeToggle: deps.onDarkModeToggle,
    onBgmToggle: deps.onBgmToggle,
    onRpModeChange: deps.onRpModeChange,
    onRpCustomTextChange: deps.onRpCustomTextChange,
    onOpenPersonaTab: deps.onOpenPersonaTab,
    onPluniCategoryChange: deps.onPluniCategoryChange,
  } as Parameters<typeof renderSettingsPopup>[1]);
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
