import { describe, expect, it, vi } from 'vitest';
import { createDefaultLayoutState, createLayoutManager } from './layout-manager';

function createLayoutDom() {
  document.body.innerHTML = `
    <div id="sidebar"></div>
    <div id="refs-panel"></div>
    <div id="bottom-area"></div>
    <div id="sidebar-refs-section"></div>
    <div id="sidebar-split-resizer"></div>
    <div id="refs-panel-content"></div>
    <div id="toki-avatar"></div>
    <button id="btn-terminal-toggle"></button>
    <button id="sidebar-expand"></button>
    <div id="sidebar-refs"></div>
    <div id="slot-far-left"></div>
    <div id="slot-left"></div>
    <div id="slot-right"></div>
    <div id="slot-far-right"></div>
    <div id="slot-top"></div>
    <div id="slot-bottom"></div>
    <div id="resizer-far-left"></div>
    <div id="resizer-left"></div>
    <div id="resizer-right"></div>
    <div id="resizer-far-right"></div>
    <div id="resizer-top"></div>
    <div id="resizer-bottom"></div>
  `;
}

describe('layout manager refs sync', () => {
  it('moves late-built sidebar refs into the detached refs panel on rebuild', () => {
    vi.useFakeTimers();
    createLayoutDom();

    const state = createDefaultLayoutState();
    state.refsPos = 'right';
    const saveState = vi.fn();
    const onRefit = vi.fn();

    const layoutManager = createLayoutManager({
      state,
      saveState,
      onRefit,
      onStatus: vi.fn(),
    });

    layoutManager.rebuild();

    const sidebarRefs = document.getElementById('sidebar-refs');
    const refsPanelContent = document.getElementById('refs-panel-content');
    if (!sidebarRefs || !refsPanelContent) {
      throw new Error('Test DOM is incomplete.');
    }

    sidebarRefs.appendChild(document.createElement('div')).textContent = 'Guide';
    layoutManager.rebuild();
    vi.runAllTimers();

    expect(refsPanelContent.textContent).toContain('Guide');
    expect(sidebarRefs.childElementCount).toBe(0);
    expect(saveState).toHaveBeenCalled();
    expect(onRefit).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('adds separator semantics and arrow-key resizing to active slot resizers', () => {
    vi.useFakeTimers();
    createLayoutDom();

    const state = createDefaultLayoutState();
    const saveState = vi.fn();
    const onRefit = vi.fn();

    const layoutManager = createLayoutManager({
      state,
      saveState,
      onRefit,
      onStatus: vi.fn(),
    });

    layoutManager.rebuild();
    vi.runOnlyPendingTimers();

    const leftResizer = document.getElementById('resizer-left') as HTMLElement;
    expect(leftResizer.getAttribute('role')).toBe('separator');
    expect(leftResizer.getAttribute('aria-orientation')).toBe('vertical');
    expect(leftResizer.getAttribute('aria-label')).toContain('좌측');
    expect(leftResizer.tabIndex).toBe(0);

    leftResizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(state.slotSizes.left).toBe(270);
    expect(leftResizer.getAttribute('aria-valuenow')).toBe('270');
    expect(saveState).toHaveBeenCalled();
    expect(onRefit).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
