"use strict";
/**
 * CBS (Conditional Block Syntax) Parser
 *
 * Tokenizer, AST builder, toggle extractor, and nesting validator
 * for RisuAI {{#when::...}} conditional blocks.
 *
 * Ported from risucbs/lib/parser.mjs — pure functions, no external deps.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMatchingClose = findMatchingClose;
exports.stripBraces = stripBraces;
exports.tokenize = tokenize;
exports.buildTree = buildTree;
exports.parse = parse;
exports.resolveInnerExpressions = resolveInnerExpressions;
exports.extractToggles = extractToggles;
exports.extractToggleValues = extractToggleValues;
exports.extractTogglesFromBlocks = extractTogglesFromBlocks;
exports.validateNesting = validateNesting;
/* ── Helpers ────────────────────────────────────────────── */
function findMatchingClose(text, start) {
    let depth = 0;
    let i = start;
    while (i < text.length - 1) {
        if (text[i] === '{' && text[i + 1] === '{') {
            depth++;
            i += 2;
        }
        else if (text[i] === '}' && text[i + 1] === '}') {
            depth--;
            if (depth === 0)
                return i;
            i += 2;
        }
        else {
            i++;
        }
    }
    return -1;
}
function stripBraces(tag) {
    if (tag.startsWith('{{') && tag.endsWith('}}')) {
        return tag.slice(2, -2);
    }
    return tag;
}
/* ── Tokenizer ──────────────────────────────────────────── */
function tokenize(text) {
    const tokens = [];
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
                    }
                    else if (text[j] === '}' && text[j + 1] === '}') {
                        depth--;
                        if (depth === 0) {
                            j += 2;
                            break;
                        }
                        j += 2;
                    }
                    else {
                        j++;
                    }
                }
                if (depth !== 0)
                    j = text.length;
                tokens.push({ type: 'close', offset: start, length: j - start, raw: text.substring(start, j) });
                i = j;
            }
            else if (i + 2 < text.length && text[i + 2] === '#') {
                const start = i;
                let j = i + 2;
                let depth = 1;
                while (j < text.length - 1) {
                    if (text[j] === '{' && text[j + 1] === '{') {
                        depth++;
                        j += 2;
                    }
                    else if (text[j] === '}' && text[j + 1] === '}') {
                        depth--;
                        if (depth === 0) {
                            j += 2;
                            break;
                        }
                        j += 2;
                    }
                    else {
                        j++;
                    }
                }
                if (depth !== 0)
                    j = text.length;
                tokens.push({ type: 'open', offset: start, length: j - start, raw: text.substring(start, j) });
                i = j;
            }
            else {
                i += 2;
            }
        }
        else {
            i++;
        }
    }
    return tokens;
}
/* ── AST Builder ────────────────────────────────────────── */
function buildTree(text, tokens) {
    const root = [];
    const stack = [];
    const errors = [];
    const finalTokens = [...tokens];
    for (const tok of finalTokens) {
        if (tok.type === 'open') {
            stack.push({ token: tok, children: [] });
        }
        else if (tok.type === 'close') {
            if (stack.length === 0) {
                errors.push(`Unmatched ${tok.raw} at offset ${tok.offset}`);
                continue;
            }
            const frame = stack.pop();
            const openTok = frame.token;
            const block = {
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
            }
            else {
                root.push(block);
            }
        }
    }
    while (stack.length > 0) {
        const frame = stack.pop();
        const openTok = frame.token;
        const synthClose = { type: 'close', offset: text.length, length: 0, raw: '' };
        finalTokens.push(synthClose);
        const block = {
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
        }
        else {
            root.push(block);
        }
    }
    return { blocks: root, errors, tokens: finalTokens };
}
/* ── Parse (convenience) ────────────────────────────────── */
function parse(text) {
    const rawTokens = tokenize(text);
    const { blocks, errors, tokens } = buildTree(text, rawTokens);
    return { blocks, errors, tokens };
}
/* ── Inner Expression Resolver ──────────────────────────── */
function resolveFunction(inner, toggles) {
    const parts = inner.split('::');
    const func = parts[0].toLowerCase().replace(/[\s_-]/g, '');
    switch (func) {
        case 'getglobalvar':
            return toggles[parts[1]] ?? '0';
        case 'or': {
            for (let i = 1; i < parts.length; i++) {
                if (parts[i] === '1' || parts[i] === 'true')
                    return '1';
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
function resolveInnerExpressions(text, toggles) {
    let result = text;
    let maxIterations = 50;
    while (maxIterations-- > 0) {
        let changed = false;
        const newResult = result.replace(/\{\{((?:(?!\{\{|\}\}).)*)\}\}/g, (_match, inner) => {
            const resolved = resolveFunction(inner, toggles);
            if (resolved !== _match)
                changed = true;
            return resolved;
        });
        result = newResult;
        if (!changed)
            break;
    }
    return result;
}
/* ── Toggle Extraction ──────────────────────────────────── */
function extractToggles(text) {
    const toggles = new Set();
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
                }
                else if (part === 'tis' || part === 'tisnot' || part === 'vis' || part === 'visnot') {
                    if (i - 1 >= 0) {
                        toggles.add('toggle_' + parts[i - 1]);
                    }
                }
            }
        }
    }
    return toggles;
}
function extractToggleValues(text, toggleName) {
    const values = new Set();
    const { tokens } = parse(text);
    const shortName = toggleName.startsWith('toggle_') ? toggleName.substring(7) : toggleName;
    const valueRegex = new RegExp(`\\{\\{getglobalvar::${toggleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}::(is|isnot)::([^:}]+)\\}{0,2}`, 'g');
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
                if ((parts[i] === 'tis' || parts[i] === 'tisnot' || parts[i] === 'vis' || parts[i] === 'visnot') &&
                    parts[i - 1] === shortName) {
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
function extractTogglesFromBlocks(blocks, result = new Set()) {
    for (const block of blocks) {
        const togglesInTag = extractToggles(block.raw);
        for (const t of togglesInTag)
            result.add(t);
        if (block.children.length > 0) {
            extractTogglesFromBlocks(block.children, result);
        }
    }
    return result;
}
/* ── Nesting Validation ─────────────────────────────────── */
function validateNesting(text) {
    const { tokens, errors } = parse(text);
    const openCount = tokens.filter((t) => t.type === 'open').length;
    const closeCount = tokens.filter((t) => t.type === 'close').length;
    return { valid: errors.length === 0, openCount, closeCount, errors };
}
