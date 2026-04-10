import { readAppSettingsSnapshot, writeIdleAvatarState, writeWorkingAvatarState } from './app-settings';
import { RISU_IDLE, RISU_DANCING, TOKI_IDLE, TOKI_CUTE, TOKI_DANCING, loadAvatarImage } from './avatar';

// ==================== Dialogue Lines ====================

const TOKI_IDLE_LINES = ['분부대로.', '완벽한 보좌를 약속드립니다.', '대기 중입니다.', '지시를 기다리겠습니다.'];
const TOKI_WORKING_LINES = [
  '신속히 처리하겠습니다.',
  '...집중하고 있습니다.',
  '작업 진행 중입니다.',
  '완벽하게 수행하겠습니다.',
];
const RISU_IDLE_LINES = [
  '오늘은 어떤 모험을 떠나실 건가요?',
  '아리스, 대기 중입니다!',
  '선생님! 지시를!',
  '다음 퀘스트는 뭔가요?',
];
const RISU_WORKING_LINES = [
  '아리스, 전력으로 갑니다!',
  '마력 충전 중...!',
  '퀘스트 진행 중입니다!',
  '빛이여, 힘을 빌려줘...!',
];

function randomLine(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ==================== Dependency Injection ====================

export interface AvatarUIDeps {
  darkMode: boolean;
  setStatus: (msg: string) => void;
}

// ==================== Module State ====================

let tokiImg: HTMLImageElement | null = null;
let tokiCurrentSrc: string = TOKI_IDLE;
let tokiActive = false;

// Cached avatar DOM elements (populated on first setTokiActive call)
let _avatarEl: HTMLElement | null;
let _statusEl: HTMLElement | null;
let _statusIconEl: HTMLElement | null;
let _statusTextEl: HTMLElement | null;

// ==================== Public API ====================

/**
 * Return a character dialogue line for the current dark-mode & active state.
 * Used by the controller's refreshDarkModeUi to update the status text.
 */
function getDialogueLine(darkMode: boolean, active: boolean): string {
  if (active) {
    return darkMode ? randomLine(RISU_WORKING_LINES) : randomLine(TOKI_WORKING_LINES);
  }
  return darkMode ? randomLine(RISU_IDLE_LINES) : randomLine(TOKI_IDLE_LINES);
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
  const savedIdleInit = readAppSettingsSnapshot().avatarIdle;
  if (savedIdleInit) {
    loadTokiImage(savedIdleInit.src);
  } else {
    loadTokiImage(deps.darkMode ? RISU_IDLE : TOKI_IDLE);
  }

  // Set initial dialogue
  const initStatusText = document.getElementById('toki-status-text');
  if (initStatusText) {
    initStatusText.textContent = deps.darkMode ? randomLine(RISU_IDLE_LINES) : randomLine(TOKI_IDLE_LINES);
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

const PICKER_IMAGES: readonly PickerImage[] = [
  { src: TOKI_IDLE, label: '토키 (기본)' },
  { src: TOKI_CUTE, label: '토키 (cute)' },
  { src: TOKI_DANCING, label: '토키 (dancing)' },
  { src: RISU_IDLE, label: '아리스 (기본)' },
  { src: RISU_DANCING, label: '아리스 (dancing)' },
];

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
  for (const img of PICKER_IMAGES) {
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
  for (const img of PICKER_IMAGES) {
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
  const { darkMode } = readAppSettingsSnapshot();

  if (active && !tokiActive) {
    tokiActive = true;
    avatar?.classList.add('active');
    statusEl?.classList.add('working');
    if (statusIcon) statusIcon.textContent = '✨';
    const savedWork = readAppSettingsSnapshot().avatarWorking;
    if (savedWork) {
      loadTokiImage(savedWork.src);
    } else if (darkMode) {
      loadTokiImage(RISU_DANCING);
    } else {
      loadTokiImage(TOKI_DANCING);
    }
    if (statusText) {
      statusText.textContent = darkMode ? randomLine(RISU_WORKING_LINES) : randomLine(TOKI_WORKING_LINES);
    }
  } else if (!active && tokiActive) {
    tokiActive = false;
    avatar?.classList.remove('active');
    statusEl?.classList.remove('working');
    if (statusIcon) statusIcon.textContent = '💤';
    const savedIdle = readAppSettingsSnapshot().avatarIdle;
    if (savedIdle) {
      loadTokiImage(savedIdle.src);
    } else if (darkMode) {
      loadTokiImage(RISU_IDLE);
    } else {
      loadTokiImage(TOKI_IDLE);
    }
    if (statusText) {
      statusText.textContent = darkMode ? randomLine(RISU_IDLE_LINES) : randomLine(TOKI_IDLE_LINES);
    }
  }
}

/**
 * Refresh avatar image and dialogue after a dark-mode toggle.
 * Called by the controller's refreshDarkModeUi.
 */
export function refreshAvatarForDarkMode(darkMode: boolean): void {
  const statusText = document.getElementById('toki-status-text');
  if (statusText) {
    statusText.textContent = getDialogueLine(darkMode, tokiActive);
  }

  if (tokiImg) {
    if (tokiActive) {
      loadTokiImage(darkMode ? RISU_DANCING : TOKI_DANCING);
    } else {
      loadTokiImage(darkMode ? RISU_IDLE : TOKI_IDLE);
    }
  }
}
