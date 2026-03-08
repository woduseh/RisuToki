import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showContextMenu, hideContextMenu } from './context-menu';

beforeEach(() => {
  // vitest.setup.ts already clears body between tests
});

describe('showContextMenu', () => {
  it('appends a .ctx-menu element to document.body', () => {
    showContextMenu(100, 200, [{ label: 'Copy', action: () => {} }]);
    const menu = document.querySelector('.ctx-menu') as HTMLDivElement;
    expect(menu).not.toBeNull();
    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('200px');
  });

  it('renders menu items with correct labels', () => {
    showContextMenu(0, 0, [
      { label: 'A', action: () => {} },
      { label: 'B', action: () => {} },
    ]);
    const items = document.querySelectorAll('.ctx-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('A');
    expect(items[1].textContent).toBe('B');
  });

  it('renders separators for "---" items', () => {
    showContextMenu(0, 0, [{ label: 'X', action: () => {} }, '---', { label: 'Y', action: () => {} }]);
    const seps = document.querySelectorAll('.ctx-sep');
    expect(seps).toHaveLength(1);
  });

  it('calls the action and hides the menu when an item is clicked', () => {
    const action = vi.fn();
    showContextMenu(0, 0, [{ label: 'Run', action }]);
    const item = document.querySelector('.ctx-item') as HTMLElement;
    item.click();
    expect(action).toHaveBeenCalledOnce();
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('replaces the previous menu when called again', () => {
    showContextMenu(0, 0, [{ label: 'First', action: () => {} }]);
    showContextMenu(50, 50, [{ label: 'Second', action: () => {} }]);
    const menus = document.querySelectorAll('.ctx-menu');
    expect(menus).toHaveLength(1);
    expect(menus[0].querySelector('.ctx-item')!.textContent).toBe('Second');
  });
});

describe('hideContextMenu', () => {
  it('removes the menu element from the DOM', () => {
    showContextMenu(0, 0, [{ label: 'Z', action: () => {} }]);
    expect(document.querySelector('.ctx-menu')).not.toBeNull();
    hideContextMenu();
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('is safe to call when no menu is open', () => {
    expect(() => hideContextMenu()).not.toThrow();
  });

  it('is safe to call multiple times', () => {
    showContextMenu(0, 0, [{ label: 'A', action: () => {} }]);
    hideContextMenu();
    hideContextMenu();
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });
});
