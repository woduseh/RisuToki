import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DocumentDiagnostics from './DocumentDiagnostics.vue';
import type { RendererDocumentData } from '../lib/document-types';
import type { DocumentDiagnostic } from '../lib/document-diagnostics';

function data(overrides: Record<string, unknown> = {}): RendererDocumentData {
  return {
    _fileType: 'risum',
    _documentId: 'one',
    name: 'Module',
    description: '',
    firstMessage: '',
    alternateGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: 'scope.value=1',
    lua: '',
    triggerScripts: '[]',
    lorebook: [],
    regex: [],
    customModuleToggle: 'show=표시\nscene=장면=select=낮,밤',
    ...overrides,
  } as RendererDocumentData;
}
const issue: DocumentDiagnostic = {
  id: 'syntax',
  severity: 'warning',
  code: 'example',
  message: '합성 경고',
  source: { field: 'description', line: 2 },
};
function render(current: RendererDocumentData | null = data(), extra = {}) {
  return mount(DocumentDiagnostics, {
    props: {
      current,
      diagnostics: [issue],
      assets: null,
      loading: false,
      stale: false,
      error: '',
      rawDraftWarning: '',
      checkedAt: 1000,
      ...extra,
    },
  });
}
function button(wrapper: ReturnType<typeof render>, label: string) {
  const found = wrapper.findAll('button').find((entry) => entry.text() === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

describe('DocumentDiagnostics', () => {
  it('starts newly arriving modules on composition and renders shared-parser valid toggle states', async () => {
    const wrapper = render(null);
    await wrapper.setProps({ current: data() });
    expect(button(wrapper, '모듈 구성').attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('체크박스');
    expect(wrapper.text()).toContain('낮 · 밤');
    expect(wrapper.text()).not.toContain('이 형식은 요약할 수 없어요');
    await button(wrapper, '검사 결과').trigger('click');
    await wrapper.setProps({ current: data({ description: '새 검사본' }) });
    expect(button(wrapper, '검사 결과').attributes('aria-pressed')).toBe('true');
    await wrapper.setProps({ current: data({ _documentId: 'two' }) });
    expect(button(wrapper, '모듈 구성').attributes('aria-pressed')).toBe('true');
  });

  it('shows declarative module details and emits precise source locations without executing code', async () => {
    const wrapper = render(
      data({
        lorebook: [
          { mode: 'folder', comment: '폴더' },
          { comment: '세계관', key: 'city', insertorder: 20, content: '@@probability 30\ntext' },
        ],
        triggerScripts: JSON.stringify([
          {
            comment: '시작',
            type: 'start',
            conditions: [],
            effect: [{ type: 'triggerlua', code: 'error("never execute")' }],
          },
        ]),
      }),
    );
    expect(wrapper.text()).toContain('활성 확률 30%');
    expect(wrapper.text()).toContain('실제 활성화 여부는 대화와 설정에 따라 달라져요');
    await button(wrapper, '세계관').trigger('click');
    await button(wrapper, 'scope.value').trigger('click');
    await button(wrapper, '시작').trigger('click');
    expect(wrapper.emitted('open')).toEqual([
      [{ field: 'lorebook', index: 1 }],
      [{ field: 'defaultVariables', path: '$.defaultVariables', line: 1 }],
      [{ field: 'triggerScripts', index: 0 }],
    ]);
  });

  it.each([{ stale: true }, { rawDraftWarning: '미반영 원문 초안' }, { error: '읽기 실패' }])(
    'blocks source navigation but keeps retry available for %j',
    async (state) => {
      const wrapper = render(data(), state);
      expect(button(wrapper, '토글 편집').attributes('disabled')).toBeDefined();
      await button(wrapper, '검사 결과').trigger('click');
      expect(wrapper.get('.diagnostic-list button').attributes('disabled')).toBeDefined();
      await button(wrapper, '다시 검사').trigger('click');
      expect(wrapper.emitted('refresh')).toHaveLength(1);
    },
  );

  it('distinguishes invalid trigger JSON and logical asset counts from empty configuration or physical file counts', async () => {
    const wrapper = render(data({ triggerScripts: '{', customModuleToggle: '=unknown' }), {
      assets: {
        names: ['one', 'alias'],
        documentId: 'one',
        unresolved: [],
        entries: [
          { name: 'one', source: 'zip', path: 'a.png', ext: 'png', mime: 'image/png', type: 'image' },
          { name: 'alias', source: 'zip', path: 'a.png', ext: 'png', mime: 'image/png', type: 'image' },
        ],
      },
    });
    expect(wrapper.text()).toContain('트리거 JSON을 읽지 못했어요');
    expect(wrapper.text()).toContain('이 형식은 요약할 수 없어요');
    const assetsButton = wrapper.findAll('.module-counts button')[0];
    expect(assetsButton.text()).toBe('에셋 항목 1');
    expect(wrapper.text()).toContain('실제 파일 개수와 다를 수 있어요');
    await assetsButton.trigger('click');
    expect(wrapper.emitted('assets')).toHaveLength(1);
  });

  it('does not report a clean result for a failed or stale inspection', async () => {
    const wrapper = render(data({ _fileType: 'charx' }), { diagnostics: [], error: '검사 실패' });
    expect(wrapper.text()).not.toContain('발견된 문제가 없어요');
    await wrapper.setProps({ error: '', stale: true });
    expect(wrapper.text()).not.toContain('발견된 문제가 없어요');
    await wrapper.setProps({ stale: false });
    expect(wrapper.text()).toContain('검사 범위에서 발견된 문제가 없어요');
  });
});
