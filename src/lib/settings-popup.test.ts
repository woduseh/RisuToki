import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsCallbacks, SettingsState } from './settings-popup';
import { showSettingsPopup } from './settings-popup';

function makeState(overrides: Partial<SettingsState> = {}): SettingsState {
  return {
    autosaveEnabled: false,
    autosaveInterval: 60000,
    autosaveDir: '',
    themeId: 'toki',
    customTheme: null,
    bgmEnabled: false,
    rpMode: 'off',
    rpCustomText: '',
    mcpApprovalMode: 'ask',
    previewFocusByDefault: true,
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
    onThemeChange: vi.fn(),
    onCustomThemeChange: vi.fn(),
    onBgmToggle: vi.fn(),
    onPickBgm: vi.fn().mockResolvedValue(null),
    onRpModeChange: vi.fn(),
    onRpCustomTextChange: vi.fn(),
    onMcpApprovalModeChange: vi.fn(),
    onPreviewFocusByDefaultChange: vi.fn(),
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
    if (Array.from(s.options).some((o) => o.value === 'off')) return s;
  }
  throw new Error('RP select not found');
}

function getThemeSelect(overlay: HTMLElement): HTMLSelectElement {
  const selects = overlay.querySelectorAll<HTMLSelectElement>('select.settings-select');
  for (const s of selects) {
    if (Array.from(s.options).some((o) => o.value === 'yuuka')) return s;
  }
  throw new Error('Theme select not found');
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

  it('renders theme presets and custom theme option', () => {
    showSettingsPopup(makeState(), makeCallbacks());
    const overlay = getOverlay()!;
    const themeSelect = getThemeSelect(overlay);

    const optionValues = Array.from(themeSelect.options).map((o) => o.value);
    expect(optionValues).toEqual([
      'toki',
      'aris',
      'kei',
      'yuzu',
      'midori',
      'momoi',
      'yuuka',
      'hina',
      'mika',
      'kisaki',
      'custom',
    ]);
  });

  it('renders and persists the MCP approval policy', () => {
    const callbacks = makeCallbacks();
    showSettingsPopup(makeState({ mcpApprovalMode: 'auto' }), callbacks);
    const select = [...document.querySelectorAll<HTMLSelectElement>('select')].find((element) =>
      [...element.options].some((option) => option.value === 'allow-all'),
    )!;

    expect(select.value).toBe('auto');
    expect([...select.options].map((option) => option.value)).toEqual(['ask', 'auto', 'allow-all']);
    select.value = 'allow-all';
    select.dispatchEvent(new Event('change'));
    expect(callbacks.onMcpApprovalModeChange).toHaveBeenCalledWith('allow-all');
  });

  it('calls theme callback when choosing a preset', () => {
    const callbacks = makeCallbacks();
    showSettingsPopup(makeState(), callbacks);
    const overlay = getOverlay()!;
    const themeSelect = getThemeSelect(overlay);

    themeSelect.value = 'yuuka';
    themeSelect.dispatchEvent(new Event('change'));

    expect(callbacks.onThemeChange).toHaveBeenCalledWith('yuuka');
  });

  it('uses accessible switches and forwards BGM file picking', () => {
    const callbacks = makeCallbacks({ onPickBgm: vi.fn().mockResolvedValue('music.ogg') });
    showSettingsPopup(makeState(), callbacks);
    const overlay = getOverlay()!;
    const autosave = overlay.querySelector<HTMLButtonElement>('[role="switch"][aria-label="자동 저장"]')!;
    expect(autosave.getAttribute('aria-checked')).toBe('false');
    autosave.click();
    expect(autosave.getAttribute('aria-checked')).toBe('true');
    expect(callbacks.onAutosaveToggle).toHaveBeenCalledWith(true);

    const pickBgm = [...overlay.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '파일 선택',
    )!;
    pickBgm.click();
    expect(callbacks.onPickBgm).toHaveBeenCalledOnce();
  });

  it('shows the enabled-by-default preview focus preference and persists changes', () => {
    const callbacks = makeCallbacks();
    showSettingsPopup(makeState(), callbacks);
    const toggle = document.querySelector<HTMLButtonElement>('[role="switch"][aria-label="프리뷰 기본 집중 모드"]')!;

    expect(toggle.getAttribute('aria-checked')).toBe('true');
    toggle.click();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(callbacks.onPreviewFocusByDefaultChange).toHaveBeenCalledWith(false);
  });

  it('shows custom palette editor and persists palette edits', () => {
    const callbacks = makeCallbacks();
    showSettingsPopup(makeState({ themeId: 'custom' }), callbacks);
    const overlay = getOverlay()!;
    const customRow = overlay.querySelector<HTMLElement>('.custom-theme-row');
    const colorInput = overlay.querySelector<HTMLInputElement>('.custom-theme-field input[type="color"]');

    expect(customRow?.style.display).not.toBe('none');
    expect(colorInput).toBeTruthy();

    colorInput!.value = '#112233';
    colorInput!.dispatchEvent(new Event('input'));

    expect(callbacks.onCustomThemeChange).toHaveBeenCalledWith(expect.objectContaining({ background: '#112233' }));
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
    ).filter((el) => {
      const section = el.closest<HTMLElement>('.settings-section');
      return !section?.hidden && el.closest<HTMLElement>('.settings-row')?.style.display !== 'none';
    });
    const last = visibleFocusable[visibleFocusable.length - 1];

    closeBtn.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    expect(document.activeElement).toBe(last);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(closeBtn);
  });
});
