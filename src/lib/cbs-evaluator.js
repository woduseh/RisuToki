"use strict";
/**
 * CBS Evaluator
 *
 * Evaluates {{#when::...}} conditional blocks using RisuAI's
 * stack-based reverse evaluation strategy (blockStartMatcher/blockEndMatcher).
 *
 * Ported from risucbs/lib/evaluator.mjs — pure functions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateNesting = exports.extractToggleValues = exports.extractToggles = exports.parse = void 0;
exports.evaluateWhenTag = evaluateWhenTag;
exports.resolve = resolve;
exports.generateCombinations = generateCombinations;
const cbs_parser_1 = require("./cbs-parser");
/* ── When-Tag Evaluation ────────────────────────────────── */
function evaluateWhenTag(rawTag, toggles) {
    const resolved = (0, cbs_parser_1.resolveInnerExpressions)(rawTag, toggles);
    const inner = (0, cbs_parser_1.stripBraces)(resolved);
    const isTruthy = (s) => s === 'true' || s === '1' || s === true || s === 1;
    if (inner.startsWith('#if ')) {
        const val = inner.slice(4).trim();
        return { active: isTruthy(val), mode: 'legacy' };
    }
    if (inner.startsWith('#when ') && !inner.includes('::')) {
        const val = inner.slice(6).trim();
        const mappedVal = toggles['toggle_' + val] !== undefined ? toggles['toggle_' + val] : val;
        return { active: isTruthy(mappedVal), mode: 'normal' };
    }
    const parts = inner.split('::');
    if (parts[0] !== '#when' && parts[0] !== '#if') {
        return { active: false, mode: 'normal' };
    }
    const statement = parts.slice(1);
    let mode = 'normal';
    const getVar = (name) => toggles['toggle_' + name] ?? '0';
    while (statement.length > 1) {
        const condition = statement.pop();
        const operator = statement.pop();
        switch (operator) {
            case 'not':
                statement.push(isTruthy(condition) ? '0' : '1');
                break;
            case 'keep':
                mode = 'keep';
                statement.push(condition);
                break;
            case 'legacy':
                mode = 'legacy';
                statement.push(condition);
                break;
            case 'and': {
                const condition2 = statement.pop();
                statement.push(isTruthy(condition) && isTruthy(condition2) ? '1' : '0');
                break;
            }
            case 'or': {
                const condition2 = statement.pop();
                statement.push(isTruthy(condition) || isTruthy(condition2) ? '1' : '0');
                break;
            }
            case 'is': {
                const condition2 = statement.pop();
                statement.push(condition === condition2 ? '1' : '0');
                break;
            }
            case 'isnot': {
                const condition2 = statement.pop();
                statement.push(condition !== condition2 ? '1' : '0');
                break;
            }
            case '>': {
                const condition2 = statement.pop();
                statement.push(parseFloat(condition2) > parseFloat(condition) ? '1' : '0');
                break;
            }
            case '<': {
                const condition2 = statement.pop();
                statement.push(parseFloat(condition2) < parseFloat(condition) ? '1' : '0');
                break;
            }
            case '>=': {
                const condition2 = statement.pop();
                statement.push(parseFloat(condition2) >= parseFloat(condition) ? '1' : '0');
                break;
            }
            case '<=': {
                const condition2 = statement.pop();
                statement.push(parseFloat(condition2) <= parseFloat(condition) ? '1' : '0');
                break;
            }
            case 'var':
            case 'toggle':
                statement.push(getVar(condition));
                break;
            case 'vis':
            case 'tis': {
                const varName = statement.pop();
                const val = getVar(varName);
                statement.push(val === condition ? '1' : '0');
                break;
            }
            case 'visnot':
            case 'tisnot': {
                const varName = statement.pop();
                const val = getVar(varName);
                statement.push(val !== condition ? '1' : '0');
                break;
            }
            default:
                statement.push(isTruthy(condition) ? '1' : '0');
                break;
        }
    }
    const finalCondition = statement[0] || '0';
    return { active: isTruthy(finalCondition), mode };
}
/* ── Block Resolution ───────────────────────────────────── */
function adjustOffsets(blocks, delta) {
    return blocks.map((b) => ({
        ...b,
        startOffset: b.startOffset + delta,
        contentStart: b.contentStart + delta,
        contentEnd: b.contentEnd + delta,
        endOffset: b.endOffset + delta,
        children: adjustOffsets(b.children, delta),
    }));
}
function resolve(text, blocks, toggles) {
    if (blocks.length === 0)
        return text;
    const sorted = [...blocks].sort((a, b) => b.startOffset - a.startOffset);
    let result = text;
    for (const block of sorted) {
        const { active, mode } = evaluateWhenTag(block.raw, toggles);
        const innerContent = result.substring(block.contentStart, block.contentEnd);
        const elseIdx = innerContent.indexOf('{{:else}}');
        let selectedContent = '';
        let branchStart = block.contentStart;
        if (active) {
            if (elseIdx !== -1) {
                selectedContent = innerContent.substring(0, elseIdx);
            }
            else {
                selectedContent = innerContent;
            }
        }
        else {
            if (elseIdx !== -1) {
                selectedContent = innerContent.substring(elseIdx + 9);
                branchStart = block.contentStart + elseIdx + 9;
            }
            else {
                selectedContent = '';
            }
        }
        if (selectedContent !== '' && block.children.length > 0) {
            const branchEnd = branchStart + selectedContent.length;
            const relevantChildren = block.children.filter((c) => c.startOffset >= branchStart && c.endOffset <= branchEnd);
            if (relevantChildren.length > 0) {
                const adjustedChildren = adjustOffsets(relevantChildren, -branchStart);
                selectedContent = resolve(selectedContent, adjustedChildren, toggles);
            }
        }
        if (mode !== 'keep' && selectedContent !== '') {
            selectedContent = selectedContent.replace(/^\s*\r?\n/, '').replace(/\r?\n\s*$/, '');
        }
        result = result.substring(0, block.startOffset) + selectedContent + result.substring(block.endOffset);
    }
    return result;
}
/* ── Combination Generator ──────────────────────────────── */
function generateCombinations(toggleNames, possibleValues = {}) {
    if (toggleNames.length === 0)
        return [{}];
    const [first, ...rest] = toggleNames;
    const values = possibleValues[first] || ['0', '1'];
    const subCombos = generateCombinations(rest, possibleValues);
    const result = [];
    for (const val of values) {
        for (const sub of subCombos) {
            result.push({ [first]: val, ...sub });
        }
    }
    return result;
}
/* ── Re-exports for convenience ─────────────────────────── */
var cbs_parser_2 = require("./cbs-parser");
Object.defineProperty(exports, "parse", { enumerable: true, get: function () { return cbs_parser_2.parse; } });
Object.defineProperty(exports, "extractToggles", { enumerable: true, get: function () { return cbs_parser_2.extractToggles; } });
Object.defineProperty(exports, "extractToggleValues", { enumerable: true, get: function () { return cbs_parser_2.extractToggleValues; } });
Object.defineProperty(exports, "validateNesting", { enumerable: true, get: function () { return cbs_parser_2.validateNesting; } });
