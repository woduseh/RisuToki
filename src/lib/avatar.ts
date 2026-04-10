import { toMediaAsset } from './asset-runtime';

// Built-in avatar asset paths
export const RISU_IDLE = toMediaAsset('icon_risu.png');
export const RISU_DANCING = toMediaAsset('Dancing_risu.gif');
export const TOKI_IDLE = toMediaAsset('icon.png');
export const TOKI_CUTE = toMediaAsset('toki-cute.gif');
export const TOKI_DANCING = toMediaAsset('Dancing_toki.gif');

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
