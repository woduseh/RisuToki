import { beforeEach, describe, expect, it, vi } from 'vitest';

const sortableCreate = vi.hoisted(() => vi.fn());
vi.mock('sortablejs', () => ({ default: { create: sortableCreate } }));

import { destroyAllSortables, initSidebarDnD, type DndDeps } from './sidebar-dnd';

function makeDeps(overrides: Partial<DndDeps> = {}): DndDeps {
  return {
    getFileData: () => ({}),
    getLuaSections: () => [],
    getCssSections: () => [],
    getCssStylePrefix: () => '',
    getCssStyleSuffix: () => '',
    reorderLorebook: vi.fn(),
    reorderRegex: vi.fn(),
    reorderLuaSections: vi.fn(),
    reorderCssSections: vi.fn(),
    reorderAsset: vi.fn(),
    reorderAlternateGreetings: vi.fn(),
    ...overrides,
  };
}

function sortableOptionsFor(element: HTMLElement): { onEnd: (event: unknown) => void } {
  const call = sortableCreate.mock.calls.find(([candidate]) => candidate === element);
  if (!call) throw new Error('Sortable was not initialized for the requested semantic list.');
  return call[1] as { onEnd: (event: unknown) => void };
}

describe('semantic sidebar drag and drop', () => {
  beforeEach(() => {
    destroyAllSortables();
    sortableCreate.mockReset();
    sortableCreate.mockImplementation(() => ({ destroy: vi.fn() }));
    document.body.innerHTML = '';
  });

  it('routes regex drops to the regex reorder operation and restores the rendered DOM', () => {
    document.body.innerHTML = `
      <div data-dnd-regex-container>
        <div data-dnd-idx="0"></div>
        <div data-dnd-idx="1"></div>
        <div data-dnd-idx="2"></div>
      </div>
    `;
    const reorderRegex = vi.fn();
    initSidebarDnD(makeDeps({ reorderRegex }));

    const list = document.querySelector<HTMLElement>('[data-dnd-regex-container]')!;
    const first = list.querySelector<HTMLElement>('[data-dnd-idx="0"]')!;
    list.appendChild(first);
    sortableOptionsFor(list).onEnd({ oldIndex: 0, newIndex: 2, item: first, from: list, to: list });

    expect(reorderRegex).toHaveBeenCalledWith(0, 2);
    expect([...list.children].map((item) => (item as HTMLElement).dataset.dndIdx)).toEqual(['0', '1', '2']);
  });

  it('routes cross-folder lorebook drops with the target folder and target position', () => {
    document.body.innerHTML = `
      <div data-dnd-lore-container data-dnd-lore-folder="">
        <div data-dnd-idx="2"></div>
      </div>
      <div data-dnd-lore-container data-dnd-lore-folder="folder:world">
        <div data-dnd-idx="1"></div>
      </div>
    `;
    const reorderLorebook = vi.fn();
    initSidebarDnD(makeDeps({ reorderLorebook }));

    const [source, target] = [...document.querySelectorAll<HTMLElement>('[data-dnd-lore-container]')];
    const moved = source.querySelector<HTMLElement>('[data-dnd-idx="2"]')!;
    target.appendChild(moved);
    sortableOptionsFor(source).onEnd({ oldIndex: 0, newIndex: 1, item: moved, from: source, to: target });

    expect(reorderLorebook).toHaveBeenCalledWith(2, 1, 'folder:world');
    expect(source.firstElementChild).toBe(moved);
    expect([...target.children].map((item) => (item as HTMLElement).dataset.dndIdx)).toEqual(['1']);
  });
});
