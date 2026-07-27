import { defaultWorkspaceLayout, type RightSidebarView, type WorkspaceLayoutStateV3 } from './workspace-model';

const STORAGE_KEY = 'toki-workspace-layout-v3';
const PREVIOUS_STORAGE_KEY = 'toki-workspace-layout-v2';
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

interface WorkspaceLayoutStateV2 {
  version?: 2;
  navigatorWidth?: number;
  inspectorWidth?: number;
  utilityHeight?: number;
  navigatorVisible?: boolean;
  inspectorVisible?: boolean;
  avatarVisible?: boolean;
  referencesVisible?: boolean;
  activeUtility?: unknown;
}

function normalizeRightSidebarView(value: unknown, fallback: RightSidebarView | null): RightSidebarView | null {
  return value === 'inspector' || value === 'guides' || value === 'references' || value === null ? value : fallback;
}

export function migrateWorkspaceLayoutV2(previous: WorkspaceLayoutStateV2 | null): WorkspaceLayoutStateV3 {
  const fallback = defaultWorkspaceLayout();
  if (!previous) return fallback;
  const persistedUtility = previous.activeUtility;
  const referencesVisible = previous.referencesVisible ?? (persistedUtility === 'references' ? true : false);
  return {
    version: 3,
    navigatorWidth: clamp(previous.navigatorWidth, 220, 440, fallback.navigatorWidth),
    inspectorWidth: clamp(previous.inspectorWidth, 260, 480, fallback.inspectorWidth),
    utilityHeight: clamp(previous.utilityHeight, 130, 520, fallback.utilityHeight),
    navigatorVisible: previous.navigatorVisible ?? fallback.navigatorVisible,
    avatarVisible: previous.avatarVisible ?? fallback.avatarVisible,
    rightSidebarView: referencesVisible ? 'references' : previous.inspectorVisible === false ? null : 'inspector',
    activeUtility: persistedUtility === 'terminal' || persistedUtility === 'avatar' ? 'terminal' : null,
  };
}

export function migrateLegacyWorkspaceLayout(legacy: LegacyLayoutState | null): WorkspaceLayoutStateV3 {
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
    version: 3,
    navigatorWidth: clamp(sizes[legacy.itemsPos || 'left'], 220, 440, fallback.navigatorWidth),
    inspectorWidth: clamp(sizes[inspectorPosition], 260, 480, fallback.inspectorWidth),
    utilityHeight: clamp(sizes[utilityPosition], 130, 520, fallback.utilityHeight),
    navigatorVisible: legacy.itemsVisible ?? fallback.navigatorVisible,
    avatarVisible: legacy.avatarVisible ?? fallback.avatarVisible,
    rightSidebarView: managerVisibility.some((visible) => visible === true)
      ? 'inspector'
      : managerVisibility.some((visible) => visible === false)
        ? null
        : fallback.rightSidebarView,
    activeUtility: legacy.terminalVisible || legacy.avatarVisible ? 'terminal' : null,
  };
}

export function readWorkspaceLayoutState(
  storage: StorageLike | undefined = globalThis.localStorage,
): WorkspaceLayoutStateV3 {
  const fallback = defaultWorkspaceLayout();
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null') as Partial<WorkspaceLayoutStateV3> | null;
    if (!parsed || parsed.version !== 3) {
      const previous = JSON.parse(storage?.getItem(PREVIOUS_STORAGE_KEY) || 'null') as WorkspaceLayoutStateV2 | null;
      if (previous?.version === 2) return migrateWorkspaceLayoutV2(previous);
      const legacy = JSON.parse(storage?.getItem(LEGACY_STORAGE_KEY) || 'null') as LegacyLayoutState | null;
      return migrateLegacyWorkspaceLayout(legacy);
    }
    const persistedUtility = (parsed as { activeUtility?: unknown }).activeUtility;
    return {
      version: 3,
      navigatorWidth: clamp(parsed.navigatorWidth, 220, 440, fallback.navigatorWidth),
      inspectorWidth: clamp(parsed.inspectorWidth, 260, 480, fallback.inspectorWidth),
      utilityHeight: clamp(parsed.utilityHeight, 130, 520, fallback.utilityHeight),
      navigatorVisible: parsed.navigatorVisible ?? fallback.navigatorVisible,
      avatarVisible: parsed.avatarVisible ?? fallback.avatarVisible,
      rightSidebarView: normalizeRightSidebarView(parsed.rightSidebarView, fallback.rightSidebarView),
      activeUtility: persistedUtility === 'terminal' || persistedUtility === 'avatar' ? 'terminal' : null,
    };
  } catch {
    return fallback;
  }
}

export function writeWorkspaceLayoutState(
  state: WorkspaceLayoutStateV3,
  storage: StorageLike | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Layout persistence must never block the editor.
  }
}
