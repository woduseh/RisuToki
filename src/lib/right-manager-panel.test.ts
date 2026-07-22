import { beforeEach, describe, expect, it, vi } from 'vitest';

const sortableCreate = vi.hoisted(() => vi.fn());
vi.mock('sortablejs', () => ({ default: { create: sortableCreate } }));

import { initRightManagerPanel, renderRightManagerPanel, type RightManagerPanelDeps } from './right-manager-panel';

function makeDeps(overrides: Partial<RightManagerPanelDeps> = {}): RightManagerPanelDeps {
  return {
    getFileData: () => ({
      lorebook: [
        { comment: 'Heroes', mode: 'folder', key: 'folder:heroes' },
        {
          comment: 'Shoto Todoroki',
          key: 'Shoto, Todoroki',
          secondkey: 'character',
          content: 'Dual-colored hair',
          folder: 'folder:heroes',
          alwaysActive: true,
        },
        { comment: 'All For One', key: 'villain', content: 'Symbol of fear' },
      ],
    }),
    getProjectPath: () => null,
    openLorebookEntry: vi.fn(),
    addLorebookEntry: vi.fn(),
    addLorebookFolder: vi.fn(),
    renameLorebook: vi.fn(),
    commitLorebookName: vi.fn(),
    reorderLorebook: vi.fn(),
    deleteLorebook: vi.fn(),
    deleteLorebookMany: vi.fn(),
    moveLorebookManyToFolder: vi.fn(),
    openImageTab: vi.fn(),
    addAssetFromDialog: vi.fn(),
    addAssetBuffer: vi.fn(),
    renameAsset: vi.fn(),
    renameAssetsBatch: vi.fn().mockResolvedValue({ ok: true, renamed: [] }),
    deleteAssets: vi.fn(),
    getAssetList: vi.fn().mockResolvedValue([{ path: 'assets/icon/hero.webp', size: 2048 }]),
    getAssetData: vi.fn().mockResolvedValue('AAAA'),
    showPrompt: vi.fn().mockResolvedValue(null),
    showConfirm: vi.fn().mockResolvedValue(false),
    setStatus: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

function clearLoreSearch(): HTMLInputElement {
  let input = document.querySelector<HTMLInputElement>('#lore-manager-panel .manager-search')!;
  if (input.value) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input = document.querySelector<HTMLInputElement>('#lore-manager-panel .manager-search')!;
  }
  return input;
}

function flushTimers(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('right-manager-panel', () => {
  beforeEach(() => {
    sortableCreate.mockReset();
    sortableCreate.mockImplementation(() => ({ destroy: vi.fn() }));
    document.body.innerHTML = '<div id="lore-manager-panel"></div><div id="asset-manager-panel"></div>';
  });

  it('connects flat lorebook drag completion to the document reorder callback', () => {
    const reorderLorebook = vi.fn();
    const deps = makeDeps({
      getFileData: () => ({
        lorebook: [
          { comment: 'First', key: 'first', content: '' },
          { comment: 'Second', key: 'second', content: '' },
          { comment: 'Third', key: 'third', content: '' },
        ],
      }),
      reorderLorebook,
    });
    initRightManagerPanel(deps);
    clearLoreSearch();

    const list = document.querySelector<HTMLElement>('.manager-lore-list-sortable')!;
    const first = list.querySelector<HTMLElement>('[data-dnd-idx="0"]')!;
    list.appendChild(first);
    const sortableCall = sortableCreate.mock.calls.find(([element]) => element === list)!;
    const options = sortableCall[1] as { onEnd: (event: unknown) => void };

    options.onEnd({ oldIndex: 0, newIndex: 2, item: first, from: list, to: list });

    expect(reorderLorebook).toHaveBeenCalledWith(0, 2, '');
    expect([...list.querySelectorAll<HTMLElement>('[data-dnd-idx]')].map((row) => row.dataset.dndIdx)).toEqual([
      '0',
      '1',
      '2',
    ]);
  });

  it('renders lorebook folders and opens entries through the provided callback', () => {
    const deps = makeDeps();
    initRightManagerPanel(deps);

    expect(document.querySelector('.manager-folder-label')?.textContent).toBe('Heroes');
    document.querySelector<HTMLButtonElement>('.manager-folder-arrow')?.click();
    expect(document.body.textContent).toContain('Shoto Todoroki');

    const row = [...document.querySelectorAll<HTMLElement>('.manager-lore-row')].find((item) =>
      item.textContent?.includes('Shoto Todoroki'),
    );
    row?.click();
    expect(deps.openLorebookEntry).toHaveBeenCalledWith(1);
  });

  it('filters lorebook entries by query text', () => {
    const deps = makeDeps();
    initRightManagerPanel(deps);

    const input = document.querySelector<HTMLInputElement>('.manager-search')!;
    input.value = 'villain';
    input.dispatchEvent(new Event('input'));

    expect(document.body.textContent).toContain('All For One');
    expect(document.body.textContent).not.toContain('Shoto Todoroki');
  });

  it('keeps Korean IME search composition mounted until the composed value is ready', async () => {
    const deps = makeDeps({
      getFileData: () => ({
        lorebook: [
          { comment: '하이 항목', key: '하이', content: '완성형 한글 검색' },
          { comment: '다른 항목', key: 'other', content: 'unmatched' },
        ],
      }),
    });
    initRightManagerPanel(deps);

    const input = clearLoreSearch();
    input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    input.value = 'ㅎ';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector<HTMLInputElement>('#lore-manager-panel .manager-search')).toBe(input);
    expect(document.body.textContent).toContain('하이 항목');
    expect(document.body.textContent).toContain('다른 항목');

    input.value = '하이';
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));
    await flushTimers();

    const rerenderedInput = document.querySelector<HTMLInputElement>('#lore-manager-panel .manager-search')!;
    expect(rerenderedInput.value).toBe('하이');
    expect(document.body.textContent).toContain('하이 항목');
    expect(document.body.textContent).not.toContain('다른 항목');
  });

  it('renames folders by double-click while keeping entry rename buttons', () => {
    const commitLorebookName = vi.fn().mockReturnValue(null);
    const deps = makeDeps({ commitLorebookName });
    initRightManagerPanel(deps);
    clearLoreSearch();

    const folderRow = document.querySelector<HTMLElement>('.manager-folder-row')!;
    expect(folderRow.querySelector<HTMLButtonElement>('button[aria-label="폴더 이름 변경"]')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('.manager-lore-row button[aria-label="이름 변경"]')).toBeTruthy();

    folderRow
      .querySelector<HTMLElement>('.manager-folder-label')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = folderRow.querySelector<HTMLInputElement>('.manager-inline-rename')!;
    input.value = 'Renamed Heroes';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(commitLorebookName).toHaveBeenCalledWith(0, 'Renamed Heroes');
  });

  it('renders asset thumbnails in the asset tab', async () => {
    const deps = makeDeps();
    initRightManagerPanel(deps);
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.querySelector<HTMLButtonElement>('button[aria-label="썸네일 보기"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deps.getAssetList).toHaveBeenCalled();
    expect(document.getElementById('asset-manager-panel')?.textContent).toContain('hero.webp');
    expect(document.querySelector<HTMLImageElement>('#asset-manager-panel .manager-asset-preview img')?.src).toContain(
      'data:image/webp',
    );
  });

  it('hides for risup documents', () => {
    const deps = makeDeps({ getFileData: () => ({ _fileType: 'risup' }) });
    initRightManagerPanel(deps);
    renderRightManagerPanel();

    expect(document.getElementById('lore-manager-panel')?.style.display).toBe('none');
    expect(document.getElementById('asset-manager-panel')?.style.display).toBe('none');
  });

  it('shows for risum documents', () => {
    const deps = makeDeps({ getFileData: () => ({ _fileType: 'risum', lorebook: [] }) });
    initRightManagerPanel(deps);
    renderRightManagerPanel();

    expect(document.getElementById('lore-manager-panel')?.style.display).toBe('flex');
    expect(document.getElementById('asset-manager-panel')?.style.display).toBe('flex');
  });

  it('commits and cancels lorebook names inline', () => {
    const commitLorebookName = vi.fn().mockReturnValue(null);
    const deps = makeDeps({ commitLorebookName });
    initRightManagerPanel(deps);

    const row = [...document.querySelectorAll<HTMLElement>('.manager-lore-row')].find((item) =>
      item.textContent?.includes('All For One'),
    )!;
    row.querySelector<HTMLButtonElement>('button[aria-label="이름 변경"]')!.click();
    const input = row.querySelector<HTMLInputElement>('.manager-inline-rename')!;
    input.value = 'Symbol of Fear';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(commitLorebookName).toHaveBeenCalledWith(2, 'Symbol of Fear');

    row.querySelector<HTMLButtonElement>('button[aria-label="이름 변경"]')!.click();
    row
      .querySelector<HTMLInputElement>('.manager-inline-rename')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(commitLorebookName).toHaveBeenCalledTimes(1);
  });

  it('uses an in-panel folder picker instead of window.prompt', async () => {
    const moveLorebookManyToFolder = vi.fn().mockResolvedValue(undefined);
    const promptSpy = vi.spyOn(window, 'prompt');
    const deps = makeDeps({ moveLorebookManyToFolder });
    initRightManagerPanel(deps);

    const row = [...document.querySelectorAll<HTMLElement>('.manager-lore-row')].find((item) =>
      item.textContent?.includes('All For One'),
    )!;
    row.querySelector<HTMLInputElement>('.manager-check')!.click();
    document.querySelector<HTMLButtonElement>('button[aria-label="선택 항목 폴더 이동"]')!.click();
    expect(document.querySelector('.manager-folder-picker')?.textContent).toContain('Heroes');
    document.querySelector<HTMLButtonElement>('button[aria-label="Heroes(으)로 이동"]')!.click();
    await Promise.resolve();

    expect(promptSpy).not.toHaveBeenCalled();
    expect(moveLorebookManyToFolder).toHaveBeenCalledWith([2], 'folder:heroes');
  });

  it('renames assets inline and ignores stale async asset lists', async () => {
    let resolveOld!: (value: Array<{ path: string; size: number }>) => void;
    const oldList = new Promise<Array<{ path: string; size: number }>>((resolve) => {
      resolveOld = resolve;
    });
    const getAssetList = vi
      .fn()
      .mockReturnValueOnce(oldList)
      .mockResolvedValue([{ path: 'assets/icon/current.webp', size: 1024 }]);
    const renameAsset = vi.fn().mockResolvedValue(null);
    const deps = makeDeps({ getAssetList, renameAsset });
    initRightManagerPanel(deps);
    renderRightManagerPanel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveOld([{ path: 'assets/icon/stale.webp', size: 1024 }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('asset-manager-panel')?.textContent).toContain('current.webp');
    expect(document.getElementById('asset-manager-panel')?.textContent).not.toContain('stale.webp');
    document.querySelector<HTMLButtonElement>('button[aria-label="썸네일 보기"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const card = document.querySelector<HTMLElement>('.manager-asset-card')!;
    card.querySelector<HTMLButtonElement>('button[aria-label="이름 변경"]')!.click();
    const input = card.querySelector<HTMLInputElement>('.manager-inline-rename')!;
    input.value = 'renamed.webp';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    expect(renameAsset).toHaveBeenCalledWith('assets/icon/current.webp', 'renamed.webp');
  });

  it('plans and applies asset batch rename from the selected asset bar', async () => {
    const renameAssetsBatch = vi.fn().mockResolvedValue({
      ok: true,
      renamed: [
        { oldPath: 'assets/icon/hero.webp', newPath: 'assets/icon/hero_001.webp' },
        { oldPath: 'assets/other/image/scene.png', newPath: 'assets/other/image/hero_002.png' },
      ],
    });
    const showPrompt = vi
      .fn()
      .mockResolvedValueOnce('패턴+번호')
      .mockResolvedValueOnce('hero')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('3');
    const showConfirm = vi.fn().mockResolvedValue(true);
    const deps = makeDeps({
      getAssetList: vi.fn().mockResolvedValue([
        { path: 'assets/icon/hero.webp', size: 2048 },
        { path: 'assets/other/image/scene.png', size: 1024 },
      ]),
      renameAssetsBatch,
      showPrompt,
      showConfirm,
    });
    initRightManagerPanel(deps);
    await flushTimers();
    document.querySelector<HTMLButtonElement>('button[aria-label="썸네일 보기"]')!.click();
    await flushTimers();

    let checks = document.querySelectorAll<HTMLInputElement>('#asset-manager-panel .manager-asset-check');
    checks[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushTimers();
    checks = document.querySelectorAll<HTMLInputElement>('#asset-manager-panel .manager-asset-check');
    checks[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await flushTimers();

    document.querySelector<HTMLButtonElement>('button[aria-label="선택 에셋 이름 일괄 변경"]')!.click();
    await flushTimers();

    expect(showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('assets/icon/hero.webp -> assets/icon/hero_001.webp'),
    );
    expect(renameAssetsBatch).toHaveBeenCalledWith([
      { oldPath: 'assets/icon/hero.webp', newName: 'hero_001.webp' },
      { oldPath: 'assets/other/image/scene.png', newName: 'hero_002.png' },
    ]);
    expect(deps.setStatus).toHaveBeenCalledWith('에셋 2개 이름 변경됨');
  });
});
