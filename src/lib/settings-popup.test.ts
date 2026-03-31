import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsCallbacks, SettingsState } from './settings-popup';
import { showSettingsPopup } from './settings-popup';

function makeState(overrides: Partial<SettingsState> = {}): SettingsState {
  return {
    autosaveEnabled: false,
    autosaveInterval: 60000,
    autosaveDir: '',
    darkMode: false,
    bgmEnabled: false,
    rpMode: 'off',
    rpCustomText: '',
    pluniCategory: 'solo',
    ...overrides,
  };
}

function makeCallbacks(overrides: Partial<SettingsCallbacks> = {}): SettingsCallbacks {
  return {
    onAutosaveToggle: vi.fn(),
    onAutosaveIntervalChange: vi.fn(),
    onPickAutosaveDir: vi.fn().mockResolvedValue(null),
    onResetAutosaveDir: vi.fn(),
    onOpenAutosaveDir: vi.fn().mockResolvedValue(undefined),
    onDarkModeToggle: vi.fn(),
    onBgmToggle: vi.fn(),
    onRpModeChange: vi.fn(),
    onRpCustomTextChange: vi.fn(),
    onOpenPersonaTab: vi.fn().mockResolvedValue(undefined),
    onPluniCategoryChange: vi.fn(),
    ...overrides,
  };
}

function getOverlay(): HTMLElement | null {
  return document.querySelector('.settings-overlay');
}

function getRpSelect(overlay: HTMLElement): HTMLSelectElement {
  // The RP mode select is the second `.settings-select` in the popup
  // (first is autosave interval)
  const selects = overlay.querySelectorAll<HTMLSelectElement>('select.settings-select');
  for (const s of selects) {
    if (Array.from(s.options).some((o) => o.value === 'pluni')) return s;
  }
  throw new Error('RP select not found');
}

