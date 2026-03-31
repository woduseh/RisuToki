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

export type PreviewBridgeMessage =
  | { type: 'cbs-button'; varName: string; value: string }
  | { type: 'risu-btn'; data: string }
  | { type: 'risu-trigger'; name: string };

export interface PreviewRuntime {
  appendMessage(input: PreviewMessageHtmlInput): Promise<void>;
  clearMessages(): Promise<void>;
  createBridgeMessage(message: PreviewBridgeMessage): unknown;
  dispose(): void;
  parseBridgeMessage(data: unknown): PreviewBridgeMessage | null;
  resetDocument(): Promise<void>;
  scrollToBottom(): void;
  setBackground(html: string): Promise<void>;
}

const PREVIEW_RUNTIME_READY = 'preview-runtime:ready';
const PREVIEW_RUNTIME_BRIDGE = 'preview-runtime:bridge';
const PREVIEW_RUNTIME_COMMAND = 'preview-runtime:command';

function createPreviewBridgeToken(): string {
  return `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

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
  // The real preview iframe is sandboxed without allow-same-origin, so parent-side
  // access must rely on contentDocument returning null rather than probing
  // contentWindow.document, which throws on cross-origin frames under dev.
  return chatFrame.contentDocument || null;
}

function createBridgeEnvelope(
  token: string,
  message: PreviewBridgeMessage,
): {
  type: typeof PREVIEW_RUNTIME_BRIDGE;
  token: string;
  payload: PreviewBridgeMessage;
} {
  return {
    type: PREVIEW_RUNTIME_BRIDGE,
    token,
    payload: message,
  };
}

function parseBridgeEnvelope(token: string, data: unknown): PreviewBridgeMessage | null {
  if (!data || typeof data !== 'object') return null;

  const envelope = data as {
    type?: string;
    token?: string;
    payload?: Partial<PreviewBridgeMessage> | null;
  };
  if (envelope.type !== PREVIEW_RUNTIME_BRIDGE || envelope.token !== token || !envelope.payload) {
    return null;
  }

  const payload = envelope.payload;
  if (payload.type === 'cbs-button' && typeof payload.varName === 'string' && typeof payload.value === 'string') {
    return { type: 'cbs-button', varName: payload.varName, value: payload.value };
  }
  if (payload.type === 'risu-btn' && typeof payload.data === 'string') {
    return { type: 'risu-btn', data: payload.data };
  }
  if (payload.type === 'risu-trigger' && typeof payload.name === 'string') {
    return { type: 'risu-trigger', name: payload.name };
  }

  return null;
}

export function createDocumentPreviewRuntime(chatFrame: PreviewRuntimeFrame): PreviewRuntime {
  const bridgeToken = createPreviewBridgeToken();
  let bridgeClickHandler: ((event: Event) => void) | null = null;

  function postBridgeMessage(documentRef: Document, payload: PreviewBridgeMessage): void {
    documentRef.dispatchEvent(
      new CustomEvent('preview-runtime-bridge', {
        detail: payload,
      }),
    );
  }

  function attachBridge(documentRef: Document): void {
    if (bridgeClickHandler) {
      documentRef.removeEventListener('click', bridgeClickHandler);
    }

    bridgeClickHandler = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const button = target.closest('[risu-btn]');
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        postBridgeMessage(documentRef, {
          type: 'risu-btn',
          data: button.getAttribute('risu-btn') || '',
        });
        return;
      }

      const trigger = target.closest('[risu-trigger]');
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        postBridgeMessage(documentRef, {
          type: 'risu-trigger',
          name: trigger.getAttribute('risu-trigger') || '',
        });
      }
    };

    documentRef.addEventListener('click', bridgeClickHandler);
  }

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

    createBridgeMessage(message) {
      return createBridgeEnvelope(bridgeToken, message);
    },

    dispose() {
      const documentRef = getFrameDocument(chatFrame);
      if (documentRef && bridgeClickHandler) {
        documentRef.removeEventListener('click', bridgeClickHandler);
      }
      bridgeClickHandler = null;
    },

    parseBridgeMessage(data) {
      return parseBridgeEnvelope(bridgeToken, data);
    },

    async resetDocument() {
      const documentRef = getFrameDocument(chatFrame);
      if (!documentRef) return;
      const parser = getDomParser(documentRef);
      const parsed = parser.parseFromString(buildPreviewDocument(''), 'text/html');

      documentRef.head.replaceChildren(
        ...Array.from(parsed.head.childNodes).map((node) => documentRef.importNode(node, true)),
      );
      documentRef.body.replaceChildren(
        ...Array.from(parsed.body.childNodes).map((node) => documentRef.importNode(node, true)),
      );
      attachBridge(documentRef);
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

function buildPreviewRuntimeScriptSource(bridgeToken: string): string {
  return `(() => {
    const READY = '${PREVIEW_RUNTIME_READY}';
    const BRIDGE = '${PREVIEW_RUNTIME_BRIDGE}';
    const COMMAND = '${PREVIEW_RUNTIME_COMMAND}';
    const TOKEN = '${bridgeToken}';

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

    function postBridgeMessage(payload) {
      window.parent.postMessage({ type: BRIDGE, token: TOKEN, payload }, '*');
    }

    window.cbsClick = function(varName, value) {
      postBridgeMessage({ type: 'cbs-button', varName, value });
    };

    document.addEventListener('click', function(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const button = target.closest('[risu-btn]');
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        postBridgeMessage({ type: 'risu-btn', data: button.getAttribute('risu-btn') });
        return;
      }

      const trigger = target.closest('[risu-trigger]');
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        postBridgeMessage({ type: 'risu-trigger', name: trigger.getAttribute('risu-trigger') });
      }
    });

    window.addEventListener('message', function(event) {
      const data = event.data;
      if (!data || data.type !== COMMAND || data.token !== TOKEN) return;

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

    window.parent.postMessage({ type: READY, token: TOKEN }, '*');
  })();`;
}

export function createIframePreviewRuntime(
  chatFrame: HTMLIFrameElement,
  windowTarget: Window = window,
): PreviewRuntime {
  const bridgeToken = createPreviewBridgeToken();
  let readyResolve: (() => void) | null = null;
  let readyPromise: Promise<void> = Promise.resolve();
  const scriptSource = buildPreviewRuntimeScriptSource(bridgeToken);

  const onWindowMessage = (event: MessageEvent<unknown>): void => {
    if (chatFrame.contentWindow && event.source !== chatFrame.contentWindow) return;
    if (!event.data || typeof event.data !== 'object') return;
    const message = event.data as { type?: string; token?: string };
    if (message.type === PREVIEW_RUNTIME_READY && message.token === bridgeToken) {
      readyResolve?.();
      readyResolve = null;
    }
  };

  windowTarget.addEventListener('message', onWindowMessage);

  async function postCommand(command: string, payload?: Record<string, unknown>): Promise<void> {
    await readyPromise;
    chatFrame.contentWindow?.postMessage(
      { type: PREVIEW_RUNTIME_COMMAND, token: bridgeToken, command, ...(payload || {}) },
      '*',
    );
  }

  return {
    async appendMessage(input) {
      await postCommand('append-message', { html: buildMessageContainerHtml(input) });
    },

    async clearMessages() {
      await postCommand('clear-messages');
    },

    createBridgeMessage(message) {
      return createBridgeEnvelope(bridgeToken, message);
    },

    dispose() {
      windowTarget.removeEventListener('message', onWindowMessage);
    },

    parseBridgeMessage(data) {
      return parseBridgeEnvelope(bridgeToken, data);
    },

    async resetDocument() {
      chatFrame.setAttribute('sandbox', 'allow-scripts');
      readyPromise = new Promise<void>((resolve) => {
        readyResolve = resolve;
      });
      chatFrame.srcdoc = buildPreviewDocument('', scriptSource);
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
