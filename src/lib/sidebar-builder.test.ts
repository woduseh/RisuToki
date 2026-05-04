import { describe, expect, it, vi } from 'vitest';
import { createTreeItem, createFolderItem, initSidebarSplitResizer, updateSidebarActive } from './sidebar-builder';

describe('createTreeItem', () => {
  it('creates a div with correct class, dataset, icon and label', () => {
    const el = createTreeItem('myLabel', '📄', 2);

    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('tree-item indent-2');
    expect(el.dataset.label).toBe('myLabel');

    const spans = el.querySelectorAll('span');
    expect(spans).toHaveLength(2);
    expect(spans[0].className).toBe('icon');
    expect(spans[0].textContent).toBe('📄');
    expect(spans[1].textContent).toBe('myLabel');
  });

  it('uses indent-0 for root items', () => {
    const el = createTreeItem('root', '·', 0);
    expect(el.className).toBe('tree-item indent-0');
  });
});

describe('createFolderItem', () => {
  it('returns header and children elements', () => {
    const { header, children } = createFolderItem('Lua', '{}', 0);

    expect(header.tagName).toBe('DIV');
    expect(header.className).toBe('tree-item indent-0');
    expect(children.tagName).toBe('DIV');
    expect(children.className).toBe('tree-children');
  });

  it('header contains arrow, icon, and label spans', () => {
    const { header } = createFolderItem('CSS', '🎨', 1);
    const spans = header.querySelectorAll('span');

    expect(spans).toHaveLength(3);
    expect(spans[0].className).toBe('arrow');
    expect(spans[0].textContent).toBe('▶');
    expect(spans[1].className).toBe('icon');
    expect(spans[1].textContent).toBe('🎨');
    expect(spans[2].textContent).toBe('CSS');
  });

  it('toggles expanded class on header click', () => {
    const { header, children } = createFolderItem('Folder', '📁', 0);
    const arrow = header.querySelector('.arrow')!;

    expect(children.classList.contains('expanded')).toBe(false);
    expect(arrow.textContent).toBe('▶');

    header.click();
    expect(children.classList.contains('expanded')).toBe(true);
    expect(arrow.textContent).toBe('▼');

    header.click();
    expect(children.classList.contains('expanded')).toBe(false);
    expect(arrow.textContent).toBe('▶');
  });
});

describe('updateSidebarActive', () => {
  it('marks the matching tree-item as active', () => {
    document.body.innerHTML = `
      <div class="tree-item" data-label="alpha"></div>
      <div class="tree-item" data-label="beta"></div>
    `;
    const tabs = [
      { id: 'tab1', label: 'alpha' },
      { id: 'tab2', label: 'beta' },
    ];

    updateSidebarActive('tab1', tabs);

    const items = document.querySelectorAll('.tree-item');
    expect(items[0].classList.contains('active')).toBe(true);
    expect(items[1].classList.contains('active')).toBe(false);
  });

  it('removes active from all items when activeTabId is null', () => {
    document.body.innerHTML = `
      <div class="tree-item active" data-label="alpha"></div>
    `;
    updateSidebarActive(null, [{ id: 'tab1', label: 'alpha' }]);

    expect(document.querySelector('.tree-item')!.classList.contains('active')).toBe(false);
  });

  it('removes active when no tab matches', () => {
    document.body.innerHTML = `
      <div class="tree-item active" data-label="alpha"></div>
    `;
    updateSidebarActive('unknown', [{ id: 'tab1', label: 'alpha' }]);

    expect(document.querySelector('.tree-item')!.classList.contains('active')).toBe(false);
  });
});

describe('initSidebarSplitResizer', () => {
  it('adds separator semantics and arrow-key resizing', () => {
    document.body.innerHTML = `
      <div id="sidebar-items-section"></div>
      <div id="sidebar-split-resizer"></div>
      <div id="sidebar-refs-section"></div>
      <div id="sidebar-refs"></div>
    `;
    const itemsSection = document.getElementById('sidebar-items-section') as HTMLElement;
    const refsSection = document.getElementById('sidebar-refs-section') as HTMLElement;
    const resizer = document.getElementById('sidebar-split-resizer') as HTMLElement;
    Object.defineProperty(itemsSection, 'offsetHeight', { configurable: true, value: 120 });
    Object.defineProperty(refsSection, 'offsetHeight', { configurable: true, value: 100 });

    initSidebarSplitResizer({
      moveRefs: vi.fn(),
      popOutPanel: vi.fn(),
      dockPanel: vi.fn(),
      isPanelPoppedOut: vi.fn().mockReturnValue(false),
      showContextMenu: vi.fn(),
    });

    expect(resizer.getAttribute('role')).toBe('separator');
    expect(resizer.getAttribute('aria-orientation')).toBe('horizontal');
    expect(resizer.tabIndex).toBe(0);

    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }));

    expect(itemsSection.style.flex).toBe('0 0 170px');
    expect(refsSection.style.flex).toBe('0 0 60px');
    expect(resizer.getAttribute('aria-valuenow')).toBe('170');
  });
});
