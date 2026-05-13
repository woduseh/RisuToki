import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initPanelDragDrop } from './panel-drag';
import type { PanelDragDeps } from './panel-drag';

function makeDeps(overrides: Partial<PanelDragDeps> = {}): PanelDragDeps {
  return {
    moveItems: vi.fn(),
    moveTerminal: vi.fn(),
    moveLoreManager: vi.fn(),
    moveAssetManager: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleTerminal: vi.fn(),
    toggleLoreManager: vi.fn(),
    toggleAssetManager: vi.fn(),
    isPanelPoppedOut: vi.fn(() => false),
    popOutPanel: vi.fn(),
    dockPanel: vi.fn(),
    showContextMenu: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-header-btns">
        <button id="btn-sidebar-collapse">–</button>
      </div>
    </div>
    <div id="terminal-header">
      <div class="momo-header-right">
        <button id="btn-terminal-toggle">–</button>
      </div>
    </div>
  `;
});

describe('initPanelDragDrop', () => {
  it('adds accessible labels to injected popout and close buttons', () => {
    initPanelDragDrop(makeDeps());

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.panel-collapse-btn'));
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '팝아웃 (분리)',
      '닫기',
      '팝아웃 (분리)',
      '닫기',
    ]);
  });

  it('wires independent manager panel headers into drag/drop controls', () => {
    document.body.innerHTML += `
      <div id="app-body"></div>
      <div id="lore-manager-panel">
        <div class="right-manager-header"><span>로어북 관리자</span><div class="right-manager-actions"></div></div>
      </div>
      <div id="asset-manager-panel">
        <div class="right-manager-header"><span>에셋 관리자</span><div class="right-manager-actions"></div></div>
      </div>
    `;
    const deps = makeDeps();

    initPanelDragDrop(deps);

    const loreButtons = document.querySelectorAll('#lore-manager-panel .panel-collapse-btn');
    const assetButtons = document.querySelectorAll('#asset-manager-panel .panel-collapse-btn');
    expect(loreButtons).toHaveLength(1);
    expect(assetButtons).toHaveLength(1);

    loreButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assetButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(deps.toggleLoreManager).toHaveBeenCalled();
    expect(deps.toggleAssetManager).toHaveBeenCalled();
  });
});
