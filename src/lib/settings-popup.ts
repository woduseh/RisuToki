import {
  BUILT_IN_THEMES,
  CUSTOM_THEME_FIELDS,
  DEFAULT_CUSTOM_THEME_PALETTE,
  normalizeCustomThemePalette,
  type CustomThemePalette,
  type ThemeId,
} from './theme-registry';

/**
 * Settings popup dialog.
 *
 * Extracted from controller.js.  All external state is injected via
 * {@link SettingsState} (current values) and {@link SettingsCallbacks}
 * (side-effect handlers), keeping this module free of global references.
 */

export interface SettingsState {
  autosaveEnabled: boolean;
  autosaveInterval: number;
  autosaveDir: string;
  darkMode: boolean;
  themeId: ThemeId;
  customTheme: CustomThemePalette | null;
  bgmEnabled: boolean;
  rpMode: string;
  rpCustomText: string;
}

export interface SettingsCallbacks {
  onAutosaveToggle(enabled: boolean): void;
  onAutosaveIntervalChange(interval: number): void;
  onPickAutosaveDir(): Promise<string | null>;
  onResetAutosaveDir(): void;
  onOpenAutosaveDir(): Promise<void>;
  onDarkModeToggle(): void;
  onThemeChange(themeId: ThemeId): void;
  onCustomThemeChange(theme: CustomThemePalette | null): void;
  onBgmToggle(enabled: boolean): void;
  onRpModeChange(mode: string): void;
  onRpCustomTextChange(text: string): void;
  onOpenPersonaTab(name: string): Promise<void>;
}

let closeSettingsOverlay: (() => void) | null = null;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && !isHiddenFromKeyboard(element, root),
  );
}

function isHiddenFromKeyboard(element: HTMLElement, root: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true' || current.style.display === 'none')
      return true;
    current = current.parentElement;
  }
  return false;
}

