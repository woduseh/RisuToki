import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcHandle, showOpenDialog, showSaveDialog } = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
}));

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

function getRegisteredHandler(name: string) {
  const call = ipcHandle.mock.calls.find(([channel]) => channel === name);
  if (!call) {
    throw new Error(`Handler "${name}" was not registered`);
  }
  return call[1] as (...args: unknown[]) => unknown;
}

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
});
