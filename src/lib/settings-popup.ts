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
  bgmEnabled: boolean;
  rpMode: string;
  rpCustomText: string;
  pluniCategory: string;
}

export interface SettingsCallbacks {
  onAutosaveToggle(enabled: boolean): void;
  onAutosaveIntervalChange(interval: number): void;
  onPickAutosaveDir(): Promise<string | null>;
  onResetAutosaveDir(): void;
  onOpenAutosaveDir(): Promise<void>;
  onDarkModeToggle(): void;
  onBgmToggle(enabled: boolean): void;
  onRpModeChange(mode: string): void;
  onRpCustomTextChange(text: string): void;
  onOpenPersonaTab(name: string): Promise<void>;
  onPluniCategoryChange(category: string): void;
}

function createToggle(isOn: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'settings-toggle' + (isOn ? ' on' : '');
  btn.addEventListener('click', () => btn.classList.toggle('on'));
  return btn;
}

export function showSettingsPopup(state: SettingsState, callbacks: SettingsCallbacks): void {
  const existing = document.querySelector('.help-popup-overlay.settings-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'help-popup-overlay settings-overlay';

  const popup = document.createElement('div');
  popup.className = 'settings-popup';

  const header = document.createElement('div');
  header.className = 'help-popup-header';
  header.innerHTML = '<span>⚙ 설정</span>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());
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

  // --- Dark Mode ---
  const darkRow = document.createElement('div');
  darkRow.className = 'settings-row';
  const darkLeft = document.createElement('div');
  darkLeft.innerHTML = '<div class="settings-label">다크 모드</div><div class="settings-desc">아리스 테마 (다크)</div>';
  const darkToggle = createToggle(state.darkMode);
  darkToggle.addEventListener('click', () => {
    callbacks.onDarkModeToggle();
  });
  darkRow.appendChild(darkLeft);
  darkRow.appendChild(darkToggle);
  body.appendChild(darkRow);

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
    { value: 'pluni', label: '플루니 연구소' },
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

  // Pluni category selector (shown only when 'pluni' selected)
  const pluniCategoryRow = document.createElement('div');
  pluniCategoryRow.className = 'settings-row';
  pluniCategoryRow.setAttribute('data-testid', 'pluni-category-row');
  if (state.rpMode !== 'pluni') pluniCategoryRow.style.display = 'none';
  const pluniCatLeft = document.createElement('div');
  pluniCatLeft.innerHTML =
    '<div class="settings-label">챗봇 카테고리</div><div class="settings-desc">분석 대상 챗봇 유형 선택</div>';
  const pluniCatSelect = document.createElement('select');
  pluniCatSelect.className = 'settings-select';
  pluniCatSelect.setAttribute('data-testid', 'pluni-category-select');
  const categoryOptions = [
    { value: 'solo', label: '1:1 챗봇' },
    { value: 'world-sim', label: '월드 시뮬레이터' },
    { value: 'multi-char', label: '멀티 캐릭터 월드 시뮬레이터' },
  ];
  for (const opt of categoryOptions) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === state.pluniCategory) o.selected = true;
    pluniCatSelect.appendChild(o);
  }
  pluniCatSelect.addEventListener('change', () => {
    callbacks.onPluniCategoryChange(pluniCatSelect.value);
  });
  pluniCategoryRow.appendChild(pluniCatLeft);
  pluniCategoryRow.appendChild(pluniCatSelect);
  body.appendChild(pluniCategoryRow);

  // Preview/edit built-in persona button (hidden for 'off', 'custom', 'pluni')
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
    if (name === 'off' || name === 'custom' || name === 'pluni') return;
    await callbacks.onOpenPersonaTab(name);
    overlay.remove();
  });
  rpEditRow.appendChild(rpEditBtn);
  body.appendChild(rpEditRow);

  rpSelect.addEventListener('change', () => {
    callbacks.onRpModeChange(rpSelect.value);
    rpCustomRow.style.display = rpSelect.value === 'custom' ? '' : 'none';
    pluniCategoryRow.style.display = rpSelect.value === 'pluni' ? '' : 'none';
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
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
