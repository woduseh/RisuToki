import { parseStoredJson, storedAvatarStateSchema, storedLayoutStateSchema } from './stored-state-validation';
import {
  DEFAULT_CUSTOM_THEME_PALETTE,
  getDefaultRpModeForTheme,
  isDarkTheme,
  normalizeThemeId,
  parseCustomThemePalette,
  type CustomThemePalette,
  type ThemeId,
} from './theme-registry';

export type RpMode = 'off' | 'toki' | 'aris' | 'custom';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredAvatarState {
  src: string;
}

export interface StoredLayoutState {
  itemsPos?: string;
  refsPos?: string;
  terminalPos?: string;
  loreManagerPos?: string;
  assetManagerPos?: string;
  itemsVisible?: boolean;
  terminalVisible?: boolean;
  avatarVisible?: boolean;
  loreManagerVisible?: boolean;
  assetManagerVisible?: boolean;
  slotSizes?: Record<string, number>;
}

export interface AppSettingsSnapshot {
  darkMode: boolean;
  themeId: ThemeId;
  customTheme: CustomThemePalette | null;
  rpMode: RpMode;
  rpCustomText: string;
  bgmEnabled: boolean;
  bgmPath: string;
  autosaveEnabled: boolean;
  autosaveInterval: number;
  autosaveDir: string;
  avatarIdle: StoredAvatarState | null;
  avatarWorking: StoredAvatarState | null;
  layoutState: StoredLayoutState | null;
}

interface SettingsEventTarget {
  addEventListener(type: 'storage', listener: (event: StorageEvent) => void): void;
  removeEventListener(type: 'storage', listener: (event: StorageEvent) => void): void;
}

export const STORAGE_KEYS = {
  autosaveDir: 'toki-autosave-dir',
  autosaveEnabled: 'toki-autosave',
  autosaveInterval: 'toki-autosave-interval',
  avatarIdle: 'toki-avatar-idle',
  avatarWorking: 'toki-avatar-working',
  bgmEnabled: 'toki-bgm-enabled',
  bgmPath: 'toki-bgm-path',
  darkMode: 'toki-dark-mode',
  customTheme: 'toki-custom-theme',
  layoutState: 'toki-layout-state',
  rpCustom: 'toki-rp-custom',
  rpMode: 'toki-rp-mode',
  themeId: 'toki-theme-id',
} as const;

export const DEFAULT_AUTOSAVE_INTERVAL = 60_000;

function getDefaultStorage(storage?: StorageLike): StorageLike {
  if (storage) return storage;
  return window.localStorage;
}

function parseBoolean(value: string | null): boolean {
  return value === 'true';
}

function parseInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDefaultRpModeForDarkMode(darkMode: boolean): RpMode {
  return darkMode ? 'aris' : 'toki';
}

export function getDefaultRpModeForThemeId(themeId: ThemeId, customTheme?: CustomThemePalette | null): RpMode {
  return getDefaultRpModeForTheme(themeId, customTheme);
}

export function normalizeRpMode(value: string | null, darkMode: boolean): RpMode {
  if (value === 'true') {
    return getDefaultRpModeForDarkMode(darkMode);
  }

  if (value === 'toki' || value === 'aris' || value === 'custom') {
    return value;
  }

  return 'off';
}

export function readAppSettingsSnapshot(storage?: StorageLike): AppSettingsSnapshot {
  const target = getDefaultStorage(storage);
  const legacyDarkMode = parseBoolean(target.getItem(STORAGE_KEYS.darkMode));
  const themeId = normalizeThemeId(target.getItem(STORAGE_KEYS.themeId), legacyDarkMode);
  const customTheme = parseCustomThemePalette(target.getItem(STORAGE_KEYS.customTheme));
  const darkMode = isDarkTheme(themeId, customTheme);

  return {
    darkMode,
    themeId,
    customTheme,
    rpMode: normalizeRpMode(target.getItem(STORAGE_KEYS.rpMode), darkMode),
    rpCustomText: target.getItem(STORAGE_KEYS.rpCustom) || '',
    bgmEnabled: parseBoolean(target.getItem(STORAGE_KEYS.bgmEnabled)),
    bgmPath: target.getItem(STORAGE_KEYS.bgmPath) || '',
    autosaveEnabled: parseBoolean(target.getItem(STORAGE_KEYS.autosaveEnabled)),
    autosaveInterval: parseInteger(target.getItem(STORAGE_KEYS.autosaveInterval), DEFAULT_AUTOSAVE_INTERVAL),
    autosaveDir: target.getItem(STORAGE_KEYS.autosaveDir) || '',
    avatarIdle: parseStoredJson(target.getItem(STORAGE_KEYS.avatarIdle), storedAvatarStateSchema),
    avatarWorking: parseStoredJson(target.getItem(STORAGE_KEYS.avatarWorking), storedAvatarStateSchema),
    layoutState: parseStoredJson(target.getItem(STORAGE_KEYS.layoutState), storedLayoutStateSchema),
  };
}

