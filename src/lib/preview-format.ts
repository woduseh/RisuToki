export interface PreviewParserEngine {
  risuChatParser(text: string, options?: Record<string, unknown>): string;
}

export interface PreviewMessageHtmlInput {
  index: number;
  name: string;
  avatarBg: string;
  content: string;
}

export function escapePreviewHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Strip dangerous HTML elements and event-handler attributes from chat content. */
export function sanitizePreviewHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:');
}

export function simpleMarkdown(text: string): string {
  if (!text) return '';

  const htmlTags: string[] = [];
  let rendered = String(text).replace(/<[^>]+>/g, (match) => {
    htmlTags.push(match);
    return `\x00HTAG${htmlTags.length - 1}\x00`;
  });

  rendered = rendered.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  rendered = rendered.replace(/__(.+?)__/g, '<strong>$1</strong>');
  rendered = rendered.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  rendered = rendered.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');
  rendered = rendered.replace(/\u201C([^\u201D]+)\u201D/g, '<span style="color:var(--FontColorQuote2)">\u201C$1\u201D</span>');
  rendered = rendered.replace(/(?:^|(?<=[\s\n(]))"([^"]+?)"(?=[\s\n).,!?;:]|$)/gm, '<span style="color:var(--FontColorQuote2)">\u201C$1\u201D</span>');
  rendered = rendered.replace(/`([^`]+)`/g, '<code>$1</code>');
  rendered = rendered.replace(/\n/g, '<br>');
  rendered = rendered.replace(/\x00HTAG(\d+)\x00/g, (_, index: string) => htmlTags[Number.parseInt(index, 10)]);

  return rendered;
}

export function wrapCssForPreview({
  raw,
  engine,
  wrapInStyleTag = true
}: {
  raw: string;
  engine: PreviewParserEngine;
  wrapInStyleTag?: boolean;
}): string {
  if (!raw || !raw.trim()) return '';

  const hasStyleTag = /<style[\s>]/i.test(raw);
  const processed = engine.risuChatParser(raw, { runVar: true });

  if (!wrapInStyleTag || hasStyleTag) {
    return processed;
  }

  return `<style>\n${processed}\n</style>`;
}

export function buildPreviewDocument(processedCss: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; img-src * data: blob:; style-src 'unsafe-inline'; font-src * data: blob:; media-src * data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none';">
<style>
:root {
  --FontColorStandard: #fafafa;
  --FontColorBold: #e5e5e5;
  --FontColorItalic: #8c8d93;
  --FontColorItalicBold: #8c8d93;
  --FontColorQuote1: #8BE9FD;
  --FontColorQuote2: #FFB86C;
  --risu-theme-bgcolor: #282a36;
  --risu-theme-darkbg: #21222c;
  --risu-theme-textcolor: #f5f5f5;
  --risu-theme-textcolor2: #64748b;
  --risu-theme-borderc: #6272a4;
  --risu-theme-selected: #44475a;
  --risu-theme-draculared: #ff5555;
  --risu-theme-darkborderc: #4b5563;
  --risu-theme-darkbutton: #374151;
  --risu-font-family: Arial, sans-serif, serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--risu-theme-bgcolor);
  color: var(--risu-theme-textcolor);
  font-family: var(--risu-font-family);
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
  overflow-y: auto;
}
.background-dom {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}
.background-dom * { pointer-events: auto; }
.default-chat-screen {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 8px 0 80px;
}
.risu-chat {
  display: flex;
  width: 100%;
  max-width: 100%;
  justify-content: center;
  box-sizing: border-box;
}
.chat-message-container:last-child .dyna-icon { display: block; }
.risu-chat-inner {
  display: flex;
  color: var(--risu-theme-textcolor);
  margin: 4px 16px;
  padding: 8px;
  flex-grow: 1;
  align-items: flex-start;
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
}
.chat-avatar {
  width: 45px;
  height: 45px;
  min-width: 45px;
  border-radius: 6px;
  background-color: var(--risu-theme-selected);
  background-size: cover;
  background-position: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  flex-shrink: 0;
}
.chat-content {
  display: flex;
  flex-direction: column;
  margin-left: 16px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.chat-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--risu-theme-textcolor);
  margin-bottom: 4px;
}
.flexium { display: flex; flex-direction: row; justify-content: flex-start; }
.chat-width {
  max-width: 100%;
  word-break: normal;
  overflow-wrap: anywhere;
}
.chattext {
  font-size: 1rem;
  line-height: 1.75;
  color: var(--FontColorStandard);
}
.chattext p { color: var(--FontColorStandard); margin: 0.25em 0; }
.chattext em { color: var(--FontColorItalic); font-style: italic; }
.chattext strong { color: var(--FontColorBold); font-weight: bold; }
.chattext strong em, .chattext em strong { color: var(--FontColorItalicBold); font-weight: bold; font-style: italic; }
.chattext mark[risu-mark="quote1"] { background: transparent; color: var(--FontColorQuote1); }
.chattext mark[risu-mark="quote2"] { background: transparent; color: var(--FontColorQuote2); }
.chattext img { max-width: 100%; height: auto; border-radius: 4px; margin: 4px 0; }
.chattext a { color: #8BE9FD; text-decoration: underline; }
.chattext code {
  background: rgba(255,255,255,0.1);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: 'Cascadia Code', 'Consolas', monospace;
}
.chattext pre {
  background: rgba(0,0,0,0.3);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}
.chattext pre code { background: none; padding: 0; }
.chattext hr { border: none; border-top: 1px solid var(--risu-theme-borderc); margin: 8px 0; }
.chattext blockquote, .chattext mark[risu-mark="blockquote1"] {
  display: block;
  border-left: 4px solid var(--FontColorQuote1);
  background: color-mix(in srgb, transparent 90%, var(--FontColorQuote1) 10%);
  padding: 0.5rem 1rem;
  color: var(--FontColorQuote1);
  margin: 4px 0;
}
.cbs-button {
  display: inline-block;
  padding: 6px 16px;
  margin: 4px 2px;
  background: var(--risu-theme-selected);
  color: var(--risu-theme-textcolor);
  border: 1px solid var(--risu-theme-borderc);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9em;
  transition: background 0.15s;
}
.cbs-button:hover { background: var(--risu-theme-borderc); }
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: var(--risu-theme-darkbg); }
::-webkit-scrollbar-thumb { background: var(--risu-theme-selected); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--risu-theme-borderc); }
</style>
</head><body>
<div class="background-dom" id="bg-dom">${processedCss}</div>
<div class="default-chat-screen" id="chat-container"></div>
<script>
function cbsClick(varName, value) {
  window.parent.postMessage({ type: 'cbs-button', varName: varName, value: value }, '*');
}
document.addEventListener('click', function(event) {
  var button = event.target.closest('[risu-btn]');
  if (button) {
    event.preventDefault();
    event.stopPropagation();
    window.parent.postMessage({ type: 'risu-btn', data: button.getAttribute('risu-btn') }, '*');
    return;
  }

  var trigger = event.target.closest('[risu-trigger]');
  if (trigger) {
    event.preventDefault();
    event.stopPropagation();
    window.parent.postMessage({ type: 'risu-trigger', name: trigger.getAttribute('risu-trigger') }, '*');
  }
});
</script>
</body></html>`;
}

export function buildPreviewMessageHtml({ index, name, avatarBg, content }: PreviewMessageHtmlInput): string {
  return `<div class="risu-chat" data-chat-index="${index}">
  <div class="risu-chat-inner">
    <div class="chat-avatar" style="background-color:${escapePreviewHtml(avatarBg)}"></div>
    <span class="chat-content">
      <div class="flexium items-center chat-width">
        <div class="chat-width chat-name">${escapePreviewHtml(name)}</div>
      </div>
      <span class="chattext chat-width prose">${sanitizePreviewHtml(content)}</span>
    </span>
  </div>
</div>`;
}
