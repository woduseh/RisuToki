import { describe, expect, it } from 'vitest';
import { buildPreviewDebugClipboardText, renderPreviewDebugHtml } from './preview-debug';
import type { PreviewSnapshot } from './preview-session';

const snapshot: PreviewSnapshot = {
  defaultVariables: '{"affinity":0}',
  loreMatches: [{ index: 0, reason: '키 매칭' }],
  lorebook: [
    { comment: '인사', key: '안녕', mode: 'normal', alwaysActive: false },
    { comment: '폴더', key: '', mode: 'folder', alwaysActive: false },
  ],
  luaInitialized: false,
  luaOutput: ['trigger:start'],
  messages: [
    { role: 'char', content: '안녕, 테스트 중이야.' },
    { role: 'user', content: '반가워' },
  ],
  scripts: [{ type: 'editinput', comment: '입력 전처리', find: 'foo', replace: 'bar', ableFlag: true }],
  variables: {
    affinity: 12,
  },
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
      luaInitButtonId: 'custom-lua-init',
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

// ── Enhanced clipboard text ──────────────────────────────────────────

describe('clipboard text: variable dump', () => {
  it('includes variable key=value pairs in clipboard text', () => {
    const text = buildPreviewDebugClipboardText(snapshot, '00:00:00');
    expect(text).toContain('[변수]');
    expect(text).toContain('affinity = 12');
  });

  it('shows "없음" when no variables exist', () => {
    const empty: PreviewSnapshot = {
      ...snapshot,
      variables: {},
    };
    const text = buildPreviewDebugClipboardText(empty, '00:00:00');
    expect(text).toContain('[변수] 없음');
  });
});

describe('clipboard text: lorebook match details', () => {
  it('lists matched lorebook entries with reasons', () => {
    const text = buildPreviewDebugClipboardText(snapshot, '00:00:00');
    expect(text).toContain('인사');
    expect(text).toContain('키 매칭');
  });

  it('includes probability annotation for probabilistic matches', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '확률항목', key: 'word', mode: 'normal', activationPercent: 70 }],
      loreMatches: [{ index: 0, reason: '키 매칭', activationPercent: 70 }],
    };
    const text = buildPreviewDebugClipboardText(snap, '00:00:00');
    expect(text).toContain('70%');
  });
});

describe('clipboard text: decorator-aware details', () => {
  it('includes matched keys for active lore matches', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '매칭키', key: 'a, b', mode: 'normal' }],
      loreMatches: [{ index: 0, reason: '키 매칭', matchedKeys: ['a', 'b'] }],
    };
    const text = buildPreviewDebugClipboardText(snap, '00:00:00');
    expect(text).toContain('매칭: a, b');
  });

  it('includes checked excluded keys for active lore matches', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '제외키', key: 'x', mode: 'normal' }],
      loreMatches: [{ index: 0, reason: '@@activate', excludedKeys: ['badword'] }],
    };
    const text = buildPreviewDebugClipboardText(snap, '00:00:00');
    expect(text).toContain('제외키: badword');
  });

  it('includes decorator summary for active lore matches', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '데코', key: 'k', mode: 'normal' }],
      loreMatches: [
        {
          index: 0,
          reason: '키 매칭',
          decorators: { depth: 2, role: 'user', matchFullWord: true },
        },
      ],
    };
    const text = buildPreviewDebugClipboardText(snap, '00:00:00');
    expect(text).toContain('depth:2');
    expect(text).toContain('role:user');
    expect(text).toContain('fullword');
  });

  it('includes probability roll explanations for probabilistic matches', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '확률', key: 'k', mode: 'normal' }],
      loreMatches: [
        {
          index: 0,
          reason: '키 매칭',
          activationPercent: 70,
          probabilityRoll: 37,
        },
      ],
    };
    const text = buildPreviewDebugClipboardText(snap, '00:00:00');
    expect(text).toContain('확률 통과 (37 <= 70)');
  });

  it('omits probability text for @@activate matches that bypass probabilistic gating', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '강제', key: 'k', mode: 'normal' }],
      loreMatches: [
        {
          index: 0,
          reason: '@@activate',
          activationPercent: 70,
          probabilityRoll: 93,
        },
      ],
    };
    const text = buildPreviewDebugClipboardText(snap, '00:00:00');
    expect(text).not.toContain('확률 실패');
    expect(text).not.toContain('확률 통과');
  });

  it('includes warnings for malformed decorator metadata', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '경고', key: 'k', mode: 'normal' }],
      loreMatches: [{ index: 0, reason: '키 매칭', warnings: ['잘못된 @@probability 값'] }],
    };
    const text = buildPreviewDebugClipboardText(snap, '00:00:00');
    expect(text).toContain('⚠ 잘못된 @@probability 값');
  });
});

