import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BrowserWindow } from 'electron';

const { ipcHandle, showOpenDialog, showSaveDialog, compressAssetsToWebP, updateAssetReferences } = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  compressAssetsToWebP: vi.fn(),
  updateAssetReferences: vi.fn(),
}));

vi.mock('./image-compressor.js', () => ({ compressAssetsToWebP, updateAssetReferences }));

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcHandle,
  },
  dialog: {
    showOpenDialog,
    showSaveDialog,
  },
  BrowserWindow: class BrowserWindow {},
}));

import { initAssetManager, invalidateAssetsMapCache } from './asset-manager';
import { openCharxCardDocument } from '../charx-io';

function getRegisteredHandler(name: string) {
  const call = ipcHandle.mock.calls.find(([channel]) => channel === name);
  if (!call) {
    throw new Error(`Handler "${name}" was not registered`);
  }
  return call[1] as (...args: unknown[]) => unknown;
}

describe('asset mutation freshness notifications', () => {
  const temporaryDirectories: string[] = [];
  beforeEach(() => {
    ipcHandle.mockClear();
    showOpenDialog.mockReset();
    compressAssetsToWebP.mockReset();
    invalidateAssetsMapCache();
  });
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  function fixture() {
    const document = () =>
      openCharxCardDocument(
        { spec: 'chara_card_v3', spec_version: '3.0', data: { name: 'Synthetic', description: '', extensions: {} } },
        [
          { path: 'assets/icon/a.png', data: Buffer.from('aaa') },
          { path: 'assets/icon/b.png', data: Buffer.from('bbb') },
        ],
      );
    let current = document();
    const onAssetsChanged = vi.fn();
    initAssetManager({ getCurrentData: () => current, getMainWindow: () => new BrowserWindow(), onAssetsChanged });
    return {
      get current() {
        return current;
      },
      replace() {
        current = document();
      },
      onAssetsChanged,
    };
  }

  it('notifies once per actual add, rename, reorder or delete and never for no-ops', () => {
    const f = fixture();
    const add = getRegisteredHandler('add-asset-buffer');
    const rename = getRegisteredHandler('rename-asset');
    const reorder = getRegisteredHandler('reorder-asset');
    const remove = getRegisteredHandler('delete-assets');
    add({}, 'a.png', 'YQ==', 'icon');
    rename({}, 'assets/icon/a.png', 'a.png');
    reorder({}, 'assets/icon/a.png', 0);
    remove({}, ['assets/icon/missing.png']);
    expect(f.onAssetsChanged).not.toHaveBeenCalled();
    add({}, 'c.png', 'Yw==', 'icon');
    expect(f.onAssetsChanged).toHaveBeenCalledTimes(1);
    rename({}, 'assets/icon/c.png', 'renamed.png');
    expect(f.onAssetsChanged).toHaveBeenCalledTimes(2);
    reorder({}, 'assets/icon/renamed.png', 0);
    expect(f.onAssetsChanged).toHaveBeenCalledTimes(3);
    remove({}, ['assets/icon/a.png', 'assets/icon/b.png']);
    expect(f.onAssetsChanged).toHaveBeenCalledTimes(4);
    getRegisteredHandler('delete-asset')({}, 'assets/icon/renamed.png');
    expect(f.onAssetsChanged).toHaveBeenCalledTimes(5);
  });

  it('notifies once for a successful rename batch and never for an unchanged batch', () => {
    const f = fixture();
    const rename = getRegisteredHandler('rename-assets-batch');
    rename({}, [{ oldPath: 'assets/icon/a.png', newName: 'a.png' }]);
    expect(f.onAssetsChanged).not.toHaveBeenCalled();
    rename({}, [
      { oldPath: 'assets/icon/a.png', newName: 'new-a.png' },
      { oldPath: 'assets/icon/b.png', newName: 'new-b.png' },
    ]);
    expect(f.onAssetsChanged).toHaveBeenCalledOnce();
  });

  it('keeps metadata inventory reads free of binary payloads and mutations', () => {
    const f = fixture();
    const before = f.current.assets[0].data;
    const inventory = getRegisteredHandler('get-preview-asset-inventory')() as {
      documentId: string;
      entries: unknown[];
    };
    expect(typeof inventory.documentId).toBe('string');
    expect(inventory.entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(inventory)).not.toContain('data:image');
    expect(JSON.stringify(inventory)).not.toContain('"uri"');
    expect(f.current.assets[0].data).toBe(before);
    expect(f.onAssetsChanged).not.toHaveBeenCalled();
  });

  it('does not apply a dialog result to an old or replacement document', async () => {
    const f = fixture();
    const original = f.current;
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:/not-read.png'] });
    const pending = getRegisteredHandler('add-asset')({}, 'icon');
    f.replace();
    expect(await pending).toBeNull();
    expect(original.assets).toHaveLength(2);
    expect(f.current.assets).toHaveLength(2);
    expect(f.onAssetsChanged).not.toHaveBeenCalled();
  });

  it('stages all dialog files before mutation and emits one event for a successful batch', async () => {
    const f = fixture();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-asset-notify-'));
    temporaryDirectories.push(directory);
    const file = path.join(directory, 'added.png');
    fs.writeFileSync(file, 'image');
    const add = getRegisteredHandler('add-asset');
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [file, path.join(directory, 'missing.png')] });
    await expect(add({}, 'icon')).rejects.toThrow();
    expect(f.current.assets).toHaveLength(2);
    expect(f.onAssetsChanged).not.toHaveBeenCalled();
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [file, file] });
    expect(await add({}, 'icon')).toEqual([{ path: 'assets/icon/added.png', size: 5 }]);
    expect(f.onAssetsChanged).toHaveBeenCalledOnce();
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await add({}, 'icon')).toBeNull();
    expect(f.onAssetsChanged).toHaveBeenCalledOnce();
  });

  it('does not notify for compression that keeps all bytes unchanged', async () => {
    const f = fixture();
    compressAssetsToWebP.mockImplementation(async (assets) => ({ assets, details: [], stats: { converted: 0 } }));
    expect(await getRegisteredHandler('compress-assets-webp')({})).toMatchObject({ ok: true });
    expect(f.onAssetsChanged).not.toHaveBeenCalled();
  });

  it.each(['document', 'asset'] as const)('rejects compression when the %s changes during the await', async (kind) => {
    const f = fixture();
    let resolve!: (result: unknown) => void;
    compressAssetsToWebP.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const original = f.current;
    const pending = getRegisteredHandler('compress-assets-webp')({});
    await vi.waitFor(() => expect(compressAssetsToWebP).toHaveBeenCalledOnce());
    if (kind === 'document') f.replace();
    else f.current.assets[0].data = Buffer.from('new edit');
    resolve({
      assets: [{ path: 'assets/icon/a.png', data: Buffer.from('compressed') }],
      details: [],
      stats: { converted: 1 },
    });
    expect(await pending).toMatchObject({ ok: false });
    expect(original.assets).toHaveLength(2);
    expect(f.current.assets).toHaveLength(2);
    expect(f.onAssetsChanged).not.toHaveBeenCalled();
  });

  it('emits one event when compression actually replaces bytes', async () => {
    const f = fixture();
    compressAssetsToWebP.mockImplementation(async (assets) => ({
      assets: assets.map((asset: { path: string }) => ({ path: asset.path, data: Buffer.from('changed') })),
      details: [],
      stats: { converted: 2 },
    }));
    expect(await getRegisteredHandler('compress-assets-webp')({})).toMatchObject({ ok: true });
    expect(f.current.assets[0].data.toString()).toBe('changed');
    expect(f.onAssetsChanged).toHaveBeenCalledOnce();
  });
});

