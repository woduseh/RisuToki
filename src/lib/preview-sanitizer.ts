export interface PreviewSanitizeOptions {
  allowStyleTag?: boolean;
}

const DROP_ONLY_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'svg', 'math', 'link', 'meta']);
const MESSAGE_ALLOWED_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'button',
  'code',
  'div',
  'em',
  'form',
  'hr',
  'img',
  'mark',
  'p',
  'pre',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
]);
const GLOBAL_ALLOWED_ATTRIBUTES = new Set(['aria-hidden', 'aria-label', 'class', 'id', 'role', 'title']);
const PER_TAG_ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'rel', 'target', 'title']),
  button: new Set(['risu-btn', 'risu-trigger', 'type']),
  div: new Set(['risu-btn', 'risu-trigger']),
  form: new Set(['action', 'method']),
  img: new Set(['alt', 'src']),
  mark: new Set(['risu-mark']),
  span: new Set(['risu-btn', 'risu-mark', 'risu-trigger', 'style']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
};
const URL_ATTRIBUTES = new Set(['action', 'href', 'src']);

function getAllowedTags(options?: PreviewSanitizeOptions): Set<string> {
  const allowed = new Set(MESSAGE_ALLOWED_TAGS);
  if (options?.allowStyleTag) {
    allowed.add('style');
  }
  return allowed;
}

function isSafeStyleValue(value: string): boolean {
  return /^\s*color\s*:\s*var\(--FontColorQuote[12]\)\s*;?\s*$/i.test(value.trim());
}

function isSafeUrl(tagName: string, attributeName: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (/^(javascript:|vbscript:|data:text\/html)/i.test(normalized)) return false;

  if (attributeName === 'src') {
    return /^(https?:|data:image\/|blob:|\/|\.{1,2}\/|#)/i.test(normalized);
  }

  if (tagName === 'a' && attributeName === 'href') {
    return /^(https?:|mailto:|tel:|\/|\.{1,2}\/|#)/i.test(normalized);
  }

  if (tagName === 'form' && attributeName === 'action') {
    return /^(https?:|\/|\.{1,2}\/|#)/i.test(normalized);
  }

  return false;
}

function sanitizeNode(node: Node, targetDocument: Document, options?: PreviewSanitizeOptions): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return targetDocument.createTextNode(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  const allowedTags = getAllowedTags(options);

  if (DROP_ONLY_TAGS.has(tagName)) {
    return null;
  }

  if (!allowedTags.has(tagName)) {
    const fragment = targetDocument.createDocumentFragment();
    for (const child of Array.from(element.childNodes)) {
      const sanitizedChild = sanitizeNode(child, targetDocument, options);
      if (sanitizedChild) fragment.appendChild(sanitizedChild);
    }
    return fragment;
  }

  const sanitizedElement = targetDocument.createElement(tagName);
  const allowedAttributes = PER_TAG_ALLOWED_ATTRIBUTES[tagName] || new Set<string>();

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;

    if (name.startsWith('on')) continue;
    if (!GLOBAL_ALLOWED_ATTRIBUTES.has(name) && !allowedAttributes.has(name) && !name.startsWith('data-')) continue;
    if (name === 'style' && !isSafeStyleValue(value)) continue;
    if (URL_ATTRIBUTES.has(name) && !isSafeUrl(tagName, name, value)) continue;

    sanitizedElement.setAttribute(attribute.name, value);
  }

  if (tagName === 'a' && sanitizedElement.hasAttribute('target')) {
    sanitizedElement.setAttribute('rel', 'noopener noreferrer');
  }

  for (const child of Array.from(element.childNodes)) {
    const sanitizedChild = sanitizeNode(child, targetDocument, options);
    if (sanitizedChild) sanitizedElement.appendChild(sanitizedChild);
  }

  return sanitizedElement;
}

function sanitizeWithDomParser(html: string, options?: PreviewSanitizeOptions): string {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
  const outputDocument = parser.parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
  const container = outputDocument.createElement('div');

  const sourceNodes = [...Array.from(parsed.head.childNodes), ...Array.from(parsed.body.childNodes)];
  for (const node of sourceNodes) {
    const sanitizedNode = sanitizeNode(node, outputDocument, options);
    if (sanitizedNode) container.appendChild(sanitizedNode);
  }

  return container.innerHTML;
}

function sanitizeWithRegexFallback(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\b(?:href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\1/gi, '');
}

export function sanitizePreviewHtml(html: string, options?: PreviewSanitizeOptions): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') {
    return sanitizeWithRegexFallback(html);
  }
  return sanitizeWithDomParser(html, options);
}

export function sanitizePreviewBackgroundHtml(html: string): string {
  return sanitizePreviewHtml(html, { allowStyleTag: true });
}
