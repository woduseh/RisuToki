import { describe, it, expect } from 'vitest';
import {
  findMatchingClose,
  tokenize,
  parse,
  extractToggles,
  resolveInnerExpressions,
  validateNesting,
  extractToggleValues,
} from './cbs-parser';
import { evaluateWhenTag, resolve, generateCombinations } from './cbs-evaluator';

// ── findMatchingClose ──

describe('findMatchingClose', () => {
  it('simple case', () => {
    expect(findMatchingClose('{{hello}}', 0)).toBe(7);
  });

  it('nested once', () => {
    expect(findMatchingClose('{{a{{b}}c}}', 0)).toBe(9);
  });

  it('nested twice', () => {
    expect(findMatchingClose('{{a{{b{{c}}d}}e}}', 0)).toBe(15);
  });

  it('no match', () => {
    expect(findMatchingClose('no braces', 0)).toBe(-1);
  });
});

// ── resolveInnerExpressions ──

describe('resolveInnerExpressions', () => {
  it('getglobalvar resolves', () => {
    const r = resolveInnerExpressions('{{getglobalvar::toggle_A}}', { toggle_A: '3' });
    expect(r).toBe('3');
  });

  it('getglobalvar defaults to 0', () => {
    const r = resolveInnerExpressions('{{getglobalvar::toggle_A}}', {});
    expect(r).toBe('0');
  });

  it('or(notequal) both 0 → 0', () => {
    const r = resolveInnerExpressions(
      '{{or::{{notequal::{{getglobalvar::toggle_Time}}::0}}::{{notequal::{{getglobalvar::toggle_Prof}}::0}}}}',
      { toggle_Time: '0', toggle_Prof: '0' },
    );
    expect(r).toBe('0');
  });

  it('or(notequal) one non-zero → 1', () => {
    const r = resolveInnerExpressions(
      '{{or::{{notequal::{{getglobalvar::toggle_Time}}::0}}::{{notequal::{{getglobalvar::toggle_Prof}}::0}}}}',
      { toggle_Time: '1', toggle_Prof: '0' },
    );
    expect(r).toBe('1');
  });
});

// ── evaluateWhenTag ──

