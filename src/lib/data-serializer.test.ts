import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDataSerializer, serializeForRenderer, applyUpdates } from './data-serializer';

// Stub dependencies injected via initDataSerializer
const stubDeps = {
  stringifyTriggerScripts: vi.fn((ts: unknown) => JSON.stringify(ts)),
  normalizeTriggerScripts: vi.fn((ts: unknown) => (Array.isArray(ts) ? ts : [])),
  extractPrimaryLuaFromTriggerScripts: vi.fn(() => 'extracted-lua'),
  mergePrimaryLuaIntoTriggerScripts: vi.fn((_ts: unknown, lua: string) => [{ type: 'lua', code: lua }]),
};

beforeEach(() => {
  vi.clearAllMocks();
  initDataSerializer(stubDeps);
});

// ── serializeForRenderer ────────────────────────────────────────────────────

describe('serializeForRenderer', () => {
  it('returns the expected set of keys', () => {
    const data = {
      name: 'Test',
      description: 'desc',
      firstMessage: 'hello',
      triggerScripts: [],
      globalNote: 'note',
      css: '<style></style>',
      defaultVariables: '{}',
      lua: '',
      lorebook: [],
      regex: [],
    };
    const result = serializeForRenderer(data);
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining([
        '_fileType',
        'name',
        'description',
        'firstMessage',
        'triggerScripts',
        'alternateGreetings',
        'groupOnlyGreetings',
        'globalNote',
        'css',
        'defaultVariables',
        'lua',
        'lorebook',
        'regex',
        'moduleName',
      ]),
    );
  });

  it('defaults _fileType to "charx"', () => {
    const result = serializeForRenderer({});
    expect(result._fileType).toBe('charx');
  });

  it('passes triggerScripts through stringifyTriggerScripts', () => {
    const ts = [{ type: 'lua', code: 'x' }];
    serializeForRenderer({ triggerScripts: ts });
    expect(stubDeps.stringifyTriggerScripts).toHaveBeenCalledWith(ts);
  });

  it('defaults alternateGreetings and groupOnlyGreetings to empty arrays', () => {
    const result = serializeForRenderer({});
    expect(result.alternateGreetings).toEqual([]);
    expect(result.groupOnlyGreetings).toEqual([]);
  });

  it('strips unknown keys from the output', () => {
    const result = serializeForRenderer({ secret: 'hidden', name: 'ok' });
    expect(result).not.toHaveProperty('secret');
    expect(result.name).toBe('ok');
  });
});

// ── applyUpdates ────────────────────────────────────────────────────────────

describe('applyUpdates', () => {
  it('does nothing when fields is null/undefined', () => {
    const data = { name: 'orig' };
    applyUpdates(data, null);
    expect(data.name).toBe('orig');
  });

  it('updates allowed scalar fields', () => {
    const data: Record<string, unknown> = { name: 'old', description: 'old' };
    applyUpdates(data, { name: 'new', description: 'new' });
    expect(data.name).toBe('new');
    expect(data.description).toBe('new');
  });

  it('ignores unknown/disallowed fields', () => {
    const data: Record<string, unknown> = {};
    applyUpdates(data, { hackedField: 'bad' });
    expect(data).not.toHaveProperty('hackedField');
  });

  it('syncs lua when triggerScripts is updated', () => {
    const data: Record<string, unknown> = { triggerScripts: [], lua: '' };
    applyUpdates(data, { triggerScripts: [{ type: 'lua', code: 'abc' }] });
    expect(stubDeps.normalizeTriggerScripts).toHaveBeenCalled();
    expect(stubDeps.extractPrimaryLuaFromTriggerScripts).toHaveBeenCalled();
    expect(data.lua).toBe('extracted-lua');
  });

  it('syncs triggerScripts when lua is updated', () => {
    const data: Record<string, unknown> = { triggerScripts: [], lua: '' };
    applyUpdates(data, { lua: 'new-lua' });
    expect(data.lua).toBe('new-lua');
    expect(stubDeps.mergePrimaryLuaIntoTriggerScripts).toHaveBeenCalled();
  });

  it('wraps css with <style> tags if missing', () => {
    const data: Record<string, unknown> = { css: '' };
    applyUpdates(data, { css: '.foo { color: red; }' });
    expect(data.css as string).toContain('<style>');
    expect(data.css as string).toContain('</style>');
    expect(data.css as string).toContain('.foo { color: red; }');
  });

  it('does not double-wrap css that already has <style>', () => {
    const data: Record<string, unknown> = { css: '' };
    const styledCss = '<style>\n.bar { color: blue; }\n</style>';
    applyUpdates(data, { css: styledCss });
    expect(data.css).toBe(styledCss);
  });

  it('does not wrap empty css', () => {
    const data: Record<string, unknown> = { css: '' };
    applyUpdates(data, { css: '   ' });
    expect((data.css as string).trim()).toBe('');
  });
});
