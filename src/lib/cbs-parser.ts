/**
 * CBS (Conditional Block Syntax) Parser
 *
 * Tokenizer, AST builder, toggle extractor, and nesting validator
 * for RisuAI {{#when::...}} conditional blocks.
 *
 * Ported from risucbs/lib/parser.mjs — pure functions, no external deps.
 */

/* ── Types ──────────────────────────────────────────────── */

export interface Token {
  type: 'open' | 'close';
  offset: number;
  length: number;
  raw: string;
}

export interface Block {
  type: 'when';
  raw: string;
  startOffset: number;
  contentStart: number;
  contentEnd: number;
  endOffset: number;
  children: Block[];
}

export interface ParseResult {
  blocks: Block[];
  errors: string[];
  tokens: Token[];
}

export interface ValidationResult {
  valid: boolean;
  openCount: number;
  closeCount: number;
  errors: string[];
}

export type ToggleMap = Record<string, string>;

/* ── Helpers ────────────────────────────────────────────── */

export function findMatchingClose(text: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < text.length - 1) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++;
      i += 2;
    } else if (text[i] === '}' && text[i + 1] === '}') {
      depth--;
      if (depth === 0) return i;
      i += 2;
    } else {
      i++;
    }
  }
  return -1;
}

export function stripBraces(tag: string): string {
  if (tag.startsWith('{{') && tag.endsWith('}}')) {
    return tag.slice(2, -2);
  }
  return tag;
}

/* ── Tokenizer ──────────────────────────────────────────── */

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === '{' && i + 1 < text.length && text[i + 1] === '{') {
      if (i + 2 < text.length && text[i + 2] === '/' && (i + 3 >= text.length || text[i + 3] !== '/')) {
        const start = i;
        let j = i + 2;
        let depth = 1;
        while (j < text.length - 1) {
          if (text[j] === '{' && text[j + 1] === '{') {
            depth++;
            j += 2;
          } else if (text[j] === '}' && text[j + 1] === '}') {
            depth--;
            if (depth === 0) {
              j += 2;
              break;
            }
            j += 2;
          } else {
            j++;
          }
        }
        if (depth !== 0) j = text.length;
        tokens.push({ type: 'close', offset: start, length: j - start, raw: text.substring(start, j) });
        i = j;
      } else if (i + 2 < text.length && text[i + 2] === '#') {
        const start = i;
        let j = i + 2;
        let depth = 1;
        while (j < text.length - 1) {
          if (text[j] === '{' && text[j + 1] === '{') {
            depth++;
            j += 2;
          } else if (text[j] === '}' && text[j + 1] === '}') {
            depth--;
            if (depth === 0) {
              j += 2;
              break;
            }
            j += 2;
          } else {
            j++;
          }
        }
        if (depth !== 0) j = text.length;
        tokens.push({ type: 'open', offset: start, length: j - start, raw: text.substring(start, j) });
        i = j;
      } else {
        i += 2;
      }
    } else {
      i++;
    }
  }

  return tokens;
}

/* ── AST Builder ────────────────────────────────────────── */

export function buildTree(text: string, tokens: Token[]): ParseResult {
  const root: Block[] = [];
  const stack: { token: Token; children: Block[] }[] = [];
  const errors: string[] = [];

  const finalTokens = [...tokens];

  for (const tok of finalTokens) {
    if (tok.type === 'open') {
      stack.push({ token: tok, children: [] });
    } else if (tok.type === 'close') {
      if (stack.length === 0) {
        errors.push(`Unmatched ${tok.raw} at offset ${tok.offset}`);
        continue;
      }

      const frame = stack.pop()!;
      const openTok = frame.token;

      const block: Block = {
        type: 'when',
        raw: openTok.raw || '',
        startOffset: openTok.offset,
        contentStart: openTok.offset + openTok.length,
        contentEnd: tok.offset,
        endOffset: tok.offset + tok.length,
        children: frame.children,
      };

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(block);
      } else {
        root.push(block);
      }
    }
  }

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const openTok = frame.token;
    const synthClose: Token = { type: 'close', offset: text.length, length: 0, raw: '' };
    finalTokens.push(synthClose);

    const block: Block = {
      type: 'when',
      raw: openTok.raw || '',
      startOffset: openTok.offset,
      contentStart: openTok.offset + openTok.length,
      contentEnd: text.length,
      endOffset: text.length,
      children: frame.children,
    };

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(block);
    } else {
      root.push(block);
    }
  }

  return { blocks: root, errors, tokens: finalTokens };
}

/* ── Parse (convenience) ────────────────────────────────── */

export function parse(text: string): ParseResult {
  const rawTokens = tokenize(text);
  const { blocks, errors, tokens } = buildTree(text, rawTokens);
  return { blocks, errors, tokens };
}

