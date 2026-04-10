import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showHelpPopup } from './help-popup';
import { showSettingsPopup } from './settings-popup';

function getOverlay(): HTMLElement | null {
  return document.querySelector('.help-popup-overlay');
}

describe('help popup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders as a modal dialog and focuses the close button', () => {
    showHelpPopup();

    const overlay = getOverlay()!;
    const dialog = overlay.querySelector('.help-popup') as HTMLElement | null;
    const closeBtn = overlay.querySelector('.help-popup-header button') as HTMLButtonElement | null;

    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(closeBtn);
  });

  it('documents the settings and preview shortcuts', () => {
    showHelpPopup();
    const overlay = getOverlay()!;

    expect(overlay.textContent).toContain('설정');
    expect(overlay.textContent).toContain('Ctrl+,');
    expect(overlay.textContent).toContain('프리뷰');
    expect(overlay.textContent).toContain('F5');
  });

  it('closes on Escape', () => {
    showHelpPopup();
    expect(getOverlay()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(getOverlay()).toBeNull();
  });

  it('does not close the settings popup when help is opened', () => {
    showSettingsPopup(
      {
        autosaveEnabled: false,
        autosaveInterval: 60000,
        autosaveDir: '',
        darkMode: false,
        bgmEnabled: false,
        rpMode: 'off',
        rpCustomText: '',
      },
      {
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
      },
    );

    expect(document.querySelector('.settings-overlay')).not.toBeNull();

    showHelpPopup();

    expect(document.querySelector('.settings-overlay')).not.toBeNull();
    expect(getOverlay()).not.toBeNull();
  });
});
