import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initKeyboard, type KeyboardDeps } from './keyboard-shortcuts';

const deps: KeyboardDeps = {
  handleNew: vi.fn(),
  handleOpen: vi.fn(),
  handleSave: vi.fn(),
  handleSaveAs: vi.fn(),
  closeActiveTab: vi.fn(),
  toggleSidebar: vi.fn(),
  toggleTerminal: vi.fn(),
  togglePreviewFocusMode: vi.fn(),
  showPreviewPanel: vi.fn(),
  showSettingsPopup: vi.fn(),
};

// The app installs one listener for its lifetime; resetting mocks keeps cases independent.
beforeAll(() => initKeyboard(deps));
beforeEach(() => vi.clearAllMocks());

describe('keyboard shortcuts', () => {
  it.each([
    ['F5', { key: 'F5' }, 'showPreviewPanel'],
    ['Ctrl+,', { ctrlKey: true, key: ',' }, 'showSettingsPopup'],
    ['Ctrl+Shift+F', { ctrlKey: true, shiftKey: true, key: 'F' }, 'togglePreviewFocusMode'],
  ] satisfies Array<[string, KeyboardEventInit, keyof KeyboardDeps]>)(
    'dispatches only %s and prevents the browser default',
    (_label, init, action) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      document.dispatchEvent(event);

      expect(deps[action]).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
      for (const [name, handler] of Object.entries(deps)) {
        if (name !== action) expect(handler).not.toHaveBeenCalled();
      }
    },
  );
});