/* ── Inner Expression Resolver ──────────────────────────── */

function resolveFunction(inner: string, toggles: ToggleMap): string {
  const parts = inner.split('::');
  const func = parts[0].toLowerCase().replace(/[\s_-]/g, '');

  switch (func) {
    case 'getglobalvar':
      return toggles[parts[1]] ?? '0';

    case 'or': {
      for (let i = 1; i < parts.length; i++) {
        if (parts[i] === '1' || parts[i] === 'true') return '1';
      }
      return '0';
    }

    case 'notequal':
      if (parts.length >= 3) {
        return parts[1] !== parts[2] ? '1' : '0';
      }
      return '0';

    case 'equal':
      if (parts.length >= 3) {
        return parts[1] === parts[2] ? '1' : '0';
      }
      return '0';

    default:
      return `{{${inner}}}`;
  }
}

export function resolveInnerExpressions(text: string, toggles: ToggleMap): string {
  let result = text;
  let maxIterations = 50;

  while (maxIterations-- > 0) {
    let changed = false;

    const newResult = result.replace(/\{\{((?:(?!\{\{|\}\}).)*)\}\}/g, (_match, inner: string) => {
      const resolved = resolveFunction(inner, toggles);
      if (resolved !== _match) changed = true;
      return resolved;
    });

    result = newResult;
    if (!changed) break;
  }

  return result;
}

/* ── Toggle Extraction ──────────────────────────────────── */

export function extractToggles(text: string): Set<string> {
  const toggles = new Set<string>();
  const regex = /\{\{getglobalvar::(toggle_[A-Za-z가-힣0-9_.-]+)\}\}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    toggles.add(match[1]);
  }

  const tokens = tokenize(text);
  for (const tok of tokens) {
    if (tok.type === 'open') {
      const inner = stripBraces(tok.raw);

      if (inner.startsWith('#when ') && !inner.includes('::')) {
        const val = inner.slice(6).trim();
        toggles.add('toggle_' + val);
        continue;
      }

      const parts = inner.split('::');
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === 'toggle' || part === 'var') {
          if (i + 1 < parts.length) {
            toggles.add('toggle_' + parts[i + 1]);
          }
        } else if (part === 'tis' || part === 'tisnot' || part === 'vis' || part === 'visnot') {
          if (i - 1 >= 0) {
            toggles.add('toggle_' + parts[i - 1]);
          }
        }
      }
    }
  }
  return toggles;
}

export function extractToggleValues(text: string, toggleName: string): Set<string> {
  const values = new Set<string>();
  const { tokens } = parse(text);
  const shortName = toggleName.startsWith('toggle_') ? toggleName.substring(7) : toggleName;

  const valueRegex = new RegExp(
    `\\{\\{getglobalvar::${toggleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}::(is|isnot)::([^:}]+)\\}{0,2}`,
    'g',
  );
  let match;
  while ((match = valueRegex.exec(text)) !== null) {
    values.add(`${match[1]}:${match[2]}`);
  }

  for (const tok of tokens) {
    if (tok.type === 'open') {
      const inner = stripBraces(tok.raw);

      if (inner.startsWith('#when ') && !inner.includes('::')) {
        const val = inner.slice(6).trim();
        if (val === shortName) {
          values.add('is:1');
        }
        continue;
      }

      const parts = inner.split('::');
      for (let i = 0; i < parts.length; i++) {
        if (
          (parts[i] === 'tis' || parts[i] === 'tisnot' || parts[i] === 'vis' || parts[i] === 'visnot') &&
          parts[i - 1] === shortName
        ) {
          if (i + 1 < parts.length) {
            const op = parts[i].replace('v', '').replace('t', '');
            values.add(`${op}:${parts[i + 1]}`);
          }
        }
        if ((parts[i] === 'toggle' || parts[i] === 'var') && parts[i + 1] === shortName) {
          values.add('is:1');
        }
      }
    }
  }
  return values;
}

export function extractTogglesFromBlocks(blocks: Block[], result = new Set<string>()): Set<string> {
  for (const block of blocks) {
    const togglesInTag = extractToggles(block.raw);
    for (const t of togglesInTag) result.add(t);
    if (block.children.length > 0) {
      extractTogglesFromBlocks(block.children, result);
    }
  }
  return result;
}

/* ── Nesting Validation ─────────────────────────────────── */

export function validateNesting(text: string): ValidationResult {
  const { tokens, errors } = parse(text);
  const openCount = tokens.filter((t) => t.type === 'open').length;
  const closeCount = tokens.filter((t) => t.type === 'close').length;

  return { valid: errors.length === 0, openCount, closeCount, errors };
}
