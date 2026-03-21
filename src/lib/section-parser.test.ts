import { describe, it, expect } from 'vitest';
import {
  detectLuaSection,
  parseLuaSections,
  combineLuaSections,
  detectCssSectionInline,
  detectCssBlockOpen,
  detectCssBlockClose,
  parseCssSections,
  combineCssSections,
} from './section-parser';

// ── detectLuaSection ────────────────────────────────────────────────────────

describe('detectLuaSection', () => {
  it('returns the section name for a standard delimiter', () => {
    expect(detectLuaSection('-- ===== main =====')).toBe('main');
  });

  it('returns the name for long equal signs', () => {
    expect(detectLuaSection('-- ================== utils ==================')).toBe('utils');
  });

  it('returns empty string for a standalone separator (no name)', () => {
    expect(detectLuaSection('-- ==============================')).toBe('');
  });

  it('handles triple-hyphen prefix', () => {
    expect(detectLuaSection('--- ===== helpers =====')).toBe('helpers');
  });

  it('handles no-space variant', () => {
    expect(detectLuaSection('--======================================')).toBe('');
  });

  it('returns null for ordinary comments', () => {
    expect(detectLuaSection('-- this is a regular comment')).toBeNull();
  });

  it('returns null for lines without hyphens', () => {
    expect(detectLuaSection('local x = 1')).toBeNull();
  });

  it('returns null when total equal signs are fewer than 6', () => {
    // 2+2 = 4 total equals, below the threshold of 6
    expect(detectLuaSection('-- == x ==')).toBeNull();
  });
});

// ── parseLuaSections ────────────────────────────────────────────────────────

describe('parseLuaSections', () => {
  it('returns a single "main" section for empty input', () => {
    const result = parseLuaSections('');
    expect(result).toEqual([{ name: 'main', content: '' }]);
  });

  it('returns a single "main" section when there are no delimiters', () => {
    const code = 'local x = 1\nprint(x)';
    const result = parseLuaSections(code);
    expect(result).toEqual([{ name: 'main', content: code.trim() }]);
  });

  it('parses multiple inline-named sections', () => {
    const code = ['-- ===== alpha =====', 'local a = 1', '', '-- ===== beta =====', 'local b = 2'].join('\n');
    const result = parseLuaSections(code);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'alpha', content: 'local a = 1' });
    expect(result[1]).toEqual({ name: 'beta', content: 'local b = 2' });
  });

  it('handles a standalone separator followed by a comment name', () => {
    const code = ['-- ==============================', '-- mySection', 'return true'].join('\n');
    const result = parseLuaSections(code);
    expect(result[0].name).toBe('mySection');
    expect(result[0].content).toBe('return true');
  });

  it('handles whitespace-only input as empty', () => {
    const result = parseLuaSections('   \n  \n  ');
    expect(result).toEqual([{ name: 'main', content: '' }]);
  });

  it('skips redundant closing separator after inline name', () => {
    const code = ['-- ===== header =====', '-- ==============================', 'local h = true'].join('\n');
    const result = parseLuaSections(code);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('header');
    expect(result[0].content).toBe('local h = true');
  });
});

// ── combineLuaSections ──────────────────────────────────────────────────────

describe('combineLuaSections', () => {
  it('produces correct output for a single section', () => {
    const output = combineLuaSections([{ name: 'main', content: 'print("hi")' }]);
    expect(output).toBe('-- ===== main =====\nprint("hi")');
  });

  it('joins multiple sections with blank lines between', () => {
    const output = combineLuaSections([
      { name: 'a', content: '1' },
      { name: 'b', content: '2' },
    ]);
    expect(output).toBe('-- ===== a =====\n1\n\n-- ===== b =====\n2');
  });

  it('roundtrips through parse → combine preserving section names', () => {
    const code = ['-- ===== first =====', 'local x = 1', '', '-- ===== second =====', 'local y = 2'].join('\n');
    const sections = parseLuaSections(code);
    const combined = combineLuaSections(sections);
    const reparsed = parseLuaSections(combined);
    expect(reparsed.map((s) => s.name)).toEqual(['first', 'second']);
    expect(reparsed[0].content).toBe('local x = 1');
    expect(reparsed[1].content).toBe('local y = 2');
  });
});

// ── CSS inline / block detection helpers ────────────────────────────────────

describe('detectCssSectionInline', () => {
  it('detects a single-line CSS section header', () => {
    expect(detectCssSectionInline('/* ===== layout ===== */')).toBe('layout');
  });

  it('detects medium-length equals (10)', () => {
    expect(detectCssSectionInline('/* ========== theme ========== */')).toBe('theme');
  });

  it('returns null for ordinary comments', () => {
    expect(detectCssSectionInline('/* normal comment */')).toBeNull();
  });

  it('returns null for non-comment lines', () => {
    expect(detectCssSectionInline('.class { color: red; }')).toBeNull();
  });

  it('returns null for decorative comments with long equals (28+)', () => {
    expect(
      detectCssSectionInline('/* ============================ Section Title ============================ */'),
    ).toBeNull();
  });

  it('returns null for pure decorative separator without name', () => {
    expect(detectCssSectionInline('/* ======================================== */')).toBeNull();
  });
});

