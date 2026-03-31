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
