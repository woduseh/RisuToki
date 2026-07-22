import { toMediaAsset } from './asset-runtime';
import type { ThemeId } from './theme-registry';

// Built-in avatar asset paths
export const RISU_IDLE = toMediaAsset('icon_risu.png');
export const RISU_DANCING = toMediaAsset('Dancing_risu.gif');
export const TOKI_IDLE = toMediaAsset('icon.png');
export const TOKI_CUTE = toMediaAsset('toki-cute.gif');
export const TOKI_DANCING = toMediaAsset('Dancing_toki.gif');

export interface AvatarAssetPair {
  idle: string;
  working: string;
}

const CHARACTER_AVATARS: Partial<Record<ThemeId, AvatarAssetPair>> = {
  toki: { idle: TOKI_IDLE, working: TOKI_DANCING },
  aris: { idle: RISU_IDLE, working: RISU_DANCING },
  kei: { idle: toMediaAsset('avatar-kei-idle.gif'), working: toMediaAsset('avatar-kei-working.gif') },
  yuzu: { idle: toMediaAsset('avatar-yuzu-idle.gif'), working: toMediaAsset('avatar-yuzu-working.gif') },
  midori: { idle: toMediaAsset('avatar-midori-idle.gif'), working: toMediaAsset('avatar-midori-working.gif') },
  momoi: { idle: toMediaAsset('avatar-momoi-idle.gif'), working: toMediaAsset('avatar-momoi-working.gif') },
  yuuka: { idle: toMediaAsset('avatar-yuuka-idle.gif'), working: toMediaAsset('avatar-yuuka-working.gif') },
  hina: { idle: toMediaAsset('avatar-hina-idle.gif'), working: toMediaAsset('avatar-hina-working.gif') },
  mika: { idle: toMediaAsset('avatar-mika-idle.gif'), working: toMediaAsset('avatar-mika-working.gif') },
  kisaki: { idle: toMediaAsset('avatar-kisaki-idle.gif'), working: toMediaAsset('avatar-kisaki-working.gif') },
};

export function getAvatarAssetsForTheme(themeId: ThemeId, darkMode: boolean): AvatarAssetPair {
  return CHARACTER_AVATARS[themeId] ?? (darkMode ? CHARACTER_AVATARS.aris! : CHARACTER_AVATARS.toki!);
}

export function getBuiltInAvatarOptions(): Array<{ id: string; label: string; assets: AvatarAssetPair }> {
  return [
    ['toki', '토키'],
    ['aris', '아리스'],
    ['kei', '케이'],
    ['yuzu', '유즈'],
    ['midori', '미도리'],
    ['momoi', '모모이'],
    ['yuuka', '유우카'],
    ['hina', '히나'],
    ['mika', '미카'],
    ['kisaki', '키사키'],
  ].map(([id, label]) => ({ id, label, assets: CHARACTER_AVATARS[id as ThemeId]! }));
}

/**
 * Load an arbitrary image source into an avatar element.
 * Forces GIF reload so the animation restarts from frame 1.
 */
export function loadAvatarImage(src: string, avatarEl: HTMLImageElement | null): void {
  if (!avatarEl) return;
  if (src.endsWith('.gif')) {
    avatarEl.src = '';
    avatarEl.src = src + '?t=' + Date.now();
  } else {
    avatarEl.src = src;
  }
}
