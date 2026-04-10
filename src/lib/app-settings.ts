import { parseStoredJson, storedAvatarStateSchema, storedLayoutStateSchema } from './stored-state-validation';

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
  itemsVisible?: boolean;
  terminalVisible?: boolean;
  avatarVisible?: boolean;
  slotSizes?: Record<string, number>;
}

export interface AppSettingsSnapshot {
  darkMode: boolean;
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
  layoutState: 'toki-layout-state',
  rpCustom: 'toki-rp-custom',
  rpMode: 'toki-rp-mode',
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
  const darkMode = parseBoolean(target.getItem(STORAGE_KEYS.darkMode));

  return {
    darkMode,
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

export function writeDarkMode(darkMode: boolean, storage?: StorageLike): void {
  getDefaultStorage(storage).setItem(STORAGE_KEYS.darkMode, String(darkMode));
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
