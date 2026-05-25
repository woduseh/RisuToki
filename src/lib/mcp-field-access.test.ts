import { describe, expect, it, vi } from 'vitest';

import {
  ARRAY_FIELD_NAMES,
  BOOLEAN_FIELD_NAMES,
  CHARX_DEPRECATED_FIELD_NAMES,
  CHARX_FIELD_NAMES,
  CHARX_READ_ONLY_FIELD_NAMES,
  CORE_FIELD_NAMES,
  FIELD_RESERVED_PATHS,
  MAX_FIELD_BATCH,
  NUMBER_FIELD_NAMES,
  RISUM_FIELD_NAMES,
  RISUM_READ_ONLY_FIELD_NAMES,
  RISUM_RESERVED_FIELD_NAMES,
  RISUP_FIELD_NAMES,
  RISUP_LEGACY_FIELD_NAMES,
  STRING_MUTATION_FIELD_NAMES,
  STRING_MUTATION_READ_ONLY_FIELD_NAMES,
  SUPPORTED_EXTERNAL_FILE_TYPES,
  buildFieldBatchReadResults,
  buildFieldReadResponsePayload,
  collectHiddenFieldWarnings,
  getDocumentTypeFlags,
  getFieldAccessRules,
  getHiddenFieldInfo,
  getStringMutationFieldStatus,
  getUnknownFieldHint,
  isHiddenField,
  redactHiddenFields,
} from './mcp-field-access';

