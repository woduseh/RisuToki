import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initPanelDragDrop } from './panel-drag';
import type { PanelDragDeps } from './panel-drag';

function makeDeps(overrides: Partial<PanelDragDeps> = {}): PanelDragDeps {
  return {
    moveItems: vi.fn(),
    moveTerminal: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleTerminal: vi.fn(),
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
});
