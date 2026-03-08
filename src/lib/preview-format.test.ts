import { describe, expect, it } from 'vitest';
import {
  buildPreviewDocument,
  buildPreviewMessageHtml,
  escapePreviewHtml,
  simpleMarkdown,
  wrapCssForPreview
} from './preview-format';
import type { PreviewParserEngine } from './preview-format';

const engine: PreviewParserEngine = {
  risuChatParser: (text: string) => text.replace('{{color}}', 'royalblue')
};

describe('preview format helpers', () => {
  it('escapes html-sensitive characters', () => {
    expect(escapePreviewHtml('<tag>&value>')).toBe('&lt;tag&gt;&amp;value&gt;');
  });

  it('renders lightweight markdown while preserving embedded html', () => {
    const html = simpleMarkdown('**굵게** _기울임_ `snippet`\n<span>보존</span>');

    expect(html).toContain('<strong>굵게</strong>');
    expect(html).toContain('<em>기울임</em>');
    expect(html).toContain('<code>snippet</code>');
    expect(html).toContain('<br>');
    expect(html).toContain('<span>보존</span>');
  });

  it('wraps plain css for preview and preserves explicit style tags', () => {
    expect(wrapCssForPreview({
      raw: 'body { color: {{color}}; }',
      engine
    })).toContain('<style>\nbody { color: royalblue; }\n</style>');

    expect(wrapCssForPreview({
      raw: '<style>.box { color: red; }</style>',
      engine
    })).toBe('<style>.box { color: red; }</style>');
  });

  it('builds the preview document shell with a restrictive csp', () => {
    const documentHtml = buildPreviewDocument('<style>body{color:red;}</style>');

    expect(documentHtml).toContain("default-src 'none'");
    expect(documentHtml).toContain('id="bg-dom"');
    expect(documentHtml).toContain("type: 'cbs-button'");
    expect(documentHtml).toContain("type: 'risu-trigger'");
  });

  it('builds message html with escaped names and provided rich content', () => {
    const messageHtml = buildPreviewMessageHtml({
      index: 3,
      name: '<Toki>',
      avatarBg: 'var(--test-color)',
      content: '<strong>안녕</strong>'
    });

    expect(messageHtml).toContain('data-chat-index="3"');
    expect(messageHtml).toContain('&lt;Toki&gt;');
    expect(messageHtml).toContain('<strong>안녕</strong>');
    expect(messageHtml).toContain('background-color:var(--test-color)');
  });
});
