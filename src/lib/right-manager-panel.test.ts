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
    openLorebookEntry: vi.fn(),
    addLorebookEntry: vi.fn(),
    addLorebookFolder: vi.fn(),
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

  it.each([
    [0, 2],
    [2, 0],
  ])('connects flat lorebook drag from %i to %i and restores the rendered order', (from, to) => {
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
    const moved = list.querySelector<HTMLElement>(`[data-dnd-idx="${from}"]`)!;
    if (from < to) list.appendChild(moved);
    else list.insertBefore(moved, list.firstElementChild);
    const sortableCall = sortableCreate.mock.calls.find(([element]) => element === list)!;
    const options = sortableCall[1] as { onEnd: (event: unknown) => void };

    options.onEnd({ oldIndex: from, newIndex: to, item: moved, from: list, to: list });

    expect(reorderLorebook).toHaveBeenCalledWith(from, to, '');
    expect([...list.querySelectorAll<HTMLElement>('[data-dnd-idx]')].map((row) => row.dataset.dndIdx)).toEqual([
      '0',
      '1',
      '2',
    ]);
  });

  it('supports drag ordering within and across expanded lorebook folders', () => {
    const reorderLorebook = vi.fn();
    const deps = makeDeps({ reorderLorebook });
    initRightManagerPanel(deps);

    document.querySelector<HTMLButtonElement>('.manager-folder-arrow')!.click();
    const source = document.querySelector<HTMLElement>('.manager-root-entries')!;
    const target = document.querySelector<HTMLElement>('.manager-folder-children')!;
    const moved = source.querySelector<HTMLElement>('[data-dnd-idx="2"]')!;
    target.appendChild(moved);
    const sortableCall = sortableCreate.mock.calls.find(([element]) => element === target)!;
    const options = sortableCall[1] as { onEnd: (event: unknown) => void };

    options.onEnd({ oldIndex: 0, newIndex: 1, item: moved, from: source, to: target });

    expect(reorderLorebook).toHaveBeenCalledWith(2, 1, 'folder:heroes');
    expect(source.firstElementChild).toBe(moved);
    expect([...target.children].map((item) => (item as HTMLElement).dataset.dndIdx)).toEqual(['1']);
  });

  it('moves a folder entry to an empty root and restores both rendered containers', () => {
    const reorderLorebook = vi.fn();
    initRightManagerPanel(
      makeDeps({
        getFileData: () => ({
          lorebook: [
            { comment: 'Heroes', mode: 'folder', key: 'folder:heroes' },
            { comment: 'Hero', folder: 'folder:heroes' },
          ],
        }),
        reorderLorebook,
      }),
    );

    document.querySelector<HTMLButtonElement>('.manager-folder-arrow')!.click();
    const source = document.querySelector<HTMLElement>('.manager-folder-children')!;
    const target = document.querySelector<HTMLElement>('.manager-root-entries')!;
    const moved = source.querySelector<HTMLElement>('[data-dnd-idx="1"]')!;
    target.appendChild(moved);
    const sortableCall = sortableCreate.mock.calls.find(([element]) => element === source)!;
    const options = sortableCall[1] as { onEnd: (event: unknown) => void };

    options.onEnd({ oldIndex: 0, newIndex: 0, item: moved, from: source, to: target });

    expect(reorderLorebook).toHaveBeenCalledWith(1, 0, '');
    expect(source.firstElementChild).toBe(moved);
    expect(target.children).toHaveLength(0);
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

  it('keeps full sibling positions for filtered entries and legacy folder aliases', () => {
    const reorderLorebook = vi.fn();
    initRightManagerPanel(
      makeDeps({
        getFileData: () => ({
          lorebook: [
            { mode: 'folder', key: 'folder:canonical', id: 'legacy', comment: 'Group' },
            { comment: 'Hidden before', folder: 'legacy' },
            { comment: 'Visible match', folder: 'folder:canonical' },
            { comment: 'Hidden after', folder: 'folder:legacy' },
          ],
        }),
        reorderLorebook,
      }),
    );
    document.querySelector<HTMLButtonElement>('.manager-folder-arrow')!.click();
    const input = clearLoreSearch();
    input.value = 'Visible match';
    input.dispatchEvent(new Event('input'));

    const row = document.querySelector<HTMLElement>('.manager-lore-row')!;
    expect(document.querySelectorAll('.manager-lore-row')).toHaveLength(1);
    row.querySelector<HTMLButtonElement>('button[title="위로 이동"]')!.click();
    row.querySelector<HTMLButtonElement>('button[title="아래로 이동"]')!.click();
    expect(reorderLorebook.mock.calls).toEqual([
      [2, 0, 'folder:canonical'],
      [2, 2, 'folder:canonical'],
    ]);
  });

  it('preserves separate move groups for unresolved folders displayed at root', () => {
    const reorderLorebook = vi.fn();
    initRightManagerPanel(
      makeDeps({
        getFileData: () => ({
          lorebook: [
            { comment: 'Root' },
            { comment: 'Orphan first', folder: 'missing' },
            { comment: 'Other orphan', folder: 'other' },
            { comment: 'Orphan second', folder: 'folder:missing' },
          ],
        }),
        reorderLorebook,
      }),
    );
    const rows = document.querySelectorAll<HTMLElement>('.manager-lore-row');
    expect(rows).toHaveLength(4);
    expect(rows[0].querySelector<HTMLButtonElement>('button[title="아래로 이동"]')!.disabled).toBe(true);
    rows[1].querySelector<HTMLButtonElement>('button[title="아래로 이동"]')!.click();
    rows[3].querySelector<HTMLButtonElement>('button[title="위로 이동"]')!.click();
    expect(reorderLorebook.mock.calls).toEqual([
      [1, 1, 'folder:missing'],
      [3, 0, 'folder:missing'],
    ]);
  });

  it('bounds folder reads linearly when rendering a large lorebook', () => {
    let folderReads = 0;
    const count = 200;
    const lorebook = Array.from({ length: count }, (_, index) => ({
      comment: `Entry ${index}`,
      get folder() {
        folderReads++;
        return 'missing';
      },
    }));
    initRightManagerPanel(makeDeps({ getFileData: () => ({ lorebook }) }));

    expect(document.querySelectorAll('.manager-lore-row')).toHaveLength(count);
    expect(folderReads).toBeLessThanOrEqual(count * 4);
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

  it('keeps failed inline edits editable and allows a corrected name', () => {
    const commitLorebookName = vi.fn().mockReturnValueOnce('중복 이름').mockReturnValueOnce(null);
    initRightManagerPanel(makeDeps({ commitLorebookName }));
    const row = document.querySelector<HTMLElement>('.manager-lore-row')!;
    row.querySelector<HTMLButtonElement>('button[aria-label="이름 변경"]')!.click();
    const input = row.querySelector<HTMLInputElement>('.manager-inline-rename')!;
    input.value = 'duplicate';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(row.textContent).toContain('중복 이름');
    expect(document.activeElement).toBe(input);
    input.value = 'corrected';
    input.dispatchEvent(new Event('blur'));
    expect(commitLorebookName).toHaveBeenCalledTimes(2);
    expect(row.querySelector('.manager-inline-rename')).toBeNull();
    expect(row.querySelector('.manager-row-title')?.textContent).toBe('corrected');
  });

  it('does not submit an async asset rename twice on Enter followed by blur', async () => {
    let complete!: (error: string | null) => void;
    const renameAsset = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          complete = resolve;
        }),
    );
    initRightManagerPanel(makeDeps({ renameAsset }));
    await flushTimers();
    document.querySelector<HTMLButtonElement>('button[aria-label="썸네일 보기"]')!.click();
    await flushTimers();
    const card = document.querySelector<HTMLElement>('.manager-asset-card')!;
    card.querySelector<HTMLButtonElement>('button[aria-label="이름 변경"]')!.click();
    const input = card.querySelector<HTMLInputElement>('.manager-inline-rename')!;
    input.value = 'updated.webp';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new Event('blur'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(renameAsset).toHaveBeenCalledTimes(1);
    expect(card.querySelector('.manager-inline-rename')).toBe(input);
    input.value = 'unsaved.webp';
    complete(null);
    await Promise.resolve();
    expect(card.querySelector('.manager-asset-name')?.textContent).toBe('updated.webp');
  });

  it('allows retry after a synchronous rename exception', () => {
    const commitLorebookName = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('저장 실패');
      })
      .mockReturnValue(null);
    initRightManagerPanel(makeDeps({ commitLorebookName }));
    const row = document.querySelector<HTMLElement>('.manager-lore-row')!;
    row.querySelector<HTMLButtonElement>('button[aria-label="이름 변경"]')!.click();
    const input = row.querySelector<HTMLInputElement>('.manager-inline-rename')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(row.textContent).toContain('저장 실패');
    input.value = 'retry';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(commitLorebookName).toHaveBeenCalledTimes(2);
    expect(row.querySelector('.manager-row-title')?.textContent).toBe('retry');
  });

  it('allows retry after an asynchronous rename rejection', async () => {
    const renameAsset = vi.fn().mockRejectedValueOnce(new Error('저장 실패')).mockResolvedValue(null);
    initRightManagerPanel(makeDeps({ renameAsset }));
    await flushTimers();
    document.querySelector<HTMLButtonElement>('button[aria-label="썸네일 보기"]')!.click();
    await flushTimers();
    const card = document.querySelector<HTMLElement>('.manager-asset-card')!;
    card.querySelector<HTMLButtonElement>('button[aria-label="이름 변경"]')!.click();
    const input = card.querySelector<HTMLInputElement>('.manager-inline-rename')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    expect(card.textContent).toContain('저장 실패');
    expect(document.activeElement).toBe(input);
    input.value = 'retry.webp';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    expect(renameAsset).toHaveBeenCalledTimes(2);
    expect(card.querySelector('.manager-asset-name')?.textContent).toBe('retry.webp');
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

  it('places bulk selection beside the view switch and lets a checked asset toggle off', async () => {
    const deps = makeDeps({
      getAssetList: vi.fn().mockResolvedValue([
        { path: 'assets/icon/hero.webp', size: 2048 },
        { path: 'assets/other/scene.webp', size: 1024 },
      ]),
    });
    initRightManagerPanel(deps);
    await flushTimers();

    document.querySelector<HTMLButtonElement>('button[aria-label="파일명 트리 보기"]')!.click();
    await flushTimers();
    const displayRow = document.querySelector<HTMLElement>('.manager-asset-display-row')!;
    expect(displayRow.querySelector('.manager-view-toggle')).not.toBeNull();
    expect(
      displayRow.querySelector<HTMLButtonElement>('button[aria-label="현재 표시된 에셋 전체 선택"]'),
    ).not.toBeNull();

    let checkbox = document.querySelector<HTMLInputElement>('.asset-tree-file input[type="checkbox"]')!;
    checkbox.click();
    await flushTimers();
    expect(document.querySelector('.manager-selected-bar')?.textContent).toContain('1개 선택됨');

    checkbox = document.querySelector<HTMLInputElement>('.asset-tree-file input[type="checkbox"]')!;
    checkbox.click();
    await flushTimers();
    expect(document.querySelector('.manager-selected-bar')).toBeNull();

    document.querySelector<HTMLButtonElement>('button[aria-label="현재 표시된 에셋 전체 선택"]')!.click();
    await flushTimers();
    expect(document.querySelector('.manager-selected-bar')?.textContent).toContain('2개 선택됨');
    expect(
      document.querySelector<HTMLButtonElement>('button[aria-label="현재 표시된 에셋 전체 선택 해제"]'),
    ).not.toBeNull();
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
      refresh: vi.fn(() => renderRightManagerPanel()),
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

    const assetReadsBeforeRename = vi.mocked(deps.getAssetList).mock.calls.length;
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
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(deps.getAssetList).toHaveBeenCalledTimes(assetReadsBeforeRename + 2);
    expect(document.querySelector('#asset-manager-panel .manager-selected-bar')).toBeNull();
  });
});