function trapTabKey(event: KeyboardEvent, dialog: HTMLElement): void {
  const focusable = getFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !dialog.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last || !dialog.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

function createToggle(isOn: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'settings-toggle' + (isOn ? ' on' : '');
  btn.addEventListener('click', () => btn.classList.toggle('on'));
  return btn;
}

export function showSettingsPopup(state: SettingsState, callbacks: SettingsCallbacks): void {
  const existing = document.querySelector('.help-popup-overlay.settings-overlay');
  if (existing && closeSettingsOverlay) {
    closeSettingsOverlay();
    return;
  }
  if (!existing) {
    closeSettingsOverlay = null;
  }

  const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const overlay = document.createElement('div');
  overlay.className = 'help-popup-overlay settings-overlay';
  overlay.dataset.overlay = 'settings';

  const popup = document.createElement('div');
  popup.className = 'settings-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'true');
  popup.setAttribute('aria-label', '설정');
  popup.tabIndex = -1;

  const header = document.createElement('div');
  header.className = 'help-popup-header';
  const title = document.createElement('span');
  title.textContent = '⚙ 설정';
  header.appendChild(title);
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', '닫기');
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'help-popup-body';
  body.style.padding = '16px';

  // --- Autosave ON/OFF ---
  const autoRow = document.createElement('div');
  autoRow.className = 'settings-row';
  const autoLeft = document.createElement('div');
  autoLeft.innerHTML =
    '<div class="settings-label">자동 저장</div><div class="settings-desc">일정 간격으로 임시 파일에 저장</div>';
  const autoToggle = createToggle(state.autosaveEnabled);
  autoToggle.addEventListener('click', () => {
    callbacks.onAutosaveToggle(autoToggle.classList.contains('on'));
  });
  autoRow.appendChild(autoLeft);
  autoRow.appendChild(autoToggle);
  body.appendChild(autoRow);

  // --- Autosave Interval ---
  const intervalRow = document.createElement('div');
  intervalRow.className = 'settings-row';
  const intervalLeft = document.createElement('div');
  intervalLeft.innerHTML =
    '<div class="settings-label">저장 간격</div><div class="settings-desc">자동 저장 실행 주기</div>';
  const intervalSelect = document.createElement('select');
  intervalSelect.className = 'settings-select';
  const intervals = [
    { value: 60000, label: '1분' },
    { value: 300000, label: '5분' },
    { value: 600000, label: '10분' },
    { value: 1200000, label: '20분' },
    { value: 1800000, label: '30분' },
  ];
  for (const iv of intervals) {
    const opt = document.createElement('option');
    opt.value = String(iv.value);
    opt.textContent = iv.label;
    if (state.autosaveInterval === iv.value) opt.selected = true;
    intervalSelect.appendChild(opt);
  }
  intervalSelect.addEventListener('change', () => {
    callbacks.onAutosaveIntervalChange(parseInt(intervalSelect.value, 10));
  });
  intervalRow.appendChild(intervalLeft);
  intervalRow.appendChild(intervalSelect);
  body.appendChild(intervalRow);

  // --- Autosave Location ---
  const autoPathRow = document.createElement('div');
  autoPathRow.className = 'settings-row';
  autoPathRow.style.cssText = 'flex-direction:column;align-items:stretch;gap:4px;';
  const autoPathLabel = document.createElement('div');
  autoPathLabel.innerHTML =
    '<div class="settings-label">저장 위치</div><div class="settings-desc">비어있으면 파일과 같은 폴더에 저장</div>';
  const autoPathDisplay = document.createElement('div');
  autoPathDisplay.style.cssText =
    'font-size:11px;color:var(--text-secondary);word-break:break-all;padding:4px 6px;background:var(--bg-tertiary);border-radius:4px;min-height:18px;';
  autoPathDisplay.textContent = state.autosaveDir || '(파일과 같은 폴더)';
  const autoPathBtns = document.createElement('div');
  autoPathBtns.style.cssText = 'display:flex;gap:6px;margin-top:2px;';
  const pickDirBtn = document.createElement('button');
  pickDirBtn.className = 'settings-btn';
  pickDirBtn.textContent = '폴더 선택';
  pickDirBtn.addEventListener('click', async () => {
    const dir = await callbacks.onPickAutosaveDir();
    if (dir) {
      autoPathDisplay.textContent = dir;
    }
  });
  const resetDirBtn = document.createElement('button');
  resetDirBtn.className = 'settings-btn';
  resetDirBtn.textContent = '초기화';
  resetDirBtn.addEventListener('click', () => {
    callbacks.onResetAutosaveDir();
    autoPathDisplay.textContent = '(파일과 같은 폴더)';
  });
  const openDirBtn = document.createElement('button');
  openDirBtn.className = 'settings-btn';
  openDirBtn.textContent = '폴더 열기';
  openDirBtn.addEventListener('click', () => void callbacks.onOpenAutosaveDir());
  autoPathBtns.appendChild(pickDirBtn);
  autoPathBtns.appendChild(resetDirBtn);
  autoPathBtns.appendChild(openDirBtn);
  autoPathRow.appendChild(autoPathLabel);
  autoPathRow.appendChild(autoPathDisplay);
  autoPathRow.appendChild(autoPathBtns);
  body.appendChild(autoPathRow);

  // --- Theme Preset ---
  const themeRow = document.createElement('div');
  themeRow.className = 'settings-row';
  const themeLeft = document.createElement('div');
  themeLeft.innerHTML =
    '<div class="settings-label">테마</div><div class="settings-desc">프리셋 또는 커스텀 팔레트</div>';
  const themeSelect = document.createElement('select');
  themeSelect.className = 'settings-select';
  const themeOptions = [
    ...BUILT_IN_THEMES.map((theme) => ({ value: theme.id, label: theme.label })),
    { value: 'custom', label: '커스텀' },
  ];
  for (const opt of themeOptions) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === state.themeId) o.selected = true;
    themeSelect.appendChild(o);
  }
  themeRow.appendChild(themeLeft);
  themeRow.appendChild(themeSelect);
  body.appendChild(themeRow);

  const customThemeRow = document.createElement('div');
  customThemeRow.className = 'settings-row custom-theme-row';
  customThemeRow.style.cssText = 'flex-direction:column;align-items:stretch;gap:8px;';
  if (state.themeId !== 'custom') customThemeRow.style.display = 'none';
  const customThemeLabel = document.createElement('div');
  customThemeLabel.innerHTML = '<div class="settings-label">커스텀 팔레트</div>';
  customThemeRow.appendChild(customThemeLabel);

  let customThemeDraft = normalizeCustomThemePalette(state.customTheme) ?? { ...DEFAULT_CUSTOM_THEME_PALETTE };
  const modeSelect = document.createElement('select');
  modeSelect.className = 'settings-select';
  for (const opt of [
    { value: 'light', label: '라이트' },
    { value: 'dark', label: '다크' },
  ]) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (customThemeDraft.mode === opt.value) o.selected = true;
    modeSelect.appendChild(o);
  }
  modeSelect.addEventListener('change', () => {
    customThemeDraft = { ...customThemeDraft, mode: modeSelect.value === 'dark' ? 'dark' : 'light' };
    callbacks.onCustomThemeChange(customThemeDraft);
  });
  customThemeRow.appendChild(modeSelect);

  const swatchGrid = document.createElement('div');
  swatchGrid.className = 'custom-theme-grid';
  for (const field of CUSTOM_THEME_FIELDS) {
    const fieldWrap = document.createElement('label');
    fieldWrap.className = 'custom-theme-field';
    const label = document.createElement('span');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = customThemeDraft[field.key];
    input.addEventListener('input', () => {
      customThemeDraft = { ...customThemeDraft, [field.key]: input.value };
      callbacks.onCustomThemeChange(customThemeDraft);
    });
    fieldWrap.appendChild(label);
    fieldWrap.appendChild(input);
    swatchGrid.appendChild(fieldWrap);
  }
  customThemeRow.appendChild(swatchGrid);

  const customThemeBtns = document.createElement('div');
  customThemeBtns.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;';
  const resetThemeBtn = document.createElement('button');
  resetThemeBtn.className = 'settings-btn';
  resetThemeBtn.textContent = '초기화';
  resetThemeBtn.addEventListener('click', () => {
    customThemeDraft = { ...DEFAULT_CUSTOM_THEME_PALETTE };
    callbacks.onCustomThemeChange(customThemeDraft);
    close();
    showSettingsPopup({ ...state, themeId: 'custom', customTheme: customThemeDraft }, callbacks);
  });
  customThemeBtns.appendChild(resetThemeBtn);
  customThemeRow.appendChild(customThemeBtns);
  body.appendChild(customThemeRow);

  themeSelect.addEventListener('change', () => {
    const nextThemeId = themeSelect.value as ThemeId;
    callbacks.onThemeChange(nextThemeId);
    customThemeRow.style.display = nextThemeId === 'custom' ? '' : 'none';
  });

  // --- BGM ---
  const bgmRow = document.createElement('div');
  bgmRow.className = 'settings-row';
  const bgmLeft = document.createElement('div');
  bgmLeft.innerHTML =
    '<div class="settings-label">BGM</div><div class="settings-desc">터미널 응답 시 배경음악 재생</div>';
  const bgmToggle = createToggle(state.bgmEnabled);
  bgmToggle.addEventListener('click', () => {
    callbacks.onBgmToggle(bgmToggle.classList.contains('on'));
  });
  bgmRow.appendChild(bgmLeft);
  bgmRow.appendChild(bgmToggle);
  body.appendChild(bgmRow);

  // --- RP Mode (dropdown + custom editor) ---
  const rpRow = document.createElement('div');
  rpRow.className = 'settings-row';
  const rpLeft = document.createElement('div');
  rpLeft.innerHTML = `<div class="settings-label">RP 모드</div><div class="settings-desc">AI CLI 응답에 캐릭터 페르소나 적용</div>`;
  const rpSelect = document.createElement('select');
  rpSelect.className = 'settings-select';
  const rpOptions = [
    { value: 'off', label: 'OFF' },
    { value: 'toki', label: '토키 (라이트)' },
    { value: 'aris', label: '아리스 (다크)' },
    { value: 'custom', label: '커스텀' },
  ];
  for (const opt of rpOptions) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === state.rpMode) o.selected = true;
    rpSelect.appendChild(o);
  }
  rpRow.appendChild(rpLeft);
  rpRow.appendChild(rpSelect);
  body.appendChild(rpRow);

  // Custom persona textarea (shown only when 'custom' selected)
  const rpCustomRow = document.createElement('div');
  rpCustomRow.className = 'settings-row';
  rpCustomRow.style.cssText = 'flex-direction:column;align-items:stretch;gap:6px;';
  if (state.rpMode !== 'custom') rpCustomRow.style.display = 'none';
  const rpCustomLabel = document.createElement('div');
  rpCustomLabel.innerHTML = '<div class="settings-label">커스텀 페르소나</div>';
  const rpCustomArea = document.createElement('textarea');
  rpCustomArea.className = 'settings-textarea';
  rpCustomArea.rows = 8;
  rpCustomArea.placeholder = '캐릭터 페르소나를 직접 작성하세요...';
  rpCustomArea.value = state.rpCustomText;
  rpCustomRow.appendChild(rpCustomLabel);
  rpCustomRow.appendChild(rpCustomArea);
  body.appendChild(rpCustomRow);

  // Preview/edit built-in persona button (hidden for 'off', 'custom')
  const rpEditRow = document.createElement('div');
  rpEditRow.className = 'settings-row';
  rpEditRow.style.cssText = 'justify-content:flex-end;';
  const shouldShowEdit = state.rpMode === 'toki' || state.rpMode === 'aris';
  if (!shouldShowEdit) rpEditRow.style.display = 'none';
  const rpEditBtn = document.createElement('button');
  rpEditBtn.className = 'settings-btn';
  rpEditBtn.textContent = '페르소나 파일 편집';
  rpEditBtn.addEventListener('click', async () => {
    const name = rpSelect.value;
    if (name === 'off' || name === 'custom') return;
    await callbacks.onOpenPersonaTab(name);
    close();
  });
  rpEditRow.appendChild(rpEditBtn);
  body.appendChild(rpEditRow);

  rpSelect.addEventListener('change', () => {
    callbacks.onRpModeChange(rpSelect.value);
    rpCustomRow.style.display = rpSelect.value === 'custom' ? '' : 'none';
    const showEdit = rpSelect.value === 'toki' || rpSelect.value === 'aris';
    rpEditRow.style.display = showEdit ? '' : 'none';
  });
  rpCustomArea.addEventListener('input', () => {
    callbacks.onRpCustomTextChange(rpCustomArea.value);
  });

  popup.appendChild(header);
  popup.appendChild(body);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  let closed = false;
  const onKey = (e: KeyboardEvent): void => {
    if (document.body.lastElementChild !== overlay) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      trapTabKey(e, popup);
    }
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    closeSettingsOverlay = null;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (previousActive?.isConnected) {
      previousActive.focus();
    }
  };
  closeSettingsOverlay = close;
  closeBtn.addEventListener('click', close);
  closeBtn.focus();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
}
