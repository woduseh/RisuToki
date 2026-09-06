import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DocumentReview from './DocumentReview.vue';
import type { RendererDocumentData } from '../lib/document-types';

const baseline = {
  name: '저장본',
  description: 'line one\n<script>alert(1)</script>',
  _fileType: 'charx',
} as RendererDocumentData;
function review(extra: Record<string, unknown> = {}) {
  return mount(DocumentReview, {
    props: {
      baseline,
      current: { ...baseline, name: '작업본' },
      assets: [],
      loading: false,
      error: '',
      baselineLabel: '마지막 저장',
      baselineUnavailable: null,
      externalChanged: false,
      ...extra,
    },
  });
}

describe('DocumentReview', () => {
  it('shows the unchanged state when only the automatic save timestamp differs', () => {
    const wrapper = review({
      baseline: { ...baseline, modificationDate: 200 },
      current: { ...baseline, modificationDate: 100 },
    });
    expect(wrapper.text()).toContain('저장본과 동일해요. 변경된 내용이 없어요.');
    expect(wrapper.find('.review-list').exists()).toBe(false);
  });

  it('shows saved and current text safely and emits explicit restore and source requests', async () => {
    const wrapper = review({ current: { ...baseline, description: 'changed' } });
    expect(wrapper.find('.review-comparison').text()).toContain('<script>alert(1)</script>');
    expect(wrapper.find('script').exists()).toBe(false);
    const buttons = wrapper.findAll('.review-actions button');
    await buttons[0].trigger('click');
    expect(wrapper.emitted('open')?.[0]).toEqual([{ field: 'description', index: undefined }]);
    await buttons[1].trigger('click');
    expect(wrapper.emitted('restore')?.[0]?.[0]).toMatchObject({ field: 'description', before: baseline.description });
  });

  it('distinguishes unavailable baselines and permits restoration against a refreshed external save', async () => {
    const wrapper = review({ baseline: null, baselineUnavailable: '아직 저장하지 않은 문서예요.' });
    expect(wrapper.text()).toContain('아직 저장하지 않은 문서예요.');
    expect(wrapper.text()).not.toContain('변경된 내용이 없어요');
    await wrapper.setProps({ baseline, baselineUnavailable: null, externalChanged: true });
    expect(wrapper.findAll('.review-actions button')[1].attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('현재 디스크의 저장본 기준');
    await wrapper.setProps({ current: baseline, externalChanged: false });
    expect(wrapper.text()).toContain('변경된 내용이 없어요');
  });

  it('keeps the selected change across draft refreshes and exposes asset restoration', async () => {
    const asset = {
      path: 'assets/a.png',
      kind: 'removed' as const,
      before: { size: 1024, hash: 'abc' },
      canRestore: true,
    };
    const wrapper = review({ assets: [asset] });
    await wrapper.findAll('.review-list button')[1].trigger('click');
    await wrapper.setProps({ current: { ...baseline, name: '더 수정' } });
    expect(wrapper.find('.review-detail h3').text()).toBe(asset.path);
    await wrapper.find('.review-detail-header button').trigger('click');
    expect(wrapper.emitted('restoreAsset')?.[0]).toEqual([asset]);
  });

  it('blocks restoration of stale drafts while still permitting a fresh comparison', async () => {
    const wrapper = review({ restoreBlocked: true });
    expect(wrapper.findAll('.review-actions button')[1].attributes('disabled')).toBeDefined();
    const refresh = wrapper.get('.review-header button');
    expect(refresh.attributes('disabled')).toBeUndefined();
    await refresh.trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });
});
