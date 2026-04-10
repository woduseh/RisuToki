import { sanitizePreviewHtml } from './preview-sanitizer';

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
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { sanitizePreviewHtml } from './preview-sanitizer';

const HTML_TAG_TOKEN = '\x00PHT';
const BLOCK_HTML_TOKEN = '\x00PBH';
const INLINE_HTML_TOKEN = '\x00PIH';
const BLOCK_BREAK_TAGS =
  '(?:article|blockquote|details|div|dl|figure|figcaption|h[1-6]|hr|ol|p|pre|section|summary|table|ul)';

function restorePlaceholderValues(value: string, prefix: string, placeholders: string[]): string {
  return value.replace(new RegExp(`${prefix}(\\d+)\\x00`, 'g'), (_match, index: string) => {
    return placeholders[Number.parseInt(index, 10)] ?? '';
  });
}

function transformMarkdownTables(value: string): string {
  const lines = value.split('\n');
  const tableBlocks: { start: number; end: number }[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
      const start = i;
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) i++;
      tableBlocks.push({ start, end: i });
    } else {
      i++;
    }
  }

  for (let t = tableBlocks.length - 1; t >= 0; t--) {
    const block = tableBlocks[t];
    const tableLines = lines.slice(block.start, block.end);
    const isSepLine = (line: string) => /^\|[\s:|-]+\|$/.test(line.trim());
    const rows: string[][] = [];
    let headerCount = 0;

    for (const tableLine of tableLines) {
      if (isSepLine(tableLine)) {
        if (rows.length > 0) headerCount = rows.length;
        continue;
      }
      rows.push(
        tableLine
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    }

    let html = '<table>';
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const tag = rowIndex < headerCount ? 'th' : 'td';
      html += '<tr>' + rows[rowIndex].map((cell) => `<${tag}>${cell}</${tag}>`).join('') + '</tr>';
    }
    html += '</table>';
    lines.splice(block.start, block.end - block.start, html);
  }

  return lines.join('\n');
}

function transformMarkdownLists(value: string): string {
  const lines = value.split('\n');
  const renderedLines: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const unorderedMatch = lines[index].match(/^\s*[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const currentMatch = lines[index].match(/^\s*[-*+]\s+(.+)$/);
        if (!currentMatch) break;
        items.push(currentMatch[1]);
        index++;
      }
      renderedLines.push(`<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`);
      continue;
    }

    const orderedMatch = lines[index].match(/^\s*(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      const items: string[] = [];
      const start = Number.parseInt(orderedMatch[1], 10);
      while (index < lines.length) {
        const currentMatch = lines[index].match(/^\s*(\d+)\.\s+(.+)$/);
        if (!currentMatch) break;
        items.push(currentMatch[2]);
        index++;
      }
      const startAttr = start === 1 ? '' : ` start="${start}"`;
      renderedLines.push(`<ol${startAttr}>${items.map((item) => `<li>${item}</li>`).join('')}</ol>`);
      continue;
    }

    renderedLines.push(lines[index]);
    index++;
  }

  return renderedLines.join('\n');
}

function cleanupBlockLineBreaks(value: string): string {
  let cleaned = value;
  for (let pass = 0; pass < 2; pass++) {
    cleaned = cleaned.replace(new RegExp(`(<\\/?${BLOCK_BREAK_TAGS}[^>]*>)<br>`, 'g'), '$1');
    cleaned = cleaned.replace(new RegExp(`<br>(<\\/?${BLOCK_BREAK_TAGS}[^>]*>)`, 'g'), '$1');
  }
  return cleaned;
}

export function simpleMarkdown(text: string): string {
  if (!text) return '';

  let rendered = String(text);

  // Resolve RisuAI Private Use Area escape characters
  rendered = rendered
    .replace(/\uE9B8/g, '{{')
    .replace(/\uE9B9/g, '}}')
    .replace(/\uE9BA/g, '{')
    .replace(/\uE9BB/g, '}')
    .replace(/\uE9BC/g, '(')
    .replace(/\uE9BD/g, ')')
    .replace(/\uE9BE/g, ':');

  const blockHtml: string[] = [];
  rendered = rendered.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_match, _lang: string, code: string) => {
    blockHtml.push(`<pre><code>${escapePreviewHtml(code)}</code></pre>`);
    return `${BLOCK_HTML_TOKEN}${blockHtml.length - 1}\x00`;
  });

  const inlineHtml: string[] = [];
  rendered = rendered.replace(/`([^`]+)`/g, (_match, code: string) => {
    inlineHtml.push(`<code>${escapePreviewHtml(code)}</code>`);
    return `${INLINE_HTML_TOKEN}${inlineHtml.length - 1}\x00`;
  });

  const htmlTags: string[] = [];
  rendered = rendered.replace(/<[^>]+>/g, (match) => {
    htmlTags.push(match);
    return `${HTML_TAG_TOKEN}${htmlTags.length - 1}\x00`;
  });

  rendered = transformMarkdownTables(rendered);
  rendered = transformMarkdownLists(rendered);

  // Blockquote: lines starting with >
  rendered = rendered.replace(/^(&gt;|>)\s?(.*)$/gm, '<blockquote>$2</blockquote>');
  rendered = rendered.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  rendered = rendered.replace(/^(#{1,6})[ \t]+(.+)$/gm, (_match, hashes: string, heading: string) => {
    return `<h${hashes.length}>${heading.trim()}</h${hashes.length}>`;
  });

  rendered = rendered.replace(/^(?:-{3,}|\*{3,}|_{3,})$/gm, '<hr>');

  rendered = rendered.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  rendered = rendered.replace(/__(.+?)__/g, '<strong>$1</strong>');
  rendered = rendered.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  rendered = rendered.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');
  rendered = rendered.replace(/~~(.+?)~~/g, '<del>$1</del>');
  rendered = rendered.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
    (_match, label: string, href: string, title?: string) => {
      const titleAttr = title ? ` title="${escapePreviewHtml(title)}"` : '';
      return `<a href="${escapePreviewHtml(href)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${label}</a>`;
    },
  );
  rendered = rendered.replace(
    /\u201C([^\u201D]+)\u201D/g,
    '<span style="color:var(--FontColorQuote2)">\u201C$1\u201D</span>',
  );
  rendered = rendered.replace(
    /(?:^|(?<=[\s\n(]))"([^"]+?)"(?=[\s\n).,!?;:]|$)/gm,
    '<span style="color:var(--FontColorQuote2)">\u201C$1\u201D</span>',
  );

  rendered = restorePlaceholderValues(rendered, BLOCK_HTML_TOKEN, blockHtml);
  rendered = restorePlaceholderValues(rendered, INLINE_HTML_TOKEN, inlineHtml);
  rendered = restorePlaceholderValues(rendered, HTML_TAG_TOKEN, htmlTags);
  rendered = rendered.replace(/\n/g, '<br>');

  return cleanupBlockLineBreaks(rendered);
}

