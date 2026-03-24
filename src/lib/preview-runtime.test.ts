import { describe, expect, it } from 'vitest';
import { buildPreviewDocument } from './preview-format';

describe('preview runtime contract', () => {
  it('ships a static iframe shell instead of inlining user css or html payloads into the bootstrap document', () => {
    const processedPreviewPayload = '<style>body{color:red;}</style><div risu-trigger="wave">lua</div>';
    const documentHtml = buildPreviewDocument(processedPreviewPayload);

    expect(documentHtml).toContain('<div class="background-dom" id="bg-dom"></div>');
    expect(documentHtml).not.toContain(processedPreviewPayload);
  });

  it('does not require inline runtime scripts or an unsafe-inline script CSP', () => {
    const documentHtml = buildPreviewDocument('');

    expect(documentHtml).not.toContain("script-src 'unsafe-inline'");
    expect(documentHtml).not.toMatch(/<script[\s>]/i);
  });
});
