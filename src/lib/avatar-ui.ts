import { readAppSettingsSnapshot, writeIdleAvatarState, writeWorkingAvatarState } from './app-settings';
import { TOKI_CUTE, getAvatarAssetsForTheme, getBuiltInAvatarOptions, loadAvatarImage } from './avatar';
import { getAvatarDialogueLine } from './avatar-dialogue';

// ==================== Dependency Injection ====================

export interface AvatarUIDeps {
  darkMode: boolean;
  setStatus: (msg: string) => void;
}

// ==================== Module State ====================

let tokiImg: HTMLImageElement | null = null;
let tokiCurrentSrc = '';
let tokiActive = false;

// Cached avatar DOM elements (populated on first setTokiActive call)
let _avatarEl: HTMLElement | null;
let _statusEl: HTMLElement | null;
let _statusIconEl: HTMLElement | null;
let _statusTextEl: HTMLElement | null;

// ==================== Public API ====================

function getConfiguredAvatarSource(active: boolean): string {
  const snapshot = readAppSettingsSnapshot();
  const saved = active ? snapshot.avatarWorking : snapshot.avatarIdle;
  if (saved) return saved.src;
  const assets = getAvatarAssetsForTheme(snapshot.themeId, snapshot.darkMode);
  return active ? assets.working : assets.idle;
}

/**
 * Load an image source into the avatar element, deduplicating unchanged loads.
 */
function loadTokiImage(src: string): void {
  const prevSrc = tokiCurrentSrc;
  tokiCurrentSrc = src;

  if (prevSrc === src && tokiImg && tokiImg.complete && tokiImg.naturalWidth > 0) return;

  loadAvatarImage(src, tokiImg);
}

/**
 * Initialise the avatar display: creates the <img>, loads the saved idle
 * image, sets the initial dialogue line, and wires the right-click picker.
 */
export function initTokiAvatar(container: HTMLElement, deps: AvatarUIDeps): void {
  const display = container.querySelector<HTMLElement>('#toki-avatar-display') ?? container;

  tokiImg = document.createElement('img');
  tokiImg.id = 'toki-img-source';
  tokiImg.style.cssText = 'width:100%;height:auto;';
  display.appendChild(tokiImg);

  tokiImg.addEventListener('error', () => {
    console.error('[Toki] Image load error:', tokiCurrentSrc);
  });

  // Load saved idle image or default
  const initialSnapshot = readAppSettingsSnapshot();
  loadTokiImage(getConfiguredAvatarSource(false));

  // Set initial dialogue
  const initStatusText = document.getElementById('toki-status-text');
  if (initStatusText) {
    initStatusText.textContent = getAvatarDialogueLine(initialSnapshot.themeId, initialSnapshot.darkMode, false);
  }

  // Right-click to switch avatar
  const avatar = document.getElementById('toki-avatar');
  if (avatar) {
    avatar.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      showAvatarPicker(deps);
    });
  }
}

// ==================== Avatar Picker Modal ====================

interface PickerImage {
  src: string;
  label: string;
}

const BUILT_IN_AVATAR_OPTIONS = getBuiltInAvatarOptions();
const PICKER_IDLE_IMAGES: readonly PickerImage[] = [
  ...BUILT_IN_AVATAR_OPTIONS.map(({ label, assets }) => ({ src: assets.idle, label })),
  { src: TOKI_CUTE, label: '토키 (cute)' },
];
const PICKER_WORKING_IMAGES: readonly PickerImage[] = BUILT_IN_AVATAR_OPTIONS.map(({ label, assets }) => ({
  src: assets.working,
  label,
}));

function makeCard(img: PickerImage, currentSrc: string, onClick: () => void): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText =
    'border:2px solid var(--border-color);border-radius:8px;padding:6px;cursor:pointer;text-align:center;transition:border-color 0.2s;';
  const preview = document.createElement('img');
  preview.src = img.src;
  preview.style.cssText = 'width:60px;height:60px;object-fit:contain;display:block;margin:0 auto 4px;';
  const lbl = document.createElement('div');
  lbl.style.cssText =
    'font-size:10px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;';
  lbl.textContent = img.label;
  card.appendChild(preview);
  card.appendChild(lbl);
  if (currentSrc === img.src) card.style.borderColor = 'var(--accent)';
  card.addEventListener('click', onClick);
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = 'var(--accent)';
  });
  card.addEventListener('mouseleave', () => {
    if (currentSrc !== img.src) card.style.borderColor = 'var(--border-color)';
  });
  return card;
}

function makeAddCard(onPick: () => void): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText =
    'border:2px dashed var(--border-color);border-radius:8px;padding:6px;cursor:pointer;text-align:center;transition:border-color 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80px;';
  card.innerHTML =
    '<div style="font-size:24px;color:var(--text-secondary);">+</div><div style="font-size:10px;color:var(--text-secondary);">이미지 추가</div>';
  card.addEventListener('click', onPick);
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = 'var(--accent)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = 'var(--border-color)';
  });
  return card;
}

/**
 * Show the avatar picker modal for idle / working images.
 */