describe('asset-manager MIME mapping', () => {
  beforeEach(() => {
    ipcHandle.mockClear();
    invalidateAssetsMapCache();
  });

  it('keeps non-image embedded assets on their correct MIME types in get-all-assets-map', () => {
    const currentData = {
      _risuExt: {},
      cardAssets: [
        {
          name: 'themeAudio',
          uri: 'embeded://assets/audio/theme.mp3',
          ext: 'mp3',
        },
        {
          name: 'mainFont',
          uri: 'embeded://assets/fonts/main.woff2',
          ext: 'woff2',
        },
        {
          name: 'introVideo',
          uri: 'embeded://assets/video/intro.mp4',
          ext: 'mp4',
        },
      ],
      assets: [
        { path: 'assets/audio/theme.mp3', data: Buffer.from('fake-audio') },
        { path: 'assets/fonts/main.woff2', data: Buffer.from('fake-font') },
        { path: 'assets/video/intro.mp4', data: Buffer.from('fake-video') },
      ],
      _moduleData: null,
      risumAssets: [],
    };

    initAssetManager({
      getCurrentData: () => currentData,
      getMainWindow: () => null,
    });

    const getAllAssetsMap = getRegisteredHandler('get-all-assets-map');
    const result = getAllAssetsMap();

    expect(result).toMatchObject({
      assets: {
        themeAudio: expect.stringMatching(/^data:audio\/mpeg;base64,/),
        mainFont: expect.stringMatching(/^data:font\/woff2;base64,/),
        introVideo: expect.stringMatching(/^data:video\/mp4;base64,/),
      },
    });
  });
});

