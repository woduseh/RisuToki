import { describe, expect, it } from 'vitest';

import { buildPreviewAssets } from './preview-assets';

describe('buildPreviewAssets', () => {
  it('resolves legacy __asset indexes and keeps media metadata', () => {
    const result = buildPreviewAssets({
      assets: [
        { path: 'assets/other/image/hero.webp', data: Buffer.from('hero') },
        { path: 'assets/audio/theme.mp3', data: Buffer.from('audio') },
      ],
      _risuExt: {
        additionalAssets: [
          ['hero', '__asset:0', 'webp'],
          ['theme', '__asset:1', 'mp3'],
        ],
      },
    });

    expect(result.assets.hero).toMatch(/^data:image\/webp;base64,/);
    expect(result.assets.theme).toMatch(/^data:audio\/mpeg;base64,/);
    expect(result.assets['__asset:1']).toBe(result.assets.theme);
    expect(result.manifest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'theme',
          ext: 'mp3',
          mime: 'audio/mpeg',
          source: 'risu-extension',
          path: 'assets/audio/theme.mp3',
        }),
      ]),
    );
  });

  it('resolves embeded and ccdefault assets and exposes the character source icon', () => {
    const result = buildPreviewAssets({
      assets: [
        { path: 'assets/icon/main.png', data: Buffer.from('icon') },
        { path: 'assets/other/image/scene.png', data: Buffer.from('scene') },
      ],
      cardAssets: [
        { type: 'icon', name: 'main', uri: 'embeded://assets/icon/main.png', ext: 'png' },
        { type: 'x-risu-asset', name: 'scene', uri: 'embeded://assets/other/image/scene.png', ext: 'png' },
        { type: 'icon', name: 'alternate', uri: 'ccdefault:', ext: 'png' },
      ],
    });

    expect(result.icon).toMatch(/^data:image\/png;base64,/);
    expect(result.assets['__source:char']).toBe(result.icon);
    expect(result.assets['ccdefault:']).toBe(result.icon);
    expect(result.assets.alternate).toBe(result.icon);
    expect(result.assets.scene).toMatch(/^data:image\/png;base64,/);
  });

  it('does not let an unresolved legacy entry hide a valid card asset with the same name', () => {
    const result = buildPreviewAssets({
      assets: [{ path: 'assets/video/intro.mp4', data: Buffer.from('video') }],
      _risuExt: {
        additionalAssets: [['intro', '__asset:99', 'mp4']],
      },
      cardAssets: [{ type: 'x-risu-asset', name: 'intro', uri: 'embeded://assets/video/intro.mp4', ext: 'mp4' }],
    });

    expect(result.assets.intro).toMatch(/^data:video\/mp4;base64,/);
    expect(result.debug.unresolved).toContain('intro');
  });

  it('normalizes raw v2 base64 assets into data URIs', () => {
    const encoded = Buffer.from('legacy-image').toString('base64');
    const result = buildPreviewAssets({
      _risuExt: {
        additionalAssets: [['legacy', encoded, 'png']],
      },
    });

    expect(result.assets.legacy).toBe(`data:image/png;base64,${encoded}`);
  });
});