describe('field access constants', () => {
  it('keeps core and document-specific field lists non-empty', () => {
    expect(CORE_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(CHARX_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(CHARX_READ_ONLY_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(CHARX_DEPRECATED_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(RISUM_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(RISUM_READ_ONLY_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(RISUM_RESERVED_FIELD_NAMES).toEqual(['cjs']);
    expect(RISUP_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(RISUP_LEGACY_FIELD_NAMES).toEqual([
      'mainPrompt',
      'jailbreak',
      'globalNote',
      'useInstructPrompt',
      'instructChatTemplate',
      'JinjaTemplate',
    ]);
    expect(ARRAY_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(BOOLEAN_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(NUMBER_FIELD_NAMES.length).toBeGreaterThan(0);
  });

  it('exposes reserved field routes and supported external file types', () => {
    expect(FIELD_RESERVED_PATHS).toEqual(['batch', 'batch-write', 'export']);
    expect(MAX_FIELD_BATCH).toBe(20);
    expect([...SUPPORTED_EXTERNAL_FILE_TYPES]).toEqual(['charx', 'risum', 'risup']);
  });
});

describe('getDocumentTypeFlags', () => {
  it('defaults to charx when _fileType is missing', () => {
    expect(getDocumentTypeFlags({ name: 'Card' })).toEqual({
      fileType: 'charx',
      isCharx: true,
      isRisum: false,
      isRisup: false,
    });
  });

  it('detects risum and risup documents', () => {
    expect(getDocumentTypeFlags({ _fileType: 'risum' })).toEqual({
      fileType: 'risum',
      isCharx: false,
      isRisum: true,
      isRisup: false,
    });
    expect(getDocumentTypeFlags({ _fileType: 'risup' })).toEqual({
      fileType: 'risup',
      isCharx: false,
      isRisum: false,
      isRisup: true,
    });
  });
});

describe('getFieldAccessRules', () => {
  it('includes only charx-specific fields for charx documents', () => {
    const rules = getFieldAccessRules({ name: 'Card' });
    expect(rules.allowedFields).toContain('personality');
    expect(rules.allowedFields).toContain('systemPrompt');
    expect(rules.allowedFields).toContain('additionalText');
    expect(rules.allowedFields).not.toContain('groupOnlyGreetings');
    expect(rules.allowedFields).not.toContain('moduleNamespace');
    expect(rules.allowedFields).not.toContain('mainPrompt');
    expect(rules.readOnlyFields).toEqual([
      ...CHARX_READ_ONLY_FIELD_NAMES,
      ...CHARX_DEPRECATED_FIELD_NAMES.filter((field) => field !== 'groupOnlyGreetings'),
    ]);
    expect(rules.deprecatedFields).toEqual(CHARX_DEPRECATED_FIELD_NAMES);
    expect(rules.hiddenFields).toEqual(CHARX_DEPRECATED_FIELD_NAMES);
    for (const field of rules.readOnlyFields) {
      expect(rules.allowedFields).toContain(field);
    }
  });

  it('includes only risum-specific fields for risum documents', () => {
    const rules = getFieldAccessRules({ _fileType: 'risum' });
    expect(rules.allowedFields).toContain('moduleNamespace');
    expect(rules.allowedFields).not.toContain('personality');
    expect(rules.allowedFields).not.toContain('mainPrompt');
    expect(rules.readOnlyFields).toEqual([...RISUM_READ_ONLY_FIELD_NAMES, ...RISUM_RESERVED_FIELD_NAMES]);
    expect(rules.deprecatedFields).toEqual([]);
    expect(rules.hiddenFields).toEqual(RISUM_RESERVED_FIELD_NAMES);
    for (const field of rules.readOnlyFields) {
      expect(rules.allowedFields).toContain(field);
    }
  });

  it('includes only risup-specific fields for risup documents', () => {
    const rules = getFieldAccessRules({ _fileType: 'risup' });
    expect(rules.allowedFields).toContain('mainPrompt');
    expect(rules.allowedFields).not.toContain('moduleNamespace');
    expect(rules.allowedFields).not.toContain('personality');
    expect(rules.readOnlyFields).toEqual(RISUP_LEGACY_FIELD_NAMES);
    expect(rules.deprecatedFields).toEqual([]);
    expect(rules.hiddenFields).toEqual(RISUP_LEGACY_FIELD_NAMES);
    for (const field of rules.readOnlyFields) {
      expect(rules.allowedFields).toContain(field);
    }
  });
});

describe('hidden deprecated field policy', () => {
  it('classifies document-specific hidden fields without hiding lowLevelAccess', () => {
    expect(getHiddenFieldInfo({ name: 'Card' }, 'personality')).toMatchObject({ category: 'deprecated' });
    expect(getHiddenFieldInfo({ _fileType: 'risum' }, 'cjs')).toMatchObject({ category: 'reserved' });
    expect(getHiddenFieldInfo({ _fileType: 'risup' }, 'mainPrompt')).toMatchObject({ category: 'legacy' });
    expect(isHiddenField({ _fileType: 'risum' }, 'lowLevelAccess')).toBe(false);
  });

  it('summarizes non-empty hidden values without returning content', () => {
    const warnings = collectHiddenFieldWarnings({
      name: 'Card',
      personality: 'hidden text',
      groupOnlyGreetings: ['secret greeting'],
      tags: [],
    });
    expect(warnings).toEqual([
      expect.objectContaining({ field: 'personality', category: 'deprecated', size: 11 }),
      expect.objectContaining({ field: 'groupOnlyGreetings', category: 'deprecated', count: 1 }),
    ]);
    expect(JSON.stringify(warnings)).not.toContain('secret greeting');
    expect(redactHiddenFields({ name: 'Card', personality: 'hidden text', groupOnlyGreetings: ['hidden'] })).toEqual({
      name: 'Card',
    });
  });
});

describe('getUnknownFieldHint', () => {
  it('returns a document-type specific hint', () => {
    expect(getUnknownFieldHint({ isRisum: true, isRisup: false })).toContain('risum');
    expect(getUnknownFieldHint({ isRisum: false, isRisup: true })).toContain('risup');
    expect(getUnknownFieldHint({ isRisum: false, isRisup: false })).toContain('charx');
  });
});

describe('string mutation field support', () => {
  it('exposes the shared string mutation allowlist and read-only fields', () => {
    expect(STRING_MUTATION_FIELD_NAMES).toEqual([
      'name',
      'description',
      'firstMessage',
      'globalNote',
      'css',
      'defaultVariables',
      'lua',
      'creatorcomment',
      'exampleMessage',
      'creator',
      'characterVersion',
      'backgroundEmbedding',
      'moduleNamespace',
      'customModuleToggle',
      'moduleName',
      'moduleDescription',
      'aiModel',
      'subModel',
      'apiType',
      'templateDefaultVariables',
      'moduleIntergration',
      'jsonSchema',
      'extractJson',
      'groupTemplate',
      'groupOtherBotRole',
      'autoSuggestPrompt',
      'autoSuggestPrefix',
      'systemContentReplacement',
      'systemRoleReplacement',
      'customPromptTemplateToggle',
      'promptSettings',
      'customAPIFormat',
      'openrouterProvider',
      'seperateParameters',
      'fallbackModels',
      'seperateModels',
      'modelTools',
      'customFlags',
      'dynamicOutput',
      'reverseProxyOobaArgs',
      'proxyRequestModel',
      'openrouterRequestModel',
      'customProxyRequestModel',
      'koboldURL',
      'forceReplaceUrl',
      'textgenWebUIStreamURL',
      'textgenWebUIBlockingURL',
      'deepseekThinkingType',
      'deepseekReasoningEffort',
    ]);
    expect(STRING_MUTATION_READ_ONLY_FIELD_NAMES).toEqual([
      ...CHARX_READ_ONLY_FIELD_NAMES,
      ...RISUM_READ_ONLY_FIELD_NAMES,
      ...RISUM_RESERVED_FIELD_NAMES,
    ]);
  });

  it('classifies string mutation fields as supported, read-only, or unsupported', () => {
    expect(getStringMutationFieldStatus('description')).toBe('ok');
    expect(getStringMutationFieldStatus('systemPrompt', { _fileType: 'charx' })).toBe('read-only');
    expect(getStringMutationFieldStatus('additionalText', { _fileType: 'charx' })).toBe('read-only');
    expect(getStringMutationFieldStatus('personality', { _fileType: 'charx' })).toBe('read-only');
    expect(getStringMutationFieldStatus('groupOnlyGreetings', { _fileType: 'charx' })).toBe('read-only');
    expect(getStringMutationFieldStatus('creationDate')).toBe('read-only');
    expect(getStringMutationFieldStatus('moduleId')).toBe('read-only');
    expect(getStringMutationFieldStatus('cjs')).toBe('read-only');
    expect(getStringMutationFieldStatus('mcpUrl')).toBe('read-only');
    expect(getStringMutationFieldStatus('alternateGreetings')).toBe('unsupported');
    expect(getStringMutationFieldStatus('lowLevelAccess')).toBe('unsupported');
    expect(getStringMutationFieldStatus('promptTemplate')).toBe('unsupported');
    expect(getStringMutationFieldStatus('globalNote', { _fileType: 'risup' })).toBe('read-only');
    expect(getStringMutationFieldStatus('globalNote', { _fileType: 'charx' })).toBe('ok');
  });
});

describe('buildFieldReadResponsePayload', () => {
  it('serializes triggerScripts through the provided dependency', () => {
    const stringifyTriggerScripts = vi.fn(() => '[{"type":"trigger"}]');
    expect(
      buildFieldReadResponsePayload({ triggerScripts: [{ type: 'trigger' }] }, 'triggerScripts', {
        stringifyTriggerScripts,
      }),
    ).toEqual({
      field: 'triggerScripts',
      content: '[{"type":"trigger"}]',
    });
    expect(stringifyTriggerScripts).toHaveBeenCalledTimes(1);
  });

  it('annotates array, boolean, and number fields with their types', () => {
    expect(
      buildFieldReadResponsePayload({ alternateGreetings: ['hi'] }, 'alternateGreetings', {
        stringifyTriggerScripts: JSON.stringify,
      }),
    ).toEqual({
      field: 'alternateGreetings',
      content: ['hi'],
      type: 'array',
    });
    expect(
      buildFieldReadResponsePayload({ lowLevelAccess: 1 }, 'lowLevelAccess', {
        stringifyTriggerScripts: JSON.stringify,
      }),
    ).toEqual({
      field: 'lowLevelAccess',
      content: true,
      type: 'boolean',
    });
    expect(
      buildFieldReadResponsePayload({ temperature: 0.8 }, 'temperature', { stringifyTriggerScripts: JSON.stringify }),
    ).toEqual({
      field: 'temperature',
      content: 0.8,
      type: 'number',
    });
  });

  it('returns string fields without a type annotation', () => {
    expect(
      buildFieldReadResponsePayload({ description: 'Hello' }, 'description', {
        stringifyTriggerScripts: JSON.stringify,
      }),
    ).toEqual({
      field: 'description',
      content: 'Hello',
    });
  });
});

describe('buildFieldBatchReadResults', () => {
  it('returns per-field payloads for known fields and errors for unknown ones', () => {
    expect(
      buildFieldBatchReadResults(
        {
          name: 'Card',
          description: 'Desc',
          alternateGreetings: ['Hi'],
          groupOnlyGreetings: ['Group hi'],
          personality: 'old',
        },
        ['name', 'alternateGreetings', 'groupOnlyGreetings', 'personality', 'moduleNamespace'],
        { stringifyTriggerScripts: JSON.stringify },
      ),
    ).toEqual([
      { field: 'name', content: 'Card' },
      { field: 'alternateGreetings', content: ['Hi'], type: 'array' },
      expect.objectContaining({ field: 'groupOnlyGreetings', hidden: true, category: 'deprecated' }),
      expect.objectContaining({ field: 'personality', hidden: true, category: 'deprecated' }),
      { field: 'moduleNamespace', error: 'Unknown field: moduleNamespace' },
    ]);
  });

  it('respects document-type specific field rules in batch reads', () => {
    expect(
      buildFieldBatchReadResults(
        { _fileType: 'risum', moduleNamespace: 'mod.space', name: 'Module' },
        ['name', 'moduleNamespace', 'personality'],
        { stringifyTriggerScripts: JSON.stringify },
      ),
    ).toEqual([
      { field: 'name', content: 'Module' },
      { field: 'moduleNamespace', content: 'mod.space' },
      { field: 'personality', error: 'Unknown field: personality' },
    ]);
  });
});
