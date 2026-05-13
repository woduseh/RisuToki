import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    deleteLorebook: vi.fn(),
    deleteLorebookMany: vi.fn(),
    moveLorebookManyToFolder: vi.fn(),
    openImageTab: vi.fn(),
    addAssetFromDialog: vi.fn(),
    addAssetBuffer: vi.fn(),
    renameAsset: vi.fn(),
    deleteAssets: vi.fn(),
    getAssetList: vi.fn().mockResolvedValue([{ path: 'assets/icon/hero.webp', size: 2048 }]),
    getAssetData: vi.fn().mockResolvedValue('AAAA'),
    setStatus: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

describe('right-manager-panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="lore-manager-panel"></div><div id="asset-manager-panel"></div>';
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

  it('renders asset thumbnails in the asset tab', async () => {
    const deps = makeDeps();
    initRightManagerPanel(deps);
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
});
