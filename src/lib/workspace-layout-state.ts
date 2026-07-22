import { defaultWorkspaceLayout, type WorkspaceLayoutStateV2 } from './workspace-model';

const STORAGE_KEY = 'toki-workspace-layout-v2';
const LEGACY_STORAGE_KEY = 'toki-layout-state';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

interface LegacyLayoutState {
  itemsPos?: string;
  terminalPos?: string;
  loreManagerPos?: string;
  assetManagerPos?: string;
  promptManagerPos?: string;
  itemsVisible?: boolean;
  terminalVisible?: boolean;
  avatarVisible?: boolean;
  loreManagerVisible?: boolean;
  assetManagerVisible?: boolean;
  promptManagerVisible?: boolean;
  slotSizes?: Record<string, unknown>;
}

export function migrateLegacyWorkspaceLayout(legacy: LegacyLayoutState | null): WorkspaceLayoutStateV2 {
  const fallback = defaultWorkspaceLayout();
  if (!legacy) return fallback;
  const sizes = legacy.slotSizes ?? {};
  const inspectorPosition =
    [legacy.loreManagerPos, legacy.assetManagerPos, legacy.promptManagerPos].find((position) =>
      ['left', 'right', 'far-left', 'far-right'].includes(position || ''),
    ) || 'right';
  const utilityPosition = ['top', 'bottom'].includes(legacy.terminalPos || '') ? legacy.terminalPos! : 'bottom';
  const managerVisibility = [legacy.loreManagerVisible, legacy.assetManagerVisible, legacy.promptManagerVisible];
  return {
    version: 2,
    navigatorWidth: clamp(sizes[legacy.itemsPos || 'left'], 220, 440, fallback.navigatorWidth),
    inspectorWidth: clamp(sizes[inspectorPosition], 260, 480, fallback.inspectorWidth),
    utilityHeight: clamp(sizes[utilityPosition], 130, 520, fallback.utilityHeight),
    navigatorVisible: legacy.itemsVisible ?? fallback.navigatorVisible,
    inspectorVisible: managerVisibility.some((visible) => visible === true)
      ? true
      : managerVisibility.some((visible) => visible === false)
        ? false
        : fallback.inspectorVisible,
    avatarVisible: legacy.avatarVisible ?? fallback.avatarVisible,
    referencesVisible: false,
    activeUtility: legacy.terminalVisible || legacy.avatarVisible ? 'terminal' : null,
  };
}

export function readWorkspaceLayoutState(
  storage: StorageLike | undefined = globalThis.localStorage,
): WorkspaceLayoutStateV2 {
  const fallback = defaultWorkspaceLayout();
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null') as Partial<WorkspaceLayoutStateV2> | null;
    if (!parsed || parsed.version !== 2) {
      const legacy = JSON.parse(storage?.getItem(LEGACY_STORAGE_KEY) || 'null') as LegacyLayoutState | null;
      return migrateLegacyWorkspaceLayout(legacy);
    }
    const persistedUtility = (parsed as { activeUtility?: unknown }).activeUtility;
    return {
      version: 2,
      navigatorWidth: clamp(parsed.navigatorWidth, 220, 440, fallback.navigatorWidth),
      inspectorWidth: clamp(parsed.inspectorWidth, 260, 480, fallback.inspectorWidth),
      utilityHeight: clamp(parsed.utilityHeight, 130, 520, fallback.utilityHeight),
      navigatorVisible: parsed.navigatorVisible ?? fallback.navigatorVisible,
      inspectorVisible: parsed.inspectorVisible ?? fallback.inspectorVisible,
      avatarVisible: parsed.avatarVisible ?? fallback.avatarVisible,
      referencesVisible:
        parsed.referencesVisible ?? (persistedUtility === 'references' ? true : fallback.referencesVisible),
      activeUtility: persistedUtility === 'terminal' || persistedUtility === 'avatar' ? 'terminal' : null,
    };
  } catch {
    return fallback;
  }
}

export function writeWorkspaceLayoutState(
  state: WorkspaceLayoutStateV2,
  storage: StorageLike | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Layout persistence must never block the editor.
  }
}
