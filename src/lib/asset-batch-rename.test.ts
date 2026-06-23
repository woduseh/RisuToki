import { describe, expect, it } from 'vitest';
import { planAssetBatchRename } from './asset-batch-rename';

const assets = [
  { path: 'assets/icon/hero.webp' },
  { path: 'assets/other/image/scene.png' },
  { path: 'assets/other/image/extra.png' },
  { path: 'assets/other/image/existing.png' },
];

describe('planAssetBatchRename', () => {
  it('creates pattern-number operations while preserving folders and extensions', () => {
    const plan = planAssetBatchRename(assets, ['assets/icon/hero.webp', 'assets/other/image/scene.png'], {
      kind: 'pattern',
      baseName: 'card_asset',
      start: 1,
      padding: 3,
    });

    expect(plan.errors).toEqual([]);
    expect(plan.operations).toEqual([
      { oldPath: 'assets/icon/hero.webp', newName: 'card_asset_001.webp' },
      { oldPath: 'assets/other/image/scene.png', newName: 'card_asset_002.png' },
    ]);
    expect(plan.preview.map((item) => item.newPath)).toEqual([
      'assets/icon/card_asset_001.webp',
      'assets/other/image/card_asset_002.png',
    ]);
  });

  it('creates find-replace operations on file stems only', () => {
    const plan = planAssetBatchRename(assets, ['assets/other/image/scene.png', 'assets/other/image/extra.png'], {
      kind: 'replace',
      find: 'e',
      replace: 'E',
    });

    expect(plan.errors).toEqual([]);
    expect(plan.operations).toEqual([
      { oldPath: 'assets/other/image/scene.png', newName: 'scEnE.png' },
      { oldPath: 'assets/other/image/extra.png', newName: 'Extra.png' },
    ]);
  });

  it('blocks invalid names, duplicate planned paths, and existing-path collisions', () => {
    expect(
      planAssetBatchRename(assets, ['assets/icon/hero.webp', 'assets/other/image/scene.png'], {
        kind: 'pattern',
        baseName: 'bad/name',
      }).errors,
    ).toEqual(expect.arrayContaining([expect.stringContaining('사용할 수 없는')]));

    expect(
      planAssetBatchRename(assets, ['assets/other/image/scene.png', 'assets/other/image/extra.png'], {
        kind: 'replace',
        find: 'scene',
        replace: 'existing',
      }).errors,
    ).toEqual(expect.arrayContaining([expect.stringContaining('이미 존재')]));

    expect(
      planAssetBatchRename(assets, ['assets/other/image/scene.png', 'assets/other/image/extra.png'], {
        kind: 'replace',
        find: 'scene',
        replace: 'extra',
      }).errors,
    ).toEqual(expect.arrayContaining([expect.stringContaining('선택된 다른 에셋')]));
  });
});
