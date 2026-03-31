import { describe, expect, it } from 'vitest';
import {
  buildPreviewDocument,
  buildPreviewMessageHtml,
  escapePreviewHtml,
  simpleMarkdown,
  wrapCssForPreview,
} from './preview-format';
import type { PreviewParserEngine } from './preview-format';

const engine: PreviewParserEngine = {
  risuChatParser: (text: string) => text.replace('{{color}}', 'royalblue'),
};

describe('preview format helpers', () => {
  it('escapes html-sensitive characters', () => {
    expect(escapePreviewHtml('<tag>&value>')).toBe('&lt;tag&gt;&amp;value&gt;');
  });

  it('renders lightweight markdown for basic text formatting without relying on raw html passthrough', () => {
    const html = simpleMarkdown('**굵게** _기울임_ `snippet`\n다음 줄');

    expect(html).toContain('<strong>굵게</strong>');
    expect(html).toContain('<em>기울임</em>');
    expect(html).toContain('<code>snippet</code>');
    expect(html).toContain('<br>');
  });

  it('wraps plain css for preview and preserves explicit style tags', () => {
    expect(
      wrapCssForPreview({
        raw: 'body { color: {{color}}; }',
        engine,
      }),
    ).toContain('<style>\nbody { color: royalblue; }\n</style>');

    expect(
      wrapCssForPreview({
        raw: '<style>.box { color: red; }</style>',
        engine,
      }),
    ).toBe('<style>.box { color: red; }</style>');
  });

  it('builds the preview document shell with a restrictive csp and empty scaffold', () => {
    const documentHtml = buildPreviewDocument('');

    expect(documentHtml).toContain("default-src 'none'");
    expect(documentHtml).toContain('<div class="background-dom" id="bg-dom"></div>');
    expect(documentHtml).toContain('<div class="default-chat-screen" id="chat-container"></div>');
  });

  it('uses compact bottom padding because the preview input bar lives outside the iframe', () => {
    const documentHtml = buildPreviewDocument('');

    expect(documentHtml).toContain('padding: 8px 0 8px;');
    expect(documentHtml).not.toContain('padding: 8px 0 80px;');
  });

  it('builds message html with escaped names while keeping only allowed inline preview markup', () => {
    const messageHtml = buildPreviewMessageHtml({
      index: 3,
      name: '<Toki>',
      avatarBg: 'var(--test-color)',
      content: '<strong>안녕</strong><span risu-trigger="wave">트리거</span><script>alert(1)</script>',
    });

    expect(messageHtml).toContain('data-chat-index="3"');
    expect(messageHtml).toContain('&lt;Toki&gt;');
    expect(messageHtml).toContain('<strong>안녕</strong>');
    expect(messageHtml).toContain('<span risu-trigger="wave">트리거</span>');
    expect(messageHtml).not.toContain('<script>');
    expect(messageHtml).toContain('background-color:var(--test-color)');
  });
});