describe('asset-manager mutation consistency', () => {
  beforeEach(() => {
    ipcHandle.mockClear();
    invalidateAssetsMapCache();
  });

  it('adds card and x_meta references for valid buffer assets and rejects invalid names', () => {
    const currentData = {
      assets: [] as Array<{ path: string; data: Buffer }>,
      cardAssets: [] as Array<Record<string, unknown>>,
      xMeta: {} as Record<string, unknown>,
    };
    initAssetManager({
      getCurrentData: () => currentData,
      getMainWindow: () => null,
    });
    const addAssetBuffer = getRegisteredHandler('add-asset-buffer');

    expect(addAssetBuffer({}, '../bad.png', Buffer.from('bad').toString('base64'), 'other')).toBeNull();
    expect(addAssetBuffer({}, 'portrait.png', Buffer.from('image').toString('base64'), 'other')).toEqual({
      path: 'assets/other/image/portrait.png',
      size: 5,
    });
    expect(currentData.cardAssets).toContainEqual({
      type: 'x-risu-asset',
      uri: 'embeded://assets/other/image/portrait.png',
      name: 'portrait',
      ext: 'png',
    });
    expect(currentData.xMeta).toHaveProperty('portrait');
  });

  it('renames and deletes asset references while rejecting path collisions', () => {
    const currentData = {
      assets: [
        { path: 'assets/icon/old.png', data: Buffer.from('old') },
        { path: 'assets/icon/existing.png', data: Buffer.from('existing') },
      ],
      cardAssets: [{ type: 'icon', uri: 'embeded://assets/icon/old.png', name: 'old', ext: 'png' }],
      xMeta: { old: { type: 'PNG' }, existing: { type: 'PNG' } },
    };
    initAssetManager({
      getCurrentData: () => currentData,
      getMainWindow: () => null,
    });

    const renameAsset = getRegisteredHandler('rename-asset');
    const deleteAsset = getRegisteredHandler('delete-asset');

    expect(renameAsset({}, 'assets/icon/old.png', 'existing.png')).toBeNull();
    expect(renameAsset({}, 'assets/icon/old.png', 'new.webp')).toBe('assets/icon/new.webp');
    expect(currentData.cardAssets[0]).toMatchObject({
      uri: 'embeded://assets/icon/new.webp',
      name: 'new',
      ext: 'webp',
    });
    expect(currentData.xMeta).not.toHaveProperty('old');
    expect(currentData.xMeta).toHaveProperty('new');

    expect(deleteAsset({}, 'assets/icon/new.webp')).toBe(true);
    expect(currentData.cardAssets).toEqual([]);
    expect(currentData.xMeta).not.toHaveProperty('new');
  });

  it('renames assets in batches only after preflighting all conflicts', () => {
    const currentData = {
      assets: [
        { path: 'assets/icon/old.png', data: Buffer.from('old') },
        { path: 'assets/other/image/portrait.webp', data: Buffer.from('portrait') },
        { path: 'assets/other/image/existing.png', data: Buffer.from('existing') },
      ],
      cardAssets: [
        { type: 'icon', uri: 'embeded://assets/icon/old.png', name: 'old', ext: 'png' },
        { type: 'x-risu-asset', uri: 'embeded://assets/other/image/portrait.webp', name: 'portrait', ext: 'webp' },
      ],
      xMeta: { old: { type: 'PNG' }, portrait: { type: 'WEBP' }, existing: { type: 'PNG' } },
    };
    initAssetManager({
      getCurrentData: () => currentData,
      getMainWindow: () => null,
    });

    const renameAssetsBatch = getRegisteredHandler('rename-assets-batch');
    expect(
      renameAssetsBatch({}, [
        { oldPath: 'assets/icon/old.png', newName: 'portrait.webp' },
        { oldPath: 'assets/other/image/portrait.webp', newName: 'face.webp' },
      ]),
    ).toMatchObject({
      ok: false,
      conflicts: expect.arrayContaining([expect.stringContaining('확장자는 .png')]),
    });
    expect(currentData.assets[0].path).toBe('assets/icon/old.png');

    expect(
      renameAssetsBatch({}, [
        { oldPath: 'assets/icon/old.png', newName: 'hero.png' },
        { oldPath: 'assets/other/image/portrait.webp', newName: 'face.webp' },
      ]),
    ).toEqual({
      ok: true,
      renamed: [
        { oldPath: 'assets/icon/old.png', newPath: 'assets/icon/hero.png' },
        { oldPath: 'assets/other/image/portrait.webp', newPath: 'assets/other/image/face.webp' },
      ],
    });
    expect(currentData.assets.map((asset) => asset.path)).toEqual([
      'assets/icon/hero.png',
      'assets/other/image/face.webp',
      'assets/other/image/existing.png',
    ]);
    expect(currentData.cardAssets).toEqual([
      { type: 'icon', uri: 'embeded://assets/icon/hero.png', name: 'hero', ext: 'png' },
      { type: 'x-risu-asset', uri: 'embeded://assets/other/image/face.webp', name: 'face', ext: 'webp' },
    ]);
    expect(currentData.xMeta).not.toHaveProperty('old');
    expect(currentData.xMeta).not.toHaveProperty('portrait');
    expect(currentData.xMeta).toHaveProperty('hero');
    expect(currentData.xMeta).toHaveProperty('face');
  });
});
