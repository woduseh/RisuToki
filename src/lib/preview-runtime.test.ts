import { describe, expect, it } from 'vitest';
import { buildPreviewDocument } from './preview-format';
import { createDocumentPreviewRuntime } from './preview-runtime';

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

  it('wraps bridge messages with a per-runtime token so forged payloads are rejected', () => {
    const documentRef = document.implementation.createHTMLDocument('preview');
    const runtime = createDocumentPreviewRuntime({
      contentDocument: documentRef,
      contentWindow: { document: documentRef },
    });

    const message = { type: 'cbs-button', varName: 'choice', value: 'wave' } as const;

    expect(runtime.parseBridgeMessage(message)).toBeNull();
    expect(runtime.parseBridgeMessage(runtime.createBridgeMessage(message))).toEqual(message);
  });
});
