import { describe, it, expect } from 'vitest';
import { parseLorebookDecorators } from './lorebook-decorators';

describe('parseLorebookDecorators', () => {
  // ── basic structure ──────────────────────────────────────────

  it('returns empty decorators and full body for plain content', () => {
    const result = parseLorebookDecorators('Hello world\nLine two');
    expect(result.decorators).toEqual({});
    expect(result.body).toBe('Hello world\nLine two');
    expect(result.warnings).toEqual([]);
  });

  it('returns empty decorators for empty content', () => {
    const result = parseLorebookDecorators('');
    expect(result.decorators).toEqual({});
    expect(result.body).toBe('');
    expect(result.warnings).toEqual([]);
  });

  it('never mutates the original string', () => {
    const original = '@@depth 3\nBody text';
    const frozen = original; // strings are immutable, but verify no side effects
    parseLorebookDecorators(original);
    expect(original).toBe(frozen);
  });

  // ── @@depth ──────────────────────────────────────────────────

  it('parses @@depth with integer value', () => {
    const result = parseLorebookDecorators('@@depth 4\nBody');
    expect(result.decorators.depth).toBe(4);
    expect(result.body).toBe('Body');
  });

  it('parses @@depth 0', () => {
    const result = parseLorebookDecorators('@@depth 0\nBody');
    expect(result.decorators.depth).toBe(0);
  });

  // ── @@position ───────────────────────────────────────────────

  it('parses @@position with string value', () => {
    const result = parseLorebookDecorators('@@position personality\nBody');
    expect(result.decorators.position).toBe('personality');
    expect(result.body).toBe('Body');
  });

  it('parses @@position with pt_ prefix', () => {
    const result = parseLorebookDecorators('@@position pt_after_desc\nBody');
    expect(result.decorators.position).toBe('pt_after_desc');
  });

  // ── @@role ───────────────────────────────────────────────────

  it('parses @@role user', () => {
    const result = parseLorebookDecorators('@@role user\nBody');
    expect(result.decorators.role).toBe('user');
  });

  it('parses @@role assistant', () => {
    const result = parseLorebookDecorators('@@role assistant\nBody');
    expect(result.decorators.role).toBe('assistant');
  });

  it('parses @@role system', () => {
    const result = parseLorebookDecorators('@@role system\nBody');
    expect(result.decorators.role).toBe('system');
  });

  it('warns on invalid @@role value', () => {
    const result = parseLorebookDecorators('@@role admin\nBody');
    expect(result.decorators.role).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('role');
  });

  it('accepts case-insensitive @@role values', () => {
    const result = parseLorebookDecorators('@@role User\nBody');
    expect(result.decorators.role).toBe('user');
    expect(result.warnings).toEqual([]);
  });

  // ── @@scan_depth ─────────────────────────────────────────────

  it('parses @@scan_depth with integer value', () => {
    const result = parseLorebookDecorators('@@scan_depth 10\nBody');
    expect(result.decorators.scanDepth).toBe(10);
  });

  // ── @@probability ────────────────────────────────────────────

  it('parses @@probability with valid value', () => {
    const result = parseLorebookDecorators('@@probability 70\nBody');
    expect(result.decorators.probability).toBe(70);
  });

  it('clamps @@probability to 0 when negative', () => {
    const result = parseLorebookDecorators('@@probability -5\nBody');
    expect(result.decorators.probability).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('clamps @@probability to 100 when over 100', () => {
    const result = parseLorebookDecorators('@@probability 150\nBody');
    expect(result.decorators.probability).toBe(100);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('parses @@probability 0', () => {
    const result = parseLorebookDecorators('@@probability 0\nBody');
    expect(result.decorators.probability).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('parses @@probability 100', () => {
    const result = parseLorebookDecorators('@@probability 100\nBody');
    expect(result.decorators.probability).toBe(100);
    expect(result.warnings).toEqual([]);
  });

  // ── @@activate / @@dont_activate ─────────────────────────────

  it('parses @@activate flag', () => {
    const result = parseLorebookDecorators('@@activate\nBody');
    expect(result.decorators.activate).toBe(true);
  });

  it('parses @@dont_activate flag', () => {
    const result = parseLorebookDecorators('@@dont_activate\nBody');
    expect(result.decorators.dontActivate).toBe(true);
  });

  // ── @@match_full_word ────────────────────────────────────────

  it('parses @@match_full_word flag', () => {
    const result = parseLorebookDecorators('@@match_full_word\nBody');
    expect(result.decorators.matchFullWord).toBe(true);
  });

  // ── @@additional_keys ────────────────────────────────────────

  it('parses @@additional_keys comma-separated list', () => {
    const result = parseLorebookDecorators('@@additional_keys magic,spell,rune\nBody');
    expect(result.decorators.additionalKeys).toEqual(['magic', 'spell', 'rune']);
  });

  it('trims whitespace from @@additional_keys values', () => {
    const result = parseLorebookDecorators('@@additional_keys magic , spell , rune\nBody');
    expect(result.decorators.additionalKeys).toEqual(['magic', 'spell', 'rune']);
  });

  it('filters empty entries from @@additional_keys', () => {
    const result = parseLorebookDecorators('@@additional_keys magic,,spell\nBody');
    expect(result.decorators.additionalKeys).toEqual(['magic', 'spell']);
  });

  // ── @@exclude_keys ───────────────────────────────────────────

  it('parses @@exclude_keys comma-separated list', () => {
    const result = parseLorebookDecorators('@@exclude_keys safe,peaceful\nBody');
    expect(result.decorators.excludeKeys).toEqual(['safe', 'peaceful']);
  });

  it('trims whitespace from @@exclude_keys values', () => {
    const result = parseLorebookDecorators('@@exclude_keys safe , peaceful\nBody');
    expect(result.decorators.excludeKeys).toEqual(['safe', 'peaceful']);
  });

  // ── shorthand aliases ────────────────────────────────────────

  it('parses @@@system as role=system + depth=4', () => {
    const result = parseLorebookDecorators('@@@system\nBody');
    expect(result.decorators.role).toBe('system');
    expect(result.decorators.depth).toBe(4);
  });

  it('parses @@@user as role=user + depth=4', () => {
    const result = parseLorebookDecorators('@@@user\nBody');
    expect(result.decorators.role).toBe('user');
    expect(result.decorators.depth).toBe(4);
  });

  it('parses @@@assistant as role=assistant + depth=4', () => {
    const result = parseLorebookDecorators('@@@assistant\nBody');
    expect(result.decorators.role).toBe('assistant');
    expect(result.decorators.depth).toBe(4);
  });

  it('parses @@@end as position=end', () => {
    const result = parseLorebookDecorators('@@@end\nBody');
    expect(result.decorators.position).toBe('end');
    expect(result.decorators.depth).toBeUndefined();
  });

  it('parses stacked @@@assistant + @@@end as role=assistant + position=end', () => {
    const result = parseLorebookDecorators('@@@assistant\n@@@end\nBody');
    expect(result.decorators.role).toBe('assistant');
    expect(result.decorators.position).toBe('end');
    expect(result.decorators.depth).toBe(4);
    expect(result.body).toBe('Body');
  });

  // ── multiple decorators ──────────────────────────────────────

  it('parses multiple decorators from leading lines', () => {
    const content = '@@depth 2\n@@role user\n@@probability 50\nBody text here';
    const result = parseLorebookDecorators(content);
    expect(result.decorators.depth).toBe(2);
    expect(result.decorators.role).toBe('user');
    expect(result.decorators.probability).toBe(50);
    expect(result.body).toBe('Body text here');
  });

  it('shorthand alias followed by explicit decorator', () => {
    const content = '@@@system\n@@probability 80\nBody';
    const result = parseLorebookDecorators(content);
    expect(result.decorators.role).toBe('system');
    expect(result.decorators.depth).toBe(4);
    expect(result.decorators.probability).toBe(80);
    expect(result.body).toBe('Body');
  });

  it('explicit @@depth overrides shorthand default depth', () => {
    const content = '@@@system\n@@depth 2\nBody';
    const result = parseLorebookDecorators(content);
    expect(result.decorators.role).toBe('system');
    expect(result.decorators.depth).toBe(2);
  });

  // ── leading-only parsing ─────────────────────────────────────

  it('stops parsing at first non-decorator line', () => {
    const content = '@@depth 3\nBody text\n@@role user';
    const result = parseLorebookDecorators(content);
    expect(result.decorators.depth).toBe(3);
    expect(result.decorators.role).toBeUndefined();
    expect(result.body).toBe('Body text\n@@role user');
  });

  it('treats blank lines between decorators as end of decorator block', () => {
    const content = '@@depth 3\n\n@@role user\nBody';
    const result = parseLorebookDecorators(content);
    expect(result.decorators.depth).toBe(3);
    expect(result.decorators.role).toBeUndefined();
    expect(result.body).toBe('\n@@role user\nBody');
  });

  // ── unsupported decorators ───────────────────────────────────

  it('ignores unsupported @@decorators and excludes them from metadata', () => {
    const content = '@@depth 3\n@@activate_only_after 5\nBody';
    const result = parseLorebookDecorators(content);
    expect(result.decorators.depth).toBe(3);
    expect(result.body).toBe('Body');
    // unsupported decorator should not appear in decorators object
    expect('activate_only_after' in result.decorators).toBe(false);
    expect((result.decorators as Record<string, unknown>)['activateOnlyAfter']).toBeUndefined();
  });

  it('skips unsupported decorators but continues parsing subsequent supported ones', () => {
    const content = '@@depth 3\n@@is_greeting 2\n@@role user\nBody';
    const result = parseLorebookDecorators(content);
    expect(result.decorators.depth).toBe(3);
    expect(result.decorators.role).toBe('user');
    expect(result.body).toBe('Body');
  });

  // ── malformed decorators ─────────────────────────────────────

  it('warns on @@depth without a value', () => {
    const result = parseLorebookDecorators('@@depth\nBody');
    expect(result.decorators.depth).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('warns on @@depth with non-numeric value', () => {
    const result = parseLorebookDecorators('@@depth abc\nBody');
    expect(result.decorators.depth).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('warns on @@scan_depth with non-numeric value', () => {
    const result = parseLorebookDecorators('@@scan_depth xyz\nBody');
    expect(result.decorators.scanDepth).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('clamps negative @@scan_depth to 0 with a warning', () => {
    const result = parseLorebookDecorators('@@scan_depth -3\nBody');
    expect(result.decorators.scanDepth).toBe(0);
    expect(result.warnings).toContain('@@scan_depth: value -3 clamped to 0');
  });

  it('warns on @@probability with non-numeric value', () => {
    const result = parseLorebookDecorators('@@probability high\nBody');
    expect(result.decorators.probability).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // ── edge cases ───────────────────────────────────────────────

  it('handles content that is only decorators (no body)', () => {
    const result = parseLorebookDecorators('@@depth 3\n@@role user');
    expect(result.decorators.depth).toBe(3);
    expect(result.decorators.role).toBe('user');
    expect(result.body).toBe('');
  });

  it('handles \\r\\n line endings', () => {
    const result = parseLorebookDecorators('@@depth 3\r\n@@role user\r\nBody');
    expect(result.decorators.depth).toBe(3);
    expect(result.decorators.role).toBe('user');
    expect(result.body).toBe('Body');
  });

  it('preserves body content exactly (including internal whitespace)', () => {
    const content = '@@depth 1\n  indented body\n\n  more indented';
    const result = parseLorebookDecorators(content);
    expect(result.body).toBe('  indented body\n\n  more indented');
  });

  it('handles decorator with extra whitespace around value', () => {
    const result = parseLorebookDecorators('@@depth   5  \nBody');
    expect(result.decorators.depth).toBe(5);
  });

  it('last decorator wins when duplicated', () => {
    const content = '@@depth 3\n@@depth 7\nBody';
    const result = parseLorebookDecorators(content);
    expect(result.decorators.depth).toBe(7);
  });

  it('returns fresh objects on each call', () => {
    const a = parseLorebookDecorators('@@depth 3\nBody');
    const b = parseLorebookDecorators('@@depth 3\nBody');
    expect(a.decorators).not.toBe(b.decorators);
    expect(a.warnings).not.toBe(b.warnings);
  });
});