export function wrapCssForPreview({
  raw,
  engine,
  wrapInStyleTag = true,
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

function generateScriptNonce(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function buildPreviewDocument(_processedCss: string, runtimeScriptSource?: string): string {
  const nonce = runtimeScriptSource ? generateScriptNonce() : undefined;
  const scriptCsp = nonce ? `'nonce-${nonce}'` : "'none'";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${scriptCsp}; img-src * data: blob:; style-src 'unsafe-inline'; font-src * data: blob:; media-src * data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none';">
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
  padding: 8px 0 8px;
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
.chattext h1, .chattext h2, .chattext h3, .chattext h4, .chattext h5, .chattext h6 {
  color: var(--FontColorBold);
  line-height: 1.3;
  margin: 0.75em 0 0.35em;
}
.chattext h1 { font-size: 1.65em; }
.chattext h2 { font-size: 1.45em; }
.chattext h3 { font-size: 1.25em; }
.chattext h4 { font-size: 1.15em; }
.chattext h5 { font-size: 1.05em; }
.chattext h6 { font-size: 1em; }
.chattext em { color: var(--FontColorItalic); font-style: italic; }
.chattext strong { color: var(--FontColorBold); font-weight: bold; }
.chattext strong em, .chattext em strong { color: var(--FontColorItalicBold); font-weight: bold; font-style: italic; }
.chattext del, .chattext s { opacity: 0.72; text-decoration: line-through; }
.chattext mark[risu-mark="quote1"] { background: transparent; color: var(--FontColorQuote1); }
.chattext mark[risu-mark="quote2"] { background: transparent; color: var(--FontColorQuote2); }
.chattext img { max-width: 100%; height: auto; border-radius: 4px; margin: 4px 0; }
.chattext a { color: #8BE9FD; text-decoration: underline; }
.chattext ul, .chattext ol { margin: 0.5em 0; padding-left: 1.5em; }
.chattext li + li { margin-top: 0.2em; }
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
.chattext table {
  width: auto;
  max-width: 100%;
  border-collapse: collapse;
  margin: 0.5em 0;
}
.chattext th, .chattext td {
  border: 1px solid rgba(255,255,255,0.15);
  padding: 0.35rem 0.5rem;
  text-align: left;
  vertical-align: top;
}
.chattext th {
  color: var(--FontColorBold);
  background: rgba(255,255,255,0.06);
}
.chattext hr { border: none; border-top: 1px solid var(--risu-theme-borderc); margin: 8px 0; }
.chattext blockquote, .chattext mark[risu-mark="blockquote1"] {
  display: block;
  border-left: 4px solid var(--FontColorQuote1);
  background: color-mix(in srgb, transparent 90%, var(--FontColorQuote1) 10%);
  padding: 0.5rem 1rem;
  color: var(--FontColorQuote1);
  margin: 4px 0;
}
.chattext details, .chattext figure, .chattext section, .chattext article, .chattext dl {
  display: block;
  margin: 0.5em 0;
}
.chattext details {
  border: 1px solid var(--risu-theme-borderc);
  border-radius: 6px;
  background: rgba(255,255,255,0.04);
  padding: 0.4rem 0.6rem;
}
.chattext summary { cursor: pointer; font-weight: 600; }
.chattext figcaption {
  color: var(--risu-theme-textcolor2);
  font-size: 0.9em;
  margin-top: 0.35em;
}
.chattext dt { font-weight: 600; color: var(--FontColorBold); }
.chattext dd { margin-left: 1rem; }
.chattext sub, .chattext sup {
  font-size: 0.75em;
  line-height: 0;
  position: relative;
  vertical-align: baseline;
}
.chattext sub { bottom: -0.25em; }
.chattext sup { top: -0.5em; }
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
<div class="background-dom" id="bg-dom"></div>
<div class="default-chat-screen" id="chat-container"></div>
${runtimeScriptSource ? `<script nonce="${nonce}">${runtimeScriptSource}</script>` : ''}
</body></html>`;
}

export function buildPreviewMessageHtml({ index, name, avatarBg, content }: PreviewMessageHtmlInput): string {
  return `<div class="risu-chat" data-chat-index="${index}">
  <div class="risu-chat-inner">
    <div class="chat-avatar" style="background-color:${escapePreviewHtml(avatarBg)}"></div>
    <div class="chat-content">
      <div class="flexium items-center chat-width">
        <div class="chat-width chat-name">${escapePreviewHtml(name)}</div>
      </div>
      <div class="chattext chat-width prose">${sanitizePreviewHtml(content)}</div>
    </div>
  </div>
</div>`;
}
