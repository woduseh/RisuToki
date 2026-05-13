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
    <div id="lore-manager-panel"></div>
    <div id="asset-manager-panel"></div>
    <div id="prompt-manager-panel"></div>
    <div id="toki-avatar"></div>
    <button id="btn-terminal-toggle"></button>
    <button id="sidebar-expand"></button>
    <button id="lore-manager-expand"></button>
    <button id="asset-manager-expand"></button>
    <button id="prompt-manager-expand"></button>
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

    layoutManager.setManagerAvailability({ lore: true, asset: true, prompt: true });
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

  it('places independent manager panels in their default slots and can move them', () => {
    vi.useFakeTimers();
    createLayoutDom();

    const state = createDefaultLayoutState();
    const layoutManager = createLayoutManager({
      state,
      saveState: vi.fn(),
      onRefit: vi.fn(),
      onStatus: vi.fn(),
    });
    layoutManager.setManagerAvailability({ lore: true, asset: true, prompt: true });

    layoutManager.rebuild();
    vi.runOnlyPendingTimers();

    expect(document.getElementById('slot-right')?.contains(document.getElementById('lore-manager-panel'))).toBe(true);
    expect(document.getElementById('slot-far-right')?.contains(document.getElementById('asset-manager-panel'))).toBe(
      true,
    );
    expect(document.getElementById('slot-right')?.contains(document.getElementById('prompt-manager-panel'))).toBe(true);

    layoutManager.moveLoreManager('bottom');
    expect(state.loreManagerPos).toBe('bottom');
    expect(document.getElementById('slot-bottom')?.contains(document.getElementById('lore-manager-panel'))).toBe(true);

    layoutManager.moveAssetManager('hide');
    expect(state.assetManagerVisible).toBe(false);
    expect(document.getElementById('slot-far-right')?.contains(document.getElementById('asset-manager-panel'))).toBe(
      false,
    );
    expect(document.getElementById('asset-manager-expand')?.style.display).toBe('block');

    layoutManager.movePromptManager('top');
    expect(state.promptManagerPos).toBe('top');
    expect(document.getElementById('slot-top')?.contains(document.getElementById('prompt-manager-panel'))).toBe(true);
    vi.useRealTimers();
  });

  it('hides manager panels and expand affordances when managers are unavailable', () => {
    vi.useFakeTimers();
    createLayoutDom();

    const state = createDefaultLayoutState();
    const layoutManager = createLayoutManager({
      state,
      saveState: vi.fn(),
      onRefit: vi.fn(),
      onStatus: vi.fn(),
    });

    layoutManager.setManagerAvailability({ lore: false, asset: false });
    vi.runOnlyPendingTimers();

    expect(document.getElementById('lore-manager-panel')?.style.display).toBe('none');
    expect(document.getElementById('asset-manager-panel')?.style.display).toBe('none');
    expect(document.getElementById('prompt-manager-panel')?.style.display).toBe('none');
    expect(document.getElementById('lore-manager-expand')?.style.display).toBe('none');
    expect(document.getElementById('asset-manager-expand')?.style.display).toBe('none');
    expect(document.getElementById('prompt-manager-expand')?.style.display).toBe('none');
    vi.useRealTimers();
  });
});