describe('clipboard text: disabled regex count', () => {
  it('shows disabled regex count alongside active count', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      scripts: [
        { type: 'editinput', comment: 'active', find: 'a', replace: 'b', ableFlag: true },
        { type: 'editinput', comment: 'disabled', find: 'c', replace: 'd', ableFlag: false },
        { type: 'editoutput', comment: 'disabled2', find: 'e', replace: 'f', ableFlag: false },
      ],
    };
    const text = buildPreviewDebugClipboardText(snap, '00:00:00');
    // "1개 활성, 2개 비활성" or similar
    expect(text).toContain('1개 활성');
    expect(text).toContain('2개 비활성');
  });

  it('omits disabled count when no scripts are disabled', () => {
    const text = buildPreviewDebugClipboardText(snapshot, '00:00:00');
    // "개 비활성" would appear only if there are disabled regex scripts
    expect(text).not.toContain('개 비활성');
  });
});

// ── Enhanced lorebook tab ────────────────────────────────────────────

describe('lorebook tab: summary banner', () => {
  it('shows activation summary at top of lorebook tab', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [
        { comment: 'a', key: 'k1', mode: 'normal' },
        { comment: 'b', key: 'k2', mode: 'normal' },
        { comment: 'c', key: 'k3', mode: 'normal', activationPercent: 50 },
        { comment: 'folder', key: '', mode: 'folder' },
      ],
      loreMatches: [
        { index: 0, reason: '키 매칭' },
        { index: 2, reason: '키 매칭', activationPercent: 50 },
      ],
    };
    const html = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot: snap });
    // Summary: 2 out of 3 active (folders excluded), 1 probabilistic
    expect(html).toContain('2/3');
    expect(html).toContain('확률');
  });
});

describe('lorebook tab: insertorder column', () => {
  it('shows insertorder value when present on entries', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: 'ordered', key: 'k1', mode: 'normal', insertorder: 200 }],
      loreMatches: [],
    };
    const html = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot: snap });
    expect(html).toContain('200');
    // Column header for insertorder
    expect(html).toContain('순서');
  });
});

describe('lorebook tab: selective/secondkey badge', () => {
  it('shows secondkey info when selective is true', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: 'selective-entry', key: 'main', mode: 'normal', selective: true, secondkey: 'sub' }],
      loreMatches: [],
    };
    const html = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot: snap });
    expect(html).toContain('sub');
    expect(html).toContain('🔗');
  });
});

describe('lorebook tab: decorator metadata', () => {
  it('shows depth, role, and position metadata for active decorated entries', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '데코', key: 'hello', mode: 'normal' }],
      loreMatches: [
        {
          index: 0,
          reason: '키 매칭',
          decorators: { depth: 3, role: 'system', position: 'afterCharDefs', matchFullWord: true },
        },
      ],
    };
    const html = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot: snap });
    expect(html).toContain('depth:3');
    expect(html).toContain('role:system');
    expect(html).toContain('position:afterCharDefs');
    expect(html).toContain('fullword');
  });

  it('shows effective scan depth overrides for active entries', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '스캔', key: 'k', mode: 'normal' }],
      loreMatches: [{ index: 0, reason: '키 매칭', effectiveScanDepth: 5 }],
    };
    const html = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot: snap });
    expect(html).toContain('scan:5');
  });

  it('shows probability roll detail in the lorebook status cell', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '확률', key: 'k', mode: 'normal' }],
      loreMatches: [
        {
          index: 0,
          reason: '키 매칭',
          activationPercent: 70,
          probabilityRoll: 37,
        },
      ],
    };
    const html = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot: snap });
    expect(html).toContain('확률 통과 (37 <= 70)');
  });

  it('renders escaped warnings without breaking the table layout', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: 'xss', key: 'k', mode: 'normal' }],
      loreMatches: [
        {
          index: 0,
          reason: '키 매칭',
          warnings: ['<script>alert(1)</script>'],
        },
      ],
    };
    const html = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot: snap });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('</table>');
  });

  it('does not show a green alwaysActive badge when an alwaysActive entry is inactive', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      lorebook: [{ comment: '억제됨', key: '', mode: 'normal', alwaysActive: true }],
      loreMatches: [],
    };
    const html = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot: snap });
    expect(html).toContain('⚫ 항상');
    expect(html).not.toContain('🟢 항상');
  });
});

// ── Enhanced regex tab ───────────────────────────────────────────────

describe('regex tab: disabled scripts section', () => {
  it('shows disabled scripts in a separate greyed-out section', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      scripts: [
        { type: 'editinput', comment: 'active-script', find: 'x', replace: 'y', ableFlag: true },
        { type: 'editinput', comment: 'disabled-script', find: 'a', replace: 'b', ableFlag: false },
      ],
    };
    const html = renderPreviewDebugHtml({ activeTab: 'regex', snapshot: snap });
    // Active scripts still shown normally
    expect(html).toContain('active-script');
    // Disabled scripts now visible (previously hidden)
    expect(html).toContain('disabled-script');
    // Disabled section has indicator
    expect(html).toContain('비활성');
  });
});

describe('regex tab: flag display', () => {
  it('shows regex flag value per script', () => {
    const snap: PreviewSnapshot = {
      ...snapshot,
      scripts: [{ type: 'editoutput', comment: 'flagged', find: 'test', replace: 'out', ableFlag: true, flag: 'gi' }],
    };
    const html = renderPreviewDebugHtml({ activeTab: 'regex', snapshot: snap });
    expect(html).toContain('gi');
  });
});
