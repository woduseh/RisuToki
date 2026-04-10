import { describe, it, expect } from 'vitest';
import { cloneJson, cloneRecord, isRecord, extToMime, MIME_MAP, normalizeLF } from './shared-utils';

// ---------------------------------------------------------------------------
// isRecord
// ---------------------------------------------------------------------------

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
  });

  it('returns false for primitives and null', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord('hello')).toBe(false);
    expect(isRecord(true)).toBe(false);
  });

  it('returns false for non-plain objects (Date, RegExp, Map, etc.)', () => {
    expect(isRecord(new Date())).toBe(false);
    expect(isRecord(/abc/)).toBe(false);
    expect(isRecord(new Map())).toBe(false);
    expect(isRecord(new Set())).toBe(false);
  });

  it('returns true for null-prototype objects', () => {
    expect(isRecord(Object.create(null))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cloneJson
// ---------------------------------------------------------------------------

describe('cloneJson', () => {
  it('deep-clones a plain object', () => {
    const original = { a: 1, b: { c: 2 } };
    const cloned = cloneJson(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.b).not.toBe(original.b);
  });

  it('deep-clones an array', () => {
    const original = [{ x: 1 }, { x: 2 }];
    const cloned = cloneJson(original);
    expect(cloned).toEqual(original);
    expect(cloned[0]).not.toBe(original[0]);
  });

  it('passes through undefined without error', () => {
    expect(cloneJson(undefined)).toBeUndefined();
  });

  it('handles null', () => {
    expect(cloneJson(null)).toBeNull();
  });

  it('handles primitive values', () => {
    expect(cloneJson(42)).toBe(42);
    expect(cloneJson('hello')).toBe('hello');
    expect(cloneJson(true)).toBe(true);
  });

  it('strips undefined properties (JSON semantics)', () => {
    const original = { a: 1, b: undefined };
    const cloned = cloneJson(original);
    expect(cloned).toEqual({ a: 1 });
    expect('b' in cloned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cloneRecord
// ---------------------------------------------------------------------------

describe('cloneRecord', () => {
  it('deep-clones a record', () => {
    const original = { a: 1, nested: { b: 2 } };
    const cloned = cloneRecord(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.nested).not.toBe(original.nested);
  });

  it('returns empty object for non-record inputs', () => {
    expect(cloneRecord(null)).toEqual({});
    expect(cloneRecord(undefined)).toEqual({});
    expect(cloneRecord(42)).toEqual({});
    expect(cloneRecord([1, 2])).toEqual({});
    expect(cloneRecord('hello')).toEqual({});
  });

  it('returns empty object for non-plain objects (Date, RegExp, Map)', () => {
    expect(cloneRecord(new Date())).toEqual({});
    expect(cloneRecord(/abc/)).toEqual({});
    expect(cloneRecord(new Map([['a', 1]]))).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// MIME_MAP & extToMime
// ---------------------------------------------------------------------------

describe('extToMime', () => {
  it('resolves common image extensions', () => {
    expect(extToMime('png')).toBe('image/png');
    expect(extToMime('jpg')).toBe('image/jpeg');
    expect(extToMime('jpeg')).toBe('image/jpeg');
    expect(extToMime('webp')).toBe('image/webp');
    expect(extToMime('gif')).toBe('image/gif');
    expect(extToMime('svg')).toBe('image/svg+xml');
    expect(extToMime('avif')).toBe('image/avif');
  });

  it('resolves audio extensions', () => {
    expect(extToMime('mp3')).toBe('audio/mpeg');
    expect(extToMime('ogg')).toBe('audio/ogg');
    expect(extToMime('wav')).toBe('audio/wav');
    expect(extToMime('flac')).toBe('audio/flac');
    expect(extToMime('m4a')).toBe('audio/mp4');
    expect(extToMime('aac')).toBe('audio/aac');
  });

  it('resolves video extensions', () => {
    expect(extToMime('mp4')).toBe('video/mp4');
    expect(extToMime('webm')).toBe('video/webm');
    expect(extToMime('mov')).toBe('video/quicktime');
  });

  it('resolves font extensions', () => {
    expect(extToMime('woff')).toBe('font/woff');
    expect(extToMime('woff2')).toBe('font/woff2');
    expect(extToMime('ttf')).toBe('font/ttf');
    expect(extToMime('otf')).toBe('font/otf');
  });

  it('resolves css', () => {
    expect(extToMime('css')).toBe('text/css');
  });

  it('is case-insensitive', () => {
    expect(extToMime('PNG')).toBe('image/png');
    expect(extToMime('Jpg')).toBe('image/jpeg');
    expect(extToMime('WEBP')).toBe('image/webp');
  });

  it('returns octet-stream for unknown extensions', () => {
    expect(extToMime('xyz')).toBe('application/octet-stream');
    expect(extToMime('')).toBe('application/octet-stream');
  });

  it('MIME_MAP is frozen / read-only at runtime', () => {
    expect(Object.isFrozen(MIME_MAP)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeLF
// ---------------------------------------------------------------------------

describe('normalizeLF', () => {
  it('converts CRLF to LF', () => {
    expect(normalizeLF('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('converts bare CR to LF', () => {
    expect(normalizeLF('a\rb\rc')).toBe('a\nb\nc');
  });

  it('handles mixed CRLF and bare CR', () => {
    expect(normalizeLF('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('passes through LF-only strings unchanged', () => {
    const s = 'a\nb\nc';
    expect(normalizeLF(s)).toBe(s);
  });

  it('passes through strings with no newlines', () => {
    expect(normalizeLF('hello')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(normalizeLF('')).toBe('');
  });
});