describe('settings popup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── RP mode dropdown contains pluni option ──

  it('renders pluni option in the RP mode dropdown', () => {
    showSettingsPopup(makeState(), makeCallbacks());
    const overlay = getOverlay()!;
    const rpSelect = getRpSelect(overlay);

    const optionValues = Array.from(rpSelect.options).map((o) => o.value);
    expect(optionValues).toContain('pluni');

    const pluniOpt = Array.from(rpSelect.options).find((o) => o.value === 'pluni');
    expect(pluniOpt?.textContent).toBe('플루니 연구소');
  });

  // ── Category row visible only when rpMode === 'pluni' ──

  it('shows category row when rpMode is pluni', () => {
    showSettingsPopup(makeState({ rpMode: 'pluni' }), makeCallbacks());
    const overlay = getOverlay()!;
    const categoryRow = overlay.querySelector('[data-testid="pluni-category-row"]');
    expect(categoryRow).toBeTruthy();
    expect((categoryRow as HTMLElement).style.display).not.toBe('none');
  });

  it('hides category row when rpMode is not pluni', () => {
    showSettingsPopup(makeState({ rpMode: 'toki' }), makeCallbacks());
    const overlay = getOverlay()!;
    const categoryRow = overlay.querySelector('[data-testid="pluni-category-row"]');
    expect(categoryRow).toBeTruthy();
    expect((categoryRow as HTMLElement).style.display).toBe('none');
  });

  it('hides category row when rpMode is off', () => {
    showSettingsPopup(makeState({ rpMode: 'off' }), makeCallbacks());
    const overlay = getOverlay()!;
    const categoryRow = overlay.querySelector('[data-testid="pluni-category-row"]');
    expect(categoryRow).toBeTruthy();
    expect((categoryRow as HTMLElement).style.display).toBe('none');
  });

  // ── Category change fires callback ──

  it('fires onPluniCategoryChange when category is changed', () => {
    const cb = makeCallbacks();
    showSettingsPopup(makeState({ rpMode: 'pluni' }), cb);
    const overlay = getOverlay()!;
    const catSelect = overlay.querySelector<HTMLSelectElement>('[data-testid="pluni-category-select"]');
    expect(catSelect).toBeTruthy();

    catSelect!.value = 'world-sim';
    catSelect!.dispatchEvent(new Event('change'));
    expect(cb.onPluniCategoryChange).toHaveBeenCalledWith('world-sim');
  });

  it('has three category options with correct labels', () => {
    showSettingsPopup(makeState({ rpMode: 'pluni' }), makeCallbacks());
    const overlay = getOverlay()!;
    const catSelect = overlay.querySelector<HTMLSelectElement>('[data-testid="pluni-category-select"]');
    expect(catSelect).toBeTruthy();

    const options = Array.from(catSelect!.options);
    expect(options).toHaveLength(3);
    expect(options[0].value).toBe('solo');
    expect(options[0].textContent).toBe('1:1 챗봇');
    expect(options[1].value).toBe('world-sim');
    expect(options[1].textContent).toBe('월드 시뮬레이터');
    expect(options[2].value).toBe('multi-char');
    expect(options[2].textContent).toBe('멀티 캐릭터 월드 시뮬레이터');
  });

  // ── Category row toggles on RP mode change ──

  it('shows category row when switching RP mode to pluni', () => {
    const cb = makeCallbacks();
    showSettingsPopup(makeState({ rpMode: 'off' }), cb);
    const overlay = getOverlay()!;

    const rpSelect = getRpSelect(overlay);

    // Switch to pluni
    rpSelect.value = 'pluni';
    rpSelect.dispatchEvent(new Event('change'));

    const categoryRow = overlay.querySelector('[data-testid="pluni-category-row"]');
    expect((categoryRow as HTMLElement).style.display).not.toBe('none');
  });

  it('hides category row when switching RP mode away from pluni', () => {
    const cb = makeCallbacks();
    showSettingsPopup(makeState({ rpMode: 'pluni' }), cb);
    const overlay = getOverlay()!;

    const rpSelect = getRpSelect(overlay);
    rpSelect.value = 'toki';
    rpSelect.dispatchEvent(new Event('change'));

    const categoryRow = overlay.querySelector('[data-testid="pluni-category-row"]');
    expect((categoryRow as HTMLElement).style.display).toBe('none');
  });

  // ── Edit button hidden for pluni ──

  it('hides edit button when rpMode is pluni', () => {
    showSettingsPopup(makeState({ rpMode: 'pluni' }), makeCallbacks());
    const overlay = getOverlay()!;
    const buttons = overlay.querySelectorAll('button.settings-btn');
    const editBtn = Array.from(buttons).find((b) => b.textContent === '페르소나 파일 편집');
    expect(editBtn).toBeTruthy();
    const editRow = editBtn!.closest('.settings-row') as HTMLElement;
    expect(editRow.style.display).toBe('none');
  });

  it('shows edit button when rpMode is toki', () => {
    showSettingsPopup(makeState({ rpMode: 'toki' }), makeCallbacks());
    const overlay = getOverlay()!;
    // Find the edit button by its text
    const buttons = overlay.querySelectorAll('button.settings-btn');
    const editBtn = Array.from(buttons).find((b) => b.textContent === '페르소나 파일 편집');
    expect(editBtn).toBeTruthy();
    const editRow = editBtn!.closest('.settings-row') as HTMLElement;
    expect(editRow.style.display).not.toBe('none');
  });

  // ── Selects correct initial category ──

  it('selects the initial category from state', () => {
    showSettingsPopup(makeState({ rpMode: 'pluni', pluniCategory: 'multi-char' }), makeCallbacks());
    const overlay = getOverlay()!;
    const catSelect = overlay.querySelector<HTMLSelectElement>('[data-testid="pluni-category-select"]');
    expect(catSelect!.value).toBe('multi-char');
  });

  it('renders the popup as a modal dialog and focuses the close button', () => {
    showSettingsPopup(makeState(), makeCallbacks());

    const overlay = getOverlay()!;
    const dialog = overlay.querySelector('.settings-popup') as HTMLElement | null;
    const closeBtn = overlay.querySelector('.help-popup-header button') as HTMLButtonElement | null;

    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(closeBtn);
  });

  it('closes on Escape', () => {
    showSettingsPopup(makeState(), makeCallbacks());
    expect(getOverlay()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(getOverlay()).toBeNull();
  });
});
