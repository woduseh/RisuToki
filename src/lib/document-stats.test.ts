import { describe, expect, it } from 'vitest';
import { formatDocumentStats, summarizeDocumentStats } from './document-stats';

describe('document stats', () => {
  it('summarizes charx counts, dirty state, and active tab characters', () => {
    const stats = summarizeDocumentStats({
      data: {
        _fileType: 'charx',
        lorebook: [{ comment: 'One' }, { comment: 'Two' }],
        regex: [{ name: 'Trim' }],
        assets: [{ path: 'assets/icon/a.png' }, { path: 'assets/other/image/b.png' }],
      } as never,
      dirty: true,
      activeTab: { getValue: () => 'hello world' },
    });

    expect(stats).toEqual({
      fileType: 'CHARX',
      dirty: true,
      lorebookCount: 2,
      regexCount: 1,
      assetCount: 2,
      activeTabChars: 11,
    });
    expect(formatDocumentStats(stats)).toBe('CHARX · 수정됨 · 로어북 2 · 정규식 1 · 에셋 2 · 탭 11자');
  });

  it('uses document-specific type labels and omits tab counts without an active tab', () => {
    expect(
      formatDocumentStats(
        summarizeDocumentStats({
          data: { _fileType: 'risum', lorebook: [], regex: [], assets: [] } as never,
          dirty: false,
          activeTab: null,
        }),
      ),
    ).toBe('RISUM · 저장됨 · 로어북 0 · 정규식 0 · 에셋 0');

    expect(
      summarizeDocumentStats({
        data: { _fileType: 'risup' } as never,
        dirty: false,
      }).fileType,
    ).toBe('RISUP');
  });
});