function showAvatarPicker(deps: AvatarUIDeps): void {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
  const popup = document.createElement('div');
  popup.className = 'settings-popup';
  popup.style.cssText += 'width:520px;max-width:90vw;';

  const header = document.createElement('div');
  header.className = 'help-popup-header';
  header.innerHTML = '<span>아바타 이미지 선택</span>';
  const closeBtn = document.createElement('span');
  closeBtn.className = 'help-popup-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'help-popup-body';
  body.style.cssText = 'padding:12px;';

  const { avatarIdle: savedIdle, avatarWorking: savedWork } = readAppSettingsSnapshot();

  // === Section: 대기 이미지 ===
  const idleLabel = document.createElement('div');
  idleLabel.style.cssText = 'font-weight:700;font-size:12px;margin-bottom:8px;color:var(--text-primary);';
  idleLabel.textContent = '대기 이미지';
  body.appendChild(idleLabel);

  const idleGrid = document.createElement('div');
  idleGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;';
  const idleSrc = savedIdle ? savedIdle.src : tokiCurrentSrc || '';
  for (const img of PICKER_IDLE_IMAGES) {
    idleGrid.appendChild(
      makeCard(img, idleSrc, () => {
        writeIdleAvatarState({ src: img.src });
        if (!tokiActive) loadTokiImage(img.src);
        overlay.remove();
        deps.setStatus(`대기 이미지: ${img.label}`);
      }),
    );
  }
  idleGrid.appendChild(
    makeAddCard(async () => {
      const dataUri: string | undefined = await (
        window as unknown as { tokiAPI: { pickBgImage(): Promise<string | undefined> } }
      ).tokiAPI.pickBgImage();
      if (!dataUri) return;
      writeIdleAvatarState({ src: dataUri });
      if (!tokiActive) loadTokiImage(dataUri);
      overlay.remove();
      deps.setStatus('대기 이미지: 커스텀');
    }),
  );
  body.appendChild(idleGrid);

  // === Section: 작업중 이미지 ===
  const workLabel = document.createElement('div');
  workLabel.style.cssText = 'font-weight:700;font-size:12px;margin-bottom:8px;color:var(--text-primary);';
  workLabel.textContent = '작업중 이미지';
  body.appendChild(workLabel);

  const workGrid = document.createElement('div');
  workGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;';
  const workSrc = savedWork ? savedWork.src : '';
  for (const img of PICKER_WORKING_IMAGES) {
    workGrid.appendChild(
      makeCard(img, workSrc, () => {
        writeWorkingAvatarState({ src: img.src });
        if (tokiActive) loadTokiImage(img.src);
        overlay.remove();
        deps.setStatus(`작업중 이미지: ${img.label}`);
      }),
    );
  }
  workGrid.appendChild(
    makeAddCard(async () => {
      const dataUri: string | undefined = await (
        window as unknown as { tokiAPI: { pickBgImage(): Promise<string | undefined> } }
      ).tokiAPI.pickBgImage();
      if (!dataUri) return;
      writeWorkingAvatarState({ src: dataUri });
      if (tokiActive) loadTokiImage(dataUri);
      overlay.remove();
      deps.setStatus('작업중 이미지: 커스텀');
    }),
  );
  body.appendChild(workGrid);

  popup.appendChild(header);
  popup.appendChild(body);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === overlay) overlay.remove();
  });
}

/**
 * Toggle active/working state with animation and character dialogue.
 * Reads darkMode from stored app settings so the caller doesn't need to pass it.
 */
export function setTokiActive(active: boolean): void {
  if (!_avatarEl) {
    _avatarEl = document.getElementById('toki-avatar');
    _statusEl = document.getElementById('toki-status');
    _statusIconEl = document.getElementById('toki-status-icon');
    _statusTextEl = document.getElementById('toki-status-text');
  }
  const avatar = _avatarEl;
  const statusEl = _statusEl;
  const statusIcon = _statusIconEl;
  const statusText = _statusTextEl;
  const { darkMode, themeId } = readAppSettingsSnapshot();

  if (active && !tokiActive) {
    tokiActive = true;
    avatar?.classList.add('active');
    statusEl?.classList.add('working');
    if (statusIcon) statusIcon.textContent = '✨';
    loadTokiImage(getConfiguredAvatarSource(true));
    if (statusText) {
      statusText.textContent = getAvatarDialogueLine(themeId, darkMode, true);
    }
  } else if (!active && tokiActive) {
    tokiActive = false;
    avatar?.classList.remove('active');
    statusEl?.classList.remove('working');
    if (statusIcon) statusIcon.textContent = '💤';
    loadTokiImage(getConfiguredAvatarSource(false));
    if (statusText) {
      statusText.textContent = getAvatarDialogueLine(themeId, darkMode, false);
    }
  }
}

/**
 * Refresh avatar image and dialogue after a dark-mode toggle.
 * Called by the controller's refreshDarkModeUi.
 */
export function refreshAvatarForDarkMode(darkMode: boolean): void {
  const snapshot = readAppSettingsSnapshot();
  const statusText = document.getElementById('toki-status-text');
  if (statusText) {
    statusText.textContent = getAvatarDialogueLine(snapshot.themeId, darkMode, tokiActive);
  }

  if (tokiImg) {
    loadTokiImage(getConfiguredAvatarSource(tokiActive));
  }
}
