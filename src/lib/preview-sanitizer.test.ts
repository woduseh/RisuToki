import { describe, expect, it } from 'vitest';
import { sanitizePreviewHtml } from './preview-format';

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
      '<button class="cbs-button" onclick="alert(1)">선택</button><img src="data:image/png;base64,AAAA" onerror="alert(2)" alt="asset">'
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
      '<img src="data:image/png;base64,AAAA" alt="asset">'
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
      '<div risu-trigger="wave"><img src="https://example.com/a.png" alt="remote"></div>'
    );

    expect(sanitized).toContain('<span class="inline">text</span>');
    expect(sanitized).toContain('risu-btn="advance"');
    expect(sanitized).toContain('risu-trigger="wave"');
    expect(sanitized).toContain('src="https://example.com/a.png"');
  });
});
