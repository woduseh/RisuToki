import { toMediaAsset } from './asset-runtime';

// Built-in avatar asset paths
export const RISU_IDLE = toMediaAsset('icon_risu.png');
export const RISU_DANCING = toMediaAsset('Dancing_risu.gif');
export const TOKI_IDLE = toMediaAsset('icon.png');
export const TOKI_CUTE = toMediaAsset('toki-cute.gif');
export const TOKI_DANCING = toMediaAsset('Dancing_toki.gif');

export type AvatarState = 'idle' | 'dancing' | 'cute' | 'risu_idle' | 'risu_dancing';

const STATE_TO_SRC: Record<AvatarState, string> = {
  idle: TOKI_IDLE,
  dancing: TOKI_DANCING,
  cute: TOKI_CUTE,
  risu_idle: RISU_IDLE,
  risu_dancing: RISU_DANCING,
};

/**
 * Resolve a named avatar state to its image source path.
 */
export function resolveAvatarSrc(state: AvatarState): string {
  return STATE_TO_SRC[state];
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

/**
 * Update the avatar to a named state (idle, dancing, cute, risu_idle, risu_dancing).
 * Resolves the state to the built-in image path and loads it.
 */
export function updateAvatarState(state: AvatarState, avatarEl: HTMLImageElement | null): void {
  loadAvatarImage(resolveAvatarSrc(state), avatarEl);
}
