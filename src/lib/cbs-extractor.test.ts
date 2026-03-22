import { describe, it, expect } from 'vitest';
import { extractCBSEntries, filterByJPath } from './cbs-extractor';
import type { CBSEntry } from './cbs-extractor';

describe('extractCBSEntries', () => {
  it('TEST-001: Empty object returns 0 entries', () => {
    const input = JSON.parse('{}');
    const result = extractCBSEntries(input);
    expect(result).toEqual([]);
  });

  it('TEST-002: Object with no CBS strings returns 0 entries', () => {
    const input = JSON.parse('{"name": "test", "content": "hello world"}');
    const result = extractCBSEntries(input);
    expect(result).toEqual([]);
  });

  it('TEST-003: Object with CBS in a nested field captures path, text, and metadata', () => {
    const input = JSON.parse(
      '{"data": {"type": "authornote", "role": "system", "content": "{{#when::x==1}}hello{{/when}}"}}',
    );
    const result = extractCBSEntries(input);
    const expected: CBSEntry[] = [
      {
        path: 'data.content',
        text: '{{#when::x==1}}hello{{/when}}',
        meta: { type: 'authornote', role: 'system' },
      },
    ];
    expect(result).toEqual(expected);
  });

  it('TEST-004: Array of objects returns correct paths', () => {
    const input = JSON.parse('[{"text": "{{getglobalvar::x}}"}]');
    const result = extractCBSEntries(input);
    const expected: CBSEntry[] = [
      {
        path: '[0].text',
        text: '{{getglobalvar::x}}',
        meta: {},
      },
    ];
    expect(result).toEqual(expected);
  });
});

describe('filterByJPath', () => {
  it('TEST-005: JPath filtering with wildcard matches target paths', () => {
    const entries: CBSEntry[] = [
      { path: 'loreBook[0].content', text: '..', meta: {} },
      { path: 'promptTemplate[0].text', text: '..', meta: {} },
    ];
    const result = filterByJPath(entries, 'loreBook[*].content');
    const expected: CBSEntry[] = [{ path: 'loreBook[0].content', text: '..', meta: {} }];
    expect(result).toEqual(expected);
  });

  it('TEST-006: JPath filtering with double wildcard matches any depth', () => {
    const entries: CBSEntry[] = [
      { path: 'data.nested.loreBook[0].content', text: '..', meta: {} },
      { path: 'promptTemplate[0].text', text: '..', meta: {} },
    ];
    const result = filterByJPath(entries, '**.content');
    const expected: CBSEntry[] = [{ path: 'data.nested.loreBook[0].content', text: '..', meta: {} }];
    expect(result).toEqual(expected);
  });
});

describe('Edge Cases', () => {
  it('EDGE-001: JSON file contains empty object or array', () => {
    expect(extractCBSEntries([])).toEqual([]);
    expect(extractCBSEntries({})).toEqual([]);
  });

  it('EDGE-002: Deeply nested strings but no CBS', () => {
    const input = { a: { b: { c: [{ d: 'test' }] } } };
    expect(extractCBSEntries(input)).toEqual([]);
  });

  it('EDGE-003: Multiple string fields within same object', () => {
    const input = {
      obj: {
        field1: '{{#when::x}}y{{/when}}',
        field2: '{{getglobalvar::z}}',
        other: '123',
      },
    };
    const result = extractCBSEntries(input);
    const expected: CBSEntry[] = [
      { path: 'obj.field1', text: '{{#when::x}}y{{/when}}', meta: { other: '123' } },
      { path: 'obj.field2', text: '{{getglobalvar::z}}', meta: { other: '123' } },
    ];
    expect(result).toEqual(expected);
  });

  it('EDGE-004: Root is an array instead of object', () => {
    const input = ['{{#when}}test{{/when}}'];
    const result = extractCBSEntries(input);
    const expected: CBSEntry[] = [{ path: '[0]', text: '{{#when}}test{{/when}}', meta: {} }];
    expect(result).toEqual(expected);
  });
});
