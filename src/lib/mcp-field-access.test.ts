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
  RISUP_FIELD_NAMES,
  STRING_MUTATION_FIELD_NAMES,
  STRING_MUTATION_READ_ONLY_FIELD_NAMES,
  SUPPORTED_EXTERNAL_FILE_TYPES,
  buildFieldBatchReadResults,
  buildFieldReadResponsePayload,
  getDocumentTypeFlags,
  getFieldAccessRules,
  getStringMutationFieldStatus,
  getUnknownFieldHint,
} from './mcp-field-access';

describe('field access constants', () => {
  it('keeps core and document-specific field lists non-empty', () => {
    expect(CORE_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(CHARX_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(CHARX_READ_ONLY_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(CHARX_DEPRECATED_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(RISUM_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(RISUM_READ_ONLY_FIELD_NAMES.length).toBeGreaterThan(0);
    expect(RISUP_FIELD_NAMES.length).toBeGreaterThan(0);
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
    expect(rules.allowedFields).not.toContain('moduleNamespace');
    expect(rules.allowedFields).not.toContain('mainPrompt');
    expect(rules.readOnlyFields).toEqual([
      ...CHARX_READ_ONLY_FIELD_NAMES,
      ...CHARX_DEPRECATED_FIELD_NAMES.filter((field) => field !== 'groupOnlyGreetings'),
    ]);
    expect(rules.deprecatedFields).toEqual(CHARX_DEPRECATED_FIELD_NAMES);
    expect(rules.readOnlyFields).not.toContain('groupOnlyGreetings');
    expect(rules.allowedFields).not.toContain('groupOnlyGreetings');
    for (const field of rules.readOnlyFields) {
      expect(rules.allowedFields).toContain(field);
    }
  });

  it('includes only risum-specific fields for risum documents', () => {
    const rules = getFieldAccessRules({ _fileType: 'risum' });
    expect(rules.allowedFields).toContain('moduleNamespace');
    expect(rules.allowedFields).not.toContain('personality');
    expect(rules.allowedFields).not.toContain('mainPrompt');
    expect(rules.readOnlyFields).toEqual(RISUM_READ_ONLY_FIELD_NAMES);
    expect(rules.deprecatedFields).toEqual([]);
    for (const field of rules.readOnlyFields) {
      expect(rules.allowedFields).toContain(field);
    }
  });

  it('includes only risup-specific fields for risup documents', () => {
    const rules = getFieldAccessRules({ _fileType: 'risup' });
    expect(rules.allowedFields).toContain('mainPrompt');
    expect(rules.allowedFields).not.toContain('moduleNamespace');
    expect(rules.allowedFields).not.toContain('personality');
    expect(rules.readOnlyFields).toEqual([]);
    expect(rules.deprecatedFields).toEqual([]);
    for (const field of rules.readOnlyFields) {
      expect(rules.allowedFields).toContain(field);
    }
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
      'systemPrompt',
      'creator',
      'characterVersion',
      'cjs',
      'backgroundEmbedding',
      'moduleNamespace',
      'customModuleToggle',
      'mcpUrl',
      'moduleName',
      'moduleDescription',
      'mainPrompt',
      'jailbreak',
      'aiModel',
      'subModel',
      'apiType',
      'instructChatTemplate',
      'JinjaTemplate',
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
    ]);
    expect(STRING_MUTATION_READ_ONLY_FIELD_NAMES).toEqual([
      ...CHARX_READ_ONLY_FIELD_NAMES,
      ...RISUM_READ_ONLY_FIELD_NAMES,
    ]);
  });

  it('classifies string mutation fields as supported, read-only, or unsupported', () => {
    expect(getStringMutationFieldStatus('description')).toBe('ok');
    expect(getStringMutationFieldStatus('creationDate')).toBe('read-only');
    expect(getStringMutationFieldStatus('moduleId')).toBe('read-only');
    expect(getStringMutationFieldStatus('alternateGreetings')).toBe('unsupported');
    expect(getStringMutationFieldStatus('lowLevelAccess')).toBe('unsupported');
    expect(getStringMutationFieldStatus('promptTemplate')).toBe('unsupported');
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
        { name: 'Card', description: 'Desc', alternateGreetings: ['Hi'] },
        ['name', 'alternateGreetings', 'moduleNamespace'],
        { stringifyTriggerScripts: JSON.stringify },
      ),
    ).toEqual([
      { field: 'name', content: 'Card' },
      { field: 'alternateGreetings', content: ['Hi'], type: 'array' },
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
