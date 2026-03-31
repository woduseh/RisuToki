import { describe, expect, it, vi } from 'vitest';
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

  it('uses a nonce-gated inline script instead of a blob URL when runtime source is provided', () => {
    const scriptSource = '(() => { console.log("test"); })();';
    const doc = buildPreviewDocument('', scriptSource);

    // script-src must NOT reference blob:
    expect(doc).not.toMatch(/script-src[^;]*blob:/);
    // Must not have a <script src="blob:...">
    expect(doc).not.toMatch(/<script[^>]+src="blob:/);
    // Must contain an inline <script nonce="...">
    expect(doc).toMatch(/<script nonce="[^"]+">/);
    // Must contain the script source inline
    expect(doc).toContain(scriptSource);
    // Must NOT have a <script src=...>
    expect(doc).not.toMatch(/<script[^>]+src=/);
  });

  it('CSP script-src uses a nonce that matches the inline script tag', () => {
    const doc = buildPreviewDocument('', '(() => {})();');

    const cspNonce = doc.match(/script-src 'nonce-([^']+)'/)?.[1];
    const tagNonce = doc.match(/<script nonce="([^"]+)">/)?.[1];

    expect(cspNonce).toBeTruthy();
    expect(tagNonce).toBeTruthy();
    expect(cspNonce).toBe(tagNonce);
  });

  it('emits no script element and a restrictive script CSP when no runtime source is given', () => {
    const doc = buildPreviewDocument('');

    expect(doc).not.toContain('<script');
    expect(doc).toContain("script-src 'none'");
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

  it('bridges document-runtime button clicks through risu-btn attributes', async () => {
    const documentRef = document.implementation.createHTMLDocument('preview');
    const runtime = createDocumentPreviewRuntime({
      contentDocument: documentRef,
      contentWindow: { document: documentRef },
    });

    await runtime.resetDocument();
    await runtime.appendMessage({
      index: 0,
      name: 'Toki',
      avatarBg: 'var(--test-color)',
      content: '<button risu-btn="advance">다음</button>',
    });

    const onBridge = vi.fn();
    documentRef.addEventListener('preview-runtime-bridge', ((event: Event) => {
      const customEvent = event as CustomEvent;
      onBridge(customEvent.detail);
    }) as EventListener);

    const button = documentRef.querySelector('button[risu-btn="advance"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    button?.click();

    expect(onBridge).toHaveBeenCalledWith({ type: 'risu-btn', data: 'advance' });
  });

  it('tolerates blocked contentWindow.document access when no same-origin contentDocument is available', async () => {
    const contentWindow = {} as { document?: Document | null };
    Object.defineProperty(contentWindow, 'document', {
      configurable: true,
      get() {
        throw new DOMException(
          'Blocked a frame with origin "http://127.0.0.1:5173" from accessing a cross-origin frame.',
          'SecurityError',
        );
      },
    });

    const runtime = createDocumentPreviewRuntime({
      contentDocument: null,
      contentWindow,
    });

    await expect(runtime.resetDocument()).resolves.toBeUndefined();
    expect(() => runtime.dispose()).not.toThrow();
  });
});
