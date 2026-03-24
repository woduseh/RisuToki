import { buildPreviewDocument, buildPreviewMessageHtml, type PreviewMessageHtmlInput } from './preview-format';
import { sanitizePreviewBackgroundHtml } from './preview-sanitizer';

interface PreviewRuntimeFrame {
  contentDocument: Document | null;
  contentWindow?: {
    document?: Document | null;
    postMessage?: (message: unknown, targetOrigin: string) => void;
  } | null;
  srcdoc?: string;
}

export interface PreviewRuntime {
  appendMessage(input: PreviewMessageHtmlInput): Promise<void>;
  clearMessages(): Promise<void>;
  dispose(): void;
  resetDocument(): Promise<void>;
  scrollToBottom(): void;
  setBackground(html: string): Promise<void>;
}

const PREVIEW_RUNTIME_READY = 'preview-runtime:ready';
const PREVIEW_RUNTIME_COMMAND = 'preview-runtime:command';

function getDomParser(targetDocument: Document): DOMParser {
  const ParserCtor = targetDocument.defaultView?.DOMParser || DOMParser;
  return new ParserCtor();
}

function createFragmentFromHtml(targetDocument: Document, html: string): DocumentFragment {
  const fragment = targetDocument.createDocumentFragment();
  if (!html) return fragment;

  const parser = getDomParser(targetDocument);
  const parsed = parser.parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
  const nodes = [...Array.from(parsed.head.childNodes), ...Array.from(parsed.body.childNodes)];

  for (const node of nodes) {
    fragment.appendChild(targetDocument.importNode(node, true));
  }

  return fragment;
}

function buildMessageContainerHtml(input: PreviewMessageHtmlInput): string {
  return `<div class="chat-message-container" x-hashed="${input.index}">${buildPreviewMessageHtml(input)}</div>`;
}

function getFrameDocument(chatFrame: PreviewRuntimeFrame): Document | null {
  return chatFrame.contentDocument || chatFrame.contentWindow?.document || null;
}

export function createDocumentPreviewRuntime(chatFrame: PreviewRuntimeFrame): PreviewRuntime {
  return {
    async appendMessage(input) {
      const documentRef = getFrameDocument(chatFrame);
      const container = documentRef?.getElementById('chat-container');
      if (!documentRef || !container) return;
      container.appendChild(createFragmentFromHtml(documentRef, buildMessageContainerHtml(input)));
    },

    async clearMessages() {
      const container = getFrameDocument(chatFrame)?.getElementById('chat-container');
      container?.replaceChildren();
    },

    dispose() {},

    async resetDocument() {
      const documentRef = getFrameDocument(chatFrame);
      if (!documentRef) return;
      const parser = getDomParser(documentRef);
      const parsed = parser.parseFromString(buildPreviewDocument(''), 'text/html');

      documentRef.head.replaceChildren(...Array.from(parsed.head.childNodes).map((node) => documentRef.importNode(node, true)));
      documentRef.body.replaceChildren(...Array.from(parsed.body.childNodes).map((node) => documentRef.importNode(node, true)));
    },

    scrollToBottom() {
      const documentRef = getFrameDocument(chatFrame);
      if (!documentRef) return;
      documentRef.documentElement.scrollTop = documentRef.documentElement.scrollHeight;
    },

    async setBackground(html) {
      const documentRef = getFrameDocument(chatFrame);
      const backgroundDom = documentRef?.getElementById('bg-dom');
      if (!documentRef || !backgroundDom) return;
      backgroundDom.replaceChildren(createFragmentFromHtml(documentRef, sanitizePreviewBackgroundHtml(html)));
    },
  };
}

function buildPreviewRuntimeScriptSource(): string {
  return `(() => {
    const READY = '${PREVIEW_RUNTIME_READY}';
    const COMMAND = '${PREVIEW_RUNTIME_COMMAND}';

    function createFragment(html) {
      const parser = new DOMParser();
      const parsed = parser.parseFromString('<!DOCTYPE html><html><body>' + (html || '') + '</body></html>', 'text/html');
      const fragment = document.createDocumentFragment();
      const nodes = [].slice.call(parsed.head.childNodes).concat([].slice.call(parsed.body.childNodes));
      nodes.forEach((node) => fragment.appendChild(document.importNode(node, true)));
      return fragment;
    }

    function replaceHtml(target, html) {
      if (!target) return;
      target.replaceChildren(createFragment(html));
    }

    function appendHtml(target, html) {
      if (!target) return;
      target.appendChild(createFragment(html));
    }

    window.cbsClick = function(varName, value) {
      window.parent.postMessage({ type: 'cbs-button', varName, value }, '*');
    };

    document.addEventListener('click', function(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const button = target.closest('[risu-btn]');
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        window.parent.postMessage({ type: 'risu-btn', data: button.getAttribute('risu-btn') }, '*');
        return;
      }

      const trigger = target.closest('[risu-trigger]');
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        window.parent.postMessage({ type: 'risu-trigger', name: trigger.getAttribute('risu-trigger') }, '*');
      }
    });

    window.addEventListener('message', function(event) {
      const data = event.data;
      if (!data || data.type !== COMMAND) return;

      switch (data.command) {
        case 'append-message':
          appendHtml(document.getElementById('chat-container'), data.html || '');
          break;
        case 'clear-messages':
          replaceHtml(document.getElementById('chat-container'), '');
          break;
        case 'set-background':
          replaceHtml(document.getElementById('bg-dom'), data.html || '');
          break;
        case 'scroll-to-bottom':
          document.documentElement.scrollTop = document.documentElement.scrollHeight;
          break;
      }
    });

    window.parent.postMessage({ type: READY }, '*');
  })();`;
}

export function createIframePreviewRuntime(
  chatFrame: HTMLIFrameElement,
  windowTarget: Window = window,
): PreviewRuntime {
  let readyResolve: (() => void) | null = null;
  let readyPromise: Promise<void> = Promise.resolve();
  const scriptUrl = URL.createObjectURL(
    new Blob([buildPreviewRuntimeScriptSource()], { type: 'text/javascript' }),
  );

  const onWindowMessage = (event: MessageEvent<unknown>): void => {
    if (chatFrame.contentWindow && event.source !== chatFrame.contentWindow) return;
    if (!event.data || typeof event.data !== 'object') return;
    if ((event.data as { type?: string }).type === PREVIEW_RUNTIME_READY) {
      readyResolve?.();
      readyResolve = null;
    }
  };

  windowTarget.addEventListener('message', onWindowMessage);

  async function postCommand(command: string, payload?: Record<string, unknown>): Promise<void> {
    await readyPromise;
    chatFrame.contentWindow?.postMessage({ type: PREVIEW_RUNTIME_COMMAND, command, ...(payload || {}) }, '*');
  }

  return {
    async appendMessage(input) {
      await postCommand('append-message', { html: buildMessageContainerHtml(input) });
    },

    async clearMessages() {
      await postCommand('clear-messages');
    },

    dispose() {
      windowTarget.removeEventListener('message', onWindowMessage);
      URL.revokeObjectURL(scriptUrl);
    },

    async resetDocument() {
      chatFrame.setAttribute('sandbox', 'allow-scripts');
      readyPromise = new Promise<void>((resolve) => {
        readyResolve = resolve;
      });
      chatFrame.srcdoc = buildPreviewDocument('', scriptUrl);
      await readyPromise;
    },

    scrollToBottom() {
      void postCommand('scroll-to-bottom');
    },

    async setBackground(html) {
      await postCommand('set-background', { html: sanitizePreviewBackgroundHtml(html) });
    },
  };
}
