import { toMediaAsset } from './asset-runtime';

let bgmEnabled = false;
let bgmAudio: HTMLAudioElement | null = null;
let bgmFilePath = '';

let bgmSilenceTimer: ReturnType<typeof setTimeout> | null = null;
const BGM_SILENCE_MS = 3000;

let bgmBurstCount = 0;
let bgmBurstTimer: ReturnType<typeof setTimeout> | null = null;
const BGM_BURST_THRESHOLD = 3;
const BGM_BURST_WINDOW = 500;

/**
 * Initialise BGM state and create the `<audio>` element.
 * Call once during renderer init with the persisted settings values.
 */
export function initBgm(initialEnabled: boolean, initialPath: string): void {
  bgmEnabled = initialEnabled;
  bgmFilePath = !initialPath || initialPath === '../../assets/Usagi_Flap.mp3'
    ? toMediaAsset('Usagi_Flap.mp3')
    : initialPath;
  bgmAudio = new Audio(bgmFilePath);
  bgmAudio.loop = true;
  bgmAudio.volume = 0.3;
}

export function isBgmEnabled(): boolean {
  return bgmEnabled;
}

export function setBgmEnabled(enabled: boolean): void {
  bgmEnabled = enabled;
}

export function getBgmFilePath(): string {
  return bgmFilePath;
}

export function setBgmFilePath(path: string): void {
  bgmFilePath = path;
  if (bgmAudio) bgmAudio.src = path;
}

export function startBgm(): void {
  if (bgmAudio && bgmAudio.paused) {
    bgmAudio.play().catch(() => { /* autoplay blocked */ });
  }
}

export function stopBgm(): void {
  if (bgmAudio && !bgmAudio.paused) {
    bgmAudio.pause();
  }
  bgmBurstCount = 0;
  if (bgmSilenceTimer) { clearTimeout(bgmSilenceTimer); bgmSilenceTimer = null; }
  if (bgmBurstTimer) { clearTimeout(bgmBurstTimer); bgmBurstTimer = null; }
}

export function pauseBgm(): void {
  if (bgmAudio && !bgmAudio.paused) {
    bgmAudio.pause();
  }
}

export function resumeBgm(): void {
  if (bgmAudio && bgmAudio.paused) {
    bgmAudio.play().catch(() => { /* autoplay blocked */ });
  }
}

/**
 * Called on every terminal data event.  Uses burst-detection so that
 * short one-off events (shell prompt, etc.) do not trigger playback —
 * only sustained streaming output (e.g. Claude response) starts the music.
 */
export function handleTerminalDataForBgm(): void {
  if (!bgmEnabled || !bgmAudio) return;

  bgmBurstCount++;
  if (bgmBurstTimer) clearTimeout(bgmBurstTimer);
  bgmBurstTimer = setTimeout(() => { bgmBurstCount = 0; }, BGM_BURST_WINDOW);

  if (bgmBurstCount < BGM_BURST_THRESHOLD && bgmAudio.paused) return;

  if (bgmAudio.paused) {
    bgmAudio.play().catch(() => { /* autoplay blocked */ });
  }

  if (bgmSilenceTimer) clearTimeout(bgmSilenceTimer);
  bgmSilenceTimer = setTimeout(() => {
    if (bgmAudio && !bgmAudio.paused) {
      bgmAudio.pause();
    }
    bgmBurstCount = 0;
  }, BGM_SILENCE_MS);
}