describe('evaluateWhenTag', () => {
  // is / isnot basics
  it('is: 0 == 0 → active', () => {
    const r = evaluateWhenTag('{{#when::keep::0::is::0}}', {});
    expect(r.active).toBe(true);
    expect(r.mode).toBe('keep');
  });

  it('is: 1 != 0 → inactive', () => {
    const r = evaluateWhenTag('{{#when::keep::1::is::0}}', {});
    expect(r.active).toBe(false);
  });

  it('isnot: 0 != 3 → active', () => {
    const r = evaluateWhenTag('{{#when::keep::0::isnot::3}}', {});
    expect(r.active).toBe(true);
  });

  it('isnot: 3 == 3 → inactive', () => {
    const r = evaluateWhenTag('{{#when::keep::3::isnot::3}}', {});
    expect(r.active).toBe(false);
  });

  // getglobalvar + is/isnot
  it('getglobalvar + is: match → active', () => {
    const r = evaluateWhenTag('{{#when::keep::{{getglobalvar::toggle_Narration}}::is::0}}', { toggle_Narration: '0' });
    expect(r.active).toBe(true);
  });

  it('getglobalvar + is: mismatch → inactive', () => {
    const r = evaluateWhenTag('{{#when::keep::{{getglobalvar::toggle_Narration}}::is::0}}', { toggle_Narration: '3' });
    expect(r.active).toBe(false);
  });

  it('getglobalvar + isnot: 0 != 3 → active', () => {
    const r = evaluateWhenTag('{{#when::keep::{{getglobalvar::toggle_Narration}}::isnot::3}}', {
      toggle_Narration: '0',
    });
    expect(r.active).toBe(true);
  });

  it('getglobalvar + isnot: 3 == 3 → inactive', () => {
    const r = evaluateWhenTag('{{#when::keep::{{getglobalvar::toggle_Narration}}::isnot::3}}', {
      toggle_Narration: '3',
    });
    expect(r.active).toBe(false);
  });

  // complex or(notequal)
  it('complex or: both 0 → inactive', () => {
    const tag =
      '{{#when::keep::{{or::{{notequal::{{getglobalvar::toggle_Time}}::0}}::{{notequal::{{getglobalvar::toggle_ProfileDeviation}}::0}}}}::is::1}}';
    const r = evaluateWhenTag(tag, { toggle_Time: '0', toggle_ProfileDeviation: '0' });
    expect(r.active).toBe(false);
  });

  it('complex or: Time=1 → active', () => {
    const tag =
      '{{#when::keep::{{or::{{notequal::{{getglobalvar::toggle_Time}}::0}}::{{notequal::{{getglobalvar::toggle_ProfileDeviation}}::0}}}}::is::1}}';
    const r = evaluateWhenTag(tag, { toggle_Time: '1', toggle_ProfileDeviation: '0' });
    expect(r.active).toBe(true);
  });

  it('complex or: Prof=2 → active', () => {
    const tag =
      '{{#when::keep::{{or::{{notequal::{{getglobalvar::toggle_Time}}::0}}::{{notequal::{{getglobalvar::toggle_ProfileDeviation}}::0}}}}::is::1}}';
    const r = evaluateWhenTag(tag, { toggle_Time: '0', toggle_ProfileDeviation: '2' });
    expect(r.active).toBe(true);
  });

  // comparison operators
  it('>: 5 > 3 → active', () => {
    const r = evaluateWhenTag('{{#when::keep::5::>::3}}', {});
    expect(r.active).toBe(true);
  });

  it('>: 3 > 5 → inactive', () => {
    const r = evaluateWhenTag('{{#when::keep::3::>::5}}', {});
    expect(r.active).toBe(false);
  });

  it('>=: 3 >= 3 → active', () => {
    const r = evaluateWhenTag('{{#when::keep::3::>=::3}}', {});
    expect(r.active).toBe(true);
  });

  // logical operators
  it('and: 1 && 1 → active', () => {
    const r = evaluateWhenTag('{{#when::keep::1::and::1}}', {});
    expect(r.active).toBe(true);
  });

  it('and: 1 && 0 → inactive', () => {
    const r = evaluateWhenTag('{{#when::keep::1::and::0}}', {});
    expect(r.active).toBe(false);
  });

  it('or: 0 || 1 → active', () => {
    const r = evaluateWhenTag('{{#when::keep::0::or::1}}', {});
    expect(r.active).toBe(true);
  });

  it('or: 0 || 0 → inactive', () => {
    const r = evaluateWhenTag('{{#when::keep::0::or::0}}', {});
    expect(r.active).toBe(false);
  });

  // not operator
  it('not 1 → inactive', () => {
    const r = evaluateWhenTag('{{#when::keep::not::1}}', {});
    expect(r.active).toBe(false);
  });

  it('not 0 → active', () => {
    const r = evaluateWhenTag('{{#when::keep::not::0}}', {});
    expect(r.active).toBe(true);
  });

  // toggle operator
  it('Toggle operator evaluation (Truthy)', () => {
    const r = evaluateWhenTag('{{#when::toggle::myToggle}}', { toggle_myToggle: '1' });
    expect(r.active).toBe(true);
  });

  it('Toggle operator evaluation (Falsy)', () => {
    const r = evaluateWhenTag('{{#when::toggle::myToggle}}', { toggle_myToggle: '0' });
    expect(r.active).toBe(false);
  });

  // tis / tisnot operators
  it('tis operator evaluation', () => {
    const r = evaluateWhenTag('{{#when::myVar::tis::2}}', { toggle_myVar: '2' });
    expect(r.active).toBe(true);
  });

  it('tisnot operator evaluation', () => {
    const r = evaluateWhenTag('{{#when::myVar::tisnot::2}}', { toggle_myVar: '2' });
    expect(r.active).toBe(false);
  });

  // legacy #if tag
  it('Legacy #if tag (Truthy)', () => {
    const r = evaluateWhenTag('{{#if 1}}', {});
    expect(r.active).toBe(true);
  });

  it('Legacy #if tag (Falsy)', () => {
    const r = evaluateWhenTag('{{#if 0}}', {});
    expect(r.active).toBe(false);
  });

  // space separated when tag
  it('Space separated when tag (Truthy)', () => {
    const r = evaluateWhenTag('{{#when 1}}', {});
    expect(r.active).toBe(true);
  });

  it('Space separated when tag (Falsy)', () => {
    const r = evaluateWhenTag('{{#when 0}}', {});
    expect(r.active).toBe(false);
  });

  // implicit toggle_ prefix
  it('Implicit toggle_ prefix for variables (tis)', () => {
    const r = evaluateWhenTag('{{#when::myVar::tis::1}}', { toggle_myVar: '1' });
    expect(r.active).toBe(true);
  });
});

