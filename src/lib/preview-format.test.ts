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
    expect(escapePreviewHtml('<tag>&value>"quote"\'apostrophe')).toBe(
      '&lt;tag&gt;&amp;value&gt;&quot;quote&quot;&#39;apostrophe',
    );
  });

  it('renders lightweight markdown for basic text formatting without relying on raw html passthrough', () => {
    const html = simpleMarkdown('**굵게** _기울임_ `snippet`\n다음 줄');

    expect(html).toContain('<strong>굵게</strong>');
    expect(html).toContain('<em>기울임</em>');
    expect(html).toContain('<code>snippet</code>');
    expect(html).toContain('<br>');
  });

  it('renders richer markdown blocks for headings, lists, links, strikethrough, and horizontal rules', () => {
    const html = simpleMarkdown(
      '# 제목\n\n- 첫째\n- 둘째\n\n1. 셋째\n2. 넷째\n\n[문서](https://example.com)\n\n~~취소~~\n\n---',
    );

    expect(html).toContain('<h1>제목</h1>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>첫째</li>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>넷째</li>');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">문서</a>');
    expect(html).toContain('<s>취소</s>');
    expect(html).toContain('<hr>');
  });

  it('keeps raw html intact while parsing surrounding markdown and richer block content', () => {
    const html = simpleMarkdown(
      '**굵게** <details open><summary>더보기</summary><p>내용</p></details>\n| A | B |\n|---|---|\n| 1 | 2 |\n> 인용문',
    );

    expect(html).toContain('<strong>굵게</strong>');
    expect(html).toMatch(/<details\b[^>]*open/);
    expect(html).toContain('<summary>더보기</summary><p>내용</p></details>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<p>인용문</p>');
  });

  it('escapes fenced code blocks and resolves risu private-use escape sequences', () => {
    const html = simpleMarkdown('```js\nconsole.log("<tag>")\n```\n\uE9B8name\uE9BE value\uE9B9');

    expect(html).toContain('class="hljs');
    expect(html).toContain('&lt;tag&gt;');
    expect(html).toContain('{name: value}');
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

    expect(
      wrapCssForPreview({
        raw: '<section class="module-background">module</section>',
        engine,
      }),
    ).toBe('<section class="module-background">module</section>');
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

  it('builds a character portrait with the RisuAI large-portrait hook', () => {
    const messageHtml = buildPreviewMessageHtml({
      index: 0,
      name: 'Toki',
      avatarBg: '#123456',
      avatarSrc: 'data:image/png;base64,AAAA',
      largePortrait: true,
      content: '안녕',
    });

    expect(messageHtml).toContain('class="chat-avatar large-portrait"');
    expect(messageHtml).toContain('class="chat-avatar-image"');
    expect(messageHtml).toContain('src="data:image/png;base64,AAAA"');
  });

  it('builds message html with escaped names while keeping safe structural preview markup', () => {
    const messageHtml = buildPreviewMessageHtml({
      index: 3,
      name: '<Toki>',
      avatarBg: 'var(--test-color)',
      content:
        '<h2>제목</h2><strong>안녕</strong><span risu-trigger="wave">트리거</span><ul><li>항목</li></ul><details open><summary>더보기</summary><p>설명</p></details><script>alert(1)</script>',
    });

    expect(messageHtml).toContain('data-chat-index="3"');
    expect(messageHtml).toContain('&lt;Toki&gt;');
    expect(messageHtml).toContain('<div class="chat-content">');
    expect(messageHtml).toContain('<div class="chattext chat-width prose">');
    expect(messageHtml).toContain('<h2>제목</h2>');
    expect(messageHtml).toContain('<strong>안녕</strong>');
    expect(messageHtml).toContain('<span risu-trigger="wave">트리거</span>');
    expect(messageHtml).toContain('<ul><li>항목</li></ul>');
    expect(messageHtml).toMatch(/<details\b[^>]*open/);
    expect(messageHtml).not.toContain('<script>');
    expect(messageHtml).toContain('background-color:var(--test-color)');
  });
});
