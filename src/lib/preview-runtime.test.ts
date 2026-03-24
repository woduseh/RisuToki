import { describe, expect, it } from 'vitest';
import { buildPreviewDocument } from './preview-format';

describe('preview runtime contract', () => {
  it('ships a static iframe shell instead of inlining user css or html payloads into the bootstrap document', () => {
    const inlineCssFragment = '<style>body{color:red;}</style>';
    const inlineHtmlFragment = '<div risu-trigger="wave">lua</div>';
    const documentHtml = buildPreviewDocument(`${inlineCssFragment}${inlineHtmlFragment}`);

    expect(documentHtml).toContain('<div class="background-dom" id="bg-dom"></div>');
    expect(documentHtml).not.toContain(inlineCssFragment);
    expect(documentHtml).not.toContain(inlineHtmlFragment);
  });

  it('does not require inline runtime scripts or an unsafe-inline script CSP', () => {
    const documentHtml = buildPreviewDocument('');

    expect(documentHtml).not.toContain("script-src 'unsafe-inline'");
    expect(documentHtml).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  });
});