// ── tokenize ──

describe('tokenize', () => {
  it('one open + one close', () => {
    const text = 'hello {{#when::keep::A::is::1}}world{{/}} end';
    const tokens = tokenize(text);
    expect(tokens.length).toBe(2);
  });

  it('first is open', () => {
    const text = 'hello {{#when::keep::A::is::1}}world{{/}} end';
    const tokens = tokenize(text);
    expect(tokens[0].type).toBe('open');
  });

  it('second is close', () => {
    const text = 'hello {{#when::keep::A::is::1}}world{{/}} end';
    const tokens = tokenize(text);
    expect(tokens[1].type).toBe('close');
  });

  it('nested: 2 opens + 2 closes', () => {
    const text = '{{#when::keep::A::is::1}}outer{{#when::keep::B::is::1}}inner{{/}}rest{{/}}';
    const tokens = tokenize(text);
    expect(tokens.length).toBe(4);
  });

  it('Valid close tag variations', () => {
    const text =
      '{{#when::keep::A::is::1}}content{{/when}}\n{{#when::keep::A::is::1}}content{{/if}}\n{{#when::keep::A::is::1}}content{{/anything}}';
    const { blocks } = parse(text);
    expect(blocks.length).toBe(3);
  });
});

// ── parse ──

describe('parse', () => {
  it('no parse errors', () => {
    const text = 'before {{#when::keep::A::is::1}}content{{/}} after';
    const { errors } = parse(text);
    expect(errors.length).toBe(0);
  });

  it('one top-level block', () => {
    const text = 'before {{#when::keep::A::is::1}}content{{/}} after';
    const { blocks } = parse(text);
    expect(blocks.length).toBe(1);
  });

  it('no children', () => {
    const text = 'before {{#when::keep::A::is::1}}content{{/}} after';
    const { blocks } = parse(text);
    expect(blocks[0].children.length).toBe(0);
  });

  it('nested no errors', () => {
    const text = '{{#when::keep::A::is::1}}outer {{#when::keep::B::is::1}}inner{{/}} rest{{/}}';
    const { errors } = parse(text);
    expect(errors.length).toBe(0);
  });

  it('one top-level (nested)', () => {
    const text = '{{#when::keep::A::is::1}}outer {{#when::keep::B::is::1}}inner{{/}} rest{{/}}';
    const { blocks } = parse(text);
    expect(blocks.length).toBe(1);
  });

  it('one child (nested)', () => {
    const text = '{{#when::keep::A::is::1}}outer {{#when::keep::B::is::1}}inner{{/}} rest{{/}}';
    const { blocks } = parse(text);
    expect(blocks[0].children.length).toBe(1);
  });

  it('unmatched close detected', () => {
    const text = 'hello {{/}} world';
    const { errors } = parse(text);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('unclosed open implicitly closed (no error)', () => {
    const text = '{{#when::keep::A::is::1}}no close tag';
    const { errors } = parse(text);
    expect(errors.length).toBe(0);
  });

  it('unclosed open implicitly closed (block created)', () => {
    const text = '{{#when::keep::A::is::1}}no close tag';
    const { blocks } = parse(text);
    expect(blocks.length).toBe(1);
  });
});

// ── extractToggles ──

describe('extractToggles', () => {
  it('found toggle_A', () => {
    const text = '{{getglobalvar::toggle_A}} and {{getglobalvar::toggle_B}}';
    const toggles = extractToggles(text);
    expect(toggles.has('toggle_A')).toBe(true);
  });

  it('found toggle_B', () => {
    const text = '{{getglobalvar::toggle_A}} and {{getglobalvar::toggle_B}}';
    const toggles = extractToggles(text);
    expect(toggles.has('toggle_B')).toBe(true);
  });

  it('exactly 2 toggles', () => {
    const text = '{{getglobalvar::toggle_A}} and {{getglobalvar::toggle_B}}';
    const toggles = extractToggles(text);
    expect(toggles.size).toBe(2);
  });

  it('extractToggles finds myVar via tis', () => {
    const text = '{{#when::myVar::tis::2}} {{#when::toggle::myToggle}}';
    const toggles = extractToggles(text);
    expect(toggles.has('toggle_myVar')).toBe(true);
  });

  it('extractToggles finds myToggle via toggle', () => {
    const text = '{{#when::myVar::tis::2}} {{#when::toggle::myToggle}}';
    const toggles = extractToggles(text);
    expect(toggles.has('toggle_myToggle')).toBe(true);
  });

  it('extractToggleValues finds tis:2', () => {
    const text = '{{#when::myVar::tis::2}}';
    const vals = extractToggleValues(text, 'toggle_myVar');
    expect(vals.has('is:2')).toBe(true);
  });
});

// ── resolve (integration) ──

describe('resolve', () => {
  it('toggle A=1 → content visible', () => {
    const text = 'before {{#when::keep::{{getglobalvar::toggle_A}}::is::1}}VISIBLE{{/}} after';
    const { blocks } = parse(text);
    const on = resolve(text, blocks, { toggle_A: '1' });
    expect(on).toContain('VISIBLE');
  });

  it('no raw tags in output', () => {
    const text = 'before {{#when::keep::{{getglobalvar::toggle_A}}::is::1}}VISIBLE{{/}} after';
    const { blocks } = parse(text);
    const on = resolve(text, blocks, { toggle_A: '1' });
    expect(on).not.toContain('{{#when');
  });

  it('toggle A=0 → content hidden', () => {
    const text = 'before {{#when::keep::{{getglobalvar::toggle_A}}::is::1}}VISIBLE{{/}} after';
    const { blocks } = parse(text);
    const off = resolve(text, blocks, { toggle_A: '0' });
    expect(off).not.toContain('VISIBLE');
  });

  it('clean removal', () => {
    const text = 'before {{#when::keep::{{getglobalvar::toggle_A}}::is::1}}VISIBLE{{/}} after';
    const { blocks } = parse(text);
    const off = resolve(text, blocks, { toggle_A: '0' });
    expect(off).toBe('before  after');
  });

  it('isnot: value matches → hidden', () => {
    const text = 'X{{#when::keep::{{getglobalvar::toggle_A}}::isnot::1}}SHOWN{{/}}Y';
    const { blocks } = parse(text);
    const on = resolve(text, blocks, { toggle_A: '1' });
    expect(on).toBe('XY');
  });

  it('isnot: value differs → shown', () => {
    const text = 'X{{#when::keep::{{getglobalvar::toggle_A}}::isnot::1}}SHOWN{{/}}Y';
    const { blocks } = parse(text);
    const off = resolve(text, blocks, { toggle_A: '0' });
    expect(off).toBe('XSHOWNY');
  });

  it('nested: both on', () => {
    const text =
      '{{#when::keep::{{getglobalvar::toggle_A}}::is::1}}A-{{#when::keep::{{getglobalvar::toggle_B}}::is::1}}B{{/}}-A{{/}}';
    const { blocks } = parse(text);
    expect(resolve(text, blocks, { toggle_A: '1', toggle_B: '1' })).toBe('A-B-A');
  });

  it('nested: outer on, inner off', () => {
    const text =
      '{{#when::keep::{{getglobalvar::toggle_A}}::is::1}}A-{{#when::keep::{{getglobalvar::toggle_B}}::is::1}}B{{/}}-A{{/}}';
    const { blocks } = parse(text);
    expect(resolve(text, blocks, { toggle_A: '1', toggle_B: '0' })).toBe('A--A');
  });

  it('nested: outer off', () => {
    const text =
      '{{#when::keep::{{getglobalvar::toggle_A}}::is::1}}A-{{#when::keep::{{getglobalvar::toggle_B}}::is::1}}B{{/}}-A{{/}}';
    const { blocks } = parse(text);
    expect(resolve(text, blocks, { toggle_A: '0', toggle_B: '1' })).toBe('');
  });

  it('sequential: first on', () => {
    const text =
      '{{#when::keep::{{getglobalvar::toggle_A}}::is::1}}AAA{{/}}{{#when::keep::{{getglobalvar::toggle_B}}::is::1}}BBB{{/}}';
    const { blocks } = parse(text);
    expect(resolve(text, blocks, { toggle_A: '1', toggle_B: '0' })).toBe('AAA');
  });

  it('sequential: second on', () => {
    const text =
      '{{#when::keep::{{getglobalvar::toggle_A}}::is::1}}AAA{{/}}{{#when::keep::{{getglobalvar::toggle_B}}::is::1}}BBB{{/}}';
    const { blocks } = parse(text);
    expect(resolve(text, blocks, { toggle_A: '0', toggle_B: '1' })).toBe('BBB');
  });

  it('sequential: both on', () => {
    const text =
      '{{#when::keep::{{getglobalvar::toggle_A}}::is::1}}AAA{{/}}{{#when::keep::{{getglobalvar::toggle_B}}::is::1}}BBB{{/}}';
    const { blocks } = parse(text);
    expect(resolve(text, blocks, { toggle_A: '1', toggle_B: '1' })).toBe('AAABBB');
  });

  it('isnot wrapper: no parse errors', () => {
    const text =
      '{{#when::keep::{{getglobalvar::toggle_Narration}}::isnot::3}}Content here{{#when::keep::{{getglobalvar::toggle_GeminiStyle}}::is::1}}Gemini block{{/}}{{/}}';
    const { errors } = parse(text);
    expect(errors.length).toBe(0);
  });

  it('isnot wrapper: one top block', () => {
    const text =
      '{{#when::keep::{{getglobalvar::toggle_Narration}}::isnot::3}}Content here{{#when::keep::{{getglobalvar::toggle_GeminiStyle}}::is::1}}Gemini block{{/}}{{/}}';
    const { blocks } = parse(text);
    expect(blocks.length).toBe(1);
  });

  it('isnot wrapper: Narration≠3 & Gemini=1 → Gemini visible', () => {
    const text =
      '{{#when::keep::{{getglobalvar::toggle_Narration}}::isnot::3}}Content here{{#when::keep::{{getglobalvar::toggle_GeminiStyle}}::is::1}}Gemini block{{/}}{{/}}';
    const { blocks } = parse(text);
    const r = resolve(text, blocks, { toggle_Narration: '0', toggle_GeminiStyle: '1' });
    expect(r).toContain('Gemini block');
  });

  it('isnot wrapper: Narration=3 → all hidden', () => {
    const text =
      '{{#when::keep::{{getglobalvar::toggle_Narration}}::isnot::3}}Content here{{#when::keep::{{getglobalvar::toggle_GeminiStyle}}::is::1}}Gemini block{{/}}{{/}}';
    const { blocks } = parse(text);
    const r = resolve(text, blocks, { toggle_Narration: '3', toggle_GeminiStyle: '1' });
    expect(r).toBe('');
  });

  it('Else branch resolution (Truthy condition)', () => {
    const text = '{{#when::keep::1::is::1}}yes{{:else}}no{{/when}}';
    const { blocks } = parse(text);
    expect(resolve(text, blocks, {})).toBe('yes');
  });

  it('Else branch resolution (Falsy condition)', () => {
    const text = '{{#when::keep::0::is::1}}yes{{:else}}no{{/when}}';
    const { blocks } = parse(text);
    expect(resolve(text, blocks, {})).toBe('no');
  });

  it('Whitespace trimmed when not keep mode', () => {
    const text = '{{#when::1::is::1}}\n  content  \n{{/when}}';
    const { blocks } = parse(text);
    expect(resolve(text, blocks, {})).toBe('  content  ');
  });
});

// ── validateNesting ──

describe('validateNesting', () => {
  it('balanced nesting is valid', () => {
    const text = '{{#when::keep::A::is::1}}ok{{/}}';
    const result = validateNesting(text);
    expect(result.valid).toBe(true);
  });

  it('one open', () => {
    const text = '{{#when::keep::A::is::1}}ok{{/}}';
    const result = validateNesting(text);
    expect(result.openCount).toBe(1);
  });

  it('one close', () => {
    const text = '{{#when::keep::A::is::1}}ok{{/}}';
    const result = validateNesting(text);
    expect(result.closeCount).toBe(1);
  });

  it('unclosed is implicitly closed', () => {
    const text = '{{#when::keep::A::is::1}}no close';
    const result = validateNesting(text);
    expect(result.valid).toBe(true);
  });

  it('one open (unclosed)', () => {
    const text = '{{#when::keep::A::is::1}}no close';
    const result = validateNesting(text);
    expect(result.openCount).toBe(1);
  });

  it('one implicit close counts', () => {
    const text = '{{#when::keep::A::is::1}}no close';
    const result = validateNesting(text);
    expect(result.closeCount).toBe(1);
  });
});

// ── generateCombinations ──

describe('generateCombinations', () => {
  it('2 toggles → 4 combos', () => {
    const combos = generateCombinations(['a', 'b']);
    expect(combos.length).toBe(4);
  });

  it('custom values: 3 combos', () => {
    const combos = generateCombinations(['a'], { a: ['0', '1', '2'] });
    expect(combos.length).toBe(3);
  });
});
