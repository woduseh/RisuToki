import { toMediaAsset } from './asset-runtime';
import type { ThemeId } from './theme-registry';

// Keep the compact app mark separate from the full-body terminal avatar.
export const TOKI_APP_ICON = toMediaAsset('icon.png');
export const TOKI_CUTE = toMediaAsset('toki-cute.gif');

const TOKI_IDLE = toMediaAsset('avatar-toki-idle.webp');
const TOKI_WORKING = toMediaAsset('avatar-toki-working.webp');
const ARIS_IDLE = toMediaAsset('avatar-aris-idle.webp');
const ARIS_WORKING = toMediaAsset('avatar-aris-working.webp');

export interface AvatarAssetPair {
  idle: string;
  working: string;
}

const CHARACTER_AVATARS: Partial<Record<ThemeId, AvatarAssetPair>> = {
  toki: { idle: TOKI_IDLE, working: TOKI_WORKING },
  aris: { idle: ARIS_IDLE, working: ARIS_WORKING },
  kei: { idle: toMediaAsset('avatar-kei-idle.webp'), working: toMediaAsset('avatar-kei-working.webp') },
  yuzu: { idle: toMediaAsset('avatar-yuzu-idle.webp'), working: toMediaAsset('avatar-yuzu-working.webp') },
  midori: { idle: toMediaAsset('avatar-midori-idle.webp'), working: toMediaAsset('avatar-midori-working.webp') },
  momoi: { idle: toMediaAsset('avatar-momoi-idle.webp'), working: toMediaAsset('avatar-momoi-working.webp') },
  yuuka: { idle: toMediaAsset('avatar-yuuka-idle.webp'), working: toMediaAsset('avatar-yuuka-working.webp') },
  hina: { idle: toMediaAsset('avatar-hina-idle.webp'), working: toMediaAsset('avatar-hina-working.webp') },
  mika: { idle: toMediaAsset('avatar-mika-idle.webp'), working: toMediaAsset('avatar-mika-working.webp') },
  kisaki: { idle: toMediaAsset('avatar-kisaki-idle.webp'), working: toMediaAsset('avatar-kisaki-working.webp') },
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
 * Forces animated image reload so the animation restarts from frame 1.
 */
export function loadAvatarImage(src: string, avatarEl: HTMLImageElement | null): void {
  if (!avatarEl) return;
  if (/\.(?:gif|webp)(?:[?#].*)?$/i.test(src)) {
    avatarEl.src = '';
    avatarEl.src = `${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`;
  } else {
    avatarEl.src = src;
  }
}
