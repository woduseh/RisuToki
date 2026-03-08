import { describe, expect, it } from 'vitest';
import { buildPreviewDebugClipboardText, renderPreviewDebugHtml } from './preview-debug';
import type { PreviewSnapshot } from './preview-session';

const snapshot: PreviewSnapshot = {
  defaultVariables: '{"affinity":0}',
  loreMatches: [{ index: 0, reason: '키 매칭' }],
  lorebook: [
    { comment: '인사', key: '안녕', mode: 'normal', alwaysActive: false },
    { comment: '폴더', key: '', mode: 'folder', alwaysActive: false }
  ],
  luaInitialized: false,
  luaOutput: ['trigger:start'],
  messages: [
    { role: 'char', content: '안녕, 테스트 중이야.' },
    { role: 'user', content: '반가워' }
  ],
  scripts: [
    { type: 'editinput', comment: '입력 전처리', find: 'foo', replace: 'bar', ableFlag: true }
  ],
  variables: {
    affinity: 12
  }
};

describe('preview debug helpers', () => {
  it('builds clipboard text with summary counts and message snippets', () => {
    const text = buildPreviewDebugClipboardText(snapshot, '12:34:56');

    expect(text).toContain('=== 프리뷰 디버그 (12:34:56) ===');
    expect(text).toContain('[로어북] 1개');
    expect(text).toContain('[정규식] 1개');
    expect(text).toContain('[char] 안녕, 테스트 중이야.');
  });

  it('renders the variables and lorebook tabs with escaped content', () => {
    const variablesHtml = renderPreviewDebugHtml({ activeTab: 'variables', snapshot });
    const lorebookHtml = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot });

    expect(variablesHtml).toContain('affinity');
    expect(variablesHtml).toContain('12');
    expect(variablesHtml).toContain('{"affinity":0}');
    expect(lorebookHtml).toContain('인사');
    expect(lorebookHtml).toContain('🟢 키 매칭');
  });

  it('renders lua initialization controls and regex summaries', () => {
    const luaHtml = renderPreviewDebugHtml({
      activeTab: 'lua',
      snapshot,
      luaInitButtonId: 'custom-lua-init'
    });
    const regexHtml = renderPreviewDebugHtml({ activeTab: 'regex', snapshot });

    expect(luaHtml).toContain('id="custom-lua-init"');
    expect(luaHtml).toContain('trigger:start');
    expect(regexHtml).toContain('editinput (1)');
    expect(regexHtml).toContain('입력 전처리');
    expect(regexHtml).toContain('foo');
    expect(regexHtml).toContain('bar');
  });
});
