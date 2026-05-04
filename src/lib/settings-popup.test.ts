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
    if (Array.from(s.options).some((o) => o.value === 'custom')) return s;
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

  it('renders RP mode dropdown with toki/aris/custom options', () => {
    showSettingsPopup(makeState(), makeCallbacks());
    const overlay = getOverlay()!;
    const rpSelect = getRpSelect(overlay);

    const optionValues = Array.from(rpSelect.options).map((o) => o.value);
    expect(optionValues).toContain('off');
    expect(optionValues).toContain('toki');
    expect(optionValues).toContain('aris');
    expect(optionValues).toContain('custom');
    expect(optionValues).not.toContain('pluni');
  });

  it('shows edit button when rpMode is toki', () => {
    showSettingsPopup(makeState({ rpMode: 'toki' }), makeCallbacks());
    const overlay = getOverlay()!;
    const buttons = overlay.querySelectorAll('button.settings-btn');
    const editBtn = Array.from(buttons).find((b) => b.textContent === '페르소나 파일 편집');
    expect(editBtn).toBeTruthy();
    const editRow = editBtn!.closest('.settings-row') as HTMLElement;
    expect(editRow.style.display).not.toBe('none');
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
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    showSettingsPopup(makeState(), makeCallbacks());
    expect(getOverlay()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(getOverlay()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('traps Tab and Shift+Tab inside the settings dialog', () => {
    showSettingsPopup(makeState(), makeCallbacks());
    const overlay = getOverlay()!;
    const closeBtn = overlay.querySelector('.help-popup-header button') as HTMLButtonElement;
    const visibleFocusable = Array.from(
      overlay.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.closest<HTMLElement>('.settings-row')?.style.display !== 'none');
    const last = visibleFocusable[visibleFocusable.length - 1];

    closeBtn.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    expect(document.activeElement).toBe(last);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(closeBtn);
  });
});
