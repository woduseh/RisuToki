import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import highlightStyles from 'highlight.js/styles/atom-one-dark.min.css?inline';
import katex from 'katex';
import katexStyles from 'katex/dist/katex.min.css?inline';
import MarkdownIt from 'markdown-it';
import postcss, { type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';

export type PreviewRenderMode = 'normal' | 'back';

const STYLE_TOKEN_PREFIX = 'RISUTOKIPREVIEWSTYLE';
const SAFE_CSS_URL = /^(?:https?:|data:(?:image|audio|video|font)\/|blob:|\/|\.{1,2}\/|#)/i;

function escapeMarkdownHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const markdown: MarkdownIt = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: false,
  typographer: true,
  quotes: '\uE9B0\uE9B1\uE9B2\uE9B3',
  highlight(code, language): string {
    if (!language || !hljs.getLanguage(language)) {
      return `<pre><code>${escapeMarkdownHtml(code)}</code></pre>`;
    }
    const rendered = hljs.highlight(code, { language, ignoreIllegals: true }).value;
    return `<pre class="hljs" x-hl-lang="${escapeMarkdownHtml(language)}"><code>${rendered}</code></pre>`;
  },
});

markdown.disable(['code']);

function prefixClassName(className: string): string {
  if (
    className.startsWith('x-risu-') ||
    className === 'chattext' ||
    className.startsWith('hljs') ||
    className.startsWith('katex')
  ) {
    return className;
  }
  return `x-risu-${className}`;
}

function sanitizeCssDeclarationValue(value: string): boolean {
  if (/(?:expression\s*\(|javascript:|vbscript:|data:text\/html|behavior\s*:|-moz-binding)/i.test(value)) {
    return false;
  }
  for (const match of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    if (!SAFE_CSS_URL.test(match[2].trim())) return false;
  }
  return true;
}

function isInsideKeyframes(rule: Rule): boolean {
  let parent = rule.parent as { type: string; name?: string; parent?: unknown } | undefined;
  while (parent) {
    if (parent.type === 'atrule' && /^(?:-\w+-)?keyframes$/i.test(parent.name || '')) return true;
    parent = parent.parent as typeof parent;
  }
  return false;
}

export function scopePreviewCss(cssText: string): string {
  if (!cssText.trim()) return '';

  const root = postcss.parse(cssText);
  root.walkAtRules('import', (rule) => {
    const target = rule.params
      .trim()
      .replace(/^url\(\s*(['"]?)(.*?)\1\s*\).*$/i, '$2')
      .replace(/^(['"])(.*?)\1.*$/, '$2');
    if (!target.startsWith('data:')) rule.remove();
  });
  root.walkDecls((declaration) => {
    if (!sanitizeCssDeclarationValue(declaration.value)) declaration.remove();
  });
  root.walkRules((rule) => {
    if (isInsideKeyframes(rule)) return;
    try {
      rule.selectors = rule.selectors.map((selector) => {
        const prefixed = selectorParser((selectors) => {
          selectors.walkClasses((classNode) => {
            classNode.value = prefixClassName(classNode.value);
          });
        }).processSync(selector);
        return `.chattext ${prefixed}`;
      });
    } catch {
      rule.remove();
    }
  });
  return root.toString();
}

function renderMath(source: string): string {
  return source.replace(/\$\$(.*?)\$\$/gs, (original, expression: string) => {
    try {
      const normalized = expression
        .replace(/\uE9B8/gu, '{')
        .replace(/\uE9B9/gu, '}')
        .replace(/\uE9BA/gu, '(')
        .replace(/\uE9BB/gu, ')');
      return katex.renderToString(normalized, {
        displayMode: false,
        throwOnError: true,
        output: 'html',
      });
    } catch {
      return original;
    }
  });
}

function restoreRisuEscapes(value: string): string {
  const replacements = ['{', '}', '(', ')', '&lt;', '&gt;', ':', ';'];
  return value.replace(/[\uE9B8-\uE9BF]/g, (match) => replacements[match.charCodeAt(0) - 0xe9b8] || match);
}

function markQuotes(value: string): string {
  return value
    .replace(/\uE9B0/g, '<mark risu-mark="quote2">“')
    .replace(/\uE9B1/g, '”</mark>')
    .replace(/\uE9B2/g, '<mark risu-mark="quote1">‘')
    .replace(/\uE9B3/g, '’</mark>');
}

function sanitizeRenderedHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true },
    ADD_TAGS: ['style', 'audio', 'video', 'source'],
    ADD_ATTR: [
      'autoplay',
      'controls',
      'decoding',
      'loading',
      'loop',
      'muted',
      'playsinline',
      'preload',
      'risu-btn',
      'risu-trigger',
      'risu-mark',
      'type',
      'x-hl-lang',
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'meta'],
  });
}

function normalizeRenderedDom(html: string): string {
  if (typeof DOMParser === 'undefined') return html;
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');

  for (const element of Array.from(parsed.body.querySelectorAll('*'))) {
    if (element.hasAttribute('class')) {
      const normalized = (element.getAttribute('class') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(prefixClassName)
        .join(' ');
      if (normalized) element.setAttribute('class', normalized);
      else element.removeAttribute('class');
    }
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      } else if (!/^(?:mailto:|tel:|\/|\.{1,2}\/|#)/i.test(href)) {
        element.removeAttribute('href');
      }
    }
    if (element.tagName === 'IMG') {
      if (!element.hasAttribute('loading')) element.setAttribute('loading', 'lazy');
      if (!element.hasAttribute('decoding')) element.setAttribute('decoding', 'async');
    }
  }

  return `${parsed.head.innerHTML}${parsed.body.innerHTML}`;
}

export function renderPreviewMarkdown(source: string, mode: PreviewRenderMode = 'normal'): string {
  if (!source) return '';
  void mode;

  const styles: string[] = [];
  let prepared = source.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_full, cssText: string) => {
    const token = `${STYLE_TOKEN_PREFIX}${styles.length}TOKEN`;
    styles.push(cssText);
    return `\n\n${token}\n\n`;
  });
  prepared = renderMath(prepared);

  let rendered = markdown.render(prepared.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
  rendered = restoreRisuEscapes(markQuotes(rendered));
  rendered = rendered.replace(new RegExp(`<p>\\s*(${STYLE_TOKEN_PREFIX}\\d+TOKEN)\\s*</p>`, 'g'), '$1');
  rendered = normalizeRenderedDom(sanitizeRenderedHtml(rendered));
  rendered = rendered.replace(new RegExp(`${STYLE_TOKEN_PREFIX}(\\d+)TOKEN`, 'g'), (_token: string, index: string) => {
    try {
      const scoped = scopePreviewCss(styles[Number(index)] || '');
      return scoped ? `<style>${scoped}</style>` : '';
    } catch {
      return '';
    }
  });

  return rendered;
}

export function getPreviewRendererStyles(): string {
  return `${katexStyles}\n${highlightStyles}`;
}
