import { marked } from 'marked';
import { sanitizePreviewHtml } from './preview-sanitizer';

// Rendered, read-only preview for markdown documents (e.g. the bundled guide
// files). The charx chat preview lives in ./preview-panel; this is a much
// simpler HTML render of the active markdown tab.

let activeOverlay: HTMLElement | null = null;
let keyHandler: ((event: KeyboardEvent) => void) | null = null;

export function closeMarkdownPreview(): void {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}

export function showMarkdownPreview(markdown: string, title: string): void {
  closeMarkdownPreview();

  const overlay = document.createElement('div');
  overlay.className = 'preview-overlay md-preview-overlay';

  const panel = document.createElement('div');
  panel.className = 'md-preview-panel';

  const header = document.createElement('div');
  header.className = 'md-preview-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'md-preview-title';
  titleEl.textContent = `미리보기 — ${title}`;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'md-preview-close';
  closeBtn.textContent = '✕';
  closeBtn.title = '미리보기 닫기';
  closeBtn.setAttribute('aria-label', '미리보기 닫기');
  closeBtn.addEventListener('click', closeMarkdownPreview);
  header.append(titleEl, closeBtn);

  const content = document.createElement('div');
  content.className = 'md-preview-content markdown-body';
  const rendered = marked.parse(markdown, { async: false }) as string;
  content.innerHTML = sanitizePreviewHtml(rendered);
  content.addEventListener('click', (event) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href') || '';
    if (/^(https?:|mailto:)/i.test(href)) void window.tokiAPI.openExternalUrl(href);
  });

  panel.append(header, content);
  overlay.appendChild(panel);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeMarkdownPreview();
  });

  document.body.appendChild(overlay);
  activeOverlay = overlay;

  keyHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeMarkdownPreview();
  };
  document.addEventListener('keydown', keyHandler);
}
