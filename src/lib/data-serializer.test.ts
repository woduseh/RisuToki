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

  it('updates risum module-specific fields', () => {
    const data: Record<string, unknown> = { name: 'Test', _fileType: 'risum' };
    applyUpdates(data, {
      moduleName: 'New Module Name',
      moduleDescription: 'New desc',
      cjs: 'console.log("updated")',
      lowLevelAccess: true,
      hideIcon: false,
      backgroundEmbedding: 'bg text',
      moduleNamespace: 'ns',
      customModuleToggle: 'toggle',
      mcpUrl: 'http://localhost:3000',
    });
    expect(data.moduleName).toBe('New Module Name');
    expect(data.moduleDescription).toBe('New desc');
    expect(data.cjs).toBe('console.log("updated")');
    expect(data.lowLevelAccess).toBe(true);
    expect(data.hideIcon).toBe(false);
    expect(data.backgroundEmbedding).toBe('bg text');
    expect(data.moduleNamespace).toBe('ns');
    expect(data.customModuleToggle).toBe('toggle');
    expect(data.mcpUrl).toBe('http://localhost:3000');
  });

  it('does not reject risum fields on charx data (no-op safe)', () => {
    const data: Record<string, unknown> = { name: 'Test', _fileType: 'charx' };
    applyUpdates(data, { cjs: 'some code', lowLevelAccess: true });
    // Fields are set even on charx — this is safe since saveCharx writes them to module.risum
    expect(data.cjs).toBe('some code');
  });

  it('updates risup preset fields', () => {
    const data: Record<string, unknown> = { name: 'Test', _fileType: 'risup' };
    applyUpdates(data, {
      mainPrompt: 'You are helpful.',
      jailbreak: 'Stay in character.',
      temperature: 85,
      maxContext: 8000,
      maxResponse: 600,
      frequencyPenalty: 50,
      presencePenalty: 60,
      aiModel: 'gpt4',
      subModel: 'gpt-4-turbo',
      apiType: 'openai',
      promptPreprocess: true,
      promptTemplate: '[{"type":"plain"}]',
      presetBias: '[["hello",5]]',
      formatingOrder: '["main","jailbreak"]',
      presetImage: 'data:image/png;base64,abc',
    });
    expect(data.mainPrompt).toBe('You are helpful.');
    expect(data.jailbreak).toBe('Stay in character.');
    expect(data.temperature).toBe(85);
    expect(data.maxContext).toBe(8000);
    expect(data.maxResponse).toBe(600);
    expect(data.frequencyPenalty).toBe(50);
    expect(data.presencePenalty).toBe(60);
    expect(data.aiModel).toBe('gpt4');
    expect(data.subModel).toBe('gpt-4-turbo');
    expect(data.apiType).toBe('openai');
    expect(data.promptPreprocess).toBe(true);
    expect(data.promptTemplate).toBe('[{"type":"plain"}]');
    expect(data.presetBias).toBe('[["hello",5]]');
    expect(data.formatingOrder).toBe('["main","jailbreak"]');
    expect(data.presetImage).toBe('data:image/png;base64,abc');
  });
});

// ── serializeForRenderer risum support ──────────────────────────────────────

describe('serializeForRenderer risum support', () => {
  it('includes risum fields for risum file type', () => {
    const data = {
      _fileType: 'risum',
      name: 'Module',
      description: 'desc',
      moduleId: 'mod-123',
      moduleDescription: 'mod desc',
      cjs: 'console.log("x")',
      lowLevelAccess: true,
      hideIcon: false,
      backgroundEmbedding: 'bg',
      moduleNamespace: 'ns',
      customModuleToggle: 'toggle',
      mcpUrl: 'http://test',
    };
    const result = serializeForRenderer(data);
    expect(result._fileType).toBe('risum');
    expect(result.moduleId).toBe('mod-123');
    expect(result.cjs).toBe('console.log("x")');
    expect(result.lowLevelAccess).toBe(true);
    expect(result.hideIcon).toBe(false);
    expect(result.backgroundEmbedding).toBe('bg');
    expect(result.moduleNamespace).toBe('ns');
    expect(result.mcpUrl).toBe('http://test');
  });

  it('omits risum fields for charx file type', () => {
    const data = {
      _fileType: 'charx',
      name: 'Character',
    };
    const result = serializeForRenderer(data);
    expect(result).not.toHaveProperty('cjs');
    expect(result).not.toHaveProperty('lowLevelAccess');
    expect(result).not.toHaveProperty('moduleNamespace');
  });
});

// ── serializeForRenderer risup support ─────────────────────────────────────

describe('serializeForRenderer risup support', () => {
  it('includes risup preset fields for risup file type', () => {
    const data = {
      _fileType: 'risup',
      name: 'Preset',
      mainPrompt: 'You are helpful.',
      jailbreak: 'Stay in character.',
      temperature: 85,
      maxContext: 8000,
      maxResponse: 600,
      frequencyPenalty: 50,
      presencePenalty: 60,
      aiModel: 'gpt4',
      subModel: 'gpt-4-turbo',
      apiType: 'openai',
      promptPreprocess: true,
      promptTemplate: '[{"type":"plain"}]',
      presetBias: '[["hello",5]]',
      formatingOrder: '["main","jailbreak"]',
      presetImage: 'data:image/png;base64,abc',
    };
    const result = serializeForRenderer(data);
    expect(result._fileType).toBe('risup');
    expect(result.mainPrompt).toBe('You are helpful.');
    expect(result.jailbreak).toBe('Stay in character.');
    expect(result.temperature).toBe(85);
    expect(result.maxContext).toBe(8000);
    expect(result.maxResponse).toBe(600);
    expect(result.frequencyPenalty).toBe(50);
    expect(result.presencePenalty).toBe(60);
    expect(result.aiModel).toBe('gpt4');
    expect(result.subModel).toBe('gpt-4-turbo');
    expect(result.apiType).toBe('openai');
    expect(result.promptPreprocess).toBe(true);
    expect(result.promptTemplate).toBe('[{"type":"plain"}]');
    expect(result.presetBias).toBe('[["hello",5]]');
    expect(result.formatingOrder).toBe('["main","jailbreak"]');
    expect(result.presetImage).toBe('data:image/png;base64,abc');
  });

  it('omits risup fields for charx file type', () => {
    const data = {
      _fileType: 'charx',
      name: 'Character',
    };
    const result = serializeForRenderer(data);
    expect(result).not.toHaveProperty('mainPrompt');
    expect(result).not.toHaveProperty('temperature');
    expect(result).not.toHaveProperty('promptTemplate');
  });
});
