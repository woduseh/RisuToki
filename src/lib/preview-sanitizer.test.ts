import { describe, expect, it } from 'vitest';
import { sanitizePreviewHtml } from './preview-format';
import { sanitizePreviewBackgroundHtml } from './preview-sanitizer';

// Allowed preview HTML is intentionally narrow: inert inline formatting/content tags plus
// preview bridge attributes such as risu-btn / risu-trigger may survive, but executable
// elements, event handlers, and dangerous URL-bearing attributes must be stripped.
describe('preview sanitizer contract', () => {
  it('removes script-like executable elements while keeping adjacent safe tags', () => {
    const sanitized = sanitizePreviewHtml('<em>safe</em><script>alert(1)</script><strong>still-safe</strong>');

    expect(sanitized).toContain('<em>safe</em>');
    expect(sanitized).toContain('<strong>still-safe</strong>');
    expect(sanitized).not.toContain('<script');
  });

  it('removes inline event handlers from otherwise allowed elements', () => {
    const sanitized = sanitizePreviewHtml(
      '<button class="cbs-button" onclick="alert(1)">선택</button><img src="data:image/png;base64,AAAA" onerror="alert(2)" alt="asset">',
    );

    expect(sanitized).toContain('class="cbs-button"');
    expect(sanitized).toContain('>선택</button>');
    expect(sanitized).toContain('src="data:image/png;base64,AAAA"');
    expect(sanitized).not.toContain('onclick=');
    expect(sanitized).not.toContain('onerror=');
  });

  it('strips dangerous url-bearing attributes instead of preserving blocked placeholders', () => {
    const sanitized = sanitizePreviewHtml(
      '<a href="javascript:alert(1)" title="bad">unsafe</a>' +
        '<form action="https://safe.example" formaction="javascript:alert(2)"><button>go</button></form>' +
        '<img src="data:image/png;base64,AAAA" alt="asset">',
    );

    expect(sanitized).toContain('unsafe</a>');
    expect(sanitized).toContain('<button>go</button>');
    expect(sanitized).toContain('<img src="data:image/png;base64,AAAA" alt="asset">');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('blocked:');
    expect(sanitized).not.toContain('href=');
    expect(sanitized).not.toContain('formaction=');
  });

  it('retains safe inline preview markup needed for buttons, triggers, and assets', () => {
    const sanitized = sanitizePreviewHtml(
      '<span class="inline">text</span>' +
        '<button class="cbs-button" risu-btn="advance">다음</button>' +
        '<div risu-trigger="wave"><img src="https://example.com/a.png" alt="remote"></div>',
    );

    expect(sanitized).toContain('<span class="inline">text</span>');
    expect(sanitized).toContain('risu-btn="advance"');
    expect(sanitized).toContain('risu-trigger="wave"');
    expect(sanitized).toContain('src="https://example.com/a.png"');
  });

  it('retains safe structural html tags and their allowed attributes', () => {
    const sanitized = sanitizePreviewHtml(
      '<h2>제목</h2>' +
        '<ol start="3" type="1"><li value="3">세 번째</li></ol>' +
        '<details open><summary>더보기</summary><p>본문</p></details>' +
        '<u>밑줄</u><sub>아래</sub><sup>위</sup>',
    );

    expect(sanitized).toContain('<h2>제목</h2>');
    expect(sanitized).toContain('<ol start="3" type="1"><li value="3">세 번째</li></ol>');
    expect(sanitized).toMatch(/<details\b[^>]*open/);
    expect(sanitized).toContain('<summary>더보기</summary>');
    expect(sanitized).toContain('<u>밑줄</u>');
    expect(sanitized).toContain('<sub>아래</sub>');
    expect(sanitized).toContain('<sup>위</sup>');
  });

  it('keeps only the narrow safe inline style values on preview spans', () => {
    const sanitized = sanitizePreviewHtml(
      '<span style="color:var(--FontColorQuote2)">허용</span>' +
        '<span style="background:url(https://example.com/bg.png)">차단</span>',
    );

    expect(sanitized).toContain('<span style="color:var(--FontColorQuote2)">허용</span>');
    expect(sanitized).toContain('<span>차단</span>');
    expect(sanitized).not.toContain('background:url');
  });

  it('allows style tags only on the background-html sanitization path', () => {
    const sanitized = sanitizePreviewBackgroundHtml(
      '<style>.preview-bg { color: red; }</style><div data-preview="yes">ok</div><script>alert(1)</script>',
    );

    expect(sanitized).toContain('<style>.preview-bg { color: red; }</style>');
    expect(sanitized).toContain('<div data-preview="yes">ok</div>');
    expect(sanitized).not.toContain('<script');
  });
});