describe('detectCssBlockOpen', () => {
  it('returns true for a block-open line', () => {
    expect(detectCssBlockOpen('/* ============================================================')).toBe(true);
  });

  it('returns false for a self-closing comment', () => {
    expect(detectCssBlockOpen('/* ======= */')).toBe(false);
  });

  it('returns false for ordinary lines', () => {
    expect(detectCssBlockOpen('body { margin: 0; }')).toBe(false);
  });
});

describe('detectCssBlockClose', () => {
  it('returns true for a block-close line', () => {
    expect(detectCssBlockClose('   ============================================================ */')).toBe(true);
  });

  it('returns false for a block-open line', () => {
    expect(detectCssBlockClose('/* ============================================================')).toBe(false);
  });
});

// ── parseCssSections ────────────────────────────────────────────────────────

describe('parseCssSections', () => {
  it('returns a single "main" section for empty input', () => {
    const result = parseCssSections('');
    expect(result.sections).toEqual([{ name: 'main', content: '' }]);
  });

  it('parses multi-line block headers', () => {
    const css = [
      '/* ============================================================',
      '   colors',
      '   ============================================================ */',
      '.red { color: red; }',
      '',
      '/* ============================================================',
      '   layout',
      '   ============================================================ */',
      '.box { display: flex; }',
    ].join('\n');
    const result = parseCssSections(css);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].name).toBe('colors');
    expect(result.sections[0].content).toBe('.red { color: red; }');
    expect(result.sections[1].name).toBe('layout');
    expect(result.sections[1].content).toBe('.box { display: flex; }');
  });

  it('parses single-line inline headers', () => {
    const css = [
      '/* ===== fonts ===== */',
      'body { font-size: 16px; }',
      '/* ===== spacing ===== */',
      '.m1 { margin: 4px; }',
    ].join('\n');
    const result = parseCssSections(css);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].name).toBe('fonts');
    expect(result.sections[1].name).toBe('spacing');
  });

  it('strips <style> tags and stores them as prefix/suffix when sections exist', () => {
    const css = ['<style>', '/* ===== theme ===== */', '.a { color: red; }', '</style>'].join('\n');
    const result = parseCssSections(css);
    expect(result.prefix).toBe('<style>\n');
    expect(result.suffix).toBe('\n</style>');
    expect(result.sections[0].name).toBe('theme');
    expect(result.sections[0].content).toBe('.a { color: red; }');
  });

  it('returns empty prefix/suffix when there are no style tags', () => {
    const css = '.b { color: blue; }';
    const result = parseCssSections(css);
    expect(result.prefix).toBe('');
    expect(result.suffix).toBe('');
  });

  it('does not split on decorative comments with long equals', () => {
    const css = [
      '<style>',
      '/* ===== main ===== */',
      '.a { color: red; }',
      '/* ============================ decorative ============================ */',
      '.b { color: blue; }',
      '</style>',
    ].join('\n');
    const result = parseCssSections(css);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].name).toBe('main');
    expect(result.sections[0].content).toContain('.b { color: blue; }');
  });
});

// ── combineCssSections ──────────────────────────────────────────────────────

describe('combineCssSections', () => {
  it('wraps with default <style> tags when prefix/suffix are empty', () => {
    const output = combineCssSections([{ name: 'main', content: '.a{}' }], '', '');
    expect(output.startsWith('<style>\n')).toBe(true);
    expect(output.endsWith('\n</style>')).toBe(true);
  });

  it('uses provided prefix and suffix', () => {
    const output = combineCssSections([{ name: 'x', content: '.x{}' }], '<style scoped>\n', '\n</style>');
    expect(output.startsWith('<style scoped>\n')).toBe(true);
  });

  it('roundtrips parse → combine preserving section names and content', () => {
    const css = [
      '<style>',
      '/* ============================================================',
      '   alpha',
      '   ============================================================ */',
      '.a { color: red; }',
      '',
      '/* ============================================================',
      '   beta',
      '   ============================================================ */',
      '.b { color: blue; }',
      '</style>',
    ].join('\n');
    const { sections, prefix, suffix } = parseCssSections(css);
    const combined = combineCssSections(sections, prefix, suffix);
    const reparsed = parseCssSections(combined);
    expect(reparsed.sections.map((s) => s.name)).toEqual(['alpha', 'beta']);
  });
});
