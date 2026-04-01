import { describe, expect, it, vi } from 'vitest';
import { initKeyboard } from './keyboard-shortcuts';

function dispatchKeyboardEvent(init: KeyboardEventInit): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

describe('keyboard shortcuts', () => {
  it('opens preview on F5', () => {
    const deps = {
      handleNew: vi.fn(),
      handleOpen: vi.fn(),
      handleSave: vi.fn(),
      handleSaveAs: vi.fn(),
      closeActiveTab: vi.fn(),
      toggleSidebar: vi.fn(),
      toggleTerminal: vi.fn(),
      showPreviewPanel: vi.fn(),
      showSettingsPopup: vi.fn(),
    };

    initKeyboard(deps as never);
    dispatchKeyboardEvent({ key: 'F5' });

    expect(deps.showPreviewPanel).toHaveBeenCalledTimes(1);
  });

  it('opens settings on Ctrl+,', () => {
    const deps = {
      handleNew: vi.fn(),
      handleOpen: vi.fn(),
      handleSave: vi.fn(),
      handleSaveAs: vi.fn(),
      closeActiveTab: vi.fn(),
      toggleSidebar: vi.fn(),
      toggleTerminal: vi.fn(),
      showPreviewPanel: vi.fn(),
      showSettingsPopup: vi.fn(),
    };

    initKeyboard(deps as never);
    dispatchKeyboardEvent({ ctrlKey: true, key: ',' });

    expect(deps.showSettingsPopup).toHaveBeenCalledTimes(1);
  });
});
