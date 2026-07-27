import { describe, expect, it } from 'vitest';

import { renderPreviewMarkdown, scopePreviewCss } from './preview-renderer';

describe('preview renderer', () => {
  it('renders markdown-it tables, nested lists, highlighted code, and KaTeX', () => {
    const html = renderPreviewMarkdown(
      [
        '| A | B |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '- parent',
        '  - child',
        '',
        '```js',
        'const value = 1;',
        '```',
        '',
        '$$x^2$$',
      ].join('\n'),
    );

    expect(html).toContain('<table>');
    expect(html).toContain('<ul>');
    expect(html).toContain('class="hljs');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('class="katex');
  });

  it('prefixes user classes and scopes style selectors under chattext', () => {
    const html = renderPreviewMarkdown(
      '<div class="card existing"><span class="hljs-keyword">hello</span></div>' +
        '<style>.card:hover, section .existing { color: red; }</style>',
    );

    expect(html).toContain('class="x-risu-card x-risu-existing"');
    expect(html).toContain('class="hljs-keyword"');
    expect(html).toContain('.chattext .x-risu-card:hover');
    expect(html).toContain('.chattext section .x-risu-existing');
  });

  it('keeps keyframe names intact while scoping nested selectors', () => {
    const css = scopePreviewCss(
      '@keyframes pulse { from { opacity: 0 } to { opacity: 1 } } @media (min-width: 10px) { .card { animation: pulse 1s } }',
    );

    expect(css).toContain('@keyframes pulse');
    expect(css).toContain('from { opacity: 0 }');
    expect(css).toContain('.chattext .x-risu-card');
  });

  it('removes executable markup, unsafe URLs, and unsafe CSS while retaining media', () => {
    const html = renderPreviewMarkdown(
      '<script>alert(1)</script>' +
        '<img src="javascript:alert(1)" onerror="alert(1)">' +
        '<video controls><source src="data:video/mp4;base64,AAAA" type="video/mp4"></video>' +
        '<style>@import "https://evil.test/x.css"; .safe { color:red; background:url(javascript:alert(1)) }</style>',
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('@import');
    expect(html).toContain('<video controls="">');
    expect(html).toContain('data:video/mp4;base64,AAAA');
  });
});