export function readStoredLayoutState(storage?: StorageLike): StoredLayoutState | null {
  return parseStoredJson(getDefaultStorage(storage).getItem(STORAGE_KEYS.layoutState), storedLayoutStateSchema);
}

export function subscribeToAppSettings(
  listener: (snapshot: AppSettingsSnapshot) => void,
  options?: { storage?: StorageLike; eventTarget?: SettingsEventTarget | null },
): () => void {
  const target = options?.eventTarget ?? window;
  const storage = options?.storage;
  if (!target) return () => {};

  const onStorage = (): void => {
    listener(readAppSettingsSnapshot(storage));
  };

  target.addEventListener('storage', onStorage);
  return () => target.removeEventListener('storage', onStorage);
}

export function syncBodyDarkMode(body: HTMLElement, darkMode: boolean): void {
  body.classList.toggle('dark-mode', darkMode);
}

export function syncBodyTheme(body: HTMLElement, themeId: ThemeId, customTheme?: CustomThemePalette | null): void {
  body.dataset.theme = themeId;
  syncBodyDarkMode(body, isDarkTheme(themeId, customTheme));
}

export function writeDarkMode(darkMode: boolean, storage?: StorageLike): void {
  const target = getDefaultStorage(storage);
  target.setItem(STORAGE_KEYS.darkMode, String(darkMode));
  target.setItem(STORAGE_KEYS.themeId, darkMode ? 'aris' : 'toki');
}

export function writeThemeId(themeId: ThemeId, storage?: StorageLike): void {
  const target = getDefaultStorage(storage);
  target.setItem(STORAGE_KEYS.themeId, themeId);
  target.setItem(
    STORAGE_KEYS.darkMode,
    String(isDarkTheme(themeId, parseCustomThemePalette(target.getItem(STORAGE_KEYS.customTheme)))),
  );
}

export function writeCustomTheme(theme: CustomThemePalette | null, storage?: StorageLike): void {
  const target = getDefaultStorage(storage);
  if (!theme) {
    target.removeItem(STORAGE_KEYS.customTheme);
    return;
  }
  target.setItem(STORAGE_KEYS.customTheme, JSON.stringify(theme));
  if (target.getItem(STORAGE_KEYS.themeId) === 'custom') {
    target.setItem(STORAGE_KEYS.darkMode, String(isDarkTheme('custom', theme)));
  }
}

export function getDefaultCustomTheme(): CustomThemePalette {
  return { ...DEFAULT_CUSTOM_THEME_PALETTE };
}

export function writeRpMode(rpMode: RpMode, storage?: StorageLike): void {
  getDefaultStorage(storage).setItem(STORAGE_KEYS.rpMode, rpMode);
}

export function writeRpCustomText(text: string, storage?: StorageLike): void {
  getDefaultStorage(storage).setItem(STORAGE_KEYS.rpCustom, text);
}

export function writeBgmEnabled(enabled: boolean, storage?: StorageLike): void {
  getDefaultStorage(storage).setItem(STORAGE_KEYS.bgmEnabled, String(enabled));
}

export function writeBgmPath(path: string, storage?: StorageLike): void {
  getDefaultStorage(storage).setItem(STORAGE_KEYS.bgmPath, path);
}

export function writeAutosaveEnabled(enabled: boolean, storage?: StorageLike): void {
  getDefaultStorage(storage).setItem(STORAGE_KEYS.autosaveEnabled, String(enabled));
}

export function writeAutosaveInterval(interval: number, storage?: StorageLike): void {
  getDefaultStorage(storage).setItem(STORAGE_KEYS.autosaveInterval, String(interval));
}

export function writeAutosaveDir(path: string, storage?: StorageLike): void {
  getDefaultStorage(storage).setItem(STORAGE_KEYS.autosaveDir, path);
}

export function clearAutosaveDir(storage?: StorageLike): void {
  getDefaultStorage(storage).removeItem(STORAGE_KEYS.autosaveDir);
}

export function writeLayoutState(layoutState: StoredLayoutState, storage?: StorageLike): void {
  getDefaultStorage(storage).setItem(STORAGE_KEYS.layoutState, JSON.stringify(layoutState));
}

function writeAvatarState(key: string, value: StoredAvatarState | null, storage?: StorageLike): void {
  const target = getDefaultStorage(storage);
  if (!value) {
    target.removeItem(key);
    return;
  }

  target.setItem(key, JSON.stringify(value));
}

export function writeIdleAvatarState(value: StoredAvatarState | null, storage?: StorageLike): void {
  writeAvatarState(STORAGE_KEYS.avatarIdle, value, storage);
}

export function writeWorkingAvatarState(value: StoredAvatarState | null, storage?: StorageLike): void {
  writeAvatarState(STORAGE_KEYS.avatarWorking, value, storage);
}
