// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { RendererDocumentData } from '../lib/document-types';
import { createDocumentStatsController } from './document-stats-controller';

function document(name: string, type: 'charx' | 'risup' = 'charx'): RendererDocumentData {
  return {
    name,
    _fileType: type,
    description: '',
    firstMessage: '',
    alternateGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: '[]',
    lorebook: [],
    regex: [],
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function deferred() {
  let resolve!: (count: number) => void;
  const promise = new Promise<number>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('document stats request ownership', () => {
  it('shares one asset request across forty redraws and publishes current text/dirty state', async () => {
    const request = deferred();
    const readAssetCount = vi.fn(() => request.promise);
    let text = '';
    let dirty = false;
    const data = document('Synthetic');
    const publish = vi.fn();
    const controller = createDocumentStatsController({
      readAssetCount,
      publish,
      getInput: () => ({ data, dirty, activeTab: { getValue: () => text } }),
    });
    for (let i = 0; i < 40; i++) {
      text += '가';
      dirty = true;
      controller.update();
    }
    expect(readAssetCount).toHaveBeenCalledOnce();
    request.resolve(1000);
    await flush();
    expect(publish).toHaveBeenLastCalledWith('CHARX · 수정됨 · 로어북 0 · 정규식 0 · 에셋 1000 · 탭 40자');
    for (let i = 0; i < 40; i++) controller.update();
    expect(readAssetCount).toHaveBeenCalledOnce();
  });

  it.each(['document', 'assets'] as const)('ignores an old response after %s changes', async (change) => {
    const first = deferred();
    const second = deferred();
    const readAssetCount = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    let data = document('First');
    const publish = vi.fn();
    const controller = createDocumentStatsController({
      readAssetCount,
      publish,
      getInput: () => ({ data, dirty: false }),
    });
    controller.update();
    if (change === 'document') data = document('Second');
    else controller.invalidateAssets();
    controller.update();
    second.resolve(2);
    await flush();
    first.resolve(99);
    await flush();
    expect(publish).toHaveBeenLastCalledWith('CHARX · 저장됨 · 로어북 0 · 정규식 0 · 에셋 2');
    expect(readAssetCount).toHaveBeenCalledTimes(2);
  });

  it('does not request counts for empty/preset documents and does not spin on IPC failure', async () => {
    let data: RendererDocumentData | null = null;
    const readAssetCount = vi.fn().mockRejectedValueOnce(new Error('IPC unavailable')).mockResolvedValue(3);
    const publish = vi.fn();
    const controller = createDocumentStatsController({
      readAssetCount,
      publish,
      getInput: () => ({ data, dirty: false }),
    });
    controller.update();
    expect(publish).toHaveBeenLastCalledWith('');
    data = document('Preset', 'risup');
    controller.update();
    expect(readAssetCount).not.toHaveBeenCalled();
    data = document('Card');
    controller.update();
    await flush();
    controller.update();
    expect(readAssetCount).toHaveBeenCalledOnce();
    controller.invalidateAssets();
    controller.update();
    await flush();
    expect(readAssetCount).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith('CHARX · 저장됨 · 로어북 0 · 정규식 0 · 에셋 3');
  });
});
